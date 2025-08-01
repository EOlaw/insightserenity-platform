'use strict';

/**
 * @fileoverview Audit Service Factory for Enterprise Configuration Integration
 * @module shared/lib/security/audit/audit-service-factory
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/security/audit/audit-service
 * @requires module:shared/lib/security/audit/audit-logger
 * @requires module:shared/lib/security/audit/audit-events
 * @requires module:shared/lib/security/audit/compliance-reporter
 * @requires module:shared/lib/security/audit/audit-trail
 * @requires module:shared/lib/security/encryption/encryption-service
 * @requires module:shared/lib/database
 */

const logger = require('../../utils/logger');
const AuditService = require('./audit-service');
const AuditLogger = require('./audit-logger');
const AuditEvents = require('./audit-events');
const ComplianceReporter = require('./compliance-reporter');
const AuditTrail = require('./audit-trail');
const EncryptionService = require('../encryption/encryption-service');
const Database = require('../../database');

/**
 * @class AuditServiceFactory
 * @description Factory for creating properly configured audit services with enterprise settings
 */
class AuditServiceFactory {
  /**
   * @private
   * @static
   * @type {AuditService}
   */
  static #instance = null;

  /**
   * @private
   * @static
   * @type {Object}
   */
  static #enterpriseConfig = null;

  /**
   * @private
   * @static
   * @type {boolean}
   */
  static #initialized = false;

  /**
   * Initialize the factory with enterprise audit configuration
   * @param {Object} enterpriseConfig - Enterprise audit configuration
   * @returns {void}
   */
  static initialize(enterpriseConfig) {
    if (AuditServiceFactory.#initialized) {
      logger.debug('AuditServiceFactory already initialized');
      return;
    }

    AuditServiceFactory.#enterpriseConfig = enterpriseConfig;
    AuditServiceFactory.#initialized = true;

    logger.info('AuditServiceFactory initialized with enterprise configuration', {
      enabled: enterpriseConfig.enabled,
      environment: enterpriseConfig.environment,
      storageType: enterpriseConfig.storage?.type,
      batchSize: enterpriseConfig.processing?.batchSize,
      flushInterval: enterpriseConfig.processing?.flushInterval,
      logEmptyFlushes: enterpriseConfig.processing?.logEmptyFlushes
    });
  }

  /**
   * Get or create singleton audit service instance
   * @returns {AuditService} Configured audit service instance
   */
  static getInstance() {
    if (!AuditServiceFactory.#initialized) {
      throw new Error('AuditServiceFactory must be initialized with enterprise configuration before use');
    }

    if (!AuditServiceFactory.#instance) {
      AuditServiceFactory.#instance = AuditServiceFactory.#createAuditService();
    }

    return AuditServiceFactory.#instance;
  }

  /**
   * Create a new audit service instance with enterprise configuration
   * @returns {AuditService} Configured audit service
   * @private
   */
  static #createAuditService() {
    const config = AuditServiceFactory.#enterpriseConfig;
    
    if (!config) {
      throw new Error('Enterprise audit configuration not available');
    }

    // Map enterprise configuration to service options
    const serviceOptions = {
      config: config, // Pass full enterprise config
      database: Database,
      enableEncryption: config.security?.enableEncryption ?? true,
      enableBatching: config.processing?.enableBuffering ?? true,
      batchSize: config.processing?.batchSize ?? 100,
      flushInterval: config.processing?.flushInterval ?? 30000,
      enableCompliance: AuditServiceFactory.#isComplianceEnabled(config),
      complianceConfig: config.compliance || {},
      enableRiskScoring: config.riskScoring?.enabled ?? true,
      retentionPolicy: {
        days: config.retention?.retentionDays ?? 365
      }
    };

    // Apply environment-specific optimizations
    if (config.environment === 'development') {
      serviceOptions.batchSize = config.development?.reducedBatchSize ?? serviceOptions.batchSize;
      serviceOptions.flushInterval = config.development?.reducedFlushInterval ?? serviceOptions.flushInterval;
      
      logger.info('Applied development optimizations to audit service', {
        originalBatchSize: config.processing?.batchSize,
        optimizedBatchSize: serviceOptions.batchSize,
        originalFlushInterval: config.processing?.flushInterval,
        optimizedFlushInterval: serviceOptions.flushInterval
      });
    }

    logger.info('Creating audit service with enterprise configuration', {
      storageType: config.storage?.type,
      encryptionEnabled: serviceOptions.enableEncryption,
      batchingEnabled: serviceOptions.enableBatching,
      batchSize: serviceOptions.batchSize,
      flushInterval: serviceOptions.flushInterval,
      complianceEnabled: serviceOptions.enableCompliance,
      riskScoringEnabled: serviceOptions.enableRiskScoring
    });

