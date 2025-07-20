'use strict';

/**
 * @fileoverview URL slug generation and validation utilities
 * @module shared/lib/utils/helpers/slug-helper
 */

const crypto = require('crypto');

/**
 * @class SlugHelper
 * @description Comprehensive slug generation and management utilities
 */
class SlugHelper {
  /**
   * Default slug options
   * @static
   * @private
   */
  static #DEFAULT_OPTIONS = {
    lowercase: true,
    separator: '-',
    maxLength: 100,
    truncate: true,
    strict: false,
    locale: 'en'
  };

  /**
   * Character replacement map
   * @static
   * @private
   */
  static #CHAR_MAP = {
    // Latin characters
    'à': 'a', 'á': 'a', 'ä': 'a', 'â': 'a', 'ã': 'a', 'å': 'a', 'æ': 'ae',
    'ç': 'c', 'č': 'c', 'ć': 'c',
    'è': 'e', 'é': 'e', 'ë': 'e', 'ê': 'e', 'ě': 'e', 'ę': 'e',
    'ì': 'i', 'í': 'i', 'ï': 'i', 'î': 'i',
    'ñ': 'n', 'ň': 'n', 'ń': 'n',
    'ò': 'o', 'ó': 'o', 'ö': 'o', 'ô': 'o', 'õ': 'o', 'ø': 'o', 'œ': 'oe',
    'š': 's', 'ś': 's', 'ș': 's',
    'ť': 't', 'ț': 't',
    'ù': 'u', 'ú': 'u', 'ü': 'u', 'û': 'u', 'ů': 'u',
    'ý': 'y', 'ÿ': 'y',
    'ž': 'z', 'ź': 'z', 'ż': 'z',
    'ð': 'd', 'þ': 'th', 'ß': 'ss',
    // Greek characters
    'α': 'a', 'β': 'b', 'γ': 'g', 'δ': 'd', 'ε': 'e', 'ζ': 'z',
    'η': 'i', 'θ': 'th', 'ι': 'i', 'κ': 'k', 'λ': 'l', 'μ': 'm',
    'ν': 'n', 'ξ': 'x', 'ο': 'o', 'π': 'p', 'ρ': 'r', 'σ': 's',
    'τ': 't', 'υ': 'y', 'φ': 'f', 'χ': 'ch', 'ψ': 'ps', 'ω': 'o',
    // Currency symbols
    '€': 'euro', '£': 'pound', '$': 'dollar', '¥': 'yen',
    '₹': 'rupee', '₽': 'ruble', '₺': 'lira', '₩': 'won',
    // Special characters
    '&': 'and', '@': 'at', '#': 'hash', '%': 'percent',
    '+': 'plus', '=': 'equals', '©': 'c', '®': 'r', '™': 'tm'
  };

  /**
   * Reserved slugs that should not be used
   * @static
   * @private
   */
  static #RESERVED_SLUGS = [
    'api', 'admin', 'app', 'assets', 'auth', 'blog', 'cdn', 'config',
    'dashboard', 'docs', 'download', 'edit', 'email', 'faq', 'feed',
    'help', 'home', 'img', 'js', 'login', 'logout', 'media', 'new',
    'news', 'page', 'pages', 'post', 'posts', 'profile', 'public',
    'register', 'search', 'settings', 'signin', 'signout', 'signup',
    'static', 'support', 'tag', 'tags', 'test', 'user', 'users',
    'www', 'xml', 'json', 'rss', 'atom'
  ];

  /**
   * Generate slug from string
   * @static
   * @param {string} str - String to slugify
   * @param {Object} [options={}] - Slug options
   * @returns {string} Generated slug
   */
  static generate(str, options = {}) {
    const opts = { ...this.#DEFAULT_OPTIONS, ...options };
    
    if (!str || typeof str !== 'string') return '';

    let slug = str.trim();

    // Replace special characters
    Object.entries(this.#CHAR_MAP).forEach(([char, replacement]) => {
      const regex = new RegExp(char, 'g');
      slug = slug.replace(regex, replacement);
    });

    // Convert to lowercase if required
    if (opts.lowercase) {
      slug = slug.toLowerCase();
    }

    // Remove or replace characters based on mode
    if (opts.strict) {
      // Strict mode: only alphanumeric and separator
      slug = slug.replace(/[^a-z0-9]+/gi, opts.separator);
    } else {
      // Normal mode: replace spaces and special chars
      slug = slug
        .replace(/[^\w\s-]/g, '') // Remove non-word chars except spaces and hyphens
        .replace(/[\s_]+/g, opts.separator); // Replace spaces and underscores
    }

    // Remove multiple separators
    const sepRegex = new RegExp(`${opts.separator}{2,}`, 'g');
    slug = slug.replace(sepRegex, opts.separator);

    // Remove leading/trailing separators
    const trimRegex = new RegExp(`^${opts.separator}+|${opts.separator}+$`, 'g');
    slug = slug.replace(trimRegex, '');

    // Truncate if needed
    if (opts.truncate && opts.maxLength && slug.length > opts.maxLength) {
      slug = this.truncate(slug, opts.maxLength, opts.separator);
    }

    return slug;
  }

  /**
   * Truncate slug intelligently
   * @static
   * @param {string} slug - Slug to truncate
   * @param {number} maxLength - Maximum length
   * @param {string} [separator='-'] - Word separator
   * @returns {string} Truncated slug
   */
  static truncate(slug, maxLength, separator = '-') {
    if (slug.length <= maxLength) return slug;

    // Try to truncate at word boundary
    const truncated = slug.substring(0, maxLength);
    const lastSeparator = truncated.lastIndexOf(separator);

    if (lastSeparator > maxLength * 0.7) {
      // If separator is reasonably far (70% of max length), truncate there
      return truncated.substring(0, lastSeparator);
    }

    // Otherwise truncate at maxLength
    return truncated.replace(new RegExp(`${separator}+$`), '');
  }

  /**
   * Validate slug format
   * @static
   * @param {string} slug - Slug to validate
   * @param {Object} [options={}] - Validation options
   * @returns {boolean} True if valid
   */
  static isValid(slug, options = {}) {
    const {
      minLength = 1,
      maxLength = 100,
      pattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      checkReserved = true
    } = options;

    if (!slug || typeof slug !== 'string') return false;
    if (slug.length < minLength || slug.length > maxLength) return false;
    if (!pattern.test(slug)) return false;
    if (checkReserved && this.isReserved(slug)) return false;

    return true;
  }

  /**
   * Check if slug is reserved
   * @static
   * @param {string} slug - Slug to check
   * @returns {boolean} True if reserved
   */
  static isReserved(slug) {
    return this.#RESERVED_SLUGS.includes(slug.toLowerCase());
  }

  /**
   * Generate unique slug
   * @static
   * @async
   * @param {string} str - String to slugify
   * @param {Function} checkExists - Function to check if slug exists
   * @param {Object} [options={}] - Options
   * @returns {Promise<string>} Unique slug
   */
  static async generateUnique(str, checkExists, options = {}) {
    const {
      maxAttempts = 10,
      appendRandom = false,
      randomLength = 4,
      ...slugOptions
    } = options;

    let baseSlug = this.generate(str, slugOptions);
    let slug = baseSlug;
    let counter = 1;

    // Check if base slug is available
    if (!await checkExists(slug)) {
      return slug;
    }

    // Try numbered suffixes
    while (counter <= maxAttempts) {
      slug = `${baseSlug}-${counter}`;
      if (!await checkExists(slug)) {
        return slug;
      }
      counter++;
    }

    // If still not unique, append random string
    if (appendRandom) {
      const random = crypto.randomBytes(randomLength).toString('hex').substring(0, randomLength);
      slug = `${baseSlug}-${random}`;
      
      // Final check
      if (!await checkExists(slug)) {
        return slug;
      }
    }

    // Last resort: timestamp
    slug = `${baseSlug}-${Date.now()}`;
    return slug;
  }

  /**
   * Extract slug from URL
   * @static
   * @param {string} url - URL to extract from
   * @param {Object} [options={}] - Options
   * @returns {string|null} Extracted slug or null
   */
  static extractFromUrl(url, options = {}) {
    const { position = 'last', pattern } = options;

    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);

      if (pathParts.length === 0) return null;

      let slug;
      if (position === 'last') {
        slug = pathParts[pathParts.length - 1];
      } else if (position === 'first') {
        slug = pathParts[0];
      } else if (typeof position === 'number') {
        slug = pathParts[position];
      }

      // Remove file extension if present
      if (slug && slug.includes('.')) {
        slug = slug.substring(0, slug.lastIndexOf('.'));
      }

      // Validate against pattern if provided
      if (pattern && !pattern.test(slug)) {
        return null;
      }

      return slug;
    } catch {
      return null;
    }
  }

  /**
   * Create slug validation middleware
   * @static
   * @param {Object} [options={}] - Validation options
   * @returns {Function} Express middleware
   */
  static validationMiddleware(options = {}) {
    const {
      paramName = 'slug',
      errorMessage = 'Invalid slug format',
      ...validationOptions
    } = options;

    return (req, res, next) => {
      const slug = req.params[paramName] || req.query[paramName] || req.body[paramName];

      if (!slug) {
        return res.status(400).json({
          error: 'Slug is required',
          field: paramName
        });
      }

      if (!this.isValid(slug, validationOptions)) {
        return res.status(400).json({
          error: errorMessage,
          field: paramName,
          value: slug
        });
      }

      // Attach normalized slug
      req.slug = slug.toLowerCase();
      next();
    };
  }

  /**
   * Generate slug for different content types
   * @static
   * @param {string} type - Content type
   * @param {Object} data - Content data
   * @param {Object} [options={}] - Options
   * @returns {string} Generated slug
   */
  static generateForType(type, data, options = {}) {
    const generators = {
      article: () => this.generate(data.title || data.headline, options),
      product: () => {
        const parts = [data.brand, data.name, data.model].filter(Boolean);
        return this.generate(parts.join(' '), options);
      },
      category: () => this.generate(data.name || data.title, { ...options, strict: true }),
      user: () => {
        const username = data.username || `${data.firstName} ${data.lastName}`;
        return this.generate(username, { ...options, maxLength: 30 });
      },
      organization: () => this.generate(data.name, { ...options, strict: true }),
      event: () => {
        const parts = [data.name, data.year || new Date().getFullYear()];
        return this.generate(parts.join(' '), options);
      }
    };

    const generator = generators[type] || (() => this.generate(data.name || data.title, options));
    return generator();
  }

  /**
   * Suggest alternative slugs
   * @static
   * @param {string} str - Original string
   * @param {Object} [options={}] - Options
   * @returns {string[]} Array of suggested slugs
   */
  static suggest(str, options = {}) {
    const {
      count = 5,
      includeYear = true,
      includeRandom = true,
      includeTruncated = true,
      baseOptions = {}
    } = options;

    const suggestions = [];
    const baseSlug = this.generate(str, baseOptions);

    // Add base slug
    suggestions.push(baseSlug);

    // Add numbered versions
    for (let i = 2; i <= Math.min(count, 3); i++) {
      suggestions.push(`${baseSlug}-${i}`);
    }

    // Add year variant
    if (includeYear) {
      const year = new Date().getFullYear();
      suggestions.push(`${baseSlug}-${year}`);
    }

    // Add truncated variant
    if (includeTruncated && baseSlug.length > 30) {
      const truncated = this.truncate(baseSlug, 30);
      suggestions.push(truncated);
    }

    // Add random variant
    if (includeRandom) {
      const random = crypto.randomBytes(2).toString('hex');
      suggestions.push(`${baseSlug}-${random}`);
    }

    // Remove duplicates and limit count
    return [...new Set(suggestions)].slice(0, count);
  }

  /**
   * Compare slugs for similarity
   * @static
   * @param {string} slug1 - First slug
   * @param {string} slug2 - Second slug
   * @returns {number} Similarity score (0-1)
   */
  static similarity(slug1, slug2) {
    if (!slug1 || !slug2) return 0;
    if (slug1 === slug2) return 1;

    const s1 = slug1.toLowerCase();
    const s2 = slug2.toLowerCase();

    // Levenshtein distance
    const matrix = [];
    for (let i = 0; i <= s2.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= s1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= s2.length; i++) {
      for (let j = 1; j <= s1.length; j++) {
        if (s2.charAt(i - 1) === s1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    const distance = matrix[s2.length][s1.length];
    const maxLength = Math.max(s1.length, s2.length);
    
    return 1 - (distance / maxLength);
  }

  /**
   * Parse slug to extract information
   * @static
   * @param {string} slug - Slug to parse
   * @param {Object} [options={}] - Options
   * @returns {Object} Parsed information
   */
  static parse(slug, options = {}) {
    const { separator = '-' } = options;
    
    if (!slug || typeof slug !== 'string') {
      return { original: slug, parts: [], words: [] };
    }

    const parts = slug.split(separator);
    const words = parts.map(part => 
      part.charAt(0).toUpperCase() + part.slice(1)
    );

    // Try to detect common patterns
    const patterns = {
      hasYear: /\d{4}$/.test(slug),
      hasNumber: /\d+$/.test(slug),
      hasId: /[a-f0-9]{8,}$/i.test(slug)
    };

    return {
      original: slug,
      parts,
      words,
      title: words.join(' '),
      patterns,
      length: slug.length,
      wordCount: parts.length
    };
  }
}

module.exports = SlugHelper;