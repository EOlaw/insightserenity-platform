/**
 * @fileoverview Enterprise Session Management Service
 * @module shared/lib/auth/services/session-service
 * @description Comprehensive session lifecycle management with Redis and database integration
 * @version 2.0.0
 */

const crypto = require('crypto');
const geoip = require('geoip-lite');
const UAParser = require('ua-parser-js');
const logger = require('../../utils/logger').getLogger();
const { AppError } = require('../../utils/app-error');
const config = require('../../../config');
const database = require('../../database');

/**
 * Session Status Enum
 * @enum {string}
 */
const SESSION_STATUS = {
    ACTIVE: 'active',
    EXPIRED: 'expired',
    TERMINATED: 'terminated',
    SUSPENDED: 'suspended',
    REVOKED: 'revoked',
    IDLE: 'idle'
};

/**
 * Session Type Enum
 * @enum {string}
 */
const SESSION_TYPE = {
    WEB: 'web',
    MOBILE: 'mobile',
    DESKTOP: 'desktop',
    API: 'api',
    SSO: 'sso',
    OAUTH: 'oauth'
};

/**
 * Termination Reason Enum
 * @enum {string}
 */
const TERMINATION_REASON = {
    LOGOUT: 'logout',
    TIMEOUT: 'timeout',
    EXPIRED: 'expired',
    FORCED: 'forced',
    SECURITY: 'security',
    ADMIN: 'admin',
    CONCURRENT_LIMIT: 'concurrent_limit',
    SUSPICIOUS_ACTIVITY: 'suspicious_activity',
    PASSWORD_CHANGE: 'password_change',
    ACCOUNT_LOCKED: 'account_locked'
};

/**
 * Enterprise Session Management Service
 * Handles session creation, validation, tracking, and lifecycle management
 * @class SessionService
 */
class SessionService {
    constructor() {
        // Session Configuration
        this.config = {
            sessionTimeout: config.auth?.sessionTimeout || 24 * 60 * 60 * 1000, // 24 hours
            idleTimeout: config.auth?.idleTimeout || 30 * 60 * 1000, // 30 minutes
            absoluteTimeout: config.auth?.absoluteTimeout || 7 * 24 * 60 * 60 * 1000, // 7 days
            maxConcurrentSessions: config.auth?.maxConcurrentSessions || 5,
            enableSessionRotation: config.auth?.enableSessionRotation !== false,
            rotationInterval: config.auth?.sessionRotationInterval || 60 * 60 * 1000, // 1 hour
            enableDeviceTracking: config.auth?.enableDeviceTracking !== false,
            enableLocationTracking: config.auth?.enableLocationTracking !== false,
            enableActivityTracking: config.auth?.enableActivityTracking !== false,
            cleanupInterval: config.auth?.sessionCleanupInterval || 60 * 60 * 1000, // 1 hour
            slidingExpiration: config.auth?.slidingExpiration !== false,
            strictMode: config.auth?.strictSessionMode || false
        };

        // Storage Configuration
        this.storageConfig = {
            useRedis: config.redis?.enabled || false,
            useDatabase: true,
            cacheExpiry: 5 * 60 * 1000, // 5 minutes
            persistenceEnabled: true
        };

        // Security Configuration
        this.securityConfig = {
            enableIPValidation: config.auth?.enableIPValidation || false,
            enableUserAgentValidation: config.auth?.enableUserAgentValidation || false,
            enableFingerprintValidation: config.auth?.enableFingerprintValidation !== false,
            detectSuspiciousActivity: config.auth?.detectSuspiciousActivity !== false,
            maxLocationChanges: config.auth?.maxLocationChanges || 3,
            maxIPChanges: config.auth?.maxIPChanges || 5
        };

        // In-memory session cache (fallback/performance)
        this.sessionCache = new Map();
        this.userSessionIndex = new Map(); // userId -> Set of sessionIds
        
        // Statistics
        this.stats = {
            sessionsCreated: 0,
            sessionsTerminated: 0,
            sessionsExpired: 0,
            sessionsValidated: 0,
            sessionRotations: 0,
            suspiciousActivities: 0,
            concurrentSessionLimitReached: 0
        };

        // Initialize services
        this._initializeDatabase();
        this._startCleanupScheduler();
    }

    /**
     * Initialize database connection
     * @private
     */
    async _initializeDatabase() {
        try {
            this.db = database;
            if (!this.db.isInitialized) {
                await this.db.initialize();
            }
            logger.info('SessionService: Database initialized successfully');
        } catch (error) {
            logger.error('SessionService: Database initialization failed', { error: error.message });
        }
    }

