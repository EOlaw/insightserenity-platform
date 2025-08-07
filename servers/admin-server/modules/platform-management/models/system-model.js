'use strict';

/**
 * @fileoverview System health and monitoring model
 * @module servers/admin-server/modules/platform-management/models/system-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/helpers/date-helper
 */

const mongoose = require('mongoose');
const BaseModel = require('../../../../../shared/lib/database/models/base-model');
const logger = require('../../../../../shared/lib/utils/logger');
const { AppError } = require('../../../../../shared/lib/utils/app-error');
const dateHelper = require('../../../../../shared/lib/utils/helpers/date-helper');

/**
 * @typedef {Object} SystemMetric
 * @property {string} name - Metric name
 * @property {string} category - Metric category (cpu|memory|disk|network|custom)
 * @property {number} value - Current metric value
 * @property {string} unit - Measurement unit
 * @property {Date} timestamp - Collection timestamp
 * @property {Object} threshold - Alert thresholds
 * @property {number} threshold.warning - Warning threshold
 * @property {number} threshold.critical - Critical threshold
 * @property {Object} metadata - Additional metric metadata
 */

/**
 * @typedef {Object} ServiceHealth
 * @property {string} serviceName - Service identifier
 * @property {string} status - Health status (healthy|degraded|unhealthy|offline)
 * @property {number} uptime - Uptime in seconds
 * @property {Date} lastCheck - Last health check timestamp
 * @property {number} responseTime - Average response time in ms
 * @property {Object} endpoints - Individual endpoint health
 * @property {Object} dependencies - Dependency health status
 * @property {Array<Object>} errors - Recent errors
 */

/**
 * @typedef {Object} SystemAlert
 * @property {string} alertId - Alert identifier
 * @property {string} type - Alert type (metric|service|security|custom)
 * @property {string} severity - Alert severity (info|warning|error|critical)
 * @property {string} title - Alert title
 * @property {string} description - Detailed description
 * @property {string} source - Alert source
 * @property {Date} triggeredAt - When alert was triggered
 * @property {Date} acknowledgedAt - When alert was acknowledged
 * @property {Date} resolvedAt - When alert was resolved
 * @property {Object} context - Alert context data
 * @property {Array<Object>} actions - Actions taken
 */

/**
 * @typedef {Object} ResourceUsage
 * @property {Object} cpu - CPU usage metrics
 * @property {number} cpu.usage - CPU usage percentage
 * @property {number} cpu.cores - Number of cores
 * @property {Array<number>} cpu.loadAverage - Load average [1m, 5m, 15m]
 * @property {Object} memory - Memory usage metrics
 * @property {number} memory.used - Used memory in bytes
 * @property {number} memory.total - Total memory in bytes
 * @property {number} memory.percentage - Usage percentage
 * @property {Object} disk - Disk usage metrics
 * @property {Array<Object>} disk.volumes - Volume usage details
 * @property {Object} network - Network usage metrics
 * @property {number} network.bytesIn - Incoming bytes
 * @property {number} network.bytesOut - Outgoing bytes
 * @property {number} network.connections - Active connections
 */

/**
 * System health monitoring schema definition
 */
