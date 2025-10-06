// Common Types
export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
  meta?: {
    page?: number
    limit?: number
    total?: number
    totalPages?: number
  }
}

export interface PaginationParams {
  page: number
  limit: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export interface SearchParams extends PaginationParams {
  search?: string
  filters?: Record<string, any>
}

// User & Auth Types
export interface User {
  id: string
  email: string
  firstName: string
  lastName: string
  fullName: string
  avatar?: string
  role: UserRole
  status: UserStatus
  emailVerified: boolean
  phoneNumber?: string
  department?: string
  position?: string
  permissions: Permission[]
  organizations: Organization[]
  currentOrganization?: Organization
  preferences: UserPreferences
  createdAt: string
  updatedAt: string
  lastLoginAt?: string
}

export interface UserRole {
  id: string
  name: string
  displayName: string
  description?: string
  level: number
  permissions: Permission[]
}

export type UserStatus = 'active' | 'inactive' | 'suspended' | 'pending'

export interface Permission {
  id: string
  resource: string
  action: string
  scope?: string
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system'
  language: string
  timezone: string
  notifications: NotificationPreferences
  dashboardLayout?: string
}

export interface NotificationPreferences {
  email: boolean
  push: boolean
  sms: boolean
  inApp: boolean
  digest: 'realtime' | 'daily' | 'weekly' | 'never'
}

// Organization & Tenant Types
export interface Organization {
  id: string
  name: string
  slug: string
  logo?: string
  description?: string
  industry?: string
  size?: string
  website?: string
  email: string
  phone?: string
  address?: Address
  status: 'active' | 'inactive' | 'suspended' | 'trial'
  subscription: Subscription
  settings: OrganizationSettings
  features: string[]
  limits: ResourceLimits
  createdAt: string
  updatedAt: string
}

export interface Tenant {
  id: string
  organizationId: string
  name: string
  subdomain: string
  customDomain?: string
  database: string
  storage: StorageInfo
  status: 'active' | 'inactive' | 'maintenance'
  config: TenantConfig
  createdAt: string
  updatedAt: string
}

export interface OrganizationSettings {
  branding: BrandingSettings
  security: SecuritySettings
  billing: BillingSettings
  integrations: IntegrationSettings[]
}

export interface BrandingSettings {
  primaryColor: string
  logo?: string
  favicon?: string
  emailTemplate?: string
}

export interface SecuritySettings {
  mfaRequired: boolean
  passwordPolicy: PasswordPolicy
  sessionTimeout: number
  ipWhitelist?: string[]
  ssoEnabled: boolean
  ssoProvider?: string
}

export interface PasswordPolicy {
  minLength: number
  requireUppercase: boolean
  requireLowercase: boolean
  requireNumbers: boolean
  requireSpecialChars: boolean
  expiryDays?: number
}

export interface Address {
  street?: string
  city?: string
  state?: string
  country: string
  postalCode?: string
}

// Subscription & Billing Types
export interface Subscription {
  id: string
  planId: string
  plan: SubscriptionPlan
  status: 'active' | 'cancelled' | 'expired' | 'trial' | 'past_due'
  currentPeriodStart: string
  currentPeriodEnd: string
  cancelAtPeriodEnd: boolean
  trialEnd?: string
  seats: number
  usage: UsageMetrics
}

export interface SubscriptionPlan {
  id: string
  name: string
  displayName: string
  description: string
  price: number
  currency: string
  interval: 'monthly' | 'yearly'
  features: PlanFeature[]
  limits: ResourceLimits
}

export interface PlanFeature {
  id: string
  name: string
  description?: string
  included: boolean
  limit?: number
}

export interface ResourceLimits {
  users: number
  projects: number
  storage: number // in GB
  apiCalls: number
  customDomains: number
}

export interface UsageMetrics {
  users: number
  projects: number
  storage: number
  apiCalls: number
  bandwidth: number
}

export interface StorageInfo {
  used: number
  total: number
  unit: 'GB' | 'TB'
}

export interface TenantConfig {
  modules: string[]
  features: Record<string, boolean>
  customizations: Record<string, any>
}

export interface BillingSettings {
  currency: string
  taxRate: number
  paymentMethods: PaymentMethod[]
  invoiceSettings: InvoiceSettings
}

export interface PaymentMethod {
  id: string
  type: 'card' | 'bank' | 'paypal'
  isDefault: boolean
  details: Record<string, any>
}

export interface InvoiceSettings {
  companyName: string
  taxId?: string
  address: Address
  emailRecipients: string[]
}

export interface IntegrationSettings {
  id: string
  provider: string
  enabled: boolean
  config: Record<string, any>
}

// Session & Auth Token Types
export interface Session {
  user: User
  accessToken: string
  refreshToken: string
  expiresAt: string
}

export interface AuthTokens {
  accessToken: string
  refreshToken: string
  idToken?: string
}