    // ============= SESSION CREATION AND MANAGEMENT =============

    /**
     * Create a new session
     * @param {Object} sessionData - Session creation data
     * @param {string} sessionData.userId - User ID
     * @param {string} sessionData.tenantId - Tenant ID
     * @param {string} [sessionData.ip] - IP address
     * @param {string} [sessionData.userAgent] - User agent string
     * @param {string} [sessionData.deviceFingerprint] - Device fingerprint
     * @param {Object} [sessionData.location] - Location data
     * @param {string} [sessionData.authMethod] - Authentication method
     * @param {Object} [options] - Additional options
     * @returns {Promise<Object>} Created session
     */
    async createSession(sessionData, options = {}) {
        try {
            // Validate required fields
            if (!sessionData.userId || !sessionData.tenantId) {
                throw new AppError('User ID and Tenant ID are required', 400, 'MISSING_REQUIRED_FIELDS');
            }

            // Check concurrent session limit
            const userSessions = await this.getUserActiveSessions(sessionData.userId);
            if (userSessions.length >= this.config.maxConcurrentSessions) {
                await this._handleConcurrentSessionLimit(sessionData.userId, userSessions);
            }

            // Generate session ID and token
            const sessionId = crypto.randomBytes(32).toString('hex');
            const sessionToken = crypto.randomBytes(32).toString('hex');

            // Parse device information
            const deviceInfo = this._parseDeviceInfo(sessionData.userAgent);
            
            // Get location from IP
            const location = sessionData.location || this._getLocationFromIP(sessionData.ip);

            // Calculate expiry times
            const now = new Date();
            const expiresAt = new Date(now.getTime() + this.config.sessionTimeout);
            const absoluteExpiresAt = new Date(now.getTime() + this.config.absoluteTimeout);

            // Create session object
            const session = {
                id: sessionId,
                sessionToken: await this._hashSessionToken(sessionToken),
                userId: sessionData.userId,
                tenantId: sessionData.tenantId,
                
                // Device Information
                device: {
                    fingerprint: sessionData.deviceFingerprint,
                    type: this._detectDeviceType(sessionData.userAgent),
                    browser: deviceInfo.browser,
                    os: deviceInfo.os,
                    userAgent: sessionData.userAgent
                },
                
                // Network Information
                network: {
                    ip: sessionData.ip,
                    ipHistory: [{ ip: sessionData.ip, timestamp: now }],
                    location: location,
                    locationHistory: location ? [{ ...location, timestamp: now }] : []
                },
                
                // Authentication Information
                auth: {
                    method: sessionData.authMethod || 'password',
                    twoFactorVerified: sessionData.twoFactorVerified || false,
                    loginAt: now
                },
                
                // Session State
                state: {
                    status: SESSION_STATUS.ACTIVE,
                    createdAt: now,
                    lastActivity: now,
                    expiresAt: expiresAt,
                    absoluteExpiresAt: absoluteExpiresAt,
                    idleTime: 0,
                    rotationCount: 0
                },
                
                // Activity Tracking
                activity: {
                    requestCount: 0,
                    lastRequest: null,
                    actions: [],
                    pageViews: []
                },
                
                // Security Tracking
                security: {
                    suspiciousActivityCount: 0,
                    securityAlerts: [],
                    ipChanges: 0,
                    locationChanges: 0,
                    validationFailures: 0
                },
                
                // Metadata
                metadata: {
                    sessionType: options.sessionType || SESSION_TYPE.WEB,
                    tags: options.tags || [],
                    customData: options.customData || {}
                }
            };

            // Store session in cache
            this.sessionCache.set(sessionId, session);
            
            // Update user session index
            if (!this.userSessionIndex.has(sessionData.userId)) {
                this.userSessionIndex.set(sessionData.userId, new Set());
            }
            this.userSessionIndex.get(sessionData.userId).add(sessionId);

            // Store in database if persistence enabled
            if (this.storageConfig.persistenceEnabled) {
                await this._persistSession(session);
            }

            // TODO: Store in Redis if available
            if (this.storageConfig.useRedis) {
                // await this._storeInRedis(sessionId, session);
            }

            this.stats.sessionsCreated++;
            logger.info('Session created', {
                sessionId,
                userId: sessionData.userId,
                tenantId: sessionData.tenantId,
                ip: sessionData.ip,
                deviceType: session.device.type
            });

            // Return session with plain token (only time it's exposed)
            return {
                ...session,
                token: sessionToken // Return plain token for client storage
            };

        } catch (error) {
            logger.error('Session creation failed', {
                error: error.message,
                userId: sessionData.userId
            });
            throw error;
        }
    }

