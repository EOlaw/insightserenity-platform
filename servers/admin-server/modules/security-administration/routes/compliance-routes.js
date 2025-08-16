'use strict';

/**
 * @fileoverview Enterprise compliance routes for regulatory and policy management
 * @module servers/admin-server/modules/security-administration/routes/compliance-routes
 * @requires express
 * @requires module:servers/admin-server/modules/security-administration/controllers/compliance-controller
 * @requires module:shared/lib/middleware/authenticate
 * @requires module:shared/lib/middleware/authorize
 * @requires module:shared/lib/middleware/rate-limit
 * @requires module:shared/lib/middleware/validation/request-validator
 * @requires module:shared/lib/middleware/security/security-headers
 * @requires module:shared/lib/middleware/logging/audit-logger
 * @requires module:shared/lib/middleware/error-handlers/async-error-handler
 * @requires module:shared/lib/middleware/file-validator
 * @requires module:shared/lib/utils/validators/common-validators
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/constants/permissions
 * @requires module:shared/lib/utils/constants/roles
 */

const express = require('express');
const router = express.Router();
const ComplianceController = require('../controllers/compliance-controller');
const authenticate = require('../../../../../shared/lib/middleware/authenticate');
const authorize = require('../../../../../shared/lib/middleware/authorize');
const rateLimit = require('../../../../../shared/lib/middleware/rate-limit');
const requestValidator = require('../../../../../shared/lib/middleware/validation/request-validator');
const securityHeaders = require('../../../../../shared/lib/middleware/security/security-headers');
const auditLogger = require('../../../../../shared/lib/middleware/logging/audit-logger');
const asyncErrorHandler = require('../../../../../shared/lib/middleware/error-handlers/async-error-handler');
const fileValidator = require('../../../../../shared/lib/middleware/file-validator');
const CommonValidator = require('../../../../../shared/lib/utils/validators/common-validators');
const logger = require('../../../../../shared/lib/utils/logger');
const { PERMISSIONS } = require('../../../../../shared/lib/utils/constants/permissions');
const { ROLES } = require('../../../../../shared/lib/utils/constants/roles');

// Initialize controller
const complianceController = new ComplianceController();

// Initialize controller asynchronously
(async () => {
  try {
    await complianceController.initialize();
    logger.info('Compliance Controller initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize Compliance Controller:', error);
  }
})();

// ==================== Middleware Configuration ====================

/**
 * Apply global middleware to all compliance routes
 */
router.use(securityHeaders());
router.use(auditLogger({ module: 'compliance-routes' }));
router.use(authenticate());

/**
 * Rate limiting configurations for different operation types
 */
const rateLimitConfigs = {
  standard: rateLimit({
    windowMs: 60000, // 1 minute
    max: 60,
    message: 'Rate limit exceeded for compliance operations'
  }),
  assessment: rateLimit({
    windowMs: 300000, // 5 minutes
    max: 20,
    message: 'Rate limit exceeded for assessment operations'
  }),
  reporting: rateLimit({
    windowMs: 300000,
    max: 10,
    message: 'Rate limit exceeded for report generation'
  }),
  audit: rateLimit({
    windowMs: 60000,
    max: 30,
    message: 'Rate limit exceeded for audit operations'
  })
};

// ==================== Validation Schemas ====================

