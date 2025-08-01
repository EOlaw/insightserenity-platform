'use strict';

/**
 * @fileoverview Enterprise-grade audit configuration for InsightSerenity Platform
 * @module admin/config/audit-config
 * @requires module:shared/config/base-config
 */

const { parseBoolean, parseNumber, parseArray } = require('../../../shared/config/base-config').helpers;

/**
 * Enterprise Audit Configuration
 * Comprehensive audit system configuration supporting compliance, security, and forensic requirements
 */
const auditConfig = {
  // =============================================================================
  // CORE AUDIT SETTINGS
  // =============================================================================
  enabled: parseBoolean(process.env.AUDIT_ENABLED, true),
  level: process.env.AUDIT_LEVEL || 'info',
  environment: process.env.NODE_ENV || 'development',

  // =============================================================================
  // PERFORMANCE AND PROCESSING
  // =============================================================================
  processing: {
    batchSize: parseNumber(process.env.AUDIT_BATCH_SIZE, 100),
    flushInterval: parseNumber(process.env.AUDIT_FLUSH_INTERVAL, 30000), // 30 seconds
    maxQueueSize: parseNumber(process.env.AUDIT_MAX_QUEUE_SIZE, 1000),
    logEmptyFlushes: parseBoolean(process.env.AUDIT_LOG_EMPTY_FLUSHES, false),
    enableBuffering: parseBoolean(process.env.AUDIT_ENABLE_BUFFERING, true),
    processingTimeout: parseNumber(process.env.AUDIT_PROCESSING_TIMEOUT, 10000),
    retryAttempts: parseNumber(process.env.AUDIT_RETRY_ATTEMPTS, 3),
    retryDelay: parseNumber(process.env.AUDIT_RETRY_DELAY, 1000)
  },

  // =============================================================================
  // STORAGE CONFIGURATION
  // =============================================================================
  storage: {
    type: process.env.AUDIT_STORAGE_TYPE || 'hybrid', // file, database, remote, hybrid
    enableEncryption: parseBoolean(process.env.AUDIT_ENCRYPTION_ENABLED, true),
    enableCompression: parseBoolean(process.env.AUDIT_COMPRESSION_ENABLED, true),
    enableHashing: parseBoolean(process.env.AUDIT_HASHING_ENABLED, true),
    enableSigning: parseBoolean(process.env.AUDIT_SIGNING_ENABLED, true),
    
    // File storage options
    file: {
      basePath: process.env.AUDIT_FILE_PATH || './logs/audit',
      rotationType: process.env.AUDIT_FILE_ROTATION || 'daily', // daily, size, count
      maxFileSize: parseNumber(process.env.AUDIT_MAX_FILE_SIZE, 100 * 1024 * 1024), // 100MB
      maxFiles: parseNumber(process.env.AUDIT_MAX_FILES, 30),
      archiveEnabled: parseBoolean(process.env.AUDIT_ARCHIVE_ENABLED, true),
      archivePath: process.env.AUDIT_ARCHIVE_PATH || './archive/audit'
    },

    // Database storage options
    database: {
      collection: process.env.AUDIT_DB_COLLECTION || 'audit_logs',
      archiveCollection: process.env.AUDIT_DB_ARCHIVE_COLLECTION || 'audit_archive',
      enableSharding: parseBoolean(process.env.AUDIT_DB_SHARDING, false),
      enableIndexes: parseBoolean(process.env.AUDIT_DB_INDEXES, true)
    },

    // Remote storage options
    remote: {
      endpoint: process.env.AUDIT_REMOTE_ENDPOINT,
      apiKey: process.env.AUDIT_REMOTE_API_KEY,
      timeout: parseNumber(process.env.AUDIT_REMOTE_TIMEOUT, 30000),
      retryAttempts: parseNumber(process.env.AUDIT_REMOTE_RETRY, 3),
      enableFailover: parseBoolean(process.env.AUDIT_REMOTE_FAILOVER, true)
    }
  },

  // =============================================================================
  // DATA RETENTION AND ARCHIVAL
  // =============================================================================
  retention: {
    retentionDays: parseNumber(process.env.AUDIT_RETENTION_DAYS, 2555), // 7 years
    archiveAfterDays: parseNumber(process.env.AUDIT_ARCHIVE_AFTER_DAYS, 365), // 1 year
    purgeAfterDays: parseNumber(process.env.AUDIT_PURGE_AFTER_DAYS, 2555), // 7 years
    enableAutoArchive: parseBoolean(process.env.AUDIT_AUTO_ARCHIVE, true),
    enableAutoPurge: parseBoolean(process.env.AUDIT_AUTO_PURGE, false),
    archiveSchedule: process.env.AUDIT_ARCHIVE_SCHEDULE || '0 2 * * 0', // Weekly at 2 AM
    purgeSchedule: process.env.AUDIT_PURGE_SCHEDULE || '0 3 1 */3 *' // Quarterly
  },

  // =============================================================================
  // SECURITY AND ENCRYPTION
  // =============================================================================
  security: {
    encryptionAlgorithm: process.env.AUDIT_ENCRYPTION_ALGORITHM || 'aes-256-gcm',
    hashingAlgorithm: process.env.AUDIT_HASHING_ALGORITHM || 'sha256',
    signingAlgorithm: process.env.AUDIT_SIGNING_ALGORITHM || 'RS256',
    enableTamperDetection: parseBoolean(process.env.AUDIT_TAMPER_DETECTION, true),
    enableIntegrityChecks: parseBoolean(process.env.AUDIT_INTEGRITY_CHECKS, true),
    keyRotationDays: parseNumber(process.env.AUDIT_KEY_ROTATION_DAYS, 90),
    sensitiveDataRedaction: parseBoolean(process.env.AUDIT_REDACT_SENSITIVE, true),
    redactionFields: parseArray(process.env.AUDIT_REDACTION_FIELDS, [
      'password', 'token', 'secret', 'apiKey', 'creditCard', 'ssn', 'email'
    ])
  },

  // =============================================================================
  // COMPLIANCE CONFIGURATION
  // =============================================================================
  compliance: {
    standards: {
      hipaa: parseBoolean(process.env.AUDIT_COMPLIANCE_HIPAA, false),
      gdpr: parseBoolean(process.env.AUDIT_COMPLIANCE_GDPR, true),
      sox: parseBoolean(process.env.AUDIT_COMPLIANCE_SOX, false),
      pci: parseBoolean(process.env.AUDIT_COMPLIANCE_PCI, false),
      iso27001: parseBoolean(process.env.AUDIT_COMPLIANCE_ISO27001, true),
      nist: parseBoolean(process.env.AUDIT_COMPLIANCE_NIST, false)
    },
    
    reporting: {
      enableAutomatedReports: parseBoolean(process.env.AUDIT_AUTO_REPORTS, true),
      reportSchedule: process.env.AUDIT_REPORT_SCHEDULE || '0 9 1 * *', // Monthly at 9 AM
      reportRetentionDays: parseNumber(process.env.AUDIT_REPORT_RETENTION, 2555),
      reportFormats: parseArray(process.env.AUDIT_REPORT_FORMATS, ['json', 'csv', 'pdf']),
      enableReportEncryption: parseBoolean(process.env.AUDIT_ENCRYPT_REPORTS, true)
    },

    dataClassification: {
      enableClassification: parseBoolean(process.env.AUDIT_DATA_CLASSIFICATION, true),
      levels: parseArray(process.env.AUDIT_CLASSIFICATION_LEVELS, [
        'public', 'internal', 'confidential', 'restricted'
      ]),
      defaultLevel: process.env.AUDIT_DEFAULT_CLASSIFICATION || 'internal'
    }
  },

  // =============================================================================
  // AUDITABLE EVENTS CONFIGURATION
  // =============================================================================
  events: {
    // Authentication events
    authentication: {
      enabled: parseBoolean(process.env.AUDIT_AUTH_ENABLED, true),
      events: parseArray(process.env.AUDIT_AUTH_EVENTS, [
        'login', 'logout', 'login_failed', 'password_reset', 'password_changed',
        'mfa_enabled', 'mfa_disabled', 'mfa_bypass', 'session_expired',
        'account_locked', 'account_unlocked'
      ])
    },

    // Authorization events
    authorization: {
      enabled: parseBoolean(process.env.AUDIT_AUTHZ_ENABLED, true),
      events: parseArray(process.env.AUDIT_AUTHZ_EVENTS, [
        'access_granted', 'access_denied', 'permission_changed',
        'role_assigned', 'role_removed', 'privilege_escalation'
      ])
    },

    // Data access events
    dataAccess: {
      enabled: parseBoolean(process.env.AUDIT_DATA_ENABLED, true),
      events: parseArray(process.env.AUDIT_DATA_EVENTS, [
        'read', 'write', 'update', 'delete', 'export', 'import',
        'bulk_operation', 'query_executed', 'backup_created', 'restore_performed'
      ]),
      trackDataChanges: parseBoolean(process.env.AUDIT_TRACK_CHANGES, true),
      enableFieldLevelAudit: parseBoolean(process.env.AUDIT_FIELD_LEVEL, true)
    },

    // System configuration events
    configuration: {
      enabled: parseBoolean(process.env.AUDIT_CONFIG_ENABLED, true),
      events: parseArray(process.env.AUDIT_CONFIG_EVENTS, [
        'config_changed', 'security_updated', 'system_modified',
        'feature_toggled', 'integration_configured', 'policy_updated'
      ])
    },

    // Security events
    security: {
      enabled: parseBoolean(process.env.AUDIT_SECURITY_ENABLED, true),
      events: parseArray(process.env.AUDIT_SECURITY_EVENTS, [
        'threat_detected', 'attack_blocked', 'vulnerability_found',
        'encryption_key_rotated', 'certificate_updated', 'security_scan',
        'anomaly_detected', 'compliance_violation'
      ])
    },

    // Business process events
    business: {
      enabled: parseBoolean(process.env.AUDIT_BUSINESS_ENABLED, true),
      events: parseArray(process.env.AUDIT_BUSINESS_EVENTS, [
        'workflow_started', 'workflow_completed', 'approval_granted',
        'approval_denied', 'document_signed', 'contract_executed'
      ])
    }
  },

  // =============================================================================
  // RISK SCORING AND ALERTING
  // =============================================================================
  riskScoring: {
    enabled: parseBoolean(process.env.AUDIT_RISK_SCORING, true),
    algorithm: process.env.AUDIT_RISK_ALGORITHM || 'weighted',
    
    eventWeights: {
      'security.threat_detected': 90,
      'security.attack_blocked': 85,
      'auth.privilege_escalation': 80,
      'auth.mfa_bypass': 75,
      'data.bulk_delete': 70,
      'data.export': 60,
      'authz.access_denied': 50,
      'auth.login_failed': 40,
      'config.security_updated': 55,
      'data.read': 10,
      'data.write': 20,
      'auth.login': 5
    },

    contextFactors: {
      afterHours: 15,
      suspiciousIP: 25,
      multipleFailures: 20,
      privilegedUser: 10,
      sensitiveResource: 15
    }
  },

  alerting: {
    enabled: parseBoolean(process.env.AUDIT_ALERTING_ENABLED, true),
    realTimeAlerts: parseBoolean(process.env.AUDIT_REALTIME_ALERTS, true),
    
    thresholds: {
      criticalRiskScore: parseNumber(process.env.AUDIT_CRITICAL_THRESHOLD, 80),
      highRiskScore: parseNumber(process.env.AUDIT_HIGH_THRESHOLD, 60),
      failedLogins: parseNumber(process.env.AUDIT_FAILED_LOGIN_THRESHOLD, 5),
      accessDenied: parseNumber(process.env.AUDIT_ACCESS_DENIED_THRESHOLD, 10),
      dataExports: parseNumber(process.env.AUDIT_DATA_EXPORT_THRESHOLD, 3),
      suspiciousActivity: parseNumber(process.env.AUDIT_SUSPICIOUS_THRESHOLD, 10)
    },

    channels: {
      email: parseBoolean(process.env.AUDIT_ALERT_EMAIL, true),
      slack: parseBoolean(process.env.AUDIT_ALERT_SLACK, false),
      webhook: parseBoolean(process.env.AUDIT_ALERT_WEBHOOK, false),
      sms: parseBoolean(process.env.AUDIT_ALERT_SMS, false)
    },

    recipients: {
      security: parseArray(process.env.AUDIT_SECURITY_RECIPIENTS, []),
      compliance: parseArray(process.env.AUDIT_COMPLIANCE_RECIPIENTS, []),
      operations: parseArray(process.env.AUDIT_OPERATIONS_RECIPIENTS, [])
    }
  },

  // =============================================================================
  // MONITORING AND WATCHLISTS
  // =============================================================================
  monitoring: {
    watchlists: {
      enabled: parseBoolean(process.env.AUDIT_WATCHLIST_ENABLED, true),
      users: parseArray(process.env.AUDIT_WATCH_USERS, []),
      ips: parseArray(process.env.AUDIT_WATCH_IPS, []),
      resources: parseArray(process.env.AUDIT_WATCH_RESOURCES, []),
      domains: parseArray(process.env.AUDIT_WATCH_DOMAINS, [])
    },

    anomalyDetection: {
      enabled: parseBoolean(process.env.AUDIT_ANOMALY_DETECTION, true),
      algorithm: process.env.AUDIT_ANOMALY_ALGORITHM || 'statistical',
      sensitivity: process.env.AUDIT_ANOMALY_SENSITIVITY || 'medium',
      lookbackDays: parseNumber(process.env.AUDIT_ANOMALY_LOOKBACK, 30),
      minimumEvents: parseNumber(process.env.AUDIT_ANOMALY_MIN_EVENTS, 100)
    },

    patterns: {
      enabled: parseBoolean(process.env.AUDIT_PATTERN_DETECTION, true),
      rapidFire: {
        enabled: parseBoolean(process.env.AUDIT_RAPID_FIRE_DETECTION, true),
        threshold: parseNumber(process.env.AUDIT_RAPID_FIRE_THRESHOLD, 10),
        timeWindow: parseNumber(process.env.AUDIT_RAPID_FIRE_WINDOW, 60000) // 1 minute
      },
      geolocation: {
        enabled: parseBoolean(process.env.AUDIT_GEO_DETECTION, false),
        impossibleTravel: parseBoolean(process.env.AUDIT_IMPOSSIBLE_TRAVEL, false)
      }
    }
  },

  // =============================================================================
  // HTTP REQUEST AUDITING
  // =============================================================================
  http: {
    enabled: parseBoolean(process.env.AUDIT_HTTP_ENABLED, true),
    auditAllRequests: parseBoolean(process.env.AUDIT_HTTP_ALL, false),
    
    includePaths: parseArray(process.env.AUDIT_HTTP_INCLUDE_PATHS, [
      '/api/admin/*', '/api/users/*', '/api/data/*', '/api/config/*'
    ]),
    
    excludePaths: parseArray(process.env.AUDIT_HTTP_EXCLUDE_PATHS, [
      '/health', '/metrics', '/api/status', '*.js', '*.css', '*.png', '*.jpg'
    ]),

    auditHeaders: parseBoolean(process.env.AUDIT_HTTP_HEADERS, false),
    auditBody: parseBoolean(process.env.AUDIT_HTTP_BODY, true),
    auditQueryParams: parseBoolean(process.env.AUDIT_HTTP_QUERY, true),
    maxBodySize: parseNumber(process.env.AUDIT_HTTP_MAX_BODY, 10240), // 10KB
    
    sensitiveHeaders: parseArray(process.env.AUDIT_SENSITIVE_HEADERS, [
      'authorization', 'cookie', 'x-api-key'
    ])
  },

  // =============================================================================
  // INTEGRATION AND EXPORT
  // =============================================================================
  integrations: {
    siem: {
      enabled: parseBoolean(process.env.AUDIT_SIEM_ENABLED, false),
      provider: process.env.AUDIT_SIEM_PROVIDER, // splunk, elastic, qradar
      endpoint: process.env.AUDIT_SIEM_ENDPOINT,
      format: process.env.AUDIT_SIEM_FORMAT || 'cef', // cef, json, syslog
      batchSize: parseNumber(process.env.AUDIT_SIEM_BATCH_SIZE, 100)
    },

    export: {
      enabled: parseBoolean(process.env.AUDIT_EXPORT_ENABLED, true),
      formats: parseArray(process.env.AUDIT_EXPORT_FORMATS, ['json', 'csv']),
      maxRecords: parseNumber(process.env.AUDIT_EXPORT_MAX_RECORDS, 10000),
      enableStreaming: parseBoolean(process.env.AUDIT_EXPORT_STREAMING, true)
    },

    webhook: {
      enabled: parseBoolean(process.env.AUDIT_WEBHOOK_ENABLED, false),
      url: process.env.AUDIT_WEBHOOK_URL,
      secret: process.env.AUDIT_WEBHOOK_SECRET,
      events: parseArray(process.env.AUDIT_WEBHOOK_EVENTS, ['critical', 'high']),
      retryAttempts: parseNumber(process.env.AUDIT_WEBHOOK_RETRY, 3)
    }
  },

  // =============================================================================
  // PERFORMANCE OPTIMIZATION
  // =============================================================================
  performance: {
    enableCaching: parseBoolean(process.env.AUDIT_CACHING_ENABLED, true),
    cacheTimeout: parseNumber(process.env.AUDIT_CACHE_TIMEOUT, 300), // 5 minutes
    enableIndexing: parseBoolean(process.env.AUDIT_INDEXING_ENABLED, true),
    enablePartitioning: parseBoolean(process.env.AUDIT_PARTITIONING_ENABLED, false),
    
    throttling: {
      enabled: parseBoolean(process.env.AUDIT_THROTTLING_ENABLED, true),
      maxEventsPerSecond: parseNumber(process.env.AUDIT_MAX_EVENTS_PER_SECOND, 1000),
      burstLimit: parseNumber(process.env.AUDIT_BURST_LIMIT, 5000)
    }
  },

  // =============================================================================
  // DEVELOPMENT AND TESTING
  // =============================================================================
  development: {
    enableTestMode: parseBoolean(process.env.AUDIT_TEST_MODE, process.env.NODE_ENV === 'test'),
    mockExternalServices: parseBoolean(process.env.AUDIT_MOCK_EXTERNAL, process.env.NODE_ENV === 'development'),
    enableDebugLogging: parseBoolean(process.env.AUDIT_DEBUG_LOGGING, process.env.NODE_ENV === 'development'),
    verboseLogging: parseBoolean(process.env.AUDIT_VERBOSE_LOGGING, false),
    
    // Reduce noise in development
    reducedFlushInterval: process.env.NODE_ENV === 'development' ? 60000 : null, // 1 minute in dev
    reducedBatchSize: process.env.NODE_ENV === 'development' ? 50 : null
  }
};

