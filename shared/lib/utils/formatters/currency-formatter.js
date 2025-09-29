'use strict';

/**
 * @fileoverview Comprehensive currency formatting utilities
 * @module shared/lib/utils/formatters/currency-formatter
 */

/**
 * @class CurrencyFormatter
 * @description Advanced currency formatting utilities with international support
 */
class CurrencyFormatter {
  /**
   * Constructor
   * @param {Object} [config={}] - Configuration options
   */
  constructor(config = {}) {
    this.config = {
      defaultCurrency: config.defaultCurrency || 'USD',
      defaultLocale: config.defaultLocale || 'en-US',
      defaultDecimals: config.defaultDecimals || 2,
      enableCaching: config.enableCaching !== false,
      cacheTimeout: config.cacheTimeout || 3600000, // 1 hour
      exchangeRateProvider: config.exchangeRateProvider || null,
      ...config
    };

    // Currency data cache
    this.currencyData = new Map();
    this.exchangeRates = new Map();
    this.formatCache = new Map();

    // Initialize currency data
    this._initializeCurrencyData();

    // Initialize formatters
    this.formatters = new Map();
  }

  /**
   * Initialize currency data
   * @private
   */
  _initializeCurrencyData() {
    // Common currency configurations
    this.currencies = {
      USD: { symbol: '$', name: 'US Dollar', decimals: 2, position: 'before', separator: ',', decimal: '.' },
      EUR: { symbol: '€', name: 'Euro', decimals: 2, position: 'before', separator: '.', decimal: ',' },
      GBP: { symbol: '£', name: 'British Pound', decimals: 2, position: 'before', separator: ',', decimal: '.' },
      JPY: { symbol: '¥', name: 'Japanese Yen', decimals: 0, position: 'before', separator: ',', decimal: '.' },
      CNY: { symbol: '¥', name: 'Chinese Yuan', decimals: 2, position: 'before', separator: ',', decimal: '.' },
      INR: { symbol: '₹', name: 'Indian Rupee', decimals: 2, position: 'before', separator: ',', decimal: '.' },
      CAD: { symbol: 'C$', name: 'Canadian Dollar', decimals: 2, position: 'before', separator: ',', decimal: '.' },
      AUD: { symbol: 'A$', name: 'Australian Dollar', decimals: 2, position: 'before', separator: ',', decimal: '.' },
      CHF: { symbol: 'Fr', name: 'Swiss Franc', decimals: 2, position: 'before', separator: "'", decimal: '.' },
      SEK: { symbol: 'kr', name: 'Swedish Krona', decimals: 2, position: 'after', separator: ' ', decimal: ',' },
      NOK: { symbol: 'kr', name: 'Norwegian Krone', decimals: 2, position: 'after', separator: ' ', decimal: ',' },
      DKK: { symbol: 'kr', name: 'Danish Krone', decimals: 2, position: 'after', separator: '.', decimal: ',' },
      PLN: { symbol: 'zł', name: 'Polish Zloty', decimals: 2, position: 'after', separator: ' ', decimal: ',' },
      RUB: { symbol: '₽', name: 'Russian Ruble', decimals: 2, position: 'after', separator: ' ', decimal: ',' },
      BRL: { symbol: 'R$', name: 'Brazilian Real', decimals: 2, position: 'before', separator: '.', decimal: ',' },
      MXN: { symbol: '$', name: 'Mexican Peso', decimals: 2, position: 'before', separator: ',', decimal: '.' },
      ZAR: { symbol: 'R', name: 'South African Rand', decimals: 2, position: 'before', separator: ' ', decimal: '.' },
      KRW: { symbol: '₩', name: 'South Korean Won', decimals: 0, position: 'before', separator: ',', decimal: '.' },
      SGD: { symbol: 'S$', name: 'Singapore Dollar', decimals: 2, position: 'before', separator: ',', decimal: '.' },
      HKD: { symbol: 'HK$', name: 'Hong Kong Dollar', decimals: 2, position: 'before', separator: ',', decimal: '.' },
      NZD: { symbol: 'NZ$', name: 'New Zealand Dollar', decimals: 2, position: 'before', separator: ',', decimal: '.' },
      TRY: { symbol: '₺', name: 'Turkish Lira', decimals: 2, position: 'before', separator: '.', decimal: ',' },
      THB: { symbol: '฿', name: 'Thai Baht', decimals: 2, position: 'before', separator: ',', decimal: '.' },
      MYR: { symbol: 'RM', name: 'Malaysian Ringgit', decimals: 2, position: 'before', separator: ',', decimal: '.' },
      PHP: { symbol: '₱', name: 'Philippine Peso', decimals: 2, position: 'before', separator: ',', decimal: '.' },
      IDR: { symbol: 'Rp', name: 'Indonesian Rupiah', decimals: 0, position: 'before', separator: '.', decimal: ',' },
      VND: { symbol: '₫', name: 'Vietnamese Dong', decimals: 0, position: 'after', separator: '.', decimal: ',' },
      AED: { symbol: 'د.إ', name: 'UAE Dirham', decimals: 2, position: 'before', separator: ',', decimal: '.' },
      SAR: { symbol: '﷼', name: 'Saudi Riyal', decimals: 2, position: 'before', separator: ',', decimal: '.' },
      EGP: { symbol: '£', name: 'Egyptian Pound', decimals: 2, position: 'before', separator: ',', decimal: '.' },
      NGN: { symbol: '₦', name: 'Nigerian Naira', decimals: 2, position: 'before', separator: ',', decimal: '.' },
      KES: { symbol: 'KSh', name: 'Kenyan Shilling', decimals: 2, position: 'before', separator: ',', decimal: '.' },
      GHS: { symbol: '₵', name: 'Ghanaian Cedi', decimals: 2, position: 'before', separator: ',', decimal: '.' },
      UAH: { symbol: '₴', name: 'Ukrainian Hryvnia', decimals: 2, position: 'before', separator: ' ', decimal: ',' },
      ILS: { symbol: '₪', name: 'Israeli Shekel', decimals: 2, position: 'before', separator: ',', decimal: '.' },
      ARS: { symbol: '$', name: 'Argentine Peso', decimals: 2, position: 'before', separator: '.', decimal: ',' },
      CLP: { symbol: '$', name: 'Chilean Peso', decimals: 0, position: 'before', separator: '.', decimal: ',' },
      COP: { symbol: '$', name: 'Colombian Peso', decimals: 0, position: 'before', separator: '.', decimal: ',' },
      PEN: { symbol: 'S/', name: 'Peruvian Sol', decimals: 2, position: 'before', separator: ',', decimal: '.' },
      UYU: { symbol: '$U', name: 'Uruguayan Peso', decimals: 2, position: 'before', separator: '.', decimal: ',' },
      VEF: { symbol: 'Bs', name: 'Venezuelan Bolivar', decimals: 2, position: 'before', separator: '.', decimal: ',' },
      CZK: { symbol: 'Kč', name: 'Czech Koruna', decimals: 2, position: 'after', separator: ' ', decimal: ',' },
      HUF: { symbol: 'Ft', name: 'Hungarian Forint', decimals: 0, position: 'after', separator: ' ', decimal: ',' },
      RON: { symbol: 'lei', name: 'Romanian Leu', decimals: 2, position: 'after', separator: '.', decimal: ',' },
      BGN: { symbol: 'лв', name: 'Bulgarian Lev', decimals: 2, position: 'after', separator: ' ', decimal: ',' },
      HRK: { symbol: 'kn', name: 'Croatian Kuna', decimals: 2, position: 'after', separator: '.', decimal: ',' },
      ISK: { symbol: 'kr', name: 'Icelandic Krona', decimals: 0, position: 'after', separator: '.', decimal: ',' },
      // Crypto currencies
      BTC: { symbol: '₿', name: 'Bitcoin', decimals: 8, position: 'before', separator: ',', decimal: '.' },
      ETH: { symbol: 'Ξ', name: 'Ethereum', decimals: 18, position: 'before', separator: ',', decimal: '.' },
      USDT: { symbol: '₮', name: 'Tether', decimals: 6, position: 'before', separator: ',', decimal: '.' }
    };

    // Initialize locale mappings
    this.localeCurrencyMap = {
      'en-US': 'USD',
      'en-GB': 'GBP',
      'en-CA': 'CAD',
      'en-AU': 'AUD',
      'en-NZ': 'NZD',
      'en-IN': 'INR',
      'en-SG': 'SGD',
      'en-HK': 'HKD',
      'en-ZA': 'ZAR',
      'fr-FR': 'EUR',
      'de-DE': 'EUR',
      'es-ES': 'EUR',
      'it-IT': 'EUR',
      'pt-PT': 'EUR',
      'nl-NL': 'EUR',
      'fr-CA': 'CAD',
      'es-MX': 'MXN',
      'pt-BR': 'BRL',
      'ja-JP': 'JPY',
      'zh-CN': 'CNY',
      'zh-TW': 'TWD',
      'ko-KR': 'KRW',
      'ru-RU': 'RUB',
      'tr-TR': 'TRY',
      'ar-SA': 'SAR',
      'ar-AE': 'AED',
      'ar-EG': 'EGP',
      'he-IL': 'ILS',
      'th-TH': 'THB',
      'vi-VN': 'VND',
      'id-ID': 'IDR',
      'ms-MY': 'MYR',
      'fil-PH': 'PHP',
      'pl-PL': 'PLN',
      'sv-SE': 'SEK',
      'no-NO': 'NOK',
      'da-DK': 'DKK',
      'fi-FI': 'EUR',
      'cs-CZ': 'CZK',
      'hu-HU': 'HUF',
      'ro-RO': 'RON',
      'bg-BG': 'BGN',
      'hr-HR': 'HRK',
      'uk-UA': 'UAH',
      'is-IS': 'ISK'
    };
  }

