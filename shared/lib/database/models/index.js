'use strict';

/**
 * @fileoverview Enhanced model registration with detailed import debugging
 * @module shared/lib/database/models
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 */

const BaseModel = require('./base-model');
const logger = require('../../utils/logger');
const fs = require('fs');
const path = require('path');

/**
 * Model registry for the enhanced hybrid architecture
 * With detailed import debugging to identify missing files
 */

console.log('\n🔍 Starting Enhanced Model Registration with Detailed Debugging...\n');

// Helper function to check if file exists and log the result
function checkFileExists(filePath) {
  const fullPath = path.resolve(__dirname, filePath + '.js');
  const exists = fs.existsSync(fullPath);
  console.log(`${exists ? '✅' : '❌'} File ${exists ? 'EXISTS' : 'MISSING'}: ${filePath}.js`);
  return exists;
}

// Helper function to safely import a model with detailed logging
function safeImport(modelName, filePath, category) {
  console.log(`\n📦 Attempting to import ${modelName}Model from ${filePath}`);
  
  if (!checkFileExists(filePath)) {
    console.log(`⚠️  Skipping ${modelName}Model - file does not exist`);
    return null;
  }
  
  try {
    const model = require(filePath);
    console.log(`✅ Successfully imported ${modelName}Model`);
    return model;
  } catch (error) {
    console.log(`❌ Failed to import ${modelName}Model:`, error.message);
    logger.warn(`Failed to import ${modelName}Model from ${filePath}:`, error.message);
    return null;
  }
}

// ============================================================================
// ADMIN-SERVER MODELS - Administrative Functions (Moved to Top)
// ============================================================================

console.log('\n🔧 === LOADING ADMIN-SERVER MODELS ===\n');

// User Management Admin Models
console.log('\n👤 Loading Admin User Management Models...');
const AdminUserModel = safeImport('AdminUser', './admin-server/user-management/admin-user-model', 'admin-user');
const AdminSessionModel = safeImport('AdminSession', './admin-server/user-management/admin-session-model', 'admin-user');
const UserPermissionModel = safeImport('UserPermission', './admin-server/user-management/user-permission-model', 'admin-user');
const AdminActionLogModel = safeImport('AdminActionLog', './admin-server/user-management/admin-action-log-model', 'admin-user');

// Organization Management Admin Models
console.log('\n🏢 Loading Admin Organization Management Models...');
const OrganizationAdminModel = safeImport('OrganizationAdmin', './admin-server/organization-management/organization-admin-model', 'admin-org');
const OrganizationSettingsModel = safeImport('OrganizationSettings', './admin-server/organization-management/organization-settings-model', 'admin-org');
const BillingConfigurationModel = safeImport('BillingConfiguration', './admin-server/organization-management/billing-configuration-model', 'admin-org');

// Platform Management Admin Models
console.log('\nLoading Admin Platform Management Models...');
const PlatformConfigurationModel = safeImport('PlatformConfiguration', './admin-server/platform-management/configuration-model', 'admin-platform');
const SystemSettingsModel = safeImport('SystemSettings', './admin-server/platform-management/system-settings-model', 'admin-platform');
const MaintenanceScheduleModel = safeImport('MaintenanceSchedule', './admin-server/platform-management/maintenance-schedule-model', 'admin-platform');

// Security Administration Models
console.log('\nLoading Admin Security Administration Models...');
const AccessControlModel = safeImport('AccessControl', './admin-server/security-administration/access-control-model', 'admin-security');
const SecurityPolicyModel = safeImport('SecurityPolicy', './admin-server/security-administration/security-policy-model', 'admin-security');
const ComplianceRuleModel = safeImport('ComplianceRule', './admin-server/security-administration/compliance-rule-model', 'admin-security');
const ThreatDetectionModel = safeImport('ThreatDetection', './admin-server/security-administration/threat-detection-model', 'admin-security');

// Reports & Analytics Admin Models
console.log('\nLoading Admin Reports & Analytics Models...');
const ReportModelClass = safeImport('ReportModel', './admin-server/reports-analytics/report-model', 'admin-reports');
const AnalyticsConfigurationModel = safeImport('AnalyticsConfiguration', './admin-server/reports-analytics/analytics-configuration-model', 'admin-reports');
const DataExportModel = safeImport('DataExport', './admin-server/reports-analytics/data-export-model', 'admin-reports');

// Support Administration Models
console.log('\nLoading Admin Support Administration Models...');
const SupportTicketModel = safeImport('SupportTicket', './admin-server/support-administration/support-ticket-model', 'admin-support');
const KnowledgeBaseModel = safeImport('KnowledgeBase', './admin-server/support-administration/knowledge-base-model', 'admin-support');
const SupportAgentModel = safeImport('SupportAgent', './admin-server/support-administration/support-agent-model', 'admin-support');

