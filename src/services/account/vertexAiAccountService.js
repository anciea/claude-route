const { v4: uuidv4 } = require('uuid')
const redis = require('../../models/redis')
const logger = require('../../utils/logger')
const { GoogleAuth } = require('google-auth-library')
const { createEncryptor } = require('../../utils/commonHelper')

// Vertex AI account key prefixes
const VERTEX_AI_ACCOUNT_KEY_PREFIX = 'vertex_ai:account:'
const VERTEX_AI_ACCOUNT_INDEX_KEY = 'vertex_ai:account:index'
const SHARED_VERTEX_AI_ACCOUNTS_KEY = 'shared_vertex_ai_accounts'
const VERTEX_AI_SESSION_MAPPING_PREFIX = 'vertex_ai_session_account_mapping:'

// Encryption for Service Account JSON
const encryptor = createEncryptor('vertex-ai-account-salt')
const { encrypt, decrypt } = encryptor

/**
 * Validate Service Account JSON contains required fields and proper format
 * @param {Object} serviceAccountJson - Service Account JSON to validate
 * @returns {Object} { valid: boolean, error?: string }
 */
function validateServiceAccountJson(serviceAccountJson) {
  if (!serviceAccountJson || typeof serviceAccountJson !== 'object') {
    return { valid: false, error: 'Service Account JSON must be an object' }
  }

  // Required fields
  const requiredFields = [
    'type',
    'project_id',
    'private_key',
    'client_email',
    'client_id',
    'auth_uri',
    'token_uri'
  ]

  // Check for missing required fields
  const missingFields = requiredFields.filter((field) => !serviceAccountJson[field])
  if (missingFields.length > 0) {
    return {
      valid: false,
      error: `Missing required fields: ${missingFields.join(', ')}`
    }
  }

  // Validate type field
  if (serviceAccountJson.type !== 'service_account') {
    return {
      valid: false,
      error: 'Service Account JSON type must be "service_account"'
    }
  }

  // Validate private key format
  if (!serviceAccountJson.private_key.startsWith('-----BEGIN')) {
    return {
      valid: false,
      error: 'Invalid private_key format - must start with -----BEGIN'
    }
  }

  // Validate client email format (should be service account format)
  const emailPattern = /^[^@]+@[^@]+\.iam\.gserviceaccount\.com$/
  if (!emailPattern.test(serviceAccountJson.client_email)) {
    return {
      valid: false,
      error: 'Invalid client_email format - must be a valid service account email'
    }
  }

  return { valid: true }
}

/**
 * Generate Google Cloud access token from Service Account JSON
 * @param {Object} serviceAccountJson - Valid Service Account JSON
 * @returns {Promise<Object>} { accessToken: string, expiresAt: Date }
 */
async function generateAccessToken(serviceAccountJson) {
  try {
    const auth = new GoogleAuth({
      credentials: serviceAccountJson,
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    })

    const client = await auth.getClient()
    const tokenResponse = await client.getAccessToken()

    if (!tokenResponse.token) {
      throw new Error('Failed to generate access token - no token in response')
    }

    // Calculate expiration time (default 1 hour if not provided)
    const expiresIn = tokenResponse.res?.data?.expires_in || 3600
    const expiresAt = new Date(Date.now() + expiresIn * 1000)

    return {
      accessToken: tokenResponse.token,
      expiresAt
    }
  } catch (error) {
    logger.error('Failed to generate Google Cloud access token:', {
      error: error.message,
      code: error.code
    })
    throw new Error(`Google Cloud authentication failed: ${error.message}`)
  }
}

/**
 * Create new Vertex AI account
 * @param {Object} options - Account creation options
 * @returns {Promise<Object>} Created account object
 */