  /**
   * Format currency
   * @param {number} amount - Amount to format
   * @param {string} [currency] - Currency code
   * @param {Object} [options={}] - Formatting options
   * @returns {string} Formatted currency string
   */
  format(amount, currency = null, options = {}) {
    const {
      locale = this.config.defaultLocale,
      decimals = null,
      showSymbol = true,
      showCode = false,
      compact = false,
      accounting = false,
      forceSign = false,
      spaceBetween = true,
      customSymbol = null,
      roundingMode = 'round'
    } = options;

    // Determine currency
    const currencyCode = currency || this.getCurrencyForLocale(locale) || this.config.defaultCurrency;
    const currencyInfo = this.getCurrencyInfo(currencyCode);

    if (!currencyInfo) {
      throw new Error(`Unsupported currency: ${currencyCode}`);
    }

    // Handle special values
    if (amount === null || amount === undefined || isNaN(amount)) {
      return this._handleSpecialValue(amount, currencyInfo, options);
    }

    // Apply rounding
    const decimalPlaces = decimals !== null ? decimals : currencyInfo.decimals;
    let formattedAmount = this._applyRounding(amount, decimalPlaces, roundingMode);

    // Format for accounting (negatives in parentheses)
    const isNegative = formattedAmount < 0;
    if (accounting && isNegative) {
      formattedAmount = Math.abs(formattedAmount);
    }

    // Format compact notation
    if (compact) {
      formattedAmount = this._formatCompact(formattedAmount, locale);
    } else {
      formattedAmount = this._formatNumber(formattedAmount, currencyInfo, decimalPlaces);
    }

    // Build result
    let result = formattedAmount;

    // Add symbol or code
    if (showSymbol || showCode) {
      const symbol = customSymbol || (showCode ? currencyCode : currencyInfo.symbol);
      const space = spaceBetween ? ' ' : '';

      if (currencyInfo.position === 'before') {
        result = symbol + space + result;
      } else {
        result = result + space + symbol;
      }
    }

    // Apply accounting format
    if (accounting && isNegative) {
      result = `(${result})`;
    }

    // Apply force sign
    if (forceSign && !isNegative && amount > 0) {
      result = '+' + result;
    }

    return result;
  }

