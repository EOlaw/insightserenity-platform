'use strict';

/**
 * @fileoverview Enterprise knowledge base controller for comprehensive knowledge management operations
 * @module servers/admin-server/modules/support-administration/controllers/knowledge-base-controller
 * @requires module:servers/admin-server/modules/support-administration/services/knowledge-base-service
 * @requires module:servers/admin-server/modules/support-administration/models/knowledge-article-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/response-formatter
 * @requires module:shared/lib/utils/async-handler
 * @requires module:shared/lib/utils/validators/common-validators
 * @requires module:shared/lib/utils/helpers/pagination-helper
 * @requires module:shared/lib/utils/helpers/date-helper
 * @requires module:shared/lib/utils/helpers/crypto-helper
 * @requires module:shared/lib/utils/helpers/string-helper
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/services/audit-service
 * @requires module:shared/lib/services/notification-service
 * @requires module:shared/lib/services/file-service
 */

const KnowledgeBaseService = require('../services/knowledge-base-service');
const KnowledgeArticle = require('../models/knowledge-article-model');
const logger = require('../../../../../shared/lib/utils/logger');
const { AppError } = require('../../../../../shared/lib/utils/app-error');
const { ResponseFormatter } = require('../../../../../shared/lib/utils/response-formatter');
const { asyncHandler } = require('../../../../../shared/lib/utils/async-handler');
const CommonValidator = require('../../../../../shared/lib/utils/validators/common-validators');
const paginationHelper = require('../../../../../shared/lib/utils/helpers/pagination-helper');
const dateHelper = require('../../../../../shared/lib/utils/helpers/date-helper');
const cryptoHelper = require('../../../../../shared/lib/utils/helpers/crypto-helper');
const stringHelper = require('../../../../../shared/lib/utils/helpers/string-helper');
const CacheService = require('../../../../../shared/lib/services/cache-service');
const AuditService = require('../../../../../shared/lib/services/audit-service');
const NotificationService = require('../../../../../shared/lib/services/notification-service');
const FileService = require('../../../../../shared/lib/services/file-service');

/**
 * @class KnowledgeBaseController
 * @description Comprehensive knowledge base controller for enterprise knowledge management operations
 */
class KnowledgeBaseController {
  #knowledgeBaseService;
  #cacheService;
  #auditService;
  #notificationService;
  #fileService;
  #responseFormatter;
  #initialized;
  #controllerName;
  #config;

