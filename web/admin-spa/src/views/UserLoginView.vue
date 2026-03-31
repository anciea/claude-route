<template>
  <div
    class="relative flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12 dark:bg-gray-900 sm:px-6 lg:px-8"
  >
    <!-- 主题切换按钮 -->
    <div class="fixed right-4 top-4 z-10">
      <ThemeToggle mode="dropdown" />
    </div>

    <div class="w-full max-w-md space-y-8">
      <div>
        <div class="mx-auto flex h-12 w-auto items-center justify-center">
          <svg
            class="h-8 w-8 text-blue-600 dark:text-blue-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
            />
          </svg>
          <span class="ml-2 text-xl font-bold text-gray-900 dark:text-white">Claude Relay</span>
        </div>
        <h2 class="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-white">
          User Sign In
        </h2>
        <p class="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
          Sign in with your Google account to manage your API keys
        </p>
      </div>

      <div class="rounded-lg bg-white px-6 py-8 shadow dark:bg-gray-800 dark:shadow-xl">
        <div class="space-y-6">
          <div
            v-if="error"
            class="rounded-md border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20"
          >
            <div class="flex">
              <div class="flex-shrink-0">
                <svg class="h-5 w-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    clip-rule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    fill-rule="evenodd"
                  />
                </svg>
              </div>
              <div class="ml-3">
                <p class="text-sm text-red-700 dark:text-red-400">{{ error }}</p>
              </div>
            </div>
          </div>

          <div>
            <button
              class="group relative flex w-full justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600 dark:focus:ring-blue-400 dark:focus:ring-offset-gray-800"
              :disabled="loading"
              @click="handleGoogleLogin"
            >
              <span v-if="loading" class="absolute inset-y-0 left-0 flex items-center pl-3">
                <svg
                  class="h-5 w-5 animate-spin text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <circle
                    class="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    stroke-width="4"
                  ></circle>
                  <path
                    class="opacity-75"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    fill="currentColor"
                  ></path>
                </svg>
              </span>
              <span v-if="!loading" class="absolute inset-y-0 left-0 flex items-center pl-3">
                <svg class="h-5 w-5" viewBox="0 0 24 24">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285f4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34a853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#fbbc05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#ea4335"
                  />
                </svg>
              </span>
              {{ loading ? 'Redirecting...' : 'Sign in with Google' }}
            </button>
          </div>

          <div class="text-center">
            <router-link
              class="text-sm text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
              to="/admin-login"
            >
              Admin Login
            </router-link>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { useThemeStore } from '@/stores/theme'
import { showToast, APP_CONFIG } from '@/utils/tools'
import ThemeToggle from '@/components/common/ThemeToggle.vue'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const themeStore = useThemeStore()

const loading = ref(false)
const error = ref('')

const handleGoogleLogin = async () => {
  loading.value = true
  error.value = ''

  try {
    window.location.href = `${APP_CONFIG.apiPrefix}/auth/google`
  } catch (err) {
    console.error('Google login error:', err)
    error.value = 'Failed to initiate Google login'
    loading.value = false
  }
}

onMounted(async () => {
  // 初始化主题（因为该页面不在 MainLayout 内）
  themeStore.initTheme()

  // Check if this is an OAuth2 callback
  const { token, user, isNewUser, apiKey, apiKeyWarning, error: urlError } = route.query

  if (urlError) {
    error.value = decodeURIComponent(urlError)
    return
  }

  if (token && user) {
    try {
      loading.value = true
      const callbackResult = await userStore.handleGoogleCallback({
        token,
        user,
        isNewUser,
        apiKey,
        apiKeyWarning
      })

      showToast('Login successful!', 'success')

      // Show API key message for new users
      if (callbackResult.isNewUser && callbackResult.apiKey) {
        showToast('API key generated automatically!', 'success')
      }

      if (callbackResult.apiKeyWarning) {
        showToast(callbackResult.apiKeyWarning, 'warning')
      }

      router.push('/user-dashboard')
    } catch (err) {
      console.error('OAuth2 callback error:', err)
      error.value = err.message || 'OAuth2 callback failed'
    } finally {
      loading.value = false
    }
  }
})
</script>
