/**
 * @fileoverview Admin Role Routes
 * @module servers/admin-server/modules/user-management-system/roles/routes
 * @description Class-based route definitions for role management endpoints
 * @version 1.0.0
 */

'use strict';

const express = require('express');
const AdminRoleController = require('../controllers/admin-role-controller');
const { authenticate } = require('../../../../middleware/auth-middleware');
const { authorize } = require('../../../../middleware/authorization-middleware');

/**
 * Role Routes Class
 * @class RoleRoutes
 * @description Manages all role management routes
 */
class RoleRoutes {
  /**
   * @private
   * @static
   * @type {express.Router}
   */
  static #router = express.Router();

  /**
   * Initialize and configure all role management routes
   * @returns {express.Router} Configured Express router
   * @static
   * @public
   */
  static configure() {
    // All routes require authentication
    this.#router.use(authenticate);

    /**
     * @route GET /api/admin/roles
     * @description Get all roles
     * @access Protected - requires 'roles:read' permission
     */
    this.#router.get(
      '/',
      authorize(['roles:read']),
      AdminRoleController.getAllRoles
    );

    /**
     * @route POST /api/admin/roles
     * @description Create new role
     * @access Protected - requires 'roles:create' permission
     */
    this.#router.post(
      '/',
      authorize(['roles:create']),
      AdminRoleController.createRole
    );

    /**
     * @route GET /api/admin/roles/:roleId
     * @description Get role by ID
     * @access Protected - requires 'roles:read' permission
     */
    this.#router.get(
      '/:roleId',
      authorize(['roles:read']),
      AdminRoleController.getRoleById
    );

    /**
     * @route PATCH /api/admin/roles/:roleId
     * @description Update role
     * @access Protected - requires 'roles:update' permission
     */
    this.#router.patch(
      '/:roleId',
      authorize(['roles:update']),
      AdminRoleController.updateRole
    );

    /**
     * @route DELETE /api/admin/roles/:roleId
     * @description Delete role
     * @access Protected - requires 'roles:delete' permission
     */
    this.#router.delete(
      '/:roleId',
      authorize(['roles:delete']),
      AdminRoleController.deleteRole
    );

    /**
     * @route GET /api/admin/roles/:roleId/permissions
     * @description Get role permissions (direct + inherited)
     * @access Protected - requires 'roles:read' permission
     */
    this.#router.get(
      '/:roleId/permissions',
      authorize(['roles:read']),
      AdminRoleController.getRolePermissions
    );

    /**
     * @route POST /api/admin/roles/:roleId/permissions
     * @description Add permissions to role
     * @access Protected - requires 'roles:update' permission
     */
    this.#router.post(
      '/:roleId/permissions',
      authorize(['roles:update']),
      AdminRoleController.addPermissionsToRole
    );

    /**
     * @route DELETE /api/admin/roles/:roleId/permissions
     * @description Remove permissions from role
     * @access Protected - requires 'roles:update' permission
     */
    this.#router.delete(
      '/:roleId/permissions',
      authorize(['roles:update']),
      AdminRoleController.removePermissionsFromRole
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

module.exports = RoleRoutes;
