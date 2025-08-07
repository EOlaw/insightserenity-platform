'use strict';

/**
 * @fileoverview Enterprise-grade file service for local and cloud storage operations
 * @module shared/lib/services/file-service
 * @requires module:fs-extra
 * @requires module:multer
 * @requires module:sharp
 * @requires module:mime-types
 * @requires module:shared/lib/integrations/storage/aws-s3-service
 * @requires module:shared/lib/integrations/storage/azure-blob-service
 * @requires module:shared/lib/integrations/storage/gcp-storage-service
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/security/encryption/encryption-service
 * @requires module:shared/lib/database/models/audit-log-model
 * @requires module:shared/config
 */

const fs = require('fs-extra');
const path = require('path');
const multer = require('multer');
const sharp = require('sharp');
const mime = require('mime-types');
const crypto = require('crypto');
const { pipeline } = require('stream/promises');
const logger = require('../utils/logger');
const { AppError } = require('../utils/app-error');
const CacheService = require('./cache-service');
const EncryptionService = require('../security/encryption/encryption-service');
const AuditLogModel = require('../database/models/security/audit-log-model').model;
const AWSS3Service = require('../integrations/storage/aws-s3-service');
const AzureBlobService = require('../integrations/storage/azure-blob-service');
const GCPStorageService = require('../integrations/storage/gcp-storage-service');
const config = require('../../config');
const { ERROR_CODES } = require('../utils/constants/error-codes');

/**
 * @class FileService
 * @description Comprehensive file management service with local and cloud storage support
 */
class FileService {
  /**
   * @private
   * @static
   * @type {Map<string, Object>}
   */
  static #storageProviders = new Map();

  /**
   * @private
   * @static
   * @type {string}
   */
  static #primaryProvider;

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
   * @type {Object}
   */
  static #config;

  /**
   * @private
   * @static
   * @type {Map<string, Object>}
   */
  static #uploadStats = new Map();

  /**
   * @private
   * @static
   * @type {Set<string>}
   */
  static #processingQueue = new Set();

  /**
   * @private
   * @static
   * @type {boolean}
   */
  static #initialized = false;

