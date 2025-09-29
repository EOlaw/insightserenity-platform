/**
 * @fileoverview Unified Payment Processor
 */

const StripeService = require('./stripe-service');
const PayPalService = require('./paypal-service');

class PaymentProcessor {
    constructor() {
        this.providers = {
            stripe: new StripeService(),
            paypal: new PayPalService()
        };
    }
    
    async processPayment(provider, amount, currency, metadata) {
        const service = this.providers[provider];
        
        if (!service) {
            throw new Error(`Payment provider ${provider} not supported`);
        }
        
        switch (provider) {
            case 'stripe':
                return await service.createPaymentIntent(amount, currency, metadata);
            case 'paypal':
                return await service.createOrder(amount, currency);
            default:
                throw new Error(`Unknown provider: ${provider}`);
        }
    }
    
    async createSubscription(provider, customerId, planId) {
        const service = this.providers[provider];
        
        if (!service) {
            throw new Error(`Payment provider ${provider} not supported`);
        }
        
        switch (provider) {
            case 'stripe':
                return await service.createSubscription(customerId, planId);
            default:
                throw new Error(`Subscriptions not supported for ${provider}`);
        }
    }
    
    async refund(provider, transactionId, amount = null) {
        const service = this.providers[provider];
        
        if (!service) {
            throw new Error(`Payment provider ${provider} not supported`);
        }
        
        switch (provider) {
            case 'stripe':
                return await service.createRefund(transactionId, amount);
            case 'paypal':
                return await service.refundOrder(transactionId, amount);
            default:
                throw new Error(`Refunds not supported for ${provider}`);
        }
    }
    
    getSupportedProviders() {
        return Object.keys(this.providers);
    }
}

module.exports = PaymentProcessor;
