'use strict';

/**
 * @fileoverview System monitoring and health management validation rules
 * @module servers/admin-server/modules/platform-management/validators/system-validators
 * @requires joi
 * @requires module:shared/lib/utils/validators/common-validators
 * @requires module:shared/lib/utils/constants/status-codes
 * @requires module:shared/lib/utils/constants/error-codes
 * @requires module:shared/lib/utils/logger
 */

const Joi = require('joi');
const commonValidators = require('../../../../../shared/lib/utils/validators/common-validators');
const { StatusCodes } = require('../../../../../shared/lib/utils/constants/status-codes');
const { ErrorCodes } = require('../../../../../shared/lib/utils/constants/error-codes');
const logger = require('../../../../../shared/lib/utils/logger');

/**
 * Custom validation messages for system operations
 */
const VALIDATION_MESSAGES = {
  SYSTEM_ID_REQUIRED: 'System ID is required',
  SYSTEM_ID_INVALID: 'Invalid system ID format',
  SERVICE_NAME_REQUIRED: 'Service name is required',
  SERVICE_NAME_INVALID: 'Service name must be in kebab-case format',
  ALERT_ID_REQUIRED: 'Alert ID is required',
  METRIC_NAME_REQUIRED: 'Metric name is required',
  METRIC_VALUE_INVALID: 'Metric value must be a valid number',
  HEALTH_STATUS_INVALID: 'Invalid health status',
  ALERT_SEVERITY_INVALID: 'Invalid alert severity level',
  TIME_RANGE_INVALID: 'Invalid time range specified',
  AGGREGATION_INVALID: 'Invalid aggregation method',
  THRESHOLD_INVALID: 'Threshold value must be a positive number',
  INTERVAL_INVALID: 'Interval must be between 10 and 3600 seconds',
  PORT_INVALID: 'Invalid port number',
  CPU_LIMIT_INVALID: 'CPU limit format is invalid',
  MEMORY_LIMIT_INVALID: 'Memory limit format is invalid',
  TIMESTAMP_INVALID: 'Invalid timestamp format',
  DURATION_INVALID: 'Duration must be a positive integer',
  SCALE_FACTOR_INVALID: 'Scale factor must be between 0.1 and 10'
};

/**
 * Common validation schemas for system operations
 */
const commonSchemas = {
  systemId: Joi.string()
    .pattern(/^sys-[a-zA-Z0-9]{8,32}$/)
    .required()
    .messages({
      'string.pattern.base': VALIDATION_MESSAGES.SYSTEM_ID_INVALID,
      'any.required': VALIDATION_MESSAGES.SYSTEM_ID_REQUIRED
    }),

  serviceName: Joi.string()
    .pattern(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/)
    .min(2)
    .max(64)
    .required()
    .messages({
      'string.pattern.base': VALIDATION_MESSAGES.SERVICE_NAME_INVALID,
      'any.required': VALIDATION_MESSAGES.SERVICE_NAME_REQUIRED
    }),

  alertId: Joi.string()
    .pattern(/^alert-[a-zA-Z0-9]{8,32}$/)
    .required()
    .messages({
      'any.required': VALIDATION_MESSAGES.ALERT_ID_REQUIRED
    }),

  healthStatus: Joi.string()
    .valid('healthy', 'degraded', 'unhealthy', 'unknown', 'checking')
    .messages({
      'any.only': VALIDATION_MESSAGES.HEALTH_STATUS_INVALID
    }),

  alertSeverity: Joi.string()
    .valid('critical', 'high', 'medium', 'low', 'info')
    .messages({
      'any.only': VALIDATION_MESSAGES.ALERT_SEVERITY_INVALID
    }),

  timeRange: Joi.object({
    start: Joi.date().iso().required(),
    end: Joi.date().iso().greater(Joi.ref('start')).required(),
    timezone: Joi.string().default('UTC')
  }),

  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    sort: Joi.string().default('-timestamp'),
    order: Joi.string().valid('asc', 'desc').default('desc')
  }),

  metricData: Joi.object({
    name: Joi.string().required(),
    value: Joi.number().required(),
    unit: Joi.string(),
    timestamp: Joi.date().iso().default(() => new Date()),
    tags: Joi.object().pattern(Joi.string(), Joi.string()),
    metadata: Joi.object()
  }),

  resourceLimits: Joi.object({
    cpu: Joi.object({
      request: Joi.string().pattern(/^\d+m?$/),
      limit: Joi.string().pattern(/^\d+m?$/)
    }),
    memory: Joi.object({
      request: Joi.string().pattern(/^\d+[KMG]i?$/),
      limit: Joi.string().pattern(/^\d+[KMG]i?$/)
    }),
    storage: Joi.object({
      size: Joi.string().pattern(/^\d+[KMG]i?$/),
      iops: Joi.number().integer().min(100).max(100000)
    }),
    network: Joi.object({
      ingress: Joi.string().pattern(/^\d+[KMG]bps$/),
      egress: Joi.string().pattern(/^\d+[KMG]bps$/)
    })
  })
};

