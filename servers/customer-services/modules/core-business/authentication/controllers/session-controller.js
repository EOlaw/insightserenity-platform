/**
 * @fileoverview Session Management Controller
 * @module servers/customer-services/modules/core-business/authentication/controllers/session-controller
 * @description Handles HTTP requests for session management operations
 * @version 1.0.0
 */

const logger = require('../../../../../../shared/lib/utils/logger');
const { AppError } = require('../../../../../../shared/lib/utils/app-error');

/**
 * Session Controller
 * Handles all session management HTTP requests
 * @class SessionController
 */
class SessionController {
    /**
     * List active sessions for current user
     * @route GET /api/auth/sessions
     * @access Protected
     */
    async listActiveSessions(req, res, next) {
        try {
            const userId = req.user.id;
            const tenantId = req.user.tenantId;
            const currentSessionId = req.session.id || req.headers['x-session-id'];

            // Call shared session service to get all active sessions
            const SessionService = require('../../../../../../shared/lib/auth/services/session-service');
            const sessions = await SessionService.getActiveSessions(userId, tenantId);

            // Format sessions with additional metadata
            const formattedSessions = sessions.map(session => ({
                id: session.id,
                deviceInfo: {
                    userAgent: session.userAgent,
                    browser: session.browser,
                    os: session.os,
                    device: session.device
                },
                location: {
                    ip: session.ip,
                    country: session.country,
                    city: session.city
                },
                createdAt: session.createdAt,
                lastActivity: session.lastActivity,
                expiresAt: session.expiresAt,
                isCurrent: session.id === currentSessionId,
                isActive: session.isActive
            }));

            logger.debug('Active sessions retrieved', {
                userId,
                tenantId,
                sessionCount: formattedSessions.length
            });

            res.status(200).json({
                success: true,
                message: 'Active sessions retrieved successfully',
                data: {
                    sessions: formattedSessions,
                    total: formattedSessions.length,
                    currentSessionId: currentSessionId
                }
            });

        } catch (error) {
            logger.error('List active sessions failed', {
                error: error.message,
                stack: error.stack
            });
            next(error);
        }
    }

    /**
     * Get specific session details
     * @route GET /api/auth/sessions/:sessionId
     * @access Protected
     */
    async getSessionDetails(req, res, next) {
        try {
            const userId = req.user.id;
            const tenantId = req.user.tenantId;
            const { sessionId } = req.params;

            if (!sessionId) {
                throw new AppError('Session ID is required', 400, 'MISSING_SESSION_ID');
            }

            // Call shared session service to get session details
            const SessionService = require('../../../../../../shared/lib/auth/services/session-service');
            const session = await SessionService.getSession(sessionId, userId, tenantId);

            if (!session) {
                throw new AppError('Session not found', 404, 'SESSION_NOT_FOUND');
            }

            // Verify session belongs to user
            if (session.userId !== userId) {
                throw new AppError('Access denied', 403, 'SESSION_ACCESS_DENIED');
            }

            const currentSessionId = req.session.id || req.headers['x-session-id'];

            logger.debug('Session details retrieved', {
                userId,
                tenantId,
                sessionId
            });

            res.status(200).json({
                success: true,
                message: 'Session details retrieved successfully',
                data: {
                    id: session.id,
                    deviceInfo: {
                        userAgent: session.userAgent,
                        browser: session.browser,
                        os: session.os,
                        device: session.device
                    },
                    location: {
                        ip: session.ip,
                        country: session.country,
                        city: session.city
                    },
                    createdAt: session.createdAt,
                    lastActivity: session.lastActivity,
                    expiresAt: session.expiresAt,
                    isCurrent: session.id === currentSessionId,
                    activityHistory: session.activityHistory || []
                }
            });

        } catch (error) {
            logger.error('Get session details failed', {
                error: error.message,
                stack: error.stack
            });
            next(error);
        }
    }

    /**
     * Terminate specific session
     * @route DELETE /api/auth/sessions/:sessionId
     * @access Protected
     */
    async terminateSession(req, res, next) {
        try {
            const userId = req.user.id;
            const tenantId = req.user.tenantId;
            const { sessionId } = req.params;
            const currentSessionId = req.session.id || req.headers['x-session-id'];

            if (!sessionId) {
                throw new AppError('Session ID is required', 400, 'MISSING_SESSION_ID');
            }

            // Prevent terminating current session (use logout instead)
            if (sessionId === currentSessionId) {
                throw new AppError(
                    'Cannot terminate current session. Use logout endpoint instead.',
                    400,
                    'CANNOT_TERMINATE_CURRENT_SESSION'
                );
            }

            // Call shared session service to terminate session
            const SessionService = require('../../../../../../shared/lib/auth/services/session-service');
            await SessionService.terminateSession(sessionId, userId, tenantId);

            logger.info('Session terminated', {
                userId,
                tenantId,
                sessionId
            });

            res.status(200).json({
                success: true,
                message: 'Session terminated successfully',
                data: {
                    sessionId: sessionId,
                    terminated: true,
                    terminatedAt: new Date().toISOString()
                }
            });

        } catch (error) {
            logger.error('Terminate session failed', {
                error: error.message,
                stack: error.stack
            });
            next(error);
        }
    }

