'use strict';

const express = require('express');
const router = express.Router();
const maintenanceController = require('../controllers/maintenance-controller');
const { authenticate, authorize } = require('../../../../../shared/lib/auth/middleware/authenticate');
const { validateRequest } = require('../../../../../shared/lib/middleware/validation/request-validator');
const { maintenanceValidators } = require('../validators/maintenance-validators');

// Maintenance Mode Routes
router.get('/status',
  authenticate,
  authorize(['admin', 'super-admin']),
  maintenanceController.getMaintenanceStatus
);

router.post('/enable',
  authenticate,
  authorize(['super-admin']),
  validateRequest(maintenanceValidators.enableMaintenance),
  maintenanceController.enableMaintenanceMode
);

router.post('/disable',
  authenticate,
  authorize(['super-admin']),
  maintenanceController.disableMaintenanceMode
);

router.put('/settings',
  authenticate,
  authorize(['super-admin']),
  validateRequest(maintenanceValidators.updateSettings),
  maintenanceController.updateMaintenanceSettings
);

// Scheduled Maintenance Routes
router.get('/schedules',
  authenticate,
  authorize(['admin', 'super-admin']),
  maintenanceController.getMaintenanceSchedules
);

router.post('/schedules',
  authenticate,
  authorize(['super-admin']),
  validateRequest(maintenanceValidators.createSchedule),
  maintenanceController.createMaintenanceSchedule
);

router.put('/schedules/:scheduleId',
  authenticate,
  authorize(['super-admin']),
  validateRequest(maintenanceValidators.updateSchedule),
  maintenanceController.updateMaintenanceSchedule
);

router.delete('/schedules/:scheduleId',
  authenticate,
  authorize(['super-admin']),
  maintenanceController.deleteMaintenanceSchedule
);

// Maintenance Windows Routes
router.get('/windows',
  authenticate,
  authorize(['admin', 'super-admin']),
  maintenanceController.getMaintenanceWindows
);

router.get('/windows/active',
  authenticate,
  authorize(['admin', 'super-admin']),
  maintenanceController.getActiveMaintenanceWindow
);

router.post('/windows',
  authenticate,
  authorize(['super-admin']),
  validateRequest(maintenanceValidators.createWindow),
  maintenanceController.createMaintenanceWindow
);

router.put('/windows/:windowId',
  authenticate,
  authorize(['super-admin']),
  validateRequest(maintenanceValidators.updateWindow),
  maintenanceController.updateMaintenanceWindow
);

router.post('/windows/:windowId/cancel',
  authenticate,
  authorize(['super-admin']),
  maintenanceController.cancelMaintenanceWindow
);

// Database Maintenance Routes
router.get('/database/tasks',
  authenticate,
  authorize(['admin', 'super-admin']),
  maintenanceController.getDatabaseMaintenanceTasks
);

router.post('/database/backup',
  authenticate,
  authorize(['super-admin']),
  validateRequest(maintenanceValidators.backupDatabase),
  maintenanceController.backupDatabase
);

router.post('/database/restore',
  authenticate,
  authorize(['super-admin']),
  validateRequest(maintenanceValidators.restoreDatabase),
  maintenanceController.restoreDatabase
);

router.post('/database/optimize',
  authenticate,
  authorize(['super-admin']),
  maintenanceController.optimizeDatabase
);

router.post('/database/vacuum',
  authenticate,
  authorize(['super-admin']),
  maintenanceController.vacuumDatabase
);

router.post('/database/reindex',
  authenticate,
  authorize(['super-admin']),
  maintenanceController.reindexDatabase
);

// System Cleanup Routes
router.get('/cleanup/tasks',
  authenticate,
  authorize(['admin', 'super-admin']),
  maintenanceController.getCleanupTasks
);

router.post('/cleanup/logs',
  authenticate,
  authorize(['super-admin']),
  validateRequest(maintenanceValidators.cleanupLogs),
  maintenanceController.cleanupLogs
);

router.post('/cleanup/temp-files',
  authenticate,
  authorize(['super-admin']),
  maintenanceController.cleanupTempFiles
);

router.post('/cleanup/cache',
  authenticate,
  authorize(['super-admin']),
  maintenanceController.cleanupCache
);

router.post('/cleanup/sessions',
  authenticate,
  authorize(['super-admin']),
  validateRequest(maintenanceValidators.cleanupSessions),
  maintenanceController.cleanupSessions
);

// Data Migration Routes
router.get('/migrations',
  authenticate,
  authorize(['admin', 'super-admin']),
  maintenanceController.getDataMigrations
);

router.get('/migrations/pending',
  authenticate,
  authorize(['admin', 'super-admin']),
  maintenanceController.getPendingMigrations
);

router.post('/migrations/run',
  authenticate,
  authorize(['super-admin']),
  validateRequest(maintenanceValidators.runMigration),
  maintenanceController.runDataMigration
);

router.post('/migrations/rollback',
  authenticate,
  authorize(['super-admin']),
  validateRequest(maintenanceValidators.rollbackMigration),
  maintenanceController.rollbackDataMigration
);

// System Updates Routes
router.get('/updates',
  authenticate,
  authorize(['admin', 'super-admin']),
  maintenanceController.getSystemUpdates
);

router.get('/updates/available',
  authenticate,
  authorize(['admin', 'super-admin']),
  maintenanceController.checkAvailableUpdates
);

router.post('/updates/install',
  authenticate,
  authorize(['super-admin']),
  validateRequest(maintenanceValidators.installUpdate),
  maintenanceController.installSystemUpdate
);

router.post('/updates/schedule',
  authenticate,
  authorize(['super-admin']),
  validateRequest(maintenanceValidators.scheduleUpdate),
  maintenanceController.scheduleSystemUpdate
);

// Health Checks Routes
router.get('/health-checks',
  authenticate,
  authorize(['admin', 'super-admin']),
  maintenanceController.getHealthChecks
);

router.post('/health-checks/run',
  authenticate,
  authorize(['super-admin']),
  validateRequest(maintenanceValidators.runHealthCheck),
  maintenanceController.runHealthCheck
);

router.get('/health-checks/history',
  authenticate,
  authorize(['admin', 'super-admin']),
  maintenanceController.getHealthCheckHistory
);

// Maintenance Reports Routes
router.get('/reports',
  authenticate,
  authorize(['admin', 'super-admin']),
  maintenanceController.getMaintenanceReports
);

router.post('/reports/generate',
  authenticate,
  authorize(['super-admin']),
  validateRequest(maintenanceValidators.generateReport),
  maintenanceController.generateMaintenanceReport
);

router.get('/reports/:reportId',
  authenticate,
  authorize(['admin', 'super-admin']),
  maintenanceController.getMaintenanceReportDetails
);

// Maintenance Notifications Routes
router.get('/notifications/templates',
  authenticate,
  authorize(['admin', 'super-admin']),
  maintenanceController.getNotificationTemplates
);

router.put('/notifications/templates/:templateId',
  authenticate,
  authorize(['super-admin']),
  validateRequest(maintenanceValidators.updateNotificationTemplate),
  maintenanceController.updateNotificationTemplate
);

router.post('/notifications/send',
  authenticate,
  authorize(['super-admin']),
  validateRequest(maintenanceValidators.sendNotification),
  maintenanceController.sendMaintenanceNotification
);

module.exports = router;