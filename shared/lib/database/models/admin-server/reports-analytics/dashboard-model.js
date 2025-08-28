'use strict';

/**
 * @fileoverview Enterprise dashboard model for comprehensive business intelligence visualization
 * @module servers/admin-server/modules/reports-analytics/models/dashboard-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/security/encryption/encryption-service
 * @requires module:shared/lib/utils/validators/common-validators
 * @requires module:shared/lib/utils/helpers/string-helper
 * @requires module:shared/lib/utils/helpers/date-helper
 * @requires module:shared/lib/utils/helpers/crypto-helper
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/services/analytics-service
 */

const mongoose = require('mongoose');
const BaseModel = require('../../base-model');
const logger = require('../../../../utils/logger');
const { AppError } = require('../../../../utils/app-error');
const EncryptionService = require('../../../../security/encryption/encryption-service');
const CommonValidator = require('../../../../utils/validators/common-validators');
const stringHelper = require('../../../../utils/helpers/string-helper');
const dateHelper = require('../../../../utils/helpers/date-helper');
const cryptoHelper = require('../../../../utils/helpers/crypto-helper');
const CacheService = require('../../../../services/cache-service');
const AnalyticsService = require('../../../../services/analytics-service');

/**
 * @class DashboardSchema
 * @description Comprehensive dashboard schema for enterprise business intelligence visualization
 * @extends mongoose.Schema
 */
