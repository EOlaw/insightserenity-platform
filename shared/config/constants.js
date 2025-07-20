'use strict';

/**
 * @fileoverview Application-wide constants and enumerations
 * @module shared/config/constants
 */

// User roles hierarchy
const USER_ROLES = Object.freeze({
  SUPER_ADMIN: 'super_admin',
  PLATFORM_ADMIN: 'platform_admin',
  ORGANIZATION_OWNER: 'organization_owner',
  ORGANIZATION_ADMIN: 'organization_admin',
  TENANT_ADMIN: 'tenant_admin',
  MANAGER: 'manager',
  CONSULTANT: 'consultant',
  RECRUITER: 'recruiter',
  CLIENT: 'client',
  CANDIDATE: 'candidate',
  PARTNER: 'partner',
  USER: 'user',
  GUEST: 'guest'
});

// Role hierarchy for permission inheritance
const ROLE_HIERARCHY = Object.freeze({
  [USER_ROLES.SUPER_ADMIN]: 100,
  [USER_ROLES.PLATFORM_ADMIN]: 90,
  [USER_ROLES.ORGANIZATION_OWNER]: 80,
  [USER_ROLES.ORGANIZATION_ADMIN]: 70,
  [USER_ROLES.TENANT_ADMIN]: 60,
  [USER_ROLES.MANAGER]: 50,
  [USER_ROLES.CONSULTANT]: 40,
  [USER_ROLES.RECRUITER]: 40,
  [USER_ROLES.CLIENT]: 30,
  [USER_ROLES.CANDIDATE]: 20,
  [USER_ROLES.PARTNER]: 20,
  [USER_ROLES.USER]: 10,
  [USER_ROLES.GUEST]: 0
});

// System permissions
const PERMISSIONS = Object.freeze({
  // Platform management
  PLATFORM_MANAGE: 'platform:manage',
  PLATFORM_VIEW_ANALYTICS: 'platform:view_analytics',
  PLATFORM_MANAGE_SETTINGS: 'platform:manage_settings',
  PLATFORM_MANAGE_SECURITY: 'platform:manage_security',
  
  // Organization management
  ORGANIZATION_CREATE: 'organization:create',
  ORGANIZATION_VIEW: 'organization:view',
  ORGANIZATION_UPDATE: 'organization:update',
  ORGANIZATION_DELETE: 'organization:delete',
  ORGANIZATION_MANAGE_MEMBERS: 'organization:manage_members',
  ORGANIZATION_MANAGE_BILLING: 'organization:manage_billing',
  
  // Tenant management
  TENANT_CREATE: 'tenant:create',
  TENANT_VIEW: 'tenant:view',
  TENANT_UPDATE: 'tenant:update',
  TENANT_DELETE: 'tenant:delete',
  TENANT_MANAGE_SETTINGS: 'tenant:manage_settings',
  
  // User management
  USER_CREATE: 'user:create',
  USER_VIEW: 'user:view',
  USER_UPDATE: 'user:update',
  USER_DELETE: 'user:delete',
  USER_MANAGE_ROLES: 'user:manage_roles',
  USER_MANAGE_PERMISSIONS: 'user:manage_permissions',
  
  // Client management
  CLIENT_CREATE: 'client:create',
  CLIENT_VIEW: 'client:view',
  CLIENT_UPDATE: 'client:update',
  CLIENT_DELETE: 'client:delete',
  CLIENT_EXPORT: 'client:export',
  
  // Project management
  PROJECT_CREATE: 'project:create',
  PROJECT_VIEW: 'project:view',
  PROJECT_UPDATE: 'project:update',
  PROJECT_DELETE: 'project:delete',
  PROJECT_MANAGE_TEAM: 'project:manage_team',
  
  // Consultant management
  CONSULTANT_CREATE: 'consultant:create',
  CONSULTANT_VIEW: 'consultant:view',
  CONSULTANT_UPDATE: 'consultant:update',
  CONSULTANT_DELETE: 'consultant:delete',
  CONSULTANT_MANAGE_AVAILABILITY: 'consultant:manage_availability',
  
  // Job management
  JOB_CREATE: 'job:create',
  JOB_VIEW: 'job:view',
  JOB_UPDATE: 'job:update',
  JOB_DELETE: 'job:delete',
  JOB_PUBLISH: 'job:publish',
  
  // Candidate management
  CANDIDATE_CREATE: 'candidate:create',
  CANDIDATE_VIEW: 'candidate:view',
  CANDIDATE_UPDATE: 'candidate:update',
  CANDIDATE_DELETE: 'candidate:delete',
  CANDIDATE_EXPORT: 'candidate:export',
  
  // Application management
  APPLICATION_CREATE: 'application:create',
  APPLICATION_VIEW: 'application:view',
  APPLICATION_UPDATE: 'application:update',
  APPLICATION_DELETE: 'application:delete',
  APPLICATION_PROCESS: 'application:process',
  
  // Billing and payments
  BILLING_VIEW: 'billing:view',
  BILLING_MANAGE: 'billing:manage',
  PAYMENT_CREATE: 'payment:create',
  PAYMENT_VIEW: 'payment:view',
  PAYMENT_REFUND: 'payment:refund',
  
  // Reports and analytics
  REPORTS_VIEW: 'reports:view',
  REPORTS_CREATE: 'reports:create',
  REPORTS_EXPORT: 'reports:export',
  ANALYTICS_VIEW: 'analytics:view',
  
  // API access
  API_ACCESS: 'api:access',
  API_MANAGE_KEYS: 'api:manage_keys',
  
  // Audit and security
  AUDIT_VIEW: 'audit:view',
  AUDIT_EXPORT: 'audit:export',
  SECURITY_MANAGE: 'security:manage'
});

