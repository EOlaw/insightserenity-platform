'use strict';

/**
 * @fileoverview Enterprise-grade string manipulation utility
 * @version 1.0.0
 * @author Enterprise Development Team
 * @since 2024-01-01
 */

const AppError = require('../app-error');
const Logger = require('../logger');

/**
 * Enterprise string manipulation utility class
 * Provides comprehensive string processing and validation functionality
 */
class StringHelper {
    /**
     * Capitalizes the first letter of a string
     * @param {string} str - String to capitalize
     * @returns {string} Capitalized string
     */
    static capitalize(str) {
        if (typeof str !== 'string') {
            throw new AppError('Input must be a string', 400, 'INVALID_INPUT');
        }

        return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    }

    /**
     * Converts string to title case
     * @param {string} str - String to convert
     * @returns {string} Title case string
     */
    static toTitleCase(str) {
        if (typeof str !== 'string') {
            throw new AppError('Input must be a string', 400, 'INVALID_INPUT');
        }

        return str.toLowerCase().split(' ').map(word =>
            word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
    }

    /**
     * Converts string to camelCase
     * @param {string} str - String to convert
     * @returns {string} CamelCase string
     */
    static toCamelCase(str) {
        if (typeof str !== 'string') {
            throw new AppError('Input must be a string', 400, 'INVALID_INPUT');
        }

        return str
            .toLowerCase()
            .replace(/[^a-zA-Z0-9]+(.)/g, (_, char) => char.toUpperCase());
    }

    /**
     * Converts string to PascalCase
     * @param {string} str - String to convert
     * @returns {string} PascalCase string
     */
    static toPascalCase(str) {
        if (typeof str !== 'string') {
            throw new AppError('Input must be a string', 400, 'INVALID_INPUT');
        }

        const camelCase = this.toCamelCase(str);
        return camelCase.charAt(0).toUpperCase() + camelCase.slice(1);
    }

    /**
     * Converts string to snake_case
     * @param {string} str - String to convert
     * @returns {string} Snake_case string
     */
    static toSnakeCase(str) {
        if (typeof str !== 'string') {
            throw new AppError('Input must be a string', 400, 'INVALID_INPUT');
        }

        return str
            .replace(/\W+/g, ' ')
            .split(/ |\B(?=[A-Z])/)
            .map(word => word.toLowerCase())
            .join('_');
    }

    /**
     * Converts string to kebab-case
     * @param {string} str - String to convert
     * @returns {string} Kebab-case string
     */
    static toKebabCase(str) {
        if (typeof str !== 'string') {
            throw new AppError('Input must be a string', 400, 'INVALID_INPUT');
        }

        return str
            .replace(/\W+/g, ' ')
            .split(/ |\B(?=[A-Z])/)
            .map(word => word.toLowerCase())
            .join('-');
    }

    /**
     * Truncates a string to specified length with ellipsis
     * @param {string} str - String to truncate
     * @param {number} length - Maximum length
     * @param {string} suffix - Suffix to append (default: '...')
     * @returns {string} Truncated string
     */
    static truncate(str, length, suffix = '...') {
        if (typeof str !== 'string') {
            throw new AppError('Input must be a string', 400, 'INVALID_INPUT');
        }

        if (typeof length !== 'number' || length < 0) {
            throw new AppError('Length must be a positive number', 400, 'INVALID_LENGTH');
        }

        if (str.length <= length) return str;
        return str.substring(0, length - suffix.length) + suffix;
    }

    /**
     * Removes HTML tags from a string
     * @param {string} str - String containing HTML
     * @returns {string} Plain text string
     */
    static stripHtml(str) {
        if (typeof str !== 'string') {
            throw new AppError('Input must be a string', 400, 'INVALID_INPUT');
        }

        return str.replace(/<[^>]*>/g, '');
    }

    /**
     * Escapes HTML special characters
     * @param {string} str - String to escape
     * @returns {string} HTML-escaped string
     */
    static escapeHtml(str) {
        if (typeof str !== 'string') {
            throw new AppError('Input must be a string', 400, 'INVALID_INPUT');
        }

        const htmlEscapes = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
            '/': '&#x2F;'
        };

        return str.replace(/[&<>"'\/]/g, char => htmlEscapes[char]);
    }

    /**
     * Unescapes HTML special characters
     * @param {string} str - HTML-escaped string
     * @returns {string} Unescaped string
     */
    static unescapeHtml(str) {
        if (typeof str !== 'string') {
            throw new AppError('Input must be a string', 400, 'INVALID_INPUT');
        }

        const htmlUnescapes = {
            '&amp;': '&',
            '&lt;': '<',
            '&gt;': '>',
            '&quot;': '"',
            '&#39;': "'",
            '&#x2F;': '/'
        };

        return str.replace(/&(?:amp|lt|gt|quot|#39|#x2F);/g, entity => htmlUnescapes[entity]);
    }

    /**
     * Pads a string to specified length
     * @param {string} str - String to pad
     * @param {number} length - Target length
     * @param {string} padString - String to pad with (default: ' ')
     * @param {string} direction - Padding direction ('left', 'right', 'both')
     * @returns {string} Padded string
     */
    static pad(str, length, padString = ' ', direction = 'right') {
        if (typeof str !== 'string') {
            throw new AppError('Input must be a string', 400, 'INVALID_INPUT');
        }

        if (typeof length !== 'number' || length < 0) {
            throw new AppError('Length must be a positive number', 400, 'INVALID_LENGTH');
        }

        if (str.length >= length) return str;

        const padLength = length - str.length;

        switch (direction) {
            case 'left':
                return padString.repeat(Math.ceil(padLength / padString.length))
                    .substring(0, padLength) + str;
            case 'right':
                return str + padString.repeat(Math.ceil(padLength / padString.length))
                    .substring(0, padLength);
            case 'both':
                const leftPad = Math.floor(padLength / 2);
                const rightPad = padLength - leftPad;
                return padString.repeat(Math.ceil(leftPad / padString.length))
                    .substring(0, leftPad) + str +
                    padString.repeat(Math.ceil(rightPad / padString.length))
                    .substring(0, rightPad);
            default:
                throw new AppError('Direction must be left, right, or both', 400, 'INVALID_DIRECTION');
        }
    }

    /**
     * Removes leading and trailing whitespace and normalizes internal whitespace
     * @param {string} str - String to clean
     * @returns {string} Cleaned string
     */
    static clean(str) {
        if (typeof str !== 'string') {
            throw new AppError('Input must be a string', 400, 'INVALID_INPUT');
        }

        return str.trim().replace(/\s+/g, ' ');
    }

    /**
     * Counts the number of words in a string
     * @param {string} str - String to count words in
     * @returns {number} Word count
     */
    static wordCount(str) {
        if (typeof str !== 'string') {
            throw new AppError('Input must be a string', 400, 'INVALID_INPUT');
        }

        return str.trim().split(/\s+/).filter(word => word.length > 0).length;
    }

    /**
     * Reverses a string
     * @param {string} str - String to reverse
     * @returns {string} Reversed string
     */
    static reverse(str) {
        if (typeof str !== 'string') {
            throw new AppError('Input must be a string', 400, 'INVALID_INPUT');
        }

        return str.split('').reverse().join('');
    }

    /**
     * Checks if a string is a palindrome
     * @param {string} str - String to check
     * @param {boolean} caseSensitive - Whether to consider case (default: false)
     * @returns {boolean} True if palindrome
     */
    static isPalindrome(str, caseSensitive = false) {
        if (typeof str !== 'string') {
            throw new AppError('Input must be a string', 400, 'INVALID_INPUT');
        }

        const cleanStr = caseSensitive ? str : str.toLowerCase();
        const normalizedStr = cleanStr.replace(/[^a-zA-Z0-9]/g, '');
        return normalizedStr === this.reverse(normalizedStr);
    }

    /**
     * Generates a random string with specified options
     * @param {number} length - Length of string to generate
     * @param {Object} options - Generation options
     * @param {boolean} options.uppercase - Include uppercase letters
     * @param {boolean} options.lowercase - Include lowercase letters
     * @param {boolean} options.numbers - Include numbers
     * @param {boolean} options.symbols - Include symbols
     * @param {string} options.customChars - Custom character set
     * @returns {string} Random string
     */
    static random(length = 10, options = {}) {
        const {
            uppercase = true,
            lowercase = true,
            numbers = true,
            symbols = false,
            customChars = ''
        } = options;

        if (typeof length !== 'number' || length <= 0) {
            throw new AppError('Length must be a positive number', 400, 'INVALID_LENGTH');
        }

        let charset = customChars;

        if (!customChars) {
            if (uppercase) charset += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
            if (lowercase) charset += 'abcdefghijklmnopqrstuvwxyz';
            if (numbers) charset += '0123456789';
            if (symbols) charset += '!@#$%^&*()_+-=[]{}|;:,.<>?';
        }

        if (!charset) {
            throw new AppError('At least one character type must be enabled', 400, 'INVALID_CHARSET');
        }

        let result = '';
        for (let i = 0; i < length; i++) {
            result += charset.charAt(Math.floor(Math.random() * charset.length));
        }

        return result;
    }

    /**
     * Extracts all URLs from a string
     * @param {string} str - String to extract URLs from
     * @returns {Array<string>} Array of URLs found
     */
    static extractUrls(str) {
        if (typeof str !== 'string') {
            throw new AppError('Input must be a string', 400, 'INVALID_INPUT');
        }

        const urlRegex = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/g;
        return str.match(urlRegex) || [];
    }

    /**
     * Extracts all email addresses from a string
     * @param {string} str - String to extract emails from
     * @returns {Array<string>} Array of email addresses found
     */
    static extractEmails(str) {
        if (typeof str !== 'string') {
            throw new AppError('Input must be a string', 400, 'INVALID_INPUT');
        }

        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
        return str.match(emailRegex) || [];
    }

    /**
     * Converts a string to a URL-friendly format
     * @param {string} str - String to slugify
     * @param {string} separator - Separator character (default: '-')
     * @returns {string} URL-friendly string
     */
    static slugify(str, separator = '-') {
        if (typeof str !== 'string') {
            throw new AppError('Input must be a string', 400, 'INVALID_INPUT');
        }

        return str
            .toLowerCase()
            .trim()
            .replace(/[^\w\s-]/g, '') // Remove special characters
            .replace(/[\s_-]+/g, separator) // Replace spaces, underscores, hyphens with separator
            .replace(new RegExp(`^${separator}+|${separator}+$`, 'g'), ''); // Remove leading/trailing separators
    }

    /**
     * Masks sensitive parts of a string
     * @param {string} str - String to mask
     * @param {number} visibleStart - Number of characters to show at start
     * @param {number} visibleEnd - Number of characters to show at end
     * @param {string} maskChar - Character to use for masking (default: '*')
     * @returns {string} Masked string
     */
    static mask(str, visibleStart = 2, visibleEnd = 2, maskChar = '*') {
        if (typeof str !== 'string') {
            throw new AppError('Input must be a string', 400, 'INVALID_INPUT');
        }

        if (str.length <= visibleStart + visibleEnd) {
            return maskChar.repeat(str.length);
        }

        const start = str.substring(0, visibleStart);
        const end = str.substring(str.length - visibleEnd);
        const maskLength = str.length - visibleStart - visibleEnd;

        return start + maskChar.repeat(maskLength) + end;
    }

    /**
     * Computes the Levenshtein distance between two strings
     * @param {string} str1 - First string
     * @param {string} str2 - Second string
     * @returns {number} Levenshtein distance
     */
    static levenshteinDistance(str1, str2) {
        if (typeof str1 !== 'string' || typeof str2 !== 'string') {
            throw new AppError('Both inputs must be strings', 400, 'INVALID_INPUT');
        }

        const matrix = [];

        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }

        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }

        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1, // substitution
                        matrix[i][j - 1] + 1,     // insertion
                        matrix[i - 1][j] + 1      // deletion
                    );
                }
            }
        }

        return matrix[str2.length][str1.length];
    }

    /**
     * Calculates similarity percentage between two strings
     * @param {string} str1 - First string
     * @param {string} str2 - Second string
     * @returns {number} Similarity percentage (0-100)
     */
    static similarity(str1, str2) {
        if (typeof str1 !== 'string' || typeof str2 !== 'string') {
            throw new AppError('Both inputs must be strings', 400, 'INVALID_INPUT');
        }

        if (str1 === str2) return 100;
        if (str1.length === 0 || str2.length === 0) return 0;

        const distance = this.levenshteinDistance(str1, str2);
        const maxLength = Math.max(str1.length, str2.length);

        return ((maxLength - distance) / maxLength) * 100;
    }
}

module.exports = StringHelper;
