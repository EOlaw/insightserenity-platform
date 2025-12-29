# Professional B2B Consultation Platform - Implementation Guide

**Status:** Phase 1 Critical Features - COMPLETED ✅
**Date:** December 27, 2025
**Version:** 1.0.0

---

## 🎯 What Has Been Implemented

### ✅ **1. Stripe Payment Processing Service**
**File:** `/modules/core-business/billing/services/payment-service.js`

**Features:**
- Full Stripe integration with payment intents
- Stripe customer creation and management
- Package purchase processing
- Credit allocation after successful payment
- Invoice generation
- Subscription management (create, cancel, renew)
- Webhook event handling
- Free package processing
- Payment confirmation emails

**Key Methods:**
```javascript
processPackagePurchase(paymentData)      // Process one-time package purchase
createSubscription(clientId, packageId)   // Create recurring subscription
cancelSubscription(clientId, subscriptionId) // Cancel subscription
handleWebhook(event)                      // Handle Stripe webhooks
```

**Usage Example:**
```javascript
const PaymentService = require('./services/payment-service');

// Purchase package
const result = await PaymentService.processPackagePurchase({
  clientId: '12345',
  packageId: 'PKG-DISCOVERY-ASSESSMENT',
  paymentMethodId: 'pm_1234567890',
  billingDetails: {
    name: 'Acme Corporation',
    email: 'billing@acme.com',
    address: { /* ... */ }
  }
});

// Result includes:
// - paymentIntentId
// - invoice
// - creditsAllocated
// - newCreditBalance
```

---

### ✅ **2. Credit Management Service**
**File:** `/modules/core-business/billing/services/credit-management-service.js`

**Features:**
- Auto-assign free trial credits on registration
- Auto-deduct credits on consultation completion
- Credit availability checking
- Credit expiration management (cron job)
- Credit expiration warnings (7-day, 1-day)
- Credit summary and reporting
- Low credit warnings

**Key Methods:**
```javascript
assignFreeTrialCredit(clientId)              // Auto-assign on email verification
deductCreditsOnCompletion(consultationId)    // Auto-deduct after consultation
checkCreditAvailability(clientId, required)  // Check before booking
expireOldCredits()                           // Daily cron job
sendExpirationWarnings(daysBeforeExpiry)     // Scheduled warnings
getCreditSummary(clientId)                   // Client dashboard data
```

**Automatic Triggers:**
1. **On Client Email Verification** → `assignFreeTrialCredit()`
2. **On Consultation Completion** → `deductCreditsOnCompletion()`
3. **Daily at 2 AM** → `expireOldCredits()`
4. **Daily at 9 AM** → `sendExpirationWarnings(7)` and `sendExpirationWarnings(1)`

---

### ✅ **3. Consultation Notification Service**
**File:** `/modules/core-business/consultation-management/services/consultation-notification-service.js`

**Features:**
- Booking confirmation emails (client & consultant)
- 24-hour consultation reminders
- 1-hour consultation reminders
- Consultation started notifications
- Completion notifications with deliverables
- Feedback requests (24h after completion)
- Cancellation notifications
- Reschedule notifications
- Batch reminder processing

**Key Methods:**
```javascript
sendBookingConfirmation(consultationId)     // On booking
send24HourReminder(consultationId)          // 24h before
send1HourReminder(consultationId)           // 1h before
sendConsultationStarted(consultationId)     // On start
sendConsultationCompleted(consultationId)   // On completion
sendFeedbackRequest(consultationId)         // 24h after completion
sendCancellationNotification(consultationId) // On cancellation
sendRescheduleNotification(consultationId)  // On reschedule

// Batch jobs (cron)
sendBatch24HourReminders()                  // Daily at 9 AM
sendBatch1HourReminders()                   // Every 15 minutes
```

