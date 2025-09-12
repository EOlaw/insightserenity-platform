'use strict';

/**
 * @fileoverview Enhanced model registration with customer-services models and detailed import debugging
 * @module shared/lib/database/models
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 */

const BaseModel = require('./base-model');
const logger = require('../../utils/logger');
const fs = require('fs');
const path = require('path');

/**
 * Model registry for the enhanced hybrid architecture including customer-services models
 * With detailed import debugging to identify missing files
 */

console.log('\n🔍 Starting Enhanced Model Registration with Customer Services Models...\n');

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
// CUSTOMER-SERVICES MODELS - Primary Database (Added First)
// ============================================================================

console.log('\n🏢 === LOADING CUSTOMER-SERVICES MODELS ===\n');

// Core Business Models
console.log('\n💼 Loading Customer Services - Core Business Models...');
// User Management Models
console.log('\n👤 Loading User Management Models...');
const UserModel = safeImport('User', './customer-services/core-business/user-management/user-model', 'user');
const UserPerferencesModel = safeImport('UserPreferences', './customer-services/core-business/user-management/user-preferences-model', 'user');
const UserProfileModel = safeImport('UserProfile', './customer-services/core-business/user-management/user-profile-model', 'user');
const UserSessionModel = safeImport('UserSession', './customer-services/core-business/user-management/user-session-model', 'user');
const UserSettingModel = safeImport('UserSetting', './customer-services/core-business/user-management/user-setting-model', 'user');

// Organization Models
console.log('\n🏢 Loading Organization Models...');
const OrganizationModel = safeImport('Organization', './organizations/organization-model', 'organization');
const OrganizationMemberModel = safeImport('OrganizationMember', './organizations/organization-member-model', 'organization');
const OrganizationInvitationModel = safeImport('OrganizationInvitation', './organizations/organization-invitation-model', 'organization');
const TenantModel = safeImport('Tenant', './organizations/tenant-model', 'organization');

console.log('\n💼 Loading Customer Services - Core Business Models...');
const ClientModel = safeImport('Client', './customer-services/core-business/clients/client-model', 'customer-core');
const ClientDocumentModel = safeImport('ClientDocument', './customer-services/core-business/clients/client-document-model', 'customer-core');
const ProjectModel = safeImport('Project', './customer-services/core-business/projects/project-model', 'customer-core');
const ProjectResourceModel = safeImport('ProjectResource', './customer-services/core-business/projects/project-resource-model', 'customer-core');
const ProjectTaskModel = safeImport('ProjectTask', './customer-services/core-business/projects/project-task-model', 'customer-core');
const ProjectTimelineModel = safeImport('ProjectTimeline', './customer-services/core-business/projects/project-timeline-model', 'customer-core');
const ConsultantModel = safeImport('Consultant', './customer-services/core-business/consultants/consultant-model', 'customer-core');
const ConsultantProfileModel = safeImport('ConsultantProfile', './customer-services/core-business/consultants/consultant-profile-model', 'customer-core');
const ConsultantSkillModel = safeImport('ConsultantSkill', './customer-services/core-business/consultants/consultant-skill-model', 'customer-core');
const EngagementModel = safeImport('Engagement', './customer-services/core-business/engagements/engagement-model', 'customer-core');
const EngagementResourceModel = safeImport('EngagementResource', './customer-services/core-business/engagements/engagement-resource-model', 'customer-core');
const EngagementTimelineModel = safeImport('EngagementTimeline', './customer-services/core-business/engagements/engagement-timeline-model', 'customer-core');

// Hosted Organizations Models
console.log('\n🏗️ Loading Customer Services - Hosted Organizations Models...');
const CustomerOrganizationModel = safeImport('CustomerOrganization', './customer-services/hosted-organizations/organizations/organization-model', 'customer-hosted');
const CustomerTenantModel = safeImport('CustomerTenant', './customer-services/hosted-organizations/tenants/tenant-model', 'customer-hosted');
const TenantConfigurationModel = safeImport('TenantConfiguration', './customer-services/hosted-organizations/tenants/tenant-configuration-model', 'customer-hosted');
const CustomerSubscriptionModel = safeImport('CustomerSubscription', './customer-services/hosted-organizations/subscriptions/subscription-model', 'customer-hosted');
const SubscriptionPlanModel = safeImport('SubscriptionPlan', './customer-services/hosted-organizations/subscriptions/subscription-plan-model', 'customer-hosted');
const WhiteLabelModel = safeImport('WhiteLabel', './customer-services/hosted-organizations/white-label/white-label-model', 'customer-hosted');
const WhiteLabelConfigurationModel = safeImport('WhiteLabelConfiguration', './customer-services/hosted-organizations/white-label/white-label-configuration-model', 'customer-hosted');

