const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const logger = require('../../../../../../shared/lib/utils/logger').createLogger({
    serviceName: 'payment-service'
});
const Client = require('../../../../../../shared/lib/database/models/customer-services/core-business/client-management/client-model');
const ConsultationPackage = require('../../../../../../shared/lib/database/models/customer-services/core-business/consultation-management/consultation-package-model');
const Invoice = require('../../../../../../shared/lib/database/models/customer-services/core-business/billing-management/billing-model');
const { AppError } = require('../../../../../../shared/lib/utils/app-error');
const { v4: uuidv4 } = require('uuid');

/**
 * Payment Service - Professional B2B Payment Processing
 * Handles Stripe integration, credit allocation, invoicing, and subscription management
 */
class PaymentService {
  /**
   * Process package purchase payment
   * @param {Object} paymentData - Payment information
   * @param {string} paymentData.clientId - Client MongoDB ID
   * @param {string} paymentData.packageId - Package to purchase
   * @param {string} paymentData.paymentMethodId - Stripe payment method ID
   * @param {string} paymentData.billingDetails - Billing information
   * @param {Object} paymentData.metadata - Additional metadata
   * @returns {Object} Payment result with invoice and credits
   */
  async processPackagePurchase(paymentData) {
    const { clientId, packageId, paymentMethodId, billingDetails, metadata = {} } = paymentData;

    try {
      logger.info(`[PaymentService] Processing package purchase for client: ${clientId}`);

      // 1. Validate client exists
      const client = await Client.findById(clientId);
      if (!client) {
        throw new AppError('Client not found', 404);
      }

      // 2. Validate and get package details
      const packageDetails = await ConsultationPackage.findOne({
        packageId,
        'availability.status': 'active',
        isDeleted: false
      });

      if (!packageDetails) {
        throw new AppError('Package not found or inactive', 404);
      }

      // 3. Calculate payment amount
      const amount = packageDetails.pricing.amount;
      const currency = packageDetails.pricing.currency || 'USD';

      // Free packages don't require payment
      if (amount === 0) {
        return this.processFreePackage(client, packageDetails, metadata);
      }

      // 4. Get or create Stripe customer
      const stripeCustomer = await this.getOrCreateStripeCustomer(client, billingDetails);

      // 5. Attach payment method to customer
      await stripe.paymentMethods.attach(paymentMethodId, {
        customer: stripeCustomer.id
      });

      // Set as default payment method
      await stripe.customers.update(stripeCustomer.id, {
        invoice_settings: {
          default_payment_method: paymentMethodId
        }
      });

      // 6. Create payment intent
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency: currency.toLowerCase(),
        customer: stripeCustomer.id,
        payment_method: paymentMethodId,
        confirm: true,
        automatic_payment_methods: {
          enabled: true,
          allow_redirects: 'never'
        },
        metadata: {
          clientId: clientId.toString(),
          packageId: packageDetails.packageId,
          packageName: packageDetails.details.name,
          organizationName: client.organizationName,
          ...metadata
        },
        description: `${packageDetails.details.name} - ${client.organizationName}`,
        receipt_email: client.contactInformation.primaryEmail
      });

      logger.info(`[PaymentService] Payment intent created: ${paymentIntent.id}`);

      // 7. Check payment status
      if (paymentIntent.status !== 'succeeded') {
        throw new AppError(`Payment failed: ${paymentIntent.status}`, 402);
      }

      // 8. Allocate credits to client
      const creditAllocation = await this.allocateCredits(
        client,
        packageDetails,
        paymentIntent.id,
        amount
      );

      // 9. Create invoice record
      const invoice = await this.createInvoice({
        client,
        packageDetails,
        paymentIntent,
        creditAllocation,
        billingDetails
      });

      // 10. Update package statistics
      await this.updatePackageStatistics(packageDetails, amount);

      // 11. Send payment confirmation email
      await this.sendPaymentConfirmation(client, invoice, packageDetails);

      logger.info(`[PaymentService] Payment processed successfully for client: ${clientId}`);