**Email Templates Needed:**
```
templates/
├── consultation/
│   ├── booking-confirmation-client.html
│   ├── booking-confirmation-consultant.html
│   ├── reminder-24h-client.html
│   ├── reminder-24h-consultant.html
│   ├── reminder-1h-client.html
│   ├── reminder-1h-consultant.html
│   ├── started.html
│   ├── completed-client.html
│   ├── completed-consultant.html
│   ├── feedback-request.html
│   ├── canceled-client.html
│   ├── canceled-consultant.html
│   └── rescheduled.html
├── billing/
│   ├── payment-confirmation.html
│   ├── low-credit-warning.html
│   ├── credit-expiration-warning.html
│   └── credit-expired.html
└── client/
    └── free-trial-assigned.html
```

---

## 🔗 Integration Points

### **A. Registration Flow Integration**

**File to Modify:** `/modules/core-business/auth/services/direct-auth-service.js`

**Add after email verification:**
```javascript
// In DirectAuthService.verifyEmail() method
const CreditManagementService = require('../../billing/services/credit-management-service');

// After user.verification.email.verified = true
if (user.roles.includes('client') && user.clientId) {
  // Auto-assign free trial credit
  await CreditManagementService.assignFreeTrialCredit(user.clientId);
}
```

---

### **B. Consultation Booking Integration**

**File to Modify:** `/modules/core-business/consultation-management/services/consultation-service.js`

**Add to createConsultation() method:**
```javascript
const CreditManagementService = require('../../billing/services/credit-management-service');
const ConsultationNotificationService = require('./consultation-notification-service');

// Before creating consultation, check credits
const creditCheck = await CreditManagementService.checkCreditAvailability(
  clientId,
  1,
  { useFreeTrialCredit: useFreeTrialCredit || false }
);

if (!creditCheck.available) {
  throw new AppError(`Insufficient credits: ${creditCheck.reason}`, 402);
}

// After consultation created successfully
await ConsultationNotificationService.sendBookingConfirmation(consultation._id);
```

---

### **C. Consultation Completion Integration**

**File to Modify:** `/modules/core-business/consultation-management/services/consultation-service.js`

**Add to completeConsultation() method:**
```javascript
const CreditManagementService = require('../../billing/services/credit-management-service');
const ConsultationNotificationService = require('./consultation-notification-service');

// After consultation marked as completed
await CreditManagementService.deductCreditsOnCompletion(consultationId);

// Send completion notification with deliverables
await ConsultationNotificationService.sendConsultationCompleted(consultationId);
```

---

### **D. Payment Route Integration**

**File to Create:** `/modules/core-business/billing/routes/payment-routes.js`

```javascript
const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../../../../shared/lib/auth/middleware/authenticate');
const PaymentService = require('../services/payment-service');
const { body, validationResult } = require('express-validator');

// Process package purchase
router.post('/process',
  authenticate,
  authorize(['client']),
  [
    body('packageId').notEmpty().withMessage('Package ID is required'),
    body('paymentMethodId').notEmpty().withMessage('Payment method is required')
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const result = await PaymentService.processPackagePurchase({
        clientId: req.user.clientId,
        packageId: req.body.packageId,
        paymentMethodId: req.body.paymentMethodId,
        billingDetails: req.body.billingDetails,
        metadata: req.body.metadata
      });

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }
);

// Create subscription
router.post('/subscribe',
  authenticate,
  authorize(['client']),
  async (req, res, next) => {
    try {
      const result = await PaymentService.createSubscription(
        req.user.clientId,
        req.body.packageId,
        req.body.paymentMethodId,
        req.body.billingDetails
      );

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }
);

// Cancel subscription
router.post('/subscriptions/:id/cancel',
  authenticate,
  authorize(['client']),
  async (req, res, next) => {
    try {
      const result = await PaymentService.cancelSubscription(
        req.user.clientId,
        req.params.id,
        req.body.cancelImmediately
      );

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }
);

// Stripe webhook handler
router.post('/webhooks/stripe',
  express.raw({ type: 'application/json' }),
  async (req, res, next) => {
    try {
      const sig = req.headers['stripe-signature'];
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

      let event;
      try {
        event = stripe.webhooks.constructEvent(
          req.body,
          sig,
          process.env.STRIPE_WEBHOOK_SECRET
        );
      } catch (err) {
        return res.status(400).send(`Webhook Error: ${err.message}`);
      }

      await PaymentService.handleWebhook(event);

      res.json({ received: true });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
```

