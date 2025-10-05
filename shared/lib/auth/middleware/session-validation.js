/**
 * @fileoverview Enterprise Session Validation Middleware
 * @module shared/lib/auth/middleware/session-validation
 * @description Comprehensive session validation with security checks, activity tracking, and multi-device support
 * @version 2.0.0
 */

const { AppError } = require('../../utils/app-error');
const logger = require('../../utils/logger');
const SessionService = require('../services/session-service');
const database = require('../../database');

/**
 * Session Sources
 * @enum {string}
 */
const SESSION_SOURCES = {
    HEADER: 'header',
    COOKIE: 'cookie',
    QUERY: 'query',
    TOKEN: 'token'
};

/**
 * Session Status
 * @enum {string}
 */
const SESSION_STATUS = {
    ACTIVE: 'active',
    EXPIRED: 'expired',
    TERMINATED: 'terminated',
    SUSPENDED: 'suspended',
    INVALID: 'invalid'
};

/**
 * Session validation statistics
 * @type {Object}
 */
const sessionStats = {
    totalValidations: 0,
    successfulValidations: 0,
    failedValidations: 0,
    expiredSessions: 0,
    invalidSessions: 0,
    suspendedSessions: 0,
    securityViolations: 0,
    concurrentSessionViolations: 0,
    deviceMismatches: 0
};

/**
 * Extract session ID from request
 * @param {Object} req - Express request object
 * @param {Array<string>} sources - Sources to check
 * @returns {Object} Session ID and source
 * @private
 */
function extractSessionId(req, sources) {
    let sessionId = null;
    let source = null;

    for (const sourceType of sources) {
        switch (sourceType) {
            case SESSION_SOURCES.HEADER:
                sessionId = req.headers['x-session-id'] || 
                           req.headers['session-id'];
                if (sessionId) {
                    source = SESSION_SOURCES.HEADER;
                }
                break;

            case SESSION_SOURCES.COOKIE:
                if (req.cookies) {
                    sessionId = req.cookies.sessionId || 
                               req.cookies.session_id ||
                               req.cookies.sid;
                    if (sessionId) {
                        source = SESSION_SOURCES.COOKIE;
                    }
                }
                break;

            case SESSION_SOURCES.QUERY:
                sessionId = req.query.sessionId || req.query.sid;
                if (sessionId) {
                    source = SESSION_SOURCES.QUERY;
                    
                    // Log warning for query-based session in production
                    if (process.env.NODE_ENV === 'production') {
                        logger.warn('Session ID provided in query string', {
                            path: req.path,
                            ip: req.ip
                        });
                    }
                }
                break;

            case SESSION_SOURCES.TOKEN:
                // Extract from JWT token payload if available
                if (req.auth?.tokenPayload?.sessionId) {
                    sessionId = req.auth.tokenPayload.sessionId;
                    source = SESSION_SOURCES.TOKEN;
                } else if (req.user?.sessionId) {
                    sessionId = req.user.sessionId;
                    source = SESSION_SOURCES.TOKEN;
                }
                break;

            default:
                logger.warn('Unknown session source type', { sourceType });
        }

        if (sessionId) {
            break;
        }
    }

    return { sessionId, source };
}

/**
 * Validate session exists and is active
 * @param {string} sessionId - Session ID
 * @param {Object} options - Validation options
 * @returns {Promise<Object>} Validation result
 * @private
 */
