'use strict';

/**
 * @fileoverview Fine-grained permission definitions for RBAC
 * @module shared/lib/utils/constants/permissions
 */

/**
 * Permission categories and actions
 * @namespace PERMISSIONS
 */
const PERMISSIONS = Object.freeze({
  // Platform Administration
  PLATFORM: Object.freeze({
    // System management
    SYSTEM_VIEW: 'platform:system:view',
    SYSTEM_MANAGE: 'platform:system:manage',
    SYSTEM_CONFIGURE: 'platform:system:configure',
    SYSTEM_MAINTENANCE: 'platform:system:maintenance',
    
    // Security management
    SECURITY_VIEW: 'platform:security:view',
    SECURITY_MANAGE: 'platform:security:manage',
    SECURITY_AUDIT: 'platform:security:audit',
    SECURITY_CONFIGURE: 'platform:security:configure',
    
    // Analytics and monitoring
    ANALYTICS_VIEW: 'platform:analytics:view',
    ANALYTICS_EXPORT: 'platform:analytics:export',
    MONITORING_VIEW: 'platform:monitoring:view',
    MONITORING_CONFIGURE: 'platform:monitoring:configure',
    
    // Platform settings
    SETTINGS_VIEW: 'platform:settings:view',
    SETTINGS_MANAGE: 'platform:settings:manage',
    FEATURES_TOGGLE: 'platform:features:toggle',
    DEPLOYMENT_MANAGE: 'platform:deployment:manage'
  }),

  // Organization Management
  ORGANIZATION: Object.freeze({
    // Basic operations
    CREATE: 'organization:create',
    VIEW: 'organization:view',
    VIEW_ALL: 'organization:view:all',
    UPDATE: 'organization:update',
    DELETE: 'organization:delete',
    ARCHIVE: 'organization:archive',
    RESTORE: 'organization:restore',
    
    // Member management
    MEMBERS_VIEW: 'organization:members:view',
    MEMBERS_INVITE: 'organization:members:invite',
    MEMBERS_UPDATE: 'organization:members:update',
    MEMBERS_REMOVE: 'organization:members:remove',
    ROLES_MANAGE: 'organization:roles:manage',
    
    // Settings and configuration
    SETTINGS_VIEW: 'organization:settings:view',
    SETTINGS_UPDATE: 'organization:settings:update',
    BRANDING_MANAGE: 'organization:branding:manage',
    INTEGRATIONS_MANAGE: 'organization:integrations:manage',
    
    // Billing and subscription
    BILLING_VIEW: 'organization:billing:view',
    BILLING_MANAGE: 'organization:billing:manage',
    SUBSCRIPTION_VIEW: 'organization:subscription:view',
    SUBSCRIPTION_MANAGE: 'organization:subscription:manage',
    INVOICES_VIEW: 'organization:invoices:view',
    PAYMENT_METHODS_MANAGE: 'organization:payment_methods:manage'
  }),

  // Tenant Management
  TENANT: Object.freeze({
    // Basic operations
    CREATE: 'tenant:create',
    VIEW: 'tenant:view',
    VIEW_ALL: 'tenant:view:all',
    UPDATE: 'tenant:update',
    DELETE: 'tenant:delete',
    SWITCH: 'tenant:switch',
    
    // Configuration
    SETTINGS_VIEW: 'tenant:settings:view',
    SETTINGS_UPDATE: 'tenant:settings:update',
    FEATURES_CONFIGURE: 'tenant:features:configure',
    LIMITS_CONFIGURE: 'tenant:limits:configure',
    
    // Data management
    DATA_EXPORT: 'tenant:data:export',
    DATA_IMPORT: 'tenant:data:import',
    DATA_BACKUP: 'tenant:data:backup',
    DATA_RESTORE: 'tenant:data:restore'
  }),

  // User Management
  USER: Object.freeze({
    // Basic operations
    CREATE: 'user:create',
    VIEW: 'user:view',
    VIEW_ALL: 'user:view:all',
    UPDATE: 'user:update',
    UPDATE_OWN: 'user:update:own',
    DELETE: 'user:delete',
    IMPERSONATE: 'user:impersonate',
    
    // Profile management
    PROFILE_VIEW: 'user:profile:view',
    PROFILE_VIEW_ALL: 'user:profile:view:all',
    PROFILE_UPDATE: 'user:profile:update',
    PROFILE_UPDATE_OWN: 'user:profile:update:own',
    
    // Access management
    PASSWORD_RESET: 'user:password:reset',
    PASSWORD_RESET_OWN: 'user:password:reset:own',
    SESSIONS_VIEW: 'user:sessions:view',
    SESSIONS_MANAGE: 'user:sessions:manage',
    API_KEYS_MANAGE: 'user:api_keys:manage',
    TWO_FACTOR_MANAGE: 'user:two_factor:manage',
    
    // Role and permission management
    ROLES_VIEW: 'user:roles:view',
    ROLES_ASSIGN: 'user:roles:assign',
    PERMISSIONS_VIEW: 'user:permissions:view',
    PERMISSIONS_ASSIGN: 'user:permissions:assign'
  }),

  // Project Management
  PROJECT: Object.freeze({
    // Basic operations
    CREATE: 'project:create',
    VIEW: 'project:view',
    VIEW_ALL: 'project:view:all',
    UPDATE: 'project:update',
    DELETE: 'project:delete',
    ARCHIVE: 'project:archive',
    
    // Team management
    TEAM_VIEW: 'project:team:view',
    TEAM_MANAGE: 'project:team:manage',
    ASSIGNMENTS_VIEW: 'project:assignments:view',
    ASSIGNMENTS_MANAGE: 'project:assignments:manage',
    
    // Project components
    MILESTONES_VIEW: 'project:milestones:view',
    MILESTONES_MANAGE: 'project:milestones:manage',
    TASKS_VIEW: 'project:tasks:view',
    TASKS_CREATE: 'project:tasks:create',
    TASKS_UPDATE: 'project:tasks:update',
    TASKS_DELETE: 'project:tasks:delete',
    
    // Resources and documents
    RESOURCES_VIEW: 'project:resources:view',
    RESOURCES_UPLOAD: 'project:resources:upload',
    RESOURCES_DELETE: 'project:resources:delete',
    DOCUMENTS_VIEW: 'project:documents:view',
    DOCUMENTS_MANAGE: 'project:documents:manage',
    
    // Financial
    BUDGET_VIEW: 'project:budget:view',
    BUDGET_MANAGE: 'project:budget:manage',
    EXPENSES_VIEW: 'project:expenses:view',
    EXPENSES_MANAGE: 'project:expenses:manage'
  }),

  // Client Management
  CLIENT: Object.freeze({
    // Basic operations
    CREATE: 'client:create',
    VIEW: 'client:view',
    VIEW_ALL: 'client:view:all',
    UPDATE: 'client:update',
    DELETE: 'client:delete',
    
    // Contact management
    CONTACTS_VIEW: 'client:contacts:view',
    CONTACTS_MANAGE: 'client:contacts:manage',
    COMMUNICATIONS_VIEW: 'client:communications:view',
    COMMUNICATIONS_SEND: 'client:communications:send',
    
    // Documents and contracts
    DOCUMENTS_VIEW: 'client:documents:view',
    DOCUMENTS_UPLOAD: 'client:documents:upload',
    CONTRACTS_VIEW: 'client:contracts:view',
    CONTRACTS_MANAGE: 'client:contracts:manage',
    
    // Analytics
    ANALYTICS_VIEW: 'client:analytics:view',
    REPORTS_GENERATE: 'client:reports:generate'
  }),

  // Consultant Management
  CONSULTANT: Object.freeze({
    // Basic operations
    CREATE: 'consultant:create',
    VIEW: 'consultant:view',
    VIEW_ALL: 'consultant:view:all',
    UPDATE: 'consultant:update',
    DELETE: 'consultant:delete',
    
    // Profile and skills
    PROFILE_VIEW: 'consultant:profile:view',
    PROFILE_UPDATE: 'consultant:profile:update',
    SKILLS_VIEW: 'consultant:skills:view',
    SKILLS_UPDATE: 'consultant:skills:update',
    CERTIFICATIONS_MANAGE: 'consultant:certifications:manage',
    
    // Availability and scheduling
    AVAILABILITY_VIEW: 'consultant:availability:view',
    AVAILABILITY_UPDATE: 'consultant:availability:update',
    SCHEDULE_VIEW: 'consultant:schedule:view',
    SCHEDULE_MANAGE: 'consultant:schedule:manage',
    
    // Performance
    PERFORMANCE_VIEW: 'consultant:performance:view',
    REVIEWS_VIEW: 'consultant:reviews:view',
    REVIEWS_MANAGE: 'consultant:reviews:manage'
  }),

  // Recruitment Module
  RECRUITMENT: Object.freeze({
    // Job management
    JOBS_CREATE: 'recruitment:jobs:create',
    JOBS_VIEW: 'recruitment:jobs:view',
    JOBS_UPDATE: 'recruitment:jobs:update',
    JOBS_DELETE: 'recruitment:jobs:delete',
    JOBS_PUBLISH: 'recruitment:jobs:publish',
    JOBS_ARCHIVE: 'recruitment:jobs:archive',
    
    // Candidate management
    CANDIDATES_VIEW: 'recruitment:candidates:view',
    CANDIDATES_CREATE: 'recruitment:candidates:create',
    CANDIDATES_UPDATE: 'recruitment:candidates:update',
    CANDIDATES_DELETE: 'recruitment:candidates:delete',
    CANDIDATES_COMMUNICATE: 'recruitment:candidates:communicate',
    
    // Application management
    APPLICATIONS_VIEW: 'recruitment:applications:view',
    APPLICATIONS_PROCESS: 'recruitment:applications:process',
    APPLICATIONS_EVALUATE: 'recruitment:applications:evaluate',
    APPLICATIONS_REJECT: 'recruitment:applications:reject',
    
    // Interview management
    INTERVIEWS_VIEW: 'recruitment:interviews:view',
    INTERVIEWS_SCHEDULE: 'recruitment:interviews:schedule',
    INTERVIEWS_CONDUCT: 'recruitment:interviews:conduct',
    INTERVIEWS_EVALUATE: 'recruitment:interviews:evaluate',
    
    // Offers and hiring
    OFFERS_VIEW: 'recruitment:offers:view',
    OFFERS_CREATE: 'recruitment:offers:create',
    OFFERS_APPROVE: 'recruitment:offers:approve',
    OFFERS_SEND: 'recruitment:offers:send',
    HIRING_COMPLETE: 'recruitment:hiring:complete'
  }),

  // Billing and Finance
  BILLING: Object.freeze({
    // Invoicing
    INVOICES_VIEW: 'billing:invoices:view',
    INVOICES_CREATE: 'billing:invoices:create',
    INVOICES_UPDATE: 'billing:invoices:update',
    INVOICES_DELETE: 'billing:invoices:delete',
    INVOICES_SEND: 'billing:invoices:send',
    
    // Payments
    PAYMENTS_VIEW: 'billing:payments:view',
    PAYMENTS_PROCESS: 'billing:payments:process',
    PAYMENTS_REFUND: 'billing:payments:refund',
    PAYMENT_METHODS_VIEW: 'billing:payment_methods:view',
    PAYMENT_METHODS_MANAGE: 'billing:payment_methods:manage',
    
    // Subscriptions
    SUBSCRIPTIONS_VIEW: 'billing:subscriptions:view',
    SUBSCRIPTIONS_MANAGE: 'billing:subscriptions:manage',
    SUBSCRIPTIONS_CANCEL: 'billing:subscriptions:cancel',
    
    // Financial reports
    REPORTS_VIEW: 'billing:reports:view',
    REPORTS_GENERATE: 'billing:reports:generate',
    REVENUE_VIEW: 'billing:revenue:view',
    EXPENSES_VIEW: 'billing:expenses:view'
  }),

  // Reports and Analytics
  REPORTS: Object.freeze({
    // Dashboard access
    DASHBOARD_VIEW: 'reports:dashboard:view',
    DASHBOARD_CUSTOMIZE: 'reports:dashboard:customize',
    
    // Report generation
    REPORTS_VIEW: 'reports:view',
    REPORTS_CREATE: 'reports:create',
    REPORTS_SCHEDULE: 'reports:schedule',
    REPORTS_EXPORT: 'reports:export',
    
    // Analytics
    ANALYTICS_VIEW: 'reports:analytics:view',
    ANALYTICS_ADVANCED: 'reports:analytics:advanced',
    METRICS_VIEW: 'reports:metrics:view',
    METRICS_CONFIGURE: 'reports:metrics:configure',
    
    // Data export
    DATA_EXPORT: 'reports:data:export',
    DATA_EXPORT_BULK: 'reports:data:export:bulk'
  }),

  // Audit and Compliance
  AUDIT: Object.freeze({
    // Audit logs
    LOGS_VIEW: 'audit:logs:view',
    LOGS_SEARCH: 'audit:logs:search',
    LOGS_EXPORT: 'audit:logs:export',
    
    // Compliance
    COMPLIANCE_VIEW: 'audit:compliance:view',
    COMPLIANCE_REPORTS: 'audit:compliance:reports',
    COMPLIANCE_CONFIGURE: 'audit:compliance:configure',
    
    // Security audit
    SECURITY_AUDIT_VIEW: 'audit:security:view',
    SECURITY_AUDIT_RUN: 'audit:security:run',
    SECURITY_AUDIT_CONFIGURE: 'audit:security:configure'
  })
});

