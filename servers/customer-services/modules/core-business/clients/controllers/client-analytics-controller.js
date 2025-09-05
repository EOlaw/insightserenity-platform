'use strict';

/**
 * @fileoverview Client analytics controller for comprehensive performance tracking and insights
 * @module servers/customer-services/modules/core-business/clients/controllers/client-analytics-controller
 */

const ClientAnalyticsService = require('../services/client-analytics-service');
const ClientService = require('../services/client-service');
const logger = require('../../../../../../shared/lib/utils/logger');
const { AppError, ValidationError, NotFoundError, ForbiddenError } = require('../../../../../../shared/lib/utils/app-error');
const ResponseFormatter = require('../../../../../../shared/lib/utils/response-formatter');
const asyncHandler = require('../../../../../../shared/lib/utils/async-handler');
const CommonValidator = require('../../../../../../shared/lib/utils/validators/common-validators');
const { STATUS_CODES } = require('../../../../../../shared/lib/utils/constants/status-codes');
const { body, param, query, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const moment = require('moment');
const zlib = require('zlib');

/**
 * Controller class for client analytics operations
 * @class ClientAnalyticsController
 */
class ClientAnalyticsController {
  /**
   * Private fields
   */
  #analyticsService;
  #clientService;
  #responseFormatter;
  #analyticsConfig;
  #securityConfig;
  #cacheConfig;
  #reportConfig;
  #dashboardConfig;
  #metricsConfig;
  #aggregationConfig;
  #predictionConfig;
  #exportConfig;
  #rateLimitConfig;

  /**
   * Constructor
   */
  constructor() {
    this.#analyticsService = new ClientAnalyticsService();
    this.#clientService = new ClientService();
    this.#responseFormatter = new ResponseFormatter();
    this.#initializeConfigurations();
    
    // Bind all methods to preserve context
    this.getClientAnalytics = this.getClientAnalytics.bind(this);
    this.getAggregatedAnalytics = this.getAggregatedAnalytics.bind(this);
    this.getDashboardData = this.getDashboardData.bind(this);
    this.generateAnalyticsReport = this.generateAnalyticsReport.bind(this);
    this.exportAnalytics = this.exportAnalytics.bind(this);
    this.getPerformanceMetrics = this.getPerformanceMetrics.bind(this);
    this.getEngagementMetrics = this.getEngagementMetrics.bind(this);
    this.getFinancialMetrics = this.getFinancialMetrics.bind(this);
    this.getRetentionMetrics = this.getRetentionMetrics.bind(this);
    this.getPredictiveInsights = this.getPredictiveInsights.bind(this);
    this.getClientComparisons = this.getClientComparisons.bind(this);
    this.getIndustryBenchmarks = this.getIndustryBenchmarks.bind(this);
    this.getTrendAnalysis = this.getTrendAnalysis.bind(this);
    this.getHealthScoreAnalytics = this.getHealthScoreAnalytics.bind(this);
    this.getRevenueAnalytics = this.getRevenueAnalytics.bind(this);
    this.getChurnAnalysis = this.getChurnAnalysis.bind(this);
    this.getGrowthPredictions = this.getGrowthPredictions.bind(this);
    this.getUpsellOpportunities = this.getUpsellOpportunities.bind(this);
    this.getCustomMetrics = this.getCustomMetrics.bind(this);
    this.createCustomReport = this.createCustomReport.bind(this);
    this.scheduleReport = this.scheduleReport.bind(this);
    this.getReportHistory = this.getReportHistory.bind(this);
    this.getAlertMetrics = this.getAlertMetrics.bind(this);
    this.updateAnalyticsSettings = this.updateAnalyticsSettings.bind(this);
    this.refreshAnalyticsCache = this.refreshAnalyticsCache.bind(this);
    this.getAnalyticsMetadata = this.getAnalyticsMetadata.bind(this);
    this.validateAnalyticsData = this.validateAnalyticsData.bind(this);
    this.getClientScorecard = this.getClientScorecard.bind(this);
    this.getPortfolioAnalytics = this.getPortfolioAnalytics.bind(this);
    this.getRiskAssessment = this.getRiskAssessment.bind(this);
    this.getCompetitiveAnalysis = this.getCompetitiveAnalysis.bind(this);
    
    logger.info('ClientAnalyticsController initialized');
  }

  /**
   * Get comprehensive analytics for a specific client
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   */
  async getClientAnalytics(req, res, next) {
    return asyncHandler(async (req, res, next) => {
      const { clientId } = req.params;
      const userId = req.user?.id || req.user?.adminId;

      logger.info(`Fetching analytics for client: ${clientId}`);

      // Validate client ID
      if (!CommonValidator.isValidObjectId(clientId)) {
        throw new ValidationError('Invalid client ID format', 'INVALID_CLIENT_ID');
      }

      // Check permissions
      await this.#checkPermission(req, 'clients.analytics');

      // Verify client exists and user has access
      const client = await this.#clientService.getClientById(clientId, {
        checkPermissions: true,
        userId,
        tenantId: req.tenant?.id
      });

      if (!client) {
        throw new NotFoundError('Client not found', 'CLIENT_NOT_FOUND');
      }

      // Parse analytics options
      const options = {
        dateRange: this.#parseDateRange(req.query),
        metrics: req.query.metrics ? req.query.metrics.split(',') : ['all'],
        comparisons: req.query.comparisons !== 'false',
        predictions: req.query.predictions !== 'false',
        benchmarks: req.query.benchmarks === 'true',
        granularity: req.query.granularity || 'daily',
        includeDetails: req.query.includeDetails === 'true',
        refreshCache: req.query.refreshCache === 'true',
        userId
      };

      // Validate metrics
      const validMetrics = ['all', 'performance', 'engagement', 'financial', 'retention'];
      if (!options.metrics.every(metric => validMetrics.includes(metric))) {
        throw new ValidationError(
          `Invalid metrics. Valid options: ${validMetrics.join(', ')}`,
          'INVALID_METRICS'
        );
      }

      // Get analytics data
      const analytics = await this.#analyticsService.getClientAnalytics(clientId, options);

      // Add contextual insights
      analytics.insights = await this.#generateContextualInsights(analytics, client);

      // Log analytics access
      await this.#logControllerAction('CLIENT_ANALYTICS_ACCESSED', {
        clientId,
        userId,
        metrics: options.metrics,
        dateRange: options.dateRange
      });

      // Format response
      const response = this.#responseFormatter.formatSuccess(
        analytics,
        'Client analytics retrieved successfully'
      );

      // Set cache headers based on data freshness
      const cacheMaxAge = this.#calculateCacheMaxAge(options.dateRange);
      res.set('Cache-Control', `private, max-age=${cacheMaxAge}`);

      res.status(STATUS_CODES.OK).json(response);
    })(req, res, next);
  }

  /**
   * Get aggregated analytics across multiple clients
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   */
  async getAggregatedAnalytics(req, res, next) {
    return asyncHandler(async (req, res, next) => {
      logger.info('Fetching aggregated analytics');

      // Check permissions
      await this.#checkPermission(req, 'clients.analytics');

      // Parse filters
      const filters = this.#parseAnalyticsFilters(req.query);

      // Parse options
      const options = {
        groupBy: req.query.groupBy || 'tier',
        dateRange: this.#parseDateRange(req.query),
        tenantId: req.tenant?.id,
        includeComparisons: req.query.includeComparisons !== 'false',
        includeTrends: req.query.includeTrends !== 'false',
        aggregationLevel: req.query.aggregationLevel || 'summary',
        metrics: req.query.metrics ? req.query.metrics.split(',') : []
      };

      // Validate groupBy parameter
      const validGroupBy = ['tier', 'status', 'industry', 'region', 'accountManager', 'size'];
      if (!validGroupBy.includes(options.groupBy)) {
        throw new ValidationError(
          `Invalid groupBy parameter. Valid options: ${validGroupBy.join(', ')}`,
          'INVALID_GROUP_BY'
        );
      }

      // Get aggregated analytics
      const aggregatedData = await this.#analyticsService.getAggregatedAnalytics(filters, options);

      // Add portfolio insights
      aggregatedData.portfolioInsights = await this.#generatePortfolioInsights(
        aggregatedData,
        options
      );

      // Add benchmarking data
      if (req.query.includeBenchmarks === 'true') {
        aggregatedData.benchmarks = await this.#getBenchmarkData(filters, options);
      }

      // Log aggregated analytics access
      await this.#logControllerAction('AGGREGATED_ANALYTICS_ACCESSED', {
        userId: req.user?.id,
        filters,
        options
      });

      // Format response
      const response = this.#responseFormatter.formatSuccess(
        aggregatedData,
        'Aggregated analytics retrieved successfully'
      );

      res.status(STATUS_CODES.OK).json(response);
    })(req, res, next);
  }

  /**
   * Get dashboard data for analytics overview
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   */
  async getDashboardData(req, res, next) {
    return asyncHandler(async (req, res, next) => {
      logger.info('Fetching dashboard data');

      // Check permissions
      await this.#checkPermission(req, 'clients.analytics');

      // Parse dashboard options
      const filters = this.#parseAnalyticsFilters(req.query);
      const options = {
        widgets: req.query.widgets ? req.query.widgets.split(',') : 
                ['kpi', 'trends', 'distribution', 'alerts', 'topPerformers'],
        dateRange: this.#parseDateRange(req.query),
        tenantId: req.tenant?.id,
        refreshData: req.query.refreshData === 'true',
        includePredictions: req.query.includePredictions === 'true'
      };

      // Validate widgets
      const validWidgets = [
        'kpi', 'trends', 'distribution', 'alerts', 'topPerformers', 
        'atRisk', 'opportunities', 'benchmarks', 'forecasts'
      ];
      
      if (!options.widgets.every(widget => validWidgets.includes(widget))) {
        throw new ValidationError(
          `Invalid widgets. Valid options: ${validWidgets.join(', ')}`,
          'INVALID_WIDGETS'
        );
      }

      // Get dashboard data
      const dashboardData = await this.#analyticsService.getDashboardData(filters, options);

      // Add real-time alerts
      if (options.widgets.includes('alerts')) {
        dashboardData.widgets.alerts.realTime = await this.#getRealTimeAlerts(req.tenant?.id);
      }

      // Add personalized recommendations
      dashboardData.recommendations = await this.#generateDashboardRecommendations(
        dashboardData,
        req.user
      );

      // Log dashboard access
      await this.#logControllerAction('DASHBOARD_DATA_ACCESSED', {
        userId: req.user?.id,
        widgets: options.widgets,
        filters
      });

      // Format response
      const response = this.#responseFormatter.formatSuccess(
        dashboardData,
        'Dashboard data retrieved successfully'
      );

      // Set shorter cache for dashboard data
      res.set('Cache-Control', `private, max-age=${this.#cacheConfig.dashboardTTL}`);
      res.status(STATUS_CODES.OK).json(response);
    })(req, res, next);
  }

  /**
   * Generate comprehensive analytics report
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   */
  async generateAnalyticsReport(req, res, next) {
    return asyncHandler(async (req, res, next) => {
      const { clientId } = req.params;
      const userId = req.user?.id || req.user?.adminId;

      logger.info(`Generating analytics report${clientId ? ` for client: ${clientId}` : ''}`);

      // Validate client ID if provided
      if (clientId && !CommonValidator.isValidObjectId(clientId)) {
        throw new ValidationError('Invalid client ID format', 'INVALID_CLIENT_ID');
      }

      // Check permissions
      await this.#checkPermission(req, 'clients.reports');

      // Parse report options
      const options = {
        format: req.query.format || 'pdf',
        sections: req.query.sections ? req.query.sections.split(',') : 
                 ['overview', 'performance', 'financial', 'predictions'],
        dateRange: this.#parseDateRange(req.query),
        includeCharts: req.query.includeCharts !== 'false',
        includeRecommendations: req.query.includeRecommendations !== 'false',
        template: req.query.template || 'comprehensive',
        customization: req.body.customization || {},
        userId
      };

      // Validate report format
      const validFormats = this.#reportConfig.supportedFormats;
      if (!validFormats.includes(options.format)) {
        throw new ValidationError(
          `Invalid report format. Supported formats: ${validFormats.join(', ')}`,
          'INVALID_FORMAT'
        );
      }

      // Validate sections
      const validSections = [
        'overview', 'performance', 'engagement', 'financial', 'retention',
        'predictions', 'recommendations', 'benchmarks', 'insights'
      ];
      
      if (!options.sections.every(section => validSections.includes(section))) {
        throw new ValidationError(
          `Invalid sections. Valid options: ${validSections.join(', ')}`,
          'INVALID_SECTIONS'
        );
      }

      // Generate report
      const reportData = await this.#analyticsService.generateAnalyticsReport(
        clientId,
        options
      );

      // Log report generation
      await this.#logControllerAction('ANALYTICS_REPORT_GENERATED', {
        clientId,
        userId,
        format: options.format,
        sections: options.sections,
        reportId: reportData.metadata?.reportId
      });

      // Handle different response formats
      if (options.format === 'json') {
        const response = this.#responseFormatter.formatSuccess(
          reportData,
          'Analytics report generated successfully'
        );
        return res.status(STATUS_CODES.OK).json(response);
      }

      // For non-JSON formats, return file
      const fileName = `analytics_report_${Date.now()}.${options.format}`;
      const contentType = this.#getContentType(options.format);

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.status(STATUS_CODES.OK).send(reportData);
    })(req, res, next);
  }

  /**
   * Export analytics data in various formats
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   */
  async exportAnalytics(req, res, next) {
    return asyncHandler(async (req, res, next) => {
      logger.info('Exporting analytics data');

      // Check permissions
      await this.#checkPermission(req, 'clients.export');

      // Parse export parameters
      const exportOptions = {
        format: req.query.format || 'csv',
        dataType: req.query.dataType || 'summary',
        filters: this.#parseAnalyticsFilters(req.query),
        dateRange: this.#parseDateRange(req.query),
        fields: req.query.fields ? req.query.fields.split(',') : [],
        includeMetadata: req.query.includeMetadata !== 'false',
        compression: req.query.compression === 'true'
      };

      // Validate export format
      const validFormats = this.#exportConfig.supportedFormats;
      if (!validFormats.includes(exportOptions.format)) {
        throw new ValidationError(
          `Invalid export format. Supported formats: ${validFormats.join(', ')}`,
          'INVALID_EXPORT_FORMAT'
        );
      }

      // Validate data type
      const validDataTypes = ['summary', 'detailed', 'metrics', 'predictions', 'insights'];
      if (!validDataTypes.includes(exportOptions.dataType)) {
        throw new ValidationError(
          `Invalid data type. Valid options: ${validDataTypes.join(', ')}`,
          'INVALID_DATA_TYPE'
        );
      }

      // Get data based on type
      let analyticsData;
      switch (exportOptions.dataType) {
        case 'summary':
          analyticsData = await this.#getExportSummaryData(exportOptions);
          break;
        case 'detailed':
          analyticsData = await this.#getExportDetailedData(exportOptions);
          break;
        case 'metrics':
          analyticsData = await this.#getExportMetricsData(exportOptions);
          break;
        case 'predictions':
          analyticsData = await this.#getExportPredictionsData(exportOptions);
          break;
        case 'insights':
          analyticsData = await this.#getExportInsightsData(exportOptions);
          break;
      }

      // Export data
      const exportBuffer = await this.#analyticsService.exportAnalytics(
        analyticsData,
        exportOptions.format
      );

      // Apply compression if requested
      const finalBuffer = exportOptions.compression ? 
        await this.#compressData(exportBuffer) : exportBuffer;

      // Log export
      await this.#logControllerAction('ANALYTICS_EXPORTED', {
        userId: req.user?.id,
        format: exportOptions.format,
        dataType: exportOptions.dataType,
        recordCount: analyticsData?.length || 0
      });

      // Set response headers
      const fileName = `analytics_${exportOptions.dataType}_${Date.now()}.${exportOptions.format}`;
      const contentType = exportOptions.compression ? 
        'application/gzip' : this.#getContentType(exportOptions.format);

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('Content-Length', finalBuffer.length);

      res.status(STATUS_CODES.OK).send(finalBuffer);
    })(req, res, next);
  }

  /**
   * Get performance metrics for clients
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   */
  async getPerformanceMetrics(req, res, next) {
    return asyncHandler(async (req, res, next) => {
      const { clientId } = req.params;
      logger.info(`Fetching performance metrics${clientId ? ` for client: ${clientId}` : ''}`);

      // Check permissions
      await this.#checkPermission(req, 'clients.analytics');

      // Parse options
      const options = {
        dateRange: this.#parseDateRange(req.query),
        granularity: req.query.granularity || 'monthly',
        comparePrevious: req.query.comparePrevious !== 'false',
        includeBenchmarks: req.query.includeBenchmarks === 'true',
        metrics: req.query.metrics ? req.query.metrics.split(',') : 
                ['projects', 'delivery', 'quality', 'utilization']
      };

      // Get performance metrics
      const performanceData = clientId ? 
        await this.#getClientPerformanceMetrics(clientId, options) :
        await this.#getAggregatedPerformanceMetrics(req.tenant?.id, options);

      // Add performance insights
      performanceData.insights = await this.#generatePerformanceInsights(
        performanceData,
        options
      );

      // Log metrics access
      await this.#logControllerAction('PERFORMANCE_METRICS_ACCESSED', {
        clientId,
        userId: req.user?.id,
        metrics: options.metrics
      });

      // Format response
      const response = this.#responseFormatter.formatSuccess(
        performanceData,
        'Performance metrics retrieved successfully'
      );

      res.status(STATUS_CODES.OK).json(response);
    })(req, res, next);
  }

  /**
   * Get predictive insights and forecasts
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   */
  async getPredictiveInsights(req, res, next) {
    return asyncHandler(async (req, res, next) => {
      const { clientId } = req.params;
      logger.info(`Fetching predictive insights${clientId ? ` for client: ${clientId}` : ''}`);

      // Check permissions
      await this.#checkPermission(req, 'clients.predictions');

      // Parse prediction options
      const options = {
        predictionTypes: req.query.types ? req.query.types.split(',') : 
                        ['churn', 'growth', 'upsell', 'risk'],
        timeHorizon: req.query.timeHorizon || '6months',
        confidence: parseFloat(req.query.confidence) || 0.8,
        includeFactors: req.query.includeFactors !== 'false',
        includeRecommendations: req.query.includeRecommendations !== 'false'
      };

      // Validate prediction types
      const validTypes = ['churn', 'growth', 'upsell', 'risk', 'lifetime_value', 'engagement'];
      if (!options.predictionTypes.every(type => validTypes.includes(type))) {
        throw new ValidationError(
          `Invalid prediction types. Valid options: ${validTypes.join(', ')}`,
          'INVALID_PREDICTION_TYPES'
        );
      }

      // Validate time horizon
      const validHorizons = ['1month', '3months', '6months', '1year', '2years'];
      if (!validHorizons.includes(options.timeHorizon)) {
        throw new ValidationError(
          `Invalid time horizon. Valid options: ${validHorizons.join(', ')}`,
          'INVALID_TIME_HORIZON'
        );
      }

      // Get predictive insights
      const predictions = clientId ?
        await this.#getClientPredictions(clientId, options) :
        await this.#getPortfolioPredictions(req.tenant?.id, options);

      // Add actionable recommendations
      predictions.actionableRecommendations = await this.#generateActionableRecommendations(
        predictions,
        options
      );

      // Log predictions access
      await this.#logControllerAction('PREDICTIVE_INSIGHTS_ACCESSED', {
        clientId,
        userId: req.user?.id,
        predictionTypes: options.predictionTypes,
        timeHorizon: options.timeHorizon
      });

      // Format response
      const response = this.#responseFormatter.formatSuccess(
        predictions,
        'Predictive insights retrieved successfully'
      );

      res.status(STATUS_CODES.OK).json(response);
    })(req, res, next);
  }

  /**
   * Get health score analytics and trends
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   */
  async getHealthScoreAnalytics(req, res, next) {
    return asyncHandler(async (req, res, next) => {
      logger.info('Fetching health score analytics');

      // Check permissions
      await this.#checkPermission(req, 'clients.analytics');

      // Parse options
      const options = {
        dateRange: this.#parseDateRange(req.query),
        segmentation: req.query.segmentation || 'tier',
        includeTrends: req.query.includeTrends !== 'false',
        includeDistribution: req.query.includeDistribution !== 'false',
        includeFactorAnalysis: req.query.includeFactorAnalysis !== 'false',
        tenantId: req.tenant?.id
      };

      // Get health score analytics
      const healthAnalytics = await this.#getHealthScoreAnalyticsData(options);

      // Add health improvement recommendations
      healthAnalytics.improvementRecommendations = await this.#generateHealthImprovementRecommendations(
        healthAnalytics
      );

      // Log health analytics access
      await this.#logControllerAction('HEALTH_SCORE_ANALYTICS_ACCESSED', {
        userId: req.user?.id,
        options
      });

      // Format response
      const response = this.#responseFormatter.formatSuccess(
        healthAnalytics,
        'Health score analytics retrieved successfully'
      );

      res.status(STATUS_CODES.OK).json(response);
    })(req, res, next);
  }

  /**
   * Create custom analytics report
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   */
  async createCustomReport(req, res, next) {
    return asyncHandler(async (req, res, next) => {
      logger.info('Creating custom analytics report');

      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ValidationError('Validation failed', 'VALIDATION_ERROR', errors.array());
      }

      // Check permissions
      await this.#checkPermission(req, 'clients.customReports');

      const userId = req.user?.id || req.user?.adminId;

      // Parse custom report configuration
      const reportConfig = {
        name: req.body.name,
        description: req.body.description,
        metrics: req.body.metrics,
        filters: req.body.filters,
        groupBy: req.body.groupBy,
        dateRange: req.body.dateRange,
        format: req.body.format || 'json',
        schedule: req.body.schedule,
        recipients: req.body.recipients || [],
        visualization: req.body.visualization || {},
        customFields: req.body.customFields || [],
        tenantId: req.tenant?.id,
        createdBy: userId
      };

      // Validate report configuration
      await this.#validateCustomReportConfig(reportConfig);

      // Create custom report
      const customReport = await this.#createCustomAnalyticsReport(reportConfig);

      // Schedule report if requested
      if (reportConfig.schedule) {
        await this.#scheduleCustomReport(customReport._id, reportConfig.schedule);
      }

      // Log custom report creation
      await this.#logControllerAction('CUSTOM_REPORT_CREATED', {
        reportId: customReport._id,
        reportName: reportConfig.name,
        userId,
        scheduled: !!reportConfig.schedule
      });

      // Format response
      const response = this.#responseFormatter.formatSuccess(
        customReport,
        'Custom analytics report created successfully',
        STATUS_CODES.CREATED
      );

      res.status(STATUS_CODES.CREATED).json(response);
    })(req, res, next);
  }

  /**
   * Private helper methods
   */
  
  #initializeConfigurations() {
    this.#analyticsConfig = {
      maxDateRange: 365, // Maximum days for analytics queries
      defaultMetrics: ['performance', 'engagement', 'financial', 'retention'],
      supportedGranularities: ['hourly', 'daily', 'weekly', 'monthly', 'quarterly', 'yearly'],
      maxDataPoints: 10000
    };

    this.#securityConfig = {
      requireMFA: false,
      auditAnalyticsAccess: true,
      encryptSensitiveData: true,
      maskPII: true
    };

    this.#cacheConfig = {
      analyticsTTL: 3600, // 1 hour
      dashboardTTL: 300, // 5 minutes
      reportTTL: 7200, // 2 hours
      predictionsTTL: 14400 // 4 hours
    };

    this.#reportConfig = {
      supportedFormats: ['json', 'pdf', 'excel', 'csv'],
      maxReportSize: 50 * 1024 * 1024, // 50MB
      schedulingEnabled: true,
      retentionDays: 90
    };

    this.#dashboardConfig = {
      maxWidgets: 20,
      refreshInterval: 60000, // 1 minute
      autoRefreshEnabled: true,
      customizationEnabled: true
    };

    this.#metricsConfig = {
      healthScoreWeights: {
        engagement: 0.25,
        revenue: 0.30,
        satisfaction: 0.20,
        retention: 0.25
      },
      performanceThresholds: {
        excellent: 90,
        good: 75,
        average: 60,
        poor: 40
      }
    };

    this.#aggregationConfig = {
      maxGroupByLevels: 3,
      supportedAggregations: ['sum', 'avg', 'min', 'max', 'count'],
      defaultAggregation: 'avg'
    };

    this.#predictionConfig = {
      minDataPoints: 30,
      maxPredictionHorizon: 730, // 2 years
      defaultConfidence: 0.8,
      modelRefreshInterval: 86400000 // 24 hours
    };

    this.#exportConfig = {
      supportedFormats: ['csv', 'excel', 'json', 'parquet'],
      maxRecords: 1000000,
      compressionEnabled: true,
      encryptionEnabled: true
    };

    this.#rateLimitConfig = {
      analytics: { windowMs: 60000, max: 100 }, // 100 requests per minute
      reports: { windowMs: 3600000, max: 10 }, // 10 reports per hour
      exports: { windowMs: 3600000, max: 5 } // 5 exports per hour
    };
  }

  async #checkPermission(req, permission) {
    const hasPermission = req.user?.permissions?.includes(permission) || 
                         req.user?.role === 'admin';
    
    if (!hasPermission) {
      throw new ForbiddenError(`Insufficient permissions: ${permission}`, 'PERMISSION_DENIED');
    }

    return true;
  }

  #parseDateRange(query) {
    const defaultRange = {
      start: moment().subtract(90, 'days').toDate(),
      end: new Date()
    };

    if (!query.dateFrom && !query.dateTo) {
      return defaultRange;
    }

    const dateRange = {
      start: query.dateFrom ? new Date(query.dateFrom) : defaultRange.start,
      end: query.dateTo ? new Date(query.dateTo) : defaultRange.end
    };

    // Validate date range
    if (dateRange.start >= dateRange.end) {
      throw new ValidationError('Start date must be before end date', 'INVALID_DATE_RANGE');
    }

    // Check maximum date range
    const daysDiff = moment(dateRange.end).diff(moment(dateRange.start), 'days');
    if (daysDiff > this.#analyticsConfig.maxDateRange) {
      throw new ValidationError(
        `Date range exceeds maximum of ${this.#analyticsConfig.maxDateRange} days`,
        'DATE_RANGE_TOO_LARGE'
      );
    }

    return dateRange;
  }

  #parseAnalyticsFilters(query) {
    const filters = {};

    if (query.clientId) filters.clientId = query.clientId;
    if (query.status) filters.status = query.status;
    if (query.tier) filters.tier = query.tier;
    if (query.industry) filters.industry = query.industry;
    if (query.region) filters.region = query.region;
    if (query.accountManager) filters.accountManager = query.accountManager;
    if (query.minRevenue) filters.minRevenue = parseFloat(query.minRevenue);
    if (query.maxRevenue) filters.maxRevenue = parseFloat(query.maxRevenue);
    if (query.healthScore) filters.healthScore = parseInt(query.healthScore);
    if (query.churnRisk) filters.churnRisk = query.churnRisk;
    if (query.tags) filters.tags = query.tags.split(',');

    return filters;
  }

  #calculateCacheMaxAge(dateRange) {
    const now = new Date();
    const daysSinceEnd = moment(now).diff(moment(dateRange.end), 'days');
    
    // Older data can be cached longer
    if (daysSinceEnd > 30) return 86400; // 24 hours
    if (daysSinceEnd > 7) return 3600; // 1 hour
    if (daysSinceEnd > 1) return 1800; // 30 minutes
    return 300; // 5 minutes for recent data
  }

  #getContentType(format) {
    const contentTypes = {
      json: 'application/json',
      pdf: 'application/pdf',
      excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      csv: 'text/csv',
      parquet: 'application/octet-stream'
    };
    return contentTypes[format] || 'application/octet-stream';
  }

  async #generateContextualInsights(analytics, client) {
    const insights = [];

    // Performance insights
    if (analytics.metrics?.performance?.score < 70) {
      insights.push({
        type: 'warning',
        category: 'performance',
        message: 'Client performance is below expectations',
        recommendation: 'Schedule performance review meeting',
        priority: 'high'
      });
    }

    // Revenue insights
    if (analytics.metrics?.financial?.revenue?.growth?.percentage < 0) {
      insights.push({
        type: 'alert',
        category: 'financial',
        message: 'Revenue declining compared to previous period',
        recommendation: 'Investigate revenue decline and implement recovery plan',
        priority: 'urgent'
      });
    }

    // Engagement insights
    if (analytics.metrics?.engagement?.score < 50) {
      insights.push({
        type: 'warning',
        category: 'engagement',
        message: 'Low client engagement detected',
        recommendation: 'Implement engagement recovery strategy',
        priority: 'high'
      });
    }

    return insights;
  }

  async #generatePortfolioInsights(aggregatedData, options) {
    const insights = {
      summary: {},
      trends: {},
      opportunities: [],
      risks: []
    };

    // Calculate portfolio health
    const portfolioHealth = this.#calculatePortfolioHealth(aggregatedData);
    insights.summary.portfolioHealth = portfolioHealth;

    // Identify top performers
    insights.summary.topPerformers = aggregatedData.byGroup
      ?.filter(group => group.avgHealthScore > 80)
      ?.slice(0, 5) || [];

    // Identify at-risk clients
    insights.risks = aggregatedData.riskDistribution
      ?.filter(risk => risk._id === 'high' || risk._id === 'critical')
      ?.map(risk => ({
        level: risk._id,
        count: risk.count,
        revenue: risk.totalRevenue
      })) || [];

    return insights;
  }

  #calculatePortfolioHealth(aggregatedData) {
    if (!aggregatedData.overview) return { score: 0, status: 'unknown' };

    const totalRevenue = aggregatedData.overview.totalRevenue || 0;
    const avgHealthScore = aggregatedData.overview.avgHealthScore || 0;
    const activeClients = aggregatedData.overview.activeClients || 0;
    const totalClients = aggregatedData.overview.totalClients || 1;

    const healthScore = (
      avgHealthScore * 0.4 +
      (activeClients / totalClients) * 100 * 0.3 +
      Math.min(totalRevenue / 1000000, 100) * 0.3
    );

    let status;
    if (healthScore >= 80) status = 'excellent';
    else if (healthScore >= 70) status = 'good';
    else if (healthScore >= 60) status = 'average';
    else status = 'poor';

    return { score: Math.round(healthScore), status };
  }

  async #validateCustomReportConfig(config) {
    const errors = [];

    if (!config.name || config.name.length < 3) {
      errors.push('Report name must be at least 3 characters');
    }

    if (!config.metrics || !Array.isArray(config.metrics) || config.metrics.length === 0) {
      errors.push('At least one metric must be specified');
    }

    if (config.format && !this.#reportConfig.supportedFormats.includes(config.format)) {
      errors.push(`Invalid format. Supported formats: ${this.#reportConfig.supportedFormats.join(', ')}`);
    }

    if (errors.length > 0) {
      throw new ValidationError(errors.join('; '), 'CUSTOM_REPORT_VALIDATION');
    }

    return true;
  }

  async #logControllerAction(action, data) {
    try {
      logger.audit({
        category: 'CLIENT_ANALYTICS_CONTROLLER',
        action,
        timestamp: new Date(),
        data
      });
    } catch (error) {
      logger.error('Error logging controller action:', error);
    }
  }

  // Additional helper methods for different analytics operations
  async #getClientPerformanceMetrics(clientId, options) {
    return await this.#analyticsService.getClientAnalytics(clientId, {
      ...options,
      metrics: ['performance']
    });
  }

  async #getAggregatedPerformanceMetrics(tenantId, options) {
    return await this.#analyticsService.getAggregatedAnalytics({}, {
      ...options,
      tenantId,
      metrics: ['performance']
    });
  }

  async #getClientPredictions(clientId, options) {
    return await this.#analyticsService.getClientAnalytics(clientId, {
      predictions: true,
      predictionTypes: options.predictionTypes
    });
  }

  async #getPortfolioPredictions(tenantId, options) {
    return await this.#analyticsService.getAggregatedAnalytics({}, {
      tenantId,
      predictions: true,
      predictionTypes: options.predictionTypes
    });
  }

  async #getRealTimeAlerts(tenantId) {
    try {
      return await this.#analyticsService.getRealTimeAlerts(tenantId);
    } catch (error) {
      logger.error('Error fetching real-time alerts:', error);
      return [];
    }
  }

  async #generateDashboardRecommendations(dashboardData, user) {
    const recommendations = [];
    
    // Add logic to generate personalized recommendations based on dashboard data
    if (dashboardData.widgets?.alerts?.critical?.length > 0) {
      recommendations.push({
        type: 'urgent',
        title: 'Critical alerts require attention',
        description: 'Review and address critical client alerts immediately',
        action: 'view_alerts'
      });
    }

    return recommendations;
  }

  async #getBenchmarkData(filters, options) {
    try {
      return await this.#analyticsService.getBenchmarkData(filters, options);
    } catch (error) {
      logger.error('Error fetching benchmark data:', error);
      return null;
    }
  }

  async #generatePerformanceInsights(performanceData, options) {
    const insights = [];
    
    // Generate insights based on performance data
    if (performanceData.trends?.declining === true) {
      insights.push({
        type: 'warning',
        message: 'Performance metrics showing declining trend',
        recommendation: 'Review operational efficiency and resource allocation'
      });
    }

    return insights;
  }

  async #generateActionableRecommendations(predictions, options) {
    const recommendations = [];

    // Generate recommendations based on predictions
    if (predictions.churnRisk?.high?.length > 0) {
      recommendations.push({
        type: 'retention',
        priority: 'high',
        title: 'High churn risk clients identified',
        description: 'Implement retention strategies for at-risk clients',
        actions: ['schedule_check_ins', 'review_satisfaction', 'offer_incentives']
      });
    }

    return recommendations;
  }

  async #getHealthScoreAnalyticsData(options) {
    return await this.#analyticsService.getAggregatedAnalytics({}, {
      ...options,
      metrics: ['healthScore'],
      includeDistribution: true,
      includeTrends: true
    });
  }

  async #generateHealthImprovementRecommendations(healthAnalytics) {
    const recommendations = [];

    // Generate health improvement recommendations
    if (healthAnalytics.averageScore < 70) {
      recommendations.push({
        category: 'overall',
        priority: 'high',
        title: 'Portfolio health below target',
        recommendations: [
          'Focus on client engagement initiatives',
          'Review and improve service delivery',
          'Implement proactive account management'
        ]
      });
    }

    return recommendations;
  }

  async #getExportSummaryData(options) {
    return await this.#analyticsService.getExportData('summary', options);
  }

  async #getExportDetailedData(options) {
    return await this.#analyticsService.getExportData('detailed', options);
  }

  async #getExportMetricsData(options) {
    return await this.#analyticsService.getExportData('metrics', options);
  }

  async #getExportPredictionsData(options) {
    return await this.#analyticsService.getExportData('predictions', options);
  }

  async #getExportInsightsData(options) {
    return await this.#analyticsService.getExportData('insights', options);
  }

  async #compressData(buffer) {
    return new Promise((resolve, reject) => {
      zlib.gzip(buffer, (error, compressed) => {
        if (error) reject(error);
        else resolve(compressed);
      });
    });
  }

  async #createCustomAnalyticsReport(config) {
    return await this.#analyticsService.createCustomReport(config);
  }

  async #scheduleCustomReport(reportId, schedule) {
    return await this.#analyticsService.scheduleReport(reportId, schedule);
  }
}

// Export controller as singleton instance
module.exports = new ClientAnalyticsController();