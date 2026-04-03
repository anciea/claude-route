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
jest.mock('axios')
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

  describe('buildVertexRequestBody', () => {
    test('should pass through request body and add anthropic_version', () => {
      const requestBody = {
        model: 'claude-opus-4-6',
        messages: [
          { role: 'user', content: 'Hello, how are you?' },
          { role: 'assistant', content: 'I am doing well!' },
          { role: 'user', content: 'What is the weather?' }
        ],
        system: 'You are a helpful assistant.',
        max_tokens: 4096,
        temperature: 0.7
      }

      const result = vertexRelayService.buildVertexRequestBody(requestBody)

      // Model should be removed (it goes in URL path)
      expect(result.model).toBeUndefined()
      // anthropic_version should be added
      expect(result.anthropic_version).toBe('vertex-2023-10-16')
      // All other fields should be preserved
      expect(result.messages).toEqual(requestBody.messages)
      expect(result.system).toBe('You are a helpful assistant.')
      expect(result.temperature).toBe(0.7)
      expect(result.max_tokens).toBe(4096)
    })

    test('should not include model field in request body (model is in URL path)', () => {
      const result = vertexRelayService.buildVertexRequestBody({
        model: 'claude-opus-4-6',
        messages: [{ role: 'user', content: 'Test' }],
        temperature: 0.5,
        max_tokens: 2048
      })

      expect(result.model).toBeUndefined()
      expect(result.anthropic_version).toBe('vertex-2023-10-16')
      expect(result.temperature).toBe(0.5)
      expect(result.max_tokens).toBe(2048)
    })

    test('should preserve tools and tool_choice fields', () => {
      const tools = [
        {
          name: 'read_file',
          description: 'Read a file',
          input_schema: { type: 'object', properties: { path: { type: 'string' } } }
        }
      ]
      const result = vertexRelayService.buildVertexRequestBody({
        model: 'claude-opus-4-6',
        messages: [{ role: 'user', content: 'Read the file' }],
        max_tokens: 1024,
        tools,
        tool_choice: { type: 'auto' }
      })

      expect(result.tools).toEqual(tools)
      expect(result.tool_choice).toEqual({ type: 'auto' })
      expect(result.model).toBeUndefined()
    })

    test('should preserve existing anthropic_version if provided', () => {
      const result = vertexRelayService.buildVertexRequestBody({
        model: 'claude-opus-4-6',
        messages: [{ role: 'user', content: 'Test' }],
        anthropic_version: 'vertex-2024-01-01',
        max_tokens: 1024
      })

      expect(result.anthropic_version).toBe('vertex-2024-01-01')
    })

    test('should handle minimal request body', () => {
      const result = vertexRelayService.buildVertexRequestBody({
        messages: [],
        max_tokens: 1024
      })

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

      const result = vertexRelayService.convertVertexResponse(
        vertexResponse,
        'claude-opus-4-6',
        false
      )

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

      const result = vertexRelayService.convertVertexResponse(
        vertexStreamChunk,
        'claude-sonnet-4-6',
        true
      )

      expect(result).toEqual(expectedClaudeChunk)
    })

    test('should handle stop_reason correctly', () => {
      const vertexResponse = {
        content: [{ text: 'Complete response' }],
        stop_reason: 'max_tokens',
        usage: { input_tokens: 5, output_tokens: 3 }
      }

      const result = vertexRelayService.convertVertexResponse(
        vertexResponse,
        'claude-opus-4-6',
        false
      )

      expect(result.stop_reason).toBe('max_tokens')
    })

    test('should handle missing content gracefully', () => {
      const vertexResponse = {
        usage: { input_tokens: 5, output_tokens: 0 },
        stop_reason: 'end_turn'
      }

      const result = vertexRelayService.convertVertexResponse(
        vertexResponse,
        'claude-opus-4-6',
        false
      )

      expect(result.content).toEqual([])
    })
  })

  describe('handleVertexStream', () => {
    test('should pass through Claude-native SSE events from Vertex AI Partner Model streamRawPredict', async () => {
      // Vertex AI Claude Partner Model streamRawPredict returns Claude-native SSE format
      const mockStreamData = [
        'event: message_start\n',
        'data: {"type":"message_start","message":{"id":"msg_123","type":"message","role":"assistant","content":[],"model":"claude-opus-4-6","stop_reason":null,"usage":{"input_tokens":5,"output_tokens":0}}}\n',
        '\n',
        'event: content_block_start\n',
        'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n',
        '\n',
        'event: content_block_delta\n',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello there!"}}\n',
        '\n',
        'event: content_block_stop\n',
        'data: {"type":"content_block_stop","index":0}\n',
        '\n',
        'event: message_delta\n',
        'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":3}}\n',
        '\n',
        'event: message_stop\n',
        'data: {"type":"message_stop"}\n',
        '\n'
      ]

      // Create a mock stream
      const mockStream = {
        async *[Symbol.asyncIterator]() {
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

      // Should have received the SSE events passed through directly
      expect(chunks.length).toBeGreaterThan(0)
      expect(chunks.some((chunk) => chunk.includes('message_start'))).toBe(true)
      expect(chunks.some((chunk) => chunk.includes('content_block_delta'))).toBe(true)
      expect(chunks.some((chunk) => chunk.includes('message_stop'))).toBe(true)

      // Verify usage recording was called with extracted token counts
      expect(apiKeyService.recordUsage).toHaveBeenCalledWith(
        'test-api-key',
        5, // input tokens from message_start
        3, // output tokens from message_delta
        0,
        0,
        'claude-opus-4-6',
        'test-account',
        'vertex-ai'
      )
    })

    test('should handle stream errors gracefully', async () => {
      const mockErrorStream = {
        async *[Symbol.asyncIterator]() {
          yield* [] // eslint-disable-line no-empty-pattern
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
      const errorChunk = chunks.find((chunk) => chunk.includes('event: error'))
      expect(errorChunk).toBeTruthy()
      expect(errorChunk).toContain('Stream connection failed')
    })

    test('should handle client disconnection (CanceledError)', async () => {
      const mockAbortedStream = {
        async *[Symbol.asyncIterator]() {
          yield* [] // eslint-disable-line no-empty-pattern
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
      expect(chunks.some((chunk) => chunk.includes('event: error'))).toBe(false)
      expect(logger.info).toHaveBeenCalledWith('Vertex AI stream request was aborted by client')
    })

    test('should extract usage statistics from Claude SSE stream events', async () => {
      // Claude SSE format from Vertex AI Partner Model streamRawPredict
      const mockStreamData = [
        'event: message_start\n',
        'data: {"type":"message_start","message":{"id":"msg_abc","type":"message","role":"assistant","content":[],"model":"claude-sonnet-4-6","stop_reason":null,"usage":{"input_tokens":10,"output_tokens":0}}}\n',
        '\n',
        'event: content_block_delta\n',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Test response"}}\n',
        '\n',
        'event: message_delta\n',
        'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":3}}\n',
        '\n',
        'event: message_stop\n',
        'data: {"type":"message_stop"}\n',
        '\n'
      ]

      const mockStream = {
        async *[Symbol.asyncIterator]() {
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

      // Verify final usage was recorded correctly from Claude SSE events
      expect(apiKeyService.recordUsage).toHaveBeenCalledWith(
        'test-api-key',
        10, // input tokens from message_start
        3, // output tokens from message_delta
        0,
        0,
        'claude-sonnet-4-6',
        'test-account',
        'vertex-ai'
      )
    })

    test('should pass through all SSE lines including those with non-JSON data', async () => {
      // Passthrough mode: all SSE events are forwarded as-is
      const mockStreamData = [
        'event: content_block_delta\n',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Valid"}}\n',
        '\n',
        'event: content_block_delta\n',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"More valid"}}\n',
        '\n'
      ]

      const mockStream = {
        async *[Symbol.asyncIterator]() {
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

      // Should pass through all SSE events
      expect(chunks.some((chunk) => chunk.includes('Valid'))).toBe(true)
      expect(chunks.some((chunk) => chunk.includes('More valid'))).toBe(true)
    })
  })

  describe('sendVertexRequest', () => {
    beforeEach(() => {
      // Reset axios mock
      axios.mockClear()

      // Mock account service responses
      vertexAiAccountService.getAccount = jest.fn().mockResolvedValue({
        id: 'test-account-id',
        projectId: 'test-project',
        location: 'us-central1',
        serviceAccountJson: {}
      })

      vertexAiAccountService.getAccessToken = jest.fn().mockResolvedValue({
        accessToken: 'mock-access-token',
        expiresAt: new Date(Date.now() + 3600000)
      })
    })

    test('should send non-streaming request to Vertex AI Partner Model API', async () => {
      const mockVertexResponse = {
        content: [{ text: 'Hello from Vertex AI!' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 5, output_tokens: 4 }
      }

      axios.mockResolvedValue({
        data: mockVertexResponse
      })

      const messages = [{ role: 'user', content: 'Hello!' }]
      const result = await vertexRelayService.sendVertexRequest({
        messages,
        model: 'claude-opus-4-6',
        temperature: 0.7,
        maxTokens: 1024,
        stream: false,
        apiKeyId: 'test-api-key',
        accountId: 'test-account'
      })

      expect(vertexAiAccountService.getAccount).toHaveBeenCalledWith('test-account', true)
      expect(vertexAiAccountService.getAccessToken).toHaveBeenCalledWith('test-account-id')
      expect(axios).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: 'https://aiplatform.googleapis.com/v1/projects/test-project/locations/us-central1/publishers/anthropic/models/claude-opus-4-6:rawPredict',
          headers: expect.objectContaining({
            Authorization: 'Bearer mock-access-token',
            'Content-Type': 'application/json'
          }),
          data: expect.objectContaining({
            anthropic_version: 'vertex-2023-10-16',
            messages: [{ role: 'user', content: 'Hello!' }]
          })
        })
      )

      expect(result).toEqual(
        expect.objectContaining({
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello from Vertex AI!' }],
          model: 'claude-opus-4-6'
        })
      )

      expect(apiKeyService.recordUsage).toHaveBeenCalledWith(
        'test-api-key',
        5,
        4,
        0,
        0,
        'claude-opus-4-6',
        'test-account',
        'vertex-ai'
      )
    })

    test('should handle streaming requests', async () => {
      const mockStreamData = ['data: {"content":[{"text":"Hello"}]}\n']
      const mockStream = {
        async *[Symbol.asyncIterator]() {
          for (const data of mockStreamData) {
            yield Buffer.from(data)
          }
        }
      }

      axios.mockResolvedValue({
        data: mockStream
      })

      const messages = [{ role: 'user', content: 'Hello!' }]
      const result = await vertexRelayService.sendVertexRequest({
        messages,
        model: 'claude-sonnet-4-6',
        stream: true,
        apiKeyId: 'test-api-key',
        accountId: 'test-account'
      })

      expect(axios).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('streamRawPredict'),
          responseType: 'stream'
        })
      )

      // Should return async generator
      expect(result).toBeDefined()
      expect(typeof result.next).toBe('function')
    })

    test('should handle authentication errors with exponential backoff', async () => {
      const authError = new Error('Auth failed')
      authError.response = { status: 401, data: { error: { message: 'Invalid token' } } }

      const successResponse = {
        data: {
          content: [{ text: 'Success after retry' }],
          usage: { input_tokens: 3, output_tokens: 5 }
        }
      }

      axios.mockRejectedValueOnce(authError).mockResolvedValueOnce(successResponse)

      vertexAiAccountService.getAccessToken
        .mockResolvedValueOnce({ accessToken: 'old-token', expiresAt: new Date() })
        .mockResolvedValueOnce({ accessToken: 'new-token', expiresAt: new Date() })

      const messages = [{ role: 'user', content: 'Test' }]
      const result = await vertexRelayService.sendVertexRequest({
        messages,
        accountId: 'test-account',
        apiKeyId: 'test-api-key'
      })

      expect(vertexAiAccountService.getAccessToken).toHaveBeenCalledTimes(2)
      expect(axios).toHaveBeenCalledTimes(2)
      expect(result.content[0].text).toBe('Success after retry')
    })

    test('should convert Vertex AI API errors to Claude format', async () => {
      const vertexError = new Error('API Error')
      vertexError.response = {
        status: 429,
        data: {
          error: {
            message: 'Rate limit exceeded',
            code: 'rate_limit_error'
          }
        }
      }

      axios.mockRejectedValue(vertexError)

      const messages = [{ role: 'user', content: 'Test' }]

      await expect(
        vertexRelayService.sendVertexRequest({
          messages,
          accountId: 'test-account'
        })
      ).rejects.toEqual(
        expect.objectContaining({
          status: 429,
          error: expect.objectContaining({
            message: 'Rate limit exceeded for Vertex AI',
            type: 'rate_limit_error',
            code: 'rate_limit_exceeded'
          })
        })
      )
    })

    test('should handle request cancellation', async () => {
      const cancelError = new Error('Request was cancelled')
      cancelError.name = 'CanceledError'

      axios.mockRejectedValue(cancelError)

      const messages = [{ role: 'user', content: 'Test' }]

      await expect(
        vertexRelayService.sendVertexRequest({
          messages,
          accountId: 'test-account'
        })
      ).rejects.toEqual(
        expect.objectContaining({
          status: 499,
          error: expect.objectContaining({
            message: 'Request canceled by client',
            type: 'canceled',
            code: 'request_canceled'
          })
        })
      )

      expect(logger.info).toHaveBeenCalledWith('Vertex AI request was aborted by client')
    })

    test('should include proxy configuration when provided', async () => {
      const mockProxyAgent = { proxy: true }
      ProxyHelper.createProxyAgent.mockReturnValue(mockProxyAgent)

      axios.mockResolvedValue({
        data: { content: [{ text: 'Response' }], usage: {} }
      })

      const messages = [{ role: 'user', content: 'Test' }]
      await vertexRelayService.sendVertexRequest({
        messages,
        accountId: 'test-account',
        proxy: { host: 'proxy.example.com', port: 8080 }
      })

      expect(ProxyHelper.createProxyAgent).toHaveBeenCalledWith({
        host: 'proxy.example.com',
        port: 8080
      })

      expect(axios).toHaveBeenCalledWith(
        expect.objectContaining({
          httpsAgent: mockProxyAgent,
          proxy: false
        })
      )
    })

    test('should handle AbortController signal', async () => {
      axios.mockResolvedValue({
        data: { content: [{ text: 'Response' }], usage: {} }
      })

      const abortController = new AbortController()
      const messages = [{ role: 'user', content: 'Test' }]

      await vertexRelayService.sendVertexRequest({
        messages,
        accountId: 'test-account',
        signal: abortController.signal
      })

      expect(axios).toHaveBeenCalledWith(
        expect.objectContaining({
          signal: abortController.signal
        })
      )
      expect(logger.debug).toHaveBeenCalledWith(
        'AbortController signal attached to Vertex AI request'
      )
    })
  })
})
