'use strict';

/**
 * @fileoverview User permissions management routes
 * @module servers/admin-server/modules/user-management/routes/user-permissions-routes
 * @requires express
 * @requires module:servers/admin-server/modules/user-management/controllers/user-permissions-controller
 * @requires module:shared/lib/middleware/auth/authenticate
 * @requires module:shared/lib/middleware/auth/authorize
 * @requires module:shared/lib/middleware/rate-limit
 * @requires module:shared/lib/middleware/cors-middleware
 * @requires module:shared/lib/middleware/security/security-headers
 * @requires module:shared/lib/middleware/logging/request-logger
 * @requires module:shared/lib/middleware/error-handlers/async-error-handler
 * @requires module:shared/lib/utils/logger
 */

const express = require('express');
const userPermissionsController = require('../controllers/user-permissions-controller');
const authenticate = require('../../../../../shared/lib/middleware/auth/authenticate');
const authorize = require('../../../../../shared/lib/middleware/auth/authorize');
const rateLimit = require('../../../../../shared/lib/middleware/rate-limit');
const corsMiddleware = require('../../../../../shared/lib/middleware/cors-middleware');
const securityHeaders = require('../../../../../shared/lib/middleware/security/security-headers');
const requestLogger = require('../../../../../shared/lib/middleware/logging/request-logger');
const asyncErrorHandler = require('../../../../../shared/lib/middleware/error-handlers/async-error-handler');
const multer = require('multer');
const logger = require('../../../../../shared/lib/utils/logger');

// Create router instance
const router = express.Router();

/**
 * Configure file upload middleware for permission imports
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 1
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      'application/json',
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type for permission import'));
    }
  }
});

/**
 * Configure route-specific middleware
 */
router.use(corsMiddleware());
router.use(securityHeaders());
router.use(requestLogger({ module: 'UserPermissionsRoutes' }));

/**
 * Rate limiting configurations
 */
const standardRateLimit = rateLimit({
  windowMs: 60000,
  max: 100,
  message: 'Too many permission requests',
  standardHeaders: true,
  legacyHeaders: false
});

const modificationRateLimit = rateLimit({
  windowMs: 60000,
  max: 30,
  message: 'Too many permission modification attempts',
  standardHeaders: true,
  legacyHeaders: false
});

const bulkRateLimit = rateLimit({
  windowMs: 300000,
  max: 5,
  message: 'Too many bulk permission operations',
  standardHeaders: true,
  legacyHeaders: false
});

const exportRateLimit = rateLimit({
  windowMs: 300000,
  max: 10,
  message: 'Too many export attempts',
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Authentication middleware for all permission routes
 */
router.use(authenticate());

/**
 * Permission CRUD Operations
 */

// Create a new permission
router.post(
  '/permissions',
  modificationRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN']),
  asyncErrorHandler(userPermissionsController.createPermission)
);

// Get permission by ID or code
router.get(
  '/permissions/:id',
  standardRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN', 'USER_ADMIN']),
  asyncErrorHandler(userPermissionsController.getPermission)
);

// Update permission
router.put(
  '/permissions/:id',
  modificationRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN']),
  asyncErrorHandler(userPermissionsController.updatePermission)
);

// Delete permission
router.delete(
  '/permissions/:id',
  modificationRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN']),
  asyncErrorHandler(userPermissionsController.deletePermission)
);

// List all permissions
router.get(
  '/permissions',
  standardRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN', 'USER_ADMIN']),
  asyncErrorHandler(userPermissionsController.listPermissions)
);

/**
 * User Permission Assignment
 */

// Assign permission to user
router.post(
  '/users/permissions/assign',
  modificationRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'USER_ADMIN']),
  asyncErrorHandler(userPermissionsController.assignPermissionToUser)
);

// Revoke permission from user
router.post(
  '/users/permissions/revoke',
  modificationRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'USER_ADMIN']),
  asyncErrorHandler(userPermissionsController.revokePermissionFromUser)
);

// Get user permissions
router.get(
  '/users/:userId/permissions',
  standardRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'USER_ADMIN', 'SECURITY_ADMIN']),
  asyncErrorHandler(userPermissionsController.getUserPermissions)
);

// Check user permission
router.post(
  '/users/permissions/check',
  standardRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN', 'USER_ADMIN']),
  asyncErrorHandler(userPermissionsController.checkUserPermission)
);

// Get effective permissions for user
router.get(
  '/users/:userId/permissions/effective',
  standardRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN']),
  asyncErrorHandler(userPermissionsController.getEffectivePermissions)
);

/**
 * Role Management
 */

// Create a new role
router.post(
  '/roles',
  modificationRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN']),
  asyncErrorHandler(userPermissionsController.createRole)
);

