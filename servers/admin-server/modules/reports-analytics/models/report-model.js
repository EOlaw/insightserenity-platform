'use strict';

/**
 * @fileoverview Enterprise report model for comprehensive business reporting and analytics
 * @module servers/admin-server/modules/reports-analytics/models/report-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/security/encryption/encryption-service
 * @requires module:shared/lib/utils/validators/common-validators
 * @requires module:shared/lib/utils/helpers/string-helper
 * @requires module:shared/lib/utils/helpers/date-helper
 * @requires module:shared/lib/utils/helpers/crypto-helper
 * @requires module:shared/lib/services/notification-service
 * @requires module:shared/lib/services/email-service
 */

const mongoose = require('mongoose');
const BaseModel = require('../../../../../shared/lib/database/models/base-model');
const logger = require('../../../../../shared/lib/utils/logger');
const { AppError } = require('../../../../../shared/lib/utils/app-error');
const EncryptionService = require('../../../../../shared/lib/security/encryption/encryption-service');
const CommonValidator = require('../../../../../shared/lib/utils/validators/common-validators');
const stringHelper = require('../../../../../shared/lib/utils/helpers/string-helper');
const dateHelper = require('../../../../../shared/lib/utils/helpers/date-helper');
const cryptoHelper = require('../../../../../shared/lib/utils/helpers/crypto-helper');
const NotificationService = require('../../../../../shared/lib/services/notification-service');
const EmailService = require('../../../../../shared/lib/services/email-service');

/**
 * @class ReportSchema
 * @description Comprehensive report schema for enterprise reporting and analytics
 * @extends mongoose.Schema
 */
