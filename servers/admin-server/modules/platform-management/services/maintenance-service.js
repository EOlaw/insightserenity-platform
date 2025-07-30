'use strict';

/**
 * @fileoverview Platform maintenance management service
 * @module servers/admin-server/modules/platform-management/services/maintenance-service
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/services/notification-service
 * @requires module:shared/lib/services/webhook-service
 * @requires module:shared/lib/security/audit/audit-service
 * @requires module:servers/admin-server/modules/platform-management/models/platform-model
 * @requires module:servers/admin-server/modules/platform-management/services/platform-service
 * @requires module:servers/admin-server/modules/platform-management/services/system-service
 */

const logger = require('../../../../../shared/lib/utils/logger');
const AppError = require('../../../../../shared/lib/utils/app-error');
const CacheService = require('../../../../../shared/lib/services/cache-service');
const NotificationService = require('../../../../../shared/lib/services/notification-service');
const WebhookService = require('../../../../../shared/lib/services/webhook-service');
const AuditService = require('../../../../../shared/lib/security/audit/audit-service');
const PlatformModel = require('../models/platform-model');
const PlatformService = require('./platform-service');
const SystemService = require('./system-service');

/**
 * Service for managing platform maintenance operations
 * @class MaintenanceService
 */
class MaintenanceService {
  constructor() {
    this.cacheService = new CacheService('maintenance');
    this.cacheKeyPrefix = 'maintenance:';
    this.maintenanceJobs = new Map();
    this.preMaintenanceTasks = new Map();
    this.postMaintenanceTasks = new Map();
  }

  /**
   * Schedule maintenance window
   * @param {Object} maintenanceData Maintenance window data
   * @param {String} userId User scheduling maintenance
   * @returns {Promise<Object>} Scheduled maintenance window
   */
  async scheduleMaintenanceWindow(maintenanceData, userId) {
    try {
      const {
        name,
        type = 'scheduled',
        startTime,
        endTime,
        affectedServices = [],
        description,
        notificationLeadTime = 86400000 // 24 hours default
      } = maintenanceData;

      // Validate times
      const start = new Date(startTime);
      const end = new Date(endTime);
      const now = new Date();

      if (start <= now) {
        throw new AppError('Start time must be in the future', 400, 'INVALID_START_TIME');
      }

      if (end <= start) {
        throw new AppError('End time must be after start time', 400, 'INVALID_END_TIME');
      }

      if (type === 'scheduled' && (start - now) < notificationLeadTime) {
        throw new AppError(
          `Scheduled maintenance requires at least ${notificationLeadTime / 3600000} hours notice`,
          400,
          'INSUFFICIENT_NOTICE'
        );
      }

      // Add to platform maintenance windows
      const platform = await PlatformModel.getInstance();
      
      const maintenanceWindow = {
        name,
        type,
        startTime: start,
        endTime: end,
        affectedServices,
        description,
        createdBy: userId
      };

      platform.maintenanceWindows.push(maintenanceWindow);
      await platform.save();

      const window = platform.maintenanceWindows[platform.maintenanceWindows.length - 1];

      // Schedule notifications
      await this.#scheduleMaintenanceNotifications(window, notificationLeadTime);

      // Schedule automatic maintenance mode
      if (type === 'scheduled') {
        await this.#scheduleMaintenanceMode(window);
      }

      // Audit log
      await AuditService.log({
        action: 'maintenance.scheduled',
        userId,
        resourceType: 'maintenance_window',
        resourceId: window._id,
        details: {
          name,
          type,
          startTime: start,
          endTime: end,
          duration: end - start,
          affectedServices
        }
      });

      // Send immediate notification for emergency maintenance
      if (type === 'emergency') {
        await this.#sendMaintenanceNotification(window, 'immediate');
      }

      logger.info('Maintenance window scheduled', {
        windowId: window._id,
        name,
        type,
        startTime: start,
        endTime: end,
        scheduledBy: userId
      });

      return window;
    } catch (error) {
      logger.error('Failed to schedule maintenance window', error);
      throw error;
    }
  }

