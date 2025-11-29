# InsightSerenity Platform - Entity Relationship Diagram
## Customer Services Module Architecture

---

## Module Structure Overview

```
/customer-services/modules/
├── core-business/           # Primary business operations
├── hosted-organizations/    # Multi-tenant organization management
└── recruitment-services/    # Talent acquisition and placement
```

---

## Core Entities and Relationships

### 1. CORE-BUSINESS MODULE

This module handles the primary consulting and client management operations.

#### Primary Entities:

**User Entity** (Central Authentication & Profile)
- Purpose: Authentication, authorization, and user profile management
- Key Fields: email, password, profile, organizations[], permissions[], clientId, consultantId
- Relationships:
  - One User can belong to multiple Organizations (through organizations[] array)
  - One User with userType='client' links to ONE Client entity (via clientId)
  - One User with userType='consultant' links to ONE Consultant entity (via consultantId)
  - One User can create multiple Projects, Engagements, Documents, Notes

**Client Entity** (Business Organization/Company)
- Purpose: Represents the business entity purchasing consulting services
- Key Fields: clientCode, companyName, tenantId, organizationId, contacts, projects[], contracts[], billing
- Relationships:
  - One Client can have MULTIPLE Users (reverse lookup: User.find({ clientId: clientId }))
  - One Client belongs to ONE Tenant (via tenantId)
  - One Client belongs to ONE Organization (via organizationId)
  - One Client can have MULTIPLE Projects
  - One Client can have MULTIPLE Engagements
  - One Client can have MULTIPLE Contracts
  - One Client can have MULTIPLE Documents
  - One Client can have ONE parent Client (via parentClientId)
  - One Client can have MULTIPLE subsidiary Clients

**Consultant Entity** (Professional Service Provider)
- Purpose: Represents consultants who deliver services to clients
- Key Fields: consultantCode, profile, skills[], certifications[], availability, assignments[], performance
- Relationships:
  - One Consultant links to ONE User account (reverse lookup: User.find({ consultantId: consultantId }))
  - One Consultant belongs to ONE Tenant
  - One Consultant can have MULTIPLE Project assignments
  - One Consultant can have MULTIPLE Engagement assignments
  - One Consultant can submit MULTIPLE Timesheets
  - One Consultant can have MULTIPLE Skill certifications
  - One Consultant can have MULTIPLE Performance reviews

**Project Entity** (Consulting Engagement/Initiative)
- Purpose: Represents a discrete consulting project with defined scope and timeline
- Key Fields: projectCode, name, clientId, status, budget, timeline, milestones[], deliverables[]
- Relationships:
  - One Project belongs to ONE Client (via clientId)
  - One Project can have MULTIPLE Consultants assigned
  - One Project can have MULTIPLE Milestones
  - One Project can have MULTIPLE Deliverables
  - One Project can have MULTIPLE Documents
  - One Project can have MULTIPLE Timesheets
  - One Project belongs to ONE Engagement (if part of larger engagement)
  - One Project can have MULTIPLE Tasks/Activities

**Engagement Entity** (Long-term Client Relationship)
- Purpose: Represents an overarching relationship that may contain multiple projects
- Key Fields: engagementCode, clientId, type, status, value, startDate, endDate, projects[]
- Relationships:
  - One Engagement belongs to ONE Client (via clientId)
  - One Engagement can contain MULTIPLE Projects
  - One Engagement can have MULTIPLE Consultants assigned
  - One Engagement has ONE primary Contract
  - One Engagement can have MULTIPLE Documents
  - One Engagement has ONE Account Manager (User reference)

**Contract Entity** (Legal Agreement)
- Purpose: Represents legal agreements governing client relationships
- Key Fields: contractNumber, clientId, type, terms, value, startDate, endDate, documents[]
- Relationships:
  - One Contract belongs to ONE Client (via clientId)
  - One Contract can cover MULTIPLE Projects
  - One Contract can cover ONE Engagement
  - One Contract has MULTIPLE Document versions
  - One Contract has signing parties (User references)

**Document Entity** (File Management)
- Purpose: Centralized document storage for all entities
- Key Fields: documentId, entityType, entityId, type, name, url, metadata
- Relationships:
  - One Document can belong to ONE of: Client, Project, Engagement, Contract, Consultant
  - One Document is uploaded by ONE User
  - One Document can have MULTIPLE versions
  - Documents are tenant-scoped

**Timesheet Entity** (Time Tracking)
- Purpose: Tracks consultant time spent on projects
- Key Fields: consultantId, projectId, date, hours, billableHours, status, description
- Relationships:
  - One Timesheet belongs to ONE Consultant
  - One Timesheet belongs to ONE Project
  - One Timesheet is approved by ONE User (manager)
  - Multiple Timesheets roll up to Invoices