const dashboardSchemaDefinition = {
  // ==================== Core Dashboard Identification ====================
  dashboardId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    default: function() {
      return `DASH-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    },
    description: 'Unique identifier for dashboard'
  },

  dashboardReference: {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
      description: 'Reference to organization owning the dashboard'
    },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      sparse: true,
      description: 'Reference to specific department'
    },
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      sparse: true,
      description: 'Reference to specific team'
    },
    templateId: {
      type: String,
      sparse: true,
      description: 'Reference to dashboard template used'
    },
    parentDashboardId: {
      type: String,
      sparse: true,
      description: 'Reference to parent dashboard for hierarchical structures'
    },
    clonedFromId: {
      type: String,
      sparse: true,
      description: 'Reference to original dashboard if cloned'
    }
  },

  // ==================== Dashboard Configuration ====================
  configuration: {
    name: {
      type: String,
      required: true,
      index: true,
      maxlength: 200,
      description: 'Dashboard display name'
    },
    description: {
      type: String,
      maxlength: 1000,
      description: 'Detailed dashboard description'
    },
    type: {
      type: String,
      enum: ['EXECUTIVE', 'OPERATIONAL', 'FINANCIAL', 'ANALYTICAL', 'PERFORMANCE', 'CUSTOM', 'STRATEGIC', 'TACTICAL'],
      required: true,
      index: true,
      default: 'OPERATIONAL'
    },
    category: {
      primary: {
        type: String,
        enum: ['BUSINESS', 'TECHNICAL', 'SALES', 'MARKETING', 'SUPPORT', 'HR', 'FINANCE', 'OPERATIONS', 'COMPLIANCE'],
        required: true,
        index: true
      },
      secondary: String,
      tags: [String]
    },
    visibility: {
      scope: {
        type: String,
        enum: ['PRIVATE', 'TEAM', 'DEPARTMENT', 'ORGANIZATION', 'PUBLIC', 'RESTRICTED'],
        default: 'PRIVATE',
        index: true
      },
      sharedWith: [{
        entityType: {
          type: String,
          enum: ['USER', 'TEAM', 'DEPARTMENT', 'ROLE']
        },
        entityId: mongoose.Schema.Types.ObjectId,
        permissions: {
          view: { type: Boolean, default: true },
          edit: { type: Boolean, default: false },
          share: { type: Boolean, default: false },
          delete: { type: Boolean, default: false }
        },
        sharedAt: Date,
        sharedBy: mongoose.Schema.Types.ObjectId
      }],
      publicUrl: String,
      requiresAuthentication: {
        type: Boolean,
        default: true
      }
    },
    refreshSettings: {
      autoRefresh: {
        type: Boolean,
        default: true
      },
      refreshInterval: {
        value: {
          type: Number,
          default: 300
        },
        unit: {
          type: String,
          enum: ['SECONDS', 'MINUTES', 'HOURS'],
          default: 'SECONDS'
        }
      },
      lastRefreshed: Date,
      nextRefreshScheduled: Date
    },
    timeRange: {
      type: {
        type: String,
        enum: ['FIXED', 'RELATIVE', 'ROLLING', 'CUSTOM'],
        default: 'RELATIVE'
      },
      relative: {
        value: Number,
        unit: {
          type: String,
          enum: ['MINUTES', 'HOURS', 'DAYS', 'WEEKS', 'MONTHS', 'QUARTERS', 'YEARS']
        },
        direction: {
          type: String,
          enum: ['PAST', 'FUTURE', 'BOTH']
        }
      },
      fixed: {
        startDate: Date,
        endDate: Date
      },
      timezone: {
        type: String,
        default: 'UTC'
      }
    }
  },

  // ==================== Layout & Design ====================
  layout: {
    template: {
      type: String,
      enum: ['GRID', 'FREEFORM', 'RESPONSIVE', 'FIXED', 'FLOW', 'MASONRY', 'TABS', 'CAROUSEL'],
      default: 'GRID'
    },
    dimensions: {
      width: {
        type: Number,
        default: 1920
      },
      height: {
        type: Number,
        default: 1080
      },
      columns: {
        type: Number,
        default: 12
      },
      rows: {
        type: Number,
        default: 8
      },
      gutterSize: {
        type: Number,
        default: 10
      }
    },
    theme: {
      name: {
        type: String,
        default: 'default'
      },
      mode: {
        type: String,
        enum: ['LIGHT', 'DARK', 'AUTO'],
        default: 'LIGHT'
      },
      primaryColor: String,
      secondaryColor: String,
      backgroundColor: String,
      fontFamily: String,
      fontSize: String,
      customCSS: String
    },
    responsive: {
      enabled: {
        type: Boolean,
        default: true
      },
      breakpoints: [{
        name: String,
        minWidth: Number,
        maxWidth: Number,
        columns: Number,
        layout: mongoose.Schema.Types.Mixed
      }],
      mobileOptimized: {
        type: Boolean,
        default: false
      }
    },
    branding: {
      showLogo: {
        type: Boolean,
        default: true
      },
      logoUrl: String,
      showTitle: {
        type: Boolean,
        default: true
      },
      customHeader: String,
      customFooter: String
    }
  },

  // ==================== Widget Management ====================
  widgets: [{
    widgetId: {
      type: String,
      required: true,
      unique: true,
      default: function() {
        return `WGT-${Date.now()}-${cryptoHelper.generateRandomString(6)}`;
      }
    },
    configuration: {
      name: String,
      type: {
        type: String,
        enum: ['CHART', 'TABLE', 'METRIC', 'MAP', 'TEXT', 'IMAGE', 'FILTER', 'IFRAME', 'CUSTOM'],
        required: true
      },
      subType: String,
      title: String,
      description: String,
      icon: String
    },
    dataSource: {
      type: {
        type: String,
        enum: ['QUERY', 'API', 'STATIC', 'REALTIME', 'CALCULATED', 'AGGREGATED', 'EXTERNAL']
      },
      query: {
        database: String,
        collection: String,
        pipeline: mongoose.Schema.Types.Mixed,
        sql: String,
        parameters: mongoose.Schema.Types.Mixed
      },
      api: {
        endpoint: String,
        method: String,
        headers: mongoose.Schema.Types.Mixed,
        body: mongoose.Schema.Types.Mixed,
        authentication: mongoose.Schema.Types.Mixed
      },
      realtime: {
        channel: String,
        event: String,
        filters: mongoose.Schema.Types.Mixed
      },
      cache: {
        enabled: Boolean,
        ttl: Number,
        key: String
      },
      refreshInterval: Number
    },
    visualization: {
      chartType: {
        type: String,
        enum: ['LINE', 'BAR', 'PIE', 'DONUT', 'AREA', 'SCATTER', 'BUBBLE', 'HEATMAP', 'TREEMAP', 'SANKEY', 'GAUGE', 'RADAR', 'FUNNEL', 'WATERFALL']
      },
      chartOptions: mongoose.Schema.Types.Mixed,
      colors: [String],
      legend: {
        show: Boolean,
        position: String,
        orientation: String
      },
      axes: {
        x: mongoose.Schema.Types.Mixed,
        y: mongoose.Schema.Types.Mixed,
        secondary: mongoose.Schema.Types.Mixed
      },
      annotations: [mongoose.Schema.Types.Mixed],
      thresholds: [{
        value: Number,
        color: String,
        label: String,
        type: String
      }]
    },
    layout: {
      position: {
        x: Number,
        y: Number,
        z: Number
      },
      size: {
        width: Number,
        height: Number,
        minWidth: Number,
        minHeight: Number,
        maxWidth: Number,
        maxHeight: Number
      },
      resizable: {
        type: Boolean,
        default: true
      },
      draggable: {
        type: Boolean,
        default: true
      },
      locked: {
        type: Boolean,
        default: false
      }
    },
    interactions: {
      clickable: Boolean,
      hoverable: Boolean,
      drilldown: {
        enabled: Boolean,
        targetDashboardId: String,
        targetWidgetId: String,
        parameters: mongoose.Schema.Types.Mixed
      },
      filters: [{
        field: String,
        operator: String,
        value: mongoose.Schema.Types.Mixed
      }],
      crossFilter: {
        enabled: Boolean,
        targetWidgets: [String]
      },
      export: {
        enabled: Boolean,
        formats: [String]
      }
    },
    performance: {
      loadTime: Number,
      lastUpdated: Date,
      updateFrequency: Number,
      dataPoints: Number,
      renderTime: Number
    },
    metadata: {
      version: Number,
      createdBy: mongoose.Schema.Types.ObjectId,
      createdAt: Date,
      modifiedBy: mongoose.Schema.Types.ObjectId,
      modifiedAt: Date,
      tags: [String]
    }
  }],

  // ==================== Data Management ====================
  dataManagement: {
    dataSources: [{
      sourceId: String,
      name: String,
      type: {
        type: String,
        enum: ['MONGODB', 'SQL', 'ELASTICSEARCH', 'API', 'CSV', 'EXCEL', 'BIGQUERY', 'REDSHIFT', 'SNOWFLAKE']
      },
      connection: {
        host: String,
        port: Number,
        database: String,
        encrypted: Boolean
      },
      authentication: {
        type: String,
        encrypted: mongoose.Schema.Types.Mixed
      },
      status: {
        connected: Boolean,
        lastChecked: Date,
        lastError: String
      },
      permissions: {
        read: Boolean,
        write: Boolean
      }
    }],
    datasets: [{
      datasetId: String,
      name: String,
      sourceId: String,
      query: mongoose.Schema.Types.Mixed,
      fields: [{
        name: String,
        type: String,
        format: String,
        aggregation: String
      }],
      refreshSchedule: {
        enabled: Boolean,
        cron: String,
        lastRefresh: Date,
        nextRefresh: Date
      },
      cache: {
        enabled: Boolean,
        ttl: Number,
        size: Number
      }
    }],
    calculations: [{
      calculationId: String,
      name: String,
      formula: String,
      dependencies: [String],
      result: mongoose.Schema.Types.Mixed,
      lastCalculated: Date
    }],
    filters: {
      global: [{
        filterId: String,
        name: String,
        field: String,
        operator: String,
        value: mongoose.Schema.Types.Mixed,
        applied: Boolean
      }],
      presets: [{
        presetId: String,
        name: String,
        filters: mongoose.Schema.Types.Mixed,
        isDefault: Boolean
      }]
    }
  },

  // ==================== Performance & Metrics ====================
  performanceMetrics: {
    loadMetrics: {
      initialLoadTime: Number,
      averageLoadTime: Number,
      p95LoadTime: Number,
      p99LoadTime: Number,
      slowestWidget: String,
      fastestWidget: String
    },
    dataMetrics: {
      totalDataPoints: Number,
      totalQueries: Number,
      averageQueryTime: Number,
      cacheHitRate: Number,
      dataFreshness: Date
    },
    usageMetrics: {
      totalViews: {
        type: Number,
        default: 0
      },
      uniqueViewers: {
        type: Number,
        default: 0
      },
      averageViewDuration: Number,
      bounceRate: Number,
      interactionRate: Number,
      lastViewed: Date,
      viewHistory: [{
        viewedBy: mongoose.Schema.Types.ObjectId,
        viewedAt: Date,
        duration: Number,
        interactions: Number
      }]
    },
    errorMetrics: {
      totalErrors: Number,
      errorRate: Number,
      lastError: {
        message: String,
        timestamp: Date,
        widget: String
      },
      errorLog: [{
        errorId: String,
        widget: String,
        message: String,
        stack: String,
        timestamp: Date,
        resolved: Boolean
      }]
    },
    optimizationSuggestions: [{
      suggestionId: String,
      type: String,
      priority: String,
      description: String,
      impact: String,
      implemented: Boolean
    }]
  },

  // ==================== Scheduling & Automation ====================
  scheduling: {
    reports: [{
      reportId: String,
      name: String,
      schedule: {
        enabled: Boolean,
        cron: String,
        timezone: String,
        nextRun: Date,
        lastRun: Date
      },
      delivery: {
        method: {
          type: String,
          enum: ['EMAIL', 'SLACK', 'WEBHOOK', 'FTP', 'S3', 'API']
        },
        recipients: [String],
        format: {
          type: String,
          enum: ['PDF', 'EXCEL', 'CSV', 'PNG', 'HTML', 'JSON']
        },
        template: String,
        includeData: Boolean
      },
      filters: mongoose.Schema.Types.Mixed,
      status: {
        lastDelivery: Date,
        success: Boolean,
        errorMessage: String,
        retryCount: Number
      }
    }],
    alerts: [{
      alertId: String,
      name: String,
      condition: {
        metric: String,
        operator: String,
        threshold: mongoose.Schema.Types.Mixed,
        duration: Number
      },
      notifications: {
        channels: [String],
        recipients: [String],
        message: String,
        severity: String
      },
      status: {
        active: Boolean,
        triggered: Boolean,
        lastTriggered: Date,
        triggerCount: Number
      }
    }],
    snapshots: [{
      snapshotId: String,
      name: String,
      timestamp: Date,
      data: mongoose.Schema.Types.Mixed,
      widgets: mongoose.Schema.Types.Mixed,
      filters: mongoose.Schema.Types.Mixed,
      createdBy: mongoose.Schema.Types.ObjectId,
      expiresAt: Date
    }]
  },

  // ==================== Collaboration Features ====================
  collaboration: {
    comments: [{
      commentId: String,
      widgetId: String,
      content: String,
      author: mongoose.Schema.Types.ObjectId,
      timestamp: Date,
      edited: Boolean,
      editedAt: Date,
      replies: [{
        replyId: String,
        content: String,
        author: mongoose.Schema.Types.ObjectId,
        timestamp: Date
      }],
      resolved: Boolean,
      resolvedBy: mongoose.Schema.Types.ObjectId,
      resolvedAt: Date
    }],
    annotations: [{
      annotationId: String,
      widgetId: String,
      type: {
        type: String,
        enum: ['NOTE', 'HIGHLIGHT', 'QUESTION', 'ISSUE', 'INSIGHT']
      },
      content: String,
      position: mongoose.Schema.Types.Mixed,
      author: mongoose.Schema.Types.ObjectId,
      timestamp: Date,
      visibility: String
    }],
    sharing: {
      publicLink: {
        enabled: Boolean,
        url: String,
        password: String,
        expiresAt: Date,
        accessCount: Number
      },
      embedCode: String,
      socialSharing: {
        enabled: Boolean,
        platforms: [String]
      }
    },
    versions: [{
      versionId: String,
      versionNumber: String,
      description: String,
      changes: [String],
      createdBy: mongoose.Schema.Types.ObjectId,
      createdAt: Date,
      published: Boolean,
      archived: Boolean
    }]
  },

  // ==================== Security & Compliance ====================
  security: {
    accessControl: {
      requiresAuthentication: {
        type: Boolean,
        default: true
      },
      requiresMFA: {
        type: Boolean,
        default: false
      },
      allowedRoles: [String],
      deniedRoles: [String],
      ipWhitelist: [String],
      ipBlacklist: [String]
    },
    dataPrivacy: {
      containsPII: Boolean,
      piiFields: [String],
      encryptionEnabled: Boolean,
      redactionRules: [{
        field: String,
        rule: String,
        appliedTo: [String]
      }],
      retentionPolicy: {
        enabled: Boolean,
        duration: Number,
        unit: String
      }
    },
    audit: {
      enabled: {
        type: Boolean,
        default: true
      },
      logLevel: {
        type: String,
        enum: ['MINIMAL', 'STANDARD', 'DETAILED', 'VERBOSE'],
        default: 'STANDARD'
      },
      events: [{
        eventId: String,
        eventType: String,
        actor: mongoose.Schema.Types.ObjectId,
        timestamp: Date,
        details: mongoose.Schema.Types.Mixed,
        ipAddress: String,
        userAgent: String
      }]
    },
    compliance: {
      standards: [String],
      certifications: [String],
      lastAudit: Date,
      nextAudit: Date,
      complianceScore: Number,
      issues: [{
        issueId: String,
        description: String,
        severity: String,
        identified: Date,
        resolved: Boolean
      }]
    }
  },

  // ==================== Analytics & Insights ====================
  analytics: {
    insights: [{
      insightId: String,
      type: {
        type: String,
        enum: ['TREND', 'ANOMALY', 'CORRELATION', 'PREDICTION', 'RECOMMENDATION']
      },
      title: String,
      description: String,
      confidence: Number,
      impact: String,
      data: mongoose.Schema.Types.Mixed,
      generatedAt: Date,
      acknowledged: Boolean,
      actionTaken: String
    }],
    predictions: [{
      predictionId: String,
      metric: String,
      timeframe: String,
      value: mongoose.Schema.Types.Mixed,
      confidence: Number,
      method: String,
      generatedAt: Date,
      accuracy: Number
    }],
    recommendations: [{
      recommendationId: String,
      category: String,
      title: String,
      description: String,
      priority: String,
      expectedImpact: String,
      implemented: Boolean,
      result: String
    }],
    benchmarks: [{
      benchmarkId: String,
      metric: String,
      value: Number,
      industry: String,
      percentile: Number,
      comparison: String,
      updatedAt: Date
    }]
  },

  // ==================== Metadata & Status ====================
  metadata: {
    version: {
      type: Number,
      default: 1
    },
    status: {
      type: String,
      enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED', 'DEPRECATED', 'MAINTENANCE'],
      default: 'DRAFT',
      index: true
    },
    publishedAt: Date,
    publishedBy: mongoose.Schema.Types.ObjectId,
    archivedAt: Date,
    archivedBy: mongoose.Schema.Types.ObjectId,
    deletedAt: Date,
    deletedBy: mongoose.Schema.Types.ObjectId,
    tags: [String],
    labels: [{
      name: String,
      value: String,
      color: String
    }],
    customFields: mongoose.Schema.Types.Mixed,
    flags: {
      isFeatured: Boolean,
      isTemplate: Boolean,
      isDefault: Boolean,
      requiresReview: Boolean,
      underMaintenance: Boolean
    },
    dependencies: [{
      type: {
        type: String,
        enum: ['DASHBOARD', 'DATASOURCE', 'REPORT', 'API']
      },
      id: String,
      name: String,
      required: Boolean
    }],
    exports: [{
      exportId: String,
      format: String,
      timestamp: Date,
      exportedBy: mongoose.Schema.Types.ObjectId,
      size: Number,
      url: String
    }]
  }
}

const dashboardSchema = BaseModel.createSchema(dashboardSchemaDefinition, {
  collection: 'dashboards',
  timestamps: true,
  strict: true,
  versionKey: '__v',
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
})

// ==================== Indexes ====================
dashboardSchema.index({ 'dashboardReference.organizationId': 1, 'configuration.type': 1 });
dashboardSchema.index({ 'configuration.visibility.scope': 1, 'metadata.status': 1 });
dashboardSchema.index({ 'configuration.category.primary': 1, 'configuration.type': 1 });
dashboardSchema.index({ 'performanceMetrics.usageMetrics.totalViews': -1 });
dashboardSchema.index({ 'configuration.name': 'text', 'configuration.description': 'text' });
dashboardSchema.index({ 'metadata.tags': 1 });
dashboardSchema.index({ 'widgets.widgetId': 1 });

// ==================== Virtual Properties ====================
dashboardSchema.virtual('isPublic').get(function() {
  return this.configuration.visibility.scope === 'PUBLIC';
});

dashboardSchema.virtual('isActive').get(function() {
  return this.metadata.status === 'PUBLISHED' && !this.metadata.flags.underMaintenance;
});

dashboardSchema.virtual('widgetCount').get(function() {
  return this.widgets ? this.widgets.length : 0;
});

dashboardSchema.virtual('lastModified').get(function() {
  return this.updatedAt || this.createdAt;
});

dashboardSchema.virtual('performanceScore').get(function() {
  const metrics = this.performanceMetrics;
  if (!metrics) return null;
  
  let score = 100;
  if (metrics.loadMetrics.averageLoadTime > 3000) score -= 20;
  if (metrics.dataMetrics.cacheHitRate < 0.7) score -= 15;
  if (metrics.errorMetrics.errorRate > 0.05) score -= 25;
  
  return Math.max(0, score);
});

// ==================== Instance Methods ====================

/**
 * Add widget to dashboard
 * @async
 * @param {Object} widgetData - Widget configuration
 * @returns {Promise<Object>} Added widget
 */
dashboardSchema.methods.addWidget = async function(widgetData) {
  try {
    const widget = {
      widgetId: `WGT-${Date.now()}-${cryptoHelper.generateRandomString(6)}`,
      configuration: widgetData.configuration,
      dataSource: widgetData.dataSource,
      visualization: widgetData.visualization,
      layout: widgetData.layout || {
        position: { x: 0, y: 0, z: 0 },
        size: { width: 4, height: 3 }
      },
      interactions: widgetData.interactions || {},
      metadata: {
        version: 1,
        createdBy: widgetData.createdBy,
        createdAt: new Date()
      }
    };
    
    this.widgets.push(widget);
    
    await this.save();
    
    logger.info(`Widget ${widget.widgetId} added to dashboard ${this.dashboardId}`);
    return widget;
    
  } catch (error) {
    logger.error(`Failed to add widget to dashboard ${this.dashboardId}:`, error);
    throw error;
  }
};

/**
 * Update widget configuration
 * @async
 * @param {String} widgetId - Widget identifier
 * @param {Object} updates - Widget updates
 * @returns {Promise<Object>} Updated widget
 */
dashboardSchema.methods.updateWidget = async function(widgetId, updates) {
  try {
    const widget = this.widgets.find(w => w.widgetId === widgetId);
    
    if (!widget) {
      throw new AppError('Widget not found', 404);
    }
    
    Object.assign(widget, updates);
    widget.metadata.modifiedAt = new Date();
    widget.metadata.version = (widget.metadata.version || 1) + 1;
    
    await this.save();
    
    logger.info(`Widget ${widgetId} updated in dashboard ${this.dashboardId}`);
    return widget;
    
  } catch (error) {
    logger.error(`Failed to update widget:`, error);
    throw error;
  }
};

/**
 * Remove widget from dashboard
 * @async
 * @param {String} widgetId - Widget identifier
 * @returns {Promise<Boolean>} Removal success
 */
dashboardSchema.methods.removeWidget = async function(widgetId) {
  try {
    const widgetIndex = this.widgets.findIndex(w => w.widgetId === widgetId);
    
    if (widgetIndex === -1) {
      throw new AppError('Widget not found', 404);
    }
    
    this.widgets.splice(widgetIndex, 1);
    await this.save();
    
    logger.info(`Widget ${widgetId} removed from dashboard ${this.dashboardId}`);
    return true;
    
  } catch (error) {
    logger.error(`Failed to remove widget:`, error);
    throw error;
  }
};

/**
 * Clone dashboard
 * @async
 * @param {Object} options - Clone options
 * @returns {Promise<Object>} Cloned dashboard
 */
dashboardSchema.methods.cloneDashboard = async function(options = {}) {
  try {
    const clonedData = this.toObject();
    
    delete clonedData._id;
    delete clonedData.dashboardId;
    delete clonedData.createdAt;
    delete clonedData.updatedAt;
    
    clonedData.dashboardId = `DASH-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    clonedData.configuration.name = options.name || `${clonedData.configuration.name} (Copy)`;
    clonedData.dashboardReference.clonedFromId = this.dashboardId;
    
    if (options.organizationId) {
      clonedData.dashboardReference.organizationId = options.organizationId;
    }
    
    clonedData.performanceMetrics.usageMetrics.totalViews = 0;
    clonedData.performanceMetrics.usageMetrics.uniqueViewers = 0;
    clonedData.metadata.status = 'DRAFT';
    
    const Dashboard = this.constructor;
    const clonedDashboard = new Dashboard(clonedData);
    
    await clonedDashboard.save();
    
    logger.info(`Dashboard ${this.dashboardId} cloned to ${clonedDashboard.dashboardId}`);
    return clonedDashboard;
    
  } catch (error) {
    logger.error(`Failed to clone dashboard:`, error);
    throw error;
  }
};

