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
const PlatformModel = require('../../../../../shared/lib/database/models/admin-server/platform-management/platform-model');
const logger = require('../../../../../shared/lib/utils/logger');
const { AppError } = require('../../../../../shared/lib/utils/app-error');
const CacheService = require('../../../../../shared/lib/services/cache-service');
const NotificationService = require('../../../../../shared/lib/services/notification-service');
const AuditService = require('../../../../../shared/lib/security/audit/audit-service');
const TransactionManager = require('../../../../../shared/lib/database/transaction-manager');
const dateHelper = require('../../../../../shared/lib/utils/helpers/date-helper');

/**
 * @class MaintenanceService
 * @description Comprehensive service for managing platform maintenance windows and operations
 */
class MaintenanceService {
  /**
   * Creates an instance of MaintenanceService
   * @constructor
   */
  constructor() {
    // Initialize service dependencies
    this.cacheService = new CacheService({
      prefix: 'maintenance:',
      ttl: 300, // 5 minutes default TTL
      maxKeys: 10000
    });
    
    this.notificationService = new NotificationService({
      enableEmailNotifications: true,
      enableSMSNotifications: true,
      enableWebhookNotifications: true
    });
    
    this.auditService = new AuditService({
      logLevel: 'info',
      enableDatabaseLogging: true,
      enableFileLogging: true
    });
    
    this.transactionManager = new TransactionManager({
      maxRetries: 3,
      retryDelay: 1000,
      timeoutMs: 30000
    });

    // Internal state management
    this.scheduledJobs = new Map();
    this.maintenanceHandlers = new Map();
    this.activeMaintenanceWindows = new Set();
    this.maintenanceMetrics = {
      totalScheduled: 0,
      totalCompleted: 0,
      totalCancelled: 0,
      averageDuration: 0,
      lastUpdated: new Date()
    };

    // Configuration settings
    this.config = {
      maxMaintenanceWindowDuration: 24 * 60 * 60 * 1000, // 24 hours
      minMaintenanceWindowDuration: 15 * 60 * 1000, // 15 minutes
      defaultNotificationAdvanceTime: [60, 30, 15], // minutes
      maxConcurrentMaintenanceWindows: 5,
      enableAutoStart: true,
      enableAutoComplete: false,
      maintenanceTimezone: 'UTC'
    };

    // Initialize default handlers and startup procedures
    this.initializeDefaultHandlers();
    this.startBackgroundProcesses();

    logger.info('MaintenanceService initialized successfully', {
      handlersRegistered: this.maintenanceHandlers.size,
      configurationApplied: Object.keys(this.config).length
    });
  }

  // Static constants for maintenance operations
  static get CACHE_KEYS() {
    return {
      ACTIVE_MAINTENANCE: 'active',
      SCHEDULED_MAINTENANCE: 'scheduled',
      MAINTENANCE_HISTORY: 'history',
      MAINTENANCE_STATS: 'stats',
      PLATFORM_STATUS: 'platform_status',
      NOTIFICATION_QUEUE: 'notification_queue'
    };
  }

  static get EVENTS() {
    return {
      MAINTENANCE_SCHEDULED: 'maintenance.scheduled',
      MAINTENANCE_UPDATED: 'maintenance.updated',
      MAINTENANCE_CANCELLED: 'maintenance.cancelled',
      MAINTENANCE_STARTED: 'maintenance.started',
      MAINTENANCE_COMPLETED: 'maintenance.completed',
      MAINTENANCE_REMINDER: 'maintenance.reminder',
      MAINTENANCE_EXTENDED: 'maintenance.extended',
      MAINTENANCE_PAUSED: 'maintenance.paused',
      MAINTENANCE_RESUMED: 'maintenance.resumed',
      MAINTENANCE_FAILED: 'maintenance.failed'
    };
  }

  static get MAINTENANCE_TYPES() {
    return {
      SCHEDULED: 'scheduled',
      EMERGENCY: 'emergency',
      RECURRING: 'recurring',
      HOTFIX: 'hotfix'
    };
  }

  static get MAINTENANCE_STATUS() {
    return {
      SCHEDULED: 'scheduled',
      IN_PROGRESS: 'in-progress',
      COMPLETED: 'completed',
      CANCELLED: 'cancelled',
      PAUSED: 'paused',
      FAILED: 'failed',
      EXTENDED: 'extended'
    };
  }

  static get MAINTENANCE_PRIORITY() {
    return {
      LOW: 'low',
      MEDIUM: 'medium',
      HIGH: 'high',
      CRITICAL: 'critical',
      EMERGENCY: 'emergency'
    };
  }

  /**
   * Schedules a new maintenance window with comprehensive validation and conflict checking
   * @async
   * @param {Object} maintenanceData - Complete maintenance window configuration
   * @param {string} userId - User identifier scheduling the maintenance
   * @returns {Promise<Object>} Scheduled maintenance window with metadata
   * @throws {AppError} If scheduling fails due to validation or conflicts
   */
  async scheduleMaintenanceWindow(maintenanceData, userId) {
    const session = await this.transactionManager.startSession();

    try {
      await session.startTransaction();

      logger.info('Initiating maintenance window scheduling', {
        type: maintenanceData.type,
        environment: maintenanceData.environment,
        userId,
        scheduledBy: userId
      });

      // Comprehensive validation of maintenance data
      await this.validateMaintenanceData(maintenanceData);

      // Retrieve platform configuration
      const platform = await PlatformModel.findOne({
        'deployment.environment': maintenanceData.environment || 'production'
      }).session(session);

      if (!platform) {
        throw new AppError('Platform not found for the specified environment', 404);
      }

      // Enhanced maintenance data preparation
      const enhancedMaintenanceData = {
        ...maintenanceData,
        id: this.generateMaintenanceId(),
        createdBy: userId,
        createdAt: new Date(),
        status: MaintenanceService.MAINTENANCE_STATUS.SCHEDULED,
        version: '1.0.0',
        metadata: {
          ...maintenanceData.metadata,
          schedulingSource: 'api',
          originalDuration: new Date(maintenanceData.endTime) - new Date(maintenanceData.startTime),
          estimatedImpact: this.calculateMaintenanceImpact(maintenanceData),
          riskLevel: this.assessMaintenanceRisk(maintenanceData)
        }
      };

      // Conflict detection and resolution
      await this.checkMaintenanceConflicts(platform, enhancedMaintenanceData);

      // Capacity validation
      await this.validateMaintenanceCapacity(platform, enhancedMaintenanceData);

      // Schedule the maintenance window
      const maintenance = await platform.scheduleMaintenance(enhancedMaintenanceData);
      await platform.save({ session });

      // Schedule automated tasks and notifications
      await this.scheduleMaintenanceTasks(platform.platformId, maintenance);
      await this.scheduleMaintenanceNotifications(platform.platformId, maintenance);

      // Update metrics and statistics
      this.updateMaintenanceMetrics('scheduled');

      // Comprehensive audit logging
      await this.auditService.log({
        userId,
        action: 'maintenance.schedule',
        resource: 'maintenance_window',
        resourceId: maintenance.id,
        details: {
          platformId: platform.platformId,
          type: maintenance.type,
          startTime: maintenance.startTime,
          endTime: maintenance.endTime,
          requiresDowntime: maintenance.requiresDowntime,
          affectedServices: maintenance.affectedServices,
          priority: maintenance.priority || MaintenanceService.MAINTENANCE_PRIORITY.MEDIUM
        },
        session
      });

      await session.commitTransaction();

      logger.info('Maintenance window scheduled successfully', {
        maintenanceId: maintenance.id,
        platformId: platform.platformId,
        type: maintenance.type,
        startTime: maintenance.startTime,
        userId
      });

      // Cache invalidation and event emission
      await this.clearMaintenanceCache();
      await this.emitMaintenanceEvent(MaintenanceService.EVENTS.MAINTENANCE_SCHEDULED, {
        maintenance,
        platformId: platform.platformId,
        userId,
        timestamp: new Date()
      });

      // Send initial notifications
      await this.sendMaintenanceNotification(platform, maintenance, 'scheduled');

      return {
        ...maintenance.toObject(),
        platformId: platform.platformId,
        environment: platform.deployment.environment,
        schedulingMetadata: {
          conflictsChecked: true,
          capacityValidated: true,
          notificationsScheduled: true,
          tasksScheduled: true
        }
      };

    } catch (error) {
      await session.abortTransaction();
      logger.error('Failed to schedule maintenance window', {
        error: error.message,
        stack: error.stack,
        userId,
        maintenanceData: this.sanitizeMaintenanceData(maintenanceData)
      });
      throw error instanceof AppError ? error : new AppError(`Failed to schedule maintenance: ${error.message}`, 500);
    } finally {
      await session.endSession();
    }
  }

  /**
   * Schedules recurring maintenance windows with advanced pattern support
   * @async
   * @param {Object} recurringData - Recurring maintenance configuration
   * @param {string} userId - User identifier scheduling the recurring maintenance
   * @returns {Promise<Object>} Batch scheduling results with individual maintenance windows
   * @throws {AppError} If recurring scheduling fails
   */
  async scheduleRecurringMaintenance(recurringData, userId) {
    const session = await this.transactionManager.startSession();

    try {
      await session.startTransaction();

      const { pattern, frequency, count = 10, startDate, template, endDate } = recurringData;
      
      if (!pattern || !frequency || !startDate || !template) {
        throw new AppError('Pattern, frequency, start date, and template are required for recurring maintenance', 400);
      }

      logger.info('Scheduling recurring maintenance', {
        pattern,
        frequency,
        count,
        userId
      });

      const scheduledWindows = [];
      const failures = [];
      const baseDate = new Date(startDate);
      const maxEndDate = endDate ? new Date(endDate) : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year max

      for (let iteration = 0; iteration < count; iteration++) {
        try {
          const windowDate = this.calculateRecurringDate(baseDate, pattern, frequency, iteration);
          
          // Stop if we've exceeded the end date
          if (windowDate > maxEndDate) {
            break;
          }

          const maintenanceData = {
            ...template,
            startTime: windowDate,
            endTime: new Date(windowDate.getTime() + (template.durationMinutes || 60) * 60 * 1000),
            type: MaintenanceService.MAINTENANCE_TYPES.RECURRING,
            isRecurring: true,
            recurringGroup: `${pattern}_${frequency}_${Date.now()}`,
            recurringIteration: iteration,
            description: `${template.description} (Recurring ${iteration + 1}/${count})`,
            metadata: {
              ...template.metadata,
              recurringPattern: pattern,
              recurringFrequency: frequency,
              originalScheduleDate: new Date()
            }
          };

          const scheduledWindow = await this.scheduleMaintenanceWindow(maintenanceData, userId);
          scheduledWindows.push(scheduledWindow);

        } catch (error) {
          failures.push({
            iteration,
            error: error.message,
            windowDate: this.calculateRecurringDate(baseDate, pattern, frequency, iteration)
          });
          logger.warn('Failed to schedule recurring maintenance iteration', {
            iteration,
            error: error.message
          });
        }
      }

      await session.commitTransaction();

      const result = {
        scheduledWindows,
        failures,
        summary: {
          total: scheduledWindows.length + failures.length,
          successful: scheduledWindows.length,
          failed: failures.length,
          pattern,
          frequency,
          recurringGroup: scheduledWindows.length > 0 ? scheduledWindows[0].recurringGroup : null
        }
      };

      logger.info('Recurring maintenance scheduling completed', result.summary);

      return result;

    } catch (error) {
      await session.abortTransaction();
      throw error instanceof AppError ? error : new AppError(`Failed to schedule recurring maintenance: ${error.message}`, 500);
    } finally {
      await session.endSession();
    }
  }

  /**
   * Schedules emergency maintenance with immediate notification and escalation
   * @async
   * @param {Object} emergencyData - Emergency maintenance configuration
   * @param {string} userId - User identifier scheduling the emergency maintenance
   * @returns {Promise<Object>} Scheduled emergency maintenance with escalation details
   * @throws {AppError} If emergency scheduling fails
   */
  async scheduleEmergencyMaintenance(emergencyData, userId) {
    const session = await this.transactionManager.startSession();

    try {
      await session.startTransaction();

      logger.warn('Emergency maintenance being scheduled', {
        reason: emergencyData.reason,
        priority: emergencyData.priority,
        userId
      });

      const enhancedEmergencyData = {
        ...emergencyData,
        type: MaintenanceService.MAINTENANCE_TYPES.EMERGENCY,
        priority: MaintenanceService.MAINTENANCE_PRIORITY.EMERGENCY,
        startTime: emergencyData.startTime || new Date(),
        endTime: emergencyData.endTime || new Date(Date.now() + 2 * 60 * 60 * 1000), // Default 2 hours
        requiresDowntime: emergencyData.requiresDowntime !== false, // Default to true for emergency
        skipConflictCheck: emergencyData.skipConflictCheck === true,
        metadata: {
          ...emergencyData.metadata,
          emergencyReason: emergencyData.reason,
          escalationLevel: emergencyData.escalationLevel || 'high',
          emergencyContact: emergencyData.emergencyContact || userId,
          scheduledAt: new Date()
        }
      };

      const maintenance = await this.scheduleMaintenanceWindow(enhancedEmergencyData, userId);

      // Immediate emergency notifications
      await this.sendEmergencyNotifications(maintenance);
      
      // Escalate to management if critical
      if (emergencyData.escalationLevel === 'critical') {
        await this.escalateToManagement(maintenance, emergencyData);
      }

      await session.commitTransaction();

      logger.warn('Emergency maintenance scheduled and notifications sent', {
        maintenanceId: maintenance.id,
        escalated: emergencyData.escalationLevel === 'critical'
      });

      return {
        ...maintenance,
        emergencyMetadata: {
          notificationsSent: true,
          escalated: emergencyData.escalationLevel === 'critical',
          scheduledAt: new Date()
        }
      };

    } catch (error) {
      await session.abortTransaction();
      throw error instanceof AppError ? error : new AppError(`Failed to schedule emergency maintenance: ${error.message}`, 500);
    } finally {
      await session.endSession();
    }
  }

  /**
   * Reschedules an existing maintenance window with conflict validation
   * @async
   * @param {string} maintenanceId - Maintenance window identifier
   * @param {Object} rescheduleData - New scheduling information
   * @param {string} userId - User identifier performing the reschedule
   * @returns {Promise<Object>} Rescheduled maintenance window
   * @throws {AppError} If rescheduling fails
   */
  async rescheduleMaintenanceWindow(maintenanceId, rescheduleData, userId) {
    const session = await this.transactionManager.startSession();

    try {
      await session.startTransaction();

      logger.info('Rescheduling maintenance window', {
        maintenanceId,
        newStartTime: rescheduleData.startTime,
        newEndTime: rescheduleData.endTime,
        userId
      });

      const platform = await PlatformModel.findOne({
        'maintenanceWindows.id': maintenanceId
      }).session(session);

      if (!platform) {
        throw new AppError('Maintenance window not found', 404);
      }

      const maintenance = platform.maintenanceWindows.find(m => m.id === maintenanceId);
      
      if (maintenance.status !== MaintenanceService.MAINTENANCE_STATUS.SCHEDULED) {
        throw new AppError('Can only reschedule scheduled maintenance windows', 400);
      }

      // Store original schedule for audit
      const originalSchedule = {
        startTime: maintenance.startTime,
        endTime: maintenance.endTime
      };

      // Cancel existing scheduled tasks
      await this.cancelMaintenanceTasks(platform.platformId, maintenanceId);

      // Update maintenance window
      maintenance.startTime = new Date(rescheduleData.startTime);
      maintenance.endTime = new Date(rescheduleData.endTime);
      maintenance.notes = `${maintenance.notes || ''}\nRescheduled: ${rescheduleData.reason || 'No reason provided'}`.trim();
      maintenance.lastModified = new Date();
      maintenance.modifiedBy = userId;
      maintenance.rescheduleHistory = maintenance.rescheduleHistory || [];
      maintenance.rescheduleHistory.push({
        originalStartTime: originalSchedule.startTime,
        originalEndTime: originalSchedule.endTime,
        newStartTime: maintenance.startTime,
        newEndTime: maintenance.endTime,
        reason: rescheduleData.reason,
        rescheduledBy: userId,
        rescheduledAt: new Date()
      });

      // Validate new times and check conflicts
      await this.validateMaintenanceData(maintenance.toObject());
      await this.checkMaintenanceConflicts(platform, maintenance, maintenanceId);

      await platform.save({ session });

      // Schedule new tasks and notifications
      await this.scheduleMaintenanceTasks(platform.platformId, maintenance);
      await this.scheduleMaintenanceNotifications(platform.platformId, maintenance);

      // Audit logging
      await this.auditService.log({
        userId,
        action: 'maintenance.reschedule',
        resource: 'maintenance_window',
        resourceId: maintenanceId,
        details: {
          originalSchedule,
          newSchedule: {
            startTime: maintenance.startTime,
            endTime: maintenance.endTime
          },
          reason: rescheduleData.reason
        },
        session
      });

      await session.commitTransaction();

      // Clear cache and send notifications
      await this.clearMaintenanceCache();
      await this.sendMaintenanceNotification(platform, maintenance, 'rescheduled');

      logger.info('Maintenance window rescheduled successfully', {
        maintenanceId,
        originalStartTime: originalSchedule.startTime,
        newStartTime: maintenance.startTime
      });

      return {
        ...maintenance.toObject(),
        platformId: platform.platformId,
        environment: platform.deployment.environment,
        rescheduleMetadata: {
          rescheduled: true,
          originalSchedule,
          rescheduleCount: maintenance.rescheduleHistory.length
        }
      };

    } catch (error) {
      await session.abortTransaction();
      throw error instanceof AppError ? error : new AppError(`Failed to reschedule maintenance: ${error.message}`, 500);
    } finally {
      await session.endSession();
    }
  }

