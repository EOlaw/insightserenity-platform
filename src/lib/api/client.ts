/**
 * @fileoverview Comprehensive API Client for InsightSerenity Platform
 * @description Unified API client handling all backend communications including authentication,
 *              client management (contacts, documents, notes), and core platform operations
 * @version 2.2.0
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
 * Contact entity based on MongoDB ClientContact model
 */
export interface Contact {
  _id: string;
  contactId: string;
  clientId: string;
  personalInfo: {
    prefix?: string;
    firstName: string;
    middleName?: string;
    lastName: string;
    suffix?: string;
    displayName?: string;
    preferredName?: string;
  };
  professionalInfo: {
    jobTitle?: string;
    department?: string;
    companyName?: string;
    role?: string;
  };
  contactDetails: {
    emails: Array<{
      type: string;
      address: string;
      isPrimary: boolean;
      isVerified: boolean;
    }>;
    phones: Array<{
      type: string;
      number: string;
      isPrimary: boolean;
      extension?: string;
    }>;
  };
  status: {
    current: string;
    isActive: boolean;
  };
  createdAt: string;
  updatedAt: string;
}

/**
 * Document entity based on MongoDB ClientDocument model
 */
export interface Document {
  _id: string;
  documentId: string;
  clientId: string;
  projectId?: string;
  engagementId?: string;
  documentInfo: {
    name: string;
    displayName?: string;
    description?: string;
    type: string;
    category?: {
      primary: string;
      secondary?: string[];
      custom?: string[];
    };
    classification?: {
      level: string;
      handling?: string;
      markings?: string[];
    };
    language?: string;
    keywords?: string[];
    abstract?: string;
  };
  fileDetails: {
    originalName: string;
    fileName: string;
    fileExtension: string;
    mimeType: string;
    size: number;
    encoding?: string;
    checksum?: {
      md5?: string;
      sha256?: string;
    };
    dimensions?: {
      width?: number;
      height?: number;
      duration?: number;
      pages?: number;
    };
    metadata?: {
      author?: string;
      creator?: string;
      producer?: string;
      subject?: string;
      title?: string;
      creationDate?: Date;
      modificationDate?: Date;
    };
  };
  storage: {
    provider: string;
    location?: {
      bucket?: string;
      path?: string;
      region?: string;
    };
    url: string;
    publicUrl?: string;
    thumbnailUrl?: string;
    cdnUrl?: string;
    signedUrl?: {
      url?: string;
      expiresAt?: Date;
    };
    backup?: {
      enabled?: boolean;
      location?: string;
      lastBackup?: Date;
    };
    encryption?: {
      enabled: boolean;
      algorithm?: string;
      keyId?: string;
    };
    compression?: {
      enabled?: boolean;
      algorithm?: string;
      originalSize?: number;
    };
  };
  versioning: {
    version: {
      major: number;
      minor: number;
      patch: number;
      label?: string;
    };
    versionString: string;
    isLatest: boolean;
    isDraft: boolean;
    parentVersionId?: string;
    versionHistory?: Array<{
      versionId: string;
      version: string;
      createdAt: Date;
      createdBy: string;
      changeNotes?: string;
      size: number;
    }>;
    changeLog?: Array<{
      version: string;
      date: Date;
      author: string;
      changes: string[];
      reviewedBy?: string;
    }>;
  };
  accessControl?: {
    owner: string;
    permissions?: any;
    sharing?: any;
    restrictions?: any;
  };
  lifecycle: {
    status: string;
    stage?: string;
    workflow?: any;
    approval?: any;
    review?: {
      nextReviewDate?: Date;
      reviewFrequency?: any;
      lastReviewDate?: Date;
      reviewedBy?: string;
      reviewNotes?: string;
    };
    retention?: any;
  };
  relationships?: {
    relatedDocuments?: any[];
    contracts?: any[];
    invoices?: any[];
    dependencies?: any[];
    externalReferences?: any[];
  };
  signatures?: {
    required: boolean;
    signatories?: any[];
    envelope?: any;
    auditTrail?: any[];
  };
  collaboration?: {
    comments?: any[];
    annotations?: any[];
    tasks?: any[];
  };
  analytics?: {
    views?: any;
    downloads?: any;
    shares?: any;
    prints?: any;
    engagement?: any;
    usage?: any;
  };
  contentExtraction?: {
    ocr?: any;
    textContent?: any;
    metadata?: any;
    entities?: any[];
    searchableContent?: string;
  };
  compliance?: {
    regulatory?: any;
    privacy?: any;
    audit?: any;
    dataClassification?: any;
  };
  quality?: {
    validation?: any;
    integrity?: any;
    completeness?: any;
  };
  processing?: {
    status?: string;
    queue?: any;
    jobs?: any[];
    conversions?: any[];
    thumbnails?: any[];
  };
  tags?: {
    system?: string[];
    user?: string[];
    auto?: string[];
    taxonomy?: any[];
  };
  customFields?: Record<string, any>;
  metadata: {
    source?: string;
    uploadedBy: string;
    uploadedAt: Date;
    importBatch?: string;
    flags?: {
      isFavorite?: boolean;
      isPinned?: boolean;
      isTemplate?: boolean;
      requiresAction?: boolean;
    };
  };
  searchTokens?: string[];
  isDeleted: boolean;
  deletedAt?: Date;
  deletedBy?: string;
  restorable?: boolean;
  permanentDeletionDate?: Date;
  createdAt: string;
  updatedAt: string;
}

