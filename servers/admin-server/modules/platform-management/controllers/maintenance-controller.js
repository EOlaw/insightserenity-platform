'use strict';

/**
 * @fileoverview Maintenance operations controller
 * @module servers/admin-server/modules/platform-management/controllers/maintenance-controller
 * @requires module:servers/admin-server/modules/platform-management/services/maintenance-service
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/response-formatter
 * @requires module:shared/lib/utils/async-handler
 * @requires module:shared/lib/utils/constants/status-codes
 * @requires module:shared/lib/utils/helpers/date-helper
 */

const maintenanceService = require('../services/maintenance-service');
const logger = require('../../../../../shared/lib/utils/logger');
const { AppError } = require('../../../../../shared/lib/utils/app-error');
const responseFormatter = require('../../../../../shared/lib/utils/response-formatter');
const { asyncHandler } = require('../../../../../shared/lib/utils/async-handler');
const { StatusCodes } = require('../../../../../shared/lib/utils/constants/status-codes');
const dateHelper = require('../../../../../shared/lib/utils/helpers/date-helper');

/**
 * @class MaintenanceController
 * @description Controller for maintenance window management operations
 */
class MaintenanceController {
  /**
   * Schedules a maintenance window
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  scheduleMaintenanceWindow = asyncHandler(async (req, res, next) => {
    try {
      const maintenanceData = req.body;
      const userId = req.user.id;

      logger.info('Scheduling maintenance window', {
        type: maintenanceData.type,
        startTime: maintenanceData.startTime,
        endTime: maintenanceData.endTime,
        environment: maintenanceData.environment,
        userId
      });

      // Validate required fields
      const requiredFields = ['type', 'startTime', 'endTime', 'description'];
      const missingFields = requiredFields.filter(field => !maintenanceData[field]);
      
      if (missingFields.length > 0) {
        throw new AppError(`Missing required fields: ${missingFields.join(', ')}`, 400);
      }

      const maintenance = await maintenanceService.scheduleMaintenanceWindow(
        maintenanceData,
        userId
      );

      return res.status(StatusCodes.CREATED).json(
        responseFormatter.success(
          maintenance,
          'Maintenance window scheduled successfully'
        )
      );
    } catch (error) {
      logger.error('Failed to schedule maintenance window', {
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Updates a maintenance window
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  updateMaintenanceWindow = asyncHandler(async (req, res, next) => {
    try {
      const { maintenanceId } = req.params;
      const updates = req.body;
      const userId = req.user.id;

      logger.info('Updating maintenance window', {
        maintenanceId,
        updates: Object.keys(updates),
        userId
      });

      if (Object.keys(updates).length === 0) {
        throw new AppError('No updates provided', 400);
      }

      const maintenance = await maintenanceService.updateMaintenanceWindow(
        maintenanceId,
        updates,
        userId
      );

      return res.status(StatusCodes.OK).json(
        responseFormatter.success(
          maintenance,
          'Maintenance window updated successfully'
        )
      );
    } catch (error) {
      logger.error('Failed to update maintenance window', {
        maintenanceId: req.params.maintenanceId,
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Cancels a maintenance window
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  cancelMaintenanceWindow = asyncHandler(async (req, res, next) => {
    try {
      const { maintenanceId } = req.params;
      const { reason } = req.body;
      const userId = req.user.id;

      logger.info('Cancelling maintenance window', {
        maintenanceId,
        reason,
        userId
      });

      if (!reason) {
        throw new AppError('Cancellation reason is required', 400);
      }

      const cancellationData = { reason };

      const maintenance = await maintenanceService.cancelMaintenanceWindow(
        maintenanceId,
        cancellationData,
        userId
      );

      return res.status(StatusCodes.OK).json(
        responseFormatter.success(
          maintenance,
          'Maintenance window cancelled successfully'
        )
      );
    } catch (error) {
      logger.error('Failed to cancel maintenance window', {
        maintenanceId: req.params.maintenanceId,
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Starts a maintenance window
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  startMaintenanceWindow = asyncHandler(async (req, res, next) => {
    try {
      const { maintenanceId } = req.params;
      const userId = req.user.id;

      logger.info('Starting maintenance window', {
        maintenanceId,
        userId
      });

      const maintenance = await maintenanceService.startMaintenanceWindow(
        maintenanceId,
        userId
      );

      return res.status(StatusCodes.OK).json(
        responseFormatter.success(
          maintenance,
          'Maintenance window started successfully'
        )
      );
    } catch (error) {
      logger.error('Failed to start maintenance window', {
        maintenanceId: req.params.maintenanceId,
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Completes a maintenance window
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  completeMaintenanceWindow = asyncHandler(async (req, res, next) => {
    try {
      const { maintenanceId } = req.params;
      const { summary, tasksCompleted, issuesEncountered } = req.body;
      const userId = req.user.id;

      logger.info('Completing maintenance window', {
        maintenanceId,
        hasSummary: !!summary,
        userId
      });

      const completionData = {
        summary: summary || 'Maintenance completed successfully',
        tasksCompleted,
        issuesEncountered,
        userId
      };

      const maintenance = await maintenanceService.completeMaintenanceWindow(
        maintenanceId,
        completionData,
        userId
      );

      return res.status(StatusCodes.OK).json(
        responseFormatter.success(
          maintenance,
          'Maintenance window completed successfully'
        )
      );
    } catch (error) {
      logger.error('Failed to complete maintenance window', {
        maintenanceId: req.params.maintenanceId,
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Extends a maintenance window
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  extendMaintenanceWindow = asyncHandler(async (req, res, next) => {
    try {
      const { maintenanceId } = req.params;
      const { extensionMinutes, reason } = req.body;
      const userId = req.user.id;

      logger.info('Extending maintenance window', {
        maintenanceId,
        extensionMinutes,
        reason,
        userId
      });

      if (!extensionMinutes || extensionMinutes <= 0) {
        throw new AppError('Valid extension time in minutes is required', 400);
      }

      if (!reason) {
        throw new AppError('Extension reason is required', 400);
      }

      const extensionData = {
        extensionMinutes,
        reason
      };

      const maintenance = await maintenanceService.extendMaintenanceWindow(
        maintenanceId,
        extensionData,
        userId
      );

      return res.status(StatusCodes.OK).json(
        responseFormatter.success(
          maintenance,
          `Maintenance window extended by ${extensionMinutes} minutes`
        )
      );
    } catch (error) {
      logger.error('Failed to extend maintenance window', {
        maintenanceId: req.params.maintenanceId,
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Gets active maintenance windows
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  getActiveMaintenanceWindows = asyncHandler(async (req, res, next) => {
    try {
      const { environment, noCache } = req.query;

      logger.info('Getting active maintenance windows', {
        environment,
        userId: req.user?.id
      });

      const filters = {
        environment,
        fromCache: noCache !== 'true'
      };

      const maintenanceWindows = await maintenanceService.getActiveMaintenanceWindows(filters);

      return res.status(StatusCodes.OK).json(
        responseFormatter.success(
          {
            maintenanceWindows,
            total: maintenanceWindows.length,
            currentTime: new Date()
          },
          'Active maintenance windows retrieved successfully'
        )
      );
    } catch (error) {
      logger.error('Failed to get active maintenance windows', {
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Gets scheduled maintenance windows
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  getScheduledMaintenanceWindows = asyncHandler(async (req, res, next) => {
    try {
      const {
        environment,
        startDate,
        endDate,
        page = 1,
        limit = 20,
        noCache
      } = req.query;

      logger.info('Getting scheduled maintenance windows', {
        environment,
        startDate,
        endDate,
        page,
        limit,
        userId: req.user?.id
      });

      const filters = {
        environment,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        page: parseInt(page),
        limit: parseInt(limit),
        fromCache: noCache !== 'true'
      };

      const results = await maintenanceService.getScheduledMaintenanceWindows(filters);

      return res.status(StatusCodes.OK).json(
        responseFormatter.success(
          results,
          'Scheduled maintenance windows retrieved successfully'
        )
      );
    } catch (error) {
      logger.error('Failed to get scheduled maintenance windows', {
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Gets maintenance history
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  getMaintenanceHistory = asyncHandler(async (req, res, next) => {
    try {
      const {
        environment,
        platformId,
        status,
        startDate,
        endDate,
        page = 1,
        limit = 50
      } = req.query;

      logger.info('Getting maintenance history', {
        environment,
        platformId,
        status,
        startDate,
        endDate,
        userId: req.user?.id
      });

      const filters = {
        environment,
        platformId,
        status,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        page: parseInt(page),
        limit: parseInt(limit)
      };

      const results = await maintenanceService.getMaintenanceHistory(filters);

      return res.status(StatusCodes.OK).json(
        responseFormatter.success(
          results,
          'Maintenance history retrieved successfully'
        )
      );
    } catch (error) {
      logger.error('Failed to get maintenance history', {
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Gets maintenance statistics
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  getMaintenanceStatistics = asyncHandler(async (req, res, next) => {
    try {
      const {
        environment,
        startDate,
        endDate,
        noCache
      } = req.query;

      logger.info('Getting maintenance statistics', {
        environment,
        startDate,
        endDate,
        userId: req.user?.id
      });

      const options = {
        environment,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        fromCache: noCache !== 'true'
      };

      const statistics = await maintenanceService.getMaintenanceStatistics(options);

      return res.status(StatusCodes.OK).json(
        responseFormatter.success(
          statistics,
          'Maintenance statistics retrieved successfully'
        )
      );
    } catch (error) {
      logger.error('Failed to get maintenance statistics', {
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Checks if system is in maintenance
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  checkMaintenanceStatus = asyncHandler(async (req, res, next) => {
    try {
      const { platformId } = req.query;

      logger.info('Checking maintenance status', {
        platformId,
        userId: req.user?.id
      });

      const inMaintenance = await maintenanceService.isInMaintenance(platformId);

      let activeWindows = [];
      if (inMaintenance) {
        activeWindows = await maintenanceService.getActiveMaintenanceWindows({
          fromCache: true
        });

        if (platformId) {
          activeWindows = activeWindows.filter(w => w.platformId === platformId);
        }
      }

      return res.status(StatusCodes.OK).json(
        responseFormatter.success(
          {
            inMaintenance,
            activeWindows,
            platformId: platformId || 'all'
          },
          inMaintenance ? 'System is in maintenance' : 'System is operational'
        )
      );
    } catch (error) {
      logger.error('Failed to check maintenance status', {
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Gets maintenance window details
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  getMaintenanceWindow = asyncHandler(async (req, res, next) => {
    try {
      const { maintenanceId } = req.params;

      logger.info('Getting maintenance window details', {
        maintenanceId,
        userId: req.user?.id
      });

      // Get maintenance history to find the specific window
      const history = await maintenanceService.getMaintenanceHistory({
        limit: 1000
      });

      const maintenance = history.maintenanceWindows.find(w => w.id === maintenanceId);

      if (!maintenance) {
        throw new AppError('Maintenance window not found', 404);
      }

      const details = {
        ...maintenance,
        duration: maintenance.endTime - maintenance.startTime,
        durationFormatted: dateHelper.formatDuration(maintenance.endTime - maintenance.startTime),
        timeUntilStart: maintenance.status === 'scheduled' ? 
          maintenance.startTime - new Date() : null,
        timeRemaining: maintenance.status === 'in-progress' ? 
          maintenance.endTime - new Date() : null
      };

      return res.status(StatusCodes.OK).json(
        responseFormatter.success(
          details,
          'Maintenance window details retrieved successfully'
        )
      );
    } catch (error) {
      logger.error('Failed to get maintenance window details', {
        maintenanceId: req.params.maintenanceId,
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Gets upcoming maintenance windows
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  getUpcomingMaintenanceWindows = asyncHandler(async (req, res, next) => {
    try {
      const { days = 7, environment } = req.query;

      logger.info('Getting upcoming maintenance windows', {
        days,
        environment,
        userId: req.user?.id
      });

      const endDate = new Date();
      endDate.setDate(endDate.getDate() + parseInt(days));

      const filters = {
        environment,
        startDate: new Date(),
        endDate,
        fromCache: true
      };

      const results = await maintenanceService.getScheduledMaintenanceWindows(filters);

      const upcoming = results.maintenanceWindows.map(window => ({
        ...window,
        daysUntil: Math.ceil((window.startTime - new Date()) / (1000 * 60 * 60 * 24)),
        hoursUntil: Math.ceil((window.startTime - new Date()) / (1000 * 60 * 60))
      }));

      return res.status(StatusCodes.OK).json(
        responseFormatter.success(
          {
            upcoming,
            total: upcoming.length,
            timeframe: {
              start: new Date(),
              end: endDate,
              days: parseInt(days)
            }
          },
          'Upcoming maintenance windows retrieved successfully'
        )
      );
    } catch (error) {
      logger.error('Failed to get upcoming maintenance windows', {
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Gets maintenance calendar
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  getMaintenanceCalendar = asyncHandler(async (req, res, next) => {
    try {
      const { year, month, environment } = req.query;

      const currentDate = new Date();
      const targetYear = year ? parseInt(year) : currentDate.getFullYear();
      const targetMonth = month ? parseInt(month) - 1 : currentDate.getMonth();

      logger.info('Getting maintenance calendar', {
        year: targetYear,
        month: targetMonth + 1,
        environment,
        userId: req.user?.id
      });

      // Calculate date range for the month
      const startDate = new Date(targetYear, targetMonth, 1);
      const endDate = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59);

      const filters = {
        environment,
        startDate,
        endDate,
        limit: 100
      };

      const results = await maintenanceService.getScheduledMaintenanceWindows(filters);

      // Group maintenance windows by date
      const calendar = {};
      const daysInMonth = endDate.getDate();

      for (let day = 1; day <= daysInMonth; day++) {
        const dateKey = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        calendar[dateKey] = {
          date: new Date(targetYear, targetMonth, day),
          maintenanceWindows: []
        };
      }

      // Add maintenance windows to calendar
      for (const window of results.maintenanceWindows) {
        const windowDate = new Date(window.startTime);
        const dateKey = windowDate.toISOString().split('T')[0];
        
        if (calendar[dateKey]) {
          calendar[dateKey].maintenanceWindows.push({
            id: window.id,
            type: window.type,
            startTime: window.startTime,
            endTime: window.endTime,
            description: window.description,
            status: window.status,
            requiresDowntime: window.requiresDowntime
          });
        }
      }

      return res.status(StatusCodes.OK).json(
        responseFormatter.success(
          {
            calendar,
            month: targetMonth + 1,
            year: targetYear,
            totalWindows: results.maintenanceWindows.length
          },
          'Maintenance calendar retrieved successfully'
        )
      );
    } catch (error) {
      logger.error('Failed to get maintenance calendar', {
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Gets maintenance impact analysis
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  getMaintenanceImpactAnalysis = asyncHandler(async (req, res, next) => {
    try {
      const { maintenanceId } = req.params;

      logger.info('Getting maintenance impact analysis', {
        maintenanceId,
        userId: req.user?.id
      });

      // Get maintenance window details
      const history = await maintenanceService.getMaintenanceHistory({
        limit: 1000
      });

      const maintenance = history.maintenanceWindows.find(w => w.id === maintenanceId);

      if (!maintenance) {
        throw new AppError('Maintenance window not found', 404);
      }

      // Analyze impact
      const impactAnalysis = {
        maintenanceId,
        type: maintenance.type,
        duration: {
          planned: maintenance.endTime - maintenance.startTime,
          actual: maintenance.completedAt ? 
            maintenance.completedAt - maintenance.startTime : null,
          formatted: dateHelper.formatDuration(maintenance.endTime - maintenance.startTime)
        },
        downtime: {
          required: maintenance.requiresDowntime,
          estimatedMinutes: maintenance.requiresDowntime ? 
            Math.ceil((maintenance.endTime - maintenance.startTime) / (1000 * 60)) : 0
        },
        services: {
          affected: maintenance.affectedServices || [],
          count: maintenance.affectedServices?.length || 0
        },
        risk: {
          level: maintenance.type === 'emergency' ? 'high' : 
                 maintenance.requiresDowntime ? 'medium' : 'low',
          factors: []
        },
        notifications: {
          enabled: maintenance.notifications?.enabled || false,
          advanceMinutes: maintenance.notifications?.advanceMinutes || [],
          sent: maintenance.notifications?.sentAt?.length || 0
        }
      };

      // Add risk factors
      if (maintenance.type === 'emergency') {
        impactAnalysis.risk.factors.push('Emergency maintenance - unplanned');
      }
      if (maintenance.requiresDowntime) {
        impactAnalysis.risk.factors.push('Service downtime required');
      }
      if (maintenance.affectedServices?.length > 3) {
        impactAnalysis.risk.factors.push('Multiple services affected');
      }
      if ((maintenance.endTime - maintenance.startTime) > 4 * 60 * 60 * 1000) {
        impactAnalysis.risk.factors.push('Extended maintenance window (>4 hours)');
      }

      return res.status(StatusCodes.OK).json(
        responseFormatter.success(
          impactAnalysis,
          'Maintenance impact analysis completed'
        )
      );
    } catch (error) {
      logger.error('Failed to get maintenance impact analysis', {
        maintenanceId: req.params.maintenanceId,
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Validates maintenance window
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  validateMaintenanceWindow = asyncHandler(async (req, res, next) => {
    try {
      const maintenanceData = req.body;

      logger.info('Validating maintenance window', {
        type: maintenanceData.type,
        startTime: maintenanceData.startTime,
        endTime: maintenanceData.endTime,
        userId: req.user?.id
      });

      const validation = {
        valid: true,
        errors: [],
        warnings: []
      };

      // Validate required fields
      const requiredFields = ['type', 'startTime', 'endTime', 'description'];
      for (const field of requiredFields) {
        if (!maintenanceData[field]) {
          validation.valid = false;
          validation.errors.push(`Missing required field: ${field}`);
        }
      }

      // Validate dates
      if (maintenanceData.startTime && maintenanceData.endTime) {
        const startTime = new Date(maintenanceData.startTime);
        const endTime = new Date(maintenanceData.endTime);
        const now = new Date();

        if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
          validation.valid = false;
          validation.errors.push('Invalid date format');
        } else {
          if (startTime >= endTime) {
            validation.valid = false;
            validation.errors.push('End time must be after start time');
          }

          if (maintenanceData.type === 'scheduled' && startTime < now) {
            validation.valid = false;
            validation.errors.push('Scheduled maintenance must be in the future');
          }

          const duration = endTime - startTime;
          const maxDuration = 24 * 60 * 60 * 1000; // 24 hours

          if (duration > maxDuration) {
            validation.valid = false;
            validation.errors.push('Maintenance window cannot exceed 24 hours');
          }

          // Warnings
          if (duration < 30 * 60 * 1000) {
            validation.warnings.push('Maintenance window is less than 30 minutes');
          }

          if (startTime < new Date(now.getTime() + 24 * 60 * 60 * 1000)) {
            validation.warnings.push('Maintenance is scheduled within 24 hours');
          }

          // Check for business hours (9 AM - 5 PM)
          const startHour = startTime.getHours();
          if (startHour >= 9 && startHour < 17) {
            validation.warnings.push('Maintenance is scheduled during business hours');
          }
        }
      }

      // Validate affected services
      if (maintenanceData.affectedServices && !Array.isArray(maintenanceData.affectedServices)) {
        validation.valid = false;
        validation.errors.push('Affected services must be an array');
      }

      // Check for conflicts (simplified check)
      if (validation.valid) {
        try {
          const activeWindows = await maintenanceService.getActiveMaintenanceWindows({
            environment: maintenanceData.environment
          });

          const scheduledWindows = await maintenanceService.getScheduledMaintenanceWindows({
            environment: maintenanceData.environment,
            startDate: new Date(maintenanceData.startTime),
            endDate: new Date(maintenanceData.endTime)
          });

          const allWindows = [...activeWindows, ...scheduledWindows.maintenanceWindows];
          
          for (const window of allWindows) {
            const windowStart = new Date(window.startTime);
            const windowEnd = new Date(window.endTime);
            const newStart = new Date(maintenanceData.startTime);
            const newEnd = new Date(maintenanceData.endTime);

            if (
              (newStart >= windowStart && newStart < windowEnd) ||
              (newEnd > windowStart && newEnd <= windowEnd) ||
              (newStart <= windowStart && newEnd >= windowEnd)
            ) {
              validation.warnings.push(`Potential conflict with maintenance window from ${windowStart} to ${windowEnd}`);
            }
          }
        } catch (error) {
          logger.error('Failed to check for maintenance conflicts', {
            error: error.message
          });
        }
      }

      const statusCode = validation.valid ? StatusCodes.OK : StatusCodes.BAD_REQUEST;
      const message = validation.valid ? 
        'Maintenance window validation passed' : 
        `Validation failed with ${validation.errors.length} errors`;

      return res.status(statusCode).json(
        responseFormatter.success(
          validation,
          message
        )
      );
    } catch (error) {
      logger.error('Failed to validate maintenance window', {
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Exports maintenance schedule
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  exportMaintenanceSchedule = asyncHandler(async (req, res, next) => {
    try {
      const {
        startDate,
        endDate,
        environment,
        format = 'json'
      } = req.query;

      logger.info('Exporting maintenance schedule', {
        startDate,
        endDate,
        environment,
        format,
        userId: req.user?.id
      });

      const filters = {
        environment,
        startDate: startDate ? new Date(startDate) : new Date(),
        endDate: endDate ? new Date(endDate) : new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        limit: 1000
      };

      const results = await maintenanceService.getScheduledMaintenanceWindows(filters);

      let exportData;
      let contentType;
      let filename;

      switch (format) {
        case 'csv':
          exportData = this.#convertMaintenanceToCSV(results.maintenanceWindows);
          contentType = 'text/csv';
          filename = `maintenance-schedule-${Date.now()}.csv`;
          break;

        case 'ics':
          exportData = this.#convertMaintenanceToICS(results.maintenanceWindows);
          contentType = 'text/calendar';
          filename = `maintenance-schedule-${Date.now()}.ics`;
          break;

        case 'json':
        default:
          exportData = JSON.stringify({
            exportDate: new Date(),
            period: {
              start: filters.startDate,
              end: filters.endDate
            },
            environment,
            maintenanceWindows: results.maintenanceWindows,
            total: results.maintenanceWindows.length
          }, null, 2);
          contentType = 'application/json';
          filename = `maintenance-schedule-${Date.now()}.json`;
          break;
      }

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      return res.status(StatusCodes.OK).send(exportData);
    } catch (error) {
      logger.error('Failed to export maintenance schedule', {
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Creates maintenance report
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  createMaintenanceReport = asyncHandler(async (req, res, next) => {
    try {
      const {
        startDate,
        endDate,
        environment,
        includeStatistics = true,
        includeDetails = true
      } = req.query;

      logger.info('Creating maintenance report', {
        startDate,
        endDate,
        environment,
        userId: req.user?.id
      });

      const reportStartDate = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const reportEndDate = endDate ? new Date(endDate) : new Date();

      // Get maintenance data
      const [history, statistics] = await Promise.all([
        maintenanceService.getMaintenanceHistory({
          environment,
          startDate: reportStartDate,
          endDate: reportEndDate,
          limit: 1000
        }),
        includeStatistics ? maintenanceService.getMaintenanceStatistics({
          environment,
          startDate: reportStartDate,
          endDate: reportEndDate
        }) : null
      ]);

      // Build report
      const report = {
        metadata: {
          reportId: `REPORT_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          generatedAt: new Date(),
          generatedBy: req.user.id,
          period: {
            start: reportStartDate,
            end: reportEndDate,
            days: Math.ceil((reportEndDate - reportStartDate) / (1000 * 60 * 60 * 24))
          },
          environment: environment || 'all'
        },
        summary: {
          totalWindows: history.maintenanceWindows.length,
          byStatus: {},
          byType: {},
          averageDuration: 0,
          totalDowntime: 0
        },
        statistics: includeStatistics ? statistics : null,
        maintenanceWindows: includeDetails ? history.maintenanceWindows : []
      };

      // Calculate summary
      let totalDuration = 0;
      let completedCount = 0;

      for (const window of history.maintenanceWindows) {
        // Status breakdown
        report.summary.byStatus[window.status] = (report.summary.byStatus[window.status] || 0) + 1;
        
        // Type breakdown
        report.summary.byType[window.type] = (report.summary.byType[window.type] || 0) + 1;
        
        // Duration calculations
        if (window.status === 'completed' && window.completedAt) {
          const duration = new Date(window.completedAt) - new Date(window.startTime);
          totalDuration += duration;
          completedCount++;
          
          if (window.requiresDowntime) {
            report.summary.totalDowntime += duration;
          }
        }
      }

      if (completedCount > 0) {
        report.summary.averageDuration = Math.round(totalDuration / completedCount);
        report.summary.averageDurationFormatted = dateHelper.formatDuration(report.summary.averageDuration);
      }

      if (report.summary.totalDowntime > 0) {
        report.summary.totalDowntimeFormatted = dateHelper.formatDuration(report.summary.totalDowntime);
      }

      // Add recommendations
      report.recommendations = this.#generateMaintenanceRecommendations(report);

      return res.status(StatusCodes.OK).json(
        responseFormatter.success(
          report,
          'Maintenance report generated successfully'
        )
      );
    } catch (error) {
      logger.error('Failed to create maintenance report', {
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Registers maintenance handler
   * @async
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   * @returns {Promise<void>}
   */
  registerMaintenanceHandler = asyncHandler(async (req, res, next) => {
    try {
      const { handlerName, webhookUrl, events } = req.body;

      logger.info('Registering maintenance handler', {
        handlerName,
        webhookUrl,
        events,
        userId: req.user?.id
      });

      if (!handlerName || !webhookUrl || !events || !Array.isArray(events)) {
        throw new AppError('Handler name, webhook URL, and events array are required', 400);
      }

      // In production, implement actual webhook handler registration
      const handler = {
        preMaintenanceTasks: async (platform, maintenance) => {
          logger.info('Executing pre-maintenance webhook', {
            handlerName,
            maintenanceId: maintenance.id,
            webhookUrl
          });
          // Make HTTP request to webhook
        },
        postMaintenanceTasks: async (platform, maintenance, completionData) => {
          logger.info('Executing post-maintenance webhook', {
            handlerName,
            maintenanceId: maintenance.id,
            webhookUrl
          });
          // Make HTTP request to webhook
        }
      };

      maintenanceService.registerMaintenanceHandler(handlerName, handler);

      return res.status(StatusCodes.CREATED).json(
        responseFormatter.success(
          {
            handlerName,
            webhookUrl,
            events,
            status: 'registered'
          },
          'Maintenance handler registered successfully'
        )
      );
    } catch (error) {
      logger.error('Failed to register maintenance handler', {
        handlerName: req.body.handlerName,
        error: error.message,
        userId: req.user?.id
      });
      next(error);
    }
  });

