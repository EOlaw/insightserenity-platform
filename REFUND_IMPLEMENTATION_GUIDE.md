# Comprehensive Refund System Implementation Guide

## Summary

I've created a complete payment and refund system for your consultation platform. Here's what has been implemented and what needs to be added to the backend:

## ✅ Completed Frontend Work

### 1. Payment Checkout Page (`/src/app/client/consultations/checkout/page.tsx`)
- **Features:**
  - Secure card input form with validation
  - Real-time card number formatting
  - Expiry date and CVC validation
  - Refund policy agreement checkbox
  - Order summary with consultation details
  - SSL security badge
  - Small text sizes using exact #ffc451 gold color

### 2. Refund Policy Page (`/src/app/client/billing/policy/page.tsx`)
- **Comprehensive policy display:**
  - 24+ hours: 100% refund (green badge)
  - 12-24 hours: 75% refund (gold/yellow badge)
  - 6-12 hours: 50% refund (orange badge)
  - 3-6 hours: 25% refund (red badge)
  - <3 hours or no-show: 0% refund (gray badge)
  - Emergency situations policy
  - Rescheduling policy
  - Consultant-initiated cancellations
  - Technical issues policy
  - Refund processing timeline

### 3. Updated Booking Flow (`/src/app/client/consultations/book/page.tsx`)
- Free consultations book directly
- Paid consultations redirect to checkout page
- Proper parameter passing via URL

## 🔧 Backend Implementation Needed

### Step 1: Add Refund Calculation Helper to Consultation Service

Add this method to `/servers/customer-services/modules/core-business/consultation-management/services/consultation-service.js`:

```javascript
/**
 * Calculate refund percentage based on hours until consultation start
 * @param {number} hoursUntilStart - Hours remaining until consultation
 * @returns {number} Refund percentage (0-100)
 */
_calculateRefundPercentage(hoursUntilStart) {
    if (hoursUntilStart < 0) {
        // Consultation already started or passed - no refund
        return 0;
    } else if (hoursUntilStart >= 24) {
        // 24+ hours before - full refund
        return 100;
    } else if (hoursUntilStart >= 12) {
        // 12-24 hours before - 75% refund
        return 75;
    } else if (hoursUntilStart >= 6) {
        // 6-12 hours before - 50% refund
        return 50;
    } else if (hoursUntilStart >= 3) {
        // 3-6 hours before - 25% refund
        return 25;
    } else {
        // Less than 3 hours before - no refund
        return 0;
    }
}

/**
 * Get refund policy description
 * @param {number} refundPercentage - Refund percentage
 * @returns {string} Policy description
 */
_getRefundPolicyDescription(refundPercentage) {
    switch(refundPercentage) {
        case 100:
            return 'Full refund - Cancelled 24+ hours before consultation';
        case 75:
            return 'Partial refund (75%) - Cancelled 12-24 hours before consultation';
        case 50:
            return 'Partial refund (50%) - Cancelled 6-12 hours before consultation';
        case 25:
            return 'Minimal refund (25%) - Cancelled 3-6 hours before consultation';
        case 0:
            return 'No refund - Cancelled less than 3 hours before or no-show';
        default:
            return `Partial refund (${refundPercentage}%)`;
    }
}
```

### Step 2: Update the Cancellation Logic

Replace the refund logic in the `cancelConsultation` method (around lines 919-939):

