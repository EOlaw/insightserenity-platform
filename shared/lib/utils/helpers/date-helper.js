'use strict';

/**
 * @fileoverview Date and time manipulation utilities
 * @module shared/lib/utils/helpers/date-helper
 */

const moment = require('moment-timezone');

/**
 * @class DateHelper
 * @description Comprehensive date and time utilities
 */
class DateHelper {
  /**
   * Format date to ISO string
   * @static
   * @param {Date|string|number} date - Date to format
   * @returns {string} ISO formatted date string
   */
  static toISO(date) {
    return moment(date).toISOString();
  }

  /**
   * Format date with custom format
   * @static
   * @param {Date|string|number} date - Date to format
   * @param {string} [format='YYYY-MM-DD'] - Date format
   * @returns {string} Formatted date string
   */
  static format(date, format = 'YYYY-MM-DD') {
    return moment(date).format(format);
  }

  /**
   * Get relative time from now
   * @static
   * @param {Date|string|number} date - Date to compare
   * @returns {string} Relative time string
   */
  static fromNow(date) {
    return moment(date).fromNow();
  }

  /**
   * Get relative time to another date
   * @static
   * @param {Date|string|number} date - Date to compare
   * @param {Date|string|number} referenceDate - Reference date
   * @returns {string} Relative time string
   */
  static from(date, referenceDate) {
    return moment(date).from(referenceDate);
  }

  /**
   * Add time to date
   * @static
   * @param {Date|string|number} date - Base date
   * @param {number} amount - Amount to add
   * @param {string} [unit='days'] - Unit of time
   * @returns {Date} New date
   */
  static add(date, amount, unit = 'days') {
    return moment(date).add(amount, unit).toDate();
  }

  /**
   * Subtract time from date
   * @static
   * @param {Date|string|number} date - Base date
   * @param {number} amount - Amount to subtract
   * @param {string} [unit='days'] - Unit of time
   * @returns {Date} New date
   */
  static subtract(date, amount, unit = 'days') {
    return moment(date).subtract(amount, unit).toDate();
  }

  /**
   * Get difference between dates
   * @static
   * @param {Date|string|number} date1 - First date
   * @param {Date|string|number} date2 - Second date
   * @param {string} [unit='days'] - Unit of difference
   * @param {boolean} [precise=false] - Return precise decimal value
   * @returns {number} Difference in specified unit
   */
  static diff(date1, date2, unit = 'days', precise = false) {
    return moment(date1).diff(moment(date2), unit, precise);
  }

  /**
   * Check if date is valid
   * @static
   * @param {any} date - Date to validate
   * @returns {boolean} True if valid date
   */
  static isValid(date) {
    return moment(date).isValid();
  }

  /**
   * Check if date is before another date
   * @static
   * @param {Date|string|number} date1 - Date to check
   * @param {Date|string|number} date2 - Reference date
   * @returns {boolean} True if date1 is before date2
   */
  static isBefore(date1, date2) {
    return moment(date1).isBefore(date2);
  }

  /**
   * Check if date is after another date
   * @static
   * @param {Date|string|number} date1 - Date to check
   * @param {Date|string|number} date2 - Reference date
   * @returns {boolean} True if date1 is after date2
   */
  static isAfter(date1, date2) {
    return moment(date1).isAfter(date2);
  }

  /**
   * Check if date is between two dates
   * @static
   * @param {Date|string|number} date - Date to check
   * @param {Date|string|number} start - Start date
   * @param {Date|string|number} end - End date
   * @param {string} [inclusivity='[]'] - Inclusivity ('[]', '()', '[)', '(]')
   * @returns {boolean} True if date is between start and end
   */
  static isBetween(date, start, end, inclusivity = '[]') {
    return moment(date).isBetween(start, end, null, inclusivity);
  }

  /**
   * Check if date is same as another date
   * @static
   * @param {Date|string|number} date1 - First date
   * @param {Date|string|number} date2 - Second date
   * @param {string} [unit='day'] - Unit of comparison
   * @returns {boolean} True if dates are same
   */
  static isSame(date1, date2, unit = 'day') {
    return moment(date1).isSame(date2, unit);
  }

  /**
   * Get start of period
   * @static
   * @param {Date|string|number} date - Date
   * @param {string} [unit='day'] - Unit (day, week, month, year)
   * @returns {Date} Start of period
   */
  static startOf(date, unit = 'day') {
    return moment(date).startOf(unit).toDate();
  }

  /**
   * Get end of period
   * @static
   * @param {Date|string|number} date - Date
   * @param {string} [unit='day'] - Unit (day, week, month, year)
   * @returns {Date} End of period
   */
  static endOf(date, unit = 'day') {
    return moment(date).endOf(unit).toDate();
  }

