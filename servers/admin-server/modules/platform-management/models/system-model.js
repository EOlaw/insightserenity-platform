'use strict';

/**
 * @fileoverview System resources and monitoring model
 * @module servers/admin-server/modules/platform-management/models/system-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 */

const mongoose = require('mongoose');
const BaseModel = require('../../../../../shared/lib/database/models/base-model');
const logger = require('../../../../../shared/lib/utils/logger');

/**
 * System monitoring schema definition
 */
const systemSchemaDefinition = {
  // System Identity
  nodeId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },

  hostname: {
    type: String,
    required: true
  },

  nodeType: {
    type: String,
    enum: ['api', 'worker', 'database', 'cache', 'gateway', 'admin'],
    required: true,
    index: true
  },

  // System Information
  systemInfo: {
    platform: String,
    release: String,
    arch: String,
    cpuCount: Number,
    totalMemory: Number, // bytes
    nodeVersion: String,
    processId: Number,
    startTime: Date
  },

  // Resource Metrics
  resources: {
    cpu: {
      usage: {
        type: Number,
        min: 0,
        max: 100
      },
      loadAverage: [Number],
      processTime: Number
    },
    memory: {
      total: Number,
      used: Number,
      free: Number,
      heapTotal: Number,
      heapUsed: Number,
      external: Number,
      rss: Number
    },
    disk: {
      total: Number,
      used: Number,
      free: Number,
      partitions: [{
        mount: String,
        total: Number,
        used: Number,
        free: Number,
        percentage: Number
      }]
    },
    network: {
      interfaces: [{
        name: String,
        bytesReceived: Number,
        bytesSent: Number,
        packetsReceived: Number,
        packetsSent: Number,
        errors: Number
      }],
      connections: {
        active: Number,
        established: Number,
        timeWait: Number,
        closeWait: Number
      }
    }
  },

  // Service Metrics
  services: {
    database: {
      connected: Boolean,
      connections: {
        active: Number,
        idle: Number,
        total: Number
      },
      queryStats: {
        total: Number,
        slow: Number,
        failed: Number,
        avgResponseTime: Number
      },
      replication: {
        enabled: Boolean,
        lag: Number,
        status: String
      }
    },
    cache: {
      connected: Boolean,
      hitRate: Number,
      missRate: Number,
      evictions: Number,
      memoryUsage: Number,
      keys: Number
    },
    queue: {
      connected: Boolean,
      jobs: {
        active: Number,
        waiting: Number,
        completed: Number,
        failed: Number,
        delayed: Number
      },
      throughput: Number
    },
    api: {
      requests: {
        total: Number,
        success: Number,
        errors: Number,
        rateLimit: Number
      },
      responseTime: {
        avg: Number,
        p50: Number,
        p95: Number,
        p99: Number
      },
      endpoints: [{
        path: String,
        method: String,
        calls: Number,
        avgTime: Number,
        errors: Number
      }]
    }
  },

  // Process Information
  process: {
    pid: Number,
    ppid: Number,
    uptime: Number, // seconds
    restarts: Number,
    handles: Number,
    threads: Number,
    gcStats: {
      collections: Number,
      pauseTime: Number,
      lastGC: Date
    }
  },

  // Health Status
  health: {
    status: {
      type: String,
      enum: ['healthy', 'warning', 'critical', 'unknown'],
      default: 'unknown',
      index: true
    },
    checks: [{
      name: String,
      status: String,
      message: String,
      lastCheck: Date,
      duration: Number
    }],
    score: {
      type: Number,
      min: 0,
      max: 100,
      default: 100
    }
  },

  // Alerts and Thresholds
  alerts: {
    active: [{
      type: String,
      severity: String,
      message: String,
      threshold: mongoose.Schema.Types.Mixed,
      value: mongoose.Schema.Types.Mixed,
      triggeredAt: Date
    }],
    thresholds: {
      cpu: {
        warning: { type: Number, default: 70 },
        critical: { type: Number, default: 90 }
      },
      memory: {
        warning: { type: Number, default: 80 },
        critical: { type: Number, default: 95 }
      },
      disk: {
        warning: { type: Number, default: 80 },
        critical: { type: Number, default: 90 }
      },
      responseTime: {
        warning: { type: Number, default: 1000 },
        critical: { type: Number, default: 5000 }
      }
    }
  },

  // Logs and Events
  recentLogs: [{
    level: String,
    message: String,
    timestamp: Date,
    metadata: mongoose.Schema.Types.Mixed
  }],

  events: [{
    type: String,
    description: String,
    severity: String,
    timestamp: Date,
    metadata: mongoose.Schema.Types.Mixed
  }],

  // Monitoring Configuration
  monitoring: {
    enabled: {
      type: Boolean,
      default: true
    },
    interval: {
      type: Number,
      default: 60 // seconds
    },
    retention: {
      type: Number,
      default: 7 // days
    },
    exporters: [{
      type: String,
      endpoint: String,
      enabled: Boolean
    }]
  },

  // Last Update
  lastUpdated: {
    type: Date,
    default: Date.now,
    index: true
  },

  lastReportedBy: String
};