**Register in app.js:**
```javascript
const paymentRoutes = require('./modules/core-business/billing/routes/payment-routes');
app.use('/api/payments', paymentRoutes);
```

---

### **E. Credit Management Routes**

**File to Create:** `/modules/core-business/billing/routes/credit-routes.js`

```javascript
const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../../../../shared/lib/auth/middleware/authenticate');
const CreditManagementService = require('../services/credit-management-service');

// Get credit summary
router.get('/me/summary',
  authenticate,
  authorize(['client']),
  async (req, res, next) => {
    try {
      const summary = await CreditManagementService.getCreditSummary(req.user.clientId);

      res.json({
        success: true,
        data: summary
      });
    } catch (error) {
      next(error);
    }
  }
);

// Check credit availability
router.post('/check-availability',
  authenticate,
  authorize(['client']),
  async (req, res, next) => {
    try {
      const availability = await CreditManagementService.checkCreditAvailability(
        req.user.clientId,
        req.body.requiredCredits || 1,
        req.body.options || {}
      );

      res.json({
        success: true,
        data: availability
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
```

**Register in app.js:**
```javascript
const creditRoutes = require('./modules/core-business/billing/routes/credit-routes');
app.use('/api/credits', creditRoutes);
```

---

## ⏰ Cron Jobs Setup

**File to Create:** `/jobs/consultation-scheduler.js`

```javascript
const cron = require('node-cron');
const { logger } = require('../shared/lib/utils/logger');
const CreditManagementService = require('../modules/core-business/billing/services/credit-management-service');
const ConsultationNotificationService = require('../modules/core-business/consultation-management/services/consultation-notification-service');

/**
 * Professional B2B Consultation Platform - Scheduled Jobs
 */
class ConsultationScheduler {
  start() {
    logger.info('[Scheduler] Starting consultation platform scheduled jobs');

    // 1. Send 24-hour reminders - Daily at 9:00 AM
    cron.schedule('0 9 * * *', async () => {
      try {
        logger.info('[Scheduler] Running 24h reminder job');
        await ConsultationNotificationService.sendBatch24HourReminders();
      } catch (error) {
        logger.error('[Scheduler] 24h reminder job failed:', error);
      }
    }, {
      timezone: 'UTC'
    });

    // 2. Send 1-hour reminders - Every 15 minutes
    cron.schedule('*/15 * * * *', async () => {
      try {
        logger.info('[Scheduler] Running 1h reminder job');
        await ConsultationNotificationService.sendBatch1HourReminders();
      } catch (error) {
        logger.error('[Scheduler] 1h reminder job failed:', error);
      }
    }, {
      timezone: 'UTC'
    });

    // 3. Expire old credits - Daily at 2:00 AM
    cron.schedule('0 2 * * *', async () => {
      try {
        logger.info('[Scheduler] Running credit expiration job');
        await CreditManagementService.expireOldCredits();
      } catch (error) {
        logger.error('[Scheduler] Credit expiration job failed:', error);
      }
    }, {
      timezone: 'UTC'
    });

    // 4. Send 7-day expiration warnings - Daily at 9:00 AM
    cron.schedule('0 9 * * *', async () => {
      try {
        logger.info('[Scheduler] Running 7-day expiration warning job');
        await CreditManagementService.sendExpirationWarnings(7);
      } catch (error) {
        logger.error('[Scheduler] 7-day warning job failed:', error);
      }
    }, {
      timezone: 'UTC'
    });

    // 5. Send 1-day expiration warnings - Daily at 9:00 AM
    cron.schedule('0 9 * * *', async () => {
      try {
        logger.info('[Scheduler] Running 1-day expiration warning job');
        await CreditManagementService.sendExpirationWarnings(1);
      } catch (error) {
        logger.error('[Scheduler] 1-day warning job failed:', error);
      }
    }, {
      timezone: 'UTC'
    });

    logger.info('[Scheduler] All scheduled jobs initialized successfully');
  }
}

module.exports = new ConsultationScheduler();
```

