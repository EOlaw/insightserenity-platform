'use strict';

/**
 * @fileoverview Central security module exports
 * @module shared/lib/security
 * @description Provides comprehensive security services including encryption, audit, compliance, and access control
 */

// Encryption services
const EncryptionService = require('./encryption/encryption-service');
const HashService = require('./encryption/hash-service');
const KeyManager = require('./encryption/key-manager');
const CryptoUtils = require('./encryption/crypto-utils');

// Audit services
const AuditService = require('./audit/audit-service');
const AuditLogger = require('./audit/audit-logger');
const AuditEvents = require('./audit/audit-events');
const ComplianceReporter = require('./audit/compliance-reporter');
const AuditTrail = require('./audit/audit-trail');

// Compliance services
const GDPRCompliance = require('./compliance/gdpr-compliance');
const HIPAACompliance = require('./compliance/hipaa-compliance');
const SOXCompliance = require('./compliance/sox-compliance');
const DataRetention = require('./compliance/data-retention');
const PrivacyControls = require('./compliance/privacy-controls');

// Access control services
const RBACService = require('./access-control/rbac-service');
const PermissionService = require('./access-control/permission-service');
const RoleService = require('./access-control/role-service');
const PolicyEngine = require('./access-control/policy-engine');

module.exports = {
  // Encryption
  EncryptionService,
  HashService,
  KeyManager,
  CryptoUtils,
  
  // Audit
  AuditService,
  AuditLogger,
  AuditEvents,
  ComplianceReporter,
  AuditTrail,
  
  // Compliance
  GDPRCompliance,
  HIPAACompliance,
  SOXCompliance,
  DataRetention,
  PrivacyControls,
  
  // Access Control
  RBACService,
  PermissionService,
  RoleService,
  PolicyEngine
};