'use strict';

/**
 * @fileoverview Security Manager for comprehensive security enforcement and monitoring
 * @module shared/lib/security/security-manager
 * @description Provides centralized security management capabilities for the platform
 */

const EventEmitter = require('events');
const crypto = require('crypto');
const logger = require('../utils/logger');

/**
 * SecurityManager class for managing comprehensive security policies
 * Provides centralized security enforcement, monitoring, and incident response
 */
class SecurityManager extends EventEmitter {
    /**
     * Creates an instance of SecurityManager
     * @param {Object} config - Security configuration options
     * @param {boolean} [config.enforceIPWhitelist=false] - Whether to enforce IP whitelist
     * @param {boolean} [config.requireMFA=false] - Whether to require multi-factor authentication
     * @param {number} [config.sessionTimeout=3600000] - Session timeout in milliseconds
     * @param {Object} [config.securityConfig] - Extended security configuration
     */
    constructor(config = {}) {
        super();
        
        this.config = {
            enforceIPWhitelist: false,
            requireMFA: false,
            sessionTimeout: 3600000, // 1 hour default
            autoBlockThreats: true,
            enableThreatDetection: true,
            enableRealTimeMonitoring: true,
            ...config
        };
        
        // Load extended security configuration if available
        this.securityConfig = this.loadSecurityConfig();
        
        // Security state management
        this.isInitialized = false;
        this.securityLevel = 'high';
        this.threatLevel = 'low';
        this.activeThreats = new Map();
        this.blockedIPs = new Set();
        this.trustedIPs = new Set();
        this.sessionRegistry = new Map();
        this.securityMetrics = {
            threatCount: 0,
            blockedAttempts: 0,
            successfulLogins: 0,
            failedLogins: 0,
            mfaAttempts: 0,
            mfaFailures: 0,
            startTime: new Date()
        };
        
        // Initialize security components
        this.initializeSecurityComponents();
    }

    /**
     * Load security configuration from admin config
     * @private
     * @returns {Object} Security configuration
     */
    loadSecurityConfig() {
        try {
            // Try to load admin-specific security config
            const adminSecurityConfig = require('../../../servers/admin-server/config/security-config');
            return adminSecurityConfig;
        } catch (error) {
            logger.warn('Admin security config not found, using defaults', { error: error.message });
            return this.getDefaultSecurityConfig();
        }
    }

    /**
     * Get default security configuration
     * @private
     * @returns {Object} Default security configuration
     */
    getDefaultSecurityConfig() {
        return {
            level: 'high',
            authentication: {
                mfa: { required: false },
                password: { minLength: 12 },
                login: { maxAttempts: 5, lockoutDuration: 900000 }
            },
            accessControl: {
                ipRestrictions: {
                    whitelist: { enabled: false, addresses: [] },
                    blacklist: { enabled: true, addresses: [] }
                }
            },
            monitoring: {
                enabled: true,
                threatDetection: { enabled: true }
            }
        };
    }

    /**
     * Initialize security components
     * @private
     */
    initializeSecurityComponents() {
        try {
            // Initialize IP management
            this.initializeIPManagement();
            
            // Initialize threat detection
            this.initializeThreatDetection();
            
            // Initialize session management
            this.initializeSessionManagement();
            
            // Setup security monitoring
            this.setupSecurityMonitoring();
            
            this.isInitialized = true;
            this.emit('initialized');
            
            logger.info('SecurityManager initialized successfully', {
                enforceIPWhitelist: this.config.enforceIPWhitelist,
                requireMFA: this.config.requireMFA,
                threatDetection: this.config.enableThreatDetection,
                realTimeMonitoring: this.config.enableRealTimeMonitoring
            });
        } catch (error) {
            logger.error('Failed to initialize SecurityManager', { error: error.message });
            throw error;
        }
    }