**Start in app.js:**
```javascript
// After all routes are registered
if (process.env.NODE_ENV !== 'test') {
  const scheduler = require('./jobs/consultation-scheduler');
  scheduler.start();
}
```

---

## 📦 Additional Packages Needed

Add to `package.json`:
```json
{
  "dependencies": {
    "node-cron": "^3.0.3"
  }
}
```

Run: `npm install node-cron`

---

## 🎨 Frontend Integration Examples

### **A. Package Purchase Component**

```typescript
// src/app/consultations/packages/[id]/purchase/page.tsx
'use client';

import { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

function PurchaseForm({ packageId }: { packageId: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setProcessing(true);

    try {
      // Create payment method
      const { error, paymentMethod } = await stripe.createPaymentMethod({
        type: 'card',
        card: elements.getElement(CardElement)!
      });

      if (error) {
        throw new Error(error.message);
      }

      // Process purchase
      const response = await fetch('/api/payments/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          packageId,
          paymentMethodId: paymentMethod.id,
          billingDetails: {
            name: 'Company Name',
            email: 'billing@company.com'
          }
        })
      });

      const result = await response.json();

      if (result.success) {
        // Show success message
        alert(`Success! ${result.data.creditsAllocated} credits added to your account`);
        // Redirect to dashboard
        window.location.href = '/client/dashboard';
      }
    } catch (error) {
      console.error('Payment failed:', error);
      alert('Payment failed. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <CardElement />
      <button type="submit" disabled={!stripe || processing}>
        {processing ? 'Processing...' : 'Purchase Package'}
      </button>
    </form>
  );
}

export default function PurchasePage({ params }: { params: { id: string } }) {
  return (
    <Elements stripe={stripePromise}>
      <PurchaseForm packageId={params.id} />
    </Elements>
  );
}
```

### **B. Credit Balance Widget**

```typescript
// src/components/client/CreditBalanceWidget.tsx
'use client';

import { useEffect, useState } from 'react';

export default function CreditBalanceWidget() {
  const [credits, setCredits] = useState<any>(null);

  useEffect(() => {
    fetch('/api/credits/me/summary', {
      credentials: 'include'
    })
      .then(res => res.json())
      .then(data => setCredits(data.data));
  }, []);

  if (!credits) return <div>Loading...</div>;

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold mb-4">Your Consultation Credits</h3>

      <div className="text-4xl font-bold text-blue-600 mb-4">
        {credits.availableCredits}
      </div>

      {credits.freeTrial.eligible && !credits.freeTrial.used && (
        <div className="bg-green-50 border border-green-200 rounded p-3 mb-4">
          <p className="text-sm text-green-800">
            ✨ Free 15-minute trial available!
          </p>
        </div>
      )}

      <div className="space-y-2">
        {credits.activePackages.map((pkg: any) => (
          <div key={pkg.packageId} className="flex justify-between text-sm">
            <span>{pkg.packageName}</span>
            <span>{pkg.creditsRemaining} remaining</span>
          </div>
        ))}
      </div>

      {credits.expiringCredits.length > 0 && (
        <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded p-3">
          <p className="text-sm text-yellow-800">
            ⚠️ {credits.expiringCredits.length} package(s) expiring soon
          </p>
        </div>
      )}

      <button className="mt-4 w-full bg-blue-600 text-white rounded py-2">
        Purchase More Credits
      </button>
    </div>
  );
}
```

---

## 🚀 Deployment Checklist

