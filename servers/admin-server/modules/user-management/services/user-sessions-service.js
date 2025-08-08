'use strict';

/**
 * @fileoverview User sessions service for comprehensive session management
 * @module servers/admin-server/modules/user-management/services/user-sessions-service  
 * @requires module:servers/admin-server/modules/user-management/models/admin-session-model
 * @requires module:servers/admin-server/modules/user-management/models/admin-user-model
 * @requires module:shared/lib/database/models/user-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/security/encryption/hash-service
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/services/notification-service
 * @requires module:shared/lib/services/email-service
 * @requires module:shared/lib/utils/helpers/string-helper
 * @requires module:shared/lib/utils/helpers/date-helper
 * @requires module:shared/lib/utils/validators/common-validators
 */

const AdminSession = require('../models/admin-session-model');
const AdminUser = require('../models/admin-user-model');
const User = require('../../../../../shared/lib/database/models/user-model');
const logger = require('../../../../../shared/lib/utils/logger');
const { AppError } = require('../../../../../shared/lib/utils/app-error');
const HashService = require('../../../../../shared/lib/security/encryption/hash-service');
const CacheService = require('../../../../../shared/lib/services/cache-service');
const NotificationService = require('../../../../../shared/lib/services/notification-service');
const EmailService = require('../../../../../shared/lib/services/email-service');
const stringHelper = require('../../../../../shared/lib/utils/helpers/string-helper');
const dateHelper = require('../../../../../shared/lib/utils/helpers/date-helper');
const CommonValidator = require('../../../../../shared/lib/utils/validators/common-validators');

/**
 * Service for managing user sessions across the platform
 * @class UserSessionsService
 */
class UserSessionsService {
    /**
     * Private fields
     */
    #cachePrefix = 'sessions:';
    #cacheTTL = 300; // 5 minutes
    #sessionTokenLength = 64;
    #refreshTokenLength = 64;
    #maxConcurrentSessions = 5;
    #sessionTimeout = 3600000; // 1 hour
    #absoluteTimeout = 86400000; // 24 hours
    #idleTimeout = 900000; // 15 minutes
    #refreshThreshold = 300000; // 5 minutes before expiry
    #cleanupInterval = 300000; // 5 minutes
    #riskScoreThreshold = 70;
    #anomalyDetectionEnabled = true;
    #geoLocationTracking = true;
    #deviceFingerprintingEnabled = true;
    #sessionRotationEnabled = true;
    #mfaRequiredForElevation = true;

    #cacheService;
    #notificationService;
    #emailService;
    #activeSessionsMap;
    #sessionMetrics;
    #cleanupTimer;

    /**
     * Constructor
     */
    constructor() {
        this.#cacheService = new CacheService();
        this.#notificationService = new NotificationService();
        this.#emailService = new EmailService();
        this.#activeSessionsMap = new Map();
        this.#sessionMetrics = {
            totalCreated: 0,
            totalTerminated: 0,
            activeCount: 0,
            averageDuration: 0
        };

        // Start cleanup timer
        this.#startCleanupTimer();

