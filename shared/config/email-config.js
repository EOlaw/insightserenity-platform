'use strict';

/**
 * @fileoverview Email configuration for various email service providers
 * @module shared/config/email-config
 */

const { parseBoolean, parseNumber, parseArray, parseJSON } = require('./base-config').helpers;

// Email configuration object
const emailConfig = {
  // Email service configuration
  enabled: parseBoolean(process.env.EMAIL_ENABLED, true),
  provider: process.env.EMAIL_PROVIDER || 'sendgrid', // sendgrid, mailgun, ses, smtp
  from: {
    name: process.env.EMAIL_FROM_NAME || 'InsightSerenity Platform',
    address: process.env.EMAIL_FROM_ADDRESS || 'noreply@insightserenity.com',
    replyTo: process.env.EMAIL_REPLY_TO || 'support@insightserenity.com'
  },

  // Provider-specific configurations
  providers: {
    sendgrid: {
      apiKey: process.env.SENDGRID_API_KEY || '',
      sandboxMode: parseBoolean(process.env.SENDGRID_SANDBOX_MODE, false),
      ipPoolName: process.env.SENDGRID_IP_POOL || '',
      categories: parseArray(process.env.SENDGRID_CATEGORIES, ['platform', 'transactional']),
      substitutionWrappers: parseArray(process.env.SENDGRID_SUB_WRAPPERS, ['{{', '}}']),
      webhookSecret: process.env.SENDGRID_WEBHOOK_SECRET || ''
    },
    mailgun: {
      apiKey: process.env.MAILGUN_API_KEY || '',
      domain: process.env.MAILGUN_DOMAIN || '',
      host: process.env.MAILGUN_HOST || 'api.mailgun.net',
      version: process.env.MAILGUN_VERSION || 'v3',
      testMode: parseBoolean(process.env.MAILGUN_TEST_MODE, false),
      dkim: parseBoolean(process.env.MAILGUN_DKIM, true),
      tracking: parseBoolean(process.env.MAILGUN_TRACKING, true),
      trackingClicks: parseBoolean(process.env.MAILGUN_TRACKING_CLICKS, true),
      trackingOpens: parseBoolean(process.env.MAILGUN_TRACKING_OPENS, true),
      tags: parseArray(process.env.MAILGUN_TAGS, ['platform'])
    },
    ses: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      region: process.env.AWS_REGION || 'us-east-1',
      configurationSet: process.env.SES_CONFIGURATION_SET || '',
      maxSendRate: parseNumber(process.env.SES_MAX_SEND_RATE, 14),
      tags: parseJSON(process.env.SES_TAGS, {}),
      feedbackForwardingEnabled: parseBoolean(process.env.SES_FEEDBACK_FORWARDING, false)
    },
    smtp: {
      host: process.env.SMTP_HOST || '',
      port: parseNumber(process.env.SMTP_PORT, 587),
      secure: parseBoolean(process.env.SMTP_SECURE, false),
      auth: {
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || ''
      },
      tls: {
        rejectUnauthorized: parseBoolean(process.env.SMTP_TLS_REJECT_UNAUTHORIZED, true),
        minVersion: process.env.SMTP_TLS_MIN_VERSION || 'TLSv1.2',
        ciphers: process.env.SMTP_TLS_CIPHERS || ''
      },
      pool: parseBoolean(process.env.SMTP_POOL, true),
      maxConnections: parseNumber(process.env.SMTP_MAX_CONNECTIONS, 5),
      maxMessages: parseNumber(process.env.SMTP_MAX_MESSAGES, 100),
      rateDelta: parseNumber(process.env.SMTP_RATE_DELTA, 1000),
      rateLimit: parseNumber(process.env.SMTP_RATE_LIMIT, 10)
    }
  },

  // Template configuration
  templates: {
    engine: process.env.EMAIL_TEMPLATE_ENGINE || 'handlebars', // handlebars, ejs, pug
    directory: process.env.EMAIL_TEMPLATE_DIR || './email-templates',
    cache: parseBoolean(process.env.EMAIL_TEMPLATE_CACHE, true),
    defaultLayout: process.env.EMAIL_DEFAULT_LAYOUT || 'main',
    partials: {
      directory: process.env.EMAIL_PARTIALS_DIR || './email-templates/partials',
      extension: process.env.EMAIL_PARTIALS_EXT || '.hbs'
    },
    helpers: {
      directory: process.env.EMAIL_HELPERS_DIR || './email-templates/helpers'
    }
  },

  // Email types configuration
  emailTypes: {
    welcome: {
      enabled: parseBoolean(process.env.EMAIL_WELCOME_ENABLED, true),
      subject: process.env.EMAIL_WELCOME_SUBJECT || 'Welcome to InsightSerenity',
      template: process.env.EMAIL_WELCOME_TEMPLATE || 'welcome',
      priority: process.env.EMAIL_WELCOME_PRIORITY || 'normal'
    },
    verification: {
      enabled: parseBoolean(process.env.EMAIL_VERIFICATION_ENABLED, true),
      subject: process.env.EMAIL_VERIFICATION_SUBJECT || 'Verify your email address',
      template: process.env.EMAIL_VERIFICATION_TEMPLATE || 'verification',
      priority: process.env.EMAIL_VERIFICATION_PRIORITY || 'high',
      expiryHours: parseNumber(process.env.EMAIL_VERIFICATION_EXPIRY_HOURS, 24)
    },
    passwordReset: {
      enabled: parseBoolean(process.env.EMAIL_PASSWORD_RESET_ENABLED, true),
      subject: process.env.EMAIL_PASSWORD_RESET_SUBJECT || 'Reset your password',
      template: process.env.EMAIL_PASSWORD_RESET_TEMPLATE || 'password-reset',
      priority: process.env.EMAIL_PASSWORD_RESET_PRIORITY || 'high',
      expiryHours: parseNumber(process.env.EMAIL_PASSWORD_RESET_EXPIRY_HOURS, 1)
    },
    invitation: {
      enabled: parseBoolean(process.env.EMAIL_INVITATION_ENABLED, true),
      subject: process.env.EMAIL_INVITATION_SUBJECT || 'You have been invited to InsightSerenity',
      template: process.env.EMAIL_INVITATION_TEMPLATE || 'invitation',
      priority: process.env.EMAIL_INVITATION_PRIORITY || 'normal',
      expiryDays: parseNumber(process.env.EMAIL_INVITATION_EXPIRY_DAYS, 7)
    },
    notification: {
      enabled: parseBoolean(process.env.EMAIL_NOTIFICATION_ENABLED, true),
      subject: process.env.EMAIL_NOTIFICATION_SUBJECT || 'New notification from InsightSerenity',
      template: process.env.EMAIL_NOTIFICATION_TEMPLATE || 'notification',
      priority: process.env.EMAIL_NOTIFICATION_PRIORITY || 'normal'
    },
    digest: {
      enabled: parseBoolean(process.env.EMAIL_DIGEST_ENABLED, true),
      subject: process.env.EMAIL_DIGEST_SUBJECT || 'Your weekly InsightSerenity digest',
      template: process.env.EMAIL_DIGEST_TEMPLATE || 'digest',
      priority: process.env.EMAIL_DIGEST_PRIORITY || 'low',
      schedule: process.env.EMAIL_DIGEST_SCHEDULE || '0 9 * * 1' // Mondays at 9 AM
    },
    alert: {
      enabled: parseBoolean(process.env.EMAIL_ALERT_ENABLED, true),
      subject: process.env.EMAIL_ALERT_SUBJECT || 'Important alert from InsightSerenity',
      template: process.env.EMAIL_ALERT_TEMPLATE || 'alert',
      priority: process.env.EMAIL_ALERT_PRIORITY || 'high'
    },
    invoice: {
      enabled: parseBoolean(process.env.EMAIL_INVOICE_ENABLED, true),
      subject: process.env.EMAIL_INVOICE_SUBJECT || 'Your InsightSerenity invoice',
      template: process.env.EMAIL_INVOICE_TEMPLATE || 'invoice',
      priority: process.env.EMAIL_INVOICE_PRIORITY || 'normal',
      attachPdf: parseBoolean(process.env.EMAIL_INVOICE_ATTACH_PDF, true)
    }
  },

  // Queue configuration
  queue: {
    enabled: parseBoolean(process.env.EMAIL_QUEUE_ENABLED, true),
    name: process.env.EMAIL_QUEUE_NAME || 'email-queue',
    concurrency: parseNumber(process.env.EMAIL_QUEUE_CONCURRENCY, 5),
    defaultDelay: parseNumber(process.env.EMAIL_QUEUE_DEFAULT_DELAY, 0),
    defaultRetries: parseNumber(process.env.EMAIL_QUEUE_DEFAULT_RETRIES, 3),
    retryDelay: parseNumber(process.env.EMAIL_QUEUE_RETRY_DELAY, 60000), // 1 minute
    removeOnComplete: parseBoolean(process.env.EMAIL_QUEUE_REMOVE_ON_COMPLETE, true),
    removeOnFail: parseBoolean(process.env.EMAIL_QUEUE_REMOVE_ON_FAIL, false),
    storeFailures: parseBoolean(process.env.EMAIL_QUEUE_STORE_FAILURES, true)
  },

  // Rate limiting
  rateLimit: {
    enabled: parseBoolean(process.env.EMAIL_RATE_LIMIT_ENABLED, true),
    perSecond: parseNumber(process.env.EMAIL_RATE_LIMIT_PER_SECOND, 10),
    perMinute: parseNumber(process.env.EMAIL_RATE_LIMIT_PER_MINUTE, 100),
    perHour: parseNumber(process.env.EMAIL_RATE_LIMIT_PER_HOUR, 1000),
    perDay: parseNumber(process.env.EMAIL_RATE_LIMIT_PER_DAY, 10000),
    burst: parseNumber(process.env.EMAIL_RATE_LIMIT_BURST, 20)
  },

  // Bounce and complaint handling
  bounceHandling: {
    enabled: parseBoolean(process.env.EMAIL_BOUNCE_HANDLING_ENABLED, true),
    webhookEndpoint: process.env.EMAIL_BOUNCE_WEBHOOK || '/webhooks/email/bounce',
    maxBounceRate: parseNumber(process.env.EMAIL_MAX_BOUNCE_RATE, 5), // percentage
    hardBounceAction: process.env.EMAIL_HARD_BOUNCE_ACTION || 'blacklist',
    softBounceThreshold: parseNumber(process.env.EMAIL_SOFT_BOUNCE_THRESHOLD, 3),
    complaintAction: process.env.EMAIL_COMPLAINT_ACTION || 'unsubscribe'
  },

  // Email validation
  validation: {
    enabled: parseBoolean(process.env.EMAIL_VALIDATION_ENABLED, true),
    checkMx: parseBoolean(process.env.EMAIL_VALIDATION_CHECK_MX, true),
    checkDisposable: parseBoolean(process.env.EMAIL_VALIDATION_CHECK_DISPOSABLE, true),
    checkFree: parseBoolean(process.env.EMAIL_VALIDATION_CHECK_FREE, false),
    allowedDomains: parseArray(process.env.EMAIL_ALLOWED_DOMAINS, []),
    blockedDomains: parseArray(process.env.EMAIL_BLOCKED_DOMAINS, []),
    validateOnSignup: parseBoolean(process.env.EMAIL_VALIDATE_ON_SIGNUP, true)
  },

  // Tracking and analytics
  tracking: {
    enabled: parseBoolean(process.env.EMAIL_TRACKING_ENABLED, true),
    opens: parseBoolean(process.env.EMAIL_TRACK_OPENS, true),
    clicks: parseBoolean(process.env.EMAIL_TRACK_CLICKS, true),
    unsubscribes: parseBoolean(process.env.EMAIL_TRACK_UNSUBSCRIBES, true),
    customDomain: process.env.EMAIL_TRACKING_DOMAIN || '',
    pixelUrl: process.env.EMAIL_TRACKING_PIXEL_URL || '/track/open',
    clickUrl: process.env.EMAIL_TRACKING_CLICK_URL || '/track/click'
  },

  // Multi-tenant email configuration
  multiTenant: {
    enabled: parseBoolean(process.env.EMAIL_MULTI_TENANT_ENABLED, true),
    allowCustomDomains: parseBoolean(process.env.EMAIL_ALLOW_CUSTOM_DOMAINS, true),
    allowCustomTemplates: parseBoolean(process.env.EMAIL_ALLOW_CUSTOM_TEMPLATES, true),
    defaultsPerTenant: parseBoolean(process.env.EMAIL_DEFAULTS_PER_TENANT, true),
    isolateQueues: parseBoolean(process.env.EMAIL_ISOLATE_QUEUES, false),
    maxCustomTemplates: parseNumber(process.env.EMAIL_MAX_CUSTOM_TEMPLATES, 50)
  },

  // Development and testing
  development: {
    preview: parseBoolean(process.env.EMAIL_PREVIEW_ENABLED, true),
    previewPort: parseNumber(process.env.EMAIL_PREVIEW_PORT, 3003),
    interceptAll: parseBoolean(process.env.EMAIL_INTERCEPT_ALL, process.env.NODE_ENV !== 'production'),
    interceptAddress: process.env.EMAIL_INTERCEPT_ADDRESS || 'dev@insightserenity.com',
    logToConsole: parseBoolean(process.env.EMAIL_LOG_TO_CONSOLE, process.env.NODE_ENV === 'development'),
    saveToFile: parseBoolean(process.env.EMAIL_SAVE_TO_FILE, false),
    fileDirectory: process.env.EMAIL_FILE_DIRECTORY || './email-logs'
  },

  // Compliance and legal
  compliance: {
    includeUnsubscribeLink: parseBoolean(process.env.EMAIL_INCLUDE_UNSUBSCRIBE, true),
    includePhysicalAddress: parseBoolean(process.env.EMAIL_INCLUDE_ADDRESS, true),
    physicalAddress: process.env.EMAIL_PHYSICAL_ADDRESS || '123 Main St, City, State 12345',
    gdprCompliant: parseBoolean(process.env.EMAIL_GDPR_COMPLIANT, true),
    canSpamCompliant: parseBoolean(process.env.EMAIL_CAN_SPAM_COMPLIANT, true),
    doubleOptIn: parseBoolean(process.env.EMAIL_DOUBLE_OPT_IN, false)
  }
};

