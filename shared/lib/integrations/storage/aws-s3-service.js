'use strict';

/**
 * @fileoverview AWS S3 storage integration service
 * @module shared/lib/integrations/storage/aws-s3-service
 * @requires module:@aws-sdk/client-s3
 * @requires module:@aws-sdk/s3-request-presigner
 * @requires module:@aws-sdk/lib-storage
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/constants/error-codes
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/security/encryption/encryption-service
 * @requires module:shared/lib/utils/helpers/file-helper
 */

const { 
  S3Client, 
  PutObjectCommand, 
  GetObjectCommand, 
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  CopyObjectCommand,
  DeleteObjectsCommand,
  GetObjectAclCommand,
  PutObjectAclCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { Upload } = require('@aws-sdk/lib-storage');
const logger = require('../../utils/logger');
const AppError = require('../../utils/app-error');
const { ERROR_CODES } = require('../../utils/constants/error-codes');
const CacheService = require('../../services/cache-service');
const EncryptionService = require('../../security/encryption/encryption-service');
const fileHelper = require('../../utils/helpers/file-helper');

/**
 * @class AWSS3Service
 * @description Handles object storage operations using AWS S3
 * Implements comprehensive file management with security and performance optimizations
 */
class AWSS3Service {
  /**
   * @private
   * @type {Object}
   * @description Service configuration
   */
  #config;

  /**
   * @private
   * @type {S3Client}
   * @description AWS S3 client instance
   */
  #s3Client;

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
   * @description Active multipart uploads tracking
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
    region: 'us-east-1',
    signatureVersion: 'v4',
    maxRetries: 3,
    timeout: 300000, // 5 minutes
    multipartThreshold: 5 * 1024 * 1024, // 5MB
    partSize: 5 * 1024 * 1024, // 5MB
    maxConcurrentParts: 4,
    presignedUrlExpiry: 3600, // 1 hour
    cacheTTL: {
      presignedUrl: 3300, // 55 minutes
      metadata: 300, // 5 minutes
      acl: 600 // 10 minutes
    },
    defaultACL: 'private',
    enableTransferAcceleration: false,
    enableServerSideEncryption: true,
    serverSideEncryption: 'AES256',
    storageClass: 'STANDARD'
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description S3 ACL options
   */
  static #ACL_OPTIONS = {
    PRIVATE: 'private',
    PUBLIC_READ: 'public-read',
    PUBLIC_READ_WRITE: 'public-read-write',
    AUTHENTICATED_READ: 'authenticated-read',
    BUCKET_OWNER_READ: 'bucket-owner-read',
    BUCKET_OWNER_FULL_CONTROL: 'bucket-owner-full-control'
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description S3 storage classes
   */
  static #STORAGE_CLASSES = {
    STANDARD: 'STANDARD',
    REDUCED_REDUNDANCY: 'REDUCED_REDUNDANCY',
    STANDARD_IA: 'STANDARD_IA',
    ONEZONE_IA: 'ONEZONE_IA',
    INTELLIGENT_TIERING: 'INTELLIGENT_TIERING',
    GLACIER: 'GLACIER',
    DEEP_ARCHIVE: 'DEEP_ARCHIVE'
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
    
    // Documents
    'pdf': 'application/pdf',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls': 'application/vnd.ms-excel',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'ppt': 'application/vnd.ms-powerpoint',
    'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    
    // Text
    'txt': 'text/plain',
    'csv': 'text/csv',
    'json': 'application/json',
    'xml': 'application/xml',
    
    // Archives
    'zip': 'application/zip',
    'rar': 'application/x-rar-compressed',
    '7z': 'application/x-7z-compressed',
    'tar': 'application/x-tar',
    'gz': 'application/gzip',
    
    // Media
    'mp3': 'audio/mpeg',
    'mp4': 'video/mp4',
    'avi': 'video/x-msvideo',
    'mov': 'video/quicktime',
    'wmv': 'video/x-ms-wmv'
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description S3 error mappings
   */
  static #S3_ERRORS = {
    NoSuchBucket: 'The specified bucket does not exist',
    NoSuchKey: 'The specified key does not exist',
    AccessDenied: 'Access denied to the resource',
    BucketAlreadyExists: 'The bucket already exists',
    InvalidBucketName: 'The specified bucket name is invalid',
    EntityTooLarge: 'File size exceeds the maximum allowed',
    RequestTimeout: 'Request timeout',
    ServiceUnavailable: 'S3 service is temporarily unavailable',
    SlowDown: 'Request rate limit exceeded'
  };

  /**
   * Creates a new AWSS3Service instance
   * @param {Object} config - Service configuration
   * @param {Object} config.credentials - AWS credentials
   * @param {string} config.credentials.accessKeyId - AWS access key ID
   * @param {string} config.credentials.secretAccessKey - AWS secret access key
   * @param {string} config.bucketName - S3 bucket name
   * @param {string} [config.region='us-east-1'] - AWS region
   * @param {string} [config.endpoint] - Custom S3 endpoint (for S3-compatible services)
   * @param {Object} [config.allowedFileTypes] - Allowed file types
   * @param {number} [config.maxFileSize] - Maximum file size in bytes
   * @param {boolean} [config.enableTransferAcceleration=false] - Enable transfer acceleration
   * @param {string} [config.defaultACL='private'] - Default ACL for uploaded files
   * @param {CacheService} [cacheService] - Cache service instance
   * @param {EncryptionService} [encryptionService] - Encryption service instance
   * @throws {AppError} If configuration is invalid
   */
  constructor(config, cacheService, encryptionService) {
    try {
      if (!config?.credentials?.accessKeyId || !config?.credentials?.secretAccessKey) {
        throw new AppError(
          'AWS credentials are required',
          400,
          ERROR_CODES.CONFIGURATION_ERROR,
          { service: 'AWSS3Service' }
        );
      }

      if (!config.bucketName) {
        throw new AppError(
          'S3 bucket name is required',
          400,
          ERROR_CODES.CONFIGURATION_ERROR,
          { field: 'bucketName' }
        );
      }

      this.#config = {
        ...AWSS3Service.#DEFAULT_CONFIG,
        ...config,
        allowedFileTypes: config.allowedFileTypes || AWSS3Service.#ALLOWED_FILE_TYPES
      };

      this.#cacheService = cacheService || new CacheService();
      this.#encryptionService = encryptionService || new EncryptionService();
      this.#activeUploads = new Map();

      // Initialize S3 client
      const s3Config = {
        region: this.#config.region,
        credentials: this.#config.credentials,
        maxAttempts: this.#config.maxRetries,
        requestTimeout: this.#config.timeout
      };

      if (this.#config.endpoint) {
        s3Config.endpoint = this.#config.endpoint;
        s3Config.forcePathStyle = true;
      }

      if (this.#config.enableTransferAcceleration) {
        s3Config.useAccelerateEndpoint = true;
      }

      this.#s3Client = new S3Client(s3Config);

      logger.info('AWSS3Service initialized', {
        bucketName: this.#config.bucketName,
        region: this.#config.region,
        transferAcceleration: this.#config.enableTransferAcceleration
      });

    } catch (error) {
      logger.error('AWSS3Service initialization failed', error);
      throw error instanceof AppError ? error : new AppError(
        'Failed to initialize AWS S3 service',
        500,
        ERROR_CODES.INITIALIZATION_ERROR,
        { originalError: error.message }
      );
    }
  }

  /**
   * Uploads a file to S3
   * @param {Object} fileData - File upload data
   * @param {Buffer|Stream|string} fileData.content - File content
   * @param {string} fileData.key - S3 object key (path)
   * @param {string} [fileData.contentType] - MIME type
   * @param {Object} [fileData.metadata] - File metadata
   * @param {string} [fileData.acl] - Access control list
   * @param {string} [fileData.storageClass] - Storage class
   * @param {Object} [fileData.tags] - Object tags
   * @param {Object} [options] - Upload options
   * @param {boolean} [options.useMultipart=auto] - Force multipart upload
   * @param {Function} [options.onProgress] - Progress callback
   * @param {string} [options.correlationId] - Tracking ID
   * @returns {Promise<Object>} Upload result with file details
   * @throws {AppError} If upload fails
   */
  async uploadFile(fileData, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();
    const startTime = Date.now();

    try {
      logger.info('Starting file upload to S3', {
        correlationId,
        key: fileData.key,
        bucket: this.#config.bucketName,
        contentType: fileData.contentType
      });

      // Validate file
      await this.#validateFile(fileData);

      // Determine upload method
      const fileSize = await this.#getFileSize(fileData.content);
      const useMultipart = options.useMultipart || fileSize > this.#config.multipartThreshold;

      let result;
      if (useMultipart) {
        result = await this.#multipartUpload(fileData, options, correlationId);
      } else {
        result = await this.#simpleUpload(fileData, options, correlationId);
      }

      const duration = Date.now() - startTime;
      logger.info('File uploaded successfully', {
        correlationId,
        key: result.Key,
        etag: result.ETag,
        duration,
        size: fileSize
      });

      return {
        success: true,
        key: result.Key,
        bucket: this.#config.bucketName,
        etag: result.ETag,
        location: result.Location,
        size: fileSize,
        contentType: fileData.contentType,
        uploadedAt: new Date().toISOString(),
        duration,
        correlationId
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('File upload failed', {
        correlationId,
        key: fileData.key,
        duration,
        error: error.message
      });

      throw this.#handleS3Error(error, correlationId);
    }
  }

  /**
   * Downloads a file from S3
   * @param {string} key - S3 object key
   * @param {Object} [options] - Download options
   * @param {string} [options.versionId] - Object version ID
   * @param {Object} [options.responseHeaders] - Response header overrides
   * @returns {Promise<Object>} File data and metadata
   * @throws {AppError} If download fails
   */
  async downloadFile(key, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      logger.info('Downloading file from S3', {
        correlationId,
        key,
        bucket: this.#config.bucketName
      });

      const command = new GetObjectCommand({
        Bucket: this.#config.bucketName,
        Key: key,
        VersionId: options.versionId,
        ...this.#buildResponseHeaders(options.responseHeaders)
      });

      const response = await this.#s3Client.send(command);

      // Convert stream to buffer or return stream
      let content;
      if (options.asStream) {
        content = response.Body;
      } else {
        content = await this.#streamToBuffer(response.Body);
      }

      logger.info('File downloaded successfully', {
        correlationId,
        key,
        contentLength: response.ContentLength
      });

      return {
        content,
        metadata: {
          contentType: response.ContentType,
          contentLength: response.ContentLength,
          etag: response.ETag,
          lastModified: response.LastModified,
          versionId: response.VersionId,
          customMetadata: response.Metadata
        }
      };

    } catch (error) {
      logger.error('File download failed', {
        correlationId,
        key,
        error: error.message
      });

      throw this.#handleS3Error(error, correlationId);
    }
  }

  /**
   * Deletes a file from S3
   * @param {string|Array<string>} keys - S3 object key(s)
   * @param {Object} [options] - Delete options
   * @param {boolean} [options.quiet=false] - Quiet mode for batch delete
   * @returns {Promise<Object>} Deletion result
   * @throws {AppError} If deletion fails
   */
  async deleteFile(keys, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();
    const isMultiple = Array.isArray(keys);

    try {
      logger.info('Deleting file(s) from S3', {
        correlationId,
        count: isMultiple ? keys.length : 1,
        bucket: this.#config.bucketName
      });

      let result;
      if (isMultiple) {
        result = await this.#deleteMultipleFiles(keys, options);
      } else {
        result = await this.#deleteSingleFile(keys, options);
      }

      logger.info('File(s) deleted successfully', {
        correlationId,
        deleted: result.deleted,
        errors: result.errors?.length || 0
      });

      return result;

    } catch (error) {
      logger.error('File deletion failed', {
        correlationId,
        error: error.message
      });

      throw this.#handleS3Error(error, correlationId);
    }
  }

  /**
   * Gets a presigned URL for file access
   * @param {string} key - S3 object key
   * @param {Object} [options] - Presigned URL options
   * @param {string} [options.operation='getObject'] - Operation (getObject or putObject)
   * @param {number} [options.expiresIn=3600] - URL expiry in seconds
   * @param {Object} [options.metadata] - Metadata for putObject
   * @param {string} [options.contentType] - Content type for putObject
   * @param {string} [options.acl] - ACL for putObject
   * @returns {Promise<Object>} Presigned URL and metadata
   * @throws {AppError} If URL generation fails
   */
  async getPresignedUrl(key, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      // Check cache first
      const cacheKey = `s3:presigned:${this.#config.bucketName}:${key}:${options.operation || 'getObject'}`;
      const cached = await this.#cacheService.get(cacheKey);
      
      if (cached && options.useCache !== false) {
        logger.debug('Presigned URL retrieved from cache', { correlationId, key });
        return cached;
      }

      logger.info('Generating presigned URL', {
        correlationId,
        key,
        operation: options.operation || 'getObject',
        expiresIn: options.expiresIn || this.#config.presignedUrlExpiry
      });

      let command;
      const expiresIn = options.expiresIn || this.#config.presignedUrlExpiry;

      if (options.operation === 'putObject') {
        command = new PutObjectCommand({
          Bucket: this.#config.bucketName,
          Key: key,
          ContentType: options.contentType,
          ACL: options.acl || this.#config.defaultACL,
          Metadata: options.metadata,
          ServerSideEncryption: this.#config.enableServerSideEncryption ? this.#config.serverSideEncryption : undefined
        });
      } else {
        command = new GetObjectCommand({
          Bucket: this.#config.bucketName,
          Key: key,
          VersionId: options.versionId,
          ...this.#buildResponseHeaders(options.responseHeaders)
        });
      }

      const url = await getSignedUrl(this.#s3Client, command, { expiresIn });

      const result = {
        url,
        expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
        operation: options.operation || 'getObject',
        key,
        bucket: this.#config.bucketName
      };

      // Cache the URL (with shorter TTL than expiry)
      const cacheTTL = Math.min(expiresIn - 300, this.#config.cacheTTL.presignedUrl);
      await this.#cacheService.set(cacheKey, result, cacheTTL);

      return result;

    } catch (error) {
      logger.error('Presigned URL generation failed', {
        correlationId,
        key,
        error: error.message
      });

      throw this.#handleS3Error(error, correlationId);
    }
  }

  /**
   * Gets file metadata without downloading content
   * @param {string} key - S3 object key
   * @param {Object} [options] - Metadata options
   * @returns {Promise<Object>} File metadata
   * @throws {AppError} If metadata retrieval fails
   */
  async getFileMetadata(key, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      // Check cache first
      const cacheKey = `s3:metadata:${this.#config.bucketName}:${key}`;
      const cached = await this.#cacheService.get(cacheKey);
      
      if (cached && options.useCache !== false) {
        logger.debug('File metadata retrieved from cache', { correlationId, key });
        return cached;
      }

      logger.info('Retrieving file metadata', {
        correlationId,
        key,
        bucket: this.#config.bucketName
      });

      const command = new HeadObjectCommand({
        Bucket: this.#config.bucketName,
        Key: key,
        VersionId: options.versionId
      });

      const response = await this.#s3Client.send(command);

      const metadata = {
        key,
        size: response.ContentLength,
        contentType: response.ContentType,
        etag: response.ETag,
        lastModified: response.LastModified,
        versionId: response.VersionId,
        storageClass: response.StorageClass,
        serverSideEncryption: response.ServerSideEncryption,
        customMetadata: response.Metadata,
        cacheControl: response.CacheControl,
        contentDisposition: response.ContentDisposition,
        contentEncoding: response.ContentEncoding
      };

      // Cache metadata
      await this.#cacheService.set(cacheKey, metadata, this.#config.cacheTTL.metadata);

      return metadata;

    } catch (error) {
      logger.error('File metadata retrieval failed', {
        correlationId,
        key,
        error: error.message
      });

      throw this.#handleS3Error(error, correlationId);
    }
  }

  /**
   * Lists files in a bucket with optional prefix
   * @param {Object} [options] - List options
   * @param {string} [options.prefix] - Key prefix for filtering
   * @param {string} [options.delimiter='/'] - Delimiter for grouping
   * @param {number} [options.maxKeys=1000] - Maximum keys to return
   * @param {string} [options.continuationToken] - Pagination token
   * @returns {Promise<Object>} List of files and metadata
   * @throws {AppError} If listing fails
   */
  async listFiles(options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      logger.info('Listing files in S3', {
        correlationId,
        bucket: this.#config.bucketName,
        prefix: options.prefix,
        maxKeys: options.maxKeys
      });

      const command = new ListObjectsV2Command({
        Bucket: this.#config.bucketName,
        Prefix: options.prefix,
        Delimiter: options.delimiter || '/',
        MaxKeys: options.maxKeys || 1000,
        ContinuationToken: options.continuationToken
      });

      const response = await this.#s3Client.send(command);

      const files = (response.Contents || []).map(item => ({
        key: item.Key,
        size: item.Size,
        lastModified: item.LastModified,
        etag: item.ETag,
        storageClass: item.StorageClass
      }));

      const directories = (response.CommonPrefixes || []).map(item => ({
        prefix: item.Prefix
      }));

      return {
        files,
        directories,
        isTruncated: response.IsTruncated,
        nextContinuationToken: response.NextContinuationToken,
        keyCount: response.KeyCount
      };

    } catch (error) {
      logger.error('File listing failed', {
        correlationId,
        error: error.message
      });

      throw this.#handleS3Error(error, correlationId);
    }
  }

  /**
   * Copies a file within S3
   * @param {Object} copyData - Copy operation data
   * @param {string} copyData.sourceKey - Source object key
   * @param {string} copyData.destinationKey - Destination object key
   * @param {string} [copyData.sourceBucket] - Source bucket (defaults to current)
   * @param {string} [copyData.destinationBucket] - Destination bucket (defaults to current)
   * @param {Object} [copyData.metadata] - New metadata
   * @param {string} [copyData.acl] - New ACL
   * @param {Object} [options] - Copy options
   * @returns {Promise<Object>} Copy result
   * @throws {AppError} If copy fails
   */
  async copyFile(copyData, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      logger.info('Copying file in S3', {
        correlationId,
        sourceKey: copyData.sourceKey,
        destinationKey: copyData.destinationKey
      });

      const sourceBucket = copyData.sourceBucket || this.#config.bucketName;
      const destinationBucket = copyData.destinationBucket || this.#config.bucketName;

      const command = new CopyObjectCommand({
        Bucket: destinationBucket,
        CopySource: `${sourceBucket}/${copyData.sourceKey}`,
        Key: copyData.destinationKey,
        ACL: copyData.acl || this.#config.defaultACL,
        Metadata: copyData.metadata,
        MetadataDirective: copyData.metadata ? 'REPLACE' : 'COPY',
        ServerSideEncryption: this.#config.enableServerSideEncryption ? this.#config.serverSideEncryption : undefined
      });

      const response = await this.#s3Client.send(command);

      logger.info('File copied successfully', {
        correlationId,
        etag: response.CopyObjectResult.ETag
      });

      return {
        success: true,
        sourceKey: copyData.sourceKey,
        destinationKey: copyData.destinationKey,
        etag: response.CopyObjectResult.ETag,
        lastModified: response.CopyObjectResult.LastModified
      };

    } catch (error) {
      logger.error('File copy failed', {
        correlationId,
        error: error.message
      });

      throw this.#handleS3Error(error, correlationId);
    }
  }

  /**
   * Updates file ACL
   * @param {string} key - S3 object key
   * @param {string} acl - New ACL
   * @param {Object} [options] - ACL options
   * @returns {Promise<Object>} ACL update result
   * @throws {AppError} If ACL update fails
   */
  async updateFileACL(key, acl, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      logger.info('Updating file ACL', {
        correlationId,
        key,
        acl
      });

      // Validate ACL
      if (!Object.values(AWSS3Service.#ACL_OPTIONS).includes(acl)) {
        throw new AppError(
          'Invalid ACL value',
          400,
          ERROR_CODES.VALIDATION_ERROR,
          { acl, validOptions: Object.values(AWSS3Service.#ACL_OPTIONS) }
        );
      }

      const command = new PutObjectAclCommand({
        Bucket: this.#config.bucketName,
        Key: key,
        ACL: acl
      });

      await this.#s3Client.send(command);

      // Clear ACL cache
      await this.#cacheService.delete(`s3:acl:${this.#config.bucketName}:${key}`);

      logger.info('File ACL updated successfully', {
        correlationId,
        key,
        acl
      });

      return {
        success: true,
        key,
        acl
      };

    } catch (error) {
      logger.error('File ACL update failed', {
        correlationId,
        key,
        error: error.message
      });

      throw this.#handleS3Error(error, correlationId);
    }
  }

  /**
   * @private
   * Simple upload for smaller files
   */
  async #simpleUpload(fileData, options, correlationId) {
    const params = {
      Bucket: this.#config.bucketName,
      Key: fileData.key,
      Body: fileData.content,
      ContentType: fileData.contentType || 'application/octet-stream',
      ACL: fileData.acl || this.#config.defaultACL,
      Metadata: fileData.metadata || {},
      StorageClass: fileData.storageClass || this.#config.storageClass
    };

    if (this.#config.enableServerSideEncryption) {
      params.ServerSideEncryption = this.#config.serverSideEncryption;
    }

    if (fileData.tags) {
      params.Tagging = this.#buildTagString(fileData.tags);
    }

    const command = new PutObjectCommand(params);
    const response = await this.#s3Client.send(command);

    return {
      Key: fileData.key,
      ETag: response.ETag,
      VersionId: response.VersionId,
      Location: `https://${this.#config.bucketName}.s3.${this.#config.region}.amazonaws.com/${fileData.key}`
    };
  }

  /**
   * @private
   * Multipart upload for larger files
   */
  async #multipartUpload(fileData, options, correlationId) {
    const uploadId = this.#generateUploadId();
    
    try {
      this.#activeUploads.set(uploadId, {
        key: fileData.key,
        startTime: Date.now()
      });

      const upload = new Upload({
        client: this.#s3Client,
        params: {
          Bucket: this.#config.bucketName,
          Key: fileData.key,
          Body: fileData.content,
          ContentType: fileData.contentType || 'application/octet-stream',
          ACL: fileData.acl || this.#config.defaultACL,
          Metadata: fileData.metadata || {},
          StorageClass: fileData.storageClass || this.#config.storageClass,
          ServerSideEncryption: this.#config.enableServerSideEncryption ? this.#config.serverSideEncryption : undefined
        },
        partSize: this.#config.partSize,
        queueSize: this.#config.maxConcurrentParts
      });

      // Track progress
      if (options.onProgress) {
        upload.on('httpUploadProgress', (progress) => {
          options.onProgress({
            loaded: progress.loaded,
            total: progress.total,
            percentage: (progress.loaded / progress.total) * 100
          });
        });
      }

      const result = await upload.done();
      
      this.#activeUploads.delete(uploadId);

      return {
        Key: result.Key,
        ETag: result.ETag,
        VersionId: result.VersionId,
        Location: result.Location
      };

    } catch (error) {
      this.#activeUploads.delete(uploadId);
      throw error;
    }
  }

  /**
   * @private
   * Deletes a single file
   */
  async #deleteSingleFile(key, options) {
    const command = new DeleteObjectCommand({
      Bucket: this.#config.bucketName,
      Key: key,
      VersionId: options.versionId
    });

    const response = await this.#s3Client.send(command);

    // Clear caches
    await this.#clearFileCaches(key);

    return {
      success: true,
      deleted: 1,
      key,
      versionId: response.VersionId
    };
  }

  /**
   * @private
   * Deletes multiple files
   */
  async #deleteMultipleFiles(keys, options) {
    const objects = keys.map(key => ({
      Key: typeof key === 'string' ? key : key.key,
      VersionId: typeof key === 'string' ? undefined : key.versionId
    }));

    const command = new DeleteObjectsCommand({
      Bucket: this.#config.bucketName,
      Delete: {
        Objects: objects,
        Quiet: options.quiet || false
      }
    });

    const response = await this.#s3Client.send(command);

    // Clear caches for all deleted files
    for (const key of keys) {
      await this.#clearFileCaches(typeof key === 'string' ? key : key.key);
    }

    return {
      success: true,
      deleted: response.Deleted?.length || 0,
      errors: response.Errors || []
    };
  }

  /**
   * @private
   * Validates file before upload
   */
  async #validateFile(fileData) {
    const errors = [];

    // Validate key
    if (!fileData.key || fileData.key.length === 0) {
      errors.push('File key is required');
    }

    // Validate content
    if (!fileData.content) {
      errors.push('File content is required');
    }

    // Validate file type
    if (fileData.contentType) {
      const extension = fileData.key.split('.').pop().toLowerCase();
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
   * Converts stream to buffer
   */
  async #streamToBuffer(stream) {
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  /**
   * @private
   * Builds response header parameters
   */
  #buildResponseHeaders(headers) {
    if (!headers) return {};

    const params = {};
    if (headers.contentType) params.ResponseContentType = headers.contentType;
    if (headers.contentLanguage) params.ResponseContentLanguage = headers.contentLanguage;
    if (headers.expires) params.ResponseExpires = headers.expires;
    if (headers.cacheControl) params.ResponseCacheControl = headers.cacheControl;
    if (headers.contentDisposition) params.ResponseContentDisposition = headers.contentDisposition;
    if (headers.contentEncoding) params.ResponseContentEncoding = headers.contentEncoding;

    return params;
  }

  /**
   * @private
   * Builds tag string from object
   */
  #buildTagString(tags) {
    return Object.entries(tags)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');
  }

  /**
   * @private
   * Clears all caches for a file
   */
  async #clearFileCaches(key) {
    const cacheKeys = [
      `s3:metadata:${this.#config.bucketName}:${key}`,
      `s3:acl:${this.#config.bucketName}:${key}`,
      `s3:presigned:${this.#config.bucketName}:${key}:*`
    ];

    for (const cacheKey of cacheKeys) {
      await this.#cacheService.delete(cacheKey);
    }
  }

  /**
   * @private
   * Handles S3 errors
   */
  #handleS3Error(error, correlationId) {
    if (error instanceof AppError) {
      return error;
    }

    const errorCode = error.Code || error.name;
    const errorMessage = AWSS3Service.#S3_ERRORS[errorCode] || 'S3 operation failed';

    let statusCode = 500;
    let appErrorCode = ERROR_CODES.STORAGE_ERROR;

    switch (errorCode) {
      case 'NoSuchBucket':
      case 'NoSuchKey':
        statusCode = 404;
        appErrorCode = ERROR_CODES.NOT_FOUND;
        break;
      case 'AccessDenied':
        statusCode = 403;
        appErrorCode = ERROR_CODES.FORBIDDEN;
        break;
      case 'InvalidBucketName':
      case 'EntityTooLarge':
        statusCode = 400;
        appErrorCode = ERROR_CODES.VALIDATION_ERROR;
        break;
      case 'RequestTimeout':
        statusCode = 408;
        appErrorCode = ERROR_CODES.TIMEOUT_ERROR;
        break;
      case 'SlowDown':
        statusCode = 429;
        appErrorCode = ERROR_CODES.RATE_LIMIT_ERROR;
        break;
      case 'ServiceUnavailable':
        statusCode = 503;
        appErrorCode = ERROR_CODES.SERVICE_UNAVAILABLE;
        break;
    }

    return new AppError(
      errorMessage,
      statusCode,
      appErrorCode,
      {
        correlationId,
        s3Error: errorCode,
        bucket: this.#config.bucketName,
        requestId: error.$metadata?.requestId,
        originalError: error.message
      }
    );
  }

  /**
   * @private
   * Generates correlation ID
   */
  #generateCorrelationId() {
    return `s3_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
      // Attempt to list with maxKeys=1 as health check
      await this.listFiles({ maxKeys: 1 });
      
      return {
        healthy: true,
        service: 'AWSS3Service',
        bucket: this.#config.bucketName,
        region: this.#config.region,
        activeUploads: this.#activeUploads.size
      };
    } catch (error) {
      logger.error('S3 health check failed', { error: error.message });
      
      return {
        healthy: false,
        service: 'AWSS3Service',
        bucket: this.#config.bucketName,
        region: this.#config.region,
        error: error.message
      };
    }
  }
}

module.exports = AWSS3Service;