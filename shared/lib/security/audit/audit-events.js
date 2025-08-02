'use strict';

/**
 * @fileoverview Complete Audit Events System with Class-Based Architecture
 * @module shared/lib/security/audit/audit-events
 * @version 3.0.0
 */

/**
 * Event severity levels enumeration
 * @readonly
 * @enum {string}
 */
const EventSeverity = Object.freeze({
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
  INFO: 'info'
});

/**
 * Event categories for filtering and reporting
 * @readonly
 * @enum {string}
 */
const EventCategories = Object.freeze({
  AUTHENTICATION: 'authentication',
  AUTHORIZATION: 'authorization',
  USER_MANAGEMENT: 'user_management',
  DATA_ACCESS: 'data_access',
  SECURITY: 'security',
  SYSTEM: 'system',
  CONFIGURATION: 'configuration',
  COMPLIANCE: 'compliance',
  BUSINESS: 'business',
  COMMUNICATION: 'communication',
  API: 'api',
  ORGANIZATION: 'organization'
});

/**
 * Risk scoring weights for different event types
 * Higher numbers indicate higher risk (0-100 scale)
 * @readonly
 * @type {Object}
 */
const RiskWeights = Object.freeze({
  // Critical security events
  'auth.privilege.escalation': 30,
  'security.threat.detected': 25,
  'security.unauthorized.access': 20,
  'security.brute.force.detected': 18,
  'compliance.violation.detected': 16,
  'security.policy.violation': 15,
  
  // High risk events
  'data.mass.delete': 14,
  'data.mass.update': 12,
  'auth.mfa.bypass': 12,
  'system.error': 10,
  'auth.login.failure': 8,
  'data.export': 7,
  'security.suspicious.activity': 6,
  
  // Medium risk events
  'data.delete': 5,
  'data.update': 4,
  'user.role.assign': 4,
  'config.security.change': 4,
  'data.access': 3,
  'system.performance.degradation': 3,
  
  // Low risk events
  'data.create': 2,
  'data.read': 2,
  'auth.login.success': 1,
  'user.profile.update': 1,
  'communication.email.send': 1
});

/**
 * Centralized audit event definitions organized by category
 * @class AuditEventsRegistry
 */
class AuditEventsRegistry {
  constructor() {
    this._events = this._initializeEvents();
    this._metadata = this._initializeMetadata();
    Object.freeze(this._events);
    Object.freeze(this._metadata);
  }

