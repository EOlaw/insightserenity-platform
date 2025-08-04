'use strict';

/**
 * @fileoverview Security incident types and severity constants
 * @module shared/lib/utils/constants/incident-types
 * @description Class-based constants for security incident management
 */

/**
 * Security incident types
 */
class IncidentTypes {
  static SECURITY_BREACH = 'security_breach';
  static DATA_BREACH = 'data_breach';
  static UNAUTHORIZED_ACCESS = 'unauthorized_access';
  static MALWARE_ATTACK = 'malware_attack';
  static RANSOMWARE_ATTACK = 'ransomware_attack';
  static PHISHING_ATTACK = 'phishing_attack';
  static DDOS_ATTACK = 'ddos_attack';
  static INSIDER_THREAT = 'insider_threat';
  static PHYSICAL_BREACH = 'physical_breach';
  static SYSTEM_COMPROMISE = 'system_compromise';
  static ACCOUNT_COMPROMISE = 'account_compromise';
  static DATA_LOSS = 'data_loss';
  static DATA_CORRUPTION = 'data_corruption';
  static SERVICE_DISRUPTION = 'service_disruption';
  static COMPLIANCE_VIOLATION = 'compliance_violation';
  static VULNERABILITY_EXPLOIT = 'vulnerability_exploit';
  static SOCIAL_ENGINEERING = 'social_engineering';
  static APPLICATION_ATTACK = 'application_attack';
  static NETWORK_INTRUSION = 'network_intrusion';
  static PRIVILEGE_ESCALATION = 'privilege_escalation';
  static CONFIGURATION_ERROR = 'configuration_error';
  static AUTHENTICATION_BYPASS = 'authentication_bypass';
  static ENCRYPTION_FAILURE = 'encryption_failure';
  static BACKUP_FAILURE = 'backup_failure';
  static AUDIT_FAILURE = 'audit_failure';
  static SECURITY_CONTROL_FAILURE = 'security_control_failure';
  static THIRD_PARTY_BREACH = 'third_party_breach';
  static SUPPLY_CHAIN_ATTACK = 'supply_chain_attack';
  static CLOUD_MISCONFIGURATION = 'cloud_misconfiguration';
  static API_ABUSE = 'api_abuse';
  static CREDENTIAL_STUFFING = 'credential_stuffing';
  static BRUTE_FORCE_ATTACK = 'brute_force_attack';
  static MAN_IN_THE_MIDDLE = 'man_in_the_middle';
  static DNS_POISONING = 'dns_poisoning';
  static ZERO_DAY_EXPLOIT = 'zero_day_exploit';
  static ADVANCED_PERSISTENT_THREAT = 'advanced_persistent_threat';
  static OTHER = 'other';

  /**
   * Get all incident types as array
   * @returns {string[]} Array of incident types
   */
  static getAll() {
    return Object.values(this).filter(value => typeof value === 'string');
  }

  /**
   * Get incident types by category
   * @param {string} category - Category name
   * @returns {string[]} Array of incident types for category
   */
  static getByCategory(category) {
    const categories = {
      malicious: [
        this.MALWARE_ATTACK,
        this.RANSOMWARE_ATTACK,
        this.PHISHING_ATTACK,
        this.DDOS_ATTACK,
        this.INSIDER_THREAT,
        this.SOCIAL_ENGINEERING,
        this.SUPPLY_CHAIN_ATTACK,
        this.ADVANCED_PERSISTENT_THREAT
      ],
      technical: [
        this.SYSTEM_COMPROMISE,
        this.VULNERABILITY_EXPLOIT,
        this.APPLICATION_ATTACK,
        this.NETWORK_INTRUSION,
        this.CONFIGURATION_ERROR,
        this.ENCRYPTION_FAILURE,
        this.BACKUP_FAILURE,
        this.SECURITY_CONTROL_FAILURE,
        this.CLOUD_MISCONFIGURATION,
        this.ZERO_DAY_EXPLOIT
      ],
      access: [
        this.UNAUTHORIZED_ACCESS,
        this.ACCOUNT_COMPROMISE,
        this.PRIVILEGE_ESCALATION,
        this.AUTHENTICATION_BYPASS,
        this.CREDENTIAL_STUFFING,
        this.BRUTE_FORCE_ATTACK
      ],
      data: [
        this.DATA_BREACH,
        this.DATA_LOSS,
        this.DATA_CORRUPTION
      ],
      compliance: [
        this.COMPLIANCE_VIOLATION,
        this.AUDIT_FAILURE
      ]
    };

    return categories[category] || [];
  }

