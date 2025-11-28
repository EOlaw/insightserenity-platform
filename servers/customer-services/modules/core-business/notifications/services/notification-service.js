/**
 * @fileoverview Customer Notification Service with Gmail Integration and File-Based Templates
 * @module servers/customer-services/modules/core-business/notifications/services/notification-service
 * @description Production-ready notification service with Gmail SMTP and organized template files
 * @version 3.0.0
 * 
 * @location servers/customer-services/modules/core-business/notifications/services/notification-service.js
 * 
 * FEATURES:
 * - Gmail SMTP integration via Nodemailer
 * - File-based template system with caching
 * - Support for App Password and OAuth2 authentication
 * - Professional HTML email templates with branding
 * - Mock mode for safe development testing
 * - Rate limiting and connection pooling
 * - Comprehensive error handling
 * - Email sending statistics
 */

const nodemailer = require('nodemailer');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../../../../../../shared/lib/utils/logger').createLogger({
    serviceName: 'notification-service'
});
const { AppError } = require('../../../../../../shared/lib/utils/app-error');

/**
 * Customer Notification Service with Gmail Integration and File-Based Templates
 * Handles email notifications via Gmail SMTP with organized template management
 * @class CustomerNotificationService
 */
class CustomerNotificationService {
    constructor() {
        // Email configuration
        this.config = {
            emailProvider: process.env.EMAIL_PROVIDER || 'gmail',
            gmailUser: process.env.GMAIL_USER,
            gmailAppPassword: process.env.GMAIL_APP_PASSWORD,
            gmailClientId: process.env.GMAIL_CLIENT_ID,
            gmailClientSecret: process.env.GMAIL_CLIENT_SECRET,
            gmailRefreshToken: process.env.GMAIL_REFRESH_TOKEN,
            defaultFrom: process.env.NOTIFICATION_FROM_EMAIL || process.env.GMAIL_USER || 'noreply@example.com',
            defaultFromName: process.env.NOTIFICATION_FROM_NAME || 'InsightSerenity Platform',
            useMockEmail: process.env.USE_MOCK_EMAIL === 'true',
            platformUrl: process.env.PLATFORM_URL || 'http://localhost:3000',
            templatesPath: path.join(__dirname, '../templates')
        };

        // Template cache for performance
        this.templateCache = new Map();

        // Email sending statistics
        this.stats = {
            sent: 0,
            failed: 0,
            mocked: 0
        };

        // Template path mapping
        this.templatePaths = {
            'email-verification': 'auth/email-verification.html',
            'password-reset': 'auth/password-reset.html',
            'password-changed': 'auth/password-changed.html',
            'account-activated': 'auth/account-activated.html',
            'welcome-client': 'client/welcome-client.html',
            'welcome-consultant': 'consultant/welcome-consultant.html'
        };

        // Initialize Gmail transporter
        this.transporter = null;
        this._initializeGmailTransporter();
    }