  /**
   * Update maintenance window
   * @param {String} windowId Maintenance window ID
   * @param {Object} updates Window updates
   * @param {String} userId User updating window
   * @returns {Promise<Object>} Updated maintenance window
   */
  async updateMaintenanceWindow(windowId, updates, userId) {
    try {
      const platform = await PlatformModel.getInstance();
      const window = platform.maintenanceWindows.id(windowId);

      if (!window) {
        throw new AppError('Maintenance window not found', 404, 'WINDOW_NOT_FOUND');
      }

      // Validate updates
      if (updates.startTime || updates.endTime) {
        const start = new Date(updates.startTime || window.startTime);
        const end = new Date(updates.endTime || window.endTime);

        if (end <= start) {
          throw new AppError('End time must be after start time', 400, 'INVALID_TIME_RANGE');
        }

        // Update scheduled jobs
        await this.#updateScheduledJobs(windowId, start, end);
      }

      // Apply updates
      Object.assign(window, updates);
      platform.lastModifiedBy = userId;
      await platform.save();

      // Send update notification
      await NotificationService.sendSystemNotification({
        type: 'maintenance_window_updated',
        severity: 'info',
        title: 'Maintenance Window Updated',
        message: `Maintenance window "${window.name}" has been updated`,
        metadata: {
          windowId,
          updates: Object.keys(updates),
          updatedBy: userId
        }
      });

      logger.info('Maintenance window updated', {
        windowId,
        updates: Object.keys(updates),
        updatedBy: userId
      });

      return window;
    } catch (error) {
      logger.error('Failed to update maintenance window', error);
      throw error;
    }
  }

  /**
   * Cancel maintenance window
   * @param {String} windowId Maintenance window ID
   * @param {String} userId User canceling window
   * @param {String} reason Cancellation reason
   * @returns {Promise<Boolean>} Cancellation result
   */
  async cancelMaintenanceWindow(windowId, userId, reason) {
    try {
      const platform = await PlatformModel.getInstance();
      const windowIndex = platform.maintenanceWindows.findIndex(
        w => w._id.toString() === windowId
      );

      if (windowIndex === -1) {
        throw new AppError('Maintenance window not found', 404, 'WINDOW_NOT_FOUND');
      }

      const window = platform.maintenanceWindows[windowIndex];

      // Remove from array
      platform.maintenanceWindows.splice(windowIndex, 1);
      platform.lastModifiedBy = userId;
      await platform.save();

      // Cancel scheduled jobs
      await this.#cancelScheduledJobs(windowId);

      // Send cancellation notification
      await NotificationService.sendSystemNotification({
        type: 'maintenance_window_cancelled',
        severity: 'warning',
        title: 'Maintenance Window Cancelled',
        message: `Maintenance window "${window.name}" has been cancelled`,
        metadata: {
          windowId,
          windowName: window.name,
          reason,
          cancelledBy: userId
        }
      });

      // Audit log
      await AuditService.log({
        action: 'maintenance.cancelled',
        userId,
        resourceType: 'maintenance_window',
        resourceId: windowId,
        details: {
          windowName: window.name,
          scheduledStart: window.startTime,
          scheduledEnd: window.endTime,
          reason
        }
      });

      logger.info('Maintenance window cancelled', {
        windowId,
        windowName: window.name,
        reason,
        cancelledBy: userId
      });

      return true;
    } catch (error) {
      logger.error('Failed to cancel maintenance window', error);
      throw error;
    }
  }

  /**
   * Get maintenance windows
   * @param {Object} options Query options
   * @returns {Promise<Array>} Maintenance windows
   */
  async getMaintenanceWindows(options = {}) {
    try {
      const {
        type,
        status,
        startDate,
        endDate,
        includeCompleted = false
      } = options;

      const platform = await PlatformModel.getInstance();
      let windows = platform.maintenanceWindows || [];

      // Filter by type
      if (type) {
        windows = windows.filter(w => w.type === type);
      }

      // Filter by date range
      if (startDate || endDate) {
        windows = windows.filter(w => {
          const windowStart = new Date(w.startTime);
          const windowEnd = new Date(w.endTime);
          
          if (startDate && windowEnd < new Date(startDate)) return false;
          if (endDate && windowStart > new Date(endDate)) return false;
          return true;
        });
      }

      // Filter by status
      const now = new Date();
      if (status) {
        windows = windows.filter(w => {
          const start = new Date(w.startTime);
          const end = new Date(w.endTime);
          
          switch (status) {
            case 'upcoming':
              return start > now;
            case 'active':
              return start <= now && end > now;
            case 'completed':
              return end <= now;
            default:
              return true;
          }
        });
      } else if (!includeCompleted) {
        // By default, exclude completed windows
        windows = windows.filter(w => new Date(w.endTime) > now);
      }

      // Sort by start time
      windows.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

      return windows;
    } catch (error) {
      logger.error('Failed to get maintenance windows', error);
      throw error;
    }
  }