async function createAccount(options = {}) {
  const {
    name = 'Unnamed Vertex AI Account',
    description = '',
    projectId,
    location = 'us-central1',
    serviceAccountJson,
    accountType = 'shared',
    priority = 50,
    schedulable = true,
    isActive = true,
    proxy = null,
    groupId = null,
    disableAutoProtection = false,
    subscriptionExpiresAt = null
  } = options

  // Validate required fields
  if (!projectId) {
    throw new Error('Project ID is required')
  }
  if (!serviceAccountJson) {
    throw new Error('Service Account JSON is required')
  }

  // Validate Service Account JSON
  const validation = validateServiceAccountJson(serviceAccountJson)
  if (!validation.valid) {
    throw new Error(`Invalid Service Account JSON: ${validation.error}`)
  }

  const accountId = uuidv4()
  const now = new Date().toISOString()

  // Encrypt the Service Account JSON
  const encryptedServiceAccountJson = encrypt(JSON.stringify(serviceAccountJson))

  const account = {
    id: accountId,
    name,
    description,
    projectId,
    location,
    serviceAccountJson: encryptedServiceAccountJson,
    accountType,
    priority,
    schedulable,
    isActive,
    proxy,
    groupId,
    disableAutoProtection,
    subscriptionExpiresAt,
    platform: 'vertex-ai',
    createdAt: now,
    updatedAt: now
  }

  try {
    // Store account in Redis
    await redis.hset(`${VERTEX_AI_ACCOUNT_KEY_PREFIX}${accountId}`, account)

    // Add to index
    await redis.sadd(VERTEX_AI_ACCOUNT_INDEX_KEY, accountId)

    // Add to shared accounts if accountType is shared
    if (accountType === 'shared') {
      await redis.sadd(SHARED_VERTEX_AI_ACCOUNTS_KEY, accountId)
    }

    logger.info('Created Vertex AI account:', { accountId, name, projectId, location })

    // Return account without encrypted credentials
    const { serviceAccountJson: _, ...publicAccount } = account
    return publicAccount
  } catch (error) {
    logger.error('Failed to create Vertex AI account:', error)
    throw new Error('Failed to create account')
  }
}

/**
 * Get account by ID
 * @param {string} accountId - Account ID
 * @param {boolean} includeCredentials - Whether to include decrypted credentials (default: false)
 * @returns {Promise<Object|null>} Account object or null if not found
 */
async function getAccount(accountId, includeCredentials = false) {
  try {
    const account = await redis.hgetall(`${VERTEX_AI_ACCOUNT_KEY_PREFIX}${accountId}`)

    if (!account || !account.id) {
      return null
    }

    if (includeCredentials && account.serviceAccountJson) {
      try {
        const decryptedJson = decrypt(account.serviceAccountJson)
        account.serviceAccountJson = JSON.parse(decryptedJson)
      } catch (error) {
        logger.error('Failed to decrypt service account JSON:', error)
        delete account.serviceAccountJson
      }
    } else {
      // Remove encrypted credentials from public view
      delete account.serviceAccountJson
    }

    // Ensure platform is set
    if (!account.platform) {
      account.platform = 'vertex-ai'
    }

    return account
  } catch (error) {
    logger.error('Failed to get Vertex AI account:', error)
    return null
  }
}

/**
 * Update account
 * @param {string} accountId - Account ID
 * @param {Object} updates - Updates to apply
 * @returns {Promise<Object>} Updated account
 */
async function updateAccount(accountId, updates) {
  const account = await redis.hgetall(`${VERTEX_AI_ACCOUNT_KEY_PREFIX}${accountId}`)

  if (!account || !account.id) {
    throw new Error('Account not found')
  }

  // Validate Service Account JSON if being updated
  if (updates.serviceAccountJson) {
    const validation = validateServiceAccountJson(updates.serviceAccountJson)
    if (!validation.valid) {
      throw new Error(`Invalid Service Account JSON: ${validation.error}`)
    }
    // Encrypt the new Service Account JSON
    updates.serviceAccountJson = encrypt(JSON.stringify(updates.serviceAccountJson))
  }

  const updatedAccount = {
    ...account,
    ...updates,
    updatedAt: new Date().toISOString()
  }

  await redis.hset(`${VERTEX_AI_ACCOUNT_KEY_PREFIX}${accountId}`, updatedAccount)

  // Handle shared accounts set changes
  if (updates.accountType) {
    if (updates.accountType === 'shared') {
      await redis.sadd(SHARED_VERTEX_AI_ACCOUNTS_KEY, accountId)
    } else {
      await redis.srem(SHARED_VERTEX_AI_ACCOUNTS_KEY, accountId)
    }
  }

  logger.info('Updated Vertex AI account:', { accountId, updates: Object.keys(updates) })

  // Return without encrypted credentials
  const { serviceAccountJson: _, ...publicAccount } = updatedAccount
  return publicAccount
}

/**
 * Delete account
 * @param {string} accountId - Account ID
 * @returns {Promise<boolean>} True if deleted successfully
 */
async function deleteAccount(accountId) {
  try {
    // Remove from Redis
    await redis.hdel(`${VERTEX_AI_ACCOUNT_KEY_PREFIX}${accountId}`)

    // Remove from index
    await redis.srem(VERTEX_AI_ACCOUNT_INDEX_KEY, accountId)

    // Remove from shared accounts
    await redis.srem(SHARED_VERTEX_AI_ACCOUNTS_KEY, accountId)

    logger.info('Deleted Vertex AI account:', { accountId })
    return true
  } catch (error) {
    logger.error('Failed to delete Vertex AI account:', error)
    throw new Error('Failed to delete account')
  }
}

