const vertexRelayService = require('../src/services/relay/vertexRelayService')

// Mock dependencies
jest.mock('../src/utils/logger')
jest.mock('../src/utils/proxyHelper')
jest.mock('../config/config')
jest.mock('../src/services/apiKeyService')
jest.mock('../src/services/account/vertexAiAccountService')

const logger = require('../src/utils/logger')
const ProxyHelper = require('../src/utils/proxyHelper')
const config = require('../config/config')
const apiKeyService = require('../src/services/apiKeyService')
const vertexAiAccountService = require('../src/services/account/vertexAiAccountService')

// Mock axios
const mockAxios = {
  request: jest.fn(),
  post: jest.fn(),
  get: jest.fn()
}
jest.doMock('axios', () => mockAxios)
const axios = require('axios')

describe('vertexRelayService', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()

    // Default config mock
    config.requestTimeout = 600000
    config.claude = {
      apiVersion: '2023-06-01'
    }

    // Default logger mocks
    logger.debug = jest.fn()
    logger.info = jest.fn()
    logger.error = jest.fn()

    // Default proxy helper mocks
    ProxyHelper.createProxyAgent = jest.fn().mockReturnValue(null)
    ProxyHelper.getProxyDescription = jest.fn().mockReturnValue('proxy-description')

    // Default API key service mocks
    apiKeyService.recordUsage = jest.fn().mockResolvedValue()

    // Default vertex account service mocks
    vertexAiAccountService.getAccessToken = jest.fn().mockResolvedValue({
      accessToken: 'mock-access-token',
      expiresAt: new Date(Date.now() + 3600000)
    })
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('convertClaudeToVertex', () => {
    test('should convert Claude API message format to Vertex AI Partner Model format', () => {
      const claudeMessages = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello, how are you?' },
        { role: 'assistant', content: 'I am doing well, thank you!' },
        { role: 'user', content: 'What is the weather like?' }
      ]

      const expectedVertexRequest = {
        anthropic_version: 'vertex-2023-10-16',
        max_tokens: 4096,
        temperature: 0.7,
        model: 'claude-3-opus@20240229',
        system: 'You are a helpful assistant.',
        messages: [
          { role: 'user', content: 'Hello, how are you?' },
          { role: 'assistant', content: 'I am doing well, thank you!' },
          { role: 'user', content: 'What is the weather like?' }
        ]
      }

      const result = vertexRelayService.convertClaudeToVertex(claudeMessages, {
        temperature: 0.7,
        max_tokens: 4096
      })

      expect(result).toEqual(expectedVertexRequest)
    })

    test('should map claude-opus-4-6 model name correctly', () => {
      const claudeMessages = [
        { role: 'user', content: 'Test message' }
      ]

      const result = vertexRelayService.convertClaudeToVertex(claudeMessages, {
        model: 'claude-opus-4-6',
        temperature: 0.5,
        max_tokens: 2048
      })

      expect(result.model).toBe('claude-3-opus@20240229')
      expect(result.anthropic_version).toBe('vertex-2023-10-16')
      expect(result.temperature).toBe(0.5)
      expect(result.max_tokens).toBe(2048)
    })

    test('should map claude-sonnet-4-6 model name correctly', () => {
      const claudeMessages = [
        { role: 'user', content: 'Test message' }
      ]

      const result = vertexRelayService.convertClaudeToVertex(claudeMessages, {
        model: 'claude-sonnet-4-6',
        temperature: 1.0,
        max_tokens: 1024
      })

      expect(result.model).toBe('claude-3-sonnet@20240229')
      expect(result.anthropic_version).toBe('vertex-2023-10-16')
    })

    test('should handle messages without system prompt', () => {
      const claudeMessages = [
        { role: 'user', content: 'Hello!' },
        { role: 'assistant', content: 'Hi there!' }
      ]

      const result = vertexRelayService.convertClaudeToVertex(claudeMessages)

      expect(result.system).toBeUndefined()
      expect(result.messages).toHaveLength(2)
      expect(result.anthropic_version).toBe('vertex-2023-10-16')
    })

    test('should handle empty messages array', () => {
      const claudeMessages = []

      const result = vertexRelayService.convertClaudeToVertex(claudeMessages)

      expect(result.messages).toEqual([])
      expect(result.anthropic_version).toBe('vertex-2023-10-16')
    })
  })

  describe('convertVertexResponse', () => {
    test('should convert Vertex AI response back to Claude format for non-streaming', () => {
      const vertexResponse = {
        content: [
          {
            text: 'Hello! How can I help you today?'
          }
        ],
        usage: {
          input_tokens: 10,
          output_tokens: 8
        },
        stop_reason: 'end_turn'
      }

      const expectedClaudeResponse = {
        id: expect.any(String),
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'Hello! How can I help you today?'
          }
        ],
        model: 'claude-opus-4-6',
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 10,
          output_tokens: 8
        }
      }

      const result = vertexRelayService.convertVertexResponse(vertexResponse, 'claude-opus-4-6', false)

      expect(result).toEqual(expectedClaudeResponse)
      expect(result.id).toMatch(/^msg_/)
    })

    test('should convert Vertex AI streaming response to Claude format', () => {
      const vertexStreamChunk = {
        content: [
          {
            text: 'Hello'
          }
        ],
        usage: {
          input_tokens: 5,
          output_tokens: 2
        }
      }

      const expectedClaudeChunk = {
        type: 'content_block_delta',
        index: 0,
        delta: {
          type: 'text_delta',
          text: 'Hello'
        }
      }

      const result = vertexRelayService.convertVertexResponse(vertexStreamChunk, 'claude-sonnet-4-6', true)

      expect(result).toEqual(expectedClaudeChunk)
    })

    test('should handle stop_reason correctly', () => {
      const vertexResponse = {
        content: [{ text: 'Complete response' }],
        stop_reason: 'max_tokens',
        usage: { input_tokens: 5, output_tokens: 3 }
      }

      const result = vertexRelayService.convertVertexResponse(vertexResponse, 'claude-opus-4-6', false)

      expect(result.stop_reason).toBe('max_tokens')
    })

    test('should handle missing content gracefully', () => {
      const vertexResponse = {
        usage: { input_tokens: 5, output_tokens: 0 },
        stop_reason: 'end_turn'
      }

      const result = vertexRelayService.convertVertexResponse(vertexResponse, 'claude-opus-4-6', false)

      expect(result.content).toEqual([])
    })
  })

  describe('handleVertexStream', () => {
    test('should process Vertex AI streaming responses and convert to Claude API SSE format', async () => {
      // Mock streaming response data
      const mockStreamData = [
        'data: {"content":[{"text":"Hello"}],"usage":{"input_tokens":5,"output_tokens":1}}\n',
        'data: {"content":[{"text":" there"}],"usage":{"input_tokens":5,"output_tokens":2}}\n',
        'data: {"content":[{"text":"!"}],"stop_reason":"end_turn","usage":{"input_tokens":5,"output_tokens":3}}\n'
      ]

      // Create a mock stream
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          for (const data of mockStreamData) {
            yield Buffer.from(data)
          }
        }
      }

      const mockResponse = {
        data: mockStream
      }

      const chunks = []
      for await (const chunk of vertexRelayService.handleVertexStream(
        mockResponse,
        'claude-opus-4-6',
        'test-api-key',
        'test-account'
      )) {
        chunks.push(chunk)
      }

      // Should have received message_start, content_block_start, content deltas, and completion events
      expect(chunks.length).toBeGreaterThan(4)
      expect(chunks[0]).toMatch(/event: message_start/)
      expect(chunks[1]).toMatch(/event: content_block_start/)
      expect(chunks.some(chunk => chunk.includes('content_block_delta'))).toBe(true)
      expect(chunks.some(chunk => chunk.includes('message_stop'))).toBe(true)

      // Verify usage recording was called
      expect(apiKeyService.recordUsage).toHaveBeenCalledWith(
        'test-api-key',
        5, // input tokens
        3, // output tokens
        0, // cache create tokens
        0, // cache read tokens
        'claude-opus-4-6',
        'test-account',
        'vertex-ai'
      )
    })

    test('should handle stream errors gracefully', async () => {
      const mockErrorStream = {
        [Symbol.asyncIterator]: async function* () {
          throw new Error('Stream connection failed')
        }
      }

      const mockResponse = {
        data: mockErrorStream
      }

      const chunks = []
      for await (const chunk of vertexRelayService.handleVertexStream(
        mockResponse,
        'claude-opus-4-6',
        'test-api-key'
      )) {
        chunks.push(chunk)
      }

      // Should contain error event
      const errorChunk = chunks.find(chunk => chunk.includes('event: error'))
      expect(errorChunk).toBeTruthy()
      expect(errorChunk).toContain('Stream connection failed')
    })

    test('should handle client disconnection (CanceledError)', async () => {
      const mockAbortedStream = {
        [Symbol.asyncIterator]: async function* () {
          const error = new Error('Request canceled')
          error.name = 'CanceledError'
          throw error
        }
      }

      const mockResponse = {
        data: mockAbortedStream
      }

      const chunks = []
      for await (const chunk of vertexRelayService.handleVertexStream(
        mockResponse,
        'claude-opus-4-6',
        'test-api-key'
      )) {
        chunks.push(chunk)
      }

      // Should have message_start and content_block_start, but no error event for cancellation
      expect(chunks.some(chunk => chunk.includes('event: error'))).toBe(false)
      expect(logger.info).toHaveBeenCalledWith('Vertex AI stream request was aborted by client')
    })

    test('should extract usage statistics from stream events', async () => {
      const mockStreamData = [
        'data: {"content":[{"text":"Test"}],"usage":{"input_tokens":10,"output_tokens":1}}\n',
        'data: {"content":[{"text":" response"}],"stop_reason":"end_turn","usage":{"input_tokens":10,"output_tokens":3}}\n'
      ]

      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          for (const data of mockStreamData) {
            yield Buffer.from(data)
          }
        }
      }

      const mockResponse = {
        data: mockStream
      }

      const chunks = []
      for await (const chunk of vertexRelayService.handleVertexStream(
        mockResponse,
        'claude-sonnet-4-6',
        'test-api-key',
        'test-account'
      )) {
        chunks.push(chunk)
      }

      // Verify final usage was recorded correctly
      expect(apiKeyService.recordUsage).toHaveBeenCalledWith(
        'test-api-key',
        10, // input tokens (final count)
        3,  // output tokens (final count)
        0,
        0,
        'claude-sonnet-4-6',
        'test-account',
        'vertex-ai'
      )
    })

    test('should handle malformed JSON in stream gracefully', async () => {
      const mockStreamData = [
        'data: {"content":[{"text":"Valid"}]}\n',
        'data: {invalid json}\n',
        'data: {"content":[{"text":"More valid"}],"stop_reason":"end_turn"}\n'
      ]

      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          for (const data of mockStreamData) {
            yield Buffer.from(data)
          }
        }
      }

      const mockResponse = {
        data: mockStream
      }

      const chunks = []
      for await (const chunk of vertexRelayService.handleVertexStream(
        mockResponse,
        'claude-opus-4-6',
        'test-api-key'
      )) {
        chunks.push(chunk)
      }

      // Should process valid chunks and skip invalid ones
      expect(chunks.some(chunk => chunk.includes('Valid'))).toBe(true)
      expect(chunks.some(chunk => chunk.includes('More valid'))).toBe(true)
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Error parsing JSON line'),
        expect.any(String),
        'Line:',
        '{invalid json}'
      )
    })
  })
})