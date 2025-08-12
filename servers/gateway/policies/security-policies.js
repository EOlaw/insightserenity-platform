'use strict';

/**
 * @fileoverview Security Policies - Security enforcement logic for API Gateway
 * @module servers/gateway/policies/security-policies
 * @requires crypto
 * @requires jsonwebtoken
 * @requires helmet
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');

/**
 * SecurityPolicyEngine class implements comprehensive security policies for the API Gateway.
 * It provides authentication, authorization, encryption, input validation, threat protection,
 * compliance enforcement, and security monitoring capabilities.
 */
class SecurityPolicyEngine {
    /**
     * Creates an instance of SecurityPolicyEngine
     * @constructor
     * @param {Object} config - Security configuration
     * @param {Object} logger - Logger instance
     */
    constructor(config, logger) {
        this.config = config || {};
        this.logger = logger;
        this.authService = null; // Will be set during initialization if needed
        
        // Security policies
        this.policies = new Map();
        this.policyRules = new Map();
        this.policyActions = new Map();
        
        // Threat detection patterns
        this.threatPatterns = {
            sqlInjection: [
                /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE)\b)/gi,
                /(\b(OR|AND)\b\s+\d+\s*=\s*\d+)/gi,
                /(--|#|\/\*|\*\/)/g
            ],
            xss: [
                /<script[^>]*>.*?<\/script>/gi,
                /javascript:/gi,
                /on\w+\s*=/gi,
                /<iframe/gi
            ],
            pathTraversal: [
                /\.\.\//g,
                /\.\.%2[fF]/g,
                /%2[eE]\./g
            ],
            commandInjection: [
                /[;&|`$]/g,
                /\b(cat|ls|rm|wget|curl|bash|sh|cmd|powershell)\b/gi
            ],
            xxe: [
                /<!DOCTYPE[^>]*\[/,
                /<!ENTITY/,
                /SYSTEM/
            ]
        };
        
        // Security headers configuration
        this.securityHeaders = {
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'X-XSS-Protection': '1; mode=block',
            'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
            'Content-Security-Policy': this.generateCSP(),
            'Referrer-Policy': 'strict-origin-when-cross-origin',
            'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
            'X-Permitted-Cross-Domain-Policies': 'none'
        };
        
        // CORS configuration
        this.corsConfig = {
            origin: config.cors?.origins || ['*'],
            methods: config.cors?.methods || ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: config.cors?.allowedHeaders || ['Content-Type', 'Authorization'],
            exposedHeaders: config.cors?.exposedHeaders || [],
            credentials: config.cors?.credentials !== false,
            maxAge: config.cors?.maxAge || 86400
        };
        
        // Authentication policies
        this.authPolicies = {
            requireAuth: config.auth?.required !== false,
            allowAnonymous: config.auth?.allowAnonymous || false,
            sessionTimeout: config.auth?.sessionTimeout || 3600000, // 1 hour
            mfaRequired: config.auth?.mfaRequired || false,
            passwordPolicy: {
                minLength: 8,
                requireUppercase: true,
                requireLowercase: true,
                requireNumbers: true,
                requireSpecialChars: true,
                maxAge: 90 * 24 * 60 * 60 * 1000 // 90 days
            }
        };
        
        // Authorization policies
        this.authzPolicies = {
            defaultRole: config.authz?.defaultRole || 'user',
            rbacEnabled: config.authz?.rbacEnabled !== false,
            abacEnabled: config.authz?.abacEnabled || false,
            permissionModel: config.authz?.permissionModel || 'hierarchical'
        };
        
        // Encryption policies
        this.encryptionPolicies = {
            algorithm: config.encryption?.algorithm || 'aes-256-gcm',
            keyRotationInterval: config.encryption?.keyRotationInterval || 30 * 24 * 60 * 60 * 1000, // 30 days
            enforceHttps: config.encryption?.enforceHttps !== false,
            encryptSensitiveData: config.encryption?.encryptSensitiveData !== false
        };
        
        // Input validation policies
        this.validationPolicies = {
            maxRequestSize: config.validation?.maxRequestSize || 10 * 1024 * 1024, // 10MB
            maxFieldSize: config.validation?.maxFieldSize || 1024 * 1024, // 1MB
            maxFields: config.validation?.maxFields || 1000,
            strictValidation: config.validation?.strict !== false,
            sanitizeInput: config.validation?.sanitize !== false
        };
        
        // Rate limiting policies (integrated with rate-limiting middleware)
        this.rateLimitPolicies = {
            enabled: config.rateLimit?.enabled !== false,
            windowMs: config.rateLimit?.windowMs || 60000,
            max: config.rateLimit?.max || 100,
            skipSuccessfulRequests: config.rateLimit?.skipSuccessfulRequests || false
        };
        
        // IP filtering policies
        this.ipPolicies = {
            whitelist: new Set(config.ip?.whitelist || []),
            blacklist: new Set(config.ip?.blacklist || []),
            enableGeoBlocking: config.ip?.geoBlocking || false,
            blockedCountries: new Set(config.ip?.blockedCountries || [])
        };
        
        // Audit and compliance
        this.compliancePolicies = {
            gdpr: config.compliance?.gdpr || false,
            hipaa: config.compliance?.hipaa || false,
            pci: config.compliance?.pci || false,
            sox: config.compliance?.sox || false,
            auditLogging: config.compliance?.auditLogging !== false
        };
        
        // Threat protection
        this.threatProtection = {
            enableWaf: config.threat?.waf !== false,
            enableDdosProtection: config.threat?.ddosProtection !== false,
            enableBotProtection: config.threat?.botProtection || false,
            anomalyDetection: config.threat?.anomalyDetection || false
        };
        
        // Security monitoring
        this.securityMetrics = {
            authenticationAttempts: 0,
            authenticationFailures: 0,
            authorizationDenials: 0,
            threatDetections: 0,
            policyViolations: 0,
            suspiciousActivities: 0
        };
        
        // Policy enforcement cache
        this.policyCache = new Map();
        this.policyCacheTTL = config.policyCacheTTL || 300000; // 5 minutes
        
        // Initialization state
        this.isInitialized = false;
    }

    /**
     * Initializes the security policy engine
     * @async
     * @returns {Promise<void>}
     */
    async initialize() {
        if (this.isInitialized) {
            this.log('warn', 'Security policy engine already initialized');
            return;
        }

        try {
            // Initialize policies
            this.initializePolicies();
            
            // Register policy actions
            this.registerPolicyActions();
            
            this.isInitialized = true;
            this.log('info', 'Security policy engine initialized successfully');
            
        } catch (error) {
            this.log('error', 'Failed to initialize security policy engine', error);
            throw error;
        }
    }

    /**
     * Evaluates security policies for a request
     * @async
     * @param {Object} req - Request object
     * @returns {Promise<Object>} Policy evaluation result
     */
    async evaluate(req) {
        try {
            const result = {
                allowed: true,
                reason: null,
                context: {},
                warnings: []
            };

            // Get applicable policies
            const policies = this.getApplicablePolicies(req);
            
            // Sort policies by priority
            policies.sort((a, b) => b.priority - a.priority);
            
            // Evaluate each policy
            for (const policy of policies) {
                if (!policy.enabled) continue;
                
                for (const rule of policy.rules) {
                    if (rule.condition(req)) {
                        const action = this.policyActions.get(rule.action);
                        if (action) {
                            try {
                                await action(req, null); // Pass null for res since we're just evaluating
                            } catch (error) {
                                if (error instanceof SecurityPolicyError) {
                                    result.allowed = false;
                                    result.reason = error.message;
                                    return result;
                                }
                                throw error;
                            }
                        }
                    }
                }
            }

            return result;
            
        } catch (error) {
            this.log('error', 'Policy evaluation failed', error);
            return {
                allowed: false,
                reason: 'Policy evaluation error',
                context: {},
                warnings: []
            };
        }
    }

    /**
     * Initializes security policies
     * @private
     */
    initializePolicies() {
        // Authentication policy
        this.registerPolicy('authentication', {
            priority: 100,
            enabled: true,
            rules: [
                {
                    name: 'require-auth',
                    condition: (req) => this.authPolicies.requireAuth && !this.isPublicEndpoint(req),
                    action: 'enforce-authentication'
                },
                {
                    name: 'validate-token',
                    condition: (req) => req.headers.authorization,
                    action: 'validate-jwt-token'
                },
                {
                    name: 'check-session',
                    condition: (req) => req.session,
                    action: 'validate-session'
                }
            ]
        });

        // Authorization policy
        this.registerPolicy('authorization', {
            priority: 90,
            enabled: true,
            rules: [
                {
                    name: 'check-permissions',
                    condition: (req) => req.user && this.authzPolicies.rbacEnabled,
                    action: 'enforce-rbac'
                },
                {
                    name: 'check-attributes',
                    condition: (req) => req.user && this.authzPolicies.abacEnabled,
                    action: 'enforce-abac'
                },
                {
                    name: 'tenant-isolation',
                    condition: (req) => req.tenant,
                    action: 'enforce-tenant-isolation'
                }
            ]
        });

        // Input validation policy
        this.registerPolicy('input-validation', {
            priority: 80,
            enabled: true,
            rules: [
                {
                    name: 'validate-size',
                    condition: (req) => req.body || req.query,
                    action: 'validate-request-size'
                },
                {
                    name: 'sanitize-input',
                    condition: (req) => this.validationPolicies.sanitizeInput,
                    action: 'sanitize-user-input'
                },
                {
                    name: 'detect-threats',
                    condition: (req) => this.threatProtection.enableWaf,
                    action: 'scan-for-threats'
                }
            ]
        });

        // Encryption policy
        this.registerPolicy('encryption', {
            priority: 70,
            enabled: true,
            rules: [
                {
                    name: 'enforce-https',
                    condition: (req) => this.encryptionPolicies.enforceHttps,
                    action: 'require-https'
                },
                {
                    name: 'encrypt-sensitive',
                    condition: (req) => this.containsSensitiveData(req),
                    action: 'encrypt-sensitive-fields'
                }
            ]
        });

        // IP filtering policy
        this.registerPolicy('ip-filtering', {
            priority: 95,
            enabled: true,
            rules: [
                {
                    name: 'check-blacklist',
                    condition: (req) => this.ipPolicies.blacklist.size > 0,
                    action: 'check-ip-blacklist'
                },
                {
                    name: 'check-whitelist',
                    condition: (req) => this.ipPolicies.whitelist.size > 0,
                    action: 'check-ip-whitelist'
                },
                {
                    name: 'geo-blocking',
                    condition: (req) => this.ipPolicies.enableGeoBlocking,
                    action: 'check-geo-location'
                }
            ]
        });

        // Compliance policy
        this.registerPolicy('compliance', {
            priority: 60,
            enabled: true,
            rules: [
                {
                    name: 'gdpr-compliance',
                    condition: (req) => this.compliancePolicies.gdpr,
                    action: 'enforce-gdpr'
                },
                {
                    name: 'hipaa-compliance',
                    condition: (req) => this.compliancePolicies.hipaa,
                    action: 'enforce-hipaa'
                },
                {
                    name: 'audit-logging',
                    condition: (req) => this.compliancePolicies.auditLogging,
                    action: 'log-audit-trail'
                }
            ]
        });
        
        this.log('info', 'Security policies initialized');
    }

    /**
     * Registers policy actions
     * @private
     */
    registerPolicyActions() {
        // Authentication actions
        this.policyActions.set('enforce-authentication', async (req, res) => {
            if (!req.user && !req.headers.authorization) {
                this.securityMetrics.authenticationFailures++;
                throw new SecurityPolicyError('Authentication required', 401);
            }
        });

        this.policyActions.set('validate-jwt-token', async (req, res) => {
            try {
                const token = this.extractToken(req);
                if (!token) {
                    throw new SecurityPolicyError('No token provided', 401);
                }
                
                const jwtSecret = this.config.jwtSecret || process.env.JWT_SECRET;
                if (!jwtSecret) {
                    throw new SecurityPolicyError('JWT secret not configured', 500);
                }
                
                const decoded = jwt.verify(token, jwtSecret);
                req.user = decoded;
                this.securityMetrics.authenticationAttempts++;
            } catch (error) {
                this.securityMetrics.authenticationFailures++;
                if (error instanceof jwt.JsonWebTokenError) {
                    throw new SecurityPolicyError('Invalid token', 401);
                }
                throw error;
            }
        });

        this.policyActions.set('validate-session', async (req, res) => {
            if (req.session && Date.now() - req.session.createdAt > this.authPolicies.sessionTimeout) {
                throw new SecurityPolicyError('Session expired', 401);
            }
        });

        // Authorization actions
        this.policyActions.set('enforce-rbac', async (req, res) => {
            const hasPermission = await this.checkRBACPermission(req);
            if (!hasPermission) {
                this.securityMetrics.authorizationDenials++;
                throw new SecurityPolicyError('Insufficient permissions', 403);
            }
        });

        this.policyActions.set('enforce-abac', async (req, res) => {
            const hasAccess = await this.checkABACPermission(req);
            if (!hasAccess) {
                this.securityMetrics.authorizationDenials++;
                throw new SecurityPolicyError('Access denied by policy', 403);
            }
        });

        this.policyActions.set('enforce-tenant-isolation', async (req, res) => {
            if (req.tenant && req.params.tenantId && req.tenant.id !== req.params.tenantId) {
                throw new SecurityPolicyError('Cross-tenant access denied', 403);
            }
        });

        // Input validation actions
        this.policyActions.set('validate-request-size', async (req, res) => {
            const size = parseInt(req.headers['content-length'] || '0');
            if (size > this.validationPolicies.maxRequestSize) {
                throw new SecurityPolicyError('Request too large', 413);
            }
        });

        this.policyActions.set('sanitize-user-input', async (req, res) => {
            if (req.body) {
                req.body = this.sanitizeObject(req.body);
            }
            if (req.query) {
                req.query = this.sanitizeObject(req.query);
            }
            if (req.params) {
                req.params = this.sanitizeObject(req.params);
            }
        });

        this.policyActions.set('scan-for-threats', async (req, res) => {
            const threats = this.detectThreats(req);
            if (threats.length > 0) {
                this.securityMetrics.threatDetections++;
                this.log('warn', 'Threat detected', { threats, ip: req.ip });
                throw new SecurityPolicyError('Security threat detected', 400);
            }
        });

        // Encryption actions
        this.policyActions.set('require-https', async (req, res) => {
            if (req.protocol !== 'https' && process.env.NODE_ENV === 'production') {
                throw new SecurityPolicyError('HTTPS required', 403);
            }
        });

        this.policyActions.set('encrypt-sensitive-fields', async (req, res) => {
            if (req.body) {
                req.body = this.encryptSensitiveFields(req.body);
            }
        });

        // IP filtering actions
        this.policyActions.set('check-ip-blacklist', async (req, res) => {
            if (this.ipPolicies.blacklist.has(req.ip)) {
                this.securityMetrics.policyViolations++;
                throw new SecurityPolicyError('IP address blocked', 403);
            }
        });

        this.policyActions.set('check-ip-whitelist', async (req, res) => {
            if (this.ipPolicies.whitelist.size > 0 && !this.ipPolicies.whitelist.has(req.ip)) {
                this.securityMetrics.policyViolations++;
                throw new SecurityPolicyError('IP address not whitelisted', 403);
            }
        });

        this.policyActions.set('check-geo-location', async (req, res) => {
            const country = this.getCountryFromIP(req.ip);
            if (this.ipPolicies.blockedCountries.has(country)) {
                throw new SecurityPolicyError('Access denied from this location', 403);
            }
        });

        // Compliance actions
        this.policyActions.set('enforce-gdpr', async (req, res) => {
            // Add GDPR headers if response object is available
            if (res) {
                res.setHeader('X-GDPR-Compliant', 'true');
            }
            
            // Check for consent
            if (!req.headers['x-user-consent'] && this.requiresConsent(req)) {
                throw new SecurityPolicyError('User consent required', 451);
            }
        });

        this.policyActions.set('enforce-hipaa', async (req, res) => {
            // Ensure PHI is encrypted
            if (this.containsPHI(req) && req.protocol !== 'https') {
                throw new SecurityPolicyError('HIPAA requires HTTPS for PHI', 403);
            }
        });

        this.policyActions.set('log-audit-trail', async (req, res) => {
            const auditEntry = {
                timestamp: Date.now(),
                user: req.user?.id,
                ip: req.ip,
                method: req.method,
                path: req.path,
                action: 'request',
                result: 'pending'
            };
            
            // Store audit entry
            this.logAuditEntry(auditEntry);
            
            // Attach to request for later update
            req.auditEntry = auditEntry;
        });
    }

    /**
     * Applies security headers to response
     * @param {Object} res - Response object
     */
    applySecurityHeaders(res) {
        // Apply configured security headers
        Object.entries(this.securityHeaders).forEach(([header, value]) => {
            res.setHeader(header, value);
        });
        
        // Apply CORS headers if needed
        if (this.corsConfig.origin !== '*') {
            res.setHeader('Access-Control-Allow-Origin', this.corsConfig.origin);
        }
        
        res.setHeader('Access-Control-Allow-Methods', this.corsConfig.methods.join(', '));
        res.setHeader('Access-Control-Allow-Headers', this.corsConfig.allowedHeaders.join(', '));
        res.setHeader('Access-Control-Allow-Credentials', this.corsConfig.credentials.toString());
        res.setHeader('Access-Control-Max-Age', this.corsConfig.maxAge.toString());
    }

    /**
     * Validates request against security policies
     * @param {Object} req - Request object
     * @returns {Object} Validation result
     */
    validateRequest(req) {
        const validation = {
            valid: true,
            errors: [],
            warnings: []
        };
        
        // Check request size
        const size = parseInt(req.headers['content-length'] || '0');
        if (size > this.validationPolicies.maxRequestSize) {
            validation.valid = false;
            validation.errors.push('Request exceeds maximum size');
        }
        
        // Detect threats
        const threats = this.detectThreats(req);
        if (threats.length > 0) {
            validation.valid = false;
            validation.errors.push(...threats);
        }
        
        // Check authentication
        if (this.authPolicies.requireAuth && !this.isPublicEndpoint(req) && !req.user) {
            validation.valid = false;
            validation.errors.push('Authentication required');
        }
        
        // Check IP restrictions
        if (this.ipPolicies.blacklist.has(req.ip)) {
            validation.valid = false;
            validation.errors.push('IP address is blacklisted');
        }
        
        return validation;
    }

    /**
     * Detects security threats in request
     * @private
     * @param {Object} req - Request object
     * @returns {Array} Detected threats
     */
    detectThreats(req) {
        const threats = [];
        const content = JSON.stringify({
            body: req.body,
            query: req.query,
            params: req.params,
            headers: req.headers
        });
        
        // Check for SQL injection
        for (const pattern of this.threatPatterns.sqlInjection) {
            if (pattern.test(content)) {
                threats.push('Potential SQL injection detected');
                break;
            }
        }
        
        // Check for XSS
        for (const pattern of this.threatPatterns.xss) {
            if (pattern.test(content)) {
                threats.push('Potential XSS attack detected');
                break;
            }
        }
        
        // Check for path traversal
        for (const pattern of this.threatPatterns.pathTraversal) {
            if (pattern.test(content)) {
                threats.push('Potential path traversal detected');
                break;
            }
        }
        
        // Check for command injection
        for (const pattern of this.threatPatterns.commandInjection) {
            if (pattern.test(content)) {
                threats.push('Potential command injection detected');
                break;
            }
        }
        
        // Check for XXE
        if (req.headers['content-type']?.includes('xml')) {
            for (const pattern of this.threatPatterns.xxe) {
                if (pattern.test(content)) {
                    threats.push('Potential XXE attack detected');
                    break;
                }
            }
        }
        
        return threats;
    }

    /**
     * Sanitizes an object recursively
     * @private
     * @param {*} obj - Object to sanitize
     * @returns {*} Sanitized object
     */
    sanitizeObject(obj) {
        if (typeof obj === 'string') {
            return this.sanitizeString(obj);
        }
        
        if (Array.isArray(obj)) {
            return obj.map(item => this.sanitizeObject(item));
        }
        
        if (typeof obj === 'object' && obj !== null) {
            const sanitized = {};
            for (const [key, value] of Object.entries(obj)) {
                sanitized[this.sanitizeString(key)] = this.sanitizeObject(value);
            }
            return sanitized;
        }
        
        return obj;
    }

    /**
     * Sanitizes a string
     * @private
     * @param {string} str - String to sanitize
     * @returns {string} Sanitized string
     */
    sanitizeString(str) {
        if (typeof str !== 'string') return str;
        
        // Remove null bytes
        str = str.replace(/\0/g, '');
        
        // Escape HTML entities
        str = str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;')
            .replace(/\//g, '&#x2F;');
        
        return str;
    }

    /**
     * Encrypts sensitive fields in an object
     * @private
     * @param {Object} obj - Object with potential sensitive fields
     * @returns {Object} Object with encrypted sensitive fields
     */
    encryptSensitiveFields(obj) {
        const sensitiveFields = ['password', 'ssn', 'creditCard', 'apiKey', 'secret'];
        const encrypted = { ...obj };
        
        const encryptField = (obj, field) => {
            if (obj[field]) {
                obj[field] = this.encrypt(obj[field]);
            }
        };
        
        for (const field of sensitiveFields) {
            encryptField(encrypted, field);
            
            // Check nested objects
            for (const key in encrypted) {
                if (typeof encrypted[key] === 'object' && encrypted[key] !== null) {
                    encryptField(encrypted[key], field);
                }
            }
        }
        
        return encrypted;
    }

    /**
     * Encrypts a value
     * @private
     * @param {string} value - Value to encrypt
     * @returns {string} Encrypted value
     */
    encrypt(value) {
        const algorithm = this.encryptionPolicies.algorithm;
        const encryptionKey = this.config.encryptionKey || process.env.ENCRYPTION_KEY || 'default-key-change-in-production';
        const key = crypto.scryptSync(encryptionKey, 'salt', 32);
        const iv = crypto.randomBytes(16);
        
        const cipher = crypto.createCipheriv(algorithm, key, iv);
        
        let encrypted = cipher.update(value, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        return iv.toString('hex') + ':' + encrypted;
    }

    /**
     * Checks RBAC permission
     * @private
     * @async
     * @param {Object} req - Request object
     * @returns {Promise<boolean>} Permission result
     */
    async checkRBACPermission(req) {
        if (!req.user || !req.user.roles) return false;
        
        const requiredPermission = `${req.method}:${req.path}`;
        
        // Check if user has required role
        // This would integrate with a proper RBAC system
        const hasPermission = req.user.roles.includes('admin') || 
                            req.user.permissions?.includes(requiredPermission);
        
        return hasPermission;
    }

    /**
     * Checks ABAC permission
     * @private
     * @async
     * @param {Object} req - Request object
     * @returns {Promise<boolean>} Permission result
     */
    async checkABACPermission(req) {
        // Evaluate attribute-based access control
        // This would integrate with a proper ABAC engine
        
        const context = {
            subject: {
                id: req.user?.id,
                roles: req.user?.roles,
                department: req.user?.department
            },
            resource: {
                type: 'api',
                path: req.path,
                method: req.method
            },
            environment: {
                time: new Date(),
                ip: req.ip,
                secure: req.secure
            }
        };
        
        // Simplified ABAC check
        return true;
    }

    /**
     * Helper methods
     */
    
    registerPolicy(name, policy) {
        this.policies.set(name, policy);
    }
    
    getApplicablePolicies(req) {
        const applicable = [];
        
        for (const [name, policy] of this.policies) {
            if (this.isPolicyApplicable(policy, req)) {
                applicable.push(policy);
            }
        }
        
        return applicable;
    }
    
    isPolicyApplicable(policy, req) {
        // Check if policy should apply to this request
        return policy.enabled;
    }
    
    isPublicEndpoint(req) {
        const publicPaths = ['/health', '/metrics', '/docs', '/api-docs', '/openapi.json'];
        return publicPaths.some(path => req.path.startsWith(path));
    }
    
    extractToken(req) {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            return authHeader.substring(7);
        }
        return null;
    }
    
    containsSensitiveData(req) {
        const sensitiveFields = ['password', 'ssn', 'creditCard'];
        const data = JSON.stringify(req.body || {});
        
        return sensitiveFields.some(field => data.includes(field));
    }
    
    containsPHI(req) {
        // Check if request contains Protected Health Information
        const phiIndicators = ['patient', 'medical', 'diagnosis', 'treatment'];
        const data = JSON.stringify(req.body || {});
        
        return phiIndicators.some(indicator => data.toLowerCase().includes(indicator));
    }
    
    requiresConsent(req) {
        // Check if request requires user consent for GDPR
        return req.method !== 'GET' && req.body;
    }
    
    getCountryFromIP(ip) {
        // This would use a GeoIP service in production
        return 'US';
    }
    
    generateCSP() {
        return [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: https:",
            "font-src 'self' data:",
            "connect-src 'self'",
            "frame-ancestors 'none'",
            "base-uri 'self'",
            "form-action 'self'"
        ].join('; ');
    }
    
    logAuditEntry(entry) {
        // Store audit log entry
        // This would integrate with audit logging system
        this.log('audit', 'Audit entry', entry);
    }

    /**
     * Gets security metrics
     * @returns {Object} Security metrics
     */
    getMetrics() {
        return {
            ...this.securityMetrics,
            policies: {
                total: this.policies.size,
                enabled: Array.from(this.policies.values()).filter(p => p.enabled).length
            }
        };
    }

    /**
     * Updates IP whitelist
     * @param {Array} ips - IP addresses to whitelist
     */
    updateWhitelist(ips) {
        this.ipPolicies.whitelist = new Set(ips);
        this.log('info', `IP whitelist updated with ${ips.length} addresses`);
    }

    /**
     * Updates IP blacklist
     * @param {Array} ips - IP addresses to blacklist
     */
    updateBlacklist(ips) {
        this.ipPolicies.blacklist = new Set(ips);
        this.log('info', `IP blacklist updated with ${ips.length} addresses`);
    }

    /**
     * Performs cleanup operations
     * @async
     * @returns {Promise<void>}
     */
    async cleanup() {
        try {
            this.log('info', 'Cleaning up security policy engine');
            
            // Clear policy cache
            this.policyCache.clear();
            
            // Reset metrics
            this.securityMetrics = {
                authenticationAttempts: 0,
                authenticationFailures: 0,
                authorizationDenials: 0,
                threatDetections: 0,
                policyViolations: 0,
                suspiciousActivities: 0
            };
            
            this.isInitialized = false;
            this.log('info', 'Security policy engine cleanup completed');
            
        } catch (error) {
            this.log('error', 'Error during security policy engine cleanup', error);
            throw error;
        }
    }

    /**
     * Logs a message
     * @private
     * @param {string} level - Log level
     * @param {string} message - Log message
     * @param {*} data - Additional data
     */
    log(level, message, data) {
        if (this.logger && typeof this.logger[level] === 'function') {
            this.logger[level](message, data);
        } else {
            console[level] || console.log(message, data);
        }
    }
}

/**
 * Custom error class for security policy violations
 */
class SecurityPolicyError extends Error {
    constructor(message, statusCode = 403) {
        super(message);
        this.name = 'SecurityPolicyError';
        this.statusCode = statusCode;
    }
}

module.exports = { SecurityPolicyEngine, SecurityPolicyError };