  /**
   * Execute pre-maintenance tasks
   * @param {String} windowId Maintenance window ID
   * @returns {Promise<Object>} Execution results
   */
  async executePreMaintenanceTasks(windowId) {
    try {
      const results = {
        successful: [],
        failed: []
      };

      const tasks = this.preMaintenanceTasks.get(windowId) || [];
      
      for (const task of tasks) {
        try {
          logger.info(`Executing pre-maintenance task: ${task.name}`);
          await task.execute();
          results.successful.push({
            name: task.name,
            completedAt: new Date()
          });
        } catch (error) {
          logger.error(`Pre-maintenance task failed: ${task.name}`, error);
          results.failed.push({
            name: task.name,
            error: error.message,
            failedAt: new Date()
          });
        }
      }

      // Default pre-maintenance tasks
      try {
        // Clear caches
        await this.cacheService.flush();
        results.successful.push({
          name: 'Clear caches',
          completedAt: new Date()
        });

        // Capture system state
        const systemHealth = await SystemService.getClusterHealth();
        await this.cacheService.set(
          `${this.cacheKeyPrefix}pre-maintenance-state:${windowId}`,
          systemHealth,
          86400 // 24 hours
        );
        results.successful.push({
          name: 'Capture system state',
          completedAt: new Date()
        });

        // Send final notification
        await NotificationService.sendSystemNotification({
          type: 'maintenance_starting',
          severity: 'warning',
          title: 'Maintenance Starting',
          message: 'Platform maintenance is about to begin',
          metadata: { windowId }
        });
        results.successful.push({
          name: 'Send notifications',
          completedAt: new Date()
        });
      } catch (error) {
        logger.error('Default pre-maintenance task failed', error);
        results.failed.push({
          name: 'Default tasks',
          error: error.message,
          failedAt: new Date()
        });
      }

      logger.info('Pre-maintenance tasks completed', {
        windowId,
        successful: results.successful.length,
        failed: results.failed.length
      });

      return results;
    } catch (error) {
      logger.error('Failed to execute pre-maintenance tasks', error);
      throw error;
    }
  }

  /**
   * Execute post-maintenance tasks
   * @param {String} windowId Maintenance window ID
   * @returns {Promise<Object>} Execution results
   */
  async executePostMaintenanceTasks(windowId) {
    try {
      const results = {
        successful: [],
        failed: []
      };

      const tasks = this.postMaintenanceTasks.get(windowId) || [];
      
      for (const task of tasks) {
        try {
          logger.info(`Executing post-maintenance task: ${task.name}`);
          await task.execute();
          results.successful.push({
            name: task.name,
            completedAt: new Date()
          });
        } catch (error) {
          logger.error(`Post-maintenance task failed: ${task.name}`, error);
          results.failed.push({
            name: task.name,
            error: error.message,
            failedAt: new Date()
          });
        }
      }

      // Default post-maintenance tasks
      try {
        // Verify system health
        const postHealth = await SystemService.getClusterHealth();
        const preHealth = await this.cacheService.get(
          `${this.cacheKeyPrefix}pre-maintenance-state:${windowId}`
        );

        if (preHealth) {
          const healthComparison = this.#compareSystemHealth(preHealth, postHealth);
          if (healthComparison.degraded) {
            logger.warn('System health degraded after maintenance', healthComparison);
          }
        }
        results.successful.push({
          name: 'Verify system health',
          completedAt: new Date()
        });

        // Clear maintenance caches
        await this.cacheService.del(
          `${this.cacheKeyPrefix}pre-maintenance-state:${windowId}`
        );
        results.successful.push({
          name: 'Clear maintenance data',
          completedAt: new Date()
        });

        // Send completion notification
        await NotificationService.sendSystemNotification({
          type: 'maintenance_completed',
          severity: 'info',
          title: 'Maintenance Completed',
          message: 'Platform maintenance has been completed successfully',
          metadata: { windowId }
        });
        results.successful.push({
          name: 'Send completion notification',
          completedAt: new Date()
        });
      } catch (error) {
        logger.error('Default post-maintenance task failed', error);
        results.failed.push({
          name: 'Default tasks',
          error: error.message,
          failedAt: new Date()
        });
      }

      logger.info('Post-maintenance tasks completed', {
        windowId,
        successful: results.successful.length,
        failed: results.failed.length
      });

      return results;
    } catch (error) {
      logger.error('Failed to execute post-maintenance tasks', error);
      throw error;
    }
  }

