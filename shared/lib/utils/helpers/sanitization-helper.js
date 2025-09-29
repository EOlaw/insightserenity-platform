'use strict';

/**
 * @fileoverview Data sanitization and cleaning utilities
 * @module shared/lib/utils/helpers/sanitization-helper
 */

const validator = require('validator');
const DOMPurify = require('isomorphic-dompurify');

/**
 * @class SanitizationHelper
 * @description Comprehensive data sanitization utilities
 */
class SanitizationHelper {
  /**
   * Sanitize string input
   * @static
   * @param {string} input - Input string
   * @param {Object} [options={}] - Sanitization options
   * @returns {string} Sanitized string
   */
  static sanitizeString(input, options = {}) {
    const {
      trim = true,
      lowercase = false,
      uppercase = false,
      removeSpaces = false,
      removeSpecialChars = false,
      alphanumericOnly = false,
      maxLength = null
    } = options;

    if (typeof input !== 'string') {
      return '';
    }

    let sanitized = input;

    // Basic sanitization
    if (trim) sanitized = sanitized.trim();
    if (lowercase) sanitized = sanitized.toLowerCase();
    if (uppercase) sanitized = sanitized.toUpperCase();
    if (removeSpaces) sanitized = sanitized.replace(/\s+/g, '');
    if (removeSpecialChars) sanitized = sanitized.replace(/[^a-zA-Z0-9\s]/g, '');
    if (alphanumericOnly) sanitized = sanitized.replace(/[^a-zA-Z0-9]/g, '');

    // Length constraint
    if (maxLength && sanitized.length > maxLength) {
      sanitized = sanitized.substring(0, maxLength);
    }

    return sanitized;
  }

  /**
   * Sanitize HTML content
   * @static
   * @param {string} html - HTML content
   * @param {Object} [options={}] - Sanitization options
   * @returns {string} Sanitized HTML
   */
  static sanitizeHTML(html, options = {}) {
    const {
      allowedTags = null,
      allowedAttributes = null,
      allowedSchemes = ['http', 'https', 'mailto'],
      stripIgnoreTag = true,
      stripIgnoreTagBody = false
    } = options;

    const config = {};

    if (allowedTags) {
      config.ALLOWED_TAGS = allowedTags;
    }

    if (allowedAttributes) {
      config.ALLOWED_ATTR = allowedAttributes;
    }

    if (allowedSchemes) {
      config.ALLOWED_URI_REGEXP = new RegExp(`^(${allowedSchemes.join('|')}):`);
    }

    config.KEEP_CONTENT = !stripIgnoreTag;
    config.WHOLE_DOCUMENT = false;

    return DOMPurify.sanitize(html, config);
  }

  /**
   * Escape HTML entities
   * @static
   * @param {string} str - String to escape
   * @returns {string} Escaped string
   */
  static escapeHTML(str) {
    return validator.escape(str);
  }

  /**
   * Unescape HTML entities
   * @static
   * @param {string} str - String to unescape
   * @returns {string} Unescaped string
   */
  static unescapeHTML(str) {
    return validator.unescape(str);
  }

