'use strict';

/**
 * @fileoverview Comprehensive number formatting utility with multiple format styles
 * @module shared/lib/utils/formatters/number-formatter
 * @requires module:shared/lib/utils/validators/common-validators
 * @requires module:shared/lib/utils/constants/error-codes
 */

const CommonValidator = require('../validators/common-validators');
const { VALIDATION_ERRORS, FORMAT_ERRORS } = require('../constants/error-codes');

/**
 * @class NumberFormatter
 * @description Provides comprehensive number formatting methods for various use cases
 */
class NumberFormatter {
  /**
   * @private
   * @static
   * @readonly
   */
  static #DEFAULT_LOCALE = 'en-US';
  
  static #FORMAT_TYPES = {
    DECIMAL: 'decimal',
    PERCENT: 'percent',
    SCIENTIFIC: 'scientific',
    ENGINEERING: 'engineering',
    COMPACT: 'compact',
    ORDINAL: 'ordinal',
    BYTES: 'bytes',
    DURATION: 'duration',
    CUSTOM: 'custom'
  };

  static #BYTE_UNITS = {
    DECIMAL: [
      { value: 1e12, symbol: 'TB', name: 'terabyte' },
      { value: 1e9, symbol: 'GB', name: 'gigabyte' },
      { value: 1e6, symbol: 'MB', name: 'megabyte' },
      { value: 1e3, symbol: 'KB', name: 'kilobyte' },
      { value: 1, symbol: 'B', name: 'byte' }
    ],
    BINARY: [
      { value: Math.pow(1024, 4), symbol: 'TiB', name: 'tebibyte' },
      { value: Math.pow(1024, 3), symbol: 'GiB', name: 'gibibyte' },
      { value: Math.pow(1024, 2), symbol: 'MiB', name: 'mebibyte' },
      { value: 1024, symbol: 'KiB', name: 'kibibyte' },
      { value: 1, symbol: 'B', name: 'byte' }
    ]
  };

  static #ORDINAL_RULES = {
    'en': (n) => {
      const lastDigit = n % 10;
      const lastTwoDigits = n % 100;
      
      if (lastTwoDigits >= 11 && lastTwoDigits <= 13) return 'th';
      
      switch (lastDigit) {
        case 1: return 'st';
        case 2: return 'nd';
        case 3: return 'rd';
        default: return 'th';
      }
    },
    'fr': (n) => n === 1 ? 'er' : 'e',
    'es': (n) => 'º',
    'de': (n) => '.',
    'it': (n) => 'º',
    'pt': (n) => 'º'
  };

  static #ROMAN_NUMERALS = [
    { value: 1000, numeral: 'M' },
    { value: 900, numeral: 'CM' },
    { value: 500, numeral: 'D' },
    { value: 400, numeral: 'CD' },
    { value: 100, numeral: 'C' },
    { value: 90, numeral: 'XC' },
    { value: 50, numeral: 'L' },
    { value: 40, numeral: 'XL' },
    { value: 10, numeral: 'X' },
    { value: 9, numeral: 'IX' },
    { value: 5, numeral: 'V' },
    { value: 4, numeral: 'IV' },
    { value: 1, numeral: 'I' }
  ];

  static #PRECISION_LEVELS = {
    LOW: 0,
    MEDIUM: 2,
    HIGH: 4,
    VERY_HIGH: 6,
    MAXIMUM: 20
  };

  /**
   * Formats number with specified options
   * @static
   * @param {number|string} value - Number to format
   * @param {Object} [options={}] - Formatting options
   * @param {string} [options.type='decimal'] - Format type
   * @param {string} [options.locale] - Locale for formatting
   * @param {number} [options.minimumFractionDigits] - Minimum decimal places
   * @param {number} [options.maximumFractionDigits] - Maximum decimal places
   * @param {boolean} [options.useGrouping=true] - Use thousand separators
   * @param {string} [options.notation='standard'] - Number notation
   * @returns {string|null} Formatted number or null if invalid
   */
  static format(value, options = {}) {
    if (!CommonValidator.isDefined(value)) return null;
    
    try {
      const numValue = this.#parseNumber(value);
      if (numValue === null) return null;
      
      const {
        type = this.#FORMAT_TYPES.DECIMAL,
        locale = this.#DEFAULT_LOCALE,
        ...formatOptions
      } = options;
      
      switch (type) {
        case this.#FORMAT_TYPES.PERCENT:
          return this.#formatPercent(numValue, locale, formatOptions);
          
        case this.#FORMAT_TYPES.SCIENTIFIC:
          return this.#formatScientific(numValue, locale, formatOptions);
          
        case this.#FORMAT_TYPES.ENGINEERING:
          return this.#formatEngineering(numValue, locale, formatOptions);
          
        case this.#FORMAT_TYPES.COMPACT:
          return this.#formatCompact(numValue, locale, formatOptions);
          
        case this.#FORMAT_TYPES.ORDINAL:
          return this.#formatOrdinal(numValue, locale, formatOptions);
          
        case this.#FORMAT_TYPES.BYTES:
          return this.#formatBytes(numValue, formatOptions);
          
        case this.#FORMAT_TYPES.DURATION:
          return this.#formatDuration(numValue, formatOptions);
          
        case this.#FORMAT_TYPES.CUSTOM:
          return this.#formatCustom(numValue, locale, formatOptions);
          
        case this.#FORMAT_TYPES.DECIMAL:
        default:
          return this.#formatDecimal(numValue, locale, formatOptions);
      }
    } catch (error) {
      console.error('NumberFormatter.format error:', error);
      return null;
    }
  }

  /**
   * Formats number as percentage
   * @static
   * @param {number|string} value - Number to format (0.5 = 50%)
   * @param {Object} [options={}] - Formatting options
   * @returns {string|null} Formatted percentage or null
   */
  static formatPercent(value, options = {}) {
    return this.format(value, { ...options, type: this.#FORMAT_TYPES.PERCENT });
  }

  /**
   * Formats number in scientific notation
   * @static
   * @param {number|string} value - Number to format
   * @param {Object} [options={}] - Formatting options
   * @returns {string|null} Scientific notation or null
   */
  static formatScientific(value, options = {}) {
    return this.format(value, { ...options, type: this.#FORMAT_TYPES.SCIENTIFIC });
  }

  /**
   * Formats number as ordinal (1st, 2nd, 3rd, etc.)
   * @static
   * @param {number|string} value - Number to format
   * @param {Object} [options={}] - Formatting options
   * @returns {string|null} Ordinal number or null
   */
  static formatOrdinal(value, options = {}) {
    return this.format(value, { ...options, type: this.#FORMAT_TYPES.ORDINAL });
  }

  /**
   * Formats bytes to human-readable format
   * @static
   * @param {number|string} bytes - Bytes to format
   * @param {Object} [options={}] - Formatting options
   * @param {boolean} [options.binary=false] - Use binary units (1024)
   * @param {number} [options.decimals=2] - Decimal places
   * @returns {string|null} Formatted bytes or null
   */
  static formatBytes(bytes, options = {}) {
    return this.format(bytes, { ...options, type: this.#FORMAT_TYPES.BYTES });
  }

  /**
   * Formats number with custom precision
   * @static
   * @param {number|string} value - Number to format
   * @param {number} precision - Number of significant digits
   * @param {Object} [options={}] - Additional options
   * @returns {string|null} Formatted number or null
   */
  static formatPrecision(value, precision, options = {}) {
    if (!CommonValidator.isDefined(value) || !precision) return null;
    
    try {
      const numValue = this.#parseNumber(value);
      if (numValue === null) return null;
      
      const { locale = this.#DEFAULT_LOCALE } = options;
      
      return new Intl.NumberFormat(locale, {
        minimumSignificantDigits: precision,
        maximumSignificantDigits: precision
      }).format(numValue);
    } catch (error) {
      console.error('NumberFormatter.formatPrecision error:', error);
      return null;
    }
  }

  /**
   * Formats number as Roman numeral
   * @static
   * @param {number|string} value - Number to convert (1-3999)
   * @param {Object} [options={}] - Formatting options
   * @param {boolean} [options.lowercase=false] - Use lowercase numerals
   * @returns {string|null} Roman numeral or null
   */
  static formatRoman(value, options = {}) {
    if (!CommonValidator.isDefined(value)) return null;
    
    try {
      const numValue = this.#parseNumber(value);
      if (numValue === null || numValue < 1 || numValue > 3999 || !Number.isInteger(numValue)) {
        return null;
      }
      
      const { lowercase = false } = options;
      let result = '';
      let remaining = numValue;
      
      for (const { value: romanValue, numeral } of this.#ROMAN_NUMERALS) {
        const count = Math.floor(remaining / romanValue);
        if (count > 0) {
          result += numeral.repeat(count);
          remaining -= romanValue * count;
        }
      }
      
      return lowercase ? result.toLowerCase() : result;
    } catch (error) {
      console.error('NumberFormatter.formatRoman error:', error);
      return null;
    }
  }

  /**
   * Formats duration in milliseconds to human-readable format
   * @static
   * @param {number|string} milliseconds - Duration in milliseconds
   * @param {Object} [options={}] - Formatting options
   * @param {string} [options.format='auto'] - Duration format
   * @param {Array} [options.units] - Units to include
   * @returns {string|null} Formatted duration or null
   */
  static formatDuration(milliseconds, options = {}) {
    return this.format(milliseconds, { ...options, type: this.#FORMAT_TYPES.DURATION });
  }

  /**
   * Rounds number to specified decimal places
   * @static
   * @param {number|string} value - Number to round
   * @param {number} [decimals=0] - Decimal places
   * @param {string} [method='round'] - Rounding method (round, floor, ceil)
   * @returns {number|null} Rounded number or null
   */
  static round(value, decimals = 0, method = 'round') {
    if (!CommonValidator.isDefined(value)) return null;
    
    try {
      const numValue = this.#parseNumber(value);
      if (numValue === null) return null;
      
      const factor = Math.pow(10, decimals);
      const methods = {
        'round': Math.round,
        'floor': Math.floor,
        'ceil': Math.ceil,
        'trunc': Math.trunc
      };
      
      const roundingMethod = methods[method] || Math.round;
      return roundingMethod(numValue * factor) / factor;
    } catch (error) {
      console.error('NumberFormatter.round error:', error);
      return null;
    }
  }

  /**
   * Pads number with leading zeros
   * @static
   * @param {number|string} value - Number to pad
   * @param {number} length - Total length
   * @param {Object} [options={}] - Padding options
   * @returns {string|null} Padded number or null
   */
  static pad(value, length, options = {}) {
    if (!CommonValidator.isDefined(value) || !length) return null;
    
    try {
      const numValue = this.#parseNumber(value);
      if (numValue === null) return null;
      
      const {
        padChar = '0',
        padLeft = true,
        preserveSign = true
      } = options;
      
      const isNegative = numValue < 0;
      const absValue = Math.abs(numValue);
      let strValue = String(Number.isInteger(absValue) ? absValue : absValue.toFixed(2));
      
      const paddingNeeded = Math.max(0, length - strValue.length - (isNegative && preserveSign ? 1 : 0));
      const padding = padChar.repeat(paddingNeeded);
      
      if (padLeft) {
        strValue = padding + strValue;
      } else {
        strValue = strValue + padding;
      }
      
      if (isNegative && preserveSign) {
        strValue = '-' + strValue;
      }
      
      return strValue;
    } catch (error) {
      console.error('NumberFormatter.pad error:', error);
      return null;
    }
  }

  /**
   * Converts number to words
   * @static
   * @param {number|string} value - Number to convert
   * @param {Object} [options={}] - Conversion options
   * @param {string} [options.locale='en'] - Language locale
   * @param {boolean} [options.currency=false] - Format as currency
   * @returns {string|null} Number in words or null
   */
  static toWords(value, options = {}) {
    if (!CommonValidator.isDefined(value)) return null;
    
    try {
      const numValue = this.#parseNumber(value);
      if (numValue === null) return null;
      
      const { locale = 'en', currency = false } = options;
      
      // For now, only support English
      if (locale !== 'en') {
        console.warn('NumberFormatter.toWords: Only English is currently supported');
        return null;
      }
      
      return this.#convertToEnglishWords(numValue, currency);
    } catch (error) {
      console.error('NumberFormatter.toWords error:', error);
      return null;
    }
  }

  /**
   * Formats number range
   * @static
   * @param {number|string} min - Minimum value
   * @param {number|string} max - Maximum value
   * @param {Object} [options={}] - Formatting options
   * @returns {string|null} Formatted range or null
   */
  static formatRange(min, max, options = {}) {
    if (!CommonValidator.isDefined(min) || !CommonValidator.isDefined(max)) return null;
    
    try {
      const minValue = this.#parseNumber(min);
      const maxValue = this.#parseNumber(max);
      
      if (minValue === null || maxValue === null) return null;
      
      const {
        separator = ' – ',
        locale = this.#DEFAULT_LOCALE,
        ...formatOptions
      } = options;
      
      const minFormatted = this.format(minValue, { locale, ...formatOptions });
      const maxFormatted = this.format(maxValue, { locale, ...formatOptions });
      
      return `${minFormatted}${separator}${maxFormatted}`;
    } catch (error) {
      console.error('NumberFormatter.formatRange error:', error);
      return null;
    }
  }

  /**
   * Parses formatted number string
   * @static
   * @param {string} formattedNumber - Formatted number string
   * @param {Object} [options={}] - Parsing options
   * @returns {number|null} Parsed number or null
   */
  static parse(formattedNumber, options = {}) {
    if (!formattedNumber || typeof formattedNumber !== 'string') return null;
    
    try {
      const { locale = this.#DEFAULT_LOCALE, type } = options;
      
      // Remove common formatting characters
      let cleaned = formattedNumber.trim();
      
      // Handle percentage
      if (type === this.#FORMAT_TYPES.PERCENT || cleaned.includes('%')) {
        cleaned = cleaned.replace('%', '');
        const parsed = this.#parseCleanedNumber(cleaned, locale);
        return parsed !== null ? parsed / 100 : null;
      }
      
      // Handle scientific notation
      if (cleaned.match(/[eE][+-]?\d+/)) {
        return parseFloat(cleaned);
      }
      
      // Handle ordinals
      if (type === this.#FORMAT_TYPES.ORDINAL) {
        cleaned = cleaned.replace(/st|nd|rd|th|er|e|º|\./g, '');
      }
      
      // Handle bytes
      if (type === this.#FORMAT_TYPES.BYTES) {
        return this.#parseBytesString(cleaned);
      }
      
      return this.#parseCleanedNumber(cleaned, locale);
    } catch (error) {
      console.error('NumberFormatter.parse error:', error);
      return null;
    }
  }

  /**
   * Creates statistics summary for array of numbers
   * @static
   * @param {Array<number|string>} values - Array of values
   * @param {Object} [options={}] - Formatting options
   * @returns {Object|null} Statistics summary or null
   */
  static summarize(values, options = {}) {
    if (!Array.isArray(values) || values.length === 0) return null;
    
    try {
      const numbers = values
        .map(v => this.#parseNumber(v))
        .filter(n => n !== null)
        .sort((a, b) => a - b);
      
      if (numbers.length === 0) return null;
      
      const { locale = this.#DEFAULT_LOCALE, formatOptions = {} } = options;
      
      const sum = numbers.reduce((acc, val) => acc + val, 0);
      const mean = sum / numbers.length;
      const median = numbers.length % 2 === 0
        ? (numbers[numbers.length / 2 - 1] + numbers[numbers.length / 2]) / 2
        : numbers[Math.floor(numbers.length / 2)];
      
      // Calculate mode
      const frequency = {};
      let maxFreq = 0;
      let mode = null;
      
      numbers.forEach(num => {
        frequency[num] = (frequency[num] || 0) + 1;
        if (frequency[num] > maxFreq) {
          maxFreq = frequency[num];
          mode = num;
        }
      });
      
      // Calculate standard deviation
      const variance = numbers.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / numbers.length;
      const stdDev = Math.sqrt(variance);
      
      return {
        count: numbers.length,
        sum,
        mean,
        median,
        mode,
        min: numbers[0],
        max: numbers[numbers.length - 1],
        range: numbers[numbers.length - 1] - numbers[0],
        standardDeviation: stdDev,
        variance,
        formatted: {
          sum: this.format(sum, { locale, ...formatOptions }),
          mean: this.format(mean, { locale, ...formatOptions }),
          median: this.format(median, { locale, ...formatOptions }),
          mode: this.format(mode, { locale, ...formatOptions }),
          min: this.format(numbers[0], { locale, ...formatOptions }),
          max: this.format(numbers[numbers.length - 1], { locale, ...formatOptions }),
          range: this.format(numbers[numbers.length - 1] - numbers[0], { locale, ...formatOptions }),
          standardDeviation: this.format(stdDev, { locale, ...formatOptions })
        }
      };
    } catch (error) {
      console.error('NumberFormatter.summarize error:', error);
      return null;
    }
  }

  /**
   * Parses number from various formats
   * @private
   * @static
   * @param {number|string} value - Value to parse
   * @returns {number|null} Parsed number or null
   */
  static #parseNumber(value) {
    if (typeof value === 'number') {
      return isNaN(value) || !isFinite(value) ? null : value;
    }
    
    if (typeof value === 'string') {
      const cleaned = value.trim();
      if (cleaned === '') return null;
      
      const parsed = parseFloat(cleaned);
      return isNaN(parsed) ? null : parsed;
    }
    
    return null;
  }

  /**
   * Formats number as decimal
   * @private
   * @static
   * @param {number} value - Number to format
   * @param {string} locale - Locale
   * @param {Object} options - Format options
   * @returns {string} Formatted number
   */
  static #formatDecimal(value, locale, options) {
    const {
      minimumFractionDigits = 0,
      maximumFractionDigits = 3,
      useGrouping = true,
      notation = 'standard',
      signDisplay = 'auto'
    } = options;
    
    return new Intl.NumberFormat(locale, {
      style: 'decimal',
      minimumFractionDigits,
      maximumFractionDigits,
      useGrouping,
      notation,
      signDisplay
    }).format(value);
  }

  /**
   * Formats number as percentage
   * @private
   * @static
   * @param {number} value - Number to format
   * @param {string} locale - Locale
   * @param {Object} options - Format options
   * @returns {string} Formatted percentage
   */
  static #formatPercent(value, locale, options) {
    const {
      minimumFractionDigits = 0,
      maximumFractionDigits = 2,
      signDisplay = 'auto'
    } = options;
    
    return new Intl.NumberFormat(locale, {
      style: 'percent',
      minimumFractionDigits,
      maximumFractionDigits,
      signDisplay
    }).format(value);
  }

  /**
   * Formats number in scientific notation
   * @private
   * @static
   * @param {number} value - Number to format
   * @param {string} locale - Locale
   * @param {Object} options - Format options
   * @returns {string} Scientific notation
   */
  static #formatScientific(value, locale, options) {
    const { precision = 3 } = options;
    
    if (value === 0) return '0';
    
    const exponent = Math.floor(Math.log10(Math.abs(value)));
    const mantissa = value / Math.pow(10, exponent);
    
    const formatter = new Intl.NumberFormat(locale, {
      minimumFractionDigits: precision,
      maximumFractionDigits: precision
    });
    
    return `${formatter.format(mantissa)} × 10^${exponent}`;
  }

  /**
   * Formats number in engineering notation
   * @private
   * @static
   * @param {number} value - Number to format
   * @param {string} locale - Locale
   * @param {Object} options - Format options
   * @returns {string} Engineering notation
   */
  static #formatEngineering(value, locale, options) {
    const { precision = 3 } = options;
    
    if (value === 0) return '0';
    
    const exponent = Math.floor(Math.log10(Math.abs(value)) / 3) * 3;
    const mantissa = value / Math.pow(10, exponent);
    
    const formatter = new Intl.NumberFormat(locale, {
      minimumFractionDigits: precision,
      maximumFractionDigits: precision
    });
    
    return `${formatter.format(mantissa)}e${exponent >= 0 ? '+' : ''}${exponent}`;
  }

  /**
   * Formats number in compact notation
   * @private
   * @static
   * @param {number} value - Number to format
   * @param {string} locale - Locale
   * @param {Object} options - Format options
   * @returns {string} Compact notation
   */
  static #formatCompact(value, locale, options) {
    if (typeof Intl.NumberFormat.prototype.format === 'function') {
      try {
        return new Intl.NumberFormat(locale, {
          notation: 'compact',
          compactDisplay: options.compactDisplay || 'short'
        }).format(value);
      } catch (e) {
        // Fallback for browsers that don't support compact notation
      }
    }
    
    // Manual fallback
    const absValue = Math.abs(value);
    const sign = value < 0 ? '-' : '';
    
    if (absValue >= 1e12) return `${sign}${(absValue / 1e12).toFixed(1)}T`;
    if (absValue >= 1e9) return `${sign}${(absValue / 1e9).toFixed(1)}B`;
    if (absValue >= 1e6) return `${sign}${(absValue / 1e6).toFixed(1)}M`;
    if (absValue >= 1e3) return `${sign}${(absValue / 1e3).toFixed(1)}K`;
    
    return this.#formatDecimal(value, locale, options);
  }

  /**
   * Formats number as ordinal
   * @private
   * @static
   * @param {number} value - Number to format
   * @param {string} locale - Locale
   * @param {Object} options - Format options
   * @returns {string} Ordinal number
   */
  static #formatOrdinal(value, locale, options) {
    if (!Number.isInteger(value)) {
      return this.#formatDecimal(value, locale, options);
    }
    
    const lang = locale.split('-')[0];
    const suffix = this.#ORDINAL_RULES[lang] ? this.#ORDINAL_RULES[lang](value) : 'th';
    
    return `${value}${suffix}`;
  }

  /**
   * Formats bytes
   * @private
   * @static
   * @param {number} bytes - Bytes to format
   * @param {Object} options - Format options
   * @returns {string} Formatted bytes
   */
  static #formatBytes(bytes, options) {
    const {
      binary = false,
      decimals = 2,
      locale = this.#DEFAULT_LOCALE
    } = options;
    
    if (bytes === 0) return '0 B';
    
    const units = binary ? this.#BYTE_UNITS.BINARY : this.#BYTE_UNITS.DECIMAL;
    const sign = bytes < 0 ? '-' : '';
    const absBytes = Math.abs(bytes);
    
    for (const unit of units) {
      if (absBytes >= unit.value) {
        const value = absBytes / unit.value;
        const formatter = new Intl.NumberFormat(locale, {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals
        });
        return `${sign}${formatter.format(value)} ${unit.symbol}`;
      }
    }
    
    return `${sign}${absBytes} B`;
  }

  /**
   * Formats duration
   * @private
   * @static
   * @param {number} milliseconds - Duration in milliseconds
   * @param {Object} options - Format options
   * @returns {string} Formatted duration
   */
  static #formatDuration(milliseconds, options) {
    const {
      format = 'auto',
      units = ['days', 'hours', 'minutes', 'seconds'],
      locale = this.#DEFAULT_LOCALE
    } = options;
    
    const absMs = Math.abs(milliseconds);
    const sign = milliseconds < 0 ? '-' : '';
    
    const durations = {
      days: Math.floor(absMs / (24 * 60 * 60 * 1000)),
      hours: Math.floor((absMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000)),
      minutes: Math.floor((absMs % (60 * 60 * 1000)) / (60 * 1000)),
      seconds: Math.floor((absMs % (60 * 1000)) / 1000),
      milliseconds: absMs % 1000
    };
    
    if (format === 'short') {
      const parts = [];
      units.forEach(unit => {
        if (durations[unit] > 0) {
          const abbrev = { days: 'd', hours: 'h', minutes: 'm', seconds: 's', milliseconds: 'ms' };
          parts.push(`${durations[unit]}${abbrev[unit]}`);
        }
      });
      return sign + (parts.length > 0 ? parts.join(' ') : '0s');
    }
    
    // Long format
    const parts = [];
    units.forEach(unit => {
      if (durations[unit] > 0) {
        const value = durations[unit];
        const label = value === 1 ? unit.slice(0, -1) : unit;
        parts.push(`${value} ${label}`);
      }
    });
    
    return sign + (parts.length > 0 ? parts.join(', ') : '0 seconds');
  }

  /**
   * Custom number formatting
   * @private
   * @static
   * @param {number} value - Number to format
   * @param {string} locale - Locale
   * @param {Object} options - Format options
   * @returns {string} Custom formatted number
   */
  static #formatCustom(value, locale, options) {
    const {
      prefix = '',
      suffix = '',
      negativePattern = '-{value}',
      positivePattern = '{value}',
      zeroPattern = '{value}',
      thousandSeparator = ',',
      decimalSeparator = '.',
      decimals = 2
    } = options;
    
    let pattern;
    if (value === 0) {
      pattern = zeroPattern;
    } else if (value < 0) {
      pattern = negativePattern;
    } else {
      pattern = positivePattern;
    }
    
    // Format the absolute value
    const absValue = Math.abs(value);
    const parts = absValue.toFixed(decimals).split('.');
    
    // Add thousand separators
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, thousandSeparator);
    
    // Join with decimal separator
    const formatted = parts.join(decimalSeparator);
    
    // Apply pattern
    const result = pattern.replace('{value}', formatted);
    
    return `${prefix}${result}${suffix}`;
  }

  /**
   * Parses cleaned number string
   * @private
   * @static
   * @param {string} cleaned - Cleaned number string
   * @param {string} locale - Locale
   * @returns {number|null} Parsed number
   */
  static #parseCleanedNumber(cleaned, locale) {
    try {
      // Get locale-specific separators
      const formatter = new Intl.NumberFormat(locale);
      const parts = formatter.formatToParts(1234.5);
      const groupSeparator = parts.find(p => p.type === 'group')?.value || ',';
      const decimalSeparator = parts.find(p => p.type === 'decimal')?.value || '.';
      
      // Remove group separators and normalize decimal separator
      let normalized = cleaned.replace(new RegExp(`\\${groupSeparator}`, 'g'), '');
      normalized = normalized.replace(decimalSeparator, '.');
      
      const parsed = parseFloat(normalized);
      return isNaN(parsed) ? null : parsed;
    } catch (error) {
      return parseFloat(cleaned);
    }
  }

  /**
   * Parses bytes string
   * @private
   * @static
   * @param {string} bytesString - Bytes string to parse
   * @returns {number|null} Parsed bytes
   */
  static #parseBytesString(bytesString) {
    const match = bytesString.match(/^([\d.]+)\s*([KMGT]i?B?)?$/i);
    if (!match) return null;
    
    const value = parseFloat(match[1]);
    if (isNaN(value)) return null;
    
    const unit = match[2] ? match[2].toUpperCase() : 'B';
    
    const multipliers = {
      'B': 1,
      'KB': 1e3, 'KIB': 1024,
      'MB': 1e6, 'MIB': Math.pow(1024, 2),
      'GB': 1e9, 'GIB': Math.pow(1024, 3),
      'TB': 1e12, 'TIB': Math.pow(1024, 4)
    };
    
    const multiplier = multipliers[unit] || 1;
    return value * multiplier;
  }

  /**
   * Converts number to English words
   * @private
   * @static
   * @param {number} value - Number to convert
   * @param {boolean} currency - Format as currency
   * @returns {string} Number in words
   */
  static #convertToEnglishWords(value, currency) {
    if (value === 0) return currency ? 'zero dollars' : 'zero';
    
    const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
    const teens = ['ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
    const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
    const thousands = ['', 'thousand', 'million', 'billion', 'trillion'];
    
    const convertHundreds = (num) => {
      let result = '';
      
      if (num > 99) {
        result += ones[Math.floor(num / 100)] + ' hundred';
        num %= 100;
        if (num > 0) result += ' and ';
      }
      
      if (num > 19) {
        result += tens[Math.floor(num / 10)];
        if (num % 10 > 0) result += '-' + ones[num % 10];
      } else if (num > 9) {
        result += teens[num - 10];
      } else if (num > 0) {
        result += ones[num];
      }
      
      return result;
    };
    
    if (!Number.isInteger(value) || value < 0) {
      return this.#formatDecimal(value, 'en-US', {});
    }
    
    if (value >= 1e15) {
      return this.#formatDecimal(value, 'en-US', {});
    }
    
    let words = '';
    let groupIndex = 0;
    
    while (value > 0) {
      const group = value % 1000;
      if (group !== 0) {
        const groupWords = convertHundreds(group);
        if (thousands[groupIndex]) {
          words = groupWords + ' ' + thousands[groupIndex] + (words ? ', ' : '') + words;
        } else {
          words = groupWords + (words ? ' ' : '') + words;
        }
      }
      value = Math.floor(value / 1000);
      groupIndex++;
    }
    
    if (currency) {
      words += ' dollar' + (words !== 'one' ? 's' : '');
    }
    
    return words.trim();
  }

  /**
   * Creates number formatter function
   * @static
   * @param {Object} [defaultOptions={}] - Default options
   * @returns {Function} Formatter function
   */
  static createFormatter(defaultOptions = {}) {
    return (value, overrideOptions = {}) => {
      return this.format(value, { ...defaultOptions, ...overrideOptions });
    };
  }

  /**
   * Gets format types
   * @static
   * @returns {Object} Available format types
   */
  static getFormatTypes() {
    return { ...this.#FORMAT_TYPES };
  }

  /**
   * Gets precision levels
   * @static
   * @returns {Object} Available precision levels
   */
  static getPrecisionLevels() {
    return { ...this.#PRECISION_LEVELS };
  }
}

module.exports = NumberFormatter;