  /**
   * Register pre-maintenance task
   * @param {String} windowId Maintenance window ID
   * @param {Object} task Task definition
   */
  registerPreMaintenanceTask(windowId, task) {
    if (!this.preMaintenanceTasks.has(windowId)) {
      this.preMaintenanceTasks.set(windowId, []);
    }
    
    this.preMaintenanceTasks.get(windowId).push({
      name: task.name,
      execute: task.execute,
      priority: task.priority || 0
    });
    
    // Sort by priority
    this.preMaintenanceTasks.get(windowId).sort((a, b) => b.priority - a.priority);
    
    logger.debug('Pre-maintenance task registered', {
      windowId,
      taskName: task.name,
      priority: task.priority
    });
  }

  /**
   * Register post-maintenance task
   * @param {String} windowId Maintenance window ID
   * @param {Object} task Task definition
   */
  registerPostMaintenanceTask(windowId, task) {
    if (!this.postMaintenanceTasks.has(windowId)) {
      this.postMaintenanceTasks.set(windowId, []);
    }
    
    this.postMaintenanceTasks.get(windowId).push({
      name: task.name,
      execute: task.execute,
      priority: task.priority || 0
    });
    
    // Sort by priority
    this.postMaintenanceTasks.get(windowId).sort((a, b) => b.priority - a.priority);
    
    logger.debug('Post-maintenance task registered', {
      windowId,
      taskName: task.name,
      priority: task.priority
    });
  }

  /**
   * Get maintenance status
   * @returns {Promise<Object>} Maintenance status
   */
  async getMaintenanceStatus() {
    try {
      const platform = await PlatformModel.getInstance();
      const now = new Date();
      
      // Check if currently in maintenance
      const activeWindow = platform.maintenanceWindows.find(w => {
        const start = new Date(w.startTime);
        const end = new Date(w.endTime);
        return start <= now && end > now;
      });

      // Get upcoming windows
      const upcomingWindows = platform.maintenanceWindows
        .filter(w => new Date(w.startTime) > now)
        .sort((a, b) => new Date(a.startTime) - new Date(b.startTime))
        .slice(0, 5);

      return {
        inMaintenance: platform.api.maintenanceMode.enabled,
        activeWindow,
        upcomingWindows,
        maintenanceMode: {
          enabled: platform.api.maintenanceMode.enabled,
          message: platform.api.maintenanceMode.message,
          allowedIps: platform.api.maintenanceMode.allowedIps,
          startTime: platform.api.maintenanceMode.startTime,
          endTime: platform.api.maintenanceMode.endTime
        }
      };
    } catch (error) {
      logger.error('Failed to get maintenance status', error);
      throw error;
    }
  }

