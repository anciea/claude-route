const vertexAiAccountService = require('../account/vertexAiAccountService')
const redis = require('../../models/redis')
const logger = require('../../utils/logger')
const { isSchedulable, isActive, sortAccountsByPriority } = require('../../utils/commonHelper')
const upstreamErrorHelper = require('../../utils/upstreamErrorHelper')

class UnifiedVertexScheduler {
  constructor() {
    this.SESSION_MAPPING_PREFIX = 'vertex_session_mapping:'
  }

  // 🎯 Unified Vertex AI account selection
  async selectAccountForApiKey(
    apiKeyData,
    sessionHash = null,
    requestedModel = null,
    options = {}
  ) {
    try {
      // If API Key has dedicated Vertex AI account binding, prioritize it
      if (apiKeyData.vertexAccountId) {
        const boundAccount = await vertexAiAccountService.getAccount(apiKeyData.vertexAccountId)
        if (
          boundAccount &&
          this._isActive(boundAccount.isActive) &&
          boundAccount.status !== 'error'
        ) {
          const isAvailable = await this._isAccountAvailable(boundAccount.id, 'vertex-ai')
          if (isAvailable) {
            logger.info(
              `🎯 Using bound dedicated Vertex AI account: ${boundAccount.name} (${apiKeyData.vertexAccountId}) for API key ${apiKeyData.name}`
            )
            // Update account last used time
            await vertexAiAccountService.markAccountUsed?.(apiKeyData.vertexAccountId)
            return {
              accountId: apiKeyData.vertexAccountId,
              accountType: 'vertex-ai'
            }
          }
        } else {
          logger.warn(
            `⚠️ Bound Vertex AI account ${apiKeyData.vertexAccountId} is not available, falling back to pool`
          )
        }
      }

      // If session hash provided, check for existing sticky mapping
      if (sessionHash) {
        const mappedAccount = await this._getSessionMapping(sessionHash)
        if (mappedAccount) {
          // Verify mapped account is still available
          const isAvailable = await this._isAccountAvailable(
            mappedAccount.accountId,
            mappedAccount.accountType
          )
          if (isAvailable) {
            // 🚀 Extend session mapping TTL
            await this._extendSessionMappingTTL(sessionHash)
            logger.info(
              `🎯 Using sticky session account: ${mappedAccount.accountId} (${mappedAccount.accountType}) for session ${sessionHash}`
            )
            // Update account last used time
            await vertexAiAccountService.markAccountUsed?.(mappedAccount.accountId)
            return mappedAccount
          } else {
            logger.warn(
              `⚠️ Mapped account ${mappedAccount.accountId} is no longer available, selecting new account`
            )
            await this._deleteSessionMapping(sessionHash)
          }
        }
      }

      // Get all available accounts
      const availableAccounts = await this._getAllAvailableAccounts(
        apiKeyData,
        requestedModel,
        options
      )

      if (availableAccounts.length === 0) {
        if (requestedModel) {
          throw new Error(
            `No available Vertex AI accounts support the requested model: ${requestedModel}`
          )
        } else {
          throw new Error('No available Vertex AI accounts')
        }
      }

      // Sort accounts by priority and last used time
      const sortedAccounts = sortAccountsByPriority(availableAccounts)

      // Select the first account
      const selectedAccount = sortedAccounts[0]

      // If session hash provided, create new mapping
      if (sessionHash) {
        await this._setSessionMapping(
          sessionHash,
          selectedAccount.accountId,
          selectedAccount.accountType
        )
        logger.info(
          `🎯 Created new sticky session mapping: ${selectedAccount.name} (${selectedAccount.accountId}, ${selectedAccount.accountType}) for session ${sessionHash}`
        )
      }

      logger.info(
        `🎯 Selected account: ${selectedAccount.name} (${selectedAccount.accountId}, ${selectedAccount.accountType}) for API key ${apiKeyData.name}`
      )

      // Update account last used time
      await vertexAiAccountService.markAccountUsed?.(selectedAccount.accountId)

      return {
        accountId: selectedAccount.accountId,
        accountType: selectedAccount.accountType
      }
    } catch (error) {
      logger.error('❌ Failed to select Vertex AI account for API key:', error)
      throw error
    }
  }

