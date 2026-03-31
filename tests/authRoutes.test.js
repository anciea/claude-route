// Mock dependencies to avoid external calls and console output during tests
jest.mock('../src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  security: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn()
}))

jest.mock('../src/services/googleOAuthService', () => ({
  generateAuthUrl: jest.fn(),
  exchangeCodeForTokens: jest.fn(),
  getUserProfile: jest.fn(),
  validateDomain: jest.fn()
}))

jest.mock('../src/services/userService', () => ({
  createOrUpdateUser: jest.fn(),
  recordUserLogin: jest.fn(),
  createUserSession: jest.fn()
}))

jest.mock('../src/services/googleLoginService', () => ({
  handleGoogleLogin: jest.fn()
}))

jest.mock('../src/models/redis', () => ({
  setex: jest.fn(),
  get: jest.fn(),
  del: jest.fn()
}))

jest.mock('../config/config', () => ({
  googleOAuth: {
    enabled: true
  },
  userManagement: {
    enabled: true,
    defaultUserRole: 'user'
  }
}))

const request = require('supertest')
const express = require('express')

describe('Auth Routes', () => {
  let authRoutes, app
  let googleOAuthService, userService, googleLoginService, redis, config

  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()

    // Get mocked modules
    googleOAuthService = require('../src/services/googleOAuthService')
    userService = require('../src/services/userService')
    googleLoginService = require('../src/services/googleLoginService')
    redis = require('../src/models/redis')
    config = require('../config/config')

    // Reset config to default values
    config.googleOAuth = {
      enabled: true
    }
    config.userManagement = {
      enabled: true,
      defaultUserRole: 'user'
    }

    // Create new app instance for each test
    app = express()
    app.use(express.json())

    // Require authRoutes after mocks are set up
    authRoutes = require('../src/routes/authRoutes')
    app.use('/auth', authRoutes)
  })

  describe('GET /google', () => {
    it('should return 503 when Google OAuth is disabled', async () => {
      config.googleOAuth.enabled = false

      const response = await request(app).get('/auth/google')

      expect(response.status).toBe(503)
      expect(response.body).toEqual({
        error: 'Service unavailable',
        message: 'Google OAuth2 authentication is not enabled'
      })
    })

    it('should return 503 when user management is disabled', async () => {
      config.googleOAuth.enabled = true
      config.userManagement.enabled = false

      const response = await request(app).get('/auth/google')

      expect(response.status).toBe(503)
      expect(response.body).toEqual({
        error: 'Service unavailable',
        message: 'Google OAuth2 authentication is not enabled'
      })
    })

    it('should redirect to Google authorization URL when enabled', async () => {
      config.googleOAuth.enabled = true
      config.userManagement.enabled = true

      const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=test'
      const state = 'test-state-123'
      googleOAuthService.generateAuthUrl.mockReturnValue({ authUrl, state })
      redis.setex.mockResolvedValue('OK')

      const response = await request(app).get('/auth/google')

      expect(response.status).toBe(302)
      expect(response.header.location).toBe(authUrl)
      expect(googleOAuthService.generateAuthUrl).toHaveBeenCalled()
      expect(redis.setex).toHaveBeenCalledWith(
        `oauth_state:${state}`,
        600,
        expect.stringContaining('createdAt')
      )
    })
  })

  describe('GET /google/callback', () => {
    it('should return 400 when authorization code is missing', async () => {
      const response = await request(app).get('/auth/google/callback')

      expect(response.status).toBe(400)
      expect(response.body).toEqual({
        error: 'Missing authorization code',
        message: 'Authorization code is required'
      })
    })

    it('should return 403 when state parameter is invalid', async () => {
      redis.get.mockResolvedValue(null) // State not found in Redis

      const response = await request(app)
        .get('/auth/google/callback')
        .query({ code: 'test-code', state: 'invalid-state' })

      expect(response.status).toBe(403)
      expect(response.body).toEqual({
        error: 'Invalid state parameter',
        message: 'State validation failed. Please try logging in again.'
      })
    })

    it('should return 401 when code exchange fails', async () => {
      redis.get.mockResolvedValue(JSON.stringify({ createdAt: new Date().toISOString() }))
      googleOAuthService.exchangeCodeForTokens.mockRejectedValue(new Error('Token exchange failed'))

      const response = await request(app)
        .get('/auth/google/callback')
        .query({ code: 'test-code', state: 'valid-state' })

      expect(response.status).toBe(401)
      expect(response.body).toEqual({
        error: 'Authentication failed',
        message: 'Failed to exchange authorization code'
      })
    })

    it('should return 401 when user profile fetch fails', async () => {
      const tokenData = { accessToken: 'access-token' }
      redis.get.mockResolvedValue(JSON.stringify({ createdAt: new Date().toISOString() }))
      googleOAuthService.exchangeCodeForTokens.mockResolvedValue(tokenData)
      googleOAuthService.getUserProfile.mockRejectedValue(new Error('Profile fetch failed'))

      const response = await request(app)
        .get('/auth/google/callback')
        .query({ code: 'test-code', state: 'valid-state' })

      expect(response.status).toBe(401)
      expect(response.body).toEqual({
        error: 'Authentication failed',
        message: 'Failed to retrieve user profile'
      })
    })

    it('should return 403 when user email domain is not allowed', async () => {
      const tokenData = { accessToken: 'access-token' }
      const profile = { email: 'test@unauthorized.com', googleId: '123' }
      redis.get.mockResolvedValue(JSON.stringify({ createdAt: new Date().toISOString() }))
      googleOAuthService.exchangeCodeForTokens.mockResolvedValue(tokenData)
      googleOAuthService.getUserProfile.mockResolvedValue(profile)
      googleOAuthService.validateDomain.mockReturnValue(false)

      const response = await request(app)
        .get('/auth/google/callback')
        .query({ code: 'test-code', state: 'valid-state' })

      expect(response.status).toBe(403)
      expect(response.body).toEqual({
        error: 'Domain not allowed',
        message: 'Your email domain is not authorized'
      })
    })

    it('should return 403 when user account is disabled', async () => {
      const tokenData = { accessToken: 'access-token' }
      const profile = {
        googleId: '123',
        email: 'test@allowed.com',
        name: 'Test User',
        givenName: 'Test',
        familyName: 'User',
        picture: 'https://example.com/pic.jpg'
      }
      const user = { id: 1, isActive: false }

      redis.get.mockResolvedValue(JSON.stringify({ createdAt: new Date().toISOString() }))
      googleOAuthService.exchangeCodeForTokens.mockResolvedValue(tokenData)
      googleOAuthService.getUserProfile.mockResolvedValue(profile)
      googleOAuthService.validateDomain.mockReturnValue(true)
      googleLoginService.handleGoogleLogin.mockResolvedValue({
        user,
        isNewUser: false,
        apiKey: null,
        apiKeyWarning: null
      })

      const response = await request(app)
        .get('/auth/google/callback')
        .query({ code: 'test-code', state: 'valid-state' })

      expect(response.status).toBe(403)
      expect(response.body).toEqual({
        error: 'Account disabled',
        message: 'Your account has been disabled'
      })
    })

    it('should return 200 with user and session token on successful authentication', async () => {
      const tokenData = { accessToken: 'access-token' }
      const profile = {
        googleId: '123',
        email: 'test@allowed.com',
        name: 'Test User',
        givenName: 'Test',
        familyName: 'User',
        picture: 'https://example.com/pic.jpg'
      }
      const user = {
        id: 1,
        username: '123',
        email: 'test@allowed.com',
        displayName: 'Test User',
        firstName: 'Test',
        lastName: 'User',
        role: 'user',
        isActive: true
      }
      const sessionToken = 'session-token-123'

      redis.get.mockResolvedValue(JSON.stringify({ createdAt: new Date().toISOString() }))
      redis.del.mockResolvedValue(1)
      googleOAuthService.exchangeCodeForTokens.mockResolvedValue(tokenData)
      googleOAuthService.getUserProfile.mockResolvedValue(profile)
      googleOAuthService.validateDomain.mockReturnValue(true)
      googleLoginService.handleGoogleLogin.mockResolvedValue({
        user,
        isNewUser: true,
        apiKey: 'cr_testapikey123',
        apiKeyWarning: null
      })
      userService.recordUserLogin.mockResolvedValue()
      userService.createUserSession.mockResolvedValue(sessionToken)

      const response = await request(app)
        .get('/auth/google/callback')
        .query({ code: 'test-code', state: 'valid-state' })

      expect(response.status).toBe(200)
      expect(response.body).toEqual({
        success: true,
        message: 'Account created and logged in successfully',
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          displayName: user.displayName,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          picture: profile.picture
        },
        sessionToken,
        isNewUser: true,
        apiKey: 'cr_testapikey123'
      })

      expect(googleLoginService.handleGoogleLogin).toHaveBeenCalledWith(profile, {
        role: config.userManagement.defaultUserRole
      })
      expect(userService.recordUserLogin).toHaveBeenCalledWith(user.id)
      expect(userService.createUserSession).toHaveBeenCalledWith(user.id, {
        authMethod: 'google_oauth2',
        googleId: profile.googleId
      })
      expect(redis.del).toHaveBeenCalledWith('oauth_state:valid-state')
    })

    it('should return apiKey for new user login', async () => {
      const tokenData = { accessToken: 'access-token' }
      const profile = {
        googleId: '456',
        email: 'newuser@allowed.com',
        name: 'New User',
        givenName: 'New',
        familyName: 'User',
        picture: 'https://example.com/newpic.jpg'
      }
      const user = {
        id: 2,
        username: '456',
        email: 'newuser@allowed.com',
        displayName: 'New User',
        firstName: 'New',
        lastName: 'User',
        role: 'user',
        isActive: true
      }
      const sessionToken = 'session-token-456'

      redis.get.mockResolvedValue(JSON.stringify({ createdAt: new Date().toISOString() }))
      redis.del.mockResolvedValue(1)
      googleOAuthService.exchangeCodeForTokens.mockResolvedValue(tokenData)
      googleOAuthService.getUserProfile.mockResolvedValue(profile)
      googleOAuthService.validateDomain.mockReturnValue(true)
      googleLoginService.handleGoogleLogin.mockResolvedValue({
        user,
        isNewUser: true,
        apiKey: 'cr_newkey',
        apiKeyWarning: null
      })
      userService.recordUserLogin.mockResolvedValue()
      userService.createUserSession.mockResolvedValue(sessionToken)

      const response = await request(app)
        .get('/auth/google/callback')
        .query({ code: 'test-code', state: 'valid-state' })

      expect(response.status).toBe(200)
      expect(response.body.apiKey).toBe('cr_newkey')
      expect(response.body.isNewUser).toBe(true)
      expect(response.body.message).toBe('Account created and logged in successfully')
    })

    it('should NOT return apiKey for returning user login', async () => {
      const tokenData = { accessToken: 'access-token' }
      const profile = {
        googleId: '789',
        email: 'returning@allowed.com',
        name: 'Returning User',
        givenName: 'Returning',
        familyName: 'User',
        picture: 'https://example.com/returnpic.jpg'
      }
      const user = {
        id: 3,
        username: '789',
        email: 'returning@allowed.com',
        displayName: 'Returning User',
        firstName: 'Returning',
        lastName: 'User',
        role: 'user',
        isActive: true
      }
      const sessionToken = 'session-token-789'

      redis.get.mockResolvedValue(JSON.stringify({ createdAt: new Date().toISOString() }))
      redis.del.mockResolvedValue(1)
      googleOAuthService.exchangeCodeForTokens.mockResolvedValue(tokenData)
      googleOAuthService.getUserProfile.mockResolvedValue(profile)
      googleOAuthService.validateDomain.mockReturnValue(true)
      googleLoginService.handleGoogleLogin.mockResolvedValue({
        user,
        isNewUser: false,
        apiKey: null,
        apiKeyWarning: null
      })
      userService.recordUserLogin.mockResolvedValue()
      userService.createUserSession.mockResolvedValue(sessionToken)

      const response = await request(app)
        .get('/auth/google/callback')
        .query({ code: 'test-code', state: 'valid-state' })

      expect(response.status).toBe(200)
      expect(response.body.apiKey).toBeUndefined()
      expect(response.body.isNewUser).toBe(false)
      expect(response.body.message).toBe('Login successful')
    })

    it('should return apiKeyWarning when key generation fails', async () => {
      const tokenData = { accessToken: 'access-token' }
      const profile = {
        googleId: '101',
        email: 'failedkey@allowed.com',
        name: 'Failed Key User',
        givenName: 'Failed',
        familyName: 'Key',
        picture: 'https://example.com/failpic.jpg'
      }
      const user = {
        id: 4,
        username: '101',
        email: 'failedkey@allowed.com',
        displayName: 'Failed Key User',
        firstName: 'Failed',
        lastName: 'Key',
        role: 'user',
        isActive: true
      }
      const sessionToken = 'session-token-101'

      redis.get.mockResolvedValue(JSON.stringify({ createdAt: new Date().toISOString() }))
      redis.del.mockResolvedValue(1)
      googleOAuthService.exchangeCodeForTokens.mockResolvedValue(tokenData)
      googleOAuthService.getUserProfile.mockResolvedValue(profile)
      googleOAuthService.validateDomain.mockReturnValue(true)
      googleLoginService.handleGoogleLogin.mockResolvedValue({
        user,
        isNewUser: true,
        apiKey: null,
        apiKeyWarning: 'API key generation failed. Please contact administrator.'
      })
      userService.recordUserLogin.mockResolvedValue()
      userService.createUserSession.mockResolvedValue(sessionToken)

      const response = await request(app)
        .get('/auth/google/callback')
        .query({ code: 'test-code', state: 'valid-state' })

      expect(response.status).toBe(200)
      expect(response.body.apiKeyWarning).toBe(
        'API key generation failed. Please contact administrator.'
      )
      expect(response.body.apiKey).toBeUndefined()
      expect(response.body.isNewUser).toBe(true)
    })

    it('should return 500 on unexpected error', async () => {
      redis.get.mockRejectedValue(new Error('Redis error'))

      const response = await request(app)
        .get('/auth/google/callback')
        .query({ code: 'test-code', state: 'valid-state' })

      expect(response.status).toBe(500)
      expect(response.body).toEqual({
        error: 'Authentication error',
        message: 'Internal server error during authentication'
      })
    })
  })
})
