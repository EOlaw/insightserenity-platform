'use strict';

/**
 * @fileoverview Comprehensive currency formatting utility with multi-currency support
 * @module shared/lib/utils/formatters/currency-formatter
 * @requires module:shared/lib/utils/validators/common-validators
 * @requires module:shared/lib/utils/constants/error-codes
 */

const CommonValidator = require('../validators/common-validators');
const { VALIDATION_ERRORS, FORMAT_ERRORS } = require('../constants/error-codes');

/**
 * @class CurrencyFormatter
 * @description Provides comprehensive currency formatting methods with internationalization support
 */
class CurrencyFormatter {
  /**
   * @private
   * @static
   * @readonly
   */
  static #DEFAULT_LOCALE = 'en-US';
  static #DEFAULT_CURRENCY = 'USD';
  
  static #CURRENCY_DATA = {
    USD: { symbol: '$', name: 'US Dollar', decimals: 2, position: 'before' },
    EUR: { symbol: '€', name: 'Euro', decimals: 2, position: 'before' },
    GBP: { symbol: '£', name: 'British Pound', decimals: 2, position: 'before' },
    JPY: { symbol: '¥', name: 'Japanese Yen', decimals: 0, position: 'before' },
    CNY: { symbol: '¥', name: 'Chinese Yuan', decimals: 2, position: 'before' },
    INR: { symbol: '₹', name: 'Indian Rupee', decimals: 2, position: 'before' },
    AUD: { symbol: 'A$', name: 'Australian Dollar', decimals: 2, position: 'before' },
    CAD: { symbol: 'C$', name: 'Canadian Dollar', decimals: 2, position: 'before' },
    CHF: { symbol: 'Fr', name: 'Swiss Franc', decimals: 2, position: 'before' },
    SEK: { symbol: 'kr', name: 'Swedish Krona', decimals: 2, position: 'after' },
    NOK: { symbol: 'kr', name: 'Norwegian Krone', decimals: 2, position: 'after' },
    DKK: { symbol: 'kr', name: 'Danish Krone', decimals: 2, position: 'after' },
    KRW: { symbol: '₩', name: 'South Korean Won', decimals: 0, position: 'before' },
    SGD: { symbol: 'S$', name: 'Singapore Dollar', decimals: 2, position: 'before' },
    HKD: { symbol: 'HK$', name: 'Hong Kong Dollar', decimals: 2, position: 'before' },
    MXN: { symbol: '$', name: 'Mexican Peso', decimals: 2, position: 'before' },
    BRL: { symbol: 'R$', name: 'Brazilian Real', decimals: 2, position: 'before' },
    RUB: { symbol: '₽', name: 'Russian Ruble', decimals: 2, position: 'after' },
    ZAR: { symbol: 'R', name: 'South African Rand', decimals: 2, position: 'before' },
    TRY: { symbol: '₺', name: 'Turkish Lira', decimals: 2, position: 'after' },
    // Crypto currencies
    BTC: { symbol: '₿', name: 'Bitcoin', decimals: 8, position: 'before', crypto: true },
    ETH: { symbol: 'Ξ', name: 'Ethereum', decimals: 18, position: 'before', crypto: true },
    USDT: { symbol: '₮', name: 'Tether', decimals: 6, position: 'before', crypto: true },
    BNB: { symbol: 'BNB', name: 'Binance Coin', decimals: 8, position: 'after', crypto: true }
  };

  static #FORMAT_STYLES = {
    STANDARD: 'standard',
    ACCOUNTING: 'accounting',
    SHORT: 'short',
    COMPACT: 'compact',
    CUSTOM: 'custom'
  };

  static #COMPACT_UNITS = [
    { value: 1e12, symbol: 'T', name: 'trillion' },
    { value: 1e9, symbol: 'B', name: 'billion' },
    { value: 1e6, symbol: 'M', name: 'million' },
    { value: 1e3, symbol: 'K', name: 'thousand' }
  ];

  /**
   * Formats currency amount
   * @static
   * @param {number|string} amount - Amount to format
   * @param {string} [currency='USD'] - Currency code
   * @param {Object} [options={}] - Formatting options
   * @param {string} [options.locale] - Locale for formatting
   * @param {string} [options.style='standard'] - Format style
   * @param {boolean} [options.showSymbol=true] - Show currency symbol
   * @param {boolean} [options.showCode=false] - Show currency code
   * @param {number} [options.minimumFractionDigits] - Minimum decimal places
   * @param {number} [options.maximumFractionDigits] - Maximum decimal places
   * @param {boolean} [options.useGrouping=true] - Use thousand separators
   * @returns {string|null} Formatted currency string or null if invalid
   */
  static format(amount, currency = this.#DEFAULT_CURRENCY, options = {}) {
    if (!CommonValidator.isDefined(amount)) return null;
    
    try {
      const numAmount = this.#parseAmount(amount);
      if (numAmount === null) return null;
      
      const {
        locale = this.#DEFAULT_LOCALE,
        style = this.#FORMAT_STYLES.STANDARD,
        showSymbol = true,
        showCode = false,
        minimumFractionDigits,
        maximumFractionDigits,
        useGrouping = true
      } = options;
      
      const upperCurrency = currency.toUpperCase();
      const currencyData = this.#CURRENCY_DATA[upperCurrency];
      
      if (!currencyData && !this.#isValidCurrencyCode(upperCurrency)) {
        console.warn(`Unknown currency code: ${upperCurrency}`);
      }
      
      switch (style) {
        case this.#FORMAT_STYLES.ACCOUNTING:
          return this.#formatAccounting(numAmount, upperCurrency, locale, options);
          
        case this.#FORMAT_STYLES.SHORT:
          return this.#formatShort(numAmount, upperCurrency, locale, options);
          
        case this.#FORMAT_STYLES.COMPACT:
          return this.#formatCompact(numAmount, upperCurrency, locale, options);
          
        case this.#FORMAT_STYLES.CUSTOM:
          return this.#formatCustom(numAmount, upperCurrency, locale, options);
          
        case this.#FORMAT_STYLES.STANDARD:
        default:
          return this.#formatStandard(numAmount, upperCurrency, locale, options);
      }
    } catch (error) {
      console.error('CurrencyFormatter.format error:', error);
      return null;
    }
  }

  /**
   * Formats amount with currency symbol only
   * @static
   * @param {number|string} amount - Amount to format
   * @param {string} [currency='USD'] - Currency code
   * @param {Object} [options={}] - Formatting options
   * @returns {string|null} Formatted amount with symbol
   */
  static formatWithSymbol(amount, currency = this.#DEFAULT_CURRENCY, options = {}) {
    return this.format(amount, currency, {
      ...options,
      showSymbol: true,
      showCode: false
    });
  }

  /**
   * Formats amount with currency code only
   * @static
   * @param {number|string} amount - Amount to format
   * @param {string} [currency='USD'] - Currency code
   * @param {Object} [options={}] - Formatting options
   * @returns {string|null} Formatted amount with code
   */
  static formatWithCode(amount, currency = this.#DEFAULT_CURRENCY, options = {}) {
    return this.format(amount, currency, {
      ...options,
      showSymbol: false,
      showCode: true
    });
  }

  /**
   * Formats amount in accounting style (negatives in parentheses)
   * @static
   * @param {number|string} amount - Amount to format
   * @param {string} [currency='USD'] - Currency code
   * @param {Object} [options={}] - Formatting options
   * @returns {string|null} Accounting formatted amount
   */
  static formatAccounting(amount, currency = this.#DEFAULT_CURRENCY, options = {}) {
    return this.format(amount, currency, {
      ...options,
      style: this.#FORMAT_STYLES.ACCOUNTING
    });
  }

  /**
   * Formats amount in compact notation (1K, 1M, etc.)
   * @static
   * @param {number|string} amount - Amount to format
   * @param {string} [currency='USD'] - Currency code
   * @param {Object} [options={}] - Formatting options
   * @returns {string|null} Compact formatted amount
   */
  static formatCompact(amount, currency = this.#DEFAULT_CURRENCY, options = {}) {
    return this.format(amount, currency, {
      ...options,
      style: this.#FORMAT_STYLES.COMPACT
    });
  }

  /**
   * Parses formatted currency string to number
   * @static
   * @param {string} formattedAmount - Formatted currency string
   * @param {Object} [options={}] - Parsing options
   * @param {string} [options.locale] - Locale used in formatting
   * @param {string} [options.currency] - Currency code
   * @returns {number|null} Parsed amount or null if invalid
   */
  static parse(formattedAmount, options = {}) {
    if (!formattedAmount || typeof formattedAmount !== 'string') return null;
    
    try {
      const { locale = this.#DEFAULT_LOCALE, currency } = options;
      
      // Remove currency symbols and codes
      let cleanAmount = formattedAmount.trim();
      
      // Remove known currency symbols
      Object.values(this.#CURRENCY_DATA).forEach(({ symbol }) => {
        cleanAmount = cleanAmount.replace(new RegExp(`\\${symbol}`, 'g'), '');
      });
      
      // Remove currency codes
      if (currency) {
        cleanAmount = cleanAmount.replace(new RegExp(currency, 'gi'), '');
      }
      
      // Handle accounting format (parentheses for negatives)
      const isNegative = cleanAmount.includes('(') && cleanAmount.includes(')');
      cleanAmount = cleanAmount.replace(/[()]/g, '');
      
      // Get locale-specific separators
      const formatter = new Intl.NumberFormat(locale);
      const parts = formatter.formatToParts(1234.5);
      const groupSeparator = parts.find(p => p.type === 'group')?.value || ',';
      const decimalSeparator = parts.find(p => p.type === 'decimal')?.value || '.';
      
      // Remove group separators and normalize decimal separator
      cleanAmount = cleanAmount.replace(new RegExp(`\\${groupSeparator}`, 'g'), '');
      cleanAmount = cleanAmount.replace(decimalSeparator, '.');
      
      // Handle compact notation
      const compactMatch = cleanAmount.match(/^([-+]?\d+\.?\d*)\s*([KMBT])$/i);
      if (compactMatch) {
        const value = parseFloat(compactMatch[1]);
        const unit = compactMatch[2].toUpperCase();
        const multiplier = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 }[unit] || 1;
        return value * multiplier * (isNegative ? -1 : 1);
      }
      
      // Parse regular number
      const parsed = parseFloat(cleanAmount);
      if (isNaN(parsed)) return null;
      
      return parsed * (isNegative ? -1 : 1);
    } catch (error) {
      console.error('CurrencyFormatter.parse error:', error);
      return null;
    }
  }

  /**
   * Converts amount between currencies
   * @static
   * @param {number|string} amount - Amount to convert
   * @param {string} fromCurrency - Source currency
   * @param {string} toCurrency - Target currency
   * @param {number} exchangeRate - Exchange rate
   * @param {Object} [options={}] - Conversion options
   * @returns {Object|null} Conversion result or null if invalid
   */
  static convert(amount, fromCurrency, toCurrency, exchangeRate, options = {}) {
    if (!CommonValidator.isDefined(amount) || !fromCurrency || !toCurrency || !exchangeRate) {
      return null;
    }
    
    try {
      const numAmount = this.#parseAmount(amount);
      if (numAmount === null) return null;
      
      const rate = parseFloat(exchangeRate);
      if (isNaN(rate) || rate <= 0) return null;
      
      const convertedAmount = numAmount * rate;
      const { round = true, decimals } = options;
      
      const fromData = this.#CURRENCY_DATA[fromCurrency.toUpperCase()];
      const toData = this.#CURRENCY_DATA[toCurrency.toUpperCase()];
      
      const finalAmount = round 
        ? this.#roundToDecimals(convertedAmount, decimals || toData?.decimals || 2)
        : convertedAmount;
      
      return {
        originalAmount: numAmount,
        convertedAmount: finalAmount,
        fromCurrency: fromCurrency.toUpperCase(),
        toCurrency: toCurrency.toUpperCase(),
        exchangeRate: rate,
        formatted: {
          original: this.format(numAmount, fromCurrency),
          converted: this.format(finalAmount, toCurrency)
        },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('CurrencyFormatter.convert error:', error);
      return null;
    }
  }

  /**
   * Gets currency information
   * @static
   * @param {string} currency - Currency code
   * @returns {Object|null} Currency information or null if not found
   */
  static getCurrencyInfo(currency) {
    if (!currency) return null;
    
    const upperCurrency = currency.toUpperCase();
    const data = this.#CURRENCY_DATA[upperCurrency];
    
    if (!data) {
      // Try to get info from Intl API
      try {
        const formatter = new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: upperCurrency
        });
        
        return {
          code: upperCurrency,
          symbol: upperCurrency,
          name: upperCurrency,
          decimals: 2,
          position: 'before',
          supported: true
        };
      } catch (error) {
        return null;
      }
    }
    
    return {
      code: upperCurrency,
      ...data,
      supported: true
    };
  }

  /**
   * Gets list of supported currencies
   * @static
   * @param {Object} [options={}] - Filter options
   * @param {boolean} [options.includeCrypto=true] - Include cryptocurrencies
   * @param {boolean} [options.includeDetails=false] - Include full details
   * @returns {Array} List of supported currencies
   */
  static getSupportedCurrencies(options = {}) {
    const { includeCrypto = true, includeDetails = false } = options;
    
    const currencies = Object.entries(this.#CURRENCY_DATA)
      .filter(([code, data]) => includeCrypto || !data.crypto)
      .map(([code, data]) => includeDetails ? { code, ...data } : code);
    
    return currencies;
  }

  /**
   * Validates currency code
   * @static
   * @param {string} currency - Currency code to validate
   * @returns {boolean} True if valid currency code
   */
  static isValidCurrency(currency) {
    if (!currency || typeof currency !== 'string') return false;
    
    const upperCurrency = currency.toUpperCase();
    
    // Check our database first
    if (this.#CURRENCY_DATA[upperCurrency]) return true;
    
    // Check with Intl API
    return this.#isValidCurrencyCode(upperCurrency);
  }

  /**
   * Formats multiple amounts in the same currency
   * @static
   * @param {Array<number|string>} amounts - Amounts to format
   * @param {string} [currency='USD'] - Currency code
   * @param {Object} [options={}] - Formatting options
   * @returns {Array<string>} Formatted amounts
   */
  static formatBatch(amounts, currency = this.#DEFAULT_CURRENCY, options = {}) {
    if (!Array.isArray(amounts)) return [];
    
    return amounts.map(amount => this.format(amount, currency, options)).filter(Boolean);
  }

  /**
   * Calculates sum of amounts
   * @static
   * @param {Array<number|string>} amounts - Amounts to sum
   * @param {Object} [options={}] - Calculation options
   * @returns {Object} Sum result with formatted output
   */
  static sum(amounts, options = {}) {
    if (!Array.isArray(amounts)) return null;
    
    try {
      const { currency = this.#DEFAULT_CURRENCY, ignoreInvalid = false } = options;
      
      let total = 0;
      let validCount = 0;
      let invalidCount = 0;
      const errors = [];
      
      amounts.forEach((amount, index) => {
        const parsed = this.#parseAmount(amount);
        if (parsed !== null) {
          total += parsed;
          validCount++;
        } else {
          invalidCount++;
          if (!ignoreInvalid) {
            errors.push({ index, value: amount, error: 'Invalid amount' });
          }
        }
      });
      
      if (!ignoreInvalid && errors.length > 0) {
        return {
          success: false,
          errors,
          validCount,
          invalidCount
        };
      }
      
      return {
        success: true,
        total,
        formatted: this.format(total, currency, options),
        count: validCount,
        average: validCount > 0 ? total / validCount : 0,
        formattedAverage: validCount > 0 ? this.format(total / validCount, currency, options) : null
      };
    } catch (error) {
      console.error('CurrencyFormatter.sum error:', error);
      return null;
    }
  }

  /**
   * Parses amount from various formats
   * @private
   * @static
   * @param {number|string} amount - Amount to parse
   * @returns {number|null} Parsed amount or null
   */
  static #parseAmount(amount) {
    if (typeof amount === 'number') {
      return isNaN(amount) || !isFinite(amount) ? null : amount;
    }
    
    if (typeof amount === 'string') {
      // Remove common currency symbols and whitespace
      const cleaned = amount.replace(/[$€£¥₹₿]/g, '').trim();
      const parsed = parseFloat(cleaned);
      return isNaN(parsed) ? null : parsed;
    }
    
    return null;
  }

  /**
   * Formats amount in standard style
   * @private
   * @static
   * @param {number} amount - Amount to format
   * @param {string} currency - Currency code
   * @param {string} locale - Locale
   * @param {Object} options - Format options
   * @returns {string} Formatted amount
   */
  static #formatStandard(amount, currency, locale, options) {
    const currencyData = this.#CURRENCY_DATA[currency];
    const {
      showSymbol = true,
      showCode = false,
      minimumFractionDigits,
      maximumFractionDigits,
      useGrouping = true
    } = options;
    
    try {
      const formatter = new Intl.NumberFormat(locale, {
        style: showSymbol || showCode ? 'currency' : 'decimal',
        currency: currency,
        currencyDisplay: showCode ? 'code' : 'symbol',
        useGrouping,
        minimumFractionDigits: minimumFractionDigits ?? currencyData?.decimals,
        maximumFractionDigits: maximumFractionDigits ?? currencyData?.decimals
      });
      
      return formatter.format(amount);
    } catch (error) {
      // Fallback for unsupported currencies
      return this.#formatFallback(amount, currency, currencyData, options);
    }
  }

  /**
   * Formats amount in accounting style
   * @private
   * @static
   * @param {number} amount - Amount to format
   * @param {string} currency - Currency code
   * @param {string} locale - Locale
   * @param {Object} options - Format options
   * @returns {string} Formatted amount
   */
  static #formatAccounting(amount, currency, locale, options) {
    const formatted = this.#formatStandard(Math.abs(amount), currency, locale, options);
    
    if (amount < 0) {
      return `(${formatted})`;
    }
    
    return formatted;
  }

  /**
   * Formats amount in short style
   * @private
   * @static
   * @param {number} amount - Amount to format
   * @param {string} currency - Currency code
   * @param {string} locale - Locale
   * @param {Object} options - Format options
   * @returns {string} Formatted amount
   */
  static #formatShort(amount, currency, locale, options) {
    const currencyData = this.#CURRENCY_DATA[currency];
    const symbol = currencyData?.symbol || currency;
    
    const formatter = new Intl.NumberFormat(locale, {
      style: 'decimal',
      useGrouping: true,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    });
    
    const formatted = formatter.format(amount);
    const position = currencyData?.position || 'before';
    
    return position === 'before' ? `${symbol}${formatted}` : `${formatted}${symbol}`;
  }

  /**
   * Formats amount in compact notation
   * @private
   * @static
   * @param {number} amount - Amount to format
   * @param {string} currency - Currency code
   * @param {string} locale - Locale
   * @param {Object} options - Format options
   * @returns {string} Formatted amount
   */
  static #formatCompact(amount, currency, locale, options) {
    const currencyData = this.#CURRENCY_DATA[currency];
    const symbol = options.showSymbol ? (currencyData?.symbol || currency) : '';
    const code = options.showCode ? currency : '';
    const absAmount = Math.abs(amount);
    
    // Find appropriate unit
    let value = absAmount;
    let unit = '';
    
    for (const compactUnit of this.#COMPACT_UNITS) {
      if (absAmount >= compactUnit.value) {
        value = absAmount / compactUnit.value;
        unit = compactUnit.symbol;
        break;
      }
    }
    
    // Format the number
    const formatter = new Intl.NumberFormat(locale, {
      style: 'decimal',
      minimumFractionDigits: 0,
      maximumFractionDigits: value < 10 ? 1 : 0
    });
    
    const formatted = formatter.format(value);
    const sign = amount < 0 ? '-' : '';
    
    if (symbol) {
      const position = currencyData?.position || 'before';
      return position === 'before' 
        ? `${sign}${symbol}${formatted}${unit}`
        : `${sign}${formatted}${unit}${symbol}`;
    }
    
    if (code) {
      return `${sign}${formatted}${unit} ${code}`;
    }
    
    return `${sign}${formatted}${unit}`;
  }

  /**
   * Custom formatting
   * @private
   * @static
   * @param {number} amount - Amount to format
   * @param {string} currency - Currency code
   * @param {string} locale - Locale
   * @param {Object} options - Format options
   * @returns {string} Formatted amount
   */
  static #formatCustom(amount, currency, locale, options) {
    const {
      prefix = '',
      suffix = '',
      negativePattern = '-{amount}',
      positivePattern = '{amount}',
      zeroPattern = '{amount}',
      ...formatOptions
    } = options;
    
    const baseFormatted = this.#formatStandard(Math.abs(amount), currency, locale, formatOptions);
    
    let pattern;
    if (amount === 0) {
      pattern = zeroPattern;
    } else if (amount < 0) {
      pattern = negativePattern;
    } else {
      pattern = positivePattern;
    }
    
    const result = pattern.replace('{amount}', baseFormatted);
    return `${prefix}${result}${suffix}`;
  }

  /**
   * Fallback formatting for unsupported currencies
   * @private
   * @static
   * @param {number} amount - Amount to format
   * @param {string} currency - Currency code
   * @param {Object} currencyData - Currency data
   * @param {Object} options - Format options
   * @returns {string} Formatted amount
   */
  static #formatFallback(amount, currency, currencyData, options) {
    const {
      showSymbol = true,
      showCode = false,
      useGrouping = true
    } = options;
    
    const decimals = currencyData?.decimals ?? 2;
    const symbol = currencyData?.symbol || '';
    const position = currencyData?.position || 'before';
    
    // Format number
    let formatted = amount.toFixed(decimals);
    
    if (useGrouping) {
      const parts = formatted.split('.');
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      formatted = parts.join('.');
    }
    
    // Add currency
    if (showSymbol && symbol) {
      formatted = position === 'before' ? `${symbol}${formatted}` : `${formatted}${symbol}`;
    } else if (showCode) {
      formatted = `${formatted} ${currency}`;
    }
    
    return formatted;
  }

  /**
   * Validates currency code using Intl API
   * @private
   * @static
   * @param {string} currency - Currency code
   * @returns {boolean} True if valid
   */
  static #isValidCurrencyCode(currency) {
    try {
      new Intl.NumberFormat('en-US', { style: 'currency', currency });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Rounds number to specified decimals
   * @private
   * @static
   * @param {number} value - Value to round
   * @param {number} decimals - Decimal places
   * @returns {number} Rounded value
   */
  static #roundToDecimals(value, decimals) {
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
  }

  /**
   * Creates currency formatter function
   * @static
   * @param {string} currency - Currency code
   * @param {Object} [options={}] - Default options
   * @returns {Function} Formatter function
   */
  static createFormatter(currency, options = {}) {
    return (amount, overrideOptions = {}) => {
      return this.format(amount, currency, { ...options, ...overrideOptions });
    };
  }

  /**
   * Gets format styles
   * @static
   * @returns {Object} Available format styles
   */
  static getFormatStyles() {
    return { ...this.#FORMAT_STYLES };
  }
}

module.exports = CurrencyFormatter;