  // 🔍 Check if account is available
  async _isAccountAvailable(accountId, accountType) {
    try {
      if (accountType === 'vertex-ai') {
        const account = await vertexAiAccountService.getAccount(accountId)
        if (!account || !this._isActive(account.isActive) || account.status === 'error') {
          return false
        }
        // Check if schedulable
        if (!isSchedulable(account.schedulable)) {
          logger.info(`🚫 Vertex AI account ${accountId} is not schedulable`)
          return false
        }
        const isTempUnavailable = await upstreamErrorHelper.isTempUnavailable(
          accountId,
          accountType
        )
        if (isTempUnavailable) {
          logger.info(`⏱️ Vertex AI account ${accountId} is temporarily unavailable`)
          return false
        }
        return !(await this.isAccountRateLimited(accountId))
      }
      return false
    } catch (error) {
      logger.warn(`⚠️ Failed to check account availability: ${accountId}`, error)
      return false
    }
  }

  // 📋 Get all available accounts
  async _getAllAvailableAccounts(apiKeyData, requestedModel = null, options = {}) {
    const availableAccounts = []

    // If API Key has dedicated account binding, prioritize it
    if (apiKeyData.vertexAccountId) {
      const boundAccount = await vertexAiAccountService.getAccount(apiKeyData.vertexAccountId)
      if (
        boundAccount &&
        this._isActive(boundAccount.isActive) &&
        boundAccount.status !== 'error'
      ) {
        const isTempUnavailable = await upstreamErrorHelper.isTempUnavailable(
          boundAccount.id,
          'vertex-ai'
        )
        if (isTempUnavailable) {
          logger.warn(
            `⏱️ Bound Vertex AI account ${boundAccount.name} (${boundAccount.id}) temporarily unavailable, falling back to pool`
          )
        }
        const isRateLimited = await this.isAccountRateLimited(boundAccount.id)
        if (!isRateLimited && !isTempUnavailable) {
          // Check model support if specified
          if (
            requestedModel &&
            boundAccount.supportedModels &&
            boundAccount.supportedModels.length > 0
          ) {
            const modelSupported = boundAccount.supportedModels.includes(requestedModel)
            if (!modelSupported) {
              logger.warn(
                `⚠️ Bound Vertex AI account ${boundAccount.name} does not support model ${requestedModel}`
              )
              return availableAccounts
            }
          }

          logger.info(`🎯 Using bound Vertex AI account: ${boundAccount.name} (${boundAccount.id})`)
          return [
            {
              ...boundAccount,
              accountId: boundAccount.id,
              accountType: 'vertex-ai',
              priority: parseInt(boundAccount.priority) || 50,
              lastUsedAt: boundAccount.lastUsedAt || '0'
            }
          ]
        }
      } else {
        logger.warn(`⚠️ Bound Vertex AI account ${apiKeyData.vertexAccountId} is not available`)
      }
    }

    // Get all shared Vertex AI accounts
    const vertexAccounts = await vertexAiAccountService.getAllAccounts()
    for (const account of vertexAccounts) {
      if (
        this._isActive(account.isActive) &&
        account.status !== 'error' &&
        (account.accountType === 'shared' || !account.accountType) && // Compatible with old data
        isSchedulable(account.schedulable)
      ) {
        // Check temporary unavailability
        const isTempUnavailable = await upstreamErrorHelper.isTempUnavailable(
          account.id,
          'vertex-ai'
        )
        if (isTempUnavailable) {
          logger.debug(`⏭️ Skipping Vertex AI account ${account.name} - temporarily unavailable`)
          continue
        }

        // Check model support if specified
        if (requestedModel && account.supportedModels && account.supportedModels.length > 0) {
          const modelSupported = account.supportedModels.includes(requestedModel)
          if (!modelSupported) {
            logger.debug(
              `⏭️ Skipping Vertex AI account ${account.name} - doesn't support model ${requestedModel}`
            )
            continue
          }
        }

        // Check rate limiting
        const isRateLimited = await this.isAccountRateLimited(account.id)
        if (!isRateLimited) {
          availableAccounts.push({
            ...account,
            accountId: account.id,
            accountType: 'vertex-ai',
            priority: parseInt(account.priority) || 50, // Default priority 50
            lastUsedAt: account.lastUsedAt || '0'
          })
        }
      }
    }

    logger.info(`📊 Total available Vertex AI accounts: ${availableAccounts.length}`)
    return availableAccounts
  }

  // 🔧 Helper method: check if account is active (compatible with string and boolean)
  _isActive(activeValue) {
    // Compatible with boolean true and string 'true'
    return activeValue === true || activeValue === 'true'
  }

