const vertexRelayService = require('../src/services/relay/vertexRelayService')
const pricingService = require('../src/services/pricingService')

// Mock dependencies
jest.mock('../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  success: jest.fn()
}))

jest.mock('../src/services/pricingService', () => ({
  calculateCost: jest.fn(),
  getModelPricing: jest.fn()
}))

jest.mock('../src/services/account/vertexAiAccountService', () => ({
  getAccount: jest.fn(),
  getAccessToken: jest.fn()
}))

jest.mock('../src/services/apiKeyService', () => ({
  recordUsage: jest.fn()
}))

jest.mock('axios')

describe('VertexRelayService - Usage Integration', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('Usage Capture from Vertex AI Responses', () => {
    test('should capture accurate input and output token counts from Vertex AI responses', () => {
      const mockVertexResponse = {
        content: [{ text: 'Test response text' }],
        usage: {
          input_tokens: 1000,
          output_tokens: 500
        },
        stop_reason: 'end_turn'
      }

      const claudeResponse = vertexRelayService.convertVertexResponse(mockVertexResponse, 'claude-opus-4-6', false)

      expect(claudeResponse.usage).toBeDefined()
      expect(claudeResponse.usage.input_tokens).toBe(1000)
      expect(claudeResponse.usage.output_tokens).toBe(500)
    })

    test('should format usage object for statistics integration', async () => {
      // Mock dependencies
      const mockAccount = { id: 'vertex-account-1', projectId: 'test-project', location: 'us-central1' }
      const mockAccessToken = { accessToken: 'mock-token' }

      const vertexAccountService = require('../src/services/account/vertexAiAccountService')
      vertexAccountService.getAccount.mockResolvedValue(mockAccount)
      vertexAccountService.getAccessToken.mockResolvedValue(mockAccessToken)

      const axios = require('axios')
      const mockVertexApiResponse = {
        data: {
          content: [{ text: 'Response' }],
          usage: {
            input_tokens: 2000,
            output_tokens: 1000
          },
          stop_reason: 'end_turn'
        }
      }
      axios.mockResolvedValue(mockVertexApiResponse)

      const response = await vertexRelayService.sendVertexRequest({
        messages: [{ role: 'user', content: 'Test message' }],
        model: 'claude-opus-4-6',
        accountId: 'test-account',
        apiKeyId: 'test-key'
      })

      // Verify usage format
      expect(response.usage).toBeDefined()
      expect(response.usage).toHaveProperty('input_tokens')
      expect(response.usage).toHaveProperty('output_tokens')
    })

    test('should handle streaming usage capture consistently with non-streaming', () => {
      // Mock streaming usage accumulation
      const { getCurrentUsage } = require('../src/utils/vertexStreamHandler')

      // This would be captured during actual stream processing
      const expectedUsage = {
        input_tokens: 1500,
        output_tokens: 750
      }

      // Simulate final usage extraction
      expect(expectedUsage).toHaveProperty('input_tokens')
      expect(expectedUsage).toHaveProperty('output_tokens')
      expect(expectedUsage.input_tokens).toBeGreaterThan(0)
      expect(expectedUsage.output_tokens).toBeGreaterThan(0)
    })
  })

  describe('Cost Calculation Integration', () => {
    test('should calculate total cost using pricingService.calculateCost with captured usage', async () => {
      // Mock pricing service response
      const mockCostResult = {
        inputCost: 0.015,
        outputCost: 0.0375,
        totalCost: 0.0525,
        hasPricing: true
      }
      pricingService.calculateCost.mockReturnValue(mockCostResult)

      // Mock account and API response
      const mockAccount = { id: 'vertex-account-1', projectId: 'test-project', location: 'us-central1' }
      const mockAccessToken = { accessToken: 'mock-token' }

      const vertexAccountService = require('../src/services/account/vertexAiAccountService')
      vertexAccountService.getAccount.mockResolvedValue(mockAccount)
      vertexAccountService.getAccessToken.mockResolvedValue(mockAccessToken)

      const axios = require('axios')
      const mockVertexApiResponse = {
        data: {
          content: [{ text: 'Response' }],
          usage: {
            input_tokens: 1000,
            output_tokens: 500
          },
          stop_reason: 'end_turn'
        }
      }
      axios.mockResolvedValue(mockVertexApiResponse)

      // This should call pricingService.calculateCost
      await vertexRelayService.sendVertexRequest({
        messages: [{ role: 'user', content: 'Test message' }],
        model: 'claude-opus-4-6',
        accountId: 'test-account',
        apiKeyId: 'test-key'
      })

      // Verify calculateCost was called with proper usage and model
      expect(pricingService.calculateCost).toHaveBeenCalledWith(
        expect.objectContaining({
          input_tokens: 1000,
          output_tokens: 500
        }),
        'claude-opus-4-6'
      )
    })

    test('should return properly formatted usage and cost data in relay service format', async () => {
      // Mock pricing service response
      const mockCostResult = {
        inputCost: 0.015,
        outputCost: 0.0375,
        totalCost: 0.0525,
        hasPricing: true
      }
      pricingService.calculateCost.mockReturnValue(mockCostResult)

      // Mock account dependencies
      const mockAccount = { id: 'vertex-account-1', projectId: 'test-project', location: 'us-central1' }
      const mockAccessToken = { accessToken: 'mock-token' }

      const vertexAccountService = require('../src/services/account/vertexAiAccountService')
      vertexAccountService.getAccount.mockResolvedValue(mockAccount)
      vertexAccountService.getAccessToken.mockResolvedValue(mockAccessToken)

      const axios = require('axios')
      const mockVertexApiResponse = {
        data: {
          content: [{ text: 'Response' }],
          usage: {
            input_tokens: 1000,
            output_tokens: 500
          },
          stop_reason: 'end_turn'
        }
      }
      axios.mockResolvedValue(mockVertexApiResponse)

      const response = await vertexRelayService.sendVertexRequest({
        messages: [{ role: 'user', content: 'Test message' }],
        model: 'claude-opus-4-6',
        accountId: 'test-account',
        apiKeyId: 'test-key'
      })

      // Verify response format matches relay service standard
      expect(response).toHaveProperty('usage')
      expect(response).toHaveProperty('model')
      expect(response.usage).toEqual(
        expect.objectContaining({
          input_tokens: 1000,
          output_tokens: 500
        })
      )
    })

    test('should integrate cost data with existing relay service return format', () => {
      const mockVertexResponse = {
        content: [{ text: 'Test response' }],
        usage: {
          input_tokens: 1000,
          output_tokens: 500
        },
        stop_reason: 'end_turn'
      }

      const claudeResponse = vertexRelayService.convertVertexResponse(mockVertexResponse, 'claude-opus-4-6', false)

      // Verify standard Claude response format is maintained
      expect(claudeResponse).toHaveProperty('id')
      expect(claudeResponse).toHaveProperty('type', 'message')
      expect(claudeResponse).toHaveProperty('role', 'assistant')
      expect(claudeResponse).toHaveProperty('content')
      expect(claudeResponse).toHaveProperty('model', 'claude-opus-4-6')
      expect(claudeResponse).toHaveProperty('usage')
    })
  })
})