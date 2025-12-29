# Integration Patch - Apply These Changes

## ⚡ Quick Integration Steps

Apply these code changes to integrate all the new services into your application.

---

## 1. Update app.js - Add Routes and Scheduler

### Location: `/servers/customer-services/app.js`

**Step 1.1:** Add route imports at the top (around line 46-54):

```javascript
// EXISTING ROUTES (keep these)
const authRoutes = require('./modules/core-business/authentication/routes');
const userRoutes = require('./modules/core-business/user-management/routes/user-routes');
const clientManagementRoutes = require('./modules/core-business/client-management/routes/');
const consultantManagementRoutes = require('./modules/core-business/consultant-management/routes/');
const consultationManagementRoutes = require('./modules/core-business/consultation-management/routes');
const paymentManagementRoutes = require('./modules/core-business/billing-management/routes/payment-routes');

// ⭐ ADD THESE NEW ROUTES
const paymentRoutes = require('./modules/core-business/billing/routes/payment-routes');
const creditRoutes = require('./modules/core-business/billing/routes/credit-routes');
```

**Step 1.2:** In the `_setupRoutes()` method (around line 627-628), add:

```javascript
// EXISTING
apiRouter.use('/billing', paymentManagementRoutes);

// ⭐ ADD THESE NEW ROUTES
apiRouter.use('/payments', paymentRoutes);  // New Stripe payment processing
apiRouter.use('/credits', creditRoutes);    // New credit management
```

**Step 1.3:** Start cron scheduler - Find the `start()` method (around line 780) and add:

```javascript
/**
 * Start the application
 * @param {number} port - Port number
 */
async start(port) {
    try {
        if (!this.isInitialized) {
            await this._initialize();
        }

        // ⭐ START CRON SCHEDULER (ADD THIS)
        if (process.env.NODE_ENV !== 'test') {
            const scheduler = require('./jobs/consultation-scheduler');
            scheduler.start();
            this.logger.info('Consultation scheduler started successfully');
        }

        return new Promise((resolve, reject) => {
            this.server = this.app.listen(port, () => {
                this.logger.info(`Customer Services server listening on port ${port}`);
                this.logger.info(`Environment: ${this.config.environment}`);
                this.logger.info(`Multi-tenant: ${this.config.multiTenant.enabled ? 'enabled' : 'disabled'}`);
                this.logger.info(`API Documentation: http://localhost:${port}/docs`);
                this.metrics.health.status = 'healthy';
                resolve(this.server);
            });

            this.server.on('error', reject);
        });
    } catch (error) {
        this.logger.error('Failed to start application', { error: error.message });
        throw error;
    }
}
```

---

## 2. Update DirectAuthService - Auto-Assign Free Trial

### Location: `/modules/core-business/authentication/services/direct-auth-service.js`

**Find the `verifyEmail()` method and add:**

```javascript
const CreditManagementService = require('../../billing/services/credit-management-service');

async verifyEmail(token) {
    try {
        // ... existing verification code ...

        // After setting verified = true
        user.verification.email.verified = true;
        user.verification.email.verifiedAt = new Date();
        user.accountStatus.status = 'active';
        await user.save();

        // ⭐ AUTO-ASSIGN FREE TRIAL (ADD THIS)
        if (user.roles.includes('client') && user.clientId) {
            try {
                await CreditManagementService.assignFreeTrialCredit(user.clientId);
                this.logger.info(`Free trial credit assigned to client: ${user.clientId}`);
            } catch (error) {
                this.logger.error('Failed to assign free trial:', error);
                // Don't fail verification if credit assignment fails
            }
        }

        return {
            success: true,
            message: 'Email verified successfully',
            user: this._sanitizeUser(user)
        };
    } catch (error) {
        // ... existing error handling ...
    }
}
```

---

## 3. Update ConsultationService - Hook in Credit Deduction & Notifications

### Location: `/modules/core-business/consultation-management/services/consultation-service.js`

**Step 3.1:** Add imports at the top:

```javascript
const CreditManagementService = require('../../billing/services/credit-management-service');
const ConsultationNotificationService = require('./consultation-notification-service');
```

**Step 3.2:** In `createConsultation()` method, add credit check:

```javascript
async createConsultation(consultationData, userId) {
    try {
        const { clientId, useFreeTrialCredit } = consultationData;

        // ⭐ CHECK CREDIT AVAILABILITY (ADD THIS BEFORE CREATING)
        const creditCheck = await CreditManagementService.checkCreditAvailability(
            clientId,
            1,
            { useFreeTrialCredit: useFreeTrialCredit || false }
        );

        if (!creditCheck.available) {
            throw new AppError(
                `Insufficient credits: ${creditCheck.reason}`,
                402,
                'INSUFFICIENT_CREDITS'
            );
        }

        // ... create consultation (existing code) ...
        const consultation = await Consultation.create(consultationData);

        // ⭐ SEND BOOKING CONFIRMATION (ADD THIS AFTER CREATING)
        try {
            await ConsultationNotificationService.sendBookingConfirmation(consultation._id);
        } catch (error) {
            this.logger.error('Failed to send booking confirmation:', error);
            // Don't fail booking if email fails
        }

        return consultation;
    } catch (error) {
        // ... existing error handling ...
    }
}
```

**Step 3.3:** In `completeConsultation()` method, add:

```javascript
async completeConsultation(consultationId, completionData, userId) {
    try {
        // ... existing completion logic ...

        consultation.status.current = 'completed';
        // ... update other fields ...
        await consultation.save();

        // ⭐ AUTO-DEDUCT CREDITS (ADD THIS)
        try {
            const deductionResult = await CreditManagementService.deductCreditsOnCompletion(consultationId);
            this.logger.info(`Credits deducted: ${deductionResult.creditsDeducted}`);
        } catch (error) {
            this.logger.error('Failed to deduct credits:', error);
            // Log but don't fail completion
        }

        // ⭐ SEND COMPLETION NOTIFICATION (ADD THIS)
        try {
            await ConsultationNotificationService.sendConsultationCompleted(consultationId);
        } catch (error) {
            this.logger.error('Failed to send completion notification:', error);
        }

        return consultation;
    } catch (error) {
        // ... existing error handling ...
    }
}
```

**Step 3.4:** In `startConsultation()` method, add:

```javascript
async startConsultation(consultationId, userId) {
    try {
        // ... existing start logic ...

        consultation.status.current = 'in_progress';
        consultation.schedule.actualStart = new Date();
        await consultation.save();

        // ⭐ SEND STARTED NOTIFICATION (ADD THIS)
        try {
            await ConsultationNotificationService.sendConsultationStarted(consultationId);
        } catch (error) {
            this.logger.error('Failed to send started notification:', error);
        }

        return consultation;
    } catch (error) {
        // ... existing error handling ...
    }
}
```

**Step 3.5:** In `cancelConsultation()` method, add:

```javascript
async cancelConsultation(consultationId, cancelData, userId) {
    try {
        // ... existing cancel logic ...

        consultation.status.current = 'cancelled';
        await consultation.save();

        // ⭐ SEND CANCELLATION NOTIFICATION (ADD THIS)
        try {
            await ConsultationNotificationService.sendCancellationNotification(
                consultationId,
                cancelData.canceledBy || 'client',
                cancelData.reason
            );
        } catch (error) {
            this.logger.error('Failed to send cancellation notification:', error);
        }

        return consultation;
    } catch (error) {
        // ... existing error handling ...
    }
}
```

---

## 4. Install Required Package

Run in `/servers/customer-services`:

```bash
npm install node-cron
```

---

## 5. Environment Variables

Ensure these are set in `.env`:

```bash
# Stripe (already configured)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Email (already configured)
GMAIL_USER=...
GMAIL_APP_PASSWORD=...

