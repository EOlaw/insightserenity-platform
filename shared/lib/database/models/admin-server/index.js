/**
 * @fileoverview Admin Server Models - Central Export
 * @module shared/lib/database/models/admin-server
 * @description Centralized export point for all admin server Mongoose models.
 *              Provides easy access to all admin-related models with consistent interface.
 * @version 1.0.0
 * @author InsightSerenity Team
 */

'use strict';

// Import all admin models
const AdminUser = require('./admin-user');
const AdminSession = require('./admin-session');
const AdminMFA = require('./admin-mfa');
const AdminAPIKey = require('./admin-api-key');
const AdminAuditLog = require('./admin-audit-log');
const AdminRole = require('./admin-role');
const AdminPermission = require('./admin-permission');
const AdminInvitation = require('./admin-invitation');

/**
 * Admin Server Models Object
 * @type {Object}
 * @property {Model} AdminUser - Admin user model with security features
 * @property {Model} AdminSession - Session management model
 * @property {Model} AdminMFA - Multi-factor authentication model
 * @property {Model} AdminAPIKey - API key management model
 * @property {Model} AdminAuditLog - Comprehensive audit logging model
 * @property {Model} AdminRole - Role-based access control model
 * @property {Model} AdminPermission - Granular permissions model
 * @property {Model} AdminInvitation - Admin user invitation model
 */
const adminModels = {
  AdminUser,
  AdminSession,
  AdminMFA,
  AdminAPIKey,
  AdminAuditLog,
  AdminRole,
  AdminPermission,
  AdminInvitation
};

/**
 * Export all models individually and as a collection
 */
module.exports = adminModels;

// Also export each model individually for direct imports
module.exports.AdminUser = AdminUser;
module.exports.AdminSession = AdminSession;
module.exports.AdminMFA = AdminMFA;
module.exports.AdminAPIKey = AdminAPIKey;
module.exports.AdminAuditLog = AdminAuditLog;
module.exports.AdminRole = AdminRole;
module.exports.AdminPermission = AdminPermission;
module.exports.AdminInvitation = AdminInvitation;
