'use strict';

/**
 * @fileoverview Common validation utilities for general-purpose input validation
 * @module shared/lib/utils/validators/common-validators
 * @requires module:shared/lib/utils/helpers/string-helper
 * @requires module:shared/lib/utils/helpers/date-helper
 * @requires module:shared/lib/utils/constants/error-codes
 */

const StringHelper = require('../helpers/string-helper');
const DateHelper = require('../helpers/date-helper');
const { VALIDATION_ERRORS } = require('../constants/error-codes');

/**
 * @class CommonValidator
 * @description Provides common validation methods for general-purpose input validation
 */
class CommonValidator {
  /**
   * @private
   * @static
   * @readonly
   */
  static #UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  static #URL_REGEX = /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/;
  static #PHONE_REGEX = /^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{4,6}$/;
  static #ALPHANUMERIC_REGEX = /^[a-zA-Z0-9]+$/;
  static #ALPHA_REGEX = /^[a-zA-Z]+$/;
  static #NUMERIC_REGEX = /^[0-9]+$/;
  static #DECIMAL_REGEX = /^[0-9]+(\.[0-9]+)?$/;
  static #HEX_COLOR_REGEX = /^#?([a-f0-9]{6}|[a-f0-9]{3})$/i;
  static #IPV4_REGEX = /^(([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])$/;
  static #IPV6_REGEX = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;

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
   * @param {boolean} [options.exact] - Exact length
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
    if (isNaN(num) || !isFinite(num)) return false;
    
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
    
    return value === true || value === false || 
           value === 'true' || value === 'false' ||
           value === 1 || value === 0 ||
           value === '1' || value === '0';
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
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }
    
    const { requiredKeys = [], schema = {} } = options;
    
    // Check required keys
    for (const key of requiredKeys) {
      if (!(key in value)) return false;
    }
    
    // Validate against schema if provided
    for (const [key, validator] of Object.entries(schema)) {
      if (typeof validator === 'function' && !validator(value[key])) {
        return false;
      }
    }
    
    return true;
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
    
    const { version } = options;
    
    if (!this.#UUID_REGEX.test(value)) return false;
    
    if (version && version >= 1 && version <= 5) {
      const versionChar = value.charAt(14);
      return versionChar === version.toString();
    }
    
    return true;
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
      
      return this.#URL_REGEX.test(value);
    } catch {
      return false;
    }
  }

  /**
   * Validates if a value is a valid phone number
   * @static
   * @param {string} value - Value to validate
   * @param {Object} [options={}] - Validation options
   * @param {string} [options.country] - Country code for validation
   * @returns {boolean} True if value is a valid phone number
   */
  static isValidPhone(value, options = {}) {
    if (typeof value !== 'string') return false;
    
    const cleaned = value.replace(/[\s\-\(\)]/g, '');
    return this.#PHONE_REGEX.test(cleaned);
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
    const pattern = allowSpaces ? /^[a-zA-Z\s]+$/ : this.#ALPHA_REGEX;
    
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
    return this.#NUMERIC_REGEX.test(value);
  }

  /**
   * Validates if a value is a valid decimal
   * @static
   * @param {string} value - Value to validate
   * @param {Object} [options={}] - Validation options
   * @param {number} [options.precision] - Maximum decimal places
   * @returns {boolean} True if value is a valid decimal
   */
  static isDecimal(value, options = {}) {
    if (typeof value !== 'string' && typeof value !== 'number') return false;
    
    const str = value.toString();
    if (!this.#DECIMAL_REGEX.test(str)) return false;
    
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
    return this.#HEX_COLOR_REGEX.test(value);
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
      return this.#IPV4_REGEX.test(value);
    } else if (version === 6) {
      return this.#IPV6_REGEX.test(value);
    }
    
    return this.#IPV4_REGEX.test(value) || this.#IPV6_REGEX.test(value);
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
    
    // Check if string matches base64 pattern
    if (!base64Regex.test(value)) return false;
    
    // Check if length is multiple of 4
    if (value.length % 4 !== 0) return false;
    
    try {
      return btoa(atob(value)) === value;
    } catch {
      return false;
    }
  }

  /**
   * Validates multiple values with their validators
   * @static
   * @param {Object} validations - Object with field names and validators
   * @returns {Object} Validation result with errors
   */
  static validateMultiple(validations) {
    const errors = {};
    let isValid = true;
    
    for (const [field, validator] of Object.entries(validations)) {
      if (typeof validator === 'function') {
        const result = validator();
        if (result !== true) {
          errors[field] = result || 'Validation failed';
          isValid = false;
        }
      }
    }
    
    return { isValid, errors };
  }

  /**
   * Creates a custom validator with chaining support
   * @static
   * @param {*} value - Value to validate
   * @returns {Object} Validator chain object
   */
  static validate(value) {
    const errors = [];
    let currentValue = value;
    
    const chain = {
      value: currentValue,
      errors,
      
      required(message = 'Value is required') {
        if (!CommonValidator.isDefined(currentValue)) {
          errors.push(message);
        }
        return chain;
      },
      
      string(message = 'Value must be a string') {
        if (typeof currentValue !== 'string') {
          errors.push(message);
        }
        return chain;
      },
      
      minLength(min, message) {
        if (typeof currentValue === 'string' && currentValue.length < min) {
          errors.push(message || `Minimum length is ${min}`);
        }
        return chain;
      },
      
      maxLength(max, message) {
        if (typeof currentValue === 'string' && currentValue.length > max) {
          errors.push(message || `Maximum length is ${max}`);
        }
        return chain;
      },
      
      pattern(regex, message = 'Value does not match pattern') {
        if (!CommonValidator.matchesPattern(currentValue, regex)) {
          errors.push(message);
        }
        return chain;
      },
      
      custom(validator, message = 'Custom validation failed') {
        if (typeof validator === 'function' && !validator(currentValue)) {
          errors.push(message);
        }
        return chain;
      },
      
      transform(transformer) {
        if (typeof transformer === 'function') {
          currentValue = transformer(currentValue);
          chain.value = currentValue;
        }
        return chain;
      },
      
      isValid() {
        return errors.length === 0;
      },
      
      getErrors() {
        return errors.length > 0 ? errors : null;
      },
      
      getFirstError() {
        return errors.length > 0 ? errors[0] : null;
      }
    };
    
    return chain;
  }
}

module.exports = CommonValidator;