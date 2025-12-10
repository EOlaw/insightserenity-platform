# Consultant Routes Update Summary

## Overview

This document summarizes the changes made to all four consultant management route files to properly separate customer-services (consultant-facing) operations from admin-server (administrative) operations. The updated files maintain only self-service and peer collaboration routes appropriate for consultant access.

---

## consultant-routes.js Changes

### Before: 38 routes
### After: 23 routes  
### Removed: 15 routes

**KEPT IN CUSTOMER-SERVICES (23 routes):**

Self-Service Operations (11 routes):
- GET /me - Get own profile
- PUT /me - Update own profile
- PUT /:consultantId/availability - Update availability preferences
- POST /:consultantId/blackout-dates - Add blackout dates
- POST /:consultantId/certifications - Add certification
- PUT /:consultantId/certifications/:certificationId - Update certification
- DELETE /:consultantId/certifications/:certificationId - Remove certification
- POST /:consultantId/education - Add education
- POST /:consultantId/work-history - Add work history
- POST /:consultantId/documents - Upload document
- DELETE /:consultantId/documents/:documentId - Remove document
- POST /:consultantId/achievements - Add achievement
- POST /:consultantId/conflict-of-interest - Declare conflict

Peer Viewing & Collaboration (10 routes):
- GET / - List consultants
- GET /search - Search consultants
- GET /available - Find available consultants
- POST /search-by-skills - Search by skills
- GET /:consultantId - View consultant profile
- GET /user/:userId - View by user ID
- GET /:consultantId/direct-reports - View direct reports
- POST /:consultantId/feedback - Submit peer feedback

**REMOVED - Moved to Admin-Server (15 routes):**

Consultant Management (5 routes):
- POST / - Create consultant
- POST /bulk - Bulk create consultants
- PUT /:consultantId - Update consultant
- DELETE /:consultantId - Delete consultant
- GET /statistics - Organization statistics

Lifecycle Management (5 routes):
- POST /:consultantId/activate
- POST /:consultantId/deactivate
- POST /:consultantId/leave
- POST /:consultantId/suspend
- POST /:consultantId/terminate

Performance & Compliance (2 routes):
- POST /:consultantId/reviews - Performance reviews
- PUT /:consultantId/compliance - Compliance management

Reporting (1 route):
- GET /:consultantId/utilization - Utilization reports

Skill Management - Moved to consultant-skill-routes (4 routes):
- POST /:consultantId/skills
- PUT /:consultantId/skills/:skillName
- DELETE /:consultantId/skills/:skillName
- POST /:consultantId/skills/:skillName/verify

**Note:** Skill operations were moved to consultant-skill-routes.js to avoid duplication and improve organization. All skill management should use the dedicated skill routes module.

---

## consultant-skill-routes.js Changes

### Before: 24 routes
### After: 15 routes
### Removed: 9 routes

**KEPT IN CUSTOMER-SERVICES (15 routes):**

Self-Service Operations (8 routes):
- GET /me - Get own skills
- POST /consultant/:consultantId - Create skill record
- PUT /:skillRecordId - Update skill record
- DELETE /:skillRecordId - Delete skill record
- POST /:skillRecordId/self-assessment - Submit self-assessment
- POST /:skillRecordId/request-assessment - Request assessment
- POST /:skillRecordId/projects - Add project experience
- PUT /:skillRecordId/projects/:projectId/feedback - Update project feedback

Training Management (3 routes):
- POST /:skillRecordId/courses/completed - Record completed course
- POST /:skillRecordId/courses/enrollment - Record enrollment
- PUT /:skillRecordId/courses/:courseId/progress - Update progress

Peer Viewing & Collaboration (4 routes):
- GET /consultant/:consultantId - View consultant skills
- GET /:skillRecordId - View skill record
- POST /:skillRecordId/endorsements - Endorse peer skill
- DELETE /:skillRecordId/endorsements/:endorsementId - Remove endorsement

**REMOVED - Moved to Admin-Server (9 routes):**

Organization-Wide Analytics (5 routes):
- GET /search - Search skills across organization
- POST /find-consultants - Find consultants by skills
- GET /distribution - Skill distribution analytics
- GET /matrix - Organization skill matrix
- GET /statistics - Skill statistics

Administrative Operations (4 routes):
- POST /consultant/:consultantId/bulk - Bulk create skill records
- POST /consultant/:consultantId/gap-analysis - Skill gap analysis
- POST /:skillRecordId/assessments - Formal proficiency assessments
- POST /:skillRecordId/verify - Skill verification

---

## consultant-availability-routes.js Changes

### Before: 19 routes
### After: 11 routes
### Removed: 8 routes

**KEPT IN CUSTOMER-SERVICES (11 routes):**

Self-Service Operations (8 routes):
- GET /me - Get own availability
- POST /consultant/:consultantId - Create availability record
- POST /consultant/:consultantId/time-off - Request time off
- GET /consultant/:consultantId/conflicts - Check schedule conflicts
- GET /consultant/:consultantId/time-off-balance - View time-off balance
- PUT /:availabilityId - Update availability
- DELETE /:availabilityId - Delete availability
- POST /:availabilityId/cancel - Cancel time-off request

Peer Viewing (3 routes):
- GET /consultant/:consultantId - View consultant availability
- GET /consultant/:consultantId/capacity - View consultant capacity
- GET /:availabilityId - View availability record

**REMOVED - Moved to Admin-Server (8 routes):**

Organization-Wide Management (2 routes):
- GET /available - Find available consultants
- POST /bulk - Bulk availability queries

