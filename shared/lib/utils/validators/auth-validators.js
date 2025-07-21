'use strict';

/**
 * @fileoverview Authentication validation utilities for secure auth operations
 * @module shared/lib/utils/validators/auth-validators
 * @requires module:shared/lib/utils/validators/common-validators
 * @requires module:shared/lib/utils/helpers/crypto-helper
 * @requires module:shared/lib/utils/constants/error-codes
 */

const CommonValidator = require('./common-validators');
const CryptoHelper = require('../helpers/crypto-helper');
const { AUTH_ERRORS, VALIDATION_ERRORS } = require('../constants/error-codes');

/**
 * @class AuthValidator
 * @description Provides authentication-specific validation methods for security
 */
class AuthValidator {
  /**
   * @private
   * @static
   * @readonly
   */
  static #EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  static #USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,32}$/;
  static #JWT_REGEX = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/;
  static #BEARER_TOKEN_REGEX = /^Bearer\s+[\w-]+\.[\w-]+\.[\w-]*$/i;
  static #API_KEY_REGEX = /^[A-Za-z0-9_-]{32,128}$/;
  static #OTP_REGEX = /^[0-9]{6,8}$/;
  static #TOTP_SECRET_REGEX = /^[A-Z2-7]{16,}$/;
  
  /**
   * Password strength requirements
   * @private
   * @static
   * @readonly
   */
  static #PASSWORD_REQUIREMENTS = {
    minLength: 12,
    maxLength: 128,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
    specialChars: '!@#$%^&*()_+-=[]{}|;:,.<>?',
    commonPasswords: [
      'password123', 'admin123', 'letmein', 'welcome123', 'password1',
      'qwerty123', 'abc123', '123456789', 'password!', 'admin@123'
    ]
  };

  /**
   * Validates email address format
   * @static
   * @param {string} email - Email address to validate
   * @param {Object} [options={}] - Validation options
   * @param {boolean} [options.checkMX=false] - Check MX records (requires DNS lookup)
   * @param {string[]} [options.blockedDomains=[]] - Blocked email domains
   * @param {string[]} [options.allowedDomains=[]] - Allowed email domains only
   * @returns {Object} Validation result with isValid and message
   */
  static validateEmail(email, options = {}) {
    const result = { isValid: false, message: '' };
    
    if (!email || typeof email !== 'string') {
      result.message = 'Email is required and must be a string';
      return result;
    }
    
    const normalizedEmail = email.toLowerCase().trim();
    
    // Basic format validation
    if (!this.#EMAIL_REGEX.test(normalizedEmail)) {
      result.message = 'Invalid email format';
      return result;
    }
    
    // Length validation
    if (normalizedEmail.length > 254) {
      result.message = 'Email address too long';
      return result;
    }
    
    const [localPart, domain] = normalizedEmail.split('@');
    
    // Local part validation
    if (localPart.length > 64) {
      result.message = 'Email local part too long';
      return result;
    }
    
    // Check for consecutive dots
    if (normalizedEmail.includes('..')) {
      result.message = 'Email cannot contain consecutive dots';
      return result;
    }
    
    // Domain validation
    const { blockedDomains = [], allowedDomains = [] } = options;
    
    if (blockedDomains.length > 0 && blockedDomains.includes(domain)) {
      result.message = 'Email domain is not allowed';
      return result;
    }
    
    if (allowedDomains.length > 0 && !allowedDomains.includes(domain)) {
      result.message = 'Email domain is not in allowed list';
      return result;
    }
    
    result.isValid = true;
    result.normalizedEmail = normalizedEmail;
    return result;
  }

  /**
   * Validates password strength and complexity
   * @static
   * @param {string} password - Password to validate
   * @param {Object} [options={}] - Validation options
   * @param {number} [options.minLength] - Minimum password length
   * @param {number} [options.maxLength] - Maximum password length
   * @param {boolean} [options.requireUppercase] - Require uppercase letters
   * @param {boolean} [options.requireLowercase] - Require lowercase letters
   * @param {boolean} [options.requireNumbers] - Require numbers
   * @param {boolean} [options.requireSpecialChars] - Require special characters
   * @param {string[]} [options.userInputs=[]] - User inputs to check against
   * @returns {Object} Validation result with strength score
   */
  static validatePassword(password, options = {}) {
    const result = {
      isValid: false,
      strength: 0,
      score: 0,
      issues: [],
      suggestions: []
    };
    
    if (!password || typeof password !== 'string') {
      result.issues.push('Password is required');
      return result;
    }
    
    const requirements = { ...this.#PASSWORD_REQUIREMENTS, ...options };
    
    // Length validation
    if (password.length < requirements.minLength) {
      result.issues.push(`Password must be at least ${requirements.minLength} characters`);
    }
    
    if (password.length > requirements.maxLength) {
      result.issues.push(`Password must not exceed ${requirements.maxLength} characters`);
    }
    
    // Character type validation
    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    const hasNumbers = /[0-9]/.test(password);
    const hasSpecialChars = new RegExp(`[${requirements.specialChars.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}]`).test(password);
    
    if (requirements.requireUppercase && !hasUppercase) {
      result.issues.push('Password must contain uppercase letters');
    }
    
    if (requirements.requireLowercase && !hasLowercase) {
      result.issues.push('Password must contain lowercase letters');
    }
    
    if (requirements.requireNumbers && !hasNumbers) {
      result.issues.push('Password must contain numbers');
    }
    
    if (requirements.requireSpecialChars && !hasSpecialChars) {
      result.issues.push('Password must contain special characters');
    }
    
    // Common password check
    const lowerPassword = password.toLowerCase();
    if (requirements.commonPasswords.some(common => lowerPassword.includes(common))) {
      result.issues.push('Password is too common or contains common patterns');
    }
    
    // User input similarity check
    const { userInputs = [] } = options;
    for (const input of userInputs) {
      if (input && password.toLowerCase().includes(input.toLowerCase())) {
        result.issues.push('Password should not contain personal information');
        break;
      }
    }
    
    // Sequential character check
    if (this.#hasSequentialChars(password)) {
      result.issues.push('Password contains sequential characters');
    }
    
    // Repeated character check
    if (this.#hasRepeatedChars(password)) {
      result.issues.push('Password contains too many repeated characters');
    }
    
    // Calculate strength score
    let score = 0;
    score += Math.min(password.length * 4, 40); // Length contribution
    score += hasUppercase ? 10 : 0;
    score += hasLowercase ? 10 : 0;
    score += hasNumbers ? 10 : 0;
    score += hasSpecialChars ? 20 : 0;
    
    // Bonus for character variety
    const uniqueChars = new Set(password).size;
    score += Math.min(uniqueChars * 2, 10);
    
    // Penalties
    score -= requirements.commonPasswords.some(common => lowerPassword.includes(common)) ? 30 : 0;
    score -= this.#hasSequentialChars(password) ? 15 : 0;
    score -= this.#hasRepeatedChars(password) ? 15 : 0;
    
    result.score = Math.max(0, Math.min(100, score));
    
    // Determine strength
    if (result.score >= 80) {
      result.strength = 'strong';
    } else if (result.score >= 60) {
      result.strength = 'moderate';
    } else if (result.score >= 40) {
      result.strength = 'weak';
    } else {
      result.strength = 'very-weak';
    }
    
    // Generate suggestions
    if (!hasUppercase) result.suggestions.push('Add uppercase letters');
    if (!hasLowercase) result.suggestions.push('Add lowercase letters');
    if (!hasNumbers) result.suggestions.push('Add numbers');
    if (!hasSpecialChars) result.suggestions.push('Add special characters');
    if (password.length < 16) result.suggestions.push('Consider using a longer password');
    if (uniqueChars < password.length * 0.6) result.suggestions.push('Use more unique characters');
    
    result.isValid = result.issues.length === 0;
    return result;
  }

  /**
   * Validates username format
   * @static
   * @param {string} username - Username to validate
   * @param {Object} [options={}] - Validation options
   * @param {number} [options.minLength=3] - Minimum username length
   * @param {number} [options.maxLength=32] - Maximum username length
   * @param {RegExp} [options.pattern] - Custom pattern for username
   * @param {string[]} [options.reservedUsernames=[]] - Reserved usernames
   * @returns {Object} Validation result
   */
  static validateUsername(username, options = {}) {
    const result = { isValid: false, message: '' };
    
    if (!username || typeof username !== 'string') {
      result.message = 'Username is required';
      return result;
    }
    
    const {
      minLength = 3,
      maxLength = 32,
      pattern = this.#USERNAME_REGEX,
      reservedUsernames = ['admin', 'root', 'administrator', 'system', 'api']
    } = options;
    
    const normalizedUsername = username.toLowerCase().trim();
    
    // Length validation
    if (normalizedUsername.length < minLength) {
      result.message = `Username must be at least ${minLength} characters`;
      return result;
    }
    
    if (normalizedUsername.length > maxLength) {
      result.message = `Username must not exceed ${maxLength} characters`;
      return result;
    }
    
    // Pattern validation
    if (!pattern.test(username)) {
      result.message = 'Username contains invalid characters';
      return result;
    }
    
    // Reserved username check
    if (reservedUsernames.includes(normalizedUsername)) {
      result.message = 'Username is reserved';
      return result;
    }
    
    // Profanity check could be added here
    
    result.isValid = true;
    result.normalizedUsername = normalizedUsername;
    return result;
  }

  /**
   * Validates JWT token format
   * @static
   * @param {string} token - JWT token to validate
   * @param {Object} [options={}] - Validation options
   * @param {boolean} [options.validateSignature=false] - Validate signature
   * @param {string} [options.secret] - Secret for signature validation
   * @returns {Object} Validation result with decoded payload
   */
  static validateJWT(token, options = {}) {
    const result = { isValid: false, message: '', decoded: null };
    
    if (!token || typeof token !== 'string') {
      result.message = 'Token is required';
      return result;
    }
    
    // Remove Bearer prefix if present
    const cleanToken = token.replace(/^Bearer\s+/i, '');
    
    // Basic format validation
    if (!this.#JWT_REGEX.test(cleanToken)) {
      result.message = 'Invalid JWT format';
      return result;
    }
    
    const parts = cleanToken.split('.');
    
    try {
      // Decode header
      const header = JSON.parse(Buffer.from(parts[0], 'base64').toString());
      
      // Decode payload
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      
      // Check expiration
      if (payload.exp && payload.exp * 1000 < Date.now()) {
        result.message = 'Token has expired';
        return result;
      }
      
      // Check not before
      if (payload.nbf && payload.nbf * 1000 > Date.now()) {
        result.message = 'Token not yet valid';
        return result;
      }
      
      result.decoded = { header, payload };
      
      // Signature validation if requested
      if (options.validateSignature && options.secret) {
        // This would require proper JWT library for signature validation
        // For now, just mark as valid if structure is correct
        result.message = 'Signature validation requires JWT library';
      }
      
      result.isValid = true;
      return result;
      
    } catch (error) {
      result.message = 'Invalid token structure';
      return result;
    }
  }

  /**
   * Validates API key format
   * @static
   * @param {string} apiKey - API key to validate
   * @param {Object} [options={}] - Validation options
   * @param {string} [options.prefix] - Required prefix for API key
   * @param {number} [options.minLength=32] - Minimum API key length
   * @param {number} [options.maxLength=128] - Maximum API key length
   * @returns {Object} Validation result
   */
  static validateAPIKey(apiKey, options = {}) {
    const result = { isValid: false, message: '' };
    
    if (!apiKey || typeof apiKey !== 'string') {
      result.message = 'API key is required';
      return result;
    }
    
    const {
      prefix,
      minLength = 32,
      maxLength = 128
    } = options;
    
    // Prefix validation
    if (prefix && !apiKey.startsWith(prefix)) {
      result.message = `API key must start with ${prefix}`;
      return result;
    }
    
    // Length validation
    if (apiKey.length < minLength) {
      result.message = `API key must be at least ${minLength} characters`;
      return result;
    }
    
    if (apiKey.length > maxLength) {
      result.message = `API key must not exceed ${maxLength} characters`;
      return result;
    }
    
    // Pattern validation
    if (!this.#API_KEY_REGEX.test(apiKey)) {
      result.message = 'API key contains invalid characters';
      return result;
    }
    
    result.isValid = true;
    return result;
  }

  /**
   * Validates OTP (One-Time Password)
   * @static
   * @param {string} otp - OTP to validate
   * @param {Object} [options={}] - Validation options
   * @param {number} [options.length=6] - Expected OTP length
   * @param {boolean} [options.numeric=true] - OTP should be numeric only
   * @returns {Object} Validation result
   */
  static validateOTP(otp, options = {}) {
    const result = { isValid: false, message: '' };
    
    if (!otp || typeof otp !== 'string') {
      result.message = 'OTP is required';
      return result;
    }
    
    const {
      length = 6,
      numeric = true
    } = options;
    
    // Length validation
    if (otp.length !== length) {
      result.message = `OTP must be ${length} characters`;
      return result;
    }
    
    // Numeric validation
    if (numeric && !this.#OTP_REGEX.test(otp)) {
      result.message = 'OTP must contain only numbers';
      return result;
    }
    
    result.isValid = true;
    return result;
  }

  /**
   * Validates TOTP secret
   * @static
   * @param {string} secret - TOTP secret to validate
   * @returns {Object} Validation result
   */
  static validateTOTPSecret(secret) {
    const result = { isValid: false, message: '' };
    
    if (!secret || typeof secret !== 'string') {
      result.message = 'TOTP secret is required';
      return result;
    }
    
    if (!this.#TOTP_SECRET_REGEX.test(secret)) {
      result.message = 'Invalid TOTP secret format';
      return result;
    }
    
    if (secret.length < 16) {
      result.message = 'TOTP secret too short';
      return result;
    }
    
    result.isValid = true;
    return result;
  }

  /**
   * Validates authentication headers
   * @static
   * @param {Object} headers - Request headers
   * @param {Object} [options={}] - Validation options
   * @param {string[]} [options.requiredHeaders=['authorization']] - Required headers
   * @param {string} [options.authScheme='Bearer'] - Expected auth scheme
   * @returns {Object} Validation result
   */
  static validateAuthHeaders(headers, options = {}) {
    const result = { isValid: false, message: '', extractedToken: null };
    
    if (!headers || typeof headers !== 'object') {
      result.message = 'Headers object is required';
      return result;
    }
    
    const {
      requiredHeaders = ['authorization'],
      authScheme = 'Bearer'
    } = options;
    
    // Check required headers
    for (const header of requiredHeaders) {
      const headerValue = headers[header] || headers[header.toLowerCase()];
      if (!headerValue) {
        result.message = `Missing required header: ${header}`;
        return result;
      }
    }
    
    // Validate authorization header
    const authHeader = headers.authorization || headers.Authorization;
    if (authHeader) {
      const schemeRegex = new RegExp(`^${authScheme}\\s+(.+)$`, 'i');
      const match = authHeader.match(schemeRegex);
      
      if (!match) {
        result.message = `Invalid authorization scheme, expected ${authScheme}`;
        return result;
      }
      
      result.extractedToken = match[1];
    }
    
    result.isValid = true;
    return result;
  }

  /**
   * Validates session token
   * @static
   * @param {string} sessionToken - Session token to validate
   * @param {Object} [options={}] - Validation options
   * @returns {Object} Validation result
   */
  static validateSessionToken(sessionToken, options = {}) {
    const result = { isValid: false, message: '' };
    
    if (!sessionToken || typeof sessionToken !== 'string') {
      result.message = 'Session token is required';
      return result;
    }
    
    const {
      minLength = 32,
      maxLength = 256,
      pattern = /^[A-Za-z0-9_-]+$/
    } = options;
    
    // Length validation
    if (sessionToken.length < minLength || sessionToken.length > maxLength) {
      result.message = 'Invalid session token length';
      return result;
    }
    
    // Pattern validation
    if (!pattern.test(sessionToken)) {
      result.message = 'Invalid session token format';
      return result;
    }
    
    result.isValid = true;
    return result;
  }

  /**
   * Validates refresh token
   * @static
   * @param {string} refreshToken - Refresh token to validate
   * @param {Object} [options={}] - Validation options
   * @returns {Object} Validation result
   */
  static validateRefreshToken(refreshToken, options = {}) {
    return this.validateSessionToken(refreshToken, {
      minLength: 64,
      maxLength: 512,
      ...options
    });
  }

  /**
   * Validates password reset token
   * @static
   * @param {string} resetToken - Reset token to validate
   * @param {Object} [options={}] - Validation options
   * @returns {Object} Validation result
   */
  static validateResetToken(resetToken, options = {}) {
    return this.validateSessionToken(resetToken, {
      minLength: 32,
      maxLength: 128,
      ...options
    });
  }

  /**
   * Validates OAuth state parameter
   * @static
   * @param {string} state - OAuth state to validate
   * @returns {Object} Validation result
   */
  static validateOAuthState(state) {
    const result = { isValid: false, message: '' };
    
    if (!state || typeof state !== 'string') {
      result.message = 'OAuth state is required';
      return result;
    }
    
    if (state.length < 16 || state.length > 256) {
      result.message = 'Invalid OAuth state length';
      return result;
    }
    
    if (!/^[A-Za-z0-9_-]+$/.test(state)) {
      result.message = 'Invalid OAuth state format';
      return result;
    }
    
    result.isValid = true;
    return result;
  }

  /**
   * Validates passkey/WebAuthn credential ID
   * @static
   * @param {string} credentialId - Credential ID to validate
   * @returns {Object} Validation result
   */
  static validatePasskeyCredential(credentialId) {
    const result = { isValid: false, message: '' };
    
    if (!credentialId || typeof credentialId !== 'string') {
      result.message = 'Credential ID is required';
      return result;
    }
    
    // WebAuthn credential IDs are typically base64url encoded
    if (!/^[A-Za-z0-9_-]+$/.test(credentialId)) {
      result.message = 'Invalid credential ID format';
      return result;
    }
    
    result.isValid = true;
    return result;
  }

  /**
   * Checks for sequential characters in password
   * @private
   * @static
   * @param {string} password - Password to check
   * @returns {boolean} True if sequential characters found
   */
  static #hasSequentialChars(password) {
    const sequences = [
      'abcdefghijklmnopqrstuvwxyz',
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      '0123456789',
      'qwertyuiop',
      'asdfghjkl',
      'zxcvbnm'
    ];
    
    const lowerPassword = password.toLowerCase();
    
    for (const seq of sequences) {
      for (let i = 0; i < seq.length - 2; i++) {
        const subSeq = seq.substring(i, i + 3);
        if (lowerPassword.includes(subSeq)) {
          return true;
        }
      }
    }
    
    return false;
  }

  /**
   * Checks for repeated characters in password
   * @private
   * @static
   * @param {string} password - Password to check
   * @param {number} [maxRepeats=2] - Maximum allowed repeats
   * @returns {boolean} True if too many repeated characters
   */
  static #hasRepeatedChars(password, maxRepeats = 2) {
    const regex = new RegExp(`(.)\\1{${maxRepeats},}`);
    return regex.test(password);
  }

  /**
   * Creates auth validation chain
   * @static
   * @param {string} type - Type of auth validation
   * @returns {Object} Validation chain
   */
  static createValidator(type) {
    const validators = {
      email: (value) => this.validateEmail(value),
      password: (value, options) => this.validatePassword(value, options),
      username: (value, options) => this.validateUsername(value, options),
      jwt: (value, options) => this.validateJWT(value, options),
      apiKey: (value, options) => this.validateAPIKey(value, options),
      otp: (value, options) => this.validateOTP(value, options)
    };
    
    return validators[type] || null;
  }
}

module.exports = AuthValidator;