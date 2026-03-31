jest.mock('../src/services/userService', () => ({
  createOrUpdateUser: jest.fn(),
  recordUserLogin: jest.fn(),
  createUserSession: jest.fn()
}))

jest.mock('../src/services/apiKeyService', () => ({
  generateApiKey: jest.fn(),
  getUserApiKeys: jest.fn()
}))

jest.mock('../src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
}))

const userService = require('../src/services/userService')
const apiKeyService = require('../src/services/apiKeyService')
const logger = require('../src/utils/logger')

describe('GoogleLoginService', () => {
  let googleLoginService

  beforeEach(() => {
    jest.clearAllMocks()
  })

  beforeAll(() => {
    googleLoginService = require('../src/services/googleLoginService')
  })

  const mockGoogleProfile = {
    googleId: '123456789',
    email: 'test@example.com',
    name: 'Test User',
    givenName: 'Test',
    familyName: 'User',
    picture: 'https://example.com/avatar.jpg'
  }

  const mockUser = {
    id: 'uid1',
    username: '123456789',
    email: 'test@example.com',
    displayName: 'Test User',
    firstName: 'Test',
    lastName: 'User',
    avatarUrl: 'https://example.com/avatar.jpg',
    role: 'user',
    isActive: true,
    createdAt: '2026-03-31T02:00:00Z',
    updatedAt: '2026-03-31T02:00:00Z',
    lastLoginAt: null,
    apiKeyCount: 0,
    totalUsage: {
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalCost: 0
    }
  }

  const mockApiKey = {
    id: 'kid1',
    apiKey: 'cr_testkey123',
    name: 'Auto-generated key for Test User',
    permissions: [],
    userId: 'uid1',
    userUsername: '123456789',
    createdBy: 'google_oauth2',
    isActive: true,
    createdAt: '2026-03-31T02:00:00Z'
  }

  describe('handleGoogleLogin', () => {
    it('should create user and generate API key for new user login', async () => {
      // Mock new user creation
      userService.createOrUpdateUser.mockResolvedValue({
        user: mockUser,
        isNewUser: true
      })

      // Mock API key generation
      apiKeyService.generateApiKey.mockResolvedValue(mockApiKey)

      const result = await googleLoginService.handleGoogleLogin(mockGoogleProfile)

      // Verify user creation was called with correct data
      expect(userService.createOrUpdateUser).toHaveBeenCalledWith({
        username: '123456789',
        email: 'test@example.com',
        displayName: 'Test User',
        firstName: 'Test',
        lastName: 'User',
        avatarUrl: 'https://example.com/avatar.jpg',
        role: undefined,
        isActive: true
      })

      // Verify API key generation was called for new user
      expect(apiKeyService.generateApiKey).toHaveBeenCalledWith({
        name: 'Auto-generated key for Test User',
        permissions: [],
        userId: 'uid1',
        userUsername: '123456789',
        createdBy: 'google_oauth2'
      })

      // Verify result
      expect(result).toEqual({
        user: mockUser,
        isNewUser: true,
        apiKey: 'cr_testkey123',
        apiKeyWarning: null
      })

      expect(logger.info).toHaveBeenCalledWith('Auto-generated API key for new user', {
        userId: 'uid1',
        keyId: 'kid1'
      })
    })

    it('should update user and NOT generate API key for returning user', async () => {
      // Mock returning user update
      userService.createOrUpdateUser.mockResolvedValue({
        user: mockUser,
        isNewUser: false
      })

      const result = await googleLoginService.handleGoogleLogin(mockGoogleProfile)

      // Verify user update was called
      expect(userService.createOrUpdateUser).toHaveBeenCalledWith({
        username: '123456789',
        email: 'test@example.com',
        displayName: 'Test User',
        firstName: 'Test',
        lastName: 'User',
        avatarUrl: 'https://example.com/avatar.jpg',
        role: undefined,
        isActive: true
      })

      // Verify API key generation was NOT called for returning user
      expect(apiKeyService.generateApiKey).not.toHaveBeenCalled()

      // Verify result
      expect(result).toEqual({
        user: mockUser,
        isNewUser: false,
        apiKey: null,
        apiKeyWarning: null
      })
    })

    it('should throw error on user creation failure and NOT attempt API key generation', async () => {
      const userError = new Error('User creation failed')
      userService.createOrUpdateUser.mockRejectedValue(userError)

      await expect(googleLoginService.handleGoogleLogin(mockGoogleProfile)).rejects.toThrow(
        'User creation failed'
      )

      expect(userService.createOrUpdateUser).toHaveBeenCalled()
      expect(apiKeyService.generateApiKey).not.toHaveBeenCalled()
    })

    it('should return user with warning on API key generation failure for new user', async () => {
      // Mock new user creation
      userService.createOrUpdateUser.mockResolvedValue({
        user: mockUser,
        isNewUser: true
      })

      // Mock API key generation failure
      apiKeyService.generateApiKey.mockRejectedValue(new Error('API key generation failed'))

      const result = await googleLoginService.handleGoogleLogin(mockGoogleProfile)

      expect(userService.createOrUpdateUser).toHaveBeenCalled()
      expect(apiKeyService.generateApiKey).toHaveBeenCalled()

      // Should still return user but with warning
      expect(result).toEqual({
        user: mockUser,
        isNewUser: true,
        apiKey: null,
        apiKeyWarning: 'API key generation failed. Please contact administrator.'
      })

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to auto-generate API key for new user:',
        expect.any(Error)
      )
    })

    it('should generate API key with correct name format for displayName', async () => {
      userService.createOrUpdateUser.mockResolvedValue({
        user: mockUser,
        isNewUser: true
      })

      apiKeyService.generateApiKey.mockResolvedValue(mockApiKey)

      await googleLoginService.handleGoogleLogin(mockGoogleProfile)

      expect(apiKeyService.generateApiKey).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Auto-generated key for Test User'
        })
      )
    })

    it('should generate API key with empty permissions array for full access', async () => {
      userService.createOrUpdateUser.mockResolvedValue({
        user: mockUser,
        isNewUser: true
      })

      apiKeyService.generateApiKey.mockResolvedValue(mockApiKey)

      await googleLoginService.handleGoogleLogin(mockGoogleProfile)

      expect(apiKeyService.generateApiKey).toHaveBeenCalledWith(
        expect.objectContaining({
          permissions: []
        })
      )
    })

    it('should pass userId and userUsername to apiKeyService', async () => {
      userService.createOrUpdateUser.mockResolvedValue({
        user: mockUser,
        isNewUser: true
      })

      apiKeyService.generateApiKey.mockResolvedValue(mockApiKey)

      await googleLoginService.handleGoogleLogin(mockGoogleProfile)

      expect(apiKeyService.generateApiKey).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'uid1',
          userUsername: '123456789',
          createdBy: 'google_oauth2'
        })
      )
    })

    it('should handle profile with missing name by falling back to email', async () => {
      const profileWithoutName = {
        ...mockGoogleProfile,
        name: null
      }

      userService.createOrUpdateUser.mockResolvedValue({
        user: mockUser,
        isNewUser: true
      })

      apiKeyService.generateApiKey.mockResolvedValue(mockApiKey)

      await googleLoginService.handleGoogleLogin(profileWithoutName)

      expect(apiKeyService.generateApiKey).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Auto-generated key for test@example.com'
        })
      )
    })

    it('should accept role option override', async () => {
      userService.createOrUpdateUser.mockResolvedValue({
        user: { ...mockUser, role: 'admin' },
        isNewUser: true
      })

      apiKeyService.generateApiKey.mockResolvedValue(mockApiKey)

      await googleLoginService.handleGoogleLogin(mockGoogleProfile, { role: 'admin' })

      expect(userService.createOrUpdateUser).toHaveBeenCalledWith({
        username: '123456789',
        email: 'test@example.com',
        displayName: 'Test User',
        firstName: 'Test',
        lastName: 'User',
        avatarUrl: 'https://example.com/avatar.jpg',
        role: 'admin',
        isActive: true
      })
    })
  })
})