  /**
   * Initialize all audit events organized by namespace
   * @private
   * @returns {Object} Complete events registry
   */
  _initializeEvents() {
    return {
      /**
       * Authentication related events
       * @namespace AUTH
       */
      AUTH: {
        LOGIN_SUCCESS: 'auth.login.success',
        LOGIN_FAILURE: 'auth.login.failure',
        LOGOUT: 'auth.logout',
        PASSWORD_CHANGE: 'auth.password.change',
        PASSWORD_RESET_REQUEST: 'auth.password.reset.request',
        PASSWORD_RESET_COMPLETE: 'auth.password.reset.complete',
        MFA_ENABLE: 'auth.mfa.enable',
        MFA_DISABLE: 'auth.mfa.disable',
        MFA_VERIFY_SUCCESS: 'auth.mfa.verify.success',
        MFA_VERIFY_FAILURE: 'auth.mfa.verify.failure',
        MFA_BYPASS: 'auth.mfa.bypass',
        SESSION_CREATE: 'auth.session.create',
        SESSION_DESTROY: 'auth.session.destroy',
        SESSION_EXPIRE: 'auth.session.expire',
        TOKEN_CREATE: 'auth.token.create',
        TOKEN_REVOKE: 'auth.token.revoke',
        TOKEN_REFRESH: 'auth.token.refresh',
        OAUTH_CONNECT: 'auth.oauth.connect',
        OAUTH_DISCONNECT: 'auth.oauth.disconnect',
        PRIVILEGE_ESCALATION: 'auth.privilege.escalation',
        IMPERSONATION_START: 'auth.impersonation.start',
        IMPERSONATION_END: 'auth.impersonation.end'
      },

      /**
       * User management events
       * @namespace USER
       */
      USER: {
        CREATE: 'user.create',
        UPDATE: 'user.update',
        DELETE: 'user.delete',
        ACTIVATE: 'user.activate',
        DEACTIVATE: 'user.deactivate',
        SUSPEND: 'user.suspend',
        UNSUSPEND: 'user.unsuspend',
        PROFILE_UPDATE: 'user.profile.update',
        EMAIL_CHANGE: 'user.email.change',
        EMAIL_VERIFY: 'user.email.verify',
        PHONE_CHANGE: 'user.phone.change',
        PHONE_VERIFY: 'user.phone.verify',
        ROLE_ASSIGN: 'user.role.assign',
        ROLE_REMOVE: 'user.role.remove',
        ROLE_CHANGE: 'user.role.change',
        PERMISSION_GRANT: 'user.permission.grant',
        PERMISSION_REVOKE: 'user.permission.revoke',
        GROUP_ADD: 'user.group.add',
        GROUP_REMOVE: 'user.group.remove',
        CONSENT_GRANT: 'user.consent.grant',
        CONSENT_REVOKE: 'user.consent.revoke',
        CONSENT_CHANGE: 'user.consent.change'
      },

      /**
       * Organization and tenant events
       * @namespace ORGANIZATION
       */
      ORGANIZATION: {
        CREATE: 'organization.create',
        UPDATE: 'organization.update',
        DELETE: 'organization.delete',
        ACTIVATE: 'organization.activate',
        DEACTIVATE: 'organization.deactivate',
        SUSPEND: 'organization.suspend',
        MEMBER_ADD: 'organization.member.add',
        MEMBER_REMOVE: 'organization.member.remove',
        MEMBER_UPDATE: 'organization.member.update',
        OWNER_CHANGE: 'organization.owner.change',
        SETTINGS_UPDATE: 'organization.settings.update',
        SUBSCRIPTION_CREATE: 'organization.subscription.create',
        SUBSCRIPTION_UPDATE: 'organization.subscription.update',
        SUBSCRIPTION_CANCEL: 'organization.subscription.cancel',
        BILLING_UPDATE: 'organization.billing.update',
        TENANT_CREATE: 'organization.tenant.create',
        TENANT_UPDATE: 'organization.tenant.update',
        TENANT_DELETE: 'organization.tenant.delete',
        INVITATION_SEND: 'organization.invitation.send',
        INVITATION_ACCEPT: 'organization.invitation.accept',
        INVITATION_DECLINE: 'organization.invitation.decline',
        INVITATION_REVOKE: 'organization.invitation.revoke'
      },

      /**
       * Data access and modification events
       * @namespace DATA
       */
      DATA: {
        CREATE: 'data.create',
        READ: 'data.read',
        UPDATE: 'data.update',
        DELETE: 'data.delete',
        ACCESS: 'data.access',
        EXPORT: 'data.export',
        IMPORT: 'data.import',
        DOWNLOAD: 'data.download',
        UPLOAD: 'data.upload',
        SHARE: 'data.share',
        UNSHARE: 'data.unshare',
        MASS_UPDATE: 'data.mass.update',
        MASS_DELETE: 'data.mass.delete',
        BACKUP_CREATE: 'data.backup.create',
        BACKUP_RESTORE: 'data.backup.restore',
        ARCHIVE: 'data.archive',
        UNARCHIVE: 'data.unarchive',
        ENCRYPT: 'data.encrypt',
        DECRYPT: 'data.decrypt',
        ANONYMIZE: 'data.anonymize',
        RETENTION_APPLY: 'data.retention.apply'
      },

      /**
       * Security related events
       * @namespace SECURITY
       */
      SECURITY: {
        ACCESS_DENIED: 'security.access.denied',
        UNAUTHORIZED_ACCESS: 'security.unauthorized.access',
        SUSPICIOUS_ACTIVITY: 'security.suspicious.activity',
        THREAT_DETECTED: 'security.threat.detected',
        THREAT_BLOCKED: 'security.threat.blocked',
        BRUTE_FORCE_DETECTED: 'security.brute.force.detected',
        IP_BLOCKED: 'security.ip.blocked',
        IP_UNBLOCKED: 'security.ip.unblocked',
        FIREWALL_RULE_ADD: 'security.firewall.rule.add',
        FIREWALL_RULE_REMOVE: 'security.firewall.rule.remove',
        ENCRYPTION_KEY_CREATE: 'security.encryption.key.create',
        ENCRYPTION_KEY_ROTATE: 'security.encryption.key.rotate',
        ENCRYPTION_KEY_REVOKE: 'security.encryption.key.revoke',
        CERTIFICATE_CREATE: 'security.certificate.create',
        CERTIFICATE_RENEW: 'security.certificate.renew',
        CERTIFICATE_REVOKE: 'security.certificate.revoke',
        VULNERABILITY_DETECTED: 'security.vulnerability.detected',
        VULNERABILITY_PATCHED: 'security.vulnerability.patched',
        POLICY_VIOLATION: 'security.policy.violation',
        COMPLIANCE_VIOLATION: 'security.compliance.violation'
      },

      /**
       * System and configuration events
       * @namespace SYSTEM
       */
      SYSTEM: {
        START: 'system.start',
        STOP: 'system.stop',
        RESTART: 'system.restart',
        CONFIG_CHANGE: 'system.config.change',
        UPDATE_START: 'system.update.start',
        UPDATE_COMPLETE: 'system.update.complete',
        UPDATE_FAILURE: 'system.update.failure',
        BACKUP_START: 'system.backup.start',
        BACKUP_COMPLETE: 'system.backup.complete',
        BACKUP_FAILURE: 'system.backup.failure',
        MAINTENANCE_START: 'system.maintenance.start',
        MAINTENANCE_END: 'system.maintenance.end',
        ERROR: 'system.error',
        WARNING: 'system.warning',
        PERFORMANCE_DEGRADATION: 'system.performance.degradation',
        RESOURCE_LIMIT_REACHED: 'system.resource.limit.reached',
        SERVICE_START: 'system.service.start',
        SERVICE_STOP: 'system.service.stop',
        SERVICE_FAILURE: 'system.service.failure',
        DATABASE_CONNECTION: 'system.database.connection',
        DATABASE_DISCONNECTION: 'system.database.disconnection',
        CACHE_CLEAR: 'system.cache.clear'
      },

      /**
       * API and integration events
       * @namespace API
       */
      API: {
        KEY_CREATE: 'api.key.create',
        KEY_UPDATE: 'api.key.update',
        KEY_DELETE: 'api.key.delete',
        KEY_ROTATE: 'api.key.rotate',
        KEY_REVOKE: 'api.key.revoke',
        RATE_LIMIT_EXCEEDED: 'api.rate.limit.exceeded',
        WEBHOOK_CREATE: 'api.webhook.create',
        WEBHOOK_UPDATE: 'api.webhook.update',
        WEBHOOK_DELETE: 'api.webhook.delete',
        WEBHOOK_TRIGGER: 'api.webhook.trigger',
        WEBHOOK_FAILURE: 'api.webhook.failure',
        INTEGRATION_CONNECT: 'api.integration.connect',
        INTEGRATION_DISCONNECT: 'api.integration.disconnect',
        INTEGRATION_SYNC: 'api.integration.sync',
        INTEGRATION_ERROR: 'api.integration.error',
        REQUEST_SUCCESS: 'api.request.success',
        REQUEST_FAILURE: 'api.request.failure',
        DEPRECATED_ENDPOINT_USE: 'api.deprecated.endpoint.use'
      },

      /**
       * Configuration and settings events
       * @namespace CONFIG
       */
      CONFIG: {
        CREATE: 'config.create',
        UPDATE: 'config.update',
        DELETE: 'config.delete',
        RESET: 'config.reset',
        IMPORT: 'config.import',
        EXPORT: 'config.export',
        FEATURE_ENABLE: 'config.feature.enable',
        FEATURE_DISABLE: 'config.feature.disable',
        SECURITY_CHANGE: 'config.security.change',
        PERMISSION_CHANGE: 'config.permission.change',
        WORKFLOW_CREATE: 'config.workflow.create',
        WORKFLOW_UPDATE: 'config.workflow.update',
        WORKFLOW_DELETE: 'config.workflow.delete',
        POLICY_CREATE: 'config.policy.create',
        POLICY_UPDATE: 'config.policy.update',
        POLICY_DELETE: 'config.policy.delete',
        TEMPLATE_CREATE: 'config.template.create',
        TEMPLATE_UPDATE: 'config.template.update',
        TEMPLATE_DELETE: 'config.template.delete'
      },

      /**
       * Compliance and regulatory events
       * @namespace COMPLIANCE
       */
      COMPLIANCE: {
        AUDIT_START: 'compliance.audit.start',
        AUDIT_COMPLETE: 'compliance.audit.complete',
        REPORT_GENERATE: 'compliance.report.generate',
        REPORT_EXPORT: 'compliance.report.export',
        VIOLATION_DETECTED: 'compliance.violation.detected',
        VIOLATION_RESOLVED: 'compliance.violation.resolved',
        CONSENT_REQUEST: 'compliance.consent.request',
        CONSENT_GRANTED: 'compliance.consent.granted',
        CONSENT_DENIED: 'compliance.consent.denied',
        CONSENT_WITHDRAWN: 'compliance.consent.withdrawn',
        DATA_REQUEST: 'compliance.data.request',
        DATA_PROVIDED: 'compliance.data.provided',
        DATA_DELETED: 'compliance.data.deleted',
        RETENTION_APPLIED: 'compliance.retention.applied',
        EVIDENCE_COLLECT: 'compliance.evidence.collect',
        POLICY_ACKNOWLEDGE: 'compliance.policy.acknowledge'
      },

      /**
       * Business process events
       * @namespace BUSINESS
       */
      BUSINESS: {
        PROJECT_CREATE: 'business.project.create',
        PROJECT_UPDATE: 'business.project.update',
        PROJECT_DELETE: 'business.project.delete',
        PROJECT_COMPLETE: 'business.project.complete',
        TASK_CREATE: 'business.task.create',
        TASK_UPDATE: 'business.task.update',
        TASK_DELETE: 'business.task.delete',
        TASK_COMPLETE: 'business.task.complete',
        WORKFLOW_START: 'business.workflow.start',
        WORKFLOW_COMPLETE: 'business.workflow.complete',
        WORKFLOW_CANCEL: 'business.workflow.cancel',
        APPROVAL_REQUEST: 'business.approval.request',
        APPROVAL_GRANT: 'business.approval.grant',
        APPROVAL_DENY: 'business.approval.deny',
        TRANSACTION_CREATE: 'business.transaction.create',
        TRANSACTION_UPDATE: 'business.transaction.update',
        TRANSACTION_CANCEL: 'business.transaction.cancel',
        DOCUMENT_CREATE: 'business.document.create',
        DOCUMENT_UPDATE: 'business.document.update',
        DOCUMENT_DELETE: 'business.document.delete',
        DOCUMENT_SIGN: 'business.document.sign'
      },

      /**
       * Communication and notification events
       * @namespace COMMUNICATION
       */
      COMMUNICATION: {
        EMAIL_SEND: 'communication.email.send',
        EMAIL_BOUNCE: 'communication.email.bounce',
        EMAIL_OPEN: 'communication.email.open',
        EMAIL_CLICK: 'communication.email.click',
        SMS_SEND: 'communication.sms.send',
        SMS_DELIVER: 'communication.sms.deliver',
        SMS_FAIL: 'communication.sms.fail',
        NOTIFICATION_SEND: 'communication.notification.send',
        NOTIFICATION_READ: 'communication.notification.read',
        NOTIFICATION_DISMISS: 'communication.notification.dismiss',
        ALERT_CREATE: 'communication.alert.create',
        ALERT_ACKNOWLEDGE: 'communication.alert.acknowledge',
        ALERT_RESOLVE: 'communication.alert.resolve',
        BROADCAST_SEND: 'communication.broadcast.send'
      }
    };
  }