**Invoice Entity** (Billing)
- Purpose: Financial billing for services rendered
- Key Fields: invoiceNumber, clientId, amount, items[], status, dueDate, paymentTerms
- Relationships:
  - One Invoice belongs to ONE Client
  - One Invoice can include MULTIPLE Projects
  - One Invoice can include MULTIPLE Timesheets
  - One Invoice relates to ONE Contract
  - One Invoice has MULTIPLE line items

---

### 2. HOSTED-ORGANIZATIONS MODULE

This module manages multi-tenant organization structures and team hierarchies.

#### Primary Entities:

**Tenant Entity** (Isolation Boundary)
- Purpose: Top-level isolation for complete data segregation
- Key Fields: tenantCode, name, domain, subscription, settings, status
- Relationships:
  - One Tenant has MULTIPLE Organizations
  - One Tenant has MULTIPLE Users
  - One Tenant has MULTIPLE Clients
  - One Tenant has MULTIPLE Consultants
  - One Tenant has ONE Subscription plan
  - All core-business entities are scoped to ONE Tenant

**Organization Entity** (Business Unit)
- Purpose: Represents a department, division, or business unit within a tenant
- Key Fields: organizationCode, name, tenantId, parentOrgId, type, hierarchy
- Relationships:
  - One Organization belongs to ONE Tenant
  - One Organization can have ONE parent Organization
  - One Organization can have MULTIPLE child Organizations
  - One Organization has MULTIPLE Users (through User.organizations[])
  - One Organization has MULTIPLE Departments
  - One Organization has MULTIPLE Teams
  - One Organization can manage MULTIPLE Clients
  - One Organization has MULTIPLE Roles defined

**Department Entity** (Functional Division)
- Purpose: Functional grouping within an organization
- Key Fields: departmentCode, name, organizationId, managerId, budget
- Relationships:
  - One Department belongs to ONE Organization
  - One Department has ONE manager (User reference)
  - One Department has MULTIPLE Users (through User.organizations[].departmentId)
  - One Department can have MULTIPLE Teams

**Team Entity** (Working Group)
- Purpose: Small collaborative groups working on specific functions
- Key Fields: teamCode, name, organizationId, departmentId, leadId, members[]
- Relationships:
  - One Team belongs to ONE Organization
  - One Team can belong to ONE Department
  - One Team has ONE lead (User reference)
  - One Team has MULTIPLE Users (through User.organizations[].teamIds[])
  - One Team can be assigned to MULTIPLE Projects

**Role Entity** (Permission Template)
- Purpose: Defines sets of permissions that can be assigned to users
- Key Fields: roleName, organizationId, permissions[], scope, isSystem
- Relationships:
  - One Role belongs to ONE Organization (or is system-wide)
  - One Role has MULTIPLE Permissions defined
  - One Role can be assigned to MULTIPLE Users
  - Roles are referenced in User.organizations[].roles[]

**Permission Entity** (Access Control)
- Purpose: Granular access control definitions
- Key Fields: permissionId, resource, actions[], conditions, scope
- Relationships:
  - Permissions are assigned through Roles
  - Permissions are also directly assignable in User.organizations[].permissions[]
  - Permissions are cached in User.permissions[] for quick access

---

### 3. RECRUITMENT-SERVICES MODULE

This module handles talent acquisition, candidate management, and job placement.

#### Primary Entities:

**Job Entity** (Job Opening)
- Purpose: Represents open positions that need to be filled
- Key Fields: jobCode, title, clientId, description, requirements, status, location, compensation
- Relationships:
  - One Job is posted by ONE Client (via clientId)
  - One Job belongs to ONE Tenant
  - One Job can have MULTIPLE Applications
  - One Job can have MULTIPLE Candidates (through applications)
  - One Job has ONE hiring manager (User reference)
  - One Job can be managed by MULTIPLE Recruiters
  - One Job can be sourced through MULTIPLE Partners

**Candidate Entity** (Job Seeker)
- Purpose: Represents individuals seeking employment opportunities
- Key Fields: candidateCode, profile, resume, skills[], experience[], education[], status
- Relationships:
  - One Candidate can link to ONE User account (optional - for candidate portal access)
  - One Candidate belongs to ONE Tenant
  - One Candidate can have MULTIPLE Applications (to different jobs)
  - One Candidate can have MULTIPLE Interviews
  - One Candidate can have MULTIPLE Documents (resume versions, certificates)
  - One Candidate can be sourced by MULTIPLE Recruiters
  - One Candidate can be referred by ONE Partner or User