  /**
   * Generate maintenance report
   * @param {String} windowId Maintenance window ID
   * @returns {Promise<Object>} Maintenance report
   */
  async generateMaintenanceReport(windowId) {
    try {
      const platform = await PlatformModel.getInstance();
      const window = platform.maintenanceWindows.id(windowId);

      if (!window) {
        throw new AppError('Maintenance window not found', 404, 'WINDOW_NOT_FOUND');
      }

      // Get task results from cache
      const preTaskResults = await this.cacheService.get(
        `${this.cacheKeyPrefix}pre-tasks:${windowId}`
      ) || { successful: [], failed: [] };

      const postTaskResults = await this.cacheService.get(
        `${this.cacheKeyPrefix}post-tasks:${windowId}`
      ) || { successful: [], failed: [] };

      // Get system health comparison
      const preHealth = await this.cacheService.get(
        `${this.cacheKeyPrefix}pre-maintenance-state:${windowId}`
      );
      const postHealth = await SystemService.getClusterHealth();

      const report = {
        window: {
          id: window._id,
          name: window.name,
          type: window.type,
          startTime: window.startTime,
          endTime: window.endTime,
          duration: new Date(window.endTime) - new Date(window.startTime),
          affectedServices: window.affectedServices,
          description: window.description
        },
        execution: {
          preMaintenanceTasks: preTaskResults,
          postMaintenanceTasks: postTaskResults,
          totalTasks: preTaskResults.successful.length + 
                     preTaskResults.failed.length +
                     postTaskResults.successful.length + 
                     postTaskResults.failed.length,
          successfulTasks: preTaskResults.successful.length + 
                          postTaskResults.successful.length,
          failedTasks: preTaskResults.failed.length + 
                      postTaskResults.failed.length
        },
        systemHealth: {
          before: preHealth,
          after: postHealth,
          comparison: preHealth ? this.#compareSystemHealth(preHealth, postHealth) : null
        },
        generatedAt: new Date(),
        generatedBy: 'system'
      };

      logger.info('Maintenance report generated', {
        windowId,
        windowName: window.name
      });

      return report;
    } catch (error) {
      logger.error('Failed to generate maintenance report', error);
      throw error;
    }
  }

  /**
   * Schedule maintenance notifications
   * @private
   * @param {Object} window Maintenance window
   * @param {Number} leadTime Notification lead time
   * @returns {Promise<void>}
   */
  async #scheduleMaintenanceNotifications(window, leadTime) {
    const notifications = [
      { time: leadTime, type: 'advance' },
      { time: 3600000, type: '1hour' }, // 1 hour
      { time: 300000, type: '5minutes' } // 5 minutes
    ];

