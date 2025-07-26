'use strict';

/**
 * @fileoverview Google Cloud Storage integration service
 * @module shared/lib/integrations/storage/gcp-storage-service
 * @requires module:@google-cloud/storage
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/constants/error-codes
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/security/encryption/encryption-service
 * @requires module:shared/lib/utils/helpers/file-helper
 */

const { Storage } = require('@google-cloud/storage');
const logger = require('../../utils/logger');
const AppError = require('../../utils/app-error');
const { ERROR_CODES } = require('../../utils/constants/error-codes');
const CacheService = require('../../services/cache-service');
const EncryptionService = require('../../security/encryption/encryption-service');
const fileHelper = require('../../utils/helpers/file-helper');

/**
 * @class GCPStorageService
 * @description Handles object storage operations using Google Cloud Storage
 * Implements enterprise-grade file management with advanced GCS features
 */
class GCPStorageService {
  /**
   * @private
   * @type {Object}
   * @description Service configuration
   */
  #config;

  /**
   * @private
   * @type {Storage}
   * @description Google Cloud Storage client instance
   */
  #storage;

  /**
   * @private
   * @type {Object}
   * @description Bucket instance
   */
  #bucket;

  /**
   * @private
   * @type {CacheService}
   * @description Cache service for URL and metadata caching
   */
  #cacheService;

  /**
   * @private
   * @type {EncryptionService}
   * @description Encryption service for sensitive data
   */
  #encryptionService;

  /**
   * @private
   * @type {Map}
   * @description Active upload tracking
   */
  #activeUploads;

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description Default configuration values
   */
  static #DEFAULT_CONFIG = {
    maxRetries: 3,
    retryDelayMultiplier: 2,
    totalTimeout: 300000, // 5 minutes
    initialRetryDelayMillis: 1000,
    maxRetryDelayMillis: 60000,
    resumable: true,
    multipartThreshold: 5 * 1024 * 1024, // 5MB
    chunkSize: 8 * 1024 * 1024, // 8MB
    signedUrlExpiry: 3600, // 1 hour
    cacheTTL: {
      signedUrl: 3300, // 55 minutes
      metadata: 300, // 5 minutes
      acl: 600 // 10 minutes
    },
    defaultStorageClass: 'STANDARD',
    defaultCacheControl: 'private, max-age=0',
    predefinedAcl: 'private',
    uniformBucketLevelAccess: false
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description GCS storage classes
   */
  static #STORAGE_CLASSES = {
    STANDARD: 'STANDARD',
    NEARLINE: 'NEARLINE',
    COLDLINE: 'COLDLINE',
    ARCHIVE: 'ARCHIVE'
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description Predefined ACLs
   */
  static #PREDEFINED_ACLS = {
    AUTHENTICATED_READ: 'authenticatedRead',
    BUCKET_OWNER_FULL_CONTROL: 'bucketOwnerFullControl',
    BUCKET_OWNER_READ: 'bucketOwnerRead',
    PRIVATE: 'private',
    PROJECT_PRIVATE: 'projectPrivate',
    PUBLIC_READ: 'publicRead'
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description Signed URL actions
   */
  static #SIGNED_URL_ACTIONS = {
    READ: 'read',
    WRITE: 'write',
    DELETE: 'delete',
    RESUMABLE: 'resumable'
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description Allowed file types and their MIME types
   */
  static #ALLOWED_FILE_TYPES = {
    // Images
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'svg': 'image/svg+xml',
    'bmp': 'image/bmp',
    'tiff': 'image/tiff',
    'ico': 'image/x-icon',
    
    // Documents
    'pdf': 'application/pdf',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls': 'application/vnd.ms-excel',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'ppt': 'application/vnd.ms-powerpoint',
    'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'odt': 'application/vnd.oasis.opendocument.text',
    'ods': 'application/vnd.oasis.opendocument.spreadsheet',
    
    // Text
    'txt': 'text/plain',
    'csv': 'text/csv',
    'json': 'application/json',
    'xml': 'application/xml',
    'html': 'text/html',
    'css': 'text/css',
    'js': 'application/javascript',
    'md': 'text/markdown',
    
    // Archives
    'zip': 'application/zip',
    'rar': 'application/x-rar-compressed',
    '7z': 'application/x-7z-compressed',
    'tar': 'application/x-tar',
    'gz': 'application/gzip',
    'bz2': 'application/x-bzip2',
    
