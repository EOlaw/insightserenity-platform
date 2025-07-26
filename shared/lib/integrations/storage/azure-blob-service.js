'use strict';

/**
 * @fileoverview Azure Blob Storage integration service
 * @module shared/lib/integrations/storage/azure-blob-service
 * @requires module:@azure/storage-blob
 * @requires module:@azure/identity
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/constants/error-codes
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/security/encryption/encryption-service
 * @requires module:shared/lib/utils/helpers/file-helper
 */

const { 
  BlobServiceClient, 
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
  BlockBlobClient,
  ContainerClient
} = require('@azure/storage-blob');
const { DefaultAzureCredential } = require('@azure/identity');
const logger = require('../../utils/logger');
const AppError = require('../../utils/app-error');
const { ERROR_CODES } = require('../../utils/constants/error-codes');
const CacheService = require('../../services/cache-service');
const EncryptionService = require('../../security/encryption/encryption-service');
const fileHelper = require('../../utils/helpers/file-helper');

/**
 * @class AzureBlobService
 * @description Handles object storage operations using Azure Blob Storage
 * Provides comprehensive blob management with advanced features and security
 */
class AzureBlobService {
  /**
   * @private
   * @type {Object}
   * @description Service configuration
   */
  #config;

  /**
   * @private
   * @type {BlobServiceClient}
   * @description Azure Blob Service client instance
   */
  #blobServiceClient;

  /**
   * @private
   * @type {ContainerClient}
   * @description Container client instance
   */
  #containerClient;

  /**
   * @private
   * @type {StorageSharedKeyCredential}
   * @description Shared key credential for SAS generation
   */
  #sharedKeyCredential;

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
    retryDelayInMs: 1000,
    maxRetryDelayInMs: 60000,
    timeout: 300000, // 5 minutes
    maxSingleUploadSize: 256 * 1024 * 1024, // 256MB
    blockSize: 4 * 1024 * 1024, // 4MB
    maxConcurrency: 5,
    sasTokenExpiry: 3600, // 1 hour
    cacheTTL: {
      sasUrl: 3300, // 55 minutes
      metadata: 300, // 5 minutes
      properties: 600 // 10 minutes
    },
    defaultAccessTier: 'Hot',
    enableHttps: true,
    defaultContentType: 'application/octet-stream'
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description Azure Blob access tiers
   */
  static #ACCESS_TIERS = {
    HOT: 'Hot',
    COOL: 'Cool',
    ARCHIVE: 'Archive'
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description Blob types
   */
  static #BLOB_TYPES = {
    BLOCK: 'BlockBlob',
    PAGE: 'PageBlob',
    APPEND: 'AppendBlob'
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description Public access levels
   */
  static #PUBLIC_ACCESS_LEVELS = {
    NONE: 'none',
    BLOB: 'blob',
    CONTAINER: 'container'
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
    
    // Text
    'txt': 'text/plain',
    'csv': 'text/csv',
    'json': 'application/json',
    'xml': 'application/xml',
    'html': 'text/html',
    'css': 'text/css',
    'js': 'application/javascript',
    
    // Archives
    'zip': 'application/zip',
    'rar': 'application/x-rar-compressed',
    '7z': 'application/x-7z-compressed',
    'tar': 'application/x-tar',
    'gz': 'application/gzip',
    
