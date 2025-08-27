'use strict';

/**
 * @fileoverview Enhanced model registration for hybrid database architecture with admin-server models
 * @module shared/lib/database/models
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 */

const BaseModel = require('./base-model');
const logger = require('../../utils/logger');

/**
 * Model registry for the enhanced hybrid architecture
 * Loads and exports all database models including admin-server models
 */

// ============================================================================
// CORE BUSINESS MODELS - Primary Database
// ============================================================================

// User Management Models
let User, UserProfile, Role, Permission;
try {
  User = require('./users/user-model');
  UserProfile = require('./users/user-profile-model');
  Role = require('./users/role-model');
  Permission = require('./users/permission-model');
  logger.debug('User management models loaded successfully');
} catch (error) {
  logger.warn('Some user management models could not be loaded:', error.message);
}

// Organization Models
let Organization, OrganizationMember, OrganizationInvitation, Tenant;
try {
  Organization = require('./organizations/organization-model');
  OrganizationMember = require('./organizations/organization-member-model');
  OrganizationInvitation = require('./organizations/organization-invitation-model');
  Tenant = require('./organizations/tenant-model');
  logger.debug('Organization models loaded successfully');
} catch (error) {
  logger.warn('Some organization models could not be loaded:', error.message);
}

// Configuration Models
let Configuration, SystemConfiguration, FeatureFlag;
try {
  Configuration = require('./configurations/configuration-model');
  SystemConfiguration = require('./configurations/system-configuration-model');
  FeatureFlag = require('./configurations/feature-flag-model');
  logger.debug('Configuration models loaded successfully');
} catch (error) {
  logger.warn('Some configuration models could not be loaded:', error.message);
}

// Authentication & Security Models
let Session, LoginHistory, SecurityIncident, ApiKey;
try {
  Session = require('./auth/session-model');
  LoginHistory = require('./auth/login-history-model');
  SecurityIncident = require('./security/security-incident-model');
  ApiKey = require('./auth/api-key-model');
  logger.debug('Authentication and security models loaded successfully');
} catch (error) {
  logger.warn('Some authentication/security models could not be loaded:', error.message);
}

// Subscription & Billing Models
let SubscriptionPlan, Subscription, Invoice, Payment;
try {
  SubscriptionPlan = require('./billing/subscription-plan-model');
  Subscription = require('./billing/subscription-model');
  Invoice = require('./billing/invoice-model');
  Payment = require('./billing/payment-model');
  logger.debug('Subscription and billing models loaded successfully');
} catch (error) {
  logger.warn('Some billing models could not be loaded:', error.message);
}

// Integration Models
let Webhook, ApiIntegration, OAuthProvider, Passkey;
try {
  Webhook = require('./integrations/webhook-model');
  ApiIntegration = require('./integrations/api-integration-model');
  OAuthProvider = require('./integrations/oauth-provider-model');
  Passkey = require('./integrations/passkey-model');
  logger.debug('Integration models loaded successfully');
} catch (error) {
  logger.warn('Some integration models could not be loaded:', error.message);
}

// Communication Models
let Notification, EmailTemplate, SmsTemplate;
try {
  Notification = require('./communication/notification-model');
  EmailTemplate = require('./communication/email-template-model');
  SmsTemplate = require('./communication/sms-template-model');
  logger.debug('Communication models loaded successfully');
} catch (error) {
  logger.warn('Some communication models could not be loaded:', error.message);
}

// ============================================================================
// ADMIN-SERVER MODELS - Administrative Functions
// ============================================================================

// User Management Admin Models
let AdminUser, AdminSession, UserPermission, AdminActionLog;
try {
  AdminUser = require('./admin-server/user-management/admin-user-model');
  AdminSession = require('./admin-server/user-management/admin-session-model');
  UserPermission = require('./admin-server/user-management/user-permission-model');
  // AdminActionLog = require('./admin-server/user-management/admin-action-log-model');
  logger.debug('Admin user management models loaded successfully');
} catch (error) {
  logger.warn('Some admin user management models could not be loaded:', error.message);
}

// Organization Management Admin Models
let OrganizationAdmin, OrganizationSettings, BillingConfiguration;
try {
  OrganizationAdmin = require('./admin-server/organization-management/organization-admin-model');
  OrganizationSettings = require('./admin-server/organization-management/organization-settings-model');
  BillingConfiguration = require('./admin-server/organization-management/billing-configuration-model');
  logger.debug('Admin organization management models loaded successfully');
} catch (error) {
  logger.warn('Some admin organization management models could not be loaded:', error.message);
}