      return {
        success: true,
        paymentIntentId: paymentIntent.id,
        invoice: invoice,
        creditsAllocated: creditAllocation.creditsAdded,
        newCreditBalance: creditAllocation.newBalance,
        packageDetails: {
          name: packageDetails.details.name,
          type: packageDetails.details.type,
          credits: packageDetails.credits.total,
          duration: packageDetails.credits.duration,
          expiresAfterDays: packageDetails.credits.expiresAfterDays
        }
      };
    } catch (error) {
      logger.error('[PaymentService] Payment processing failed:', error);

      // Handle Stripe-specific errors
      if (error.type) {
        switch (error.type) {
          case 'StripeCardError':
            throw new AppError('Your card was declined', 402);
          case 'StripeRateLimitError':
            throw new AppError('Too many requests, please try again later', 429);
          case 'StripeInvalidRequestError':
            throw new AppError('Invalid payment information', 400);
          case 'StripeAPIError':
            throw new AppError('Payment service error, please try again', 500);
          case 'StripeConnectionError':
            throw new AppError('Network error, please try again', 503);
          case 'StripeAuthenticationError':
            throw new AppError('Payment authentication error', 500);
          default:
            throw new AppError(error.message, 400);
        }
      }

      throw error;
    }
  }

  /**
   * Process free package (e.g., free trial)
   */
  async processFreePackage(client, packageDetails, metadata) {
    try {
      // Check if free trial already used
      if (packageDetails.details.type === 'free_trial' && client.consultationCredits.freeTrial.used) {
        throw new AppError('Free trial already used', 403);
      }

      // Allocate credits
      const creditAllocation = await this.allocateCredits(
        client,
        packageDetails,
        null,
        0
      );

      // If free trial, mark as used
      if (packageDetails.details.type === 'free_trial') {
        client.consultationCredits.freeTrial.used = true;
        client.consultationCredits.freeTrial.usedAt = new Date();
        await client.save();
      }

      logger.info(`[PaymentService] Free package processed for client: ${client._id}`);

      return {
        success: true,
        isFree: true,
        creditsAllocated: creditAllocation.creditsAdded,
        newCreditBalance: creditAllocation.newBalance,
        packageDetails: {
          name: packageDetails.details.name,
          type: packageDetails.details.type,
          credits: packageDetails.credits.total,
          duration: packageDetails.credits.duration
        }
      };
    } catch (error) {
      logger.error('[PaymentService] Free package processing failed:', error);
      throw error;
    }
  }

  /**
   * Get existing Stripe customer or create new one
   */
  async getOrCreateStripeCustomer(client, billingDetails) {
    try {
      // Check if client already has Stripe customer ID
      if (client.billing?.stripeCustomerId) {
        // Retrieve existing customer
        const customer = await stripe.customers.retrieve(client.billing.stripeCustomerId);
        if (!customer.deleted) {
          return customer;
        }
      }

      // Create new Stripe customer
      const customerData = {
        email: client.contactInformation.primaryEmail,
        name: client.organizationName,
        metadata: {
          clientId: client._id.toString(),
          clientCode: client.clientCode,
          organizationName: client.organizationName,
          clientType: client.type
        }
      };

      // Add billing details if provided
      if (billingDetails) {
        customerData.address = {
          line1: billingDetails.address?.street1,
          line2: billingDetails.address?.street2,
          city: billingDetails.address?.city,
          state: billingDetails.address?.state,
          postal_code: billingDetails.address?.postalCode,
          country: billingDetails.address?.country || 'US'
        };

        if (billingDetails.phone) {
          customerData.phone = billingDetails.phone;
        }
      }

      const customer = await stripe.customers.create(customerData);

      // Update client with Stripe customer ID
      if (!client.billing) {
        client.billing = {};
      }
      client.billing.stripeCustomerId = customer.id;
      await client.save();

      logger.info(`[PaymentService] Stripe customer created: ${customer.id}`);

      return customer;
    } catch (error) {
      logger.error('[PaymentService] Failed to get/create Stripe customer:', error);
      throw error;
    }
  }

  /**
   * Allocate consultation credits to client
   */
  async allocateCredits(client, packageDetails, paymentIntentId, amount) {
    try {
      const creditsToAdd = packageDetails.credits.total;
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + packageDetails.credits.expiresAfterDays);

      // Create credit record
      const creditRecord = {
        packageId: packageDetails.packageId,
        packageName: packageDetails.details.name,
        creditsAdded: creditsToAdd,
        creditsUsed: 0,
        creditsRemaining: creditsToAdd,
        purchaseDate: new Date(),
        expiryDate: expiryDate,
        status: 'active',
        paymentIntentId: paymentIntentId,
        amount: amount,
        details: {
          sessionDuration: packageDetails.credits.duration.minutes,
          packageType: packageDetails.details.type,
          sku: packageDetails.details.sku
        }
      };

      // Add to client's credits array
      if (!client.consultationCredits.credits) {
        client.consultationCredits.credits = [];
      }
      client.consultationCredits.credits.push(creditRecord);

      // Update available credits
      client.consultationCredits.availableCredits += creditsToAdd;

      // Update lifetime statistics
      if (!client.consultationCredits.lifetime) {
        client.consultationCredits.lifetime = {
          totalConsultations: 0,
          totalSpent: 0,
          totalCreditsPurchased: 0,
          totalCreditsUsed: 0
        };
      }

      client.consultationCredits.lifetime.totalSpent += amount;
      client.consultationCredits.lifetime.totalCreditsPurchased += creditsToAdd;

      await client.save();

      logger.info(`[PaymentService] Allocated ${creditsToAdd} credits to client: ${client._id}`);

      return {
        creditsAdded: creditsToAdd,
        newBalance: client.consultationCredits.availableCredits,
        expiryDate: expiryDate
      };
    } catch (error) {
      logger.error('[PaymentService] Credit allocation failed:', error);
      throw error;
    }
  }

  /**
   * Create invoice record
   */
  async createInvoice({ client, packageDetails, paymentIntent, creditAllocation, billingDetails }) {
    try {
      const invoiceNumber = `INV-${Date.now()}-${uuidv4().substring(0, 8).toUpperCase()}`;

      const invoiceData = {
        invoiceNumber,
        tenantId: client.tenantId || 'default',
        organizationId: client.organizationId,
        clientId: client._id,

        billingPeriod: {
          start: new Date(),
          end: new Date()
        },

        lineItems: [
          {
            description: packageDetails.details.name,
            type: 'package_purchase',
            quantity: 1,
            unitPrice: packageDetails.pricing.amount,
            subtotal: packageDetails.pricing.amount,
            tax: 0,
            total: packageDetails.pricing.amount,
            metadata: {
              packageId: packageDetails.packageId,
              credits: packageDetails.credits.total,
              duration: packageDetails.credits.duration.minutes,
              expiresAfterDays: packageDetails.credits.expiresAfterDays
            }
          }
        ],

        totals: {
          subtotal: packageDetails.pricing.amount,
          tax: 0,
          discount: packageDetails.pricing.discount?.amount || 0,
          total: packageDetails.pricing.amount,
          paid: packageDetails.pricing.amount,
          balance: 0,
          currency: packageDetails.pricing.currency || 'USD'
        },

        payment: {
          method: 'stripe',
          status: 'paid',
          paidAt: new Date(),
          transactionId: paymentIntent.id,
          stripePaymentIntentId: paymentIntent.id,
          gatewayResponse: {
            status: paymentIntent.status,
            amount: paymentIntent.amount,
            currency: paymentIntent.currency
          }
        },

        status: {
          current: 'paid',
          history: [
            {
              status: 'paid',
              changedAt: new Date(),
              reason: 'Payment successful via Stripe'
            }
          ]
        },

        billingDetails: billingDetails || {
          name: client.organizationName,
          email: client.contactInformation.primaryEmail,
          address: client.contactInformation.addresses?.[0] || {}
        },

        metadata: {
          creditsAllocated: creditAllocation.creditsAdded,
          packageType: packageDetails.details.type,
          autoGenerated: true
        }
      };

      const invoice = await Invoice.create(invoiceData);

      logger.info(`[PaymentService] Invoice created: ${invoiceNumber}`);

      return invoice;
    } catch (error) {
      logger.error('[PaymentService] Invoice creation failed:', error);
      throw error;
    }
  }

  /**
   * Update package statistics
   */
  async updatePackageStatistics(packageDetails, amount) {
    try {
      if (!packageDetails.statistics) {
        packageDetails.statistics = {
          totalPurchases: 0,
          totalRevenue: 0,
          activeSubscriptions: 0
        };
      }

      packageDetails.statistics.totalPurchases += 1;
      packageDetails.statistics.totalRevenue += amount;

      await packageDetails.save();
    } catch (error) {
      logger.error('[PaymentService] Failed to update package statistics:', error);
      // Non-critical, don't throw
    }
  }

  /**
   * Send payment confirmation email
   */
  async sendPaymentConfirmation(client, invoice, packageDetails) {
    try {
      const NotificationService = require('../../notifications/services/notification-service');

      await NotificationService.sendEmail({
        to: client.contactInformation.primaryEmail,
        subject: 'Payment Confirmation - InsightSerenity',
        template: 'payment-confirmation',
        data: {
          clientName: client.organizationName,
          packageName: packageDetails.details.name,
          amount: packageDetails.pricing.amount,
          currency: packageDetails.pricing.currency || 'USD',
          credits: packageDetails.credits.total,
          invoiceNumber: invoice.invoiceNumber,
          invoiceUrl: `${process.env.CLIENT_URL}/invoices/${invoice._id}`
        }
      });

      logger.info(`[PaymentService] Payment confirmation email sent to: ${client.contactInformation.primaryEmail}`);
    } catch (error) {
      logger.error('[PaymentService] Failed to send payment confirmation email:', error);
      // Non-critical, don't throw
    }
  }

  /**
   * Create subscription for recurring packages
   */
  async createSubscription(clientId, packageId, paymentMethodId, billingDetails) {
    try {
      logger.info(`[PaymentService] Creating subscription for client: ${clientId}`);

      const client = await Client.findById(clientId);
      if (!client) {
        throw new AppError('Client not found', 404);
      }

      const packageDetails = await ConsultationPackage.findOne({
        packageId,
        'availability.status': 'active',
        isDeleted: false
      });

      if (!packageDetails) {
        throw new AppError('Package not found', 404);
      }

      if (!packageDetails.subscription || !packageDetails.subscription.billingCycle) {
        throw new AppError('Package is not configured for subscription', 400);
      }

      // Get or create Stripe customer
      const stripeCustomer = await this.getOrCreateStripeCustomer(client, billingDetails);

      // Attach payment method
      await stripe.paymentMethods.attach(paymentMethodId, {
        customer: stripeCustomer.id
      });

      await stripe.customers.update(stripeCustomer.id, {
        invoice_settings: {
          default_payment_method: paymentMethodId
        }
      });

      // Get Stripe price ID for billing cycle
      const billingCycle = packageDetails.subscription.billingCycle; // monthly, quarterly, annual
      const stripePriceId = packageDetails.stripe?.priceIds?.[billingCycle] || packageDetails.stripe?.priceId;

      if (!stripePriceId) {
        throw new AppError('Stripe price not configured for this package', 500);
      }

      // Create subscription
      const subscription = await stripe.subscriptions.create({
        customer: stripeCustomer.id,
        items: [{ price: stripePriceId }],
        metadata: {
          clientId: clientId.toString(),
          packageId: packageDetails.packageId,
          organizationName: client.organizationName
        },
        trial_period_days: packageDetails.subscription.trialPeriodDays || 0,
        expand: ['latest_invoice.payment_intent']
      });

      // Add subscription to client record
      if (!client.consultationCredits.activeSubscriptions) {
        client.consultationCredits.activeSubscriptions = [];
      }

      client.consultationCredits.activeSubscriptions.push({
        subscriptionId: subscription.id,
        stripeSubscriptionId: subscription.id,
        packageId: packageDetails.packageId,
        status: subscription.status,
        startDate: new Date(subscription.current_period_start * 1000),
        nextBillingDate: new Date(subscription.current_period_end * 1000),
        creditsPerPeriod: packageDetails.credits.total
      });

      // Allocate initial credits
      const creditAllocation = await this.allocateCredits(
        client,
        packageDetails,
        subscription.latest_invoice?.payment_intent?.id,
        packageDetails.pricing.amount
      );

      await client.save();

      logger.info(`[PaymentService] Subscription created: ${subscription.id}`);

      return {
        success: true,
        subscriptionId: subscription.id,
        status: subscription.status,
        creditsAllocated: creditAllocation.creditsAdded,
        nextBillingDate: new Date(subscription.current_period_end * 1000)
      };
    } catch (error) {
      logger.error('[PaymentService] Subscription creation failed:', error);
      throw error;
    }
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(clientId, subscriptionId, cancelImmediately = false) {
    try {
      logger.info(`[PaymentService] Canceling subscription: ${subscriptionId}`);

      const client = await Client.findById(clientId);
      if (!client) {
        throw new AppError('Client not found', 404);
      }

      // Find subscription in client record
      const subscriptionIndex = client.consultationCredits.activeSubscriptions?.findIndex(
        sub => sub.stripeSubscriptionId === subscriptionId
      );

      if (subscriptionIndex === -1) {
        throw new AppError('Subscription not found', 404);
      }

      // Cancel in Stripe
      const canceledSubscription = await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: !cancelImmediately
      });

      if (cancelImmediately) {
        await stripe.subscriptions.cancel(subscriptionId);
      }

      // Update client record
      client.consultationCredits.activeSubscriptions[subscriptionIndex].status = cancelImmediately ? 'canceled' : 'canceling';
      await client.save();

      logger.info(`[PaymentService] Subscription ${cancelImmediately ? 'canceled' : 'scheduled for cancellation'}: ${subscriptionId}`);

      return {
        success: true,
        subscriptionId,
        status: cancelImmediately ? 'canceled' : 'canceling',
        endsAt: new Date(canceledSubscription.current_period_end * 1000)
      };
    } catch (error) {
      logger.error('[PaymentService] Subscription cancellation failed:', error);
      throw error;
    }
  }

  /**
   * Handle Stripe webhook events
   */
  async handleWebhook(event) {
    try {
      logger.info(`[PaymentService] Handling webhook event: ${event.type}`);

      switch (event.type) {
        case 'payment_intent.succeeded':
          await this.handlePaymentSucceeded(event.data.object);
          break;

        case 'payment_intent.payment_failed':
          await this.handlePaymentFailed(event.data.object);
          break;

        case 'invoice.payment_succeeded':
          await this.handleInvoicePaymentSucceeded(event.data.object);
          break;

        case 'invoice.payment_failed':
          await this.handleInvoicePaymentFailed(event.data.object);
          break;

        case 'customer.subscription.updated':
          await this.handleSubscriptionUpdated(event.data.object);
          break;

        case 'customer.subscription.deleted':
          await this.handleSubscriptionDeleted(event.data.object);
          break;

        default:
          logger.info(`[PaymentService] Unhandled event type: ${event.type}`);
      }

      return { received: true };
    } catch (error) {
      logger.error('[PaymentService] Webhook handling failed:', error);
      throw error;
    }
  }

  async handlePaymentSucceeded(paymentIntent) {
    logger.info(`[PaymentService] Payment succeeded: ${paymentIntent.id}`);
    // Payment already handled in processPackagePurchase
  }

  async handlePaymentFailed(paymentIntent) {
    logger.error(`[PaymentService] Payment failed: ${paymentIntent.id}`, paymentIntent.last_payment_error);
    // TODO: Send payment failed notification to client
  }

  async handleInvoicePaymentSucceeded(invoice) {
    logger.info(`[PaymentService] Invoice payment succeeded: ${invoice.id}`);

    if (invoice.subscription) {
      // Subscription renewal - allocate credits
      const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
      const clientId = subscription.metadata.clientId;
      const packageId = subscription.metadata.packageId;

      const client = await Client.findById(clientId);
      const packageDetails = await ConsultationPackage.findOne({ packageId });

      if (client && packageDetails) {
        await this.allocateCredits(client, packageDetails, invoice.payment_intent, invoice.amount_paid / 100);
        logger.info(`[PaymentService] Subscription renewal credits allocated for client: ${clientId}`);
      }
    }
  }

  async handleInvoicePaymentFailed(invoice) {
    logger.error(`[PaymentService] Invoice payment failed: ${invoice.id}`);
    // TODO: Send payment failed notification and handle dunning
  }

  async handleSubscriptionUpdated(subscription) {
    logger.info(`[PaymentService] Subscription updated: ${subscription.id}`);

    const clientId = subscription.metadata.clientId;
    const client = await Client.findById(clientId);

    if (client) {
      const subscriptionIndex = client.consultationCredits.activeSubscriptions?.findIndex(
        sub => sub.stripeSubscriptionId === subscription.id
      );

      if (subscriptionIndex !== -1) {
        client.consultationCredits.activeSubscriptions[subscriptionIndex].status = subscription.status;
        client.consultationCredits.activeSubscriptions[subscriptionIndex].nextBillingDate = new Date(subscription.current_period_end * 1000);
        await client.save();
      }
    }
  }

  async handleSubscriptionDeleted(subscription) {
    logger.info(`[PaymentService] Subscription deleted: ${subscription.id}`);

    const clientId = subscription.metadata.clientId;
    const client = await Client.findById(clientId);

    if (client) {
      const subscriptionIndex = client.consultationCredits.activeSubscriptions?.findIndex(
        sub => sub.stripeSubscriptionId === subscription.id
      );

      if (subscriptionIndex !== -1) {
        client.consultationCredits.activeSubscriptions[subscriptionIndex].status = 'canceled';
        await client.save();
      }
    }
  }
}

module.exports = new PaymentService();