  /**
   * @constructor
   * @description Initialize knowledge base controller with dependencies
   */
  constructor() {
    this.#knowledgeBaseService = new KnowledgeBaseService();
    this.#cacheService = new CacheService();
    this.#auditService = new AuditService();
    this.#notificationService = new NotificationService();
    this.#fileService = new FileService();
    this.#responseFormatter = new ResponseFormatter();
    this.#initialized = false;
    this.#controllerName = 'KnowledgeBaseController';
    
    this.#config = {
      cachePrefix: 'kb_ctrl:',
      cacheTTL: 3600,
      defaultPageSize: 20,
      maxPageSize: 100,
      maxBulkOperations: 500,
      rateLimits: {
        create: { windowMs: 300000, max: 20 },
        update: { windowMs: 300000, max: 50 },
        publish: { windowMs: 300000, max: 30 },
        search: { windowMs: 60000, max: 100 },
        bulk: { windowMs: 600000, max: 5 }
      },
      validation: {
        maxTitleLength: 200,
        maxSummaryLength: 500,
        maxContentLength: 100000,
        maxKeywords: 20,
        maxTags: 30,
        minContentWords: 50,
        maxAttachments: 10,
        maxAttachmentSize: 50 * 1024 * 1024, // 50MB
        allowedContentTypes: [
          'text/html', 'text/markdown', 'text/plain',
          'application/pdf', 'image/jpeg', 'image/png', 'image/gif',
          'video/mp4', 'video/webm'
        ],
        requiredFields: ['title', 'content', 'category']
      },
      features: {
        versionControl: true,
        autoSave: true,
        collaborativeEditing: true,
        aiEnhancement: true,
        autoTranslation: true,
        contentAnalysis: true,
        duplicateDetection: true,
        seoOptimization: true,
        readabilityAnalysis: true,
        mediaManagement: true
      },
      publishing: {
        requireReview: true,
        autoPublish: false,
        schedulePublishing: true,
        multiChannel: true,
        contentSyndication: true,
        versionBumping: true
      },
      security: {
        requireArticleAccess: true,
        auditAllOperations: true,
        contentScanning: true,
        validateUploads: true,
        preventXSS: true,
        sanitizeContent: true,
        encryptSensitive: true
      },
      analytics: {
        trackViews: true,
        trackEngagement: true,
        trackSearches: true,
        trackFeedback: true,
        generateInsights: true
      }
    };
  }

  /**
   * Initialize the knowledge base controller
   * @async
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      if (this.#initialized) {
        logger.warn(`${this.#controllerName} already initialized`);
        return;
      }

      await this.#knowledgeBaseService.initialize();
      await this.#cacheService.initialize();
      await this.#auditService.initialize();
      await this.#notificationService.initialize();
      await this.#fileService.initialize();
      
      this.#initialized = true;
      logger.info(`${this.#controllerName} initialized successfully`);
    } catch (error) {
      logger.error(`Failed to initialize ${this.#controllerName}:`, error);
      throw new AppError('Knowledge base controller initialization failed', 500);
    }
  }

  /**
   * Handle article creation
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   */
  createArticle = asyncHandler(async (req, res, next) => {
    try {
      const articleData = req.body;
      const context = this.#buildRequestContext(req);

      // Validate article creation data
      await this.#validateArticleCreation(articleData, context);

      // Apply rate limiting
      await this.#checkRateLimit('create', context);

      // Process uploaded files if any
      if (req.files) {
        articleData.attachments = await this.#processFileUploads(req.files, context);
      }

      // Create article
      const result = await this.#knowledgeBaseService.processKnowledgeOperation(
        'CREATE_ARTICLE',
        articleData,
        context
      );

      const response = this.#responseFormatter.success(result, 'Article created successfully', {
        articleId: result.article?.articleId,
        status: result.article?.publishing?.status?.current,
        timestamp: new Date().toISOString(),
        processingTime: Date.now() - context.startTime
      });

      res.status(201).json(response);

    } catch (error) {
      logger.error('Failed to create article:', error);
      await this.#handleKnowledgeError(error, req, res, 'CREATE_ARTICLE');
    }
  });

  /**
   * Handle article updates
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   */
  updateArticle = asyncHandler(async (req, res, next) => {
    try {
      const { articleId } = req.params;
      const updateData = { ...req.body, articleId };
      const context = this.#buildRequestContext(req);

      // Validate article access
      await this.#validateArticleAccess(articleId, context, 'UPDATE');

      // Validate update data
      await this.#validateArticleUpdate(updateData, context);

      // Process file updates if any
      if (req.files) {
        updateData.newAttachments = await this.#processFileUploads(req.files, context);
      }

      // Update article
      const result = await this.#knowledgeBaseService.processKnowledgeOperation(
        'UPDATE_ARTICLE',
        updateData,
        context
      );

      const response = this.#responseFormatter.success(result, 'Article updated successfully', {
        articleId,
        version: result.article?.versioning?.currentVersion?.versionString,
        timestamp: new Date().toISOString(),
        processingTime: Date.now() - context.startTime
      });

      res.status(200).json(response);

    } catch (error) {
      logger.error(`Failed to update article ${req.params.articleId}:`, error);
      await this.#handleKnowledgeError(error, req, res, 'UPDATE_ARTICLE');
    }
  });

  /**
   * Handle article publishing operations
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   */
  publishArticle = asyncHandler(async (req, res, next) => {
    try {
      const { articleId } = req.params;
      const { operation } = req.params;
      const publishData = { ...req.body, articleId };
      const context = this.#buildRequestContext(req);

      // Validate article access
      await this.#validateArticleAccess(articleId, context, 'PUBLISH');

      // Apply publish rate limiting
      await this.#checkRateLimit('publish', context);

      // Validate publishing data
      await this.#validatePublishingOperation(operation, publishData, context);

      let result;

      switch (operation) {
        case 'publish':
          result = await this.#knowledgeBaseService.processKnowledgeOperation(
            'PUBLISH_ARTICLE',
            publishData,
            context
          );
          break;

        case 'unpublish':
          result = await this.#knowledgeBaseService.processKnowledgeOperation(
            'UNPUBLISH_ARTICLE',
            publishData,
            context
          );
          break;

        case 'schedule':
          result = await this.#knowledgeBaseService.processKnowledgeOperation(
            'SCHEDULE_PUBLISH',
            publishData,
            context
          );
          break;

        case 'cancel-schedule':
          result = await this.#knowledgeBaseService.processKnowledgeOperation(
            'CANCEL_SCHEDULED_PUBLISH',
            publishData,
            context
          );
          break;

        case 'publish-channel':
          result = await this.#knowledgeBaseService.processKnowledgeOperation(
            'PUBLISH_TO_CHANNEL',
            publishData,
            context
          );
          break;

        case 'syndicate':
          result = await this.#knowledgeBaseService.processKnowledgeOperation(
            'SYNDICATE_CONTENT',
            publishData,
            context
          );
          break;

        default:
          throw new AppError(`Unknown publishing operation: ${operation}`, 400);
      }

      const response = this.#responseFormatter.success(result, `Article ${operation} completed successfully`, {
        articleId,
        operation,
        publishedChannels: publishData.channels,
        timestamp: new Date().toISOString()
      });

      res.status(200).json(response);

    } catch (error) {
      logger.error(`Failed to execute publishing operation ${req.params.operation} for article ${req.params.articleId}:`, error);
      await this.#handleKnowledgeError(error, req, res, 'PUBLISH_OPERATION');
    }
  });

  /**
   * Handle article version control operations
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   */
  manageVersions = asyncHandler(async (req, res, next) => {
    try {
      const { articleId } = req.params;
      const { operation } = req.params;
      const versionData = { ...req.body, articleId };
      const context = this.#buildRequestContext(req);

      // Validate article access
      await this.#validateArticleAccess(articleId, context, 'MANAGE_VERSIONS');

      // Validate version operation
      await this.#validateVersionOperation(operation, versionData, context);

      let result;

      switch (operation) {
        case 'create':
          result = await this.#knowledgeBaseService.processKnowledgeOperation(
            'CREATE_VERSION',
            versionData,
            context
          );
          break;

        case 'restore':
          result = await this.#knowledgeBaseService.processKnowledgeOperation(
            'RESTORE_VERSION',
            versionData,
            context
          );
          break;

        case 'compare':
          result = await this.#knowledgeBaseService.processKnowledgeOperation(
            'COMPARE_VERSIONS',
            versionData,
            context
          );
          break;

        case 'merge':
          result = await this.#knowledgeBaseService.processKnowledgeOperation(
            'MERGE_VERSIONS',
            versionData,
            context
          );
          break;

        case 'tag':
          result = await this.#knowledgeBaseService.processKnowledgeOperation(
            'TAG_VERSION',
            versionData,
            context
          );
          break;

        default:
          throw new AppError(`Unknown version operation: ${operation}`, 400);
      }

      const response = this.#responseFormatter.success(result, `Version ${operation} completed successfully`, {
        articleId,
        operation,
        version: versionData.version,
        timestamp: new Date().toISOString()
      });

      res.status(200).json(response);

    } catch (error) {
      logger.error(`Failed to execute version operation ${req.params.operation} for article ${req.params.articleId}:`, error);
      await this.#handleKnowledgeError(error, req, res, 'VERSION_OPERATION');
    }
  });

  /**
   * Handle article review and approval operations
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   */
  manageReview = asyncHandler(async (req, res, next) => {
    try {
      const { articleId } = req.params;
      const { operation } = req.params;
      const reviewData = { ...req.body, articleId };
      const context = this.#buildRequestContext(req);

      // Validate article access
      await this.#validateArticleAccess(articleId, context, 'MANAGE_REVIEW');

      // Validate review operation
      await this.#validateReviewOperation(operation, reviewData, context);

      let result;

      switch (operation) {
        case 'submit':
          result = await this.#knowledgeBaseService.processKnowledgeOperation(
            'SUBMIT_FOR_REVIEW',
            reviewData,
            context
          );
          break;

        case 'approve':
          result = await this.#knowledgeBaseService.processKnowledgeOperation(
            'APPROVE_ARTICLE',
            reviewData,
            context
          );
          break;

        case 'reject':
          result = await this.#knowledgeBaseService.processKnowledgeOperation(
            'REJECT_ARTICLE',
            reviewData,
            context
          );
          break;

        case 'request-changes':
          result = await this.#knowledgeBaseService.processKnowledgeOperation(
            'REQUEST_CHANGES',
            reviewData,
            context
          );
          break;

        case 'assign-reviewer':
          result = await this.#knowledgeBaseService.processKnowledgeOperation(
            'ASSIGN_REVIEWER',
            reviewData,
            context
          );
          break;

        case 'complete':
          result = await this.#knowledgeBaseService.processKnowledgeOperation(
            'COMPLETE_REVIEW',
            reviewData,
            context
          );
          break;

        case 'escalate':
          result = await this.#knowledgeBaseService.processKnowledgeOperation(
            'ESCALATE_REVIEW',
            reviewData,
            context
          );
          break;

        default:
          throw new AppError(`Unknown review operation: ${operation}`, 400);
      }

      const response = this.#responseFormatter.success(result, `Review ${operation} completed successfully`, {
        articleId,
        operation,
        reviewStatus: result.reviewStatus,
        timestamp: new Date().toISOString()
      });

      res.status(200).json(response);

    } catch (error) {
      logger.error(`Failed to execute review operation ${req.params.operation} for article ${req.params.articleId}:`, error);
      await this.#handleKnowledgeError(error, req, res, 'REVIEW_OPERATION');
    }
  });

  /**
   * Handle article content management
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   */
  manageContent = asyncHandler(async (req, res, next) => {
    try {
      const { articleId } = req.params;
      const { operation } = req.params;
      const contentData = { ...req.body, articleId };
      const context = this.#buildRequestContext(req);

      // Validate article access
      await this.#validateArticleAccess(articleId, context, 'MANAGE_CONTENT');

      // Process file uploads for media operations
      if (req.files && ['add-media', 'add-attachment'].includes(operation)) {
        contentData.files = await this.#processFileUploads(req.files, context);
      }

      // Validate content operation
      await this.#validateContentOperation(operation, contentData, context);

      let result;

      switch (operation) {
        case 'update':
          result = await this.#knowledgeBaseService.processKnowledgeOperation(
            'UPDATE_CONTENT',
            contentData,
            context
          );
          break;

        case 'add-section':
          result = await this.#knowledgeBaseService.processKnowledgeOperation(
            'ADD_SECTION',
            contentData,
            context
          );
          break;

        case 'remove-section':
          result = await this.#knowledgeBaseService.processKnowledgeOperation(
            'REMOVE_SECTION',
            contentData,
            context
          );
          break;

        case 'reorder-sections':
          result = await this.#knowledgeBaseService.processKnowledgeOperation(
            'REORDER_SECTIONS',
            contentData,
            context
          );
          break;

        case 'add-media':
          result = await this.#knowledgeBaseService.processKnowledgeOperation(
            'ADD_MEDIA',
            contentData,
            context
          );
          break;

        case 'remove-media':
          result = await this.#knowledgeBaseService.processKnowledgeOperation(
            'REMOVE_MEDIA',
            contentData,
            context
          );
          break;

        case 'add-attachment':
          result = await this.#knowledgeBaseService.processKnowledgeOperation(
            'ADD_ATTACHMENT',
            contentData,
            context
          );
          break;

        case 'add-code-snippet':
          result = await this.#knowledgeBaseService.processKnowledgeOperation(
            'ADD_CODE_SNIPPET',
            contentData,
            context
          );
          break;

        default:
          throw new AppError(`Unknown content operation: ${operation}`, 400);
      }

      const response = this.#responseFormatter.success(result, `Content ${operation} completed successfully`, {
        articleId,
        operation,
        timestamp: new Date().toISOString()
      });

      res.status(200).json(response);

    } catch (error) {
      logger.error(`Failed to execute content operation ${req.params.operation} for article ${req.params.articleId}:`, error);
      await this.#handleKnowledgeError(error, req, res, 'CONTENT_OPERATION');
    }
  });

  /**
   * Handle knowledge base search operations
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   */
  searchKnowledgeBase = asyncHandler(async (req, res, next) => {
    try {
      const { operation } = req.params;
      const searchParams = { ...req.query, ...req.body };
      const context = this.#buildRequestContext(req);

      // Apply search rate limiting
      await this.#checkRateLimit('search', context);

      // Validate search parameters
      await this.#validateSearchOperation(operation, searchParams, context);

      let result;

      switch (operation) {
        case 'articles':
          result = await this.#knowledgeBaseService.processKnowledgeOperation(
            'SEARCH_ARTICLES',
            searchParams,
            context
          );
          break;

        case 'advanced':
          result = await this.#knowledgeBaseService.processKnowledgeOperation(
            'ADVANCED_SEARCH',
            searchParams,
            context
          );
          break;

        case 'suggest':
          result = await this.#knowledgeBaseService.processKnowledgeOperation(
            'SUGGEST_ARTICLES',
            searchParams,
            context
          );
          break;

        case 'related':
          result = await this.#knowledgeBaseService.processKnowledgeOperation(
            'FIND_RELATED',
            searchParams,
            context
          );
          break;

        case 'by-ticket':
          result = await this.#knowledgeBaseService.processKnowledgeOperation(
            'SEARCH_BY_TICKET',
            searchParams,
            context
          );
          break;

        case 'update-index':
          result = await this.#knowledgeBaseService.processKnowledgeOperation(
            'UPDATE_SEARCH_INDEX',
            searchParams,
            context
          );
          break;

        default:
          throw new AppError(`Unknown search operation: ${operation}`, 400);
      }

      // Apply pagination if needed
      if (result.results && Array.isArray(result.results)) {
        const paginationParams = paginationHelper.extractPaginationParams(req.query, {
          defaultPageSize: this.#config.defaultPageSize,
          maxPageSize: this.#config.maxPageSize
        });

        const paginatedResult = paginationHelper.paginate(
          result.results,
          paginationParams.page,
          paginationParams.pageSize
        );

        result.results = paginatedResult.data;
        result.pagination = paginatedResult.pagination;
      }

      const response = this.#responseFormatter.success(result, `Search ${operation} completed successfully`, {
        operation,
        query: searchParams.query,
        resultsCount: result.count || result.results?.length || 0,
        timestamp: new Date().toISOString(),
        processingTime: Date.now() - context.startTime
      });

      res.status(200).json(response);

    } catch (error) {
      logger.error(`Failed to execute search operation ${req.params.operation}:`, error);
      await this.#handleKnowledgeError(error, req, res, 'SEARCH_OPERATION');
    }
  });

  /**
   * Handle article classification operations
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   */
  manageClassification = asyncHandler(async (req, res, next) => {
    try {
      const { articleId } = req.params;
      const { operation } = req.params;
      const classificationData = { ...req.body, articleId };
      const context = this.#buildRequestContext(req);

      // Validate article access
      await this.#validateArticleAccess(articleId, context, 'MANAGE_CLASSIFICATION');

      // Validate classification operation
      await this.#validateClassificationOperation(operation, classificationData, context);

      let result;

      switch (operation) {
        case 'update-category':
          result = await this.#knowledgeBaseService.processKnowledgeOperation(
            'UPDATE_CATEGORY',
            classificationData,
            context
          );
          break;

        case 'add-tags':
          result = await this.#knowledgeBaseService.processKnowledgeOperation(
            'ADD_TAGS',
            classificationData,
            context
          );
          break;

        case 'remove-tags':
          result = await this.#knowledgeBaseService.processKnowledgeOperation(
            'REMOVE_TAGS',
            classificationData,
            context
          );
          break;

        case 'auto-categorize':
          result = await this.#knowledgeBaseService.processKnowledgeOperation(
            'AUTO_CATEGORIZE',
            classificationData,
            context
          );
          break;

        case 'auto-tag':
          result = await this.#knowledgeBaseService.processKnowledgeOperation(
            'AUTO_TAG',
            classificationData,
            context
          );
          break;

        case 'update-audience':
          result = await this.#knowledgeBaseService.processKnowledgeOperation(
            'UPDATE_AUDIENCE',
            classificationData,
            context
          );
          break;

        default:
          throw new AppError(`Unknown classification operation: ${operation}`, 400);
      }

      const response = this.#responseFormatter.success(result, `Classification ${operation} completed successfully`, {
        articleId,
        operation,
        timestamp: new Date().toISOString()
      });

      res.status(200).json(response);

    } catch (error) {
      logger.error(`Failed to execute classification operation ${req.params.operation} for article ${req.params.articleId}:`, error);
      await this.#handleKnowledgeError(error, req, res, 'CLASSIFICATION_OPERATION');
    }
  });

  /**
   * Handle article translation operations
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   */
  manageTranslations = asyncHandler(async (req, res, next) => {
    try {
      const { articleId } = req.params;
      const { operation } = req.params;
      const translationData = { ...req.body, articleId };
      const context = this.#buildRequestContext(req);

      // Validate article access
      await this.#validateArticleAccess(articleId, context, 'MANAGE_TRANSLATIONS');

      // Validate translation operation
      await this.#validateTranslationOperation(operation, translationData, context);

      let result;

      switch (operation) {
        case 'translate':
          result = await this.#knowledgeBaseService.processKnowledgeOperation(
            'TRANSLATE_ARTICLE',
            translationData,
            context
          );
          break;

        case 'update':
          result = await this.#knowledgeBaseService.processKnowledgeOperation(
            'UPDATE_TRANSLATION',
            translationData,
            context
          );
          break;

        case 'approve':
          result = await this.#knowledgeBaseService.processKnowledgeOperation(
            'APPROVE_TRANSLATION',
            translationData,
            context
          );
          break;

        case 'auto-translate':
          result = await this.#knowledgeBaseService.processKnowledgeOperation(
            'AUTO_TRANSLATE',
            translationData,
            context
          );
          break;

        default:
          throw new AppError(`Unknown translation operation: ${operation}`, 400);
      }

      const response = this.#responseFormatter.success(result, `Translation ${operation} completed successfully`, {
        articleId,
        operation,
        language: translationData.language,
        timestamp: new Date().toISOString()
      });

      res.status(200).json(response);

    } catch (error) {
      logger.error(`Failed to execute translation operation ${req.params.operation} for article ${req.params.articleId}:`, error);
      await this.#handleKnowledgeError(error, req, res, 'TRANSLATION_OPERATION');
    }
  });

  /**
   * Handle knowledge base analytics operations
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   */
  getKnowledgeAnalytics = asyncHandler(async (req, res, next) => {
    try {
      const { analysisType } = req.params;
      const analyticsParams = { ...req.query, ...req.body };
      const context = this.#buildRequestContext(req);

      // Validate analytics request
      await this.#validateAnalyticsRequest(analysisType, analyticsParams, context);

      // Check cache first
      const cacheKey = `${this.#config.cachePrefix}analytics:${analysisType}:${JSON.stringify(analyticsParams)}`;
      let result = await this.#cacheService.get(cacheKey);

      if (!result) {
        // Execute analytics
        result = await this.#knowledgeBaseService.analyzeKnowledgeMetrics(
          analysisType,
          analyticsParams,
          context
        );

        // Cache the result
        await this.#cacheService.set(cacheKey, result, this.#config.cacheTTL);
      }

      const response = this.#responseFormatter.success(result, `Knowledge analytics completed: ${analysisType}`, {
        analysisType,
        period: analyticsParams.period,
        cached: !!result.cached,
        timestamp: new Date().toISOString(),
        processingTime: Date.now() - context.startTime
      });

      res.status(200).json(response);

    } catch (error) {
      logger.error(`Failed to get knowledge analytics ${req.params.analysisType}:`, error);
      await this.#handleKnowledgeError(error, req, res, 'GET_ANALYTICS');
    }
  });

  /**
   * Handle bulk knowledge base operations
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   */
  bulkOperations = asyncHandler(async (req, res, next) => {
    try {
      const { operation } = req.params;
      const bulkData = req.body;
      const context = this.#buildRequestContext(req);

      // Validate bulk operation
      await this.#validateBulkOperation(operation, bulkData, context);

      // Apply bulk rate limiting
      await this.#checkRateLimit('bulk', context);

      let result;

      switch (operation) {
        case 'import':
          result = await this.#knowledgeBaseService.processKnowledgeOperation(
            'BULK_IMPORT',
            bulkData,
            context
          );
          break;

        case 'export':
          result = await this.#knowledgeBaseService.processKnowledgeOperation(
            'BULK_EXPORT',
            bulkData,
            context
          );
          break;

        case 'update':
          result = await this.#knowledgeBaseService.processKnowledgeOperation(
            'BULK_UPDATE',
            bulkData,
            context
          );
          break;

        case 'publish':
          result = await this.#knowledgeBaseService.processKnowledgeOperation(
            'BULK_PUBLISH',
            bulkData,
            context
          );
          break;

        case 'archive':
          result = await this.#knowledgeBaseService.processKnowledgeOperation(
            'BULK_ARCHIVE',
            bulkData,
            context
          );
          break;

        case 'delete':
          result = await this.#knowledgeBaseService.processKnowledgeOperation(
            'BULK_DELETE',
            bulkData,
            context
          );
          break;

        default:
          throw new AppError(`Unknown bulk operation: ${operation}`, 400);
      }

      const response = this.#responseFormatter.success(result, `Bulk ${operation} operation completed`, {
        operation,
        processedCount: result.processedCount,
        successCount: result.successCount,
        failureCount: result.failureCount,
        timestamp: new Date().toISOString(),
        processingTime: Date.now() - context.startTime
      });

      res.status(200).json(response);

    } catch (error) {
      logger.error(`Failed to execute bulk operation ${req.params.operation}:`, error);
      await this.#handleKnowledgeError(error, req, res, 'BULK_OPERATION');
    }
  });

  /**
   * Handle knowledge base workflow operations
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   */
  executeWorkflow = asyncHandler(async (req, res, next) => {
    try {
      const { workflowType } = req.params;
      const workflowData = req.body;
      const context = this.#buildRequestContext(req);

      // Validate workflow request
      await this.#validateWorkflowRequest(workflowType, workflowData, context);

      // Execute workflow
      const result = await this.#knowledgeBaseService.executeKnowledgeWorkflow(
        workflowType,
        workflowData,
        context
      );

      const response = this.#responseFormatter.success(result, `Knowledge workflow executed: ${workflowType}`, {
        workflowType,
        workflowId: result.workflowId,
        stepsCompleted: result.steps?.length || 0,
        duration: result.duration,
        timestamp: new Date().toISOString()
      });

      res.status(200).json(response);

    } catch (error) {
      logger.error(`Failed to execute knowledge workflow ${req.params.workflowType}:`, error);
      await this.#handleKnowledgeError(error, req, res, 'EXECUTE_WORKFLOW');
    }
  });

  // ==================== Private Helper Methods ====================

  #buildRequestContext(req) {
    return {
      user: req.user,
      organizationId: req.user?.organizationId,
      sessionId: req.sessionID,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date(),
      startTime: Date.now(),
      requestId: req.headers['x-request-id'] || cryptoHelper.generateRandomString(12),
      correlationId: req.headers['x-correlation-id'],
      permissions: req.user?.permissions || [],
      roles: req.user?.roles || []
    };
  }

  async #validateArticleCreation(data, context) {
    // Validate required fields
    for (const field of this.#config.validation.requiredFields) {
      if (!data[field] || (typeof data[field] === 'string' && data[field].trim().length === 0)) {
        throw new AppError(`${field} is required`, 400);
      }
    }

    // Validate field lengths
    if (data.title.length > this.#config.validation.maxTitleLength) {
      throw new AppError(`Title exceeds maximum length of ${this.#config.validation.maxTitleLength}`, 400);
    }

    if (data.summary && data.summary.length > this.#config.validation.maxSummaryLength) {
      throw new AppError(`Summary exceeds maximum length of ${this.#config.validation.maxSummaryLength}`, 400);
    }

    if (data.content.length > this.#config.validation.maxContentLength) {
      throw new AppError(`Content exceeds maximum length of ${this.#config.validation.maxContentLength}`, 400);
    }

    // Validate content minimum requirements
    const wordCount = stringHelper.stripHtml(data.content).split(/\s+/).length;
    if (wordCount < this.#config.validation.minContentWords) {
      throw new AppError(`Content must have at least ${this.#config.validation.minContentWords} words`, 400);
    }

    // Validate keywords and tags
    if (data.keywords && data.keywords.length > this.#config.validation.maxKeywords) {
      throw new AppError(`Too many keywords. Maximum ${this.#config.validation.maxKeywords} allowed`, 400);
    }

    if (data.tags && data.tags.length > this.#config.validation.maxTags) {
      throw new AppError(`Too many tags. Maximum ${this.#config.validation.maxTags} allowed`, 400);
    }

    // Validate permissions
    if (!context.permissions.includes('kb.create') && !context.permissions.includes('admin.knowledge')) {
      throw new AppError('Insufficient permissions to create articles', 403);
    }

    // Sanitize content if security is enabled
    if (this.#config.security.sanitizeContent) {
      data.title = this.#sanitizeContent(data.title);
      data.content = this.#sanitizeContent(data.content);
      if (data.summary) data.summary = this.#sanitizeContent(data.summary);
    }
  }

  async #validateArticleAccess(articleId, context, operation) {
    if (!CommonValidator.isValidId(articleId)) {
      throw new AppError('Invalid article ID format', 400);
    }

    // Get article to check access
    const article = await KnowledgeArticle.findOne({ articleId }).select('articleReference authorship metadata publishing');
    
    if (!article) {
      throw new AppError('Article not found', 404);
    }

    // Check organization access
    if (article.articleReference.organizationId.toString() !== context.organizationId) {
      throw new AppError('Access denied: Article belongs to different organization', 403);
    }

    // Check operation-specific permissions
    const requiredPermissions = this.#getKnowledgeOperationPermissions(operation);
    const hasPermission = requiredPermissions.some(permission => 
      context.permissions.includes(permission)
    );

    if (!hasPermission) {
      throw new AppError(`Insufficient permissions for operation: ${operation}`, 403);
    }

    // Check authorship-based access for certain operations
    if (['UPDATE', 'DELETE', 'PUBLISH'].includes(operation)) {
      const isAuthor = article.authorship?.primaryAuthor?.userId?.toString() === context.user.id;
      const isOwner = article.authorship?.ownership?.owner?.toString() === context.user.id;
      const hasAdminAccess = context.permissions.includes('admin.knowledge');

      if (!isAuthor && !isOwner && !hasAdminAccess) {
        throw new AppError('Access denied: Not authorized to modify this article', 403);
      }
    }

    // Check publication status for certain operations
    if (operation === 'UPDATE' && article.publishing.status.current === 'PUBLISHED') {
      if (!context.permissions.includes('kb.edit.published')) {
        throw new AppError('Cannot modify published articles without special permissions', 403);
      }
    }
  }

  #getKnowledgeOperationPermissions(operation) {
    const permissionMap = {
      'CREATE': ['kb.create', 'admin.knowledge'],
      'UPDATE': ['kb.update', 'admin.knowledge'],
      'DELETE': ['kb.delete', 'admin.knowledge'],
      'PUBLISH': ['kb.publish', 'admin.knowledge'],
      'MANAGE_VERSIONS': ['kb.versions', 'admin.knowledge'],
      'MANAGE_REVIEW': ['kb.review', 'admin.knowledge'],
      'MANAGE_CONTENT': ['kb.content', 'admin.knowledge'],
      'MANAGE_CLASSIFICATION': ['kb.classify', 'admin.knowledge'],
      'MANAGE_TRANSLATIONS': ['kb.translate', 'admin.knowledge']
    };

    return permissionMap[operation] || ['admin.super'];
  }

  async #validateArticleUpdate(data, context) {
    if (data.title && data.title.length > this.#config.validation.maxTitleLength) {
      throw new AppError(`Title exceeds maximum length of ${this.#config.validation.maxTitleLength}`, 400);
    }

    if (data.summary && data.summary.length > this.#config.validation.maxSummaryLength) {
      throw new AppError(`Summary exceeds maximum length of ${this.#config.validation.maxSummaryLength}`, 400);
    }

    if (data.content && data.content.length > this.#config.validation.maxContentLength) {
      throw new AppError(`Content exceeds maximum length of ${this.#config.validation.maxContentLength}`, 400);
    }
  }

  async #validatePublishingOperation(operation, data, context) {
    const validOperations = ['publish', 'unpublish', 'schedule', 'cancel-schedule', 'publish-channel', 'syndicate'];
    
    if (!validOperations.includes(operation)) {
      throw new AppError(`Invalid publishing operation: ${operation}`, 400);
    }

    if (operation === 'schedule' && !data.publishAt) {
      throw new AppError('publishAt date is required for scheduled publishing', 400);
    }

    if (operation === 'schedule' && new Date(data.publishAt) <= new Date()) {
      throw new AppError('Scheduled publish date must be in the future', 400);
    }

    if (['publish-channel', 'syndicate'].includes(operation) && (!data.channels || data.channels.length === 0)) {
      throw new AppError('Channels are required for channel publishing operations', 400);
    }
  }

  async #validateVersionOperation(operation, data, context) {
    const validOperations = ['create', 'restore', 'compare', 'merge', 'tag'];
    
    if (!validOperations.includes(operation)) {
      throw new AppError(`Invalid version operation: ${operation}`, 400);
    }

    if (operation === 'restore' && !data.version) {
      throw new AppError('Version identifier is required for restore operation', 400);
    }

    if (operation === 'compare' && (!data.version1 || !data.version2)) {
      throw new AppError('Two version identifiers are required for compare operation', 400);
    }

    if (operation === 'tag' && !data.tag) {
      throw new AppError('Tag name is required for tag operation', 400);
    }
  }

  async #validateReviewOperation(operation, data, context) {
    const validOperations = ['submit', 'approve', 'reject', 'request-changes', 'assign-reviewer', 'complete', 'escalate'];
    
    if (!validOperations.includes(operation)) {
      throw new AppError(`Invalid review operation: ${operation}`, 400);
    }

    if (['reject', 'request-changes'].includes(operation) && !data.comments) {
      throw new AppError('Comments are required for reject and request-changes operations', 400);
    }

    if (operation === 'assign-reviewer' && !data.reviewerId) {
      throw new AppError('Reviewer ID is required for assign-reviewer operation', 400);
    }

    // Validate reviewer permissions
    if (['approve', 'reject'].includes(operation)) {
      if (!context.permissions.includes('kb.review.approve')) {
        throw new AppError('Insufficient permissions to approve/reject articles', 403);
      }
    }
  }

  async #validateContentOperation(operation, data, context) {
    const validOperations = ['update', 'add-section', 'remove-section', 'reorder-sections', 'add-media', 'remove-media', 'add-attachment', 'add-code-snippet'];
    
    if (!validOperations.includes(operation)) {
      throw new AppError(`Invalid content operation: ${operation}`, 400);
    }

    if (operation === 'add-section' && !data.sectionContent) {
      throw new AppError('Section content is required for add-section operation', 400);
    }

    if (operation === 'remove-section' && !data.sectionId) {
      throw new AppError('Section ID is required for remove-section operation', 400);
    }

    if (operation === 'reorder-sections' && (!data.sections || !Array.isArray(data.sections))) {
      throw new AppError('Sections array is required for reorder-sections operation', 400);
    }
  }

  async #validateSearchOperation(operation, data, context) {
    const validOperations = ['articles', 'advanced', 'suggest', 'related', 'by-ticket', 'update-index'];
    
    if (!validOperations.includes(operation)) {
      throw new AppError(`Invalid search operation: ${operation}`, 400);
    }

    if (['articles', 'advanced', 'suggest'].includes(operation) && !data.query) {
      throw new AppError('Search query is required', 400);
    }

    if (operation === 'related' && !data.articleId) {
      throw new AppError('Article ID is required for related search', 400);
    }

    if (operation === 'by-ticket' && !data.ticketId) {
      throw new AppError('Ticket ID is required for ticket-based search', 400);
    }
  }

  async #validateClassificationOperation(operation, data, context) {
    const validOperations = ['update-category', 'add-tags', 'remove-tags', 'auto-categorize', 'auto-tag', 'update-audience'];
    
    if (!validOperations.includes(operation)) {
      throw new AppError(`Invalid classification operation: ${operation}`, 400);
    }

    if (operation === 'update-category' && !data.category) {
      throw new AppError('Category is required for update-category operation', 400);
    }

    if (['add-tags', 'remove-tags'].includes(operation) && (!data.tags || !Array.isArray(data.tags))) {
      throw new AppError('Tags array is required for tag operations', 400);
    }

    if (operation === 'update-audience' && !data.audience) {
      throw new AppError('Audience is required for update-audience operation', 400);
    }
  }

  async #validateTranslationOperation(operation, data, context) {
    const validOperations = ['translate', 'update', 'approve', 'auto-translate'];
    
    if (!validOperations.includes(operation)) {
      throw new AppError(`Invalid translation operation: ${operation}`, 400);
    }

    if (['translate', 'update', 'auto-translate'].includes(operation) && !data.language) {
      throw new AppError('Target language is required for translation operations', 400);
    }

    if (operation === 'update' && !data.translatedContent) {
      throw new AppError('Translated content is required for update operation', 400);
    }
  }

  async #validateAnalyticsRequest(analysisType, params, context) {
    const validAnalysisTypes = [
      'CONTENT_COVERAGE', 'CONTENT_QUALITY', 'CONTENT_GAPS', 'CONTENT_FRESHNESS',
      'ARTICLE_VIEWS', 'SEARCH_PATTERNS', 'USER_ENGAGEMENT', 'NAVIGATION_PATHS',
      'TICKET_DEFLECTION', 'RESOLUTION_IMPACT', 'CUSTOMER_SATISFACTION', 'SELF_SERVICE_RATE',
      'AUTHOR_PRODUCTIVITY', 'CONTRIBUTION_METRICS', 'REVIEW_PERFORMANCE', 'EXPERTISE_MAPPING'
    ];

    if (!validAnalysisTypes.includes(analysisType)) {
      throw new AppError(`Invalid analysis type: ${analysisType}`, 400);
    }

    if (!context.permissions.includes('kb.analytics') && !context.permissions.includes('admin.analytics')) {
      throw new AppError('Insufficient permissions for analytics access', 403);
    }
  }

  async #validateBulkOperation(operation, data, context) {
    const validOperations = ['import', 'export', 'update', 'publish', 'archive', 'delete'];
    
    if (!validOperations.includes(operation)) {
      throw new AppError(`Invalid bulk operation: ${operation}`, 400);
    }

    if (['update', 'publish', 'archive', 'delete'].includes(operation)) {
      if (!data.articleIds || !Array.isArray(data.articleIds) || data.articleIds.length === 0) {
        throw new AppError('Article IDs array is required and cannot be empty', 400);
      }

      if (data.articleIds.length > this.#config.maxBulkOperations) {
        throw new AppError(`Too many articles. Maximum ${this.#config.maxBulkOperations} allowed per bulk operation`, 400);
      }
    }

    if (operation === 'import' && !data.articles && !data.importFile) {
      throw new AppError('Articles data or import file is required for import operation', 400);
    }

    // Check bulk operation permissions
    if (!context.permissions.includes('kb.bulk') && !context.permissions.includes('admin.knowledge')) {
      throw new AppError('Insufficient permissions for bulk operations', 403);
    }
  }

  async #validateWorkflowRequest(workflowType, data, context) {
    const validWorkflowTypes = [
      'ARTICLE_CREATION_WORKFLOW', 'GUIDED_CREATION_WORKFLOW', 'TEMPLATE_BASED_WORKFLOW',
      'IMPORT_CONVERSION_WORKFLOW', 'STANDARD_PUBLISHING_WORKFLOW', 'REVIEW_PUBLISH_WORKFLOW',
      'MULTI_CHANNEL_WORKFLOW', 'SCHEDULED_RELEASE_WORKFLOW', 'PEER_REVIEW_WORKFLOW',
      'EXPERT_REVIEW_WORKFLOW', 'QUALITY_ASSURANCE_WORKFLOW', 'COMPLIANCE_REVIEW_WORKFLOW',
      'CONTENT_UPDATE_WORKFLOW', 'PERIODIC_REVIEW_WORKFLOW', 'DEPRECATION_WORKFLOW', 'ARCHIVE_WORKFLOW'
    ];

    if (!validWorkflowTypes.includes(workflowType)) {
      throw new AppError(`Invalid workflow type: ${workflowType}`, 400);
    }

    if (!context.permissions.includes('kb.workflow') && !context.permissions.includes('admin.workflows')) {
      throw new AppError('Insufficient permissions for workflow execution', 403);
    }
  }

  async #processFileUploads(files, context) {
    const processedFiles = [];

    for (const file of files) {
      // Validate file size
      if (file.size > this.#config.validation.maxAttachmentSize) {
        throw new AppError(`File ${file.originalname} exceeds maximum size of ${this.#config.validation.maxAttachmentSize} bytes`, 400);
      }

      // Validate file type
      if (!this.#config.validation.allowedContentTypes.includes(file.mimetype)) {
        throw new AppError(`File type ${file.mimetype} is not allowed`, 400);
      }

      // Scan file if security scanning is enabled
      if (this.#config.security.contentScanning) {
        await this.#scanFileForSecurity(file);
      }

      // Upload file to storage
      const uploadResult = await this.#fileService.uploadFile(file, {
        folder: 'knowledge-base',
        organizationId: context.organizationId,
        uploadedBy: context.user.id
      });

      processedFiles.push({
        originalName: file.originalname,
        filename: uploadResult.filename,
        mimetype: file.mimetype,
        size: file.size,
        url: uploadResult.url,
        uploadedAt: new Date(),
        uploadedBy: context.user.id
      });
    }

    return processedFiles;
  }

  async #scanFileForSecurity(file) {
    // Implement security scanning logic
    // This would typically integrate with antivirus/malware scanning services
    logger.debug(`Security scanning file: ${file.originalname}`);
  }

  async #checkRateLimit(operation, context) {
    const limit = this.#config.rateLimits[operation];
    if (!limit) return;

    const rateLimitKey = `rate_limit:${context.user.id}:${operation}`;
    
    // Rate limit implementation would go here
    logger.debug(`Rate limit check for ${operation}: ${rateLimitKey}`);
  }

  #sanitizeContent(content) {
    if (typeof content !== 'string') return content;
    
    // Advanced XSS prevention for knowledge base content
    return content
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
      .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
      .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '');
  }

  async #handleKnowledgeError(error, req, res, operation) {
    // Log the error
    logger.error(`Knowledge base operation error: ${operation}`, {
      error: error.message,
      stack: error.stack,
      operation,
      articleId: req.params.articleId,
      user: req.user?.id,
      ip: req.ip
    });

    // Send error notification for critical errors
    if (error.statusCode >= 500) {
      await this.#notificationService.sendNotification({
        type: 'KNOWLEDGE_OPERATION_ERROR',
        severity: 'HIGH',
        message: error.message,
        data: {
          operation,
          articleId: req.params.articleId,
          user: req.user?.id,
          timestamp: new Date()
        }
      });
    }

    // Format error response
    const errorResponse = this.#responseFormatter.error(
      error.message,
      error.statusCode || 500,
      {
        operation,
        articleId: req.params.articleId,
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id']
      }
    );

    res.status(error.statusCode || 500).json(errorResponse);
  }
}

module.exports = KnowledgeBaseController;