const crypto = require('crypto')
const axios = require('axios')
const logger = require('../utils/logger')
const config = require('../../config/config')

// Google OAuth2 constants
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo'
const TOKEN_INFO_URL = 'https://oauth2.googleapis.com/tokeninfo'

class GoogleOAuthService {
  constructor() {
    this.config = config.googleOAuth || {}

    // Validate configuration when enabled
    if (this.config.enabled) {
      this.validateConfiguration()
      logger.info('🌐 Google OAuth2 service initialized', {
        clientId: `${this.config.clientId?.substring(0, 10)}...`,
        callbackUrl: this.config.callbackUrl,
        scopes: this.config.scopes,
        allowedDomainsCount: this.config.allowedDomains?.length || 0
      })
    } else {
      logger.debug('🌐 Google OAuth2 service disabled')
    }
  }

  validateConfiguration() {
    const errors = []

    if (
      !this.config.clientId ||
      typeof this.config.clientId !== 'string' ||
      this.config.clientId === ''
    ) {
      errors.push('Google OAuth2 client ID is required')
    }

    if (
      !this.config.clientSecret ||
      typeof this.config.clientSecret !== 'string' ||
      this.config.clientSecret === ''
    ) {
      errors.push('Google OAuth2 client secret is required')
    }

    if (!this.config.callbackUrl || typeof this.config.callbackUrl !== 'string') {
      errors.push('Google OAuth2 callback URL is required')
    }

    if (errors.length > 0) {
      logger.error('❌ Google OAuth2 configuration validation failed:', errors)
      throw new Error(`Google OAuth2 configuration invalid: ${errors.join(', ')}`)
    }

    logger.success('✅ Google OAuth2 configuration validated')
  }

  /**
   * Generate cryptographically secure state parameter
   * @returns {string} Random base64url encoded string
   */
  generateState() {
    return crypto.randomBytes(32).toString('base64url')
  }

  /**
   * Generate Google OAuth2 authorization URL
   * @returns {Object} Object containing authUrl and state
   */
  generateAuthUrl() {
    const state = this.generateState()

    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.callbackUrl,
      response_type: 'code',
      scope: this.config.scopes.join(' '),
      state,
      access_type: 'offline',
      prompt: 'consent'
    })

    const authUrl = `${AUTH_URL}?${params.toString()}`

    logger.debug('🔗 Generated Google OAuth2 authorization URL', {
      state,
      scopes: this.config.scopes
    })

    return {
      authUrl,
      state
    }
  }

  /**
   * Exchange authorization code for tokens
   * @param {string} code - Authorization code from Google
   * @returns {Object} Object containing access token, ID token, refresh token, and expiration
   */
  async exchangeCodeForTokens(code) {
    try {
      logger.debug('🔄 Exchanging authorization code for tokens')

      const response = await axios.post(
        TOKEN_URL,
        {
          grant_type: 'authorization_code',
          code,
          redirect_uri: this.config.callbackUrl,
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret
        },
        {
          timeout: 30000
        }
      )

      const { data } = response
      const result = {
        accessToken: data.access_token,
        idToken: data.id_token,
        refreshToken: data.refresh_token || '',
        expiresAt: Date.now() + data.expires_in * 1000
      }

      logger.success('✅ Successfully exchanged authorization code for tokens')
      return result
    } catch (error) {
      logger.error('❌ Token exchange failed:', error.message)

      if (error.response) {
        const { status } = error.response
        const errorData = error.response.data
        throw new Error(
          `HTTP ${status}: ${errorData?.error_description || errorData?.error || 'Token exchange failed'}`
        )
      } else if (error.request) {
        throw new Error('Network error: No response from Google OAuth2 server')
      } else {
        throw new Error(`Token exchange failed: ${error.message}`)
      }
    }
  }

  /**
   * Get user profile from Google
   * @param {string} accessToken - Google access token
   * @returns {Object} User profile information
   */
  async getUserProfile(accessToken) {
    try {
      logger.debug('👤 Fetching user profile from Google')

      const response = await axios.get(USERINFO_URL, {
        headers: {
          Authorization: `Bearer ${accessToken}`
        },
        timeout: 30000
      })

      const { data } = response
      const profile = {
        googleId: data.id,
        email: data.email,
        name: data.name,
        givenName: data.given_name || '',
        familyName: data.family_name || '',
        picture: data.picture || '',
        emailVerified: data.verified_email || false
      }

      logger.success('✅ Successfully fetched user profile', {
        googleId: profile.googleId,
        email: profile.email,
        emailVerified: profile.emailVerified
      })

      return profile
    } catch (error) {
      logger.error('❌ Failed to fetch user profile:', error.message)

      if (error.response) {
        const { status } = error.response
        const errorData = error.response.data
        throw new Error(
          `HTTP ${status}: ${errorData?.error_description || errorData?.error || 'Failed to fetch user profile'}`
        )
      } else if (error.request) {
        throw new Error('Network error: No response from Google API server')
      } else {
        throw new Error(`Failed to fetch user profile: ${error.message}`)
      }
    }
  }

  /**
   * Validate Google ID token
   * @param {string} idToken - Google ID token
   * @returns {Object} Decoded token claims
   */
  async validateToken(idToken) {
    try {
      logger.debug('🔍 Validating Google ID token')

      const response = await axios.get(`${TOKEN_INFO_URL}?id_token=${idToken}`, {
        timeout: 30000
      })

      const { data } = response

      // Verify audience matches our client ID
      if (data.aud !== this.config.clientId) {
        throw new Error('Token audience mismatch: Invalid client ID')
      }

      logger.success('✅ Google ID token validated successfully', {
        subject: data.sub,
        email: data.email
      })

      return data
    } catch (error) {
      logger.error('❌ Token validation failed:', error.message)

      if (error.response) {
        const { status } = error.response
        const errorData = error.response.data
        throw new Error(
          `HTTP ${status}: ${errorData?.error_description || errorData?.error || 'Token validation failed'}`
        )
      } else if (error.request) {
        throw new Error('Network error: No response from Google tokeninfo server')
      } else {
        throw new Error(`Token validation failed: ${error.message}`)
      }
    }
  }

  /**
   * Validate if email domain is allowed
   * @param {string} email - Email address to validate
   * @returns {boolean} True if domain is allowed
   */
  validateDomain(email) {
    if (!this.config.allowedDomains || this.config.allowedDomains.length === 0) {
      return true // All domains allowed
    }

    const emailDomain = email.split('@')[1]
    const isAllowed = this.config.allowedDomains.includes(emailDomain)

    logger.debug('🔒 Domain validation result', {
      email,
      domain: emailDomain,
      allowed: isAllowed,
      allowedDomains: this.config.allowedDomains
    })

    return isAllowed
  }
}

module.exports = new GoogleOAuthService()
