/**
 * @fileoverview Customer Notification Service with Gmail Integration
 * @module servers/customer-services/modules/core-business/notifications/services/notification-service
 * @description Production-ready notification service with Gmail SMTP for email delivery
 * @version 2.0.0
 * 
 * @location servers/customer-services/modules/core-business/notifications/services/notification-service.js
 * 
 * FEATURES:
 * - Gmail SMTP integration via Nodemailer
 * - Support for App Password and OAuth2 authentication
 * - Professional HTML email templates with branding
 * - Mock mode for safe development testing
 * - Rate limiting and connection pooling
 * - Comprehensive error handling
 * - Email sending statistics
 */

const nodemailer = require('nodemailer');
const logger = require('../../../../../../shared/lib/utils/logger').createLogger({
    serviceName: 'notification-service'
});
const { AppError } = require('../../../../../../shared/lib/utils/app-error');

/**
 * Customer Notification Service with Gmail Integration
 * Handles email notifications via Gmail SMTP
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
            platformUrl: process.env.PLATFORM_URL || 'http://localhost:3000'
        };

        // Email sending statistics
        this.stats = {
            sent: 0,
            failed: 0,
            mocked: 0
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
     * Get email template HTML
     * @private
     * @param {string} template - Template name
     * @param {Object} data - Template data
     * @returns {Object} Email subject and HTML content
     */
    _getEmailTemplate(template, data) {
        const { platformUrl } = this.config;
        
        // Base email styles
        const emailStyles = `
            body { 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                line-height: 1.6;
                color: #333;
                margin: 0;
                padding: 0;
                background-color: #f4f4f4;
            }
            .email-container {
                max-width: 600px;
                margin: 0 auto;
                background-color: #ffffff;
            }
            .email-header {
                background-color: #000000;
                padding: 30px;
                text-align: center;
            }
            .email-logo {
                color: #ffc451;
                font-size: 28px;
                font-weight: bold;
                margin: 0;
            }
            .email-body {
                padding: 40px 30px;
            }
            .email-title {
                color: #000000;
                font-size: 24px;
                margin-bottom: 20px;
                font-weight: 600;
            }
            .email-text {
                color: #555;
                font-size: 16px;
                margin-bottom: 20px;
            }
            .email-button {
                display: inline-block;
                padding: 14px 32px;
                background-color: #ffc451;
                color: #000000;
                text-decoration: none;
                border-radius: 5px;
                font-weight: 600;
                font-size: 16px;
                margin: 20px 0;
            }
            .email-code {
                font-size: 32px;
                font-weight: bold;
                color: #ffc451;
                background-color: #f8f8f8;
                padding: 20px;
                border-radius: 8px;
                text-align: center;
                letter-spacing: 8px;
                margin: 20px 0;
                font-family: 'Courier New', monospace;
            }
            .email-footer {
                background-color: #f8f8f8;
                padding: 30px;
                text-align: center;
                color: #888;
                font-size: 14px;
            }
            .email-divider {
                border-top: 1px solid #e0e0e0;
                margin: 30px 0;
            }
            .email-warning {
                background-color: #fff3cd;
                border-left: 4px solid #ffc107;
                padding: 15px;
                margin: 20px 0;
                color: #856404;
            }
        `;

        const templates = {
            'email-verification': {
                subject: 'Verify Your Email Address',
                html: `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="utf-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <style>${emailStyles}</style>
                    </head>
                    <body>
                        <div class="email-container">
                            <div class="email-header">
                                <h1 class="email-logo">InsightSerenity</h1>
                            </div>
                            <div class="email-body">
                                <h2 class="email-title">Verify Your Email Address</h2>
                                <p class="email-text">
                                    Thank you for registering with InsightSerenity! To complete your registration 
                                    and activate your account, please verify your email address.
                                </p>
                                <p class="email-text">
                                    Click the button below to verify your email:
                                </p>
                                <div style="text-align: center;">
                                    <a href="${data.verificationLink}" class="email-button">Verify Email Address</a>
                                </div>
                                <p class="email-text" style="margin-top: 30px;">
                                    Or use this verification code:
                                </p>
                                <div class="email-code">${data.verificationCode || 'N/A'}</div>
                                <div class="email-warning">
                                    <strong>Security Notice:</strong> This verification link will expire in 24 hours. 
                                    If you didn't create an account with InsightSerenity, please ignore this email.
                                </div>
                                <p class="email-text" style="font-size: 14px; color: #888; margin-top: 30px;">
                                    If the button doesn't work, copy and paste this link into your browser:<br>
                                    <a href="${data.verificationLink}" style="color: #ffc451; word-break: break-all;">${data.verificationLink}</a>
                                </p>
                            </div>
                            <div class="email-footer">
                                <p>© ${new Date().getFullYear()} InsightSerenity. All rights reserved.</p>
                                <p>This is an automated message, please do not reply to this email.</p>
                            </div>
                        </div>
                    </body>
                    </html>
                `
            },

            'password-reset': {
                subject: 'Reset Your Password',
                html: `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="utf-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <style>${emailStyles}</style>
                    </head>
                    <body>
                        <div class="email-container">
                            <div class="email-header">
                                <h1 class="email-logo">InsightSerenity</h1>
                            </div>
                            <div class="email-body">
                                <h2 class="email-title">Reset Your Password</h2>
                                <p class="email-text">
                                    We received a request to reset your password. Click the button below to create 
                                    a new password:
                                </p>
                                <div style="text-align: center;">
                                    <a href="${data.resetLink}" class="email-button">Reset Password</a>
                                </div>
                                <div class="email-warning">
                                    <strong>Security Notice:</strong> This password reset link will expire in 1 hour. 
                                    If you didn't request a password reset, please ignore this email and your password 
                                    will remain unchanged.
                                </div>
                                <p class="email-text" style="font-size: 14px; color: #888; margin-top: 30px;">
                                    If the button doesn't work, copy and paste this link into your browser:<br>
                                    <a href="${data.resetLink}" style="color: #ffc451; word-break: break-all;">${data.resetLink}</a>
                                </p>
                            </div>
                            <div class="email-footer">
                                <p>© ${new Date().getFullYear()} InsightSerenity. All rights reserved.</p>
                                <p>This is an automated message, please do not reply to this email.</p>
                            </div>
                        </div>
                    </body>
                    </html>
                `
            },

            'welcome-client': {
                subject: 'Welcome to InsightSerenity',
                html: `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="utf-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <style>${emailStyles}</style>
                    </head>
                    <body>
                        <div class="email-container">
                            <div class="email-header">
                                <h1 class="email-logo">InsightSerenity</h1>
                            </div>
                            <div class="email-body">
                                <h2 class="email-title">Welcome to InsightSerenity!</h2>
                                <p class="email-text">
                                    Hello${data.firstName ? ' ' + data.firstName : ''},
                                </p>
                                <p class="email-text">
                                    Thank you for joining InsightSerenity. We're excited to help you manage your 
                                    consulting and recruitment needs with our comprehensive platform.
                                </p>
                                <p class="email-text">
                                    To get started, explore these features:
                                </p>
                                <ul style="color: #555; font-size: 16px; line-height: 1.8;">
                                    <li>Manage your profile and preferences</li>
                                    <li>Access your dashboard and analytics</li>
                                    <li>Connect with consultants and opportunities</li>
                                    <li>Track your engagements and projects</li>
                                </ul>
                                <div style="text-align: center;">
                                    <a href="${platformUrl}/dashboard" class="email-button">Go to Dashboard</a>
                                </div>
                                <p class="email-text" style="margin-top: 30px;">
                                    If you have any questions, our support team is here to help.
                                </p>
                            </div>
                            <div class="email-footer">
                                <p>© ${new Date().getFullYear()} InsightSerenity. All rights reserved.</p>
                                <p>This is an automated message, please do not reply to this email.</p>
                            </div>
                        </div>
                    </body>
                    </html>
                `
            },

            'welcome-consultant': {
                subject: 'Welcome to InsightSerenity',
                html: `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="utf-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <style>${emailStyles}</style>
                    </head>
                    <body>
                        <div class="email-container">
                            <div class="email-header">
                                <h1 class="email-logo">InsightSerenity</h1>
                            </div>
                            <div class="email-body">
                                <h2 class="email-title">Welcome to InsightSerenity!</h2>
                                <p class="email-text">
                                    Hello${data.firstName ? ' ' + data.firstName : ''},
                                </p>
                                <p class="email-text">
                                    Welcome to the InsightSerenity consultant network. We're thrilled to have you 
                                    join our platform connecting talented professionals with exciting opportunities.
                                </p>
                                <p class="email-text">
                                    Get started with these steps:
                                </p>
                                <ul style="color: #555; font-size: 16px; line-height: 1.8;">
                                    <li>Complete your consultant profile</li>
                                    <li>Showcase your skills and experience</li>
                                    <li>Browse available opportunities</li>
                                    <li>Connect with potential clients</li>
                                </ul>
                                <div style="text-align: center;">
                                    <a href="${platformUrl}/dashboard" class="email-button">Go to Dashboard</a>
                                </div>
                                <p class="email-text" style="margin-top: 30px;">
                                    We're here to support your success on the platform.
                                </p>
                            </div>
                            <div class="email-footer">
                                <p>© ${new Date().getFullYear()} InsightSerenity. All rights reserved.</p>
                                <p>This is an automated message, please do not reply to this email.</p>
                            </div>
                        </div>
                    </body>
                    </html>
                `
            },

            'password-changed': {
                subject: 'Your Password Has Been Changed',
                html: `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="utf-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <style>${emailStyles}</style>
                    </head>
                    <body>
                        <div class="email-container">
                            <div class="email-header">
                                <h1 class="email-logo">InsightSerenity</h1>
                            </div>
                            <div class="email-body">
                                <h2 class="email-title">Password Changed Successfully</h2>
                                <p class="email-text">
                                    This email confirms that your password was successfully changed on 
                                    ${new Date().toLocaleString()}.
                                </p>
                                <div class="email-warning">
                                    <strong>Security Alert:</strong> If you did not make this change, please contact 
                                    our support team immediately and secure your account.
                                </div>
                                <p class="email-text" style="margin-top: 30px;">
                                    For your security, you may want to review your recent account activity.
                                </p>
                                <div style="text-align: center;">
                                    <a href="${platformUrl}/settings/security" class="email-button">Review Security Settings</a>
                                </div>
                            </div>
                            <div class="email-footer">
                                <p>© ${new Date().getFullYear()} InsightSerenity. All rights reserved.</p>
                                <p>This is an automated message, please do not reply to this email.</p>
                            </div>
                        </div>
                    </body>
                    </html>
                `
            },

            'account-activated': {
                subject: 'Your Account is Now Active',
                html: `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="utf-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <style>${emailStyles}</style>
                    </head>
                    <body>
                        <div class="email-container">
                            <div class="email-header">
                                <h1 class="email-logo">InsightSerenity</h1>
                            </div>
                            <div class="email-body">
                                <h2 class="email-title">Account Activated Successfully</h2>
                                <p class="email-text">
                                    Congratulations! Your email has been verified and your account is now fully active.
                                </p>
                                <p class="email-text">
                                    You now have complete access to all platform features and can begin using 
                                    InsightSerenity to its fullest potential.
                                </p>
                                <div style="text-align: center;">
                                    <a href="${platformUrl}/dashboard" class="email-button">Access Your Dashboard</a>
                                </div>
                                <p class="email-text" style="margin-top: 30px;">
                                    Thank you for verifying your email address. We look forward to serving you!
                                </p>
                            </div>
                            <div class="email-footer">
                                <p>© ${new Date().getFullYear()} InsightSerenity. All rights reserved.</p>
                                <p>This is an automated message, please do not reply to this email.</p>
                            </div>
                        </div>
                    </body>
                    </html>
                `
            }
        };

        return templates[template] || {
            subject: 'Notification from InsightSerenity',
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <style>${emailStyles}</style>
                </head>
                <body>
                    <div class="email-container">
                        <div class="email-header">
                            <h1 class="email-logo">InsightSerenity</h1>
                        </div>
                        <div class="email-body">
                            <h2 class="email-title">Notification</h2>
                            <p class="email-text">
                                You have received a notification from InsightSerenity.
                            </p>
                        </div>
                        <div class="email-footer">
                            <p>© ${new Date().getFullYear()} InsightSerenity. All rights reserved.</p>
                        </div>
                    </div>
                </body>
                </html>
            `
        };
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

            // Get template content
            const templateContent = this._getEmailTemplate(template, data || {});
            const emailSubject = subject || templateContent.subject;
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
                html: templateContent.html,
                // Add plain text version for better compatibility
                text: this._stripHtml(templateContent.html)
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
                        useMockEmail: this.config.useMockEmail
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
                        hasOAuth2: !!(this.config.gmailClientId && this.config.gmailClientSecret)
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
                    from: this.config.defaultFrom
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