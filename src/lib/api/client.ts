import axios, { AxiosError, AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'
import toast from 'react-hot-toast'
import Cookies from 'js-cookie'

// API Configuration
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'
const API_VERSION = 'v1'
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

    // Handle 401 Unauthorized with token refresh
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true

      try {
        const refreshToken = Cookies.get(REFRESH_TOKEN_KEY)
        const oldAccessToken = Cookies.get(AUTH_TOKEN_KEY)
        
        if (refreshToken) {
          console.log('Attempting token refresh...')
          
          const response = await axios.post(`${API_BASE_URL}/${API_VERSION}/auth/refresh`, {
            refreshToken,
            oldAccessToken
          })

          // Extract tokens from nested response structure
          const responseData = response.data?.data || response.data
          const { tokens } = responseData
          
          if (!tokens?.accessToken) {
            throw new Error('Token refresh failed - no access token in response')
          }

          // Store new access token
          Cookies.set(AUTH_TOKEN_KEY, tokens.accessToken, {
            expires: 1, // 1 day
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict'
          })
          
          // Store new refresh token if provided
          if (tokens.refreshToken) {
            Cookies.set(REFRESH_TOKEN_KEY, tokens.refreshToken, {
              expires: 30, // 30 days
              secure: process.env.NODE_ENV === 'production',
              sameSite: 'strict'
            })
          }

          console.log('Token refresh successful')

          // Update the failed request with new token
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${tokens.accessToken}`
          }

          // Retry original request with new token
          return apiClient(originalRequest)
        }
      } catch (refreshError) {
        console.error('Token refresh failed:', refreshError)
        
        // Refresh failed, clear auth state and redirect to login
        Cookies.remove(AUTH_TOKEN_KEY)
        Cookies.remove(REFRESH_TOKEN_KEY)
        localStorage.removeItem('user')
        localStorage.removeItem('userType')
        localStorage.removeItem('current-tenant')
        
        window.location.href = '/login'
        return Promise.reject(refreshError)
      }
    }

    // Handle other error responses
    if (error.response) {
      const data = error.response.data as any
      const message = data?.error?.message || data?.message || 'An error occurred'

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

// API methods with version prefix
export const api = {
  get: <T = any>(url: string, config?: AxiosRequestConfig) =>
    apiClient.get<T>(`/${API_VERSION}${url}`, config).then(res => res.data),

  post: <T = any>(url: string, data?: any, config?: AxiosRequestConfig) =>
    apiClient.post<T>(`/${API_VERSION}${url}`, data, config).then(res => res.data),

  put: <T = any>(url: string, data?: any, config?: AxiosRequestConfig) =>
    apiClient.put<T>(`/${API_VERSION}${url}`, data, config).then(res => res.data),

  patch: <T = any>(url: string, data?: any, config?: AxiosRequestConfig) =>
    apiClient.patch<T>(`/${API_VERSION}${url}`, data, config).then(res => res.data),

  delete: <T = any>(url: string, config?: AxiosRequestConfig) =>
    apiClient.delete<T>(`/${API_VERSION}${url}`, config).then(res => res.data),

  upload: async <T = any>(url: string, file: File, onProgress?: (progress: number) => void) => {
    const formData = new FormData()
    formData.append('file', file)

    return apiClient.post<T>(`/${API_VERSION}${url}`, formData, {
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

  batch: async <T = any>(requests: Array<() => Promise<any>>): Promise<T[]> => {
    return Promise.all(requests.map(request => request()))
  },
}

// Authentication methods
export const auth = {
  login: async (email: string, password: string) => {
    const response = await api.post('/auth/login', { email, password })
    
    // Extract data from response - handle both response.data and direct response
    const responseData = response.data || response
    const { tokens, user, userType } = responseData
    
    // Validate tokens are present
    if (!tokens?.accessToken || !tokens?.refreshToken) {
      console.error('Login response structure:', response)
      throw new Error('Authentication failed - invalid token structure received')
    }

    // Store access token with 1 day expiration
    Cookies.set(AUTH_TOKEN_KEY, tokens.accessToken, {
      expires: 1,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    })
    
    // Store refresh token with 30 day expiration
    Cookies.set(REFRESH_TOKEN_KEY, tokens.refreshToken, {
      expires: 30,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    })

    // Cache user information in localStorage for immediate access
    if (user) {
      localStorage.setItem('user', JSON.stringify(user))
    }
    
    if (userType) {
      localStorage.setItem('userType', userType)
    }

    console.log('Login successful - tokens stored securely')

    return { 
      user, 
      accessToken: tokens.accessToken, 
      refreshToken: tokens.refreshToken,
      userType 
    }
  },

  register: async (data: any) => {
    const response = await api.post('/auth/register', data)
    
    // Extract data from response
    const responseData = response.data || response
    const { tokens, user, userType } = responseData
    
    // Registration may provide immediate login tokens or require email verification
    if (tokens?.accessToken && tokens?.refreshToken) {
      // Store tokens for immediate authentication
      Cookies.set(AUTH_TOKEN_KEY, tokens.accessToken, {
        expires: 1,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
      })
      
      Cookies.set(REFRESH_TOKEN_KEY, tokens.refreshToken, {
        expires: 30,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
      })

      // Cache user information
      if (user) {
        localStorage.setItem('user', JSON.stringify(user))
      }
      
      if (userType) {
        localStorage.setItem('userType', userType)
      }

      console.log('Registration successful with immediate authentication')
    } else {
      console.log('Registration successful - email verification required')
    }
    
    return responseData
  },

  logout: async () => {
    try {
      const token = Cookies.get(AUTH_TOKEN_KEY)
      if (token) {
        // Notify backend to blacklist the token
        await api.post('/auth/logout')
      }
    } catch (error) {
      console.error('Logout API call failed:', error)
    } finally {
      // Clear all authentication state regardless of API success
      Cookies.remove(AUTH_TOKEN_KEY)
      Cookies.remove(REFRESH_TOKEN_KEY)
      localStorage.removeItem('user')
      localStorage.removeItem('userType')
      localStorage.removeItem('current-tenant')
      
      // Redirect to login page
      window.location.href = '/login'
    }
  },

  forgotPassword: async (email: string) => {
    return api.post('/auth/password/forgot', { email })
  },

  resetPassword: async (token: string, password: string) => {
    return api.post('/auth/password/reset', { 
      token, 
      newPassword: password 
    })
  },

  verifyEmail: async (token: string, email?: string) => {
    return api.post('/auth/verify/email', { token, email })
  },

  getCurrentUser: async () => {
    try {
      const response = await api.get('/auth/me')
      const userData = response.data || response
      
      // Update cached user data
      if (userData) {
        localStorage.setItem('user', JSON.stringify(userData))
      }
      
      return userData
    } catch (error) {
      console.error('Failed to get current user:', error)
      throw error
    }
  },

  refreshToken: async () => {
    try {
      const refreshToken = Cookies.get(REFRESH_TOKEN_KEY)
      const oldAccessToken = Cookies.get(AUTH_TOKEN_KEY)
      
      if (!refreshToken) {
        throw new Error('No refresh token available')
      }

      const response = await axios.post(`${API_BASE_URL}/${API_VERSION}/auth/refresh`, {
        refreshToken,
        oldAccessToken
      })

      const responseData = response.data?.data || response.data
      const { tokens } = responseData
      
      if (!tokens?.accessToken) {
        throw new Error('Token refresh failed')
      }

      Cookies.set(AUTH_TOKEN_KEY, tokens.accessToken, {
        expires: 1,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
      })
      
      if (tokens.refreshToken) {
        Cookies.set(REFRESH_TOKEN_KEY, tokens.refreshToken, {
          expires: 30,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict'
        })
      }

      return tokens
    } catch (error) {
      console.error('Manual token refresh failed:', error)
      throw error
    }
  },

  isAuthenticated: (): boolean => {
    const token = Cookies.get(AUTH_TOKEN_KEY)
    return !!token
  },

  getStoredUser: () => {
    try {
      const userStr = localStorage.getItem('user')
      return userStr ? JSON.parse(userStr) : null
    } catch (error) {
      console.error('Failed to parse stored user data:', error)
      return null
    }
  },

  getUserType: (): string | null => {
    return localStorage.getItem('userType')
  },

  clearAuthState: () => {
    Cookies.remove(AUTH_TOKEN_KEY)
    Cookies.remove(REFRESH_TOKEN_KEY)
    localStorage.removeItem('user')
    localStorage.removeItem('userType')
    localStorage.removeItem('current-tenant')
  }
}

export default apiClient