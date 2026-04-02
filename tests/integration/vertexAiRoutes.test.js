const request = require('supertest')
const express = require('express')

// Mock all required dependencies before requiring the routes
jest.mock('../../src/services/account/vertexAiAccountService', () => ({
  getAccount: jest.fn(),
  getAccessToken: jest.fn(),
  markAccountUsed: jest.fn()
}))

jest.mock('../../src/services/scheduler/unifiedVertexScheduler', () => {
  return jest.fn().mockImplementation(() => ({
    selectAccountForApiKey: jest.fn()
  }))
})

jest.mock('../../src/services/relay/vertexRelayService', () => ({
  sendVertexRequest: jest.fn()
}))

jest.mock('../../src/services/apiKeyService', () => ({
  hasPermission: jest.fn(),
  recordUsageWithDetails: jest.fn()
}))

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  api: jest.fn()
}))

jest.mock('../../src/services/relay/claudeRelayService', () => ({
  relayRequest: jest.fn(),
  relayStreamRequestWithUsageCapture: jest.fn()
}))

jest.mock('../../src/services/relay/claudeConsoleRelayService', () => ({
  relayRequest: jest.fn()
}))

jest.mock('../../src/services/relay/bedrockRelayService', () => ({
  relayRequest: jest.fn()
}))

jest.mock('../../src/services/relay/ccrRelayService', () => ({
  relayRequest: jest.fn()
}))

jest.mock('../../src/services/scheduler/unifiedClaudeScheduler', () => ({
  selectAccountForApiKey: jest.fn()
}))

jest.mock('../../src/middleware/auth', () => ({
  authenticateApiKey: (req, res, next) => {
    req.apiKey = {
      id: 'test-key-id',
      name: 'test-key',
      permissions: ['claude'],
      vertexAccountId: 'test-vertex-account'
    }
    req.rateLimitInfo = { remaining: 100 }
    next()
  }
}))

jest.mock('../../src/utils/sessionHelper', () => ({
  calculateSessionHash: jest.fn().mockReturnValue('test-session-hash')
}))

jest.mock('../../src/utils/rateLimitHelper', () => ({
  updateRateLimitCounters: jest.fn()
}))

jest.mock('../../src/services/claudeRelayConfigService', () => ({
  getSessionBindingErrorMessage: jest.fn()
}))

jest.mock('../../src/services/account/claudeAccountService', () => ({
  getAccount: jest.fn()
}))

jest.mock('../../src/services/account/claudeConsoleAccountService', () => ({
  getAccount: jest.fn()
}))

jest.mock('../../src/services/account/bedrockAccountService', () => ({
  getAccount: jest.fn()
}))

jest.mock('../../src/utils/modelHelper', () => ({
  getEffectiveModel: jest.fn().mockReturnValue('claude-opus-4-6'),
  parseVendorPrefixedModel: jest.fn()
}))

jest.mock('../../src/utils/warmupInterceptor', () => ({
  isWarmupRequest: jest.fn().mockReturnValue(false),
  buildMockWarmupResponse: jest.fn(),
  sendMockWarmupStream: jest.fn()
}))

jest.mock('../../src/handlers/geminiHandlers', () => ({
  handleStandardGenerateContent: jest.fn(),
  handleStandardStreamGenerateContent: jest.fn()
}))

jest.mock('../../src/services/geminiToOpenAI', () => {
  return jest.fn().mockImplementation(() => ({
    createStreamState: jest.fn(),
    convertStreamChunk: jest.fn(),
    convertResponse: jest.fn()
  }))
})

jest.mock('../../src/routes/openaiRoutes', () => ({
  handleResponses: jest.fn()
}))

jest.mock('../../src/routes/openaiClaudeRoutes', () => ({
  handleChatCompletion: jest.fn()
}))

const vertexAiAccountService = require('../../src/services/account/vertexAiAccountService')
const UnifiedVertexScheduler = require('../../src/services/scheduler/unifiedVertexScheduler')
const vertexRelayService = require('../../src/services/relay/vertexRelayService')
const apiKeyService = require('../../src/services/apiKeyService')