  /**
   * Converts maintenance windows to CSV format
   * @private
   * @param {Array} maintenanceWindows - Maintenance windows
   * @returns {string} CSV formatted data
   */
  #convertMaintenanceToCSV(maintenanceWindows) {
    const headers = [
      'ID',
      'Type',
      'Status',
      'Start Time',
      'End Time',
      'Duration (minutes)',
      'Description',
      'Affected Services',
      'Requires Downtime',
      'Platform ID',
      'Environment'
    ];

    const rows = maintenanceWindows.map(window => [
      window.id,
      window.type,
      window.status,
      new Date(window.startTime).toISOString(),
      new Date(window.endTime).toISOString(),
      Math.ceil((new Date(window.endTime) - new Date(window.startTime)) / (1000 * 60)),
      `"${window.description.replace(/"/g, '""')}"`,
      window.affectedServices?.join(';') || '',
      window.requiresDowntime ? 'Yes' : 'No',
      window.platformId,
      window.environment
    ]);

    return [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');
  }

  /**
   * Converts maintenance windows to ICS format
   * @private
   * @param {Array} maintenanceWindows - Maintenance windows
   * @returns {string} ICS formatted data
   */
  #convertMaintenanceToICS(maintenanceWindows) {
    const icsLines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//InsightSerenity//Maintenance Schedule//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH'
    ];

    for (const window of maintenanceWindows) {
      const uid = `${window.id}@insightserenity.com`;
      const startTime = new Date(window.startTime).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
      const endTime = new Date(window.endTime).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
      
      icsLines.push(
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTART:${startTime}`,
        `DTEND:${endTime}`,
        `SUMMARY:Maintenance: ${window.type}`,
        `DESCRIPTION:${window.description}`,
        `STATUS:${window.status === 'scheduled' ? 'CONFIRMED' : 'TENTATIVE'}`,
        `CATEGORIES:MAINTENANCE,${window.type.toUpperCase()}`,
        'END:VEVENT'
      );
    }

    icsLines.push('END:VCALENDAR');
    return icsLines.join('\r\n');
  }

  /**
   * Generates maintenance recommendations
   * @private
   * @param {Object} report - Maintenance report
   * @returns {Array} Recommendations
   */
  #generateMaintenanceRecommendations(report) {
    const recommendations = [];

    // Check completion rate
    const completionRate = report.summary.byStatus.completed ? 
      (report.summary.byStatus.completed / report.summary.totalWindows) * 100 : 0;
    
    if (completionRate < 80) {
      recommendations.push({
        category: 'completion',
        severity: 'medium',
        message: `Completion rate is ${completionRate.toFixed(1)}%. Consider reviewing maintenance planning and execution processes.`
      });
    }

    // Check emergency maintenance ratio
    const emergencyRatio = report.summary.byType.emergency ? 
      (report.summary.byType.emergency / report.summary.totalWindows) * 100 : 0;
    
    if (emergencyRatio > 20) {
      recommendations.push({
        category: 'planning',
        severity: 'high',
        message: `${emergencyRatio.toFixed(1)}% of maintenance is emergency. Increase proactive maintenance to reduce emergencies.`
      });
    }

    // Check average duration
    if (report.summary.averageDuration > 4 * 60 * 60 * 1000) {
      recommendations.push({
        category: 'efficiency',
        severity: 'medium',
        message: 'Average maintenance duration exceeds 4 hours. Consider breaking down maintenance into smaller windows.'
      });
    }

    // Check downtime impact
    if (report.summary.totalDowntime > 24 * 60 * 60 * 1000) {
      recommendations.push({
        category: 'availability',
        severity: 'high',
        message: `Total downtime of ${report.summary.totalDowntimeFormatted} in period. Implement strategies to reduce downtime.`
      });
    }

    return recommendations;
  }
}

// Export singleton instance
module.exports = new MaintenanceController();