const validationSchemas = {
  // Framework Management Schemas
  frameworkManagement: {
    body: {
      framework: { type: 'string', required: true, enum: ['gdpr', 'hipaa', 'sox', 'pci', 'iso27001', 'ccpa'] },
      configuration: { type: 'object' },
      requirements: { type: 'array' },
      controls: { type: 'array' },
      enabled: { type: 'boolean' },
      scope: { type: 'string', enum: ['global', 'organization', 'tenant'] }
    }
  },
  
  // Policy Management Schemas
  policyManagement: {
    body: {
      policyName: { type: 'string', required: true, min: 3, max: 100 },
      policyType: { type: 'string', required: true, enum: ['regulatory', 'internal', 'security', 'privacy'] },
      description: { type: 'string', required: true, max: 1000 },
      requirements: { type: 'array', required: true },
      effectiveDate: { type: 'date', required: true },
      reviewCycle: { type: 'string', enum: ['monthly', 'quarterly', 'annual'] },
      owner: { type: 'string', required: true }
    }
  },
  
  // Assessment Schemas
  assessmentManagement: {
    body: {
      assessmentType: { type: 'string', required: true, enum: ['compliance', 'risk', 'security', 'privacy'] },
      scope: { type: 'object', required: true },
      framework: { type: 'string' },
      assessors: { type: 'array' },
      startDate: { type: 'date', required: true },
      endDate: { type: 'date', required: true },
      methodology: { type: 'string' }
    }
  },
  
  // Audit Schemas
  auditManagement: {
    body: {
      auditType: { type: 'string', required: true, enum: ['internal', 'external', 'regulatory', 'certification'] },
      auditScope: { type: 'object', required: true },
      auditors: { type: 'array', required: true },
      standards: { type: 'array' },
      plannedDate: { type: 'date', required: true },
      duration: { type: 'number', min: 1, max: 365 }
    }
  },
  
  // Reporting Schemas
  reportingManagement: {
    body: {
      reportType: { type: 'string', required: true, enum: ['compliance', 'audit', 'risk', 'executive'] },
      format: { type: 'string', enum: ['pdf', 'xlsx', 'json', 'html'] },
      period: { type: 'object' },
      filters: { type: 'object' },
      recipients: { type: 'array' },
      schedule: { type: 'string', enum: ['once', 'daily', 'weekly', 'monthly', 'quarterly'] }
    }
  },
  
  // Risk Management Schemas
  riskManagement: {
    body: {
      riskType: { type: 'string', required: true, enum: ['operational', 'compliance', 'strategic', 'financial'] },
      description: { type: 'string', required: true },
      impact: { type: 'number', required: true, min: 1, max: 5 },
      likelihood: { type: 'number', required: true, min: 1, max: 5 },
      mitigation: { type: 'object' },
      owner: { type: 'string', required: true }
    }
  }
};

// ==================== Compliance Framework Routes ====================

/**
 * @route GET /api/admin/security/compliance/frameworks
 * @description List compliance frameworks
 * @access Compliance Officer
 */
router.get(
  '/frameworks',
  rateLimitConfigs.standard,
  authorize([ROLES.COMPLIANCE_OFFICER, ROLES.SECURITY_ADMIN]),
  asyncErrorHandler(complianceController.handleFrameworks)
);

/**
 * @route POST /api/admin/security/compliance/frameworks/:operation
 * @description Framework management operations
 * @access Compliance Officer
 */
router.post(
  '/frameworks/:operation',
  rateLimitConfigs.standard,
  authorize([ROLES.COMPLIANCE_OFFICER]),
  requestValidator(validationSchemas.frameworkManagement),
  asyncErrorHandler(complianceController.handleFrameworks)
);

/**
 * @route GET /api/admin/security/compliance/frameworks/:frameworkId
 * @description Get framework details
 * @access Compliance Officer
 */
router.get(
  '/frameworks/:frameworkId',
  rateLimitConfigs.standard,
  authorize([ROLES.COMPLIANCE_OFFICER, ROLES.AUDITOR]),
  asyncErrorHandler(complianceController.handleFrameworks)
);

/**
 * @route PUT /api/admin/security/compliance/frameworks/:frameworkId
 * @description Update framework configuration
 * @access Compliance Officer
 */
router.put(
  '/frameworks/:frameworkId',
  rateLimitConfigs.standard,
  authorize([ROLES.COMPLIANCE_OFFICER]),
  requestValidator(validationSchemas.frameworkManagement),
  asyncErrorHandler(complianceController.handleFrameworks)
);

/**
 * @route POST /api/admin/security/compliance/frameworks/:frameworkId/enable
 * @description Enable compliance framework
 * @access Compliance Officer
 */
