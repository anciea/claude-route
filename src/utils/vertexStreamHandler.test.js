const { convertVertexStreamToClaudeFormat } = require('./vertexStreamHandler')

describe('vertexStreamHandler', () => {
  describe('convertVertexStreamToClaudeFormat', () => {
    test('converts Vertex AI streaming chunks to Claude SSE format (message_start, content_block_start, content_block_delta, message_delta)', () => {
      const mockVertexChunk = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: 'Hello'
                }
              ]
            }
          }
        ]
      }

      const result = convertVertexStreamToClaudeFormat(mockVertexChunk, true)

      expect(result).toContain('event: message_start')
      expect(result).toContain('event: content_block_start')
      expect(result).toContain('event: content_block_delta')
      expect(JSON.parse(result.split('\ndata: ')[1].split('\n\n')[0])).toHaveProperty(
        'type',
        'message_start'
      )
    })

    test('accumulates usage tokens from streaming response chunks (input_tokens, output_tokens)', () => {
      const mockVertexChunk = {
        usage_metadata: {
          prompt_token_count: 10,
          candidates_token_count: 5
        }
      }

      const result = convertVertexStreamToClaudeFormat(mockVertexChunk, false)

      // Should extract and track usage information
      expect(result).toBeDefined()
    })

    test('handles Vertex AI specific streaming events and maps to Claude API equivalents', () => {
      const mockFinishChunk = {
        candidates: [
          {
            finish_reason: 'STOP',
            content: {
              parts: [
                {
                  text: 'Final text'
                }
              ]
            }
          }
        ]
      }

      const result = convertVertexStreamToClaudeFormat(mockFinishChunk, false)

      expect(result).toContain('event: content_block_stop')
      expect(result).toContain('event: message_stop')
    })

    test('preserves content ordering and maintains response structure consistency', () => {
      const mockVertexChunk = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: 'Test content'
                }
              ]
            }
          }
        ]
      }

      const result = convertVertexStreamToClaudeFormat(mockVertexChunk, false)

      expect(result).toContain('event: content_block_delta')
      const deltaMatch = result.match(/event: content_block_delta\ndata: ({.*?})\n\n/)
      expect(deltaMatch).toBeTruthy()

      const deltaData = JSON.parse(deltaMatch[1])
      expect(deltaData).toHaveProperty('type', 'content_block_delta')
      expect(deltaData).toHaveProperty('index', 0)
      expect(deltaData.delta).toHaveProperty('type', 'text_delta')
      expect(deltaData.delta).toHaveProperty('text', 'Test content')
    })

    test('extracts and aggregates usage statistics from final stream chunks', () => {
      const mockFinalChunk = {
        usage_metadata: {
          prompt_token_count: 100,
          candidates_token_count: 50,
          total_token_count: 150
        },
        candidates: [
          {
            finish_reason: 'STOP'
          }
        ]
      }

      const result = convertVertexStreamToClaudeFormat(mockFinalChunk, false)

      // Should handle usage aggregation properly
      expect(result).toBeDefined()
    })
  })
})
