'use strict';

/**
 * @fileoverview Security alert types and channels constants
 * @module shared/lib/utils/constants/alert-types
 * @description Class-based constants for security alert management
 */

/**
 * Security alert types
 */
class AlertTypes {
  static SECURITY_EVENT = 'security_event';
  static ANOMALY_DETECTION = 'anomaly_detection';
  static AUTHENTICATION_FAILURE = 'authentication_failure';
  static AUTHORIZATION_VIOLATION = 'authorization_violation';
  static HIGH_RISK_ACTIVITY = 'high_risk_activity';
  static SUSPICIOUS_BEHAVIOR = 'suspicious_behavior';
  static DATA_EXFILTRATION = 'data_exfiltration';
  static MALWARE_DETECTION = 'malware_detection';
  static INTRUSION_ATTEMPT = 'intrusion_attempt';
  static PRIVILEGE_ESCALATION = 'privilege_escalation';
  static CONFIGURATION_CHANGE = 'configuration_change';
  static POLICY_VIOLATION = 'policy_violation';
  static COMPLIANCE_ALERT = 'compliance_alert';
  static PERFORMANCE_DEGRADATION = 'performance_degradation';
  static SERVICE_UNAVAILABLE = 'service_unavailable';
  static THRESHOLD_EXCEEDED = 'threshold_exceeded';
  static FAILED_LOGIN_ATTEMPTS = 'failed_login_attempts';
  static ACCOUNT_LOCKOUT = 'account_lockout';
  static SUSPICIOUS_LOGIN = 'suspicious_login';
  static BRUTE_FORCE_ATTACK = 'brute_force_attack';
  static SQL_INJECTION_ATTEMPT = 'sql_injection_attempt';
  static XSS_ATTEMPT = 'xss_attempt';
  static CSRF_ATTEMPT = 'csrf_attempt';
  static FILE_INTEGRITY_VIOLATION = 'file_integrity_violation';
  static NETWORK_ANOMALY = 'network_anomaly';
  static UNUSUAL_DATA_ACCESS = 'unusual_data_access';
  static MASS_DATA_DOWNLOAD = 'mass_data_download';
  static UNAUTHORIZED_API_USAGE = 'unauthorized_api_usage';
  static RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded';
  static GEOLOCATION_ANOMALY = 'geolocation_anomaly';
  static TIME_BASED_ANOMALY = 'time_based_anomaly';
  static DEVICE_ANOMALY = 'device_anomaly';
  static SESSION_ANOMALY = 'session_anomaly';
  static ENCRYPTION_FAILURE = 'encryption_failure';
  static CERTIFICATE_EXPIRY = 'certificate_expiry';
  static BACKUP_FAILURE = 'backup_failure';
  static AUDIT_LOG_TAMPERING = 'audit_log_tampering';
  static CRITICAL_SYSTEM_ERROR = 'critical_system_error';
  static RESOURCE_EXHAUSTION = 'resource_exhaustion';
  static VULNERABILITY_DETECTED = 'vulnerability_detected';
  static PATCH_FAILURE = 'patch_failure';
  static COMPLIANCE_DEADLINE = 'compliance_deadline';
  static REGULATORY_VIOLATION = 'regulatory_violation';
  static DATA_RETENTION_VIOLATION = 'data_retention_violation';
  static GDPR_VIOLATION = 'gdpr_violation';
  static HIPAA_VIOLATION = 'hipaa_violation';
  static CUSTOM_RULE_TRIGGERED = 'custom_rule_triggered';

  /**
   * Get all alert types as array
   * @returns {string[]} Array of alert types
   */
  static getAll() {
    return Object.values(this).filter(value => typeof value === 'string');
  }

