'use strict';

/**
 * @fileoverview String manipulation and validation utilities
 * @module shared/lib/utils/helpers/string-helper
 */

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
}

module.exports = StringHelper;