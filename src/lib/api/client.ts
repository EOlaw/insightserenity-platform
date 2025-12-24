/**
 * @fileoverview Comprehensive API Client for InsightSerenity Platform
 * @description Unified API client handling all backend communications including authentication,
 *              client management (contacts, documents, notes), and core platform operations
 * @version 3.0.0
 */

import axios, { AxiosError, AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'
import toast from 'react-hot-toast'
import Cookies from 'js-cookie'

// ==================== Configuration ====================

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'
const API_VERSION = 'v1'
const AUTH_TOKEN_KEY = 'auth-token'
const REFRESH_TOKEN_KEY = 'refresh-token'

// ==================== Type Definitions ====================

/**
 * Client Profile entity based on MongoDB Client model
 */
export interface ClientProfile {
  _id: string
  clientCode: string
  clientId: string
  userId: string
  tenantId: string
  organizationId: string
  companyName: string
  legalName?: string
  tradingName?: string
  businessDetails: {
    registrationNumber?: string
    taxId?: string
    entityType?: string
    incorporationDate?: string
    numberOfEmployees?: {
      range?: string
      exact?: number
    }
    annualRevenue?: {
      amount?: number
      currency?: string
      range?: string
    }
    fiscalYearEnd?: string
    website?: string
  }
  industry: {
    primary?: {
      sector?: string
      subSector?: string
      naicsCode?: string
      sicCode?: string
    }
    secondary?: Array<{
      sector?: string
      subSector?: string
    }>
  }
  contacts: {
    primary?: {
      name?: string
      title?: string
      email?: string
      phone?: string
      mobile?: string
    }
    billing?: {
      name?: string
      email?: string
      phone?: string
    }
    technical?: {
      name?: string
      email?: string
      phone?: string
    }
  }
  addresses: {
    headquarters?: Address
    billing?: Address
    shipping?: Address
    registered?: Address
  }
  relationship: {
    status?: string
    tier?: string
    accountManager?: {
      userId?: string
      name?: string
      email?: string
      phone?: string
    }
    salesRep?: {
      userId?: string
      name?: string
      email?: string
    }
    healthScore?: {
      score?: number
      trend?: string
      lastCalculated?: string
    }
    satisfactionScore?: {
      nps?: number
      csat?: number
      ces?: number
      lastSurvey?: string
    }
    churnRisk?: {
      level?: string
      probability?: number
      factors?: string[]
      lastAssessed?: string
    }
    segment?: string
    source?: string
    referredBy?: string
  }
  billing: {
    currency?: string
    paymentTerms?: string
    creditLimit?: number
    outstandingBalance?: number
    totalRevenue?: number
    preferredPaymentMethod?: string
    billingCycle?: string
    taxExempt?: boolean
  }
  analytics: {
    lifetime?: {
      totalRevenue?: number
      totalProjects?: number
      totalEngagements?: number
      averageProjectValue?: number
      averageProjectDuration?: number
    }
    current?: {
      activeProjects?: number
      monthlyRecurringRevenue?: number
      averageResponseTime?: number
    }
    engagement?: {
      lastActivityDate?: string
      lastContactDate?: string
      portalLogins?: number
      supportTickets?: number
      meetingsHeld?: number
    }
  }
  projects?: Array<{
    projectId?: string
    projectCode?: string
    name?: string
    status?: string
    type?: string
    value?: number
    currency?: string
    startDate?: string
    endDate?: string
    completionPercentage?: number
    lead?: {
      consultantId?: string
      name?: string
    }
  }>
  contracts?: Array<{
    contractId?: string
    contractNumber?: string
    type?: string
    status?: string
    value?: {
      amount?: number
      currency?: string
    }
    startDate?: string
    endDate?: string
    autoRenew?: boolean
    terms?: string
  }>
  preferences?: {
    communication?: {
      preferredChannel?: string
      frequency?: string
      language?: string
      timezone?: string
    }
    service?: {
      supportLevel?: string
      escalationPath?: string[]
    }
  }
  customFields?: Record<string, any>
  metadata: {
    source?: string
    createdBy: string
    updatedBy?: string
    tags?: string[]
    notes?: string
  }
  status: {
    current: string
    isActive: boolean
    isDeleted: boolean
  }
  createdAt: string
  updatedAt: string
}

/**
 * Address structure used across the platform
 */
export interface Address {
  street1?: string
  street2?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
  type?: string
  isPrimary?: boolean
}

/**
 * Contact entity based on MongoDB ClientContact model
 */
export interface Contact {
  _id: string
  contactId: string
  clientId: string
  personalInfo: {
    prefix?: string
    firstName: string
    middleName?: string
    lastName: string
    suffix?: string
    displayName?: string
    preferredName?: string
    dateOfBirth?: string
    nationality?: string
  }
  professionalInfo: {
    jobTitle?: string
    department?: string
    companyName?: string
    role?: string
    seniority?: string
    reportingTo?: string
    responsibilities?: string[]
  }
  contactDetails: {
    emails: Array<{
      type: string
      address: string
      isPrimary: boolean
      isVerified: boolean
    }>
    phones: Array<{
      type: string
      number: string
      isPrimary: boolean
      extension?: string
      countryCode?: string
    }>
    addresses?: Array<Address>
    social?: {
      linkedin?: string
      twitter?: string
      facebook?: string
    }
  }
  preferences?: {
    communicationChannel?: string
    language?: string
    timezone?: string
    bestTimeToContact?: string
  }
  relationship?: {
    type?: string
    isPrimaryContact?: boolean
    isDecisionMaker?: boolean
    influenceLevel?: string
    lastInteraction?: string
    interactionCount?: number
  }
  status: {
    current: string
    isActive: boolean
    reason?: string
  }
  metadata: {
    source?: string
    createdBy: string
    updatedBy?: string
    tags?: string[]
    notes?: string
  }
  createdAt: string
  updatedAt: string
}

/**
 * Document entity based on MongoDB ClientDocument model
 */
export interface Document {
  _id: string
  documentId: string
  clientId: string
  projectId?: string
  engagementId?: string
  contractId?: string
  documentInfo: {
    name: string
    displayName?: string
    description?: string
    type: string
    category?: {
      primary: string
      secondary?: string[]
      custom?: string[]
    }
    classification?: {
      level: string
      handling?: string
      markings?: string[]
    }
    language?: string
    keywords?: string[]
    abstract?: string
  }
  fileDetails: {
    originalName: string
    fileName: string
    fileExtension: string
    mimeType: string
    size: number
    encoding?: string
    checksum?: {
      md5?: string
      sha256?: string
    }
    dimensions?: {
      width?: number
      height?: number
      duration?: number
      pages?: number
    }
    metadata?: {
      author?: string
      creator?: string
      producer?: string
      subject?: string
      title?: string
      creationDate?: Date
      modificationDate?: Date
    }
  }
  storage: {
    provider: string
    location?: {
      bucket?: string
      path?: string
      region?: string
    }
    url: string
    publicUrl?: string
    thumbnailUrl?: string
    cdnUrl?: string
    signedUrl?: {
      url?: string
      expiresAt?: Date
    }
    backup?: {
      enabled?: boolean
      location?: string
      lastBackup?: Date
    }
    encryption?: {
      enabled: boolean
      algorithm?: string
      keyId?: string
    }
    compression?: {
      enabled?: boolean
      algorithm?: string
      originalSize?: number
    }
  }
  versioning: {
    version: {
      major: number
      minor: number
      patch: number
      label?: string
    }
    versionString: string
    isLatest: boolean
    isDraft: boolean
    parentVersionId?: string
    versionHistory?: Array<{
      versionId: string
      version: string
      createdAt: Date
      createdBy: string
      changeNotes?: string
      size: number
    }>
    changeLog?: Array<{
      version: string
      date: Date
      author: string
      changes: string[]
      reviewedBy?: string
    }>
  }
  accessControl?: {
    owner: string
    permissions?: any
    sharing?: any
    restrictions?: any
  }
  lifecycle: {
    status: string
    stage?: string
    workflow?: any
    approval?: any
    review?: {
      nextReviewDate?: Date
      reviewFrequency?: any
      lastReviewDate?: Date
      reviewedBy?: string
      reviewNotes?: string
    }
    retention?: any
  }
  relationships?: {
    relatedDocuments?: any[]
    contracts?: any[]
    invoices?: any[]
    dependencies?: any[]
    externalReferences?: any[]
  }
  signatures?: {
    required: boolean
    signatories?: any[]
    envelope?: any
    auditTrail?: any[]
  }
  collaboration?: {
    comments?: any[]
    annotations?: any[]
    tasks?: any[]
  }
  analytics?: {
    views?: any
    downloads?: any
    shares?: any
    prints?: any
    engagement?: any
    usage?: any
  }
  contentExtraction?: {
    ocr?: any
    textContent?: any
    metadata?: any
    entities?: any[]
    searchableContent?: string
  }
  compliance?: {
    regulatory?: any
    privacy?: any
    audit?: any
    dataClassification?: any
  }
  quality?: {
    validation?: any
    integrity?: any
    completeness?: any
  }
  processing?: {
    status?: string
    queue?: any
    jobs?: any[]
    conversions?: any[]
    thumbnails?: any[]
  }
  tags?: {
    system?: string[]
    user?: string[]
    auto?: string[]
    taxonomy?: any[]
  }
  customFields?: Record<string, any>
  metadata: {
    source?: string
    uploadedBy: string
    uploadedAt: Date
    importBatch?: string
    flags?: {
      isFavorite?: boolean
      isPinned?: boolean
      isTemplate?: boolean
      requiresAction?: boolean
    }
  }
  searchTokens?: string[]
  isDeleted: boolean
  deletedAt?: Date
  deletedBy?: string
  restorable?: boolean
  permanentDeletionDate?: Date
  createdAt: string
  updatedAt: string
}

/**
 * Note entity based on MongoDB ClientNote model
 */
export interface Note {
  _id: string
  noteId: string
  clientId: string
  projectId?: string
  contactId?: string
  content: {
    title?: string
    body: string
    summary?: string
    format: string
  }
  classification: {
    type: string
    category: {
      primary: string
      secondary?: string[]
    }
    importance: string
    urgency: string
    tags?: {
      system?: string[]
      user?: string[]
      auto?: string[]
    }
  }
  visibility: {
    scope: string
    sharedWith?: Array<{
      userId: string
      userName?: string
      sharedAt: string
    }>
  }
  attachments?: Array<{
    documentId?: string
    fileName?: string
    fileUrl?: string
    mimeType?: string
    size?: number
  }>
  reminders?: Array<{
    date: string
    type: string
    notified: boolean
  }>
  linkedEntities?: {
    contacts?: string[]
    projects?: string[]
    documents?: string[]
    tasks?: string[]
  }
  status: {
    current: string
    isActive: boolean
    isPinned?: boolean
    isArchived?: boolean
  }
  metadata: {
    createdBy: string
    updatedBy?: string
    createdAt: string
    updatedAt?: string
    lastViewedAt?: string
    viewCount?: number
  }
  createdAt: string
  updatedAt: string
}

/**
 * Dashboard statistics for client
 */
export interface ClientStatistics {
  overview: {
    clientId: string
    clientCode: string
    companyName: string
    status: string
    tier: string
  }
  financial: {
    totalRevenue: number
    monthlyRecurringRevenue: number
    outstandingBalance: number
    averageInvoiceValue: number
    currency: string
  }
  engagement: {
    totalProjects: number
    activeProjects: number
    completedProjects: number
    totalEngagements: number
    portalLogins: number
    supportTickets: number
  }
  activity: {
    lastActivityDate: string
    lastContactDate: string
    totalInteractions: number
    averageResponseTime: number
  }
  health: {
    healthScore: number
    healthTrend: string
    churnRisk: string
    churnProbability: number
    satisfaction: number
    nps: number
  }
  relationships: {
    totalContacts: number
    activeContacts: number
    primaryContact?: string
    accountManager?: string
  }
  documents: {
    totalDocuments: number
    recentDocuments: number
    documentTypes: Record<string, number>
  }
  contracts: {
    activeContracts: number
    expiringContracts: number
    totalContractValue: number
  }
  generatedAt: string
}

/**
 * Metadata for paginated responses
 */
export interface ResponseMetadata {
  total: number
  count: number
  limit: number
  skip: number
  hasMore: boolean
  filters?: Record<string, any>
}

/**
 * Standard API response wrapper
 */
export interface ApiResponse<T> {
  success: boolean
  data: T
  message?: string
  metadata?: ResponseMetadata
  pagination?: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

/**
 * Paginated response structure
 */
export interface PaginatedResponse<T> {
  success: boolean
  data: T[]
  pagination: {
    page: number
    limit: number
    total: number
    pages: number
    hasMore: boolean
  }
}

// ==================== Axios Instance Configuration ====================

const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
})

