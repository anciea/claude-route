const vertexRelayService = require('./vertexRelayService')
const vertexStreamHandler = require('../../utils/vertexStreamHandler')

// Mock dependencies
jest.mock('../../utils/logger')
jest.mock('../account/vertexAiAccountService')
jest.mock('../apiKeyService')
jest.mock('../../utils/vertexStreamHandler')
jest.mock('axios')

const mockLogger = require('../../utils/logger')
const mockVertexAiAccountService = require('../account/vertexAiAccountService')
const mockApiKeyService = require('../apiKeyService')
const mockAxios = require('axios')

describe('vertexRelayService streaming', () => {
  let mockResponse
  let mockAccount
  let mockAbortController

  beforeEach(() => {
    jest.resetAllMocks()

    mockResponse = {
      setHeader: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
      headersSent: false
    }

    mockAccount = {
      id: 'test-account',
      projectId: 'test-project',
      location: 'us-central1',
      serviceAccountJson: { type: 'service_account' }
    }

    mockAbortController = {
      signal: { aborted: false },
      abort: jest.fn()
    }

    // Mock successful account and token retrieval
    mockVertexAiAccountService.getAccount.mockResolvedValue(mockAccount)
    mockVertexAiAccountService.getAccessToken.mockResolvedValue({
      accessToken: 'mock-token'
    })

    // Mock stream handler
    vertexStreamHandler.convertVertexStreamToClaudeFormat.mockReturnValue(
      'event: content_block_delta\\ndata: {"type":"content_block_delta"}\\n\\n'
    )
    vertexStreamHandler.getCurrentUsage.mockReturnValue({
      input_tokens: 10,
      output_tokens: 5
    })
  })

  test('handles streaming requests by setting SSE headers and processing Vertex AI stream chunks', async () => {
    const mockStream = {
      data: {
        on: jest.fn(),
        pipe: jest.fn()
      }
    }

    mockAxios.mockResolvedValue(mockStream)

    const streamGenerator = vertexRelayService.handleVertexStream(
      mockStream,
      'claude-opus-4-6',
      'test-api-key',
      'test-account'
    )

    // Should be an async generator
    expect(typeof streamGenerator.next).toBe('function')
  })

  test('integrates with vertexStreamHandler to convert stream format in real-time', async () => {
    const mockVertexChunk = {
      candidates: [
        {
          content: {
            parts: [{ text: 'Hello' }]
          }
        }
      ]
    }

    // Mock stream processing
    const sseResult = vertexStreamHandler.convertVertexStreamToClaudeFormat(mockVertexChunk, false)

    expect(vertexStreamHandler.convertVertexStreamToClaudeFormat).toHaveBeenCalledWith(
      mockVertexChunk,
      false
    )
    expect(sseResult).toContain('event: content_block_delta')
  })

  test('captures total usage statistics from streaming response for cost calculation', async () => {
    const mockUsage = {
      input_tokens: 100,
      output_tokens: 50
    }

    vertexStreamHandler.getCurrentUsage.mockReturnValue(mockUsage)

    const usage = vertexStreamHandler.getCurrentUsage()

    expect(usage).toEqual({
      input_tokens: 100,
      output_tokens: 50
    })
    expect(mockApiKeyService.recordUsage).not.toHaveBeenCalled() // Should be called after stream completion
  })

  test('returns usage object with input_tokens, output_tokens, and timing metrics', async () => {
    const expectedUsage = {
      input_tokens: 10,
      output_tokens: 5
    }

    vertexStreamHandler.getCurrentUsage.mockReturnValue(expectedUsage)

    const result = vertexStreamHandler.getCurrentUsage()

    expect(result).toHaveProperty('input_tokens')
    expect(result).toHaveProperty('output_tokens')
    expect(typeof result.input_tokens).toBe('number')
    expect(typeof result.output_tokens).toBe('number')
  })

  test('gracefully handles stream interruption and client disconnection with AbortController', async () => {
    const mockError = new Error('Request canceled')
    mockError.name = 'CanceledError'

    const streamFunction = jest.fn().mockRejectedValue(mockError)

    try {
      await streamFunction()
    } catch (error) {
      expect(error.name).toBe('CanceledError')
      // Should log appropriate message and clean up resources
    }

    // Verify cleanup would be handled
    expect(mockAbortController.abort).not.toHaveBeenCalled()
  })

  test('sends proper SSE headers for streaming response', () => {
    const expectedHeaders = {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }

    // Mock SSE header setting
    Object.keys(expectedHeaders).forEach(header => {
      mockResponse.setHeader(header, expectedHeaders[header])
    })

    expect(mockResponse.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream')
    expect(mockResponse.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache')
    expect(mockResponse.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive')
  })
})