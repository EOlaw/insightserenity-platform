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

export interface SkillRecord {
    _id: string
    consultantId: string
    skillName: string
    category: string
    proficiencyLevel: string
    yearsOfExperience?: number
    lastUsed?: string
    selfAssessment?: {
        rating: number
        notes?: string
        assessedAt: string
    }
    endorsements?: SkillEndorsement[]
    projectExperience?: ProjectExperience[]
    training?: {
        completedCourses?: CompletedCourse[]
        enrollments?: CourseEnrollment[]
    }
    verified?: boolean
    verifiedBy?: string
    verifiedAt?: string
    createdAt: string
    updatedAt: string
}

export interface SkillEndorsement {
    _id?: string
    endorserId: string
    endorserName?: string
    relationship?: string
    comment?: string
    endorsedAt: string
}

export interface ProjectExperience {
    _id?: string
    projectId?: string
    projectName: string
    role: string
    description?: string
    startDate: string
    endDate?: string
    feedback?: {
        rating?: number
        comment?: string
        source?: string
    }
}

export interface CompletedCourse {
    _id?: string
    courseName: string
    provider: string
    completionDate: string
    certificateUrl?: string
    hours?: number
}

export interface CourseEnrollment {
    _id?: string
    courseName: string
    provider: string
    enrollmentDate: string
    expectedCompletion?: string
    progress?: number
    status?: 'enrolled' | 'in_progress' | 'completed' | 'dropped'
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
    availabilityId: string
    consultantId: string
    type: 'regular' | 'exception' | 'time_off' | 'holiday' | 'blackout' | 'override' | 'training' | 'internal'
    period: {
        startDate: string
        endDate: string
        startTime?: string
        endTime?: string
        timezone?: string
        allDay?: boolean
    }
    capacity?: {
        hoursAvailable?: number
        percentageAvailable?: number
        maxProjects?: number
        preferredHoursPerDay?: number
        billableTarget?: number
    }
    availabilityStatus: 'available' | 'partially_available' | 'unavailable' | 'tentative' | 'pending_approval'
    timeOff?: {
        reason: string
        description?: string
        isPaid?: boolean
        hoursUsed?: number
        approvalStatus: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'auto_approved'
        approvedBy?: string
        approvedAt?: string
        rejectionReason?: string
        requestedAt?: string
    }
    preferences?: {
        workLocation?: string
        preferredLocations?: string[]
        projectTypes?: string[]
        clientTypes?: string[]
        travelWillingness?: string
        travelPercentage?: number
    }
    status: {
        current: string
        isActive: boolean
        isDeleted: boolean
    }
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

export interface TimeLogEntry {
    date: string
    hours: number
    description?: string
    billable?: boolean
}

// ==================== NEW: Dashboard Analytics Types ====================

export interface DashboardData {
    stats: {
        activeAssignments: number
        currentUtilization: number
        utilizationTarget: number
        totalSkills: number
        upcomingTimeOff: number
        feedbackCount: number
        completedProjects: number
        certifications: number
        billableHours: number
        revenue: number
        clientSatisfaction: number
        responseTime: number
    }
    performanceMetrics: {
        utilizationRate: number
        utilizationTarget: number
        clientSatisfaction: number
        projectDeliveryRate: number
        skillsDevelopment: number
        revenueGrowth: number
        teamCollaboration: number
    }
    revenueAnalytics: {
        revenueByClient: Array<{ name: string; value: number; color: string }>
        monthlyRevenue: Array<{ month: string; revenue: number; billableHours: number }>
        totalRevenue: number
    }
    utilizationTrend: Array<{ month: string; utilization: number; target: number }>
    satisfactionTrend: Array<{ month: string; rating: number }>
    projectDistribution: Array<{ name: string; value: number; color: string }>
    skillsMatrix: Array<{ skill: string; proficiency: number }>
    recentActivities: Array<{
        id: string
        type: string
        title: string
        time: string
        icon: string
    }>
    upcomingEvents: Array<{
        id: string
        title: string
        date: string
        time: string
        type: string
    }>
    learningRecommendations: Array<{
        id: string
        title: string
        provider: string
        duration: string
        relevance: number
    }>
    generatedAt: string
    fromCache?: boolean
    cachedAt?: string
    loadTime?: number
}

export interface CacheStatus {
    cached: boolean
    enabled: boolean
    ttl?: number
    expiresIn?: string
}

export interface DashboardRefreshResult {
    success: boolean
    message: string
    dashboard: DashboardData
}

export interface DashboardAnalytics {
  summary: {
    totalRevenue: number
    activeAssignments: number
    currentUtilization: number
    averageSatisfaction: number
    totalHoursLogged: number
    billableHoursLogged: number
  }
  monthlyRevenue: Array<{
    month: string
    label: string
    revenue: number
  }>
  utilizationTrends: Array<{
    month: string
    label: string
    utilization: number
  }>
  revenueByClient: Array<{
    clientId: string
    clientName: string
    revenue: number
  }>
  clientSatisfaction: Array<{
    month: string
    label: string
    satisfaction: number
    feedbackCount: number
  }>
  skillsProficiency: Array<{
    skill: string
    proficiency: number
    level: string
    yearsOfExperience: number
    verified: boolean
  }>
  projectStatus: {
    active: number
    completed: number
    on_hold: number
    scheduled: number
    cancelled: number
  }
  activeCertifications: Array<{
    name: string
    issuingOrganization: string
    issueDate: string
    expirationDate?: string
    verified: boolean
  }>
  generatedAt: string
  period: {
    start: string
    end: string
    months: number
  }
}

// ==================== Consultant API Methods ====================

export const consultantApi = {
    // ============================================================================
    // PROFILE MANAGEMENT (consultant-routes.js)
    // ============================================================================

    /**
     * Get current consultant's profile (self-service /me endpoint)
     */
    getMyProfile: async (): Promise<ConsultantProfile> => {
        const response = await api.get('/consultants/me')
        return response.data
    },

    // ============================================================================
    // ANALYTICS & DASHBOARD (Backend-Computed Metrics)
    // ============================================================================

    /**
     * Get comprehensive dashboard analytics for current consultant
     * Backend computes all metrics using MongoDB aggregation pipelines
     * @param monthsBack - Number of months to include in trends (default: 6)
     * @returns Complete dashboard analytics with computed metrics
     */
    getMyDashboardAnalytics: async (monthsBack: number = 6): Promise<DashboardAnalytics> => {
        const response = await api.get('/consultants/me/dashboard-analytics', {
            params: { monthsBack }
        })
        return response.data
    },

    /**
     * Update current consultant's profile (self-service)
     */
    updateMyProfile: async (data: Partial<ConsultantProfile>): Promise<ConsultantProfile> => {
        const response = await api.put('/consultants/me', data)
        return response.data
    },

    /**
     * Get consultant by ID (peer view)
     */
    getConsultantById: async (consultantId: string): Promise<ConsultantProfile> => {
        const response = await api.get(`/consultants/${consultantId}`)
        return response.data
    },

    /**
     * Get consultant by user ID (peer view)
     */
    getConsultantByUserId: async (userId: string): Promise<ConsultantProfile> => {
        const response = await api.get(`/consultants/user/${userId}`)
        return response.data
    },

    /**
     * Search consultants (peer view)
     */
    searchConsultants: async (params?: ConsultantSearchParams): Promise<PaginatedResponse<ConsultantProfile>> => {
        const response = await api.get('/consultants/search', { params })
        return response.data
    },

    /**
     * Get all consultants (peer view - read only)
     */
    getAllConsultants: async (params?: ConsultantSearchParams): Promise<PaginatedResponse<ConsultantProfile>> => {
        const response = await api.get('/consultants', { params })
        return response.data
    },

    /**
     * Find available consultants (peer view)
     */
    getAvailableConsultants: async (): Promise<ConsultantProfile[]> => {
        const response = await api.get('/consultants/available')
        return response.data
    },

    /**
     * Search consultants by skills (peer view)
     */
    searchBySkills: async (skills: string[]): Promise<ConsultantProfile[]> => {
        const response = await api.post('/consultants/search-by-skills', { skills })
        return response.data
    },

    /**
     * Get consultant's direct reports (peer view)
     */
    getDirectReports: async (consultantId: string): Promise<ConsultantProfile[]> => {
        const response = await api.get(`/consultants/${consultantId}/direct-reports`)
        return response.data
    },

    // ============================================================================
    // EMBEDDED PROFILE OPERATIONS (consultant-routes.js)
    // These operations work on embedded arrays within the consultant profile
    // ============================================================================

    /**
     * Update availability preferences (embedded in profile)
     */
    updateAvailability: async (consultantId: string, availability: Partial<ConsultantProfile['availability']>): Promise<ConsultantProfile> => {
        const response = await api.put(`/consultants/${consultantId}/availability`, availability)
        return response.data
    },

    /**
     * Add blackout dates (embedded in profile)
     */
    addBlackoutDate: async (consultantId: string, blackoutDate: Partial<BlackoutDate>): Promise<BlackoutDate> => {
        const response = await api.post(`/consultants/${consultantId}/blackout-dates`, blackoutDate)
        return response.data
    },

    /**
     * Add a skill (embedded in profile)
     */
    addSkill: async (consultantId: string, skill: Partial<Skill>): Promise<Skill> => {
        const response = await api.post(`/consultants/${consultantId}/skills`, skill)
        return response.data
    },

    /**
     * Update a skill (embedded in profile)
     */
    updateSkill: async (consultantId: string, skillName: string, updates: Partial<Skill>): Promise<Skill> => {
        const response = await api.put(`/consultants/${consultantId}/skills/${skillName}`, updates)
        return response.data
    },

    /**
     * Remove a skill (embedded in profile)
     */
    removeSkill: async (consultantId: string, skillName: string): Promise<void> => {
        await api.delete(`/consultants/${consultantId}/skills/${skillName}`)
    },

    /**
     * Add a certification (embedded in profile)
     */
    addCertification: async (consultantId: string, certification: Partial<Certification>): Promise<Certification> => {
        const response = await api.post(`/consultants/${consultantId}/certifications`, certification)
        return response.data
    },

    /**
     * Update a certification (embedded in profile)
     */
    updateCertification: async (consultantId: string, certificationId: string, updates: Partial<Certification>): Promise<Certification> => {
        const response = await api.put(`/consultants/${consultantId}/certifications/${certificationId}`, updates)
        return response.data
    },

    /**
     * Remove a certification (embedded in profile)
     */
    removeCertification: async (consultantId: string, certificationId: string): Promise<void> => {
        await api.delete(`/consultants/${consultantId}/certifications/${certificationId}`)
    },

    /**
     * Add education (embedded in profile)
     */
    addEducation: async (consultantId: string, education: Partial<Education>): Promise<Education> => {
        const response = await api.post(`/consultants/${consultantId}/education`, education)
        return response.data
    },

    /**
     * Add work history (embedded in profile)
     */
    addWorkHistory: async (consultantId: string, workHistory: Partial<WorkHistory>): Promise<WorkHistory> => {
        const response = await api.post(`/consultants/${consultantId}/work-history`, workHistory)
        return response.data
    },

    /**
     * Upload document
     */
    uploadDocument: async (consultantId: string, file: File, metadata: Partial<Document>): Promise<Document> => {
        const formData = new FormData()
        formData.append('file', file)
        Object.entries(metadata).forEach(([key, value]) => {
            if (value !== undefined) {
                formData.append(key, String(value))
            }
        })

        const response = await api.post(`/consultants/${consultantId}/documents`, formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        })
        return response.data
    },

