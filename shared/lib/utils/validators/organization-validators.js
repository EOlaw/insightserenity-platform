'use strict';

/**
 * @fileoverview Organization-related validation utilities
 * @module shared/lib/utils/validators/organization-validators
 */

const { body, param, query } = require('express-validator');
const AppError = require('../app-error');

/**
 * @class OrganizationValidators
 * @description Comprehensive organization-specific validation rules
 */
class OrganizationValidators {
  /**
   * Validate organization creation
   * @static
   * @returns {Array} Array of validators
   */
  static createOrganization() {
    return [
      body('name')
        .notEmpty()
        .withMessage('Organization name is required')
        .trim()
        .isLength({ min: 2, max: 100 })
        .withMessage('Organization name must be between 2 and 100 characters'),

      body('slug')
        .optional()
        .trim()
        .isSlug()
        .withMessage('Slug must be URL-friendly')
        .isLength({ min: 3, max: 50 })
        .withMessage('Slug must be between 3 and 50 characters'),

      body('email')
        .notEmpty()
        .withMessage('Organization email is required')
        .isEmail()
        .withMessage('Please provide a valid email address')
        .normalizeEmail(),

      body('type')
        .notEmpty()
        .withMessage('Organization type is required')
        .isIn(['company', 'nonprofit', 'government', 'educational', 'personal'])
        .withMessage('Invalid organization type'),

      body('industry')
        .optional()
        .trim()
        .isLength({ max: 50 })
        .withMessage('Industry must not exceed 50 characters'),

      body('size')
        .optional()
        .isIn(['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+'])
        .withMessage('Invalid organization size'),

      body('website')
        .optional()
        .isURL()
        .withMessage('Website must be a valid URL'),

      body('logo')
        .optional()
        .isURL()
        .withMessage('Logo must be a valid URL'),

      body('description')
        .optional()
        .trim()
        .isLength({ max: 500 })
        .withMessage('Description must not exceed 500 characters')
    ];
  }

  /**
   * Validate organization update
   * @static
   * @returns {Array} Array of validators
   */
  static updateOrganization() {
    return [
      param('organizationId')
        .notEmpty()
        .withMessage('Organization ID is required')
        .isMongoId()
        .withMessage('Invalid organization ID'),

      body('name')
        .optional()
        .trim()
        .isLength({ min: 2, max: 100 })
        .withMessage('Organization name must be between 2 and 100 characters'),

      body('email')
        .optional()
        .isEmail()
        .withMessage('Please provide a valid email address')
        .normalizeEmail(),

      body('settings')
        .optional()
        .isJSON()
        .withMessage('Settings must be valid JSON'),

      body('metadata')
        .optional()
        .isJSON()
        .withMessage('Metadata must be valid JSON')
    ];
  }

  /**
   * Validate member addition
   * @static
   * @returns {Array} Array of validators
   */
  static addMember() {
    return [
      param('organizationId')
        .notEmpty()
        .withMessage('Organization ID is required')
        .isMongoId()
        .withMessage('Invalid organization ID'),

      body('userId')
        .optional()
        .isMongoId()
        .withMessage('Invalid user ID'),

      body('email')
        .optional()
        .isEmail()
        .withMessage('Please provide a valid email address')
        .normalizeEmail(),

      body('role')
        .notEmpty()
        .withMessage('Member role is required')
        .isIn(['owner', 'admin', 'member', 'viewer'])
        .withMessage('Invalid member role'),

      body('permissions')
        .optional()
        .isArray()
        .withMessage('Permissions must be an array')
    ];
  }

  /**
   * Validate subscription plan
   * @static
   * @returns {Array} Array of validators
   */
  static updateSubscription() {
    return [
      param('organizationId')
        .notEmpty()
        .withMessage('Organization ID is required')
        .isMongoId()
        .withMessage('Invalid organization ID'),

      body('planId')
        .notEmpty()
        .withMessage('Plan ID is required')
        .isMongoId()
        .withMessage('Invalid plan ID'),

      body('billingCycle')
        .optional()
        .isIn(['monthly', 'quarterly', 'yearly'])
        .withMessage('Invalid billing cycle'),

      body('paymentMethodId')
        .optional()
        .isString()
        .withMessage('Payment method ID must be a string')
    ];
  }

