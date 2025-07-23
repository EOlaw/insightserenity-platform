'use strict';

/**
 * @fileoverview Audit trail query and analysis service
 * @module shared/lib/security/audit/audit-trail
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/security/encryption/encryption-service
 * @requires module:shared/lib/security/audit/audit-events
 */

const logger = require('../../utils/logger');
const AppError = require('../../utils/app-error');
const EncryptionService = require('../encryption/encryption-service');
const { AuditEvents, EventMetadata } = require('./audit-events');

/**
 * @class AuditTrail
 * @description Provides comprehensive audit trail querying, filtering, and analysis capabilities
 */
class AuditTrail {
  /**
   * @private
   * @static
   * @readonly
   */
  static #QUERY_OPERATORS = {
    EQUALS: 'eq',
    NOT_EQUALS: 'ne',
    GREATER_THAN: 'gt',
    GREATER_THAN_OR_EQUAL: 'gte',
    LESS_THAN: 'lt',
    LESS_THAN_OR_EQUAL: 'lte',
    IN: 'in',
    NOT_IN: 'nin',
    CONTAINS: 'contains',
    STARTS_WITH: 'startsWith',
    ENDS_WITH: 'endsWith',
    REGEX: 'regex'
  };

  static #SORT_ORDERS = {
    ASC: 'asc',
    DESC: 'desc'
  };

  static #DEFAULT_PAGE_SIZE = 50;
  static #MAX_PAGE_SIZE = 1000;
  static #MAX_EXPORT_SIZE = 100000;
  static #CACHE_TTL = 300000; // 5 minutes

  /**
   * Creates an instance of AuditTrail
   * @constructor
   * @param {Object} [options={}] - Configuration options
   * @param {Object} [options.database] - Database connection
   * @param {boolean} [options.enableEncryption=true] - Enable decryption of encrypted logs
   * @param {boolean} [options.enableCache=true] - Enable query result caching
   * @param {number} [options.cacheTTL=300000] - Cache TTL in milliseconds
   * @param {boolean} [options.enableAnalytics=true] - Enable analytics features
   * @param {Object} [options.indexConfig] - Index configuration for optimization
   */
  constructor(options = {}) {
    const {
      database,
      enableEncryption = true,
      enableCache = true,
      cacheTTL = AuditTrail.#CACHE_TTL,
      enableAnalytics = true,
      indexConfig = {}
    } = options;

    this.database = database;
    this.enableEncryption = enableEncryption;
    this.enableCache = enableCache;
    this.cacheTTL = cacheTTL;
    this.enableAnalytics = enableAnalytics;
    this.indexConfig = indexConfig;

    // Initialize encryption service if needed
    if (this.enableEncryption) {
      this.encryptionService = new EncryptionService({
        algorithm: 'aes-256-gcm'
      });
    }

    // Initialize cache
    this.queryCache = new Map();
    this.analyticsCache = new Map();

    // Start cache cleanup interval
    if (this.enableCache) {
      this.cacheCleanupInterval = setInterval(() => {
        this.#cleanupCache();
      }, this.cacheTTL);
    }

    // Initialize query statistics
    this.queryStats = {
      totalQueries: 0,
      cacheHits: 0,
      cacheMisses: 0,
      avgResponseTime: 0
    };

    logger.info('AuditTrail initialized', {
      enableEncryption,
      enableCache,
      enableAnalytics
    });
  }

  /**
   * Queries audit logs with advanced filtering
   * @param {Object} filters - Query filters
   * @param {Object} [options={}] - Query options
   * @returns {Promise<Object>} Query results with metadata
   */
  async query(filters = {}, options = {}) {
    try {
      const startTime = Date.now();
      this.queryStats.totalQueries++;

      // Build query parameters
      const queryParams = this.#buildQueryParams(filters, options);

      // Check cache first
      const cacheKey = this.#generateCacheKey(queryParams);
      if (this.enableCache && this.queryCache.has(cacheKey)) {
        const cached = this.queryCache.get(cacheKey);
        if (Date.now() - cached.timestamp < this.cacheTTL) {
          this.queryStats.cacheHits++;
          logger.debug('Query result from cache', { cacheKey });
          return cached.result;
        }
      }

      this.queryStats.cacheMisses++;

      // Execute query
      const result = await this.#executeQuery(queryParams);

      // Decrypt logs if needed
      if (this.enableEncryption && result.data.length > 0) {
        result.data = await this.#decryptLogs(result.data);
      }

      // Apply post-processing
      result.data = this.#postProcessLogs(result.data, options);

      // Cache result
      if (this.enableCache) {
        this.queryCache.set(cacheKey, {
          result,
          timestamp: Date.now()
        });
      }

      // Update statistics
      const responseTime = Date.now() - startTime;
      this.#updateQueryStats(responseTime);

      logger.debug('Audit trail query completed', {
        resultCount: result.data.length,
        responseTime
      });

      return result;

    } catch (error) {
      logger.error('Audit trail query failed', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to query audit trail',
        500,
        'QUERY_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Searches audit logs with full-text search
   * @param {string} searchText - Search text
   * @param {Object} [options={}] - Search options
   * @returns {Promise<Object>} Search results
   */
  async search(searchText, options = {}) {
    try {
      if (!searchText || searchText.trim().length === 0) {
        throw new AppError('Search text is required', 400, 'INVALID_SEARCH');
      }

      const searchOptions = {
        ...options,
        searchFields: options.searchFields || [
          'eventType',
          'resource',
          'action',
          'metadata',
          'context.userAgent',
          'result'
        ]
      };

      // Build search query
      const searchQuery = this.#buildSearchQuery(searchText, searchOptions);

      // Execute search
      const results = await this.query(searchQuery, searchOptions);

      // Highlight matches if requested
      if (searchOptions.highlight) {
        results.data = this.#highlightSearchResults(results.data, searchText);
      }

      logger.info('Audit trail search completed', {
        searchText,
        resultCount: results.total
      });

      return results;

    } catch (error) {
      logger.error('Audit trail search failed', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to search audit trail',
        500,
        'SEARCH_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Gets audit logs by user
   * @param {string} userId - User identifier
   * @param {Object} [options={}] - Query options
   * @returns {Promise<Object>} User's audit logs
   */
  async getByUser(userId, options = {}) {
    try {
      if (!userId) {
        throw new AppError('User ID is required', 400, 'INVALID_USER_ID');
      }

      return await this.query({ userId }, options);

    } catch (error) {
      logger.error('Failed to get user audit logs', error);
      throw error;
    }
  }

  /**
   * Gets audit logs by tenant
   * @param {string} tenantId - Tenant identifier
   * @param {Object} [options={}] - Query options
   * @returns {Promise<Object>} Tenant's audit logs
   */
  async getByTenant(tenantId, options = {}) {
    try {
      if (!tenantId) {
        throw new AppError('Tenant ID is required', 400, 'INVALID_TENANT_ID');
      }

      return await this.query({ tenantId }, options);

    } catch (error) {
      logger.error('Failed to get tenant audit logs', error);
      throw error;
    }
  }

  /**
   * Gets audit logs by event type
   * @param {string|Array<string>} eventTypes - Event type(s)
   * @param {Object} [options={}] - Query options
   * @returns {Promise<Object>} Filtered audit logs
   */
  async getByEventType(eventTypes, options = {}) {
    try {
      if (!eventTypes) {
        throw new AppError('Event type is required', 400, 'INVALID_EVENT_TYPE');
      }

      const types = Array.isArray(eventTypes) ? eventTypes : [eventTypes];

      return await this.query({ 
        eventType: { [AuditTrail.#QUERY_OPERATORS.IN]: types } 
      }, options);

    } catch (error) {
      logger.error('Failed to get audit logs by event type', error);
      throw error;
    }
  }

  /**
   * Gets audit logs by resource
   * @param {string} resource - Resource identifier
   * @param {Object} [options={}] - Query options
   * @returns {Promise<Object>} Resource audit logs
   */
  async getByResource(resource, options = {}) {
    try {
      if (!resource) {
        throw new AppError('Resource is required', 400, 'INVALID_RESOURCE');
      }

      return await this.query({ resource }, options);

    } catch (error) {
      logger.error('Failed to get resource audit logs', error);
      throw error;
    }
  }

  /**
   * Gets audit logs within time range
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @param {Object} [options={}] - Query options
   * @returns {Promise<Object>} Time-filtered audit logs
   */
  async getByTimeRange(startDate, endDate, options = {}) {
    try {
      if (!startDate || !endDate) {
        throw new AppError('Start and end dates are required', 400, 'INVALID_DATE_RANGE');
      }

      if (startDate > endDate) {
        throw new AppError('Start date must be before end date', 400, 'INVALID_DATE_RANGE');
      }

      return await this.query({
        timestamp: {
          [AuditTrail.#QUERY_OPERATORS.GREATER_THAN_OR_EQUAL]: startDate,
          [AuditTrail.#QUERY_OPERATORS.LESS_THAN_OR_EQUAL]: endDate
        }
      }, options);

    } catch (error) {
      logger.error('Failed to get audit logs by time range', error);
      throw error;
    }
  }

  /**
   * Analyzes audit trail patterns
   * @param {Object} criteria - Analysis criteria
   * @returns {Promise<Object>} Analysis results
   */
  async analyze(criteria) {
    try {
      const {
        timeRange,
        groupBy,
        metrics,
        filters = {}
      } = criteria;

      if (!timeRange || !groupBy || !metrics) {
        throw new AppError('Time range, groupBy, and metrics are required', 400, 'INVALID_CRITERIA');
      }

      // Check analytics cache
      const cacheKey = `analytics:${JSON.stringify(criteria)}`;
      if (this.enableCache && this.analyticsCache.has(cacheKey)) {
        const cached = this.analyticsCache.get(cacheKey);
        if (Date.now() - cached.timestamp < this.cacheTTL) {
          return cached.result;
        }
      }

      // Get audit logs for analysis
      const logs = await this.query({
        ...filters,
        timestamp: {
          [AuditTrail.#QUERY_OPERATORS.GREATER_THAN_OR_EQUAL]: timeRange.start,
          [AuditTrail.#QUERY_OPERATORS.LESS_THAN_OR_EQUAL]: timeRange.end
        }
      }, { limit: AuditTrail.#MAX_EXPORT_SIZE });

      // Perform analysis
      const analysis = {
        timeRange,
        totalEvents: logs.total,
        groupedData: this.#groupData(logs.data, groupBy),
        metrics: this.#calculateMetrics(logs.data, metrics),
        trends: this.#analyzeTrends(logs.data, groupBy),
        topPatterns: this.#findTopPatterns(logs.data),
        anomalies: this.#detectAnomalies(logs.data)
      };

      // Cache results
      if (this.enableCache) {
        this.analyticsCache.set(cacheKey, {
          result: analysis,
          timestamp: Date.now()
        });
      }

      logger.info('Audit trail analysis completed', {
        totalEvents: analysis.totalEvents,
        groupBy,
        metrics: Object.keys(analysis.metrics)
      });

      return analysis;

    } catch (error) {
      logger.error('Audit trail analysis failed', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to analyze audit trail',
        500,
        'ANALYSIS_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Exports audit logs
   * @param {Object} criteria - Export criteria
   * @param {string} format - Export format
   * @returns {Promise<Object>} Exported data
   */
  async export(criteria, format = 'json') {
    try {
      // Query logs with export limit
      const logs = await this.query(criteria, {
        limit: AuditTrail.#MAX_EXPORT_SIZE,
        includeMetadata: true
      });

      if (logs.total > AuditTrail.#MAX_EXPORT_SIZE) {
        logger.warn('Export size exceeds limit', {
          requested: logs.total,
          limit: AuditTrail.#MAX_EXPORT_SIZE
        });
      }

      // Format data for export
      const exportData = {
        exportDate: new Date().toISOString(),
        criteria,
        totalRecords: logs.total,
        exportedRecords: logs.data.length,
        data: logs.data
      };

      // Convert to requested format
      let formatted;
      switch (format.toLowerCase()) {
        case 'csv':
          formatted = this.#exportAsCSV(exportData);
          break;
        case 'json':
          formatted = JSON.stringify(exportData, null, 2);
          break;
        case 'jsonl':
          formatted = this.#exportAsJSONL(exportData);
          break;
        default:
          throw new AppError('Unsupported export format', 400, 'INVALID_FORMAT');
      }

      logger.info('Audit trail exported', {
        format,
        recordCount: exportData.exportedRecords
      });

      return {
        format,
        size: formatted.length,
        recordCount: exportData.exportedRecords,
        data: formatted
      };

    } catch (error) {
      logger.error('Audit trail export failed', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to export audit trail',
        500,
        'EXPORT_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Gets audit trail statistics
   * @param {Object} [options={}] - Statistics options
   * @returns {Promise<Object>} Audit trail statistics
   */
  async getStatistics(options = {}) {
    try {
      const stats = {
        summary: await this.#getSummaryStats(options),
        eventDistribution: await this.#getEventDistribution(options),
        userActivity: await this.#getUserActivityStats(options),
        resourceAccess: await this.#getResourceAccessStats(options),
        timeDistribution: await this.#getTimeDistribution(options),
        riskAnalysis: await this.#getRiskAnalysis(options)
      };

      return stats;

    } catch (error) {
      logger.error('Failed to get audit trail statistics', error);

      throw new AppError(
        'Failed to get statistics',
        500,
        'STATISTICS_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Creates audit trail snapshot
   * @param {Object} criteria - Snapshot criteria
   * @returns {Promise<Object>} Snapshot information
   */
  async createSnapshot(criteria) {
    try {
      const {
        name,
        description,
        filters,
        retention
      } = criteria;

      if (!name) {
        throw new AppError('Snapshot name is required', 400, 'INVALID_NAME');
      }

      // Query logs for snapshot
      const logs = await this.query(filters || {}, {
        limit: AuditTrail.#MAX_EXPORT_SIZE
      });

      const snapshot = {
        id: this.#generateSnapshotId(),
        name,
        description,
        createdAt: new Date().toISOString(),
        criteria: filters,
        recordCount: logs.data.length,
        retention: retention || 90, // days
        status: 'active'
      };

      // Store snapshot
      if (this.database) {
        const AuditSnapshotModel = require('../../database/models/audit-snapshot-model');
        await AuditSnapshotModel.create({
          ...snapshot,
          data: logs.data
        });
      }

      logger.info('Audit trail snapshot created', {
        snapshotId: snapshot.id,
        name,
        recordCount: snapshot.recordCount
      });

      return snapshot;

    } catch (error) {
      logger.error('Failed to create audit trail snapshot', error);

      throw new AppError(
        'Failed to create snapshot',
        500,
        'SNAPSHOT_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Builds query parameters
   * @private
   * @param {Object} filters - Query filters
   * @param {Object} options - Query options
   * @returns {Object} Query parameters
   */
  #buildQueryParams(filters, options) {
    const params = {
      filters: this.#normalizeFilters(filters),
      pagination: {
        page: options.page || 1,
        pageSize: Math.min(
          options.pageSize || AuditTrail.#DEFAULT_PAGE_SIZE,
          AuditTrail.#MAX_PAGE_SIZE
        )
      },
      sort: {
        field: options.sortBy || 'timestamp',
        order: options.sortOrder || AuditTrail.#SORT_ORDERS.DESC
      },
      projection: options.fields || null,
      includeCount: options.includeCount !== false
    };

    return params;
  }

  /**
   * Normalizes query filters
   * @private
   * @param {Object} filters - Raw filters
   * @returns {Object} Normalized filters
   */
  #normalizeFilters(filters) {
    const normalized = {};

    for (const [key, value] of Object.entries(filters)) {
      if (value === null || value === undefined) {
        continue;
      }

      if (typeof value === 'object' && !Array.isArray(value) && !value instanceof Date) {
        // Handle operators
        normalized[key] = value;
      } else if (Array.isArray(value)) {
        // Convert array to IN operator
        normalized[key] = { [AuditTrail.#QUERY_OPERATORS.IN]: value };
      } else {
        // Simple equality
        normalized[key] = { [AuditTrail.#QUERY_OPERATORS.EQUALS]: value };
      }
    }

    return normalized;
  }

  /**
   * Executes database query
   * @private
   * @param {Object} params - Query parameters
   * @returns {Promise<Object>} Query results
   */
  async #executeQuery(params) {
    if (!this.database) {
      return { data: [], total: 0, page: 1, pageSize: params.pagination.pageSize };
    }

    const AuditLogModel = require('../../database/models/audit-log-model');

    // Build MongoDB query
    const query = this.#buildMongoQuery(params.filters);

    // Count total if requested
    let total = 0;
    if (params.includeCount) {
      total = await AuditLogModel.countDocuments(query);
    }

    // Execute query with pagination
    const skip = (params.pagination.page - 1) * params.pagination.pageSize;
    
    let queryBuilder = AuditLogModel.find(query)
      .sort({ [params.sort.field]: params.sort.order === 'asc' ? 1 : -1 })
      .skip(skip)
      .limit(params.pagination.pageSize);

    // Apply projection if specified
    if (params.projection) {
      queryBuilder = queryBuilder.select(params.projection.join(' '));
    }

    const data = await queryBuilder.exec();

    return {
      data,
      total,
      page: params.pagination.page,
      pageSize: params.pagination.pageSize,
      totalPages: Math.ceil(total / params.pagination.pageSize)
    };
  }

  /**
   * Builds MongoDB query from filters
   * @private
   * @param {Object} filters - Normalized filters
   * @returns {Object} MongoDB query
   */
  #buildMongoQuery(filters) {
    const query = {};

    for (const [field, conditions] of Object.entries(filters)) {
      const mongoConditions = {};

      for (const [operator, value] of Object.entries(conditions)) {
        switch (operator) {
          case AuditTrail.#QUERY_OPERATORS.EQUALS:
            mongoConditions.$eq = value;
            break;
          case AuditTrail.#QUERY_OPERATORS.NOT_EQUALS:
            mongoConditions.$ne = value;
            break;
          case AuditTrail.#QUERY_OPERATORS.GREATER_THAN:
            mongoConditions.$gt = value;
            break;
          case AuditTrail.#QUERY_OPERATORS.GREATER_THAN_OR_EQUAL:
            mongoConditions.$gte = value;
            break;
          case AuditTrail.#QUERY_OPERATORS.LESS_THAN:
            mongoConditions.$lt = value;
            break;
          case AuditTrail.#QUERY_OPERATORS.LESS_THAN_OR_EQUAL:
            mongoConditions.$lte = value;
            break;
          case AuditTrail.#QUERY_OPERATORS.IN:
            mongoConditions.$in = value;
            break;
          case AuditTrail.#QUERY_OPERATORS.NOT_IN:
            mongoConditions.$nin = value;
            break;
          case AuditTrail.#QUERY_OPERATORS.CONTAINS:
            mongoConditions.$regex = value;
            mongoConditions.$options = 'i';
            break;
          case AuditTrail.#QUERY_OPERATORS.STARTS_WITH:
            mongoConditions.$regex = `^${value}`;
            mongoConditions.$options = 'i';
            break;
          case AuditTrail.#QUERY_OPERATORS.ENDS_WITH:
            mongoConditions.$regex = `${value}$`;
            mongoConditions.$options = 'i';
            break;
          case AuditTrail.#QUERY_OPERATORS.REGEX:
            mongoConditions.$regex = value;
            break;
        }
      }

      query[field] = Object.keys(mongoConditions).length === 1 && mongoConditions.$eq !== undefined
        ? mongoConditions.$eq
        : mongoConditions;
    }

    return query;
  }

  /**
   * Decrypts encrypted logs
   * @private
   * @param {Array} logs - Encrypted logs
   * @returns {Promise<Array>} Decrypted logs
   */
  async #decryptLogs(logs) {
    const decrypted = [];

    for (const log of logs) {
      try {
        if (log.encrypted && log.data) {
          const decryptedData = await this.encryptionService.decrypt({
            encryptedData: log.data,
            iv: log.iv,
            authTag: log.authTag,
            algorithm: log.algorithm
          });

          decrypted.push({
            ...JSON.parse(decryptedData),
            _id: log._id
          });
        } else {
          decrypted.push(log);
        }
      } catch (error) {
        logger.error('Failed to decrypt log entry', { logId: log.id, error });
        // Include encrypted log with decryption error flag
        decrypted.push({
          ...log,
          decryptionError: true
        });
      }
    }

    return decrypted;
  }

  /**
   * Post-processes log entries
   * @private
   * @param {Array} logs - Raw logs
   * @param {Object} options - Processing options
   * @returns {Array} Processed logs
   */
  #postProcessLogs(logs, options) {
    return logs.map(log => {
      // Add event metadata
      if (options.includeMetadata) {
        log.eventMetadata = EventMetadata.getMetadata(log.eventType);
      }

      // Add human-readable timestamps
      if (options.humanizeTimestamps) {
        log.timestampHuman = new Date(log.timestamp).toLocaleString();
      }

      // Mask sensitive data if requested
      if (options.maskSensitive) {
        log = this.#maskSensitiveData(log);
      }

      return log;
    });
  }

  /**
   * Masks sensitive data in log entry
   * @private
   * @param {Object} log - Log entry
   * @returns {Object} Masked log entry
   */
  #maskSensitiveData(log) {
    const masked = { ...log };

    // Mask email addresses
    if (masked.metadata?.email) {
      masked.metadata.email = masked.metadata.email.replace(
        /^(.{2}).*(@.*)$/,
        '$1***$2'
      );
    }

    // Mask IP addresses
    if (masked.context?.ip) {
      masked.context.ip = masked.context.ip.replace(
        /(\d+)\.(\d+)\.(\d+)\.(\d+)/,
        '$1.$2.XXX.XXX'
      );
    }

    // Mask user IDs (keep first and last 4 chars)
    if (masked.userId && masked.userId.length > 8) {
      const start = masked.userId.substring(0, 4);
      const end = masked.userId.substring(masked.userId.length - 4);
      masked.userId = `${start}...${end}`;
    }

    return masked;
  }

  /**
   * Builds search query
   * @private
   * @param {string} searchText - Search text
   * @param {Object} options - Search options
   * @returns {Object} Search query
   */
  #buildSearchQuery(searchText, options) {
    const searchConditions = options.searchFields.map(field => ({
      [field]: { [AuditTrail.#QUERY_OPERATORS.CONTAINS]: searchText }
    }));

    return {
      $or: searchConditions
    };
  }

  /**
   * Highlights search results
   * @private
   * @param {Array} logs - Search results
   * @param {string} searchText - Search text
   * @returns {Array} Highlighted results
   */
  #highlightSearchResults(logs, searchText) {
    const regex = new RegExp(`(${searchText})`, 'gi');

    return logs.map(log => {
      const highlighted = { ...log };

      // Highlight in string fields
      Object.keys(highlighted).forEach(key => {
        if (typeof highlighted[key] === 'string') {
          highlighted[key] = highlighted[key].replace(
            regex,
            '<mark>$1</mark>'
          );
        }
      });

      return highlighted;
    });
  }

  /**
   * Groups data by field
   * @private
   * @param {Array} data - Data to group
   * @param {string} groupBy - Field to group by
   * @returns {Object} Grouped data
   */
  #groupData(data, groupBy) {
    const grouped = {};

    for (const item of data) {
      const key = this.#getNestedValue(item, groupBy) || 'unknown';
      
      if (!grouped[key]) {
        grouped[key] = {
          count: 0,
          items: []
        };
      }

      grouped[key].count++;
      grouped[key].items.push(item);
    }

    return grouped;
  }

  /**
   * Calculates metrics
   * @private
   * @param {Array} data - Data for metrics
   * @param {Array} metrics - Metrics to calculate
   * @returns {Object} Calculated metrics
   */
  #calculateMetrics(data, metrics) {
    const results = {};

    for (const metric of metrics) {
      switch (metric) {
        case 'eventCount':
          results.eventCount = data.length;
          break;
        
        case 'uniqueUsers':
          results.uniqueUsers = new Set(data.map(d => d.userId)).size;
          break;
        
        case 'failureRate':
          const failures = data.filter(d => d.result === 'failure').length;
          results.failureRate = data.length > 0 ? (failures / data.length) * 100 : 0;
          break;
        
        case 'avgRiskScore':
          const scores = data.filter(d => d.riskScore).map(d => d.riskScore);
          results.avgRiskScore = scores.length > 0
            ? scores.reduce((a, b) => a + b, 0) / scores.length
            : 0;
          break;
        
        case 'topEventTypes':
          const eventTypes = {};
          data.forEach(d => {
            eventTypes[d.eventType] = (eventTypes[d.eventType] || 0) + 1;
          });
          results.topEventTypes = Object.entries(eventTypes)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([type, count]) => ({ type, count }));
          break;
      }
    }

    return results;
  }

  /**
   * Analyzes trends
   * @private
   * @param {Array} data - Data for trend analysis
   * @param {string} groupBy - Grouping field
   * @returns {Object} Trend analysis
   */
  #analyzeTrends(data, groupBy) {
    const trends = {
      timeline: {},
      growth: {},
      patterns: []
    };

    // Sort by timestamp
    const sorted = [...data].sort((a, b) => 
      new Date(a.timestamp) - new Date(b.timestamp)
    );

    // Group by time periods
    const hourly = {};
    const daily = {};

    sorted.forEach(item => {
      const date = new Date(item.timestamp);
      const hour = date.toISOString().substring(0, 13);
      const day = date.toISOString().substring(0, 10);

      hourly[hour] = (hourly[hour] || 0) + 1;
      daily[day] = (daily[day] || 0) + 1;
    });

    trends.timeline.hourly = hourly;
    trends.timeline.daily = daily;

    // Calculate growth rates
    const days = Object.keys(daily).sort();
    if (days.length >= 2) {
      const firstDay = daily[days[0]];
      const lastDay = daily[days[days.length - 1]];
      trends.growth.daily = ((lastDay - firstDay) / firstDay) * 100;
    }

    return trends;
  }

  /**
   * Finds top patterns
   * @private
   * @param {Array} data - Data for pattern analysis
   * @returns {Array} Top patterns
   */
  #findTopPatterns(data) {
    const patterns = [];

    // User-action patterns
    const userActions = {};
    data.forEach(item => {
      const key = `${item.userId}:${item.action}`;
      userActions[key] = (userActions[key] || 0) + 1;
    });

    const topUserActions = Object.entries(userActions)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([pattern, count]) => {
        const [userId, action] = pattern.split(':');
        return {
          type: 'user-action',
          pattern: { userId, action },
          count,
          percentage: (count / data.length) * 100
        };
      });

    patterns.push(...topUserActions);

    // Time-based patterns
    const hourlyActivity = {};
    data.forEach(item => {
      const hour = new Date(item.timestamp).getHours();
      hourlyActivity[hour] = (hourlyActivity[hour] || 0) + 1;
    });

    const peakHours = Object.entries(hourlyActivity)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([hour, count]) => ({
        type: 'peak-hour',
        pattern: { hour: parseInt(hour) },
        count,
        percentage: (count / data.length) * 100
      }));

    patterns.push(...peakHours);

    return patterns;
  }

  /**
   * Detects anomalies
   * @private
   * @param {Array} data - Data for anomaly detection
   * @returns {Array} Detected anomalies
   */
  #detectAnomalies(data) {
    const anomalies = [];

    // Detect unusual activity volumes
    const userActivity = {};
    data.forEach(item => {
      const date = new Date(item.timestamp).toISOString().substring(0, 10);
      const key = `${item.userId}:${date}`;
      userActivity[key] = (userActivity[key] || 0) + 1;
    });

    // Calculate mean and standard deviation
    const activityCounts = Object.values(userActivity);
    const mean = activityCounts.reduce((a, b) => a + b, 0) / activityCounts.length;
    const variance = activityCounts.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / activityCounts.length;
    const stdDev = Math.sqrt(variance);

    // Flag outliers (3 standard deviations)
    Object.entries(userActivity).forEach(([key, count]) => {
      if (count > mean + (3 * stdDev)) {
        const [userId, date] = key.split(':');
        anomalies.push({
          type: 'high-activity',
          userId,
          date,
          eventCount: count,
          threshold: mean + (3 * stdDev),
          severity: 'medium'
        });
      }
    });

    // Detect failed login patterns
    const failedLogins = data.filter(item => 
      item.eventType === AuditEvents.AUTH.LOGIN_FAILURE
    );

    const failedLoginsByUser = {};
    failedLogins.forEach(item => {
      if (!failedLoginsByUser[item.userId]) {
        failedLoginsByUser[item.userId] = [];
      }
      failedLoginsByUser[item.userId].push(item.timestamp);
    });

    // Check for rapid failed logins
    Object.entries(failedLoginsByUser).forEach(([userId, timestamps]) => {
      if (timestamps.length >= 5) {
        const sorted = timestamps.sort();
        for (let i = 4; i < sorted.length; i++) {
          const timeDiff = new Date(sorted[i]) - new Date(sorted[i - 4]);
          if (timeDiff < 300000) { // 5 minutes
            anomalies.push({
              type: 'brute-force-attempt',
              userId,
              attemptCount: 5,
              timeWindow: '5 minutes',
              severity: 'high'
            });
            break;
          }
        }
      }
    });

    return anomalies;
  }

  /**
   * Gets summary statistics
   * @private
   * @param {Object} options - Statistics options
   * @returns {Promise<Object>} Summary statistics
   */
  async #getSummaryStats(options) {
    if (!this.database) {
      return {};
    }

    const AuditLogModel = require('../../database/models/audit-log-model');

    const stats = {
      totalEvents: await AuditLogModel.countDocuments({}),
      uniqueUsers: await AuditLogModel.distinct('userId').length,
      uniqueResources: await AuditLogModel.distinct('resource').length,
      dateRange: {
        earliest: await AuditLogModel.findOne({}).sort({ timestamp: 1 }).select('timestamp'),
        latest: await AuditLogModel.findOne({}).sort({ timestamp: -1 }).select('timestamp')
      }
    };

    return stats;
  }

  /**
   * Gets event distribution
   * @private
   * @param {Object} options - Statistics options
   * @returns {Promise<Object>} Event distribution
   */
  async #getEventDistribution(options) {
    if (!this.database) {
      return {};
    }

    const AuditLogModel = require('../../database/models/audit-log-model');

    const distribution = await AuditLogModel.aggregate([
      { $group: { _id: '$eventType', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 }
    ]);

    return distribution.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {});
  }

  /**
   * Gets user activity statistics
   * @private
   * @param {Object} options - Statistics options
   * @returns {Promise<Object>} User activity stats
   */
  async #getUserActivityStats(options) {
    if (!this.database) {
      return {};
    }

    const AuditLogModel = require('../../database/models/audit-log-model');

    const topUsers = await AuditLogModel.aggregate([
      { $group: { _id: '$userId', eventCount: { $sum: 1 } } },
      { $sort: { eventCount: -1 } },
      { $limit: 10 }
    ]);

    return {
      topUsers,
      totalUsers: await AuditLogModel.distinct('userId').length
    };
  }

  /**
   * Gets resource access statistics
   * @private
   * @param {Object} options - Statistics options
   * @returns {Promise<Object>} Resource access stats
   */
  async #getResourceAccessStats(options) {
    if (!this.database) {
      return {};
    }

    const AuditLogModel = require('../../database/models/audit-log-model');

    const topResources = await AuditLogModel.aggregate([
      { $group: { _id: '$resource', accessCount: { $sum: 1 } } },
      { $sort: { accessCount: -1 } },
      { $limit: 10 }
    ]);

    return {
      topResources,
      totalResources: await AuditLogModel.distinct('resource').length
    };
  }

  /**
   * Gets time distribution
   * @private
   * @param {Object} options - Statistics options
   * @returns {Promise<Object>} Time distribution
   */
  async #getTimeDistribution(options) {
    if (!this.database) {
      return {};
    }

    const AuditLogModel = require('../../database/models/audit-log-model');

    // Get hourly distribution for the last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const hourlyData = await AuditLogModel.aggregate([
      { $match: { timestamp: { $gte: sevenDaysAgo } } },
      {
        $group: {
          _id: { $hour: '$timestamp' },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    return {
      hourly: hourlyData.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {})
    };
  }

  /**
   * Gets risk analysis
   * @private
   * @param {Object} options - Statistics options
   * @returns {Promise<Object>} Risk analysis
   */
  async #getRiskAnalysis(options) {
    if (!this.database) {
      return {};
    }

    const AuditLogModel = require('../../database/models/audit-log-model');

    const riskDistribution = await AuditLogModel.aggregate([
      { $match: { riskLevel: { $exists: true } } },
      { $group: { _id: '$riskLevel', count: { $sum: 1 } } }
    ]);

    const criticalEvents = await AuditLogModel.find({
      riskLevel: 'critical'
    }).limit(10).sort({ timestamp: -1 });

    return {
      distribution: riskDistribution.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      recentCriticalEvents: criticalEvents
    };
  }

  /**
   * Exports data as CSV
   * @private
   * @param {Object} data - Export data
   * @returns {string} CSV formatted data
   */
  #exportAsCSV(data) {
    const headers = [
      'ID', 'Timestamp', 'Event Type', 'User ID', 'Tenant ID',
      'Resource', 'Action', 'Result', 'Risk Level', 'IP Address'
    ];

    const rows = data.data.map(log => [
      log.id,
      log.timestamp,
      log.eventType,
      log.userId,
      log.tenantId || '',
      log.resource,
      log.action,
      log.result,
      log.riskLevel || '',
      log.context?.ip || ''
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    return csv;
  }

  /**
   * Exports data as JSON Lines
   * @private
   * @param {Object} data - Export data
   * @returns {string} JSONL formatted data
   */
  #exportAsJSONL(data) {
    return data.data.map(log => JSON.stringify(log)).join('\n');
  }

  /**
   * Gets nested value from object
   * @private
   * @param {Object} obj - Object to search
   * @param {string} path - Dot notation path
   * @returns {*} Value at path
   */
  #getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * Updates query statistics
   * @private
   * @param {number} responseTime - Query response time
   */
  #updateQueryStats(responseTime) {
    const { totalQueries, avgResponseTime } = this.queryStats;
    
    this.queryStats.avgResponseTime = 
      (avgResponseTime * (totalQueries - 1) + responseTime) / totalQueries;
  }

  /**
   * Generates cache key
   * @private
   * @param {Object} params - Query parameters
   * @returns {string} Cache key
   */
  #generateCacheKey(params) {
    return `query:${JSON.stringify(params)}`;
  }

  /**
   * Generates snapshot ID
   * @private
   * @returns {string} Snapshot ID
   */
  #generateSnapshotId() {
    return `snapshot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Cleans up expired cache entries
   * @private
   */
  #cleanupCache() {
    const now = Date.now();
    let cleaned = 0;

    // Clean query cache
    for (const [key, value] of this.queryCache) {
      if (now - value.timestamp > this.cacheTTL) {
        this.queryCache.delete(key);
        cleaned++;
      }
    }

    // Clean analytics cache
    for (const [key, value] of this.analyticsCache) {
      if (now - value.timestamp > this.cacheTTL) {
        this.analyticsCache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug('Cache cleanup completed', { entriesCleaned: cleaned });
    }
  }

  /**
   * Gets query performance statistics
   * @returns {Object} Query statistics
   */
  getQueryStats() {
    const { totalQueries, cacheHits, cacheMisses, avgResponseTime } = this.queryStats;
    
    return {
      totalQueries,
      cacheHits,
      cacheMisses,
      cacheHitRate: totalQueries > 0 ? (cacheHits / totalQueries) * 100 : 0,
      avgResponseTime: Math.round(avgResponseTime),
      cacheSize: this.queryCache.size + this.analyticsCache.size
    };
  }

  /**
   * Clears all caches
   */
  clearCache() {
    this.queryCache.clear();
    this.analyticsCache.clear();
    
    logger.info('Audit trail caches cleared');
  }

  /**
   * Cleans up resources
   */
  cleanup() {
    if (this.cacheCleanupInterval) {
      clearInterval(this.cacheCleanupInterval);
    }

    this.clearCache();
    
    logger.info('AuditTrail cleanup completed');
  }
}

module.exports = AuditTrail;