/**
 * System initialization and setup validators
 */
const systemInitializationValidators = {
  /**
   * Validate initialize system request
   */
  initializeSystem: {
    body: Joi.object({
      systemName: Joi.string().min(3).max(64).required(),
      systemType: Joi.string().valid('production', 'staging', 'development', 'test').required(),
      description: Joi.string().max(500),
      configuration: Joi.object({
        region: Joi.string().required(),
        zone: Joi.string(),
        cluster: Joi.string(),
        namespace: Joi.string().default('default'),
        resources: commonSchemas.resourceLimits,
        networking: Joi.object({
          vpcId: Joi.string(),
          subnetIds: Joi.array().items(Joi.string()),
          securityGroups: Joi.array().items(Joi.string()),
          loadBalancer: Joi.object({
            enabled: Joi.boolean().default(true),
            type: Joi.string().valid('application', 'network').default('application'),
            scheme: Joi.string().valid('internal', 'internet-facing').default('internet-facing')
          })
        }),
        monitoring: Joi.object({
          enabled: Joi.boolean().default(true),
          provider: Joi.string().valid('prometheus', 'datadog', 'newrelic', 'cloudwatch'),
          configuration: Joi.object()
        }),
        logging: Joi.object({
          enabled: Joi.boolean().default(true),
          provider: Joi.string().valid('elasticsearch', 'cloudwatch', 'stackdriver', 'splunk'),
          configuration: Joi.object()
        })
      }).required(),
      components: Joi.array().items(
        Joi.object({
          name: Joi.string().required(),
          type: Joi.string().valid('service', 'database', 'cache', 'queue', 'storage').required(),
          enabled: Joi.boolean().default(true),
          configuration: Joi.object()
        })
      ),
      tags: Joi.object().pattern(Joi.string(), Joi.string()),
      metadata: Joi.object()
    }).unknown(false)
  },

  /**
   * Validate provision system request
   */
  provisionSystem: {
    body: Joi.object({
      template: Joi.string().valid('basic', 'standard', 'enterprise', 'custom').required(),
      specifications: Joi.object({
        compute: Joi.object({
          instances: Joi.number().integer().min(1).max(100).required(),
          instanceType: Joi.string().required(),
          autoScaling: Joi.object({
            enabled: Joi.boolean().default(false),
            minInstances: Joi.number().integer().min(1),
            maxInstances: Joi.number().integer().max(100),
            targetCPU: Joi.number().min(10).max(90)
          })
        }),
        storage: Joi.object({
          type: Joi.string().valid('ssd', 'hdd', 'hybrid').required(),
          size: Joi.string().pattern(/^\d+[KMG]i?$/).required(),
          iops: Joi.number().integer().min(100),
          encryption: Joi.boolean().default(true)
        }),
        networking: Joi.object({
          bandwidth: Joi.string().pattern(/^\d+[KMG]bps$/),
          publicIP: Joi.boolean().default(false),
          privateDNS: Joi.boolean().default(true)
        })
      }).required(),
      schedule: Joi.object({
        immediate: Joi.boolean().default(true),
        scheduledAt: Joi.when('immediate', {
          is: false,
          then: Joi.date().iso().greater('now').required()
        })
      }),
      approvalRequired: Joi.boolean().default(true),
      notificationEmails: Joi.array().items(Joi.string().email())
    }).unknown(false)
  },

  /**
   * Validate bootstrap system request
   */
  bootstrapSystem: {
    params: Joi.object({
      systemId: commonSchemas.systemId
    }),
    body: Joi.object({
      bootstrapType: Joi.string().valid('full', 'partial', 'minimal').default('full'),
      components: Joi.array().items(
        Joi.string().valid('core', 'monitoring', 'logging', 'security', 'networking')
      ),
      skipValidation: Joi.boolean().default(false),
      force: Joi.boolean().default(false)
    }).unknown(false)
  },

  /**
   * Validate reset system request
   */
  resetSystem: {
    params: Joi.object({
      systemId: commonSchemas.systemId
    }),
    body: Joi.object({
      resetType: Joi.string().valid('soft', 'hard', 'factory').required(),
      preserveData: Joi.boolean().default(true),
      preserveConfiguration: Joi.boolean().default(false),
      components: Joi.array().items(Joi.string()),
      confirmation: Joi.string().valid('RESET').required(),
      reason: Joi.string().max(500).required()
    }).unknown(false)
  }
};

