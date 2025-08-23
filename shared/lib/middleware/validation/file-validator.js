'use strict';

/**
 * @fileoverview File upload validation middleware with security features
 * @module shared/lib/middleware/validation/file-validator
 * @requires module:joi
 * @requires module:file-type
 * @requires module:sharp
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/constants/error-codes
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/services/file-service
 * @requires module:shared/lib/security/services/malware-scanner
 * @requires module:shared/lib/database/models/file-restriction-model
 * @requires module:shared/lib/config
 */

const Joi = require('joi');
const fileType = require('file-type');
const sharp = require('sharp');
const logger = require('../../utils/logger');
const { AppError } = require('../../utils/app-error');
const { ERROR_CODES } = require('../../utils/constants/error-codes');
const CacheService = require('../../services/cache-service');
const FileService = require('../../services/file-service');
const MalwareScanner = require('../security/malware-scanner');
// const FileRestrictionModel = require('../../database/models/file-restriction-model');
const config = require('../helmet-config');

/**
 * @class FileValidator
 * @description Comprehensive file upload validation with security features
 */
class FileValidator {
  /**
   * @private
   * @type {CacheService}
   */
  #cacheService;

  /**
   * @private
   * @type {FileService}
   */
  #fileService;

  /**
   * @private
   * @type {MalwareScanner}
   */
  #malwareScanner;

  /**
   * @private
   * @type {Object}
   */
  #config;

  /**
   * @private
   * @type {Map<string, Object>}
   */
  #fileTypeConfigs;