/**
 * Note entity based on MongoDB ClientNote model
 */
export interface Note {
  _id: string;
  noteId: string;
  clientId: string;
  content: {
    title?: string;
    body: string;
    summary?: string;
    format: string;
  };
  classification: {
    type: string;
    category: {
      primary: string;
      secondary?: string[];
    };
    importance: string;
    urgency: string;
    tags?: {
      system?: string[];
      user?: string[];
      auto?: string[];
    };
  };
  visibility: {
    scope: string;
  };
  status: {
    current: string;
    isActive: boolean;
  };
  metadata: {
    createdBy: string;
    createdAt: string;
  };
  createdAt: string;
  updatedAt: string;
}

/**
 * Metadata for paginated responses
 */
export interface ResponseMetadata {
  total: number;
  count: number;
  limit: number;
  skip: number;
  hasMore: boolean;
  filters?: Record<string, any>;
}

/**
 * Standard API response wrapper
 */
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  metadata?: ResponseMetadata;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
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

// ==================== Contact Management API ====================

export const contactsApi = {
  getAll: async (params?: { 
    page?: number; 
    limit?: number; 
    search?: string;
    status?: string;
    role?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<ApiResponse<Contact[]>> => {
    const queryParams = new URLSearchParams();
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.page !== undefined) {
      const skip = (params.page - 1) * (params.limit || 50);
      queryParams.append('skip', skip.toString());
    }
    if (params?.search) queryParams.append('search', params.search);
    if (params?.status) queryParams.append('status', params.status);
    if (params?.role) queryParams.append('role', params.role);
    if (params?.sortBy) queryParams.append('sortBy', params.sortBy);
    if (params?.sortOrder) queryParams.append('sortOrder', params.sortOrder);
    
    const query = queryParams.toString() ? `?${queryParams.toString()}` : '';
    return api.get(`/contacts${query}`);
  },

  getById: async (contactId: string): Promise<ApiResponse<Contact>> => {
    return api.get(`/contacts/${contactId}`);
  },

  create: async (contactData: Partial<Contact>): Promise<ApiResponse<Contact>> => {
    return api.post('/contacts', contactData);
  },

  update: async (contactId: string, contactData: Partial<Contact>): Promise<ApiResponse<Contact>> => {
    return api.put(`/contacts/${contactId}`, contactData);
  },

  patch: async (contactId: string, contactData: Partial<Contact>): Promise<ApiResponse<Contact>> => {
    return api.patch(`/contacts/${contactId}`, contactData);
  },

  delete: async (contactId: string): Promise<ApiResponse<{ message: string }>> => {
    return api.delete(`/contacts/${contactId}`);
  },
};

// ==================== Document Management API ====================

export const documentsApi = {
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
    const queryParams = new URLSearchParams();
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.page !== undefined) {
      const skip = (params.page - 1) * (params.limit || 50);
      queryParams.append('skip', skip.toString());
    }
    if (params?.search) queryParams.append('search', params.search);
    if (params?.type) queryParams.append('type', params.type);
    if (params?.status) queryParams.append('status', params.status);
    if (params?.classification) queryParams.append('classification', params.classification);
    if (params?.sortBy) queryParams.append('sortBy', params.sortBy);
    if (params?.sortOrder) queryParams.append('sortOrder', params.sortOrder);
    
    const query = queryParams.toString() ? `?${queryParams.toString()}` : '';
    return api.get(`/documents${query}`);
  },

  getById: async (documentId: string): Promise<ApiResponse<Document>> => {
    return api.get(`/clients/documents/${documentId}`);
  },

  create: async (documentData: Partial<Document>): Promise<ApiResponse<Document>> => {
    return api.post('/documents', documentData);
  },

  upload: async (file: File, onProgress?: (progress: number) => void): Promise<ApiResponse<Document>> => {
    return api.upload('/documents', file, onProgress);
  },

  update: async (documentId: string, documentData: Partial<Document>): Promise<ApiResponse<Document>> => {
    return api.put(`/documents/${documentId}`, documentData);
  },

  patch: async (documentId: string, documentData: Partial<Document>): Promise<ApiResponse<Document>> => {
    return api.patch(`/documents/${documentId}`, documentData);
  },

  delete: async (documentId: string): Promise<ApiResponse<{ message: string }>> => {
    return api.delete(`/documents/${documentId}`);
  },

  download: async (documentId: string): Promise<void> => {
    const token = Cookies.get(AUTH_TOKEN_KEY);
    if (!token) {
      throw new Error('Authentication required for document download');
    }
    
    const url = `${API_BASE_URL}/${API_VERSION}/documents/${documentId}/download`;
    window.open(`${url}?token=${token}`, '_blank');
  },

  getVersions: async (documentId: string): Promise<ApiResponse<any[]>> => {
    return api.get(`/documents/${documentId}/versions`);
  },

  share: async (documentId: string, shareData: any): Promise<ApiResponse<any>> => {
    return api.post(`/documents/${documentId}/share`, shareData);
  },
};