/**
 * System health and monitoring validators
 */
const systemHealthValidators = {
  /**
   * Validate get system health request
   */
  getSystemHealth: {
    params: Joi.object({
      systemId: commonSchemas.systemId
    }),
    query: Joi.object({
      detailed: Joi.boolean().default(false),
      includeHistory: Joi.boolean().default(false),
      historyDuration: Joi.string().valid('1h', '6h', '24h', '7d').default('24h'),
      components: Joi.array().items(Joi.string()),
      format: Joi.string().valid('json', 'summary', 'detailed').default('json')
    }).unknown(false)
  },

  /**
   * Validate get detailed health report request
   */
  getDetailedHealthReport: {
    params: Joi.object({
      systemId: commonSchemas.systemId
    }),
    query: Joi.object({
      reportType: Joi.string().valid('comprehensive', 'executive', 'technical').default('comprehensive'),
      includeRecommendations: Joi.boolean().default(true),
      includeTrends: Joi.boolean().default(true),
      timeRange: commonSchemas.timeRange,
      format: Joi.string().valid('json', 'pdf', 'html').default('json')
    }).unknown(false)
  },

  /**
   * Validate perform health check request
   */
  performHealthCheck: {
    params: Joi.object({
      systemId: commonSchemas.systemId
    }),
    body: Joi.object({
      checkTypes: Joi.array().items(
        Joi.string().valid(
          'connectivity',
          'latency',
          'throughput',
          'resources',
          'dependencies',
          'certificates',
          'configurations',
          'security'
        )
      ).min(1).default(['connectivity', 'resources', 'dependencies']),
      depth: Joi.string().valid('quick', 'standard', 'deep').default('standard'),
      timeout: Joi.number().min(1000).max(60000).default(10000),
      parallel: Joi.boolean().default(true),
      abortOnFailure: Joi.boolean().default(false)
    }).unknown(false)
  },

  /**
   * Validate get health history request
   */
  getHealthHistory: {
    params: Joi.object({
      systemId: commonSchemas.systemId
    }),
    query: Joi.object({
      timeRange: commonSchemas.timeRange,
      granularity: Joi.string().valid('minute', 'hour', 'day').default('hour'),
      metrics: Joi.array().items(Joi.string()),
      includeAnomalies: Joi.boolean().default(true),
      ...commonSchemas.pagination
    }).unknown(false)
  },

  /**
   * Validate get health trends request
   */
  getHealthTrends: {
    params: Joi.object({
      systemId: commonSchemas.systemId
    }),
    query: Joi.object({
      period: Joi.string().valid('24h', '7d', '30d', '90d').default('7d'),
      metrics: Joi.array().items(
        Joi.string().valid('availability', 'performance', 'errors', 'latency', 'throughput')
      ),
      comparison: Joi.string().valid('previous', 'average', 'baseline'),
      includeForecasts: Joi.boolean().default(false)
    }).unknown(false)
  },

  /**
   * Validate subscribe to health notifications request
   */
  subscribeToHealthNotifications: {
    params: Joi.object({
      systemId: commonSchemas.systemId
    }),
    body: Joi.object({
      channels: Joi.array().items(
        Joi.object({
          type: Joi.string().valid('email', 'sms', 'slack', 'webhook').required(),
          destination: Joi.string().required(),
          events: Joi.array().items(
            Joi.string().valid('degraded', 'unhealthy', 'recovered', 'maintenance')
          ),
          severity: Joi.array().items(commonSchemas.alertSeverity)
        })
      ).min(1).required(),
      filters: Joi.object({
        components: Joi.array().items(Joi.string()),
        services: Joi.array().items(Joi.string()),
        minimumSeverity: commonSchemas.alertSeverity
      }),
      schedule: Joi.object({
        enabled: Joi.boolean().default(true),
        quietHours: Joi.object({
          start: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/),
          end: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/),
          timezone: Joi.string().default('UTC')
        })
      })
    }).unknown(false)
  }
};