  /**
   * Validate organization settings
   * @static
   * @returns {Array} Array of validators
   */
  static updateSettings() {
    return [
      param('organizationId')
        .notEmpty()
        .withMessage('Organization ID is required')
        .isMongoId()
        .withMessage('Invalid organization ID'),

      body('settings.allowSignups')
        .optional()
        .isBoolean()
        .withMessage('Allow signups must be a boolean'),

      body('settings.requireApproval')
        .optional()
        .isBoolean()
        .withMessage('Require approval must be a boolean'),

      body('settings.defaultRole')
        .optional()
        .isIn(['member', 'viewer'])
        .withMessage('Invalid default role'),

      body('settings.maxMembers')
        .optional()
        .isInt({ min: 1, max: 10000 })
        .withMessage('Max members must be between 1 and 10000')
    ];
  }

  /**
   * Validate department creation
   * @static
   * @returns {Array} Array of validators
   */
  static createDepartment() {
    return [
      param('organizationId')
        .notEmpty()
        .withMessage('Organization ID is required')
        .isMongoId()
        .withMessage('Invalid organization ID'),

      body('name')
        .notEmpty()
        .withMessage('Department name is required')
        .trim()
        .isLength({ min: 2, max: 100 })
        .withMessage('Department name must be between 2 and 100 characters'),

      body('code')
        .notEmpty()
        .withMessage('Department code is required')
        .trim()
        .matches(/^[A-Z]{2,10}$/)
        .withMessage('Department code must be 2-10 uppercase letters'),

      body('managerId')
        .optional()
        .isMongoId()
        .withMessage('Invalid manager ID'),

      body('parentDepartmentId')
        .optional()
        .isMongoId()
        .withMessage('Invalid parent department ID'),

      body('budget')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Budget must be a positive number'),

      body('headcount')
        .optional()
        .isInt({ min: 0 })
        .withMessage('Headcount must be a non-negative integer'),

      body('costCenter')
        .optional()
        .trim()
        .matches(/^CC-\d{4,6}$/)
        .withMessage('Cost center must follow format CC-XXXX'),

      body('location')
        .optional()
        .trim()
        .isLength({ max: 200 })
        .withMessage('Location must not exceed 200 characters')
    ];
  }

  /**
   * Validate team creation
   * @static
   * @returns {Array} Array of validators
   */
  static createTeam() {
    return [
      param('organizationId')
        .notEmpty()
        .withMessage('Organization ID is required')
        .isMongoId()
        .withMessage('Invalid organization ID'),

      body('name')
        .notEmpty()
        .withMessage('Team name is required')
        .trim()
        .isLength({ min: 2, max: 100 })
        .withMessage('Team name must be between 2 and 100 characters'),

      body('departmentId')
        .notEmpty()
        .withMessage('Department ID is required')
        .isMongoId()
        .withMessage('Invalid department ID'),

      body('leaderId')
        .optional()
        .isMongoId()
        .withMessage('Invalid team leader ID'),

      body('memberIds')
        .optional()
        .isArray()
        .withMessage('Member IDs must be an array'),

      body('memberIds.*')
        .isMongoId()
        .withMessage('Each member ID must be valid'),

      body('type')
        .notEmpty()
        .withMessage('Team type is required')
        .isIn(['permanent', 'project', 'cross-functional', 'virtual'])
        .withMessage('Invalid team type'),

      body('status')
        .optional()
        .isIn(['forming', 'active', 'paused', 'disbanded'])
        .withMessage('Invalid team status'),

      body('objectives')
        .optional()
        .isArray({ max: 10 })
        .withMessage('Maximum 10 objectives allowed'),

      body('slack')
        .optional()
        .matches(/^[a-z0-9-]+$/)
        .withMessage('Invalid Slack channel format')
    ];
  }