router.post(
  '/frameworks/:frameworkId/enable',
  rateLimitConfigs.standard,
  authorize([ROLES.COMPLIANCE_OFFICER]),
  asyncErrorHandler(complianceController.handleFrameworks)
);

/**
 * @route POST /api/admin/security/compliance/frameworks/:frameworkId/disable
 * @description Disable compliance framework
 * @access Compliance Officer
 */
router.post(
  '/frameworks/:frameworkId/disable',
  rateLimitConfigs.standard,
  authorize([ROLES.COMPLIANCE_OFFICER]),
  asyncErrorHandler(complianceController.handleFrameworks)
);

/**
 * @route GET /api/admin/security/compliance/frameworks/:frameworkId/requirements
 * @description Get framework requirements
 * @access Compliance Officer
 */
router.get(
  '/frameworks/:frameworkId/requirements',
  rateLimitConfigs.standard,
  authorize([ROLES.COMPLIANCE_OFFICER, ROLES.AUDITOR]),
  asyncErrorHandler(complianceController.handleFrameworks)
);

/**
 * @route GET /api/admin/security/compliance/frameworks/:frameworkId/controls
 * @description Get framework controls
 * @access Compliance Officer
 */
router.get(
  '/frameworks/:frameworkId/controls',
  rateLimitConfigs.standard,
  authorize([ROLES.COMPLIANCE_OFFICER, ROLES.AUDITOR]),
  asyncErrorHandler(complianceController.handleFrameworks)
);

// ==================== Policy Management Routes ====================

/**
 * @route GET /api/admin/security/compliance/policies
 * @description List compliance policies
 * @access Compliance Officer
 */
router.get(
  '/policies',
  rateLimitConfigs.standard,
  authorize([ROLES.COMPLIANCE_OFFICER, ROLES.POLICY_ADMIN]),
  asyncErrorHandler(complianceController.handlePolicies)
);

/**
 * @route POST /api/admin/security/compliance/policies/:operation
 * @description Policy management operations
 * @access Policy Administrator
 */
router.post(
  '/policies/:operation',
  rateLimitConfigs.standard,
  authorize([ROLES.POLICY_ADMIN]),
  requestValidator(validationSchemas.policyManagement),
  asyncErrorHandler(complianceController.handlePolicies)
);

/**
 * @route GET /api/admin/security/compliance/policies/:policyId
 * @description Get policy details
 * @access Compliance Officer
 */
router.get(
  '/policies/:policyId',
  rateLimitConfigs.standard,
  authorize([ROLES.COMPLIANCE_OFFICER, ROLES.POLICY_ADMIN]),
  asyncErrorHandler(complianceController.handlePolicies)
);

/**
 * @route PUT /api/admin/security/compliance/policies/:policyId
 * @description Update policy
 * @access Policy Administrator
 */
router.put(
  '/policies/:policyId',
  rateLimitConfigs.standard,
  authorize([ROLES.POLICY_ADMIN]),
  requestValidator(validationSchemas.policyManagement),
  asyncErrorHandler(complianceController.handlePolicies)
);

/**
 * @route DELETE /api/admin/security/compliance/policies/:policyId
 * @description Delete policy
 * @access Compliance Officer
 */
router.delete(
  '/policies/:policyId',
  rateLimitConfigs.standard,
  authorize([ROLES.COMPLIANCE_OFFICER]),
  asyncErrorHandler(complianceController.handlePolicies)
);

/**
 * @route POST /api/admin/security/compliance/policies/:policyId/publish
 * @description Publish policy
 * @access Policy Administrator
 */
router.post(
  '/policies/:policyId/publish',
  rateLimitConfigs.standard,
  authorize([ROLES.POLICY_ADMIN]),
  asyncErrorHandler(complianceController.handlePolicies)
);

/**
 * @route POST /api/admin/security/compliance/policies/:policyId/approve
 * @description Approve policy
 * @access Compliance Officer
 */
router.post(
  '/policies/:policyId/approve',
  rateLimitConfigs.standard,
  authorize([ROLES.COMPLIANCE_OFFICER]),
  asyncErrorHandler(complianceController.handlePolicies)
);

