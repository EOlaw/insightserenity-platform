'use strict';

/**
 * @fileoverview Comprehensive validation helper utilities for enterprise applications
 * @module shared/lib/utils/helpers/validation-helper
 */

const mongoose = require('mongoose');
const validator = require('validator');

/**
 * Validation helper class providing comprehensive validation utilities
 * @class ValidationHelper
 * @description Enterprise-grade validation utilities for data integrity and security
 */
class ValidationHelper {
    /**
     * Validate MongoDB ObjectId format
     * @static
     * @param {string} id - ID to validate
     * @returns {boolean} Whether the ID is valid
     */
    static isValidObjectId(id) {
        if (!id || typeof id !== 'string') {
            return false;
        }
        return mongoose.Types.ObjectId.isValid(id);
    }

    /**
     * Validate email address format
     * @static
     * @param {string} email - Email address to validate
     * @param {Object} options - Validation options
     * @returns {boolean} Whether the email is valid
     */
    static isValidEmail(email, options = {}) {
        if (!email || typeof email !== 'string') {
            return false;
        }

        const defaultOptions = {
            allow_utf8_local_part: false,
            require_tld: true,
            allow_ip_domain: false,
            domain_specific_validation: true,
            blacklisted_chars: '',
            host_blacklist: []
        };

        const validationOptions = { ...defaultOptions, ...options };
        
        try {
            return validator.isEmail(email.toLowerCase(), validationOptions);
        } catch (error) {
            return false;
        }
    }

    /**
     * Validate URL format
     * @static
     * @param {string} url - URL to validate
     * @param {Object} options - Validation options
     * @returns {boolean} Whether the URL is valid
     */
    static isValidURL(url, options = {}) {
        if (!url || typeof url !== 'string') {
            return false;
        }

        const defaultOptions = {
            protocols: ['http', 'https'],
            require_tld: true,
            require_protocol: true,
            require_host: true,
            require_valid_protocol: true,
            allow_underscores: false,
            allow_trailing_dot: false,
            allow_protocol_relative_urls: false,
            validate_length: true
        };

        const validationOptions = { ...defaultOptions, ...options };

        try {
            return validator.isURL(url, validationOptions);
        } catch (error) {
            return false;
        }
    }

    /**
     * Validate IP address format (IPv4 and IPv6)
     * @static
     * @param {string} ip - IP address to validate
     * @param {string} version - IP version ('4', '6', or 'any')
     * @returns {boolean} Whether the IP address is valid
     */
    static isValidIP(ip, version = 'any') {
        if (!ip || typeof ip !== 'string') {
            return false;
        }

        try {
            switch (version) {
                case '4':
                    return validator.isIP(ip, 4);
                case '6':
                    return validator.isIP(ip, 6);
                case 'any':
                default:
                    return validator.isIP(ip);
            }
        } catch (error) {
            return false;
        }
    }

    /**
     * Validate phone number format
     * @static
     * @param {string} phone - Phone number to validate
     * @param {string} locale - Locale for phone validation
     * @returns {boolean} Whether the phone number is valid
     */
    static isValidPhone(phone, locale = 'any') {
        if (!phone || typeof phone !== 'string') {
            return false;
        }

        // Remove common formatting characters
        const cleanPhone = phone.replace(/[\s\-\(\)\.]/g, '');

        try {
            if (locale === 'any') {
                // Generic international phone number validation
                const phoneRegex = /^[\+]?[1-9][\d]{7,15}$/;
                return phoneRegex.test(cleanPhone);
            } else {
                return validator.isMobilePhone(phone, locale);
            }
        } catch (error) {
            return false;
        }
    }

    /**
     * Validate UUID format
     * @static
     * @param {string} uuid - UUID to validate
     * @param {string} version - UUID version to validate
     * @returns {boolean} Whether the UUID is valid
     */
    static isValidUUID(uuid, version = 'all') {
        if (!uuid || typeof uuid !== 'string') {
            return false;
        }

        try {
            return validator.isUUID(uuid, version);
        } catch (error) {
            return false;
        }
    }