// Update role
router.put(
  '/roles/:roleId',
  modificationRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN']),
  asyncErrorHandler(userPermissionsController.updateRole)
);

// Delete role
router.delete(
  '/roles/:roleId',
  modificationRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN']),
  asyncErrorHandler(userPermissionsController.deleteRole)
);

// List all roles
router.get(
  '/roles',
  standardRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN', 'USER_ADMIN']),
  asyncErrorHandler(userPermissionsController.listRoles)
);

// Get role permissions
router.get(
  '/roles/:roleId/permissions',
  standardRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN', 'USER_ADMIN']),
  asyncErrorHandler(userPermissionsController.getRolePermissions)
);

// Update role permissions
router.put(
  '/roles/:roleId/permissions',
  modificationRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN']),
  asyncErrorHandler(userPermissionsController.updateRolePermissions)
);

/**
 * User Role Assignment
 */

// Grant role to user
router.post(
  '/users/roles/grant',
  modificationRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'USER_ADMIN']),
  asyncErrorHandler(userPermissionsController.grantRoleToUser)
);

// Revoke role from user
router.post(
  '/users/roles/revoke',
  modificationRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'USER_ADMIN']),
  asyncErrorHandler(userPermissionsController.revokeRoleFromUser)
);

// Get user roles
router.get(
  '/users/:userId/roles',
  standardRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'USER_ADMIN', 'SECURITY_ADMIN']),
  asyncErrorHandler(userPermissionsController.getUserRoles)
);

/**
 * Bulk Operations
 */

// Bulk assign permissions
router.post(
  '/permissions/bulk/assign',
  bulkRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN']),
  asyncErrorHandler(userPermissionsController.bulkAssignPermissions)
);

// Bulk revoke permissions
router.post(
  '/permissions/bulk/revoke',
  bulkRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN']),
  asyncErrorHandler(userPermissionsController.bulkRevokePermissions)
);

// Clone user permissions
router.post(
  '/users/permissions/clone',
  modificationRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN']),
  asyncErrorHandler(userPermissionsController.cloneUserPermissions)
);

/**
 * Permission Analysis and Reporting
 */

// Get permission statistics
router.get(
  '/permissions/statistics',
  standardRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN']),
  asyncErrorHandler(userPermissionsController.getPermissionStatistics)
);

// Audit user permissions
router.post(
  '/users/:userId/permissions/audit',
  standardRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN', 'COMPLIANCE_OFFICER']),
  asyncErrorHandler(userPermissionsController.auditUserPermissions)
);

// Get permission matrix
router.get(
  '/permissions/matrix',
  standardRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN']),
  asyncErrorHandler(userPermissionsController.getPermissionMatrix)
);

// Get permission hierarchy
router.get(
  '/permissions/hierarchy',
  standardRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN']),
  asyncErrorHandler(userPermissionsController.getPermissionHierarchy)
);

// Get permission dependencies
router.get(
  '/permissions/:id/dependencies',
  standardRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN']),
  asyncErrorHandler(userPermissionsController.getPermissionDependencies)
);

/**
 * Permission Validation
 */

// Validate permission assignment
router.post(
  '/permissions/validate-assignment',
  standardRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN']),
  asyncErrorHandler(userPermissionsController.validatePermissionAssignment)
);

// Check permission conflicts
router.post(
  '/permissions/check-conflicts',
  standardRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN']),
  asyncErrorHandler(userPermissionsController.checkPermissionConflicts)
);

// Evaluate permission policy
router.post(
  '/permissions/evaluate-policy',
  standardRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN']),
  asyncErrorHandler(userPermissionsController.evaluatePermissionPolicy)
);

/**
 * Import and Export Operations
 */

// Export permissions
router.get(
  '/permissions/export',
  exportRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN']),
  asyncErrorHandler(userPermissionsController.exportPermissions)
);

// Import permissions
router.post(
  '/permissions/import',
  bulkRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN']),
  upload.single('file'),
  asyncErrorHandler(userPermissionsController.importPermissions)
);

// Export user permissions
router.get(
  '/users/:userId/permissions/export',
  exportRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN']),
  asyncErrorHandler(userPermissionsController.exportPermissions)
);

// Export role permissions
router.get(
  '/roles/:roleId/permissions/export',
  exportRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN']),
  asyncErrorHandler(userPermissionsController.exportPermissions)
);

/**
 * Synchronization Operations
 */

// Sync permissions with external system
router.post(
  '/permissions/sync',
  bulkRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN']),
  asyncErrorHandler(userPermissionsController.syncPermissions)
);