/**
 * @route GET /api/admin/security/compliance/policies/:policyId/violations
 * @description Get policy violations
 * @access Compliance Officer
 */
router.get(
  '/policies/:policyId/violations',
  rateLimitConfigs.standard,
  authorize([ROLES.COMPLIANCE_OFFICER]),
  asyncErrorHandler(complianceController.handlePolicies)
);

// ==================== Assessment Routes ====================

/**
 * @route GET /api/admin/security/compliance/assessments
 * @description List compliance assessments
 * @access Compliance Officer
 */
router.get(
  '/assessments',
  rateLimitConfigs.assessment,
  authorize([ROLES.COMPLIANCE_OFFICER, ROLES.AUDITOR]),
  asyncErrorHandler(complianceController.handleAssessments)
);

/**
 * @route POST /api/admin/security/compliance/assessments/:operation
 * @description Assessment operations
 * @access Compliance Officer
 */
router.post(
  '/assessments/:operation',
  rateLimitConfigs.assessment,
  authorize([ROLES.COMPLIANCE_OFFICER]),
  requestValidator(validationSchemas.assessmentManagement),
  asyncErrorHandler(complianceController.handleAssessments)
);

/**
 * @route GET /api/admin/security/compliance/assessments/:assessmentId
 * @description Get assessment details
 * @access Auditor
 */
router.get(
  '/assessments/:assessmentId',
  rateLimitConfigs.assessment,
  authorize([ROLES.AUDITOR, ROLES.COMPLIANCE_OFFICER]),
  asyncErrorHandler(complianceController.handleAssessments)
);

/**
 * @route PUT /api/admin/security/compliance/assessments/:assessmentId
 * @description Update assessment
 * @access Compliance Officer
 */
router.put(
  '/assessments/:assessmentId',
  rateLimitConfigs.assessment,
  authorize([ROLES.COMPLIANCE_OFFICER]),
  requestValidator(validationSchemas.assessmentManagement),
  asyncErrorHandler(complianceController.handleAssessments)
);

/**
 * @route POST /api/admin/security/compliance/assessments/:assessmentId/start
 * @description Start assessment
 * @access Compliance Officer
 */
router.post(
  '/assessments/:assessmentId/start',
  rateLimitConfigs.assessment,
  authorize([ROLES.COMPLIANCE_OFFICER]),
  asyncErrorHandler(complianceController.handleAssessments)
);

/**
 * @route POST /api/admin/security/compliance/assessments/:assessmentId/complete
 * @description Complete assessment
 * @access Compliance Officer
 */
router.post(
  '/assessments/:assessmentId/complete',
  rateLimitConfigs.assessment,
  authorize([ROLES.COMPLIANCE_OFFICER]),
  asyncErrorHandler(complianceController.handleAssessments)
);

/**
 * @route GET /api/admin/security/compliance/assessments/:assessmentId/findings
 * @description Get assessment findings
 * @access Auditor
 */
router.get(
  '/assessments/:assessmentId/findings',
  rateLimitConfigs.assessment,
  authorize([ROLES.AUDITOR, ROLES.COMPLIANCE_OFFICER]),
  asyncErrorHandler(complianceController.handleAssessments)
);

/**
 * @route POST /api/admin/security/compliance/assessments/:assessmentId/evidence
 * @description Upload assessment evidence
 * @access Auditor
 */
router.post(
  '/assessments/:assessmentId/evidence',
  rateLimitConfigs.assessment,
  authorize([ROLES.AUDITOR]),
  fileValidator({ maxSize: 10485760, allowedTypes: ['pdf', 'jpg', 'png', 'doc', 'xlsx'] }),
  asyncErrorHandler(complianceController.handleAssessments)
);

// ==================== Audit Routes ====================

/**
 * @route GET /api/admin/security/compliance/audits
 * @description List compliance audits
 * @access Auditor
 */
router.get(
  '/audits',
  rateLimitConfigs.audit,
  authorize([ROLES.AUDITOR, ROLES.COMPLIANCE_OFFICER]),
  asyncErrorHandler(complianceController.handleAudits)
);