### **1. Environment Variables**
Ensure all are set in production:
```bash
# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Email
GMAIL_USER=your@email.com
GMAIL_APP_PASSWORD=your_app_password

# URLs
CLIENT_URL=https://app.insightserenity.com
CONSULTANT_URL=https://consultant.insightserenity.com

# Database
DATABASE_CUSTOMER_URI=mongodb+srv://...
```

### **2. Stripe Webhook Setup**
1. Go to Stripe Dashboard → Webhooks
2. Add endpoint: `https://api.insightserenity.com/api/payments/webhooks/stripe`
3. Select events:
   - payment_intent.succeeded
   - payment_intent.payment_failed
   - invoice.payment_succeeded
   - invoice.payment_failed
   - customer.subscription.updated
   - customer.subscription.deleted
4. Copy webhook signing secret to `.env`

### **3. Email Templates**
Create all required HTML email templates in:
`/modules/core-business/notifications/templates/`

### **4. Cron Jobs**
Ensure cron scheduler starts in production (`app.js`)

### **5. Database Indexes**
Run these MongoDB indexes for performance:
```javascript
// Consultations
db.consultations.createIndex({ 'schedule.scheduledStart': 1 });
db.consultations.createIndex({ clientId: 1, 'status.current': 1 });
db.consultations.createIndex({ consultantId: 1, 'status.current': 1 });

// Credits
db.clients.createIndex({ 'consultationCredits.credits.expiryDate': 1 });
db.clients.createIndex({ 'consultationCredits.credits.status': 1 });
```

---

## 📊 What Still Needs Implementation

### High Priority:
1. **Consultant Auto-Assignment Algorithm** - Smart matching based on skills, availability
2. **Calendar Conflict Checking** - Real-time availability validation
3. **Zoom Integration** - Video conferencing with meeting links
4. **Universal File Upload** - Extend S3 for consultation deliverables
5. **Analytics Service** - Business metrics and dashboards

### Medium Priority:
6. **Admin Dashboard Backend** - Platform management APIs
7. **Subscription Auto-Renewal** - Automated recurring billing
8. **Invoice PDF Generation** - Downloadable invoices
9. **Advanced Search** - Full-text search across consultations

### Nice to Have:
10. **Real-time Notifications** - Socket.io push notifications
11. **SMS Notifications** - Twilio integration
12. **Recording Management** - Auto-upload consultation recordings

---

## 🎯 Next Steps for Complete Implementation

1. **Integrate Services into Existing Routes** (2 hours)
   - Add payment processing to billing routes
   - Hook credit management into consultation service
   - Add notification triggers

2. **Create Cron Jobs** (1 hour)
   - Set up node-cron scheduler
   - Test reminder jobs

3. **Create Email Templates** (3 hours)
   - Design 15+ HTML email templates
   - Test with real data

4. **Frontend Payment Integration** (4 hours)
   - Stripe Elements setup
   - Purchase flow UI
   - Credit dashboard

5. **Testing & QA** (4 hours)
   - End-to-end payment flow
   - Credit lifecycle testing
   - Email delivery verification

---

## 💡 Professional B2B Best Practices Implemented

✅ **Enterprise-Grade Error Handling** - Comprehensive try-catch with specific error messages
✅ **Audit Trail** - All credit transactions and payments logged
✅ **Idempotency** - Duplicate payment protection via Stripe
✅ **Transaction Safety** - Proper database transactions for multi-step operations
✅ **Email Notifications** - Professional templated emails for all events
✅ **Security** - Stripe webhook verification, authenticated endpoints
✅ **Scalability** - Cron jobs for batch processing
✅ **Monitoring** - Comprehensive logging throughout
✅ **B2B UX** - Invoices, subscriptions, credit management
✅ **Compliance** - Payment receipt emails, transaction records

---

## 📞 Support & Documentation

For questions or issues:
1. Check consultation system documentation: `CONSULTATION-SYSTEM-DOCUMENTATION.md`
2. Review service code comments
3. Check logs: `/logs/`
4. Test in development before production deployment

---

**END OF IMPLEMENTATION GUIDE**