    return new AuditService(serviceOptions);
  }

  /**
   * Create audit logger with enterprise configuration
   * @returns {AuditLogger} Configured audit logger
   */
  static createAuditLogger() {
    const config = AuditServiceFactory.#enterpriseConfig;
    
    if (!config) {
      throw new Error('Enterprise audit configuration not available');
    }

    const loggerOptions = {
      storageType: config.storage?.type ?? 'database',
      database: Database,
      enableEncryption: config.security?.enableEncryption ?? true,
      enableCompression: config.storage?.enableCompression ?? true,
      batchSize: config.processing?.batchSize ?? 100,
      enableBuffering: config.processing?.enableBuffering ?? true,
      fileOptions: {
        basePath: config.storage?.file?.basePath ?? './logs/audit',
        rotationType: config.storage?.file?.rotationType ?? 'daily',
        maxFileSize: config.storage?.file?.maxFileSize ?? (100 * 1024 * 1024),
        maxFiles: config.storage?.file?.maxFiles ?? 30
      },
      remoteOptions: {
        endpoint: config.storage?.remote?.endpoint,
        apiKey: config.storage?.remote?.apiKey,
        timeout: config.storage?.remote?.timeout ?? 30000,
        retryAttempts: config.storage?.remote?.retryAttempts ?? 3
      }
    };

    return new AuditLogger(loggerOptions);
  }

  /**
   * Create compliance reporter with enterprise configuration
   * @returns {ComplianceReporter} Configured compliance reporter
   */
  static createComplianceReporter() {
    const config = AuditServiceFactory.#enterpriseConfig;
    
    if (!config || !AuditServiceFactory.#isComplianceEnabled(config)) {
      return null;
    }

    const reporterOptions = {
      database: Database,
      standards: config.compliance?.standards ?? {},
      reporting: config.compliance?.reporting ?? {},
      dataClassification: config.compliance?.dataClassification ?? {}
    };

    return new ComplianceReporter(reporterOptions);
  }

  /**
   * Create audit trail with enterprise configuration
   * @returns {AuditTrail} Configured audit trail
   */
  static createAuditTrail() {
    const config = AuditServiceFactory.#enterpriseConfig;
    
    if (!config) {
      throw new Error('Enterprise audit configuration not available');
    }

    const trailOptions = {
      database: Database,
      enableEncryption: config.security?.enableEncryption ?? true,
      enableCaching: config.performance?.enableCaching ?? true,
      cacheTimeout: config.performance?.cacheTimeout ?? 300
    };

    return new AuditTrail(trailOptions);
  }

  /**
   * Create encryption service with enterprise configuration
   * @returns {EncryptionService} Configured encryption service
   */
  static createEncryptionService() {
    const config = AuditServiceFactory.#enterpriseConfig;
    
    if (!config || !config.security?.enableEncryption) {
      return null;
    }

    const encryptionOptions = {
      algorithm: config.security?.encryptionAlgorithm ?? 'aes-256-gcm',
      keyRotationDays: config.security?.keyRotationDays ?? 90
    };

    return new EncryptionService(encryptionOptions);
  }

  /**
   * Get enterprise audit configuration
   * @returns {Object} Enterprise audit configuration
   */
  static getConfig() {
    return AuditServiceFactory.#enterpriseConfig;
  }

  /**
   * Check if audit system is enabled
   * @returns {boolean} True if audit system is enabled
   */
  static isEnabled() {
    return AuditServiceFactory.#enterpriseConfig?.enabled ?? false;
  }

  /**
   * Check if compliance reporting is enabled
   * @param {Object} config - Enterprise configuration
   * @returns {boolean} True if any compliance standard is enabled
   * @private
   */
  static #isComplianceEnabled(config) {
    const standards = config.compliance?.standards ?? {};
    return Object.values(standards).some(enabled => enabled === true);
  }

  /**
   * Validate enterprise configuration
   * @param {Object} config - Configuration to validate
   * @throws {Error} If configuration is invalid
   */
  static validateConfig(config) {
    if (!config) {
      throw new Error('Audit configuration is required');
    }

    if (typeof config.enabled !== 'boolean') {
      throw new Error('Audit configuration must specify enabled status');
    }

    if (config.enabled) {
      if (!config.processing) {
        throw new Error('Processing configuration is required when audit is enabled');
      }

      if (!config.storage) {
        throw new Error('Storage configuration is required when audit is enabled');
      }

      const validStorageTypes = ['file', 'database', 'remote', 'hybrid'];
      if (!validStorageTypes.includes(config.storage.type)) {
        throw new Error(`Invalid storage type: ${config.storage.type}. Must be one of: ${validStorageTypes.join(', ')}`);
      }

      if (config.processing.batchSize && (config.processing.batchSize < 1 || config.processing.batchSize > 10000)) {
        throw new Error('Batch size must be between 1 and 10000');
      }

      if (config.processing.flushInterval && config.processing.flushInterval < 1000) {
        throw new Error('Flush interval must be at least 1000ms');
      }
    }

    logger.info('Enterprise audit configuration validation passed');
  }

  /**
   * Reset factory instance (for testing)
   * @returns {void}
   */
  static reset() {
    AuditServiceFactory.#instance = null;
    AuditServiceFactory.#enterpriseConfig = null;
    AuditServiceFactory.#initialized = false;
    
    logger.debug('AuditServiceFactory reset');
  }

  /**
   * Get factory status
   * @returns {Object} Factory status information
   */
  static getStatus() {
    return {
      initialized: AuditServiceFactory.#initialized,
      hasInstance: AuditServiceFactory.#instance !== null,
      configLoaded: AuditServiceFactory.#enterpriseConfig !== null,
      enabled: AuditServiceFactory.isEnabled(),
      environment: AuditServiceFactory.#enterpriseConfig?.environment,
      storageType: AuditServiceFactory.#enterpriseConfig?.storage?.type
    };
  }
}

module.exports = AuditServiceFactory;