  /**
   * Convert to timezone
   * @static
   * @param {Date|string|number} date - Date to convert
   * @param {string} timezone - Target timezone
   * @returns {Date} Date in target timezone
   */
  static toTimezone(date, timezone) {
    return moment.tz(date, timezone).toDate();
  }

  /**
   * Get current timezone
   * @static
   * @returns {string} Current timezone
   */
  static getCurrentTimezone() {
    return moment.tz.guess();
  }

  /**
   * Parse date string
   * @static
   * @param {string} dateString - Date string to parse
   * @param {string|Array<string>} [format] - Expected format(s)
   * @returns {Date|null} Parsed date or null
   */
  static parse(dateString, format = null) {
    const parsed = format
      ? moment(dateString, format)
      : moment(dateString);

    return parsed.isValid() ? parsed.toDate() : null;
  }

  /**
   * Get age from birthdate
   * @static
   * @param {Date|string|number} birthdate - Birthdate
   * @returns {number} Age in years
   */
  static getAge(birthdate) {
    return moment().diff(moment(birthdate), 'years');
  }

  /**
   * Get business days between dates
   * @static
   * @param {Date|string|number} start - Start date
   * @param {Date|string|number} end - End date
   * @returns {number} Number of business days
   */
  static businessDaysBetween(start, end) {
    const startDate = moment(start);
    const endDate = moment(end);
    let days = 0;

    while (startDate.isSameOrBefore(endDate)) {
      if (startDate.isoWeekday() !== 6 && startDate.isoWeekday() !== 7) {
        days++;
      }
      startDate.add(1, 'day');
    }

    return days;
  }

  /**
   * Add business days
   * @static
   * @param {Date|string|number} date - Start date
   * @param {number} days - Number of business days to add
   * @returns {Date} Result date
   */
  static addBusinessDays(date, days) {
    const result = moment(date);
    let daysAdded = 0;

    while (daysAdded < days) {
      result.add(1, 'day');
      if (result.isoWeekday() !== 6 && result.isoWeekday() !== 7) {
        daysAdded++;
      }
    }

    return result.toDate();
  }

  /**
   * Get quarter of year
   * @static
   * @param {Date|string|number} date - Date
   * @returns {number} Quarter (1-4)
   */
  static getQuarter(date) {
    return moment(date).quarter();
  }

  /**
   * Get week of year
   * @static
   * @param {Date|string|number} date - Date
   * @returns {number} Week number
   */
  static getWeekOfYear(date) {
    return moment(date).isoWeek();
  }

  /**
   * Get day of year
   * @static
   * @param {Date|string|number} date - Date
   * @returns {number} Day of year
   */
  static getDayOfYear(date) {
    return moment(date).dayOfYear();
  }

  /**
   * Check if leap year
   * @static
   * @param {Date|string|number|number} date - Date or year
   * @returns {boolean} True if leap year
   */
  static isLeapYear(date) {
    const year = typeof date === 'number' ? date : moment(date).year();
    return moment([year]).isLeapYear();
  }

  /**
   * Get days in month
   * @static
   * @param {Date|string|number} date - Date
   * @returns {number} Days in month
   */
  static getDaysInMonth(date) {
    return moment(date).daysInMonth();
  }

  /**
   * Get Unix timestamp
   * @static
   * @param {Date|string|number} date - Date
   * @returns {number} Unix timestamp in seconds
   */
  static toUnix(date) {
    return moment(date).unix();
  }

  /**
   * From Unix timestamp
   * @static
   * @param {number} timestamp - Unix timestamp
   * @returns {Date} Date object
   */
  static fromUnix(timestamp) {
    return moment.unix(timestamp).toDate();
  }

  /**
   * Get milliseconds timestamp
   * @static
   * @param {Date|string|number} date - Date
   * @returns {number} Milliseconds timestamp
   */
  static toMillis(date) {
    return moment(date).valueOf();
  }

  /**
   * Create date range
   * @static
   * @param {Date|string|number} start - Start date
   * @param {Date|string|number} end - End date
   * @param {string} [step='day'] - Step unit
   * @returns {Array<Date>} Array of dates
   */
  static range(start, end, step = 'day') {
    const dates = [];
    const current = moment(start);
    const endDate = moment(end);

    while (current.isSameOrBefore(endDate)) {
      dates.push(current.toDate());
      current.add(1, step);
    }

    return dates;
  }

  /**
   * Get humanized duration
   * @static
   * @param {number} milliseconds - Duration in milliseconds
   * @returns {string} Humanized duration
   */
  static humanizeDuration(milliseconds) {
    return moment.duration(milliseconds).humanize();
  }