// Create schema
const systemSchema = BaseModel.createSchema(systemSchemaDefinition, {
  collection: 'system_metrics',
  timestamps: true
});

// Indexes
systemSchema.index({ nodeType: 1, 'health.status': 1 });
systemSchema.index({ lastUpdated: -1 });
systemSchema.index({ 'resources.cpu.usage': -1 });
systemSchema.index({ 'resources.memory.used': -1 });

// TTL index for automatic cleanup
systemSchema.index(
  { lastUpdated: 1 }, 
  { expireAfterSeconds: 604800 } // 7 days
);

// Virtual fields
systemSchema.virtual('memoryUsagePercentage').get(function() {
  if (!this.resources.memory.total) return 0;
  return (this.resources.memory.used / this.resources.memory.total) * 100;
});

systemSchema.virtual('diskUsagePercentage').get(function() {
  if (!this.resources.disk.total) return 0;
  return (this.resources.disk.used / this.resources.disk.total) * 100;
});

systemSchema.virtual('uptimeHours').get(function() {
  return this.process.uptime ? this.process.uptime / 3600 : 0;
});

// Instance methods
systemSchema.methods.updateMetrics = async function(metrics) {
  Object.assign(this.resources, metrics.resources || {});
  Object.assign(this.services, metrics.services || {});
  Object.assign(this.process, metrics.process || {});
  
  this.lastUpdated = new Date();
  
  // Check thresholds and create alerts
  this.checkThresholds();
  
  // Calculate health score
  this.calculateHealthScore();
  
  await this.save();
  
  return this;
};

systemSchema.methods.checkThresholds = function() {
  const alerts = [];
  const { thresholds } = this.alerts;
  
  // CPU check
  if (this.resources.cpu.usage >= thresholds.cpu.critical) {
    alerts.push({
      type: 'cpu',
      severity: 'critical',
      message: `CPU usage critical: ${this.resources.cpu.usage}%`,
      threshold: thresholds.cpu.critical,
      value: this.resources.cpu.usage,
      triggeredAt: new Date()
    });
  } else if (this.resources.cpu.usage >= thresholds.cpu.warning) {
    alerts.push({
      type: 'cpu',
      severity: 'warning',
      message: `CPU usage high: ${this.resources.cpu.usage}%`,
      threshold: thresholds.cpu.warning,
      value: this.resources.cpu.usage,
      triggeredAt: new Date()
    });
  }
  
  // Memory check
  const memoryPercentage = this.memoryUsagePercentage;
  if (memoryPercentage >= thresholds.memory.critical) {
    alerts.push({
      type: 'memory',
      severity: 'critical',
      message: `Memory usage critical: ${memoryPercentage.toFixed(1)}%`,
      threshold: thresholds.memory.critical,
      value: memoryPercentage,
      triggeredAt: new Date()
    });
  } else if (memoryPercentage >= thresholds.memory.warning) {
    alerts.push({
      type: 'memory',
      severity: 'warning',
      message: `Memory usage high: ${memoryPercentage.toFixed(1)}%`,
      threshold: thresholds.memory.warning,
      value: memoryPercentage,
      triggeredAt: new Date()
    });
  }
  
  // Disk check
  const diskPercentage = this.diskUsagePercentage;
  if (diskPercentage >= thresholds.disk.critical) {
    alerts.push({
      type: 'disk',
      severity: 'critical',
      message: `Disk usage critical: ${diskPercentage.toFixed(1)}%`,
      threshold: thresholds.disk.critical,
      value: diskPercentage,
      triggeredAt: new Date()
    });
  } else if (diskPercentage >= thresholds.disk.warning) {
    alerts.push({
      type: 'disk',
      severity: 'warning',
      message: `Disk usage high: ${diskPercentage.toFixed(1)}%`,
      threshold: thresholds.disk.warning,
      value: diskPercentage,
      triggeredAt: new Date()
    });
  }
  
  this.alerts.active = alerts;
};