const systemSchema = BaseModel.createSchema({
  // System Identification
  systemId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    default: () => `SYS_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    description: 'Unique system instance identifier'
  },

  hostname: {
    type: String,
    required: true,
    trim: true,
    description: 'System hostname'
  },

  environment: {
    type: String,
    required: true,
    enum: ['development', 'staging', 'production', 'testing'],
    index: true,
    description: 'System environment'
  },

  region: {
    type: String,
    trim: true,
    description: 'Deployment region'
  },

  // System Information
  systemInfo: {
    os: {
      platform: {
        type: String,
        description: 'Operating system platform'
      },
      release: {
        type: String,
        description: 'OS release version'
      },
      arch: {
        type: String,
        description: 'System architecture'
      },
      hostname: {
        type: String,
        description: 'OS hostname'
      }
    },
    runtime: {
      name: {
        type: String,
        default: 'node',
        description: 'Runtime name'
      },
      version: {
        type: String,
        description: 'Runtime version'
      },
      uptime: {
        type: Number,
        default: 0,
        description: 'Runtime uptime in seconds'
      }
    },
    server: {
      type: {
        type: String,
        description: 'Server type (express|fastify|koa)'
      },
      version: {
        type: String,
        description: 'Server version'
      },
      port: {
        type: Number,
        description: 'Server port'
      }
    }
  },

  // Real-time Metrics
  metrics: {
    cpu: {
      usage: {
        type: Number,
        min: 0,
        max: 100,
        description: 'Current CPU usage percentage'
      },
      cores: {
        type: Number,
        min: 1,
        description: 'Number of CPU cores'
      },
      loadAverage: [{
        type: Number,
        description: 'Load average [1m, 5m, 15m]'
      }],
      processes: {
        type: Number,
        description: 'Number of running processes'
      }
    },
    memory: {
      used: {
        type: Number,
        min: 0,
        description: 'Used memory in bytes'
      },
      total: {
        type: Number,
        min: 0,
        description: 'Total memory in bytes'
      },
      percentage: {
        type: Number,
        min: 0,
        max: 100,
        description: 'Memory usage percentage'
      },
      heap: {
        used: {
          type: Number,
          description: 'Heap used in bytes'
        },
        total: {
          type: Number,
          description: 'Total heap size in bytes'
        }
      },
      rss: {
        type: Number,
        description: 'Resident set size'
      }
    },
    disk: {
      volumes: [{
        path: {
          type: String,
          description: 'Volume mount path'
        },
        filesystem: {
          type: String,
          description: 'Filesystem type'
        },
        used: {
          type: Number,
          description: 'Used space in bytes'
        },
        available: {
          type: Number,
          description: 'Available space in bytes'
        },
        total: {
          type: Number,
          description: 'Total space in bytes'
        },
        percentage: {
          type: Number,
          min: 0,
          max: 100,
          description: 'Usage percentage'
        }
      }],
      io: {
        reads: {
          type: Number,
          description: 'Disk read operations'
        },
        writes: {
          type: Number,
          description: 'Disk write operations'
        },
        readBytes: {
          type: Number,
          description: 'Bytes read'
        },
        writeBytes: {
          type: Number,
          description: 'Bytes written'
        }
      }
    },
    network: {
      interfaces: [{
        name: {
          type: String,
          description: 'Interface name'
        },
        address: {
          type: String,
          description: 'IP address'
        },
        mac: {
          type: String,
          description: 'MAC address'
        },
        bytesReceived: {
          type: Number,
          description: 'Total bytes received'
        },
        bytesSent: {
          type: Number,
          description: 'Total bytes sent'
        },
        packetsReceived: {
          type: Number,
          description: 'Total packets received'
        },
        packetsSent: {
          type: Number,
          description: 'Total packets sent'
        }
      }],
      connections: {
        active: {
          type: Number,
          description: 'Active connections'
        },
        established: {
          type: Number,
          description: 'Established connections'
        },
        listening: {
          type: Number,
          description: 'Listening ports'
        }
      },
      bandwidth: {
        inbound: {
          type: Number,
          description: 'Inbound bandwidth (bps)'
        },
        outbound: {
          type: Number,
          description: 'Outbound bandwidth (bps)'
        }
      }
    },
    custom: [{
      name: {
        type: String,
        required: true,
        description: 'Custom metric name'
      },
      value: {
        type: mongoose.Schema.Types.Mixed,
        required: true,
        description: 'Metric value'
      },
      unit: {
        type: String,
        description: 'Measurement unit'
      },
      category: {
        type: String,
        description: 'Metric category'
      },
      timestamp: {
        type: Date,
        default: Date.now,
        description: 'Collection timestamp'
      }
    }]
  },

  // Service Health Status
  services: [{
    serviceName: {
      type: String,
      required: true,
      description: 'Service identifier'
    },
    displayName: {
      type: String,
      description: 'Service display name'
    },
    type: {
      type: String,
      enum: ['api', 'database', 'cache', 'queue', 'storage', 'external', 'internal'],
      description: 'Service type'
    },
    status: {
      type: String,
      enum: ['healthy', 'degraded', 'unhealthy', 'offline', 'unknown'],
      default: 'unknown',
      description: 'Current health status'
    },
    uptime: {
      type: Number,
      default: 0,
      description: 'Service uptime in seconds'
    },
    lastCheck: {
      type: Date,
      default: Date.now,
      description: 'Last health check timestamp'
    },
    responseTime: {
      current: {
        type: Number,
        description: 'Current response time (ms)'
      },
      average: {
        type: Number,
        description: 'Average response time (ms)'
      },
      p95: {
        type: Number,
        description: '95th percentile response time'
      },
      p99: {
        type: Number,
        description: '99th percentile response time'
      }
    },
    endpoints: [{
      path: {
        type: String,
        description: 'Endpoint path'
      },
      method: {
        type: String,
        description: 'HTTP method'
      },
      status: {
        type: String,
        enum: ['healthy', 'degraded', 'unhealthy'],
        description: 'Endpoint health'
      },
      responseTime: {
        type: Number,
        description: 'Response time (ms)'
      },
      lastCheck: {
        type: Date,
        description: 'Last check timestamp'
      }
    }],
    dependencies: [{
      name: {
        type: String,
        description: 'Dependency name'
      },
      type: {
        type: String,
        description: 'Dependency type'
      },
      status: {
        type: String,
        enum: ['healthy', 'degraded', 'unhealthy'],
        description: 'Dependency status'
      },
      optional: {
        type: Boolean,
        default: false,
        description: 'Whether dependency is optional'
      }
    }],
    errors: [{
      timestamp: {
        type: Date,
        default: Date.now,
        description: 'Error timestamp'
      },
      message: {
        type: String,
        description: 'Error message'
      },
      code: {
        type: String,
        description: 'Error code'
      },
      count: {
        type: Number,
        default: 1,
        description: 'Error occurrence count'
      }
    }],
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
      description: 'Service-specific metadata'
    }
  }],

  // Active Alerts
  alerts: [{
    alertId: {
      type: String,
      default: () => `ALERT_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      description: 'Unique alert identifier'
    },
    type: {
      type: String,
      enum: ['metric', 'service', 'security', 'performance', 'availability', 'custom'],
      required: true,
      description: 'Alert type'
    },
    severity: {
      type: String,
      enum: ['info', 'warning', 'error', 'critical'],
      required: true,
      description: 'Alert severity'
    },
    title: {
      type: String,
      required: true,
      trim: true,
      description: 'Alert title'
    },
    description: {
      type: String,
      required: true,
      description: 'Detailed alert description'
    },
    source: {
      type: String,
      required: true,
      description: 'Alert source (service/component)'
    },
    metric: {
      name: {
        type: String,
        description: 'Related metric name'
      },
      value: {
        type: mongoose.Schema.Types.Mixed,
        description: 'Metric value that triggered alert'
      },
      threshold: {
        type: mongoose.Schema.Types.Mixed,
        description: 'Threshold that was exceeded'
      }
    },
    triggeredAt: {
      type: Date,
      default: Date.now,
      required: true,
      description: 'When alert was triggered'
    },
    acknowledgedAt: {
      type: Date,
      description: 'When alert was acknowledged'
    },
    acknowledgedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      description: 'User who acknowledged'
    },
    resolvedAt: {
      type: Date,
      description: 'When alert was resolved'
    },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      description: 'User who resolved'
    },
    autoResolved: {
      type: Boolean,
      default: false,
      description: 'Whether alert was auto-resolved'
    },
    context: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
      description: 'Alert context data'
    },
    actions: [{
      action: {
        type: String,
        description: 'Action taken'
      },
      timestamp: {
        type: Date,
        default: Date.now,
        description: 'Action timestamp'
      },
      performedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        description: 'User who performed action'
      },
      result: {
        type: String,
        description: 'Action result'
      }
    }],
    notifications: [{
      channel: {
        type: String,
        enum: ['email', 'sms', 'webhook', 'slack', 'pagerduty'],
        description: 'Notification channel'
      },
      sentAt: {
        type: Date,
        description: 'When notification was sent'
      },
      recipients: [{
        type: String,
        description: 'Notification recipients'
      }],
      status: {
        type: String,
        enum: ['sent', 'failed', 'pending'],
        description: 'Notification status'
      }
    }]
  }],

  // Performance Metrics
  performance: {
    requests: {
      total: {
        type: Number,
        default: 0,
        description: 'Total requests handled'
      },
      perSecond: {
        type: Number,
        default: 0,
        description: 'Requests per second'
      },
      averageResponseTime: {
        type: Number,
        description: 'Average response time (ms)'
      },
      statusCodes: {
        type: Map,
        of: Number,
        default: {},
        description: 'Response status code counts'
      }
    },
    database: {
      connections: {
        active: {
          type: Number,
          description: 'Active DB connections'
        },
        idle: {
          type: Number,
          description: 'Idle DB connections'
        },
        total: {
          type: Number,
          description: 'Total DB connections'
        }
      },
      queries: {
        total: {
          type: Number,
          default: 0,
          description: 'Total queries executed'
        },
        slow: {
          type: Number,
          default: 0,
          description: 'Slow query count'
        },
        failed: {
          type: Number,
          default: 0,
          description: 'Failed query count'
        },
        averageTime: {
          type: Number,
          description: 'Average query time (ms)'
        }
      }
    },
    cache: {
      hits: {
        type: Number,
        default: 0,
        description: 'Cache hits'
      },
      misses: {
        type: Number,
        default: 0,
        description: 'Cache misses'
      },
      hitRate: {
        type: Number,
        min: 0,
        max: 100,
        description: 'Cache hit rate percentage'
      },
      size: {
        type: Number,
        description: 'Cache size in bytes'
      },
      evictions: {
        type: Number,
        default: 0,
        description: 'Cache evictions'
      }
    },
    errors: {
      total: {
        type: Number,
        default: 0,
        description: 'Total errors'
      },
      rate: {
        type: Number,
        default: 0,
        description: 'Error rate percentage'
      },
      byType: {
        type: Map,
        of: Number,
        default: {},
        description: 'Error counts by type'
      },
      recent: [{
        timestamp: Date,
        type: String,
        message: String,
        stack: String,
        count: {
          type: Number,
          default: 1
        }
      }]
    }
  },

  // System Logs
  logs: {
    level: {
      type: String,
      enum: ['debug', 'info', 'warn', 'error'],
      default: 'info',
      description: 'Current log level'
    },
    retention: {
      days: {
        type: Number,
        default: 30,
        description: 'Log retention in days'
      },
      maxSize: {
        type: Number,
        description: 'Max log size in bytes'
      }
    },
    destinations: [{
      type: {
        type: String,
        enum: ['file', 'console', 'syslog', 'elasticsearch', 'cloudwatch'],
        description: 'Log destination type'
      },
      enabled: {
        type: Boolean,
        default: true,
        description: 'Whether destination is enabled'
      },
      configuration: {
        type: mongoose.Schema.Types.Mixed,
        description: 'Destination-specific config'
      }
    }],
    filters: [{
      name: {
        type: String,
        description: 'Filter name'
      },
      pattern: {
        type: String,
        description: 'Filter pattern'
      },
      action: {
        type: String,
        enum: ['include', 'exclude'],
        description: 'Filter action'
      }
    }]
  },

  // Monitoring Configuration
  monitoring: {
    enabled: {
      type: Boolean,
      default: true,
      description: 'Whether monitoring is enabled'
    },
    interval: {
      type: Number,
      default: 60,
      min: 10,
      description: 'Monitoring interval in seconds'
    },
    thresholds: {
      cpu: {
        warning: {
          type: Number,
          default: 70,
          description: 'CPU warning threshold %'
        },
        critical: {
          type: Number,
          default: 90,
          description: 'CPU critical threshold %'
        }
      },
      memory: {
        warning: {
          type: Number,
          default: 80,
          description: 'Memory warning threshold %'
        },
        critical: {
          type: Number,
          default: 95,
          description: 'Memory critical threshold %'
        }
      },
      disk: {
        warning: {
          type: Number,
          default: 80,
          description: 'Disk warning threshold %'
        },
        critical: {
          type: Number,
          default: 90,
          description: 'Disk critical threshold %'
        }
      },
      responseTime: {
        warning: {
          type: Number,
          default: 1000,
          description: 'Response time warning (ms)'
        },
        critical: {
          type: Number,
          default: 3000,
          description: 'Response time critical (ms)'
        }
      },
      errorRate: {
        warning: {
          type: Number,
          default: 5,
          description: 'Error rate warning %'
        },
        critical: {
          type: Number,
          default: 10,
          description: 'Error rate critical %'
        }
      }
    },
    alerting: {
      enabled: {
        type: Boolean,
        default: true,
        description: 'Whether alerting is enabled'
      },
      channels: [{
        type: {
          type: String,
          enum: ['email', 'sms', 'webhook', 'slack', 'pagerduty'],
          description: 'Alert channel type'
        },
        enabled: {
          type: Boolean,
          default: true,
          description: 'Whether channel is enabled'
        },
        configuration: {
          type: mongoose.Schema.Types.Mixed,
          description: 'Channel-specific config'
        },
        severities: [{
          type: String,
          enum: ['info', 'warning', 'error', 'critical'],
          description: 'Severities to alert on'
        }]
      }],
      rules: [{
        name: {
          type: String,
          description: 'Alert rule name'
        },
        condition: {
          type: String,
          description: 'Alert condition expression'
        },
        severity: {
          type: String,
          enum: ['info', 'warning', 'error', 'critical'],
          description: 'Alert severity'
        },
        cooldown: {
          type: Number,
          default: 300,
          description: 'Alert cooldown in seconds'
        }
      }]
    }
  },

  // Historical Data
  history: {
    metrics: [{
      timestamp: {
        type: Date,
        required: true,
        index: true,
        description: 'Metric collection timestamp'
      },
      cpu: {
        usage: Number,
        loadAverage: [Number]
      },
      memory: {
        used: Number,
        total: Number,
        percentage: Number
      },
      disk: {
        used: Number,
        total: Number,
        percentage: Number
      },
      network: {
        bytesIn: Number,
        bytesOut: Number
      },
      performance: {
        requestsPerSecond: Number,
        averageResponseTime: Number,
        errorRate: Number
      }
    }],
    retentionDays: {
      type: Number,
      default: 30,
      description: 'History retention in days'
    },
    aggregation: {
      enabled: {
        type: Boolean,
        default: true,
        description: 'Whether to aggregate old data'
      },
      intervals: [{
        age: {
          type: Number,
          description: 'Data age in days'
        },
        granularity: {
          type: String,
          enum: ['minute', 'hour', 'day'],
          description: 'Aggregation granularity'
        }
      }]
    }
  },

  // Metadata
  metadata: {
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      description: 'User who created the record'
    },
    tags: [{
      type: String,
      trim: true,
      lowercase: true,
      description: 'System tags'
    }],
    customFields: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
      description: 'Custom metadata fields'
    }
  },

  // Status
  status: {
    overall: {
      type: String,
      enum: ['healthy', 'degraded', 'unhealthy', 'offline'],
      default: 'healthy',
      description: 'Overall system status'
    },
    lastUpdate: {
      type: Date,
      default: Date.now,
      description: 'Last status update'
    },
    message: {
      type: String,
      description: 'Status message'
    }
  }
}, {
  collection: 'system_health',
  strict: true,
  timestamps: true
});