  /**
   * Initialize file service
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
        storage: {
          local: {
            enabled: true,
            basePath: config.storage?.local?.basePath || './uploads',
            maxFileSize: config.storage?.local?.maxFileSize || 50 * 1024 * 1024, // 50MB
            ...options.storage?.local
          },
          s3: {
            enabled: config.storage?.s3?.enabled || false,
            ...config.storage?.s3,
            ...options.storage?.s3
          },
          azure: {
            enabled: config.storage?.azure?.enabled || false,
            ...config.storage?.azure,
            ...options.storage?.azure
          },
          gcp: {
            enabled: config.storage?.gcp?.enabled || false,
            ...config.storage?.gcp,
            ...options.storage?.gcp
          }
        },
        encryption: {
          enabled: config.storage?.encryption?.enabled || false,
          algorithm: 'aes-256-gcm',
          ...options.encryption
        },
        allowedMimeTypes: options.allowedMimeTypes || config.storage?.allowedMimeTypes || [
          'image/jpeg',
          'image/png',
          'image/gif',
          'image/webp',
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'text/plain',
          'text/csv'
        ],
        imageProcessing: {
          enabled: true,
          thumbnailSizes: [
            { name: 'thumb', width: 150, height: 150 },
            { name: 'small', width: 300, height: 300 },
            { name: 'medium', width: 600, height: 600 },
            { name: 'large', width: 1200, height: 1200 }
          ],
          ...options.imageProcessing
        },
        virusScan: {
          enabled: config.storage?.virusScan?.enabled || false,
          ...options.virusScan
        }
      };

      // Initialize services
      this.#cacheService = new CacheService({ namespace: 'files' });
      if (this.#config.encryption.enabled) {
        this.#encryptionService = new EncryptionService();
      }

      // Initialize storage providers
      await this.#initializeStorageProviders();

      // Ensure local directories exist
      if (this.#config.storage.local.enabled) {
        await fs.ensureDir(this.#config.storage.local.basePath);
        await fs.ensureDir(path.join(this.#config.storage.local.basePath, 'temp'));
        await fs.ensureDir(path.join(this.#config.storage.local.basePath, 'thumbnails'));
      }

      this.#initialized = true;
      logger.info('FileService initialized', {
        providers: Array.from(this.#storageProviders.keys()),
        primaryProvider: this.#primaryProvider
      });

    } catch (error) {
      logger.error('Failed to initialize FileService', { error: error.message });
      throw new AppError(
        'File service initialization failed',
        500,
        ERROR_CODES.SERVICE_INITIALIZATION_ERROR
      );
    }
  }

  /**
   * Upload file
   * @static
   * @param {Object} options - Upload options
   * @param {Buffer|Stream} options.file - File data
   * @param {string} options.filename - Original filename
   * @param {string} [options.path] - Storage path
   * @param {Object} [options.metadata] - File metadata
   * @param {string} [options.userId] - User ID for audit
   * @param {string} [options.organizationId] - Organization ID
   * @param {boolean} [options.public=false] - Public access
   * @param {boolean} [options.encrypt] - Encrypt file
   * @param {Object} [options.imageOptions] - Image processing options
   * @returns {Promise<Object>} Upload result
   */
  static async upload(options) {
    await this.initialize();

    const fileId = this.#generateFileId();
    const startTime = Date.now();

    try {
      // Validate options
      const validated = await this.#validateUploadOptions(options);
      
      // Check processing queue
      const queueKey = this.#getQueueKey(validated.filename, validated.metadata);
      if (this.#processingQueue.has(queueKey)) {
        throw new AppError(
          'File is already being processed',
          409,
          ERROR_CODES.FILE_PROCESSING_CONFLICT
        );
      }
      this.#processingQueue.add(queueKey);

      // Virus scan if enabled
      if (this.#config.virusScan.enabled) {
        await this.#scanForVirus(validated.file);
      }

      // Process image if applicable
      let processedFiles = {};
      if (this.#isImage(validated.mimeType) && this.#config.imageProcessing.enabled) {
        processedFiles = await this.#processImage(validated.file, validated.filename, options.imageOptions);
      }

      // Encrypt if required
      let fileData = validated.file;
      let encryptionMetadata = null;
      if (validated.encrypt) {
        const encrypted = await this.#encryptFile(fileData);
        fileData = encrypted.data;
        encryptionMetadata = encrypted.metadata;
      }

      // Upload to storage provider
      const uploadResult = await this.#uploadToProvider({
        fileId,
        data: fileData,
        filename: validated.filename,
        path: validated.path,
        mimeType: validated.mimeType,
        metadata: {
          ...validated.metadata,
          originalSize: validated.size,
          encrypted: validated.encrypt,
          encryptionMetadata
        },
        public: validated.public
      });