// Platform Management Admin Models
let PlatformConfiguration, SystemSettings, MaintenanceSchedule;
try {
  PlatformConfiguration = require('./admin-server/platform-management/configuration-model');
  SystemSettings = require('./admin-server/platform-management/system-settings-model');
  MaintenanceSchedule = require('./admin-server/platform-management/maintenance-schedule-model');
  logger.debug('Admin platform management models loaded successfully');
} catch (error) {
  logger.warn('Some admin platform management models could not be loaded:', error.message);
}

// Security Administration Models
let AccessControl, SecurityPolicy, ComplianceRule, ThreatDetection;
try {
  AccessControl = require('./admin-server/security-administration/access-control-model');
  SecurityPolicy = require('./admin-server/security-administration/security-policy-model');
  ComplianceRule = require('./admin-server/security-administration/compliance-rule-model');
  ThreatDetection = require('./admin-server/security-administration/threat-detection-model');
  logger.debug('Admin security administration models loaded successfully');
} catch (error) {
  logger.warn('Some admin security administration models could not be loaded:', error.message);
}

// Reports & Analytics Admin Models
let ReportModel, AnalyticsConfiguration, DataExport;
try {
  ReportModel = require('./admin-server/reports-analytics/report-model');
  AnalyticsConfiguration = require('./admin-server/reports-analytics/analytics-configuration-model');
  DataExport = require('./admin-server/reports-analytics/data-export-model');
  logger.debug('Admin reports and analytics models loaded successfully');
} catch (error) {
  logger.warn('Some admin reports and analytics models could not be loaded:', error.message);
}

// Support Administration Models
let SupportTicket, KnowledgeBase, SupportAgent;
try {
  SupportTicket = require('./admin-server/support-administration/support-ticket-model');
  KnowledgeBase = require('./admin-server/support-administration/knowledge-base-model');
  SupportAgent = require('./admin-server/support-administration/support-agent-model');
  logger.debug('Admin support administration models loaded successfully');
} catch (error) {
  logger.warn('Some admin support administration models could not be loaded:', error.message);
}

// System Monitoring Admin Models
let SystemHealth, PerformanceMetrics, AlertConfiguration;
try {
  SystemHealth = require('./admin-server/system-monitoring/system-health-model');
  PerformanceMetrics = require('./admin-server/system-monitoring/performance-metrics-model');
  AlertConfiguration = require('./admin-server/system-monitoring/alert-configuration-model');
  logger.debug('Admin system monitoring models loaded successfully');
} catch (error) {
  logger.warn('Some admin system monitoring models could not be loaded:', error.message);
}

// Billing Administration Models
let BillingAdmin, PaymentProcessor, SubscriptionAdmin;
try {
  BillingAdmin = require('./admin-server/billing-administration/billing-admin-model');
  PaymentProcessor = require('./admin-server/billing-administration/payment-processor-model');
  SubscriptionAdmin = require('./admin-server/billing-administration/subscription-admin-model');
  logger.debug('Admin billing administration models loaded successfully');
} catch (error) {
  logger.warn('Some admin billing administration models could not be loaded:', error.message);
}

// ============================================================================
// AUDIT MODELS - Primary Database (consolidated from audit database)
// ============================================================================

let AuditLog, AuditAlert, ComplianceMapping, DataBreach;
try {
  AuditLog = require('./audit/audit-log-model');
  AuditAlert = require('./audit/audit-alert-model');
  ComplianceMapping = require('./audit/compliance-mapping-model');
  DataBreach = require('./audit/data-breach-model');
  logger.debug('Audit models loaded successfully');
} catch (error) {
  logger.warn('Some audit models could not be loaded:', error.message);
}

// ============================================================================
// ANALYTICS MODELS - Analytics Database or Primary with separate collections
// ============================================================================

let Analytics, Metrics, Event, Usage, Performance;
try {
  Analytics = require('./analytics/analytics-model');
  Metrics = require('./analytics/metrics-model');
  Event = require('./analytics/event-model');
  Usage = require('./analytics/usage-model');
  Performance = require('./analytics/performance-model');
  logger.debug('Analytics models loaded successfully');
} catch (error) {
  logger.warn('Some analytics models could not be loaded:', error.message);
}

// ============================================================================
// CONTENT & WORKFLOW MODELS - Primary Database
// ============================================================================

let Content, Template, Workflow, Task;
try {
  Content = require('./content/content-model');
  Template = require('./content/template-model');
  Workflow = require('./workflow/workflow-model');
  Task = require('./workflow/task-model');
  logger.debug('Content and workflow models loaded successfully');
} catch (error) {
  logger.warn('Some content/workflow models could not be loaded:', error.message);
}

// ============================================================================
// EXPORT ALL MODELS
// ============================================================================