  /**
   * Validate project creation
   * @static
   * @returns {Array} Array of validators
   */
  static createProject() {
    return [
      param('organizationId')
        .notEmpty()
        .withMessage('Organization ID is required')
        .isMongoId()
        .withMessage('Invalid organization ID'),

      body('name')
        .notEmpty()
        .withMessage('Project name is required')
        .trim()
        .isLength({ min: 3, max: 150 })
        .withMessage('Project name must be between 3 and 150 characters'),

      body('code')
        .notEmpty()
        .withMessage('Project code is required')
        .matches(/^PRJ-[A-Z0-9]{4,8}$/)
        .withMessage('Project code must follow format PRJ-XXXX'),

      body('description')
        .notEmpty()
        .withMessage('Project description is required')
        .trim()
        .isLength({ min: 10, max: 2000 })
        .withMessage('Description must be between 10 and 2000 characters'),

      body('startDate')
        .notEmpty()
        .withMessage('Start date is required')
        .isISO8601()
        .withMessage('Invalid start date format'),

      body('endDate')
        .notEmpty()
        .withMessage('End date is required')
        .isISO8601()
        .withMessage('Invalid end date format')
        .custom((value, { req }) => new Date(value) > new Date(req.body.startDate))
        .withMessage('End date must be after start date'),

      body('budget')
        .notEmpty()
        .withMessage('Budget is required')
        .isFloat({ min: 0 })
        .withMessage('Budget must be a positive number'),

      body('currency')
        .optional()
        .isISO4217()
        .withMessage('Invalid currency code'),

      body('priority')
        .optional()
        .isIn(['low', 'medium', 'high', 'critical'])
        .withMessage('Invalid priority level'),

      body('status')
        .optional()
        .isIn(['planning', 'in-progress', 'on-hold', 'completed', 'cancelled'])
        .withMessage('Invalid project status'),

      body('managerId')
        .notEmpty()
        .withMessage('Project manager ID is required')
        .isMongoId()
        .withMessage('Invalid manager ID'),

      body('teamIds')
        .optional()
        .isArray()
        .withMessage('Team IDs must be an array'),

      body('milestones')
        .optional()
        .isArray({ max: 20 })
        .withMessage('Maximum 20 milestones allowed'),

      body('risks')
        .optional()
        .isArray({ max: 50 })
        .withMessage('Maximum 50 risks allowed')
    ];
  }

  /**
   * Validate budget allocation
   * @static
   * @returns {Array} Array of validators
   */
  static allocateBudget() {
    return [
      param('organizationId')
        .notEmpty()
        .withMessage('Organization ID is required')
        .isMongoId()
        .withMessage('Invalid organization ID'),

      body('fiscalYear')
        .notEmpty()
        .withMessage('Fiscal year is required')
        .isInt({ min: 2020, max: 2050 })
        .withMessage('Invalid fiscal year'),

      body('totalBudget')
        .notEmpty()
        .withMessage('Total budget is required')
        .isFloat({ min: 0 })
        .withMessage('Total budget must be positive'),

      body('currency')
        .notEmpty()
        .withMessage('Currency is required')
        .isISO4217()
        .withMessage('Invalid currency code'),

      body('allocations')
        .notEmpty()
        .withMessage('Budget allocations are required')
        .isArray({ min: 1 })
        .withMessage('At least one allocation is required'),

      body('allocations.*.departmentId')
        .notEmpty()
        .withMessage('Department ID is required for each allocation')
        .isMongoId()
        .withMessage('Invalid department ID'),

      body('allocations.*.amount')
        .notEmpty()
        .withMessage('Amount is required for each allocation')
        .isFloat({ min: 0 })
        .withMessage('Allocation amount must be positive'),

      body('allocations.*.category')
        .notEmpty()
        .withMessage('Category is required for each allocation')
        .isIn(['operational', 'capital', 'personnel', 'marketing', 'R&D', 'other'])
        .withMessage('Invalid budget category'),

      body('allocations.*.quarterly')
        .optional()
        .isArray({ min: 4, max: 4 })
        .withMessage('Quarterly breakdown must have exactly 4 values')
        .custom(quarterly => {
            const sum = quarterly.reduce((a, b) => a + b, 0);
            return Math.abs(sum - 1) < 0.001;
        })
        .withMessage('Quarterly percentages must sum to 100%')
    ];
  }

