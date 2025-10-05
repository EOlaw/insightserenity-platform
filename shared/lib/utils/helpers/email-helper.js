'use strict';

/**
 * @fileoverview Email validation and processing helper utility
 * @module shared/lib/utils/helpers/email-helper
 */

const crypto = require('crypto');
const dns = require('dns').promises;

/**
 * @class EmailHelper
 * @description Comprehensive email validation, formatting, and processing utility
 */
class EmailHelper {
  /**
   * Common free email providers
   * @static
   * @private
   */
  static FREE_PROVIDERS = [
    'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com',
    'icloud.com', 'mail.com', 'protonmail.com', 'yandex.com', 'zoho.com',
    'gmx.com', 'inbox.com', 'fastmail.com', 'hushmail.com', 'lycos.com'
  ];

  /**
   * Common disposable email domains
   * @static
   * @private
   */
  static DISPOSABLE_DOMAINS = [
    'tempmail.com', '10minutemail.com', 'guerrillamail.com', 'mailinator.com',
    'throwaway.email', 'yopmail.com', 'tempinbox.com', 'getnada.com',
    'fakeinbox.com', 'trashmail.com', 'maildrop.cc', 'dispostable.com',
    'temporary-mail.net', 'throwawaymail.com', 'sharklasers.com'
  ];

  /**
   * Common corporate email patterns
   * @static
   * @private
   */
  static CORPORATE_PATTERNS = [
    /^.+@.+\.(com|org|net|io|co|biz|info|tech)$/,
    /^.+@.+\..+\..+$/ // Multi-level domains
  ];

  /**
   * Validate email address
   * @static
   * @param {string} email - Email address
   * @param {Object} options - Validation options
   * @returns {boolean} Validation result
   */
  static isValid(email, options = {}) {
    const {
      allowDisplayName = false,
      requireDisplayName = false,
      allowUtf8LocalPart = false,
      requireTld = true,
      ignoreMaxLength = false,
      allowIpDomain = false,
      domainSpecificValidation = false,
      blacklistedChars = ''
    } = options;

    if (!email || typeof email !== 'string') {
      return false;
    }

    // Check for blacklisted characters
    if (blacklistedChars && new RegExp(`[${blacklistedChars}]`).test(email)) {
      return false;
    }

    // Parse display name if present
    let emailAddress = email;
    if (email.includes('<') && email.includes('>')) {
      const match = email.match(/<(.+)>/);
      if (!match) return false;

      if (requireDisplayName && email.indexOf('<') === 0) {
        return false;
      }

      emailAddress = match[1];
    } else if (requireDisplayName) {
      return false;
    } else if (!allowDisplayName && (email.includes('<') || email.includes('>'))) {
      return false;
    }

    // Check max length (RFC 5321)
    if (!ignoreMaxLength && emailAddress.length > 254) {
      return false;
    }

    // Split into local and domain parts
    const parts = emailAddress.split('@');
    if (parts.length !== 2) {
      return false;
    }

    const [localPart, domain] = parts;

    // Validate local part
    if (!this.validateLocalPart(localPart, { allowUtf8LocalPart })) {
      return false;
    }

    // Validate domain
    if (!this.validateDomain(domain, { requireTld, allowIpDomain })) {
      return false;
    }

    // Domain-specific validation
    if (domainSpecificValidation) {
      return this.validateDomainSpecific(emailAddress);
    }

    return true;
  }

