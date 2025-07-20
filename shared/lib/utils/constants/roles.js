'use strict';

/**
 * @fileoverview Role definitions and hierarchies for RBAC
 * @module shared/lib/utils/constants/roles
 */

const { PERMISSIONS } = require('./permissions');

/**
 * System role definitions
 * @namespace ROLES
 */
const ROLES = Object.freeze({
  // Platform-level roles
  SUPER_ADMIN: 'super_admin',
  PLATFORM_ADMIN: 'platform_admin',
  PLATFORM_SUPPORT: 'platform_support',
  
  // Organization-level roles
  ORGANIZATION_OWNER: 'organization_owner',
  ORGANIZATION_ADMIN: 'organization_admin',
  ORGANIZATION_MANAGER: 'organization_manager',
  
  // Tenant-level roles
  TENANT_ADMIN: 'tenant_admin',
  TENANT_MANAGER: 'tenant_manager',
  
  // Business roles
  PROJECT_MANAGER: 'project_manager',
  TEAM_LEAD: 'team_lead',
  CONSULTANT: 'consultant',
  SENIOR_CONSULTANT: 'senior_consultant',
  
  // Recruitment roles
  RECRUITER: 'recruiter',
  SENIOR_RECRUITER: 'senior_recruiter',
  HIRING_MANAGER: 'hiring_manager',
  
  // Client roles
  CLIENT: 'client',
  CLIENT_ADMIN: 'client_admin',
  
  // Partner roles
  PARTNER: 'partner',
  PARTNER_ADMIN: 'partner_admin',
  
  // Candidate role
  CANDIDATE: 'candidate',
  
  // Basic roles
  USER: 'user',
  GUEST: 'guest'
});

/**
 * Role hierarchy levels (higher number = more authority)
 * @namespace ROLE_HIERARCHY
 */
const ROLE_HIERARCHY = Object.freeze({
  [ROLES.SUPER_ADMIN]: 100,
  [ROLES.PLATFORM_ADMIN]: 95,
  [ROLES.PLATFORM_SUPPORT]: 90,
  [ROLES.ORGANIZATION_OWNER]: 85,
  [ROLES.ORGANIZATION_ADMIN]: 80,
  [ROLES.ORGANIZATION_MANAGER]: 75,
  [ROLES.TENANT_ADMIN]: 70,
  [ROLES.TENANT_MANAGER]: 65,
  [ROLES.PROJECT_MANAGER]: 60,
  [ROLES.TEAM_LEAD]: 55,
  [ROLES.SENIOR_CONSULTANT]: 50,
  [ROLES.CONSULTANT]: 45,
  [ROLES.SENIOR_RECRUITER]: 45,
  [ROLES.RECRUITER]: 40,
  [ROLES.HIRING_MANAGER]: 40,
  [ROLES.CLIENT_ADMIN]: 35,
  [ROLES.CLIENT]: 30,
  [ROLES.PARTNER_ADMIN]: 30,
  [ROLES.PARTNER]: 25,
  [ROLES.CANDIDATE]: 20,
  [ROLES.USER]: 10,
  [ROLES.GUEST]: 0
});

/**
 * Role display names
 * @namespace ROLE_DISPLAY_NAMES
 */
