'use strict';

/**
 * @fileoverview Enterprise analytics controller for comprehensive analytics management API endpoints
 * @module servers/admin-server/modules/reports-analytics/controllers/analytics-controller
 * @requires module:servers/admin-server/modules/reports-analytics/services/analytics-service
 * @requires module:servers/admin-server/modules/reports-analytics/models/analytics-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/response-formatter
 * @requires module:shared/lib/utils/async-handler
 * @requires module:shared/lib/utils/validators/common-validators
 * @requires module:shared/lib/middleware/auth-middleware
 * @requires module:shared/lib/middleware/validation-middleware
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/services/audit-service
 */

const AnalyticsProcessingService = require('../services/analytics-service');
const Analytics = require('../models/analytics-model');
const logger = require('../../../../../shared/lib/utils/logger');
const { AppError } = require('../../../../../shared/lib/utils/app-error');
const responseFormatter = require('../../../../../shared/lib/utils/response-formatter');
const asyncHandler = require('../../../../../shared/lib/utils/async-handler');
const CommonValidator = require('../../../../../shared/lib/utils/validators/common-validators');
const CacheService = require('../../../../../shared/lib/services/cache-service');
const AuditService = require('../../../../../shared/lib/services/audit-service');

/**
 * @class AnalyticsController
 * @description Enterprise analytics controller for managing analytics API endpoints
 */
class AnalyticsController {
  #analyticsService;
  #cacheService;
  #auditService;
  #initialized;
  #controllerName;
  #config;

  /**
   * @constructor
   * @description Initialize analytics controller with dependencies
   */
  constructor() {
    this.#analyticsService = new AnalyticsProcessingService();
    this.#cacheService = new CacheService();
    this.#auditService = new AuditService();
    this.#initialized = false;
    this.#controllerName = 'AnalyticsController';
    this.#config = {
      cachePrefix: 'analytics:controller:',
      cacheTTL: 3600,
      pagination: {
        defaultLimit: 50,
        maxLimit: 500,
        defaultSort: '-metadata.lastProcessed'
      },
      validation: {
        maxMetricsPerRequest: 100,
        maxDataPointsPerBatch: 10000,
        maxTimeRange: 365 * 24 * 60 * 60 * 1000, // 1 year in milliseconds
        maxSegments: 50
      },
      rateLimit: {
        dataCollection: { max: 100, window: 60 },
        analytics: { max: 50, window: 60 },
        predictions: { max: 10, window: 3600 }
      },
      anomalyDetection: {
        defaultSensitivity: 2.5,
        minDataPoints: 30,
        maxAnomaliesPerRequest: 100
      },
      predictions: {
        defaultHorizon: 7,
        maxHorizon: 90,
        defaultConfidence: 0.95
      }
    };