// System Monitoring Admin Models
console.log('\nLoading Admin System Monitoring Models...');
const SystemHealthModel = safeImport('SystemHealth', './admin-server/system-monitoring/system-health-model', 'admin-monitoring');
const PerformanceMetricsModel = safeImport('PerformanceMetrics', './admin-server/system-monitoring/performance-metrics-model', 'admin-monitoring');
const AlertConfigurationModel = safeImport('AlertConfiguration', './admin-server/system-monitoring/alert-configuration-model', 'admin-monitoring');

// Billing Administration Models
console.log('\nLoading Admin Billing Administration Models...');
const BillingAdminModel = safeImport('BillingAdmin', './admin-server/billing-administration/billing-admin-model', 'admin-billing');
const PaymentProcessorModel = safeImport('PaymentProcessor', './admin-server/billing-administration/payment-processor-model', 'admin-billing');
const SubscriptionAdminModel = safeImport('SubscriptionAdmin', './admin-server/billing-administration/subscription-admin-model', 'admin-billing');

// ============================================================================
// CORE BUSINESS MODELS - Primary Database
// ============================================================================

console.log('\n=== LOADING CORE BUSINESS MODELS ===\n');

// User Management Models
console.log('\nLoading User Management Models...');
const UserModel = safeImport('User', './users/user-model', 'user');
const UserProfileModel = safeImport('UserProfile', './users/user-profile-model', 'user');
const RoleModel = safeImport('Role', './users/role-model', 'user');
const PermissionModel = safeImport('Permission', './users/permission-model', 'user');

// Organization Models
console.log('\nLoading Organization Models...');
const OrganizationModel = safeImport('Organization', './organizations/organization-model', 'organization');
const OrganizationMemberModel = safeImport('OrganizationMember', './organizations/organization-member-model', 'organization');
const OrganizationInvitationModel = safeImport('OrganizationInvitation', './organizations/organization-invitation-model', 'organization');
const TenantModel = safeImport('Tenant', './organizations/tenant-model', 'organization');

// Configuration Models
console.log('\nLoading Configuration Models...');
const ConfigurationModel = safeImport('Configuration', './configurations/configuration-model', 'configuration');
const SystemConfigurationModel = safeImport('SystemConfiguration', './configurations/system-configuration-model', 'configuration');
const FeatureFlagModel = safeImport('FeatureFlag', './configurations/feature-flag-model', 'configuration');

// Authentication & Security Models
console.log('\nLoading Authentication & Security Models...');
const SessionModel = safeImport('Session', './auth/session-model', 'auth');
const LoginHistoryModel = safeImport('LoginHistory', './auth/login-history-model', 'auth');
const SecurityIncidentModel = safeImport('SecurityIncident', './security/security-incident-model', 'auth');
const ApiKeyModel = safeImport('ApiKey', './auth/api-key-model', 'auth');

// Subscription & Billing Models
console.log('\nLoading Subscription & Billing Models...');
const SubscriptionPlanModel = safeImport('SubscriptionPlan', './billing/subscription-plan-model', 'billing');
const SubscriptionModel = safeImport('Subscription', './billing/subscription-model', 'billing');
const InvoiceModel = safeImport('Invoice', './billing/invoice-model', 'billing');
const PaymentModel = safeImport('Payment', './billing/payment-model', 'billing');

// Integration Models
console.log('\nLoading Integration Models...');
const WebhookModel = safeImport('Webhook', './integrations/webhook-model', 'integration');
const ApiIntegrationModel = safeImport('ApiIntegration', './integrations/api-integration-model', 'integration');
const OAuthProviderModel = safeImport('OAuthProvider', './integrations/oauth-provider-model', 'integration');
const PasskeyModel = safeImport('Passkey', './integrations/passkey-model', 'integration');

// Communication Models
console.log('\nLoading Communication Models...');
const NotificationModel = safeImport('Notification', './communication/notification-model', 'communication');
const EmailTemplateModel = safeImport('EmailTemplate', './communication/email-template-model', 'communication');
const SmsTemplateModel = safeImport('SmsTemplate', './communication/sms-template-model', 'communication');

// ============================================================================
// AUDIT MODELS - Primary Database (consolidated from audit database)
// ============================================================================

console.log('\nLoading Audit Models...');
const AuditLogModel = safeImport('AuditLog', './audit/audit-log-model', 'audit');
const AuditAlertModel = safeImport('AuditAlert', './audit/audit-alert-model', 'audit');
const ComplianceMappingModel = safeImport('ComplianceMapping', './audit/compliance-mapping-model', 'audit');
const DataBreachModel = safeImport('DataBreach', './audit/data-breach-model', 'audit');

