'use strict';

/**
 * @fileoverview Comprehensive text formatting utility with multiple transformation methods
 * @module shared/lib/utils/formatters/text-formatter
 * @requires module:shared/lib/utils/validators/common-validators
 * @requires module:shared/lib/utils/helpers/string-helper
 * @requires module:shared/lib/utils/constants/error-codes
 */

const CommonValidator = require('../validators/common-validators');
const StringHelper = require('../helpers/string-helper');
const { VALIDATION_ERRORS, FORMAT_ERRORS } = require('../constants/error-codes');

/**
 * @class TextFormatter
 * @description Provides comprehensive text formatting methods for various use cases
 */
class TextFormatter {
  /**
   * @private
   * @static
   * @readonly
   */
  static #CASE_TYPES = {
    LOWER: 'lower',
    UPPER: 'upper',
    TITLE: 'title',
    SENTENCE: 'sentence',
    CAMEL: 'camel',
    PASCAL: 'pascal',
    SNAKE: 'snake',
    KEBAB: 'kebab',
    CONSTANT: 'constant',
    DOT: 'dot',
    PATH: 'path',
    TRAIN: 'train'
  };

  static #TRUNCATE_POSITIONS = {
    END: 'end',
    START: 'start',
    MIDDLE: 'middle',
    WORD: 'word'
  };

  static #MASK_TYPES = {
    ALL: 'all',
    PARTIAL: 'partial',
    EMAIL: 'email',
    PHONE: 'phone',
    CREDIT_CARD: 'credit-card',
    SSN: 'ssn',
    CUSTOM: 'custom'
  };

  static #QUOTE_STYLES = {
    SINGLE: { open: "'", close: "'" },
    DOUBLE: { open: '"', close: '"' },
    ANGLE: { open: '«', close: '»' },
    GERMAN: { open: '„', close: '"' },
    JAPANESE: { open: '「', close: '」' },
    CORNER: { open: '「', close: '」' }
  };

  static #COMMON_ACRONYMS = new Set([
    'API', 'URL', 'ID', 'HTML', 'CSS', 'JS', 'JSON', 'XML', 'SQL', 
    'HTTP', 'HTTPS', 'REST', 'CRUD', 'UUID', 'PDF', 'CSV', 'PNG', 
    'JPG', 'GIF', 'SVG', 'DOM', 'CLI', 'GUI', 'IDE', 'SDK', 'CDN',
    'DNS', 'IP', 'TCP', 'UDP', 'SSH', 'SSL', 'TLS', 'JWT', 'OAuth',
    'USA', 'UK', 'EU', 'NASA', 'FBI', 'CIA', 'CEO', 'CTO', 'CFO'
  ]);

  static #TITLE_CASE_EXCEPTIONS = new Set([
    'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from',
    'in', 'into', 'nor', 'of', 'on', 'or', 'per', 'the', 'to',
    'with', 'via', 'vs', 'versus'
  ]);

  static #ELLIPSIS_CHARS = {
    STANDARD: '...',
    UNICODE: '…',
    SPACED: ' ... ',
    BRACKETED: '[...]',
    CUSTOM: null
  };

  /**
   * Formats text with specified options
   * @static
   * @param {string} text - Text to format
   * @param {Object} [options={}] - Formatting options
   * @param {string} [options.case] - Case transformation
   * @param {boolean} [options.trim=true] - Trim whitespace
   * @param {boolean} [options.removeExtraSpaces=false] - Remove extra spaces
   * @param {boolean} [options.escape=false] - Escape HTML
   * @returns {string|null} Formatted text or null if invalid
   */
  static format(text, options = {}) {
    if (!CommonValidator.isDefined(text)) return null;
    
    try {
      let result = String(text);
      
      const {
        case: caseType,
        trim = true,
        removeExtraSpaces = false,
        escape = false,
        ...otherOptions
      } = options;
      
      // Apply trimming
      if (trim) {
        result = result.trim();
      }
      
      // Remove extra spaces
      if (removeExtraSpaces) {
        result = this.normalizeSpaces(result);
      }
      
      // Apply case transformation
      if (caseType) {
        result = this.changeCase(result, caseType);
      }
      
      // Escape HTML if requested
      if (escape) {
        result = this.escapeHtml(result);
      }
      
      // Apply any additional formatting
      Object.entries(otherOptions).forEach(([key, value]) => {
        switch (key) {
          case 'truncate':
            if (typeof value === 'object') {
              result = this.truncate(result, value.length, value);
            }
            break;
          case 'wrap':
            if (typeof value === 'object') {
              result = this.wrap(result, value.width, value);
            }
            break;
          case 'quote':
            result = this.quote(result, value);
            break;
          case 'mask':
            if (typeof value === 'object') {
              result = this.mask(result, value.type, value);
            }
            break;
        }
      });
      
      return result;
    } catch (error) {
      console.error('TextFormatter.format error:', error);
      return null;
    }
  }

  /**
   * Changes text case
   * @static
   * @param {string} text - Text to transform
   * @param {string} caseType - Target case type
   * @returns {string|null} Transformed text or null if invalid
   */
  static changeCase(text, caseType) {
    if (!text || typeof text !== 'string') return null;
    
    try {
      switch (caseType) {
        case this.#CASE_TYPES.LOWER:
          return text.toLowerCase();
          
        case this.#CASE_TYPES.UPPER:
          return text.toUpperCase();
          
        case this.#CASE_TYPES.TITLE:
          return this.#toTitleCase(text);
          
        case this.#CASE_TYPES.SENTENCE:
          return this.#toSentenceCase(text);
          
        case this.#CASE_TYPES.CAMEL:
          return this.#toCamelCase(text);
          
        case this.#CASE_TYPES.PASCAL:
          return this.#toPascalCase(text);
          
        case this.#CASE_TYPES.SNAKE:
          return this.#toSnakeCase(text);
          
        case this.#CASE_TYPES.KEBAB:
          return this.#toKebabCase(text);
          
        case this.#CASE_TYPES.CONSTANT:
          return this.#toConstantCase(text);
          
        case this.#CASE_TYPES.DOT:
          return this.#toDotCase(text);
          
        case this.#CASE_TYPES.PATH:
          return this.#toPathCase(text);
          
        case this.#CASE_TYPES.TRAIN:
          return this.#toTrainCase(text);
          
        default:
          return text;
      }
    } catch (error) {
      console.error('TextFormatter.changeCase error:', error);
      return null;
    }
  }

  /**
   * Truncates text to specified length
   * @static
   * @param {string} text - Text to truncate
   * @param {number} maxLength - Maximum length
   * @param {Object} [options={}] - Truncation options
   * @param {string} [options.position='end'] - Where to truncate
   * @param {string} [options.ellipsis='...'] - Ellipsis string
   * @param {boolean} [options.preserveWords=false] - Preserve word boundaries
   * @returns {string|null} Truncated text or null if invalid
   */
  static truncate(text, maxLength, options = {}) {
    if (!text || typeof text !== 'string' || !maxLength) return text || null;
    
    try {
      if (text.length <= maxLength) return text;
      
      const {
        position = this.#TRUNCATE_POSITIONS.END,
        ellipsis = this.#ELLIPSIS_CHARS.STANDARD,
        preserveWords = false
      } = options;
      
      const ellipsisLength = ellipsis.length;
      const availableLength = maxLength - ellipsisLength;
      
      if (availableLength <= 0) return ellipsis;
      
      switch (position) {
        case this.#TRUNCATE_POSITIONS.START:
          return ellipsis + text.slice(-availableLength);
          
        case this.#TRUNCATE_POSITIONS.MIDDLE:
          const halfLength = Math.floor(availableLength / 2);
          const start = text.slice(0, halfLength);
          const end = text.slice(-(availableLength - halfLength));
          return start + ellipsis + end;
          
        case this.#TRUNCATE_POSITIONS.WORD:
        case this.#TRUNCATE_POSITIONS.END:
        default:
          if (preserveWords || position === this.#TRUNCATE_POSITIONS.WORD) {
            const truncated = text.slice(0, availableLength);
            const lastSpace = truncated.lastIndexOf(' ');
            
            if (lastSpace > 0) {
              return truncated.slice(0, lastSpace) + ellipsis;
            }
          }
          return text.slice(0, availableLength) + ellipsis;
      }
    } catch (error) {
      console.error('TextFormatter.truncate error:', error);
      return null;
    }
  }

  /**
   * Wraps text at specified width
   * @static
   * @param {string} text - Text to wrap
   * @param {number} width - Line width
   * @param {Object} [options={}] - Wrapping options
   * @param {boolean} [options.preserveWords=true] - Preserve word boundaries
   * @param {string} [options.indent=''] - Line indentation
   * @param {boolean} [options.preserveParagraphs=true] - Preserve paragraphs
   * @returns {string|null} Wrapped text or null if invalid
   */
  static wrap(text, width, options = {}) {
    if (!text || typeof text !== 'string' || !width) return text || null;
    
    try {
      const {
        preserveWords = true,
        indent = '',
        preserveParagraphs = true
      } = options;
      
      const effectiveWidth = width - indent.length;
      if (effectiveWidth <= 0) return text;
      
      // Split into paragraphs if needed
      const paragraphs = preserveParagraphs ? text.split(/\n\n+/) : [text];
      
      const wrappedParagraphs = paragraphs.map(paragraph => {
        const lines = [];
        const words = paragraph.split(/\s+/);
        let currentLine = '';
        
        words.forEach(word => {
          const testLine = currentLine ? `${currentLine} ${word}` : word;
          
          if (testLine.length <= effectiveWidth) {
            currentLine = testLine;
          } else {
            if (currentLine) {
              lines.push(indent + currentLine);
            }
            
            // Handle words longer than width
            if (word.length > effectiveWidth && !preserveWords) {
              let remaining = word;
              while (remaining.length > effectiveWidth) {
                lines.push(indent + remaining.slice(0, effectiveWidth));
                remaining = remaining.slice(effectiveWidth);
              }
              currentLine = remaining;
            } else {
              currentLine = word;
            }
          }
        });
        
        if (currentLine) {
          lines.push(indent + currentLine);
        }
        
        return lines.join('\n');
      });
      
      return wrappedParagraphs.join('\n\n');
    } catch (error) {
      console.error('TextFormatter.wrap error:', error);
      return null;
    }
  }

  /**
   * Adds quotes to text
   * @static
   * @param {string} text - Text to quote
   * @param {string|Object} [style='double'] - Quote style or custom quotes
   * @returns {string|null} Quoted text or null if invalid
   */
  static quote(text, style = 'double') {
    if (!CommonValidator.isDefined(text)) return null;
    
    try {
      const strText = String(text);
      let quotes;
      
      if (typeof style === 'object' && style.open && style.close) {
        quotes = style;
      } else if (typeof style === 'string') {
        quotes = this.#QUOTE_STYLES[style.toUpperCase()] || this.#QUOTE_STYLES.DOUBLE;
      } else {
        quotes = this.#QUOTE_STYLES.DOUBLE;
      }
      
      return `${quotes.open}${strText}${quotes.close}`;
    } catch (error) {
      console.error('TextFormatter.quote error:', error);
      return null;
    }
  }

  /**
   * Masks sensitive text
   * @static
   * @param {string} text - Text to mask
   * @param {string} [type='partial'] - Mask type
   * @param {Object} [options={}] - Masking options
   * @param {string} [options.maskChar='*'] - Character to use for masking
   * @param {number} [options.visibleStart=0] - Visible characters at start
   * @param {number} [options.visibleEnd=0] - Visible characters at end
   * @returns {string|null} Masked text or null if invalid
   */
  static mask(text, type = 'partial', options = {}) {
    if (!text || typeof text !== 'string') return null;
    
    try {
      const {
        maskChar = '*',
        visibleStart = 0,
        visibleEnd = 0,
        pattern
      } = options;
      
      switch (type) {
        case this.#MASK_TYPES.ALL:
          return maskChar.repeat(text.length);
          
        case this.#MASK_TYPES.EMAIL:
          return this.#maskEmail(text, maskChar);
          
        case this.#MASK_TYPES.PHONE:
          return this.#maskPhone(text, maskChar);
          
        case this.#MASK_TYPES.CREDIT_CARD:
          return this.#maskCreditCard(text, maskChar);
          
        case this.#MASK_TYPES.SSN:
          return this.#maskSSN(text, maskChar);
          
        case this.#MASK_TYPES.CUSTOM:
          if (pattern) {
            return this.#maskWithPattern(text, pattern, maskChar);
          }
          // Fall through to partial
          
        case this.#MASK_TYPES.PARTIAL:
        default:
          const totalVisible = visibleStart + visibleEnd;
          if (totalVisible >= text.length) return text;
          
          const start = text.slice(0, visibleStart);
          const end = text.slice(-visibleEnd || text.length);
          const middleLength = text.length - totalVisible;
          const middle = maskChar.repeat(middleLength);
          
          return start + middle + (visibleEnd > 0 ? end : '');
      }
    } catch (error) {
      console.error('TextFormatter.mask error:', error);
      return null;
    }
  }

  /**
   * Escapes HTML special characters
   * @static
   * @param {string} text - Text to escape
   * @returns {string|null} Escaped text or null if invalid
   */
  static escapeHtml(text) {
    if (!CommonValidator.isDefined(text)) return null;
    
    const htmlEscapes = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
      '/': '&#x2F;'
    };
    
    return String(text).replace(/[&<>"'\/]/g, char => htmlEscapes[char]);
  }

  /**
   * Unescapes HTML entities
   * @static
   * @param {string} text - Text to unescape
   * @returns {string|null} Unescaped text or null if invalid
   */
  static unescapeHtml(text) {
    if (!CommonValidator.isDefined(text)) return null;
    
    const htmlUnescapes = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&#39;': "'",
      '&#x2F;': '/'
    };
    
    return String(text).replace(/&(?:amp|lt|gt|quot|#39|#x2F);/g, entity => htmlUnescapes[entity]);
  }

  /**
   * Normalizes whitespace in text
   * @static
   * @param {string} text - Text to normalize
   * @param {Object} [options={}] - Normalization options
   * @returns {string|null} Normalized text or null if invalid
   */
  static normalizeSpaces(text, options = {}) {
    if (!CommonValidator.isDefined(text)) return null;
    
    try {
      const {
        preserveLineBreaks = false,
        preserveTabs = false,
        collapseWhitespace = true
      } = options;
      
      let result = String(text);
      
      if (collapseWhitespace) {
        if (preserveLineBreaks && preserveTabs) {
          // Collapse only spaces
          result = result.replace(/ +/g, ' ');
        } else if (preserveLineBreaks) {
          // Collapse spaces and tabs, preserve line breaks
          result = result.replace(/[^\S\n]+/g, ' ');
        } else if (preserveTabs) {
          // Collapse spaces and line breaks, preserve tabs
          result = result.replace(/[^\S\t]+/g, ' ');
        } else {
          // Collapse all whitespace
          result = result.replace(/\s+/g, ' ');
        }
      }
      
      return result.trim();
    } catch (error) {
      console.error('TextFormatter.normalizeSpaces error:', error);
      return null;
    }
  }

  /**
   * Formats text as a slug
   * @static
   * @param {string} text - Text to slugify
   * @param {Object} [options={}] - Slugification options
   * @returns {string|null} Slug or null if invalid
   */
  static toSlug(text, options = {}) {
    if (!CommonValidator.isDefined(text)) return null;
    
    try {
      const {
        separator = '-',
        lowercase = true,
        transliterate = true,
        maxLength
      } = options;
      
      let slug = String(text);
      
      // Basic transliteration (can be enhanced)
      if (transliterate) {
        const transliterations = {
          'ä': 'a', 'ö': 'o', 'ü': 'u', 'ß': 'ss',
          'à': 'a', 'á': 'a', 'â': 'a', 'ã': 'a',
          'è': 'e', 'é': 'e', 'ê': 'e', 'ë': 'e',
          'ì': 'i', 'í': 'i', 'î': 'i', 'ï': 'i',
          'ò': 'o', 'ó': 'o', 'ô': 'o', 'õ': 'o',
          'ù': 'u', 'ú': 'u', 'û': 'u',
          'ñ': 'n', 'ç': 'c'
        };
        
        Object.entries(transliterations).forEach(([char, replacement]) => {
          slug = slug.replace(new RegExp(char, 'gi'), replacement);
        });
      }
      
      // Remove non-alphanumeric characters
      slug = slug.replace(/[^a-zA-Z0-9\s-]/g, '');
      
      // Replace spaces with separator
      slug = slug.replace(/\s+/g, separator);
      
      // Remove consecutive separators
      slug = slug.replace(new RegExp(`${separator}+`, 'g'), separator);
      
      // Remove leading/trailing separators
      slug = slug.replace(new RegExp(`^${separator}|${separator}$`, 'g'), '');
      
      // Convert to lowercase if needed
      if (lowercase) {
        slug = slug.toLowerCase();
      }
      
      // Truncate if needed
      if (maxLength && slug.length > maxLength) {
        slug = slug.slice(0, maxLength);
        // Remove partial word at the end
        const lastSeparator = slug.lastIndexOf(separator);
        if (lastSeparator > maxLength * 0.7) {
          slug = slug.slice(0, lastSeparator);
        }
      }
      
      return slug;
    } catch (error) {
      console.error('TextFormatter.toSlug error:', error);
      return null;
    }
  }

  /**
   * Highlights text matches
   * @static
   * @param {string} text - Text to search in
   * @param {string|RegExp} search - Search term or pattern
   * @param {Object} [options={}] - Highlight options
   * @returns {string|null} Text with highlights or null if invalid
   */
  static highlight(text, search, options = {}) {
    if (!CommonValidator.isDefined(text) || !search) return text || null;
    
    try {
      const {
        tag = 'mark',
        className = 'highlight',
        caseSensitive = false
      } = options;
      
      const strText = String(text);
      let pattern;
      
      if (search instanceof RegExp) {
        pattern = search;
      } else {
        const flags = caseSensitive ? 'g' : 'gi';
        const escaped = String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        pattern = new RegExp(escaped, flags);
      }
      
      const classAttr = className ? ` class="${className}"` : '';
      return strText.replace(pattern, match => `<${tag}${classAttr}>${match}</${tag}>`);
    } catch (error) {
      console.error('TextFormatter.highlight error:', error);
      return null;
    }
  }

  /**
   * Extracts excerpt from text
   * @static
   * @param {string} text - Text to extract from
   * @param {Object} [options={}] - Extraction options
   * @returns {string|null} Excerpt or null if invalid
   */
  static excerpt(text, options = {}) {
    if (!CommonValidator.isDefined(text)) return null;
    
    try {
      const {
        length = 150,
        suffix = '...',
        stripHtml = true,
        preserveWords = true
      } = options;
      
      let excerpt = String(text);
      
      // Strip HTML if requested
      if (stripHtml) {
        excerpt = excerpt.replace(/<[^>]*>/g, '');
      }
      
      // Normalize whitespace
      excerpt = this.normalizeSpaces(excerpt);
      
      // Truncate
      if (excerpt.length > length) {
        excerpt = this.truncate(excerpt, length, {
          ellipsis: suffix,
          preserveWords
        });
      }
      
      return excerpt;
    } catch (error) {
      console.error('TextFormatter.excerpt error:', error);
      return null;
    }
  }

  /**
   * Formats list of items
   * @static
   * @param {Array} items - Items to format
   * @param {Object} [options={}] - Formatting options
   * @returns {string|null} Formatted list or null if invalid
   */
  static formatList(items, options = {}) {
    if (!Array.isArray(items) || items.length === 0) return null;
    
    try {
      const {
        type = 'comma',
        locale = 'en-US',
        oxford = true,
        conjunction = 'and'
      } = options;
      
      const stringItems = items.map(item => String(item));
      
      if (type === 'bullet') {
        const { bullet = '•', indent = '  ' } = options;
        return stringItems.map(item => `${bullet} ${item}`).join('\n');
      }
      
      if (type === 'numbered') {
        const { start = 1, suffix = '.' } = options;
        return stringItems.map((item, index) => `${start + index}${suffix} ${item}`).join('\n');
      }
      
      // Comma-separated list
      if (stringItems.length === 1) return stringItems[0];
      if (stringItems.length === 2) return `${stringItems[0]} ${conjunction} ${stringItems[1]}`;
      
      const allButLast = stringItems.slice(0, -1);
      const last = stringItems[stringItems.length - 1];
      const separator = oxford ? ', ' : ' ';
      
      return `${allButLast.join(', ')}${separator}${conjunction} ${last}`;
    } catch (error) {
      console.error('TextFormatter.formatList error:', error);
      return null;
    }
  }

  /**
   * Pluralizes text based on count
   * @static
   * @param {string} singular - Singular form
   * @param {number} count - Item count
   * @param {Object} [options={}] - Pluralization options
   * @returns {string|null} Pluralized text or null if invalid
   */
  static pluralize(singular, count, options = {}) {
    if (!singular || typeof singular !== 'string') return null;
    
    try {
      const {
        plural,
        includeCount = false,
        zero = plural || singular + 's'
      } = options;
      
      let result;
      
      if (count === 0) {
        result = zero;
      } else if (count === 1) {
        result = singular;
      } else {
        result = plural || this.#generatePlural(singular);
      }
      
      if (includeCount) {
        result = `${count} ${result}`;
      }
      
      return result;
    } catch (error) {
      console.error('TextFormatter.pluralize error:', error);
      return null;
    }
  }

  /**
   * Converts to title case
   * @private
   * @static
   * @param {string} text - Text to convert
   * @returns {string} Title cased text
   */
  static #toTitleCase(text) {
    return text.replace(/\w+/g, (word, index) => {
      const lowerWord = word.toLowerCase();
      
      // Always capitalize first and last words
      if (index === 0) {
        return this.#capitalizeWord(word);
      }
      
      // Check if it's an acronym
      if (this.#COMMON_ACRONYMS.has(word.toUpperCase())) {
        return word.toUpperCase();
      }
      
      // Check if it's an exception
      if (this.#TITLE_CASE_EXCEPTIONS.has(lowerWord)) {
        return lowerWord;
      }
      
      return this.#capitalizeWord(word);
    });
  }

  /**
   * Converts to sentence case
   * @private
   * @static
   * @param {string} text - Text to convert
   * @returns {string} Sentence cased text
   */
  static #toSentenceCase(text) {
    return text.replace(/([.!?]\s*)([a-z])/g, (match, separator, letter) => {
      return separator + letter.toUpperCase();
    }).replace(/^[a-z]/, letter => letter.toUpperCase());
  }

  /**
   * Converts to camel case
   * @private
   * @static
   * @param {string} text - Text to convert
   * @returns {string} Camel cased text
   */
  static #toCamelCase(text) {
    return text
      .replace(/[^a-zA-Z0-9]+(.)/g, (match, chr) => chr.toUpperCase())
      .replace(/^[A-Z]/, chr => chr.toLowerCase());
  }

  /**
   * Converts to pascal case
   * @private
   * @static
   * @param {string} text - Text to convert
   * @returns {string} Pascal cased text
   */
  static #toPascalCase(text) {
    const camel = this.#toCamelCase(text);
    return camel.charAt(0).toUpperCase() + camel.slice(1);
  }

  /**
   * Converts to snake case
   * @private
   * @static
   * @param {string} text - Text to convert
   * @returns {string} Snake cased text
   */
  static #toSnakeCase(text) {
    return text
      .replace(/([A-Z])/g, '_$1')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_/, '')
      .replace(/_+/g, '_')
      .toLowerCase()
      .replace(/_$/, '');
  }

  /**
   * Converts to kebab case
   * @private
   * @static
   * @param {string} text - Text to convert
   * @returns {string} Kebab cased text
   */
  static #toKebabCase(text) {
    return this.#toSnakeCase(text).replace(/_/g, '-');
  }

  /**
   * Converts to constant case
   * @private
   * @static
   * @param {string} text - Text to convert
   * @returns {string} Constant cased text
   */
  static #toConstantCase(text) {
    return this.#toSnakeCase(text).toUpperCase();
  }

  /**
   * Converts to dot case
   * @private
   * @static
   * @param {string} text - Text to convert
   * @returns {string} Dot cased text
   */
  static #toDotCase(text) {
    return this.#toSnakeCase(text).replace(/_/g, '.');
  }

  /**
   * Converts to path case
   * @private
   * @static
   * @param {string} text - Text to convert
   * @returns {string} Path cased text
   */
  static #toPathCase(text) {
    return this.#toSnakeCase(text).replace(/_/g, '/');
  }

  /**
   * Converts to train case
   * @private
   * @static
   * @param {string} text - Text to convert
   * @returns {string} Train cased text
   */
  static #toTrainCase(text) {
    return text
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .split('-')
      .map(word => this.#capitalizeWord(word))
      .join('-');
  }

  /**
   * Capitalizes word
   * @private
   * @static
   * @param {string} word - Word to capitalize
   * @returns {string} Capitalized word
   */
  static #capitalizeWord(word) {
    if (!word) return '';
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }

  /**
   * Masks email address
   * @private
   * @static
   * @param {string} email - Email to mask
   * @param {string} maskChar - Mask character
   * @returns {string} Masked email
   */
  static #maskEmail(email, maskChar) {
    const atIndex = email.indexOf('@');
    if (atIndex <= 0) return email;
    
    const [localPart, domain] = [email.slice(0, atIndex), email.slice(atIndex)];
    const visibleCount = Math.min(3, Math.floor(localPart.length / 2));
    
    return this.mask(localPart, 'partial', {
      maskChar,
      visibleStart: visibleCount,
      visibleEnd: 0
    }) + domain;
  }

  /**
   * Masks phone number
   * @private
   * @static
   * @param {string} phone - Phone to mask
   * @param {string} maskChar - Mask character
   * @returns {string} Masked phone
   */
  static #maskPhone(phone, maskChar) {
    const digits = phone.replace(/\D/g, '');
    const visibleLast = 4;
    
    if (digits.length <= visibleLast) return phone;
    
    const masked = maskChar.repeat(digits.length - visibleLast) + digits.slice(-visibleLast);
    
    // Try to preserve original formatting
    let result = '';
    let digitIndex = 0;
    
    for (const char of phone) {
      if (/\d/.test(char)) {
        result += masked[digitIndex++];
      } else {
        result += char;
      }
    }
    
    return result;
  }

  /**
   * Masks credit card number
   * @private
   * @static
   * @param {string} cardNumber - Card number to mask
   * @param {string} maskChar - Mask character
   * @returns {string} Masked card number
   */
  static #maskCreditCard(cardNumber, maskChar) {
    const digits = cardNumber.replace(/\D/g, '');
    
    if (digits.length < 8) return cardNumber;
    
    const first = digits.slice(0, 4);
    const last = digits.slice(-4);
    const middle = maskChar.repeat(digits.length - 8);
    
    // Format as groups of 4
    const masked = first + middle + last;
    const groups = [];
    
    for (let i = 0; i < masked.length; i += 4) {
      groups.push(masked.slice(i, i + 4));
    }
    
    return groups.join(' ');
  }

  /**
   * Masks SSN
   * @private
   * @static
   * @param {string} ssn - SSN to mask
   * @param {string} maskChar - Mask character
   * @returns {string} Masked SSN
   */
  static #maskSSN(ssn, maskChar) {
    const digits = ssn.replace(/\D/g, '');
    
    if (digits.length !== 9) return ssn;
    
    const masked = maskChar.repeat(5) + digits.slice(-4);
    return `${masked.slice(0, 3)}-${masked.slice(3, 5)}-${masked.slice(5)}`;
  }

  /**
   * Masks with custom pattern
   * @private
   * @static
   * @param {string} text - Text to mask
   * @param {string} pattern - Pattern (X for mask, other chars preserved)
   * @param {string} maskChar - Mask character
   * @returns {string} Masked text
   */
  static #maskWithPattern(text, pattern, maskChar) {
    let result = '';
    let textIndex = 0;
    
    for (const patternChar of pattern) {
      if (textIndex >= text.length) break;
      
      if (patternChar === 'X' || patternChar === 'x') {
        result += maskChar;
        textIndex++;
      } else if (patternChar === '?') {
        result += text[textIndex];
        textIndex++;
      } else {
        result += patternChar;
      }
    }
    
    return result;
  }

  /**
   * Generates plural form
   * @private
   * @static
   * @param {string} singular - Singular form
   * @returns {string} Plural form
   */
  static #generatePlural(singular) {
    // Basic English pluralization rules
    if (singular.match(/(s|ss|sh|ch|x|z)$/i)) {
      return singular + 'es';
    }
    if (singular.match(/([^aeiou])y$/i)) {
      return singular.slice(0, -1) + 'ies';
    }
    if (singular.match(/f$/i)) {
      return singular.slice(0, -1) + 'ves';
    }
    if (singular.match(/fe$/i)) {
      return singular.slice(0, -2) + 'ves';
    }
    if (singular.match(/(o)$/i)) {
      return singular + 'es';
    }
    
    return singular + 's';
  }

  /**
   * Creates text formatter function
   * @static
   * @param {Object} [defaultOptions={}] - Default options
   * @returns {Function} Formatter function
   */
  static createFormatter(defaultOptions = {}) {
    return (text, overrideOptions = {}) => {
      return this.format(text, { ...defaultOptions, ...overrideOptions });
    };
  }

  /**
   * Gets case types
   * @static
   * @returns {Object} Available case types
   */
  static getCaseTypes() {
    return { ...this.#CASE_TYPES };
  }

  /**
   * Gets truncate positions
   * @static
   * @returns {Object} Available truncate positions
   */
  static getTruncatePositions() {
    return { ...this.#TRUNCATE_POSITIONS };
  }

  /**
   * Gets mask types
   * @static
   * @returns {Object} Available mask types
   */
  static getMaskTypes() {
    return { ...this.#MASK_TYPES };
  }
}

module.exports = TextFormatter;