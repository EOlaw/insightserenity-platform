'use strict';

/**
 * @fileoverview Date manipulation and formatting utilities
 * @module shared/lib/utils/helpers/date-helper
 */

/**
 * @class DateHelper
 * @description Comprehensive date manipulation utilities for the platform
 */
class DateHelper {
  /**
   * Format date to ISO string
   * @static
   * @param {Date|string|number} date - Date to format
   * @returns {string} ISO formatted date string
   */
  static toISO(date) {
    return new Date(date).toISOString();
  }

  /**
   * Format date to specific format
   * @static
   * @param {Date|string|number} date - Date to format
   * @param {string} format - Format string (YYYY-MM-DD, MM/DD/YYYY, etc.)
   * @returns {string} Formatted date string
   */
  static format(date, format = 'YYYY-MM-DD') {
    const d = new Date(date);
    
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    
    return format
      .replace('YYYY', year)
      .replace('YY', String(year).slice(-2))
      .replace('MM', month)
      .replace('DD', day)
      .replace('HH', hours)
      .replace('mm', minutes)
      .replace('ss', seconds);
  }

  /**
   * Get relative time string (e.g., "2 hours ago")
   * @static
   * @param {Date|string|number} date - Date to compare
   * @param {Date|string|number} [baseDate=Date.now()] - Base date for comparison
   * @returns {string} Relative time string
   */
  static getRelativeTime(date, baseDate = Date.now()) {
    const d = new Date(date);
    const base = new Date(baseDate);
    const diffMs = base - d;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);
    const diffWeek = Math.floor(diffDay / 7);
    const diffMonth = Math.floor(diffDay / 30);
    const diffYear = Math.floor(diffDay / 365);