**Application Entity** (Job Application)
- Purpose: Represents a candidate's application to a specific job
- Key Fields: applicationCode, jobId, candidateId, status, submittedDate, stage, score
- Relationships:
  - One Application belongs to ONE Job
  - One Application belongs to ONE Candidate
  - One Application can have MULTIPLE Interviews scheduled
  - One Application has ONE current stage in hiring pipeline
  - One Application can have MULTIPLE Assessments
  - One Application can have MULTIPLE Notes/Comments
  - One Application has ONE assigned Recruiter

**Interview Entity** (Interview Session)
- Purpose: Tracks interview sessions between candidates and hiring teams
- Key Fields: interviewCode, applicationId, candidateId, jobId, scheduledDate, type, panel[], feedback
- Relationships:
  - One Interview belongs to ONE Application
  - One Interview belongs to ONE Candidate
  - One Interview is for ONE Job
  - One Interview can have MULTIPLE Interviewers (User references in panel[])
  - One Interview generates ONE Feedback/Evaluation
  - Interviews are scheduled by ONE Recruiter/Coordinator

**Partner Entity** (Recruitment Partner/Agency)
- Purpose: External recruitment agencies or partners who source candidates
- Key Fields: partnerCode, companyName, contactInfo, agreementTerms, performance, commissionRate
- Relationships:
  - One Partner belongs to ONE Tenant
  - One Partner can have MULTIPLE Users (partner account access)
  - One Partner can submit MULTIPLE Candidates
  - One Partner can have access to MULTIPLE Jobs
  - One Partner has ONE Contract/Agreement
  - One Partner earns commission on successful Placements

**Placement Entity** (Successful Hire)
- Purpose: Represents successful candidate placements
- Key Fields: placementCode, candidateId, jobId, clientId, startDate, compensation, status
- Relationships:
  - One Placement is for ONE Candidate
  - One Placement is for ONE Job
  - One Placement is with ONE Client
  - One Placement may credit ONE Partner (if sourced by partner)
  - One Placement may credit ONE Recruiter
  - One Placement generates ONE Invoice (for recruitment fees)
  - One Placement can convert to a Consultant relationship (linking to Consultant entity)

**Assessment Entity** (Candidate Evaluation)
- Purpose: Standardized tests or evaluations for candidates
- Key Fields: assessmentCode, candidateId, applicationId, type, score, results, completedDate
- Relationships:
  - One Assessment belongs to ONE Candidate
  - One Assessment belongs to ONE Application
  - One Assessment has ONE defined template/type
  - Assessments are reviewed by hiring team (Users)

---

## Cross-Module Integration Points

### User as Central Authentication Hub
The User entity from core-business serves as the authentication and profile foundation for all modules. Users can have different personas based on their assignments:
- Client User: Has clientId linking to Client entity in core-business
- Consultant User: Has consultantId linking to Consultant entity in core-business
- Recruiter User: Has permissions in recruitment-services module
- Partner User: Has partnerId linking to Partner entity in recruitment-services
- Admin User: Has system-wide permissions across all modules
- Candidate User: Has candidateId linking to Candidate entity (optional portal access)

### Tenant as Isolation Boundary
The Tenant entity from hosted-organizations provides data isolation across all modules. Every entity in every module has a tenantId field ensuring complete segregation of data between different customers of the InsightSerenity platform.

### Organization as Permission Scope
Organizations from hosted-organizations define the permission boundaries. User permissions are scoped to specific organizations through the User.organizations[] array, which determines what data they can access in core-business and recruitment-services modules.

### Client as Revenue Source
The Client entity bridges core-business and recruitment-services. A single client can both purchase consulting services (generating Projects and Engagements) and post job openings (generating Jobs and Applications), providing a unified view of the client relationship.

### Consultant-Candidate Pipeline
The recruitment-services module can feed the core-business module. A successfully placed Candidate (Placement entity) can be converted into a Consultant entity, allowing them to be assigned to consulting Projects and Engagements.

---

## Entity Relationship Summary

### Core-Business Relationships
```
Tenant (1) ──── (M) Client
Tenant (1) ──── (M) User
Tenant (1) ──── (M) Consultant
Client (1) ──── (M) User [via User.clientId]
Client (1) ──── (M) Project
Client (1) ──── (M) Engagement
Client (1) ──── (M) Contract
Client (1) ──── (M) Invoice
Consultant (1) ──── (1) User [via User.consultantId]
Consultant (M) ──── (M) Project [through assignments]
Project (1) ──── (M) Timesheet
Project (M) ──── (M) Consultant [through assignments]
Engagement (1) ──── (M) Project
Contract (1) ──── (M) Project
Invoice (M) ──── (M) Timesheet
```