    /**
     * Remove document
     */
    removeDocument: async (consultantId: string, documentId: string): Promise<void> => {
        await api.delete(`/consultants/${consultantId}/documents/${documentId}`)
    },

    /**
     * Submit feedback for a colleague
     */
    submitFeedback: async (consultantId: string, feedback: Partial<Feedback>): Promise<Feedback> => {
        const response = await api.post(`/consultants/${consultantId}/feedback`, feedback)
        return response.data
    },

    /**
     * Record achievement
     */
    addAchievement: async (consultantId: string, achievement: Partial<Achievement>): Promise<Achievement> => {
        const response = await api.post(`/consultants/${consultantId}/achievements`, achievement)
        return response.data
    },

    // ============================================================================
    // SKILL MANAGEMENT (consultant-skill-routes.js)
    // These operations work with the dedicated ConsultantSkill collection
    // ============================================================================

    /**
     * Get current user's skill records (self-service)
     */
    getMySkills: async (): Promise<PaginatedResponse<SkillRecord>> => {
        const response = await api.get('/consultants/consultant-skills/me')
        return response.data
    },

    /**
     * Get all skills for a consultant (peer view)
     */
    getConsultantSkills: async (consultantId: string, params?: any): Promise<PaginatedResponse<SkillRecord>> => {
        const response = await api.get(`/consultants/consultant-skills/${consultantId}`, { params })
        return response.data
    },