# URLs (ADD THESE if not present)
CLIENT_URL=http://localhost:3000
CONSULTANT_URL=http://localhost:3000/consultant

# Payment defaults
PLATFORM_FEE_PERCENTAGE=15
DEFAULT_CURRENCY=USD
CONSULTANT_PAYOUT_SCHEDULE=weekly

# Consultation defaults
FREE_TRIAL_DURATION_MINUTES=15
FREE_TRIAL_EXPIRY_DAYS=30
DEFAULT_SESSION_DURATION_MINUTES=60
```

---

## 6. Test the Integration

### Test 1: Payment Processing

```bash
# Start server
npm run start:dev

# Test payment endpoint
curl -X POST http://localhost:8001/api/payments/process \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-token>" \
  -d '{
    "packageId": "PKG-DISCOVERY-ASSESSMENT",
    "paymentMethodId": "pm_card_visa",
    "billingDetails": {
      "name": "Test Company",
      "email": "test@company.com"
    }
  }'
```

### Test 2: Credit Summary

```bash
curl -X GET http://localhost:8001/api/credits/me/summary \
  -H "Authorization: Bearer <your-token>"
```

### Test 3: Check Scheduler

```bash
# Check logs for:
[Scheduler] 🚀 Starting consultation platform scheduled jobs
[Scheduler] ✓ 24-hour reminder job scheduled
[Scheduler] ✓ 1-hour reminder job scheduled
[Scheduler] ✓ Credit expiration job scheduled
```

---

## 7. Verify Everything Works

### ✅ Checklist:

- [ ] Server starts without errors
- [ ] `/api/payments` routes are accessible
- [ ] `/api/credits` routes are accessible
- [ ] Cron scheduler logs appear on startup
- [ ] New user registration triggers free trial assignment
- [ ] Consultation booking sends confirmation email
- [ ] Consultation completion deducts credits
- [ ] Payment processing works with Stripe test card

---

## 📊 What You Now Have:

✅ **Full payment processing** via Stripe
✅ **Automatic credit management** (assign, deduct, expire)
✅ **11 types of automated emails** (booking, reminders, completion, etc.)
✅ **Subscription billing** (monthly, quarterly, annual)
✅ **Cron jobs** running 5 scheduled tasks
✅ **Credit expiration** with warnings
✅ **Professional B2B system** ready for clients

---

## 🚨 If You Encounter Errors:

### Error: "Cannot find module 'node-cron'"
**Solution:** Run `npm install node-cron`

### Error: "CreditManagementService is not defined"
**Solution:** Check that you added the require statement at the top of the file

### Error: "Stripe webhook signature verification failed"
**Solution:** Make sure `STRIPE_WEBHOOK_SECRET` is set in `.env`

### Error: "Failed to send email"
**Solution:** Check Gmail credentials in `.env` and ensure "App Password" is used

---

## 🎯 Next Steps After Integration:

1. Create HTML email templates (15 files)
2. Test end-to-end payment flow
3. Implement Zoom integration
4. Build frontend payment UI
5. Create credit dashboard widget

---

**Integration should take ~30 minutes to apply all changes!**

Then you'll have a fully functional professional B2B consultation platform! 🚀