/**
 * System metrics and performance validators
 */
const systemMetricsValidators = {
  /**
   * Validate update system metrics request
   */
  updateSystemMetrics: {
    params: Joi.object({
      systemId: commonSchemas.systemId
    }),
    body: Joi.object({
      metrics: Joi.array().items(commonSchemas.metricData).min(1).required(),
      source: Joi.string().required(),
      collectedAt: Joi.date().iso().default(() => new Date()),
      aggregated: Joi.boolean().default(false)
    }).unknown(false)
  },

  /**
   * Validate batch update metrics request
   */
  batchUpdateMetrics: {
    params: Joi.object({
      systemId: commonSchemas.systemId
    }),
    body: Joi.object({
      batches: Joi.array().items(
        Joi.object({
          timestamp: Joi.date().iso().required(),
          metrics: Joi.array().items(commonSchemas.metricData).min(1).required(),
          source: Joi.string().required()
        })
      ).min(1).max(100).required(),
      compression: Joi.string().valid('none', 'gzip', 'snappy').default('none'),
      validateData: Joi.boolean().default(true)
    }).unknown(false)
  },

  /**
   * Validate get current metrics request
   */
  getCurrentMetrics: {
    params: Joi.object({
      systemId: commonSchemas.systemId
    }),
    query: Joi.object({
      metrics: Joi.array().items(Joi.string()),
      includeMetadata: Joi.boolean().default(false),
      format: Joi.string().valid('json', 'prometheus', 'graphite').default('json')
    }).unknown(false)
  },

  /**
   * Validate get metrics history request
   */
  getMetricsHistory: {
    params: Joi.object({
      systemId: commonSchemas.systemId
    }),
    query: Joi.object({
      metrics: Joi.array().items(Joi.string()).min(1).required(),
      timeRange: commonSchemas.timeRange,
      granularity: Joi.string().valid('raw', '1m', '5m', '15m', '1h', '1d').default('5m'),
      aggregation: Joi.string().valid('avg', 'sum', 'min', 'max', 'count', 'p50', 'p95', 'p99'),
      fillGaps: Joi.boolean().default(false),
      ...commonSchemas.pagination
    }).unknown(false)
  },

  /**
   * Validate get metrics stream request
   */
  getMetricsStream: {
    params: Joi.object({
      systemId: commonSchemas.systemId
    }),
    query: Joi.object({
      metrics: Joi.array().items(Joi.string()),
      interval: Joi.number().min(1).max(60).default(5),
      format: Joi.string().valid('json', 'sse', 'websocket').default('sse'),
      bufferSize: Joi.number().min(1).max(1000).default(100)
    }).unknown(false)
  },

  /**
   * Validate get performance statistics request
   */
  getPerformanceStats: {
    params: Joi.object({
      systemId: commonSchemas.systemId
    }),
    query: Joi.object({
      period: Joi.string().valid('1h', '6h', '24h', '7d', '30d').default('24h'),
      components: Joi.array().items(Joi.string()),
      includeBreakdown: Joi.boolean().default(true),
      includeComparison: Joi.boolean().default(false),
      percentiles: Joi.array().items(
        Joi.number().valid(50, 75, 90, 95, 99, 99.9)
      ).default([50, 95, 99])
    }).unknown(false)
  },

  /**
   * Validate get performance analysis request
   */
  getPerformanceAnalysis: {
    params: Joi.object({
      systemId: commonSchemas.systemId
    }),
    query: Joi.object({
      analysisType: Joi.string().valid('bottlenecks', 'trends', 'anomalies', 'capacity').required(),
      timeRange: commonSchemas.timeRange,
      depth: Joi.string().valid('basic', 'detailed', 'comprehensive').default('detailed'),
      includeRecommendations: Joi.boolean().default(true)
    }).unknown(false)
  },

  /**
   * Validate export metrics request
   */
  exportMetrics: {
    params: Joi.object({
      systemId: commonSchemas.systemId
    }),
    query: Joi.object({
      metrics: Joi.array().items(Joi.string()),
      timeRange: commonSchemas.timeRange,
      format: Joi.string().valid('csv', 'json', 'parquet', 'excel').required(),
      compression: Joi.string().valid('none', 'gzip', 'zip').default('none'),
      includeMetadata: Joi.boolean().default(true)
    }).unknown(false)
  },

  /**
   * Validate archive metrics request
   */
  archiveMetrics: {
    params: Joi.object({
      systemId: commonSchemas.systemId
    }),
    body: Joi.object({
      timeRange: commonSchemas.timeRange,
      destination: Joi.object({
        type: Joi.string().valid('s3', 'azure', 'gcp', 'local').required(),
        path: Joi.string().required(),
        credentials: Joi.object().when('type', {
          not: 'local',
          then: Joi.required()
        })
      }),
      compression: Joi.string().valid('none', 'gzip', 'snappy', 'lz4').default('gzip'),
      retention: Joi.number().min(1).max(3650).default(365),
      deleteAfterArchive: Joi.boolean().default(false)
    }).unknown(false)
  },

  /**
   * Validate cleanup metrics request
   */
  cleanupMetrics: {
    params: Joi.object({
      systemId: commonSchemas.systemId
    }),
    body: Joi.object({
      olderThan: Joi.date().iso().max('now').required(),
      metrics: Joi.array().items(Joi.string()),
      dryRun: Joi.boolean().default(true),
      batchSize: Joi.number().min(100).max(10000).default(1000),
      confirmation: Joi.when('dryRun', {
        is: false,
        then: Joi.string().valid('DELETE').required()
      })
    }).unknown(false)
  }
};

