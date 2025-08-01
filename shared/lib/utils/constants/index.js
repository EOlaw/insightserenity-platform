'use strict';

/**
 * @fileoverview Central export point for all system constants
 * @module shared/lib/utils/constants
 * @description Aggregates and exports all system constants for centralized access
 */

// Import individual constant modules
const errorCodes = require('./error-codes');
const statusCodes = require('./status-codes');
const permissionsModule = require('./permissions');
const rolesModule = require('./roles');

// Extract specific exports from modules
const { PERMISSIONS, PERMISSION_GROUPS } = permissionsModule;
const { ROLES, ROLE_HIERARCHY, ROLE_DISPLAY_NAMES, ROLE_CATEGORIES, ROLE_PERMISSIONS, ROLE_CONSTRAINTS } = rolesModule;

/**
 * @namespace Constants
 * @description Centralized system constants for the InsightSerenity platform
 */
module.exports = Object.freeze({
  // Error handling constants
  ...errorCodes,
  
  // Status code constants  
  ...statusCodes,

  // Permission system
  PERMISSIONS,
  PERMISSION_GROUPS,
  
  // Role system
  ROLES,
  ROLE_HIERARCHY,
  ROLE_DISPLAY_NAMES,
  ROLE_CATEGORIES,
  ROLE_PERMISSIONS,
  ROLE_CONSTRAINTS,

  // Grouped exports for convenience
  permissions: {
    PERMISSIONS,
    PERMISSION_GROUPS,
    ...permissionsModule
  },
  
  roles: {
    ROLES,
    ROLE_HIERARCHY,
    ROLE_DISPLAY_NAMES,
    ROLE_CATEGORIES,
    ROLE_PERMISSIONS,
    ROLE_CONSTRAINTS,
    ...rolesModule
  },

  // Legacy support - maintain backward compatibility
  errorCodes,
  statusCodes,
  
  // Admin-specific constants for enhanced security operations
  admin: {
    ALLOWED_ROLES: [
      ROLES.SUPER_ADMIN,
      ROLES.PLATFORM_ADMIN,
      ROLES.PLATFORM_SUPPORT
    ],
    
    SENSITIVE_PERMISSIONS: [
      PERMISSIONS.PLATFORM.SYSTEM_MANAGE,
      PERMISSIONS.PLATFORM.SECURITY_CONFIGURE,
      PERMISSIONS.USER.IMPERSONATE,
      PERMISSIONS.ORGANIZATION.DELETE,
      PERMISSIONS.TENANT.DELETE
    ],
    
    CRITICAL_OPERATIONS: [
      PERMISSIONS.PLATFORM.DEPLOYMENT_MANAGE,
      PERMISSIONS.PLATFORM.SYSTEM_MAINTENANCE,
      PERMISSIONS.PLATFORM.SECURITY_CONFIGURE,
      PERMISSIONS.USER.DELETE,
      PERMISSIONS.ORGANIZATION.DELETE
    ],

    MFA_REQUIRED_PERMISSIONS: [
      PERMISSIONS.PLATFORM.SYSTEM_MANAGE,
      PERMISSIONS.PLATFORM.SECURITY_CONFIGURE,
      PERMISSIONS.USER.IMPERSONATE,
      PERMISSIONS.USER.DELETE,
      PERMISSIONS.ORGANIZATION.DELETE,
      PERMISSIONS.TENANT.DELETE
    ]
  }
});