    /**
     * Initialize Gmail SMTP transporter
     * @private
     */
    _initializeGmailTransporter() {
        // Log mock mode status
        if (this.config.useMockEmail) {
            logger.warn('Running in MOCK email mode - emails will not be sent', {
                useMockEmail: this.config.useMockEmail,
                environment: process.env.NODE_ENV
            });
            return;
        }

        // Check for Gmail credentials
        if (!this.config.gmailUser) {
            logger.warn('Gmail user not configured - falling back to mock mode', {
                provider: this.config.emailProvider
            });
            this.config.useMockEmail = true;
            return;
        }

        try {
            // Determine authentication method
            const useOAuth2 = this.config.gmailClientId && 
                              this.config.gmailClientSecret && 
                              this.config.gmailRefreshToken;

            if (useOAuth2) {
                // OAuth2 authentication (more secure for production)
                this.transporter = nodemailer.createTransport({
                    service: 'gmail',
                    auth: {
                        type: 'OAuth2',
                        user: this.config.gmailUser,
                        clientId: this.config.gmailClientId,
                        clientSecret: this.config.gmailClientSecret,
                        refreshToken: this.config.gmailRefreshToken
                    },
                    pool: true,
                    maxConnections: 5,
                    maxMessages: 100,
                    rateDelta: 1000,
                    rateLimit: 1
                });

                logger.info('Gmail email service initialized with OAuth2', {
                    user: this.config.gmailUser,
                    authType: 'OAuth2'
                });
            } else if (this.config.gmailAppPassword) {
                // App Password authentication (simpler setup)
                this.transporter = nodemailer.createTransport({
                    service: 'gmail',
                    auth: {
                        user: this.config.gmailUser,
                        pass: this.config.gmailAppPassword
                    },
                    pool: true,
                    maxConnections: 5,
                    maxMessages: 100,
                    rateDelta: 1000,
                    rateLimit: 1
                });

                logger.info('Gmail email service initialized with App Password', {
                    user: this.config.gmailUser,
                    authType: 'App Password'
                });
            } else {
                logger.warn('Gmail credentials incomplete - falling back to mock mode', {
                    hasUser: !!this.config.gmailUser,
                    hasAppPassword: !!this.config.gmailAppPassword,
                    hasOAuth2: useOAuth2
                });
                this.config.useMockEmail = true;
                return;
            }

            // Verify transporter configuration
            this.transporter.verify((error, success) => {
                if (error) {
                    logger.error('Gmail transporter verification failed', {
                        error: error.message,
                        code: error.code
                    });
                    this.config.useMockEmail = true;
                    this.transporter = null;
                } else {
                    logger.info('Gmail transporter verified successfully', {
                        user: this.config.gmailUser,
                        ready: success
                    });
                }
            });

        } catch (error) {
            logger.error('Failed to initialize Gmail transporter', {
                error: error.message,
                stack: error.stack
            });
            this.config.useMockEmail = true;
            this.transporter = null;
        }
    }

    /**
     * Load email template from file system
     * @private
     * @param {string} templateName - Template name
     * @returns {Promise<string>} Template HTML content
     */
    async _loadTemplate(templateName) {
        try {
            // Check cache first
            if (this.templateCache.has(templateName)) {
                logger.debug('Loading template from cache', {
                    template: templateName
                });
                return this.templateCache.get(templateName);
            }

            // Get template path
            const templatePath = this.templatePaths[templateName];
            if (!templatePath) {
                throw new Error(`Unknown template: ${templateName}`);
            }

            // Construct full file path
            const fullPath = path.join(this.config.templatesPath, templatePath);

            // Read template file
            logger.debug('Loading template from file', {
                template: templateName,
                path: fullPath
            });

            const templateContent = await fs.readFile(fullPath, 'utf8');

            // Cache template
            this.templateCache.set(templateName, templateContent);

            logger.debug('Template loaded and cached successfully', {
                template: templateName,
                size: templateContent.length
            });

            return templateContent;

        } catch (error) {
            logger.error('Failed to load template file', {
                template: templateName,
                error: error.message,
                path: this.config.templatesPath
            });

            // Return fallback template
            return this._getFallbackTemplate(templateName);
        }
    }

