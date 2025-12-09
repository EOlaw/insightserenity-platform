# Consultant Management Routes - Quick Reference Guide

## Route Distribution Summary

This guide provides clear tables showing which routes belong in customer-services (consultant-facing) versus admin-server (administrative). Use this as your implementation checklist.

---

## Consultant Routes (consultant-routes.js)

### Routes for Customer-Services Backend ✅

| Route | Method | Access Type | Purpose |
|-------|--------|-------------|---------|
| `/me` | GET | Self-Service | Get own consultant profile |
| `/me` | PUT | Self-Service | Update own consultant profile |
| `/` | GET | Peer View | List/search all consultants (read-only) |
| `/search` | GET | Peer View | Search consultants by text |
| `/available` | GET | Peer View | Find available consultants |
| `/search-by-skills` | POST | Peer View | Search consultants by skills |
| `/:consultantId` | GET | Peer View | View specific consultant profile |
| `/user/:userId` | GET | Peer View | Get consultant by user ID |
| `/:consultantId/direct-reports` | GET | Peer View | View team structure |
| `/:consultantId/availability` | PUT | Self-Service | Update own availability preferences |
| `/:consultantId/blackout-dates` | POST | Self-Service | Add own blackout dates |
| `/:consultantId/skills` | POST | Self-Service | Add own skill |
| `/:consultantId/skills/:skillName` | PUT | Self-Service | Update own skill |
| `/:consultantId/skills/:skillName` | DELETE | Self-Service | Remove own skill |
| `/:consultantId/certifications` | POST | Self-Service | Add own certification |
| `/:consultantId/certifications/:certificationId` | PUT | Self-Service | Update own certification |
| `/:consultantId/certifications/:certificationId` | DELETE | Self-Service | Remove own certification |
| `/:consultantId/education` | POST | Self-Service | Add own education |
| `/:consultantId/work-history` | POST | Self-Service | Add own work history |
| `/:consultantId/documents` | POST | Self-Service | Upload own documents |
| `/:consultantId/documents/:documentId` | DELETE | Self-Service | Remove own documents |
| `/:consultantId/feedback` | POST | Peer Collaboration | Submit feedback for colleagues |
| `/:consultantId/achievements` | POST | Self-Service | Record own achievements |

**Total: 23 routes stay in customer-services**

### Routes for Admin-Server Backend 🔐

| Route | Method | Administrative Function | Reason |
|-------|--------|------------------------|---------|
| `/` | POST | Consultant Creation | Only admins create consultant records (or auto-created on registration) |
| `/bulk` | POST | Bulk Operations | Mass data operations for onboarding/migration |
| `/statistics` | GET | Organization Analytics | System-wide statistics and reporting |
| `/:consultantId` | PUT | Consultant Management | Admin-only updates to employment details |
| `/:consultantId` | DELETE | Consultant Management | Soft deletion of consultant records |
| `/:consultantId/activate` | POST | Lifecycle Management | Employment status transitions |
| `/:consultantId/deactivate` | POST | Lifecycle Management | Employment status transitions |
| `/:consultantId/leave` | POST | Lifecycle Management | Leave management |
| `/:consultantId/suspend` | POST | Lifecycle Management | Disciplinary actions |
| `/:consultantId/terminate` | POST | Lifecycle Management | Employment termination |
| `/:consultantId/skills/:skillName/verify` | POST | Skill Verification | Official skill verification |
| `/:consultantId/reviews` | POST | Performance Management | Formal performance reviews |
| `/:consultantId/compliance` | PUT | Compliance Management | Compliance status updates |
| `/:consultantId/conflict-of-interest` | POST | Compliance Management | Conflict of interest declarations |
| `/:consultantId/utilization` | GET | Reporting | Individual utilization reports |

**Total: 15 routes move to admin-server**

---

## Consultant Skill Routes (consultant-skill-routes.js)

### Routes for Customer-Services Backend ✅

