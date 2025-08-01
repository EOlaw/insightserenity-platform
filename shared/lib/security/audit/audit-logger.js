'use strict';

/**
 * @fileoverview Audit logging mechanism supporting file and remote storage
 * @module shared/lib/security/audit/audit-logger
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/security/encryption/encryption-service
 * @requires fs/promises
 * @requires path
 * @requires os
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const logger = require('../../utils/logger');
const AppError = require('../../utils/app-error');
const EncryptionService = require('../encryption/encryption-service');

/**
 * @class AuditLogger
 * @description Handles audit log persistence to various storage backends with encryption support
 */
class AuditLogger {
  /**
   * @private
   * @static
   * @readonly
   */
  static #STORAGE_TYPES = {
    FILE: 'file',
    DATABASE: 'database',
    REMOTE: 'remote',
    HYBRID: 'hybrid'
  };

  static #FILE_ROTATION = {
    DAILY: 'daily',
    SIZE: 'size',
    COUNT: 'count'
  };

  static #MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
  static #MAX_LOG_FILES = 30;
  static #BUFFER_SIZE = 1000;
  static #FLUSH_INTERVAL = 5000; // 5 seconds

  /**
   * Creates an instance of AuditLogger
   * @constructor
   * @param {Object} [options={}] - Configuration options
   * @param {string} [options.storageType='database'] - Storage backend type
   * @param {Object} [options.database] - Database connection
   * @param {Object} [options.fileOptions] - File storage options
   * @param {Object} [options.remoteOptions] - Remote storage options
   * @param {boolean} [options.enableEncryption=true] - Enable log encryption
   * @param {boolean} [options.enableCompression=true] - Enable log compression
   * @param {number} [options.batchSize=100] - Batch size for writes
   * @param {boolean} [options.enableBuffering=true] - Enable write buffering
   */
  constructor(options = {}) {
    const {
      storageType = AuditLogger.#STORAGE_TYPES.DATABASE,
      database,
      fileOptions = {},
      remoteOptions = {},
      enableEncryption = true,
      enableCompression = true,
      batchSize = 100,
      enableBuffering = true
    } = options;

    this.storageType = storageType;
    this.database = database;
    this.enableEncryption = enableEncryption;
    this.enableCompression = enableCompression;
    this.batchSize = batchSize;
    this.enableBuffering = enableBuffering;

    // Initialize file options
    this.fileOptions = {
      basePath: fileOptions.basePath || path.join(os.tmpdir(), 'audit-logs'),
      rotationType: fileOptions.rotationType || AuditLogger.#FILE_ROTATION.DAILY,
      maxFileSize: fileOptions.maxFileSize || AuditLogger.#MAX_FILE_SIZE,
      maxFiles: fileOptions.maxFiles || AuditLogger.#MAX_LOG_FILES,
      ...fileOptions
    };

    // Initialize remote options
    this.remoteOptions = {
      endpoint: remoteOptions.endpoint,
      apiKey: remoteOptions.apiKey,
      timeout: remoteOptions.timeout || 30000,
      retryAttempts: remoteOptions.retryAttempts || 3,
      ...remoteOptions
    };

    // Initialize encryption service
    if (this.enableEncryption) {
      this.encryptionService = new EncryptionService({
        algorithm: 'aes-256-gcm'
      });
    }

    // Initialize write buffer
    this.writeBuffer = [];
    this.isWriting = false;

    // Start buffer flush interval
    if (this.enableBuffering) {
      this.flushInterval = setInterval(() => {
        this.#flushBuffer();
      }, AuditLogger.#FLUSH_INTERVAL);
    }

    // Ensure log directory exists
    if (this.storageType === AuditLogger.#STORAGE_TYPES.FILE || 
        this.storageType === AuditLogger.#STORAGE_TYPES.HYBRID) {
      this.#ensureLogDirectory();
    }

    logger.info('AuditLogger initialized', {
      storageType,
      enableEncryption,
      enableCompression,
      enableBuffering
    });
  }

  /**
   * Logs a single audit entry
   * @param {Object} auditEntry - Audit entry to log
   * @returns {Promise<void>}
   */
  async log(auditEntry) {
    try {
      if (!auditEntry || !auditEntry.id) {
        throw new AppError('Invalid audit entry', 400, 'INVALID_ENTRY');
      }

      // Prepare entry for storage
      const preparedEntry = await this.#prepareEntry(auditEntry);

      // Route to appropriate storage
      switch (this.storageType) {
        case AuditLogger.#STORAGE_TYPES.FILE:
          await this.#logToFile(preparedEntry);
          break;
        
        case AuditLogger.#STORAGE_TYPES.DATABASE:
          await this.#logToDatabase(preparedEntry);
          break;
        
        case AuditLogger.#STORAGE_TYPES.REMOTE:
          await this.#logToRemote(preparedEntry);
          break;
        
        case AuditLogger.#STORAGE_TYPES.HYBRID:
          await Promise.all([
            this.#logToFile(preparedEntry),
            this.#logToDatabase(preparedEntry)
          ]);
          break;
        
        default:
          throw new AppError('Unknown storage type', 500, 'INVALID_STORAGE_TYPE');
      }

      logger.debug('Audit entry logged', { auditId: auditEntry.id });

    } catch (error) {
      logger.error('Failed to log audit entry', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to log audit entry',
        500,
        'LOG_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Logs multiple audit entries in batch
   * @param {Array<Object>} entries - Audit entries to log
   * @returns {Promise<Object>} Batch operation result
   */
  async logBatch(entries) {
    try {
      if (!Array.isArray(entries) || entries.length === 0) {
        throw new AppError('Invalid entries array', 400, 'INVALID_ENTRIES');
      }

      const results = {
        total: entries.length,
        succeeded: 0,
        failed: 0,
        errors: []
      };

      // Prepare all entries
      const preparedEntries = [];
      
      for (const entry of entries) {
        try {
          const prepared = await this.#prepareEntry(entry);
          preparedEntries.push(prepared);
        } catch (error) {
          results.failed++;
          results.errors.push({
            entry: entry.id,
            error: error.message
          });
        }
      }

      // Batch write to storage
      if (preparedEntries.length > 0) {
        switch (this.storageType) {
          case AuditLogger.#STORAGE_TYPES.FILE:
            await this.#batchLogToFile(preparedEntries);
            results.succeeded = preparedEntries.length;
            break;
          
          case AuditLogger.#STORAGE_TYPES.DATABASE:
            await this.#batchLogToDatabase(preparedEntries);
            results.succeeded = preparedEntries.length;
            break;
          
          case AuditLogger.#STORAGE_TYPES.REMOTE:
            await this.#batchLogToRemote(preparedEntries);
            results.succeeded = preparedEntries.length;
            break;
          
          case AuditLogger.#STORAGE_TYPES.HYBRID:
            await Promise.all([
              this.#batchLogToFile(preparedEntries),
              this.#batchLogToDatabase(preparedEntries)
            ]);
            results.succeeded = preparedEntries.length;
            break;
        }
      }

      logger.info('Batch audit log completed', results);

      return results;

    } catch (error) {
      logger.error('Batch log failed', error);

      throw new AppError(
        'Failed to log batch',
        500,
        'BATCH_LOG_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Archives old audit logs
   * @param {Object} criteria - Archive criteria
   * @returns {Promise<Object>} Archive result
   */
  async archive(criteria) {
    try {
      const { before, destination, compress = true } = criteria;

      if (!before) {
        throw new AppError('Archive cutoff date required', 400, 'MISSING_CUTOFF');
      }

      let archived = 0;

      switch (this.storageType) {
        case AuditLogger.#STORAGE_TYPES.FILE:
          archived = await this.#archiveFiles(before, destination, compress);
          break;
        
        case AuditLogger.#STORAGE_TYPES.DATABASE:
          archived = await this.#archiveDatabase(before, destination);
          break;
        
        case AuditLogger.#STORAGE_TYPES.HYBRID:
          const fileCount = await this.#archiveFiles(before, destination, compress);
          const dbCount = await this.#archiveDatabase(before, destination);
          archived = Math.max(fileCount, dbCount);
          break;
      }

      logger.info('Audit logs archived', { archived, before });

      return {
        archived,
        cutoffDate: before,
        destination
      };

    } catch (error) {
      logger.error('Archive operation failed', error);

      throw new AppError(
        'Failed to archive logs',
        500,
        'ARCHIVE_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Rotates log files
   * @returns {Promise<Object>} Rotation result
   */
  async rotate() {
    try {
      if (this.storageType !== AuditLogger.#STORAGE_TYPES.FILE && 
          this.storageType !== AuditLogger.#STORAGE_TYPES.HYBRID) {
        return { rotated: false, reason: 'Not using file storage' };
      }

      const currentFile = this.#getCurrentLogFile();
      const stats = await fs.stat(currentFile).catch(() => null);

      let shouldRotate = false;
      let reason = '';

      // Check rotation criteria
      if (this.fileOptions.rotationType === AuditLogger.#FILE_ROTATION.SIZE) {
        if (stats && stats.size >= this.fileOptions.maxFileSize) {
          shouldRotate = true;
          reason = 'File size exceeded';
        }
      } else if (this.fileOptions.rotationType === AuditLogger.#FILE_ROTATION.DAILY) {
        const fileDate = path.basename(currentFile).split('_')[1]?.split('.')[0];
        const today = new Date().toISOString().split('T')[0];
        
        if (fileDate !== today) {
          shouldRotate = true;
          reason = 'Daily rotation';
        }
      }

      if (shouldRotate) {
        // Flush buffer before rotation
        await this.#flushBuffer();

        // Perform rotation
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const rotatedFile = currentFile.replace('.log', `_${timestamp}.log`);
        
        await fs.rename(currentFile, rotatedFile);

        // Clean up old files
        await this.#cleanupOldFiles();

        logger.info('Log file rotated', { reason, newFile: rotatedFile });

        return { rotated: true, reason, file: rotatedFile };
      }

      return { rotated: false, reason: 'Rotation not needed' };

    } catch (error) {
      logger.error('Log rotation failed', error);

      throw new AppError(
        'Failed to rotate logs',
        500,
        'ROTATION_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Retrieves audit logs (for testing/verification)
   * @param {Object} criteria - Query criteria
   * @returns {Promise<Array>} Audit logs
   */
  async retrieve(criteria) {
    try {
      switch (this.storageType) {
        case AuditLogger.#STORAGE_TYPES.DATABASE:
          return await this.#retrieveFromDatabase(criteria);
        
        case AuditLogger.#STORAGE_TYPES.FILE:
          return await this.#retrieveFromFiles(criteria);
        
        default:
          throw new AppError('Retrieval not supported for storage type', 400, 'UNSUPPORTED_OPERATION');
      }

    } catch (error) {
      logger.error('Failed to retrieve logs', error);
      throw error;
    }
  }

  /**
   * Prepares entry for storage
   * @private
   * @param {Object} entry - Raw entry
   * @returns {Promise<Object>} Prepared entry
   */
  async #prepareEntry(entry) {
    let prepared = { ...entry };

    // Add storage metadata
    prepared._stored = {
      timestamp: new Date().toISOString(),
      version: '1.0'
    };

    // Encrypt if enabled
    if (this.enableEncryption) {
      const encrypted = await this.encryptionService.encrypt(
        JSON.stringify(prepared)
      );
      
      prepared = {
        id: entry.id,
        encrypted: true,
        data: encrypted.encryptedData,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        algorithm: encrypted.algorithm
      };
    }

    // Compress if enabled
    if (this.enableCompression && !this.enableEncryption) {
      const zlib = require('zlib');
      const compressed = await new Promise((resolve, reject) => {
        zlib.gzip(JSON.stringify(prepared), (err, result) => {
          if (err) reject(err);
          else resolve(result);
        });
      });

      prepared = {
        id: entry.id,
        compressed: true,
        data: compressed.toString('base64')
      };
    }

    return prepared;
  }

  /**
   * Logs entry to file
   * @private
   * @param {Object} entry - Prepared entry
   * @returns {Promise<void>}
   */
  async #logToFile(entry) {
    if (this.enableBuffering) {
      this.writeBuffer.push(entry);
      
      if (this.writeBuffer.length >= AuditLogger.#BUFFER_SIZE) {
        await this.#flushBuffer();
      }
    } else {
      const logFile = this.#getCurrentLogFile();
      const line = JSON.stringify(entry) + '\n';
      
      await fs.appendFile(logFile, line, 'utf8');
    }
  }

  /**
   * Batch logs entries to file
   * @private
   * @param {Array} entries - Prepared entries
   * @returns {Promise<void>}
   */
  async #batchLogToFile(entries) {
    const logFile = this.#getCurrentLogFile();
    const lines = entries.map(entry => JSON.stringify(entry)).join('\n') + '\n';
    
    await fs.appendFile(logFile, lines, 'utf8');

    // Check if rotation needed
    await this.rotate();
  }

  /**
   * Logs entry to database
   * @private
   * @param {Object} entry - Prepared entry
   * @returns {Promise<void>}
   */
  async #logToDatabase(entry) {
    if (!this.database) {
      throw new AppError('Database not configured', 500, 'NO_DATABASE');
    }

    const AuditLogModel = require('../../database/models/security/audit-log-model').model;
    await AuditLogModel.create(entry);
  }

  /**
   * Batch logs entries to database
   * @private
   * @param {Array} entries - Prepared entries
   * @returns {Promise<void>}
   */
  async #batchLogToDatabase(entries) {
    if (!this.database) {
      throw new AppError('Database not configured', 500, 'NO_DATABASE');
    }

    const AuditLogModel = require('../../database/models/security/audit-log-model').model;
    await AuditLogModel.insertMany(entries);
  }

  /**
   * Logs entry to remote service
   * @private
   * @param {Object} entry - Prepared entry
   * @returns {Promise<void>}
   */
  async #logToRemote(entry) {
    const { endpoint, apiKey, timeout } = this.remoteOptions;

    if (!endpoint) {
      throw new AppError('Remote endpoint not configured', 500, 'NO_ENDPOINT');
    }

    // Simulate remote logging - in production would use actual HTTP client
    const response = await this.#makeRemoteRequest(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ logs: [entry] }),
      timeout
    });

    if (!response.ok) {
      throw new AppError('Remote logging failed', 500, 'REMOTE_ERROR');
    }
  }

  /**
   * Batch logs entries to remote service
   * @private
   * @param {Array} entries - Prepared entries
   * @returns {Promise<void>}
   */
  async #batchLogToRemote(entries) {
    const { endpoint, apiKey, timeout } = this.remoteOptions;

    if (!endpoint) {
      throw new AppError('Remote endpoint not configured', 500, 'NO_ENDPOINT');
    }

    const response = await this.#makeRemoteRequest(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ logs: entries }),
      timeout
    });

    if (!response.ok) {
      throw new AppError('Remote batch logging failed', 500, 'REMOTE_ERROR');
    }
  }

  /**
   * Makes remote HTTP request with retry
   * @private
   * @param {string} url - Request URL
   * @param {Object} options - Request options
   * @returns {Promise<Object>} Response
   */
  async #makeRemoteRequest(url, options) {
    const { retryAttempts } = this.remoteOptions;
    let lastError;

    for (let attempt = 1; attempt <= retryAttempts; attempt++) {
      try {
        // In production, use actual HTTP client (axios, fetch, etc.)
        // This is a simulation
        return { ok: true, status: 200 };
      } catch (error) {
        lastError = error;
        
        if (attempt < retryAttempts) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }

  /**
   * Flushes write buffer
   * @private
   * @returns {Promise<void>}
   */
  async #flushBuffer() {
    if (this.isWriting || this.writeBuffer.length === 0) {
      return; // Exit silently for empty buffers
    }

    try {
      this.isWriting = true;

      const entries = this.writeBuffer.splice(0, this.batchSize);
      
      if (entries.length > 0) {
        await this.#batchLogToFile(entries);
        
        // Only log when there are actual entries processed
        logger.debug('Write buffer flushed', { count: entries.length });
      }

    } catch (error) {
      logger.error('Failed to flush write buffer', error);
      // Re-queue failed entries
      this.writeBuffer.unshift(...entries);
    } finally {
      this.isWriting = false;
    }
  }

  /**
   * Archives old log files
   * @private
   * @param {Date} before - Cutoff date
   * @param {string} destination - Archive destination
   * @param {boolean} compress - Whether to compress
   * @returns {Promise<number>} Number of files archived
   */
  async #archiveFiles(before, destination, compress) {
    const files = await fs.readdir(this.fileOptions.basePath);
    const logFiles = files.filter(f => f.endsWith('.log'));
    let archived = 0;

    for (const file of logFiles) {
      const filePath = path.join(this.fileOptions.basePath, file);
      const stats = await fs.stat(filePath);

      if (stats.mtime < before) {
        const archivePath = path.join(destination, file);

        if (compress) {
          const zlib = require('zlib');
          const gzip = zlib.createGzip();
          const source = require('fs').createReadStream(filePath);
          const dest = require('fs').createWriteStream(archivePath + '.gz');

          await new Promise((resolve, reject) => {
            source.pipe(gzip).pipe(dest)
              .on('finish', resolve)
              .on('error', reject);
          });

          await fs.unlink(filePath);
        } else {
          await fs.rename(filePath, archivePath);
        }

        archived++;
      }
    }

    return archived;
  }

  /**
   * Archives database entries
   * @private
   * @param {Date} before - Cutoff date
   * @param {string} destination - Archive destination
   * @returns {Promise<number>} Number of entries archived
   */
  async #archiveDatabase(before, destination) {
    if (!this.database) {
      return 0;
    }

    const AuditLogModel = require('../../database/models/security/audit-log-model').model;
    const AuditArchiveModel = require('../../database/models/audit-archive-model');

    // Move entries to archive collection
    const entries = await AuditLogModel.find({
      'timestamp': { $lt: before }
    });

    if (entries.length > 0) {
      await AuditArchiveModel.insertMany(entries);
      await AuditLogModel.deleteMany({
        'timestamp': { $lt: before }
      });
    }

    return entries.length;
  }

  /**
   * Retrieves logs from database
   * @private
   * @param {Object} criteria - Query criteria
   * @returns {Promise<Array>} Logs
   */
  async #retrieveFromDatabase(criteria) {
    if (!this.database) {
      throw new AppError('Database not configured', 500, 'NO_DATABASE');
    }

    const AuditLogModel = require('../../database/models/security/audit-log-model').model;
    const query = this.#buildDatabaseQuery(criteria);
    
    return await AuditLogModel.find(query)
      .sort({ timestamp: -1 })
      .limit(criteria.limit || 1000);
  }

  /**
   * Retrieves logs from files
   * @private
   * @param {Object} criteria - Query criteria
   * @returns {Promise<Array>} Logs
   */
  async #retrieveFromFiles(criteria) {
    const files = await fs.readdir(this.fileOptions.basePath);
    const logFiles = files.filter(f => f.endsWith('.log')).sort().reverse();
    const logs = [];

    for (const file of logFiles) {
      const filePath = path.join(this.fileOptions.basePath, file);
      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.split('\n').filter(line => line.trim());

      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          
          if (this.#matchesCriteria(entry, criteria)) {
            logs.push(entry);
            
            if (logs.length >= (criteria.limit || 1000)) {
              return logs;
            }
          }
        } catch (error) {
          logger.warn('Failed to parse log line', { file, error: error.message });
        }
      }
    }

    return logs;
  }

  /**
   * Builds database query from criteria
   * @private
   * @param {Object} criteria - Query criteria
   * @returns {Object} MongoDB query
   */
  #buildDatabaseQuery(criteria) {
    const query = {};

    if (criteria.startDate || criteria.endDate) {
      query.timestamp = {};
      
      if (criteria.startDate) {
        query.timestamp.$gte = criteria.startDate;
      }
      
      if (criteria.endDate) {
        query.timestamp.$lte = criteria.endDate;
      }
    }

    if (criteria.userId) {
      query.userId = criteria.userId;
    }

    if (criteria.eventType) {
      query.eventType = criteria.eventType;
    }

    if (criteria.tenantId) {
      query.tenantId = criteria.tenantId;
    }

    return query;
  }

  /**
   * Checks if entry matches criteria
   * @private
   * @param {Object} entry - Log entry
   * @param {Object} criteria - Query criteria
   * @returns {boolean} True if matches
   */
  #matchesCriteria(entry, criteria) {
    if (criteria.startDate && new Date(entry.timestamp) < new Date(criteria.startDate)) {
      return false;
    }

    if (criteria.endDate && new Date(entry.timestamp) > new Date(criteria.endDate)) {
      return false;
    }

    if (criteria.userId && entry.userId !== criteria.userId) {
      return false;
    }

    if (criteria.eventType && entry.eventType !== criteria.eventType) {
      return false;
    }

    if (criteria.tenantId && entry.tenantId !== criteria.tenantId) {
      return false;
    }

    return true;
  }

  /**
   * Gets current log file path
   * @private
   * @returns {string} Log file path
   */
  #getCurrentLogFile() {
    const date = new Date().toISOString().split('T')[0];
    return path.join(this.fileOptions.basePath, `audit_${date}.log`);
  }

  /**
   * Ensures log directory exists
   * @private
   * @returns {Promise<void>}
   */
  async #ensureLogDirectory() {
    try {
      await fs.mkdir(this.fileOptions.basePath, { recursive: true });
    } catch (error) {
      logger.error('Failed to create log directory', error);
    }
  }

  /**
   * Cleans up old log files
   * @private
   * @returns {Promise<void>}
   */
  async #cleanupOldFiles() {
    try {
      const files = await fs.readdir(this.fileOptions.basePath);
      const logFiles = files.filter(f => f.endsWith('.log')).sort();

      if (logFiles.length > this.fileOptions.maxFiles) {
        const toDelete = logFiles.slice(0, logFiles.length - this.fileOptions.maxFiles);
        
        for (const file of toDelete) {
          await fs.unlink(path.join(this.fileOptions.basePath, file));
          logger.debug('Deleted old log file', { file });
        }
      }
    } catch (error) {
      logger.error('Failed to cleanup old files', error);
    }
  }

  /**
   * Gets storage statistics
   * @returns {Promise<Object>} Storage statistics
   */
  async getStats() {
    const stats = {
      storageType: this.storageType,
      bufferSize: this.writeBuffer.length
    };

    if (this.storageType === AuditLogger.#STORAGE_TYPES.FILE || 
        this.storageType === AuditLogger.#STORAGE_TYPES.HYBRID) {
      try {
        const files = await fs.readdir(this.fileOptions.basePath);
        const logFiles = files.filter(f => f.endsWith('.log'));
        
        let totalSize = 0;
        for (const file of logFiles) {
          const filePath = path.join(this.fileOptions.basePath, file);
          const stat = await fs.stat(filePath);
          totalSize += stat.size;
        }

        stats.fileCount = logFiles.length;
        stats.totalSize = totalSize;
        stats.currentFile = this.#getCurrentLogFile();
      } catch (error) {
        logger.error('Failed to get file stats', error);
      }
    }

    if (this.database && 
        (this.storageType === AuditLogger.#STORAGE_TYPES.DATABASE || 
         this.storageType === AuditLogger.#STORAGE_TYPES.HYBRID)) {
      try {
        const AuditLogModel = require('../../database/models/security/audit-log-model').model;
        stats.databaseCount = await AuditLogModel.countDocuments();
      } catch (error) {
        logger.error('Failed to get database stats', error);
      }
    }

    return stats;
  }

  /**
   * Cleans up resources
   */
  cleanup() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }

    // Flush remaining buffer
    this.#flushBuffer().catch(error => {
      logger.error('Failed to flush buffer during cleanup', error);
    });

    logger.info('AuditLogger cleanup completed');
  }
}

module.exports = AuditLogger;