  /**
   * Get alert types by category
   * @param {string} category - Category name
   * @returns {string[]} Array of alert types for category
   */
  static getByCategory(category) {
    const categories = {
      security: [
        this.SECURITY_EVENT,
        this.INTRUSION_ATTEMPT,
        this.MALWARE_DETECTION,
        this.PRIVILEGE_ESCALATION,
        this.BRUTE_FORCE_ATTACK,
        this.SQL_INJECTION_ATTEMPT,
        this.XSS_ATTEMPT,
        this.CSRF_ATTEMPT,
        this.VULNERABILITY_DETECTED
      ],
      authentication: [
        this.AUTHENTICATION_FAILURE,
        this.AUTHORIZATION_VIOLATION,
        this.FAILED_LOGIN_ATTEMPTS,
        this.ACCOUNT_LOCKOUT,
        this.SUSPICIOUS_LOGIN
      ],
      anomaly: [
        this.ANOMALY_DETECTION,
        this.SUSPICIOUS_BEHAVIOR,
        this.NETWORK_ANOMALY,
        this.GEOLOCATION_ANOMALY,
        this.TIME_BASED_ANOMALY,
        this.DEVICE_ANOMALY,
        this.SESSION_ANOMALY
      ],
      data: [
        this.DATA_EXFILTRATION,
        this.UNUSUAL_DATA_ACCESS,
        this.MASS_DATA_DOWNLOAD,
        this.FILE_INTEGRITY_VIOLATION,
        this.AUDIT_LOG_TAMPERING
      ],
      compliance: [
        this.COMPLIANCE_ALERT,
        this.POLICY_VIOLATION,
        this.REGULATORY_VIOLATION,
        this.DATA_RETENTION_VIOLATION,
        this.GDPR_VIOLATION,
        this.HIPAA_VIOLATION,
        this.COMPLIANCE_DEADLINE
      ],
      system: [
        this.PERFORMANCE_DEGRADATION,
        this.SERVICE_UNAVAILABLE,
        this.THRESHOLD_EXCEEDED,
        this.CRITICAL_SYSTEM_ERROR,
        this.RESOURCE_EXHAUSTION,
        this.CONFIGURATION_CHANGE,
        this.PATCH_FAILURE
      ],
      operational: [
        this.ENCRYPTION_FAILURE,
        this.CERTIFICATE_EXPIRY,
        this.BACKUP_FAILURE,
        this.UNAUTHORIZED_API_USAGE,
        this.RATE_LIMIT_EXCEEDED
      ]
    };

    return categories[category] || [];
  }

  /**
   * Check if alert type exists
   * @param {string} type - Alert type to check
   * @returns {boolean} True if type exists
   */
  static isValid(type) {
    return this.getAll().includes(type);
  }

  /**
   * Get default severity for alert type
   * @param {string} type - Alert type
   * @returns {string} Default severity level
   */
  static getDefaultSeverity(type) {
    const severityMap = {
      [this.MALWARE_DETECTION]: 'critical',
      [this.DATA_EXFILTRATION]: 'critical',
      [this.INTRUSION_ATTEMPT]: 'critical',
      [this.BRUTE_FORCE_ATTACK]: 'high',
      [this.SQL_INJECTION_ATTEMPT]: 'high',
      [this.AUTHENTICATION_FAILURE]: 'medium',
      [this.SUSPICIOUS_BEHAVIOR]: 'medium',
      [this.CONFIGURATION_CHANGE]: 'low',
      [this.THRESHOLD_EXCEEDED]: 'low'
    };

    return severityMap[type] || 'medium';
  }
}

/**
 * Alert notification channels
 */
class AlertChannels {
  static EMAIL = 'email';
  static SMS = 'sms';
  static SLACK = 'slack';
  static TEAMS = 'teams';
  static WEBHOOK = 'webhook';
  static IN_APP = 'in_app';
  static PUSH_NOTIFICATION = 'push_notification';
  static PHONE_CALL = 'phone_call';
  static PAGER_DUTY = 'pager_duty';
  static JIRA = 'jira';
  static SERVICENOW = 'servicenow';
  static DISCORD = 'discord';
  static TELEGRAM = 'telegram';
  static CUSTOM = 'custom';

  /**
   * Get all channels as array
   * @returns {string[]} Array of alert channels
   */
  static getAll() {
    return [
      this.EMAIL,
      this.SMS,
      this.SLACK,
      this.TEAMS,
      this.WEBHOOK,
      this.IN_APP,
      this.PUSH_NOTIFICATION,
      this.PHONE_CALL,
      this.PAGER_DUTY,
      this.JIRA,
      this.SERVICENOW,
      this.DISCORD,
      this.TELEGRAM,
      this.CUSTOM
    ];
  }

  /**
   * Get channels by category
   * @param {string} category - Category name
   * @returns {string[]} Array of channels for category
   */
  static getByCategory(category) {
    const categories = {
      instant: [
        this.SMS,
        this.PUSH_NOTIFICATION,
        this.PHONE_CALL,
        this.PAGER_DUTY
      ],
      messaging: [
        this.EMAIL,
        this.SLACK,
        this.TEAMS,
        this.DISCORD,
        this.TELEGRAM
      ],
      integration: [
        this.WEBHOOK,
        this.JIRA,
        this.SERVICENOW,
        this.CUSTOM
      ],
      internal: [
        this.IN_APP
      ]
    };

    return categories[category] || [];
  }

