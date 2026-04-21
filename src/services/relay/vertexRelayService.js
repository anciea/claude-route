const axios = require('axios')
const { StringDecoder } = require('string_decoder')
const ProxyHelper = require('../../utils/proxyHelper')
const logger = require('../../utils/logger')
const config = require('../../../config/config')
const apiKeyService = require('../apiKeyService')
const vertexAiAccountService = require('../account/vertexAiAccountService')
const pricingService = require('../pricingService')
const { getCurrentUsage } = require('../../utils/vertexStreamHandler')

// Vertex AI Partner Model API base URL
const VERTEX_AI_BASE_URL = 'https://aiplatform.googleapis.com/v1'

// Claude model name mappings - use direct model names as they work in Vertex AI
const MODEL_MAPPING = {
  'claude-opus-4-6': 'claude-opus-4-6',
  'claude-sonnet-4-6': 'claude-sonnet-4-6',
  'claude-haiku-4-5': 'claude-haiku-4-5'
}

// Gemini model name mappings for Vertex AI (publisher: google)
const GEMINI_MODEL_MAPPING = {
  'gemini-2.5-pro': 'gemini-2.5-pro',
  'gemini-2.5-flash': 'gemini-2.5-flash',
  'gemini-2.5-flash-lite': 'gemini-2.5-flash-lite',
  'gemini-2.0-flash': 'gemini-2.0-flash-001',
  'gemini-2.0-flash-001': 'gemini-2.0-flash-001',
  'gemini-2.0-flash-exp': 'gemini-2.0-flash-exp',
  'gemini-2.0-flash-lite': 'gemini-2.0-flash-lite-001',
  'gemini-1.5-pro': 'gemini-1.5-pro-002',
  'gemini-1.5-flash': 'gemini-1.5-flash-002'
}

/**
 * Check if a model is a Gemini model (routed to publisher=google on Vertex AI)
 * @param {string} model - Model name
 * @returns {boolean}
 */
function isGeminiModel(model) {
  if (!model || typeof model !== 'string') {
    return false
  }
  return model.toLowerCase().startsWith('gemini-')
}

/**
 * Build Vertex AI Partner Model request body from a Claude API request.
 *
 * Strategy: pass through the original request body as-is (since Vertex AI
 * Claude Partner Models accept the same format as the standard Claude API),
 * only adding `anthropic_version` and removing `model` (specified in URL).
 *
 * This ensures all Claude API features (tools, tool_choice, system, metadata,
 * top_p, top_k, stop_sequences, etc.) are forwarded to the upstream.
 *
 * @param {Object} requestBody - Original Claude API request body
 * @returns {Object} Vertex AI format request body
 */
function buildVertexRequestBody(requestBody) {
  // Spread original body, remove model (it goes in URL path), ensure anthropic_version
  const { model: _model, ...vertexRequest } = requestBody
  vertexRequest.anthropic_version = vertexRequest.anthropic_version || 'vertex-2023-10-16'

  return vertexRequest
}

/**
 * Convert Claude/OpenAI message content to Gemini parts format.
 * Supports both plain strings and Claude-style content block arrays.
 * @param {string|Array} content - Message content
 * @returns {Array} Gemini parts array
 */
function convertContentToGeminiParts(content) {
  if (typeof content === 'string') {
    return [{ text: content }]
  }
  if (!Array.isArray(content)) {
    return [{ text: String(content ?? '') }]
  }

  const parts = []
  for (const block of content) {
    if (!block || typeof block !== 'object') {
      continue
    }
    if (block.type === 'text' && typeof block.text === 'string') {
      parts.push({ text: block.text })
    } else if (block.type === 'image' && block.source) {
      // Claude image block -> Gemini inlineData
      const src = block.source
      if (src.type === 'base64' && src.data && src.media_type) {
        parts.push({
          inlineData: {
            mimeType: src.media_type,
            data: src.data
          }
        })
      }
    }
  }
  return parts.length > 0 ? parts : [{ text: '' }]
}

