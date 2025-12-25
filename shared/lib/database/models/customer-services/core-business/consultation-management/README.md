# Consultation Management Models

> **Purpose**: This module manages both the **product catalog** (what clients can purchase) and the **actual consultation sessions** (the service delivery).

## Table of Contents
- [Overview](#overview)
- [Model Comparison](#model-comparison)
- [How They Work Together](#how-they-work-together)
- [Real-Life Scenarios](#real-life-scenarios)
- [Database Relationships](#database-relationships)
- [Business Workflows](#business-workflows)
- [API Integration](#api-integration)

---

## Overview

The Consultation Management module consists of **two distinct models** that serve different purposes in the consulting business workflow:

| Model | Purpose | Analogy |
|-------|---------|---------|
| **consultation-package-model.js** | Product catalog - defines what clients can buy | Netflix subscription plans, Gym membership tiers |
| **consultation-model.js** | Service delivery - records actual sessions | Doctor's appointment record, Gym class attendance log |

---

## Model Comparison

### Quick Reference Table

| Aspect | Consultation Package | Consultation |
|--------|---------------------|--------------|
| **What is it?** | A product/plan for sale | An actual meeting/session |
| **Created by** | Admin/Marketing team | Client booking system |
| **Created when?** | Once, when defining pricing | Every time client books appointment |
| **How many exist?** | Few (3-10 packages typically) | Thousands (one per session) |
| **Lifespan** | Long-term (months/years) | Short-term (specific date/time) |
| **Price** | Fixed price for the package | Free (uses credits from package) |
| **Contains** | Credits, pricing, features | Schedule, outcomes, feedback |
| **Example** | "Professional Plan: 5 sessions for $450" | "Marketing strategy session on Jan 15 at 2pm" |

---

## Detailed Model Breakdown

### 1. Consultation Package Model

**File**: `consultation-package-model.js`

**Mission**: Define the pricing plans, bundles, and subscription options that clients can purchase.

#### Key Fields

```javascript
{
  packageId: "PKG-123456-0001",           // Unique package identifier
  details: {
    name: "Professional Package",         // Display name
    type: "consultation_bundle",          // Package type
    description: "5 consultations for professional clients",
    category: "business"                  // individual/business/enterprise
  },
  credits: {
    total: 5,                            // Number of consultations included
    expiresAfterDays: 90,                // Valid for 90 days from purchase
    duration: {
      minutes: 60                        // Each consultation is 60 minutes
    }
  },
  pricing: {
    amount: 45000,                       // $450.00 (stored in cents)
    currency: "USD",
    discount: {
      percentage: 10,                    // 10% discount if applicable
      amount: 5000                       // $50 off
    }
  },
  availability: {
    status: "active",                    // active/inactive/archived
    featuredPackage: true,               // Show on homepage
    displayOrder: 2                      // Sort order on pricing page
  },
  stripe: {
    priceId: "price_1234567890",         // Stripe price ID
    productId: "prod_1234567890"         // Stripe product ID
  }
}
```

#### Package Types

| Type | Description | Use Case |
|------|-------------|----------|
| `free_trial` | First-time 15-minute consultation | Client acquisition, testing |
| `pay_per_use` | Single consultation, pay as you go | One-time clients |
| `consultation_bundle` | Bulk purchase (e.g., 5, 10, 20 sessions) | Regular clients, cost savings |
| `monthly_subscription` | Recurring monthly plan | Ongoing support |
| `quarterly_subscription` | Recurring quarterly plan | Long-term engagements |
| `annual_subscription` | Recurring annual plan | Enterprise clients |
| `custom_plan` | Custom enterprise package | Special arrangements |

---

### 2. Consultation Model

**File**: `consultation-model.js`

**Mission**: Record and manage individual consultation sessions between consultants and clients.

#### Key Fields

```javascript
{
  consultationId: "CONS-123456-0001",    // Unique consultation identifier
  consultantId: "64abc...",              // Who is providing the service
  clientId: "64def...",                  // Who is receiving the service

  details: {
    title: "Marketing Strategy Session",
    description: "Q1 marketing plan review",
    type: "strategy_session",            // Type of consultation
    objectives: [                        // What we aim to achieve
      "Review current marketing performance",
      "Plan Q1 campaign strategy"
    ],
    agenda: [                            // Meeting agenda
      "Performance review - 15 mins",
      "Strategy discussion - 30 mins",
      "Action items - 15 mins"
    ]
  },

  schedule: {
    scheduledStart: "2025-01-15T14:00:00Z",
    scheduledEnd: "2025-01-15T15:00:00Z",
    duration: { scheduled: 60 },         // Minutes
    timezone: "America/New_York",
    actualStart: "2025-01-15T14:02:00Z", // When it actually started
    actualEnd: "2025-01-15T15:05:00Z"    // When it actually ended
  },

  outcomes: {
    summary: "Reviewed Q4 performance and planned Q1 strategy...",
    overallStatus: "successful",
    metrics: {
      goalsAchieved: 3,
      issuesResolved: 2
    },
    nextSteps: [
      "Client to review budget proposal by Jan 20",
      "Schedule follow-up session for Feb 1"
    ]
  },

  feedback: {
    client: {
      rating: 5,
      comments: "Very helpful session, clear action items"
    },
    consultant: {
      clientEngagement: "highly_engaged",
      notes: "Client well-prepared, productive session"
    }
  },

  status: {
    current: "completed",                // scheduled → in_progress → completed
    isActive: true
  }
}
```

#### Consultation Types

| Type | Description | Typical Duration |
|------|-------------|-----------------|
| `strategy_session` | High-level strategic planning | 60-120 mins |
| `technical_consultation` | Technical problem-solving | 30-90 mins |
| `advisory` | Expert advice and guidance | 30-60 mins |
| `training` | Skills training and education | 60-180 mins |
| `workshop` | Group workshop session | 120-240 mins |
| `review` | Code review, document review | 30-60 mins |
| `status_update` | Progress check-in | 15-30 mins |
| `troubleshooting` | Issue resolution | 30-90 mins |

---

## How They Work Together

### The Complete Journey

```
┌─────────────────────────────────────────────────────────────────┐
│                    BUSINESS WORKFLOW                             │
└─────────────────────────────────────────────────────────────────┘

1. ADMIN CREATES PACKAGES (consultation-package-model)
   ↓
   ┌──────────────────────────────────────┐
   │ Starter Package: $99 (3 sessions)    │
   │ Professional: $450 (5 sessions)      │
   │ Enterprise: $1200 (15 sessions)      │
   └──────────────────────────────────────┘

2. CLIENT VIEWS PRICING PAGE
   ↓
   Frontend queries ConsultationPackage.findActivePackages()
   ↓
   Displays packages with pricing, features, credits

3. CLIENT PURCHASES PACKAGE
   ↓
   ┌──────────────────────────────────────┐
   │ Client pays $450 via Stripe          │
   │ → billing-model creates transaction  │
   │ → Client receives 5 credits          │
   │ → Credits expire in 90 days          │
   └──────────────────────────────────────┘

4. CLIENT BOOKS CONSULTATION (consultation-model)
   ↓
   ┌──────────────────────────────────────┐
   │ Choose consultant: Sarah Johnson     │
   │ Choose date: Jan 15, 2025 at 2pm    │
   │ Choose type: Strategy Session        │
   └──────────────────────────────────────┘
   ↓
   System validates:
   ✓ Client has credits available (5 > 0)
   ✓ Consultant available at that time
   ✓ No scheduling conflicts
   ↓
   Creates Consultation record
   Deducts 1 credit (4 remaining)
   Sends calendar invites

5. CONSULTATION HAPPENS
   ↓
   Status: scheduled → confirmed → in_progress → completed
   ↓
   Consultant updates outcomes, deliverables
   Client provides feedback
   ↓
   Consultation record finalized

6. REPEAT 4-5 FOR REMAINING CREDITS
   ↓
   Client books 4 more sessions
   Each creates new Consultation record
   Each deducts 1 credit
```

---

## Real-Life Scenarios

### Scenario 1: Freelance Marketing Consultant Platform

**Setup**: Platform offers marketing consulting services

#### Step 1: Admin Creates Package Tiers

```javascript
// consultation-package-model records

Package 1: "Quick Start"
- packageId: "PKG-001"
- name: "Quick Start Package"
- type: "consultation_bundle"
- credits.total: 3
- pricing.amount: 29700  // $297
- expiresAfterDays: 60

Package 2: "Growth Plan"
- packageId: "PKG-002"
- name: "Growth Plan Package"
- type: "monthly_subscription"
- credits.total: 8
- credits.unlimited: false
- pricing.amount: 79900  // $799/month
- subscription.recurring: true
- subscription.interval: "month"

Package 3: "Enterprise"
- packageId: "PKG-003"
- name: "Enterprise Package"
- type: "custom_plan"
- credits.unlimited: true
- pricing.amount: 299900  // $2,999/month
- subscription.recurring: true
```

#### Step 2: Client Journey

**Client**: Sarah's Bakery (new client)

**Day 1**: Sarah discovers the platform
```
→ Views pricing page
→ Sees "Quick Start Package: 3 sessions for $297"
→ Clicks "Purchase"
→ Stripe payment: $297
→ billing-model creates transaction record
→ Sarah's account credited with 3 consultations
```

**Day 3**: Sarah books first consultation
```javascript
// Creates consultation-model record

{
  consultationId: "CONS-001",
  consultantId: "consultant-mike-johnson",
  clientId: "client-sarahs-bakery",
  details: {
    title: "Instagram Marketing Strategy",
    type: "strategy_session",
    objectives: [
      "Increase Instagram engagement",
      "Plan content calendar for Q1"
    ]
  },
  schedule: {
    scheduledStart: "2025-01-20T10:00:00Z",
    scheduledEnd: "2025-01-20T11:00:00Z"
  }
}

// System actions:
→ Deducts 1 credit (2 remaining)
→ Sends email confirmation to Sarah
→ Sends calendar invite to both parties
→ Adds to consultant's schedule
```

**Day 20**: Consultation happens
```javascript
// Updates consultation-model record

{
  status: { current: "in_progress" },
  schedule: {
    actualStart: "2025-01-20T10:05:00Z"  // Started 5 mins late
  }
}

// After consultation ends:
{
  status: { current: "completed" },
  schedule: {
    actualEnd: "2025-01-20T11:10:00Z"
  },
  outcomes: {
    summary: "Analyzed current Instagram performance. Created content calendar template. Identified 3 key hashtag strategies.",
    overallStatus: "successful",
    deliverables: [
      {
        title: "Q1 Content Calendar Template",
        url: "https://s3.../content-calendar.xlsx",
        deliveredDate: "2025-01-20"
      }
    ]
  },
  feedback: {
    client: {
      rating: 5,
      comments: "Mike was extremely helpful! Got exactly what I needed."
    }
  }
}
```

**Day 25**: Sarah books second consultation
```javascript
// Creates new consultation-model record

{
  consultationId: "CONS-002",
  consultantId: "consultant-mike-johnson",
  clientId: "client-sarahs-bakery",
  details: {
    title: "Facebook Ads Campaign Setup",
    type: "implementation"
  },
  schedule: {
    scheduledStart: "2025-02-05T14:00:00Z"
  }
}

// System: Deducts 1 credit (1 remaining)
```

**Day 40**: Sarah wants to upgrade
```
→ Used all 3 consultations
→ Purchases "Growth Plan: $799/month"
→ Gets 8 consultations per month
→ Auto-renews monthly
```

---

### Scenario 2: SaaS Technical Support Platform

**Setup**: Software company offers technical consulting

#### Package Setup

```javascript
// consultation-package-model records

Free Trial Package:
{
  packageId: "PKG-FREE",
  details: {
    name: "Free 15-Min Consultation",
    type: "free_trial"
  },
  credits: {
    total: 1,
    duration: { minutes: 15 },
    expiresAfterDays: 30
  },
  pricing: { amount: 0 },
  eligibility: {
    clientTypes: ["new"],  // Only new clients
    maximumPurchasePerClient: 1
  }
}

Pay-Per-Use Package:
{
  packageId: "PKG-PPU",
  details: {
    name: "Single Session",
    type: "pay_per_use"
  },
  credits: { total: 1 },
  pricing: { amount: 9900 }  // $99
}

Support Bundle:
{
  packageId: "PKG-SUPPORT",
  details: {
    name: "Support Bundle",
    type: "consultation_bundle"
  },
  credits: {
    total: 10,
    expiresAfterDays: 180
  },
  pricing: {
    amount: 79000,  // $790
    pricePerCredit: 7900  // $79 per session (20% discount)
  }
}
```

#### Client Journey

**Client**: TechStartup Inc. (new client)

**Day 1**: Discovery
```
→ New client signs up
→ Automatically eligible for free trial
→ Client.consultationCredits.freeTrial.eligible = true
```

**Day 2**: Books free trial
```javascript
// Creates consultation-model record

{
  consultationId: "CONS-TRIAL-001",
  clientId: "techstartup-inc",
  details: {
    title: "API Integration Support",
    type: "technical_consultation"
  },
  schedule: {
    scheduledStart: "2025-01-25T16:00:00Z",
    scheduledEnd: "2025-01-25T16:15:00Z",  // 15 mins only
    duration: { scheduled: 15 }
  },
  billing: {
    billable: false,  // Free trial
    usedFreeTrial: true
  }
}

// System actions:
→ Marks free trial as used
→ Client.consultationCredits.freeTrial.used = true
→ Client.consultationCredits.freeTrial.usedAt = "2025-01-25"
```

**Day 10**: Needs more help
```
→ Free trial used, needs to purchase
→ Buys "Support Bundle: 10 sessions for $790"
→ Gets 10 credits valid for 180 days
```

**Over next 6 months**: Regular usage
```javascript
// Creates 10 consultation-model records

CONS-001: "Database optimization" - Jan 30
CONS-002: "API rate limiting issue" - Feb 15
CONS-003: "Authentication setup" - Feb 28
CONS-004: "Performance tuning" - Mar 10
CONS-005: "Security audit review" - Mar 25
CONS-006: "Deployment troubleshooting" - Apr 5
CONS-007: "Load balancing config" - Apr 20
CONS-008: "Cache implementation" - May 1
CONS-009: "Monitoring setup" - May 15
CONS-010: "Final optimization" - Jun 1

// Each consultation:
→ Different topic/issue
→ Different consultant (sometimes)
→ Separate outcomes and feedback
→ All tracked individually
→ All linked back to original package purchase
```

---

## Database Relationships

### Entity Relationship Diagram

```
┌─────────────────────┐
│  ConsultationPackage│  (The Product)
│  ─────────────────  │
│  - packageId        │
│  - name             │
│  - credits.total    │
│  - pricing.amount   │
└──────────┬──────────┘
           │
           │ purchased_by
           │
           ↓
┌─────────────────────┐         ┌──────────────────────┐
│      Billing        │────────→│       Client         │
│  ─────────────────  │  paid_by│  ──────────────────  │
│  - transactionId    │         │  - consultationCredits│
│  - package (ref)    │         │  - availableCredits  │
│  - amount           │         │  - freeTrial.used    │
│  - stripe details   │         └──────────┬───────────┘
└─────────────────────┘                    │
                                           │
                                           │ books
                                           │
                                           ↓
                                 ┌──────────────────────┐
                                 │    Consultation      │  (The Service)
                                 │  ──────────────────  │
                                 │  - consultationId    │
                                 │  - clientId (ref)    │
                                 │  - consultantId (ref)│
                                 │  - schedule          │
                                 │  - outcomes          │
                                 └──────────────────────┘
                                           │
                                           │ delivered_by
                                           │
                                           ↓
                                 ┌──────────────────────┐
                                 │     Consultant       │
                                 │  ──────────────────  │
                                 │  - availability      │
                                 │  - expertise         │
                                 │  - earnings          │
                                 └──────────────────────┘
```

### Data Flow

```
Package Purchase Flow:
═══════════════════════

1. Client selects ConsultationPackage
2. Stripe payment processed
3. Billing record created
   - Links to ConsultationPackage
   - Links to Client
   - Stores transaction details
4. Client.consultationCredits updated
   - availableCredits += package.credits.total
   - New credit entry added with expiry


Consultation Booking Flow:
═══════════════════════════

1. Client has availableCredits > 0
2. Client selects Consultant and time
3. System validates:
   - Credits available?
   - Consultant available?
   - No conflicts?
4. Consultation record created
   - Links to Client
   - Links to Consultant
   - Schedule details
5. Client.consultationCredits updated
   - availableCredits -= 1
   - Credit entry updated (creditsUsed++)


Consultation Lifecycle:
═══════════════════════

scheduled → confirmed → in_progress → completed
                ↓
            cancelled (credits restored)
```

---

## Business Workflows

### Workflow 1: Package Management

**Admin creates new package**

```javascript
// Admin interface creates consultation-package-model record

const newPackage = new ConsultationPackage({
  packageId: await ConsultationPackage.generatePackageId(tenantId),
  tenantId,
  details: {
    name: "Summer Special Bundle",
    type: "consultation_bundle",
    description: "Limited time offer"
  },
  credits: {
    total: 10,
    expiresAfterDays: 120
  },
  pricing: {
    amount: 89000,  // $890
    originalPrice: 99000,  // Was $990
    discount: { amount: 10000 }  // Save $100
  },
  availability: {
    status: "active",
    startDate: new Date("2025-06-01"),
    endDate: new Date("2025-08-31"),
    limitedTimeOffer: true
  },
  marketing: {
    tagline: "Summer Special - 10 sessions, Save $100!",
    badge: "limited"
  }
});

await newPackage.save();
```

### Workflow 2: Client Purchases Package

```javascript
// Frontend: Client clicks "Purchase" button
// Backend: payment-controller handles request

async function purchasePackage(clientId, packageId) {
  // 1. Get package details
  const package = await ConsultationPackage.findOne({ packageId });

  // 2. Create Stripe payment intent
  const paymentIntent = await stripe.paymentIntents.create({
    amount: package.pricing.amount,
    currency: package.pricing.currency,
    metadata: {
      packageId: package.packageId,
      clientId: clientId
    }
  });

  // 3. Create billing record
  const billing = new Billing({
    transactionId: await Billing.generateTransactionId(tenantId),
    client: clientId,
    package: package._id,
    amount: {
      gross: package.pricing.amount,
      platformFee: calculatePlatformFee(package.pricing.amount),
      processingFee: calculateStripeFee(package.pricing.amount)
    },
    stripe: {
      paymentIntentId: paymentIntent.id
    },
    status: { current: "pending" }
  });

  await billing.save();

  // 4. Return client secret for frontend
  return {
    clientSecret: paymentIntent.client_secret,
    transactionId: billing.transactionId
  };
}
```

### Workflow 3: Payment Confirmed (Webhook)

```javascript
// Stripe webhook: payment_intent.succeeded

async function handlePaymentSuccess(paymentIntentId) {
  // 1. Find billing record
  const billing = await Billing.findOne({
    'stripe.paymentIntentId': paymentIntentId
  }).populate('package');

  // 2. Update billing status
  await billing.markAsSucceeded({
    chargeId: charge.id,
    receiptUrl: charge.receipt_url
  });

  // 3. Add credits to client
  const client = await Client.findById(billing.client);

  client.consultationCredits.credits.push({
    packageId: billing.package._id,
    creditsAdded: billing.package.credits.total,
    creditsUsed: 0,
    creditsRemaining: billing.package.credits.total,
    purchaseDate: new Date(),
    expiryDate: calculateExpiryDate(billing.package.credits.expiresAfterDays),
    billingId: billing._id,
    status: "active"
  });

  client.consultationCredits.availableCredits += billing.package.credits.total;

  await client.save();

  // 4. Send confirmation email
  await sendEmail({
    to: client.email,
    subject: "Purchase Confirmed",
    template: "package-purchase",
    data: {
      packageName: billing.package.details.name,
      credits: billing.package.credits.total,
      expiryDate: expiryDate
    }
  });
}
```

### Workflow 4: Client Books Consultation

```javascript
// consultation-service.js: createConsultation()

async function createConsultation(data) {
  // 1. Validate payment/credits
  const validation = await paymentService.validateConsultationPayment(
    data.clientId,
    data.durationMinutes
  );

  if (!validation.valid) {
    throw new Error("Payment or credits required");
  }

  // 2. Check consultant availability
  await checkSchedulingConflicts(
    data.consultantId,
    data.scheduledStart,
    data.scheduledEnd
  );

  // 3. Create consultation record
  const consultation = new Consultation({
    consultationId: await generateConsultationId(),
    consultantId: data.consultantId,
    clientId: data.clientId,
    details: {
      title: data.title,
      type: data.type,
      objectives: data.objectives
    },
    schedule: {
      scheduledStart: data.scheduledStart,
      scheduledEnd: data.scheduledEnd,
      duration: { scheduled: data.durationMinutes }
    },
    status: { current: "scheduled" }
  });

  await consultation.save();

  // 4. Deduct credit
  if (validation.method === "free_trial") {
    await markFreeTrialUsed(data.clientId, consultation._id);
  } else if (validation.method === "credits") {
    await deductConsultationCredit(data.clientId, consultation._id);
  }

  // 5. Send notifications
  await sendConfirmationEmail(consultation);
  await sendCalendarInvite(consultation);

  return consultation;
}
```

### Workflow 5: Consultation Completed

```javascript
// consultation-service.js: completeConsultation()

async function completeConsultation(consultationId, outcomeData) {
  // 1. Get consultation
  const consultation = await Consultation.findOne({ consultationId });

  // 2. Update with outcomes
  consultation.status.current = "completed";
  consultation.schedule.actualEnd = new Date();
  consultation.outcomes = {
    summary: outcomeData.summary,
    overallStatus: outcomeData.status,
    metrics: outcomeData.metrics,
    nextSteps: outcomeData.nextSteps
  };

  if (outcomeData.deliverables) {
    consultation.deliverables = outcomeData.deliverables.map(d => ({
      title: d.title,
      description: d.description,
      fileUrl: d.fileUrl,
      deliveredDate: new Date(),
      status: "delivered"
    }));
  }

  await consultation.save();

  // 3. Update client lifetime stats
  const client = await Client.findById(consultation.clientId);
  client.consultationCredits.lifetime.totalConsultations += 1;
  await client.save();

  // 4. Request feedback
  await sendFeedbackRequest(consultation);

  // 5. Update consultant stats
  await updateConsultantMetrics(consultation.consultantId);

  return consultation;
}
```

---

## API Integration

### Frontend Usage Examples

#### Display Pricing Packages

```javascript
// Frontend: Pricing page component

async function loadPackages() {
  const response = await fetch('/api/billing/packages?featured=true');
  const { data: packages } = await response.json();

  // packages = array of consultation-package-model records
  packages.forEach(pkg => {
    console.log(`
      ${pkg.details.name}
      Price: $${pkg.pricing.amount / 100}
      Credits: ${pkg.credits.total} consultations
      Expires: ${pkg.credits.expiresAfterDays} days
      ${pkg.marketing?.badge || ''}
    `);
  });
}
```

#### Purchase Package

```javascript
// Frontend: Purchase flow

async function purchasePackage(packageId) {
  // 1. Create payment intent
  const response = await fetch('/api/billing/payments/intent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      packageId,
      amount: package.pricing.amount,
      currency: 'USD'
    })
  });

  const { clientSecret } = await response.json();

  // 2. Show Stripe checkout
  const stripe = await loadStripe(STRIPE_PUBLISHABLE_KEY);
  const { error } = await stripe.confirmCardPayment(clientSecret);

  if (!error) {
    // 3. Credits automatically added via webhook
    alert('Purchase successful! Credits added to your account.');
    window.location.href = '/dashboard';
  }
}
```

#### Check Credit Balance

```javascript
// Frontend: Dashboard component

async function loadCreditBalance() {
  const response = await fetch('/api/billing/credits/balance');
  const { data } = await response.json();

  console.log(`
    Available Credits: ${data.availableCredits}
    Free Trial: ${data.freeTrial.eligible ? 'Available' : 'Used'}
    Active Packages: ${data.activeCredits.length}
  `);

  // Show each active credit package
  data.activeCredits.forEach(credit => {
    console.log(`
      Credits: ${credit.creditsRemaining}/${credit.creditsAdded}
      Expires: ${new Date(credit.expiryDate).toLocaleDateString()}
    `);
  });
}
```

#### Book Consultation

```javascript
// Frontend: Booking form

async function bookConsultation(formData) {
  // First, check if user has credits
  const balanceResponse = await fetch('/api/billing/credits/balance');
  const { data } = await balanceResponse.json();

  if (data.availableCredits === 0 && !data.freeTrial.eligible) {
    alert('No credits available. Please purchase a package.');
    window.location.href = '/pricing';
    return;
  }

  // Create consultation
  const response = await fetch('/api/consultations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      consultantId: formData.consultantId,
      title: formData.title,
      type: formData.type,
      scheduledStart: formData.date,
      scheduledEnd: formData.endDate,
      objectives: formData.objectives
    })
  });

  const { data: consultation } = await response.json();

  // consultation = consultation-model record
  alert(`Consultation booked! ID: ${consultation.consultationId}`);
}
```

#### View Consultation History

```javascript
// Frontend: My consultations page

async function loadConsultations() {
  const response = await fetch('/api/consultations/me');
  const { data: consultations } = await response.json();

  // consultations = array of consultation-model records
  consultations.forEach(consult => {
    console.log(`
      ${consult.details.title}
      Date: ${new Date(consult.schedule.scheduledStart).toLocaleString()}
      Consultant: ${consult.consultant.name}
      Status: ${consult.status.current}
      ${consult.feedback?.client?.rating ? `Rating: ${consult.feedback.client.rating}/5` : ''}
    `);
  });
}
```

---

## Summary

### Key Takeaways

1. **Two Models, Two Purposes**
   - **ConsultationPackage**: What you SELL (product catalog)
   - **Consultation**: What you DELIVER (service records)

2. **Relationship Flow**
   ```
   Package → Purchase → Credits → Booking → Consultation
   ```

3. **One-to-Many**
   - 1 Package can be purchased by many clients
   - 1 Package purchase gives many consultation credits
   - Many credits create many consultation records

4. **Independent Lifecycles**
   - Packages: Long-term, managed by admin
   - Consultations: Short-term, created per session

5. **Clear Separation of Concerns**
   - Marketing team manages packages
   - Operations team manages consultations
   - Finance team tracks billing
   - Consultants deliver services

---

## File Structure

```
consultation-management/
├── README.md                           # This file
├── index.js                           # Module exports
├── consultation-package-model.js      # Product catalog model
└── consultation-model.js              # Service delivery model
```

---

## Related Documentation

- [Billing Management Models](../billing-management/README.md)
- [Client Management Models](../client-management/README.md)
- [Payment Service Documentation](../../../../servers/customer-services/modules/core-business/billing-management/services/payment-service.js)
- [Consultation Service Documentation](../../../../servers/customer-services/modules/core-business/consultation-management/services/consultation-service.js)

---

**Last Updated**: January 2025
**Maintained By**: Platform Development Team
