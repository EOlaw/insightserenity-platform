'use strict';

/**
 * @fileoverview Comprehensive validation utilities for Mongoose schemas and Express routes
 * @module shared/lib/utils/validators/common-validators
 * @description Provides both simple boolean validators for Mongoose and express-validator middleware for routes
 */

const { body, param, query, validationResult } = require('express-validator');
const AppError = require('../app-error');

/**
 * @class CommonValidator
 * @description Comprehensive validation utilities with support for both Mongoose schemas and Express routes
 */
class CommonValidator {
  // ==================== Regular Expression Patterns ====================
  // Using static getters instead of private fields for Mongoose compatibility
  static get EMAIL_REGEX() {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  }
  
  static get PHONE_REGEX() {
    return /^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{4,6}$/;
  }
  
  static get UUID_REGEX() {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  }
  
  static get URL_REGEX() {
    return /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/;
  }
  
  static get ALPHANUMERIC_REGEX() {
    return /^[a-zA-Z0-9]+$/;
  }
  
  static get ALPHA_REGEX() {
    return /^[a-zA-Z]+$/;
  }
  
  static get NUMERIC_REGEX() {
    return /^[0-9]+$/;
  }
  
  static get DECIMAL_REGEX() {
    return /^[0-9]+(\.[0-9]+)?$/;
  }
  
  static get HEX_COLOR_REGEX() {
    return /^#?([a-f0-9]{6}|[a-f0-9]{3})$/i;
  }
  
