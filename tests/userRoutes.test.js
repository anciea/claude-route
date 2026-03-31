// Mock dependencies to avoid external calls and console output during tests
jest.mock('../src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  success: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn()
}))

jest.mock('../src/services/userService', () => ({
  invalidateUserSession: jest.fn(),
  getUserById: jest.fn(),
  updateUserApiKeyCount: jest.fn()
}))

jest.mock('../src/services/apiKeyService', () => ({
  getUserApiKeys: jest.fn(),
  createApiKey: jest.fn(),
  getApiKeyById: jest.fn(),
  deleteApiKey: jest.fn()
}))

jest.mock('../src/models/redis', () => ({
  getClientSafe: jest.fn(() => ({
    quit: jest.fn()
  })),
  getApiKey: jest.fn()
}))

jest.mock('../config/config', () => ({
  userManagement: {
    enabled: true,
    maxApiKeysPerUser: 5,
    allowUserDeleteApiKeys: true
  }
}))

jest.mock('../src/middleware/auth', () => ({
  authenticateUser: jest.fn((req, res, next) => {
    return res.status(401).json({
      error: 'Authentication required',
      message: 'Please provide a valid session token'
    })
  }),
  authenticateUserOrAdmin: jest.fn((req, res, next) => {
    return res.status(401).json({
      error: 'Authentication required',
      message: 'Please provide a valid session token'
    })
  }),
  requireAdmin: jest.fn((req, res, next) => {
    return res.status(403).json({
      error: 'Admin access required',
      message: 'You must be an administrator to access this resource'
    })
  })
}))

jest.mock('../src/services/quotaCardService', () => ({
  redeemCard: jest.fn(),
  getRedemptions: jest.fn()
}))

const request = require('supertest')
const express = require('express')

describe('User Routes', () => {
  let userRoutes, app
  let userService, apiKeyService, redis

  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()

    // Get mocked modules
    userService = require('../src/services/userService')
    apiKeyService = require('../src/services/apiKeyService')
    redis = require('../src/models/redis')

    // Create new app instance for each test
    app = express()
    app.use(express.json())

    // Require userRoutes after mocks are set up
    userRoutes = require('../src/routes/userRoutes')
    app.use('/users', userRoutes)
  })

  describe('LDAP routes removal verification', () => {
    it('POST /users/login returns 404 (LDAP removed)', async () => {
      const response = await request(app)
        .post('/users/login')
        .send({ username: 'test', password: 'test' })

      expect(response.status).toBe(404)
    })

    it('GET /users/admin/ldap-test returns 404 (LDAP removed)', async () => {
      const response = await request(app).get('/users/admin/ldap-test')

      expect(response.status).toBe(404)
    })
  })

  describe('Existing routes still work', () => {
    it('GET /users/profile requires authentication (middleware works)', async () => {
      const response = await request(app).get('/users/profile')

      // Should return 401 due to missing authentication, not 404
      // This confirms the route exists and middleware is working
      expect(response.status).toBe(401)
    })

    it('GET /users/api-keys requires authentication (middleware works)', async () => {
      const response = await request(app).get('/users/api-keys')

      // Should return 401 due to missing authentication, not 404
      // This confirms the route exists and middleware is working
      expect(response.status).toBe(401)
    })

    it('POST /users/logout requires authentication (middleware works)', async () => {
      const response = await request(app).post('/users/logout')

      // Should return 401 due to missing authentication, not 404
      // This confirms the route exists and middleware is working
      expect(response.status).toBe(401)
    })

    it('POST /users/api-keys requires authentication (middleware works)', async () => {
      const response = await request(app).post('/users/api-keys').send({ name: 'test-key' })

      // Should return 401 due to missing authentication, not 404
      // This confirms the route exists and middleware is working
      expect(response.status).toBe(401)
    })
  })
})
