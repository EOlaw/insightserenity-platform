'use strict';

/**
 * @fileoverview Comprehensive sanitization helper utilities for enterprise applications
 * @module shared/lib/utils/helpers/sanitization-helper
 */

const validator = require('validator');
const xss = require('xss');

/**
 * Sanitization helper class providing comprehensive input sanitization utilities
 * @class SanitizationHelper
 * @description Enterprise-grade sanitization utilities for data security and integrity
 */
class SanitizationHelper {
    /**
     * Sanitize an object recursively with comprehensive options
     * @static
     * @param {Object} obj - Object to sanitize
     * @param {Object} options - Sanitization options
     * @returns {Object} Sanitized object
     */
    static sanitizeObject(obj, options = {}) {
        const defaultOptions = {
            allowHtml: false,
            trimStrings: true,
            removeEmpty: false,
            maxDepth: 10,
            allowedTags: [],
            stripScripts: true,
            normalizeWhitespace: true,
            removeNullBytes: true,
            maxStringLength: 10000,
            preserveArrays: true,
            removeUndefined: true
        };

        const opts = { ...defaultOptions, ...options };
        return this.#sanitizeObjectRecursive(obj, opts, 0);
    }

    /**
     * Sanitize HTML content with XSS prevention
     * @static
     * @param {string} html - HTML content to sanitize
     * @param {Object} options - Sanitization options
     * @returns {string} Sanitized HTML
     */
    static sanitizeHTML(html, options = {}) {
        if (!html || typeof html !== 'string') {
            return '';
        }

        const defaultOptions = {
            whiteList: {
                p: [],
                br: [],
                strong: [],
                em: [],
                u: [],
                b: [],
                i: [],
                span: ['class'],
                div: ['class'],
                h1: [], h2: [], h3: [], h4: [], h5: [], h6: [],
                ul: [], ol: [], li: [],
                a: ['href', 'title', 'target'],
                img: ['src', 'alt', 'title', 'width', 'height']
            },
            stripIgnoreTag: true,
            stripIgnoreTagBody: ['script', 'style'],
            allowCommentTag: false,
            stripBlankChar: true
        };

        const opts = { ...defaultOptions, ...options };

        try {
            return xss(html, opts);
        } catch (error) {
            return this.sanitizeString(html, { allowHtml: false });
        }
    }

    /**
     * Sanitize string input with various cleaning options
     * @static
     * @param {string} str - String to sanitize
     * @param {Object} options - Sanitization options
     * @returns {string} Sanitized string
     */
    static sanitizeString(str, options = {}) {
        if (str === null || str === undefined) {
            return '';
        }

        if (typeof str !== 'string') {
            str = String(str);
        }

        const defaultOptions = {
            trim: true,
            allowHtml: false,
            normalizeWhitespace: true,
            removeNullBytes: true,
            removeControlChars: true,
            maxLength: 10000,
            escapeQuotes: false,
            removeSqlKeywords: false,
            removeScripts: true
        };

        const opts = { ...defaultOptions, ...options };
        let sanitized = str;

        // Remove null bytes
        if (opts.removeNullBytes) {
            sanitized = sanitized.replace(/\0/g, '');
        }

        // Remove control characters
        if (opts.removeControlChars) {
            sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');
        }

        // Trim whitespace
        if (opts.trim) {
            sanitized = sanitized.trim();
        }

        // Normalize whitespace
        if (opts.normalizeWhitespace) {
            sanitized = sanitized.replace(/\s+/g, ' ');
        }

        // Remove or escape HTML
        if (!opts.allowHtml) {
            if (opts.removeScripts) {
                sanitized = this.#removeScripts(sanitized);
            }
            sanitized = this.#escapeHtml(sanitized);
        } else {
            sanitized = this.sanitizeHTML(sanitized);
        }

        // Escape quotes
        if (opts.escapeQuotes) {
            sanitized = sanitized.replace(/'/g, "&#39;").replace(/"/g, "&quot;");
        }

        // Remove SQL keywords (basic protection)
        if (opts.removeSqlKeywords) {
            sanitized = this.#removeSqlKeywords(sanitized);
        }

        // Truncate to max length
        if (opts.maxLength && sanitized.length > opts.maxLength) {
            sanitized = sanitized.substring(0, opts.maxLength);
        }

        return sanitized;
    }

    /**
     * Sanitize email address
     * @static
     * @param {string} email - Email to sanitize
     * @param {Object} options - Sanitization options
     * @returns {string} Sanitized email
     */
    static sanitizeEmail(email, options = {}) {
        if (!email || typeof email !== 'string') {
            return '';
        }

        const defaultOptions = {
            toLowerCase: true,
            removeComments: true,
            removeTags: true
        };

        const opts = { ...defaultOptions, ...options };
        let sanitized = email.trim();

        // Convert to lowercase
        if (opts.toLowerCase) {
            sanitized = sanitized.toLowerCase();
        }

        // Remove comments and tags
        if (opts.removeComments) {
            sanitized = sanitized.replace(/\([^)]*\)/g, '');
        }

        if (opts.removeTags) {
            sanitized = sanitized.replace(/<[^>]*>/g, '');
        }

        // Normalize email using validator
        try {
            sanitized = validator.normalizeEmail(sanitized, {
                gmail_lowercase: true,
                gmail_remove_dots: false,
                gmail_remove_subaddress: false,
                gmail_convert_googlemaildotcom: true,
                outlookdotcom_lowercase: true,
                outlookdotcom_remove_subaddress: false,
                yahoo_lowercase: true,
                yahoo_remove_subaddress: false,
                icloud_lowercase: true,
                icloud_remove_subaddress: false
            });
        } catch (error) {
            // If normalization fails, return basic sanitized version
        }

        return sanitized || '';
    }