const models = {
  // Core User Management
  User,
  UserProfile,
  Role,
  Permission,

  // Core Organizations
  Organization,
  OrganizationMember,
  OrganizationInvitation,
  Tenant,

  // Core Configuration
  Configuration,
  SystemConfiguration,
  FeatureFlag,

  // Core Authentication & Security
  Session,
  LoginHistory,
  SecurityIncident,
  ApiKey,

  // Core Billing
  SubscriptionPlan,
  Subscription,
  Invoice,
  Payment,

  // Core Integrations
  Webhook,
  ApiIntegration,
  OAuthProvider,
  Passkey,

  // Core Communication
  Notification,
  EmailTemplate,
  SmsTemplate,

  // Admin-Server Models
  AdminUser,
  AdminSession,
  UserPermission,
  // AdminActionLog,
  OrganizationAdmin,
  OrganizationSettings,
  BillingConfiguration,
  PlatformConfiguration,
  SystemSettings,
  MaintenanceSchedule,
  AccessControl,
  SecurityPolicy,
  ComplianceRule,
  ThreatDetection,
  ReportModel,
  AnalyticsConfiguration,
  DataExport,
  SupportTicket,
  KnowledgeBase,
  SupportAgent,
  SystemHealth,
  PerformanceMetrics,
  AlertConfiguration,
  BillingAdmin,
  PaymentProcessor,
  SubscriptionAdmin,

  // Audit (now in primary database)
  AuditLog,
  AuditAlert,
  ComplianceMapping,
  DataBreach,

  // Analytics
  Analytics,
  Metrics,
  Event,
  Usage,
  Performance,

  // Content & Workflow
  Content,
  Template,
  Workflow,
  Task
};

// Filter out undefined models and register with BaseModel
const registeredModels = {};
const registrationErrors = [];

Object.entries(models).forEach(([modelName, ModelClass]) => {
  if (ModelClass && typeof ModelClass === 'function') {
    try {
      // Register with BaseModel for centralized management
      if (BaseModel.modelRegistry) {
        BaseModel.modelRegistry.set(modelName, ModelClass);
      }
      
      registeredModels[modelName] = ModelClass;
      
      logger.debug(`Model registered successfully: ${modelName}`);
    } catch (error) {
      registrationErrors.push({
        modelName,
        error: error.message
      });
      logger.warn(`Failed to register model ${modelName}:`, error.message);
    }
  }
});

// Log registration summary
logger.info('Enhanced model registration completed', {
  totalModels: Object.keys(registeredModels).length,
  errors: registrationErrors.length,
  coreModels: Object.keys(models).filter(key => !key.startsWith('Admin')).length,
  adminModels: Object.keys(models).filter(key => key.startsWith('Admin') || 
    ['OrganizationAdmin', 'PlatformConfiguration', 'SystemSettings', 'MaintenanceSchedule',
     'AccessControl', 'SecurityPolicy', 'ComplianceRule', 'ThreatDetection',
     'ReportModel', 'AnalyticsConfiguration', 'DataExport',
     'SupportTicket', 'KnowledgeBase', 'SupportAgent',
     'SystemHealth', 'PerformanceMetrics', 'AlertConfiguration',
     'BillingAdmin', 'PaymentProcessor', 'SubscriptionAdmin'].includes(key)).length
});

if (registrationErrors.length > 0) {
  logger.warn('Model registration errors occurred:', registrationErrors);
}

// ============================================================================
// ENHANCED HELPER FUNCTIONS
// ============================================================================

/**
 * Gets a model by name
 * @param {string} modelName - Model name
 * @returns {Function|null} Model constructor or null
 */
function getModel(modelName) {
  return registeredModels[modelName] || null;
}

/**
 * Gets all registered models
 * @returns {Object} All registered models
 */
function getAllModels() {
  return { ...registeredModels };
}

/**
 * Gets models by category
 * @param {string} category - Model category
 * @returns {Object} Models in the specified category
 */
function getModelsByCategory(category) {
  const categories = {
    user: ['User', 'UserProfile', 'Role', 'Permission'],
    organization: ['Organization', 'OrganizationMember', 'OrganizationInvitation', 'Tenant'],
    configuration: ['Configuration', 'SystemConfiguration', 'FeatureFlag'],
    auth: ['Session', 'LoginHistory', 'SecurityIncident', 'ApiKey'],
    billing: ['SubscriptionPlan', 'Subscription', 'Invoice', 'Payment'],
    integration: ['Webhook', 'ApiIntegration', 'OAuthProvider', 'Passkey'],
    communication: ['Notification', 'EmailTemplate', 'SmsTemplate'],
    audit: ['AuditLog', 'AuditAlert', 'ComplianceMapping', 'DataBreach'],
    analytics: ['Analytics', 'Metrics', 'Event', 'Usage', 'Performance'],
    content: ['Content', 'Template', 'Workflow', 'Task'],
    // Admin-Server Categories
    adminUser: ['AdminUser', 'AdminSession', 'UserPermission'],
    adminOrganization: ['OrganizationAdmin', 'OrganizationSettings', 'BillingConfiguration'],
    adminPlatform: ['PlatformConfiguration', 'SystemSettings', 'MaintenanceSchedule'],
    adminSecurity: ['AccessControl', 'SecurityPolicy', 'ComplianceRule', 'ThreatDetection'],
    adminReports: ['ReportModel', 'AnalyticsConfiguration', 'DataExport'],
    adminSupport: ['SupportTicket', 'KnowledgeBase', 'SupportAgent'],
    adminMonitoring: ['SystemHealth', 'PerformanceMetrics', 'AlertConfiguration'],
    adminBilling: ['BillingAdmin', 'PaymentProcessor', 'SubscriptionAdmin']
  };

  const modelNames = categories[category] || [];
  const categoryModels = {};

  modelNames.forEach(modelName => {
    if (registeredModels[modelName]) {
      categoryModels[modelName] = registeredModels[modelName];
    }
  });

  return categoryModels;
}

