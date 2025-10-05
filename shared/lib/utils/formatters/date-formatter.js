'use strict';

const AppError = require('../app-error');

class DateFormatter {
    static #FORMATS = {
        ISO: 'YYYY-MM-DDTHH:mm:ss.sssZ',
        DATE_ONLY: 'YYYY-MM-DD',
        TIME_ONLY: 'HH:mm:ss',
        DATETIME: 'YYYY-MM-DD HH:mm:ss',
        HUMAN_READABLE: 'MMM DD, YYYY',
        FULL_DATE: 'MMMM DD, YYYY',
        SHORT_DATE: 'MM/DD/YYYY'
    };

    static format(date, format = 'ISO', timezone = 'UTC') {
        try {
            const dateObj = this.#parseDate(date);
            if (!dateObj) {
                throw new AppError('Invalid date provided', 400, 'INVALID_DATE');
            }

            switch (format) {
                case 'ISO':
                    return dateObj.toISOString();
                case 'DATE_ONLY':
                    return dateObj.toISOString().split('T')[0];
                case 'TIME_ONLY':
                    return dateObj.toTimeString().split(' ')[0];
                case 'DATETIME':
                    return dateObj.toISOString().replace('T', ' ').split('.')[0];
                case 'HUMAN_READABLE':
                    return dateObj.toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: '2-digit'
                    });
                case 'FULL_DATE':
                    return dateObj.toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: '2-digit'
                    });
                case 'SHORT_DATE':
                    return dateObj.toLocaleDateString('en-US');
                default:
                    throw new AppError(`Unsupported format: ${format}`, 400, 'INVALID_FORMAT');
            }
        } catch (error) {
            if (error instanceof AppError) throw error;
            throw new AppError('Date formatting failed', 500, 'FORMAT_ERROR');
        }
    }

    static #parseDate(date) {
        if (date instanceof Date) return date;
        if (typeof date === 'string' || typeof date === 'number') {
            const parsed = new Date(date);
            return isNaN(parsed.getTime()) ? null : parsed;
        }
        return null;
    }

    static isValid(date) {
        const parsed = this.#parseDate(date);
        return parsed !== null;
    }

    static toAge(birthDate) {
        const birth = this.#parseDate(birthDate);
        if (!birth) throw new AppError('Invalid birth date', 400, 'INVALID_DATE');

        const today = new Date();
        let age = today.getFullYear() - birth.getFullYear();
        const monthDiff = today.getMonth() - birth.getMonth();

        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
            age--;
        }

        return age;
    }

    static timeAgo(date) {
        const dateObj = this.#parseDate(date);
        if (!dateObj) throw new AppError('Invalid date', 400, 'INVALID_DATE');

        const now = new Date();
        const diffMs = now - dateObj;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 1) return 'just now';
        if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
        if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
        if (diffDays < 30) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;

        return this.format(dateObj, 'HUMAN_READABLE');
    }

    static addDays(date, days) {
        const dateObj = this.#parseDate(date);
        if (!dateObj) throw new AppError('Invalid date', 400, 'INVALID_DATE');

        const result = new Date(dateObj);
        result.setDate(result.getDate() + days);
        return result;
    }

    static startOfDay(date) {
        const dateObj = this.#parseDate(date);
        if (!dateObj) throw new AppError('Invalid date', 400, 'INVALID_DATE');

        const result = new Date(dateObj);
        result.setHours(0, 0, 0, 0);
        return result;
    }

    static endOfDay(date) {
        const dateObj = this.#parseDate(date);
        if (!dateObj) throw new AppError('Invalid date', 400, 'INVALID_DATE');

        const result = new Date(dateObj);
        result.setHours(23, 59, 59, 999);
        return result;
    }

    static isBetween(date, start, end) {
        const dateObj = this.#parseDate(date);
        const startObj = this.#parseDate(start);
        const endObj = this.#parseDate(end);

        if (!dateObj || !startObj || !endObj) {
            throw new AppError('Invalid date parameters', 400, 'INVALID_DATE');
        }

        return dateObj >= startObj && dateObj <= endObj;
    }

    static formatDuration(milliseconds) {
        if (typeof milliseconds !== 'number' || milliseconds < 0) {
            throw new AppError('Duration must be a non-negative number', 400, 'INVALID_DURATION');
        }

        const seconds = Math.floor(milliseconds / 1000) % 60;
        const minutes = Math.floor(milliseconds / (1000 * 60)) % 60;
        const hours = Math.floor(milliseconds / (1000 * 60 * 60)) % 24;
        const days = Math.floor(milliseconds / (1000 * 60 * 60 * 24));

        const parts = [];
        if (days > 0) parts.push(`${days}d`);
        if (hours > 0) parts.push(`${hours}h`);
        if (minutes > 0) parts.push(`${minutes}m`);
        if (seconds > 0) parts.push(`${seconds}s`);

        return parts.length > 0 ? parts.join(' ') : '0s';
    }
}

module.exports = DateFormatter;