    /**
     * Get fallback inline template if file loading fails
     * @private
     * @param {string} templateName - Template name
     * @returns {string} Fallback template HTML
     */
    _getFallbackTemplate(templateName) {
        logger.warn('Using fallback inline template', {
            template: templateName
        });

        // Simple fallback template with basic structure
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; }
                    .container { max-width: 600px; margin: 0 auto; background: #fff; }
                    .header { background: #000; color: #ffc451; padding: 20px; text-align: center; }
                    .content { padding: 30px; }
                    .footer { background: #f8f8f8; padding: 20px; text-align: center; font-size: 12px; color: #888; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header"><h1>InsightSerenity</h1></div>
                    <div class="content">
                        <p>You have received a notification from InsightSerenity.</p>
                    </div>
                    <div class="footer">
                        <p>&copy; ${new Date().getFullYear()} InsightSerenity. All rights reserved.</p>
                    </div>
                </div>
            </body>
            </html>
        `;
    }

    /**
     * Replace template variables with actual data
     * @private
     * @param {string} template - Template HTML
     * @param {Object} data - Template data
     * @returns {string} Processed template
     */
    _replaceTemplateVariables(template, data) {
        let processed = template;

        // Add system variables
        const allData = {
            ...data,
            year: new Date().getFullYear(),
            timestamp: new Date().toLocaleString(),
            platformUrl: this.config.platformUrl
        };

        // Replace all {{variable}} placeholders
        Object.keys(allData).forEach(key => {
            const regex = new RegExp(`{{${key}}}`, 'g');
            processed = processed.replace(regex, allData[key] || '');
        });

        // Handle conditional blocks {{#if variable}}...{{/if}}
        processed = processed.replace(/{{#if\s+(\w+)}}(.*?){{\/if}}/gs, (match, variable, content) => {
            return allData[variable] ? content : '';
        });

        return processed;
    }

    /**
     * Get email template subject based on template name
     * @private
     * @param {string} templateName - Template name
     * @returns {string} Email subject
     */
    _getTemplateSubject(templateName) {
        const subjects = {
            'email-verification': 'Verify Your Email Address',
            'password-reset': 'Reset Your Password',
            'password-changed': 'Your Password Has Been Changed',
            'account-activated': 'Your Account is Now Active',
            'welcome-client': 'Welcome to InsightSerenity',
            'welcome-consultant': 'Welcome to InsightSerenity'
        };

        return subjects[templateName] || 'Notification from InsightSerenity';
    }

    /**
     * Send email notification
     * @param {Object} options - Email options
     * @param {string} options.to - Recipient email
     * @param {string} options.template - Template name
     * @param {Object} options.data - Template data
     * @param {string} [options.subject] - Email subject (optional if in template)
     * @param {string} [options.from] - Sender email (optional)
     * @returns {Promise<Object>} Send result
     */
    async sendEmail(options) {
        try {
            const { to, template, data, subject, from } = options;

            if (!to) {
                throw new AppError('Recipient email is required', 400, 'MISSING_RECIPIENT');
            }

            if (!template) {
                throw new AppError('Email template is required', 400, 'MISSING_TEMPLATE');
            }

            // Load template from file
            const templateHtml = await this._loadTemplate(template);

            // Replace variables in template
            const processedHtml = this._replaceTemplateVariables(templateHtml, data || {});

            // Get subject
            const emailSubject = subject || this._getTemplateSubject(template);
            const emailFrom = from || `"${this.config.defaultFromName}" <${this.config.defaultFrom}>`;

            // Mock mode - log email details without sending
            if (this.config.useMockEmail) {
                logger.info('Email notification (MOCK MODE)', {
                    to: to,
                    from: emailFrom,
                    subject: emailSubject,
                    template: template,
                    hasData: !!data
                });

                // Log verification link if present (helpful for testing)
                if (data && data.verificationLink) {
                    logger.info('MOCK EMAIL - Verification Link', {
                        link: data.verificationLink
                    });
                }

                // Log reset link if present
                if (data && data.resetLink) {
                    logger.info('MOCK EMAIL - Reset Link', {
                        link: data.resetLink
                    });
                }

                this.stats.mocked++;

                return {
                    messageId: `mock-email-${Date.now()}`,
                    status: 'mocked',
                    to: to,
                    template: template,
                    mockedAt: new Date().toISOString()
                };
            }

            // Production mode - send real email via Gmail
            if (!this.transporter) {
                throw new AppError(
                    'Email service not configured. Please check Gmail credentials.',
                    500,
                    'EMAIL_SERVICE_UNAVAILABLE'
                );
            }

            // Prepare email message
            const mailOptions = {
                from: emailFrom,
                to: to,
                subject: emailSubject,
                html: processedHtml,
                // Add plain text version for better compatibility
                text: this._stripHtml(processedHtml)
            };

            // Send email via Gmail
            const info = await this.transporter.sendMail(mailOptions);

            logger.info('Email sent successfully via Gmail', {
                messageId: info.messageId,
                to: to,
                template: template,
                accepted: info.accepted,
                rejected: info.rejected,
                response: info.response
            });

            this.stats.sent++;

            return {
                messageId: info.messageId,
                status: 'sent',
                to: to,
                template: template,
                sentAt: new Date().toISOString(),
                accepted: info.accepted,
                rejected: info.rejected
            };

        } catch (error) {
            logger.error('Send email failed', {
                error: error.message,
                code: error.code,
                to: options.to,
                template: options.template,
                stack: error.stack
            });

            this.stats.failed++;

            // Provide helpful error messages
            if (error.code === 'EAUTH') {
                throw new AppError(
                    'Gmail authentication failed. Please check your App Password or OAuth2 credentials.',
                    500,
                    'EMAIL_AUTH_FAILED'
                );
            } else if (error.code === 'ECONNECTION') {
                throw new AppError(
                    'Failed to connect to Gmail SMTP server. Please check your internet connection.',
                    500,
                    'EMAIL_CONNECTION_FAILED'
                );
            } else if (error.code === 'EMESSAGE') {
                throw new AppError(
                    'Invalid email message format. Please check the email content.',
                    400,
                    'INVALID_EMAIL_MESSAGE'
                );
            }

            throw error;
        }
    }

    /**
     * Strip HTML tags for plain text version
     * @private
     * @param {string} html - HTML content
     * @returns {string} Plain text
     */
    _stripHtml(html) {
        return html
            .replace(/<style[^>]*>.*?<\/style>/gi, '')
            .replace(/<script[^>]*>.*?<\/script>/gi, '')
            .replace(/<[^>]+>/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Clear template cache
     * @returns {void}
     */
    clearTemplateCache() {
        this.templateCache.clear();
        logger.info('Template cache cleared', {
            previousSize: this.templateCache.size
        });
    }

    /**
     * Preload all templates into cache
     * @returns {Promise<void>}
     */
    async preloadTemplates() {
        try {
            logger.info('Preloading email templates', {
                templates: Object.keys(this.templatePaths)
            });

            const loadPromises = Object.keys(this.templatePaths).map(templateName =>
                this._loadTemplate(templateName)
            );

            await Promise.all(loadPromises);

            logger.info('All templates preloaded successfully', {
                count: this.templateCache.size
            });
        } catch (error) {
            logger.error('Failed to preload templates', {
                error: error.message
            });
        }
    }

    /**
     * Send SMS notification (stub)
     * @param {Object} options - SMS options
     * @param {string} options.to - Recipient phone number
     * @param {string} options.message - SMS message
     * @returns {Promise<Object>} Send result
     */
    async sendSMS(options) {
        try {
            const { to, message } = options;

            if (!to) {
                throw new AppError('Recipient phone number is required', 400, 'MISSING_RECIPIENT');
            }

            if (!message) {
                throw new AppError('SMS message is required', 400, 'MISSING_MESSAGE');
            }

            // TODO: Implement SMS sending via Twilio or AWS SNS

            logger.info('SMS notification stub called', {
                to: to.replace(/\d(?=\d{4})/g, '*'),
                messageLength: message.length
            });

            return {
                messageId: `stub-sms-${Date.now()}`,
                status: 'queued',
                to: to,
                sentAt: new Date().toISOString()
            };

        } catch (error) {
            logger.error('Send SMS failed', {
                error: error.message,
                to: options.to
            });
            throw error;
        }
    }

    /**
     * Send push notification (stub)
     * @param {Object} options - Push notification options
     * @param {string} options.userId - User ID
     * @param {string} options.title - Notification title
     * @param {string} options.body - Notification body
     * @param {Object} options.data - Additional data
     * @returns {Promise<Object>} Send result
     */
    async sendPushNotification(options) {
        try {
            const { userId, title, body, data } = options;

            if (!userId) {
                throw new AppError('User ID is required', 400, 'MISSING_USER_ID');
            }

            if (!title || !body) {
                throw new AppError('Notification title and body are required', 400, 'MISSING_CONTENT');
            }

            // TODO: Implement push notification via FCM or APNS

            logger.info('Push notification stub called', {
                userId: userId,
                title: title
            });

            return {
                notificationId: `stub-push-${Date.now()}`,
                status: 'sent',
                userId: userId,
                sentAt: new Date().toISOString()
            };

        } catch (error) {
            logger.error('Send push notification failed', {
                error: error.message,
                userId: options.userId
            });
            throw error;
        }
    }

    /**
     * Get pending notifications (stub)
     * @param {string} userId - User ID
     * @param {Object} options - Query options
     * @returns {Promise<Array>} Pending notifications
     */
    async getPendingNotifications(userId, options = {}) {
        try {
            if (!userId) {
                throw new AppError('User ID is required', 400, 'MISSING_USER_ID');
            }

            // TODO: Implement database query for pending notifications

            logger.debug('Get pending notifications stub called', {
                userId: userId,
                options: options
            });

            return [];

        } catch (error) {
            logger.error('Get pending notifications failed', {
                error: error.message,
                userId: userId
            });
            throw error;
        }
    }

    /**
     * Subscribe to notification channels (stub)
     * @param {string} userId - User ID
     * @param {Array<string>} channels - Channel names
     * @returns {Promise<Object>} Subscription result
     */
    async subscribeToChannels(userId, channels) {
        try {
            if (!userId) {
                throw new AppError('User ID is required', 400, 'MISSING_USER_ID');
            }

            if (!channels || !Array.isArray(channels)) {
                throw new AppError('Channels array is required', 400, 'MISSING_CHANNELS');
            }

            // TODO: Implement channel subscription in database

            logger.info('Subscribe to channels stub called', {
                userId: userId,
                channels: channels
            });

            return {
                userId: userId,
                subscribedChannels: channels,
                subscribedAt: new Date().toISOString()
            };

        } catch (error) {
            logger.error('Subscribe to channels failed', {
                error: error.message,
                userId: userId
            });
            throw error;
        }
    }

    /**
     * Mark notification as read (stub)
     * @param {string} notificationId - Notification ID
     * @param {string} userId - User ID
     * @returns {Promise<Object>} Update result
     */
    async markAsRead(notificationId, userId) {
        try {
            // TODO: Implement mark as read in database

            logger.debug('Mark notification as read stub called', {
                notificationId: notificationId,
                userId: userId
            });

            return {
                notificationId: notificationId,
                read: true,
                readAt: new Date().toISOString()
            };

        } catch (error) {
            logger.error('Mark as read failed', {
                error: error.message,
                notificationId: notificationId
            });
            throw error;
        }
    }

    /**
     * Get email sending statistics
     * @returns {Object} Statistics
     */
    getStats() {
        return {
            ...this.stats,
            cachedTemplates: this.templateCache.size,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Test email configuration
     * @returns {Promise<Object>} Test result
     */
    async testConfiguration() {
        try {
            if (this.config.useMockEmail) {
                return {
                    status: 'mock_mode',
                    message: 'Email service is running in mock mode',
                    config: {
                        provider: this.config.emailProvider,
                        useMockEmail: this.config.useMockEmail,
                        templatesPath: this.config.templatesPath
                    }
                };
            }

            if (!this.transporter) {
                return {
                    status: 'not_configured',
                    message: 'Email service is not properly configured',
                    config: {
                        hasGmailUser: !!this.config.gmailUser,
                        hasGmailAppPassword: !!this.config.gmailAppPassword,
                        hasOAuth2: !!(this.config.gmailClientId && this.config.gmailClientSecret),
                        templatesPath: this.config.templatesPath
                    }
                };
            }

            await this.transporter.verify();

            return {
                status: 'ready',
                message: 'Email service is configured and ready',
                config: {
                    provider: this.config.emailProvider,
                    user: this.config.gmailUser,
                    from: this.config.defaultFrom,
                    templatesPath: this.config.templatesPath,
                    cachedTemplates: this.templateCache.size
                }
            };

        } catch (error) {
            return {
                status: 'error',
                message: 'Email service configuration test failed',
                error: error.message
            };
        }
    }
}

// Export singleton instance
module.exports = new CustomerNotificationService();