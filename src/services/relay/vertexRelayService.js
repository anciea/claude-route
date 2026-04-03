const axios = require('axios')
const ProxyHelper = require('../../utils/proxyHelper')
const logger = require('../../utils/logger')
const config = require('../../../config/config')
const apiKeyService = require('../apiKeyService')
const vertexAiAccountService = require('../account/vertexAiAccountService')
const pricingService = require('../pricingService')
const { getCurrentUsage } = require('../../utils/vertexStreamHandler')

// Vertex AI Partner Model API base URL
const VERTEX_AI_BASE_URL = 'https://aiplatform.googleapis.com/v1'

// Model name mappings - use direct model names as they work in Vertex AI
const MODEL_MAPPING = {
  'claude-opus-4-6': 'claude-opus-4-6',
  'claude-sonnet-4-6': 'claude-sonnet-4-6',
  'claude-haiku-4-5': 'claude-haiku-4-5'
}

/**
 * Convert Claude API message format to Vertex AI Partner Model format
 * @param {Array} messages - Claude API messages
 * @param {Object} options - Request options (model, temperature, max_tokens)
 * @returns {Object} Vertex AI format request body
 */
function convertClaudeToVertex(messages, options = {}) {
  const { model: _model = 'claude-opus-4-6', temperature = 0.7, max_tokens = 4096 } = options

  const vertexRequest = {
    anthropic_version: 'vertex-2023-10-16',
    max_tokens,
    temperature
  }

  // Note: model is specified in URL path, not in request body

  // Separate system messages from conversation messages
  let systemContent = ''
  const conversationMessages = []

  for (const message of messages) {
    if (message.role === 'system') {
      systemContent += (systemContent ? '\n\n' : '') + message.content
    } else {
      conversationMessages.push({
        role: message.role,
        content: message.content
      })
    }
  }

  // Add system content if present
  if (systemContent) {
    vertexRequest.system = systemContent
  }

  vertexRequest.messages = conversationMessages

  return vertexRequest
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
  // Accumulate SSE event lines (event: + data: pairs) to yield as complete events
  let pendingLines = []
  let inputTokens = 0
  let outputTokens = 0

  try {
    for await (const chunk of response.data) {
      buffer += chunk.toString()

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

    // Map Claude model name to Vertex AI Partner Model name
    const vertexModel = MODEL_MAPPING[model] || MODEL_MAPPING['claude-opus-4-6']

    // Convert Claude API request to Vertex AI format
    const vertexRequest = convertClaudeToVertex(messages, {
      model,
      temperature,
      max_tokens: maxTokens
    })

    // Build API endpoint URL
    const endpoint = stream ? 'streamRawPredict' : 'rawPredict'
    const apiUrl = `${VERTEX_AI_BASE_URL}/projects/${account.projectId}/locations/${account.location}/publishers/anthropic/models/${vertexModel}:${endpoint}`

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
      return handleVertexStream(response, model, apiKeyId, accountId)
    } else {
      // Non-streaming response
      const claudeResponse = convertVertexResponse(response.data, model, false)

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
  convertClaudeToVertex,
  convertVertexResponse,
  handleVertexStream,
  stream: streamResponse
}