// Define base permission sets first (without self-references)
const BASE_VIEWER_PERMISSIONS = [
  PERMISSIONS.ORGANIZATION.VIEW,
  PERMISSIONS.PROJECT.VIEW,
  PERMISSIONS.CLIENT.VIEW,
  PERMISSIONS.USER.PROFILE_VIEW_OWN,
  PERMISSIONS.REPORTS.DASHBOARD_VIEW
];

const BASE_USER_PERMISSIONS = [
  PERMISSIONS.USER.UPDATE_OWN,
  PERMISSIONS.USER.PROFILE_UPDATE_OWN,
  PERMISSIONS.USER.PASSWORD_RESET_OWN,
  PERMISSIONS.PROJECT.TASKS_VIEW,
  PERMISSIONS.CLIENT.DOCUMENTS_VIEW
];

const BASE_MANAGER_PERMISSIONS = [
  PERMISSIONS.PROJECT.CREATE,
  PERMISSIONS.PROJECT.UPDATE,
  PERMISSIONS.PROJECT.TEAM_MANAGE,
  PERMISSIONS.CLIENT.CREATE,
  PERMISSIONS.CLIENT.UPDATE,
  PERMISSIONS.USER.VIEW_ALL,
  PERMISSIONS.REPORTS.REPORTS_CREATE
];