// HTTP status codes
const HTTP_STATUS = Object.freeze({
  // Success
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,
  PARTIAL_CONTENT: 206,
  
  // Redirection
  MOVED_PERMANENTLY: 301,
  FOUND: 302,
  NOT_MODIFIED: 304,
  TEMPORARY_REDIRECT: 307,
  PERMANENT_REDIRECT: 308,
  
  // Client errors
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  PAYMENT_REQUIRED: 402,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  NOT_ACCEPTABLE: 406,
  REQUEST_TIMEOUT: 408,
  CONFLICT: 409,
  GONE: 410,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  
  // Server errors
  INTERNAL_SERVER_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504
});

// Error codes
const ERROR_CODES = Object.freeze({
  // Authentication errors (1000-1099)
  AUTH_INVALID_CREDENTIALS: 'AUTH_1001',
  AUTH_TOKEN_EXPIRED: 'AUTH_1002',
  AUTH_TOKEN_INVALID: 'AUTH_1003',
  AUTH_REFRESH_TOKEN_INVALID: 'AUTH_1004',
  AUTH_SESSION_EXPIRED: 'AUTH_1005',
  AUTH_ACCOUNT_LOCKED: 'AUTH_1006',
  AUTH_ACCOUNT_DISABLED: 'AUTH_1007',
  AUTH_EMAIL_NOT_VERIFIED: 'AUTH_1008',
  AUTH_TWO_FACTOR_REQUIRED: 'AUTH_1009',
  AUTH_TWO_FACTOR_INVALID: 'AUTH_1010',
  
  // Authorization errors (1100-1199)
  AUTHZ_PERMISSION_DENIED: 'AUTHZ_1101',
  AUTHZ_ROLE_INSUFFICIENT: 'AUTHZ_1102',
  AUTHZ_RESOURCE_FORBIDDEN: 'AUTHZ_1103',
  AUTHZ_TENANT_MISMATCH: 'AUTHZ_1104',
  AUTHZ_ORGANIZATION_MISMATCH: 'AUTHZ_1105',
  
  // Validation errors (1200-1299)
  VALIDATION_REQUIRED_FIELD: 'VAL_1201',
  VALIDATION_INVALID_FORMAT: 'VAL_1202',
  VALIDATION_INVALID_LENGTH: 'VAL_1203',
  VALIDATION_INVALID_TYPE: 'VAL_1204',
  VALIDATION_INVALID_ENUM: 'VAL_1205',
  VALIDATION_DUPLICATE_VALUE: 'VAL_1206',
  
  // Database errors (1300-1399)
  DB_CONNECTION_ERROR: 'DB_1301',
  DB_QUERY_ERROR: 'DB_1302',
  DB_TRANSACTION_ERROR: 'DB_1303',
  DB_DUPLICATE_KEY: 'DB_1304',
  DB_RECORD_NOT_FOUND: 'DB_1305',
  DB_CONSTRAINT_VIOLATION: 'DB_1306',
  
  // Business logic errors (1400-1499)
  BIZ_SUBSCRIPTION_EXPIRED: 'BIZ_1401',
  BIZ_QUOTA_EXCEEDED: 'BIZ_1402',
  BIZ_PAYMENT_FAILED: 'BIZ_1403',
  BIZ_INVALID_STATE_TRANSITION: 'BIZ_1404',
  BIZ_RESOURCE_LOCKED: 'BIZ_1405',
  BIZ_OPERATION_NOT_ALLOWED: 'BIZ_1406',
  
  // External service errors (1500-1599)
  EXT_SERVICE_UNAVAILABLE: 'EXT_1501',
  EXT_API_ERROR: 'EXT_1502',
  EXT_TIMEOUT: 'EXT_1503',
  EXT_RATE_LIMITED: 'EXT_1504',
  
  // System errors (1600-1699)
  SYS_INTERNAL_ERROR: 'SYS_1601',
  SYS_CONFIGURATION_ERROR: 'SYS_1602',
  SYS_MAINTENANCE_MODE: 'SYS_1603',
  SYS_FEATURE_DISABLED: 'SYS_1604'
});

