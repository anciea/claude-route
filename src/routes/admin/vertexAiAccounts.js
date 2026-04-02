/**
 * Admin Routes - Vertex AI 账户管理
 * Service Account JSON 方式授权的 Vertex AI 账户
 */

const express = require('express')
const router = express.Router()

const vertexAiAccountService = require('../../services/account/vertexAiAccountService')
const accountGroupService = require('../../services/accountGroupService')
const apiKeyService = require('../../services/apiKeyService')
const redis = require('../../models/redis')
const { authenticateAdmin } = require('../../middleware/auth')
const logger = require('../../utils/logger')
const webhookNotifier = require('../../utils/webhookNotifier')
const { formatAccountExpiry, mapExpiryField } = require('./utils')

// 获取所有 Vertex AI 账户
router.get('/vertex-ai-accounts', authenticateAdmin, async (req, res) => {
  try {
    const { platform, groupId } = req.query
    let accounts = await vertexAiAccountService.getAllAccounts()

    // 根据查询参数进行筛选
    if (platform && platform !== 'all' && platform !== 'vertex-ai') {
      // 如果指定了其他平台,返回空数组
      accounts = []
    }

    // 如果指定了分组筛选
    if (groupId && groupId !== 'all') {
      if (groupId === 'ungrouped') {
        // 筛选未分组账户
        const filteredAccounts = []
        for (const account of accounts) {
          const groups = await accountGroupService.getAccountGroups(account.id)
          if (!groups || groups.length === 0) {
            filteredAccounts.push(account)
          }
        }
        accounts = filteredAccounts
      } else {
        // 筛选特定分组的账户
        const groupMembers = await accountGroupService.getGroupMembers(groupId)
        accounts = accounts.filter((account) => groupMembers.includes(account.id))
      }
    }

    // 为每个账户添加使用统计信息和分组信息
    const accountsWithStats = await Promise.all(
      accounts.map(async (account) => {
        try {
          const usageStats = await redis.getAccountUsageStats(account.id, 'vertex-ai')
          const groupInfos = await accountGroupService.getAccountGroups(account.id)
          const formattedAccount = formatAccountExpiry(account)
          return {
            ...formattedAccount,
            groupInfos,
            usage: {
              daily: usageStats.daily,
              total: usageStats.total,
              averages: usageStats.averages
            }
          }
        } catch (error) {
          logger.debug(`Failed to get usage stats for Vertex AI account ${account.id}:`, error)
          try {
            const groupInfos = await accountGroupService.getAccountGroups(account.id)
            const formattedAccount = formatAccountExpiry(account)
            return {
              ...formattedAccount,
              groupInfos,
              usage: {
                daily: { requests: 0, tokens: 0, allTokens: 0 },
                total: { requests: 0, tokens: 0, allTokens: 0 },
                averages: { rpm: 0, tpm: 0 }
              }
            }
          } catch (groupError) {
            logger.debug(`Failed to get group info for account ${account.id}:`, groupError)
            return {
              ...account,
              groupInfos: [],
              usage: {
                daily: { requests: 0, tokens: 0, allTokens: 0 },
                total: { requests: 0, tokens: 0, allTokens: 0 },
                averages: { rpm: 0, tpm: 0 }
              }
            }
          }
        }
      })
    )

    res.json({
      success: true,
      data: accountsWithStats
    })
  } catch (error) {
    logger.error('Failed to fetch Vertex AI accounts:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to fetch accounts',
      error: error.message
    })
  }
})

// 创建 Vertex AI 账户
router.post('/vertex-ai-accounts', authenticateAdmin, async (req, res) => {
  try {
    const {
      name,
      description,
      projectId,
      location,
      serviceAccountJson,
      accountType,
      priority,
      schedulable,
      isActive,
      proxy,
      groupId,
      groupIds
    } = req.body

    // 验证必填字段
    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Account name is required'
      })
    }

    if (!projectId) {
      return res.status(400).json({
        success: false,
        message: 'Project ID is required'
      })
    }

    if (!serviceAccountJson) {
      return res.status(400).json({
        success: false,
        message: 'Service Account JSON is required'
      })
    }

    // 解析 Service Account JSON (支持字符串或对象)
    let parsedServiceAccountJson
    try {
      if (typeof serviceAccountJson === 'string') {
        parsedServiceAccountJson = JSON.parse(serviceAccountJson)
      } else {
        parsedServiceAccountJson = serviceAccountJson
      }
    } catch (parseError) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Service Account JSON format'
      })
    }

    // 验证 Service Account JSON
    const validation = vertexAiAccountService.validateServiceAccountJson(parsedServiceAccountJson)
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: validation.error
      })
    }

    // 可选：测试 Google Cloud 认证
    try {
      await vertexAiAccountService.generateAccessToken(parsedServiceAccountJson)
      logger.info('Service Account JSON validation successful - can generate access token')
    } catch (authError) {
      logger.warn(
        'Service Account JSON authentication test failed, but continuing with account creation:',
        {
          error: authError.message,
          projectId
        }
      )
      // 继续创建账户，即使 Google Cloud 认证测试失败
      // 可能是网络问题或临时的 Google 服务问题
    }

    const account = await vertexAiAccountService.createAccount({
      name,
      description,
      projectId,
      location: location || 'us-central1',
      serviceAccountJson: parsedServiceAccountJson,
      accountType: accountType || 'shared',
      priority: priority || 50,
      schedulable: schedulable !== false,
      isActive: isActive !== false,
      proxy
    })

    // 处理账户分组分配
    if (groupId || groupIds) {
      const groupsToAdd = []
      if (groupId) groupsToAdd.push(groupId)
      if (groupIds && Array.isArray(groupIds)) {
        groupsToAdd.push(...groupIds)
      }

      for (const gid of [...new Set(groupsToAdd)]) {
        try {
          await accountGroupService.addAccountToGroup(gid, account.id)
          logger.info(`Added account ${account.id} to group ${gid}`)
        } catch (groupError) {
          logger.warn(`Failed to add account ${account.id} to group ${gid}:`, groupError)
        }
      }
    }

    // 发送 webhook 通知
    try {
      await webhookNotifier.notifyAccountChange({
        action: 'create',
        accountType: 'vertex-ai',
        account,
        timestamp: new Date().toISOString()
      })
    } catch (webhookError) {
      logger.warn('Failed to send webhook notification for account creation:', webhookError)
    }

    logger.success('Successfully created Vertex AI account:', {
      accountId: account.id,
      name: account.name,
      projectId: account.projectId,
      location: account.location
    })

    res.json({
      success: true,
      data: account
    })
  } catch (error) {
    logger.error('Failed to create Vertex AI account:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to create account',
      error: error.message
    })
  }
})