    /**
     * Initialize IP management system
     * @private
     */
    initializeIPManagement() {
        const ipConfig = this.securityConfig.accessControl?.ipRestrictions;
        
        if (ipConfig?.whitelist?.enabled && ipConfig.whitelist.addresses) {
            ipConfig.whitelist.addresses.forEach(ip => {
                this.trustedIPs.add(ip);
            });
        }
        
        if (ipConfig?.blacklist?.enabled && ipConfig.blacklist.addresses) {
            ipConfig.blacklist.addresses.forEach(ip => {
                this.blockedIPs.add(ip);
            });
        }
        
        logger.info('IP management initialized', {
            trustedIPs: this.trustedIPs.size,
            blockedIPs: this.blockedIPs.size
        });
    }

    /**
     * Initialize threat detection system
     * @private
     */
    initializeThreatDetection() {
        if (!this.config.enableThreatDetection) {
            return;
        }
        
        this.threatDetectionRules = {
            bruteForce: {
                enabled: true,
                threshold: 5,
                timeWindow: 300000 // 5 minutes
            },
            rapidRequests: {
                enabled: true,
                threshold: 100,
                timeWindow: 60000 // 1 minute
            },
            suspiciousPatterns: {
                enabled: true,
                patterns: [
                    /\.\./g, // Directory traversal
                    /<script/gi, // XSS attempts
                    /union\s+select/gi, // SQL injection
                    /exec\s*\(/gi // Code execution
                ]
            }
        };
        
        logger.info('Threat detection initialized');
    }

    /**
     * Initialize session management
     * @private
     */
    initializeSessionManagement() {
        this.sessionConfig = {
            timeout: this.config.sessionTimeout,
            maxConcurrent: 5,
            requireMFA: this.config.requireMFA,
            trackLocation: true,
            trackDevice: true
        };
        
        // Setup session cleanup interval
        this.sessionCleanupInterval = setInterval(() => {
            this.cleanupExpiredSessions();
        }, 300000); // 5 minutes
        
        logger.info('Session management initialized', {
            timeout: this.sessionConfig.timeout,
            requireMFA: this.sessionConfig.requireMFA
        });
    }

    /**
     * Setup security monitoring
     * @private
     */
    setupSecurityMonitoring() {
        if (!this.config.enableRealTimeMonitoring) {
            return;
        }
        
        // Setup metrics collection interval
        this.metricsInterval = setInterval(() => {
            this.collectSecurityMetrics();
        }, 60000); // 1 minute
        
        // Setup threat level assessment
        this.threatAssessmentInterval = setInterval(() => {
            this.assessThreatLevel();
        }, 300000); // 5 minutes
        
        logger.info('Security monitoring enabled');
    }

    /**
     * Validate IP address access
     * @param {string} ipAddress - IP address to validate
     * @param {Object} [context] - Additional context
     * @returns {Object} Validation result
     */
    validateIPAccess(ipAddress, context = {}) {
        try {
            // Check if IP is blocked
            if (this.blockedIPs.has(ipAddress)) {
                this.securityMetrics.blockedAttempts++;
                this.logSecurityEvent('ip_blocked', {
                    ip: ipAddress,
                    reason: 'blacklisted',
                    context
                });
                
                return {
                    allowed: false,
                    reason: 'IP address is blacklisted',
                    action: 'block'
                };
            }
            
            // Check whitelist if enforced
            if (this.config.enforceIPWhitelist || this.securityConfig.accessControl?.ipRestrictions?.whitelist?.enabled) {
                if (!this.trustedIPs.has(ipAddress) && !this.isLocalIP(ipAddress)) {
                    this.securityMetrics.blockedAttempts++;
                    this.logSecurityEvent('ip_not_whitelisted', {
                        ip: ipAddress,
                        context
                    });
                    
                    return {
                        allowed: false,
                        reason: 'IP address not in whitelist',
                        action: 'block'
                    };
                }
            }
            
            // Check for suspicious activity
            const threatAnalysis = this.analyzeThreatFromIP(ipAddress);
            if (threatAnalysis.threatLevel > 0.7) {
                this.temporarilyBlockIP(ipAddress, threatAnalysis.reason);
                
                return {
                    allowed: false,
                    reason: 'Suspicious activity detected',
                    action: 'temporary_block',
                    details: threatAnalysis
                };
            }
            
            return {
                allowed: true,
                trustLevel: this.calculateIPTrustLevel(ipAddress),
                threats: threatAnalysis
            };
        } catch (error) {
            logger.error('Error validating IP access', { error: error.message, ip: ipAddress });
            return {
                allowed: false,
                reason: 'Security validation error',
                action: 'block'
            };
        }
    }

    /**
     * Validate user authentication
     * @param {Object} user - User object
     * @param {Object} authData - Authentication data
     * @returns {Object} Authentication validation result
     */
    validateAuthentication(user, authData = {}) {
        try {
            const result = {
                valid: false,
                requireMFA: false,
                securityFlags: [],
                recommendations: []
            };
            
            // Basic user validation
            if (!user || !user.id) {
                this.securityMetrics.failedLogins++;
                return { ...result, reason: 'Invalid user data' };
            }
            
            // Check if user has admin privileges
            if (!this.hasAdminPrivileges(user)) {
                this.securityMetrics.failedLogins++;
                this.logSecurityEvent('unauthorized_admin_access', {
                    userId: user.id,
                    role: user.role,
                    authData
                });
                
                return { ...result, reason: 'Insufficient privileges' };
            }
            
            // Check MFA requirements
            if (this.shouldRequireMFA(user, authData)) {
                if (!authData.mfaToken) {
                    return {
                        ...result,
                        requireMFA: true,
                        reason: 'MFA token required'
                    };
                }
                
                const mfaValid = this.validateMFA(user, authData.mfaToken);
                if (!mfaValid.valid) {
                    this.securityMetrics.mfaFailures++;
                    return { ...result, reason: 'Invalid MFA token' };
                }
                
                this.securityMetrics.mfaAttempts++;
            }
            
            // Check session security
            const sessionSecurity = this.validateSessionSecurity(user, authData);
            if (!sessionSecurity.valid) {
                return { ...result, reason: sessionSecurity.reason };
            }
            
            this.securityMetrics.successfulLogins++;
            result.valid = true;
            result.sessionData = sessionSecurity.sessionData;
            
            return result;
        } catch (error) {
            logger.error('Error validating authentication', { error: error.message });
            return {
                valid: false,
                reason: 'Authentication validation error'
            };
        }
    }

    /**
     * Check if user has admin privileges
     * @private
     * @param {Object} user - User object
     * @returns {boolean} Whether user has admin privileges
     */
    hasAdminPrivileges(user) {
        const allowedRoles = this.securityConfig.accessControl?.rbac?.roles || ['admin', 'superadmin'];
        return allowedRoles.includes(user.role);
    }

    /**
     * Check if MFA should be required
     * @private
     * @param {Object} user - User object
     * @param {Object} authData - Authentication data
     * @returns {boolean} Whether MFA is required
     */
    shouldRequireMFA(user, authData) {
        // Check global MFA requirement
        if (this.config.requireMFA || this.securityConfig.authentication?.mfa?.required) {
            return true;
        }
        
        // Check user-specific MFA settings
        if (user.mfaEnabled) {
            return true;
        }
        
        // Check if coming from untrusted IP
        if (authData.ip && !this.trustedIPs.has(authData.ip)) {
            return true;
        }
        
        return false;
    }

    /**
     * Validate MFA token
     * @private
     * @param {Object} user - User object
     * @param {string} token - MFA token
     * @returns {Object} MFA validation result
     */
    validateMFA(user, token) {
        try {
            // In development mode, accept simple numeric tokens
            if (process.env.NODE_ENV === 'development') {
                const isValidFormat = /^\d{6}$/.test(token);
                return {
                    valid: isValidFormat,
                    reason: isValidFormat ? 'Valid development token' : 'Invalid token format'
                };
            }
            
            // Production MFA validation would integrate with actual MFA service
            // This is a placeholder for the actual implementation
            return {
                valid: false,
                reason: 'MFA validation not implemented'
            };
        } catch (error) {
            logger.error('MFA validation error', { error: error.message });
            return {
                valid: false,
                reason: 'MFA validation error'
            };
        }
    }

    /**
     * Validate session security
     * @private
     * @param {Object} user - User object
     * @param {Object} authData - Authentication data
     * @returns {Object} Session validation result
     */
    validateSessionSecurity(user, authData) {
        try {
            const sessionData = {
                userId: user.id,
                createdAt: new Date(),
                ip: authData.ip,
                userAgent: authData.userAgent,
                securityLevel: this.calculateSessionSecurityLevel(user, authData)
            };
            
            // Check concurrent sessions
            const activeSessions = this.getActiveSessionsForUser(user.id);
            if (activeSessions.length >= this.sessionConfig.maxConcurrent) {
                return {
                    valid: false,
                    reason: 'Maximum concurrent sessions exceeded'
                };
            }
            
            // Register session
            const sessionId = this.generateSessionId();
            this.sessionRegistry.set(sessionId, sessionData);
            
            return {
                valid: true,
                sessionData: { ...sessionData, sessionId }
            };
        } catch (error) {
            logger.error('Session validation error', { error: error.message });
            return {
                valid: false,
                reason: 'Session validation error'
            };
        }
    }

    /**
     * Analyze threat level from IP
     * @private
     * @param {string} ipAddress - IP address to analyze
     * @returns {Object} Threat analysis result
     */
    analyzeThreatFromIP(ipAddress) {
        const threat = this.activeThreats.get(ipAddress) || {
            attempts: 0,
            firstSeen: new Date(),
            lastSeen: new Date(),
            patterns: []
        };
        
        const timeSinceFirst = Date.now() - threat.firstSeen.getTime();
        const recentAttempts = threat.attempts;
        
        let threatLevel = 0;
        let reasons = [];
        
        // Calculate threat level based on various factors
        if (recentAttempts > 10 && timeSinceFirst < 300000) { // 10 attempts in 5 minutes
            threatLevel += 0.5;
            reasons.push('High frequency requests');
        }
        
        if (recentAttempts > 50) {
            threatLevel += 0.3;
            reasons.push('Excessive total attempts');
        }
        
        if (threat.patterns.length > 0) {
            threatLevel += 0.4;
            reasons.push('Suspicious patterns detected');
        }
        
        return {
            threatLevel: Math.min(threatLevel, 1.0),
            reason: reasons.join(', '),
            attempts: recentAttempts,
            patterns: threat.patterns
        };
    }

    /**
     * Calculate IP trust level
     * @private
     * @param {string} ipAddress - IP address
     * @returns {number} Trust level (0-1)
     */
    calculateIPTrustLevel(ipAddress) {
        if (this.trustedIPs.has(ipAddress)) {
            return 1.0;
        }
        
        if (this.isLocalIP(ipAddress)) {
            return 0.8;
        }
        
        const threatData = this.activeThreats.get(ipAddress);
        if (!threatData) {
            return 0.5; // Neutral trust for unknown IPs
        }
        
        const threatLevel = this.analyzeThreatFromIP(ipAddress).threatLevel;
        return Math.max(0, 0.5 - threatLevel);
    }

    /**
     * Check if IP is local/private
     * @private
     * @param {string} ipAddress - IP address
     * @returns {boolean} Whether IP is local
     */
    isLocalIP(ipAddress) {
        const localRanges = [
            /^127\./,
            /^10\./,
            /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
            /^192\.168\./,
            /^::1$/,
            /^fe80:/
        ];
        
        return localRanges.some(range => range.test(ipAddress));
    }

    /**
     * Temporarily block an IP address
     * @param {string} ipAddress - IP address to block
     * @param {string} reason - Reason for blocking
     * @param {number} [duration=3600000] - Block duration in milliseconds
     */
    temporarilyBlockIP(ipAddress, reason, duration = 3600000) {
        this.blockedIPs.add(ipAddress);
        
        setTimeout(() => {
            this.blockedIPs.delete(ipAddress);
            logger.info('IP unblocked after timeout', { ip: ipAddress });
        }, duration);
        
        this.logSecurityEvent('ip_temporarily_blocked', {
            ip: ipAddress,
            reason,
            duration
        });
        
        logger.warn('IP temporarily blocked', {
            ip: ipAddress,
            reason,
            duration
        });
    }

    /**
     * Calculate session security level
     * @private
     * @param {Object} user - User object
     * @param {Object} authData - Authentication data
     * @returns {string} Security level
     */
    calculateSessionSecurityLevel(user, authData) {
        let score = 0;
        
        // MFA adds security
        if (authData.mfaUsed) {
            score += 30;
        }
        
        // Trusted IP adds security
        if (this.trustedIPs.has(authData.ip)) {
            score += 20;
        }
        
        // Admin role requires higher security
        if (user.role === 'superadmin') {
            score += 25;
        } else if (user.role === 'admin') {
            score += 15;
        }
        
        // Local IP is more secure
        if (this.isLocalIP(authData.ip)) {
            score += 10;
        }
        
        if (score >= 70) return 'high';
        if (score >= 40) return 'medium';
        return 'low';
    }

    /**
     * Get active sessions for a user
     * @private
     * @param {string} userId - User ID
     * @returns {Array} Active sessions
     */
    getActiveSessionsForUser(userId) {
        const sessions = [];
        for (const [sessionId, sessionData] of this.sessionRegistry) {
            if (sessionData.userId === userId) {
                sessions.push({ sessionId, ...sessionData });
            }
        }
        return sessions;
    }

    /**
     * Generate secure session ID
     * @private
     * @returns {string} Session ID
     */
    generateSessionId() {
        return crypto.randomBytes(32).toString('hex');
    }

    /**
     * Clean up expired sessions
     * @private
     */
    cleanupExpiredSessions() {
        const now = Date.now();
        const expiredSessions = [];
        
        for (const [sessionId, sessionData] of this.sessionRegistry) {
            const sessionAge = now - sessionData.createdAt.getTime();
            if (sessionAge > this.sessionConfig.timeout) {
                expiredSessions.push(sessionId);
            }
        }
        
        expiredSessions.forEach(sessionId => {
            this.sessionRegistry.delete(sessionId);
        });
        
        if (expiredSessions.length > 0) {
            logger.debug('Cleaned up expired sessions', { count: expiredSessions.length });
        }
    }

    /**
     * Collect security metrics
     * @private
     */
    collectSecurityMetrics() {
        const metrics = {
            ...this.securityMetrics,
            activeSessions: this.sessionRegistry.size,
            activeThreats: this.activeThreats.size,
            blockedIPs: this.blockedIPs.size,
            trustedIPs: this.trustedIPs.size,
            timestamp: new Date()
        };
        
        this.emit('metrics', metrics);
        
        // Log metrics periodically
        if (Date.now() % 300000 < 60000) { // Every 5 minutes
            logger.info('Security metrics', metrics);
        }
    }

    /**
     * Assess current threat level
     * @private
     */
    assessThreatLevel() {
        const now = Date.now();
        const recentThreats = Array.from(this.activeThreats.values())
            .filter(threat => now - threat.lastSeen.getTime() < 3600000); // Last hour
        
        let overallThreatLevel = 'low';
        
        if (recentThreats.length > 100) {
            overallThreatLevel = 'critical';
        } else if (recentThreats.length > 50) {
            overallThreatLevel = 'high';
        } else if (recentThreats.length > 20) {
            overallThreatLevel = 'medium';
        }
        
        if (overallThreatLevel !== this.threatLevel) {
            const previousLevel = this.threatLevel;
            this.threatLevel = overallThreatLevel;
            
            this.emit('threatLevelChanged', {
                previous: previousLevel,
                current: overallThreatLevel,
                activeThreats: recentThreats.length
            });
            
            logger.warn('Threat level changed', {
                from: previousLevel,
                to: overallThreatLevel,
                activeThreats: recentThreats.length
            });
        }
    }

    /**
     * Log security event
     * @private
     * @param {string} eventType - Type of security event
     * @param {Object} data - Event data
     */
    logSecurityEvent(eventType, data) {
        const event = {
            type: eventType,
            timestamp: new Date(),
            data,
            severity: this.getEventSeverity(eventType)
        };
        
        logger.warn('Security event', event);
        this.emit('securityEvent', event);
    }

    /**
     * Get event severity level
     * @private
     * @param {string} eventType - Event type
     * @returns {string} Severity level
     */
    getEventSeverity(eventType) {
        const severityMap = {
            'ip_blocked': 'medium',
            'ip_not_whitelisted': 'high',
            'ip_temporarily_blocked': 'high',
            'unauthorized_admin_access': 'critical',
            'mfa_failure': 'medium',
            'session_hijack_attempt': 'critical',
            'brute_force_detected': 'high'
        };
        
        return severityMap[eventType] || 'low';
    }

    /**
     * Get security status
     * @returns {Object} Current security status
     */
    getSecurityStatus() {
        return {
            initialized: this.isInitialized,
            securityLevel: this.securityLevel,
            threatLevel: this.threatLevel,
            metrics: {
                ...this.securityMetrics,
                activeSessions: this.sessionRegistry.size,
                activeThreats: this.activeThreats.size,
                blockedIPs: this.blockedIPs.size,
                trustedIPs: this.trustedIPs.size
            },
            configuration: {
                enforceIPWhitelist: this.config.enforceIPWhitelist,
                requireMFA: this.config.requireMFA,
                sessionTimeout: this.config.sessionTimeout,
                threatDetection: this.config.enableThreatDetection,
                realTimeMonitoring: this.config.enableRealTimeMonitoring
            },
            uptime: Date.now() - this.securityMetrics.startTime.getTime()
        };
    }

    /**
     * Add IP to trusted list
     * @param {string} ipAddress - IP address to trust
     * @param {string} [reason] - Reason for trusting
     */
    addTrustedIP(ipAddress, reason = 'Manual addition') {
        this.trustedIPs.add(ipAddress);
        this.blockedIPs.delete(ipAddress); // Remove from blocked if present
        
        this.logSecurityEvent('ip_trusted', {
            ip: ipAddress,
            reason
        });
        
        logger.info('IP added to trusted list', { ip: ipAddress, reason });
    }

    /**
     * Remove IP from trusted list
     * @param {string} ipAddress - IP address to untrust
     * @param {string} [reason] - Reason for untrusting
     */
    removeTrustedIP(ipAddress, reason = 'Manual removal') {
        this.trustedIPs.delete(ipAddress);
        
        this.logSecurityEvent('ip_untrusted', {
            ip: ipAddress,
            reason
        });
        
        logger.info('IP removed from trusted list', { ip: ipAddress, reason });
    }

    /**
     * Block IP address permanently
     * @param {string} ipAddress - IP address to block
     * @param {string} [reason] - Reason for blocking
     */
    blockIP(ipAddress, reason = 'Manual block') {
        this.blockedIPs.add(ipAddress);
        this.trustedIPs.delete(ipAddress); // Remove from trusted if present
        
        this.logSecurityEvent('ip_permanently_blocked', {
            ip: ipAddress,
            reason
        });
        
        logger.warn('IP permanently blocked', { ip: ipAddress, reason });
    }

    /**
     * Unblock IP address
     * @param {string} ipAddress - IP address to unblock
     * @param {string} [reason] - Reason for unblocking
     */
    unblockIP(ipAddress, reason = 'Manual unblock') {
        this.blockedIPs.delete(ipAddress);
        
        this.logSecurityEvent('ip_unblocked', {
            ip: ipAddress,
            reason
        });
        
        logger.info('IP unblocked', { ip: ipAddress, reason });
    }

    /**
     * Shutdown security manager
     * @returns {Promise<void>}
     */
    async shutdown() {
        logger.info('Shutting down SecurityManager');
        
        // Clear intervals
        if (this.sessionCleanupInterval) {
            clearInterval(this.sessionCleanupInterval);
        }
        
        if (this.metricsInterval) {
            clearInterval(this.metricsInterval);
        }
        
        if (this.threatAssessmentInterval) {
            clearInterval(this.threatAssessmentInterval);
        }
        
        // Clear session registry
        this.sessionRegistry.clear();
        
        this.emit('shutdown');
        this.removeAllListeners();
        
        logger.info('SecurityManager shutdown completed');
    }
}

module.exports = SecurityManager;