| Route | Method | Access Type | Purpose |
|-------|--------|-------------|---------|
| `/me` | GET | Self-Service | Get own skills |
| `/consultant/:consultantId` | GET | Peer View | View consultant skills |
| `/consultant/:consultantId` | POST | Self-Service | Create own skill record |
| `/:skillRecordId` | GET | Peer View | View specific skill record |
| `/:skillRecordId` | PUT | Self-Service | Update own skill record |
| `/:skillRecordId` | DELETE | Self-Service | Remove own skill record |
| `/:skillRecordId/self-assessment` | POST | Self-Service | Submit self-assessment |
| `/:skillRecordId/request-assessment` | POST | Self-Service | Request assessment from others |
| `/:skillRecordId/endorsements` | POST | Peer Collaboration | Endorse colleague skills |
| `/:skillRecordId/endorsements/:endorsementId` | DELETE | Peer Collaboration | Remove own endorsement |
| `/:skillRecordId/projects` | POST | Self-Service | Document project experience |
| `/:skillRecordId/projects/:projectId/feedback` | PUT | Self-Service | Update project feedback |
| `/:skillRecordId/courses/completed` | POST | Self-Service | Record completed training |
| `/:skillRecordId/courses/enrollment` | POST | Self-Service | Record course enrollment |
| `/:skillRecordId/courses/:courseId/progress` | PUT | Self-Service | Update training progress |

**Total: 15 routes stay in customer-services**

### Routes for Admin-Server Backend 🔐

| Route | Method | Administrative Function | Reason |
|-------|--------|------------------------|---------|
| `/search` | GET | Organization-Wide Search | Cross-consultant skill searches for staffing |
| `/find-consultants` | POST | Talent Management | Find consultants by skill combinations |
| `/distribution` | GET | Organization Analytics | Skill distribution analytics |
| `/matrix` | GET | Organization Analytics | Organization skill matrix |
| `/statistics` | GET | Organization Analytics | System-wide skill statistics |
| `/consultant/:consultantId/bulk` | POST | Bulk Operations | Mass skill creation during onboarding |
| `/consultant/:consultantId/gap-analysis` | POST | Talent Development | Skill gap analysis for training |
| `/:skillRecordId/assessments` | POST | Formal Assessment | Official proficiency assessments |
| `/:skillRecordId/verify` | POST | Skill Verification | Certification verification |

**Total: 9 routes move to admin-server**

---

## Consultant Availability Routes (consultant-availability-routes.js)

### Routes for Customer-Services Backend ✅

| Route | Method | Access Type | Purpose |
|-------|--------|-------------|---------|
| `/me` | GET | Self-Service | Get own availability |
| `/consultant/:consultantId` | GET | Peer View | View consultant availability |
| `/consultant/:consultantId` | POST | Self-Service | Create own availability record |
| `/consultant/:consultantId/time-off` | POST | Self-Service | Request time off |
| `/consultant/:consultantId/capacity` | GET | Peer View | View consultant capacity |
| `/consultant/:consultantId/conflicts` | GET | Self-Service | Check own schedule conflicts |
| `/consultant/:consultantId/time-off-balance` | GET | Self-Service | View own time-off balance |
| `/:availabilityId` | GET | Peer View | View specific availability record |
| `/:availabilityId` | PUT | Self-Service | Update own availability |
| `/:availabilityId` | DELETE | Self-Service | Remove own availability |
| `/:availabilityId/cancel` | POST | Self-Service | Cancel own time-off request |

**Total: 11 routes stay in customer-services**

### Routes for Admin-Server Backend 🔐

| Route | Method | Administrative Function | Reason |
|-------|--------|------------------------|---------|
| `/available` | GET | Resource Planning | Organization-wide availability search |
| `/bulk` | POST | Resource Planning | Bulk availability queries |
| `/pending-approvals` | GET | Approval Workflow | Manager approval queue |
| `/capacity-report` | GET | Organization Analytics | Capacity planning reports |
| `/statistics` | GET | Organization Analytics | System-wide availability statistics |
| `/consultant/:consultantId/bulk` | POST | Bulk Operations | Mass availability creation |
| `/:availabilityId/approve` | POST | Approval Workflow | Approve time-off requests |
| `/:availabilityId/reject` | POST | Approval Workflow | Reject time-off requests |