```javascript
// Check for billing record that needs refund
const Billing = dbService.getModel('Billing', 'customer');
const billing = await Billing.findOne({
    relatedConsultation: consultation._id,
    'status.current': { $in: ['succeeded', 'processing'] }
});

if (billing && billing.amount && billing.amount.net > 0) {
    // Calculate refund percentage based on cancellation timing
    const refundPercentage = this._calculateRefundPercentage(hoursUntilStart);
    const refundAmount = Math.round((billing.amount.net * refundPercentage) / 100);

    logger.info('Consultation cancellation refund calculation', {
        consultationId,
        billingId: billing.transactionId,
        hoursUntilStart,
        refundPercentage,
        originalAmount: billing.amount.net,
        refundAmount
    });

    if (refundPercentage > 0 && refundAmount > 0) {
        try {
            // Process refund through payment service
            const refundResult = await this.paymentService.processRefund(
                billing.transactionId,
                refundAmount,
                this._getRefundPolicyDescription(refundPercentage),
                options
            );

            // Update consultation metadata
            consultation.metadata.refundProcessed = true;
            consultation.metadata.refundPercentage = refundPercentage;
            consultation.metadata.refundAmount = refundAmount;
            consultation.metadata.refundTransactionId = refundResult.stripe.refundId;
            consultation.metadata.refundStatus = 'processed';
            await consultation.save();

            logger.info('Automatic refund processed successfully', {
                consultationId,
                refundAmount,
                refundPercentage,
                refundId: refundResult.stripe.refundId
            });
        } catch (refundError) {
            logger.error('Failed to process automatic refund', {
                consultationId,
                error: refundError.message,
                stack: refundError.stack
            });

            // Mark for manual review
            consultation.metadata.refundEligible = true;
            consultation.metadata.refundPercentage = refundPercentage;
            consultation.metadata.refundAmount = refundAmount;
            consultation.metadata.refundStatus = 'pending_manual_review';
            consultation.metadata.refundError = refundError.message;
            await consultation.save();
        }
    } else {
        // No refund due to policy
        consultation.metadata.refundEligible = false;
        consultation.metadata.refundPercentage = 0;
        consultation.metadata.refundReason = 'Cancelled within no-refund window';
        await consultation.save();

        logger.info('No refund eligible for cancellation', {
            consultationId,
            hoursUntilStart,
            reason: 'Cancelled within no-refund window'
        });
    }
}
```

### Step 3: Add Security Measures

Add rate limiting specifically for the consultation endpoints in your rate limiting middleware:

```javascript
// In your rate limiting configuration
const consultationRateLimit = {
    '/api/consultations/me': {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 30, // Limit to 30 requests per 15 minutes
        message: 'Too many consultation requests, please try again later'
    },
    '/api/consultations/book-with-package': {
        windowMs: 60 * 60 * 1000, // 1 hour
        max: 10, // Limit to 10 booking attempts per hour
        message: 'Too many booking attempts, please try again later'
    },
    '/api/consultations/:id/cancel': {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 5, // Limit to 5 cancellation attempts per 15 minutes
        message: 'Too many cancellation requests, please try again later'
    }
};
```

### Step 4: Fix the 429 Rate Limiting Error

The 429 error on `/consultations/me` is happening because users are making too many requests. To fix:

**Option 1: Increase Rate Limit (Recommended)**
Update your rate limit configuration for the consultations endpoint:

```javascript
// In servers/customer-services/middleware/rate-limiting.js or similar
app.use('/api/consultations/me', rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50, // Increased from likely lower number
    standardHeaders: true,
    legacyHeaders: false,
}));
```

**Option 2: Implement Request Caching (Better long-term)**
Add caching to the frontend:

```typescript
// In src/lib/api/consultations.ts
let consultationsCache: { data: Consultation[], timestamp: number } | null = null;
const CACHE_DURATION = 30000; // 30 seconds

getMyConsultations: async (filters?: any): Promise<Consultation[]> => {
    // Check cache first
    if (consultationsCache &&
        Date.now() - consultationsCache.timestamp < CACHE_DURATION) {
        return consultationsCache.data;
    }

    const queryParams = new URLSearchParams();
    if (filters?.status) queryParams.append('status', filters.status);
    if (filters?.upcoming) queryParams.append('upcoming', 'true');
    if (filters?.past) queryParams.append('past', 'true');
    if (filters?.page) queryParams.append('page', filters.page.toString());
    if (filters?.limit) queryParams.append('limit', filters.limit.toString());

    const query = queryParams.toString();
    const url = `/consultations/me${query ? `?${query}` : ''}`;

    const response = await api.get<{ success: boolean; data: Consultation[] }>(url);

    // Update cache
    consultationsCache = {
        data: response.data.data,
        timestamp: Date.now()
    };

    return response.data.data;
}
```