    for (const notification of notifications) {
      const notifyTime = new Date(window.startTime).getTime() - notification.time;
      
      if (notifyTime > Date.now()) {
        // Schedule notification job
        const jobId = `notify_${window._id}_${notification.type}`;
        const delay = notifyTime - Date.now();
        
        setTimeout(async () => {
          await this.#sendMaintenanceNotification(window, notification.type);
        }, delay);
        
        this.maintenanceJobs.set(jobId, {
          type: 'notification',
          scheduledFor: new Date(notifyTime)
        });
      }
    }
  }

  /**
   * Schedule automatic maintenance mode
   * @private
   * @param {Object} window Maintenance window
   * @returns {Promise<void>}
   */
  async #scheduleMaintenanceMode(window) {
    // Schedule enabling maintenance mode
    const startDelay = new Date(window.startTime).getTime() - Date.now();
    
    if (startDelay > 0) {
      const startJobId = `enable_${window._id}`;
      
      setTimeout(async () => {
        try {
          await this.executePreMaintenanceTasks(window._id);
          await PlatformService.enableMaintenanceMode({
            message: window.description || `Scheduled maintenance: ${window.name}`,
            duration: new Date(window.endTime) - new Date(window.startTime),
            allowedIps: []
          }, 'system');
        } catch (error) {
          logger.error('Failed to enable maintenance mode', error);
        }
      }, startDelay);
      
      this.maintenanceJobs.set(startJobId, {
        type: 'enable_maintenance',
        scheduledFor: window.startTime
      });
    }

    // Schedule disabling maintenance mode
    const endDelay = new Date(window.endTime).getTime() - Date.now();
    
    if (endDelay > 0) {
      const endJobId = `disable_${window._id}`;
      
      setTimeout(async () => {
        try {
          await PlatformService.disableMaintenanceMode('system');
          await this.executePostMaintenanceTasks(window._id);
        } catch (error) {
          logger.error('Failed to disable maintenance mode', error);
        }
      }, endDelay);
      
      this.maintenanceJobs.set(endJobId, {
        type: 'disable_maintenance',
        scheduledFor: window.endTime
      });
    }
  }

  /**
   * Update scheduled jobs
   * @private
   * @param {String} windowId Window ID
   * @param {Date} newStart New start time
   * @param {Date} newEnd New end time
   * @returns {Promise<void>}
   */
  async #updateScheduledJobs(windowId, newStart, newEnd) {
    // Cancel existing jobs
    await this.#cancelScheduledJobs(windowId);
    
    // Reschedule with new times
    const window = {
      _id: windowId,
      startTime: newStart,
      endTime: newEnd
    };
    
    await this.#scheduleMaintenanceNotifications(window, 86400000);
    await this.#scheduleMaintenanceMode(window);
  }

  /**
   * Cancel scheduled jobs
   * @private
   * @param {String} windowId Window ID
   * @returns {Promise<void>}
   */
  async #cancelScheduledJobs(windowId) {
    const jobsToCancel = [];
    
    for (const [jobId, job] of this.maintenanceJobs) {
      if (jobId.includes(windowId)) {
        jobsToCancel.push(jobId);
      }
    }
    
    for (const jobId of jobsToCancel) {
      this.maintenanceJobs.delete(jobId);
    }
    
    logger.debug('Cancelled scheduled jobs', {
      windowId,
      cancelledJobs: jobsToCancel.length
    });
  }

  /**
   * Send maintenance notification
   * @private
   * @param {Object} window Maintenance window
   * @param {String} type Notification type
   * @returns {Promise<void>}
   */
  async #sendMaintenanceNotification(window, type) {
    const messages = {
      advance: `Scheduled maintenance "${window.name}" will begin at ${window.startTime}`,
      '1hour': `Maintenance "${window.name}" will begin in 1 hour`,
      '5minutes': `Maintenance "${window.name}" will begin in 5 minutes`,
      immediate: `Emergency maintenance "${window.name}" is starting now`
    };

    await NotificationService.sendSystemNotification({
      type: 'maintenance_notification',
      severity: type === 'immediate' ? 'critical' : 'warning',
      title: 'Upcoming Maintenance',
      message: messages[type],
      metadata: {
        windowId: window._id,
        windowName: window.name,
        startTime: window.startTime,
        endTime: window.endTime,
        affectedServices: window.affectedServices
      }
    });

    // Send webhooks
    await WebhookService.trigger('maintenance.notification', {
      window,
      notificationType: type,
      message: messages[type]
    });
  }

  /**
   * Compare system health states
   * @private
   * @param {Object} preHealth Pre-maintenance health
   * @param {Object} postHealth Post-maintenance health
   * @returns {Object} Health comparison
   */
  #compareSystemHealth(preHealth, postHealth) {
    const comparison = {
      degraded: false,
      improved: false,
      changes: []
    };

    // Compare node counts
    if (postHealth.totalNodes < preHealth.totalNodes) {
      comparison.degraded = true;
      comparison.changes.push({
        metric: 'totalNodes',
        before: preHealth.totalNodes,
        after: postHealth.totalNodes,
        change: 'decreased'
      });
    }

    // Compare healthy nodes
    if (postHealth.healthyNodes < preHealth.healthyNodes) {
      comparison.degraded = true;
      comparison.changes.push({
        metric: 'healthyNodes',
        before: preHealth.healthyNodes,
        after: postHealth.healthyNodes,
        change: 'decreased'
      });
    } else if (postHealth.healthyNodes > preHealth.healthyNodes) {
      comparison.improved = true;
      comparison.changes.push({
        metric: 'healthyNodes',
        before: preHealth.healthyNodes,
        after: postHealth.healthyNodes,
        change: 'increased'
      });
    }

    // Compare critical nodes
    if (postHealth.criticalNodes > preHealth.criticalNodes) {
      comparison.degraded = true;
      comparison.changes.push({
        metric: 'criticalNodes',
        before: preHealth.criticalNodes,
        after: postHealth.criticalNodes,
        change: 'increased'
      });
    }

    return comparison;
  }
}

module.exports = new MaintenanceService();