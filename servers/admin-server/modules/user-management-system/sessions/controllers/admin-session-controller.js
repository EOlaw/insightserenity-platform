/**
 * @fileoverview Admin Session Controller (UI Management)
 * @module servers/admin-server/modules/user-management-system/sessions/controllers
 * @description Class-based controller for viewing and managing active sessions from admin UI
 * @version 1.0.0
 */

'use strict';

const { getLogger } = require('../../../../../../shared/lib/utils/logger');
const { AppError } = require('../../../../../../shared/lib/utils/app-error');
const AdminSession = require('../../../../../../shared/lib/database/models/admin-server/admin-session');
const AdminAuditLog = require('../../../../../../shared/lib/database/models/admin-server/admin-audit-log');
const SessionService = require('../services/session-service');

const logger = getLogger({ serviceName: 'admin-session-controller' });

/**
 * Admin Session Controller Class (for UI management)
 * @class AdminSessionController
 * @description Handles HTTP requests for session monitoring and management
 */
class AdminSessionController {
  /**
   * Get all active sessions (admin view)
   * @route GET /api/admin/sessions
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   * @static
   * @public
   */
  static async getAllSessions(req, res, next) {
    try {
      const {
        page = 1,
        limit = 50,
        userId,
        isActive,
        isSuspicious
      } = req.query;

      // Build filter
      const filter = {};
      if (userId) filter.adminUser = userId;
      if (isActive !== undefined) filter.isActive = isActive === 'true';
      if (isSuspicious !== undefined) filter.isSuspicious = isSuspicious === 'true';

      // Pagination
      const skip = (parseInt(page) - 1) * parseInt(limit);

      // Execute query
      const [sessions, total] = await Promise.all([
        AdminSession.find(filter)
          .populate('adminUser', 'firstName lastName email role')
          .skip(skip)
          .limit(parseInt(limit))
          .sort({ lastActivity: -1 })
          .lean(),
        AdminSession.countDocuments(filter)
      ]);

      // Log action
      await AdminAuditLog.create({
        adminUser: req.user.id,
        action: 'sessions.list',
        resourceType: 'admin_session',
        status: 'success',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      res.status(200).json({
        success: true,
        data: {
          sessions,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(total / parseInt(limit)),
            totalItems: total,
            itemsPerPage: parseInt(limit)
          }
        }
      });
    } catch (error) {
      logger.error('Get all sessions failed', { error: error.message });
      next(error);
    }
  }

  /**
   * Get session by ID
   * @route GET /api/admin/sessions/:sessionId
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   * @static
   * @public
   */
  static async getSessionById(req, res, next) {
    try {
      const { sessionId } = req.params;

      const session = await AdminSession.findById(sessionId)
        .populate('adminUser', 'firstName lastName email role department')
        .lean();

      if (!session) {
        throw new AppError('Session not found', 404, 'SESSION_NOT_FOUND');
      }

      // Log action
      await AdminAuditLog.create({
        adminUser: req.user.id,
        action: 'sessions.view',
        resourceType: 'admin_session',
        resourceId: sessionId,
        status: 'success',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      res.status(200).json({
        success: true,
        data: { session }
      });
    } catch (error) {
      logger.error('Get session by ID failed', { error: error.message, sessionId: req.params.sessionId });
      next(error);
    }
  }

  /**
   * Revoke session (admin action)
   * @route DELETE /api/admin/sessions/:sessionId
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   * @static
   * @public
   */
  static async revokeSession(req, res, next) {
    try {
      const { sessionId } = req.params;
      const { reason = 'admin_revoked' } = req.body;

      // Find session
      const session = await AdminSession.findById(sessionId);
      if (!session) {
        throw new AppError('Session not found', 404, 'SESSION_NOT_FOUND');
      }

      // Revoke using service
      await SessionService.revokeSession(session.sessionId, reason);

      // Log action
      await AdminAuditLog.create({
        adminUser: req.user.id,
        action: 'sessions.revoke',
        resourceType: 'admin_session',
        resourceId: sessionId,
        status: 'success',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { reason, targetUserId: session.adminUser.toString() }
      });

      logger.info('Session revoked by admin', { sessionId, revokedBy: req.user.id });

      res.status(200).json({
        success: true,
        message: 'Session revoked successfully'
      });
    } catch (error) {
      logger.error('Revoke session failed', { error: error.message, sessionId: req.params.sessionId });
      next(error);
    }
  }

  /**
   * Revoke all sessions for a user (admin action)
   * @route POST /api/admin/sessions/revoke-user-sessions
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   * @static
   * @public
   */
  static async revokeAllUserSessions(req, res, next) {
    try {
      const { userId, reason = 'admin_revoked_all' } = req.body;

      if (!userId) {
        throw new AppError('User ID is required', 400, 'MISSING_USER_ID');
      }

      // Revoke all sessions
      const count = await SessionService.revokeAllUserSessions(userId, reason);

      // Log action
      await AdminAuditLog.create({
        adminUser: req.user.id,
        action: 'sessions.revoke_all',
        resourceType: 'admin_session',
        status: 'success',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { reason, targetUserId: userId, sessionsRevoked: count }
      });

      logger.info('All user sessions revoked by admin', { userId, count, revokedBy: req.user.id });

      res.status(200).json({
        success: true,
        message: `${count} session(s) revoked successfully`,
        data: { sessionsRevoked: count }
      });
    } catch (error) {
      logger.error('Revoke all user sessions failed', { error: error.message });
      next(error);
    }
  }

  /**
   * Get session statistics
   * @route GET /api/admin/sessions/stats
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   * @static
   * @public
   */
  static async getSessionStats(req, res, next) {
    try {
      const [activeSessions, suspiciousSessions, mfaVerifiedSessions, totalSessions] = await Promise.all([
        AdminSession.countDocuments({ isActive: true }),
        AdminSession.countDocuments({ isSuspicious: true, isActive: true }),
        AdminSession.countDocuments({ isMfaVerified: true, isActive: true }),
        AdminSession.countDocuments({})
      ]);

      // Get sessions by device type
      const deviceBreakdown = await AdminSession.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: '$deviceInfo.deviceType', count: { $sum: 1 } } }
      ]);

      // Get sessions by location (top 5 countries)
      const locationBreakdown = await AdminSession.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: '$location.country', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 }
      ]);

      res.status(200).json({
        success: true,
        data: {
          stats: {
            activeSessions,
            suspiciousSessions,
            mfaVerifiedSessions,
            totalSessions,
            deviceBreakdown,
            locationBreakdown
          }
        }
      });
    } catch (error) {
      logger.error('Get session stats failed', { error: error.message });
      next(error);
    }
  }

  /**
   * Mark session as suspicious
   * @route POST /api/admin/sessions/:sessionId/mark-suspicious
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   * @static
   * @public
   */
  static async markSessionSuspicious(req, res, next) {
    try {
      const { sessionId } = req.params;
      const { reason } = req.body;

      // Find session
      const session = await AdminSession.findById(sessionId);
      if (!session) {
        throw new AppError('Session not found', 404, 'SESSION_NOT_FOUND');
      }

      // Mark as suspicious
      session.isSuspicious = true;
      if (reason) {
        session.suspiciousActivityDetails = session.suspiciousActivityDetails || [];
        session.suspiciousActivityDetails.push({
          timestamp: new Date(),
          reason,
          markedBy: req.user.id
        });
      }
      await session.save();

      // Log action
      await AdminAuditLog.create({
        adminUser: req.user.id,
        action: 'sessions.mark_suspicious',
        resourceType: 'admin_session',
        resourceId: sessionId,
        status: 'success',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { reason }
      });

      logger.warn('Session marked as suspicious', { sessionId, reason, markedBy: req.user.id });

      res.status(200).json({
        success: true,
        message: 'Session marked as suspicious'
      });
    } catch (error) {
      logger.error('Mark session suspicious failed', { error: error.message, sessionId: req.params.sessionId });
      next(error);
    }
  }

  /**
   * Get active sessions for specific user
   * @route GET /api/admin/sessions/user/:userId
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   * @static
   * @public
   */
  static async getUserSessions(req, res, next) {
    try {
      const { userId } = req.params;

      const sessions = await SessionService.getUserActiveSessions(userId);

      res.status(200).json({
        success: true,
        data: {
          sessions,
          count: sessions.length
        }
      });
    } catch (error) {
      logger.error('Get user sessions failed', { error: error.message, userId: req.params.userId });
      next(error);
    }
  }
}

module.exports = AdminSessionController;
