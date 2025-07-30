'use strict';

/**
 * @fileoverview Security utilities for administrative platform protection
 * @module servers/admin-server/utils/security-utils
 * @requires module:shared/lib/security/encryption/encryption-service
 * @requires module:shared/lib/security/access-control/rbac-service
 * @requires module:shared/lib/utils/helpers/crypto-helper
 * @requires module:servers/admin-server/config
 */

const EncryptionService = require('../../../shared/lib/security/encryption/encryption-service');
const RBACService = require('../../../shared/lib/security/access-control/rbac-service');
const { CryptoHelper } = require('../../../shared/lib/utils/helpers');
const config = require('../config');
const crypto = require('crypto');
const speakeasy = require('speakeasy');

/**
 * @class SecurityUtils
 * @description Advanced security utilities for administrative operations
 */
class SecurityUtils {
  /**
   * @private
   * @static
   * @type {EncryptionService}
   */
  static #encryptionService = new EncryptionService();

  /**
   * @private
   * @static
   * @type {RBACService}
   */
  static #rbacService = new RBACService();

  /**
   * @private
   * @static
   * @type {Object}
   */
  static #config = {
    mfa: {
      issuer: config.security?.mfa?.issuer || 'InsightSerenity Admin',
      window: config.security?.mfa?.window || 2,
      step: config.security?.mfa?.step || 30,
      digits: config.security?.mfa?.digits || 6
    },
    session: {
      maxConcurrent: config.security?.session?.maxConcurrent || 3,
      absoluteTimeout: config.security?.session?.absoluteTimeout || 86400000, // 24h
      idleTimeout: config.security?.session?.idleTimeout || 3600000, // 1h
      renewalThreshold: config.security?.session?.renewalThreshold || 900000 // 15m
    },
    password: {
      minLength: config.security?.password?.minLength || 12,
      requireUppercase: config.security?.password?.requireUppercase !== false,
      requireLowercase: config.security?.password?.requireLowercase !== false,
      requireNumbers: config.security?.password?.requireNumbers !== false,
      requireSpecial: config.security?.password?.requireSpecial !== false,
      preventReuse: config.security?.password?.preventReuse || 5,
      maxAge: config.security?.password?.maxAge || 90 // days
    },
    threats: {
      maxFailedAttempts: config.security?.threats?.maxFailedAttempts || 5,
      lockoutDuration: config.security?.threats?.lockoutDuration || 1800000, // 30m
      suspiciousIPThreshold: config.security?.threats?.suspiciousIPThreshold || 10,
      geoBlockEnabled: config.security?.threats?.geoBlockEnabled || false,
      blockedCountries: config.security?.threats?.blockedCountries || []
    }
  };

  /**
   * @private
   * @static
   * @type {Map<string, Object>}
   */
  static #securityCache = new Map();

  /**
   * @private
   * @static
   * @type {Set<string>}
   */
  static #blacklistedTokens = new Set();

  /**
   * Validate admin authentication request
   * @static
   * @param {Object} authRequest - Authentication request
   * @param {Object} [context={}] - Request context
   * @returns {Promise<Object>} Validation result
   */
  static async validateAuthRequest(authRequest, context = {}) {
    const {
      username,
      password,
      mfaToken,
      clientInfo = {}
    } = authRequest;

    const validationResult = {
      valid: true,
      errors: [],
      warnings: [],
      requiresMFA: false,
      securityChecks: {}
    };

    // Check for brute force attempts
    const bruteForceCheck = await this.#checkBruteForce(username, context.ip);
    if (!bruteForceCheck.allowed) {
      validationResult.valid = false;
      validationResult.errors.push({
        code: 'ACCOUNT_LOCKED',
        message: 'Account temporarily locked due to multiple failed attempts',
        unlockAt: bruteForceCheck.unlockAt
      });
      return validationResult;
    }
    validationResult.securityChecks.bruteForce = bruteForceCheck;

    // Validate password strength
    if (password) {
      const passwordValidation = this.validatePasswordStrength(password);
      if (!passwordValidation.valid) {
        validationResult.valid = false;
        validationResult.errors.push(...passwordValidation.errors);
      }
    }

    // Check suspicious activity
    const suspiciousCheck = await this.#checkSuspiciousActivity(context);
    if (suspiciousCheck.suspicious) {
      validationResult.warnings.push({
        code: 'SUSPICIOUS_ACTIVITY',
        message: 'Unusual login pattern detected',
        factors: suspiciousCheck.factors
      });
      validationResult.requiresMFA = true;
    }
    validationResult.securityChecks.suspicious = suspiciousCheck;

    // Verify client fingerprint
    if (clientInfo.fingerprint) {
      const fingerprintValid = await this.#verifyClientFingerprint(
        username,
        clientInfo.fingerprint
      );
      validationResult.securityChecks.fingerprint = {
        valid: fingerprintValid,
        trusted: fingerprintValid
      };
    }

    return validationResult;
  }

  /**
   * Generate MFA secret and QR code
   * @static
   * @param {Object} user - User object
   * @returns {Object} MFA setup data
   */
  static generateMFASecret(user) {
    const secret = speakeasy.generateSecret({
      name: `${this.#config.mfa.issuer} (${user.email})`,
      issuer: this.#config.mfa.issuer,
      length: 32
    });

    return {
      secret: secret.base32,
      qrCode: secret.otpauth_url,
      backup: this.#generateBackupCodes(8),
      algorithm: 'sha1',
      digits: this.#config.mfa.digits,
      period: this.#config.mfa.step
    };
  }

  /**
   * Verify MFA token
   * @static
   * @param {string} token - MFA token
   * @param {string} secret - User's MFA secret
   * @param {Object} [options={}] - Verification options
   * @returns {Object} Verification result
   */
  static verifyMFAToken(token, secret, options = {}) {
    const {
      window = this.#config.mfa.window,
      previousToken = null
    } = options;

    // Prevent token reuse
    if (previousToken === token) {
      return {
        valid: false,
        error: 'Token already used'
      };
    }

    const valid = speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window,
      step: this.#config.mfa.step,
      digits: this.#config.mfa.digits
    });

    return {
      valid,
      delta: valid ? speakeasy.totp.verifyDelta({
        secret,
        encoding: 'base32',
        token,
        window,
        step: this.#config.mfa.step
      }).delta : null
    };
  }

  /**
   * Validate password strength
   * @static
   * @param {string} password - Password to validate
   * @param {Object} [options={}] - Validation options
   * @returns {Object} Validation result
   */
  static validatePasswordStrength(password, options = {}) {
    const {
      username,
      previousPasswords = []
    } = options;

    const errors = [];
    const strength = {
      score: 0,
      feedback: []
    };

    // Length check
    if (password.length < this.#config.password.minLength) {
      errors.push({
        code: 'PASSWORD_TOO_SHORT',
        message: `Password must be at least ${this.#config.password.minLength} characters`
      });
    } else {
      strength.score += 25;
    }

    // Character requirements
    if (this.#config.password.requireUppercase && !/[A-Z]/.test(password)) {
      errors.push({
        code: 'PASSWORD_NO_UPPERCASE',
        message: 'Password must contain uppercase letters'
      });
    } else {
      strength.score += 15;
    }

    if (this.#config.password.requireLowercase && !/[a-z]/.test(password)) {
      errors.push({
        code: 'PASSWORD_NO_LOWERCASE',
        message: 'Password must contain lowercase letters'
      });
    } else {
      strength.score += 15;
    }

    if (this.#config.password.requireNumbers && !/\d/.test(password)) {
      errors.push({
        code: 'PASSWORD_NO_NUMBERS',
        message: 'Password must contain numbers'
      });
    } else {
      strength.score += 15;
    }

    if (this.#config.password.requireSpecial && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      errors.push({
        code: 'PASSWORD_NO_SPECIAL',
        message: 'Password must contain special characters'
      });
    } else {
      strength.score += 15;
    }

    // Common patterns check
    const commonPatterns = this.#checkCommonPatterns(password);
    if (commonPatterns.found) {
      strength.score -= 20;
      strength.feedback.push(`Avoid common patterns: ${commonPatterns.patterns.join(', ')}`);
    }

    // Username similarity check
    if (username && password.toLowerCase().includes(username.toLowerCase())) {
      errors.push({
        code: 'PASSWORD_CONTAINS_USERNAME',
        message: 'Password must not contain username'
      });
      strength.score -= 20;
    }

    // Previous password check
    if (previousPasswords.length > 0) {
      const reused = previousPasswords.some(prev => 
        CryptoHelper.compareHash(password, prev)
      );
      
      if (reused) {
        errors.push({
          code: 'PASSWORD_REUSED',
          message: `Password must not match last ${this.#config.password.preventReuse} passwords`
        });
      }
    }

    // Calculate final strength
    strength.score = Math.max(0, Math.min(100, strength.score + 15));
    strength.level = this.#getPasswordStrengthLevel(strength.score);

    return {
      valid: errors.length === 0,
      errors,
      strength,
      expiresIn: this.#config.password.maxAge * 24 * 60 * 60 * 1000
    };
  }

  /**
   * Create secure admin session
   * @static
   * @param {Object} user - Admin user
   * @param {Object} context - Session context
   * @returns {Promise<Object>} Session data
   */
  static async createSecureSession(user, context) {
    const {
      ip,
      userAgent,
      fingerprint,
      mfaVerified = false
    } = context;

    // Check concurrent sessions
    const activeSessions = await this.#getActiveSessions(user._id);
    if (activeSessions.length >= this.#config.session.maxConcurrent) {
      // Terminate oldest session
      await this.#terminateSession(activeSessions[0].sessionId);
    }

    // Generate session tokens
    const sessionId = crypto.randomUUID();
    const accessToken = await this.#generateAccessToken(user, sessionId);
    const refreshToken = await this.#generateRefreshToken(sessionId);

    // Create session data
    const session = {
      sessionId,
      userId: user._id,
      accessToken,
      refreshToken,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + this.#config.session.absoluteTimeout),
      lastActivity: new Date(),
      ip,
      userAgent,
      fingerprint,
      mfaVerified,
      security: {
        riskScore: await this.#calculateSessionRisk(context),
        restrictions: this.#getSessionRestrictions(user, context)
      }
    };

    // Store session
    await this.#storeSession(session);

    return {
      sessionId,
      accessToken,
      refreshToken,
      expiresIn: this.#config.session.idleTimeout,
      security: session.security
    };
  }

  /**
   * Validate session security
   * @static
   * @param {string} sessionId - Session ID
   * @param {Object} context - Current context
   * @returns {Promise<Object>} Validation result
   */
  static async validateSession(sessionId, context) {
    const session = await this.#getSession(sessionId);
    
    if (!session) {
      return {
        valid: false,
        error: 'SESSION_NOT_FOUND'
      };
    }

    const validations = {
      expired: new Date() > new Date(session.expiresAt),
      idle: new Date() - new Date(session.lastActivity) > this.#config.session.idleTimeout,
      ipMismatch: session.ip !== context.ip && session.security.restrictions.includes('IP_LOCK'),
      fingerprintMismatch: session.fingerprint !== context.fingerprint,
      blacklisted: this.#blacklistedTokens.has(session.accessToken)
    };

    const valid = !Object.values(validations).some(v => v === true);
    
    if (valid) {
      // Update last activity
      await this.#updateSessionActivity(sessionId);
      
      // Check if renewal needed
      const timeToExpiry = new Date(session.expiresAt) - new Date();
      if (timeToExpiry < this.#config.session.renewalThreshold) {
        session.shouldRenew = true;
      }
    }

    return {
      valid,
      validations,
      session: valid ? session : null
    };
  }

  /**
   * Detect and log security threats
   * @static
   * @param {Object} threat - Threat information
   * @returns {Promise<Object>} Threat response
   */
  static async detectThreat(threat) {
    const {
      type,
      source,
      target,
      severity = 'medium',
      metadata = {}
    } = threat;

    const threatId = crypto.randomUUID();
    const timestamp = new Date();

    // Analyze threat pattern
    const analysis = await this.#analyzeThreatPattern(threat);
    
    // Calculate risk score
    const riskScore = this.#calculateThreatRisk(threat, analysis);

    // Determine response
    const response = this.#determineThreatResponse(riskScore, severity);

    const threatRecord = {
      threatId,
      type,
      source,
      target,
      severity,
      timestamp,
      metadata,
      analysis,
      riskScore,
      response,
      status: 'detected'
    };

    // Store threat record
    await this.#storeThreatRecord(threatRecord);

    // Execute response actions
    if (response.actions.length > 0) {
      await this.#executeThreatResponse(response.actions, threatRecord);
    }

    return {
      threatId,
      detected: true,
      riskScore,
      response: response.type,
      actions: response.actions
    };
  }

  /**
   * Verify administrative action authorization
   * @static
   * @param {Object} action - Action details
   * @param {Object} user - Admin user
   * @param {Object} [context={}] - Action context
   * @returns {Promise<Object>} Authorization result
   */
  static async verifyActionAuthorization(action, user, context = {}) {
    const {
      resource,
      operation,
      target,
      data
    } = action;

    const authorization = {
      authorized: false,
      reasons: [],
      requirements: [],
      audit: {
        required: true,
        level: 'info'
      }
    };

    // Check basic permissions
    const hasPermission = await this.#rbacService.checkPermission(
      user,
      `${resource}:${operation}`
    );

    if (!hasPermission) {
      authorization.reasons.push('INSUFFICIENT_PERMISSIONS');
      return authorization;
    }

    // Check resource-specific rules
    const resourceAuth = await this.#checkResourceAuthorization(
      resource,
      operation,
      user,
      target
    );

    if (!resourceAuth.authorized) {
      authorization.reasons.push(...resourceAuth.reasons);
      return authorization;
    }

    // Check time-based restrictions
    const timeAuth = this.#checkTimeRestrictions(user);
    if (!timeAuth.allowed) {
      authorization.reasons.push('TIME_RESTRICTION');
      authorization.requirements.push(timeAuth.requirement);
      return authorization;
    }

    // Check data sensitivity
    const sensitivity = this.#assessDataSensitivity(resource, data);
    if (sensitivity.level === 'critical') {
      authorization.audit.level = 'critical';
      
      // Require additional verification for critical operations
      if (!context.mfaVerified) {
        authorization.reasons.push('MFA_REQUIRED');
        authorization.requirements.push('mfa_verification');
        return authorization;
      }

      // Require approval for certain critical operations
      if (sensitivity.requiresApproval && !context.approved) {
        authorization.reasons.push('APPROVAL_REQUIRED');
        authorization.requirements.push('senior_approval');
        return authorization;
      }
    }

    authorization.authorized = true;
    return authorization;
  }

  /**
   * Generate security report
   * @static
   * @param {Object} criteria - Report criteria
   * @returns {Promise<Object>} Security report
   */
  static async generateSecurityReport(criteria) {
    const {
      startDate,
      endDate,
      includeThreats = true,
      includeAudits = true,
      includeCompliance = true
    } = criteria;

    const report = {
      reportId: crypto.randomUUID(),
      generatedAt: new Date(),
      period: {
        start: startDate,
        end: endDate
      },
      summary: {},
      sections: {}
    };

    // Threat analysis section
    if (includeThreats) {
      report.sections.threats = await this.#generateThreatSection(startDate, endDate);
      report.summary.threats = {
        total: report.sections.threats.total,
        critical: report.sections.threats.bySeverity.critical || 0,
        blocked: report.sections.threats.blocked
      };
    }

    // Audit trail section
    if (includeAudits) {
      report.sections.audits = await this.#generateAuditSection(startDate, endDate);
      report.summary.audits = {
        total: report.sections.audits.total,
        failures: report.sections.audits.failures,
        suspicious: report.sections.audits.suspicious
      };
    }

    // Compliance section
    if (includeCompliance) {
      report.sections.compliance = await this.#generateComplianceSection();
      report.summary.compliance = {
        score: report.sections.compliance.overallScore,
        issues: report.sections.compliance.issues.length
      };
    }

    // Overall security score
    report.summary.securityScore = this.#calculateSecurityScore(report);

    return report;
  }

  /**
   * Encrypt sensitive admin data
   * @static
   * @param {*} data - Data to encrypt
   * @param {Object} [options={}] - Encryption options
   * @returns {Promise<Object>} Encrypted data
   */
  static async encryptSensitiveData(data, options = {}) {
    const {
      algorithm = 'aes-256-gcm',
      encoding = 'base64',
      metadata = {}
    } = options;

    const encryptionKey = await this.#getOrCreateEncryptionKey(options.keyId);
    
    const encrypted = await this.#encryptionService.encrypt(data, {
      key: encryptionKey,
      algorithm,
      encoding
    });

    return {
      encrypted: encrypted.data,
      keyId: encryptionKey.id,
      algorithm,
      metadata: {
        ...metadata,
        encryptedAt: new Date(),
        encryptedBy: options.userId
      }
    };
  }

  /**
   * Check brute force attempts
   * @private
   * @static
   * @param {string} identifier - User identifier
   * @param {string} ip - IP address
   * @returns {Promise<Object>} Check result
   */
  static async #checkBruteForce(identifier, ip) {
    const key = `bruteforce:${identifier}:${ip}`;
    const attempts = this.#securityCache.get(key) || { count: 0, firstAttempt: Date.now() };

    if (attempts.count >= this.#config.threats.maxFailedAttempts) {
      const lockoutEnd = attempts.firstAttempt + this.#config.threats.lockoutDuration;
      
      if (Date.now() < lockoutEnd) {
        return {
          allowed: false,
          reason: 'MAX_ATTEMPTS_EXCEEDED',
          unlockAt: new Date(lockoutEnd),
          attempts: attempts.count
        };
      } else {
        // Reset after lockout period
        this.#securityCache.delete(key);
        attempts.count = 0;
      }
    }

    return {
      allowed: true,
      remainingAttempts: this.#config.threats.maxFailedAttempts - attempts.count
    };
  }

  /**
   * Check suspicious activity
   * @private
   * @static
   * @param {Object} context - Request context
   * @returns {Promise<Object>} Suspicion analysis
   */
  static async #checkSuspiciousActivity(context) {
    const factors = [];
    let suspicionScore = 0;

    // Check unusual time
    const hour = new Date().getHours();
    if (hour < 6 || hour > 22) {
      factors.push('unusual_time');
      suspicionScore += 10;
    }

    // Check location anomaly
    if (context.location && context.previousLocation) {
      const distance = this.#calculateDistance(context.location, context.previousLocation);
      const timeDiff = Date.now() - context.previousLogin;
      const speed = distance / (timeDiff / 3600000); // km/h

      if (speed > 1000) { // Impossible travel speed
        factors.push('impossible_travel');
        suspicionScore += 50;
      }
    }

    // Check device anomaly
    if (context.newDevice) {
      factors.push('new_device');
      suspicionScore += 20;
    }

    // Check for VPN/Proxy
    if (context.isProxy || context.isVPN) {
      factors.push('proxy_detected');
      suspicionScore += 30;
    }

    return {
      suspicious: suspicionScore > 25,
      score: suspicionScore,
      factors
    };
  }

  /**
   * Generate backup codes
   * @private
   * @static
   * @param {number} count - Number of codes
   * @returns {Array<string>} Backup codes
   */
  static #generateBackupCodes(count) {
    const codes = [];
    
    for (let i = 0; i < count; i++) {
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      codes.push(`${code.substring(0, 4)}-${code.substring(4)}`);
    }
    
    return codes;
  }

  /**
   * Check common password patterns
   * @private
   * @static
   * @param {string} password - Password to check
   * @returns {Object} Pattern check result
   */
  static #checkCommonPatterns(password) {
    const patterns = [];
    
    // Keyboard patterns
    const keyboardPatterns = ['qwerty', 'asdf', '1234', 'zxcv'];
    keyboardPatterns.forEach(pattern => {
      if (password.toLowerCase().includes(pattern)) {
        patterns.push('keyboard_pattern');
      }
    });

    // Repeated characters
    if (/(.)\1{2,}/.test(password)) {
      patterns.push('repeated_chars');
    }

    // Sequential characters
    if (/abc|bcd|cde|123|234|345/.test(password.toLowerCase())) {
      patterns.push('sequential');
    }

    return {
      found: patterns.length > 0,
      patterns: [...new Set(patterns)]
    };
  }

  /**
   * Get password strength level
   * @private
   * @static
   * @param {number} score - Strength score
   * @returns {string} Strength level
   */
  static #getPasswordStrengthLevel(score) {
    if (score >= 80) return 'strong';
    if (score >= 60) return 'good';
    if (score >= 40) return 'fair';
    return 'weak';
  }

  /**
   * Calculate threat risk score
   * @private
   * @static
   * @param {Object} threat - Threat data
   * @param {Object} analysis - Threat analysis
   * @returns {number} Risk score (0-100)
   */
  static #calculateThreatRisk(threat, analysis) {
    let score = 0;

    // Base score by threat type
    const typeScores = {
      brute_force: 30,
      sql_injection: 70,
      xss_attempt: 60,
      privilege_escalation: 90,
      data_exfiltration: 85,
      unauthorized_access: 50
    };

    score += typeScores[threat.type] || 40;

    // Adjust by severity
    const severityMultipliers = {
      low: 0.5,
      medium: 1.0,
      high: 1.5,
      critical: 2.0
    };

    score *= severityMultipliers[threat.severity] || 1.0;

    // Consider pattern analysis
    if (analysis.isRecurring) score += 20;
    if (analysis.isEscalating) score += 15;
    if (analysis.affectsMultipleTargets) score += 10;

    return Math.min(100, Math.round(score));
  }

  /**
   * Calculate security score
   * @private
   * @static
   * @param {Object} report - Security report
   * @returns {number} Security score (0-100)
   */
  static #calculateSecurityScore(report) {
    let score = 100;

    // Deduct for threats
    if (report.sections.threats) {
      const threatDeduction = Math.min(30, report.sections.threats.total * 0.5);
      score -= threatDeduction;
    }

    // Deduct for audit failures
    if (report.sections.audits) {
      const auditDeduction = Math.min(20, report.sections.audits.failures * 0.2);
      score -= auditDeduction;
    }

    // Deduct for compliance issues
    if (report.sections.compliance) {
      const complianceDeduction = Math.min(30, report.sections.compliance.issues.length * 2);
      score -= complianceDeduction;
    }

    return Math.max(0, Math.round(score));
  }
}

module.exports = SecurityUtils;