  /**
   * Sanitize SQL input
   * @static
   * @param {string} input - SQL input
   * @returns {string} Sanitized SQL input
   */
  static sanitizeSQL(input) {
    if (typeof input !== 'string') {
      return '';
    }

    // Remove or escape dangerous SQL characters
    return input
      .replace(/['";\\]/g, '') // Remove quotes and backslash
      .replace(/--/g, '') // Remove SQL comments
      .replace(/\/\*/g, '') // Remove multi-line comment start
      .replace(/\*\//g, '') // Remove multi-line comment end
      .replace(/xp_/gi, '') // Remove extended stored procedures
      .replace(/script/gi, '') // Remove script tags
      .replace(/union[\s\n\r]+select/gi, '') // Remove UNION SELECT
      .replace(/drop[\s\n\r]+table/gi, '') // Remove DROP TABLE
      .replace(/insert[\s\n\r]+into/gi, '') // Remove INSERT INTO
      .replace(/select[\s\n\r]+\*/gi, ''); // Remove SELECT *
  }

  /**
   * Sanitize filename
   * @static
   * @param {string} filename - Filename to sanitize
   * @param {Object} [options={}] - Sanitization options
   * @returns {string} Sanitized filename
   */
  static sanitizeFilename(filename, options = {}) {
    const {
      replacement = '_',
      maxLength = 255,
      preserveExtension = true
    } = options;

    if (typeof filename !== 'string') {
      return 'unnamed';
    }

    let name = filename;
    let extension = '';

    // Separate extension if needed
    if (preserveExtension) {
      const lastDot = filename.lastIndexOf('.');
      if (lastDot > 0) {
        name = filename.substring(0, lastDot);
        extension = filename.substring(lastDot);
      }
    }

    // Sanitize name
    name = name
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, replacement) // Windows forbidden chars
      .replace(/^\.+/, replacement) // Remove leading dots
      .replace(/[\s.]+$/, '') // Remove trailing spaces and dots
      .replace(/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i, `${replacement}$1$2`); // Windows reserved names

    // Sanitize extension
    if (extension) {
      extension = extension
        .toLowerCase()
        .replace(/[^a-z0-9.]/g, '');
    }

    // Combine and enforce max length
    let sanitized = name + extension;
    if (sanitized.length > maxLength) {
      const nameMaxLength = maxLength - extension.length;
      sanitized = name.substring(0, nameMaxLength) + extension;
    }

    return sanitized || 'unnamed';
  }

  /**
   * Sanitize URL
   * @static
   * @param {string} url - URL to sanitize
   * @param {Object} [options={}] - Sanitization options
   * @returns {string} Sanitized URL
   */
  static sanitizeURL(url, options = {}) {
    const {
      allowedProtocols = ['http', 'https'],
      removeQueryParams = false,
      removeFragment = false
    } = options;

    if (typeof url !== 'string') {
      return '';
    }

    try {
      const urlObj = new URL(url);

      // Check protocol
      if (!allowedProtocols.includes(urlObj.protocol.replace(':', ''))) {
        return '';
      }

      // Remove query params if requested
      if (removeQueryParams) {
        urlObj.search = '';
      }

      // Remove fragment if requested
      if (removeFragment) {
        urlObj.hash = '';
      }

      return urlObj.toString();
    } catch (error) {
      return '';
    }
  }

  /**
   * Sanitize JSON input
   * @static
   * @param {string} jsonString - JSON string
   * @param {Object} [options={}] - Sanitization options
   * @returns {Object|null} Parsed and sanitized JSON
   */
  static sanitizeJSON(jsonString, options = {}) {
    const {
      maxDepth = 10,
      maxKeys = 1000,
      removeNullValues = false,
      removeEmptyStrings = false
    } = options;

    try {
      const parsed = JSON.parse(jsonString);
      return this.sanitizeObject(parsed, {
        maxDepth,
        maxKeys,
        removeNullValues,
        removeEmptyStrings
      });
    } catch (error) {
      return null;
    }
  }

  /**
   * Sanitize object recursively
   * @static
   * @param {Object} obj - Object to sanitize
   * @param {Object} [options={}] - Sanitization options
   * @param {number} [currentDepth=0] - Current recursion depth
   * @returns {Object} Sanitized object
   */
  static sanitizeObject(obj, options = {}, currentDepth = 0) {
    const {
      maxDepth = 10,
      maxKeys = 1000,
      removeNullValues = false,
      removeEmptyStrings = false,
      removeUndefined = true
    } = options;

    if (currentDepth > maxDepth) {
      return null;
    }

    if (obj === null || obj === undefined) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj
        .map(item => this.sanitizeObject(item, options, currentDepth + 1))
        .filter(item => {
          if (removeNullValues && item === null) return false;
          if (removeUndefined && item === undefined) return false;
          if (removeEmptyStrings && item === '') return false;
          return true;
        });
    }

    if (typeof obj === 'object') {
      const sanitized = {};
      let keyCount = 0;

      for (const [key, value] of Object.entries(obj)) {
        if (keyCount >= maxKeys) break;

        const sanitizedKey = this.sanitizeString(key, {
          removeSpecialChars: true,
          maxLength: 100
        });

        const sanitizedValue = this.sanitizeObject(value, options, currentDepth + 1);

        if (removeNullValues && sanitizedValue === null) continue;
        if (removeUndefined && sanitizedValue === undefined) continue;
        if (removeEmptyStrings && sanitizedValue === '') continue;

        sanitized[sanitizedKey] = sanitizedValue;
        keyCount++;
      }

      return sanitized;
    }

    if (typeof obj === 'string') {
      return this.escapeHTML(obj);
    }

    return obj;
  }

  /**
   * Sanitize phone number
   * @static
   * @param {string} phone - Phone number
   * @param {Object} [options={}] - Sanitization options
   * @returns {string} Sanitized phone number
   */
  static sanitizePhone(phone, options = {}) {
    const {
      removeCountryCode = false,
      format = 'E164' // E164, NATIONAL, INTERNATIONAL
    } = options;

    if (typeof phone !== 'string') {
      return '';
    }

    // Remove all non-numeric characters except +
    let sanitized = phone.replace(/[^\d+]/g, '');

    if (removeCountryCode && sanitized.startsWith('+')) {
      sanitized = sanitized.replace(/^\+\d{1,3}/, '');
    }

    // Format based on option
    if (format === 'E164' && !sanitized.startsWith('+')) {
      sanitized = '+' + sanitized;
    }

    return sanitized;
  }

  /**
   * Sanitize email address
   * @static
   * @param {string} email - Email address
   * @returns {string} Sanitized email
   */
  static sanitizeEmail(email) {
    if (typeof email !== 'string') {
      return '';
    }

    return validator.normalizeEmail(email, {
      all_lowercase: true,
      gmail_remove_dots: true,
      gmail_remove_subaddress: false,
      gmail_convert_googlemaildotcom: true,
      outlookdotcom_remove_subaddress: false,
      yahoo_remove_subaddress: false,
      icloud_remove_subaddress: false
    }) || '';
  }

  /**
   * Sanitize credit card number
   * @static
   * @param {string} cardNumber - Credit card number
   * @returns {string} Sanitized card number
   */
  static sanitizeCreditCard(cardNumber) {
    if (typeof cardNumber !== 'string') {
      return '';
    }

    // Remove all non-digits
    return cardNumber.replace(/\D/g, '');
  }

  /**
   * Sanitize and mask sensitive data
   * @static
   * @param {string} data - Sensitive data
   * @param {Object} [options={}] - Masking options
   * @returns {string} Masked data
   */
  static maskSensitiveData(data, options = {}) {
    const {
      showFirst = 0,
      showLast = 4,
      maskChar = '*',
      minMaskLength = 4
    } = options;

    if (typeof data !== 'string' || data.length <= showFirst + showLast) {
      return data;
    }

    const first = data.substring(0, showFirst);
    const last = data.substring(data.length - showLast);
    const maskLength = Math.max(minMaskLength, data.length - showFirst - showLast);

    return first + maskChar.repeat(maskLength) + last;
  }

  /**
   * Remove ANSI escape codes
   * @static
   * @param {string} str - String with ANSI codes
   * @returns {string} Clean string
   */
  static removeANSI(str) {
    if (typeof str !== 'string') {
      return '';
    }

    // eslint-disable-next-line no-control-regex
    return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
  }

  /**
   * Sanitize MongoDB operators
   * @static
   * @param {Object} query - MongoDB query object
   * @returns {Object} Sanitized query
   */
  static sanitizeMongoQuery(query) {
    if (typeof query !== 'object' || query === null) {
      return {};
    }

    const sanitized = {};

    for (const [key, value] of Object.entries(query)) {
      // Remove keys starting with $ (MongoDB operators)
      if (key.startsWith('$')) {
        continue;
      }

      // Recursively sanitize nested objects
      if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeMongoQuery(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Sanitize XML input
   * @static
   * @param {string} xml - XML string
   * @returns {string} Sanitized XML
   */
  static sanitizeXML(xml) {
    if (typeof xml !== 'string') {
      return '';
    }

    return xml
      .replace(/<!--[\s\S]*?-->/g, '') // Remove comments
      .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '') // Remove CDATA
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
      .replace(/<!DOCTYPE[^>]*>/gi, '') // Remove DOCTYPE
      .replace(/<!ENTITY[^>]*>/gi, ''); // Remove ENTITY declarations
  }

  /**
   * Sanitize command line arguments
   * @static
   * @param {string} arg - Command line argument
   * @returns {string} Sanitized argument
   */
  static sanitizeCommandArg(arg) {
    if (typeof arg !== 'string') {
      return '';
    }

    // Remove shell metacharacters
    return arg.replace(/[;&|`$()<>\n\r]/g, '');
  }

  /**
   * Create sanitization report
   * @static
   * @param {any} original - Original data
   * @param {any} sanitized - Sanitized data
   * @returns {Object} Sanitization report
   */
  static createReport(original, sanitized) {
    return {
      original: typeof original,
      sanitized: typeof sanitized,
      changed: original !== sanitized,
      removedChars: typeof original === 'string'
        ? original.length - sanitized.length
        : null,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = SanitizationHelper;
