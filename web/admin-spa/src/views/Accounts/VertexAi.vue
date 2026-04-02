<template>
  <div class="vertex-ai-accounts-page">
    <!-- Page Header -->
    <div class="mb-6">
      <!-- Breadcrumb Navigation -->
      <nav aria-label="Breadcrumb" class="mb-4 flex">
        <ol class="flex items-center space-x-1 md:space-x-3">
          <li class="flex items-center">
            <router-link
              class="ml-1 text-sm font-medium text-gray-700 hover:text-blue-600 dark:text-gray-400 dark:hover:text-white md:ml-2"
              to="/dashboard"
            >
              <i class="fas fa-home mr-1" />
              首页
            </router-link>
          </li>
          <li aria-current="page">
            <div class="flex items-center">
              <i class="fas fa-chevron-right mx-1 text-gray-400" />
              <router-link
                class="ml-1 text-sm font-medium text-gray-700 hover:text-blue-600 dark:text-gray-400 dark:hover:text-white md:ml-2"
                to="/accounts"
              >
                账户管理
              </router-link>
            </div>
          </li>
          <li aria-current="page">
            <div class="flex items-center">
              <i class="fas fa-chevron-right mx-1 text-gray-400" />
              <span class="ml-1 text-sm font-medium text-gray-500 dark:text-gray-400 md:ml-2">
                Vertex AI 账户
              </span>
            </div>
          </li>
        </ol>
      </nav>

      <!-- Page Title and Description -->
      <div class="flex items-center gap-4">
        <div
          class="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg"
        >
          <i class="fab fa-google text-xl text-white" />
        </div>
        <div>
          <h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
            Vertex AI 账户管理
          </h1>
          <p class="mt-1 text-sm text-gray-600 dark:text-gray-400 sm:text-base">
            管理 Google Cloud Vertex AI 账户配置、使用统计和监控状态
          </p>
        </div>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="isInitialLoading" class="flex h-64 items-center justify-center">
      <div class="text-center">
        <div class="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-b-2 border-blue-500" />
        <p class="text-sm text-gray-600 dark:text-gray-400">正在加载 Vertex AI 账户...</p>
      </div>
    </div>

    <!-- Error State -->
    <div v-else-if="hasError" class="rounded-lg bg-red-50 p-6 text-center dark:bg-red-900/20">
      <i class="fas fa-exclamation-triangle mb-4 text-4xl text-red-500" />
      <h3 class="mb-2 text-lg font-medium text-red-800 dark:text-red-200">加载失败</h3>
      <p class="mb-4 text-red-600 dark:text-red-300">
        {{ errorMessage || '无法加载 Vertex AI 账户列表，请稍后重试' }}
      </p>
      <el-button
        class="bg-red-500 hover:bg-red-600"
        :loading="isRetrying"
        type="primary"
        @click="retryLoading"
      >
        <i class="fas fa-redo mr-2" />
        重试
      </el-button>
    </div>

    <!-- Main Content -->
    <div v-else class="vertex-ai-content">
      <!-- Account Management Component -->
      <VertexAiAccountManagement />
    </div>

    <!-- Help & Documentation Panel -->
    <div class="mt-8 rounded-lg bg-blue-50 p-6 dark:bg-blue-900/20">
      <div class="flex items-start gap-4">
        <div
          class="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-800"
        >
          <i class="fas fa-info-circle text-blue-600 dark:text-blue-400" />
        </div>
        <div class="flex-1">
          <h3 class="mb-2 text-lg font-medium text-blue-900 dark:text-blue-100">
            Vertex AI 账户配置说明
          </h3>
          <div class="space-y-2 text-sm text-blue-800 dark:text-blue-200">
            <p>
              <strong>项目配置:</strong> 确保您的 Google Cloud 项目已启用 Vertex AI
              API，并且服务账户具有必要的权限。
            </p>
            <p>
              <strong>服务账户权限:</strong> 需要 'Vertex AI User' 和 'Service Account Token
              Creator' 角色。
            </p>
            <p><strong>支持的地区:</strong> 请选择距离您用户群体最近的地区以获得最佳性能。</p>
            <p>
              <strong>费用说明:</strong> 使用 Vertex AI 将根据 Google Cloud 计费标准收费，请查看您的
              Google Cloud 控制台以监控费用。
            </p>
          </div>
          <div class="mt-4 flex gap-3">
            <a
              class="inline-flex items-center text-sm font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
              href="https://cloud.google.com/vertex-ai/docs"
              target="_blank"
            >
              <i class="fas fa-external-link-alt mr-1" />
              Vertex AI 文档
            </a>
            <a
              class="inline-flex items-center text-sm font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
              href="https://cloud.google.com/iam/docs/service-accounts"
              target="_blank"
            >
              <i class="fas fa-external-link-alt mr-1" />
              服务账户文档
            </a>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import { useAccountsStore } from '@/stores/accounts'
import VertexAiAccountManagement from '@/components/VertexAiAccountManagement.vue'

// Store instance
const accountsStore = useAccountsStore()

// Page state
const isInitialLoading = ref(true)
const hasError = ref(false)
const errorMessage = ref('')
const isRetrying = ref(false)

// Auto-refresh interval
let refreshInterval = null

// Methods
const loadPageData = async () => {
  try {
    hasError.value = false
    errorMessage.value = ''

    // Load Vertex AI accounts
    await accountsStore.fetchVertexAiAccounts()

    isInitialLoading.value = false
  } catch (error) {
    console.error('Failed to load Vertex AI accounts page:', error)
    hasError.value = true
    errorMessage.value = error?.message || '加载失败，请检查网络连接'
    isInitialLoading.value = false
  }
}

const retryLoading = async () => {
  isRetrying.value = true
  try {
    await loadPageData()
    ElMessage.success('重新加载成功')
  } catch (error) {
    ElMessage.error('重新加载失败')
  } finally {
    isRetrying.value = false
  }
}

const setupAutoRefresh = () => {
  // Refresh accounts data every 5 minutes
  refreshInterval = setInterval(
    async () => {
      try {
        await accountsStore.fetchVertexAiAccounts()
      } catch (error) {
        console.warn('Auto-refresh failed:', error)
        // Don't show error messages for auto-refresh failures
      }
    },
    5 * 60 * 1000
  ) // 5 minutes
}

const teardownAutoRefresh = () => {
  if (refreshInterval) {
    clearInterval(refreshInterval)
    refreshInterval = null
  }
}

// Lifecycle
onMounted(async () => {
  // Set page title
  document.title = 'Vertex AI 账户管理 - Claude Relay Service'

  // Load initial data
  await loadPageData()

  // Setup auto-refresh
  setupAutoRefresh()
})

onBeforeUnmount(() => {
  teardownAutoRefresh()
})

// Handle browser visibility changes to pause/resume auto-refresh
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    teardownAutoRefresh()
  } else {
    setupAutoRefresh()
  }
})
</script>

<style scoped>
.vertex-ai-accounts-page {
  @apply min-h-screen p-4 sm:p-6;
}

.vertex-ai-content {
  @apply space-y-6;
}

/* Breadcrumb hover effects */
nav a:hover {
  @apply transform transition-transform duration-200;
  @apply scale-105;
}

/* Loading spinner animation */
@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.animate-spin {
  animation: spin 1s linear infinite;
}

/* Responsive improvements */
@media (max-width: 640px) {
  .vertex-ai-accounts-page {
    @apply px-4 py-4;
  }
}
</style>