/**
 * Publish dashboard
 * @async
 * @param {Object} publishOptions - Publishing options
 * @returns {Promise<Object>} Publishing result
 */
dashboardSchema.methods.publishDashboard = async function(publishOptions = {}) {
  try {
    if (this.metadata.status === 'PUBLISHED') {
      throw new AppError('Dashboard is already published', 400);
    }
    
    this.metadata.status = 'PUBLISHED';
    this.metadata.publishedAt = new Date();
    this.metadata.publishedBy = publishOptions.publishedBy;
    
    if (publishOptions.makePublic) {
      this.configuration.visibility.scope = 'PUBLIC';
      
      if (publishOptions.generatePublicUrl) {
        this.configuration.visibility.publicUrl = 
          `${process.env.DASHBOARD_BASE_URL}/public/${this.dashboardId}`;
      }
    }
    
    await this.save();
    
    logger.info(`Dashboard ${this.dashboardId} published`);
    return { success: true, publicUrl: this.configuration.visibility.publicUrl };
    
  } catch (error) {
    logger.error(`Failed to publish dashboard:`, error);
    throw error;
  }
};

/**
 * Archive dashboard
 * @async
 * @param {Object} archiveOptions - Archive options
 * @returns {Promise<Object>} Archive result
 */
dashboardSchema.methods.archiveDashboard = async function(archiveOptions = {}) {
  try {
    this.metadata.status = 'ARCHIVED';
    this.metadata.archivedAt = new Date();
    this.metadata.archivedBy = archiveOptions.archivedBy;
    
    await this.save();
    
    logger.info(`Dashboard ${this.dashboardId} archived`);
    return { success: true, archivedAt: this.metadata.archivedAt };
    
  } catch (error) {
    logger.error(`Failed to archive dashboard:`, error);
    throw error;
  }
};