  /**
   * Format with Intl.NumberFormat
   * @param {number} amount - Amount to format
   * @param {string} [currency] - Currency code
   * @param {string} [locale] - Locale
   * @returns {string} Formatted currency
   */
  formatIntl(amount, currency = null, locale = null) {
    const actualCurrency = currency || this.config.defaultCurrency;
    const actualLocale = locale || this.config.defaultLocale;

    // Check cache
    const cacheKey = `${actualLocale}-${actualCurrency}`;
    if (!this.formatters.has(cacheKey)) {
      this.formatters.set(cacheKey, new Intl.NumberFormat(actualLocale, {
        style: 'currency',
        currency: actualCurrency,
        minimumFractionDigits: this.getCurrencyInfo(actualCurrency)?.decimals || 2
      }));
    }

    return this.formatters.get(cacheKey).format(amount);
  }

  /**
   * Parse currency string to number
   * @param {string} value - Currency string
   * @param {string} [currency] - Currency code
   * @returns {number} Parsed amount
   */
  parse(value, currency = null) {
    if (typeof value === 'number') {
      return value;
    }

    if (!value || typeof value !== 'string') {
      return 0;
    }

    // Get currency info
    const currencyInfo = currency ? this.getCurrencyInfo(currency) : null;

    // Remove currency symbols and codes
    let cleanValue = value;

    // Remove all known currency symbols
    for (const curr of Object.values(this.currencies)) {
      cleanValue = cleanValue.replace(new RegExp(this._escapeRegex(curr.symbol), 'g'), '');
    }

    // Remove currency codes
    cleanValue = cleanValue.replace(/[A-Z]{3}/g, '');

    // Handle accounting format (parentheses for negative)
    const isNegative = cleanValue.includes('(') && cleanValue.includes(')');
    cleanValue = cleanValue.replace(/[()]/g, '');

    // Determine decimal separator
    const decimalSeparator = currencyInfo ? currencyInfo.decimal : '.';
    const thousandsSeparator = currencyInfo ? currencyInfo.separator : ',';

    // Remove thousands separators
    cleanValue = cleanValue.replace(new RegExp(this._escapeRegex(thousandsSeparator), 'g'), '');

    // Replace decimal separator with standard dot
    if (decimalSeparator !== '.') {
      cleanValue = cleanValue.replace(decimalSeparator, '.');
    }

    // Remove remaining non-numeric characters except dot and minus
    cleanValue = cleanValue.replace(/[^0-9.-]/g, '');

    // Parse to number
    let result = parseFloat(cleanValue);

    // Apply negative if needed
    if (isNegative && result > 0) {
      result = -result;
    }

    return isNaN(result) ? 0 : result;
  }