async function validateSessionExists(sessionId, options = {}) {
    try {
        const session = await SessionService.getSession(sessionId, {
            includeMetadata: true,
            includeActivity: options.includeActivity || false
        });

        if (!session) {
            return {
                valid: false,
                code: 'SESSION_NOT_FOUND',
                message: 'Session not found or has been terminated',
                statusCode: 401
            };
        }

        // Check session status
        if (session.status !== SESSION_STATUS.ACTIVE) {
            let code, message;
            
            switch (session.status) {
                case SESSION_STATUS.EXPIRED:
                    code = 'SESSION_EXPIRED';
                    message = 'Session has expired. Please login again.';
                    break;
                case SESSION_STATUS.TERMINATED:
                    code = 'SESSION_TERMINATED';
                    message = 'Session has been terminated. Please login again.';
                    break;
                case SESSION_STATUS.SUSPENDED:
                    code = 'SESSION_SUSPENDED';
                    message = 'Session has been suspended due to suspicious activity.';
                    break;
                default:
                    code = 'SESSION_INVALID';
                    message = 'Session is not in a valid state.';
            }

            return {
                valid: false,
                code: code,
                message: message,
                statusCode: 401,
                session: session
            };
        }

        // Check if session is expired
        if (session.expiresAt && new Date() > new Date(session.expiresAt)) {
            // Mark session as expired
            await SessionService.updateSession(sessionId, {
                status: SESSION_STATUS.EXPIRED
            }).catch(err => {
                logger.error('Failed to mark session as expired', {
                    error: err.message,
                    sessionId: sessionId
                });
            });

            return {
                valid: false,
                code: 'SESSION_EXPIRED',
                message: 'Session has expired. Please login again.',
                statusCode: 401,
                session: session
            };
        }

        // Check idle timeout
        if (session.idleTimeout && session.lastActivityAt) {
            const idleTime = Date.now() - new Date(session.lastActivityAt).getTime();
            const maxIdleTime = session.idleTimeout * 1000;

            if (idleTime > maxIdleTime) {
                await SessionService.terminateSession(sessionId, {
                    reason: 'idle_timeout'
                }).catch(err => {
                    logger.error('Failed to terminate idle session', {
                        error: err.message,
                        sessionId: sessionId
                    });
                });

                return {
                    valid: false,
                    code: 'SESSION_IDLE_TIMEOUT',
                    message: 'Session expired due to inactivity. Please login again.',
                    statusCode: 401
                };
            }
        }

        return {
            valid: true,
            session: session
        };

    } catch (error) {
        logger.error('Session validation error', {
            error: error.message,
            sessionId: sessionId
        });

        return {
            valid: false,
            code: 'SESSION_VALIDATION_ERROR',
            message: 'Failed to validate session',
            statusCode: 500,
            error: error.message
        };
    }
}

/**
 * Perform security checks on session
 * @param {Object} req - Express request object
 * @param {Object} session - Session object
 * @param {Object} options - Security check options
 * @returns {Object} Security check result
 * @private
 */
function performSessionSecurityChecks(req, session, options = {}) {
    const violations = [];

    // IP address validation
    if (options.validateIP !== false && session.ipAddress) {
        const currentIP = req.ip || req.connection?.remoteAddress;
        
        if (session.ipAddress !== currentIP) {
            // Check if IP change is within same subnet (less strict)
            const sessionIPParts = session.ipAddress.split('.');
            const currentIPParts = currentIP.split('.');
            
            const sameSubnet = sessionIPParts[0] === currentIPParts[0] &&
                              sessionIPParts[1] === currentIPParts[1] &&
                              sessionIPParts[2] === currentIPParts[2];

            if (!sameSubnet || options.strictIP) {
                violations.push({
                    type: 'IP_CHANGE',
                    severity: options.strictIP ? 'high' : 'medium',
                    message: 'IP address has changed since session creation',
                    sessionIP: session.ipAddress,
                    currentIP: currentIP
                });
            }
        }
    }

    // User-Agent validation
    if (options.validateUserAgent !== false && session.userAgent) {
        const currentUA = req.get('user-agent');
        
        if (currentUA && session.userAgent !== currentUA) {
            // Check for significant UA changes (browser/OS change)
            const isSignificantChange = !currentUA.includes(session.userAgent.split('/')[0]);
            
            if (isSignificantChange) {
                violations.push({
                    type: 'USER_AGENT_CHANGE',
                    severity: 'high',
                    message: 'User-Agent has changed significantly',
                    sessionUA: session.userAgent,
                    currentUA: currentUA
                });
            } else {
                violations.push({
                    type: 'USER_AGENT_CHANGE',
                    severity: 'low',
                    message: 'User-Agent has minor changes',
                    sessionUA: session.userAgent,
                    currentUA: currentUA
                });
            }
        }
    }

    // Device fingerprint validation
    if (options.validateFingerprint !== false && session.deviceFingerprint) {
        const currentFingerprint = req.body?.deviceFingerprint || 
                                  req.headers['x-device-fingerprint'];
        
        if (currentFingerprint && session.deviceFingerprint !== currentFingerprint) {
            violations.push({
                type: 'FINGERPRINT_MISMATCH',
                severity: 'high',
                message: 'Device fingerprint does not match'
            });
        }
    }

    // Check for suspicious activity patterns
    if (session.security?.suspiciousActivityCount > 0) {
        violations.push({
            type: 'SUSPICIOUS_ACTIVITY',
            severity: 'high',
            message: 'Session has recorded suspicious activity',
            count: session.security.suspiciousActivityCount
        });
    }

    // Geolocation change detection (if available)
    if (options.validateGeolocation && session.location && req.location) {
        const distance = calculateDistance(
            session.location.coordinates,
            req.location.coordinates
        );
        
        // Flag if distance > 500km (unrealistic for same session)
        if (distance > 500) {
            violations.push({
                type: 'GEOLOCATION_JUMP',
                severity: 'high',
                message: 'Unusual geographic location change detected',
                distance: distance
            });
        }
    }

    const hasHighSeverityViolations = violations.some(v => v.severity === 'high');

    return {
        valid: !hasHighSeverityViolations || !options.strict,
        violations: violations,
        highSeverityCount: violations.filter(v => v.severity === 'high').length,
        mediumSeverityCount: violations.filter(v => v.severity === 'medium').length
    };
}

