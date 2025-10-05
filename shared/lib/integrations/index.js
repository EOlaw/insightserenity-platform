/**
 * @fileoverview Integrations Module Exports
 * @module shared/lib/integrations
 */

// Payment integrations
const payment = {
    StripeService: require('./payment/stripe-service'),
    PayPalService: require('./payment/paypal-service'),
    PaymentProcessor: require('./payment/payment-processor')
};

// Email integrations
const email = {
    SendGridService: require('./email/sendgrid-service'),
    MailgunService: require('./email/mailgun-service'),
    SESService: require('./email/ses-service')
};

// Storage integrations
const storage = {
    S3Service: require('./storage/aws-s3-service'),
    AzureBlobService: require('./storage/azure-blob-service'),
    GCPStorageService: require('./storage/gcp-storage-service')
};

// Social integrations
const social = {
    LinkedInAPI: require('./social/linkedin-api'),
    GitHubAPI: require('./social/github-api'),
    GoogleAPI: require('./social/google-api')
};

module.exports = {
    payment,
    email,
    storage,
    social,

    // Convenience exports
    ...payment,
    ...email,
    ...storage,
    ...social
};