  // 🔗 Get session mapping
  async _getSessionMapping(sessionHash) {
    if (!sessionHash) {
      return null
    }

    const client = redis.getClientSafe()
    const key = `${this.SESSION_MAPPING_PREFIX}${sessionHash}`
    const mappingData = await client.get(key)

    if (mappingData) {
      try {
        return JSON.parse(mappingData)
      } catch (error) {
        logger.warn('⚠️ Failed to parse Vertex AI session mapping:', error)
        return null
      }
    }

    return null
  }

  // 💾 Set session mapping
  async _setSessionMapping(sessionHash, accountId, accountType) {
    if (!sessionHash) {
      return
    }

    const client = redis.getClientSafe()
    const mappingData = JSON.stringify({ accountId, accountType })
    // Use configuration-based TTL (hours)
    const appConfig = require('../../../config/config')
    const ttlHours = appConfig.session?.stickyTtlHours || 1
    const ttlSeconds = Math.max(1, Math.floor(ttlHours * 60 * 60))
    const key = `${this.SESSION_MAPPING_PREFIX}${sessionHash}`

    await client.setex(key, ttlSeconds, mappingData)
  }

  // 🗑️ Delete session mapping
  async _deleteSessionMapping(sessionHash) {
    if (!sessionHash) {
      return
    }

    const client = redis.getClientSafe()
    const key = `${this.SESSION_MAPPING_PREFIX}${sessionHash}`
    await client.del(key)
  }

  // 🔁 Extend session mapping TTL
  async _extendSessionMappingTTL(sessionHash) {
    if (!sessionHash) {
      return false
    }

    try {
      const client = redis.getClientSafe()
      const key = `${this.SESSION_MAPPING_PREFIX}${sessionHash}`
      const remainingTTL = await client.ttl(key)

      if (remainingTTL === -2) {
        return false
      }
      if (remainingTTL === -1) {
        return true
      }

      const appConfig = require('../../../config/config')
      const ttlHours = appConfig.session?.stickyTtlHours || 1
      const renewalThresholdMinutes = appConfig.session?.renewalThresholdMinutes || 0
      if (!renewalThresholdMinutes) {
        return true
      }

      const fullTTL = Math.max(1, Math.floor(ttlHours * 60 * 60))
      const threshold = Math.max(0, Math.floor(renewalThresholdMinutes * 60))

      if (remainingTTL < threshold) {
        await client.expire(key, fullTTL)
        logger.debug(
          `🔄 Renewed Vertex AI session TTL: ${sessionHash} (was ${Math.round(remainingTTL / 60)}m, renewed to ${ttlHours}h)`
        )
      } else {
        logger.debug(
          `✅ Vertex AI session TTL sufficient: ${sessionHash} (remaining ${Math.round(remainingTTL / 60)}m)`
        )
      }
      return true
    } catch (error) {
      logger.error('❌ Failed to extend Vertex AI session TTL:', error)
      return false
    }
  }

  // 🚫 Mark account as rate limited
  async markAccountRateLimited(accountId, accountType, sessionHash = null) {
    try {
      if (accountType === 'vertex-ai') {
        await vertexAiAccountService.setAccountRateLimited(accountId, true)
      }

      // Delete session mapping
      if (sessionHash) {
        await this._deleteSessionMapping(sessionHash)
      }

      return { success: true }
    } catch (error) {
      logger.error(
        `❌ Failed to mark Vertex AI account as rate limited: ${accountId} (${accountType})`,
        error
      )
      throw error
    }
  }

  // ✅ Remove account rate limit
  async removeAccountRateLimit(accountId, accountType) {
    try {
      if (accountType === 'vertex-ai') {
        await vertexAiAccountService.setAccountRateLimited(accountId, false)
      }

      return { success: true }
    } catch (error) {
      logger.error(
        `❌ Failed to remove rate limit for Vertex AI account: ${accountId} (${accountType})`,
        error
      )
      throw error
    }
  }

  // 🔍 Check if account is rate limited
  async isAccountRateLimited(accountId, accountType = null) {
    try {
      const account = await vertexAiAccountService.getAccount(accountId)

      if (!account) {
        return false
      }

      if (account.rateLimitStatus === 'limited' && account.rateLimitedAt) {
        const limitedAt = new Date(account.rateLimitedAt).getTime()
        const now = Date.now()
        // Use account configuration for rate limit duration, default 1 hour
        const rateLimitDuration = parseInt(account.rateLimitDuration) || 60
        const limitDuration = rateLimitDuration * 60 * 1000

        return now < limitedAt + limitDuration
      }
      return false
    } catch (error) {
      logger.error(
        `❌ Failed to check rate limit status for Vertex AI account: ${accountId}`,
        error
      )
      return false
    }
  }
}

module.exports = new UnifiedVertexScheduler()