**Total: 8 routes move to admin-server**

---

## Consultant Assignment Routes (consultant-assignment-routes.js)

### Routes for Customer-Services Backend ✅

| Route | Method | Access Type | Purpose |
|-------|--------|-------------|---------|
| `/me` | GET | Self-Service | Get own assignments |
| `/consultant/:consultantId` | GET | Peer View | View consultant assignments |
| `/consultant/:consultantId/allocation` | GET | Peer View | View consultant allocation |
| `/project/:projectId` | GET | Peer View | View project team composition |
| `/client/:clientId` | GET | Peer View | View client assignments |
| `/:assignmentId` | GET | Peer View | View specific assignment |
| `/:assignmentId/time-log` | POST | Self-Service | Log time to assigned projects |

**Total: 7 routes stay in customer-services**

### Routes for Admin-Server Backend 🔐

| Route | Method | Administrative Function | Reason |
|-------|--------|------------------------|---------|
| `/` | POST | Assignment Creation | Project staffing decisions |
| `/bulk` | POST | Bulk Operations | Mass assignment creation |
| `/pending-approvals` | GET | Approval Workflow | Assignment approval queue |
| `/utilization-report` | GET | Organization Analytics | Utilization reporting |
| `/revenue-report` | GET | Financial Reporting | Revenue analysis |
| `/statistics` | GET | Organization Analytics | System-wide assignment statistics |
| `/:assignmentId` | PUT | Assignment Management | Update assignment details |
| `/:assignmentId` | DELETE | Assignment Management | Remove assignments |
| `/:assignmentId/extend` | POST | Assignment Management | Extend assignment duration |
| `/:assignmentId/start` | POST | Lifecycle Management | Activate assignments |
| `/:assignmentId/complete` | POST | Lifecycle Management | Complete assignments |
| `/:assignmentId/cancel` | POST | Lifecycle Management | Cancel assignments |
| `/:assignmentId/hold` | POST | Lifecycle Management | Suspend assignments |
| `/:assignmentId/resume` | POST | Lifecycle Management | Resume assignments |
| `/:assignmentId/approve` | POST | Approval Workflow | Approve assignments |
| `/:assignmentId/reject` | POST | Approval Workflow | Reject assignments |

**Total: 16 routes move to admin-server**

---

## Summary Statistics

### Overall Distribution

| Module | Customer-Services | Admin-Server | Total |
|--------|------------------|--------------|-------|
| Consultant Routes | 23 routes | 15 routes | 38 routes |
| Consultant Skill Routes | 15 routes | 9 routes | 24 routes |
| Consultant Availability Routes | 11 routes | 8 routes | 19 routes |
| Consultant Assignment Routes | 7 routes | 16 routes | 23 routes |
| **TOTAL** | **56 routes** | **48 routes** | **104 routes** |

### Route Categories

| Category | Customer-Services | Admin-Server |
|----------|------------------|--------------|
| Self-Service Operations | 42 routes | 0 routes |
| Peer View/Collaboration | 14 routes | 0 routes |
| Administrative Operations | 0 routes | 48 routes |

---

## Quick Decision Rules

Use these simple rules to quickly categorize routes during implementation:

### Keep in Customer-Services if:
- Route uses `/me` pattern for self-service access
- Route provides read-only viewing of other consultants (peer collaboration)
- Route allows consultants to manage their own data (skills, availability, documents)
- Route enables peer-to-peer interactions (endorsements, feedback)
- Route supports time logging to assigned projects

### Move to Admin-Server if:
- Route performs organization-wide searches or analytics
- Route manages consultant lifecycle (activate, deactivate, suspend, terminate)
- Route handles approval workflows (time-off approvals, assignment approvals)
- Route creates or updates consultant employment records
- Route performs bulk operations or data migrations
- Route generates financial or compliance reports
- Route verifies or validates consultant information officially
- Route manages project staffing and assignments

---