  /**
   * Convert between currencies
   * @param {number} amount - Amount to convert
   * @param {string} from - Source currency
   * @param {string} to - Target currency
   * @param {Object} [options={}] - Conversion options
   * @returns {Promise<number>} Converted amount
   */
  async convert(amount, from, to, options = {}) {
    if (from === to) {
      return amount;
    }

    const { useCache = true, provider = null } = options;

    // Get exchange rate
    const rate = await this.getExchangeRate(from, to, { useCache, provider });

    // Convert amount
    const converted = amount * rate;

    // Round to target currency decimals
    const targetCurrency = this.getCurrencyInfo(to);
    const decimals = targetCurrency ? targetCurrency.decimals : 2;

    return Math.round(converted * Math.pow(10, decimals)) / Math.pow(10, decimals);
  }

  /**
   * Get exchange rate
   * @param {string} from - Source currency
   * @param {string} to - Target currency
   * @param {Object} [options={}] - Options
   * @returns {Promise<number>} Exchange rate
   */
  async getExchangeRate(from, to, options = {}) {
    const { useCache = true, provider = this.config.exchangeRateProvider } = options;

    // Check cache
    const cacheKey = `${from}-${to}`;
    if (useCache && this.exchangeRates.has(cacheKey)) {
      const cached = this.exchangeRates.get(cacheKey);
      if (Date.now() - cached.timestamp < this.config.cacheTimeout) {
        return cached.rate;
      }
    }

    // Fetch from provider
    let rate;
    if (provider) {
      rate = await provider.getRate(from, to);
    } else {
      // Use mock rates for demo
      rate = this._getMockExchangeRate(from, to);
    }

    // Cache the rate
    this.exchangeRates.set(cacheKey, {
      rate,
      timestamp: Date.now()
    });

    return rate;
  }

  /**
   * Format currency range
   * @param {number} min - Minimum amount
   * @param {number} max - Maximum amount
   * @param {string} [currency] - Currency code
   * @param {Object} [options={}] - Formatting options
   * @returns {string} Formatted range
   */
  formatRange(min, max, currency = null, options = {}) {
    const { separator = ' - ', singleFormat = false } = options;

    if (min === max || singleFormat) {
      return this.format(min, currency, options);
    }

    const minFormatted = this.format(min, currency, options);
    const maxFormatted = this.format(max, currency, options);

    // Optimize if currency symbol is the same
    const currencyInfo = this.getCurrencyInfo(currency || this.config.defaultCurrency);
    if (currencyInfo.position === 'before') {
      // Remove duplicate currency symbol
      const symbol = currencyInfo.symbol;
      const minWithoutSymbol = minFormatted.replace(symbol, '').trim();
      return `${symbol} ${minWithoutSymbol}${separator}${maxFormatted.replace(symbol, '').trim()}`;
    }

    return `${minFormatted}${separator}${maxFormatted}`;
  }