const ROLE_DISPLAY_NAMES = Object.freeze({
  [ROLES.SUPER_ADMIN]: 'Super Administrator',
  [ROLES.PLATFORM_ADMIN]: 'Platform Administrator',
  [ROLES.PLATFORM_SUPPORT]: 'Platform Support',
  [ROLES.ORGANIZATION_OWNER]: 'Organization Owner',
  [ROLES.ORGANIZATION_ADMIN]: 'Organization Administrator',
  [ROLES.ORGANIZATION_MANAGER]: 'Organization Manager',
  [ROLES.TENANT_ADMIN]: 'Tenant Administrator',
  [ROLES.TENANT_MANAGER]: 'Tenant Manager',
  [ROLES.PROJECT_MANAGER]: 'Project Manager',
  [ROLES.TEAM_LEAD]: 'Team Lead',
  [ROLES.SENIOR_CONSULTANT]: 'Senior Consultant',
  [ROLES.CONSULTANT]: 'Consultant',
  [ROLES.SENIOR_RECRUITER]: 'Senior Recruiter',
  [ROLES.RECRUITER]: 'Recruiter',
  [ROLES.HIRING_MANAGER]: 'Hiring Manager',
  [ROLES.CLIENT_ADMIN]: 'Client Administrator',
  [ROLES.CLIENT]: 'Client',
  [ROLES.PARTNER_ADMIN]: 'Partner Administrator',
  [ROLES.PARTNER]: 'Partner',
  [ROLES.CANDIDATE]: 'Candidate',
  [ROLES.USER]: 'User',
  [ROLES.GUEST]: 'Guest'
});

/**
 * Role descriptions
 * @namespace ROLE_DESCRIPTIONS
 */
const ROLE_DESCRIPTIONS = Object.freeze({
  [ROLES.SUPER_ADMIN]: 'Full platform access with all permissions',
  [ROLES.PLATFORM_ADMIN]: 'Platform administration and management',
  [ROLES.PLATFORM_SUPPORT]: 'Platform support and troubleshooting',
  [ROLES.ORGANIZATION_OWNER]: 'Full control over organization',
  [ROLES.ORGANIZATION_ADMIN]: 'Organization administration',
  [ROLES.ORGANIZATION_MANAGER]: 'Organization management',
  [ROLES.TENANT_ADMIN]: 'Tenant administration',
  [ROLES.TENANT_MANAGER]: 'Tenant management',
  [ROLES.PROJECT_MANAGER]: 'Project management and oversight',
  [ROLES.TEAM_LEAD]: 'Team leadership and coordination',
  [ROLES.SENIOR_CONSULTANT]: 'Senior consulting role',
  [ROLES.CONSULTANT]: 'Standard consulting role',
  [ROLES.SENIOR_RECRUITER]: 'Senior recruitment operations',
  [ROLES.RECRUITER]: 'Recruitment operations',
  [ROLES.HIRING_MANAGER]: 'Hiring decisions and approvals',
  [ROLES.CLIENT_ADMIN]: 'Client account administration',
  [ROLES.CLIENT]: 'Client access',
  [ROLES.PARTNER_ADMIN]: 'Partner account administration',
  [ROLES.PARTNER]: 'Partner access',
  [ROLES.CANDIDATE]: 'Job candidate access',
  [ROLES.USER]: 'Basic user access',
  [ROLES.GUEST]: 'Guest access only'
});

/**
 * Role categories for grouping
 * @namespace ROLE_CATEGORIES
 */
const ROLE_CATEGORIES = Object.freeze({
  PLATFORM: [
    ROLES.SUPER_ADMIN,
    ROLES.PLATFORM_ADMIN,
    ROLES.PLATFORM_SUPPORT
  ],
  ORGANIZATION: [
    ROLES.ORGANIZATION_OWNER,
    ROLES.ORGANIZATION_ADMIN,
    ROLES.ORGANIZATION_MANAGER
  ],
  TENANT: [
    ROLES.TENANT_ADMIN,
    ROLES.TENANT_MANAGER
  ],
  BUSINESS: [
    ROLES.PROJECT_MANAGER,
    ROLES.TEAM_LEAD,
    ROLES.SENIOR_CONSULTANT,
    ROLES.CONSULTANT
  ],
  RECRUITMENT: [
    ROLES.SENIOR_RECRUITER,
    ROLES.RECRUITER,
    ROLES.HIRING_MANAGER
  ],
  EXTERNAL: [
    ROLES.CLIENT_ADMIN,
    ROLES.CLIENT,
    ROLES.PARTNER_ADMIN,
    ROLES.PARTNER,
    ROLES.CANDIDATE
  ],
  BASIC: [
    ROLES.USER,
    ROLES.GUEST
  ]
});