  /**
   * Validate organization compliance
   * @static
   * @returns {Array} Array of validators
   */
  static updateCompliance() {
    return [
      param('organizationId')
        .notEmpty()
        .withMessage('Organization ID is required')
        .isMongoId()
        .withMessage('Invalid organization ID'),

      body('regulations')
        .optional()
        .isArray()
        .withMessage('Regulations must be an array'),

      body('regulations.*')
        .isIn(['GDPR', 'CCPA', 'HIPAA', 'SOX', 'PCI-DSS', 'ISO-27001', 'SOC2'])
        .withMessage('Invalid regulation type'),

      body('certifications')
        .optional()
        .isArray()
        .withMessage('Certifications must be an array'),

      body('certifications.*.name')
        .notEmpty()
        .withMessage('Certification name is required')
        .trim()
        .isLength({ max: 100 })
        .withMessage('Certification name must not exceed 100 characters'),

      body('certifications.*.issuer')
        .notEmpty()
        .withMessage('Certification issuer is required'),

      body('certifications.*.issueDate')
        .notEmpty()
        .withMessage('Issue date is required')
        .isISO8601()
        .withMessage('Invalid issue date'),

      body('certifications.*.expiryDate')
        .notEmpty()
        .withMessage('Expiry date is required')
        .isISO8601()
        .withMessage('Invalid expiry date')
        .custom((value, { req, path }) => {
            const index = path.match(/\[(\d+)\]/)[1];
            const issueDate = req.body.certifications[index].issueDate;
            return new Date(value) > new Date(issueDate);
        })
        .withMessage('Expiry date must be after issue date'),

      body('dataProtectionOfficer')
        .optional()
        .isMongoId()
        .withMessage('Invalid DPO user ID'),

      body('privacyPolicy')
        .optional()
        .isURL()
        .withMessage('Privacy policy must be a valid URL'),

      body('lastAuditDate')
        .optional()
        .isISO8601()
        .withMessage('Invalid audit date')
    ];
  }

  /**
   * Validate organization metrics
   * @static
   * @returns {Array} Array of validators
   */
  static updateMetrics() {
    return [
      param('organizationId')
        .notEmpty()
        .withMessage('Organization ID is required')
        .isMongoId()
        .withMessage('Invalid organization ID'),

      body('period')
        .notEmpty()
        .withMessage('Period is required')
        .matches(/^\d{4}-Q[1-4]$|^\d{4}-\d{2}$|^\d{4}$/)
        .withMessage('Period must be YYYY, YYYY-MM, or YYYY-Q#'),

      body('revenue')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Revenue must be non-negative'),

      body('expenses')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Expenses must be non-negative'),

      body('profit')
        .optional()
        .isFloat()
        .withMessage('Profit must be a number'),

      body('employeeCount')
        .optional()
        .isInt({ min: 0 })
        .withMessage('Employee count must be non-negative'),

      body('customerCount')
        .optional()
        .isInt({ min: 0 })
        .withMessage('Customer count must be non-negative'),

      body('churnRate')
        .optional()
        .isFloat({ min: 0, max: 100 })
        .withMessage('Churn rate must be between 0 and 100'),

      body('nps')
        .optional()
        .isInt({ min: -100, max: 100 })
        .withMessage('NPS must be between -100 and 100'),

      body('customMetrics')
        .optional()
        .isObject()
        .withMessage('Custom metrics must be an object')
        .custom(metrics => Object.keys(metrics).length <= 50)
        .withMessage('Maximum 50 custom metrics allowed')
    ];
  }