    /**
     * Get session by ID
     * @param {string} sessionId - Session ID
     * @param {Object} [options] - Validation options
     * @returns {Promise<Object|null>} Session object or null
     */
    async getSession(sessionId, options = {}) {
        try {
            if (!sessionId) {
                return null;
            }

            // Check cache first
            let session = this.sessionCache.get(sessionId);

            // If not in cache, try database
            if (!session && this.storageConfig.useDatabase) {
                session = await this._getSessionFromDatabase(sessionId);
                if (session) {
                    this.sessionCache.set(sessionId, session);
                }
            }

            if (!session) {
                return null;
            }

            // Validate session
            const validation = await this._validateSession(session, options);
            if (!validation.valid) {
                logger.warn('Session validation failed', {
                    sessionId,
                    reason: validation.reason
                });
                
                // Terminate invalid session
                if (validation.shouldTerminate) {
                    await this.terminateSession(sessionId, validation.reason);
                }
                
                return null;
            }

            // Update activity if enabled
            if (this.config.enableActivityTracking) {
                await this._updateSessionActivity(session, options);
            }

            // Update last activity timestamp
            session.state.lastActivity = new Date();

            // Extend expiry if sliding expiration enabled
            if (this.config.slidingExpiration) {
                session.state.expiresAt = new Date(Date.now() + this.config.sessionTimeout);
            }

            // Check if session rotation is needed
            if (this._shouldRotateSession(session)) {
                await this._rotateSession(session);
            }

            this.stats.sessionsValidated++;
            return session;

        } catch (error) {
            logger.error('Get session failed', {
                error: error.message,
                sessionId
            });
            return null;
        }
    }

    /**
     * Validate session with token
     * @param {string} sessionId - Session ID
     * @param {string} sessionToken - Session token
     * @param {Object} [options] - Validation options
     * @returns {Promise<Object|null>} Session object or null
     */
    async validateSession(sessionId, sessionToken, options = {}) {
        try {
            const session = await this.getSession(sessionId, options);
            
            if (!session) {
                return null;
            }

            // Verify session token
            const hashedToken = await this._hashSessionToken(sessionToken);
            if (session.sessionToken !== hashedToken) {
                session.security.validationFailures++;
                await this._persistSession(session);
                
                logger.warn('Session token mismatch', { sessionId });
                return null;
            }

            // Perform security validations
            const securityCheck = await this._performSecurityValidations(session, options);
            if (!securityCheck.passed) {
                logger.warn('Session security validation failed', {
                    sessionId,
                    reason: securityCheck.reason
                });
                
                if (securityCheck.shouldTerminate) {
                    await this.terminateSession(sessionId, TERMINATION_REASON.SECURITY);
                }
                
                return null;
            }

            return session;

        } catch (error) {
            logger.error('Session validation failed', {
                error: error.message,
                sessionId
            });
            return null;
        }
    }

    /**
     * Extend session expiry
     * @param {string} sessionId - Session ID
     * @param {number} [duration] - Extension duration in milliseconds
     * @returns {Promise<boolean>} Success status
     */
    async extendSession(sessionId, duration = null) {
        try {
            const session = await this.getSession(sessionId);
            
            if (!session) {
                return false;
            }

            const extensionDuration = duration || this.config.sessionTimeout;
            session.state.expiresAt = new Date(Date.now() + extensionDuration);

            // Update in cache and database
            this.sessionCache.set(sessionId, session);
            await this._persistSession(session);

            logger.debug('Session extended', {
                sessionId,
                newExpiry: session.state.expiresAt
            });

            return true;

        } catch (error) {
            logger.error('Session extension failed', {
                error: error.message,
                sessionId
            });
            return false;
        }
    }

