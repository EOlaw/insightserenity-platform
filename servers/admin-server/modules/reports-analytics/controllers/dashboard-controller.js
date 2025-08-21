'use strict';

/**
 * @fileoverview Enterprise dashboard controller for comprehensive dashboard management API endpoints
 * @module servers/admin-server/modules/reports-analytics/controllers/dashboard-controller
 * @requires module:servers/admin-server/modules/reports-analytics/services/dashboard-service
 * @requires module:servers/admin-server/modules/reports-analytics/models/dashboard-model
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

const DashboardService = require('../services/dashboard-service');
const Dashboard = require('../models/dashboard-model');
const logger = require('../../../../../shared/lib/utils/logger');
const { AppError } = require('../../../../../shared/lib/utils/app-error');
const responseFormatter = require('../../../../../shared/lib/utils/response-formatter');
const asyncHandler = require('../../../../../shared/lib/utils/async-handler');
const CommonValidator = require('../../../../../shared/lib/utils/validators/common-validators');
const CacheService = require('../../../../../shared/lib/services/cache-service');
const AuditService = require('../../../../../shared/lib/services/audit-service');

/**
 * @class DashboardController
 * @description Enterprise dashboard controller for managing dashboard API endpoints
 */
class DashboardController {
  #dashboardService;
  #cacheService;
  #auditService;
  #initialized;
  #controllerName;
  #config;

  /**
   * @constructor
   * @description Initialize dashboard controller with dependencies
   */
  constructor() {
    this.#dashboardService = new DashboardService();
    this.#cacheService = new CacheService();
    this.#auditService = new AuditService();
    this.#initialized = false;
    this.#controllerName = 'DashboardController';
    this.#config = {
      cachePrefix: 'dashboard:controller:',
      cacheTTL: 1800,
      pagination: {
        defaultLimit: 20,
        maxLimit: 100,
        defaultSort: '-createdAt'
      },
      validation: {
        maxNameLength: 200,
        maxDescriptionLength: 1000,
        maxWidgetCount: 50,
        maxTagCount: 20
      },
      rateLimit: {
        create: { max: 10, window: 3600 },
        update: { max: 50, window: 3600 },
        delete: { max: 5, window: 3600 },
        export: { max: 20, window: 3600 }
      }
    };

