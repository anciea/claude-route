const express = require('express')
const router = express.Router()
const googleOAuthService = require('../services/googleOAuthService')
const userService = require('../services/userService')
const logger = require('../utils/logger')
const config = require('../../config/config')
const redis = require('../models/redis')

// GET /google - Initiate Google OAuth2 login flow
router.get('/google', async (req, res) => {
  try {
    // Check if Google OAuth2 is enabled
    if (!config.googleOAuth?.enabled) {
      return res.status(503).json({
        error: 'Service unavailable',
        message: 'Google OAuth2 authentication is not enabled'
      })
    }

    // Check if user management is enabled
    if (!config.userManagement?.enabled) {
      return res.status(503).json({
        error: 'Service unavailable',
        message: 'Google OAuth2 authentication is not enabled'
      })
    }

    // Generate authorization URL with state parameter
    const { authUrl, state } = googleOAuthService.generateAuthUrl()

    // Store state in Redis with 10-minute TTL for CSRF protection
    const stateData = {
      createdAt: new Date().toISOString(),
      ip: req.ip || req.connection.remoteAddress || 'unknown'
    }
    await redis.setex(`oauth_state:${state}`, 600, JSON.stringify(stateData))

    // Log the OAuth2 flow initiation
    logger.info('Initiating Google OAuth2 flow', { ip: req.ip })

    // Redirect to Google authorization URL
    res.redirect(authUrl)
  } catch (error) {
    logger.error('Error initiating Google OAuth2 flow:', error)
    res.status(500).json({
      error: 'Authentication error',
      message: 'Internal server error during authentication'
    })
  }
})

// GET /google/callback - Handle Google OAuth2 callback
router.get('/google/callback', async (req, res) => {
  try {
    const { code, state } = req.query

    // Validate authorization code is present
    if (!code) {
      return res.status(400).json({
        error: 'Missing authorization code',
        message: 'Authorization code is required'
      })
    }

    // Validate state parameter if present
    if (state) {
      const stateData = await redis.get(`oauth_state:${state}`)
      if (!stateData) {
        return res.status(403).json({
          error: 'Invalid state parameter',
          message: 'State validation failed. Please try logging in again.'
        })
      }
      // Delete the state to ensure one-time use
      await redis.del(`oauth_state:${state}`)
    }

    // Exchange authorization code for tokens
    let tokenData
    try {
      tokenData = await googleOAuthService.exchangeCodeForTokens(code)
    } catch (error) {
      logger.error('Failed to exchange authorization code:', error)
      return res.status(401).json({
        error: 'Authentication failed',
        message: 'Failed to exchange authorization code'
      })
    }

    // Get user profile from Google
    let profile
    try {
      profile = await googleOAuthService.getUserProfile(tokenData.accessToken)
    } catch (error) {
      logger.error('Failed to retrieve user profile:', error)
      return res.status(401).json({
        error: 'Authentication failed',
        message: 'Failed to retrieve user profile'
      })
    }

    // Validate email domain is allowed
    if (!googleOAuthService.validateDomain(profile.email)) {
      logger.info('Domain not allowed for user:', { email: profile.email })
      return res.status(403).json({
        error: 'Domain not allowed',
        message: 'Your email domain is not authorized'
      })
    }

    // Map Google profile to user data
    const userData = {
      username: profile.googleId,
      email: profile.email,
      displayName: profile.name,
      firstName: profile.givenName,
      lastName: profile.familyName,
      role: config.userManagement.defaultUserRole,
      isActive: true
    }

    // Create or update user
    const user = await userService.createOrUpdateUser(userData)

    // Check if user account is active
    if (!user.isActive) {
      logger.info('Disabled account login attempt:', {
        username: profile.googleId,
        email: profile.email
      })
      return res.status(403).json({
        error: 'Account disabled',
        message: 'Your account has been disabled'
      })
    }

    // Record user login
    await userService.recordUserLogin(user.id)

    // Create user session
    const sessionToken = await userService.createUserSession(user.id, {
      authMethod: 'google_oauth2',
      googleId: profile.googleId
    })

    // Log successful login
    logger.info('Google OAuth2 login successful', {
      username: profile.googleId,
      email: profile.email,
      userId: user.id
    })

    // Return success response
    res.json({
      success: true,
      message: 'Login successful',
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
      sessionToken
    })
  } catch (error) {
    logger.error('Unexpected error in Google OAuth2 callback:', error)
    res.status(500).json({
      error: 'Authentication error',
      message: 'Internal server error during authentication'
    })
  }
})

module.exports = router