// Refresh user permissions cache
router.post(
  '/users/:userId/permissions/refresh',
  modificationRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN']),
  asyncErrorHandler(userPermissionsController.refreshUserPermissions)
);

/**
 * Permission Categories and Modules
 */

// Get permissions by category
router.get(
  '/permissions/category/:category',
  standardRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN', 'USER_ADMIN']),
  asyncErrorHandler(userPermissionsController.listPermissions)
);

// Get permissions by module
router.get(
  '/permissions/module/:module',
  standardRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN', 'USER_ADMIN']),
  asyncErrorHandler(userPermissionsController.listPermissions)
);

// Get permissions by resource
router.get(
  '/permissions/resource/:resource',
  standardRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN', 'USER_ADMIN']),
  asyncErrorHandler(userPermissionsController.listPermissions)
);

// Get permissions by action
router.get(
  '/permissions/action/:action',
  standardRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN', 'USER_ADMIN']),
  asyncErrorHandler(userPermissionsController.listPermissions)
);

/**
 * Role Categories
 */

// Get system roles
router.get(
  '/roles/system',
  standardRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN']),
  asyncErrorHandler(userPermissionsController.listRoles)
);

// Get custom roles
router.get(
  '/roles/custom',
  standardRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN', 'USER_ADMIN']),
  asyncErrorHandler(userPermissionsController.listRoles)
);

// Get organization roles
router.get(
  '/roles/organization/:organizationId',
  standardRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  asyncErrorHandler(userPermissionsController.listRoles)
);

/**
 * Permission Templates
 */

// Create permission template
router.post(
  '/permissions/templates',
  modificationRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN']),
  asyncErrorHandler(userPermissionsController.createPermission)
);

// Get permission templates
router.get(
  '/permissions/templates',
  standardRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN', 'USER_ADMIN']),
  asyncErrorHandler(userPermissionsController.listPermissions)
);

// Apply permission template
router.post(
  '/users/:userId/permissions/apply-template',
  modificationRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'USER_ADMIN']),
  asyncErrorHandler(userPermissionsController.assignPermissionToUser)
);

/**
 * Temporary Permissions
 */

// Grant temporary permission
router.post(
  '/users/:userId/permissions/temporary',
  modificationRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN']),
  asyncErrorHandler(userPermissionsController.assignPermissionToUser)
);

// Revoke expired permissions
router.post(
  '/permissions/revoke-expired',
  modificationRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN']),
  asyncErrorHandler(userPermissionsController.bulkRevokePermissions)
);

// Extend temporary permission
router.put(
  '/users/:userId/permissions/temporary/:permissionId',
  modificationRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN']),
  asyncErrorHandler(userPermissionsController.assignPermissionToUser)
);

/**
 * Permission Inheritance
 */

// Get inherited permissions
router.get(
  '/users/:userId/permissions/inherited',
  standardRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN']),
  asyncErrorHandler(userPermissionsController.getUserPermissions)
);

// Get permission inheritance chain
router.get(
  '/permissions/:id/inheritance',
  standardRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN']),
  asyncErrorHandler(userPermissionsController.getPermissionDependencies)
);

/**
 * Permission Groups
 */

// Create permission group
router.post(
  '/permissions/groups',
  modificationRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN']),
  asyncErrorHandler(userPermissionsController.createPermission)
);

// Get permission groups
router.get(
  '/permissions/groups',
  standardRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN', 'USER_ADMIN']),
  asyncErrorHandler(userPermissionsController.listPermissions)
);

// Add permission to group
router.post(
  '/permissions/groups/:groupId/permissions',
  modificationRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN']),
  asyncErrorHandler(userPermissionsController.updatePermission)
);

// Remove permission from group
router.delete(
  '/permissions/groups/:groupId/permissions/:permissionId',
  modificationRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN']),
  asyncErrorHandler(userPermissionsController.updatePermission)
);

/**
 * Permission Policies
 */

// Create permission policy
router.post(
  '/permissions/policies',
  modificationRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN']),
  asyncErrorHandler(userPermissionsController.createPermission)
);

// Get permission policies
router.get(
  '/permissions/policies',
  standardRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN']),
  asyncErrorHandler(userPermissionsController.listPermissions)
);

// Apply permission policy
router.post(
  '/permissions/policies/:policyId/apply',
  modificationRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN']),
  asyncErrorHandler(userPermissionsController.assignPermissionToUser)
);

// Evaluate permission policy
router.post(
  '/permissions/policies/:policyId/evaluate',
  standardRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN']),
  asyncErrorHandler(userPermissionsController.evaluatePermissionPolicy)
);

/**
 * Permission Delegation
 */

// Delegate permission
router.post(
  '/users/:userId/permissions/delegate',
  modificationRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'USER_ADMIN']),
  asyncErrorHandler(userPermissionsController.assignPermissionToUser)
);