const reportSchema = new mongoose.Schema({
  // ==================== Core Report Identification ====================
  reportId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    default: function() {
      return `RPT-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    },
    description: 'Unique identifier for report'
  },

  reportReference: {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
      description: 'Reference to organization'
    },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      sparse: true,
      description: 'Reference to department'
    },
    dashboardId: {
      type: String,
      sparse: true,
      description: 'Reference to associated dashboard'
    },
    templateId: {
      type: String,
      sparse: true,
      description: 'Reference to report template'
    },
    parentReportId: {
      type: String,
      sparse: true,
      description: 'Reference to parent report for composite reports'
    },
    linkedReports: [{
      reportId: String,
      relationship: {
        type: String,
        enum: ['CHILD', 'SIBLING', 'DEPENDENCY', 'RELATED']
      },
      linkType: String
    }]
  },

  // ==================== Report Configuration ====================
  configuration: {
    name: {
      type: String,
      required: true,
      index: true,
      maxlength: 300,
      description: 'Report name'
    },
    description: {
      type: String,
      maxlength: 2000,
      description: 'Report description'
    },
    type: {
      type: String,
      enum: ['EXECUTIVE', 'OPERATIONAL', 'FINANCIAL', 'COMPLIANCE', 'ANALYTICAL', 'STATISTICAL', 'CUSTOM', 'AUDIT', 'PERFORMANCE', 'STRATEGIC'],
      required: true,
      index: true,
      default: 'OPERATIONAL'
    },
    category: {
      primary: {
        type: String,
        enum: ['SALES', 'MARKETING', 'FINANCE', 'HR', 'OPERATIONS', 'IT', 'SUPPORT', 'COMPLIANCE', 'EXECUTIVE', 'CUSTOM'],
        required: true,
        index: true
      },
      secondary: String,
      tags: [String]
    },
    format: {
      output: {
        type: String,
        enum: ['PDF', 'EXCEL', 'CSV', 'HTML', 'JSON', 'XML', 'POWERPOINT', 'WORD'],
        default: 'PDF'
      },
      orientation: {
        type: String,
        enum: ['PORTRAIT', 'LANDSCAPE'],
        default: 'PORTRAIT'
      },
      pageSize: {
        type: String,
        enum: ['A4', 'A3', 'LETTER', 'LEGAL', 'TABLOID', 'CUSTOM'],
        default: 'A4'
      },
      margins: {
        top: Number,
        bottom: Number,
        left: Number,
        right: Number
      },
      compression: {
        enabled: Boolean,
        level: Number
      }
    },
    period: {
      type: {
        type: String,
        enum: ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'CUSTOM', 'REAL_TIME'],
        default: 'MONTHLY'
      },
      startDate: Date,
      endDate: Date,
      timezone: {
        type: String,
        default: 'UTC'
      },
      fiscalYear: {
        start: String,
        end: String
      }
    },
    language: {
      primary: {
        type: String,
        default: 'en'
      },
      translations: [{
        language: String,
        title: String,
        description: String
      }]
    }
  },

  // ==================== Report Structure ====================
  structure: {
    sections: [{
      sectionId: String,
      name: String,
      type: {
        type: String,
        enum: ['HEADER', 'SUMMARY', 'DETAIL', 'CHART', 'TABLE', 'TEXT', 'FOOTER', 'APPENDIX']
      },
      order: Number,
      visible: {
        type: Boolean,
        default: true
      },
      pageBreak: {
        before: Boolean,
        after: Boolean
      },
      content: {
        title: String,
        subtitle: String,
        body: mongoose.Schema.Types.Mixed,
        formatting: mongoose.Schema.Types.Mixed
      },
      dataBinding: {
        source: String,
        query: mongoose.Schema.Types.Mixed,
        fields: [String],
        aggregations: mongoose.Schema.Types.Mixed
      },
      components: [{
        componentId: String,
        type: String,
        configuration: mongoose.Schema.Types.Mixed,
        data: mongoose.Schema.Types.Mixed
      }],
      conditions: [{
        field: String,
        operator: String,
        value: mongoose.Schema.Types.Mixed,
        action: String
      }]
    }],
    templates: {
      header: {
        enabled: Boolean,
        template: String,
        variables: mongoose.Schema.Types.Mixed
      },
      footer: {
        enabled: Boolean,
        template: String,
        variables: mongoose.Schema.Types.Mixed,
        pageNumbers: Boolean
      },
      cover: {
        enabled: Boolean,
        template: String,
        logo: String,
        branding: mongoose.Schema.Types.Mixed
      },
      tableOfContents: {
        enabled: Boolean,
        depth: Number,
        style: String
      }
    },
    styling: {
      theme: String,
      colors: {
        primary: String,
        secondary: String,
        accent: String,
        background: String,
        text: String
      },
      fonts: {
        heading: String,
        body: String,
        monospace: String
      },
      customCSS: String,
      brandGuidelines: mongoose.Schema.Types.Mixed
    }
  },

  // ==================== Data Configuration ====================
  dataConfiguration: {
    dataSources: [{
      sourceId: String,
      name: String,
      type: {
        type: String,
        enum: ['DATABASE', 'API', 'FILE', 'STREAM', 'CACHE', 'COMPUTED']
      },
      connection: mongoose.Schema.Types.Mixed,
      query: {
        type: String,
        statement: mongoose.Schema.Types.Mixed,
        parameters: mongoose.Schema.Types.Mixed,
        timeout: Number
      },
      transformation: {
        pipeline: [mongoose.Schema.Types.Mixed],
        scripts: [String],
        mappings: mongoose.Schema.Types.Mixed
      },
      cache: {
        enabled: Boolean,
        ttl: Number,
        key: String
      },
      validation: {
        rules: [mongoose.Schema.Types.Mixed],
        onError: String
      }
    }],
    parameters: [{
      parameterId: String,
      name: String,
      type: {
        type: String,
        enum: ['STRING', 'NUMBER', 'DATE', 'BOOLEAN', 'LIST', 'OBJECT']
      },
      required: Boolean,
      defaultValue: mongoose.Schema.Types.Mixed,
      validation: mongoose.Schema.Types.Mixed,
      source: String,
      displayName: String,
      description: String
    }],
    filters: [{
      filterId: String,
      name: String,
      field: String,
      operator: {
        type: String,
        enum: ['EQUALS', 'NOT_EQUALS', 'CONTAINS', 'STARTS_WITH', 'ENDS_WITH', 'GREATER_THAN', 'LESS_THAN', 'BETWEEN', 'IN', 'NOT_IN']
      },
      value: mongoose.Schema.Types.Mixed,
      dataType: String,
      applied: Boolean
    }],
    aggregations: [{
      aggregationId: String,
      name: String,
      type: {
        type: String,
        enum: ['SUM', 'AVG', 'MIN', 'MAX', 'COUNT', 'DISTINCT', 'PERCENTILE', 'STDDEV']
      },
      field: String,
      groupBy: [String],
      having: mongoose.Schema.Types.Mixed
    }],
    calculations: [{
      calculationId: String,
      name: String,
      formula: String,
      dependencies: [String],
      dataType: String,
      format: String
    }]
  },

  // ==================== Scheduling & Delivery ====================
  scheduling: {
    enabled: {
      type: Boolean,
      default: false
    },
    schedule: {
      type: {
        type: String,
        enum: ['ONE_TIME', 'RECURRING', 'TRIGGERED', 'ON_DEMAND']
      },
      frequency: {
        type: String,
        enum: ['HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'CUSTOM']
      },
      cron: String,
      timezone: String,
      startDate: Date,
      endDate: Date,
      nextRun: Date,
      lastRun: Date,
      businessDaysOnly: Boolean,
      holidayCalendar: String
    },
    delivery: {
      method: [{
        type: {
          type: String,
          enum: ['EMAIL', 'FTP', 'SFTP', 'S3', 'API', 'WEBHOOK', 'SLACK', 'TEAMS', 'SHAREPOINT']
        },
        configuration: mongoose.Schema.Types.Mixed,
        priority: Number
      }],
      recipients: [{
        type: {
          type: String,
          enum: ['USER', 'GROUP', 'ROLE', 'EMAIL', 'DYNAMIC']
        },
        identifier: String,
        name: String,
        email: String,
        format: String,
        language: String
      }],
      attachments: {
        includeReport: Boolean,
        includeData: Boolean,
        compressionEnabled: Boolean,
        password: String,
        encryption: mongoose.Schema.Types.Mixed
      },
      notification: {
        subject: String,
        body: String,
        template: String,
        variables: mongoose.Schema.Types.Mixed
      }
    },
    triggers: [{
      triggerId: String,
      name: String,
      type: {
        type: String,
        enum: ['EVENT', 'THRESHOLD', 'DATA_CHANGE', 'API_CALL', 'MANUAL']
      },
      condition: mongoose.Schema.Types.Mixed,
      action: String,
      enabled: Boolean
    }],
    retryPolicy: {
      maxRetries: Number,
      retryInterval: Number,
      backoffMultiplier: Number,
      onFailure: String
    },
    history: [{
      executionId: String,
      scheduledAt: Date,
      startedAt: Date,
      completedAt: Date,
      status: {
        type: String,
        enum: ['PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'CANCELLED', 'SKIPPED']
      },
      deliveryStatus: mongoose.Schema.Types.Mixed,
      error: String,
      retryCount: Number
    }]
  },

  // ==================== Generation & Processing ====================
  generation: {
    status: {
      current: {
        type: String,
        enum: ['IDLE', 'QUEUED', 'GENERATING', 'PROCESSING', 'FINALIZING', 'COMPLETED', 'FAILED', 'CANCELLED'],
        default: 'IDLE'
      },
      progress: {
        percentage: Number,
        currentStep: String,
        totalSteps: Number,
        message: String
      },
      lastGenerated: Date,
      generatedBy: mongoose.Schema.Types.ObjectId,
      duration: Number
    },
    options: {
      priority: {
        type: String,
        enum: ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'],
        default: 'NORMAL'
      },
      async: {
        type: Boolean,
        default: true
      },
      timeout: Number,
      maxExecutionTime: Number,
      resourceLimits: {
        memory: Number,
        cpu: Number,
        storage: Number
      }
    },
    output: {
      fileId: String,
      fileName: String,
      fileSize: Number,
      mimeType: String,
      url: String,
      expiresAt: Date,
      checksum: String,
      pages: Number,
      metadata: mongoose.Schema.Types.Mixed
    },
    artifacts: [{
      artifactId: String,
      type: String,
      name: String,
      size: Number,
      url: String,
      createdAt: Date
    }],
    logs: [{
      timestamp: Date,
      level: String,
      message: String,
      details: mongoose.Schema.Types.Mixed
    }]
  },

  // ==================== Performance & Optimization ====================
  performance: {
    metrics: {
      generationTime: Number,
      queryExecutionTime: Number,
      dataProcessingTime: Number,
      renderingTime: Number,
      totalTime: Number
    },
    dataMetrics: {
      rowsProcessed: Number,
      dataSize: Number,
      queriesExecuted: Number,
      cacheHits: Number,
      cacheMisses: Number
    },
    optimization: {
      indexesUsed: [String],
      queryPlan: mongoose.Schema.Types.Mixed,
      suggestions: [{
        type: String,
        description: String,
        impact: String,
        implemented: Boolean
      }]
    },
    resourceUsage: {
      peakMemory: Number,
      avgCpu: Number,
      ioOperations: Number,
      networkBandwidth: Number
    },
    errors: [{
      errorId: String,
      type: String,
      message: String,
      stack: String,
      timestamp: Date,
      severity: String,
      resolved: Boolean
    }]
  },

  // ==================== Analytics & Insights ====================
  analytics: {
    usage: {
      totalGenerations: {
        type: Number,
        default: 0
      },
      totalViews: {
        type: Number,
        default: 0
      },
      uniqueUsers: {
        type: Number,
        default: 0
      },
      avgGenerationTime: Number,
      lastAccessed: Date,
      accessHistory: [{
        userId: mongoose.Schema.Types.ObjectId,
        timestamp: Date,
        action: String,
        duration: Number
      }]
    },
    distribution: {
      emailsSent: Number,
      downloadsCount: Number,
      apiCalls: Number,
      channels: [{
        channel: String,
        count: Number
      }]
    },
    feedback: {
      ratings: [{
        userId: mongoose.Schema.Types.ObjectId,
        rating: Number,
        comment: String,
        timestamp: Date
      }],
      averageRating: Number,
      comments: [{
        commentId: String,
        userId: mongoose.Schema.Types.ObjectId,
        content: String,
        timestamp: Date,
        resolved: Boolean
      }]
    },
    insights: [{
      insightId: String,
      type: String,
      title: String,
      description: String,
      data: mongoose.Schema.Types.Mixed,
      confidence: Number,
      timestamp: Date
    }],
    trends: [{
      metric: String,
      period: String,
      trend: String,
      change: Number,
      forecast: mongoose.Schema.Types.Mixed
    }]
  },

  // ==================== Security & Compliance ====================
  security: {
    accessControl: {
      public: {
        type: Boolean,
        default: false
      },
      requiresAuthentication: {
        type: Boolean,
        default: true
      },
      allowedUsers: [mongoose.Schema.Types.ObjectId],
      allowedRoles: [String],
      allowedGroups: [String],
      deniedUsers: [mongoose.Schema.Types.ObjectId],
      permissions: [{
        principal: String,
        principalType: String,
        permissions: [String],
        grantedBy: mongoose.Schema.Types.ObjectId,
        grantedAt: Date
      }]
    },
    dataProtection: {
      classification: {
        type: String,
        enum: ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED', 'TOP_SECRET'],
        default: 'INTERNAL'
      },
      containsPII: Boolean,
      piiFields: [String],
      encryption: {
        enabled: Boolean,
        algorithm: String,
        keyId: String
      },
      watermark: {
        enabled: Boolean,
        text: String,
        position: String
      },
      redaction: {
        enabled: Boolean,
        rules: [mongoose.Schema.Types.Mixed]
      }
    },
    audit: {
      enabled: {
        type: Boolean,
        default: true
      },
      retention: {
        days: Number,
        policy: String
      },
      trail: [{
        eventId: String,
        eventType: String,
        userId: mongoose.Schema.Types.ObjectId,
        timestamp: Date,
        action: String,
        details: mongoose.Schema.Types.Mixed,
        ipAddress: String,
        userAgent: String
      }]
    },
    compliance: {
      standards: [String],
      regulations: [String],
      certifications: [String],
      validations: [{
        type: String,
        passed: Boolean,
        timestamp: Date,
        details: mongoose.Schema.Types.Mixed
      }]
    },
    signature: {
      required: Boolean,
      signatories: [{
        userId: mongoose.Schema.Types.ObjectId,
        role: String,
        signed: Boolean,
        signedAt: Date,
        signature: String
      }]
    }
  },

  // ==================== Versioning & History ====================
  versioning: {
    currentVersion: {
      type: String,
      default: '1.0.0'
    },
    versions: [{
      versionId: String,
      versionNumber: String,
      createdBy: mongoose.Schema.Types.ObjectId,
      createdAt: Date,
      changes: [String],
      changeLog: String,
      snapshot: mongoose.Schema.Types.Mixed,
      published: Boolean,
      deprecated: Boolean
    }],
    comparison: {
      enabled: Boolean,
      baseVersion: String,
      compareVersions: [String],
      differences: mongoose.Schema.Types.Mixed
    },
    approval: {
      required: Boolean,
      workflow: String,
      approvals: [{
        approverId: mongoose.Schema.Types.ObjectId,
        approverRole: String,
        status: String,
        timestamp: Date,
        comments: String
      }]
    }
  },

  // ==================== Metadata & Configuration ====================
  metadata: {
    status: {
      type: String,
      enum: ['DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED', 'DEPRECATED', 'DELETED'],
      default: 'DRAFT',
      index: true
    },
    priority: {
      type: Number,
      default: 100
    },
    tags: [String],
    labels: [{
      key: String,
      value: String
    }],
    customFields: mongoose.Schema.Types.Mixed,
    flags: {
      isTemplate: Boolean,
      isPublic: Boolean,
      isFavorite: Boolean,
      isOfficial: Boolean,
      requiresReview: Boolean,
      autoArchive: Boolean
    },
    lifecycle: {
      createdAt: Date,
      createdBy: mongoose.Schema.Types.ObjectId,
      updatedAt: Date,
      updatedBy: mongoose.Schema.Types.ObjectId,
      publishedAt: Date,
      publishedBy: mongoose.Schema.Types.ObjectId,
      archivedAt: Date,
      archivedBy: mongoose.Schema.Types.ObjectId,
      expiresAt: Date
    },
    dependencies: [{
      type: String,
      id: String,
      name: String,
      version: String,
      required: Boolean
    }],
    relationships: [{
      type: String,
      targetId: String,
      targetType: String,
      metadata: mongoose.Schema.Types.Mixed
    }]
  }
}, {
  timestamps: true,
  collection: 'reports',
  strict: true,
  versionKey: '__v'
});

// ==================== Indexes ====================
reportSchema.index({ 'reportReference.organizationId': 1, 'configuration.type': 1 });
reportSchema.index({ 'configuration.category.primary': 1, 'metadata.status': 1 });
reportSchema.index({ 'scheduling.schedule.nextRun': 1 });
reportSchema.index({ 'generation.status.current': 1 });
reportSchema.index({ 'configuration.name': 'text', 'configuration.description': 'text' });
reportSchema.index({ 'metadata.tags': 1 });
reportSchema.index({ 'analytics.usage.totalGenerations': -1 });

// ==================== Virtual Properties ====================
reportSchema.virtual('isScheduled').get(function() {
  return this.scheduling.enabled && this.scheduling.schedule.type === 'RECURRING';
});

reportSchema.virtual('isActive').get(function() {
  return this.metadata.status === 'ACTIVE' && !this.metadata.lifecycle.expiresAt ||
    this.metadata.lifecycle.expiresAt > new Date();
});

reportSchema.virtual('nextScheduledRun').get(function() {
  return this.scheduling.schedule.nextRun;
});

reportSchema.virtual('generationProgress').get(function() {
  return this.generation.status.progress.percentage || 0;
});

// ==================== Instance Methods ====================

/**
 * Generate report
 * @async
 * @param {Object} options - Generation options
 * @returns {Promise<Object>} Generation result
 */
reportSchema.methods.generateReport = async function(options = {}) {
  try {
    const startTime = Date.now();
    
    this.generation.status.current = 'GENERATING';
    this.generation.status.progress = {
      percentage: 0,
      currentStep: 'Initializing',
      totalSteps: 5,
      message: 'Starting report generation'
    };
    
    await this.save();
    
    // Simulate generation steps
    const steps = [
      { name: 'Fetching data', percentage: 20 },
      { name: 'Processing data', percentage: 40 },
      { name: 'Applying transformations', percentage: 60 },
      { name: 'Rendering report', percentage: 80 },
      { name: 'Finalizing', percentage: 100 }
    ];
    
    for (const step of steps) {
      this.generation.status.progress.currentStep = step.name;
      this.generation.status.progress.percentage = step.percentage;
      await this.save();
      
      // Actual generation logic would go here
    }
    
    this.generation.status.current = 'COMPLETED';
    this.generation.status.lastGenerated = new Date();
    this.generation.status.generatedBy = options.userId;
    this.generation.status.duration = Date.now() - startTime;
    
    this.generation.output = {
      fileId: `FILE-${Date.now()}-${cryptoHelper.generateRandomString(6)}`,
      fileName: `${this.configuration.name}_${Date.now()}.${this.configuration.format.output.toLowerCase()}`,
      fileSize: Math.floor(Math.random() * 10000000),
      mimeType: this.#getMimeType(this.configuration.format.output),
      url: `${process.env.REPORT_STORAGE_URL}/${this.reportId}`,
      expiresAt: dateHelper.addDays(new Date(), 30)
    };
    
    await this.save();
    
    logger.info(`Report ${this.reportId} generated successfully`);
    return {
      success: true,
      output: this.generation.output,
      duration: this.generation.status.duration
    };
    
  } catch (error) {
    this.generation.status.current = 'FAILED';
    this.generation.logs.push({
      timestamp: new Date(),
      level: 'ERROR',
      message: error.message,
      details: error.stack
    });
    
    await this.save();
    
    logger.error(`Failed to generate report ${this.reportId}:`, error);
    throw error;
  }
};

/**
 * Schedule report
 * @async
 * @param {Object} scheduleOptions - Scheduling options
 * @returns {Promise<Object>} Scheduling result
 */
reportSchema.methods.scheduleReport = async function(scheduleOptions) {
  try {
    this.scheduling.enabled = true;
    this.scheduling.schedule = {
      type: scheduleOptions.type || 'RECURRING',
      frequency: scheduleOptions.frequency,
      cron: scheduleOptions.cron,
      timezone: scheduleOptions.timezone || 'UTC',
      startDate: scheduleOptions.startDate || new Date(),
      endDate: scheduleOptions.endDate,
      nextRun: this.#calculateNextRun(scheduleOptions),
      businessDaysOnly: scheduleOptions.businessDaysOnly
    };
    
    this.scheduling.delivery = scheduleOptions.delivery;
    
    await this.save();
    
    logger.info(`Report ${this.reportId} scheduled`);
    return { success: true, nextRun: this.scheduling.schedule.nextRun };
    
  } catch (error) {
    logger.error(`Failed to schedule report:`, error);
    throw error;
  }
};

/**
 * Clone report
 * @async
 * @param {Object} cloneOptions - Clone options
 * @returns {Promise<Object>} Cloned report
 */
reportSchema.methods.cloneReport = async function(cloneOptions = {}) {
  try {
    const clonedData = this.toObject();
    
    delete clonedData._id;
    delete clonedData.reportId;
    delete clonedData.createdAt;
    delete clonedData.updatedAt;
    
    clonedData.reportId = `RPT-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    clonedData.configuration.name = cloneOptions.name || `${clonedData.configuration.name} (Copy)`;
    clonedData.reportReference.parentReportId = this.reportId;
    
    if (cloneOptions.organizationId) {
      clonedData.reportReference.organizationId = cloneOptions.organizationId;
    }
    
    clonedData.analytics.usage.totalGenerations = 0;
    clonedData.analytics.usage.totalViews = 0;
    clonedData.metadata.status = 'DRAFT';
    clonedData.scheduling.enabled = false;
    
    const Report = this.constructor;
    const clonedReport = new Report(clonedData);
    
    await clonedReport.save();
    
    logger.info(`Report ${this.reportId} cloned to ${clonedReport.reportId}`);
    return clonedReport;
    
  } catch (error) {
    logger.error(`Failed to clone report:`, error);
    throw error;
  }
};

/**
 * Add data source
 * @async
 * @param {Object} dataSource - Data source configuration
 * @returns {Promise<Object>} Added data source
 */
reportSchema.methods.addDataSource = async function(dataSource) {
  try {
    const newDataSource = {
      sourceId: `DS-${Date.now()}-${cryptoHelper.generateRandomString(6)}`,
      name: dataSource.name,
      type: dataSource.type,
      connection: dataSource.connection,
      query: dataSource.query,
      transformation: dataSource.transformation,
      cache: dataSource.cache || { enabled: true, ttl: 3600 }
    };
    
    this.dataConfiguration.dataSources.push(newDataSource);
    await this.save();
    
    logger.info(`Data source ${newDataSource.sourceId} added to report ${this.reportId}`);
    return newDataSource;
    
  } catch (error) {
    logger.error(`Failed to add data source:`, error);
    throw error;
  }
};

/**
 * Execute report
 * @async
 * @param {Object} executionOptions - Execution options
 * @returns {Promise<Object>} Execution result
 */
reportSchema.methods.executeReport = async function(executionOptions = {}) {
  try {
    const executionId = `EXEC-${Date.now()}-${cryptoHelper.generateRandomString(6)}`;
    
    const execution = {
      executionId,
      scheduledAt: executionOptions.scheduledAt || new Date(),
      startedAt: new Date(),
      status: 'RUNNING'
    };
    
    this.scheduling.history.push(execution);
    await this.save();
    
    // Generate the report
    const result = await this.generateReport(executionOptions);
    
    // Update execution status
    const historyEntry = this.scheduling.history.find(h => h.executionId === executionId);
    if (historyEntry) {
      historyEntry.completedAt = new Date();
      historyEntry.status = result.success ? 'SUCCESS' : 'FAILED';
    }
    
    // Handle delivery
    if (result.success && this.scheduling.delivery.method.length > 0) {
      await this.#deliverReport(result.output, executionOptions);
    }
    
    await this.save();
    
    return { success: true, executionId, result };
    
  } catch (error) {
    logger.error(`Failed to execute report:`, error);
    throw error;
  }
};

/**
 * Archive report
 * @async
 * @param {Object} archiveOptions - Archive options
 * @returns {Promise<Object>} Archive result
 */
reportSchema.methods.archiveReport = async function(archiveOptions = {}) {
  try {
    this.metadata.status = 'ARCHIVED';
    this.metadata.lifecycle.archivedAt = new Date();
    this.metadata.lifecycle.archivedBy = archiveOptions.archivedBy;
    
    if (archiveOptions.reason) {
      this.metadata.customFields = this.metadata.customFields || {};
      this.metadata.customFields.archiveReason = archiveOptions.reason;
    }
    
    await this.save();
    
    logger.info(`Report ${this.reportId} archived`);
    return { success: true, archivedAt: this.metadata.lifecycle.archivedAt };
    
  } catch (error) {
    logger.error(`Failed to archive report:`, error);
    throw error;
  }
};

/**
 * Validate report configuration
 * @returns {Object} Validation result
 */
reportSchema.methods.validateConfiguration = function() {
  const errors = [];
  const warnings = [];
  
  // Validate data sources
  if (!this.dataConfiguration.dataSources || this.dataConfiguration.dataSources.length === 0) {
    errors.push('No data sources configured');
  }
  
  // Validate sections
  if (!this.structure.sections || this.structure.sections.length === 0) {
    errors.push('No report sections defined');
  }
  
  // Validate scheduling
  if (this.scheduling.enabled && !this.scheduling.schedule.cron && !this.scheduling.schedule.frequency) {
    errors.push('Schedule frequency not defined');
  }
  
  // Validate delivery
  if (this.scheduling.enabled && (!this.scheduling.delivery.recipients || this.scheduling.delivery.recipients.length === 0)) {
    warnings.push('No recipients configured for scheduled delivery');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
};

// ==================== Static Methods ====================

/**
 * Find reports by organization
 * @static
 * @async
 * @param {String} organizationId - Organization ID
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Reports
 */
reportSchema.statics.findByOrganization = async function(organizationId, options = {}) {
  const query = { 'reportReference.organizationId': organizationId };
  
  if (options.type) {
    query['configuration.type'] = options.type;
  }
  
  if (options.status) {
    query['metadata.status'] = options.status;
  }
  
  if (options.category) {
    query['configuration.category.primary'] = options.category;
  }
  
  return this.find(query)
    .sort(options.sort || { 'analytics.usage.totalGenerations': -1 })
    .limit(options.limit || 100);
};

/**
 * Find scheduled reports
 * @static
 * @async
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Scheduled reports
 */
reportSchema.statics.findScheduledReports = async function(options = {}) {
  const query = {
    'scheduling.enabled': true,
    'metadata.status': 'ACTIVE'
  };
  
  if (options.dueWithin) {
    const deadline = new Date(Date.now() + options.dueWithin);
    query['scheduling.schedule.nextRun'] = { $lte: deadline };
  }
  
  return this.find(query)
    .sort({ 'scheduling.schedule.nextRun': 1 })
    .limit(options.limit || 50);
};

/**
 * Find report templates
 * @static
 * @async
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Report templates
 */
reportSchema.statics.findTemplates = async function(options = {}) {
  const query = {
    'metadata.flags.isTemplate': true,
    'metadata.status': { $ne: 'ARCHIVED' }
  };
  
  if (options.type) {
    query['configuration.type'] = options.type;
  }
  
  if (options.category) {
    query['configuration.category.primary'] = options.category;
  }
  
  return this.find(query).sort({ 'configuration.name': 1 });
};

/**
 * Get report statistics
 * @static
 * @async
 * @param {Object} filters - Filter criteria
 * @returns {Promise<Object>} Report statistics
 */
reportSchema.statics.getReportStatistics = async function(filters = {}) {
  const matchStage = {};
  
  if (filters.organizationId) {
    matchStage['reportReference.organizationId'] = filters.organizationId;
  }
  
  if (filters.dateRange) {
    matchStage.createdAt = {
      $gte: filters.dateRange.start,
      $lte: filters.dateRange.end
    };
  }
  
  const stats = await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        active: {
          $sum: { $cond: [{ $eq: ['$metadata.status', 'ACTIVE'] }, 1, 0] }
        },
        scheduled: {
          $sum: { $cond: ['$scheduling.enabled', 1, 0] }
        },
        totalGenerations: { $sum: '$analytics.usage.totalGenerations' },
        avgGenerationTime: { $avg: '$performance.metrics.generationTime' },
        totalViews: { $sum: '$analytics.usage.totalViews' }
      }
    }
  ]);
  
  return stats[0] || {
    total: 0,
    active: 0,
    scheduled: 0,
    totalGenerations: 0,
    avgGenerationTime: 0,
    totalViews: 0
  };
};