// =============================================================================
// CONFIGURATION VALIDATION
// =============================================================================

/**
 * Validates audit configuration
 * @param {Object} config - Configuration to validate
 * @throws {Error} If configuration is invalid
 */
function validateAuditConfig(config) {
  const errors = [];

  // Validate required settings
  if (!config.enabled) {
    console.warn('Audit system is disabled');
    return; // Skip validation if disabled
  }

  // Validate batch size
  if (config.processing.batchSize < 1 || config.processing.batchSize > 10000) {
    errors.push('Batch size must be between 1 and 10000');
  }

  // Validate flush interval
  if (config.processing.flushInterval < 1000) {
    errors.push('Flush interval must be at least 1000ms');
  }

  // Validate retention settings
  if (config.retention.retentionDays < 1) {
    errors.push('Retention days must be at least 1');
  }

  // Validate storage configuration
  const validStorageTypes = ['file', 'database', 'remote', 'hybrid'];
  if (!validStorageTypes.includes(config.storage.type)) {
    errors.push(`Invalid storage type: ${config.storage.type}`);
  }

  // Validate compliance standards
  const enabledStandards = Object.entries(config.compliance.standards)
    .filter(([, enabled]) => enabled)
    .map(([standard]) => standard);

  if (enabledStandards.length === 0) {
    console.warn('No compliance standards enabled');
  }

  // Validate risk scoring
  if (config.riskScoring.enabled) {
    const weights = Object.values(config.riskScoring.eventWeights);
    if (weights.some(weight => weight < 0 || weight > 100)) {
      errors.push('Risk weights must be between 0 and 100');
    }
  }

  if (errors.length > 0) {
    throw new Error(`Audit configuration validation failed: ${errors.join(', ')}`);
  }
}

