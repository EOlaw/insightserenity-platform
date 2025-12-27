# InsightSerenity Consultation Platform - Complete System Documentation

**Last Updated:** December 27, 2025
**Version:** 1.0
**Type:** Professional B2B Consultation Management Platform

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Client Journey - Complete Flow](#client-journey---complete-flow)
3. [Consultant Journey - Complete Flow](#consultant-journey---complete-flow)
4. [Consultation Package Portfolio](#consultation-package-portfolio)
5. [Technical Architecture](#technical-architecture)
6. [What's Currently Implemented](#whats-currently-implemented)
7. [What's Missing - Critical Gaps](#whats-missing---critical-gaps)
8. [Implementation Roadmap for Professional B2B Platform](#implementation-roadmap-for-professional-b2b-platform)
9. [Database Schema Reference](#database-schema-reference)
10. [API Endpoints Reference](#api-endpoints-reference)

---

## System Overview

InsightSerenity is a professional B2B consultation platform designed to serve:
- **College Institutions** - Strategic planning, organizational development
- **Companies** - Business transformation, process improvement
- **Enterprises** - Comprehensive advisory, executive coaching, change management

### Core Value Proposition
A credit-based consultation booking system where organizations purchase consultation packages (bundles of credits) and use those credits to book sessions with expert consultants.

### Key Features
- Multi-tenant architecture supporting multiple organizations
- Credit-based consultation booking system
- Professional consultant profile management with skills, certifications, and availability
- Comprehensive package offerings (free trial → enterprise partnerships)
- Integrated billing and payment processing
- Feedback and rating system for quality assurance
- Role-based access control (clients, consultants, admins)

---

## Client Journey - Complete Flow

### Phase 1: Registration & Account Setup

#### 1.1 Account Creation
**Endpoint:** `POST /api/v1/auth/register`

**Client Registration Process:**
```javascript
// Registration payload
{
  "email": "cfo@acmecorp.com",
  "password": "SecurePass123!",
  "userType": "client",
  "profile": {
    "firstName": "Jane",
    "lastName": "Smith",
    "title": "CFO",
    "organizationName": "Acme Corporation"
  }
}
```

**What Happens Backend:**
1. Creates **User** document with role `['client', 'user']`
2. Creates **Client** document linked to user
3. Sends email verification token to user's email
4. Returns access token and refresh token
5. Sets up default permissions for client role

**User Record Created:**
```javascript
{
  _id: ObjectId("..."),
  email: "cfo@acmecorp.com",
  roles: ["client", "user"],
  clientId: ObjectId("..."), // Links to Client document
  accountStatus: {
    status: "pending_verification",
    createdAt: Date
  },
  verification: {
    email: {
      verified: false,
      verificationToken: "abc123...",
      expiresAt: Date (24 hours from now)
    }
  },
  profile: {
    firstName: "Jane",
    lastName: "Smith",
    displayName: "Jane Smith",
    title: "CFO"
  },
  organizations: [
    {
      organizationId: "000000000000000000000002", // Default org
      roles: ["client"],
      permissions: [
        "clients:read", "clients:update",
        "consultations:read", "consultations:create",
        "documents:read", "documents:create"
      ],
      status: "active"
    }
  ]
}
```

**Client Record Created:**
```javascript
{
  _id: ObjectId("..."),
  userId: ObjectId("..."),
  clientCode: "CLI-ACME-20251227-001", // Auto-generated
  organizationName: "Acme Corporation",
  type: "company", // college | company | enterprise | individual
  status: {
    current: "active",
    isActive: true
  },
  consultationCredits: {
    availableCredits: 0, // No credits yet
    freeTrial: {
      eligible: true,  // ⭐ NEW CLIENTS ARE ELIGIBLE FOR FREE TRIAL
      used: false,
      expiresAt: Date (30 days from registration)
    },
    credits: [], // Will populate when packages purchased
    lifetime: {
      totalConsultations: 0,
      totalSpent: 0,
      totalCreditsPurchased: 0,
      totalCreditsUsed: 0
    }
  },
  demographics: {
    industry: "",
    companySize: "",
    revenue: ""
  },
  contactInformation: {
    primaryEmail: "cfo@acmecorp.com",
    phone: "",
    addresses: []
  }
}
```

#### 1.2 Email Verification
**Endpoint:** `POST /api/v1/auth/verify-email`

**Process:**
1. Client receives email with verification link containing token
2. Client clicks link or submits token via API
3. Backend updates `user.verification.email.verified = true`
4. Account status changes to `"active"`
5. Client can now access full platform features

**Current State After Verification:**
- ✅ Account is active
- ✅ Eligible for 15-minute free trial consultation
- ❌ No purchased credits yet (availableCredits: 0)

---

### Phase 2: Discovering & Purchasing Consultation Packages

#### 2.1 Browse Available Packages
**Endpoint:** `GET /api/consultations/packages`

**What Client Sees:**
```javascript
{
  "success": true,
  "data": {
    "packages": [
      {
        "packageId": "PKG-FREE-TRIAL",
        "details": {
          "name": "Free Trial Consultation",
          "type": "free_trial",
          "category": "trial",
          "description": "Complimentary 15-minute consultation...",
          "features": [
            "15-minute complimentary consultation",
            "Initial needs assessment",
            "Overview of our consulting services",
            "Preliminary recommendations",
            "No credit card required"
          ]
        },
        "credits": {
          "total": 1,
          "duration": { "minutes": 15 },
          "expiresAfterDays": 30
        },
        "pricing": {
          "amount": 0,
          "currency": "USD"
        },
        "metadata": {
          "targetAudience": "new_clients",
          "recommendedFor": "New organizations exploring our services"
        }
      },
      {
        "packageId": "PKG-DISCOVERY-ASSESSMENT",
        "details": {
          "name": "Discovery & Assessment Program",
          "type": "consultation_bundle",
          "category": "assessment",
          "description": "Comprehensive organizational assessment...",
          "features": [
            "4 strategic consultation sessions (90 minutes each)",
            "In-depth organizational capability assessment",
            "Stakeholder interviews and needs analysis",
            "Detailed assessment report with findings",
            "Strategic recommendations and roadmap"
          ]
        },
        "credits": {
          "total": 4,
          "duration": { "minutes": 90 },
          "expiresAfterDays": 60
        },
        "pricing": {
          "amount": 4500.00,
          "currency": "USD"
        }
      }
      // ... 5 more packages
    ],
    "total": 7
  }
}
```

#### 2.2 Purchase a Package (Add Credits to Account)
**Endpoint:** `POST /api/payments/process`

**Payment Flow:**
```javascript
// Client selects "Discovery & Assessment Program" - $4,500
{
  "packageId": "PKG-DISCOVERY-ASSESSMENT",
  "paymentMethod": {
    "type": "card",
    "cardNumber": "4242424242424242",
    "expiryMonth": 12,
    "expiryYear": 2026,
    "cvv": "123"
  }
}
```

**Backend Processing:**
1. Validates package exists and is active
2. Processes payment via Stripe integration
3. Upon successful payment:
   - Adds credits to `Client.consultationCredits.availableCredits`
   - Creates credit tracking record in `Client.consultationCredits.credits[]`
   - Updates lifetime statistics
   - Generates invoice

**Client Record After Purchase:**
```javascript
{
  consultationCredits: {
    availableCredits: 4, // ⭐ 4 credits (90-min sessions) added
    freeTrial: {
      eligible: true,
      used: false
    },
    credits: [
      {
        packageId: "PKG-DISCOVERY-ASSESSMENT",
        packageName: "Discovery & Assessment Program",
        creditsAdded: 4,
        creditsUsed: 0,
        creditsRemaining: 4,
        purchaseDate: Date,
        expiryDate: Date (60 days from purchase),
        status: "active",
        details: {
          sessionDuration: 90, // minutes
          totalValue: 4500.00
        }
      }
    ],
    lifetime: {
      totalConsultations: 0,
      totalSpent: 4500.00,
      totalCreditsPurchased: 4,
      totalCreditsUsed: 0
    }
  }
}
```

---

### Phase 3: Booking a Consultation

#### 3.1 Book Using Existing Credits
**Endpoint:** `POST /api/consultations/book`

**Booking Request:**
```javascript
{
  "consultantId": "675a1b2c3d4e5f6789abcdef", // Optional, can be auto-assigned
  "schedule": {
    "scheduledStart": "2025-12-30T14:00:00Z",
    "scheduledEnd": "2025-12-30T15:30:00Z", // 90 minutes
    "timezone": "America/New_York"
  },
  "purpose": "Organizational capability assessment",
  "notes": "We need help with digital transformation strategy",
  "useCredits": true
}
```

**Backend Validation & Processing:**
1. ✅ Checks client has sufficient credits (availableCredits >= 1)
2. ✅ Validates consultant availability for time slot
3. ✅ Checks no scheduling conflicts
4. ✅ Verifies session duration matches purchased package (90 min)
5. Creates **Consultation** document
6. Reserves 1 credit (doesn't deduct yet - happens on completion)
7. Sends confirmation email to client and consultant
8. Creates calendar events for both parties

**Consultation Record Created:**
```javascript
{
  _id: ObjectId("..."),
  consultationCode: "CONS-20251230-001",
  tenantId: "default",
  organizationId: "000000000000000000000002",

  clientId: ObjectId("..."),
  consultantId: ObjectId("..."), // Assigned consultant

  type: "strategic_planning",
  category: "organizational_assessment",

  schedule: {
    scheduledStart: ISODate("2025-12-30T14:00:00Z"),
    scheduledEnd: ISODate("2025-12-30T15:30:00Z"),
    duration: {
      scheduled: 90 // minutes
    },
    timezone: "America/New_York"
  },

  status: {
    current: "scheduled",
    history: [
      {
        status: "scheduled",
        changedAt: Date,
        changedBy: ObjectId("..."),
        reason: "Initial booking"
      }
    ]
  },

  attendees: {
    primary: {
      client: {
        userId: ObjectId("..."),
        name: "Jane Smith",
        email: "cfo@acmecorp.com",
        confirmed: false
      },
      consultant: {
        userId: ObjectId("..."),
        consultantId: ObjectId("..."),
        name: "John Expert",
        email: "john@insightserenity.com",
        confirmed: false
      }
    },
    additional: []
  },

  billing: {
    billable: true,
    rateType: "included_in_retainer", // Using purchased credits
    creditsUsed: 1,
    packageId: "PKG-DISCOVERY-ASSESSMENT",
    estimatedCost: 1125.00, // $4500 / 4 credits
    invoiced: false
  },

  purpose: "Organizational capability assessment",
  objectives: [],

  notes: {
    client: "We need help with digital transformation strategy",
    consultant: "",
    internal: ""
  }
}
```

#### 3.2 Alternative: Book with Free Trial
**Endpoint:** `POST /api/consultations/book`

**For First-Time Clients:**
```javascript
{
  "useFreeTrialCredit": true,
  "schedule": {
    "scheduledStart": "2025-12-28T10:00:00Z",
    "scheduledEnd": "2025-12-28T10:15:00Z", // 15 minutes
    "timezone": "America/New_York"
  },
  "purpose": "Initial consultation to explore services"
}
```

**Backend Processing:**
1. Validates `client.consultationCredits.freeTrial.eligible === true`
2. Validates session is exactly 15 minutes
3. Creates consultation with `billing.rateType = "complimentary"`
4. Marks `client.consultationCredits.freeTrial.used = true`
5. No payment required

---

### Phase 4: Attending the Consultation

#### 4.1 Pre-Consultation
**24 Hours Before:**
- ✅ Client receives automated reminder email (MISSING - needs implementation)
- ✅ Consultant receives reminder
- ⚠️ Video conference link generated (MISSING - needs Zoom/Teams integration)

**Client Actions Available:**
- View consultation details: `GET /api/consultations/{id}`
- Reschedule: `PATCH /api/consultations/{id}/reschedule`
- Cancel: `POST /api/consultations/{id}/cancel` (with cancellation policy)
- Add preparation notes: `PATCH /api/consultations/{id}`

#### 4.2 During Consultation
**Consultant Starts Session:**
**Endpoint:** `POST /api/consultations/{id}/start`

**What Happens:**
```javascript
// Backend updates consultation
{
  schedule: {
    actualStart: Date (now),
    ...
  },
  status: {
    current: "in_progress",
    history: [
      ...previous,
      {
        status: "in_progress",
        changedAt: Date,
        changedBy: consultantId
      }
    ]
  }
}
```

**Real-Time Features (PARTIALLY IMPLEMENTED):**
- ⚠️ Video conferencing (needs integration)
- ⚠️ Screen sharing (needs integration)
- ⚠️ Real-time notes collaboration (needs implementation)
- ✅ Recording capability (metadata stored, actual recording external)

#### 4.3 Post-Consultation
**Consultant Completes Session:**
**Endpoint:** `POST /api/consultations/{id}/complete`

```javascript
{
  "actualEndTime": "2025-12-30T15:45:00Z", // Ran 15 min over
  "outcomes": {
    "summary": "Identified 3 key areas for digital transformation",
    "keyPoints": [
      "Current infrastructure assessment completed",
      "Technology gaps identified",
      "Recommended phased approach for implementation"
    ]
  },
  "deliverables": [
    {
      "type": "assessment_report",
      "name": "Initial Digital Transformation Assessment",
      "description": "Comprehensive analysis of current state",
      "status": "completed",
      "file": {
        "url": "s3://bucket/reports/assessment-20251230.pdf"
      }
    }
  ],
  "actionItems": [
    {
      "description": "Review technology stack inventory",
      "assignedTo": "client",
      "dueDate": "2026-01-06",
      "priority": "high"
    }
  ],
  "nextSteps": "Schedule follow-up session in 2 weeks"
}
```

**Backend Credit Deduction:**
```javascript
// Calculates actual duration
actualDuration = 105 minutes (scheduled 90, ran 15 min over)

// Credit deduction logic
creditsToDeduct = 1 // One session consumed

// Updates Client record
Client.consultationCredits.availableCredits -= 1 // 4 → 3
Client.consultationCredits.credits[0].creditsUsed += 1
Client.consultationCredits.credits[0].creditsRemaining = 3
Client.consultationCredits.lifetime.totalConsultations += 1
Client.consultationCredits.lifetime.totalCreditsUsed += 1

// Updates Consultation record
Consultation.schedule.actualEnd = Date
Consultation.schedule.duration.actual = 105
Consultation.status.current = "completed"
Consultation.billing.actualCost = 1125.00
```

**Client Now Has:**
- ✅ 3 remaining consultation credits (90 min each)
- ✅ Completed consultation with outcomes documented
- ✅ Deliverables (assessment report)
- ✅ Action items assigned
- ✅ Consultation recording (if enabled)

---

### Phase 5: Feedback & Continuous Engagement

#### 5.1 Submit Feedback
**Endpoint:** `POST /api/consultations/{id}/feedback`

**Client Feedback:**
```javascript
{
  "rating": {
    "overall": 5,
    "expertise": 5,
    "communication": 5,
    "helpfulness": 5,
    "wouldRecommend": true
  },
  "feedback": {
    "strengths": [
      "Consultant was extremely knowledgeable",
      "Provided actionable recommendations",
      "Great communication skills"
    ],
    "improvements": [
      "Would have liked more time for Q&A"
    ]
  },
  "testimonial": {
    "text": "Outstanding consultation! John helped us identify critical gaps in our digital strategy.",
    "allowPublicDisplay": true
  }
}
```

#### 5.2 View Consultation History
**Endpoint:** `GET /api/consultations/me`

**Client Can:**
- View all past and upcoming consultations
- Filter by date range, consultant, status
- Access deliverables and recordings
- Review action items and progress
- Export consultation history

#### 5.3 Manage Credits
**Endpoint:** `GET /api/clients/me/credits`

**Client Dashboard Shows:**
```javascript
{
  "availableCredits": 3,
  "activePackages": [
    {
      "packageName": "Discovery & Assessment Program",
      "creditsRemaining": 3,
      "sessionDuration": 90,
      "expiryDate": "2026-02-28",
      "daysUntilExpiry": 62
    }
  ],
  "freeTrial": {
    "eligible": false,
    "used": true,
    "usedOn": "2025-12-15"
  },
  "lifetimeStats": {
    "totalConsultations": 1,
    "totalSpent": 4500.00,
    "favoriteConsultants": ["John Expert"]
  },
  "expiringCredits": [] // Credits expiring in next 30 days
}
```

---

### Phase 6: Renewal & Expansion

#### 6.1 Purchase Additional Packages
Clients can purchase multiple packages:
- Credits stack in account
- Different packages can have different session durations
- Enterprise clients often purchase quarterly/annual retainers

#### 6.2 Upgrade to Retainer
**Quarterly/Annual Partnerships:**
- Dedicated account manager
- Flexible hour allocation
- Priority scheduling
- Auto-renewal options

---

## Consultant Journey - Complete Flow

### Phase 1: Consultant Onboarding

#### 1.1 Consultant Registration
**Two Registration Paths:**

**Path A - Self-Registration:**
**Endpoint:** `POST /api/v1/auth/register`
```javascript
{
  "email": "expert@consulting.com",
  "password": "SecurePass123!",
  "userType": "consultant",
  "profile": {
    "firstName": "John",
    "lastName": "Expert",
    "title": "Senior Strategic Consultant"
  },
  "professional": {
    "employmentType": "full_time",
    "level": "senior",
    "yearsOfExperience": 15,
    "specialization": "Digital Transformation"
  }
}
```

**Path B - Admin-Initiated:**
**Endpoint:** `POST /api/consultants` (Admin only)
```javascript
{
  "userId": "existing_user_id", // If converting existing user
  "email": "expert@consulting.com",
  "professional": {
    "employmentType": "contract",
    "level": "principal",
    "department": "Strategy Practice",
    "startDate": "2026-01-15"
  },
  "billing": {
    "defaultRate": {
      "amount": 350,
      "currency": "USD",
      "type": "hourly"
    }
  }
}
```

**Consultant Record Created:**
```javascript
{
  _id: ObjectId("..."),
  consultantCode: "CON-JEXPERT-20251227",
  userId: ObjectId("..."),
  tenantId: "default",

  professional: {
    employmentType: "full_time",
    level: "senior",
    department: null,
    startDate: Date,
    yearsOfExperience: 15
  },

  skills: [
    {
      name: "Digital Transformation",
      category: "domain",
      proficiencyLevel: "expert",
      yearsOfExperience: 15,
      verified: false,
      endorsements: []
    },
    {
      name: "Strategic Planning",
      category: "functional",
      proficiencyLevel: "expert",
      yearsOfExperience: 12,
      verified: false
    }
  ],

  certifications: [
    {
      name: "Certified Management Consultant (CMC)",
      issuingOrganization: "Institute of Management Consultants",
      issueDate: Date("2015-06-01"),
      expirationDate: Date("2026-06-01"),
      status: "active",
      credentialId: "CMC-2015-12345"
    }
  ],

  availability: {
    status: "available",
    capacityPercentage: 80,
    hoursPerWeek: 32,
    preferredWorkHours: {
      start: "09:00",
      end: "17:00",
      timezone: "America/New_York"
    },
    blackoutDates: []
  },

  billing: {
    defaultRate: {
      amount: 350,
      currency: "USD",
      type: "hourly"
    },
    costRate: {
      amount: 150,
      currency: "USD"
    }
  },

  performance: {
    rating: {
      overall: 0,
      technical: 0,
      communication: 0,
      delivery: 0
    },
    reviews: [],
    feedback: []
  },

  status: {
    current: "active",
    isActive: true,
    isDeleted: false
  }
}
```

**User Record for Consultant:**
```javascript
{
  _id: ObjectId("..."),
  email: "expert@consulting.com",
  roles: ["consultant", "user"],
  consultantId: ObjectId("..."),

  organizations: [
    {
      organizationId: "000000000000000000000002",
      roles: ["consultant"],
      permissions: [
        "consultations:read",
        "consultations:update",
        "consultations:start",
        "consultations:complete",
        "clients:read",
        "availability:manage",
        "calendar:read",
        "calendar:update"
      ],
      status: "active"
    }
  ]
}
```

---

### Phase 2: Profile & Availability Setup

#### 2.1 Complete Professional Profile
**Endpoint:** `PATCH /api/consultants/{id}`

**Consultant Adds:**
1. **Skills & Expertise:**
```javascript
POST /api/consultants/{id}/skills
{
  "name": "Change Management",
  "category": "functional",
  "proficiencyLevel": "expert",
  "yearsOfExperience": 10
}
```

2. **Certifications:**
```javascript
POST /api/consultants/{id}/certifications
{
  "name": "PMP - Project Management Professional",
  "issuingOrganization": "PMI",
  "issueDate": "2018-03-15",
  "expirationDate": "2027-03-15",
  "credentialId": "PMP-2018-98765"
}
```

3. **Bio & Specialization:**
```javascript
PATCH /api/consultants/{id}
{
  "bio": "Senior consultant with 15+ years helping Fortune 500 companies...",
  "specialization": [
    "Digital Transformation",
    "Organizational Change",
    "Strategic Planning"
  ],
  "languagesSpoken": ["English", "Spanish"],
  "education": [
    {
      "degree": "MBA",
      "field": "Business Strategy",
      "institution": "Harvard Business School",
      "graduationYear": 2010
    }
  ]
}
```

#### 2.2 Set Up Availability
**Endpoint:** `POST /api/consultants/{id}/availability`

**Regular Availability (Weekly Schedule):**
```javascript
{
  "type": "regular",
  "period": {
    "startDate": "2026-01-01",
    "endDate": "2026-12-31"
  },
  "recurrence": {
    "pattern": "weekly",
    "daysOfWeek": [1, 2, 3, 4, 5] // Mon-Fri
  },
  "timeSlots": [
    {
      "startTime": "09:00",
      "endTime": "12:00",
      "timezone": "America/New_York"
    },
    {
      "startTime": "13:00",
      "endTime": "17:00",
      "timezone": "America/New_York"
    }
  ],
  "capacity": {
    "maxSessionsPerDay": 3,
    "bufferBetweenSessions": 30 // minutes
  }
}
```

**Block Out Dates (Vacation, Training):**
```javascript
POST /api/consultants/{id}/availability
{
  "type": "time_off",
  "period": {
    "startDate": "2026-07-01",
    "endDate": "2026-07-14"
  },
  "reason": "Summer vacation",
  "affectsBookings": true
}
```

**Current Availability Status:**
```javascript
// Consultant can update real-time status
PATCH /api/consultants/{id}/availability
{
  "status": "available", // available | partially_available | unavailable | on_leave
  "capacityPercentage": 60, // Currently at 60% capacity
  "availableFrom": "2026-01-15",
  "notes": "Accepting new strategic planning engagements"
}
```

---

### Phase 3: Receiving & Managing Bookings

#### 3.1 View Assigned Consultations
**Endpoint:** `GET /api/consultations/me`

**Consultant Dashboard Query:**
```javascript
GET /api/consultations/me?status=scheduled,confirmed&sortBy=scheduledStart

// Response
{
  "consultations": [
    {
      "consultationCode": "CONS-20251230-001",
      "client": {
        "name": "Acme Corporation",
        "contact": "Jane Smith (CFO)",
        "email": "cfo@acmecorp.com"
      },
      "schedule": {
        "scheduledStart": "2025-12-30T14:00:00Z",
        "scheduledEnd": "2025-12-30T15:30:00Z",
        "duration": { "scheduled": 90 }
      },
      "type": "strategic_planning",
      "purpose": "Organizational capability assessment",
      "status": "scheduled",
      "package": "Discovery & Assessment Program",
      "preparationNotes": "Client is focusing on digital transformation"
    }
    // ... more consultations
  ]
}
```

#### 3.2 View Upcoming Schedule
**Endpoint:** `GET /api/consultations/upcoming`

**Next 7 Days View:**
```javascript
GET /api/consultations/upcoming?days=7

// Returns calendar-style view
{
  "upcomingConsultations": [
    {
      "date": "2025-12-28",
      "consultations": [
        {
          "time": "10:00-10:15",
          "client": "New Client A",
          "type": "free_trial",
          "status": "confirmed"
        }
      ]
    },
    {
      "date": "2025-12-30",
      "consultations": [
        {
          "time": "14:00-15:30",
          "client": "Acme Corporation",
          "type": "strategic_planning",
          "status": "scheduled"
        },
        {
          "time": "16:00-17:00",
          "client": "Beta Industries",
          "type": "executive_coaching",
          "status": "confirmed"
        }
      ]
    }
  ],
  "totalUpcoming": 3
}
```

#### 3.3 Accept or Reschedule Bookings
**Consultant Actions:**

**Confirm Booking:**
```javascript
POST /api/consultations/{id}/confirm
{
  "preparationNotes": "Will review client's current org structure beforehand"
}
```

**Request Reschedule:**
```javascript
POST /api/consultations/{id}/request-reschedule
{
  "reason": "Conflict with another commitment",
  "suggestedSlots": [
    {
      "start": "2025-12-31T10:00:00Z",
      "end": "2025-12-31T11:30:00Z"
    },
    {
      "start": "2026-01-02T14:00:00Z",
      "end": "2026-01-02T15:30:00Z"
    }
  ]
}
```

---

### Phase 4: Preparing for Consultation

#### 4.1 Review Client Background
**Endpoint:** `GET /api/clients/{clientId}`

**Consultant Can Access:**
```javascript
{
  "client": {
    "organizationName": "Acme Corporation",
    "type": "company",
    "demographics": {
      "industry": "Manufacturing",
      "companySize": "500-1000 employees",
      "revenue": "$100M-$500M"
    },
    "consultationHistory": {
      "totalConsultations": 0, // First consultation
      "previousTopics": [],
      "preferredConsultants": []
    }
  }
}
```

#### 4.2 Add Pre-Consultation Notes
**Endpoint:** `PATCH /api/consultations/{id}`

```javascript
{
  "notes": {
    "consultant": "Reviewed client website and annual report. Plan to focus on digital maturity assessment framework."
  },
  "preparationMaterials": [
    {
      "type": "framework",
      "name": "Digital Maturity Assessment Template",
      "url": "s3://bucket/templates/digital-maturity.pdf"
    }
  ]
}
```

---

### Phase 5: Conducting the Consultation

#### 5.1 Start Consultation
**Endpoint:** `POST /api/consultations/{id}/start`

**When Consultant Clicks "Start Session":**
```javascript
POST /api/consultations/{id}/start
{
  "actualStartTime": "2025-12-30T14:02:00Z", // Started 2 min late
  "attendees": {
    "additional": [
      {
        "name": "Michael Johnson",
        "role": "CTO",
        "email": "cto@acmecorp.com"
      }
    ]
  }
}

// Backend updates
{
  status: "in_progress",
  schedule.actualStart: Date,
  attendees.additional: [...] // CTO joined
}
```

#### 5.2 During Session
**Real-Time Capabilities:**
- ⚠️ Video conferencing (needs implementation)
- ✅ Take live notes in system
- ✅ Share screen (external tool)
- ✅ Record session (metadata tracked)
- ⚠️ Collaborative whiteboard (needs implementation)

**Live Notes:**
```javascript
PATCH /api/consultations/{id}
{
  "liveNotes": {
    "keyDiscussionPoints": [
      "Client's current tech stack: legacy ERP, no cloud infrastructure",
      "Pain points: data silos, slow reporting, manual processes",
      "Executive buy-in: CFO and CTO aligned, CEO supportive"
    ],
    "opportunitiesIdentified": [
      "Cloud migration for scalability",
      "Process automation using RPA",
      "Data analytics platform implementation"
    ]
  }
}
```

#### 5.3 Complete Consultation
**Endpoint:** `POST /api/consultations/{id}/complete`

**Comprehensive Completion:**
```javascript
{
  "actualEndTime": "2025-12-30T15:45:00Z",

  "outcomes": {
    "summary": "Completed comprehensive digital transformation assessment. Identified 3 priority areas for immediate action and developed 12-month roadmap.",

    "keyPoints": [
      "Current digital maturity: Level 2 (Developing)",
      "Primary gap: lack of integrated data infrastructure",
      "Quick wins identified: RPA for accounts payable (3-month ROI)",
      "Strategic priority: cloud migration as foundation"
    ],

    "recommendations": [
      "Establish Digital Transformation Steering Committee",
      "Conduct detailed technology audit (next session)",
      "Develop business case for cloud migration",
      "Pilot RPA project in Finance department"
    ]
  },

  "deliverables": [
    {
      "type": "assessment_report",
      "name": "Digital Transformation Readiness Assessment",
      "description": "15-page analysis of current state, gaps, and recommendations",
      "status": "completed",
      "dueDate": "2026-01-03",
      "file": {
        "name": "Acme-Digital-Assessment-20251230.pdf",
        "url": "s3://bucket/reports/acme-assessment.pdf",
        "size": "2.3 MB"
      }
    },
    {
      "type": "roadmap",
      "name": "12-Month Digital Transformation Roadmap",
      "description": "Phased implementation plan with milestones",
      "status": "completed",
      "file": {
        "url": "s3://bucket/roadmaps/acme-roadmap.xlsx"
      }
    }
  ],

  "actionItems": [
    {
      "description": "Share technology inventory spreadsheet",
      "assignedTo": "client",
      "dueDate": "2026-01-06",
      "priority": "high"
    },
    {
      "description": "Schedule follow-up session for technology audit",
      "assignedTo": "consultant",
      "dueDate": "2026-01-02",
      "priority": "high"
    },
    {
      "description": "Prepare RPA vendor comparison",
      "assignedTo": "consultant",
      "dueDate": "2026-01-10",
      "priority": "medium"
    }
  ],

  "nextSteps": "Schedule second session (90 min) for detailed technology audit within 2 weeks. Client to prepare technology inventory and budget parameters.",

  "internalNotes": "Excellent engagement. Client is highly motivated. Strong executive alignment. Recommend assigning to senior consultant for full transformation engagement."
}
```

**System Automatically:**
1. ✅ Deducts 1 credit from client account
2. ✅ Updates consultation status to "completed"
3. ✅ Calculates actual billing (105 minutes vs 90 scheduled)
4. ✅ Updates consultant's performance metrics
5. ✅ Sends completion notification to client
6. ✅ Triggers feedback request to client (24 hours later)
7. ⚠️ Generates invoice if billable hours exceeded package (needs implementation)

---

### Phase 6: Post-Consultation Activities

#### 6.1 Review Client Feedback
**Endpoint:** `GET /api/consultations/{id}/feedback`

**Consultant Sees:**
```javascript
{
  "clientFeedback": {
    "rating": {
      "overall": 5,
      "expertise": 5,
      "communication": 5,
      "helpfulness": 5
    },
    "strengths": [
      "Consultant was extremely knowledgeable",
      "Provided actionable recommendations"
    ],
    "testimonial": "Outstanding consultation! John helped us identify critical gaps..."
  },
  "impactOnProfile": {
    "previousRating": 4.8,
    "newRating": 4.82,
    "totalReviews": 127
  }
}
```

#### 6.2 Track Performance Metrics
**Endpoint:** `GET /api/consultants/me/performance`

**Consultant Dashboard:**
```javascript
{
  "currentMonth": {
    "consultationsCompleted": 18,
    "hoursDelivered": 27,
    "revenueGenerated": 9450,
    "averageRating": 4.9,
    "utilizationRate": 68 // % of available hours booked
  },

  "yearToDate": {
    "consultationsCompleted": 156,
    "hoursDelivered": 234,
    "revenueGenerated": 81900,
    "averageRating": 4.82,
    "clientRetentionRate": 87,
    "topSkillsRequested": [
      "Digital Transformation",
      "Strategic Planning",
      "Change Management"
    ]
  },

  "upcomingBookings": 12,
  "nextAvailableSlot": "2026-01-08T10:00:00Z"
}
```

#### 6.3 Manage Ongoing Client Relationships
**For Enterprise Retainer Clients:**

**Track Retainer Usage:**
```javascript
GET /api/consultants/me/retainers

{
  "activeRetainers": [
    {
      "client": "Global Tech Corp",
      "package": "Annual Strategic Partnership",
      "hoursAllocated": 80,
      "hoursUsed": 23,
      "hoursRemaining": 57,
      "renewalDate": "2026-11-15",
      "nextScheduledSession": "2026-01-05T14:00:00Z"
    }
  ]
}
```

---

### Phase 7: Continuous Improvement

#### 7.1 Update Skills & Certifications
**As Consultant Grows:**
```javascript
POST /api/consultants/{id}/certifications
{
  "name": "Certified Scrum Master",
  "issuingOrganization": "Scrum Alliance",
  "issueDate": "2025-12-15",
  "status": "active"
}

// System updates profile and skill matching
```

#### 7.2 Request Skill Endorsements
**Endpoint:** `POST /api/consultants/{id}/skills/{skillId}/request-endorsement`

**From Satisfied Clients:**
```javascript
{
  "recipientEmail": "cfo@acmecorp.com",
  "skillName": "Digital Transformation",
  "message": "Would appreciate your endorsement for my Digital Transformation expertise based on our recent engagement."
}
```

---

## Consultation Package Portfolio

### Complete Package Offerings

| Package | Price | Credits | Duration | Target Audience | Key Features |
|---------|-------|---------|----------|-----------------|--------------|
| **Free Trial Consultation** | $0 | 1 | 15 min | New clients | Needs assessment, service overview, preliminary recommendations |
| **Discovery & Assessment** | $4,500 | 4 | 90 min | Colleges, Companies | Organizational assessment, strategic roadmap, executive presentation |
| **Strategic Planning** | $12,500 | 8 | 120 min | Companies, Enterprises | Vision alignment, KPI definition, implementation framework, change management |
| **Transformation Partnership** | $24,900 | 12 | 120 min | Enterprises | Full transformation support, process redesign, technology assessment, 6-month support |
| **Quarterly Advisory** | $8,900 | 16 | 60 min | Companies, Enterprises | Flexible hours, strategic advisory on demand, quarterly reviews, auto-renewal |
| **Annual Partnership** | $32,900 | 80 | 60 min | Enterprises | Year-long partnership, dedicated team, executive coaching, 24/7 support |
| **Workshop & Training** | $9,800 | 6 | 180 min | All | Executive workshops, leadership development, training materials, certificates |

### Credit Calculation Examples

**Example 1: Discovery & Assessment Package**
- Price: $4,500
- Credits: 4 sessions × 90 minutes
- Cost per credit: $1,125
- Expiration: 60 days from purchase

**Example 2: Annual Partnership**
- Price: $32,900 (8% discount applied)
- Credits: 80 hours (80 sessions × 60 min)
- Cost per hour: $411.25
- Expiration: 365 days
- Flexibility: Can use as 60-min, 90-min, or 120-min blocks

---

## Technical Architecture

### Technology Stack

**Backend:**
- Node.js + Express.js
- MongoDB with Mongoose ODM
- JWT authentication
- Stripe payment integration
- AWS S3 (file storage)

**Authentication:**
- JWT access tokens (24 hours)
- Refresh tokens (30 days)
- Multi-factor authentication (TOTP, SMS)
- OAuth/SSO support (Google, GitHub, LinkedIn, SAML, OIDC)

**Database:**
- MongoDB Atlas (Production: `insightserenity_customer_dev`)
- 23 models covering all business domains
- Multi-tenant architecture with tenant isolation
- Compound indexes for performance

**Security:**
- Role-based access control (RBAC)
- Token blacklist for logout
- Email verification required
- Password complexity requirements
- Rate limiting per user/IP

---

## What's Currently Implemented

### ✅ Fully Functional Features

#### Authentication & User Management
- ✅ User registration (clients, consultants, admins)
- ✅ Email verification with tokens
- ✅ Password reset/recovery
- ✅ Multi-factor authentication (TOTP, SMS, backup codes)
- ✅ OAuth/SSO integration (Google, GitHub, LinkedIn, SAML, OIDC)
- ✅ Session management with token refresh
- ✅ Token blacklist for secure logout

#### Client Management
- ✅ Client CRUD operations
- ✅ Client profile management
- ✅ Contact management for client organizations
- ✅ Document upload and storage
- ✅ Internal client notes
- ✅ Client demographics and industry tracking
- ✅ Credit balance tracking
- ✅ Free trial eligibility tracking

#### Consultant Management
- ✅ Consultant profile creation and management
- ✅ Skill catalog with proficiency levels
- ✅ Certification management with expiration tracking
- ✅ Availability status (available/unavailable/on leave)
- ✅ Billing rate configuration
- ✅ Performance rating system
- ✅ Consultant assignment to projects/clients

#### Consultation System
- ✅ Consultation booking with credit validation
- ✅ Schedule management (scheduled time, actual time)
- ✅ Consultation status lifecycle (scheduled → in_progress → completed)
- ✅ Start/Complete consultation workflows
- ✅ Deliverables tracking
- ✅ Action items management
- ✅ Feedback and rating collection
- ✅ Consultation history and filtering
- ✅ Upcoming consultations view (7-day window)

#### Package & Billing
- ✅ Consultation package model (7 packages configured)
- ✅ Package types: free trial, pay-per-use, bundles, subscriptions
- ✅ Credit allocation system
- ✅ Credit expiration tracking
- ✅ Stripe integration structure (priceId, productId fields)
- ✅ Package filtering (active, featured, by category)
- ✅ Discount/promotion support

#### API & Security
- ✅ RESTful API endpoints (30+ routes)
- ✅ Request validation middleware
- ✅ Role-based authorization
- ✅ Rate limiting by user and IP
- ✅ Error handling and logging
- ✅ API documentation structure
- ✅ Multi-tenant data isolation

#### Data Models
- ✅ 23 comprehensive database models
- ✅ User model with multi-organization support
- ✅ Client model with consultation credits
- ✅ Consultant model with professional profile
- ✅ Consultation model with full lifecycle
- ✅ Package model with Stripe integration
- ✅ Availability model with recurring schedules
- ✅ All models include audit fields (createdAt, updatedAt, deletedAt)

---

## What's Missing - Critical Gaps

### ❌ Core Business Logic Gaps

#### 1. Automatic Credit Assignment on Registration
**Current State:** Clients register but receive no credits automatically
**Expected:** New clients should automatically receive free trial credit upon email verification
**Impact:** HIGH - Prevents new clients from booking their first consultation

**Implementation Needed:**
```javascript
// In DirectAuthService.registerUser() after email verification
if (userType === 'client') {
  // Auto-assign free trial credit
  await ClientService.assignFreeTrialCredit(clientId);
}
```

#### 2. Automated Credit Deduction on Consultation Completion
**Current State:** Manual credit deduction required
**Expected:** Credits should automatically deduct when consultant marks consultation complete
**Impact:** HIGH - Manual process prone to errors

**Implementation Needed:**
```javascript
// In ConsultationService.completeConsultation()
const creditsUsed = calculateCreditsUsed(consultation.schedule);
await ClientService.deductCredits(clientId, creditsUsed, consultationId);
```

#### 3. Payment Processing Integration
**Current State:** Stripe fields exist in models, but payment flow incomplete
**Expected:** Full payment processing for package purchases
**Impact:** CRITICAL - Cannot sell packages

**Missing Components:**
- Stripe customer creation
- Payment intent creation
- Webhook handling for payment confirmation
- Credit allocation after successful payment
- Invoice generation
- Refund processing

#### 4. Automated Notifications & Reminders
**Current State:** No email/SMS notifications
**Expected:** Automated notifications for all key events
**Impact:** HIGH - Poor user experience without notifications

**Missing Notifications:**
- ❌ Email verification sent (needs email service)
- ❌ Consultation booking confirmation (client & consultant)
- ❌ 24-hour reminder before consultation
- ❌ 1-hour reminder before consultation
- ❌ Consultation started notification
- ❌ Consultation completed with deliverables
- ❌ Feedback request (24 hours after completion)
- ❌ Credit expiration warnings (7 days, 1 day before)
- ❌ Package renewal reminders
- ❌ Consultant assignment notifications

#### 5. Video Conferencing Integration
**Current State:** No video conferencing capability
**Expected:** Integrated video for remote consultations
**Impact:** CRITICAL for B2B platform - Cannot conduct remote consultations

**Integration Options:**
- Zoom API integration
- Microsoft Teams integration
- Google Meet integration
- Custom WebRTC solution

**Implementation Needed:**
- Generate meeting links on booking
- Send meeting links in confirmation emails
- Store recording URLs after completion
- Track attendance

#### 6. Calendar System Integration
**Current State:** Availability model exists but not integrated with bookings
**Expected:** Real-time availability checking and conflict prevention
**Impact:** HIGH - Double bookings possible

**Missing Features:**
- ❌ Real-time availability slot checking
- ❌ Automatic conflict detection
- ❌ Buffer time between consultations
- ❌ Max sessions per day enforcement
- ❌ Blackout date validation
- ❌ Recurring availability patterns
- ❌ Calendar view UI (consultant dashboard)

#### 7. Consultant Auto-Assignment Logic
**Current State:** Manual consultant assignment
**Expected:** Smart matching based on skills, availability, and workload
**Impact:** MEDIUM - Manual process slows booking

**Algorithm Needed:**
```javascript
// Factors to consider:
1. Consultant skills match consultation requirements
2. Availability during requested time slot
3. Current utilization/workload
4. Client preference (previous consultants)
5. Performance ratings
6. Language requirements
7. Timezone compatibility
```

---

### ⚠️ Partially Implemented Features Needing Completion

#### 8. Recurring Consultations
**Current State:** Model supports recurrence patterns, execution logic missing
**Implementation Needed:**
- Recurring consultation creation job
- Recurrence rule validation
- Series management (update one vs. update all)
- Cancellation handling for series

#### 9. Subscription Management
**Current State:** Subscription fields in models, no subscription lifecycle
**Implementation Needed:**
- Subscription creation on package purchase
- Auto-renewal processing
- Subscription cancellation workflow
- Prorated billing for mid-cycle changes
- Subscription status tracking (active, past_due, canceled)

#### 10. Revenue Recognition & Reporting
**Current State:** Basic billing tracking, no revenue reporting
**Implementation Needed:**
- Revenue recognition when consultations delivered
- Deferred revenue tracking for prepaid packages
- Consultant compensation calculation
- Financial dashboards
- Monthly/quarterly revenue reports

#### 11. Advanced Search & Filtering
**Current State:** Basic filtering exists
**Enhancements Needed:**
- Search consultants by skills, certifications, industry expertise
- Filter consultations by date range, status, consultant, client
- Search clients by industry, size, package type
- Full-text search across consultations, notes, deliverables

#### 12. File Upload & Document Management
**Current State:** Model supports documents, upload handling incomplete
**Implementation Needed:**
- AWS S3 integration for file uploads
- Pre-signed URL generation for secure downloads
- File type validation
- Virus scanning for uploaded files
- Document versioning
- Access control per document

---

### 📊 Analytics & Reporting Gaps

#### 13. Consultant Performance Dashboards
**Missing Dashboards:**
- Utilization rate over time
- Revenue per consultant
- Average ratings trend
- Client retention by consultant
- Top performing consultants
- Skill demand analysis

#### 14. Client Analytics
**Missing Analytics:**
- Credit usage patterns
- Package conversion rates (free trial → paid)
- Customer lifetime value (CLV)
- Churn prediction
- Consultation frequency trends
- ROI analysis per client

#### 15. Business Metrics
**Missing Reports:**
- Monthly Recurring Revenue (MRR)
- Annual Recurring Revenue (ARR)
- Customer Acquisition Cost (CAC)
- Net Promoter Score (NPS)
- Gross margin per package
- Consultant capacity planning

---

### 🔒 Security & Compliance Gaps

#### 16. Data Privacy & GDPR Compliance
**Missing Features:**
- Data export functionality (client requests their data)
- Right to be forgotten (delete all user data)
- Consent management
- Data retention policies
- Privacy policy acceptance tracking
- Cookie consent management

#### 17. Audit Logging
**Current State:** Basic timestamps, no comprehensive audit trail
**Needed:**
- Log all data modifications (who, what, when)
- IP address tracking
- Failed login attempts
- Permission changes
- Data export events
- Sensitive data access logs

#### 18. Advanced Security
**Missing:**
- IP whitelisting for admin access
- Anomaly detection (unusual login patterns)
- Brute force protection
- CAPTCHA on registration/login
- Security headers (CSP, HSTS, etc.)
- Penetration testing results

---

### 💼 Enterprise Features Missing

#### 19. Multi-Organization Management
**Current State:** Multi-tenant fields exist, management UI missing
**Needed:**
- Organization switching for consultants serving multiple orgs
- Cross-organization reporting
- Organization-level permissions
- White-label branding per organization
- Custom domain support

#### 20. Advanced Workflow Automation
**Missing Workflows:**
- Auto-escalation if consultant doesn't confirm booking within 24h
- Auto-cancellation if client doesn't confirm 48h before
- Auto-rescheduling suggestions when consultant cancels
- Waiting list management for popular consultants
- Smart follow-up consultation suggestions

#### 21. Integration Ecosystem
**No Integrations With:**
- CRM systems (Salesforce, HubSpot)
- Calendar providers (Google Calendar, Outlook)
- Communication tools (Slack, Teams)
- Project management (Asana, Jira)
- Accounting software (QuickBooks, Xero)
- Email marketing (Mailchimp, SendGrid)

---

### 📱 User Interface & Experience Gaps

#### 22. Client Dashboard
**Current State:** API exists, no frontend
**Missing UI:**
- Credit balance display with expiration dates
- Upcoming consultations calendar view
- Past consultations with deliverables
- Quick booking interface
- Feedback submission forms
- Invoice and payment history

#### 23. Consultant Dashboard
**Current State:** API exists, no frontend
**Missing UI:**
- Weekly schedule calendar
- Client management interface
- Performance metrics visualization
- Availability management calendar
- Earnings and revenue tracking
- Client feedback review

#### 24. Admin Dashboard
**Missing Entirely:**
- Platform analytics overview
- User management (approve consultants)
- Package management interface
- Revenue dashboards
- System health monitoring
- Support ticket system

---

## Implementation Roadmap for Professional B2B Platform

### Phase 1: Critical MVP Completion (Weeks 1-4)

#### Week 1: Payment & Credit System
**Priority: CRITICAL**

1. **Stripe Payment Integration**
   ```
   Files to Create/Modify:
   - /services/payment-service.js - Complete Stripe integration
   - /controllers/payment-controller.js - Add processPayment endpoint
   - /routes/payment-routes.js - Payment routes

   Tasks:
   - [ ] Create Stripe customer on client registration
   - [ ] Implement payment intent creation
   - [ ] Handle Stripe webhooks (payment succeeded/failed)
   - [ ] Auto-assign credits after successful payment
   - [ ] Generate invoice PDF
   - [ ] Send payment confirmation email
   ```

2. **Auto Credit Assignment**
   ```
   Files to Modify:
   - /services/auth/direct-auth-service.js
   - /services/client-service.js

   Tasks:
   - [ ] Auto-assign free trial on email verification
   - [ ] Auto-assign purchased credits on payment success
   - [ ] Implement credit expiration job (daily cron)
   - [ ] Send credit expiration warnings
   ```

3. **Auto Credit Deduction**
   ```
   Files to Modify:
   - /services/consultation-service.js (completeConsultation method)

   Tasks:
   - [ ] Calculate credits used based on actual duration
   - [ ] Deduct from client.consultationCredits.availableCredits
   - [ ] Update package credit tracking
   - [ ] Handle insufficient credits scenario
   - [ ] Log credit transaction history
   ```

#### Week 2: Notification System
**Priority: CRITICAL**

```
Files to Create:
- /services/notification-service.js
- /services/email-service.js (SendGrid/AWS SES)
- /services/sms-service.js (Twilio - optional)
- /jobs/notification-scheduler.js
- /templates/emails/ (HTML email templates)

Email Templates Needed:
1. welcome-email.html
2. email-verification.html
3. consultation-booking-confirmation.html
4. consultation-reminder-24h.html
5. consultation-reminder-1h.html
6. consultation-completed.html
7. feedback-request.html
8. credit-expiration-warning.html
9. package-renewal-reminder.html

Tasks:
- [ ] Set up SendGrid/AWS SES
- [ ] Create email service wrapper
- [ ] Design HTML email templates
- [ ] Implement notification scheduler (node-cron)
- [ ] Add notification triggers to all key events
- [ ] Test email delivery
```

#### Week 3: Calendar & Availability System
**Priority: HIGH**

```
Files to Modify:
- /services/consultant-service.js
- /services/consultation-service.js
- /controllers/consultant-controller.js

Tasks:
- [ ] Implement real-time availability checking
- [ ] Add conflict detection on booking
- [ ] Enforce buffer time between sessions
- [ ] Validate against blackout dates
- [ ] Implement max sessions per day check
- [ ] Create availability slot generation
- [ ] Add recurring availability pattern support
```

#### Week 4: Video Conferencing Integration
**Priority: CRITICAL**

```
Integration Choice: Zoom API (recommended for B2B)

Files to Create:
- /services/video-conference-service.js
- /config/zoom-config.js

Tasks:
- [ ] Set up Zoom OAuth app
- [ ] Implement Zoom meeting creation
- [ ] Generate meeting links on booking
- [ ] Include meeting link in confirmation emails
- [ ] Handle meeting updates/cancellations
- [ ] Store recording URLs after consultation
- [ ] Download and archive recordings (optional)
```

---

### Phase 2: Core Features Enhancement (Weeks 5-8)

#### Week 5: Consultant Auto-Assignment
```
Files to Create:
- /services/consultant-matching-service.js
- /algorithms/consultant-matcher.js

Matching Algorithm:
1. Filter consultants by required skills
2. Check availability for requested time slot
3. Calculate utilization score (prefer underutilized)
4. Consider client preference (previous consultants)
5. Factor in performance ratings
6. Check timezone compatibility
7. Rank and select best match

Tasks:
- [ ] Implement skill matching algorithm
- [ ] Build availability matrix
- [ ] Create scoring system
- [ ] Add manual override option
- [ ] Log assignment decisions for analytics
```

#### Week 6: Advanced Scheduling
```
Tasks:
- [ ] Implement recurring consultation creation
- [ ] Add series management (update one vs. all)
- [ ] Build waiting list for fully booked consultants
- [ ] Add auto-rescheduling suggestions
- [ ] Implement consultation reminders (in-app)
- [ ] Create calendar sync (Google/Outlook)
```

#### Week 7: File Management & S3 Integration
```
Files to Create:
- /services/storage-service.js
- /middleware/file-upload.js
- /config/aws-config.js

Tasks:
- [ ] Set up AWS S3 bucket
- [ ] Implement file upload with multer
- [ ] Generate pre-signed URLs for downloads
- [ ] Add file type validation
- [ ] Implement virus scanning (ClamAV)
- [ ] Create document versioning
- [ ] Add access control per document
```

#### Week 8: Subscription Management
```
Files to Modify:
- /services/subscription-service.js
- /jobs/subscription-renewal.js

Tasks:
- [ ] Implement subscription creation
- [ ] Add auto-renewal processing (monthly cron)
- [ ] Handle subscription cancellations
- [ ] Implement prorated billing
- [ ] Add subscription status lifecycle
- [ ] Send renewal reminders (7 days before)
- [ ] Handle failed payment retries
```

---

### Phase 3: Analytics & Reporting (Weeks 9-10)

#### Week 9: Performance Dashboards
```
Files to Create:
- /services/analytics-service.js
- /controllers/analytics-controller.js
- /routes/analytics-routes.js

Dashboards to Build:
1. Consultant Performance
   - Utilization rate
   - Revenue generated
   - Average ratings
   - Client retention

2. Client Analytics
   - Credit usage patterns
   - Package conversion rates
   - Lifetime value
   - Consultation frequency

3. Business Metrics
   - MRR/ARR
   - Revenue by package
   - Consultant capacity
   - Customer acquisition cost
```

#### Week 10: Reporting & Export
```
Tasks:
- [ ] Build PDF report generation (puppeteer)
- [ ] Create CSV export functionality
- [ ] Implement scheduled reports (weekly/monthly)
- [ ] Add financial reports for accounting
- [ ] Create consultant compensation reports
- [ ] Build client usage reports
```

---

### Phase 4: Enterprise Features (Weeks 11-12)

#### Week 11: Advanced Security & Compliance
```
Tasks:
- [ ] Implement comprehensive audit logging
- [ ] Add data export for GDPR compliance
- [ ] Create right to be forgotten workflow
- [ ] Add consent management
- [ ] Implement IP whitelisting
- [ ] Add anomaly detection
- [ ] Enable 2FA enforcement for admins
- [ ] Set up security headers
```

#### Week 12: Integration Ecosystem
```
Priority Integrations:
1. Google Calendar / Outlook Calendar
2. Slack notifications
3. Salesforce CRM (for enterprise clients)
4. QuickBooks (accounting)
5. Zoom (already in Phase 1)

Tasks:
- [ ] Build integration framework
- [ ] Create webhook receiver
- [ ] Implement OAuth flows
- [ ] Add integration settings UI
- [ ] Test each integration end-to-end
```

---

### Phase 5: User Experience & Polish (Weeks 13-16)

#### Weeks 13-14: Frontend Dashboards
```
Client Dashboard Features:
- [ ] Credit balance widget with expiration
- [ ] Upcoming consultations calendar
- [ ] Quick booking interface
- [ ] Past consultations with deliverables
- [ ] Feedback submission
- [ ] Invoice history

Consultant Dashboard Features:
- [ ] Weekly schedule calendar
- [ ] Client management
- [ ] Performance metrics charts
- [ ] Availability management
- [ ] Earnings tracking
- [ ] Feedback inbox
```

#### Weeks 15-16: Admin Dashboard
```
Features:
- [ ] Platform overview dashboard
- [ ] User management (approve/suspend)
- [ ] Package management CRUD
- [ ] Revenue analytics
- [ ] System health monitoring
- [ ] Support ticket system
- [ ] Consultant approval workflow
- [ ] Audit log viewer
```

---

### Post-Launch: Continuous Improvement

#### Advanced Features (Future Phases)
1. **AI-Powered Features**
   - Consultation summary generation (GPT-4)
   - Smart scheduling suggestions
   - Churn prediction
   - Sentiment analysis on feedback

2. **Mobile Applications**
   - iOS app for clients and consultants
   - Android app
   - Push notifications
   - Offline mode for consultants

3. **Marketplace Features**
   - Public consultant profiles
   - Client reviews and ratings
   - Consultant ranking/leaderboard
   - Featured consultants

4. **Advanced Collaboration**
   - Real-time collaborative whiteboard
   - Shared document editing during consultations
   - Screen annotation tools
   - Multi-party consultations (3+ attendees)

---

## Database Schema Reference

### Core Collections

#### 1. users
```javascript
{
  _id: ObjectId,
  email: String (unique, indexed),
  password: String (hashed),
  roles: [String], // ['client', 'consultant', 'admin', 'user']

  // References
  clientId: ObjectId (ref: Client),
  consultantId: ObjectId (ref: Consultant),

  // Profile
  profile: {
    firstName: String,
    lastName: String,
    displayName: String,
    title: String,
    avatar: String,
    bio: String
  },

  // Multi-org support
  organizations: [{
    organizationId: ObjectId,
    roles: [String],
    permissions: [String],
    status: String,
    joinedAt: Date
  }],

  // Status
  accountStatus: {
    status: String, // active | suspended | pending_verification
    activatedAt: Date,
    suspendedAt: Date,
    suspensionReason: String
  },

  // Verification
  verification: {
    email: {
      verified: Boolean,
      verificationToken: String,
      verifiedAt: Date,
      expiresAt: Date
    }
  },

  // Security
  security: {
    mfa: {
      enabled: Boolean,
      methods: [String], // ['totp', 'sms', 'backup_codes']
      totpSecret: String,
      backupCodes: [String]
    },
    lastPasswordChange: Date,
    passwordResetToken: String,
    passwordResetExpires: Date
  },

  // Timestamps
  createdAt: Date,
  updatedAt: Date,
  lastLoginAt: Date
}
```

#### 2. clients
```javascript
{
  _id: ObjectId,
  userId: ObjectId (ref: User),
  clientCode: String (unique, indexed),
  tenantId: String,

  // Organization Info
  organizationName: String,
  type: String, // college | company | enterprise | individual

  // Demographics
  demographics: {
    industry: String,
    companySize: String,
    revenue: String,
    numberOfEmployees: Number,
    yearFounded: Number,
    website: String
  },

  // Contact
  contactInformation: {
    primaryEmail: String,
    secondaryEmail: String,
    phone: String,
    fax: String,
    addresses: [{
      type: String, // billing | shipping | main
      street1: String,
      street2: String,
      city: String,
      state: String,
      postalCode: String,
      country: String
    }]
  },

  // Consultation Credits (CRITICAL)
  consultationCredits: {
    availableCredits: Number,
    freeTrial: {
      eligible: Boolean,
      used: Boolean,
      consultationId: ObjectId,
      usedAt: Date,
      expiresAt: Date
    },
    credits: [{
      packageId: String,
      packageName: String,
      creditsAdded: Number,
      creditsUsed: Number,
      creditsRemaining: Number,
      purchaseDate: Date,
      expiryDate: Date,
      status: String, // active | expired | depleted
      details: Object
    }],
    activeSubscriptions: [{
      subscriptionId: ObjectId,
      stripeSubscriptionId: String,
      packageId: String,
      status: String,
      startDate: Date,
      nextBillingDate: Date,
      creditsPerPeriod: Number
    }],
    lifetime: {
      totalConsultations: Number,
      totalSpent: Number,
      totalCreditsPurchased: Number,
      totalCreditsUsed: Number
    }
  },

  // Status
  status: {
    current: String, // active | inactive | suspended
    isActive: Boolean,
    isDeleted: Boolean
  },

  // Timestamps
  createdAt: Date,
  updatedAt: Date
}
```

#### 3. consultants
```javascript
{
  _id: ObjectId,
  consultantCode: String (unique, indexed),
  userId: ObjectId (ref: User),
  tenantId: String,

  // Professional Info
  professional: {
    employmentType: String, // full_time | part_time | contract
    level: String, // junior | mid | senior | principal
    department: ObjectId,
    startDate: Date,
    yearsOfExperience: Number,
    specialization: [String]
  },

  // Skills
  skills: [{
    name: String,
    category: String, // technical | functional | domain
    proficiencyLevel: String, // beginner | intermediate | expert
    yearsOfExperience: Number,
    verified: Boolean,
    endorsements: [{
      userId: ObjectId,
      endorsedAt: Date,
      comment: String
    }]
  }],

  // Certifications
  certifications: [{
    name: String,
    issuingOrganization: String,
    issueDate: Date,
    expirationDate: Date,
    credentialId: String,
    status: String // active | expired
  }],

  // Availability
  availability: {
    status: String, // available | partially_available | unavailable | on_leave
    capacityPercentage: Number,
    hoursPerWeek: Number,
    preferredWorkHours: {
      start: String, // "09:00"
      end: String, // "17:00"
      timezone: String
    },
    blackoutDates: [{
      startDate: Date,
      endDate: Date,
      reason: String,
      recurring: Boolean
    }]
  },

  // Billing
  billing: {
    defaultRate: {
      amount: Number,
      currency: String,
      type: String // hourly | daily | fixed
    },
    costRate: {
      amount: Number,
      currency: String
    }
  },

  // Performance
  performance: {
    rating: {
      overall: Number,
      technical: Number,
      communication: Number,
      delivery: Number
    },
    reviews: [{
      consultationId: ObjectId,
      rating: Number,
      feedback: String,
      reviewDate: Date
    }],
    totalConsultations: Number,
    totalRevenueGenerated: Number
  },

  // Status
  status: {
    current: String, // active | inactive | on_leave
    isActive: Boolean,
    isDeleted: Boolean
  },

  // Timestamps
  createdAt: Date,
  updatedAt: Date
}
```

#### 4. consultations
```javascript
{
  _id: ObjectId,
  consultationCode: String (unique, indexed),
  tenantId: String,
  organizationId: ObjectId,

  // Participants
  clientId: ObjectId (ref: Client, indexed),
  consultantId: ObjectId (ref: Consultant, indexed),

  // Type
  type: String, // strategic_planning | executive_coaching | assessment
  category: String,

  // Schedule
  schedule: {
    scheduledStart: Date (indexed),
    scheduledEnd: Date,
    actualStart: Date,
    actualEnd: Date,
    duration: {
      scheduled: Number, // minutes
      actual: Number
    },
    timezone: String,
    isRecurring: Boolean,
    recurrence: {
      pattern: String, // daily | weekly | monthly
      interval: Number,
      daysOfWeek: [Number],
      endDate: Date
    }
  },

  // Status
  status: {
    current: String, // scheduled | confirmed | in_progress | completed | cancelled
    history: [{
      status: String,
      changedAt: Date,
      changedBy: ObjectId,
      reason: String
    }]
  },

  // Attendees
  attendees: {
    primary: {
      client: {
        userId: ObjectId,
        name: String,
        email: String,
        confirmed: Boolean
      },
      consultant: {
        userId: ObjectId,
        consultantId: ObjectId,
        name: String,
        email: String,
        confirmed: Boolean
      }
    },
    additional: [{
      userId: ObjectId,
      name: String,
      email: String,
      role: String
    }]
  },

  // Content
  purpose: String,
  objectives: [String],
  agenda: [{
    item: String,
    duration: Number,
    completed: Boolean
  }],

  // Outcomes
  outcomes: {
    summary: String,
    keyPoints: [String],
    recommendations: [String],
    decisionsM ade: [String]
  },

  // Deliverables
  deliverables: [{
    type: String,
    name: String,
    description: String,
    status: String,
    dueDate: Date,
    completedDate: Date,
    file: {
      name: String,
      url: String,
      size: Number
    }
  }],

  // Action Items
  actionItems: [{
    description: String,
    assignedTo: String, // client | consultant
    dueDate: Date,
    priority: String,
    status: String,
    completedDate: Date
  }],

  // Feedback
  feedback: {
    client: {
      rating: {
        overall: Number,
        expertise: Number,
        communication: Number,
        helpfulness: Number
      },
      strengths: [String],
      improvements: [String],
      testimonial: {
        text: String,
        allowPublicDisplay: Boolean
      },
      submittedAt: Date
    },
    consultant: {
      rating: Number,
      feedback: String,
      submittedAt: Date
    }
  },

  // Billing
  billing: {
    billable: Boolean,
    rateType: String, // hourly | flat_fee | included_in_retainer | complimentary
    rate: {
      amount: Number,
      currency: String
    },
    creditsUsed: Number,
    packageId: String,
    estimatedCost: Number,
    actualCost: Number,
    invoiced: Boolean,
    invoiceId: ObjectId
  },

  // Notes
  notes: {
    client: String,
    consultant: String,
    internal: String
  },

  // Recording
  recording: {
    enabled: Boolean,
    url: String,
    duration: Number,
    availableUntil: Date
  },

  // Video Conference
  videoConference: {
    provider: String, // zoom | teams | meet
    meetingId: String,
    meetingUrl: String,
    password: String
  },

  // Timestamps
  createdAt: Date,
  updatedAt: Date,
  deletedAt: Date
}
```

#### 5. consultationpackages
```javascript
{
  _id: ObjectId,
  packageId: String (unique, indexed),
  tenantId: String,
  organizationId: ObjectId,

  // Package Details
  details: {
    name: String,
    type: String, // free_trial | pay_per_use | consultation_bundle | subscription
    sku: String,
    category: String,
    description: String,
    features: [String],
    targetAudience: String
  },

  // Credits
  credits: {
    total: Number,
    unlimited: Boolean,
    duration: {
      minutes: Number,
      hours: Number
    },
    expiresAfterDays: Number,
    rollover: {
      allowed: Boolean,
      maxRollover: Number
    }
  },

  // Pricing
  pricing: {
    amount: Number,
    currency: String,
    pricePerCredit: Number,
    discount: {
      percentage: Number,
      amount: Number,
      reason: String
    },
    originalPrice: Number
  },

  // Availability
  availability: {
    status: String, // active | inactive | archived
    startDate: Date,
    endDate: Date,
    featuredPackage: Boolean,
    displayOrder: Number,
    maxPurchasesPerClient: Number
  },

  // Subscription (if type = subscription)
  subscription: {
    billingCycle: String, // monthly | quarterly | annual
    autoRenew: Boolean,
    trialPeriodDays: Number,
    cancellationPolicy: String
  },

  // Stripe Integration
  stripe: {
    productId: String,
    priceId: String,
    priceIds: {
      monthly: String,
      quarterly: String,
      annual: String
    }
  },

  // Metadata
  metadata: {
    targetAudience: String,
    deliverables: [String],
    recommendedFor: String,
    eligibility: {
      oneTimeOnly: Boolean,
      requiresVerification: Boolean,
      autoAssignOnRegistration: Boolean
    },
    isRecurring: Boolean,
    billingCycle: String,
    maxParticipants: Number
  },

  // Marketing
  marketing: {
    badge: String, // POPULAR | BEST VALUE | NEW
    testimonials: [{
      clientName: String,
      text: String,
      rating: Number
    }],
    images: [String]
  },

  // Statistics
  statistics: {
    totalPurchases: Number,
    totalRevenue: Number,
    activeSubscriptions: Number,
    averageRating: Number
  },

  // Timestamps
  createdAt: Date,
  updatedAt: Date,
  deletedAt: Date
}
```

---

## API Endpoints Reference

### Authentication Endpoints
```
POST   /api/v1/auth/register              - Register new user
POST   /api/v1/auth/login                 - Login user
POST   /api/v1/auth/logout                - Logout user
POST   /api/v1/auth/refresh-token         - Refresh access token
POST   /api/v1/auth/verify-email          - Verify email address
POST   /api/v1/auth/resend-verification   - Resend verification email
POST   /api/v1/auth/forgot-password       - Request password reset
POST   /api/v1/auth/reset-password        - Reset password
POST   /api/v1/auth/change-password       - Change password (authenticated)

MFA:
POST   /api/v1/auth/mfa/setup/totp        - Setup TOTP MFA
POST   /api/v1/auth/mfa/setup/sms         - Setup SMS MFA
POST   /api/v1/auth/mfa/verify            - Verify MFA code
POST   /api/v1/auth/mfa/disable           - Disable MFA
GET    /api/v1/auth/mfa/backup-codes      - Get backup codes

OAuth:
GET    /api/v1/auth/oauth/google          - Initiate Google OAuth
GET    /api/v1/auth/oauth/google/callback - Google OAuth callback
GET    /api/v1/auth/oauth/github          - Initiate GitHub OAuth
GET    /api/v1/auth/oauth/linkedin        - Initiate LinkedIn OAuth
```

### Client Endpoints
```
POST   /api/clients                       - Create client
GET    /api/clients                       - List clients (paginated)
GET    /api/clients/:id                   - Get client details
PATCH  /api/clients/:id                   - Update client
DELETE /api/clients/:id                   - Delete client (soft delete)

GET    /api/clients/me                    - Get current user's client profile
GET    /api/clients/me/credits            - Get credit balance and history
GET    /api/clients/:id/consultations     - Get client's consultations
GET    /api/clients/:id/invoices          - Get client's invoices

POST   /api/clients/:id/contacts          - Add contact to client
PATCH  /api/clients/:id/contacts/:contactId - Update contact
DELETE /api/clients/:id/contacts/:contactId - Delete contact

POST   /api/clients/:id/documents         - Upload client document
GET    /api/clients/:id/documents         - List client documents
DELETE /api/clients/:id/documents/:docId  - Delete document

POST   /api/clients/:id/notes             - Add internal note
GET    /api/clients/:id/notes             - Get client notes
```

### Consultant Endpoints
```
POST   /api/consultants                   - Create consultant (admin only)
GET    /api/consultants                   - List consultants
GET    /api/consultants/:id               - Get consultant profile
PATCH  /api/consultants/:id               - Update consultant
DELETE /api/consultants/:id               - Delete consultant

GET    /api/consultants/me                - Get current consultant profile
GET    /api/consultants/me/performance    - Get performance metrics
GET    /api/consultants/me/earnings       - Get earnings report

Availability:
GET    /api/consultants/:id/availability  - Get availability
POST   /api/consultants/:id/availability  - Add availability slot
PATCH  /api/consultants/:id/availability  - Update availability status
DELETE /api/consultants/:id/availability/:slotId - Delete availability

Skills:
POST   /api/consultants/:id/skills        - Add skill
PATCH  /api/consultants/:id/skills/:skillId - Update skill
DELETE /api/consultants/:id/skills/:skillId - Delete skill
POST   /api/consultants/:id/skills/:skillId/endorse - Endorse skill

Certifications:
POST   /api/consultants/:id/certifications - Add certification
PATCH  /api/consultants/:id/certifications/:certId - Update certification
DELETE /api/consultants/:id/certifications/:certId - Delete certification

Assignments:
POST   /api/consultants/:id/assignments   - Assign to project
GET    /api/consultants/:id/assignments   - Get assignments
PATCH  /api/consultants/:id/assignments/:assignmentId - Update assignment
```

### Consultation Endpoints
```
POST   /api/consultations/book            - Book consultation (with credits)
POST   /api/consultations/book-with-package - Book + purchase package
POST   /api/consultations                 - Create consultation (admin/consultant)
GET    /api/consultations                 - List all consultations (admin)
GET    /api/consultations/me              - Get my consultations
GET    /api/consultations/upcoming        - Get upcoming consultations (7 days)
GET    /api/consultations/:id             - Get consultation details
PATCH  /api/consultations/:id             - Update consultation
DELETE /api/consultations/:id             - Delete consultation

Actions:
POST   /api/consultations/:id/confirm     - Confirm consultation
POST   /api/consultations/:id/start       - Start consultation
POST   /api/consultations/:id/complete    - Complete consultation
POST   /api/consultations/:id/cancel      - Cancel consultation
POST   /api/consultations/:id/reschedule  - Reschedule consultation

Feedback:
POST   /api/consultations/:id/feedback    - Submit feedback
GET    /api/consultations/:id/feedback    - Get feedback

Deliverables:
POST   /api/consultations/:id/deliverables - Add deliverable
PATCH  /api/consultations/:id/deliverables/:deliverableId - Update deliverable
GET    /api/consultations/:id/deliverables - List deliverables

Action Items:
POST   /api/consultations/:id/action-items - Add action item
PATCH  /api/consultations/:id/action-items/:itemId - Update action item
POST   /api/consultations/:id/action-items/:itemId/complete - Mark complete

Metrics:
GET    /api/consultations/metrics         - Get consultation metrics
GET    /api/consultations/analytics       - Get analytics
```

### Package Endpoints
```
GET    /api/consultations/packages        - List active packages (public)
GET    /api/consultations/packages/:id    - Get package details
POST   /api/consultations/packages        - Create package (admin only)
PATCH  /api/consultations/packages/:id    - Update package (admin only)
DELETE /api/consultations/packages/:id    - Delete package (admin only)

GET    /api/consultations/packages/featured - Get featured packages
GET    /api/consultations/packages/free-trial - Get free trial package
```

### Payment & Billing Endpoints
```
POST   /api/payments/process              - Process payment
POST   /api/payments/create-intent        - Create payment intent (Stripe)
POST   /api/payments/subscribe            - Subscribe to package
PATCH  /api/payments/subscriptions/:id    - Update subscription
POST   /api/payments/subscriptions/:id/cancel - Cancel subscription

GET    /api/payments/invoices             - List invoices
GET    /api/payments/invoices/:id         - Get invoice
GET    /api/payments/invoices/:id/pdf     - Download invoice PDF

POST   /api/payments/webhooks/stripe      - Stripe webhook handler
```

### User Management Endpoints
```
GET    /api/users/me                      - Get current user
PATCH  /api/users/me                      - Update profile
DELETE /api/users/me                      - Delete account

PATCH  /api/users/me/password             - Change password
PATCH  /api/users/me/email                - Change email
PATCH  /api/users/me/preferences          - Update preferences

GET    /api/users/me/notifications        - Get notifications
PATCH  /api/users/me/notifications/:id    - Mark notification read
POST   /api/users/me/notifications/mark-all-read - Mark all read
```

### Analytics Endpoints (Admin)
```
GET    /api/analytics/dashboard           - Platform dashboard
GET    /api/analytics/revenue             - Revenue analytics
GET    /api/analytics/consultants         - Consultant analytics
GET    /api/analytics/clients             - Client analytics
GET    /api/analytics/packages            - Package performance
GET    /api/analytics/utilization         - Consultant utilization
```

---

## Summary

This documentation provides a complete overview of the InsightSerenity B2B Consultation Platform, including:

### ✅ What Exists:
- Comprehensive user authentication system
- Client and consultant management
- Consultation booking and lifecycle
- Package system with 7 professional offerings
- Credit-based consumption model
- Feedback and rating system
- Multi-tenant architecture
- Role-based access control

### ❌ Critical Gaps:
1. Payment processing (Stripe integration incomplete)
2. Automated notifications (email/SMS)
3. Video conferencing integration
4. Calendar system integration
5. Auto credit assignment/deduction
6. Consultant auto-assignment
7. Dashboards (client, consultant, admin)
8. File upload/document management
9. Analytics and reporting

### 📋 16-Week Implementation Roadmap:
- **Weeks 1-4:** Critical MVP (payments, notifications, calendar, video)
- **Weeks 5-8:** Core enhancements (scheduling, subscriptions, files)
- **Weeks 9-10:** Analytics and reporting
- **Weeks 11-12:** Enterprise features (security, integrations)
- **Weeks 13-16:** User experience and dashboards

### Next Steps:
Follow the phased implementation roadmap to transform this into a fully functional professional B2B consultation platform capable of serving colleges, companies, and enterprises at scale.

---

**For Questions or Implementation Support:**
Refer to code in `/servers/customer-services/` and database models in `/shared/lib/database/models/customer-services/`
