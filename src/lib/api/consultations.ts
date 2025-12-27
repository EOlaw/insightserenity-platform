/**
 * Consultation API Service
 * Handles all consultation-related API calls
 */

import { api } from '@/shared/lib/api/client'

export interface ConsultationPackage {
  _id: string
  packageId: string
  tenantId: string
  details: {
    name: string
    type: 'free_trial' | 'pay_per_use' | 'consultation_bundle'
    sku: string
    category: string
    description: string
    features: string[]
  }
  credits: {
    total: number
    duration: {
      minutes: number
    }
    expiresAfterDays: number
  }
  pricing: {
    amount: number
    currency: string
    discount?: {
      percentage: number
      reason?: string
    }
  }
  availability: {
    status: 'active' | 'inactive'
    featuredPackage: boolean
    displayOrder: number
  }
}

export interface CreditBalance {
  availableCredits: number
  freeTrial: {
    eligible: boolean
    used: boolean
  }
  credits: Array<{
    packageName: string
    creditsRemaining: number
    expiryDate: string
  }>
  lifetime: {
    totalConsultations: number
    totalSpent: number
    totalCreditsPurchased: number
    totalCreditsUsed: number
  }
}

export interface Consultation {
  _id: string
  consultationId: string
  consultationCode: string
  consultantId: string
  clientId: string
  details: {
    title: string
    description?: string
    type: string
  }
  schedule: {
    scheduledStart: string
    scheduledEnd: string
    timezone: string
  }
  status: {
    current: 'scheduled' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled'
    isActive: boolean
  }
  packageInfo?: {
    packageId: string
    packageName: string
    isFreeConsultation: boolean
  }
}

export interface ConsultationMetrics {
  totalConsultations: number
  completedConsultations: number
  cancelledConsultations: number
  completionRate: number
  totalHours: number
  averageRating: number
  uniqueClients: number
  totalRevenue: number
  averageSatisfaction: number
  objectivesMetAverage: number
}

export interface BookingData {
  packageId: string
  consultantId: string
  scheduledStart: string
  scheduledEnd: string
  title?: string
  description?: string
  type?: string
  timezone?: string
}