  /**
   * Initialize event metadata mappings
   * @private
   * @returns {Map} Event metadata map
   */
  _initializeMetadata() {
    const metadata = new Map();

    // Authentication events metadata
    metadata.set(this._events.AUTH.LOGIN_SUCCESS, {
      category: EventCategories.AUTHENTICATION,
      severity: EventSeverity.INFO,
      description: 'User successfully logged in',
      requiresNotification: false
    });

    metadata.set(this._events.AUTH.LOGIN_FAILURE, {
      category: EventCategories.AUTHENTICATION,
      severity: EventSeverity.MEDIUM,
      description: 'Failed login attempt',
      requiresNotification: false
    });

    metadata.set(this._events.AUTH.MFA_BYPASS, {
      category: EventCategories.AUTHENTICATION,
      severity: EventSeverity.CRITICAL,
      description: 'Multi-factor authentication was bypassed',
      requiresNotification: true
    });

    metadata.set(this._events.AUTH.PRIVILEGE_ESCALATION, {
      category: EventCategories.AUTHORIZATION,
      severity: EventSeverity.CRITICAL,
      description: 'User privileges were escalated',
      requiresNotification: true
    });

    // Security events metadata
    metadata.set(this._events.SECURITY.THREAT_DETECTED, {
      category: EventCategories.SECURITY,
      severity: EventSeverity.HIGH,
      description: 'Security threat detected',
      requiresNotification: true
    });

    metadata.set(this._events.SECURITY.UNAUTHORIZED_ACCESS, {
      category: EventCategories.SECURITY,
      severity: EventSeverity.HIGH,
      description: 'Unauthorized access attempt',
      requiresNotification: true
    });

    metadata.set(this._events.SECURITY.POLICY_VIOLATION, {
      category: EventCategories.SECURITY,
      severity: EventSeverity.MEDIUM,
      description: 'Security policy violation detected',
      requiresNotification: true
    });

    // Data events metadata
    metadata.set(this._events.DATA.MASS_DELETE, {
      category: EventCategories.DATA_ACCESS,
      severity: EventSeverity.HIGH,
      description: 'Mass data deletion performed',
      requiresNotification: true
    });

    metadata.set(this._events.DATA.EXPORT, {
      category: EventCategories.DATA_ACCESS,
      severity: EventSeverity.MEDIUM,
      description: 'Data exported from system',
      requiresNotification: false
    });

    // System events metadata
    metadata.set(this._events.SYSTEM.ERROR, {
      category: EventCategories.SYSTEM,
      severity: EventSeverity.HIGH,
      description: 'System error occurred',
      requiresNotification: true
    });

    metadata.set(this._events.SYSTEM.CONFIG_CHANGE, {
      category: EventCategories.SYSTEM,
      severity: EventSeverity.MEDIUM,
      description: 'System configuration changed',
      requiresNotification: false
    });

    metadata.set(this._events.SYSTEM.PERFORMANCE_DEGRADATION, {
      category: EventCategories.SYSTEM,
      severity: EventSeverity.MEDIUM,
      description: 'System performance degradation detected',
      requiresNotification: true
    });

    // Compliance events metadata
    metadata.set(this._events.COMPLIANCE.VIOLATION_DETECTED, {
      category: EventCategories.COMPLIANCE,
      severity: EventSeverity.HIGH,
      description: 'Compliance violation detected',
      requiresNotification: true
    });

    metadata.set(this._events.COMPLIANCE.CONSENT_WITHDRAWN, {
      category: EventCategories.COMPLIANCE,
      severity: EventSeverity.MEDIUM,
      description: 'User consent withdrawn',
      requiresNotification: false
    });

    return metadata;
  }

