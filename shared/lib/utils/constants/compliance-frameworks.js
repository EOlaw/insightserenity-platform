'use strict';

/**
 * @fileoverview Compliance frameworks constants and requirements
 * @module shared/lib/utils/constants/compliance-frameworks
 */

/**
 * Compliance frameworks definitions
 * @const {Object}
 */
const ComplianceFrameworks = Object.freeze({
  // Data Protection
  GDPR: {
    id: 'GDPR',
    name: 'General Data Protection Regulation',
    region: 'EU',
    category: 'Data Protection',
    requirements: {
      dataMinimization: true,
      rightToErasure: true,
      dataPortability: true,
      consentManagement: true,
      breachNotification: 72, // hours
      privacyByDesign: true,
      dataProtectionOfficer: true,
      impactAssessment: true
    }
  },

  CCPA: {
    id: 'CCPA',
    name: 'California Consumer Privacy Act',
    region: 'US-CA',
    category: 'Data Protection',
    requirements: {
      rightToKnow: true,
      rightToDelete: true,
      rightToOptOut: true,
      nonDiscrimination: true,
      privacyNotice: true,
      verifiableConsumerRequest: true
    }
  },

  LGPD: {
    id: 'LGPD',
    name: 'Lei Geral de Proteção de Dados',
    region: 'BR',
    category: 'Data Protection',
    requirements: {
      legalBasis: true,
      dataSubjectRights: true,
      dataProtectionOfficer: true,
      internationalTransfers: true,
      securityMeasures: true
    }
  },

  // Healthcare
  HIPAA: {
    id: 'HIPAA',
    name: 'Health Insurance Portability and Accountability Act',
    region: 'US',
    category: 'Healthcare',
    requirements: {
      privacyRule: true,
      securityRule: true,
      breachNotificationRule: true,
      minimumNecessary: true,
      businessAssociateAgreements: true,
      accessControls: true,
      auditLogs: true,
      encryption: true,
      physicalSafeguards: true
    }
  },

  // Financial
  PCI_DSS: {
    id: 'PCI_DSS',
    name: 'Payment Card Industry Data Security Standard',
    region: 'Global',
    category: 'Financial',
    requirements: {
      networkSecurity: true,
      cardholderDataProtection: true,
      vulnerabilityManagement: true,
      accessControl: true,
      regularMonitoring: true,
      securityPolicy: true,
      encryption: true,
      tokenization: true,
      segmentation: true
    },
    levels: {
      1: { transactions: 6000000, quarterly: true },
      2: { transactions: 1000000, quarterly: true },
      3: { transactions: 20000, annually: true },
      4: { transactions: 0, annually: true }
    }
  },

  SOX: {
    id: 'SOX',
    name: 'Sarbanes-Oxley Act',
    region: 'US',
    category: 'Financial',
    requirements: {
      internalControls: true,
      financialReporting: true,
      auditIndependence: true,
      corporateResponsibility: true,
      fraudAccountability: true,
      whistleblowerProtection: true,
      recordRetention: 7 // years
    }
  },

  // Security Standards
  ISO_27001: {
    id: 'ISO_27001',
    name: 'ISO/IEC 27001 Information Security Management',
    region: 'Global',
    category: 'Security',
    requirements: {
      riskAssessment: true,
      assetManagement: true,
      accessControl: true,
      cryptography: true,
      physicalSecurity: true,
      operationsSecurity: true,
      communicationsSecurity: true,
      systemAcquisition: true,
      supplierRelationships: true,
      incidentManagement: true,
      businessContinuity: true,
      compliance: true
    }
  },

  SOC2: {
    id: 'SOC2',
    name: 'Service Organization Control 2',
    region: 'Global',
    category: 'Security',
    trustServiceCriteria: {
      security: true,
      availability: true,
      processingIntegrity: true,
      confidentiality: true,
      privacy: true
    },
    types: {
      type1: 'Point in time',
      type2: 'Period of time (min 6 months)'
    }
  },

  NIST: {
    id: 'NIST',
    name: 'NIST Cybersecurity Framework',
    region: 'US',
    category: 'Security',
    functions: {
      identify: true,
      protect: true,
      detect: true,
      respond: true,
      recover: true
    }
  },

  // Industry Specific
  FERPA: {
    id: 'FERPA',
    name: 'Family Educational Rights and Privacy Act',
    region: 'US',
    category: 'Education',
    requirements: {
      parentalAccess: true,
      studentPrivacy: true,
      directoryInformation: true,
      consentForDisclosure: true,
      recordRetention: true
    }
  },

  GLBA: {
    id: 'GLBA',
    name: 'Gramm-Leach-Bliley Act',
    region: 'US',
    category: 'Financial',
    requirements: {
      financialPrivacyRule: true,
      safeguardsRule: true,
      pretextingProtection: true,
      privacyNotices: true,
      informationSharing: true
    }
  },

  BASEL_III: {
    id: 'BASEL_III',
    name: 'Basel III International Regulatory Framework',
    region: 'Global',
    category: 'Banking',
    requirements: {
      capitalRequirements: true,
      leverageRatio: true,
      liquidityRequirements: true,
      riskManagement: true,
      disclosure: true
    }
  }
});