/**
 * Convert Claude API request body to Gemini Vertex AI format.
 *
 * Gemini format:
 *   {
 *     contents: [{role: "user"|"model", parts: [...]}, ...],
 *     systemInstruction: {parts: [{text: "..."}]},
 *     generationConfig: {temperature, maxOutputTokens, topP, topK, stopSequences},
 *     safetySettings: [...],
 *     tools: [...]
 *   }
 *
 * @param {Object} requestBody - Claude API format request body
 * @returns {Object} Gemini format request body
 */
function buildGeminiRequestBody(requestBody) {
  const {
    messages = [],
    system,
    temperature,
    max_tokens: maxTokens,
    top_p: topP,
    top_k: topK,
    stop_sequences: stopSequences,
    tools,
    tool_choice: toolChoice,
    // Pass through fields that may already be in Gemini format
    contents: existingContents,
    generationConfig: existingGenerationConfig,
    systemInstruction: existingSystemInstruction,
    safetySettings
  } = requestBody

  // If caller already provided Gemini-native fields, pass them through
  if (existingContents) {
    const out = {
      contents: existingContents
    }
    if (existingSystemInstruction) {
      out.systemInstruction = existingSystemInstruction
    }
    if (existingGenerationConfig) {
      out.generationConfig = existingGenerationConfig
    }
    if (safetySettings) {
      out.safetySettings = safetySettings
    }
    if (tools) {
      out.tools = tools
    }
    return out
  }

  // Convert Claude messages to Gemini contents
  const contents = []
  for (const message of messages) {
    if (!message || typeof message !== 'object') {
      continue
    }
    const role = message.role === 'assistant' ? 'model' : 'user'
    const parts = convertContentToGeminiParts(message.content)
    contents.push({ role, parts })
  }

  const geminiRequest = { contents }

  // System prompt -> systemInstruction
  if (system) {
    let systemText = ''
    if (typeof system === 'string') {
      systemText = system
    } else if (Array.isArray(system)) {
      systemText = system
        .map((block) => (block && block.text ? block.text : ''))
        .filter(Boolean)
        .join('\n\n')
    }
    if (systemText) {
      geminiRequest.systemInstruction = {
        parts: [{ text: systemText }]
      }
    }
  }

  // Build generationConfig from Claude-style params
  const generationConfig = {}
  if (typeof temperature === 'number') {
    generationConfig.temperature = temperature
  }
  if (typeof maxTokens === 'number') {
    generationConfig.maxOutputTokens = maxTokens
  }
  if (typeof topP === 'number') {
    generationConfig.topP = topP
  }
  if (typeof topK === 'number') {
    generationConfig.topK = topK
  }
  if (Array.isArray(stopSequences) && stopSequences.length > 0) {
    generationConfig.stopSequences = stopSequences
  }
  if (Object.keys(generationConfig).length > 0) {
    geminiRequest.generationConfig = generationConfig
  }

  // Tools — if provided in Claude/OpenAI format, pass through as-is
  // (Vertex AI Gemini accepts functionDeclarations)
  if (tools && Array.isArray(tools) && tools.length > 0) {
    geminiRequest.tools = tools
  }
  if (toolChoice) {
    geminiRequest.toolConfig = toolChoice
  }

  if (safetySettings) {
    geminiRequest.safetySettings = safetySettings
  }

  return geminiRequest
}

/**
 * Convert Gemini Vertex AI response to Claude API format.
 *
 * Gemini response:
 *   {
 *     candidates: [{content: {parts: [{text}], role}, finishReason}],
 *     usageMetadata: {promptTokenCount, candidatesTokenCount}
 *   }
 *
 * @param {Object} geminiResponse - Gemini response
 * @param {string} model - Original model name
 * @returns {Object} Claude API format response
 */