/**
 * Share dashboard with users or teams
 * @async
 * @param {Object} shareOptions - Sharing options
 * @returns {Promise<Object>} Sharing result
 */
dashboardSchema.methods.shareDashboard = async function(shareOptions) {
  try {
    const shareEntry = {
      entityType: shareOptions.entityType,
      entityId: shareOptions.entityId,
      permissions: shareOptions.permissions || {
        view: true,
        edit: false,
        share: false,
        delete: false
      },
      sharedAt: new Date(),
      sharedBy: shareOptions.sharedBy
    };
    
    this.configuration.visibility.sharedWith.push(shareEntry);
    
    await this.save();
    
    logger.info(`Dashboard ${this.dashboardId} shared with ${shareOptions.entityType} ${shareOptions.entityId}`);
    return { success: true, shareEntry };
    
  } catch (error) {
    logger.error(`Failed to share dashboard:`, error);
    throw error;
  }
};

/**
 * Generate dashboard snapshot
 * @async
 * @param {Object} snapshotOptions - Snapshot options
 * @returns {Promise<Object>} Snapshot data
 */
dashboardSchema.methods.generateSnapshot = async function(snapshotOptions = {}) {
  try {
    const snapshot = {
      snapshotId: `SNAP-${Date.now()}-${cryptoHelper.generateRandomString(6)}`,
      name: snapshotOptions.name || `Snapshot ${new Date().toISOString()}`,
      timestamp: new Date(),
      data: {
        configuration: this.configuration,
        widgets: this.widgets,
        layout: this.layout
      },
      filters: this.dataManagement.filters,
      createdBy: snapshotOptions.createdBy,
      expiresAt: snapshotOptions.expiresAt
    };
    
    this.scheduling.snapshots.push(snapshot);
    
    await this.save();
    
    logger.info(`Snapshot ${snapshot.snapshotId} created for dashboard ${this.dashboardId}`);
    return snapshot;
    
  } catch (error) {
    logger.error(`Failed to generate snapshot:`, error);
    throw error;
  }
};

