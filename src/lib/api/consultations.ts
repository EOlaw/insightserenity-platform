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
    return response.data.data
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
