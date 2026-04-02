const vertexAiAccountService = require('../src/services/account/vertexAiAccountService')

// Mock dependencies
jest.mock('../src/models/redis')
jest.mock('../src/utils/logger')
jest.mock('google-auth-library')

const redis = require('../src/models/redis')
const logger = require('../src/utils/logger')
const { GoogleAuth } = require('google-auth-library')

describe('vertexAiAccountService', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  describe('validateServiceAccountJson', () => {
    const validServiceAccount = {
      type: 'service_account',
      project_id: 'test-project-123',
      private_key_id: 'key123',
      private_key: '-----BEGIN PRIVATE KEY-----\nMIIEvQ...test...key\n-----END PRIVATE KEY-----\n',
      client_email: 'test-service@test-project-123.iam.gserviceaccount.com',
      client_id: '123456789012345678901',
      auth_uri: 'https://accounts.google.com/o/oauth2/auth',
      token_uri: 'https://oauth2.googleapis.com/token'
    }

    test('returns valid: true for valid Service Account JSON', () => {
      const result = vertexAiAccountService.validateServiceAccountJson(validServiceAccount)
      expect(result.valid).toBe(true)
    })

    test('returns valid: false with descriptive error for missing required fields', () => {
      const invalidJson = { ...validServiceAccount }
      delete invalidJson.project_id

      const result = vertexAiAccountService.validateServiceAccountJson(invalidJson)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('project_id')
    })

    test('returns valid: false when type is not service_account', () => {
      const invalidJson = { ...validServiceAccount, type: 'user' }

      const result = vertexAiAccountService.validateServiceAccountJson(invalidJson)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('type')
    })

    test('returns valid: false for bad private_key format', () => {
      const invalidJson = { ...validServiceAccount, private_key: 'invalid-key-format' }

      const result = vertexAiAccountService.validateServiceAccountJson(invalidJson)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('private_key')
    })

    test('returns valid: false for bad client_email format', () => {
      const invalidJson = { ...validServiceAccount, client_email: 'invalid-email@wrong-domain.com' }

      const result = vertexAiAccountService.validateServiceAccountJson(invalidJson)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('client_email')
    })
  })

  describe('createAccount', () => {
    test('stores encrypted serviceAccountJson in Redis with AES-256-CBC', async () => {
      const serviceAccountJson = {
        type: 'service_account',
        project_id: 'test-project-123',
        private_key: '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----\n',
        client_email: 'test@test-project-123.iam.gserviceaccount.com',
        client_id: '123',
        auth_uri: 'https://accounts.google.com/o/oauth2/auth',
        token_uri: 'https://oauth2.googleapis.com/token'
      }

      redis.hset = jest.fn().mockResolvedValue(true)
      redis.sadd = jest.fn().mockResolvedValue(true)

      await vertexAiAccountService.createAccount({
        name: 'Test Account',
        projectId: 'test-project-123',
        location: 'us-central1',
        serviceAccountJson
      })

      expect(redis.hset).toHaveBeenCalledWith(
        expect.stringMatching(/^vertex_ai:account:/),
        expect.objectContaining({
          serviceAccountJson: expect.stringMatching(/:/) // encrypted format with IV
        })
      )
    })

    test('calls validateServiceAccountJson and rejects invalid JSON', async () => {
      const invalidJson = { type: 'user' }

      await expect(
        vertexAiAccountService.createAccount({
          name: 'Test Account',
          projectId: 'test-project',
          serviceAccountJson: invalidJson
        })
      ).rejects.toThrow('Invalid Service Account JSON')
    })
  })

  describe('getAllAccounts', () => {
    test('strips serviceAccountJson from returned accounts', async () => {
      redis.smembers = jest.fn().mockResolvedValue(['account1'])
      redis.hgetall = jest.fn().mockResolvedValue({
        id: 'account1',
        name: 'Test Account',
        serviceAccountJson: 'encrypted-data',
        projectId: 'test-project'
      })

      const accounts = await vertexAiAccountService.getAllAccounts()

      expect(accounts).toHaveLength(1)
      expect(accounts[0]).not.toHaveProperty('serviceAccountJson')
      expect(accounts[0]).toHaveProperty('name', 'Test Account')
      expect(accounts[0]).toHaveProperty('platform', 'vertex-ai')
    })
  })

  describe('deleteAccount', () => {
    test('removes from Redis index and shared accounts set', async () => {
      redis.hdel = jest.fn().mockResolvedValue(true)
      redis.srem = jest.fn().mockResolvedValue(true)

      await vertexAiAccountService.deleteAccount('test-id')

      expect(redis.hdel).toHaveBeenCalledWith('vertex_ai:account:test-id')
      expect(redis.srem).toHaveBeenCalledWith('vertex_ai:account:index', 'test-id')
      expect(redis.srem).toHaveBeenCalledWith('shared_vertex_ai_accounts', 'test-id')
    })
  })

  describe('generateAccessToken', () => {
    test('uses google-auth-library to produce access token', async () => {
      const serviceAccountJson = {
        type: 'service_account',
        project_id: 'test-project-123',
        private_key: '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----\n',
        client_email: 'test@test-project-123.iam.gserviceaccount.com',
        client_id: '123',
        auth_uri: 'https://accounts.google.com/o/oauth2/auth',
        token_uri: 'https://oauth2.googleapis.com/token'
      }

      const mockClient = {
        getAccessToken: jest.fn().mockResolvedValue({
          token: 'ya29.test-token',
          res: { data: { expires_in: 3600 } }
        })
      }

      GoogleAuth.mockImplementation(() => ({
        getClient: jest.fn().mockResolvedValue(mockClient)
      }))

      const result = await vertexAiAccountService.generateAccessToken(serviceAccountJson)

      expect(result).toHaveProperty('accessToken', 'ya29.test-token')
      expect(result).toHaveProperty('expiresAt')
      expect(GoogleAuth).toHaveBeenCalledWith({
        credentials: serviceAccountJson,
        scopes: ['https://www.googleapis.com/auth/cloud-platform']
      })
    })
  })
})