    if (diffMs < 0) {
      return 'in the future';
    } else if (diffSec < 60) {
      return 'just now';
    } else if (diffMin < 60) {
      return `${diffMin} minute${diffMin > 1 ? 's' : ''} ago`;
    } else if (diffHour < 24) {
      return `${diffHour} hour${diffHour > 1 ? 's' : ''} ago`;
    } else if (diffDay < 7) {
      return `${diffDay} day${diffDay > 1 ? 's' : ''} ago`;
    } else if (diffWeek < 4) {
      return `${diffWeek} week${diffWeek > 1 ? 's' : ''} ago`;
    } else if (diffMonth < 12) {
      return `${diffMonth} month${diffMonth > 1 ? 's' : ''} ago`;
    } else {
      return `${diffYear} year${diffYear > 1 ? 's' : ''} ago`;
    }
  }

  /**
   * Add time to date
   * @static
   * @param {Date|string|number} date - Base date
   * @param {number} amount - Amount to add
   * @param {string} unit - Unit (days, hours, minutes, etc.)
   * @returns {Date} New date
   */
  static add(date, amount, unit = 'days') {
    const d = new Date(date);
    
    switch (unit) {
      case 'years':
        d.setFullYear(d.getFullYear() + amount);
        break;
      case 'months':
        d.setMonth(d.getMonth() + amount);
        break;
      case 'weeks':
        d.setDate(d.getDate() + (amount * 7));
        break;
      case 'days':
        d.setDate(d.getDate() + amount);
        break;
      case 'hours':
        d.setHours(d.getHours() + amount);
        break;
      case 'minutes':
        d.setMinutes(d.getMinutes() + amount);
        break;
      case 'seconds':
        d.setSeconds(d.getSeconds() + amount);
        break;
      case 'milliseconds':
        d.setMilliseconds(d.getMilliseconds() + amount);
        break;
      default:
        throw new Error(`Invalid unit: ${unit}`);
    }
    
    return d;
  }

  /**
   * Subtract time from date
   * @static
   * @param {Date|string|number} date - Base date
   * @param {number} amount - Amount to subtract
   * @param {string} unit - Unit (days, hours, minutes, etc.)
   * @returns {Date} New date
   */
  static subtract(date, amount, unit = 'days') {
    return this.add(date, -amount, unit);
  }

  /**
   * Get difference between two dates
   * @static
   * @param {Date|string|number} date1 - First date
   * @param {Date|string|number} date2 - Second date
   * @param {string} unit - Unit for result (days, hours, minutes, etc.)
   * @returns {number} Difference in specified unit
   */
  static diff(date1, date2, unit = 'days') {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    const diffMs = Math.abs(d2 - d1);
    
    switch (unit) {
      case 'years':
        return diffMs / (365.25 * 24 * 60 * 60 * 1000);
      case 'months':
        return diffMs / (30 * 24 * 60 * 60 * 1000);
      case 'weeks':
        return diffMs / (7 * 24 * 60 * 60 * 1000);
      case 'days':
        return diffMs / (24 * 60 * 60 * 1000);
      case 'hours':
        return diffMs / (60 * 60 * 1000);
      case 'minutes':
        return diffMs / (60 * 1000);
      case 'seconds':
        return diffMs / 1000;
      case 'milliseconds':
        return diffMs;
      default:
        throw new Error(`Invalid unit: ${unit}`);
    }
  }

  /**
   * Check if date is valid
   * @static
   * @param {any} date - Date to validate
   * @returns {boolean} True if valid date
   */
  static isValid(date) {
    const d = new Date(date);
    return d instanceof Date && !isNaN(d.getTime());
  }

  /**
   * Check if date is in the past
   * @static
   * @param {Date|string|number} date - Date to check
   * @param {Date|string|number} [baseDate=Date.now()] - Base date for comparison
   * @returns {boolean} True if date is in the past
   */
  static isPast(date, baseDate = Date.now()) {
    return new Date(date) < new Date(baseDate);
  }

  /**
   * Check if date is in the future
   * @static
   * @param {Date|string|number} date - Date to check
   * @param {Date|string|number} [baseDate=Date.now()] - Base date for comparison
   * @returns {boolean} True if date is in the future
   */
  static isFuture(date, baseDate = Date.now()) {
    return new Date(date) > new Date(baseDate);
  }

  /**
   * Check if date is today
   * @static
   * @param {Date|string|number} date - Date to check
   * @returns {boolean} True if date is today
   */
  static isToday(date) {
    const d = new Date(date);
    const today = new Date();
    return d.toDateString() === today.toDateString();
  }

  /**
   * Check if date is between two dates
   * @static
   * @param {Date|string|number} date - Date to check
   * @param {Date|string|number} start - Start date
   * @param {Date|string|number} end - End date
   * @returns {boolean} True if date is between start and end
   */
  static isBetween(date, start, end) {
    const d = new Date(date);
    const s = new Date(start);
    const e = new Date(end);
    return d >= s && d <= e;
  }

  /**
   * Get start of day
   * @static
   * @param {Date|string|number} date - Date
   * @returns {Date} Start of day
   */
  static startOfDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  /**
   * Get end of day
   * @static
   * @param {Date|string|number} date - Date
   * @returns {Date} End of day
   */
  static endOfDay(date) {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
  }

  /**
   * Get start of week
   * @static
   * @param {Date|string|number} date - Date
   * @param {number} [startDay=0] - Start day of week (0 = Sunday)
   * @returns {Date} Start of week
   */
  static startOfWeek(date, startDay = 0) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = day >= startDay ? day - startDay : 6 - startDay + day + 1;
    d.setDate(d.getDate() - diff);
    return this.startOfDay(d);
  }

  /**
   * Get end of week
   * @static
   * @param {Date|string|number} date - Date
   * @param {number} [startDay=0] - Start day of week (0 = Sunday)
   * @returns {Date} End of week
   */
  static endOfWeek(date, startDay = 0) {
    const d = this.startOfWeek(date, startDay);
    d.setDate(d.getDate() + 6);
    return this.endOfDay(d);
  }

  /**
   * Get start of month
   * @static
   * @param {Date|string|number} date - Date
   * @returns {Date} Start of month
   */
  static startOfMonth(date) {
    const d = new Date(date);
    d.setDate(1);
    return this.startOfDay(d);
  }

  /**
   * Get end of month
   * @static
   * @param {Date|string|number} date - Date
   * @returns {Date} End of month
   */
  static endOfMonth(date) {
    const d = new Date(date);
    d.setMonth(d.getMonth() + 1, 0);
    return this.endOfDay(d);
  }

  /**
   * Get business days between two dates
   * @static
   * @param {Date|string|number} start - Start date
   * @param {Date|string|number} end - End date
   * @returns {number} Number of business days
   */
  static getBusinessDays(start, end) {
    const s = new Date(start);
    const e = new Date(end);
    let count = 0;
    
    const current = new Date(s);
    while (current <= e) {
      const dayOfWeek = current.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        count++;
      }
      current.setDate(current.getDate() + 1);
    }
    
    return count;
  }

  /**
   * Add business days to date
   * @static
   * @param {Date|string|number} date - Base date
   * @param {number} days - Number of business days to add
   * @returns {Date} New date
   */
  static addBusinessDays(date, days) {
    const d = new Date(date);
    let count = 0;
    
    while (count < days) {
      d.setDate(d.getDate() + 1);
      const dayOfWeek = d.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        count++;
      }
    }
    
    return d;
  }

  /**
   * Parse duration string (e.g., "2h", "30m", "1d")
   * @static
   * @param {string} duration - Duration string
   * @returns {number} Duration in milliseconds
   */
  static parseDuration(duration) {
    const match = duration.match(/^(\d+)([smhdwMy])$/);
    if (!match) {
      throw new Error(`Invalid duration format: ${duration}`);
    }
    
    const [, amount, unit] = match;
    const num = parseInt(amount, 10);
    
    switch (unit) {
      case 's': return num * 1000;
      case 'm': return num * 60 * 1000;
      case 'h': return num * 60 * 60 * 1000;
      case 'd': return num * 24 * 60 * 60 * 1000;
      case 'w': return num * 7 * 24 * 60 * 60 * 1000;
      case 'M': return num * 30 * 24 * 60 * 60 * 1000;
      case 'y': return num * 365 * 24 * 60 * 60 * 1000;
      default: throw new Error(`Invalid duration unit: ${unit}`);
    }
  }

  /**
   * Get timezone offset
   * @static
   * @param {Date|string|number} date - Date
   * @returns {string} Timezone offset string (e.g., "+05:30")
   */
  static getTimezoneOffset(date) {
    const d = new Date(date);
    const offset = -d.getTimezoneOffset();
    const hours = Math.floor(Math.abs(offset) / 60);
    const minutes = Math.abs(offset) % 60;
    const sign = offset >= 0 ? '+' : '-';
    
    return `${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  /**
   * Convert date to Unix timestamp
   * @static
   * @param {Date|string|number} date - Date
   * @returns {number} Unix timestamp
   */
  static toUnixTimestamp(date) {
    return Math.floor(new Date(date).getTime() / 1000);
  }

  /**
   * Convert Unix timestamp to date
   * @static
   * @param {number} timestamp - Unix timestamp
   * @returns {Date} Date object
   */
  static fromUnixTimestamp(timestamp) {
    return new Date(timestamp * 1000);
  }
}

module.exports = DateHelper;