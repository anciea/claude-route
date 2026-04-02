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

module.exports = {
  convertClaudeToVertex,
  convertVertexResponse,
  handleVertexStream
}