    /**
     * Terminate session
     * @param {string} sessionId - Session ID
     * @param {string} [reason] - Termination reason
     * @returns {Promise<boolean>} Success status
     */
    async terminateSession(sessionId, reason = TERMINATION_REASON.LOGOUT) {
        try {
            const session = await this.getSession(sessionId, { skipValidation: true });
            
            if (!session) {
                return false;
            }

            // Update session status
            session.state.status = SESSION_STATUS.TERMINATED;
            session.state.terminatedAt = new Date();
            session.state.terminationReason = reason;

            // Remove from cache
            this.sessionCache.delete(sessionId);

            // Update user session index
            if (this.userSessionIndex.has(session.userId)) {
                this.userSessionIndex.get(session.userId).delete(sessionId);
            }

            // Update in database
            await this._persistSession(session);

            // TODO: Remove from Redis if available
            if (this.storageConfig.useRedis) {
                // await this._removeFromRedis(sessionId);
            }

            this.stats.sessionsTerminated++;
            logger.info('Session terminated', {
                sessionId,
                userId: session.userId,
                reason
            });

            return true;

        } catch (error) {
            logger.error('Session termination failed', {
                error: error.message,
                sessionId
            });
            return false;
        }
    }

    /**
     * Terminate all user sessions
     * @param {string} userId - User ID
     * @param {string} [reason] - Termination reason
     * @param {string} [exceptSessionId] - Session ID to exclude
     * @returns {Promise<number>} Number of sessions terminated
     */
    async terminateUserSessions(userId, reason = TERMINATION_REASON.LOGOUT, exceptSessionId = null) {
        try {
            const sessions = await this.getUserActiveSessions(userId);
            let terminatedCount = 0;

            for (const session of sessions) {
                if (session.id !== exceptSessionId) {
                    const terminated = await this.terminateSession(session.id, reason);
                    if (terminated) {
                        terminatedCount++;
                    }
                }
            }

            logger.info('User sessions terminated', {
                userId,
                count: terminatedCount,
                reason
            });

            return terminatedCount;

        } catch (error) {
            logger.error('Bulk session termination failed', {
                error: error.message,
                userId
            });
            return 0;
        }
    }

    /**
     * Suspend session temporarily
     * @param {string} sessionId - Session ID
     * @param {string} [reason] - Suspension reason
     * @param {number} [duration] - Suspension duration in milliseconds
     * @returns {Promise<boolean>} Success status
     */
    async suspendSession(sessionId, reason = 'security', duration = 3600000) {
        try {
            const session = await this.getSession(sessionId, { skipValidation: true });
            
            if (!session) {
                return false;
            }

            session.state.status = SESSION_STATUS.SUSPENDED;
            session.state.suspendedAt = new Date();
            session.state.suspendedUntil = new Date(Date.now() + duration);
            session.state.suspensionReason = reason;

            // Update in cache and database
            this.sessionCache.set(sessionId, session);
            await this._persistSession(session);

            logger.warn('Session suspended', {
                sessionId,
                userId: session.userId,
                reason,
                until: session.state.suspendedUntil
            });

            return true;

        } catch (error) {
            logger.error('Session suspension failed', {
                error: error.message,
                sessionId
            });
            return false;
        }
    }

    /**
     * Resume suspended session
     * @param {string} sessionId - Session ID
     * @returns {Promise<boolean>} Success status
     */
    async resumeSession(sessionId) {
        try {
            const session = await this.getSession(sessionId, { skipValidation: true });
            
            if (!session || session.state.status !== SESSION_STATUS.SUSPENDED) {
                return false;
            }

            session.state.status = SESSION_STATUS.ACTIVE;
            session.state.suspendedAt = null;
            session.state.suspendedUntil = null;
            session.state.suspensionReason = null;

            // Update in cache and database
            this.sessionCache.set(sessionId, session);
            await this._persistSession(session);

            logger.info('Session resumed', {
                sessionId,
                userId: session.userId
            });

            return true;

        } catch (error) {
            logger.error('Session resume failed', {
                error: error.message,
                sessionId
            });
            return false;
        }
    }

    // ============= SESSION QUERY METHODS =============

    /**
     * Get all active sessions for a user
     * @param {string} userId - User ID
     * @param {Object} [options] - Query options
     * @returns {Promise<Array>} Array of active sessions
     */
    async getUserActiveSessions(userId, options = {}) {
        try {
            const sessions = [];

            // Get from user session index
            const sessionIds = this.userSessionIndex.get(userId);
            if (sessionIds) {
                for (const sessionId of sessionIds) {
                    const session = await this.getSession(sessionId, { skipValidation: true });
                    if (session && session.state.status === SESSION_STATUS.ACTIVE) {
                        sessions.push(session);
                    }
                }
            }

            // Also check database for sessions not in cache
            if (this.storageConfig.useDatabase) {
                const dbSessions = await this._getUserSessionsFromDatabase(userId, {
                    status: SESSION_STATUS.ACTIVE,
                    ...options
                });
                
                for (const dbSession of dbSessions) {
                    if (!sessions.find(s => s.id === dbSession.id)) {
                        sessions.push(dbSession);
                        this.sessionCache.set(dbSession.id, dbSession);
                    }
                }
            }

            // Sort by creation date (newest first)
            sessions.sort((a, b) => b.state.createdAt - a.state.createdAt);

            return sessions;

        } catch (error) {
            logger.error('Get user active sessions failed', {
                error: error.message,
                userId
            });
            return [];
        }
    }

