'use strict';

/**
 * @fileoverview Enterprise escalation controller for comprehensive escalation management operations
 * @module servers/admin-server/modules/support-administration/controllers/escalation-controller
 * @requires module:servers/admin-server/modules/support-administration/services/escalation-service
 * @requires module:servers/admin-server/modules/support-administration/models/escalation-rule-model
 * @requires module:servers/admin-server/modules/support-administration/models/support-ticket-model
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
 * @requires module:shared/lib/services/analytics-service
 */

const EscalationService = require('../services/escalation-service');
const EscalationRule = require('../models/escalation-rule-model');
const SupportTicket = require('../models/support-ticket-model');
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
const AnalyticsService = require('../../../../../shared/lib/services/analytics-service');

/**
 * @class EscalationController
 * @description Comprehensive escalation controller for enterprise escalation management operations
 */
class EscalationController {
  #escalationService;
  #cacheService;
  #auditService;
  #notificationService;
  #analyticsService;
  #responseFormatter;
  #initialized;
  #controllerName;
  #config;
  #escalationMatrix;
  #escalationQueue;
  #slaMetrics;

  /**
   * @constructor
   * @description Initialize escalation controller with dependencies
   */
  constructor() {
    this.#escalationService = new EscalationService();
    this.#cacheService = new CacheService();
    this.#auditService = new AuditService();
    this.#notificationService = new NotificationService();
    this.#analyticsService = new AnalyticsService();
    this.#responseFormatter = new ResponseFormatter();
    this.#initialized = false;
    this.#controllerName = 'EscalationController';
    this.#escalationMatrix = new Map();
    this.#escalationQueue = [];
    this.#slaMetrics = new Map();
    
    this.#config = {
      cachePrefix: 'escalation_ctrl:',
      cacheTTL: 1800, // 30 minutes
      defaultPageSize: 25,
      maxPageSize: 100,
      maxBulkOperations: 200,
      rateLimits: {
        create: { windowMs: 300000, max: 15 },
        update: { windowMs: 300000, max: 30 },
        escalate: { windowMs: 60000, max: 50 },
        analyze: { windowMs: 300000, max: 10 },
        bulk: { windowMs: 600000, max: 3 }
      },
      validation: {
        maxRuleNameLength: 150,
        maxDescriptionLength: 1000,
        maxConditions: 20,
        maxActions: 15,
        maxEscalationLevels: 10,
        minTimeThreshold: 300, // 5 minutes
        maxTimeThreshold: 604800000, // 7 days
        requiredFields: ['name', 'conditions', 'actions', 'priority'],
        allowedPriorities: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'URGENT'],
        allowedStatuses: ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'TESTING'],
        allowedTriggerTypes: ['TIME_BASED', 'CONDITION_BASED', 'MANUAL', 'AUTOMATIC'],
        allowedActionTypes: ['REASSIGN', 'NOTIFY', 'ESCALATE', 'CREATE_TASK', 'UPDATE_PRIORITY', 'SEND_EMAIL'],
        allowedEscalationTypes: ['HIERARCHICAL', 'SKILL_BASED', 'WORKLOAD_BASED', 'ROUND_ROBIN']
      },
      features: {
        autoEscalation: true,
        slaMonitoring: true,
        escalationAnalytics: true,
        performanceTracking: true,
        realTimeAlerts: true,
        escalationHistory: true,
        ruleValidation: true,
        conflictDetection: true,
        loadBalancing: true,
        priorityOverride: true
      },
      escalation: {
        enableAutoEscalation: true,
        escalationIntervals: [300000, 900000, 1800000, 3600000], // 5min, 15min, 30min, 1hr
        maxEscalationLevels: 5,
        requireEscalationApproval: false,
        allowManualOverride: true,
        escalationCooldown: 600000, // 10 minutes
        slaBreachThreshold: 0.8, // 80% of SLA time
        criticalEscalationTime: 900000, // 15 minutes
        urgentEscalationTime: 1800000, // 30 minutes
        normalEscalationTime: 7200000 // 2 hours
      },
      sla: {
        trackSlaViolations: true,
        slaGracePeriod: 300000, // 5 minutes
        slaWarningThreshold: 0.75, // 75% of SLA time
        autoSlaExtension: false,
        slaReportingInterval: 3600000, // 1 hour
        slaMetricsRetention: 2592000000, // 30 days
        prioritySlaMultipliers: {
          'CRITICAL': 0.25,
          'URGENT': 0.5,
          'HIGH': 0.75,
          'MEDIUM': 1.0,
          'LOW': 1.5
        }
      },
      notifications: {
        notifyOnEscalation: true,
        notifyOnSlaRisk: true,
        notifyOnSlaViolation: true,
        notifyOnRuleConflict: true,
        escalationNotificationDelay: 60000, // 1 minute
        batchNotifications: true,
        maxNotificationFrequency: 300000 // 5 minutes
      },
      security: {
        requireEscalationAccess: true,
        auditAllOperations: true,
        validatePermissions: true,
        logSecurityEvents: true,
        restrictCriticalActions: true,
        requireManagerApproval: true,
        encryptSensitiveData: true
      },
      analytics: {
        trackEscalationPatterns: true,
        trackPerformanceMetrics: true,
        generateInsights: true,
        realTimeAnalytics: true,
        historicalAnalysis: true,
        predictiveAnalytics: true,
        benchmarkTracking: true
      }
    };
  }

  /**
   * Initialize the escalation controller
   * @async
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      if (this.#initialized) {
        logger.warn(`${this.#controllerName} already initialized`);
        return;
      }

      await this.#escalationService.initialize();
      await this.#cacheService.initialize();
      await this.#auditService.initialize();
      await this.#notificationService.initialize();
      await this.#analyticsService.initialize();
      
      await this.#initializeEscalationMatrix();
      await this.#initializeEscalationQueue();
      await this.#initializeSlaMetrics();
      await this.#setupPeriodicTasks();
      
      this.#initialized = true;
      logger.info(`${this.#controllerName} initialized successfully`);
    } catch (error) {
      logger.error(`Failed to initialize ${this.#controllerName}:`, error);
      throw new AppError('Escalation controller initialization failed', 500);
    }
  }

  /**
   * Handle escalation rule creation
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   */
  createEscalationRule = asyncHandler(async (req, res, next) => {
    try {
      const ruleData = req.body;
      const context = this.#buildRequestContext(req);

      // Validate escalation rule creation data
      await this.#validateEscalationRuleCreation(ruleData, context);

      // Apply rate limiting
      await this.#checkRateLimit('create', context);

      // Check for rule conflicts
      await this.#checkRuleConflicts(ruleData, context);

      // Create escalation rule
      const result = await this.#escalationService.processEscalationOperation(
        'CREATE_RULE',
        ruleData,
        context
      );

      // Update escalation matrix
      await this.#updateEscalationMatrix(result.rule);

      const response = this.#responseFormatter.success(result, 'Escalation rule created successfully', {
        ruleId: result.rule?.ruleId,
        status: result.rule?.status,
        priority: result.rule?.priority,
        timestamp: new Date().toISOString(),
        processingTime: Date.now() - context.startTime
      });

      res.status(201).json(response);

    } catch (error) {
      logger.error('Failed to create escalation rule:', error);
      await this.#handleEscalationError(error, req, res, 'CREATE_RULE');
    }
  });

  /**
   * Handle escalation rule updates
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   */
  updateEscalationRule = asyncHandler(async (req, res, next) => {
    try {
      const { ruleId } = req.params;
      const updateData = { ...req.body, ruleId };
      const context = this.#buildRequestContext(req);

      // Validate rule access
      await this.#validateRuleAccess(ruleId, context, 'UPDATE');

      // Validate update data
      await this.#validateEscalationRuleUpdate(updateData, context);

      // Check for conflicts with updated rule
      await this.#checkRuleConflicts(updateData, context, ruleId);

      // Update escalation rule
      const result = await this.#escalationService.processEscalationOperation(
        'UPDATE_RULE',
        updateData,
        context
      );

      // Update escalation matrix
      await this.#updateEscalationMatrix(result.rule);

      const response = this.#responseFormatter.success(result, 'Escalation rule updated successfully', {
        ruleId,
        version: result.rule?.version,
        lastModified: result.rule?.lastModified,
        timestamp: new Date().toISOString(),
        processingTime: Date.now() - context.startTime
      });

      res.status(200).json(response);

    } catch (error) {
      logger.error(`Failed to update escalation rule ${req.params.ruleId}:`, error);
      await this.#handleEscalationError(error, req, res, 'UPDATE_RULE');
    }
  });

  /**
   * Handle escalation rule management operations
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   */
  manageEscalationRule = asyncHandler(async (req, res, next) => {
    try {
      const { ruleId } = req.params;
      const { operation } = req.params;
      const operationData = { ...req.body, ruleId };
      const context = this.#buildRequestContext(req);

      // Validate rule access
      await this.#validateRuleAccess(ruleId, context, 'MANAGE');

      // Validate operation
      await this.#validateRuleOperation(operation, operationData, context);

      let result;

      switch (operation) {
        case 'activate':
          result = await this.#escalationService.processEscalationOperation(
            'ACTIVATE_RULE',
            operationData,
            context
          );
          break;

        case 'deactivate':
          result = await this.#escalationService.processEscalationOperation(
            'DEACTIVATE_RULE',
            operationData,
            context
          );
          break;

        case 'suspend':
          result = await this.#escalationService.processEscalationOperation(
            'SUSPEND_RULE',
            operationData,
            context
          );
          break;

        case 'test':
          result = await this.#escalationService.processEscalationOperation(
            'TEST_RULE',
            operationData,
            context
          );
          break;

        case 'clone':
          result = await this.#escalationService.processEscalationOperation(
            'CLONE_RULE',
            operationData,
            context
          );
          break;

        case 'delete':
          result = await this.#escalationService.processEscalationOperation(
            'DELETE_RULE',
            operationData,
            context
          );
          break;

        case 'validate':
          result = await this.#escalationService.processEscalationOperation(
            'VALIDATE_RULE',
            operationData,
            context
          );
          break;

        case 'export':
          result = await this.#escalationService.processEscalationOperation(
            'EXPORT_RULE',
            operationData,
            context
          );
          break;

        default:
          throw new AppError(`Unknown rule operation: ${operation}`, 400);
      }

      // Update escalation matrix if needed
      if (['activate', 'deactivate', 'suspend', 'delete'].includes(operation)) {
        await this.#refreshEscalationMatrix();
      }

      const response = this.#responseFormatter.success(result, `Rule ${operation} completed successfully`, {
        ruleId,
        operation,
        status: result.rule?.status,
        timestamp: new Date().toISOString()
      });

      res.status(200).json(response);

    } catch (error) {
      logger.error(`Failed to execute rule operation ${req.params.operation} for rule ${req.params.ruleId}:`, error);
      await this.#handleEscalationError(error, req, res, 'MANAGE_RULE');
    }
  });

  /**
   * Handle ticket escalation operations
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   */
  escalateTicket = asyncHandler(async (req, res, next) => {
    try {
      const { ticketId } = req.params;
      const { operation } = req.params;
      const escalationData = { ...req.body, ticketId };
      const context = this.#buildRequestContext(req);

      // Validate ticket access
      await this.#validateTicketAccess(ticketId, context, 'ESCALATE');

      // Apply escalation rate limiting
      await this.#checkRateLimit('escalate', context);

      // Validate escalation operation
      await this.#validateEscalationOperation(operation, escalationData, context);

      let result;

      switch (operation) {
        case 'auto-escalate':
          result = await this.#escalationService.processEscalationOperation(
            'AUTO_ESCALATE_TICKET',
            escalationData,
            context
          );
          break;

        case 'manual-escalate':
          result = await this.#escalationService.processEscalationOperation(
            'MANUAL_ESCALATE_TICKET',
            escalationData,
            context
          );
          break;

        case 'de-escalate':
          result = await this.#escalationService.processEscalationOperation(
            'DE_ESCALATE_TICKET',
            escalationData,
            context
          );
          break;

        case 'force-escalate':
          result = await this.#escalationService.processEscalationOperation(
            'FORCE_ESCALATE_TICKET',
            escalationData,
            context
          );
          break;

        case 'reassign':
          result = await this.#escalationService.processEscalationOperation(
            'REASSIGN_ESCALATED_TICKET',
            escalationData,
            context
          );
          break;

        case 'override-escalation':
          result = await this.#escalationService.processEscalationOperation(
            'OVERRIDE_ESCALATION',
            escalationData,
            context
          );
          break;

        case 'escalation-history':
          result = await this.#escalationService.processEscalationOperation(
            'GET_ESCALATION_HISTORY',
            escalationData,
            context
          );
          break;

        case 'check-escalation-eligibility':
          result = await this.#escalationService.processEscalationOperation(
            'CHECK_ESCALATION_ELIGIBILITY',
            escalationData,
            context
          );
          break;

        default:
          throw new AppError(`Unknown escalation operation: ${operation}`, 400);
      }

      // Update escalation queue if needed
      if (['auto-escalate', 'manual-escalate', 'de-escalate'].includes(operation)) {
        await this.#updateEscalationQueue(ticketId, operation, result);
      }

      const response = this.#responseFormatter.success(result, `Ticket ${operation} completed successfully`, {
        ticketId,
        operation,
        escalationLevel: result.ticket?.escalationLevel,
        assignedTo: result.ticket?.assignedTo,
        timestamp: new Date().toISOString()
      });

      res.status(200).json(response);

    } catch (error) {
      logger.error(`Failed to execute escalation operation ${req.params.operation} for ticket ${req.params.ticketId}:`, error);
      await this.#handleEscalationError(error, req, res, 'ESCALATE_TICKET');
    }
  });

  /**
   * Handle SLA monitoring and management
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   */
  manageSla = asyncHandler(async (req, res, next) => {
    try {
      const { operation } = req.params;
      const slaData = { ...req.query, ...req.body };
      const context = this.#buildRequestContext(req);

      // Validate SLA operation
      await this.#validateSlaOperation(operation, slaData, context);

      let result;

      switch (operation) {
        case 'monitor-violations':
          result = await this.#escalationService.processEscalationOperation(
            'MONITOR_SLA_VIOLATIONS',
            slaData,
            context
          );
          break;

        case 'track-performance':
          result = await this.#escalationService.processEscalationOperation(
            'TRACK_SLA_PERFORMANCE',
            slaData,
            context
          );
          break;

        case 'analyze-trends':
          result = await this.#escalationService.processEscalationOperation(
            'ANALYZE_SLA_TRENDS',
            slaData,
            context
          );
          break;

        case 'generate-report':
          result = await this.#escalationService.processEscalationOperation(
            'GENERATE_SLA_REPORT',
            slaData,
            context
          );
          break;

        case 'update-thresholds':
          result = await this.#escalationService.processEscalationOperation(
            'UPDATE_SLA_THRESHOLDS',
            slaData,
            context
          );
          break;

        case 'configure-alerts':
          result = await this.#escalationService.processEscalationOperation(
            'CONFIGURE_SLA_ALERTS',
            slaData,
            context
          );
          break;

        case 'breach-analysis':
          result = await this.#escalationService.processEscalationOperation(
            'ANALYZE_SLA_BREACHES',
            slaData,
            context
          );
          break;

        case 'performance-dashboard':
          result = await this.#escalationService.processEscalationOperation(
            'GET_SLA_DASHBOARD',
            slaData,
            context
          );
          break;

        default:
          throw new AppError(`Unknown SLA operation: ${operation}`, 400);
      }

      // Update SLA metrics cache
      await this.#updateSlaMetrics(operation, result, context);

      const response = this.#responseFormatter.success(result, `SLA ${operation} completed successfully`, {
        operation,
        metricsUpdated: new Date().toISOString(),
        timestamp: new Date().toISOString(),
        processingTime: Date.now() - context.startTime
      });

      res.status(200).json(response);

    } catch (error) {
      logger.error(`Failed to execute SLA operation ${req.params.operation}:`, error);
      await this.#handleEscalationError(error, req, res, 'MANAGE_SLA');
    }
  });

  /**
   * Handle escalation analytics and reporting
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   */
  getEscalationAnalytics = asyncHandler(async (req, res, next) => {
    try {
      const { analysisType } = req.params;
      const analyticsParams = { ...req.query, ...req.body };
      const context = this.#buildRequestContext(req);

      // Apply analytics rate limiting
      await this.#checkRateLimit('analyze', context);

      // Validate analytics request
      await this.#validateAnalyticsRequest(analysisType, analyticsParams, context);

      // Check cache first
      const cacheKey = `${this.#config.cachePrefix}analytics:${analysisType}:${JSON.stringify(analyticsParams)}`;
      let result = await this.#cacheService.get(cacheKey);

      if (!result) {
        // Execute analytics
        result = await this.#escalationService.analyzeEscalationMetrics(
          analysisType,
          analyticsParams,
          context
        );

        // Cache the result
        await this.#cacheService.set(cacheKey, result, this.#config.cacheTTL);
      }

      // Apply pagination if needed
      if (result.data && Array.isArray(result.data)) {
        const paginationParams = paginationHelper.extractPaginationParams(req.query, {
          defaultPageSize: this.#config.defaultPageSize,
          maxPageSize: this.#config.maxPageSize
        });

        const paginatedResult = paginationHelper.paginate(
          result.data,
          paginationParams.page,
          paginationParams.pageSize
        );

        result.data = paginatedResult.data;
        result.pagination = paginatedResult.pagination;
      }

      const response = this.#responseFormatter.success(result, `Escalation analytics completed: ${analysisType}`, {
        analysisType,
        period: analyticsParams.period,
        cached: !!result.cached,
        dataPoints: result.data?.length || result.totalCount || 0,
        timestamp: new Date().toISOString(),
        processingTime: Date.now() - context.startTime
      });

      res.status(200).json(response);

    } catch (error) {
      logger.error(`Failed to get escalation analytics ${req.params.analysisType}:`, error);
      await this.#handleEscalationError(error, req, res, 'GET_ANALYTICS');
    }
  });

  /**
   * Handle escalation workflow operations
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   */
  executeEscalationWorkflow = asyncHandler(async (req, res, next) => {
    try {
      const { workflowType } = req.params;
      const workflowData = req.body;
      const context = this.#buildRequestContext(req);

      // Validate workflow request
      await this.#validateWorkflowRequest(workflowType, workflowData, context);

      // Execute workflow
      const result = await this.#escalationService.executeEscalationWorkflow(
        workflowType,
        workflowData,
        context
      );

      const response = this.#responseFormatter.success(result, `Escalation workflow executed: ${workflowType}`, {
        workflowType,
        workflowId: result.workflowId,
        stepsCompleted: result.steps?.length || 0,
        duration: result.duration,
        timestamp: new Date().toISOString()
      });

      res.status(200).json(response);

    } catch (error) {
      logger.error(`Failed to execute escalation workflow ${req.params.workflowType}:`, error);
      await this.#handleEscalationError(error, req, res, 'EXECUTE_WORKFLOW');
    }
  });

  /**
   * Handle bulk escalation operations
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   */
  bulkEscalationOperations = asyncHandler(async (req, res, next) => {
    try {
      const { operation } = req.params;
      const bulkData = req.body;
      const context = this.#buildRequestContext(req);

      // Validate bulk operation
      await this.#validateBulkEscalationOperation(operation, bulkData, context);

      // Apply bulk rate limiting
      await this.#checkRateLimit('bulk', context);

      let result;

      switch (operation) {
        case 'bulk-escalate':
          result = await this.#escalationService.processEscalationOperation(
            'BULK_ESCALATE_TICKETS',
            bulkData,
            context
          );
          break;

        case 'bulk-de-escalate':
          result = await this.#escalationService.processEscalationOperation(
            'BULK_DE_ESCALATE_TICKETS',
            bulkData,
            context
          );
          break;

        case 'bulk-reassign':
          result = await this.#escalationService.processEscalationOperation(
            'BULK_REASSIGN_ESCALATED',
            bulkData,
            context
          );
          break;

        case 'bulk-rule-update':
          result = await this.#escalationService.processEscalationOperation(
            'BULK_UPDATE_RULES',
            bulkData,
            context
          );
          break;

        case 'bulk-rule-activate':
          result = await this.#escalationService.processEscalationOperation(
            'BULK_ACTIVATE_RULES',
            bulkData,
            context
          );
          break;

        case 'bulk-rule-deactivate':
          result = await this.#escalationService.processEscalationOperation(
            'BULK_DEACTIVATE_RULES',
            bulkData,
            context
          );
          break;

        case 'bulk-sla-update':
          result = await this.#escalationService.processEscalationOperation(
            'BULK_UPDATE_SLA_SETTINGS',
            bulkData,
            context
          );
          break;

        case 'bulk-export':
          result = await this.#escalationService.processEscalationOperation(
            'BULK_EXPORT_ESCALATION_DATA',
            bulkData,
            context
          );
          break;

        default:
          throw new AppError(`Unknown bulk escalation operation: ${operation}`, 400);
      }

      // Update escalation matrix and queue if needed
      if (['bulk-escalate', 'bulk-de-escalate', 'bulk-reassign'].includes(operation)) {
        await this.#refreshEscalationMatrix();
        await this.#refreshEscalationQueue();
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
      logger.error(`Failed to execute bulk escalation operation ${req.params.operation}:`, error);
      await this.#handleEscalationError(error, req, res, 'BULK_OPERATION');
    }
  });

  /**
   * Handle escalation dashboard operations
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   */
  getEscalationDashboard = asyncHandler(async (req, res, next) => {
    try {
      const { dashboardType } = req.params;
      const dashboardParams = { ...req.query, ...req.body };
      const context = this.#buildRequestContext(req);

      // Validate dashboard request
      await this.#validateDashboardRequest(dashboardType, dashboardParams, context);

      let result;

      switch (dashboardType) {
        case 'overview':
          result = await this.#escalationService.processEscalationOperation(
            'GET_ESCALATION_OVERVIEW',
            dashboardParams,
            context
          );
          break;

        case 'performance':
          result = await this.#escalationService.processEscalationOperation(
            'GET_PERFORMANCE_DASHBOARD',
            dashboardParams,
            context
          );
          break;

        case 'sla-monitoring':
          result = await this.#escalationService.processEscalationOperation(
            'GET_SLA_MONITORING_DASHBOARD',
            dashboardParams,
            context
          );
          break;

        case 'rule-management':
          result = await this.#escalationService.processEscalationOperation(
            'GET_RULE_MANAGEMENT_DASHBOARD',
            dashboardParams,
            context
          );
          break;

        case 'real-time':
          result = await this.#escalationService.processEscalationOperation(
            'GET_REAL_TIME_DASHBOARD',
            dashboardParams,
            context
          );
          break;

        case 'analytics':
          result = await this.#escalationService.processEscalationOperation(
            'GET_ANALYTICS_DASHBOARD',
            dashboardParams,
            context
          );
          break;

        case 'team-workload':
          result = await this.#escalationService.processEscalationOperation(
            'GET_TEAM_WORKLOAD_DASHBOARD',
            dashboardParams,
            context
          );
          break;

        case 'escalation-queue':
          result = await this.#escalationService.processEscalationOperation(
            'GET_ESCALATION_QUEUE_DASHBOARD',
            dashboardParams,
            context
          );
          break;

        default:
          throw new AppError(`Unknown dashboard type: ${dashboardType}`, 400);
      }

      const response = this.#responseFormatter.success(result, `Escalation dashboard retrieved: ${dashboardType}`, {
        dashboardType,
        dataRefreshTime: new Date().toISOString(),
        timestamp: new Date().toISOString(),
        processingTime: Date.now() - context.startTime
      });

      res.status(200).json(response);

    } catch (error) {
      logger.error(`Failed to get escalation dashboard ${req.params.dashboardType}:`, error);
      await this.#handleEscalationError(error, req, res, 'GET_DASHBOARD');
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
      roles: req.user?.roles || [],
      department: req.user?.department,
      accessLevel: req.user?.accessLevel || 'STANDARD'
    };
  }

  async #initializeEscalationMatrix() {
    try {
      const activeRules = await EscalationRule.find({ 
        status: 'ACTIVE',
        organizationId: { $exists: true }
      }).limit(500);
      
      for (const rule of activeRules) {
        this.#escalationMatrix.set(rule.ruleId, {
          id: rule.ruleId,
          name: rule.name,
          priority: rule.priority,
          conditions: rule.conditions,
          actions: rule.actions,
          triggerType: rule.triggerType,
          escalationType: rule.escalationType,
          timeThresholds: rule.timeThresholds,
          lastTriggered: rule.analytics?.lastTriggered
        });
      }
      
      logger.info(`Escalation matrix initialized with ${this.#escalationMatrix.size} rules`);
    } catch (error) {
      logger.error('Failed to initialize escalation matrix:', error);
    }
  }

  async #initializeEscalationQueue() {
    try {
      const escalatedTickets = await SupportTicket.find({
        'escalation.isEscalated': true,
        'status.current': { $in: ['OPEN', 'IN_PROGRESS', 'ESCALATED'] }
      }).sort({ 'escalation.escalatedAt': 1 });
      
      this.#escalationQueue = escalatedTickets.map(ticket => ({
        ticketId: ticket.ticketId,
        escalationLevel: ticket.escalation.level,
        escalatedAt: ticket.escalation.escalatedAt,
        priority: ticket.priority.current,
        slaRisk: this.#calculateSlaRisk(ticket),
        assignedTo: ticket.assignment.assignedTo
      }));
      
      logger.info(`Escalation queue initialized with ${this.#escalationQueue.length} tickets`);
    } catch (error) {
      logger.error('Failed to initialize escalation queue:', error);
    }
  }

  async #initializeSlaMetrics() {
    try {
      // Initialize SLA metrics for different priorities
      for (const priority of this.#config.validation.allowedPriorities) {
        this.#slaMetrics.set(priority, {
          totalTickets: 0,
          violatedSla: 0,
          averageResolutionTime: 0,
          breachRate: 0,
          lastUpdated: new Date()
        });
      }
      
      // Load recent SLA data
      const recentTickets = await SupportTicket.find({
        'metadata.createdAt': { 
          $gte: dateHelper.addDays(new Date(), -7) 
        }
      }).select('priority sla resolution');
      
      for (const ticket of recentTickets) {
        const metrics = this.#slaMetrics.get(ticket.priority.current) || {};
        metrics.totalTickets = (metrics.totalTickets || 0) + 1;
        if (ticket.sla?.violated) {
          metrics.violatedSla = (metrics.violatedSla || 0) + 1;
        }
        this.#slaMetrics.set(ticket.priority.current, metrics);
      }
      
      logger.info(`SLA metrics initialized for ${this.#slaMetrics.size} priority levels`);
    } catch (error) {
      logger.error('Failed to initialize SLA metrics:', error);
    }
  }

  async #setupPeriodicTasks() {
    // Setup escalation monitoring task
    setInterval(async () => {
      try {
        await this.#monitorEscalationQueue();
      } catch (error) {
        logger.error('Escalation monitoring task failed:', error);
      }
    }, 60000); // Every minute

    // Setup SLA monitoring task
    setInterval(async () => {
      try {
        await this.#monitorSlaViolations();
      } catch (error) {
        logger.error('SLA monitoring task failed:', error);
      }
    }, 300000); // Every 5 minutes

    // Setup metrics refresh task
    setInterval(async () => {
      try {
        await this.#refreshMetrics();
      } catch (error) {
        logger.error('Metrics refresh task failed:', error);
      }
    }, 600000); // Every 10 minutes
  }

  async #validateEscalationRuleCreation(data, context) {
    // Validate required fields
    for (const field of this.#config.validation.requiredFields) {
      if (!data[field] || (typeof data[field] === 'string' && data[field].trim().length === 0)) {
        throw new AppError(`${field} is required`, 400);
      }
    }

    // Validate field lengths
    if (data.name.length > this.#config.validation.maxRuleNameLength) {
      throw new AppError(`Rule name exceeds maximum length of ${this.#config.validation.maxRuleNameLength}`, 400);
    }

    if (data.description && data.description.length > this.#config.validation.maxDescriptionLength) {
      throw new AppError(`Description exceeds maximum length of ${this.#config.validation.maxDescriptionLength}`, 400);
    }

    // Validate conditions and actions
    if (!Array.isArray(data.conditions) || data.conditions.length === 0) {
      throw new AppError('At least one condition is required', 400);
    }

    if (data.conditions.length > this.#config.validation.maxConditions) {
      throw new AppError(`Too many conditions. Maximum ${this.#config.validation.maxConditions} allowed`, 400);
    }

    if (!Array.isArray(data.actions) || data.actions.length === 0) {
      throw new AppError('At least one action is required', 400);
    }

    if (data.actions.length > this.#config.validation.maxActions) {
      throw new AppError(`Too many actions. Maximum ${this.#config.validation.maxActions} allowed`, 400);
    }

    // Validate priority
    if (!this.#config.validation.allowedPriorities.includes(data.priority)) {
      throw new AppError(`Invalid priority. Must be one of: ${this.#config.validation.allowedPriorities.join(', ')}`, 400);
    }

    // Validate trigger type
    if (!this.#config.validation.allowedTriggerTypes.includes(data.triggerType)) {
      throw new AppError(`Invalid trigger type. Must be one of: ${this.#config.validation.allowedTriggerTypes.join(', ')}`, 400);
    }

    // Validate escalation type
    if (!this.#config.validation.allowedEscalationTypes.includes(data.escalationType)) {
      throw new AppError(`Invalid escalation type. Must be one of: ${this.#config.validation.allowedEscalationTypes.join(', ')}`, 400);
    }

    // Validate time thresholds
    if (data.timeThresholds) {
      for (const threshold of data.timeThresholds) {
        if (threshold < this.#config.validation.minTimeThreshold) {
          throw new AppError(`Time threshold too small. Minimum ${this.#config.validation.minTimeThreshold}ms`, 400);
        }
        if (threshold > this.#config.validation.maxTimeThreshold) {
          throw new AppError(`Time threshold too large. Maximum ${this.#config.validation.maxTimeThreshold}ms`, 400);
        }
      }
    }

    // Validate permissions
    if (!context.permissions.includes('escalation.create') && !context.permissions.includes('admin.escalation')) {
      throw new AppError('Insufficient permissions to create escalation rules', 403);
    }

    // Validate organization access
    if (!context.organizationId) {
      throw new AppError('Organization context required', 400);
    }
  }

  async #validateRuleAccess(ruleId, context, operation) {
    if (!CommonValidator.isValidId(ruleId)) {
      throw new AppError('Invalid rule ID format', 400);
    }

    // Get rule to check access
    const rule = await EscalationRule.findOne({ ruleId }).select('organizationId ownership createdBy status');
    
    if (!rule) {
      throw new AppError('Escalation rule not found', 404);
    }

    // Check organization access
    if (rule.organizationId.toString() !== context.organizationId) {
      throw new AppError('Access denied: Rule belongs to different organization', 403);
    }

    // Check operation-specific permissions
    const requiredPermissions = this.#getEscalationOperationPermissions(operation);
    const hasPermission = requiredPermissions.some(permission => 
      context.permissions.includes(permission)
    );

    if (!hasPermission) {
      throw new AppError(`Insufficient permissions for operation: ${operation}`, 403);
    }

    // Check ownership for critical operations
    if (['DELETE', 'FORCE_ESCALATE'].includes(operation)) {
      const isOwner = rule.ownership?.owner?.toString() === context.user.id;
      const isCreator = rule.createdBy?.toString() === context.user.id;
      const hasAdminAccess = context.permissions.includes('admin.escalation');

      if (!isOwner && !isCreator && !hasAdminAccess) {
        throw new AppError('Access denied: Not authorized to perform this operation', 403);
      }
    }
  }

  #getEscalationOperationPermissions(operation) {
    const permissionMap = {
      'CREATE': ['escalation.create', 'admin.escalation'],
      'UPDATE': ['escalation.update', 'admin.escalation'],
      'DELETE': ['escalation.delete', 'admin.escalation'],
      'MANAGE': ['escalation.manage', 'admin.escalation'],
      'ESCALATE': ['escalation.execute', 'admin.escalation'],
      'FORCE_ESCALATE': ['escalation.force', 'admin.escalation'],
      'SLA_MANAGE': ['sla.manage', 'admin.sla'],
      'ANALYTICS': ['escalation.analytics', 'admin.analytics']
    };

    return permissionMap[operation] || ['admin.super'];
  }

  async #validateEscalationRuleUpdate(data, context) {
    if (data.name && data.name.length > this.#config.validation.maxRuleNameLength) {
      throw new AppError(`Rule name exceeds maximum length of ${this.#config.validation.maxRuleNameLength}`, 400);
    }

    if (data.description && data.description.length > this.#config.validation.maxDescriptionLength) {
      throw new AppError(`Description exceeds maximum length of ${this.#config.validation.maxDescriptionLength}`, 400);
    }

    if (data.priority && !this.#config.validation.allowedPriorities.includes(data.priority)) {
      throw new AppError(`Invalid priority. Must be one of: ${this.#config.validation.allowedPriorities.join(', ')}`, 400);
    }

    if (data.status && !this.#config.validation.allowedStatuses.includes(data.status)) {
      throw new AppError(`Invalid status. Must be one of: ${this.#config.validation.allowedStatuses.join(', ')}`, 400);
    }
  }

  async #checkRuleConflicts(ruleData, context, excludeRuleId = null) {
    // Check for conflicting rules with similar conditions
    const existingRules = await EscalationRule.find({
      organizationId: context.organizationId,
      status: 'ACTIVE',
      ruleId: { $ne: excludeRuleId }
    });

    for (const existingRule of existingRules) {
      if (this.#hasConflictingConditions(ruleData.conditions, existingRule.conditions)) {
        throw new AppError(`Rule conflicts with existing rule: ${existingRule.name}`, 409);
      }
    }
  }

  #hasConflictingConditions(conditions1, conditions2) {
    // Simplified conflict detection logic
    const overlap = conditions1.some(c1 => 
      conditions2.some(c2 => 
        c1.field === c2.field && 
        c1.operator === c2.operator && 
        c1.value === c2.value
      )
    );
    return overlap;
  }

  async #validateTicketAccess(ticketId, context, operation) {
    if (!CommonValidator.isValidId(ticketId)) {
      throw new AppError('Invalid ticket ID format', 400);
    }

    // Get ticket to check access
    const ticket = await SupportTicket.findOne({ ticketId }).select('organizationId assignment priority status');
    
    if (!ticket) {
      throw new AppError('Support ticket not found', 404);
    }

    // Check organization access
    if (ticket.organizationId.toString() !== context.organizationId) {
      throw new AppError('Access denied: Ticket belongs to different organization', 403);
    }

    // Check operation-specific permissions
    const requiredPermissions = this.#getEscalationOperationPermissions(operation);
    const hasPermission = requiredPermissions.some(permission => 
      context.permissions.includes(permission)
    );

    if (!hasPermission) {
      throw new AppError(`Insufficient permissions for operation: ${operation}`, 403);
    }
  }

  async #validateRuleOperation(operation, data, context) {
    const validOperations = ['activate', 'deactivate', 'suspend', 'test', 'clone', 'delete', 'validate', 'export'];
    
    if (!validOperations.includes(operation)) {
      throw new AppError(`Invalid rule operation: ${operation}`, 400);
    }

    if (operation === 'clone' && !data.newName) {
      throw new AppError('New name is required for clone operation', 400);
    }

    if (operation === 'test' && !data.testTicketId) {
      throw new AppError('Test ticket ID is required for test operation', 400);
    }

    // Validate critical operation permissions
    if (['delete', 'suspend'].includes(operation)) {
      if (!context.permissions.includes('escalation.critical') && !context.permissions.includes('admin.escalation')) {
        throw new AppError('Insufficient permissions for critical operations', 403);
      }
    }
  }

  async #validateEscalationOperation(operation, data, context) {
    const validOperations = [
      'auto-escalate', 'manual-escalate', 'de-escalate', 'force-escalate', 
      'reassign', 'override-escalation', 'escalation-history', 'check-escalation-eligibility'
    ];
    
    if (!validOperations.includes(operation)) {
      throw new AppError(`Invalid escalation operation: ${operation}`, 400);
    }

    if (['manual-escalate', 'force-escalate'].includes(operation) && !data.reason) {
      throw new AppError('Reason is required for manual and force escalation operations', 400);
    }

    if (operation === 'reassign' && !data.assignTo) {
      throw new AppError('Assign to user ID is required for reassign operation', 400);
    }

    if (operation === 'override-escalation' && !data.overrideReason) {
      throw new AppError('Override reason is required for override operation', 400);
    }

    // Validate force escalation permissions
    if (operation === 'force-escalate') {
      if (!context.permissions.includes('escalation.force') && !context.permissions.includes('admin.escalation')) {
        throw new AppError('Insufficient permissions for force escalation', 403);
      }
    }
  }

  async #validateSlaOperation(operation, data, context) {
    const validOperations = [
      'monitor-violations', 'track-performance', 'analyze-trends', 'generate-report',
      'update-thresholds', 'configure-alerts', 'breach-analysis', 'performance-dashboard'
    ];
    
    if (!validOperations.includes(operation)) {
      throw new AppError(`Invalid SLA operation: ${operation}`, 400);
    }

    if (['update-thresholds', 'configure-alerts'].includes(operation)) {
      if (!context.permissions.includes('sla.configure') && !context.permissions.includes('admin.sla')) {
        throw new AppError('Insufficient permissions for SLA configuration operations', 403);
      }
    }

    if (operation === 'update-thresholds' && !data.thresholds) {
      throw new AppError('Thresholds data is required for update-thresholds operation', 400);
    }

    if (operation === 'configure-alerts' && !data.alertConfig) {
      throw new AppError('Alert configuration is required for configure-alerts operation', 400);
    }
  }

  async #validateAnalyticsRequest(analysisType, params, context) {
    const validAnalysisTypes = [
      'ESCALATION_PATTERNS', 'TEAM_PERFORMANCE', 'SLA_COMPLIANCE', 'RULE_EFFECTIVENESS',
      'RESPONSE_TIMES', 'ESCALATION_TRENDS', 'WORKLOAD_DISTRIBUTION', 'CUSTOMER_SATISFACTION',
      'RESOLUTION_METRICS', 'ESCALATION_VOLUME', 'BREACH_ANALYSIS', 'PERFORMANCE_BENCHMARKS'
    ];

    if (!validAnalysisTypes.includes(analysisType)) {
      throw new AppError(`Invalid analysis type: ${analysisType}`, 400);
    }

    if (!context.permissions.includes('escalation.analytics') && !context.permissions.includes('admin.analytics')) {
      throw new AppError('Insufficient permissions for analytics access', 403);
    }

    // Validate date range
    if (params.startDate && params.endDate) {
      const start = new Date(params.startDate);
      const end = new Date(params.endDate);
      
      if (start >= end) {
        throw new AppError('Start date must be before end date', 400);
      }
      
      if (end > new Date()) {
        throw new AppError('End date cannot be in the future', 400);
      }
      
      // Limit analysis to reasonable time ranges
      const daysDiff = Math.abs(end - start) / (1000 * 60 * 60 * 24);
      if (daysDiff > 365) {
        throw new AppError('Analysis period cannot exceed 365 days', 400);
      }
    }
  }

  async #validateBulkEscalationOperation(operation, data, context) {
    const validOperations = [
      'bulk-escalate', 'bulk-de-escalate', 'bulk-reassign', 'bulk-rule-update',
      'bulk-rule-activate', 'bulk-rule-deactivate', 'bulk-sla-update', 'bulk-export'
    ];
    
    if (!validOperations.includes(operation)) {
      throw new AppError(`Invalid bulk escalation operation: ${operation}`, 400);
    }

    // Validate ticket operations
    if (['bulk-escalate', 'bulk-de-escalate', 'bulk-reassign'].includes(operation)) {
      if (!data.ticketIds || !Array.isArray(data.ticketIds) || data.ticketIds.length === 0) {
        throw new AppError('Ticket IDs array is required and cannot be empty', 400);
      }

      if (data.ticketIds.length > this.#config.maxBulkOperations) {
        throw new AppError(`Too many tickets. Maximum ${this.#config.maxBulkOperations} allowed per bulk operation`, 400);
      }
    }

    // Validate rule operations
    if (['bulk-rule-update', 'bulk-rule-activate', 'bulk-rule-deactivate'].includes(operation)) {
      if (!data.ruleIds || !Array.isArray(data.ruleIds) || data.ruleIds.length === 0) {
        throw new AppError('Rule IDs array is required and cannot be empty', 400);
      }

      if (data.ruleIds.length > this.#config.maxBulkOperations) {
        throw new AppError(`Too many rules. Maximum ${this.#config.maxBulkOperations} allowed per bulk operation`, 400);
      }
    }

    // Check bulk operation permissions
    if (!context.permissions.includes('escalation.bulk') && !context.permissions.includes('admin.escalation')) {
      throw new AppError('Insufficient permissions for bulk escalation operations', 403);
    }

    // Validate reassignment
    if (operation === 'bulk-reassign' && !data.assignTo) {
      throw new AppError('Assign to user ID is required for bulk reassign operation', 400);
    }
  }

  async #validateWorkflowRequest(workflowType, data, context) {
    const validWorkflowTypes = [
      'AUTO_ESCALATION_WORKFLOW', 'MANUAL_ESCALATION_WORKFLOW', 'SLA_MONITORING_WORKFLOW',
      'RULE_DEPLOYMENT_WORKFLOW', 'PERFORMANCE_ANALYSIS_WORKFLOW', 'BREACH_RESPONSE_WORKFLOW',
      'TEAM_REBALANCING_WORKFLOW', 'CRITICAL_ESCALATION_WORKFLOW'
    ];

    if (!validWorkflowTypes.includes(workflowType)) {
      throw new AppError(`Invalid workflow type: ${workflowType}`, 400);
    }

    if (!context.permissions.includes('escalation.workflow') && !context.permissions.includes('admin.workflows')) {
      throw new AppError('Insufficient permissions for escalation workflow execution', 403);
    }
  }

  async #validateDashboardRequest(dashboardType, params, context) {
    const validDashboardTypes = [
      'overview', 'performance', 'sla-monitoring', 'rule-management',
      'real-time', 'analytics', 'team-workload', 'escalation-queue'
    ];

    if (!validDashboardTypes.includes(dashboardType)) {
      throw new AppError(`Invalid dashboard type: ${dashboardType}`, 400);
    }

    if (!context.permissions.includes('escalation.dashboard') && !context.permissions.includes('admin.dashboard')) {
      throw new AppError('Insufficient permissions for dashboard access', 403);
    }
  }

  async #checkRateLimit(operation, context) {
    const limit = this.#config.rateLimits[operation];
    if (!limit) return;

    const rateLimitKey = `escalation_rate_limit:${context.user.id}:${operation}`;
    
    // Rate limit implementation would go here
    logger.debug(`Rate limit check for ${operation}: ${rateLimitKey}`);
  }

  async #updateEscalationMatrix(rule) {
    if (rule.status === 'ACTIVE') {
      this.#escalationMatrix.set(rule.ruleId, {
        id: rule.ruleId,
        name: rule.name,
        priority: rule.priority,
        conditions: rule.conditions,
        actions: rule.actions,
        triggerType: rule.triggerType,
        escalationType: rule.escalationType,
        timeThresholds: rule.timeThresholds,
        lastTriggered: rule.analytics?.lastTriggered
      });
    } else {
      this.#escalationMatrix.delete(rule.ruleId);
    }
  }

  async #refreshEscalationMatrix() {
    this.#escalationMatrix.clear();
    await this.#initializeEscalationMatrix();
  }

  async #updateEscalationQueue(ticketId, operation, result) {
    const existingIndex = this.#escalationQueue.findIndex(item => item.ticketId === ticketId);
    
    if (['auto-escalate', 'manual-escalate'].includes(operation)) {
      const queueItem = {
        ticketId,
        escalationLevel: result.ticket?.escalationLevel,
        escalatedAt: new Date(),
        priority: result.ticket?.priority,
        slaRisk: this.#calculateSlaRisk(result.ticket),
        assignedTo: result.ticket?.assignedTo
      };
      
      if (existingIndex >= 0) {
        this.#escalationQueue[existingIndex] = queueItem;
      } else {
        this.#escalationQueue.push(queueItem);
      }
    } else if (operation === 'de-escalate' && existingIndex >= 0) {
      this.#escalationQueue.splice(existingIndex, 1);
    }
    
    // Sort by priority and escalation time
    this.#escalationQueue.sort((a, b) => {
      const priorityOrder = { 'CRITICAL': 5, 'URGENT': 4, 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1 };
      return (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0) || 
             new Date(a.escalatedAt) - new Date(b.escalatedAt);
    });
  }

  async #refreshEscalationQueue() {
    this.#escalationQueue.length = 0;
    await this.#initializeEscalationQueue();
  }

  async #updateSlaMetrics(operation, result, context) {
    // Update SLA metrics based on operation results
    if (result.slaMetrics) {
      for (const [priority, metrics] of Object.entries(result.slaMetrics)) {
        this.#slaMetrics.set(priority, {
          ...this.#slaMetrics.get(priority),
          ...metrics,
          lastUpdated: new Date()
        });
      }
    }
  }

  #calculateSlaRisk(ticket) {
    if (!ticket.sla || !ticket.sla.dueDate) return 'LOW';
    
    const now = new Date();
    const dueDate = new Date(ticket.sla.dueDate);
    const timeRemaining = dueDate - now;
    const totalSlaTime = dueDate - new Date(ticket.metadata.createdAt);
    const percentRemaining = timeRemaining / totalSlaTime;
    
    if (percentRemaining <= 0) return 'VIOLATED';
    if (percentRemaining <= 0.1) return 'CRITICAL';
    if (percentRemaining <= 0.25) return 'HIGH';
    if (percentRemaining <= 0.5) return 'MEDIUM';
    return 'LOW';
  }

  async #monitorEscalationQueue() {
    // Monitor escalation queue for automatic escalations
    const now = new Date();
    
    for (const item of this.#escalationQueue) {
      const timeSinceEscalation = now - new Date(item.escalatedAt);
      const nextEscalationTime = this.#config.escalation.escalationIntervals[item.escalationLevel] || 3600000;
      
      if (timeSinceEscalation >= nextEscalationTime && item.escalationLevel < this.#config.escalation.maxEscalationLevels) {
        // Trigger automatic escalation
        logger.info(`Auto-escalating ticket ${item.ticketId} to level ${item.escalationLevel + 1}`);
      }
    }
  }

  async #monitorSlaViolations() {
    // Monitor for SLA violations and near-violations
    const tickets = await SupportTicket.find({
      'status.current': { $in: ['OPEN', 'IN_PROGRESS'] },
      'sla.dueDate': { $exists: true }
    }).select('ticketId sla priority metadata');
    
    const now = new Date();
    
    for (const ticket of tickets) {
      const risk = this.#calculateSlaRisk(ticket);
      
      if (risk === 'VIOLATED' || risk === 'CRITICAL') {
        // Send SLA violation notification
        await this.#notificationService.sendNotification({
          type: 'SLA_VIOLATION',
          severity: risk === 'VIOLATED' ? 'CRITICAL' : 'HIGH',
          ticketId: ticket.ticketId,
          priority: ticket.priority.current,
          message: `SLA ${risk === 'VIOLATED' ? 'violated' : 'at critical risk'} for ticket ${ticket.ticketId}`
        });
      }
    }
  }

  async #refreshMetrics() {
    // Refresh various metrics caches
    await this.#refreshEscalationMatrix();
    await this.#refreshEscalationQueue();
    // Additional metric refresh logic would go here
  }

  async #handleEscalationError(error, req, res, operation) {
    // Log the error
    logger.error(`Escalation operation error: ${operation}`, {
      error: error.message,
      stack: error.stack,
      operation,
      ruleId: req.params.ruleId,
      ticketId: req.params.ticketId,
      user: req.user?.id,
      ip: req.ip
    });

    // Send error notification for critical errors
    if (error.statusCode >= 500) {
      await this.#notificationService.sendNotification({
        type: 'ESCALATION_OPERATION_ERROR',
        severity: 'HIGH',
        message: error.message,
        data: {
          operation,
          ruleId: req.params.ruleId,
          ticketId: req.params.ticketId,
          user: req.user?.id,
          timestamp: new Date()
        }
      });
    }

    // Audit the error
    await this.#auditService.log({
      service: this.#controllerName,
      operation,
      user: req.user?.id,
      error: error.message,
      statusCode: error.statusCode,
      timestamp: new Date()
    });

    // Format error response
    const errorResponse = this.#responseFormatter.error(
      error.message,
      error.statusCode || 500,
      {
        operation,
        ruleId: req.params.ruleId,
        ticketId: req.params.ticketId,
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id']
      }
    );

    res.status(error.statusCode || 500).json(errorResponse);
  }
}

module.exports = EscalationController;