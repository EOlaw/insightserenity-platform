'use strict';

/**
 * @fileoverview Enterprise ticket management controller for comprehensive ticket operations
 * @module servers/admin-server/modules/support-administration/controllers/ticket-management-controller
 * @requires module:servers/admin-server/modules/support-administration/services/ticket-management-service
 * @requires module:servers/admin-server/modules/support-administration/services/escalation-service
 * @requires module:servers/admin-server/modules/support-administration/models/support-ticket-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/response-formatter
 * @requires module:shared/lib/utils/async-handler
 * @requires module:shared/lib/utils/validators/common-validators
 * @requires module:shared/lib/utils/helpers/pagination-helper
 * @requires module:shared/lib/utils/helpers/date-helper
 * @requires module:shared/lib/utils/helpers/crypto-helper
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/services/audit-service
 * @requires module:shared/lib/services/notification-service
 * @requires module:shared/lib/middleware/security/input-validation
 */

const TicketManagementService = require('../services/ticket-management-service');
const EscalationService = require('../services/escalation-service');
const SupportTicket = require('../models/support-ticket-model');
const logger = require('../../../../../shared/lib/utils/logger');
const { AppError } = require('../../../../../shared/lib/utils/app-error');
const ResponseFormatter = require('../../../../../shared/lib/utils/response-formatter');
const asyncHandler = require('../../../../../shared/lib/utils/async-handler');
const CommonValidator = require('../../../../../shared/lib/utils/validators/common-validators');
const paginationHelper = require('../../../../../shared/lib/utils/helpers/pagination-helper');
const dateHelper = require('../../../../../shared/lib/utils/helpers/date-helper');
const cryptoHelper = require('../../../../../shared/lib/utils/helpers/crypto-helper');
const CacheService = require('../../../../../shared/lib/services/cache-service');
const AuditService = require('../../../../../shared/lib/services/audit-service');
const NotificationService = require('../../../../../shared/lib/services/notification-service');
const inputValidation = require('../../../../../shared/lib/middleware/security/input-validation');

/**
 * @class TicketManagementController
 * @description Comprehensive ticket management controller for enterprise ticket operations
 */
class TicketManagementController {
  #ticketManagementService;
  #escalationService;
  #cacheService;
  #auditService;
  #notificationService;
  #responseFormatter;
  #initialized;
  #controllerName;
  #config;

  /**
   * @constructor
   * @description Initialize ticket management controller with dependencies
   */
  constructor() {
    this.#ticketManagementService = new TicketManagementService();
    this.#escalationService = new EscalationService();
    this.#cacheService = new CacheService();
    this.#auditService = new AuditService();
    this.#notificationService = new NotificationService();
    this.#responseFormatter = new ResponseFormatter();
    this.#initialized = false;
    this.#controllerName = 'TicketManagementController';
    
    this.#config = {
      cachePrefix: 'ticket_ctrl:',
      cacheTTL: 1800,
      defaultPageSize: 25,
      maxPageSize: 100,
      maxBulkOperations: 1000,
      rateLimits: {
        create: { windowMs: 60000, max: 50 },
        update: { windowMs: 60000, max: 100 },
        bulk: { windowMs: 300000, max: 10 },
        search: { windowMs: 60000, max: 200 }
      },
      validation: {
        maxSubjectLength: 200,
        maxDescriptionLength: 10000,
        maxAttachmentSize: 25 * 1024 * 1024, // 25MB
        allowedAttachmentTypes: [
          'image/jpeg', 'image/png', 'image/gif',
          'application/pdf', 'text/plain',
          'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ],
        maxTagsPerTicket: 20,
        maxCustomFields: 50
      },
      features: {
        autoAssignment: true,
        autoEscalation: true,
        duplicateDetection: true,
        smartRouting: true,
        aiCategorization: true,
        sentimentAnalysis: true,
        timeTracking: true,
        workflowAutomation: true
      },
      security: {
        requireTicketAccess: true,
        auditAllOperations: true,
        encryptSensitiveData: true,
        validateFileUploads: true,
        preventXSS: true,
        sanitizeInputs: true
      }
    };
  }

  /**
   * Initialize the ticket management controller
   * @async
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      if (this.#initialized) {
        logger.warn(`${this.#controllerName} already initialized`);
        return;
      }

      await this.#ticketManagementService.initialize();
      await this.#escalationService.initialize();
      await this.#cacheService.initialize();
      await this.#auditService.initialize();
      await this.#notificationService.initialize();
      
      this.#initialized = true;
      logger.info(`${this.#controllerName} initialized successfully`);
    } catch (error) {
      logger.error(`Failed to initialize ${this.#controllerName}:`, error);
      throw new AppError('Ticket management controller initialization failed', 500);
    }
  }

  /**
   * Handle ticket creation
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   */
  createTicket = asyncHandler(async (req, res, next) => {
    try {
      const ticketData = req.body;
      const context = this.#buildRequestContext(req);

      // Validate ticket creation data
      await this.#validateTicketCreation(ticketData, context);

      // Apply rate limiting
      await this.#checkRateLimit('create', context);

      // Create ticket
      const result = await this.#ticketManagementService.processTicketOperation(
        'CREATE_TICKET',
        ticketData,
        context
      );

      const response = this.#responseFormatter.success(result, 'Ticket created successfully', {
        ticketId: result.ticket?.ticketId,
        timestamp: new Date().toISOString(),
        processingTime: Date.now() - context.startTime
      });