/**
 * Calculate dashboard performance metrics
 * @returns {Object} Performance metrics
 */
dashboardSchema.methods.calculatePerformanceMetrics = function() {
  const widgets = this.widgets || [];
  const loadTimes = widgets.map(w => w.performance?.loadTime || 0).filter(t => t > 0);
  
  const metrics = {
    widgetCount: widgets.length,
    averageLoadTime: loadTimes.length > 0 ? 
      loadTimes.reduce((a, b) => a + b, 0) / loadTimes.length : 0,
    slowestWidget: null,
    fastestWidget: null,
    totalDataPoints: 0,
    errorRate: 0
  };
  
  if (widgets.length > 0) {
    const sortedByLoadTime = widgets
      .filter(w => w.performance?.loadTime)
      .sort((a, b) => a.performance.loadTime - b.performance.loadTime);
    
    if (sortedByLoadTime.length > 0) {
      metrics.fastestWidget = sortedByLoadTime[0].widgetId;
      metrics.slowestWidget = sortedByLoadTime[sortedByLoadTime.length - 1].widgetId;
    }
    
    metrics.totalDataPoints = widgets.reduce((sum, w) => 
      sum + (w.performance?.dataPoints || 0), 0);
  }
  
  const errors = this.performanceMetrics?.errorMetrics?.errorLog || [];
  const recentErrors = errors.filter(e => 
    new Date() - new Date(e.timestamp) < 24 * 60 * 60 * 1000
  );
  
  metrics.errorRate = widgets.length > 0 ? 
    recentErrors.length / widgets.length : 0;
  
  return metrics;
};