    // Bind all methods to maintain context
    this.initialize = this.initialize.bind(this);
    this.handleDashboardRequest = this.handleDashboardRequest.bind(this);
    this.createDashboard = this.createDashboard.bind(this);
    this.getDashboard = this.getDashboard.bind(this);
    this.updateDashboard = this.updateDashboard.bind(this);
    this.deleteDashboard = this.deleteDashboard.bind(this);
    this.listDashboards = this.listDashboards.bind(this);
    this.searchDashboards = this.searchDashboards.bind(this);
    this.cloneDashboard = this.cloneDashboard.bind(this);
    this.publishDashboard = this.publishDashboard.bind(this);
    this.archiveDashboard = this.archiveDashboard.bind(this);
    this.shareDashboard = this.shareDashboard.bind(this);
    this.manageDashboardWidgets = this.manageDashboardWidgets.bind(this);
    this.manageDashboardData = this.manageDashboardData.bind(this);
    this.manageDashboardLayout = this.manageDashboardLayout.bind(this);
    this.analyzeDashboardPerformance = this.analyzeDashboardPerformance.bind(this);
    this.exportDashboard = this.exportDashboard.bind(this);
    this.importDashboard = this.importDashboard.bind(this);
  }

  /**
   * Initialize the dashboard controller
   * @async
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      if (this.#initialized) {
        logger.warn(`${this.#controllerName} already initialized`);
        return;
      }

      await this.#dashboardService.initialize();
      await this.#cacheService.initialize();
      await this.#auditService.initialize();
      
      this.#initialized = true;
      logger.info(`${this.#controllerName} initialized successfully`);
    } catch (error) {
      logger.error(`Failed to initialize ${this.#controllerName}:`, error);
      throw new AppError('Dashboard controller initialization failed', 500);
    }
  }

  /**
   * Handle dashboard request based on action type
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   * @returns {Promise<Object>} Response
   */
  handleDashboardRequest = asyncHandler(async (req, res, next) => {
    const { action } = req.params;
    const context = this.#buildContext(req);

    try {
      let result;

      switch (action) {
        // ==================== Dashboard CRUD Operations ====================
        case 'create':
          result = await this.#handleCreateDashboard(req.body, context);
          break;

        case 'retrieve':
          result = await this.#handleRetrieveDashboard(req.params.dashboardId, context);
          break;

        case 'update':
          result = await this.#handleUpdateDashboard(req.params.dashboardId, req.body, context);
          break;

        case 'delete':
          result = await this.#handleDeleteDashboard(req.params.dashboardId, context);
          break;

        case 'list':
          result = await this.#handleListDashboards(req.query, context);
          break;

        case 'search':
          result = await this.#handleSearchDashboards(req.query, context);
          break;

        // ==================== Dashboard Management Operations ====================
        case 'clone':
          result = await this.#handleCloneDashboard(req.params.dashboardId, req.body, context);
          break;

        case 'publish':
          result = await this.#handlePublishDashboard(req.params.dashboardId, req.body, context);
          break;

        case 'archive':
          result = await this.#handleArchiveDashboard(req.params.dashboardId, req.body, context);
          break;

        case 'restore':
          result = await this.#handleRestoreDashboard(req.params.dashboardId, context);
          break;

        case 'share':
          result = await this.#handleShareDashboard(req.params.dashboardId, req.body, context);
          break;

        case 'revoke-share':
          result = await this.#handleRevokeShare(req.params.dashboardId, req.body, context);
          break;

        // ==================== Widget Management Operations ====================
        case 'add-widget':
          result = await this.#handleAddWidget(req.params.dashboardId, req.body, context);
          break;

        case 'update-widget':
          result = await this.#handleUpdateWidget(req.params.dashboardId, req.params.widgetId, req.body, context);
          break;

        case 'remove-widget':
          result = await this.#handleRemoveWidget(req.params.dashboardId, req.params.widgetId, context);
          break;

        case 'reorder-widgets':
          result = await this.#handleReorderWidgets(req.params.dashboardId, req.body, context);
          break;

        case 'duplicate-widget':
          result = await this.#handleDuplicateWidget(req.params.dashboardId, req.params.widgetId, context);
          break;

        // ==================== Layout Operations ====================
        case 'update-layout':
          result = await this.#handleUpdateLayout(req.params.dashboardId, req.body, context);
          break;

        case 'apply-theme':
          result = await this.#handleApplyTheme(req.params.dashboardId, req.body, context);
          break;

        case 'update-branding':
          result = await this.#handleUpdateBranding(req.params.dashboardId, req.body, context);
          break;

        case 'optimize-mobile':
          result = await this.#handleOptimizeMobile(req.params.dashboardId, context);
          break;

        // ==================== Data Operations ====================
        case 'refresh-data':
          result = await this.#handleRefreshData(req.params.dashboardId, context);
          break;

        case 'configure-datasource':
          result = await this.#handleConfigureDataSource(req.params.dashboardId, req.body, context);
          break;

        case 'apply-filters':
          result = await this.#handleApplyFilters(req.params.dashboardId, req.body, context);
          break;

        case 'clear-filters':
          result = await this.#handleClearFilters(req.params.dashboardId, context);
          break;

        case 'save-filter-preset':
          result = await this.#handleSaveFilterPreset(req.params.dashboardId, req.body, context);
          break;

        // ==================== Performance Operations ====================
        case 'analyze-performance':
          result = await this.#handleAnalyzePerformance(req.params.dashboardId, context);
          break;

        case 'optimize':
          result = await this.#handleOptimizeDashboard(req.params.dashboardId, req.body, context);
          break;

        case 'enable-caching':
          result = await this.#handleEnableCaching(req.params.dashboardId, req.body, context);
          break;

        case 'clear-cache':
          result = await this.#handleClearCache(req.params.dashboardId, context);
          break;

        // ==================== Analytics Operations ====================
        case 'usage-analytics':
          result = await this.#handleUsageAnalytics(req.params.dashboardId, req.query, context);
          break;

        case 'interaction-metrics':
          result = await this.#handleInteractionMetrics(req.params.dashboardId, req.query, context);
          break;

        case 'generate-insights':
          result = await this.#handleGenerateInsights(req.params.dashboardId, context);
          break;

        case 'benchmark':
          result = await this.#handleBenchmark(req.params.dashboardId, req.query, context);
          break;

        // ==================== Export/Import Operations ====================
        case 'export':
          result = await this.#handleExportDashboard(req.params.dashboardId, req.query, context);
          break;

        case 'import':
          result = await this.#handleImportDashboard(req.body, context);
          break;

        case 'export-template':
          result = await this.#handleExportTemplate(req.params.dashboardId, context);
          break;

        case 'import-template':
          result = await this.#handleImportTemplate(req.body, context);
          break;

        // ==================== Collaboration Operations ====================
        case 'add-comment':
          result = await this.#handleAddComment(req.params.dashboardId, req.body, context);
          break;

        case 'add-annotation':
          result = await this.#handleAddAnnotation(req.params.dashboardId, req.body, context);
          break;

        case 'create-snapshot':
          result = await this.#handleCreateSnapshot(req.params.dashboardId, req.body, context);
          break;

        case 'restore-snapshot':
          result = await this.#handleRestoreSnapshot(req.params.dashboardId, req.params.snapshotId, context);
          break;

        // ==================== Default Case ====================
        default:
          throw new AppError(`Unknown dashboard action: ${action}`, 400);
      }

      return responseFormatter.success(res, result, `Dashboard ${action} successful`);

    } catch (error) {
      logger.error(`Dashboard request failed: ${action}`, error);
      return responseFormatter.error(res, error);
    }
  });

  /**
   * Create a new dashboard
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<Object>} Response
   */
  createDashboard = asyncHandler(async (req, res) => {
    const context = this.#buildContext(req);
    
    // Validate request body
    const validation = await this.#validateDashboardData(req.body);
    if (!validation.valid) {
      throw new AppError(validation.errors.join(', '), 400);
    }

    const result = await this.#dashboardService.processDashboardOperation(
      'CREATE_DASHBOARD',
      req.body,
      context
    );

    // Invalidate cache
    await this.#invalidateListCache(context.organizationId);

    return responseFormatter.created(res, result, 'Dashboard created successfully');
  });

  /**
   * Get dashboard by ID
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<Object>} Response
   */
  getDashboard = asyncHandler(async (req, res) => {
    const { dashboardId } = req.params;
    const context = this.#buildContext(req);

    // Check cache
    const cacheKey = `${this.#config.cachePrefix}${dashboardId}`;
    const cached = await this.#cacheService.get(cacheKey);
    
    if (cached) {
      return responseFormatter.success(res, cached, 'Dashboard retrieved from cache');
    }

    const dashboard = await Dashboard.findOne({ 
      dashboardId,
      'dashboardReference.organizationId': context.organizationId
    });

    if (!dashboard) {
      throw new AppError('Dashboard not found', 404);
    }

    // Check permissions
    if (!this.#checkDashboardAccess(dashboard, context)) {
      throw new AppError('Access denied', 403);
    }

    // Cache the result
    await this.#cacheService.set(cacheKey, dashboard, this.#config.cacheTTL);

    // Track view
    await this.#trackDashboardView(dashboardId, context);

    return responseFormatter.success(res, dashboard, 'Dashboard retrieved successfully');
  });

  /**
   * Update dashboard
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<Object>} Response
   */
  updateDashboard = asyncHandler(async (req, res) => {
    const { dashboardId } = req.params;
    const context = this.#buildContext(req);

    const result = await this.#dashboardService.processDashboardOperation(
      'UPDATE_DASHBOARD',
      { dashboardId, ...req.body },
      context
    );

    // Invalidate cache
    await this.#invalidateDashboardCache(dashboardId);

    return responseFormatter.success(res, result, 'Dashboard updated successfully');
  });

  /**
   * Delete dashboard
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<Object>} Response
   */
  deleteDashboard = asyncHandler(async (req, res) => {
    const { dashboardId } = req.params;
    const context = this.#buildContext(req);

    const result = await this.#dashboardService.processDashboardOperation(
      'DELETE_DASHBOARD',
      { dashboardId },
      context
    );

    // Invalidate cache
    await this.#invalidateDashboardCache(dashboardId);
    await this.#invalidateListCache(context.organizationId);

    return responseFormatter.success(res, result, 'Dashboard deleted successfully');
  });

  /**
   * List dashboards with pagination and filtering
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<Object>} Response
   */
  listDashboards = asyncHandler(async (req, res) => {
    const context = this.#buildContext(req);
    const { page = 1, limit = this.#config.pagination.defaultLimit, sort, filter } = req.query;

    // Validate pagination
    const validatedLimit = Math.min(limit, this.#config.pagination.maxLimit);

    const query = {
      'dashboardReference.organizationId': context.organizationId
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

    const dashboards = await Dashboard.paginate(query, options);

    return responseFormatter.success(res, dashboards, 'Dashboards retrieved successfully');
  });

  /**
   * Search dashboards
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<Object>} Response
   */
  searchDashboards = asyncHandler(async (req, res) => {
    const context = this.#buildContext(req);
    const { q, type, category, status, limit = 20 } = req.query;

    if (!q) {
      throw new AppError('Search query is required', 400);
    }

    const searchQuery = {
      'dashboardReference.organizationId': context.organizationId,
      $text: { $search: q }
    };

    if (type) searchQuery['configuration.type'] = type;
    if (category) searchQuery['configuration.category.primary'] = category;
    if (status) searchQuery['metadata.status'] = status;

    const dashboards = await Dashboard.find(searchQuery)
      .limit(parseInt(limit))
      .sort({ score: { $meta: 'textScore' } });

    return responseFormatter.success(res, dashboards, 'Search completed successfully');
  });

  /**
   * Clone dashboard
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<Object>} Response
   */
  cloneDashboard = asyncHandler(async (req, res) => {
    const { dashboardId } = req.params;
    const context = this.#buildContext(req);

    const result = await this.#dashboardService.processDashboardOperation(
      'CLONE_DASHBOARD',
      { dashboardId, ...req.body },
      context
    );

    return responseFormatter.created(res, result, 'Dashboard cloned successfully');
  });

  /**
   * Publish dashboard
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<Object>} Response
   */
  publishDashboard = asyncHandler(async (req, res) => {
    const { dashboardId } = req.params;
    const context = this.#buildContext(req);

    const result = await this.#dashboardService.processDashboardOperation(
      'PUBLISH_DASHBOARD',
      { dashboardId, ...req.body },
      context
    );

    // Invalidate cache
    await this.#invalidateDashboardCache(dashboardId);

    return responseFormatter.success(res, result, 'Dashboard published successfully');
  });

  /**
   * Archive dashboard
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<Object>} Response
   */
  archiveDashboard = asyncHandler(async (req, res) => {
    const { dashboardId } = req.params;
    const context = this.#buildContext(req);

    const result = await this.#dashboardService.processDashboardOperation(
      'ARCHIVE_DASHBOARD',
      { dashboardId, ...req.body },
      context
    );

    // Invalidate cache
    await this.#invalidateDashboardCache(dashboardId);

    return responseFormatter.success(res, result, 'Dashboard archived successfully');
  });

  /**
   * Share dashboard
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<Object>} Response
   */
  shareDashboard = asyncHandler(async (req, res) => {
    const { dashboardId } = req.params;
    const context = this.#buildContext(req);

    const result = await this.#dashboardService.processDashboardOperation(
      'SHARE_DASHBOARD',
      { dashboardId, ...req.body },
      context
    );

    return responseFormatter.success(res, result, 'Dashboard shared successfully');
  });

  /**
   * Manage dashboard widgets
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<Object>} Response
   */
  manageDashboardWidgets = asyncHandler(async (req, res) => {
    const { dashboardId } = req.params;
    const { operation } = req.query;
    const context = this.#buildContext(req);

    let result;

    switch (operation) {
      case 'add':
        result = await this.#dashboardService.processDashboardOperation(
          'ADD_WIDGET',
          { dashboardId, ...req.body },
          context
        );
        break;

      case 'update':
        result = await this.#dashboardService.processDashboardOperation(
          'UPDATE_WIDGET',
          { dashboardId, widgetId: req.body.widgetId, ...req.body },
          context
        );
        break;

      case 'remove':
        result = await this.#dashboardService.processDashboardOperation(
          'REMOVE_WIDGET',
          { dashboardId, widgetId: req.body.widgetId },
          context
        );
        break;

      case 'reorder':
        result = await this.#dashboardService.processDashboardOperation(
          'REORDER_WIDGETS',
          { dashboardId, widgets: req.body.widgets },
          context
        );
        break;

      default:
        throw new AppError(`Unknown widget operation: ${operation}`, 400);
    }

    // Invalidate cache
    await this.#invalidateDashboardCache(dashboardId);

    return responseFormatter.success(res, result, `Widget ${operation} successful`);
  });

  /**
   * Manage dashboard data
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<Object>} Response
   */
  manageDashboardData = asyncHandler(async (req, res) => {
    const { dashboardId } = req.params;
    const { operation } = req.query;
    const context = this.#buildContext(req);

    let result;

    switch (operation) {
      case 'refresh':
        result = await this.#dashboardService.processDashboardOperation(
          'REFRESH_DATA',
          { dashboardId },
          context
        );
        break;

      case 'configure-source':
        result = await this.#dashboardService.processDashboardOperation(
          'CONFIGURE_DATA_SOURCE',
          { dashboardId, ...req.body },
          context
        );
        break;

      case 'apply-filters':
        result = await this.#dashboardService.processDashboardOperation(
          'APPLY_FILTERS',
          { dashboardId, filters: req.body.filters },
          context
        );
        break;

      case 'clear-filters':
        result = await this.#dashboardService.processDashboardOperation(
          'CLEAR_FILTERS',
          { dashboardId },
          context
        );
        break;

      default:
        throw new AppError(`Unknown data operation: ${operation}`, 400);
    }

    return responseFormatter.success(res, result, `Data ${operation} successful`);
  });

  /**
   * Manage dashboard layout
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<Object>} Response
   */
  manageDashboardLayout = asyncHandler(async (req, res) => {
    const { dashboardId } = req.params;
    const { operation } = req.query;
    const context = this.#buildContext(req);

    let result;

    switch (operation) {
      case 'update':
        result = await this.#dashboardService.processDashboardOperation(
          'UPDATE_LAYOUT',
          { dashboardId, layout: req.body.layout },
          context
        );
        break;

      case 'apply-theme':
        result = await this.#dashboardService.processDashboardOperation(
          'APPLY_THEME',
          { dashboardId, theme: req.body.theme },
          context
        );
        break;

      case 'customize-theme':
        result = await this.#dashboardService.processDashboardOperation(
          'CUSTOMIZE_THEME',
          { dashboardId, customization: req.body },
          context
        );
        break;

      case 'optimize-mobile':
        result = await this.#dashboardService.processDashboardOperation(
          'OPTIMIZE_MOBILE_LAYOUT',
          { dashboardId },
          context
        );
        break;

      default:
        throw new AppError(`Unknown layout operation: ${operation}`, 400);
    }

    // Invalidate cache
    await this.#invalidateDashboardCache(dashboardId);

    return responseFormatter.success(res, result, `Layout ${operation} successful`);
  });

  /**
   * Analyze dashboard performance
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<Object>} Response
   */
  analyzeDashboardPerformance = asyncHandler(async (req, res) => {
    const { dashboardId } = req.params;
    const context = this.#buildContext(req);

    const analysis = await this.#dashboardService.analyzeDashboardMetrics(
      'LOAD_TIME_ANALYSIS',
      { dashboardId, ...req.query },
      context
    );

    return responseFormatter.success(res, analysis, 'Performance analysis completed');
  });

  /**
   * Export dashboard
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<Object>} Response
   */
  exportDashboard = asyncHandler(async (req, res) => {
    const { dashboardId } = req.params;
    const { format = 'JSON' } = req.query;
    const context = this.#buildContext(req);

    const result = await this.#dashboardService.processDashboardOperation(
      'EXPORT_DASHBOARD',
      { dashboardId, format },
      context
    );

    // Track export
    await this.#trackDashboardExport(dashboardId, format, context);

    return responseFormatter.success(res, result, 'Dashboard exported successfully');
  });

  /**
   * Import dashboard
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<Object>} Response
   */
  importDashboard = asyncHandler(async (req, res) => {
    const context = this.#buildContext(req);

    // Validate import data
    const validation = await this.#validateImportData(req.body);
    if (!validation.valid) {
      throw new AppError(validation.errors.join(', '), 400);
    }

    const result = await this.#dashboardService.processDashboardOperation(
      'IMPORT_DASHBOARD',
      req.body,
      context
    );

    return responseFormatter.created(res, result, 'Dashboard imported successfully');
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

  async #validateDashboardData(data) {
    const errors = [];

    if (!data.name || data.name.length > this.#config.validation.maxNameLength) {
      errors.push(`Name must be between 1 and ${this.#config.validation.maxNameLength} characters`);
    }

    if (data.description && data.description.length > this.#config.validation.maxDescriptionLength) {
      errors.push(`Description must not exceed ${this.#config.validation.maxDescriptionLength} characters`);
    }

    if (data.widgets && data.widgets.length > this.#config.validation.maxWidgetCount) {
      errors.push(`Cannot exceed ${this.#config.validation.maxWidgetCount} widgets`);
    }

    if (data.tags && data.tags.length > this.#config.validation.maxTagCount) {
      errors.push(`Cannot exceed ${this.#config.validation.maxTagCount} tags`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  async #validateImportData(data) {
    const errors = [];

    if (!data.dashboard) {
      errors.push('Dashboard data is required');
    }

    if (!data.dashboard?.configuration?.name) {
      errors.push('Dashboard name is required');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  #checkDashboardAccess(dashboard, context) {
    // Check if user has access to the dashboard
    if (dashboard.dashboardReference.organizationId.toString() !== context.organizationId) {
      return false;
    }

    if (dashboard.configuration.visibility.scope === 'PRIVATE' && 
        dashboard.metadata.createdBy.toString() !== context.user.id) {
      return false;
    }

    return true;
  }

  #buildFilterQuery(filter) {
    const query = {};

    if (filter.type) query['configuration.type'] = filter.type;
    if (filter.category) query['configuration.category.primary'] = filter.category;
    if (filter.status) query['metadata.status'] = filter.status;
    if (filter.visibility) query['configuration.visibility.scope'] = filter.visibility;
    if (filter.createdBy) query['metadata.createdBy'] = filter.createdBy;

    if (filter.dateRange) {
      query.createdAt = {
        $gte: new Date(filter.dateRange.start),
        $lte: new Date(filter.dateRange.end)
      };
    }

    return query;
  }

  async #invalidateDashboardCache(dashboardId) {
    const cacheKey = `${this.#config.cachePrefix}${dashboardId}`;
    await this.#cacheService.del(cacheKey);
  }

  async #invalidateListCache(organizationId) {
    const pattern = `${this.#config.cachePrefix}list:${organizationId}:*`;
    await this.#cacheService.delPattern(pattern);
  }

  async #trackDashboardView(dashboardId, context) {
    await this.#auditService.log({
      action: 'DASHBOARD_VIEW',
      resource: 'dashboard',
      resourceId: dashboardId,
      userId: context.user.id,
      timestamp: new Date()
    });
  }

  async #trackDashboardExport(dashboardId, format, context) {
    await this.#auditService.log({
      action: 'DASHBOARD_EXPORT',
      resource: 'dashboard',
      resourceId: dashboardId,
      userId: context.user.id,
      metadata: { format },
      timestamp: new Date()
    });
  }

  // Handler method implementations
  async #handleCreateDashboard(data, context) {
    return await this.#dashboardService.processDashboardOperation('CREATE_DASHBOARD', data, context);
  }

  async #handleRetrieveDashboard(dashboardId, context) {
    const dashboard = await Dashboard.findOne({ dashboardId });
    if (!dashboard) throw new AppError('Dashboard not found', 404);
    return dashboard;
  }

  async #handleUpdateDashboard(dashboardId, data, context) {
    return await this.#dashboardService.processDashboardOperation('UPDATE_DASHBOARD', { dashboardId, ...data }, context);
  }

  async #handleDeleteDashboard(dashboardId, context) {
    return await this.#dashboardService.processDashboardOperation('DELETE_DASHBOARD', { dashboardId }, context);
  }

  async #handleListDashboards(query, context) {
    return await Dashboard.find({ 'dashboardReference.organizationId': context.organizationId });
  }

  async #handleSearchDashboards(query, context) {
    return await Dashboard.find({ $text: { $search: query.q } });
  }

  async #handleCloneDashboard(dashboardId, data, context) {
    return await this.#dashboardService.processDashboardOperation('CLONE_DASHBOARD', { dashboardId, ...data }, context);
  }

  async #handlePublishDashboard(dashboardId, data, context) {
    return await this.#dashboardService.processDashboardOperation('PUBLISH_DASHBOARD', { dashboardId, ...data }, context);
  }

  async #handleArchiveDashboard(dashboardId, data, context) {
    return await this.#dashboardService.processDashboardOperation('ARCHIVE_DASHBOARD', { dashboardId, ...data }, context);
  }

  async #handleRestoreDashboard(dashboardId, context) {
    return await this.#dashboardService.processDashboardOperation('RESTORE_DASHBOARD', { dashboardId }, context);
  }

  async #handleShareDashboard(dashboardId, data, context) {
    return await this.#dashboardService.processDashboardOperation('SHARE_DASHBOARD', { dashboardId, ...data }, context);
  }

  async #handleRevokeShare(dashboardId, data, context) {
    return await this.#dashboardService.processDashboardOperation('REVOKE_SHARE', { dashboardId, ...data }, context);
  }

  async #handleAddWidget(dashboardId, data, context) {
    return await this.#dashboardService.processDashboardOperation('ADD_WIDGET', { dashboardId, ...data }, context);
  }

  async #handleUpdateWidget(dashboardId, widgetId, data, context) {
    return await this.#dashboardService.processDashboardOperation('UPDATE_WIDGET', { dashboardId, widgetId, ...data }, context);
  }

  async #handleRemoveWidget(dashboardId, widgetId, context) {
    return await this.#dashboardService.processDashboardOperation('REMOVE_WIDGET', { dashboardId, widgetId }, context);
  }

  async #handleReorderWidgets(dashboardId, data, context) {
    return await this.#dashboardService.processDashboardOperation('REORDER_WIDGETS', { dashboardId, ...data }, context);
  }

  async #handleDuplicateWidget(dashboardId, widgetId, context) {
    return await this.#dashboardService.processDashboardOperation('DUPLICATE_WIDGET', { dashboardId, widgetId }, context);
  }

  async #handleUpdateLayout(dashboardId, data, context) {
    return await this.#dashboardService.processDashboardOperation('UPDATE_LAYOUT', { dashboardId, ...data }, context);
  }

  async #handleApplyTheme(dashboardId, data, context) {
    return await this.#dashboardService.processDashboardOperation('APPLY_THEME', { dashboardId, ...data }, context);
  }

  async #handleUpdateBranding(dashboardId, data, context) {
    return await this.#dashboardService.processDashboardOperation('UPDATE_BRANDING', { dashboardId, ...data }, context);
  }

  async #handleOptimizeMobile(dashboardId, context) {
    return await this.#dashboardService.processDashboardOperation('OPTIMIZE_MOBILE_LAYOUT', { dashboardId }, context);
  }

  async #handleRefreshData(dashboardId, context) {
    return await this.#dashboardService.processDashboardOperation('REFRESH_DATA', { dashboardId }, context);
  }

  async #handleConfigureDataSource(dashboardId, data, context) {
    return await this.#dashboardService.processDashboardOperation('CONFIGURE_DATA_SOURCE', { dashboardId, ...data }, context);
  }

  async #handleApplyFilters(dashboardId, data, context) {
    return await this.#dashboardService.processDashboardOperation('APPLY_FILTERS', { dashboardId, ...data }, context);
  }

  async #handleClearFilters(dashboardId, context) {
    return await this.#dashboardService.processDashboardOperation('CLEAR_FILTERS', { dashboardId }, context);
  }

  async #handleSaveFilterPreset(dashboardId, data, context) {
    return await this.#dashboardService.processDashboardOperation('SAVE_FILTER_PRESET', { dashboardId, ...data }, context);
  }

  async #handleAnalyzePerformance(dashboardId, context) {
    return await this.#dashboardService.processDashboardOperation('ANALYZE_PERFORMANCE', { dashboardId }, context);
  }

  async #handleOptimizeDashboard(dashboardId, data, context) {
    return await this.#dashboardService.processDashboardOperation('OPTIMIZE_DASHBOARD', { dashboardId, ...data }, context);
  }

  async #handleEnableCaching(dashboardId, data, context) {
    return await this.#dashboardService.processDashboardOperation('ENABLE_CACHING', { dashboardId, ...data }, context);
  }

  async #handleClearCache(dashboardId, context) {
    return await this.#dashboardService.processDashboardOperation('CLEAR_CACHE', { dashboardId }, context);
  }

  async #handleUsageAnalytics(dashboardId, query, context) {
    return await this.#dashboardService.analyzeDashboardMetrics('USER_ENGAGEMENT', { dashboardId, ...query }, context);
  }

  async #handleInteractionMetrics(dashboardId, query, context) {
    return await this.#dashboardService.analyzeDashboardMetrics('INTERACTION_PATTERNS', { dashboardId, ...query }, context);
  }

  async #handleGenerateInsights(dashboardId, context) {
    return await this.#dashboardService.processDashboardOperation('GENERATE_INSIGHTS', { dashboardId }, context);
  }

  async #handleBenchmark(dashboardId, query, context) {
    return await this.#dashboardService.processDashboardOperation('BENCHMARK_PERFORMANCE', { dashboardId, ...query }, context);
  }

  async #handleExportDashboard(dashboardId, query, context) {
    return await this.#dashboardService.processDashboardOperation('EXPORT_DASHBOARD', { dashboardId, ...query }, context);
  }

  async #handleImportDashboard(data, context) {
    return await this.#dashboardService.processDashboardOperation('IMPORT_DASHBOARD', data, context);
  }

  async #handleExportTemplate(dashboardId, context) {
    return await this.#dashboardService.processDashboardOperation('EXPORT_TEMPLATE', { dashboardId }, context);
  }

  async #handleImportTemplate(data, context) {
    return await this.#dashboardService.processDashboardOperation('IMPORT_TEMPLATE', data, context);
  }

  async #handleAddComment(dashboardId, data, context) {
    return await this.#dashboardService.processDashboardOperation('ADD_COMMENT', { dashboardId, ...data }, context);
  }

  async #handleAddAnnotation(dashboardId, data, context) {
    return await this.#dashboardService.processDashboardOperation('ADD_ANNOTATION', { dashboardId, ...data }, context);
  }

  async #handleCreateSnapshot(dashboardId, data, context) {
    return await this.#dashboardService.processDashboardOperation('CREATE_SNAPSHOT', { dashboardId, ...data }, context);
  }

  async #handleRestoreSnapshot(dashboardId, snapshotId, context) {
    return await this.#dashboardService.processDashboardOperation('RESTORE_SNAPSHOT', { dashboardId, snapshotId }, context);
  }
}

module.exports = DashboardController;