    /**
     * Terminate all sessions except current
     * @route DELETE /api/auth/sessions
     * @access Protected
     */
    async terminateAllSessions(req, res, next) {
        try {
            const userId = req.user.id;
            const tenantId = req.user.tenantId;
            const currentSessionId = req.session.id || req.headers['x-session-id'];
            const { includeCurrentSession } = req.query;

            // Call shared session service to terminate all sessions
            const SessionService = require('../../../../../../shared/lib/auth/services/session-service');
            const result = await SessionService.terminateAllSessions(
                userId,
                tenantId,
                {
                    excludeSessionId: includeCurrentSession === 'true' ? null : currentSessionId
                }
            );

            // If current session was also terminated, clear cookies
            if (includeCurrentSession === 'true') {
                res.clearCookie('refreshToken');
            }

            logger.info('All sessions terminated', {
                userId,
                tenantId,
                sessionsTerminated: result.count,
                includedCurrentSession: includeCurrentSession === 'true'
            });

            res.status(200).json({
                success: true,
                message: 'All sessions terminated successfully',
                data: {
                    sessionsTerminated: result.count,
                    currentSessionTerminated: includeCurrentSession === 'true',
                    terminatedAt: new Date().toISOString()
                }
            });

        } catch (error) {
            logger.error('Terminate all sessions failed', {
                error: error.message,
                stack: error.stack
            });
            next(error);
        }
    }

    /**
     * Get session statistics
     * @route GET /api/auth/sessions/stats
     * @access Protected
     */
    async getSessionStatistics(req, res, next) {
        try {
            const userId = req.user.id;
            const tenantId = req.user.tenantId;

            // Call shared session service to get statistics
            const SessionService = require('../../../../../../shared/lib/auth/services/session-service');
            const stats = await SessionService.getSessionStatistics(userId, tenantId);

            logger.debug('Session statistics retrieved', {
                userId,
                tenantId
            });

            res.status(200).json({
                success: true,
                message: 'Session statistics retrieved successfully',
                data: {
                    activeSessions: stats.activeSessions || 0,
                    totalSessions: stats.totalSessions || 0,
                    lastLoginAt: stats.lastLoginAt,
                    lastLoginIp: stats.lastLoginIp,
                    lastLoginLocation: stats.lastLoginLocation,
                    deviceBreakdown: stats.deviceBreakdown || {},
                    browserBreakdown: stats.browserBreakdown || {},
                    locationBreakdown: stats.locationBreakdown || {},
                    averageSessionDuration: stats.averageSessionDuration,
                    longestSession: stats.longestSession
                }
            });

        } catch (error) {
            logger.error('Get session statistics failed', {
                error: error.message,
                stack: error.stack
            });
            next(error);
        }
    }

    /**
     * Refresh session activity
     * @route POST /api/auth/sessions/refresh-activity
     * @access Protected
     */
    async refreshSessionActivity(req, res, next) {
        try {
            const userId = req.user.id;
            const tenantId = req.user.tenantId;
            const sessionId = req.session.id || req.headers['x-session-id'];

            if (!sessionId) {
                throw new AppError('Session ID not found', 400, 'MISSING_SESSION_ID');
            }

            // Call shared session service to update activity
            const SessionService = require('../../../../../../shared/lib/auth/services/session-service');
            await SessionService.updateSessionActivity(sessionId, userId, tenantId);

            logger.debug('Session activity refreshed', {
                userId,
                tenantId,
                sessionId
            });

            res.status(200).json({
                success: true,
                message: 'Session activity refreshed',
                data: {
                    sessionId: sessionId,
                    lastActivity: new Date().toISOString()
                }
            });

        } catch (error) {
            logger.error('Refresh session activity failed', {
                error: error.message,
                stack: error.stack
            });
            next(error);
        }
    }

    /**
     * Report suspicious session
     * @route POST /api/auth/sessions/:sessionId/report
     * @access Protected
     */
    async reportSuspiciousSession(req, res, next) {
        try {
            const userId = req.user.id;
            const tenantId = req.user.tenantId;
            const { sessionId } = req.params;
            const { reason, additionalInfo } = req.body;

            if (!sessionId) {
                throw new AppError('Session ID is required', 400, 'MISSING_SESSION_ID');
            }

            if (!reason) {
                throw new AppError('Reason is required', 400, 'MISSING_REASON');
            }

            // Call shared session service to report session
            const SessionService = require('../../../../../../shared/lib/auth/services/session-service');
            await SessionService.reportSuspiciousSession(sessionId, userId, {
                reason: reason,
                additionalInfo: additionalInfo,
                reportedAt: new Date().toISOString(),
                tenantId: tenantId
            });

            // Optionally terminate the session immediately
            if (req.body.terminateImmediately) {
                await SessionService.terminateSession(sessionId, userId, tenantId);
            }

            logger.warn('Suspicious session reported', {
                userId,
                tenantId,
                sessionId,
                reason,
                terminated: req.body.terminateImmediately || false
            });

            res.status(200).json({
                success: true,
                message: 'Session reported successfully',
                data: {
                    sessionId: sessionId,
                    reported: true,
                    terminated: req.body.terminateImmediately || false,
                    reportedAt: new Date().toISOString()
                }
            });

        } catch (error) {
            logger.error('Report suspicious session failed', {
                error: error.message,
                stack: error.stack
            });
            next(error);
        }
    }
}

// Export singleton instance
module.exports = new SessionController();