/**
 * Check user permissions for dashboard
 * @param {String} userId - User ID
 * @param {String} permission - Permission type
 * @returns {Boolean} Has permission
 */
dashboardSchema.methods.checkUserPermission = function(userId, permission) {
  const share = this.configuration.visibility.sharedWith.find(s => 
    s.entityType === 'USER' && s.entityId.toString() === userId.toString()
  );
  
  if (!share) return false;
  
  return share.permissions[permission] === true;
};

// ==================== Static Methods ====================

/**
 * Find dashboards by organization
 * @static
 * @async
 * @param {String} organizationId - Organization ID
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Dashboards
 */
dashboardSchema.statics.findByOrganization = async function(organizationId, options = {}) {
  const query = { 'dashboardReference.organizationId': organizationId };
  
  if (options.type) {
    query['configuration.type'] = options.type;
  }
  
  if (options.status) {
    query['metadata.status'] = options.status;
  }
  
  if (options.visibility) {
    query['configuration.visibility.scope'] = options.visibility;
  }
  
  return this.find(query)
    .sort(options.sort || { 'performanceMetrics.usageMetrics.totalViews': -1 })
    .limit(options.limit || 100);
};

/**
 * Find featured dashboards
 * @static
 * @async
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Featured dashboards
 */
dashboardSchema.statics.findFeaturedDashboards = async function(options = {}) {
  const query = {
    'metadata.flags.isFeatured': true,
    'metadata.status': 'PUBLISHED'
  };
  
  if (options.organizationId) {
    query['dashboardReference.organizationId'] = options.organizationId;
  }
  
  if (options.category) {
    query['configuration.category.primary'] = options.category;
  }
  
  return this.find(query)
    .sort({ 'performanceMetrics.usageMetrics.totalViews': -1 })
    .limit(options.limit || 10);
};

