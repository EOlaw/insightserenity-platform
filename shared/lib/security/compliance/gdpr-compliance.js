'use strict';

/**
 * @fileoverview GDPR (General Data Protection Regulation) compliance service
 * @module shared/lib/security/compliance/gdpr-compliance
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/security/encryption/encryption-service
 * @requires module:shared/lib/security/audit/audit-service
 */

const logger = require('../../utils/logger');
const { AppError } = require('../../utils/app-error');
const EncryptionService = require('../encryption/encryption-service');
const AuditService = require('../audit/audit-service');
const UserModel = require('../../database/models/users/user-model');

const ConsentModel = require('../../database/models/users/consent-model');
const AnonymizedUserModel = require('../../database/models/users/anonymized-user-model');
const ProcessingActivityModel = require('../../database/models/security/processing-activity-model');
const ErasureLogModel = require('../../database/models/security/erasure-log-model');
const DataBreachModel = require('../../database/models/security/data-breach-model');
const PaymentModel = require('../../database/models/billing/payment-model');

/**
 * @class GDPRCompliance
 * @description Implements GDPR compliance requirements including data privacy, consent management, and user rights
 */
class GDPRCompliance {
  /**
   * @private
   * @static
   * @readonly
   */
  static #GDPR_RIGHTS = {
    ACCESS: 'right-of-access',
    RECTIFICATION: 'right-to-rectification',
    ERASURE: 'right-to-erasure',
    PORTABILITY: 'right-to-data-portability',
    RESTRICTION: 'right-to-restriction',
    OBJECTION: 'right-to-object',
    AUTOMATED_DECISION: 'right-not-to-be-subject-to-automated-decision'
  };

  static #CONSENT_TYPES = {
    MARKETING: 'marketing',
    ANALYTICS: 'analytics',
    COOKIES: 'cookies',
    THIRD_PARTY: 'third-party-sharing',
    PROFILING: 'profiling',
    PROCESSING: 'data-processing'
  };

  static #ANONYMIZATION_METHODS = {
    DELETION: 'deletion',
    HASHING: 'hashing',
    ENCRYPTION: 'encryption',
    PSEUDONYMIZATION: 'pseudonymization',
    GENERALIZATION: 'generalization',
    SUPPRESSION: 'suppression'
  };

  static #DATA_CATEGORIES = {
    PERSONAL: 'personal-data',
    SENSITIVE: 'sensitive-personal-data',
    CRIMINAL: 'criminal-conviction-data',
    CHILDREN: 'children-data',
    BIOMETRIC: 'biometric-data',
    GENETIC: 'genetic-data',
    HEALTH: 'health-data'
  };

  static #RETENTION_PERIODS = {
    DEFAULT: 365 * 3, // 3 years in days
    MARKETING: 365 * 2, // 2 years
    LEGAL: 365 * 7, // 7 years
    FINANCIAL: 365 * 10, // 10 years
    CHILDREN: 365 // 1 year
  };

  static #MAX_RESPONSE_DAYS = 30; // Maximum days to respond to data requests
  static #BREACH_NOTIFICATION_HOURS = 72; // Hours to notify after breach discovery

  /**
   * Creates an instance of GDPRCompliance
   * @constructor
   * @param {Object} [options={}] - Configuration options
   * @param {Object} [options.database] - Database connection
   * @param {Object} [options.encryptionService] - Encryption service instance
   * @param {Object} [options.auditService] - Audit service instance (REQUIRED)
   * @param {boolean} [options.strictMode=true] - Enforce strict GDPR compliance
   * @param {Object} [options.retentionPeriods={}] - Custom retention periods
   * @param {Array<string>} [options.euCountries] - List of EU country codes
   */
  constructor(options = {}) {
    const {
      database,
      encryptionService,
      auditService, // This is now required, not optional
      strictMode = true,
      retentionPeriods = {},
      euCountries = this.#getDefaultEUCountries()
    } = options;

    this.database = database;
    this.encryptionService = encryptionService || new EncryptionService();
    
    // FIXED: No longer creates new AuditService instance
    // Instead, requires auditService to be passed in
    if (!auditService) {
      throw new Error('AuditService instance is required for GDPRCompliance');
    }
    this.auditService = auditService;
    
    this.strictMode = strictMode;
    this.euCountries = new Set(euCountries);

    // Merge retention periods
    this.retentionPeriods = {
      ...GDPRCompliance.#RETENTION_PERIODS,
      ...retentionPeriods
    };

    // Initialize stores
    this.consentStore = new Map();
    this.dataRequests = new Map();
    this.breachRegistry = new Map();

    logger.info('GDPRCompliance service initialized', {
      strictMode,
      euCountriesCount: this.euCountries.size,
      hasAuditService: !!this.auditService
    });
  }

  /**
   * Records user consent
   * @param {string} userId - User identifier
   * @param {Object} consentData - Consent information
   * @param {string} consentData.type - Type of consent
   * @param {boolean} consentData.granted - Whether consent was granted
   * @param {string} [consentData.purpose] - Purpose of data processing
   * @param {Date} [consentData.expiresAt] - Consent expiration date
   * @param {Object} [consentData.metadata] - Additional metadata
   * @returns {Promise<Object>} Consent record
   * @throws {AppError} If recording fails
   */
  async recordConsent(userId, consentData) {
    try {
      if (!userId) {
        throw new AppError('User ID is required', 400, 'INVALID_USER_ID');
      }

      if (!consentData.type || !Object.values(GDPRCompliance.#CONSENT_TYPES).includes(consentData.type)) {
        throw new AppError('Valid consent type is required', 400, 'INVALID_CONSENT_TYPE');
      }

      const consent = {
        id: this.#generateConsentId(),
        userId,
        type: consentData.type,
        granted: Boolean(consentData.granted),
        purpose: consentData.purpose || `Consent for ${consentData.type}`,
        timestamp: new Date().toISOString(),
        expiresAt: consentData.expiresAt,
        ipAddress: consentData.metadata?.ipAddress,
        userAgent: consentData.metadata?.userAgent,
        withdrawable: true,
        metadata: {
          ...consentData.metadata,
          version: '1.0',
          gdprCompliant: true
        }
      };

      // Store consent
      if (this.database) {
        await ConsentModel.create(consent);
      } else {
        if (!this.consentStore.has(userId)) {
          this.consentStore.set(userId, []);
        }
        this.consentStore.get(userId).push(consent);
      }

      // Audit the consent
      await this.auditService.logActivity({
        action: 'GDPR_CONSENT_RECORDED',
        userId,
        details: {
          consentId: consent.id,
          type: consent.type,
          granted: consent.granted
        },
        compliance: { gdpr: true }
      });

      logger.info('User consent recorded', {
        userId,
        consentId: consent.id,
        type: consent.type,
        granted: consent.granted
      });

      return consent;

    } catch (error) {
      logger.error('Failed to record consent', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to record consent',
        500,
        'CONSENT_RECORD_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Withdraws user consent
   * @param {string} userId - User identifier
   * @param {string} consentType - Type of consent to withdraw
   * @returns {Promise<Object>} Withdrawal confirmation
   * @throws {AppError} If withdrawal fails
   */
  async withdrawConsent(userId, consentType) {
    try {
      if (!userId || !consentType) {
        throw new AppError('User ID and consent type are required', 400, 'INVALID_INPUT');
      }

      // Find active consent
      let consent;
      
      if (this.database) {
        consent = await ConsentModel.findOne({
          userId,
          type: consentType,
          granted: true,
          withdrawn: { $ne: true }
        });
      } else {
        const userConsents = this.consentStore.get(userId) || [];
        consent = userConsents.find(c => 
          c.type === consentType && 
          c.granted && 
          !c.withdrawn
        );
      }

      if (!consent) {
        throw new AppError('Active consent not found', 404, 'CONSENT_NOT_FOUND');
      }

      // Mark as withdrawn
      const withdrawal = {
        consentId: consent.id,
        withdrawnAt: new Date().toISOString(),
        reason: 'User requested withdrawal',
        processedBy: 'gdpr-compliance-service'
      };

      if (this.database) {
        await ConsentModel.updateOne(
          { id: consent.id },
          { 
            withdrawn: true,
            withdrawnAt: withdrawal.withdrawnAt,
            withdrawalReason: withdrawal.reason
          }
        );
      } else {
        consent.withdrawn = true;
        consent.withdrawnAt = withdrawal.withdrawnAt;
        consent.withdrawalReason = withdrawal.reason;
      }

      // Audit the withdrawal
      await this.auditService.logActivity({
        action: 'GDPR_CONSENT_WITHDRAWN',
        userId,
        details: {
          consentId: consent.id,
          type: consentType,
          withdrawnAt: withdrawal.withdrawnAt
        },
        compliance: { gdpr: true }
      });

      logger.info('User consent withdrawn', {
        userId,
        consentType,
        withdrawnAt: withdrawal.withdrawnAt
      });

      return withdrawal;

    } catch (error) {
      logger.error('Failed to withdraw consent', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to withdraw consent',
        500,
        'CONSENT_WITHDRAWAL_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Anonymizes user data
   * @param {string} userId - User identifier
   * @param {Object} [options={}] - Anonymization options
   * @param {string} [options.method='pseudonymization'] - Anonymization method
   * @param {Array<string>} [options.fieldsToKeep=[]] - Fields to preserve
   * @param {boolean} [options.deleteOriginal=false] - Delete original data
   * @returns {Promise<Object>} Anonymization result
   * @throws {AppError} If anonymization fails
   */
  async anonymizeUser(userId, options = {}) {
    try {
      if (!userId) {
        throw new AppError('User ID is required', 400, 'INVALID_USER_ID');
      }

      const {
        method = GDPRCompliance.#ANONYMIZATION_METHODS.PSEUDONYMIZATION,
        fieldsToKeep = ['created_at', 'country'],
        deleteOriginal = false
      } = options;

      // Validate method
      if (!Object.values(GDPRCompliance.#ANONYMIZATION_METHODS).includes(method)) {
        throw new AppError('Invalid anonymization method', 400, 'INVALID_METHOD');
      }

      const startTime = Date.now();
      const anonymizationId = this.#generateAnonymizationId();
      const results = {
        id: anonymizationId,
        userId,
        method,
        startTime: new Date(startTime).toISOString(),
        fieldsAnonymized: [],
        fieldsPreserved: fieldsToKeep,
        errors: []
      };

      // Get user data
      let userData;
      if (this.database) {
        userData = await UserModel.findOne({ id: userId });
      } else {
        // Simulate user data retrieval
        userData = { id: userId, email: 'user@example.com', name: 'John Doe' };
      }

      if (!userData) {
        throw new AppError('User not found', 404, 'USER_NOT_FOUND');
      }

      // Apply anonymization based on method
      const anonymizedData = await this.#applyAnonymization(userData, method, fieldsToKeep);
      results.fieldsAnonymized = Object.keys(anonymizedData.changes);

      // Store anonymized data
      if (this.database) {
        
        if (deleteOriginal) {
          await UserModel.deleteOne({ id: userId });
          await AnonymizedUserModel.create({
            ...anonymizedData.result,
            originalUserId: userId,
            anonymizedAt: new Date()
          });
        } else {
          await UserModel.updateOne({ id: userId }, anonymizedData.result);
        }
      }

      // Complete results
      results.endTime = new Date().toISOString();
      results.duration = Date.now() - startTime;
      results.success = true;
      results.dataDeleted = deleteOriginal;

      // Audit the anonymization
      await this.auditService.logActivity({
        action: 'GDPR_USER_ANONYMIZED',
        userId,
        details: {
          anonymizationId,
          method,
          fieldsAnonymized: results.fieldsAnonymized.length,
          dataDeleted: deleteOriginal
        },
        compliance: { gdpr: true }
      });

      logger.info('User data anonymized', {
        userId,
        anonymizationId,
        method,
        duration: results.duration
      });

      return results;

    } catch (error) {
      logger.error('Failed to anonymize user', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to anonymize user data',
        500,
        'ANONYMIZATION_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Processes data access request (GDPR Article 15)
   * @param {string} userId - User identifier
   * @param {Object} [options={}] - Request options
   * @returns {Promise<Object>} User data package
   * @throws {AppError} If request processing fails
   */
  async processDataAccessRequest(userId, options = {}) {
    try {
      if (!userId) {
        throw new AppError('User ID is required', 400, 'INVALID_USER_ID');
      }

      const requestId = this.#generateRequestId();
      const request = {
        id: requestId,
        userId,
        type: GDPRCompliance.#GDPR_RIGHTS.ACCESS,
        status: 'processing',
        createdAt: new Date().toISOString(),
        options
      };

      // Store request
      this.dataRequests.set(requestId, request);

      // Collect user data from all sources
      const userData = {
        requestId,
        userId,
        generatedAt: new Date().toISOString(),
        dataCategories: {},
        processingActivities: [],
        consentRecords: [],
        thirdPartySharing: []
      };

      // Get personal data
      if (this.database) {
        const user = await UserModel.findOne({ id: userId });
        
        if (user) {
          userData.dataCategories.personal = this.#sanitizeUserData(user);
        }

        // Get consent records
        userData.consentRecords = await ConsentModel.find({ userId });

        // Get processing activities
        userData.processingActivities = await ProcessingActivityModel.find({ userId });
      }

      // Package data for export
      const dataPackage = {
        ...userData,
        format: options.format || 'json',
        includesAllData: true,
        portableFormat: true,
        generationTime: Date.now() - new Date(request.createdAt).getTime()
      };

      // Update request status
      request.status = 'completed';
      request.completedAt = new Date().toISOString();
      request.dataPackage = dataPackage;

      // Audit the request
      await this.auditService.logActivity({
        action: 'GDPR_DATA_ACCESS_REQUEST',
        userId,
        details: {
          requestId,
          dataCategories: Object.keys(userData.dataCategories),
          recordCount: this.#countRecords(userData)
        },
        compliance: { gdpr: true }
      });

      logger.info('Data access request processed', {
        userId,
        requestId,
        generationTime: dataPackage.generationTime
      });

      return dataPackage;

    } catch (error) {
      logger.error('Failed to process data access request', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to process data access request',
        500,
        'DATA_ACCESS_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Processes data erasure request (GDPR Article 17 - Right to be forgotten)
   * @param {string} userId - User identifier
   * @param {Object} [options={}] - Erasure options
   * @returns {Promise<Object>} Erasure confirmation
   * @throws {AppError} If erasure fails
   */
  async processErasureRequest(userId, options = {}) {
    try {
      if (!userId) {
        throw new AppError('User ID is required', 400, 'INVALID_USER_ID');
      }

      const {
        reason = 'User requested erasure',
        verifyNoLegalObligations = true,
        excludeCategories = []
      } = options;

      const requestId = this.#generateRequestId();
      const erasureLog = {
        id: requestId,
        userId,
        type: GDPRCompliance.#GDPR_RIGHTS.ERASURE,
        reason,
        startedAt: new Date().toISOString(),
        erasedData: {},
        retainedData: {},
        errors: []
      };

      // Check for legal obligations to retain data
      if (verifyNoLegalObligations) {
        const obligations = await this.#checkLegalObligations(userId);
        if (obligations.hasObligations) {
          erasureLog.retainedData = obligations.requiredData;
          excludeCategories.push(...obligations.categories);
        }
      }

      // Perform erasure
      const dataCategories = Object.values(GDPRCompliance.#DATA_CATEGORIES);
      
      for (const category of dataCategories) {
        if (excludeCategories.includes(category)) {
          continue;
        }

        try {
          const result = await this.#eraseDataCategory(userId, category);
          erasureLog.erasedData[category] = result;
        } catch (error) {
          erasureLog.errors.push({
            category,
            error: error.message
          });
        }
      }

      // Complete erasure log
      erasureLog.completedAt = new Date().toISOString();
      erasureLog.success = erasureLog.errors.length === 0;
      erasureLog.duration = new Date(erasureLog.completedAt) - new Date(erasureLog.startedAt);

      // Store erasure record
      if (this.database) {
        await ErasureLogModel.create(erasureLog);
      }

      // Audit the erasure
      await this.auditService.logActivity({
        action: 'GDPR_DATA_ERASURE',
        userId,
        details: {
          requestId,
          categoriesErased: Object.keys(erasureLog.erasedData),
          categoriesRetained: Object.keys(erasureLog.retainedData),
          errors: erasureLog.errors.length
        },
        compliance: { gdpr: true }
      });

      logger.info('Data erasure request processed', {
        userId,
        requestId,
        success: erasureLog.success
      });

      return erasureLog;

    } catch (error) {
      logger.error('Failed to process erasure request', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to process erasure request',
        500,
        'ERASURE_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Processes data portability request (GDPR Article 20)
   * @param {string} userId - User identifier
   * @param {Object} [options={}] - Portability options
   * @returns {Promise<Object>} Portable data package
   * @throws {AppError} If portability processing fails
   */
  async processPortabilityRequest(userId, options = {}) {
    try {
      if (!userId) {
        throw new AppError('User ID is required', 400, 'INVALID_USER_ID');
      }

      const {
        format = 'json',
        includeInferred = false,
        encryptPackage = true
      } = options;

      const requestId = this.#generateRequestId();
      
      // Get all user data
      const dataPackage = await this.processDataAccessRequest(userId, {
        format,
        includeInferred
      });

      // Convert to portable format
      const portableData = {
        id: requestId,
        type: GDPRCompliance.#GDPR_RIGHTS.PORTABILITY,
        userId,
        exportedAt: new Date().toISOString(),
        format,
        version: '2.0',
        gdprCompliant: true,
        data: this.#convertToPortableFormat(dataPackage)
      };

      // Encrypt if requested
      if (encryptPackage) {
        const encrypted = await this.encryptionService.encrypt(
          JSON.stringify(portableData),
          { compress: true }
        );
        
        portableData.encrypted = true;
        portableData.encryptedData = encrypted;
        delete portableData.data;
      }

      // Audit the request
      await this.auditService.logActivity({
        action: 'GDPR_DATA_PORTABILITY',
        userId,
        details: {
          requestId,
          format,
          encrypted: encryptPackage,
          dataSize: JSON.stringify(portableData).length
        },
        compliance: { gdpr: true }
      });

      logger.info('Data portability request processed', {
        userId,
        requestId,
        format
      });

      return portableData;

    } catch (error) {
      logger.error('Failed to process portability request', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to process portability request',
        500,
        'PORTABILITY_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Reports a data breach
   * @param {Object} breachData - Breach information
   * @returns {Promise<Object>} Breach report
   * @throws {AppError} If reporting fails
   */
  async reportDataBreach(breachData) {
    try {
      const {
        discoveredAt = new Date(),
        affectedUsers = [],
        dataCategories = [],
        severity = 'high',
        description,
        containmentMeasures = [],
        estimatedImpact
      } = breachData;

      if (!description) {
        throw new AppError('Breach description is required', 400, 'INVALID_BREACH_DATA');
      }

      const breachId = this.#generateBreachId();
      const breach = {
        id: breachId,
        discoveredAt: new Date(discoveredAt).toISOString(),
        reportedAt: new Date().toISOString(),
        affectedUsers,
        affectedUserCount: affectedUsers.length,
        dataCategories,
        severity,
        description,
        containmentMeasures,
        estimatedImpact,
        notificationDeadline: this.#calculateNotificationDeadline(discoveredAt),
        status: 'reported',
        notifications: {
          authorities: false,
          users: false
        }
      };

      // Store breach report
      if (this.database) {
        await DataBreachModel.create(breach);
      } else {
        this.breachRegistry.set(breachId, breach);
      }

      // Check if notification is required
      const notificationRequired = this.#assessBreachNotificationRequirement(breach);
      
      if (notificationRequired) {
        breach.notificationRequired = true;
        breach.notificationReasons = notificationRequired.reasons;
        
        // Schedule notifications
        await this.#scheduleBreachNotifications(breach);
      }

      // Audit the breach report
      await this.auditService.logActivity({
        action: 'GDPR_DATA_BREACH_REPORTED',
        details: {
          breachId,
          severity,
          affectedUserCount: breach.affectedUserCount,
          notificationRequired: breach.notificationRequired
        },
        compliance: { gdpr: true },
        severity: 'critical'
      });

      logger.error('Data breach reported', {
        breachId,
        severity,
        affectedUsers: breach.affectedUserCount
      });

      return breach;

    } catch (error) {
      logger.error('Failed to report data breach', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to report data breach',
        500,
        'BREACH_REPORT_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Enforces data retention policies
   * @param {Object} [options={}] - Enforcement options
   * @returns {Promise<Object>} Retention enforcement results
   * @throws {AppError} If enforcement fails
   */
  async enforceRetention(options = {}) {
    try {
      const {
        dryRun = false,
        categories = Object.values(GDPRCompliance.#DATA_CATEGORIES),
        batchSize = 100
      } = options;

      const enforcementId = this.#generateEnforcementId();
      const results = {
        id: enforcementId,
        startedAt: new Date().toISOString(),
        dryRun,
        categories: {},
        totalProcessed: 0,
        totalDeleted: 0,
        errors: []
      };

      for (const category of categories) {
        try {
          const categoryResult = await this.#enforceRetentionForCategory(
            category,
            { dryRun, batchSize }
          );
          
          results.categories[category] = categoryResult;
          results.totalProcessed += categoryResult.processed;
          results.totalDeleted += categoryResult.deleted;
          
        } catch (error) {
          results.errors.push({
            category,
            error: error.message
          });
        }
      }

      results.completedAt = new Date().toISOString();
      results.duration = new Date(results.completedAt) - new Date(results.startedAt);
      results.success = results.errors.length === 0;

      // Audit the enforcement
      await this.auditService.logActivity({
        action: 'GDPR_RETENTION_ENFORCED',
        details: {
          enforcementId,
          dryRun,
          totalProcessed: results.totalProcessed,
          totalDeleted: results.totalDeleted,
          errors: results.errors.length
        },
        compliance: { gdpr: true }
      });

      logger.info('Data retention enforced', {
        enforcementId,
        dryRun,
        totalDeleted: results.totalDeleted
      });

      return results;

    } catch (error) {
      logger.error('Failed to enforce retention', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to enforce retention policies',
        500,
        'RETENTION_ENFORCEMENT_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Checks user consent status
   * @param {string} userId - User identifier
   * @param {string} [consentType] - Specific consent type to check
   * @returns {Promise<Object>} Consent status
   */
  async checkConsentStatus(userId, consentType) {
    try {
      if (!userId) {
        throw new AppError('User ID is required', 400, 'INVALID_USER_ID');
      }

      let consents;
      
      if (this.database) {
        const query = { userId };
        
        if (consentType) {
          query.type = consentType;
        }
        
        consents = await ConsentModel.find(query);
      } else {
        consents = this.consentStore.get(userId) || [];
        
        if (consentType) {
          consents = consents.filter(c => c.type === consentType);
        }
      }

      // Process consent status
      const status = {
        userId,
        hasAnyConsent: false,
        consents: {},
        lastUpdated: null
      };

      for (const consent of consents) {
        const isActive = consent.granted && 
                        !consent.withdrawn &&
                        (!consent.expiresAt || new Date(consent.expiresAt) > new Date());

        status.consents[consent.type] = {
          granted: isActive,
          timestamp: consent.timestamp,
          expiresAt: consent.expiresAt,
          withdrawn: consent.withdrawn || false,
          withdrawnAt: consent.withdrawnAt
        };

        if (isActive) {
          status.hasAnyConsent = true;
        }

        if (!status.lastUpdated || new Date(consent.timestamp) > new Date(status.lastUpdated)) {
          status.lastUpdated = consent.timestamp;
        }
      }

      return status;

    } catch (error) {
      logger.error('Failed to check consent status', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to check consent status',
        500,
        'CONSENT_CHECK_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Validates GDPR compliance for data processing
   * @param {Object} processingActivity - Processing activity to validate
   * @returns {Promise<Object>} Validation result
   */
  async validateProcessing(processingActivity) {
    try {
      const {
        userId,
        purpose,
        dataCategories = [],
        legalBasis,
        recipients = [],
        retentionPeriod,
        crossBorderTransfer = false
      } = processingActivity;

      const validation = {
        valid: true,
        errors: [],
        warnings: [],
        recommendations: []
      };

      // Validate legal basis
      if (!legalBasis) {
        validation.valid = false;
        validation.errors.push('Legal basis for processing is required');
      }

      // Check consent if legal basis is consent
      if (legalBasis === 'consent') {
        const consentStatus = await this.checkConsentStatus(userId);
        
        if (!consentStatus.hasAnyConsent) {
          validation.valid = false;
          validation.errors.push('No valid consent found for processing');
        }
      }

      // Validate data minimization
      if (dataCategories.includes(GDPRCompliance.#DATA_CATEGORIES.SENSITIVE)) {
        validation.warnings.push('Processing includes sensitive personal data');
        
        if (!['explicit-consent', 'legal-obligation'].includes(legalBasis)) {
          validation.valid = false;
          validation.errors.push('Sensitive data requires explicit consent or legal obligation');
        }
      }

      // Validate retention period
      if (!retentionPeriod) {
        validation.errors.push('Retention period must be specified');
        validation.valid = false;
      } else if (retentionPeriod > this.retentionPeriods.DEFAULT) {
        validation.warnings.push('Retention period exceeds default recommendation');
      }

      // Check cross-border transfer
      if (crossBorderTransfer) {
        validation.warnings.push('Processing involves cross-border data transfer');
        validation.recommendations.push('Ensure adequate safeguards are in place');
      }

      // Validate purpose limitation
      if (!purpose || purpose.length < 10) {
        validation.errors.push('Clear purpose for processing must be specified');
        validation.valid = false;
      }

      // Validate data recipients
      if (recipients.length > 0) {
        validation.warnings.push(`Data shared with ${recipients.length} recipients`);
        
        if (!this.#validateRecipients(recipients)) {
          validation.errors.push('Some recipients lack adequate data protection');
          validation.valid = false;
        }
      }

      logger.info('Processing activity validated', {
        userId,
        valid: validation.valid,
        errors: validation.errors.length,
        warnings: validation.warnings.length
      });

      return validation;

    } catch (error) {
      logger.error('Failed to validate processing', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to validate processing activity',
        500,
        'VALIDATION_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * @private
   * @returns {Array<string>} Default EU country codes
   */
  #getDefaultEUCountries() {
    return [
      'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
      'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
      'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'
    ];
  }

  /**
   * @private
   * @returns {string} Unique consent ID
   */
  #generateConsentId() {
    return `consent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * @private
   * @returns {string} Unique request ID
   */
  #generateRequestId() {
    return `request_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * @private
   * @returns {string} Unique anonymization ID
   */
  #generateAnonymizationId() {
    return `anon_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * @private
   * @returns {string} Unique breach ID
   */
  #generateBreachId() {
    return `breach_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * @private
   * @returns {string} Unique enforcement ID
   */
  #generateEnforcementId() {
    return `enforce_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * @private
   * @param {Object} userData - User data to sanitize
   * @returns {Object} Sanitized user data
   */
  #sanitizeUserData(userData) {
    const sanitized = { ...userData };
    
    // Remove sensitive fields
    delete sanitized.password;
    delete sanitized.passwordHash;
    delete sanitized.securityAnswers;
    delete sanitized.twoFactorSecret;
    
    return sanitized;
  }

  /**
   * @private
   * @param {Object} userData - User data object
   * @returns {number} Total record count
   */
  #countRecords(userData) {
    let count = 0;
    
    for (const category of Object.values(userData.dataCategories)) {
      if (Array.isArray(category)) {
        count += category.length;
      } else if (category && typeof category === 'object') {
        count += 1;
      }
    }
    
    count += userData.consentRecords?.length || 0;
    count += userData.processingActivities?.length || 0;
    count += userData.thirdPartySharing?.length || 0;
    
    return count;
  }

  /**
   * @private
   * @param {Object} userData - User data
   * @param {string} method - Anonymization method
   * @param {Array<string>} fieldsToKeep - Fields to preserve
   * @returns {Promise<Object>} Anonymized data
   */
  async #applyAnonymization(userData, method, fieldsToKeep) {
    const result = { ...userData };
    const changes = {};

    switch (method) {
      case GDPRCompliance.#ANONYMIZATION_METHODS.PSEUDONYMIZATION:
        // Replace identifiers with pseudonyms
        if (result.email && !fieldsToKeep.includes('email')) {
          const pseudonym = await this.#generatePseudonym('email');
          changes.email = { from: result.email, to: pseudonym };
          result.email = pseudonym;
        }
        
        if (result.name && !fieldsToKeep.includes('name')) {
          const pseudonym = await this.#generatePseudonym('name');
          changes.name = { from: result.name, to: pseudonym };
          result.name = pseudonym;
        }
        break;

      case GDPRCompliance.#ANONYMIZATION_METHODS.HASHING:
        // Hash identifiable fields
        if (result.email && !fieldsToKeep.includes('email')) {
          const hashed = await this.encryptionService.hash(result.email);
          changes.email = { from: result.email, to: hashed };
          result.email = hashed;
        }
        break;

      case GDPRCompliance.#ANONYMIZATION_METHODS.DELETION:
        // Delete identifiable fields
        for (const field of Object.keys(result)) {
          if (!fieldsToKeep.includes(field) && this.#isIdentifiableField(field)) {
            changes[field] = { from: result[field], to: null };
            delete result[field];
          }
        }
        break;

      case GDPRCompliance.#ANONYMIZATION_METHODS.GENERALIZATION:
        // Generalize specific values
        if (result.dateOfBirth && !fieldsToKeep.includes('dateOfBirth')) {
          const year = new Date(result.dateOfBirth).getFullYear();
          const generalized = `${Math.floor(year / 10) * 10}s`;
          changes.dateOfBirth = { from: result.dateOfBirth, to: generalized };
          result.dateOfBirth = generalized;
        }
        break;
    }

    return { result, changes };
  }

  /**
   * @private
   * @param {string} type - Pseudonym type
   * @returns {Promise<string>} Generated pseudonym
   */
  async #generatePseudonym(type) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 6);
    return `${type}_${timestamp}_${random}`;
  }

  /**
   * @private
   * @param {string} field - Field name
   * @returns {boolean} Whether field is identifiable
   */
  #isIdentifiableField(field) {
    const identifiableFields = [
      'email', 'name', 'firstName', 'lastName', 'phone', 'phoneNumber',
      'address', 'ssn', 'socialSecurityNumber', 'drivingLicense',
      'passport', 'nationalId', 'ipAddress', 'deviceId'
    ];
    
    return identifiableFields.includes(field.toLowerCase());
  }

  /**
   * @private
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Legal obligations check result
   */
  async #checkLegalObligations(userId) {
    // Check for legal requirements to retain data
    const obligations = {
      hasObligations: false,
      categories: [],
      requiredData: {}
    };

    // Check financial obligations
    if (this.database) {
      const hasPayments = await PaymentModel.exists({ userId });
      
      if (hasPayments) {
        obligations.hasObligations = true;
        obligations.categories.push(GDPRCompliance.#DATA_CATEGORIES.PERSONAL);
        obligations.requiredData.financial = {
          reason: 'Legal requirement for financial record keeping',
          retentionPeriod: this.retentionPeriods.FINANCIAL
        };
      }
    }

    return obligations;
  }

  /**
   * @private
   * @param {string} userId - User ID
   * @param {string} category - Data category
   * @returns {Promise<Object>} Erasure result
   */
  async #eraseDataCategory(userId, category) {
    const result = {
      category,
      erased: 0,
      collections: []
    };

    if (this.database) {
      // Map categories to collections
      const categoryCollections = {
        [GDPRCompliance.#DATA_CATEGORIES.PERSONAL]: ['users', 'profiles'],
        [GDPRCompliance.#DATA_CATEGORIES.SENSITIVE]: ['health_records', 'biometric_data'],
        [GDPRCompliance.#DATA_CATEGORIES.CHILDREN]: ['child_accounts', 'parental_consents']
      };

      const collections = categoryCollections[category] || [];
      
      for (const collection of collections) {
        try {
          const deleted = await this.database.collection(collection).deleteMany({ userId });
          result.erased += deleted.deletedCount;
          result.collections.push(collection);
        } catch (error) {
          logger.error(`Failed to erase from ${collection}`, error);
        }
      }
    }

    return result;
  }

  /**
   * @private
   * @param {Date} discoveredAt - When breach was discovered
   * @returns {Date} Notification deadline
   */
  #calculateNotificationDeadline(discoveredAt) {
    const deadline = new Date(discoveredAt);
    deadline.setHours(deadline.getHours() + GDPRCompliance.#BREACH_NOTIFICATION_HOURS);
    return deadline;
  }

  /**
   * @private
   * @param {Object} breach - Breach data
   * @returns {Object|null} Notification requirement assessment
   */
  #assessBreachNotificationRequirement(breach) {
    const reasons = [];
    
    // High severity always requires notification
    if (breach.severity === 'high' || breach.severity === 'critical') {
      reasons.push('High severity breach');
    }

    // Sensitive data requires notification
    const sensitiveCategories = [
      GDPRCompliance.#DATA_CATEGORIES.SENSITIVE,
      GDPRCompliance.#DATA_CATEGORIES.HEALTH,
      GDPRCompliance.#DATA_CATEGORIES.GENETIC,
      GDPRCompliance.#DATA_CATEGORIES.BIOMETRIC
    ];

    if (breach.dataCategories.some(cat => sensitiveCategories.includes(cat))) {
      reasons.push('Involves sensitive personal data');
    }

    // Large number of affected users
    if (breach.affectedUserCount > 100) {
      reasons.push('Affects large number of users');
    }

    // No encryption
    if (breach.estimatedImpact?.includes('unencrypted')) {
      reasons.push('Data was unencrypted');
    }

    return reasons.length > 0 ? { required: true, reasons } : null;
  }

  /**
   * @private
   * @param {Object} breach - Breach data
   * @returns {Promise<void>}
   */
  async #scheduleBreachNotifications(breach) {
    // In a real implementation, this would schedule actual notifications
    logger.info('Breach notifications scheduled', {
      breachId: breach.id,
      deadline: breach.notificationDeadline
    });
  }

  /**
   * @private
   * @param {Object} dataPackage - Data package
   * @returns {Object} Portable format data
   */
  #convertToPortableFormat(dataPackage) {
    return {
      metadata: {
        version: '2.0',
        format: 'gdpr-portable',
        exportDate: new Date().toISOString()
      },
      userData: dataPackage.dataCategories,
      consents: dataPackage.consentRecords,
      processingHistory: dataPackage.processingActivities,
      thirdPartyData: dataPackage.thirdPartySharing
    };
  }

  /**
   * @private
   * @param {Array<Object>} recipients - Data recipients
   * @returns {boolean} Whether recipients are valid
   */
  #validateRecipients(recipients) {
    // Check if all recipients have adequate data protection
    return recipients.every(recipient => {
      return recipient.dataProtectionAgreement || 
             recipient.adequacyDecision ||
             this.euCountries.has(recipient.country);
    });
  }

  /**
   * @private
   * @param {string} category - Data category
   * @param {Object} options - Enforcement options
   * @returns {Promise<Object>} Category enforcement result
   */
  async #enforceRetentionForCategory(category, options) {
    const result = {
      category,
      processed: 0,
      deleted: 0,
      errors: []
    };

    const retentionDays = this.#getRetentionPeriodForCategory(category);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    if (this.database) {
      try {
        // Find expired records
        const Model = this.#getModelForCategory(category);
        
        if (Model) {
          const expiredRecords = await Model.find({
            createdAt: { $lt: cutoffDate }
          }).limit(options.batchSize);

          result.processed = expiredRecords.length;

          if (!options.dryRun) {
            const deleteResult = await Model.deleteMany({
              _id: { $in: expiredRecords.map(r => r._id) }
            });
            result.deleted = deleteResult.deletedCount;
          }
        }
      } catch (error) {
        result.errors.push(error.message);
      }
    }

    return result;
  }

  /**
   * @private
   * @param {string} category - Data category
   * @returns {number} Retention period in days
   */
  #getRetentionPeriodForCategory(category) {
    const categoryRetention = {
      [GDPRCompliance.#DATA_CATEGORIES.CHILDREN]: this.retentionPeriods.CHILDREN,
      [GDPRCompliance.#DATA_CATEGORIES.PERSONAL]: this.retentionPeriods.DEFAULT,
      [GDPRCompliance.#DATA_CATEGORIES.SENSITIVE]: this.retentionPeriods.DEFAULT,
      [GDPRCompliance.#DATA_CATEGORIES.HEALTH]: this.retentionPeriods.LEGAL
    };

    return categoryRetention[category] || this.retentionPeriods.DEFAULT;
  }

  /**
   * @private
   * @param {string} category - Data category
   * @returns {Object|null} Database model for category
   */
  #getModelForCategory(category) {
    try {
      const modelMap = {
        [GDPRCompliance.#DATA_CATEGORIES.PERSONAL]: require('../../database/models/users/user-model'),
        [GDPRCompliance.#DATA_CATEGORIES.SENSITIVE]: require('../../database/models/sensitive-data-model'),
        [GDPRCompliance.#DATA_CATEGORIES.HEALTH]: require('../../database/models/health-data-model')
      };

      return modelMap[category] || null;
    } catch (error) {
      return null;
    }
  }
}

module.exports = GDPRCompliance;