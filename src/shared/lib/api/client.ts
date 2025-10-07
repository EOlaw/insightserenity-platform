import axios, { AxiosError, AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'
import toast from 'react-hot-toast'
import Cookies from 'js-cookie'

// API Configuration - Customer Services Backend
const API_BASE_URL = process.env.NEXT_PUBLIC_CUSTOMER_API_URL || 'http://localhost:3001/api'
const AUTH_TOKEN_KEY = 'auth-token'
const REFRESH_TOKEN_KEY = 'refresh-token'

// Create axios instance for Customer Services
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
})

// Admin API client (for admin-server)
const adminApiClient: AxiosInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_ADMIN_API_URL || 'http://localhost:3002/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
})

// Request interceptor (shared)
const setupInterceptors = (client: AxiosInstance) => {
  client.interceptors.request.use(
    (config) => {
      // Add auth token to requests
      const token = Cookies.get(AUTH_TOKEN_KEY)
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }

      // Add tenant header if available
      const tenantId = localStorage.getItem('current-tenant')
      if (tenantId) {
        config.headers['X-Tenant-ID'] = tenantId
      }

      return config
    },
    (error) => {
      return Promise.reject(error)
    }
  )

  client.interceptors.response.use(
    (response: AxiosResponse) => {
      return response
    },
    async (error: AxiosError) => {
      const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean }

      // Handle 401 Unauthorized
      if (error.response?.status === 401 && !originalRequest._retry) {
        originalRequest._retry = true

        try {
          const refreshToken = Cookies.get(REFRESH_TOKEN_KEY)
          if (refreshToken) {
            const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
              refreshToken,
            })

            const { accessToken } = response.data
            Cookies.set(AUTH_TOKEN_KEY, accessToken)

            // Retry original request
            return client(originalRequest)
          }
        } catch (refreshError) {
          // Refresh failed, redirect to login
          Cookies.remove(AUTH_TOKEN_KEY)
          Cookies.remove(REFRESH_TOKEN_KEY)

          // Check if we're in admin context
          const isAdmin = window.location.pathname.startsWith('/admin-server')
          window.location.href = isAdmin ? '/admin-server/login' : '/customer-services/login'
          return Promise.reject(refreshError)
        }
      }

      // Handle other errors
      if (error.response) {
        const data = error.response.data as any
        const message = data?.message || 'An error occurred'

        switch (error.response.status) {
          case 400:
            toast.error(`Bad Request: ${message}`)
            break
          case 403:
            toast.error('You do not have permission to perform this action')
            break
          case 404:
            toast.error('Resource not found')
            break
          case 422:
            toast.error('Validation error')
            break
          case 429:
            toast.error('Too many requests. Please try again later')
            break
          case 500:
            toast.error('Server error. Please try again later')
            break
          default:
            toast.error(message)
        }
      } else if (error.request) {
        toast.error('Network error. Please check your connection')
      } else {
        toast.error('An unexpected error occurred')
      }

      return Promise.reject(error)
    }
  )
}

// Setup interceptors for both clients
setupInterceptors(apiClient)
setupInterceptors(adminApiClient)

// Create API methods factory
const createApiMethods = (client: AxiosInstance) => ({
  // Generic methods
  get: <T = any>(url: string, config?: AxiosRequestConfig) =>
    client.get<T>(url, config).then(res => res.data),

  post: <T = any>(url: string, data?: any, config?: AxiosRequestConfig) =>
    client.post<T>(url, data, config).then(res => res.data),

  put: <T = any>(url: string, data?: any, config?: AxiosRequestConfig) =>
    client.put<T>(url, data, config).then(res => res.data),

  patch: <T = any>(url: string, data?: any, config?: AxiosRequestConfig) =>
    client.patch<T>(url, data, config).then(res => res.data),

  delete: <T = any>(url: string, config?: AxiosRequestConfig) =>
    client.delete<T>(url, config).then(res => res.data),

  // File upload
  upload: async <T = any>(url: string, file: File, onProgress?: (progress: number) => void) => {
    const formData = new FormData()
    formData.append('file', file)

    return client.post<T>(url, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total)
          onProgress(progress)
        }
      },
    }).then(res => res.data)
  },

  // Batch requests
  batch: async <T = any>(requests: Array<() => Promise<any>>): Promise<T[]> => {
    return Promise.all(requests.map(request => request()))
  },
})

// Customer Services API (default)
export const api = createApiMethods(apiClient)

// Admin API
export const adminApi = createApiMethods(adminApiClient)

// Auth specific methods for Customer Services
export const auth = {
  login: async (email: string, password: string) => {
    const response = await api.post('/auth/login', { email, password })
    const { accessToken, refreshToken, user } = response.data || response

    Cookies.set(AUTH_TOKEN_KEY, accessToken)
    Cookies.set(REFRESH_TOKEN_KEY, refreshToken)

    return { user, accessToken, refreshToken }
  },

  register: async (data: any) => {
    const response = await api.post('/auth/register', data)

    // Handle token storage if provided
    if (response.data?.accessToken) {
      Cookies.set(AUTH_TOKEN_KEY, response.data.accessToken)
    }
    if (response.data?.refreshToken) {
      Cookies.set(REFRESH_TOKEN_KEY, response.data.refreshToken)
    }

    return response
  },

  logout: async () => {
    try {
      await api.post('/auth/logout')
    } finally {
      Cookies.remove(AUTH_TOKEN_KEY)
      Cookies.remove(REFRESH_TOKEN_KEY)
      localStorage.clear()
      window.location.href = '/customer-services'
    }
  },

  forgotPassword: async (email: string) => {
    return api.post('/auth/forgot-password', { email })
  },

  resetPassword: async (token: string, password: string) => {
    return api.post('/auth/reset-password', { token, password })
  },

  verifyEmail: async (token: string) => {
    return api.post('/auth/verify-email', { token })
  },

  getCurrentUser: async () => {
    return api.get('/auth/me')
  },
}

// Admin auth methods
export const adminAuth = {
  login: async (email: string, password: string) => {
    const response = await adminApi.post('/auth/login', { email, password })
    const { accessToken, refreshToken, user } = response.data || response

    Cookies.set('admin-token', accessToken)
    Cookies.set('admin-refresh-token', refreshToken)

    return { user, accessToken, refreshToken }
  },

  logout: async () => {
    try {
      await adminApi.post('/auth/logout')
    } finally {
      Cookies.remove('admin-token')
      Cookies.remove('admin-refresh-token')
      localStorage.clear()
      window.location.href = '/admin-server'
    }
  },

  getCurrentUser: async () => {
    return adminApi.get('/auth/me')
  },
}

export default apiClient