### Hosted-Organizations Relationships
```
Tenant (1) ──── (M) Organization
Organization (1) ──── (M) Organization [hierarchical parent-child]
Organization (1) ──── (M) Department
Organization (1) ──── (M) Team
Organization (1) ──── (M) Role
Department (1) ──── (M) Team
User (M) ──── (M) Organization [through User.organizations[]]
User (M) ──── (M) Role [through User.organizations[].roles[]]
```

### Recruitment-Services Relationships
```
Tenant (1) ──── (M) Job
Tenant (1) ──── (M) Candidate
Tenant (1) ──── (M) Partner
Client (1) ──── (M) Job
Job (1) ──── (M) Application
Candidate (1) ──── (M) Application
Candidate (1) ──── (1) User [optional, via User.candidateId]
Application (1) ──── (M) Interview
Partner (1) ──── (M) Candidate [sourcing relationship]
Partner (1) ──── (M) User [partner staff access]
Placement (1) ──── (1) Candidate
Placement (1) ──── (1) Job
Placement (1) ──── (1) Client
```

### Cross-Module Integration
```
User [core-business] ──── Organizations [hosted-organizations]
User [core-business] ──── Client [core-business] via clientId
User [core-business] ──── Consultant [core-business] via consultantId
User [core-business] ──── Candidate [recruitment-services] via candidateId (optional)
User [core-business] ──── Partner [recruitment-services] via partnerId (optional)
Tenant [hosted-organizations] ──── All Entities [all modules]
Client [core-business] ──── Job [recruitment-services]
Candidate [recruitment-services] ──── Consultant [core-business] via Placement conversion
```

---

## Key Design Principles

### Multi-Tenancy Architecture
Every entity includes a tenantId field ensuring complete data isolation. Tenant-scoped queries are enforced at the database and service layer to prevent cross-tenant data leakage.

### User-Centric Security
The User entity serves as the central authentication point with organization-based permissions. Users can have multiple roles across different organizations within their tenant, with permissions cached for performance.

### Bidirectional References
Critical relationships maintain bidirectional references where appropriate. For example, User.clientId points to Client, while queries can find all users for a client via User.find({ clientId: clientId }).

### Entity Ownership
Each business entity (Client, Consultant, Candidate, etc.) can be linked to a User account but exists independently. This separation ensures that business entities persist even if individual user accounts are deleted or modified.

### Flexible Hierarchies
Organizations, Departments, and Teams provide flexible hierarchical structures. Clients can have parent-subsidiary relationships. This supports complex enterprise structures.

### Audit and Compliance
All entities include comprehensive audit trails with createdBy, updatedBy, deletedBy user references. Changes are tracked in audit logs with timestamps and IP addresses for compliance requirements.

### Document Polymorphism
The Document entity uses entityType and entityId fields to create a polymorphic relationship, allowing documents to be attached to any entity type (Client, Project, Consultant, Candidate, etc.).

---

## Module Interaction Patterns

### Scenario 1: New Client Onboarding
1. Client entity created in core-business
2. User entity created with userType='client' and clientId reference
3. User added to Organization in hosted-organizations
4. Permissions granted through Organization membership
5. Client can access portal, view projects, submit documents

### Scenario 2: Consultant Assignment to Project
1. Consultant entity exists in core-business
2. Project entity created for Client
3. Consultant assigned to Project through assignments array
4. Timesheet entities created as consultant logs time
5. Timesheets roll up to Invoice for Client

### Scenario 3: Recruitment to Consulting Pipeline
1. Job entity created in recruitment-services for Client
2. Candidate entities created for applicants
3. Application entities link Candidates to Job
4. Interview and Assessment entities track evaluation
5. Placement entity created for successful hire
6. Consultant entity created in core-business (referencing original Candidate)
7. New consultant can be assigned to Projects

### Scenario 4: Multi-Organization User
1. User entity created with primary Organization
2. User added to additional Organizations via User.organizations[] array
3. Each organization membership has specific roles and permissions
4. User.permissions[] cached from all organization memberships
5. Permission middleware checks organization context for data access
6. User sees different data based on current organization context

---

## Storage and Scaling Considerations

### Database Segmentation
- Customer Database: User, Client, Consultant, Project, Engagement, Contract, Invoice, Timesheet, Document
- Admin Database: Tenant, Organization, Department, Team, Role, Permission
- Recruitment Database: Job, Candidate, Application, Interview, Partner, Placement, Assessment

### Shared Database
- Certain reference data and system configurations may reside in a shared database accessible to all tenants with proper scoping

### Connection Management
The ConnectionManager system maintains separate connection pools for customer, admin, and recruitment databases, enabling independent scaling and maintenance of each subsystem.

---

This diagram represents the complete entity relationship architecture for the InsightSerenity platform, showing how core business operations, organizational management, and recruitment services integrate to provide a comprehensive B2B SaaS solution for consulting and recruitment firms.