/**
 * @fileoverview Consultant Management Routes Index
 * @module servers/customer-services/modules/core-business/consultant-management/routes
 * @description Central router combining all consultant management routes with
 * organized prefixes for consultants, skills, availability, and assignments
 */

const express = require('express');
const router = express.Router();

// Import route modules
const consultantRoutes = require('./consultant-routes');
const consultantSkillRoutes = require('./consultant-skill-routes');
const consultantAvailabilityRoutes = require('./consultant-availability-routes');
const consultantAssignmentRoutes = require('./consultant-assignment-routes');

// ============================================================================
// HEALTH CHECK & DOCUMENTATION (MUST COME FIRST - BEFORE ROUTE MOUNTING)
// ============================================================================
// These specific routes must be defined BEFORE the parameterized routes in
// consultantRoutes (like /:consultantId) to prevent them from being caught

/**
 * @route GET /api/v1/consultants/health
 * @description Health check endpoint for consultant management module
 * @access Public
 */
router.get('/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Consultant management module is healthy',
        module: 'consultant-management',
        routes: {
            consultants: '/consultants',
            skills: '/consultant-skills',
            availability: '/consultant-availability',
            assignments: '/consultant-assignments'
        },
        timestamp: new Date().toISOString()
    });
});

/**
 * @route GET /api/v1/consultants/docs
 * @description Get API documentation summary for consultant management
 * @access Public
 */
router.get('/docs', (req, res) => {
    res.status(200).json({
        success: true,
        module: 'consultant-management',
        version: 'v1',
        description: 'Consultant management API for managing consultants, skills, availability, and assignments',
        endpoints: {
            consultants: {
                base: '/api/v1/consultants',
                description: 'Core consultant CRUD, profile management, certifications, performance, compliance',
                operations: [
                    'list', 'search', 'create', 'read', 'update', 'delete',
                    'skills', 'certifications', 'education', 'work-history',
                    'documents', 'reviews', 'feedback', 'achievements',
                    'compliance', 'status-lifecycle', 'utilization'
                ]
            },
            skills: {
                base: '/api/v1/consultant-skills',
                description: 'Skill records, proficiency assessments, endorsements, training',
                operations: [
                    'search', 'find-consultants', 'distribution', 'matrix',
                    'create', 'read', 'update', 'delete',
                    'assessments', 'endorsements', 'projects', 'courses', 'verify'
                ]
            },
            availability: {
                base: '/api/v1/consultant-availability',
                description: 'Availability records, time-off management, capacity planning',
                operations: [
                    'find-available', 'bulk-query', 'capacity-report',
                    'create', 'read', 'update', 'delete',
                    'time-off', 'approve', 'reject', 'cancel'
                ]
            },
            assignments: {
                base: '/api/v1/consultant-assignments',
                description: 'Assignment management, lifecycle, approvals, time tracking',
                operations: [
                    'utilization-report', 'revenue-report',
                    'create', 'read', 'update', 'delete', 'extend',
                    'start', 'complete', 'cancel', 'hold', 'resume',
                    'approve', 'reject', 'time-log'
                ]
            }
        },
        authentication: 'JWT Bearer token required',
        permissions: [
            'consultants:view', 'consultants:create', 'consultants:update', 
            'consultants:delete', 'consultants:manage', 'consultants:reports',
            'consultant-skills:view', 'consultant-skills:create', 'consultant-skills:update',
            'consultant-skills:delete', 'consultant-skills:assess', 'consultant-skills:endorse',
            'consultant-skills:verify', 'consultant-skills:reports',
            'consultant-availability:view', 'consultant-availability:create', 
            'consultant-availability:update', 'consultant-availability:delete',
            'consultant-availability:approve', 'consultant-availability:reports',
            'consultant-assignments:view', 'consultant-assignments:create',
            'consultant-assignments:update', 'consultant-assignments:delete',
            'consultant-assignments:manage', 'consultant-assignments:approve',
            'consultant-assignments:log-time', 'consultant-assignments:reports'
        ],
        timestamp: new Date().toISOString()
    });
});

// ============================================================================
// ROUTE MOUNTING
// ============================================================================

/**
 * Mount consultant routes
 * Base path: /api/v1/consultants
 * 
 * Endpoints include:
 * - GET / - List consultants
 * - GET /search - Search consultants
 * - GET /available - Find available consultants
 * - GET /statistics - Get consultant statistics
 * - GET /me - Get current user's profile (self-service)
 * - PUT /me - Update current user's profile (self-service)
 * - POST / - Create consultant
 * - POST /bulk - Bulk create consultants
 * - POST /search-by-skills - Search by skills
 * - GET /:consultantId - Get consultant by ID
 * - GET /user/:userId - Get consultant by user ID
 * - PUT /:consultantId - Update consultant
 * - DELETE /:consultantId - Delete consultant
 * - GET /:consultantId/direct-reports - Get direct reports
 * - PUT /:consultantId/availability - Update availability
 * - POST /:consultantId/blackout-dates - Add blackout dates
 * - POST /:consultantId/skills - Add skill (embedded)
 * - PUT /:consultantId/skills/:skillName - Update skill
 * - DELETE /:consultantId/skills/:skillName - Remove skill
 * - POST /:consultantId/skills/:skillName/verify - Verify skill
 * - POST /:consultantId/certifications - Add certification
 * - PUT /:consultantId/certifications/:certificationId - Update certification
 * - DELETE /:consultantId/certifications/:certificationId - Remove certification
 * - POST /:consultantId/education - Add education
 * - POST /:consultantId/work-history - Add work history
 * - POST /:consultantId/documents - Add document
 * - DELETE /:consultantId/documents/:documentId - Remove document
 * - POST /:consultantId/reviews - Add performance review
 * - POST /:consultantId/feedback - Add feedback
 * - POST /:consultantId/achievements - Add achievement
 * - PUT /:consultantId/compliance - Update compliance
 * - POST /:consultantId/conflict-of-interest - Add COI declaration
 * - POST /:consultantId/activate - Activate consultant
 * - POST /:consultantId/deactivate - Deactivate consultant
 * - POST /:consultantId/leave - Put on leave
 * - POST /:consultantId/suspend - Suspend consultant
 * - POST /:consultantId/terminate - Terminate consultant
 * - GET /:consultantId/utilization - Get utilization report
 */