    // Bind all methods to maintain context
    this.initialize = this.initialize.bind(this);
    this.handleAnalyticsRequest = this.handleAnalyticsRequest.bind(this);
    this.createAnalyticsConfig = this.createAnalyticsConfig.bind(this);
    this.getAnalytics = this.getAnalytics.bind(this);
    this.updateAnalytics = this.updateAnalytics.bind(this);
    this.deleteAnalytics = this.deleteAnalytics.bind(this);
    this.listAnalytics = this.listAnalytics.bind(this);
    this.collectData = this.collectData.bind(this);
    this.processData = this.processData.bind(this);
    this.calculateMetrics = this.calculateMetrics.bind(this);
    this.detectAnomalies = this.detectAnomalies.bind(this);
    this.generatePredictions = this.generatePredictions.bind(this);
    this.performAnalysis = this.performAnalysis.bind(this);
    this.manageBenchmarks = this.manageBenchmarks.bind(this);
    this.manageSegmentation = this.manageSegmentation.bind(this);
    this.performAttribution = this.performAttribution.bind(this);
    this.exportAnalytics = this.exportAnalytics.bind(this);
  }

  /**
   * Initialize the analytics controller
   * @async
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      if (this.#initialized) {
        logger.warn(`${this.#controllerName} already initialized`);
        return;
      }

      await this.#analyticsService.initialize();
      await this.#cacheService.initialize();
      await this.#auditService.initialize();
      
      this.#initialized = true;
      logger.info(`${this.#controllerName} initialized successfully`);
    } catch (error) {
      logger.error(`Failed to initialize ${this.#controllerName}:`, error);
      throw new AppError('Analytics controller initialization failed', 500);
    }
  }

  /**
   * Handle analytics request based on action type
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   * @returns {Promise<Object>} Response
   */
  handleAnalyticsRequest = asyncHandler(async (req, res, next) => {
    const { action } = req.params;
    const context = this.#buildContext(req);

    try {
      let result;

      switch (action) {
        // ==================== Analytics Configuration Operations ====================
        case 'create-config':
          result = await this.#handleCreateConfig(req.body, context);
          break;

        case 'update-config':
          result = await this.#handleUpdateConfig(req.params.analyticsId, req.body, context);
          break;

        case 'delete-config':
          result = await this.#handleDeleteConfig(req.params.analyticsId, context);
          break;

        case 'get-config':
          result = await this.#handleGetConfig(req.params.analyticsId, context);
          break;

        case 'list-configs':
          result = await this.#handleListConfigs(req.query, context);
          break;

        // ==================== Data Collection Operations ====================
        case 'collect-data':
          result = await this.#handleCollectData(req.params.analyticsId, req.body, context);
          break;

        case 'batch-collect':
          result = await this.#handleBatchCollect(req.body, context);
          break;

        case 'stream-data':
          result = await this.#handleStreamData(req.params.analyticsId, req.body, context);
          break;

        case 'validate-data':
          result = await this.#handleValidateData(req.body, context);
          break;

        case 'clean-data':
          result = await this.#handleCleanData(req.params.analyticsId, req.body, context);
          break;

        // ==================== Processing Operations ====================
        case 'process-data':
          result = await this.#handleProcessData(req.params.analyticsId, req.body, context);
          break;

        case 'aggregate-data':
          result = await this.#handleAggregateData(req.params.analyticsId, req.body, context);
          break;

        case 'transform-data':
          result = await this.#handleTransformData(req.params.analyticsId, req.body, context);
          break;

        case 'enrich-data':
          result = await this.#handleEnrichData(req.params.analyticsId, req.body, context);
          break;

        // ==================== Metrics Calculation Operations ====================
        case 'calculate-metrics':
          result = await this.#handleCalculateMetrics(req.params.analyticsId, req.body, context);
          break;

        case 'calculate-statistics':
          result = await this.#handleCalculateStatistics(req.params.analyticsId, req.body, context);
          break;

        case 'calculate-kpis':
          result = await this.#handleCalculateKPIs(req.body, context);
          break;

        case 'calculate-performance':
          result = await this.#handleCalculatePerformance(req.params.analyticsId, context);
          break;

        // ==================== Anomaly Detection Operations ====================
        case 'detect-anomalies':
          result = await this.#handleDetectAnomalies(req.params.analyticsId, req.body, context);
          break;

        case 'classify-anomalies':
          result = await this.#handleClassifyAnomalies(req.params.analyticsId, req.body, context);
          break;

        case 'investigate-anomaly':
          result = await this.#handleInvestigateAnomaly(req.params.anomalyId, context);
          break;

        case 'resolve-anomaly':
          result = await this.#handleResolveAnomaly(req.params.anomalyId, req.body, context);
          break;

        case 'configure-detection':
          result = await this.#handleConfigureDetection(req.params.analyticsId, req.body, context);
          break;

        // ==================== Predictive Analytics Operations ====================
        case 'generate-predictions':
          result = await this.#handleGeneratePredictions(req.params.analyticsId, req.body, context);
          break;

        case 'forecast-metrics':
          result = await this.#handleForecastMetrics(req.params.analyticsId, req.body, context);
          break;

        case 'scenario-analysis':
          result = await this.#handleScenarioAnalysis(req.params.analyticsId, req.body, context);
          break;

        case 'what-if-analysis':
          result = await this.#handleWhatIfAnalysis(req.params.analyticsId, req.body, context);
          break;

        case 'train-model':
          result = await this.#handleTrainModel(req.params.analyticsId, req.body, context);
          break;

        // ==================== Analysis Operations ====================
        case 'time-series-analysis':
          result = await this.#handleTimeSeriesAnalysis(req.params.analyticsId, req.body, context);
          break;

        case 'trend-analysis':
          result = await this.#handleTrendAnalysis(req.params.analyticsId, req.body, context);
          break;

        case 'correlation-analysis':
          result = await this.#handleCorrelationAnalysis(req.params.analyticsId, req.body, context);
          break;

        case 'regression-analysis':
          result = await this.#handleRegressionAnalysis(req.params.analyticsId, req.body, context);
          break;

        case 'variance-analysis':
          result = await this.#handleVarianceAnalysis(req.params.analyticsId, req.body, context);
          break;

        // ==================== Benchmarking Operations ====================
        case 'create-benchmark':
          result = await this.#handleCreateBenchmark(req.body, context);
          break;

        case 'update-benchmark':
          result = await this.#handleUpdateBenchmark(req.params.benchmarkId, req.body, context);
          break;

        case 'compare-benchmarks':
          result = await this.#handleCompareBenchmarks(req.body, context);
          break;

        case 'industry-comparison':
          result = await this.#handleIndustryComparison(req.body, context);
          break;

        case 'competitor-analysis':
          result = await this.#handleCompetitorAnalysis(req.body, context);
          break;

        // ==================== Segmentation Operations ====================
        case 'perform-segmentation':
          result = await this.#handlePerformSegmentation(req.params.analyticsId, req.body, context);
          break;

        case 'create-cohort':
          result = await this.#handleCreateCohort(req.body, context);
          break;

        case 'analyze-cohort':
          result = await this.#handleAnalyzeCohort(req.params.cohortId, req.body, context);
          break;

        case 'cluster-analysis':
          result = await this.#handleClusterAnalysis(req.params.analyticsId, req.body, context);
          break;

        case 'create-persona':
          result = await this.#handleCreatePersona(req.body, context);
          break;

        // ==================== Attribution Operations ====================
        case 'attribution-modeling':
          result = await this.#handleAttributionModeling(req.body, context);
          break;

        case 'touchpoint-analysis':
          result = await this.#handleTouchpointAnalysis(req.body, context);
          break;

        case 'conversion-analysis':
          result = await this.#handleConversionAnalysis(req.body, context);
          break;

        case 'roi-calculation':
          result = await this.#handleROICalculation(req.body, context);
          break;

        case 'channel-attribution':
          result = await this.#handleChannelAttribution(req.body, context);
          break;

        // ==================== Visualization Operations ====================
        case 'create-visualization':
          result = await this.#handleCreateVisualization(req.body, context);
          break;

        case 'update-visualization':
          result = await this.#handleUpdateVisualization(req.params.visualizationId, req.body, context);
          break;

        case 'generate-heatmap':
          result = await this.#handleGenerateHeatmap(req.params.analyticsId, req.body, context);
          break;

        case 'generate-chart':
          result = await this.#handleGenerateChart(req.params.analyticsId, req.body, context);
          break;

        // ==================== Export Operations ====================
        case 'export-data':
          result = await this.#handleExportData(req.params.analyticsId, req.query, context);
          break;

        case 'export-insights':
          result = await this.#handleExportInsights(req.params.analyticsId, req.query, context);
          break;

        case 'export-predictions':
          result = await this.#handleExportPredictions(req.params.analyticsId, req.query, context);
          break;

        case 'export-report':
          result = await this.#handleExportReport(req.params.analyticsId, req.query, context);
          break;

        // ==================== Default Case ====================
        default:
          throw new AppError(`Unknown analytics action: ${action}`, 400);
      }

      return responseFormatter.success(res, result, `Analytics ${action} successful`);

    } catch (error) {
      logger.error(`Analytics request failed: ${action}`, error);
      return responseFormatter.error(res, error);
    }
  });

  /**
   * Create analytics configuration
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<Object>} Response
   */
  createAnalyticsConfig = asyncHandler(async (req, res) => {
    const context = this.#buildContext(req);
    
    // Validate request body
    const validation = await this.#validateAnalyticsData(req.body);
    if (!validation.valid) {
      throw new AppError(validation.errors.join(', '), 400);
    }

    const result = await this.#analyticsService.processAnalyticsOperation(
      'CREATE_ANALYTICS_CONFIG',
      req.body,
      context
    );

    return responseFormatter.created(res, result, 'Analytics configuration created successfully');
  });

  /**
   * Get analytics by ID
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<Object>} Response
   */
  getAnalytics = asyncHandler(async (req, res) => {
    const { analyticsId } = req.params;
    const context = this.#buildContext(req);

    // Check cache
    const cacheKey = `${this.#config.cachePrefix}${analyticsId}`;
    const cached = await this.#cacheService.get(cacheKey);
    
    if (cached) {
      return responseFormatter.success(res, cached, 'Analytics retrieved from cache');
    }

    const analytics = await Analytics.findOne({ 
      analyticsId,
      'analyticsReference.organizationId': context.organizationId
    });

    if (!analytics) {
      throw new AppError('Analytics configuration not found', 404);
    }

    // Cache the result
    await this.#cacheService.set(cacheKey, analytics, this.#config.cacheTTL);

    return responseFormatter.success(res, analytics, 'Analytics retrieved successfully');
  });

  /**
   * Update analytics configuration
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<Object>} Response
   */
  updateAnalytics = asyncHandler(async (req, res) => {
    const { analyticsId } = req.params;
    const context = this.#buildContext(req);

    const result = await this.#analyticsService.processAnalyticsOperation(
      'UPDATE_ANALYTICS_CONFIG',
      { analyticsId, ...req.body },
      context
    );

    // Invalidate cache
    await this.#invalidateAnalyticsCache(analyticsId);

    return responseFormatter.success(res, result, 'Analytics configuration updated successfully');
  });

  /**
   * Delete analytics configuration
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<Object>} Response
   */
  deleteAnalytics = asyncHandler(async (req, res) => {
    const { analyticsId } = req.params;
    const context = this.#buildContext(req);

    const result = await this.#analyticsService.processAnalyticsOperation(
      'DELETE_ANALYTICS_CONFIG',
      { analyticsId },
      context
    );

    // Invalidate cache
    await this.#invalidateAnalyticsCache(analyticsId);

    return responseFormatter.success(res, result, 'Analytics configuration deleted successfully');
  });

  /**
   * List analytics configurations
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<Object>} Response
   */
  listAnalytics = asyncHandler(async (req, res) => {
    const context = this.#buildContext(req);
    const { page = 1, limit = this.#config.pagination.defaultLimit, sort, filter } = req.query;

    // Validate pagination
    const validatedLimit = Math.min(limit, this.#config.pagination.maxLimit);

    const query = {
      'analyticsReference.organizationId': context.organizationId
    };

    // Apply filters
    if (filter) {
      Object.assign(query, this.#buildFilterQuery(filter));
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(validatedLimit),
      sort: sort || this.#config.pagination.defaultSort,
      select: '-__v'
    };

    const analytics = await Analytics.paginate(query, options);

    return responseFormatter.success(res, analytics, 'Analytics configurations retrieved successfully');
  });

  /**
   * Collect data for analytics
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<Object>} Response
   */
  collectData = asyncHandler(async (req, res) => {
    const { analyticsId } = req.params;
    const context = this.#buildContext(req);

    // Validate data points
    if (req.body.dataPoints && req.body.dataPoints.length > this.#config.validation.maxDataPointsPerBatch) {
      throw new AppError(`Cannot process more than ${this.#config.validation.maxDataPointsPerBatch} data points per batch`, 400);
    }

    const result = await this.#analyticsService.processAnalyticsOperation(
      'COLLECT_DATA',
      { analyticsId, dataPoints: req.body.dataPoints },
      context
    );

    return responseFormatter.success(res, result, 'Data collected successfully');
  });

  /**
   * Process analytics data
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<Object>} Response
   */
  processData = asyncHandler(async (req, res) => {
    const { analyticsId } = req.params;
    const { processingType = 'BATCH' } = req.body;
    const context = this.#buildContext(req);

    const result = await this.#analyticsService.processAnalyticsOperation(
      processingType === 'STREAM' ? 'STREAM_PROCESS_DATA' : 'BATCH_PROCESS_DATA',
      { analyticsId, ...req.body },
      context
    );

    return responseFormatter.success(res, result, 'Data processing completed successfully');
  });

  /**
   * Calculate metrics
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<Object>} Response
   */
  calculateMetrics = asyncHandler(async (req, res) => {
    const { analyticsId } = req.params;
    const context = this.#buildContext(req);

    // Validate metrics request
    if (req.body.metrics && req.body.metrics.length > this.#config.validation.maxMetricsPerRequest) {
      throw new AppError(`Cannot calculate more than ${this.#config.validation.maxMetricsPerRequest} metrics per request`, 400);
    }

    const result = await this.#analyticsService.processAnalyticsOperation(
      'CALCULATE_METRICS',
      { analyticsId, ...req.body },
      context
    );

    return responseFormatter.success(res, result, 'Metrics calculated successfully');
  });

  /**
   * Detect anomalies
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<Object>} Response
   */
  detectAnomalies = asyncHandler(async (req, res) => {
    const { analyticsId } = req.params;
    const context = this.#buildContext(req);

    const sensitivity = req.body.sensitivity || this.#config.anomalyDetection.defaultSensitivity;

    const result = await this.#analyticsService.processAnalyticsOperation(
      'DETECT_ANOMALIES',
      { 
        analyticsId, 
        sensitivity,
        startDate: req.body.startDate,
        endDate: req.body.endDate
      },
      context
    );

    return responseFormatter.success(res, result, 'Anomaly detection completed');
  });

  /**
   * Generate predictions
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<Object>} Response
   */
  generatePredictions = asyncHandler(async (req, res) => {
    const { analyticsId } = req.params;
    const context = this.#buildContext(req);

    // Validate horizon
    const horizon = req.body.horizon || this.#config.predictions.defaultHorizon;
    if (horizon > this.#config.predictions.maxHorizon) {
      throw new AppError(`Prediction horizon cannot exceed ${this.#config.predictions.maxHorizon} days`, 400);
    }

    const result = await this.#analyticsService.processAnalyticsOperation(
      'GENERATE_PREDICTIONS',
      { 
        analyticsId, 
        horizon,
        confidence: req.body.confidence || this.#config.predictions.defaultConfidence,
        model: req.body.model
      },
      context
    );

    return responseFormatter.success(res, result, 'Predictions generated successfully');
  });

  /**
   * Perform analysis
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<Object>} Response
   */
  performAnalysis = asyncHandler(async (req, res) => {
    const { analysisType } = req.params;
    const context = this.#buildContext(req);

    const result = await this.#analyticsService.performAdvancedAnalytics(
      analysisType,
      req.body,
      context
    );

    return responseFormatter.success(res, result, `${analysisType} analysis completed successfully`);
  });

  /**
   * Manage benchmarks
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<Object>} Response
   */
  manageBenchmarks = asyncHandler(async (req, res) => {
    const { operation } = req.query;
    const context = this.#buildContext(req);

    let result;

    switch (operation) {
      case 'create':
        result = await this.#analyticsService.processAnalyticsOperation(
          'CREATE_BENCHMARK',
          req.body,
          context
        );
        break;

      case 'update':
        result = await this.#analyticsService.processAnalyticsOperation(
          'UPDATE_BENCHMARK',
          { benchmarkId: req.params.benchmarkId, ...req.body },
          context
        );
        break;

      case 'compare':
        result = await this.#analyticsService.processAnalyticsOperation(
          'COMPARE_BENCHMARKS',
          req.body,
          context
        );
        break;

      case 'industry':
        result = await this.#analyticsService.processAnalyticsOperation(
          'INDUSTRY_COMPARISON',
          req.body,
          context
        );
        break;

      default:
        throw new AppError(`Unknown benchmark operation: ${operation}`, 400);
    }

    return responseFormatter.success(res, result, `Benchmark ${operation} successful`);
  });

  /**
   * Manage segmentation
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<Object>} Response
   */
  manageSegmentation = asyncHandler(async (req, res) => {
    const { operation } = req.query;
    const context = this.#buildContext(req);

    // Validate segments
    if (req.body.segments && req.body.segments.length > this.#config.validation.maxSegments) {
      throw new AppError(`Cannot create more than ${this.#config.validation.maxSegments} segments`, 400);
    }

    let result;

    switch (operation) {
      case 'segment':
        result = await this.#analyticsService.processAnalyticsOperation(
          'PERFORM_SEGMENTATION',
          { analyticsId: req.params.analyticsId, ...req.body },
          context
        );
        break;

      case 'cohort':
        result = await this.#analyticsService.processAnalyticsOperation(
          'CREATE_COHORT',
          req.body,
          context
        );
        break;

      case 'cluster':
        result = await this.#analyticsService.processAnalyticsOperation(
          'CLUSTER_ANALYSIS',
          { analyticsId: req.params.analyticsId, ...req.body },
          context
        );
        break;

      case 'persona':
        result = await this.#analyticsService.processAnalyticsOperation(
          'CREATE_PERSONA',
          req.body,
          context
        );
        break;

      default:
        throw new AppError(`Unknown segmentation operation: ${operation}`, 400);
    }

    return responseFormatter.success(res, result, `Segmentation ${operation} successful`);
  });

  /**
   * Perform attribution analysis
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<Object>} Response
   */
  performAttribution = asyncHandler(async (req, res) => {
    const { attributionType } = req.params;
    const context = this.#buildContext(req);

    const operationMap = {
      'model': 'ATTRIBUTION_MODELING',
      'touchpoint': 'TOUCHPOINT_ANALYSIS',
      'conversion': 'CONVERSION_ANALYSIS',
      'roi': 'ROI_CALCULATION',
      'channel': 'CHANNEL_ATTRIBUTION'
    };

    const operation = operationMap[attributionType];
    if (!operation) {
      throw new AppError(`Unknown attribution type: ${attributionType}`, 400);
    }

    const result = await this.#analyticsService.processAnalyticsOperation(
      operation,
      req.body,
      context
    );

    return responseFormatter.success(res, result, `${attributionType} attribution analysis completed`);
  });

  /**
   * Export analytics data
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<Object>} Response
   */
  exportAnalytics = asyncHandler(async (req, res) => {
    const { analyticsId } = req.params;
    const { format = 'JSON', type = 'DATA' } = req.query;
    const context = this.#buildContext(req);

    const exportTypeMap = {
      'DATA': 'EXPORT_DATA',
      'INSIGHTS': 'EXPORT_INSIGHTS',
      'PREDICTIONS': 'EXPORT_PREDICTIONS',
      'REPORT': 'EXPORT_REPORT'
    };

    const operation = exportTypeMap[type];
    if (!operation) {
      throw new AppError(`Unknown export type: ${type}`, 400);
    }

    const result = await this.#analyticsService.processAnalyticsOperation(
      operation,
      { analyticsId, format },
      context
    );

    // Track export
    await this.#trackAnalyticsExport(analyticsId, format, type, context);

    return responseFormatter.success(res, result, 'Analytics exported successfully');
  });

  // ==================== Private Helper Methods ====================

  #buildContext(req) {
    return {
      user: req.user,
      organizationId: req.user?.organizationId,
      departmentId: req.user?.departmentId,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      sessionId: req.sessionID,
      requestId: req.id
    };
  }

  async #validateAnalyticsData(data) {
    const errors = [];

    if (!data.name) {
      errors.push('Analytics name is required');
    }

    if (!data.entityType) {
      errors.push('Entity type is required');
    }

    if (!data.entityId) {
      errors.push('Entity ID is required');
    }

    if (data.metrics && !Array.isArray(data.metrics)) {
      errors.push('Metrics must be an array');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  #buildFilterQuery(filter) {
    const query = {};

    if (filter.entityType) query['analyticsReference.entityType'] = filter.entityType;
    if (filter.category) query['metricsConfiguration.category.primary'] = filter.category;
    if (filter.type) query['metricsConfiguration.type'] = filter.type;
    if (filter.status) query['metadata.status'] = filter.status;

    if (filter.dateRange) {
      query['metadata.lastProcessed'] = {
        $gte: new Date(filter.dateRange.start),
        $lte: new Date(filter.dateRange.end)
      };
    }

    return query;
  }

  async #invalidateAnalyticsCache(analyticsId) {
    const cacheKey = `${this.#config.cachePrefix}${analyticsId}`;
    await this.#cacheService.del(cacheKey);
  }

  async #trackAnalyticsExport(analyticsId, format, type, context) {
    await this.#auditService.log({
      action: 'ANALYTICS_EXPORT',
      resource: 'analytics',
      resourceId: analyticsId,
      userId: context.user.id,
      metadata: { format, type },
      timestamp: new Date()
    });
  }

  // Handler method implementations
  async #handleCreateConfig(data, context) {
    return await this.#analyticsService.processAnalyticsOperation('CREATE_ANALYTICS_CONFIG', data, context);
  }

  async #handleUpdateConfig(analyticsId, data, context) {
    return await this.#analyticsService.processAnalyticsOperation('UPDATE_ANALYTICS_CONFIG', { analyticsId, ...data }, context);
  }

  async #handleDeleteConfig(analyticsId, context) {
    return await this.#analyticsService.processAnalyticsOperation('DELETE_ANALYTICS_CONFIG', { analyticsId }, context);
  }

  async #handleGetConfig(analyticsId, context) {
    const analytics = await Analytics.findOne({ analyticsId });
    if (!analytics) throw new AppError('Analytics configuration not found', 404);
    return analytics;
  }

  async #handleListConfigs(query, context) {
    return await Analytics.find({ 'analyticsReference.organizationId': context.organizationId });
  }

  async #handleCollectData(analyticsId, data, context) {
    return await this.#analyticsService.processAnalyticsOperation('COLLECT_DATA', { analyticsId, ...data }, context);
  }

  async #handleBatchCollect(data, context) {
    return await this.#analyticsService.processAnalyticsOperation('BATCH_PROCESS_DATA', data, context);
  }

  async #handleStreamData(analyticsId, data, context) {
    return await this.#analyticsService.processAnalyticsOperation('STREAM_PROCESS_DATA', { analyticsId, ...data }, context);
  }

  async #handleValidateData(data, context) {
    return await this.#analyticsService.processAnalyticsOperation('VALIDATE_DATA', data, context);
  }

  async #handleCleanData(analyticsId, data, context) {
    return await this.#analyticsService.processAnalyticsOperation('CLEAN_DATA', { analyticsId, ...data }, context);
  }

  async #handleProcessData(analyticsId, data, context) {
    return await this.#analyticsService.processAnalyticsOperation('BATCH_PROCESS_DATA', { analyticsId, ...data }, context);
  }

  async #handleAggregateData(analyticsId, data, context) {
    return await this.#analyticsService.processAnalyticsOperation('AGGREGATE_DATA', { analyticsId, ...data }, context);
  }

  async #handleTransformData(analyticsId, data, context) {
    return await this.#analyticsService.processAnalyticsOperation('TRANSFORM_DATA', { analyticsId, ...data }, context);
  }

  async #handleEnrichData(analyticsId, data, context) {
    return await this.#analyticsService.processAnalyticsOperation('ENRICH_DATA', { analyticsId, ...data }, context);
  }

  async #handleCalculateMetrics(analyticsId, data, context) {
    return await this.#analyticsService.processAnalyticsOperation('CALCULATE_METRICS', { analyticsId, ...data }, context);
  }

  async #handleCalculateStatistics(analyticsId, data, context) {
    return await this.#analyticsService.processAnalyticsOperation('CALCULATE_STATISTICS', { analyticsId, ...data }, context);
  }

  async #handleCalculateKPIs(data, context) {
    return await this.#analyticsService.performAdvancedAnalytics('KPI_ANALYSIS', data, context);
  }

  async #handleCalculatePerformance(analyticsId, context) {
    return await this.#analyticsService.processAnalyticsOperation('ANALYZE_PERFORMANCE', { analyticsId }, context);
  }

  async #handleDetectAnomalies(analyticsId, data, context) {
    return await this.#analyticsService.processAnalyticsOperation('DETECT_ANOMALIES', { analyticsId, ...data }, context);
  }

  async #handleClassifyAnomalies(analyticsId, data, context) {
    return await this.#analyticsService.processAnalyticsOperation('CLASSIFY_ANOMALIES', { analyticsId, ...data }, context);
  }

  async #handleInvestigateAnomaly(anomalyId, context) {
    return await this.#analyticsService.processAnalyticsOperation('INVESTIGATE_ANOMALY', { anomalyId }, context);
  }

  async #handleResolveAnomaly(anomalyId, data, context) {
    return await this.#analyticsService.processAnalyticsOperation('RESOLVE_ANOMALY', { anomalyId, ...data }, context);
  }

  async #handleConfigureDetection(analyticsId, data, context) {
    return await this.#analyticsService.processAnalyticsOperation('CONFIGURE_ANOMALY_DETECTION', { analyticsId, ...data }, context);
  }

  async #handleGeneratePredictions(analyticsId, data, context) {
    return await this.#analyticsService.processAnalyticsOperation('GENERATE_PREDICTIONS', { analyticsId, ...data }, context);
  }

  async #handleForecastMetrics(analyticsId, data, context) {
    return await this.#analyticsService.processAnalyticsOperation('FORECAST_METRICS', { analyticsId, ...data }, context);
  }

  async #handleScenarioAnalysis(analyticsId, data, context) {
    return await this.#analyticsService.processAnalyticsOperation('SCENARIO_ANALYSIS', { analyticsId, ...data }, context);
  }

  async #handleWhatIfAnalysis(analyticsId, data, context) {
    return await this.#analyticsService.processAnalyticsOperation('WHAT_IF_ANALYSIS', { analyticsId, ...data }, context);
  }

  async #handleTrainModel(analyticsId, data, context) {
    return await this.#analyticsService.processAnalyticsOperation('TRAIN_PREDICTIVE_MODEL', { analyticsId, ...data }, context);
  }

  async #handleTimeSeriesAnalysis(analyticsId, data, context) {
    return await this.#analyticsService.processAnalyticsOperation('TIME_SERIES_ANALYSIS', { analyticsId, ...data }, context);
  }

  async #handleTrendAnalysis(analyticsId, data, context) {
    return await this.#analyticsService.processAnalyticsOperation('TREND_ANALYSIS', { analyticsId, ...data }, context);
  }

  async #handleCorrelationAnalysis(analyticsId, data, context) {
    return await this.#analyticsService.processAnalyticsOperation('ANALYZE_CORRELATION', { analyticsId, ...data }, context);
  }

  async #handleRegressionAnalysis(analyticsId, data, context) {
    return await this.#analyticsService.processAnalyticsOperation('PERFORM_REGRESSION', { analyticsId, ...data }, context);
  }

  async #handleVarianceAnalysis(analyticsId, data, context) {
    return await this.#analyticsService.processAnalyticsOperation('VARIANCE_ANALYSIS', { analyticsId, ...data }, context);
  }

  async #handleCreateBenchmark(data, context) {
    return await this.#analyticsService.processAnalyticsOperation('CREATE_BENCHMARK', data, context);
  }

  async #handleUpdateBenchmark(benchmarkId, data, context) {
    return await this.#analyticsService.processAnalyticsOperation('UPDATE_BENCHMARK', { benchmarkId, ...data }, context);
  }

  async #handleCompareBenchmarks(data, context) {
    return await this.#analyticsService.processAnalyticsOperation('COMPARE_BENCHMARKS', data, context);
  }

  async #handleIndustryComparison(data, context) {
    return await this.#analyticsService.processAnalyticsOperation('INDUSTRY_COMPARISON', data, context);
  }

  async #handleCompetitorAnalysis(data, context) {
    return await this.#analyticsService.processAnalyticsOperation('COMPETITOR_ANALYSIS', data, context);
  }

  async #handlePerformSegmentation(analyticsId, data, context) {
    return await this.#analyticsService.processAnalyticsOperation('PERFORM_SEGMENTATION', { analyticsId, ...data }, context);
  }

  async #handleCreateCohort(data, context) {
    return await this.#analyticsService.processAnalyticsOperation('CREATE_COHORT', data, context);
  }

  async #handleAnalyzeCohort(cohortId, data, context) {
    return await this.#analyticsService.processAnalyticsOperation('ANALYZE_COHORT', { cohortId, ...data }, context);
  }

  async #handleClusterAnalysis(analyticsId, data, context) {
    return await this.#analyticsService.processAnalyticsOperation('CLUSTER_ANALYSIS', { analyticsId, ...data }, context);
  }

  async #handleCreatePersona(data, context) {
    return await this.#analyticsService.processAnalyticsOperation('CREATE_PERSONA', data, context);
  }

  async #handleAttributionModeling(data, context) {
    return await this.#analyticsService.processAnalyticsOperation('ATTRIBUTION_MODELING', data, context);
  }

  async #handleTouchpointAnalysis(data, context) {
    return await this.#analyticsService.processAnalyticsOperation('TOUCHPOINT_ANALYSIS', data, context);
  }

  async #handleConversionAnalysis(data, context) {
    return await this.#analyticsService.processAnalyticsOperation('CONVERSION_ANALYSIS', data, context);
  }

  async #handleROICalculation(data, context) {
    return await this.#analyticsService.processAnalyticsOperation('ROI_CALCULATION', data, context);
  }

  async #handleChannelAttribution(data, context) {
    return await this.#analyticsService.processAnalyticsOperation('CHANNEL_ATTRIBUTION', data, context);
  }

  async #handleCreateVisualization(data, context) {
    return await this.#analyticsService.processAnalyticsOperation('CREATE_VISUALIZATION', data, context);
  }

  async #handleUpdateVisualization(visualizationId, data, context) {
    return await this.#analyticsService.processAnalyticsOperation('UPDATE_VISUALIZATION', { visualizationId, ...data }, context);
  }

  async #handleGenerateHeatmap(analyticsId, data, context) {
    return await this.#analyticsService.processAnalyticsOperation('GENERATE_HEATMAP', { analyticsId, ...data }, context);
  }

  async #handleGenerateChart(analyticsId, data, context) {
    return await this.#analyticsService.processAnalyticsOperation('CONFIGURE_CHART', { analyticsId, ...data }, context);
  }

  async #handleExportData(analyticsId, query, context) {
    return await this.#analyticsService.processAnalyticsOperation('EXPORT_DATA', { analyticsId, ...query }, context);
  }

  async #handleExportInsights(analyticsId, query, context) {
    return await this.#analyticsService.processAnalyticsOperation('EXPORT_INSIGHTS', { analyticsId, ...query }, context);
  }

  async #handleExportPredictions(analyticsId, query, context) {
    return await this.#analyticsService.processAnalyticsOperation('EXPORT_PREDICTIONS', { analyticsId, ...query }, context);
  }

  async #handleExportReport(analyticsId, query, context) {
    return await this.#analyticsService.processAnalyticsOperation('EXPORT_REPORT', { analyticsId, ...query }, context);
  }
}

module.exports = AnalyticsController;