/**
 * Service health and management validators
 */
const serviceManagementValidators = {
  /**
   * Validate update service health request
   */
  updateServiceHealth: {
    params: Joi.object({
      systemId: commonSchemas.systemId,
      serviceName: commonSchemas.serviceName
    }),
    body: Joi.object({
      status: commonSchemas.healthStatus.required(),
      checks: Joi.array().items(
        Joi.object({
          name: Joi.string().required(),
          status: commonSchemas.healthStatus.required(),
          message: Joi.string(),
          duration: Joi.number().min(0),
          timestamp: Joi.date().iso().default(() => new Date())
        })
      ),
      metrics: Joi.object({
        responseTime: Joi.number().min(0),
        errorRate: Joi.number().min(0).max(100),
        throughput: Joi.number().min(0),
        activeConnections: Joi.number().integer().min(0)
      }),
      dependencies: Joi.array().items(
        Joi.object({
          name: Joi.string().required(),
          status: commonSchemas.healthStatus.required(),
          latency: Joi.number().min(0)
        })
      ),
      version: Joi.string(),
      metadata: Joi.object()
    }).unknown(false)
  },

  /**
   * Validate get services status request
   */
  getServicesStatus: {
    params: Joi.object({
      systemId: commonSchemas.systemId
    }),
    query: Joi.object({
      status: commonSchemas.healthStatus,
      includeMetrics: Joi.boolean().default(false),
      includeDependencies: Joi.boolean().default(false),
      sortBy: Joi.string().valid('name', 'status', 'lastUpdate').default('name')
    }).unknown(false)
  },

  /**
   * Validate get service status request
   */
  getServiceStatus: {
    params: Joi.object({
      systemId: commonSchemas.systemId,
      serviceName: commonSchemas.serviceName
    }),
    query: Joi.object({
      detailed: Joi.boolean().default(false),
      includeHistory: Joi.boolean().default(false),
      historyDuration: Joi.string().valid('1h', '6h', '24h', '7d').default('24h')
    }).unknown(false)
  },

  /**
   * Validate restart service request
   */
  restartService: {
    params: Joi.object({
      systemId: commonSchemas.systemId,
      serviceName: commonSchemas.serviceName
    }),
    body: Joi.object({
      graceful: Joi.boolean().default(true),
      timeout: Joi.number().min(0).max(300).default(30),
      force: Joi.boolean().default(false),
      reason: Joi.string().max(500).required()
    }).unknown(false)
  },

  /**
   * Validate scale service request
   */
  scaleService: {
    params: Joi.object({
      systemId: commonSchemas.systemId,
      serviceName: commonSchemas.serviceName
    }),
    body: Joi.object({
      replicas: Joi.number().integer().min(0).max(100),
      scaleFactor: Joi.number().min(0.1).max(10),
      resources: commonSchemas.resourceLimits,
      strategy: Joi.string().valid('immediate', 'rolling', 'blue-green').default('rolling'),
      reason: Joi.string().max(500).required()
    }).unknown(false).or('replicas', 'scaleFactor')
  },

  /**
   * Validate get service logs request
   */
  getServiceLogs: {
    params: Joi.object({
      systemId: commonSchemas.systemId,
      serviceName: commonSchemas.serviceName
    }),
    query: Joi.object({
      lines: Joi.number().integer().min(1).max(10000).default(100),
      since: Joi.date().iso(),
      until: Joi.date().iso(),
      level: Joi.string().valid('error', 'warn', 'info', 'debug'),
      search: Joi.string().max(200),
      follow: Joi.boolean().default(false),
      format: Joi.string().valid('json', 'text').default('json')
    }).unknown(false)
  }
};

