const userService = require('./userService')
const apiKeyService = require('./apiKeyService')
const logger = require('../utils/logger')

const googleLoginService = {
  /**
   * Handle complete Google login flow: create/update user + auto-generate API key for new users.
   * @param {Object} googleProfile - { googleId, email, name, givenName, familyName, picture }
   * @param {Object} options - { role } optional overrides
   * @returns {Object} { user, isNewUser, apiKey, apiKeyWarning }
   */
  async handleGoogleLogin(googleProfile, options = {}) {
    // 1. Map Google profile to userData (per D-02, D-03)
    const userData = {
      username: googleProfile.googleId, // per D-03/USER-02
      email: googleProfile.email, // per USER-03
      displayName: googleProfile.name, // per USER-03
      firstName: googleProfile.givenName,
      lastName: googleProfile.familyName,
      avatarUrl: googleProfile.picture, // per USER-03
      role: options.role, // uses default from config if undefined
      isActive: true
    }

    // 2. Create or update user (per D-02) -- throws on failure (per D-10)
    const { user, isNewUser } = await userService.createOrUpdateUser(userData)

    // 3. Auto-generate API key for new users only (per D-04, APIKEY-01)
    let apiKey = null
    let apiKeyWarning = null

    if (isNewUser) {
      try {
        const keyResult = await apiKeyService.generateApiKey({
          name: `Auto-generated key for ${googleProfile.name || googleProfile.email}`,
          permissions: [], // Empty = full access (per APIKEY-03/D-06)
          userId: user.id, // per APIKEY-05
          userUsername: user.username, // per APIKEY-05
          createdBy: 'google_oauth2'
        })
        const { apiKey: generatedApiKey, id: keyId } = keyResult // Full plaintext key, only available at creation
        apiKey = generatedApiKey
        logger.info('Auto-generated API key for new user', {
          userId: user.id,
          keyId
        })
      } catch (error) {
        // Per D-11: still return user, but with warning
        logger.error('Failed to auto-generate API key for new user:', error)
        apiKeyWarning = 'API key generation failed. Please contact administrator.'
      }
    }

    return { user, isNewUser, apiKey, apiKeyWarning }
  }
}

module.exports = googleLoginService