// Indexes
systemSchema.index({ systemId: 1 }, { unique: true });
systemSchema.index({ environment: 1, hostname: 1 });
systemSchema.index({ 'status.overall': 1 });
systemSchema.index({ 'alerts.severity': 1, 'alerts.resolvedAt': 1 });
systemSchema.index({ 'services.serviceName': 1 });
systemSchema.index({ 'history.metrics.timestamp': -1 });
systemSchema.index({ createdAt: -1 });

// Virtual properties
systemSchema.virtual('isHealthy').get(function() {
  return this.status.overall === 'healthy';
});

systemSchema.virtual('activeAlertCount').get(function() {
  return this.alerts.filter(alert => !alert.resolvedAt).length;
});

systemSchema.virtual('criticalAlertCount').get(function() {
  return this.alerts.filter(alert => 
    alert.severity === 'critical' && !alert.resolvedAt
  ).length;
});

systemSchema.virtual('uptimePercentage').get(function() {
  if (!this.systemInfo.runtime.uptime) return 0;
  
  const totalTime = (Date.now() - this.createdAt.getTime()) / 1000;
  return Math.min(100, (this.systemInfo.runtime.uptime / totalTime) * 100);
});

systemSchema.virtual('healthScore').get(function() {
  let score = 100;
  
  // Deduct for unhealthy services
  const unhealthyServices = this.services.filter(s => s.status === 'unhealthy').length;
  const degradedServices = this.services.filter(s => s.status === 'degraded').length;
  score -= unhealthyServices * 20;
  score -= degradedServices * 10;
  
  // Deduct for active alerts
  const criticalAlerts = this.alerts.filter(a => a.severity === 'critical' && !a.resolvedAt).length;
  const errorAlerts = this.alerts.filter(a => a.severity === 'error' && !a.resolvedAt).length;
  score -= criticalAlerts * 15;
  score -= errorAlerts * 5;
  
  // Deduct for resource usage
  if (this.metrics.cpu.usage > 90) score -= 10;
  if (this.metrics.memory.percentage > 90) score -= 10;
  if (this.metrics.disk.volumes.some(v => v.percentage > 90)) score -= 10;
  
  return Math.max(0, score);
});