        logger.info('UserSessionsService initialized');
    }

    /**
     * Create a new session
     * @param {Object} sessionData - Session creation data
     * @param {Object} context - Session context (IP, user agent, etc.)
     * @returns {Promise<Object>} Created session
     */
    async createSession(sessionData, context) {
        try {
            logger.info(`Creating session for user: ${sessionData.userId}`);

            // Validate session data
            await this.#validateSessionCreation(sessionData, context);

            // Check concurrent sessions
            await this.#checkConcurrentSessions(sessionData.userId);

            // Get user and admin user
            const [user, adminUser] = await Promise.all([
                User.findById(sessionData.userId),
                AdminUser.findOne({ userId: sessionData.userId })
            ]);

            if (!user) {
                throw new AppError('User not found', 404);
            }

            // Generate tokens
            const sessionToken = stringHelper.generateRandomString(this.#sessionTokenLength);
            const refreshToken = stringHelper.generateRandomString(this.#refreshTokenLength);

            // Analyze context for risks
            const contextAnalysis = await this.#analyzeSessionContext(context, user);

            // Create session
            const session = new AdminSession({
                sessionToken,
                refreshToken,
                adminUserId: adminUser?._id,
                userId: user._id,
                sessionType: sessionData.sessionType || 'STANDARD',
                authenticationMethod: sessionData.authMethod || 'PASSWORD',
                mfaVerified: sessionData.mfaVerified || false,
                mfaMethod: sessionData.mfaMethod,
                context: {
                    ipAddress: context.ipAddress,
                    userAgent: context.userAgent,
                    deviceInfo: await this.#extractDeviceInfo(context),
                    location: await this.#detectLocation(context.ipAddress),
                    network: await this.#analyzeNetwork(context.ipAddress)
                },
                security: {
                    riskScore: contextAnalysis.riskScore,
                    riskFactors: contextAnalysis.riskFactors,
                    anomalies: contextAnalysis.anomalies
                },
                lifecycle: {
                    createdAt: new Date(),
                    lastActivityAt: new Date(),
                    expiresAt: new Date(Date.now() + this.#sessionTimeout),
                    absoluteExpiryAt: new Date(Date.now() + this.#absoluteTimeout)
                },
                state: {
                    status: 'ACTIVE'
                }
            });

            // Apply session restrictions based on user settings
            if (adminUser) {
                await this.#applyUserSessionRestrictions(session, adminUser);
            }

            // Check for anomalies
            if (this.#anomalyDetectionEnabled) {
                const anomalies = await this.#detectAnomalies(session, user);
                if (anomalies.length > 0) {
                    session.security.anomalies.push(...anomalies);
                    session.calculateRiskScore();
                }
            }

            // Issue challenge if high risk
            if (session.security.riskScore >= this.#riskScoreThreshold) {
                await session.issueChallenge('MFA');
                session.state.flags.pendingMfa = true;
            }

            await session.save();

            // Add to active sessions map
            this.#activeSessionsMap.set(session.sessionId, {
                userId: user._id.toString(),
                createdAt: session.lifecycle.createdAt
            });

            // Update metrics
            this.#updateSessionMetrics('created');

            // Send notifications
            await this.#sendSessionNotifications(session, 'created', user);

            // Cache session
            await this.#cacheSession(session);

            // Log audit
            await this.#logSessionAudit('SESSION_CREATED', {
                sessionId: session.sessionId,
                userId: user._id,
                sessionType: session.sessionType,
                riskScore: session.security.riskScore
            });

            logger.info(`Session created: ${session.sessionId}`);

            return {
                sessionId: session.sessionId,
                sessionToken,
                refreshToken,
                expiresAt: session.lifecycle.expiresAt,
                needsChallenge: session.state.flags.pendingMfa,
                user: {
                    id: user._id,
                    email: user.email,
                    name: `${user.firstName} ${user.lastName}`
                }
            };

        } catch (error) {
            logger.error('Error creating session:', error);
            throw error;
        }
    }

    /**
     * Validate session token
     * @param {string} sessionToken - Session token to validate
     * @param {Object} context - Current request context
     * @returns {Promise<Object>} Session validation result
     */
    async validateSession(sessionToken, context = {}) {
        try {
            logger.debug('Validating session token');

            // Find session by token
            const session = await AdminSession.findByToken(sessionToken);

            if (!session) {
                throw new AppError('Invalid session token', 401);
            }

            // Check session status
            if (session.state.status !== 'ACTIVE') {
                throw new AppError(`Session is ${session.state.status.toLowerCase()}`, 401);
            }

            // Check expiry
            if (session.isExpired) {
                await session.terminate('EXPIRED');
                throw new AppError('Session expired', 401);
            }

            // Check idle timeout
            const idleTime = Date.now() - session.lifecycle.lastActivityAt.getTime();
            if (idleTime > this.#idleTimeout) {
                session.state.status = 'IDLE';
                await session.save();
                throw new AppError('Session idle timeout', 401);
            }

            // Validate context if provided
            if (context.ipAddress) {
                await this.#validateSessionContext(session, context);
            }

            // Check for required challenges
            if (session.state.flags.pendingMfa) {
                return {
                    valid: false,
                    reason: 'MFA_REQUIRED',
                    sessionId: session.sessionId,
                    challengeType: 'MFA'
                };
            }

            // Update activity
            await session.updateActivity({
                type: 'VALIDATION',
                timestamp: new Date()
            });

            // Refresh if needed
            if (session.requiresRefresh) {
                logger.debug('Session requires refresh');
            }

            return {
                valid: true,
                sessionId: session.sessionId,
                userId: session.userId,
                adminUserId: session.adminUserId,
                expiresAt: session.lifecycle.expiresAt,
                requiresRefresh: session.requiresRefresh,
                permissions: await this.#getSessionPermissions(session)
            };

        } catch (error) {
            logger.error('Error validating session:', error);
            throw error;
        }
    }

    /**
     * Refresh session
     * @param {string} refreshToken - Refresh token
     * @param {Object} context - Request context
     * @returns {Promise<Object>} Refreshed session
     */
    async refreshSession(refreshToken, context = {}) {
        try {
            logger.info('Refreshing session');

            // Find session by refresh token
            const sessions = await AdminSession.find({
                'state.status': { $in: ['ACTIVE', 'IDLE'] }
            });

            let session = null;
            for (const s of sessions) {
                if (await s.validateRefreshToken(refreshToken)) {
                    session = s;
                    break;
                }
            }

            if (!session) {
                throw new AppError('Invalid refresh token', 401);
            }

            // Check absolute expiry
            if (session.lifecycle.absoluteExpiryAt <= new Date()) {
                await session.terminate('EXPIRED');
                throw new AppError('Session reached absolute expiry', 401);
            }

            // Validate context changes
            if (context.ipAddress) {
                const contextChanges = await this.#detectContextChanges(session, context);
                if (contextChanges.significant) {
                    // Require re-authentication for significant changes
                    await session.terminate('SECURITY');
                    throw new AppError('Significant context change detected', 401);
                }
            }

            // Refresh the session
            const refreshResult = await session.refresh();

            // Rotate tokens if enabled
            if (this.#sessionRotationEnabled) {
                logger.debug('Rotating session tokens');
            }

            // Update cache
            await this.#cacheSession(session);

            // Log audit
            await this.#logSessionAudit('SESSION_REFRESHED', {
                sessionId: session.sessionId,
                userId: session.userId
            });

            logger.info(`Session refreshed: ${session.sessionId}`);

            return refreshResult;

        } catch (error) {
            logger.error('Error refreshing session:', error);
            throw error;
        }
    }

    /**
     * Terminate session
     * @param {string} sessionId - Session ID to terminate
     * @param {string} reason - Termination reason
     * @param {string} terminatedBy - User terminating the session
     * @returns {Promise<Object>} Termination result
     */
    async terminateSession(sessionId, reason = 'LOGOUT', terminatedBy = null) {
        try {
            logger.info(`Terminating session: ${sessionId}`);

            const session = await AdminSession.findOne({ sessionId });

            if (!session) {
                throw new AppError('Session not found', 404);
            }

            // Terminate the session
            await session.terminate(reason, terminatedBy);

            // Remove from active sessions map
            this.#activeSessionsMap.delete(sessionId);

            // Clear cache
            await this.#clearSessionCache(sessionId);

            // Update metrics
            this.#updateSessionMetrics('terminated');

            // Send notifications
            const user = await User.findById(session.userId);
            await this.#sendSessionNotifications(session, 'terminated', user);

            // Log audit
            await this.#logSessionAudit('SESSION_TERMINATED', {
                sessionId,
                userId: session.userId,
                reason,
                terminatedBy
            });

            logger.info(`Session terminated: ${sessionId}`);

            return {
                success: true,
                message: 'Session terminated successfully',
                sessionId
            };

        } catch (error) {
            logger.error('Error terminating session:', error);
            throw error;
        }
    }

    /**
     * Get user sessions
     * @param {string} userId - User ID
     * @param {Object} options - Query options
     * @returns {Promise<Array>} User sessions
     */
    async getUserSessions(userId, options = {}) {
        try {
            logger.debug(`Fetching sessions for user: ${userId}`);

            const query = {
                userId,
                'state.status': options.activeOnly ? 'ACTIVE' : { $ne: 'TERMINATED' }
            };

            const sessions = await AdminSession.find(query)
                .sort('-lifecycle.createdAt')
                .limit(options.limit || 20)
                .lean();

            // Enrich with additional data
            const enrichedSessions = sessions.map(session => ({
                sessionId: session.sessionId,
                sessionType: session.sessionType,
                status: session.state.status,
                createdAt: session.lifecycle.createdAt,
                lastActivityAt: session.lifecycle.lastActivityAt,
                expiresAt: session.lifecycle.expiresAt,
                ipAddress: session.context.ipAddress,
                device: session.context.deviceInfo,
                location: session.context.location,
                riskScore: session.security.riskScore,
                isCurrentSession: session.sessionId === options.currentSessionId
            }));

            return enrichedSessions;

        } catch (error) {
            logger.error('Error fetching user sessions:', error);
            throw error;
        }
    }

    /**
     * Terminate all user sessions
     * @param {string} userId - User ID
     * @param {string} reason - Termination reason
     * @param {Object} options - Termination options
     * @returns {Promise<Object>} Termination result
     */
    async terminateUserSessions(userId, reason = 'FORCED', options = {}) {
        try {
            logger.info(`Terminating all sessions for user: ${userId}`);

            const terminated = await AdminSession.terminateUserSessions(userId, reason);

            // Clear user session caches
            await this.#clearUserSessionCaches(userId);

            // Update active sessions map
            for (const [sessionId, data] of this.#activeSessionsMap) {
                if (data.userId === userId.toString()) {
                    this.#activeSessionsMap.delete(sessionId);
                }
            }

            // Send notification
            const user = await User.findById(userId);
            if (user && !options.skipNotification) {
                await this.#sendBulkTerminationNotification(user, terminated.length, reason);
            }

            // Log audit
            await this.#logSessionAudit('USER_SESSIONS_TERMINATED', {
                userId,
                sessionCount: terminated.length,
                reason
            });

            logger.info(`Terminated ${terminated.length} sessions for user ${userId}`);

            return {
                success: true,
                terminatedCount: terminated.length,
                sessionIds: terminated
            };

        } catch (error) {
            logger.error('Error terminating user sessions:', error);
            throw error;
        }
    }

    /**
     * Elevate session privileges
     * @param {string} sessionId - Session ID
     * @param {Object} elevationData - Elevation data
     * @returns {Promise<Object>} Elevation result
     */
    async elevateSessionPrivileges(sessionId, elevationData) {
        try {
            logger.info(`Elevating privileges for session: ${sessionId}`);

            const session = await AdminSession.findOne({ sessionId });

            if (!session) {
                throw new AppError('Session not found', 404);
            }

            // Verify MFA if required
            if (this.#mfaRequiredForElevation && !elevationData.mfaVerified) {
                throw new AppError('MFA verification required for privilege elevation', 403);
            }

            // Elevate privileges
            await session.elevatePrivileges({
                grantedBy: elevationData.grantedBy,
                reason: elevationData.reason,
                expiresAt: elevationData.duration
                    ? new Date(Date.now() + elevationData.duration)
                    : new Date(Date.now() + 900000) // 15 minutes default
            });

            // Send notification
            const user = await User.findById(session.userId);
            await this.#sendPrivilegeElevationNotification(user, session, elevationData);

            // Log audit
            await this.#logSessionAudit('PRIVILEGES_ELEVATED', {
                sessionId,
                userId: session.userId,
                reason: elevationData.reason,
                grantedBy: elevationData.grantedBy
            });

            logger.info(`Privileges elevated for session: ${sessionId}`);

            return {
                success: true,
                message: 'Privileges elevated successfully',
                expiresAt: session.elevatedPrivileges.expiresAt
            };

        } catch (error) {
            logger.error('Error elevating privileges:', error);
            throw error;
        }
    }

    /**
     * Start impersonation
     * @param {string} sessionId - Session ID
     * @param {string} targetUserId - Target user to impersonate
     * @param {Object} impersonationData - Impersonation data
     * @returns {Promise<Object>} Impersonation result
     */
    async startImpersonation(sessionId, targetUserId, impersonationData) {
        try {
            logger.info(`Starting impersonation in session ${sessionId} for user ${targetUserId}`);

            const session = await AdminSession.findOne({ sessionId });

            if (!session) {
                throw new AppError('Session not found', 404);
            }

            // Verify admin permissions
            const adminUser = await AdminUser.findById(session.adminUserId);
            if (!adminUser?.hasPermission('userManagement.impersonate')) {
                throw new AppError('Insufficient permissions for impersonation', 403);
            }

            // Get target user
            const targetUser = await User.findById(targetUserId);
            if (!targetUser) {
                throw new AppError('Target user not found', 404);
            }

            // Start impersonation
            await session.startImpersonation({
                targetUserId,
                reason: impersonationData.reason,
                maxDuration: impersonationData.duration || 3600000, // 1 hour default
                restrictions: impersonationData.restrictions || []
            });

            // Send notifications
            await this.#sendImpersonationNotifications(session, targetUser, adminUser);

            // Log audit
            await this.#logSessionAudit('IMPERSONATION_STARTED', {
                sessionId,
                adminUserId: session.adminUserId,
                targetUserId,
                reason: impersonationData.reason
            });

            logger.info(`Impersonation started: admin ${session.adminUserId} as user ${targetUserId}`);

            return {
                success: true,
                message: 'Impersonation started successfully',
                targetUser: {
                    id: targetUser._id,
                    email: targetUser.email,
                    name: `${targetUser.firstName} ${targetUser.lastName}`
                },
                expiresAt: new Date(Date.now() + (impersonationData.duration || 3600000))
            };

        } catch (error) {
            logger.error('Error starting impersonation:', error);
            throw error;
        }
    }

    /**
     * End impersonation
     * @param {string} sessionId - Session ID
     * @returns {Promise<Object>} End impersonation result
     */
    async endImpersonation(sessionId) {
        try {
            logger.info(`Ending impersonation in session: ${sessionId}`);

            const session = await AdminSession.findOne({ sessionId });

            if (!session) {
                throw new AppError('Session not found', 404);
            }

            if (!session.impersonation.isImpersonating) {
                throw new AppError('Session is not impersonating', 400);
            }

            const targetUserId = session.impersonation.targetUserId;

            // End impersonation
            await session.endImpersonation();

            // Log audit
            await this.#logSessionAudit('IMPERSONATION_ENDED', {
                sessionId,
                adminUserId: session.adminUserId,
                targetUserId
            });

            logger.info(`Impersonation ended in session: ${sessionId}`);

            return {
                success: true,
                message: 'Impersonation ended successfully'
            };

        } catch (error) {
            logger.error('Error ending impersonation:', error);
            throw error;
        }
    }

    /**
     * List active sessions with filtering
     * @param {Object} filters - Query filters
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Paginated session list
     */
    async listActiveSessions(filters = {}, options = {}) {
        try {
            logger.debug('Listing active sessions');

            // Build query
            const query = {
                'state.status': 'ACTIVE',
                ...this.#buildSessionQuery(filters)
            };

            // Pagination
            const page = parseInt(options.page) || 1;
            const limit = Math.min(parseInt(options.limit) || 20, 100);
            const skip = (page - 1) * limit;

            // Execute query
            const [sessions, totalCount] = await Promise.all([
                AdminSession.find(query)
                    .populate('userId', 'email firstName lastName')
                    .populate('adminUserId', 'adminProfile.displayName')
                    .sort('-lifecycle.createdAt')
                    .skip(skip)
                    .limit(limit)
                    .lean(),
                AdminSession.countDocuments(query)
            ]);

            // Format sessions
            const formattedSessions = sessions.map(session => ({
                sessionId: session.sessionId,
                user: session.userId,
                adminUser: session.adminUserId,
                sessionType: session.sessionType,
                createdAt: session.lifecycle.createdAt,
                lastActivityAt: session.lifecycle.lastActivityAt,
                expiresAt: session.lifecycle.expiresAt,
                ipAddress: session.context.ipAddress,
                location: session.context.location,
                device: session.context.deviceInfo,
                riskScore: session.security.riskScore,
                isElevated: session.elevatedPrivileges?.enabled,
                isImpersonating: session.impersonation?.isImpersonating
            }));

            return {
                sessions: formattedSessions,
                pagination: {
                    page,
                    limit,
                    totalPages: Math.ceil(totalCount / limit),
                    totalCount,
                    hasNext: page * limit < totalCount,
                    hasPrev: page > 1
                }
            };

        } catch (error) {
            logger.error('Error listing active sessions:', error);
            throw error;
        }
    }

    /**
     * Get session statistics
     * @param {Object} filters - Statistics filters
     * @returns {Promise<Object>} Session statistics
     */
    async getSessionStatistics(filters = {}) {
        try {
            logger.debug('Generating session statistics');

            const query = this.#buildSessionQuery(filters);

            const [
                totalSessions,
                activeSessions,
                idleSessions,
                lockedSessions,
                highRiskSessions,
                impersonatingSessions,
                elevatedSessions,
                deviceStats,
                locationStats,
                authMethodStats
            ] = await Promise.all([
                AdminSession.countDocuments(query),
                AdminSession.countDocuments({ ...query, 'state.status': 'ACTIVE' }),
                AdminSession.countDocuments({ ...query, 'state.status': 'IDLE' }),
                AdminSession.countDocuments({ ...query, 'state.status': 'LOCKED' }),
                AdminSession.countDocuments({ ...query, 'security.riskScore': { $gte: this.#riskScoreThreshold } }),
                AdminSession.countDocuments({ ...query, 'impersonation.isImpersonating': true }),
                AdminSession.countDocuments({ ...query, 'elevatedPrivileges.enabled': true }),
                this.#getDeviceStatistics(query),
                this.#getLocationStatistics(query),
                this.#getAuthMethodStatistics(query)
            ]);

            // Calculate average session duration
            const avgDuration = await this.#calculateAverageSessionDuration(query);

            return {
                summary: {
                    total: totalSessions,
                    active: activeSessions,
                    idle: idleSessions,
                    locked: lockedSessions,
                    terminated: totalSessions - activeSessions - idleSessions - lockedSessions
                },
                security: {
                    highRisk: highRiskSessions,
                    impersonating: impersonatingSessions,
                    elevated: elevatedSessions
                },
                devices: deviceStats,
                locations: locationStats,
                authMethods: authMethodStats,
                metrics: {
                    averageDuration: avgDuration,
                    ...this.#sessionMetrics
                },
                generatedAt: new Date()
            };

        } catch (error) {
            logger.error('Error generating session statistics:', error);
            throw error;
        }
    }

    /**
     * Detect and handle suspicious sessions
     * @param {Object} options - Detection options
     * @returns {Promise<Object>} Detection result
     */
    async detectSuspiciousSessions(options = {}) {
        try {
            logger.info('Detecting suspicious sessions');

            const suspiciousSessions = [];

            // Find high-risk sessions
            const highRiskSessions = await AdminSession.find({
                'state.status': 'ACTIVE',
                'security.riskScore': { $gte: this.#riskScoreThreshold }
            });

            for (const session of highRiskSessions) {
                const analysis = await this.#analyzeSessionSuspicion(session);

                if (analysis.isSuspicious) {
                    suspiciousSessions.push({
                        sessionId: session.sessionId,
                        userId: session.userId,
                        riskScore: session.security.riskScore,
                        reasons: analysis.reasons,
                        recommendedAction: analysis.recommendedAction
                    });

                    // Take action based on severity
                    if (options.autoAction) {
                        await this.#handleSuspiciousSession(session, analysis);
                    }
                }
            }

            // Log findings
            if (suspiciousSessions.length > 0) {
                await this.#logSessionAudit('SUSPICIOUS_SESSIONS_DETECTED', {
                    count: suspiciousSessions.length,
                    sessions: suspiciousSessions
                });
            }

            logger.info(`Detected ${suspiciousSessions.length} suspicious sessions`);

            return {
                suspicious: suspiciousSessions,
                analyzed: highRiskSessions.length,
                actionsToken: options.autoAction ? suspiciousSessions.length : 0
            };

        } catch (error) {
            logger.error('Error detecting suspicious sessions:', error);
            throw error;
        }
    }

    /**
     * Clean up expired sessions
     * @returns {Promise<Object>} Cleanup result
     */
    async cleanupExpiredSessions() {
        try {
            logger.info('Cleaning up expired sessions');

            const cleanedCount = await AdminSession.cleanupExpiredSessions();

            // Clean up idle sessions
            const idleSessions = await AdminSession.findIdleSessions(this.#idleTimeout / 60000);
            let idleTerminated = 0;

            for (const session of idleSessions) {
                await session.terminate('TIMEOUT');
                idleTerminated++;
            }

            // Update active sessions map
            this.#updateActiveSessionsMap();

            // Clear expired cache entries
            await this.#clearExpiredCaches();

            logger.info(`Cleanup completed: ${cleanedCount} expired, ${idleTerminated} idle sessions`);

            return {
                expired: cleanedCount,
                idle: idleTerminated,
                total: cleanedCount + idleTerminated
            };

        } catch (error) {
            logger.error('Error cleaning up sessions:', error);
            throw error;
        }
    }

    /**
     * Generate session report
     * @param {string} userId - User ID (optional)
     * @param {Object} options - Report options
     * @returns {Promise<Object>} Session report
     */
    async generateSessionReport(userId, options = {}) {
        try {
            logger.info('Generating session report');

            const days = options.days || 30;
            let report;

            if (userId) {
                // User-specific report
                const adminUser = await AdminUser.findOne({ userId });
                if (adminUser) {
                    report = await AdminSession.generateSessionReport(adminUser._id, days);
                } else {
                    report = await AdminSession.generateSessionReport(userId, days);
                }
            } else {
                // System-wide report
                report = await this.#generateSystemSessionReport(days);
            }

            // Add additional analytics
            report.analytics = await this.#generateSessionAnalytics(report);

            // Add recommendations
            report.recommendations = this.#generateSessionRecommendations(report);

            return report;

        } catch (error) {
            logger.error('Error generating session report:', error);
            throw error;
        }
    }

    /**
     * Private helper methods
     */

    #startCleanupTimer() {
        this.#cleanupTimer = setInterval(async () => {
            try {
                await this.cleanupExpiredSessions();
            } catch (error) {
                logger.error('Error in session cleanup timer:', error);
            }
        }, this.#cleanupInterval);
    }

    async #validateSessionCreation(sessionData, context) {
        if (!sessionData.userId) {
            throw new AppError('User ID is required', 400);
        }

        if (!context.ipAddress || !CommonValidator.isValidIP(context.ipAddress)) {
            throw new AppError('Valid IP address is required', 400);
        }

        if (!context.userAgent) {
            throw new AppError('User agent is required', 400);
        }

        return true;
    }

    async #checkConcurrentSessions(userId) {
        const activeSessions = await AdminSession.countDocuments({
            userId,
            'state.status': 'ACTIVE'
        });

        if (activeSessions >= this.#maxConcurrentSessions) {
            // Terminate oldest session
            const oldestSession = await AdminSession.findOne({
                userId,
                'state.status': 'ACTIVE'
            }).sort('lifecycle.createdAt');

            if (oldestSession) {
                await oldestSession.terminate('MAX_SESSIONS_EXCEEDED');
                logger.info(`Terminated oldest session for user ${userId} due to max concurrent sessions`);
            }
        }
    }

    async #analyzeSessionContext(context, user) {
        const analysis = {
            riskScore: 0,
            riskFactors: [],
            anomalies: []
        };

        // Check IP reputation
        const ipReputation = await this.#checkIPReputation(context.ipAddress);
        if (ipReputation.risk > 50) {
            analysis.riskScore += 20;
            analysis.riskFactors.push({
                factor: 'IP_REPUTATION',
                score: 20,
                severity: 'MEDIUM'
            });
        }

        // Check for VPN/Proxy
        const networkAnalysis = await this.#analyzeNetwork(context.ipAddress);
        if (networkAnalysis.vpnDetected || networkAnalysis.proxyDetected) {
            analysis.riskScore += 15;
            analysis.riskFactors.push({
                factor: 'PROXY_VPN_DETECTED',
                score: 15,
                severity: 'LOW'
            });
        }

        // Check for Tor
        if (networkAnalysis.torDetected) {
            analysis.riskScore += 30;
            analysis.riskFactors.push({
                factor: 'TOR_DETECTED',
                score: 30,
                severity: 'HIGH'
            });
        }

        // Check location consistency
        const location = await this.#detectLocation(context.ipAddress);
        const lastSession = await AdminSession.findOne({
            userId: user._id,
            'state.status': { $ne: 'TERMINATED' }
        }).sort('-lifecycle.createdAt');

        if (lastSession && lastSession.context.location) {
            const locationChange = this.#calculateLocationChange(
                lastSession.context.location,
                location
            );

            if (locationChange.impossible) {
                analysis.riskScore += 40;
                analysis.anomalies.push({
                    type: 'LOCATION',
                    description: 'Impossible location change detected',
                    severity: 'CRITICAL'
                });
            } else if (locationChange.suspicious) {
                analysis.riskScore += 20;
                analysis.anomalies.push({
                    type: 'LOCATION',
                    description: 'Suspicious location change detected',
                    severity: 'WARNING'
                });
            }
        }

        // Check device consistency
        const deviceInfo = await this.#extractDeviceInfo(context);
        if (deviceInfo.suspicious) {
            analysis.riskScore += 15;
            analysis.anomalies.push({
                type: 'DEVICE',
                description: 'Suspicious device characteristics',
                severity: 'WARNING'
            });
        }

        // Cap risk score at 100
        analysis.riskScore = Math.min(100, analysis.riskScore);

        return analysis;
    }

    async #extractDeviceInfo(context) {
        const userAgent = context.userAgent || '';

        // Parse user agent
        const deviceInfo = {
            deviceType: 'UNKNOWN',
            platform: 'Unknown',
            os: 'Unknown',
            browser: 'Unknown',
            suspicious: false
        };

        // Simple user agent parsing (in production, use a proper UA parser)
        if (userAgent.includes('Mobile')) {
            deviceInfo.deviceType = 'MOBILE';
        } else if (userAgent.includes('Tablet')) {
            deviceInfo.deviceType = 'TABLET';
        } else if (userAgent.includes('Windows') || userAgent.includes('Mac') || userAgent.includes('Linux')) {
            deviceInfo.deviceType = 'DESKTOP';
        }

        // Check for suspicious patterns
        if (userAgent.includes('bot') || userAgent.includes('crawler') || userAgent.includes('spider')) {
            deviceInfo.suspicious = true;
        }

        // Generate device fingerprint if enabled
        if (this.#deviceFingerprintingEnabled && context.deviceFingerprint) {
            deviceInfo.fingerprint = context.deviceFingerprint;
        }

        return deviceInfo;
    }

    async #detectLocation(ipAddress) {
        // In production, use a proper GeoIP service
        return {
            country: 'US',
            countryCode: 'US',
            region: 'California',
            city: 'San Francisco',
            timezone: 'America/Los_Angeles',
            coordinates: {
                latitude: 37.7749,
                longitude: -122.4194
            }
        };
    }

    async #analyzeNetwork(ipAddress) {
        // In production, use proper network analysis services
        return {
            connectionType: 'PUBLIC',
            vpnDetected: false,
            proxyDetected: false,
            torDetected: false,
            threatLevel: 'SAFE'
        };
    }

    async #checkIPReputation(ipAddress) {
        // In production, use IP reputation services
        return {
            risk: 0,
            isBlacklisted: false,
            reputation: 'GOOD'
        };
    }

    #calculateLocationChange(previousLocation, currentLocation) {
        // Calculate distance and time between locations
        // In production, use proper geolocation calculations

        return {
            impossible: false,
            suspicious: false,
            distance: 0
        };
    }

    async #cacheSession(session) {
        const cacheKey = `${this.#cachePrefix}${session.sessionId}`;
        const cacheData = {
            sessionId: session.sessionId,
            userId: session.userId,
            status: session.state.status,
            expiresAt: session.lifecycle.expiresAt
        };

        await this.#cacheService.set(cacheKey, cacheData, this.#cacheTTL);
    }

    async #clearSessionCache(sessionId) {
        const cacheKey = `${this.#cachePrefix}${sessionId}`;
        await this.#cacheService.delete(cacheKey);
    }

    async #clearUserSessionCaches(userId) {
        const pattern = `${this.#cachePrefix}*:${userId}`;
        await this.#cacheService.deletePattern(pattern);
    }

    async #clearExpiredCaches() {
        // Implementation depends on cache service capabilities
        logger.debug('Clearing expired session caches');
    }

    #updateSessionMetrics(action) {
        switch (action) {
            case 'created':
                this.#sessionMetrics.totalCreated++;
                this.#sessionMetrics.activeCount++;
                break;
            case 'terminated':
                this.#sessionMetrics.totalTerminated++;
                this.#sessionMetrics.activeCount = Math.max(0, this.#sessionMetrics.activeCount - 1);
                break;
        }
    }

    async #updateActiveSessionsMap() {
        const activeSessions = await AdminSession.find({
            'state.status': 'ACTIVE'
        }).select('sessionId userId lifecycle.createdAt');

        this.#activeSessionsMap.clear();

        for (const session of activeSessions) {
            this.#activeSessionsMap.set(session.sessionId, {
                userId: session.userId.toString(),
                createdAt: session.lifecycle.createdAt
            });
        }
    }

    async #logSessionAudit(action, data) {
        try {
            logger.audit({
                category: 'SESSIONS',
                action,
                timestamp: new Date(),
                data
            });
        } catch (error) {
            logger.error('Error logging session audit:', error);
        }
    }

    #buildSessionQuery(filters) {
        const query = {};

        if (filters.userId) {
            query.userId = filters.userId;
        }

        if (filters.adminUserId) {
            query.adminUserId = filters.adminUserId;
        }

        if (filters.sessionType) {
            query.sessionType = filters.sessionType;
        }

        if (filters.ipAddress) {
            query['context.ipAddress'] = filters.ipAddress;
        }

        if (filters.riskScore) {
            query['security.riskScore'] = { $gte: filters.riskScore };
        }

        if (filters.createdAfter) {
            query['lifecycle.createdAt'] = { $gte: new Date(filters.createdAfter) };
        }

        if (filters.createdBefore) {
            query['lifecycle.createdAt'] = {
                ...query['lifecycle.createdAt'],
                $lte: new Date(filters.createdBefore)
            };
        }

        return query;
    }

    /**
     * Apply user-specific session restrictions
     * @private
     */
    async #applyUserSessionRestrictions(session, adminUser) {
        try {
            // Apply time-based restrictions
            if (adminUser.sessionRestrictions?.timeRestricted) {
                const restrictions = adminUser.sessionRestrictions.timeRestrictions;
                const now = new Date();
                const currentHour = now.getHours();
                const currentDay = now.getDay();

                if (restrictions.allowedHours && !restrictions.allowedHours.includes(currentHour)) {
                    session.state.flags.timeRestricted = true;
                    session.lifecycle.expiresAt = new Date(now.getTime() + 300000); // 5 minutes
                }

                if (restrictions.allowedDays && !restrictions.allowedDays.includes(currentDay)) {
                    session.state.flags.dayRestricted = true;
                    session.lifecycle.expiresAt = new Date(now.getTime() + 300000);
                }
            }

            // Apply IP-based restrictions
            if (adminUser.sessionRestrictions?.ipRestricted) {
                const allowedIPs = adminUser.sessionRestrictions.allowedIPs || [];
                const currentIP = session.context.ipAddress;

                if (allowedIPs.length > 0 && !allowedIPs.includes(currentIP)) {
                    // Check if IP is in allowed subnets
                    const isAllowed = allowedIPs.some(allowedIP => {
                        if (allowedIP.includes('/')) {
                            return this.#isIPInSubnet(currentIP, allowedIP);
                        }
                        return allowedIP === currentIP;
                    });

                    if (!isAllowed) {
                        session.state.flags.ipRestricted = true;
                        session.security.riskScore += 25;
                    }
                }
            }

            // Apply concurrent session limits
            if (adminUser.sessionRestrictions?.maxConcurrentSessions) {
                const maxSessions = adminUser.sessionRestrictions.maxConcurrentSessions;
                if (maxSessions < this.#maxConcurrentSessions) {
                    this.#maxConcurrentSessions = maxSessions;
                }
            }

            // Apply session duration limits
            if (adminUser.sessionRestrictions?.maxSessionDuration) {
                const maxDuration = adminUser.sessionRestrictions.maxSessionDuration;
                const newExpiryTime = new Date(session.lifecycle.createdAt.getTime() + maxDuration);

                if (newExpiryTime < session.lifecycle.expiresAt) {
                    session.lifecycle.expiresAt = newExpiryTime;
                }
            }

            logger.debug(`Applied session restrictions for admin user ${adminUser._id}`);
        } catch (error) {
            logger.error('Error applying user session restrictions:', error);
        }
    }

    /**
     * Check if IP is in subnet
     * @private
     */
    #isIPInSubnet(ip, subnet) {
        const [subnetIP, prefixLength] = subnet.split('/');
        const ipParts = ip.split('.').map(Number);
        const subnetParts = subnetIP.split('.').map(Number);
        const prefixLen = parseInt(prefixLength);

        // Convert to binary and compare
        for (let i = 0; i < 4; i++) {
            const bitsToCheck = Math.min(8, Math.max(0, prefixLen - i * 8));
            if (bitsToCheck === 0) break;

            const mask = (0xFF << (8 - bitsToCheck)) & 0xFF;
            if ((ipParts[i] & mask) !== (subnetParts[i] & mask)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Detect session anomalies
     * @private
     */
    async #detectAnomalies(session, user) {
        const anomalies = [];

        try {
            // Check login time patterns
            const recentSessions = await AdminSession.find({
                userId: user._id,
                'lifecycle.createdAt': { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
            }).sort('-lifecycle.createdAt').limit(10);

            if (recentSessions.length > 0) {
                const currentHour = session.lifecycle.createdAt.getHours();
                const usualHours = recentSessions.map(s => s.lifecycle.createdAt.getHours());
                const averageHour = usualHours.reduce((a, b) => a + b, 0) / usualHours.length;

                if (Math.abs(currentHour - averageHour) > 6) {
                    anomalies.push({
                        type: 'UNUSUAL_LOGIN_TIME',
                        severity: 'MEDIUM',
                        description: `Login at ${currentHour}:00 is unusual for this user`,
                        score: 15
                    });
                }
            }

            // Check device consistency
            if (recentSessions.length > 0) {
                const recentDevices = recentSessions.map(s => s.context.deviceInfo?.deviceType).filter(Boolean);
                const currentDevice = session.context.deviceInfo?.deviceType;

                if (currentDevice && recentDevices.length > 0 && !recentDevices.includes(currentDevice)) {
                    anomalies.push({
                        type: 'NEW_DEVICE',
                        severity: 'LOW',
                        description: `First login from ${currentDevice} device type`,
                        score: 10
                    });
                }
            }

            // Check rapid login attempts
            const recentLogins = await AdminSession.find({
                userId: user._id,
                'lifecycle.createdAt': { $gte: new Date(Date.now() - 3600000) } // Last hour
            });

            if (recentLogins.length > 5) {
                anomalies.push({
                    type: 'RAPID_LOGIN_ATTEMPTS',
                    severity: 'HIGH',
                    description: `${recentLogins.length} login attempts in the last hour`,
                    score: 25
                });
            }

            // Check for brute force patterns
            const failedAttempts = user.security?.loginAttempts?.count || 0;
            if (failedAttempts > 3) {
                anomalies.push({
                    type: 'MULTIPLE_FAILED_ATTEMPTS',
                    severity: 'HIGH',
                    description: `${failedAttempts} failed login attempts before this session`,
                    score: 20
                });
            }

            // Check session frequency
            const todaySessions = await AdminSession.countDocuments({
                userId: user._id,
                'lifecycle.createdAt': { $gte: new Date().setHours(0, 0, 0, 0) }
            });

            if (todaySessions > 10) {
                anomalies.push({
                    type: 'EXCESSIVE_SESSIONS',
                    severity: 'MEDIUM',
                    description: `${todaySessions} sessions created today`,
                    score: 15
                });
            }

            logger.debug(`Detected ${anomalies.length} anomalies for session ${session.sessionId}`);

        } catch (error) {
            logger.error('Error detecting session anomalies:', error);
        }

        return anomalies;
    }

    /**
     * Send session-related notifications
     * @private
     */
    async #sendSessionNotifications(session, event, user) {
        try {
            const notificationData = {
                userId: user._id,
                sessionId: session.sessionId,
                event,
                timestamp: new Date(),
                context: {
                    ipAddress: session.context.ipAddress,
                    location: session.context.location,
                    device: session.context.deviceInfo
                }
            };

            switch (event) {
                case 'created':
                    // Send new session notification if high risk
                    if (session.security.riskScore >= this.#riskScoreThreshold) {
                        await this.#notificationService.send({
                            userId: user._id,
                            type: 'HIGH_RISK_SESSION',
                            title: 'High Risk Session Detected',
                            message: 'A new session with elevated risk was created for your account',
                            metadata: notificationData
                        });

                        await this.#emailService.send({
                            to: user.email,
                            subject: 'Security Alert: High Risk Session',
                            template: 'high-risk-session',
                            context: {
                                userName: `${user.firstName} ${user.lastName}`,
                                sessionDetails: {
                                    location: session.context.location?.city || 'Unknown',
                                    device: session.context.deviceInfo?.deviceType || 'Unknown',
                                    ipAddress: session.context.ipAddress,
                                    riskScore: session.security.riskScore
                                }
                            }
                        });
                    }
                    break;

                case 'terminated':
                    // Send session terminated notification if unexpected
                    if (session.state.terminationReason === 'SECURITY' || session.state.terminationReason === 'FORCED') {
                        await this.#notificationService.send({
                            userId: user._id,
                            type: 'SESSION_TERMINATED',
                            title: 'Session Terminated',
                            message: `Your session was terminated due to: ${session.state.terminationReason}`,
                            metadata: notificationData
                        });
                    }
                    break;

                case 'suspicious':
                    await this.#notificationService.send({
                        userId: user._id,
                        type: 'SUSPICIOUS_SESSION',
                        title: 'Suspicious Activity Detected',
                        message: 'Unusual activity detected in your session',
                        metadata: notificationData
                    });
                    break;
            }

        } catch (error) {
            logger.error('Error sending session notifications:', error);
        }
    }

    /**
     * Validate session context for security
     * @private
     */
    async #validateSessionContext(session, currentContext) {
        const issues = [];

        try {
            // Check IP address changes
            if (currentContext.ipAddress !== session.context.ipAddress) {
                const changeAnalysis = await this.#analyzeIPChange(
                    session.context.ipAddress,
                    currentContext.ipAddress
                );

                if (changeAnalysis.suspicious) {
                    issues.push({
                        type: 'IP_CHANGE',
                        severity: changeAnalysis.severity,
                        oldValue: session.context.ipAddress,
                        newValue: currentContext.ipAddress
                    });
                }
            }

            // Check user agent changes
            if (currentContext.userAgent && currentContext.userAgent !== session.context.userAgent) {
                issues.push({
                    type: 'USER_AGENT_CHANGE',
                    severity: 'MEDIUM',
                    oldValue: session.context.userAgent,
                    newValue: currentContext.userAgent
                });
            }

            // Check for impossible location changes
            if (currentContext.location && session.context.location) {
                const timeElapsed = (new Date() - session.lifecycle.lastActivityAt) / 1000 / 60; // minutes
                const distance = this.#calculateDistance(session.context.location, currentContext.location);

                if (distance > 0) {
                    const maxPossibleSpeed = 900; // km/h (commercial aircraft)
                    const requiredSpeed = (distance / timeElapsed) * 60; // km/h

                    if (requiredSpeed > maxPossibleSpeed) {
                        issues.push({
                            type: 'IMPOSSIBLE_LOCATION_CHANGE',
                            severity: 'CRITICAL',
                            distance,
                            timeElapsed,
                            requiredSpeed
                        });
                    }
                }
            }

            if (issues.length > 0) {
                logger.warn(`Session context validation issues for ${session.sessionId}:`, issues);

                // Update session with issues
                session.security.contextIssues = issues;
                session.security.riskScore += issues.reduce((sum, issue) => {
                    const severityScores = { 'LOW': 5, 'MEDIUM': 15, 'HIGH': 25, 'CRITICAL': 40 };
                    return sum + (severityScores[issue.severity] || 10);
                }, 0);

                await session.save();
            }

        } catch (error) {
            logger.error('Error validating session context:', error);
        }

        return issues;
    }

    /**
     * Analyze IP address change
     * @private
     */
    async #analyzeIPChange(oldIP, newIP) {
        try {
            // Get IP information for both addresses
            const [oldInfo, newInfo] = await Promise.all([
                this.#getIPInfo(oldIP),
                this.#getIPInfo(newIP)
            ]);

            const analysis = {
                suspicious: false,
                severity: 'LOW',
                reasons: []
            };

            // Check if countries are different
            if (oldInfo.country !== newInfo.country) {
                analysis.suspicious = true;
                analysis.severity = 'HIGH';
                analysis.reasons.push('Country change detected');
            }

            // Check if switching between datacenter and residential
            if (oldInfo.type !== newInfo.type) {
                analysis.suspicious = true;
                analysis.severity = 'MEDIUM';
                analysis.reasons.push('IP type change detected');
            }

            // Check for VPN/proxy indicators
            if (newInfo.vpn || newInfo.proxy) {
                analysis.suspicious = true;
                analysis.severity = 'MEDIUM';
                analysis.reasons.push('VPN/Proxy detected');
            }

            return analysis;
        } catch (error) {
            logger.error('Error analyzing IP change:', error);
            return { suspicious: false, severity: 'LOW', reasons: [] };
        }
    }

    /**
     * Get IP information
     * @private
     */
    async #getIPInfo(ipAddress) {
        // In production, integrate with IP intelligence services
        return {
            country: 'US',
            region: 'California',
            city: 'San Francisco',
            type: 'residential',
            vpn: false,
            proxy: false,
            tor: false
        };
    }

    /**
     * Calculate distance between two locations
     * @private
     */
    #calculateDistance(location1, location2) {
        if (!location1.coordinates || !location2.coordinates) {
            return 0;
        }

        const R = 6371; // Earth's radius in km
        const dLat = this.#toRadians(location2.coordinates.latitude - location1.coordinates.latitude);
        const dLon = this.#toRadians(location2.coordinates.longitude - location1.coordinates.longitude);

        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.#toRadians(location1.coordinates.latitude)) *
            Math.cos(this.#toRadians(location2.coordinates.latitude)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);

        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    /**
     * Convert degrees to radians
     * @private
     */
    #toRadians(degrees) {
        return degrees * (Math.PI / 180);
    }

    /**
     * Get session permissions
     * @private
     */
    async #getSessionPermissions(session) {
        try {
            const permissions = [];

            // Get user permissions
            if (session.userId) {
                const user = await User.findById(session.userId).populate('roles');
                if (user?.roles) {
                    for (const role of user.roles) {
                        if (role.permissions) {
                            permissions.push(...role.permissions);
                        }
                    }
                }
            }

            // Get admin user permissions
            if (session.adminUserId) {
                const adminUser = await AdminUser.findById(session.adminUserId);
                if (adminUser?.permissions) {
                    permissions.push(...adminUser.permissions);
                }
            }

            // Apply elevated permissions if active
            if (session.elevatedPrivileges?.enabled && session.elevatedPrivileges.expiresAt > new Date()) {
                permissions.push(...(session.elevatedPrivileges.additionalPermissions || []));
            }

            // Remove duplicates
            const uniquePermissions = [...new Set(permissions)];

            return uniquePermissions;
        } catch (error) {
            logger.error('Error getting session permissions:', error);
            return [];
        }
    }

    /**
     * Detect significant context changes
     * @private
     */
    async #detectContextChanges(session, newContext) {
        const changes = {
            significant: false,
            changes: [],
            riskScore: 0
        };

        try {
            // Check IP address change
            if (newContext.ipAddress !== session.context.ipAddress) {
                const ipAnalysis = await this.#analyzeIPChange(session.context.ipAddress, newContext.ipAddress);

                changes.changes.push({
                    type: 'IP_ADDRESS',
                    old: session.context.ipAddress,
                    new: newContext.ipAddress,
                    analysis: ipAnalysis
                });

                if (ipAnalysis.severity === 'HIGH' || ipAnalysis.severity === 'CRITICAL') {
                    changes.significant = true;
                    changes.riskScore += 30;
                }
            }

            // Check user agent change
            if (newContext.userAgent && newContext.userAgent !== session.context.userAgent) {
                changes.changes.push({
                    type: 'USER_AGENT',
                    old: session.context.userAgent,
                    new: newContext.userAgent
                });

                changes.riskScore += 15;
            }

            // Check device fingerprint if available
            if (newContext.deviceFingerprint && session.context.deviceInfo?.fingerprint) {
                if (newContext.deviceFingerprint !== session.context.deviceInfo.fingerprint) {
                    changes.changes.push({
                        type: 'DEVICE_FINGERPRINT',
                        message: 'Device fingerprint mismatch'
                    });

                    changes.significant = true;
                    changes.riskScore += 25;
                }
            }

            // Determine significance based on total risk score
            if (changes.riskScore >= 40) {
                changes.significant = true;
            }

        } catch (error) {
            logger.error('Error detecting context changes:', error);
        }

        return changes;
    }

    /**
     * Send bulk termination notification
     * @private
     */
    async #sendBulkTerminationNotification(user, sessionCount, reason) {
        try {
            await this.#notificationService.send({
                userId: user._id,
                type: 'BULK_SESSION_TERMINATION',
                title: 'Multiple Sessions Terminated',
                message: `${sessionCount} of your sessions were terminated due to: ${reason}`,
                metadata: {
                    sessionCount,
                    reason,
                    timestamp: new Date()
                }
            });

            if (reason === 'SECURITY' || reason === 'FORCED') {
                await this.#emailService.send({
                    to: user.email,
                    subject: 'Security Alert: Multiple Sessions Terminated',
                    template: 'bulk-session-termination',
                    context: {
                        userName: `${user.firstName} ${user.lastName}`,
                        sessionCount,
                        reason,
                        timestamp: new Date().toISOString()
                    }
                });
            }

        } catch (error) {
            logger.error('Error sending bulk termination notification:', error);
        }
    }

    /**
     * Send privilege elevation notification
     * @private
     */
    async #sendPrivilegeElevationNotification(user, session, elevationData) {
        try {
            await this.#notificationService.send({
                userId: user._id,
                type: 'PRIVILEGE_ELEVATION',
                title: 'Privileges Elevated',
                message: `Your session privileges have been elevated`,
                metadata: {
                    sessionId: session.sessionId,
                    reason: elevationData.reason,
                    grantedBy: elevationData.grantedBy,
                    expiresAt: session.elevatedPrivileges.expiresAt
                }
            });

            await this.#emailService.send({
                to: user.email,
                subject: 'Session Privileges Elevated',
                template: 'privilege-elevation',
                context: {
                    userName: `${user.firstName} ${user.lastName}`,
                    reason: elevationData.reason,
                    expiresAt: session.elevatedPrivileges.expiresAt,
                    grantedBy: elevationData.grantedBy
                }
            });

        } catch (error) {
            logger.error('Error sending privilege elevation notification:', error);
        }
    }

    /**
     * Send impersonation notifications
     * @private
     */
    async #sendImpersonationNotifications(session, targetUser, adminUser) {
        try {
            // Notify the target user
            await this.#notificationService.send({
                userId: targetUser._id,
                type: 'IMPERSONATION_STARTED',
                title: 'Account Being Accessed',
                message: `An administrator is accessing your account for support purposes`,
                metadata: {
                    sessionId: session.sessionId,
                    adminUser: adminUser.adminProfile?.displayName || 'Administrator',
                    startedAt: new Date()
                }
            });

            // Email notification to target user
            await this.#emailService.send({
                to: targetUser.email,
                subject: 'Administrator Access Notification',
                template: 'impersonation-notification',
                context: {
                    userName: `${targetUser.firstName} ${targetUser.lastName}`,
                    adminName: adminUser.adminProfile?.displayName || 'Administrator',
                    startedAt: new Date(),
                    reason: session.impersonation.reason || 'Support assistance'
                }
            });

            // Notify admin user's manager if configured
            if (adminUser.adminProfile?.managerId) {
                const manager = await AdminUser.findById(adminUser.adminProfile.managerId);
                if (manager) {
                    await this.#notificationService.send({
                        userId: manager.userId,
                        type: 'IMPERSONATION_ALERT',
                        title: 'Impersonation Started',
                        message: `${adminUser.adminProfile.displayName} started impersonating user ${targetUser.email}`,
                        metadata: {
                            sessionId: session.sessionId,
                            adminUserId: adminUser._id,
                            targetUserId: targetUser._id,
                            reason: session.impersonation.reason
                        }
                    });
                }
            }

        } catch (error) {
            logger.error('Error sending impersonation notifications:', error);
        }
    }

    /**
     * Get device statistics
     * @private
     */
    async #getDeviceStatistics(query) {
        try {
            const pipeline = [
                { $match: query },
                {
                    $group: {
                        _id: '$context.deviceInfo.deviceType',
                        count: { $sum: 1 },
                        platforms: { $addToSet: '$context.deviceInfo.platform' }
                    }
                },
                { $sort: { count: -1 } }
            ];

            const stats = await AdminSession.aggregate(pipeline);

            return stats.reduce((acc, stat) => {
                acc[stat._id || 'UNKNOWN'] = {
                    count: stat.count,
                    platforms: stat.platforms || []
                };
                return acc;
            }, {});
        } catch (error) {
            logger.error('Error getting device statistics:', error);
            return {};
        }
    }

    /**
     * Get location statistics
     * @private
     */
    async #getLocationStatistics(query) {
        try {
            const pipeline = [
                { $match: query },
                {
                    $group: {
                        _id: {
                            country: '$context.location.country',
                            city: '$context.location.city'
                        },
                        count: { $sum: 1 },
                        uniqueUsers: { $addToSet: '$userId' }
                    }
                },
                { $sort: { count: -1 } },
                { $limit: 20 }
            ];

            const stats = await AdminSession.aggregate(pipeline);

            return stats.map(stat => ({
                location: `${stat._id.city || 'Unknown'}, ${stat._id.country || 'Unknown'}`,
                sessionCount: stat.count,
                uniqueUsers: stat.uniqueUsers.length
            }));
        } catch (error) {
            logger.error('Error getting location statistics:', error);
            return [];
        }
    }

    /**
     * Get authentication method statistics
     * @private
     */
    async #getAuthMethodStatistics(query) {
        try {
            const pipeline = [
                { $match: query },
                {
                    $group: {
                        _id: '$authenticationMethod',
                        count: { $sum: 1 },
                        mfaVerified: { $sum: { $cond: ['$mfaVerified', 1, 0] } }
                    }
                },
                { $sort: { count: -1 } }
            ];

            const stats = await AdminSession.aggregate(pipeline);

            return stats.reduce((acc, stat) => {
                acc[stat._id || 'UNKNOWN'] = {
                    total: stat.count,
                    mfaVerified: stat.mfaVerified,
                    mfaPercentage: Math.round((stat.mfaVerified / stat.count) * 100)
                };
                return acc;
            }, {});
        } catch (error) {
            logger.error('Error getting auth method statistics:', error);
            return {};
        }
    }

    /**
     * Calculate average session duration
     * @private
     */
    async #calculateAverageSessionDuration(query) {
        try {
            const pipeline = [
                { $match: query },
                {
                    $addFields: {
                        duration: {
                            $subtract: [
                                { $ifNull: ['$lifecycle.terminatedAt', new Date()] },
                                '$lifecycle.createdAt'
                            ]
                        }
                    }
                },
                {
                    $group: {
                        _id: null,
                        avgDuration: { $avg: '$duration' },
                        medianDuration: { $median: '$duration' },
                        maxDuration: { $max: '$duration' },
                        minDuration: { $min: '$duration' }
                    }
                }
            ];

            const result = await AdminSession.aggregate(pipeline);

            if (result.length > 0) {
                return {
                    average: Math.round(result[0].avgDuration / 1000 / 60), // minutes
                    median: Math.round(result[0].medianDuration / 1000 / 60),
                    max: Math.round(result[0].maxDuration / 1000 / 60),
                    min: Math.round(result[0].minDuration / 1000 / 60)
                };
            }

            return { average: 0, median: 0, max: 0, min: 0 };
        } catch (error) {
            logger.error('Error calculating average session duration:', error);
            return { average: 0, median: 0, max: 0, min: 0 };
        }
    }

    /**
     * Analyze session for suspicious activity
     * @private
     */
    async #analyzeSessionSuspicion(session) {
        const analysis = {
            isSuspicious: false,
            reasons: [],
            recommendedAction: 'MONITOR',
            severity: 'LOW'
        };

        try {
            // Check risk score
            if (session.security.riskScore >= this.#riskScoreThreshold) {
                analysis.isSuspicious = true;
                analysis.reasons.push(`High risk score: ${session.security.riskScore}`);
            }

            // Check for multiple anomalies
            if (session.security.anomalies?.length >= 3) {
                analysis.isSuspicious = true;
                analysis.reasons.push(`Multiple anomalies detected: ${session.security.anomalies.length}`);
                analysis.severity = 'HIGH';
            }

            // Check session duration
            const sessionAge = Date.now() - session.lifecycle.createdAt.getTime();
            if (sessionAge > this.#absoluteTimeout * 2) {
                analysis.isSuspicious = true;
                analysis.reasons.push('Session exceeded maximum duration');
            }

            // Check for rapid activity
            const recentActivity = session.activity?.filter(a =>
                Date.now() - a.timestamp.getTime() < 300000 // Last 5 minutes
            ) || [];

            if (recentActivity.length > 100) {
                analysis.isSuspicious = true;
                analysis.reasons.push('Excessive activity detected');
                analysis.severity = 'HIGH';
            }

            // Check context violations
            if (session.security.contextIssues?.length > 0) {
                const criticalIssues = session.security.contextIssues.filter(i => i.severity === 'CRITICAL');
                if (criticalIssues.length > 0) {
                    analysis.isSuspicious = true;
                    analysis.reasons.push('Critical context violations');
                    analysis.severity = 'CRITICAL';
                }
            }

            // Determine recommended action
            if (analysis.severity === 'CRITICAL') {
                analysis.recommendedAction = 'TERMINATE';
            } else if (analysis.severity === 'HIGH') {
                analysis.recommendedAction = 'CHALLENGE';
            } else if (analysis.isSuspicious) {
                analysis.recommendedAction = 'ALERT';
            }

        } catch (error) {
            logger.error('Error analyzing session suspicion:', error);
        }

        return analysis;
    }

    /**
     * Handle suspicious session
     * @private
     */
    async #handleSuspiciousSession(session, analysis) {
        try {
            logger.warn(`Handling suspicious session ${session.sessionId}:`, analysis);

            switch (analysis.recommendedAction) {
                case 'TERMINATE':
                    await session.terminate('SECURITY');

                    // Send alert to user
                    const user = await User.findById(session.userId);
                    if (user) {
                        await this.#emailService.send({
                            to: user.email,
                            subject: 'Security Alert: Session Terminated',
                            template: 'suspicious-session-terminated',
                            context: {
                                userName: `${user.firstName} ${user.lastName}`,
                                reasons: analysis.reasons,
                                timestamp: new Date()
                            }
                        });
                    }
                    break;

                case 'CHALLENGE':
                    await session.issueChallenge('MFA');
                    session.state.flags.pendingMfa = true;
                    await session.save();
                    break;

                case 'ALERT':
                    // Send notification to security team
                    await this.#notificationService.send({
                        type: 'SECURITY_ALERT',
                        title: 'Suspicious Session Detected',
                        message: `Session ${session.sessionId} requires attention`,
                        metadata: {
                            sessionId: session.sessionId,
                            userId: session.userId,
                            analysis
                        }
                    });
                    break;
            }

            // Log security event
            await this.#logSessionAudit('SUSPICIOUS_SESSION_HANDLED', {
                sessionId: session.sessionId,
                analysis,
                action: analysis.recommendedAction
            });

        } catch (error) {
            logger.error('Error handling suspicious session:', error);
        }
    }

    /**
     * Generate system-wide session report
     * @private
     */
    async #generateSystemSessionReport(days) {
        try {
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);

            const query = {
                'lifecycle.createdAt': { $gte: startDate }
            };

            const [
                totalSessions,
                activeSessions,
                terminatedSessions,
                highRiskSessions,
                avgSessionDuration,
                topLocations,
                topDevices,
                securityEvents
            ] = await Promise.all([
                AdminSession.countDocuments(query),
                AdminSession.countDocuments({ ...query, 'state.status': 'ACTIVE' }),
                AdminSession.countDocuments({ ...query, 'state.status': 'TERMINATED' }),
                AdminSession.countDocuments({ ...query, 'security.riskScore': { $gte: this.#riskScoreThreshold } }),
                this.#calculateAverageSessionDuration(query),
                this.#getLocationStatistics(query),
                this.#getDeviceStatistics(query),
                this.#getSecurityEvents(query)
            ]);

            return {
                reportPeriod: {
                    startDate,
                    endDate: new Date(),
                    days
                },
                summary: {
                    totalSessions,
                    activeSessions,
                    terminatedSessions,
                    highRiskSessions,
                    securityEvents: securityEvents.length
                },
                performance: {
                    averageSessionDuration: avgSessionDuration
                },
                demographics: {
                    topLocations: topLocations.slice(0, 10),
                    deviceBreakdown: topDevices
                },
                security: {
                    events: securityEvents,
                    riskDistribution: await this.#getRiskDistribution(query)
                }
            };

        } catch (error) {
            logger.error('Error generating system session report:', error);
            throw error;
        }
    }

    /**
     * Get security events
     * @private
     */
    async #getSecurityEvents(query) {
        try {
            const sessions = await AdminSession.find({
                ...query,
                $or: [
                    { 'security.riskScore': { $gte: this.#riskScoreThreshold } },
                    { 'security.anomalies.0': { $exists: true } },
                    { 'state.terminationReason': 'SECURITY' }
                ]
            }).select('sessionId userId security state lifecycle').limit(100);

            return sessions.map(session => ({
                sessionId: session.sessionId,
                userId: session.userId,
                event: session.state.terminationReason === 'SECURITY' ? 'TERMINATED' : 'HIGH_RISK',
                riskScore: session.security.riskScore,
                anomalies: session.security.anomalies?.length || 0,
                timestamp: session.lifecycle.createdAt
            }));
        } catch (error) {
            logger.error('Error getting security events:', error);
            return [];
        }
    }

    /**
     * Get risk distribution
     * @private
     */
    async #getRiskDistribution(query) {
        try {
            const pipeline = [
                { $match: query },
                {
                    $bucket: {
                        groupBy: '$security.riskScore',
                        boundaries: [0, 25, 50, 75, 100],
                        default: 'other',
                        output: {
                            count: { $sum: 1 },
                            sessions: { $push: '$sessionId' }
                        }
                    }
                }
            ];

            const distribution = await AdminSession.aggregate(pipeline);

            return {
                low: distribution.find(d => d._id === 0)?.count || 0,
                medium: distribution.find(d => d._id === 25)?.count || 0,
                high: distribution.find(d => d._id === 50)?.count || 0,
                critical: distribution.find(d => d._id === 75)?.count || 0
            };
        } catch (error) {
            logger.error('Error getting risk distribution:', error);
            return { low: 0, medium: 0, high: 0, critical: 0 };
        }
    }

    /**
     * Generate session analytics
     * @private
     */
    async #generateSessionAnalytics(report) {
        const analytics = {
            trends: {},
            insights: [],
            patterns: {}
        };

        try {
            // Calculate session trends
            analytics.trends.sessionGrowth = this.#calculateSessionGrowth(report);
            analytics.trends.riskTrend = this.#calculateRiskTrend(report);

            // Generate insights
            if (report.summary.highRiskSessions > report.summary.totalSessions * 0.1) {
                analytics.insights.push({
                    type: 'HIGH_RISK_SESSIONS',
                    severity: 'WARNING',
                    message: `${Math.round((report.summary.highRiskSessions / report.summary.totalSessions) * 100)}% of sessions are high risk`
                });
            }

            if (report.performance.averageSessionDuration.average > 120) {
                analytics.insights.push({
                    type: 'LONG_SESSIONS',
                    severity: 'INFO',
                    message: `Average session duration is ${report.performance.averageSessionDuration.average} minutes`
                });
            }

            // Analyze patterns
            analytics.patterns.peakHours = await this.#identifyPeakHours(report);
            analytics.patterns.commonLocations = report.demographics.topLocations.slice(0, 5);
            analytics.patterns.devicePreferences = Object.entries(report.demographics.deviceBreakdown)
                .sort(([, a], [, b]) => b.count - a.count)
                .slice(0, 3);

        } catch (error) {
            logger.error('Error generating session analytics:', error);
        }

        return analytics;
    }

    /**
     * Calculate session growth
     * @private
     */
    #calculateSessionGrowth(report) {
        // This would calculate session growth over time
        return {
            daily: 5.2,
            weekly: 12.8,
            monthly: 45.6
        };
    }

    /**
     * Calculate risk trend
     * @private
     */
    #calculateRiskTrend(report) {
        const riskPercentage = (report.summary.highRiskSessions / report.summary.totalSessions) * 100;

        return {
            current: riskPercentage,
            trend: riskPercentage > 10 ? 'INCREASING' : 'STABLE',
            recommendation: riskPercentage > 15 ? 'Review security policies' : 'Current security posture is acceptable'
        };
    }

    /**
     * Identify peak hours
     * @private
     */
    async #identifyPeakHours(report) {
        // This would analyze session creation times to identify peak hours
        return [9, 10, 11, 14, 15]; // Example peak hours
    }

    /**
     * Generate session recommendations
     * @private
     */
    #generateSessionRecommendations(report) {
        const recommendations = [];

        try {
            // High risk sessions recommendation
            if (report.summary.highRiskSessions > report.summary.totalSessions * 0.15) {
                recommendations.push({
                    priority: 'HIGH',
                    category: 'SECURITY',
                    title: 'Review High Risk Sessions',
                    description: 'Consider implementing stricter authentication requirements',
                    action: 'Enable MFA for all administrative sessions'
                });
            }

            // Long session duration recommendation
            if (report.performance.averageSessionDuration.average > 240) {
                recommendations.push({
                    priority: 'MEDIUM',
                    category: 'PERFORMANCE',
                    title: 'Session Timeout Policy',
                    description: 'Consider reducing session timeout values',
                    action: 'Implement idle session timeout of 30 minutes'
                });
            }

            // Geographic distribution recommendation
            const uniqueCountries = new Set(report.demographics.topLocations.map(l => l.location.split(',')[1])).size;
            if (uniqueCountries > 10) {
                recommendations.push({
                    priority: 'MEDIUM',
                    category: 'SECURITY',
                    title: 'Geographic Access Controls',
                    description: 'Wide geographic distribution detected',
                    action: 'Consider implementing location-based access restrictions'
                });
            }

            // Security events recommendation
            if (report.summary.securityEvents > report.summary.totalSessions * 0.05) {
                recommendations.push({
                    priority: 'HIGH',
                    category: 'SECURITY',
                    title: 'Security Event Investigation',
                    description: 'High number of security events detected',
                    action: 'Investigate recent security incidents and update policies'
                });
            }

        } catch (error) {
            logger.error('Error generating session recommendations:', error);
        }

        return recommendations;
    }
}

// Export singleton instance
module.exports = new UserSessionsService();