const BASE_ADMIN_PERMISSIONS = [
  PERMISSIONS.ORGANIZATION.UPDATE,
  PERMISSIONS.ORGANIZATION.MEMBERS_MANAGE,
  PERMISSIONS.USER.CREATE,
  PERMISSIONS.USER.UPDATE,
  PERMISSIONS.USER.ROLES_ASSIGN,
  PERMISSIONS.BILLING.INVOICES_VIEW,
  PERMISSIONS.AUDIT.LOGS_VIEW
];

/**
 * Permission groups for easier management
 * @namespace PERMISSION_GROUPS
 */
const PERMISSION_GROUPS = Object.freeze({
  // Read-only permissions
  VIEWER: BASE_VIEWER_PERMISSIONS,

  // Basic user permissions
  USER: [
    ...BASE_VIEWER_PERMISSIONS,
    ...BASE_USER_PERMISSIONS
  ],

  // Manager permissions
  MANAGER: [
    ...BASE_VIEWER_PERMISSIONS,
    ...BASE_USER_PERMISSIONS,
    ...BASE_MANAGER_PERMISSIONS
  ],

  // Admin permissions
  ADMIN: [
    ...BASE_VIEWER_PERMISSIONS,
    ...BASE_USER_PERMISSIONS,
    ...BASE_MANAGER_PERMISSIONS,
    ...BASE_ADMIN_PERMISSIONS
  ],

  // Super admin permissions (platform level)
  SUPER_ADMIN: Object.values(PERMISSIONS).reduce((acc, category) => {
    return [...acc, ...Object.values(category)];
  }, [])
});

