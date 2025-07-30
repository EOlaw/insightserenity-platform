'use strict';

/**
 * @fileoverview Audit trail and compliance utilities for administrative operations
 * @module servers/admin-server/utils/audit-utils
 * @requires module:shared/lib/database/models/audit-log-model
 * @requires module:shared/lib/security/audit/audit-service
 * @requires module:shared/lib/utils/helpers/crypto-helper
 * @requires module:servers/admin-server/config
 */

const AuditLogModel = require('../../../shared/lib/database/models/audit-log-model');
const AuditService = require('../../../shared/lib/security/audit/audit-service');
const { CryptoHelper } = require('../../../shared/lib/utils/helpers');
const config = require('../config');
const crypto = require('crypto');

/**
 * @class AuditUtils
 * @description Comprehensive audit trail management for administrative oversight
 */
class AuditUtils {
  /**
   * @private
   * @static
   * @type {AuditService}
   */
  static #auditService = new AuditService();

  /**
   * @private
   * @static
   * @type {Object}
   */
  static #config = {
    retention: {
      standard: config.audit?.retentionDays || 365,
      compliance: config.audit?.complianceRetentionDays || 2555, // 7 years
      security: config.audit?.securityRetentionDays || 730 // 2 years
    },
    encryption: {
      enabled: config.audit?.encryptionEnabled !== false,
      algorithm: config.audit?.encryptionAlgorithm || 'aes-256-gcm'
    },
    compliance: {
      gdpr: config.compliance?.gdpr !== false,
      hipaa: config.compliance?.hipaa || false,
      sox: config.compliance?.sox || false,
      pci: config.compliance?.pci || false
    }
  };

  /**
   * Create comprehensive audit entry
   * @static
   * @param {Object} auditData - Audit data
   * @returns {Promise<Object>} Created audit entry
   */
  static async createAuditEntry(auditData) {
    const {
      action,
      userId,
      organizationId,
      resource,
      resourceId,
      changes,
      metadata,
      compliance,
      severity = 'info'
    } = auditData;

    // Generate audit ID and hash
    const auditId = crypto.randomUUID();
    const timestamp = new Date();
    const auditHash = this.#generateAuditHash(auditData, timestamp);

    // Prepare audit entry
    const entry = {
      auditId,
      action,
      userId,
      organizationId,
      resource,
      resourceId,
      changes: this.#processChanges(changes),
      metadata: this.#enrichMetadata(metadata),
      severity,
      timestamp,
      hash: auditHash,
      previousHash: await this.#getLastAuditHash(organizationId),
      compliance: compliance || this.#detectComplianceRequirements(action, resource),
      retention: this.#calculateRetention(action, compliance),
      encrypted: false
    };

    // Encrypt sensitive data if enabled
    if (this.#config.encryption.enabled && this.#shouldEncrypt(action, resource)) {
      entry.encryptedData = await this.#encryptAuditData(entry);
      entry.encrypted = true;
      
      // Remove sensitive fields from main entry
      delete entry.changes;
      delete entry.metadata.sensitiveData;
    }

    // Create audit log
    const savedEntry = await AuditLogModel.create(entry);
    
    // Index for compliance if needed
    if (entry.compliance.length > 0) {
      await this.#indexForCompliance(savedEntry);
    }

    return savedEntry;
  }

  /**
   * Query audit logs with advanced filtering
   * @static
   * @param {Object} filters - Query filters
   * @param {Object} [options={}] - Query options
   * @returns {Promise<Object>} Query results
   */
  static async queryAuditLogs(filters, options = {}) {
    const {
      page = 1,
      limit = 50,
      sort = { timestamp: -1 },
      includeEncrypted = false,
      verifyIntegrity = false
    } = options;

    // Build query
    const query = this.#buildAuditQuery(filters);
    
    // Execute query
    const [results, total] = await Promise.all([
      AuditLogModel.find(query)
        .sort(sort)
        .limit(limit)
        .skip((page - 1) * limit)
        .populate('userId', 'name email role')
        .populate('organizationId', 'name')
        .lean(),
      AuditLogModel.countDocuments(query)
    ]);

    // Process results
    const processedResults = await Promise.all(
      results.map(async (entry) => {
        // Decrypt if needed
        if (entry.encrypted && includeEncrypted) {
          entry = await this.#decryptAuditEntry(entry);
        }

        // Verify integrity if requested
        if (verifyIntegrity) {
          entry.integrityValid = await this.#verifyAuditIntegrity(entry);
        }

        return entry;
      })
    );

    return {
      data: processedResults,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Generate compliance report
   * @static
   * @param {Object} criteria - Report criteria
   * @returns {Promise<Object>} Compliance report
   */
  static async generateComplianceReport(criteria) {
    const {
      startDate,
      endDate,
      regulations = ['all'],
      organizationId,
      format = 'detailed'
    } = criteria;

    // Query compliance-related entries
    const query = {
      timestamp: {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      }
    };

    if (organizationId) {
      query.organizationId = organizationId;
    }

    if (!regulations.includes('all')) {
      query['compliance.regulations'] = { $in: regulations };
    }

    const entries = await AuditLogModel.find(query)
      .sort({ timestamp: 1 })
      .lean();

    // Generate report based on format
    const report = {
      reportId: crypto.randomUUID(),
      generatedAt: new Date(),
      criteria,
      summary: this.#generateComplianceSummary(entries, regulations),
      entries: format === 'detailed' ? entries : entries.length,
      regulations: {}
    };

    // Add regulation-specific sections
    if (regulations.includes('all') || regulations.includes('gdpr')) {
      report.regulations.gdpr = await this.#generateGDPRSection(entries);
    }

    if (regulations.includes('all') || regulations.includes('hipaa')) {
      report.regulations.hipaa = await this.#generateHIPAASection(entries);
    }

    if (regulations.includes('all') || regulations.includes('sox')) {
      report.regulations.sox = await this.#generateSOXSection(entries);
    }

    // Sign report for integrity
    report.signature = this.#signReport(report);

    return report;
  }

  /**
   * Track data access for compliance
   * @static
   * @param {Object} accessData - Access information
   * @returns {Promise<Object>} Access audit entry
   */
  static async trackDataAccess(accessData) {
    const {
      userId,
      dataType,
      operation,
      recordIds,
      fields,
      purpose,
      lawfulBasis,
      dataSubjects = []
    } = accessData;

    const auditData = {
      action: `data.${operation}`,
      userId,
      resource: dataType,
      resourceId: recordIds.length === 1 ? recordIds[0] : null,
      metadata: {
        operation,
        recordCount: recordIds.length,
        fields: fields || [],
        purpose,
        lawfulBasis,
        dataSubjects,
        timestamp: new Date()
      },
      compliance: ['gdpr', 'data_protection'],
      severity: this.#getDataAccessSeverity(operation, dataType)
    };

    // Additional GDPR tracking
    if (this.#config.compliance.gdpr && dataSubjects.length > 0) {
      auditData.metadata.gdpr = {
        dataSubjects,
        lawfulBasis,
        purpose,
        retention: this.#getDataRetentionPeriod(dataType)
      };
    }

    return this.createAuditEntry(auditData);
  }

  /**
   * Verify audit trail integrity
   * @static
   * @param {string} organizationId - Organization ID
   * @param {Object} [dateRange={}] - Date range to verify
   * @returns {Promise<Object>} Integrity verification results
   */
  static async verifyAuditIntegrity(organizationId, dateRange = {}) {
    const query = { organizationId };
    
    if (dateRange.start || dateRange.end) {
      query.timestamp = {};
      if (dateRange.start) query.timestamp.$gte = new Date(dateRange.start);
      if (dateRange.end) query.timestamp.$lte = new Date(dateRange.end);
    }

    const entries = await AuditLogModel.find(query)
      .sort({ timestamp: 1 })
      .lean();

    const results = {
      totalEntries: entries.length,
      valid: 0,
      invalid: 0,
      errors: [],
      chainIntegrity: true
    };

    let previousHash = null;

    for (const entry of entries) {
      try {
        // Verify individual entry hash
        const expectedHash = this.#generateAuditHash(entry, entry.timestamp);
        const isValid = entry.hash === expectedHash;

        if (isValid) {
          results.valid++;
        } else {
          results.invalid++;
          results.errors.push({
            auditId: entry.auditId,
            reason: 'Hash mismatch',
            expected: expectedHash,
            actual: entry.hash
          });
        }

        // Verify chain integrity
        if (previousHash && entry.previousHash !== previousHash) {
          results.chainIntegrity = false;
          results.errors.push({
            auditId: entry.auditId,
            reason: 'Chain integrity broken',
            expected: previousHash,
            actual: entry.previousHash
          });
        }

        previousHash = entry.hash;
      } catch (error) {
        results.errors.push({
          auditId: entry.auditId,
          reason: 'Verification error',
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Export audit logs for archival
   * @static
   * @param {Object} criteria - Export criteria
   * @returns {Promise<Object>} Export results
   */
  static async exportAuditLogs(criteria) {
    const {
      startDate,
      endDate,
      organizationId,
      format = 'json',
      compress = true,
      encrypt = true
    } = criteria;

    const query = {
      timestamp: {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      }
    };

    if (organizationId) {
      query.organizationId = organizationId;
    }

    const entries = await AuditLogModel.find(query)
      .sort({ timestamp: 1 })
      .lean();

    let exportData = {
      exportId: crypto.randomUUID(),
      exportDate: new Date(),
      criteria,
      entryCount: entries.length,
      entries
    };

    // Apply format
    if (format === 'csv') {
      exportData = this.#convertToCSV(exportData);
    }

    // Compress if requested
    if (compress) {
      exportData = await this.#compressData(exportData);
    }

    // Encrypt if requested
    if (encrypt) {
      exportData = await this.#encryptExport(exportData);
    }

    return {
      exportId: exportData.exportId,
      format,
      compressed: compress,
      encrypted: encrypt,
      size: Buffer.byteLength(JSON.stringify(exportData)),
      data: exportData
    };
  }

  /**
   * Clean old audit logs based on retention policy
   * @static
   * @returns {Promise<Object>} Cleanup results
   */
  static async cleanupAuditLogs() {
    const results = {
      standard: 0,
      compliance: 0,
      security: 0,
      total: 0
    };

    // Standard retention cleanup
    const standardCutoff = new Date();
    standardCutoff.setDate(standardCutoff.getDate() - this.#config.retention.standard);

    const standardDeleted = await AuditLogModel.deleteMany({
      timestamp: { $lt: standardCutoff },
      'compliance.length': 0,
      severity: { $nin: ['error', 'critical'] }
    });
    results.standard = standardDeleted.deletedCount;

    // Security logs cleanup
    const securityCutoff = new Date();
    securityCutoff.setDate(securityCutoff.getDate() - this.#config.retention.security);

    const securityDeleted = await AuditLogModel.deleteMany({
      timestamp: { $lt: securityCutoff },
      severity: { $in: ['error', 'critical'] },
      'compliance.length': 0
    });
    results.security = securityDeleted.deletedCount;

    // Compliance logs cleanup (if any exceed retention)
    const complianceCutoff = new Date();
    complianceCutoff.setDate(complianceCutoff.getDate() - this.#config.retention.compliance);

    const complianceDeleted = await AuditLogModel.deleteMany({
      timestamp: { $lt: complianceCutoff },
      'compliance.length': { $gt: 0 }
    });
    results.compliance = complianceDeleted.deletedCount;

    results.total = results.standard + results.security + results.compliance;

    return results;
  }

  /**
   * Generate audit hash
   * @private
   * @static
   * @param {Object} data - Audit data
   * @param {Date} timestamp - Timestamp
   * @returns {string} Generated hash
   */
  static #generateAuditHash(data, timestamp) {
    const hashData = {
      action: data.action,
      userId: data.userId,
      resource: data.resource,
      resourceId: data.resourceId,
      timestamp: timestamp.toISOString()
    };

    return crypto
      .createHash('sha256')
      .update(JSON.stringify(hashData))
      .digest('hex');
  }

  /**
   * Get last audit hash
   * @private
   * @static
   * @param {string} organizationId - Organization ID
   * @returns {Promise<string|null>} Last hash
   */
  static async #getLastAuditHash(organizationId) {
    const lastEntry = await AuditLogModel.findOne({ organizationId })
      .sort({ timestamp: -1 })
      .select('hash')
      .lean();

    return lastEntry?.hash || null;
  }

  /**
   * Process changes for audit
   * @private
   * @static
   * @param {Object} changes - Changes object
   * @returns {Object} Processed changes
   */
  static #processChanges(changes) {
    if (!changes) return null;

    const processed = {};

    if (changes.before) {
      processed.before = this.#sanitizeForAudit(changes.before);
    }

    if (changes.after) {
      processed.after = this.#sanitizeForAudit(changes.after);
    }

    if (changes.diff) {
      processed.diff = changes.diff;
    }

    return processed;
  }

  /**
   * Sanitize data for audit
   * @private
   * @static
   * @param {Object} data - Data to sanitize
   * @returns {Object} Sanitized data
   */
  static #sanitizeForAudit(data) {
    const sensitiveFields = ['password', 'token', 'apiKey', 'secret'];
    const sanitized = { ...data };

    sensitiveFields.forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    });

    return sanitized;
  }

  /**
   * Build audit query
   * @private
   * @static
   * @param {Object} filters - Query filters
   * @returns {Object} MongoDB query
   */
  static #buildAuditQuery(filters) {
    const query = {};

    if (filters.userId) query.userId = filters.userId;
    if (filters.organizationId) query.organizationId = filters.organizationId;
    if (filters.action) query.action = { $regex: filters.action, $options: 'i' };
    if (filters.resource) query.resource = filters.resource;
    if (filters.resourceId) query.resourceId = filters.resourceId;
    if (filters.severity) query.severity = filters.severity;

    if (filters.startDate || filters.endDate) {
      query.timestamp = {};
      if (filters.startDate) query.timestamp.$gte = new Date(filters.startDate);
      if (filters.endDate) query.timestamp.$lte = new Date(filters.endDate);
    }

    if (filters.compliance) {
      query.compliance = { $in: Array.isArray(filters.compliance) ? filters.compliance : [filters.compliance] };
    }

    return query;
  }

  /**
   * Detect compliance requirements
   * @private
   * @static
   * @param {string} action - Action performed
   * @param {string} resource - Resource type
   * @returns {Array<string>} Compliance requirements
   */
  static #detectComplianceRequirements(action, resource) {
    const requirements = [];

    // GDPR requirements
    if (resource.includes('user') || resource.includes('personal')) {
      requirements.push('gdpr');
    }

    // HIPAA requirements
    if (resource.includes('health') || resource.includes('medical')) {
      requirements.push('hipaa');
    }

    // SOX requirements
    if (resource.includes('financial') || action.includes('billing')) {
      requirements.push('sox');
    }

    // PCI requirements
    if (resource.includes('payment') || resource.includes('card')) {
      requirements.push('pci');
    }

    return requirements;
  }

  /**
   * Calculate retention period
   * @private
   * @static
   * @param {string} action - Action type
   * @param {Array<string>} compliance - Compliance requirements
   * @returns {number} Retention days
   */
  static #calculateRetention(action, compliance = []) {
    if (compliance.length > 0) {
      return this.#config.retention.compliance;
    }

    if (action.includes('security') || action.includes('auth')) {
      return this.#config.retention.security;
    }

    return this.#config.retention.standard;
  }

  /**
   * Enrich metadata
   * @private
   * @static
   * @param {Object} metadata - Original metadata
   * @returns {Object} Enriched metadata
   */
  static #enrichMetadata(metadata = {}) {
    return {
      ...metadata,
      serverVersion: config.app?.version,
      environment: config.env,
      timestamp: new Date()
    };
  }

  /**
   * Generate compliance summary
   * @private
   * @static
   * @param {Array} entries - Audit entries
   * @param {Array} regulations - Regulations to check
   * @returns {Object} Compliance summary
   */
  static #generateComplianceSummary(entries, regulations) {
    const summary = {
      totalEntries: entries.length,
      byRegulation: {},
      byAction: {},
      bySeverity: {
        info: 0,
        warning: 0,
        error: 0,
        critical: 0
      }
    };

    entries.forEach(entry => {
      // By regulation
      (entry.compliance || []).forEach(reg => {
        summary.byRegulation[reg] = (summary.byRegulation[reg] || 0) + 1;
      });

      // By action
      const actionCategory = entry.action.split('.')[0];
      summary.byAction[actionCategory] = (summary.byAction[actionCategory] || 0) + 1;

      // By severity
      summary.bySeverity[entry.severity]++;
    });

    return summary;
  }

  /**
   * Should encrypt audit data
   * @private
   * @static
   * @param {string} action - Action type
   * @param {string} resource - Resource type
   * @returns {boolean} Should encrypt
   */
  static #shouldEncrypt(action, resource) {
    const sensitiveActions = ['password', 'token', 'key', 'secret'];
    const sensitiveResources = ['user', 'auth', 'payment', 'health'];

    return sensitiveActions.some(a => action.includes(a)) ||
           sensitiveResources.some(r => resource.includes(r));
  }

  /**
   * Get data access severity
   * @private
   * @static
   * @param {string} operation - Operation type
   * @param {string} dataType - Data type
   * @returns {string} Severity level
   */
  static #getDataAccessSeverity(operation, dataType) {
    if (operation === 'delete' || operation === 'export') {
      return 'warning';
    }
    
    if (dataType.includes('sensitive') || dataType.includes('personal')) {
      return 'warning';
    }

    return 'info';
  }

  /**
   * Sign report for integrity
   * @private
   * @static
   * @param {Object} report - Report to sign
   * @returns {string} Report signature
   */
  static #signReport(report) {
    const dataToSign = {
      reportId: report.reportId,
      generatedAt: report.generatedAt,
      criteria: report.criteria,
      entriesCount: report.entries.length || report.entries
    };

    return crypto
      .createHash('sha256')
      .update(JSON.stringify(dataToSign))
      .digest('hex');
  }
}

module.exports = AuditUtils;