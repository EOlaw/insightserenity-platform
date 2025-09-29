'use strict';

/**
 * @fileoverview Alert types and severity levels constants
 * @module shared/lib/utils/constants/alert-types
 */

/**
 * Alert severity levels
 * @const {Object}
 */
const AlertSeverity = Object.freeze({
  CRITICAL: {
    level: 1,
    name: 'Critical',
    color: '#FF0000',
    icon: 'alert-octagon',
    sound: true,
    notification: true,
    escalation: true,
    responseTime: 15 // minutes
  },
  HIGH: {
    level: 2,
    name: 'High',
    color: '#FF6B6B',
    icon: 'alert-triangle',
    sound: true,
    notification: true,
    escalation: true,
    responseTime: 30 // minutes
  },
  MEDIUM: {
    level: 3,
    name: 'Medium',
    color: '#FFA500',
    icon: 'alert-circle',
    sound: false,
    notification: true,
    escalation: false,
    responseTime: 120 // minutes
  },
  LOW: {
    level: 4,
    name: 'Low',
    color: '#FFD700',
    icon: 'info',
    sound: false,
    notification: false,
    escalation: false,
    responseTime: 480 // minutes
  },
  INFO: {
    level: 5,
    name: 'Info',
    color: '#4CAF50',
    icon: 'info-circle',
    sound: false,
    notification: false,
    escalation: false,
    responseTime: null
  }
});

/**
 * Alert types definitions
 * @const {Object}
 */