  /**
   * Batch schedules multiple maintenance windows with transaction safety
   * @async
   * @param {Array} maintenanceWindows - Array of maintenance window configurations
   * @param {string} userId - User identifier scheduling the batch
   * @returns {Promise<Object>} Batch scheduling results with successes and failures
   * @throws {AppError} If batch operation fails catastrophically
   */
  async batchScheduleMaintenance(maintenanceWindows, userId) {
    logger.info('Starting batch maintenance scheduling', {
      count: maintenanceWindows.length,
      userId
    });

    const results = [];
    const errors = [];
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    for (let index = 0; index < maintenanceWindows.length; index++) {
      const maintenanceData = maintenanceWindows[index];
      
      try {
        // Add batch metadata to each maintenance window
        const enhancedData = {
          ...maintenanceData,
          batchId,
          batchIndex: index,
          metadata: {
            ...maintenanceData.metadata,
            batchOperation: true,
            batchId,
            batchSize: maintenanceWindows.length
          }
        };

        const scheduledMaintenance = await this.scheduleMaintenanceWindow(enhancedData, userId);
        
        results.push({
          index,
          success: true,
          maintenanceId: scheduledMaintenance.id,
          maintenance: scheduledMaintenance,
          scheduledAt: new Date()
        });

        logger.debug('Batch maintenance item scheduled successfully', {
          batchId,
          index,
          maintenanceId: scheduledMaintenance.id
        });

      } catch (error) {
        errors.push({
          index,
          success: false,
          error: error.message,
          data: this.sanitizeMaintenanceData(maintenanceData),
          failedAt: new Date()
        });

        logger.error('Batch maintenance item failed', {
          batchId,
          index,
          error: error.message
        });
      }
    }

    const batchResults = {
      batchId,
      results,
      errors,
      summary: {
        total: maintenanceWindows.length,
        successful: results.length,
        failed: errors.length,
        successRate: Math.round((results.length / maintenanceWindows.length) * 100),
        completedAt: new Date()
      },
      metadata: {
        userId,
        batchedBy: userId,
        processedAt: new Date()
      }
    };

    // Log batch completion
    logger.info('Batch maintenance scheduling completed', batchResults.summary);

    // Audit the batch operation
    await this.auditService.log({
      userId,
      action: 'maintenance.batch_schedule',
      resource: 'batch_maintenance',
      resourceId: batchId,
      details: batchResults.summary
    });

    return batchResults;
  }

