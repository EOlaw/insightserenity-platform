'use strict';

/**
 * @fileoverview User management routes for platform users
 * @module servers/admin-server/modules/user-management/routes/user-management-routes
 * @requires express
 * @requires module:servers/admin-server/modules/user-management/controllers/user-management-controller
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
const userManagementController = require('../controllers/user-management-controller');
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
 * Configure file upload middleware
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 1
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/json',
      'application/xml',
      'text/xml'
    ];
    
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only CSV, Excel, JSON, and XML files are allowed.'));
    }
  }
});

/**
 * Configure route-specific middleware
 */
router.use(corsMiddleware());
router.use(securityHeaders());
router.use(requestLogger({ module: 'UserManagementRoutes' }));

/**
 * Rate limiting configurations
 */
const createRateLimit = rateLimit({
  windowMs: 60000,
  max: 20,
  message: 'Too many user creation attempts',
  standardHeaders: true,
  legacyHeaders: false
});

const updateRateLimit = rateLimit({
  windowMs: 60000,
  max: 50,
  message: 'Too many user update attempts',
  standardHeaders: true,
  legacyHeaders: false
});

const deleteRateLimit = rateLimit({
  windowMs: 60000,
  max: 10,
  message: 'Too many user deletion attempts',
  standardHeaders: true,
  legacyHeaders: false
});

const bulkRateLimit = rateLimit({
  windowMs: 300000,
  max: 5,
  message: 'Too many bulk operation attempts',
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
 * Authentication middleware for all user management routes
 */
router.use(authenticate());

/**
 * User CRUD Operations
 */

// Create a new user
router.post(
  '/users',
  createRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'USER_ADMIN']),
  asyncErrorHandler(userManagementController.createUser)
);

// Get user by ID
router.get(
  '/users/:id',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'USER_ADMIN', 'SUPPORT_ADMIN']),
  asyncErrorHandler(userManagementController.getUser)
);

// Update user
router.put(
  '/users/:id',
  updateRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'USER_ADMIN']),
  asyncErrorHandler(userManagementController.updateUser)
);

// Delete user
router.delete(
  '/users/:id',
  deleteRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN']),
  asyncErrorHandler(userManagementController.deleteUser)
);

// List users with filtering and pagination
router.get(
  '/users',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'USER_ADMIN', 'SUPPORT_ADMIN']),
  asyncErrorHandler(userManagementController.listUsers)
);

// Search users
router.get(
  '/users/search',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'USER_ADMIN', 'SUPPORT_ADMIN']),
  asyncErrorHandler(userManagementController.searchUsers)
);

/**
 * Bulk Operations
 */

// Bulk create users
router.post(
  '/users/bulk/create',
  bulkRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN']),
  asyncErrorHandler(userManagementController.bulkCreateUsers)
);

// Bulk update users
router.put(
  '/users/bulk/update',
  bulkRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN']),
  asyncErrorHandler(userManagementController.bulkUpdateUsers)
);

// Bulk delete users
router.delete(
  '/users/bulk/delete',
  bulkRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN']),
  asyncErrorHandler(userManagementController.bulkDeleteUsers)
);

// Merge duplicate users
router.post(
  '/users/merge',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN']),
  asyncErrorHandler(userManagementController.mergeUsers)
);

/**
 * Import and Export Operations
 */

// Import users from file
router.post(
  '/users/import',
  bulkRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN']),
  upload.single('file'),
  asyncErrorHandler(userManagementController.importUsers)
);

// Export users to file
router.get(
  '/users/export',
  exportRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'USER_ADMIN']),
  asyncErrorHandler(userManagementController.exportUsers)
);

/**
 * User Statistics and Analytics
 */

// Get user statistics
router.get(
  '/users/statistics/overview',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'USER_ADMIN']),
  asyncErrorHandler(userManagementController.getUserStatistics)
);

// Get user activity
router.get(
  '/users/:id/activity',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN']),
  asyncErrorHandler(userManagementController.getUserActivity)
);

