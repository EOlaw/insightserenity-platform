'use strict';

/**
 * @fileoverview Pagination calculation and formatting utilities
 * @module shared/lib/utils/helpers/pagination-helper
 */

/**
 * @class PaginationHelper
 * @description Comprehensive pagination utilities for the platform
 */
class PaginationHelper {
  /**
   * Default pagination options
   * @static
   * @private
   */
  static #DEFAULTS = {
    page: 1,
    limit: 20,
    maxLimit: 100,
    minLimit: 1
  };

  /**
   * Calculate pagination metadata
   * @static
   * @param {number} totalItems - Total number of items
   * @param {Object} [options={}] - Pagination options
   * @param {number} [options.page=1] - Current page number
   * @param {number} [options.limit=20] - Items per page
   * @returns {Object} Pagination metadata
   */
  static calculate(totalItems, options = {}) {
    const { 
      page = this.#DEFAULTS.page, 
      limit = this.#DEFAULTS.limit 
    } = options;

    // Ensure valid inputs
    const safePage = Math.max(1, Math.floor(page));
    const safeLimit = Math.max(1, Math.floor(limit));
    const safeTotalItems = Math.max(0, Math.floor(totalItems));

    // Calculate pagination values
    const totalPages = Math.ceil(safeTotalItems / safeLimit);
    const currentPage = Math.min(safePage, Math.max(totalPages, 1));
    const offset = (currentPage - 1) * safeLimit;
    const startItem = safeTotalItems > 0 ? offset + 1 : 0;
    const endItem = Math.min(offset + safeLimit, safeTotalItems);
    const itemsOnPage = endItem - offset;

    return {
      page: currentPage,
      limit: safeLimit,
      totalItems: safeTotalItems,
      totalPages,
      hasNextPage: currentPage < totalPages,
      hasPrevPage: currentPage > 1,
      nextPage: currentPage < totalPages ? currentPage + 1 : null,
      prevPage: currentPage > 1 ? currentPage - 1 : null,
      startItem,
      endItem,
      itemsOnPage,
      offset,
      isFirstPage: currentPage === 1,
      isLastPage: currentPage >= totalPages || totalPages === 0
    };
  }

  /**
   * Validate pagination parameters
   * @static
   * @param {Object} params - Parameters to validate
   * @param {Object} [options={}] - Validation options
   * @param {number} [options.maxLimit=100] - Maximum allowed limit
   * @param {number} [options.minLimit=1] - Minimum allowed limit
   * @returns {Object} Validated parameters
   */
  static validate(params, options = {}) {
    const {
      maxLimit = this.#DEFAULTS.maxLimit,
      minLimit = this.#DEFAULTS.minLimit
    } = options;

    let page = parseInt(params.page) || this.#DEFAULTS.page;
    let limit = parseInt(params.limit) || this.#DEFAULTS.limit;

    // Validate page
    page = Math.max(1, page);

    // Validate limit
    limit = Math.max(minLimit, Math.min(maxLimit, limit));

    return { page, limit };
  }

  /**
   * Generate page range array
   * @static
   * @param {number} currentPage - Current page number
   * @param {number} totalPages - Total number of pages
   * @param {Object} [options={}] - Options
   * @param {number} [options.delta=2] - Pages to show around current
   * @param {boolean} [options.withEllipsis=true] - Include ellipsis
   * @returns {Array} Page range array
   */
  static getPageRange(currentPage, totalPages, options = {}) {
    const { delta = 2, withEllipsis = true } = options;
    
    if (totalPages <= 1) return [1];
    
    const range = [];
    const rangeWithDots = [];
    let prev;

    // Generate range
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || 
          (i >= currentPage - delta && i <= currentPage + delta)) {
        range.push(i);
      }
    }

    // Add ellipsis if needed
    range.forEach((i) => {
      if (withEllipsis && prev && i - prev !== 1) {
        rangeWithDots.push('...');
      }
      rangeWithDots.push(i);
      prev = i;
    });

    return rangeWithDots;
  }

  /**
   * Build pagination links
   * @static
   * @param {string} baseUrl - Base URL for links
   * @param {Object} pagination - Pagination metadata
   * @param {Object} [options={}] - Options
   * @param {Object} [options.queryParams={}] - Additional query parameters
   * @param {string} [options.pageParam='page'] - Page parameter name
   * @param {string} [options.limitParam='limit'] - Limit parameter name
   * @returns {Object} Pagination links
   */
  static buildLinks(baseUrl, pagination, options = {}) {
    const {
      queryParams = {},
      pageParam = 'page',
      limitParam = 'limit'
    } = options;

    const buildUrl = (page) => {
      const params = new URLSearchParams({
        ...queryParams,
        [pageParam]: page,
        [limitParam]: pagination.limit
      });
      return `${baseUrl}?${params.toString()}`;
    };

    const links = {
      self: buildUrl(pagination.page),
      first: buildUrl(1),
      last: buildUrl(pagination.totalPages)
    };

    if (pagination.hasNextPage) {
      links.next = buildUrl(pagination.nextPage);
    }

    if (pagination.hasPrevPage) {
      links.prev = buildUrl(pagination.prevPage);
    }

    return links;
  }

  /**
   * Format pagination for API response
   * @static
   * @param {Object} pagination - Pagination metadata
   * @param {Object} [options={}] - Formatting options
   * @param {boolean} [options.includeLinks=false] - Include navigation links
   * @param {string} [options.baseUrl] - Base URL for links
   * @returns {Object} Formatted pagination
   */
  static formatResponse(pagination, options = {}) {
    const { includeLinks = false, baseUrl } = options;

    const response = {
      page: pagination.page,
      perPage: pagination.limit,
      total: pagination.totalItems,
      totalPages: pagination.totalPages,
      hasMore: pagination.hasNextPage
    };

    if (includeLinks && baseUrl) {
      response.links = this.buildLinks(baseUrl, pagination);
    }

    return response;
  }

  /**
   * Create cursor-based pagination
   * @static
   * @param {Array} items - Items array
   * @param {Object} [options={}] - Options
   * @param {string} [options.cursor] - Current cursor
   * @param {number} [options.limit=20] - Items per page
   * @param {string} [options.cursorField='id'] - Field to use for cursor
   * @param {boolean} [options.reverse=false] - Reverse order
   * @returns {Object} Cursor pagination result
   */
  static cursorPaginate(items, options = {}) {
    const {
      cursor,
      limit = this.#DEFAULTS.limit,
      cursorField = 'id',
      reverse = false
    } = options;

    // Sort items by cursor field
    const sortedItems = [...items].sort((a, b) => {
      const aVal = a[cursorField];
      const bVal = b[cursorField];
      return reverse ? bVal - aVal : aVal - bVal;
    });

    // Find starting position
    let startIndex = 0;
    if (cursor) {
      startIndex = sortedItems.findIndex(item => 
        String(item[cursorField]) === String(cursor)
      );
      if (startIndex === -1) startIndex = 0;
      else startIndex += 1; // Start after cursor
    }

    // Get page items
    const pageItems = sortedItems.slice(startIndex, startIndex + limit + 1);
    const hasMore = pageItems.length > limit;
    const results = hasMore ? pageItems.slice(0, -1) : pageItems;

    // Generate cursors
    const startCursor = results.length > 0 ? results[0][cursorField] : null;
    const endCursor = results.length > 0 ? results[results.length - 1][cursorField] : null;

    return {
      items: results,
      pageInfo: {
        hasNextPage: hasMore,
        hasPreviousPage: cursor !== null && startIndex > 0,
        startCursor,
        endCursor
      }
    };
  }

  /**
   * Parse pagination from request
   * @static
   * @param {Object} req - Express request object
   * @param {Object} [options={}] - Options
   * @param {string} [options.pageParam='page'] - Page parameter name
   * @param {string} [options.limitParam='limit'] - Limit parameter name
   * @param {string} [options.sortParam='sort'] - Sort parameter name
   * @param {string} [options.orderParam='order'] - Order parameter name
   * @returns {Object} Parsed pagination parameters
   */
  static parseRequest(req, options = {}) {
    const {
      pageParam = 'page',
      limitParam = 'limit',
      sortParam = 'sort',
      orderParam = 'order'
    } = options;

    const params = {
      ...req.query,
      ...req.params,
      ...req.body
    };

    const validated = this.validate({
      page: params[pageParam],
      limit: params[limitParam]
    });

    return {
      ...validated,
      sort: params[sortParam] || null,
      order: params[orderParam] || 'asc',
      offset: (validated.page - 1) * validated.limit
    };
  }

  /**
   * Create pagination middleware
   * @static
   * @param {Object} [options={}] - Middleware options
   * @returns {Function} Express middleware
   */
  static middleware(options = {}) {
    return (req, res, next) => {
      req.pagination = this.parseRequest(req, options);
      
      // Add helper method to response
      res.paginate = (totalItems, data) => {
        const pagination = this.calculate(totalItems, req.pagination);
        const meta = this.formatResponse(pagination, {
          includeLinks: true,
          baseUrl: `${req.protocol}://${req.get('host')}${req.baseUrl}${req.path}`
        });

        return res.json({
          data,
          meta
        });
      };

      next();
    };
  }

  /**
   * Apply pagination to query builder
   * @static
   * @param {Object} query - Database query builder
   * @param {Object} pagination - Pagination parameters
   * @returns {Object} Modified query
   */
  static applyToQuery(query, pagination) {
    if (pagination.limit) {
      query.limit(pagination.limit);
    }

    if (pagination.offset) {
      query.skip(pagination.offset);
    }

    if (pagination.sort) {
      const sortOrder = pagination.order === 'desc' ? -1 : 1;
      query.sort({ [pagination.sort]: sortOrder });
    }

    return query;
  }

  /**
   * Calculate optimal page size
   * @static
   * @param {number} totalItems - Total number of items
   * @param {Object} [options={}] - Options
   * @param {number} [options.targetPages=10] - Target number of pages
   * @param {number} [options.minSize=10] - Minimum page size
   * @param {number} [options.maxSize=100] - Maximum page size
   * @returns {number} Optimal page size
   */
  static calculateOptimalPageSize(totalItems, options = {}) {
    const {
      targetPages = 10,
      minSize = 10,
      maxSize = 100
    } = options;

    if (totalItems <= minSize) return minSize;
    
    const optimal = Math.ceil(totalItems / targetPages);
    
    return Math.max(minSize, Math.min(maxSize, optimal));
  }

  /**
   * Generate SQL LIMIT and OFFSET
   * @static
   * @param {Object} pagination - Pagination parameters
   * @returns {Object} SQL pagination clauses
   */
  static toSQL(pagination) {
    return {
      limit: pagination.limit,
      offset: pagination.offset || ((pagination.page - 1) * pagination.limit)
    };
  }

  /**
   * Create infinite scroll metadata
   * @static
   * @param {Array} items - Current items
   * @param {Object} [options={}] - Options
   * @param {number} [options.threshold=5] - Items from bottom to trigger load
   * @param {string} [options.lastIdField='id'] - Field for last item ID
   * @returns {Object} Infinite scroll metadata
   */
  static infiniteScroll(items, options = {}) {
    const {
      threshold = 5,
      lastIdField = 'id'
    } = options;

    const hasMore = items.length === options.limit;
    const lastItem = items[items.length - 1];
    const lastId = lastItem ? lastItem[lastIdField] : null;
    
    return {
      items,
      hasMore,
      lastId,
      loadMoreThreshold: threshold,
      remaining: hasMore ? 'unknown' : 0
    };
  }

  /**
   * Merge pagination parameters
   * @static
   * @param {Object} defaults - Default parameters
   * @param {Object} overrides - Override parameters
   * @returns {Object} Merged parameters
   */
  static merge(defaults, overrides) {
    const merged = { ...defaults };

    if (overrides.page !== undefined) {
      merged.page = overrides.page;
    }

    if (overrides.limit !== undefined) {
      merged.limit = overrides.limit;
    }

    if (overrides.sort !== undefined) {
      merged.sort = overrides.sort;
    }

    if (overrides.order !== undefined) {
      merged.order = overrides.order;
    }

    return this.validate(merged);
  }
}

module.exports = PaginationHelper;