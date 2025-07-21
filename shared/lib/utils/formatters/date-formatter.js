'use strict';

/**
 * @fileoverview Comprehensive date formatting utility with internationalization support
 * @module shared/lib/utils/formatters/date-formatter
 * @requires module:shared/lib/utils/helpers/date-helper
 * @requires module:shared/lib/utils/constants/error-codes
 */

const DateHelper = require('../helpers/date-helper');
const { VALIDATION_ERRORS } = require('../constants/error-codes');

/**
 * @class DateFormatter
 * @description Provides comprehensive date formatting methods with locale support and various output formats
 */
class DateFormatter {
  /**
   * @private
   * @static
   * @readonly
   */
  static #DEFAULT_LOCALE = 'en-US';
  static #DEFAULT_TIMEZONE = 'UTC';
  
  static #FORMAT_PRESETS = {
    ISO: 'ISO',
    ISO_DATE: 'ISO_DATE',
    ISO_TIME: 'ISO_TIME',
    SHORT_DATE: 'SHORT_DATE',
    LONG_DATE: 'LONG_DATE',
    SHORT_DATETIME: 'SHORT_DATETIME',
    LONG_DATETIME: 'LONG_DATETIME',
    RELATIVE: 'RELATIVE',
    CALENDAR: 'CALENDAR',
    CUSTOM: 'CUSTOM'
  };

  static #RELATIVE_TIME_UNITS = [
    { unit: 'year', ms: 365 * 24 * 60 * 60 * 1000 },
    { unit: 'month', ms: 30 * 24 * 60 * 60 * 1000 },
    { unit: 'week', ms: 7 * 24 * 60 * 60 * 1000 },
    { unit: 'day', ms: 24 * 60 * 60 * 1000 },
    { unit: 'hour', ms: 60 * 60 * 1000 },
    { unit: 'minute', ms: 60 * 1000 },
    { unit: 'second', ms: 1000 }
  ];

  static #CALENDAR_FORMATS = {
    TODAY: 'Today',
    YESTERDAY: 'Yesterday',
    TOMORROW: 'Tomorrow',
    THIS_WEEK: 'This',
    LAST_WEEK: 'Last',
    NEXT_WEEK: 'Next'
  };

  /**
   * Formats date to ISO 8601 string
   * @static
   * @param {Date|string|number} date - Date to format
   * @param {Object} [options={}] - Formatting options
   * @param {boolean} [options.includeTime=true] - Include time component
   * @param {boolean} [options.includeMilliseconds=false] - Include milliseconds
   * @param {string} [options.timezone] - Target timezone
   * @returns {string|null} Formatted date string or null if invalid
   */
  static toISO(date, options = {}) {
    if (!date) return null;
    
    try {
      const dateObj = this.#parseDate(date);
      if (!dateObj) return null;
      
      const { 
        includeTime = true, 
        includeMilliseconds = false,
        timezone 
      } = options;
      
      let isoString = dateObj.toISOString();
      
      if (!includeTime) {
        isoString = isoString.split('T')[0];
      } else if (!includeMilliseconds) {
        isoString = isoString.replace(/\.\d{3}Z$/, 'Z');
      }
      
      if (timezone && timezone !== 'UTC') {
        return this.#convertTimezone(dateObj, timezone, 'ISO');
      }
      
      return isoString;
    } catch (error) {
      console.error('DateFormatter.toISO error:', error);
      return null;
    }
  }

  /**
   * Formats date using locale-specific formatting
   * @static
   * @param {Date|string|number} date - Date to format
   * @param {string} format - Format preset or custom format
   * @param {Object} [options={}] - Formatting options
   * @param {string} [options.locale] - Locale for formatting
   * @param {string} [options.timezone] - Target timezone
   * @param {Object} [options.customFormat] - Custom format options for Intl.DateTimeFormat
   * @returns {string|null} Formatted date string or null if invalid
   */
  static format(date, format, options = {}) {
    if (!date) return null;
    
    try {
      const dateObj = this.#parseDate(date);
      if (!dateObj) return null;
      
      const {
        locale = this.#DEFAULT_LOCALE,
        timezone = this.#DEFAULT_TIMEZONE,
        customFormat = {}
      } = options;
      
      switch (format) {
        case this.#FORMAT_PRESETS.ISO:
          return this.toISO(dateObj, options);
          
        case this.#FORMAT_PRESETS.ISO_DATE:
          return this.toISO(dateObj, { ...options, includeTime: false });
          
        case this.#FORMAT_PRESETS.ISO_TIME:
          return this.#formatTime(dateObj, locale, timezone);
          
        case this.#FORMAT_PRESETS.SHORT_DATE:
          return this.#formatWithOptions(dateObj, locale, timezone, {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
          });
          
        case this.#FORMAT_PRESETS.LONG_DATE:
          return this.#formatWithOptions(dateObj, locale, timezone, {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          });
          
        case this.#FORMAT_PRESETS.SHORT_DATETIME:
          return this.#formatWithOptions(dateObj, locale, timezone, {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
          });
          
        case this.#FORMAT_PRESETS.LONG_DATETIME:
          return this.#formatWithOptions(dateObj, locale, timezone, {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            timeZoneName: 'short'
          });
          
        case this.#FORMAT_PRESETS.RELATIVE:
          return this.toRelative(dateObj, options);
          
        case this.#FORMAT_PRESETS.CALENDAR:
          return this.toCalendar(dateObj, options);
          
        case this.#FORMAT_PRESETS.CUSTOM:
          return this.#formatWithOptions(dateObj, locale, timezone, customFormat);
          
        default:
          // Treat as custom format string
          return this.#formatCustom(dateObj, format, locale, timezone);
      }
    } catch (error) {
      console.error('DateFormatter.format error:', error);
      return null;
    }
  }

  /**
   * Formats date as relative time (e.g., "2 hours ago", "in 3 days")
   * @static
   * @param {Date|string|number} date - Date to format
   * @param {Object} [options={}] - Formatting options
   * @param {Date|string|number} [options.relativeTo=new Date()] - Reference date
   * @param {string} [options.locale] - Locale for formatting
   * @param {boolean} [options.numeric='auto'] - Always use numeric format
   * @returns {string|null} Relative time string or null if invalid
   */
  static toRelative(date, options = {}) {
    if (!date) return null;
    
    try {
      const dateObj = this.#parseDate(date);
      if (!dateObj) return null;
      
      const {
        relativeTo = new Date(),
        locale = this.#DEFAULT_LOCALE,
        numeric = 'auto'
      } = options;
      
      const relativeDate = this.#parseDate(relativeTo);
      if (!relativeDate) return null;
      
      // Use Intl.RelativeTimeFormat if available
      if (typeof Intl !== 'undefined' && Intl.RelativeTimeFormat) {
        const rtf = new Intl.RelativeTimeFormat(locale, { numeric });
        const diffMs = dateObj.getTime() - relativeDate.getTime();
        
        // Find appropriate unit
        for (const { unit, ms } of this.#RELATIVE_TIME_UNITS) {
          const diff = Math.round(diffMs / ms);
          if (Math.abs(diff) >= 1 || unit === 'second') {
            return rtf.format(diff, unit);
          }
        }
      }
      
      // Fallback for older environments
      return this.#formatRelativeFallback(dateObj, relativeDate);
    } catch (error) {
      console.error('DateFormatter.toRelative error:', error);
      return null;
    }
  }

  /**
   * Formats date as calendar time (e.g., "Today at 3:30 PM", "Last Monday")
   * @static
   * @param {Date|string|number} date - Date to format
   * @param {Object} [options={}] - Formatting options
   * @param {string} [options.locale] - Locale for formatting
   * @param {boolean} [options.includeTime=true] - Include time in output
   * @param {string} [options.timezone] - Target timezone
   * @returns {string|null} Calendar format string or null if invalid
   */
  static toCalendar(date, options = {}) {
    if (!date) return null;
    
    try {
      const dateObj = this.#parseDate(date);
      if (!dateObj) return null;
      
      const {
        locale = this.#DEFAULT_LOCALE,
        includeTime = true,
        timezone = this.#DEFAULT_TIMEZONE
      } = options;
      
      const now = new Date();
      const daysDiff = DateHelper.daysBetween(now, dateObj);
      const weeksDiff = Math.floor(daysDiff / 7);
      
      let calendarPart = '';
      
      // Determine calendar part
      if (daysDiff === 0) {
        calendarPart = this.#CALENDAR_FORMATS.TODAY;
      } else if (daysDiff === -1) {
        calendarPart = this.#CALENDAR_FORMATS.YESTERDAY;
      } else if (daysDiff === 1) {
        calendarPart = this.#CALENDAR_FORMATS.TOMORROW;
      } else if (daysDiff > 0 && daysDiff < 7) {
        calendarPart = this.#formatWithOptions(dateObj, locale, timezone, { weekday: 'long' });
      } else if (daysDiff < 0 && daysDiff > -7) {
        calendarPart = 'Last ' + this.#formatWithOptions(dateObj, locale, timezone, { weekday: 'long' });
      } else if (weeksDiff === 1) {
        calendarPart = 'Next ' + this.#formatWithOptions(dateObj, locale, timezone, { weekday: 'long' });
      } else if (weeksDiff === -1) {
        calendarPart = 'Last ' + this.#formatWithOptions(dateObj, locale, timezone, { weekday: 'long' });
      } else {
        // Fall back to date format
        calendarPart = this.#formatWithOptions(dateObj, locale, timezone, {
          month: 'long',
          day: 'numeric',
          year: daysDiff > 365 || daysDiff < -365 ? 'numeric' : undefined
        });
      }
      
      // Add time if requested
      if (includeTime) {
        const timePart = this.#formatWithOptions(dateObj, locale, timezone, {
          hour: 'numeric',
          minute: '2-digit'
        });
        return `${calendarPart} at ${timePart}`;
      }
      
      return calendarPart;
    } catch (error) {
      console.error('DateFormatter.toCalendar error:', error);
      return null;
    }
  }

  /**
   * Formats duration between two dates
   * @static
   * @param {Date|string|number} startDate - Start date
   * @param {Date|string|number} endDate - End date
   * @param {Object} [options={}] - Formatting options
   * @param {string} [options.format='auto'] - Duration format (auto, short, long, parts)
   * @param {string} [options.locale] - Locale for formatting
   * @param {Array} [options.units] - Units to include in output
   * @returns {Object|string|null} Duration object or formatted string
   */
  static formatDuration(startDate, endDate, options = {}) {
    if (!startDate || !endDate) return null;
    
    try {
      const start = this.#parseDate(startDate);
      const end = this.#parseDate(endDate);
      
      if (!start || !end) return null;
      
      const {
        format = 'auto',
        locale = this.#DEFAULT_LOCALE,
        units = ['days', 'hours', 'minutes']
      } = options;
      
      const diffMs = Math.abs(end.getTime() - start.getTime());
      const duration = this.#calculateDuration(diffMs);
      
      switch (format) {
        case 'parts':
          return duration;
          
        case 'short':
          return this.#formatDurationShort(duration, units);
          
        case 'long':
          return this.#formatDurationLong(duration, units, locale);
          
        case 'auto':
        default:
          return this.#formatDurationAuto(duration, locale);
      }
    } catch (error) {
      console.error('DateFormatter.formatDuration error:', error);
      return null;
    }
  }

  /**
   * Formats date range
   * @static
   * @param {Date|string|number} startDate - Start date
   * @param {Date|string|number} endDate - End date
   * @param {Object} [options={}] - Formatting options
   * @param {string} [options.format='auto'] - Range format
   * @param {string} [options.locale] - Locale for formatting
   * @param {string} [options.separator=' - '] - Separator between dates
   * @param {boolean} [options.includeTime=false] - Include time in range
   * @returns {string|null} Formatted date range or null if invalid
   */
  static formatRange(startDate, endDate, options = {}) {
    if (!startDate || !endDate) return null;
    
    try {
      const start = this.#parseDate(startDate);
      const end = this.#parseDate(endDate);
      
      if (!start || !end) return null;
      
      const {
        format = 'auto',
        locale = this.#DEFAULT_LOCALE,
        separator = ' - ',
        includeTime = false,
        timezone = this.#DEFAULT_TIMEZONE
      } = options;
      
      // Same day range
      if (DateHelper.isSameDay(start, end)) {
        if (includeTime) {
          const date = this.#formatWithOptions(start, locale, timezone, {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          });
          const startTime = this.#formatWithOptions(start, locale, timezone, {
            hour: 'numeric',
            minute: '2-digit'
          });
          const endTime = this.#formatWithOptions(end, locale, timezone, {
            hour: 'numeric',
            minute: '2-digit'
          });
          return `${date}, ${startTime}${separator}${endTime}`;
        } else {
          return this.#formatWithOptions(start, locale, timezone, {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          });
        }
      }
      
      // Same month range
      if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
        const startDay = this.#formatWithOptions(start, locale, timezone, { day: 'numeric' });
        const endFormat = this.#formatWithOptions(end, locale, timezone, {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
        return `${startDay}${separator}${endFormat}`;
      }
      
      // Same year range
      if (start.getFullYear() === end.getFullYear()) {
        const startFormat = this.#formatWithOptions(start, locale, timezone, {
          month: 'short',
          day: 'numeric'
        });
        const endFormat = this.#formatWithOptions(end, locale, timezone, {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        });
        return `${startFormat}${separator}${endFormat}`;
      }
      
      // Different years
      const dateFormat = includeTime ? 'SHORT_DATETIME' : 'SHORT_DATE';
      const startFormat = this.format(start, dateFormat, { locale, timezone });
      const endFormat = this.format(end, dateFormat, { locale, timezone });
      return `${startFormat}${separator}${endFormat}`;
    } catch (error) {
      console.error('DateFormatter.formatRange error:', error);
      return null;
    }
  }

  /**
   * Parses date from various input types
   * @private
   * @static
   * @param {Date|string|number} input - Input to parse
   * @returns {Date|null} Parsed date or null
   */
  static #parseDate(input) {
    if (!input) return null;
    
    if (input instanceof Date) {
      return isNaN(input.getTime()) ? null : input;
    }
    
    if (typeof input === 'string') {
      // Handle ISO strings
      const date = new Date(input);
      if (!isNaN(date.getTime())) return date;
      
      // Handle other common formats
      const parsed = this.#parseCommonFormats(input);
      if (parsed) return parsed;
    }
    
    if (typeof input === 'number') {
      const date = new Date(input);
      return isNaN(date.getTime()) ? null : date;
    }
    
    return null;
  }

  /**
   * Parses common date formats
   * @private
   * @static
   * @param {string} dateString - Date string to parse
   * @returns {Date|null} Parsed date or null
   */
  static #parseCommonFormats(dateString) {
    const formats = [
      // MM/DD/YYYY or MM-DD-YYYY
      /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/,
      // YYYY/MM/DD or YYYY-MM-DD
      /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/,
      // DD/MM/YYYY or DD-MM-YYYY (European format)
      /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/
    ];
    
    for (const format of formats) {
      const match = dateString.match(format);
      if (match) {
        // Try different interpretations
        const attempts = [
          new Date(match[3], match[1] - 1, match[2]), // YYYY, MM, DD
          new Date(match[1], match[2] - 1, match[3]), // YYYY, MM, DD (alt)
          new Date(match[3], match[2] - 1, match[1])  // YYYY, DD, MM
        ];
        
        for (const date of attempts) {
          if (!isNaN(date.getTime())) return date;
        }
      }
    }
    
    return null;
  }

  /**
   * Formats date with Intl.DateTimeFormat options
   * @private
   * @static
   * @param {Date} date - Date to format
   * @param {string} locale - Locale for formatting
   * @param {string} timezone - Timezone
   * @param {Object} options - Format options
   * @returns {string} Formatted date
   */
  static #formatWithOptions(date, locale, timezone, options) {
    const formatter = new Intl.DateTimeFormat(locale, {
      ...options,
      timeZone: timezone === this.#DEFAULT_TIMEZONE ? undefined : timezone
    });
    
    return formatter.format(date);
  }

  /**
   * Formats time only
   * @private
   * @static
   * @param {Date} date - Date to format
   * @param {string} locale - Locale
   * @param {string} timezone - Timezone
   * @returns {string} Formatted time
   */
  static #formatTime(date, locale, timezone) {
    return this.#formatWithOptions(date, locale, timezone, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short'
    });
  }

  /**
   * Converts date to different timezone
   * @private
   * @static
   * @param {Date} date - Date to convert
   * @param {string} timezone - Target timezone
   * @param {string} format - Output format
   * @returns {string} Formatted date in timezone
   */
  static #convertTimezone(date, timezone, format) {
    const options = {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    };
    
    const formatter = new Intl.DateTimeFormat('en-US', options);
    const parts = formatter.formatToParts(date);
    const values = {};
    
    parts.forEach(part => {
      if (part.type !== 'literal') {
        values[part.type] = part.value;
      }
    });
    
    if (format === 'ISO') {
      return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}`;
    }
    
    return formatter.format(date);
  }

  /**
   * Formats relative time fallback
   * @private
   * @static
   * @param {Date} date - Target date
   * @param {Date} relativeTo - Reference date
   * @returns {string} Relative time string
   */
  static #formatRelativeFallback(date, relativeTo) {
    const diffMs = date.getTime() - relativeTo.getTime();
    const absMs = Math.abs(diffMs);
    const isPast = diffMs < 0;
    
    for (const { unit, ms } of this.#RELATIVE_TIME_UNITS) {
      const value = Math.floor(absMs / ms);
      if (value >= 1 || unit === 'second') {
        const plural = value !== 1 ? 's' : '';
        return isPast ? `${value} ${unit}${plural} ago` : `in ${value} ${unit}${plural}`;
      }
    }
    
    return 'just now';
  }

  /**
   * Calculates duration components
   * @private
   * @static
   * @param {number} milliseconds - Duration in milliseconds
   * @returns {Object} Duration components
   */
  static #calculateDuration(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);
    const months = Math.floor(days / 30);
    const years = Math.floor(days / 365);
    
    return {
      milliseconds: milliseconds % 1000,
      seconds: seconds % 60,
      minutes: minutes % 60,
      hours: hours % 24,
      days: days % 7,
      weeks: weeks % 4,
      months: months % 12,
      years,
      totalSeconds: seconds,
      totalMinutes: minutes,
      totalHours: hours,
      totalDays: days
    };
  }

  /**
   * Formats duration in short format
   * @private
   * @static
   * @param {Object} duration - Duration object
   * @param {Array} units - Units to include
   * @returns {string} Short format duration
   */
  static #formatDurationShort(duration, units) {
    const parts = [];
    const unitMap = {
      years: 'y',
      months: 'mo',
      weeks: 'w',
      days: 'd',
      hours: 'h',
      minutes: 'm',
      seconds: 's'
    };
    
    for (const unit of units) {
      const value = duration[unit];
      if (value > 0) {
        parts.push(`${value}${unitMap[unit]}`);
      }
    }
    
    return parts.join(' ') || '0s';
  }

  /**
   * Formats duration in long format
   * @private
   * @static
   * @param {Object} duration - Duration object
   * @param {Array} units - Units to include
   * @param {string} locale - Locale
   * @returns {string} Long format duration
   */
  static #formatDurationLong(duration, units, locale) {
    const parts = [];
    
    for (const unit of units) {
      const value = duration[unit];
      if (value > 0) {
        const plural = value !== 1 ? 's' : '';
        parts.push(`${value} ${unit.slice(0, -1)}${plural}`);
      }
    }
    
    if (parts.length === 0) return '0 seconds';
    if (parts.length === 1) return parts[0];
    
    const last = parts.pop();
    return `${parts.join(', ')} and ${last}`;
  }

  /**
   * Formats duration automatically
   * @private
   * @static
   * @param {Object} duration - Duration object
   * @param {string} locale - Locale
   * @returns {string} Auto-formatted duration
   */
  static #formatDurationAuto(duration, locale) {
    if (duration.years > 0) {
      return this.#formatDurationLong(duration, ['years', 'months'], locale);
    }
    if (duration.totalDays > 30) {
      return this.#formatDurationLong(duration, ['months', 'days'], locale);
    }
    if (duration.totalDays > 0) {
      return this.#formatDurationLong(duration, ['days', 'hours'], locale);
    }
    if (duration.totalHours > 0) {
      return this.#formatDurationLong(duration, ['hours', 'minutes'], locale);
    }
    return this.#formatDurationLong(duration, ['minutes', 'seconds'], locale);
  }

  /**
   * Formats custom date string
   * @private
   * @static
   * @param {Date} date - Date to format
   * @param {string} format - Custom format string
   * @param {string} locale - Locale
   * @param {string} timezone - Timezone
   * @returns {string} Custom formatted date
   */
  static #formatCustom(date, format, locale, timezone) {
    // Support common format tokens
    const tokens = {
      'YYYY': () => date.getFullYear(),
      'YY': () => String(date.getFullYear()).slice(-2),
      'MM': () => String(date.getMonth() + 1).padStart(2, '0'),
      'M': () => date.getMonth() + 1,
      'DD': () => String(date.getDate()).padStart(2, '0'),
      'D': () => date.getDate(),
      'HH': () => String(date.getHours()).padStart(2, '0'),
      'H': () => date.getHours(),
      'mm': () => String(date.getMinutes()).padStart(2, '0'),
      'm': () => date.getMinutes(),
      'ss': () => String(date.getSeconds()).padStart(2, '0'),
      's': () => date.getSeconds(),
      'SSS': () => String(date.getMilliseconds()).padStart(3, '0')
    };
    
    let result = format;
    
    for (const [token, getValue] of Object.entries(tokens)) {
      result = result.replace(new RegExp(token, 'g'), getValue());
    }
    
    return result;
  }

  /**
   * Gets available format presets
   * @static
   * @returns {Object} Format presets
   */
  static getFormatPresets() {
    return { ...this.#FORMAT_PRESETS };
  }

  /**
   * Validates if string is a valid date
   * @static
   * @param {string} dateString - String to validate
   * @returns {boolean} True if valid date
   */
  static isValidDate(dateString) {
    const date = this.#parseDate(dateString);
    return date !== null;
  }
}

module.exports = DateFormatter;