// Get delegated permissions
router.get(
  '/users/:userId/permissions/delegated',
  standardRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN']),
  asyncErrorHandler(userPermissionsController.getUserPermissions)
);

// Revoke delegated permission
router.delete(
  '/users/:userId/permissions/delegated/:delegationId',
  modificationRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'USER_ADMIN']),
  asyncErrorHandler(userPermissionsController.revokePermissionFromUser)
);

/**
 * Permission History
 */

// Get permission history
router.get(
  '/permissions/:id/history',
  standardRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN', 'COMPLIANCE_OFFICER']),
  asyncErrorHandler(userPermissionsController.getPermission)
);

// Get user permission history
router.get(
  '/users/:userId/permissions/history',
  standardRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN', 'COMPLIANCE_OFFICER']),
  asyncErrorHandler(userPermissionsController.getUserPermissions)
);

// Get role permission history
router.get(
  '/roles/:roleId/permissions/history',
  standardRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN', 'COMPLIANCE_OFFICER']),
  asyncErrorHandler(userPermissionsController.getRolePermissions)
);

/**
 * Permission Compliance
 */

// Check permission compliance
router.post(
  '/permissions/compliance/check',
  standardRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'COMPLIANCE_OFFICER']),
  asyncErrorHandler(userPermissionsController.auditUserPermissions)
);

// Generate compliance report
router.get(
  '/permissions/compliance/report',
  exportRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'COMPLIANCE_OFFICER']),
  asyncErrorHandler(userPermissionsController.getPermissionStatistics)
);

// Get non-compliant permissions
router.get(
  '/permissions/compliance/violations',
  standardRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'COMPLIANCE_OFFICER']),
  asyncErrorHandler(userPermissionsController.listPermissions)
);

/**
 * Permission Security
 */

// Get high-risk permissions
router.get(
  '/permissions/security/high-risk',
  standardRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN']),
  asyncErrorHandler(userPermissionsController.listPermissions)
);

// Get permission security assessment
router.get(
  '/permissions/:id/security/assessment',
  standardRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN']),
  asyncErrorHandler(userPermissionsController.getPermission)
);

// Get user permission risk score
router.get(
  '/users/:userId/permissions/risk-score',
  standardRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN']),
  asyncErrorHandler(userPermissionsController.auditUserPermissions)
);

/**
 * Permission Recommendations
 */

// Get permission recommendations
router.get(
  '/users/:userId/permissions/recommendations',
  standardRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN']),
  asyncErrorHandler(userPermissionsController.auditUserPermissions)
);

// Get role recommendations
router.get(
  '/users/:userId/roles/recommendations',
  standardRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'USER_ADMIN']),
  asyncErrorHandler(userPermissionsController.getUserRoles)
);

/**
 * Permission Search
 */

// Search permissions
router.get(
  '/permissions/search',
  standardRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN', 'USER_ADMIN']),
  asyncErrorHandler(userPermissionsController.listPermissions)
);

// Search roles
router.get(
  '/roles/search',
  standardRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN', 'USER_ADMIN']),
  asyncErrorHandler(userPermissionsController.listRoles)
);

// Search users by permission
router.get(
  '/permissions/:permissionId/users',
  standardRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN']),
  asyncErrorHandler(userPermissionsController.listPermissions)
);

// Search users by role
router.get(
  '/roles/:roleId/users',
  standardRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN', 'USER_ADMIN']),
  asyncErrorHandler(userPermissionsController.listRoles)
);

/**
 * Error handling middleware
 */
router.use((error, req, res, next) => {
  logger.error('Permission route error:', error);
  
  const statusCode = error.statusCode || 500;
  const message = error.message || 'Internal server error';
  
  res.status(statusCode).json({
    success: false,
    error: {
      message,
      statusCode,
      timestamp: new Date().toISOString()
    }
  });
});

/**
 * Export router
 */
module.exports = router;

/**
 * Route Documentation
 * 
 * This router handles all permission and role management operations including:
 * - Permission CRUD operations
 * - User permission assignment and management
 * - Role management and assignment
 * - Bulk permission operations
 * - Permission analysis and reporting
 * - Permission validation and conflict checking
 * - Import/export functionality
 * - Synchronization operations
 * - Permission categories and modules
 * - Permission templates
 * - Temporary permissions
 * - Permission inheritance
 * - Permission groups and policies
 * - Permission delegation
 * - Permission history and compliance
 * - Security assessments
 * - Permission recommendations
 * - Search functionality
 * 
 * All routes require authentication and appropriate authorization.
 * Rate limiting protects against abuse.
 * Comprehensive error handling for all operations.
 */