  /**
   * Format as accounting
   * @param {number} amount - Amount to format
   * @param {string} [currency] - Currency code
   * @param {Object} [options={}] - Formatting options
   * @returns {string} Formatted accounting string
   */
  formatAccounting(amount, currency = null, options = {}) {
    return this.format(amount, currency, { ...options, accounting: true });
  }

  /**
   * Format multiple amounts
   * @param {Array<number>} amounts - Amounts to format
   * @param {string} [currency] - Currency code
   * @param {Object} [options={}] - Formatting options
   * @returns {Array<string>} Formatted amounts
   */
  formatMultiple(amounts, currency = null, options = {}) {
    return amounts.map(amount => this.format(amount, currency, options));
  }

  /**
   * Get currency info
   * @param {string} code - Currency code
   * @returns {Object|null} Currency information
   */
  getCurrencyInfo(code) {
    return this.currencies[code] || null;
  }

  /**
   * Get all supported currencies
   * @returns {Array<Object>} List of currencies
   */
  getSupportedCurrencies() {
    return Object.entries(this.currencies).map(([code, info]) => ({
      code,
      ...info
    }));
  }

  /**
   * Get currency for locale
   * @param {string} locale - Locale string
   * @returns {string|null} Currency code
   */
  getCurrencyForLocale(locale) {
    return this.localeCurrencyMap[locale] || null;
  }

  /**
   * Add custom currency
   * @param {string} code - Currency code
   * @param {Object} config - Currency configuration
   */
  addCurrency(code, config) {
    this.currencies[code] = {
      symbol: config.symbol,
      name: config.name,
      decimals: config.decimals || 2,
      position: config.position || 'before',
      separator: config.separator || ',',
      decimal: config.decimal || '.'
    };
  }

  /**
   * Format with custom pattern
   * @param {number} amount - Amount to format
   * @param {string} pattern - Custom pattern
   * @param {string} [currency] - Currency code
   * @returns {string} Formatted string
   */
  formatWithPattern(amount, pattern, currency = null) {
    const currencyInfo = this.getCurrencyInfo(currency || this.config.defaultCurrency);
    const formatted = this._formatNumber(amount, currencyInfo, currencyInfo.decimals);

    return pattern
      .replace('{amount}', formatted)
      .replace('{symbol}', currencyInfo.symbol)
      .replace('{code}', currency || this.config.defaultCurrency)
      .replace('{name}', currencyInfo.name);
  }

  /**
   * Calculate percentage
   * @param {number} amount - Base amount
   * @param {number} percentage - Percentage
   * @param {string} [currency] - Currency code
   * @returns {Object} Calculation result
   */
  calculatePercentage(amount, percentage, currency = null) {
    const value = (amount * percentage) / 100;
    const total = amount + value;

    return {
      base: amount,
      percentage,
      value,
      total,
      formatted: {
        base: this.format(amount, currency),
        value: this.format(value, currency),
        total: this.format(total, currency)
      }
    };
  }

  /**
   * Calculate tax
   * @param {number} amount - Base amount
   * @param {number} taxRate - Tax rate (percentage)
   * @param {Object} [options={}] - Tax options
   * @returns {Object} Tax calculation
   */
  calculateTax(amount, taxRate, options = {}) {
    const {
      currency = null,
      inclusive = false,
      compound = false,
      additionalTaxes = []
    } = options;

    let baseAmount = amount;
    let totalTax = 0;
    const taxes = [];

    // Handle inclusive tax
    if (inclusive) {
      baseAmount = amount / (1 + taxRate / 100);
      totalTax = amount - baseAmount;
      taxes.push({
        name: 'Main Tax',
        rate: taxRate,
        amount: totalTax
      });
    } else {
      const mainTax = (baseAmount * taxRate) / 100;
      totalTax += mainTax;
      taxes.push({
        name: 'Main Tax',
        rate: taxRate,
        amount: mainTax
      });
    }

    // Apply additional taxes
    for (const tax of additionalTaxes) {
      const taxBase = compound ? baseAmount + totalTax : baseAmount;
      const taxAmount = (taxBase * tax.rate) / 100;
      totalTax += taxAmount;
      taxes.push({
        name: tax.name || 'Additional Tax',
        rate: tax.rate,
        amount: taxAmount
      });
    }

    const grandTotal = inclusive ? amount : baseAmount + totalTax;

    return {
      baseAmount,
      taxes,
      totalTax,
      grandTotal,
      formatted: {
        baseAmount: this.format(baseAmount, currency),
        totalTax: this.format(totalTax, currency),
        grandTotal: this.format(grandTotal, currency),
        taxes: taxes.map(t => ({
          ...t,
          amount: this.format(t.amount, currency)
        }))
      }
    };
  }