/**
 * Alert management validators
 */
const alertManagementValidators = {
  /**
   * Validate create system alert request
   */
  createSystemAlert: {
    params: Joi.object({
      systemId: commonSchemas.systemId
    }),
    body: Joi.object({
      title: Joi.string().min(3).max(200).required(),
      description: Joi.string().max(1000),
      severity: commonSchemas.alertSeverity.required(),
      source: Joi.string().required(),
      category: Joi.string().valid(
        'performance',
        'availability',
        'security',
        'configuration',
        'capacity'
      ).required(),
      affectedComponents: Joi.array().items(Joi.string()),
      metrics: Joi.object().pattern(Joi.string(), Joi.number()),
      thresholds: Joi.object({
        actual: Joi.number(),
        expected: Joi.number(),
        threshold: Joi.number()
      }),
      actions: Joi.array().items(
        Joi.object({
          type: Joi.string().valid('notify', 'escalate', 'auto-remediate').required(),
          parameters: Joi.object()
        })
      ),
      metadata: Joi.object(),
      expiresAt: Joi.date().iso().greater('now')
    }).unknown(false)
  },

  /**
   * Validate acknowledge alert request
   */
  acknowledgeAlert: {
    params: Joi.object({
      systemId: commonSchemas.systemId,
      alertId: commonSchemas.alertId
    }),
    body: Joi.object({
      acknowledgedBy: Joi.string().required(),
      comment: Joi.string().max(500),
      estimatedResolution: Joi.date().iso().greater('now'),
      assignedTo: Joi.string()
    }).unknown(false)
  },

  /**
   * Validate resolve alert request
   */
  resolveAlert: {
    params: Joi.object({
      systemId: commonSchemas.systemId,
      alertId: commonSchemas.alertId
    }),
    body: Joi.object({
      resolvedBy: Joi.string().required(),
      resolution: Joi.string().max(1000).required(),
      rootCause: Joi.string().max(500),
      preventiveMeasures: Joi.array().items(Joi.string()),
      verificationSteps: Joi.array().items(Joi.string()),
      closeRelated: Joi.boolean().default(false)
    }).unknown(false)
  },

  /**
   * Validate get active alerts request
   */
  getActiveAlerts: {
    query: Joi.object({
      systemId: Joi.string().pattern(/^sys-[a-zA-Z0-9]{8,32}$/),
      severity: commonSchemas.alertSeverity,
      category: Joi.string(),
      acknowledged: Joi.boolean(),
      assignedTo: Joi.string(),
      createdAfter: Joi.date().iso(),
      sortBy: Joi.string().valid('severity', 'created', 'updated').default('severity'),
      ...commonSchemas.pagination
    }).unknown(false)
  },

  /**
   * Validate configure alert rules request
   */
  configureAlertRules: {
    params: Joi.object({
      systemId: commonSchemas.systemId
    }),
    body: Joi.object({
      rules: Joi.array().items(
        Joi.object({
          name: Joi.string().required(),
          enabled: Joi.boolean().default(true),
          condition: Joi.object({
            metric: Joi.string().required(),
            operator: Joi.string().valid('gt', 'gte', 'lt', 'lte', 'eq', 'neq').required(),
            threshold: Joi.number().required(),
            duration: Joi.number().min(0).default(60),
            aggregation: Joi.string().valid('avg', 'sum', 'min', 'max', 'count')
          }).required(),
          severity: commonSchemas.alertSeverity.required(),
          actions: Joi.array().items(
            Joi.object({
              type: Joi.string().required(),
              configuration: Joi.object()
            })
          ),
          cooldown: Joi.number().min(0).max(3600).default(300),
          metadata: Joi.object()
        })
      ).min(1).required()
    }).unknown(false)
  }
};

/**
 * System monitoring control validators
 */