router.use('/', consultantRoutes);

/**
 * Mount consultant skill routes
 * Base path: /api/v1/consultant-skills
 * 
 * Endpoints include:
 * - GET /search - Search skills
 * - POST /find-consultants - Find consultants with skills
 * - GET /distribution - Get skill distribution
 * - GET /matrix - Get organization skill matrix
 * - GET /statistics - Get skill statistics
 * - GET /me - Get current user's skills (self-service)
 * - GET /consultant/:consultantId - Get consultant's skills
 * - POST /consultant/:consultantId - Create skill record
 * - POST /consultant/:consultantId/bulk - Bulk create skills
 * - POST /consultant/:consultantId/gap-analysis - Gap analysis
 * - GET /:skillRecordId - Get skill record by ID
 * - PUT /:skillRecordId - Update skill record
 * - DELETE /:skillRecordId - Delete skill record
 * - POST /:skillRecordId/assessments - Submit assessment
 * - POST /:skillRecordId/self-assessment - Self-assessment
 * - POST /:skillRecordId/request-assessment - Request assessment
 * - POST /:skillRecordId/endorsements - Add endorsement
 * - DELETE /:skillRecordId/endorsements/:endorsementId - Remove endorsement
 * - POST /:skillRecordId/projects - Add project experience
 * - PUT /:skillRecordId/projects/:projectId/feedback - Update project feedback
 * - POST /:skillRecordId/courses/completed - Add completed course
 * - POST /:skillRecordId/courses/enrollment - Add enrollment
 * - PUT /:skillRecordId/courses/:courseId/progress - Update progress
 * - POST /:skillRecordId/verify - Verify skill
 */
router.use('/consultant-skills', consultantSkillRoutes);

/**
 * Mount consultant availability routes
 * Base path: /api/v1/consultant-availability
 * 
 * Endpoints include:
 * - GET /available - Find available consultants
 * - POST /bulk - Get bulk consultant availability
 * - GET /pending-approvals - Get pending time-off approvals
 * - GET /capacity-report - Get capacity report
 * - GET /statistics - Get availability statistics
 * - GET /me - Get current user's availability (self-service)
 * - GET /consultant/:consultantId - Get consultant's availability
 * - POST /consultant/:consultantId - Create availability
 * - POST /consultant/:consultantId/time-off - Create time-off request
 * - POST /consultant/:consultantId/bulk - Bulk create availability
 * - GET /consultant/:consultantId/capacity - Get capacity
 * - GET /consultant/:consultantId/conflicts - Check conflicts
 * - GET /consultant/:consultantId/time-off-balance - Get time-off balance
 * - GET /:availabilityId - Get availability by ID
 * - PUT /:availabilityId - Update availability
 * - DELETE /:availabilityId - Delete availability
 * - POST /:availabilityId/approve - Approve time-off
 * - POST /:availabilityId/reject - Reject time-off
 * - POST /:availabilityId/cancel - Cancel time-off
 */
router.use('/consultant-availability', consultantAvailabilityRoutes);

/**
 * Mount consultant assignment routes
 * Base path: /api/v1/consultant-assignments
 * 
 * Endpoints include:
 * - GET /pending-approvals - Get pending approvals
 * - GET /utilization-report - Get utilization report
 * - GET /revenue-report - Get revenue report
 * - GET /statistics - Get assignment statistics
 * - GET /me - Get current user's assignments (self-service)
 * - POST / - Create assignment
 * - POST /bulk - Bulk create assignments
 * - GET /consultant/:consultantId - Get consultant's assignments
 * - GET /consultant/:consultantId/allocation - Get current allocation
 * - GET /project/:projectId - Get project assignments
 * - GET /client/:clientId - Get client assignments
 * - GET /:assignmentId - Get assignment by ID
 * - PUT /:assignmentId - Update assignment
 * - DELETE /:assignmentId - Delete assignment
 * - POST /:assignmentId/extend - Extend assignment
 * - POST /:assignmentId/start - Start assignment
 * - POST /:assignmentId/complete - Complete assignment
 * - POST /:assignmentId/cancel - Cancel assignment
 * - POST /:assignmentId/hold - Put on hold
 * - POST /:assignmentId/resume - Resume assignment
 * - POST /:assignmentId/approve - Approve assignment
 * - POST /:assignmentId/reject - Reject assignment
 * - POST /:assignmentId/time-log - Log time
 */
router.use('/consultant-assignments', consultantAssignmentRoutes);

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = router;

// Also export individual route modules for direct use
module.exports.consultantRoutes = consultantRoutes;
module.exports.consultantSkillRoutes = consultantSkillRoutes;
module.exports.consultantAvailabilityRoutes = consultantAvailabilityRoutes;
module.exports.consultantAssignmentRoutes = consultantAssignmentRoutes;