systemSchema.methods.calculateHealthScore = function() {
  let score = 100;
  const weights = {
    cpu: 30,
    memory: 30,
    disk: 20,
    services: 20
  };
  
  // CPU score
  if (this.resources.cpu.usage > 90) {
    score -= weights.cpu;
  } else if (this.resources.cpu.usage > 70) {
    score -= weights.cpu * 0.5;
  }
  
  // Memory score
  const memoryUsage = this.memoryUsagePercentage;
  if (memoryUsage > 95) {
    score -= weights.memory;
  } else if (memoryUsage > 80) {
    score -= weights.memory * 0.5;
  }
  
  // Disk score
  const diskUsage = this.diskUsagePercentage;
  if (diskUsage > 90) {
    score -= weights.disk;
  } else if (diskUsage > 80) {
    score -= weights.disk * 0.5;
  }
  
  // Services score
  const serviceCount = Object.keys(this.services).length;
  const healthyServices = Object.values(this.services).filter(s => s.connected).length;
  if (serviceCount > 0) {
    const serviceHealth = healthyServices / serviceCount;
    score -= weights.services * (1 - serviceHealth);
  }
  
  this.health.score = Math.max(0, Math.round(score));
  
  // Update status based on score
  if (this.health.score >= 80) {
    this.health.status = 'healthy';
  } else if (this.health.score >= 50) {
    this.health.status = 'warning';
  } else {
    this.health.status = 'critical';
  }
};

systemSchema.methods.addEvent = async function(eventData) {
  this.events.push({
    type: eventData.type,
    description: eventData.description,
    severity: eventData.severity || 'info',
    timestamp: new Date(),
    metadata: eventData.metadata
  });
  
  // Keep only last 100 events
  if (this.events.length > 100) {
    this.events = this.events.slice(-100);
  }
  
  await this.save();
  
  return this.events[this.events.length - 1];
};

systemSchema.methods.addLog = async function(logData) {
  this.recentLogs.push({
    level: logData.level,
    message: logData.message,
    timestamp: new Date(),
    metadata: logData.metadata
  });
  
  // Keep only last 50 logs
  if (this.recentLogs.length > 50) {
    this.recentLogs = this.recentLogs.slice(-50);
  }
  
  await this.save();
};

// Static methods
systemSchema.statics.registerNode = async function(nodeData) {
  const node = await this.findOneAndUpdate(
    { nodeId: nodeData.nodeId },
    {
      $set: {
        hostname: nodeData.hostname,
        nodeType: nodeData.nodeType,
        systemInfo: nodeData.systemInfo,
        'process.pid': nodeData.pid,
        'process.startTime': new Date()
      }
    },
    { upsert: true, new: true }
  );
  
  logger.info('System node registered', {
    nodeId: node.nodeId,
    hostname: node.hostname,
    nodeType: node.nodeType
  });
  
  return node;
};