/**
 * Get all accounts
 * @returns {Promise<Array>} Array of accounts (without credentials)
 */
async function getAllAccounts() {
  try {
    const accountIds = await redis.smembers(VERTEX_AI_ACCOUNT_INDEX_KEY)
    const accounts = []

    for (const accountId of accountIds) {
      const account = await getAccount(accountId, false) // No credentials
      if (account) {
        accounts.push(account)
      }
    }

    return accounts
  } catch (error) {
    logger.error('Failed to get all Vertex AI accounts:', error)
    return []
  }
}

/**
 * Get shared accounts
 * @returns {Promise<Array>} Array of shared accounts
 */
async function getSharedAccounts() {
  try {
    const accountIds = await redis.smembers(SHARED_VERTEX_AI_ACCOUNTS_KEY)
    const accounts = []

    for (const accountId of accountIds) {
      const account = await getAccount(accountId, false)
      if (account && account.isActive) {
        accounts.push(account)
      }
    }

    return accounts
  } catch (error) {
    logger.error('Failed to get shared Vertex AI accounts:', error)
    return []
  }
}

/**
 * Select available account (for session-sticky scheduling)
 * @param {string} sessionId - Session ID for sticky routing
 * @returns {Promise<Object|null>} Selected account with credentials
 */
async function selectAvailableAccount(sessionId) {
  try {
    // Check for existing session mapping
    const mappedAccountId = await redis.get(`${VERTEX_AI_SESSION_MAPPING_PREFIX}${sessionId}`)

    if (mappedAccountId) {
      const account = await getAccount(mappedAccountId, true) // With credentials
      if (account && account.isActive) {
        return account
      }
    }

    // Select from available shared accounts
    const sharedAccounts = await getSharedAccounts()
    const availableAccounts = sharedAccounts.filter(
      (account) => account.schedulable && account.isActive
    )

    if (availableAccounts.length === 0) {
      return null
    }

    // Simple round-robin selection (could be enhanced with priority)
    const selectedAccount = availableAccounts[0]
    const accountWithCredentials = await getAccount(selectedAccount.id, true)

    // Store session mapping
    await redis.setex(`${VERTEX_AI_SESSION_MAPPING_PREFIX}${sessionId}`, 3600, selectedAccount.id)

    return accountWithCredentials
  } catch (error) {
    logger.error('Failed to select available Vertex AI account:', error)
    return null
  }
}

/**
 * Get access token for account
 * @param {string} accountId - Account ID
 * @returns {Promise<Object>} { accessToken: string, expiresAt: Date }
 */
async function getAccessToken(accountId) {
  try {
    const account = await getAccount(accountId, true) // With credentials

    if (!account || !account.serviceAccountJson) {
      throw new Error('Account not found or missing credentials')
    }

    return await generateAccessToken(account.serviceAccountJson)
  } catch (error) {
    logger.error('Failed to get access token for account:', { accountId, error: error.message })
    throw error
  }
}

/**
 * Mark account as used (update lastUsedAt)
 * @param {string} accountId - Account ID
 * @returns {Promise<void>}
 */
async function markAccountUsed(accountId) {
  try {
    await updateAccount(accountId, { lastUsedAt: new Date().toISOString() })
  } catch (error) {
    logger.error('Failed to mark account as used:', { accountId, error: error.message })
    // Don't throw - this is not critical
  }
}

/**
 * Set account rate limit status
 * @param {string} accountId - Account ID
 * @param {boolean} isLimited - Whether account is rate limited
 * @returns {Promise<void>}
 */
async function setAccountRateLimited(accountId, isLimited) {
  try {
    const updates = {
      rateLimitStatus: isLimited ? 'limited' : null,
      rateLimitedAt: isLimited ? new Date().toISOString() : null
    }
    await updateAccount(accountId, updates)

    logger.info(`Set rate limit status for Vertex AI account ${accountId}: ${isLimited ? 'limited' : 'cleared'}`)
  } catch (error) {
    logger.error('Failed to set rate limit status:', { accountId, isLimited, error: error.message })
    throw error
  }
}

module.exports = {
  createAccount,
  getAccount,
  updateAccount,
  deleteAccount,
  getAllAccounts,
  getSharedAccounts,
  selectAvailableAccount,
  validateServiceAccountJson,
  generateAccessToken,
  getAccessToken,
  markAccountUsed,
  setAccountRateLimited
}