// Event types
const EVENT_TYPES = Object.freeze({
  // User events
  USER_CREATED: 'user.created',
  USER_UPDATED: 'user.updated',
  USER_DELETED: 'user.deleted',
  USER_LOGIN: 'user.login',
  USER_LOGOUT: 'user.logout',
  USER_PASSWORD_CHANGED: 'user.password_changed',
  USER_EMAIL_VERIFIED: 'user.email_verified',
  USER_LOCKED: 'user.locked',
  USER_UNLOCKED: 'user.unlocked',
  
  // Organization events
  ORGANIZATION_CREATED: 'organization.created',
  ORGANIZATION_UPDATED: 'organization.updated',
  ORGANIZATION_DELETED: 'organization.deleted',
  ORGANIZATION_MEMBER_ADDED: 'organization.member_added',
  ORGANIZATION_MEMBER_REMOVED: 'organization.member_removed',
  
  // Tenant events
  TENANT_CREATED: 'tenant.created',
  TENANT_UPDATED: 'tenant.updated',
  TENANT_DELETED: 'tenant.deleted',
  TENANT_ACTIVATED: 'tenant.activated',
  TENANT_DEACTIVATED: 'tenant.deactivated',
  
  // Subscription events
  SUBSCRIPTION_CREATED: 'subscription.created',
  SUBSCRIPTION_UPDATED: 'subscription.updated',
  SUBSCRIPTION_CANCELLED: 'subscription.cancelled',
  SUBSCRIPTION_EXPIRED: 'subscription.expired',
  SUBSCRIPTION_RENEWED: 'subscription.renewed',
  
  // Payment events
  PAYMENT_SUCCEEDED: 'payment.succeeded',
  PAYMENT_FAILED: 'payment.failed',
  PAYMENT_REFUNDED: 'payment.refunded',
  PAYMENT_DISPUTED: 'payment.disputed',
  
  // Security events
  SECURITY_BREACH_DETECTED: 'security.breach_detected',
  SECURITY_LOGIN_FAILED: 'security.login_failed',
  SECURITY_SUSPICIOUS_ACTIVITY: 'security.suspicious_activity',
  SECURITY_IP_BLOCKED: 'security.ip_blocked'
});

