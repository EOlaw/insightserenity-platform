'use strict';

/**
 * @fileoverview Maintenance operations and scheduling service
 * @module servers/admin-server/modules/platform-management/services/maintenance-service
 * @requires module:servers/admin-server/modules/platform-management/models/platform-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/services/notification-service
 * @requires module:shared/lib/security/audit/audit-service
 * @requires module:shared/lib/database/transaction-manager
 * @requires module:shared/lib/utils/helpers/date-helper
 * @requires node-cron
 */

const cron = require('node-cron');
const PlatformModel = require('../models/platform-model');
const logger = require('../../../../../shared/lib/utils/logger');
const { AppError } = require('../../../../../shared/lib/utils/app-error');
const CacheService = require('../../../../../shared/lib/services/cache-service');
const NotificationService = require('../../../../../shared/lib/services/notification-service');
const AuditService = require('../../../../../shared/lib/security/audit/audit-service');
const TransactionManager = require('../../../../../shared/lib/database/transaction-manager');
const dateHelper = require('../../../../../shared/lib/utils/helpers/date-helper');

/**
 * @class MaintenanceService
 * @description Service for managing platform maintenance windows and operations
 */
class MaintenanceService {
  /**
   * Creates an instance of MaintenanceService
   * @constructor
   */
  constructor() {
    this.#cacheService = new CacheService({
      prefix: 'maintenance:',
      ttl: 300 // 5 minutes default TTL
    });
    this.#notificationService = new NotificationService();
    this.#auditService = new AuditService();
    this.#transactionManager = new TransactionManager();
    this.#scheduledJobs = new Map();
    this.#maintenanceHandlers = new Map();
    this.#initializeDefaultHandlers();
  }

  // Private fields
  #cacheService;
  #notificationService;
  #auditService;
  #transactionManager;
  #scheduledJobs;
  #maintenanceHandlers;

  // Cache keys
  static CACHE_KEYS = {
    ACTIVE_MAINTENANCE: 'active',
    SCHEDULED_MAINTENANCE: 'scheduled',
    MAINTENANCE_HISTORY: 'history',
    MAINTENANCE_STATS: 'stats'
  };

  // Event types
  static EVENTS = {
    MAINTENANCE_SCHEDULED: 'maintenance.scheduled',
    MAINTENANCE_UPDATED: 'maintenance.updated',
    MAINTENANCE_CANCELLED: 'maintenance.cancelled',
    MAINTENANCE_STARTED: 'maintenance.started',
    MAINTENANCE_COMPLETED: 'maintenance.completed',
    MAINTENANCE_REMINDER: 'maintenance.reminder',
    MAINTENANCE_EXTENDED: 'maintenance.extended'
  };

  // Maintenance types
  static MAINTENANCE_TYPES = {
    SCHEDULED: 'scheduled',
    EMERGENCY: 'emergency'
  };

  // Maintenance status
  static MAINTENANCE_STATUS = {
    SCHEDULED: 'scheduled',
    IN_PROGRESS: 'in-progress',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled'
  };

  /**
   * Schedules a new maintenance window
   * @async
   * @param {Object} maintenanceData - Maintenance window data
   * @param {string} userId - User scheduling the maintenance
   * @returns {Promise<Object>} Scheduled maintenance window
   * @throws {AppError} If scheduling fails
   */
  async scheduleMaintenanceWindow(maintenanceData, userId) {
    const session = await this.#transactionManager.startSession();

    try {
      await session.startTransaction();

      // Validate maintenance data
      this.#validateMaintenanceData(maintenanceData);

      // Get platform based on environment
      const platform = await PlatformModel.findOne({
        'deployment.environment': maintenanceData.environment || 'production'
      }).session(session);

      if (!platform) {
        throw new AppError('Platform not found for the specified environment', 404);
      }

      // Add required fields
      maintenanceData.createdBy = userId;
      maintenanceData.status = MaintenanceService.MAINTENANCE_STATUS.SCHEDULED;

      // Check for conflicts
      await this.#checkMaintenanceConflicts(platform, maintenanceData);

      // Schedule maintenance
      const maintenance = await platform.scheduleMaintenance(maintenanceData);

      // Save platform
      await platform.save({ session });

      // Schedule automated tasks
      await this.#scheduleMaintenanceTasks(platform.platformId, maintenance);

      // Create audit entry
      await this.#auditService.log({
        userId,
        action: 'maintenance.schedule',
        resource: 'maintenance_window',
        resourceId: maintenance.id,
        details: {
          platformId: platform.platformId,
          type: maintenance.type,
          startTime: maintenance.startTime,
          endTime: maintenance.endTime,
          requiresDowntime: maintenance.requiresDowntime
        },
        session
      });

      await session.commitTransaction();

      logger.info('Maintenance window scheduled', {
        maintenanceId: maintenance.id,
        platformId: platform.platformId,
        type: maintenance.type,
        startTime: maintenance.startTime,
        userId
      });

      // Clear cache
      await this.#clearMaintenanceCache();

      // Emit event
      await this.#notificationService.emit(MaintenanceService.EVENTS.MAINTENANCE_SCHEDULED, {
        maintenance,
        platformId: platform.platformId,
        userId,
        timestamp: new Date()
      });

      // Send initial notification
      await this.#sendMaintenanceNotification(platform, maintenance, 'scheduled');

      return {
        ...maintenance,
        platformId: platform.platformId,
        environment: platform.deployment.environment
      };
    } catch (error) {
      await session.abortTransaction();
      logger.error('Failed to schedule maintenance window', {
        error: error.message,
        userId
      });
      throw error instanceof AppError ? error : new AppError(`Failed to schedule maintenance: ${error.message}`, 500);
    } finally {
      await session.endSession();
    }
  }

  /**
   * Updates a maintenance window
   * @async
   * @param {string} maintenanceId - Maintenance window ID
   * @param {Object} updates - Updates to apply
   * @param {string} userId - User updating the maintenance
   * @returns {Promise<Object>} Updated maintenance window
   * @throws {AppError} If update fails
   */
  async updateMaintenanceWindow(maintenanceId, updates, userId) {
    const session = await this.#transactionManager.startSession();

    try {
      await session.startTransaction();

      // Find platform with the maintenance window
      const platform = await PlatformModel.findOne({
        'maintenanceWindows.id': maintenanceId
      }).session(session);

      if (!platform) {
        throw new AppError('Maintenance window not found', 404);
      }

      // Get maintenance window
      const maintenance = platform.maintenanceWindows.find(m => m.id === maintenanceId);
      
      if (!maintenance) {
        throw new AppError('Maintenance window not found', 404);
      }

      // Validate status
      if (maintenance.status !== MaintenanceService.MAINTENANCE_STATUS.SCHEDULED) {
        throw new AppError('Can only update scheduled maintenance windows', 400);
      }

      // Apply updates
      const allowedUpdates = ['description', 'startTime', 'endTime', 'affectedServices', 'notes'];
      const appliedUpdates = {};

      for (const field of allowedUpdates) {
        if (updates[field] !== undefined) {
          appliedUpdates[field] = updates[field];
          maintenance[field] = updates[field];
        }
      }

      // Validate time changes
      if (updates.startTime || updates.endTime) {
        if (maintenance.startTime >= maintenance.endTime) {
          throw new AppError('End time must be after start time', 400);
        }

        // Check for new conflicts
        await this.#checkMaintenanceConflicts(platform, maintenance, maintenanceId);

        // Reschedule tasks
        await this.#cancelMaintenanceTasks(platform.platformId, maintenanceId);
        await this.#scheduleMaintenanceTasks(platform.platformId, maintenance);
      }

      // Save platform
      await platform.save({ session });

      // Create audit entry
      await this.#auditService.log({
        userId,
        action: 'maintenance.update',
        resource: 'maintenance_window',
        resourceId: maintenanceId,
        details: {
          platformId: platform.platformId,
          updates: Object.keys(appliedUpdates)
        },
        session
      });

      await session.commitTransaction();

      logger.info('Maintenance window updated', {
        maintenanceId,
        platformId: platform.platformId,
        updates: Object.keys(appliedUpdates),
        userId
      });

      // Clear cache
      await this.#clearMaintenanceCache();

      // Emit event
      await this.#notificationService.emit(MaintenanceService.EVENTS.MAINTENANCE_UPDATED, {
        maintenance: maintenance.toObject(),
        updates: appliedUpdates,
        platformId: platform.platformId,
        userId,
        timestamp: new Date()
      });

      // Send update notification
      if (updates.startTime || updates.endTime) {
        await this.#sendMaintenanceNotification(platform, maintenance, 'rescheduled');
      }

      return {
        ...maintenance.toObject(),
        platformId: platform.platformId,
        environment: platform.deployment.environment
      };
    } catch (error) {
      await session.abortTransaction();
      logger.error('Failed to update maintenance window', {
        maintenanceId,
        error: error.message
      });
      throw error instanceof AppError ? error : new AppError(`Failed to update maintenance: ${error.message}`, 500);
    } finally {
      await session.endSession();
    }
  }

  /**
   * Cancels a maintenance window
   * @async
   * @param {string} maintenanceId - Maintenance window ID
   * @param {Object} cancellationData - Cancellation details
   * @param {string} userId - User cancelling the maintenance
   * @returns {Promise<Object>} Cancelled maintenance window
   * @throws {AppError} If cancellation fails
   */
  async cancelMaintenanceWindow(maintenanceId, cancellationData, userId) {
    const session = await this.#transactionManager.startSession();

    try {
      await session.startTransaction();

      // Find platform with the maintenance window
      const platform = await PlatformModel.findOne({
        'maintenanceWindows.id': maintenanceId
      }).session(session);

      if (!platform) {
        throw new AppError('Maintenance window not found', 404);
      }

      // Get maintenance window
      const maintenance = platform.maintenanceWindows.find(m => m.id === maintenanceId);
      
      if (!maintenance) {
        throw new AppError('Maintenance window not found', 404);
      }

      // Validate status
      if (maintenance.status === MaintenanceService.MAINTENANCE_STATUS.COMPLETED) {
        throw new AppError('Cannot cancel completed maintenance', 400);
      }

      if (maintenance.status === MaintenanceService.MAINTENANCE_STATUS.CANCELLED) {
        throw new AppError('Maintenance already cancelled', 400);
      }

      // Update status
      maintenance.status = MaintenanceService.MAINTENANCE_STATUS.CANCELLED;
      maintenance.notes = `${maintenance.notes || ''}\nCancelled: ${cancellationData.reason}`.trim();
      
      // Save platform
      await platform.save({ session });

      // Cancel scheduled tasks
      await this.#cancelMaintenanceTasks(platform.platformId, maintenanceId);

      // Create audit entry
      await this.#auditService.log({
        userId,
        action: 'maintenance.cancel',
        resource: 'maintenance_window',
        resourceId: maintenanceId,
        details: {
          platformId: platform.platformId,
          reason: cancellationData.reason,
          wasInProgress: maintenance.status === MaintenanceService.MAINTENANCE_STATUS.IN_PROGRESS
        },
        session
      });

      await session.commitTransaction();

      logger.info('Maintenance window cancelled', {
        maintenanceId,
        platformId: platform.platformId,
        reason: cancellationData.reason,
        userId
      });

      // Clear cache
      await this.#clearMaintenanceCache();

      // Emit event
      await this.#notificationService.emit(MaintenanceService.EVENTS.MAINTENANCE_CANCELLED, {
        maintenance: maintenance.toObject(),
        reason: cancellationData.reason,
        platformId: platform.platformId,
        userId,
        timestamp: new Date()
      });

      // Send cancellation notification
      await this.#sendMaintenanceNotification(platform, maintenance, 'cancelled', cancellationData.reason);

      return {
        ...maintenance.toObject(),
        platformId: platform.platformId,
        environment: platform.deployment.environment
      };
    } catch (error) {
      await session.abortTransaction();
      logger.error('Failed to cancel maintenance window', {
        maintenanceId,
        error: error.message
      });
      throw error instanceof AppError ? error : new AppError(`Failed to cancel maintenance: ${error.message}`, 500);
    } finally {
      await session.endSession();
    }
  }

  /**
   * Starts a maintenance window
   * @async
   * @param {string} maintenanceId - Maintenance window ID
   * @param {string} userId - User starting the maintenance
   * @returns {Promise<Object>} Started maintenance window
   * @throws {AppError} If start fails
   */
  async startMaintenanceWindow(maintenanceId, userId) {
    const session = await this.#transactionManager.startSession();

    try {
      await session.startTransaction();

      // Find platform with the maintenance window
      const platform = await PlatformModel.findOne({
        'maintenanceWindows.id': maintenanceId
      }).session(session);

      if (!platform) {
        throw new AppError('Maintenance window not found', 404);
      }

      // Get maintenance window
      const maintenance = platform.maintenanceWindows.find(m => m.id === maintenanceId);
      
      if (!maintenance) {
        throw new AppError('Maintenance window not found', 404);
      }

      // Validate status
      if (maintenance.status !== MaintenanceService.MAINTENANCE_STATUS.SCHEDULED) {
        throw new AppError('Can only start scheduled maintenance', 400);
      }

      // Update status
      maintenance.status = MaintenanceService.MAINTENANCE_STATUS.IN_PROGRESS;
      
      // Execute pre-maintenance tasks
      await this.#executePreMaintenanceTasks(platform, maintenance);

      // Save platform
      await platform.save({ session });

      // Create audit entry
      await this.#auditService.log({
        userId,
        action: 'maintenance.start',
        resource: 'maintenance_window',
        resourceId: maintenanceId,
        details: {
          platformId: platform.platformId,
          actualStartTime: new Date(),
          scheduledStartTime: maintenance.startTime
        },
        session
      });

      await session.commitTransaction();

      logger.info('Maintenance window started', {
        maintenanceId,
        platformId: platform.platformId,
        userId
      });

      // Clear cache
      await this.#clearMaintenanceCache();

      // Update platform status cache
      await this.#cacheService.set(
        `platform:status:${platform.platformId}`,
        { inMaintenance: true },
        maintenance.endTime - Date.now()
      );

      // Emit event
      await this.#notificationService.emit(MaintenanceService.EVENTS.MAINTENANCE_STARTED, {
        maintenance: maintenance.toObject(),
        platformId: platform.platformId,
        userId,
        timestamp: new Date()
      });

      // Send notification
      await this.#sendMaintenanceNotification(platform, maintenance, 'started');

      return {
        ...maintenance.toObject(),
        platformId: platform.platformId,
        environment: platform.deployment.environment
      };
    } catch (error) {
      await session.abortTransaction();
      logger.error('Failed to start maintenance window', {
        maintenanceId,
        error: error.message
      });
      throw error instanceof AppError ? error : new AppError(`Failed to start maintenance: ${error.message}`, 500);
    } finally {
      await session.endSession();
    }
  }

  /**
   * Completes a maintenance window
   * @async
   * @param {string} maintenanceId - Maintenance window ID
   * @param {Object} completionData - Completion details
   * @param {string} userId - User completing the maintenance
   * @returns {Promise<Object>} Completed maintenance window
   * @throws {AppError} If completion fails
   */
  async completeMaintenanceWindow(maintenanceId, completionData, userId) {
    const session = await this.#transactionManager.startSession();

    try {
      await session.startTransaction();

      // Find platform with the maintenance window
      const platform = await PlatformModel.findOne({
        'maintenanceWindows.id': maintenanceId
      }).session(session);

      if (!platform) {
        throw new AppError('Maintenance window not found', 404);
      }

      // Get maintenance window
      const maintenance = platform.maintenanceWindows.find(m => m.id === maintenanceId);
      
      if (!maintenance) {
        throw new AppError('Maintenance window not found', 404);
      }

      // Validate status
      if (maintenance.status !== MaintenanceService.MAINTENANCE_STATUS.IN_PROGRESS) {
        throw new AppError('Can only complete in-progress maintenance', 400);
      }

      // Update maintenance
      maintenance.status = MaintenanceService.MAINTENANCE_STATUS.COMPLETED;
      maintenance.completedAt = new Date();
      maintenance.notes = `${maintenance.notes || ''}\n${completionData.summary || ''}`.trim();

      // Execute post-maintenance tasks
      await this.#executePostMaintenanceTasks(platform, maintenance, completionData);

      // Save platform
      await platform.save({ session });

      // Create audit entry
      await this.#auditService.log({
        userId,
        action: 'maintenance.complete',
        resource: 'maintenance_window',
        resourceId: maintenanceId,
        details: {
          platformId: platform.platformId,
          duration: maintenance.completedAt - maintenance.startTime,
          summary: completionData.summary
        },
        session
      });

      await session.commitTransaction();

      logger.info('Maintenance window completed', {
        maintenanceId,
        platformId: platform.platformId,
        duration: maintenance.completedAt - maintenance.startTime,
        userId
      });

      // Clear cache
      await this.#clearMaintenanceCache();

      // Update platform status cache
      await this.#cacheService.delete(`platform:status:${platform.platformId}`);

      // Emit event
      await this.#notificationService.emit(MaintenanceService.EVENTS.MAINTENANCE_COMPLETED, {
        maintenance: maintenance.toObject(),
        completionData,
        platformId: platform.platformId,
        userId,
        timestamp: new Date()
      });

      // Send completion notification
      await this.#sendMaintenanceNotification(platform, maintenance, 'completed');

      // Generate maintenance report
      const report = await this.#generateMaintenanceReport(platform, maintenance, completionData);

      return {
        ...maintenance.toObject(),
        platformId: platform.platformId,
        environment: platform.deployment.environment,
        report
      };
    } catch (error) {
      await session.abortTransaction();
      logger.error('Failed to complete maintenance window', {
        maintenanceId,
        error: error.message
      });
      throw error instanceof AppError ? error : new AppError(`Failed to complete maintenance: ${error.message}`, 500);
    } finally {
      await session.endSession();
    }
  }

  /**
   * Extends a maintenance window
   * @async
   * @param {string} maintenanceId - Maintenance window ID
   * @param {Object} extensionData - Extension details
   * @param {string} userId - User extending the maintenance
   * @returns {Promise<Object>} Extended maintenance window
   * @throws {AppError} If extension fails
   */
  async extendMaintenanceWindow(maintenanceId, extensionData, userId) {
    const session = await this.#transactionManager.startSession();

    try {
      await session.startTransaction();

      // Find platform with the maintenance window
      const platform = await PlatformModel.findOne({
        'maintenanceWindows.id': maintenanceId
      }).session(session);

      if (!platform) {
        throw new AppError('Maintenance window not found', 404);
      }

      // Get maintenance window
      const maintenance = platform.maintenanceWindows.find(m => m.id === maintenanceId);
      
      if (!maintenance) {
        throw new AppError('Maintenance window not found', 404);
      }

      // Validate status
      if (maintenance.status !== MaintenanceService.MAINTENANCE_STATUS.IN_PROGRESS) {
        throw new AppError('Can only extend in-progress maintenance', 400);
      }

      // Calculate new end time
      const originalEndTime = new Date(maintenance.endTime);
      const newEndTime = new Date(originalEndTime.getTime() + extensionData.extensionMinutes * 60 * 1000);

      // Check for conflicts with new end time
      const tempMaintenance = { ...maintenance, endTime: newEndTime };
      await this.#checkMaintenanceConflicts(platform, tempMaintenance, maintenanceId);

      // Update maintenance
      maintenance.endTime = newEndTime;
      maintenance.notes = `${maintenance.notes || ''}\nExtended by ${extensionData.extensionMinutes} minutes: ${extensionData.reason}`.trim();

      // Save platform
      await platform.save({ session });

      // Reschedule completion tasks
      await this.#rescheduleCompletionTasks(platform.platformId, maintenance);

      // Create audit entry
      await this.#auditService.log({
        userId,
        action: 'maintenance.extend',
        resource: 'maintenance_window',
        resourceId: maintenanceId,
        details: {
          platformId: platform.platformId,
          originalEndTime,
          newEndTime,
          extensionMinutes: extensionData.extensionMinutes,
          reason: extensionData.reason
        },
        session
      });

      await session.commitTransaction();

      logger.info('Maintenance window extended', {
        maintenanceId,
        platformId: platform.platformId,
        extensionMinutes: extensionData.extensionMinutes,
        userId
      });

      // Clear cache
      await this.#clearMaintenanceCache();

      // Update platform status cache
      await this.#cacheService.set(
        `platform:status:${platform.platformId}`,
        { inMaintenance: true },
        newEndTime - Date.now()
      );

      // Emit event
      await this.#notificationService.emit(MaintenanceService.EVENTS.MAINTENANCE_EXTENDED, {
        maintenance: maintenance.toObject(),
        extensionData,
        platformId: platform.platformId,
        userId,
        timestamp: new Date()
      });

      // Send extension notification
      await this.#sendMaintenanceNotification(
        platform, 
        maintenance, 
        'extended',
        `Extended by ${extensionData.extensionMinutes} minutes`
      );

      return {
        ...maintenance.toObject(),
        platformId: platform.platformId,
        environment: platform.deployment.environment
      };
    } catch (error) {
      await session.abortTransaction();
      logger.error('Failed to extend maintenance window', {
        maintenanceId,
        error: error.message
      });
      throw error instanceof AppError ? error : new AppError(`Failed to extend maintenance: ${error.message}`, 500);
    } finally {
      await session.endSession();
    }
  }

  /**
   * Gets active maintenance windows
   * @async
   * @param {Object} [filters={}] - Query filters
   * @returns {Promise<Array>} Active maintenance windows
   */
  async getActiveMaintenanceWindows(filters = {}) {
    try {
      const { environment, fromCache = true } = filters;

      // Try cache first
      if (fromCache) {
        const cacheKey = `${MaintenanceService.CACHE_KEYS.ACTIVE_MAINTENANCE}:${environment || 'all'}`;
        const cached = await this.#cacheService.get(cacheKey);
        if (cached) {
          return cached;
        }
      }

      // Build query
      const query = {
        'status.operational': true
      };

      if (environment) {
        query['deployment.environment'] = environment;
      }

      // Get platforms
      const platforms = await PlatformModel.find(query)
        .select('platformId deployment.environment maintenanceWindows')
        .lean();

      // Extract active maintenance windows
      const activeWindows = [];
      const now = new Date();

      for (const platform of platforms) {
        for (const window of platform.maintenanceWindows || []) {
          if (
            window.status === MaintenanceService.MAINTENANCE_STATUS.IN_PROGRESS ||
            (window.status === MaintenanceService.MAINTENANCE_STATUS.SCHEDULED && 
             window.startTime <= now && window.endTime >= now)
          ) {
            activeWindows.push({
              ...window,
              platformId: platform.platformId,
              environment: platform.deployment.environment
            });
          }
        }
      }

      // Sort by start time
      activeWindows.sort((a, b) => a.startTime - b.startTime);

      // Cache result
      if (fromCache) {
        const cacheKey = `${MaintenanceService.CACHE_KEYS.ACTIVE_MAINTENANCE}:${environment || 'all'}`;
        await this.#cacheService.set(cacheKey, activeWindows, 60); // 1 minute
      }

      return activeWindows;
    } catch (error) {
      logger.error('Failed to get active maintenance windows', {
        filters,
        error: error.message
      });
      throw new AppError(`Failed to get active maintenance windows: ${error.message}`, 500);
    }
  }

  /**
   * Gets scheduled maintenance windows
   * @async
   * @param {Object} [filters={}] - Query filters
   * @returns {Promise<Object>} Scheduled maintenance windows with pagination
   */
  async getScheduledMaintenanceWindows(filters = {}) {
    try {
      const {
        environment,
        startDate = new Date(),
        endDate,
        page = 1,
        limit = 20,
        fromCache = true
      } = filters;

      // Try cache first
      if (fromCache && page === 1) {
        const cacheKey = `${MaintenanceService.CACHE_KEYS.SCHEDULED_MAINTENANCE}:${environment || 'all'}`;
        const cached = await this.#cacheService.get(cacheKey);
        if (cached) {
          return cached;
        }
      }

      // Build query
      const query = {
        'status.operational': true,
        'maintenanceWindows': {
          $elemMatch: {
            status: MaintenanceService.MAINTENANCE_STATUS.SCHEDULED,
            startTime: { $gte: startDate }
          }
        }
      };

      if (environment) {
        query['deployment.environment'] = environment;
      }

      if (endDate) {
        query['maintenanceWindows'].$elemMatch.startTime.$lte = endDate;
      }

      // Get platforms
      const platforms = await PlatformModel.find(query)
        .select('platformId deployment.environment maintenanceWindows')
        .lean();

      // Extract scheduled maintenance windows
      const scheduledWindows = [];

      for (const platform of platforms) {
        for (const window of platform.maintenanceWindows || []) {
          if (
            window.status === MaintenanceService.MAINTENANCE_STATUS.SCHEDULED &&
            window.startTime >= startDate &&
            (!endDate || window.startTime <= endDate)
          ) {
            scheduledWindows.push({
              ...window,
              platformId: platform.platformId,
              environment: platform.deployment.environment
            });
          }
        }
      }

      // Sort by start time
      scheduledWindows.sort((a, b) => a.startTime - b.startTime);

      // Paginate
      const total = scheduledWindows.length;
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedWindows = scheduledWindows.slice(startIndex, endIndex);

      const result = {
        maintenanceWindows: paginatedWindows,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit)
        }
      };

      // Cache first page
      if (fromCache && page === 1) {
        const cacheKey = `${MaintenanceService.CACHE_KEYS.SCHEDULED_MAINTENANCE}:${environment || 'all'}`;
        await this.#cacheService.set(cacheKey, result, 300); // 5 minutes
      }

      return result;
    } catch (error) {
      logger.error('Failed to get scheduled maintenance windows', {
        filters,
        error: error.message
      });
      throw new AppError(`Failed to get scheduled maintenance windows: ${error.message}`, 500);
    }
  }

  /**
   * Gets maintenance history
   * @async
   * @param {Object} [filters={}] - Query filters
   * @returns {Promise<Object>} Maintenance history with pagination
   */
  async getMaintenanceHistory(filters = {}) {
    try {
      const {
        environment,
        platformId,
        status,
        startDate,
        endDate,
        page = 1,
        limit = 50
      } = filters;

      // Build query
      const query = {};

      if (environment) {
        query['deployment.environment'] = environment;
      }

      if (platformId) {
        query.platformId = platformId;
      }

      // Get platforms
      const platforms = await PlatformModel.find(query)
        .select('platformId deployment.environment maintenanceWindows')
        .lean();

      // Extract maintenance history
      const allWindows = [];

      for (const platform of platforms) {
        for (const window of platform.maintenanceWindows || []) {
          // Apply filters
          if (status && window.status !== status) continue;
          if (startDate && window.startTime < startDate) continue;
          if (endDate && window.startTime > endDate) continue;

          allWindows.push({
            ...window,
            platformId: platform.platformId,
            environment: platform.deployment.environment,
            duration: window.completedAt ? 
              window.completedAt - window.startTime : 
              window.endTime - window.startTime
          });
        }
      }

      // Sort by start time (descending)
      allWindows.sort((a, b) => b.startTime - a.startTime);

      // Paginate
      const total = allWindows.length;
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedWindows = allWindows.slice(startIndex, endIndex);

      return {
        maintenanceWindows: paginatedWindows,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      logger.error('Failed to get maintenance history', {
        filters,
        error: error.message
      });
      throw new AppError(`Failed to get maintenance history: ${error.message}`, 500);
    }
  }

  /**
   * Gets maintenance statistics
   * @async
   * @param {Object} [options={}] - Statistics options
   * @returns {Promise<Object>} Maintenance statistics
   */
  async getMaintenanceStatistics(options = {}) {
    try {
      const {
        environment,
        startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // Last 90 days
        endDate = new Date(),
        fromCache = true
      } = options;

      // Try cache first
      if (fromCache) {
        const cacheKey = `${MaintenanceService.CACHE_KEYS.MAINTENANCE_STATS}:${environment || 'all'}`;
        const cached = await this.#cacheService.get(cacheKey);
        if (cached) {
          return cached;
        }
      }

      // Build query
      const query = {};
      if (environment) {
        query['deployment.environment'] = environment;
      }

      // Get platforms
      const platforms = await PlatformModel.find(query)
        .select('maintenanceWindows')
        .lean();

      // Calculate statistics
      const stats = {
        period: { startDate, endDate },
        total: 0,
        byStatus: {
          scheduled: 0,
          inProgress: 0,
          completed: 0,
          cancelled: 0
        },
        byType: {
          scheduled: 0,
          emergency: 0
        },
        averageDuration: 0,
        totalDowntime: 0,
        affectedServices: new Set(),
        completionRate: 0,
        monthlyBreakdown: {}
      };

      let totalDuration = 0;
      let completedCount = 0;

      for (const platform of platforms) {
        for (const window of platform.maintenanceWindows || []) {
          // Filter by date range
          if (window.startTime < startDate || window.startTime > endDate) continue;

          stats.total++;
          stats.byStatus[window.status]++;
          stats.byType[window.type]++;

          // Add affected services
          if (window.affectedServices) {
            window.affectedServices.forEach(service => stats.affectedServices.add(service));
          }

          // Calculate durations
          if (window.status === MaintenanceService.MAINTENANCE_STATUS.COMPLETED && window.completedAt) {
            const duration = window.completedAt - window.startTime;
            totalDuration += duration;
            completedCount++;

            if (window.requiresDowntime) {
              stats.totalDowntime += duration;
            }
          }

          // Monthly breakdown
          const monthKey = window.startTime.toISOString().substring(0, 7);
          if (!stats.monthlyBreakdown[monthKey]) {
            stats.monthlyBreakdown[monthKey] = {
              total: 0,
              completed: 0,
              cancelled: 0,
              totalDuration: 0
            };
          }
          stats.monthlyBreakdown[monthKey].total++;
          stats.monthlyBreakdown[monthKey][window.status]++;
        }
      }

      // Calculate averages
      if (completedCount > 0) {
        stats.averageDuration = Math.round(totalDuration / completedCount);
      }

      if (stats.total > 0) {
        stats.completionRate = Math.round((stats.byStatus.completed / stats.total) * 100);
      }

      // Convert Set to Array
      stats.affectedServices = Array.from(stats.affectedServices);

      // Cache result
      if (fromCache) {
        const cacheKey = `${MaintenanceService.CACHE_KEYS.MAINTENANCE_STATS}:${environment || 'all'}`;
        await this.#cacheService.set(cacheKey, stats, 3600); // 1 hour
      }

      return stats;
    } catch (error) {
      logger.error('Failed to get maintenance statistics', {
        options,
        error: error.message
      });
      throw new AppError(`Failed to get maintenance statistics: ${error.message}`, 500);
    }
  }

  /**
   * Registers a maintenance handler
   * @param {string} handlerName - Handler name
   * @param {Object} handler - Handler implementation
   */
  registerMaintenanceHandler(handlerName, handler) {
    if (!handler.preMaintenanceTasks || !handler.postMaintenanceTasks) {
      throw new AppError('Maintenance handler must implement preMaintenanceTasks and postMaintenanceTasks', 400);
    }

    this.#maintenanceHandlers.set(handlerName, handler);
    
    logger.info('Maintenance handler registered', { handlerName });
  }

  /**
   * Checks if system is currently in maintenance
   * @async
   * @param {string} [platformId] - Optional platform ID
   * @returns {Promise<boolean>} Whether system is in maintenance
   */
  async isInMaintenance(platformId) {
    try {
      // Check cache first
      if (platformId) {
        const status = await this.#cacheService.get(`platform:status:${platformId}`);
        if (status && status.inMaintenance) {
          return true;
        }
      }

      // Check active maintenance windows
      const activeWindows = await this.getActiveMaintenanceWindows({
        fromCache: false
      });

      if (platformId) {
        return activeWindows.some(w => w.platformId === platformId);
      }

      return activeWindows.length > 0;
    } catch (error) {
      logger.error('Failed to check maintenance status', {
        platformId,
        error: error.message
      });
      return false;
    }
  }

  // Private helper methods

  /**
   * Initializes default maintenance handlers
   * @private
   */
  #initializeDefaultHandlers() {
    // Database maintenance handler
    this.registerMaintenanceHandler('database', {
      preMaintenanceTasks: async (platform, maintenance) => {
        logger.info('Executing database pre-maintenance tasks', {
          maintenanceId: maintenance.id
        });
        // In production: backup database, disable writes, etc.
      },
      postMaintenanceTasks: async (platform, maintenance, completionData) => {
        logger.info('Executing database post-maintenance tasks', {
          maintenanceId: maintenance.id
        });
        // In production: verify integrity, enable writes, etc.
      }
    });

    // Cache maintenance handler
    this.registerMaintenanceHandler('cache', {
      preMaintenanceTasks: async (platform, maintenance) => {
        logger.info('Executing cache pre-maintenance tasks', {
          maintenanceId: maintenance.id
        });
        // In production: warm cache, save state, etc.
      },
      postMaintenanceTasks: async (platform, maintenance, completionData) => {
        logger.info('Executing cache post-maintenance tasks', {
          maintenanceId: maintenance.id
        });
        // In production: clear cache, rebuild, etc.
      }
    });
  }

  /**
   * Validates maintenance data
   * @private
   * @param {Object} maintenanceData - Maintenance data to validate
   * @throws {AppError} If validation fails
   */
  #validateMaintenanceData(maintenanceData) {
    const { startTime, endTime, type, description, affectedServices } = maintenanceData;

    // Validate required fields
    if (!startTime || !endTime || !type || !description) {
      throw new AppError('Missing required maintenance fields', 400);
    }

    // Validate times
    const start = new Date(startTime);
    const end = new Date(endTime);
    const now = new Date();

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new AppError('Invalid date format', 400);
    }

    if (start >= end) {
      throw new AppError('End time must be after start time', 400);
    }

    if (type === MaintenanceService.MAINTENANCE_TYPES.SCHEDULED && start < now) {
      throw new AppError('Scheduled maintenance must be in the future', 400);
    }

    // Validate duration
    const duration = end - start;
    const maxDuration = 24 * 60 * 60 * 1000; // 24 hours

    if (duration > maxDuration) {
      throw new AppError('Maintenance window cannot exceed 24 hours', 400);
    }

    // Validate affected services
    if (affectedServices && !Array.isArray(affectedServices)) {
      throw new AppError('Affected services must be an array', 400);
    }
  }

  /**
   * Checks for maintenance conflicts
   * @private
   * @param {Object} platform - Platform instance
   * @param {Object} maintenanceData - Maintenance data
   * @param {string} [excludeId] - Maintenance ID to exclude
   * @throws {AppError} If conflicts found
   */
  async #checkMaintenanceConflicts(platform, maintenanceData, excludeId) {
    const { startTime, endTime } = maintenanceData;

    for (const window of platform.maintenanceWindows) {
      // Skip if excluded or not active
      if (window.id === excludeId) continue;
      if (window.status === MaintenanceService.MAINTENANCE_STATUS.CANCELLED) continue;
      if (window.status === MaintenanceService.MAINTENANCE_STATUS.COMPLETED) continue;

      // Check for overlap
      if (
        (startTime >= window.startTime && startTime < window.endTime) ||
        (endTime > window.startTime && endTime <= window.endTime) ||
        (startTime <= window.startTime && endTime >= window.endTime)
      ) {
        throw new AppError(
          `Conflicts with existing maintenance window (${window.id}) scheduled from ${window.startTime} to ${window.endTime}`,
          409
        );
      }
    }
  }

  /**
   * Schedules maintenance tasks
   * @private
   * @param {string} platformId - Platform ID
   * @param {Object} maintenance - Maintenance window
   * @returns {Promise<void>}
   */
  async #scheduleMaintenanceTasks(platformId, maintenance) {
    const jobKey = `${platformId}:${maintenance.id}`;

    // Schedule start task
    const startTime = new Date(maintenance.startTime);
    if (startTime > new Date()) {
      const startJob = cron.schedule(
        this.#dateToCron(startTime),
        async () => {
          try {
            await this.startMaintenanceWindow(maintenance.id, 'system');
          } catch (error) {
            logger.error('Failed to auto-start maintenance', {
              maintenanceId: maintenance.id,
              error: error.message
            });
          }
        },
        { scheduled: false }
      );

      startJob.start();
      this.#scheduledJobs.set(`${jobKey}:start`, startJob);
    }

    // Schedule reminder notifications
    if (maintenance.notifications?.enabled) {
      for (const minutes of maintenance.notifications.advanceMinutes) {
        const reminderTime = new Date(startTime.getTime() - minutes * 60 * 1000);
        
        if (reminderTime > new Date()) {
          const reminderJob = cron.schedule(
            this.#dateToCron(reminderTime),
            async () => {
              try {
                await this.#sendMaintenanceReminder(platformId, maintenance, minutes);
              } catch (error) {
                logger.error('Failed to send maintenance reminder', {
                  maintenanceId: maintenance.id,
                  error: error.message
                });
              }
            },
            { scheduled: false }
          );

          reminderJob.start();
          this.#scheduledJobs.set(`${jobKey}:reminder:${minutes}`, reminderJob);
        }
      }
    }
  }

  /**
   * Cancels scheduled maintenance tasks
   * @private
   * @param {string} platformId - Platform ID
   * @param {string} maintenanceId - Maintenance ID
   * @returns {Promise<void>}
   */
  async #cancelMaintenanceTasks(platformId, maintenanceId) {
    const jobKeyPrefix = `${platformId}:${maintenanceId}`;

    for (const [key, job] of this.#scheduledJobs) {
      if (key.startsWith(jobKeyPrefix)) {
        job.stop();
        this.#scheduledJobs.delete(key);
      }
    }
  }

  /**
   * Reschedules completion tasks
   * @private
   * @param {string} platformId - Platform ID
   * @param {Object} maintenance - Maintenance window
   * @returns {Promise<void>}
   */
  async #rescheduleCompletionTasks(platformId, maintenance) {
    const jobKey = `${platformId}:${maintenance.id}:completion`;

    // Cancel existing completion task
    const existingJob = this.#scheduledJobs.get(jobKey);
    if (existingJob) {
      existingJob.stop();
      this.#scheduledJobs.delete(jobKey);
    }

    // Schedule new completion reminder
    const reminderTime = new Date(maintenance.endTime.getTime() - 5 * 60 * 1000); // 5 minutes before end
    
    if (reminderTime > new Date()) {
      const completionJob = cron.schedule(
        this.#dateToCron(reminderTime),
        async () => {
          try {
            await this.#sendCompletionReminder(platformId, maintenance);
          } catch (error) {
            logger.error('Failed to send completion reminder', {
              maintenanceId: maintenance.id,
              error: error.message
            });
          }
        },
        { scheduled: false }
      );

      completionJob.start();
      this.#scheduledJobs.set(jobKey, completionJob);
    }
  }

  /**
   * Executes pre-maintenance tasks
   * @private
   * @param {Object} platform - Platform instance
   * @param {Object} maintenance - Maintenance window
   * @returns {Promise<void>}
   */
  async #executePreMaintenanceTasks(platform, maintenance) {
    logger.info('Executing pre-maintenance tasks', {
      maintenanceId: maintenance.id,
      affectedServices: maintenance.affectedServices
    });

    // Execute handler tasks for affected services
    for (const service of maintenance.affectedServices || []) {
      const handler = this.#maintenanceHandlers.get(service);
      if (handler && handler.preMaintenanceTasks) {
        try {
          await handler.preMaintenanceTasks(platform, maintenance);
        } catch (error) {
          logger.error('Pre-maintenance task failed', {
            maintenanceId: maintenance.id,
            service,
            error: error.message
          });
        }
      }
    }

    // Set platform to maintenance mode if required
    if (maintenance.requiresDowntime) {
      // In production: enable maintenance mode, redirect traffic, etc.
      logger.info('Platform entering maintenance mode', {
        platformId: platform.platformId
      });
    }
  }

  /**
   * Executes post-maintenance tasks
   * @private
   * @param {Object} platform - Platform instance
   * @param {Object} maintenance - Maintenance window
   * @param {Object} completionData - Completion data
   * @returns {Promise<void>}
   */
  async #executePostMaintenanceTasks(platform, maintenance, completionData) {
    logger.info('Executing post-maintenance tasks', {
      maintenanceId: maintenance.id,
      affectedServices: maintenance.affectedServices
    });

    // Execute handler tasks for affected services
    for (const service of maintenance.affectedServices || []) {
      const handler = this.#maintenanceHandlers.get(service);
      if (handler && handler.postMaintenanceTasks) {
        try {
          await handler.postMaintenanceTasks(platform, maintenance, completionData);
        } catch (error) {
          logger.error('Post-maintenance task failed', {
            maintenanceId: maintenance.id,
            service,
            error: error.message
          });
        }
      }
    }

    // Exit maintenance mode if required
    if (maintenance.requiresDowntime) {
      // In production: disable maintenance mode, restore traffic, etc.
      logger.info('Platform exiting maintenance mode', {
        platformId: platform.platformId
      });
    }
  }

  /**
   * Sends maintenance notification
   * @private
   * @param {Object} platform - Platform instance
   * @param {Object} maintenance - Maintenance window
   * @param {string} type - Notification type
   * @param {string} [additionalInfo] - Additional information
   * @returns {Promise<void>}
   */
  async #sendMaintenanceNotification(platform, maintenance, type, additionalInfo) {
    try {
      const templates = {
        scheduled: {
          title: 'Maintenance Scheduled',
          message: `Scheduled maintenance: ${maintenance.description}`,
          details: `From ${maintenance.startTime} to ${maintenance.endTime}`
        },
        rescheduled: {
          title: 'Maintenance Rescheduled',
          message: `Maintenance has been rescheduled: ${maintenance.description}`,
          details: `New time: ${maintenance.startTime} to ${maintenance.endTime}`
        },
        cancelled: {
          title: 'Maintenance Cancelled',
          message: `Maintenance has been cancelled: ${maintenance.description}`,
          details: additionalInfo || 'The scheduled maintenance window has been cancelled'
        },
        started: {
          title: 'Maintenance Started',
          message: `Maintenance is now in progress: ${maintenance.description}`,
          details: `Expected completion: ${maintenance.endTime}`
        },
        completed: {
          title: 'Maintenance Completed',
          message: `Maintenance has been completed: ${maintenance.description}`,
          details: 'All systems are now operational'
        },
        extended: {
          title: 'Maintenance Extended',
          message: `Maintenance window has been extended: ${maintenance.description}`,
          details: additionalInfo || `New end time: ${maintenance.endTime}`
        }
      };

      const template = templates[type];
      if (!template) return;

      await this.#notificationService.sendToAll({
        type: `maintenance.${type}`,
        title: template.title,
        message: template.message,
        severity: maintenance.requiresDowntime ? 'high' : 'medium',
        data: {
          platformId: platform.platformId,
          maintenanceId: maintenance.id,
          type: maintenance.type,
          startTime: maintenance.startTime,
          endTime: maintenance.endTime,
          affectedServices: maintenance.affectedServices,
          details: template.details
        }
      });
    } catch (error) {
      logger.error('Failed to send maintenance notification', {
        maintenanceId: maintenance.id,
        type,
        error: error.message
      });
    }
  }

  /**
   * Sends maintenance reminder
   * @private
   * @param {string} platformId - Platform ID
   * @param {Object} maintenance - Maintenance window
   * @param {number} advanceMinutes - Minutes in advance
   * @returns {Promise<void>}
   */
  async #sendMaintenanceReminder(platformId, maintenance, advanceMinutes) {
    const platform = await PlatformModel.findOne({ platformId });
    if (!platform) return;

    const timeLabel = advanceMinutes >= 60 ? 
      `${Math.floor(advanceMinutes / 60)} hour(s)` : 
      `${advanceMinutes} minutes`;

    await this.#notificationService.sendToAll({
      type: 'maintenance.reminder',
      title: `Maintenance Starting in ${timeLabel}`,
      message: maintenance.description,
      severity: maintenance.requiresDowntime ? 'high' : 'medium',
      data: {
        platformId,
        maintenanceId: maintenance.id,
        startsIn: advanceMinutes,
        startTime: maintenance.startTime,
        endTime: maintenance.endTime
      }
    });

    // Mark reminder as sent
    const window = platform.maintenanceWindows.find(m => m.id === maintenance.id);
    if (window && window.notifications) {
      window.notifications.sentAt.push({
        minutes: advanceMinutes,
        timestamp: new Date()
      });
      await platform.save();
    }

    // Emit reminder event
    await this.#notificationService.emit(MaintenanceService.EVENTS.MAINTENANCE_REMINDER, {
      maintenance,
      platformId,
      advanceMinutes,
      timestamp: new Date()
    });
  }

  /**
   * Sends completion reminder
   * @private
   * @param {string} platformId - Platform ID
   * @param {Object} maintenance - Maintenance window
   * @returns {Promise<void>}
   */
  async #sendCompletionReminder(platformId, maintenance) {
    await this.#notificationService.sendToAdmins({
      type: 'maintenance.completion_reminder',
      title: 'Maintenance Window Ending Soon',
      message: `Maintenance window '${maintenance.description}' is scheduled to end in 5 minutes`,
      severity: 'medium',
      data: {
        platformId,
        maintenanceId: maintenance.id,
        endTime: maintenance.endTime
      }
    });
  }

  /**
   * Generates maintenance report
   * @private
   * @param {Object} platform - Platform instance
   * @param {Object} maintenance - Maintenance window
   * @param {Object} completionData - Completion data
   * @returns {Promise<Object>} Maintenance report
   */
  async #generateMaintenanceReport(platform, maintenance, completionData) {
    const duration = maintenance.completedAt - maintenance.startTime;
    
    return {
      summary: {
        maintenanceId: maintenance.id,
        type: maintenance.type,
        status: maintenance.status,
        duration: duration,
        durationFormatted: dateHelper.formatDuration(duration),
        scheduledWindow: {
          start: maintenance.startTime,
          end: maintenance.endTime,
          duration: maintenance.endTime - maintenance.startTime
        },
        actualWindow: {
          start: maintenance.startTime,
          end: maintenance.completedAt,
          duration: duration
        }
      },
      execution: {
        onTime: maintenance.startTime.getTime() === new Date(maintenance.startTime).getTime(),
        completedEarly: maintenance.completedAt < maintenance.endTime,
        affectedServices: maintenance.affectedServices,
        requiresDowntime: maintenance.requiresDowntime
      },
      notes: {
        description: maintenance.description,
        completionSummary: completionData.summary,
        additionalNotes: maintenance.notes
      },
      metadata: {
        platform: {
          id: platform.platformId,
          environment: platform.deployment.environment
        },
        createdBy: maintenance.createdBy,
        completedBy: completionData.userId,
        reportGeneratedAt: new Date()
      }
    };
  }

  /**
   * Converts date to cron expression
   * @private
   * @param {Date} date - Date to convert
   * @returns {string} Cron expression
   */
  #dateToCron(date) {
    const minutes = date.getMinutes();
    const hours = date.getHours();
    const dayOfMonth = date.getDate();
    const month = date.getMonth() + 1;
    
    return `${minutes} ${hours} ${dayOfMonth} ${month} *`;
  }

  /**
   * Clears maintenance cache
   * @private
   * @returns {Promise<void>}
   */
  async #clearMaintenanceCache() {
    try {
      await this.#cacheService.delete('maintenance:*');
    } catch (error) {
      logger.error('Failed to clear maintenance cache', {
        error: error.message
      });
    }
  }
}

// Export singleton instance
module.exports = new MaintenanceService();