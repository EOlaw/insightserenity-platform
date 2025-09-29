'use strict';

/**
 * @fileoverview Advanced validation utilities
 * @module shared/lib/utils/helpers/validation-helper
 */

const validator = require('validator');

/**
 * @class ValidationHelper
 * @description Comprehensive validation utilities for data integrity
 */
class ValidationHelper {
  /**
   * Validate data against schema
   * @static
   * @param {any} data - Data to validate
   * @param {Object} schema - Validation schema
   * @returns {Object} Validation result
   */
  static validateSchema(data, schema) {
    const errors = [];
    const validated = {};

    for (const [field, rules] of Object.entries(schema)) {
      const value = data[field];
      const fieldErrors = [];

      // Check required
      if (rules.required && (value === undefined || value === null || value === '')) {
        fieldErrors.push(`${field} is required`);
        continue;
      }

      // Skip optional empty fields
      if (!rules.required && (value === undefined || value === null || value === '')) {
        continue;
      }

      // Type validation
      if (rules.type && !this.validateType(value, rules.type)) {
        fieldErrors.push(`${field} must be of type ${rules.type}`);
      }

      // Length validation
      if (rules.minLength && value.length < rules.minLength) {
        fieldErrors.push(`${field} must be at least ${rules.minLength} characters`);
      }
      if (rules.maxLength && value.length > rules.maxLength) {
        fieldErrors.push(`${field} must not exceed ${rules.maxLength} characters`);
      }

      // Range validation
      if (rules.min !== undefined && value < rules.min) {
        fieldErrors.push(`${field} must be at least ${rules.min}`);
      }
      if (rules.max !== undefined && value > rules.max) {
        fieldErrors.push(`${field} must not exceed ${rules.max}`);
      }

      // Pattern validation
      if (rules.pattern && !rules.pattern.test(value)) {
        fieldErrors.push(`${field} format is invalid`);
      }

      // Enum validation
      if (rules.enum && !rules.enum.includes(value)) {
        fieldErrors.push(`${field} must be one of: ${rules.enum.join(', ')}`);
      }

      // Custom validation
      if (rules.custom && typeof rules.custom === 'function') {
        const customError = rules.custom(value, data);
        if (customError) {
          fieldErrors.push(customError);
        }
      }

      if (fieldErrors.length > 0) {
        errors.push(...fieldErrors);
      } else {
        validated[field] = value;
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      data: validated
    };
  }

  /**
   * Validate data type
   * @static
   * @param {any} value - Value to validate
   * @param {string} type - Expected type
   * @returns {boolean} True if valid type
   */
  static validateType(value, type) {
    switch (type.toLowerCase()) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && !isNaN(value);
      case 'integer':
        return Number.isInteger(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'array':
        return Array.isArray(value);
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value);
      case 'date':
        return value instanceof Date || !isNaN(Date.parse(value));
      case 'email':
        return validator.isEmail(String(value));
      case 'url':
        return validator.isURL(String(value));
      case 'uuid':
        return validator.isUUID(String(value));
      case 'json':
        try {
          JSON.parse(value);
          return true;
        } catch {
          return false;
        }
      default:
        return true;
    }
  }

  /**
   * Validate credit card
   * @static
   * @param {string} cardNumber - Card number
   * @param {Object} [options={}] - Validation options
   * @returns {Object} Validation result
   */
  static validateCreditCard(cardNumber, options = {}) {
    const {
      validateExpiry = false,
      validateCVV = false,
      expiryMonth,
      expiryYear,
      cvv
    } = options;

    const result = {
      valid: true,
      errors: [],
      cardType: null
    };

    // Validate card number
    const cleanNumber = cardNumber.replace(/\D/g, '');

    if (!validator.isCreditCard(cleanNumber)) {
      result.valid = false;
      result.errors.push('Invalid card number');
    } else {
      // Detect card type
      if (/^4/.test(cleanNumber)) result.cardType = 'Visa';
      else if (/^5[1-5]/.test(cleanNumber)) result.cardType = 'MasterCard';
      else if (/^3[47]/.test(cleanNumber)) result.cardType = 'AmEx';
      else if (/^6(?:011|5)/.test(cleanNumber)) result.cardType = 'Discover';
    }

    // Validate expiry
    if (validateExpiry) {
      const currentDate = new Date();
      const currentYear = currentDate.getFullYear();
      const currentMonth = currentDate.getMonth() + 1;

      if (!expiryMonth || !expiryYear) {
        result.valid = false;
        result.errors.push('Expiry date is required');
      } else if (expiryYear < currentYear ||
                (expiryYear === currentYear && expiryMonth < currentMonth)) {
        result.valid = false;
        result.errors.push('Card has expired');
      }
    }

    // Validate CVV
    if (validateCVV) {
      const cvvLength = result.cardType === 'AmEx' ? 4 : 3;
      if (!cvv || cvv.length !== cvvLength || !/^\d+$/.test(cvv)) {
        result.valid = false;
        result.errors.push('Invalid CVV');
      }
    }

    return result;
  }