function convertGeminiToClaudeResponse(geminiResponse, model) {
  const responseId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
  const candidate = geminiResponse.candidates?.[0]

  const content = []
  if (candidate?.content?.parts) {
    for (const part of candidate.content.parts) {
      if (typeof part.text === 'string' && part.text.length > 0) {
        content.push({ type: 'text', text: part.text })
      }
    }
  }

  // Map Gemini finishReason to Claude stop_reason
  const finishReasonMap = {
    STOP: 'end_turn',
    MAX_TOKENS: 'max_tokens',
    SAFETY: 'stop_sequence',
    RECITATION: 'stop_sequence',
    OTHER: 'end_turn'
  }
  const stopReason = finishReasonMap[candidate?.finishReason] || 'end_turn'

  const usageMeta = geminiResponse.usageMetadata || {}

  return {
    id: responseId,
    type: 'message',
    role: 'assistant',
    content: content.length > 0 ? content : [{ type: 'text', text: '' }],
    model,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: {
      input_tokens: usageMeta.promptTokenCount || 0,
      output_tokens: usageMeta.candidatesTokenCount || 0
    }
  }
}

/**
 * Convert Vertex AI response back to Claude API format
 * @param {Object} vertexResponse - Vertex AI response
 * @param {string} model - Original model name
 * @param {boolean} stream - Whether this is a streaming response
 * @returns {Object} Claude API format response
 */
function convertVertexResponse(vertexResponse, model, isStream = false) {
  if (isStream) {
    // Handle streaming response format
    const content = vertexResponse.content?.[0]
    if (!content?.text) {
      return null
    }

    return {
      type: 'content_block_delta',
      index: 0,
      delta: {
        type: 'text_delta',
        text: content.text
      }
    }
  } else {
    // Handle non-streaming response format
    const responseId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`

    const content = vertexResponse.content || []
    const claudeContent = content.map((item) => ({
      type: 'text',
      text: item.text || ''
    }))

    return {
      id: responseId,
      type: 'message',
      role: 'assistant',
      content: claudeContent,
      model,
      stop_reason: vertexResponse.stop_reason || 'end_turn',
      usage: {
        input_tokens: vertexResponse.usage?.input_tokens || 0,
        output_tokens: vertexResponse.usage?.output_tokens || 0
      }
    }
  }
}

/**
 * Handle Vertex AI streaming response for Claude Partner Models.
 *
 * The streamRawPredict endpoint for Anthropic/Claude partner models returns
 * Claude-native SSE format (identical to the official Anthropic API):
 *   event: message_start
 *   data: {"type":"message_start","message":{...}}
 *
 *   event: content_block_delta
 *   data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"..."}}
 *
 * This function passes the raw SSE events through unchanged, and extracts
 * usage data from message_delta events for cost tracking.
 *
 * @param {Object} response - Axios response with stream
 * @param {string} model - Model name
 * @param {string} apiKeyId - API Key ID for usage tracking
 * @param {string} accountId - Account ID
 * @returns {AsyncGenerator} Streaming response generator
 */
async function* handleVertexStream(response, model, apiKeyId, accountId = null) {
  let buffer = ''
  // Use StringDecoder to handle multi-byte UTF-8 characters split across chunks
  const decoder = new StringDecoder('utf8')
  // Accumulate SSE event lines (event: + data: pairs) to yield as complete events
  let pendingLines = []
  let inputTokens = 0
  let outputTokens = 0

  let chunkCount = 0

  try {
    for await (const chunk of response.data) {
      const chunkStr = decoder.write(chunk)
      chunkCount++
      if (chunkCount <= 3) {
        logger.debug(
          `🔍 Vertex AI stream chunk #${chunkCount} (${chunkStr.length} chars): ${chunkStr.substring(0, 200)}`
        )
      }
      buffer += chunkStr

      // Process complete lines from buffer
      const lines = buffer.split('\n')
      buffer = lines.pop() || '' // Keep incomplete (no trailing newline) line

      for (const line of lines) {
        const trimmed = line.trimEnd()

        if (trimmed === '') {
          // Empty line = SSE event boundary: flush pending lines as one event
          if (pendingLines.length > 0) {
            const eventText = `${pendingLines.join('\n')}\n\n`
            pendingLines = []

            // Extract usage from message_delta events for cost tracking
            for (const l of eventText.split('\n')) {
              if (l.startsWith('data: ')) {
                const jsonStr = l.substring(6).trim()
                if (jsonStr && jsonStr !== '[DONE]') {
                  try {
                    const parsed = JSON.parse(jsonStr)
                    if (parsed.type === 'message_delta' && parsed.usage) {
                      outputTokens = parsed.usage.output_tokens || outputTokens
                    }
                    if (parsed.type === 'message_start' && parsed.message?.usage) {
                      inputTokens = parsed.message.usage.input_tokens || inputTokens
                    }
                  } catch (_e) {
                    // Not valid JSON — ignore for usage extraction
                  }
                }
              }
            }

            yield eventText
          }
        } else {
          // Accumulate lines that form one SSE event
          pendingLines.push(trimmed)
        }
      }
    }

    // Flush any remaining bytes from StringDecoder (incomplete UTF-8 sequences)
    const remaining = decoder.end()
    if (remaining) {
      buffer += remaining
    }

    // Flush any remaining buffered content
    if (buffer.trim()) {
      pendingLines.push(buffer.trim())
      buffer = ''
    }
    if (pendingLines.length > 0) {
      const eventText = `${pendingLines.join('\n')}\n\n`
      pendingLines = []
      yield eventText
    }

    logger.debug(
      `🔍 Vertex AI stream ended: ${chunkCount} chunks received, pendingLines=${pendingLines.length}, buffer="${buffer.substring(0, 100)}"`
    )

    // Record usage after stream completes
    if (apiKeyId && (inputTokens > 0 || outputTokens > 0)) {
      await apiKeyService
        .recordUsage(apiKeyId, inputTokens, outputTokens, 0, 0, model, accountId, 'vertex-ai')
        .catch((error) => {
          logger.error('❌ Failed to record Vertex AI usage:', error)
        })

      logger.debug(
        `💰 Vertex AI stream completed for ${model}: input=${inputTokens}, output=${outputTokens}`
      )
    }
  } catch (error) {
    // Handle AbortController and client disconnection
    if (error.name === 'CanceledError' || error.code === 'ECONNABORTED') {
      logger.info('Vertex AI stream request was aborted by client')
    } else {
      logger.error('Vertex AI stream processing error:', error)
      yield `event: error\ndata: ${JSON.stringify({
        type: 'error',
        error: {
          type: 'stream_error',
          message: error.message
        }
      })}\n\n`
    }
  }
}

