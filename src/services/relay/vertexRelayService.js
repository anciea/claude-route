const axios = require('axios')
const ProxyHelper = require('../../utils/proxyHelper')
const logger = require('../../utils/logger')
const config = require('../../../config/config')
const apiKeyService = require('../apiKeyService')
const vertexAiAccountService = require('../account/vertexAiAccountService')

// Vertex AI Partner Model API base URL
const VERTEX_AI_BASE_URL = 'https://us-central1-aiplatform.googleapis.com/v1'

// Model name mappings from Claude names to Vertex AI Partner Model names
const MODEL_MAPPING = {
  'claude-opus-4-6': 'claude-3-opus@20240229',
  'claude-sonnet-4-6': 'claude-3-sonnet@20240229',
  'claude-haiku-4-5': 'claude-3-haiku@20240307'
}

/**
 * Convert Claude API message format to Vertex AI Partner Model format
 * @param {Array} messages - Claude API messages
 * @param {Object} options - Request options (model, temperature, max_tokens)
 * @returns {Object} Vertex AI format request body
 */
function convertClaudeToVertex(messages, options = {}) {
  const {
    model = 'claude-opus-4-6',
    temperature = 0.7,
    max_tokens = 4096
  } = options

  const vertexRequest = {
    anthropic_version: 'vertex-2023-10-16',
    max_tokens,
    temperature
  }

  // Add model mapping if provided
  if (model && MODEL_MAPPING[model]) {
    vertexRequest.model = MODEL_MAPPING[model]
  }

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
function convertVertexResponse(vertexResponse, model, stream = false) {
  if (stream) {
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
    const responseId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    const content = vertexResponse.content || []
    const claudeContent = content.map(item => ({
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
 * Handle Vertex AI streaming response
 * @param {Object} response - Axios response with stream
 * @param {string} model - Model name
 * @param {string} apiKeyId - API Key ID for usage tracking
 * @param {string} accountId - Account ID
 * @returns {AsyncGenerator} Streaming response generator
 */
async function* handleVertexStream(response, model, apiKeyId, accountId = null) {
  let buffer = ''
  let totalUsage = {
    input_tokens: 0,
    output_tokens: 0
  }

  try {
    // Send initial message start event
    yield `event: message_start\ndata: ${JSON.stringify({
      type: 'message_start',
      message: {
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'message',
        role: 'assistant',
        content: [],
        model,
        stop_reason: null,
        usage: { input_tokens: 0, output_tokens: 0 }
      }
    })}\n\n`

    // Send content block start event
    yield `event: content_block_start\ndata: ${JSON.stringify({
      type: 'content_block_start',
      index: 0,
      content_block: {
        type: 'text',
        text: ''
      }
    })}\n\n`

    for await (const chunk of response.data) {
      buffer += chunk.toString()

      // Process complete lines from buffer
      const lines = buffer.split('\n')
      buffer = lines.pop() || '' // Keep incomplete line

      for (const line of lines) {
        if (!line.trim()) continue

        // Handle SSE format: "data: {...}"
        let jsonData = line
        if (line.startsWith('data: ')) {
          jsonData = line.substring(6).trim()
        }

        if (!jsonData || jsonData === '[DONE]') continue

        try {
          const data = JSON.parse(jsonData)

          // Update usage statistics
          if (data.usage) {
            totalUsage = data.usage
          }

          // Convert and yield response
          const claudeChunk = convertVertexResponse(data, model, true)
          if (claudeChunk) {
            yield `event: content_block_delta\ndata: ${JSON.stringify(claudeChunk)}\n\n`
          }

          // Check for completion
          if (data.stop_reason) {
            // Send content block stop event
            yield `event: content_block_stop\ndata: ${JSON.stringify({
              type: 'content_block_stop',
              index: 0
            })}\n\n`

            // Send message stop event with usage
            yield `event: message_stop\ndata: ${JSON.stringify({
              type: 'message_stop'
            })}\n\n`

            // Record usage
            if (apiKeyId && totalUsage.input_tokens > 0) {
              await apiKeyService.recordUsage(
                apiKeyId,
                totalUsage.input_tokens,
                totalUsage.output_tokens,
                0, // cacheCreateTokens
                0, // cacheReadTokens
                model,
                accountId,
                'vertex-ai'
              ).catch((error) => {
                logger.error('❌ Failed to record Vertex AI usage:', error)
              })
            }

            return
          }
        } catch (e) {
          logger.debug('Error parsing JSON line:', e.message, 'Line:', jsonData)
        }
      }
    }

    // Process remaining buffer
    if (buffer.trim()) {
      try {
        let jsonData = buffer.trim()
        if (jsonData.startsWith('data: ')) {
          jsonData = jsonData.substring(6).trim()
        }

        if (jsonData && jsonData !== '[DONE]') {
          const data = JSON.parse(jsonData)
          const claudeChunk = convertVertexResponse(data, model, true)
          if (claudeChunk) {
            yield `event: content_block_delta\ndata: ${JSON.stringify(claudeChunk)}\n\n`
          }
        }
      } catch (e) {
        logger.debug('Error parsing final buffer:', e.message)
      }
    }

    // Ensure completion events are sent
    yield `event: content_block_stop\ndata: ${JSON.stringify({
      type: 'content_block_stop',
      index: 0
    })}\n\n`

    yield `event: message_stop\ndata: ${JSON.stringify({
      type: 'message_stop'
    })}\n\n`

  } catch (error) {
    // Check if request was aborted
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
        'Authorization': `Bearer ${accessToken}`,
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
          logger.warn(`Vertex AI authentication error, retrying in ${backoffDelay}ms (attempt ${retryCount + 1}/${maxRetries + 1})`)

          await new Promise(resolve => setTimeout(resolve, backoffDelay))

          // Refresh access token
          try {
            const { accessToken: newAccessToken } = await vertexAiAccountService.getAccessToken(account.id)
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

      // Record usage
      if (apiKeyId && claudeResponse.usage) {
        await apiKeyService.recordUsage(
          apiKeyId,
          claudeResponse.usage.input_tokens || 0,
          claudeResponse.usage.output_tokens || 0,
          0, // cacheCreateTokens
          0, // cacheReadTokens
          model,
          accountId,
          'vertex-ai'
        ).catch((error) => {
          logger.error('❌ Failed to record Vertex AI usage:', error)
        })
      }

      return claudeResponse
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
      const status = error.response.status
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

module.exports = {
  sendVertexRequest,
  convertClaudeToVertex,
  convertVertexResponse,
  handleVertexStream
}