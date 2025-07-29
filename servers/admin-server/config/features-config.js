/**
 * @file Features Configuration
 * @description Feature flags and toggles for admin server capabilities
 * @version 3.0.0
 */

'use strict';

const environment = process.env.NODE_ENV || 'development';
const isProduction = environment === 'production';
const isDevelopment = environment === 'development';

/**
 * Parse boolean from environment variable
 * @param {string} value - Environment variable value
 * @param {boolean} defaultValue - Default value
 * @returns {boolean} Parsed boolean
 */
const parseBooleanFromEnv = (value, defaultValue = false) => {
    if (value === undefined || value === null) return defaultValue;
    return value === 'true' || value === '1' || value === 'yes';
};

/**
 * Feature flags configuration for admin server
 * Controls which administrative features are enabled
 */
module.exports = {
    // Platform Management Features
    platformManagement: parseBooleanFromEnv(process.env.ADMIN_PLATFORM_MANAGEMENT, true),
    systemConfiguration: parseBooleanFromEnv(process.env.ADMIN_SYSTEM_CONFIG_EDIT, true),
    maintenanceMode: parseBooleanFromEnv(process.env.ADMIN_MAINTENANCE_MODE_CONTROL, true),
    deploymentControl: parseBooleanFromEnv(process.env.ADMIN_DEPLOYMENT_CONTROL, isProduction),
    featureToggleManagement: parseBooleanFromEnv(process.env.ADMIN_FEATURE_TOGGLE_MANAGEMENT, true),
    
    // User Management Features
    userManagement: parseBooleanFromEnv(process.env.ADMIN_USER_MANAGEMENT, true),
    userCreation: parseBooleanFromEnv(process.env.ADMIN_USER_CREATION, true),
    userDeletion: parseBooleanFromEnv(process.env.ADMIN_USER_DELETION, true),
    userImpersonation: parseBooleanFromEnv(process.env.ADMIN_USER_IMPERSONATION, false),
    bulkUserOperations: parseBooleanFromEnv(process.env.ADMIN_BULK_USER_OPERATIONS, true),
    userPasswordReset: parseBooleanFromEnv(process.env.ADMIN_USER_PASSWORD_RESET, true),
    userSessionManagement: parseBooleanFromEnv(process.env.ADMIN_USER_SESSION_MANAGEMENT, true),
    userPermissionOverride: parseBooleanFromEnv(process.env.ADMIN_USER_PERMISSION_OVERRIDE, true),
    
    // Organization Management Features
    organizationManagement: parseBooleanFromEnv(process.env.ADMIN_ORG_MANAGEMENT, true),
    organizationCreation: parseBooleanFromEnv(process.env.ADMIN_ORG_CREATION, true),
    organizationDeletion: parseBooleanFromEnv(process.env.ADMIN_ORG_DELETION, true),
    tenantCreation: parseBooleanFromEnv(process.env.ADMIN_TENANT_CREATION, true),
    tenantMigration: parseBooleanFromEnv(process.env.ADMIN_TENANT_MIGRATION, false),
    subscriptionOverride: parseBooleanFromEnv(process.env.ADMIN_SUBSCRIPTION_OVERRIDE, true),
    organizationLimitsOverride: parseBooleanFromEnv(process.env.ADMIN_ORG_LIMITS_OVERRIDE, true),
    customDomainManagement: parseBooleanFromEnv(process.env.ADMIN_CUSTOM_DOMAIN_MANAGEMENT, true),
    
    // Security Administration Features
    securityManagement: parseBooleanFromEnv(process.env.ADMIN_SECURITY_MANAGEMENT, true),
    viewAuditLogs: parseBooleanFromEnv(process.env.ADMIN_VIEW_AUDIT_LOGS, true),
    exportAuditLogs: parseBooleanFromEnv(process.env.ADMIN_EXPORT_AUDIT_LOGS, true),
    manageIPBlacklist: parseBooleanFromEnv(process.env.ADMIN_MANAGE_IP_BLACKLIST, true),
    manageIPWhitelist: parseBooleanFromEnv(process.env.ADMIN_MANAGE_IP_WHITELIST, true),
    securityScanning: parseBooleanFromEnv(process.env.ADMIN_SECURITY_SCANNING, true),
    vulnerabilityManagement: parseBooleanFromEnv(process.env.ADMIN_VULNERABILITY_MANAGEMENT, true),
    encryptionKeyManagement: parseBooleanFromEnv(process.env.ADMIN_ENCRYPTION_KEY_MANAGEMENT, false),
    certificateManagement: parseBooleanFromEnv(process.env.ADMIN_CERTIFICATE_MANAGEMENT, true),
    mfaEnforcement: parseBooleanFromEnv(process.env.ADMIN_MFA_ENFORCEMENT, true),
    
    // Billing Administration Features
    billingManagement: parseBooleanFromEnv(process.env.ADMIN_BILLING_MANAGEMENT, true),
    paymentProcessing: parseBooleanFromEnv(process.env.ADMIN_PAYMENT_PROCESSING, true),
    manualPaymentEntry: parseBooleanFromEnv(process.env.ADMIN_MANUAL_PAYMENT_ENTRY, true),
    refundProcessing: parseBooleanFromEnv(process.env.ADMIN_REFUND_PROCESSING, true),
    creditManagement: parseBooleanFromEnv(process.env.ADMIN_CREDIT_MANAGEMENT, true),
    invoiceGeneration: parseBooleanFromEnv(process.env.ADMIN_INVOICE_GENERATION, true),
    invoiceModification: parseBooleanFromEnv(process.env.ADMIN_INVOICE_MODIFICATION, true),
    subscriptionPricing: parseBooleanFromEnv(process.env.ADMIN_SUBSCRIPTION_PRICING, true),
    discountManagement: parseBooleanFromEnv(process.env.ADMIN_DISCOUNT_MANAGEMENT, true),
    taxConfiguration: parseBooleanFromEnv(process.env.ADMIN_TAX_CONFIGURATION, true),
    
    // System Monitoring Features
    systemMonitoring: parseBooleanFromEnv(process.env.ADMIN_SYSTEM_MONITORING, true),
    realTimeMetrics: parseBooleanFromEnv(process.env.ADMIN_REAL_TIME_METRICS, true),
    performanceAnalysis: parseBooleanFromEnv(process.env.ADMIN_PERFORMANCE_ANALYSIS, true),
    resourceMonitoring: parseBooleanFromEnv(process.env.ADMIN_RESOURCE_MONITORING, true),
    errorTracking: parseBooleanFromEnv(process.env.ADMIN_ERROR_TRACKING, true),
    logViewing: parseBooleanFromEnv(process.env.ADMIN_LOG_VIEWING, true),
    logExport: parseBooleanFromEnv(process.env.ADMIN_LOG_EXPORT, true),
    alertConfiguration: parseBooleanFromEnv(process.env.ADMIN_ALERT_CONFIGURATION, true),
    healthCheckOverride: parseBooleanFromEnv(process.env.ADMIN_HEALTH_CHECK_OVERRIDE, false),
    
    // Support Administration Features
    supportTools: parseBooleanFromEnv(process.env.ADMIN_SUPPORT_TOOLS, true),
    ticketManagement: parseBooleanFromEnv(process.env.ADMIN_TICKET_MANAGEMENT, true),
    ticketEscalation: parseBooleanFromEnv(process.env.ADMIN_TICKET_ESCALATION, true),
    customerCommunication: parseBooleanFromEnv(process.env.ADMIN_CUSTOMER_COMMUNICATION, true),
    knowledgeBaseEdit: parseBooleanFromEnv(process.env.ADMIN_KNOWLEDGE_BASE_EDIT, true),
    supportAnalytics: parseBooleanFromEnv(process.env.ADMIN_SUPPORT_ANALYTICS, true),
    chatSupport: parseBooleanFromEnv(process.env.ADMIN_CHAT_SUPPORT, false),
    remoteAssistance: parseBooleanFromEnv(process.env.ADMIN_REMOTE_ASSISTANCE, false),
    
    // Analytics and Reporting Features
    analyticsReporting: parseBooleanFromEnv(process.env.ADMIN_ANALYTICS_REPORTING, true),
    customReports: parseBooleanFromEnv(process.env.ADMIN_CUSTOM_REPORTS, true),
    scheduledReports: parseBooleanFromEnv(process.env.ADMIN_SCHEDULED_REPORTS, true),
    dataExport: parseBooleanFromEnv(process.env.ADMIN_DATA_EXPORT, true),
    businessIntelligence: parseBooleanFromEnv(process.env.ADMIN_BUSINESS_INTELLIGENCE, true),
    predictiveAnalytics: parseBooleanFromEnv(process.env.ADMIN_PREDICTIVE_ANALYTICS, false),
    cohortAnalysis: parseBooleanFromEnv(process.env.ADMIN_COHORT_ANALYSIS, true),
    revenueAnalytics: parseBooleanFromEnv(process.env.ADMIN_REVENUE_ANALYTICS, true),
    
    // Database Management Features
    databaseManagement: parseBooleanFromEnv(process.env.ADMIN_DATABASE_MANAGEMENT, true),
    databaseBackup: parseBooleanFromEnv(process.env.ADMIN_DATABASE_BACKUP, true),
    databaseRestore: parseBooleanFromEnv(process.env.ADMIN_DATABASE_RESTORE, isProduction === false),
    databaseMigration: parseBooleanFromEnv(process.env.ADMIN_DATABASE_MIGRATION, true),
    queryExecution: parseBooleanFromEnv(process.env.ADMIN_QUERY_EXECUTION, isDevelopment),
    schemaModification: parseBooleanFromEnv(process.env.ADMIN_SCHEMA_MODIFICATION, false),
    dataImportExport: parseBooleanFromEnv(process.env.ADMIN_DATA_IMPORT_EXPORT, true),
    
    // Integration Management Features
    integrationManagement: parseBooleanFromEnv(process.env.ADMIN_INTEGRATION_MANAGEMENT, true),
    apiKeyManagement: parseBooleanFromEnv(process.env.ADMIN_API_KEY_MANAGEMENT, true),
    webhookManagement: parseBooleanFromEnv(process.env.ADMIN_WEBHOOK_MANAGEMENT, true),
    oauthClientManagement: parseBooleanFromEnv(process.env.ADMIN_OAUTH_CLIENT_MANAGEMENT, true),
    thirdPartyIntegrations: parseBooleanFromEnv(process.env.ADMIN_THIRD_PARTY_INTEGRATIONS, true),
    customIntegrations: parseBooleanFromEnv(process.env.ADMIN_CUSTOM_INTEGRATIONS, true),
    
    // Content Management Features
    contentManagement: parseBooleanFromEnv(process.env.ADMIN_CONTENT_MANAGEMENT, true),
    emailTemplates: parseBooleanFromEnv(process.env.ADMIN_EMAIL_TEMPLATES, true),
    notificationTemplates: parseBooleanFromEnv(process.env.ADMIN_NOTIFICATION_TEMPLATES, true),
    legalDocuments: parseBooleanFromEnv(process.env.ADMIN_LEGAL_DOCUMENTS, true),
    marketingContent: parseBooleanFromEnv(process.env.ADMIN_MARKETING_CONTENT, false),
    translationManagement: parseBooleanFromEnv(process.env.ADMIN_TRANSLATION_MANAGEMENT, true),
    
    // Advanced Features
    advancedFeatures: parseBooleanFromEnv(process.env.ADMIN_ADVANCED_FEATURES, isProduction === false),
    experimentalFeatures: parseBooleanFromEnv(process.env.ADMIN_EXPERIMENTAL_FEATURES, isDevelopment),
    betaFeatures: parseBooleanFromEnv(process.env.ADMIN_BETA_FEATURES, !isProduction),
    debugTools: parseBooleanFromEnv(process.env.ADMIN_DEBUG_TOOLS, isDevelopment),
    performanceProfiling: parseBooleanFromEnv(process.env.ADMIN_PERFORMANCE_PROFILING, !isProduction),
    memoryAnalysis: parseBooleanFromEnv(process.env.ADMIN_MEMORY_ANALYSIS, isDevelopment),
    
    // Compliance Features
    complianceTools: parseBooleanFromEnv(process.env.ADMIN_COMPLIANCE_TOOLS, true),
    gdprTools: parseBooleanFromEnv(process.env.ADMIN_GDPR_TOOLS, true),
    dataRetentionManagement: parseBooleanFromEnv(process.env.ADMIN_DATA_RETENTION, true),
    privacyControls: parseBooleanFromEnv(process.env.ADMIN_PRIVACY_CONTROLS, true),
    auditReporting: parseBooleanFromEnv(process.env.ADMIN_AUDIT_REPORTING, true),
    complianceReporting: parseBooleanFromEnv(process.env.ADMIN_COMPLIANCE_REPORTING, true),
    dataAnonymization: parseBooleanFromEnv(process.env.ADMIN_DATA_ANONYMIZATION, true),
    rightToErasure: parseBooleanFromEnv(process.env.ADMIN_RIGHT_TO_ERASURE, true),
    
    // Emergency Features
    emergencyAccess: parseBooleanFromEnv(process.env.ADMIN_EMERGENCY_ACCESS, true),
    emergencyShutdown: parseBooleanFromEnv(process.env.ADMIN_EMERGENCY_SHUTDOWN, true),
    emergencyMaintenance: parseBooleanFromEnv(process.env.ADMIN_EMERGENCY_MAINTENANCE, true),
    disasterRecovery: parseBooleanFromEnv(process.env.ADMIN_DISASTER_RECOVERY, true),
    rollbackCapability: parseBooleanFromEnv(process.env.ADMIN_ROLLBACK_CAPABILITY, true),
    
    // Development and Testing Features
    developmentTools: parseBooleanFromEnv(process.env.ADMIN_DEV_TOOLS_ENABLED, isDevelopment),
    apiDocumentation: parseBooleanFromEnv(process.env.ADMIN_API_DOCS_ENABLED, !isProduction),
    mockDataGeneration: parseBooleanFromEnv(process.env.ADMIN_MOCK_DATA, isDevelopment),
    testingTools: parseBooleanFromEnv(process.env.ADMIN_TESTING_TOOLS, isDevelopment),
    stagingEnvironment: parseBooleanFromEnv(process.env.ADMIN_STAGING_ENVIRONMENT, environment === 'staging'),
    
    // UI/UX Features
    darkMode: parseBooleanFromEnv(process.env.ADMIN_DARK_MODE, true),
    customThemes: parseBooleanFromEnv(process.env.ADMIN_CUSTOM_THEMES, true),
    advancedSearch: parseBooleanFromEnv(process.env.ADMIN_ADVANCED_SEARCH, true),
    bulkActions: parseBooleanFromEnv(process.env.ADMIN_BULK_ACTIONS, true),
    keyboardShortcuts: parseBooleanFromEnv(process.env.ADMIN_KEYBOARD_SHORTCUTS, true),
    exportFormats: parseBooleanFromEnv(process.env.ADMIN_EXPORT_FORMATS, true),
    dataVisualization: parseBooleanFromEnv(process.env.ADMIN_DATA_VISUALIZATION, true),
    realTimeUpdates: parseBooleanFromEnv(process.env.ADMIN_REAL_TIME_UPDATES, true)
};