  /**
   * Calculate discount
   * @param {number} amount - Original amount
   * @param {number} discount - Discount value
   * @param {Object} [options={}] - Discount options
   * @returns {Object} Discount calculation
   */
  calculateDiscount(amount, discount, options = {}) {
    const {
      type = 'percentage', // 'percentage' or 'fixed'
      currency = null,
      compound = false,
      additionalDiscounts = []
    } = options;

    let totalDiscount = 0;
    let currentAmount = amount;
    const discounts = [];

    // Apply main discount
    const mainDiscount = type === 'percentage'
      ? (currentAmount * discount) / 100
      : discount;

    totalDiscount += mainDiscount;
    currentAmount -= mainDiscount;

    discounts.push({
      name: 'Main Discount',
      type,
      value: discount,
      amount: mainDiscount
    });

    // Apply additional discounts
    for (const disc of additionalDiscounts) {
      const discAmount = disc.type === 'percentage'
        ? (compound ? currentAmount : amount) * disc.value / 100
        : disc.value;

      totalDiscount += discAmount;
      currentAmount -= discAmount;

      discounts.push({
        name: disc.name || 'Additional Discount',
        type: disc.type,
        value: disc.value,
        amount: discAmount
      });
    }

    const finalAmount = Math.max(0, currentAmount);
    const savings = amount - finalAmount;
    const savingsPercentage = (savings / amount) * 100;

    return {
      originalAmount: amount,
      discounts,
      totalDiscount,
      finalAmount,
      savings,
      savingsPercentage,
      formatted: {
        originalAmount: this.format(amount, currency),
        totalDiscount: this.format(totalDiscount, currency),
        finalAmount: this.format(finalAmount, currency),
        savings: this.format(savings, currency),
        discounts: discounts.map(d => ({
          ...d,
          amount: this.format(d.amount, currency)
        }))
      }
    };
  }

  /**
   * Split amount
   * @param {number} amount - Amount to split
   * @param {number} parts - Number of parts
   * @param {Object} [options={}] - Split options
   * @returns {Object} Split result
   */
  splitAmount(amount, parts, options = {}) {
    const {
      currency = null,
      strategy = 'equal', // 'equal', 'largest_first', 'smallest_first'
      customRatios = null
    } = options;

    const currencyInfo = this.getCurrencyInfo(currency || this.config.defaultCurrency);
    const precision = Math.pow(10, currencyInfo.decimals);

    let splits = [];

    if (customRatios && customRatios.length === parts) {
      // Use custom ratios
      const totalRatio = customRatios.reduce((sum, ratio) => sum + ratio, 0);
      splits = customRatios.map(ratio =>
        Math.round((amount * ratio / totalRatio) * precision) / precision
      );
    } else {
      // Equal split
      const baseAmount = Math.floor((amount * precision) / parts) / precision;
      const remainder = Math.round((amount - baseAmount * parts) * precision) / precision;

      splits = Array(parts).fill(baseAmount);

      // Distribute remainder
      if (remainder > 0) {
        const remainderCents = Math.round(remainder * precision);
        for (let i = 0; i < remainderCents; i++) {
          const index = strategy === 'largest_first'
            ? i
            : strategy === 'smallest_first'
              ? parts - 1 - i
              : i;
          splits[index] += 1 / precision;
        }
      }
    }

    // Round splits
    splits = splits.map(s => Math.round(s * precision) / precision);

    return {
      originalAmount: amount,
      parts,
      splits,
      totalAfterSplit: splits.reduce((sum, s) => sum + s, 0),
      formatted: {
        originalAmount: this.format(amount, currency),
        splits: splits.map(s => this.format(s, currency))
      }
    };
  }

