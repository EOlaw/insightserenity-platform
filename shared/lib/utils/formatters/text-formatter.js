'use strict';

const AppError = require('../app-error');

class TextFormatter {
    static capitalize(text) {
        if (typeof text !== 'string') {
            throw new AppError('Input must be a string', 400, 'INVALID_INPUT');
        }

        return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
    }

    static titleCase(text) {
        if (typeof text !== 'string') {
            throw new AppError('Input must be a string', 400, 'INVALID_INPUT');
        }

        return text.toLowerCase().split(' ').map(word =>
            word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
    }

    static truncate(text, length, suffix = '...') {
        if (typeof text !== 'string') {
            throw new AppError('Input must be a string', 400, 'INVALID_INPUT');
        }

        if (typeof length !== 'number' || length < 0) {
            throw new AppError('Length must be a non-negative number', 400, 'INVALID_LENGTH');
        }

        if (text.length <= length) return text;
        return text.substring(0, length - suffix.length) + suffix;
    }

    static truncateWords(text, wordCount, suffix = '...') {
        if (typeof text !== 'string') {
            throw new AppError('Input must be a string', 400, 'INVALID_INPUT');
        }

        if (typeof wordCount !== 'number' || wordCount < 0) {
            throw new AppError('Word count must be a non-negative number', 400, 'INVALID_WORD_COUNT');
        }

        const words = text.split(' ');
        if (words.length <= wordCount) return text;

        return words.slice(0, wordCount).join(' ') + suffix;
    }

    static excerpt(text, maxLength = 150, options = {}) {
        const { suffix = '...', breakOnWord = true } = options;

        if (typeof text !== 'string') {
            throw new AppError('Input must be a string', 400, 'INVALID_INPUT');
        }

        if (text.length <= maxLength) return text;

        if (breakOnWord) {
            const truncated = text.substring(0, maxLength);
            const lastSpaceIndex = truncated.lastIndexOf(' ');

            if (lastSpaceIndex > 0) {
                return text.substring(0, lastSpaceIndex) + suffix;
            }
        }

        return this.truncate(text, maxLength, suffix);
    }

    static stripHtml(html) {
        if (typeof html !== 'string') {
            throw new AppError('Input must be a string', 400, 'INVALID_INPUT');
        }

        return html.replace(/<[^>]*>/g, '');
    }

    static escapeHtml(text) {
        if (typeof text !== 'string') {
            throw new AppError('Input must be a string', 400, 'INVALID_INPUT');
        }

        const htmlEscapes = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        };

        return text.replace(/[&<>"']/g, char => htmlEscapes[char]);
    }

    static unescapeHtml(text) {
        if (typeof text !== 'string') {
            throw new AppError('Input must be a string', 400, 'INVALID_INPUT');
        }

        const htmlUnescapes = {
            '&amp;': '&',
            '&lt;': '<',
            '&gt;': '>',
            '&quot;': '"',
            '&#39;': "'"
        };

        return text.replace(/&(?:amp|lt|gt|quot|#39);/g, entity => htmlUnescapes[entity]);
    }

    static highlightSearch(text, searchTerm, options = {}) {
        const {
            highlightClass = 'highlight',
            caseSensitive = false,
            wholeWord = false
        } = options;

        if (typeof text !== 'string' || typeof searchTerm !== 'string') {
            throw new AppError('Text and search term must be strings', 400, 'INVALID_INPUT');
        }

        if (!searchTerm.trim()) return text;

        let flags = 'g';
        if (!caseSensitive) flags += 'i';

        const pattern = wholeWord
            ? new RegExp(`\\b${this.escapeRegex(searchTerm)}\\b`, flags)
            : new RegExp(this.escapeRegex(searchTerm), flags);

        return text.replace(pattern, match =>
            `<span class="${highlightClass}">${match}</span>`
        );
    }

    static escapeRegex(text) {
        if (typeof text !== 'string') {
            throw new AppError('Input must be a string', 400, 'INVALID_INPUT');
        }

        return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    static wordCount(text) {
        if (typeof text !== 'string') {
            throw new AppError('Input must be a string', 400, 'INVALID_INPUT');
        }

        return text.trim().split(/\s+/).filter(word => word.length > 0).length;
    }

    static readingTime(text, wordsPerMinute = 200) {
        if (typeof text !== 'string') {
            throw new AppError('Input must be a string', 400, 'INVALID_INPUT');
        }

        const words = this.wordCount(text);
        const minutes = Math.ceil(words / wordsPerMinute);

        return {
            words,
            minutes,
            text: `${minutes} min read`
        };
    }

    static pluralize(word, count, pluralForm = null) {
        if (typeof word !== 'string') {
            throw new AppError('Word must be a string', 400, 'INVALID_INPUT');
        }

        if (typeof count !== 'number') {
            throw new AppError('Count must be a number', 400, 'INVALID_COUNT');
        }

        if (count === 1) return word;

        if (pluralForm) return pluralForm;

        // Simple pluralization rules
        if (word.endsWith('y') && !['a', 'e', 'i', 'o', 'u'].includes(word[word.length - 2])) {
            return word.slice(0, -1) + 'ies';
        }

        if (word.endsWith('s') || word.endsWith('sh') || word.endsWith('ch') ||
            word.endsWith('x') || word.endsWith('z')) {
            return word + 'es';
        }

        return word + 's';
    }

    static formatList(items, options = {}) {
        const {
            conjunction = 'and',
            oxfordComma = true,
            maxItems = null,
            moreText = 'more'
        } = options;

        if (!Array.isArray(items)) {
            throw new AppError('Items must be an array', 400, 'INVALID_INPUT');
        }

        if (items.length === 0) return '';
        if (items.length === 1) return items[0].toString();

        let itemsToShow = items;
        let extraCount = 0;

        if (maxItems && items.length > maxItems) {
            itemsToShow = items.slice(0, maxItems);
            extraCount = items.length - maxItems;
        }

        if (itemsToShow.length === 2) {
            const result = itemsToShow.join(` ${conjunction} `);
            return extraCount > 0 ? `${result} ${conjunction} ${extraCount} ${moreText}` : result;
        }

        const lastItem = itemsToShow.pop();
        const comma = oxfordComma ? ',' : '';
        let result = `${itemsToShow.join(', ')}${comma} ${conjunction} ${lastItem}`;

        if (extraCount > 0) {
            result += ` ${conjunction} ${extraCount} ${moreText}`;
        }

        return result;
    }

    static removeExtraSpaces(text) {
        if (typeof text !== 'string') {
            throw new AppError('Input must be a string', 400, 'INVALID_INPUT');
        }

        return text.replace(/\s+/g, ' ').trim();
    }

    static replaceAll(text, search, replace) {
        if (typeof text !== 'string' || typeof search !== 'string' || typeof replace !== 'string') {
            throw new AppError('All parameters must be strings', 400, 'INVALID_INPUT');
        }

        return text.split(search).join(replace);
    }

    static reverse(text) {
        if (typeof text !== 'string') {
            throw new AppError('Input must be a string', 400, 'INVALID_INPUT');
        }

        return text.split('').reverse().join('');
    }

    static wrap(text, width, options = {}) {
        const {
            breakLongWords = true,
            indentFirstLine = 0,
            indentOtherLines = 0
        } = options;

        if (typeof text !== 'string') {
            throw new AppError('Input must be a string', 400, 'INVALID_INPUT');
        }

        if (typeof width !== 'number' || width <= 0) {
            throw new AppError('Width must be a positive number', 400, 'INVALID_WIDTH');
        }

        const words = text.split(' ');
        const lines = [];
        let currentLine = '';

        for (const word of words) {
            if (word.length > width && breakLongWords) {
                if (currentLine) {
                    lines.push(currentLine.trim());
                    currentLine = '';
                }

                // Break long word
                for (let i = 0; i < word.length; i += width) {
                    lines.push(word.slice(i, i + width));
                }
            } else if ((currentLine + ' ' + word).length <= width || !currentLine) {
                currentLine += (currentLine ? ' ' : '') + word;
            } else {
                lines.push(currentLine.trim());
                currentLine = word;
            }
        }

        if (currentLine) {
            lines.push(currentLine.trim());
        }

        return lines.map((line, index) => {
            const indent = index === 0 ? indentFirstLine : indentOtherLines;
            return ' '.repeat(indent) + line;
        }).join('\n');
    }
}

module.exports = TextFormatter;
