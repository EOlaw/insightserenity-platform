/**
 * @fileoverview Consultant API Client
 * @description Comprehensive API client for consultant management operations
 * @module lib/api/consultant
 */

import { api } from './client'

// ==================== Type Definitions ====================

export interface ConsultantProfile {
  _id: string
  consultantCode: string
  userId: string
  tenantId: string
  organizationId: string
  profile: {
    firstName: string
    lastName: string
    middleName?: string
    preferredName?: string
    title?: string
    bio?: string
    summary?: string
    avatar?: string
    dateOfBirth?: string
    gender?: string
  }
  contact: {
    email: {
      primary: string
      secondary?: string[]
    }
    phone: {
      mobile?: string
      work?: string
      home?: string
    }
    address?: {
      current?: Address
      permanent?: Address
    }
    social?: {
      linkedin?: string
      github?: string
      twitter?: string
      website?: string
    }
  }
  professional: {
    employmentType: 'full_time' | 'part_time' | 'contract' | 'freelance' | 'temporary'
    level: 'junior' | 'mid' | 'senior' | 'lead' | 'principal' | 'director' | 'vp' | 'executive'
    grade?: string
    billableRate?: number
    costRate?: number
    currency?: string
    department?: string
    team?: string
    manager?: string
    directReports?: string[]
    startDate: string
    endDate?: string
    yearsOfExperience?: number
    industryExperience?: IndustryExperience[]
  }
  skills: Skill[]
  certifications: Certification[]
  education: Education[]
  workHistory: WorkHistory[]
  availability: {
    status: 'available' | 'partially_available' | 'unavailable' | 'on_leave' | 'on_project'
    utilizationTarget?: number
    currentUtilization?: number
    preferredWorkHours?: number
    workingHours?: {
      timezone: string
      schedule: Record<string, { start: string; end: string }>
    }
    blackoutDates?: BlackoutDate[]
  }
  performance: {
    rating: {
      overall?: number
      technical?: number
      communication?: number
      leadership?: number
      clientSatisfaction?: number
    }
    feedback: Feedback[]
    achievements: Achievement[]
  }
  documents: Document[]
  preferences: {
    projectTypes?: string[]
    clientTypes?: string[]
    industries?: string[]
    excludedClients?: string[]
    travelWillingness?: string
    maxTravelPercentage?: number
    remoteWorkPreference?: string
    workLocationPreferences?: string[]
  }
  status: {
    current: 'active' | 'inactive' | 'suspended' | 'terminated' | 'on_leave'
    reason?: string
    effectiveDate?: string
    isDeleted: boolean
  }
  metadata: {
    source?: string
    createdBy: string
    updatedBy?: string
  }
  createdAt: string
  updatedAt: string
}

export interface Address {
  street1?: string
  street2?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
  type?: 'current' | 'permanent' | 'billing'
}

export interface IndustryExperience {
  industry: string
  years: number
  description?: string
}

export interface Skill {
  _id?: string
  skillId?: string
  name: string
  category: 'technical' | 'functional' | 'domain' | 'soft_skill' | 'tool' | 'methodology' | 'language' | 'backend_technology' | 'other'
  proficiencyLevel: 'beginner' | 'intermediate' | 'advanced' | 'expert' | 'master'
  yearsOfExperience?: number
  lastUsed?: string
  verified?: boolean
  verifiedBy?: string
  verifiedAt?: string
  endorsements?: Endorsement[]
  projects?: SkillProject[]
}

export interface Endorsement {
  userId: string
  endorsedAt: string
  comment?: string
  relationship?: string
}

export interface SkillProject {
  projectId: string
  projectName: string
  role: string
}

export interface Certification {
  _id?: string
  certificationId?: string
  name: string
  issuingOrganization: string
  issueDate: string
  expirationDate?: string
  credentialId?: string
  credentialUrl?: string
  description?: string
  skills?: string[]
  status: 'active' | 'expired' | 'pending' | 'revoked'
}

export interface Education {
  _id?: string
  institution: string
  degree: string
  fieldOfStudy: string
  startDate: string
  endDate?: string
  grade?: string
  description?: string
  isCurrently?: boolean
}

export interface WorkHistory {
  _id?: string
  company: string
  position: string
  startDate: string
  endDate?: string
  description?: string
  responsibilities?: string[]
  achievements?: string[]
  technologies?: string[]
  isCurrently?: boolean
}

export interface BlackoutDate {
  _id?: string
  type: 'vacation' | 'training' | 'personal' | 'other'
  startDate: string
  endDate: string
  reason?: string
  status: 'pending' | 'approved' | 'rejected'
}

export interface Feedback {
  _id: string
  type: 'client' | 'peer' | 'manager' | 'direct_report' | 'self'
  source?: {
    userId?: string
    clientId?: string
    projectId?: string
  }
  rating?: number
  categories?: Record<string, number>
  content: string
  isAnonymous?: boolean
  createdAt: string
}

export interface Achievement {
  _id?: string
  title: string
  description: string
  date: string
  category?: string
  awarded?: boolean
  awardedBy?: string
}

