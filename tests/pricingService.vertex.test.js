const pricingService = require('../src/services/pricingService')

// Mock logger and other dependencies
jest.mock('../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  success: jest.fn()
}))

jest.mock('../config/pricingSource', () => ({
  pricingUrl: 'http://test-pricing-url.com',
  hashUrl: 'http://test-hash-url.com'
}))

jest.mock('fs')
jest.mock('https')

describe('PricingService - Vertex AI Support', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()

    // Mock pricing data with Vertex AI models
    const mockPricingData = {
      'claude-opus-4-6': {
        input_cost_per_token: 0.000015,
        output_cost_per_token: 0.000075,
        litellm_provider: 'vertex_ai',
        max_tokens: 4096,
        max_input_tokens: 200000
      },
      'claude-sonnet-4-6': {
        input_cost_per_token: 0.000003,
        output_cost_per_token: 0.000015,
        litellm_provider: 'vertex_ai',
        max_tokens: 4096,
        max_input_tokens: 200000
      },
      'claude-haiku-4-5': {
        input_cost_per_token: 0.00000025,
        output_cost_per_token: 0.00000125,
        litellm_provider: 'vertex_ai',
        max_tokens: 4096,
        max_input_tokens: 200000
      }
    }

    // Set mock pricing data
    pricingService.pricingData = mockPricingData
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('getModelPricing', () => {
    test('should recognize Vertex AI Claude model names (claude-opus-4-6, claude-sonnet-4-6)', () => {
      const opusPricing = pricingService.getModelPricing('claude-opus-4-6')
      const sonnetPricing = pricingService.getModelPricing('claude-sonnet-4-6')

      expect(opusPricing).toBeDefined()
      expect(opusPricing.litellm_provider).toBe('vertex_ai')
      expect(opusPricing.input_cost_per_token).toBe(0.000015)
      expect(opusPricing.output_cost_per_token).toBe(0.000075)

      expect(sonnetPricing).toBeDefined()
      expect(sonnetPricing.litellm_provider).toBe('vertex_ai')
      expect(sonnetPricing.input_cost_per_token).toBe(0.000003)
      expect(sonnetPricing.output_cost_per_token).toBe(0.000015)
    })

    test('should handle Vertex AI model name variations and endpoint-specific naming', () => {
      // Test with Vertex AI Partner Model format
      const vertexFormattedPricing = pricingService.getModelPricing('claude-opus-4-6')
      expect(vertexFormattedPricing).toBeDefined()

      // Test with regional prefixes (should work with fuzzy matching)
      const withRegionPricing = pricingService.getModelPricing('us-central1.claude-opus-4-6')
      expect(withRegionPricing).toBeDefined()
    })
  })

  describe('calculateCost', () => {
    test('should work correctly for Vertex AI usage objects with input/output tokens', () => {
      const usage = {
        input_tokens: 1000,
        output_tokens: 500,
        model: 'claude-opus-4-6'
      }

      const costResult = pricingService.calculateCost(usage, 'claude-opus-4-6')

      expect(costResult.hasPricing).toBe(true)
      expect(costResult.inputCost).toBe(1000 * 0.000015) // 1000 tokens * $0.000015
      expect(costResult.outputCost).toBe(500 * 0.000075) // 500 tokens * $0.000075
      expect(costResult.totalCost).toBe(costResult.inputCost + costResult.outputCost)
    })

    test('should handle Vertex AI-specific pricing structure and regional variations', () => {
      const usage = {
        input_tokens: 2000,
        output_tokens: 1000
      }

      const opusCost = pricingService.calculateCost(usage, 'claude-opus-4-6')
      const sonnetCost = pricingService.calculateCost(usage, 'claude-sonnet-4-6')
      const haikuCost = pricingService.calculateCost(usage, 'claude-haiku-4-5')

      // Verify different pricing tiers
      expect(opusCost.totalCost).toBeGreaterThan(sonnetCost.totalCost)
      expect(sonnetCost.totalCost).toBeGreaterThan(haikuCost.totalCost)

      // Verify cost calculations
      expect(opusCost.inputCost).toBe(2000 * 0.000015)
      expect(sonnetCost.inputCost).toBe(2000 * 0.000003)
      expect(haikuCost.inputCost).toBe(2000 * 0.00000025)
    })

    test('should handle missing Vertex AI pricing gracefully', () => {
      const usage = {
        input_tokens: 1000,
        output_tokens: 500
      }

      const costResult = pricingService.calculateCost(usage, 'unknown-vertex-model')

      expect(costResult.hasPricing).toBe(false)
      expect(costResult.totalCost).toBe(0)
      expect(costResult.inputCost).toBe(0)
      expect(costResult.outputCost).toBe(0)
    })
  })
})