  /**
   * Validate email local part
   * @static
   * @private
   * @param {string} localPart - Local part of email
   * @param {Object} options - Validation options
   * @returns {boolean} Validation result
   */
  static validateLocalPart(localPart, options = {}) {
    const { allowUtf8LocalPart = false } = options;

    // Check length (max 64 octets per RFC 5321)
    if (localPart.length === 0 || localPart.length > 64) {
      return false;
    }

    // Check for valid characters
    if (allowUtf8LocalPart) {
      // Allow UTF-8 characters
      if (!/^[\w.!#$%&'*+\-/=?^`{|}~\u0080-\uFFFF]+$/.test(localPart)) {
        return false;
      }
    } else {
      // ASCII only
      if (!/^[a-zA-Z0-9.!#$%&'*+\-/=?^_`{|}~]+$/.test(localPart)) {
        return false;
      }
    }

    // Check for consecutive dots or leading/trailing dots
    if (/\.{2,}/.test(localPart) || localPart[0] === '.' || localPart[localPart.length - 1] === '.') {
      return false;
    }

    return true;
  }

  /**
   * Validate email domain
   * @static
   * @private
   * @param {string} domain - Domain part of email
   * @param {Object} options - Validation options
   * @returns {boolean} Validation result
   */
  static validateDomain(domain, options = {}) {
    const { requireTld = true, allowIpDomain = false } = options;

    // Check length (max 253 octets)
    if (domain.length === 0 || domain.length > 253) {
      return false;
    }

    // Check for IP address domain
    if (domain[0] === '[' && domain[domain.length - 1] === ']') {
      if (!allowIpDomain) {
        return false;
      }
      const ip = domain.slice(1, -1);
      return this.isValidIp(ip);
    }

    // Check domain format
    const domainParts = domain.split('.');

    if (requireTld && domainParts.length < 2) {
      return false;
    }

    // Validate each domain part
    for (const part of domainParts) {
      if (part.length === 0 || part.length > 63) {
        return false;
      }

      // Must start and end with alphanumeric
      if (!/^[a-zA-Z0-9]/.test(part) || !/[a-zA-Z0-9]$/.test(part)) {
        return false;
      }

      // Can contain hyphens but not consecutive
      if (!/^[a-zA-Z0-9\-]+$/.test(part) || /--/.test(part)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Domain-specific validation
   * @static
   * @private
   * @param {string} email - Email address
   * @returns {boolean} Validation result
   */
  static validateDomainSpecific(email) {
    const [localPart, domain] = email.split('@');

    // Gmail-specific rules
    if (domain === 'gmail.com' || domain === 'googlemail.com') {
      // Gmail doesn't allow less than 6 characters
      if (localPart.replace(/\./g, '').length < 6) {
        return false;
      }
      // Gmail doesn't allow certain characters
      if (/[&=_'\-+,<>]/.test(localPart)) {
        return false;
      }
    }

    // Add more domain-specific rules as needed

    return true;
  }

  /**
   * Check if valid IP address
   * @static
   * @private
   * @param {string} ip - IP address
   * @returns {boolean} Validation result
   */
  static isValidIp(ip) {
    // IPv4
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (ipv4Regex.test(ip)) {
      const parts = ip.split('.');
      return parts.every(part => {
        const num = parseInt(part, 10);
        return num >= 0 && num <= 255;
      });
    }

    // IPv6 (simplified check)
    const ipv6Regex = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
    return ipv6Regex.test(ip);
  }

  /**
   * Normalize email address
   * @static
   * @param {string} email - Email address
   * @param {Object} options - Normalization options
   * @returns {string} Normalized email
   */
  static normalize(email, options = {}) {
    const {
      allLowercase = true,
      gmailRemoveDots = true,
      gmailRemoveSubaddress = true,
      gmailConvertGooglemaildotcom = true,
      outlookdotcomRemoveSubaddress = true,
      yahooRemoveSubaddress = true,
      icloudRemoveSubaddress = true
    } = options;

    if (!email || typeof email !== 'string') {
      return email;
    }

    // Extract email from display name format
    let emailAddress = email;
    if (email.includes('<') && email.includes('>')) {
      const match = email.match(/<(.+)>/);
      if (match) {
        emailAddress = match[1];
      }
    }

    let [localPart, domain] = emailAddress.split('@');

    if (!domain) {
      return email;
    }

    // Convert to lowercase
    if (allLowercase) {
      localPart = localPart.toLowerCase();
      domain = domain.toLowerCase();
    } else {
      domain = domain.toLowerCase(); // Domain is always case-insensitive
    }

    // Gmail-specific normalization
    if (domain === 'gmail.com' || domain === 'googlemail.com') {
      if (gmailRemoveDots) {
        localPart = localPart.replace(/\./g, '');
      }
      if (gmailRemoveSubaddress) {
        localPart = localPart.split('+')[0];
      }
      if (gmailConvertGooglemaildotcom && domain === 'googlemail.com') {
        domain = 'gmail.com';
      }
    }

    // Outlook.com normalization
    if (outlookdotcomRemoveSubaddress &&
        (domain === 'outlook.com' || domain === 'hotmail.com' || domain === 'live.com')) {
      localPart = localPart.split('+')[0];
    }

    // Yahoo normalization
    if (yahooRemoveSubaddress &&
        (domain === 'yahoo.com' || domain.startsWith('yahoo.'))) {
      localPart = localPart.split('-')[0];
    }

    // iCloud normalization
    if (icloudRemoveSubaddress &&
        (domain === 'icloud.com' || domain === 'me.com')) {
      localPart = localPart.split('+')[0];
    }

    return `${localPart}@${domain}`;
  }

  /**
   * Extract email parts
   * @static
   * @param {string} email - Email address
   * @returns {Object|null} Email parts
   */
  static extractParts(email) {
    if (!this.isValid(email, { allowDisplayName: true })) {
      return null;
    }

    // Extract email from display name format
    let emailAddress = email;
    let displayName = null;

    if (email.includes('<') && email.includes('>')) {
      const match = email.match(/^(.+?)\s*<(.+)>$/);
      if (match) {
        displayName = match[1].trim().replace(/^["']|["']$/g, '');
        emailAddress = match[2];
      }
    }

    const [localPart, domain] = emailAddress.split('@');
    const domainParts = domain.split('.');

    // Extract subaddress
    let username = localPart;
    let subaddress = null;

    if (localPart.includes('+')) {
      [username, subaddress] = localPart.split('+');
    } else if (domain.includes('yahoo') && localPart.includes('-')) {
      [username, subaddress] = localPart.split('-');
    }

    return {
      email: emailAddress,
      displayName,
      localPart,
      username,
      subaddress,
      domain,
      domainName: domainParts.slice(0, -1).join('.') || domainParts[0],
      tld: domainParts[domainParts.length - 1]
    };
  }

  /**
   * Check if free email provider
   * @static
   * @param {string} email - Email address
   * @returns {boolean} Is free provider
   */
  static isFreeProvider(email) {
    const parts = this.extractParts(email);
    if (!parts) return false;

    return this.FREE_PROVIDERS.includes(parts.domain.toLowerCase());
  }

  /**
   * Check if disposable email
   * @static
   * @param {string} email - Email address
   * @returns {boolean} Is disposable
   */
  static isDisposable(email) {
    const parts = this.extractParts(email);
    if (!parts) return false;

    const domain = parts.domain.toLowerCase();

    // Check exact match
    if (this.DISPOSABLE_DOMAINS.includes(domain)) {
      return true;
    }

    // Check patterns
    const disposablePatterns = [
      /temp/i,
      /throwaway/i,
      /disposable/i,
      /trash/i,
      /fake/i,
      /^[0-9]+mail/i
    ];

    return disposablePatterns.some(pattern => pattern.test(domain));
  }

  /**
   * Check if corporate email
   * @static
   * @param {string} email - Email address
   * @returns {boolean} Is corporate
   */
  static isCorporate(email) {
    if (this.isFreeProvider(email) || this.isDisposable(email)) {
      return false;
    }

    const parts = this.extractParts(email);
    if (!parts) return false;

    // Check if domain looks corporate
    const domain = parts.domain;

    // Has multiple subdomains (e.g., john@mail.company.com)
    if (domain.split('.').length > 2) {
      return true;
    }

    // Matches corporate patterns
    return this.CORPORATE_PATTERNS.some(pattern => pattern.test(email));
  }

  /**
   * Get Gravatar URL
   * @static
   * @param {string} email - Email address
   * @param {Object} options - Gravatar options
   * @returns {string} Gravatar URL
   */
  static getGravatarUrl(email, options = {}) {
    const {
      size = 200,
      default: defaultImage = 'mp', // mystery person
      rating = 'g',
      protocol = 'https'
    } = options;

    const normalizedEmail = this.normalize(email).toLowerCase().trim();
    const hash = crypto.createHash('md5').update(normalizedEmail).digest('hex');

    const params = new URLSearchParams({
      s: size.toString(),
      d: defaultImage,
      r: rating
    });

    return `${protocol}://www.gravatar.com/avatar/${hash}?${params}`;
  }

  /**
   * Mask email for privacy
   * @static
   * @param {string} email - Email address
   * @param {Object} options - Masking options
   * @returns {string} Masked email
   */
  static mask(email, options = {}) {
    const {
      showChars = 1,
      maskChar = '*',
      maskDomain = false
    } = options;

    const parts = this.extractParts(email);
    if (!parts) return email;

    const { localPart, domain } = parts;

    // Mask local part
    let maskedLocal;
    if (localPart.length <= showChars * 2) {
      maskedLocal = maskChar.repeat(localPart.length);
    } else {
      const start = localPart.substring(0, showChars);
      const end = localPart.substring(localPart.length - showChars);
      const middle = maskChar.repeat(Math.max(3, localPart.length - showChars * 2));
      maskedLocal = start + middle + end;
    }

    // Mask domain if requested
    let maskedDomain = domain;
    if (maskDomain) {
      const domainParts = domain.split('.');
      if (domainParts.length > 1) {
        domainParts[0] = maskChar.repeat(domainParts[0].length);
        maskedDomain = domainParts.join('.');
      }
    }

    return `${maskedLocal}@${maskedDomain}`;
  }

  /**
   * Generate email verification token
   * @static
   * @param {string} email - Email address
   * @param {string} secret - Secret key
   * @returns {string} Verification token
   */
  static generateVerificationToken(email, secret = process.env.EMAIL_SECRET || 'default-secret') {
    const timestamp = Date.now();
    const data = `${email}:${timestamp}`;
    const hash = crypto
      .createHmac('sha256', secret)
      .update(data)
      .digest('hex');

    const token = Buffer.from(`${data}:${hash}`).toString('base64url');
    return token;
  }

  /**
   * Verify email token
   * @static
   * @param {string} token - Verification token
   * @param {string} secret - Secret key
   * @param {number} maxAge - Max age in milliseconds
   * @returns {Object} Verification result
   */
  static verifyToken(token, secret = process.env.EMAIL_SECRET || 'default-secret', maxAge = 86400000) {
    try {
      const decoded = Buffer.from(token, 'base64url').toString('utf8');
      const [email, timestamp, hash] = decoded.split(':');

      if (!email || !timestamp || !hash) {
        return { valid: false, reason: 'Invalid token format' };
      }

      // Check timestamp
      const age = Date.now() - parseInt(timestamp, 10);
      if (age > maxAge) {
        return { valid: false, reason: 'Token expired' };
      }

      // Verify hash
      const expectedHash = crypto
        .createHmac('sha256', secret)
        .update(`${email}:${timestamp}`)
        .digest('hex');

      if (hash !== expectedHash) {
        return { valid: false, reason: 'Invalid token signature' };
      }

      return { valid: true, email };
    } catch (error) {
      return { valid: false, reason: 'Token verification failed' };
    }
  }

  /**
   * Generate unsubscribe token
   * @static
   * @param {string} email - Email address
   * @param {string} listId - Mailing list ID
   * @returns {string} Unsubscribe token
   */
  static generateUnsubscribeToken(email, listId = 'default') {
    const data = `${email}:${listId}`;
    const hash = crypto
      .createHash('sha256')
      .update(data)
      .digest('hex');

    return Buffer.from(`${data}:${hash}`).toString('base64url');
  }

  /**
   * Parse email with display name
   * @static
   * @param {string} emailString - Email string
   * @returns {Object} Parsed email
   */
  static parseWithDisplayName(emailString) {
    if (!emailString || typeof emailString !== 'string') {
      return { displayName: null, email: null };
    }

    // Pattern: "Display Name" <email@domain.com>
    const pattern1 = /^"([^"]+)"\s*<([^>]+)>$/;
    // Pattern: Display Name <email@domain.com>
    const pattern2 = /^([^<]+)\s*<([^>]+)>$/;
    // Pattern: email@domain.com
    const pattern3 = /^([^\s<>]+@[^\s<>]+)$/;

    let match = emailString.match(pattern1);
    if (match) {
      return {
        displayName: match[1].trim(),
        email: match[2].trim()
      };
    }

    match = emailString.match(pattern2);
    if (match) {
      return {
        displayName: match[1].trim(),
        email: match[2].trim()
      };
    }

    match = emailString.match(pattern3);
    if (match) {
      return {
        displayName: null,
        email: match[1].trim()
      };
    }

    return { displayName: null, email: null };
  }

  /**
   * Format email with display name
   * @static
   * @param {string} email - Email address
   * @param {string} displayName - Display name
   * @returns {string} Formatted email
   */
  static formatWithDisplayName(email, displayName) {
    if (!displayName) {
      return email;
    }

    // Quote display name if it contains special characters
    if (/[,;<>@()]/.test(displayName)) {
      return `"${displayName.replace(/"/g, '\\"')}" <${email}>`;
    }

    return `${displayName} <${email}>`;
  }

  /**
   * Validate email list
   * @static
   * @param {Array|string} emails - Email list
   * @returns {Object} Validation result
   */
  static validateList(emails) {
    const emailList = Array.isArray(emails)
      ? emails
      : emails.split(/[,;\s]+/).filter(Boolean);

    const valid = [];
    const invalid = [];

    for (const emailString of emailList) {
      const parsed = this.parseWithDisplayName(emailString.trim());

      if (parsed.email && this.isValid(parsed.email)) {
        valid.push({
          original: emailString.trim(),
          email: parsed.email,
          displayName: parsed.displayName
        });
      } else {
        invalid.push(emailString.trim());
      }
    }

    return {
      valid,
      invalid,
      allValid: invalid.length === 0,
      validCount: valid.length,
      invalidCount: invalid.length
    };
  }

  /**
   * Check MX records for domain
   * @static
   * @param {string} email - Email address
   * @returns {Promise<boolean>} Has MX records
   */
  static async hasMXRecords(email) {
    const parts = this.extractParts(email);
    if (!parts) return false;

    try {
      const mxRecords = await dns.resolveMx(parts.domain);
      return mxRecords && mxRecords.length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Suggest corrections for common typos
   * @static
   * @param {string} email - Email address
   * @returns {Array<string>} Suggested corrections
   */
  static suggestCorrections(email) {
    const suggestions = [];

    if (!email || !email.includes('@')) {
      return suggestions;
    }

    const [localPart, domain] = email.split('@');

    // Common domain typos
    const domainCorrections = {
      'gmial.com': 'gmail.com',
      'gmai.com': 'gmail.com',
      'gmail.co': 'gmail.com',
      'gmail.con': 'gmail.com',
      'gmaill.com': 'gmail.com',
      'yahooo.com': 'yahoo.com',
      'yaho.com': 'yahoo.com',
      'yahoo.co': 'yahoo.com',
      'hotmial.com': 'hotmail.com',
      'hotmai.com': 'hotmail.com',
      'hotmil.com': 'hotmail.com',
      'outlok.com': 'outlook.com',
      'outloo.com': 'outlook.com'
    };

    const lowerDomain = domain.toLowerCase();
    if (domainCorrections[lowerDomain]) {
      suggestions.push(`${localPart}@${domainCorrections[lowerDomain]}`);
    }

    // Check for missing TLD
    if (!domain.includes('.')) {
      const commonTLDs = ['com', 'net', 'org', 'edu'];
      for (const tld of commonTLDs) {
        if (this.FREE_PROVIDERS.includes(`${domain}.${tld}`)) {
          suggestions.push(`${localPart}@${domain}.${tld}`);
        }
      }
    }

    // Check for common missing dots in domain
    if (domain.includes('gmail') && domain !== 'gmail.com') {
      suggestions.push(`${localPart}@gmail.com`);
    }
    if (domain.includes('yahoo') && domain !== 'yahoo.com') {
      suggestions.push(`${localPart}@yahoo.com`);
    }
    if (domain.includes('hotmail') && domain !== 'hotmail.com') {
      suggestions.push(`${localPart}@hotmail.com`);
    }

    return [...new Set(suggestions)]; // Remove duplicates
  }

  /**
   * Generate email hash
   * @static
   * @param {string} email - Email address
   * @param {string} salt - Optional salt
   * @returns {string} Email hash
   */
  static generateHash(email, salt = '') {
    const normalizedEmail = this.normalize(email);
    return crypto
      .createHash('sha256')
      .update(normalizedEmail + salt)
      .digest('hex');
  }

  /**
   * Check if email matches pattern
   * @static
   * @param {string} email - Email address
   * @param {string|RegExp} pattern - Pattern to match
   * @returns {boolean} Match result
   */
  static matchesPattern(email, pattern) {
    if (!email) return false;

    if (typeof pattern === 'string') {
      // Convert wildcard pattern to regex
      const regexPattern = pattern
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*');
      pattern = new RegExp(`^${regexPattern}$`, 'i');
    }

    return pattern.test(email);
  }

  /**
   * Get email provider info
   * @static
   * @param {string} email - Email address
   * @returns {Object|null} Provider information
   */
  static getProviderInfo(email) {
    const parts = this.extractParts(email);
    if (!parts) return null;

    const domain = parts.domain.toLowerCase();

    const providers = {
      'gmail.com': { name: 'Gmail', type: 'free', country: 'US' },
      'googlemail.com': { name: 'Gmail', type: 'free', country: 'US' },
      'yahoo.com': { name: 'Yahoo Mail', type: 'free', country: 'US' },
      'hotmail.com': { name: 'Hotmail', type: 'free', country: 'US' },
      'outlook.com': { name: 'Outlook', type: 'free', country: 'US' },
      'aol.com': { name: 'AOL Mail', type: 'free', country: 'US' },
      'icloud.com': { name: 'iCloud Mail', type: 'free', country: 'US' },
      'me.com': { name: 'iCloud Mail', type: 'free', country: 'US' },
      'protonmail.com': { name: 'ProtonMail', type: 'free', country: 'CH' },
      'yandex.com': { name: 'Yandex Mail', type: 'free', country: 'RU' },
      'mail.com': { name: 'Mail.com', type: 'free', country: 'US' },
      'zoho.com': { name: 'Zoho Mail', type: 'free', country: 'IN' },
      'fastmail.com': { name: 'FastMail', type: 'paid', country: 'AU' }
    };

    return providers[domain] || {
      name: domain,
      type: this.isFreeProvider(email) ? 'free' : 'corporate',
      country: 'unknown'
    };
  }

  /**
   * Extract emails from text
   * @static
   * @param {string} text - Text to search
   * @returns {Array<string>} Found emails
   */
  static extractEmailsFromText(text) {
    if (!text) return [];

    // Comprehensive email regex
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    const matches = text.match(emailRegex) || [];

    // Validate and return unique emails
    return [...new Set(matches)].filter(email => this.isValid(email));
  }

  /**
   * Create mailto link
   * @static
   * @param {string} email - Email address
   * @param {Object} options - Mailto options
   * @returns {string} Mailto URL
   */
  static createMailtoLink(email, options = {}) {
    const {
      subject = '',
      body = '',
      cc = '',
      bcc = ''
    } = options;

    const params = new URLSearchParams();

    if (subject) params.append('subject', subject);
    if (body) params.append('body', body);
    if (cc) params.append('cc', Array.isArray(cc) ? cc.join(',') : cc);
    if (bcc) params.append('bcc', Array.isArray(bcc) ? bcc.join(',') : bcc);

    const queryString = params.toString();
    return `mailto:${email}${queryString ? '?' + queryString : ''}`;
  }

  /**
   * Check email reputation
   * @static
   * @param {string} email - Email address
   * @returns {Object} Reputation score
   */
  static checkReputation(email) {
    const score = {
      total: 100,
      factors: [],
      warnings: []
    };

    // Check if valid
    if (!this.isValid(email)) {
      score.total = 0;
      score.warnings.push('Invalid email format');
      return score;
    }

    // Check if disposable (-50 points)
    if (this.isDisposable(email)) {
      score.total -= 50;
      score.factors.push({ factor: 'Disposable email', impact: -50 });
      score.warnings.push('Disposable email detected');
    }

    // Check if free provider (-10 points)
    if (this.isFreeProvider(email)) {
      score.total -= 10;
      score.factors.push({ factor: 'Free email provider', impact: -10 });
    }

    // Check if corporate (+20 points)
    if (this.isCorporate(email)) {
      score.total += 20;
      score.factors.push({ factor: 'Corporate email', impact: +20 });
    }

    // Check local part complexity
    const parts = this.extractParts(email);
    if (parts) {
      // Numeric-only local part (-20 points)
      if (/^\d+$/.test(parts.localPart)) {
        score.total -= 20;
        score.factors.push({ factor: 'Numeric-only username', impact: -20 });
        score.warnings.push('Numeric-only username detected');
      }

      // Very short local part (-10 points)
      if (parts.localPart.length < 3) {
        score.total -= 10;
        score.factors.push({ factor: 'Very short username', impact: -10 });
      }

      // Contains subaddress (+5 points)
      if (parts.subaddress) {
        score.total += 5;
        score.factors.push({ factor: 'Uses subaddressing', impact: +5 });
      }
    }

    // Ensure score is between 0 and 100
    score.total = Math.max(0, Math.min(100, score.total));

    return score;
  }
}

module.exports = EmailHelper;