## Implementation Checklist

### Phase 1: Customer-Services Setup
- [ ] Implement 23 consultant routes for self-service and peer viewing
- [ ] Implement 15 consultant skill routes for skill management
- [ ] Implement 11 availability routes for personal availability
- [ ] Implement 7 assignment routes for viewing and time logging
- [ ] Configure authentication middleware for all routes
- [ ] Add ownership verification for self-service operations
- [ ] Enable peer viewing with read-only access controls

### Phase 2: Admin-Server Setup
- [ ] Implement 15 consultant management routes
- [ ] Implement 9 skill administration routes
- [ ] Implement 8 availability management routes
- [ ] Implement 16 assignment management routes
- [ ] Configure admin permission checks for all routes
- [ ] Set up approval workflow queues
- [ ] Enable organization-wide reporting and analytics

### Phase 3: Testing
- [ ] Verify consultants can access only their own data via self-service routes
- [ ] Confirm consultants can view but not modify peer information
- [ ] Test that administrative operations require proper permissions
- [ ] Validate tenant isolation across all operations
- [ ] Check approval workflows function correctly
- [ ] Verify bulk operations handle errors gracefully

### Phase 4: Migration
- [ ] Update consultant-facing applications to use customer-services
- [ ] Update administrative tools to use admin-server
- [ ] Monitor for deprecated route access attempts
- [ ] Deprecate old routes after successful migration
- [ ] Update API documentation to reflect new architecture

---

## Visual Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    CONSULTANT OPERATIONS                     │
└─────────────────────────────────────────────────────────────┘

┌──────────────────────────────┐  ┌──────────────────────────────┐
│   CUSTOMER-SERVICES (56)     │  │    ADMIN-SERVER (48)         │
├──────────────────────────────┤  ├──────────────────────────────┤
│                              │  │                              │
│ Self-Service (42 routes)     │  │ Lifecycle Management         │
│ • Profile management         │  │ • Activate/Deactivate        │
│ • Skill tracking            │  │ • Suspend/Terminate          │
│ • Availability setting       │  │ • Leave management           │
│ • Time logging              │  │                              │
│ • Document uploads          │  │ Approval Workflows           │
│                              │  │ • Time-off approvals         │
│ Peer Collaboration (14)      │  │ • Assignment approvals       │
│ • View profiles             │  │                              │
│ • Search consultants        │  │ Organization Analytics       │
│ • View assignments          │  │ • Statistics & reports       │
│ • Endorse skills            │  │ • Utilization analysis       │
│ • Submit feedback           │  │ • Financial reporting        │
│                              │  │                              │
│ ✓ No admin permissions      │  │ Bulk Operations              │
│ ✓ Ownership verified        │  │ • Mass creation              │
│ ✓ Read-only peer access     │  │ • Data migration             │
│                              │  │                              │
│                              │  │ ✓ Admin permissions required │
│                              │  │ ✓ Organization-wide access   │
└──────────────────────────────┘  └──────────────────────────────┘
```

---

## Key Architectural Principles

**Separation of Concerns**: Customer-services handles consultant-facing operations while admin-server manages privileged administrative functions. This separation creates clear security boundaries and enables independent scaling of each backend based on usage patterns.

**Self-Service First**: Consultants manage their own data through intuitive self-service endpoints that use the `/me` pattern. These operations require only authentication, with the service layer enforcing ownership verification to ensure consultants can only access their own records.

**Peer Collaboration**: Consultants can view public profile information of their colleagues to facilitate team coordination and knowledge sharing. This read-only access supports collaboration while protecting sensitive employment information that remains accessible only to administrators.

**Administrative Control**: All lifecycle management, approval workflows, organization-wide analytics, and bulk operations require administrative permissions and are hosted exclusively on the admin-server backend. This ensures proper oversight of sensitive business operations.

**Automatic Creation**: When consultants register through the standard user registration flow, the system automatically creates their consultant document without requiring explicit API calls. Administrators use the creation endpoint only for special cases like migrating existing employees or creating records for consultants who have not yet registered.