/**
 * @route POST /api/admin/security/compliance/audits/:operation
 * @description Audit operations
 * @access Lead Auditor
 */
router.post(
  '/audits/:operation',
  rateLimitConfigs.audit,
  authorize([ROLES.LEAD_AUDITOR]),
  requestValidator(validationSchemas.auditManagement),
  asyncErrorHandler(complianceController.handleAudits)
);

/**
 * @route GET /api/admin/security/compliance/audits/:auditId
 * @description Get audit details
 * @access Auditor
 */
router.get(
  '/audits/:auditId',
  rateLimitConfigs.audit,
  authorize([ROLES.AUDITOR]),
  asyncErrorHandler(complianceController.handleAudits)
);

/**
 * @route PUT /api/admin/security/compliance/audits/:auditId
 * @description Update audit
 * @access Lead Auditor
 */
router.put(
  '/audits/:auditId',
  rateLimitConfigs.audit,
  authorize([ROLES.LEAD_AUDITOR]),
  requestValidator(validationSchemas.auditManagement),
  asyncErrorHandler(complianceController.handleAudits)
);

/**
 * @route POST /api/admin/security/compliance/audits/:auditId/start
 * @description Start audit
 * @access Lead Auditor
 */
router.post(
  '/audits/:auditId/start',
  rateLimitConfigs.audit,
  authorize([ROLES.LEAD_AUDITOR]),
  asyncErrorHandler(complianceController.handleAudits)
);

/**
 * @route POST /api/admin/security/compliance/audits/:auditId/findings
 * @description Document audit findings
 * @access Auditor
 */
router.post(
  '/audits/:auditId/findings',
  rateLimitConfigs.audit,
  authorize([ROLES.AUDITOR]),
  asyncErrorHandler(complianceController.handleAudits)
);

/**
 * @route GET /api/admin/security/compliance/audits/:auditId/trail
 * @description Get audit trail
 * @access Auditor
 */
router.get(
  '/audits/:auditId/trail',
  rateLimitConfigs.audit,
  authorize([ROLES.AUDITOR]),
  asyncErrorHandler(complianceController.handleAudits)
);

/**
 * @route POST /api/admin/security/compliance/audits/:auditId/report
 * @description Generate audit report
 * @access Lead Auditor
 */
router.post(
  '/audits/:auditId/report',
  rateLimitConfigs.reporting,
  authorize([ROLES.LEAD_AUDITOR]),
  asyncErrorHandler(complianceController.handleAudits)
);

// ==================== Reporting Routes ====================

/**
 * @route GET /api/admin/security/compliance/reports
 * @description List compliance reports
 * @access Compliance Officer
 */
router.get(
  '/reports',
  rateLimitConfigs.reporting,
  authorize([ROLES.COMPLIANCE_OFFICER, ROLES.EXECUTIVE]),
  asyncErrorHandler(complianceController.handleReporting)
);

/**
 * @route POST /api/admin/security/compliance/reports/:operation
 * @description Report generation operations
 * @access Compliance Officer
 */
router.post(
  '/reports/:operation',
  rateLimitConfigs.reporting,
  authorize([ROLES.COMPLIANCE_OFFICER]),
  requestValidator(validationSchemas.reportingManagement),
  asyncErrorHandler(complianceController.handleReporting)
);

/**
 * @route POST /api/admin/security/compliance/reports/generate
 * @description Generate compliance report
 * @access Compliance Officer
 */
router.post(
  '/reports/generate',
  rateLimitConfigs.reporting,
  authorize([ROLES.COMPLIANCE_OFFICER]),
  requestValidator(validationSchemas.reportingManagement),
  asyncErrorHandler(complianceController.handleReporting)
);

/**
 * @route GET /api/admin/security/compliance/reports/:reportId
 * @description Get report details
 * @access Compliance Officer
 */
router.get(
  '/reports/:reportId',
  rateLimitConfigs.reporting,
  authorize([ROLES.COMPLIANCE_OFFICER, ROLES.EXECUTIVE]),
  asyncErrorHandler(complianceController.handleReporting)
);