    /**
     * Get session history for a user
     * @param {string} userId - User ID
     * @param {Object} [options] - Query options
     * @returns {Promise<Array>} Array of sessions
     */
    async getUserSessionHistory(userId, options = {}) {
        try {
            const limit = options.limit || 50;
            const offset = options.offset || 0;

            // Get from database
            if (this.storageConfig.useDatabase) {
                return await this._getUserSessionsFromDatabase(userId, {
                    limit,
                    offset,
                    sortBy: 'createdAt',
                    sortOrder: 'desc'
                });
            }

            return [];

        } catch (error) {
            logger.error('Get user session history failed', {
                error: error.message,
                userId
            });
            return [];
        }
    }

    /**
     * Get sessions by device
     * @param {string} userId - User ID
     * @param {string} deviceFingerprint - Device fingerprint
     * @returns {Promise<Array>} Array of sessions
     */
    async getDeviceSessions(userId, deviceFingerprint) {
        try {
            const allSessions = await this.getUserActiveSessions(userId);
            return allSessions.filter(s => s.device.fingerprint === deviceFingerprint);

        } catch (error) {
            logger.error('Get device sessions failed', {
                error: error.message,
                userId,
                deviceFingerprint
            });
            return [];
        }
    }

    /**
     * Get sessions by IP address
     * @param {string} userId - User ID
     * @param {string} ip - IP address
     * @returns {Promise<Array>} Array of sessions
     */
    async getIPSessions(userId, ip) {
        try {
            const allSessions = await this.getUserActiveSessions(userId);
            return allSessions.filter(s => s.network.ip === ip);

        } catch (error) {
            logger.error('Get IP sessions failed', {
                error: error.message,
                userId,
                ip
            });
            return [];
        }
    }

    // ============= SESSION ACTIVITY TRACKING =============

    /**
     * Record session activity
     * @param {string} sessionId - Session ID
     * @param {Object} activityData - Activity data
     * @returns {Promise<boolean>} Success status
     */
    async recordActivity(sessionId, activityData) {
        try {
            const session = await this.getSession(sessionId);
            
            if (!session) {
                return false;
            }

            // Update activity counters
            session.activity.requestCount++;
            session.activity.lastRequest = new Date();

            // Record action if provided
            if (activityData.action) {
                session.activity.actions.push({
                    action: activityData.action,
                    timestamp: new Date(),
                    metadata: activityData.metadata || {}
                });

                // Keep only last 100 actions
                if (session.activity.actions.length > 100) {
                    session.activity.actions = session.activity.actions.slice(-100);
                }
            }

            // Record page view if provided
            if (activityData.pageView) {
                session.activity.pageViews.push({
                    path: activityData.pageView,
                    timestamp: new Date(),
                    referrer: activityData.referrer
                });

                // Keep only last 50 page views
                if (session.activity.pageViews.length > 50) {
                    session.activity.pageViews = session.activity.pageViews.slice(-50);
                }
            }

            // Update idle time
            const now = Date.now();
            const lastActivity = session.state.lastActivity.getTime();
            session.state.idleTime = now - lastActivity;

            // Update last activity
            session.state.lastActivity = new Date();

            // Update in cache and database
            this.sessionCache.set(sessionId, session);
            await this._persistSession(session);

            return true;

        } catch (error) {
            logger.error('Record activity failed', {
                error: error.message,
                sessionId
            });
            return false;
        }
    }