    /**
     * Get skill record by ID (peer view)
     */
    getSkillRecordById: async (skillRecordId: string): Promise<SkillRecord> => {
        const response = await api.get(`/consultants/consultant-skills/${skillRecordId}`)
        return response.data
    },

    /**
     * Create a new skill record (self-service)
     */
    createSkillRecord: async (consultantId: string, data: Partial<SkillRecord>): Promise<SkillRecord> => {
        const response = await api.post(`/consultants/consultant-skills/${consultantId}`, data)
        return response.data
    },

    /**
     * Update skill record (self-service)
     */
    updateSkillRecord: async (skillRecordId: string, data: Partial<SkillRecord>): Promise<SkillRecord> => {
        const response = await api.put(`/consultants/consultant-skills/${skillRecordId}`, data)
        return response.data
    },

    /**
     * Delete skill record (self-service)
     */
    deleteSkillRecord: async (skillRecordId: string): Promise<void> => {
        await api.delete(`/consultants/consultant-skills/${skillRecordId}`)
    },

    /**
     * Submit self-assessment (self-service)
     */
    submitSelfAssessment: async (skillRecordId: string, assessment: { rating: number; notes?: string }): Promise<SkillRecord> => {
        const response = await api.post(`/consultants/consultant-skills/${skillRecordId}/self-assessment`, assessment)
        return response.data
    },