  static get IPV4_REGEX() {
    return /^(([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])$/;
  }
  
  static get IPV6_REGEX() {
    return /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
  }
  
  static get OBJECT_ID_REGEX() {
    return /^[0-9a-fA-F]{24}$/;
  }
  
  static get CREDIT_CARD_REGEX() {
    return /^(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|3(?:0[0-5]|[68][0-9])[0-9]{11}|6(?:011|5[0-9]{2})[0-9]{12}|(?:2131|1800|35\d{3})\d{11})$/;
  }
  
  static get SLUG_REGEX() {
    return /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  }
  
  static get USERNAME_REGEX() {
    return /^[a-zA-Z0-9_-]{3,30}$/;
  }
  
  static get PASSWORD_STRONG_REGEX() {
    return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  }
  
  static get POSTAL_CODE_US_REGEX() {
    return /^\d{5}(-\d{4})?$/;
  }
  
  static get POSTAL_CODE_UK_REGEX() {
    return /^[A-Z]{1,2}[0-9][A-Z0-9]? ?[0-9][A-Z]{2}$/i;
  }
  
  static get POSTAL_CODE_CA_REGEX() {
    return /^[A-Z]\d[A-Z] ?\d[A-Z]\d$/i;
  }
  
  static get SSN_REGEX() {
    return /^\d{3}-?\d{2}-?\d{4}$/;
  }
  
  static get MAC_ADDRESS_REGEX() {
    return /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
  }

  // ==================== Simple Boolean Validators (for Mongoose schemas) ====================

  /**
   * Validates if a value is defined and not null
   * @static
   * @param {*} value - Value to validate
   * @returns {boolean} True if value is defined and not null
   */
  static isDefined(value) {
    return value !== undefined && value !== null;
  }

  /**
   * Validates if a value is a non-empty string
   * @static
   * @param {*} value - Value to validate
   * @param {Object} [options={}] - Validation options
   * @param {boolean} [options.trim=true] - Whether to trim before checking
   * @returns {boolean} True if value is a non-empty string
   */
  static isNonEmptyString(value, options = {}) {
    const { trim = true } = options;
    if (typeof value !== 'string') return false;
    const str = trim ? value.trim() : value;
    return str.length > 0;
  }

  /**
   * Validates string length
   * @static
   * @param {string} value - String to validate
   * @param {Object} options - Validation options
   * @param {number} [options.min] - Minimum length
   * @param {number} [options.max] - Maximum length
   * @param {number} [options.exact] - Exact length
   * @returns {boolean} True if string length is valid
   */
  static isValidLength(value, options = {}) {
    if (typeof value !== 'string') return false;
    const { min, max, exact } = options;

    if (exact !== undefined) {
      return value.length === exact;
    }

    if (min !== undefined && value.length < min) return false;
    if (max !== undefined && value.length > max) return false;

    return true;
  }

  /**
   * Validates if a value is a valid email address
   * @static
   * @param {string} value - Value to validate
   * @returns {boolean} True if value is a valid email address
   */
  static isEmail(value) {
    if (typeof value !== 'string') return false;
    return CommonValidator.EMAIL_REGEX.test(value.trim().toLowerCase());
  }

  /**
   * Validates if a value is a valid phone number
   * @static
   * @param {string} value - Value to validate
   * @param {Object} [options={}] - Validation options
   * @returns {boolean} True if value is a valid phone number
   */
  static isPhoneNumber(value, options = {}) {
    if (typeof value !== 'string') return false;
    const cleaned = value.replace(/[\s\-\(\)]/g, '');
    return CommonValidator.PHONE_REGEX.test(cleaned);
  }

  /**
   * Alias for isPhoneNumber
   * @static
   * @param {string} value - Value to validate
   * @returns {boolean} True if value is a valid phone number
   */
  static isValidPhone(value) {
    return this.isPhoneNumber(value);
  }

  /**
   * Validates if a value is a valid number
   * @static
   * @param {*} value - Value to validate
   * @param {Object} [options={}] - Validation options
   * @param {number} [options.min] - Minimum value
   * @param {number} [options.max] - Maximum value
   * @param {boolean} [options.integer=false] - Must be integer
   * @param {boolean} [options.positive=false] - Must be positive
   * @returns {boolean} True if value is a valid number
   */
  static isValidNumber(value, options = {}) {
    const num = Number(value);
    if (isNaN(num)) return false;

    const { min, max, integer = false, positive = false } = options;

    if (integer && !Number.isInteger(num)) return false;
    if (positive && num <= 0) return false;
    if (min !== undefined && num < min) return false;
    if (max !== undefined && num > max) return false;

    return true;
  }

  /**
   * Validates if a value is a valid boolean
   * @static
   * @param {*} value - Value to validate
   * @param {Object} [options={}] - Validation options
   * @param {boolean} [options.strict=false] - Strict boolean type check
   * @returns {boolean} True if value is a valid boolean
   */
  static isValidBoolean(value, options = {}) {
    const { strict = false } = options;

    if (strict) {
      return typeof value === 'boolean';
    }

    if (typeof value === 'boolean') return true;
    if (typeof value === 'string') {
      const lower = value.toLowerCase();
      return ['true', 'false', '1', '0', 'yes', 'no'].includes(lower);
    }
    if (typeof value === 'number') {
      return value === 0 || value === 1;
    }

    return false;
  }

  /**
   * Validates if a value is a valid array
   * @static
   * @param {*} value - Value to validate
   * @param {Object} [options={}] - Validation options
   * @param {number} [options.minLength] - Minimum array length
   * @param {number} [options.maxLength] - Maximum array length
   * @param {Function} [options.itemValidator] - Function to validate each item
   * @returns {boolean} True if value is a valid array
   */
  static isValidArray(value, options = {}) {
    if (!Array.isArray(value)) return false;

    const { minLength, maxLength, itemValidator } = options;

    if (minLength !== undefined && value.length < minLength) return false;
    if (maxLength !== undefined && value.length > maxLength) return false;

    if (itemValidator && typeof itemValidator === 'function') {
      return value.every(item => itemValidator(item));
    }

    return true;
  }

  /**
   * Validates if a value is a valid object
   * @static
   * @param {*} value - Value to validate
   * @param {Object} [options={}] - Validation options
   * @param {string[]} [options.requiredKeys] - Required object keys
   * @param {Object} [options.schema] - Object schema for validation
   * @returns {boolean} True if value is a valid object
   */
  static isValidObject(value, options = {}) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return false;
    }