const monitoringControlValidators = {
  /**
   * Validate start monitoring request
   */
  startMonitoring: {
    params: Joi.object({
      systemId: commonSchemas.systemId
    }),
    body: Joi.object({
      components: Joi.array().items(Joi.string()),
      metricsInterval: Joi.number().min(10).max(3600).default(60),
      logLevel: Joi.string().valid('error', 'warn', 'info', 'debug').default('info'),
      alertingEnabled: Joi.boolean().default(true),
      tracingEnabled: Joi.boolean().default(false)
    }).unknown(false)
  },

  /**
   * Validate update monitoring configuration request
   */
  updateMonitoringConfig: {
    params: Joi.object({
      systemId: commonSchemas.systemId
    }),
    body: Joi.object({
      metricsCollection: Joi.object({
        enabled: Joi.boolean(),
        interval: Joi.number().min(10).max(3600),
        retention: Joi.number().min(1).max(365),
        metrics: Joi.array().items(
          Joi.object({
            name: Joi.string().required(),
            enabled: Joi.boolean(),
            interval: Joi.number().min(10).max(3600)
          })
        )
      }),
      logging: Joi.object({
        enabled: Joi.boolean(),
        level: Joi.string().valid('error', 'warn', 'info', 'debug'),
        retention: Joi.number().min(1).max(365),
        format: Joi.string().valid('json', 'text', 'structured')
      }),
      alerting: Joi.object({
        enabled: Joi.boolean(),
        channels: Joi.array().items(
          Joi.object({
            type: Joi.string().required(),
            enabled: Joi.boolean(),
            configuration: Joi.object()
          })
        )
      }),
      tracing: Joi.object({
        enabled: Joi.boolean(),
        samplingRate: Joi.number().min(0).max(1),
        backend: Joi.string()
      })
    }).unknown(false).min(1)
  }
};

/**
 * System dashboard and reporting validators
 */
const dashboardReportingValidators = {
  /**
   * Validate get system dashboard request
   */
  getSystemDashboard: {
    params: Joi.object({
      systemId: commonSchemas.systemId
    }),
    query: Joi.object({
      timeRange: Joi.string().valid('1h', '6h', '24h', '7d', '30d').default('24h'),
      widgets: Joi.array().items(
        Joi.string().valid(
          'health',
          'metrics',
          'alerts',
          'performance',
          'resources',
          'services',
          'logs',
          'events'
        )
      ),
      refresh: Joi.boolean().default(false),
      layout: Joi.string().valid('default', 'compact', 'detailed').default('default')
    }).unknown(false)
  },

  /**
   * Validate create custom dashboard request
   */
  createCustomDashboard: {
    params: Joi.object({
      systemId: commonSchemas.systemId
    }),
    body: Joi.object({
      name: Joi.string().min(3).max(100).required(),
      description: Joi.string().max(500),
      layout: Joi.object({
        type: Joi.string().valid('grid', 'flow', 'tabs').default('grid'),
        columns: Joi.number().min(1).max(12).default(12),
        rows: Joi.number().min(1).max(100)
      }),
      widgets: Joi.array().items(
        Joi.object({
          id: Joi.string(),
          type: Joi.string().required(),
          title: Joi.string().required(),
          position: Joi.object({
            x: Joi.number().min(0).required(),
            y: Joi.number().min(0).required(),
            width: Joi.number().min(1).max(12).required(),
            height: Joi.number().min(1).max(10).required()
          }),
          configuration: Joi.object()
        })
      ).min(1).required(),
      refreshInterval: Joi.number().min(0).max(3600).default(60),
      permissions: Joi.object({
        public: Joi.boolean().default(false),
        sharedWith: Joi.array().items(Joi.string())
      }),
      metadata: Joi.object()
    }).unknown(false)
  },

  /**
   * Validate generate system report request
   */
  generateSystemReport: {
    params: Joi.object({
      systemId: commonSchemas.systemId
    }),
    body: Joi.object({
      reportType: Joi.string().valid(
        'health',
        'performance',
        'capacity',
        'security',
        'compliance',
        'executive'
      ).required(),
      timeRange: commonSchemas.timeRange,
      sections: Joi.array().items(Joi.string()),
      format: Joi.string().valid('pdf', 'html', 'json', 'csv', 'excel').default('pdf'),
      includeGraphs: Joi.boolean().default(true),
      includeRecommendations: Joi.boolean().default(true),
      recipients: Joi.array().items(Joi.string().email()),
      schedule: Joi.object({
        frequency: Joi.string().valid('once', 'daily', 'weekly', 'monthly'),
        time: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/),
        dayOfWeek: Joi.when('frequency', {
          is: 'weekly',
          then: Joi.number().min(0).max(6)
        }),
        dayOfMonth: Joi.when('frequency', {
          is: 'monthly',
          then: Joi.number().min(1).max(31)
        })
      })
    }).unknown(false)
  }
};

