/**
 * @fileoverview SendGrid Email Service
 */

const sgMail = require('@sendgrid/mail');
const config = require('../../../config');

class SendGridService {
    constructor() {
        sgMail.setApiKey(config.integrations.sendgrid.apiKey);
        this.fromEmail = config.integrations.sendgrid.fromEmail;
    }
    
    async sendEmail(to, subject, content, options = {}) {
        const msg = {
            to,
            from: options.from || this.fromEmail,
            subject,
            text: content.text,
            html: content.html,
            ...options
        };
        
        try {
            const result = await sgMail.send(msg);
            return { success: true, messageId: result[0].headers['x-message-id'] };
        } catch (error) {
            throw new Error(`SendGrid error: ${error.message}`);
        }
    }
    
    async sendBulkEmails(recipients, subject, content, options = {}) {
        const messages = recipients.map(to => ({
            to,
            from: options.from || this.fromEmail,
            subject,
            text: content.text,
            html: content.html
        }));
        
        try {
            const results = await sgMail.send(messages);
            return { success: true, count: results.length };
        } catch (error) {
            throw new Error(`SendGrid bulk error: ${error.message}`);
        }
    }
    
    async sendTemplate(to, templateId, dynamicData) {
        const msg = {
            to,
            from: this.fromEmail,
            templateId,
            dynamicTemplateData: dynamicData
        };
        
        try {
            await sgMail.send(msg);
            return { success: true };
        } catch (error) {
            throw new Error(`SendGrid template error: ${error.message}`);
        }
    }
}

module.exports = SendGridService;