// Generate user report
router.get(
  '/users/reports/generate',
  exportRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN']),
  asyncErrorHandler(userManagementController.generateUserReport)
);

/**
 * Email and Account Verification
 */

// Verify user email
router.post(
  '/users/:id/email/verify',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'USER_ADMIN']),
  asyncErrorHandler(userManagementController.verifyUserEmail)
);

// Resend verification email
router.post(
  '/users/:id/email/resend-verification',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'USER_ADMIN']),
  asyncErrorHandler(userManagementController.verifyUserEmail)
);

/**
 * Password Management
 */

// Reset user password
router.post(
  '/users/:id/password/reset',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN']),
  asyncErrorHandler(userManagementController.resetUserPassword)
);

// Force password change
router.post(
  '/users/:id/password/force-change',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN']),
  asyncErrorHandler(userManagementController.resetUserPassword)
);

/**
 * Two-Factor Authentication Management
 */

// Enable two-factor authentication
router.post(
  '/users/:id/two-factor/enable',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN']),
  asyncErrorHandler(userManagementController.enableTwoFactorAuth)
);

// Disable two-factor authentication
router.post(
  '/users/:id/two-factor/disable',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN']),
  asyncErrorHandler(userManagementController.disableTwoFactorAuth)
);

// Reset two-factor authentication
router.post(
  '/users/:id/two-factor/reset',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN']),
  asyncErrorHandler(userManagementController.disableTwoFactorAuth)
);

/**
 * User Preferences and Profile
 */

// Update user preferences
router.put(
  '/users/:id/preferences',
  updateRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'USER_ADMIN']),
  asyncErrorHandler(userManagementController.updateUserPreferences)
);

// Update user profile
router.put(
  '/users/:id/profile',
  updateRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'USER_ADMIN']),
  asyncErrorHandler(userManagementController.updateUserProfile)
);

// Upload user avatar
router.post(
  '/users/:id/avatar',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'USER_ADMIN']),
  upload.single('avatar'),
  asyncErrorHandler(userManagementController.updateUserProfile)
);

// Delete user avatar
router.delete(
  '/users/:id/avatar',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'USER_ADMIN']),
  asyncErrorHandler(userManagementController.updateUserProfile)
);

/**
 * User Status Management
 */

// Update user status
router.patch(
  '/users/:id/status',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'USER_ADMIN']),
  asyncErrorHandler(userManagementController.updateUserStatus)
);

// Activate user
router.post(
  '/users/:id/activate',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'USER_ADMIN']),
  asyncErrorHandler(userManagementController.updateUserStatus)
);

// Deactivate user
router.post(
  '/users/:id/deactivate',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'USER_ADMIN']),
  asyncErrorHandler(userManagementController.updateUserStatus)
);

// Suspend user
router.post(
  '/users/:id/suspend',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN']),
  asyncErrorHandler(userManagementController.updateUserStatus)
);

// Unsuspend user
router.post(
  '/users/:id/unsuspend',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN']),
  asyncErrorHandler(userManagementController.updateUserStatus)
);

// Lock user account
router.post(
  '/users/:id/lock',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN']),
  asyncErrorHandler(userManagementController.updateUserStatus)
);

// Unlock user account
router.post(
  '/users/:id/unlock',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN']),
  asyncErrorHandler(userManagementController.updateUserStatus)
);

/**
 * Organization Management
 */

// Assign user to organization
router.post(
  '/users/:id/organizations',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  asyncErrorHandler(userManagementController.assignUserToOrganization)
);

// Remove user from organization
router.delete(
  '/users/:id/organizations/:organizationId',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  asyncErrorHandler(userManagementController.removeUserFromOrganization)
);

// Get user organizations
router.get(
  '/users/:id/organizations',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'USER_ADMIN', 'ORGANIZATION_ADMIN']),
  asyncErrorHandler(userManagementController.getUser)
);

