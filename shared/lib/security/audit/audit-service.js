'use strict';

/**
 * @fileoverview Enterprise-grade audit service with comprehensive environment-specific behaviors
 * @module shared/lib/security/audit/audit-service
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/security/audit/audit-logger
 * @requires module:shared/lib/security/audit/audit-events
 * @requires module:shared/lib/security/audit/compliance-reporter
 * @requires module:shared/lib/security/audit/audit-trail
 * @requires module:shared/lib/security/encryption/encryption-service
 */

const logger = require('../../utils/logger');
const { AppError } = require('../../utils/app-error');
const AuditLogger = require('./audit-logger');
const { AuditEvents, EventCategories, getEventCategory, getEventSeverity } = require('./audit-events');
const ComplianceReporter = require('./compliance-reporter');
const AuditTrail = require('./audit-trail');
const EncryptionService = require('../encryption/encryption-service');
const mongoose = require('mongoose');
const crypto = require('crypto');
const os = require('os');

/**
 * @class AuditService
 * @description Enterprise-grade audit service with environment-specific behaviors and comprehensive compliance features
 */
class AuditService {
  /**
   * @private
   * @static
   * @readonly
   */
  static #RISK_LEVELS = {
    CRITICAL: 'critical',
    HIGH: 'high',
    MEDIUM: 'medium',
    LOW: 'low',
    INFO: 'info'
  };

  static #BATCH_SIZE = 100;
  static #FLUSH_INTERVAL = 30000; // 30 seconds
  static #MAX_QUEUE_SIZE = 1000;
  static #RETENTION_DAYS = 365;
  static #MAX_RETRIES = 3;
  static #ALERT_THRESHOLD = 5;
  static #PERFORMANCE_THRESHOLD_MS = 10000;

  constructor(options = {}) {
    // Detect environment early
    this.environment = process.env.NODE_ENV || 'development';
    
    // Extract enterprise configuration if provided
    this.config = options.config || {};
    
    // Apply environment-specific defaults
    this._applyEnvironmentDefaults();
    
    // Map enterprise configuration to service properties with environment-aware fallbacks
    const {
      database,
      enableEncryption = this._getEnvironmentDefault('enableEncryption', true),
      enableBatching = this._getEnvironmentDefault('enableBatching', true),
      batchSize = this._getEnvironmentDefault('batchSize', AuditService.#BATCH_SIZE),
      flushInterval = this._getEnvironmentDefault('flushInterval', AuditService.#FLUSH_INTERVAL),
      enableCompliance = this._isComplianceEnabled(),
      complianceConfig = this.config.compliance || {},
      enableRiskScoring = this._getEnvironmentDefault('enableRiskScoring', true),
      retentionPolicy = { days: this._getEnvironmentDefault('retentionDays', AuditService.#RETENTION_DAYS) },
      enablePerformanceMonitoring = this._getEnvironmentDefault('enablePerformanceMonitoring', this.environment === 'production'),
      enableSecurityAlerts = this._getEnvironmentDefault('enableSecurityAlerts', this.environment === 'production'),
      strictValidation = this._getEnvironmentDefault('strictValidation', this.environment === 'production')
    } = options;

    // Core configuration
    this.database = database;
    this.enableEncryption = enableEncryption;
    this.enableBatching = enableBatching;
    this.batchSize = batchSize;
    this.flushInterval = flushInterval;
    this.enableCompliance = enableCompliance;
    this.enableRiskScoring = enableRiskScoring;
    this.retentionPolicy = retentionPolicy;
    this.enablePerformanceMonitoring = enablePerformanceMonitoring;
    this.enableSecurityAlerts = enableSecurityAlerts;
    this.strictValidation = strictValidation;

    // Enterprise features
    this.enableAnomalyDetection = this._getEnvironmentDefault('enableAnomalyDetection', this.environment === 'production');
    this.enableGeoTracking = this._getEnvironmentDefault('enableGeoTracking', this.environment === 'production');
    this.enableDataClassification = this._getEnvironmentDefault('enableDataClassification', true);
    this.enableThreatIntelligence = this._getEnvironmentDefault('enableThreatIntelligence', this.environment === 'production');
    
    // Performance and reliability
    this.enableCircuitBreaker = this._getEnvironmentDefault('enableCircuitBreaker', this.environment === 'production');
    this.enableRateLimiting = this._getEnvironmentDefault('enableRateLimiting', this.environment === 'production');
    this.enableHealthChecks = this._getEnvironmentDefault('enableHealthChecks', true);
    
    // Initialize metrics and monitoring
    this.metrics = this._initializeMetrics();
    this.performanceTracker = this._initializePerformanceTracker();
    this.circuitBreaker = this.enableCircuitBreaker ? this._initializeCircuitBreaker() : null;

    // Apply environment-specific optimizations
    this._applyEnvironmentOptimizations();

    // Initialize sub-services with environment-aware configuration
    this.auditLogger = new AuditLogger({
      database,
      enableEncryption: this.enableEncryption && (this.environment !== 'development' || this.config.development?.forceEncryption),
      batchSize: this.batchSize,
      storageType: this.config.storage?.type || 'database',
      strictValidation: this.strictValidation,
      environment: this.environment
    });

    this.auditTrail = new AuditTrail({
      database,
      enableEncryption: this.enableEncryption,
      strictValidation: this.strictValidation,
      environment: this.environment
    });

    // Initialize compliance reporter with environment awareness
    if (this.enableCompliance) {
      this.complianceReporter = new ComplianceReporter({
        database,
        auditService: this,
        strictMode: this.environment === 'production',
        ...complianceConfig
      });
    }

    // Initialize encryption service with environment-specific configuration
    if (this.enableEncryption) {
      this.encryptionService = new EncryptionService({
        algorithm: this.config.security?.encryptionAlgorithm || 'aes-256-gcm',
        keyRotationEnabled: this.environment === 'production',
        strictMode: this.environment === 'production'
      });
    }

    // Initialize threat intelligence service
    if (this.enableThreatIntelligence) {
      this.threatIntelligence = this._initializeThreatIntelligence();
    }

    // Initialize batch queue with environment-specific settings
    this.auditQueue = [];
    this.priorityQueue = []; // High-priority events for production
    this.deadLetterQueue = []; // Failed events for analysis
    this.isProcessing = false;
    this.processingStats = {
      totalProcessed: 0,
      totalFailed: 0,
      averageProcessingTime: 0,
      lastProcessedAt: null
    };

    // Start batch processing with environment-specific intervals
    if (this.enableBatching) {
      this._startBatchProcessing();
    }

    // Initialize risk scoring rules with environment-specific weights
    this.riskRules = this._initializeRiskRules();

    // Initialize security monitoring
    this.securityMonitor = this._initializeSecurityMonitor();

    // Initialize default organization and tenant for system events
    this._initializeDefaultContext();

    // Start health monitoring
    if (this.enableHealthChecks) {
      this._startHealthMonitoring();
    }

    // Initialize anomaly detection
    if (this.enableAnomalyDetection) {
      this.anomalyDetector = this._initializeAnomalyDetector();
    }

    // Setup graceful shutdown handlers
    this._setupShutdownHandlers();

    logger.info('Enterprise AuditService initialized', {
      environment: this.environment,
      enabled: this.config.enabled ?? true,
      enableEncryption: this.enableEncryption,
      enableBatching: this.enableBatching,
      enableCompliance: this.enableCompliance,
      enableRiskScoring: this.enableRiskScoring,
      enablePerformanceMonitoring: this.enablePerformanceMonitoring,
      enableSecurityAlerts: this.enableSecurityAlerts,
      strictValidation: this.strictValidation,
      batchSize: this.batchSize,
      flushInterval: this.flushInterval,
      storageType: this.config.storage?.type,
      enterpriseFeatures: {
        anomalyDetection: this.enableAnomalyDetection,
        geoTracking: this.enableGeoTracking,
        dataClassification: this.enableDataClassification,
        threatIntelligence: this.enableThreatIntelligence,
        circuitBreaker: this.enableCircuitBreaker,
        rateLimiting: this.enableRateLimiting
      }
    });
  }

  /**
   * Apply environment-specific default configurations
   * @private
   */
  _applyEnvironmentDefaults() {
    if (this.environment === 'development') {
      this.config.development = {
        // Relaxed settings for development
        reducedFlushInterval: 5000,
        reducedBatchSize: 10,
        forceEncryption: false,
        strictValidation: false,
        enableAllFeatures: false,
        logLevel: 'debug',
        enableFailFast: false,
        simulateNetworkLatency: false,
        enableDevtools: true,
        bypassSecurityChecks: true,
        allowInvalidData: true,
        disableRateLimiting: true,
        reducedRetentionDays: 30,
        ...this.config.development
      };
    } else if (this.environment === 'production') {
      this.config.production = {
        // Strict settings for production
        enhancedSecurity: true,
        strictValidation: true,
        enableAllCompliance: true,
        maxPerformanceThreshold: 5000,
        enableSecurityAuditing: true,
        enableThreatDetection: true,
        enableDataLossProtection: true,
        enableAdvancedEncryption: true,
        enableComprehensiveLogging: true,
        enableRealTimeAlerts: true,
        enableAutomatedResponse: true,
        maxRetries: 5,
        extendedRetentionDays: 2555, // 7 years
        enableBackupReplication: true,
        ...this.config.production
      };
    } else {
      // Staging/test environment defaults
      this.config.staging = {
        balancedSettings: true,
        enableTesting: true,
        reducedSecurity: false,
        enableDebugging: true,
        simulateProduction: true,
        ...this.config.staging
      };
    }
  }

  /**
   * Get environment-specific default value
   * @private
   * @param {string} key - Configuration key
   * @param {*} fallback - Fallback value
   * @returns {*} Environment-specific value
   */
  _getEnvironmentDefault(key, fallback) {
    const envConfig = this.config[this.environment] || {};
    const globalConfig = this.config[key];
    
    return envConfig[key] ?? globalConfig ?? fallback;
  }

  /**
   * Apply environment-specific optimizations
   * @private
   */
  _applyEnvironmentOptimizations() {
    if (this.environment === 'development') {
      // Development optimizations: fast feedback, minimal overhead
      this.flushInterval = this.config.development?.reducedFlushInterval ?? this.flushInterval;
      this.batchSize = this.config.development?.reducedBatchSize ?? this.batchSize;
      
      // Disable resource-intensive features in development
      if (!this.config.development?.enableAllFeatures) {
        this.enableThreatIntelligence = false;
        this.enableAnomalyDetection = false;
        this.enableGeoTracking = false;
        this.enableRateLimiting = false;
      }
      
      logger.debug('Applied development optimizations to AuditService', {
        reducedFlushInterval: this.flushInterval,
        reducedBatchSize: this.batchSize,
        disabledFeatures: ['threatIntelligence', 'anomalyDetection', 'geoTracking', 'rateLimiting']
      });
      
    } else if (this.environment === 'production') {
      // Production optimizations: performance, security, compliance
      this.batchSize = Math.min(this.batchSize * 2, 500); // Larger batches for efficiency
      
      // Enable all security and compliance features
      if (this.config.production?.enableAllCompliance) {
        this.enableCompliance = true;
        this.enableRiskScoring = true;
        this.enableSecurityAlerts = true;
        this.enableThreatIntelligence = true;
        this.enableAnomalyDetection = true;
        this.enableDataClassification = true;
      }
      
      logger.info('Applied production optimizations to AuditService', {
        enhancedBatchSize: this.batchSize,
        enabledEnterpriseFeatures: [
          'compliance', 'riskScoring', 'securityAlerts', 
          'threatIntelligence', 'anomalyDetection', 'dataClassification'
        ]
      });
    }
  }

  /**
   * Initialize metrics collection system
   * @private
   * @returns {Object} Metrics collector
   */
  _initializeMetrics() {
    return {
      eventsProcessed: 0,
      eventsFailed: 0,
      eventsQueued: 0,
      averageProcessingTime: 0,
      securityAlertsTriggered: 0,
      complianceViolations: 0,
      threatsDetected: 0,
      anomaliesDetected: 0,
      encryptionOperations: 0,
      startTime: Date.now(),
      lastHealthCheck: Date.now(),
      
      // Environment-specific metrics
      developmentMetrics: this.environment === 'development' ? {
        debugEvents: 0,
        bypassedValidations: 0,
        mockEvents: 0
      } : null,
      
      productionMetrics: this.environment === 'production' ? {
        criticalEvents: 0,
        complianceAudits: 0,
        securityScans: 0,
        performanceAlerts: 0
      } : null
    };
  }

  /**
   * Initialize performance tracking
   * @private
   * @returns {Object} Performance tracker
   */
  _initializePerformanceTracker() {
    return {
      operationTimes: new Map(),
      slowQueries: [],
      performanceAlerts: [],
      thresholds: {
        logging: this.environment === 'production' ? 1000 : 5000,
        batching: this.environment === 'production' ? 2000 : 10000,
        encryption: this.environment === 'production' ? 500 : 2000,
        validation: this.environment === 'production' ? 100 : 1000
      }
    };
  }

  /**
   * Initialize circuit breaker for fault tolerance
   * @private
   * @returns {Object} Circuit breaker
   */
  _initializeCircuitBreaker() {
    return {
      state: 'CLOSED', // CLOSED, OPEN, HALF_OPEN
      failures: 0,
      threshold: this.environment === 'production' ? 5 : 10,
      timeout: this.environment === 'production' ? 60000 : 30000,
      lastFailureTime: null,
      
      shouldAllowRequest: () => {
        if (this.circuitBreaker.state === 'CLOSED') return true;
        if (this.circuitBreaker.state === 'OPEN') {
          return Date.now() - this.circuitBreaker.lastFailureTime > this.circuitBreaker.timeout;
        }
        return true; // HALF_OPEN state
      },
      
      recordSuccess: () => {
        this.circuitBreaker.failures = 0;
        this.circuitBreaker.state = 'CLOSED';
      },
      
      recordFailure: () => {
        this.circuitBreaker.failures++;
        this.circuitBreaker.lastFailureTime = Date.now();
        if (this.circuitBreaker.failures >= this.circuitBreaker.threshold) {
          this.circuitBreaker.state = 'OPEN';
          logger.warn('Circuit breaker opened due to failures', {
            failures: this.circuitBreaker.failures,
            threshold: this.circuitBreaker.threshold
          });
        }
      }
    };
  }

  /**
   * Initialize threat intelligence service
   * @private
   * @returns {Object} Threat intelligence service
   */
  _initializeThreatIntelligence() {
    return {
      knownThreats: new Map(),
      ipReputation: new Map(),
      suspiciousPatterns: [],
      threatFeeds: this.config.security?.threatFeeds || [],
      
      checkIP: (ip) => {
        const reputation = this.threatIntelligence.ipReputation.get(ip);
        return reputation || { score: 0, category: 'unknown' };
      },
      
      updateThreatFeed: async () => {
        // In production, this would fetch from external threat intelligence services
        if (this.environment === 'development') {
          logger.debug('Threat intelligence update skipped in development');
          return;
        }
        
        // Placeholder for threat feed updates
        logger.info('Threat intelligence updated');
      }
    };
  }

  /**
   * Initialize security monitoring
   * @private
   * @returns {Object} Security monitor
   */
  _initializeSecurityMonitor() {
    return {
      activeThreats: new Map(),
      securityEvents: [],
      alertRules: this._initializeSecurityRules(),
      
      checkSecurityEvent: (event) => {
        if (!this.enableSecurityAlerts) return false;
        
        return this.securityMonitor.alertRules.some(rule => rule.matches(event));
      },
      
      triggerAlert: (event, rule) => {
        const alert = {
          id: crypto.randomUUID(),
          timestamp: new Date(),
          event,
          rule: rule.name,
          severity: rule.severity,
          environment: this.environment
        };
        
        this.metrics.securityAlertsTriggered++;
        
        if (this.environment === 'production') {
          logger.error('SECURITY ALERT', alert);
          // In production, would integrate with SIEM/alerting systems
        } else {
          logger.warn('Security alert (dev mode)', alert);
        }
        
        return alert;
      }
    };
  }

  /**
   * Initialize anomaly detection system
   * @private
   * @returns {Object} Anomaly detector
   */
  _initializeAnomalyDetector() {
    return {
      baselines: new Map(),
      anomalies: [],
      sensitivity: this.environment === 'production' ? 0.8 : 0.5,
      
      detectAnomaly: (event) => {
        if (!this.enableAnomalyDetection) return false;
        
        const key = `${event.eventType}_${event.userId}`;
        const baseline = this.anomalyDetector.baselines.get(key);
        
        if (!baseline) {
          this.anomalyDetector.baselines.set(key, {
            count: 1,
            timestamps: [Date.now()],
            patterns: [event]
          });
          return false;
        }
        
        // Simple anomaly detection based on frequency
        const timeWindow = 3600000; // 1 hour
        const recentEvents = baseline.timestamps.filter(t => Date.now() - t < timeWindow);
        const normalFrequency = baseline.count / baseline.timestamps.length * timeWindow;
        
        if (recentEvents.length > normalFrequency * 3) {
          this.metrics.anomaliesDetected++;
          return true;
        }
        
        return false;
      }
    };
  }

  /**
   * Initialize security alert rules
   * @private
   * @returns {Array} Security rules
   */
  _initializeSecurityRules() {
    const rules = [
      {
        name: 'MULTIPLE_FAILED_LOGINS',
        severity: 'high',
        matches: (event) => event.eventType === 'auth.login.failure',
        threshold: 5
      },
      {
        name: 'PRIVILEGE_ESCALATION',
        severity: 'critical',
        matches: (event) => event.eventType === 'auth.privilege.escalation'
      },
      {
        name: 'SUSPICIOUS_DATA_ACCESS',
        severity: 'medium',
        matches: (event) => event.eventType.includes('data') && event.risk?.score > 70
      },
      {
        name: 'SYSTEM_CONFIGURATION_CHANGE',
        severity: 'high',
        matches: (event) => event.eventType.includes('config') && event.environment === 'production'
      }
    ];

    // Add development-specific rules
    if (this.environment === 'development') {
      rules.push({
        name: 'DEV_SECURITY_BYPASS',
        severity: 'info',
        matches: (event) => event.metadata?.devMode === true
      });
    }

    return rules;
  }

  /**
   * Start batch processing with environment-specific behavior
   * @private
   */
  _startBatchProcessing() {
    // Primary flush timer
    this.flushTimer = setInterval(() => {
      this._flushQueue();
    }, this.flushInterval);

    // Emergency flush timer for development (faster feedback)
    if (this.environment === 'development') {
      this.emergencyFlushTimer = setInterval(() => {
        if (this.auditQueue.length > 0) {
          logger.debug('Emergency flush triggered in development mode');
          this._flushQueue();
        }
      }, 2000);
    }

    // High-priority flush for production
    if (this.environment === 'production') {
      this.priorityFlushTimer = setInterval(() => {
        if (this.priorityQueue.length > 0) {
          this._flushPriorityQueue();
        }
      }, 1000);
    }
  }

  /**
   * Start health monitoring
   * @private
   */
  _startHealthMonitoring() {
    this.healthTimer = setInterval(() => {
      this._performHealthCheck();
    }, 30000); // Every 30 seconds

    // More frequent checks in production
    if (this.environment === 'production') {
      this.detailedHealthTimer = setInterval(() => {
        this._performDetailedHealthCheck();
      }, 300000); // Every 5 minutes
    }
  }

  /**
   * Perform basic health check
   * @private
   */
  _performHealthCheck() {
    const health = {
      timestamp: new Date(),
      environment: this.environment,
      uptime: Date.now() - this.metrics.startTime,
      queueSize: this.auditQueue.length,
      priorityQueueSize: this.priorityQueue.length,
      deadLetterQueueSize: this.deadLetterQueue.length,
      memoryUsage: process.memoryUsage(),
      isProcessing: this.isProcessing,
      circuitBreakerState: this.circuitBreaker?.state || 'DISABLED',
      lastProcessed: this.processingStats.lastProcessedAt
    };

    this.metrics.lastHealthCheck = Date.now();

    // Environment-specific health checks
    if (this.environment === 'development') {
      health.developmentStatus = {
        bypassedValidations: this.metrics.developmentMetrics?.bypassedValidations || 0,
        debugMode: true,
        strictValidation: this.strictValidation
      };
    } else if (this.environment === 'production') {
      health.productionStatus = {
        securityAlertsActive: this.enableSecurityAlerts,
        complianceActive: this.enableCompliance,
        encryptionActive: this.enableEncryption,
        performanceWithinThreshold: this._checkPerformanceHealth()
      };
    }

    // Log health issues
    if (health.queueSize > this.batchSize * 5) {
      logger.warn('Audit queue size exceeding recommended threshold', {
        currentSize: health.queueSize,
        recommendedMax: this.batchSize * 5
      });
    }

    if (this.environment === 'production' && health.circuitBreakerState === 'OPEN') {
      logger.error('Circuit breaker is open - audit system degraded');
    }
  }

  /**
   * Perform detailed health check for production
   * @private
   */
  _performDetailedHealthCheck() {
    if (this.environment !== 'production') return;

    const detailedHealth = {
      database: this._checkDatabaseHealth(),
      encryption: this._checkEncryptionHealth(),
      compliance: this._checkComplianceHealth(),
      performance: this._checkPerformanceHealth(),
      security: this._checkSecurityHealth(),
      resources: this._checkResourceHealth()
    };

    // Alert on critical issues
    Object.entries(detailedHealth).forEach(([component, status]) => {
      if (status.status === 'critical') {
        logger.error(`Critical health issue in ${component}`, status);
        this.metrics.productionMetrics.performanceAlerts++;
      }
    });
  }

  /**
   * Check database health
   * @private
   * @returns {Object} Database health status
   */
  _checkDatabaseHealth() {
    try {
      const dbState = mongoose.connection.readyState;
      return {
        status: dbState === 1 ? 'healthy' : 'degraded',
        connected: dbState === 1,
        lastError: null
      };
    } catch (error) {
      return {
        status: 'critical',
        connected: false,
        lastError: error.message
      };
    }
  }

  /**
   * Check encryption health
   * @private
   * @returns {Object} Encryption health status
   */
  _checkEncryptionHealth() {
    if (!this.enableEncryption) {
      return { status: 'disabled', active: false };
    }

    try {
      // Test encryption/decryption
      const testData = 'health-check-test';
      const encrypted = this.encryptionService?.encrypt?.(testData);
      const decrypted = this.encryptionService?.decrypt?.(encrypted);
      
      return {
        status: decrypted === testData ? 'healthy' : 'degraded',
        active: true,
        operationsCount: this.metrics.encryptionOperations
      };
    } catch (error) {
      return {
        status: 'critical',
        active: false,
        error: error.message
      };
    }
  }

  /**
   * Check compliance health
   * @private
   * @returns {Object} Compliance health status
   */
  _checkComplianceHealth() {
    if (!this.enableCompliance) {
      return { status: 'disabled', active: false };
    }

    return {
      status: 'healthy',
      active: true,
      violationsCount: this.metrics.complianceViolations,
      frameworks: Object.keys(this.config.compliance?.standards || {})
    };
  }

  /**
   * Check performance health
   * @private
   * @returns {Object} Performance health status
   */
  _checkPerformanceHealth() {
    const avgProcessingTime = this.processingStats.averageProcessingTime;
    const threshold = this.environment === 'production' ? 5000 : 10000;
    
    return {
      status: avgProcessingTime > threshold ? 'degraded' : 'healthy',
      averageProcessingTime: avgProcessingTime,
      threshold: threshold,
      slowOperations: this.performanceTracker.slowQueries.length
    };
  }

  /**
   * Check security health
   * @private
   * @returns {Object} Security health status
   */
  _checkSecurityHealth() {
    return {
      status: 'healthy',
      alertsTriggered: this.metrics.securityAlertsTriggered,
      threatsDetected: this.metrics.threatsDetected,
      anomaliesDetected: this.metrics.anomaliesDetected,
      threatIntelligenceActive: this.enableThreatIntelligence
    };
  }

  /**
   * Check resource health
   * @private
   * @returns {Object} Resource health status
   */
  _checkResourceHealth() {
    const memUsage = process.memoryUsage();
    const maxMemory = 1024 * 1024 * 1024; // 1GB threshold
    
    return {
      status: memUsage.heapUsed > maxMemory ? 'degraded' : 'healthy',
      memoryUsage: memUsage,
      cpuUsage: process.cpuUsage(),
      uptime: process.uptime()
    };
  }

  /**
   * Initialize default organization and tenant context for system events
   * @private
   */
  async _initializeDefaultContext() {
    try {
      // Get mongoose models with error handling
      let Organization, Tenant;
      
      try {
        Organization = mongoose.model('Organization');
        Tenant = mongoose.model('Tenant');
      } catch (modelError) {
        if (this.environment === 'development') {
          logger.debug('Mongoose models not available in development, using mock context');
          this.defaultContext = {
            organizationId: new mongoose.Types.ObjectId(),
            tenantId: new mongoose.Types.ObjectId(),
            isMocked: true
          };
          return;
        }
        throw modelError;
      }

      // Try to get or create a default system organization
      let systemOrg = await Organization.findOne({ 
        slug: 'system',
        type: 'system' 
      }).catch(() => null);

      if (!systemOrg && this.strictValidation) {
        // Create system organization if it doesn't exist and validation is strict
        systemOrg = await Organization.create({
          name: 'System Organization',
          slug: 'system',
          type: 'system',
          status: { state: 'active' },
          settings: {
            auditRetention: this.retentionPolicy.days,
            complianceEnabled: this.enableCompliance,
            environment: this.environment
          }
        }).catch((createError) => {
          if (this.environment === 'development') {
            logger.debug('Could not create system organization in development', createError.message);
            return null;
          }
          throw createError;
        });
      }

      // Try to get or create a default system tenant
      let systemTenant = await Tenant.findOne({
        slug: 'system'
      }).catch(() => null);

      if (!systemTenant && systemOrg && this.strictValidation) {
        systemTenant = await Tenant.create({
          name: 'System Tenant',
          slug: 'system',
          organizationId: systemOrg._id,
          status: { state: 'active' },
          settings: {
            auditEnabled: true,
            environment: this.environment
          }
        }).catch((createError) => {
          if (this.environment === 'development') {
            logger.debug('Could not create system tenant in development', createError.message);
            return null;
          }
          throw createError;
        });
      }

      // Store default context with environment awareness
      this.defaultContext = {
        organizationId: systemOrg?._id || (this.environment === 'development' ? new mongoose.Types.ObjectId() : null),
        tenantId: systemTenant?._id || (this.environment === 'development' ? new mongoose.Types.ObjectId() : null),
        isMocked: this.environment === 'development' && (!systemOrg || !systemTenant),
        environment: this.environment
      };

      if (this.defaultContext.organizationId && this.defaultContext.tenantId) {
        logger.debug('Default audit context initialized', {
          organizationId: this.defaultContext.organizationId,
          tenantId: this.defaultContext.tenantId,
          isMocked: this.defaultContext.isMocked,
          environment: this.environment
        });
      } else if (this.environment === 'production') {
        logger.error('Could not initialize default audit context in production - audit events may fail validation');
      } else {
        logger.warn('Default audit context not fully available in development - using permissive mode');
      }

    } catch (error) {
      if (this.environment === 'development') {
        logger.debug('Failed to initialize default audit context in development, using mock context', {
          error: error.message
        });
        
        // Use mock context in development
        this.defaultContext = {
          organizationId: new mongoose.Types.ObjectId(),
          tenantId: new mongoose.Types.ObjectId(),
          isMocked: true,
          environment: this.environment
        };
      } else {
        logger.error('Failed to initialize default audit context', {
          error: error.message,
          environment: this.environment
        });
        
        // Set fallback context for production
        this.defaultContext = {
          organizationId: null,
          tenantId: null,
          isMocked: false,
          environment: this.environment
        };
      }
    }
  }

  /**
   * Check if compliance is enabled in enterprise configuration
   * @private
   * @returns {boolean} True if any compliance standard is enabled
   */
  _isComplianceEnabled() {
    if (!this.config.compliance?.standards) {
      return this.environment === 'production'; // Default based on environment
    }
    
    return Object.values(this.config.compliance.standards).some(enabled => enabled === true);
  }

  /**
   * ENHANCED: Enterprise-grade audit event logging with comprehensive environment-specific behaviors
   * @param {Object} event - Audit event details
   * @param {string} event.eventType - Type of event (from AuditEvents)
   * @param {string} event.userId - User who triggered the event
   * @param {string} [event.tenantId] - Tenant identifier (will use default if not provided)
   * @param {string} [event.organizationId] - Organization identifier (will use default if not provided)  
   * @param {string} event.resource - Resource affected
   * @param {string} event.action - Action performed
   * @param {string} [event.result='success'] - Result of the action
   * @param {Object} [event.metadata] - Additional event metadata
   * @param {string} [event.correlationId] - Correlation ID for tracking
   * @param {Object} [event.context] - Request context
   * @param {boolean} [event.priority=false] - High priority event (production only)
   * @returns {Promise<Object>} Logged event with ID
   */
  async logEvent(event) {
    const startTime = Date.now();
    let performanceTrackingId = null;

    try {
      // Performance tracking
      if (this.enablePerformanceMonitoring) {
        performanceTrackingId = crypto.randomUUID();
        this.performanceTracker.operationTimes.set(performanceTrackingId, startTime);
      }

      // Circuit breaker check
      if (this.circuitBreaker && !this.circuitBreaker.shouldAllowRequest()) {
        if (this.environment === 'production') {
          throw new AppError('Audit service circuit breaker open', 503, 'SERVICE_UNAVAILABLE');
        } else {
          logger.debug('Circuit breaker open, but allowing request in development mode');
        }
      }

      // Check if audit system is enabled from enterprise config
      if (this.config && this.config.enabled === false) {
        logger.debug('Audit system disabled, skipping event logging');
        return { id: null, skipped: true, reason: 'audit_disabled' };
      }

      // Environment-specific validation and fallback behavior
      const validationResult = this._validateAuditEvent(event);
      if (!validationResult.isValid) {
        if (this.environment === 'production' && this.strictValidation) {
          throw new AppError(validationResult.error, 400, 'INVALID_AUDIT_EVENT');
        } else if (this.environment === 'development') {
          logger.debug('Audit event validation failed, but allowing in development mode', {
            event: event.eventType,
            validation: validationResult,
            bypassReason: 'development_mode'
          });
          this.metrics.developmentMetrics.bypassedValidations++;
        }
      }

      // Context validation with environment-specific fallbacks
      const contextValidation = this._validateEventContext(event);
      if (!contextValidation.hasRequiredContext) {
        if (this.environment === 'production' && this.strictValidation) {
          throw new AppError(contextValidation.error, 400, 'MISSING_AUDIT_CONTEXT');
        } else {
          logger.debug('Using default context for audit event', {
            eventType: event.eventType,
            reason: contextValidation.error,
            usingDefaults: contextValidation.defaults
          });
        }
      }

      // Extract and validate event properties
      const {
        eventType,
        userId,
        tenantId,
        organizationId,
        resource,
        action,
        result = 'success',
        metadata = {},
        correlationId,
        context = {},
        priority = false
      } = event;

      // Validate required fields with environment-specific behavior
      if (!eventType || !userId || !resource || !action) {
        if (this.environment === 'development' && this.config.development?.allowInvalidData) {
          logger.debug('Missing required audit fields, using defaults in development mode');
          // Apply defaults for development
          event.eventType = eventType || 'system.debug';
          event.userId = userId || 'dev-user';
          event.resource = resource || 'dev-resource';
          event.action = action || 'dev-action';
        } else {
          throw new AppError('Missing required audit event fields', 400, 'INVALID_AUDIT_EVENT');
        }
      }

      // Enhanced event type validation with environment awareness
      if (!this._isValidEventType(event.eventType)) {
        if (this.environment === 'development') {
          logger.debug('Invalid event type, allowing in development mode', { eventType: event.eventType });
          event.eventType = 'system.debug'; // Fallback for development
        } else {
          throw new AppError('Invalid event type', 400, 'INVALID_EVENT_TYPE');
        }
      }

      // Rate limiting check (production only)
      if (this.enableRateLimiting && this.environment === 'production') {
        if (!this._checkRateLimit(userId, eventType)) {
          throw new AppError('Rate limit exceeded for audit events', 429, 'RATE_LIMIT_EXCEEDED');
        }
      }

      // Transform audit service format to database model format with environment enhancements
      const databaseCompatibleEntry = await this._transformToModelFormat({
        eventType: event.eventType,
        userId: event.userId,
        tenantId: tenantId || this.defaultContext.tenantId,
        organizationId: organizationId || this.defaultContext.organizationId,
        resource: event.resource,
        action: event.action,
        result,
        metadata: this._sanitizeMetadata(metadata),
        correlationId: correlationId || this._generateCorrelationId(),
        context: this._enhanceContext(context),
        priority,
        environment: this.environment
      });

      // Security and threat analysis (production focus)
      if (this.enableSecurityAlerts || this.enableThreatIntelligence) {
        await this._performSecurityAnalysis(databaseCompatibleEntry);
      }

      // Anomaly detection
      if (this.anomalyDetector) {
        const isAnomalous = this.anomalyDetector.detectAnomaly(databaseCompatibleEntry);
        if (isAnomalous) {
          databaseCompatibleEntry.security.anomalyDetected = true;
          logger.warn('Anomalous audit event detected', {
            auditId: databaseCompatibleEntry._id,
            eventType: databaseCompatibleEntry.event.type,
            userId: databaseCompatibleEntry.actor.userId
          });
        }
      }

      // Queue management with priority handling
      if (this.enableBatching) {
        if (priority && this.environment === 'production') {
          await this._queuePriorityAuditEntry(databaseCompatibleEntry);
        } else {
          await this._queueAuditEntry(databaseCompatibleEntry);
        }
      } else {
        // Direct logging for real-time processing
        await this.auditLogger.log(databaseCompatibleEntry);
        this.processingStats.totalProcessed++;
      }

      // Trigger alerts for high-risk events
      if (databaseCompatibleEntry.event.severity === 'critical' || databaseCompatibleEntry.event.risk.score >= 70) {
        this._triggerSecurityAlert(databaseCompatibleEntry);
      }

      // Circuit breaker success recording
      if (this.circuitBreaker) {
        this.circuitBreaker.recordSuccess();
      }

      // Update metrics
      this.metrics.eventsProcessed++;
      if (this.environment === 'production') {
        this.metrics.productionMetrics.criticalEvents += databaseCompatibleEntry.event.severity === 'critical' ? 1 : 0;
      }

      // Performance tracking
      if (performanceTrackingId) {
        const duration = Date.now() - startTime;
        this.performanceTracker.operationTimes.delete(performanceTrackingId);
        
        if (duration > this.performanceTracker.thresholds.logging) {
          this.performanceTracker.slowQueries.push({
            operation: 'logEvent',
            duration,
            eventType,
            timestamp: new Date()
          });
        }
        
        // Update average processing time
        this.processingStats.averageProcessingTime = 
          (this.processingStats.averageProcessingTime + duration) / 2;
      }

      logger.debug('Audit event logged successfully', {
        auditId: databaseCompatibleEntry._id,
        eventType,
        severity: databaseCompatibleEntry.event.severity,
        environment: this.environment,
        processingTime: Date.now() - startTime,
        priority: priority && this.environment === 'production'
      });

      return {
        id: databaseCompatibleEntry._id,
        timestamp: databaseCompatibleEntry.createdAt || new Date(),
        correlationId: databaseCompatibleEntry.relationships?.correlationId,
        severity: databaseCompatibleEntry.event.severity,
        riskScore: databaseCompatibleEntry.event.risk.score,
        environment: this.environment,
        processingTime: Date.now() - startTime
      };

    } catch (error) {
      // Circuit breaker failure recording
      if (this.circuitBreaker) {
        this.circuitBreaker.recordFailure();
      }

      // Update failure metrics
      this.metrics.eventsFailed++;
      this.processingStats.totalFailed++;

      // Performance tracking cleanup
      if (performanceTrackingId) {
        this.performanceTracker.operationTimes.delete(performanceTrackingId);
      }

      // Environment-specific error handling
      if (this.environment === 'development') {
        logger.debug('Audit event logging failed in development mode', {
          error: error.message,
          eventType: event?.eventType,
          allowFailure: this.config.development?.enableFailFast === false
        });
        
        // In development, optionally return a mock success to prevent app crashes
        if (!this.config.development?.enableFailFast) {
          return {
            id: new mongoose.Types.ObjectId(),
            timestamp: new Date(),
            correlationId: this._generateCorrelationId(),
            severity: 'info',
            riskScore: 0,
            environment: this.environment,
            mocked: true,
            originalError: error.message
          };
        }
      } else {
        logger.error('Failed to log audit event', {
          error: error.message,
          eventType: event?.eventType,
          stack: error.stack,
          environment: this.environment,
          circuitBreakerState: this.circuitBreaker?.state
        });
      }

      // Rethrow appropriate error
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Failed to log audit event',
        500,
        'AUDIT_LOG_ERROR',
        { 
          originalError: error.message,
          environment: this.environment,
          retryable: this._isRetryableError(error)
        }
      );
    }
  }

  /**
   * Validate audit event with environment-specific rules
   * @private
   * @param {Object} event - Audit event to validate
   * @returns {Object} Validation result
   */
  _validateAuditEvent(event) {
    const errors = [];

    // Required field validation
    if (!event.eventType) errors.push('eventType is required');
    if (!event.userId) errors.push('userId is required');
    if (!event.resource) errors.push('resource is required');
    if (!event.action) errors.push('action is required');

    // Environment-specific validation
    if (this.environment === 'production' && this.strictValidation) {
      // Stricter validation in production
      if (event.userId === 'test-user') errors.push('test users not allowed in production');
      if (event.eventType?.includes('debug')) errors.push('debug events not allowed in production');
      if (!event.correlationId) errors.push('correlationId required in production');
    }

    // Type validation
    if (event.eventType && typeof event.eventType !== 'string') {
      errors.push('eventType must be a string');
    }

    return {
      isValid: errors.length === 0,
      error: errors.join(', '),
      errors
    };
  }

  /**
   * Validate event context with fallback handling
   * @private
   * @param {Object} event - Audit event
   * @returns {Object} Context validation result
   */
  _validateEventContext(event) {
    const hasOrgId = !!(event.organizationId || this.defaultContext.organizationId);
    const hasTenantId = !!(event.tenantId || this.defaultContext.tenantId);
    
    return {
      hasRequiredContext: hasOrgId && hasTenantId,
      error: !hasOrgId ? 'missing organizationId' : !hasTenantId ? 'missing tenantId' : null,
      defaults: {
        organizationId: this.defaultContext.organizationId,
        tenantId: this.defaultContext.tenantId,
        isMocked: this.defaultContext.isMocked
      }
    };
  }

  /**
   * Check rate limits for audit events
   * @private
   * @param {string} userId - User identifier
   * @param {string} eventType - Event type
   * @returns {boolean} True if within rate limits
   */
  _checkRateLimit(userId, eventType) {
    if (!this.enableRateLimiting) return true;

    const key = `${userId}_${eventType}`;
    const now = Date.now();
    const windowMs = 60000; // 1 minute
    const maxRequests = 100; // per minute

    if (!this.rateLimits) {
      this.rateLimits = new Map();
    }

    const userLimit = this.rateLimits.get(key);
    if (!userLimit) {
      this.rateLimits.set(key, { count: 1, windowStart: now });
      return true;
    }

    if (now - userLimit.windowStart > windowMs) {
      // Reset window
      this.rateLimits.set(key, { count: 1, windowStart: now });
      return true;
    }

    userLimit.count++;
    return userLimit.count <= maxRequests;
  }

  /**
   * Enhance context with environment-specific data
   * @private
   * @param {Object} context - Original context
   * @returns {Object} Enhanced context
   */
  _enhanceContext(context) {
    const enhanced = {
      ...context,
      timestamp: new Date().toISOString(),
      environment: this.environment,
      nodeVersion: process.version,
      platform: os.platform(),
      hostname: os.hostname()
    };

    // Add development-specific context
    if (this.environment === 'development') {
      enhanced.development = {
        isDevelopment: true,
        strictValidation: this.strictValidation,
        mockData: this.defaultContext.isMocked
      };
    }

    // Add production-specific context
    if (this.environment === 'production') {
      enhanced.production = {
        isProduction: true,
        securityEnhanced: true,
        complianceActive: this.enableCompliance,
        encryptionActive: this.enableEncryption
      };
    }

    // Geo tracking (production focus)
    if (this.enableGeoTracking && context.ip) {
      enhanced.geo = this._getGeoLocation(context.ip);
    }

    return enhanced;
  }

  /**
   * Perform security analysis on audit event
   * @private
   * @param {Object} auditEntry - Database compatible audit entry
   */
  async _performSecurityAnalysis(auditEntry) {
    // Security event check
    if (this.securityMonitor.checkSecurityEvent(auditEntry)) {
      const matchedRules = this.securityMonitor.alertRules.filter(rule => rule.matches(auditEntry));
      for (const rule of matchedRules) {
        this.securityMonitor.triggerAlert(auditEntry, rule);
      }
    }

    // Threat intelligence check
    if (this.threatIntelligence && auditEntry.request.ip?.address) {
      const threatInfo = this.threatIntelligence.checkIP(auditEntry.request.ip.address);
      if (threatInfo.score > 50) {
        auditEntry.security.threatIndicators.push({
          type: 'known_threat_ip',
          score: threatInfo.score,
          category: threatInfo.category,
          details: `IP address found in threat intelligence: ${auditEntry.request.ip.address}`
        });
        this.metrics.threatsDetected++;
      }
    }

    // Data classification analysis
    if (this.enableDataClassification) {
      auditEntry.compliance.dataClassification = this._classifyEventData(auditEntry);
    }
  }

  /**
   * Classify event data for compliance
   * @private
   * @param {Object} auditEntry - Audit entry
   * @returns {string} Data classification
   */
  _classifyEventData(auditEntry) {
    const { eventType, metadata } = auditEntry.event;
    
    // PII detection
    if (eventType.includes('user') || eventType.includes('profile')) {
      return 'pii';
    }
    
    // Financial data
    if (eventType.includes('financial') || eventType.includes('payment')) {
      return 'financial';
    }
    
    // Health data
    if (metadata.dataType === 'PHI' || eventType.includes('health')) {
      return 'phi';
    }
    
    // Security events
    if (eventType.includes('security') || eventType.includes('auth')) {
      return 'security';
    }
    
    return 'internal';
  }

  /**
   * Get geo location for IP address
   * @private
   * @param {string} ip - IP address
   * @returns {Object} Geo location data
   */
  _getGeoLocation(ip) {
    // In production, this would integrate with geo-IP services
    if (this.environment === 'development') {
      return {
        country: 'US',
        region: 'Development',
        city: 'Local',
        isMocked: true
      };
    }
    
    // Placeholder for geo-IP lookup
    return {
      country: null,
      region: null,
      city: null,
      lookupFailed: true
    };
  }

  /**
   * ENHANCED: Transform audit service event format to database model format with enterprise features
   * @private
   * @param {Object} auditEvent - Raw audit event
   * @returns {Promise<Object>} Database model compatible entry
   */
  async _transformToModelFormat(auditEvent) {
    const {
      eventType,
      userId,
      tenantId,
      organizationId,
      resource,
      action,
      result,
      metadata,
      correlationId,
      context,
      priority,
      environment
    } = auditEvent;

    // Generate unique ID for the entry
    const auditId = new mongoose.Types.ObjectId();

    // Get event metadata from the events registry
    const eventCategory = getEventCategory(eventType);
    const eventSeverity = getEventSeverity(eventType);

    // Calculate risk score with environment-specific weights
    const riskScore = this.enableRiskScoring ? 
      this._calculateRiskScore({ eventType, action, result, context }) : 0;

    // Build database model compatible structure with enterprise enhancements
    const databaseEntry = {
      _id: auditId,
      
      // Multi-tenant context - REQUIRED by schema with fallbacks
      tenantId: mongoose.Types.ObjectId(tenantId),
      organizationId: mongoose.Types.ObjectId(organizationId),

      // Event information - REQUIRED nested structure with enhancements
      event: {
        type: eventType,
        category: eventCategory,
        action: action,
        description: this._generateEventDescription(eventType, action, resource),
        severity: eventSeverity,
        risk: {
          score: riskScore,
          level: this._getRiskLevel(riskScore),
          factors: this._calculateRiskFactors({ eventType, action, result, context }),
          calculatedAt: new Date(),
          algorithm: 'enterprise_v1.0'
        },
        priority: priority || false,
        environment: environment
      },

      // Enhanced actor information with environment context
      actor: {
        userId: userId === 'system' ? null : mongoose.Types.ObjectId(userId),
        userType: this._determineUserType(userId),
        email: context.email || null,
        name: context.userName || null,
        roles: context.roles || [],
        permissions: context.permissions || [],
        apiKeyId: context.apiKeyId || null,
        serviceAccount: userId === 'system' ? 'system' : null,
        sessionInfo: {
          sessionId: context.sessionId || null,
          isNewSession: context.isNewSession || false,
          lastActivity: context.lastActivity || new Date(),
          userAgent: context.userAgent || null
        },
        authentication: context.authentication ? {
          method: context.authentication.method || 'unknown',
          mfaUsed: context.authentication.mfaUsed || false,
          ssoProvider: context.authentication.ssoProvider || null,
          tokenType: context.authentication.tokenType || null,
          strength: this._calculateAuthStrength(context.authentication)
        } : null
      },

      // Enhanced resource information
      resource: {
        type: this._normalizeResourceType(resource),
        id: resource,
        name: metadata.resourceName || resource,
        collection: this._inferCollectionFromResource(resource),
        path: context.path || null,
        version: metadata.resourceVersion || null,
        owner: metadata.resourceOwner || null,
        metadata: {
          resourceDetails: metadata.resourceDetails || {},
          affectedRecords: metadata.affectedRecords || 1,
          dataSize: metadata.dataSize || 0,
          sensitivity: metadata.dataSensitivity || 'medium',
          tags: metadata.resourceTags || []
        }
      },

      // Enhanced request context with environment data
      request: {
        id: context.requestId || correlationId,
        method: context.method || null,
        path: context.path || null,
        query: context.query || {},
        headers: {
          userAgent: context.userAgent || null,
          referer: context.referer || null,
          acceptLanguage: context.acceptLanguage || null,
          contentType: context.contentType || null,
          authorization: context.authorization ? 'REDACTED' : null
        },
        ip: context.ip ? {
          address: context.ip,
          country: context.country || null,
          region: context.region || null,
          city: context.city || null,
          isp: context.isp || null,
          vpn: context.vpnDetected || false
        } : {},
        session: {
          sessionId: context.sessionId || null,
          isNewSession: context.isNewSession || false,
          duration: context.sessionDuration || null
        },
        environment: {
          nodeEnv: environment,
          userAgent: context.userAgent,
          platform: os.platform(),
          nodeVersion: process.version
        }
      },

      // Enhanced change details
      changes: {
        operation: this._mapActionToOperation(action),
        summary: this._generateChangeSummary(action, resource, metadata),
        affectedRecords: metadata.affectedRecords || 1,
        dataSize: metadata.dataSize || 0,
        before: metadata.before || null,
        after: metadata.after || null,
        diff: metadata.diff || null,
        batchId: metadata.batchId || null
      },

      // Enhanced result & impact tracking
      result: {
        status: result,
        statusCode: context.statusCode || (result === 'success' ? 200 : 500),
        error: result === 'failure' && context.error ? {
          code: context.error.code || 'UNKNOWN_ERROR',
          message: context.error.message || 'An error occurred',
          type: context.error.type || 'UnknownError',
          stack: environment === 'development' ? context.error.stack : null
        } : null,
        duration: context.duration || null,
        retryCount: metadata.retryCount || 0,
        impact: {
          scope: metadata.impactScope || 'single',
          affectedUsers: metadata.affectedUsers || 0,
          businessImpact: metadata.businessImpact || 'low'
        }
      },

      // Enhanced compliance & security with enterprise features
      compliance: {
        frameworks: await this._getComplianceFrameworks(eventType, metadata),
        dataClassification: this.enableDataClassification ? 
          this._classifyEventData({ event: { eventType, metadata } }) : 'internal',
        retentionRequired: this._requiresRetention(eventType),
        retentionDays: this._calculateRetentionDays(eventType),
        privacyImpact: this._assessPrivacyImpact(eventType, metadata),
        regulatoryReporting: this._requiresRegulatoryReporting(eventType),
        dataResidency: metadata.dataResidency || this.config.compliance?.defaultDataResidency || 'US'
      },

      security: {
        threatIndicators: this._getThreatIndicators(context),
        anomalyDetected: false, // Set by anomaly detection system
        riskAssessment: {
          level: this._getRiskLevel(riskScore),
          score: riskScore,
          factors: this._calculateRiskFactors({ eventType, action, result, context }),
          mitigations: this._getSuggestedMitigations(riskScore, eventType)
        },
        authentication: context.authentication ? {
          method: context.authentication.method || 'unknown',
          mfaUsed: context.authentication.mfaUsed || false,
          ssoProvider: context.authentication.ssoProvider || null,
          tokenType: context.authentication.tokenType || null,
          strength: this._calculateAuthStrength(context.authentication)
        } : {},
        encryption: {
          inTransit: context.httpsUsed || false,
          atRest: this.enableEncryption,
          keyVersion: this.encryptionService?.getCurrentKeyVersion?.() || null
        }
      },

      // Enhanced relationship tracking
      relationships: {
        correlationId: correlationId,
        traceId: context.traceId || null,
        spanId: context.spanId || null,
        parentEventId: metadata.parentEventId || null,
        causedByEventId: metadata.causedByEventId || null,
        relatedEventIds: metadata.relatedEventIds || []
      },

      // Enhanced metadata with enterprise features
      metadata: {
        tags: metadata.tags || [],
        customFields: new Map(Object.entries(metadata.customFields || {})),
        source: context.source || 'system',
        environment: environment,
        version: this.config.version || '1.0.0',
        clientVersion: context.clientVersion || null,
        buildInfo: {
          commit: process.env.GIT_COMMIT || null,
          branch: process.env.GIT_BRANCH || null,
          buildTime: process.env.BUILD_TIME || null
        },
        performance: {
          processingTime: null, // Will be set after processing
          queueTime: metadata.queueTime || null,
          networkLatency: context.networkLatency || null
        },
        debugging: environment === 'development' ? {
          mockData: this.defaultContext.isMocked,
          strictValidation: this.strictValidation,
          testMode: process.env.NODE_ENV === 'test'
        } : null
      },

      // Timestamps with timezone info
      createdAt: new Date(),
      updatedAt: new Date(),
      processedAt: null, // Set when actually persisted
      
      // Enterprise audit trail
      auditTrail: {
        createdBy: 'audit-service',
        version: 1,
        checksum: null, // Will be calculated if integrity checking enabled
        signature: null // Will be set if digital signing enabled
      }
    };

    // Add enterprise-specific enhancements
    if (this.environment === 'production') {
      // Add digital signature for integrity
      if (this.config.security?.enableDigitalSigning) {
        databaseEntry.auditTrail.signature = await this._signAuditEntry(databaseEntry);
      }
      
      // Add checksum for integrity verification
      if (this.config.security?.enableIntegrityCheck) {
        databaseEntry.auditTrail.checksum = this._calculateChecksum(databaseEntry);
      }
    }

    return databaseEntry;
  }

  /**
   * Calculate authentication strength
   * @private
   * @param {Object} authInfo - Authentication information
   * @returns {string} Authentication strength
   */
  _calculateAuthStrength(authInfo) {
    let score = 0;
    
    if (authInfo.mfaUsed) score += 50;
    if (authInfo.ssoProvider) score += 20;
    if (authInfo.tokenType === 'jwt') score += 20;
    if (authInfo.method === 'certificate') score += 30;
    
    if (score >= 70) return 'strong';
    if (score >= 40) return 'medium';
    return 'weak';
  }

  /**
   * Get risk level from score
   * @private
   * @param {number} score - Risk score (0-100)
   * @returns {string} Risk level
   */
  _getRiskLevel(score) {
    if (score >= 80) return AuditService.#RISK_LEVELS.CRITICAL;
    if (score >= 60) return AuditService.#RISK_LEVELS.HIGH;
    if (score >= 40) return AuditService.#RISK_LEVELS.MEDIUM;
    if (score >= 20) return AuditService.#RISK_LEVELS.LOW;
    return AuditService.#RISK_LEVELS.INFO;
  }

  /**
   * Get suggested mitigations for risk level
   * @private
   * @param {number} riskScore - Risk score
   * @param {string} eventType - Event type
   * @returns {Array} Suggested mitigations
   */
  _getSuggestedMitigations(riskScore, eventType) {
    const mitigations = [];
    
    if (riskScore >= 70) {
      mitigations.push('immediate_review_required');
      mitigations.push('notify_security_team');
    }
    
    if (riskScore >= 50) {
      mitigations.push('enhanced_monitoring');
      mitigations.push('additional_authentication');
    }
    
    if (eventType.includes('data.delete')) {
      mitigations.push('backup_verification');
      mitigations.push('approval_required');
    }
    
    return mitigations;
  }

  /**
   * Assess privacy impact of event
   * @private
   * @param {string} eventType - Event type
   * @param {Object} metadata - Event metadata
   * @returns {string} Privacy impact level
   */
  _assessPrivacyImpact(eventType, metadata) {
    if (eventType.includes('user') && eventType.includes('delete')) {
      return 'high';
    }
    
    if (eventType.includes('data.export') && metadata.recordCount > 100) {
      return 'high';
    }
    
    if (eventType.includes('profile') || eventType.includes('pii')) {
      return 'medium';
    }
    
    return 'low';
  }

  /**
   * Check if event requires regulatory reporting
   * @private
   * @param {string} eventType - Event type
   * @returns {boolean} True if regulatory reporting required
   */
  _requiresRegulatoryReporting(eventType) {
    const reportingEvents = [
      'security.breach',
      'data.exposure',
      'privacy.violation',
      'compliance.violation',
      'financial.fraud'
    ];
    
    return reportingEvents.some(pattern => eventType.includes(pattern.split('.')[0]));
  }

  /**
   * Sign audit entry for integrity (production only)
   * @private
   * @param {Object} auditEntry - Audit entry to sign
   * @returns {Promise<string>} Digital signature
   */
  async _signAuditEntry(auditEntry) {
    if (this.environment !== 'production') return null;
    
    try {
      const dataToSign = JSON.stringify({
        id: auditEntry._id,
        eventType: auditEntry.event.type,
        userId: auditEntry.actor.userId,
        timestamp: auditEntry.createdAt,
        checksum: auditEntry.auditTrail.checksum
      });
      
      // Use crypto to create signature
      const signature = crypto
        .createSign('RSA-SHA256')
        .update(dataToSign)
        .sign(this.config.security?.privateKey || 'default-key', 'hex');
      
      return signature;
    } catch (error) {
      logger.error('Failed to sign audit entry', { error: error.message });
      return null;
    }
  }

  /**
   * Calculate checksum for integrity verification
   * @private
   * @param {Object} auditEntry - Audit entry
   * @returns {string} SHA256 checksum
   */
  _calculateChecksum(auditEntry) {
    const dataToHash = JSON.stringify({
      eventType: auditEntry.event.type,
      userId: auditEntry.actor.userId,
      resource: auditEntry.resource.type,
      action: auditEntry.event.action,
      timestamp: auditEntry.createdAt
    });
    
    return crypto.createHash('sha256').update(dataToHash).digest('hex');
  }

  /**
   * Enhanced flush queue with comprehensive enterprise features and environment-specific behavior
   * @private
   */
  async _flushQueue() {
    // Check if audit system is enabled
    if (this.config && this.config.enabled === false) {
      if (this.environment === 'development' && this.config.development?.logEmptyFlushes) {
        logger.debug('Audit system disabled, skipping queue flush');
      }
      return;
    }

    // Early exit for empty queue with environment-specific logging
    if (this.auditQueue.length === 0) {
      if (this.environment === 'development' && this.config?.development?.logEmptyFlushes) {
        logger.debug('No audit events to flush in development mode');
      } else if (this.environment === 'production' && this.config?.processing?.logEmptyFlushes) {
        logger.info('All audit batches flushed', { batchCount: 0 });
      }
      return;
    }

    // Prevent concurrent processing with enhanced monitoring
    if (this.isProcessing) {
      if (this.environment === 'development') {
        logger.debug('Audit flush already in progress, skipping (development mode)');
      } else {
        logger.warn('Audit flush already in progress, may indicate performance issues');
        this.metrics.productionMetrics.performanceAlerts++;
      }
      return;
    }

    const flushStartTime = Date.now();
    let processedEntries = 0;
    let processedBatches = 0;
    let failedEntries = 0;
    let retryableFailures = 0;
    const originalQueueSize = this.auditQueue.length;
    const performanceThreshold = this.environment === 'production' ? 10000 : 30000;

    try {
      this.isProcessing = true;
      
      logger.debug('Starting audit queue flush', {
        queueSize: originalQueueSize,
        environment: this.environment,
        strictMode: this.strictValidation
      });

      // Get effective batch size with environment optimizations
      const effectiveBatchSize = this._getEffectiveBatchSize();
      const maxBatchesPerFlush = this._getMaxBatchesPerFlush();
      
      // Process entries in batches with comprehensive error handling
      while (this.auditQueue.length > 0 && processedBatches < maxBatchesPerFlush) {
        const entries = this.auditQueue.splice(0, effectiveBatchSize);
        
        if (entries.length === 0) {
          break;
        }

        try {
          // Enhanced validation with environment-specific behavior
          const validationResult = this._validateBatchEntries(entries);
          const validEntries = validationResult.validEntries;
          const invalidEntries = validationResult.invalidEntries;
          
          // Handle invalid entries based on environment
          if (invalidEntries.length > 0) {
            failedEntries += invalidEntries.length;
            
            if (this.environment === 'production' && this.strictValidation) {
              logger.error('Invalid audit entries rejected in production', {
                invalidCount: invalidEntries.length,
                validCount: validEntries.length,
                batchNumber: processedBatches + 1,
                errors: validationResult.errors
              });
              
              // Move invalid entries to dead letter queue for analysis
              this.deadLetterQueue.push(...invalidEntries.map(entry => ({
                ...entry,
                _failureReason: 'validation_failed',
                _failedAt: new Date(),
                _retryable: false
              })));
              
            } else if (this.environment === 'development') {
              logger.debug('Invalid audit entries found in development, attempting repair', {
                invalidCount: invalidEntries.length,
                validCount: validEntries.length
              });
              
              // Attempt to repair invalid entries in development
              const repairedEntries = this._repairInvalidEntries(invalidEntries);
              validEntries.push(...repairedEntries);
              failedEntries -= repairedEntries.length;
              
              this.metrics.developmentMetrics.bypassedValidations += repairedEntries.length;
            }
          }

          // Process valid entries
          if (validEntries.length > 0) {
            const batchStartTime = Date.now();
            
            await this.auditLogger.logBatch(validEntries);
            
            const batchDuration = Date.now() - batchStartTime;
            processedEntries += validEntries.length;
            processedBatches++;
            
            // Performance monitoring
            if (this.enablePerformanceMonitoring && batchDuration > this.performanceTracker.thresholds.batching) {
              this.performanceTracker.slowQueries.push({
                operation: 'batchFlush',
                duration: batchDuration,
                batchSize: validEntries.length,
                timestamp: new Date()
              });
              
              if (this.environment === 'production') {
                logger.warn('Slow batch processing detected', {
                  duration: batchDuration,
                  threshold: this.performanceTracker.thresholds.batching,
                  batchSize: validEntries.length
                });
              }
            }
            
            logger.debug('Batch processed successfully', {
              batchNumber: processedBatches,
              entriesProcessed: validEntries.length,
              duration: batchDuration,
              environment: this.environment
            });
          }

        } catch (batchError) {
          failedEntries += entries.length;
          
          // Enhanced error classification
          const errorClassification = this._classifyBatchError(batchError);
          
          if (errorClassification.isRetryable) {
            retryableFailures += entries.length;
            this._requeueFailedEntries(entries, batchError);
          } else {
            // Move to dead letter queue for analysis
            this.deadLetterQueue.push(...entries.map(entry => ({
              ...entry,
              _failureReason: errorClassification.reason,
              _failedAt: new Date(),
              _originalError: batchError.message,
              _retryable: false
            })));
          }
          
          // Environment-specific error handling
          if (this.environment === 'production') {
            logger.error('Batch processing failed in production', {
              batchSize: entries.length,
              batchNumber: processedBatches + 1,
              errorType: errorClassification.type,
              errorReason: errorClassification.reason,
              isRetryable: errorClassification.isRetryable,
              error: batchError.message
            });
            
            this.metrics.productionMetrics.performanceAlerts++;
            
          } else if (this.environment === 'development') {
            logger.debug('Batch processing failed in development mode', {
              batchSize: entries.length,
              error: batchError.message,
              allowFailures: !this.config.development?.enableFailFast
            });
            
            // In development, optionally continue processing
            if (!this.config.development?.enableFailFast) {
              logger.debug('Continuing processing despite failures (development mode)');
            }
          }
        }

        // Circuit breaker check
        if (this.circuitBreaker && this.circuitBreaker.state === 'OPEN') {
          logger.warn('Circuit breaker opened during batch processing, stopping flush');
          break;
        }

        // Performance timeout check
        const currentDuration = Date.now() - flushStartTime;
        if (currentDuration > performanceThreshold) {
          logger.warn('Audit flush timeout threshold reached', {
            duration: currentDuration,
            threshold: performanceThreshold,
            environment: this.environment,
            processedBatches,
            remainingQueue: this.auditQueue.length
          });
          
          if (this.environment === 'production') {
            // In production, prioritize system stability
            break;
          }
        }
      }

      // Update processing statistics
      this.processingStats.totalProcessed += processedEntries;
      this.processingStats.totalFailed += failedEntries;
      this.processingStats.lastProcessedAt = new Date();
      
      // Update metrics
      this.metrics.eventsProcessed += processedEntries;
      this.metrics.eventsFailed += failedEntries;
      
      // Final logging with environment-specific details
      const flushDuration = Date.now() - flushStartTime;
      
      if (processedEntries > 0 || this.config?.processing?.logEmptyFlushes) {
        const logLevel = this.environment === 'production' ? 'info' : 'debug';
        const logData = {
          batchCount: processedBatches,
          entriesProcessed: processedEntries,
          entriesFailed: failedEntries,
          retryableFailures: retryableFailures,
          duration: flushDuration,
          remainingQueue: this.auditQueue.length,
          deadLetterQueue: this.deadLetterQueue.length,
          environment: this.environment,
          performance: {
            averageProcessingTime: this.processingStats.averageProcessingTime,
            withinThreshold: flushDuration < performanceThreshold
          }
        };
        
        if (logLevel === 'info') {
          logger.info('Audit queue flush completed', logData);
        } else {
          logger.debug('Audit queue flush completed', logData);
        }
      }
      
      // Dead letter queue management
      if (this.deadLetterQueue.length > 100) {
        logger.warn('Dead letter queue growing, may indicate systemic issues', {
          deadLetterSize: this.deadLetterQueue.length,
          environment: this.environment
        });
        
        if (this.environment === 'production') {
          // In production, trigger alerts for investigation
          this._triggerDeadLetterAlert();
        }
      }

    } catch (error) {
      logger.error('Critical error during audit queue flush', {
        error: error.message,
        stack: error.stack,
        environment: this.environment,
        originalQueueSize,
        processedEntries,
        failedEntries,
        duration: Date.now() - flushStartTime
      });
      
      // Circuit breaker failure recording
      if (this.circuitBreaker) {
        this.circuitBreaker.recordFailure();
      }
      
      this.metrics.eventsFailed += originalQueueSize - processedEntries;
      this.processingStats.totalFailed += originalQueueSize - processedEntries;
      
    } finally {
      this.isProcessing = false;
      
      // Update average processing time
      const totalDuration = Date.now() - flushStartTime;
      this.processingStats.averageProcessingTime = 
        (this.processingStats.averageProcessingTime + totalDuration) / 2;
    }
  }

  /**
   * Flush priority queue (production only)
   * @private
   */
  async _flushPriorityQueue() {
    if (this.environment !== 'production' || this.priorityQueue.length === 0) {
      return;
    }

    try {
      const entries = this.priorityQueue.splice(0, Math.min(this.priorityQueue.length, 50));
      await this.auditLogger.logBatch(entries);
      
      logger.info('Priority audit events processed', {
        count: entries.length,
        environment: this.environment
      });
      
    } catch (error) {
      logger.error('Failed to process priority audit events', {
        error: error.message,
        count: this.priorityQueue.length
      });
    }
  }

  /**
   * Validate batch entries with comprehensive checks
   * @private
   * @param {Array} entries - Batch entries to validate
   * @returns {Object} Validation result
   */
  _validateBatchEntries(entries) {
    const validEntries = [];
    const invalidEntries = [];
    const errors = [];

    for (const entry of entries) {
      const validation = this._validateDatabaseEntry(entry);
      
      if (validation.isValid) {
        validEntries.push(entry);
      } else {
        invalidEntries.push(entry);
        errors.push({
          entryId: entry._id,
          errors: validation.errors
        });
      }
    }

    return {
      validEntries,
      invalidEntries,
      errors
    };
  }

  /**
   * Enhanced database entry validation
   * @private
   * @param {Object} entry - Database entry to validate
   * @returns {Object} Detailed validation result
   */
  _validateDatabaseEntry(entry) {
    const errors = [];

    // Required top-level fields
    if (!entry.tenantId) errors.push('missing tenantId');
    if (!entry.organizationId) errors.push('missing organizationId');

    // Required event structure
    if (!entry.event) {
      errors.push('missing event object');
    } else {
      if (!entry.event.type) errors.push('missing event.type');
      if (!entry.event.category) errors.push('missing event.category');
      if (!entry.event.action) errors.push('missing event.action');
      if (!entry.event.description) errors.push('missing event.description');
    }

    // Required resource structure
    if (!entry.resource) {
      errors.push('missing resource object');
    } else {
      if (!entry.resource.type) errors.push('missing resource.type');
    }

    // Environment-specific validation
    if (this.environment === 'production' && this.strictValidation) {
      // Additional production validations
      if (!entry.actor?.userId && entry.actor?.userType !== 'system') {
        errors.push('missing actor.userId in production');
      }
      
      if (!entry.relationships?.correlationId) {
        errors.push('missing correlationId in production');
      }
      
      if (entry.event.type?.includes('test')) {
        errors.push('test events not allowed in production');
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Repair invalid entries for development mode
   * @private
   * @param {Array} invalidEntries - Invalid entries to repair
   * @returns {Array} Repaired entries
   */
  _repairInvalidEntries(invalidEntries) {
    const repairedEntries = [];

    for (const entry of invalidEntries) {
      const repaired = { ...entry };
      let wasRepaired = false;

      // Repair missing required fields
      if (!repaired.tenantId) {
        repaired.tenantId = this.defaultContext.tenantId || new mongoose.Types.ObjectId();
        wasRepaired = true;
      }
      
      if (!repaired.organizationId) {
        repaired.organizationId = this.defaultContext.organizationId || new mongoose.Types.ObjectId();
        wasRepaired = true;
      }
      
      if (!repaired.event?.type) {
        if (!repaired.event) repaired.event = {};
        repaired.event.type = 'system.debug';
        wasRepaired = true;
      }
      
      if (!repaired.event?.category) {
        repaired.event.category = 'system';
        wasRepaired = true;
      }
      
      if (!repaired.event?.action) {
        repaired.event.action = 'debug';
        wasRepaired = true;
      }
      
      if (!repaired.event?.description) {
        repaired.event.description = 'Development mode audit event';
        wasRepaired = true;
      }
      
      if (!repaired.resource?.type) {
        if (!repaired.resource) repaired.resource = {};
        repaired.resource.type = 'development';
        wasRepaired = true;
      }

      if (wasRepaired) {
        repaired._repairedInDevelopment = true;
        repaired._repairTimestamp = new Date();
        repairedEntries.push(repaired);
      }
    }

    return repairedEntries;
  }

  /**
   * Classify batch processing errors
   * @private
   * @param {Error} error - Batch processing error
   * @returns {Object} Error classification
   */
  _classifyBatchError(error) {
    // Non-retryable errors
    if (error.name === 'ValidationError') {
      return {
        type: 'validation',
        reason: 'schema_validation_failed',
        isRetryable: false
      };
    }
    
    if (error.message.includes('permission') || error.message.includes('authorized')) {
      return {
        type: 'authorization',
        reason: 'permission_denied',
        isRetryable: false
      };
    }
    
    if (error.message.includes('quota') || error.message.includes('limit')) {
      return {
        type: 'quota',
        reason: 'quota_exceeded',
        isRetryable: false
      };
    }

    // Retryable errors
    if (error.message.includes('network') || error.message.includes('connection')) {
      return {
        type: 'network',
        reason: 'network_error',
        isRetryable: true
      };
    }
    
    if (error.message.includes('timeout')) {
      return {
        type: 'timeout',
        reason: 'operation_timeout',
        isRetryable: true
      };
    }
    
    if (error.message.includes('unavailable') || error.message.includes('service')) {
      return {
        type: 'service',
        reason: 'service_unavailable',
        isRetryable: true
      };
    }

    // Default classification
    return {
      type: 'unknown',
      reason: 'unknown_error',
      isRetryable: true
    };
  }

  /**
   * Trigger dead letter queue alert
   * @private
   */
  _triggerDeadLetterAlert() {
    const alert = {
      type: 'dead_letter_queue_alert',
      severity: 'high',
      message: 'Dead letter queue size exceeding threshold',
      queueSize: this.deadLetterQueue.length,
      timestamp: new Date(),
      environment: this.environment
    };

    logger.error('DEAD LETTER QUEUE ALERT', alert);
    
    // In production, this would integrate with alerting systems
    if (this.environment === 'production') {
      this.metrics.productionMetrics.performanceAlerts++;
    }
  }

  /**
   * Queue audit entry for batch processing with priority handling
   * @private
   * @param {Object} auditEntry - Audit entry
   */
  async _queueAuditEntry(auditEntry) {
    // Add queue timestamp for monitoring
    auditEntry.metadata.queueTime = Date.now();
    
    this.auditQueue.push(auditEntry);
    this.metrics.eventsQueued++;

    const maxQueueSize = this.config.processing?.maxQueueSize || AuditService.#MAX_QUEUE_SIZE;
    
    // Environment-specific queue management
    if (this.auditQueue.length >= maxQueueSize) {
      if (this.environment === 'production') {
        logger.warn('Audit queue at capacity, forcing flush', {
          queueSize: this.auditQueue.length,
          maxSize: maxQueueSize
        });
      }
      await this._flushQueue();
    }
  }

  /**
   * Queue priority audit entry (production only)
   * @private
   * @param {Object} auditEntry - Priority audit entry
   */
  async _queuePriorityAuditEntry(auditEntry) {
    if (this.environment !== 'production') {
      // In development, treat as normal entry
      return await this._queueAuditEntry(auditEntry);
    }

    auditEntry.metadata.queueTime = Date.now();
    auditEntry.metadata.priority = true;
    
    this.priorityQueue.push(auditEntry);
    
    // Priority queue has smaller threshold
    if (this.priorityQueue.length >= 10) {
      await this._flushPriorityQueue();
    }
  }

  /**
   * Enhanced error retry logic with environment awareness
   * @private
   * @param {Error} error - Error to check
   * @returns {boolean} True if error is retryable
   */
  _isRetryableError(error) {
    const classification = this._classifyBatchError(error);
    return classification.isRetryable;
  }

  /**
   * Re-queue failed entries with enhanced retry tracking
   * @private
   * @param {Array} entries - Failed entries to re-queue
   * @param {Error} error - Original error
   */
  _requeueFailedEntries(entries, error) {
    const maxRetries = this.environment === 'production' ? 
      this.config?.processing?.retryAttempts || AuditService.#MAX_RETRIES :
      this.config?.development?.maxRetries || 1;
    
    const retriableEntries = entries.filter(entry => {
      const retryCount = (entry._retryCount || 0) + 1;
      entry._retryCount = retryCount;
      entry._lastRetryAt = new Date().toISOString();
      entry._lastError = error.message;
      entry._errorType = this._classifyBatchError(error).type;
      
      return retryCount <= maxRetries;
    });

    // Add exponential backoff delay for production
    if (this.environment === 'production' && retriableEntries.length > 0) {
      const backoffDelay = Math.min(1000 * Math.pow(2, retriableEntries[0]._retryCount || 0), 30000);
      
      setTimeout(() => {
        this.auditQueue.unshift(...retriableEntries);
      }, backoffDelay);
      
      logger.info('Retrying failed audit entries with backoff', {
        count: retriableEntries.length,
        backoffDelay,
        retryAttempt: retriableEntries[0]._retryCount
      });
      
    } else {
      this.auditQueue.unshift(...retriableEntries);
    }

    const exceededEntries = entries.length - retriableEntries.length;
    if (exceededEntries > 0) {
      logger.error('Audit entries exceeded retry limit', {
        exceededCount: exceededEntries,
        maxRetries,
        environment: this.environment
      });
      
      // Move to dead letter queue
      this.deadLetterQueue.push(...entries.filter(entry => (entry._retryCount || 0) > maxRetries).map(entry => ({
        ...entry,
        _failureReason: 'max_retries_exceeded',
        _finalError: error.message
      })));
    }
  }

  /**
   * Setup graceful shutdown handlers
   * @private
   */
  _setupShutdownHandlers() {
    const gracefulShutdown = async (signal) => {
      logger.info(`Received ${signal}, starting graceful shutdown of AuditService`);
      
      try {
        await this.cleanup();
        logger.info('AuditService graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        logger.error('Error during AuditService shutdown', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
    process.on('SIGUSR2', gracefulShutdown); // Nodemon restart
  }

  // Include all existing utility methods with enhancements...
  
  /**
   * Enhanced risk scoring with environment-specific weights
   * @private
   */
  _calculateRiskScore(eventDetails) {
    if (!this.enableRiskScoring) return 0;

    let score = 0;
    
    const eventWeights = this.environment === 'production' ?
      this.config.riskScoring?.productionWeights || this.riskRules.eventTypes :
      this.config.riskScoring?.developmentWeights || this._getReducedRiskWeights();

    const contextFactors = this.config.riskScoring?.contextFactors || {};

    // Event type risk
    const eventRisk = eventWeights[eventDetails.eventType] || 0;
    score += eventRisk;

    // Action risk
    const actionRisk = this.riskRules.actions[eventDetails.action] || 0;
    score += actionRisk;

    // Environment-specific risk adjustments
    if (this.environment === 'production') {
      // Higher risk scoring in production
      if (eventDetails.context?.ip && this._isSuspiciousIP(eventDetails.context.ip)) {
        score += contextFactors.suspiciousIP || 30;
      }

      if (eventDetails.result === 'failure') {
        score += contextFactors.operationFailure || 20;
      }

      if (eventDetails.context?.afterHours) {
        score += contextFactors.afterHours || 15;
      }

      if (eventDetails.context?.multipleFailures) {
        score += contextFactors.multipleFailures || 25;
      }

      // Geographic risk factors
      if (eventDetails.context?.country && this._isHighRiskCountry(eventDetails.context.country)) {
        score += contextFactors.highRiskGeo || 20;
      }

      // Privilege escalation risk
      if (eventDetails.eventType.includes('privilege') || eventDetails.eventType.includes('admin')) {
        score += contextFactors.privilegeEscalation || 40;
      }

    } else if (this.environment === 'development') {
      // Reduced risk scoring in development
      score *= 0.5; // Halve risk scores in development

      if (eventDetails.context?.testUser) {
        score *= 0.1; // Minimal risk for test users
      }
    }

    // Data sensitivity risk
    if (eventDetails.metadata?.dataSensitivity === 'high') {
      score += contextFactors.highSensitivityData || 25;
    } else if (eventDetails.metadata?.dataSensitivity === 'critical') {
      score += contextFactors.criticalData || 40;
    }

    // Volume-based risk
    const affectedRecords = eventDetails.metadata?.affectedRecords || 1;
    if (affectedRecords > 1000) {
      score += contextFactors.highVolumeOperation || 30;
    } else if (affectedRecords > 100) {
      score += contextFactors.mediumVolumeOperation || 15;
    }

    return Math.min(Math.max(score, 0), 100);
  }

  /**
   * Get reduced risk weights for development environment
   * @private
   * @returns {Object} Reduced risk weights
   */
  _getReducedRiskWeights() {
    const productionWeights = this.riskRules.eventTypes;
    const reducedWeights = {};
    
    for (const [event, weight] of Object.entries(productionWeights)) {
      reducedWeights[event] = Math.max(weight * 0.3, 5); // Reduce to 30% of production weight
    }
    
    return reducedWeights;
  }

  /**
   * Check if country is considered high risk
   * @private
   * @param {string} country - Country code
   * @returns {boolean} True if high risk
   */
  _isHighRiskCountry(country) {
    const highRiskCountries = this.config.security?.highRiskCountries || ['XX', 'YY']; // Placeholder
    return highRiskCountries.includes(country);
  }

  /**
   * Validates event type with comprehensive checking
   * @private
   * @param {string} eventType - Event type to validate
   * @returns {boolean} True if valid
   */
  _isValidEventType(eventType) {
    if (!eventType || typeof eventType !== 'string') return false;

    const validTypes = Object.values(AuditEvents).reduce((acc, category) => {
      return acc.concat(Object.values(category));
    }, []);

    // Add environment-specific valid types
    if (this.environment === 'development') {
      validTypes.push('system.debug', 'test.event', 'dev.mock');
    }

    return validTypes.includes(eventType);
  }

  /**
   * Enhanced metadata sanitization with security focus
   * @private
   * @param {Object} metadata - Metadata to sanitize
   * @returns {Object} Sanitized metadata
   */
  _sanitizeMetadata(metadata) {
    if (!metadata || typeof metadata !== 'object') return {};

    const sanitized = {};

    for (const [key, value] of Object.entries(metadata)) {
      if (this._isSensitiveField(key)) {
        // Redact sensitive fields in production
        if (this.environment === 'production') {
          sanitized[key] = '[REDACTED]';
        } else {
          sanitized[key] = `[DEV:${value}]`;
        }
      } else if (typeof value === 'string') {
        // Basic XSS prevention
        sanitized[key] = value.replace(/[<>]/g, '').substring(0, 1000);
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this._sanitizeMetadata(value);
      } else if (Array.isArray(value)) {
        sanitized[key] = value.slice(0, 100).map(item => 
          typeof item === 'object' ? this._sanitizeMetadata(item) : item
        );
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Check if field contains sensitive information
   * @private
   * @param {string} fieldName - Field name to check
   * @returns {boolean} True if sensitive
   */
  _isSensitiveField(fieldName) {
    const sensitiveFields = [
      'password', 'token', 'secret', 'key', 'ssn', 'creditcard',
      'bankaccount', 'apikey', 'privatekey', 'certificate'
    ];
    
    const lowerFieldName = fieldName.toLowerCase();
    return sensitiveFields.some(sensitive => lowerFieldName.includes(sensitive));
  }

  /**
   * Calculate risk factors for audit event with comprehensive analysis
   * @private
   * @param {Object} event - Event details
   * @returns {Array} Risk factors
   */
  _calculateRiskFactors(event) {
    const factors = [];

    // Operation result factors
    if (event.result === 'failure') {
      factors.push('operation_failure');
    }

    // Network-based factors
    if (event.context?.ip && this._isSuspiciousIP(event.context.ip)) {
      factors.push('suspicious_ip');
    }

    // Time-based factors
    const hour = new Date().getHours();
    if (hour < 6 || hour > 22) {
      factors.push('after_hours');
    }

    // Weekend activity
    const dayOfWeek = new Date().getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      factors.push('weekend_activity');
    }

    // Operation type factors
    if (event.eventType.includes('delete') || event.eventType.includes('export')) {
      factors.push('sensitive_operation');
    }

    if (event.eventType.includes('admin') || event.eventType.includes('config')) {
      factors.push('administrative_operation');
    }

    // Volume factors
    const affectedRecords = event.metadata?.affectedRecords || 1;
    if (affectedRecords > 1000) {
      factors.push('high_volume_operation');
    }

    // User behavior factors
    if (event.context?.isNewUser) {
      factors.push('new_user_activity');
    }

    if (event.context?.multipleFailedAttempts) {
      factors.push('multiple_failures');
    }

    // Geographic factors
    if (event.context?.country && this._isHighRiskCountry(event.context.country)) {
      factors.push('high_risk_geography');
    }

    // Environment-specific factors
    if (this.environment === 'production') {
      if (event.context?.developmentHeaders) {
        factors.push('development_headers_in_production');
      }
      
      if (event.eventType.includes('test')) {
        factors.push('test_event_in_production');
      }
    }

    return factors;
  }

  /**
   * Enhanced suspicious IP checking with threat intelligence
   * @private
   * @param {string} ip - IP address
   * @returns {boolean} True if suspicious
   */
  _isSuspiciousIP(ip) {
    if (!ip) return false;

    // Check threat intelligence if available
    if (this.threatIntelligence) {
      const threatInfo = this.threatIntelligence.checkIP(ip);
      if (threatInfo.score > 30) return true;
    }

    // Check configured watchlists
    if (this.config.monitoring?.watchlists?.ips?.includes(ip)) {
      return true;
    }

    // Check for private IP ranges (suspicious in certain contexts)
    const privateIPPatterns = [
      /^10\./, 
      /^192\.168\./, 
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^127\./, // Localhost
      /^169\.254\./ // Link-local
    ];

    const isPrivateIP = privateIPPatterns.some(pattern => pattern.test(ip));

    // In production, private IPs might be suspicious depending on configuration
    if (this.environment === 'production' && isPrivateIP) {
      return !this.config.security?.allowPrivateIPs;
    }

    // Check for known malicious patterns
    const maliciousPatterns = [
      /^0\.0\.0\.0$/,
      /^255\.255\.255\.255$/
    ];

    return maliciousPatterns.some(pattern => pattern.test(ip));
  }

  /**
   * Enhanced security alert triggering with environment awareness
   * @private
   * @param {Object} auditEntry - Audit entry
   */
  _triggerSecurityAlert(auditEntry) {
    if (!this.enableSecurityAlerts) return;

    const alertChannels = this.config.alerting?.channels || {};
    const severity = auditEntry.event.severity;
    const riskScore = auditEntry.event.risk.score;

    const alert = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      environment: this.environment,
      auditId: auditEntry._id,
      eventType: auditEntry.event.type,
      severity: severity,
      riskScore: riskScore,
      userId: auditEntry.actor.userId,
      resource: auditEntry.resource.type,
      description: auditEntry.event.description,
      riskFactors: auditEntry.event.risk.factors,
      suggestedMitigations: auditEntry.security.riskAssessment.mitigations,
      correlationId: auditEntry.relationships.correlationId
    };

    // Environment-specific alerting behavior
    if (this.environment === 'production') {
      logger.error('SECURITY ALERT - PRODUCTION', alert);
      
      // In production, integrate with enterprise alerting systems
      this._sendToAlertingSystem(alert, alertChannels);
      
      // Auto-response for critical events
      if (severity === 'critical' && this.config.security?.enableAutoResponse) {
        this._triggerAutoResponse(alert, auditEntry);
      }
      
    } else if (this.environment === 'development') {
      logger.warn('Security alert (development mode)', {
        ...alert,
        note: 'This alert would trigger production systems in production environment'
      });
    } else {
      logger.warn('Security alert (staging/test)', alert);
    }

    this.metrics.securityAlertsTriggered++;
    
    if (this.environment === 'production') {
      this.metrics.productionMetrics.criticalEvents++;
    }
  }

  /**
   * Send alert to configured alerting systems
   * @private
   * @param {Object} alert - Alert details
   * @param {Object} channels - Configured channels
   */
  _sendToAlertingSystem(alert, channels) {
    // Email notifications
    if (channels.email?.enabled) {
      logger.info('Sending email alert', {
        recipients: channels.email.recipients,
        alertId: alert.id
      });
      // In real implementation, would integrate with email service
    }

    // Slack notifications
    if (channels.slack?.enabled) {
      logger.info('Sending Slack alert', {
        channel: channels.slack.channel,
        alertId: alert.id
      });
      // In real implementation, would integrate with Slack API
    }

    // SIEM integration
    if (channels.siem?.enabled) {
      logger.info('Sending SIEM alert', {
        endpoint: channels.siem.endpoint,
        alertId: alert.id
      });
      // In real implementation, would integrate with SIEM system
    }

    // PagerDuty for critical alerts
    if (channels.pagerduty?.enabled && alert.severity === 'critical') {
      logger.info('Triggering PagerDuty alert', {
        serviceKey: 'REDACTED',
        alertId: alert.id
      });
      // In real implementation, would integrate with PagerDuty API
    }
  }

  /**
   * Trigger automated response for critical security events
   * @private
   * @param {Object} alert - Alert details
   * @param {Object} auditEntry - Original audit entry
   */
  _triggerAutoResponse(alert, auditEntry) {
    const autoResponseConfig = this.config.security?.autoResponse || {};
    
    // Account lockout for authentication failures
    if (alert.eventType.includes('auth.login.failure') && autoResponseConfig.enableAccountLockout) {
      logger.warn('Auto-response: Account lockout recommended', {
        userId: alert.userId,
        alertId: alert.id
      });
      // In real implementation, would trigger account lockout
    }

    // IP blocking for suspicious activity
    if (alert.riskFactors.includes('suspicious_ip') && autoResponseConfig.enableIPBlocking) {
      logger.warn('Auto-response: IP blocking recommended', {
        ip: auditEntry.request.ip?.address,
        alertId: alert.id
      });
      // In real implementation, would add IP to blocklist
    }

    // Session termination for privilege escalation
    if (alert.eventType.includes('privilege') && autoResponseConfig.enableSessionTermination) {
      logger.warn('Auto-response: Session termination recommended', {
        sessionId: auditEntry.request.session?.sessionId,
        userId: alert.userId,
        alertId: alert.id
      });
      // In real implementation, would terminate user session
    }
  }

  /**
   * Initialize comprehensive risk rules with environment awareness
   * @private
   * @returns {Object} Risk rules
   */
  _initializeRiskRules() {
    const baseRules = {
      eventTypes: {
        'auth.login.failure': 30,
        'auth.mfa.bypass': 80,
        'auth.privilege.escalation': 90,
        'security.threat.detected': 85,
        'security.unauthorized.access': 75,
        'data.export': 40,
        'data.mass.delete': 70,
        'config.security.change': 60,
        'user.role.change': 50,
        'system.config.change': 45,
        'system.backup.failure': 35,
        'compliance.violation': 65,
        'system.debug': 5,
        'test.event': 0
      },
      actions: {
        'delete': 25,
        'export': 20,
        'modify': 15,
        'create': 10,
        'update': 10,
        'read': 5,
        'login': 10,
        'logout': 0,
        'debug': 0
      }
    };

    // Apply environment-specific overrides
    if (this.config.riskScoring?.customWeights) {
      const customWeights = this.config.riskScoring.customWeights;
      
      if (customWeights.eventTypes) {
        Object.assign(baseRules.eventTypes, customWeights.eventTypes);
      }
      
      if (customWeights.actions) {
        Object.assign(baseRules.actions, customWeights.actions);
      }
    }

    return baseRules;
  }

  /**
   * Generate human-readable event description with context
   * @private
   * @param {string} eventType - Event type
   * @param {string} action - Action performed
   * @param {string} resource - Resource affected
   * @returns {string} Event description
   */
  _generateEventDescription(eventType, action, resource) {
    const descriptions = {
      'auth.login.success': 'User authentication successful',
      'auth.login.failure': 'User authentication failed',
      'auth.logout': 'User session terminated',
      'auth.mfa.success': 'Multi-factor authentication successful',
      'auth.mfa.failure': 'Multi-factor authentication failed',
      'auth.privilege.escalation': 'User privilege escalation detected',
      'system.config.change': 'System configuration modified',
      'system.start': 'System service started',
      'system.stop': 'System service stopped',
      'system.backup.success': 'System backup completed successfully',
      'system.backup.failure': 'System backup failed',
      'data.create': 'Data record created',
      'data.read': 'Data record accessed',
      'data.update': 'Data record modified',
      'data.delete': 'Data record deleted',
      'data.export': 'Data exported from system',
      'data.import': 'Data imported into system',
      'security.threat.detected': 'Security threat identified',
      'security.unauthorized.access': 'Unauthorized access attempt detected',
      'security.anomaly.detected': 'Anomalous behavior detected',
      'compliance.violation.detected': 'Compliance violation identified',
      'user.role.change': 'User role assignment modified',
      'user.permission.change': 'User permission modified',
      'system.debug': 'Debug operation performed',
      'test.event': 'Test event generated'
    };

    const baseDescription = descriptions[eventType];
    if (baseDescription) {
      return `${baseDescription} - ${action} operation on ${resource}`;
    }

    // Generate dynamic description
    return `${this._capitalizeFirst(action)} operation performed on ${resource} (${eventType})`;
  }

  /**
   * Capitalize first letter of string
   * @private
   * @param {string} str - String to capitalize
   * @returns {string} Capitalized string
   */
  _capitalizeFirst(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Determine user type from user identifier with enhanced detection
   * @private
   * @param {string} userId - User identifier
   * @returns {string} User type
   */
  _determineUserType(userId) {
    if (!userId) return 'unknown';
    
    if (userId === 'system') return 'system';
    if (userId.startsWith('api_')) return 'api';
    if (userId.startsWith('service_')) return 'service';
    if (userId.startsWith('bot_')) return 'bot';
    if (userId.startsWith('admin_')) return 'admin';
    if (userId.startsWith('test_')) return 'test';
    if (userId.includes('@')) return 'user'; // Email-based user ID
    
    // Check if it's a UUID (likely service account)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(userId)) return 'service';
    
    return 'user';
  }

  /**
   * Normalize resource type with enhanced mapping
   * @private
   * @param {string} resource - Resource identifier
   * @returns {string} Normalized resource type
   */
  _normalizeResourceType(resource) {
    if (!resource) return 'unknown';

    const resourceTypeMap = {
      'audit_system': 'audit_system',
      'admin_server': 'server',
      'user': 'user',
      'organization': 'organization',
      'tenant': 'tenant',
      'system': 'system',
      'database': 'database',
      'file': 'file',
      'api': 'api',
      'service': 'service',
      'configuration': 'configuration',
      'security': 'security',
      'backup': 'backup',
      'log': 'log',
      'report': 'report',
      'workflow': 'workflow',
      'integration': 'integration',
      'notification': 'notification'
    };

    // Direct match
    if (resourceTypeMap[resource]) {
      return resourceTypeMap[resource];
    }

    // Pattern matching for complex resource identifiers
    const resourcePatterns = [
      { pattern: /user/i, type: 'user' },
      { pattern: /org/i, type: 'organization' },
      { pattern: /tenant/i, type: 'tenant' },
      { pattern: /admin/i, type: 'admin' },
      { pattern: /api/i, type: 'api' },
      { pattern: /db|database/i, type: 'database' },
      { pattern: /file|document/i, type: 'file' },
      { pattern: /config/i, type: 'configuration' },
      { pattern: /security|auth/i, type: 'security' },
      { pattern: /backup/i, type: 'backup' }
    ];

    for (const { pattern, type } of resourcePatterns) {
      if (pattern.test(resource)) {
        return type;
      }
    }

    return resource.toLowerCase() || 'unknown';
  }

  /**
   * Infer database collection from resource with enhanced logic
   * @private
   * @param {string} resource - Resource identifier
   * @returns {string} Collection name
   */
  _inferCollectionFromResource(resource) {
    if (!resource) return null;

    const collectionMap = {
      'user': 'users',
      'organization': 'organizations', 
      'tenant': 'tenants',
      'audit_system': 'audit_logs',
      'admin_server': 'servers',
      'system': 'system_configs',
      'api': 'api_keys',
      'service': 'services',
      'file': 'files',
      'database': 'databases',
      'configuration': 'configurations',
      'security': 'security_policies',
      'backup': 'backups',
      'log': 'logs',
      'report': 'reports',
      'workflow': 'workflows',
      'integration': 'integrations',
      'notification': 'notifications'
    };

    const resourceType = this._normalizeResourceType(resource);
    return collectionMap[resourceType] || null;
  }

  /**
   * Map action to database operation type with comprehensive mapping
   * @private
   * @param {string} action - Action performed
   * @returns {string} Database operation
   */
  _mapActionToOperation(action) {
    if (!action) return 'unknown';

    const operationMap = {
      'initialize': 'create',
      'startup': 'execute',
      'shutdown': 'execute',
      'start': 'execute',
      'stop': 'execute',
      'login': 'login',
      'logout': 'logout',
      'authenticate': 'authenticate',
      'authorize': 'authorize',
      'create': 'create',
      'read': 'read',
      'update': 'update',
      'delete': 'delete',
      'export': 'export',
      'import': 'import',
      'backup': 'backup',
      'restore': 'restore',
      'sync': 'sync',
      'validate': 'validate',
      'configure': 'configure',
      'deploy': 'deploy',
      'monitor': 'monitor',
      'alert': 'alert',
      'debug': 'debug',
      'test': 'test'
    };

    return operationMap[action.toLowerCase()] || 'execute';
  }

  /**
   * Generate comprehensive change summary
   * @private
   * @param {string} action - Action performed
   * @param {string} resource - Resource affected
   * @param {Object} metadata - Event metadata
   * @returns {string} Change summary
   */
  _generateChangeSummary(action, resource, metadata) {
    if (metadata.changeSummary) {
      return metadata.changeSummary;
    }

    const affectedRecords = metadata.affectedRecords || 1;
    const resourceName = metadata.resourceName || resource;
    
    let summary = `${this._capitalizeFirst(action)} operation performed on ${resourceName}`;
    
    if (affectedRecords > 1) {
      summary += ` (${affectedRecords} records affected)`;
    }
    
    if (metadata.dataSize) {
      const sizeInMB = Math.round(metadata.dataSize / 1024 / 1024 * 100) / 100;
      summary += ` - ${sizeInMB}MB of data involved`;
    }
    
    return summary;
  }

  /**
   * Get compliance frameworks applicable to event with comprehensive coverage
   * @private
   * @param {string} eventType - Event type
   * @param {Object} metadata - Event metadata
   * @returns {Promise<Array>} Applicable frameworks
   */
  async _getComplianceFrameworks(eventType, metadata) {
    const frameworks = [];
    const standards = this.config.compliance?.standards || {};

    // GDPR - EU General Data Protection Regulation
    if (standards.gdpr && this._isGDPRApplicable(eventType, metadata)) {
      frameworks.push('gdpr');
    }

    // CCPA - California Consumer Privacy Act
    if (standards.ccpa && this._isCCPAApplicable(eventType, metadata)) {
      frameworks.push('ccpa');
    }

    // HIPAA - Health Insurance Portability and Accountability Act
    if (standards.hipaa && (metadata.dataType === 'PHI' || eventType.includes('health'))) {
      frameworks.push('hipaa');
    }

    // PCI DSS - Payment Card Industry Data Security Standard
    if (standards.pci && (metadata.dataType === 'PCI' || eventType.includes('payment'))) {
      frameworks.push('pci');
    }

    // SOX - Sarbanes-Oxley Act
    if (standards.sox && this._isSOXApplicable(eventType, metadata)) {
      frameworks.push('sox');
    }

    // ISO 27001 - Information Security Management
    if (standards.iso27001 && eventType.includes('security')) {
      frameworks.push('iso27001');
    }

    // SOC 2 - Service Organization Control 2
    if (standards.soc2 && this._isSOC2Applicable(eventType, metadata)) {
      frameworks.push('soc2');
    }

    // NIST - National Institute of Standards and Technology
    if (standards.nist && this._isNISTApplicable(eventType, metadata)) {
      frameworks.push('nist');
    }

    return frameworks;
  }

  /**
   * Check if event is applicable to GDPR
   * @private
   * @param {string} eventType - Event type
   * @param {Object} metadata - Event metadata
   * @returns {boolean} True if GDPR applicable
   */
  _isGDPRApplicable(eventType, metadata) {
    return eventType.includes('data') || 
           eventType.includes('user') || 
           eventType.includes('privacy') ||
           metadata.dataType === 'PII' ||
           metadata.containsEUData === true;
  }

  /**
   * Check if event is applicable to CCPA
   * @private
   * @param {string} eventType - Event type
   * @param {Object} metadata - Event metadata
   * @returns {boolean} True if CCPA applicable
   */
  _isCCPAApplicable(eventType, metadata) {
    return (eventType.includes('data') || eventType.includes('user')) &&
           (metadata.userLocation === 'CA' || metadata.containsCAData === true);
  }

  /**
   * Check if event is applicable to SOX
   * @private
   * @param {string} eventType - Event type
   * @param {Object} metadata - Event metadata
   * @returns {boolean} True if SOX applicable
   */
  _isSOXApplicable(eventType, metadata) {
    return eventType.includes('financial') || 
           eventType.includes('config') || 
           eventType.includes('system') ||
           metadata.affectsFinancialReporting === true;
  }

  /**
   * Check if event is applicable to SOC 2
   * @private
   * @param {string} eventType - Event type
   * @param {Object} metadata - Event metadata
   * @returns {boolean} True if SOC 2 applicable
   */
  _isSOC2Applicable(eventType, metadata) {
    return eventType.includes('security') ||
           eventType.includes('data') ||
           eventType.includes('system') ||
           eventType.includes('access');
  }

  /**
   * Check if event is applicable to NIST
   * @private
   * @param {string} eventType - Event type
   * @param {Object} metadata - Event metadata
   * @returns {boolean} True if NIST applicable
   */
  _isNISTApplicable(eventType, metadata) {
    return eventType.includes('security') ||
           eventType.includes('config') ||
           eventType.includes('system') ||
           metadata.criticalSystemAffected === true;
  }

  /**
   * Check if event requires long-term retention
   * @private
   * @param {string} eventType - Event type
   * @returns {boolean} True if retention required
   */
  _requiresRetention(eventType) {
    const longRetentionEvents = [
      'auth.login.success',
      'auth.login.failure',
      'auth.privilege.escalation',
      'data.delete',
      'data.export',
      'system.config.change',
      'security.threat.detected',
      'security.unauthorized.access',
      'compliance.violation.detected',
      'financial'
    ];

    return longRetentionEvents.some(pattern => eventType.includes(pattern.split('.')[0]));
  }

  /**
   * Calculate retention days with compliance considerations
   * @private
   * @param {string} eventType - Event type
   * @returns {number} Retention days
   */
  _calculateRetentionDays(eventType) {
    const retentionMap = {
      'auth.login.success': this.environment === 'production' ? 365 : 90,
      'auth.login.failure': 730, // 2 years
      'auth.privilege.escalation': 2555, // 7 years
      'data.delete': 2555, // 7 years for regulatory compliance
      'data.export': 1095, // 3 years
      'system.config.change': 1095, // 3 years
      'security.threat.detected': 2555, // 7 years
      'security.unauthorized.access': 2555, // 7 years
      'compliance.violation.detected': 2555, // 7 years
      'financial': 2555, // 7 years for SOX compliance
      'system.debug': this.environment === 'development' ? 30 : 365,
      'test.event': this.environment === 'development' ? 7 : 30
    };

    // Check for exact matches first
    for (const [pattern, days] of Object.entries(retentionMap)) {
      if (eventType === pattern || eventType.includes(pattern.split('.')[0])) {
        return days;
      }
    }

    // Environment-specific defaults
    if (this.environment === 'production') {
      return this.retentionPolicy.days;
    } else if (this.environment === 'development') {
      return Math.min(this.retentionPolicy.days, 90);
    }

    return this.retentionPolicy.days;
  }

  /**
   * Enhanced threat indicator detection
   * @private
   * @param {Object} context - Request context
   * @returns {Array} Threat indicators
   */
  _getThreatIndicators(context) {
    const indicators = [];

    // IP-based indicators
    if (context.ip && this._isSuspiciousIP(context.ip)) {
      indicators.push({
        type: 'suspicious_ip',
        score: 30,
        details: `Suspicious IP address detected: ${context.ip}`,
        source: 'internal_analysis'
      });
    }

    // User agent indicators
    if (context.userAgent && this._isSuspiciousUserAgent(context.userAgent)) {
      indicators.push({
        type: 'suspicious_user_agent',
        score: 20,
        details: 'Suspicious user agent pattern detected',
        pattern: this._extractUserAgentPattern(context.userAgent)
      });
    }

    // Geographic indicators
    if (context.country && this._isHighRiskCountry(context.country)) {
      indicators.push({
        type: 'high_risk_geography',
        score: 25,
        details: `Request from high-risk country: ${context.country}`,
        country: context.country
      });
    }

    // Behavioral indicators
    if (context.multipleFailures) {
      indicators.push({
        type: 'multiple_failures',
        score: 35,
        details: 'Multiple consecutive failures detected',
        failureCount: context.failureCount || 'unknown'
      });
    }

    // Time-based indicators
    const hour = new Date().getHours();
    if ((hour < 6 || hour > 22) && this.environment === 'production') {
      indicators.push({
        type: 'unusual_hours',
        score: 15,
        details: `Activity during unusual hours: ${hour}:00`,
        hour: hour
      });
    }

    // Session indicators
    if (context.sessionAge && context.sessionAge > 86400000) { // > 24 hours
      indicators.push({
        type: 'long_session',
        score: 10,
        details: 'Unusually long session duration',
        sessionAge: context.sessionAge
      });
    }

    return indicators;
  }

  /**
   * Enhanced suspicious user agent detection
   * @private
   * @param {string} userAgent - User agent string
   * @returns {boolean} True if suspicious
   */
  _isSuspiciousUserAgent(userAgent) {
    if (!userAgent) return false;

    const suspiciousPatterns = [
      /bot/i,
      /crawler/i,
      /spider/i,
      /scanner/i,
      /scraper/i,
      /curl/i,
      /wget/i,
      /python/i,
      /perl/i,
      /php/i,
      /test/i,
      /automated/i,
      /headless/i
    ];

    return suspiciousPatterns.some(pattern => pattern.test(userAgent));
  }

  /**
   * Extract user agent pattern for analysis
   * @private
   * @param {string} userAgent - User agent string
   * @returns {string} Extracted pattern
   */
  _extractUserAgentPattern(userAgent) {
    if (!userAgent) return 'unknown';
    
    // Extract basic pattern (first 50 characters)
    return userAgent.substring(0, 50) + (userAgent.length > 50 ? '...' : '');
  }

  /**
   * Gets effective batch size with comprehensive environment optimizations
   * @private
   * @returns {number} Effective batch size
   */
  _getEffectiveBatchSize() {
    const baseBatchSize = this.batchSize;
    
    if (this.environment === 'development') {
      return this.config.development?.reducedBatchSize || Math.min(baseBatchSize, 25);
    }

    if (this.environment === 'production') {
      // Larger batches for production efficiency
      const multiplier = this.config.production?.batchMultiplier || 2;
      return Math.min(baseBatchSize * multiplier, 1000);
    }

    // Staging/test environment
    return Math.min(baseBatchSize, 100);
  }

  /**
   * Get maximum batches per flush based on environment
   * @private
   * @returns {number} Maximum batches per flush
   */
  _getMaxBatchesPerFlush() {
    if (this.environment === 'development') {
      return this.config.development?.maxBatchesPerFlush || 2;
    }

    if (this.environment === 'production') {
      return this.config.production?.maxBatchesPerFlush || 10;
    }

    return 5; // Staging/test default
  }

  /**
   * Generate unique correlation ID with environment context
   * @private
   * @returns {string} Correlation ID
   */
  _generateCorrelationId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    const envPrefix = this.environment.charAt(0).toUpperCase();
    
    return `${envPrefix}CORR_${timestamp}_${random}`;
  }

  /**
   * Get current service configuration
   * @returns {Object} Current configuration with environment details
   */
  getConfig() {
    return {
      ...this.config,
      runtime: {
        environment: this.environment,
        enableEncryption: this.enableEncryption,
        enableBatching: this.enableBatching,
        enableCompliance: this.enableCompliance,
        enableRiskScoring: this.enableRiskScoring,
        strictValidation: this.strictValidation,
        batchSize: this.batchSize,
        flushInterval: this.flushInterval
      }
    };
  }

  /**
   * Check if audit service is enabled with environment awareness
   * @returns {boolean} True if enabled
   */
  isEnabled() {
    return this.config?.enabled ?? true;
  }

  /**
   * Get comprehensive service health status
   * @returns {Object} Detailed health status
   */
  getHealthStatus() {
    return {
      status: this._determineOverallHealth(),
      environment: this.environment,
      uptime: Date.now() - this.metrics.startTime,
      metrics: this.metrics,
      queues: {
        audit: this.auditQueue.length,
        priority: this.priorityQueue.length,
        deadLetter: this.deadLetterQueue.length
      },
      processing: {
        isProcessing: this.isProcessing,
        stats: this.processingStats
      },
      features: {
        encryption: this.enableEncryption,
        compliance: this.enableCompliance,
        riskScoring: this.enableRiskScoring,
        securityAlerts: this.enableSecurityAlerts,
        anomalyDetection: this.enableAnomalyDetection,
        threatIntelligence: this.enableThreatIntelligence
      },
      circuitBreaker: this.circuitBreaker ? {
        state: this.circuitBreaker.state,
        failures: this.circuitBreaker.failures
      } : null
    };
  }

  /**
   * Determine overall health status
   * @private
   * @returns {string} Overall health status
   */
  _determineOverallHealth() {
    if (this.circuitBreaker?.state === 'OPEN') return 'critical';
    if (this.deadLetterQueue.length > 100) return 'degraded';
    if (this.auditQueue.length > this.batchSize * 10) return 'degraded';
    if (this.processingStats.totalFailed > this.processingStats.totalProcessed * 0.1) return 'degraded';
    
    return 'healthy';
  }

  /**
   * Get service metrics with environment-specific details
   * @returns {Object} Service metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      environment: this.environment,
      queues: {
        audit: this.auditQueue.length,
        priority: this.priorityQueue.length,
        deadLetter: this.deadLetterQueue.length
      },
      processing: this.processingStats
    };
  }

  /**
   * Enhanced cleanup with comprehensive resource management
   * @returns {Promise<void>}
   */
  async cleanup() {
    logger.info(`Starting AuditService cleanup for ${this.environment} environment`);

    try {
      // Stop all timers
      if (this.flushTimer) {
        clearInterval(this.flushTimer);
        this.flushTimer = null;
      }

      if (this.emergencyFlushTimer) {
        clearInterval(this.emergencyFlushTimer);
        this.emergencyFlushTimer = null;
      }

      if (this.priorityFlushTimer) {
        clearInterval(this.priorityFlushTimer);
        this.priorityFlushTimer = null;
      }

      if (this.healthTimer) {
        clearInterval(this.healthTimer);
        this.healthTimer = null;
      }

      if (this.detailedHealthTimer) {
        clearInterval(this.detailedHealthTimer);
        this.detailedHealthTimer = null;
      }

      // Final flush with timeout
      const flushTimeout = this.environment === 'production' ? 30000 : 10000;
      
      await Promise.race([
        this._flushQueue(),
        new Promise((resolve) => setTimeout(resolve, flushTimeout))
      ]);

      // Flush priority queue if exists
      if (this.priorityQueue.length > 0 && this.environment === 'production') {
        await Promise.race([
          this._flushPriorityQueue(),
          new Promise((resolve) => setTimeout(resolve, 5000))
        ]);
      }

      // Clean up sub-services
      if (this.auditLogger?.cleanup) {
        await this.auditLogger.cleanup();
      }

      if (this.auditTrail?.cleanup) {
        await this.auditTrail.cleanup();
      }

      if (this.complianceReporter?.cleanup) {
        await this.complianceReporter.cleanup();
      }

      // Final metrics logging
      logger.info('AuditService cleanup completed', {
        environment: this.environment,
        finalMetrics: this.getMetrics(),
        remainingQueues: {
          audit: this.auditQueue.length,
          priority: this.priorityQueue.length,
          deadLetter: this.deadLetterQueue.length
        }
      });

    } catch (error) {
      logger.error('Error during AuditService cleanup', {
        error: error.message,
        environment: this.environment,
        stack: error.stack
      });
      throw error;
    }
  }
}

module.exports = AuditService;