// 更新 Vertex AI 账户
router.put('/vertex-ai-accounts/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const updates = mapExpiryField(req.body, 'Vertex AI', id)

    // 如果更新 Service Account JSON，需要验证
    if (updates.serviceAccountJson) {
      let parsedServiceAccountJson
      try {
        if (typeof updates.serviceAccountJson === 'string') {
          parsedServiceAccountJson = JSON.parse(updates.serviceAccountJson)
        } else {
          parsedServiceAccountJson = updates.serviceAccountJson
        }
      } catch (parseError) {
        return res.status(400).json({
          success: false,
          message: 'Invalid Service Account JSON format'
        })
      }

      const validation = vertexAiAccountService.validateServiceAccountJson(parsedServiceAccountJson)
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          message: validation.error
        })
      }

      updates.serviceAccountJson = parsedServiceAccountJson
    }

    const account = await vertexAiAccountService.updateAccount(id, updates)

    // 发送 webhook 通知
    try {
      await webhookNotifier.notifyAccountChange({
        action: 'update',
        accountType: 'vertex-ai',
        account,
        updates: Object.keys(updates),
        timestamp: new Date().toISOString()
      })
    } catch (webhookError) {
      logger.warn('Failed to send webhook notification for account update:', webhookError)
    }

    logger.success('Successfully updated Vertex AI account:', {
      accountId: id,
      updates: Object.keys(updates)
    })

    res.json({
      success: true,
      data: account
    })
  } catch (error) {
    logger.error('Failed to update Vertex AI account:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to update account',
      error: error.message
    })
  }
})

// 切换账户状态
router.put('/vertex-ai-accounts/:id/toggle', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const { isActive } = req.body

    const account = await vertexAiAccountService.updateAccount(id, { isActive })

    // 发送 webhook 通知
    try {
      await webhookNotifier.notifyAccountChange({
        action: 'toggle',
        accountType: 'vertex-ai',
        account,
        isActive,
        timestamp: new Date().toISOString()
      })
    } catch (webhookError) {
      logger.warn('Failed to send webhook notification for account toggle:', webhookError)
    }

    logger.success('Successfully toggled Vertex AI account:', {
      accountId: id,
      isActive
    })

    res.json({
      success: true,
      data: account
    })
  } catch (error) {
    logger.error('Failed to toggle Vertex AI account:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to toggle account',
      error: error.message
    })
  }
})

// 删除 Vertex AI 账户
router.delete('/vertex-ai-accounts/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params

    // 获取账户信息用于 webhook 通知
    const account = await vertexAiAccountService.getAccount(id)
    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Account not found'
      })
    }

    // 从所有分组中移除账户
    try {
      const groups = await accountGroupService.getAccountGroups(id)
      for (const group of groups) {
        await accountGroupService.removeAccountFromGroup(group.id, id)
      }
    } catch (groupError) {
      logger.warn(`Failed to remove account ${id} from groups:`, groupError)
    }

    await vertexAiAccountService.deleteAccount(id)

    // 发送 webhook 通知
    try {
      await webhookNotifier.notifyAccountChange({
        action: 'delete',
        accountType: 'vertex-ai',
        account,
        timestamp: new Date().toISOString()
      })
    } catch (webhookError) {
      logger.warn('Failed to send webhook notification for account deletion:', webhookError)
    }

    logger.success('Successfully deleted Vertex AI account:', {
      accountId: id,
      name: account.name
    })

    res.json({
      success: true,
      message: 'Account deleted successfully'
    })
  } catch (error) {
    logger.error('Failed to delete Vertex AI account:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to delete account',
      error: error.message
    })
  }
})

// 测试 Vertex AI 账户凭据
router.post('/vertex-ai-accounts/:id/test', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params

    const tokenResult = await vertexAiAccountService.getAccessToken(id)

    logger.info('Successfully tested Vertex AI account credentials:', {
      accountId: id,
      tokenExpires: tokenResult.expiresAt
    })

    res.json({
      success: true,
      message: 'Service Account JSON credentials are valid',
      data: {
        tokenGenerated: true,
        expiresAt: tokenResult.expiresAt
      }
    })
  } catch (error) {
    logger.error('Failed to test Vertex AI account credentials:', error)
    res.status(400).json({
      success: false,
      message: 'Credential test failed',
      error: error.message
    })
  }
})

module.exports = router