      // Upload thumbnails if generated
      const thumbnails = {};
      if (Object.keys(processedFiles).length > 0) {
        for (const [size, data] of Object.entries(processedFiles)) {
          const thumbResult = await this.#uploadToProvider({
            fileId: `${fileId}_${size}`,
            data: data.buffer,
            filename: `${size}_${validated.filename}`,
            path: path.join(validated.path || '', 'thumbnails'),
            mimeType: validated.mimeType,
            metadata: {
              parentId: fileId,
              size: size,
              dimensions: data.dimensions
            },
            public: validated.public
          });
          thumbnails[size] = thumbResult.url;
        }
      }

      // Store metadata in cache
      const fileMetadata = {
        fileId,
        filename: validated.filename,
        mimeType: validated.mimeType,
        size: validated.size,
        path: validated.path,
        url: uploadResult.url,
        thumbnails,
        provider: uploadResult.provider,
        encrypted: validated.encrypt,
        public: validated.public,
        metadata: validated.metadata,
        uploadedAt: new Date(),
        userId: validated.userId,
        organizationId: validated.organizationId
      };

      await this.#cacheService.set(`file:${fileId}`, fileMetadata, 86400); // 24 hours

      // Audit log
      await this.#auditLog({
        action: 'file.uploaded',
        fileId,
        userId: validated.userId,
        organizationId: validated.organizationId,
        metadata: {
          filename: validated.filename,
          size: validated.size,
          mimeType: validated.mimeType,
          provider: uploadResult.provider,
          duration: Date.now() - startTime
        }
      });

      // Update stats
      this.#updateUploadStats(validated.mimeType, validated.size, true);

      logger.info('File uploaded successfully', {
        fileId,
        filename: validated.filename,
        size: validated.size,
        provider: uploadResult.provider,
        duration: Date.now() - startTime
      });

      return fileMetadata;

    } catch (error) {
      this.#updateUploadStats(options.mimeType, 0, false);
      
      logger.error('File upload failed', {
        fileId,
        error: error.message,
        filename: options.filename
      });

      throw error instanceof AppError ? error : new AppError(
        'Failed to upload file',
        500,
        ERROR_CODES.FILE_UPLOAD_FAILED,
        { fileId, originalError: error.message }
      );

    } finally {
      this.#processingQueue.delete(queueKey);
    }
  }

  /**
   * Download file
   * @static
   * @param {Object} options - Download options
   * @param {string} options.fileId - File ID
   * @param {string} [options.size] - Thumbnail size
   * @param {string} [options.userId] - User ID for audit
   * @param {string} [options.organizationId] - Organization ID
   * @returns {Promise<Object>} File data and metadata
   */
  static async download(options) {
    await this.initialize();

    const { fileId, size, userId, organizationId } = options;
    const targetFileId = size ? `${fileId}_${size}` : fileId;

    try {
      // Get file metadata
      const metadata = await this.#getFileMetadata(fileId);
      if (!metadata) {
        throw new AppError(
          'File not found',
          404,
          ERROR_CODES.FILE_NOT_FOUND
        );
      }

      // Check permissions
      await this.#checkFilePermissions(metadata, userId, organizationId);

      // Download from provider
      const fileData = await this.#downloadFromProvider(targetFileId, metadata);

      // Decrypt if encrypted
      let data = fileData;
      if (metadata.encrypted && metadata.encryptionMetadata) {
        data = await this.#decryptFile(fileData, metadata.encryptionMetadata);
      }

      // Audit log
      await this.#auditLog({
        action: 'file.downloaded',
        fileId,
        userId,
        organizationId,
        metadata: {
          filename: metadata.filename,
          size: metadata.size
        }
      });

      return {
        data,
        metadata: {
          filename: metadata.filename,
          mimeType: metadata.mimeType,
          size: metadata.size,
          uploadedAt: metadata.uploadedAt
        }
      };

    } catch (error) {
      logger.error('File download failed', {
        fileId,
        error: error.message
      });

      throw error instanceof AppError ? error : new AppError(
        'Failed to download file',
        500,
        ERROR_CODES.FILE_DOWNLOAD_FAILED,
        { fileId, originalError: error.message }
      );
    }
  }

  /**
   * Delete file
   * @static
   * @param {Object} options - Delete options
   * @param {string} options.fileId - File ID
   * @param {string} [options.userId] - User ID for audit
   * @param {string} [options.organizationId] - Organization ID
   * @param {boolean} [options.permanent=false] - Permanent deletion
   * @returns {Promise<boolean>} Success status
   */
  static async delete(options) {
    await this.initialize();

    const { fileId, userId, organizationId, permanent = false } = options;

    try {
      // Get file metadata
      const metadata = await this.#getFileMetadata(fileId);
      if (!metadata) {
        return false;
      }

      // Check permissions
      await this.#checkFilePermissions(metadata, userId, organizationId, 'delete');

      if (permanent) {
        // Delete from provider
        await this.#deleteFromProvider(fileId, metadata);

        // Delete thumbnails
        if (metadata.thumbnails) {
          for (const size of Object.keys(metadata.thumbnails)) {
            await this.#deleteFromProvider(`${fileId}_${size}`, metadata);
          }
        }

        // Remove from cache
        await this.#cacheService.delete(`file:${fileId}`);
      } else {
        // Soft delete - mark as deleted
        metadata.deletedAt = new Date();
        metadata.deletedBy = userId;
        await this.#cacheService.set(`file:${fileId}`, metadata, 2592000); // 30 days
      }

      // Audit log
      await this.#auditLog({
        action: permanent ? 'file.deleted_permanent' : 'file.deleted',
        fileId,
        userId,
        organizationId,
        metadata: {
          filename: metadata.filename,
          size: metadata.size
        }
      });

      logger.info('File deleted', {
        fileId,
        filename: metadata.filename,
        permanent
      });

      return true;

    } catch (error) {
      logger.error('File deletion failed', {
        fileId,
        error: error.message
      });

      throw error instanceof AppError ? error : new AppError(
        'Failed to delete file',
        500,
        ERROR_CODES.FILE_DELETE_FAILED,
        { fileId, originalError: error.message }
      );
    }
  }

  /**
   * Move file
   * @static
   * @param {Object} options - Move options
   * @param {string} options.fileId - File ID
   * @param {string} options.newPath - New path
   * @param {string} [options.userId] - User ID for audit
   * @param {string} [options.organizationId] - Organization ID
   * @returns {Promise<Object>} Updated file metadata
   */
  static async move(options) {
    await this.initialize();

    const { fileId, newPath, userId, organizationId } = options;

    try {
      // Get file metadata
      const metadata = await this.#getFileMetadata(fileId);
      if (!metadata) {
        throw new AppError(
          'File not found',
          404,
          ERROR_CODES.FILE_NOT_FOUND
        );
      }

      // Check permissions
      await this.#checkFilePermissions(metadata, userId, organizationId, 'write');

      // Move file in provider
      await this.#moveInProvider(fileId, metadata, newPath);

      // Update metadata
      metadata.path = newPath;
      metadata.updatedAt = new Date();
      await this.#cacheService.set(`file:${fileId}`, metadata, 86400);

      // Audit log
      await this.#auditLog({
        action: 'file.moved',
        fileId,
        userId,
        organizationId,
        metadata: {
          filename: metadata.filename,
          oldPath: metadata.path,
          newPath
        }
      });

      return metadata;

    } catch (error) {
      logger.error('File move failed', {
        fileId,
        error: error.message
      });

      throw error instanceof AppError ? error : new AppError(
        'Failed to move file',
        500,
        ERROR_CODES.FILE_MOVE_FAILED,
        { fileId, originalError: error.message }
      );
    }
  }

  /**
   * Copy file
   * @static
   * @param {Object} options - Copy options
   * @param {string} options.fileId - Source file ID
   * @param {string} [options.newPath] - New path
   * @param {string} [options.newFilename] - New filename
   * @param {string} [options.userId] - User ID for audit
   * @param {string} [options.organizationId] - Organization ID
   * @returns {Promise<Object>} New file metadata
   */
  static async copy(options) {
    await this.initialize();

    const { fileId, newPath, newFilename, userId, organizationId } = options;
    const newFileId = this.#generateFileId();

    try {
      // Get source file metadata
      const sourceMetadata = await this.#getFileMetadata(fileId);
      if (!sourceMetadata) {
        throw new AppError(
          'Source file not found',
          404,
          ERROR_CODES.FILE_NOT_FOUND
        );
      }

      // Check permissions
      await this.#checkFilePermissions(sourceMetadata, userId, organizationId, 'read');

      // Download source file
      const fileData = await this.#downloadFromProvider(fileId, sourceMetadata);

      // Upload as new file
      const newMetadata = await this.upload({
        file: fileData,
        filename: newFilename || sourceMetadata.filename,
        path: newPath || sourceMetadata.path,
        metadata: {
          ...sourceMetadata.metadata,
          copiedFrom: fileId
        },
        userId,
        organizationId,
        public: sourceMetadata.public,
        encrypt: sourceMetadata.encrypted
      });

      // Copy thumbnails if exists
      if (sourceMetadata.thumbnails) {
        for (const [size, url] of Object.entries(sourceMetadata.thumbnails)) {
          const thumbData = await this.#downloadFromProvider(`${fileId}_${size}`, sourceMetadata);
          await this.#uploadToProvider({
            fileId: `${newFileId}_${size}`,
            data: thumbData,
            filename: `${size}_${newFilename || sourceMetadata.filename}`,
            path: path.join(newPath || sourceMetadata.path || '', 'thumbnails'),
            mimeType: sourceMetadata.mimeType,
            metadata: {
              parentId: newFileId,
              size: size
            },
            public: sourceMetadata.public
          });
        }
      }

      // Audit log
      await this.#auditLog({
        action: 'file.copied',
        fileId: newFileId,
        userId,
        organizationId,
        metadata: {
          sourceFileId: fileId,
          filename: newMetadata.filename
        }
      });

      return newMetadata;

    } catch (error) {
      logger.error('File copy failed', {
        fileId,
        error: error.message
      });

      throw error instanceof AppError ? error : new AppError(
        'Failed to copy file',
        500,
        ERROR_CODES.FILE_COPY_FAILED,
        { fileId, originalError: error.message }
      );
    }
  }

  /**
   * List files
   * @static
   * @param {Object} options - List options
   * @param {string} [options.path] - Filter by path
   * @param {string} [options.userId] - Filter by user
   * @param {string} [options.organizationId] - Filter by organization
   * @param {number} [options.page=1] - Page number
   * @param {number} [options.pageSize=20] - Page size
   * @param {Object} [options.sort] - Sort options
   * @returns {Promise<Object>} File list
   */
  static async list(options = {}) {
    await this.initialize();

    const {
      path: filterPath,
      userId,
      organizationId,
      page = 1,
      pageSize = 20,
      sort = { field: 'uploadedAt', order: 'desc' }
    } = options;

    try {
      // Get all file metadata from cache
      const allFiles = await this.#getAllFileMetadata();
      
      // Apply filters
      let filtered = allFiles;
      
      if (filterPath) {
        filtered = filtered.filter(file => 
          file.path && file.path.startsWith(filterPath)
        );
      }
      
      if (userId) {
        filtered = filtered.filter(file => file.userId === userId);
      }
      
      if (organizationId) {
        filtered = filtered.filter(file => file.organizationId === organizationId);
      }

      // Remove deleted files
      filtered = filtered.filter(file => !file.deletedAt);

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
      const paginatedFiles = filtered.slice(start, start + pageSize);

      return {
        files: paginatedFiles,
        total: filtered.length,
        page,
        pageSize,
        totalPages: Math.ceil(filtered.length / pageSize)
      };

    } catch (error) {
      logger.error('File list failed', { error: error.message });
      throw new AppError(
        'Failed to list files',
        500,
        ERROR_CODES.FILE_LIST_FAILED,
        { originalError: error.message }
      );
    }
  }

  /**
   * Get file metadata
   * @static
   * @param {string} fileId - File ID
   * @returns {Promise<Object>} File metadata
   */
  static async getMetadata(fileId) {
    await this.initialize();
    
    const metadata = await this.#getFileMetadata(fileId);
    if (!metadata) {
      throw new AppError(
        'File not found',
        404,
        ERROR_CODES.FILE_NOT_FOUND
      );
    }
    
    return metadata;
  }

  /**
   * Update file metadata
   * @static
   * @param {Object} options - Update options
   * @param {string} options.fileId - File ID
   * @param {Object} options.metadata - New metadata
   * @param {string} [options.userId] - User ID for audit
   * @param {string} [options.organizationId] - Organization ID
   * @returns {Promise<Object>} Updated metadata
   */
  static async updateMetadata(options) {
    await this.initialize();

    const { fileId, metadata: newMetadata, userId, organizationId } = options;

    try {
      // Get existing metadata
      const existingMetadata = await this.#getFileMetadata(fileId);
      if (!existingMetadata) {
        throw new AppError(
          'File not found',
          404,
          ERROR_CODES.FILE_NOT_FOUND
        );
      }

      // Check permissions
      await this.#checkFilePermissions(existingMetadata, userId, organizationId, 'write');

      // Update metadata
      const updatedMetadata = {
        ...existingMetadata,
        metadata: {
          ...existingMetadata.metadata,
          ...newMetadata
        },
        updatedAt: new Date(),
        updatedBy: userId
      };

      await this.#cacheService.set(`file:${fileId}`, updatedMetadata, 86400);

      // Audit log
      await this.#auditLog({
        action: 'file.metadata_updated',
        fileId,
        userId,
        organizationId,
        metadata: {
          filename: existingMetadata.filename,
          changes: newMetadata
        }
      });

      return updatedMetadata;

    } catch (error) {
      logger.error('Metadata update failed', {
        fileId,
        error: error.message
      });

      throw error instanceof AppError ? error : new AppError(
        'Failed to update metadata',
        500,
        ERROR_CODES.METADATA_UPDATE_FAILED,
        { fileId, originalError: error.message }
      );
    }
  }

  /**
   * Get upload statistics
   * @static
   * @returns {Object} Upload statistics
   */
  static getStats() {
    const stats = {
      totalUploads: 0,
      totalSize: 0,
      byMimeType: {},
      successRate: 0
    };

    let successCount = 0;

    this.#uploadStats.forEach((typeStats, mimeType) => {
      stats.totalUploads += typeStats.count;
      stats.totalSize += typeStats.totalSize;
      successCount += typeStats.successCount;
      
      stats.byMimeType[mimeType] = {
        count: typeStats.count,
        totalSize: typeStats.totalSize,
        avgSize: typeStats.totalSize / typeStats.count,
        successRate: (typeStats.successCount / typeStats.count) * 100
      };
    });

    stats.successRate = stats.totalUploads > 0 
      ? (successCount / stats.totalUploads) * 100 
      : 0;

    return stats;
  }

  /**
   * Create multer upload middleware
   * @static
   * @param {Object} [options] - Multer options
   * @returns {Object} Multer middleware
   */
  static createUploadMiddleware(options = {}) {
    const storage = multer.memoryStorage();

    const fileFilter = (req, file, cb) => {
      const mimeType = file.mimetype;
      
      if (this.#config.allowedMimeTypes.includes(mimeType)) {
        cb(null, true);
      } else {
        cb(new AppError(
          'File type not allowed',
          400,
          ERROR_CODES.INVALID_FILE_TYPE,
          { mimeType, allowed: this.#config.allowedMimeTypes }
        ));
      }
    };

    return multer({
      storage,
      fileFilter,
      limits: {
        fileSize: options.maxFileSize || this.#config.storage.local.maxFileSize,
        files: options.maxFiles || 10
      },
      ...options
    });
  }

  /**
   * @private
   * Initialize storage providers
   */
  static async #initializeStorageProviders() {
    const storageConfig = this.#config.storage;

    // Local storage
    if (storageConfig.local.enabled) {
      this.#storageProviders.set('local', {
        type: 'local',
        upload: this.#uploadToLocal.bind(this),
        download: this.#downloadFromLocal.bind(this),
        delete: this.#deleteFromLocal.bind(this),
        move: this.#moveInLocal.bind(this)
      });
    }

    // AWS S3
    if (storageConfig.s3.enabled) {
      const s3Service = new AWSS3Service(storageConfig.s3);
      this.#storageProviders.set('s3', {
        type: 's3',
        service: s3Service,
        upload: s3Service.upload.bind(s3Service),
        download: s3Service.download.bind(s3Service),
        delete: s3Service.delete.bind(s3Service),
        move: s3Service.move.bind(s3Service)
      });
    }

    // Azure Blob Storage
    if (storageConfig.azure.enabled) {
      const azureService = new AzureBlobService(storageConfig.azure);
      this.#storageProviders.set('azure', {
        type: 'azure',
        service: azureService,
        upload: azureService.upload.bind(azureService),
        download: azureService.download.bind(azureService),
        delete: azureService.delete.bind(azureService),
        move: azureService.move.bind(azureService)
      });
    }

    // Google Cloud Storage
    if (storageConfig.gcp.enabled) {
      const gcpService = new GCPStorageService(storageConfig.gcp);
      this.#storageProviders.set('gcp', {
        type: 'gcp',
        service: gcpService,
        upload: gcpService.upload.bind(gcpService),
        download: gcpService.download.bind(gcpService),
        delete: gcpService.delete.bind(gcpService),
        move: gcpService.move.bind(gcpService)
      });
    }

    // Set primary provider
    this.#primaryProvider = config.storage?.primaryProvider || 
      Array.from(this.#storageProviders.keys())[0];
  }

  /**
   * @private
   * Validate upload options
   */
  static async #validateUploadOptions(options) {
    const validated = { ...options };

    // Validate file
    if (!validated.file) {
      throw new AppError(
        'File data is required',
        400,
        ERROR_CODES.VALIDATION_ERROR
      );
    }

    // Get file size
    if (Buffer.isBuffer(validated.file)) {
      validated.size = validated.file.length;
    } else if (validated.file.readable) {
      // Stream - estimate size
      validated.size = validated.metadata?.size || 0;
    }

    // Check file size
    if (validated.size > this.#config.storage.local.maxFileSize) {
      throw new AppError(
        'File size exceeds limit',
        400,
        ERROR_CODES.FILE_TOO_LARGE,
        { 
          size: validated.size, 
          maxSize: this.#config.storage.local.maxFileSize 
        }
      );
    }

    // Validate filename
    if (!validated.filename) {
      throw new AppError(
        'Filename is required',
        400,
        ERROR_CODES.VALIDATION_ERROR
      );
    }

    // Sanitize filename
    validated.filename = this.#sanitizeFilename(validated.filename);

    // Detect MIME type
    validated.mimeType = validated.mimeType || 
      mime.lookup(validated.filename) || 
      'application/octet-stream';

    // Check allowed MIME types
    if (!this.#config.allowedMimeTypes.includes(validated.mimeType)) {
      throw new AppError(
        'File type not allowed',
        400,
        ERROR_CODES.INVALID_FILE_TYPE,
        { 
          mimeType: validated.mimeType, 
          allowed: this.#config.allowedMimeTypes 
        }
      );
    }

    // Set encryption preference
    validated.encrypt = validated.encrypt ?? this.#config.encryption.enabled;

    return validated;
  }

  /**
   * @private
   * Upload to provider
   */
  static async #uploadToProvider(options) {
    const provider = this.#storageProviders.get(this.#primaryProvider);
    
    try {
      const result = await provider.upload(options);
      return {
        ...result,
        provider: this.#primaryProvider
      };
    } catch (error) {
      // Try fallback providers
      for (const [name, fallbackProvider] of this.#storageProviders) {
        if (name !== this.#primaryProvider) {
          try {
            const result = await fallbackProvider.upload(options);
            return {
              ...result,
              provider: name
            };
          } catch (fallbackError) {
            logger.warn('Fallback provider failed', {
              provider: name,
              error: fallbackError.message
            });
          }
        }
      }
      throw error;
    }
  }

  /**
   * @private
   * Download from provider
   */
  static async #downloadFromProvider(fileId, metadata) {
    const provider = this.#storageProviders.get(
      metadata.provider || this.#primaryProvider
    );
    
    return await provider.download({ fileId, metadata });
  }

  /**
   * @private
   * Delete from provider
   */
  static async #deleteFromProvider(fileId, metadata) {
    const provider = this.#storageProviders.get(
      metadata.provider || this.#primaryProvider
    );
    
    return await provider.delete({ fileId, metadata });
  }

  /**
   * @private
   * Move in provider
   */
  static async #moveInProvider(fileId, metadata, newPath) {
    const provider = this.#storageProviders.get(
      metadata.provider || this.#primaryProvider
    );
    
    return await provider.move({ fileId, metadata, newPath });
  }

  /**
   * @private
   * Local storage methods
   */
  static async #uploadToLocal(options) {
    const { fileId, data, filename, path: filePath } = options;
    const basePath = this.#config.storage.local.basePath;
    const directory = path.join(basePath, filePath || '');
    const fullPath = path.join(directory, `${fileId}_${filename}`);

    await fs.ensureDir(directory);
    
    if (Buffer.isBuffer(data)) {
      await fs.writeFile(fullPath, data);
    } else if (data.readable) {
      await pipeline(data, fs.createWriteStream(fullPath));
    }

    return {
      url: `/files/${fileId}`,
      path: fullPath
    };
  }

  static async #downloadFromLocal(options) {
    const { fileId, metadata } = options;
    const filename = `${fileId}_${metadata.filename}`;
    const fullPath = path.join(
      this.#config.storage.local.basePath,
      metadata.path || '',
      filename
    );

    return await fs.readFile(fullPath);
  }

  static async #deleteFromLocal(options) {
    const { fileId, metadata } = options;
    const filename = `${fileId}_${metadata.filename}`;
    const fullPath = path.join(
      this.#config.storage.local.basePath,
      metadata.path || '',
      filename
    );

    await fs.remove(fullPath);
    return true;
  }

  static async #moveInLocal(options) {
    const { fileId, metadata, newPath } = options;
    const filename = `${fileId}_${metadata.filename}`;
    const oldPath = path.join(
      this.#config.storage.local.basePath,
      metadata.path || '',
      filename
    );
    const newFullPath = path.join(
      this.#config.storage.local.basePath,
      newPath,
      filename
    );

    await fs.ensureDir(path.dirname(newFullPath));
    await fs.move(oldPath, newFullPath);
    return true;
  }

  /**
   * @private
   * Process image
   */
  static async #processImage(fileData, filename, options = {}) {
    const processed = {};
    const image = sharp(fileData);
    const metadata = await image.metadata();

    for (const size of this.#config.imageProcessing.thumbnailSizes) {
      const resized = await image
        .resize({
          width: size.width,
          height: size.height,
          fit: options.fit || 'inside',
          withoutEnlargement: true
        })
        .toBuffer();

      processed[size.name] = {
        buffer: resized,
        dimensions: {
          width: Math.min(size.width, metadata.width),
          height: Math.min(size.height, metadata.height)
        }
      };
    }

    return processed;
  }

  /**
   * @private
   * Encrypt file
   */
  static async #encryptFile(data) {
    const encrypted = await this.#encryptionService.encryptBuffer(data);
    return {
      data: encrypted.encryptedData,
      metadata: {
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        algorithm: this.#config.encryption.algorithm
      }
    };
  }

  /**
   * @private
   * Decrypt file
   */
  static async #decryptFile(data, encryptionMetadata) {
    return await this.#encryptionService.decryptBuffer(
      data,
      encryptionMetadata.iv,
      encryptionMetadata.authTag
    );
  }

  /**
   * @private
   * Scan for virus
   */
  static async #scanForVirus(fileData) {
    // Implement virus scanning logic
    // This is a placeholder - integrate with actual antivirus service
    logger.debug('Virus scan performed (placeholder)');
    return true;
  }

  /**
   * @private
   * Get file metadata
   */
  static async #getFileMetadata(fileId) {
    return await this.#cacheService.get(`file:${fileId}`);
  }

  /**
   * @private
   * Get all file metadata
   */
  static async #getAllFileMetadata() {
    const keys = await this.#cacheService.keys('file:*');
    const files = [];
    
    for (const key of keys) {
      const metadata = await this.#cacheService.get(key);
      if (metadata) {
        files.push(metadata);
      }
    }
    
    return files;
  }

  /**
   * @private
   * Check file permissions
   */
  static async #checkFilePermissions(metadata, userId, organizationId, action = 'read') {
    // Implement permission checking logic based on your requirements
    // This is a basic implementation
    
    if (metadata.public && action === 'read') {
      return true;
    }

    if (metadata.userId === userId) {
      return true;
    }

    if (metadata.organizationId === organizationId) {
      return true;
    }

    throw new AppError(
      'Access denied',
      403,
      ERROR_CODES.ACCESS_DENIED
    );
  }

  /**
   * @private
   * Audit log
   */
  static async #auditLog(data) {
    try {
      await AuditLogModel.create({
        action: data.action,
        resource: 'file',
        resourceId: data.fileId,
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
   * Update upload statistics
   */
  static #updateUploadStats(mimeType, size, success) {
    if (!this.#uploadStats.has(mimeType)) {
      this.#uploadStats.set(mimeType, {
        count: 0,
        successCount: 0,
        totalSize: 0
      });
    }

    const stats = this.#uploadStats.get(mimeType);
    stats.count++;
    if (success) {
      stats.successCount++;
      stats.totalSize += size;
    }
  }

  /**
   * @private
   * Generate file ID
   */
  static #generateFileId() {
    return `file_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * @private
   * Sanitize filename
   */
  static #sanitizeFilename(filename) {
    return filename
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .replace(/_{2,}/g, '_')
      .toLowerCase();
  }

  /**
   * @private
   * Check if file is image
   */
  static #isImage(mimeType) {
    return mimeType.startsWith('image/');
  }

  /**
   * @private
   * Get queue key for deduplication
   */
  static #getQueueKey(filename, metadata) {
    const hash = crypto.createHash('sha256')
      .update(filename)
      .update(JSON.stringify(metadata || {}))
      .digest('hex');
    return hash.substring(0, 16);
  }
}

module.exports = FileService;