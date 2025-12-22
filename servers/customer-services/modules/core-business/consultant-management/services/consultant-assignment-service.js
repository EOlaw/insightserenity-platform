/**
 * @fileoverview Consultant Assignment Management Service
 * @module servers/customer-services/modules/core-business/consultant-management/services/consultant-assignment-service
 * @description Comprehensive service for managing consultant assignments to projects, engagements,
 * and clients including allocation tracking, billing, time logging, and performance management
 */

const { AppError } = require('../../../../../../shared/lib/utils/app-error');
const logger = require('../../../../../../shared/lib/utils/logger').createLogger({
    serviceName: 'consultant-assignment-service'
});
const crypto = require('crypto');
const mongoose = require('mongoose');

// Import secure database service
const database = require('../../../../../../shared/lib/database');

// Import related services
const NotificationService = require('../../notifications/services/notification-service');
const AnalyticsService = require('../../analytics/services/analytics-service');


/**
 * Assignment Status Constants
 */
const ASSIGNMENT_STATUS = {
    DRAFT: 'draft',
    PROPOSED: 'proposed',
    PENDING_APPROVAL: 'pending_approval',
    CONFIRMED: 'confirmed',
    ACTIVE: 'active',
    ON_HOLD: 'on_hold',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
    TERMINATED: 'terminated'
};

/**
 * Assignment Role Constants
 */
const ASSIGNMENT_ROLES = {
    LEAD: 'lead',
    SENIOR_CONSULTANT: 'senior_consultant',
    CONSULTANT: 'consultant',
    JUNIOR_CONSULTANT: 'junior_consultant',
    ANALYST: 'analyst',
    SPECIALIST: 'specialist',
    ADVISOR: 'advisor',
    PROJECT_MANAGER: 'project_manager',
    SUBJECT_MATTER_EXPERT: 'subject_matter_expert'
};

/**
 * Rate Type Constants
 */
const RATE_TYPES = {
    HOURLY: 'hourly',
    DAILY: 'daily',
    WEEKLY: 'weekly',
    MONTHLY: 'monthly',
    FIXED: 'fixed',
    MILESTONE: 'milestone',
    RETAINER: 'retainer'
};

/**
 * Approval Status Constants
 */
const APPROVAL_STATUS = {
    PENDING: 'pending',
    APPROVED: 'approved',
    REJECTED: 'rejected',
    ESCALATED: 'escalated',
    AUTO_APPROVED: 'auto_approved'
};

/**
 * Work Location Constants
 */
const WORK_LOCATIONS = {
    ONSITE: 'onsite',
    REMOTE: 'remote',
    HYBRID: 'hybrid',
    CLIENT_SITE: 'client_site',
    FLEXIBLE: 'flexible'
};

/**
 * Consultant Assignment Service
 * Manages all aspects of consultant assignments including project staffing, allocations, and billing
 * @class ConsultantAssignmentService
 */
class ConsultantAssignmentService {
    constructor() {
        this._dbService = null;
        this.notificationService = NotificationService;
        this.analyticsService = AnalyticsService;

        // Configuration
        this.config = {
            companyTenantId: process.env.COMPANY_TENANT_ID || 'default',
            platformUrl: process.env.PLATFORM_URL || 'https://yourplatform.com',
            maxAllocationPercentage: parseInt(process.env.MAX_ALLOCATION_PERCENTAGE, 10) || 100,
            defaultAllocationPercentage: parseInt(process.env.DEFAULT_ALLOCATION_PERCENTAGE, 10) || 100,
            autoApproveThreshold: parseInt(process.env.ASSIGNMENT_AUTO_APPROVE_DAYS, 10) || 30,
            maxConcurrentAssignments: parseInt(process.env.MAX_CONCURRENT_ASSIGNMENTS, 10) || 5,
            requireApprovalAboveRate: parseFloat(process.env.REQUIRE_APPROVAL_ABOVE_RATE) || 500,
            defaultCurrency: process.env.DEFAULT_CURRENCY || 'USD',
            utilizationWarningThreshold: parseInt(process.env.UTILIZATION_WARNING_THRESHOLD, 10) || 110,
            allowOverallocation: process.env.ALLOW_OVERALLOCATION === 'true'
        };
    }

    /**
     * Get database service instance
     * @private
     * @returns {Object} Database service
     */
    _getDatabaseService() {
        if (!this._dbService) {
            this._dbService = database.getDatabaseService();
        }
        return this._dbService;
    }

    // ============= ASSIGNMENT CREATION =============

    /**
     * Create a new consultant assignment
     * @param {string} consultantId - Consultant ID to assign
     * @param {Object} assignmentData - Assignment information
     * @param {string} assignmentData.projectId - Project ID (optional if engagementId provided)
     * @param {string} assignmentData.engagementId - Engagement ID (optional if projectId provided)
     * @param {string} assignmentData.clientId - Client ID
     * @param {string} assignmentData.role - Assignment role
     * @param {Object} assignmentData.timeline - Timeline with proposedStart and proposedEnd dates
     * @param {Object} assignmentData.allocation - Allocation details (percentage, hoursPerWeek)
     * @param {Object} assignmentData.billing - Billing configuration (rate, rateType, billable)
     * @param {Object} options - Additional options
     * @param {string} options.tenantId - Tenant ID for multi-tenancy
     * @param {string} options.userId - User ID of the creator
     * @param {boolean} options.skipAllocationCheck - Skip allocation validation
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @returns {Promise<Object>} Created assignment record
     */
    async createAssignment(consultantId, assignmentData, options = {}) {
        try {
            logger.info('Creating consultant assignment', {
                consultantId,
                projectId: assignmentData.projectId,
                clientId: assignmentData.clientId,
                role: assignmentData.role
            });

            // Validate consultantId
            if (!consultantId || !mongoose.Types.ObjectId.isValid(consultantId)) {
                throw AppError.validation('Invalid consultant ID format');
            }

            // Validate assignment data
            await this._validateAssignmentData(assignmentData);

            const dbService = this._getDatabaseService();
            const ConsultantAssignment = dbService.getModel('ConsultantAssignment', 'customer');
            const Consultant = dbService.getModel('Consultant', 'customer');

            // Verify consultant exists and is active
            const consultant = await Consultant.findById(consultantId);
            if (!consultant) {
                throw AppError.notFound('Consultant not found', { context: { consultantId } });
            }

            if (!consultant.status?.isActive || consultant.status?.isDeleted) {
                throw AppError.validation('Consultant is not active');
            }

            // Check tenant access with validation
            if (options.tenantId && !options.skipTenantCheck && mongoose.Types.ObjectId.isValid(options.tenantId) &&
                consultant.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this consultant');
            }

            // Check allocation constraints
            if (!options.skipAllocationCheck) {
                await this._validateAllocationConstraints(
                    consultantId,
                    assignmentData.allocation?.percentage || this.config.defaultAllocationPercentage,
                    assignmentData.timeline.proposedStart,
                    assignmentData.timeline.proposedEnd
                );
            }

            // Check for duplicate assignment
            await this._checkDuplicateAssignment(consultantId, assignmentData);

            // Generate assignment ID
            const assignmentId = this._generateAssignmentId();

            // Determine initial status and approval
            const { status, approvalRequired } = await this._determineInitialStatus(assignmentData, consultant, options);

            // Build assignment record with validated ObjectIds
            const assignmentRecordData = {
                assignmentId,
                tenantId: consultant.tenantId,
                consultantId,
                details: {
                    title: assignmentData.title || `${assignmentData.role} Assignment`,
                    description: assignmentData.description,
                    role: assignmentData.role,
                    roleLevel: assignmentData.roleLevel || this._determineRoleLevel(assignmentData.role),
                    responsibilities: assignmentData.responsibilities || [],
                    deliverables: assignmentData.deliverables || [],
                    workLocation: assignmentData.workLocation || WORK_LOCATIONS.FLEXIBLE,
                    teamMembers: assignmentData.teamMembers || []
                },
                timeline: {
                    proposedStart: new Date(assignmentData.timeline.proposedStart),
                    proposedEnd: new Date(assignmentData.timeline.proposedEnd),
                    estimatedDuration: this._calculateDuration(
                        assignmentData.timeline.proposedStart,
                        assignmentData.timeline.proposedEnd
                    ),
                    milestones: assignmentData.timeline.milestones || [],
                    extensions: []
                },
                allocation: {
                    percentage: assignmentData.allocation?.percentage || this.config.defaultAllocationPercentage,
                    hoursPerWeek: assignmentData.allocation?.hoursPerWeek || this._calculateWeeklyHours(assignmentData.allocation?.percentage),
                    hoursPerDay: assignmentData.allocation?.hoursPerDay,
                    schedule: assignmentData.allocation?.schedule || [],
                    flexibleHours: assignmentData.allocation?.flexibleHours ?? true,
                    actualUtilization: 0
                },
                billing: {
                    billable: assignmentData.billing?.billable ?? true,
                    rateType: assignmentData.billing?.rateType || RATE_TYPES.HOURLY,
                    rate: assignmentData.billing?.rate || consultant.billing?.defaultRate?.amount || 0,
                    clientRate: assignmentData.billing?.clientRate,
                    costRate: assignmentData.billing?.costRate || consultant.billing?.costRate?.amount,
                    currency: assignmentData.billing?.currency || this.config.defaultCurrency,
                    margin: this._calculateMargin(assignmentData.billing?.clientRate, assignmentData.billing?.rate),
                    overtime: {
                        allowed: assignmentData.billing?.overtime?.allowed ?? false,
                        rate: assignmentData.billing?.overtime?.rate,
                        multiplier: assignmentData.billing?.overtime?.multiplier || 1.5,
                        maxHoursPerWeek: assignmentData.billing?.overtime?.maxHoursPerWeek || 10
                    },
                    budget: assignmentData.billing?.budget ? {
                        total: assignmentData.billing.budget.total,
                        used: 0,
                        remaining: assignmentData.billing.budget.total,
                        alerts: assignmentData.billing.budget.alerts || [50, 75, 90, 100]
                    } : undefined
                },
                timeTracking: {
                    totalHoursLogged: 0,
                    billableHoursLogged: 0,
                    nonBillableHoursLogged: 0,
                    lastTimeEntry: null
                },
                performance: {
                    clientSatisfaction: {},
                    deliveryQuality: {},
                    timeliness: {},
                    communication: {},
                    technicalExpertise: {}
                },
                approval: approvalRequired ? {
                    required: true,
                    status: APPROVAL_STATUS.PENDING,
                    levels: this._buildApprovalLevels(assignmentData, consultant),
                    currentLevel: 1,
                    history: [{
                        action: 'submitted',
                        userId: options.userId,
                        timestamp: new Date(),
                        notes: 'Assignment submitted for approval'
                    }]
                } : {
                    required: false,
                    status: APPROVAL_STATUS.AUTO_APPROVED,
                    history: [{
                        action: 'auto_approved',
                        timestamp: new Date(),
                        notes: 'Assignment auto-approved based on criteria'
                    }]
                },
                status: {
                    current: status,
                    isActive: status === ASSIGNMENT_STATUS.ACTIVE,
                    isDeleted: false,
                    history: [{
                        status,
                        changedAt: new Date(),
                        changedBy: options.userId,
                        reason: 'Initial creation'
                    }]
                },
                notes: assignmentData.notes ? [{
                    content: assignmentData.notes,
                    type: 'general',
                    createdBy: options.userId,
                    createdAt: new Date()
                }] : [],
                metadata: {
                    createdBy: options.userId,
                    source: options.source || 'manual',
                    tags: assignmentData.tags || []
                }
            };

            // Add optional ObjectId fields with validation
            if (consultant.organizationId && mongoose.Types.ObjectId.isValid(consultant.organizationId)) {
                assignmentRecordData.organizationId = consultant.organizationId;
            }

            if (assignmentData.projectId && mongoose.Types.ObjectId.isValid(assignmentData.projectId)) {
                assignmentRecordData.projectId = assignmentData.projectId;
            }

            if (assignmentData.engagementId && mongoose.Types.ObjectId.isValid(assignmentData.engagementId)) {
                assignmentRecordData.engagementId = assignmentData.engagementId;
            }

            if (assignmentData.clientId && mongoose.Types.ObjectId.isValid(assignmentData.clientId)) {
                assignmentRecordData.clientId = assignmentData.clientId;
            }

            if (assignmentData.reportingTo && mongoose.Types.ObjectId.isValid(assignmentData.reportingTo)) {
                assignmentRecordData.details.reportingTo = assignmentData.reportingTo;
            }

            const assignmentRecord = new ConsultantAssignment(assignmentRecordData);
            await assignmentRecord.save();

            // Update consultant's assignment summary
            await this._updateConsultantAssignmentSummary(consultantId);

            // Handle post-creation workflows
            await this._handlePostAssignmentCreation(assignmentRecord, consultant, options);

            logger.info('Assignment created successfully', {
                consultantId,
                assignmentId,
                status
            });

            return this._sanitizeAssignmentOutput(assignmentRecord);

        } catch (error) {
            logger.error('Failed to create assignment', {
                error: error.message,
                stack: error.stack,
                consultantId
            });
            throw error;
        }
    }