  /**
   * Validate password strength
   * @static
   * @param {string} password - Password to validate
   * @param {Object} [options={}] - Validation options
   * @returns {Object} Validation result
   */
  static validatePassword(password, options = {}) {
    const {
      minLength = 8,
      maxLength = 128,
      requireUppercase = true,
      requireLowercase = true,
      requireNumbers = true,
      requireSpecialChars = true,
      prohibitCommonPasswords = true,
      prohibitUserInfo = [],
      customRules = []
    } = options;

    const result = {
      valid: true,
      errors: [],
      strength: 0,
      suggestions: []
    };

    // Length check
    if (password.length < minLength) {
      result.valid = false;
      result.errors.push(`Password must be at least ${minLength} characters`);
    }
    if (password.length > maxLength) {
      result.valid = false;
      result.errors.push(`Password must not exceed ${maxLength} characters`);
    }

    // Character requirements
    if (requireUppercase && !/[A-Z]/.test(password)) {
      result.valid = false;
      result.errors.push('Password must contain at least one uppercase letter');
      result.suggestions.push('Add uppercase letters');
    } else if (requireUppercase) {
      result.strength += 20;
    }

    if (requireLowercase && !/[a-z]/.test(password)) {
      result.valid = false;
      result.errors.push('Password must contain at least one lowercase letter');
      result.suggestions.push('Add lowercase letters');
    } else if (requireLowercase) {
      result.strength += 20;
    }

    if (requireNumbers && !/\d/.test(password)) {
      result.valid = false;
      result.errors.push('Password must contain at least one number');
      result.suggestions.push('Add numbers');
    } else if (requireNumbers) {
      result.strength += 20;
    }

    if (requireSpecialChars && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      result.valid = false;
      result.errors.push('Password must contain at least one special character');
      result.suggestions.push('Add special characters');
    } else if (requireSpecialChars) {
      result.strength += 20;
    }

    // Common passwords check
    if (prohibitCommonPasswords) {
      const commonPasswords = [
        'password', '123456', 'qwerty', 'abc123', 'password123',
        'admin', 'letmein', 'welcome', 'monkey', '1234567890'
      ];

      if (commonPasswords.some(common =>
        password.toLowerCase().includes(common))) {
        result.valid = false;
        result.errors.push('Password is too common');
        result.suggestions.push('Use a more unique password');
      }
    }

    // User info check
    if (prohibitUserInfo.length > 0) {
      for (const info of prohibitUserInfo) {
        if (password.toLowerCase().includes(info.toLowerCase())) {
          result.valid = false;
          result.errors.push('Password must not contain personal information');
          break;
        }
      }
    }

    // Custom rules
    for (const rule of customRules) {
      if (!rule.test(password)) {
        result.valid = false;
        result.errors.push(rule.message || 'Password does not meet custom requirements');
      }
    }

    // Calculate final strength
    if (password.length >= 12) result.strength += 10;
    if (password.length >= 16) result.strength += 10;

    result.strength = Math.min(100, result.strength);

    // Strength level
    if (result.strength < 40) result.level = 'Weak';
    else if (result.strength < 70) result.level = 'Medium';
    else result.level = 'Strong';

    return result;
  }