    /**
     * Sanitize phone number
     * @static
     * @param {string} phone - Phone number to sanitize
     * @param {Object} options - Sanitization options
     * @returns {string} Sanitized phone number
     */
    static sanitizePhone(phone, options = {}) {
        if (!phone || typeof phone !== 'string') {
            return '';
        }

        const defaultOptions = {
            removeFormatting: false,
            keepCountryCode: true,
            format: 'international'
        };

        const opts = { ...defaultOptions, ...options };
        let sanitized = phone.trim();

        // Remove non-digit characters except + for international format
        if (opts.removeFormatting) {
            sanitized = sanitized.replace(/[^\d+]/g, '');
        } else {
            // Keep basic formatting characters
            sanitized = sanitized.replace(/[^0-9+\-\(\)\s\.]/g, '');
        }

        // Remove multiple spaces and normalize
        sanitized = sanitized.replace(/\s+/g, ' ').trim();

        return sanitized;
    }

    /**
     * Sanitize URL
     * @static
     * @param {string} url - URL to sanitize
     * @param {Object} options - Sanitization options
     * @returns {string} Sanitized URL
     */
    static sanitizeURL(url, options = {}) {
        if (!url || typeof url !== 'string') {
            return '';
        }

        const defaultOptions = {
            allowedProtocols: ['http', 'https'],
            removeTrackingParams: true,
            normalizeCase: true,
            removeFragment: false,
            maxLength: 2048
        };

        const opts = { ...defaultOptions, ...options };
        let sanitized = url.trim();

        try {
            // Parse URL
            const urlObj = new URL(sanitized);

            // Check protocol
            const protocol = urlObj.protocol.slice(0, -1); // Remove trailing ':'
            if (opts.allowedProtocols && !opts.allowedProtocols.includes(protocol)) {
                return '';
            }

            // Normalize case
            if (opts.normalizeCase) {
                urlObj.protocol = urlObj.protocol.toLowerCase();
                urlObj.hostname = urlObj.hostname.toLowerCase();
            }

            // Remove tracking parameters
            if (opts.removeTrackingParams) {
                const trackingParams = [
                    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
                    'fbclid', 'gclid', 'msclkid', '_ga', 'mc_eid', 'mc_cid'
                ];

                trackingParams.forEach(param => {
                    urlObj.searchParams.delete(param);
                });
            }

            // Remove fragment if requested
            if (opts.removeFragment) {
                urlObj.hash = '';
            }

            sanitized = urlObj.toString();

            // Truncate if too long
            if (opts.maxLength && sanitized.length > opts.maxLength) {
                return '';
            }

        } catch (error) {
            return '';
        }

        return sanitized;
    }