/**
 * Compliance requirements by category
 * @const {Object}
 */
const ComplianceRequirements = Object.freeze({
  DATA_HANDLING: {
    encryption: {
      atRest: true,
      inTransit: true,
      keyManagement: true
    },
    retention: {
      defined: true,
      automated: true,
      documented: true
    },
    deletion: {
      secure: true,
      verified: true,
      documented: true
    },
    anonymization: {
      techniques: ['masking', 'hashing', 'tokenization'],
      reversible: false
    }
  },

  ACCESS_CONTROL: {
    authentication: {
      multiFactorRequired: true,
      passwordComplexity: true,
      sessionManagement: true
    },
    authorization: {
      roleBasedAccess: true,
      leastPrivilege: true,
      segregationOfDuties: true
    },
    monitoring: {
      accessLogs: true,
      anomalyDetection: true,
      realTimeAlerts: true
    }
  },

  AUDIT_TRAIL: {
    logging: {
      comprehensive: true,
      tamperProof: true,
      timestamped: true,
      centralized: true
    },
    retention: {
      minDays: 90,
      maxDays: 2555, // 7 years
      archival: true
    },
    review: {
      periodic: true,
      automated: true,
      documented: true
    }
  },

  INCIDENT_RESPONSE: {
    detection: {
      realTime: true,
      automated: true,
      comprehensive: true
    },
    response: {
      playbook: true,
      team: true,
      communication: true
    },
    recovery: {
      backups: true,
      restoration: true,
      validation: true
    },
    notification: {
      authorities: true,
      affected: true,
      timeline: 72 // hours
    }
  },

  PRIVACY: {
    consent: {
      explicit: true,
      granular: true,
      withdrawable: true,
      documented: true
    },
    rights: {
      access: true,
      rectification: true,
      erasure: true,
      portability: true,
      restriction: true,
      objection: true
    },
    transparency: {
      privacyPolicy: true,
      dataProcessing: true,
      thirdPartySharing: true
    }
  }
});

/**
 * @class ComplianceHelper
 * @description Helper methods for compliance management
 */
class ComplianceHelper {
  /**
   * Check if framework applies to region
   * @static
   * @param {string} frameworkId - Framework ID
   * @param {string} region - Region code
   * @returns {boolean} True if applies
   */
  static appliesToRegion(frameworkId, region) {
    const framework = ComplianceFrameworks[frameworkId];
    if (!framework) return false;

    return framework.region === 'Global' ||
           framework.region === region ||
           region.startsWith(framework.region);
  }

