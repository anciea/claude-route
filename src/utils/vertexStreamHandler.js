const logger = require('./logger')

// Global usage accumulator for streaming responses
let usageAccumulator = {
  input_tokens: 0,
  output_tokens: 0
}

/**
 * Convert Vertex AI streaming chunk to Claude SSE format
 * @param {Object} vertexChunk - Vertex AI streaming response chunk
 * @param {boolean} isFirstChunk - Whether this is the first chunk in the stream
 * @returns {string} Claude API SSE format string
 */
function convertVertexStreamToClaudeFormat(vertexChunk, isFirstChunk = false) {
  let sseOutput = ''

  try {
    // Reset usage accumulator for first chunk
    if (isFirstChunk) {
      usageAccumulator = {
        input_tokens: 0,
        output_tokens: 0
      }
    }

    // Handle first chunk - send message_start and content_block_start
    if (isFirstChunk) {
      const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

      // Send message_start event
      sseOutput += `event: message_start\ndata: ${JSON.stringify({
        type: 'message_start',
        message: {
          id: messageId,
          type: 'message',
          role: 'assistant',
          content: [],
          model: 'vertex-ai',
          stop_reason: null,
          usage: { input_tokens: 0, output_tokens: 0 }
        }
      })}\n\n`

      // Send content_block_start event
      sseOutput += `event: content_block_start\ndata: ${JSON.stringify({
        type: 'content_block_start',
        index: 0,
        content_block: {
          type: 'text',
          text: ''
        }
      })}\n\n`
    }

    // Extract usage metadata if present
    if (vertexChunk.usageMetadata || vertexChunk.usage_metadata) {
      const usage = vertexChunk.usageMetadata || vertexChunk.usage_metadata
      if (usage.promptTokenCount || usage.prompt_token_count) {
        usageAccumulator.input_tokens = usage.promptTokenCount || usage.prompt_token_count
      }
      if (usage.candidatesTokenCount || usage.candidates_token_count) {
        usageAccumulator.output_tokens = usage.candidatesTokenCount || usage.candidates_token_count
      }
    }

    // Process candidates array
    if (vertexChunk.candidates && vertexChunk.candidates.length > 0) {
      const candidate = vertexChunk.candidates[0]

      // Extract text content if available
      if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
        const textPart = candidate.content.parts.find((part) => part.text !== undefined)
        if (textPart && textPart.text) {
          // Send content_block_delta event
          sseOutput += `event: content_block_delta\ndata: ${JSON.stringify({
            type: 'content_block_delta',
            index: 0,
            delta: {
              type: 'text_delta',
              text: textPart.text
            }
          })}\n\n`
        }
      }

      // Check for finish_reason or finishReason (completion)
      const finishReason = candidate.finish_reason || candidate.finishReason
      if (finishReason) {
        // Send content_block_stop event
        sseOutput += `event: content_block_stop\ndata: ${JSON.stringify({
          type: 'content_block_stop',
          index: 0
        })}\n\n`

        // Send message_delta with usage if available
        if (usageAccumulator.input_tokens > 0 || usageAccumulator.output_tokens > 0) {
          sseOutput += `event: message_delta\ndata: ${JSON.stringify({
            type: 'message_delta',
            delta: {
              stop_reason: mapVertexStopReason(finishReason),
              usage: {
                output_tokens: usageAccumulator.output_tokens
              }
            }
          })}\n\n`
        }

        // Send message_stop event
        sseOutput += `event: message_stop\ndata: ${JSON.stringify({
          type: 'message_stop'
        })}\n\n`
      }
    }

    return sseOutput
  } catch (error) {
    logger.error('Error converting Vertex AI chunk to Claude format:', error)

    // Return error event
    return `event: error\ndata: ${JSON.stringify({
      type: 'error',
      error: {
        type: 'conversion_error',
        message: error.message
      }
    })}\n\n`
  }
}

/**
 * Map Vertex AI stop reason to Claude API stop reason
 * @param {string} vertexStopReason - Vertex AI stop reason
 * @returns {string} Claude API stop reason
 */
function mapVertexStopReason(vertexStopReason) {
  const reasonMap = {
    STOP: 'end_turn',
    MAX_TOKENS: 'max_tokens',
    SAFETY: 'stop_sequence',
    RECITATION: 'stop_sequence'
  }

  return reasonMap[vertexStopReason] || 'end_turn'
}

/**
 * Get current usage accumulator values
 * @returns {Object} Current usage statistics
 */
function getCurrentUsage() {
  return { ...usageAccumulator }
}

/**
 * Reset usage accumulator
 */
function resetUsage() {
  usageAccumulator = {
    input_tokens: 0,
    output_tokens: 0
  }
}

module.exports = {
  convertVertexStreamToClaudeFormat,
  getCurrentUsage,
  resetUsage,
  mapVertexStopReason
}