    /**
     * Sanitize filename for safe storage
     * @static
     * @param {string} filename - Filename to sanitize
     * @param {Object} options - Sanitization options
     * @returns {string} Sanitized filename
     */
    static sanitizeFilename(filename, options = {}) {
        if (!filename || typeof filename !== 'string') {
            return 'untitled';
        }

        const defaultOptions = {
            maxLength: 255,
            allowUnicode: false,
            preserveExtension: true,
            replaceSpaces: true,
            replaceWith: '_'
        };

        const opts = { ...defaultOptions, ...options };
        let sanitized = filename.trim();

        // Extract extension if preserving
        let extension = '';
        if (opts.preserveExtension) {
            const lastDot = sanitized.lastIndexOf('.');
            if (lastDot > 0) {
                extension = sanitized.substring(lastDot);
                sanitized = sanitized.substring(0, lastDot);
            }
        }

        // Remove or replace dangerous characters
        if (opts.allowUnicode) {
            sanitized = sanitized.replace(/[<>:"/\\|?*\x00-\x1f]/g, opts.replaceWith);
        } else {
            sanitized = sanitized.replace(/[^a-zA-Z0-9.-_]/g, opts.replaceWith);
        }

        // Replace spaces
        if (opts.replaceSpaces) {
            sanitized = sanitized.replace(/\s+/g, opts.replaceWith);
        }

        // Remove multiple consecutive replacement characters
        const replaceRegex = new RegExp(`\\${opts.replaceWith}+`, 'g');
        sanitized = sanitized.replace(replaceRegex, opts.replaceWith);

        // Remove leading/trailing replacement characters
        const trimRegex = new RegExp(`^\\${opts.replaceWith}+|\\${opts.replaceWith}+$`, 'g');
        sanitized = sanitized.replace(trimRegex, '');

        // Combine with extension
        sanitized = sanitized + extension;

        // Truncate to max length
        if (sanitized.length > opts.maxLength) {
            if (extension && opts.preserveExtension) {
                const nameLength = opts.maxLength - extension.length;
                sanitized = sanitized.substring(0, nameLength) + extension;
            } else {
                sanitized = sanitized.substring(0, opts.maxLength);
            }
        }

        // Ensure we have a valid filename
        if (!sanitized || sanitized === extension) {
            sanitized = `untitled${extension}`;
        }

        return sanitized;
    }

    /**
     * Sanitize JSON data
     * @static
     * @param {string} jsonString - JSON string to sanitize
     * @param {Object} options - Sanitization options
     * @returns {string} Sanitized JSON string
     */
    static sanitizeJSON(jsonString, options = {}) {
        if (!jsonString || typeof jsonString !== 'string') {
            return '{}';
        }

        const defaultOptions = {
            maxDepth: 10,
            maxKeys: 1000,
            maxStringLength: 10000,
            removeFunctions: true,
            removeUndefined: true,
            allowedTypes: ['string', 'number', 'boolean', 'object', 'array']
        };

        const opts = { ...defaultOptions, ...options };

        try {
            const parsed = JSON.parse(jsonString);
            const sanitized = this.#sanitizeJSONObject(parsed, opts, 0, 0);
            return JSON.stringify(sanitized);
        } catch (error) {
            return '{}';
        }
    }

    /**
     * Sanitize database query parameters
     * @static
     * @param {Object} params - Query parameters to sanitize
     * @param {Object} options - Sanitization options
     * @returns {Object} Sanitized parameters
     */
    static sanitizeQueryParams(params, options = {}) {
        const defaultOptions = {
            allowedOperators: ['$eq', '$ne', '$in', '$nin', '$gt', '$gte', '$lt', '$lte'],
            maxDepth: 3,
            removeNoSQLInjection: true,
            sanitizeRegex: true
        };

        const opts = { ...defaultOptions, ...options };

        if (!params || typeof params !== 'object') {
            return {};
        }

        return this.#sanitizeQueryParamsRecursive(params, opts, 0);
    }

    /**
     * Sanitize search query string
     * @static
     * @param {string} query - Search query to sanitize
     * @param {Object} options - Sanitization options
     * @returns {string} Sanitized search query
     */
    static sanitizeSearchQuery(query, options = {}) {
        if (!query || typeof query !== 'string') {
            return '';
        }

        const defaultOptions = {
            maxLength: 500,
            allowWildcards: true,
            allowBoolean: true,
            removeDangerousChars: true,
            normalizeWhitespace: true
        };

        const opts = { ...defaultOptions, ...options };
        let sanitized = query.trim();

        // Remove dangerous characters
        if (opts.removeDangerousChars) {
            sanitized = sanitized.replace(/[<>'";&|`]/g, '');
        }

        // Normalize whitespace
        if (opts.normalizeWhitespace) {
            sanitized = sanitized.replace(/\s+/g, ' ');
        }

        // Remove boolean operators if not allowed
        if (!opts.allowBoolean) {
            sanitized = sanitized.replace(/\b(AND|OR|NOT)\b/gi, '');
        }

        // Remove wildcards if not allowed
        if (!opts.allowWildcards) {
            sanitized = sanitized.replace(/[*?]/g, '');
        }

        // Truncate to max length
        if (sanitized.length > opts.maxLength) {
            sanitized = sanitized.substring(0, opts.maxLength);
        }

        return sanitized.trim();
    }

    /**
     * Remove sensitive data from object (for logging)
     * @static
     * @param {Object} obj - Object to sanitize
     * @param {Array} sensitiveFields - List of sensitive field names
     * @returns {Object} Object with sensitive data removed
     */
    static removeSensitiveData(obj, sensitiveFields = []) {
        const defaultSensitiveFields = [
            'password', 'passwd', 'pwd', 'secret', 'token', 'key', 'private',
            'auth', 'authorization', 'cookie', 'session', 'ssn', 'social',
            'credit', 'card', 'cvv', 'pin', 'account', 'bank', 'routing'
        ];

        const allSensitiveFields = [...defaultSensitiveFields, ...sensitiveFields];

        if (!obj || typeof obj !== 'object') {
            return obj;
        }

        const sanitized = Array.isArray(obj) ? [] : {};

        for (const [key, value] of Object.entries(obj)) {
            const keyLower = key.toLowerCase();
            const isSensitive = allSensitiveFields.some(field => keyLower.includes(field.toLowerCase()));

            if (isSensitive) {
                sanitized[key] = '[REDACTED]';
            } else if (value && typeof value === 'object') {
                sanitized[key] = this.removeSensitiveData(value, sensitiveFields);
            } else {
                sanitized[key] = value;
            }
        }

        return sanitized;
    }

    // ==================== PRIVATE METHODS ====================

    /**
     * Recursively sanitize object
     * @static
     * @private
     * @param {*} obj - Object to sanitize
     * @param {Object} options - Sanitization options
     * @param {number} depth - Current depth
     * @returns {*} Sanitized object
     */
    static #sanitizeObjectRecursive(obj, options, depth) {
        if (depth > options.maxDepth) {
            return null;
        }

        if (obj === null) {
            return options.removeEmpty ? undefined : null;
        }

        if (obj === undefined) {
            return options.removeUndefined ? undefined : null;
        }

        if (typeof obj === 'string') {
            const sanitized = this.sanitizeString(obj, {
                trim: options.trimStrings,
                allowHtml: options.allowHtml,
                normalizeWhitespace: options.normalizeWhitespace,
                removeNullBytes: options.removeNullBytes,
                maxLength: options.maxStringLength,
                removeScripts: options.stripScripts
            });

            if (options.removeEmpty && sanitized === '') {
                return undefined;
            }

            return sanitized;
        }

        if (typeof obj === 'number' || typeof obj === 'boolean') {
            return obj;
        }

        if (Array.isArray(obj)) {
            if (!options.preserveArrays) {
                return obj;
            }

            const sanitized = [];
            for (const item of obj) {
                const sanitizedItem = this.#sanitizeObjectRecursive(item, options, depth + 1);
                if (sanitizedItem !== undefined || !options.removeEmpty) {
                    sanitized.push(sanitizedItem);
                }
            }

            return options.removeEmpty && sanitized.length === 0 ? undefined : sanitized;
        }

        if (typeof obj === 'object') {
            const sanitized = {};
            for (const [key, value] of Object.entries(obj)) {
                const sanitizedKey = this.sanitizeString(key, {
                    trim: true,
                    allowHtml: false,
                    maxLength: 100
                });

                const sanitizedValue = this.#sanitizeObjectRecursive(value, options, depth + 1);

                if (sanitizedValue !== undefined || !options.removeUndefined) {
                    sanitized[sanitizedKey] = sanitizedValue;
                }
            }

            return sanitized;
        }

        return obj;
    }

    /**
     * Remove script tags and dangerous content
     * @static
     * @private
     * @param {string} str - String to clean
     * @returns {string} Cleaned string
     */
    static #removeScripts(str) {
        return str
            .replace(/<script[^>]*>.*?<\/script>/gi, '')
            .replace(/<iframe[^>]*>.*?<\/iframe>/gi, '')
            .replace(/<object[^>]*>.*?<\/object>/gi, '')
            .replace(/<embed[^>]*>/gi, '')
            .replace(/<applet[^>]*>.*?<\/applet>/gi, '')
            .replace(/javascript:/gi, '')
            .replace(/vbscript:/gi, '')
            .replace(/on\w+\s*=/gi, '');
    }

    /**
     * Escape HTML characters
     * @static
     * @private
     * @param {string} str - String to escape
     * @returns {string} Escaped string
     */
    static #escapeHtml(str) {
        const htmlEscapes = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        };

        return str.replace(/[&<>"']/g, char => htmlEscapes[char]);
    }

    /**
     * Remove basic SQL keywords (basic protection only)
     * @static
     * @private
     * @param {string} str - String to clean
     * @returns {string} Cleaned string
     */
    static #removeSqlKeywords(str) {
        const sqlKeywords = [
            'select', 'insert', 'update', 'delete', 'drop', 'create', 'alter',
            'union', 'exec', 'execute', 'declare', 'xp_', 'sp_'
        ];

        let cleaned = str;
        sqlKeywords.forEach(keyword => {
            const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
            cleaned = cleaned.replace(regex, '');
        });

        return cleaned;
    }

    /**
     * Sanitize JSON object recursively
     * @static
     * @private
     * @param {*} obj - Object to sanitize
     * @param {Object} options - Options
     * @param {number} depth - Current depth
     * @param {number} keyCount - Current key count
     * @returns {*} Sanitized object
     */
    static #sanitizeJSONObject(obj, options, depth, keyCount) {
        if (depth > options.maxDepth) {
            return null;
        }

        if (keyCount > options.maxKeys) {
            return null;
        }

        if (obj === null || obj === undefined) {
            return options.removeUndefined ? undefined : obj;
        }

        if (typeof obj === 'function') {
            return options.removeFunctions ? undefined : null;
        }

        if (typeof obj === 'string') {
            return obj.length > options.maxStringLength 
                ? obj.substring(0, options.maxStringLength)
                : obj;
        }

        if (typeof obj === 'number' || typeof obj === 'boolean') {
            return obj;
        }

        if (Array.isArray(obj)) {
            const sanitized = [];
            for (let i = 0; i < obj.length && keyCount < options.maxKeys; i++) {
                const item = this.#sanitizeJSONObject(obj[i], options, depth + 1, keyCount + i);
                if (item !== undefined || !options.removeUndefined) {
                    sanitized.push(item);
                }
            }
            return sanitized;
        }

        if (typeof obj === 'object') {
            const sanitized = {};
            let currentKeyCount = keyCount;

            for (const [key, value] of Object.entries(obj)) {
                if (currentKeyCount >= options.maxKeys) break;

                const sanitizedValue = this.#sanitizeJSONObject(value, options, depth + 1, currentKeyCount);
                if (sanitizedValue !== undefined || !options.removeUndefined) {
                    sanitized[key] = sanitizedValue;
                }
                currentKeyCount++;
            }
            return sanitized;
        }

        return obj;
    }