    /**
     * Request skill assessment from manager or peer (self-service)
     */
    requestAssessment: async (skillRecordId: string, data: { assessorId: string; message?: string }): Promise<any> => {
        const response = await api.post(`/consultants/consultant-skills/${skillRecordId}/request-assessment`, data)
        return response.data
    },

    /**
     * Add endorsement to skill (peer collaboration)
     */
    addSkillEndorsement: async (skillRecordId: string, endorsement: Partial<SkillEndorsement>): Promise<SkillRecord> => {
        const response = await api.post(`/consultants/consultant-skills/${skillRecordId}/endorsements`, endorsement)
        return response.data
    },

    /**
     * Remove endorsement from skill (peer collaboration)
     */
    removeSkillEndorsement: async (skillRecordId: string, endorsementId: string): Promise<void> => {
        await api.delete(`/consultants/consultant-skills/${skillRecordId}/endorsements/${endorsementId}`)
    },

    /**
     * Add project experience to skill (self-service)
     */
    addProjectExperience: async (skillRecordId: string, project: Partial<ProjectExperience>): Promise<SkillRecord> => {
        const response = await api.post(`/consultants/consultant-skills/${skillRecordId}/projects`, project)
        return response.data
    },

    /**
     * Update project experience feedback (self-service)
     */
    updateProjectFeedback: async (skillRecordId: string, projectId: string, feedback: any): Promise<SkillRecord> => {
        const response = await api.put(`/consultants/consultant-skills/${skillRecordId}/projects/${projectId}/feedback`, feedback)
        return response.data
    },

    /**
     * Add completed course to skill (self-service)
     */
    addCompletedCourse: async (skillRecordId: string, course: Partial<CompletedCourse>): Promise<SkillRecord> => {
        const response = await api.post(`/consultants/consultant-skills/${skillRecordId}/courses/completed`, course)
        return response.data
    },