  /**
   * Get all audit events organized by namespace
   * @returns {Object} Complete events registry
   */
  getEvents() {
    return this._events;
  }

  /**
   * Get metadata for a specific event type
   * @param {string} eventType - Event type constant
   * @returns {Object} Event metadata
   */
  getMetadata(eventType) {
    return this._metadata.get(eventType) || {
      category: EventCategories.SYSTEM,
      severity: EventSeverity.INFO,
      description: 'Unknown event type',
      requiresNotification: false
    };
  }

  /**
   * Get event severity based on event type
   * @param {string} eventType - The audit event type
   * @returns {string} The severity level
   */
  getEventSeverity(eventType) {
    const metadata = this.getMetadata(eventType);
    return metadata.severity;
  }

  /**
   * Get event category based on event type
   * @param {string} eventType - The audit event type
   * @returns {string} The event category
   */
  getEventCategory(eventType) {
    const metadata = this.getMetadata(eventType);
    return metadata.category;
  }

  /**
   * Get risk weight for an event type
   * @param {string} eventType - The audit event type
   * @returns {number} The risk weight (0-30)
   */
  getRiskWeight(eventType) {
    return RiskWeights[eventType] || 1;
  }

  /**
   * Validate if an event type is valid
   * @param {string} eventType - The event type to validate
   * @returns {boolean} True if valid, false otherwise
   */
  isValidEventType(eventType) {
    const allEvents = Object.values(this._events).reduce((acc, category) => {
      return [...acc, ...Object.values(category)];
    }, []);
    
    return allEvents.includes(eventType);
  }