  /**
   * Validate phone number
   * @static
   * @param {string} phone - Phone number
   * @param {Object} [options={}] - Validation options
   * @returns {Object} Validation result
   */
  static validatePhone(phone, options = {}) {
    const {
      locale = 'any',
      strictMode = false,
      allowedCountries = []
    } = options;

    const result = {
      valid: true,
      errors: [],
      formatted: null,
      country: null
    };

    // Basic validation
    if (!validator.isMobilePhone(phone, locale, { strictMode })) {
      result.valid = false;
      result.errors.push('Invalid phone number');
    }

    // Country restriction
    if (allowedCountries.length > 0) {
      let validCountry = false;
      for (const country of allowedCountries) {
        if (validator.isMobilePhone(phone, country)) {
          validCountry = true;
          result.country = country;
          break;
        }
      }

      if (!validCountry) {
        result.valid = false;
        result.errors.push(`Phone number must be from: ${allowedCountries.join(', ')}`);
      }
    }

    // Format phone number
    if (result.valid) {
      result.formatted = phone.replace(/\D/g, '');
    }

    return result;
  }

  /**
   * Validate date range
   * @static
   * @param {Date|string} startDate - Start date
   * @param {Date|string} endDate - End date
   * @param {Object} [options={}] - Validation options
   * @returns {Object} Validation result
   */
  static validateDateRange(startDate, endDate, options = {}) {
    const {
      minDays = 0,
      maxDays = Infinity,
      allowPastDates = true,
      allowFutureDates = true,
      businessDaysOnly = false
    } = options;

    const result = {
      valid: true,
      errors: [],
      daysDifference: 0,
      businessDays: 0
    };

    const start = new Date(startDate);
    const end = new Date(endDate);
    const now = new Date();

    // Validate dates
    if (isNaN(start.getTime())) {
      result.valid = false;
      result.errors.push('Invalid start date');
    }

    if (isNaN(end.getTime())) {
      result.valid = false;
      result.errors.push('Invalid end date');
    }

    if (!result.valid) return result;

    // Check date order
    if (start > end) {
      result.valid = false;
      result.errors.push('Start date must be before end date');
    }

    // Check past dates
    if (!allowPastDates && start < now) {
      result.valid = false;
      result.errors.push('Start date cannot be in the past');
    }

    // Check future dates
    if (!allowFutureDates && end > now) {
      result.valid = false;
      result.errors.push('End date cannot be in the future');
    }

    // Calculate days difference
    const msPerDay = 24 * 60 * 60 * 1000;
    result.daysDifference = Math.round((end - start) / msPerDay);

    // Check min/max days
    if (result.daysDifference < minDays) {
      result.valid = false;
      result.errors.push(`Date range must be at least ${minDays} days`);
    }

    if (result.daysDifference > maxDays) {
      result.valid = false;
      result.errors.push(`Date range must not exceed ${maxDays} days`);
    }

    // Calculate business days
    if (businessDaysOnly) {
      let current = new Date(start);
      while (current <= end) {
        const dayOfWeek = current.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
          result.businessDays++;
        }
        current.setDate(current.getDate() + 1);
      }
    }