    const { requiredKeys, schema } = options;

    if (requiredKeys && Array.isArray(requiredKeys)) {
      const hasAllKeys = requiredKeys.every(key => key in value);
      if (!hasAllKeys) return false;
    }

    if (schema && typeof schema === 'object') {
      for (const [key, validator] of Object.entries(schema)) {
        if (typeof validator === 'function' && !validator(value[key])) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Validates if a value is a valid MongoDB ObjectId
   * @static
   * @param {string} value - Value to validate
   * @param {Object} [options={}] - Validation options
   * @param {boolean} [options.strict=true] - Strict validation (24 hex chars)
   * @returns {boolean} True if value is a valid ObjectId
   */
  static isValidObjectId(value, options = {}) {
    if (typeof value !== 'string') return false;
    const { strict = true } = options;

    if (strict) {
      return CommonValidator.OBJECT_ID_REGEX.test(value);
    }

    return /^[0-9a-fA-F]{24}$/.test(value);
  }

  /**
   * Validates if a value is a valid UUID
   * @static
   * @param {string} value - Value to validate
   * @param {Object} [options={}] - Validation options
   * @param {number} [options.version] - UUID version (1-5)
   * @returns {boolean} True if value is a valid UUID
   */
  static isValidUUID(value, options = {}) {
    if (typeof value !== 'string') return false;
    return CommonValidator.UUID_REGEX.test(value);
  }

  /**
   * Validates if a value is a valid URL
   * @static
   * @param {string} value - Value to validate
   * @param {Object} [options={}] - Validation options
   * @param {string[]} [options.protocols=['http', 'https']] - Allowed protocols
   * @param {boolean} [options.requireProtocol=true] - Require protocol
   * @returns {boolean} True if value is a valid URL
   */
  static isValidURL(value, options = {}) {
    if (typeof value !== 'string') return false;

    const { protocols = ['http', 'https'], requireProtocol = true } = options;

    try {
      const url = new URL(value);

      if (requireProtocol && !protocols.includes(url.protocol.slice(0, -1))) {
        return false;
      }

      return CommonValidator.URL_REGEX.test(value);
    } catch {
      return false;
    }
  }

  /**
   * Validates if a value matches a pattern
   * @static
   * @param {string} value - Value to validate
   * @param {RegExp|string} pattern - Pattern to match
   * @returns {boolean} True if value matches pattern
   */
  static matchesPattern(value, pattern) {
    if (typeof value !== 'string') return false;
    const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern);
    return regex.test(value);
  }

  /**
   * Validates if a value is alphanumeric
   * @static
   * @param {string} value - Value to validate
   * @param {Object} [options={}] - Validation options
   * @param {boolean} [options.allowSpaces=false] - Allow spaces
   * @param {boolean} [options.allowUnderscore=false] - Allow underscore
   * @param {boolean} [options.allowDash=false] - Allow dash
   * @returns {boolean} True if value is alphanumeric
   */
  static isAlphanumeric(value, options = {}) {
    if (typeof value !== 'string') return false;

    const { allowSpaces = false, allowUnderscore = false, allowDash = false } = options;

    let pattern = '^[a-zA-Z0-9';
    if (allowSpaces) pattern += '\\s';
    if (allowUnderscore) pattern += '_';
    if (allowDash) pattern += '-';
    pattern += ']+$';

    return new RegExp(pattern).test(value);
  }

  /**
   * Validates if a value contains only letters
   * @static
   * @param {string} value - Value to validate
   * @param {Object} [options={}] - Validation options
   * @param {boolean} [options.allowSpaces=false] - Allow spaces
   * @returns {boolean} True if value contains only letters
   */
  static isAlpha(value, options = {}) {
    if (typeof value !== 'string') return false;
    const { allowSpaces = false } = options;
    const pattern = allowSpaces ? /^[a-zA-Z\s]+$/ : CommonValidator.ALPHA_REGEX;
    return pattern.test(value);
  }

  /**
   * Validates if a value contains only numbers
   * @static
   * @param {string} value - Value to validate
   * @returns {boolean} True if value contains only numbers
   */
  static isNumeric(value) {
    if (typeof value !== 'string') return false;
    return CommonValidator.NUMERIC_REGEX.test(value);
  }

  /**
   * Validates if a value is a valid decimal
   * @static
   * @param {string|number} value - Value to validate
   * @param {Object} [options={}] - Validation options
   * @param {number} [options.precision] - Maximum decimal places
   * @returns {boolean} True if value is a valid decimal
   */
  static isDecimal(value, options = {}) {
    if (typeof value !== 'string' && typeof value !== 'number') return false;

    const str = value.toString();
    if (!CommonValidator.DECIMAL_REGEX.test(str)) return false;

    const { precision } = options;
    if (precision !== undefined) {
      const parts = str.split('.');
      if (parts.length === 2 && parts[1].length > precision) {
        return false;
      }
    }

    return true;
  }

  /**
   * Validates if a value is a valid hex color
   * @static
   * @param {string} value - Value to validate
   * @returns {boolean} True if value is a valid hex color
   */
  static isHexColor(value) {
    if (typeof value !== 'string') return false;
    return CommonValidator.HEX_COLOR_REGEX.test(value);
  }

  /**
   * Validates if a value is a valid IP address
   * @static
   * @param {string} value - Value to validate
   * @param {Object} [options={}] - Validation options
   * @param {number} [options.version] - IP version (4 or 6)
   * @returns {boolean} True if value is a valid IP address
   */
  static isValidIP(value, options = {}) {
    if (typeof value !== 'string') return false;

    const { version } = options;

    if (version === 4) {
      return CommonValidator.IPV4_REGEX.test(value);
    } else if (version === 6) {
      return CommonValidator.IPV6_REGEX.test(value);
    }

    return CommonValidator.IPV4_REGEX.test(value) || CommonValidator.IPV6_REGEX.test(value);
  }

  /**
   * Validates if a value is within a list of allowed values
   * @static
   * @param {*} value - Value to validate
   * @param {Array} allowedValues - List of allowed values
   * @param {Object} [options={}] - Validation options
   * @param {boolean} [options.caseSensitive=true] - Case sensitive comparison
   * @returns {boolean} True if value is in allowed list
   */
  static isInList(value, allowedValues, options = {}) {
    if (!Array.isArray(allowedValues)) return false;

    const { caseSensitive = true } = options;

    if (!caseSensitive && typeof value === 'string') {
      const lowerValue = value.toLowerCase();
      return allowedValues.some(allowed =>
        typeof allowed === 'string' && allowed.toLowerCase() === lowerValue
      );
    }

    return allowedValues.includes(value);
  }

  /**
   * Validates if a value is a valid date
   * @static
   * @param {*} value - Value to validate
   * @param {Object} [options={}] - Validation options
   * @param {Date} [options.minDate] - Minimum date
   * @param {Date} [options.maxDate] - Maximum date
   * @param {boolean} [options.allowFuture=true] - Allow future dates
   * @param {boolean} [options.allowPast=true] - Allow past dates
   * @returns {boolean} True if value is a valid date
   */
  static isValidDate(value, options = {}) {
    const date = value instanceof Date ? value : new Date(value);

    if (isNaN(date.getTime())) return false;

    const { minDate, maxDate, allowFuture = true, allowPast = true } = options;
    const now = new Date();

    if (!allowFuture && date > now) return false;
    if (!allowPast && date < now) return false;

    if (minDate && date < new Date(minDate)) return false;
    if (maxDate && date > new Date(maxDate)) return false;

    return true;
  }

  /**
   * Validates if a value is a valid JSON string
   * @static
   * @param {string} value - Value to validate
   * @returns {boolean} True if value is valid JSON
   */
  static isValidJSON(value) {
    if (typeof value !== 'string') return false;

    try {
      JSON.parse(value);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Validates if a value is a valid base64 string
   * @static
   * @param {string} value - Value to validate
   * @returns {boolean} True if value is valid base64
   */
  static isBase64(value) {
    if (typeof value !== 'string') return false;
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;

    if (!base64Regex.test(value)) return false;
    if (value.length % 4 !== 0) return false;

    return true;
  }

  /**
   * Validates if a value is a valid credit card number
   * @static
   * @param {string} value - Value to validate
   * @returns {boolean} True if value is a valid credit card
   */
  static isCreditCard(value) {
    if (typeof value !== 'string') return false;
    const cleaned = value.replace(/[\s-]/g, '');
    return CommonValidator.CREDIT_CARD_REGEX.test(cleaned);
  }

  /**
   * Validates if a value is a valid slug
   * @static
   * @param {string} value - Value to validate
   * @returns {boolean} True if value is a valid slug
   */
  static isSlug(value) {
    if (typeof value !== 'string') return false;
    return CommonValidator.SLUG_REGEX.test(value);
  }

  /**
   * Validates if a value is a valid username
   * @static
   * @param {string} value - Value to validate
   * @returns {boolean} True if value is a valid username
   */
  static isValidUsername(value) {
    if (typeof value !== 'string') return false;
    return CommonValidator.USERNAME_REGEX.test(value);
  }

  /**
   * Validates if a value is a strong password
   * @static
   * @param {string} value - Value to validate
   * @returns {boolean} True if value is a strong password
   */
  static isStrongPassword(value) {
    if (typeof value !== 'string') return false;
    return CommonValidator.PASSWORD_STRONG_REGEX.test(value);
  }

  /**
   * Validates if a value is a valid postal code
   * @static
   * @param {string} value - Value to validate
   * @param {string} [country='US'] - Country code (US, UK, CA)
   * @returns {boolean} True if value is a valid postal code
   */
  static isPostalCode(value, country = 'US') {
    if (typeof value !== 'string') return false;

    switch (country.toUpperCase()) {
      case 'US':
        return CommonValidator.POSTAL_CODE_US_REGEX.test(value);
      case 'UK':
        return CommonValidator.POSTAL_CODE_UK_REGEX.test(value);
      case 'CA':
        return CommonValidator.POSTAL_CODE_CA_REGEX.test(value);
      default:
        return false;
    }
  }

  /**
   * Validates if a value is a valid SSN
   * @static
   * @param {string} value - Value to validate
   * @returns {boolean} True if value is a valid SSN
   */
  static isSSN(value) {
    if (typeof value !== 'string') return false;
    return CommonValidator.SSN_REGEX.test(value);
  }

  /**
   * Validates if a value is a valid MAC address
   * @static
   * @param {string} value - Value to validate
   * @returns {boolean} True if value is a valid MAC address
   */
  static isMACAddress(value) {
    if (typeof value !== 'string') return false;
    return CommonValidator.MAC_ADDRESS_REGEX.test(value);
  }

  // ==================== Express Validator Middleware (for Routes) ====================

  /**
   * Validate MongoDB ObjectId
   * @static
   * @param {string} field - Field name to validate
   * @param {string} [location='param'] - Location of field (param, body, query)
   * @returns {Function} Express validator middleware
   */
  static mongoId(field, location = 'param') {
    const validator = location === 'param' ? param :
                      location === 'body' ? body : query;

    return validator(field)
      .isMongoId()
      .withMessage(`${field} must be a valid MongoDB ObjectId`);
  }

  /**
   * Validate email address
   * @static
   * @param {string} [field='email'] - Field name
   * @param {Object} [options={}] - Validation options
   * @returns {Function} Express validator middleware
   */
  static email(field = 'email', options = {}) {
    const { required = true, normalize = true } = options;

    let validator = body(field);

    if (required) {
      validator = validator
        .notEmpty()
        .withMessage('Email is required');
    } else {
      validator = validator.optional();
    }

    validator = validator
      .isEmail()
      .withMessage('Please provide a valid email address');

    if (normalize) {
      validator = validator.normalizeEmail({
        gmail_remove_dots: false,
        gmail_remove_subaddress: false,
        outlookdotcom_remove_subaddress: false
      });
    }

    return validator;
  }

  /**
   * Validate phone number
   * @static
   * @param {string} [field='phone'] - Field name
   * @param {Object} [options={}] - Validation options
   * @returns {Function} Express validator middleware
   */
  static phoneNumber(field = 'phone', options = {}) {
    const { required = true, locale = 'any' } = options;

    let validator = body(field);

    if (required) {
      validator = validator
        .notEmpty()
        .withMessage('Phone number is required');
    } else {
      validator = validator.optional();
    }

    return validator
      .isMobilePhone(locale)
      .withMessage('Please provide a valid phone number');
  }

  /**
   * Validate URL
   * @static
   * @param {string} [field='url'] - Field name
   * @param {Object} [options={}] - Validation options
   * @returns {Function} Express validator middleware
   */
  static url(field = 'url', options = {}) {
    const {
      required = true,
      protocols = ['http', 'https'],
      requireProtocol = true
    } = options;

    let validator = body(field);

    if (required) {
      validator = validator
        .notEmpty()
        .withMessage('URL is required');
    } else {
      validator = validator.optional();
    }

    return validator
      .isURL({
        protocols,
        require_protocol: requireProtocol,
        require_valid_protocol: true
      })
      .withMessage('Please provide a valid URL');
  }

  /**
   * Validate date
   * @static
   * @param {string} field - Field name
   * @param {Object} [options={}] - Validation options
   * @returns {Function} Express validator middleware
   */
  static date(field, options = {}) {
    const {
      required = true,
      format = 'YYYY-MM-DD',
      before = null,
      after = null
    } = options;

    let validator = body(field);

    if (required) {
      validator = validator
        .notEmpty()
        .withMessage(`${field} is required`);
    } else {
      validator = validator.optional();
    }

    validator = validator
      .isISO8601()
      .withMessage(`${field} must be a valid date in ${format} format`);

    if (before) {
      validator = validator
        .custom(value => new Date(value) < new Date(before))
        .withMessage(`${field} must be before ${before}`);
    }

    if (after) {
      validator = validator
        .custom(value => new Date(value) > new Date(after))
        .withMessage(`${field} must be after ${after}`);
    }

    return validator;
  }

  /**
   * Validate string length
   * @static
   * @param {string} field - Field name
   * @param {Object} [options={}] - Validation options
   * @returns {Function} Express validator middleware
   */
  static stringLength(field, options = {}) {
    const {
      min = 1,
      max = 255,
      required = true,
      trim = true
    } = options;

    let validator = body(field);

    if (required) {
      validator = validator
        .notEmpty()
        .withMessage(`${field} is required`);
    } else {
      validator = validator.optional();
    }

    if (trim) {
      validator = validator.trim();
    }

    return validator
      .isLength({ min, max })
      .withMessage(`${field} must be between ${min} and ${max} characters`);
  }

  /**
   * Validate number range
   * @static
   * @param {string} field - Field name
   * @param {Object} [options={}] - Validation options
   * @returns {Function} Express validator middleware
   */
  static numberRange(field, options = {}) {
    const {
      min = Number.MIN_SAFE_INTEGER,
      max = Number.MAX_SAFE_INTEGER,
      required = true,
      integer = false
    } = options;

    let validator = body(field);

    if (required) {
      validator = validator
        .notEmpty()
        .withMessage(`${field} is required`);
    } else {
      validator = validator.optional();
    }

    validator = validator
      .isNumeric()
      .withMessage(`${field} must be a number`);

    if (integer) {
      validator = validator
        .isInt({ min, max })
        .withMessage(`${field} must be an integer between ${min} and ${max}`);
    } else {
      validator = validator
        .isFloat({ min, max })
        .withMessage(`${field} must be between ${min} and ${max}`);
    }

    return validator;
  }

  /**
   * Validate boolean
   * @static
   * @param {string} field - Field name
   * @param {Object} [options={}] - Validation options
   * @returns {Function} Express validator middleware
   */
  static boolean(field, options = {}) {
    const { required = true } = options;

    let validator = body(field);

    if (required) {
      validator = validator
        .notEmpty()
        .withMessage(`${field} is required`);
    } else {
      validator = validator.optional();
    }

    return validator
      .isBoolean()
      .withMessage(`${field} must be a boolean value`)
      .toBoolean();
  }

  /**
   * Validate array
   * @static
   * @param {string} field - Field name
   * @param {Object} [options={}] - Validation options
   * @returns {Function} Express validator middleware
   */
  static array(field, options = {}) {
    const {
      required = true,
      minLength = 0,
      maxLength = 100,
      unique = false
    } = options;

    let validator = body(field);

    if (required) {
      validator = validator
        .notEmpty()
        .withMessage(`${field} is required`);
    } else {
      validator = validator.optional();
    }

    validator = validator
      .isArray({ min: minLength, max: maxLength })
      .withMessage(`${field} must be an array with ${minLength}-${maxLength} items`);

    if (unique) {
      validator = validator
        .custom(value => {
          const uniqueItems = [...new Set(value)];
          return uniqueItems.length === value.length;
        })
        .withMessage(`${field} must contain unique values`);
    }

    return validator;
  }

  /**
   * Validate enum values
   * @static
   * @param {string} field - Field name
   * @param {Array} values - Allowed values
   * @param {Object} [options={}] - Validation options
   * @returns {Function} Express validator middleware
   */
  static enum(field, values, options = {}) {
    const { required = true } = options;

    let validator = body(field);

    if (required) {
      validator = validator
        .notEmpty()
        .withMessage(`${field} is required`);
    } else {
      validator = validator.optional();
    }

    return validator
      .isIn(values)
      .withMessage(`${field} must be one of: ${values.join(', ')}`);
  }

  /**
   * Validate pagination parameters
   * @static
   * @returns {Array} Array of validators
   */
  static pagination() {
    return [
      query('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Page must be a positive integer')
        .toInt(),

      query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit must be between 1 and 100')
        .toInt(),

      query('sort')
        .optional()
        .matches(/^[a-zA-Z_]+:(asc|desc)$/)
        .withMessage('Sort must be in format: field:asc or field:desc'),

      query('search')
        .optional()
        .trim()
        .isLength({ min: 1, max: 100 })
        .withMessage('Search query must be between 1 and 100 characters')
    ];
  }

  /**
   * Check validation results
   * @static
   * @returns {Function} Express middleware
   */
  static checkValidation() {
    return (req, res, next) => {
      const errors = validationResult(req);

      if (!errors.isEmpty()) {
        const formattedErrors = errors.array().map(err => ({
          field: err.path || err.param,
          message: err.msg,
          value: err.value,
          location: err.location
        }));

        return next(new AppError(
          'Validation failed',
          400,
          'VALIDATION_ERROR',
          { errors: formattedErrors }
        ));
      }

      next();
    };
  }

  /**
   * Sanitize input
   * @static
   * @param {string} field - Field name
   * @returns {Function} Express validator middleware
   */
  static sanitize(field) {
    return body(field)
      .trim()
      .escape()
      .stripLow();
  }
}

module.exports = CommonValidator;