// ==================== Note Management API ====================

export const notesApi = {
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
    const queryParams = new URLSearchParams();
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.page !== undefined) {
      const skip = (params.page - 1) * (params.limit || 50);
      queryParams.append('skip', skip.toString());
    }
    if (params?.search) queryParams.append('search', params.search);
    if (params?.type) queryParams.append('type', params.type);
    if (params?.importance) queryParams.append('importance', params.importance);
    if (params?.category) queryParams.append('category', params.category);
    if (params?.status) queryParams.append('status', params.status);
    if (params?.sortBy) queryParams.append('sortBy', params.sortBy);
    if (params?.sortOrder) queryParams.append('sortOrder', params.sortOrder);
    
    const query = queryParams.toString() ? `?${queryParams.toString()}` : '';
    return api.get(`/notes${query}`);
  },

  getById: async (noteId: string): Promise<ApiResponse<Note>> => {
    return api.get(`/clients/notes/${noteId}`);
  },

  create: async (noteData: Partial<Note>): Promise<ApiResponse<Note>> => {
    return api.post('/notes', noteData);
  },

  update: async (noteId: string, noteData: Partial<Note>): Promise<ApiResponse<Note>> => {
    return api.put(`/notes/${noteId}`, noteData);
  },

  patch: async (noteId: string, noteData: Partial<Note>): Promise<ApiResponse<Note>> => {
    return api.patch(`/notes/${noteId}`, noteData);
  },

  delete: async (noteId: string): Promise<ApiResponse<{ message: string }>> => {
    return api.delete(`/notes/${noteId}`);
  },

  search: async (searchParams: {
    query?: string;
    type?: string[];
    importance?: string[];
    category?: string[];
    dateFrom?: string;
    dateTo?: string;
  }): Promise<ApiResponse<Note[]>> => {
    return api.post('/notes/search', searchParams);
  },

  getRecent: async (limit: number = 10): Promise<ApiResponse<Note[]>> => {
    return api.get(`/notes/recent?limit=${limit}`);
  },

  getByTag: async (tag: string): Promise<ApiResponse<Note[]>> => {
    return api.get(`/notes/tags/${encodeURIComponent(tag)}`);
  },

  getByPriority: async (priority: string): Promise<ApiResponse<Note[]>> => {
    return api.get(`/notes/priority/${priority}`);
  },

  export: async (format: 'csv' | 'json' | 'pdf', filters?: any): Promise<ApiResponse<{ url: string }>> => {
    return api.post(`/notes/export?format=${format}`, filters || {});
  },
};

// ==================== Utility Functions ====================

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

export const getFileIcon = (mimeType: string): string => {
  if (mimeType.includes('pdf')) return '📄';
  if (mimeType.includes('word') || mimeType.includes('document')) return '📝';
  if (mimeType.includes('sheet') || mimeType.includes('excel')) return '📊';
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return '📽️';
  if (mimeType.includes('image')) return '🖼️';
  if (mimeType.includes('video')) return '🎥';
  if (mimeType.includes('audio')) return '🎵';
  if (mimeType.includes('zip') || mimeType.includes('compressed')) return '📦';
  return '📁';
};

export const getImportanceBadge = (importance: string): string => {
  const badges: Record<string, string> = {
    critical: 'bg-red-100 text-red-800',
    high: 'bg-orange-100 text-orange-800',
    medium: 'bg-yellow-100 text-yellow-800',
    low: 'bg-blue-100 text-blue-800',
    fyi: 'bg-gray-100 text-gray-800',
  };
  return badges[importance] || badges.fyi;
};

export const getUrgencyIcon = (urgency: string): string => {
  switch (urgency) {
    case 'immediate':
    case 'urgent':
      return '🔴';
    case 'normal':
      return '🟡';
    case 'low':
    case 'none':
      return '🟢';
    default:
      return '⚪';
  }
};

export const getContactEmail = (contact: Contact): string => {
  const primaryEmail = contact.contactDetails?.emails?.find(e => e.isPrimary);
  return primaryEmail?.address || contact.contactDetails?.emails?.[0]?.address || 'No email';
};

export const getContactPhone = (contact: Contact): string => {
  const primaryPhone = contact.contactDetails?.phones?.find(p => p.isPrimary);
  return primaryPhone?.number || contact.contactDetails?.phones?.[0]?.number || 'No phone';
};

export const getContactDisplayName = (contact: Contact): string => {
  return contact.personalInfo.displayName || 
         contact.personalInfo.preferredName ||
         `${contact.personalInfo.firstName} ${contact.personalInfo.lastName}`;
};

export const getContactInitials = (contact: Contact): string => {
  const firstName = contact.personalInfo.firstName?.[0] || '';
  const lastName = contact.personalInfo.lastName?.[0] || '';
  return (firstName + lastName).toUpperCase();
};

export default apiClient