/**
 * Find templates
 * @static
 * @async
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Dashboard templates
 */
dashboardSchema.statics.findTemplates = async function(options = {}) {
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
 * Get dashboard statistics
 * @static
 * @async
 * @param {Object} filters - Filter criteria
 * @returns {Promise<Object>} Dashboard statistics
 */
dashboardSchema.statics.getDashboardStatistics = async function(filters = {}) {
  const matchStage = {};
  
  if (filters.organizationId) {
    matchStage['dashboardReference.organizationId'] = filters.organizationId;
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
        published: {
          $sum: { $cond: [{ $eq: ['$metadata.status', 'PUBLISHED'] }, 1, 0] }
        },
        archived: {
          $sum: { $cond: [{ $eq: ['$metadata.status', 'ARCHIVED'] }, 1, 0] }
        },
        totalViews: { $sum: '$performanceMetrics.usageMetrics.totalViews' },
        totalWidgets: { $sum: { $size: '$widgets' } },
        avgWidgetsPerDashboard: { $avg: { $size: '$widgets' } },
        avgLoadTime: { $avg: '$performanceMetrics.loadMetrics.averageLoadTime' }
      }
    }
  ]);
  
  return stats[0] || {
    total: 0,
    published: 0,
    archived: 0,
    totalViews: 0,
    totalWidgets: 0,
    avgWidgetsPerDashboard: 0,
    avgLoadTime: 0
  };
};

