/**
 * @fileoverview User Management System Routes Aggregator
 * @module servers/admin-server/modules/user-management-system/routes
 * @description Aggregates and exports all user management system routes
 * @version 1.0.0
 */

'use strict';

const express = require('express');
const router = express.Router();

const { getLogger } = require('../../../../../shared/lib/utils/logger');
const logger = getLogger({ serviceName: 'user-management-routes' });

// ============================================================================
// Import Route Modules
// ============================================================================

const AuthRoutes = require('../authentication/routes/auth-routes');
const UserRoutes = require('../users/routes/user-routes');
const RoleRoutes = require('../roles/routes/role-routes');
const PermissionRoutes = require('../permissions/routes/permission-routes');
const InvitationRoutes = require('../invitations/routes/invitation-routes');
const SessionRoutes = require('../sessions/routes/session-routes');

// ============================================================================
// Mount Routes
// ============================================================================

/**
 * Authentication Routes
 * @route /api/v1/admin/users/auth/*
 * Handles login, logout, token refresh, MFA, password management
 */
router.use('/auth', AuthRoutes.getRouter());
logger.debug('Mounted authentication routes at /auth');

/**
 * User Management Routes
 * @route /api/v1/admin/users/accounts/*
 * Handles CRUD operations for admin users
 */
router.use('/accounts', UserRoutes.getRouter());
logger.debug('Mounted user routes at /accounts');

/**
 * Role Management Routes
 * @route /api/v1/admin/users/roles/*
 * Handles CRUD operations for roles and role permissions
 */
router.use('/roles', RoleRoutes.getRouter());
logger.debug('Mounted role routes at /roles');

/**
 * Permission Management Routes
 * @route /api/v1/admin/users/permissions/*
 * Handles CRUD operations for permissions
 */
router.use('/permissions', PermissionRoutes.getRouter());
logger.debug('Mounted permission routes at /permissions');

/**
 * Invitation Management Routes
 * @route /api/v1/admin/users/invitations/*
 * Handles admin user invitations
 */
router.use('/invitations', InvitationRoutes.getRouter());
logger.debug('Mounted invitation routes at /invitations');

/**
 * Session Management Routes
 * @route /api/v1/admin/users/sessions/*
 * Handles admin session monitoring and management
 */
router.use('/sessions', SessionRoutes.getRouter());
logger.debug('Mounted session routes at /sessions');

// ============================================================================
// Health Check for User Management System
// ============================================================================

/**
 * @route   GET /api/v1/admin/users
 * @desc    Get user management system information
 * @access  Public
 */
router.get('/', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'User Management System API',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        availableRoutes: [
            {
                path: '/auth',
                description: 'Authentication and authorization',
                endpoints: [
                    'POST /auth/login',
                    'POST /auth/logout',
                    'POST /auth/refresh-token',
                    'POST /auth/setup-mfa',
                    'POST /auth/verify-mfa',
                    'POST /auth/forgot-password',
                    'POST /auth/reset-password',
                    'POST /auth/change-password'
                ]
            },
            {
                path: '/accounts',
                description: 'Admin user account management',
                endpoints: [
                    'GET /accounts',
                    'POST /accounts',
                    'GET /accounts/:userId',
                    'PATCH /accounts/:userId',
                    'DELETE /accounts/:userId',
                    'GET /accounts/:userId/activity',
                    'PATCH /accounts/:userId/activate',
                    'PATCH /accounts/:userId/deactivate'
                ]
            },
            {
                path: '/roles',
                description: 'Role management and permissions',
                endpoints: [
                    'GET /roles',
                    'POST /roles',
                    'GET /roles/:roleId',
                    'PATCH /roles/:roleId',
                    'DELETE /roles/:roleId',
                    'GET /roles/:roleId/permissions',
                    'POST /roles/:roleId/permissions',
                    'DELETE /roles/:roleId/permissions'
                ]
            },
            {
                path: '/permissions',
                description: 'Permission management',
                endpoints: [
                    'GET /permissions',
                    'POST /permissions',
                    'GET /permissions/:permissionId',
                    'PATCH /permissions/:permissionId',
                    'DELETE /permissions/:permissionId',
                    'GET /permissions/resources',
                    'GET /permissions/actions',
                    'POST /permissions/bulk'
                ]
            },
            {
                path: '/invitations',
                description: 'Admin user invitation system',
                endpoints: [
                    'GET /invitations',
                    'POST /invitations',
                    'GET /invitations/:invitationId',
                    'POST /invitations/:invitationId/resend',
                    'PATCH /invitations/:invitationId/revoke',
                    'POST /invitations/:token/accept',
                    'GET /invitations/stats'
                ]
            },
            {
                path: '/sessions',
                description: 'Session monitoring and management',
                endpoints: [
                    'GET /sessions',
                    'GET /sessions/:sessionId',
                    'DELETE /sessions/:sessionId',
                    'DELETE /sessions/user/:userId',
                    'GET /sessions/stats',
                    'PATCH /sessions/:sessionId/mark-suspicious',
                    'GET /sessions/user/:userId'
                ]
            }
        ]
    });
});

module.exports = router;