    /**
     * Add course enrollment to skill (self-service)
     */
    addCourseEnrollment: async (skillRecordId: string, enrollment: Partial<CourseEnrollment>): Promise<SkillRecord> => {
        const response = await api.post(`/consultants/consultant-skills/${skillRecordId}/courses/enrollment`, enrollment)
        return response.data
    },

    /**
     * Update course enrollment progress (self-service)
     */
    updateEnrollmentProgress: async (skillRecordId: string, courseId: string, progress: { progress?: number; status?: string }): Promise<SkillRecord> => {
        const response = await api.put(`/consultants/consultant-skills/${skillRecordId}/courses/${courseId}/progress`, progress)
        return response.data
    },

    // ============================================================================
    // AVAILABILITY MANAGEMENT (consultant-availability-routes.js)
    // These operations work with the dedicated ConsultantAvailability collection
    // ============================================================================

    /**
     * Get current user's availability records (self-service)
     * Returns all availability records including both availability slots and time-off requests
     */
    getMyAvailability: async (params?: any): Promise<PaginatedResponse<AvailabilityRecord>> => {
        const response = await api.get('/consultants/consultant-availability/me', { params })
        return response.data
    },

    /**
     * Get current user's availability slots only (excludes time-off requests)
     * Filters to show only records where consultant IS available for work
     */
    getMyAvailabilitySlots: async (params?: any): Promise<PaginatedResponse<AvailabilityRecord>> => {
        const response = await api.get('/consultants/consultant-availability/me', { params })
        const responseData = response.data
        
        if (responseData.data) {
            responseData.data = responseData.data.filter((record: AvailabilityRecord) => 
                !record.timeOff?.approvalStatus && record.availabilityStatus !== 'unavailable'
            )
        }
        
        return responseData
    },

    /**
     * Get current user's time-off requests only (excludes availability slots)
     * Filters to show only records that have approval workflow
     */
    getMyTimeOffRequests: async (params?: any): Promise<PaginatedResponse<AvailabilityRecord>> => {
        const response = await api.get('/consultants/consultant-availability/me', { params })
        const responseData = response.data
        
        if (responseData.data) {
            responseData.data = responseData.data.filter((record: AvailabilityRecord) => 
                record.timeOff?.approvalStatus !== undefined
            )
        }
        
        return responseData
    },

    /**
     * Get consultant's availability records (peer view)
     */
    getConsultantAvailability: async (consultantId: string, params?: any): Promise<PaginatedResponse<AvailabilityRecord>> => {
        const response = await api.get(`/consultants/consultant-availability/consultant/${consultantId}`, { params })
        return response.data
    },

    /**
     * Get consultant capacity for a date range (peer view)
     */
    getConsultantCapacity: async (consultantId: string, params: { startDate: string; endDate: string }): Promise<any> => {
        const response = await api.get(`/consultants/consultant-availability/consultant/${consultantId}/capacity`, { params })
        return response.data
    },

    /**
     * Get availability record by ID (peer view)
     */
    getAvailabilityById: async (availabilityId: string): Promise<AvailabilityRecord> => {
        const response = await api.get(`/consultants/consultant-availability/${availabilityId}`)
        return response.data
    },

    /**
     * Create availability record (self-service - generic)
     * Use createAvailabilitySlot for availability windows or requestTimeOff for time-off requests
     */
    createAvailabilityRecord: async (consultantId: string, data: Partial<AvailabilityRecord>): Promise<AvailabilityRecord> => {
        const response = await api.post(`/consultants/consultant-availability/consultant/${consultantId}`, data)
        return response.data
    },

