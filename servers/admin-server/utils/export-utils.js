'use strict';

/**
 * @fileoverview Data export utilities for administrative bulk operations
 * @module servers/admin-server/utils/export-utils
 * @requires module:shared/lib/services/file-service
 * @requires module:shared/lib/utils/helpers
 * @requires module:servers/admin-server/config
 */

const FileService = require('../../../shared/lib/services/file-service');
const { dateHelper, stringHelper, CacheHelper } = require('../../../shared/lib/utils/helpers');
const config = require('../config');
const crypto = require('crypto');
const path = require('path');
const zlib = require('zlib');
const { promisify } = require('util');

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

/**
 * @class ExportUtils
 * @description Comprehensive data export management for administrative operations
 */
class ExportUtils {
  /**
   * @private
   * @static
   * @type {FileService}
   */
  static #fileService = new FileService();

  /**
   * @private
   * @static
   * @type {Object}
   */
  static #config = {
    maxExportSize: config.exports?.maxSize || 500 * 1024 * 1024, // 500MB
    chunkSize: config.exports?.chunkSize || 10000,
    tempDirectory: config.exports?.tempDirectory || './temp/exports',
    archiveDirectory: config.exports?.archiveDirectory || './archives/exports',
    supportedFormats: config.exports?.formats || ['csv', 'xlsx', 'json', 'xml', 'pdf'],
    compression: {
      enabled: config.exports?.compression !== false,
      level: config.exports?.compressionLevel || 6
    },
    encryption: {
      enabled: config.exports?.encryption || false,
      algorithm: config.exports?.encryptionAlgorithm || 'aes-256-gcm'
    },
    retention: {
      tempFiles: config.exports?.tempRetention || 3600000, // 1 hour
      archives: config.exports?.archiveRetention || 2592000000 // 30 days
    }
  };

  /**
   * @private
   * @static
   * @type {Map<string, Object>}
   */
  static #activeExports = new Map();

  /**
   * @private
   * @static
   * @type {Map<string, Function>}
   */
  static #formatters = new Map([
    ['csv', 'formatCSV'],
    ['xlsx', 'formatExcel'],
    ['json', 'formatJSON'],
    ['xml', 'formatXML'],
    ['pdf', 'formatPDF']
  ]);

  /**
   * Create bulk export job
   * @static
   * @param {Object} exportConfig - Export configuration
   * @returns {Promise<Object>} Export job details
   */
  static async createExport(exportConfig) {
    const {
      dataSource,
      query = {},
      format = 'csv',
      fields = null,
      transforms = [],
      options = {}
    } = exportConfig;

    // Validate export configuration
    this.#validateExportConfig(exportConfig);

    // Generate export ID
    const exportId = crypto.randomUUID();
    const timestamp = new Date();

    // Initialize export job
    const exportJob = {
      exportId,
      status: 'initializing',
      dataSource,
      query,
      format,
      fields,
      transforms,
      options,
      startedAt: timestamp,
      progress: {
        current: 0,
        total: 0,
        percentage: 0
      },
      metadata: {
        userId: options.userId,
        organizationId: options.organizationId,
        requestIp: options.requestIp
      }
    };

    // Store active export
    this.#activeExports.set(exportId, exportJob);

    // Start export process
    this.#processExport(exportJob).catch(error => {
      exportJob.status = 'failed';
      exportJob.error = error.message;
    });

    return {
      exportId,
      status: exportJob.status,
      format,
      estimatedTime: this.#estimateExportTime(exportConfig)
    };
  }

  /**
   * Stream export data
   * @static
   * @param {Object} streamConfig - Stream configuration
   * @returns {Object} Export stream
   */
  static createExportStream(streamConfig) {
    const {
      dataSource,
      format = 'csv',
      chunkSize = this.#config.chunkSize,
      transform
    } = streamConfig;

    const { Readable, Transform } = require('stream');
    
    // Create data stream
    const dataStream = new Readable({
      objectMode: true,
      async read() {
        // Implementation would fetch data in chunks
      }
    });

    // Create format transform
    const formatTransform = new Transform({
      objectMode: true,
      transform(chunk, encoding, callback) {
        try {
          const formatted = this.#formatChunk(chunk, format);
          callback(null, formatted);
        } catch (error) {
          callback(error);
        }
      }
    });

    // Apply custom transform if provided
    if (transform) {
      return dataStream.pipe(transform).pipe(formatTransform);
    }

    return dataStream.pipe(formatTransform);
  }

  /**
   * Export to CSV format
   * @static
   * @param {Array} data - Data to export
   * @param {Object} [options={}] - CSV options
   * @returns {Promise<Buffer>} CSV buffer
   */
  static async exportToCSV(data, options = {}) {
    const {
      headers = true,
      delimiter = ',',
      quote = '"',
      escape = '"',
      linebreak = '\n',
      encoding = 'utf8',
      fields = null,
      transforms = []
    } = options;

    // Apply transforms
    const transformedData = this.#applyTransforms(data, transforms);

    // Extract fields if not specified
    const exportFields = fields || this.#extractFields(transformedData);

    // Build CSV content
    const rows = [];

    // Add headers
    if (headers) {
      const headerRow = exportFields
        .map(field => this.#escapeCSVValue(field.label || field.key, { quote, escape }))
        .join(delimiter);
      rows.push(headerRow);
    }

    // Add data rows
    transformedData.forEach(item => {
      const values = exportFields.map(field => {
        const value = this.#getNestedValue(item, field.key);
        const formatted = field.formatter ? field.formatter(value) : value;
        return this.#escapeCSVValue(formatted, { quote, escape });
      });
      rows.push(values.join(delimiter));
    });

    return Buffer.from(rows.join(linebreak), encoding);
  }

  /**
   * Export to Excel format
   * @static
   * @param {Array|Object} data - Data to export
   * @param {Object} [options={}] - Excel options
   * @returns {Promise<Buffer>} Excel buffer
   */
  static async exportToExcel(data, options = {}) {
    const {
      sheetName = 'Export',
      sheets = null,
      styling = true,
      autoFilter = true,
      freezeHeader = true,
      columnWidths = 'auto',
      fields = null
    } = options;

    // Mock implementation - would use xlsx library
    const workbook = {
      sheets: sheets || [{ name: sheetName, data }],
      properties: {
        title: options.title || 'Admin Export',
        author: options.author || 'InsightSerenity Platform',
        created: new Date()
      }
    };

    // Apply styling if enabled
    if (styling) {
      workbook.styles = this.#generateExcelStyles();
    }

    // Convert to buffer (actual implementation would use xlsx)
    return Buffer.from(JSON.stringify(workbook));
  }

  /**
   * Export to JSON format
   * @static
   * @param {*} data - Data to export
   * @param {Object} [options={}] - JSON options
   * @returns {Promise<Buffer>} JSON buffer
   */
  static async exportToJSON(data, options = {}) {
    const {
      pretty = true,
      replacer = null,
      space = 2,
      encoding = 'utf8',
      wrapper = null
    } = options;

    let exportData = data;

    // Apply wrapper if specified
    if (wrapper) {
      exportData = {
        [wrapper]: data,
        metadata: {
          exported: new Date(),
          count: Array.isArray(data) ? data.length : 1,
          version: '1.0'
        }
      };
    }

    const json = pretty 
      ? JSON.stringify(exportData, replacer, space)
      : JSON.stringify(exportData, replacer);

    return Buffer.from(json, encoding);
  }

  /**
   * Create archive from multiple exports
   * @static
   * @param {Array} exports - Export configurations
   * @param {Object} [options={}] - Archive options
   * @returns {Promise<Object>} Archive details
   */
  static async createArchive(exports, options = {}) {
    const {
      format = 'zip',
      compression = true,
      password = null,
      metadata = {}
    } = options;

    const archiveId = crypto.randomUUID();
    const timestamp = new Date();

    // Create archive structure
    const archive = {
      archiveId,
      format,
      files: [],
      metadata: {
        ...metadata,
        created: timestamp,
        exportCount: exports.length
      }
    };

    // Process each export
    for (const exportConfig of exports) {
      const exportResult = await this.#processExportForArchive(exportConfig);
      archive.files.push({
        filename: exportResult.filename,
        size: exportResult.size,
        format: exportResult.format,
        checksum: exportResult.checksum
      });
    }

    // Create archive file
    const archivePath = path.join(
      this.#config.archiveDirectory,
      `archive-${archiveId}.${format}`
    );

    // Store archive metadata
    archive.path = archivePath;
    archive.size = await this.#calculateArchiveSize(archive.files);

    return archive;
  }

  /**
   * Queue export job
   * @static
   * @param {Object} exportConfig - Export configuration
   * @param {Object} [options={}] - Queue options
   * @returns {Promise<Object>} Queued job details
   */
  static async queueExport(exportConfig, options = {}) {
    const {
      priority = 'normal',
      scheduledFor = null,
      notification = true
    } = options;

    const jobId = crypto.randomUUID();
    const queuedAt = new Date();

    const job = {
      jobId,
      type: 'export',
      config: exportConfig,
      priority,
      scheduledFor: scheduledFor || queuedAt,
      queuedAt,
      status: 'queued',
      attempts: 0,
      notification
    };

    // Add to queue (implementation would use job queue service)
    CacheHelper.set(`export:queue:${jobId}`, job, { ttl: 86400000 }); // 24 hours

    return {
      jobId,
      status: job.status,
      scheduledFor: job.scheduledFor,
      position: await this.#getQueuePosition(jobId)
    };
  }

  /**
   * Get export status
   * @static
   * @param {string} exportId - Export ID
   * @returns {Object|null} Export status
   */
  static getExportStatus(exportId) {
    const exportJob = this.#activeExports.get(exportId);
    
    if (!exportJob) {
      // Check completed exports
      return CacheHelper.get(`export:completed:${exportId}`);
    }

    return {
      exportId: exportJob.exportId,
      status: exportJob.status,
      progress: exportJob.progress,
      startedAt: exportJob.startedAt,
      completedAt: exportJob.completedAt,
      error: exportJob.error,
      downloadUrl: exportJob.downloadUrl
    };
  }

  /**
   * Cancel export
   * @static
   * @param {string} exportId - Export ID
   * @returns {Promise<boolean>} Cancellation result
   */
  static async cancelExport(exportId) {
    const exportJob = this.#activeExports.get(exportId);
    
    if (!exportJob || exportJob.status === 'completed') {
      return false;
    }

    exportJob.status = 'cancelled';
    exportJob.cancelledAt = new Date();
    
    // Clean up resources
    this.#activeExports.delete(exportId);
    
    // Remove temporary files
    if (exportJob.tempFile) {
      await this.#fileService.delete(exportJob.tempFile);
    }

    return true;
  }

  /**
   * Clean up old exports
   * @static
   * @returns {Promise<Object>} Cleanup results
   */
  static async cleanupExports() {
    const results = {
      tempFiles: 0,
      archives: 0,
      cache: 0
    };

    const now = Date.now();

    // Clean temporary files
    const tempFiles = await this.#fileService.list(this.#config.tempDirectory);
    for (const file of tempFiles) {
      if (now - file.modified > this.#config.retention.tempFiles) {
        await this.#fileService.delete(file.path);
        results.tempFiles++;
      }
    }

    // Clean old archives
    const archives = await this.#fileService.list(this.#config.archiveDirectory);
    for (const archive of archives) {
      if (now - archive.modified > this.#config.retention.archives) {
        await this.#fileService.delete(archive.path);
        results.archives++;
      }
    }

    // Clean cache entries
    results.cache = CacheHelper.deleteByPattern(/^export:/);

    return results;
  }

  /**
   * Process export job
   * @private
   * @static
   * @async
   * @param {Object} exportJob - Export job
   */
  static async #processExport(exportJob) {
    try {
      exportJob.status = 'processing';

      // Fetch data
      const data = await this.#fetchExportData(exportJob);
      exportJob.progress.total = data.length;

      // Format data
      const formatterMethod = this.#formatters.get(exportJob.format);
      if (!formatterMethod) {
        throw new Error(`Unsupported format: ${exportJob.format}`);
      }

      const formatted = await this[formatterMethod](data, exportJob.options);
      
      // Apply compression if enabled
      let finalData = formatted;
      if (this.#config.compression.enabled) {
        finalData = await gzip(formatted, {
          level: this.#config.compression.level
        });
        exportJob.compressed = true;
      }

      // Apply encryption if enabled
      if (this.#config.encryption.enabled) {
        finalData = await this.#encryptData(finalData);
        exportJob.encrypted = true;
      }

      // Save to file
      const filename = this.#generateExportFilename(exportJob);
      const filePath = path.join(this.#config.tempDirectory, filename);
      
      await this.#fileService.write(filePath, finalData);

      // Update job status
      exportJob.status = 'completed';
      exportJob.completedAt = new Date();
      exportJob.file = {
        path: filePath,
        size: finalData.length,
        checksum: this.#calculateChecksum(finalData)
      };
      exportJob.downloadUrl = await this.#generateDownloadUrl(exportJob);

      // Cache completed export
      CacheHelper.set(`export:completed:${exportJob.exportId}`, exportJob, {
        ttl: this.#config.retention.tempFiles
      });

    } catch (error) {
      exportJob.status = 'failed';
      exportJob.error = error.message;
      exportJob.failedAt = new Date();
      throw error;
    } finally {
      // Remove from active exports
      this.#activeExports.delete(exportJob.exportId);
    }
  }

  /**
   * Validate export configuration
   * @private
   * @static
   * @param {Object} config - Export configuration
   * @throws {Error} Validation error
   */
  static #validateExportConfig(config) {
    if (!config.dataSource) {
      throw new Error('Data source is required');
    }

    if (!this.#config.supportedFormats.includes(config.format)) {
      throw new Error(`Unsupported format: ${config.format}`);
    }

    if (config.fields && !Array.isArray(config.fields)) {
      throw new Error('Fields must be an array');
    }

    if (config.transforms && !Array.isArray(config.transforms)) {
      throw new Error('Transforms must be an array');
    }
  }

  /**
   * Escape CSV value
   * @private
   * @static
   * @param {*} value - Value to escape
   * @param {Object} options - Escape options
   * @returns {string} Escaped value
   */
  static #escapeCSVValue(value, options) {
    if (value === null || value === undefined) {
      return '';
    }

    const stringValue = String(value);
    const { quote, escape } = options;

    // Check if value needs quotes
    const needsQuotes = stringValue.includes(',') || 
                       stringValue.includes(quote) || 
                       stringValue.includes('\n') ||
                       stringValue.includes('\r');

    if (!needsQuotes) {
      return stringValue;
    }

    // Escape quotes in value
    const escaped = stringValue.replace(new RegExp(quote, 'g'), escape + quote);
    
    return quote + escaped + quote;
  }

  /**
   * Get nested value from object
   * @private
   * @static
   * @param {Object} obj - Source object
   * @param {string} path - Property path
   * @returns {*} Value
   */
  static #getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => 
      current && current[key] !== undefined ? current[key] : null, 
      obj
    );
  }

  /**
   * Extract fields from data
   * @private
   * @static
   * @param {Array} data - Data array
   * @returns {Array} Field definitions
   */
  static #extractFields(data) {
    if (!data || data.length === 0) {
      return [];
    }

    const firstItem = data[0];
    const fields = [];

    const extractFieldsRecursive = (obj, prefix = '') => {
      Object.keys(obj).forEach(key => {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        const value = obj[key];

        if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
          extractFieldsRecursive(value, fullKey);
        } else {
          fields.push({
            key: fullKey,
            label: this.#humanizeFieldName(fullKey),
            type: this.#detectFieldType(value)
          });
        }
      });
    };

    extractFieldsRecursive(firstItem);
    return fields;
  }

  /**
   * Apply transforms to data
   * @private
   * @static
   * @param {Array} data - Original data
   * @param {Array} transforms - Transform functions
   * @returns {Array} Transformed data
   */
  static #applyTransforms(data, transforms) {
    if (!transforms || transforms.length === 0) {
      return data;
    }

    return data.map(item => {
      let transformed = { ...item };
      
      transforms.forEach(transform => {
        if (typeof transform === 'function') {
          transformed = transform(transformed);
        }
      });
      
      return transformed;
    });
  }

  /**
   * Generate export filename
   * @private
   * @static
   * @param {Object} exportJob - Export job
   * @returns {string} Generated filename
   */
  static #generateExportFilename(exportJob) {
    const parts = [
      'export',
      exportJob.dataSource,
      dateHelper.formatDate(exportJob.startedAt, { format: 'YYYYMMDD-HHmmss' }),
      exportJob.exportId.substring(0, 8)
    ];

    let extension = exportJob.format;
    if (exportJob.compressed) {
      extension += '.gz';
    }
    if (exportJob.encrypted) {
      extension += '.enc';
    }

    return `${parts.join('-')}.${extension}`;
  }

  /**
   * Calculate checksum
   * @private
   * @static
   * @param {Buffer} data - Data buffer
   * @returns {string} Checksum
   */
  static #calculateChecksum(data) {
    return crypto
      .createHash('sha256')
      .update(data)
      .digest('hex');
  }

  /**
   * Humanize field name
   * @private
   * @static
   * @param {string} fieldName - Field name
   * @returns {string} Humanized name
   */
  static #humanizeFieldName(fieldName) {
    return fieldName
      .split('.')
      .pop()
      .replace(/([A-Z])/g, ' $1')
      .replace(/_/g, ' ')
      .trim()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Detect field type
   * @private
   * @static
   * @param {*} value - Field value
   * @returns {string} Detected type
   */
  static #detectFieldType(value) {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'number') return 'number';
    if (value instanceof Date) return 'date';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'object') return 'object';
    return 'string';
  }

  /**
   * Estimate export time
   * @private
   * @static
   * @param {Object} config - Export configuration
   * @returns {number} Estimated time in ms
   */
  static #estimateExportTime(config) {
    // Simple estimation based on format and expected data size
    const baseTime = {
      csv: 1000,
      xlsx: 3000,
      json: 500,
      xml: 2000,
      pdf: 5000
    };

    return baseTime[config.format] || 1000;
  }
}

module.exports = ExportUtils;