/**
 * Find reports with errors
 * @static
 * @async
 * @param {Object} criteria - Error criteria
 * @returns {Promise<Array>} Reports with errors
 */
reportSchema.statics.findWithErrors = async function(criteria = {}) {
  const query = {
    $or: [
      { 'generation.status.current': 'FAILED' },
      { 'performance.errors': { $exists: true, $ne: [] } }
    ]
  };
  
  if (criteria.severity) {
    query['performance.errors.severity'] = criteria.severity;
  }
  
  if (criteria.unresolved) {
    query['performance.errors.resolved'] = false;
  }
  
  return this.find(query)
    .sort({ updatedAt: -1 })
    .limit(criteria.limit || 50);
};

// ==================== Private Helper Methods ====================

/**
 * Get MIME type for output format
 * @private
 * @param {String} format - Output format
 * @returns {String} MIME type
 */
reportSchema.methods.#getMimeType = function(format) {
  const mimeTypes = {
    PDF: 'application/pdf',
    EXCEL: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    CSV: 'text/csv',
    HTML: 'text/html',
    JSON: 'application/json',
    XML: 'application/xml',
    POWERPOINT: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    WORD: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  };
  
  return mimeTypes[format] || 'application/octet-stream';
};

/**
 * Calculate next run time
 * @private
 * @param {Object} scheduleOptions - Schedule options
 * @returns {Date} Next run time
 */
