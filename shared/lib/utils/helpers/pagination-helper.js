'use strict';

const AppError = require('../app-error');

class PaginationHelper {
    static calculate(totalItems, page = 1, limit = 10) {
        if (typeof totalItems !== 'number' || totalItems < 0) {
            throw new AppError('Total items must be a non-negative number', 400, 'INVALID_TOTAL');
        }
        if (typeof page !== 'number' || page < 1) {
            throw new AppError('Page must be a positive number', 400, 'INVALID_PAGE');
        }
        if (typeof limit !== 'number' || limit < 1) {
            throw new AppError('Limit must be a positive number', 400, 'INVALID_LIMIT');
        }

        const totalPages = Math.ceil(totalItems / limit);
        const currentPage = Math.min(page, totalPages || 1);
        const offset = (currentPage - 1) * limit;
        const hasNextPage = currentPage < totalPages;
        const hasPrevPage = currentPage > 1;

        return {
            totalItems,
            totalPages,
            currentPage,
            limit,
            offset,
            hasNextPage,
            hasPrevPage,
            nextPage: hasNextPage ? currentPage + 1 : null,
            prevPage: hasPrevPage ? currentPage - 1 : null,
            startIndex: totalItems > 0 ? offset + 1 : 0,
            endIndex: Math.min(offset + limit, totalItems)
        };
    }

    static getPageNumbers(currentPage, totalPages, maxVisible = 5) {
        if (totalPages <= maxVisible) {
            return Array.from({ length: totalPages }, (_, i) => i + 1);
        }

        const half = Math.floor(maxVisible / 2);
        let start = Math.max(1, currentPage - half);
        let end = Math.min(totalPages, start + maxVisible - 1);

        if (end - start + 1 < maxVisible) {
            start = Math.max(1, end - maxVisible + 1);
        }

        return Array.from({ length: end - start + 1 }, (_, i) => start + i);
    }

    static createLinks(baseUrl, pagination, options = {}) {
        const { queryParam = 'page', preserveQuery = true } = options;
        const url = new URL(baseUrl);

        if (preserveQuery) {
            // Preserve existing query parameters
        }

        const links = {};

        if (pagination.hasPrevPage) {
            url.searchParams.set(queryParam, pagination.prevPage);
            links.prev = url.toString();
        }

        if (pagination.hasNextPage) {
            url.searchParams.set(queryParam, pagination.nextPage);
            links.next = url.toString();
        }

        url.searchParams.set(queryParam, 1);
        links.first = url.toString();

        url.searchParams.set(queryParam, pagination.totalPages);
        links.last = url.toString();

        return links;
    }

    static validateParams(page, limit, maxLimit = 100) {
        const errors = [];

        if (page !== undefined && (!Number.isInteger(page) || page < 1)) {
            errors.push('Page must be a positive integer');
        }

        if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
            errors.push('Limit must be a positive integer');
        }

        if (limit > maxLimit) {
            errors.push(`Limit cannot exceed ${maxLimit}`);
        }

        return errors;
    }
}

module.exports = PaginationHelper;