    /**
     * Bulk create assignments for multiple consultants
     * @param {Array<Object>} assignments - Array of assignment objects with consultantId and data
     * @param {Object} options - Additional options
     * @param {string} options.tenantId - Tenant ID for multi-tenancy
     * @param {string} options.userId - User ID of the creator
     * @param {boolean} options.skipAllocationCheck - Skip allocation validation
     * @returns {Promise<Object>} Result with created assignments and any errors
     */
    async bulkCreateAssignments(assignments, options = {}) {
        try {
            logger.info('Bulk creating assignments', {
                count: assignments.length
            });

            const results = {
                created: [],
                failed: [],
                skipped: []
            };

            for (const assignment of assignments) {
                try {
                    const record = await this.createAssignment(
                        assignment.consultantId,
                        assignment.data,
                        options
                    );
                    results.created.push(record);
                } catch (error) {
                    if (error.code === 'CONFLICT') {
                        results.skipped.push({
                            consultantId: assignment.consultantId,
                            reason: 'Duplicate assignment'
                        });
                    } else {
                        results.failed.push({
                            consultantId: assignment.consultantId,
                            error: error.message
                        });
                    }
                }
            }

            logger.info('Bulk assignment creation completed', {
                created: results.created.length,
                failed: results.failed.length,
                skipped: results.skipped.length
            });

            return results;

        } catch (error) {
            logger.error('Bulk assignment creation failed', {
                error: error.message
            });
            throw error;
        }
    }

    // ============= ASSIGNMENT RETRIEVAL =============

    /**
     * Get assignment by ID
     * @param {string} assignmentId - Assignment ID (MongoDB _id or assignmentId)
     * @param {Object} options - Query options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @param {boolean} options.includeConsultant - Populate consultant details
     * @param {boolean} options.includeProject - Populate project details
     * @param {boolean} options.includeClient - Populate client details
     * @returns {Promise<Object>} Assignment record
     */
    async getAssignmentById(assignmentId, options = {}) {
        try {
            logger.info('Fetching assignment by ID', { assignmentId });

            const dbService = this._getDatabaseService();
            const ConsultantAssignment = dbService.getModel('ConsultantAssignment', 'customer');

            // Try finding by MongoDB _id first, then by assignmentId
            let query;
            if (mongoose.Types.ObjectId.isValid(assignmentId)) {
                query = ConsultantAssignment.findById(assignmentId);
            } else {
                query = ConsultantAssignment.findOne({ assignmentId: assignmentId.toUpperCase() });
            }

            // Apply population options
            if (options.includeConsultant) {
                query = query.populate('consultantId', 'profile.firstName profile.lastName consultantCode professional.level billing.defaultRate');
            }
            if (options.includeProject) {
                query = query.populate('projectId', 'projectCode name status');
            }
            if (options.includeClient) {
                query = query.populate('clientId', 'clientCode name industry');
            }

            const assignment = await query.exec();

            if (!assignment) {
                throw AppError.notFound('Assignment not found', {
                    context: { assignmentId }
                });
            }

            // Check tenant access with validation
            if (options.tenantId && !options.skipTenantCheck && mongoose.Types.ObjectId.isValid(options.tenantId) &&
                assignment.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this assignment');
            }

            return this._sanitizeAssignmentOutput(assignment);

        } catch (error) {
            logger.error('Failed to fetch assignment', {
                error: error.message,
                assignmentId
            });
            throw error;
        }
    }

    /**
     * Get all assignments for a consultant
     * @param {string} consultantId - Consultant ID
     * @param {Object} options - Query options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {string} options.status - Filter by assignment status
     * @param {boolean} options.activeOnly - Only return active assignments
     * @param {string} options.clientId - Filter by client ID
     * @param {string} options.projectId - Filter by project ID
     * @param {Date} options.startDate - Filter by start date
     * @param {Date} options.endDate - Filter by end date
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @param {number} options.limit - Maximum number of records
     * @param {number} options.skip - Number of records to skip
     * @param {string} options.sortBy - Field to sort by
     * @param {string} options.sortOrder - Sort order (asc/desc)
     * @returns {Promise<Object>} Paginated assignment records
     */
    async getConsultantAssignments(consultantId, options = {}) {
        try {
            logger.info('Fetching consultant assignments', {
                consultantId,
                status: options.status,
                activeOnly: options.activeOnly
            });

            // Validate consultantId
            if (!consultantId || !mongoose.Types.ObjectId.isValid(consultantId)) {
                throw AppError.validation('Invalid consultant ID format');
            }

            const dbService = this._getDatabaseService();
            const ConsultantAssignment = dbService.getModel('ConsultantAssignment', 'customer');

            // Build query
            const query = {
                consultantId: new mongoose.Types.ObjectId(consultantId),
                'status.isDeleted': false
            };

            // Apply filters with validation
            if (options.tenantId && mongoose.Types.ObjectId.isValid(options.tenantId)) {
                query.tenantId = new mongoose.Types.ObjectId(options.tenantId);
            }

            if (options.status) {
                query['status.current'] = options.status;
            }

            if (options.activeOnly) {
                query['status.current'] = { $in: [ASSIGNMENT_STATUS.ACTIVE, ASSIGNMENT_STATUS.CONFIRMED] };
                query['status.isActive'] = true;
            }

            if (options.clientId && mongoose.Types.ObjectId.isValid(options.clientId)) {
                query.clientId = new mongoose.Types.ObjectId(options.clientId);
            }

            if (options.projectId && mongoose.Types.ObjectId.isValid(options.projectId)) {
                query.projectId = new mongoose.Types.ObjectId(options.projectId);
            }

            // Date range filtering (overlapping assignments)
            if (options.startDate || options.endDate) {
                if (options.startDate && options.endDate) {
                    query['timeline.proposedStart'] = { $lte: new Date(options.endDate) };
                    query['timeline.proposedEnd'] = { $gte: new Date(options.startDate) };
                } else if (options.startDate) {
                    query['timeline.proposedEnd'] = { $gte: new Date(options.startDate) };
                } else if (options.endDate) {
                    query['timeline.proposedStart'] = { $lte: new Date(options.endDate) };
                }
            }

            // Build sort
            const sortField = options.sortBy || 'timeline.proposedStart';
            const sortOrder = options.sortOrder === 'asc' ? 1 : -1;
            const sort = { [sortField]: sortOrder };

            // Execute query with pagination
            const limit = Math.min(options.limit || 50, 100);
            const skip = options.skip || 0;

            const [records, total] = await Promise.all([
                ConsultantAssignment.find(query)
                    .populate('clientId', 'clientCode name')
                    .populate('projectId', 'projectCode name')
                    .sort(sort)
                    .skip(skip)
                    .limit(limit)
                    .exec(),
                ConsultantAssignment.countDocuments(query)
            ]);

            return {
                data: records.map(r => this._sanitizeAssignmentOutput(r)),
                pagination: {
                    total,
                    limit,
                    skip,
                    hasMore: skip + records.length < total
                }
            };

        } catch (error) {
            logger.error('Failed to fetch consultant assignments', {
                error: error.message,
                consultantId
            });
            throw error;
        }
    }