/**
 * @route GET /api/admin/security/compliance/reports/:reportId/download
 * @description Download report
 * @access Compliance Officer
 */
router.get(
  '/reports/:reportId/download',
  rateLimitConfigs.reporting,
  authorize([ROLES.COMPLIANCE_OFFICER, ROLES.EXECUTIVE]),
  asyncErrorHandler(complianceController.handleReporting)
);

/**
 * @route POST /api/admin/security/compliance/reports/schedule
 * @description Schedule report generation
 * @access Compliance Officer
 */
router.post(
  '/reports/schedule',
  rateLimitConfigs.reporting,
  authorize([ROLES.COMPLIANCE_OFFICER]),
  requestValidator(validationSchemas.reportingManagement),
  asyncErrorHandler(complianceController.handleReporting)
);

/**
 * @route GET /api/admin/security/compliance/reports/dashboard
 * @description Get compliance dashboard
 * @access Executive
 */
router.get(
  '/reports/dashboard',
  rateLimitConfigs.standard,
  authorize([ROLES.EXECUTIVE, ROLES.COMPLIANCE_OFFICER]),
  asyncErrorHandler(complianceController.handleReporting)
);

// ==================== Risk Management Routes ====================

/**
 * @route GET /api/admin/security/compliance/risks
 * @description List compliance risks
 * @access Risk Manager
 */
router.get(
  '/risks',
  rateLimitConfigs.standard,
  authorize([ROLES.RISK_MANAGER, ROLES.COMPLIANCE_OFFICER]),
  asyncErrorHandler(complianceController.handleRiskRemediation)
);

/**
 * @route POST /api/admin/security/compliance/risks/:operation
 * @description Risk management operations
 * @access Risk Manager
 */
router.post(
  '/risks/:operation',
  rateLimitConfigs.standard,
  authorize([ROLES.RISK_MANAGER]),
  requestValidator(validationSchemas.riskManagement),
  asyncErrorHandler(complianceController.handleRiskRemediation)
);

/**
 * @route GET /api/admin/security/compliance/risks/:riskId
 * @description Get risk details
 * @access Risk Manager
 */
router.get(
  '/risks/:riskId',
  rateLimitConfigs.standard,
  authorize([ROLES.RISK_MANAGER, ROLES.COMPLIANCE_OFFICER]),
  asyncErrorHandler(complianceController.handleRiskRemediation)
);

/**
 * @route PUT /api/admin/security/compliance/risks/:riskId
 * @description Update risk assessment
 * @access Risk Manager
 */
router.put(
  '/risks/:riskId',
  rateLimitConfigs.standard,
  authorize([ROLES.RISK_MANAGER]),
  requestValidator(validationSchemas.riskManagement),
  asyncErrorHandler(complianceController.handleRiskRemediation)
);

/**
 * @route POST /api/admin/security/compliance/risks/:riskId/mitigate
 * @description Create risk mitigation plan
 * @access Risk Manager
 */
router.post(
  '/risks/:riskId/mitigate',
  rateLimitConfigs.standard,
  authorize([ROLES.RISK_MANAGER]),
  asyncErrorHandler(complianceController.handleRiskRemediation)
);

/**
 * @route GET /api/admin/security/compliance/risks/matrix
 * @description Get risk matrix
 * @access Risk Manager
 */
router.get(
  '/risks/matrix',
  rateLimitConfigs.standard,
  authorize([ROLES.RISK_MANAGER, ROLES.EXECUTIVE]),
  asyncErrorHandler(complianceController.handleRiskRemediation)
);

/**
 * @route GET /api/admin/security/compliance/risks/heatmap
 * @description Get risk heatmap
 * @access Executive
 */
router.get(
  '/risks/heatmap',
  rateLimitConfigs.standard,
  authorize([ROLES.EXECUTIVE, ROLES.RISK_MANAGER]),
  asyncErrorHandler(complianceController.handleRiskRemediation)
);