const AlertTypes = Object.freeze({
  // System Alerts
  SYSTEM_DOWN: {
    id: 'SYSTEM_DOWN',
    name: 'System Down',
    category: 'System',
    severity: 'CRITICAL',
    autoResolve: false,
    template: 'System {component} is down',
    actions: ['restart', 'escalate', 'notify'],
    metrics: ['uptime', 'response_time']
  },

  SYSTEM_DEGRADED: {
    id: 'SYSTEM_DEGRADED',
    name: 'System Degraded',
    category: 'System',
    severity: 'HIGH',
    autoResolve: true,
    template: 'System {component} performance degraded by {percentage}%',
    actions: ['monitor', 'scale', 'notify'],
    metrics: ['response_time', 'error_rate']
  },

  HIGH_CPU: {
    id: 'HIGH_CPU',
    name: 'High CPU Usage',
    category: 'System',
    severity: 'MEDIUM',
    autoResolve: true,
    threshold: 80,
    template: 'CPU usage at {value}% on {server}',
    actions: ['scale', 'optimize'],
    metrics: ['cpu_usage']
  },

  HIGH_MEMORY: {
    id: 'HIGH_MEMORY',
    name: 'High Memory Usage',
    category: 'System',
    severity: 'MEDIUM',
    autoResolve: true,
    threshold: 85,
    template: 'Memory usage at {value}% on {server}',
    actions: ['restart', 'scale'],
    metrics: ['memory_usage']
  },

  DISK_SPACE_LOW: {
    id: 'DISK_SPACE_LOW',
    name: 'Low Disk Space',
    category: 'System',
    severity: 'HIGH',
    autoResolve: false,
    threshold: 90,
    template: 'Disk usage at {value}% on {server}',
    actions: ['cleanup', 'archive', 'expand'],
    metrics: ['disk_usage']
  },

  // Database Alerts
  DATABASE_CONNECTION_FAILED: {
    id: 'DATABASE_CONNECTION_FAILED',
    name: 'Database Connection Failed',
    category: 'Database',
    severity: 'CRITICAL',
    autoResolve: false,
    template: 'Unable to connect to database {database}',
    actions: ['reconnect', 'failover', 'notify'],
    metrics: ['connection_status']
  },

  DATABASE_REPLICATION_LAG: {
    id: 'DATABASE_REPLICATION_LAG',
    name: 'Database Replication Lag',
    category: 'Database',
    severity: 'HIGH',
    autoResolve: true,
    threshold: 5000, // ms
    template: 'Replication lag of {value}ms on {replica}',
    actions: ['optimize', 'restart_replication'],
    metrics: ['replication_lag']
  },

  SLOW_QUERY: {
    id: 'SLOW_QUERY',
    name: 'Slow Query Detected',
    category: 'Database',
    severity: 'MEDIUM',
    autoResolve: true,
    threshold: 1000, // ms
    template: 'Query taking {duration}ms: {query}',
    actions: ['optimize', 'index', 'cache'],
    metrics: ['query_time']
  },

  // Security Alerts
  UNAUTHORIZED_ACCESS: {
    id: 'UNAUTHORIZED_ACCESS',
    name: 'Unauthorized Access Attempt',
    category: 'Security',
    severity: 'HIGH',
    autoResolve: false,
    template: 'Unauthorized access attempt from {ip} to {resource}',
    actions: ['block', 'investigate', 'notify'],
    metrics: ['failed_auth_attempts']
  },

  BRUTE_FORCE_ATTACK: {
    id: 'BRUTE_FORCE_ATTACK',
    name: 'Brute Force Attack Detected',
    category: 'Security',
    severity: 'CRITICAL',
    autoResolve: false,
    threshold: 5,
    template: '{count} failed login attempts from {ip}',
    actions: ['block_ip', 'lock_account', 'notify'],
    metrics: ['failed_login_attempts']
  },

  SUSPICIOUS_ACTIVITY: {
    id: 'SUSPICIOUS_ACTIVITY',
    name: 'Suspicious Activity Detected',
    category: 'Security',
    severity: 'HIGH',
    autoResolve: false,
    template: 'Suspicious activity detected: {description}',
    actions: ['investigate', 'quarantine', 'notify'],
    metrics: ['anomaly_score']
  },

  DATA_BREACH: {
    id: 'DATA_BREACH',
    name: 'Potential Data Breach',
    category: 'Security',
    severity: 'CRITICAL',
    autoResolve: false,
    template: 'Potential data breach detected in {system}',
    actions: ['isolate', 'investigate', 'notify_legal'],
    metrics: ['data_accessed']
  },

  SSL_CERTIFICATE_EXPIRING: {
    id: 'SSL_CERTIFICATE_EXPIRING',
    name: 'SSL Certificate Expiring',
    category: 'Security',
    severity: 'MEDIUM',
    autoResolve: false,
    threshold: 30, // days
    template: 'SSL certificate for {domain} expires in {days} days',
    actions: ['renew', 'notify'],
    metrics: ['days_until_expiry']
  },

  // Application Alerts
  HIGH_ERROR_RATE: {
    id: 'HIGH_ERROR_RATE',
    name: 'High Error Rate',
    category: 'Application',
    severity: 'HIGH',
    autoResolve: true,
    threshold: 5, // percent
    template: 'Error rate at {value}% for {service}',
    actions: ['rollback', 'investigate', 'scale'],
    metrics: ['error_rate']
  },

  API_RATE_LIMIT: {
    id: 'API_RATE_LIMIT',
    name: 'API Rate Limit Exceeded',
    category: 'Application',
    severity: 'MEDIUM',
    autoResolve: true,
    template: 'Rate limit exceeded for {api} by {client}',
    actions: ['throttle', 'notify_client'],
    metrics: ['request_rate']
  },

  SERVICE_DEGRADATION: {
    id: 'SERVICE_DEGRADATION',
    name: 'Service Degradation',
    category: 'Application',
    severity: 'HIGH',
    autoResolve: true,
    template: 'Service {service} response time increased by {percentage}%',
    actions: ['scale', 'cache', 'investigate'],
    metrics: ['response_time', 'throughput']
  },

  DEPLOYMENT_FAILED: {
    id: 'DEPLOYMENT_FAILED',
    name: 'Deployment Failed',
    category: 'Application',
    severity: 'HIGH',
    autoResolve: false,
    template: 'Deployment of {service} version {version} failed',
    actions: ['rollback', 'investigate', 'notify'],
    metrics: ['deployment_status']
  },

  // Business Alerts
  PAYMENT_FAILED: {
    id: 'PAYMENT_FAILED',
    name: 'Payment Processing Failed',
    category: 'Business',
    severity: 'HIGH',
    autoResolve: false,
    template: 'Payment of {amount} failed for customer {customerId}',
    actions: ['retry', 'notify_customer', 'investigate'],
    metrics: ['payment_success_rate']
  },

  SLA_VIOLATION: {
    id: 'SLA_VIOLATION',
    name: 'SLA Violation',
    category: 'Business',
    severity: 'HIGH',
    autoResolve: false,
    template: 'SLA violated for {metric}: {current} vs {target}',
    actions: ['escalate', 'compensate', 'notify'],
    metrics: ['sla_compliance']
  },

  LOW_INVENTORY: {
    id: 'LOW_INVENTORY',
    name: 'Low Inventory',
    category: 'Business',
    severity: 'MEDIUM',
    autoResolve: false,
    threshold: 10,
    template: 'Inventory for {product} below {threshold} units',
    actions: ['reorder', 'notify_supplier'],
    metrics: ['inventory_level']
  },

  SUBSCRIPTION_EXPIRING: {
    id: 'SUBSCRIPTION_EXPIRING',
    name: 'Subscription Expiring',
    category: 'Business',
    severity: 'LOW',
    autoResolve: false,
    threshold: 7, // days
    template: 'Subscription for {customer} expires in {days} days',
    actions: ['notify_customer', 'offer_renewal'],
    metrics: ['days_until_expiry']
  },

  // Compliance Alerts
  COMPLIANCE_VIOLATION: {
    id: 'COMPLIANCE_VIOLATION',
    name: 'Compliance Violation',
    category: 'Compliance',
    severity: 'CRITICAL',
    autoResolve: false,
    template: 'Compliance violation detected: {regulation} - {violation}',
    actions: ['remediate', 'document', 'notify_compliance'],
    metrics: ['compliance_score']
  },

  AUDIT_FAILURE: {
    id: 'AUDIT_FAILURE',
    name: 'Audit Failure',
    category: 'Compliance',
    severity: 'HIGH',
    autoResolve: false,
    template: 'Audit failed for {component}: {reason}',
    actions: ['investigate', 'remediate', 'document'],
    metrics: ['audit_pass_rate']
  },

  DATA_RETENTION_VIOLATION: {
    id: 'DATA_RETENTION_VIOLATION',
    name: 'Data Retention Policy Violation',
    category: 'Compliance',
    severity: 'MEDIUM',
    autoResolve: false,
    template: 'Data older than {period} found in {system}',
    actions: ['purge', 'archive', 'document'],
    metrics: ['data_age']
  }
});