  /**
   * @private
   * @type {Map<string, Object>}
   */
  #validationMetrics;

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #DEFAULT_CONFIG = {
    maxFileSize: 10 * 1024 * 1024, // 10MB
    maxFiles: 10,
    allowedMimeTypes: [],
    blockedMimeTypes: [
      'application/x-msdownload',
      'application/x-msdos-program',
      'application/x-msdos-windows',
      'application/x-download',
      'application/bat',
      'application/x-bat',
      'application/com',
      'application/x-com',
      'application/exe',
      'application/x-exe',
      'application/x-winexe',
      'application/x-winhlp',
      'application/x-winhelp',
      'application/x-javascript',
      'application/hta',
      'application/x-ms-shortcut',
      'application/octet-stream',
      'vms/exe'
    ],
    allowedExtensions: [],
    blockedExtensions: [
      'exe', 'scr', 'vbs', 'pif', 'application', 'gadget',
      'msi', 'msp', 'com', 'cmd', 'bat', 'ps1', 'ps2',
      'reg', 'vb', 'vbe', 'js', 'jse', 'ws', 'wsf',
      'wsc', 'wsh', 'msc', 'jar', 'cpl'
    ],
    scanForMalware: process.env.NODE_ENV === 'production',
    validateMimeType: true,
    validateMagicNumbers: true,
    sanitizeFilename: true,
    generateThumbnails: false,
    imageProcessing: {
      maxWidth: 4096,
      maxHeight: 4096,
      stripMetadata: true,
      convertToFormat: null
    },
    storage: {
      preserveOriginal: true,
      generateHash: true,
      addWatermark: false
    },
    cache: {
      enabled: true,
      ttl: 3600
    }
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   */
  static #FILE_CATEGORIES = {
    IMAGE: {
      mimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
      extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'],
      maxSize: 5 * 1024 * 1024, // 5MB
      process: true
    },
    DOCUMENT: {
      mimeTypes: [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain',
        'text/csv'
      ],
      extensions: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'csv'],
      maxSize: 10 * 1024 * 1024, // 10MB
      process: false
    },
    VIDEO: {
      mimeTypes: ['video/mp4', 'video/mpeg', 'video/quicktime', 'video/x-msvideo'],
      extensions: ['mp4', 'mpeg', 'mov', 'avi'],
      maxSize: 100 * 1024 * 1024, // 100MB
      process: false
    },
    AUDIO: {
      mimeTypes: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp3'],
      extensions: ['mp3', 'wav', 'ogg'],
      maxSize: 20 * 1024 * 1024, // 20MB
      process: false
    },
    ARCHIVE: {
      mimeTypes: ['application/zip', 'application/x-rar-compressed', 'application/x-tar'],
      extensions: ['zip', 'rar', 'tar', 'gz'],
      maxSize: 50 * 1024 * 1024, // 50MB
      process: false,
      requireScan: true
    }
  };

  /**
   * Creates FileValidator instance
   * @param {Object} [options] - Validator configuration
   * @param {CacheService} [cacheService] - Cache service instance
   * @param {FileService} [fileService] - File service instance
   * @param {MalwareScanner} [malwareScanner] - Malware scanner instance
   */
  constructor(options = {}, cacheService, fileService, malwareScanner) {
    this.#config = { ...FileValidator.#DEFAULT_CONFIG, ...options };
    this.#cacheService = cacheService || new CacheService();
    this.#fileService = fileService || new FileService();
    this.#malwareScanner = malwareScanner || new MalwareScanner();
    this.#fileTypeConfigs = new Map();
    this.#validationMetrics = new Map();

    // Initialize file type configurations
    this.#initializeFileTypes();

    logger.info('FileValidator initialized', {
      malwareScanEnabled: this.#config.scanForMalware,
      mimeValidation: this.#config.validateMimeType
    });
  }

  /**
   * Validates file uploads
   * @param {Object} [options] - Validation options
   * @returns {Function} Express middleware function
   */
  validate(options = {}) {
    return async (req, res, next) => {
      const correlationId = req.correlationId || this.#generateCorrelationId();
      const startTime = Date.now();

      try {
        if (!req.files && !req.file) {
          if (options.required) {
            throw new AppError(
              'No files uploaded',
              400,
              ERROR_CODES.VALIDATION_ERROR,
              { correlationId }
            );
          }
          return next();
        }

        // Normalize files array
        const files = req.files ? 
          (Array.isArray(req.files) ? req.files : Object.values(req.files).flat()) :
          [req.file];

        // Check file count
        if (files.length > (options.maxFiles || this.#config.maxFiles)) {
          throw new AppError(
            `Too many files uploaded. Maximum allowed: ${options.maxFiles || this.#config.maxFiles}`,
            400,
            ERROR_CODES.VALIDATION_ERROR,
            { correlationId, fileCount: files.length }
          );
        }

        // Validate each file
        const validatedFiles = [];
        const errors = [];

        for (const file of files) {
          try {
            const validated = await this.#validateFile(file, {
              ...this.#config,
              ...options,
              correlationId
            });
            validatedFiles.push(validated);
          } catch (error) {
            errors.push({
              filename: file.originalname || file.name,
              error: error.message
            });
          }
        }

        if (errors.length > 0) {
          throw new AppError(
            'File validation failed',
            400,
            ERROR_CODES.FILE_VALIDATION_ERROR,
            { correlationId, errors }
          );
        }

        // Update request with validated files
        if (req.files) {
          req.files = Array.isArray(req.files) ? validatedFiles : validatedFiles[0];
        } else {
          req.file = validatedFiles[0];
        }

        req.fileValidation = {
          correlationId,
          timestamp: new Date(),
          duration: Date.now() - startTime,
          fileCount: validatedFiles.length
        };

        logger.debug('File validation successful', {
          correlationId,
          fileCount: validatedFiles.length,
          duration: Date.now() - startTime
        });

        next();

      } catch (error) {
        const duration = Date.now() - startTime;

        logger.error('File validation failed', {
          correlationId,
          error: error.message,
          duration
        });

        // Clean up uploaded files on error
        this.#cleanupFiles(req.files || req.file).catch(err =>
          logger.error('Failed to cleanup files', { error: err.message })
        );

        next(error instanceof AppError ? error : new AppError(
          'File validation failed',
          400,
          ERROR_CODES.FILE_VALIDATION_ERROR,
          { correlationId, originalError: error.message }
        ));
      }
    };
  }

  /**
   * Validates specific file type
   * @param {string} category - File category (IMAGE, DOCUMENT, etc)
   * @param {Object} [options] - Validation options
   * @returns {Function} Express middleware function
   */
  validateFileType(category, options = {}) {
    const categoryConfig = FileValidator.#FILE_CATEGORIES[category];
    if (!categoryConfig) {
      throw new Error(`Unknown file category: ${category}`);
    }

    return this.validate({
      ...options,
      allowedMimeTypes: categoryConfig.mimeTypes,
      allowedExtensions: categoryConfig.extensions,
      maxFileSize: options.maxFileSize || categoryConfig.maxSize,
      process: categoryConfig.process
    });
  }

  /**
   * Validates image uploads with processing
   * @param {Object} [options] - Image validation options
   * @returns {Function} Express middleware function
   */
  validateImage(options = {}) {
    return this.validateFileType('IMAGE', {
      ...options,
      processImage: true,
      dimensions: options.dimensions || {
        minWidth: 100,
        minHeight: 100,
        maxWidth: this.#config.imageProcessing.maxWidth,
        maxHeight: this.#config.imageProcessing.maxHeight
      }
    });
  }

  /**
   * Validates document uploads
   * @param {Object} [options] - Document validation options
   * @returns {Function} Express middleware function
   */
  validateDocument(options = {}) {
    return this.validateFileType('DOCUMENT', options);
  }

  /**
   * Creates custom file validator
   * @param {Object} rules - Validation rules
   * @returns {Function} Express middleware function
   */
  validateWithRules(rules) {
    return this.validate({
      allowedMimeTypes: rules.mimeTypes,
      allowedExtensions: rules.extensions,
      maxFileSize: rules.maxSize,
      minFileSize: rules.minSize,
      required: rules.required,
      maxFiles: rules.maxFiles,
      customValidation: rules.validate
    });
  }

  /**
   * @private
   * Initializes file type configurations
   */
  #initializeFileTypes() {
    Object.entries(FileValidator.#FILE_CATEGORIES).forEach(([category, config]) => {
      this.#fileTypeConfigs.set(category, config);
    });
  }

  /**
   * @private
   * Validates individual file
   */
  async #validateFile(file, options) {
    const validationSteps = [
      { name: 'basic', fn: () => this.#validateBasicProperties(file, options) },
      { name: 'size', fn: () => this.#validateFileSize(file, options) },
      { name: 'name', fn: () => this.#validateFileName(file, options) },
      { name: 'extension', fn: () => this.#validateFileExtension(file, options) },
      { name: 'mimeType', fn: () => this.#validateMimeType(file, options) },
      { name: 'magicNumbers', fn: () => this.#validateMagicNumbers(file, options) },
      { name: 'content', fn: () => this.#validateFileContent(file, options) },
      { name: 'malware', fn: () => this.#scanForMalware(file, options) }
    ];

    const metadata = {
      originalName: file.originalname || file.name,
      validatedAt: new Date(),
      validationResults: {}
    };

    for (const step of validationSteps) {
      try {
        await step.fn();
        metadata.validationResults[step.name] = { passed: true };
      } catch (error) {
        metadata.validationResults[step.name] = { 
          passed: false, 
          error: error.message 
        };
        throw error;
      }
    }

    // Process file if needed
    if (options.processImage && this.#isImage(file)) {
      await this.#processImage(file, options);
    }

    // Add validation metadata
    file.validation = metadata;
    file.secure = true;

    return file;
  }

  /**
   * @private
   * Validates basic file properties
   */
  async #validateBasicProperties(file, options) {
    if (!file) {
      throw new Error('File object is required');
    }

    const requiredProps = ['fieldname', 'originalname', 'mimetype', 'size'];
    const missingProps = requiredProps.filter(prop => !file[prop]);

    if (missingProps.length > 0) {
      throw new Error(`Missing required file properties: ${missingProps.join(', ')}`);
    }
  }

  /**
   * @private
   * Validates file size
   */
  async #validateFileSize(file, options) {
    const maxSize = options.maxFileSize || this.#config.maxFileSize;
    const minSize = options.minFileSize || 0;

    if (file.size > maxSize) {
      throw new Error(
        `File size exceeds maximum allowed size of ${this.#formatFileSize(maxSize)}`
      );
    }

    if (file.size < minSize) {
      throw new Error(
        `File size is below minimum required size of ${this.#formatFileSize(minSize)}`
      );
    }
  }

  /**
   * @private
   * Validates and sanitizes filename
   */
  async #validateFileName(file, options) {
    const filename = file.originalname || file.name;

    // Check for path traversal attempts
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      throw new Error('Invalid filename: potential path traversal detected');
    }

    // Sanitize filename if configured
    if (options.sanitizeFilename) {
      file.sanitizedName = filename
        .replace(/[^a-zA-Z0-9.-]/g, '_')
        .replace(/_{2,}/g, '_')
        .toLowerCase();
    }

    // Validate filename length
    if (filename.length > 255) {
      throw new Error('Filename too long');
    }
  }

  /**
   * @private
   * Validates file extension
   */
  async #validateFileExtension(file, options) {
    const filename = file.originalname || file.name;
    const extension = filename.split('.').pop().toLowerCase();

    // Check blocked extensions
    if (this.#config.blockedExtensions.includes(extension)) {
      throw new Error(`File extension '${extension}' is not allowed`);
    }

    // Check allowed extensions if specified
    if (options.allowedExtensions && options.allowedExtensions.length > 0) {
      if (!options.allowedExtensions.includes(extension)) {
        throw new Error(
          `File extension '${extension}' is not allowed. ` +
          `Allowed extensions: ${options.allowedExtensions.join(', ')}`
        );
      }
    }

    file.extension = extension;
  }

  /**
   * @private
   * Validates MIME type
   */
  async #validateMimeType(file, options) {
    if (!options.validateMimeType) return;

    const mimeType = file.mimetype.toLowerCase();

    // Check blocked MIME types
    if (this.#config.blockedMimeTypes.includes(mimeType)) {
      throw new Error(`MIME type '${mimeType}' is not allowed`);
    }

    // Check allowed MIME types if specified
    if (options.allowedMimeTypes && options.allowedMimeTypes.length > 0) {
      const allowed = options.allowedMimeTypes.map(m => m.toLowerCase());
      if (!allowed.includes(mimeType)) {
        throw new Error(
          `MIME type '${mimeType}' is not allowed. ` +
          `Allowed types: ${allowed.join(', ')}`
        );
      }
    }

    // Verify MIME type matches extension
    const expectedMime = this.#getMimeTypeForExtension(file.extension);
    if (expectedMime && expectedMime !== mimeType) {
      logger.warn('MIME type mismatch', {
        filename: file.originalname,
        declaredMime: mimeType,
        expectedMime
      });
    }
  }

  /**
   * @private
   * Validates file magic numbers
   */
  async #validateMagicNumbers(file, options) {
    if (!options.validateMagicNumbers || !file.buffer) return;

    try {
      const type = await fileType.fromBuffer(file.buffer);
      
      if (!type) {
        logger.warn('Could not determine file type from magic numbers', {
          filename: file.originalname
        });
        return;
      }

      // Verify against declared MIME type
      if (type.mime !== file.mimetype) {
        throw new Error(
          `File type mismatch. Declared: ${file.mimetype}, ` +
          `Detected: ${type.mime}`
        );
      }

      file.detectedType = type;

    } catch (error) {
      logger.error('Magic number validation failed', {
        filename: file.originalname,
        error: error.message
      });
      
      if (options.strict) {
        throw error;
      }
    }
  }

  /**
   * @private
   * Validates file content
   */
  async #validateFileContent(file, options) {
    if (!options.validateContent || !file.buffer) return;

    // Check for embedded executables
    const executableSignatures = [
      Buffer.from('4D5A'), // MZ header
      Buffer.from('7F454C46'), // ELF header
      Buffer.from('504B0304'), // ZIP header (can contain executables)
    ];

    for (const signature of executableSignatures) {
      if (file.buffer.slice(0, signature.length).equals(signature)) {
        throw new Error('File contains potentially dangerous content');
      }
    }

    // Custom content validation
    if (options.customValidation) {
      await options.customValidation(file);
    }
  }

  /**
   * @private
   * Scans file for malware
   */
  async #scanForMalware(file, options) {
    if (!options.scanForMalware || !file.buffer) return;

    try {
      const scanResult = await this.#malwareScanner.scan(file.buffer, {
        filename: file.originalname,
        correlationId: options.correlationId
      });

      if (!scanResult.clean) {
        throw new Error(
          `File failed security scan: ${scanResult.threat || 'Unknown threat'}`
        );
      }

      file.scanResult = scanResult;

    } catch (error) {
      logger.error('Malware scan failed', {
        filename: file.originalname,
        error: error.message
      });

      // Fail closed - reject file if scan fails
      throw new Error('File security scan failed');
    }
  }

  /**
   * @private
   * Processes image files
   */
  async #processImage(file, options) {
    if (!file.buffer) return;

    try {
      const image = sharp(file.buffer);
      const metadata = await image.metadata();

      // Validate dimensions
      if (options.dimensions) {
        const { minWidth, minHeight, maxWidth, maxHeight } = options.dimensions;
        
        if (metadata.width < minWidth || metadata.height < minHeight) {
          throw new Error(
            `Image dimensions too small. Minimum: ${minWidth}x${minHeight}`
          );
        }

        if (metadata.width > maxWidth || metadata.height > maxHeight) {
          // Resize if configured
          if (options.autoResize) {
            image.resize(maxWidth, maxHeight, { fit: 'inside' });
          } else {
            throw new Error(
              `Image dimensions too large. Maximum: ${maxWidth}x${maxHeight}`
            );
          }
        }
      }

      // Strip metadata if configured
      if (this.#config.imageProcessing.stripMetadata) {
        image.rotate(); // This strips EXIF data
      }

      // Convert format if specified
      if (options.convertTo || this.#config.imageProcessing.convertToFormat) {
        const format = options.convertTo || this.#config.imageProcessing.convertToFormat;
        image.toFormat(format);
        file.convertedFormat = format;
      }

      // Apply watermark if configured
      if (options.watermark || this.#config.storage.addWatermark) {
        // Watermark implementation would go here
      }

      // Get processed buffer
      const processedBuffer = await image.toBuffer();
      
      file.processedBuffer = processedBuffer;
      file.processedSize = processedBuffer.length;
      file.imageMetadata = metadata;

    } catch (error) {
      logger.error('Image processing failed', {
        filename: file.originalname,
        error: error.message
      });

      throw new Error(`Image processing failed: ${error.message}`);
    }
  }

  /**
   * @private
   * Cleans up uploaded files
   */
  async #cleanupFiles(files) {
    if (!files) return;

    const fileArray = Array.isArray(files) ? files : [files];

    for (const file of fileArray) {
      if (file.path) {
        try {
          await this.#fileService.deleteFile(file.path);
        } catch (error) {
          logger.error('Failed to cleanup file', {
            path: file.path,
            error: error.message
          });
        }
      }
    }
  }

  /**
   * @private
   * Checks if file is an image
   */
  #isImage(file) {
    const imageMimes = FileValidator.#FILE_CATEGORIES.IMAGE.mimeTypes;
    return imageMimes.includes(file.mimetype.toLowerCase());
  }

  /**
   * @private
   * Gets expected MIME type for extension
   */
  #getMimeTypeForExtension(extension) {
    const mimeMap = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      // Add more mappings as needed
    };

    return mimeMap[extension];
  }

  /**
   * @private
   * Formats file size for display
   */
  #formatFileSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  /**
   * @private
   * Generates correlation ID
   */
  #generateCorrelationId() {
    return `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Gets validation metrics
   * @returns {Object} Validation metrics
   */
  getMetrics() {
    const metrics = {};
    
    this.#validationMetrics.forEach((value, key) => {
      metrics[key] = { ...value };
    });

    return metrics;
  }

  /**
   * Updates file type configuration
   * @param {string} category - File category
   * @param {Object} config - New configuration
   */
  updateFileTypeConfig(category, config) {
    const existing = this.#fileTypeConfigs.get(category) || {};
    this.#fileTypeConfigs.set(category, { ...existing, ...config });
    logger.info('File type configuration updated', { category });
  }
}

// Export singleton instance
let instance;

/**
 * Gets or creates FileValidator instance
 * @param {Object} [config] - Validator configuration
 * @returns {FileValidator} Validator instance
 */
const getFileValidator = (config) => {
  if (!instance) {
    instance = new FileValidator(config);
  }
  return instance;
};

module.exports = {
  FileValidator,
  getFileValidator,
  // Export convenience methods
  validate: (options) => getFileValidator().validate(options),
  validateFileType: (category, options) => getFileValidator().validateFileType(category, options),
  validateImage: (options) => getFileValidator().validateImage(options),
  validateDocument: (options) => getFileValidator().validateDocument(options),
  validateWithRules: (rules) => getFileValidator().validateWithRules(rules)
};