  /**
   * Validate organization integration
   * @static
   * @returns {Array} Array of validators
   */
  static addIntegration() {
    return [
      param('organizationId')
        .notEmpty()
        .withMessage('Organization ID is required')
        .isMongoId()
        .withMessage('Invalid organization ID'),

      body('type')
        .notEmpty()
        .withMessage('Integration type is required')
        .isIn(['slack', 'teams', 'google', 'salesforce', 'hubspot', 'jira', 'github', 'custom'])
        .withMessage('Invalid integration type'),

      body('name')
        .notEmpty()
        .withMessage('Integration name is required')
        .trim()
        .isLength({ min: 2, max: 100 })
        .withMessage('Integration name must be between 2 and 100 characters'),

      body('config')
        .notEmpty()
        .withMessage('Integration config is required')
        .isObject()
        .withMessage('Config must be an object'),

      body('config.apiKey')
        .optional()
        .isLength({ min: 10 })
        .withMessage('API key must be at least 10 characters'),

      body('config.webhookUrl')
        .optional()
        .isURL()
        .withMessage('Webhook URL must be valid'),

      body('config.clientId')
        .optional()
        .isAlphanumeric()
        .withMessage('Client ID must be alphanumeric'),

      body('scopes')
        .optional()
        .isArray()
        .withMessage('Scopes must be an array'),

      body('enabled')
        .optional()
        .isBoolean()
        .withMessage('Enabled must be a boolean')
    ];
  }

  /**
   * Validate organization domain
   * @static
   * @returns {Array} Array of validators
   */
  static addDomain() {
    return [
      param('organizationId')
        .notEmpty()
        .withMessage('Organization ID is required')
        .isMongoId()
        .withMessage('Invalid organization ID'),

      body('domain')
        .notEmpty()
        .withMessage('Domain is required')
        .isFQDN()
        .withMessage('Invalid domain format'),

      body('verified')
        .optional()
        .isBoolean()
        .withMessage('Verified must be a boolean'),

      body('primary')
        .optional()
        .isBoolean()
        .withMessage('Primary must be a boolean'),

      body('verificationMethod')
        .optional()
        .isIn(['dns-txt', 'dns-cname', 'file', 'meta-tag'])
        .withMessage('Invalid verification method'),

      body('verificationCode')
        .optional()
        .isAlphanumeric()
        .withMessage('Verification code must be alphanumeric')
    ];
  }

  /**
   * Validate organization notification settings
   * @static
   * @returns {Array} Array of validators
   */
  static updateNotificationSettings() {
    return [
      param('organizationId')
        .notEmpty()
        .withMessage('Organization ID is required')
        .isMongoId()
        .withMessage('Invalid organization ID'),

      body('channels')
        .optional()
        .isObject()
        .withMessage('Channels must be an object'),

      body('channels.email')
        .optional()
        .isBoolean()
        .withMessage('Email channel must be a boolean'),

      body('channels.sms')
        .optional()
        .isBoolean()
        .withMessage('SMS channel must be a boolean'),

      body('channels.push')
        .optional()
        .isBoolean()
        .withMessage('Push channel must be a boolean'),

      body('channels.inApp')
        .optional()
        .isBoolean()
        .withMessage('In-app channel must be a boolean'),

      body('frequency')
        .optional()
        .isIn(['realtime', 'hourly', 'daily', 'weekly', 'monthly'])
        .withMessage('Invalid notification frequency'),

      body('categories')
        .optional()
        .isObject()
        .withMessage('Categories must be an object'),

      body('quietHours')
        .optional()
        .isObject()
        .withMessage('Quiet hours must be an object'),

      body('quietHours.enabled')
        .optional()
        .isBoolean()
        .withMessage('Quiet hours enabled must be a boolean'),

      body('quietHours.start')
        .optional()
        .matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
        .withMessage('Start time must be in HH:MM format'),

      body('quietHours.end')
        .optional()
        .matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
        .withMessage('End time must be in HH:MM format'),

      body('digestSettings')
        .optional()
        .isObject()
        .withMessage('Digest settings must be an object')
    ];
  }