// ============================================================================
// ANALYTICS MODELS - Analytics Database or Primary with separate collections
// ============================================================================

console.log('\nLoading Analytics Models...');
const AnalyticsModel = safeImport('Analytics', './analytics/analytics-model', 'analytics');
const MetricsModel = safeImport('Metrics', './analytics/metrics-model', 'analytics');
const EventModel = safeImport('Event', './analytics/event-model', 'analytics');
const UsageModel = safeImport('Usage', './analytics/usage-model', 'analytics');
const PerformanceModel = safeImport('Performance', './analytics/performance-model', 'analytics');

// ============================================================================
// CONTENT & WORKFLOW MODELS - Primary Database
// ============================================================================

console.log('\nLoading Content & Workflow Models...');
const ContentModel = safeImport('Content', './content/content-model', 'content');
const TemplateModel = safeImport('Template', './content/template-model', 'content');
const WorkflowModel = safeImport('Workflow', './workflow/workflow-model', 'workflow');
const TaskModel = safeImport('Task', './workflow/task-model', 'workflow');

// ============================================================================
// COLLECT ALL MODELS
// ============================================================================

console.log('\n📦 === COLLECTING AND REGISTERING MODELS ===\n');

const models = {
  // Admin-Server Models (Now at top)
  AdminUser: AdminUserModel,
  AdminSession: AdminSessionModel,
  UserPermission: UserPermissionModel,
  AdminActionLog: AdminActionLogModel,
  OrganizationAdmin: OrganizationAdminModel,
  OrganizationSettings: OrganizationSettingsModel,
  BillingConfiguration: BillingConfigurationModel,
  PlatformConfiguration: PlatformConfigurationModel,
  SystemSettings: SystemSettingsModel,
  MaintenanceSchedule: MaintenanceScheduleModel,
  AccessControl: AccessControlModel,
  SecurityPolicy: SecurityPolicyModel,
  ComplianceRule: ComplianceRuleModel,
  ThreatDetection: ThreatDetectionModel,
  ReportModel: ReportModelClass,
  AnalyticsConfiguration: AnalyticsConfigurationModel,
  DataExport: DataExportModel,
  SupportTicket: SupportTicketModel,
  KnowledgeBase: KnowledgeBaseModel,
  SupportAgent: SupportAgentModel,
  SystemHealth: SystemHealthModel,
  PerformanceMetrics: PerformanceMetricsModel,
  AlertConfiguration: AlertConfigurationModel,
  BillingAdmin: BillingAdminModel,
  PaymentProcessor: PaymentProcessorModel,
  SubscriptionAdmin: SubscriptionAdminModel,

  // Core User Management
  User: UserModel,
  UserProfile: UserProfileModel,
  Role: RoleModel,
  Permission: PermissionModel,

  // Core Organizations
  Organization: OrganizationModel,
  OrganizationMember: OrganizationMemberModel,
  OrganizationInvitation: OrganizationInvitationModel,
  Tenant: TenantModel,

  // Core Configuration
  Configuration: ConfigurationModel,
  SystemConfiguration: SystemConfigurationModel,
  FeatureFlag: FeatureFlagModel,

  // Core Authentication & Security
  Session: SessionModel,
  LoginHistory: LoginHistoryModel,
  SecurityIncident: SecurityIncidentModel,
  ApiKey: ApiKeyModel,

  // Core Billing
  SubscriptionPlan: SubscriptionPlanModel,
  Subscription: SubscriptionModel,
  Invoice: InvoiceModel,
  Payment: PaymentModel,

  // Core Integrations
  Webhook: WebhookModel,
  ApiIntegration: ApiIntegrationModel,
  OAuthProvider: OAuthProviderModel,
  Passkey: PasskeyModel,

  // Core Communication
  Notification: NotificationModel,
  EmailTemplate: EmailTemplateModel,
  SmsTemplate: SmsTemplateModel,

  // Audit (now in primary database)
  AuditLog: AuditLogModel,
  AuditAlert: AuditAlertModel,
  ComplianceMapping: ComplianceMappingModel,
  DataBreach: DataBreachModel,

  // Analytics
  Analytics: AnalyticsModel,
  Metrics: MetricsModel,
  Event: EventModel,
  Usage: UsageModel,
  Performance: PerformanceModel,

  // Content & Workflow
  Content: ContentModel,
  Template: TemplateModel,
  Workflow: WorkflowModel,
  Task: TaskModel
};

// Filter out null models and register with BaseModel
const registeredModels = {};
const registrationErrors = [];
const skippedModels = [];
const importStats = {
  total: 0,
  successful: 0,
  failed: 0,
  skipped: 0
};

