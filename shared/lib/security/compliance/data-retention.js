'use strict';

/**
 * @fileoverview Data retention policy management service
 * @module shared/lib/security/compliance/data-retention
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/security/audit/audit-service
 */

const logger = require('../../utils/logger');
const { AppError } = require('../../utils/app-error');
const AuditService = require('../audit/audit-service');

/**
 * @class DataRetention
 * @description Manages data retention policies, lifecycle, and automated cleanup
 */
class DataRetention {
  /**
   * @private
   * @static
   * @readonly
   */
  static #DATA_CATEGORIES = {
    USER_ACCOUNT: 'user-account',
    PERSONAL_DATA: 'personal-data',
    FINANCIAL: 'financial-records',
    HEALTH: 'health-records',
    AUDIT_LOGS: 'audit-logs',
    SECURITY_LOGS: 'security-logs',
    COMMUNICATIONS: 'communications',
    ANALYTICS: 'analytics-data',
    BACKUPS: 'backup-data',
    TEMPORARY: 'temporary-data',
    CACHE: 'cache-data',
    SESSION: 'session-data'
  };

  static #RETENTION_PERIODS = {
    // In days
    USER_ACCOUNT: 365 * 3, // 3 years after account deletion
    PERSONAL_DATA: 365 * 2, // 2 years
    FINANCIAL: 365 * 7, // 7 years
    HEALTH: 365 * 10, // 10 years
    AUDIT_LOGS: 365 * 6, // 6 years
    SECURITY_LOGS: 365 * 3, // 3 years
    COMMUNICATIONS: 365, // 1 year
    ANALYTICS: 365 * 2, // 2 years
    BACKUPS: 180, // 6 months
    TEMPORARY: 7, // 1 week
    CACHE: 1, // 1 day
    SESSION: 0.5 // 12 hours
  };

  static #LEGAL_HOLD_REASONS = {
    LITIGATION: 'litigation',
    INVESTIGATION: 'investigation',
    REGULATORY: 'regulatory-requirement',
    COMPLIANCE_AUDIT: 'compliance-audit',
    TAX_AUDIT: 'tax-audit',
    GOVERNMENT_REQUEST: 'government-request'
  };

  static #DELETION_METHODS = {
    SOFT_DELETE: 'soft-delete',
    HARD_DELETE: 'hard-delete',
    CRYPTO_SHRED: 'crypto-shred',
    OVERWRITE: 'secure-overwrite',
    ANONYMIZE: 'anonymize'
  };

  static #LIFECYCLE_STAGES = {
    ACTIVE: 'active',
    ARCHIVED: 'archived',
    RETENTION: 'retention-period',
    PENDING_DELETION: 'pending-deletion',
    DELETED: 'deleted',
    LEGAL_HOLD: 'legal-hold'
  };

  static #COMPLIANCE_STANDARDS = {
    GDPR: { enabled: true, gracePerio: 30 },
    HIPAA: { enabled: true, gracePeriod: 60 },
    SOX: { enabled: true, gracePeriod: 0 },
    PCI_DSS: { enabled: true, gracePeriod: 0 },
    CCPA: { enabled: true, gracePeriod: 45 }
  };

  /**
   * Creates an instance of DataRetention
   * @constructor
   * @param {Object} [options={}] - Configuration options
   * @param {Object} [options.database] - Database connection
   * @param {Object} [options.auditService] - Audit service instance
   * @param {Object} [options.customPeriods={}] - Custom retention periods
   * @param {Object} [options.complianceSettings={}] - Compliance settings overrides
   * @param {boolean} [options.autoCleanup=true] - Enable automatic cleanup
   * @param {number} [options.batchSize=100] - Batch size for cleanup operations
   */
  constructor(options = {}) {
    const {
      database,
      auditService,
      customPeriods = {},
      complianceSettings = {},
      autoCleanup = true,
      batchSize = 100
    } = options;

    this.database = database;
    this.auditService = auditService || new AuditService({ database });
    this.autoCleanup = autoCleanup;
    this.batchSize = batchSize;

    // Merge retention periods
    this.retentionPeriods = {
      ...DataRetention.#RETENTION_PERIODS,
      ...customPeriods
    };

    // Merge compliance settings
    this.complianceSettings = {
      ...DataRetention.#COMPLIANCE_STANDARDS,
      ...complianceSettings
    };

    // Initialize stores
    this.policyRegistry = new Map();
    this.legalHoldRegistry = new Map();
    this.deletionQueue = new Map();
    this.lifecycleTracking = new Map();

    // Start cleanup scheduler if enabled
    if (this.autoCleanup) {
      this.#startCleanupScheduler();
    }

    logger.info('DataRetention service initialized', {
      autoCleanup,
      batchSize,
      customPeriodsCount: Object.keys(customPeriods).length
    });
  }

  /**
   * Creates a retention policy
   * @param {Object} policyData - Policy configuration
   * @returns {Promise<Object>} Created policy
   * @throws {AppError} If policy creation fails
   */
  async createRetentionPolicy(policyData) {
    try {
      const {
        name,
        description,
        dataCategory,
        retentionDays,
        deletionMethod = DataRetention.#DELETION_METHODS.HARD_DELETE,
        conditions = {},
        exceptions = [],
        autoEnforce = true
      } = policyData;

      if (!name || !dataCategory) {
        throw new AppError('Policy name and data category are required', 400, 'INVALID_POLICY_DATA');
      }

      // Validate data category
      if (!Object.values(DataRetention.#DATA_CATEGORIES).includes(dataCategory)) {
        throw new AppError('Invalid data category', 400, 'INVALID_DATA_CATEGORY');
      }

      const policyId = this.#generatePolicyId();
      const policy = {
        id: policyId,
        name,
        description,
        dataCategory,
        retentionDays: retentionDays || this.retentionPeriods[dataCategory],
        deletionMethod,
        conditions,
        exceptions,
        autoEnforce,
        createdAt: new Date().toISOString(),
        lastModified: new Date().toISOString(),
        active: true,
        version: 1,
        complianceAlignment: this.#determineComplianceAlignment(dataCategory, retentionDays)
      };

      // Validate against compliance requirements
      const complianceValidation = this.#validateAgainstCompliance(policy);
      
      if (!complianceValidation.valid) {
        throw new AppError(
          'Policy violates compliance requirements',
          400,
          'COMPLIANCE_VIOLATION',
          { violations: complianceValidation.violations }
        );
      }

      // Store policy
      if (this.database) {
        const RetentionPolicyModel = require('..\..\database\models\security\audit-retention-policy-model');
        await RetentionPolicyModel.create(policy);
      } else {
        this.policyRegistry.set(policyId, policy);
      }

      // Apply policy to existing data if auto-enforce
      if (autoEnforce) {
        await this.#applyPolicyToExistingData(policy);
      }

      // Audit policy creation
      await this.auditService.logActivity({
        action: 'RETENTION_POLICY_CREATED',
        details: {
          policyId,
          name,
          dataCategory,
          retentionDays
        },
        compliance: { dataRetention: true }
      });

      logger.info('Retention policy created', {
        policyId,
        name,
        dataCategory
      });

      return policy;

    } catch (error) {
      logger.error('Failed to create retention policy', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to create retention policy',
        500,
        'POLICY_CREATION_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Applies retention policy to data
   * @param {string} dataId - Data identifier
   * @param {string} policyId - Policy identifier
   * @param {Object} [metadata={}] - Additional metadata
   * @returns {Promise<Object>} Application result
   * @throws {AppError} If application fails
   */
  async applyRetentionPolicy(dataId, policyId, metadata = {}) {
    try {
      if (!dataId || !policyId) {
        throw new AppError('Data ID and policy ID are required', 400, 'INVALID_INPUT');
      }

      // Get policy
      const policy = await this.#getPolicy(policyId);
      
      if (!policy) {
        throw new AppError('Policy not found', 404, 'POLICY_NOT_FOUND');
      }

      if (!policy.active) {
        throw new AppError('Policy is not active', 400, 'POLICY_INACTIVE');
      }

      const applicationId = this.#generateApplicationId();
      const application = {
        id: applicationId,
        dataId,
        policyId,
        policyName: policy.name,
        category: policy.dataCategory,
        appliedAt: new Date().toISOString(),
        retentionDays: policy.retentionDays,
        expirationDate: this.#calculateExpirationDate(policy.retentionDays),
        deletionMethod: policy.deletionMethod,
        lifecycle: DataRetention.#LIFECYCLE_STAGES.ACTIVE,
        metadata,
        legalHold: false
      };

      // Check for exceptions
      const exemption = this.#checkExemptions(dataId, policy.exceptions);
      
      if (exemption) {
        application.exemption = exemption;
        application.expirationDate = null;
      }

      // Store application
      if (this.database) {
        const RetentionApplicationModel = require('../../database/models/retention-application-model');
        await RetentionApplicationModel.create(application);
      } else {
        this.lifecycleTracking.set(dataId, application);
      }

      // Schedule deletion if applicable
      if (application.expirationDate && policy.autoEnforce) {
        await this.#scheduleDeletion(application);
      }

      // Audit the application
      await this.auditService.logActivity({
        action: 'RETENTION_POLICY_APPLIED',
        details: {
          applicationId,
          dataId,
          policyId,
          expirationDate: application.expirationDate
        },
        compliance: { dataRetention: true }
      });

      logger.info('Retention policy applied', {
        applicationId,
        dataId,
        policyId
      });

      return application;

    } catch (error) {
      logger.error('Failed to apply retention policy', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to apply retention policy',
        500,
        'POLICY_APPLICATION_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Places legal hold on data
   * @param {Array<string>|string} dataIds - Data identifiers
   * @param {Object} holdData - Legal hold information
   * @returns {Promise<Object>} Legal hold result
   * @throws {AppError} If legal hold fails
   */
  async placeLegalHold(dataIds, holdData) {
    try {
      const {
        reason,
        requestedBy,
        caseReference,
        startDate = new Date(),
        endDate,
        description
      } = holdData;

      if (!reason || !requestedBy) {
        throw new AppError('Hold reason and requester are required', 400, 'INVALID_HOLD_DATA');
      }

      // Validate reason
      if (!Object.values(DataRetention.#LEGAL_HOLD_REASONS).includes(reason)) {
        throw new AppError('Invalid legal hold reason', 400, 'INVALID_HOLD_REASON');
      }

      // Ensure dataIds is array
      const idsToHold = Array.isArray(dataIds) ? dataIds : [dataIds];

      const holdId = this.#generateHoldId();
      const legalHold = {
        id: holdId,
        dataIds: idsToHold,
        reason,
        requestedBy,
        caseReference,
        description,
        startDate: new Date(startDate).toISOString(),
        endDate: endDate ? new Date(endDate).toISOString() : null,
        active: true,
        affectedCount: idsToHold.length,
        preservationActions: []
      };

      // Apply hold to each data item
      const results = {
        successful: 0,
        failed: 0,
        errors: []
      };

      for (const dataId of idsToHold) {
        try {
          await this.#applyLegalHoldToData(dataId, holdId);
          results.successful++;
          
          legalHold.preservationActions.push({
            dataId,
            preservedAt: new Date().toISOString(),
            status: 'preserved'
          });
          
        } catch (error) {
          results.failed++;
          results.errors.push({
            dataId,
            error: error.message
          });
        }
      }

      // Store legal hold
      if (this.database) {
        const LegalHoldModel = require('../../database/models/legal-hold-model');
        await LegalHoldModel.create(legalHold);
      } else {
        this.legalHoldRegistry.set(holdId, legalHold);
      }

      // Audit the legal hold
      await this.auditService.logActivity({
        action: 'LEGAL_HOLD_PLACED',
        details: {
          holdId,
          reason,
          affectedCount: results.successful,
          caseReference
        },
        compliance: { dataRetention: true },
        severity: 'high'
      });

      logger.info('Legal hold placed', {
        holdId,
        reason,
        affectedCount: results.successful
      });

      return {
        holdId,
        ...legalHold,
        results
      };

    } catch (error) {
      logger.error('Failed to place legal hold', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to place legal hold',
        500,
        'LEGAL_HOLD_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Removes legal hold
   * @param {string} holdId - Legal hold identifier
   * @param {Object} [releaseData={}] - Release information
   * @returns {Promise<Object>} Release result
   * @throws {AppError} If release fails
   */
  async releaseLegalHold(holdId, releaseData = {}) {
    try {
      if (!holdId) {
        throw new AppError('Hold ID is required', 400, 'INVALID_HOLD_ID');
      }

      const {
        releasedBy,
        reason = 'Hold no longer required',
        resumeRetention = true
      } = releaseData;

      if (!releasedBy) {
        throw new AppError('Released by information is required', 400, 'INVALID_RELEASE_DATA');
      }

      // Get legal hold
      const legalHold = await this.#getLegalHold(holdId);
      
      if (!legalHold) {
        throw new AppError('Legal hold not found', 404, 'HOLD_NOT_FOUND');
      }

      if (!legalHold.active) {
        throw new AppError('Legal hold is not active', 400, 'HOLD_NOT_ACTIVE');
      }

      // Release hold from data items
      const results = {
        released: 0,
        resumed: 0,
        errors: []
      };

      for (const dataId of legalHold.dataIds) {
        try {
          await this.#releaseLegalHoldFromData(dataId, holdId);
          results.released++;

          // Resume retention if requested
          if (resumeRetention) {
            await this.#resumeRetention(dataId);
            results.resumed++;
          }
          
        } catch (error) {
          results.errors.push({
            dataId,
            error: error.message
          });
        }
      }

      // Update legal hold status
      legalHold.active = false;
      legalHold.releasedAt = new Date().toISOString();
      legalHold.releasedBy = releasedBy;
      legalHold.releaseReason = reason;

      if (this.database) {
        const LegalHoldModel = require('../../database/models/legal-hold-model');
        await LegalHoldModel.updateOne({ id: holdId }, legalHold);
      }

      // Audit the release
      await this.auditService.logActivity({
        action: 'LEGAL_HOLD_RELEASED',
        details: {
          holdId,
          releasedBy,
          releasedCount: results.released,
          resumedRetention: resumeRetention
        },
        compliance: { dataRetention: true }
      });

      logger.info('Legal hold released', {
        holdId,
        released: results.released
      });

      return {
        holdId,
        releasedAt: legalHold.releasedAt,
        results
      };

    } catch (error) {
      logger.error('Failed to release legal hold', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to release legal hold',
        500,
        'HOLD_RELEASE_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Executes data deletion based on retention policies
   * @param {Object} [options={}] - Deletion options
   * @returns {Promise<Object>} Deletion results
   * @throws {AppError} If deletion fails
   */
  async executeRetentionDeletion(options = {}) {
    try {
      const {
        dryRun = false,
        categories = Object.values(DataRetention.#DATA_CATEGORIES),
        batchSize = this.batchSize,
        maxItems
      } = options;

      const deletionRunId = this.#generateDeletionRunId();
      const results = {
        id: deletionRunId,
        startedAt: new Date().toISOString(),
        dryRun,
        processed: 0,
        deleted: 0,
        skipped: 0,
        errors: [],
        categoriesProcessed: {}
      };

      // Process each category
      for (const category of categories) {
        const categoryResult = await this.#processCategoryDeletion(
          category,
          { dryRun, batchSize, maxItems }
        );

        results.categoriesProcessed[category] = categoryResult;
        results.processed += categoryResult.processed;
        results.deleted += categoryResult.deleted;
        results.skipped += categoryResult.skipped;

        if (categoryResult.errors.length > 0) {
          results.errors.push(...categoryResult.errors);
        }

        // Check max items limit
        if (maxItems && results.processed >= maxItems) {
          break;
        }
      }

      // Complete results
      results.completedAt = new Date().toISOString();
      results.duration = new Date(results.completedAt) - new Date(results.startedAt);
      results.success = results.errors.length === 0;

      // Store deletion run
      if (this.database) {
        const DeletionRunModel = require('../../database/models/deletion-run-model');
        await DeletionRunModel.create(results);
      }

      // Audit the deletion run
      await this.auditService.logActivity({
        action: 'RETENTION_DELETION_EXECUTED',
        details: {
          deletionRunId,
          dryRun,
          processed: results.processed,
          deleted: results.deleted,
          errors: results.errors.length
        },
        compliance: { dataRetention: true }
      });

      logger.info('Retention deletion executed', {
        deletionRunId,
        dryRun,
        deleted: results.deleted
      });

      return results;

    } catch (error) {
      logger.error('Failed to execute retention deletion', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to execute retention deletion',
        500,
        'RETENTION_DELETION_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Updates data lifecycle stage
   * @param {string} dataId - Data identifier
   * @param {string} newStage - New lifecycle stage
   * @param {Object} [metadata={}] - Stage transition metadata
   * @returns {Promise<Object>} Lifecycle update result
   * @throws {AppError} If update fails
   */
  async updateLifecycleStage(dataId, newStage, metadata = {}) {
    try {
      if (!dataId || !newStage) {
        throw new AppError('Data ID and new stage are required', 400, 'INVALID_INPUT');
      }

      // Validate lifecycle stage
      if (!Object.values(DataRetention.#LIFECYCLE_STAGES).includes(newStage)) {
        throw new AppError('Invalid lifecycle stage', 400, 'INVALID_LIFECYCLE_STAGE');
      }

      // Get current lifecycle
      const currentLifecycle = await this.#getDataLifecycle(dataId);
      
      if (!currentLifecycle) {
        throw new AppError('Data lifecycle not found', 404, 'LIFECYCLE_NOT_FOUND');
      }

      // Validate transition
      const transitionValid = this.#validateLifecycleTransition(
        currentLifecycle.lifecycle,
        newStage
      );

      if (!transitionValid.allowed) {
        throw new AppError(
          'Invalid lifecycle transition',
          400,
          'INVALID_TRANSITION',
          { reason: transitionValid.reason }
        );
      }

      // Check for legal hold
      if (newStage === DataRetention.#LIFECYCLE_STAGES.DELETED && currentLifecycle.legalHold) {
        throw new AppError(
          'Cannot delete data under legal hold',
          403,
          'LEGAL_HOLD_ACTIVE'
        );
      }

      const transitionId = this.#generateTransitionId();
      const transition = {
        id: transitionId,
        dataId,
        fromStage: currentLifecycle.lifecycle,
        toStage: newStage,
        transitionedAt: new Date().toISOString(),
        metadata,
        triggeredBy: metadata.triggeredBy || 'system'
      };

      // Update lifecycle
      currentLifecycle.lifecycle = newStage;
      currentLifecycle.lastTransition = transition;
      currentLifecycle.stageHistory = currentLifecycle.stageHistory || [];
      currentLifecycle.stageHistory.push(transition);

      // Handle stage-specific actions
      await this.#handleStageTransition(dataId, newStage, currentLifecycle);

      // Store update
      if (this.database) {
        const LifecycleModel = require('../../database/models/data-lifecycle-model');
        await LifecycleModel.updateOne({ dataId }, currentLifecycle);
      } else {
        this.lifecycleTracking.set(dataId, currentLifecycle);
      }

      // Audit the transition
      await this.auditService.logActivity({
        action: 'LIFECYCLE_STAGE_UPDATED',
        details: {
          transitionId,
          dataId,
          fromStage: transition.fromStage,
          toStage: transition.toStage
        },
        compliance: { dataRetention: true }
      });

      logger.info('Lifecycle stage updated', {
        transitionId,
        dataId,
        newStage
      });

      return {
        transitionId,
        ...transition,
        newLifecycle: currentLifecycle
      };

    } catch (error) {
      logger.error('Failed to update lifecycle stage', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to update lifecycle stage',
        500,
        'LIFECYCLE_UPDATE_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * Generates retention compliance report
   * @param {Object} [criteria={}] - Report criteria
   * @returns {Promise<Object>} Compliance report
   * @throws {AppError} If report generation fails
   */
  async generateComplianceReport(criteria = {}) {
    try {
      const {
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days
        endDate = new Date(),
        categories = Object.values(DataRetention.#DATA_CATEGORIES),
        includeExemptions = true,
        includeLegalHolds = true
      } = criteria;

      const reportId = this.#generateReportId();
      const report = {
        id: reportId,
        generatedAt: new Date().toISOString(),
        period: {
          start: new Date(startDate).toISOString(),
          end: new Date(endDate).toISOString()
        },
        statistics: {
          totalDataItems: 0,
          byCategory: {},
          byLifecycleStage: {},
          retentionCompliance: 0,
          upcomingDeletions: 0,
          overdue: 0
        },
        policies: [],
        legalHolds: [],
        exemptions: [],
        deletionSummary: {
          scheduled: 0,
          completed: 0,
          failed: 0
        },
        complianceIssues: []
      };

      // Gather policy statistics
      const policies = await this.#getActivePolicies();
      report.policies = policies.map(p => ({
        id: p.id,
        name: p.name,
        category: p.dataCategory,
        retentionDays: p.retentionDays,
        itemsAffected: 0
      }));

      // Analyze data by category
      for (const category of categories) {
        const categoryStats = await this.#analyzeCategoryCompliance(
          category,
          { startDate, endDate }
        );

        report.statistics.byCategory[category] = categoryStats;
        report.statistics.totalDataItems += categoryStats.total;

        // Check for compliance issues
        if (categoryStats.overdue > 0) {
          report.complianceIssues.push({
            category,
            issue: 'overdue-deletion',
            count: categoryStats.overdue,
            severity: 'high'
          });
        }
      }

      // Calculate lifecycle distribution
      report.statistics.byLifecycleStage = await this.#getLifecycleDistribution();

      // Get legal holds if requested
      if (includeLegalHolds) {
        report.legalHolds = await this.#getActiveLegalHolds();
      }

      // Get exemptions if requested
      if (includeExemptions) {
        report.exemptions = await this.#getActiveExemptions();
      }

      // Calculate compliance percentage
      const compliantItems = report.statistics.totalDataItems - report.statistics.overdue;
      report.statistics.retentionCompliance = report.statistics.totalDataItems > 0
        ? (compliantItems / report.statistics.totalDataItems) * 100
        : 100;

      // Get deletion summary
      report.deletionSummary = await this.#getDeletionSummary({ startDate, endDate });

      // Audit report generation
      await this.auditService.logActivity({
        action: 'RETENTION_COMPLIANCE_REPORT_GENERATED',
        details: {
          reportId,
          period: report.period,
          totalItems: report.statistics.totalDataItems,
          complianceRate: report.statistics.retentionCompliance
        },
        compliance: { dataRetention: true }
      });

      logger.info('Compliance report generated', {
        reportId,
        complianceRate: report.statistics.retentionCompliance
      });

      return report;

    } catch (error) {
      logger.error('Failed to generate compliance report', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to generate compliance report',
        500,
        'REPORT_GENERATION_ERROR',
        { originalError: error.message }
      );
    }
  }

  /**
   * @private
   * Starts the automatic cleanup scheduler
   */
  #startCleanupScheduler() {
    // Run cleanup every hour
    this.cleanupInterval = setInterval(async () => {
      try {
        logger.info('Running scheduled retention cleanup');
        
        await this.executeRetentionDeletion({
          dryRun: false,
          maxItems: 1000 // Limit per run
        });
        
      } catch (error) {
        logger.error('Scheduled cleanup failed', error);
      }
    }, 60 * 60 * 1000); // 1 hour
  }

  /**
   * @private
   * @returns {string} Unique policy ID
   */
  #generatePolicyId() {
    return `policy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * @private
   * @returns {string} Unique application ID
   */
  #generateApplicationId() {
    return `app_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * @private
   * @returns {string} Unique hold ID
   */
  #generateHoldId() {
    return `hold_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * @private
   * @returns {string} Unique deletion run ID
   */
  #generateDeletionRunId() {
    return `delrun_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * @private
   * @returns {string} Unique transition ID
   */
  #generateTransitionId() {
    return `trans_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * @private
   * @returns {string} Unique report ID
   */
  #generateReportId() {
    return `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * @private
   * @param {string} dataCategory - Data category
   * @param {number} retentionDays - Retention period
   * @returns {Array} Compliance alignments
   */
  #determineComplianceAlignment(dataCategory, retentionDays) {
    const alignments = [];

    // Check GDPR alignment
    if (this.complianceSettings.GDPR.enabled) {
      if (dataCategory === DataRetention.#DATA_CATEGORIES.PERSONAL_DATA) {
        alignments.push('GDPR');
      }
    }

    // Check HIPAA alignment
    if (this.complianceSettings.HIPAA.enabled) {
      if (dataCategory === DataRetention.#DATA_CATEGORIES.HEALTH) {
        alignments.push('HIPAA');
      }
    }

    // Check SOX alignment
    if (this.complianceSettings.SOX.enabled) {
      if (dataCategory === DataRetention.#DATA_CATEGORIES.FINANCIAL) {
        alignments.push('SOX');
      }
    }

    return alignments;
  }

  /**
   * @private
   * @param {Object} policy - Policy to validate
   * @returns {Object} Validation result
   */
  #validateAgainstCompliance(policy) {
    const violations = [];

    // Check minimum retention periods by compliance standard
    if (policy.dataCategory === DataRetention.#DATA_CATEGORIES.FINANCIAL) {
      if (policy.retentionDays < 365 * 7) { // 7 years for SOX
        violations.push('SOX requires 7-year retention for financial records');
      }
    }

    if (policy.dataCategory === DataRetention.#DATA_CATEGORIES.HEALTH) {
      if (policy.retentionDays < 365 * 6) { // 6 years for HIPAA
        violations.push('HIPAA requires 6-year retention for health records');
      }
    }

    if (policy.dataCategory === DataRetention.#DATA_CATEGORIES.AUDIT_LOGS) {
      if (policy.retentionDays < 365 * 3) { // 3 years minimum for audit logs
        violations.push('Audit logs require minimum 3-year retention');
      }
    }

    return {
      valid: violations.length === 0,
      violations
    };
  }

  /**
   * @private
   * @param {Object} policy - Policy to apply
   */
  async #applyPolicyToExistingData(policy) {
    // In production, this would apply the policy to existing data
    logger.info('Applying policy to existing data', {
      policyId: policy.id,
      category: policy.dataCategory
    });
  }

  /**
   * @private
   * @param {string} policyId - Policy ID
   * @returns {Promise<Object>} Policy data
   */
  async #getPolicy(policyId) {
    if (this.database) {
      const RetentionPolicyModel = require('..\..\database\models\security\audit-retention-policy-model');
      return await RetentionPolicyModel.findOne({ id: policyId });
    }
    
    return this.policyRegistry.get(policyId);
  }

  /**
   * @private
   * @param {number} retentionDays - Days to retain
   * @returns {Date} Expiration date
   */
  #calculateExpirationDate(retentionDays) {
    const date = new Date();
    date.setDate(date.getDate() + retentionDays);
    return date;
  }

  /**
   * @private
   * @param {string} dataId - Data ID
   * @param {Array} exceptions - Policy exceptions
   * @returns {Object|null} Exemption details
   */
  #checkExemptions(dataId, exceptions) {
    // Check if data matches any exception criteria
    for (const exception of exceptions) {
      if (exception.dataPattern && dataId.match(exception.dataPattern)) {
        return {
          type: 'pattern-match',
          rule: exception.rule,
          reason: exception.reason
        };
      }
    }
    
    return null;
  }

  /**
   * @private
   * @param {Object} application - Retention application
   */
  async #scheduleDeletion(application) {
    const deletion = {
      dataId: application.dataId,
      scheduledFor: application.expirationDate,
      method: application.deletionMethod,
      policyId: application.policyId
    };

    if (this.database) {
      const DeletionQueueModel = require('../../database/models/deletion-queue-model');
      await DeletionQueueModel.create(deletion);
    } else {
      this.deletionQueue.set(application.dataId, deletion);
    }
  }

  /**
   * @private
   * @param {string} dataId - Data ID
   * @param {string} holdId - Hold ID
   */
  async #applyLegalHoldToData(dataId, holdId) {
    const lifecycle = await this.#getDataLifecycle(dataId);
    
    if (lifecycle) {
      lifecycle.legalHold = true;
      lifecycle.legalHoldId = holdId;
      lifecycle.previousLifecycle = lifecycle.lifecycle;
      lifecycle.lifecycle = DataRetention.#LIFECYCLE_STAGES.LEGAL_HOLD;

      if (this.database) {
        const LifecycleModel = require('../../database/models/data-lifecycle-model');
        await LifecycleModel.updateOne({ dataId }, lifecycle);
      }
    }
  }

  /**
   * @private
   * @param {string} holdId - Hold ID
   * @returns {Promise<Object>} Legal hold data
   */
  async #getLegalHold(holdId) {
    if (this.database) {
      const LegalHoldModel = require('../../database/models/legal-hold-model');
      return await LegalHoldModel.findOne({ id: holdId });
    }
    
    return this.legalHoldRegistry.get(holdId);
  }

  /**
   * @private
   * @param {string} dataId - Data ID
   * @param {string} holdId - Hold ID
   */
  async #releaseLegalHoldFromData(dataId, holdId) {
    const lifecycle = await this.#getDataLifecycle(dataId);
    
    if (lifecycle && lifecycle.legalHoldId === holdId) {
      lifecycle.legalHold = false;
      lifecycle.legalHoldId = null;
      lifecycle.lifecycle = lifecycle.previousLifecycle || DataRetention.#LIFECYCLE_STAGES.ACTIVE;

      if (this.database) {
        const LifecycleModel = require('../../database/models/data-lifecycle-model');
        await LifecycleModel.updateOne({ dataId }, lifecycle);
      }
    }
  }

  /**
   * @private
   * @param {string} dataId - Data ID
   */
  async #resumeRetention(dataId) {
    const lifecycle = await this.#getDataLifecycle(dataId);
    
    if (lifecycle && lifecycle.expirationDate) {
      // Check if already expired
      if (new Date(lifecycle.expirationDate) < new Date()) {
        // Schedule immediate deletion
        await this.#scheduleDeletion(lifecycle);
      }
    }
  }

  /**
   * @private
   * @param {string} category - Data category
   * @param {Object} options - Processing options
   * @returns {Promise<Object>} Category deletion results
   */
  async #processCategoryDeletion(category, options) {
    const result = {
      category,
      processed: 0,
      deleted: 0,
      skipped: 0,
      errors: []
    };

    try {
      // Get expired data for category
      const expiredData = await this.#getExpiredData(category, options.batchSize);

      for (const data of expiredData) {
        result.processed++;

        // Check for legal hold
        if (data.legalHold) {
          result.skipped++;
          continue;
        }

        // Execute deletion unless dry run
        if (!options.dryRun) {
          try {
            await this.#executeDataDeletion(data);
            result.deleted++;
          } catch (error) {
            result.errors.push({
              dataId: data.dataId,
              error: error.message
            });
          }
        } else {
          result.deleted++; // Count as would-be deleted
        }

        // Check max items
        if (options.maxItems && result.processed >= options.maxItems) {
          break;
        }
      }

    } catch (error) {
      result.errors.push({
        category,
        error: error.message
      });
    }

    return result;
  }

  /**
   * @private
   * @param {string} dataId - Data ID
   * @returns {Promise<Object>} Data lifecycle
   */
  async #getDataLifecycle(dataId) {
    if (this.database) {
      const LifecycleModel = require('../../database/models/data-lifecycle-model');
      return await LifecycleModel.findOne({ dataId });
    }
    
    return this.lifecycleTracking.get(dataId);
  }

  /**
   * @private
   * @param {string} fromStage - Current stage
   * @param {string} toStage - Target stage
   * @returns {Object} Validation result
   */
  #validateLifecycleTransition(fromStage, toStage) {
    // Define valid transitions
    const validTransitions = {
      [DataRetention.#LIFECYCLE_STAGES.ACTIVE]: [
        DataRetention.#LIFECYCLE_STAGES.ARCHIVED,
        DataRetention.#LIFECYCLE_STAGES.RETENTION,
        DataRetention.#LIFECYCLE_STAGES.LEGAL_HOLD
      ],
      [DataRetention.#LIFECYCLE_STAGES.ARCHIVED]: [
        DataRetention.#LIFECYCLE_STAGES.ACTIVE,
        DataRetention.#LIFECYCLE_STAGES.RETENTION,
        DataRetention.#LIFECYCLE_STAGES.LEGAL_HOLD
      ],
      [DataRetention.#LIFECYCLE_STAGES.RETENTION]: [
        DataRetention.#LIFECYCLE_STAGES.PENDING_DELETION,
        DataRetention.#LIFECYCLE_STAGES.LEGAL_HOLD
      ],
      [DataRetention.#LIFECYCLE_STAGES.PENDING_DELETION]: [
        DataRetention.#LIFECYCLE_STAGES.DELETED,
        DataRetention.#LIFECYCLE_STAGES.LEGAL_HOLD
      ],
      [DataRetention.#LIFECYCLE_STAGES.LEGAL_HOLD]: [
        DataRetention.#LIFECYCLE_STAGES.ACTIVE,
        DataRetention.#LIFECYCLE_STAGES.ARCHIVED,
        DataRetention.#LIFECYCLE_STAGES.RETENTION
      ]
    };

    const allowed = validTransitions[fromStage]?.includes(toStage) || false;

    return {
      allowed,
      reason: allowed ? null : `Cannot transition from ${fromStage} to ${toStage}`
    };
  }

  /**
   * @private
   * @param {string} dataId - Data ID
   * @param {string} newStage - New stage
   * @param {Object} lifecycle - Lifecycle data
   */
  async #handleStageTransition(dataId, newStage, lifecycle) {
    switch (newStage) {
      case DataRetention.#LIFECYCLE_STAGES.ARCHIVED:
        // Move to archive storage
        logger.info('Data archived', { dataId });
        break;

      case DataRetention.#LIFECYCLE_STAGES.PENDING_DELETION:
        // Schedule deletion
        await this.#scheduleDeletion(lifecycle);
        break;

      case DataRetention.#LIFECYCLE_STAGES.DELETED:
        // Execute deletion
        await this.#executeDataDeletion(lifecycle);
        break;
    }
  }

  /**
   * @private
   * @returns {Promise<Array>} Active policies
   */
  async #getActivePolicies() {
    if (this.database) {
      const RetentionPolicyModel = require('..\..\database\models\security\audit-retention-policy-model');
      return await RetentionPolicyModel.find({ active: true });
    }
    
    return Array.from(this.policyRegistry.values()).filter(p => p.active);
  }

  /**
   * @private
   * @param {string} category - Data category
   * @param {Object} options - Analysis options
   * @returns {Promise<Object>} Category statistics
   */
  async #analyzeCategoryCompliance(category, options) {
    const stats = {
      total: 0,
      compliant: 0,
      overdue: 0,
      upcomingDeletions: 0
    };

    if (this.database) {
      const LifecycleModel = require('../../database/models/data-lifecycle-model');
      
      // Get total count
      stats.total = await LifecycleModel.countDocuments({ category });
      
      // Get overdue items
      stats.overdue = await LifecycleModel.countDocuments({
        category,
        expirationDate: { $lt: new Date() },
        lifecycle: { $ne: DataRetention.#LIFECYCLE_STAGES.DELETED },
        legalHold: false
      });
      
      // Get upcoming deletions (next 30 days)
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
      
      stats.upcomingDeletions = await LifecycleModel.countDocuments({
        category,
        expirationDate: { 
          $gte: new Date(),
          $lte: thirtyDaysFromNow
        },
        legalHold: false
      });
      
      stats.compliant = stats.total - stats.overdue;
    }

    return stats;
  }

  /**
   * @private
   * @returns {Promise<Object>} Lifecycle distribution
   */
  async #getLifecycleDistribution() {
    const distribution = {};

    if (this.database) {
      const LifecycleModel = require('../../database/models/data-lifecycle-model');
      
      for (const stage of Object.values(DataRetention.#LIFECYCLE_STAGES)) {
        distribution[stage] = await LifecycleModel.countDocuments({ lifecycle: stage });
      }
    }

    return distribution;
  }

  /**
   * @private
   * @returns {Promise<Array>} Active legal holds
   */
  async #getActiveLegalHolds() {
    if (this.database) {
      const LegalHoldModel = require('../../database/models/legal-hold-model');
      return await LegalHoldModel.find({ active: true });
    }
    
    return Array.from(this.legalHoldRegistry.values()).filter(h => h.active);
  }

  /**
   * @private
   * @returns {Promise<Array>} Active exemptions
   */
  async #getActiveExemptions() {
    // Would query exemptions from database
    return [];
  }

  /**
   * @private
   * @param {Object} options - Summary options
   * @returns {Promise<Object>} Deletion summary
   */
  async #getDeletionSummary(options) {
    const summary = {
      scheduled: 0,
      completed: 0,
      failed: 0
    };

    if (this.database) {
      const DeletionQueueModel = require('../../database/models/deletion-queue-model');
      
      summary.scheduled = await DeletionQueueModel.countDocuments({
        scheduledFor: {
          $gte: options.startDate,
          $lte: options.endDate
        },
        status: 'pending'
      });

      summary.completed = await DeletionQueueModel.countDocuments({
        completedAt: {
          $gte: options.startDate,
          $lte: options.endDate
        },
        status: 'completed'
      });

      summary.failed = await DeletionQueueModel.countDocuments({
        attemptedAt: {
          $gte: options.startDate,
          $lte: options.endDate
        },
        status: 'failed'
      });
    }

    return summary;
  }

  /**
   * @private
   * @param {string} category - Data category
   * @param {number} batchSize - Batch size
   * @returns {Promise<Array>} Expired data items
   */
  async #getExpiredData(category, batchSize) {
    if (this.database) {
      const LifecycleModel = require('../../database/models/data-lifecycle-model');
      
      return await LifecycleModel.find({
        category,
        expirationDate: { $lt: new Date() },
        lifecycle: { $ne: DataRetention.#LIFECYCLE_STAGES.DELETED },
        legalHold: false
      }).limit(batchSize);
    }
    
    // Simulated for in-memory
    return [];
  }

  /**
   * @private
   * @param {Object} data - Data to delete
   */
  async #executeDataDeletion(data) {
    const deletionRecord = {
      dataId: data.dataId,
      category: data.category,
      deletionMethod: data.deletionMethod || DataRetention.#DELETION_METHODS.HARD_DELETE,
      deletedAt: new Date().toISOString(),
      policyId: data.policyId
    };

    // Execute deletion based on method
    switch (deletionRecord.deletionMethod) {
      case DataRetention.#DELETION_METHODS.HARD_DELETE:
        // Permanent deletion
        await this.#hardDeleteData(data.dataId);
        break;

      case DataRetention.#DELETION_METHODS.SOFT_DELETE:
        // Mark as deleted
        await this.#softDeleteData(data.dataId);
        break;

      case DataRetention.#DELETION_METHODS.CRYPTO_SHRED:
        // Delete encryption keys
        await this.#cryptoShredData(data.dataId);
        break;

      case DataRetention.#DELETION_METHODS.ANONYMIZE:
        // Anonymize data
        await this.#anonymizeData(data.dataId);
        break;
    }

    // Update lifecycle to deleted
    await this.updateLifecycleStage(
      data.dataId,
      DataRetention.#LIFECYCLE_STAGES.DELETED,
      { deletionMethod: deletionRecord.deletionMethod }
    );

    // Store deletion record
    if (this.database) {
      const DeletionRecordModel = require('../../database/models/deletion-record-model');
      await DeletionRecordModel.create(deletionRecord);
    }
  }

  /**
   * @private
   * @param {string} dataId - Data ID
   */
  async #hardDeleteData(dataId) {
    logger.info('Hard deleting data', { dataId });
    // Implementation would perform actual deletion
  }

  /**
   * @private
   * @param {string} dataId - Data ID
   */
  async #softDeleteData(dataId) {
    logger.info('Soft deleting data', { dataId });
    // Implementation would mark as deleted
  }

  /**
   * @private
   * @param {string} dataId - Data ID
   */
  async #cryptoShredData(dataId) {
    logger.info('Crypto shredding data', { dataId });
    // Implementation would delete encryption keys
  }

  /**
   * @private
   * @param {string} dataId - Data ID
   */
  async #anonymizeData(dataId) {
    logger.info('Anonymizing data', { dataId });
    // Implementation would anonymize data
  }

  /**
   * Cleanup method to stop scheduler
   */
  cleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      logger.info('Retention cleanup scheduler stopped');
    }
  }
}

module.exports = DataRetention;