  /**
   * Validate organization security settings
   * @static
   * @returns {Array} Array of validators
   */
  static updateSecuritySettings() {
    return [
      param('organizationId')
        .notEmpty()
        .withMessage('Organization ID is required')
        .isMongoId()
        .withMessage('Invalid organization ID'),

      body('passwordPolicy')
        .optional()
        .isObject()
        .withMessage('Password policy must be an object'),

      body('passwordPolicy.minLength')
        .optional()
        .isInt({ min: 8, max: 128 })
        .withMessage('Minimum length must be between 8 and 128'),

      body('passwordPolicy.requireUppercase')
        .optional()
        .isBoolean()
        .withMessage('Require uppercase must be a boolean'),

      body('passwordPolicy.requireNumbers')
        .optional()
        .isBoolean()
        .withMessage('Require numbers must be a boolean'),

      body('passwordPolicy.requireSpecialChars')
        .optional()
        .isBoolean()
        .withMessage('Require special chars must be a boolean'),

      body('passwordPolicy.expiryDays')
        .optional()
        .isInt({ min: 0, max: 365 })
        .withMessage('Expiry days must be between 0 and 365'),

      body('mfa')
        .optional()
        .isObject()
        .withMessage('MFA settings must be an object'),

      body('mfa.required')
        .optional()
        .isBoolean()
        .withMessage('MFA required must be a boolean'),

      body('mfa.methods')
        .optional()
        .isArray()
        .withMessage('MFA methods must be an array'),

      body('mfa.methods.*')
        .isIn(['totp', 'sms', 'email', 'backup-codes', 'hardware-key'])
        .withMessage('Invalid MFA method'),

      body('ipWhitelist')
        .optional()
        .isArray()
        .withMessage('IP whitelist must be an array'),

      body('ipWhitelist.*')
        .isIP()
        .withMessage('Each IP must be valid'),

      body('sessionTimeout')
        .optional()
        .isInt({ min: 5, max: 1440 })
        .withMessage('Session timeout must be between 5 and 1440 minutes'),

      body('sso')
        .optional()
        .isObject()
        .withMessage('SSO settings must be an object'),

      body('sso.enabled')
        .optional()
        .isBoolean()
        .withMessage('SSO enabled must be a boolean'),

      body('sso.provider')
        .optional()
        .isIn(['saml', 'oauth2', 'oidc', 'ldap'])
        .withMessage('Invalid SSO provider')
    ];
  }

  /**
   * Validate organization API settings
   * @static
   * @returns {Array} Array of validators
   */
  static updateApiSettings() {
    return [
      param('organizationId')
        .notEmpty()
        .withMessage('Organization ID is required')
        .isMongoId()
        .withMessage('Invalid organization ID'),

      body('rateLimit')
        .optional()
        .isObject()
        .withMessage('Rate limit must be an object'),

      body('rateLimit.requestsPerMinute')
        .optional()
        .isInt({ min: 1, max: 10000 })
        .withMessage('Requests per minute must be between 1 and 10000'),

      body('rateLimit.requestsPerHour')
        .optional()
        .isInt({ min: 1, max: 100000 })
        .withMessage('Requests per hour must be between 1 and 100000'),

      body('webhooks')
        .optional()
        .isArray({ max: 50 })
        .withMessage('Maximum 50 webhooks allowed'),

      body('webhooks.*.url')
        .isURL()
        .withMessage('Webhook URL must be valid'),

      body('webhooks.*.events')
        .isArray({ min: 1 })
        .withMessage('At least one event is required'),

      body('webhooks.*.secret')
        .optional()
        .isLength({ min: 16 })
        .withMessage('Webhook secret must be at least 16 characters'),

      body('apiKeys')
        .optional()
        .isArray({ max: 10 })
        .withMessage('Maximum 10 API keys allowed'),

      body('corsOrigins')
        .optional()
        .isArray()
        .withMessage('CORS origins must be an array'),

      body('corsOrigins.*')
        .isURL()
        .withMessage('Each CORS origin must be a valid URL')
    ];
  }