// Transfer user to different organization
router.post(
  '/users/:id/organizations/transfer',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN']),
  asyncErrorHandler(userManagementController.assignUserToOrganization)
);

/**
 * Session Management
 */

// Get user sessions
router.get(
  '/users/:id/sessions',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN']),
  asyncErrorHandler(userManagementController.getUserSessions)
);

// Terminate user sessions
router.delete(
  '/users/:id/sessions',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN']),
  asyncErrorHandler(userManagementController.terminateUserSessions)
);

// Terminate specific session
router.delete(
  '/users/:id/sessions/:sessionId',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN']),
  asyncErrorHandler(userManagementController.terminateUserSessions)
);

/**
 * Permission Management
 */

// Get user permissions
router.get(
  '/users/:id/permissions',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'USER_ADMIN', 'SECURITY_ADMIN']),
  asyncErrorHandler(userManagementController.getUserPermissions)
);

// Update user permissions
router.put(
  '/users/:id/permissions',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN']),
  asyncErrorHandler(userManagementController.updateUserPermissions)
);

// Grant permission to user
router.post(
  '/users/:id/permissions/grant',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN']),
  asyncErrorHandler(userManagementController.updateUserPermissions)
);

// Revoke permission from user
router.post(
  '/users/:id/permissions/revoke',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN']),
  asyncErrorHandler(userManagementController.updateUserPermissions)
);

/**
 * Role Management
 */

// Grant role to user
router.post(
  '/users/:id/roles',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'USER_ADMIN']),
  asyncErrorHandler(userManagementController.grantUserRole)
);

// Revoke role from user
router.delete(
  '/users/:id/roles/:roleId',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'USER_ADMIN']),
  asyncErrorHandler(userManagementController.revokeUserRole)
);

// Get user roles
router.get(
  '/users/:id/roles',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'USER_ADMIN', 'SECURITY_ADMIN']),
  asyncErrorHandler(userManagementController.getUser)
);

// Update user roles
router.put(
  '/users/:id/roles',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN']),
  asyncErrorHandler(userManagementController.grantUserRole)
);

/**
 * Audit and Compliance
 */

// Audit user
router.post(
  '/users/:id/audit',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN', 'COMPLIANCE_OFFICER']),
  asyncErrorHandler(userManagementController.auditUser)
);

// Get user audit log
router.get(
  '/users/:id/audit-log',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN', 'COMPLIANCE_OFFICER']),
  asyncErrorHandler(userManagementController.getUserActivity)
);

// Export user audit trail
router.get(
  '/users/:id/audit-trail/export',
  exportRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'COMPLIANCE_OFFICER']),
  asyncErrorHandler(userManagementController.generateUserReport)
);

/**
 * Data Validation and Eligibility
 */

// Validate user data
router.post(
  '/users/validate',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'USER_ADMIN']),
  asyncErrorHandler(userManagementController.validateUserData)
);

// Check user eligibility
router.post(
  '/users/:id/eligibility/check',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'USER_ADMIN']),
  asyncErrorHandler(userManagementController.checkUserEligibility)
);

/**
 * Advanced Search and Filtering
 */

// Search users by email
router.get(
  '/users/search/by-email',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'USER_ADMIN', 'SUPPORT_ADMIN']),
  asyncErrorHandler(userManagementController.searchUsers)
);

// Search users by phone
router.get(
  '/users/search/by-phone',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'USER_ADMIN', 'SUPPORT_ADMIN']),
  asyncErrorHandler(userManagementController.searchUsers)
);

// Search users by organization
router.get(
  '/users/search/by-organization',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'USER_ADMIN', 'ORGANIZATION_ADMIN']),
  asyncErrorHandler(userManagementController.searchUsers)
);

// Search users by role
router.get(
  '/users/search/by-role',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'USER_ADMIN']),
  asyncErrorHandler(userManagementController.searchUsers)
);

// Search users by status
router.get(
  '/users/search/by-status',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'USER_ADMIN', 'SECURITY_ADMIN']),
  asyncErrorHandler(userManagementController.searchUsers)
);