      res.status(201).json(response);

    } catch (error) {
      logger.error('Failed to create ticket:', error);
      await this.#handleTicketError(error, req, res, 'CREATE_TICKET');
    }
  });

  /**
   * Handle ticket updates
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   */
  updateTicket = asyncHandler(async (req, res, next) => {
    try {
      const { ticketId } = req.params;
      const updateData = { ...req.body, ticketId };
      const context = this.#buildRequestContext(req);

      // Validate ticket access
      await this.#validateTicketAccess(ticketId, context, 'UPDATE');

      // Validate update data
      await this.#validateTicketUpdate(updateData, context);

      // Update ticket
      const result = await this.#ticketManagementService.processTicketOperation(
        'UPDATE_TICKET',
        updateData,
        context
      );

      const response = this.#responseFormatter.success(result, 'Ticket updated successfully', {
        ticketId,
        timestamp: new Date().toISOString(),
        processingTime: Date.now() - context.startTime
      });

      res.status(200).json(response);

    } catch (error) {
      logger.error(`Failed to update ticket ${req.params.ticketId}:`, error);
      await this.#handleTicketError(error, req, res, 'UPDATE_TICKET');
    }
  });

  /**
   * Handle ticket assignment
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   */
  assignTicket = asyncHandler(async (req, res, next) => {
    try {
      const { ticketId } = req.params;
      const assignmentData = { ...req.body, ticketId };
      const context = this.#buildRequestContext(req);

      // Validate ticket access
      await this.#validateTicketAccess(ticketId, context, 'ASSIGN');

      // Validate assignment data
      await this.#validateTicketAssignment(assignmentData, context);

      let result;
      const assignmentType = assignmentData.assignmentType || 'MANUAL';

      switch (assignmentType) {
        case 'MANUAL':
          result = await this.#ticketManagementService.processTicketOperation(
            'ASSIGN_TICKET',
            assignmentData,
            context
          );
          break;

        case 'AUTO':
          result = await this.#ticketManagementService.processTicketOperation(
            'AUTO_ASSIGN',
            assignmentData,
            context
          );
          break;

        case 'SKILL_BASED':
          result = await this.#ticketManagementService.processTicketOperation(
            'SKILL_BASED_ASSIGN',
            assignmentData,
            context
          );
          break;

        case 'LOAD_BALANCED':
          result = await this.#ticketManagementService.processTicketOperation(
            'LOAD_BALANCED_ASSIGN',
            assignmentData,
            context
          );
          break;

        case 'ROUND_ROBIN':
          result = await this.#ticketManagementService.processTicketOperation(
            'ROUND_ROBIN_ASSIGN',
            assignmentData,
            context
          );
          break;

        case 'TEAM':
          result = await this.#ticketManagementService.processTicketOperation(
            'ASSIGN_TO_TEAM',
            assignmentData,
            context
          );
          break;

        default:
          throw new AppError(`Unknown assignment type: ${assignmentType}`, 400);
      }

      const response = this.#responseFormatter.success(result, 'Ticket assigned successfully', {
        ticketId,
        assignmentType,
        timestamp: new Date().toISOString()
      });

      res.status(200).json(response);

    } catch (error) {
      logger.error(`Failed to assign ticket ${req.params.ticketId}:`, error);
      await this.#handleTicketError(error, req, res, 'ASSIGN_TICKET');
    }
  });

  /**
   * Handle ticket status updates
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   */
  updateTicketStatus = asyncHandler(async (req, res, next) => {
    try {
      const { ticketId } = req.params;
      const statusData = { ...req.body, ticketId };
      const context = this.#buildRequestContext(req);

      // Validate ticket access
      await this.#validateTicketAccess(ticketId, context, 'UPDATE_STATUS');

      // Validate status update
      await this.#validateStatusUpdate(statusData, context);

      let result;
      const newStatus = statusData.status;

      switch (newStatus) {
        case 'RESOLVED':
          result = await this.#ticketManagementService.processTicketOperation(
            'RESOLVE_TICKET',
            statusData,
            context
          );
          break;

        case 'CLOSED':
          result = await this.#ticketManagementService.processTicketOperation(
            'CLOSE_TICKET',
            statusData,
            context
          );
          break;

        case 'REOPENED':
          result = await this.#ticketManagementService.processTicketOperation(
            'REOPEN_TICKET',
            statusData,
            context
          );
          break;

        case 'ON_HOLD':
          result = await this.#ticketManagementService.processTicketOperation(
            'HOLD_TICKET',
            statusData,
            context
          );
          break;

        case 'IN_PROGRESS':
          result = await this.#ticketManagementService.processTicketOperation(
            'RESUME_TICKET',
            statusData,
            context
          );
          break;

        case 'CANCELLED':
          result = await this.#ticketManagementService.processTicketOperation(
            'CANCEL_TICKET',
            statusData,
            context
          );
          break;

        default:
          result = await this.#ticketManagementService.processTicketOperation(
            'UPDATE_STATUS',
            statusData,
            context
          );
      }

      const response = this.#responseFormatter.success(result, `Ticket status updated to ${newStatus}`, {
        ticketId,
        previousStatus: statusData.previousStatus,
        newStatus,
        timestamp: new Date().toISOString()
      });

      res.status(200).json(response);

    } catch (error) {
      logger.error(`Failed to update ticket status ${req.params.ticketId}:`, error);
      await this.#handleTicketError(error, req, res, 'UPDATE_STATUS');
    }
  });

  /**
   * Handle ticket priority updates
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   */
  updateTicketPriority = asyncHandler(async (req, res, next) => {
    try {
      const { ticketId } = req.params;
      const priorityData = { ...req.body, ticketId };
      const context = this.#buildRequestContext(req);

      // Validate ticket access
      await this.#validateTicketAccess(ticketId, context, 'UPDATE_PRIORITY');

      // Validate priority data
      await this.#validatePriorityUpdate(priorityData, context);

      let result;

      if (priorityData.autoCalculate) {
        result = await this.#ticketManagementService.processTicketOperation(
          'CALCULATE_PRIORITY',
          priorityData,
          context
        );
      } else {
        result = await this.#ticketManagementService.processTicketOperation(
          'UPDATE_PRIORITY',
          priorityData,
          context
        );
      }

      const response = this.#responseFormatter.success(result, 'Ticket priority updated successfully', {
        ticketId,
        newPriority: priorityData.priority,
        autoCalculated: priorityData.autoCalculate,
        timestamp: new Date().toISOString()
      });

      res.status(200).json(response);

    } catch (error) {
      logger.error(`Failed to update ticket priority ${req.params.ticketId}:`, error);
      await this.#handleTicketError(error, req, res, 'UPDATE_PRIORITY');
    }
  });

  /**
   * Handle ticket communication operations
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   */
  addTicketMessage = asyncHandler(async (req, res, next) => {
    try {
      const { ticketId } = req.params;
      const messageData = { ...req.body, ticketId };
      const context = this.#buildRequestContext(req);

      // Validate ticket access
      await this.#validateTicketAccess(ticketId, context, 'ADD_MESSAGE');

      // Validate message data
      await this.#validateMessageData(messageData, context);

      let result;
      const messageType = messageData.messageType || 'PUBLIC';

      switch (messageType) {
        case 'PUBLIC':
          result = await this.#ticketManagementService.processTicketOperation(
            'SEND_REPLY',
            messageData,
            context
          );
          break;

        case 'INTERNAL':
          result = await this.#ticketManagementService.processTicketOperation(
            'ADD_INTERNAL_NOTE',
            messageData,
            context
          );
          break;

        case 'FORWARD':
          result = await this.#ticketManagementService.processTicketOperation(
            'FORWARD_TICKET',
            messageData,
            context
          );
          break;

        default:
          result = await this.#ticketManagementService.processTicketOperation(
            'ADD_MESSAGE',
            messageData,
            context
          );
      }

      const response = this.#responseFormatter.success(result, 'Message added successfully', {
        ticketId,
        messageType,
        messageId: result.messageId,
        timestamp: new Date().toISOString()
      });

      res.status(201).json(response);

    } catch (error) {
      logger.error(`Failed to add message to ticket ${req.params.ticketId}:`, error);
      await this.#handleTicketError(error, req, res, 'ADD_MESSAGE');
    }
  });

  /**
   * Handle ticket relationship operations
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   */
  manageTicketRelationships = asyncHandler(async (req, res, next) => {
    try {
      const { ticketId } = req.params;
      const { operation } = req.params;
      const relationshipData = { ...req.body, ticketId };
      const context = this.#buildRequestContext(req);

      // Validate ticket access
      await this.#validateTicketAccess(ticketId, context, 'MANAGE_RELATIONSHIPS');

      // Validate relationship data
      await this.#validateRelationshipData(relationshipData, operation, context);

      let result;

      switch (operation) {
        case 'merge':
          result = await this.#ticketManagementService.processTicketOperation(
            'MERGE_TICKETS',
            relationshipData,
            context
          );
          break;

        case 'split':
          result = await this.#ticketManagementService.processTicketOperation(
            'SPLIT_TICKET',
            relationshipData,
            context
          );
          break;

        case 'link':
          result = await this.#ticketManagementService.processTicketOperation(
            'LINK_TICKETS',
            relationshipData,
            context
          );
          break;

        case 'unlink':
          result = await this.#ticketManagementService.processTicketOperation(
            'UNLINK_TICKETS',
            relationshipData,
            context
          );
          break;

        case 'create-subtask':
          result = await this.#ticketManagementService.processTicketOperation(
            'CREATE_SUBTASK',
            relationshipData,
            context
          );
          break;

        case 'convert-parent':
          result = await this.#ticketManagementService.processTicketOperation(
            'CONVERT_TO_PARENT',
            relationshipData,
            context
          );
          break;

        case 'detect-duplicates':
          result = await this.#ticketManagementService.processTicketOperation(
            'DETECT_DUPLICATES',
            relationshipData,
            context
          );
          break;

        default:
          throw new AppError(`Unknown relationship operation: ${operation}`, 400);
      }

      const response = this.#responseFormatter.success(result, `Ticket relationship ${operation} completed`, {
        ticketId,
        operation,
        timestamp: new Date().toISOString()
      });

      res.status(200).json(response);

    } catch (error) {
      logger.error(`Failed to manage ticket relationships for ${req.params.ticketId}:`, error);
      await this.#handleTicketError(error, req, res, 'MANAGE_RELATIONSHIPS');
    }
  });

  /**
   * Handle bulk ticket operations
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   */
  bulkTicketOperations = asyncHandler(async (req, res, next) => {
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
        case 'update':
          result = await this.#ticketManagementService.processTicketOperation(
            'BULK_UPDATE',
            bulkData,
            context
          );
          break;

        case 'assign':
          result = await this.#ticketManagementService.processTicketOperation(
            'BULK_ASSIGN',
            bulkData,
            context
          );
          break;

        case 'close':
          result = await this.#ticketManagementService.processTicketOperation(
            'BULK_CLOSE',
            bulkData,
            context
          );
          break;

        case 'delete':
          result = await this.#ticketManagementService.processTicketOperation(
            'BULK_DELETE',
            bulkData,
            context
          );
          break;

        case 'transfer':
          result = await this.#ticketManagementService.processTicketOperation(
            'BULK_TRANSFER',
            bulkData,
            context
          );
          break;

        case 'tag':
          result = await this.#ticketManagementService.processTicketOperation(
            'BULK_TAG',
            bulkData,
            context
          );
          break;

        case 'prioritize':
          result = await this.#ticketManagementService.processTicketOperation(
            'BULK_PRIORITIZE',
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
      await this.#handleTicketError(error, req, res, 'BULK_OPERATION');
    }
  });

  /**
   * Handle ticket search and filtering
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   */
  searchTickets = asyncHandler(async (req, res, next) => {
    try {
      const searchParams = req.query;
      const context = this.#buildRequestContext(req);

      // Apply search rate limiting
      await this.#checkRateLimit('search', context);

      // Validate search parameters
      await this.#validateSearchParams(searchParams, context);

      // Build search criteria
      const searchCriteria = await this.#buildSearchCriteria(searchParams, context);

      // Execute search
      const searchResult = await this.#executeTicketSearch(searchCriteria, context);

      // Apply pagination
      const paginationParams = paginationHelper.extractPaginationParams(req.query, {
        defaultPageSize: this.#config.defaultPageSize,
        maxPageSize: this.#config.maxPageSize
      });

      const paginatedResult = paginationHelper.paginate(
        searchResult.tickets,
        paginationParams.page,
        paginationParams.pageSize
      );

      const response = this.#responseFormatter.success({
        tickets: paginatedResult.data,
        pagination: paginatedResult.pagination,
        aggregations: searchResult.aggregations,
        searchMeta: {
          query: searchParams.query,
          totalResults: searchResult.totalCount,
          searchTime: Date.now() - context.startTime,
          appliedFilters: searchCriteria.filters
        }
      }, 'Ticket search completed successfully');

      res.status(200).json(response);

    } catch (error) {
      logger.error('Failed to search tickets:', error);
      await this.#handleTicketError(error, req, res, 'SEARCH_TICKETS');
    }
  });

  /**
   * Handle ticket analytics and metrics
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   */
  getTicketAnalytics = asyncHandler(async (req, res, next) => {
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
        result = await this.#ticketManagementService.analyzeTicketMetrics(
          analysisType,
          analyticsParams,
          context
        );

        // Cache the result
        await this.#cacheService.set(cacheKey, result, this.#config.cacheTTL);
      }

      const response = this.#responseFormatter.success(result, `Ticket analytics completed: ${analysisType}`, {
        analysisType,
        period: analyticsParams.period,
        cached: !!result.cached,
        timestamp: new Date().toISOString(),
        processingTime: Date.now() - context.startTime
      });

      res.status(200).json(response);

    } catch (error) {
      logger.error(`Failed to get ticket analytics ${req.params.analysisType}:`, error);
      await this.#handleTicketError(error, req, res, 'GET_ANALYTICS');
    }
  });

  /**
   * Handle ticket workflows
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   */
  executeTicketWorkflow = asyncHandler(async (req, res, next) => {
    try {
      const { workflowType } = req.params;
      const workflowData = req.body;
      const context = this.#buildRequestContext(req);

      // Validate workflow request
      await this.#validateWorkflowRequest(workflowType, workflowData, context);

      // Execute workflow
      const result = await this.#ticketManagementService.executeTicketWorkflow(
        workflowType,
        workflowData,
        context
      );

      const response = this.#responseFormatter.success(result, `Ticket workflow executed: ${workflowType}`, {
        workflowType,
        workflowId: result.workflowId,
        stepsCompleted: result.steps?.length || 0,
        duration: result.duration,
        timestamp: new Date().toISOString()
      });

      res.status(200).json(response);

    } catch (error) {
      logger.error(`Failed to execute ticket workflow ${req.params.workflowType}:`, error);
      await this.#handleTicketError(error, req, res, 'EXECUTE_WORKFLOW');
    }
  });

  /**
   * Handle ticket queue management
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   */
  manageTicketQueue = asyncHandler(async (req, res, next) => {
    try {
      const { operation } = req.params;
      const queueData = req.body;
      const context = this.#buildRequestContext(req);

      // Validate queue operation
      await this.#validateQueueOperation(operation, queueData, context);

      let result;

      switch (operation) {
        case 'add':
          result = await this.#ticketManagementService.processTicketOperation(
            'ADD_TO_QUEUE',
            queueData,
            context
          );
          break;

        case 'remove':
          result = await this.#ticketManagementService.processTicketOperation(
            'REMOVE_FROM_QUEUE',
            queueData,
            context
          );
          break;

        case 'reorder':
          result = await this.#ticketManagementService.processTicketOperation(
            'REORDER_QUEUE',
            queueData,
            context
          );
          break;

        case 'process':
          result = await this.#ticketManagementService.processTicketOperation(
            'PROCESS_QUEUE',
            queueData,
            context
          );
          break;

        case 'transfer':
          result = await this.#ticketManagementService.processTicketOperation(
            'TRANSFER_QUEUE',
            queueData,
            context
          );
          break;

        case 'balance':
          result = await this.#ticketManagementService.processTicketOperation(
            'BALANCE_QUEUES',
            queueData,
            context
          );
          break;

        default:
          throw new AppError(`Unknown queue operation: ${operation}`, 400);
      }

      const response = this.#responseFormatter.success(result, `Queue ${operation} operation completed`, {
        operation,
        queueName: queueData.queueName,
        timestamp: new Date().toISOString()
      });

      res.status(200).json(response);

    } catch (error) {
      logger.error(`Failed to manage ticket queue ${req.params.operation}:`, error);
      await this.#handleTicketError(error, req, res, 'MANAGE_QUEUE');
    }
  });

  /**
   * Handle automation operations
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   * @returns {Promise<void>}
   */
  executeAutomation = asyncHandler(async (req, res, next) => {
    try {
      const { operation } = req.params;
      const automationData = req.body;
      const context = this.#buildRequestContext(req);

      // Validate automation request
      await this.#validateAutomationRequest(operation, automationData, context);

      let result;

      switch (operation) {
        case 'apply':
          result = await this.#ticketManagementService.processTicketOperation(
            'APPLY_AUTOMATION',
            automationData,
            context
          );
          break;

        case 'macro':
          result = await this.#ticketManagementService.processTicketOperation(
            'EXECUTE_MACRO',
            automationData,
            context
          );
          break;

        case 'schedule':
          result = await this.#ticketManagementService.processTicketOperation(
            'SCHEDULE_ACTION',
            automationData,
            context
          );
          break;

        case 'workflow':
          result = await this.#ticketManagementService.processTicketOperation(
            'TRIGGER_WORKFLOW',
            automationData,
            context
          );
          break;

        case 'template':
          result = await this.#ticketManagementService.processTicketOperation(
            'APPLY_TEMPLATE',
            automationData,
            context
          );
          break;

        case 'rules':
          result = await this.#ticketManagementService.processTicketOperation(
            'RUN_AUTOMATION_RULES',
            automationData,
            context
          );
          break;

        default:
          throw new AppError(`Unknown automation operation: ${operation}`, 400);
      }

      const response = this.#responseFormatter.success(result, `Automation ${operation} executed successfully`, {
        operation,
        automationType: automationData.type,
        timestamp: new Date().toISOString()
      });

      res.status(200).json(response);

    } catch (error) {
      logger.error(`Failed to execute automation ${req.params.operation}:`, error);
      await this.#handleTicketError(error, req, res, 'EXECUTE_AUTOMATION');
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

  async #validateTicketCreation(data, context) {
    if (!data.subject || data.subject.trim().length === 0) {
      throw new AppError('Ticket subject is required', 400);
    }

    if (data.subject.length > this.#config.validation.maxSubjectLength) {
      throw new AppError(`Subject exceeds maximum length of ${this.#config.validation.maxSubjectLength}`, 400);
    }

    if (!data.description || data.description.trim().length === 0) {
      throw new AppError('Ticket description is required', 400);
    }

    if (data.description.length > this.#config.validation.maxDescriptionLength) {
      throw new AppError(`Description exceeds maximum length of ${this.#config.validation.maxDescriptionLength}`, 400);
    }

    if (data.customFields && Object.keys(data.customFields).length > this.#config.validation.maxCustomFields) {
      throw new AppError(`Too many custom fields. Maximum ${this.#config.validation.maxCustomFields} allowed`, 400);
    }

    if (data.tags && data.tags.length > this.#config.validation.maxTagsPerTicket) {
      throw new AppError(`Too many tags. Maximum ${this.#config.validation.maxTagsPerTicket} allowed`, 400);
    }

    // Validate required permissions
    if (!context.permissions.includes('ticket.create') && !context.permissions.includes('admin.tickets')) {
      throw new AppError('Insufficient permissions to create tickets', 403);
    }

    // Sanitize inputs if security is enabled
    if (this.#config.security.sanitizeInputs) {
      data.subject = this.#sanitizeInput(data.subject);
      data.description = this.#sanitizeInput(data.description);
    }
  }

  async #validateTicketAccess(ticketId, context, operation) {
    if (!CommonValidator.isValidId(ticketId)) {
      throw new AppError('Invalid ticket ID format', 400);
    }

    // Get ticket to check access
    const ticket = await SupportTicket.findOne({ ticketId }).select('ticketReference assignment metadata');
    
    if (!ticket) {
      throw new AppError('Ticket not found', 404);
    }

    // Check organization access
    if (ticket.ticketReference.organizationId.toString() !== context.organizationId) {
      throw new AppError('Access denied: Ticket belongs to different organization', 403);
    }

    // Check operation-specific permissions
    const requiredPermissions = this.#getOperationPermissions(operation);
    const hasPermission = requiredPermissions.some(permission => 
      context.permissions.includes(permission)
    );

    if (!hasPermission) {
      throw new AppError(`Insufficient permissions for operation: ${operation}`, 403);
    }

    // Check assignment-based access for certain operations
    if (['UPDATE', 'ASSIGN', 'CLOSE'].includes(operation)) {
      const isAssigned = ticket.assignment?.currentAssignee?.userId?.toString() === context.user.id;
      const isOwner = ticket.metadata?.createdBy?.toString() === context.user.id;
      const hasAdminAccess = context.permissions.includes('admin.tickets');

      if (!isAssigned && !isOwner && !hasAdminAccess) {
        throw new AppError('Access denied: Ticket not assigned to user', 403);
      }
    }
  }

  #getOperationPermissions(operation) {
    const permissionMap = {
      'CREATE': ['ticket.create', 'admin.tickets'],
      'UPDATE': ['ticket.update', 'admin.tickets'],
      'DELETE': ['ticket.delete', 'admin.tickets'],
      'ASSIGN': ['ticket.assign', 'admin.tickets'],
      'UPDATE_STATUS': ['ticket.status.update', 'admin.tickets'],
      'UPDATE_PRIORITY': ['ticket.priority.update', 'admin.tickets'],
      'ADD_MESSAGE': ['ticket.message.add', 'admin.tickets'],
      'MANAGE_RELATIONSHIPS': ['ticket.relationships', 'admin.tickets']
    };

    return permissionMap[operation] || ['admin.super'];
  }

  async #validateTicketUpdate(data, context) {
    if (data.subject && data.subject.length > this.#config.validation.maxSubjectLength) {
      throw new AppError(`Subject exceeds maximum length of ${this.#config.validation.maxSubjectLength}`, 400);
    }

    if (data.description && data.description.length > this.#config.validation.maxDescriptionLength) {
      throw new AppError(`Description exceeds maximum length of ${this.#config.validation.maxDescriptionLength}`, 400);
    }

    if (data.customFields && Object.keys(data.customFields).length > this.#config.validation.maxCustomFields) {
      throw new AppError(`Too many custom fields. Maximum ${this.#config.validation.maxCustomFields} allowed`, 400);
    }
  }

  async #validateTicketAssignment(data, context) {
    if (data.assigneeId && !CommonValidator.isValidId(data.assigneeId)) {
      throw new AppError('Invalid assignee ID format', 400);
    }

    if (data.teamId && !CommonValidator.isValidId(data.teamId)) {
      throw new AppError('Invalid team ID format', 400);
    }

    if (!data.assigneeId && !data.teamId && data.assignmentType !== 'AUTO') {
      throw new AppError('Either assigneeId or teamId must be provided for manual assignment', 400);
    }
  }

  async #validateStatusUpdate(data, context) {
    const validStatuses = ['NEW', 'IN_PROGRESS', 'PENDING', 'RESOLVED', 'CLOSED', 'REOPENED', 'ON_HOLD', 'CANCELLED'];
    
    if (!validStatuses.includes(data.status)) {
      throw new AppError(`Invalid status. Must be one of: ${validStatuses.join(', ')}`, 400);
    }

    if (data.status === 'RESOLVED' && !data.resolutionNotes) {
      throw new AppError('Resolution notes are required when resolving a ticket', 400);
    }

    if (data.status === 'CLOSED' && !data.closeReason) {
      throw new AppError('Close reason is required when closing a ticket', 400);
    }
  }

  async #validatePriorityUpdate(data, context) {
    const validPriorities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'TRIVIAL'];
    
    if (data.priority && !validPriorities.includes(data.priority)) {
      throw new AppError(`Invalid priority. Must be one of: ${validPriorities.join(', ')}`, 400);
    }
  }

  async #validateMessageData(data, context) {
    if (!data.content || data.content.trim().length === 0) {
      throw new AppError('Message content is required', 400);
    }

    if (data.content.length > 10000) {
      throw new AppError('Message content exceeds maximum length of 10000 characters', 400);
    }

    const validMessageTypes = ['PUBLIC', 'INTERNAL', 'FORWARD'];
    if (data.messageType && !validMessageTypes.includes(data.messageType)) {
      throw new AppError(`Invalid message type. Must be one of: ${validMessageTypes.join(', ')}`, 400);
    }
  }

  async #validateRelationshipData(data, operation, context) {
    const validOperations = ['merge', 'split', 'link', 'unlink', 'create-subtask', 'convert-parent', 'detect-duplicates'];
    
    if (!validOperations.includes(operation)) {
      throw new AppError(`Invalid relationship operation: ${operation}`, 400);
    }

    if (['merge', 'link'].includes(operation) && !data.targetTicketId) {
      throw new AppError(`Target ticket ID is required for ${operation} operation`, 400);
    }

    if (data.targetTicketId && !CommonValidator.isValidId(data.targetTicketId)) {
      throw new AppError('Invalid target ticket ID format', 400);
    }
  }

  async #validateBulkOperation(operation, data, context) {
    const validOperations = ['update', 'assign', 'close', 'delete', 'transfer', 'tag', 'prioritize'];
    
    if (!validOperations.includes(operation)) {
      throw new AppError(`Invalid bulk operation: ${operation}`, 400);
    }

    if (!data.ticketIds || !Array.isArray(data.ticketIds) || data.ticketIds.length === 0) {
      throw new AppError('Ticket IDs array is required and cannot be empty', 400);
    }

    if (data.ticketIds.length > this.#config.maxBulkOperations) {
      throw new AppError(`Too many tickets. Maximum ${this.#config.maxBulkOperations} allowed per bulk operation`, 400);
    }

    for (const ticketId of data.ticketIds) {
      if (!CommonValidator.isValidId(ticketId)) {
        throw new AppError(`Invalid ticket ID format: ${ticketId}`, 400);
      }
    }
  }

  async #validateSearchParams(params, context) {
    if (params.limit && (params.limit < 1 || params.limit > this.#config.maxPageSize)) {
      throw new AppError(`Limit must be between 1 and ${this.#config.maxPageSize}`, 400);
    }

    if (params.startDate && !dateHelper.isValidDate(params.startDate)) {
      throw new AppError('Invalid start date format', 400);
    }

    if (params.endDate && !dateHelper.isValidDate(params.endDate)) {
      throw new AppError('Invalid end date format', 400);
    }
  }

  async #validateAnalyticsRequest(analysisType, params, context) {
    const validAnalysisTypes = [
      'TICKET_VOLUME', 'VOLUME_TRENDS', 'PEAK_PERIODS', 'CHANNEL_DISTRIBUTION',
      'RESPONSE_TIMES', 'RESOLUTION_RATES', 'FIRST_CONTACT_RESOLUTION', 'BACKLOG_ANALYSIS',
      'CATEGORY_DISTRIBUTION', 'PRIORITY_ANALYSIS', 'ISSUE_PATTERNS', 'RECURRING_ISSUES',
      'ASSIGNMENT_EFFICIENCY', 'WORKLOAD_BALANCE', 'HANDOFF_ANALYSIS', 'SKILL_UTILIZATION'
    ];

    if (!validAnalysisTypes.includes(analysisType)) {
      throw new AppError(`Invalid analysis type: ${analysisType}`, 400);
    }

    if (!context.permissions.includes('ticket.analytics') && !context.permissions.includes('admin.analytics')) {
      throw new AppError('Insufficient permissions for analytics access', 403);
    }
  }

  async #validateWorkflowRequest(workflowType, data, context) {
    const validWorkflowTypes = [
      'STANDARD_CREATION_WORKFLOW', 'INCIDENT_CREATION_WORKFLOW', 'SERVICE_REQUEST_WORKFLOW',
      'PROBLEM_TICKET_WORKFLOW', 'CHANGE_REQUEST_WORKFLOW', 'STANDARD_RESOLUTION_WORKFLOW',
      'QUICK_RESOLUTION_WORKFLOW', 'COMPLEX_RESOLUTION_WORKFLOW', 'ESCALATED_RESOLUTION_WORKFLOW',
      'INTELLIGENT_ASSIGNMENT_WORKFLOW', 'TEAM_ASSIGNMENT_WORKFLOW', 'SPECIALIST_ASSIGNMENT_WORKFLOW',
      'OVERFLOW_ASSIGNMENT_WORKFLOW', 'CUSTOMER_RESPONSE_WORKFLOW', 'INTERNAL_COLLABORATION_WORKFLOW',
      'MULTI_CHANNEL_WORKFLOW', 'FOLLOW_UP_WORKFLOW'
    ];

    if (!validWorkflowTypes.includes(workflowType)) {
      throw new AppError(`Invalid workflow type: ${workflowType}`, 400);
    }

    if (!context.permissions.includes('ticket.workflow') && !context.permissions.includes('admin.workflows')) {
      throw new AppError('Insufficient permissions for workflow execution', 403);
    }
  }

  async #validateQueueOperation(operation, data, context) {
    const validOperations = ['add', 'remove', 'reorder', 'process', 'transfer', 'balance'];
    
    if (!validOperations.includes(operation)) {
      throw new AppError(`Invalid queue operation: ${operation}`, 400);
    }

    if (!context.permissions.includes('ticket.queue') && !context.permissions.includes('admin.queue')) {
      throw new AppError('Insufficient permissions for queue management', 403);
    }
  }

  async #validateAutomationRequest(operation, data, context) {
    const validOperations = ['apply', 'macro', 'schedule', 'workflow', 'template', 'rules'];
    
    if (!validOperations.includes(operation)) {
      throw new AppError(`Invalid automation operation: ${operation}`, 400);
    }

    if (!context.permissions.includes('ticket.automation') && !context.permissions.includes('admin.automation')) {
      throw new AppError('Insufficient permissions for automation operations', 403);
    }
  }

  async #buildSearchCriteria(params, context) {
    const criteria = {
      filters: {},
      sort: {},
      textSearch: params.query
    };

    // Add organization filter
    criteria.filters['ticketReference.organizationId'] = context.organizationId;

    // Add basic filters
    if (params.status) criteria.filters['lifecycle.status.current'] = params.status;
    if (params.priority) criteria.filters['ticketDetails.priority.level'] = params.priority;
    if (params.category) criteria.filters['ticketDetails.category.primary'] = params.category;
    if (params.assigneeId) criteria.filters['assignment.currentAssignee.userId'] = params.assigneeId;
    if (params.teamId) criteria.filters['assignment.team.teamId'] = params.teamId;

    // Add date filters
    if (params.startDate || params.endDate) {
      criteria.filters['analytics.timeMetrics.createdAt'] = {};
      if (params.startDate) criteria.filters['analytics.timeMetrics.createdAt'].$gte = new Date(params.startDate);
      if (params.endDate) criteria.filters['analytics.timeMetrics.createdAt'].$lte = new Date(params.endDate);
    }

    // Add sorting
    const sortField = params.sortBy || 'analytics.timeMetrics.createdAt';
    const sortOrder = params.sortOrder === 'asc' ? 1 : -1;
    criteria.sort[sortField] = sortOrder;

    return criteria;
  }

  async #executeTicketSearch(criteria, context) {
    // Build MongoDB query
    let query = SupportTicket.find(criteria.filters);

    // Add text search if provided
    if (criteria.textSearch) {
      query = query.or([
        { 'ticketDetails.subject': { $regex: criteria.textSearch, $options: 'i' } },
        { 'ticketDetails.description': { $regex: criteria.textSearch, $options: 'i' } },
        { ticketId: { $regex: criteria.textSearch, $options: 'i' } }
      ]);
    }

    // Apply sorting
    query = query.sort(criteria.sort);

    // Execute query
    const tickets = await query.exec();
    const totalCount = await SupportTicket.countDocuments(criteria.filters);

    // Build aggregations
    const aggregations = await this.#buildSearchAggregations(criteria.filters);

    return {
      tickets,
      totalCount,
      aggregations
    };
  }

  async #buildSearchAggregations(filters) {
    const pipeline = [
      { $match: filters },
      {
        $facet: {
          statusCounts: [
            { $group: { _id: '$lifecycle.status.current', count: { $sum: 1 } } }
          ],
          priorityCounts: [
            { $group: { _id: '$ticketDetails.priority.level', count: { $sum: 1 } } }
          ],
          categoryCounts: [
            { $group: { _id: '$ticketDetails.category.primary', count: { $sum: 1 } } }
          ]
        }
      }
    ];

    const result = await SupportTicket.aggregate(pipeline);
    return result[0] || {};
  }

  async #checkRateLimit(operation, context) {
    const limit = this.#config.rateLimits[operation];
    if (!limit) return;

    const rateLimitKey = `rate_limit:${context.user.id}:${operation}`;
    
    // Check rate limit implementation would go here
    // This is a simplified version
    logger.debug(`Rate limit check for ${operation}: ${rateLimitKey}`);
  }

  #sanitizeInput(input) {
    if (typeof input !== 'string') return input;
    
    // Basic XSS prevention
    return input
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '');
  }

  async #handleTicketError(error, req, res, operation) {
    // Log the error
    logger.error(`Ticket operation error: ${operation}`, {
      error: error.message,
      stack: error.stack,
      operation,
      ticketId: req.params.ticketId,
      user: req.user?.id,
      ip: req.ip
    });

    // Send error notification for critical errors
    if (error.statusCode >= 500) {
      await this.#notificationService.sendNotification({
        type: 'TICKET_OPERATION_ERROR',
        severity: 'HIGH',
        message: error.message,
        data: {
          operation,
          ticketId: req.params.ticketId,
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
        ticketId: req.params.ticketId,
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id']
      }
    );

    res.status(error.statusCode || 500).json(errorResponse);
  }
}

module.exports = TicketManagementController;