Approval Workflow (3 routes):
- GET /pending-approvals - Approval queue
- POST /:availabilityId/approve - Approve time-off
- POST /:availabilityId/reject - Reject time-off

Analytics & Bulk Operations (3 routes):
- GET /capacity-report - Capacity planning report
- GET /statistics - Availability statistics
- POST /consultant/:consultantId/bulk - Bulk create availability

---

## consultant-assignment-routes.js Changes

### Before: 23 routes
### After: 7 routes
### Removed: 16 routes

**KEPT IN CUSTOMER-SERVICES (7 routes):**

Self-Service Operations (2 routes):
- GET /me - Get own assignments
- POST /:assignmentId/time-log - Log time to assignment

Peer Viewing (5 routes):
- GET /consultant/:consultantId - View consultant assignments
- GET /consultant/:consultantId/allocation - View consultant allocation
- GET /project/:projectId - View project assignments
- GET /client/:clientId - View client assignments
- GET /:assignmentId - View assignment details

**REMOVED - Moved to Admin-Server (16 routes):**

Assignment Management (6 routes):
- POST / - Create assignment
- POST /bulk - Bulk create assignments
- PUT /:assignmentId - Update assignment
- DELETE /:assignmentId - Delete assignment
- POST /:assignmentId/extend - Extend assignment

Lifecycle Management (5 routes):
- POST /:assignmentId/start - Start assignment
- POST /:assignmentId/complete - Complete assignment
- POST /:assignmentId/cancel - Cancel assignment
- POST /:assignmentId/hold - Put on hold
- POST /:assignmentId/resume - Resume assignment

Approval Workflow (3 routes):
- GET /pending-approvals - Approval queue
- POST /:assignmentId/approve - Approve assignment
- POST /:assignmentId/reject - Reject assignment

Reporting (3 routes):
- GET /utilization-report - Utilization reporting
- GET /revenue-report - Revenue reporting
- GET /statistics - Assignment statistics

---

## Overall Summary

### Total Routes Across All Modules

| Module | Before | After | Removed |
|--------|--------|-------|---------|
| consultant-routes.js | 38 | 23 | 15 |
| consultant-skill-routes.js | 24 | 15 | 9 |
| consultant-availability-routes.js | 19 | 11 | 8 |
| consultant-assignment-routes.js | 23 | 7 | 16 |
| **TOTAL** | **104** | **56** | **48** |

### Routes by Category

**Customer-Services (56 routes):**
- Self-Service Operations: 42 routes
- Peer Viewing & Collaboration: 14 routes

**Admin-Server (48 routes):**
- Consultant Management: 5 routes
- Lifecycle Management: 10 routes
- Organization Analytics: 15 routes
- Approval Workflows: 9 routes
- Bulk Operations: 6 routes
- Performance & Compliance: 3 routes

---

## Key Architectural Decisions

### Consultant Cannot Create/Update/Delete Consultant Records

Consultants can only manage their own data through self-service endpoints (primarily the `/me` pattern). They cannot create consultant records, update other consultants' employment details, or delete consultant records. When consultants register through the user registration flow, the system automatically creates their consultant document without requiring API calls.

### Skills Consolidated in Dedicated Routes Module

All skill-related operations have been moved to consultant-skill-routes.js, removing the embedded skill endpoints from consultant-routes.js. This eliminates duplication and provides a single, clear module for all skill management operations, whether simple embedded skills or detailed skill records with assessments and endorsements.

### Self-Service vs Administrative Clear Separation

The updated route structure creates a clear boundary between operations consultants can perform on their own data (self-service) and operations that require administrative oversight (lifecycle management, approvals, organization-wide analytics). This separation improves security, enables independent scaling, and simplifies permission management.

### Peer Collaboration Enabled

Consultants retain read-only access to view their colleagues' profiles, skills, availability, and assignments. This peer viewing capability supports team collaboration, knowledge sharing, and project coordination while protecting sensitive employment information that remains accessible only to administrators.

---

## Implementation Notes

### Route Ordering

The updated route files maintain proper route ordering with specific routes (like `/me`, `/search`, `/available`) defined before parameterized routes (like `/:consultantId`) to prevent route matching conflicts.

### Permission Checks

Self-service routes using the `/me` pattern require only authentication, with ownership verification happening in the service layer. Other routes maintain explicit permission checks through the checkPermission middleware to ensure proper authorization.

### Service Layer Compatibility

The underlying service methods remain unchanged and support both customer-services and admin-server operations. The service layer handles ownership verification, tenant isolation, and business logic regardless of which backend invokes the methods.

### Migration Path

Organizations can deploy these updated route files to their customer-services backend while simultaneously creating corresponding admin-server routes with the removed endpoints. The dual-backend architecture can be established without requiring changes to service layer code or database schemas.

---

## Next Steps

### For Customer-Services Deployment

1. Replace existing route files with the updated versions
2. Test self-service operations to ensure consultants can manage their own data
3. Verify peer viewing capabilities work correctly
4. Confirm proper ownership verification in service layer methods
5. Update API documentation to reflect the customer-services routes

### For Admin-Server Development

1. Create new route files in admin-server with the removed routes
2. Implement proper administrative permission checks
3. Configure admin-server to access the same service layer methods
4. Test approval workflows and lifecycle management operations
5. Verify organization-wide analytics and reporting functions

### For Client Applications

1. Update consultant-facing applications to use customer-services endpoints
2. Update administrative tools to use admin-server endpoints
3. Implement feature flags for gradual rollout if needed
4. Monitor for any requests to deprecated routes
5. Communicate changes to users and provide migration support