// Instance methods
systemSchema.methods.updateMetrics = async function(newMetrics) {
  try {
    // Update current metrics
    Object.assign(this.metrics, newMetrics);
    
    // Add to history
    this.history.metrics.push({
      timestamp: new Date(),
      cpu: {
        usage: this.metrics.cpu.usage,
        loadAverage: this.metrics.cpu.loadAverage
      },
      memory: {
        used: this.metrics.memory.used,
        total: this.metrics.memory.total,
        percentage: this.metrics.memory.percentage
      },
      disk: {
        used: this.metrics.disk.volumes[0]?.used || 0,
        total: this.metrics.disk.volumes[0]?.total || 0,
        percentage: this.metrics.disk.volumes[0]?.percentage || 0
      },
      network: {
        bytesIn: this.metrics.network.interfaces[0]?.bytesReceived || 0,
        bytesOut: this.metrics.network.interfaces[0]?.bytesSent || 0
      },
      performance: {
        requestsPerSecond: this.performance.requests.perSecond,
        averageResponseTime: this.performance.requests.averageResponseTime,
        errorRate: this.performance.errors.rate
      }
    });
    
    // Trim history based on retention
    const cutoffDate = new Date(Date.now() - this.history.retentionDays * 24 * 60 * 60 * 1000);
    this.history.metrics = this.history.metrics.filter(m => m.timestamp > cutoffDate);
    
    // Check thresholds and create alerts
    await this.checkThresholds();
    
    // Update status
    this.updateSystemStatus();
    
    await this.save();
    
    logger.info('System metrics updated', {
      systemId: this.systemId,
      environment: this.environment,
      cpu: this.metrics.cpu.usage,
      memory: this.metrics.memory.percentage
    });
    
    return this;
  } catch (error) {
    logger.error('Failed to update system metrics', {
      systemId: this.systemId,
      error: error.message
    });
    throw new AppError(`Failed to update system metrics: ${error.message}`, 500);
  }
};

