/**
 * @fileoverview Stripe Payment Service
 */

const config = require('../../../config');

class StripeService {
    constructor() {
        this.stripe = require('stripe')(config.integrations.stripe.secretKey);
    }
    
    async createCustomer(data) {
        return await this.stripe.customers.create({
            email: data.email,
            name: data.name,
            metadata: {
                userId: data.userId,
                tenantId: data.tenantId
            }
        });
    }
    
    async createPaymentIntent(amount, currency = 'usd', metadata = {}) {
        return await this.stripe.paymentIntents.create({
            amount: Math.round(amount * 100), // Convert to cents
            currency,
            metadata
        });
    }
    
    async createSubscription(customerId, priceId, options = {}) {
        return await this.stripe.subscriptions.create({
            customer: customerId,
            items: [{ price: priceId }],
            ...options
        });
    }
    
    async createCheckoutSession(data) {
        return await this.stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: data.items,
            mode: data.mode || 'payment',
            success_url: data.successUrl,
            cancel_url: data.cancelUrl,
            customer: data.customerId,
            metadata: data.metadata
        });
    }
    
    async getCustomer(customerId) {
        return await this.stripe.customers.retrieve(customerId);
    }
    
    async updateCustomer(customerId, updates) {
        return await this.stripe.customers.update(customerId, updates);
    }
    
    async cancelSubscription(subscriptionId) {
        return await this.stripe.subscriptions.del(subscriptionId);
    }
    
    async createRefund(paymentIntentId, amount = null) {
        const refundData = { payment_intent: paymentIntentId };
        if (amount) {
            refundData.amount = Math.round(amount * 100);
        }
        return await this.stripe.refunds.create(refundData);
    }
    
    async verifyWebhookSignature(payload, signature) {
        return this.stripe.webhooks.constructEvent(
            payload,
            signature,
            config.integrations.stripe.webhookSecret
        );
    }
}

module.exports = StripeService;