    /**
     * Update session network information
     * @param {string} sessionId - Session ID
     * @param {string} ip - New IP address
     * @param {string} [userAgent] - User agent
     * @returns {Promise<boolean>} Success status
     */
    async updateNetworkInfo(sessionId, ip, userAgent = null) {
        try {
            const session = await this.getSession(sessionId);
            
            if (!session) {
                return false;
            }

            // Check for IP change
            if (session.network.ip !== ip) {
                session.network.ipHistory.push({
                    ip: ip,
                    timestamp: new Date()
                });
                session.network.ip = ip;
                session.security.ipChanges++;

                // Get new location
                const newLocation = this._getLocationFromIP(ip);
                if (newLocation) {
                    // Check for location change
                    const lastLocation = session.network.location;
                    if (!lastLocation || lastLocation.country !== newLocation.country) {
                        session.network.locationHistory.push({
                            ...newLocation,
                            timestamp: new Date()
                        });
                        session.network.location = newLocation;
                        session.security.locationChanges++;
                    }
                }

                // Keep only last 20 entries
                if (session.network.ipHistory.length > 20) {
                    session.network.ipHistory = session.network.ipHistory.slice(-20);
                }
                if (session.network.locationHistory.length > 20) {
                    session.network.locationHistory = session.network.locationHistory.slice(-20);
                }

                logger.warn('Session IP changed', {
                    sessionId,
                    oldIP: session.network.ip,
                    newIP: ip,
                    ipChanges: session.security.ipChanges
                });
            }

            // Update user agent if provided
            if (userAgent && session.device.userAgent !== userAgent) {
                session.device.userAgent = userAgent;
                const deviceInfo = this._parseDeviceInfo(userAgent);
                session.device.browser = deviceInfo.browser;
                session.device.os = deviceInfo.os;

                logger.warn('Session user agent changed', { sessionId });
            }

            // Update in cache and database
            this.sessionCache.set(sessionId, session);
            await this._persistSession(session);

            return true;

        } catch (error) {
            logger.error('Update network info failed', {
                error: error.message,
                sessionId
            });
            return false;
        }
    }

    // ============= SESSION STATISTICS =============

    /**
     * Get session statistics for a user
     * @param {string} userId - User ID
     * @returns {Promise<Object>} Session statistics
     */
    async getUserSessionStats(userId) {
        try {
            const activeSessions = await this.getUserActiveSessions(userId);
            const history = await this.getUserSessionHistory(userId, { limit: 100 });

            const stats = {
                activeSessionCount: activeSessions.length,
                totalSessions: history.length,
                deviceTypes: {},
                browsers: {},
                locations: {},
                averageSessionDuration: 0,
                totalRequests: 0,
                lastActivity: null
            };

            // Calculate statistics
            let totalDuration = 0;
            for (const session of history) {
                // Count device types
                const deviceType = session.device.type;
                stats.deviceTypes[deviceType] = (stats.deviceTypes[deviceType] || 0) + 1;

                // Count browsers
                const browser = session.device.browser?.name || 'Unknown';
                stats.browsers[browser] = (stats.browsers[browser] || 0) + 1;

                // Count locations
                if (session.network.location) {
                    const country = session.network.location.country;
                    stats.locations[country] = (stats.locations[country] || 0) + 1;
                }

                // Calculate duration
                const createdAt = new Date(session.state.createdAt);
                const endedAt = session.state.terminatedAt || new Date();
                totalDuration += (endedAt - createdAt);

                // Total requests
                stats.totalRequests += session.activity.requestCount || 0;

                // Last activity
                if (!stats.lastActivity || session.state.lastActivity > stats.lastActivity) {
                    stats.lastActivity = session.state.lastActivity;
                }
            }

            // Calculate average duration
            if (history.length > 0) {
                stats.averageSessionDuration = Math.floor(totalDuration / history.length);
            }

            return stats;

        } catch (error) {
            logger.error('Get user session stats failed', {
                error: error.message,
                userId
            });
            return null;
        }
    }

    /**
     * Get service-wide statistics
     * @returns {Object} Service statistics
     */
    getServiceStats() {
        return {
            ...this.stats,
            cacheSize: this.sessionCache.size,
            activeUsers: this.userSessionIndex.size
        };
    }

    // ============= SESSION CLEANUP =============