  /**
   * Get all events by category
   * @param {string} category - Event category
   * @returns {Array} Event types in category
   */
  getEventsByCategory(category) {
    const events = [];
    Object.entries(this._events).forEach(([namespace, eventTypes]) => {
      Object.entries(eventTypes).forEach(([key, eventType]) => {
        const metadata = this.getMetadata(eventType);
        if (metadata.category === category) {
          events.push(eventType);
        }
      });
    });
    return events;
  }

  /**
   * Get all events by severity
   * @param {string} severity - Event severity
   * @returns {Array} Event types with severity
   */
  getEventsBySeverity(severity) {
    const events = [];
    Object.entries(this._events).forEach(([namespace, eventTypes]) => {
      Object.entries(eventTypes).forEach(([key, eventType]) => {
        const metadata = this.getMetadata(eventType);
        if (metadata.severity === severity) {
          events.push(eventType);
        }
      });
    });
    return events;
  }

  /**
   * Get all events requiring notification
   * @returns {Array} Event types requiring notification
   */
  getNotificationEvents() {
    const events = [];
    Object.entries(this._events).forEach(([namespace, eventTypes]) => {
      Object.entries(eventTypes).forEach(([key, eventType]) => {
        const metadata = this.getMetadata(eventType);
        if (metadata.requiresNotification) {
          events.push(eventType);
        }
      });
    });
    return events;
  }