/**
 * Default permissions for each role
 * @namespace ROLE_PERMISSIONS
 */
const ROLE_PERMISSIONS = Object.freeze({
  // Super Admin - all permissions
  [ROLES.SUPER_ADMIN]: Object.values(PERMISSIONS).reduce((acc, category) => {
    return [...acc, ...Object.values(category)];
  }, []),

  // Platform Admin - platform management
  [ROLES.PLATFORM_ADMIN]: [
    ...Object.values(PERMISSIONS.PLATFORM),
    ...Object.values(PERMISSIONS.ORGANIZATION),
    ...Object.values(PERMISSIONS.TENANT),
    ...Object.values(PERMISSIONS.USER),
    ...Object.values(PERMISSIONS.AUDIT),
    PERMISSIONS.REPORTS.ANALYTICS_ADVANCED,
    PERMISSIONS.BILLING.REPORTS_GENERATE
  ],

  // Platform Support - view and support
  [ROLES.PLATFORM_SUPPORT]: [
    PERMISSIONS.PLATFORM.SYSTEM_VIEW,
    PERMISSIONS.PLATFORM.ANALYTICS_VIEW,
    PERMISSIONS.PLATFORM.MONITORING_VIEW,
    PERMISSIONS.ORGANIZATION.VIEW_ALL,
    PERMISSIONS.TENANT.VIEW_ALL,
    PERMISSIONS.USER.VIEW_ALL,
    PERMISSIONS.USER.SESSIONS_VIEW,
    PERMISSIONS.AUDIT.LOGS_VIEW,
    PERMISSIONS.REPORTS.DASHBOARD_VIEW
  ],

  // Organization Owner - full organization control
  [ROLES.ORGANIZATION_OWNER]: [
    ...Object.values(PERMISSIONS.ORGANIZATION),
    ...Object.values(PERMISSIONS.TENANT),
    ...Object.values(PERMISSIONS.USER),
    ...Object.values(PERMISSIONS.PROJECT),
    ...Object.values(PERMISSIONS.CLIENT),
    ...Object.values(PERMISSIONS.BILLING),
    ...Object.values(PERMISSIONS.REPORTS),
    PERMISSIONS.AUDIT.LOGS_VIEW,
    PERMISSIONS.AUDIT.COMPLIANCE_VIEW
  ],

  // Organization Admin
  [ROLES.ORGANIZATION_ADMIN]: [
    PERMISSIONS.ORGANIZATION.VIEW,
    PERMISSIONS.ORGANIZATION.UPDATE,
    PERMISSIONS.ORGANIZATION.MEMBERS_VIEW,
    PERMISSIONS.ORGANIZATION.MEMBERS_INVITE,
    PERMISSIONS.ORGANIZATION.MEMBERS_UPDATE,
    PERMISSIONS.ORGANIZATION.SETTINGS_VIEW,
    PERMISSIONS.ORGANIZATION.SETTINGS_UPDATE,
    ...Object.values(PERMISSIONS.TENANT),
    ...Object.values(PERMISSIONS.USER),
    ...Object.values(PERMISSIONS.PROJECT),
    ...Object.values(PERMISSIONS.CLIENT),
    PERMISSIONS.BILLING.INVOICES_VIEW,
    PERMISSIONS.REPORTS.REPORTS_CREATE
  ],

  // Organization Manager
  [ROLES.ORGANIZATION_MANAGER]: [
    PERMISSIONS.ORGANIZATION.VIEW,
    PERMISSIONS.ORGANIZATION.MEMBERS_VIEW,
    PERMISSIONS.TENANT.VIEW,
    PERMISSIONS.USER.VIEW_ALL,
    PERMISSIONS.USER.CREATE,
    PERMISSIONS.USER.UPDATE,
    ...Object.values(PERMISSIONS.PROJECT),
    ...Object.values(PERMISSIONS.CLIENT),
    PERMISSIONS.REPORTS.DASHBOARD_VIEW,
    PERMISSIONS.REPORTS.REPORTS_VIEW
  ],

  // Tenant Admin
  [ROLES.TENANT_ADMIN]: [
    PERMISSIONS.TENANT.VIEW,
    PERMISSIONS.TENANT.UPDATE,
    PERMISSIONS.TENANT.SETTINGS_VIEW,
    PERMISSIONS.TENANT.SETTINGS_UPDATE,
    PERMISSIONS.USER.VIEW_ALL,
    PERMISSIONS.USER.CREATE,
    PERMISSIONS.USER.UPDATE,
    PERMISSIONS.USER.ROLES_ASSIGN,
    ...Object.values(PERMISSIONS.PROJECT),
    ...Object.values(PERMISSIONS.CLIENT),
    PERMISSIONS.REPORTS.REPORTS_CREATE
  ],

  // Project Manager
  [ROLES.PROJECT_MANAGER]: [
    PERMISSIONS.PROJECT.CREATE,
    PERMISSIONS.PROJECT.VIEW_ALL,
    PERMISSIONS.PROJECT.UPDATE,
    PERMISSIONS.PROJECT.TEAM_MANAGE,
    PERMISSIONS.PROJECT.MILESTONES_MANAGE,
    PERMISSIONS.PROJECT.TASKS_CREATE,
    PERMISSIONS.PROJECT.TASKS_UPDATE,
    PERMISSIONS.PROJECT.BUDGET_VIEW,
    PERMISSIONS.PROJECT.BUDGET_MANAGE,
    PERMISSIONS.CLIENT.VIEW_ALL,
    PERMISSIONS.CLIENT.UPDATE,
    PERMISSIONS.CONSULTANT.VIEW_ALL,
    PERMISSIONS.REPORTS.DASHBOARD_VIEW,
    PERMISSIONS.REPORTS.REPORTS_CREATE
  ],

  // Consultant
  [ROLES.CONSULTANT]: [
    PERMISSIONS.PROJECT.VIEW,
    PERMISSIONS.PROJECT.TASKS_VIEW,
    PERMISSIONS.PROJECT.TASKS_UPDATE,
    PERMISSIONS.PROJECT.DOCUMENTS_VIEW,
    PERMISSIONS.CLIENT.VIEW,
    PERMISSIONS.CLIENT.DOCUMENTS_VIEW,
    PERMISSIONS.USER.PROFILE_VIEW_OWN,
    PERMISSIONS.USER.PROFILE_UPDATE_OWN,
    PERMISSIONS.CONSULTANT.PROFILE_UPDATE,
    PERMISSIONS.CONSULTANT.AVAILABILITY_UPDATE,
    PERMISSIONS.REPORTS.DASHBOARD_VIEW
  ],

  // Recruiter
  [ROLES.RECRUITER]: [
    ...Object.values(PERMISSIONS.RECRUITMENT),
    PERMISSIONS.CLIENT.VIEW,
    PERMISSIONS.REPORTS.DASHBOARD_VIEW,
    PERMISSIONS.REPORTS.REPORTS_VIEW
  ],

  // Client
  [ROLES.CLIENT]: [
    PERMISSIONS.PROJECT.VIEW,
    PERMISSIONS.PROJECT.DOCUMENTS_VIEW,
    PERMISSIONS.CLIENT.VIEW,
    PERMISSIONS.CLIENT.CONTACTS_VIEW,
    PERMISSIONS.CLIENT.DOCUMENTS_VIEW,
    PERMISSIONS.CLIENT.ANALYTICS_VIEW,
    PERMISSIONS.BILLING.INVOICES_VIEW,
    PERMISSIONS.USER.PROFILE_VIEW_OWN,
    PERMISSIONS.USER.PROFILE_UPDATE_OWN
  ],

  // Basic User
  [ROLES.USER]: [
    PERMISSIONS.USER.PROFILE_VIEW_OWN,
    PERMISSIONS.USER.PROFILE_UPDATE_OWN,
    PERMISSIONS.USER.PASSWORD_RESET_OWN,
    PERMISSIONS.REPORTS.DASHBOARD_VIEW
  ],

  // Guest
  [ROLES.GUEST]: []
});

