'use strict';

/**
 * @fileoverview Enterprise-grade backup and recovery service
 * @module shared/lib/services/backup-service
 * @requires module:fs-extra
 * @requires module:archiver
 * @requires module:mongodb
 * @requires module:shared/lib/services/file-service
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/security/encryption/encryption-service
 * @requires module:shared/lib/database/models/audit-log-model
 * @requires module:shared/config
 */

const fs = require('fs-extra');
const path = require('path');
const archiver = require('archiver');
const { MongoClient } = require('mongodb');
const FileService = require('./file-service');
const CacheService = require('./cache-service');
const EncryptionService = require('../security/encryption/encryption-service');
const logger = require('../utils/logger');
const { AppError } = require('../utils/app-error');
const AuditLogModel = require('../database/models/security/audit-log-model');
const config = require('../../config');
const { ERROR_CODES } = require('../utils/constants/error-codes');
const crypto = require('crypto');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

/**
 * @class BackupService
 * @description Comprehensive backup and recovery service with encryption and multiple storage options
 */
class BackupService {
  /**
   * @private
   * @static
   * @type {Object}
   */
  static #config;

  /**
   * @private
   * @static
   * @type {CacheService}
   */
  static #cacheService;

  /**
   * @private
   * @static
   * @type {EncryptionService}
   */
  static #encryptionService;

  /**
   * @private
   * @static
   * @type {Map<string, Object>}
   */
  static #activeBackups = new Map();

  /**
   * @private
   * @static
   * @type {Map<string, NodeJS.Timeout>}
   */
  static #scheduledBackups = new Map();