/**
 * Aggregated system operations validators
 */
const aggregatedSystemValidators = {
  /**
   * Validate get aggregated metrics request
   */
  getAggregatedMetrics: {
    query: Joi.object({
      systems: Joi.array().items(commonSchemas.systemId),
      metrics: Joi.array().items(Joi.string()).min(1).required(),
      timeRange: commonSchemas.timeRange,
      aggregation: Joi.string().valid('avg', 'sum', 'min', 'max', 'count').default('avg'),
      groupBy: Joi.string().valid('system', 'metric', 'time'),
      ...commonSchemas.pagination
    }).unknown(false)
  },

  /**
   * Validate get system overview request
   */
  getSystemOverview: {
    query: Joi.object({
      includeOffline: Joi.boolean().default(false),
      includeMetrics: Joi.boolean().default(true),
      includeAlerts: Joi.boolean().default(true),
      sortBy: Joi.string().valid('name', 'status', 'health', 'created').default('name')
    }).unknown(false)
  },

  /**
   * Validate perform benchmark request
   */
  performBenchmark: {
    body: Joi.object({
      benchmarkType: Joi.string().valid(
        'performance',
        'stress',
        'load',
        'endurance',
        'spike'
      ).required(),
      targets: Joi.array().items(commonSchemas.systemId).min(1).required(),
      configuration: Joi.object({
        duration: Joi.number().min(60).max(3600).required(),
        concurrency: Joi.number().min(1).max(1000).default(10),
        rampUp: Joi.number().min(0).max(300).default(30),
        metrics: Joi.array().items(Joi.string())
      }).required(),
      baseline: Joi.object({
        source: Joi.string().valid('previous', 'custom', 'industry').default('previous'),
        values: Joi.when('source', {
          is: 'custom',
          then: Joi.object().required()
        })
      }),
      notifications: Joi.array().items(Joi.string().email())
    }).unknown(false)
  }
};

/**
 * Combined system validators export
 */
const systemValidators = {
  ...systemInitializationValidators,
  ...systemHealthValidators,
  ...systemMetricsValidators,
  ...serviceManagementValidators,
  ...alertManagementValidators,
  ...monitoringControlValidators,
  ...dashboardReportingValidators,
  ...aggregatedSystemValidators
};

/**
 * Validation error handler
 */
const handleValidationError = (error, req, res) => {
  logger.warn('System validation error', {
    path: req.path,
    method: req.method,
    error: error.details,
    body: req.body,
    query: req.query,
    params: req.params
  });

  const errors = error.details.map(detail => ({
    field: detail.path.join('.'),
    message: detail.message,
    type: detail.type
  }));

  return res.status(StatusCodes.BAD_REQUEST).json({
    success: false,
    error: {
      code: ErrorCodes.VALIDATION_ERROR,
      message: 'Validation failed',
      details: errors
    }
  });
};

/**
 * Validation middleware factory
 */
const createValidator = (schema) => {
  return (req, res, next) => {
    const validationOptions = {
      abortEarly: false,
      allowUnknown: false,
      stripUnknown: true
    };

    // Validate params if schema exists
    if (schema.params) {
      const { error, value } = schema.params.validate(req.params, validationOptions);
      if (error) {
        return handleValidationError(error, req, res);
      }
      req.params = value;
    }

    // Validate query if schema exists
    if (schema.query) {
      const { error, value } = schema.query.validate(req.query, validationOptions);
      if (error) {
        return handleValidationError(error, req, res);
      }
      req.query = value;
    }

    // Validate body if schema exists
    if (schema.body) {
      const { error, value } = schema.body.validate(req.body, validationOptions);
      if (error) {
        return handleValidationError(error, req, res);
      }
      req.body = value;
    }

    next();
  };
};

// Export validators
module.exports = {
  systemValidators,
  createValidator,
  handleValidationError,
  commonSchemas,
  VALIDATION_MESSAGES
};