  /**
   * Updates an existing maintenance window with comprehensive validation
   * @async
   * @param {string} maintenanceId - Maintenance window identifier
   * @param {Object} updates - Updates to apply to the maintenance window
   * @param {string} userId - User identifier performing the update
   * @returns {Promise<Object>} Updated maintenance window
   * @throws {AppError} If update fails
   */
  async updateMaintenanceWindow(maintenanceId, updates, userId) {
    const session = await this.transactionManager.startSession();

    try {
      await session.startTransaction();

      logger.info('Updating maintenance window', {
        maintenanceId,
        updateFields: Object.keys(updates),
        userId
      });

      const platform = await PlatformModel.findOne({
        'maintenanceWindows.id': maintenanceId
      }).session(session);

      if (!platform) {
        throw new AppError('Maintenance window not found', 404);
      }

      const maintenance = platform.maintenanceWindows.find(m => m.id === maintenanceId);
      
      if (!maintenance) {
        throw new AppError('Maintenance window not found', 404);
      }

      // Validate update permissions based on status
      if (maintenance.status === MaintenanceService.MAINTENANCE_STATUS.COMPLETED) {
        throw new AppError('Cannot update completed maintenance windows', 400);
      }

      if (maintenance.status === MaintenanceService.MAINTENANCE_STATUS.IN_PROGRESS && 
          (updates.startTime || updates.endTime)) {
        throw new AppError('Cannot change times for in-progress maintenance', 400);
      }

      // Define allowed updates based on maintenance status
      const allowedUpdates = this.getAllowedUpdatesForStatus(maintenance.status);
      const appliedUpdates = {};
      const previousValues = {};

      // Apply validated updates
      for (const field of Object.keys(updates)) {
        if (allowedUpdates.includes(field)) {
          previousValues[field] = maintenance[field];
          appliedUpdates[field] = updates[field];
          maintenance[field] = updates[field];
        } else {
          logger.warn('Attempted unauthorized update', {
            field,
            status: maintenance.status,
            userId
          });
        }
      }

      // Special handling for time changes
      if (updates.startTime || updates.endTime) {
        if (maintenance.startTime >= maintenance.endTime) {
          throw new AppError('End time must be after start time', 400);
        }

        await this.checkMaintenanceConflicts(platform, maintenance, maintenanceId);
        await this.cancelMaintenanceTasks(platform.platformId, maintenanceId);
        await this.scheduleMaintenanceTasks(platform.platformId, maintenance);
      }

      // Update metadata
      maintenance.lastModified = new Date();
      maintenance.modifiedBy = userId;
      maintenance.updateHistory = maintenance.updateHistory || [];
      maintenance.updateHistory.push({
        updatedFields: Object.keys(appliedUpdates),
        previousValues,
        newValues: appliedUpdates,
        updatedBy: userId,
        updatedAt: new Date()
      });

      await platform.save({ session });

      // Comprehensive audit logging
      await this.auditService.log({
        userId,
        action: 'maintenance.update',
        resource: 'maintenance_window',
        resourceId: maintenanceId,
        details: {
          platformId: platform.platformId,
          appliedUpdates,
          previousValues,
          maintenanceStatus: maintenance.status
        },
        session
      });

      await session.commitTransaction();

      logger.info('Maintenance window updated successfully', {
        maintenanceId,
        platformId: platform.platformId,
        appliedUpdates: Object.keys(appliedUpdates),
        userId
      });

      // Clear cache and emit events
      await this.clearMaintenanceCache();
      await this.emitMaintenanceEvent(MaintenanceService.EVENTS.MAINTENANCE_UPDATED, {
        maintenance: maintenance.toObject(),
        updates: appliedUpdates,
        platformId: platform.platformId,
        userId,
        timestamp: new Date()
      });

      // Send update notifications if significant changes
      if (updates.startTime || updates.endTime || updates.description) {
        await this.sendMaintenanceNotification(platform, maintenance, 'updated');
      }

      return {
        ...maintenance.toObject(),
        platformId: platform.platformId,
        environment: platform.deployment.environment,
        updateMetadata: {
          updated: true,
          appliedUpdates: Object.keys(appliedUpdates),
          updateCount: maintenance.updateHistory.length
        }
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
   * Updates maintenance window metadata without affecting core scheduling
   * @async
   * @param {string} maintenanceId - Maintenance window identifier
   * @param {Object} metadata - Metadata updates to apply
   * @param {string} userId - User identifier performing the update
   * @returns {Promise<Object>} Updated maintenance window with new metadata
   * @throws {AppError} If metadata update fails
   */
  async updateMaintenanceMetadata(maintenanceId, metadata, userId) {
    logger.info('Updating maintenance metadata', {
      maintenanceId,
      metadataKeys: Object.keys(metadata),
      userId
    });

    const platform = await PlatformModel.findOne({
      'maintenanceWindows.id': maintenanceId
    });

    if (!platform) {
      throw new AppError('Maintenance window not found', 404);
    }

    const maintenance = platform.maintenanceWindows.find(m => m.id === maintenanceId);
    
    if (!maintenance.metadata) {
      maintenance.metadata = {};
    }

    // Preserve system metadata while allowing user metadata updates
    const systemMetadataKeys = ['schedulingSource', 'originalDuration', 'estimatedImpact', 'riskLevel'];
    const previousMetadata = { ...maintenance.metadata };

    Object.keys(metadata).forEach(key => {
      if (!systemMetadataKeys.includes(key)) {
        maintenance.metadata[key] = metadata[key];
      }
    });

    // Add metadata update tracking
    maintenance.metadata.lastMetadataUpdate = new Date();
    maintenance.metadata.metadataUpdatedBy = userId;

    await platform.save();
    await this.clearMaintenanceCache();

    logger.info('Maintenance metadata updated successfully', {
      maintenanceId,
      updatedKeys: Object.keys(metadata).filter(k => !systemMetadataKeys.includes(k))
    });

    return {
      ...maintenance.toObject(),
      platformId: platform.platformId,
      metadataUpdate: {
        updated: true,
        previousMetadata,
        newMetadata: maintenance.metadata
      }
    };
  }

  /**
   * Deletes a maintenance window with proper cleanup and validation
   * @async
   * @param {string} maintenanceId - Maintenance window identifier
   * @param {string} userId - User identifier performing the deletion
   * @returns {Promise<void>}
   * @throws {AppError} If deletion fails
   */
  async deleteMaintenanceWindow(maintenanceId, userId) {
    const session = await this.transactionManager.startSession();

    try {
      await session.startTransaction();

      logger.info('Deleting maintenance window', {
        maintenanceId,
        userId
      });

      const platform = await PlatformModel.findOne({
        'maintenanceWindows.id': maintenanceId
      }).session(session);

      if (!platform) {
        throw new AppError('Maintenance window not found', 404);
      }

      const maintenance = platform.maintenanceWindows.find(m => m.id === maintenanceId);
      
      // Validate deletion permissions
      if (maintenance.status === MaintenanceService.MAINTENANCE_STATUS.IN_PROGRESS) {
        throw new AppError('Cannot delete maintenance window that is in progress', 400);
      }

      // Store maintenance data for audit before deletion
      const deletedMaintenanceData = maintenance.toObject();

      // Cancel all scheduled tasks and notifications
      await this.cancelMaintenanceTasks(platform.platformId, maintenanceId);
      await this.cancelMaintenanceNotifications(platform.platformId, maintenanceId);

      // Remove maintenance window from platform
      platform.maintenanceWindows = platform.maintenanceWindows.filter(m => m.id !== maintenanceId);
      
      await platform.save({ session });

      // Update metrics
      this.updateMaintenanceMetrics('deleted');

      // Comprehensive audit logging
      await this.auditService.log({
        userId,
        action: 'maintenance.delete',
        resource: 'maintenance_window',
        resourceId: maintenanceId,
        details: {
          platformId: platform.platformId,
          deletedMaintenance: deletedMaintenanceData,
          deletionReason: 'user_requested'
        },
        session
      });

      await session.commitTransaction();

      // Clear cache
      await this.clearMaintenanceCache();

      logger.info('Maintenance window deleted successfully', {
        maintenanceId,
        platformId: platform.platformId,
        userId
      });

    } catch (error) {
      await session.abortTransaction();
      throw error instanceof AppError ? error : new AppError(`Failed to delete maintenance: ${error.message}`, 500);
    } finally {
      await session.endSession();
    }
  }

  /**
   * Clones an existing maintenance window with customizable parameters
   * @async
   * @param {string} maintenanceId - Source maintenance window identifier
   * @param {Object} cloneData - Clone configuration and overrides
   * @param {string} userId - User identifier performing the clone operation
   * @returns {Promise<Object>} Cloned maintenance window
   * @throws {AppError} If cloning fails
   */
  async cloneMaintenanceWindow(maintenanceId, cloneData, userId) {
    logger.info('Cloning maintenance window', {
      sourceMaintenanceId: maintenanceId,
      userId
    });

    const platform = await PlatformModel.findOne({
      'maintenanceWindows.id': maintenanceId
    });

    if (!platform) {
      throw new AppError('Source maintenance window not found', 404);
    }

    const originalMaintenance = platform.maintenanceWindows.find(m => m.id === maintenanceId);
    
    // Create clone data by merging original with overrides
    const clonedMaintenanceData = {
      ...originalMaintenance.toObject(),
      ...cloneData,
      startTime: new Date(cloneData.startTime),
      endTime: new Date(cloneData.endTime),
      description: cloneData.description || `Clone of: ${originalMaintenance.description}`,
      notes: `Cloned from maintenance window ${maintenanceId} on ${new Date().toISOString()}`,
      metadata: {
        ...originalMaintenance.metadata,
        ...cloneData.metadata,
        clonedFrom: maintenanceId,
        originalMaintenanceId: maintenanceId,
        clonedAt: new Date(),
        clonedBy: userId
      }
    };

    // Remove fields that should not be cloned
    const fieldsToRemove = ['id', '_id', 'createdAt', 'completedAt', 'status', 'updateHistory', 'rescheduleHistory'];
    fieldsToRemove.forEach(field => delete clonedMaintenanceData[field]);

    const clonedMaintenance = await this.scheduleMaintenanceWindow(clonedMaintenanceData, userId);

    logger.info('Maintenance window cloned successfully', {
      sourceMaintenanceId: maintenanceId,
      clonedMaintenanceId: clonedMaintenance.id,
      userId
    });

    return {
      ...clonedMaintenance,
      cloneMetadata: {
        cloned: true,
        sourceMaintenanceId: maintenanceId,
        clonedAt: new Date()
      }
    };
  }

  /**
   * Cancels a maintenance window with proper notification and cleanup
   * @async
   * @param {string} maintenanceId - Maintenance window identifier
   * @param {Object} cancellationData - Cancellation details and reason
   * @param {string} userId - User identifier cancelling the maintenance
   * @returns {Promise<Object>} Cancelled maintenance window
   * @throws {AppError} If cancellation fails
   */
  async cancelMaintenanceWindow(maintenanceId, cancellationData, userId) {
    const session = await this.transactionManager.startSession();

    try {
      await session.startTransaction();

      logger.info('Cancelling maintenance window', {
        maintenanceId,
        reason: cancellationData.reason,
        userId
      });

      const platform = await PlatformModel.findOne({
        'maintenanceWindows.id': maintenanceId
      }).session(session);

      if (!platform) {
        throw new AppError('Maintenance window not found', 404);
      }

      const maintenance = platform.maintenanceWindows.find(m => m.id === maintenanceId);
      
      if (!maintenance) {
        throw new AppError('Maintenance window not found', 404);
      }

      // Validate cancellation permissions
      if (maintenance.status === MaintenanceService.MAINTENANCE_STATUS.COMPLETED) {
        throw new AppError('Cannot cancel completed maintenance', 400);
      }

      if (maintenance.status === MaintenanceService.MAINTENANCE_STATUS.CANCELLED) {
        throw new AppError('Maintenance already cancelled', 400);
      }

      const wasInProgress = maintenance.status === MaintenanceService.MAINTENANCE_STATUS.IN_PROGRESS;

      // Update maintenance status and details
      maintenance.status = MaintenanceService.MAINTENANCE_STATUS.CANCELLED;
      maintenance.cancelledAt = new Date();
      maintenance.cancelledBy = userId;
      maintenance.cancellationReason = cancellationData.reason;
      maintenance.notes = `${maintenance.notes || ''}\nCancelled: ${cancellationData.reason}`.trim();

      // If maintenance was in progress, handle cleanup
      if (wasInProgress) {
        await this.executeMaintenanceCancellationCleanup(platform, maintenance);
      }

      await platform.save({ session });

      // Cancel all scheduled tasks and notifications
      await this.cancelMaintenanceTasks(platform.platformId, maintenanceId);
      await this.cancelMaintenanceNotifications(platform.platformId, maintenanceId);

      // Update metrics
      this.updateMaintenanceMetrics('cancelled');

      // Audit logging
      await this.auditService.log({
        userId,
        action: 'maintenance.cancel',
        resource: 'maintenance_window',
        resourceId: maintenanceId,
        details: {
          platformId: platform.platformId,
          reason: cancellationData.reason,
          wasInProgress,
          cancelledAt: maintenance.cancelledAt
        },
        session
      });

      await session.commitTransaction();

      logger.info('Maintenance window cancelled successfully', {
        maintenanceId,
        platformId: platform.platformId,
        reason: cancellationData.reason,
        wasInProgress,
        userId
      });

      // Clear cache and send notifications
      await this.clearMaintenanceCache();
      await this.emitMaintenanceEvent(MaintenanceService.EVENTS.MAINTENANCE_CANCELLED, {
        maintenance: maintenance.toObject(),
        reason: cancellationData.reason,
        platformId: platform.platformId,
        userId,
        timestamp: new Date()
      });

      await this.sendMaintenanceNotification(platform, maintenance, 'cancelled', cancellationData.reason);

      return {
        ...maintenance.toObject(),
        platformId: platform.platformId,
        environment: platform.deployment.environment,
        cancellationMetadata: {
          cancelled: true,
          wasInProgress,
          cancelledAt: maintenance.cancelledAt
        }
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

  // Additional methods would continue here following the same comprehensive pattern...
  // Due to length constraints, I'll provide the essential structure and key methods
  // The remaining methods would follow the same detailed implementation pattern

  /**
   * Gets active maintenance windows with comprehensive filtering and caching
   * @async
   * @param {Object} filters - Query filters and options
   * @returns {Promise<Array>} Active maintenance windows
   */
  async getActiveMaintenanceWindows(filters = {}) {
    try {
      const { environment, fromCache = true, includeDetails = false } = filters;

      // Cache key generation
      const cacheKey = `${MaintenanceService.CACHE_KEYS.ACTIVE_MAINTENANCE}:${environment || 'all'}:${includeDetails}`;

      if (fromCache) {
        const cached = await this.cacheService.get(cacheKey);
        if (cached) {
          logger.debug('Retrieved active maintenance windows from cache', {
            count: cached.length,
            environment
          });
          return cached;
        }
      }

      const query = { 'status.operational': true };
      if (environment) {
        query['deployment.environment'] = environment;
      }

      const platforms = await PlatformModel.find(query)
        .select('platformId deployment.environment maintenanceWindows')
        .lean();

      const activeWindows = [];
      const now = new Date();

      for (const platform of platforms) {
        for (const window of platform.maintenanceWindows || []) {
          if (this.isMaintenanceActive(window, now)) {
            const enhancedWindow = {
              ...window,
              platformId: platform.platformId,
              environment: platform.deployment.environment,
              timeRemaining: this.calculateTimeRemaining(window),
              progressPercentage: this.calculateMaintenanceProgress(window)
            };

            if (includeDetails) {
              enhancedWindow.impactAnalysis = await this.getMaintenanceImpactAnalysis(window.id);
              enhancedWindow.affectedServicesStatus = await this.getAffectedServicesStatus(window.affectedServices);
            }

            activeWindows.push(enhancedWindow);
          }
        }
      }

      // Sort by priority and start time
      activeWindows.sort((a, b) => {
        const priorityOrder = { emergency: 0, critical: 1, high: 2, medium: 3, low: 4 };
        const priorityDiff = (priorityOrder[a.priority] || 3) - (priorityOrder[b.priority] || 3);
        return priorityDiff !== 0 ? priorityDiff : a.startTime - b.startTime;
      });

      if (fromCache) {
        await this.cacheService.set(cacheKey, activeWindows, 60); // 1 minute cache
      }

      logger.info('Retrieved active maintenance windows', {
        count: activeWindows.length,
        environment,
        fromCache: false
      });

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
   * Validates maintenance data comprehensively
   * @private
   * @param {Object} maintenanceData - Maintenance data to validate
   * @throws {AppError} If validation fails
   */
  async validateMaintenanceData(maintenanceData) {
    const errors = [];
    const warnings = [];

    // Required field validation
    const requiredFields = ['type', 'startTime', 'endTime', 'description'];
    for (const field of requiredFields) {
      if (!maintenanceData[field]) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    if (errors.length > 0) {
      throw new AppError(`Validation failed: ${errors.join(', ')}`, 400);
    }

    // Date validation
    const startTime = new Date(maintenanceData.startTime);
    const endTime = new Date(maintenanceData.endTime);
    const now = new Date();

    if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
      throw new AppError('Invalid date format provided', 400);
    }

    if (startTime >= endTime) {
      throw new AppError('End time must be after start time', 400);
    }

    // Business rule validation
    if (maintenanceData.type === MaintenanceService.MAINTENANCE_TYPES.SCHEDULED && startTime < now) {
      throw new AppError('Scheduled maintenance must be in the future', 400);
    }

    const duration = endTime - startTime;
    if (duration > this.config.maxMaintenanceWindowDuration) {
      throw new AppError(`Maintenance window cannot exceed ${this.config.maxMaintenanceWindowDuration / (1000 * 60 * 60)} hours`, 400);
    }

    if (duration < this.config.minMaintenanceWindowDuration) {
      warnings.push(`Maintenance window is less than ${this.config.minMaintenanceWindowDuration / (1000 * 60)} minutes`);
    }

    // Service validation
    if (maintenanceData.affectedServices && !Array.isArray(maintenanceData.affectedServices)) {
      throw new AppError('Affected services must be an array', 400);
    }

    // Log warnings
    if (warnings.length > 0) {
      logger.warn('Maintenance validation warnings', {
        warnings,
        maintenanceType: maintenanceData.type
      });
    }
  }

  /**
   * Checks for maintenance conflicts with enhanced analysis
   * @private
   * @param {Object} platform - Platform instance
   * @param {Object} maintenanceData - Maintenance data to check
   * @param {string} excludeId - Maintenance ID to exclude from conflict check
   * @throws {AppError} If conflicts are found
   */
  async checkMaintenanceConflicts(platform, maintenanceData, excludeId = null) {
    if (maintenanceData.skipConflictCheck) {
      logger.warn('Skipping conflict check as requested', {
        maintenanceType: maintenanceData.type
      });
      return;
    }

    const { startTime, endTime } = maintenanceData;
    const conflicts = [];

    for (const window of platform.maintenanceWindows) {
      if (window.id === excludeId) continue;
      if (window.status === MaintenanceService.MAINTENANCE_STATUS.CANCELLED) continue;
      if (window.status === MaintenanceService.MAINTENANCE_STATUS.COMPLETED) continue;

      if (this.checkTimeOverlap(startTime, endTime, window.startTime, window.endTime)) {
        conflicts.push({
          conflictingMaintenanceId: window.id,
          conflictingStartTime: window.startTime,
          conflictingEndTime: window.endTime,
          conflictType: this.determineConflictType(maintenanceData, window),
          severity: this.calculateConflictSeverity(maintenanceData, window)
        });
      }
    }

    if (conflicts.length > 0) {
      const highSeverityConflicts = conflicts.filter(c => c.severity === 'high');
      
      if (highSeverityConflicts.length > 0 && maintenanceData.type !== MaintenanceService.MAINTENANCE_TYPES.EMERGENCY) {
        const conflictDetails = conflicts.map(c => 
          `${c.conflictingMaintenanceId} (${c.conflictingStartTime} to ${c.conflictingEndTime})`
        ).join(', ');
        
        throw new AppError(
          `High severity conflicts detected with maintenance windows: ${conflictDetails}`,
          409,
          { conflicts }
        );
      }

      logger.warn('Maintenance conflicts detected but allowed', {
        conflictCount: conflicts.length,
        highSeverityCount: highSeverityConflicts.length,
        maintenanceType: maintenanceData.type
      });
    }
  }

  /**
   * Helper method to check time overlap between two maintenance windows
   * @private
   * @param {Date} start1 - First window start time
   * @param {Date} end1 - First window end time
   * @param {Date} start2 - Second window start time
   * @param {Date} end2 - Second window end time
   * @returns {boolean} True if windows overlap
   */
  checkTimeOverlap(start1, end1, start2, end2) {
    return (start1 < end2) && (end1 > start2);
  }

  /**
   * Determines the type of conflict between two maintenance windows
   * @private
   * @param {Object} maintenance1 - First maintenance window
   * @param {Object} maintenance2 - Second maintenance window
   * @returns {string} Conflict type
   */
  determineConflictType(maintenance1, maintenance2) {
    const hasCommonServices = maintenance1.affectedServices?.some(s => 
      maintenance2.affectedServices?.includes(s)
    );

    if (hasCommonServices) {
      return 'service_conflict';
    } else if (maintenance1.requiresDowntime && maintenance2.requiresDowntime) {
      return 'downtime_conflict';
    } else {
      return 'time_conflict';
    }
  }

  /**
   * Calculates the severity of a maintenance conflict
   * @private
   * @param {Object} maintenance1 - First maintenance window
   * @param {Object} maintenance2 - Second maintenance window
   * @returns {string} Conflict severity (low, medium, high)
   */
  calculateConflictSeverity(maintenance1, maintenance2) {
    const priority1 = maintenance1.priority || MaintenanceService.MAINTENANCE_PRIORITY.MEDIUM;
    const priority2 = maintenance2.priority || MaintenanceService.MAINTENANCE_PRIORITY.MEDIUM;

    const highPriorities = [MaintenanceService.MAINTENANCE_PRIORITY.CRITICAL, MaintenanceService.MAINTENANCE_PRIORITY.EMERGENCY];

    if (highPriorities.includes(priority1) || highPriorities.includes(priority2)) {
      return 'high';
    } else if (maintenance1.requiresDowntime && maintenance2.requiresDowntime) {
      return 'high';
    } else if (maintenance1.affectedServices?.some(s => maintenance2.affectedServices?.includes(s))) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  /**
   * Generates a unique maintenance ID with timestamp and randomness
   * @private
   * @returns {string} Unique maintenance identifier
   */
  generateMaintenanceId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 9);
    return `maint_${timestamp}_${random}`;
  }

  /**
   * Calculates estimated impact of maintenance
   * @private
   * @param {Object} maintenanceData - Maintenance window data
   * @returns {string} Impact level (low, medium, high)
   */
  calculateMaintenanceImpact(maintenanceData) {
    let impactScore = 0;

    // Duration impact
    const duration = new Date(maintenanceData.endTime) - new Date(maintenanceData.startTime);
    const hours = duration / (1000 * 60 * 60);
    if (hours > 4) impactScore += 3;
    else if (hours > 2) impactScore += 2;
    else impactScore += 1;

    // Downtime impact
    if (maintenanceData.requiresDowntime) impactScore += 3;

    // Service count impact
    const serviceCount = maintenanceData.affectedServices?.length || 0;
    if (serviceCount > 5) impactScore += 2;
    else if (serviceCount > 2) impactScore += 1;

    // Priority impact
    const priority = maintenanceData.priority || MaintenanceService.MAINTENANCE_PRIORITY.MEDIUM;
    if (priority === MaintenanceService.MAINTENANCE_PRIORITY.EMERGENCY) impactScore += 4;
    else if (priority === MaintenanceService.MAINTENANCE_PRIORITY.CRITICAL) impactScore += 3;
    else if (priority === MaintenanceService.MAINTENANCE_PRIORITY.HIGH) impactScore += 2;

    if (impactScore >= 8) return 'high';
    else if (impactScore >= 4) return 'medium';
    else return 'low';
  }

  /**
   * Assesses maintenance risk level
   * @private
   * @param {Object} maintenanceData - Maintenance window data
   * @returns {string} Risk level (low, medium, high, critical)
   */
  assessMaintenanceRisk(maintenanceData) {
    let riskScore = 0;

    // Type-based risk
    if (maintenanceData.type === MaintenanceService.MAINTENANCE_TYPES.EMERGENCY) riskScore += 4;
    else if (maintenanceData.type === MaintenanceService.MAINTENANCE_TYPES.HOTFIX) riskScore += 3;

    // Downtime risk
    if (maintenanceData.requiresDowntime) riskScore += 3;

    // Business hours risk
    const startTime = new Date(maintenanceData.startTime);
    const hour = startTime.getHours();
    if (hour >= 8 && hour <= 18) riskScore += 2; // Business hours

    // Weekend vs weekday
    const dayOfWeek = startTime.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) riskScore -= 1; // Weekend is lower risk

    if (riskScore >= 8) return 'critical';
    else if (riskScore >= 6) return 'high';
    else if (riskScore >= 3) return 'medium';
    else return 'low';
  }

  /**
   * Updates internal maintenance metrics
   * @private
   * @param {string} operation - Operation type (scheduled, completed, cancelled, etc.)
   */
  updateMaintenanceMetrics(operation) {
    switch (operation) {
      case 'scheduled':
        this.maintenanceMetrics.totalScheduled++;
        break;
      case 'completed':
        this.maintenanceMetrics.totalCompleted++;
        break;
      case 'cancelled':
        this.maintenanceMetrics.totalCancelled++;
        break;
    }
    
    this.maintenanceMetrics.lastUpdated = new Date();
  }

  /**
   * Sanitizes maintenance data for logging (removes sensitive information)
   * @private
   * @param {Object} maintenanceData - Raw maintenance data
   * @returns {Object} Sanitized maintenance data
   */
  sanitizeMaintenanceData(maintenanceData) {
    const sensitiveFields = ['credentials', 'apiKeys', 'tokens', 'passwords'];
    const sanitized = { ...maintenanceData };
    
    sensitiveFields.forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    });

    return sanitized;
  }

  /**
   * Initializes default maintenance handlers for common services
   * @private
   */
  initializeDefaultHandlers() {
    // Database maintenance handler
    this.registerMaintenanceHandler('database', {
      preMaintenanceTasks: async (platform, maintenance) => {
        logger.info('Executing database pre-maintenance tasks', {
          maintenanceId: maintenance.id,
          platformId: platform.platformId
        });
        // Implementation would include: backup creation, read replica setup, etc.
      },
      postMaintenanceTasks: async (platform, maintenance, completionData) => {
        logger.info('Executing database post-maintenance tasks', {
          maintenanceId: maintenance.id,
          platformId: platform.platformId
        });
        // Implementation would include: integrity checks, performance validation, etc.
      }
    });

    // Cache maintenance handler
    this.registerMaintenanceHandler('cache', {
      preMaintenanceTasks: async (platform, maintenance) => {
        logger.info('Executing cache pre-maintenance tasks', {
          maintenanceId: maintenance.id
        });
        // Implementation: cache warming, state preservation, etc.
      },
      postMaintenanceTasks: async (platform, maintenance, completionData) => {
        logger.info('Executing cache post-maintenance tasks', {
          maintenanceId: maintenance.id
        });
        // Implementation: cache invalidation, rebuilding, etc.
      }
    });

    // Load balancer maintenance handler
    this.registerMaintenanceHandler('loadbalancer', {
      preMaintenanceTasks: async (platform, maintenance) => {
        logger.info('Executing load balancer pre-maintenance tasks', {
          maintenanceId: maintenance.id
        });
        // Implementation: traffic rerouting, health check updates, etc.
      },
      postMaintenanceTasks: async (platform, maintenance, completionData) => {
        logger.info('Executing load balancer post-maintenance tasks', {
          maintenanceId: maintenance.id
        });
        // Implementation: traffic restoration, health verification, etc.
      }
    });

    logger.info('Default maintenance handlers initialized', {
      handlersCount: this.maintenanceHandlers.size
    });
  }

  /**
   * Starts background processes for maintenance management
   * @private
   */
  startBackgroundProcesses() {
    // Cleanup expired scheduled jobs every hour
    setInterval(async () => {
      await this.cleanupExpiredJobs();
    }, 60 * 60 * 1000);

    // Update metrics every 5 minutes
    setInterval(async () => {
      await this.updateSystemMetrics();
    }, 5 * 60 * 1000);

    // Health check for active maintenance windows every minute
    setInterval(async () => {
      await this.monitorActiveMaintenanceWindows();
    }, 60 * 1000);

    logger.info('Background processes started for maintenance service');
  }

  /**
   * Cleans up expired scheduled jobs
   * @private
   * @async
   */
  async cleanupExpiredJobs() {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [jobKey, job] of this.scheduledJobs) {
      try {
        // Check if job is expired (older than 24 hours)
        if (job.scheduledTime && (now - job.scheduledTime) > 24 * 60 * 60 * 1000) {
          job.stop();
          this.scheduledJobs.delete(jobKey);
          cleanedCount++;
        }
      } catch (error) {
        logger.error('Error cleaning up expired job', {
          jobKey,
          error: error.message
        });
      }
    }

    if (cleanedCount > 0) {
      logger.info('Cleaned up expired maintenance jobs', {
        cleanedCount,
        remainingJobs: this.scheduledJobs.size
      });
    }
  }

  /**
   * Updates system metrics for monitoring
   * @private
   * @async
   */
  async updateSystemMetrics() {
    try {
      const activeWindows = await this.getActiveMaintenanceWindows({ fromCache: false });
      
      // Update active maintenance tracking
      this.activeMaintenanceWindows.clear();
      activeWindows.forEach(window => {
        this.activeMaintenanceWindows.add(window.id);
      });

      logger.debug('Updated system metrics', {
        activeMaintenanceCount: this.activeMaintenanceWindows.size,
        scheduledJobsCount: this.scheduledJobs.size,
        registeredHandlersCount: this.maintenanceHandlers.size
      });

    } catch (error) {
      logger.error('Failed to update system metrics', {
        error: error.message
      });
    }
  }

  /**
   * Monitors active maintenance windows for issues
   * @private
   * @async
   */
  async monitorActiveMaintenanceWindows() {
    try {
      const activeWindows = await this.getActiveMaintenanceWindows({ fromCache: false });
      
      for (const window of activeWindows) {
        // Check for overdue maintenance
        if (window.endTime < new Date() && window.status === MaintenanceService.MAINTENANCE_STATUS.IN_PROGRESS) {
          logger.warn('Maintenance window overdue', {
            maintenanceId: window.id,
            scheduledEndTime: window.endTime,
            currentTime: new Date()
          });

          // Send overdue notification
          await this.sendOverdueMaintenanceNotification(window);
        }

        // Check for maintenance windows that should have started
        if (window.startTime <= new Date() && window.status === MaintenanceService.MAINTENANCE_STATUS.SCHEDULED) {
          logger.warn('Scheduled maintenance window not started', {
            maintenanceId: window.id,
            scheduledStartTime: window.startTime,
            currentTime: new Date()
          });
        }
      }

    } catch (error) {
      logger.error('Failed to monitor active maintenance windows', {
        error: error.message
      });
    }
  }

  /**
   * Clears maintenance-related cache entries
   * @private
   * @async
   */
  async clearMaintenanceCache() {
    try {
      const cacheKeys = Object.values(MaintenanceService.CACHE_KEYS);
      for (const key of cacheKeys) {
        await this.cacheService.delete(`${key}:*`);
      }
      
      logger.debug('Maintenance cache cleared');
    } catch (error) {
      logger.error('Failed to clear maintenance cache', {
        error: error.message
      });
    }
  }

  /**
   * Starts a maintenance window with comprehensive pre-execution tasks
   * @async
   * @param {string} maintenanceId - Maintenance window identifier
   * @param {string} userId - User identifier starting the maintenance
   * @returns {Promise<Object>} Started maintenance window with execution details
   * @throws {AppError} If start operation fails
   */
  async startMaintenanceWindow(maintenanceId, userId) {
    const session = await this.transactionManager.startSession();

    try {
      await session.startTransaction();

      const platform = await PlatformModel.findOne({
        'maintenanceWindows.id': maintenanceId
      }).session(session);

      if (!platform) {
        throw new AppError('Maintenance window not found', 404);
      }

      const maintenance = platform.maintenanceWindows.find(m => m.id === maintenanceId);
      
      if (maintenance.status !== MaintenanceService.MAINTENANCE_STATUS.SCHEDULED) {
        throw new AppError('Can only start scheduled maintenance windows', 400);
      }

      maintenance.status = MaintenanceService.MAINTENANCE_STATUS.IN_PROGRESS;
      maintenance.actualStartTime = new Date();
      maintenance.startedBy = userId;

      await this.executePreMaintenanceTasks(platform, maintenance);
      await platform.save({ session });

      this.updateMaintenanceMetrics('started');
      this.activeMaintenanceWindows.add(maintenanceId);

      await this.auditService.log({
        userId,
        action: 'maintenance.start',
        resource: 'maintenance_window',
        resourceId: maintenanceId,
        details: {
          platformId: platform.platformId,
          actualStartTime: maintenance.actualStartTime,
          scheduledStartTime: maintenance.startTime
        },
        session
      });

      await session.commitTransaction();

      await this.clearMaintenanceCache();
      await this.updatePlatformMaintenanceStatus(platform.platformId, true);
      await this.emitMaintenanceEvent(MaintenanceService.EVENTS.MAINTENANCE_STARTED, {
        maintenance: maintenance.toObject(),
        platformId: platform.platformId,
        userId,
        timestamp: new Date()
      });

      await this.sendMaintenanceNotification(platform, maintenance, 'started');

      logger.info('Maintenance window started successfully', {
        maintenanceId,
        platformId: platform.platformId,
        userId
      });

      return {
        ...maintenance.toObject(),
        platformId: platform.platformId,
        environment: platform.deployment.environment,
        startMetadata: {
          started: true,
          actualStartTime: maintenance.actualStartTime,
          preTasksCompleted: true
        }
      };

    } catch (error) {
      await session.abortTransaction();
      this.activeMaintenanceWindows.delete(maintenanceId);
      throw error instanceof AppError ? error : new AppError(`Failed to start maintenance: ${error.message}`, 500);
    } finally {
      await session.endSession();
    }
  }

  /**
   * Completes a maintenance window with comprehensive post-execution tasks
   * @async
   * @param {string} maintenanceId - Maintenance window identifier
   * @param {Object} completionData - Completion details and summary
   * @param {string} userId - User identifier completing the maintenance
   * @returns {Promise<Object>} Completed maintenance window with execution report
   * @throws {AppError} If completion operation fails
   */
  async completeMaintenanceWindow(maintenanceId, completionData, userId) {
    const session = await this.transactionManager.startSession();

    try {
      await session.startTransaction();

      const platform = await PlatformModel.findOne({
        'maintenanceWindows.id': maintenanceId
      }).session(session);

      if (!platform) {
        throw new AppError('Maintenance window not found', 404);
      }

      const maintenance = platform.maintenanceWindows.find(m => m.id === maintenanceId);
      
      if (maintenance.status !== MaintenanceService.MAINTENANCE_STATUS.IN_PROGRESS) {
        throw new AppError('Can only complete in-progress maintenance windows', 400);
      }

      maintenance.status = MaintenanceService.MAINTENANCE_STATUS.COMPLETED;
      maintenance.completedAt = new Date();
      maintenance.completedBy = userId;
      maintenance.completionSummary = completionData.summary;
      maintenance.tasksCompleted = completionData.tasksCompleted;
      maintenance.issuesEncountered = completionData.issuesEncountered;

      if (completionData.summary) {
        maintenance.notes = `${maintenance.notes || ''}\n${completionData.summary}`.trim();
      }

      await this.executePostMaintenanceTasks(platform, maintenance, completionData);
      await platform.save({ session });

      this.updateMaintenanceMetrics('completed');
      this.activeMaintenanceWindows.delete(maintenanceId);

      const executionReport = await this.generateMaintenanceReport(platform, maintenance, completionData);

      await this.auditService.log({
        userId,
        action: 'maintenance.complete',
        resource: 'maintenance_window',
        resourceId: maintenanceId,
        details: {
          platformId: platform.platformId,
          duration: maintenance.completedAt - (maintenance.actualStartTime || maintenance.startTime),
          summary: completionData.summary,
          tasksCompleted: completionData.tasksCompleted?.length || 0
        },
        session
      });

      await session.commitTransaction();

      await this.clearMaintenanceCache();
      await this.updatePlatformMaintenanceStatus(platform.platformId, false);
      await this.emitMaintenanceEvent(MaintenanceService.EVENTS.MAINTENANCE_COMPLETED, {
        maintenance: maintenance.toObject(),
        completionData,
        platformId: platform.platformId,
        userId,
        timestamp: new Date()
      });

      await this.sendMaintenanceNotification(platform, maintenance, 'completed');

      logger.info('Maintenance window completed successfully', {
        maintenanceId,
        platformId: platform.platformId,
        duration: maintenance.completedAt - (maintenance.actualStartTime || maintenance.startTime),
        userId
      });

      return {
        ...maintenance.toObject(),
        platformId: platform.platformId,
        environment: platform.deployment.environment,
        executionReport,
        completionMetadata: {
          completed: true,
          actualDuration: maintenance.completedAt - (maintenance.actualStartTime || maintenance.startTime),
          reportGenerated: true
        }
      };

    } catch (error) {
      await session.abortTransaction();
      throw error instanceof AppError ? error : new AppError(`Failed to complete maintenance: ${error.message}`, 500);
    } finally {
      await session.endSession();
    }
  }

  /**
   * Extends a maintenance window with proper validation and notification
   * @async
   * @param {string} maintenanceId - Maintenance window identifier
   * @param {Object} extensionData - Extension details including duration and reason
   * @param {string} userId - User identifier extending the maintenance
   * @returns {Promise<Object>} Extended maintenance window
   * @throws {AppError} If extension operation fails
   */
  async extendMaintenanceWindow(maintenanceId, extensionData, userId) {
    const session = await this.transactionManager.startSession();

    try {
      await session.startTransaction();

      const platform = await PlatformModel.findOne({
        'maintenanceWindows.id': maintenanceId
      }).session(session);

      if (!platform) {
        throw new AppError('Maintenance window not found', 404);
      }

      const maintenance = platform.maintenanceWindows.find(m => m.id === maintenanceId);
      
      if (maintenance.status !== MaintenanceService.MAINTENANCE_STATUS.IN_PROGRESS) {
        throw new AppError('Can only extend in-progress maintenance windows', 400);
      }

      const originalEndTime = new Date(maintenance.endTime);
      const extensionMs = extensionData.extensionMinutes * 60 * 1000;
      const newEndTime = new Date(originalEndTime.getTime() + extensionMs);

      const tempMaintenance = { ...maintenance.toObject(), endTime: newEndTime };
      await this.checkMaintenanceConflicts(platform, tempMaintenance, maintenanceId);

      maintenance.endTime = newEndTime;
      maintenance.extensionHistory = maintenance.extensionHistory || [];
      maintenance.extensionHistory.push({
        originalEndTime,
        newEndTime,
        extensionMinutes: extensionData.extensionMinutes,
        reason: extensionData.reason,
        extendedBy: userId,
        extendedAt: new Date()
      });

      maintenance.notes = `${maintenance.notes || ''}\nExtended by ${extensionData.extensionMinutes} minutes: ${extensionData.reason}`.trim();

      await platform.save({ session });
      await this.rescheduleMaintenanceCompletionTasks(platform.platformId, maintenance);

      await this.auditService.log({
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

      await this.clearMaintenanceCache();
      await this.updatePlatformMaintenanceStatus(platform.platformId, true, newEndTime);
      await this.emitMaintenanceEvent(MaintenanceService.EVENTS.MAINTENANCE_EXTENDED, {
        maintenance: maintenance.toObject(),
        extensionData,
        platformId: platform.platformId,
        userId,
        timestamp: new Date()
      });

      await this.sendMaintenanceNotification(platform, maintenance, 'extended', 
        `Extended by ${extensionData.extensionMinutes} minutes`);

      logger.info('Maintenance window extended successfully', {
        maintenanceId,
        platformId: platform.platformId,
        extensionMinutes: extensionData.extensionMinutes,
        newEndTime,
        userId
      });

      return {
        ...maintenance.toObject(),
        platformId: platform.platformId,
        environment: platform.deployment.environment,
        extensionMetadata: {
          extended: true,
          extensionCount: maintenance.extensionHistory.length,
          totalExtensionTime: maintenance.extensionHistory.reduce((sum, ext) => sum + ext.extensionMinutes, 0)
        }
      };

    } catch (error) {
      await session.abortTransaction();
      throw error instanceof AppError ? error : new AppError(`Failed to extend maintenance: ${error.message}`, 500);
    } finally {
      await session.endSession();
    }
  }

  /**
   * Pauses an in-progress maintenance window
   * @async
   * @param {string} maintenanceId - Maintenance window identifier
   * @param {string} reason - Reason for pausing the maintenance
   * @param {string} userId - User identifier pausing the maintenance
   * @returns {Promise<Object>} Paused maintenance window
   * @throws {AppError} If pause operation fails
   */
  async pauseMaintenanceWindow(maintenanceId, reason, userId) {
    const session = await this.transactionManager.startSession();

    try {
      await session.startTransaction();

      const platform = await PlatformModel.findOne({
        'maintenanceWindows.id': maintenanceId
      }).session(session);

      if (!platform) {
        throw new AppError('Maintenance window not found', 404);
      }

      const maintenance = platform.maintenanceWindows.find(m => m.id === maintenanceId);
      
      if (maintenance.status !== MaintenanceService.MAINTENANCE_STATUS.IN_PROGRESS) {
        throw new AppError('Can only pause in-progress maintenance windows', 400);
      }

      maintenance.status = MaintenanceService.MAINTENANCE_STATUS.PAUSED;
      maintenance.pausedAt = new Date();
      maintenance.pausedBy = userId;
      maintenance.pauseReason = reason;

      await this.executePauseMaintenanceTasks(platform, maintenance);
      await platform.save({ session });

      await this.auditService.log({
        userId,
        action: 'maintenance.pause',
        resource: 'maintenance_window',
        resourceId: maintenanceId,
        details: {
          platformId: platform.platformId,
          reason,
          pausedAt: maintenance.pausedAt
        },
        session
      });

      await session.commitTransaction();

      await this.clearMaintenanceCache();
      await this.emitMaintenanceEvent(MaintenanceService.EVENTS.MAINTENANCE_PAUSED, {
        maintenance: maintenance.toObject(),
        reason,
        platformId: platform.platformId,
        userId,
        timestamp: new Date()
      });

      await this.sendMaintenanceNotification(platform, maintenance, 'paused', reason);

      logger.info('Maintenance window paused successfully', {
        maintenanceId,
        platformId: platform.platformId,
        reason,
        userId
      });

      return {
        ...maintenance.toObject(),
        platformId: platform.platformId,
        environment: platform.deployment.environment,
        pauseMetadata: {
          paused: true,
          pausedAt: maintenance.pausedAt,
          reason
        }
      };

    } catch (error) {
      await session.abortTransaction();
      throw error instanceof AppError ? error : new AppError(`Failed to pause maintenance: ${error.message}`, 500);
    } finally {
      await session.endSession();
    }
  }

  /**
   * Resumes a paused maintenance window
   * @async
   * @param {string} maintenanceId - Maintenance window identifier
   * @param {string} userId - User identifier resuming the maintenance
   * @returns {Promise<Object>} Resumed maintenance window
   * @throws {AppError} If resume operation fails
   */
  async resumeMaintenanceWindow(maintenanceId, userId) {
    const session = await this.transactionManager.startSession();

    try {
      await session.startTransaction();

      const platform = await PlatformModel.findOne({
        'maintenanceWindows.id': maintenanceId
      }).session(session);

      if (!platform) {
        throw new AppError('Maintenance window not found', 404);
      }

      const maintenance = platform.maintenanceWindows.find(m => m.id === maintenanceId);
      
      if (maintenance.status !== MaintenanceService.MAINTENANCE_STATUS.PAUSED) {
        throw new AppError('Can only resume paused maintenance windows', 400);
      }

      const pauseDuration = new Date() - maintenance.pausedAt;
      maintenance.status = MaintenanceService.MAINTENANCE_STATUS.IN_PROGRESS;
      maintenance.resumedAt = new Date();
      maintenance.resumedBy = userId;
      maintenance.endTime = new Date(maintenance.endTime.getTime() + pauseDuration);

      maintenance.pauseHistory = maintenance.pauseHistory || [];
      maintenance.pauseHistory.push({
        pausedAt: maintenance.pausedAt,
        resumedAt: maintenance.resumedAt,
        pauseDuration,
        pauseReason: maintenance.pauseReason,
        pausedBy: maintenance.pausedBy,
        resumedBy: userId
      });

      delete maintenance.pausedAt;
      delete maintenance.pausedBy;
      delete maintenance.pauseReason;

      await this.executeResumeMaintenanceTasks(platform, maintenance);
      await platform.save({ session });

      await this.auditService.log({
        userId,
        action: 'maintenance.resume',
        resource: 'maintenance_window',
        resourceId: maintenanceId,
        details: {
          platformId: platform.platformId,
          pauseDuration,
          newEndTime: maintenance.endTime
        },
        session
      });

      await session.commitTransaction();

      await this.clearMaintenanceCache();
      await this.emitMaintenanceEvent(MaintenanceService.EVENTS.MAINTENANCE_RESUMED, {
        maintenance: maintenance.toObject(),
        pauseDuration,
        platformId: platform.platformId,
        userId,
        timestamp: new Date()
      });

      await this.sendMaintenanceNotification(platform, maintenance, 'resumed');

      logger.info('Maintenance window resumed successfully', {
        maintenanceId,
        platformId: platform.platformId,
        pauseDuration,
        userId
      });

      return {
        ...maintenance.toObject(),
        platformId: platform.platformId,
        environment: platform.deployment.environment,
        resumeMetadata: {
          resumed: true,
          pauseDuration,
          totalPauseCount: maintenance.pauseHistory.length
        }
      };

    } catch (error) {
      await session.abortTransaction();
      throw error instanceof AppError ? error : new AppError(`Failed to resume maintenance: ${error.message}`, 500);
    } finally {
      await session.endSession();
    }
  }

  /**
   * Retrieves scheduled maintenance windows with comprehensive filtering and pagination
   * @async
   * @param {Object} filters - Query filters and pagination options
   * @returns {Promise<Object>} Scheduled maintenance windows with pagination metadata
   * @throws {AppError} If retrieval fails
   */
  async getScheduledMaintenanceWindows(filters = {}) {
    try {
      const {
        environment,
        startDate = new Date(),
        endDate,
        page = 1,
        limit = 20,
        fromCache = true,
        sortBy = 'startTime',
        sortOrder = 'asc'
      } = filters;

      if (fromCache && page === 1) {
        const cacheKey = `${MaintenanceService.CACHE_KEYS.SCHEDULED_MAINTENANCE}:${environment || 'all'}:${sortBy}:${sortOrder}`;
        const cached = await this.cacheService.get(cacheKey);
        if (cached) {
          return cached;
        }
      }

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

      const platforms = await PlatformModel.find(query)
        .select('platformId deployment.environment maintenanceWindows')
        .lean();

      const scheduledWindows = [];

      for (const platform of platforms) {
        for (const window of platform.maintenanceWindows || []) {
          if (window.status === MaintenanceService.MAINTENANCE_STATUS.SCHEDULED &&
              window.startTime >= startDate &&
              (!endDate || window.startTime <= endDate)) {
            
            scheduledWindows.push({
              ...window,
              platformId: platform.platformId,
              environment: platform.deployment.environment,
              timeUntilStart: window.startTime - new Date(),
              estimatedDuration: window.endTime - window.startTime,
              riskAssessment: this.assessMaintenanceRisk(window),
              impactAssessment: this.calculateMaintenanceImpact(window)
            });
          }
        }
      }

      this.sortMaintenanceWindows(scheduledWindows, sortBy, sortOrder);

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
          pages: Math.ceil(total / limit),
          hasNextPage: endIndex < total,
          hasPreviousPage: startIndex > 0
        },
        summary: {
          totalScheduled: total,
          highPriority: scheduledWindows.filter(w => w.priority === MaintenanceService.MAINTENANCE_PRIORITY.HIGH).length,
          criticalPriority: scheduledWindows.filter(w => w.priority === MaintenanceService.MAINTENANCE_PRIORITY.CRITICAL).length,
          requiresDowntime: scheduledWindows.filter(w => w.requiresDowntime).length
        }
      };

      if (fromCache && page === 1) {
        const cacheKey = `${MaintenanceService.CACHE_KEYS.SCHEDULED_MAINTENANCE}:${environment || 'all'}:${sortBy}:${sortOrder}`;
        await this.cacheService.set(cacheKey, result, 300);
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
   * Retrieves comprehensive maintenance history with advanced filtering
   * @async
   * @param {Object} filters - Historical query filters and options
   * @returns {Promise<Object>} Maintenance history with analytics
   * @throws {AppError} If history retrieval fails
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
        limit = 50,
        includeAnalytics = false,
        sortBy = 'startTime',
        sortOrder = 'desc'
      } = filters;

      const query = {};
      if (environment) query['deployment.environment'] = environment;
      if (platformId) query.platformId = platformId;

      const platforms = await PlatformModel.find(query)
        .select('platformId deployment.environment maintenanceWindows')
        .lean();

      const allWindows = [];

      for (const platform of platforms) {
        for (const window of platform.maintenanceWindows || []) {
          if (status && window.status !== status) continue;
          if (startDate && window.startTime < startDate) continue;
          if (endDate && window.startTime > endDate) continue;

          const enhancedWindow = {
            ...window,
            platformId: platform.platformId,
            environment: platform.deployment.environment,
            actualDuration: this.calculateActualDuration(window),
            scheduledDuration: window.endTime - window.startTime,
            wasExtended: !!(window.extensionHistory && window.extensionHistory.length > 0),
            wasPaused: !!(window.pauseHistory && window.pauseHistory.length > 0),
            completionStatus: this.getCompletionStatus(window)
          };

          if (includeAnalytics) {
            enhancedWindow.performanceMetrics = this.calculateMaintenancePerformanceMetrics(window);
            enhancedWindow.complianceStatus = this.assessMaintenanceCompliance(window);
          }

          allWindows.push(enhancedWindow);
        }
      }

      this.sortMaintenanceWindows(allWindows, sortBy, sortOrder);

      const total = allWindows.length;
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedWindows = allWindows.slice(startIndex, endIndex);

      const result = {
        maintenanceWindows: paginatedWindows,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
          hasNextPage: endIndex < total,
          hasPreviousPage: startIndex > 0
        }
      };

      if (includeAnalytics) {
        result.analytics = this.generateHistoryAnalytics(allWindows);
      }

      return result;

    } catch (error) {
      logger.error('Failed to get maintenance history', {
        filters,
        error: error.message
      });
      throw new AppError(`Failed to get maintenance history: ${error.message}`, 500);
    }
  }

  /**
   * Generates comprehensive maintenance statistics and analytics
   * @async
   * @param {Object} options - Statistics generation options
   * @returns {Promise<Object>} Detailed maintenance statistics
   * @throws {AppError} If statistics generation fails
   */
  async getMaintenanceStatistics(options = {}) {
    try {
      const {
        environment,
        startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
        endDate = new Date(),
        fromCache = true,
        includeProjections = false
      } = options;

      if (fromCache) {
        const cacheKey = `${MaintenanceService.CACHE_KEYS.MAINTENANCE_STATS}:${environment || 'all'}:${includeProjections}`;
        const cached = await this.cacheService.get(cacheKey);
        if (cached) {
          return cached;
        }
      }

      const query = {};
      if (environment) query['deployment.environment'] = environment;

      const platforms = await PlatformModel.find(query)
        .select('maintenanceWindows')
        .lean();

      const statistics = {
        period: { startDate, endDate },
        overview: {
          total: 0,
          completed: 0,
          cancelled: 0,
          inProgress: 0,
          scheduled: 0
        },
        byType: {},
        byPriority: {},
        performance: {
          averageDuration: 0,
          averageDelay: 0,
          onTimeCompletionRate: 0,
          extensionRate: 0
        },
        impact: {
          totalDowntime: 0,
          affectedServices: new Set(),
          downtimeByService: {}
        },
        trends: {
          monthlyBreakdown: {},
          weeklyPattern: {},
          dailyPattern: {}
        },
        compliance: {
          completionRate: 0,
          averageNotificationTime: 0,
          documentationCompliance: 0
        }
      };

      let totalDuration = 0;
      let totalDelay = 0;
      let completedCount = 0;
      let onTimeCount = 0;
      let extendedCount = 0;

      for (const platform of platforms) {
        for (const window of platform.maintenanceWindows || []) {
          if (window.startTime < startDate || window.startTime > endDate) continue;

          statistics.overview.total++;
          statistics.overview[window.status] = (statistics.overview[window.status] || 0) + 1;
          statistics.byType[window.type] = (statistics.byType[window.type] || 0) + 1;
          statistics.byPriority[window.priority || 'medium'] = (statistics.byPriority[window.priority || 'medium'] || 0) + 1;

          if (window.affectedServices) {
            window.affectedServices.forEach(service => {
              statistics.impact.affectedServices.add(service);
              if (window.requiresDowntime && window.status === MaintenanceService.MAINTENANCE_STATUS.COMPLETED) {
                const duration = this.calculateActualDuration(window);
                statistics.impact.downtimeByService[service] = (statistics.impact.downtimeByService[service] || 0) + duration;
              }
            });
          }

          if (window.status === MaintenanceService.MAINTENANCE_STATUS.COMPLETED) {
            const actualDuration = this.calculateActualDuration(window);
            const scheduledDuration = window.endTime - window.startTime;
            totalDuration += actualDuration;
            completedCount++;

            if (actualDuration <= scheduledDuration * 1.1) {
              onTimeCount++;
            }

            if (window.completedAt > window.endTime) {
              totalDelay += (window.completedAt - window.endTime);
            }

            if (window.extensionHistory && window.extensionHistory.length > 0) {
              extendedCount++;
            }

            if (window.requiresDowntime) {
              statistics.impact.totalDowntime += actualDuration;
            }
          }

          this.updateTrendStatistics(statistics.trends, window);
        }
      }

      if (completedCount > 0) {
        statistics.performance.averageDuration = Math.round(totalDuration / completedCount);
        statistics.performance.averageDelay = Math.round(totalDelay / completedCount);
        statistics.performance.onTimeCompletionRate = Math.round((onTimeCount / completedCount) * 100);
        statistics.performance.extensionRate = Math.round((extendedCount / completedCount) * 100);
      }

      if (statistics.overview.total > 0) {
        statistics.compliance.completionRate = Math.round((statistics.overview.completed / statistics.overview.total) * 100);
      }

      statistics.impact.affectedServices = Array.from(statistics.impact.affectedServices);

      if (includeProjections) {
        statistics.projections = this.generateMaintenanceProjections(statistics);
      }

      if (fromCache) {
        const cacheKey = `${MaintenanceService.CACHE_KEYS.MAINTENANCE_STATS}:${environment || 'all'}:${includeProjections}`;
        await this.cacheService.set(cacheKey, statistics, 3600);
      }

      return statistics;

    } catch (error) {
      logger.error('Failed to get maintenance statistics', {
        options,
        error: error.message
      });
      throw new AppError(`Failed to get maintenance statistics: ${error.message}`, 500);
    }
  }

  /**
   * Validates a maintenance window configuration comprehensively
   * @async
   * @param {Object} maintenanceData - Maintenance window data to validate
   * @returns {Promise<Object>} Validation results with detailed feedback
   * @throws {AppError} If validation encounters system errors
   */
  async validateMaintenanceWindow(maintenanceData) {
    try {
      const validation = {
        valid: true,
        errors: [],
        warnings: [],
        suggestions: [],
        riskAssessment: null,
        impactAssessment: null
      };

      await this.validateMaintenanceData(maintenanceData);

      if (maintenanceData.startTime && maintenanceData.endTime) {
        const startTime = new Date(maintenanceData.startTime);
        const endTime = new Date(maintenanceData.endTime);
        const duration = endTime - startTime;

        if (duration < 30 * 60 * 1000) {
          validation.warnings.push('Maintenance window duration is less than 30 minutes');
        }

        if (duration > 8 * 60 * 60 * 1000) {
          validation.warnings.push('Long maintenance window detected (>8 hours). Consider breaking into smaller windows.');
        }

        const businessHours = this.isBusinessHours(startTime);
        if (businessHours && maintenanceData.requiresDowntime) {
          validation.warnings.push('Maintenance requiring downtime is scheduled during business hours');
          validation.suggestions.push('Consider scheduling during off-peak hours (weekends or late evening)');
        }

        const timeUntilStart = startTime - new Date();
        if (timeUntilStart < 24 * 60 * 60 * 1000 && maintenanceData.type === MaintenanceService.MAINTENANCE_TYPES.SCHEDULED) {
          validation.warnings.push('Maintenance is scheduled within 24 hours with limited advance notice');
        }

        validation.riskAssessment = this.assessMaintenanceRisk(maintenanceData);
        validation.impactAssessment = this.calculateMaintenanceImpact(maintenanceData);

        if (validation.riskAssessment === 'high' || validation.riskAssessment === 'critical') {
          validation.suggestions.push('Consider implementing additional backup and rollback procedures');
          validation.suggestions.push('Ensure dedicated monitoring during maintenance execution');
        }

        try {
          const conflictAnalysis = await this.analyzeMaintenanceConflicts(maintenanceData);
          if (conflictAnalysis.conflicts.length > 0) {
            conflictAnalysis.conflicts.forEach(conflict => {
              validation.warnings.push(`Potential scheduling conflict: ${conflict.description}`);
            });
          }
        } catch (error) {
          logger.warn('Could not perform conflict analysis during validation', {
            error: error.message
          });
        }
      }

      if (maintenanceData.affectedServices && Array.isArray(maintenanceData.affectedServices)) {
        if (maintenanceData.affectedServices.length > 5) {
          validation.warnings.push('Large number of affected services may indicate complex maintenance');
          validation.suggestions.push('Consider service dependency analysis and staged maintenance approach');
        }

        const criticalServices = this.identifyCriticalServices(maintenanceData.affectedServices);
        if (criticalServices.length > 0) {
          validation.warnings.push(`Critical services affected: ${criticalServices.join(', ')}`);
          validation.suggestions.push('Ensure additional approval and notification for critical service maintenance');
        }
      }

      return validation;

    } catch (error) {
      logger.error('Failed to validate maintenance window', {
        error: error.message
      });
      throw new AppError(`Failed to validate maintenance window: ${error.message}`, 500);
    }
  }

  /**
   * Registers a maintenance handler for specific service types
   * @param {string} handlerName - Unique identifier for the handler
   * @param {Object} handler - Handler implementation with required methods
   * @throws {AppError} If handler registration fails
   */
  registerMaintenanceHandler(handlerName, handler) {
    if (!handler || typeof handler !== 'object') {
      throw new AppError('Handler must be a valid object', 400);
    }

    const requiredMethods = ['preMaintenanceTasks', 'postMaintenanceTasks'];
    for (const method of requiredMethods) {
      if (typeof handler[method] !== 'function') {
        throw new AppError(`Handler must implement ${method} method`, 400);
      }
    }

    this.maintenanceHandlers.set(handlerName, {
      ...handler,
      registeredAt: new Date(),
      callCount: 0,
      lastCalled: null
    });

    logger.info('Maintenance handler registered successfully', {
      handlerName,
      totalHandlers: this.maintenanceHandlers.size
    });
  }

  /**
   * Checks if the system is currently in maintenance mode
   * @async
   * @param {string} platformId - Optional platform identifier for specific platform check
   * @returns {Promise<boolean>} Current maintenance status
   */
  async isInMaintenance(platformId) {
    try {
      if (platformId) {
        const status = await this.cacheService.get(`platform:status:${platformId}`);
        if (status && status.inMaintenance) {
          return true;
        }
      }

      return this.activeMaintenanceWindows.size > 0;

    } catch (error) {
      logger.error('Failed to check maintenance status', {
        platformId,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Schedules automated tasks for a maintenance window
   * @private
   * @param {string} platformId - Platform identifier
   * @param {Object} maintenance - Maintenance window object
   * @returns {Promise<void>}
   */
  async scheduleMaintenanceTasks(platformId, maintenance) {
    const jobKey = `${platformId}:${maintenance.id}`;

    if (this.config.enableAutoStart) {
      const startTime = new Date(maintenance.startTime);
      if (startTime > new Date()) {
        const startJob = cron.schedule(
          this.dateToCron(startTime),
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
        this.scheduledJobs.set(`${jobKey}:start`, { job: startJob, scheduledTime: Date.now() });
      }
    }

    if (maintenance.notifications?.enabled) {
      for (const minutes of maintenance.notifications.advanceMinutes || this.config.defaultNotificationAdvanceTime) {
        const reminderTime = new Date(maintenance.startTime.getTime() - minutes * 60 * 1000);
        
        if (reminderTime > new Date()) {
          const reminderJob = cron.schedule(
            this.dateToCron(reminderTime),
            async () => {
              try {
                await this.sendMaintenanceReminder(platformId, maintenance, minutes);
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
          this.scheduledJobs.set(`${jobKey}:reminder:${minutes}`, { job: reminderJob, scheduledTime: Date.now() });
        }
      }
    }

    logger.debug('Maintenance tasks scheduled', {
      maintenanceId: maintenance.id,
      platformId,
      jobsScheduled: this.scheduledJobs.size
    });
  }

  /**
   * Schedules maintenance notification delivery
   * @private
   * @param {string} platformId - Platform identifier
   * @param {Object} maintenance - Maintenance window object
   * @returns {Promise<void>}
   */
  async scheduleMaintenanceNotifications(platformId, maintenance) {
    const notificationSchedule = maintenance.notifications || {
      enabled: true,
      advanceMinutes: this.config.defaultNotificationAdvanceTime,
      channels: ['email', 'webhook']
    };

    if (notificationSchedule.enabled) {
      for (const minutes of notificationSchedule.advanceMinutes) {
        const notificationTime = new Date(maintenance.startTime.getTime() - minutes * 60 * 1000);
        
        if (notificationTime > new Date()) {
          await this.cacheService.set(
            `notification:${maintenance.id}:${minutes}`,
            {
              maintenanceId: maintenance.id,
              platformId,
              type: 'reminder',
              scheduledFor: notificationTime,
              channels: notificationSchedule.channels
            },
            notificationTime - new Date()
          );
        }
      }
    }
  }

  /**
   * Cancels all scheduled tasks for a maintenance window
   * @private
   * @param {string} platformId - Platform identifier
   * @param {string} maintenanceId - Maintenance window identifier
   * @returns {Promise<void>}
   */
  async cancelMaintenanceTasks(platformId, maintenanceId) {
    const jobKeyPrefix = `${platformId}:${maintenanceId}`;
    let cancelledCount = 0;

    for (const [key, jobData] of this.scheduledJobs) {
      if (key.startsWith(jobKeyPrefix)) {
        try {
          jobData.job.stop();
          this.scheduledJobs.delete(key);
          cancelledCount++;
        } catch (error) {
          logger.error('Failed to cancel scheduled job', {
            jobKey: key,
            error: error.message
          });
        }
      }
    }

    logger.debug('Cancelled maintenance tasks', {
      maintenanceId,
      platformId,
      cancelledCount
    });
  }

  /**
   * Cancels scheduled maintenance notifications
   * @private
   * @param {string} platformId - Platform identifier
   * @param {string} maintenanceId - Maintenance window identifier
   * @returns {Promise<void>}
   */
  async cancelMaintenanceNotifications(platformId, maintenanceId) {
    const notificationKeys = [
      `notification:${maintenanceId}:*`,
      `reminder:${maintenanceId}:*`
    ];

    for (const keyPattern of notificationKeys) {
      await this.cacheService.delete(keyPattern);
    }
  }

  /**
   * Sends maintenance notifications through configured channels
   * @private
   * @param {Object} platform - Platform object
   * @param {Object} maintenance - Maintenance window object
   * @param {string} type - Notification type
   * @param {string} additionalInfo - Additional information for the notification
   * @returns {Promise<void>}
   */
  async sendMaintenanceNotification(platform, maintenance, type, additionalInfo) {
    const notificationTemplates = this.getNotificationTemplates();
    const template = notificationTemplates[type];
    
    if (!template) {
      logger.warn('No notification template found for type', { type });
      return;
    }

    try {
      await this.notificationService.sendToAll({
        type: `maintenance.${type}`,
        title: this.formatTemplate(template.title, { maintenance, platform, additionalInfo }),
        message: this.formatTemplate(template.message, { maintenance, platform, additionalInfo }),
        severity: this.getNotificationSeverity(maintenance, type),
        data: {
          platformId: platform.platformId,
          maintenanceId: maintenance.id,
          type: maintenance.type,
          startTime: maintenance.startTime,
          endTime: maintenance.endTime,
          affectedServices: maintenance.affectedServices,
          requiresDowntime: maintenance.requiresDowntime,
          additionalInfo
        },
        channels: maintenance.notifications?.channels || ['email', 'webhook']
      });

      logger.info('Maintenance notification sent', {
        type,
        maintenanceId: maintenance.id,
        platformId: platform.platformId
      });

    } catch (error) {
      logger.error('Failed to send maintenance notification', {
        type,
        maintenanceId: maintenance.id,
        error: error.message
      });
    }
  }

  /**
   * Sends emergency maintenance notifications with escalation
   * @private
   * @param {Object} maintenance - Emergency maintenance window
   * @returns {Promise<void>}
   */
  async sendEmergencyNotifications(maintenance) {
    await this.notificationService.sendToAll({
      type: 'maintenance.emergency',
      title: 'URGENT: Emergency Maintenance Scheduled',
      message: `Emergency maintenance required: ${maintenance.description}`,
      severity: 'critical',
      priority: 'immediate',
      data: {
        maintenanceId: maintenance.id,
        startTime: maintenance.startTime,
        endTime: maintenance.endTime,
        reason: maintenance.metadata?.emergencyReason,
        requiresDowntime: maintenance.requiresDowntime
      },
      channels: ['email', 'sms', 'webhook', 'push'],
      escalate: true
    });
  }

  /**
   * Escalates maintenance to management with detailed information
   * @private
   * @param {Object} maintenance - Maintenance window requiring escalation
   * @param {Object} emergencyData - Emergency details
   * @returns {Promise<void>}
   */
  async escalateToManagement(maintenance, emergencyData) {
    await this.notificationService.sendToManagement({
      type: 'maintenance.escalation',
      title: 'Critical Maintenance Escalation Required',
      message: `Critical maintenance requires management attention: ${maintenance.description}`,
      severity: 'critical',
      data: {
        maintenanceId: maintenance.id,
        escalationLevel: emergencyData.escalationLevel,
        reason: emergencyData.reason,
        estimatedImpact: maintenance.metadata?.estimatedImpact,
        riskLevel: maintenance.metadata?.riskLevel,
        emergencyContact: emergencyData.emergencyContact
      },
      requiresAcknowledgment: true
    });
  }

  /**
   * Emits maintenance events for system integration
   * @private
   * @param {string} eventType - Type of event to emit
   * @param {Object} eventData - Event payload data
   * @returns {Promise<void>}
   */
  async emitMaintenanceEvent(eventType, eventData) {
    try {
      await this.notificationService.emit(eventType, {
        ...eventData,
        eventId: `${eventType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        emittedAt: new Date()
      });

      logger.debug('Maintenance event emitted', {
        eventType,
        maintenanceId: eventData.maintenance?.id,
        platformId: eventData.platformId
      });

    } catch (error) {
      logger.error('Failed to emit maintenance event', {
        eventType,
        error: error.message
      });
    }
  }

  /**
   * Executes cleanup tasks when maintenance is cancelled while in progress
   * @private
   * @param {Object} platform - Platform object
   * @param {Object} maintenance - Maintenance window object
   * @returns {Promise<void>}
   */
  async executeMaintenanceCancellationCleanup(platform, maintenance) {
    for (const service of maintenance.affectedServices || []) {
      const handler = this.maintenanceHandlers.get(service);
      if (handler && handler.cancellationTasks) {
        try {
          await handler.cancellationTasks(platform, maintenance);
        } catch (error) {
          logger.error('Cancellation cleanup task failed', {
            maintenanceId: maintenance.id,
            service,
            error: error.message
          });
        }
      }
    }

    if (maintenance.requiresDowntime) {
      await this.updatePlatformMaintenanceStatus(platform.platformId, false);
    }
  }

  /**
   * Validates maintenance capacity against platform limits
   * @private
   * @param {Object} platform - Platform object
   * @param {Object} maintenanceData - Proposed maintenance data
   * @throws {AppError} If capacity limits are exceeded
   */
  async validateMaintenanceCapacity(platform, maintenanceData) {
    const concurrentCount = platform.maintenanceWindows.filter(w => 
      w.status === MaintenanceService.MAINTENANCE_STATUS.SCHEDULED ||
      w.status === MaintenanceService.MAINTENANCE_STATUS.IN_PROGRESS
    ).length;

    if (concurrentCount >= this.config.maxConcurrentMaintenanceWindows) {
      throw new AppError(
        `Maximum concurrent maintenance windows (${this.config.maxConcurrentMaintenanceWindows}) would be exceeded`,
        400
      );
    }

    const downtimeCount = platform.maintenanceWindows.filter(w => 
      w.requiresDowntime && (
        w.status === MaintenanceService.MAINTENANCE_STATUS.SCHEDULED ||
        w.status === MaintenanceService.MAINTENANCE_STATUS.IN_PROGRESS
      )
    ).length;

    if (maintenanceData.requiresDowntime && downtimeCount > 0) {
      throw new AppError('Cannot schedule multiple maintenance windows requiring downtime simultaneously', 400);
    }
  }

  /**
   * Gets allowed update fields based on maintenance status
   * @private
   * @param {string} status - Current maintenance status
   * @returns {Array<string>} Allowed update fields
   */
  getAllowedUpdatesForStatus(status) {
    const baseFields = ['description', 'notes', 'metadata'];
    
    switch (status) {
      case MaintenanceService.MAINTENANCE_STATUS.SCHEDULED:
        return [...baseFields, 'startTime', 'endTime', 'affectedServices', 'requiresDowntime', 'priority'];
      case MaintenanceService.MAINTENANCE_STATUS.IN_PROGRESS:
        return [...baseFields, 'endTime', 'affectedServices'];
      case MaintenanceService.MAINTENANCE_STATUS.PAUSED:
        return [...baseFields];
      case MaintenanceService.MAINTENANCE_STATUS.COMPLETED:
      case MaintenanceService.MAINTENANCE_STATUS.CANCELLED:
        return ['notes', 'metadata'];
      default:
        return baseFields;
    }
  }

  /**
   * Calculates recurring maintenance dates based on pattern
   * @private
   * @param {Date} baseDate - Starting date for calculations
   * @param {string} pattern - Recurrence pattern
   * @param {string} frequency - Frequency specification
   * @param {number} iteration - Current iteration number
   * @returns {Date} Calculated date for the iteration
   */
  calculateRecurringDate(baseDate, pattern, frequency, iteration) {
    const date = new Date(baseDate);

    switch (pattern.toLowerCase()) {
      case 'daily':
        date.setDate(date.getDate() + iteration);
        break;
      case 'weekly':
        date.setDate(date.getDate() + (iteration * 7));
        break;
      case 'monthly':
        date.setMonth(date.getMonth() + iteration);
        break;
      case 'quarterly':
        date.setMonth(date.getMonth() + (iteration * 3));
        break;
      case 'yearly':
        date.setFullYear(date.getFullYear() + iteration);
        break;
      case 'custom':
        const frequencyDays = parseInt(frequency) || 1;
        date.setDate(date.getDate() + (iteration * frequencyDays));
        break;
      default:
        throw new AppError(`Unsupported recurring pattern: ${pattern}`, 400);
    }

    return date;
  }

  /**
   * Determines if a maintenance window is currently active
   * @private
   * @param {Object} window - Maintenance window object
   * @param {Date} currentTime - Current timestamp for comparison
   * @returns {boolean} Whether the window is active
   */
  isMaintenanceActive(window, currentTime) {
    return (
      window.status === MaintenanceService.MAINTENANCE_STATUS.IN_PROGRESS ||
      window.status === MaintenanceService.MAINTENANCE_STATUS.PAUSED ||
      (window.status === MaintenanceService.MAINTENANCE_STATUS.SCHEDULED && 
       window.startTime <= currentTime && window.endTime >= currentTime)
    );
  }

  /**
   * Calculates remaining time for active maintenance
   * @private
   * @param {Object} window - Maintenance window object
   * @returns {number} Milliseconds remaining
   */
  calculateTimeRemaining(window) {
    if (window.status !== MaintenanceService.MAINTENANCE_STATUS.IN_PROGRESS) {
      return 0;
    }
    
    const now = new Date();
    const remaining = window.endTime - now;
    return Math.max(0, remaining);
  }

  /**
   * Calculates maintenance progress percentage
   * @private
   * @param {Object} window - Maintenance window object
   * @returns {number} Progress percentage (0-100)
   */
  calculateMaintenanceProgress(window) {
    if (window.status === MaintenanceService.MAINTENANCE_STATUS.COMPLETED) {
      return 100;
    }

    if (window.status !== MaintenanceService.MAINTENANCE_STATUS.IN_PROGRESS) {
      return 0;
    }

    const now = new Date();
    const startTime = window.actualStartTime || window.startTime;
    const totalDuration = window.endTime - startTime;
    const elapsed = now - startTime;

    return Math.min(100, Math.max(0, Math.round((elapsed / totalDuration) * 100)));
  }

  /**
   * Retrieves comprehensive maintenance impact analysis
   * @async
   * @param {string} maintenanceId - Maintenance window identifier
   * @returns {Promise<Object>} Detailed impact analysis
   */
  async getMaintenanceImpactAnalysis(maintenanceId) {
    try {
      const platform = await PlatformModel.findOne({
        'maintenanceWindows.id': maintenanceId
      });

      if (!platform) {
        return { error: 'Maintenance window not found' };
      }

      const maintenance = platform.maintenanceWindows.find(m => m.id === maintenanceId);
      
      return {
        maintenanceId,
        impactLevel: this.calculateMaintenanceImpact(maintenance),
        riskLevel: this.assessMaintenanceRisk(maintenance),
        estimatedDowntime: maintenance.requiresDowntime ? 
          (maintenance.endTime - maintenance.startTime) : 0,
        affectedServices: maintenance.affectedServices || [],
        userImpactEstimate: this.estimateUserImpact(maintenance),
        businessImpactScore: this.calculateBusinessImpact(maintenance),
        mitigationStrategies: this.suggestMitigationStrategies(maintenance)
      };

    } catch (error) {
      logger.error('Failed to get maintenance impact analysis', {
        maintenanceId,
        error: error.message
      });
      return { error: 'Failed to analyze maintenance impact' };
    }
  }

  /**
   * Gets status of affected services during maintenance
   * @async
   * @param {Array<string>} services - List of service identifiers
   * @returns {Promise<Object>} Service status information
   */
  async getAffectedServicesStatus(services) {
    const statusMap = {};
    
    for (const service of services || []) {
      try {
        statusMap[service] = {
          name: service,
          status: 'operational',
          lastChecked: new Date(),
          maintenanceMode: this.activeMaintenanceWindows.size > 0
        };
      } catch (error) {
        statusMap[service] = {
          name: service,
          status: 'unknown',
          error: error.message,
          lastChecked: new Date()
        };
      }
    }

    return statusMap;
  }

  /**
   * Sends overdue maintenance notifications
   * @private
   * @param {Object} window - Overdue maintenance window
   * @returns {Promise<void>}
   */
  async sendOverdueMaintenanceNotification(window) {
    await this.notificationService.sendToAdmins({
      type: 'maintenance.overdue',
      title: 'Maintenance Window Overdue',
      message: `Maintenance window '${window.description}' has exceeded its scheduled end time`,
      severity: 'high',
      data: {
        maintenanceId: window.id,
        scheduledEndTime: window.endTime,
        currentTime: new Date(),
        overtimeDuration: new Date() - window.endTime
      }
    });
  }

  /**
   * Updates platform maintenance status in cache
   * @private
   * @param {string} platformId - Platform identifier
   * @param {boolean} inMaintenance - Maintenance status
   * @param {Date} endTime - Optional end time for cache expiry
   * @returns {Promise<void>}
   */
  async updatePlatformMaintenanceStatus(platformId, inMaintenance, endTime) {
    const cacheKey = `platform:status:${platformId}`;
    
    if (inMaintenance) {
      const ttl = endTime ? endTime - new Date() : 4 * 60 * 60 * 1000; // 4 hours default
      await this.cacheService.set(cacheKey, { inMaintenance: true }, ttl);
    } else {
      await this.cacheService.delete(cacheKey);
    }
  }

  /**
   * Executes pre-maintenance tasks for all affected services
   * @private
   * @param {Object} platform - Platform instance
   * @param {Object} maintenance - Maintenance window object
   * @returns {Promise<void>}
   */
  async executePreMaintenanceTasks(platform, maintenance) {
    logger.info('Executing pre-maintenance tasks', {
      maintenanceId: maintenance.id,
      affectedServices: maintenance.affectedServices,
      requiresDowntime: maintenance.requiresDowntime
    });

    const executionResults = [];

    for (const service of maintenance.affectedServices || []) {
      const handler = this.maintenanceHandlers.get(service);
      if (handler && handler.preMaintenanceTasks) {
        try {
          const startTime = Date.now();
          await handler.preMaintenanceTasks(platform, maintenance);
          const executionTime = Date.now() - startTime;
          
          handler.callCount++;
          handler.lastCalled = new Date();
          
          executionResults.push({
            service,
            status: 'success',
            executionTime
          });

          logger.debug('Pre-maintenance task completed successfully', {
            service,
            maintenanceId: maintenance.id,
            executionTime
          });

        } catch (error) {
          executionResults.push({
            service,
            status: 'failed',
            error: error.message
          });

          logger.error('Pre-maintenance task failed', {
            service,
            maintenanceId: maintenance.id,
            error: error.message
          });

          if (maintenance.failOnTaskError !== false) {
            throw new AppError(`Pre-maintenance task failed for service ${service}: ${error.message}`, 500);
          }
        }
      } else {
        logger.warn('No pre-maintenance handler found for service', {
          service,
          maintenanceId: maintenance.id
        });
      }
    }

    if (maintenance.requiresDowntime) {
      await this.enableMaintenanceMode(platform, maintenance);
    }

    maintenance.preTasksResults = executionResults;
    maintenance.preTasksCompletedAt = new Date();
  }

  /**
   * Executes post-maintenance tasks for all affected services
   * @private
   * @param {Object} platform - Platform instance
   * @param {Object} maintenance - Maintenance window object
   * @param {Object} completionData - Completion details
   * @returns {Promise<void>}
   */
  async executePostMaintenanceTasks(platform, maintenance, completionData) {
    logger.info('Executing post-maintenance tasks', {
      maintenanceId: maintenance.id,
      affectedServices: maintenance.affectedServices
    });

    const executionResults = [];

    for (const service of maintenance.affectedServices || []) {
      const handler = this.maintenanceHandlers.get(service);
      if (handler && handler.postMaintenanceTasks) {
        try {
          const startTime = Date.now();
          await handler.postMaintenanceTasks(platform, maintenance, completionData);
          const executionTime = Date.now() - startTime;
          
          executionResults.push({
            service,
            status: 'success',
            executionTime
          });

          logger.debug('Post-maintenance task completed successfully', {
            service,
            maintenanceId: maintenance.id,
            executionTime
          });

        } catch (error) {
          executionResults.push({
            service,
            status: 'failed',
            error: error.message
          });

          logger.error('Post-maintenance task failed', {
            service,
            maintenanceId: maintenance.id,
            error: error.message
          });
        }
      }
    }

    if (maintenance.requiresDowntime) {
      await this.disableMaintenanceMode(platform, maintenance);
    }

    await this.performPostMaintenanceValidation(platform, maintenance);

    maintenance.postTasksResults = executionResults;
    maintenance.postTasksCompletedAt = new Date();
  }

  /**
   * Executes pause-specific tasks when maintenance is paused
   * @private
   * @param {Object} platform - Platform instance
   * @param {Object} maintenance - Maintenance window object
   * @returns {Promise<void>}
   */
  async executePauseMaintenanceTasks(platform, maintenance) {
    logger.info('Executing pause maintenance tasks', {
      maintenanceId: maintenance.id
    });

    for (const service of maintenance.affectedServices || []) {
      const handler = this.maintenanceHandlers.get(service);
      if (handler && handler.pauseTasks) {
        try {
          await handler.pauseTasks(platform, maintenance);
        } catch (error) {
          logger.error('Pause task failed', {
            service,
            maintenanceId: maintenance.id,
            error: error.message
          });
        }
      }
    }

    await this.saveMaintenanceState(platform, maintenance);
  }

  /**
   * Executes resume-specific tasks when maintenance is resumed
   * @private
   * @param {Object} platform - Platform instance
   * @param {Object} maintenance - Maintenance window object
   * @returns {Promise<void>}
   */
  async executeResumeMaintenanceTasks(platform, maintenance) {
    logger.info('Executing resume maintenance tasks', {
      maintenanceId: maintenance.id
    });

    for (const service of maintenance.affectedServices || []) {
      const handler = this.maintenanceHandlers.get(service);
      if (handler && handler.resumeTasks) {
        try {
          await handler.resumeTasks(platform, maintenance);
        } catch (error) {
          logger.error('Resume task failed', {
            service,
            maintenanceId: maintenance.id,
            error: error.message
          });
        }
      }
    }

    await this.restoreMaintenanceState(platform, maintenance);
  }

  /**
   * Reschedules completion-related tasks when maintenance is extended
   * @private
   * @param {string} platformId - Platform identifier
   * @param {Object} maintenance - Extended maintenance window
   * @returns {Promise<void>}
   */
  async rescheduleMaintenanceCompletionTasks(platformId, maintenance) {
    const jobKey = `${platformId}:${maintenance.id}:completion`;

    const existingJob = this.scheduledJobs.get(jobKey);
    if (existingJob) {
      existingJob.job.stop();
      this.scheduledJobs.delete(jobKey);
    }

    const reminderTime = new Date(maintenance.endTime.getTime() - 5 * 60 * 1000);
    
    if (reminderTime > new Date()) {
      const completionJob = cron.schedule(
        this.dateToCron(reminderTime),
        async () => {
          try {
            await this.sendCompletionReminder(platformId, maintenance);
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
      this.scheduledJobs.set(jobKey, { job: completionJob, scheduledTime: Date.now() });
    }
  }

  /**
   * Generates comprehensive maintenance execution report
   * @private
   * @param {Object} platform - Platform instance
   * @param {Object} maintenance - Completed maintenance window
   * @param {Object} completionData - Completion details
   * @returns {Promise<Object>} Detailed execution report
   */
  async generateMaintenanceReport(platform, maintenance, completionData) {
    const actualDuration = this.calculateActualDuration(maintenance);
    const scheduledDuration = maintenance.endTime - maintenance.startTime;
    
    const report = {
      reportId: `report_${maintenance.id}_${Date.now()}`,
      generatedAt: new Date(),
      maintenance: {
        id: maintenance.id,
        type: maintenance.type,
        status: maintenance.status,
        priority: maintenance.priority || 'medium'
      },
      platform: {
        id: platform.platformId,
        environment: platform.deployment.environment
      },
      schedule: {
        scheduledStart: maintenance.startTime,
        scheduledEnd: maintenance.endTime,
        actualStart: maintenance.actualStartTime || maintenance.startTime,
        actualEnd: maintenance.completedAt,
        scheduledDuration,
        actualDuration,
        durationVariance: actualDuration - scheduledDuration,
        onTime: actualDuration <= scheduledDuration * 1.1
      },
      execution: {
        startedOnTime: (maintenance.actualStartTime || maintenance.startTime) <= maintenance.startTime,
        completedEarly: maintenance.completedAt < maintenance.endTime,
        extensionsCount: maintenance.extensionHistory?.length || 0,
        totalExtensionTime: maintenance.extensionHistory?.reduce((sum, ext) => sum + ext.extensionMinutes, 0) || 0,
        pauseCount: maintenance.pauseHistory?.length || 0,
        wasReschedule: maintenance.rescheduleHistory?.length > 0
      },
      tasks: {
        preTasksSuccess: this.calculateTaskSuccessRate(maintenance.preTasksResults),
        postTasksSuccess: this.calculateTaskSuccessRate(maintenance.postTasksResults),
        totalAffectedServices: maintenance.affectedServices?.length || 0,
        tasksCompleted: completionData.tasksCompleted?.length || 0,
        issuesEncountered: completionData.issuesEncountered?.length || 0
      },
      impact: {
        requiresDowntime: maintenance.requiresDowntime,
        actualDowntime: maintenance.requiresDowntime ? actualDuration : 0,
        affectedServices: maintenance.affectedServices || [],
        estimatedUserImpact: this.estimateUserImpact(maintenance),
        businessImpactScore: this.calculateBusinessImpact(maintenance)
      },
      performance: {
        efficiency: this.calculateMaintenanceEfficiency(maintenance),
        riskRealization: this.assessRiskRealization(maintenance),
        complianceScore: this.calculateComplianceScore(maintenance)
      },
      notes: {
        description: maintenance.description,
        completionSummary: completionData.summary,
        operatorNotes: maintenance.notes
      }
    };

    return report;
  }

  /**
   * Sends maintenance reminder notifications
   * @private
   * @param {string} platformId - Platform identifier
   * @param {Object} maintenance - Maintenance window
   * @param {number} advanceMinutes - Minutes before maintenance starts
   * @returns {Promise<void>}
   */
  async sendMaintenanceReminder(platformId, maintenance, advanceMinutes) {
    const platform = await PlatformModel.findOne({ platformId });
    if (!platform) return;

    const timeLabel = advanceMinutes >= 60 ? 
      `${Math.floor(advanceMinutes / 60)} hour(s)` : 
      `${advanceMinutes} minutes`;

    await this.notificationService.sendToAll({
      type: 'maintenance.reminder',
      title: `Maintenance Starting in ${timeLabel}`,
      message: `Scheduled maintenance: ${maintenance.description}`,
      severity: this.getNotificationSeverity(maintenance, 'reminder'),
      data: {
        platformId,
        maintenanceId: maintenance.id,
        startsIn: advanceMinutes,
        startTime: maintenance.startTime,
        endTime: maintenance.endTime,
        requiresDowntime: maintenance.requiresDowntime,
        affectedServices: maintenance.affectedServices
      }
    });

    const window = platform.maintenanceWindows.find(m => m.id === maintenance.id);
    if (window && window.notifications) {
      window.notifications.sentAt = window.notifications.sentAt || [];
      window.notifications.sentAt.push({
        minutes: advanceMinutes,
        timestamp: new Date()
      });
      await platform.save();
    }

    await this.emitMaintenanceEvent(MaintenanceService.EVENTS.MAINTENANCE_REMINDER, {
      maintenance,
      platformId,
      advanceMinutes,
      timestamp: new Date()
    });
  }

  /**
   * Converts date to cron expression for job scheduling
   * @private
   * @param {Date} date - Date to convert
   * @returns {string} Cron expression
   */
  dateToCron(date) {
    const minutes = date.getMinutes();
    const hours = date.getHours();
    const dayOfMonth = date.getDate();
    const month = date.getMonth() + 1;
    
    return `${minutes} ${hours} ${dayOfMonth} ${month} *`;
  }

  /**
   * Sorts maintenance windows by specified criteria
   * @private
   * @param {Array} windows - Maintenance windows to sort
   * @param {string} sortBy - Field to sort by
   * @param {string} sortOrder - 'asc' or 'desc'
   */
  sortMaintenanceWindows(windows, sortBy, sortOrder) {
    const direction = sortOrder === 'desc' ? -1 : 1;

    windows.sort((a, b) => {
      let valueA = a[sortBy];
      let valueB = b[sortBy];

      if (sortBy === 'priority') {
        const priorityOrder = { emergency: 0, critical: 1, high: 2, medium: 3, low: 4 };
        valueA = priorityOrder[valueA] || 3;
        valueB = priorityOrder[valueB] || 3;
      } else if (valueA instanceof Date && valueB instanceof Date) {
        valueA = valueA.getTime();
        valueB = valueB.getTime();
      } else if (typeof valueA === 'string' && typeof valueB === 'string') {
        return direction * valueA.localeCompare(valueB);
      }

      return direction * (valueA - valueB);
    });
  }

  /**
   * Calculates actual duration of maintenance execution
   * @private
   * @param {Object} window - Maintenance window
   * @returns {number} Actual duration in milliseconds
   */
  calculateActualDuration(window) {
    if (!window.completedAt) {
      return window.status === MaintenanceService.MAINTENANCE_STATUS.IN_PROGRESS ? 
        new Date() - (window.actualStartTime || window.startTime) : 0;
    }

    const startTime = window.actualStartTime || window.startTime;
    let duration = window.completedAt - startTime;

    if (window.pauseHistory && window.pauseHistory.length > 0) {
      const totalPauseTime = window.pauseHistory.reduce((total, pause) => {
        return total + (pause.resumedAt - pause.pausedAt);
      }, 0);
      duration -= totalPauseTime;
    }

    return Math.max(0, duration);
  }

  /**
   * Determines completion status of maintenance window
   * @private
   * @param {Object} window - Maintenance window
   * @returns {string} Completion status description
   */
  getCompletionStatus(window) {
    switch (window.status) {
      case MaintenanceService.MAINTENANCE_STATUS.COMPLETED:
        const actualDuration = this.calculateActualDuration(window);
        const scheduledDuration = window.endTime - window.startTime;
        
        if (actualDuration <= scheduledDuration) {
          return 'completed_on_time';
        } else if (actualDuration <= scheduledDuration * 1.2) {
          return 'completed_with_minor_delay';
        } else {
          return 'completed_with_significant_delay';
        }
      case MaintenanceService.MAINTENANCE_STATUS.CANCELLED:
        return window.cancelledAt < window.startTime ? 'cancelled_before_start' : 'cancelled_during_execution';
      case MaintenanceService.MAINTENANCE_STATUS.IN_PROGRESS:
        return new Date() > window.endTime ? 'overdue' : 'in_progress_on_schedule';
      default:
        return window.status;
    }
  }

  /**
   * Calculates performance metrics for completed maintenance
   * @private
   * @param {Object} window - Maintenance window
   * @returns {Object} Performance metrics
   */
  calculateMaintenancePerformanceMetrics(window) {
    const actualDuration = this.calculateActualDuration(window);
    const scheduledDuration = window.endTime - window.startTime;
    
    return {
      durationEfficiency: Math.round((scheduledDuration / Math.max(actualDuration, 1)) * 100),
      startTimePunctuality: window.actualStartTime <= window.startTime ? 100 : 
        Math.max(0, 100 - ((window.actualStartTime - window.startTime) / (30 * 60 * 1000) * 20)),
      taskCompletionRate: this.calculateTaskSuccessRate(window.preTasksResults) + 
        this.calculateTaskSuccessRate(window.postTasksResults) / 2,
      extensionFrequency: window.extensionHistory?.length || 0,
      pauseFrequency: window.pauseHistory?.length || 0,
      overallScore: this.calculateOverallPerformanceScore(window)
    };
  }

  /**
   * Assesses compliance with maintenance standards
   * @private
   * @param {Object} window - Maintenance window
   * @returns {Object} Compliance assessment
   */
  assessMaintenanceCompliance(window) {
    const compliance = {
      documentationComplete: !!(window.description && window.notes),
      approvalReceived: !!window.approvedBy,
      notificationsSent: !!(window.notifications && window.notifications.sentAt?.length > 0),
      postTasksCompleted: !!window.postTasksCompletedAt,
      reportGenerated: !!window.reportGenerated,
      score: 0
    };

    const criteriaCount = Object.keys(compliance).length - 1;
    const metCriteria = Object.values(compliance).filter(Boolean).length - 1;
    compliance.score = Math.round((metCriteria / criteriaCount) * 100);

    return compliance;
  }

  /**
   * Generates analytics for maintenance history
   * @private
   * @param {Array} windows - Maintenance windows for analysis
   * @returns {Object} Historical analytics
   */
  generateHistoryAnalytics(windows) {
    const total = windows.length;
    if (total === 0) return {};

    const completed = windows.filter(w => w.status === MaintenanceService.MAINTENANCE_STATUS.COMPLETED);
    const cancelled = windows.filter(w => w.status === MaintenanceService.MAINTENANCE_STATUS.CANCELLED);

    return {
      summary: {
        total,
        completed: completed.length,
        cancelled: cancelled.length,
        completionRate: Math.round((completed.length / total) * 100)
      },
      averages: {
        duration: completed.length > 0 ? 
          Math.round(completed.reduce((sum, w) => sum + this.calculateActualDuration(w), 0) / completed.length) : 0,
        leadTime: this.calculateAverageLeadTime(windows),
        affectedServices: Math.round(windows.reduce((sum, w) => sum + (w.affectedServices?.length || 0), 0) / total)
      },
      trends: {
        frequencyByMonth: this.calculateMonthlyFrequency(windows),
        durationTrend: this.calculateDurationTrend(windows),
        successRateTrend: this.calculateSuccessRateTrend(windows)
      },
      distribution: {
        byType: this.calculateDistribution(windows, 'type'),
        byPriority: this.calculateDistribution(windows, 'priority'),
        byDayOfWeek: this.calculateDayOfWeekDistribution(windows)
      }
    };
  }

  /**
   * Updates trend statistics with new maintenance window data
   * @private
   * @param {Object} trends - Trends object to update
   * @param {Object} window - Maintenance window data
   */
  updateTrendStatistics(trends, window) {
    const monthKey = window.startTime.toISOString().substring(0, 7);
    const dayOfWeek = window.startTime.getDay();
    const hour = window.startTime.getHours();

    if (!trends.monthlyBreakdown[monthKey]) {
      trends.monthlyBreakdown[monthKey] = {
        total: 0,
        completed: 0,
        cancelled: 0,
        totalDuration: 0,
        averageDuration: 0
      };
    }

    trends.monthlyBreakdown[monthKey].total++;
    trends.monthlyBreakdown[monthKey][window.status]++;

    if (window.status === MaintenanceService.MAINTENANCE_STATUS.COMPLETED) {
      const duration = this.calculateActualDuration(window);
      trends.monthlyBreakdown[monthKey].totalDuration += duration;
      trends.monthlyBreakdown[monthKey].averageDuration = 
        trends.monthlyBreakdown[monthKey].totalDuration / trends.monthlyBreakdown[monthKey].completed;
    }

    trends.weeklyPattern[dayOfWeek] = (trends.weeklyPattern[dayOfWeek] || 0) + 1;
    trends.dailyPattern[hour] = (trends.dailyPattern[hour] || 0) + 1;
  }

  /**
   * Generates maintenance projections based on historical data
   * @private
   * @param {Object} statistics - Historical statistics
   * @returns {Object} Maintenance projections
   */
  generateMaintenanceProjections(statistics) {
    const monthlyAverage = statistics.overview.total / 
      Object.keys(statistics.trends.monthlyBreakdown).length;

    return {
      nextMonthEstimate: Math.round(monthlyAverage * 1.1),
      quarterlyEstimate: Math.round(monthlyAverage * 3),
      expectedDowntime: statistics.impact.totalDowntime / statistics.overview.total * monthlyAverage,
      resourceRequirements: {
        teamHours: monthlyAverage * 4,
        approvalCycles: Math.round(monthlyAverage * 0.8),
        notificationVolume: monthlyAverage * 15
      },
      riskFactors: this.identifyProjectionRiskFactors(statistics)
    };
  }

  /**
   * Analyzes potential maintenance conflicts in detail
   * @private
   * @param {Object} maintenanceData - Proposed maintenance data
   * @returns {Promise<Object>} Detailed conflict analysis
   */
  async analyzeMaintenanceConflicts(maintenanceData) {
    const conflicts = [];
    const { startTime, endTime, affectedServices = [] } = maintenanceData;

    try {
      const activeWindows = await this.getActiveMaintenanceWindows({ fromCache: false });
      const scheduledWindows = await this.getScheduledMaintenanceWindows({
        startDate: new Date(startTime),
        endDate: new Date(endTime),
        fromCache: false
      });

      const allWindows = [...activeWindows, ...scheduledWindows.maintenanceWindows];

      for (const window of allWindows) {
        if (this.checkTimeOverlap(new Date(startTime), new Date(endTime), 
                                  window.startTime, window.endTime)) {
          
          const conflictType = this.determineConflictType(maintenanceData, window);
          const severity = this.calculateConflictSeverity(maintenanceData, window);
          
          conflicts.push({
            maintenanceId: window.id,
            conflictType,
            severity,
            overlapDuration: this.calculateOverlapDuration(
              new Date(startTime), new Date(endTime), 
              window.startTime, window.endTime
            ),
            sharedServices: affectedServices.filter(s => 
              window.affectedServices?.includes(s)
            ),
            description: this.generateConflictDescription(maintenanceData, window, conflictType),
            recommendation: this.generateConflictRecommendation(conflictType, severity)
          });
        }
      }

      return {
        conflicts,
        hasConflicts: conflicts.length > 0,
        highSeverityConflicts: conflicts.filter(c => c.severity === 'high').length,
        resolutionRequired: conflicts.some(c => c.severity === 'high')
      };

    } catch (error) {
      logger.error('Failed to analyze maintenance conflicts', {
        error: error.message
      });
      return { conflicts: [], hasConflicts: false, error: error.message };
    }
  }

  /**
   * Identifies critical services from a service list
   * @private
   * @param {Array<string>} services - List of service names
   * @returns {Array<string>} List of critical services
   */
  identifyCriticalServices(services) {
    const criticalServicePatterns = [
      /^auth/i, /^database/i, /^payment/i, /^api-gateway/i,
      /^load-balancer/i, /^core/i, /^primary/i
    ];

    return services.filter(service => 
      criticalServicePatterns.some(pattern => pattern.test(service))
    );
  }

  /**
   * Determines if given datetime falls within business hours
   * @private
   * @param {Date} dateTime - Date and time to check
   * @returns {boolean} Whether datetime is within business hours
   */
  isBusinessHours(dateTime) {
    const hour = dateTime.getHours();
    const dayOfWeek = dateTime.getDay();
    
    const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
    const isBusinessHour = hour >= 9 && hour < 17;
    
    return isWeekday && isBusinessHour;
  }

  /**
   * Retrieves notification templates for different maintenance events
   * @private
   * @returns {Object} Notification templates
   */
  getNotificationTemplates() {
    return {
      scheduled: {
        title: 'Maintenance Scheduled: {maintenance.type}',
        message: 'Scheduled maintenance: {maintenance.description}\nFrom {maintenance.startTime} to {maintenance.endTime}'
      },
      updated: {
        title: 'Maintenance Updated: {maintenance.description}',
        message: 'Maintenance window has been updated with new details'
      },
      rescheduled: {
        title: 'Maintenance Rescheduled: {maintenance.description}',
        message: 'Maintenance has been rescheduled. New time: {maintenance.startTime} to {maintenance.endTime}'
      },
      cancelled: {
        title: 'Maintenance Cancelled: {maintenance.description}',
        message: 'The scheduled maintenance window has been cancelled. {additionalInfo}'
      },
      started: {
        title: 'Maintenance Started: {maintenance.description}',
        message: 'Maintenance is now in progress. Expected completion: {maintenance.endTime}'
      },
      completed: {
        title: 'Maintenance Completed: {maintenance.description}',
        message: 'Maintenance has been completed successfully. All systems are operational.'
      },
      extended: {
        title: 'Maintenance Extended: {maintenance.description}',
        message: 'Maintenance window has been extended. {additionalInfo}'
      },
      paused: {
        title: 'Maintenance Paused: {maintenance.description}',
        message: 'Maintenance has been temporarily paused. {additionalInfo}'
      },
      resumed: {
        title: 'Maintenance Resumed: {maintenance.description}',
        message: 'Maintenance has been resumed and is continuing as planned.'
      }
    };
  }

  /**
   * Formats notification template with dynamic data
   * @private
   * @param {string} template - Template string with placeholders
   * @param {Object} data - Data for template substitution
   * @returns {string} Formatted message
   */
  formatTemplate(template, data) {
    return template.replace(/\{([^}]+)\}/g, (match, path) => {
      const value = this.getNestedValue(data, path);
      return value !== undefined ? value : match;
    });
  }

  /**
   * Determines notification severity based on maintenance and event type
   * @private
   * @param {Object} maintenance - Maintenance window
   * @param {string} type - Notification type
   * @returns {string} Notification severity level
   */
  getNotificationSeverity(maintenance, type) {
    if (maintenance.type === MaintenanceService.MAINTENANCE_TYPES.EMERGENCY) {
      return 'critical';
    }

    if (maintenance.priority === MaintenanceService.MAINTENANCE_PRIORITY.CRITICAL) {
      return 'high';
    }

    if (maintenance.requiresDowntime) {
      return type === 'started' || type === 'cancelled' ? 'high' : 'medium';
    }

    const severityMap = {
      cancelled: 'medium',
      started: 'medium',
      overdue: 'high',
      failed: 'high'
    };

    return severityMap[type] || 'low';
  }

  /**
   * Estimates user impact based on maintenance characteristics
   * @private
   * @param {Object} maintenance - Maintenance window
   * @returns {Object} User impact estimation
   */
  estimateUserImpact(maintenance) {
    const baseImpact = {
      level: 'low',
      affectedUsers: 0,
      impactDuration: this.calculateActualDuration(maintenance),
      serviceDisruption: []
    };

    if (!maintenance.requiresDowntime) {
      baseImpact.level = 'minimal';
      return baseImpact;
    }

    const serviceCount = maintenance.affectedServices?.length || 0;
    const criticalServices = this.identifyCriticalServices(maintenance.affectedServices || []);
    
    if (criticalServices.length > 0) {
      baseImpact.level = 'high';
      baseImpact.affectedUsers = 1000 + (serviceCount * 200);
    } else if (serviceCount > 3) {
      baseImpact.level = 'medium';
      baseImpact.affectedUsers = 500 + (serviceCount * 100);
    } else {
      baseImpact.level = 'low';
      baseImpact.affectedUsers = serviceCount * 50;
    }

    baseImpact.serviceDisruption = maintenance.affectedServices || [];

    return baseImpact;
  }

  /**
   * Calculates business impact score for maintenance
   * @private
   * @param {Object} maintenance - Maintenance window
   * @returns {number} Business impact score (0-100)
   */
  calculateBusinessImpact(maintenance) {
    let score = 0;

    if (maintenance.requiresDowntime) score += 40;
    
    const serviceCount = maintenance.affectedServices?.length || 0;
    score += Math.min(serviceCount * 5, 20);

    const criticalServices = this.identifyCriticalServices(maintenance.affectedServices || []);
    score += criticalServices.length * 10;

    if (this.isBusinessHours(new Date(maintenance.startTime))) {
      score += 20;
    }

    const duration = maintenance.endTime - maintenance.startTime;
    const hours = duration / (1000 * 60 * 60);
    if (hours > 4) score += 15;
    else if (hours > 2) score += 10;
    else if (hours > 1) score += 5;

    return Math.min(100, score);
  }

  /**
   * Suggests mitigation strategies for maintenance impact
   * @private
   * @param {Object} maintenance - Maintenance window
   * @returns {Array<string>} List of mitigation strategies
   */
  suggestMitigationStrategies(maintenance) {
    const strategies = [];

    if (maintenance.requiresDowntime) {
      strategies.push('Implement graceful degradation for affected services');
      strategies.push('Prepare service status page with real-time updates');
      strategies.push('Establish communication channels for user notifications');
    }

    if (this.isBusinessHours(new Date(maintenance.startTime))) {
      strategies.push('Consider rescheduling to off-peak hours');
      strategies.push('Increase support staff availability during maintenance');
    }

    const criticalServices = this.identifyCriticalServices(maintenance.affectedServices || []);
    if (criticalServices.length > 0) {
      strategies.push('Implement additional monitoring for critical services');
      strategies.push('Prepare rollback procedures for critical components');
      strategies.push('Ensure dedicated technical team availability');
    }

    const duration = maintenance.endTime - maintenance.startTime;
    if (duration > 4 * 60 * 60 * 1000) {
      strategies.push('Break maintenance into smaller, manageable segments');
      strategies.push('Implement checkpoint validation between segments');
    }

    if (maintenance.affectedServices?.length > 5) {
      strategies.push('Prioritize service restoration order by criticality');
      strategies.push('Implement parallel processing where possible');
    }

    return strategies;
  }

  /**
   * Additional utility methods for comprehensive maintenance management
   */

  enableMaintenanceMode(platform, maintenance) {
    return this.updatePlatformMaintenanceStatus(platform.platformId, true, maintenance.endTime);
  }

  disableMaintenanceMode(platform, maintenance) {
    return this.updatePlatformMaintenanceStatus(platform.platformId, false);
  }

  async performPostMaintenanceValidation(platform, maintenance) {
    logger.info('Performing post-maintenance validation', {
      maintenanceId: maintenance.id,
      platformId: platform.platformId
    });
  }

  async saveMaintenanceState(platform, maintenance) {
    await this.cacheService.set(`maintenance:state:${maintenance.id}`, {
      platformId: platform.platformId,
      maintenanceId: maintenance.id,
      pausedAt: maintenance.pausedAt,
      state: 'paused'
    }, 24 * 60 * 60 * 1000);
  }

  async restoreMaintenanceState(platform, maintenance) {
    await this.cacheService.delete(`maintenance:state:${maintenance.id}`);
  }

  async sendCompletionReminder(platformId, maintenance) {
    await this.notificationService.sendToAdmins({
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

  calculateTaskSuccessRate(results) {
    if (!results || results.length === 0) return 100;
    const successful = results.filter(r => r.status === 'success').length;
    return Math.round((successful / results.length) * 100);
  }

  calculateMaintenanceEfficiency(window) {
    const actualDuration = this.calculateActualDuration(window);
    const scheduledDuration = window.endTime - window.startTime;
    return Math.round((scheduledDuration / Math.max(actualDuration, 1)) * 100);
  }

  assessRiskRealization(maintenance) {
    const originalRisk = maintenance.metadata?.riskLevel || 'medium';
    const actualIssues = maintenance.issuesEncountered?.length || 0;
    
    const riskScores = { low: 1, medium: 2, high: 3, critical: 4 };
    const expectedIssues = riskScores[originalRisk] || 2;
    
    return actualIssues <= expectedIssues ? 'as_expected' : 'higher_than_expected';
  }

  calculateComplianceScore(maintenance) {
    let score = 0;
    if (maintenance.description && maintenance.description.length > 10) score += 20;
    if (maintenance.approvedBy) score += 20;
    if (maintenance.preTasksCompletedAt) score += 20;
    if (maintenance.postTasksCompletedAt) score += 20;
    if (maintenance.completionSummary) score += 20;
    return score;
  }

  calculateOverallPerformanceScore(window) {
    const efficiency = this.calculateMaintenanceEfficiency(window);
    const taskSuccess = (this.calculateTaskSuccessRate(window.preTasksResults) +
                        this.calculateTaskSuccessRate(window.postTasksResults)) / 2;
    const timeCompliance = window.completedAt <= window.endTime ? 100 : 50;
    
    return Math.round((efficiency + taskSuccess + timeCompliance) / 3);
  }

  calculateAverageLeadTime(windows) {
    const scheduled = windows.filter(w => w.createdAt && w.startTime);
    if (scheduled.length === 0) return 0;
    
    const totalLeadTime = scheduled.reduce((sum, w) => 
      sum + (w.startTime - w.createdAt), 0);
    
    return Math.round(totalLeadTime / scheduled.length);
  }

  calculateMonthlyFrequency(windows) {
    const frequency = {};
    windows.forEach(w => {
      const month = w.startTime.toISOString().substring(0, 7);
      frequency[month] = (frequency[month] || 0) + 1;
    });
    return frequency;
  }

  calculateDurationTrend(windows) {
    const completed = windows.filter(w => w.status === MaintenanceService.MAINTENANCE_STATUS.COMPLETED);
    if (completed.length < 2) return 'insufficient_data';
    
    const durations = completed.map(w => this.calculateActualDuration(w));
    const firstHalf = durations.slice(0, Math.floor(durations.length / 2));
    const secondHalf = durations.slice(Math.floor(durations.length / 2));
    
    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    
    if (secondAvg > firstAvg * 1.1) return 'increasing';
    if (secondAvg < firstAvg * 0.9) return 'decreasing';
    return 'stable';
  }

  calculateSuccessRateTrend(windows) {
    const recent = windows.slice(-10);
    const older = windows.slice(0, -10);
    
    if (older.length === 0) return 'insufficient_data';
    
    const recentSuccess = recent.filter(w => w.status === MaintenanceService.MAINTENANCE_STATUS.COMPLETED).length / recent.length;
    const olderSuccess = older.filter(w => w.status === MaintenanceService.MAINTENANCE_STATUS.COMPLETED).length / older.length;
    
    if (recentSuccess > olderSuccess + 0.1) return 'improving';
    if (recentSuccess < olderSuccess - 0.1) return 'declining';
    return 'stable';
  }

  calculateDistribution(windows, field) {
    const distribution = {};
    windows.forEach(w => {
      const value = w[field] || 'unknown';
      distribution[value] = (distribution[value] || 0) + 1;
    });
    return distribution;
  }

  calculateDayOfWeekDistribution(windows) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const distribution = {};
    
    windows.forEach(w => {
      const day = days[w.startTime.getDay()];
      distribution[day] = (distribution[day] || 0) + 1;
    });
    
    return distribution;
  }

  identifyProjectionRiskFactors(statistics) {
    const risks = [];
    
    if (statistics.compliance.completionRate < 80) {
      risks.push('Low completion rate indicates potential resource constraints');
    }
    
    if (statistics.performance.extensionRate > 30) {
      risks.push('High extension rate suggests estimation accuracy issues');
    }
    
    if (statistics.impact.totalDowntime > 24 * 60 * 60 * 1000) {
      risks.push('Significant downtime impact on business operations');
    }
    
    return risks;
  }

  calculateOverlapDuration(start1, end1, start2, end2) {
    const overlapStart = new Date(Math.max(start1.getTime(), start2.getTime()));
    const overlapEnd = new Date(Math.min(end1.getTime(), end2.getTime()));
    return Math.max(0, overlapEnd - overlapStart);
  }

  generateConflictDescription(maintenance1, maintenance2, conflictType) {
    const descriptions = {
      service_conflict: `Overlapping maintenance on shared services: ${maintenance1.affectedServices?.filter(s => 
        maintenance2.affectedServices?.includes(s)).join(', ')}`,
      downtime_conflict: 'Multiple maintenance windows requiring simultaneous downtime',
      time_conflict: 'Overlapping maintenance time windows'
    };
    
    return descriptions[conflictType] || 'Time overlap detected';
  }

  generateConflictRecommendation(conflictType, severity) {
    const recommendations = {
      service_conflict: {
        high: 'Reschedule to avoid service conflicts or implement service isolation',
        medium: 'Consider sequential execution or service prioritization',
        low: 'Monitor for potential service interference'
      },
      downtime_conflict: {
        high: 'Reschedule one maintenance window to avoid simultaneous downtime',
        medium: 'Evaluate if partial downtime overlap is acceptable',
        low: 'Proceed with increased monitoring'
      },
      time_conflict: {
        high: 'Reschedule to avoid complete overlap',
        medium: 'Consider reducing overlap duration',
        low: 'Acceptable with proper coordination'
      }
    };
    
    return recommendations[conflictType]?.[severity] || 'Review maintenance scheduling';
  }

  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current && current[key], obj);
  }
}

// Export singleton instance
module.exports = new MaintenanceService();