systemSchema.statics.getClusterHealth = async function() {
  const nodes = await this.find({ 
    lastUpdated: { $gte: new Date(Date.now() - 300000) } // Active in last 5 minutes
  });
  
  const clusterHealth = {
    totalNodes: nodes.length,
    healthyNodes: nodes.filter(n => n.health.status === 'healthy').length,
    warningNodes: nodes.filter(n => n.health.status === 'warning').length,
    criticalNodes: nodes.filter(n => n.health.status === 'critical').length,
    nodesByType: {},
    aggregateMetrics: {
      cpu: {
        avg: 0,
        max: 0
      },
      memory: {
        avg: 0,
        max: 0
      },
      disk: {
        avg: 0,
        max: 0
      }
    },
    alerts: []
  };
  
  // Aggregate by node type
  nodes.forEach(node => {
    if (!clusterHealth.nodesByType[node.nodeType]) {
      clusterHealth.nodesByType[node.nodeType] = {
        total: 0,
        healthy: 0,
        warning: 0,
        critical: 0
      };
    }
    
    clusterHealth.nodesByType[node.nodeType].total++;
    clusterHealth.nodesByType[node.nodeType][node.health.status]++;
    
    // Aggregate metrics
    clusterHealth.aggregateMetrics.cpu.avg += node.resources.cpu.usage || 0;
    clusterHealth.aggregateMetrics.cpu.max = Math.max(
      clusterHealth.aggregateMetrics.cpu.max,
      node.resources.cpu.usage || 0
    );
    
    const memUsage = node.memoryUsagePercentage;
    clusterHealth.aggregateMetrics.memory.avg += memUsage;
    clusterHealth.aggregateMetrics.memory.max = Math.max(
      clusterHealth.aggregateMetrics.memory.max,
      memUsage
    );
    
    const diskUsage = node.diskUsagePercentage;
    clusterHealth.aggregateMetrics.disk.avg += diskUsage;
    clusterHealth.aggregateMetrics.disk.max = Math.max(
      clusterHealth.aggregateMetrics.disk.max,
      diskUsage
    );
    
    // Collect active alerts
    clusterHealth.alerts.push(...node.alerts.active.map(alert => ({
      ...alert,
      nodeId: node.nodeId,
      hostname: node.hostname
    })));
  });
  
  // Calculate averages
  if (nodes.length > 0) {
    clusterHealth.aggregateMetrics.cpu.avg /= nodes.length;
    clusterHealth.aggregateMetrics.memory.avg /= nodes.length;
    clusterHealth.aggregateMetrics.disk.avg /= nodes.length;
  }
  
  // Overall cluster status
  if (clusterHealth.criticalNodes > 0) {
    clusterHealth.status = 'critical';
  } else if (clusterHealth.warningNodes > clusterHealth.healthyNodes) {
    clusterHealth.status = 'warning';
  } else {
    clusterHealth.status = 'healthy';
  }
  
  return clusterHealth;
};

systemSchema.statics.getResourceTrends = async function(nodeId, duration = 3600000) {
  // This would typically query time-series data
  // For now, return mock trend data
  const endTime = new Date();
  const startTime = new Date(endTime - duration);
  
  return {
    nodeId,
    period: {
      start: startTime,
      end: endTime
    },
    trends: {
      cpu: [],
      memory: [],
      disk: [],
      network: {
        bytesIn: [],
        bytesOut: []
      }
    }
  };
};

systemSchema.statics.performSystemCleanup = async function() {
  // Remove old metrics
  const cutoffDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days
  
  const result = await this.deleteMany({
    lastUpdated: { $lt: cutoffDate }
  });
  
  logger.info('System metrics cleanup completed', {
    removedCount: result.deletedCount,
    cutoffDate
  });
  
  return result;
};

// Create and export model
const SystemModel = BaseModel.createModel('System', systemSchema);

module.exports = SystemModel;