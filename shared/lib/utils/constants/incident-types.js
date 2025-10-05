'use strict';

/**
 * @fileoverview Incident types and management constants
 * @module shared/lib/utils/constants/incident-types
 */

/**
 * Incident severity levels
 * @const {Object}
 */
const IncidentSeverity = Object.freeze({
  SEV1: {
    level: 1,
    name: 'Critical',
    description: 'Complete service outage or data loss',
    responseTime: 15, // minutes
    updateInterval: 30, // minutes
    escalation: 'immediate',
    requiredRoles: ['incident-commander', 'tech-lead', 'manager'],
    communication: ['all-hands', 'executive', 'customer']
  },
  SEV2: {
    level: 2,
    name: 'Major',
    description: 'Significant degradation or partial outage',
    responseTime: 30, // minutes
    updateInterval: 60, // minutes
    escalation: '30-minutes',
    requiredRoles: ['incident-commander', 'tech-lead'],
    communication: ['team', 'stakeholders']
  },
  SEV3: {
    level: 3,
    name: 'Minor',
    description: 'Minor feature issue with workaround available',
    responseTime: 120, // minutes
    updateInterval: 240, // minutes
    escalation: '2-hours',
    requiredRoles: ['on-call-engineer'],
    communication: ['team']
  },
  SEV4: {
    level: 4,
    name: 'Low',
    description: 'Minimal impact, cosmetic issues',
    responseTime: 480, // minutes (8 hours)
    updateInterval: 1440, // minutes (24 hours)
    escalation: 'next-business-day',
    requiredRoles: ['engineer'],
    communication: ['team']
  }
});

/**
 * Incident types definitions
 * @const {Object}
 */