// ==================== Remediation Routes ====================

/**
 * @route GET /api/admin/security/compliance/remediation
 * @description List remediation items
 * @access Compliance Officer
 */
router.get(
  '/remediation',
  rateLimitConfigs.standard,
  authorize([ROLES.COMPLIANCE_OFFICER, ROLES.REMEDIATION_MANAGER]),
  asyncErrorHandler(complianceController.handleRiskRemediation)
);

/**
 * @route POST /api/admin/security/compliance/remediation/:operation
 * @description Remediation operations
 * @access Remediation Manager
 */
router.post(
  '/remediation/:operation',
  rateLimitConfigs.standard,
  authorize([ROLES.REMEDIATION_MANAGER]),
  asyncErrorHandler(complianceController.handleRiskRemediation)
);

/**
 * @route GET /api/admin/security/compliance/remediation/:remediationId
 * @description Get remediation details
 * @access Compliance Officer
 */
router.get(
  '/remediation/:remediationId',
  rateLimitConfigs.standard,
  authorize([ROLES.COMPLIANCE_OFFICER, ROLES.REMEDIATION_MANAGER]),
  asyncErrorHandler(complianceController.handleRiskRemediation)
);

/**
 * @route PUT /api/admin/security/compliance/remediation/:remediationId/progress
 * @description Update remediation progress
 * @access Remediation Manager
 */
router.put(
  '/remediation/:remediationId/progress',
  rateLimitConfigs.standard,
  authorize([ROLES.REMEDIATION_MANAGER]),
  asyncErrorHandler(complianceController.handleRiskRemediation)
);

/**
 * @route POST /api/admin/security/compliance/remediation/:remediationId/verify
 * @description Verify remediation completion
 * @access Compliance Officer
 */
router.post(
  '/remediation/:remediationId/verify',
  rateLimitConfigs.standard,
  authorize([ROLES.COMPLIANCE_OFFICER]),
  asyncErrorHandler(complianceController.handleRiskRemediation)
);

// ==================== Control Testing Routes ====================

/**
 * @route GET /api/admin/security/compliance/controls
 * @description List compliance controls
 * @access Compliance Officer
 */
router.get(
  '/controls',
  rateLimitConfigs.standard,
  authorize([ROLES.COMPLIANCE_OFFICER, ROLES.CONTROL_TESTER]),
  asyncErrorHandler(complianceController.handleFrameworks)
);

/**
 * @route POST /api/admin/security/compliance/controls/:controlId/test
 * @description Test compliance control
 * @access Control Tester
 */
router.post(
  '/controls/:controlId/test',
  rateLimitConfigs.standard,
  authorize([ROLES.CONTROL_TESTER]),
  asyncErrorHandler(complianceController.handleFrameworks)
);

/**
 * @route GET /api/admin/security/compliance/controls/:controlId/effectiveness
 * @description Get control effectiveness
 * @access Compliance Officer
 */
router.get(
  '/controls/:controlId/effectiveness',
  rateLimitConfigs.standard,
  authorize([ROLES.COMPLIANCE_OFFICER]),
  asyncErrorHandler(complianceController.handleFrameworks)
);

// ==================== Evidence Management Routes ====================

/**
 * @route GET /api/admin/security/compliance/evidence
 * @description List compliance evidence
 * @access Auditor
 */
router.get(
  '/evidence',
  rateLimitConfigs.standard,
  authorize([ROLES.AUDITOR, ROLES.COMPLIANCE_OFFICER]),
  asyncErrorHandler(complianceController.handleAssessments)
);

/**
 * @route POST /api/admin/security/compliance/evidence/upload
 * @description Upload compliance evidence
 * @access Auditor
 */
router.post(
  '/evidence/upload',
  rateLimitConfigs.standard,
  authorize([ROLES.AUDITOR]),
  fileValidator({ maxSize: 52428800, allowedTypes: ['pdf', 'jpg', 'png', 'doc', 'xlsx', 'zip'] }),
  asyncErrorHandler(complianceController.handleAssessments)
);