/**
 * Role constraints and limits
 * @namespace ROLE_CONSTRAINTS
 */
const ROLE_CONSTRAINTS = Object.freeze({
  [ROLES.SUPER_ADMIN]: {
    maxPerPlatform: 5,
    requiresMFA: true,
    requiresApproval: true
  },
  [ROLES.PLATFORM_ADMIN]: {
    maxPerPlatform: 10,
    requiresMFA: true,
    requiresApproval: true
  },
  [ROLES.ORGANIZATION_OWNER]: {
    maxPerOrganization: 3,
    requiresMFA: true,
    autoAssignOnCreate: true
  },
  [ROLES.ORGANIZATION_ADMIN]: {
    maxPerOrganization: 10,
    requiresMFA: false
  },
  [ROLES.TENANT_ADMIN]: {
    maxPerTenant: 5,
    requiresMFA: false
  }
});

/**
 * Check if role exists
 * @param {string} role - Role to check
 * @returns {boolean} True if role exists
 */
const isValidRole = (role) => {
  return Object.values(ROLES).includes(role);
};

/**
 * Get role hierarchy level
 * @param {string} role - Role name
 * @returns {number} Hierarchy level
 */
const getRoleLevel = (role) => {
  return ROLE_HIERARCHY[role] || 0;
};