/**
 * Find dashboards needing optimization
 * @static
 * @async
 * @param {Object} criteria - Optimization criteria
 * @returns {Promise<Array>} Dashboards needing optimization
 */
dashboardSchema.statics.findNeedingOptimization = async function(criteria = {}) {
  const conditions = [];
  
  conditions.push({
    'performanceMetrics.loadMetrics.averageLoadTime': { $gt: criteria.loadTimeThreshold || 5000 }
  });
  
  conditions.push({
    'performanceMetrics.errorMetrics.errorRate': { $gt: criteria.errorRateThreshold || 0.1 }
  });
  
  conditions.push({
    'performanceMetrics.dataMetrics.cacheHitRate': { $lt: criteria.cacheHitThreshold || 0.5 }
  });
  
  return this.find({ $or: conditions })
    .sort({ 'performanceMetrics.loadMetrics.averageLoadTime': -1 })
    .limit(criteria.limit || 20);
};

// ==================== Hooks ====================
dashboardSchema.pre('save', async function(next) {
  if (this.isModified('widgets')) {
    this.performanceMetrics.dataMetrics.totalDataPoints = 
      this.widgets.reduce((sum, w) => sum + (w.performance?.dataPoints || 0), 0);
  }
  
  if (!this.isNew) {
    this.metadata.version++;
  }
  
  next();
});

dashboardSchema.post('save', async function(doc) {
  const cacheService = new CacheService();
  await cacheService.invalidate(`dashboard:${doc.dashboardId}`);
});

// ==================== Model Export ====================
const DashboardModel = mongoose.model('Dashboard', dashboardSchema);

module.exports = DashboardModel;