  /**
   * Check if incident type exists
   * @param {string} type - Incident type to check
   * @returns {boolean} True if type exists
   */
  static isValid(type) {
    return this.getAll().includes(type);
  }
}

/**
 * Security incident severities
 */
class IncidentSeverities {
  static CRITICAL = 'critical';
  static HIGH = 'high';
  static MEDIUM = 'medium';
  static LOW = 'low';
  static INFORMATIONAL = 'informational';

  /**
   * Get all severities as array
   * @returns {string[]} Array of severities
   */
  static getAll() {
    return [
      this.CRITICAL,
      this.HIGH,
      this.MEDIUM,
      this.LOW,
      this.INFORMATIONAL
    ];
  }

  /**
   * Get severity level (numeric)
   * @param {string} severity - Severity name
   * @returns {number} Numeric severity level
   */
  static getLevel(severity) {
    const levels = {
      [this.CRITICAL]: 5,
      [this.HIGH]: 4,
      [this.MEDIUM]: 3,
      [this.LOW]: 2,
      [this.INFORMATIONAL]: 1
    };

    return levels[severity] || 0;
  }

  /**
   * Compare severities
   * @param {string} severity1 - First severity
   * @param {string} severity2 - Second severity
   * @returns {number} Comparison result (-1, 0, 1)
   */
  static compare(severity1, severity2) {
    const level1 = this.getLevel(severity1);
    const level2 = this.getLevel(severity2);

    if (level1 < level2) return -1;
    if (level1 > level2) return 1;
    return 0;
  }

  /**
   * Check if severity exists
   * @param {string} severity - Severity to check
   * @returns {boolean} True if severity exists
   */
  static isValid(severity) {
    return this.getAll().includes(severity);
  }
}

/**
 * Incident priorities
 */
class IncidentPriorities {
  static P1 = 'p1'; // Critical business impact
  static P2 = 'p2'; // High business impact
  static P3 = 'p3'; // Medium business impact
  static P4 = 'p4'; // Low business impact
  static P5 = 'p5'; // Minimal business impact

  /**
   * Get all priorities as array
   * @returns {string[]} Array of priorities
   */
  static getAll() {
    return [this.P1, this.P2, this.P3, this.P4, this.P5];
  }

  /**
   * Get priority from severity
   * @param {string} severity - Incident severity
   * @returns {string} Corresponding priority
   */
  static fromSeverity(severity) {
    const mapping = {
      [IncidentSeverities.CRITICAL]: this.P1,
      [IncidentSeverities.HIGH]: this.P2,
      [IncidentSeverities.MEDIUM]: this.P3,
      [IncidentSeverities.LOW]: this.P4,
      [IncidentSeverities.INFORMATIONAL]: this.P5
    };

    return mapping[severity] || this.P3;
  }
}

/**
 * Incident status types
 */
class IncidentStatuses {
  static NEW = 'new';
  static TRIAGED = 'triaged';
  static INVESTIGATING = 'investigating';
  static CONTAINING = 'containing';
  static ERADICATING = 'eradicating';
  static RECOVERING = 'recovering';
  static MONITORING = 'monitoring';
  static RESOLVED = 'resolved';
  static CLOSED = 'closed';
  static REOPENED = 'reopened';

  /**
   * Get all statuses as array
   * @returns {string[]} Array of statuses
   */
  static getAll() {
    return [
      this.NEW,
      this.TRIAGED,
      this.INVESTIGATING,
      this.CONTAINING,
      this.ERADICATING,
      this.RECOVERING,
      this.MONITORING,
      this.RESOLVED,
      this.CLOSED,
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
      this.TRIAGED,
      this.INVESTIGATING,
      this.CONTAINING,
      this.ERADICATING,
      this.RECOVERING,
      this.MONITORING,
      this.REOPENED
    ];
  }

  /**
   * Get closed statuses
   * @returns {string[]} Array of closed statuses
   */
  static getClosed() {
    return [this.RESOLVED, this.CLOSED];
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

// Export constants
const INCIDENT_TYPES = IncidentTypes;
const INCIDENT_SEVERITIES = IncidentSeverities;
const INCIDENT_PRIORITIES = IncidentPriorities;
const INCIDENT_STATUSES = IncidentStatuses;

module.exports = {
  IncidentTypes,
  IncidentSeverities,
  IncidentPriorities,
  IncidentStatuses,
  INCIDENT_TYPES,
  INCIDENT_SEVERITIES,
  INCIDENT_PRIORITIES,
  INCIDENT_STATUSES
};