// Entity status
const STATUS = Object.freeze({
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  PENDING: 'pending',
  SUSPENDED: 'suspended',
  DELETED: 'deleted',
  ARCHIVED: 'archived',
  DRAFT: 'draft',
  PUBLISHED: 'published',
  EXPIRED: 'expired',
  LOCKED: 'locked'
});

// Subscription status
const SUBSCRIPTION_STATUS = Object.freeze({
  TRIALING: 'trialing',
  ACTIVE: 'active',
  PAST_DUE: 'past_due',
  CANCELLED: 'cancelled',
  UNPAID: 'unpaid',
  INCOMPLETE: 'incomplete',
  INCOMPLETE_EXPIRED: 'incomplete_expired',
  PAUSED: 'paused'
});

// Payment status
const PAYMENT_STATUS = Object.freeze({
  PENDING: 'pending',
  PROCESSING: 'processing',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  REFUNDED: 'refunded',
  PARTIALLY_REFUNDED: 'partially_refunded',
  DISPUTED: 'disputed',
  REQUIRES_ACTION: 'requires_action',
  REQUIRES_PAYMENT_METHOD: 'requires_payment_method'
});

// Job status
const JOB_STATUS = Object.freeze({
  DRAFT: 'draft',
  PUBLISHED: 'published',
  ACTIVE: 'active',
  PAUSED: 'paused',
  CLOSED: 'closed',
  FILLED: 'filled',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired'
});

// Application status
const APPLICATION_STATUS = Object.freeze({
  SUBMITTED: 'submitted',
  REVIEWING: 'reviewing',
  SHORTLISTED: 'shortlisted',
  INTERVIEW_SCHEDULED: 'interview_scheduled',
  INTERVIEWED: 'interviewed',
  OFFER_EXTENDED: 'offer_extended',
  OFFER_ACCEPTED: 'offer_accepted',
  OFFER_DECLINED: 'offer_declined',
  REJECTED: 'rejected',
  WITHDRAWN: 'withdrawn',
  HIRED: 'hired'
});

// Project status
const PROJECT_STATUS = Object.freeze({
  PLANNING: 'planning',
  IN_PROGRESS: 'in_progress',
  ON_HOLD: 'on_hold',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  ARCHIVED: 'archived'
});

// Time constants
const TIME = Object.freeze({
  SECOND: 1000,
  MINUTE: 60 * 1000,
  HOUR: 60 * 60 * 1000,
  DAY: 24 * 60 * 60 * 1000,
  WEEK: 7 * 24 * 60 * 60 * 1000,
  MONTH: 30 * 24 * 60 * 60 * 1000,
  YEAR: 365 * 24 * 60 * 60 * 1000
});

// Regex patterns
const REGEX_PATTERNS = Object.freeze({
  EMAIL: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
  PASSWORD: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
  PHONE: /^\+?[1-9]\d{1,14}$/,
  URL: /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/,
  SLUG: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  MONGODB_ID: /^[0-9a-fA-F]{24}$/,
  JWT: /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/,
  ISO_DATE: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/,
  ALPHANUMERIC: /^[a-zA-Z0-9]+$/,
  ALPHABETIC: /^[a-zA-Z]+$/,
  NUMERIC: /^\d+$/,
  DECIMAL: /^\d+(\.\d{1,2})?$/,
  HEX_COLOR: /^#?([a-fA-F0-9]{6}|[a-fA-F0-9]{3})$/,
  IP_ADDRESS: /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/,
  MAC_ADDRESS: /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/
});

