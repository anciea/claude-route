const UnifiedVertexScheduler = require('../src/services/scheduler/unifiedVertexScheduler')

// Mock dependencies
jest.mock('../src/models/redis')
jest.mock('../src/utils/logger')
jest.mock('../src/services/account/vertexAiAccountService')
jest.mock('../src/utils/upstreamErrorHelper')
jest.mock('../src/utils/commonHelper')
jest.mock('../../config/config', () => ({
  session: {
    stickyTtlHours: 1,
    renewalThresholdMinutes: 0
  }
}), { virtual: true })

// Mock the crypto dependencies for vertexAiAccountService
jest.mock('../src/utils/commonHelper', () => ({
  ...jest.requireActual('../src/utils/commonHelper'),
  sortAccountsByPriority: jest.fn(),
  isActive: jest.fn(),
  isSchedulable: jest.fn(),
  createEncryptor: jest.fn(() => ({
    encrypt: jest.fn((text) => `encrypted:${text}`),
    decrypt: jest.fn((text) => text.replace('encrypted:', ''))
  }))
}))

jest.mock('google-auth-library')

const redis = require('../src/models/redis')
const logger = require('../src/utils/logger')
const vertexAiAccountService = require('../src/services/account/vertexAiAccountService')
const upstreamErrorHelper = require('../src/utils/upstreamErrorHelper')
const { sortAccountsByPriority, isActive, isSchedulable } = require('../src/utils/commonHelper')

// Mock Redis client
const mockRedisClient = {
  get: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
  ttl: jest.fn(),
  expire: jest.fn()
}