// Search users by registration date
router.get(
  '/users/search/by-registration-date',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'USER_ADMIN']),
  asyncErrorHandler(userManagementController.searchUsers)
);

// Search users by last activity
router.get(
  '/users/search/by-last-activity',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN']),
  asyncErrorHandler(userManagementController.searchUsers)
);

/**
 * User Type Specific Operations
 */

// Get customer users
router.get(
  '/users/customers',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'USER_ADMIN', 'SUPPORT_ADMIN']),
  asyncErrorHandler(userManagementController.listUsers)
);

// Get partner users
router.get(
  '/users/partners',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'USER_ADMIN']),
  asyncErrorHandler(userManagementController.listUsers)
);

// Get employee users
router.get(
  '/users/employees',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'USER_ADMIN']),
  asyncErrorHandler(userManagementController.listUsers)
);

// Get contractor users
router.get(
  '/users/contractors',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'USER_ADMIN']),
  asyncErrorHandler(userManagementController.listUsers)
);

// Get API users
router.get(
  '/users/api-users',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN']),
  asyncErrorHandler(userManagementController.listUsers)
);

// Get service accounts
router.get(
  '/users/service-accounts',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN']),
  asyncErrorHandler(userManagementController.listUsers)
);

// Get guest users
router.get(
  '/users/guests',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'USER_ADMIN']),
  asyncErrorHandler(userManagementController.listUsers)
);

/**
 * Statistics and Analytics
 */

// Get user growth statistics
router.get(
  '/users/statistics/growth',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'USER_ADMIN']),
  asyncErrorHandler(userManagementController.getUserStatistics)
);

// Get user demographic statistics
router.get(
  '/users/statistics/demographics',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'USER_ADMIN']),
  asyncErrorHandler(userManagementController.getUserStatistics)
);

// Get user activity statistics
router.get(
  '/users/statistics/activity',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN']),
  asyncErrorHandler(userManagementController.getUserStatistics)
);

// Get user engagement statistics
router.get(
  '/users/statistics/engagement',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'USER_ADMIN']),
  asyncErrorHandler(userManagementController.getUserStatistics)
);

// Get user retention statistics
router.get(
  '/users/statistics/retention',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'USER_ADMIN']),
  asyncErrorHandler(userManagementController.getUserStatistics)
);

/**
 * Reporting
 */

// Generate user activity report
router.get(
  '/users/reports/activity',
  exportRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN']),
  asyncErrorHandler(userManagementController.generateUserReport)
);

// Generate user compliance report
router.get(
  '/users/reports/compliance',
  exportRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'COMPLIANCE_OFFICER']),
  asyncErrorHandler(userManagementController.generateUserReport)
);

// Generate user security report
router.get(
  '/users/reports/security',
  exportRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN']),
  asyncErrorHandler(userManagementController.generateUserReport)
);

// Generate user permission report
router.get(
  '/users/reports/permissions',
  exportRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ADMIN']),
  asyncErrorHandler(userManagementController.generateUserReport)
);

// Generate user organization report
router.get(
  '/users/reports/organizations',
  exportRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']),
  asyncErrorHandler(userManagementController.generateUserReport)
);

/**
 * User Lifecycle Management
 */

// Archive user
router.post(
  '/users/:id/archive',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN']),
  asyncErrorHandler(userManagementController.updateUserStatus)
);

// Restore archived user
router.post(
  '/users/:id/restore',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN']),
  asyncErrorHandler(userManagementController.updateUserStatus)
);

// Schedule user deletion
router.post(
  '/users/:id/schedule-deletion',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN']),
  asyncErrorHandler(userManagementController.deleteUser)
);

// Cancel scheduled deletion
router.post(
  '/users/:id/cancel-deletion',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN']),
  asyncErrorHandler(userManagementController.updateUserStatus)
);

/**
 * Data Privacy and GDPR
 */

