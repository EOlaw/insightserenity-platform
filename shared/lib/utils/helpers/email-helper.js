'use strict';

/**
 * @fileoverview Email validation and manipulation utilities
 * @module shared/lib/utils/helpers/email-helper
 */

const crypto = require('crypto');

/**
 * @class EmailHelper
 * @description Comprehensive email utilities for the platform
 */
class EmailHelper {
  /**
   * Email regex pattern
   * @static
   * @private
   */
  static #EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

  /**
   * Common disposable email domains
   * @static
   * @private
   */
  static #DISPOSABLE_DOMAINS = [
    'tempmail.com', 'throwaway.email', 'guerrillamail.com', 
    'mailinator.com', '10minutemail.com', 'trashmail.com',
    'yopmail.com', 'fake-mail.net', 'trash-mail.com'
  ];

  /**
   * Common role-based email prefixes
   * @static
   * @private
   */
  static #ROLE_BASED_PREFIXES = [
    'admin', 'administrator', 'support', 'help', 'info',
    'contact', 'sales', 'marketing', 'billing', 'no-reply',
    'noreply', 'donotreply', 'postmaster', 'webmaster',
    'abuse', 'spam', 'privacy', 'security'
  ];

  /**
   * Validate email format
   * @static
   * @param {string} email - Email address
   * @returns {boolean} True if valid email format
   */
  static isValid(email) {
    if (!email || typeof email !== 'string') return false;
    return this.#EMAIL_REGEX.test(email.toLowerCase());
  }

  /**
   * Validate multiple emails
   * @static
   * @param {string[]} emails - Array of email addresses
   * @returns {Object} Validation results
   */
  static validateBulk(emails) {
    const results = {
      valid: [],
      invalid: []
    };

    emails.forEach(email => {
      if (this.isValid(email)) {
        results.valid.push(email);
      } else {
        results.invalid.push(email);
      }
    });

    return results;
  }

  /**
   * Normalize email address
   * @static
   * @param {string} email - Email address
   * @returns {string} Normalized email
   */
  static normalize(email) {
    if (!email || typeof email !== 'string') return '';
    return email.toLowerCase().trim();
  }

  /**
   * Extract parts from email
   * @static
   * @param {string} email - Email address
   * @returns {Object|null} Email parts or null
   */
  static extractParts(email) {
    if (!this.isValid(email)) return null;

    const normalized = this.normalize(email);
    const [localPart, domain] = normalized.split('@');
    const [domainName, ...subdomains] = domain.split('.').reverse();
    const tld = domainName;
    const domainBase = subdomains.reverse().join('.');

    return {
      email: normalized,
      localPart,
      domain,
      domainBase,
      tld
    };
  }

  /**
   * Check if email is disposable
   * @static
   * @param {string} email - Email address
   * @returns {boolean} True if disposable
   */
  static isDisposable(email) {
    const parts = this.extractParts(email);
    if (!parts) return false;

    return this.#DISPOSABLE_DOMAINS.includes(parts.domain);
  }

  /**
   * Check if email is role-based
   * @static
   * @param {string} email - Email address
   * @returns {boolean} True if role-based
   */
  static isRoleBased(email) {
    const parts = this.extractParts(email);
    if (!parts) return false;

    return this.#ROLE_BASED_PREFIXES.includes(parts.localPart);
  }

  /**
   * Generate gravatar URL
   * @static
   * @param {string} email - Email address
   * @param {Object} [options={}] - Options
   * @param {number} [options.size=200] - Image size
   * @param {string} [options.default='identicon'] - Default image type
   * @param {string} [options.rating='g'] - Rating
   * @returns {string} Gravatar URL
   */
  static getGravatarUrl(email, options = {}) {
    const { size = 200, default: defaultImage = 'identicon', rating = 'g' } = options;
    
    const normalized = this.normalize(email);
    const hash = crypto.createHash('md5').update(normalized).digest('hex');
    
    const params = new URLSearchParams({
      s: size,
      d: defaultImage,
      r: rating
    });

    return `https://www.gravatar.com/avatar/${hash}?${params}`;
  }

  /**
   * Mask email address
   * @static
   * @param {string} email - Email address
   * @param {Object} [options={}] - Options
   * @param {number} [options.showChars=3] - Characters to show
   * @param {string} [options.mask='*'] - Mask character
   * @returns {string} Masked email
   */
  static mask(email, options = {}) {
    const { showChars = 3, mask = '*' } = options;
    
    const parts = this.extractParts(email);
    if (!parts) return '';

    const { localPart, domain } = parts;
    
    if (localPart.length <= showChars) {
      return mask.repeat(localPart.length) + '@' + domain;
    }

    const visible = localPart.substring(0, showChars);
    const hidden = mask.repeat(localPart.length - showChars);
    
    return visible + hidden + '@' + domain;
  }

  /**
   * Generate plus alias
   * @static
   * @param {string} email - Base email address
   * @param {string} alias - Alias to add
   * @returns {string|null} Email with alias or null
   */
  static generatePlusAlias(email, alias) {
    const parts = this.extractParts(email);
    if (!parts) return null;

    const { localPart, domain } = parts;
    const cleanAlias = alias.replace(/[^a-zA-Z0-9]/g, '');
    
    return `${localPart}+${cleanAlias}@${domain}`;
  }

  /**
   * Remove plus alias
   * @static
   * @param {string} email - Email with potential alias
   * @returns {string} Email without alias
   */
  static removePlusAlias(email) {
    const parts = this.extractParts(email);
    if (!parts) return email;

    const { localPart, domain } = parts;
    const baseLocal = localPart.split('+')[0];
    
    return `${baseLocal}@${domain}`;
  }

  /**
   * Check if two emails are equivalent (ignoring plus aliases)
   * @static
   * @param {string} email1 - First email
   * @param {string} email2 - Second email
   * @returns {boolean} True if equivalent
   */
  static areEquivalent(email1, email2) {
    const base1 = this.removePlusAlias(this.normalize(email1));
    const base2 = this.removePlusAlias(this.normalize(email2));
    
    return base1 === base2;
  }

  /**
   * Generate email verification token
   * @static
   * @param {string} email - Email address
   * @param {string} [secret] - Secret key
   * @returns {string} Verification token
   */
  static generateVerificationToken(email, secret = '') {
    const normalized = this.normalize(email);
    const timestamp = Date.now();
    const data = `${normalized}:${timestamp}:${secret}`;
    
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Parse email list from string
   * @static
   * @param {string} emailString - String containing emails
   * @param {string} [delimiter=','] - Delimiter
   * @returns {string[]} Array of valid emails
   */
  static parseEmailList(emailString, delimiter = ',') {
    if (!emailString || typeof emailString !== 'string') return [];

    return emailString
      .split(delimiter)
      .map(email => email.trim())
      .filter(email => this.isValid(email))
      .map(email => this.normalize(email));
  }

  /**
   * Check domain MX records (requires DNS lookup)
   * @static
   * @async
   * @param {string} email - Email address
   * @returns {Promise<boolean>} True if domain has MX records
   */
  static async hasMxRecords(email) {
    const dns = require('dns').promises;
    const parts = this.extractParts(email);
    
    if (!parts) return false;

    try {
      const records = await dns.resolveMx(parts.domain);
      return records && records.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Create email template variables
   * @static
   * @param {Object} data - Template data
   * @returns {Object} Formatted template variables
   */
  static createTemplateVars(data) {
    const vars = {};
    
    // Flatten nested objects
    function flatten(obj, prefix = '') {
      Object.keys(obj).forEach(key => {
        const value = obj[key];
        const varKey = prefix ? `${prefix}_${key}` : key;
        
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          flatten(value, varKey);
        } else {
          vars[varKey.toUpperCase()] = value;
        }
      });
    }
    
    flatten(data);
    return vars;
  }

  /**
   * Validate email list size
   * @static
   * @param {string[]} emails - Email list
   * @param {Object} [limits={}] - Limits
   * @param {number} [limits.maxTotal=1000] - Maximum total emails
   * @param {number} [limits.maxPerDomain=100] - Maximum per domain
   * @returns {Object} Validation result
   */
  static validateListSize(emails, limits = {}) {
    const { maxTotal = 1000, maxPerDomain = 100 } = limits;
    const domainCounts = {};
    let validCount = 0;

    emails.forEach(email => {
      if (this.isValid(email)) {
        validCount++;
        const parts = this.extractParts(email);
        if (parts) {
          domainCounts[parts.domain] = (domainCounts[parts.domain] || 0) + 1;
        }
      }
    });

    const oversizedDomains = Object.entries(domainCounts)
      .filter(([, count]) => count > maxPerDomain)
      .map(([domain]) => domain);

    return {
      valid: validCount <= maxTotal && oversizedDomains.length === 0,
      totalCount: validCount,
      exceedsTotal: validCount > maxTotal,
      oversizedDomains,
      domainCounts
    };
  }

  /**
   * Generate unsubscribe token
   * @static
   * @param {string} email - Email address
   * @param {string} listId - Mailing list ID
   * @param {string} [secret] - Secret key
   * @returns {string} Unsubscribe token
   */
  static generateUnsubscribeToken(email, listId, secret = '') {
    const normalized = this.normalize(email);
    const data = `${normalized}:${listId}:${secret}`;
    
    return crypto.createHash('sha256').update(data).digest('base64url');
  }

  /**
   * Format email for display
   * @static
   * @param {string} email - Email address
   * @param {string} [name] - Display name
   * @returns {string} Formatted email
   */
  static formatDisplay(email, name) {
    const normalized = this.normalize(email);
    
    if (name && name.trim()) {
      // Escape special characters in name
      const escapedName = name.replace(/"/g, '\\"');
      return `"${escapedName}" <${normalized}>`;
    }
    
    return normalized;
  }

  /**
   * Extract email from display format
   * @static
   * @param {string} displayEmail - Display formatted email
   * @returns {Object|null} Extracted parts or null
   */
  static extractFromDisplay(displayEmail) {
    // Match "Name" <email> or Name <email> or just email
    const match = displayEmail.match(/^(?:"?([^"]*)"?\s*)?<?([^>]+)>?$/);
    
    if (!match) return null;
    
    const [, name, email] = match;
    
    if (!this.isValid(email)) return null;
    
    return {
      name: name ? name.trim() : null,
      email: this.normalize(email)
    };
  }
}

module.exports = EmailHelper;