// Limits and constraints
const LIMITS = Object.freeze({
  // Pagination
  MIN_PAGE_SIZE: 1,
  MAX_PAGE_SIZE: 100,
  DEFAULT_PAGE_SIZE: 20,
  
  // String lengths
  MIN_USERNAME_LENGTH: 3,
  MAX_USERNAME_LENGTH: 30,
  MIN_PASSWORD_LENGTH: 8,
  MAX_PASSWORD_LENGTH: 128,
  MAX_EMAIL_LENGTH: 254,
  MAX_NAME_LENGTH: 100,
  MAX_DESCRIPTION_LENGTH: 500,
  MAX_TEXT_LENGTH: 5000,
  MAX_URL_LENGTH: 2048,
  
  // File sizes (in bytes)
  MAX_AVATAR_SIZE: 5 * 1024 * 1024, // 5MB
  MAX_DOCUMENT_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_IMAGE_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
  
  // Quantities
  MAX_LOGIN_ATTEMPTS: 5,
  MAX_API_KEYS_PER_USER: 5,
  MAX_SESSIONS_PER_USER: 10,
  MAX_ORGANIZATIONS_PER_USER: 10,
  MAX_TENANTS_PER_ORGANIZATION: 10,
  MAX_USERS_PER_TENANT: 1000,
  MAX_PROJECTS_PER_TENANT: 500,
  MAX_JOBS_PER_TENANT: 200,
  
  // Time limits (in milliseconds)
  SESSION_TIMEOUT: 24 * 60 * 60 * 1000, // 24 hours
  VERIFICATION_TOKEN_EXPIRY: 24 * 60 * 60 * 1000, // 24 hours
  PASSWORD_RESET_TOKEN_EXPIRY: 60 * 60 * 1000, // 1 hour
  API_KEY_EXPIRY: 365 * 24 * 60 * 60 * 1000, // 1 year
  
  // Rate limits
  RATE_LIMIT_WINDOW: 15 * 60 * 1000, // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: 100,
  LOGIN_RATE_LIMIT_MAX: 5,
  API_RATE_LIMIT_MAX: 60
});

// Default values
const DEFAULTS = Object.freeze({
  LANGUAGE: 'en',
  TIMEZONE: 'UTC',
  DATE_FORMAT: 'YYYY-MM-DD',
  TIME_FORMAT: 'HH:mm:ss',
  DATETIME_FORMAT: 'YYYY-MM-DD HH:mm:ss',
  CURRENCY: 'USD',
  COUNTRY: 'US',
  PAGE_SIZE: 20,
  SORT_ORDER: 'asc',
  THEME: 'light'
});

// Supported languages
const LANGUAGES = Object.freeze({
  EN: { code: 'en', name: 'English', native: 'English' },
  ES: { code: 'es', name: 'Spanish', native: 'Español' },
  FR: { code: 'fr', name: 'French', native: 'Français' },
  DE: { code: 'de', name: 'German', native: 'Deutsch' },
  IT: { code: 'it', name: 'Italian', native: 'Italiano' },
  PT: { code: 'pt', name: 'Portuguese', native: 'Português' },
  RU: { code: 'ru', name: 'Russian', native: 'Русский' },
  ZH: { code: 'zh', name: 'Chinese', native: '中文' },
  JA: { code: 'ja', name: 'Japanese', native: '日本語' },
  KO: { code: 'ko', name: 'Korean', native: '한국어' }
});

// Supported currencies
const CURRENCIES = Object.freeze({
  USD: { code: 'USD', symbol: '$', name: 'US Dollar' },
  EUR: { code: 'EUR', symbol: '€', name: 'Euro' },
  GBP: { code: 'GBP', symbol: '£', name: 'British Pound' },
  CAD: { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
  AUD: { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  JPY: { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
  CNY: { code: 'CNY', symbol: '¥', name: 'Chinese Yuan' },
  INR: { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
  CHF: { code: 'CHF', symbol: 'Fr', name: 'Swiss Franc' },
  SGD: { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar' }
});

// Export all constants
module.exports = Object.freeze({
  USER_ROLES,
  ROLE_HIERARCHY,
  PERMISSIONS,
  HTTP_STATUS,
  ERROR_CODES,
  EVENT_TYPES,
  STATUS,
  SUBSCRIPTION_STATUS,
  PAYMENT_STATUS,
  JOB_STATUS,
  APPLICATION_STATUS,
  PROJECT_STATUS,
  TIME,
  REGEX_PATTERNS,
  LIMITS,
  DEFAULTS,
  LANGUAGES,
  CURRENCIES
});