// Recruitment Services Models
console.log('\n👥 Loading Customer Services - Recruitment Services Models...');
const JobModel = safeImport('Job', './customer-services/recruitment-services/jobs/job-model', 'customer-recruitment');
const JobApplicationModel = safeImport('JobApplication', './customer-services/recruitment-services/jobs/job-application-model', 'customer-recruitment');
const JobRequirementModel = safeImport('JobRequirement', './customer-services/recruitment-services/jobs/job-requirement-model', 'customer-recruitment');
const CandidateModel = safeImport('Candidate', './customer-services/recruitment-services/candidates/candidate-model', 'customer-recruitment');
const CandidateProfileModel = safeImport('CandidateProfile', './customer-services/recruitment-services/candidates/candidate-profile-model', 'customer-recruitment');
const CandidateAssessmentModel = safeImport('CandidateAssessment', './customer-services/recruitment-services/candidates/candidate-assessment-model', 'customer-recruitment');
const ApplicationModel = safeImport('Application', './customer-services/recruitment-services/applications/application-model', 'customer-recruitment');
const ApplicationStageModel = safeImport('ApplicationStage', './customer-services/recruitment-services/applications/application-stage-model', 'customer-recruitment');
const PartnershipModel = safeImport('Partnership', './customer-services/recruitment-services/partnerships/partnership-model', 'customer-recruitment');
const PartnerContractModel = safeImport('PartnerContract', './customer-services/recruitment-services/partnerships/partner-contract-model', 'customer-recruitment');

// ============================================================================
// ADMIN-SERVER MODELS - Administrative Functions
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
console.log('\n⚙️ Loading Admin Platform Management Models...');
const PlatformConfigurationModel = safeImport('PlatformConfiguration', './admin-server/platform-management/configuration-model', 'admin-platform');
const SystemSettingsModel = safeImport('SystemSettings', './admin-server/platform-management/system-settings-model', 'admin-platform');
const ConfigurationModel = safeImport('Configuration', './admin-server/platform-management/configuration-model', 'admin-platform');
const MaintenanceScheduleModel = safeImport('MaintenanceSchedule', './admin-server/platform-management/maintenance-schedule-model', 'admin-platform');

// Security Administration Models
console.log('\n🔒 Loading Admin Security Administration Models...');
const AccessControlModel = safeImport('AccessControl', './admin-server/security-administration/access-control-model', 'admin-security');
const SecurityPolicyModel = safeImport('SecurityPolicy', './admin-server/security-administration/security-policy-model', 'admin-security');
const SecurityIncidentModels = safeImport('SecurityIncident', './admin-server/security-administration/security-incident-model', 'admin-security');
const ComplianceRuleModel = safeImport('ComplianceRule', './admin-server/security-administration/compliance-rule-model', 'admin-security');
const ThreatDetectionModel = safeImport('ThreatDetection', './admin-server/security-administration/threat-detection-model', 'admin-security');

// Reports & Analytics Admin Models
console.log('\n📊 Loading Admin Reports & Analytics Models...');
const ReportModel = safeImport('Report', './admin-server/reports-analytics/report-model', 'admin-reports');
const AnalyticsConfigurationModel = safeImport('Analytics', './admin-server/reports-analytics/analytics-model', 'admin-reports');
const DashboardModel = safeImport('Dashboard', './admin-server/reports-analytics/dashboard-model', 'admin-reports');

// Support Administration Models
console.log('\n🎧 Loading Admin Support Administration Models...');
const EscalationRuleModel = safeImport('EscalationRule', './admin-server/support-administration/escalation-rule-model', 'admin-support');
const SupportTicketModel = safeImport('SupportTicket', './admin-server/support-administration/support-ticket-model', 'admin-support');
const KnowledgeArticleModel = safeImport('KnowledgeArticle', './admin-server/support-administration/knowledge-article-model', 'admin-support');
const SupportAgentModel = safeImport('SupportAgent', './admin-server/support-administration/support-agent-model', 'admin-support');