export interface Document {
  _id?: string
  documentId?: string
  type: 'resume' | 'contract' | 'nda' | 'certification' | 'id' | 'background_check' | 'reference' | 'other'
  name: string
  description?: string
  url: string
  mimeType?: string
  size?: number
  uploadedBy?: string
  uploadedAt: string
  expirationDate?: string
  status: 'active' | 'archived' | 'expired' | 'pending_review'
  visibility: 'public' | 'internal' | 'confidential' | 'private'
}

export interface Assignment {
  _id: string
  consultant: {
    consultantId: string
    name: string
  }
  project: {
    projectId: string
    name: string
    client: {
      clientId: string
      name: string
    }
  }
  role: string
  startDate: string
  endDate?: string
  allocation: number
  billableRate?: number
  status: 'scheduled' | 'active' | 'completed' | 'cancelled' | 'on_hold'
  createdAt: string
  updatedAt: string
}

export interface AvailabilityRecord {
  _id: string
  consultantId: string
  type: 'vacation' | 'sick_leave' | 'training' | 'personal' | 'other'
  startDate: string
  endDate: string
  reason?: string
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  approvedBy?: string
  approvedAt?: string
  notes?: string
  createdAt: string
  updatedAt: string
}

export interface ConsultantSearchParams {
  search?: string
  status?: string
  availability?: string
  skills?: string[]
  level?: string
  department?: string
  location?: string
  page?: number
  limit?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

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

// ==================== Consultant API Methods ====================

export const consultantApi = {
  // ============= Profile Management =============

  /**
   * Get current consultant's profile (self-service /me endpoint)
   */
  getMyProfile: async (): Promise<ConsultantProfile> => {
    return api.get('/consultants/me')
  },

  /**
   * Update current consultant's profile (self-service)
   */
  updateMyProfile: async (data: Partial<ConsultantProfile>): Promise<ConsultantProfile> => {
    return api.put('/consultants/me', data)
  },

  /**
   * Get consultant by ID (peer view)
   */
  getConsultantById: async (consultantId: string): Promise<ConsultantProfile> => {
    return api.get(`/consultants/${consultantId}`)
  },

  /**
   * Get consultant by user ID (peer view)
   */
  getConsultantByUserId: async (userId: string): Promise<ConsultantProfile> => {
    return api.get(`/consultants/user/${userId}`)
  },

  /**
   * Search consultants (peer view)
   */
  searchConsultants: async (params?: ConsultantSearchParams): Promise<PaginatedResponse<ConsultantProfile>> => {
    return api.get('/consultants/search', { params })
  },

  /**
   * Get all consultants (peer view - read only)
   */
  getAllConsultants: async (params?: ConsultantSearchParams): Promise<PaginatedResponse<ConsultantProfile>> => {
    return api.get('/consultants', { params })
  },

  /**
   * Find available consultants (peer view)
   */
  getAvailableConsultants: async (): Promise<ConsultantProfile[]> => {
    return api.get('/consultants/available')
  },

  /**
   * Search consultants by skills (peer view)
   */
  searchBySkills: async (skills: string[]): Promise<ConsultantProfile[]> => {
    return api.post('/consultants/search-by-skills', { skills })
  },

  /**
   * Get consultant's direct reports (peer view)
   */
  getDirectReports: async (consultantId: string): Promise<ConsultantProfile[]> => {
    return api.get(`/consultants/${consultantId}/direct-reports`)
  },

  // ============= Skills Management (Self-Service) =============

  /**
   * Add a skill to own profile
   */
  addSkill: async (consultantId: string, skill: Partial<Skill>): Promise<Skill> => {
    return api.post(`/consultants/${consultantId}/skills`, skill)
  },

  /**
   * Update a skill on own profile
   */
  updateSkill: async (consultantId: string, skillName: string, updates: Partial<Skill>): Promise<Skill> => {
    return api.put(`/consultants/${consultantId}/skills/${skillName}`, updates)
  },

  /**
   * Remove a skill from own profile
   */
  removeSkill: async (consultantId: string, skillName: string): Promise<void> => {
    return api.delete(`/consultants/${consultantId}/skills/${skillName}`)
  },

  // ============= Certifications Management (Self-Service) =============

  /**
   * Add a certification to own profile
   */
  addCertification: async (consultantId: string, certification: Partial<Certification>): Promise<Certification> => {
    return api.post(`/consultants/${consultantId}/certifications`, certification)
  },

  /**
   * Update a certification on own profile
   */
  updateCertification: async (consultantId: string, certificationId: string, updates: Partial<Certification>): Promise<Certification> => {
    return api.put(`/consultants/${consultantId}/certifications/${certificationId}`, updates)
  },

  /**
   * Remove a certification from own profile
   */
  removeCertification: async (consultantId: string, certificationId: string): Promise<void> => {
    return api.delete(`/consultants/${consultantId}/certifications/${certificationId}`)
  },

  // ============= Education Management (Self-Service) =============

  /**
   * Add education to own profile
   */
  addEducation: async (consultantId: string, education: Partial<Education>): Promise<Education> => {
    return api.post(`/consultants/${consultantId}/education`, education)
  },

  // ============= Work History Management (Self-Service) =============

  /**
   * Add work history to own profile
   */
  addWorkHistory: async (consultantId: string, workHistory: Partial<WorkHistory>): Promise<WorkHistory> => {
    return api.post(`/consultants/${consultantId}/work-history`, workHistory)
  },

  // ============= Availability Management (Self-Service) =============

  /**
   * Update own availability preferences
   */
  updateAvailability: async (consultantId: string, availability: Partial<ConsultantProfile['availability']>): Promise<ConsultantProfile> => {
    return api.put(`/consultants/${consultantId}/availability`, availability)
  },

  /**
   * Add blackout dates to own calendar
   */
  addBlackoutDate: async (consultantId: string, blackoutDate: Partial<BlackoutDate>): Promise<BlackoutDate> => {
    return api.post(`/consultants/${consultantId}/blackout-dates`, blackoutDate)
  },

  /**
   * Get own availability records
   */
  getMyAvailability: async (): Promise<AvailabilityRecord[]> => {
    return api.get('/consultant-availability/me')
  },

  /**
   * Get consultant's availability (peer view)
   */
  getConsultantAvailability: async (consultantId: string): Promise<AvailabilityRecord[]> => {
    return api.get(`/consultant-availability/consultant/${consultantId}`)
  },

  /**
   * Create availability record (time-off request)
   */
  createAvailabilityRecord: async (consultantId: string, data: Partial<AvailabilityRecord>): Promise<AvailabilityRecord> => {
    return api.post(`/consultant-availability/consultant/${consultantId}`, data)
  },

  /**
   * Request time off (self-service)
   */
  requestTimeOff: async (consultantId: string, data: Partial<AvailabilityRecord>): Promise<AvailabilityRecord> => {
    return api.post(`/consultant-availability/consultant/${consultantId}/time-off`, data)
  },

  /**
   * Get time-off balance
   */
  getTimeOffBalance: async (consultantId: string): Promise<any> => {
    return api.get(`/consultant-availability/consultant/${consultantId}/time-off-balance`)
  },

  /**
   * Update availability record
   */
  updateAvailabilityRecord: async (availabilityId: string, data: Partial<AvailabilityRecord>): Promise<AvailabilityRecord> => {
    return api.put(`/consultant-availability/${availabilityId}`, data)
  },

  /**
   * Cancel availability record (time-off)
   */
  cancelAvailabilityRecord: async (availabilityId: string): Promise<void> => {
    return api.post(`/consultant-availability/${availabilityId}/cancel`)
  },

  /**
   * Delete availability record
   */
  deleteAvailabilityRecord: async (availabilityId: string): Promise<void> => {
    return api.delete(`/consultant-availability/${availabilityId}`)
  },

  // ============= Assignments (Peer View) =============

  /**
   * Get own assignments
   */
  getMyAssignments: async (): Promise<Assignment[]> => {
    return api.get('/consultant-assignments/me')
  },

  /**
   * Get consultant's assignments (peer view)
   */
  getConsultantAssignments: async (consultantId: string): Promise<Assignment[]> => {
    return api.get(`/consultant-assignments/consultant/${consultantId}`)
  },

  /**
   * Get consultant's allocation
   */
  getConsultantAllocation: async (consultantId: string): Promise<any> => {
    return api.get(`/consultant-assignments/consultant/${consultantId}/allocation`)
  },

  /**
   * Log time to assignment
   */
  logTime: async (assignmentId: string, timeLog: any): Promise<any> => {
    return api.post(`/consultant-assignments/${assignmentId}/time-log`, timeLog)
  },

  // ============= Documents Management (Self-Service) =============

  /**
   * Upload document to own profile
   */
  uploadDocument: async (consultantId: string, file: File, metadata: Partial<Document>): Promise<Document> => {
    const formData = new FormData()
    formData.append('file', file)
    Object.entries(metadata).forEach(([key, value]) => {
      if (value !== undefined) {
        formData.append(key, String(value))
      }
    })
    
    return api.post(`/consultants/${consultantId}/documents`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
  },

  /**
   * Remove document from own profile
   */
  removeDocument: async (consultantId: string, documentId: string): Promise<void> => {
    return api.delete(`/consultants/${consultantId}/documents/${documentId}`)
  },

  // ============= Feedback (Peer Collaboration) =============

  /**
   * Submit feedback for a colleague
   */
  submitFeedback: async (consultantId: string, feedback: Partial<Feedback>): Promise<Feedback> => {
    return api.post(`/consultants/${consultantId}/feedback`, feedback)
  },

  // ============= Achievements (Self-Service) =============

  /**
   * Record own achievement
   */
  addAchievement: async (consultantId: string, achievement: Partial<Achievement>): Promise<Achievement> => {
    return api.post(`/consultants/${consultantId}/achievements`, achievement)
  },
}

export default consultantApi