/**
 * Handle Vertex AI Gemini streaming response.
 *
 * Gemini streamGenerateContent with `?alt=sse` returns standard SSE:
 *   data: {"candidates":[{"content":{"parts":[{"text":"..."}],"role":"model"}}]}
 *
 *   data: {"candidates":[{"content":{"parts":[{"text":"..."}]},"finishReason":"STOP"}],"usageMetadata":{...}}
 *
 * Without `?alt=sse`, Gemini returns a JSON array streamed progressively.
 *
 * This generator converts each Gemini chunk to Claude-native SSE events for
 * compatibility with the /v1/messages endpoint.
 *
 * @param {Object} response - Axios response with stream
 * @param {string} model - Model name
 * @param {string} apiKeyId - API Key ID for usage tracking
 * @param {string} accountId - Account ID
 * @returns {AsyncGenerator} Streaming response generator
 */
async function* handleGeminiVertexStream(response, model, apiKeyId, accountId = null) {
  const decoder = new StringDecoder('utf8')
  let buffer = ''
  let inputTokens = 0
  let outputTokens = 0
  let messageStartSent = false
  let contentBlockStartSent = false
  let finalStopReason = 'end_turn'
  const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`

  const finishReasonMap = {
    STOP: 'end_turn',
    MAX_TOKENS: 'max_tokens',
    SAFETY: 'stop_sequence',
    RECITATION: 'stop_sequence',
    OTHER: 'end_turn'
  }

  function processGeminiChunk(parsed) {
    const events = []

    // Emit message_start on first chunk
    if (!messageStartSent) {
      messageStartSent = true
      events.push(
        `event: message_start\ndata: ${JSON.stringify({
          type: 'message_start',
          message: {
            id: messageId,
            type: 'message',
            role: 'assistant',
            content: [],
            model,
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 0, output_tokens: 0 }
          }
        })}\n\n`
      )
    }

    const candidate = parsed.candidates?.[0]
    if (candidate?.content?.parts) {
      for (const part of candidate.content.parts) {
        if (typeof part.text === 'string' && part.text.length > 0) {
          if (!contentBlockStartSent) {
            contentBlockStartSent = true
            events.push(
              `event: content_block_start\ndata: ${JSON.stringify({
                type: 'content_block_start',
                index: 0,
                content_block: { type: 'text', text: '' }
              })}\n\n`
            )
          }
          events.push(
            `event: content_block_delta\ndata: ${JSON.stringify({
              type: 'content_block_delta',
              index: 0,
              delta: { type: 'text_delta', text: part.text }
            })}\n\n`
          )
        }
      }
    }

    if (candidate?.finishReason) {
      finalStopReason = finishReasonMap[candidate.finishReason] || 'end_turn'
    }

    // Track usage metadata from any chunk that carries it
    if (parsed.usageMetadata) {
      if (typeof parsed.usageMetadata.promptTokenCount === 'number') {
        inputTokens = parsed.usageMetadata.promptTokenCount
      }
      if (typeof parsed.usageMetadata.candidatesTokenCount === 'number') {
        outputTokens = parsed.usageMetadata.candidatesTokenCount
      }
    }

    return events
  }

  try {
    for await (const chunk of response.data) {
      buffer += decoder.write(chunk)

      // Process complete SSE events separated by blank lines
      let idx
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const rawEvent = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 2)

        // Each SSE event may contain `data: ...` lines
        for (const line of rawEvent.split('\n')) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) {
            continue
          }
          const jsonStr = trimmed.slice(5).trim()
          if (!jsonStr || jsonStr === '[DONE]') {
            continue
          }
          try {
            const parsed = JSON.parse(jsonStr)
            for (const event of processGeminiChunk(parsed)) {
              yield event
            }
          } catch (e) {
            logger.debug(
              `Gemini stream JSON parse error: ${e.message} (data: ${jsonStr.slice(0, 200)})`
            )
          }
        }
      }
    }

    // Flush remaining buffer
    const tail = decoder.end()
    if (tail) {
      buffer += tail
    }
    if (buffer.trim()) {
      for (const line of buffer.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) {
          continue
        }
        const jsonStr = trimmed.slice(5).trim()
        if (!jsonStr || jsonStr === '[DONE]') {
          continue
        }
        try {
          const parsed = JSON.parse(jsonStr)
          for (const event of processGeminiChunk(parsed)) {
            yield event
          }
        } catch (_e) {
          // ignore trailing garbage
        }
      }
    }

    // Emit closing events in Claude SSE order
    if (contentBlockStartSent) {
      yield `event: content_block_stop\ndata: ${JSON.stringify({
        type: 'content_block_stop',
        index: 0
      })}\n\n`
    }

    if (messageStartSent) {
      yield `event: message_delta\ndata: ${JSON.stringify({
        type: 'message_delta',
        delta: { stop_reason: finalStopReason, stop_sequence: null },
        usage: { output_tokens: outputTokens }
      })}\n\n`

      yield `event: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}\n\n`
    }

    // Record usage
    if (apiKeyId && (inputTokens > 0 || outputTokens > 0)) {
      await apiKeyService
        .recordUsage(apiKeyId, inputTokens, outputTokens, 0, 0, model, accountId, 'vertex-ai')
        .catch((error) => {
          logger.error('❌ Failed to record Vertex AI (Gemini) usage:', error)
        })
      logger.debug(
        `💰 Vertex AI Gemini stream completed for ${model}: input=${inputTokens}, output=${outputTokens}`
      )
    }
  } catch (error) {
    if (error.name === 'CanceledError' || error.code === 'ECONNABORTED') {
      logger.info('Vertex AI Gemini stream request was aborted by client')
    } else {
      logger.error('Vertex AI Gemini stream processing error:', error)
      yield `event: error\ndata: ${JSON.stringify({
        type: 'error',
        error: { type: 'stream_error', message: error.message }
      })}\n\n`
    }
  }
}

/**
 * Create proxy agent for requests
 * @param {Object} proxyConfig - Proxy configuration
 * @returns {Object|null} Proxy agent or null
 */
function createProxyAgent(proxyConfig) {
  return ProxyHelper.createProxyAgent(proxyConfig)
}

/**
 * Send request to Vertex AI Partner Model API
 * @param {Object} options - Request options
 * @returns {Object|AsyncGenerator} Response or streaming generator
 */
async function sendVertexRequest({
  requestBody = null,
  messages,
  model = 'claude-opus-4-6',
  temperature = 0.7,
  maxTokens = 4096,
  stream = false,
  proxy,
  apiKeyId,
  signal,
  accountId = null,
  account = null
}) {
  try {
    // Get account if not provided
    if (!account) {
      account = await vertexAiAccountService.getAccount(accountId, true) // With credentials
      if (!account) {
        throw new Error('Vertex AI account not found')
      }
    }

    // Get access token
    const { accessToken } = await vertexAiAccountService.getAccessToken(account.id)

    // Determine provider: Gemini (publisher=google) vs Claude (publisher=anthropic)
    const useGemini = isGeminiModel(model)

    let vertexModel
    let vertexRequest
    let apiUrl

    if (useGemini) {
      // Gemini model: resolve Vertex model id and build Gemini-format request
      vertexModel = GEMINI_MODEL_MAPPING[model] || model

      const sourceBody = requestBody || {
        messages,
        model,
        temperature,
        max_tokens: maxTokens,
        stream
      }
      vertexRequest = buildGeminiRequestBody(sourceBody)

      // Gemini endpoints use ?alt=sse for SSE streaming
      const endpoint = stream ? 'streamGenerateContent?alt=sse' : 'generateContent'
      apiUrl = `${VERTEX_AI_BASE_URL}/projects/${account.projectId}/locations/${account.location}/publishers/google/models/${vertexModel}:${endpoint}`
    } else {
      // Claude model: map and build Claude Partner Model request (unchanged behavior)
      vertexModel = MODEL_MAPPING[model] || MODEL_MAPPING['claude-opus-4-6']

      if (requestBody) {
        vertexRequest = buildVertexRequestBody(requestBody)
      } else {
        // Fallback: build minimal request from individual parameters
        vertexRequest = buildVertexRequestBody({
          messages,
          model,
          temperature,
          max_tokens: maxTokens,
          stream
        })
      }

      const endpoint = stream ? 'streamRawPredict' : 'rawPredict'
      apiUrl = `${VERTEX_AI_BASE_URL}/projects/${account.projectId}/locations/${account.location}/publishers/anthropic/models/${vertexModel}:${endpoint}`
    }

    // Configure request options
    const axiosConfig = {
      method: 'POST',
      url: apiUrl,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'claude-relay-service/1.0.0'
      },
      data: vertexRequest,
      timeout: config.requestTimeout || 600000
    }

    // Add proxy configuration
    const proxyAgent = createProxyAgent(proxy)
    if (proxyAgent) {
      axiosConfig.httpsAgent = proxyAgent
      axiosConfig.proxy = false
      logger.info(`🌐 Using proxy for Vertex AI request: ${ProxyHelper.getProxyDescription(proxy)}`)
    } else {
      logger.debug('🌐 No proxy configured for Vertex AI request')
    }

    // Add AbortController signal support
    if (signal) {
      axiosConfig.signal = signal
      logger.debug('AbortController signal attached to Vertex AI request')
    }

    if (stream) {
      axiosConfig.responseType = 'stream'
    }

    logger.debug(`Sending request to Vertex AI: ${apiUrl}`)

    // Send request with retry logic for auth errors
    let response
    let retryCount = 0
    const maxRetries = 3

    while (retryCount <= maxRetries) {
      try {
        response = await axios(axiosConfig)
        break
      } catch (error) {
        // Handle authentication errors with exponential backoff
        if (error.response?.status === 401 && retryCount < maxRetries) {
          const backoffDelay = Math.pow(2, retryCount) * 1000 // Exponential backoff
          logger.warn(
            `Vertex AI authentication error, retrying in ${backoffDelay}ms (attempt ${retryCount + 1}/${maxRetries + 1})`
          )

          await new Promise((resolve) => setTimeout(resolve, backoffDelay))

          // Refresh access token
          try {
            const { accessToken: newAccessToken } = await vertexAiAccountService.getAccessToken(
              account.id
            )
            axiosConfig.headers.Authorization = `Bearer ${newAccessToken}`
            retryCount++
            continue
          } catch (refreshError) {
            logger.error('Failed to refresh Vertex AI access token:', refreshError)
            throw refreshError
          }
        }

        throw error
      }
    }

    if (stream) {
      // Branch streaming handler based on provider
      if (useGemini) {
        return handleGeminiVertexStream(response, model, apiKeyId, accountId)
      }
      return handleVertexStream(response, model, apiKeyId, accountId)
    } else {
      // Non-streaming response: branch based on provider
      const claudeResponse = useGemini
        ? convertGeminiToClaudeResponse(response.data, model)
        : convertVertexResponse(response.data, model, false)

      let costData = null
      let duration = 0

      // Calculate cost using pricing service
      if (claudeResponse.usage) {
        const startTime = Date.now()
        const usage = {
          input_tokens: claudeResponse.usage.input_tokens || 0,
          output_tokens: claudeResponse.usage.output_tokens || 0,
          model
        }

        costData = pricingService.calculateCost(usage, model)
        duration = Date.now() - startTime

        logger.debug(
          `💰 Vertex AI cost calculation for ${model}: ${JSON.stringify({
            usage,
            cost: costData.totalCost,
            hasPricing: costData.hasPricing
          })}`
        )
      }

      // Record usage
      if (apiKeyId && claudeResponse.usage) {
        await apiKeyService
          .recordUsage(
            apiKeyId,
            claudeResponse.usage.input_tokens || 0,
            claudeResponse.usage.output_tokens || 0,
            0, // cacheCreateTokens
            0, // cacheReadTokens
            model,
            accountId,
            'vertex-ai'
          )
          .catch((error) => {
            logger.error('❌ Failed to record Vertex AI usage:', error)
          })
      }

      // Return enhanced response with cost data
      return {
        ...claudeResponse,
        success: true,
        usage: claudeResponse.usage,
        cost: costData,
        model,
        duration
      }
    }
  } catch (error) {
    // Check if request was aborted
    if (error.name === 'CanceledError' || error.code === 'ECONNABORTED') {
      logger.info('Vertex AI request was aborted by client')
      const err = new Error('Request canceled by client')
      err.status = 499
      err.error = {
        message: 'Request canceled by client',
        type: 'canceled',
        code: 'request_canceled'
      }
      throw err
    }

    logger.error('Vertex AI API request failed:', error.response?.data || error.message)

    // Convert Vertex AI errors to Claude format
    if (error.response) {
      const { status } = error.response
      const errorData = error.response.data?.error || error.response.data

      let claudeError = {
        message: 'Vertex AI API request failed',
        type: 'api_error'
      }

      // Handle specific error cases
      if (status === 401) {
        claudeError = {
          message: 'Authentication failed with Vertex AI',
          type: 'authentication_error',
          code: 'invalid_api_key'
        }
      } else if (status === 403) {
        claudeError = {
          message: 'Access denied to Vertex AI service',
          type: 'permission_error',
          code: 'forbidden'
        }
      } else if (status === 429) {
        claudeError = {
          message: 'Rate limit exceeded for Vertex AI',
          type: 'rate_limit_error',
          code: 'rate_limit_exceeded'
        }
      } else if (status >= 500) {
        claudeError = {
          message: 'Vertex AI service temporarily unavailable',
          type: 'server_error',
          code: 'service_unavailable'
        }
      } else if (errorData) {
        claudeError = {
          message: errorData.message || claudeError.message,
          type: errorData.code || claudeError.type,
          code: errorData.code
        }
      }

      const err = new Error(claudeError.message)
      err.status = status
      err.error = claudeError
      throw err
    }

    // Network or other errors
    const err = new Error(error.message)
    err.status = 500
    err.error = {
      message: error.message,
      type: 'network_error'
    }
    throw err
  }
}

/**
 * Stream Vertex AI response with proper SSE headers
 * @param {Object} res - HTTP response object
 * @param {Object} options - Streaming options
 * @returns {Promise<Object>} Usage statistics
 */
async function streamResponse({
  res,
  messages,
  model = 'claude-opus-4-6',
  temperature = 0.7,
  maxTokens = 4096,
  proxy,
  apiKeyId,
  signal,
  accountId = null,
  account = null
}) {
  try {
    // Set SSE headers
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')
    }

    // Get streaming response from sendVertexRequest
    const streamGenerator = await sendVertexRequest({
      messages,
      model,
      temperature,
      maxTokens,
      stream: true,
      proxy,
      apiKeyId,
      signal,
      accountId,
      account
    })

    // Process stream and write to response
    for await (const sseEvent of streamGenerator) {
      if (signal && signal.aborted) {
        logger.info('Vertex AI stream request aborted by client')
        break
      }

      res.write(sseEvent)
    }

    // Send completion event
    res.write('event: done\ndata: [DONE]\n\n')
    res.end()

    // Return usage statistics with cost calculation
    const finalUsage = getCurrentUsage()
    const usage = {
      input_tokens: finalUsage.input_tokens,
      output_tokens: finalUsage.output_tokens,
      total_tokens: finalUsage.input_tokens + finalUsage.output_tokens
    }

    // Calculate cost for final streaming usage
    let costData = null
    if (usage.input_tokens > 0 || usage.output_tokens > 0) {
      const usageForCosting = {
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        model
      }
      costData = pricingService.calculateCost(usageForCosting, model)
    }

    return {
      success: true,
      usage,
      cost: costData,
      model,
      duration: 0 // Stream duration calculated elsewhere
    }
  } catch (error) {
    // Handle AbortController cancellation
    if (error.name === 'CanceledError' || error.code === 'ECONNABORTED') {
      logger.info('Vertex AI stream request was canceled by client')
      if (!res.headersSent) {
        res.setHeader('Content-Type', 'text/event-stream')
        res.setHeader('Cache-Control', 'no-cache')
        res.setHeader('Connection', 'keep-alive')
      }
      res.write('event: error\ndata: {"type":"canceled","message":"Request canceled"}\n\n')
      res.write('data: [DONE]\n\n')
      res.end()
      return {
        success: false,
        usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
        cost: null,
        model,
        duration: 0
      }
    }

    // Handle other errors
    logger.error('Vertex AI streaming error:', error)
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')
    }

    res.write(
      `event: error\ndata: ${JSON.stringify({
        type: 'error',
        error: {
          type: error.error?.type || 'stream_error',
          message: error.message
        }
      })}\n\n`
    )
    res.write('data: [DONE]\n\n')
    res.end()

    throw error
  }
}

module.exports = {
  sendVertexRequest,
  buildVertexRequestBody,
  convertVertexResponse,
  handleVertexStream,
  // Gemini-specific helpers (exported for tests)
  isGeminiModel,
  buildGeminiRequestBody,
  convertGeminiToClaudeResponse,
  handleGeminiVertexStream,
  GEMINI_MODEL_MAPPING,
  stream: streamResponse
}
