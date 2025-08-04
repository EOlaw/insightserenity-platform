'use strict';

/**
 * @fileoverview Compliance frameworks and retention periods constants
 * @module shared/lib/utils/constants/compliance-frameworks
 * @description Class-based constants for compliance framework management
 */

/**
 * Compliance frameworks
 */
class ComplianceFrameworks {
  static GDPR = 'gdpr';
  static HIPAA = 'hipaa';
  static SOX = 'sox';
  static PCI_DSS = 'pci-dss';
  static ISO27001 = 'iso27001';
  static ISO27002 = 'iso27002';
  static ISO27017 = 'iso27017';
  static ISO27018 = 'iso27018';
  static NIST_CSF = 'nist-csf';
  static NIST_800_53 = 'nist-800-53';
  static NIST_800_171 = 'nist-800-171';
  static CCPA = 'ccpa';
  static CPRA = 'cpra';
  static PIPEDA = 'pipeda';
  static LGPD = 'lgpd';
  static PDPA_SINGAPORE = 'pdpa-singapore';
  static PDPA_THAILAND = 'pdpa-thailand';
  static COPPA = 'coppa';
  static FERPA = 'ferpa';
  static GLBA = 'glba';
  static FISMA = 'fisma';
  static FIPS_140_2 = 'fips-140-2';
  static FIPS_199 = 'fips-199';
  static COBIT = 'cobit';
  static COSO = 'coso';
  static CLOUD_SECURITY_ALLIANCE = 'csa';
  static FedRAMP = 'fedramp';
  static ITAR = 'itar';
  static EAR = 'ear';
  static BSI_IT_GRUNDSCHUTZ = 'bsi-it-grundschutz';
  static ENISA = 'enisa';
  static NIS_DIRECTIVE = 'nis-directive';
  static CYBERSECURITY_ACT = 'cybersecurity-act';
  static CISA_CYBERSECURITY = 'cisa-cybersecurity';
  static NERC_CIP = 'nerc-cip';
  static IEC_62443 = 'iec-62443';
  static ISA_99 = 'isa-99';
  static ISO_IEC_27032 = 'iso-iec-27032';
  static ISO_IEC_27035 = 'iso-iec-27035';
  static ISO_IEC_27037 = 'iso-iec-27037';
  static AICPA_SOC = 'aicpa-soc';
  static SOC1 = 'soc1';
  static SOC2 = 'soc2';
  static SOC3 = 'soc3';
  static SSAE18 = 'ssae18';
  static ISAE3402 = 'isae3402';
  static PCI_PA_DSS = 'pci-pa-dss';
  static SWIFT_CSP = 'swift-csp';
  static FFIEC = 'ffiec';
  static BANKING_REGULATION = 'banking-regulation';
  static BASEL_III = 'basel-iii';
  static MiFID_II = 'mifid-ii';
  static GDPR_BCBS = 'gdpr-bcbs';
  static HEALTHCARE_REGULATION = 'healthcare-regulation';
  static FDA_21_CFR_PART_11 = 'fda-21-cfr-part-11';
  static GCP = 'gcp';
  static GAMP_5 = 'gamp-5';
  static CSA_CAIQ = 'csa-caiq';
  static CSA_CCM = 'csa-ccm';
  static CSA_STAR = 'csa-star';
  static CUSTOM = 'custom';

  /**
   * Get all frameworks as array
   * @returns {string[]} Array of compliance frameworks
   */
  static getAll() {
    return Object.values(this).filter(value => typeof value === 'string');
  }

  /**
   * Get frameworks by region
   * @param {string} region - Region name
   * @returns {string[]} Array of frameworks for region
   */
  static getByRegion(region) {
    const regions = {
      'north-america': [
        this.HIPAA,
        this.SOX,
        this.COPPA,
        this.FERPA,
        this.GLBA,
        this.FISMA,
        this.CCPA,
        this.CPRA,
        this.NIST_CSF,
        this.NIST_800_53,
        this.NIST_800_171,
        this.FedRAMP,
        this.NERC_CIP
      ],
      'europe': [
        this.GDPR,
        this.BSI_IT_GRUNDSCHUTZ,
        this.ENISA,
        this.NIS_DIRECTIVE,
        this.CYBERSECURITY_ACT,
        this.MiFID_II
      ],
      'asia-pacific': [
        this.PDPA_SINGAPORE,
        this.PDPA_THAILAND,
        this.PIPEDA,
        this.LGPD
      ],
      'global': [
        this.ISO27001,
        this.ISO27002,
        this.ISO27017,
        this.ISO27018,
        this.PCI_DSS,
        this.COBIT,
        this.COSO,
        this.CLOUD_SECURITY_ALLIANCE,
        this.SOC1,
        this.SOC2,
        this.SOC3
      ]
    };

    return regions[region] || [];
  }