    /**
     * Clean up expired sessions
     * @returns {Promise<number>} Number of sessions cleaned
     */
    async cleanupExpiredSessions() {
        try {
            let cleanedCount = 0;
            const now = new Date();

            // Clean from cache
            for (const [sessionId, session] of this.sessionCache.entries()) {
                if (this._isSessionExpired(session, now)) {
                    session.state.status = SESSION_STATUS.EXPIRED;
                    session.state.terminatedAt = now;
                    session.state.terminationReason = TERMINATION_REASON.EXPIRED;
                    
                    await this._persistSession(session);
                    this.sessionCache.delete(sessionId);
                    
                    if (this.userSessionIndex.has(session.userId)) {
                        this.userSessionIndex.get(session.userId).delete(sessionId);
                    }
                    
                    cleanedCount++;
                    this.stats.sessionsExpired++;
                }
            }

            // Clean from database
            if (this.storageConfig.useDatabase) {
                // TODO: Implement database cleanup
                // const dbCleaned = await this._cleanupDatabaseSessions(now);
                // cleanedCount += dbCleaned;
            }

            if (cleanedCount > 0) {
                logger.info('Expired sessions cleaned', { count: cleanedCount });
            }

            return cleanedCount;

        } catch (error) {
            logger.error('Session cleanup failed', { error: error.message });
            return 0;
        }
    }

    /**
     * Start automatic cleanup scheduler
     * @private
     */
    _startCleanupScheduler() {
        setInterval(async () => {
            await this.cleanupExpiredSessions();
        }, this.config.cleanupInterval);

        logger.info('Session cleanup scheduler started', {
            interval: this.config.cleanupInterval
        });
    }

    // ============= PRIVATE HELPER METHODS =============

    /**
     * Validate session
     * @private
     */
    async _validateSession(session, options = {}) {
        if (options.skipValidation) {
            return { valid: true };
        }

        const now = new Date();

        // Check if session is expired
        if (this._isSessionExpired(session, now)) {
            return {
                valid: false,
                reason: TERMINATION_REASON.EXPIRED,
                shouldTerminate: true
            };
        }

        // Check if session is suspended
        if (session.state.status === SESSION_STATUS.SUSPENDED) {
            if (session.state.suspendedUntil && now > session.state.suspendedUntil) {
                // Auto-resume if suspension period ended
                await this.resumeSession(session.id);
            } else {
                return {
                    valid: false,
                    reason: 'suspended',
                    shouldTerminate: false
                };
            }
        }

        // Check if session is terminated
        if (session.state.status === SESSION_STATUS.TERMINATED) {
            return {
                valid: false,
                reason: TERMINATION_REASON.LOGOUT,
                shouldTerminate: false
            };
        }

        // Check idle timeout
        if (this.config.idleTimeout) {
            const idleTime = now - session.state.lastActivity;
            if (idleTime > this.config.idleTimeout) {
                return {
                    valid: false,
                    reason: TERMINATION_REASON.TIMEOUT,
                    shouldTerminate: true
                };
            }
        }

        return { valid: true };
    }

    /**
     * Perform security validations
     * @private
     */
    async _performSecurityValidations(session, options = {}) {
        const result = {
            passed: true,
            reason: null,
            shouldTerminate: false
        };

        // IP validation
        if (this.securityConfig.enableIPValidation && options.ip) {
            if (session.network.ip !== options.ip) {
                if (session.security.ipChanges >= this.securityConfig.maxIPChanges) {
                    result.passed = false;
                    result.reason = 'max_ip_changes_exceeded';
                    result.shouldTerminate = true;
                    this.stats.suspiciousActivities++;
                }
            }
        }

        // Location validation
        if (this.securityConfig.detectSuspiciousActivity && options.ip) {
            const currentLocation = this._getLocationFromIP(options.ip);
            if (currentLocation && session.network.location) {
                if (currentLocation.country !== session.network.location.country) {
                    if (session.security.locationChanges >= this.securityConfig.maxLocationChanges) {
                        result.passed = false;
                        result.reason = 'suspicious_location_changes';
                        result.shouldTerminate = true;
                        this.stats.suspiciousActivities++;
                    }
                }
            }
        }

        // Fingerprint validation
        if (this.securityConfig.enableFingerprintValidation && options.fingerprint) {
            if (session.device.fingerprint !== options.fingerprint) {
                result.passed = false;
                result.reason = 'fingerprint_mismatch';
                result.shouldTerminate = true;
                this.stats.suspiciousActivities++;
            }
        }

        return result;
    }

    /**
     * Check if session should be rotated
     * @private
     */
    _shouldRotateSession(session) {
        if (!this.config.enableSessionRotation) {
            return false;
        }

        const now = Date.now();
        const lastRotation = session.state.lastRotation || session.state.createdAt;
        const timeSinceRotation = now - lastRotation.getTime();

        return timeSinceRotation >= this.config.rotationInterval;
    }