// System Monitoring Admin Models
console.log('\n📈 Loading Admin System Monitoring Models...');
const SystemHealthModel = safeImport('SystemHealth', './admin-server/system-monitoring/system-health-model', 'admin-monitoring');
const PerformanceMetricsModel = safeImport('PerformanceMetrics', './admin-server/system-monitoring/performance-metrics-model', 'admin-monitoring');
const AlertConfigurationModel = safeImport('AlertConfiguration', './admin-server/system-monitoring/alert-configuration-model', 'admin-monitoring');

// Billing Administration Models
console.log('\n💳 Loading Admin Billing Administration Models...');
const BillingAdminModel = safeImport('BillingAdmin', './admin-server/billing-administration/billing-admin-model', 'admin-billing');
const PaymentProcessorModel = safeImport('PaymentProcessor', './admin-server/billing-administration/payment-processor-model', 'admin-billing');
const SubscriptionAdminModel = safeImport('SubscriptionAdmin', './admin-server/billing-administration/subscription-admin-model', 'admin-billing');

// ============================================================================
// CORE BUSINESS MODELS - Primary Database (Original Models)
// ============================================================================

console.log('\n📋 === LOADING CORE BUSINESS MODELS ===\n');

// User Management Models
console.log('\n👤 Loading User Management Models...');
const RoleModel = safeImport('Role', './users/role-model', 'user');
const PermissionModel = safeImport('Permission', './users/user-permission-model', 'user');

// Configuration Models
console.log('\n⚙️ Loading Configuration Models...');
const ConfigurationModels = safeImport('Configuration', './configurations/configuration-model', 'configuration');
const SystemConfigurationModel = safeImport('SystemConfiguration', './configurations/system-configuration-model', 'configuration');
const FeatureFlagModel = safeImport('FeatureFlag', './configurations/feature-flag-model', 'configuration');

// Authentication & Security Models
console.log('\n🔐 Loading Authentication & Security Models...');
const SessionModel = safeImport('Session', './auth/session-model', 'auth');
const LoginHistoryModel = safeImport('LoginHistory', './auth/login-history-model', 'auth');
const SecurityIncidentModel = safeImport('SecurityIncident', './security/security-incident-model', 'auth');
const ApiKeyModel = safeImport('ApiKey', './auth/api-key-model', 'auth');

// Subscription & Billing Models
console.log('\n💰 Loading Subscription & Billing Models...');
const CoreSubscriptionPlanModel = safeImport('CoreSubscriptionPlan', './billing/subscription-plan-model', 'billing');
const CoreSubscriptionModel = safeImport('CoreSubscription', './billing/subscription-model', 'billing');
const InvoiceModel = safeImport('Invoice', './billing/invoice-model', 'billing');
const PaymentModel = safeImport('Payment', './billing/payment-model', 'billing');

// Integration Models
console.log('\n🔗 Loading Integration Models...');
const WebhookModel = safeImport('Webhook', './integrations/webhook-model', 'integration');
const ApiIntegrationModel = safeImport('ApiIntegration', './integrations/api-integration-model', 'integration');
const OAuthProviderModel = safeImport('OAuthProvider', './integrations/oauth-provider-model', 'integration');
const PasskeyModel = safeImport('Passkey', './integrations/passkey-model', 'integration');

// Communication Models
console.log('\n📧 Loading Communication Models...');
const NotificationModel = safeImport('Notification', './communication/notification-model', 'communication');
const EmailTemplateModel = safeImport('EmailTemplate', './communication/email-template-model', 'communication');
const SmsTemplateModel = safeImport('SmsTemplate', './communication/sms-template-model', 'communication');

// ============================================================================
// AUDIT MODELS - Primary Database (consolidated from audit database)
// ============================================================================

console.log('\n📝 Loading Audit Models...');
const AuditLogModel = safeImport('AuditLog', './audit/audit-log-model', 'audit');
const AuditAlertModel = safeImport('AuditAlert', './audit/audit-alert-model', 'audit');
const ComplianceMappingModel = safeImport('ComplianceMapping', './audit/compliance-mapping-model', 'audit');
const DataBreachModel = safeImport('DataBreach', './audit/data-breach-model', 'audit');

// ============================================================================
// ANALYTICS MODELS - Analytics Database or Primary with separate collections
// ============================================================================