  /**
   * Compare amounts
   * @param {number} amount1 - First amount
   * @param {number} amount2 - Second amount
   * @param {Object} [options={}] - Comparison options
   * @returns {Object} Comparison result
   */
  compareAmounts(amount1, amount2, options = {}) {
    const { currency = null, includePercentage = true } = options;

    const difference = amount2 - amount1;
    const percentageChange = amount1 !== 0 ? (difference / amount1) * 100 : 0;
    const isIncrease = difference > 0;
    const isDecrease = difference < 0;
    const isEqual = difference === 0;

    const result = {
      amount1,
      amount2,
      difference,
      absoluteDifference: Math.abs(difference),
      isIncrease,
      isDecrease,
      isEqual,
      comparison: isEqual ? 'equal' : (isIncrease ? 'increase' : 'decrease'),
      formatted: {
        amount1: this.format(amount1, currency),
        amount2: this.format(amount2, currency),
        difference: this.format(difference, currency, { forceSign: true }),
        absoluteDifference: this.format(Math.abs(difference), currency)
      }
    };

    if (includePercentage) {
      result.percentageChange = percentageChange;
      result.formatted.percentageChange = `${percentageChange >= 0 ? '+' : ''}${percentageChange.toFixed(2)}%`;
    }

    return result;
  }

  /**
   * Format for different display contexts
   * @param {number} amount - Amount to format
   * @param {string} context - Display context
   * @param {Object} [options={}] - Formatting options
   * @returns {string} Formatted string
   */
  formatForContext(amount, context, options = {}) {
    const contexts = {
      invoice: { showCode: true, decimals: 2, accounting: true },
      receipt: { showSymbol: true, decimals: 2 },
      report: { showCode: false, showSymbol: true, decimals: 2, accounting: true },
      email: { showCode: true, showSymbol: false },
      sms: { compact: true, showSymbol: true },
      dashboard: { compact: amount >= 10000, showSymbol: true },
      tooltip: { showSymbol: true, showCode: true },
      export: { showCode: true, showSymbol: false, decimals: 4 },
      api: { showCode: true, showSymbol: false, decimals: 8 }
    };

    const contextOptions = contexts[context] || {};
    return this.format(amount, options.currency, { ...contextOptions, ...options });
  }

  /**
   * Validate currency amount
   * @param {any} value - Value to validate
   * @param {Object} [options={}] - Validation options
   * @returns {Object} Validation result
   */
  validateAmount(value, options = {}) {
    const {
      currency = null,
      min = null,
      max = null,
      allowNegative = true,
      allowZero = true,
      maxDecimals = null
    } = options;

    const result = {
      valid: true,
      errors: [],
      warnings: [],
      parsed: null
    };

    // Parse the value
    const parsed = typeof value === 'string' ? this.parse(value, currency) : value;
    result.parsed = parsed;

    // Check if valid number
    if (isNaN(parsed) || !isFinite(parsed)) {
      result.valid = false;
      result.errors.push('Invalid number');
      return result;
    }

    // Check negative
    if (!allowNegative && parsed < 0) {
      result.valid = false;
      result.errors.push('Negative amounts not allowed');
    }

    // Check zero
    if (!allowZero && parsed === 0) {
      result.valid = false;
      result.errors.push('Zero amount not allowed');
    }

    // Check range
    if (min !== null && parsed < min) {
      result.valid = false;
      result.errors.push(`Amount must be at least ${this.format(min, currency)}`);
    }

    if (max !== null && parsed > max) {
      result.valid = false;
      result.errors.push(`Amount must not exceed ${this.format(max, currency)}`);
    }

    // Check decimals
    if (maxDecimals !== null) {
      const decimalPart = parsed.toString().split('.')[1];
      if (decimalPart && decimalPart.length > maxDecimals) {
        result.warnings.push(`Amount has more than ${maxDecimals} decimal places`);
      }
    }

    // Currency-specific validation
    if (currency) {
      const currencyInfo = this.getCurrencyInfo(currency);
      if (currencyInfo) {
        const expectedDecimals = currencyInfo.decimals;
        const actualDecimals = (parsed.toString().split('.')[1] || '').length;

        if (actualDecimals > expectedDecimals) {
          result.warnings.push(`${currency} typically uses ${expectedDecimals} decimal places`);
        }
      }
    }

    return result;
  }