systemSchema.methods.checkThresholds = async function() {
  const thresholds = this.monitoring.thresholds;
  const alerts = [];
  
  // Check CPU threshold
  if (this.metrics.cpu.usage >= thresholds.cpu.critical) {
    alerts.push({
      type: 'metric',
      severity: 'critical',
      title: 'Critical CPU Usage',
      description: `CPU usage is at ${this.metrics.cpu.usage}%, exceeding critical threshold of ${thresholds.cpu.critical}%`,
      source: 'cpu',
      metric: {
        name: 'cpu.usage',
        value: this.metrics.cpu.usage,
        threshold: thresholds.cpu.critical
      }
    });
  } else if (this.metrics.cpu.usage >= thresholds.cpu.warning) {
    alerts.push({
      type: 'metric',
      severity: 'warning',
      title: 'High CPU Usage',
      description: `CPU usage is at ${this.metrics.cpu.usage}%, exceeding warning threshold of ${thresholds.cpu.warning}%`,
      source: 'cpu',
      metric: {
        name: 'cpu.usage',
        value: this.metrics.cpu.usage,
        threshold: thresholds.cpu.warning
      }
    });
  }
  
  // Check Memory threshold
  if (this.metrics.memory.percentage >= thresholds.memory.critical) {
    alerts.push({
      type: 'metric',
      severity: 'critical',
      title: 'Critical Memory Usage',
      description: `Memory usage is at ${this.metrics.memory.percentage}%, exceeding critical threshold of ${thresholds.memory.critical}%`,
      source: 'memory',
      metric: {
        name: 'memory.percentage',
        value: this.metrics.memory.percentage,
        threshold: thresholds.memory.critical
      }
    });
  } else if (this.metrics.memory.percentage >= thresholds.memory.warning) {
    alerts.push({
      type: 'metric',
      severity: 'warning',
      title: 'High Memory Usage',
      description: `Memory usage is at ${this.metrics.memory.percentage}%, exceeding warning threshold of ${thresholds.memory.warning}%`,
      source: 'memory',
      metric: {
        name: 'memory.percentage',
        value: this.metrics.memory.percentage,
        threshold: thresholds.memory.warning
      }
    });
  }
  
  // Check Disk thresholds
  for (const volume of this.metrics.disk.volumes) {
    if (volume.percentage >= thresholds.disk.critical) {
      alerts.push({
        type: 'metric',
        severity: 'critical',
        title: 'Critical Disk Usage',
        description: `Disk usage on ${volume.path} is at ${volume.percentage}%, exceeding critical threshold of ${thresholds.disk.critical}%`,
        source: 'disk',
        metric: {
          name: 'disk.percentage',
          value: volume.percentage,
          threshold: thresholds.disk.critical
        },
        context: { volume: volume.path }
      });
    } else if (volume.percentage >= thresholds.disk.warning) {
      alerts.push({
        type: 'metric',
        severity: 'warning',
        title: 'High Disk Usage',
        description: `Disk usage on ${volume.path} is at ${volume.percentage}%, exceeding warning threshold of ${thresholds.disk.warning}%`,
        source: 'disk',
        metric: {
          name: 'disk.percentage',
          value: volume.percentage,
          threshold: thresholds.disk.warning
        },
        context: { volume: volume.path }
      });
    }
  }
  
  // Create new alerts or update existing ones
  for (const alertData of alerts) {
    const existingAlert = this.alerts.find(a => 
      a.type === alertData.type &&
      a.source === alertData.source &&
      !a.resolvedAt &&
      JSON.stringify(a.context) === JSON.stringify(alertData.context || {})
    );
    
    if (!existingAlert) {
      this.alerts.push(alertData);
    }
  }
  
  // Auto-resolve alerts that no longer meet threshold
  for (const alert of this.alerts) {
    if (alert.type === 'metric' && !alert.resolvedAt) {
      let shouldResolve = false;
      
      switch (alert.source) {
        case 'cpu':
          shouldResolve = this.metrics.cpu.usage < thresholds.cpu.warning;
          break;
        case 'memory':
          shouldResolve = this.metrics.memory.percentage < thresholds.memory.warning;
          break;
        case 'disk':
          const volume = this.metrics.disk.volumes.find(v => v.path === alert.context?.volume);
          shouldResolve = !volume || volume.percentage < thresholds.disk.warning;
          break;
      }
      
      if (shouldResolve) {
        alert.resolvedAt = new Date();
        alert.autoResolved = true;
      }
    }
  }
};

