/**
 * @fileoverview AWS SES Email Service
 */

const AWS = require('aws-sdk');
const config = require('../../../config');

class SESService {
    constructor() {
        this.ses = new AWS.SES({
            accessKeyId: config.integrations.aws.accessKeyId,
            secretAccessKey: config.integrations.aws.secretAccessKey,
            region: config.integrations.aws.region
        });
        this.from = process.env.EMAIL_FROM || 'noreply@example.com';
    }
    
    async sendEmail(to, subject, content, options = {}) {
        const params = {
            Destination: {
                ToAddresses: Array.isArray(to) ? to : [to]
            },
            Message: {
                Body: {
                    Html: { Data: content.html },
                    Text: { Data: content.text }
                },
                Subject: { Data: subject }
            },
            Source: options.from || this.from
        };
        
        try {
            const result = await this.ses.sendEmail(params).promise();
            return { success: true, messageId: result.MessageId };
        } catch (error) {
            throw new Error(`SES error: ${error.message}`);
        }
    }
    
    async sendTemplatedEmail(to, template, data) {
        const params = {
            Destination: {
                ToAddresses: Array.isArray(to) ? to : [to]
            },
            Source: this.from,
            Template: template,
            TemplateData: JSON.stringify(data)
        };
        
        try {
            const result = await this.ses.sendTemplatedEmail(params).promise();
            return { success: true, messageId: result.MessageId };
        } catch (error) {
            throw new Error(`SES template error: ${error.message}`);
        }
    }
}

module.exports = SESService;
