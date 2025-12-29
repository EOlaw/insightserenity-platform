/**
 * @fileoverview Admin Invitation Routes
 * @module servers/admin-server/modules/user-management-system/invitations/routes
 * @description Class-based route definitions for invitation management endpoints
 * @version 1.0.0
 */

'use strict';

const express = require('express');
const AdminInvitationController = require('../controllers/admin-invitation-controller');
const { authenticate } = require('../../../../middleware/auth-middleware');
const { authorize } = require('../../../../middleware/authorization-middleware');

/**
 * Invitation Routes Class
 * @class InvitationRoutes
 * @description Manages all invitation management routes
 */
class InvitationRoutes {
  /**
   * @private
   * @static
   * @type {express.Router}
   */
  static #router = express.Router();

  /**
   * Initialize and configure all invitation management routes
   * @returns {express.Router} Configured Express router
   * @static
   * @public
   */
  static configure() {
    /**
     * @route POST /api/admin/invitations/:token/accept
     * @description Accept invitation (public endpoint - no auth required)
     * @access Public
     */
    this.#router.post(
      '/:token/accept',
      AdminInvitationController.acceptInvitation
    );

    // All other routes require authentication
    this.#router.use(authenticate);

    /**
     * @route GET /api/admin/invitations/stats
     * @description Get invitation statistics
     * @access Protected - requires 'invitations:read' permission
     */
    this.#router.get(
      '/stats',
      authorize(['invitations:read']),
      AdminInvitationController.getInvitationStats
    );

    /**
     * @route GET /api/admin/invitations
     * @description Get all invitations
     * @access Protected - requires 'invitations:read' permission
     */
    this.#router.get(
      '/',
      authorize(['invitations:read']),
      AdminInvitationController.getAllInvitations
    );

    /**
     * @route POST /api/admin/invitations
     * @description Send invitation
     * @access Protected - requires 'invitations:create' permission
     */
    this.#router.post(
      '/',
      authorize(['invitations:create']),
      AdminInvitationController.sendInvitation
    );

    /**
     * @route GET /api/admin/invitations/:invitationId
     * @description Get invitation by ID
     * @access Protected - requires 'invitations:read' permission
     */
    this.#router.get(
      '/:invitationId',
      authorize(['invitations:read']),
      AdminInvitationController.getInvitationById
    );

    /**
     * @route POST /api/admin/invitations/:invitationId/resend
     * @description Resend invitation
     * @access Protected - requires 'invitations:create' permission
     */
    this.#router.post(
      '/:invitationId/resend',
      authorize(['invitations:create']),
      AdminInvitationController.resendInvitation
    );

    /**
     * @route DELETE /api/admin/invitations/:invitationId
     * @description Revoke invitation
     * @access Protected - requires 'invitations:delete' permission
     */
    this.#router.delete(
      '/:invitationId',
      authorize(['invitations:delete']),
      AdminInvitationController.revokeInvitation
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

module.exports = InvitationRoutes;