  /**
   * Check if today
   * @static
   * @param {Date|string|number} date - Date to check
   * @returns {boolean} True if today
   */
  static isToday(date) {
    return moment(date).isSame(moment(), 'day');
  }

  /**
   * Check if yesterday
   * @static
   * @param {Date|string|number} date - Date to check
   * @returns {boolean} True if yesterday
   */
  static isYesterday(date) {
    return moment(date).isSame(moment().subtract(1, 'day'), 'day');
  }

  /**
   * Check if tomorrow
   * @static
   * @param {Date|string|number} date - Date to check
   * @returns {boolean} True if tomorrow
   */
  static isTomorrow(date) {
    return moment(date).isSame(moment().add(1, 'day'), 'day');
  }

  /**
   * Check if weekend
   * @static
   * @param {Date|string|number} date - Date to check
   * @returns {boolean} True if weekend
   */
  static isWeekend(date) {
    const day = moment(date).isoWeekday();
    return day === 6 || day === 7;
  }

  /**
   * Check if weekday
   * @static
   * @param {Date|string|number} date - Date to check
   * @returns {boolean} True if weekday
   */
  static isWeekday(date) {
    return !this.isWeekend(date);
  }

  /**
   * Get next occurrence of day
   * @static
   * @param {number} dayOfWeek - Day of week (0-6, 0=Sunday)
   * @param {Date|string|number} [fromDate] - Start date
   * @returns {Date} Next occurrence
   */
  static getNextDay(dayOfWeek, fromDate = new Date()) {
    const date = moment(fromDate);
    const currentDay = date.day();

    if (currentDay <= dayOfWeek) {
      return date.day(dayOfWeek).toDate();
    }

    return date.add(1, 'week').day(dayOfWeek).toDate();
  }

  /**
   * Format duration
   * @static
   * @param {number} milliseconds - Duration in milliseconds
   * @param {Object} [options={}] - Format options
   * @returns {string} Formatted duration
   */
  static formatDuration(milliseconds, options = {}) {
    const { units = ['hours', 'minutes', 'seconds'], separator = ' ' } = options;
    const duration = moment.duration(milliseconds);
    const parts = [];

    if (units.includes('days') && duration.days() > 0) {
      parts.push(`${duration.days()}d`);
    }
    if (units.includes('hours') && duration.hours() > 0) {
      parts.push(`${duration.hours()}h`);
    }
    if (units.includes('minutes') && duration.minutes() > 0) {
      parts.push(`${duration.minutes()}m`);
    }
    if (units.includes('seconds') && duration.seconds() > 0) {
      parts.push(`${duration.seconds()}s`);
    }

    return parts.join(separator) || '0s';
  }

  /**
   * Get calendar time
   * @static
   * @param {Date|string|number} date - Date
   * @returns {string} Calendar time string
   */
  static calendar(date) {
    return moment(date).calendar();
  }

  /**
   * Get time until
   * @static
   * @param {Date|string|number} date - Future date
   * @returns {string} Time until string
   */
  static timeUntil(date) {
    return moment(date).fromNow();
  }

  /**
   * Get time since
   * @static
   * @param {Date|string|number} date - Past date
   * @returns {string} Time since string
   */
  static timeSince(date) {
    return moment(date).fromNow();
  }

  /**
   * Check if date is in DST
   * @static
   * @param {Date|string|number} date - Date to check
   * @returns {boolean} True if in DST
   */
  static isDST(date) {
    return moment(date).isDST();
  }

  /**
   * Get timezone offset
   * @static
   * @param {Date|string|number} date - Date
   * @param {string} [timezone] - Timezone
   * @returns {number} Offset in minutes
   */
  static getTimezoneOffset(date, timezone) {
    const m = timezone ? moment.tz(date, timezone) : moment(date);
    return m.utcOffset();
  }

  /**
   * Clone date
   * @static
   * @param {Date|string|number} date - Date to clone
   * @returns {Date} Cloned date
   */
  static clone(date) {
    return moment(date).clone().toDate();
  }

  /**
   * Get all timezones
   * @static
   * @returns {Array<string>} List of timezone names
   */
  static getTimezones() {
    return moment.tz.names();
  }

  /**
   * Format for display with timezone
   * @static
   * @param {Date|string|number} date - Date
   * @param {string} timezone - Timezone
   * @param {string} [format='YYYY-MM-DD HH:mm:ss z'] - Format string
   * @returns {string} Formatted date with timezone
   */
  static formatWithTimezone(date, timezone, format = 'YYYY-MM-DD HH:mm:ss z') {
    return moment.tz(date, timezone).format(format);
  }
}

module.exports = DateHelper;