    /**
     * Create availability slot (self-service)
     * Use this method when consultant IS available for work and wants to signal capacity
     */
    createAvailabilitySlot: async (consultantId: string, data: {
        period: {
            startDate: string
            endDate: string
            startTime?: string
            endTime?: string
            timezone?: string
            allDay?: boolean
        }
        capacity?: {
            hoursAvailable?: number
            percentageAvailable?: number
            maxProjects?: number
            preferredHoursPerDay?: number
            billableTarget?: number
        }
        preferences?: {
            workLocation?: string
            preferredLocations?: string[]
            projectTypes?: string[]
            clientTypes?: string[]
            travelWillingness?: string
            travelPercentage?: number
        }
    }): Promise<AvailabilityRecord> => {
        const response = await api.post(`/consultants/consultant-availability/consultant/${consultantId}`, {
            type: 'regular',
            availabilityStatus: 'available',
            ...data
        })
        return response.data
    },

    /**
     * Create time-off request (self-service)
     * Use this method when consultant will NOT be available and needs manager approval
     */
    requestTimeOff: async (consultantId: string, data: {
        period: {
            startDate: string
            endDate: string
            allDay?: boolean
        }
        timeOff: {
            reason: string
            description?: string
        }
    }): Promise<AvailabilityRecord> => {
        const response = await api.post(`/consultants/consultant-availability/${consultantId}/time-off`, data)
        return response.data
    },

    /**
     * Check for conflicts with existing availability (self-service)
     */
    checkAvailabilityConflicts: async (consultantId: string, params: { startDate: string; endDate: string }): Promise<any> => {
        const response = await api.get(`/consultants/consultant-availability/consultant/${consultantId}/conflicts`, { params })
        return response.data
    },

    /**
     * Get time-off balance for consultant (self-service)
     */
    getTimeOffBalance: async (consultantId: string): Promise<any> => {
        const response = await api.get(`/consultants/consultant-availability/consultant/${consultantId}/time-off-balance`)
        return response.data
    },

    /**
     * Update availability record (self-service - generic)
     * Can be used for both availability slots and time-off requests
     */
    updateAvailabilityRecord: async (availabilityId: string, data: Partial<AvailabilityRecord>): Promise<AvailabilityRecord> => {
        const response = await api.put(`/consultants/consultant-availability/${availabilityId}`, data)
        return response.data
    },

    /**
     * Update availability slot (self-service)
     * Convenience wrapper for updating availability windows specifically
     */
    updateAvailabilitySlot: async (availabilityId: string, data: Partial<AvailabilityRecord>): Promise<AvailabilityRecord> => {
        const response = await api.put(`/consultants/consultant-availability/${availabilityId}`, data)
        return response.data
    },

    /**
     * Delete availability record (self-service)
     */
    deleteAvailabilityRecord: async (availabilityId: string): Promise<void> => {
        await api.delete(`/consultants/consultant-availability/${availabilityId}`)
    },

    /**
     * Cancel time-off request (self-service)
     */
    cancelTimeOff: async (availabilityId: string): Promise<AvailabilityRecord> => {
        const response = await api.post(`/consultants/consultant-availability/${availabilityId}/cancel`)
        return response.data
    },

    // ============================================================================
    // ASSIGNMENT MANAGEMENT (consultant-assignment-routes.js)
    // These operations work with the dedicated ConsultantAssignment collection
    // ============================================================================

    /**
     * Get current user's assignments (self-service)
     */
    getMyAssignments: async (params?: any): Promise<PaginatedResponse<Assignment>> => {
        const response = await api.get('/consultants/consultant-assignments/me', { params })
        return response.data.data
    },

    /**
     * Get consultant's assignments (peer view)
     */
    getConsultantAssignments: async (consultantId: string, params?: any): Promise<PaginatedResponse<Assignment>> => {
        const response = await api.get(`/consultants/consultant-assignments/consultant/${consultantId}`, { params })
        return response.data
    },

    /**
     * Get current allocation for a consultant (peer view)
     */
    getConsultantAllocation: async (consultantId: string): Promise<any> => {
        const response = await api.get(`/consultants/consultant-assignments/consultant/${consultantId}/allocation`)
        return response.data
    },

    /**
     * Get project assignments (peer view)
     */
    getProjectAssignments: async (projectId: string, params?: any): Promise<PaginatedResponse<Assignment>> => {
        const response = await api.get(`/consultants/consultant-assignments/project/${projectId}`, { params })
        return response.data
    },