// Validate configuration on load
try {
  validateAuditConfig(auditConfig);
} catch (error) {
  console.error('Audit configuration error:', error.message);
  process.exit(1);
}

// =============================================================================
// ENVIRONMENT-SPECIFIC ADJUSTMENTS
// =============================================================================

// Development optimizations
if (auditConfig.environment === 'development') {
  auditConfig.processing.flushInterval = auditConfig.development.reducedFlushInterval || auditConfig.processing.flushInterval;
  auditConfig.processing.batchSize = auditConfig.development.reducedBatchSize || auditConfig.processing.batchSize;
  auditConfig.processing.logEmptyFlushes = false;
}

// Production optimizations
if (auditConfig.environment === 'production') {
  auditConfig.security.enableTamperDetection = true;
  auditConfig.security.enableIntegrityChecks = true;
  auditConfig.alerting.realTimeAlerts = true;
}

// Export configuration
module.exports = {
  ...auditConfig,
  
  // Export utility functions
  validate: validateAuditConfig,
  
  // Export helper methods
  isEventAuditable: (eventType) => {
    const allEvents = Object.values(auditConfig.events)
      .filter(category => category.enabled)
      .flatMap(category => category.events || []);
    return allEvents.includes(eventType);
  },
  
  getRiskWeight: (eventType) => {
    return auditConfig.riskScoring.eventWeights[eventType] || 0;
  },
  
  isComplianceEnabled: (standard) => {
    return auditConfig.compliance.standards[standard] || false;
  },
  
  shouldAlert: (riskScore) => {
    return riskScore >= auditConfig.alerting.thresholds.criticalRiskScore;
  }
};