  /**
   * Get frameworks by industry
   * @param {string} industry - Industry name
   * @returns {string[]} Array of frameworks for industry
   */
  static getByIndustry(industry) {
    const industries = {
      healthcare: [
        this.HIPAA,
        this.FDA_21_CFR_PART_11,
        this.GCP,
        this.GAMP_5,
        this.ISO27001
      ],
      finance: [
        this.SOX,
        this.PCI_DSS,
        this.GLBA,
        this.SWIFT_CSP,
        this.FFIEC,
        this.BASEL_III,
        this.MiFID_II,
        this.ISO27001
      ],
      government: [
        this.FISMA,
        this.FedRAMP,
        this.NIST_800_53,
        this.NIST_800_171,
        this.FIPS_140_2,
        this.ITAR,
        this.EAR
      ],
      technology: [
        this.ISO27001,
        this.SOC2,
        this.GDPR,
        this.CCPA,
        this.NIST_CSF,
        this.CSA_STAR
      ],
      energy: [
        this.NERC_CIP,
        this.IEC_62443,
        this.ISA_99,
        this.ISO27001
      ],
      education: [
        this.FERPA,
        this.COPPA,
        this.GDPR,
        this.ISO27001
      ]
    };

    return industries[industry] || [];
  }

  /**
   * Check if framework exists
   * @param {string} framework - Framework to check
   * @returns {boolean} True if framework exists
   */
  static isValid(framework) {
    return this.getAll().includes(framework);
  }

  /**
   * Get framework display name
   * @param {string} framework - Framework identifier
   * @returns {string} Human-readable framework name
   */
  static getDisplayName(framework) {
    const displayNames = {
      [this.GDPR]: 'General Data Protection Regulation',
      [this.HIPAA]: 'Health Insurance Portability and Accountability Act',
      [this.SOX]: 'Sarbanes-Oxley Act',
      [this.PCI_DSS]: 'Payment Card Industry Data Security Standard',
      [this.ISO27001]: 'ISO/IEC 27001:2013',
      [this.ISO27002]: 'ISO/IEC 27002:2013',
      [this.NIST_CSF]: 'NIST Cybersecurity Framework',
      [this.NIST_800_53]: 'NIST SP 800-53',
      [this.CCPA]: 'California Consumer Privacy Act',
      [this.SOC2]: 'SOC 2 Type II',
      [this.FISMA]: 'Federal Information Security Management Act',
      [this.FedRAMP]: 'Federal Risk and Authorization Management Program',
      [this.COBIT]: 'Control Objectives for Information and Related Technologies',
      [this.NERC_CIP]: 'NERC Critical Infrastructure Protection'
    };

    return displayNames[framework] || framework.toUpperCase();
  }

  /**
   * Get framework requirements overview
   * @param {string} framework - Framework identifier
   * @returns {Object} Framework requirements summary
   */
  static getRequirements(framework) {
    const requirements = {
      [this.GDPR]: {
        dataProtection: true,
        consentManagement: true,
        breachNotification: 72, // hours
        dataRetention: true,
        rightToErasure: true,
        dataPortability: true,
        privacyByDesign: true
      },
      [this.HIPAA]: {
        phi_protection: true,
        access_controls: true,
        audit_logs: true,
        breach_notification: 60, // days
        business_associate_agreements: true,
        risk_assessments: true
      },
      [this.SOX]: {
        financial_controls: true,
        audit_trails: true,
        segregation_of_duties: true,
        change_management: true,
        documentation: true
      },
      [this.PCI_DSS]: {
        cardholder_data_protection: true,
        network_security: true,
        access_controls: true,
        monitoring: true,
        vulnerability_management: true,
        security_policies: true
      },
      [this.ISO27001]: {
        isms: true,
        risk_management: true,
        security_controls: true,
        continuous_improvement: true,
        documentation: true,
        internal_audits: true
      }
    };

    return requirements[framework] || {};
  }
}

/**
 * Data retention periods by framework
 */
class RetentionPeriods {
  static GDPR_DEFAULT = { value: 6, unit: 'years' };
  static GDPR_CONSENT = { value: 3, unit: 'years' };
  static GDPR_MARKETING = { value: 3, unit: 'years' };
  static HIPAA_AUDIT_LOGS = { value: 6, unit: 'years' };
  static HIPAA_MEDICAL_RECORDS = { value: 6, unit: 'years' };
  static SOX_FINANCIAL = { value: 7, unit: 'years' };
  static SOX_AUDIT_WORKPAPERS = { value: 7, unit: 'years' };
  static PCI_DSS_LOGS = { value: 1, unit: 'years' };
  static PCI_DSS_VULNERABILITY_SCANS = { value: 1, unit: 'years' };
  static ISO27001_RISK_ASSESSMENTS = { value: 3, unit: 'years' };
  static ISO27001_INCIDENT_REPORTS = { value: 3, unit: 'years' };
  static NIST_AUDIT_LOGS = { value: 1, unit: 'years' };
  static FISMA_SECURITY_CONTROLS = { value: 3, unit: 'years' };
  static CCPA_PERSONAL_DATA = { value: 2, unit: 'years' };
  static COPPA_CHILD_DATA = { value: 0, unit: 'days' }; // Delete immediately when no longer needed
  static FERPA_EDUCATION_RECORDS = { value: 5, unit: 'years' };
  static GLBA_CUSTOMER_DATA = { value: 5, unit: 'years' };