    /**
     * Get client assignments (peer view)
     */
    getClientAssignments: async (clientId: string, params?: any): Promise<PaginatedResponse<Assignment>> => {
        const response = await api.get(`/consultants/consultant-assignments/client/${clientId}`, { params })
        return response.data
    },

    /**
     * Get assignment by ID (peer view)
     */
    getAssignmentById: async (assignmentId: string): Promise<Assignment> => {
        const response = await api.get(`/consultants/consultant-assignments/${assignmentId}`)
        return response.data
    },

    /**
     * Log time to assignment (self-service)
     */
    logTime: async (assignmentId: string, timeLog: TimeLogEntry): Promise<any> => {
        const response = await api.post(`/consultants/consultant-assignments/${assignmentId}/time-log`, timeLog)
        return response.data
    },

    // ============================================================================
    // NEW: DASHBOARD ANALYTICS (Real-time with Caching)
    // ============================================================================

    /**
     * Get comprehensive dashboard data with caching
     * Returns cached data if available, otherwise computes from database
     */
    getDashboard: async (consultantId?: string): Promise<DashboardData> => {
        const endpoint = consultantId 
            ? `/consultant-dashboard/${consultantId}`
            : '/consultant-dashboard/me'
        
        const response = await api.get(endpoint)
        return response.data
    },

    /**
     * Get dashboard stats only (lightweight)
     */
    getDashboardStats: async (consultantId?: string): Promise<DashboardData['stats']> => {
        const endpoint = consultantId 
            ? `/consultant-dashboard/${consultantId}/stats`
            : '/consultant-dashboard/me/stats'
        
        const response = await api.get(endpoint)
        return response.data
    },

    /**
     * Force refresh dashboard cache
     * Invalidates cache and regenerates dashboard data
     */
    refreshDashboard: async (consultantId?: string): Promise<DashboardRefreshResult> => {
        const endpoint = consultantId 
            ? `/consultant-dashboard/${consultantId}/refresh`
            : '/consultant-dashboard/me/refresh'
        
        const response = await api.post(endpoint)
        return response.data
    },

    /**
     * Check dashboard cache status
     */
    getCacheStatus: async (consultantId?: string): Promise<CacheStatus> => {
        const endpoint = consultantId 
            ? `/consultant-dashboard/${consultantId}/cache-status`
            : '/consultant-dashboard/me/cache-status'
        
        const response = await api.get(endpoint)
        return response.data
    },

    /**
     * Get performance metrics
     */
    getPerformanceMetrics: async (consultantId?: string): Promise<DashboardData['performanceMetrics']> => {
        const endpoint = consultantId 
            ? `/consultant-dashboard/${consultantId}/performance`
            : '/consultant-dashboard/me/performance'
        
        const response = await api.get(endpoint)
        return response.data
    },

    /**
     * Get revenue analytics
     */
    getRevenueAnalytics: async (consultantId?: string): Promise<DashboardData['revenueAnalytics']> => {
        const endpoint = consultantId 
            ? `/consultant-dashboard/${consultantId}/revenue`
            : '/consultant-dashboard/me/revenue'
        
        const response = await api.get(endpoint)
        return response.data
    },

    // ============================================================================
    // NEW: EVENT TESTING & MONITORING (Development/Testing)
    // ============================================================================

    /**
     * Trigger test event (for testing analytics event system)
     * This simulates various events to test the real-time dashboard updates
     */
    triggerTestEvent: async (eventType: string, data?: any): Promise<{ success: boolean; message: string }> => {
        const response = await api.post('/test/analytics-events', {
            eventType,
            data
        })
        return response.data
    },

    /**
     * Get recent analytics events (for debugging)
     */
    getRecentEvents: async (limit = 20): Promise<Array<any>> => {
        const response = await api.get('/test/analytics-events/recent', {
            params: { limit }
        })
        return response.data
    },

    /**
     * Get Redis statistics (for monitoring)
     */
    getRedisStats: async (): Promise<any> => {
        const response = await api.get('/test/redis/stats')
        return response.data
    },
}

export default consultantApi