    // Media
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
    'ogg': 'audio/ogg',
    'mp4': 'video/mp4',
    'avi': 'video/x-msvideo',
    'mov': 'video/quicktime',
    'wmv': 'video/x-ms-wmv',
    'flv': 'video/x-flv',
    'webm': 'video/webm'
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description GCS error mappings
   */
  static #GCS_ERRORS = {
    404: 'The specified object does not exist',
    403: 'Access denied to the resource',
    401: 'Authentication required',
    409: 'Conflict - resource already exists',
    412: 'Precondition failed',
    413: 'Request entity too large',
    429: 'Too many requests',
    500: 'Internal server error',
    503: 'Service unavailable'
  };

  /**
   * Creates a new GCPStorageService instance
   * @param {Object} config - Service configuration
   * @param {string|Object} config.keyFilename - Path to service account key file or credentials object
   * @param {string} config.bucketName - GCS bucket name
   * @param {string} [config.projectId] - GCP project ID
   * @param {Object} [config.allowedFileTypes] - Allowed file types
   * @param {number} [config.maxFileSize] - Maximum file size in bytes
   * @param {string} [config.defaultStorageClass='STANDARD'] - Default storage class
   * @param {string} [config.location='us'] - Bucket location for creation
   * @param {boolean} [config.uniformBucketLevelAccess=false] - Enable uniform bucket access
   * @param {CacheService} [cacheService] - Cache service instance
   * @param {EncryptionService} [encryptionService] - Encryption service instance
   * @throws {AppError} If configuration is invalid
   */
  constructor(config, cacheService, encryptionService) {
    try {
      if (!config?.keyFilename) {
        throw new AppError(
          'GCS credentials are required (keyFilename)',
          400,
          ERROR_CODES.CONFIGURATION_ERROR,
          { service: 'GCPStorageService' }
        );
      }

      if (!config.bucketName) {
        throw new AppError(
          'GCS bucket name is required',
          400,
          ERROR_CODES.CONFIGURATION_ERROR,
          { field: 'bucketName' }
        );
      }

      this.#config = {
        ...GCPStorageService.#DEFAULT_CONFIG,
        ...config,
        allowedFileTypes: config.allowedFileTypes || GCPStorageService.#ALLOWED_FILE_TYPES
      };

      this.#cacheService = cacheService || new CacheService();
      this.#encryptionService = encryptionService || new EncryptionService();
      this.#activeUploads = new Map();

      // Initialize GCS client
      const storageOptions = {
        retryOptions: {
          autoRetry: true,
          maxRetries: this.#config.maxRetries,
          retryDelayMultiplier: this.#config.retryDelayMultiplier,
          totalTimeout: this.#config.totalTimeout,
          initialRetryDelayMillis: this.#config.initialRetryDelayMillis,
          maxRetryDelayMillis: this.#config.maxRetryDelayMillis
        }
      };

      // Handle credentials
      if (typeof config.keyFilename === 'string') {
        storageOptions.keyFilename = config.keyFilename;
      } else if (typeof config.keyFilename === 'object') {
        storageOptions.credentials = config.keyFilename;
      }

      if (config.projectId) {
        storageOptions.projectId = config.projectId;
      }

      this.#storage = new Storage(storageOptions);
      this.#bucket = this.#storage.bucket(this.#config.bucketName);

      logger.info('GCPStorageService initialized', {
        bucketName: this.#config.bucketName,
        projectId: config.projectId,
        defaultStorageClass: this.#config.defaultStorageClass
      });

      // Ensure bucket exists
      this.#ensureBucket().catch(error => {
        logger.warn('Failed to ensure bucket exists', { error: error.message });
      });

    } catch (error) {
      logger.error('GCPStorageService initialization failed', error);
      throw error instanceof AppError ? error : new AppError(
        'Failed to initialize GCP Storage service',
        500,
        ERROR_CODES.INITIALIZATION_ERROR,
        { originalError: error.message }
      );
    }
  }

  /**
   * Uploads a file to GCS
   * @param {Object} fileData - File upload data
   * @param {Buffer|Stream|string} fileData.content - File content
   * @param {string} fileData.fileName - File name (path in bucket)
   * @param {string} [fileData.contentType] - MIME type
   * @param {Object} [fileData.metadata] - Custom metadata
   * @param {string} [fileData.storageClass] - Storage class
   * @param {string} [fileData.cacheControl] - Cache control header
   * @param {string} [fileData.contentDisposition] - Content disposition
   * @param {string} [fileData.contentEncoding] - Content encoding
   * @param {Object} [options] - Upload options
   * @param {boolean} [options.resumable=auto] - Use resumable upload
   * @param {boolean} [options.gzip=false] - Gzip file content
   * @param {Function} [options.onProgress] - Progress callback
   * @param {string} [options.predefinedAcl] - Predefined ACL
   * @param {string} [options.correlationId] - Tracking ID
   * @returns {Promise<Object>} Upload result with file details
   * @throws {AppError} If upload fails
   */
  async uploadFile(fileData, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();
    const startTime = Date.now();

    try {
      logger.info('Starting file upload to GCS', {
        correlationId,
        fileName: fileData.fileName,
        bucket: this.#config.bucketName,
        contentType: fileData.contentType
      });

      // Validate file
      await this.#validateFile(fileData);

      // Get file reference
      const file = this.#bucket.file(fileData.fileName);

      // Prepare upload options
      const uploadOptions = {
        metadata: {
          contentType: fileData.contentType || 'application/octet-stream',
          cacheControl: fileData.cacheControl || this.#config.defaultCacheControl,
          contentDisposition: fileData.contentDisposition,
          contentEncoding: fileData.contentEncoding,
          storageClass: fileData.storageClass || this.#config.defaultStorageClass,
          metadata: {
            ...fileData.metadata,
            uploadedAt: new Date().toISOString(),
            correlationId
          }
        },
        resumable: this.#shouldUseResumable(fileData, options),
        gzip: options.gzip || false,
        predefinedAcl: options.predefinedAcl || this.#config.predefinedAcl
      };

      // Handle validation
      if (options.validation !== undefined) {
        uploadOptions.validation = options.validation;
      }

      // Track upload
      const uploadId = this.#generateUploadId();
      this.#activeUploads.set(uploadId, {
        fileName: fileData.fileName,
        startTime: Date.now()
      });

      // Create write stream
      const stream = file.createWriteStream(uploadOptions);

      // Handle progress events
      if (options.onProgress) {
        let uploadedBytes = 0;
        stream.on('progress', (progress) => {
          uploadedBytes = progress.bytesWritten || uploadedBytes;
          options.onProgress({
            bytesWritten: uploadedBytes,
            totalBytes: fileData.size || 0,
            percentage: fileData.size ? (uploadedBytes / fileData.size) * 100 : 0
          });
        });
      }

      // Upload file
      const uploadResult = await new Promise((resolve, reject) => {
        stream.on('error', (error) => {
          this.#activeUploads.delete(uploadId);
          reject(error);
        });

        stream.on('finish', () => {
          this.#activeUploads.delete(uploadId);
          resolve({
            success: true
          });
        });

        // Write content to stream
        if (Buffer.isBuffer(fileData.content)) {
          stream.end(fileData.content);
        } else if (fileData.content.pipe) {
          fileData.content.pipe(stream);
        } else {
          stream.end(Buffer.from(fileData.content));
        }
      });

      // Get file metadata after upload
      const [metadata] = await file.getMetadata();

      const duration = Date.now() - startTime;
      logger.info('File uploaded successfully to GCS', {
        correlationId,
        fileName: fileData.fileName,
        generation: metadata.generation,
        size: metadata.size,
        duration
      });

      return {
        success: true,
        fileName: fileData.fileName,
        bucket: this.#config.bucketName,
        generation: metadata.generation,
        size: metadata.size,
        md5Hash: metadata.md5Hash,
        crc32c: metadata.crc32c,
        etag: metadata.etag,
        selfLink: metadata.selfLink,
        mediaLink: metadata.mediaLink,
        contentType: metadata.contentType,
        storageClass: metadata.storageClass,
        timeCreated: metadata.timeCreated,
        uploadedAt: new Date().toISOString(),
        duration,
        correlationId
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('File upload to GCS failed', {
        correlationId,
        fileName: fileData.fileName,
        duration,
        error: error.message
      });

      throw this.#handleGCSError(error, correlationId);
    }
  }

  /**
   * Downloads a file from GCS
   * @param {string} fileName - File name in bucket
   * @param {Object} [options] - Download options
   * @param {boolean} [options.asStream=false] - Return as stream
   * @param {number} [options.start] - Start byte offset
   * @param {number} [options.end] - End byte offset
   * @param {string} [options.generation] - File generation
   * @returns {Promise<Object>} File data and metadata
   * @throws {AppError} If download fails
   */
  async downloadFile(fileName, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      logger.info('Downloading file from GCS', {
        correlationId,
        fileName,
        bucket: this.#config.bucketName
      });

      const file = this.#bucket.file(fileName);

      // Check if file exists
      const [exists] = await file.exists();
      if (!exists) {
        throw new AppError(
          'File not found',
          404,
          ERROR_CODES.NOT_FOUND,
          { fileName, bucket: this.#config.bucketName }
        );
      }

      // Get metadata
      const [metadata] = await file.getMetadata();

      // Download options
      const downloadOptions = {};
      if (options.start !== undefined) downloadOptions.start = options.start;
      if (options.end !== undefined) downloadOptions.end = options.end;
      if (options.generation) downloadOptions.generation = options.generation;

      let content;
      if (options.asStream) {
        content = file.createReadStream(downloadOptions);
      } else {
        // Download to buffer
        const [buffer] = await file.download(downloadOptions);
        content = buffer;
      }

      logger.info('File downloaded successfully from GCS', {
        correlationId,
        fileName,
        size: metadata.size
      });

      return {
        content,
        metadata: {
          fileName,
          size: metadata.size,
          contentType: metadata.contentType,
          md5Hash: metadata.md5Hash,
          crc32c: metadata.crc32c,
          etag: metadata.etag,
          generation: metadata.generation,
          storageClass: metadata.storageClass,
          timeCreated: metadata.timeCreated,
          updated: metadata.updated,
          cacheControl: metadata.cacheControl,
          contentDisposition: metadata.contentDisposition,
          contentEncoding: metadata.contentEncoding,
          customMetadata: metadata.metadata
        }
      };

    } catch (error) {
      logger.error('File download from GCS failed', {
        correlationId,
        fileName,
        error: error.message
      });

      throw this.#handleGCSError(error, correlationId);
    }
  }

  /**
   * Deletes a file or multiple files from GCS
   * @param {string|Array<string>} fileNames - File name(s)
   * @param {Object} [options] - Delete options
   * @param {boolean} [options.ignoreNotFound=false] - Ignore if files don't exist
   * @returns {Promise<Object>} Deletion result
   * @throws {AppError} If deletion fails
   */
  async deleteFile(fileNames, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();
    const isMultiple = Array.isArray(fileNames);

    try {
      logger.info('Deleting file(s) from GCS', {
        correlationId,
        count: isMultiple ? fileNames.length : 1,
        bucket: this.#config.bucketName
      });

      let result;
      if (isMultiple) {
        result = await this.#deleteMultipleFiles(fileNames, options);
      } else {
        result = await this.#deleteSingleFile(fileNames, options);
      }

      logger.info('File(s) deleted successfully from GCS', {
        correlationId,
        deleted: result.deleted,
        errors: result.errors?.length || 0
      });

      return result;

    } catch (error) {
      logger.error('File deletion from GCS failed', {
        correlationId,
        error: error.message
      });

      throw this.#handleGCSError(error, correlationId);
    }
  }

  /**
   * Generates a signed URL for file access
   * @param {string} fileName - File name in bucket
   * @param {Object} [options] - Signed URL options
   * @param {string} [options.action='read'] - Action (read, write, delete, resumable)
   * @param {number} [options.expires=3600000] - Expiry in milliseconds
   * @param {string} [options.contentType] - Required content type for uploads
   * @param {Object} [options.extensionHeaders] - Additional headers
   * @param {string} [options.promptSaveAs] - Filename for Content-Disposition
   * @param {string} [options.responseType] - Response content type override
   * @returns {Promise<Object>} Signed URL and metadata
   * @throws {AppError} If URL generation fails
   */
  async getPresignedUrl(fileName, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      // Check cache first
      const cacheKey = `gcs:signed:${this.#config.bucketName}:${fileName}:${options.action || 'read'}`;
      const cached = await this.#cacheService.get(cacheKey);
      
      if (cached && options.useCache !== false) {
        logger.debug('Signed URL retrieved from cache', { correlationId, fileName });
        return cached;
      }

      logger.info('Generating signed URL for GCS', {
        correlationId,
        fileName,
        action: options.action || 'read',
        expires: options.expires || this.#config.signedUrlExpiry * 1000
      });

      const file = this.#bucket.file(fileName);

      // Prepare signed URL options
      const expires = Date.now() + (options.expires || this.#config.signedUrlExpiry * 1000);
      const signedUrlOptions = {
        version: 'v4',
        action: options.action || GCPStorageService.#SIGNED_URL_ACTIONS.READ,
        expires
      };

      // Add optional parameters
      if (options.contentType) {
        signedUrlOptions.contentType = options.contentType;
      }

      if (options.extensionHeaders) {
        signedUrlOptions.extensionHeaders = options.extensionHeaders;
      }

      if (options.promptSaveAs) {
        signedUrlOptions.promptSaveAs = options.promptSaveAs;
      }

      if (options.responseType) {
        signedUrlOptions.responseType = options.responseType;
      }

      // Generate signed URL
      const [url] = await file.getSignedUrl(signedUrlOptions);

      const result = {
        url,
        expires: new Date(expires).toISOString(),
        action: signedUrlOptions.action,
        fileName,
        bucket: this.#config.bucketName
      };

      // Cache the URL
      const cacheTTL = Math.min(
        (expires - Date.now()) / 1000 - 300,
        this.#config.cacheTTL.signedUrl
      );
      await this.#cacheService.set(cacheKey, result, cacheTTL);

      return result;

    } catch (error) {
      logger.error('Signed URL generation failed', {
        correlationId,
        fileName,
        error: error.message
      });

      throw this.#handleGCSError(error, correlationId);
    }
  }

  /**
   * Gets file metadata without downloading content
   * @param {string} fileName - File name in bucket
   * @param {Object} [options] - Metadata options
   * @returns {Promise<Object>} File metadata
   * @throws {AppError} If metadata retrieval fails
   */
  async getFileMetadata(fileName, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      // Check cache first
      const cacheKey = `gcs:metadata:${this.#config.bucketName}:${fileName}`;
      const cached = await this.#cacheService.get(cacheKey);
      
      if (cached && options.useCache !== false) {
        logger.debug('File metadata retrieved from cache', { correlationId, fileName });
        return cached;
      }

      logger.info('Retrieving file metadata from GCS', {
        correlationId,
        fileName,
        bucket: this.#config.bucketName
      });

      const file = this.#bucket.file(fileName);
      const [metadata] = await file.getMetadata();

      const formattedMetadata = {
        fileName,
        bucket: this.#config.bucketName,
        size: metadata.size,
        contentType: metadata.contentType,
        md5Hash: metadata.md5Hash,
        crc32c: metadata.crc32c,
        etag: metadata.etag,
        generation: metadata.generation,
        metageneration: metadata.metageneration,
        storageClass: metadata.storageClass,
        timeCreated: metadata.timeCreated,
        updated: metadata.updated,
        timeStorageClassUpdated: metadata.timeStorageClassUpdated,
        cacheControl: metadata.cacheControl,
        contentDisposition: metadata.contentDisposition,
        contentEncoding: metadata.contentEncoding,
        contentLanguage: metadata.contentLanguage,
        customMetadata: metadata.metadata,
        owner: metadata.owner,
        customerEncryption: metadata.customerEncryption ? {
          encryptionAlgorithm: metadata.customerEncryption.encryptionAlgorithm
        } : null
      };

      // Cache metadata
      await this.#cacheService.set(cacheKey, formattedMetadata, this.#config.cacheTTL.metadata);

      return formattedMetadata;

    } catch (error) {
      logger.error('File metadata retrieval failed', {
        correlationId,
        fileName,
        error: error.message
      });

      throw this.#handleGCSError(error, correlationId);
    }
  }

  /**
   * Lists files in the bucket
   * @param {Object} [options] - List options
   * @param {string} [options.prefix] - File name prefix
   * @param {string} [options.delimiter] - Delimiter for directory grouping
   * @param {number} [options.maxResults=1000] - Maximum results
   * @param {string} [options.pageToken] - Page token for pagination
   * @param {boolean} [options.autoPaginate=false] - Auto-paginate through all results
   * @returns {Promise<Object>} List of files and metadata
   * @throws {AppError} If listing fails
   */
  async listFiles(options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      logger.info('Listing files in GCS bucket', {
        correlationId,
        bucket: this.#config.bucketName,
        prefix: options.prefix,
        maxResults: options.maxResults
      });

      const query = {
        prefix: options.prefix,
        delimiter: options.delimiter,
        maxResults: options.maxResults || 1000,
        pageToken: options.pageToken,
        autoPaginate: options.autoPaginate || false
      };

      const [files, nextQuery] = await this.#bucket.getFiles(query);

      const formattedFiles = files.map(file => ({
        name: file.name,
        bucket: file.bucket.name,
        size: parseInt(file.metadata.size),
        contentType: file.metadata.contentType,
        timeCreated: file.metadata.timeCreated,
        updated: file.metadata.updated,
        generation: file.metadata.generation,
        md5Hash: file.metadata.md5Hash,
        crc32c: file.metadata.crc32c,
        storageClass: file.metadata.storageClass
      }));

      const result = {
        files: formattedFiles,
        nextPageToken: nextQuery?.pageToken
      };

      // If delimiter was used, get prefixes (directories)
      if (options.delimiter) {
        const [, , apiResponse] = await this.#bucket.getFiles(query);
        if (apiResponse.prefixes) {
          result.prefixes = apiResponse.prefixes;
        }
      }

      return result;

    } catch (error) {
      logger.error('File listing failed', {
        correlationId,
        error: error.message
      });

      throw this.#handleGCSError(error, correlationId);
    }
  }

  /**
   * Copies a file within GCS
   * @param {Object} copyData - Copy operation data
   * @param {string} copyData.sourceFileName - Source file name
   * @param {string} copyData.destinationFileName - Destination file name
   * @param {string} [copyData.sourceBucket] - Source bucket
   * @param {string} [copyData.destinationBucket] - Destination bucket
   * @param {Object} [copyData.metadata] - New metadata
   * @param {string} [copyData.storageClass] - New storage class
   * @param {Object} [options] - Copy options
   * @returns {Promise<Object>} Copy result
   * @throws {AppError} If copy fails
   */
  async copyFile(copyData, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      logger.info('Copying file in GCS', {
        correlationId,
        sourceFileName: copyData.sourceFileName,
        destinationFileName: copyData.destinationFileName
      });

      const sourceBucket = copyData.sourceBucket || this.#config.bucketName;
      const destinationBucket = copyData.destinationBucket || this.#config.bucketName;

      const sourceFile = this.#storage.bucket(sourceBucket).file(copyData.sourceFileName);
      const destinationFile = this.#storage.bucket(destinationBucket).file(copyData.destinationFileName);

      const copyOptions = {};
      
      if (copyData.metadata) {
        copyOptions.metadata = copyData.metadata;
      }

      if (copyData.storageClass) {
        copyOptions.storageClass = copyData.storageClass;
      }

      const [copiedFile, apiResponse] = await sourceFile.copy(destinationFile, copyOptions);

      logger.info('File copied successfully in GCS', {
        correlationId,
        sourceFileName: copyData.sourceFileName,
        destinationFileName: copyData.destinationFileName
      });

      return {
        success: true,
        sourceFileName: copyData.sourceFileName,
        destinationFileName: copyData.destinationFileName,
        sourceBucket,
        destinationBucket,
        generation: copiedFile.metadata.generation,
        size: copiedFile.metadata.size
      };

    } catch (error) {
      logger.error('File copy failed', {
        correlationId,
        error: error.message
      });

      throw this.#handleGCSError(error, correlationId);
    }
  }

  /**
   * Updates file metadata or storage class
   * @param {string} fileName - File name
   * @param {Object} updates - Update data
   * @param {Object} [updates.metadata] - New metadata
   * @param {string} [updates.storageClass] - New storage class
   * @param {string} [updates.cacheControl] - New cache control
   * @param {string} [updates.contentType] - New content type
   * @param {string} [updates.contentDisposition] - New content disposition
   * @param {Object} [options] - Update options
   * @returns {Promise<Object>} Update result
   * @throws {AppError} If update fails
   */
  async updateFileMetadata(fileName, updates, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      logger.info('Updating file metadata in GCS', {
        correlationId,
        fileName,
        updates: Object.keys(updates)
      });

      const file = this.#bucket.file(fileName);
      
      const metadata = {};

      if (updates.metadata) {
        metadata.metadata = updates.metadata;
      }

      if (updates.storageClass) {
        metadata.storageClass = updates.storageClass;
      }

      if (updates.cacheControl) {
        metadata.cacheControl = updates.cacheControl;
      }

      if (updates.contentType) {
        metadata.contentType = updates.contentType;
      }

      if (updates.contentDisposition) {
        metadata.contentDisposition = updates.contentDisposition;
      }

      const [updatedMetadata] = await file.setMetadata(metadata);

      // Clear metadata cache
      await this.#cacheService.delete(`gcs:metadata:${this.#config.bucketName}:${fileName}`);

      logger.info('File metadata updated successfully', {
        correlationId,
        fileName
      });

      return {
        success: true,
        fileName,
        updatedMetadata: {
          generation: updatedMetadata.generation,
          metageneration: updatedMetadata.metageneration,
          updated: updatedMetadata.updated
        }
      };

    } catch (error) {
      logger.error('File metadata update failed', {
        correlationId,
        fileName,
        error: error.message
      });

      throw this.#handleGCSError(error, correlationId);
    }
  }

  /**
   * Makes a file public or private
   * @param {string} fileName - File name
   * @param {boolean} isPublic - Make public (true) or private (false)
   * @param {Object} [options] - Access options
   * @returns {Promise<Object>} Access update result
   * @throws {AppError} If access update fails
   */
  async updateFileAccess(fileName, isPublic, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      logger.info('Updating file access in GCS', {
        correlationId,
        fileName,
        isPublic
      });

      const file = this.#bucket.file(fileName);

      if (isPublic) {
        await file.makePublic();
      } else {
        await file.makePrivate();
      }

      // Clear ACL cache
      await this.#cacheService.delete(`gcs:acl:${this.#config.bucketName}:${fileName}`);

      logger.info('File access updated successfully', {
        correlationId,
        fileName,
        isPublic
      });

      return {
        success: true,
        fileName,
        isPublic,
        publicUrl: isPublic ? `https://storage.googleapis.com/${this.#config.bucketName}/${fileName}` : null
      };

    } catch (error) {
      logger.error('File access update failed', {
        correlationId,
        fileName,
        error: error.message
      });

      throw this.#handleGCSError(error, correlationId);
    }
  }

  /**
   * @private
   * Ensures bucket exists
   */
  async #ensureBucket() {
    try {
      const [exists] = await this.#bucket.exists();
      
      if (!exists && this.#config.createBucketIfNotExists) {
        logger.info('Creating GCS bucket', {
          bucketName: this.#config.bucketName
        });
        
        const createOptions = {
          location: this.#config.location || 'US',
          storageClass: this.#config.defaultStorageClass
        };

        if (this.#config.uniformBucketLevelAccess) {
          createOptions.iamConfiguration = {
            uniformBucketLevelAccess: {
              enabled: true
            }
          };
        }

        await this.#storage.createBucket(this.#config.bucketName, createOptions);
      }
    } catch (error) {
      logger.error('Bucket check/creation failed', error);
    }
  }

  /**
   * @private
   * Determines if resumable upload should be used
   */
  #shouldUseResumable(fileData, options) {
    if (options.resumable !== undefined) {
      return options.resumable;
    }

    const fileSize = fileData.size || 0;
    return fileSize > this.#config.multipartThreshold;
  }

  /**
   * @private
   * Deletes a single file
   */
  async #deleteSingleFile(fileName, options) {
    const file = this.#bucket.file(fileName);
    
    try {
      await file.delete({ ignoreNotFound: options.ignoreNotFound });
      
      // Clear caches
      await this.#clearFileCaches(fileName);

      return {
        success: true,
        deleted: 1,
        fileName
      };
    } catch (error) {
      if (error.code === 404 && options.ignoreNotFound) {
        return {
          success: true,
          deleted: 0,
          fileName
        };
      }
      throw error;
    }
  }

  /**
   * @private
   * Deletes multiple files
   */
  async #deleteMultipleFiles(fileNames, options) {
    const results = {
      deleted: 0,
      errors: []
    };

    // GCS doesn't have batch delete, so delete individually
    for (const fileName of fileNames) {
      try {
        const result = await this.#deleteSingleFile(fileName, options);
        results.deleted += result.deleted;
      } catch (error) {
        results.errors.push({
          fileName,
          error: error.message
        });
      }
    }

    return {
      success: results.errors.length === 0,
      deleted: results.deleted,
      errors: results.errors
    };
  }

  /**
   * @private
   * Validates file before upload
   */
  async #validateFile(fileData) {
    const errors = [];

    // Validate file name
    if (!fileData.fileName || fileData.fileName.length === 0) {
      errors.push('File name is required');
    } else if (fileData.fileName.length > 1024) {
      errors.push('File name exceeds maximum length of 1024 characters');
    }

    // Validate content
    if (!fileData.content) {
      errors.push('File content is required');
    }

    // Validate file type
    if (fileData.contentType) {
      const extension = fileData.fileName.split('.').pop().toLowerCase();
      const allowedMimeType = this.#config.allowedFileTypes[extension];
      
      if (!allowedMimeType) {
        errors.push(`File type '${extension}' is not allowed`);
      } else if (allowedMimeType !== fileData.contentType && fileData.contentType !== 'application/octet-stream') {
        errors.push(`Invalid content type for file extension '${extension}'`);
      }
    }

    // Validate file size
    if (this.#config.maxFileSize) {
      const fileSize = await this.#getFileSize(fileData.content);
      if (fileSize > this.#config.maxFileSize) {
        errors.push(`File size exceeds maximum allowed size of ${this.#config.maxFileSize} bytes`);
      }
      fileData.size = fileSize;
    }

    if (errors.length > 0) {
      throw new AppError(
        'File validation failed',
        400,
        ERROR_CODES.VALIDATION_ERROR,
        { errors }
      );
    }
  }

  /**
   * @private
   * Gets file size from various input types
   */
  async #getFileSize(content) {
    if (Buffer.isBuffer(content)) {
      return content.length;
    } else if (typeof content === 'string') {
      return Buffer.byteLength(content);
    } else if (content.length !== undefined) {
      return content.length;
    } else {
      // For streams, we can't determine size without consuming
      return 0;
    }
  }

  /**
   * @private
   * Clears all caches for a file
   */
  async #clearFileCaches(fileName) {
    const cacheKeys = [
      `gcs:metadata:${this.#config.bucketName}:${fileName}`,
      `gcs:acl:${this.#config.bucketName}:${fileName}`,
      `gcs:signed:${this.#config.bucketName}:${fileName}:*`
    ];

    for (const cacheKey of cacheKeys) {
      await this.#cacheService.delete(cacheKey);
    }
  }

  /**
   * @private
   * Handles GCS errors
   */
  #handleGCSError(error, correlationId) {
    if (error instanceof AppError) {
      return error;
    }

    const statusCode = error.code || error.statusCode || 500;
    const errorMessage = GCPStorageService.#GCS_ERRORS[statusCode] || error.message || 'GCS operation failed';

    let appErrorCode = ERROR_CODES.STORAGE_ERROR;

    switch (statusCode) {
      case 404:
        appErrorCode = ERROR_CODES.NOT_FOUND;
        break;
      case 401:
        appErrorCode = ERROR_CODES.AUTHENTICATION_ERROR;
        break;
      case 403:
        appErrorCode = ERROR_CODES.FORBIDDEN;
        break;
      case 409:
        appErrorCode = ERROR_CODES.CONFLICT;
        break;
      case 412:
        appErrorCode = ERROR_CODES.PRECONDITION_FAILED;
        break;
      case 413:
        appErrorCode = ERROR_CODES.VALIDATION_ERROR;
        break;
      case 429:
        appErrorCode = ERROR_CODES.RATE_LIMIT_ERROR;
        break;
      case 503:
        appErrorCode = ERROR_CODES.SERVICE_UNAVAILABLE;
        break;
    }

    return new AppError(
      errorMessage,
      statusCode,
      appErrorCode,
      {
        correlationId,
        gcsError: error.code,
        bucket: this.#config.bucketName,
        errors: error.errors,
        originalError: error.message
      }
    );
  }

  /**
   * @private
   * Generates correlation ID
   */
  #generateCorrelationId() {
    return `gcs_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * @private
   * Generates upload ID
   */
  #generateUploadId() {
    return `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Gets service health status
   * @returns {Promise<Object>} Health status
   */
  async getHealthStatus() {
    try {
      // Check bucket exists as health check
      const [exists] = await this.#bucket.exists();
      
      return {
        healthy: exists,
        service: 'GCPStorageService',
        bucket: this.#config.bucketName,
        projectId: this.#storage.projectId,
        activeUploads: this.#activeUploads.size
      };
    } catch (error) {
      logger.error('GCS health check failed', { error: error.message });
      
      return {
        healthy: false,
        service: 'GCPStorageService',
        bucket: this.#config.bucketName,
        error: error.message
      };
    }
  }
}

module.exports = GCPStorageService;