  /**
   * Validate organization export request
   * @static
   * @returns {Array} Array of validators
   */
  static exportData() {
    return [
      param('organizationId')
        .notEmpty()
        .withMessage('Organization ID is required')
        .isMongoId()
        .withMessage('Invalid organization ID'),

      body('format')
        .notEmpty()
        .withMessage('Export format is required')
        .isIn(['json', 'csv', 'xlsx', 'pdf', 'xml'])
        .withMessage('Invalid export format'),

      body('dataTypes')
        .notEmpty()
        .withMessage('Data types are required')
        .isArray({ min: 1 })
        .withMessage('At least one data type is required'),

      body('dataTypes.*')
        .isIn(['users', 'departments', 'teams', 'projects', 'budgets', 'metrics', 'settings', 'audit-logs'])
        .withMessage('Invalid data type'),

      body('dateRange')
        .optional()
        .isObject()
        .withMessage('Date range must be an object'),

      body('dateRange.start')
        .optional()
        .isISO8601()
        .withMessage('Start date must be valid'),

      body('dateRange.end')
        .optional()
        .isISO8601()
        .withMessage('End date must be valid')
        .custom((value, { req }) => {
            if (req.body.dateRange?.start) {
                return new Date(value) > new Date(req.body.dateRange.start);
            }
            return true;
        })
        .withMessage('End date must be after start date'),

      body('filters')
        .optional()
        .isObject()
        .withMessage('Filters must be an object'),

      body('includeArchived')
        .optional()
        .isBoolean()
        .withMessage('Include archived must be a boolean'),

      body('encryptExport')
        .optional()
        .isBoolean()
        .withMessage('Encrypt export must be a boolean'),

      body('notificationEmail')
        .optional()
        .isEmail()
        .withMessage('Notification email must be valid')
    ];
  }

  /**
   * Validate organization import request
   * @static
   * @returns {Array} Array of validators
   */
  static importData() {
    return [
      param('organizationId')
        .notEmpty()
        .withMessage('Organization ID is required')
        .isMongoId()
        .withMessage('Invalid organization ID'),

      body('format')
        .notEmpty()
        .withMessage('Import format is required')
        .isIn(['json', 'csv', 'xlsx', 'xml'])
        .withMessage('Invalid import format'),

      body('dataType')
        .notEmpty()
        .withMessage('Data type is required')
        .isIn(['users', 'departments', 'teams', 'projects', 'contacts'])
        .withMessage('Invalid data type'),

      body('mappings')
        .optional()
        .isObject()
        .withMessage('Field mappings must be an object'),

      body('options')
        .optional()
        .isObject()
        .withMessage('Import options must be an object'),

      body('options.updateExisting')
        .optional()
        .isBoolean()
        .withMessage('Update existing must be a boolean'),

      body('options.skipDuplicates')
        .optional()
        .isBoolean()
        .withMessage('Skip duplicates must be a boolean'),

      body('options.validateOnly')
        .optional()
        .isBoolean()
        .withMessage('Validate only must be a boolean'),

      body('options.batchSize')
        .optional()
        .isInt({ min: 1, max: 1000 })
        .withMessage('Batch size must be between 1 and 1000')
    ];
  }

  /**
   * Check validation with business rules
   * @static
   * @returns {Function} Express middleware
   */
  static checkBusinessRules() {
    return async (req, res, next) => {
      try {
        const { organizationId } = req.params;

        // Example business rule validations
        if (req.body.type === 'enterprise' && req.body.size === '1-10') {
          return next(new AppError(
            'Enterprise organizations must have more than 10 employees',
            400,
            'BUSINESS_RULE_VIOLATION'
          ));
        }

        // Check budget allocation rules
        if (req.body.allocations) {
          const total = req.body.allocations.reduce((sum, a) => sum + a.amount, 0);
          if (Math.abs(total - req.body.totalBudget) > 0.01) {
            return next(new AppError(
              'Budget allocations must equal total budget',
              400,
              'BUDGET_MISMATCH'
            ));
          }
        }

        // Check team size limits
        if (req.body.memberIds && req.body.type === 'project' && req.body.memberIds.length > 15) {
          return next(new AppError(
            'Project teams cannot exceed 15 members',
            400,
            'TEAM_SIZE_EXCEEDED'
          ));
        }

        next();
      } catch (error) {
        next(error);
      }
    };
  }
}

module.exports = OrganizationValidators;