    /**
     * Validate date format and value
     * @static
     * @param {string|Date} date - Date to validate
     * @param {Object} options - Validation options
     * @returns {boolean} Whether the date is valid
     */
    static isValidDate(date, options = {}) {
        const { format, strictMode = true, delimiters = ['/'] } = options;

        if (!date) {
            return false;
        }

        try {
            if (date instanceof Date) {
                return !isNaN(date.getTime());
            }

            if (typeof date === 'string') {
                if (format) {
                    return validator.isDate(date, { format, strictMode, delimiters });
                } else {
                    return validator.isDate(date) || !isNaN(Date.parse(date));
                }
            }

            return false;
        } catch (error) {
            return false;
        }
    }

    /**
     * Validate JSON string format
     * @static
     * @param {string} jsonString - JSON string to validate
     * @returns {boolean} Whether the JSON string is valid
     */
    static isValidJSON(jsonString) {
        if (!jsonString || typeof jsonString !== 'string') {
            return false;
        }

        try {
            JSON.parse(jsonString);
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Validate password strength
     * @static
     * @param {string} password - Password to validate
     * @param {Object} options - Password strength options
     * @returns {Object} Validation result with score and feedback
     */
    static validatePasswordStrength(password, options = {}) {
        const defaultOptions = {
            minLength: 8,
            maxLength: 128,
            requireUppercase: true,
            requireLowercase: true,
            requireNumbers: true,
            requireSpecialChars: true,
            forbidCommonPasswords: true,
            forbidPersonalInfo: [],
            minScore: 3
        };

        const opts = { ...defaultOptions, ...options };
        const result = {
            isValid: false,
            score: 0,
            feedback: [],
            strength: 'very_weak'
        };

        if (!password || typeof password !== 'string') {
            result.feedback.push('Password is required');
            return result;
        }

        let score = 0;

        // Length validation
        if (password.length < opts.minLength) {
            result.feedback.push(`Password must be at least ${opts.minLength} characters long`);
        } else if (password.length >= opts.minLength) {
            score += 1;
        }

        if (password.length > opts.maxLength) {
            result.feedback.push(`Password must not exceed ${opts.maxLength} characters`);
            return result;
        }

        // Character requirements
        if (opts.requireUppercase && !/[A-Z]/.test(password)) {
            result.feedback.push('Password must contain at least one uppercase letter');
        } else if (opts.requireUppercase) {
            score += 1;
        }

        if (opts.requireLowercase && !/[a-z]/.test(password)) {
            result.feedback.push('Password must contain at least one lowercase letter');
        } else if (opts.requireLowercase) {
            score += 1;
        }

        if (opts.requireNumbers && !/\d/.test(password)) {
            result.feedback.push('Password must contain at least one number');
        } else if (opts.requireNumbers) {
            score += 1;
        }

        if (opts.requireSpecialChars && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
            result.feedback.push('Password must contain at least one special character');
        } else if (opts.requireSpecialChars) {
            score += 1;
        }

        // Common password check
        if (opts.forbidCommonPasswords && this.#isCommonPassword(password)) {
            result.feedback.push('Password is too common, please choose a more unique password');
        } else {
            score += 1;
        }

        // Personal info check
        if (opts.forbidPersonalInfo.length > 0) {
            const containsPersonalInfo = opts.forbidPersonalInfo.some(info =>
                password.toLowerCase().includes(info.toLowerCase())
            );
            if (containsPersonalInfo) {
                result.feedback.push('Password should not contain personal information');
            } else {
                score += 1;
            }
        }

        result.score = score;
        result.isValid = score >= opts.minScore && result.feedback.length === 0;

        // Determine strength level
        if (score >= 6) {
            result.strength = 'very_strong';
        } else if (score >= 5) {
            result.strength = 'strong';
        } else if (score >= 4) {
            result.strength = 'moderate';
        } else if (score >= 2) {
            result.strength = 'weak';
        } else {
            result.strength = 'very_weak';
        }

        return result;
    }

    /**
     * Validate input against common injection patterns
     * @static
     * @param {string} input - Input to validate
     * @param {Array} patterns - Additional patterns to check
     * @returns {Object} Validation result
     */
    static validateAgainstInjection(input, patterns = []) {
        const result = {
            isValid: true,
            threats: [],
            sanitizedInput: input
        };

        if (!input || typeof input !== 'string') {
            return result;
        }

        // Common injection patterns
        const defaultPatterns = [
            {
                name: 'SQL Injection',
                pattern: /('|(\\')|(;)|(\\x)|(union\s+select)|(drop\s+table)|(insert\s+into)|(delete\s+from)|(update\s+set)|(exec\s+sp_)|(exec\s+xp_)|(sp_\w+)|(xp_\w+))/gi
            },
            {
                name: 'XSS',
                pattern: /(<script[^>]*>.*?<\/script>)|(<iframe[^>]*>.*?<\/iframe>)|(<object[^>]*>.*?<\/object>)|(<embed[^>]*>)|(<applet[^>]*>.*?<\/applet>)|(javascript:)|(vbscript:)|(onload=)|(onerror=)|(onclick=)|(onmouseover=)/gi
            },
            {
                name: 'NoSQL Injection',
                pattern: /(\$where)|(\$regex)|(\$ne)|(\$gt)|(\$lt)|(\$gte)|(\$lte)|(\$in)|(\$nin)|(\$exists)|(\$type)/gi
            },
            {
                name: 'LDAP Injection',
                pattern: /(\*\))|(\(\|)|(\)\()|(\(\&)|(\|\|)|(\&\&)/gi
            },
            {
                name: 'Command Injection',
                pattern: /(;\s*rm\s)|(;\s*cat\s)|(;\s*ls\s)|(;\s*ps\s)|(;\s*kill\s)|(;\s*wget\s)|(;\s*curl\s)|(\|\s*rm\s)|(\|\s*cat\s)|(\|\s*ls\s)|(\&\&\s*rm\s)|(\&\&\s*cat\s)/gi
            },
            {
                name: 'Path Traversal',
                pattern: /(\.\.\/)|(\.\.\|)|(\.\.\\)|(\/etc\/passwd)|(\/etc\/shadow)|(\/windows\/system32)/gi
            }
        ];

        const allPatterns = [...defaultPatterns, ...patterns];

        for (const patternObj of allPatterns) {
            if (patternObj.pattern.test(input)) {
                result.isValid = false;
                result.threats.push({
                    type: patternObj.name,
                    pattern: patternObj.pattern.toString(),
                    matches: input.match(patternObj.pattern)
                });
            }
        }

        return result;
    }

    /**
     * Validate file upload parameters
     * @static
     * @param {Object} file - File object to validate
     * @param {Object} options - Validation options
     * @returns {Object} Validation result
     */
    static validateFileUpload(file, options = {}) {
        const defaultOptions = {
            maxSize: 10 * 1024 * 1024, // 10MB
            allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'],
            allowedExtensions: ['.jpg', '.jpeg', '.png', '.gif', '.pdf'],
            scanForMalware: false,
            requireValidHeader: true
        };

        const opts = { ...defaultOptions, ...options };
        const result = {
            isValid: true,
            errors: [],
            warnings: []
        };

        if (!file) {
            result.isValid = false;
            result.errors.push('File is required');
            return result;
        }

        // Size validation
        if (file.size > opts.maxSize) {
            result.isValid = false;
            result.errors.push(`File size exceeds maximum limit of ${opts.maxSize / (1024 * 1024)}MB`);
        }

        // MIME type validation
        if (opts.allowedTypes.length > 0 && !opts.allowedTypes.includes(file.mimetype)) {
            result.isValid = false;
            result.errors.push(`File type ${file.mimetype} is not allowed`);
        }

        // Extension validation
        if (opts.allowedExtensions.length > 0) {
            const fileExtension = this.#getFileExtension(file.originalname);
            if (!opts.allowedExtensions.includes(fileExtension.toLowerCase())) {
                result.isValid = false;
                result.errors.push(`File extension ${fileExtension} is not allowed`);
            }
        }

        // Filename validation
        if (file.originalname && this.#containsSuspiciousChars(file.originalname)) {
            result.warnings.push('Filename contains potentially suspicious characters');
        }

        return result;
    }

    /**
     * Validate form data structure
     * @static
     * @param {Object} data - Data to validate
     * @param {Object} schema - Validation schema
     * @returns {Object} Validation result
     */
    static validateFormData(data, schema) {
        const result = {
            isValid: true,
            errors: {},
            warnings: {},
            sanitizedData: {}
        };

        if (!data || typeof data !== 'object') {
            result.isValid = false;
            result.errors._general = ['Invalid data format'];
            return result;
        }

        for (const [field, rules] of Object.entries(schema)) {
            const fieldValue = data[field];
            const fieldErrors = [];
            const fieldWarnings = [];

            // Required validation
            if (rules.required && (fieldValue === undefined || fieldValue === null || fieldValue === '')) {
                fieldErrors.push(`${field} is required`);
                continue;
            }

            // Skip further validation if field is not provided and not required
            if (!rules.required && (fieldValue === undefined || fieldValue === null)) {
                continue;
            }

            // Type validation
            if (rules.type && typeof fieldValue !== rules.type) {
                fieldErrors.push(`${field} must be of type ${rules.type}`);
            }

            // Length validation
            if (rules.minLength && fieldValue.length < rules.minLength) {
                fieldErrors.push(`${field} must be at least ${rules.minLength} characters`);
            }

            if (rules.maxLength && fieldValue.length > rules.maxLength) {
                fieldErrors.push(`${field} must not exceed ${rules.maxLength} characters`);
            }

            // Pattern validation
            if (rules.pattern && !rules.pattern.test(fieldValue)) {
                fieldErrors.push(`${field} format is invalid`);
            }

            // Custom validation
            if (rules.validator && typeof rules.validator === 'function') {
                const customResult = rules.validator(fieldValue, data);
                if (customResult !== true) {
                    fieldErrors.push(customResult || `${field} validation failed`);
                }
            }

            // Enum validation
            if (rules.enum && !rules.enum.includes(fieldValue)) {
                fieldErrors.push(`${field} must be one of: ${rules.enum.join(', ')}`);
            }

            if (fieldErrors.length > 0) {
                result.isValid = false;
                result.errors[field] = fieldErrors;
            }

            if (fieldWarnings.length > 0) {
                result.warnings[field] = fieldWarnings;
            }

            // Add sanitized value
            result.sanitizedData[field] = fieldValue;
        }

        return result;
    }

    // ==================== PRIVATE METHODS ====================

    /**
     * Check if password is commonly used
     * @static
     * @private
     * @param {string} password - Password to check
     * @returns {boolean} Whether password is common
     */
    static #isCommonPassword(password) {
        const commonPasswords = [
            'password', '123456', 'password123', 'admin', 'qwerty', 'letmein',
            '123456789', 'password1', '12345678', '123123', 'abc123', 'password!',
            'welcome', '1234567890', 'changeme', '123qwe', 'Password1', 'iloveyou'
        ];

        return commonPasswords.includes(password.toLowerCase());
    }

    /**
     * Get file extension from filename
     * @static
     * @private
     * @param {string} filename - Filename
     * @returns {string} File extension
     */
    static #getFileExtension(filename) {
        if (!filename || typeof filename !== 'string') {
            return '';
        }
        return filename.slice(filename.lastIndexOf('.')).toLowerCase();
    }

    /**
     * Check if string contains suspicious characters
     * @static
     * @private
     * @param {string} input - Input to check
     * @returns {boolean} Whether input contains suspicious chars
     */
    static #containsSuspiciousChars(input) {
        const suspiciousPatterns = [
            /\.\./,  // Path traversal
            /[<>]/,  // HTML tags
            /['"]/,  // Quotes
            /[;&|]/  // Command separators
        ];

        return suspiciousPatterns.some(pattern => pattern.test(input));
    }
}

module.exports = ValidationHelper;