/**
 * Check if a permission exists
 * @param {string} permission - Permission to check
 * @returns {boolean} True if permission exists
 */
const isValidPermission = (permission) => {
  return Object.values(PERMISSIONS).some(category =>
    Object.values(category).includes(permission)
  );
};

/**
 * Get permission category
 * @param {string} permission - Permission string
 * @returns {string|null} Category name or null
 */
const getPermissionCategory = (permission) => {
  for (const [category, perms] of Object.entries(PERMISSIONS)) {
    if (Object.values(perms).includes(permission)) {
      return category;
    }
  }
  return null;
};

/**
 * Check if permission allows action
 * @param {string[]} userPermissions - User's permissions
 * @param {string} requiredPermission - Required permission
 * @returns {boolean} True if allowed
 */
const hasPermission = (userPermissions, requiredPermission) => {
  return userPermissions.includes(requiredPermission);
};

/**
 * Check if user has any of the required permissions
 * @param {string[]} userPermissions - User's permissions
 * @param {string[]} requiredPermissions - Array of required permissions
 * @returns {boolean} True if user has any permission
 */
const hasAnyPermission = (userPermissions, requiredPermissions) => {
  return requiredPermissions.some(permission =>
    userPermissions.includes(permission)
  );
};

/**
 * Check if user has all required permissions
 * @param {string[]} userPermissions - User's permissions
 * @param {string[]} requiredPermissions - Array of required permissions
 * @returns {boolean} True if user has all permissions
 */
const hasAllPermissions = (userPermissions, requiredPermissions) => {
  return requiredPermissions.every(permission =>
    userPermissions.includes(permission)
  );
};

/**
 * Get permissions for a role
 * @param {string} role - Role name
 * @returns {string[]} Array of permissions
 */
const getPermissionsForRole = (role) => {
  return PERMISSION_GROUPS[role] || [];
};

// Export permissions and utilities
module.exports = Object.freeze({
  PERMISSIONS,
  PERMISSION_GROUPS,
  
  // Utility functions
  isValidPermission,
  getPermissionCategory,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  getPermissionsForRole
});