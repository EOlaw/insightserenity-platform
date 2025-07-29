'use strict';

/**
 * @fileoverview Enterprise-grade search service with Elasticsearch and in-memory fallback
 * @module shared/lib/services/search-service
 * @requires module:@elastic/elasticsearch
 * @requires module:fuse.js
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/config
 */

const { Client: ElasticsearchClient } = require('@elastic/elasticsearch');
const Fuse = require('fuse.js');
const logger = require('../utils/logger');
const AppError = require('../utils/app-error');
const CacheService = require('./cache-service');
const config = require('../../config');
const { ERROR_CODES } = require('../utils/constants/error-codes');
const crypto = require('crypto');

/**
 * @class SearchService
 * @description Comprehensive search service with Elasticsearch primary and Fuse.js fallback
 */
class SearchService {
  /**
   * @private
   * @type {ElasticsearchClient}
   */
  #elasticClient;

  /**
   * @private
   * @type {Map<string, Fuse>}
   */
  #fuseIndexes;

  /**
   * @private
   * @type {CacheService}
   */
  #cacheService;

  /**
   * @private
   * @type {Object}
   */
  #config;

  /**
   * @private
   * @type {boolean}
   */
  #isConnected;

  /**
   * @private
   * @type {Map<string, Object>}
   */
  #indexMappings;

  /**
   * @private
   * @type {Map<string, Object>}
   */
  #searchStats;

  /**
   * @private
   * @type {Set<string>}
   */
  #indexingQueue;

  /**
   * @private
   * @static
   * @type {SearchService}
   */
  static #instance;

  /**
   * Creates search service instance
   * @param {Object} [options] - Configuration options
   */
  constructor(options = {}) {
    this.#config = {
      elasticsearch: {
        node: config.elasticsearch?.node || 'http://localhost:9200',
        auth: config.elasticsearch?.auth,
        maxRetries: 3,
        requestTimeout: 30000,
        ...options.elasticsearch
      },
      indexPrefix: options.indexPrefix || config.elasticsearch?.indexPrefix || 'insightserenity_',
      defaultPageSize: options.defaultPageSize || 20,
      maxPageSize: options.maxPageSize || 100,
      cacheResults: options.cacheResults ?? true,
      cacheTTL: options.cacheTTL || 300, // 5 minutes
      enableHighlighting: options.enableHighlighting ?? true,
      enableSuggestions: options.enableSuggestions ?? true,
      enableAggregations: options.enableAggregations ?? true,
      fuse: {
        threshold: 0.3,
        keys: [],
        includeScore: true,
        includeMatches: true,
        ...options.fuse
      }
    };

    this.#isConnected = false;
    this.#fuseIndexes = new Map();
    this.#indexMappings = new Map();
    this.#searchStats = new Map();
    this.#indexingQueue = new Set();
    this.#cacheService = new CacheService({ namespace: 'search' });

