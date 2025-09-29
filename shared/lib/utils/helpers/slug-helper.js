'use strict';

const AppError = require('../app-error');

class SlugHelper {
    static create(text, options = {}) {
        const {
            separator = '-',
            lowercase = true,
            maxLength = 50,
            preserveCase = false,
            customReplacements = {}
        } = options;

        if (typeof text !== 'string') {
            throw new AppError('Text must be a string', 400, 'INVALID_INPUT');
        }

        let slug = text.trim();

        // Apply custom replacements first
        Object.entries(customReplacements).forEach(([from, to]) => {
            slug = slug.replace(new RegExp(from, 'g'), to);
        });

        // Convert to lowercase if required
        if (lowercase && !preserveCase) {
            slug = slug.toLowerCase();
        }

        // Remove accents and special characters
        slug = slug
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '') // Remove diacritical marks
            .replace(/[^\w\s-]/g, '') // Remove special characters except word chars, spaces, hyphens
            .replace(/\s+/g, separator) // Replace spaces with separator
            .replace(new RegExp(`${separator}+`, 'g'), separator) // Replace multiple separators with single
            .replace(new RegExp(`^${separator}+|${separator}+$`, 'g'), ''); // Trim separators from start/end

        // Truncate if too long
        if (slug.length > maxLength) {
            const lastSeparatorIndex = slug.lastIndexOf(separator, maxLength);
            slug = lastSeparatorIndex > 0 ? slug.substring(0, lastSeparatorIndex) : slug.substring(0, maxLength);
        }

        return slug;
    }

    static isValid(slug, options = {}) {
        const { separator = '-', maxLength = 50 } = options;

        if (typeof slug !== 'string') return false;
        if (slug.length === 0 || slug.length > maxLength) return false;

        const pattern = new RegExp(`^[a-zA-Z0-9${separator}]+$`);
        return pattern.test(slug) &&
               !slug.startsWith(separator) &&
               !slug.endsWith(separator) &&
               !slug.includes(separator + separator);
    }

    static sanitize(slug, options = {}) {
        if (!this.isValid(slug, options)) {
            return this.create(slug, options);
        }
        return slug;
    }

    static generateUnique(text, existingSlugs = [], options = {}) {
        let baseSlug = this.create(text, options);
        let slug = baseSlug;
        let counter = 1;

        while (existingSlugs.includes(slug)) {
            slug = `${baseSlug}-${counter}`;
            counter++;
        }

        return slug;
    }

    static fromFilename(filename, options = {}) {
        const { removeExtension = true } = options;

        if (typeof filename !== 'string') {
            throw new AppError('Filename must be a string', 400, 'INVALID_INPUT');
        }

        let text = filename;

        if (removeExtension) {
            const lastDotIndex = filename.lastIndexOf('.');
            if (lastDotIndex > 0) {
                text = filename.substring(0, lastDotIndex);
            }
        }

        return this.create(text, options);
    }
}

module.exports = SlugHelper;