  /**
   * @private
   * @static
   * @type {boolean}
   */
  static #initialized = false;

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #BACKUP_TYPES = {
    FULL: 'full',
    INCREMENTAL: 'incremental',
    DIFFERENTIAL: 'differential',
    SNAPSHOT: 'snapshot'
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #BACKUP_TARGETS = {
    DATABASE: 'database',
    FILES: 'files',
    CACHE: 'cache',
    LOGS: 'logs',
    CONFIG: 'config',
    ALL: 'all'
  };

  /**
   * Initialize backup service
   * @static
   * @param {Object} [options] - Configuration options
   * @returns {Promise<void>}
   */
  static async initialize(options = {}) {
    if (this.#initialized) {
      return;
    }

    try {
      this.#config = {
        paths: {
          temp: config.backup?.paths?.temp || './backups/temp',
          local: config.backup?.paths?.local || './backups/local',
          ...options.paths
        },
        database: {
          uri: config.database?.uri || process.env.DB_URI || 'mongodb+srv://EOlaw146:Olawalee_.146@cluster0.4wv68hn.mongodb.net?retryWrites=true&w=majority',
          name: config.database?.name || 'insightserenity',
          ...options.database
        },
        storage: {
          local: { enabled: true },
          s3: {
            enabled: config.backup?.storage?.s3?.enabled || false,
            bucket: config.backup?.storage?.s3?.bucket,
            region: config.backup?.storage?.s3?.region,
            ...options.storage?.s3
          },
          azure: {
            enabled: config.backup?.storage?.azure?.enabled || false,
            container: config.backup?.storage?.azure?.container,
            ...options.storage?.azure
          },
          gcp: {
            enabled: config.backup?.storage?.gcp?.enabled || false,
            bucket: config.backup?.storage?.gcp?.bucket,
            ...options.storage?.gcp
          }
        },
        encryption: {
          enabled: config.backup?.encryption?.enabled ?? true,
          algorithm: 'aes-256-gcm',
          ...options.encryption
        },
        compression: {
          enabled: true,
          level: 9, // Maximum compression
          ...options.compression
        },
        retention: {
          daily: 7,
          weekly: 4,
          monthly: 12,
          yearly: 5,
          ...config.backup?.retention,
          ...options.retention
        },
        schedule: {
          enabled: config.backup?.schedule?.enabled || false,
          daily: config.backup?.schedule?.daily || '02:00',
          weekly: config.backup?.schedule?.weekly || { day: 0, time: '03:00' },
          monthly: config.backup?.schedule?.monthly || { date: 1, time: '04:00' },
          ...options.schedule
        },
        validation: {
          checksum: true,
          verify: true,
          ...options.validation
        },
        ...options
      };

      // Initialize services
      this.#cacheService = new CacheService({ namespace: 'backups' });
      if (this.#config.encryption.enabled) {
        this.#encryptionService = new EncryptionService();
      }

      // Initialize file service
      await FileService.initialize();

      // Ensure directories exist
      await fs.ensureDir(this.#config.paths.temp);
      await fs.ensureDir(this.#config.paths.local);

      // Schedule automated backups
      if (this.#config.schedule.enabled) {
        this.#scheduleAutomatedBackups();
      }

      this.#initialized = true;
      logger.info('BackupService initialized', {
        encryption: this.#config.encryption.enabled,
        scheduling: this.#config.schedule.enabled
      });

    } catch (error) {
      logger.error('Failed to initialize BackupService', { error: error.message });
      throw new AppError(
        'Backup service initialization failed',
        500,
        ERROR_CODES.SERVICE_INITIALIZATION_ERROR
      );
    }
  }

  /**
   * Create backup
   * @static
   * @param {Object} options - Backup options
   * @param {string} [options.type] - Backup type
   * @param {Array<string>} [options.targets] - Backup targets
   * @param {string} [options.description] - Backup description
   * @param {Object} [options.metadata] - Additional metadata
   * @param {string} [options.userId] - User ID for audit
   * @param {string} [options.organizationId] - Organization ID
   * @returns {Promise<Object>} Backup result
   */
  static async create(options = {}) {
    await this.initialize();

    const backupId = this.#generateBackupId();
    const startTime = Date.now();

    try {
      // Check if backup is already in progress
      if (this.#activeBackups.size > 0) {
        throw new AppError(
          'Backup already in progress',
          409,
          ERROR_CODES.BACKUP_IN_PROGRESS
        );
      }

      // Validate options
      const validated = this.#validateBackupOptions(options);
      
      // Add to active backups
      this.#activeBackups.set(backupId, {
        startTime,
        type: validated.type,
        targets: validated.targets,
        status: 'in_progress'
      });

      // Create backup directory
      const backupDir = path.join(this.#config.paths.temp, backupId);
      await fs.ensureDir(backupDir);

      // Perform backup based on targets
      const backupResults = {};
      
      for (const target of validated.targets) {
        try {
          logger.info(`Backing up ${target}`, { backupId });
          
          switch (target) {
            case this.#BACKUP_TARGETS.DATABASE:
              backupResults.database = await this.#backupDatabase(backupDir);
              break;
              
            case this.#BACKUP_TARGETS.FILES:
              backupResults.files = await this.#backupFiles(backupDir);
              break;
              
            case this.#BACKUP_TARGETS.CACHE:
              backupResults.cache = await this.#backupCache(backupDir);
              break;
              
            case this.#BACKUP_TARGETS.LOGS:
              backupResults.logs = await this.#backupLogs(backupDir);
              break;
              
            case this.#BACKUP_TARGETS.CONFIG:
              backupResults.config = await this.#backupConfig(backupDir);
              break;
          }
        } catch (error) {
          logger.error(`Failed to backup ${target}`, {
            backupId,
            target,
            error: error.message
          });
          backupResults[target] = { success: false, error: error.message };
        }
      }

      // Create backup manifest
      const manifest = {
        id: backupId,
        type: validated.type,
        targets: validated.targets,
        results: backupResults,
        description: validated.description,
        metadata: validated.metadata,
        createdAt: new Date(),
        createdBy: validated.userId,
        organizationId: validated.organizationId,
        duration: Date.now() - startTime,
        version: '1.0',
        checksum: null
      };

      await fs.writeJson(path.join(backupDir, 'manifest.json'), manifest, { spaces: 2 });

      // Compress backup
      const archivePath = await this.#compressBackup(backupDir, backupId);
      
      // Calculate checksum
      manifest.checksum = await this.#calculateChecksum(archivePath);
      
      // Encrypt if enabled
      let finalPath = archivePath;
      if (this.#config.encryption.enabled) {
        finalPath = await this.#encryptBackup(archivePath, backupId);
        await fs.remove(archivePath); // Remove unencrypted archive
      }

      // Store backup
      const storageResult = await this.#storeBackup(finalPath, backupId, manifest);
      
      // Clean up temp files
      await fs.remove(backupDir);
      await fs.remove(finalPath);

      // Update active backups
      this.#activeBackups.delete(backupId);

      // Store backup metadata
      await this.#storeBackupMetadata(backupId, {
        ...manifest,
        storage: storageResult,
        size: (await fs.stat(finalPath)).size
      });

      // Audit log
      await this.#auditLog({
        action: 'backup.created',
        backupId,
        userId: validated.userId,
        organizationId: validated.organizationId,
        metadata: {
          type: validated.type,
          targets: validated.targets,
          duration: manifest.duration,
          size: manifest.size
        }
      });

      logger.info('Backup completed', {
        backupId,
        duration: manifest.duration,
        targets: validated.targets
      });

      return {
        backupId,
        type: validated.type,
        targets: validated.targets,
        storage: storageResult,
        checksum: manifest.checksum,
        size: manifest.size,
        duration: manifest.duration,
        timestamp: manifest.createdAt
      };

    } catch (error) {
      // Clean up on error
      this.#activeBackups.delete(backupId);
      const backupDir = path.join(this.#config.paths.temp, backupId);
      await fs.remove(backupDir).catch(() => {});

      logger.error('Backup failed', {
        backupId,
        error: error.message,
        duration: Date.now() - startTime
      });

      throw error instanceof AppError ? error : new AppError(
        'Backup creation failed',
        500,
        ERROR_CODES.BACKUP_FAILED,
        { backupId, originalError: error.message }
      );
    }
  }

  /**
   * Restore from backup
   * @static
   * @param {Object} options - Restore options
   * @param {string} options.backupId - Backup ID
   * @param {Array<string>} [options.targets] - Specific targets to restore
   * @param {boolean} [options.validate=true] - Validate backup before restore
   * @param {string} [options.userId] - User ID for audit
   * @param {string} [options.organizationId] - Organization ID
   * @returns {Promise<Object>} Restore result
   */
  static async restore(options) {
    await this.initialize();

    const restoreId = this.#generateRestoreId();
    const startTime = Date.now();

    try {
      // Get backup metadata
      const backup = await this.#getBackupMetadata(options.backupId);
      if (!backup) {
        throw new AppError(
          'Backup not found',
          404,
          ERROR_CODES.BACKUP_NOT_FOUND
        );
      }

      // Download backup
      const backupPath = await this.#downloadBackup(options.backupId, backup);
      
      // Validate backup if required
      if (options.validate !== false) {
        const isValid = await this.#validateBackup(backupPath, backup);
        if (!isValid) {
          throw new AppError(
            'Backup validation failed',
            400,
            ERROR_CODES.BACKUP_VALIDATION_FAILED
          );
        }
      }

      // Decrypt if encrypted
      let extractPath = backupPath;
      if (backup.encrypted) {
        extractPath = await this.#decryptBackup(backupPath, options.backupId);
      }

      // Extract backup
      const restoreDir = path.join(this.#config.paths.temp, `restore_${restoreId}`);
      await this.#extractBackup(extractPath, restoreDir);

      // Read manifest
      const manifest = await fs.readJson(path.join(restoreDir, 'manifest.json'));
      
      // Determine targets to restore
      const targets = options.targets || manifest.targets;
      
      // Perform restore
      const restoreResults = {};
      
      for (const target of targets) {
        try {
          logger.info(`Restoring ${target}`, { restoreId, backupId: options.backupId });
          
          switch (target) {
            case this.#BACKUP_TARGETS.DATABASE:
              restoreResults.database = await this.#restoreDatabase(restoreDir);
              break;
              
            case this.#BACKUP_TARGETS.FILES:
              restoreResults.files = await this.#restoreFiles(restoreDir);
              break;
              
            case this.#BACKUP_TARGETS.CACHE:
              restoreResults.cache = await this.#restoreCache(restoreDir);
              break;
              
            case this.#BACKUP_TARGETS.LOGS:
              restoreResults.logs = await this.#restoreLogs(restoreDir);
              break;
              
            case this.#BACKUP_TARGETS.CONFIG:
              restoreResults.config = await this.#restoreConfig(restoreDir);
              break;
          }
          
          restoreResults[target] = { success: true };
          
        } catch (error) {
          logger.error(`Failed to restore ${target}`, {
            restoreId,
            target,
            error: error.message
          });
          restoreResults[target] = { success: false, error: error.message };
        }
      }

      // Clean up temp files
      await fs.remove(backupPath);
      await fs.remove(extractPath);
      await fs.remove(restoreDir);

      // Audit log
      await this.#auditLog({
        action: 'backup.restored',
        backupId: options.backupId,
        restoreId,
        userId: options.userId,
        organizationId: options.organizationId,
        metadata: {
          targets,
          results: restoreResults,
          duration: Date.now() - startTime
        }
      });

      logger.info('Restore completed', {
        restoreId,
        backupId: options.backupId,
        duration: Date.now() - startTime
      });

      return {
        restoreId,
        backupId: options.backupId,
        targets,
        results: restoreResults,
        duration: Date.now() - startTime,
        timestamp: new Date()
      };

    } catch (error) {
      logger.error('Restore failed', {
        restoreId,
        backupId: options.backupId,
        error: error.message
      });

      throw error instanceof AppError ? error : new AppError(
        'Backup restore failed',
        500,
        ERROR_CODES.RESTORE_FAILED,
        { restoreId, backupId: options.backupId, originalError: error.message }
      );
    }
  }

  /**
   * List backups
   * @static
   * @param {Object} options - List options
   * @returns {Promise<Object>} Backup list
   */
  static async list(options = {}) {
    await this.initialize();

    const {
      type,
      startDate,
      endDate,
      page = 1,
      pageSize = 20,
      sort = { field: 'createdAt', order: 'desc' }
    } = options;

    try {
      // Get all backup metadata
      const allBackups = await this.#getAllBackupMetadata();
      
      // Apply filters
      let filtered = allBackups;
      
      if (type) {
        filtered = filtered.filter(backup => backup.type === type);
      }
      
      if (startDate || endDate) {
        filtered = filtered.filter(backup => {
          const created = new Date(backup.createdAt);
          if (startDate && created < startDate) return false;
          if (endDate && created > endDate) return false;
          return true;
        });
      }

      // Sort
      filtered.sort((a, b) => {
        const aVal = a[sort.field];
        const bVal = b[sort.field];
        const multiplier = sort.order === 'desc' ? -1 : 1;
        
        if (aVal < bVal) return -1 * multiplier;
        if (aVal > bVal) return 1 * multiplier;
        return 0;
      });

      // Paginate
      const start = (page - 1) * pageSize;
      const paginated = filtered.slice(start, start + pageSize);

      return {
        backups: paginated,
        pagination: {
          total: filtered.length,
          page,
          pageSize,
          totalPages: Math.ceil(filtered.length / pageSize)
        }
      };

    } catch (error) {
      logger.error('Failed to list backups', { error: error.message });
      throw new AppError(
        'Failed to list backups',
        500,
        ERROR_CODES.BACKUP_LIST_FAILED
      );
    }
  }

  /**
   * Delete backup
   * @static
   * @param {string} backupId - Backup ID
   * @param {Object} [options] - Delete options
   * @returns {Promise<boolean>} Success status
   */
  static async delete(backupId, options = {}) {
    await this.initialize();

    try {
      // Get backup metadata
      const backup = await this.#getBackupMetadata(backupId);
      if (!backup) {
        return false;
      }

      // Delete from storage
      for (const storage of backup.storage) {
        await this.#deleteFromStorage(backupId, storage);
      }

      // Delete metadata
      await this.#deleteBackupMetadata(backupId);

      // Audit log
      await this.#auditLog({
        action: 'backup.deleted',
        backupId,
        userId: options.userId,
        organizationId: options.organizationId
      });

      logger.info('Backup deleted', { backupId });
      return true;

    } catch (error) {
      logger.error('Failed to delete backup', { backupId, error: error.message });
      throw new AppError(
        'Failed to delete backup',
        500,
        ERROR_CODES.BACKUP_DELETE_FAILED
      );
    }
  }

  /**
   * Schedule backup
   * @static
   * @param {Object} options - Schedule options
   * @returns {Object} Schedule result
   */
  static schedule(options) {
    const {
      frequency, // 'daily', 'weekly', 'monthly'
      time,
      dayOfWeek,
      dayOfMonth,
      targets = [this.#BACKUP_TARGETS.ALL],
      type = this.#BACKUP_TYPES.FULL
    } = options;

    const scheduleId = this.#generateScheduleId();
    
    // Calculate next run time
    const nextRun = this.#calculateNextRun(frequency, time, dayOfWeek, dayOfMonth);
    
    // Schedule backup
    const timeout = setTimeout(async () => {
      try {
        await this.create({
          type,
          targets,
          description: `Scheduled ${frequency} backup`,
          metadata: { scheduleId, frequency }
        });

        // Reschedule for next occurrence
        this.schedule(options);
        
      } catch (error) {
        logger.error('Scheduled backup failed', { scheduleId, error: error.message });
      }
      
      this.#scheduledBackups.delete(scheduleId);
    }, nextRun - Date.now());

    this.#scheduledBackups.set(scheduleId, {
      timeout,
      options,
      nextRun: new Date(nextRun)
    });

    logger.info('Backup scheduled', { scheduleId, nextRun: new Date(nextRun) });

    return {
      scheduleId,
      frequency,
      nextRun: new Date(nextRun),
      targets,
      type
    };
  }

  /**
   * Cancel scheduled backup
   * @static
   * @param {string} scheduleId - Schedule ID
   * @returns {boolean} Success status
   */
  static cancelSchedule(scheduleId) {
    const scheduled = this.#scheduledBackups.get(scheduleId);
    if (!scheduled) {
      return false;
    }

    clearTimeout(scheduled.timeout);
    this.#scheduledBackups.delete(scheduleId);
    
    logger.info('Scheduled backup cancelled', { scheduleId });
    return true;
  }

  /**
   * Get backup statistics
   * @static
   * @returns {Object} Backup statistics
   */
  static async getStats() {
    await this.initialize();

    try {
      const backups = await this.#getAllBackupMetadata();
      
      const stats = {
        total: backups.length,
        totalSize: 0,
        byType: {},
        byTarget: {},
        averageDuration: 0,
        averageSize: 0,
        lastBackup: null,
        nextScheduled: null
      };

      let totalDuration = 0;

      backups.forEach(backup => {
        // By type
        stats.byType[backup.type] = (stats.byType[backup.type] || 0) + 1;
        
        // By target
        backup.targets.forEach(target => {
          stats.byTarget[target] = (stats.byTarget[target] || 0) + 1;
        });

        // Sizes and durations
        stats.totalSize += backup.size || 0;
        totalDuration += backup.duration || 0;

        // Last backup
        if (!stats.lastBackup || new Date(backup.createdAt) > new Date(stats.lastBackup.createdAt)) {
          stats.lastBackup = backup;
        }
      });

      // Averages
      if (backups.length > 0) {
        stats.averageDuration = totalDuration / backups.length;
        stats.averageSize = stats.totalSize / backups.length;
      }

      // Next scheduled
      const scheduled = Array.from(this.#scheduledBackups.values());
      if (scheduled.length > 0) {
        scheduled.sort((a, b) => a.nextRun - b.nextRun);
        stats.nextScheduled = {
          scheduleId: scheduled[0].scheduleId,
          nextRun: scheduled[0].nextRun
        };
      }

      return stats;

    } catch (error) {
      logger.error('Failed to get backup stats', { error: error.message });
      return {};
    }
  }

  /**
   * @private
   * Validate backup options
   */
  static #validateBackupOptions(options) {
    const validated = {
      type: options.type || this.#BACKUP_TYPES.FULL,
      targets: options.targets || [this.#BACKUP_TARGETS.ALL],
      description: options.description,
      metadata: options.metadata || {},
      userId: options.userId,
      organizationId: options.organizationId
    };

    // Expand 'all' target
    if (validated.targets.includes(this.#BACKUP_TARGETS.ALL)) {
      validated.targets = [
        this.#BACKUP_TARGETS.DATABASE,
        this.#BACKUP_TARGETS.FILES,
        this.#BACKUP_TARGETS.CACHE,
        this.#BACKUP_TARGETS.LOGS,
        this.#BACKUP_TARGETS.CONFIG
      ];
    }

    // Validate backup type
    if (!Object.values(this.#BACKUP_TYPES).includes(validated.type)) {
      throw new AppError(
        'Invalid backup type',
        400,
        ERROR_CODES.VALIDATION_ERROR
      );
    }

    return validated;
  }

  /**
   * @private
   * Backup database
   */
  static async #backupDatabase(backupDir) {
    const dbBackupPath = path.join(backupDir, 'database');
    await fs.ensureDir(dbBackupPath);

    // Use mongodump for MongoDB backup
    const dumpCommand = `mongodump --uri="${this.#config.database.uri}" --out="${dbBackupPath}" --gzip`;
    
    try {
      await execAsync(dumpCommand);
      logger.info('Database backup completed');
      return { success: true, path: dbBackupPath };
    } catch (error) {
      // Fallback to manual export
      logger.warn('mongodump failed, using manual export', { error: error.message });
      
      const client = new MongoClient(this.#config.database.uri);
      await client.connect();
      
      const db = client.db(this.#config.database.name);
      const collections = await db.listCollections().toArray();
      
      for (const collection of collections) {
        const data = await db.collection(collection.name).find({}).toArray();
        await fs.writeJson(
          path.join(dbBackupPath, `${collection.name}.json`),
          data,
          { spaces: 2 }
        );
      }
      
      await client.close();
      return { success: true, path: dbBackupPath, method: 'manual' };
    }
  }

  /**
   * @private
   * Backup files
   */
  static async #backupFiles(backupDir) {
    const filesBackupPath = path.join(backupDir, 'files');
    await fs.ensureDir(filesBackupPath);

    // Get all files from FileService
    const files = await FileService.list({ pageSize: 10000 });
    
    for (const file of files.files) {
      try {
        const fileData = await FileService.download({ fileId: file.fileId });
        const filePath = path.join(filesBackupPath, file.fileId);
        
        await fs.writeFile(filePath, fileData.data);
        await fs.writeJson(`${filePath}.meta`, file, { spaces: 2 });
        
      } catch (error) {
        logger.warn('Failed to backup file', { fileId: file.fileId, error: error.message });
      }
    }

    return { success: true, path: filesBackupPath, count: files.files.length };
  }

  /**
   * @private
   * Backup cache
   */
  static async #backupCache(backupDir) {
    const cacheBackupPath = path.join(backupDir, 'cache');
    await fs.ensureDir(cacheBackupPath);

    // Export cache data
    const cacheData = {};
    
    // This would need to be implemented based on your cache structure
    // For now, we'll save cache statistics
    cacheData.stats = await this.#cacheService.getStats();
    cacheData.timestamp = new Date();

    await fs.writeJson(
      path.join(cacheBackupPath, 'cache_export.json'),
      cacheData,
      { spaces: 2 }
    );

    return { success: true, path: cacheBackupPath };
  }

  /**
   * @private
   * Backup logs
   */
  static async #backupLogs(backupDir) {
    const logsBackupPath = path.join(backupDir, 'logs');
    await fs.ensureDir(logsBackupPath);

    // Copy log files
    const logDir = './logs'; // Adjust based on your log directory
    if (await fs.pathExists(logDir)) {
      await fs.copy(logDir, logsBackupPath);
    }

    return { success: true, path: logsBackupPath };
  }

  /**
   * @private
   * Backup configuration
   */
  static async #backupConfig(backupDir) {
    const configBackupPath = path.join(backupDir, 'config');
    await fs.ensureDir(configBackupPath);

    // Backup configuration files (excluding sensitive data)
    const configFiles = [
      'package.json',
      'package-lock.json',
      '.env.example',
      'docker-compose.yml'
    ];

    for (const file of configFiles) {
      if (await fs.pathExists(file)) {
        await fs.copy(file, path.join(configBackupPath, path.basename(file)));
      }
    }

    // Save sanitized config
    const sanitizedConfig = this.#sanitizeConfig(config);
    await fs.writeJson(
      path.join(configBackupPath, 'config.json'),
      sanitizedConfig,
      { spaces: 2 }
    );

    return { success: true, path: configBackupPath };
  }

  /**
   * @private
   * Compress backup
   */
  static async #compressBackup(sourceDir, backupId) {
    const archivePath = path.join(this.#config.paths.temp, `${backupId}.tar.gz`);
    
    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(archivePath);
      const archive = archiver('tar', {
        gzip: true,
        gzipOptions: {
          level: this.#config.compression.level
        }
      });

      output.on('close', () => {
        logger.info('Backup compressed', { 
          backupId, 
          size: archive.pointer() 
        });
        resolve(archivePath);
      });

      archive.on('error', reject);
      
      archive.pipe(output);
      archive.directory(sourceDir, false);
      archive.finalize();
    });
  }

  /**
   * @private
   * Encrypt backup
   */
  static async #encryptBackup(sourcePath, backupId) {
    const encryptedPath = `${sourcePath}.enc`;
    const sourceData = await fs.readFile(sourcePath);
    
    const encrypted = await this.#encryptionService.encryptBuffer(sourceData);
    
    // Save encrypted data with metadata
    const encryptedPackage = {
      version: '1.0',
      algorithm: this.#config.encryption.algorithm,
      data: encrypted.encryptedData.toString('base64'),
      iv: encrypted.iv,
      authTag: encrypted.authTag
    };

    await fs.writeJson(encryptedPath, encryptedPackage);
    
    logger.info('Backup encrypted', { backupId });
    return encryptedPath;
  }

  /**
   * @private
   * Store backup
   */
  static async #storeBackup(sourcePath, backupId, manifest) {
    const storage = [];
    const filename = path.basename(sourcePath);

    // Local storage
    if (this.#config.storage.local.enabled) {
      const localPath = path.join(this.#config.paths.local, filename);
      await fs.copy(sourcePath, localPath);
      storage.push({ type: 'local', path: localPath });
    }

    // Cloud storage
    const fileData = await fs.readFile(sourcePath);
    
    // S3
    if (this.#config.storage.s3.enabled) {
      const s3Result = await FileService.upload({
        file: fileData,
        filename: filename,
        path: `backups/${new Date().getFullYear()}/${new Date().getMonth() + 1}`,
        metadata: { backupId, ...manifest }
      });
      storage.push({ type: 's3', url: s3Result.url });
    }

    // Apply retention policy
    await this.#applyRetentionPolicy();

    return storage;
  }

  /**
   * @private
   * Restore database
   */
  static async #restoreDatabase(restoreDir) {
    const dbBackupPath = path.join(restoreDir, 'database');
    
    // Use mongorestore
    const restoreCommand = `mongorestore --uri="${this.#config.database.uri}" --dir="${dbBackupPath}" --gzip --drop`;
    
    try {
      await execAsync(restoreCommand);
      logger.info('Database restore completed');
      return { success: true };
    } catch (error) {
      // Fallback to manual import
      logger.warn('mongorestore failed, using manual import', { error: error.message });
      
      const client = new MongoClient(this.#config.database.uri);
      await client.connect();
      
      const db = client.db(this.#config.database.name);
      const files = await fs.readdir(dbBackupPath);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const collectionName = path.basename(file, '.json');
          const data = await fs.readJson(path.join(dbBackupPath, file));
          
          // Drop existing collection
          await db.collection(collectionName).drop().catch(() => {});
          
          // Insert data
          if (data.length > 0) {
            await db.collection(collectionName).insertMany(data);
          }
        }
      }
      
      await client.close();
      return { success: true, method: 'manual' };
    }
  }

  /**
   * @private
   * Restore files
   */
  static async #restoreFiles(restoreDir) {
    const filesBackupPath = path.join(restoreDir, 'files');
    const files = await fs.readdir(filesBackupPath);
    
    let restored = 0;
    
    for (const file of files) {
      if (file.endsWith('.meta')) continue;
      
      try {
        const fileData = await fs.readFile(path.join(filesBackupPath, file));
        const metadata = await fs.readJson(path.join(filesBackupPath, `${file}.meta`));
        
        await FileService.upload({
          file: fileData,
          filename: metadata.filename,
          path: metadata.path,
          metadata: metadata.metadata
        });
        
        restored++;
      } catch (error) {
        logger.warn('Failed to restore file', { file, error: error.message });
      }
    }

    return { success: true, restored };
  }

  /**
   * @private
   * Restore cache
   */
  static async #restoreCache(restoreDir) {
    // Cache restore would be implementation-specific
    logger.info('Cache restore not implemented');
    return { success: true, skipped: true };
  }

  /**
   * @private
   * Restore logs
   */
  static async #restoreLogs(restoreDir) {
    const logsBackupPath = path.join(restoreDir, 'logs');
    const logDir = './logs_restored';
    
    if (await fs.pathExists(logsBackupPath)) {
      await fs.copy(logsBackupPath, logDir);
      return { success: true, path: logDir };
    }

    return { success: true, skipped: true };
  }

  /**
   * @private
   * Restore configuration
   */
  static async #restoreConfig(restoreDir) {
    const configBackupPath = path.join(restoreDir, 'config');
    const configRestorePath = './config_restored';
    
    if (await fs.pathExists(configBackupPath)) {
      await fs.copy(configBackupPath, configRestorePath);
      return { success: true, path: configRestorePath };
    }

    return { success: true, skipped: true };
  }

  /**
   * @private
   * Calculate checksum
   */
  static async #calculateChecksum(filePath) {
    const fileBuffer = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(fileBuffer).digest('hex');
  }

  /**
   * @private
   * Validate backup
   */
  static async #validateBackup(backupPath, metadata) {
    // Verify checksum
    if (metadata.checksum) {
      const actualChecksum = await this.#calculateChecksum(backupPath);
      if (actualChecksum !== metadata.checksum) {
        logger.error('Backup checksum mismatch', {
          expected: metadata.checksum,
          actual: actualChecksum
        });
        return false;
      }
    }

    // Verify file exists and is readable
    try {
      await fs.access(backupPath, fs.constants.R_OK);
      return true;
    } catch (error) {
      logger.error('Backup file not accessible', { error: error.message });
      return false;
    }
  }

  /**
   * @private
   * Download backup
   */
  static async #downloadBackup(backupId, metadata) {
    const tempPath = path.join(this.#config.paths.temp, `download_${backupId}`);
    
    // Try each storage location
    for (const storage of metadata.storage) {
      try {
        if (storage.type === 'local') {
          await fs.copy(storage.path, tempPath);
          return tempPath;
        } else if (storage.url) {
          // Download from cloud storage
          const fileData = await FileService.download({ fileId: backupId });
          await fs.writeFile(tempPath, fileData.data);
          return tempPath;
        }
      } catch (error) {
        logger.warn('Failed to download from storage', {
          backupId,
          storage: storage.type,
          error: error.message
        });
      }
    }

    throw new AppError(
      'Unable to download backup from any storage',
      404,
      ERROR_CODES.BACKUP_DOWNLOAD_FAILED
    );
  }

  /**
   * @private
   * Decrypt backup
   */
  static async #decryptBackup(encryptedPath, backupId) {
    const decryptedPath = encryptedPath.replace('.enc', '');
    
    const encryptedPackage = await fs.readJson(encryptedPath);
    const encryptedData = Buffer.from(encryptedPackage.data, 'base64');
    
    const decrypted = await this.#encryptionService.decryptBuffer(
      encryptedData,
      encryptedPackage.iv,
      encryptedPackage.authTag
    );

    await fs.writeFile(decryptedPath, decrypted);
    
    logger.info('Backup decrypted', { backupId });
    return decryptedPath;
  }

  /**
   * @private
   * Extract backup
   */
  static async #extractBackup(archivePath, targetDir) {
    await fs.ensureDir(targetDir);
    
    return new Promise((resolve, reject) => {
      const extract = require('tar').extract({ 
        cwd: targetDir,
        filter: (path) => {
          // Security: prevent directory traversal
          return !path.includes('..');
        }
      });
      
      fs.createReadStream(archivePath)
        .pipe(extract)
        .on('finish', resolve)
        .on('error', reject);
    });
  }

  /**
   * @private
   * Store backup metadata
   */
  static async #storeBackupMetadata(backupId, metadata) {
    await this.#cacheService.set(`backup:${backupId}`, metadata, 0); // No expiry
  }

  /**
   * @private
   * Get backup metadata
   */
  static async #getBackupMetadata(backupId) {
    return await this.#cacheService.get(`backup:${backupId}`);
  }

  /**
   * @private
   * Get all backup metadata
   */
  static async #getAllBackupMetadata() {
    const keys = await this.#cacheService.keys('backup:*');
    const backups = [];
    
    for (const key of keys) {
      const metadata = await this.#cacheService.get(key);
      if (metadata) {
        backups.push(metadata);
      }
    }
    
    return backups;
  }

  /**
   * @private
   * Delete backup metadata
   */
  static async #deleteBackupMetadata(backupId) {
    await this.#cacheService.delete(`backup:${backupId}`);
  }

  /**
   * @private
   * Delete from storage
   */
  static async #deleteFromStorage(backupId, storage) {
    if (storage.type === 'local' && storage.path) {
      await fs.remove(storage.path);
    } else if (storage.url) {
      await FileService.delete({ fileId: backupId });
    }
  }

  /**
   * @private
   * Apply retention policy
   */
  static async #applyRetentionPolicy() {
    const backups = await this.#getAllBackupMetadata();
    const now = Date.now();
    const policies = this.#config.retention;

    // Group backups by age
    const toDelete = [];

    backups.forEach(backup => {
      const age = now - new Date(backup.createdAt).getTime();
      const days = age / (24 * 60 * 60 * 1000);

      // Apply retention rules
      if (days > policies.yearly * 365) {
        toDelete.push(backup);
      } else if (days > policies.monthly * 30 && days <= policies.yearly * 365) {
        // Keep only monthly backups
        const dayOfMonth = new Date(backup.createdAt).getDate();
        if (dayOfMonth !== 1) {
          toDelete.push(backup);
        }
      } else if (days > policies.weekly * 7 && days <= policies.monthly * 30) {
        // Keep only weekly backups
        const dayOfWeek = new Date(backup.createdAt).getDay();
        if (dayOfWeek !== 0) {
          toDelete.push(backup);
        }
      } else if (days > policies.daily && days <= policies.weekly * 7) {
        // Keep daily backups
      }
    });

    // Delete old backups
    for (const backup of toDelete) {
      try {
        await this.delete(backup.id);
      } catch (error) {
        logger.error('Failed to delete old backup', {
          backupId: backup.id,
          error: error.message
        });
      }
    }

    if (toDelete.length > 0) {
      logger.info('Retention policy applied', { deleted: toDelete.length });
    }
  }

  /**
   * @private
   * Schedule automated backups
   */
  static #scheduleAutomatedBackups() {
    const { daily, weekly, monthly } = this.#config.schedule;

    if (daily) {
      this.schedule({
        frequency: 'daily',
        time: daily,
        targets: [this.#BACKUP_TARGETS.DATABASE, this.#BACKUP_TARGETS.FILES]
      });
    }

    if (weekly) {
      this.schedule({
        frequency: 'weekly',
        time: weekly.time,
        dayOfWeek: weekly.day,
        targets: [this.#BACKUP_TARGETS.ALL]
      });
    }

    if (monthly) {
      this.schedule({
        frequency: 'monthly',
        time: monthly.time,
        dayOfMonth: monthly.date,
        targets: [this.#BACKUP_TARGETS.ALL],
        type: this.#BACKUP_TYPES.FULL
      });
    }
  }

  /**
   * @private
   * Calculate next run time
   */
  static #calculateNextRun(frequency, time, dayOfWeek, dayOfMonth) {
    const now = new Date();
    const [hours, minutes] = time.split(':').map(Number);
    
    let next = new Date();
    next.setHours(hours, minutes, 0, 0);

    switch (frequency) {
      case 'daily':
        if (next <= now) {
          next.setDate(next.getDate() + 1);
        }
        break;

      case 'weekly':
        next.setDate(next.getDate() + ((dayOfWeek + 7 - next.getDay()) % 7));
        if (next <= now) {
          next.setDate(next.getDate() + 7);
        }
        break;

      case 'monthly':
        next.setDate(dayOfMonth);
        if (next <= now) {
          next.setMonth(next.getMonth() + 1);
        }
        break;
    }

    return next.getTime();
  }

  /**
   * @private
   * Sanitize configuration
   */
  static #sanitizeConfig(config) {
    const sanitized = JSON.parse(JSON.stringify(config));
    
    // Remove sensitive fields
    const sensitiveFields = [
      'password', 'secret', 'key', 'token', 
      'apiKey', 'privateKey', 'credentials'
    ];

    const sanitizeObject = (obj) => {
      Object.keys(obj).forEach(key => {
        if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
          obj[key] = '[REDACTED]';
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          sanitizeObject(obj[key]);
        }
      });
    };

    sanitizeObject(sanitized);
    return sanitized;
  }

  /**
   * @private
   * Audit log
   */
  static async #auditLog(data) {
    try {
      await AuditLogModel.create({
        action: data.action,
        resource: 'backup',
        resourceId: data.backupId || data.restoreId,
        userId: data.userId,
        organizationId: data.organizationId,
        metadata: data.metadata,
        timestamp: new Date()
      });
    } catch (error) {
      logger.error('Failed to create audit log', { error: error.message });
    }
  }

  /**
   * @private
   * Generate backup ID
   */
  static #generateBackupId() {
    return `backup_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * @private
   * Generate restore ID
   */
  static #generateRestoreId() {
    return `restore_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * @private
   * Generate schedule ID
   */
  static #generateScheduleId() {
    return `schedule_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * Graceful shutdown
   * @returns {Promise<void>}
   */
  static async shutdown() {
    logger.info('Shutting down BackupService');

    // Cancel all scheduled backups
    this.#scheduledBackups.forEach((scheduled, scheduleId) => {
      clearTimeout(scheduled.timeout);
    });
    this.#scheduledBackups.clear();

    // Clear active backups
    this.#activeBackups.clear();

    await this.#cacheService.shutdown();

    this.#initialized = false;
    logger.info('BackupService shutdown complete');
  }
}

// Export backup types and targets
BackupService.TYPES = BackupService.#BACKUP_TYPES;
BackupService.TARGETS = BackupService.#BACKUP_TARGETS;

module.exports = BackupService;