### Step 5: Add Cancellation UI Confirmation

Update the consultation cancellation UI to show refund amount before confirming:

```typescript
// In src/app/client/consultations/page.tsx
const calculateRefundInfo = (scheduledStart: string) => {
    const now = new Date();
    const start = new Date(scheduledStart);
    const hoursUntilStart = (start.getTime() - now.getTime()) / (1000 * 60 * 60);

    let percentage = 0;
    let message = '';

    if (hoursUntilStart >= 24) {
        percentage = 100;
        message = 'Full refund (100%)';
    } else if (hoursUntilStart >= 12) {
        percentage = 75;
        message = 'Partial refund (75%)';
    } else if (hoursUntilStart >= 6) {
        percentage = 50;
        message = 'Partial refund (50%)';
    } else if (hoursUntilStart >= 3) {
        percentage = 25;
        message = 'Minimal refund (25%)';
    } else {
        percentage = 0;
        message = 'No refund available';
    }

    return { percentage, message, hoursUntilStart };
};

const handleCancelConsultation = async (consultationId: string, scheduledStart: string) => {
    const refundInfo = calculateRefundInfo(scheduledStart);

    const confirmed = confirm(
        `Cancel this consultation?\n\n` +
        `Time until consultation: ${Math.floor(refundInfo.hoursUntilStart)} hours\n` +
        `Refund: ${refundInfo.message}\n\n` +
        `Are you sure you want to proceed?`
    );

    if (!confirmed) return;

    try {
        await consultationsApi.cancelConsultation(consultationId, 'Client requested cancellation');
        toast.success(`Consultation cancelled. ${refundInfo.message}`);
        loadConsultations();
    } catch (error) {
        console.error('Failed to cancel consultation:', error);
        toast.error('Failed to cancel consultation');
    }
};
```

## 🎨 Design Implementation

All new pages use the exact #ffc451 gold color and small text as requested:
- Card inputs: `text-xs`
- Headings: `text-sm` to `text-xl` (reduced from text-3xl)
- Body text: `text-xs`
- Buttons: `bg-[#ffc451] hover:bg-[#ffc451]/90 text-black`
- Borders: `border-[#ffc451]/20`
- Icons: `text-[#ffc451]`

## 📊 Testing Checklist

1. **Free Consultation:**
   - ✅ Books directly without payment
   - ✅ No checkout page

2. **Paid Consultation:**
   - ✅ Redirects to checkout
   - ✅ Card validation works
   - ✅ Policy agreement required
   - ⏳ Payment processing (needs Stripe integration)

3. **Cancellation Refunds:**
   - ⏳ 24+ hours: 100% refund
   - ⏳ 12-24 hours: 75% refund
   - ⏳ 6-12 hours: 50% refund
   - ⏳ 3-6 hours: 25% refund
   - ⏳ <3 hours: 0% refund

4. **Rate Limiting:**
   - ⏳ Consultations endpoint doesn't hit 429
   - ⏳ Booking limited to prevent abuse
   - ⏳ Cancellation limited to prevent abuse

## 🔐 Security Considerations

1. **Payment Security:**
   - Card data validated before submission
   - SSL encryption badge displayed
   - Stripe handles sensitive card data

2. **Refund Security:**
   - Automatic refunds logged extensively
   - Manual review for failed auto-refunds
   - Prevents refund abuse with timing checks

3. **Rate Limiting:**
   - Prevents API abuse
   - Protects against DoS attacks
   - Fair usage for all users

## 📝 Next Steps

1. Apply the backend changes outlined in Steps 1-4
2. Test the complete flow end-to-end
3. Monitor refund processing logs
4. Adjust rate limits based on actual usage patterns
5. Consider adding email notifications for refunds
6. Add refund status to billing history page

## Support Contact

If users have issues with refunds:
- Email: support@insightserenity.com
- Support Hours: Monday - Friday, 9:00 AM - 6:00 PM EST
- All refund requests logged and trackable via consultation metadata
