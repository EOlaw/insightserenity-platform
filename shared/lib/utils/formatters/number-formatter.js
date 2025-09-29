'use strict';

const AppError = require('../app-error');

class NumberFormatter {
    static format(number, options = {}) {
        const {
            decimals = 2,
            locale = 'en-US',
            useGrouping = true,
            style = 'decimal'
        } = options;

        if (typeof number !== 'number') {
            throw new AppError('Input must be a number', 400, 'INVALID_INPUT');
        }

        try {
            return new Intl.NumberFormat(locale, {
                style: style,
                minimumFractionDigits: decimals,
                maximumFractionDigits: decimals,
                useGrouping: useGrouping
            }).format(number);
        } catch (error) {
            throw new AppError('Number formatting failed', 500, 'FORMAT_ERROR');
        }
    }

    static formatPercent(number, options = {}) {
        const { decimals = 1, locale = 'en-US' } = options;

        if (typeof number !== 'number') {
            throw new AppError('Input must be a number', 400, 'INVALID_INPUT');
        }

        try {
            return new Intl.NumberFormat(locale, {
                style: 'percent',
                minimumFractionDigits: decimals,
                maximumFractionDigits: decimals
            }).format(number);
        } catch (error) {
            throw new AppError('Percentage formatting failed', 500, 'FORMAT_ERROR');
        }
    }

    static formatCompact(number, options = {}) {
        const { locale = 'en-US', notation = 'compact' } = options;

        if (typeof number !== 'number') {
            throw new AppError('Input must be a number', 400, 'INVALID_INPUT');
        }

        try {
            return new Intl.NumberFormat(locale, {
                notation: notation,
                compactDisplay: 'short'
            }).format(number);
        } catch (error) {
            return this.format(number, options);
        }
    }

    static formatOrdinal(number, locale = 'en-US') {
        if (typeof number !== 'number' || !Number.isInteger(number)) {
            throw new AppError('Input must be an integer', 400, 'INVALID_INPUT');
        }

        try {
            return new Intl.NumberFormat(locale, {
                style: 'ordinal'
            }).format(number);
        } catch (error) {
            // Fallback for browsers that don't support ordinal
            const suffixes = ['th', 'st', 'nd', 'rd'];
            const v = number % 100;
            return number + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
        }
    }

    static formatBytes(bytes, options = {}) {
        const { decimals = 2, binary = false } = options;

        if (typeof bytes !== 'number' || bytes < 0) {
            throw new AppError('Bytes must be a non-negative number', 400, 'INVALID_INPUT');
        }

        if (bytes === 0) return '0 Bytes';

        const k = binary ? 1024 : 1000;
        const sizes = binary
            ? ['Bytes', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB']
            : ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];

        const i = Math.floor(Math.log(bytes) / Math.log(k));
        const value = bytes / Math.pow(k, i);

        return `${this.format(value, { decimals })} ${sizes[i]}`;
    }

    static formatFileSize(bytes, options = {}) {
        return this.formatBytes(bytes, { binary: true, ...options });
    }

    static formatPhoneNumber(number, format = 'US') {
        if (typeof number !== 'string' && typeof number !== 'number') {
            throw new AppError('Phone number must be a string or number', 400, 'INVALID_INPUT');
        }

        const digits = number.toString().replace(/\D/g, '');

        switch (format) {
            case 'US':
                if (digits.length === 10) {
                    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
                } else if (digits.length === 11 && digits.startsWith('1')) {
                    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
                }
                break;
            case 'INTERNATIONAL':
                return `+${digits}`;
            default:
                return digits;
        }

        return digits;
    }

    static formatRange(min, max, options = {}) {
        if (typeof min !== 'number' || typeof max !== 'number') {
            throw new AppError('Both min and max must be numbers', 400, 'INVALID_INPUT');
        }

        const formattedMin = this.format(min, options);
        const formattedMax = this.format(max, options);

        return `${formattedMin} - ${formattedMax}`;
    }

    static roundToDecimal(number, decimals = 2) {
        if (typeof number !== 'number') {
            throw new AppError('Input must be a number', 400, 'INVALID_INPUT');
        }

        return Math.round(number * Math.pow(10, decimals)) / Math.pow(10, decimals);
    }

    static clamp(number, min, max) {
        if (typeof number !== 'number' || typeof min !== 'number' || typeof max !== 'number') {
            throw new AppError('All inputs must be numbers', 400, 'INVALID_INPUT');
        }

        return Math.min(Math.max(number, min), max);
    }

    static isInRange(number, min, max, inclusive = true) {
        if (typeof number !== 'number' || typeof min !== 'number' || typeof max !== 'number') {
            throw new AppError('All inputs must be numbers', 400, 'INVALID_INPUT');
        }

        return inclusive
            ? number >= min && number <= max
            : number > min && number < max;
    }

    static randomBetween(min, max, decimals = 0) {
        if (typeof min !== 'number' || typeof max !== 'number') {
            throw new AppError('Min and max must be numbers', 400, 'INVALID_INPUT');
        }

        const random = Math.random() * (max - min) + min;
        return decimals > 0 ? this.roundToDecimal(random, decimals) : Math.floor(random);
    }
}

module.exports = NumberFormatter;