    /**
     * Rotate session
     * @private
     */
    async _rotateSession(session) {
        try {
            const newSessionToken = crypto.randomBytes(32).toString('hex');
            session.sessionToken = await this._hashSessionToken(newSessionToken);
            session.state.lastRotation = new Date();
            session.state.rotationCount++;

            await this._persistSession(session);
            
            this.stats.sessionRotations++;
            logger.debug('Session rotated', {
                sessionId: session.id,
                rotationCount: session.state.rotationCount
            });

            return newSessionToken;
        } catch (error) {
            logger.error('Session rotation failed', {
                error: error.message,
                sessionId: session.id
            });
            return null;
        }
    }

    /**
     * Update session activity
     * @private
     */
    async _updateSessionActivity(session, options = {}) {
        if (options.action) {
            await this.recordActivity(session.id, {
                action: options.action,
                metadata: options.actionMetadata
            });
        }

        if (options.ip || options.userAgent) {
            await this.updateNetworkInfo(session.id, options.ip, options.userAgent);
        }
    }

    /**
     * Handle concurrent session limit
     * @private
     */
    async _handleConcurrentSessionLimit(userId, existingSessions) {
        // Sort by last activity (oldest first)
        existingSessions.sort((a, b) => a.state.lastActivity - b.state.lastActivity);

        // Terminate oldest session
        const oldestSession = existingSessions[0];
        await this.terminateSession(oldestSession.id, TERMINATION_REASON.CONCURRENT_LIMIT);

        this.stats.concurrentSessionLimitReached++;
        logger.info('Concurrent session limit reached, terminated oldest session', {
            userId,
            terminatedSessionId: oldestSession.id
        });
    }

    /**
     * Check if session is expired
     * @private
     */
    _isSessionExpired(session, now = new Date()) {
        return (
            session.state.expiresAt < now ||
            session.state.absoluteExpiresAt < now
        );
    }

    /**
     * Hash session token
     * @private
     */
    async _hashSessionToken(token) {
        return crypto.createHash('sha256').update(token).digest('hex');
    }

    /**
     * Parse device information from user agent
     * @private
     */
    _parseDeviceInfo(userAgent) {
        if (!userAgent) {
            return { browser: null, os: null };
        }

        try {
            const parser = new UAParser(userAgent);
            const result = parser.getResult();

            return {
                browser: {
                    name: result.browser.name,
                    version: result.browser.version
                },
                os: {
                    name: result.os.name,
                    version: result.os.version
                }
            };
        } catch (error) {
            return { browser: null, os: null };
        }
    }

    /**
     * Detect device type from user agent
     * @private
     */
    _detectDeviceType(userAgent) {
        if (!userAgent) return SESSION_TYPE.WEB;

        const ua = userAgent.toLowerCase();
        if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
            return SESSION_TYPE.MOBILE;
        }
        if (ua.includes('electron') || ua.includes('desktop')) {
            return SESSION_TYPE.DESKTOP;
        }
        return SESSION_TYPE.WEB;
    }

    /**
     * Get location from IP address
     * @private
     */
    _getLocationFromIP(ip) {
        if (!ip) return null;

        try {
            const geo = geoip.lookup(ip);
            return geo ? {
                country: geo.country,
                city: geo.city,
                region: geo.region,
                timezone: geo.timezone,
                coordinates: geo.ll
            } : null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Persist session to database
     * @private
     */
    async _persistSession(session) {
        try {
            // TODO: Implement database persistence
            // const SessionModel = this.db.getModel('Session');
            // await SessionModel.findOneAndUpdate(
            //     { id: session.id },
            //     session,
            //     { upsert: true }
            // );
        } catch (error) {
            logger.error('Session persistence failed', {
                error: error.message,
                sessionId: session.id
            });
        }
    }

    /**
     * Get session from database
     * @private
     */
    async _getSessionFromDatabase(sessionId) {
        try {
            // TODO: Implement database retrieval
            // const SessionModel = this.db.getModel('Session');
            // return await SessionModel.findOne({ id: sessionId });
            return null;
        } catch (error) {
            logger.error('Get session from database failed', {
                error: error.message,
                sessionId
            });
            return null;
        }
    }

    /**
     * Get user sessions from database
     * @private
     */
    async _getUserSessionsFromDatabase(userId, options = {}) {
        try {
            // TODO: Implement database retrieval
            // const SessionModel = this.db.getModel('Session');
            // return await SessionModel.find({ userId }).limit(options.limit);
            return [];
        } catch (error) {
            logger.error('Get user sessions from database failed', {
                error: error.message,
                userId
            });
            return [];
        }
    }
}

// Export singleton instance
module.exports = new SessionService();