  /**
   * Check if channel exists
   * @param {string} channel - Channel to check
   * @returns {boolean} True if channel exists
   */
  static isValid(channel) {
    return this.getAll().includes(channel);
  }

  /**
   * Get channels by severity
   * @param {string} severity - Alert severity
   * @returns {string[]} Recommended channels for severity
   */
  static getBySeverity(severity) {
    const severityChannels = {
      critical: [
        this.PHONE_CALL,
        this.SMS,
        this.PAGER_DUTY,
        this.EMAIL,
        this.SLACK,
        this.IN_APP
      ],
      high: [
        this.SMS,
        this.EMAIL,
        this.SLACK,
        this.TEAMS,
        this.IN_APP
      ],
      medium: [
        this.EMAIL,
        this.SLACK,
        this.IN_APP
      ],
      low: [
        this.EMAIL,
        this.IN_APP
      ],
      info: [
        this.IN_APP
      ]
    };

    return severityChannels[severity] || [this.IN_APP];
  }
}

/**
 * Alert statuses
 */
class AlertStatuses {
  static NEW = 'new';
  static ACKNOWLEDGED = 'acknowledged';
  static INVESTIGATING = 'investigating';
  static MITIGATING = 'mitigating';
  static RESOLVED = 'resolved';
  static FALSE_POSITIVE = 'false_positive';
  static IGNORED = 'ignored';
  static ESCALATED = 'escalated';
  static REOPENED = 'reopened';

  /**
   * Get all statuses as array
   * @returns {string[]} Array of alert statuses
   */
  static getAll() {
    return [
      this.NEW,
      this.ACKNOWLEDGED,
      this.INVESTIGATING,
      this.MITIGATING,
      this.RESOLVED,
      this.FALSE_POSITIVE,
      this.IGNORED,
      this.ESCALATED,
      this.REOPENED
    ];
  }

  /**
   * Get open statuses
   * @returns {string[]} Array of open statuses
   */
  static getOpen() {
    return [
      this.NEW,
      this.ACKNOWLEDGED,
      this.INVESTIGATING,
      this.MITIGATING,
      this.ESCALATED,
      this.REOPENED
    ];
  }

  /**
   * Get closed statuses
   * @returns {string[]} Array of closed statuses
   */
  static getClosed() {
    return [
      this.RESOLVED,
      this.FALSE_POSITIVE,
      this.IGNORED
    ];
  }

  /**
   * Check if status is open
   * @param {string} status - Status to check
   * @returns {boolean} True if status is open
   */
  static isOpen(status) {
    return this.getOpen().includes(status);
  }

  /**
   * Check if status is closed
   * @param {string} status - Status to check
   * @returns {boolean} True if status is closed
   */
  static isClosed(status) {
    return this.getClosed().includes(status);
  }
}

/**
 * Alert priorities
 */
class AlertPriorities {
  static CRITICAL = 1;
  static HIGH = 2;
  static MEDIUM = 3;
  static LOW = 4;
  static INFO = 5;

  /**
   * Get all priorities as array
   * @returns {number[]} Array of alert priorities
   */
  static getAll() {
    return [this.CRITICAL, this.HIGH, this.MEDIUM, this.LOW, this.INFO];
  }

  /**
   * Get priority name
   * @param {number} priority - Priority number
   * @returns {string} Priority name
   */
  static getName(priority) {
    const names = {
      [this.CRITICAL]: 'Critical',
      [this.HIGH]: 'High',
      [this.MEDIUM]: 'Medium',
      [this.LOW]: 'Low',
      [this.INFO]: 'Info'
    };

    return names[priority] || 'Unknown';
  }

  /**
   * Get priority from severity
   * @param {string} severity - Alert severity
   * @returns {number} Corresponding priority
   */
  static fromSeverity(severity) {
    const mapping = {
      critical: this.CRITICAL,
      high: this.HIGH,
      medium: this.MEDIUM,
      low: this.LOW,
      info: this.INFO
    };

    return mapping[severity] || this.MEDIUM;
  }
}

// Export constants
const ALERT_TYPES = AlertTypes;
const ALERT_CHANNELS = AlertChannels;
const ALERT_STATUSES = AlertStatuses;
const ALERT_PRIORITIES = AlertPriorities;

module.exports = {
  AlertTypes,
  AlertChannels,
  AlertStatuses,
  AlertPriorities,
  ALERT_TYPES,
  ALERT_CHANNELS,
  ALERT_STATUSES,
  ALERT_PRIORITIES
};