systemSchema.methods.updateServiceHealth = async function(serviceName, healthData) {
  try {
    let service = this.services.find(s => s.serviceName === serviceName);
    
    if (!service) {
      service = {
        serviceName,
        displayName: healthData.displayName || serviceName,
        type: healthData.type || 'internal',
        lastCheck: new Date()
      };
      this.services.push(service);
    }
    
    // Update service health data
    Object.assign(service, {
      status: healthData.status || 'unknown',
      uptime: healthData.uptime || service.uptime || 0,
      lastCheck: new Date(),
      responseTime: healthData.responseTime || service.responseTime,
      endpoints: healthData.endpoints || service.endpoints,
      dependencies: healthData.dependencies || service.dependencies,
      metadata: { ...service.metadata, ...healthData.metadata }
    });
    
    // Track errors
    if (healthData.error) {
      const existingError = service.errors.find(e => 
        e.message === healthData.error.message && 
        e.code === healthData.error.code
      );
      
      if (existingError) {
        existingError.count++;
        existingError.timestamp = new Date();
      } else {
        service.errors.push({
          timestamp: new Date(),
          message: healthData.error.message,
          code: healthData.error.code,
          count: 1
        });
        
        // Keep only last 100 errors
        if (service.errors.length > 100) {
          service.errors = service.errors.slice(-100);
        }
      }
    }
    
    // Create alert if service is unhealthy
    if (service.status === 'unhealthy' || service.status === 'offline') {
      const existingAlert = this.alerts.find(a => 
        a.type === 'service' &&
        a.source === serviceName &&
        !a.resolvedAt
      );
      
      if (!existingAlert) {
        this.alerts.push({
          type: 'service',
          severity: service.status === 'offline' ? 'critical' : 'error',
          title: `Service ${service.displayName} is ${service.status}`,
          description: healthData.error?.message || `Service ${service.displayName} is reporting ${service.status} status`,
          source: serviceName,
          context: {
            responseTime: service.responseTime,
            dependencies: service.dependencies?.filter(d => d.status !== 'healthy')
          }
        });
      }
    } else {
      // Auto-resolve service alerts
      const serviceAlerts = this.alerts.filter(a => 
        a.type === 'service' &&
        a.source === serviceName &&
        !a.resolvedAt
      );
      
      for (const alert of serviceAlerts) {
        alert.resolvedAt = new Date();
        alert.autoResolved = true;
      }
    }
    
    // Update overall system status
    this.updateSystemStatus();
    
    await this.save();
    
    logger.info('Service health updated', {
      systemId: this.systemId,
      serviceName,
      status: service.status
    });
    
    return service;
  } catch (error) {
    logger.error('Failed to update service health', {
      systemId: this.systemId,
      serviceName,
      error: error.message
    });
    throw new AppError(`Failed to update service health: ${error.message}`, 500);
  }
};