    /**
     * Sanitize query parameters recursively
     * @static
     * @private
     * @param {Object} params - Parameters to sanitize
     * @param {Object} options - Options
     * @param {number} depth - Current depth
     * @returns {Object} Sanitized parameters
     */
    static #sanitizeQueryParamsRecursive(params, options, depth) {
        if (depth > options.maxDepth) {
            return {};
        }

        const sanitized = {};

        for (const [key, value] of Object.entries(params)) {
            // Check for NoSQL injection patterns
            if (options.removeNoSQLInjection && key.startsWith('$')) {
                if (!options.allowedOperators.includes(key)) {
                    continue; // Skip dangerous operators
                }
            }

            if (typeof value === 'string') {
                sanitized[key] = this.sanitizeString(value, {
                    allowHtml: false,
                    removeSqlKeywords: true
                });
            } else if (typeof value === 'number' || typeof value === 'boolean') {
                sanitized[key] = value;
            } else if (Array.isArray(value)) {
                sanitized[key] = value.map(item => 
                    typeof item === 'string' 
                        ? this.sanitizeString(item, { allowHtml: false })
                        : item
                );
            } else if (value && typeof value === 'object') {
                sanitized[key] = this.#sanitizeQueryParamsRecursive(value, options, depth + 1);
            } else {
                sanitized[key] = value;
            }
        }

        return sanitized;
    }
}

module.exports = SanitizationHelper;