console.log('\n🔄 Processing model registration...\n');

Object.entries(models).forEach(([modelName, ModelClass]) => {
  importStats.total++;
  
  if (ModelClass === null) {
    skippedModels.push(modelName);
    importStats.skipped++;
    console.log(`⚠️  SKIPPED: ${modelName} (file not found)`);
    return;
  }

  if (ModelClass && typeof ModelClass === 'function') {
    try {
      // Register with BaseModel for centralized management
      if (BaseModel.modelRegistry) {
        BaseModel.modelRegistry.set(modelName, ModelClass);
      }
      
      registeredModels[modelName] = ModelClass;
      importStats.successful++;
      
      console.log(`✅ REGISTERED: ${modelName}`);
      logger.debug(`Model registered successfully: ${modelName}`);
    } catch (error) {
      registrationErrors.push({
        modelName,
        error: error.message
      });
      importStats.failed++;
      console.log(`❌ REGISTRATION FAILED: ${modelName} - ${error.message}`);
      logger.warn(`Failed to register model ${modelName}:`, error.message);
    }
  } else {
    importStats.failed++;
    console.log(`❌ INVALID MODEL: ${modelName} (not a function)`);
  }
});

// ============================================================================
// DETAILED LOGGING AND STATISTICS
// ============================================================================

console.log('\n📊 === IMPORT STATISTICS ===\n');
console.log(`Total Models Attempted: ${importStats.total}`);
console.log(`✅ Successfully Imported: ${importStats.successful}`);
console.log(`❌ Failed Imports: ${importStats.failed}`);
console.log(`⚠️  Skipped (File Not Found): ${importStats.skipped}`);
console.log(`📝 Registration Errors: ${registrationErrors.length}`);

if (skippedModels.length > 0) {
  console.log('\n⚠️  === SKIPPED MODELS (FILES NOT FOUND) ===\n');
  skippedModels.forEach(model => console.log(`   - ${model}`));
}

if (registrationErrors.length > 0) {
  console.log('\n❌ === REGISTRATION ERRORS ===\n');
  registrationErrors.forEach(error => {
    console.log(`   - ${error.modelName}: ${error.error}`);
  });
}

console.log('\n✅ === SUCCESSFULLY REGISTERED MODELS ===\n');
Object.keys(registeredModels).forEach(model => console.log(`   - ${model}`));

// Log registration summary
logger.info('Enhanced model registration completed with detailed debugging', {
  totalAttempted: importStats.total,
  successfulImports: importStats.successful,
  failedImports: importStats.failed,
  skippedFiles: importStats.skipped,
  totalRegistered: Object.keys(registeredModels).length,
  registrationErrors: registrationErrors.length,
  skippedModels,
  coreModels: Object.keys(models).filter(key => !key.startsWith('Admin') && 
    !['OrganizationAdmin', 'PlatformConfiguration', 'SystemSettings', 'MaintenanceSchedule',
      'AccessControl', 'SecurityPolicy', 'ComplianceRule', 'ThreatDetection',
      'ReportModel', 'AnalyticsConfiguration', 'DataExport',
      'SupportTicket', 'KnowledgeBase', 'SupportAgent',
      'SystemHealth', 'PerformanceMetrics', 'AlertConfiguration',
      'BillingAdmin', 'PaymentProcessor', 'SubscriptionAdmin'].includes(key)).length,
  adminModels: Object.keys(models).filter(key => key.startsWith('Admin') || 
    ['OrganizationAdmin', 'PlatformConfiguration', 'SystemSettings', 'MaintenanceSchedule',
     'AccessControl', 'SecurityPolicy', 'ComplianceRule', 'ThreatDetection',
     'ReportModel', 'AnalyticsConfiguration', 'DataExport',
     'SupportTicket', 'KnowledgeBase', 'SupportAgent',
     'SystemHealth', 'PerformanceMetrics', 'AlertConfiguration',
     'BillingAdmin', 'PaymentProcessor', 'SubscriptionAdmin'].includes(key)).length
});

console.log('\n🎉 Model Registration Process Complete!\n');

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
    adminUser: ['AdminUser', 'AdminSession', 'UserPermission', 'AdminActionLog'],
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
    totalAttempted: importStats.total,
    successfulImports: importStats.successful,
    failedImports: importStats.failed,
    skippedFiles: importStats.skipped,
    registrationErrors: registrationErrors.length,
    coreModels: Object.keys(getCoreModels()).length,
    adminModels: Object.keys(getAdminModels()).length,
    skippedModels,
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
module.exports.skippedModels = skippedModels;
module.exports.importStats = importStats;