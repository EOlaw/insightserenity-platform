'use strict';

/**
 * @fileoverview Enterprise analytics model for comprehensive metrics and measurements
 * @module servers/admin-server/modules/reports-analytics/models/analytics-model
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

/**
 * @class AnalyticsSchema
 * @description Comprehensive analytics schema for enterprise metrics and measurements
 * @extends mongoose.Schema
 */
const analyticsSchemaDefinition = {
  // ==================== Core Analytics Identification ====================
  analyticsId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    default: function() {
      return `ANLY-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    },
    description: 'Unique identifier for analytics record'
  },

  analyticsReference: {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
      description: 'Reference to organization'
    },
    entityType: {
      type: String,
      enum: ['ORGANIZATION', 'DEPARTMENT', 'TEAM', 'USER', 'PROJECT', 'PRODUCT', 'SERVICE', 'CAMPAIGN', 'SYSTEM'],
      required: true,
      index: true
    },
    entityId: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
      index: true
    },
    parentAnalyticsId: {
      type: String,
      sparse: true,
      description: 'Reference to parent analytics for hierarchical analysis'
    },
    correlatedAnalytics: [{
      analyticsId: String,
      correlationType: {
        type: String,
        enum: ['DEPENDENT', 'RELATED', 'COMPARATIVE', 'BASELINE']
      },
      correlationStrength: Number
    }]
  },

  // ==================== Metrics Configuration ====================
  metricsConfiguration: {
    name: {
      type: String,
      required: true,
      index: true,
      maxlength: 200,
      description: 'Analytics configuration name'
    },
    description: {
      type: String,
      maxlength: 1000,
      description: 'Analytics configuration description'
    },
    category: {
      primary: {
        type: String,
        enum: ['BUSINESS', 'OPERATIONAL', 'FINANCIAL', 'CUSTOMER', 'PERFORMANCE', 'QUALITY', 'COMPLIANCE', 'SECURITY', 'CUSTOM'],
        required: true,
        index: true
      },
      secondary: String,
      tags: [String]
    },
    type: {
      type: String,
      enum: ['REAL_TIME', 'NEAR_REAL_TIME', 'BATCH', 'HISTORICAL', 'PREDICTIVE', 'DIAGNOSTIC', 'PRESCRIPTIVE'],
      default: 'BATCH',
      index: true
    },
    scope: {
      level: {
        type: String,
        enum: ['GLOBAL', 'REGIONAL', 'ORGANIZATIONAL', 'DEPARTMENTAL', 'TEAM', 'INDIVIDUAL'],
        default: 'ORGANIZATIONAL'
      },
      coverage: {
        startDate: Date,
        endDate: Date,
        ongoing: Boolean
      },
      granularity: {
        type: String,
        enum: ['SECOND', 'MINUTE', 'HOUR', 'DAY', 'WEEK', 'MONTH', 'QUARTER', 'YEAR'],
        default: 'DAY'
      }
    },
    metrics: [{
      metricId: String,
      name: String,
      type: {
        type: String,
        enum: ['COUNTER', 'GAUGE', 'HISTOGRAM', 'SUMMARY', 'RATE', 'PERCENTAGE', 'RATIO', 'SCORE']
      },
      unit: String,
      formula: String,
      dataType: String,
      aggregation: {
        type: String,
        enum: ['SUM', 'AVG', 'MIN', 'MAX', 'COUNT', 'MEDIAN', 'MODE', 'PERCENTILE', 'STDDEV']
      },
      targets: {
        min: Number,
        max: Number,
        optimal: Number,
        threshold: Number
      },
      importance: {
        type: String,
        enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'],
        default: 'MEDIUM'
      }
    }]
  },

  // ==================== Data Collection ====================
  dataCollection: {
    sources: [{
      sourceId: String,
      name: String,
      type: {
        type: String,
        enum: ['DATABASE', 'API', 'STREAM', 'LOG', 'FILE', 'SENSOR', 'MANUAL', 'CALCULATED']
      },
      endpoint: String,
      authentication: mongoose.Schema.Types.Mixed,
      schedule: {
        frequency: String,
        cron: String,
        timezone: String
      },
      reliability: {
        uptime: Number,
        errorRate: Number,
        lastSuccess: Date,
        lastFailure: Date
      }
    }],
    collectors: [{
      collectorId: String,
      name: String,
      type: String,
      status: {
        type: String,
        enum: ['ACTIVE', 'PAUSED', 'ERROR', 'MAINTENANCE']
      },
      configuration: mongoose.Schema.Types.Mixed,
      performance: {
        itemsProcessed: Number,
        processingTime: Number,
        errorCount: Number
      }
    }],
    dataPoints: [{
      timestamp: {
        type: Date,
        index: true
      },
      metricId: String,
      value: mongoose.Schema.Types.Mixed,
      dimensions: mongoose.Schema.Types.Mixed,
      quality: {
        score: Number,
        issues: [String]
      },
      source: String,
      processed: Boolean
    }],
    aggregations: [{
      period: String,
      startTime: Date,
      endTime: Date,
      metrics: mongoose.Schema.Types.Mixed,
      calculations: mongoose.Schema.Types.Mixed,
      sampleSize: Number
    }]
  },

  // ==================== Performance Metrics ====================
  performanceMetrics: {
    operational: {
      throughput: {
        current: Number,
        average: Number,
        peak: Number,
        unit: String
      },
      latency: {
        p50: Number,
        p95: Number,
        p99: Number,
        max: Number,
        unit: String
      },
      availability: {
        uptime: Number,
        downtime: Number,
        mtbf: Number,
        mttr: Number
      },
      efficiency: {
        resourceUtilization: Number,
        costPerUnit: Number,
        wastePercentage: Number
      }
    },
    business: {
      revenue: {
        total: Number,
        recurring: Number,
        growth: Number,
        perUnit: Number
      },
      costs: {
        total: Number,
        operational: Number,
        capital: Number,
        perUnit: Number
      },
      profitability: {
        grossMargin: Number,
        netMargin: Number,
        ebitda: Number,
        roi: Number
      },
      productivity: {
        outputPerHour: Number,
        revenuePerEmployee: Number,
        tasksCompleted: Number
      }
    },
    quality: {
      accuracy: Number,
      precision: Number,
      errorRate: Number,
      defectDensity: Number,
      satisfactionScore: Number,
      nps: Number,
      qualityScore: Number
    },
    growth: {
      userGrowth: Number,
      revenueGrowth: Number,
      marketShare: Number,
      customerAcquisition: Number,
      retentionRate: Number,
      churnRate: Number
    }
  },

  // ==================== Statistical Analysis ====================
  statisticalAnalysis: {
    descriptive: {
      mean: Number,
      median: Number,
      mode: Number,
      standardDeviation: Number,
      variance: Number,
      skewness: Number,
      kurtosis: Number,
      range: {
        min: Number,
        max: Number
      },
      quartiles: {
        q1: Number,
        q2: Number,
        q3: Number,
        iqr: Number
      },
      percentiles: mongoose.Schema.Types.Mixed
    },
    timeSeries: {
      trend: {
        direction: {
          type: String,
          enum: ['INCREASING', 'DECREASING', 'STABLE', 'VOLATILE']
        },
        slope: Number,
        strength: Number
      },
      seasonality: {
        detected: Boolean,
        period: Number,
        amplitude: Number
      },
      forecast: [{
        timestamp: Date,
        value: Number,
        confidence: {
          lower: Number,
          upper: Number
        }
      }],
      changePoints: [{
        timestamp: Date,
        magnitude: Number,
        confidence: Number
      }]
    },
    correlation: [{
      metricA: String,
      metricB: String,
      coefficient: Number,
      pValue: Number,
      significance: String
    }],
    regression: {
      model: String,
      coefficients: mongoose.Schema.Types.Mixed,
      rSquared: Number,
      adjustedRSquared: Number,
      standardError: Number,
      fStatistic: Number
    },
    hypothesis: [{
      testId: String,
      hypothesis: String,
      testType: String,
      statistic: Number,
      pValue: Number,
      conclusion: String,
      confidence: Number
    }]
  },

  // ==================== Anomaly Detection ====================
  anomalyDetection: {
    configuration: {
      enabled: Boolean,
      sensitivity: Number,
      algorithms: [{
        name: String,
        type: String,
        parameters: mongoose.Schema.Types.Mixed,
        weight: Number
      }],
      thresholds: {
        statistical: Number,
        ml: Number,
        rule: Number
      }
    },
    anomalies: [{
      anomalyId: String,
      detectedAt: Date,
      metricId: String,
      type: {
        type: String,
        enum: ['SPIKE', 'DIP', 'PATTERN', 'MISSING', 'OUTLIER', 'SHIFT']
      },
      severity: {
        type: String,
        enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']
      },
      value: mongoose.Schema.Types.Mixed,
      expectedValue: mongoose.Schema.Types.Mixed,
      deviation: Number,
      confidence: Number,
      impact: {
        scope: String,
        estimatedCost: Number,
        affectedEntities: Number
      },
      status: {
        type: String,
        enum: ['NEW', 'INVESTIGATING', 'CONFIRMED', 'FALSE_POSITIVE', 'RESOLVED']
      },
      resolution: {
        resolvedAt: Date,
        resolvedBy: mongoose.Schema.Types.ObjectId,
        action: String,
        notes: String
      }
    }],
    patterns: [{
      patternId: String,
      name: String,
      description: String,
      frequency: Number,
      lastOccurrence: Date,
      predictedNext: Date
    }],
    alerts: [{
      alertId: String,
      triggeredAt: Date,
      condition: String,
      message: String,
      recipients: [String],
      acknowledged: Boolean,
      acknowledgedBy: mongoose.Schema.Types.ObjectId,
      acknowledgedAt: Date
    }]
  },

  // ==================== Predictive Analytics ====================
  predictiveAnalytics: {
    models: [{
      modelId: String,
      name: String,
      type: {
        type: String,
        enum: ['LINEAR', 'POLYNOMIAL', 'EXPONENTIAL', 'ARIMA', 'NEURAL_NETWORK', 'RANDOM_FOREST', 'GRADIENT_BOOST']
      },
      version: String,
      trainedAt: Date,
      accuracy: {
        training: Number,
        validation: Number,
        test: Number
      },
      features: [String],
      parameters: mongoose.Schema.Types.Mixed,
      performance: {
        mae: Number,
        rmse: Number,
        mape: Number,
        r2: Number
      }
    }],
    predictions: [{
      predictionId: String,
      modelId: String,
      timestamp: Date,
      horizon: {
        value: Number,
        unit: String
      },
      predictions: [{
        metric: String,
        value: Number,
        confidence: Number,
        interval: {
          lower: Number,
          upper: Number
        }
      }],
      accuracy: Number,
      actualValue: Number
    }],
    scenarios: [{
      scenarioId: String,
      name: String,
      description: String,
      assumptions: mongoose.Schema.Types.Mixed,
      outcomes: mongoose.Schema.Types.Mixed,
      probability: Number,
      impact: String
    }],
    recommendations: [{
      recommendationId: String,
      type: String,
      priority: String,
      action: String,
      expectedOutcome: String,
      confidence: Number,
      risk: String,
      implemented: Boolean,
      result: String
    }]
  },

  // ==================== Benchmarking ====================
  benchmarking: {
    internal: [{
      benchmarkId: String,
      name: String,
      metric: String,
      baseline: Number,
      current: Number,
      target: Number,
      percentile: Number,
      period: String,
      comparison: {
        type: String,
        entities: [String],
        rank: Number,
        total: Number
      }
    }],
    industry: [{
      metric: String,
      industryAverage: Number,
      topPerformers: Number,
      ourValue: Number,
      percentile: Number,
      gap: Number,
      source: String,
      updatedAt: Date
    }],
    competitors: [{
      competitorId: String,
      name: String,
      metrics: mongoose.Schema.Types.Mixed,
      comparison: mongoose.Schema.Types.Mixed,
      advantages: [String],
      disadvantages: [String]
    }],
    goals: [{
      goalId: String,
      name: String,
      metric: String,
      target: Number,
      deadline: Date,
      progress: Number,
      status: {
        type: String,
        enum: ['NOT_STARTED', 'IN_PROGRESS', 'AT_RISK', 'ON_TRACK', 'ACHIEVED', 'MISSED']
      },
      actions: [String]
    }]
  },

  // ==================== Segmentation & Cohorts ====================
  segmentation: {
    segments: [{
      segmentId: String,
      name: String,
      description: String,
      criteria: mongoose.Schema.Types.Mixed,
      size: Number,
      percentage: Number,
      characteristics: mongoose.Schema.Types.Mixed,
      performance: mongoose.Schema.Types.Mixed,
      value: Number
    }],
    cohorts: [{
      cohortId: String,
      name: String,
      definition: String,
      createdDate: Date,
      size: Number,
      retention: [{
        period: Number,
        retained: Number,
        percentage: Number
      }],
      lifetime: {
        value: Number,
        duration: Number,
        churn: Number
      },
      behaviors: mongoose.Schema.Types.Mixed
    }],
    clusters: [{
      clusterId: String,
      algorithm: String,
      features: [String],
      centers: mongoose.Schema.Types.Mixed,
      members: Number,
      quality: {
        silhouette: Number,
        inertia: Number,
        separation: Number
      }
    }],
    personas: [{
      personaId: String,
      name: String,
      description: String,
      demographics: mongoose.Schema.Types.Mixed,
      behaviors: mongoose.Schema.Types.Mixed,
      needs: [String],
      size: Number,
      value: Number
    }]
  },

  // ==================== Visualization Configuration ====================
  visualization: {
    charts: [{
      chartId: String,
      name: String,
      type: {
        type: String,
        enum: ['LINE', 'BAR', 'PIE', 'SCATTER', 'HEATMAP', 'TREEMAP', 'SANKEY', 'GAUGE', 'RADAR', 'BUBBLE', 'WATERFALL']
      },
      data: {
        metrics: [String],
        dimensions: [String],
        filters: mongoose.Schema.Types.Mixed
      },
      configuration: {
        title: String,
        subtitle: String,
        axes: mongoose.Schema.Types.Mixed,
        legend: mongoose.Schema.Types.Mixed,
        colors: [String],
        animations: Boolean
      },
      interactions: {
        zoom: Boolean,
        pan: Boolean,
        tooltip: Boolean,
        export: Boolean
      }
    }],
    dashboards: [{
      dashboardId: String,
      widgets: [String]
    }],
    reports: [{
      reportId: String,
      sections: [String]
    }]
  },

  // ==================== Attribution & Impact ====================
  attribution: {
    models: [{
      modelId: String,
      name: String,
      type: {
        type: String,
        enum: ['FIRST_TOUCH', 'LAST_TOUCH', 'LINEAR', 'TIME_DECAY', 'POSITION_BASED', 'DATA_DRIVEN', 'CUSTOM']
      },
      weights: mongoose.Schema.Types.Mixed,
      lookbackWindow: Number
    }],
    touchpoints: [{
      touchpointId: String,
      channel: String,
      timestamp: Date,
      interaction: String,
      weight: Number,
      influence: Number,
      cost: Number,
      revenue: Number
    }],
    conversions: [{
      conversionId: String,
      type: String,
      value: Number,
      timestamp: Date,
      journey: [String],
      attribution: mongoose.Schema.Types.Mixed
    }],
    roi: {
      overall: Number,
      byChannel: mongoose.Schema.Types.Mixed,
      byCampaign: mongoose.Schema.Types.Mixed,
      byPeriod: mongoose.Schema.Types.Mixed
    }
  },

  // ==================== Compliance & Governance ====================
  compliance: {
    regulations: [{
      regulation: String,
      applicable: Boolean,
      requirements: [String],
      status: {
        type: String,
        enum: ['COMPLIANT', 'NON_COMPLIANT', 'PARTIAL', 'PENDING']
      },
      lastAudit: Date,
      nextAudit: Date,
      issues: [{
        issueId: String,
        description: String,
        severity: String,
        identified: Date,
        resolved: Boolean
      }]
    }],
    dataGovernance: {
      classification: {
        type: String,
        enum: ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED']
      },
      retention: {
        period: Number,
        unit: String,
        policy: String
      },
      privacy: {
        piiPresent: Boolean,
        anonymized: Boolean,
        encrypted: Boolean,
        consent: mongoose.Schema.Types.Mixed
      },
      lineage: [{
        source: String,
        transformation: String,
        destination: String,
        timestamp: Date
      }]
    },
    audit: {
      enabled: Boolean,
      trail: [{
        eventId: String,
        event: String,
        user: mongoose.Schema.Types.ObjectId,
        timestamp: Date,
        changes: mongoose.Schema.Types.Mixed,
        ipAddress: String
      }],
      reports: [{
        reportId: String,
        generatedAt: Date,
        period: String,
        findings: mongoose.Schema.Types.Mixed
      }]
    }
  },

  // ==================== Metadata & Status ====================
  metadata: {
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE', 'PROCESSING', 'ERROR', 'ARCHIVED'],
      default: 'ACTIVE',
      index: true
    },
    version: {
      type: Number,
      default: 1
    },
    createdAt: Date,
    createdBy: mongoose.Schema.Types.ObjectId,
    updatedAt: Date,
    updatedBy: mongoose.Schema.Types.ObjectId,
    lastProcessed: Date,
    nextProcessing: Date,
    tags: [String],
    labels: mongoose.Schema.Types.Mixed,
    customFields: mongoose.Schema.Types.Mixed,
    flags: {
      realTime: Boolean,
      critical: Boolean,
      public: Boolean,
      certified: Boolean
    },
    quality: {
      score: Number,
      completeness: Number,
      accuracy: Number,
      timeliness: Number,
      consistency: Number
    }
  }
}

const analyticsSchema = BaseModel.createSchema(analyticsSchemaDefinition, {
  collection: 'analytics',
  timestamps: true,
  strict: true,
  versionKey: '__v',
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
})

// ==================== Indexes ====================
analyticsSchema.index({ 'analyticsReference.organizationId': 1, 'analyticsReference.entityType': 1 });
analyticsSchema.index({ 'analyticsReference.entityId': 1 });
analyticsSchema.index({ 'metricsConfiguration.category.primary': 1, 'metricsConfiguration.type': 1 });
analyticsSchema.index({ 'dataCollection.dataPoints.timestamp': -1 });
analyticsSchema.index({ 'anomalyDetection.anomalies.detectedAt': -1 });
analyticsSchema.index({ 'metadata.status': 1, 'metadata.lastProcessed': 1 });
analyticsSchema.index({ 'metricsConfiguration.name': 'text', 'metricsConfiguration.description': 'text' });

// ==================== Virtual Properties ====================
analyticsSchema.virtual('isRealTime').get(function() {
  return this.metricsConfiguration.type === 'REAL_TIME';
});

analyticsSchema.virtual('hasAnomalies').get(function() {
  return this.anomalyDetection.anomalies && 
    this.anomalyDetection.anomalies.some(a => a.status === 'NEW' || a.status === 'INVESTIGATING');
});

analyticsSchema.virtual('dataQuality').get(function() {
  const quality = this.metadata.quality;
  if (!quality) return 'UNKNOWN';
  
  const avgScore = (quality.completeness + quality.accuracy + quality.timeliness + quality.consistency) / 4;
  
  if (avgScore >= 90) return 'EXCELLENT';
  if (avgScore >= 75) return 'GOOD';
  if (avgScore >= 60) return 'FAIR';
  return 'POOR';
});

analyticsSchema.virtual('trendDirection').get(function() {
  return this.statisticalAnalysis?.timeSeries?.trend?.direction || 'UNKNOWN';
});

// ==================== Instance Methods ====================

/**
 * Calculate metrics
 * @async
 * @param {Object} options - Calculation options
 * @returns {Promise<Object>} Calculated metrics
 */
analyticsSchema.methods.calculateMetrics = async function(options = {}) {
  try {
    const results = {};
    
    for (const metric of this.metricsConfiguration.metrics) {
      const dataPoints = this.dataCollection.dataPoints.filter(dp => 
        dp.metricId === metric.metricId &&
        (!options.startDate || dp.timestamp >= options.startDate) &&
        (!options.endDate || dp.timestamp <= options.endDate)
      );
      
      if (dataPoints.length === 0) {
        results[metric.name] = null;
        continue;
      }
      
      const values = dataPoints.map(dp => dp.value);
      
      switch (metric.aggregation) {
        case 'SUM':
          results[metric.name] = values.reduce((a, b) => a + b, 0);
          break;
        case 'AVG':
          results[metric.name] = values.reduce((a, b) => a + b, 0) / values.length;
          break;
        case 'MIN':
          results[metric.name] = Math.min(...values);
          break;
        case 'MAX':
          results[metric.name] = Math.max(...values);
          break;
        case 'COUNT':
          results[metric.name] = values.length;
          break;
        case 'MEDIAN':
          const sorted = values.sort((a, b) => a - b);
          const mid = Math.floor(sorted.length / 2);
          results[metric.name] = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
          break;
        default:
          results[metric.name] = values[values.length - 1];
      }
    }
    
    logger.info(`Metrics calculated for analytics ${this.analyticsId}`);
    return results;
    
  } catch (error) {
    logger.error(`Failed to calculate metrics:`, error);
    throw error;
  }
};

/**
 * Detect anomalies
 * @async
 * @param {Object} options - Detection options
 * @returns {Promise<Array>} Detected anomalies
 */
analyticsSchema.methods.detectAnomalies = async function(options = {}) {
  try {
    const anomalies = [];
    const sensitivity = options.sensitivity || this.anomalyDetection.configuration.sensitivity || 2;
    
    for (const metric of this.metricsConfiguration.metrics) {
      const dataPoints = this.dataCollection.dataPoints.filter(dp => dp.metricId === metric.metricId);
      
      if (dataPoints.length < 10) continue;
      
      const values = dataPoints.map(dp => dp.value);
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const stdDev = Math.sqrt(values.map(v => Math.pow(v - mean, 2)).reduce((a, b) => a + b, 0) / values.length);
      
      const latestValue = values[values.length - 1];
      const zScore = Math.abs((latestValue - mean) / stdDev);
      
      if (zScore > sensitivity) {
        const anomaly = {
          anomalyId: `ANOM-${Date.now()}-${cryptoHelper.generateRandomString(6)}`,
          detectedAt: new Date(),
          metricId: metric.metricId,
          type: latestValue > mean ? 'SPIKE' : 'DIP',
          severity: zScore > 4 ? 'CRITICAL' : zScore > 3 ? 'HIGH' : 'MEDIUM',
          value: latestValue,
          expectedValue: mean,
          deviation: zScore,
          confidence: Math.min(zScore / 4, 1) * 100,
          status: 'NEW'
        };
        
        anomalies.push(anomaly);
        this.anomalyDetection.anomalies.push(anomaly);
      }
    }
    
    if (anomalies.length > 0) {
      await this.save();
      logger.info(`${anomalies.length} anomalies detected for analytics ${this.analyticsId}`);
    }
    
    return anomalies;
    
  } catch (error) {
    logger.error(`Failed to detect anomalies:`, error);
    throw error;
  }
};

/**
 * Generate predictions
 * @async
 * @param {Object} options - Prediction options
 * @returns {Promise<Object>} Predictions
 */
analyticsSchema.methods.generatePredictions = async function(options = {}) {
  try {
    const horizon = options.horizon || 7;
    const predictions = [];
    
    for (const metric of this.metricsConfiguration.metrics) {
      const dataPoints = this.dataCollection.dataPoints
        .filter(dp => dp.metricId === metric.metricId)
        .sort((a, b) => a.timestamp - b.timestamp);
      
      if (dataPoints.length < 7) continue;
      
      // Simple linear regression for demonstration
      const n = dataPoints.length;
      const x = Array.from({ length: n }, (_, i) => i);
      const y = dataPoints.map(dp => dp.value);
      
      const sumX = x.reduce((a, b) => a + b, 0);
      const sumY = y.reduce((a, b) => a + b, 0);
      const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
      const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
      
      const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
      const intercept = (sumY - slope * sumX) / n;
      
      for (let i = 1; i <= horizon; i++) {
        const predictedValue = slope * (n + i) + intercept;
        const stdError = Math.sqrt(y.map(v => Math.pow(v - (slope * x[y.indexOf(v)] + intercept), 2)).reduce((a, b) => a + b, 0) / (n - 2));
        
        predictions.push({
          metric: metric.name,
          timestamp: dateHelper.addDays(new Date(), i),
          value: predictedValue,
          confidence: 95,
          interval: {
            lower: predictedValue - 1.96 * stdError,
            upper: predictedValue + 1.96 * stdError
          }
        });
      }
    }
    
    const predictionRecord = {
      predictionId: `PRED-${Date.now()}-${cryptoHelper.generateRandomString(6)}`,
      modelId: 'LINEAR_REGRESSION',
      timestamp: new Date(),
      horizon: { value: horizon, unit: 'DAYS' },
      predictions,
      accuracy: 0
    };
    
    this.predictiveAnalytics.predictions.push(predictionRecord);
    await this.save();
    
    logger.info(`Predictions generated for analytics ${this.analyticsId}`);
    return predictionRecord;
    
  } catch (error) {
    logger.error(`Failed to generate predictions:`, error);
    throw error;
  }
};

/**
 * Calculate statistical analysis
 * @async
 * @param {Object} options - Analysis options
 * @returns {Promise<Object>} Statistical analysis
 */
analyticsSchema.methods.calculateStatistics = async function(options = {}) {
  try {
    const statistics = {};
    
    for (const metric of this.metricsConfiguration.metrics) {
      const dataPoints = this.dataCollection.dataPoints.filter(dp => dp.metricId === metric.metricId);
      
      if (dataPoints.length === 0) continue;
      
      const values = dataPoints.map(dp => dp.value).sort((a, b) => a - b);
      const n = values.length;
      
      // Calculate descriptive statistics
      const mean = values.reduce((a, b) => a + b, 0) / n;
      const median = n % 2 ? values[Math.floor(n / 2)] : (values[n / 2 - 1] + values[n / 2]) / 2;
      const variance = values.map(v => Math.pow(v - mean, 2)).reduce((a, b) => a + b, 0) / n;
      const stdDev = Math.sqrt(variance);
      
      statistics[metric.name] = {
        count: n,
        mean,
        median,
        min: values[0],
        max: values[n - 1],
        range: values[n - 1] - values[0],
        variance,
        standardDeviation: stdDev,
        quartiles: {
          q1: values[Math.floor(n * 0.25)],
          q2: median,
          q3: values[Math.floor(n * 0.75)]
        }
      };
    }
    
    this.statisticalAnalysis.descriptive = statistics;
    await this.save();
    
    logger.info(`Statistics calculated for analytics ${this.analyticsId}`);
    return statistics;
    
  } catch (error) {
    logger.error(`Failed to calculate statistics:`, error);
    throw error;
  }
};

/**
 * Perform segmentation
 * @async
 * @param {Object} options - Segmentation options
 * @returns {Promise<Array>} Segments
 */
analyticsSchema.methods.performSegmentation = async function(options = {}) {
  try {
    const segmentationMethod = options.method || 'QUARTILE';
    const segments = [];
    
    for (const metric of this.metricsConfiguration.metrics) {
      const dataPoints = this.dataCollection.dataPoints.filter(dp => dp.metricId === metric.metricId);
      
      if (dataPoints.length < 4) continue;
      
      const values = dataPoints.map(dp => dp.value).sort((a, b) => a - b);
      const n = values.length;
      
      if (segmentationMethod === 'QUARTILE') {
        const quartiles = [
          { name: 'Bottom 25%', min: values[0], max: values[Math.floor(n * 0.25)] },
          { name: 'Lower Middle', min: values[Math.floor(n * 0.25)], max: values[Math.floor(n * 0.5)] },
          { name: 'Upper Middle', min: values[Math.floor(n * 0.5)], max: values[Math.floor(n * 0.75)] },
          { name: 'Top 25%', min: values[Math.floor(n * 0.75)], max: values[n - 1] }
        ];
        
        quartiles.forEach((q, i) => {
          segments.push({
            segmentId: `SEG-${Date.now()}-${i}`,
            name: `${metric.name} - ${q.name}`,
            criteria: { metric: metric.name, range: q },
            size: Math.floor(n / 4),
            percentage: 25,
            value: q.max - q.min
          });
        });
      }
    }
    
    this.segmentation.segments = segments;
    await this.save();
    
    logger.info(`Segmentation performed for analytics ${this.analyticsId}`);
    return segments;
    
  } catch (error) {
    logger.error(`Failed to perform segmentation:`, error);
    throw error;
  }
};

/**
 * Update benchmarks
 * @async
 * @param {Object} benchmarkData - Benchmark data
 * @returns {Promise<Object>} Updated benchmarks
 */
analyticsSchema.methods.updateBenchmarks = async function(benchmarkData) {
  try {
    if (benchmarkData.internal) {
      this.benchmarking.internal = benchmarkData.internal;
    }
    
    if (benchmarkData.industry) {
      this.benchmarking.industry = benchmarkData.industry.map(b => ({
        ...b,
        updatedAt: new Date()
      }));
    }
    
    if (benchmarkData.competitors) {
      this.benchmarking.competitors = benchmarkData.competitors;
    }
    
    await this.save();
    
    logger.info(`Benchmarks updated for analytics ${this.analyticsId}`);
    return this.benchmarking;
    
  } catch (error) {
    logger.error(`Failed to update benchmarks:`, error);
    throw error;
  }
};

// ==================== Static Methods ====================

/**
 * Find analytics by organization
 * @static
 * @async
 * @param {String} organizationId - Organization ID
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Analytics records
 */
analyticsSchema.statics.findByOrganization = async function(organizationId, options = {}) {
  const query = { 'analyticsReference.organizationId': organizationId };
  
  if (options.entityType) {
    query['analyticsReference.entityType'] = options.entityType;
  }
  
  if (options.category) {
    query['metricsConfiguration.category.primary'] = options.category;
  }
  
  if (options.status) {
    query['metadata.status'] = options.status;
  }
  
  return this.find(query)
    .sort(options.sort || { 'metadata.lastProcessed': -1 })
    .limit(options.limit || 100);
};

/**
 * Find analytics with anomalies
 * @static
 * @async
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Analytics with anomalies
 */
analyticsSchema.statics.findWithAnomalies = async function(options = {}) {
  const query = {
    'anomalyDetection.anomalies': { $exists: true, $ne: [] }
  };
  
  if (options.severity) {
    query['anomalyDetection.anomalies.severity'] = options.severity;
  }
  
  if (options.unresolved) {
    query['anomalyDetection.anomalies.status'] = { $in: ['NEW', 'INVESTIGATING'] };
  }
  
  if (options.organizationId) {
    query['analyticsReference.organizationId'] = options.organizationId;
  }
  
  return this.find(query)
    .sort({ 'anomalyDetection.anomalies.detectedAt': -1 })
    .limit(options.limit || 50);
};

/**
 * Get analytics summary
 * @static
 * @async
 * @param {Object} filters - Filter criteria
 * @returns {Promise<Object>} Analytics summary
 */
analyticsSchema.statics.getAnalyticsSummary = async function(filters = {}) {
  const matchStage = {};
  
  if (filters.organizationId) {
    matchStage['analyticsReference.organizationId'] = filters.organizationId;
  }
  
  if (filters.dateRange) {
    matchStage['metadata.lastProcessed'] = {
      $gte: filters.dateRange.start,
      $lte: filters.dateRange.end
    };
  }
  
  const summary = await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        active: {
          $sum: { $cond: [{ $eq: ['$metadata.status', 'ACTIVE'] }, 1, 0] }
        },
        withAnomalies: {
          $sum: {
            $cond: [
              { $gt: [{ $size: { $ifNull: ['$anomalyDetection.anomalies', []] } }, 0] },
              1,
              0
            ]
          }
        },
        realTime: {
          $sum: { $cond: [{ $eq: ['$metricsConfiguration.type', 'REAL_TIME'] }, 1, 0] }
        },
        avgDataPoints: { $avg: { $size: { $ifNull: ['$dataCollection.dataPoints', []] } } },
        avgQualityScore: { $avg: '$metadata.quality.score' }
      }
    }
  ]);
  
  return summary[0] || {
    total: 0,
    active: 0,
    withAnomalies: 0,
    realTime: 0,
    avgDataPoints: 0,
    avgQualityScore: 0
  };
};

/**
 * Find top performers
 * @static
 * @async
 * @param {Object} criteria - Performance criteria
 * @returns {Promise<Array>} Top performing analytics
 */
analyticsSchema.statics.findTopPerformers = async function(criteria = {}) {
  const metricPath = criteria.metric || 'performanceMetrics.business.revenue.total';
  
  const query = {
    'metadata.status': 'ACTIVE',
    [metricPath]: { $exists: true }
  };
  
  if (criteria.organizationId) {
    query['analyticsReference.organizationId'] = criteria.organizationId;
  }
  
  if (criteria.entityType) {
    query['analyticsReference.entityType'] = criteria.entityType;
  }
  
  return this.find(query)
    .sort({ [metricPath]: -1 })
    .limit(criteria.limit || 10);
};

// ==================== Hooks ====================
analyticsSchema.pre('save', async function(next) {
  if (this.isModified('dataCollection.dataPoints')) {
    // Update data quality score
    const totalPoints = this.dataCollection.dataPoints.length;
    const processedPoints = this.dataCollection.dataPoints.filter(dp => dp.processed).length;
    
    this.metadata.quality = this.metadata.quality || {};
    this.metadata.quality.completeness = totalPoints > 0 ? (processedPoints / totalPoints) * 100 : 0;
  }
  
  if (!this.isNew) {
    this.metadata.version++;
    this.metadata.updatedAt = new Date();
  }
  
  next();
});

analyticsSchema.post('save', async function(doc) {
  const cacheService = new CacheService();
  await cacheService.invalidate(`analytics:${doc.analyticsId}`);
});

// ==================== Model Export ====================
const AnalyticsModel = mongoose.model('Analytics', analyticsSchema);

module.exports = AnalyticsModel;