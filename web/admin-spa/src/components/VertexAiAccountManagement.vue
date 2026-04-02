<template>
  <div class="vertex-ai-accounts-container">
    <!-- Header Section -->
    <div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 class="text-xl font-bold text-gray-900 dark:text-gray-100 sm:text-2xl">
          Vertex AI 账户管理
        </h2>
        <p class="text-sm text-gray-600 dark:text-gray-400 sm:text-base">
          管理 Google Cloud Vertex AI 账户配置与监控
        </p>
      </div>
      <div class="flex gap-3">
        <el-button
          class="bg-blue-500 hover:bg-blue-600"
          :icon="Plus"
          type="primary"
          @click="showCreateModal = true"
        >
          创建账户
        </el-button>
      </div>
    </div>

    <!-- Filters and Search -->
    <div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
        <!-- Status Filter -->
        <div class="min-w-[120px]">
          <el-select v-model="statusFilter" placeholder="选择状态" size="default">
            <el-option label="全部状态" value="all" />
            <el-option label="活跃" value="active" />
            <el-option label="禁用" value="inactive" />
            <el-option label="错误" value="error" />
          </el-select>
        </div>
        <!-- Group Filter -->
        <div class="min-w-[160px]">
          <el-select v-model="groupFilter" placeholder="选择分组" size="default">
            <el-option label="全部分组" value="all" />
            <el-option
              v-for="group in accountGroups"
              :key="group.id"
              :label="group.name"
              :value="group.id"
            />
          </el-select>
        </div>
      </div>

      <!-- Search -->
      <div class="min-w-[200px]">
        <el-input
          v-model="searchKeyword"
          clearable
          placeholder="搜索账户名称..."
          :prefix-icon="Search"
          size="default"
        />
      </div>
    </div>

    <!-- Account Table -->
    <div class="card overflow-hidden">
      <el-table
        v-loading="loading"
        class="w-full"
        :class="{ 'dark-table': isDark }"
        :data="filteredAccounts"
        stripe
      >
        <!-- Name Column -->
        <el-table-column label="账户名称" min-width="150" prop="name">
          <template #default="{ row }">
            <div class="flex items-center gap-2">
              <div
                class="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-600"
              >
                <i class="fab fa-google text-sm text-white" />
              </div>
              <span class="font-medium text-gray-900 dark:text-gray-100">{{ row.name }}</span>
            </div>
          </template>
        </el-table-column>

        <!-- Project ID Column -->
        <el-table-column label="项目 ID" min-width="180" prop="projectId">
          <template #default="{ row }">
            <code
              class="rounded bg-gray-100 px-2 py-1 text-sm text-gray-700 dark:bg-gray-700 dark:text-gray-300"
            >
              {{ row.projectId }}
            </code>
          </template>
        </el-table-column>

        <!-- Region Column -->
        <el-table-column label="地区" min-width="120" prop="region">
          <template #default="{ row }">
            <el-tag size="small" type="info">{{ row.region }}</el-tag>
          </template>
        </el-table-column>

        <!-- Status Column -->
        <el-table-column label="状态" prop="status" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="getStatusTagType(row.status)">
              {{ getStatusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>

        <!-- Usage Stats Column -->
        <el-table-column label="使用统计" min-width="180">
          <template #default="{ row }">
            <div class="space-y-1 text-xs text-gray-600 dark:text-gray-400">
              <div>
                今日请求: <span class="font-medium">{{ row.dailyRequests || 0 }}</span>
              </div>
              <div>
                今日 Token:
                <span class="font-medium">{{ formatNumber(row.dailyTokens || 0) }}</span>
              </div>
              <div v-if="row.lastUsed" class="text-gray-500">
                最后使用: {{ formatTimeAgo(row.lastUsed) }}
              </div>
            </div>
          </template>
        </el-table-column>

        <!-- Health Status Column -->
        <el-table-column label="健康状态" width="120">
          <template #default="{ row }">
            <div class="flex items-center gap-2">
              <div
                :class="[
                  'h-2 w-2 rounded-full',
                  getConnectionStatus(row) === 'healthy'
                    ? 'bg-green-500'
                    : getConnectionStatus(row) === 'warning'
                      ? 'bg-yellow-500'
                      : 'bg-red-500'
                ]"
              />
              <span class="text-xs text-gray-600 dark:text-gray-400">
                {{ getConnectionStatusText(row) }}
              </span>
            </div>
          </template>
        </el-table-column>

        <!-- Actions Column -->
        <el-table-column fixed="right" label="操作" width="180">
          <template #default="{ row }">
            <div class="flex gap-1">
              <el-tooltip content="测试连接" placement="top">
                <el-button
                  :icon="Connection"
                  :loading="testingConnections[row.id]"
                  size="small"
                  type="info"
                  @click="testConnection(row)"
                />
              </el-tooltip>

              <el-tooltip content="编辑" placement="top">
                <el-button :icon="Edit" size="small" type="primary" @click="editAccount(row)" />
              </el-tooltip>

              <el-dropdown @command="(cmd) => handleDropdownCommand(cmd, row)">
                <el-button :icon="MoreFilled" size="small" type="info" />
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item
                      :command="`toggle-${row.id}`"
                      :icon="row.status === 'active' ? Close : Check"
                    >
                      {{ row.status === 'active' ? '禁用账户' : '启用账户' }}
                    </el-dropdown-item>
                    <el-dropdown-item :command="`usage-${row.id}`" :icon="DataLine">
                      使用详情
                    </el-dropdown-item>
                    <el-dropdown-item :command="`delete-${row.id}`" divided :icon="Delete">
                      删除账户
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- Statistics Panel -->
    <div v-if="showStats" class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div class="card p-4">
        <div class="flex items-center gap-3">
          <div
            class="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/20"
          >
            <i class="fas fa-server text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <p class="text-sm text-gray-600 dark:text-gray-400">总账户数</p>
            <p class="text-xl font-bold text-gray-900 dark:text-gray-100">
              {{ vertexAiAccounts.length }}
            </p>
          </div>
        </div>
      </div>

      <div class="card p-4">
        <div class="flex items-center gap-3">
          <div
            class="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/20"
          >
            <i class="fas fa-check-circle text-green-600 dark:text-green-400" />
          </div>
          <div>
            <p class="text-sm text-gray-600 dark:text-gray-400">活跃账户</p>
            <p class="text-xl font-bold text-gray-900 dark:text-gray-100">
              {{ activeAccountsCount }}
            </p>
          </div>
        </div>
      </div>

      <div class="card p-4">
        <div class="flex items-center gap-3">
          <div
            class="flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-100 dark:bg-yellow-900/20"
          >
            <i class="fas fa-chart-line text-yellow-600 dark:text-yellow-400" />
          </div>
          <div>
            <p class="text-sm text-gray-600 dark:text-gray-400">今日请求</p>
            <p class="text-xl font-bold text-gray-900 dark:text-gray-100">
              {{ totalDailyRequests }}
            </p>
          </div>
        </div>
      </div>

      <div class="card p-4">
        <div class="flex items-center gap-3">
          <div
            class="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/20"
          >
            <i class="fas fa-coins text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <p class="text-sm text-gray-600 dark:text-gray-400">今日 Token</p>
            <p class="text-xl font-bold text-gray-900 dark:text-gray-100">
              {{ formatNumber(totalDailyTokens) }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- Create Account Modal -->
    <el-dialog
      v-model="showCreateModal"
      :before-close="handleCreateClose"
      title="创建 Vertex AI 账户"
      width="600px"
    >
      <el-form
        ref="createFormRef"
        class="space-y-4"
        label-width="120px"
        :model="createForm"
        :rules="createRules"
      >
        <el-form-item label="账户名称" prop="name">
          <el-input v-model="createForm.name" clearable placeholder="请输入账户名称" />
        </el-form-item>

        <el-form-item label="项目 ID" prop="projectId">
          <el-input
            v-model="createForm.projectId"
            clearable
            placeholder="请输入 Google Cloud 项目 ID"
          />
        </el-form-item>

        <el-form-item label="地区" prop="region">
          <el-select v-model="createForm.region" placeholder="选择地区" style="width: 100%">
            <el-option
              v-for="region in availableRegions"
              :key="region.value"
              :label="region.label"
              :value="region.value"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="服务账户 JSON" prop="serviceAccountJson">
          <el-upload
            ref="uploadRef"
            accept=".json"
            :auto-upload="false"
            :before-upload="handleFileSelect"
            class="w-full"
            drag
            :show-file-list="false"
          >
            <div class="upload-area p-6 text-center">
              <i class="el-icon-upload mb-2 text-2xl text-gray-400" />
              <div class="text-gray-600 dark:text-gray-400">
                <p>点击或拖拽上传服务账户 JSON 文件</p>
                <p class="text-sm text-gray-500">仅支持 .json 格式文件</p>
              </div>
              <div v-if="selectedFileName" class="mt-2 text-sm text-blue-600">
                已选择: {{ selectedFileName }}
              </div>
            </div>
          </el-upload>
        </el-form-item>

        <el-form-item label="账户分组" prop="accountGroup">
          <el-select
            v-model="createForm.accountGroup"
            placeholder="选择分组（可选）"
            style="width: 100%"
          >
            <el-option label="不设置分组" value="" />
            <el-option
              v-for="group in accountGroups"
              :key="group.id"
              :label="group.name"
              :value="group.id"
            />
          </el-select>
        </el-form-item>
      </el-form>

      <template #footer>
        <div class="flex justify-end gap-3">
          <el-button @click="handleCreateClose">取消</el-button>
          <el-button
            class="bg-blue-500 hover:bg-blue-600"
            :loading="createLoading"
            type="primary"
            @click="createAccount"
          >
            创建账户
          </el-button>
        </div>
      </template>
    </el-dialog>

    <!-- Edit Account Modal -->
    <el-dialog
      v-model="showEditModal"
      :before-close="handleEditClose"
      title="编辑 Vertex AI 账户"
      width="600px"
    >
      <el-form
        ref="editFormRef"
        class="space-y-4"
        label-width="120px"
        :model="editForm"
        :rules="editRules"
      >
        <el-form-item label="账户名称" prop="name">
          <el-input v-model="editForm.name" clearable placeholder="请输入账户名称" />
        </el-form-item>

        <el-form-item label="项目 ID" prop="projectId">
          <el-input
            v-model="editForm.projectId"
            clearable
            placeholder="请输入 Google Cloud 项目 ID"
          />
        </el-form-item>

        <el-form-item label="地区" prop="region">
          <el-select v-model="editForm.region" placeholder="选择地区" style="width: 100%">
            <el-option
              v-for="region in availableRegions"
              :key="region.value"
              :label="region.label"
              :value="region.value"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="账户分组" prop="accountGroup">
          <el-select
            v-model="editForm.accountGroup"
            placeholder="选择分组（可选）"
            style="width: 100%"
          >
            <el-option label="不设置分组" value="" />
            <el-option
              v-for="group in accountGroups"
              :key="group.id"
              :label="group.name"
              :value="group.id"
            />
          </el-select>
        </el-form-item>
      </el-form>

      <template #footer>
        <div class="flex justify-end gap-3">
          <el-button @click="handleEditClose">取消</el-button>
          <el-button
            class="bg-blue-500 hover:bg-blue-600"
            :loading="editLoading"
            type="primary"
            @click="updateAccount"
          >
            保存更改
          </el-button>
        </div>
      </template>
    </el-dialog>

    <!-- Usage Detail Modal -->
    <el-dialog v-model="showUsageModal" title="使用详情" width="800px">
      <div v-if="selectedAccount" class="space-y-6">
        <!-- Account Info -->
        <div class="border-b border-gray-200 pb-4 dark:border-gray-700">
          <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100">
            {{ selectedAccount.name }}
          </h3>
          <p class="text-sm text-gray-600 dark:text-gray-400">
            项目 ID: {{ selectedAccount.projectId }} | 地区: {{ selectedAccount.region }}
          </p>
        </div>

        <!-- Usage Stats -->
        <div class="grid gap-4 sm:grid-cols-2">
          <div class="card p-4">
            <h4 class="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">今日使用</h4>
            <div class="space-y-2 text-sm">
              <div class="flex justify-between">
                <span class="text-gray-600 dark:text-gray-400">请求次数:</span>
                <span class="font-medium">{{ selectedAccount.dailyRequests || 0 }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-600 dark:text-gray-400">Token 使用:</span>
                <span class="font-medium">{{
                  formatNumber(selectedAccount.dailyTokens || 0)
                }}</span>
              </div>
            </div>
          </div>

          <div class="card p-4">
            <h4 class="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">健康状态</h4>
            <div class="space-y-2 text-sm">
              <div class="flex items-center justify-between">
                <span class="text-gray-600 dark:text-gray-400">连接状态:</span>
                <div class="flex items-center gap-2">
                  <div
                    :class="[
                      'h-2 w-2 rounded-full',
                      getConnectionStatus(selectedAccount) === 'healthy'
                        ? 'bg-green-500'
                        : getConnectionStatus(selectedAccount) === 'warning'
                          ? 'bg-yellow-500'
                          : 'bg-red-500'
                    ]"
                  />
                  <span class="font-medium">{{ getConnectionStatusText(selectedAccount) }}</span>
                </div>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-600 dark:text-gray-400">错误计数:</span>
                <span class="font-medium">{{ selectedAccount.errorCount || 0 }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="flex justify-end">
          <el-button @click="showUsageModal = false">关闭</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Plus,
  Search,
  Edit,
  Delete,
  Check,
  Close,
  Connection,
  MoreFilled,
  DataLine
} from '@element-plus/icons-vue'
import { useAccountsStore } from '@/stores/accounts'
import { useThemeStore } from '@/stores/theme'
import * as httpApis from '@/utils/http_apis'

// Store instances
const accountsStore = useAccountsStore()
const themeStore = useThemeStore()

// Reactive references
const loading = ref(false)
const showStats = ref(true)
const statusFilter = ref('all')
const groupFilter = ref('all')
const searchKeyword = ref('')

// Modal states
const showCreateModal = ref(false)
const showEditModal = ref(false)
const showUsageModal = ref(false)
const createLoading = ref(false)
const editLoading = ref(false)
const testingConnections = ref({})
const selectedAccount = ref(null)

// Account groups
const accountGroups = ref([])

// File upload state
const selectedFileName = ref('')
const uploadRef = ref()
const createFormRef = ref()
const editFormRef = ref()

// Create form
const createForm = ref({
  name: '',
  projectId: '',
  region: '',
  serviceAccountJson: '',
  accountGroup: ''
})

// Edit form
const editForm = ref({
  id: '',
  name: '',
  projectId: '',
  region: '',
  accountGroup: ''
})

// Available regions for Vertex AI
const availableRegions = [
  { value: 'us-central1', label: 'US Central 1 (Iowa)' },
  { value: 'us-east1', label: 'US East 1 (South Carolina)' },
  { value: 'us-west1', label: 'US West 1 (Oregon)' },
  { value: 'us-west4', label: 'US West 4 (Nevada)' },
  { value: 'europe-west1', label: 'Europe West 1 (Belgium)' },
  { value: 'europe-west4', label: 'Europe West 4 (Netherlands)' },
  { value: 'asia-east1', label: 'Asia East 1 (Taiwan)' },
  { value: 'asia-northeast1', label: 'Asia Northeast 1 (Tokyo)' },
  { value: 'asia-southeast1', label: 'Asia Southeast 1 (Singapore)' }
]

// Form validation rules
const createRules = {
  name: [
    { required: true, message: '请输入账户名称', trigger: 'blur' },
    { min: 2, max: 50, message: '长度在 2 到 50 个字符', trigger: 'blur' }
  ],
  projectId: [
    { required: true, message: '请输入项目 ID', trigger: 'blur' },
    {
      pattern: /^[a-z0-9-]+[a-z0-9]$/,
      message: '项目 ID 格式不正确',
      trigger: 'blur'
    }
  ],
  region: [{ required: true, message: '请选择地区', trigger: 'change' }],
  serviceAccountJson: [{ required: true, message: '请上传服务账户 JSON 文件', trigger: 'change' }]
}

const editRules = {
  name: [
    { required: true, message: '请输入账户名称', trigger: 'blur' },
    { min: 2, max: 50, message: '长度在 2 到 50 个字符', trigger: 'blur' }
  ],
  projectId: [
    { required: true, message: '请输入项目 ID', trigger: 'blur' },
    {
      pattern: /^[a-z0-9-]+[a-z0-9]$/,
      message: '项目 ID 格式不正确',
      trigger: 'blur'
    }
  ],
  region: [{ required: true, message: '请选择地区', trigger: 'change' }]
}

// Computed properties
const isDark = computed(() => themeStore.isDark)
const vertexAiAccounts = computed(() => accountsStore.vertexAiAccounts || [])

const filteredAccounts = computed(() => {
  let filtered = [...vertexAiAccounts.value]

  // Status filter
  if (statusFilter.value !== 'all') {
    filtered = filtered.filter((account) => account.status === statusFilter.value)
  }

  // Group filter
  if (groupFilter.value !== 'all') {
    filtered = filtered.filter((account) => account.accountGroup === groupFilter.value)
  }

  // Search filter
  if (searchKeyword.value.trim()) {
    const keyword = searchKeyword.value.toLowerCase()
    filtered = filtered.filter(
      (account) =>
        account.name?.toLowerCase().includes(keyword) ||
        account.projectId?.toLowerCase().includes(keyword)
    )
  }

  return filtered
})

const activeAccountsCount = computed(
  () => vertexAiAccounts.value.filter((account) => account.status === 'active').length
)

const totalDailyRequests = computed(() =>
  vertexAiAccounts.value.reduce((sum, account) => sum + (account.dailyRequests || 0), 0)
)

const totalDailyTokens = computed(() =>
  vertexAiAccounts.value.reduce((sum, account) => sum + (account.dailyTokens || 0), 0)
)

// Methods
const formatNumber = (num) => {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M'
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K'
  }
  return num.toString()
}

const formatTimeAgo = (timestamp) => {
  if (!timestamp) return '从未使用'
  const now = new Date()
  const time = new Date(timestamp)
  const diffInMinutes = Math.floor((now - time) / (1000 * 60))

  if (diffInMinutes < 1) return '刚刚'
  if (diffInMinutes < 60) return `${diffInMinutes} 分钟前`
  if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)} 小时前`
  return `${Math.floor(diffInMinutes / 1440)} 天前`
}

const getStatusTagType = (status) => {
  switch (status) {
    case 'active':
      return 'success'
    case 'inactive':
      return 'info'
    case 'error':
      return 'danger'
    default:
      return 'warning'
  }
}

const getStatusText = (status) => {
  switch (status) {
    case 'active':
      return '活跃'
    case 'inactive':
      return '禁用'
    case 'error':
      return '错误'
    default:
      return '未知'
  }
}

const getConnectionStatus = (account) => {
  if (account.status !== 'active') return 'error'
  if (!account.lastUsed) return 'warning'

  const now = new Date()
  const lastUsed = new Date(account.lastUsed)
  const diffInHours = (now - lastUsed) / (1000 * 60 * 60)

  if (diffInHours <= 24) return 'healthy'
  if (diffInHours <= 72) return 'warning'
  return 'error'
}

const getConnectionStatusText = (account) => {
  const status = getConnectionStatus(account)
  switch (status) {
    case 'healthy':
      return '正常'
    case 'warning':
      return '警告'
    case 'error':
      return '异常'
    default:
      return '未知'
  }
}

const handleFileSelect = (file) => {
  if (!file.name.endsWith('.json')) {
    ElMessage.error('请选择 JSON 格式的文件')
    return false
  }

  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const jsonContent = JSON.parse(e.target.result)
      createForm.value.serviceAccountJson = JSON.stringify(jsonContent)
      selectedFileName.value = file.name
    } catch (error) {
      ElMessage.error('JSON 文件格式错误')
      createForm.value.serviceAccountJson = ''
      selectedFileName.value = ''
    }
  }
  reader.readAsText(file)

  return false // Prevent auto upload
}

const testConnection = async (account) => {
  testingConnections.value[account.id] = true
  try {
    const result = await testVertexAiAccount(account.id)
    if (result.success) {
      ElMessage.success('连接测试成功')
    } else {
      ElMessage.error(`连接测试失败: ${result.message}`)
    }
  } catch (error) {
    ElMessage.error('连接测试失败')
  } finally {
    testingConnections.value[account.id] = false
  }
}

const editAccount = (account) => {
  editForm.value = {
    id: account.id,
    name: account.name,
    projectId: account.projectId,
    region: account.region,
    accountGroup: account.accountGroup || ''
  }
  showEditModal.value = true
}

const handleDropdownCommand = async (command, account) => {
  const [action] = command.split('-')

  switch (action) {
    case 'toggle':
      await toggleAccountStatus(account)
      break
    case 'usage':
      showUsageDetails(account)
      break
    case 'delete':
      await deleteAccount(account)
      break
  }
}

const toggleAccountStatus = async (account) => {
  try {
    const result = await accountsStore.toggleAccount('vertex_ai', account.id)
    if (result.success) {
      ElMessage.success(`账户已${account.status === 'active' ? '禁用' : '启用'}`)
      await loadAccounts()
    } else {
      ElMessage.error(`操作失败: ${result.message}`)
    }
  } catch (error) {
    ElMessage.error('操作失败')
  }
}

const showUsageDetails = (account) => {
  selectedAccount.value = account
  showUsageModal.value = true
}

const deleteAccount = async (account) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除账户 "${account.name}" 吗？此操作不可撤销。`,
      '删除确认',
      {
        confirmButtonText: '确定删除',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    const result = await accountsStore.deleteAccount('vertex_ai', account.id)
    if (result.success) {
      ElMessage.success('账户删除成功')
      await loadAccounts()
    } else {
      ElMessage.error(`删除失败: ${result.message}`)
    }
  } catch (error) {
    // User cancelled or error occurred
    if (error !== 'cancel') {
      ElMessage.error('删除失败')
    }
  }
}