const IncidentTypes = Object.freeze({
  // Infrastructure Incidents
  INFRASTRUCTURE_OUTAGE: {
    id: 'INFRASTRUCTURE_OUTAGE',
    name: 'Infrastructure Outage',
    category: 'Infrastructure',
    defaultSeverity: 'SEV1',
    symptoms: [
      'Service unavailable',
      'Connection timeouts',
      'Server not responding'
    ],
    impactAreas: ['availability', 'performance'],
    runbook: 'runbooks/infrastructure-outage.md',
    metrics: ['uptime', 'response_time', 'error_rate']
  },

  NETWORK_ISSUE: {
    id: 'NETWORK_ISSUE',
    name: 'Network Issue',
    category: 'Infrastructure',
    defaultSeverity: 'SEV2',
    symptoms: [
      'High latency',
      'Packet loss',
      'Intermittent connectivity'
    ],
    impactAreas: ['performance', 'reliability'],
    runbook: 'runbooks/network-issue.md',
    metrics: ['latency', 'packet_loss', 'bandwidth']
  },

  HARDWARE_FAILURE: {
    id: 'HARDWARE_FAILURE',
    name: 'Hardware Failure',
    category: 'Infrastructure',
    defaultSeverity: 'SEV2',
    symptoms: [
      'Server crash',
      'Disk failure',
      'Memory errors'
    ],
    impactAreas: ['availability', 'data_integrity'],
    runbook: 'runbooks/hardware-failure.md',
    metrics: ['hardware_health', 'disk_io', 'memory_errors']
  },

  // Application Incidents
  APPLICATION_CRASH: {
    id: 'APPLICATION_CRASH',
    name: 'Application Crash',
    category: 'Application',
    defaultSeverity: 'SEV1',
    symptoms: [
      'Service not responding',
      'Process terminated',
      'Core dump generated'
    ],
    impactAreas: ['availability', 'functionality'],
    runbook: 'runbooks/application-crash.md',
    metrics: ['crash_rate', 'restart_count', 'uptime']
  },

  MEMORY_LEAK: {
    id: 'MEMORY_LEAK',
    name: 'Memory Leak',
    category: 'Application',
    defaultSeverity: 'SEV3',
    symptoms: [
      'Increasing memory usage',
      'Slow performance',
      'Out of memory errors'
    ],
    impactAreas: ['performance', 'stability'],
    runbook: 'runbooks/memory-leak.md',
    metrics: ['memory_usage', 'heap_size', 'gc_time']
  },

  PERFORMANCE_DEGRADATION: {
    id: 'PERFORMANCE_DEGRADATION',
    name: 'Performance Degradation',
    category: 'Application',
    defaultSeverity: 'SEV2',
    symptoms: [
      'Slow response times',
      'High CPU usage',
      'Queue buildup'
    ],
    impactAreas: ['performance', 'user_experience'],
    runbook: 'runbooks/performance-degradation.md',
    metrics: ['response_time', 'cpu_usage', 'queue_length']
  },

  // Database Incidents
  DATABASE_OUTAGE: {
    id: 'DATABASE_OUTAGE',
    name: 'Database Outage',
    category: 'Database',
    defaultSeverity: 'SEV1',
    symptoms: [
      'Cannot connect to database',
      'Database server down',
      'Connection pool exhausted'
    ],
    impactAreas: ['availability', 'data_access'],
    runbook: 'runbooks/database-outage.md',
    metrics: ['connection_count', 'query_success_rate', 'replication_status']
  },

  DATA_CORRUPTION: {
    id: 'DATA_CORRUPTION',
    name: 'Data Corruption',
    category: 'Database',
    defaultSeverity: 'SEV1',
    symptoms: [
      'Invalid data returned',
      'Checksum failures',
      'Inconsistent records'
    ],
    impactAreas: ['data_integrity', 'reliability'],
    runbook: 'runbooks/data-corruption.md',
    metrics: ['data_validation_errors', 'checksum_failures']
  },

  REPLICATION_FAILURE: {
    id: 'REPLICATION_FAILURE',
    name: 'Replication Failure',
    category: 'Database',
    defaultSeverity: 'SEV2',
    symptoms: [
      'Replication lag increasing',
      'Slave out of sync',
      'Replication stopped'
    ],
    impactAreas: ['data_consistency', 'availability'],
    runbook: 'runbooks/replication-failure.md',
    metrics: ['replication_lag', 'slave_status', 'binlog_position']
  },

  // Security Incidents
  SECURITY_BREACH: {
    id: 'SECURITY_BREACH',
    name: 'Security Breach',
    category: 'Security',
    defaultSeverity: 'SEV1',
    symptoms: [
      'Unauthorized access detected',
      'Data exfiltration',
      'Suspicious activity'
    ],
    impactAreas: ['security', 'compliance', 'data_privacy'],
    runbook: 'runbooks/security-breach.md',
    metrics: ['unauthorized_access_attempts', 'data_transfer_volume']
  },

  DDOS_ATTACK: {
    id: 'DDOS_ATTACK',
    name: 'DDoS Attack',
    category: 'Security',
    defaultSeverity: 'SEV1',
    symptoms: [
      'Abnormal traffic spike',
      'Service unavailable',
      'Resource exhaustion'
    ],
    impactAreas: ['availability', 'performance'],
    runbook: 'runbooks/ddos-attack.md',
    metrics: ['request_rate', 'unique_ips', 'bandwidth_usage']
  },

  DATA_LEAK: {
    id: 'DATA_LEAK',
    name: 'Data Leak',
    category: 'Security',
    defaultSeverity: 'SEV1',
    symptoms: [
      'Sensitive data exposed',
      'Unauthorized data access',
      'Data found externally'
    ],
    impactAreas: ['security', 'compliance', 'reputation'],
    runbook: 'runbooks/data-leak.md',
    metrics: ['data_access_logs', 'external_exposure_count']
  },

  // Third-party Incidents
  THIRD_PARTY_OUTAGE: {
    id: 'THIRD_PARTY_OUTAGE',
    name: 'Third-party Service Outage',
    category: 'Third-party',
    defaultSeverity: 'SEV2',
    symptoms: [
      'API not responding',
      'Integration failures',
      'Timeout errors'
    ],
    impactAreas: ['functionality', 'integrations'],
    runbook: 'runbooks/third-party-outage.md',
    metrics: ['api_availability', 'integration_success_rate']
  },

  PAYMENT_PROCESSING_FAILURE: {
    id: 'PAYMENT_PROCESSING_FAILURE',
    name: 'Payment Processing Failure',
    category: 'Third-party',
    defaultSeverity: 'SEV1',
    symptoms: [
      'Payment failures',
      'Gateway errors',
      'Transaction timeouts'
    ],
    impactAreas: ['revenue', 'customer_experience'],
    runbook: 'runbooks/payment-failure.md',
    metrics: ['payment_success_rate', 'transaction_volume']
  },

  // Configuration Incidents
  CONFIGURATION_ERROR: {
    id: 'CONFIGURATION_ERROR',
    name: 'Configuration Error',
    category: 'Configuration',
    defaultSeverity: 'SEV2',
    symptoms: [
      'Service misconfiguration',
      'Feature not working',
      'Unexpected behavior'
    ],
    impactAreas: ['functionality', 'stability'],
    runbook: 'runbooks/configuration-error.md',
    metrics: ['config_validation_errors', 'feature_flags']
  },

  DEPLOYMENT_FAILURE: {
    id: 'DEPLOYMENT_FAILURE',
    name: 'Deployment Failure',
    category: 'Configuration',
    defaultSeverity: 'SEV2',
    symptoms: [
      'Deployment rollback',
      'Health check failures',
      'Version mismatch'
    ],
    impactAreas: ['availability', 'functionality'],
    runbook: 'runbooks/deployment-failure.md',
    metrics: ['deployment_success_rate', 'rollback_count']
  }
});

