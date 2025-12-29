/**
 * @fileoverview Admin Session Routes
 * @module servers/admin-server/modules/user-management-system/sessions/routes
 * @description Class-based route definitions for session management endpoints
 * @version 1.0.0
 */

'use strict';

const express = require('express');
const AdminSessionController = require('../controllers/admin-session-controller');
const { authenticate } = require('../../../../middleware/auth-middleware');
const { authorize } = require('../../../../middleware/authorization-middleware');

/**
 * Session Routes Class
 * @class SessionRoutes
 * @description Manages all session management routes
 */
class SessionRoutes {
  /**
   * @private
   * @static
   * @type {express.Router}
   */
  static #router = express.Router();

  /**
   * Initialize and configure all session management routes
   * @returns {express.Router} Configured Express router
   * @static
   * @public
   */
  static configure() {
    // All routes require authentication
    this.#router.use(authenticate);

    /**
     * @route GET /api/admin/sessions/stats
     * @description Get session statistics
     * @access Protected - requires 'sessions:read' permission
     */
    this.#router.get(
      '/stats',
      authorize(['sessions:read']),
      AdminSessionController.getSessionStats
    );

    /**
     * @route POST /api/admin/sessions/revoke-user-sessions
     * @description Revoke all sessions for a user
     * @access Protected - requires 'sessions:delete' permission
     */
    this.#router.post(
      '/revoke-user-sessions',
      authorize(['sessions:delete']),
      AdminSessionController.revokeAllUserSessions
    );

    /**
     * @route GET /api/admin/sessions/user/:userId
     * @description Get all sessions for specific user
     * @access Protected - requires 'sessions:read' permission
     */
    this.#router.get(
      '/user/:userId',
      authorize(['sessions:read']),
      AdminSessionController.getUserSessions
    );

    /**
     * @route GET /api/admin/sessions
     * @description Get all active sessions
     * @access Protected - requires 'sessions:read' permission
     */
    this.#router.get(
      '/',
      authorize(['sessions:read']),
      AdminSessionController.getAllSessions
    );

    /**
     * @route GET /api/admin/sessions/:sessionId
     * @description Get session by ID
     * @access Protected - requires 'sessions:read' permission
     */
    this.#router.get(
      '/:sessionId',
      authorize(['sessions:read']),
      AdminSessionController.getSessionById
    );

    /**
     * @route DELETE /api/admin/sessions/:sessionId
     * @description Revoke session
     * @access Protected - requires 'sessions:delete' permission
     */
    this.#router.delete(
      '/:sessionId',
      authorize(['sessions:delete']),
      AdminSessionController.revokeSession
    );

    /**
     * @route POST /api/admin/sessions/:sessionId/mark-suspicious
     * @description Mark session as suspicious
     * @access Protected - requires 'sessions:update' permission
     */
    this.#router.post(
      '/:sessionId/mark-suspicious',
      authorize(['sessions:update']),
      AdminSessionController.markSessionSuspicious
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

module.exports = SessionRoutes;
