/**
 * @fileoverview Admin User Management Routes
 * @module servers/admin-server/modules/user-management-system/users/routes
 * @description Class-based route definitions for admin user management endpoints
 * @version 1.0.0
 */

'use strict';

const express = require('express');
const AdminUserController = require('../controllers/admin-user-controller');
const { authenticate } = require('../../../../middleware/auth-middleware');
const { authorize } = require('../../../../middleware/authorization-middleware');

/**
 * User Routes Class
 * @class UserRoutes
 * @description Manages all user management routes
 */
class UserRoutes {
  /**
   * @private
   * @static
   * @type {express.Router}
   */
  static #router = express.Router();

  /**
   * Initialize and configure all user management routes
   * @returns {express.Router} Configured Express router
   * @static
   * @public
   */
  static configure() {
    // All routes require authentication
    this.#router.use(authenticate);

    /**
     * @route GET /api/admin/users
     * @description Get all admin users with pagination and filtering
     * @access Protected - requires 'users:read' permission
     */
    this.#router.get(
      '/',
      authorize(['users:read']),
      AdminUserController.getAllUsers
    );

    /**
     * @route POST /api/admin/users
     * @description Create new admin user
     * @access Protected - requires 'users:create' permission
     */
    this.#router.post(
      '/',
      authorize(['users:create']),
      AdminUserController.createUser
    );

    /**
     * @route GET /api/admin/users/:userId
     * @description Get admin user by ID
     * @access Protected - requires 'users:read' permission
     */
    this.#router.get(
      '/:userId',
      authorize(['users:read']),
      AdminUserController.getUserById
    );

    /**
     * @route PATCH /api/admin/users/:userId
     * @description Update admin user
     * @access Protected - requires 'users:update' permission
     */
    this.#router.patch(
      '/:userId',
      authorize(['users:update']),
      AdminUserController.updateUser
    );

    /**
     * @route DELETE /api/admin/users/:userId
     * @description Delete (deactivate) admin user
     * @access Protected - requires 'users:delete' permission
     */
    this.#router.delete(
      '/:userId',
      authorize(['users:delete']),
      AdminUserController.deleteUser
    );

    /**
     * @route POST /api/admin/users/:userId/activate
     * @description Activate admin user
     * @access Protected - requires 'users:update' permission
     */
    this.#router.post(
      '/:userId/activate',
      authorize(['users:update']),
      AdminUserController.activateUser
    );

    /**
     * @route GET /api/admin/users/:userId/activity
     * @description Get user activity/audit logs
     * @access Protected - requires 'users:read' permission
     */
    this.#router.get(
      '/:userId/activity',
      authorize(['users:read']),
      AdminUserController.getUserActivity
    );

    /**
     * @route POST /api/admin/users/:userId/reset-password
     * @description Reset user password (admin action)
     * @access Protected - requires 'users:update' permission
     */
    this.#router.post(
      '/:userId/reset-password',
      authorize(['users:update']),
      AdminUserController.resetUserPassword
    );

    return this.#router;
  }

  /**
   * Get the configured router instance
   * @returns {express.Router} Express router
   * @static
   * @public
   */
  static getRouter() {
    return this.configure();
  }
}

module.exports = UserRoutes;