    // Media
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
    'mp4': 'video/mp4',
    'avi': 'video/x-msvideo',
    'mov': 'video/quicktime',
    'wmv': 'video/x-ms-wmv',
    'flv': 'video/x-flv'
  };

  /**
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description Azure Blob Storage error mappings
   */
  static #AZURE_ERRORS = {
    ContainerNotFound: 'The specified container does not exist',
    BlobNotFound: 'The specified blob does not exist',
    ContainerAlreadyExists: 'The specified container already exists',
    BlobAlreadyExists: 'The specified blob already exists',
    InvalidBlobOrBlock: 'The specified blob or block content is invalid',
    InvalidBlockList: 'The specified block list is invalid',
    RequestBodyTooLarge: 'The request body is too large',
    AuthenticationFailed: 'Authentication failed',
    AuthorizationFailure: 'Authorization failed',
    AccountIsDisabled: 'The specified account is disabled',
    InsufficientAccountPermissions: 'Insufficient permissions'
  };

  /**
   * Creates a new AzureBlobService instance
   * @param {Object} config - Service configuration
   * @param {string} config.connectionString - Azure Storage connection string (option 1)
   * @param {string} config.accountName - Storage account name (option 2)
   * @param {string} config.accountKey - Storage account key (option 2)
   * @param {string} config.containerName - Blob container name
   * @param {boolean} [config.useDefaultCredential=false] - Use DefaultAzureCredential
   * @param {Object} [config.allowedFileTypes] - Allowed file types
   * @param {number} [config.maxFileSize] - Maximum file size in bytes
   * @param {string} [config.defaultAccessTier='Hot'] - Default access tier
   * @param {CacheService} [cacheService] - Cache service instance
   * @param {EncryptionService} [encryptionService] - Encryption service instance
   * @throws {AppError} If configuration is invalid
   */
  constructor(config, cacheService, encryptionService) {
    try {
      if (!config?.containerName) {
        throw new AppError(
          'Container name is required',
          400,
          ERROR_CODES.CONFIGURATION_ERROR,
          { field: 'containerName' }
        );
      }

      this.#config = {
        ...AzureBlobService.#DEFAULT_CONFIG,
        ...config,
        allowedFileTypes: config.allowedFileTypes || AzureBlobService.#ALLOWED_FILE_TYPES
      };

      this.#cacheService = cacheService || new CacheService();
      this.#encryptionService = encryptionService || new EncryptionService();
      this.#activeUploads = new Map();

      // Initialize Azure Blob Service Client
      if (config.connectionString) {
        this.#blobServiceClient = BlobServiceClient.fromConnectionString(
          config.connectionString,
          {
            retryOptions: {
              maxTries: this.#config.maxRetries,
              tryTimeoutInMs: this.#config.timeout,
              retryDelayInMs: this.#config.retryDelayInMs,
              maxRetryDelayInMs: this.#config.maxRetryDelayInMs
            }
          }
        );
        
        // Extract account name and key for SAS generation
        const matches = config.connectionString.match(/AccountName=([^;]+);.*AccountKey=([^;]+)/);
        if (matches) {
          this.#config.accountName = matches[1];
          this.#sharedKeyCredential = new StorageSharedKeyCredential(matches[1], matches[2]);
        }
      } else if (config.accountName && config.accountKey) {
        this.#sharedKeyCredential = new StorageSharedKeyCredential(
          config.accountName,
          config.accountKey
        );
        
        this.#blobServiceClient = new BlobServiceClient(
          `https://${config.accountName}.blob.core.windows.net`,
          this.#sharedKeyCredential,
          {
            retryOptions: {
              maxTries: this.#config.maxRetries,
              tryTimeoutInMs: this.#config.timeout,
              retryDelayInMs: this.#config.retryDelayInMs,
              maxRetryDelayInMs: this.#config.maxRetryDelayInMs
            }
          }
        );
      } else if (config.useDefaultCredential) {
        if (!config.accountName) {
          throw new AppError(
            'Account name is required when using DefaultAzureCredential',
            400,
            ERROR_CODES.CONFIGURATION_ERROR
          );
        }
        
        const credential = new DefaultAzureCredential();
        this.#blobServiceClient = new BlobServiceClient(
          `https://${config.accountName}.blob.core.windows.net`,
          credential,
          {
            retryOptions: {
              maxTries: this.#config.maxRetries,
              tryTimeoutInMs: this.#config.timeout,
              retryDelayInMs: this.#config.retryDelayInMs,
              maxRetryDelayInMs: this.#config.maxRetryDelayInMs
            }
          }
        );
      } else {
        throw new AppError(
          'Azure credentials are required (connectionString or accountName/accountKey)',
          400,
          ERROR_CODES.CONFIGURATION_ERROR
        );
      }

      // Get container client
      this.#containerClient = this.#blobServiceClient.getContainerClient(this.#config.containerName);

      logger.info('AzureBlobService initialized', {
        containerName: this.#config.containerName,
        accountName: this.#config.accountName,
        defaultAccessTier: this.#config.defaultAccessTier
      });

      // Ensure container exists
      this.#ensureContainer().catch(error => {
        logger.warn('Failed to ensure container exists', { error: error.message });
      });

    } catch (error) {
      logger.error('AzureBlobService initialization failed', error);
      throw error instanceof AppError ? error : new AppError(
        'Failed to initialize Azure Blob service',
        500,
        ERROR_CODES.INITIALIZATION_ERROR,
        { originalError: error.message }
      );
    }
  }

  /**
   * Uploads a file to Azure Blob Storage
   * @param {Object} fileData - File upload data
   * @param {Buffer|Stream|string} fileData.content - File content
   * @param {string} fileData.blobName - Blob name (path)
   * @param {string} [fileData.contentType] - MIME type
   * @param {Object} [fileData.metadata] - Blob metadata
   * @param {string} [fileData.accessTier] - Access tier
   * @param {Object} [fileData.tags] - Blob tags
   * @param {Object} [options] - Upload options
   * @param {Function} [options.onProgress] - Progress callback
   * @param {string} [options.correlationId] - Tracking ID
   * @returns {Promise<Object>} Upload result with blob details
   * @throws {AppError} If upload fails
   */
  async uploadFile(fileData, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();
    const startTime = Date.now();

    try {
      logger.info('Starting blob upload to Azure', {
        correlationId,
        blobName: fileData.blobName,
        container: this.#config.containerName,
        contentType: fileData.contentType
      });

      // Validate file
      await this.#validateFile(fileData);

      // Get blob client
      const blockBlobClient = this.#containerClient.getBlockBlobClient(fileData.blobName);

      // Prepare upload options
      const uploadOptions = {
        blobHTTPHeaders: {
          blobContentType: fileData.contentType || this.#config.defaultContentType,
          blobContentEncoding: fileData.contentEncoding,
          blobContentLanguage: fileData.contentLanguage,
          blobContentDisposition: fileData.contentDisposition,
          blobCacheControl: fileData.cacheControl
        },
        metadata: fileData.metadata || {},
        tags: fileData.tags,
        tier: fileData.accessTier || this.#config.defaultAccessTier,
        concurrency: this.#config.maxConcurrency,
        blockSize: this.#config.blockSize,
        maxSingleShotSize: this.#config.maxSingleUploadSize
      };

      // Track upload
      const uploadId = this.#generateUploadId();
      this.#activeUploads.set(uploadId, {
        blobName: fileData.blobName,
        startTime: Date.now()
      });

      // Upload with progress tracking
      let uploadResponse;
      
      if (options.onProgress) {
        uploadOptions.onProgress = (progress) => {
          options.onProgress({
            loadedBytes: progress.loadedBytes,
            totalBytes: fileData.size || 0,
            percentage: fileData.size ? (progress.loadedBytes / fileData.size) * 100 : 0
          });
        };
      }

      if (Buffer.isBuffer(fileData.content)) {
        uploadResponse = await blockBlobClient.upload(
          fileData.content,
          fileData.content.length,
          uploadOptions
        );
      } else if (fileData.content.readable) {
        // Stream upload
        uploadResponse = await blockBlobClient.uploadStream(
          fileData.content,
          this.#config.blockSize,
          this.#config.maxConcurrency,
          uploadOptions
        );
      } else {
        // String content
        const buffer = Buffer.from(fileData.content);
        uploadResponse = await blockBlobClient.upload(
          buffer,
          buffer.length,
          uploadOptions
        );
      }

      this.#activeUploads.delete(uploadId);

      const duration = Date.now() - startTime;
      logger.info('Blob uploaded successfully', {
        correlationId,
        blobName: fileData.blobName,
        etag: uploadResponse.etag,
        duration
      });

      return {
        success: true,
        blobName: fileData.blobName,
        container: this.#config.containerName,
        etag: uploadResponse.etag,
        lastModified: uploadResponse.lastModified,
        contentMD5: uploadResponse.contentMD5,
        url: blockBlobClient.url,
        uploadedAt: new Date().toISOString(),
        duration,
        correlationId
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Blob upload failed', {
        correlationId,
        blobName: fileData.blobName,
        duration,
        error: error.message
      });

      throw this.#handleAzureError(error, correlationId);
    }
  }

  /**
   * Downloads a blob from Azure Storage
   * @param {string} blobName - Blob name
   * @param {Object} [options] - Download options
   * @param {boolean} [options.asStream=false] - Return as stream
   * @param {number} [options.offset] - Start offset
   * @param {number} [options.count] - Number of bytes to read
   * @returns {Promise<Object>} Blob data and metadata
   * @throws {AppError} If download fails
   */
  async downloadFile(blobName, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      logger.info('Downloading blob from Azure', {
        correlationId,
        blobName,
        container: this.#config.containerName
      });

      const blobClient = this.#containerClient.getBlobClient(blobName);

      // Download blob
      const downloadOptions = {};
      if (options.offset !== undefined) downloadOptions.offset = options.offset;
      if (options.count !== undefined) downloadOptions.count = options.count;

      const downloadResponse = await blobClient.download(
        downloadOptions.offset,
        downloadOptions.count
      );

      let content;
      if (options.asStream) {
        content = downloadResponse.readableStreamBody;
      } else {
        // Convert stream to buffer
        content = await this.#streamToBuffer(downloadResponse.readableStreamBody);
      }

      logger.info('Blob downloaded successfully', {
        correlationId,
        blobName,
        contentLength: downloadResponse.contentLength
      });

      return {
        content,
        metadata: {
          contentType: downloadResponse.contentType,
          contentLength: downloadResponse.contentLength,
          etag: downloadResponse.etag,
          lastModified: downloadResponse.lastModified,
          contentMD5: downloadResponse.contentMD5,
          blobType: downloadResponse.blobType,
          accessTier: downloadResponse.accessTier,
          customMetadata: downloadResponse.metadata
        }
      };

    } catch (error) {
      logger.error('Blob download failed', {
        correlationId,
        blobName,
        error: error.message
      });

      throw this.#handleAzureError(error, correlationId);
    }
  }

  /**
   * Deletes a blob or multiple blobs
   * @param {string|Array<string>} blobNames - Blob name(s)
   * @param {Object} [options] - Delete options
   * @param {boolean} [options.deleteSnapshots=true] - Delete snapshots
   * @returns {Promise<Object>} Deletion result
   * @throws {AppError} If deletion fails
   */
  async deleteFile(blobNames, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();
    const isMultiple = Array.isArray(blobNames);

    try {
      logger.info('Deleting blob(s) from Azure', {
        correlationId,
        count: isMultiple ? blobNames.length : 1,
        container: this.#config.containerName
      });

      let result;
      if (isMultiple) {
        result = await this.#deleteMultipleBlobs(blobNames, options);
      } else {
        result = await this.#deleteSingleBlob(blobNames, options);
      }

      logger.info('Blob(s) deleted successfully', {
        correlationId,
        deleted: result.deleted,
        errors: result.errors?.length || 0
      });

      return result;

    } catch (error) {
      logger.error('Blob deletion failed', {
        correlationId,
        error: error.message
      });

      throw this.#handleAzureError(error, correlationId);
    }
  }

  /**
   * Generates a SAS URL for blob access
   * @param {string} blobName - Blob name
   * @param {Object} [options] - SAS URL options
   * @param {Array<string>} [options.permissions=['read']] - Permissions
   * @param {number} [options.expiresIn=3600] - Expiry in seconds
   * @param {string} [options.contentType] - Content type override
   * @param {string} [options.contentDisposition] - Content disposition
   * @returns {Promise<Object>} SAS URL and metadata
   * @throws {AppError} If URL generation fails
   */
  async getPresignedUrl(blobName, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      // Check cache first
      const cacheKey = `azure:sas:${this.#config.containerName}:${blobName}:${options.permissions?.join(',')}`;
      const cached = await this.#cacheService.get(cacheKey);
      
      if (cached && options.useCache !== false) {
        logger.debug('SAS URL retrieved from cache', { correlationId, blobName });
        return cached;
      }

      logger.info('Generating SAS URL', {
        correlationId,
        blobName,
        permissions: options.permissions,
        expiresIn: options.expiresIn || this.#config.sasTokenExpiry
      });

      if (!this.#sharedKeyCredential) {
        throw new AppError(
          'Shared key credential required for SAS generation',
          400,
          ERROR_CODES.CONFIGURATION_ERROR
        );
      }

      // Set permissions
      const permissions = new BlobSASPermissions();
      const permissionList = options.permissions || ['read'];
      
      permissionList.forEach(permission => {
        switch (permission.toLowerCase()) {
          case 'read':
            permissions.read = true;
            break;
          case 'write':
            permissions.write = true;
            break;
          case 'delete':
            permissions.delete = true;
            break;
          case 'create':
            permissions.create = true;
            break;
          case 'add':
            permissions.add = true;
            break;
          case 'list':
            permissions.list = true;
            break;
        }
      });

      // Calculate expiry
      const expiresIn = options.expiresIn || this.#config.sasTokenExpiry;
      const startsOn = new Date();
      const expiresOn = new Date(startsOn.getTime() + expiresIn * 1000);

      // Generate SAS token
      const sasToken = generateBlobSASQueryParameters(
        {
          containerName: this.#config.containerName,
          blobName: blobName,
          permissions,
          startsOn,
          expiresOn,
          contentType: options.contentType,
          contentDisposition: options.contentDisposition
        },
        this.#sharedKeyCredential
      ).toString();

      const blobClient = this.#containerClient.getBlobClient(blobName);
      const sasUrl = `${blobClient.url}?${sasToken}`;

      const result = {
        url: sasUrl,
        expiresAt: expiresOn.toISOString(),
        permissions: permissionList,
        blobName,
        container: this.#config.containerName
      };

      // Cache the URL
      const cacheTTL = Math.min(expiresIn - 300, this.#config.cacheTTL.sasUrl);
      await this.#cacheService.set(cacheKey, result, cacheTTL);

      return result;

    } catch (error) {
      logger.error('SAS URL generation failed', {
        correlationId,
        blobName,
        error: error.message
      });

      throw this.#handleAzureError(error, correlationId);
    }
  }

  /**
   * Gets blob metadata without downloading content
   * @param {string} blobName - Blob name
   * @param {Object} [options] - Metadata options
   * @returns {Promise<Object>} Blob metadata
   * @throws {AppError} If metadata retrieval fails
   */
  async getFileMetadata(blobName, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      // Check cache first
      const cacheKey = `azure:metadata:${this.#config.containerName}:${blobName}`;
      const cached = await this.#cacheService.get(cacheKey);
      
      if (cached && options.useCache !== false) {
        logger.debug('Blob metadata retrieved from cache', { correlationId, blobName });
        return cached;
      }

      logger.info('Retrieving blob metadata', {
        correlationId,
        blobName,
        container: this.#config.containerName
      });

      const blobClient = this.#containerClient.getBlobClient(blobName);
      const properties = await blobClient.getProperties();

      const metadata = {
        blobName,
        size: properties.contentLength,
        contentType: properties.contentType,
        etag: properties.etag,
        lastModified: properties.lastModified,
        blobType: properties.blobType,
        accessTier: properties.accessTier,
        accessTierChangeTime: properties.accessTierChangeTime,
        leaseState: properties.leaseState,
        leaseStatus: properties.leaseStatus,
        contentMD5: properties.contentMD5,
        customMetadata: properties.metadata,
        cacheControl: properties.cacheControl,
        contentDisposition: properties.contentDisposition,
        contentEncoding: properties.contentEncoding,
        contentLanguage: properties.contentLanguage
      };

      // Cache metadata
      await this.#cacheService.set(cacheKey, metadata, this.#config.cacheTTL.metadata);

      return metadata;

    } catch (error) {
      logger.error('Blob metadata retrieval failed', {
        correlationId,
        blobName,
        error: error.message
      });

      throw this.#handleAzureError(error, correlationId);
    }
  }

  /**
   * Lists blobs in the container
   * @param {Object} [options] - List options
   * @param {string} [options.prefix] - Blob name prefix
   * @param {number} [options.maxPageSize=100] - Max results per page
   * @param {string} [options.continuationToken] - Pagination token
   * @returns {Promise<Object>} List of blobs and metadata
   * @throws {AppError} If listing fails
   */
  async listFiles(options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      logger.info('Listing blobs in Azure container', {
        correlationId,
        container: this.#config.containerName,
        prefix: options.prefix,
        maxPageSize: options.maxPageSize
      });

      const listOptions = {
        prefix: options.prefix,
        includeMetadata: true,
        includeSnapshots: false,
        includeTags: true
      };

      const blobs = [];
      let continuationToken = options.continuationToken;
      
      const iterator = this.#containerClient
        .listBlobsFlat(listOptions)
        .byPage({ 
          continuationToken,
          maxPageSize: options.maxPageSize || 100 
        });

      const page = await iterator.next();
      
      if (!page.done) {
        for (const blob of page.value.segment.blobItems) {
          blobs.push({
            name: blob.name,
            size: blob.properties.contentLength,
            lastModified: blob.properties.lastModified,
            etag: blob.properties.etag,
            contentType: blob.properties.contentType,
            accessTier: blob.properties.accessTier,
            blobType: blob.properties.blobType,
            metadata: blob.metadata,
            tags: blob.tags
          });
        }
        
        continuationToken = page.value.continuationToken;
      }

      return {
        blobs,
        continuationToken,
        hasMore: !!continuationToken
      };

    } catch (error) {
      logger.error('Blob listing failed', {
        correlationId,
        error: error.message
      });

      throw this.#handleAzureError(error, correlationId);
    }
  }

  /**
   * Copies a blob within Azure Storage
   * @param {Object} copyData - Copy operation data
   * @param {string} copyData.sourceBlobName - Source blob name
   * @param {string} copyData.destinationBlobName - Destination blob name
   * @param {string} [copyData.sourceContainer] - Source container
   * @param {string} [copyData.destinationContainer] - Destination container
   * @param {Object} [copyData.metadata] - New metadata
   * @param {string} [copyData.accessTier] - New access tier
   * @param {Object} [options] - Copy options
   * @returns {Promise<Object>} Copy result
   * @throws {AppError} If copy fails
   */
  async copyFile(copyData, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      logger.info('Copying blob in Azure', {
        correlationId,
        sourceBlobName: copyData.sourceBlobName,
        destinationBlobName: copyData.destinationBlobName
      });

      const sourceContainer = copyData.sourceContainer || this.#config.containerName;
      const destinationContainer = copyData.destinationContainer || this.#config.containerName;

      // Get source blob URL
      const sourceBlobClient = this.#blobServiceClient
        .getContainerClient(sourceContainer)
        .getBlobClient(copyData.sourceBlobName);

      // Get destination blob client
      const destContainerClient = this.#blobServiceClient.getContainerClient(destinationContainer);
      const destBlobClient = destContainerClient.getBlobClient(copyData.destinationBlobName);

      // Start copy operation
      const copyPoller = await destBlobClient.beginCopyFromURL(sourceBlobClient.url, {
        metadata: copyData.metadata,
        tier: copyData.accessTier || this.#config.defaultAccessTier
      });

      // Wait for copy to complete
      const result = await copyPoller.pollUntilDone();

      logger.info('Blob copied successfully', {
        correlationId,
        copyId: result.copyId,
        copyStatus: result.copyStatus
      });

      return {
        success: true,
        sourceBlobName: copyData.sourceBlobName,
        destinationBlobName: copyData.destinationBlobName,
        copyId: result.copyId,
        copyStatus: result.copyStatus,
        etag: result.etag,
        lastModified: result.lastModified
      };

    } catch (error) {
      logger.error('Blob copy failed', {
        correlationId,
        error: error.message
      });

      throw this.#handleAzureError(error, correlationId);
    }
  }

  /**
   * Updates blob access tier
   * @param {string} blobName - Blob name
   * @param {string} accessTier - New access tier
   * @param {Object} [options] - Tier options
   * @returns {Promise<Object>} Tier update result
   * @throws {AppError} If tier update fails
   */
  async updateAccessTier(blobName, accessTier, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      logger.info('Updating blob access tier', {
        correlationId,
        blobName,
        accessTier
      });

      // Validate access tier
      if (!Object.values(AzureBlobService.#ACCESS_TIERS).includes(accessTier)) {
        throw new AppError(
          'Invalid access tier',
          400,
          ERROR_CODES.VALIDATION_ERROR,
          { accessTier, validOptions: Object.values(AzureBlobService.#ACCESS_TIERS) }
        );
      }

      const blobClient = this.#containerClient.getBlobClient(blobName);
      await blobClient.setAccessTier(accessTier);

      // Clear metadata cache
      await this.#cacheService.delete(`azure:metadata:${this.#config.containerName}:${blobName}`);

      logger.info('Blob access tier updated successfully', {
        correlationId,
        blobName,
        accessTier
      });

      return {
        success: true,
        blobName,
        accessTier
      };

    } catch (error) {
      logger.error('Access tier update failed', {
        correlationId,
        blobName,
        error: error.message
      });

      throw this.#handleAzureError(error, correlationId);
    }
  }

  /**
   * Creates a snapshot of a blob
   * @param {string} blobName - Blob name
   * @param {Object} [options] - Snapshot options
   * @returns {Promise<Object>} Snapshot result
   * @throws {AppError} If snapshot creation fails
   */
  async createSnapshot(blobName, options = {}) {
    const correlationId = options.correlationId || this.#generateCorrelationId();

    try {
      logger.info('Creating blob snapshot', {
        correlationId,
        blobName
      });

      const blobClient = this.#containerClient.getBlobClient(blobName);
      const snapshotResponse = await blobClient.createSnapshot();

      logger.info('Blob snapshot created successfully', {
        correlationId,
        blobName,
        snapshot: snapshotResponse.snapshot
      });

      return {
        success: true,
        blobName,
        snapshot: snapshotResponse.snapshot,
        etag: snapshotResponse.etag,
        lastModified: snapshotResponse.lastModified
      };

    } catch (error) {
      logger.error('Snapshot creation failed', {
        correlationId,
        blobName,
        error: error.message
      });

      throw this.#handleAzureError(error, correlationId);
    }
  }

  /**
   * @private
   * Ensures container exists
   */
  async #ensureContainer() {
    try {
      const exists = await this.#containerClient.exists();
      
      if (!exists && this.#config.createContainerIfNotExists) {
        logger.info('Creating container', {
          containerName: this.#config.containerName
        });
        
        await this.#containerClient.create({
          access: this.#config.defaultPublicAccessLevel || AzureBlobService.#PUBLIC_ACCESS_LEVELS.NONE
        });
      }
    } catch (error) {
      logger.error('Container check/creation failed', error);
    }
  }

  /**
   * @private
   * Deletes a single blob
   */
  async #deleteSingleBlob(blobName, options) {
    const blobClient = this.#containerClient.getBlobClient(blobName);
    
    const deleteOptions = {
      deleteSnapshots: options.deleteSnapshots !== false ? 'include' : undefined
    };

    await blobClient.delete(deleteOptions);

    // Clear caches
    await this.#clearBlobCaches(blobName);

    return {
      success: true,
      deleted: 1,
      blobName
    };
  }

  /**
   * @private
   * Deletes multiple blobs
   */
  async #deleteMultipleBlobs(blobNames, options) {
    const results = {
      deleted: 0,
      errors: []
    };

    // Azure doesn't have batch delete, so delete individually
    for (const blobName of blobNames) {
      try {
        await this.#deleteSingleBlob(blobName, options);
        results.deleted++;
      } catch (error) {
        results.errors.push({
          blobName,
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

    // Validate blob name
    if (!fileData.blobName || fileData.blobName.length === 0) {
      errors.push('Blob name is required');
    } else if (fileData.blobName.length > 1024) {
      errors.push('Blob name exceeds maximum length of 1024 characters');
    }

    // Validate content
    if (!fileData.content) {
      errors.push('File content is required');
    }

    // Validate file type
    if (fileData.contentType) {
      const extension = fileData.blobName.split('.').pop().toLowerCase();
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
   * Converts stream to buffer
   */
  async #streamToBuffer(readableStream) {
    const chunks = [];
    for await (const chunk of readableStream) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  /**
   * @private
   * Clears all caches for a blob
   */
  async #clearBlobCaches(blobName) {
    const cacheKeys = [
      `azure:metadata:${this.#config.containerName}:${blobName}`,
      `azure:properties:${this.#config.containerName}:${blobName}`,
      `azure:sas:${this.#config.containerName}:${blobName}:*`
    ];

    for (const cacheKey of cacheKeys) {
      await this.#cacheService.delete(cacheKey);
    }
  }

  /**
   * @private
   * Handles Azure Storage errors
   */
  #handleAzureError(error, correlationId) {
    if (error instanceof AppError) {
      return error;
    }

    const errorCode = error.code || error.statusCode;
    const errorMessage = AzureBlobService.#AZURE_ERRORS[errorCode] || error.message || 'Azure Blob operation failed';

    let statusCode = 500;
    let appErrorCode = ERROR_CODES.STORAGE_ERROR;

    switch (errorCode) {
      case 'ContainerNotFound':
      case 'BlobNotFound':
        statusCode = 404;
        appErrorCode = ERROR_CODES.NOT_FOUND;
        break;
      case 'ContainerAlreadyExists':
      case 'BlobAlreadyExists':
        statusCode = 409;
        appErrorCode = ERROR_CODES.CONFLICT;
        break;
      case 'AuthenticationFailed':
        statusCode = 401;
        appErrorCode = ERROR_CODES.AUTHENTICATION_ERROR;
        break;
      case 'AuthorizationFailure':
      case 'InsufficientAccountPermissions':
        statusCode = 403;
        appErrorCode = ERROR_CODES.FORBIDDEN;
        break;
      case 'InvalidBlobOrBlock':
      case 'InvalidBlockList':
      case 'RequestBodyTooLarge':
        statusCode = 400;
        appErrorCode = ERROR_CODES.VALIDATION_ERROR;
        break;
      case 'AccountIsDisabled':
        statusCode = 403;
        appErrorCode = ERROR_CODES.ACCOUNT_DISABLED;
        break;
    }

    return new AppError(
      errorMessage,
      statusCode,
      appErrorCode,
      {
        correlationId,
        azureError: errorCode,
        container: this.#config.containerName,
        requestId: error.details?.requestId,
        originalError: error.message
      }
    );
  }

  /**
   * @private
   * Generates correlation ID
   */
  #generateCorrelationId() {
    return `azure_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
      // Check container exists as health check
      const exists = await this.#containerClient.exists();
      
      return {
        healthy: exists,
        service: 'AzureBlobService',
        container: this.#config.containerName,
        accountName: this.#config.accountName,
        activeUploads: this.#activeUploads.size
      };
    } catch (error) {
      logger.error('Azure Blob health check failed', { error: error.message });
      
      return {
        healthy: false,
        service: 'AzureBlobService',
        container: this.#config.containerName,
        accountName: this.#config.accountName,
        error: error.message
      };
    }
  }
}

module.exports = AzureBlobService;