export const consultationsApi = {
  /**
   * Get all available consultation packages
   */
  getPackages: async (): Promise<ConsultationPackage[]> => {
    const response = await api.get<{ success: boolean; data: ConsultationPackage[] }>('/billing/packages')
    return response.data
  },

  /**
   * Get client's credit balance
   */
  getCreditBalance: async (): Promise<CreditBalance> => {
    const response = await api.get<{ success: boolean; data: CreditBalance }>('/billing/credits/balance')
    return response.data
  },

  /**
   * Book consultation with package (Option B - awards credits automatically)
   */
  bookConsultationWithPackage: async (bookingData: BookingData): Promise<Consultation> => {
    const response = await api.post<{ success: boolean; data: Consultation }>(
      '/consultations/book-with-package',
      bookingData
    )
    return response.data
  },

  /**
   * Get my consultations (works for both clients and consultants)
   */
  getMyConsultations: async (filters?: {
    status?: string
    upcoming?: boolean
    past?: boolean
    page?: number
    limit?: number
  }): Promise<Consultation[]> => {
    const queryParams = new URLSearchParams()
    if (filters?.status) queryParams.append('status', filters.status)
    if (filters?.upcoming) queryParams.append('upcoming', 'true')
    if (filters?.past) queryParams.append('past', 'true')
    if (filters?.page) queryParams.append('page', filters.page.toString())
    if (filters?.limit) queryParams.append('limit', filters.limit.toString())

    const query = queryParams.toString()
    const url = `/consultations/me${query ? `?${query}` : ''}`

    const response = await api.get<{ success: boolean; data: Consultation[] }>(url)
    return response.data
  },

  /**
   * Get consultation by ID
   */
  getConsultationById: async (consultationId: string): Promise<Consultation> => {
    const response = await api.get<{ success: boolean; data: Consultation }>(
      `/consultations/${consultationId}`
    )
    return response.data
  },

  /**
   * Cancel consultation
   */
  cancelConsultation: async (consultationId: string, reason: string): Promise<void> => {
    await api.post(`/consultations/${consultationId}/cancel`, { reason })
  },

  /**
   * Reschedule consultation
   */
  rescheduleConsultation: async (
    consultationId: string,
    newStart: string,
    newEnd: string,
    reason: string
  ): Promise<Consultation> => {
    const response = await api.post<{ success: boolean; data: Consultation }>(
      `/consultations/${consultationId}/reschedule`,
      {
        newStart,
        newEnd,
        reason,
      }
    )
    return response.data
  },

  /**
   * Start consultation
   */
  startConsultation: async (consultationId: string): Promise<Consultation> => {
    const response = await api.post<{ success: boolean; data: Consultation }>(
      `/consultations/${consultationId}/start`
    )
    return response.data
  },

  /**
   * Complete consultation
   */
  completeConsultation: async (
    consultationId: string,
    outcomeData?: {
      summary?: string
      overallStatus?: string
      keyAchievements?: string[]
    }
  ): Promise<Consultation> => {
    const response = await api.post<{ success: boolean; data: Consultation }>(
      `/consultations/${consultationId}/complete`,
      outcomeData
    )
    return response.data
  },

  /**
   * Add note to consultation
   */
  addNote: async (
    consultationId: string,
    noteData: {
      content: string
      type?: 'general' | 'technical' | 'action' | 'decision' | 'private'
      visibility?: 'public' | 'internal' | 'private'
    }
  ): Promise<Consultation> => {
    const response = await api.post<{ success: boolean; data: Consultation }>(
      `/consultations/${consultationId}/notes`,
      noteData
    )
    return response.data
  },

  /**
   * Mark client attendance
   */
  markAttendance: async (
    consultationId: string,
    userId: string,
    attended: boolean
  ): Promise<Consultation> => {
    const response = await api.post<{ success: boolean; data: Consultation }>(
      `/consultations/${consultationId}/attendance`,
      { userId, attended }
    )
    return response.data
  },

  /**
   * Submit consultant feedback
   */
  submitConsultantFeedback: async (
    consultationId: string,
    feedbackData: {
      feedback: string
      rating?: number
      strengths?: string[]
      areasForImprovement?: string[]
      wouldRecommend?: boolean
    }
  ): Promise<Consultation> => {
    const response = await api.post<{ success: boolean; data: Consultation }>(
      `/consultations/${consultationId}/feedback/consultant`,
      feedbackData
    )
    return response.data
  },

  /**
   * Get consultation metrics
   */
  getMetrics: async (filters?: {
    consultantId?: string
    startDate?: string
    endDate?: string
  }): Promise<ConsultationMetrics> => {
    const queryParams = new URLSearchParams()
    if (filters?.consultantId) queryParams.append('consultantId', filters.consultantId)
    if (filters?.startDate) queryParams.append('startDate', filters.startDate)
    if (filters?.endDate) queryParams.append('endDate', filters.endDate)

    const query = queryParams.toString()
    const url = `/consultations/metrics${query ? `?${query}` : ''}`

    const response = await api.get<{ success: boolean; data: ConsultationMetrics }>(url)
    return response.data
  },

  /**
   * Get upcoming consultations
   */
  getUpcomingConsultations: async (filters?: {
    consultantId?: string
    days?: number
  }): Promise<Consultation[]> => {
    const queryParams = new URLSearchParams()
    if (filters?.consultantId) queryParams.append('consultantId', filters.consultantId)
    if (filters?.days) queryParams.append('days', filters.days.toString())

    const query = queryParams.toString()
    const url = `/consultations/upcoming${query ? `?${query}` : ''}`

    const response = await api.get<{ success: boolean; data: Consultation[] }>(url)
    return response.data
  },

  /**
   * Create payment intent for package purchase
   */
  createPaymentIntent: async (packageId: string, amount: number): Promise<{
    paymentIntentId: string
    clientSecret: string
    transactionId: string
  }> => {
    const response = await api.post<{
      success: boolean
      data: {
        paymentIntentId: string
        clientSecret: string
        transactionId: string
      }
    }>('/billing/payments/intent', {
      packageId,
      amount,
      currency: 'USD',
      quantity: 1,
    })
    return response.data
  },
}

export default consultationsApi