/**
 * Alert notification channels
 * @const {Object}
 */
const AlertChannels = Object.freeze({
  EMAIL: {
    id: 'EMAIL',
    name: 'Email',
    async: true,
    retryable: true,
    config: {
      maxRetries: 3,
      retryDelay: 60000 // 1 minute
    }
  },
  SMS: {
    id: 'SMS',
    name: 'SMS',
    async: true,
    retryable: true,
    config: {
      maxRetries: 2,
      retryDelay: 30000 // 30 seconds
    }
  },
  SLACK: {
    id: 'SLACK',
    name: 'Slack',
    async: true,
    retryable: true,
    config: {
      maxRetries: 3,
      retryDelay: 10000 // 10 seconds
    }
  },
  WEBHOOK: {
    id: 'WEBHOOK',
    name: 'Webhook',
    async: true,
    retryable: true,
    config: {
      maxRetries: 5,
      retryDelay: 30000,
      timeout: 10000
    }
  },
  PAGERDUTY: {
    id: 'PAGERDUTY',
    name: 'PagerDuty',
    async: true,
    retryable: true,
    config: {
      maxRetries: 3,
      retryDelay: 60000
    }
  },
  DASHBOARD: {
    id: 'DASHBOARD',
    name: 'Dashboard',
    async: false,
    retryable: false,
    config: {}
  }
});

/**
 * @class AlertHelper
 * @description Helper methods for alert management
 */
class AlertHelper {
  /**
   * Get alert by ID
   * @static
   * @param {string} alertId - Alert type ID
   * @returns {Object|null} Alert type
   */
  static getAlertType(alertId) {
    return AlertTypes[alertId] || null;
  }

  /**
   * Get severity level
   * @static
   * @param {string} severity - Severity name
   * @returns {Object|null} Severity configuration
   */
  static getSeverity(severity) {
    return AlertSeverity[severity] || null;
  }

  /**
   * Get alerts by category
   * @static
   * @param {string} category - Alert category
   * @returns {Array} Alerts in category
   */
  static getAlertsByCategory(category) {
    return Object.values(AlertTypes).filter(alert =>
      alert.category === category
    );
  }

