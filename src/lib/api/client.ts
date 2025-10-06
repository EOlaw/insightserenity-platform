import axios, { AxiosError, AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'
import toast from 'react-hot-toast'
import Cookies from 'js-cookie'

// API Configuration
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'
const AUTH_TOKEN_KEY = 'auth-token'
const REFRESH_TOKEN_KEY = 'refresh-token'

// Create axios instance
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
})

// Request interceptor
apiClient.interceptors.request.use(
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

// Response interceptor
apiClient.interceptors.response.use(
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
          return apiClient(originalRequest)
        }
      } catch (refreshError) {
        // Refresh failed, redirect to login
        Cookies.remove(AUTH_TOKEN_KEY)
        Cookies.remove(REFRESH_TOKEN_KEY)
        window.location.href = '/login'
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

// API methods
export const api = {
  // Generic methods
  get: <T = any>(url: string, config?: AxiosRequestConfig) =>
    apiClient.get<T>(url, config).then(res => res.data),

  post: <T = any>(url: string, data?: any, config?: AxiosRequestConfig) =>
    apiClient.post<T>(url, data, config).then(res => res.data),

  put: <T = any>(url: string, data?: any, config?: AxiosRequestConfig) =>
    apiClient.put<T>(url, data, config).then(res => res.data),

  patch: <T = any>(url: string, data?: any, config?: AxiosRequestConfig) =>
    apiClient.patch<T>(url, data, config).then(res => res.data),

  delete: <T = any>(url: string, config?: AxiosRequestConfig) =>
    apiClient.delete<T>(url, config).then(res => res.data),

  // File upload
  upload: async <T = any>(url: string, file: File, onProgress?: (progress: number) => void) => {
    const formData = new FormData()
    formData.append('file', file)

    return apiClient.post<T>(url, formData, {
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
}

// Auth specific methods
export const auth = {
  login: async (email: string, password: string) => {
    const response = await api.post('/auth/login', { email, password })
    const { accessToken, refreshToken, user } = response

    Cookies.set(AUTH_TOKEN_KEY, accessToken)
    Cookies.set(REFRESH_TOKEN_KEY, refreshToken)

    return { user, accessToken, refreshToken }
  },

  register: async (data: any) => {
    const response = await api.post('/auth/register', data)
    return response
  },

  logout: async () => {
    try {
      await api.post('/auth/logout')
    } finally {
      Cookies.remove(AUTH_TOKEN_KEY)
      Cookies.remove(REFRESH_TOKEN_KEY)
      localStorage.clear()
      window.location.href = '/login'
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

export default apiClient