  /**
   * Get required frameworks for region
   * @static
   * @param {string} region - Region code
   * @param {string} [industry] - Industry type
   * @returns {Array} Required frameworks
   */
  static getRequiredFrameworks(region, industry = null) {
    const required = [];

    for (const [id, framework] of Object.entries(ComplianceFrameworks)) {
      if (this.appliesToRegion(id, region)) {
        if (!industry || framework.category === industry) {
          required.push(framework);
        }
      }
    }

    return required;
  }

  /**
   * Check compliance requirements
   * @static
   * @param {Array<string>} frameworks - Framework IDs
   * @returns {Object} Combined requirements
   */
  static getCombinedRequirements(frameworks) {
    const combined = {};

    for (const frameworkId of frameworks) {
      const framework = ComplianceFrameworks[frameworkId];
      if (framework && framework.requirements) {
        Object.assign(combined, framework.requirements);
      }
    }

    return combined;
  }

  /**
   * Validate data handling compliance
   * @static
   * @param {Object} dataHandling - Data handling configuration
   * @param {Array<string>} frameworks - Framework IDs
   * @returns {Object} Validation result
   */
  static validateDataHandling(dataHandling, frameworks) {
    const issues = [];
    const requirements = this.getCombinedRequirements(frameworks);

    // Check encryption
    if (requirements.encryption && !dataHandling.encryption) {
      issues.push('Encryption is required');
    }

    // Check retention
    if (requirements.recordRetention && !dataHandling.retentionPolicy) {
      issues.push('Data retention policy is required');
    }

    // Check deletion
    if (requirements.rightToErasure && !dataHandling.deletionCapability) {
      issues.push('Data deletion capability is required');
    }

    return {
      compliant: issues.length === 0,
      issues,
      requirements
    };
  }

  /**
   * Get audit requirements
   * @static
   * @param {Array<string>} frameworks - Framework IDs
   * @returns {Object} Audit requirements
   */
  static getAuditRequirements(frameworks) {
    const requirements = {
      logging: false,
      retention: 90, // days
      review: false,
      encryption: false
    };

    for (const frameworkId of frameworks) {
      const framework = ComplianceFrameworks[frameworkId];

      if (framework) {
        if (framework.requirements.auditLogs) {
          requirements.logging = true;
        }

        if (framework.requirements.recordRetention) {
          requirements.retention = Math.max(
            requirements.retention,
            framework.requirements.recordRetention * 365
          );
        }

        if (framework.requirements.encryption) {
          requirements.encryption = true;
        }
      }
    }

    return requirements;
  }

  /**
   * Generate compliance checklist
   * @static
   * @param {string} frameworkId - Framework ID
   * @returns {Array} Checklist items
   */
  static generateChecklist(frameworkId) {
    const framework = ComplianceFrameworks[frameworkId];
    if (!framework) return [];

    const checklist = [];

    for (const [requirement, value] of Object.entries(framework.requirements)) {
      checklist.push({
        requirement,
        required: value,
        category: framework.category,
        framework: framework.name,
        checked: false,
        notes: ''
      });
    }

    return checklist;
  }

  /**
   * Check breach notification requirements
   * @static
   * @param {Array<string>} frameworks - Framework IDs
   * @returns {Object} Notification requirements
   */
  static getBreachNotificationRequirements(frameworks) {
    let shortestDeadline = Infinity;
    const requirements = [];

    for (const frameworkId of frameworks) {
      const framework = ComplianceFrameworks[frameworkId];

      if (framework && framework.requirements.breachNotification) {
        const deadline = framework.requirements.breachNotification;
        shortestDeadline = Math.min(shortestDeadline, deadline);

        requirements.push({
          framework: framework.name,
          deadline: deadline,
          notifyAuthorities: true,
          notifyIndividuals: true
        });
      }
    }

    return {
      required: requirements.length > 0,
      deadline: shortestDeadline === Infinity ? null : shortestDeadline,
      frameworks: requirements
    };
  }
}

// Export both constants and helper
module.exports = ComplianceFrameworks;
module.exports.ComplianceRequirements = ComplianceRequirements;
module.exports.ComplianceHelper = ComplianceHelper;