  /**
   * Get alerts by severity
   * @static
   * @param {string} severity - Severity level
   * @returns {Array} Alerts with severity
   */
  static getAlertsBySeverity(severity) {
    return Object.values(AlertTypes).filter(alert =>
      alert.severity === severity
    );
  }

  /**
   * Calculate priority score
   * @static
   * @param {Object} alert - Alert object
   * @returns {number} Priority score (1-100)
   */
  static calculatePriority(alert) {
    const severityScores = {
      CRITICAL: 100,
      HIGH: 75,
      MEDIUM: 50,
      LOW: 25,
      INFO: 10
    };

    let score = severityScores[alert.severity] || 50;

    // Adjust based on category
    if (alert.category === 'Security' || alert.category === 'Compliance') {
      score += 10;
    }

    // Adjust based on auto-resolve
    if (!alert.autoResolve) {
      score += 5;
    }

    return Math.min(100, score);
  }

  /**
   * Get notification channels for alert
   * @static
   * @param {Object} alert - Alert object
   * @returns {Array} Notification channels
   */
  static getNotificationChannels(alert) {
    const severity = AlertSeverity[alert.severity];
    const channels = [];

    if (severity.notification) {
      channels.push(AlertChannels.EMAIL);
      channels.push(AlertChannels.DASHBOARD);
    }

    if (severity.level <= 2) { // Critical or High
      channels.push(AlertChannels.SMS);
      channels.push(AlertChannels.SLACK);
    }

    if (severity.escalation) {
      channels.push(AlertChannels.PAGERDUTY);
    }

    return channels;
  }

  /**
   * Format alert message
   * @static
   * @param {Object} alert - Alert type
   * @param {Object} data - Alert data
   * @returns {string} Formatted message
   */
  static formatMessage(alert, data) {
    let message = alert.template;

    for (const [key, value] of Object.entries(data)) {
      message = message.replace(`{${key}}`, value);
    }

    return message;
  }

  /**
   * Check if alert should trigger
   * @static
   * @param {Object} alert - Alert type
   * @param {number} value - Current value
   * @returns {boolean} True if should trigger
   */
  static shouldTrigger(alert, value) {
    if (!alert.threshold) return true;

    return value >= alert.threshold;
  }

  /**
   * Get escalation path
   * @static
   * @param {Object} alert - Alert object
   * @returns {Array} Escalation levels
   */
  static getEscalationPath(alert) {
    const severity = AlertSeverity[alert.severity];
    const path = [];

    if (severity.level <= 3) { // Critical, High, or Medium
      path.push({
        level: 1,
        delay: 0,
        contacts: ['on-call-engineer']
      });
    }

    if (severity.level <= 2) { // Critical or High
      path.push({
        level: 2,
        delay: severity.responseTime * 60000, // Convert to ms
        contacts: ['team-lead', 'on-call-engineer']
      });
    }

    if (severity.level === 1) { // Critical
      path.push({
        level: 3,
        delay: severity.responseTime * 2 * 60000,
        contacts: ['manager', 'team-lead', 'on-call-engineer']
      });
    }

    return path;
  }

  /**
   * Create alert object
   * @static
   * @param {string} typeId - Alert type ID
   * @param {Object} data - Alert data
   * @returns {Object} Alert object
   */
  static createAlert(typeId, data) {
    const alertType = this.getAlertType(typeId);
    if (!alertType) {
      throw new Error(`Unknown alert type: ${typeId}`);
    }

    const severity = this.getSeverity(alertType.severity);

    return {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: typeId,
      name: alertType.name,
      category: alertType.category,
      severity: alertType.severity,
      severityLevel: severity.level,
      message: this.formatMessage(alertType, data),
      data,
      timestamp: new Date().toISOString(),
      status: 'OPEN',
      autoResolve: alertType.autoResolve,
      priority: this.calculatePriority(alertType),
      channels: this.getNotificationChannels(alertType),
      actions: alertType.actions,
      metrics: alertType.metrics,
      escalation: this.getEscalationPath(alertType)
    };
  }
}

// Export everything
module.exports = AlertTypes;
module.exports.AlertSeverity = AlertSeverity;
module.exports.AlertChannels = AlertChannels;
module.exports.AlertHelper = AlertHelper;