console.log('\n📊 Loading Analytics Models...');
const AnalyticsModel = safeImport('Analytics', './analytics/analytics-model', 'analytics');
const MetricsModel = safeImport('Metrics', './analytics/metrics-model', 'analytics');
const EventModel = safeImport('Event', './analytics/event-model', 'analytics');
const UsageModel = safeImport('Usage', './analytics/usage-model', 'analytics');
const PerformanceModel = safeImport('Performance', './analytics/performance-model', 'analytics');

// ============================================================================
// CONTENT & WORKFLOW MODELS - Primary Database
// ============================================================================

console.log('\n📄 Loading Content & Workflow Models...');
const ContentModel = safeImport('Content', './content/content-model', 'content');
const TemplateModel = safeImport('Template', './content/template-model', 'content');
const WorkflowModel = safeImport('Workflow', './workflow/workflow-model', 'workflow');
const TaskModel = safeImport('Task', './workflow/task-model', 'workflow');

// ============================================================================
// COLLECT ALL MODELS
// ============================================================================

console.log('\n📦 === COLLECTING AND REGISTERING MODELS ===\n');

const models = {
  // Customer-Services Models (Priority registration)
  User: UserModel,
  UserPreferences: UserPerferencesModel,
  UserProfile: UserProfileModel,
  UserSession: UserSessionModel,
  UserSetting: UserSettingModel,
  // Core Business
  Client: ClientModel,
  ClientDocument: ClientDocumentModel,
  Project: ProjectModel,
  ProjectResource: ProjectResourceModel,
  ProjectTask: ProjectTaskModel,
  ProjectTimeline: ProjectTimelineModel,
  Consultant: ConsultantModel,
  ConsultantProfile: ConsultantProfileModel,
  ConsultantSkill: ConsultantSkillModel,
  Engagement: EngagementModel,
  EngagementResource: EngagementResourceModel,
  EngagementTimeline: EngagementTimelineModel,

  // Hosted Organizations
  CustomerOrganization: CustomerOrganizationModel,
  CustomerTenant: CustomerTenantModel,
  TenantConfiguration: TenantConfigurationModel,
  CustomerSubscription: CustomerSubscriptionModel,
  SubscriptionPlan: SubscriptionPlanModel,
  WhiteLabel: WhiteLabelModel,
  WhiteLabelConfiguration: WhiteLabelConfigurationModel,

  // Recruitment Services
  Job: JobModel,
  JobApplication: JobApplicationModel,
  JobRequirement: JobRequirementModel,
  Candidate: CandidateModel,
  CandidateProfile: CandidateProfileModel,
  CandidateAssessment: CandidateAssessmentModel,
  Application: ApplicationModel,
  ApplicationStage: ApplicationStageModel,
  Partnership: PartnershipModel,
  PartnerContract: PartnerContractModel,

  // Admin-Server Models
  AdminUser: AdminUserModel,
  AdminSession: AdminSessionModel,
  UserPermission: UserPermissionModel,
  AdminActionLog: AdminActionLogModel,
  OrganizationAdmin: OrganizationAdminModel,
  OrganizationSettings: OrganizationSettingsModel,
  BillingConfiguration: BillingConfigurationModel,
  PlatformConfiguration: PlatformConfigurationModel,
  SystemSettings: SystemSettingsModel,
  Configuration: ConfigurationModel,
  MaintenanceSchedule: MaintenanceScheduleModel,
  AccessControl: AccessControlModel,
  SecurityPolicy: SecurityPolicyModel,
  SecurityIncidents: SecurityIncidentModels,
  ComplianceRule: ComplianceRuleModel,
  ThreatDetection: ThreatDetectionModel,
  Report: ReportModel,
  AnalyticsConfiguration: AnalyticsConfigurationModel,
  Dashboard: DashboardModel,
  EscalationRule: EscalationRuleModel,
  SupportTicket: SupportTicketModel,
  KnowledgeArticle: KnowledgeArticleModel,
  SupportAgent: SupportAgentModel,
  SystemHealth: SystemHealthModel,
  PerformanceMetrics: PerformanceMetricsModel,
  AlertConfiguration: AlertConfigurationModel,
  BillingAdmin: BillingAdminModel,
  PaymentProcessor: PaymentProcessorModel,
  SubscriptionAdmin: SubscriptionAdminModel,

  // Core User Management
  Role: RoleModel,
  Permission: PermissionModel,

  // Core Organizations
  Organization: OrganizationModel,
  OrganizationMember: OrganizationMemberModel,
  OrganizationInvitation: OrganizationInvitationModel,
  Tenant: TenantModel,

  // Core Configuration
  SystemConfiguration: SystemConfigurationModel,
  FeatureFlag: FeatureFlagModel,

  // Core Authentication & Security
  Session: SessionModel,
  LoginHistory: LoginHistoryModel,
  SecurityIncident: SecurityIncidentModel,
  ApiKey: ApiKeyModel,

  // Core Billing (renamed to avoid conflicts with customer-services)
  CoreSubscriptionPlan: CoreSubscriptionPlanModel,
  CoreSubscription: CoreSubscriptionModel,
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
  skipped: 0,
  customerServices: 0,
  adminServer: 0,
  coreModels: 0
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
      
      // Track model categories
      if (isCustomerServicesModel(modelName)) {
        importStats.customerServices++;
      } else if (isAdminServerModel(modelName)) {
        importStats.adminServer++;
      } else {
        importStats.coreModels++;
      }
      
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
// HELPER FUNCTIONS FOR MODEL CATEGORIZATION
// ============================================================================

function isCustomerServicesModel(modelName) {
  const customerServicesModels = [
    'User', 'UserPreferences', 'UserProfile', 'UserSession', 'UserSetting', 'Client', 'ClientDocument', 
    'Project', 'ProjectResource', 'ProjectTask', 'ProjectTimeline',
    'Consultant', 'ConsultantProfile', 'ConsultantSkill', 'Engagement', 'EngagementResource', 'EngagementTimeline',
    'CustomerOrganization', 'CustomerTenant', 'TenantConfiguration', 'CustomerSubscription', 'SubscriptionPlan',
    'WhiteLabel', 'WhiteLabelConfiguration', 'Job', 'JobApplication', 'JobRequirement',
    'Candidate', 'CandidateProfile', 'CandidateAssessment', 'Application', 'ApplicationStage',
    'Partnership', 'PartnerContract'
  ];
  return customerServicesModels.includes(modelName);
}

function isAdminServerModel(modelName) {
  return modelName.startsWith('Admin') || 
    ['OrganizationAdmin', 'PlatformConfiguration', 'SystemSettings', 'MaintenanceSchedule',
     'AccessControl', 'SecurityPolicy', 'SecurityIncidents', 'ComplianceRule', 'ThreatDetection',
     'Report', 'AnalyticsConfiguration', 'Dashboard',
     'SupportTicket', 'KnowledgeArticle', 'SupportAgent',
     'SystemHealth', 'PerformanceMetrics', 'AlertConfiguration',
     'BillingAdmin', 'PaymentProcessor', 'SubscriptionAdmin'].includes(modelName);
}

// ============================================================================
// DETAILED LOGGING AND STATISTICS
// ============================================================================

console.log('\n📊 === IMPORT STATISTICS ===\n');
console.log(`Total Models Attempted: ${importStats.total}`);
console.log(`✅ Successfully Imported: ${importStats.successful}`);
console.log(`   └── Customer-Services Models: ${importStats.customerServices}`);
console.log(`   └── Admin-Server Models: ${importStats.adminServer}`);
console.log(`   └── Core Models: ${importStats.coreModels}`);
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
console.log('\n🏢 Customer-Services Models:');
Object.keys(registeredModels).filter(isCustomerServicesModel).forEach(model => console.log(`   - ${model}`));

console.log('\n🔧 Admin-Server Models:');
Object.keys(registeredModels).filter(isAdminServerModel).forEach(model => console.log(`   - ${model}`));

console.log('\n📋 Core Business Models:');
Object.keys(registeredModels).filter(model => !isCustomerServicesModel(model) && !isAdminServerModel(model)).forEach(model => console.log(`   - ${model}`));

// Log registration summary
logger.info('Enhanced model registration completed with customer-services models', {
  totalAttempted: importStats.total,
  successfulImports: importStats.successful,
  failedImports: importStats.failed,
  skippedFiles: importStats.skipped,
  totalRegistered: Object.keys(registeredModels).length,
  registrationErrors: registrationErrors.length,
  customerServicesModels: importStats.customerServices,
  adminServerModels: importStats.adminServer,
  coreModels: importStats.coreModels,
  skippedModels
});

console.log('\n🎉 Model Registration Process Complete with Customer Services Integration!\n');

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
    // Core categories
    user: ['Role', 'Permission'],
    organization: ['Organization', 'OrganizationMember', 'OrganizationInvitation', 'Tenant'],
    configuration: ['Configuration', 'SystemConfiguration', 'FeatureFlag'],
    auth: ['Session', 'LoginHistory', 'SecurityIncident', 'ApiKey'],
    billing: ['CoreSubscriptionPlan', 'CoreSubscription', 'Invoice', 'Payment'],
    integration: ['Webhook', 'ApiIntegration', 'OAuthProvider', 'Passkey'],
    communication: ['Notification', 'EmailTemplate', 'SmsTemplate'],
    audit: ['AuditLog', 'AuditAlert', 'ComplianceMapping', 'DataBreach'],
    analytics: ['Analytics', 'Metrics', 'Event', 'Usage', 'Performance'],
    content: ['Content', 'Template', 'Workflow', 'Task'],
    
    // Customer-Services categories
    customerCore: ['User', 'UserPreferences', 'UserProfile', 'UserSession', 'UserSetting', 'Client', 'ClientDocument', 'Project', 'ProjectResource', 'ProjectTask', 'ProjectTimeline', 
                   'Consultant', 'ConsultantProfile', 'ConsultantSkill', 'Engagement', 'EngagementResource', 'EngagementTimeline'],
    customerHosted: ['CustomerOrganization', 'CustomerTenant', 'TenantConfiguration', 'CustomerSubscription', 
                     'SubscriptionPlan', 'WhiteLabel', 'WhiteLabelConfiguration'],
    customerRecruitment: ['Job', 'JobApplication', 'JobRequirement', 'Candidate', 'CandidateProfile', 
                          'CandidateAssessment', 'Application', 'ApplicationStage', 'Partnership', 'PartnerContract'],
    
    // Admin-Server categories
    adminUser: ['AdminUser', 'AdminSession', 'UserPermission', 'AdminActionLog'],
    adminOrganization: ['OrganizationAdmin', 'OrganizationSettings', 'BillingConfiguration'],
    adminPlatform: ['PlatformConfiguration', 'SystemSettings', 'MaintenanceSchedule'],
    adminSecurity: ['AccessControl', 'SecurityPolicy', 'SecurityIncidents', 'ComplianceRule', 'ThreatDetection'],
    adminReports: ['Report', 'AnalyticsConfiguration', 'Dashboard'],
    adminSupport: ['SupportTicket', 'KnowledgeArticle', 'SupportAgent'],
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
 * Gets all customer-services models
 * @returns {Object} All customer-services models
 */
function getCustomerServicesModels() {
  const customerModels = {};
  
  Object.entries(registeredModels).forEach(([modelName, ModelClass]) => {
    if (isCustomerServicesModel(modelName)) {
      customerModels[modelName] = ModelClass;
    }
  });

  return customerModels;
}

/**
 * Gets all admin-server models
 * @returns {Object} All admin-server models
 */
function getAdminModels() {
  const adminModels = {};
  
  Object.entries(registeredModels).forEach(([modelName, ModelClass]) => {
    if (isAdminServerModel(modelName)) {
      adminModels[modelName] = ModelClass;
    }
  });

  return adminModels;
}

/**
 * Gets all core business models (non-admin, non-customer-services)
 * @returns {Object} All core business models
 */
function getCoreModels() {
  const coreModels = {};
  
  Object.entries(registeredModels).forEach(([modelName, ModelClass]) => {
    if (!isCustomerServicesModel(modelName) && !isAdminServerModel(modelName)) {
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
    customerServicesModels: importStats.customerServices,
    adminServerModels: importStats.adminServer,
    coreModels: importStats.coreModels,
    skippedModels,
    categories: {
      // Core categories
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
      
      // Customer-Services categories
      customerCore: getModelsByCategory('customerCore'),
      customerHosted: getModelsByCategory('customerHosted'),
      customerRecruitment: getModelsByCategory('customerRecruitment'),
      
      // Admin-Server categories
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
module.exports.getCustomerServicesModels = getCustomerServicesModels;
module.exports.getAdminModels = getAdminModels;
module.exports.getCoreModels = getCoreModels;
module.exports.hasModel = hasModel;
module.exports.getRegistrationStats = getRegistrationStats;
module.exports.registrationErrors = registrationErrors;
module.exports.skippedModels = skippedModels;
module.exports.importStats = importStats;