describe('UnifiedVertexScheduler', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()

    // Mock redis client
    redis.getClientSafe.mockReturnValue(mockRedisClient)

    // Mock common helper functions
    sortAccountsByPriority.mockImplementation((accounts) => [...accounts])
    isActive.mockImplementation((value) => value === true || value === 'true')
    isSchedulable.mockImplementation((value) => value !== false && value !== 'false')
  })

  describe('selectAccountForApiKey', () => {
    const mockApiKeyData = {
      name: 'test-api-key',
      id: 'test-key-id'
    }

    describe('session stickiness', () => {
      test('should return mapped account when session exists and account is available', async () => {
        const sessionHash = 'test-session-hash'
        const mockMappedAccount = { accountId: 'vertex-123', accountType: 'vertex-ai' }

        // Mock session mapping exists
        mockRedisClient.get.mockResolvedValue(JSON.stringify(mockMappedAccount))

        // Mock account is available
        const mockAccount = { id: 'vertex-123', name: 'Test Vertex Account', isActive: true }
        vertexAiAccountService.getAccount.mockResolvedValue(mockAccount)
        upstreamErrorHelper.isTempUnavailable.mockResolvedValue(false)

        const result = await UnifiedVertexScheduler.selectAccountForApiKey(mockApiKeyData, sessionHash)

        expect(result).toEqual(mockMappedAccount)
        expect(mockRedisClient.get).toHaveBeenCalledWith('vertex_session_mapping:test-session-hash')
        expect(vertexAiAccountService.getAccount).toHaveBeenCalledWith('vertex-123')
      })

      test('should delete session mapping when mapped account is no longer available', async () => {
        const sessionHash = 'test-session-hash'
        const mockMappedAccount = { accountId: 'vertex-123', accountType: 'vertex-ai' }

        // Mock session mapping exists
        mockRedisClient.get.mockResolvedValue(JSON.stringify(mockMappedAccount))

        // Mock account is not available
        vertexAiAccountService.getAccount.mockResolvedValue(null)

        // Mock fallback account selection
        vertexAiAccountService.selectAvailableAccount.mockResolvedValue({
          id: 'vertex-456',
          name: 'Fallback Account',
          isActive: true
        })

        await UnifiedVertexScheduler.selectAccountForApiKey(mockApiKeyData, sessionHash)

        expect(mockRedisClient.del).toHaveBeenCalledWith('vertex_session_mapping:test-session-hash')
      })

      test('should create new session mapping for selected account', async () => {
        const sessionHash = 'test-session-hash'

        // Mock no existing session mapping
        mockRedisClient.get.mockResolvedValue(null)

        // Mock account selection
        const mockSelectedAccount = {
          id: 'vertex-789',
          name: 'Selected Account',
          isActive: true
        }
        vertexAiAccountService.selectAvailableAccount.mockResolvedValue(mockSelectedAccount)

        const result = await UnifiedVertexScheduler.selectAccountForApiKey(mockApiKeyData, sessionHash)

        expect(result).toEqual({ accountId: 'vertex-789', accountType: 'vertex-ai' })
        expect(mockRedisClient.setex).toHaveBeenCalledWith(
          'vertex_session_mapping:test-session-hash',
          3600, // 1 hour default TTL
          JSON.stringify({ accountId: 'vertex-789', accountType: 'vertex-ai' })
        )
      })
    })

    describe('dedicated account binding', () => {
      test('should use dedicated account when API key has vertexAccountId binding', async () => {
        const apiKeyWithBinding = {
          ...mockApiKeyData,
          vertexAccountId: 'dedicated-vertex-123'
        }

        const mockDedicatedAccount = {
          id: 'dedicated-vertex-123',
          name: 'Dedicated Account',
          isActive: true,
          status: 'active'
        }
        vertexAiAccountService.getAccount.mockResolvedValue(mockDedicatedAccount)
        upstreamErrorHelper.isTempUnavailable.mockResolvedValue(false)

        const result = await UnifiedVertexScheduler.selectAccountForApiKey(apiKeyWithBinding)

        expect(result).toEqual({ accountId: 'dedicated-vertex-123', accountType: 'vertex-ai' })
        expect(vertexAiAccountService.getAccount).toHaveBeenCalledWith('dedicated-vertex-123')
      })

      test('should fallback to pool when dedicated account is not available', async () => {
        const apiKeyWithBinding = {
          ...mockApiKeyData,
          vertexAccountId: 'unavailable-vertex-123'
        }

        // Mock dedicated account not available
        vertexAiAccountService.getAccount.mockResolvedValue(null)

        // Mock fallback selection
        const mockFallbackAccount = {
          id: 'fallback-vertex-456',
          name: 'Fallback Account',
          isActive: true
        }
        vertexAiAccountService.selectAvailableAccount.mockResolvedValue(mockFallbackAccount)

        const result = await UnifiedVertexScheduler.selectAccountForApiKey(apiKeyWithBinding)

        expect(result).toEqual({ accountId: 'fallback-vertex-456', accountType: 'vertex-ai' })
      })
    })

    test('should throw error when no accounts available', async () => {
      vertexAiAccountService.selectAvailableAccount.mockResolvedValue(null)

      await expect(
        UnifiedVertexScheduler.selectAccountForApiKey(mockApiKeyData)
      ).rejects.toThrow('No available Vertex AI accounts')
    })
  })

  describe('rate limiting', () => {
    test('isAccountRateLimited should return false for healthy account', async () => {
      const mockAccount = {
        id: 'vertex-123',
        rateLimitStatus: null,
        rateLimitedAt: null
      }
      vertexAiAccountService.getAccount.mockResolvedValue(mockAccount)

      const result = await UnifiedVertexScheduler.isAccountRateLimited('vertex-123')

      expect(result).toBe(false)
    })

    test('isAccountRateLimited should return true for actively rate limited account', async () => {
      const mockAccount = {
        id: 'vertex-123',
        rateLimitStatus: 'limited',
        rateLimitedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 min ago
        rateLimitDuration: 60 // 60 minutes
      }
      vertexAiAccountService.getAccount.mockResolvedValue(mockAccount)

      const result = await UnifiedVertexScheduler.isAccountRateLimited('vertex-123')

      expect(result).toBe(true)
    })

    test('markAccountRateLimited should set rate limit and delete session mapping', async () => {
      const accountId = 'vertex-123'
      const sessionHash = 'test-session'

      vertexAiAccountService.setAccountRateLimited = jest.fn().mockResolvedValue(true)

      const result = await UnifiedVertexScheduler.markAccountRateLimited(
        accountId, 'vertex-ai', sessionHash
      )

      expect(result).toEqual({ success: true })
      expect(vertexAiAccountService.setAccountRateLimited).toHaveBeenCalledWith(accountId, true)
      expect(mockRedisClient.del).toHaveBeenCalledWith('vertex_session_mapping:test-session')
    })

    test('removeAccountRateLimit should clear rate limit', async () => {
      const accountId = 'vertex-123'

      vertexAiAccountService.setAccountRateLimited = jest.fn().mockResolvedValue(true)

      const result = await UnifiedVertexScheduler.removeAccountRateLimit(accountId, 'vertex-ai')

      expect(result).toEqual({ success: true })
      expect(vertexAiAccountService.setAccountRateLimited).toHaveBeenCalledWith(accountId, false)
    })
  })

  describe('account availability', () => {
    test('_isAccountAvailable should return true for healthy account', async () => {
      const mockAccount = {
        id: 'vertex-123',
        isActive: true,
        status: 'active',
        schedulable: true
      }
      vertexAiAccountService.getAccount.mockResolvedValue(mockAccount)
      upstreamErrorHelper.isTempUnavailable.mockResolvedValue(false)
      UnifiedVertexScheduler.isAccountRateLimited = jest.fn().mockResolvedValue(false)

      const result = await UnifiedVertexScheduler._isAccountAvailable('vertex-123', 'vertex-ai')

      expect(result).toBe(true)
    })

    test('_isAccountAvailable should return false for inactive account', async () => {
      const mockAccount = {
        id: 'vertex-123',
        isActive: false,
        status: 'active',
        schedulable: true
      }
      vertexAiAccountService.getAccount.mockResolvedValue(mockAccount)

      const result = await UnifiedVertexScheduler._isAccountAvailable('vertex-123', 'vertex-ai')

      expect(result).toBe(false)
    })

    test('_isAccountAvailable should return false for temporarily unavailable account', async () => {
      const mockAccount = {
        id: 'vertex-123',
        isActive: true,
        status: 'active',
        schedulable: true
      }
      vertexAiAccountService.getAccount.mockResolvedValue(mockAccount)
      upstreamErrorHelper.isTempUnavailable.mockResolvedValue(true)

      const result = await UnifiedVertexScheduler._isAccountAvailable('vertex-123', 'vertex-ai')

      expect(result).toBe(false)
    })
  })
})