/**
 * Incident states
 * @const {Object}
 */
const IncidentStates = Object.freeze({
  DETECTED: 'DETECTED',
  ACKNOWLEDGED: 'ACKNOWLEDGED',
  INVESTIGATING: 'INVESTIGATING',
  IDENTIFIED: 'IDENTIFIED',
  MONITORING: 'MONITORING',
  RESOLVED: 'RESOLVED',
  CLOSED: 'CLOSED',
  POST_MORTEM: 'POST_MORTEM'
});

/**
 * Incident roles
 * @const {Object}
 */
const IncidentRoles = Object.freeze({
  INCIDENT_COMMANDER: {
    id: 'incident-commander',
    name: 'Incident Commander',
    responsibilities: [
      'Overall incident coordination',
      'Decision making',
      'External communication',
      'Resource allocation'
    ]
  },
  TECH_LEAD: {
    id: 'tech-lead',
    name: 'Technical Lead',
    responsibilities: [
      'Technical investigation',
      'Solution implementation',
      'Technical decisions',
      'Team coordination'
    ]
  },
  COMMUNICATIONS_LEAD: {
    id: 'communications-lead',
    name: 'Communications Lead',
    responsibilities: [
      'Status page updates',
      'Customer communication',
      'Internal updates',
      'Stakeholder management'
    ]
  },
  SCRIBE: {
    id: 'scribe',
    name: 'Scribe',
    responsibilities: [
      'Timeline documentation',
      'Action items tracking',
      'Decision logging',
      'Post-mortem preparation'
    ]
  }
});

/**
 * @class IncidentHelper
 * @description Helper methods for incident management
 */
class IncidentHelper {
  /**
   * Get incident type by ID
   * @static
   * @param {string} typeId - Incident type ID
   * @returns {Object|null} Incident type
   */
  static getIncidentType(typeId) {
    return IncidentTypes[typeId] || null;
  }

  /**
   * Get severity configuration
   * @static
   * @param {string} severity - Severity level
   * @returns {Object|null} Severity configuration
   */
  static getSeverity(severity) {
    return IncidentSeverity[severity] || null;
  }

  /**
   * Calculate incident priority
   * @static
   * @param {Object} incident - Incident object
   * @returns {number} Priority score (1-100)
   */
  static calculatePriority(incident) {
    const severity = IncidentSeverity[incident.severity];
    let score = 100 - (severity.level - 1) * 25;

    // Adjust based on impact
    if (incident.affectedUsers > 1000) score += 10;
    if (incident.affectedUsers > 10000) score += 10;

    // Adjust based on category
    if (incident.category === 'Security') score += 15;
    if (incident.category === 'Database') score += 10;

    return Math.min(100, score);
  }

  /**
   * Get required roles for incident
   * @static
   * @param {string} severity - Severity level
   * @returns {Array} Required roles
   */
  static getRequiredRoles(severity) {
    const severityConfig = IncidentSeverity[severity];
    return severityConfig ? severityConfig.requiredRoles : [];
  }

  /**
   * Check if state transition is valid
   * @static
   * @param {string} fromState - Current state
   * @param {string} toState - Target state
   * @returns {boolean} True if valid transition
   */
  static isValidStateTransition(fromState, toState) {
    const validTransitions = {
      DETECTED: ['ACKNOWLEDGED', 'INVESTIGATING'],
      ACKNOWLEDGED: ['INVESTIGATING', 'RESOLVED'],
      INVESTIGATING: ['IDENTIFIED', 'MONITORING', 'RESOLVED'],
      IDENTIFIED: ['MONITORING', 'RESOLVED'],
      MONITORING: ['RESOLVED', 'INVESTIGATING'],
      RESOLVED: ['CLOSED', 'INVESTIGATING'],
      CLOSED: ['POST_MORTEM'],
      POST_MORTEM: []
    };

    return validTransitions[fromState]?.includes(toState) || false;
  }

  /**
   * Get next valid states
   * @static
   * @param {string} currentState - Current state
   * @returns {Array} Valid next states
   */
  static getNextStates(currentState) {
    const transitions = {
      DETECTED: ['ACKNOWLEDGED', 'INVESTIGATING'],
      ACKNOWLEDGED: ['INVESTIGATING', 'RESOLVED'],
      INVESTIGATING: ['IDENTIFIED', 'MONITORING', 'RESOLVED'],
      IDENTIFIED: ['MONITORING', 'RESOLVED'],
      MONITORING: ['RESOLVED', 'INVESTIGATING'],
      RESOLVED: ['CLOSED', 'INVESTIGATING'],
      CLOSED: ['POST_MORTEM'],
      POST_MORTEM: []
    };

    return transitions[currentState] || [];
  }