// Export user data (GDPR)
router.get(
  '/users/:id/data/export',
  exportRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'COMPLIANCE_OFFICER']),
  asyncErrorHandler(userManagementController.exportUsers)
);

// Anonymize user data
router.post(
  '/users/:id/data/anonymize',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'COMPLIANCE_OFFICER']),
  asyncErrorHandler(userManagementController.updateUser)
);

// Delete user data (Right to be forgotten)
router.delete(
  '/users/:id/data',
  deleteRateLimit,
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'COMPLIANCE_OFFICER']),
  asyncErrorHandler(userManagementController.deleteUser)
);

/**
 * User Communication
 */

// Send notification to user
router.post(
  '/users/:id/notifications',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'USER_ADMIN', 'SUPPORT_ADMIN']),
  asyncErrorHandler(userManagementController.updateUser)
);

// Send email to user
router.post(
  '/users/:id/emails',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'USER_ADMIN', 'SUPPORT_ADMIN']),
  asyncErrorHandler(userManagementController.updateUser)
);

// Send SMS to user
router.post(
  '/users/:id/sms',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'USER_ADMIN', 'SUPPORT_ADMIN']),
  asyncErrorHandler(userManagementController.updateUser)
);

/**
 * User Notes and Comments
 */

// Add note to user
router.post(
  '/users/:id/notes',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'USER_ADMIN', 'SUPPORT_ADMIN']),
  asyncErrorHandler(userManagementController.updateUser)
);

// Get user notes
router.get(
  '/users/:id/notes',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'USER_ADMIN', 'SUPPORT_ADMIN']),
  asyncErrorHandler(userManagementController.getUser)
);

// Update user note
router.put(
  '/users/:id/notes/:noteId',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'USER_ADMIN']),
  asyncErrorHandler(userManagementController.updateUser)
);

// Delete user note
router.delete(
  '/users/:id/notes/:noteId',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN']),
  asyncErrorHandler(userManagementController.updateUser)
);

/**
 * User Tags and Labels
 */

// Add tag to user
router.post(
  '/users/:id/tags',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'USER_ADMIN']),
  asyncErrorHandler(userManagementController.updateUser)
);

// Remove tag from user
router.delete(
  '/users/:id/tags/:tagId',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'USER_ADMIN']),
  asyncErrorHandler(userManagementController.updateUser)
);

// Get users by tag
router.get(
  '/users/tagged/:tagName',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'USER_ADMIN']),
  asyncErrorHandler(userManagementController.listUsers)
);

/**
 * User Relationships
 */

// Link users
router.post(
  '/users/:id/relationships',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'USER_ADMIN']),
  asyncErrorHandler(userManagementController.updateUser)
);

// Unlink users
router.delete(
  '/users/:id/relationships/:relationshipId',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'USER_ADMIN']),
  asyncErrorHandler(userManagementController.updateUser)
);

// Get user relationships
router.get(
  '/users/:id/relationships',
  authorize(['SUPER_ADMIN', 'PLATFORM_ADMIN', 'USER_ADMIN']),
  asyncErrorHandler(userManagementController.getUser)
);

/**
 * Error handling middleware
 */
router.use((error, req, res, next) => {
  logger.error('User management route error:', error);
  
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
 * This router handles all platform user management operations including:
 * - User CRUD operations
 * - Bulk operations
 * - Import/export functionality
 * - Statistics and analytics
 * - Email and account verification
 * - Password management
 * - Two-factor authentication
 * - User preferences and profiles
 * - Status management
 * - Organization management
 * - Session management
 * - Permission and role management
 * - Audit and compliance
 * - Data validation
 * - Advanced search and filtering
 * - User type specific operations
 * - Reporting
 * - User lifecycle management
 * - Data privacy and GDPR compliance
 * - User communication
 * - Notes and tagging
 * - User relationships
 * 
 * All routes require authentication and appropriate authorization.
 * Rate limiting prevents abuse of sensitive operations.
 * File upload support for import operations.
 * Comprehensive error handling for all operations.
 */