describe('Vertex AI Routes Integration', () => {
  let app
  let unifiedVertexSchedulerInstance
  let unifiedClaudeScheduler

  beforeEach(() => {
    jest.clearAllMocks()

    // Create fresh app instance
    app = express()
    app.use(express.json())

    // Get mocked services
    unifiedClaudeScheduler = require('../../src/services/scheduler/unifiedClaudeScheduler')

    // Mock scheduler instance
    unifiedVertexSchedulerInstance = {
      selectAccountForApiKey: jest.fn()
    }
    UnifiedVertexScheduler.mockImplementation(() => unifiedVertexSchedulerInstance)

    // Mock API key permission check to allow Claude access
    apiKeyService.hasPermission.mockReturnValue(true)

    // Add routes after mocking
    const apiRoutes = require('../../src/routes/api')
    const unifiedRoutes = require('../../src/routes/unified')

    app.use('/', apiRoutes)
    app.use('/', unifiedRoutes)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('Claude API endpoint (/v1/messages)', () => {
    test('should accept Claude 4.6 model requests', async () => {
      // Setup: Mock successful vertex account selection first, then fallback
      unifiedVertexSchedulerInstance.selectAccountForApiKey.mockResolvedValue({
        accountId: 'vertex-account-123',
        accountType: 'vertex-ai'
      })

      // Mock the unified claude scheduler to not be called (vertex succeeds)
      unifiedClaudeScheduler.selectAccountForApiKey = jest.fn()

      vertexRelayService.sendVertexRequest.mockResolvedValue({
        id: 'msg-123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello from Vertex AI!' }],
        model: 'claude-opus-4-6',
        usage: { input_tokens: 10, output_tokens: 5 }
      })

      const requestBody = {
        model: 'claude-opus-4-6',
        messages: [
          { role: 'user', content: 'Hello' }
        ],
        max_tokens: 100,
        temperature: 0.7
      }

      const response = await request(app)
        .post('/v1/messages')
        .send(requestBody)

      // For TDD GREEN phase: verify basic functionality works
      expect(response.status).toBeLessThan(500) // Not a server error

      // The integration should have attempted to use vertex scheduler for this model
      // This verifies that our integration code is being called
      expect(unifiedVertexSchedulerInstance.selectAccountForApiKey).toHaveBeenCalled()

      // And should have called the vertex relay service
      expect(vertexRelayService.sendVertexRequest).toHaveBeenCalled()
    })

    test('should verify Vertex AI account selection through unified scheduler', async () => {
      // Setup: Mock account selection
      unifiedVertexSchedulerInstance.selectAccountForApiKey.mockResolvedValue({
        accountId: 'vertex-account-456',
        accountType: 'vertex-ai'
      })

      vertexRelayService.sendVertexRequest.mockResolvedValue({
        id: 'msg-456',
        content: [{ type: 'text', text: 'Response' }]
      })

      await request(app)
        .post('/v1/messages')
        .send({
          model: 'claude-sonnet-4-6',
          messages: [{ role: 'user', content: 'Test' }]
        })
        .expect(200)

      // Verify scheduler was called with correct parameters
      expect(unifiedVertexSchedulerInstance.selectAccountForApiKey).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'test-key-id',
          name: 'test-key',
          vertexAccountId: 'test-vertex-account'
        }),
        expect.any(String), // session hash
        'claude-sonnet-4-6',
        undefined
      )
    })

    test('should handle streaming response correctly', async () => {
      // Setup: Mock streaming response
      unifiedVertexSchedulerInstance.selectAccountForApiKey.mockResolvedValue({
        accountId: 'vertex-account-789',
        accountType: 'vertex-ai'
      })

      vertexRelayService.sendVertexRequest.mockResolvedValue({
        // Mock streaming response would be handled differently in real implementation
        stream: true
      })

      const response = await request(app)
        .post('/v1/messages')
        .send({
          model: 'claude-haiku-4-5',
          messages: [{ role: 'user', content: 'Stream test' }],
          stream: true
        })

      // Verify streaming was requested
      expect(vertexRelayService.sendVertexRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          stream: true,
          model: 'claude-haiku-4-5'
        })
      )

      expect(response.status).toBe(200)
    })

    test('should handle authentication error gracefully', async () => {
      // Setup: Mock authentication failure
      unifiedVertexSchedulerInstance.selectAccountForApiKey.mockRejectedValue(
        Object.assign(new Error('Authentication failed'), {
          status: 401,
          code: 'VERTEX_AUTH_FAILED'
        })
      )

      const response = await request(app)
        .post('/v1/messages')
        .send({
          model: 'claude-opus-4-6',
          messages: [{ role: 'user', content: 'Test' }]
        })

      // Should handle error gracefully
      expect(response.status).toBeGreaterThanOrEqual(400)
      expect(response.body).toHaveProperty('error')
    })

    test('should handle account unavailability', async () => {
      // Setup: Mock no available accounts
      unifiedVertexSchedulerInstance.selectAccountForApiKey.mockRejectedValue(
        Object.assign(new Error('No Vertex AI accounts available'), {
          code: 'NO_VERTEX_ACCOUNTS'
        })
      )

      const response = await request(app)
        .post('/v1/messages')
        .send({
          model: 'claude-sonnet-4-6',
          messages: [{ role: 'user', content: 'Test' }]
        })

      expect(response.status).toBeGreaterThanOrEqual(400)
      expect(response.body.error).toBeDefined()
    })

    test('should verify sticky session behavior with Vertex AI accounts', async () => {
      // Setup: Mock account selection for session continuity
      unifiedVertexSchedulerInstance.selectAccountForApiKey.mockResolvedValue({
        accountId: 'vertex-sticky-account',
        accountType: 'vertex-ai'
      })

      vertexRelayService.sendVertexRequest.mockResolvedValue({
        id: 'msg-session-test',
        content: [{ type: 'text', text: 'Session response' }]
      })

      // First request to establish session
      await request(app)
        .post('/v1/messages')
        .send({
          model: 'claude-opus-4-6',
          messages: [{ role: 'user', content: 'First message' }]
        })
        .expect(200)

      // Second request should use same session
      await request(app)
        .post('/v1/messages')
        .send({
          model: 'claude-opus-4-6',
          messages: [
            { role: 'user', content: 'First message' },
            { role: 'assistant', content: 'Session response' },
            { role: 'user', content: 'Second message' }
          ]
        })
        .expect(200)

      // Verify scheduler was called twice with session hash
      expect(unifiedVertexSchedulerInstance.selectAccountForApiKey).toHaveBeenCalledTimes(2)

      // Both calls should have session hash (same content should produce same hash)
      const firstCall = unifiedVertexSchedulerInstance.selectAccountForApiKey.mock.calls[0]
      const secondCall = unifiedVertexSchedulerInstance.selectAccountForApiKey.mock.calls[1]

      expect(firstCall[1]).toBeTruthy() // session hash should be present
      expect(secondCall[1]).toBeTruthy()
    })
  })

  describe('Unified API endpoint', () => {
    test('should route Claude 4.6 models to Vertex AI backend', async () => {
      // Setup: Mock successful vertex request
      vertexRelayService.sendVertexRequest.mockResolvedValue({
        id: 'unified-msg-123',
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Unified response from Vertex AI'
            }
          }
        ],
        model: 'claude-opus-4-6'
      })

      apiKeyService.hasPermission.mockReturnValue(true)

      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          model: 'claude-opus-4-6',
          messages: [{ role: 'user', content: 'Hello unified API' }],
          temperature: 0.5,
          max_tokens: 50
        })
        .expect(200)

      // Verify Claude permission was checked
      expect(apiKeyService.hasPermission).toHaveBeenCalledWith(
        ['claude'],
        'claude'
      )

      // Verify Vertex relay service was called
      expect(vertexRelayService.sendVertexRequest).toHaveBeenCalledWith({
        messages: [{ role: 'user', content: 'Hello unified API' }],
        model: 'claude-opus-4-6',
        temperature: 0.5,
        maxTokens: 50,
        stream: false,
        apiKeyId: 'test-key-id',
        signal: expect.anything(),
        accountId: null // Will be selected by service
      })

      expect(response.body.model).toBe('claude-opus-4-6')
    })

    test('should handle streaming in unified API', async () => {
      // Setup: Mock streaming response
      const mockAsyncIterator = async function* () {
        yield { id: 'chunk-1', choices: [{ delta: { content: 'Hello' } }] }
        yield { id: 'chunk-2', choices: [{ delta: { content: ' world!' } }] }
      }

      vertexRelayService.sendVertexRequest.mockResolvedValue(mockAsyncIterator())
      apiKeyService.hasPermission.mockReturnValue(true)

      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          model: 'claude-sonnet-4-6',
          messages: [{ role: 'user', content: 'Stream test' }],
          stream: true
        })

      expect(response.status).toBe(200)
      expect(response.headers['content-type']).toContain('text/event-stream')

      // Verify streaming was requested
      expect(vertexRelayService.sendVertexRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          stream: true,
          model: 'claude-sonnet-4-6'
        })
      )
    })

    test('should handle permission denied for unified API', async () => {
      // Setup: Mock permission denial
      apiKeyService.hasPermission.mockReturnValue(false)

      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          model: 'claude-opus-4-6',
          messages: [{ role: 'user', content: 'Test' }]
        })
        .expect(403)

      expect(response.body.error).toMatchObject({
        message: 'This API key does not have permission to access Claude',
        type: 'permission_denied',
        code: 'permission_denied'
      })

      // Vertex service should not be called
      expect(vertexRelayService.sendVertexRequest).not.toHaveBeenCalled()
    })

    test('should handle Vertex AI authentication errors in unified API', async () => {
      // Setup: Mock authentication error
      vertexRelayService.sendVertexRequest.mockRejectedValue(
        Object.assign(new Error('authentication failed'), {
          status: 401
        })
      )

      apiKeyService.hasPermission.mockReturnValue(true)

      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          model: 'claude-haiku-4-5',
          messages: [{ role: 'user', content: 'Auth test' }]
        })
        .expect(401)

      expect(response.body.error).toMatchObject({
        message: 'Vertex AI authentication failed. Please check your account configuration.',
        type: 'authentication_error',
        code: 'vertex_auth_failed'
      })
    })

    test('should handle Vertex AI API errors in unified API', async () => {
      // Setup: Mock API error
      vertexRelayService.sendVertexRequest.mockRejectedValue(
        new Error('API quota exceeded')
      )

      apiKeyService.hasPermission.mockReturnValue(true)

      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          model: 'claude-sonnet-4-6',
          messages: [{ role: 'user', content: 'Error test' }]
        })
        .expect(500)

      expect(response.body.error).toMatchObject({
        message: 'API quota exceeded',
        type: 'api_error',
        code: 'vertex_api_error'
      })
    })
  })
})