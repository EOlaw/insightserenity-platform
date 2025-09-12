'use strict';

/**
 * @fileoverview String manipulation and validation utilities
 * @module shared/lib/utils/helpers/string-helper
 */

const crypto = require('crypto');

/**
 * @class StringHelper
 * @description Comprehensive string manipulation utilities for the platform
 */
class StringHelper {
  /**
   * Capitalize first letter of string
   * @static
   * @param {string} str - String to capitalize
   * @returns {string} Capitalized string
   */
  static capitalize(str) {
    if (!str || typeof str !== 'string') return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Capitalize first letter of each word
   * @static
   * @param {string} str - String to title case
   * @returns {string} Title cased string
   */
  static toTitleCase(str) {
    if (!str || typeof str !== 'string') return '';
    return str.replace(/\w\S*/g, (txt) => {
      return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
    });
  }

  /**
   * Convert string to camelCase
   * @static
   * @param {string} str - String to convert
   * @returns {string} CamelCase string
   */
  static toCamelCase(str) {
    if (!str || typeof str !== 'string') return '';
    return str
      .replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) => {
        return index === 0 ? word.toLowerCase() : word.toUpperCase();
      })
      .replace(/[\s-_]+/g, '');
  }

  /**
   * Convert string to snake_case
   * @static
   * @param {string} str - String to convert
   * @returns {string} Snake_case string
   */
  static toSnakeCase(str) {
    if (!str || typeof str !== 'string') return '';
    return str
      .replace(/\W+/g, ' ')
      .split(/ |\B(?=[A-Z])/)
      .map(word => word.toLowerCase())
      .join('_');
  }

  /**
   * Convert string to kebab-case
   * @static
   * @param {string} str - String to convert
   * @returns {string} Kebab-case string
   */
  static toKebabCase(str) {
    if (!str || typeof str !== 'string') return '';
    return str
      .replace(/\W+/g, ' ')
      .split(/ |\B(?=[A-Z])/)
      .map(word => word.toLowerCase())
      .join('-');
  }

  /**
   * Convert string to URL-friendly slug
   * @static
   * @param {string} str - String to slugify
   * @param {Object} [options={}] - Options
   * @param {string} [options.separator='-'] - Word separator
   * @param {boolean} [options.lowercase=true] - Convert to lowercase
   * @returns {string} Slugified string
   */
  static toSlug(str, options = {}) {
    const { separator = '-', lowercase = true } = options;

    if (!str || typeof str !== 'string') return '';

    let slug = str
      .trim()
      .replace(/[^\w\s-]/g, '') // Remove special characters
      .replace(/[\s_-]+/g, separator) // Replace spaces and underscores with separator
      .replace(new RegExp(`^${separator}+|${separator}+$`, 'g'), ''); // Remove leading/trailing separators

    return lowercase ? slug.toLowerCase() : slug;
  }

  /**
   * Truncate string to specified length
   * @static
   * @param {string} str - String to truncate
   * @param {number} length - Maximum length
   * @param {string} [suffix='...'] - Suffix to append
   * @returns {string} Truncated string
   */
  static truncate(str, length, suffix = '...') {
    if (!str || typeof str !== 'string') return '';
    if (str.length <= length) return str;
    return str.substring(0, length - suffix.length) + suffix;
  }

  /**
   * Truncate string by words
   * @static
   * @param {string} str - String to truncate
   * @param {number} wordCount - Maximum word count
   * @param {string} [suffix='...'] - Suffix to append
   * @returns {string} Truncated string
   */
  static truncateWords(str, wordCount, suffix = '...') {
    if (!str || typeof str !== 'string') return '';
    const words = str.split(' ');
    if (words.length <= wordCount) return str;
    return words.slice(0, wordCount).join(' ') + suffix;
  }

  /**
   * Remove HTML tags from string
   * @static
   * @param {string} str - String with HTML
   * @returns {string} String without HTML tags
   */
  static stripHtml(str) {
    if (!str || typeof str !== 'string') return '';
    return str.replace(/<[^>]*>/g, '');
  }

  /**
   * Escape HTML special characters
   * @static
   * @param {string} str - String to escape
   * @returns {string} Escaped string
   */
  static escapeHtml(str) {
    if (!str || typeof str !== 'string') return '';
    const htmlEscapes = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return str.replace(/[&<>"']/g, (match) => htmlEscapes[match]);
  }

  /**
   * Unescape HTML special characters
   * @static
   * @param {string} str - String to unescape
   * @returns {string} Unescaped string
   */
  static unescapeHtml(str) {
    if (!str || typeof str !== 'string') return '';
    const htmlUnescapes = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&#39;': "'"
    };
    return str.replace(/&(?:amp|lt|gt|quot|#39);/g, (match) => htmlUnescapes[match]);
  }

  /**
   * Generate random string
   * @static
   * @param {number} length - String length
   * @param {Object} [options={}] - Options
   * @param {boolean} [options.numbers=true] - Include numbers
   * @param {boolean} [options.lowercase=true] - Include lowercase letters
   * @param {boolean} [options.uppercase=true] - Include uppercase letters
   * @param {boolean} [options.special=false] - Include special characters
   * @returns {string} Random string
   */
  static random(length, options = {}) {
    const {
      numbers = true,
      lowercase = true,
      uppercase = true,
      special = false
    } = options;

    let chars = '';
    if (numbers) chars += '0123456789';
    if (lowercase) chars += 'abcdefghijklmnopqrstuvwxyz';
    if (uppercase) chars += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (special) chars += '!@#$%^&*()_+-=[]{}|;:,.<>?';

    if (!chars) chars = '0123456789abcdefghijklmnopqrstuvwxyz';

    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * Generate UUID v4
   * @static
   * @param {boolean} [secure=true] - Use crypto.randomUUID if available
   * @returns {string} UUID v4
   */
  static generateUUID(secure = true) {
    try {
      // Use native randomUUID if available (Node.js 14.17+)
      if (secure && crypto.randomUUID) {
        return crypto.randomUUID();
      }

      // Fallback to manual UUID v4 generation
      const bytes = crypto.randomBytes(16);

      // Set version (4) and variant bits
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;

      const hex = bytes.toString('hex');

      return [
        hex.slice(0, 8),
        hex.slice(8, 12),
        hex.slice(12, 16),
        hex.slice(16, 20),
        hex.slice(20, 32)
      ].join('-');

    } catch (error) {
      // Fallback to timestamp-based UUID if crypto fails
      const timestamp = Date.now().toString(16);
      const random = Math.random().toString(16).substr(2);
      return `${timestamp}-${random}-4xxx-yxxx-xxxxxxxxxxxx`.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    }
  }

  /**
   * Check if string is valid email format
   * @static
   * @param {string} email - Email to validate
   * @returns {boolean} True if valid email format
   */
  static isValidEmail(email) {
    if (!email || typeof email !== 'string') return false;
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email.trim());
  }

  /**
   * Check if string is valid phone number format
   * @static
   * @param {string} phone - Phone number to validate
   * @returns {boolean} True if valid phone format
   */
  static isValidPhoneNumber(phone) {
    if (!phone || typeof phone !== 'string') return false;

    // Remove all non-digit characters except + at the start
    const cleanPhone = phone.replace(/[\s\-\(\)\.]/g, '');

    // Check if it's empty after cleaning
    if (!cleanPhone) return false;

    // Handle international format (starts with +)
    if (cleanPhone.startsWith('+')) {
      const digitsOnly = cleanPhone.substring(1);
      // International numbers: country code + national number (7-15 digits total)
      return /^\d{7,15}$/.test(digitsOnly);
    }

    // Handle domestic formats
    const digitsOnly = cleanPhone.replace(/[^\d]/g, '');

    // Must have at least 10 digits for most valid phone numbers
    // Maximum of 15 digits per ITU-T E.164 recommendation
    if (digitsOnly.length < 10 || digitsOnly.length > 15) {
      return false;
    }

    // Additional validation: first digit should not be 0 or 1 for US domestic numbers
    // but we'll be more lenient for international support
    return /^\d+$/.test(digitsOnly);
  }

  /**
   * Check if string is valid ObjectId format (MongoDB)
   * @static
   * @param {string} id - ID to validate
   * @returns {boolean} True if valid ObjectId format
   */
  static isValidObjectId(id) {
    if (!id || typeof id !== 'string') return false;
    const objectIdRegex = /^[0-9a-fA-F]{24}$/;
    return objectIdRegex.test(id);
  }

  /**
   * Check if password meets strength requirements
   * @static
   * @param {string} password - Password to validate
   * @param {Object} [options={}] - Options
   * @param {number} [options.minLength=8] - Minimum length
   * @param {boolean} [options.requireUppercase=true] - Require uppercase
   * @param {boolean} [options.requireLowercase=true] - Require lowercase
   * @param {boolean} [options.requireNumbers=true] - Require numbers
   * @param {boolean} [options.requireSpecial=true] - Require special characters
   * @returns {boolean} True if password is strong
   */
  static isStrongPassword(password, options = {}) {
    const {
      minLength = 8,
      requireUppercase = true,
      requireLowercase = true,
      requireNumbers = true,
      requireSpecial = true
    } = options;

    if (!password || typeof password !== 'string') return false;
    if (password.length < minLength) return false;
    if (requireUppercase && !/[A-Z]/.test(password)) return false;
    if (requireLowercase && !/[a-z]/.test(password)) return false;
    if (requireNumbers && !/\d/.test(password)) return false;
    if (requireSpecial && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) return false;

    return true;
  }

  /**
   * Generate a secure password
   * @static
   * @param {number} [length=12] - Password length
   * @param {Object} [options={}] - Options
   * @param {boolean} [options.includeUppercase=true] - Include uppercase letters
   * @param {boolean} [options.includeLowercase=true] - Include lowercase letters
   * @param {boolean} [options.includeNumbers=true] - Include numbers
   * @param {boolean} [options.includeSpecial=true] - Include special characters
   * @returns {string} Generated secure password
   */
  static generateSecurePassword(length = 12, options = {}) {
    const {
      includeUppercase = true,
      includeLowercase = true,
      includeNumbers = true,
      includeSpecial = true
    } = options;

    let charset = '';
    const required = [];

    if (includeUppercase) {
      charset += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      required.push('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
    }
    if (includeLowercase) {
      charset += 'abcdefghijklmnopqrstuvwxyz';
      required.push('abcdefghijklmnopqrstuvwxyz');
    }
    if (includeNumbers) {
      charset += '0123456789';
      required.push('0123456789');
    }
    if (includeSpecial) {
      charset += '!@#$%^&*()_+-=[]{}|;:,.<>?';
      required.push('!@#$%^&*()_+-=[]{}|;:,.<>?');
    }

    if (!charset) return '';

    let password = '';

    // Ensure at least one character from each required set
    for (const charSet of required) {
      const randomIndex = Math.floor(Math.random() * charSet.length);
      password += charSet[randomIndex];
    }

    // Fill remaining length with random characters from full charset
    for (let i = password.length; i < length; i++) {
      const randomIndex = Math.floor(Math.random() * charset.length);
      password += charset[randomIndex];
    }

    // Shuffle the password to avoid predictable patterns
    return password.split('').sort(() => Math.random() - 0.5).join('');
  }

  /**
   * Pad string to specified length
   * @static
   * @param {string} str - String to pad
   * @param {number} length - Target length
   * @param {string} [char=' '] - Character to pad with
   * @param {string} [position='right'] - Padding position (left/right/both)
   * @returns {string} Padded string
   */
  static pad(str, length, char = ' ', position = 'right') {
    str = String(str);
    if (str.length >= length) return str;

    const padLength = length - str.length;

    switch (position) {
      case 'left':
        return char.repeat(padLength) + str;
      case 'both':
        const leftPad = Math.floor(padLength / 2);
        const rightPad = Math.ceil(padLength / 2);
        return char.repeat(leftPad) + str + char.repeat(rightPad);
      default:
        return str + char.repeat(padLength);
    }
  }

  /**
   * Remove whitespace from string
   * @static
   * @param {string} str - String to trim
   * @param {string} [position='both'] - Trim position (left/right/both/all)
   * @returns {string} Trimmed string
   */
  static trim(str, position = 'both') {
    if (!str || typeof str !== 'string') return '';

    switch (position) {
      case 'left':
        return str.replace(/^\s+/, '');
      case 'right':
        return str.replace(/\s+$/, '');
      case 'all':
        return str.replace(/\s+/g, '');
      default:
        return str.trim();
    }
  }

  /**
   * Check if string contains substring
   * @static
   * @param {string} str - String to search
   * @param {string} substring - Substring to find
   * @param {boolean} [caseSensitive=true] - Case sensitive search
   * @returns {boolean} True if contains substring
   */
  static contains(str, substring, caseSensitive = true) {
    if (!str || !substring) return false;

    if (!caseSensitive) {
      str = str.toLowerCase();
      substring = substring.toLowerCase();
    }

    return str.indexOf(substring) !== -1;
  }

  /**
   * Count occurrences of substring
   * @static
   * @param {string} str - String to search
   * @param {string} substring - Substring to count
   * @param {boolean} [caseSensitive=true] - Case sensitive search
   * @returns {number} Number of occurrences
   */
  static countOccurrences(str, substring, caseSensitive = true) {
    if (!str || !substring) return 0;

    if (!caseSensitive) {
      str = str.toLowerCase();
      substring = substring.toLowerCase();
    }

    return str.split(substring).length - 1;
  }

  /**
   * Replace all occurrences of substring
   * @static
   * @param {string} str - String to process
   * @param {string} search - String to search for
   * @param {string} replace - String to replace with
   * @param {boolean} [caseSensitive=true] - Case sensitive search
   * @returns {string} Processed string
   */
  static replaceAll(str, search, replace, caseSensitive = true) {
    if (!str || typeof str !== 'string') return '';

    const flags = caseSensitive ? 'g' : 'gi';
    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return str.replace(new RegExp(escapedSearch, flags), replace);
  }

  /**
   * Extract numbers from string
   * @static
   * @param {string} str - String to process
   * @returns {number[]} Array of numbers
   */
  static extractNumbers(str) {
    if (!str || typeof str !== 'string') return [];
    const matches = str.match(/\d+(\.\d+)?/g);
    return matches ? matches.map(Number) : [];
  }

  /**
   * Extract emails from string
   * @static
   * @param {string} str - String to process
   * @returns {string[]} Array of email addresses
   */
  static extractEmails(str) {
    if (!str || typeof str !== 'string') return [];
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    return str.match(emailRegex) || [];
  }

  /**
   * Extract URLs from string
   * @static
   * @param {string} str - String to process
   * @returns {string[]} Array of URLs
   */
  static extractUrls(str) {
    if (!str || typeof str !== 'string') return [];
    const urlRegex = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/g;
    return str.match(urlRegex) || [];
  }

  /**
   * Mask sensitive data
   * @static
   * @param {string} str - String to mask
   * @param {Object} [options={}] - Options
   * @param {number} [options.start=0] - Start position
   * @param {number} [options.end=4] - Number of characters to show at end
   * @param {string} [options.mask='*'] - Mask character
   * @returns {string} Masked string
   */
  static mask(str, options = {}) {
    const { start = 0, end = 4, mask = '*' } = options;

    if (!str || typeof str !== 'string') return '';
    if (str.length <= start + end) return mask.repeat(str.length);

    const startStr = str.substring(0, start);
    const endStr = str.substring(str.length - end);
    const maskLength = str.length - start - end;

    return startStr + mask.repeat(maskLength) + endStr;
  }

  /**
   * Check if string is valid JSON
   * @static
   * @param {string} str - String to check
   * @returns {boolean} True if valid JSON
   */
  static isJson(str) {
    if (!str || typeof str !== 'string') return false;
    try {
      JSON.parse(str);
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Reverse string
   * @static
   * @param {string} str - String to reverse
   * @returns {string} Reversed string
   */
  static reverse(str) {
    if (!str || typeof str !== 'string') return '';
    return str.split('').reverse().join('');
  }

  /**
   * Remove duplicate characters
   * @static
   * @param {string} str - String to process
   * @returns {string} String without duplicates
   */
  static removeDuplicates(str) {
    if (!str || typeof str !== 'string') return '';
    return [...new Set(str)].join('');
  }

  /**
   * Pluralize string
   * @static
   * @param {string} str - String to pluralize
   * @returns {string} Pluralized string
   */
  static pluralize(str) {
    if (!str || typeof str !== 'string') return '';

    // Basic English pluralization rules
    if (str.match(/(s|ss|sh|ch|x|z)$/i)) {
      return str + 'es';
    }
    if (str.match(/([^aeiou])y$/i)) {
      return str.slice(0, -1) + 'ies';
    }
    if (str.match(/f$/i)) {
      return str.slice(0, -1) + 'ves';
    }
    if (str.match(/fe$/i)) {
      return str.slice(0, -2) + 'ves';
    }
    if (str.match(/(o)$/i)) {
      return str + 'es';
    }

    // Default: just add 's'
    return str + 's';
  }
}

module.exports = StringHelper;