/**
 * Check if role1 is superior to role2
 * @param {string} role1 - First role
 * @param {string} role2 - Second role
 * @returns {boolean} True if role1 is superior
 */
const isRoleSuperior = (role1, role2) => {
  return getRoleLevel(role1) > getRoleLevel(role2);
};

/**
 * Check if roles are equal in hierarchy
 * @param {string} role1 - First role
 * @param {string} role2 - Second role
 * @returns {boolean} True if equal
 */
const areRolesEqual = (role1, role2) => {
  return getRoleLevel(role1) === getRoleLevel(role2);
};

/**
 * Get role category
 * @param {string} role - Role name
 * @returns {string|null} Category name
 */
const getRoleCategory = (role) => {
  for (const [category, roles] of Object.entries(ROLE_CATEGORIES)) {
    if (roles.includes(role)) {
      return category;
    }
  }
  return null;
};

/**
 * Get permissions for role
 * @param {string} role - Role name
 * @returns {string[]} Array of permissions
 */
const getRolePermissions = (role) => {
  return ROLE_PERMISSIONS[role] || [];
};

/**
 * Check if role has permission
 * @param {string} role - Role name
 * @param {string} permission - Permission to check
 * @returns {boolean} True if role has permission
 */
const roleHasPermission = (role, permission) => {
  const permissions = getRolePermissions(role);
  return permissions.includes(permission);
};

/**
 * Get display information for role
 * @param {string} role - Role name
 * @returns {Object} Role display information
 */
const getRoleInfo = (role) => {
  return {
    name: role,
    displayName: ROLE_DISPLAY_NAMES[role] || role,
    description: ROLE_DESCRIPTIONS[role] || '',
    level: getRoleLevel(role),
    category: getRoleCategory(role),
    constraints: ROLE_CONSTRAINTS[role] || {}
  };
};

// Export roles and utilities
module.exports = Object.freeze({
  ROLES,
  ROLE_HIERARCHY,
  ROLE_DISPLAY_NAMES,
  ROLE_DESCRIPTIONS,
  ROLE_CATEGORIES,
  ROLE_PERMISSIONS,
  ROLE_CONSTRAINTS,
  
  // Utility functions
  isValidRole,
  getRoleLevel,
  isRoleSuperior,
  areRolesEqual,
  getRoleCategory,
  getRolePermissions,
  roleHasPermission,
  getRoleInfo
});