// Validate email configuration
const validateEmailConfig = (config) => {
  const errors = [];

  if (!config.enabled) {
    return true; // Skip validation if email is disabled
  }

  // Validate provider
  const validProviders = ['sendgrid', 'mailgun', 'ses', 'smtp'];
  if (!validProviders.includes(config.provider)) {
    errors.push(`Invalid email provider: ${config.provider}`);
  }

  // Validate from address
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(config.from.address)) {
    errors.push('Invalid from email address');
  }

  // Provider-specific validations
  switch (config.provider) {
    case 'sendgrid':
      if (!config.providers.sendgrid.apiKey) {
        errors.push('SendGrid API key is required');
      }
      break;
    case 'mailgun':
      if (!config.providers.mailgun.apiKey || !config.providers.mailgun.domain) {
        errors.push('Mailgun API key and domain are required');
      }
      break;
    case 'ses':
      if (!config.providers.ses.accessKeyId || !config.providers.ses.secretAccessKey) {
        errors.push('AWS credentials are required for SES');
      }
      break;
    case 'smtp':
      if (!config.providers.smtp.host || !config.providers.smtp.auth.user || !config.providers.smtp.auth.pass) {
        errors.push('SMTP host and authentication are required');
      }
      break;
  }

  // Validate template engine
  const validEngines = ['handlebars', 'ejs', 'pug'];
  if (!validEngines.includes(config.templates.engine)) {
    errors.push(`Invalid template engine: ${config.templates.engine}`);
  }

  // Validate rate limits
  if (config.rateLimit.perSecond > config.rateLimit.perMinute / 60) {
    errors.push('Per-second rate limit exceeds per-minute limit');
  }

  // Production-specific validations
  if (process.env.NODE_ENV === 'production') {
    if (config.development.interceptAll) {
      errors.push('Email interception should be disabled in production');
    }
    if (!config.bounceHandling.enabled) {
      console.warn('Warning: Bounce handling should be enabled in production');
    }
    if (!config.compliance.includeUnsubscribeLink) {
      errors.push('Unsubscribe links are required for compliance');
    }
  }

  // if (errors.length > 0) {
  //   throw new Error('Email configuration validation failed:\n' + errors.join('\n'));
  // }

  return true;
};

// Validate the configuration
validateEmailConfig(emailConfig);

// Export configuration
module.exports = emailConfig;