systemSchema.methods.createAlert = async function(alertData) {
  try {
    const alert = {
      alertId: `ALERT_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...alertData,
      triggeredAt: new Date()
    };
    
    // Check for duplicate active alerts
    const existingAlert = this.alerts.find(a => 
      a.type === alert.type &&
      a.source === alert.source &&
      a.title === alert.title &&
      !a.resolvedAt
    );
    
    if (existingAlert) {
      throw new AppError('Similar alert already exists', 409);
    }
    
    this.alerts.push(alert);
    
    // Send notifications if enabled
    if (this.monitoring.alerting.enabled) {
      await this.sendAlertNotifications(alert);
    }
    
    await this.save();
    
    logger.info('Alert created', {
      systemId: this.systemId,
      alertId: alert.alertId,
      type: alert.type,
      severity: alert.severity
    });
    
    return alert;
  } catch (error) {
    logger.error('Failed to create alert', {
      systemId: this.systemId,
      error: error.message
    });
    throw error instanceof AppError ? error : new AppError(`Failed to create alert: ${error.message}`, 500);
  }
};

systemSchema.methods.acknowledgeAlert = async function(alertId, userId) {
  try {
    const alert = this.alerts.find(a => a.alertId === alertId);
    
    if (!alert) {
      throw new AppError('Alert not found', 404);
    }
    
    if (alert.acknowledgedAt) {
      throw new AppError('Alert already acknowledged', 400);
    }
    
    alert.acknowledgedAt = new Date();
    alert.acknowledgedBy = userId;
    
    await this.save();
    
    logger.info('Alert acknowledged', {
      systemId: this.systemId,
      alertId,
      userId
    });
    
    return alert;
  } catch (error) {
    logger.error('Failed to acknowledge alert', {
      systemId: this.systemId,
      alertId,
      error: error.message
    });
    throw error instanceof AppError ? error : new AppError(`Failed to acknowledge alert: ${error.message}`, 500);
  }
};

systemSchema.methods.resolveAlert = async function(alertId, resolution) {
  try {
    const alert = this.alerts.find(a => a.alertId === alertId);
    
    if (!alert) {
      throw new AppError('Alert not found', 404);
    }
    
    if (alert.resolvedAt) {
      throw new AppError('Alert already resolved', 400);
    }
    
    alert.resolvedAt = new Date();
    alert.resolvedBy = resolution.userId;
    alert.actions.push({
      action: 'resolved',
      timestamp: new Date(),
      performedBy: resolution.userId,
      result: resolution.notes || 'Alert resolved'
    });
    
    // Update system status
    this.updateSystemStatus();
    
    await this.save();
    
    logger.info('Alert resolved', {
      systemId: this.systemId,
      alertId,
      userId: resolution.userId
    });
    
    return alert;
  } catch (error) {
    logger.error('Failed to resolve alert', {
      systemId: this.systemId,
      alertId,
      error: error.message
    });
    throw error instanceof AppError ? error : new AppError(`Failed to resolve alert: ${error.message}`, 500);
  }
};

systemSchema.methods.getMetricsHistory = async function(options = {}) {
  const {
    startDate = new Date(Date.now() - 24 * 60 * 60 * 1000),
    endDate = new Date(),
    granularity = 'hour',
    metrics = ['cpu', 'memory', 'disk', 'network']
  } = options;
  
  const history = this.history.metrics.filter(m => 
    m.timestamp >= startDate && m.timestamp <= endDate
  );
  
  if (granularity === 'raw') {
    return history;
  }
  
  // Aggregate data based on granularity
  const aggregated = {};
  const granularityMs = {
    minute: 60 * 1000,
    hour: 60 * 60 * 1000,
    day: 24 * 60 * 60 * 1000
  }[granularity];
  
  history.forEach(metric => {
    const bucket = Math.floor(metric.timestamp.getTime() / granularityMs) * granularityMs;
    
    if (!aggregated[bucket]) {
      aggregated[bucket] = {
        timestamp: new Date(bucket),
        count: 0,
        cpu: { usage: 0, loadAverage: [0, 0, 0] },
        memory: { used: 0, total: 0, percentage: 0 },
        disk: { used: 0, total: 0, percentage: 0 },
        network: { bytesIn: 0, bytesOut: 0 }
      };
    }
    
    const agg = aggregated[bucket];
    agg.count++;
    
    // Aggregate values
    if (metrics.includes('cpu') && metric.cpu) {
      agg.cpu.usage += metric.cpu.usage;
      metric.cpu.loadAverage?.forEach((load, i) => {
        agg.cpu.loadAverage[i] += load;
      });
    }
    
    if (metrics.includes('memory') && metric.memory) {
      agg.memory.used += metric.memory.used;
      agg.memory.total = metric.memory.total; // Take last value
      agg.memory.percentage += metric.memory.percentage;
    }
    
    if (metrics.includes('disk') && metric.disk) {
      agg.disk.used += metric.disk.used;
      agg.disk.total = metric.disk.total; // Take last value
      agg.disk.percentage += metric.disk.percentage;
    }
    
    if (metrics.includes('network') && metric.network) {
      agg.network.bytesIn += metric.network.bytesIn;
      agg.network.bytesOut += metric.network.bytesOut;
    }
  });
  
  // Calculate averages
  return Object.values(aggregated).map(agg => {
    const result = { timestamp: agg.timestamp };
    
    if (metrics.includes('cpu')) {
      result.cpu = {
        usage: agg.cpu.usage / agg.count,
        loadAverage: agg.cpu.loadAverage.map(load => load / agg.count)
      };
    }
    
    if (metrics.includes('memory')) {
      result.memory = {
        used: agg.memory.used / agg.count,
        total: agg.memory.total,
        percentage: agg.memory.percentage / agg.count
      };
    }
    
    if (metrics.includes('disk')) {
      result.disk = {
        used: agg.disk.used / agg.count,
        total: agg.disk.total,
        percentage: agg.disk.percentage / agg.count
      };
    }
    
    if (metrics.includes('network')) {
      result.network = {
        bytesIn: agg.network.bytesIn / agg.count,
        bytesOut: agg.network.bytesOut / agg.count
      };
    }
    
    return result;
  }).sort((a, b) => a.timestamp - b.timestamp);
};

systemSchema.methods.updateSystemStatus = function() {
  const unhealthyServices = this.services.filter(s => s.status === 'unhealthy' || s.status === 'offline').length;
  const degradedServices = this.services.filter(s => s.status === 'degraded').length;
  const criticalAlerts = this.alerts.filter(a => a.severity === 'critical' && !a.resolvedAt).length;
  const errorAlerts = this.alerts.filter(a => a.severity === 'error' && !a.resolvedAt).length;
  
  if (criticalAlerts > 0 || unhealthyServices > 0) {
    this.status.overall = 'unhealthy';
    this.status.message = `${criticalAlerts} critical alerts, ${unhealthyServices} unhealthy services`;
  } else if (errorAlerts > 0 || degradedServices > 0) {
    this.status.overall = 'degraded';
    this.status.message = `${errorAlerts} error alerts, ${degradedServices} degraded services`;
  } else {
    this.status.overall = 'healthy';
    this.status.message = 'All systems operational';
  }
  
  this.status.lastUpdate = new Date();
};

systemSchema.methods.sendAlertNotifications = async function(alert) {
  const channels = this.monitoring.alerting.channels.filter(c => 
    c.enabled && c.severities.includes(alert.severity)
  );
  
  for (const channel of channels) {
    try {
      // This is a placeholder - in production, implement actual notification sending
      logger.info('Sending alert notification', {
        systemId: this.systemId,
        alertId: alert.alertId,
        channel: channel.type
      });
      
      alert.notifications.push({
        channel: channel.type,
        sentAt: new Date(),
        recipients: channel.configuration.recipients || [],
        status: 'sent'
      });
    } catch (error) {
      logger.error('Failed to send alert notification', {
        systemId: this.systemId,
        alertId: alert.alertId,
        channel: channel.type,
        error: error.message
      });
      
      alert.notifications.push({
        channel: channel.type,
        sentAt: new Date(),
        recipients: channel.configuration.recipients || [],
        status: 'failed'
      });
    }
  }
};

// Static methods
systemSchema.statics.findByEnvironment = function(environment) {
  return this.find({ environment });
};

systemSchema.statics.findUnhealthy = function() {
  return this.find({
    'status.overall': { $in: ['unhealthy', 'degraded'] }
  });
};

systemSchema.statics.findWithActiveAlerts = function(severity) {
  const query = {
    'alerts': {
      $elemMatch: {
        resolvedAt: { $exists: false }
      }
    }
  };
  
  if (severity) {
    query.alerts.$elemMatch.severity = severity;
  }
  
  return this.find(query);
};

systemSchema.statics.getAggregatedMetrics = async function(options = {}) {
  const {
    environment,
    startDate = new Date(Date.now() - 24 * 60 * 60 * 1000),
    endDate = new Date()
  } = options;
  
  const matchQuery = {
    'history.metrics.timestamp': {
      $gte: startDate,
      $lte: endDate
    }
  };
  
  if (environment) {
    matchQuery.environment = environment;
  }
  
  return this.aggregate([
    { $match: matchQuery },
    { $unwind: '$history.metrics' },
    {
      $match: {
        'history.metrics.timestamp': {
          $gte: startDate,
          $lte: endDate
        }
      }
    },
    {
      $group: {
        _id: {
          hour: { $hour: '$history.metrics.timestamp' },
          day: { $dayOfMonth: '$history.metrics.timestamp' }
        },
        avgCpu: { $avg: '$history.metrics.cpu.usage' },
        avgMemory: { $avg: '$history.metrics.memory.percentage' },
        avgResponseTime: { $avg: '$history.metrics.performance.averageResponseTime' },
        totalRequests: { $sum: '$history.metrics.performance.requestsPerSecond' }
      }
    },
    { $sort: { '_id.day': 1, '_id.hour': 1 } }
  ]);
};

// Middleware
systemSchema.pre('save', function(next) {
  // Clean up old history data based on retention
  if (this.history.metrics.length > 0) {
    const cutoffDate = new Date(Date.now() - this.history.retentionDays * 24 * 60 * 60 * 1000);
    this.history.metrics = this.history.metrics.filter(m => m.timestamp > cutoffDate);
  }
  
  // Update system status
  this.updateSystemStatus();
  
  next();
});

systemSchema.post('save', function(doc) {
  logger.debug('System health data saved', {
    systemId: doc.systemId,
    environment: doc.environment,
    status: doc.status.overall
  });
});

// Create model
const SystemModel = BaseModel.createModel('System', systemSchema);

// Export
module.exports = SystemModel;