const createAccount = async () => {
  if (!createFormRef.value) return

  const valid = await createFormRef.value.validate()
  if (!valid) return

  createLoading.value = true
  try {
    const result = await accountsStore.createVertexAiAccount(createForm.value)
    if (result.success) {
      ElMessage.success('账户创建成功')
      showCreateModal.value = false
      resetCreateForm()
      await loadAccounts()
    } else {
      ElMessage.error(`创建失败: ${result.message}`)
    }
  } catch (error) {
    ElMessage.error('创建失败')
  } finally {
    createLoading.value = false
  }
}

const updateAccount = async () => {
  if (!editFormRef.value) return

  const valid = await editFormRef.value.validate()
  if (!valid) return

  editLoading.value = true
  try {
    const { id, ...updateData } = editForm.value
    const result = await accountsStore.updateVertexAiAccount(id, updateData)
    if (result.success) {
      ElMessage.success('账户更新成功')
      showEditModal.value = false
      await loadAccounts()
    } else {
      ElMessage.error(`更新失败: ${result.message}`)
    }
  } catch (error) {
    ElMessage.error('更新失败')
  } finally {
    editLoading.value = false
  }
}

const resetCreateForm = () => {
  createForm.value = {
    name: '',
    projectId: '',
    region: '',
    serviceAccountJson: '',
    accountGroup: ''
  }
  selectedFileName.value = ''
  createFormRef.value?.resetFields()
}