// ==================== Request Interceptor ====================

apiClient.interceptors.request.use(
  (config) => {
    const token = Cookies.get(AUTH_TOKEN_KEY)
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }

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

// ==================== Response Interceptor ====================

apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    return response
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean }

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

          const responseData = response.data?.data || response.data
          const { tokens } = responseData

          if (!tokens?.accessToken) {
            throw new Error('Token refresh failed - no access token in response')
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

          console.log('Token refresh successful')

          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${tokens.accessToken}`
          }

          return apiClient(originalRequest)
        }
      } catch (refreshError) {
        console.error('Token refresh failed:', refreshError)

        Cookies.remove(AUTH_TOKEN_KEY)
        Cookies.remove(REFRESH_TOKEN_KEY)
        localStorage.removeItem('user')
        localStorage.removeItem('userType')
        localStorage.removeItem('current-tenant')

        window.location.href = '/login'
        return Promise.reject(refreshError)
      }
    }

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

// ==================== Core API Methods ====================

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

// ==================== Authentication Methods ====================

export const auth = {
  login: async (email: string, password: string) => {
    const response = await api.post('/auth/login', { email, password })

    const responseData = response.data || response
    const { tokens, user, userType } = responseData

    if (!tokens?.accessToken || !tokens?.refreshToken) {
      console.error('Login response structure:', response)
      throw new Error('Authentication failed - invalid token structure received')
    }

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

    const responseData = response.data || response
    const { tokens, user, userType } = responseData

    if (tokens?.accessToken && tokens?.refreshToken) {
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
        await api.post('/auth/logout')
      }
    } catch (error) {
      console.error('Logout API call failed:', error)
    } finally {
      Cookies.remove(AUTH_TOKEN_KEY)
      Cookies.remove(REFRESH_TOKEN_KEY)
      localStorage.removeItem('user')
      localStorage.removeItem('userType')
      localStorage.removeItem('current-tenant')

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

  checkEmailVerificationStatus: async (email: string) => {
    try {
      const response = await api.get('/auth/verification-status', {
        params: { email }
      })
      return response.data || response
    } catch (error) {
      throw error
    }
  },

  resendVerificationEmail: async (email: string) => {
    try {
      const response = await api.post('/auth/resend-verification', { email })
      return response.data || response
    } catch (error) {
      throw error
    }
  },

  verifyEmail: async (token: string, email?: string) => {
    return api.post('/auth/verify/email', { token, email })
  },

  getCurrentUser: async () => {
    try {
      const response = await api.get('/auth/me')
      const userData = response.data || response

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

// ==================== Helper Functions ====================

/**
 * Extract client ID from user object with automatic fallback to fresh data
 * Tries multiple possible locations in the user object and fetches fresh data if needed
 * 
 * @returns Promise<string> The client ID
 * @throws Error if client ID cannot be found
 */
const getClientIdFromUser = async (): Promise<string> => {
  // First, try to get from stored user
  let user = auth.getStoredUser()
  
  // Try multiple possible locations for clientId
  // Note: The stored user may have a nested structure like { user: { clientId: "..." } }
  let clientId = user?.clientId || 
                 user?.user?.clientId ||  // Check nested user object (common pattern)
                 user?.client?._id || 
                 user?.client?.id || 
                 user?.user?.client?._id ||
                 user?.user?.client?.id ||
                 user?.linkedEntity?._id ||
                 user?.linkedEntity?.id ||
                 user?.user?.linkedEntity?._id ||
                 user?.user?.linkedEntity?.id

  // If not found, fetch fresh user data from backend
  if (!clientId) {
    console.log('Client ID not found in stored user, fetching fresh user data...')
    try {
      const freshUser = await auth.getCurrentUser()
      
      // Update stored user
      user = freshUser
      
      // Try again with fresh user data (including nested paths)
      clientId = freshUser?.clientId || 
                 freshUser?.user?.clientId ||
                 freshUser?.client?._id || 
                 freshUser?.client?.id ||
                 freshUser?.user?.client?._id ||
                 freshUser?.user?.client?.id ||
                 freshUser?.linkedEntity?._id ||
                 freshUser?.linkedEntity?.id ||
                 freshUser?.user?.linkedEntity?._id ||
                 freshUser?.user?.linkedEntity?.id
                 
      console.log('Fresh user data fetched:', { 
        hasClientId: !!freshUser?.clientId,
        hasNestedClientId: !!freshUser?.user?.clientId,
        hasClient: !!freshUser?.client,
        hasLinkedEntity: !!freshUser?.linkedEntity,
        userType: freshUser?.userType || freshUser?.user?.userType,
        userId: freshUser?._id || freshUser?.id || freshUser?.user?._id || freshUser?.user?.id
      })
    } catch (error) {
      console.error('Failed to fetch fresh user data:', error)
    }
  }
  
  if (!clientId) {
    console.error('Client ID not found. User object structure:', JSON.stringify(user, null, 2))
    throw new Error('Client ID not found in user session. Please ensure you are logged in as a client user.')
  }
  
  console.log('Using client ID:', clientId)
  return clientId
}

// ==================== Client Management API ====================

export const clientApi = {
  // ============================================================================
  // PROFILE MANAGEMENT (Self-Service Operations)
  // ============================================================================

  /**
   * Get authenticated client's full profile (self-service)
   * Automatically extracts client ID from session with fallback to fresh data
   */
  getMyProfile: async (): Promise<ApiResponse<ClientProfile>> => {
    try {
      const clientId = await getClientIdFromUser()
      return api.get(`/clients/${clientId}?populate=true`)
    } catch (error: any) {
      console.error('Error in getMyProfile:', error)
      throw error
    }
  },

  /**
   * Get authenticated client's dashboard data (self-service)
   * Returns comprehensive dashboard information with all related data
   */
  getMyDashboard: async (): Promise<ApiResponse<any>> => {
    try {
      const clientId = await getClientIdFromUser()
      return api.get(`/clients/${clientId}/dashboard`)
    } catch (error: any) {
      console.error('Error in getMyDashboard:', error)
      throw error
    }
  },

  /**
   * Get authenticated client's statistics (self-service)
   * Note: This endpoint extracts clientId from the authenticated session on the backend
   * No need to provide clientId in the URL
   */
  getMyStatistics: async (filters?: {
    dateFrom?: string;
    dateTo?: string;
  }): Promise<ApiResponse<ClientStatistics>> => {
    try {
      const queryParams = new URLSearchParams()
      if (filters?.dateFrom) queryParams.append('dateFrom', filters.dateFrom)
      if (filters?.dateTo) queryParams.append('dateTo', filters.dateTo)
      
      const query = queryParams.toString() ? `?${queryParams.toString()}` : ''
      return api.get(`/clients/statistics${query}`)
    } catch (error: any) {
      console.error('Error in getMyStatistics:', error)
      throw error
    }
  },

  /**
   * Update authenticated client's profile (self-service)
   */
  updateMyProfile: async (updateData: Partial<ClientProfile>): Promise<ApiResponse<ClientProfile>> => {
    try {
      const clientId = await getClientIdFromUser()
      return api.patch(`/clients/${clientId}`, updateData)
    } catch (error: any) {
      console.error('Error in updateMyProfile:', error)
      throw error
    }
  },

  /**
   * Get client by code
   * Used for looking up clients by their unique code
   */
  getByCode: async (clientCode: string): Promise<ApiResponse<ClientProfile>> => {
    try {
      return api.get(`/clients/code/${clientCode}`)
    } catch (error: any) {
      console.error('Error in getByCode:', error)
      throw error
    }
  },

  /**
   * Get client by ID (peer view or admin)
   */
  getById: async (clientId: string): Promise<ApiResponse<ClientProfile>> => {
    try {
      return api.get(`/clients/${clientId}`)
    } catch (error: any) {
      console.error('Error in getById:', error)
      throw error
    }
  },

  // ============================================================================
  // PROJECT & CONTRACT INFORMATION
  // ============================================================================

  /**
   * Get authenticated client's projects
   */
  getMyProjects: async (params?: {
    status?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<ApiResponse<any[]>> => {
    try {
      const clientId = await getClientIdFromUser()
      const queryParams = new URLSearchParams()
      if (params?.status) queryParams.append('status', params.status)
      if (params?.sortBy) queryParams.append('sortBy', params.sortBy)
      if (params?.sortOrder) queryParams.append('sortOrder', params.sortOrder)
      
      const query = queryParams.toString() ? `?${queryParams.toString()}` : ''
      return api.get(`/clients/${clientId}/projects${query}`)
    } catch (error: any) {
      console.error('Error in getMyProjects:', error)
      throw error
    }
  },

  /**
   * Get authenticated client's contracts
   */
  getMyContracts: async (params?: {
    status?: string;
    type?: string;
  }): Promise<ApiResponse<any[]>> => {
    try {
      const clientId = await getClientIdFromUser()
      const queryParams = new URLSearchParams()
      if (params?.status) queryParams.append('status', params.status)
      if (params?.type) queryParams.append('type', params.type)
      
      const query = queryParams.toString() ? `?${queryParams.toString()}` : ''
      return api.get(`/clients/${clientId}/contracts${query}`)
    } catch (error: any) {
      console.error('Error in getMyContracts:', error)
      throw error
    }
  },
}

// ==================== Contact Management API ====================

export const contactsApi = {
  /**
   * Get all contacts for authenticated client (self-service)
   */
  getAll: async (params?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    role?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<ApiResponse<Contact[]>> => {
    try {
      const queryParams = new URLSearchParams()
      if (params?.limit) queryParams.append('limit', params.limit.toString())
      if (params?.page !== undefined) {
        const skip = (params.page - 1) * (params.limit || 50)
        queryParams.append('skip', skip.toString())
      }
      if (params?.search) queryParams.append('search', params.search)
      if (params?.status) queryParams.append('status', params.status)
      if (params?.role) queryParams.append('role', params.role)
      if (params?.sortBy) queryParams.append('sortBy', params.sortBy)
      if (params?.sortOrder) queryParams.append('sortOrder', params.sortOrder)

      const query = queryParams.toString() ? `?${queryParams.toString()}` : ''
      return api.get(`/clients/contacts${query}`)
    } catch (error: any) {
      console.error('Error in contactsApi.getAll:', error)
      throw error
    }
  },

  /**
   * Get contact by ID (self-service)
   */
  getById: async (contactId: string): Promise<ApiResponse<Contact>> => {
    try {
      return api.get(`/clients/contacts/${contactId}`)
    } catch (error: any) {
      console.error('Error in contactsApi.getById:', error)
      throw error
    }
  },

  /**
   * Create new contact (self-service)
   */
  create: async (contactData: Partial<Contact>): Promise<ApiResponse<Contact>> => {
    try {
      return api.post('/clients/contacts', contactData)
    } catch (error: any) {
      console.error('Error in contactsApi.create:', error)
      throw error
    }
  },

  /**
   * Update contact (self-service)
   */
  update: async (contactId: string, contactData: Partial<Contact>): Promise<ApiResponse<Contact>> => {
    try {
      return api.put(`/clients/contacts/${contactId}`, contactData)
    } catch (error: any) {
      console.error('Error in contactsApi.update:', error)
      throw error
    }
  },

  /**
   * Partially update contact (self-service)
   */
  patch: async (contactId: string, contactData: Partial<Contact>): Promise<ApiResponse<Contact>> => {
    try {
      return api.patch(`/clients/contacts/${contactId}`, contactData)
    } catch (error: any) {
      console.error('Error in contactsApi.patch:', error)
      throw error
    }
  },

  /**
   * Delete contact (self-service)
   */
  delete: async (contactId: string): Promise<ApiResponse<{ message: string }>> => {
    try {
      return api.delete(`/clients/contacts/${contactId}`)
    } catch (error: any) {
      console.error('Error in contactsApi.delete:', error)
      throw error
    }
  },

  /**
   * Search contacts (self-service)
   */
  search: async (searchTerm: string): Promise<ApiResponse<Contact[]>> => {
    try {
      return api.get(`/clients/contacts?search=${encodeURIComponent(searchTerm)}`)
    } catch (error: any) {
      console.error('Error in contactsApi.search:', error)
      throw error
    }
  },
}

// ==================== Document Management API ====================

export const documentsApi = {
  /**
   * Get all documents for authenticated client (self-service)
   */
  getAll: async (params?: {
    page?: number;
    limit?: number;
    search?: string;
    type?: string;
    status?: string;
    classification?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<ApiResponse<Document[]>> => {
    try {
      const queryParams = new URLSearchParams()
      if (params?.limit) queryParams.append('limit', params.limit.toString())
      if (params?.page !== undefined) {
        const skip = (params.page - 1) * (params.limit || 50)
        queryParams.append('skip', skip.toString())
      }
      if (params?.search) queryParams.append('search', params.search)
      if (params?.type) queryParams.append('type', params.type)
      if (params?.status) queryParams.append('status', params.status)
      if (params?.classification) queryParams.append('classification', params.classification)
      if (params?.sortBy) queryParams.append('sortBy', params.sortBy)
      if (params?.sortOrder) queryParams.append('sortOrder', params.sortOrder)

      const query = queryParams.toString() ? `?${queryParams.toString()}` : ''
      return api.get(`/clients/documents${query}`)
    } catch (error: any) {
      console.error('Error in documentsApi.getAll:', error)
      throw error
    }
  },

  /**
   * Get document by ID (self-service)
   */
  getById: async (documentId: string): Promise<ApiResponse<Document>> => {
    try {
      return api.get(`/clients/documents/${documentId}`)
    } catch (error: any) {
      console.error('Error in documentsApi.getById:', error)
      throw error
    }
  },

  /**
   * Create document metadata (self-service)
   */
  create: async (documentData: Partial<Document>): Promise<ApiResponse<Document>> => {
    try {
      return api.post('/clients/documents', documentData)
    } catch (error: any) {
      console.error('Error in documentsApi.create:', error)
      throw error
    }
  },

  /**
   * Upload document file (self-service)
   */
  upload: async (file: File, onProgress?: (progress: number) => void): Promise<ApiResponse<Document>> => {
    try {
      return api.upload('/clients/documents', file, onProgress)
    } catch (error: any) {
      console.error('Error in documentsApi.upload:', error)
      throw error
    }
  },

  /**
   * Update document (self-service)
   */
  update: async (documentId: string, documentData: Partial<Document>): Promise<ApiResponse<Document>> => {
    try {
      return api.put(`/clients/documents/${documentId}`, documentData)
    } catch (error: any) {
      console.error('Error in documentsApi.update:', error)
      throw error
    }
  },

  /**
   * Partially update document (self-service)
   */
  patch: async (documentId: string, documentData: Partial<Document>): Promise<ApiResponse<Document>> => {
    try {
      return api.patch(`/clients/documents/${documentId}`, documentData)
    } catch (error: any) {
      console.error('Error in documentsApi.patch:', error)
      throw error
    }
  },

  /**
   * Delete document (self-service)
   */
  delete: async (documentId: string): Promise<ApiResponse<{ message: string }>> => {
    try {
      return api.delete(`/clients/documents/${documentId}`)
    } catch (error: any) {
      console.error('Error in documentsApi.delete:', error)
      throw error
    }
  },

  /**
   * Get pre-signed download URL for a document (self-service)
   * Returns the download URL along with document metadata
   */
  download: async (documentId: string): Promise<ApiResponse<{
    documentId: string;
    fileName: string;
    downloadUrl: string;
    mimeType?: string;
    size?: number;
  }>> => {
    try {
      return api.get(`/clients/documents/${documentId}/download`)
    } catch (error: any) {
      console.error('Error in documentsApi.download:', error)
      throw error
    }
  },

  /**
   * Get document versions (self-service)
   */
  getVersions: async (documentId: string): Promise<ApiResponse<any[]>> => {
    try {
      return api.get(`/clients/documents/${documentId}/versions`)
    } catch (error: any) {
      console.error('Error in documentsApi.getVersions:', error)
      throw error
    }
  },

  /**
   * Share document (self-service)
   */
  share: async (documentId: string, shareData: any): Promise<ApiResponse<any>> => {
    try {
      return api.post(`/clients/documents/${documentId}/share`, shareData)
    } catch (error: any) {
      console.error('Error in documentsApi.share:', error)
      throw error
    }
  },

  /**
   * Get document analytics (self-service)
   */
  getAnalytics: async (documentId: string): Promise<ApiResponse<any>> => {
    try {
      return api.get(`/clients/documents/${documentId}/analytics`)
    } catch (error: any) {
      console.error('Error in documentsApi.getAnalytics:', error)
      throw error
    }
  },
}

// ==================== Note Management API ====================

export const notesApi = {
  /**
   * Get all notes for authenticated client (self-service)
   */
  getAll: async (params?: {
    page?: number;
    limit?: number;
    search?: string;
    type?: string;
    importance?: string;
    category?: string;
    status?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<ApiResponse<Note[]>> => {
    try {
      const queryParams = new URLSearchParams()
      if (params?.limit) queryParams.append('limit', params.limit.toString())
      if (params?.page !== undefined) {
        const skip = (params.page - 1) * (params.limit || 50)
        queryParams.append('skip', skip.toString())
      }
      if (params?.search) queryParams.append('search', params.search)
      if (params?.type) queryParams.append('type', params.type)
      if (params?.importance) queryParams.append('importance', params.importance)
      if (params?.category) queryParams.append('category', params.category)
      if (params?.status) queryParams.append('status', params.status)
      if (params?.sortBy) queryParams.append('sortBy', params.sortBy)
      if (params?.sortOrder) queryParams.append('sortOrder', params.sortOrder)

      const query = queryParams.toString() ? `?${queryParams.toString()}` : ''
      return api.get(`/clients/notes${query}`)
    } catch (error: any) {
      console.error('Error in notesApi.getAll:', error)
      throw error
    }
  },

  /**
   * Get note by ID (self-service)
   */
  getById: async (noteId: string): Promise<ApiResponse<Note>> => {
    try {
      return api.get(`/clients/notes/${noteId}`)
    } catch (error: any) {
      console.error('Error in notesApi.getById:', error)
      throw error
    }
  },

  /**
   * Create note (self-service)
   */
  create: async (noteData: Partial<Note>): Promise<ApiResponse<Note>> => {
    try {
      return api.post('/clients/notes', noteData)
    } catch (error: any) {
      console.error('Error in notesApi.create:', error)
      throw error
    }
  },

  /**
   * Update note (self-service)
   */
  update: async (noteId: string, noteData: Partial<Note>): Promise<ApiResponse<Note>> => {
    try {
      return api.put(`/clients/notes/${noteId}`, noteData)
    } catch (error: any) {
      console.error('Error in notesApi.update:', error)
      throw error
    }
  },

  /**
   * Partially update note (self-service)
   */
  patch: async (noteId: string, noteData: Partial<Note>): Promise<ApiResponse<Note>> => {
    try {
      return api.patch(`/clients/notes/${noteId}`, noteData)
    } catch (error: any) {
      console.error('Error in notesApi.patch:', error)
      throw error
    }
  },

  /**
   * Delete note (self-service)
   */
  delete: async (noteId: string): Promise<ApiResponse<{ message: string }>> => {
    try {
      return api.delete(`/clients/notes/${noteId}`)
    } catch (error: any) {
      console.error('Error in notesApi.delete:', error)
      throw error
    }
  },

  /**
   * Search notes (self-service)
   */
  search: async (searchParams: {
    query?: string;
    type?: string[];
    importance?: string[];
    category?: string[];
    dateFrom?: string;
    dateTo?: string;
  }): Promise<ApiResponse<Note[]>> => {
    try {
      return api.post('/clients/notes/search', searchParams)
    } catch (error: any) {
      console.error('Error in notesApi.search:', error)
      throw error
    }
  },

  /**
   * Get recent notes (self-service)
   */
  getRecent: async (limit: number = 10): Promise<ApiResponse<Note[]>> => {
    try {
      return api.get(`/clients/notes/recent?limit=${limit}`)
    } catch (error: any) {
      console.error('Error in notesApi.getRecent:', error)
      throw error
    }
  },

  /**
   * Get notes by tag (self-service)
   */
  getByTag: async (tag: string): Promise<ApiResponse<Note[]>> => {
    try {
      return api.get(`/clients/notes/tags/${encodeURIComponent(tag)}`)
    } catch (error: any) {
      console.error('Error in notesApi.getByTag:', error)
      throw error
    }
  },

  /**
   * Get notes by priority (self-service)
   */
  getByPriority: async (priority: string): Promise<ApiResponse<Note[]>> => {
    try {
      return api.get(`/clients/notes/priority/${priority}`)
    } catch (error: any) {
      console.error('Error in notesApi.getByPriority:', error)
      throw error
    }
  },

  /**
   * Export notes (self-service)
   */
  export: async (format: 'csv' | 'json' | 'pdf', filters?: any): Promise<ApiResponse<{ url: string }>> => {
    try {
      return api.post(`/clients/notes/export?format=${format}`, filters || {})
    } catch (error: any) {
      console.error('Error in notesApi.export:', error)
      throw error
    }
  },
}

// ==================== Consultant Search API ====================

export const consultantSearchApi = {
  /**
   * Search for consultants (client self-service)
   */
  search: async (params: {
    q?: string;  // ← Changed from 'query?' to 'q?'
    skills?: string[];
    level?: string;
    availability?: string;
    page?: number;
    limit?: number;
  }): Promise<ApiResponse<any>> => {
    try {
      const queryParams = new URLSearchParams()
      if (params.q) queryParams.append('q', params.q)  // ← Changed from 'query' to 'q'
      if (params.skills) params.skills.forEach(s => queryParams.append('skills', s))
      if (params.level) queryParams.append('level', params.level)
      if (params.availability) queryParams.append('availability', params.availability)
      if (params.page) queryParams.append('page', params.page.toString())
      if (params.limit) queryParams.append('limit', params.limit.toString())
      
      const query = queryParams.toString() ? `?${queryParams.toString()}` : ''
      return api.get(`/consultants/search${query}`)
    } catch (error: any) {
      console.error('Error in consultantSearchApi.search:', error)
      throw error
    }
  },

  /**
   * Get consultant public profile by ID (client view)
   */
  getById: async (consultantId: string): Promise<ApiResponse<any>> => {
    try {
      return api.get(`/consultants/${consultantId}`)  // ← Also simplified this endpoint
    } catch (error: any) {
      console.error('Error in consultantSearchApi.getById:', error)
      throw error
    }
  },
}

// ==================== Utility Functions ====================

/**
 * Format file size in human-readable format
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
}

/**
 * Get file icon emoji based on MIME type
 */
export const getFileIcon = (mimeType: string): string => {
  if (mimeType.includes('pdf')) return '📄'
  if (mimeType.includes('word') || mimeType.includes('document')) return '📝'
  if (mimeType.includes('sheet') || mimeType.includes('excel')) return '📊'
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return '📽️'
  if (mimeType.includes('image')) return '🖼️'
  if (mimeType.includes('video')) return '🎥'
  if (mimeType.includes('audio')) return '🎵'
  if (mimeType.includes('zip') || mimeType.includes('compressed')) return '📦'
  return '📁'
}

/**
 * Get badge styling for importance level
 */
export const getImportanceBadge = (importance: string): string => {
  const badges: Record<string, string> = {
    critical: 'bg-red-100 text-red-800',
    high: 'bg-orange-100 text-orange-800',
    medium: 'bg-yellow-100 text-yellow-800',
    low: 'bg-blue-100 text-blue-800',
    fyi: 'bg-gray-100 text-gray-800',
  }
  return badges[importance] || badges.fyi
}

/**
 * Get urgency icon
 */
export const getUrgencyIcon = (urgency: string): string => {
  switch (urgency) {
    case 'immediate':
    case 'urgent':
      return '🔴'
    case 'normal':
      return '🟡'
    case 'low':
    case 'none':
      return '🟢'
    default:
      return '⚪'
  }
}

/**
 * Get primary email from contact
 */
export const getContactEmail = (contact: Contact): string => {
  const primaryEmail = contact.contactDetails?.emails?.find(e => e.isPrimary)
  return primaryEmail?.address || contact.contactDetails?.emails?.[0]?.address || 'No email'
}

/**
 * Get primary phone from contact
 */
export const getContactPhone = (contact: Contact): string => {
  const primaryPhone = contact.contactDetails?.phones?.find(p => p.isPrimary)
  return primaryPhone?.number || contact.contactDetails?.phones?.[0]?.number || 'No phone'
}

/**
 * Get display name for contact
 */
export const getContactDisplayName = (contact: Contact): string => {
  return contact.personalInfo.displayName ||
    contact.personalInfo.preferredName ||
    `${contact.personalInfo.firstName} ${contact.personalInfo.lastName}`
}

/**
 * Get contact initials
 */
export const getContactInitials = (contact: Contact): string => {
  const firstName = contact.personalInfo.firstName?.[0] || ''
  const lastName = contact.personalInfo.lastName?.[0] || ''
  return (firstName + lastName).toUpperCase()
}

/**
 * Format currency amount
 */
export const formatCurrency = (amount: number, currency: string = 'USD'): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

/**
 * Get relative time string
 */
export const getRelativeTime = (dateString: string): string => {
  const date = new Date(dateString)
  const now = new Date()
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (diffInSeconds < 60) return 'Just now'
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)} days ago`
  
  return date.toLocaleDateString()
}

export default apiClient