  /**
   * Calculate time to acknowledge
   * @static
   * @param {string} severity - Severity level
   * @param {Date} detectedAt - Detection time
   * @param {Date} acknowledgedAt - Acknowledgment time
   * @returns {Object} TTA metrics
   */
  static calculateTTA(severity, detectedAt, acknowledgedAt) {
    const severityConfig = IncidentSeverity[severity];
    const actualMinutes = (acknowledgedAt - detectedAt) / 60000;
    const targetMinutes = severityConfig.responseTime;

    return {
      actual: actualMinutes,
      target: targetMinutes,
      met: actualMinutes <= targetMinutes,
      variance: actualMinutes - targetMinutes
    };
  }

  /**
   * Calculate time to resolve
   * @static
   * @param {Date} detectedAt - Detection time
   * @param {Date} resolvedAt - Resolution time
   * @returns {Object} TTR metrics
   */
  static calculateTTR(detectedAt, resolvedAt) {
    const minutes = (resolvedAt - detectedAt) / 60000;
    const hours = minutes / 60;

    return {
      minutes: Math.round(minutes),
      hours: Math.round(hours * 10) / 10,
      formatted: hours < 1
        ? `${Math.round(minutes)} minutes`
        : `${Math.round(hours * 10) / 10} hours`
    };
  }

  /**
   * Get communication plan
   * @static
   * @param {string} severity - Severity level
   * @param {string} state - Current state
   * @returns {Object} Communication plan
   */
  static getCommunicationPlan(severity, state) {
    const severityConfig = IncidentSeverity[severity];

    return {
      audiences: severityConfig.communication,
      updateInterval: severityConfig.updateInterval,
      templates: {
        initial: `Investigating ${severity} incident`,
        update: `${severity} incident update - ${state}`,
        resolved: `${severity} incident resolved`
      },
      channels: severity === 'SEV1' || severity === 'SEV2'
        ? ['email', 'slack', 'status-page', 'sms']
        : ['email', 'slack']
    };
  }

  /**
   * Create incident object
   * @static
   * @param {string} typeId - Incident type ID
   * @param {Object} details - Incident details
   * @returns {Object} Incident object
   */
  static createIncident(typeId, details) {
    const incidentType = this.getIncidentType(typeId);
    if (!incidentType) {
      throw new Error(`Unknown incident type: ${typeId}`);
    }

    const severity = details.severity || incidentType.defaultSeverity;
    const severityConfig = this.getSeverity(severity);

    const incident = {
      id: `INC-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`,
      type: typeId,
      name: incidentType.name,
      category: incidentType.category,
      severity,
      severityLevel: severityConfig.level,
      state: IncidentStates.DETECTED,
      priority: 0, // Will be calculated

      description: details.description || '',
      symptoms: details.symptoms || incidentType.symptoms,
      impactAreas: incidentType.impactAreas,
      affectedUsers: details.affectedUsers || 0,
      affectedServices: details.affectedServices || [],

      runbook: incidentType.runbook,
      metrics: incidentType.metrics,

      timeline: [{
        timestamp: new Date().toISOString(),
        state: IncidentStates.DETECTED,
        action: 'Incident detected',
        user: details.detectedBy || 'system'
      }],

      assignments: {},
      requiredRoles: severityConfig.requiredRoles,
      communicationPlan: this.getCommunicationPlan(severity, IncidentStates.DETECTED),

      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),

      tags: details.tags || [],
      metadata: details.metadata || {}
    };

    incident.priority = this.calculatePriority(incident);

    return incident;
  }

  /**
   * Generate incident summary
   * @static
   * @param {Object} incident - Incident object
   * @returns {string} Incident summary
   */
  static generateSummary(incident) {
    const duration = incident.resolvedAt
      ? this.calculateTTR(new Date(incident.createdAt), new Date(incident.resolvedAt))
      : null;

    return `
Incident: ${incident.id}
Type: ${incident.name}
Severity: ${incident.severity}
State: ${incident.state}
Duration: ${duration ? duration.formatted : 'Ongoing'}
Affected Users: ${incident.affectedUsers}
Affected Services: ${incident.affectedServices.join(', ')}
Impact Areas: ${incident.impactAreas.join(', ')}
    `.trim();
  }
}

// Export everything
module.exports = IncidentTypes;
module.exports.IncidentSeverity = IncidentSeverity;
module.exports.IncidentStates = IncidentStates;
module.exports.IncidentRoles = IncidentRoles;
module.exports.IncidentHelper = IncidentHelper;