  /**
   * Get retention period for framework and data type
   * @param {string} framework - Compliance framework
   * @param {string} dataType - Type of data
   * @returns {Object} Retention period object with value and unit
   */
  static getRetentionPeriod(framework, dataType) {
    const frameworkPeriods = {
      [ComplianceFrameworks.GDPR]: {
        'personal_data': this.GDPR_DEFAULT,
        'consent_records': this.GDPR_CONSENT,
        'marketing_data': this.GDPR_MARKETING,
        'audit_logs': this.GDPR_DEFAULT
      },
      [ComplianceFrameworks.HIPAA]: {
        'audit_logs': this.HIPAA_AUDIT_LOGS,
        'medical_records': this.HIPAA_MEDICAL_RECORDS,
        'phi': this.HIPAA_MEDICAL_RECORDS
      },
      [ComplianceFrameworks.SOX]: {
        'financial_records': this.SOX_FINANCIAL,
        'audit_workpapers': this.SOX_AUDIT_WORKPAPERS,
        'internal_controls': this.SOX_FINANCIAL
      },
      [ComplianceFrameworks.PCI_DSS]: {
        'audit_logs': this.PCI_DSS_LOGS,
        'vulnerability_scans': this.PCI_DSS_VULNERABILITY_SCANS,
        'cardholder_data': { value: 0, unit: 'days' } // Delete after business need
      },
      [ComplianceFrameworks.ISO27001]: {
        'risk_assessments': this.ISO27001_RISK_ASSESSMENTS,
        'incident_reports': this.ISO27001_INCIDENT_REPORTS,
        'audit_logs': this.ISO27001_RISK_ASSESSMENTS
      },
      [ComplianceFrameworks.CCPA]: {
        'personal_information': this.CCPA_PERSONAL_DATA,
        'audit_logs': this.CCPA_PERSONAL_DATA
      }
    };

    const framework_data = frameworkPeriods[framework];
    if (!framework_data) {
      return { value: 1, unit: 'years' }; // Default retention
    }

    return framework_data[dataType] || framework_data['audit_logs'] || { value: 1, unit: 'years' };
  }

  /**
   * Convert retention period to days
   * @param {Object} period - Retention period object
   * @returns {number} Retention period in days
   */
  static toDays(period) {
    const multipliers = {
      days: 1,
      weeks: 7,
      months: 30,
      years: 365
    };

    return period.value * (multipliers[period.unit] || 1);
  }

  /**
   * Get all standard retention periods
   * @returns {Object} Map of standard retention periods
   */
  static getStandardPeriods() {
    return {
      'immediate': { value: 0, unit: 'days' },
      'short_term': { value: 30, unit: 'days' },
      'medium_term': { value: 1, unit: 'years' },
      'long_term': { value: 7, unit: 'years' },
      'permanent': { value: 999, unit: 'years' }
    };
  }
}

/**
 * Compliance categories
 */
class ComplianceCategories {
  static DATA_PROTECTION = 'data_protection';
  static FINANCIAL = 'financial';
  static HEALTHCARE = 'healthcare';
  static GOVERNMENT = 'government';
  static INDUSTRY_SPECIFIC = 'industry_specific';
  static SECURITY = 'security';
  static PRIVACY = 'privacy';
  static OPERATIONAL = 'operational';

  /**
   * Get category for framework
   * @param {string} framework - Framework identifier
   * @returns {string} Framework category
   */
  static getCategory(framework) {
    const categoryMap = {
      [ComplianceFrameworks.GDPR]: this.DATA_PROTECTION,
      [ComplianceFrameworks.CCPA]: this.DATA_PROTECTION,
      [ComplianceFrameworks.PIPEDA]: this.DATA_PROTECTION,
      [ComplianceFrameworks.HIPAA]: this.HEALTHCARE,
      [ComplianceFrameworks.SOX]: this.FINANCIAL,
      [ComplianceFrameworks.PCI_DSS]: this.FINANCIAL,
      [ComplianceFrameworks.FISMA]: this.GOVERNMENT,
      [ComplianceFrameworks.FedRAMP]: this.GOVERNMENT,
      [ComplianceFrameworks.ISO27001]: this.SECURITY,
      [ComplianceFrameworks.NIST_CSF]: this.SECURITY
    };

    return categoryMap[framework] || this.OPERATIONAL;
  }
}

// Export constants
const COMPLIANCE_FRAMEWORKS = ComplianceFrameworks;
const RETENTION_PERIODS = RetentionPeriods;
const COMPLIANCE_CATEGORIES = ComplianceCategories;

module.exports = {
  ComplianceFrameworks,
  RetentionPeriods,
  ComplianceCategories,
  COMPLIANCE_FRAMEWORKS,
  RETENTION_PERIODS,
  COMPLIANCE_CATEGORIES
};