/**
 * Gets all admin-server models
 * @returns {Object} All admin-server models
 */
function getAdminModels() {
  const adminModels = {};
  
  Object.entries(registeredModels).forEach(([modelName, ModelClass]) => {
    if (modelName.startsWith('Admin') || 
        ['OrganizationAdmin', 'PlatformConfiguration', 'SystemSettings', 'MaintenanceSchedule',
         'AccessControl', 'SecurityPolicy', 'ComplianceRule', 'ThreatDetection',
         'ReportModel', 'AnalyticsConfiguration', 'DataExport',
         'SupportTicket', 'KnowledgeBase', 'SupportAgent',
         'SystemHealth', 'PerformanceMetrics', 'AlertConfiguration',
         'BillingAdmin', 'PaymentProcessor', 'SubscriptionAdmin'].includes(modelName)) {
      adminModels[modelName] = ModelClass;
    }
  });

  return adminModels;
}

/**
 * Gets all core business models (non-admin)
 * @returns {Object} All core business models
 */
function getCoreModels() {
  const coreModels = {};
  
  Object.entries(registeredModels).forEach(([modelName, ModelClass]) => {
    if (!modelName.startsWith('Admin') && 
        !['OrganizationAdmin', 'PlatformConfiguration', 'SystemSettings', 'MaintenanceSchedule',
          'AccessControl', 'SecurityPolicy', 'ComplianceRule', 'ThreatDetection',
          'ReportModel', 'AnalyticsConfiguration', 'DataExport',
          'SupportTicket', 'KnowledgeBase', 'SupportAgent',
          'SystemHealth', 'PerformanceMetrics', 'AlertConfiguration',
          'BillingAdmin', 'PaymentProcessor', 'SubscriptionAdmin'].includes(modelName)) {
      coreModels[modelName] = ModelClass;
    }
  });

  return coreModels;
}

/**
 * Checks if a model is registered
 * @param {string} modelName - Model name
 * @returns {boolean} True if model is registered
 */
function hasModel(modelName) {
  return !!registeredModels[modelName];
}

/**
 * Gets registration statistics
 * @returns {Object} Registration statistics
 */
function getRegistrationStats() {
  return {
    totalRegistered: Object.keys(registeredModels).length,
    totalErrors: registrationErrors.length,
    coreModels: Object.keys(getCoreModels()).length,
    adminModels: Object.keys(getAdminModels()).length,
    categories: {
      user: getModelsByCategory('user'),
      organization: getModelsByCategory('organization'),
      configuration: getModelsByCategory('configuration'),
      auth: getModelsByCategory('auth'),
      billing: getModelsByCategory('billing'),
      integration: getModelsByCategory('integration'),
      communication: getModelsByCategory('communication'),
      audit: getModelsByCategory('audit'),
      analytics: getModelsByCategory('analytics'),
      content: getModelsByCategory('content'),
      adminUser: getModelsByCategory('adminUser'),
      adminOrganization: getModelsByCategory('adminOrganization'),
      adminPlatform: getModelsByCategory('adminPlatform'),
      adminSecurity: getModelsByCategory('adminSecurity'),
      adminReports: getModelsByCategory('adminReports'),
      adminSupport: getModelsByCategory('adminSupport'),
      adminMonitoring: getModelsByCategory('adminMonitoring'),
      adminBilling: getModelsByCategory('adminBilling')
    }
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

// Export individual models
module.exports = registeredModels;

// Export helper functions
module.exports.getModel = getModel;
module.exports.getAllModels = getAllModels;
module.exports.getModelsByCategory = getModelsByCategory;
module.exports.getAdminModels = getAdminModels;
module.exports.getCoreModels = getCoreModels;
module.exports.hasModel = hasModel;
module.exports.getRegistrationStats = getRegistrationStats;
module.exports.registrationErrors = registrationErrors;