    return result;
  }

  /**
   * Validate file upload
   * @static
   * @param {Object} file - File object
   * @param {Object} [options={}] - Validation options
   * @returns {Object} Validation result
   */
  static validateFile(file, options = {}) {
    const {
      maxSize = 10 * 1024 * 1024, // 10MB default
      allowedTypes = [],
      allowedExtensions = [],
      prohibitedExtensions = ['.exe', '.bat', '.cmd', '.sh'],
      scanForVirus = false
    } = options;

    const result = {
      valid: true,
      errors: [],
      warnings: []
    };

    // Check file exists
    if (!file || !file.name) {
      result.valid = false;
      result.errors.push('No file provided');
      return result;
    }

    // Check file size
    if (file.size > maxSize) {
      result.valid = false;
      result.errors.push(`File size exceeds ${maxSize / 1024 / 1024}MB limit`);
    }

    // Check MIME type
    if (allowedTypes.length > 0 && !allowedTypes.includes(file.type)) {
      result.valid = false;
      result.errors.push(`File type must be one of: ${allowedTypes.join(', ')}`);
    }

    // Check extension
    const extension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();

    if (allowedExtensions.length > 0 && !allowedExtensions.includes(extension)) {
      result.valid = false;
      result.errors.push(`File extension must be one of: ${allowedExtensions.join(', ')}`);
    }

    if (prohibitedExtensions.includes(extension)) {
      result.valid = false;
      result.errors.push('File type is not allowed for security reasons');
    }

    // Warn about potential issues
    if (file.name.includes('..')) {
      result.warnings.push('Filename contains path traversal characters');
    }

    if (scanForVirus) {
      result.warnings.push('Virus scan pending');
    }

    return result;
  }

  /**
   * Validate URL
   * @static
   * @param {string} url - URL to validate
   * @param {Object} [options={}] - Validation options
   * @returns {Object} Validation result
   */
  static validateURL(url, options = {}) {
    const {
      protocols = ['http', 'https'],
      requireProtocol = true,
      requireTLD = true,
      allowLocalhost = false,
      allowIP = false,
      checkDNS = false
    } = options;

    const result = {
      valid: true,
      errors: [],
      parsed: null
    };

    // Basic URL validation
    const validationOptions = {
      protocols,
      require_protocol: requireProtocol,
      require_tld: requireTLD,
      allow_underscores: false,
      allow_trailing_dot: false,
      allow_protocol_relative_urls: false,
      disallow_auth: false
    };

    if (!validator.isURL(url, validationOptions)) {
      result.valid = false;
      result.errors.push('Invalid URL format');
      return result;
    }

    try {
      const parsed = new URL(url);
      result.parsed = {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port,
        pathname: parsed.pathname,
        search: parsed.search,
        hash: parsed.hash
      };

      // Check localhost
      if (!allowLocalhost && parsed.hostname === 'localhost') {
        result.valid = false;
        result.errors.push('Localhost URLs are not allowed');
      }

      // Check IP addresses
      if (!allowIP && validator.isIP(parsed.hostname)) {
        result.valid = false;
        result.errors.push('IP addresses are not allowed');
      }
    } catch (error) {
      result.valid = false;
      result.errors.push('URL parsing failed');
    }

    return result;
  }

  /**
   * Validate geographic coordinates
   * @static
   * @param {number} latitude - Latitude
   * @param {number} longitude - Longitude
   * @returns {Object} Validation result
   */
  static validateCoordinates(latitude, longitude) {
    const result = {
      valid: true,
      errors: []
    };

    if (typeof latitude !== 'number' || isNaN(latitude)) {
      result.valid = false;
      result.errors.push('Latitude must be a number');
    } else if (latitude < -90 || latitude > 90) {
      result.valid = false;
      result.errors.push('Latitude must be between -90 and 90');
    }

    if (typeof longitude !== 'number' || isNaN(longitude)) {
      result.valid = false;
      result.errors.push('Longitude must be a number');
    } else if (longitude < -180 || longitude > 180) {
      result.valid = false;
      result.errors.push('Longitude must be between -180 and 180');
    }

    return result;
  }

  /**
   * Validate color code
   * @static
   * @param {string} color - Color code
   * @param {Object} [options={}] - Validation options
   * @returns {Object} Validation result
   */
  static validateColor(color, options = {}) {
    const { formats = ['hex', 'rgb', 'hsl'] } = options;

    const result = {
      valid: false,
      format: null,
      errors: []
    };

    if (formats.includes('hex') && /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color)) {
      result.valid = true;
      result.format = 'hex';
    } else if (formats.includes('rgb') &&
              /^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/.test(color)) {
      result.valid = true;
      result.format = 'rgb';
    } else if (formats.includes('hsl') &&
              /^hsl\(\s*\d{1,3}\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%\s*\)$/.test(color)) {
      result.valid = true;
      result.format = 'hsl';
    }

    if (!result.valid) {
      result.errors.push(`Color must be in format: ${formats.join(', ')}`);
    }

    return result;
  }

  /**
   * Create validation report
   * @static
   * @param {Object} validationResults - Validation results
   * @returns {Object} Validation report
   */
  static createReport(validationResults) {
    const totalFields = Object.keys(validationResults).length;
    const validFields = Object.values(validationResults).filter(r => r.valid).length;
    const invalidFields = totalFields - validFields;

    const allErrors = [];
    const fieldErrors = {};

    for (const [field, result] of Object.entries(validationResults)) {
      if (result.errors && result.errors.length > 0) {
        fieldErrors[field] = result.errors;
        allErrors.push(...result.errors);
      }
    }

    return {
      valid: invalidFields === 0,
      totalFields,
      validFields,
      invalidFields,
      successRate: Math.round((validFields / totalFields) * 100),
      errors: allErrors,
      fieldErrors,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = ValidationHelper;