/**
 * Calculate distance between two coordinates (Haversine formula)
 * @param {Array<number>} coords1 - [longitude, latitude]
 * @param {Array<number>} coords2 - [longitude, latitude]
 * @returns {number} Distance in kilometers
 * @private
 */
function calculateDistance(coords1, coords2) {
    const R = 6371; // Earth's radius in km
    const dLat = toRad(coords2[1] - coords1[1]);
    const dLon = toRad(coords2[0] - coords1[0]);
    
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(toRad(coords1[1])) * Math.cos(toRad(coords2[1])) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

/**
 * Convert degrees to radians
 * @param {number} degrees - Degrees
 * @returns {number} Radians
 * @private
 */
function toRad(degrees) {
    return degrees * (Math.PI / 180);
}

/**
 * Check concurrent session limits
 * @param {string} userId - User ID
 * @param {string} currentSessionId - Current session ID
 * @param {Object} options - Options
 * @returns {Promise<Object>} Check result
 * @private
 */
async function checkConcurrentSessions(userId, currentSessionId, options = {}) {
    try {
        const maxConcurrentSessions = options.maxConcurrentSessions || 5;
        
        const activeSessions = await SessionService.getUserSessions(userId, {
            status: SESSION_STATUS.ACTIVE
        });

        if (activeSessions.length > maxConcurrentSessions) {
            // Check if current session is among active sessions
            const currentSessionExists = activeSessions.some(
                s => s.sessionId === currentSessionId
            );

            if (!currentSessionExists) {
                return {
                    valid: false,
                    code: 'MAX_CONCURRENT_SESSIONS',
                    message: `Maximum concurrent sessions exceeded (${maxConcurrentSessions})`,
                    activeSessions: activeSessions.length
                };
            }

            // Terminate oldest sessions if over limit
            if (options.autoTerminateOldest) {
                const sessionsToTerminate = activeSessions
                    .filter(s => s.sessionId !== currentSessionId)
                    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
                    .slice(0, activeSessions.length - maxConcurrentSessions);

                for (const session of sessionsToTerminate) {
                    await SessionService.terminateSession(session.sessionId, {
                        reason: 'max_concurrent_sessions_exceeded'
                    }).catch(err => {
                        logger.error('Failed to terminate old session', {
                            error: err.message,
                            sessionId: session.sessionId
                        });
                    });
                }

                logger.info('Terminated old sessions due to concurrent limit', {
                    userId: userId,
                    terminated: sessionsToTerminate.length
                });
            }
        }

        return { valid: true };

    } catch (error) {
        logger.error('Error checking concurrent sessions', {
            error: error.message,
            userId: userId
        });
        
        // Fail open
        return { valid: true };
    }
}

/**
 * Validate user session match
 * @param {Object} req - Express request object
 * @param {Object} session - Session object
 * @returns {Object} Validation result
 * @private
 */
function validateUserSessionMatch(req, session) {
    if (!req.user || !session.userId) {
        return {
            valid: false,
            code: 'MISSING_USER_DATA',
            message: 'User or session user data is missing'
        };
    }

    const requestUserId = req.user.id || req.user._id;
    const sessionUserId = session.userId.toString();

    if (requestUserId.toString() !== sessionUserId) {
        return {
            valid: false,
            code: 'USER_SESSION_MISMATCH',
            message: 'Session does not belong to the authenticated user',
            requestUserId: requestUserId,
            sessionUserId: sessionUserId
        };
    }

    return { valid: true };
}

/**
 * Main session validation middleware factory
 * @param {Object} options - Middleware configuration options
 * @param {boolean} [options.required=true] - Whether session is required
 * @param {Array<string>} [options.sources] - Where to look for session ID
 * @param {boolean} [options.validateUser=true] - Validate session belongs to user
 * @param {boolean} [options.validateIP=true] - Validate IP address
 * @param {boolean} [options.validateUserAgent=true] - Validate User-Agent
 * @param {boolean} [options.validateFingerprint=false] - Validate device fingerprint
 * @param {boolean} [options.strict=false] - Strict security mode
 * @param {boolean} [options.trackActivity=true] - Track session activity
 * @param {boolean} [options.refreshExpiry=false] - Refresh session expiry on activity
 * @param {boolean} [options.checkConcurrent=false] - Check concurrent session limits
 * @param {number} [options.maxConcurrentSessions=5] - Max concurrent sessions
 * @param {boolean} [options.autoTerminateOldest=false] - Auto-terminate oldest sessions
 * @returns {Function} Express middleware function
 */
function validateSession(options = {}) {
    const config = {
        required: options.required !== false,
        sources: options.sources || [
            SESSION_SOURCES.HEADER,
            SESSION_SOURCES.COOKIE,
            SESSION_SOURCES.TOKEN
        ],
        validateUser: options.validateUser !== false,
        validateIP: options.validateIP !== false,
        validateUserAgent: options.validateUserAgent !== false,
        validateFingerprint: options.validateFingerprint || false,
        validateGeolocation: options.validateGeolocation || false,
        strict: options.strict || false,
        strictIP: options.strictIP || false,
        trackActivity: options.trackActivity !== false,
        refreshExpiry: options.refreshExpiry || false,
        checkConcurrent: options.checkConcurrent || false,
        maxConcurrentSessions: options.maxConcurrentSessions || 5,
        autoTerminateOldest: options.autoTerminateOldest || false,
        includeActivity: options.includeActivity || false
    };

    return async (req, res, next) => {
        try {
            sessionStats.totalValidations++;

            // Extract session ID
            const { sessionId, source } = extractSessionId(req, config.sources);

            // Handle missing session ID
            if (!sessionId) {
                if (!config.required) {
                    req.session = null;
                    req.sessionValidated = false;
                    return next();
                }

                sessionStats.failedValidations++;
                return next(new AppError(
                    'Session ID is required. Please provide a valid session.',
                    401,
                    'MISSING_SESSION_ID'
                ));
            }

            // Validate session exists and is active
            const existsValidation = await validateSessionExists(sessionId, {
                includeActivity: config.includeActivity
            });

            if (!existsValidation.valid) {
                sessionStats.failedValidations++;

                // Track specific failure types
                switch (existsValidation.code) {
                    case 'SESSION_EXPIRED':
                    case 'SESSION_IDLE_TIMEOUT':
                        sessionStats.expiredSessions++;
                        break;
                    case 'SESSION_SUSPENDED':
                        sessionStats.suspendedSessions++;
                        break;
                    default:
                        sessionStats.invalidSessions++;
                }

                logger.warn('Session validation failed', {
                    sessionId: sessionId,
                    code: existsValidation.code,
                    message: existsValidation.message
                });

                return next(new AppError(
                    existsValidation.message,
                    existsValidation.statusCode,
                    existsValidation.code
                ));
            }

            const session = existsValidation.session;

            // Validate user-session match
            if (config.validateUser && req.user) {
                const userValidation = validateUserSessionMatch(req, session);
                
                if (!userValidation.valid) {
                    sessionStats.failedValidations++;
                    sessionStats.securityViolations++;
                    
                    logger.warn('User-session mismatch detected', {
                        sessionId: sessionId,
                        requestUserId: userValidation.requestUserId,
                        sessionUserId: userValidation.sessionUserId
                    });

                    return next(new AppError(
                        userValidation.message,
                        403,
                        userValidation.code
                    ));
                }
            }

            // Perform security checks
            const securityCheck = performSessionSecurityChecks(req, session, {
                validateIP: config.validateIP,
                validateUserAgent: config.validateUserAgent,
                validateFingerprint: config.validateFingerprint,
                validateGeolocation: config.validateGeolocation,
                strict: config.strict,
                strictIP: config.strictIP
            });

            if (!securityCheck.valid) {
                sessionStats.failedValidations++;
                sessionStats.securityViolations++;
                
                logger.warn('Session security check failed', {
                    sessionId: sessionId,
                    violations: securityCheck.violations,
                    highSeverity: securityCheck.highSeverityCount
                });

                // Record security violation
                await SessionService.recordSecurityViolation(sessionId, {
                    violations: securityCheck.violations,
                    ip: req.ip,
                    userAgent: req.get('user-agent')
                }).catch(err => {
                    logger.error('Failed to record security violation', {
                        error: err.message
                    });
                });

                return next(new AppError(
                    'Session security validation failed',
                    401,
                    'SESSION_SECURITY_VIOLATION',
                    { violations: securityCheck.violations }
                ));
            }

            // Check concurrent sessions if enabled
            if (config.checkConcurrent && session.userId) {
                const concurrentCheck = await checkConcurrentSessions(
                    session.userId,
                    sessionId,
                    {
                        maxConcurrentSessions: config.maxConcurrentSessions,
                        autoTerminateOldest: config.autoTerminateOldest
                    }
                );

                if (!concurrentCheck.valid) {
                    sessionStats.failedValidations++;
                    sessionStats.concurrentSessionViolations++;
                    
                    return next(new AppError(
                        concurrentCheck.message,
                        403,
                        concurrentCheck.code,
                        { activeSessions: concurrentCheck.activeSessions }
                    ));
                }
            }

            // Track activity if enabled
            if (config.trackActivity) {
                await SessionService.recordActivity(sessionId, {
                    action: `${req.method} ${req.path}`,
                    pageView: req.path,
                    metadata: {
                        userAgent: req.get('user-agent'),
                        ip: req.ip
                    }
                }).catch(err => {
                    logger.error('Failed to record session activity', {
                        error: err.message,
                        sessionId: sessionId
                    });
                });
            }

            // Refresh expiry if enabled
            if (config.refreshExpiry) {
                await SessionService.refreshSession(sessionId).catch(err => {
                    logger.error('Failed to refresh session', {
                        error: err.message,
                        sessionId: sessionId
                    });
                });
            }

            // Attach session to request
            req.session = session;
            req.sessionId = sessionId;
            req.sessionSource = source;
            req.sessionValidated = true;

            // Log security warnings if present
            if (securityCheck.violations && securityCheck.violations.length > 0) {
                logger.warn('Session validated with security warnings', {
                    sessionId: sessionId,
                    violations: securityCheck.violations.filter(v => v.severity !== 'low')
                });
            }

            sessionStats.successfulValidations++;

            next();

        } catch (error) {
            sessionStats.failedValidations++;
            
            logger.error('Session validation middleware error', {
                error: error.message,
                stack: error.stack,
                path: req.path
            });

            if (error instanceof AppError) {
                return next(error);
            }

            next(new AppError(
                'Session validation failed',
                500,
                'SESSION_VALIDATION_ERROR'
            ));
        }
    };
}

/**
 * Optional session validation (doesn't fail if missing)
 * @param {Object} options - Options
 * @returns {Function} Express middleware
 */
function optionalSession(options = {}) {
    return validateSession({ ...options, required: false });
}

/**
 * Require session with strict security
 * @param {Object} options - Options
 * @returns {Function} Express middleware
 */
function requireStrictSession(options = {}) {
    return validateSession({
        ...options,
        required: true,
        strict: true,
        validateIP: true,
        validateUserAgent: true,
        validateFingerprint: true
    });
}

/**
 * Get session validation statistics
 * @returns {Object} Session statistics
 */
function getSessionStats() {
    return {
        ...sessionStats,
        validationRate: sessionStats.totalValidations > 0
            ? ((sessionStats.successfulValidations / sessionStats.totalValidations) * 100).toFixed(2) + '%'
            : '0%',
        timestamp: new Date()
    };
}

/**
 * Reset session validation statistics
 */
function resetSessionStats() {
    sessionStats.totalValidations = 0;
    sessionStats.successfulValidations = 0;
    sessionStats.failedValidations = 0;
    sessionStats.expiredSessions = 0;
    sessionStats.invalidSessions = 0;
    sessionStats.suspendedSessions = 0;
    sessionStats.securityViolations = 0;
    sessionStats.concurrentSessionViolations = 0;
    sessionStats.deviceMismatches = 0;
    
    logger.info('Session validation statistics reset');
}

module.exports = validateSession;
module.exports.validateSession = validateSession;
module.exports.optionalSession = optionalSession;
module.exports.requireStrictSession = requireStrictSession;
module.exports.getSessionStats = getSessionStats;
module.exports.resetSessionStats = resetSessionStats;
module.exports.SESSION_SOURCES = SESSION_SOURCES;
module.exports.SESSION_STATUS = SESSION_STATUS;