    /**
     * Get assignments for a project
     * @param {string} projectId - Project ID
     * @param {Object} options - Query options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {string} options.status - Filter by assignment status
     * @param {boolean} options.activeOnly - Only return active assignments
     * @param {string} options.role - Filter by assignment role
     * @param {number} options.limit - Maximum number of records
     * @returns {Promise<Object>} Assignment records with consultant details
     */
    async getProjectAssignments(projectId, options = {}) {
        try {
            logger.info('Fetching project assignments', {
                projectId,
                status: options.status
            });

            // Validate projectId
            if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
                throw AppError.validation('Invalid project ID format');
            }

            const dbService = this._getDatabaseService();
            const ConsultantAssignment = dbService.getModel('ConsultantAssignment', 'customer');

            const query = {
                projectId: new mongoose.Types.ObjectId(projectId),
                'status.isDeleted': false
            };

            if (options.tenantId && mongoose.Types.ObjectId.isValid(options.tenantId)) {
                query.tenantId = new mongoose.Types.ObjectId(options.tenantId);
            }

            if (options.status) {
                query['status.current'] = options.status;
            }

            if (options.activeOnly) {
                query['status.current'] = { $in: [ASSIGNMENT_STATUS.ACTIVE, ASSIGNMENT_STATUS.CONFIRMED] };
            }

            if (options.role) {
                query['details.role'] = options.role;
            }

            const records = await ConsultantAssignment.find(query)
                .populate('consultantId', 'profile.firstName profile.lastName consultantCode professional.level professional.practiceArea')
                .sort({ 'details.roleLevel': 1, 'timeline.proposedStart': 1 })
                .limit(options.limit || 50)
                .exec();

            // Calculate project staffing summary
            const summary = {
                totalAssignments: records.length,
                totalAllocation: records.reduce((sum, r) => sum + (r.allocation?.percentage || 0), 0),
                byRole: {},
                byStatus: {}
            };

            for (const record of records) {
                const role = record.details?.role || 'unspecified';
                const status = record.status?.current || 'unknown';
                summary.byRole[role] = (summary.byRole[role] || 0) + 1;
                summary.byStatus[status] = (summary.byStatus[status] || 0) + 1;
            }

            return {
                data: records.map(r => this._sanitizeAssignmentOutput(r)),
                summary
            };

        } catch (error) {
            logger.error('Failed to fetch project assignments', {
                error: error.message,
                projectId
            });
            throw error;
        }
    }

    /**
     * Get assignments for a client
     * @param {string} clientId - Client ID
     * @param {Object} options - Query options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {string} options.status - Filter by assignment status
     * @param {boolean} options.activeOnly - Only return active assignments
     * @param {Date} options.startDate - Filter by start date
     * @param {Date} options.endDate - Filter by end date
     * @param {number} options.limit - Maximum number of records
     * @returns {Promise<Object>} Assignment records
     */
    async getClientAssignments(clientId, options = {}) {
        try {
            logger.info('Fetching client assignments', {
                clientId,
                activeOnly: options.activeOnly
            });

            // Validate clientId
            if (!clientId || !mongoose.Types.ObjectId.isValid(clientId)) {
                throw AppError.validation('Invalid client ID format');
            }

            const dbService = this._getDatabaseService();
            const ConsultantAssignment = dbService.getModel('ConsultantAssignment', 'customer');

            const query = {
                clientId: new mongoose.Types.ObjectId(clientId),
                'status.isDeleted': false
            };

            if (options.tenantId && mongoose.Types.ObjectId.isValid(options.tenantId)) {
                query.tenantId = new mongoose.Types.ObjectId(options.tenantId);
            }

            if (options.status) {
                query['status.current'] = options.status;
            }

            if (options.activeOnly) {
                query['status.current'] = { $in: [ASSIGNMENT_STATUS.ACTIVE, ASSIGNMENT_STATUS.CONFIRMED] };
            }

            if (options.startDate && options.endDate) {
                query['timeline.proposedStart'] = { $lte: new Date(options.endDate) };
                query['timeline.proposedEnd'] = { $gte: new Date(options.startDate) };
            }

            const records = await ConsultantAssignment.find(query)
                .populate('consultantId', 'profile.firstName profile.lastName consultantCode professional.level')
                .populate('projectId', 'projectCode name')
                .sort({ 'timeline.proposedStart': -1 })
                .limit(options.limit || 100)
                .exec();

            return {
                data: records.map(r => this._sanitizeAssignmentOutput(r)),
                total: records.length
            };

        } catch (error) {
            logger.error('Failed to fetch client assignments', {
                error: error.message,
                clientId
            });
            throw error;
        }
    }

    /**
     * Get pending approval assignments
     * @param {Object} options - Query options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {string} options.approverId - Filter by approver ID
     * @param {string} options.organizationId - Filter by organization
     * @param {number} options.limit - Maximum number of records
     * @returns {Promise<Array>} Pending assignment records
     */
    async getPendingApprovals(options = {}) {
        try {
            logger.info('Fetching pending assignment approvals', {
                tenantId: options.tenantId,
                approverId: options.approverId
            });

            const dbService = this._getDatabaseService();
            const ConsultantAssignment = dbService.getModel('ConsultantAssignment', 'customer');

            const query = {
                'approval.required': true,
                'approval.status': APPROVAL_STATUS.PENDING,
                'status.isDeleted': false
            };

            if (options.tenantId && mongoose.Types.ObjectId.isValid(options.tenantId)) {
                query.tenantId = new mongoose.Types.ObjectId(options.tenantId);
            }

            if (options.organizationId && mongoose.Types.ObjectId.isValid(options.organizationId)) {
                query.organizationId = new mongoose.Types.ObjectId(options.organizationId);
            }

            const records = await ConsultantAssignment.find(query)
                .populate('consultantId', 'profile.firstName profile.lastName consultantCode')
                .populate('clientId', 'clientCode name')
                .populate('projectId', 'projectCode name')
                .sort({ createdAt: 1 })
                .limit(options.limit || 50)
                .exec();

            // Filter by approver if specified and valid
            let filteredRecords = records;
            if (options.approverId && mongoose.Types.ObjectId.isValid(options.approverId)) {
                filteredRecords = records.filter(r => {
                    const currentLevel = r.approval?.levels?.find(l => l.level === r.approval?.currentLevel);
                    return currentLevel?.approvers?.some(a => a.toString() === options.approverId);
                });
            }

            return filteredRecords.map(r => this._sanitizeAssignmentOutput(r));

        } catch (error) {
            logger.error('Failed to fetch pending approvals', {
                error: error.message
            });
            throw error;
        }
    }

    // ============= ASSIGNMENT UPDATE =============

    /**
     * Update assignment record
     * @param {string} assignmentId - Assignment ID
     * @param {Object} updateData - Fields to update
     * @param {Object} updateData.details - Updated details (title, description, responsibilities)
     * @param {Object} updateData.allocation - Updated allocation (percentage, hoursPerWeek)
     * @param {Object} updateData.billing - Updated billing configuration
     * @param {Object} options - Update options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {string} options.userId - User ID performing the update
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @returns {Promise<Object>} Updated assignment record
     */
    async updateAssignment(assignmentId, updateData, options = {}) {
        try {
            logger.info('Updating assignment', { assignmentId });

            const dbService = this._getDatabaseService();
            const ConsultantAssignment = dbService.getModel('ConsultantAssignment', 'customer');

            // Find existing record
            const assignment = await this._findAssignmentRecord(assignmentId);

            // Check tenant access with validation
            if (options.tenantId && !options.skipTenantCheck && mongoose.Types.ObjectId.isValid(options.tenantId) &&
                assignment.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this assignment');
            }

            // Validate update data
            await this._validateAssignmentUpdateData(updateData, assignment);

            // Check allocation if being updated
            if (updateData.allocation?.percentage) {
                await this._validateAllocationConstraints(
                    assignment.consultantId,
                    updateData.allocation.percentage,
                    assignment.timeline.proposedStart,
                    assignment.timeline.proposedEnd,
                    assignment._id
                );
            }

            // Build update object
            const updateFields = {};

            // Update details with validated ObjectIds
            if (updateData.details) {
                if (updateData.details.title) updateFields['details.title'] = updateData.details.title;
                if (updateData.details.description !== undefined) updateFields['details.description'] = updateData.details.description;
                if (updateData.details.responsibilities) updateFields['details.responsibilities'] = updateData.details.responsibilities;
                if (updateData.details.deliverables) updateFields['details.deliverables'] = updateData.details.deliverables;
                if (updateData.details.workLocation) updateFields['details.workLocation'] = updateData.details.workLocation;
                if (updateData.details.reportingTo !== undefined) {
                    if (updateData.details.reportingTo && mongoose.Types.ObjectId.isValid(updateData.details.reportingTo)) {
                        updateFields['details.reportingTo'] = updateData.details.reportingTo;
                    } else if (updateData.details.reportingTo === null) {
                        updateFields['details.reportingTo'] = null;
                    }
                }
            }

            // Update allocation
            if (updateData.allocation) {
                if (updateData.allocation.percentage !== undefined) {
                    updateFields['allocation.percentage'] = updateData.allocation.percentage;
                    updateFields['allocation.hoursPerWeek'] = this._calculateWeeklyHours(updateData.allocation.percentage);
                }
                if (updateData.allocation.hoursPerWeek !== undefined) updateFields['allocation.hoursPerWeek'] = updateData.allocation.hoursPerWeek;
                if (updateData.allocation.flexibleHours !== undefined) updateFields['allocation.flexibleHours'] = updateData.allocation.flexibleHours;
            }

            // Update billing
            if (updateData.billing) {
                if (updateData.billing.rate !== undefined) updateFields['billing.rate'] = updateData.billing.rate;
                if (updateData.billing.clientRate !== undefined) {
                    updateFields['billing.clientRate'] = updateData.billing.clientRate;
                    updateFields['billing.margin'] = this._calculateMargin(updateData.billing.clientRate, assignment.billing.rate);
                }
                if (updateData.billing.billable !== undefined) updateFields['billing.billable'] = updateData.billing.billable;
                if (updateData.billing.budget) {
                    if (updateData.billing.budget.total !== undefined) {
                        updateFields['billing.budget.total'] = updateData.billing.budget.total;
                        updateFields['billing.budget.remaining'] = updateData.billing.budget.total - (assignment.billing?.budget?.used || 0);
                    }
                }
            }

            // Update metadata
            updateFields['metadata.updatedBy'] = options.userId;
            updateFields['metadata.updatedAt'] = new Date();

            // Execute update
            const updatedAssignment = await ConsultantAssignment.findByIdAndUpdate(
                assignment._id,
                { $set: updateFields },
                { new: true, runValidators: true }
            );

            // Update consultant summary if allocation changed
            if (updateData.allocation?.percentage) {
                await this._updateConsultantAssignmentSummary(assignment.consultantId);
            }

            // Track update event
            await this._trackAssignmentEvent(updatedAssignment, 'assignment_updated', {
                userId: options.userId,
                changes: Object.keys(updateFields)
            });

            logger.info('Assignment updated successfully', {
                assignmentId,
                changes: Object.keys(updateFields).length
            });

            return this._sanitizeAssignmentOutput(updatedAssignment);

        } catch (error) {
            logger.error('Failed to update assignment', {
                error: error.message,
                assignmentId
            });
            throw error;
        }
    }

    /**
     * Extend assignment timeline
     * @param {string} assignmentId - Assignment ID
     * @param {Object} extensionData - Extension information
     * @param {Date} extensionData.newEndDate - New end date
     * @param {string} extensionData.reason - Reason for extension
     * @param {Object} options - Extension options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {string} options.userId - User ID performing the extension
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @returns {Promise<Object>} Updated assignment record
     */
    async extendAssignment(assignmentId, extensionData, options = {}) {
        try {
            logger.info('Extending assignment', {
                assignmentId,
                newEndDate: extensionData.newEndDate
            });

            if (!extensionData.newEndDate) {
                throw AppError.validation('New end date is required');
            }

            if (!extensionData.reason) {
                throw AppError.validation('Extension reason is required');
            }

            const assignment = await this._findAssignmentRecord(assignmentId);

            // Check tenant access with validation
            if (options.tenantId && !options.skipTenantCheck && mongoose.Types.ObjectId.isValid(options.tenantId) &&
                assignment.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this assignment');
            }

            // Validate new end date
            const newEndDate = new Date(extensionData.newEndDate);
            if (newEndDate <= assignment.timeline.proposedEnd) {
                throw AppError.validation('New end date must be after current end date');
            }

            // Check allocation for extended period
            await this._validateAllocationConstraints(
                assignment.consultantId,
                assignment.allocation.percentage,
                assignment.timeline.proposedEnd,
                newEndDate,
                assignment._id
            );

            // Use model method if available, otherwise manual update
            const dbService = this._getDatabaseService();
            const ConsultantAssignment = dbService.getModel('ConsultantAssignment', 'customer');

            const extension = {
                originalEndDate: assignment.timeline.proposedEnd,
                newEndDate,
                reason: extensionData.reason,
                approvedBy: options.userId,
                approvedAt: new Date()
            };

            const updatedAssignment = await ConsultantAssignment.findByIdAndUpdate(
                assignment._id,
                {
                    $set: {
                        'timeline.proposedEnd': newEndDate,
                        'timeline.estimatedDuration': this._calculateDuration(
                            assignment.timeline.proposedStart,
                            newEndDate
                        ),
                        'metadata.updatedBy': options.userId
                    },
                    $push: {
                        'timeline.extensions': extension
                    }
                },
                { new: true }
            );

            // Track extension event
            await this._trackAssignmentEvent(updatedAssignment, 'assignment_extended', {
                userId: options.userId,
                originalEndDate: assignment.timeline.proposedEnd,
                newEndDate,
                reason: extensionData.reason
            });

            logger.info('Assignment extended successfully', {
                assignmentId,
                newEndDate
            });

            return this._sanitizeAssignmentOutput(updatedAssignment);

        } catch (error) {
            logger.error('Failed to extend assignment', {
                error: error.message,
                assignmentId
            });
            throw error;
        }
    }

    // ============= ASSIGNMENT LIFECYCLE =============

    /**
     * Start an assignment (change status to active)
     * @param {string} assignmentId - Assignment ID
     * @param {Object} startData - Start information
     * @param {Date} startData.actualStartDate - Actual start date (defaults to today)
     * @param {string} startData.notes - Start notes
     * @param {Object} options - Start options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {string} options.userId - User ID performing the action
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @returns {Promise<Object>} Updated assignment record
     */
    async startAssignment(assignmentId, startData = {}, options = {}) {
        try {
            logger.info('Starting assignment', { assignmentId });

            const assignment = await this._findAssignmentRecord(assignmentId);

            // Check tenant access with validation
            if (options.tenantId && !options.skipTenantCheck && mongoose.Types.ObjectId.isValid(options.tenantId) &&
                assignment.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this assignment');
            }

            // Validate status transition
            const validStatuses = [ASSIGNMENT_STATUS.CONFIRMED, ASSIGNMENT_STATUS.PROPOSED];
            if (!validStatuses.includes(assignment.status.current)) {
                throw AppError.validation(`Cannot start assignment with status: ${assignment.status.current}`);
            }

            // Check approval
            if (assignment.approval?.required && assignment.approval?.status !== APPROVAL_STATUS.APPROVED &&
                assignment.approval?.status !== APPROVAL_STATUS.AUTO_APPROVED) {
                throw AppError.validation('Assignment requires approval before starting');
            }

            const dbService = this._getDatabaseService();
            const ConsultantAssignment = dbService.getModel('ConsultantAssignment', 'customer');

            const actualStartDate = startData.actualStartDate ? new Date(startData.actualStartDate) : new Date();

            const updatedAssignment = await ConsultantAssignment.findByIdAndUpdate(
                assignment._id,
                {
                    $set: {
                        'status.current': ASSIGNMENT_STATUS.ACTIVE,
                        'status.isActive': true,
                        'timeline.actualStart': actualStartDate,
                        'metadata.updatedBy': options.userId
                    },
                    $push: {
                        'status.history': {
                            status: ASSIGNMENT_STATUS.ACTIVE,
                            changedAt: new Date(),
                            changedBy: options.userId,
                            reason: startData.notes || 'Assignment started'
                        }
                    }
                },
                { new: true }
            );

            // Update consultant summary
            await this._updateConsultantAssignmentSummary(assignment.consultantId);

            // Send notification
            await this._sendAssignmentNotification(updatedAssignment, 'started', options);

            // Track event
            await this._trackAssignmentEvent(updatedAssignment, 'assignment_started', {
                userId: options.userId,
                actualStartDate
            });

            logger.info('Assignment started successfully', { assignmentId });

            return this._sanitizeAssignmentOutput(updatedAssignment);

        } catch (error) {
            logger.error('Failed to start assignment', {
                error: error.message,
                assignmentId
            });
            throw error;
        }
    }

    /**
     * Complete an assignment
     * @param {string} assignmentId - Assignment ID
     * @param {Object} completionData - Completion information
     * @param {Date} completionData.actualEndDate - Actual end date (defaults to today)
     * @param {string} completionData.notes - Completion notes
     * @param {Object} completionData.performance - Final performance ratings
     * @param {Object} options - Completion options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {string} options.userId - User ID performing the action
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @returns {Promise<Object>} Completed assignment record
     */
    async completeAssignment(assignmentId, completionData = {}, options = {}) {
        try {
            logger.info('Completing assignment', { assignmentId });

            const assignment = await this._findAssignmentRecord(assignmentId);

            // Check tenant access with validation
            if (options.tenantId && !options.skipTenantCheck && mongoose.Types.ObjectId.isValid(options.tenantId) &&
                assignment.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this assignment');
            }

            // Validate status transition
            if (assignment.status.current !== ASSIGNMENT_STATUS.ACTIVE) {
                throw AppError.validation(`Cannot complete assignment with status: ${assignment.status.current}`);
            }

            const dbService = this._getDatabaseService();
            const ConsultantAssignment = dbService.getModel('ConsultantAssignment', 'customer');

            const actualEndDate = completionData.actualEndDate ? new Date(completionData.actualEndDate) : new Date();

            const updateFields = {
                'status.current': ASSIGNMENT_STATUS.COMPLETED,
                'status.isActive': false,
                'timeline.actualEnd': actualEndDate,
                'metadata.updatedBy': options.userId
            };

            // Add performance ratings if provided
            if (completionData.performance) {
                if (completionData.performance.clientSatisfaction) {
                    updateFields['performance.clientSatisfaction'] = completionData.performance.clientSatisfaction;
                }
                if (completionData.performance.deliveryQuality) {
                    updateFields['performance.deliveryQuality'] = completionData.performance.deliveryQuality;
                }
                if (completionData.performance.timeliness) {
                    updateFields['performance.timeliness'] = completionData.performance.timeliness;
                }
            }

            const updatedAssignment = await ConsultantAssignment.findByIdAndUpdate(
                assignment._id,
                {
                    $set: updateFields,
                    $push: {
                        'status.history': {
                            status: ASSIGNMENT_STATUS.COMPLETED,
                            changedAt: new Date(),
                            changedBy: options.userId,
                            reason: completionData.notes || 'Assignment completed'
                        }
                    }
                },
                { new: true }
            );

            // Update consultant summary
            await this._updateConsultantAssignmentSummary(assignment.consultantId);

            // Update consultant performance metrics
            await this._updateConsultantPerformance(assignment.consultantId, completionData.performance);

            // Track event
            await this._trackAssignmentEvent(updatedAssignment, 'assignment_completed', {
                userId: options.userId,
                actualEndDate,
                performance: completionData.performance
            });

            logger.info('Assignment completed successfully', { assignmentId });

            return this._sanitizeAssignmentOutput(updatedAssignment);

        } catch (error) {
            logger.error('Failed to complete assignment', {
                error: error.message,
                assignmentId
            });
            throw error;
        }
    }

    /**
     * Cancel an assignment
     * @param {string} assignmentId - Assignment ID
     * @param {Object} cancellationData - Cancellation information
     * @param {string} cancellationData.reason - Cancellation reason (required)
     * @param {Object} options - Cancellation options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {string} options.userId - User ID performing the action
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @returns {Promise<Object>} Cancelled assignment record
     */
    async cancelAssignment(assignmentId, cancellationData, options = {}) {
        try {
            logger.info('Cancelling assignment', { assignmentId });

            if (!cancellationData?.reason) {
                throw AppError.validation('Cancellation reason is required');
            }

            const assignment = await this._findAssignmentRecord(assignmentId);

            // Check tenant access with validation
            if (options.tenantId && !options.skipTenantCheck && mongoose.Types.ObjectId.isValid(options.tenantId) &&
                assignment.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this assignment');
            }

            // Cannot cancel completed assignments
            if (assignment.status.current === ASSIGNMENT_STATUS.COMPLETED) {
                throw AppError.validation('Cannot cancel a completed assignment');
            }

            const dbService = this._getDatabaseService();
            const ConsultantAssignment = dbService.getModel('ConsultantAssignment', 'customer');

            const updatedAssignment = await ConsultantAssignment.findByIdAndUpdate(
                assignment._id,
                {
                    $set: {
                        'status.current': ASSIGNMENT_STATUS.CANCELLED,
                        'status.isActive': false,
                        'metadata.updatedBy': options.userId
                    },
                    $push: {
                        'status.history': {
                            status: ASSIGNMENT_STATUS.CANCELLED,
                            changedAt: new Date(),
                            changedBy: options.userId,
                            reason: cancellationData.reason
                        }
                    }
                },
                { new: true }
            );

            // Update consultant summary
            await this._updateConsultantAssignmentSummary(assignment.consultantId);

            // Send notification
            await this._sendAssignmentNotification(updatedAssignment, 'cancelled', options);

            // Track event
            await this._trackAssignmentEvent(updatedAssignment, 'assignment_cancelled', {
                userId: options.userId,
                reason: cancellationData.reason
            });

            logger.info('Assignment cancelled successfully', { assignmentId });

            return this._sanitizeAssignmentOutput(updatedAssignment);

        } catch (error) {
            logger.error('Failed to cancel assignment', {
                error: error.message,
                assignmentId
            });
            throw error;
        }
    }

    /**
     * Put assignment on hold
     * @param {string} assignmentId - Assignment ID
     * @param {Object} holdData - Hold information
     * @param {string} holdData.reason - Reason for putting on hold
     * @param {Date} holdData.expectedResumeDate - Expected date to resume
     * @param {Object} options - Hold options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {string} options.userId - User ID performing the action
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @returns {Promise<Object>} Updated assignment record
     */
    async holdAssignment(assignmentId, holdData = {}, options = {}) {
        try {
            logger.info('Putting assignment on hold', { assignmentId });

            const assignment = await this._findAssignmentRecord(assignmentId);

            // Check tenant access with validation
            if (options.tenantId && !options.skipTenantCheck && mongoose.Types.ObjectId.isValid(options.tenantId) &&
                assignment.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this assignment');
            }

            // Only active assignments can be put on hold
            if (assignment.status.current !== ASSIGNMENT_STATUS.ACTIVE) {
                throw AppError.validation(`Cannot put on hold assignment with status: ${assignment.status.current}`);
            }

            const dbService = this._getDatabaseService();
            const ConsultantAssignment = dbService.getModel('ConsultantAssignment', 'customer');

            const updatedAssignment = await ConsultantAssignment.findByIdAndUpdate(
                assignment._id,
                {
                    $set: {
                        'status.current': ASSIGNMENT_STATUS.ON_HOLD,
                        'status.isActive': false,
                        'metadata.updatedBy': options.userId,
                        'metadata.holdInfo': {
                            reason: holdData.reason,
                            expectedResumeDate: holdData.expectedResumeDate,
                            holdDate: new Date()
                        }
                    },
                    $push: {
                        'status.history': {
                            status: ASSIGNMENT_STATUS.ON_HOLD,
                            changedAt: new Date(),
                            changedBy: options.userId,
                            reason: holdData.reason || 'Put on hold'
                        }
                    }
                },
                { new: true }
            );

            // Update consultant summary
            await this._updateConsultantAssignmentSummary(assignment.consultantId);

            // Track event
            await this._trackAssignmentEvent(updatedAssignment, 'assignment_on_hold', {
                userId: options.userId,
                reason: holdData.reason,
                expectedResumeDate: holdData.expectedResumeDate
            });

            logger.info('Assignment put on hold', { assignmentId });

            return this._sanitizeAssignmentOutput(updatedAssignment);

        } catch (error) {
            logger.error('Failed to put assignment on hold', {
                error: error.message,
                assignmentId
            });
            throw error;
        }
    }

    /**
     * Resume assignment from hold
     * @param {string} assignmentId - Assignment ID
     * @param {Object} resumeData - Resume information
     * @param {string} resumeData.notes - Resume notes
     * @param {Object} options - Resume options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {string} options.userId - User ID performing the action
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @returns {Promise<Object>} Updated assignment record
     */
    async resumeAssignment(assignmentId, resumeData = {}, options = {}) {
        try {
            logger.info('Resuming assignment', { assignmentId });

            const assignment = await this._findAssignmentRecord(assignmentId);

            // Check tenant access with validation
            if (options.tenantId && !options.skipTenantCheck && mongoose.Types.ObjectId.isValid(options.tenantId) &&
                assignment.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this assignment');
            }

            // Only on-hold assignments can be resumed
            if (assignment.status.current !== ASSIGNMENT_STATUS.ON_HOLD) {
                throw AppError.validation(`Cannot resume assignment with status: ${assignment.status.current}`);
            }

            const dbService = this._getDatabaseService();
            const ConsultantAssignment = dbService.getModel('ConsultantAssignment', 'customer');

            const updatedAssignment = await ConsultantAssignment.findByIdAndUpdate(
                assignment._id,
                {
                    $set: {
                        'status.current': ASSIGNMENT_STATUS.ACTIVE,
                        'status.isActive': true,
                        'metadata.updatedBy': options.userId
                    },
                    $unset: {
                        'metadata.holdInfo': 1
                    },
                    $push: {
                        'status.history': {
                            status: ASSIGNMENT_STATUS.ACTIVE,
                            changedAt: new Date(),
                            changedBy: options.userId,
                            reason: resumeData.notes || 'Resumed from hold'
                        }
                    }
                },
                { new: true }
            );

            // Update consultant summary
            await this._updateConsultantAssignmentSummary(assignment.consultantId);

            // Track event
            await this._trackAssignmentEvent(updatedAssignment, 'assignment_resumed', {
                userId: options.userId
            });

            logger.info('Assignment resumed', { assignmentId });

            return this._sanitizeAssignmentOutput(updatedAssignment);

        } catch (error) {
            logger.error('Failed to resume assignment', {
                error: error.message,
                assignmentId
            });
            throw error;
        }
    }

    // ============= APPROVAL WORKFLOW =============

    /**
     * Approve an assignment
     * @param {string} assignmentId - Assignment ID
     * @param {Object} approvalData - Approval information
     * @param {string} approvalData.comments - Approval comments
     * @param {Object} options - Approval options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {string} options.userId - Approver user ID
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @returns {Promise<Object>} Approved assignment record
     */
    async approveAssignment(assignmentId, approvalData = {}, options = {}) {
        try {
            logger.info('Approving assignment', { assignmentId });

            const dbService = this._getDatabaseService();
            const ConsultantAssignment = dbService.getModel('ConsultantAssignment', 'customer');

            const assignment = await this._findAssignmentRecord(assignmentId);

            // Check tenant access with validation
            if (options.tenantId && !options.skipTenantCheck && mongoose.Types.ObjectId.isValid(options.tenantId) &&
                assignment.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this assignment');
            }

            // Validate approval state
            if (!assignment.approval?.required) {
                throw AppError.validation('This assignment does not require approval');
            }

            if (assignment.approval.status !== APPROVAL_STATUS.PENDING) {
                throw AppError.validation('Assignment is not pending approval');
            }

            // Check if user is authorized approver
            const currentLevel = assignment.approval.levels?.find(l => l.level === assignment.approval.currentLevel);
            if (!currentLevel?.approvers?.some(a => a.toString() === options.userId)) {
                throw AppError.forbidden('You are not authorized to approve this assignment');
            }

            // Determine if this is final approval
            const isFinalLevel = assignment.approval.currentLevel >= assignment.approval.levels.length;
            const newStatus = isFinalLevel ? APPROVAL_STATUS.APPROVED : APPROVAL_STATUS.PENDING;
            const newLevel = isFinalLevel ? assignment.approval.currentLevel : assignment.approval.currentLevel + 1;

            const updateData = {
                $set: {
                    'approval.status': newStatus,
                    'approval.currentLevel': newLevel,
                    'metadata.updatedBy': options.userId
                },
                $push: {
                    'approval.history': {
                        action: 'approved',
                        level: assignment.approval.currentLevel,
                        userId: options.userId,
                        timestamp: new Date(),
                        notes: approvalData.comments
                    }
                }
            };

            // If final approval, update assignment status
            if (isFinalLevel) {
                updateData.$set['status.current'] = ASSIGNMENT_STATUS.CONFIRMED;
                updateData.$set['approval.finalApproval'] = {
                    approvedBy: options.userId,
                    approvedAt: new Date()
                };
                updateData.$push['status.history'] = {
                    status: ASSIGNMENT_STATUS.CONFIRMED,
                    changedAt: new Date(),
                    changedBy: options.userId,
                    reason: 'Assignment approved'
                };
            }

            const updatedAssignment = await ConsultantAssignment.findByIdAndUpdate(
                assignment._id,
                updateData,
                { new: true }
            );

            // Send notifications
            if (isFinalLevel) {
                await this._sendAssignmentNotification(updatedAssignment, 'approved', options);
            }

            // Track event
            await this._trackAssignmentEvent(updatedAssignment, 'assignment_approved', {
                approverId: options.userId,
                level: assignment.approval.currentLevel,
                isFinal: isFinalLevel,
                comments: approvalData.comments
            });

            logger.info('Assignment approved', {
                assignmentId,
                level: assignment.approval.currentLevel,
                isFinal: isFinalLevel
            });

            return this._sanitizeAssignmentOutput(updatedAssignment);

        } catch (error) {
            logger.error('Failed to approve assignment', {
                error: error.message,
                assignmentId
            });
            throw error;
        }
    }

    /**
     * Reject an assignment
     * @param {string} assignmentId - Assignment ID
     * @param {Object} rejectionData - Rejection information
     * @param {string} rejectionData.reason - Rejection reason (required)
     * @param {string} rejectionData.comments - Additional comments
     * @param {Object} options - Rejection options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {string} options.userId - Rejector user ID
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @returns {Promise<Object>} Rejected assignment record
     */
    async rejectAssignment(assignmentId, rejectionData, options = {}) {
        try {
            logger.info('Rejecting assignment', { assignmentId });

            if (!rejectionData?.reason) {
                throw AppError.validation('Rejection reason is required');
            }

            const dbService = this._getDatabaseService();
            const ConsultantAssignment = dbService.getModel('ConsultantAssignment', 'customer');

            const assignment = await this._findAssignmentRecord(assignmentId);

            // Check tenant access with validation
            if (options.tenantId && !options.skipTenantCheck && mongoose.Types.ObjectId.isValid(options.tenantId) &&
                assignment.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this assignment');
            }

            // Validate rejection state
            if (!assignment.approval?.required) {
                throw AppError.validation('This assignment does not require approval');
            }

            if (assignment.approval.status !== APPROVAL_STATUS.PENDING) {
                throw AppError.validation('Assignment is not pending approval');
            }

            const updatedAssignment = await ConsultantAssignment.findByIdAndUpdate(
                assignment._id,
                {
                    $set: {
                        'approval.status': APPROVAL_STATUS.REJECTED,
                        'status.current': ASSIGNMENT_STATUS.DRAFT,
                        'metadata.updatedBy': options.userId
                    },
                    $push: {
                        'approval.history': {
                            action: 'rejected',
                            level: assignment.approval.currentLevel,
                            userId: options.userId,
                            timestamp: new Date(),
                            notes: rejectionData.reason
                        },
                        'status.history': {
                            status: ASSIGNMENT_STATUS.DRAFT,
                            changedAt: new Date(),
                            changedBy: options.userId,
                            reason: `Rejected: ${rejectionData.reason}`
                        }
                    }
                },
                { new: true }
            );

            // Send notification
            await this._sendAssignmentNotification(updatedAssignment, 'rejected', {
                ...options,
                reason: rejectionData.reason
            });

            // Track event
            await this._trackAssignmentEvent(updatedAssignment, 'assignment_rejected', {
                rejectorId: options.userId,
                level: assignment.approval.currentLevel,
                reason: rejectionData.reason
            });

            logger.info('Assignment rejected', { assignmentId, reason: rejectionData.reason });

            return this._sanitizeAssignmentOutput(updatedAssignment);

        } catch (error) {
            logger.error('Failed to reject assignment', {
                error: error.message,
                assignmentId
            });
            throw error;
        }
    }

    // ============= TIME TRACKING =============

    /**
     * Log time for an assignment
     * @param {string} assignmentId - Assignment ID
     * @param {Object} timeEntry - Time entry data
     * @param {number} timeEntry.hours - Hours worked
     * @param {Date} timeEntry.date - Date of work
     * @param {string} timeEntry.description - Work description
     * @param {boolean} timeEntry.billable - Whether hours are billable
     * @param {Object} options - Options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {string} options.userId - User ID logging time
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @returns {Promise<Object>} Updated assignment with time entry
     */
    async logTime(assignmentId, timeEntry, options = {}) {
        try {
            logger.info('Logging time for assignment', {
                assignmentId,
                hours: timeEntry.hours,
                date: timeEntry.date
            });

            // Validate time entry
            if (!timeEntry.hours || timeEntry.hours <= 0) {
                throw AppError.validation('Valid hours are required');
            }

            if (!timeEntry.date) {
                throw AppError.validation('Date is required');
            }

            const assignment = await this._findAssignmentRecord(assignmentId);

            // Check tenant access with validation
            if (options.tenantId && !options.skipTenantCheck && mongoose.Types.ObjectId.isValid(options.tenantId) &&
                assignment.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this assignment');
            }

            // Verify assignment is active
            if (assignment.status.current !== ASSIGNMENT_STATUS.ACTIVE) {
                throw AppError.validation('Can only log time to active assignments');
            }

            const dbService = this._getDatabaseService();
            const ConsultantAssignment = dbService.getModel('ConsultantAssignment', 'customer');

            const isBillable = timeEntry.billable ?? assignment.billing?.billable ?? true;
            const billableHours = isBillable ? timeEntry.hours : 0;
            const nonBillableHours = isBillable ? 0 : timeEntry.hours;

            // Calculate budget impact if applicable
            let budgetUpdate = {};
            if (assignment.billing?.budget && isBillable) {
                const hourlyRate = assignment.billing.rate || 0;
                const cost = timeEntry.hours * hourlyRate;
                const newUsed = (assignment.billing.budget.used || 0) + cost;
                const newRemaining = (assignment.billing.budget.total || 0) - newUsed;

                budgetUpdate = {
                    'billing.budget.used': newUsed,
                    'billing.budget.remaining': newRemaining
                };

                // Check budget alerts
                if (assignment.billing.budget.total > 0) {
                    const usedPercentage = (newUsed / assignment.billing.budget.total) * 100;
                    const alerts = assignment.billing.budget.alerts || [50, 75, 90, 100];

                    for (const threshold of alerts) {
                        if (usedPercentage >= threshold) {
                            await this._sendBudgetAlert(assignment, threshold, usedPercentage);
                        }
                    }
                }
            }

            const updatedAssignment = await ConsultantAssignment.findByIdAndUpdate(
                assignment._id,
                {
                    $inc: {
                        'timeTracking.totalHoursLogged': timeEntry.hours,
                        'timeTracking.billableHoursLogged': billableHours,
                        'timeTracking.nonBillableHoursLogged': nonBillableHours
                    },
                    $set: {
                        'timeTracking.lastTimeEntry': new Date(),
                        ...budgetUpdate,
                        'metadata.updatedBy': options.userId
                    }
                },
                { new: true }
            );

            // Update consultant's utilization
            await this._updateConsultantUtilization(assignment.consultantId, timeEntry.hours);

            // Track event
            await this._trackAssignmentEvent(updatedAssignment, 'time_logged', {
                userId: options.userId,
                hours: timeEntry.hours,
                billable: isBillable,
                date: timeEntry.date
            });

            logger.info('Time logged successfully', {
                assignmentId,
                hours: timeEntry.hours,
                billable: isBillable
            });

            return this._sanitizeAssignmentOutput(updatedAssignment);

        } catch (error) {
            logger.error('Failed to log time', {
                error: error.message,
                assignmentId
            });
            throw error;
        }
    }

    // ============= ASSIGNMENT DELETION =============

    /**
     * Delete assignment record (soft delete)
     * @param {string} assignmentId - Assignment ID
     * @param {Object} options - Delete options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {string} options.userId - User ID performing deletion
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @param {boolean} options.hardDelete - Perform permanent deletion
     * @returns {Promise<Object>} Deletion result
     */
    async deleteAssignment(assignmentId, options = {}) {
        try {
            logger.info('Deleting assignment', { assignmentId, hardDelete: options.hardDelete });

            const dbService = this._getDatabaseService();
            const ConsultantAssignment = dbService.getModel('ConsultantAssignment', 'customer');

            const assignment = await this._findAssignmentRecord(assignmentId);

            // Check tenant access with validation
            if (options.tenantId && !options.skipTenantCheck && mongoose.Types.ObjectId.isValid(options.tenantId) &&
                assignment.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this assignment');
            }

            // Cannot delete active assignments
            if (assignment.status.current === ASSIGNMENT_STATUS.ACTIVE) {
                throw AppError.validation('Cannot delete an active assignment. Cancel or complete it first.');
            }

            const consultantId = assignment.consultantId;

            if (options.hardDelete) {
                await ConsultantAssignment.findByIdAndDelete(assignment._id);
            } else {
                await ConsultantAssignment.findByIdAndUpdate(assignment._id, {
                    $set: {
                        'status.isDeleted': true,
                        'status.deletedAt': new Date(),
                        'status.deletedBy': options.userId,
                        'status.isActive': false
                    }
                });
            }

            // Update consultant summary
            await this._updateConsultantAssignmentSummary(consultantId);

            // Track event
            await this._trackAssignmentEvent(assignment, 'assignment_deleted', {
                userId: options.userId,
                hardDelete: options.hardDelete
            });

            logger.info('Assignment deleted', { assignmentId, hardDelete: options.hardDelete });

            return {
                success: true,
                assignmentId: assignment.assignmentId,
                deleted: true
            };

        } catch (error) {
            logger.error('Failed to delete assignment', {
                error: error.message,
                assignmentId
            });
            throw error;
        }
    }

    // ============= REPORTS & ANALYTICS =============

    /**
     * Get current allocation for a consultant
     * @param {string} consultantId - Consultant ID
     * @param {Object} options - Query options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {Date} options.asOfDate - Date to calculate allocation (defaults to today)
     * @returns {Promise<Object>} Allocation summary
     */
    async getCurrentAllocation(consultantId, options = {}) {
        try {
            logger.info('Getting current allocation', { consultantId });

            // Validate consultantId
            if (!consultantId || !mongoose.Types.ObjectId.isValid(consultantId)) {
                throw AppError.validation('Invalid consultant ID format');
            }

            const dbService = this._getDatabaseService();
            const ConsultantAssignment = dbService.getModel('ConsultantAssignment', 'customer');

            const asOfDate = options.asOfDate ? new Date(options.asOfDate) : new Date();

            // Get tenantId with validation
            const tenantId = options.tenantId || this.config.companyTenantId;
            const tenantIdToUse = (tenantId && mongoose.Types.ObjectId.isValid(tenantId)) ? tenantId : this.config.companyTenantId;

            const allocation = await ConsultantAssignment.getCurrentAllocation(
                tenantIdToUse,
                consultantId,
                asOfDate
            );

            return {
                consultantId,
                asOfDate,
                allocation: allocation[0] || {
                    totalAllocation: 0,
                    activeAssignments: 0,
                    assignments: []
                }
            };

        } catch (error) {
            logger.error('Failed to get current allocation', {
                error: error.message,
                consultantId
            });
            throw error;
        }
    }

    /**
     * Get utilization report
     * @param {Date} startDate - Report start date
     * @param {Date} endDate - Report end date
     * @param {Object} options - Report options
     * @param {string} options.tenantId - Tenant ID
     * @param {string} options.consultantId - Filter by consultant
     * @param {string} options.clientId - Filter by client
     * @param {string} options.projectId - Filter by project
     * @returns {Promise<Object>} Utilization report
     */
    async getUtilizationReport(startDate, endDate, options = {}) {
        try {
            logger.info('Generating utilization report', {
                startDate,
                endDate,
                consultantId: options.consultantId
            });

            const dbService = this._getDatabaseService();
            const ConsultantAssignment = dbService.getModel('ConsultantAssignment', 'customer');

            // Get tenantId with validation
            const tenantId = options.tenantId || this.config.companyTenantId;
            const tenantIdToUse = (tenantId && mongoose.Types.ObjectId.isValid(tenantId)) ? tenantId : this.config.companyTenantId;

            const reportOptions = {};
            if (options.consultantId && mongoose.Types.ObjectId.isValid(options.consultantId)) {
                reportOptions.consultantId = options.consultantId;
            }
            if (options.clientId && mongoose.Types.ObjectId.isValid(options.clientId)) {
                reportOptions.clientId = options.clientId;
            }
            if (options.projectId && mongoose.Types.ObjectId.isValid(options.projectId)) {
                reportOptions.projectId = options.projectId;
            }

            const report = await ConsultantAssignment.getUtilizationReport(
                tenantIdToUse,
                new Date(startDate),
                new Date(endDate),
                reportOptions
            );

            return {
                period: { startDate, endDate },
                data: report,
                generatedAt: new Date()
            };

        } catch (error) {
            logger.error('Failed to generate utilization report', {
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Get revenue report
     * @param {Date} startDate - Report start date
     * @param {Date} endDate - Report end date
     * @param {Object} options - Report options
     * @param {string} options.tenantId - Tenant ID
     * @param {string} options.groupBy - Group results by (consultant, client, project)
     * @returns {Promise<Object>} Revenue report
     */
    async getRevenueReport(startDate, endDate, options = {}) {
        try {
            logger.info('Generating revenue report', {
                startDate,
                endDate,
                groupBy: options.groupBy
            });

            const dbService = this._getDatabaseService();
            const ConsultantAssignment = dbService.getModel('ConsultantAssignment', 'customer');

            // Get tenantId with validation
            const tenantId = options.tenantId || this.config.companyTenantId;
            const tenantIdToUse = (tenantId && mongoose.Types.ObjectId.isValid(tenantId)) ? tenantId : this.config.companyTenantId;

            const report = await ConsultantAssignment.getRevenueReport(
                tenantIdToUse,
                new Date(startDate),
                new Date(endDate)
            );

            // Calculate summary
            const summary = {
                totalRevenue: report.reduce((sum, r) => sum + (r.totalRevenue || 0), 0),
                totalHours: report.reduce((sum, r) => sum + (r.totalHours || 0), 0),
                totalAssignments: report.length
            };

            return {
                period: { startDate, endDate },
                summary,
                data: report,
                generatedAt: new Date()
            };

        } catch (error) {
            logger.error('Failed to generate revenue report', {
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Get assignment statistics
     * @param {Object} options - Statistics options
     * @param {string} options.tenantId - Tenant ID
     * @param {string} options.organizationId - Filter by organization
     * @param {Date} options.startDate - Start date for statistics
     * @param {Date} options.endDate - End date for statistics
     * @returns {Promise<Object>} Assignment statistics
     */
    async getAssignmentStatistics(options = {}) {
        try {
            logger.info('Generating assignment statistics', {
                tenantId: options.tenantId
            });

            const dbService = this._getDatabaseService();
            const ConsultantAssignment = dbService.getModel('ConsultantAssignment', 'customer');

            const matchStage = {
                'status.isDeleted': false
            };

            // Add filters with validation
            if (options.tenantId && mongoose.Types.ObjectId.isValid(options.tenantId)) {
                matchStage.tenantId = new mongoose.Types.ObjectId(options.tenantId);
            }

            if (options.organizationId && mongoose.Types.ObjectId.isValid(options.organizationId)) {
                matchStage.organizationId = new mongoose.Types.ObjectId(options.organizationId);
            }

            if (options.startDate && options.endDate) {
                matchStage['timeline.proposedStart'] = { $lte: new Date(options.endDate) };
                matchStage['timeline.proposedEnd'] = { $gte: new Date(options.startDate) };
            }

            const stats = await ConsultantAssignment.aggregate([
                { $match: matchStage },
                {
                    $facet: {
                        byStatus: [
                            { $group: { _id: '$status.current', count: { $sum: 1 } } }
                        ],
                        byRole: [
                            { $group: { _id: '$details.role', count: { $sum: 1 } } }
                        ],
                        byClient: [
                            { $group: { _id: '$clientId', count: { $sum: 1 } } },
                            { $sort: { count: -1 } },
                            { $limit: 10 }
                        ],
                        financials: [
                            {
                                $group: {
                                    _id: null,
                                    totalBillableHours: { $sum: '$timeTracking.billableHoursLogged' },
                                    totalNonBillableHours: { $sum: '$timeTracking.nonBillableHoursLogged' },
                                    avgAllocation: { $avg: '$allocation.percentage' }
                                }
                            }
                        ],
                        totals: [
                            { $count: 'total' }
                        ]
                    }
                }
            ]);

            const result = stats[0];

            return {
                distribution: {
                    byStatus: result.byStatus,
                    byRole: result.byRole,
                    topClients: result.byClient
                },
                financials: result.financials[0] || {},
                totalAssignments: result.totals[0]?.total || 0,
                generatedAt: new Date()
            };

        } catch (error) {
            logger.error('Failed to generate assignment statistics', {
                error: error.message
            });
            throw error;
        }
    }

    // ============= PRIVATE HELPER METHODS =============

    /**
     * Find assignment record by ID or assignmentId
     * @private
     * @param {string} assignmentId - Record ID
     * @returns {Promise<Object>} Assignment document
     */
    async _findAssignmentRecord(assignmentId) {
        const dbService = this._getDatabaseService();
        const ConsultantAssignment = dbService.getModel('ConsultantAssignment', 'customer');

        let assignment;
        if (mongoose.Types.ObjectId.isValid(assignmentId)) {
            assignment = await ConsultantAssignment.findById(assignmentId);
        }

        if (!assignment) {
            assignment = await ConsultantAssignment.findOne({
                assignmentId: assignmentId.toUpperCase()
            });
        }

        if (!assignment) {
            throw AppError.notFound('Assignment not found', {
                context: { assignmentId }
            });
        }

        return assignment;
    }

    /**
     * Generate assignment ID
     * @private
     * @returns {string} Generated assignment ID
     */
    _generateAssignmentId() {
        const timestamp = Date.now().toString(36).toUpperCase();
        const random = crypto.randomBytes(3).toString('hex').toUpperCase();
        return `ASN-${timestamp}${random}`;
    }

    /**
     * Validate assignment data
     * @private
     * @param {Object} data - Assignment data
     */
    async _validateAssignmentData(data) {
        const errors = [];

        if (!data.clientId) {
            errors.push('Client ID is required');
        } else if (!mongoose.Types.ObjectId.isValid(data.clientId)) {
            errors.push('Invalid client ID format');
        }

        if (!data.projectId && !data.engagementId) {
            errors.push('Project ID or Engagement ID is required');
        }

        if (data.projectId && !mongoose.Types.ObjectId.isValid(data.projectId)) {
            errors.push('Invalid project ID format');
        }

        if (data.engagementId && !mongoose.Types.ObjectId.isValid(data.engagementId)) {
            errors.push('Invalid engagement ID format');
        }

        if (!data.role) {
            errors.push('Assignment role is required');
        }

        if (!data.timeline?.proposedStart) {
            errors.push('Proposed start date is required');
        }

        if (!data.timeline?.proposedEnd) {
            errors.push('Proposed end date is required');
        }

        if (data.timeline?.proposedStart && data.timeline?.proposedEnd) {
            const start = new Date(data.timeline.proposedStart);
            const end = new Date(data.timeline.proposedEnd);

            if (end <= start) {
                errors.push('End date must be after start date');
            }
        }

        if (data.allocation?.percentage !== undefined) {
            if (data.allocation.percentage < 0 || data.allocation.percentage > this.config.maxAllocationPercentage) {
                errors.push(`Allocation percentage must be between 0 and ${this.config.maxAllocationPercentage}`);
            }
        }

        if (data.billing?.rate !== undefined && data.billing.rate < 0) {
            errors.push('Rate cannot be negative');
        }

        if (errors.length > 0) {
            throw AppError.validation('Assignment validation failed', { errors });
        }
    }

    /**
     * Validate assignment update data
     * @private
     * @param {Object} updateData - Update data
     * @param {Object} existingRecord - Existing assignment record
     */
    async _validateAssignmentUpdateData(updateData, existingRecord) {
        const errors = [];

        if (updateData.allocation?.percentage !== undefined) {
            if (updateData.allocation.percentage < 0 || updateData.allocation.percentage > this.config.maxAllocationPercentage) {
                errors.push(`Allocation percentage must be between 0 and ${this.config.maxAllocationPercentage}`);
            }
        }

        if (updateData.billing?.rate !== undefined && updateData.billing.rate < 0) {
            errors.push('Rate cannot be negative');
        }

        // Prevent updates to completed/cancelled assignments
        const finalStatuses = [ASSIGNMENT_STATUS.COMPLETED, ASSIGNMENT_STATUS.CANCELLED, ASSIGNMENT_STATUS.TERMINATED];
        if (finalStatuses.includes(existingRecord.status.current)) {
            errors.push(`Cannot update assignment with status: ${existingRecord.status.current}`);
        }

        if (errors.length > 0) {
            throw AppError.validation('Update validation failed', { errors });
        }
    }

    /**
     * Validate allocation constraints
     * @private
     * @param {string} consultantId - Consultant ID
     * @param {number} allocationPercentage - Requested allocation
     * @param {Date} startDate - Start date
     * @param {Date} endDate - End date
     * @param {string} excludeAssignmentId - Assignment to exclude from check
     */
    async _validateAllocationConstraints(consultantId, allocationPercentage, startDate, endDate, excludeAssignmentId = null) {
        // Validate consultantId
        if (!consultantId || !mongoose.Types.ObjectId.isValid(consultantId)) {
            throw AppError.validation('Invalid consultant ID format');
        }

        const dbService = this._getDatabaseService();
        const ConsultantAssignment = dbService.getModel('ConsultantAssignment', 'customer');

        // Get overlapping active assignments
        const query = {
            consultantId: new mongoose.Types.ObjectId(consultantId),
            'status.current': { $in: [ASSIGNMENT_STATUS.ACTIVE, ASSIGNMENT_STATUS.CONFIRMED] },
            'status.isDeleted': false,
            'timeline.proposedStart': { $lt: new Date(endDate) },
            'timeline.proposedEnd': { $gt: new Date(startDate) }
        };

        if (excludeAssignmentId && mongoose.Types.ObjectId.isValid(excludeAssignmentId)) {
            query._id = { $ne: new mongoose.Types.ObjectId(excludeAssignmentId) };
        }

        const overlappingAssignments = await ConsultantAssignment.find(query);

        const existingAllocation = overlappingAssignments.reduce((sum, a) => sum + (a.allocation?.percentage || 0), 0);
        const totalAllocation = existingAllocation + allocationPercentage;

        if (totalAllocation > this.config.maxAllocationPercentage && !this.config.allowOverallocation) {
            throw AppError.validation('Allocation exceeds maximum allowed', {
                context: {
                    existingAllocation,
                    requestedAllocation: allocationPercentage,
                    totalAllocation,
                    maxAllowed: this.config.maxAllocationPercentage
                }
            });
        }

        if (totalAllocation > this.config.utilizationWarningThreshold) {
            logger.warn('High allocation warning', {
                consultantId,
                totalAllocation,
                threshold: this.config.utilizationWarningThreshold
            });
        }

        // Check concurrent assignments limit
        const activeCount = overlappingAssignments.length + 1;
        if (activeCount > this.config.maxConcurrentAssignments) {
            throw AppError.validation('Maximum concurrent assignments exceeded', {
                context: {
                    current: overlappingAssignments.length,
                    maxAllowed: this.config.maxConcurrentAssignments
                }
            });
        }
    }

    /**
     * Check for duplicate assignment
     * @private
     * @param {string} consultantId - Consultant ID
     * @param {Object} data - Assignment data
     */
    async _checkDuplicateAssignment(consultantId, data) {
        // Validate consultantId
        if (!consultantId || !mongoose.Types.ObjectId.isValid(consultantId)) {
            return; // Skip check if invalid ID
        }

        const dbService = this._getDatabaseService();
        const ConsultantAssignment = dbService.getModel('ConsultantAssignment', 'customer');

        const query = {
            consultantId: new mongoose.Types.ObjectId(consultantId),
            'status.isDeleted': false,
            'status.current': { $nin: [ASSIGNMENT_STATUS.CANCELLED, ASSIGNMENT_STATUS.TERMINATED] }
        };

        if (data.projectId && mongoose.Types.ObjectId.isValid(data.projectId)) {
            query.projectId = new mongoose.Types.ObjectId(data.projectId);
        }

        if (data.engagementId && mongoose.Types.ObjectId.isValid(data.engagementId)) {
            query.engagementId = new mongoose.Types.ObjectId(data.engagementId);
        }

        const existing = await ConsultantAssignment.findOne(query);

        if (existing) {
            throw AppError.conflict('Consultant already has an active assignment for this project/engagement', {
                context: { existingAssignmentId: existing.assignmentId }
            });
        }
    }

    /**
     * Determine initial status and approval requirements
     * @private
     * @param {Object} data - Assignment data
     * @param {Object} consultant - Consultant document
     * @param {Object} options - Options
     * @returns {Promise<Object>} Status and approval info
     */
    async _determineInitialStatus(data, consultant, options) {
        let status = ASSIGNMENT_STATUS.PROPOSED;
        let approvalRequired = true;

        // Auto-approve short assignments
        const duration = this._calculateDuration(data.timeline.proposedStart, data.timeline.proposedEnd);
        if (duration <= this.config.autoApproveThreshold) {
            approvalRequired = false;
            status = ASSIGNMENT_STATUS.CONFIRMED;
        }

        // Check rate threshold
        if (data.billing?.rate && data.billing.rate > this.config.requireApprovalAboveRate) {
            approvalRequired = true;
            status = ASSIGNMENT_STATUS.PENDING_APPROVAL;
        }

        // High allocation requires approval
        if (data.allocation?.percentage > 80) {
            approvalRequired = true;
            status = ASSIGNMENT_STATUS.PENDING_APPROVAL;
        }

        return { status, approvalRequired };
    }

    /**
     * Build approval levels
     * @private
     * @param {Object} data - Assignment data
     * @param {Object} consultant - Consultant document
     * @returns {Array} Approval levels
     */
    _buildApprovalLevels(data, consultant) {
        const levels = [];

        // Level 1: Manager approval with validation
        if (consultant.professional?.manager && mongoose.Types.ObjectId.isValid(consultant.professional.manager)) {
            levels.push({
                level: 1,
                name: 'Manager Approval',
                approvers: [consultant.professional.manager],
                required: true
            });
        }

        // Level 2: High-value assignments need additional approval
        if (data.billing?.rate > this.config.requireApprovalAboveRate * 2) {
            levels.push({
                level: 2,
                name: 'Finance Approval',
                approvers: [], // Would be populated from org settings
                required: true
            });
        }

        return levels.length > 0 ? levels : [{
            level: 1,
            name: 'Default Approval',
            approvers: [],
            required: true
        }];
    }

    /**
     * Determine role level
     * @private
     * @param {string} role - Role name
     * @returns {number} Role level (1-10)
     */
    _determineRoleLevel(role) {
        const levelMap = {
            [ASSIGNMENT_ROLES.LEAD]: 1,
            [ASSIGNMENT_ROLES.SENIOR_CONSULTANT]: 2,
            [ASSIGNMENT_ROLES.PROJECT_MANAGER]: 2,
            [ASSIGNMENT_ROLES.SUBJECT_MATTER_EXPERT]: 3,
            [ASSIGNMENT_ROLES.CONSULTANT]: 4,
            [ASSIGNMENT_ROLES.SPECIALIST]: 4,
            [ASSIGNMENT_ROLES.ADVISOR]: 5,
            [ASSIGNMENT_ROLES.JUNIOR_CONSULTANT]: 6,
            [ASSIGNMENT_ROLES.ANALYST]: 7
        };

        return levelMap[role] || 5;
    }

    /**
     * Calculate duration in days
     * @private
     * @param {Date} startDate - Start date
     * @param {Date} endDate - End date
     * @returns {number} Duration in days
     */
    _calculateDuration(startDate, endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        return Math.ceil((end - start) / (1000 * 60 * 60 * 24));
    }

    /**
     * Calculate weekly hours from allocation percentage
     * @private
     * @param {number} percentage - Allocation percentage
     * @returns {number} Hours per week
     */
    _calculateWeeklyHours(percentage) {
        const standardWeeklyHours = 40;
        return Math.round((percentage / 100) * standardWeeklyHours);
    }

    /**
     * Calculate margin percentage
     * @private
     * @param {number} clientRate - Client rate
     * @param {number} consultantRate - Consultant rate
     * @returns {number} Margin percentage
     */
    _calculateMargin(clientRate, consultantRate) {
        if (!clientRate || !consultantRate || clientRate === 0) {
            return 0;
        }
        return Math.round(((clientRate - consultantRate) / clientRate) * 100);
    }

    /**
     * Update consultant's assignment summary
     * @private
     * @param {string} consultantId - Consultant ID
     */
    async _updateConsultantAssignmentSummary(consultantId) {
        try {
            // Validate consultantId
            if (!consultantId || !mongoose.Types.ObjectId.isValid(consultantId)) {
                logger.warn('Invalid consultant ID for assignment summary update', { consultantId });
                return;
            }

            const dbService = this._getDatabaseService();
            const Consultant = dbService.getModel('Consultant', 'customer');
            const ConsultantAssignment = dbService.getModel('ConsultantAssignment', 'customer');

            const now = new Date();

            // Get active assignments
            const activeAssignments = await ConsultantAssignment.find({
                consultantId: new mongoose.Types.ObjectId(consultantId),
                'status.current': { $in: [ASSIGNMENT_STATUS.ACTIVE, ASSIGNMENT_STATUS.CONFIRMED] },
                'status.isDeleted': false,
                'timeline.proposedEnd': { $gte: now }
            }).select('assignmentId allocation.percentage clientId projectId');

            const totalAllocation = activeAssignments.reduce((sum, a) => sum + (a.allocation?.percentage || 0), 0);

            // Get total assignment count
            const totalAssignments = await ConsultantAssignment.countDocuments({
                consultantId: new mongoose.Types.ObjectId(consultantId),
                'status.isDeleted': false
            });

            await Consultant.findByIdAndUpdate(consultantId, {
                $set: {
                    'assignments.total': totalAssignments,
                    'assignments.active': activeAssignments.length,
                    'assignments.current': activeAssignments.map(a => ({
                        assignmentId: a._id,
                        allocation: a.allocation?.percentage
                    })),
                    'availability.currentUtilization': totalAllocation,
                    'availability.lastUpdated': now
                }
            });

        } catch (error) {
            logger.warn('Failed to update consultant assignment summary', {
                error: error.message,
                consultantId
            });
        }
    }

    /**
     * Update consultant utilization
     * @private
     * @param {string} consultantId - Consultant ID
     * @param {number} hoursLogged - Hours logged
     */
    async _updateConsultantUtilization(consultantId, hoursLogged) {
        try {
            // Validate consultantId
            if (!consultantId || !mongoose.Types.ObjectId.isValid(consultantId)) {
                return;
            }

            const dbService = this._getDatabaseService();
            const Consultant = dbService.getModel('Consultant', 'customer');

            await Consultant.findByIdAndUpdate(consultantId, {
                $inc: {
                    'analytics.currentYear.totalHours': hoursLogged,
                    'analytics.currentYear.billableHours': hoursLogged
                }
            });

        } catch (error) {
            logger.warn('Failed to update consultant utilization', {
                error: error.message,
                consultantId
            });
        }
    }

    /**
     * Update consultant performance metrics
     * @private
     * @param {string} consultantId - Consultant ID
     * @param {Object} performance - Performance ratings
     */
    async _updateConsultantPerformance(consultantId, performance) {
        if (!performance) return;

        try {
            // Validate consultantId
            if (!consultantId || !mongoose.Types.ObjectId.isValid(consultantId)) {
                return;
            }

            const dbService = this._getDatabaseService();
            const Consultant = dbService.getModel('Consultant', 'customer');

            // This would calculate rolling averages in a real implementation
            if (performance.clientSatisfaction?.rating) {
                await Consultant.findByIdAndUpdate(consultantId, {
                    $push: {
                        'performance.reviews': {
                            rating: performance.clientSatisfaction.rating,
                            type: 'assignment_completion',
                            date: new Date()
                        }
                    }
                });
            }

        } catch (error) {
            logger.warn('Failed to update consultant performance', {
                error: error.message,
                consultantId
            });
        }
    }

    /**
     * Handle post-creation workflows
     * @private
     * @param {Object} assignment - Created assignment record
     * @param {Object} consultant - Consultant document
     * @param {Object} options - Options
     */
    async _handlePostAssignmentCreation(assignment, consultant, options) {
        try {
            // Send notification if approval required
            if (assignment.approval?.required && assignment.approval?.status === APPROVAL_STATUS.PENDING) {
                await this._sendApprovalNotification(assignment, consultant);
            }

            // Track creation event
            await this._trackAssignmentEvent(assignment, 'assignment_created', {
                userId: options.userId
            });

        } catch (error) {
            logger.warn('Post-creation workflows failed', {
                error: error.message,
                assignmentId: assignment._id
            });
        }
    }

    /**
     * Send approval notification
     * @private
     * @param {Object} assignment - Assignment record
     * @param {Object} consultant - Consultant document
     */
    async _sendApprovalNotification(assignment, consultant) {
        try {
            const currentLevel = assignment.approval?.levels?.find(l => l.level === assignment.approval?.currentLevel);

            if (currentLevel?.approvers?.length > 0) {
                const dbService = this._getDatabaseService();
                const User = dbService.getModel('User', 'customer');

                for (const approverId of currentLevel.approvers) {
                    // Validate approver ID
                    if (!approverId || !mongoose.Types.ObjectId.isValid(approverId)) {
                        continue;
                    }

                    const approver = await User.findById(approverId).select('email profile.firstName');

                    if (approver?.email) {
                        await this.notificationService?.sendEmail?.({
                            to: approver.email,
                            template: 'assignment_approval_required',
                            data: {
                                approverName: approver.profile?.firstName,
                                consultantName: `${consultant.profile?.firstName} ${consultant.profile?.lastName}`,
                                assignmentTitle: assignment.details?.title,
                                approvalUrl: `${this.config.platformUrl}/approvals/assignments/${assignment._id}`
                            }
                        });
                    }
                }
            }
        } catch (error) {
            logger.warn('Failed to send approval notification', {
                error: error.message,
                assignmentId: assignment._id
            });
        }
    }

    /**
     * Send assignment notification
     * @private
     * @param {Object} assignment - Assignment record
     * @param {string} action - Action type
     * @param {Object} options - Options
     */
    async _sendAssignmentNotification(assignment, action, options) {
        try {
            const dbService = this._getDatabaseService();
            const Consultant = dbService.getModel('Consultant', 'customer');

            const consultant = await Consultant.findById(assignment.consultantId)
                .select('contact.email.primary profile.firstName');

            if (consultant?.contact?.email?.primary) {
                await this.notificationService?.sendEmail?.({
                    to: consultant.contact.email.primary,
                    template: `assignment_${action}`,
                    data: {
                        firstName: consultant.profile?.firstName,
                        assignmentTitle: assignment.details?.title,
                        startDate: assignment.timeline?.proposedStart,
                        endDate: assignment.timeline?.proposedEnd,
                        reason: options.reason
                    }
                });
            }
        } catch (error) {
            logger.warn('Failed to send assignment notification', {
                error: error.message,
                assignmentId: assignment._id
            });
        }
    }

    /**
     * Send budget alert
     * @private
     * @param {Object} assignment - Assignment record
     * @param {number} threshold - Alert threshold
     * @param {number} usedPercentage - Current usage percentage
     */
    async _sendBudgetAlert(assignment, threshold, usedPercentage) {
        try {
            await this.notificationService?.sendEmail?.({
                to: assignment.metadata?.createdBy, // Would lookup actual email
                template: 'budget_alert',
                data: {
                    assignmentTitle: assignment.details?.title,
                    threshold,
                    usedPercentage: Math.round(usedPercentage),
                    budgetTotal: assignment.billing?.budget?.total,
                    budgetUsed: assignment.billing?.budget?.used
                }
            });
        } catch (error) {
            logger.warn('Failed to send budget alert', {
                error: error.message,
                assignmentId: assignment._id
            });
        }
    }

    /**
     * Track assignment event
     * @private
     * @param {Object} assignment - Assignment record
     * @param {string} eventType - Event type
     * @param {Object} data - Event data
     */
    async _trackAssignmentEvent(assignment, eventType, data) {
        try {
            await this.analyticsService?.trackEvent?.({
                eventType,
                entityType: 'consultant_assignment',
                entityId: assignment._id,
                tenantId: assignment.tenantId,
                data: {
                    assignmentId: assignment.assignmentId,
                    consultantId: assignment.consultantId,
                    projectId: assignment.projectId,
                    clientId: assignment.clientId,
                    ...data
                },
                timestamp: new Date()
            });
        } catch (error) {
            logger.warn('Failed to track assignment event', {
                error: error.message,
                eventType,
                assignmentId: assignment._id
            });
        }
    }

    /**
     * Sanitize assignment output
     * @private
     * @param {Object} assignment - Assignment document
     * @returns {Object} Sanitized assignment
     */
    _sanitizeAssignmentOutput(assignment) {
        if (!assignment) return null;

        const sanitized = assignment.toObject ? assignment.toObject() : { ...assignment };

        // Remove internal fields
        delete sanitized.__v;

        return sanitized;
    }
}

// Export singleton instance
module.exports = new ConsultantAssignmentService();
module.exports.ConsultantAssignmentService = ConsultantAssignmentService;
module.exports.ASSIGNMENT_STATUS = ASSIGNMENT_STATUS;
module.exports.ASSIGNMENT_ROLES = ASSIGNMENT_ROLES;
module.exports.RATE_TYPES = RATE_TYPES;
module.exports.APPROVAL_STATUS = APPROVAL_STATUS;
module.exports.WORK_LOCATIONS = WORK_LOCATIONS;