const handleCreateClose = () => {
  if (createLoading.value) return
  showCreateModal.value = false
  resetCreateForm()
}

const handleEditClose = () => {
  if (editLoading.value) return
  showEditModal.value = false
  editFormRef.value?.resetFields()
}

const loadAccounts = async () => {
  loading.value = true
  try {
    await accountsStore.fetchVertexAiAccounts()
  } catch (error) {
    ElMessage.error('加载账户列表失败')
  } finally {
    loading.value = false
  }
}

const loadAccountGroups = async () => {
  // This would typically load from an API
  // For now, we'll use a placeholder
  accountGroups.value = []
}

// Lifecycle
onMounted(async () => {
  await loadAccounts()
  await loadAccountGroups()
})

// Test connection method using HTTP API
const testVertexAiAccount = async (id) => {
  return await httpApis.testVertexAiAccountApi(id)
}
</script>

<style scoped>
.vertex-ai-accounts-container {
  @apply space-y-6;
}

.card {
  @apply rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800;
}

.upload-area {
  @apply rounded-lg border-2 border-dashed border-gray-300 transition-colors dark:border-gray-600;
}

.upload-area:hover {
  @apply border-blue-400 dark:border-blue-500;
}

:deep(.el-table) {
  @apply bg-white dark:bg-gray-800;
}

:deep(.el-table th) {
  @apply dark:bg-gray-750 bg-gray-50 text-gray-900 dark:text-gray-100;
}

:deep(.el-table td) {
  @apply text-gray-900 dark:text-gray-100;
}

:deep(.el-table--striped .el-table__body tr.el-table__row--striped td) {
  @apply dark:bg-gray-750/50 bg-gray-50/50;
}

:deep(.el-table tbody tr:hover > td) {
  @apply bg-blue-50/50 dark:bg-blue-900/10;
}
</style>
