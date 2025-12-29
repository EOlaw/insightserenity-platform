/**
 * @fileoverview Admin Permission Routes
 * @module servers/admin-server/modules/user-management-system/permissions/routes
 * @description Class-based route definitions for permission management endpoints
 * @version 1.0.0
 */

'use strict';

const express = require('express');
const AdminPermissionController = require('../controllers/admin-permission-controller');
const { authenticate } = require('../../../../middleware/auth-middleware');
const { authorize } = require('../../../../middleware/authorization-middleware');

/**
 * Permission Routes Class
 * @class PermissionRoutes
 * @description Manages all permission management routes
 */
class PermissionRoutes {
  /**
   * @private
   * @static
   * @type {express.Router}
   */
  static #router = express.Router();

  /**
   * Initialize and configure all permission management routes
   * @returns {express.Router} Configured Express router
   * @static
   * @public
   */
  static configure() {
    // All routes require authentication
    this.#router.use(authenticate);

    /**
     * @route GET /api/admin/permissions/resources
     * @description Get all available resources
     * @access Protected - requires 'permissions:read' permission
     */
    this.#router.get(
      '/resources',
      authorize(['permissions:read']),
      AdminPermissionController.getResources
    );

    /**
     * @route GET /api/admin/permissions/actions
     * @description Get all available actions
     * @access Protected - requires 'permissions:read' permission
     */
    this.#router.get(
      '/actions',
      authorize(['permissions:read']),
      AdminPermissionController.getActions
    );

    /**
     * @route POST /api/admin/permissions/bulk
     * @description Bulk create permissions
     * @access Protected - requires 'permissions:create' permission
     */
    this.#router.post(
      '/bulk',
      authorize(['permissions:create']),
      AdminPermissionController.bulkCreatePermissions
    );

    /**
     * @route GET /api/admin/permissions
     * @description Get all permissions
     * @access Protected - requires 'permissions:read' permission
     */
    this.#router.get(
      '/',
      authorize(['permissions:read']),
      AdminPermissionController.getAllPermissions
    );

    /**
     * @route POST /api/admin/permissions
     * @description Create new permission
     * @access Protected - requires 'permissions:create' permission
     */
    this.#router.post(
      '/',
      authorize(['permissions:create']),
      AdminPermissionController.createPermission
    );

    /**
     * @route GET /api/admin/permissions/:permissionId
     * @description Get permission by ID
     * @access Protected - requires 'permissions:read' permission
     */
    this.#router.get(
      '/:permissionId',
      authorize(['permissions:read']),
      AdminPermissionController.getPermissionById
    );

    /**
     * @route PATCH /api/admin/permissions/:permissionId
     * @description Update permission
     * @access Protected - requires 'permissions:update' permission
     */
    this.#router.patch(
      '/:permissionId',
      authorize(['permissions:update']),
      AdminPermissionController.updatePermission
    );

    /**
     * @route DELETE /api/admin/permissions/:permissionId
     * @description Delete permission
     * @access Protected - requires 'permissions:delete' permission
     */
    this.#router.delete(
      '/:permissionId',
      authorize(['permissions:delete']),
      AdminPermissionController.deletePermission
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

module.exports = PermissionRoutes;