  /**
   * Format number with currency info
   * @private
   * @param {number} amount - Amount to format
   * @param {Object} currencyInfo - Currency information
   * @param {number} decimals - Decimal places
   * @returns {string} Formatted number
   */
  _formatNumber(amount, currencyInfo, decimals) {
    const parts = amount.toFixed(decimals).split('.');
    const integerPart = parts[0];
    const decimalPart = parts[1];

    // Add thousands separators
    const formattedInteger = integerPart.replace(
      /\B(?=(\d{3})+(?!\d))/g,
      currencyInfo.separator
    );

    // Combine with decimal part
    if (decimals > 0 && decimalPart) {
      return formattedInteger + currencyInfo.decimal + decimalPart;
    }

    return formattedInteger;
  }

  /**
   * Format compact number
   * @private
   * @param {number} amount - Amount to format
   * @param {string} locale - Locale
   * @returns {string} Compact formatted number
   */
  _formatCompact(amount, locale) {
    const abbreviations = {
      'en': { 1000: 'K', 1000000: 'M', 1000000000: 'B', 1000000000000: 'T' },
      'default': { 1000: 'K', 1000000: 'M', 1000000000: 'B', 1000000000000: 'T' }
    };

    const abbr = abbreviations[locale.split('-')[0]] || abbreviations.default;

    for (const [threshold, suffix] of Object.entries(abbr).reverse()) {
      const thresholdNum = parseInt(threshold);
      if (Math.abs(amount) >= thresholdNum) {
        const scaled = amount / thresholdNum;
        const decimals = scaled < 10 ? 1 : 0;
        return scaled.toFixed(decimals) + suffix;
      }
    }

    return amount.toString();
  }

  /**
   * Apply rounding
   * @private
   * @param {number} amount - Amount to round
   * @param {number} decimals - Decimal places
   * @param {string} mode - Rounding mode
   * @returns {number} Rounded amount
   */
  _applyRounding(amount, decimals, mode) {
    const factor = Math.pow(10, decimals);

    switch (mode) {
      case 'ceil':
        return Math.ceil(amount * factor) / factor;
      case 'floor':
        return Math.floor(amount * factor) / factor;
      case 'round':
      default:
        return Math.round(amount * factor) / factor;
    }
  }

  /**
   * Handle special values
   * @private
   * @param {any} value - Value to handle
   * @param {Object} currencyInfo - Currency information
   * @param {Object} options - Formatting options
   * @returns {string} Formatted special value
   */
  _handleSpecialValue(value, currencyInfo, options) {
    if (value === null || value === undefined) {
      return options.placeholder || '-';
    }
    if (isNaN(value)) {
      return options.errorText || 'Invalid';
    }
    if (!isFinite(value)) {
      return value > 0 ? '∞' : '-∞';
    }
    return '';
  }

  /**
   * Escape regex special characters
   * @private
   * @param {string} str - String to escape
   * @returns {string} Escaped string
   */
  _escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Get mock exchange rate
   * @private
   * @param {string} from - Source currency
   * @param {string} to - Target currency
   * @returns {number} Mock exchange rate
   */
  _getMockExchangeRate(from, to) {
    // Mock exchange rates for demo (in production, use real API)
    const rates = {
      'USD': 1,
      'EUR': 0.85,
      'GBP': 0.73,
      'JPY': 110.0,
      'CNY': 6.45,
      'INR': 74.5,
      'CAD': 1.25,
      'AUD': 1.35,
      'CHF': 0.92,
      'SEK': 8.5,
      'NOK': 8.3,
      'DKK': 6.3,
      'BTC': 0.000025,
      'ETH': 0.00035
    };

    const fromRate = rates[from] || 1;
    const toRate = rates[to] || 1;

    return toRate / fromRate;
  }

  /**
   * Clear all caches
   */
  clearCache() {
    this.exchangeRates.clear();
    this.formatCache.clear();
    this.formatters.clear();
  }

  /**
   * Get statistics
   * @returns {Object} Formatter statistics
   */
  getStatistics() {
    return {
      supportedCurrencies: Object.keys(this.currencies).length,
      cachedExchangeRates: this.exchangeRates.size,
      cachedFormatters: this.formatters.size,
      supportedLocales: Object.keys(this.localeCurrencyMap).length
    };
  }

  /**
   * Create singleton instance
   * @static
   * @param {Object} [config={}] - Configuration
   * @returns {CurrencyFormatter} Singleton instance
   */
  static getInstance(config = {}) {
    if (!CurrencyFormatter.instance) {
      CurrencyFormatter.instance = new CurrencyFormatter(config);
    }
    return CurrencyFormatter.instance;
  }
}

// Export the class
module.exports = CurrencyFormatter;