reportSchema.methods.#calculateNextRun = function(scheduleOptions) {
  const now = new Date();
  
  switch (scheduleOptions.frequency) {
    case 'HOURLY':
      return dateHelper.addHours(now, 1);
    case 'DAILY':
      return dateHelper.addDays(now, 1);
    case 'WEEKLY':
      return dateHelper.addDays(now, 7);
    case 'MONTHLY':
      return dateHelper.addMonths(now, 1);
    case 'QUARTERLY':
      return dateHelper.addMonths(now, 3);
    case 'YEARLY':
      return dateHelper.addYears(now, 1);
    default:
      return dateHelper.addDays(now, 1);
  }
};

/**
 * Deliver report
 * @private
 * @async
 * @param {Object} output - Report output
 * @param {Object} options - Delivery options
 * @returns {Promise<Object>} Delivery result
 */
reportSchema.methods.#deliverReport = async function(output, options) {
  const emailService = new EmailService();
  const notificationService = new NotificationService();
  
  for (const recipient of this.scheduling.delivery.recipients) {
    try {
      if (recipient.type === 'EMAIL' || recipient.email) {
        await emailService.sendEmail({
          to: recipient.email,
          subject: this.scheduling.delivery.notification.subject || `Report: ${this.configuration.name}`,
          body: this.scheduling.delivery.notification.body,
          attachments: [{
            filename: output.fileName,
            path: output.url
          }]
        });
      }
    } catch (error) {
      logger.error(`Failed to deliver report to ${recipient.email}:`, error);
    }
  }
  
  return { success: true };
};

// ==================== Hooks ====================
reportSchema.pre('save', async function(next) {
  if (this.isModified('scheduling.schedule')) {
    this.scheduling.schedule.nextRun = this.#calculateNextRun(this.scheduling.schedule);
  }
  
  if (this.isModified('analytics.feedback.ratings')) {
    const ratings = this.analytics.feedback.ratings.map(r => r.rating);
    this.analytics.feedback.averageRating = ratings.length > 0 ?
      ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
  }
  
  next();
});

reportSchema.post('save', async function(doc) {
  if (doc.generation.status.current === 'COMPLETED') {
    doc.analytics.usage.totalGenerations++;
    await doc.save();
  }
});

// ==================== Model Export ====================
const Report = mongoose.model('Report', reportSchema);

module.exports = Report;