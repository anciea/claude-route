// Mock logger to avoid console output during tests
jest.mock('../src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  success: jest.fn(),
  security: jest.fn()
}))

// Mock config
jest.mock('../config/config', () => ({
  googleOAuth: {
    enabled: true,
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    callbackUrl: 'http://localhost:3000/auth/google/callback',
    scopes: ['openid', 'email', 'profile'],
    allowedDomains: ['example.com']
  }
}))

// Mock axios
jest.mock('axios')

const axios = require('axios')

describe('GoogleOAuthService', () => {
  let googleOAuthService

  beforeEach(() => {
    jest.clearAllMocks()
  })

  beforeAll(() => {
    googleOAuthService = require('../src/services/googleOAuthService')
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('generateAuthUrl', () => {
    it('should return URL string starting with correct Google OAuth URL', () => {
      const result = googleOAuthService.generateAuthUrl()

      expect(result).toBeDefined()
      expect(result.authUrl).toMatch(/^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth/)
    })

    it('should include all required URL parameters', () => {
      const result = googleOAuthService.generateAuthUrl()
      const url = new URL(result.authUrl)

      expect(url.searchParams.get('client_id')).toBe('test-client-id')
      expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:3000/auth/google/callback')
      expect(url.searchParams.get('scope')).toBe('openid email profile')
      expect(url.searchParams.get('response_type')).toBe('code')
      expect(url.searchParams.get('access_type')).toBe('offline')
      expect(url.searchParams.get('prompt')).toBe('consent')
      expect(url.searchParams.get('state')).toBeDefined()
    })

    it('should include a cryptographically random state parameter', () => {
      const result1 = googleOAuthService.generateAuthUrl()
      const result2 = googleOAuthService.generateAuthUrl()

      const url1 = new URL(result1.authUrl)
      const url2 = new URL(result2.authUrl)

      expect(url1.searchParams.get('state')).not.toBe(url2.searchParams.get('state'))
      expect(result1.state).toBe(url1.searchParams.get('state'))
      expect(result2.state).toBe(url2.searchParams.get('state'))
    })
  })

  describe('exchangeCodeForTokens', () => {
    it('should POST to correct endpoint with correct parameters', async () => {
      const mockResponse = {
        data: {
          access_token: 'test-access-token',
          id_token: 'test-id-token',
          refresh_token: 'test-refresh-token',
          expires_in: 3600
        }
      }
      axios.post.mockResolvedValueOnce(mockResponse)

      const result = await googleOAuthService.exchangeCodeForTokens('test-code')

      expect(axios.post).toHaveBeenCalledWith(
        'https://oauth2.googleapis.com/token',
        {
          grant_type: 'authorization_code',
          code: 'test-code',
          redirect_uri: 'http://localhost:3000/auth/google/callback',
          client_id: 'test-client-id',
          client_secret: 'test-client-secret'
        },
        { timeout: 30000 }
      )

      expect(result).toEqual({
        accessToken: 'test-access-token',
        idToken: 'test-id-token',
        refreshToken: 'test-refresh-token',
        expiresAt: expect.any(Number)
      })
    })

    it('should throw descriptive error on HTTP failure', async () => {
      const mockError = {
        response: {
          status: 400,
          data: { error: 'invalid_grant' }
        }
      }
      axios.post.mockRejectedValueOnce(mockError)

      await expect(googleOAuthService.exchangeCodeForTokens('invalid-code'))
        .rejects
        .toThrow('HTTP 400')
    })
  })

  describe('getUserProfile', () => {
    it('should GET from correct endpoint with Authorization header', async () => {
      const mockResponse = {
        data: {
          id: '12345',
          email: 'test@example.com',
          name: 'Test User',
          given_name: 'Test',
          family_name: 'User',
          picture: 'https://example.com/photo.jpg',
          verified_email: true
        }
      }
      axios.get.mockResolvedValueOnce(mockResponse)

      const result = await googleOAuthService.getUserProfile('test-access-token')

      expect(axios.get).toHaveBeenCalledWith(
        'https://www.googleapis.com/oauth2/v2/userinfo',
        {
          headers: { Authorization: 'Bearer test-access-token' },
          timeout: 30000
        }
      )

      expect(result).toEqual({
        googleId: '12345',
        email: 'test@example.com',
        name: 'Test User',
        givenName: 'Test',
        familyName: 'User',
        picture: 'https://example.com/photo.jpg',
        emailVerified: true
      })
    })

    it('should throw error on HTTP failure', async () => {
      const mockError = {
        response: {
          status: 401,
          data: { error: 'invalid_token' }
        }
      }
      axios.get.mockRejectedValueOnce(mockError)

      await expect(googleOAuthService.getUserProfile('invalid-token'))
        .rejects
        .toThrow('HTTP 401')
    })
  })

  describe('validateToken', () => {
    it('should verify token with Google tokeninfo endpoint', async () => {
      const mockResponse = {
        data: {
          aud: 'test-client-id',
          sub: '12345',
          email: 'test@example.com',
          exp: Math.floor(Date.now() / 1000) + 3600
        }
      }
      axios.get.mockResolvedValueOnce(mockResponse)

      const result = await googleOAuthService.validateToken('test-id-token')

      expect(axios.get).toHaveBeenCalledWith(
        'https://oauth2.googleapis.com/tokeninfo?id_token=test-id-token',
        { timeout: 30000 }
      )

      expect(result).toEqual(mockResponse.data)
    })

    it('should throw error when aud does not match client ID', async () => {
      const mockResponse = {
        data: {
          aud: 'wrong-client-id',
          sub: '12345'
        }
      }
      axios.get.mockResolvedValueOnce(mockResponse)

      await expect(googleOAuthService.validateToken('test-id-token'))
        .rejects
        .toThrow('Token audience mismatch')
    })

    it('should throw error on HTTP failure', async () => {
      const mockError = {
        response: {
          status: 400,
          data: { error: 'invalid_token' }
        }
      }
      axios.get.mockRejectedValueOnce(mockError)

      await expect(googleOAuthService.validateToken('invalid-token'))
        .rejects
        .toThrow('HTTP 400')
    })
  })

  describe('validateDomain', () => {
    it('should return true when allowedDomains is empty (all domains allowed)', () => {
      // Create a new service instance with empty allowedDomains for this test
      const GoogleOAuthService = jest.requireActual('../src/services/googleOAuthService.js').constructor
      const testService = new GoogleOAuthService()
      testService.config = { allowedDomains: [] }

      const result = testService.validateDomain('user@anydomain.com')
      expect(result).toBe(true)
    })

    it('should return true when email domain is in allowedDomains list', () => {
      const result = googleOAuthService.validateDomain('user@example.com')
      expect(result).toBe(true)
    })

    it('should return false when email domain is NOT in allowedDomains list', () => {
      const result = googleOAuthService.validateDomain('user@forbidden.com')
      expect(result).toBe(false)
    })
  })
})