  /**
   * Get all event types for a specific category
   * @param {string} category - The category name (e.g., 'AUTH', 'SYSTEM')
   * @returns {Array<string>} Array of event types in the category
   */
  getEventsByNamespace(category) {
    if (!this._events[category]) {
      return [];
    }
    return Object.values(this._events[category]);
  }
}

/**
 * Singleton instance of the audit events registry
 * @type {AuditEventsRegistry}
 */
const auditEventsRegistry = new AuditEventsRegistry();

/**
 * Export the events object for backward compatibility
 * This ensures existing code like AuditEvents.SYSTEM.CONFIG_CHANGE continues to work
 */
const AuditEvents = auditEventsRegistry.getEvents();

/**
 * Utility functions for external use
 */
const getEventSeverity = (eventType) => auditEventsRegistry.getEventSeverity(eventType);
const getEventCategory = (eventType) => auditEventsRegistry.getEventCategory(eventType);
const getRiskWeight = (eventType) => auditEventsRegistry.getRiskWeight(eventType);
const isValidEventType = (eventType) => auditEventsRegistry.isValidEventType(eventType);
const getEventsByCategory = (category) => auditEventsRegistry.getEventsByCategory(category);
const getEventsBySeverity = (severity) => auditEventsRegistry.getEventsBySeverity(severity);
const getNotificationEvents = () => auditEventsRegistry.getNotificationEvents();
const getEventsByNamespace = (namespace) => auditEventsRegistry.getEventsByNamespace(namespace);

/**
 * EventMetadata class for backward compatibility
 * @class EventMetadata
 */
class EventMetadata {
  /**
   * Get metadata for an event type
   * @param {string} eventType - Event type constant
   * @returns {Object} Event metadata
   */
  static getMetadata(eventType) {
    return auditEventsRegistry.getMetadata(eventType);
  }

  /**
   * Get all events by category
   * @param {string} category - Event category
   * @returns {Array} Event types in category
   */
  static getEventsByCategory(category) {
    return auditEventsRegistry.getEventsByCategory(category);
  }

  /**
   * Get all events by severity
   * @param {string} severity - Event severity
   * @returns {Array} Event types with severity
   */
  static getEventsBySeverity(severity) {
    return auditEventsRegistry.getEventsBySeverity(severity);
  }

  /**
   * Get all events requiring notification
   * @returns {Array} Event types requiring notification
   */
  static getNotificationEvents() {
    return auditEventsRegistry.getNotificationEvents();
  }
}

// Export all components
module.exports = {
  AuditEvents,
  EventSeverity,
  EventCategories,
  EventMetadata,
  RiskWeights,
  AuditEventsRegistry,
  auditEventsRegistry,
  getEventSeverity,
  getEventCategory,
  getRiskWeight,
  isValidEventType,
  getEventsByCategory,
  getEventsBySeverity,
  getNotificationEvents,
  getEventsByNamespace
};