/**
 * @route GET /api/admin/security/compliance/evidence/:evidenceId
 * @description Get evidence details
 * @access Auditor
 */
router.get(
  '/evidence/:evidenceId',
  rateLimitConfigs.standard,
  authorize([ROLES.AUDITOR, ROLES.COMPLIANCE_OFFICER]),
  asyncErrorHandler(complianceController.handleAssessments)
);

/**
 * @route POST /api/admin/security/compliance/evidence/:evidenceId/validate
 * @description Validate evidence
 * @access Lead Auditor
 */
router.post(
  '/evidence/:evidenceId/validate',
  rateLimitConfigs.standard,
  authorize([ROLES.LEAD_AUDITOR]),
  asyncErrorHandler(complianceController.handleAssessments)
);

// ==================== Certification Management Routes ====================

/**
 * @route GET /api/admin/security/compliance/certifications
 * @description List compliance certifications
 * @access Compliance Officer
 */
router.get(
  '/certifications',
  rateLimitConfigs.standard,
  authorize([ROLES.COMPLIANCE_OFFICER]),
  asyncErrorHandler(complianceController.handleFrameworks)
);

/**
 * @route POST /api/admin/security/compliance/certifications/:certificationId/renew
 * @description Renew certification
 * @access Compliance Officer
 */
router.post(
  '/certifications/:certificationId/renew',
  rateLimitConfigs.standard,
  authorize([ROLES.COMPLIANCE_OFFICER]),
  asyncErrorHandler(complianceController.handleFrameworks)
);

/**
 * @route GET /api/admin/security/compliance/certifications/:certificationId/status
 * @description Get certification status
 * @access Compliance Officer
 */
router.get(
  '/certifications/:certificationId/status',
  rateLimitConfigs.standard,
  authorize([ROLES.COMPLIANCE_OFFICER, ROLES.EXECUTIVE]),
  asyncErrorHandler(complianceController.handleFrameworks)
);

// ==================== Regulatory Updates Routes ====================

/**
 * @route GET /api/admin/security/compliance/regulatory/updates
 * @description Get regulatory updates
 * @access Compliance Officer
 */
router.get(
  '/regulatory/updates',
  rateLimitConfigs.standard,
  authorize([ROLES.COMPLIANCE_OFFICER]),
  asyncErrorHandler(complianceController.handleFrameworks)
);

/**
 * @route POST /api/admin/security/compliance/regulatory/updates/:updateId/apply
 * @description Apply regulatory update
 * @access Compliance Officer
 */
router.post(
  '/regulatory/updates/:updateId/apply',
  rateLimitConfigs.standard,
  authorize([ROLES.COMPLIANCE_OFFICER]),
  asyncErrorHandler(complianceController.handleFrameworks)
);

/**
 * @route GET /api/admin/security/compliance/regulatory/impact
 * @description Assess regulatory impact
 * @access Compliance Officer
 */
router.get(
  '/regulatory/impact',
  rateLimitConfigs.standard,
  authorize([ROLES.COMPLIANCE_OFFICER]),
  asyncErrorHandler(complianceController.handleFrameworks)
);

// ==================== Health Check Route ====================

/**
 * @route GET /api/admin/security/compliance/health
 * @description Compliance service health check
 * @access Public (Internal only)
 */
router.get(
  '/health',
  asyncErrorHandler(async (req, res) => {
    res.status(200).json({
      status: 'healthy',
      service: 'compliance',
      timestamp: new Date().toISOString()
    });
  })
);

// ==================== Error Handling Middleware ====================

/**
 * Handle 404 errors for unmatched routes
 */
router.use((req, res, next) => {
  res.status(404).json({
    success: false,
    error: 'Compliance route not found',
    path: req.originalUrl,
    method: req.method
  });
});

/**
 * Global error handler for compliance routes
 */
router.use((error, req, res, next) => {
  logger.error('Compliance route error:', {
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
    user: req.user?.id
  });

  const statusCode = error.statusCode || 500;
  const message = error.message || 'Internal server error';

  res.status(statusCode).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
});

module.exports = router;