    this.#initialize();
  }

  /**
   * Get singleton instance
   * @static
   * @param {Object} [options] - Configuration options
   * @returns {SearchService} Search service instance
   */
  static getInstance(options) {
    if (!this.#instance) {
      this.#instance = new SearchService(options);
    }
    return this.#instance;
  }

  /**
   * Perform search query
   * @param {Object} options - Search options
   * @param {string} options.index - Index name
   * @param {string} options.query - Search query
   * @param {Object} [options.filters] - Additional filters
   * @param {Array<string>} [options.fields] - Fields to search
   * @param {number} [options.page=1] - Page number
   * @param {number} [options.pageSize] - Results per page
   * @param {Object} [options.sort] - Sort configuration
   * @param {Array<Object>} [options.aggregations] - Aggregations
   * @param {boolean} [options.highlight=true] - Enable highlighting
   * @param {boolean} [options.suggest=true] - Enable suggestions
   * @returns {Promise<Object>} Search results
   */
  async search(options) {
    const startTime = Date.now();
    const searchId = this.#generateSearchId();

    try {
      // Validate options
      const validated = this.#validateSearchOptions(options);
      
      // Check cache
      if (this.#config.cacheResults) {
        const cached = await this.#getCachedResults(validated);
        if (cached) {
          return cached;
        }
      }

      // Perform search
      let results;
      if (this.#isConnected) {
        results = await this.#searchElasticsearch(validated, searchId);
      } else {
        results = await this.#searchFuse(validated, searchId);
      }

      // Cache results
      if (this.#config.cacheResults && results.totalResults > 0) {
        await this.#cacheResults(validated, results);
      }

      // Update stats
      this.#updateSearchStats(validated.index, Date.now() - startTime, true);

      logger.debug('Search completed', {
        searchId,
        index: validated.index,
        query: validated.query,
        results: results.totalResults,
        duration: Date.now() - startTime
      });

      return results;

    } catch (error) {
      this.#updateSearchStats(options.index, Date.now() - startTime, false);
      
      logger.error('Search failed', {
        searchId,
        error: error.message,
        options
      });

      throw error instanceof AppError ? error : new AppError(
        'Search failed',
        500,
        ERROR_CODES.SEARCH_ERROR,
        { searchId, originalError: error.message }
      );
    }
  }

  /**
   * Index document
   * @param {Object} options - Index options
   * @param {string} options.index - Index name
   * @param {string} options.id - Document ID
   * @param {Object} options.document - Document to index
   * @param {boolean} [options.refresh=false] - Refresh index immediately
   * @returns {Promise<Object>} Index result
   */
  async index(options) {
    const { index, id, document, refresh = false } = options;
    const fullIndex = this.#getFullIndexName(index);

    try {
      // Add to indexing queue for deduplication
      const queueKey = `${fullIndex}:${id}`;
      if (this.#indexingQueue.has(queueKey)) {
        logger.debug('Document already in indexing queue', { index, id });
        return { indexed: false, reason: 'duplicate' };
      }
      this.#indexingQueue.add(queueKey);

      // Ensure index exists
      await this.#ensureIndex(index);

      // Index document
      let result;
      if (this.#isConnected) {
        result = await this.#elasticClient.index({
          index: fullIndex,
          id,
          body: document,
          refresh: refresh ? 'true' : false
        });
      }

      // Update Fuse index
      await this.#updateFuseIndex(index, id, document);

      logger.debug('Document indexed', { index, id });
      
      return {
        indexed: true,
        id: result?._id || id,
        version: result?._version || 1
      };

    } catch (error) {
      logger.error('Index error', { index, id, error: error.message });
      throw new AppError(
        'Failed to index document',
        500,
        ERROR_CODES.INDEX_ERROR,
        { index, id, error: error.message }
      );
    } finally {
      this.#indexingQueue.delete(`${fullIndex}:${id}`);
    }
  }

  /**
   * Bulk index documents
   * @param {Object} options - Bulk index options
   * @param {string} options.index - Index name
   * @param {Array<Object>} options.documents - Documents to index
   * @param {boolean} [options.refresh=false] - Refresh index after bulk operation
   * @returns {Promise<Object>} Bulk index results
   */
  async bulkIndex(options) {
    const { index, documents, refresh = false } = options;
    const fullIndex = this.#getFullIndexName(index);
    const startTime = Date.now();

    try {
      // Ensure index exists
      await this.#ensureIndex(index);

      const results = {
        total: documents.length,
        indexed: 0,
        failed: 0,
        errors: []
      };

      if (this.#isConnected) {
        // Prepare bulk operations
        const bulkBody = [];
        documents.forEach(doc => {
          bulkBody.push({ index: { _index: fullIndex, _id: doc.id } });
          bulkBody.push(doc.document || doc);
        });

        // Execute bulk operation
        const bulkResponse = await this.#elasticClient.bulk({
          body: bulkBody,
          refresh: refresh ? 'true' : false
        });

        // Process response
        bulkResponse.items.forEach((item, idx) => {
          if (item.index.error) {
            results.failed++;
            results.errors.push({
              id: documents[idx].id,
              error: item.index.error
            });
          } else {
            results.indexed++;
          }
        });
      }

      // Update Fuse indexes
      for (const doc of documents) {
        await this.#updateFuseIndex(index, doc.id, doc.document || doc);
      }

      logger.info('Bulk index completed', {
        index,
        ...results,
        duration: Date.now() - startTime
      });

      return results;

    } catch (error) {
      logger.error('Bulk index error', { index, error: error.message });
      throw new AppError(
        'Bulk index failed',
        500,
        ERROR_CODES.BULK_INDEX_ERROR,
        { index, error: error.message }
      );
    }
  }

  /**
   * Delete document from index
   * @param {Object} options - Delete options
   * @param {string} options.index - Index name
   * @param {string} options.id - Document ID
   * @param {boolean} [options.refresh=false] - Refresh index immediately
   * @returns {Promise<boolean>} Success status
   */
  async delete(options) {
    const { index, id, refresh = false } = options;
    const fullIndex = this.#getFullIndexName(index);

    try {
      let deleted = false;

      if (this.#isConnected) {
        const result = await this.#elasticClient.delete({
          index: fullIndex,
          id,
          refresh: refresh ? 'true' : false
        });
        deleted = result.result === 'deleted';
      }

      // Update Fuse index
      await this.#deleteFuseDocument(index, id);

      // Clear cached results for this index
      await this.#clearIndexCache(index);

      logger.debug('Document deleted', { index, id, deleted });
      return deleted;

    } catch (error) {
      if (error.statusCode === 404) {
        return false;
      }
      
      logger.error('Delete error', { index, id, error: error.message });
      throw new AppError(
        'Failed to delete document',
        500,
        ERROR_CODES.DELETE_ERROR,
        { index, id, error: error.message }
      );
    }
  }

  /**
   * Create or update index mapping
   * @param {Object} options - Mapping options
   * @param {string} options.index - Index name
   * @param {Object} options.mapping - Index mapping
   * @param {Object} [options.settings] - Index settings
   * @returns {Promise<boolean>} Success status
   */
  async createIndex(options) {
    const { index, mapping, settings } = options;
    const fullIndex = this.#getFullIndexName(index);

    try {
      // Store mapping for future use
      this.#indexMappings.set(index, { mapping, settings });

      if (this.#isConnected) {
        // Check if index exists
        const exists = await this.#elasticClient.indices.exists({ index: fullIndex });

        if (!exists) {
          // Create index with mapping and settings
          await this.#elasticClient.indices.create({
            index: fullIndex,
            body: {
              settings: {
                number_of_shards: 1,
                number_of_replicas: 1,
                ...settings
              },
              mappings: mapping
            }
          });

          logger.info('Index created', { index: fullIndex });
        } else {
          // Update mapping
          await this.#elasticClient.indices.putMapping({
            index: fullIndex,
            body: mapping
          });

          logger.info('Index mapping updated', { index: fullIndex });
        }
      }

      // Initialize Fuse index
      this.#initializeFuseIndex(index, mapping);

      return true;

    } catch (error) {
      logger.error('Create index error', { index, error: error.message });
      throw new AppError(
        'Failed to create index',
        500,
        ERROR_CODES.CREATE_INDEX_ERROR,
        { index, error: error.message }
      );
    }
  }

  /**
   * Delete index
   * @param {Object} options - Delete options
   * @param {string} options.index - Index name
   * @param {boolean} [options.confirm=false] - Confirmation flag
   * @returns {Promise<boolean>} Success status
   */
  async deleteIndex(options) {
    const { index, confirm = false } = options;
    
    if (!confirm) {
      throw new AppError(
        'Index deletion requires confirmation',
        400,
        ERROR_CODES.CONFIRMATION_REQUIRED
      );
    }

    const fullIndex = this.#getFullIndexName(index);

    try {
      if (this.#isConnected) {
        await this.#elasticClient.indices.delete({ index: fullIndex });
      }

      // Remove Fuse index
      this.#fuseIndexes.delete(index);
      this.#indexMappings.delete(index);

      // Clear all cache for this index
      await this.#clearIndexCache(index);

      logger.info('Index deleted', { index: fullIndex });
      return true;

    } catch (error) {
      if (error.statusCode === 404) {
        return false;
      }
      
      logger.error('Delete index error', { index, error: error.message });
      throw new AppError(
        'Failed to delete index',
        500,
        ERROR_CODES.DELETE_INDEX_ERROR,
        { index, error: error.message }
      );
    }
  }

  /**
   * Get search suggestions
   * @param {Object} options - Suggestion options
   * @param {string} options.index - Index name
   * @param {string} options.query - Partial query
   * @param {string} options.field - Field to get suggestions from
   * @param {number} [options.size=5] - Number of suggestions
   * @returns {Promise<Array>} Suggestions
   */
  async suggest(options) {
    const { index, query, field, size = 5 } = options;
    const fullIndex = this.#getFullIndexName(index);

    try {
      if (this.#isConnected) {
        const response = await this.#elasticClient.search({
          index: fullIndex,
          body: {
            suggest: {
              text: query,
              completion: {
                field,
                size,
                skip_duplicates: true,
                fuzzy: {
                  fuzziness: 'AUTO'
                }
              }
            }
          }
        });

        return response.suggest.completion[0].options.map(opt => ({
          text: opt.text,
          score: opt._score
        }));
      }

      // Fallback to simple prefix matching with Fuse
      return this.#getFuseSuggestions(index, query, field, size);

    } catch (error) {
      logger.error('Suggest error', { index, query, error: error.message });
      return [];
    }
  }

  /**
   * Perform aggregation query
   * @param {Object} options - Aggregation options
   * @param {string} options.index - Index name
   * @param {Object} options.aggregations - Aggregation configuration
   * @param {Object} [options.query] - Filter query
   * @returns {Promise<Object>} Aggregation results
   */
  async aggregate(options) {
    const { index, aggregations, query } = options;
    const fullIndex = this.#getFullIndexName(index);

    try {
      if (!this.#isConnected) {
        throw new AppError(
          'Aggregations require Elasticsearch connection',
          503,
          ERROR_CODES.SERVICE_UNAVAILABLE
        );
      }

      const searchBody = {
        size: 0,
        aggs: aggregations
      };

      if (query) {
        searchBody.query = this.#buildElasticsearchQuery(query);
      }

      const response = await this.#elasticClient.search({
        index: fullIndex,
        body: searchBody
      });

      return response.aggregations;

    } catch (error) {
      logger.error('Aggregation error', { index, error: error.message });
      throw new AppError(
        'Aggregation failed',
        500,
        ERROR_CODES.AGGREGATION_ERROR,
        { index, error: error.message }
      );
    }
  }

  /**
   * Get search statistics
   * @returns {Object} Search statistics
   */
  getStats() {
    const stats = {
      connected: this.#isConnected,
      indexes: {},
      totalSearches: 0,
      avgSearchTime: 0
    };

    let totalTime = 0;
    let totalSearches = 0;

    this.#searchStats.forEach((indexStats, indexName) => {
      stats.indexes[indexName] = {
        searches: indexStats.searches,
        avgTime: indexStats.totalTime / indexStats.searches,
        successRate: (indexStats.successful / indexStats.searches) * 100,
        lastSearched: indexStats.lastSearched
      };

      totalSearches += indexStats.searches;
      totalTime += indexStats.totalTime;
    });

    stats.totalSearches = totalSearches;
    stats.avgSearchTime = totalSearches > 0 ? totalTime / totalSearches : 0;

    return stats;
  }

  /**
   * @private
   * Initialize search service
   */
  async #initialize() {
    try {
      // Initialize Elasticsearch client
      this.#elasticClient = new ElasticsearchClient(this.#config.elasticsearch);

      // Test connection
      await this.#elasticClient.ping();
      
      this.#isConnected = true;
      logger.info('SearchService initialized with Elasticsearch', {
        node: this.#config.elasticsearch.node
      });

      // Set up predefined indexes
      await this.#setupPredefinedIndexes();

    } catch (error) {
      logger.warn('Elasticsearch connection failed, using in-memory search', {
        error: error.message
      });
      this.#isConnected = false;
    }
  }

  /**
   * @private
   * Set up predefined indexes
   */
  async #setupPredefinedIndexes() {
    const predefinedIndexes = {
      users: {
        properties: {
          name: { type: 'text', analyzer: 'standard' },
          email: { type: 'keyword' },
          organizationId: { type: 'keyword' },
          role: { type: 'keyword' },
          createdAt: { type: 'date' }
        }
      },
      organizations: {
        properties: {
          name: { type: 'text', analyzer: 'standard' },
          description: { type: 'text' },
          industry: { type: 'keyword' },
          size: { type: 'keyword' },
          createdAt: { type: 'date' }
        }
      },
      consultants: {
        properties: {
          name: { type: 'text', analyzer: 'standard' },
          skills: { type: 'keyword' },
          experience: { type: 'integer' },
          rate: { type: 'float' },
          availability: { type: 'boolean' }
        }
      },
      projects: {
        properties: {
          title: { type: 'text', analyzer: 'standard' },
          description: { type: 'text' },
          status: { type: 'keyword' },
          clientId: { type: 'keyword' },
          consultantIds: { type: 'keyword' },
          startDate: { type: 'date' },
          endDate: { type: 'date' }
        }
      }
    };

    for (const [index, mapping] of Object.entries(predefinedIndexes)) {
      try {
        await this.createIndex({
          index,
          mapping: { properties: mapping.properties }
        });
      } catch (error) {
        logger.error('Failed to create predefined index', { index, error: error.message });
      }
    }
  }

  /**
   * @private
   * Search using Elasticsearch
   */
  async #searchElasticsearch(options, searchId) {
    const { 
      index, 
      query, 
      filters, 
      fields, 
      page, 
      pageSize, 
      sort, 
      aggregations,
      highlight,
      suggest
    } = options;

    const fullIndex = this.#getFullIndexName(index);
    const from = (page - 1) * pageSize;

    // Build search body
    const searchBody = {
      from,
      size: pageSize,
      query: this.#buildElasticsearchQuery(query, filters, fields),
      track_total_hits: true
    };

    // Add sorting
    if (sort) {
      searchBody.sort = this.#buildSort(sort);
    }

    // Add highlighting
    if (highlight && this.#config.enableHighlighting) {
      searchBody.highlight = {
        fields: fields ? fields.reduce((acc, field) => {
          acc[field] = {};
          return acc;
        }, {}) : { '*': {} },
        pre_tags: ['<mark>'],
        post_tags: ['</mark>']
      };
    }

    // Add aggregations
    if (aggregations && this.#config.enableAggregations) {
      searchBody.aggs = aggregations;
    }

    // Add suggestions
    if (suggest && this.#config.enableSuggestions && query) {
      searchBody.suggest = {
        text: query,
        simple_phrase: {
          phrase: {
            field: fields?.[0] || '_all',
            size: 3,
            gram_size: 2,
            direct_generator: [{
              field: fields?.[0] || '_all',
              suggest_mode: 'popular'
            }]
          }
        }
      };
    }

    // Execute search
    const response = await this.#elasticClient.search({
      index: fullIndex,
      body: searchBody
    });

    // Process results
    return {
      searchId,
      totalResults: response.hits.total.value,
      results: response.hits.hits.map(hit => ({
        id: hit._id,
        score: hit._score,
        source: hit._source,
        highlight: hit.highlight || null
      })),
      aggregations: response.aggregations || null,
      suggestions: response.suggest ? this.#processSuggestions(response.suggest) : null,
      page,
      pageSize,
      totalPages: Math.ceil(response.hits.total.value / pageSize),
      took: response.took
    };
  }

  /**
   * @private
   * Search using Fuse.js
   */
  async #searchFuse(options, searchId) {
    const { index, query, page, pageSize } = options;
    
    const fuseIndex = this.#fuseIndexes.get(index);
    if (!fuseIndex) {
      return {
        searchId,
        totalResults: 0,
        results: [],
        page,
        pageSize,
        totalPages: 0
      };
    }

    // Perform search
    const searchResults = query ? fuseIndex.search(query) : fuseIndex.getIndex().docs;
    
    // Apply pagination
    const from = (page - 1) * pageSize;
    const paginatedResults = searchResults.slice(from, from + pageSize);

    return {
      searchId,
      totalResults: searchResults.length,
      results: paginatedResults.map(result => ({
        id: result.item?.id || result.refIndex,
        score: result.score || 1,
        source: result.item || result,
        highlight: result.matches ? this.#formatFuseHighlights(result.matches) : null
      })),
      page,
      pageSize,
      totalPages: Math.ceil(searchResults.length / pageSize)
    };
  }

  /**
   * @private
   * Initialize Fuse index
   */
  #initializeFuseIndex(index, mapping) {
    // Extract searchable fields from mapping
    const keys = [];
    if (mapping?.properties) {
      Object.entries(mapping.properties).forEach(([field, config]) => {
        if (config.type === 'text' || config.type === 'keyword') {
          keys.push({
            name: field,
            weight: config.boost || 1
          });
        }
      });
    }

    const fuseOptions = {
      ...this.#config.fuse,
      keys: keys.length > 0 ? keys : this.#config.fuse.keys
    };

    this.#fuseIndexes.set(index, new Fuse([], fuseOptions));
  }

  /**
   * @private
   * Update Fuse index with document
   */
  async #updateFuseIndex(index, id, document) {
    let fuseIndex = this.#fuseIndexes.get(index);
    
    if (!fuseIndex) {
      this.#initializeFuseIndex(index, this.#indexMappings.get(index)?.mapping);
      fuseIndex = this.#fuseIndexes.get(index);
    }

    if (fuseIndex) {
      // Remove existing document
      fuseIndex.remove(doc => doc.id === id);
      
      // Add new document
      fuseIndex.add({ id, ...document });
    }
  }

  /**
   * @private
   * Delete document from Fuse index
   */
  async #deleteFuseDocument(index, id) {
    const fuseIndex = this.#fuseIndexes.get(index);
    if (fuseIndex) {
      fuseIndex.remove(doc => doc.id === id);
    }
  }

  /**
   * @private
   * Build Elasticsearch query
   */
  #buildElasticsearchQuery(query, filters, fields) {
    const must = [];
    const filter = [];

    // Add main query
    if (query) {
      if (fields && fields.length > 0) {
        must.push({
          multi_match: {
            query,
            fields,
            type: 'best_fields',
            fuzziness: 'AUTO'
          }
        });
      } else {
        must.push({
          query_string: {
            query: `*${query}*`,
            analyze_wildcard: true,
            default_operator: 'AND'
          }
        });
      }
    }

    // Add filters
    if (filters) {
      Object.entries(filters).forEach(([field, value]) => {
        if (Array.isArray(value)) {
          filter.push({ terms: { [field]: value } });
        } else if (typeof value === 'object') {
          // Range query
          if (value.gte || value.lte || value.gt || value.lt) {
            filter.push({ range: { [field]: value } });
          }
        } else {
          filter.push({ term: { [field]: value } });
        }
      });
    }

    // Build final query
    if (must.length === 0 && filter.length === 0) {
      return { match_all: {} };
    }

    const bool = {};
    if (must.length > 0) bool.must = must;
    if (filter.length > 0) bool.filter = filter;

    return { bool };
  }

  /**
   * @private
   * Build sort configuration
   */
  #buildSort(sort) {
    if (typeof sort === 'string') {
      return [{ [sort]: 'asc' }];
    }

    if (Array.isArray(sort)) {
      return sort.map(s => {
        if (typeof s === 'string') {
          return { [s]: 'asc' };
        }
        return s;
      });
    }

    return [sort];
  }

  /**
   * @private
   * Process Elasticsearch suggestions
   */
  #processSuggestions(suggest) {
    const processed = [];
    
    Object.values(suggest).forEach(suggestion => {
      suggestion[0].options.forEach(option => {
        processed.push({
          text: option.text,
          score: option.score
        });
      });
    });

    return processed;
  }

  /**
   * @private
   * Format Fuse.js highlights
   */
  #formatFuseHighlights(matches) {
    const highlights = {};
    
    matches.forEach(match => {
      if (!highlights[match.key]) {
        highlights[match.key] = [];
      }
      
      const text = match.value;
      const indices = match.indices;
      let highlighted = '';
      let lastIndex = 0;
      
      indices.forEach(([start, end]) => {
        highlighted += text.substring(lastIndex, start);
        highlighted += '<mark>' + text.substring(start, end + 1) + '</mark>';
        lastIndex = end + 1;
      });
      
      highlighted += text.substring(lastIndex);
      highlights[match.key].push(highlighted);
    });

    return highlights;
  }

  /**
   * @private
   * Get Fuse suggestions
   */
  #getFuseSuggestions(index, query, field, size) {
    const fuseIndex = this.#fuseIndexes.get(index);
    if (!fuseIndex) return [];

    const allDocs = fuseIndex.getIndex().docs;
    const suggestions = new Set();

    allDocs.forEach(doc => {
      const fieldValue = doc[field];
      if (fieldValue && typeof fieldValue === 'string' && 
          fieldValue.toLowerCase().startsWith(query.toLowerCase())) {
        suggestions.add(fieldValue);
      }
    });

    return Array.from(suggestions)
      .slice(0, size)
      .map(text => ({ text, score: 1 }));
  }

  /**
   * @private
   * Validate search options
   */
  #validateSearchOptions(options) {
    const validated = { ...options };
    
    if (!validated.index) {
      throw new AppError(
        'Index name is required',
        400,
        ERROR_CODES.VALIDATION_ERROR
      );
    }

    validated.page = Math.max(1, validated.page || 1);
    validated.pageSize = Math.min(
      this.#config.maxPageSize,
      validated.pageSize || this.#config.defaultPageSize
    );

    validated.highlight = validated.highlight ?? this.#config.enableHighlighting;
    validated.suggest = validated.suggest ?? this.#config.enableSuggestions;

    return validated;
  }

  /**
   * @private
   * Get full index name
   */
  #getFullIndexName(index) {
    return `${this.#config.indexPrefix}${index}`;
  }

  /**
   * @private
   * Ensure index exists
   */
  async #ensureIndex(index) {
    if (!this.#indexMappings.has(index)) {
      // Create with default mapping
      await this.createIndex({
        index,
        mapping: {
          properties: {
            _all: { type: 'text' }
          }
        }
      });
    }
  }

  /**
   * @private
   * Get cached search results
   */
  async #getCachedResults(options) {
    const cacheKey = this.#buildCacheKey(options);
    return await this.#cacheService.get(cacheKey);
  }

  /**
   * @private
   * Cache search results
   */
  async #cacheResults(options, results) {
    const cacheKey = this.#buildCacheKey(options);
    await this.#cacheService.set(cacheKey, results, this.#config.cacheTTL);
  }

  /**
   * @private
   * Clear index cache
   */
  async #clearIndexCache(index) {
    await this.#cacheService.deletePattern(`search:${index}:*`);
  }

  /**
   * @private
   * Build cache key
   */
  #buildCacheKey(options) {
    const keyParts = [
      'search',
      options.index,
      options.query || 'all',
      options.page,
      options.pageSize
    ];

    if (options.filters) {
      keyParts.push(crypto.createHash('sha256')
        .update(JSON.stringify(options.filters))
        .digest('hex')
        .substring(0, 8));
    }

    return keyParts.join(':');
  }

  /**
   * @private
   * Update search statistics
   */
  #updateSearchStats(index, duration, success) {
    if (!this.#searchStats.has(index)) {
      this.#searchStats.set(index, {
        searches: 0,
        successful: 0,
        totalTime: 0,
        lastSearched: null
      });
    }

    const stats = this.#searchStats.get(index);
    stats.searches++;
    stats.totalTime += duration;
    if (success) stats.successful++;
    stats.lastSearched = new Date();
  }

  /**
   * @private
   * Generate search ID
   */
  #generateSearchId() {
    return `search_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * Graceful shutdown
   * @returns {Promise<void>}
   */
  async shutdown() {
    logger.info('Shutting down SearchService');

    if (this.#elasticClient) {
      await this.#elasticClient.close();
    }

    this.#fuseIndexes.clear();
    this.#indexMappings.clear();
    this.#searchStats.clear();

    await this.#cacheService.shutdown();

    this.#isConnected = false;
    logger.info('SearchService shutdown complete');
  }
}

module.exports = SearchService;