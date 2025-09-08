'use strict';

/**
 * @fileoverview Enterprise consultant service with comprehensive lifecycle management, skill matching, and performance tracking
 * @module servers/customer-services/modules/core-business/consultants/services/consultant-service
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/async-handler
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/services/email-service
 * @requires module:shared/lib/services/notification-service
 * @requires module:shared/lib/security/audit/audit-service
 * @requires module:servers/customer-services/modules/core-business/consultants/models/consultant-model
 * @requires module:servers/customer-services/modules/core-business/consultants/models/consultant-skill-model
 * @requires module:servers/customer-services/modules/core-business/consultants/models/consultant-availability-model
 * @requires module:servers/customer-services/modules/core-business/consultants/models/consultant-profile-model
 */

const mongoose = require('mongoose');
const logger = require('../../../../../../shared/lib/utils/logger');
const { AppError, ValidationError, NotFoundError, ConflictError, ForbiddenError } = require('../../../../../../shared/lib/utils/app-error');
const asyncHandler = require('../../../../../../shared/lib/utils/async-handler');
const CacheService = require('../../../../../../shared/lib/services/cache-service');
const EmailService = require('../../../../../../shared/lib/services/email-service');
const NotificationService = require('../../../../../../shared/lib/services/notification-service');
const AuditService = require('../../../../../../shared/lib/security/audit/audit-service');
const CalendarService = require('../../../../../../shared/lib/services/calendar-service');
const ConsultantModel = require('../../../../../../shared/lib/database/models/customer-services/core-business/consultants/consultant-model');
const ConsultantSkillModel = require('../../../../../../shared/lib/database/models/customer-services/core-business/consultants/consultant-skill-model');
const ConsultantAvailabilityModel = require('../../../../../../shared/lib/database/models/customer-services/core-business/consultants/consultant-availability-model');
const ConsultantProfileModel = require('../../../../../../shared/lib/database/models/customer-services/core-business/consultants/consultant-profile-model');
const ExcelJS = require('exceljs');
const csv = require('csv-parse/sync');
const crypto = require('crypto');
const moment = require('moment');

/**
 * Enterprise consultant service for comprehensive consultant lifecycle management
 * @class ConsultantService
 * @description Manages all consultant-related operations with multi-tenant support, skill matching, and performance tracking
 */
class ConsultantService {
    /**
     * @private
     * @type {CacheService}
     */
    #cacheService;

    /**
     * @private
     * @type {EmailService}
     */
    #emailService;

    /**
     * @private
     * @type {NotificationService}
     */
    #notificationService;

    /**
     * @private
     * @type {AuditService}
     */
    #auditService;

    /**
     * @private
     * @type {CalendarService}
     */
    #calendarService;

    /**
     * @private
     * @type {number}
     */
    #defaultCacheTTL = 3600; // 1 hour

    /**
     * @private
     * @type {number}
     */
    #maxBulkOperationSize = 500;

    /**
     * @private
     * @type {Map}
     */
    #pendingTransactions = new Map();

    /**
     * @private
     * @type {Object}
     */
    #levelRequirements = {
        junior: { minExperience: 0, maxExperience: 2, minSkills: 3, targetUtilization: 60 },
        mid: { minExperience: 2, maxExperience: 5, minSkills: 5, targetUtilization: 70 },
        senior: { minExperience: 5, maxExperience: 8, minSkills: 8, targetUtilization: 80 },
        lead: { minExperience: 8, maxExperience: 12, minSkills: 10, targetUtilization: 75 },
        principal: { minExperience: 10, maxExperience: null, minSkills: 12, targetUtilization: 70 },
        director: { minExperience: 12, maxExperience: null, minSkills: 15, targetUtilization: 60 },
        partner: { minExperience: 15, maxExperience: null, minSkills: 20, targetUtilization: 50 }
    };

    /**
     * @private
     * @type {Object}
     */
    #performanceThresholds = {
        excellent: { minRating: 4.5, bonusMultiplier: 1.5 },
        good: { minRating: 3.5, bonusMultiplier: 1.2 },
        satisfactory: { minRating: 2.5, bonusMultiplier: 1.0 },
        needsImprovement: { minRating: 1.5, bonusMultiplier: 0.8 },
        unsatisfactory: { minRating: 0, bonusMultiplier: 0 }
    };

    /**
     * Creates an instance of ConsultantService
     * @constructor
     * @param {Object} dependencies - Service dependencies
     * @param {CacheService} dependencies.cacheService - Cache service instance
     * @param {EmailService} dependencies.emailService - Email service instance
     * @param {NotificationService} dependencies.notificationService - Notification service instance
     * @param {AuditService} dependencies.auditService - Audit service instance
     * @param {CalendarService} dependencies.calendarService - Calendar service instance
     */
    constructor(dependencies = {}) {
        this.#cacheService = dependencies.cacheService || new CacheService();
        this.#emailService = dependencies.emailService || new EmailService();
        this.#notificationService = dependencies.notificationService || new NotificationService();
        this.#auditService = dependencies.auditService || new AuditService();
        this.#calendarService = dependencies.calendarService || new CalendarService();

        this.#initializeService();
    }

    /**
     * Initialize service components
     * @private
     */
    #initializeService() {
        logger.info('Initializing ConsultantService', {
            cacheEnabled: !!this.#cacheService,
            emailEnabled: !!this.#emailService,
            notificationEnabled: !!this.#notificationService,
            auditEnabled: !!this.#auditService,
            calendarEnabled: !!this.#calendarService
        });
    }

    // ==================== CRUD Operations ====================

    /**
     * Create a new consultant with comprehensive validation and setup
     * @param {Object} consultantData - Consultant data to create
     * @param {string} userId - ID of user creating the consultant
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} Created consultant object
     * @throws {ValidationError} If validation fails
     * @throws {ConflictError} If consultant already exists
     */
    async createConsultant(consultantData, userId, options = {}) {
        const session = options.session || null;

        try {
            // Validate required fields
            await this.#validateConsultantData(consultantData);

            // Check for duplicates
            await this.#checkDuplicateConsultant(consultantData);

            // Validate skill requirements for level
            await this.#validateLevelRequirements(consultantData);

            // Enrich consultant data
            const enrichedData = await this.#enrichConsultantData(consultantData, userId);

            // Generate consultant code if not provided
            if (!enrichedData.consultantCode) {
                enrichedData.consultantCode = await ConsultantModel.generateConsultantCode();
            }

            // Set initial profile status
            enrichedData.profile = {
                ...enrichedData.profile,
                status: 'active',
                startDate: new Date()
            };

            // Set initial availability
            enrichedData.availability = {
                status: 'available',
                currentUtilization: 0,
                targetUtilization: this.#levelRequirements[enrichedData.profile.level]?.targetUtilization || 80,
                capacity: {
                    hoursPerWeek: 40,
                    daysPerWeek: 5,
                    maxProjects: 3
                }
            };

            // Create consultant
            const consultant = await ConsultantModel.create([enrichedData], { session });

            // Create associated records
            await this.#createAssociatedRecords(consultant[0], userId, session);

            // Set up initial skills if provided
            if (consultantData.skills && consultantData.skills.length > 0) {
                await this.#createInitialSkills(consultant[0]._id, consultantData.skills, userId, session);
            }

            // Initialize availability calendar
            await this.#initializeAvailabilityCalendar(consultant[0]._id, enrichedData.tenantId, session);

            // Send onboarding notifications
            await this.#sendOnboardingNotifications(consultant[0], userId);

            // Schedule initial training and assessments
            await this.#scheduleInitialActivities(consultant[0], userId);

            // Log audit trail
            await this.#auditService.log({
                action: 'CONSULTANT_CREATED',
                entityType: 'consultant',
                entityId: consultant[0]._id,
                userId,
                details: {
                    consultantCode: consultant[0].consultantCode,
                    name: `${consultant[0].personalInfo.firstName} ${consultant[0].personalInfo.lastName}`,
                    level: consultant[0].profile.level
                }
            });

            // Clear relevant caches
            await this.#clearConsultantCaches(enrichedData.tenantId);

            logger.info('Consultant created successfully', {
                consultantId: consultant[0]._id,
                consultantCode: consultant[0].consultantCode,
                createdBy: userId
            });

            return consultant[0];
        } catch (error) {
            logger.error('Error creating consultant', {
                error: error.message,
                consultantData: consultantData.personalInfo?.firstName,
                userId
            });
            throw error;
        }
    }

    /**
     * Get consultant by ID with optional data population
     * @param {string} consultantId - Consultant ID
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Consultant object
     * @throws {NotFoundError} If consultant not found
     */
    async getConsultantById(consultantId, options = {}) {
        const {
            populate = [],
            includeDeleted = false,
            includeArchived = false,
            checkPermissions = true,
            userId,
            tenantId
        } = options;

        try {
            // Check cache first
            const cacheKey = this.#generateCacheKey('consultant', consultantId, options);
            const cached = await this.#cacheService.get(cacheKey);
            if (cached) {
                return cached;
            }

            // Build query
            const query = { _id: consultantId };
            if (!includeDeleted) query.isDeleted = false;
            if (!includeArchived) query['archiveStatus.isArchived'] = { $ne: true };
            if (tenantId) query.tenantId = tenantId;

            // Execute query
            let consultantQuery = ConsultantModel.findOne(query);

            // Apply population
            if (populate.includes('skills')) {
                consultantQuery = consultantQuery.populate('skills.technical.skillId');
            }
            if (populate.includes('engagements')) {
                consultantQuery = consultantQuery.populate('engagements.current.projectId');
            }
            if (populate.includes('profile')) {
                consultantQuery = consultantQuery.populate('profile');
            }
            if (populate.includes('availability')) {
                consultantQuery = consultantQuery.populate('availability');
            }

            const consultant = await consultantQuery.exec();

            if (!consultant) {
                throw new NotFoundError('Consultant not found', 'CONSULTANT_NOT_FOUND');
            }

            // Check permissions
            if (checkPermissions && userId) {
                await this.#checkConsultantAccess(consultant, userId, 'read');
            }

            // Calculate additional metrics
            const enrichedConsultant = await this.#enrichConsultantWithMetrics(consultant.toObject());

            // Cache result
            await this.#cacheService.set(cacheKey, enrichedConsultant, this.#defaultCacheTTL);

            return enrichedConsultant;
        } catch (error) {
            logger.error('Error fetching consultant', {
                error: error.message,
                consultantId
            });
            throw error;
        }
    }

    /**
     * Update consultant with validation and change tracking
     * @param {string} consultantId - Consultant ID to update
     * @param {Object} updateData - Data to update
     * @param {string} userId - User performing update
     * @param {Object} options - Update options
     * @returns {Promise<Object>} Updated consultant
     * @throws {ValidationError} If validation fails
     * @throws {NotFoundError} If consultant not found
     */
    async updateConsultant(consultantId, updateData, userId, options = {}) {
        const session = options.session || null;

        try {
            // Get existing consultant
            const existingConsultant = await this.getConsultantById(consultantId, {
                checkPermissions: true,
                userId,
                tenantId: options.tenantId
            });

            if (!existingConsultant) {
                throw new NotFoundError('Consultant not found', 'CONSULTANT_NOT_FOUND');
            }

            // Check permissions
            await this.#checkConsultantAccess(existingConsultant, userId, 'write');

            // Validate update data
            await this.#validateUpdateData(updateData, existingConsultant);

            // Check for level change requirements
            if (updateData.profile?.level) {
                await this.#validateLevelChange(existingConsultant, updateData.profile.level);
            }

            // Track changes for audit
            const changes = await this.#trackChanges(existingConsultant, updateData);

            // Apply business rules
            const processedData = await this.#applyBusinessRules(updateData, existingConsultant);

            // Handle rate changes
            if (updateData.billing?.standardRate) {
                await this.#validateRateChange(existingConsultant, updateData.billing.standardRate, userId);
            }

            // Update consultant
            const updatedConsultant = await ConsultantModel.findByIdAndUpdate(
                consultantId,
                {
                    $set: processedData,
                    $push: {
                        auditLog: {
                            action: 'updated',
                            field: Object.keys(changes).join(', '),
                            oldValue: changes,
                            newValue: processedData,
                            changedBy: userId,
                            changedAt: new Date()
                        }
                    }
                },
                {
                    new: true,
                    runValidators: true,
                    session
                }
            );

            // Handle status changes
            if (updateData.profile?.status) {
                await this.#handleStatusChange(updatedConsultant, existingConsultant, userId);
            }

            // Update skills if changed
            if (updateData.skills) {
                await this.#updateConsultantSkills(consultantId, updateData.skills, userId, session);
            }

            // Update availability if changed
            if (updateData.availability) {
                await this.#updateConsultantAvailability(consultantId, updateData.availability, userId, session);
            }

            // Recalculate utilization if needed
            if (this.#shouldRecalculateUtilization(updateData)) {
                await updatedConsultant.calculateUtilization();
            }

            // Send notifications for significant changes
            await this.#sendUpdateNotifications(updatedConsultant, changes, userId);

            // Log audit trail
            await this.#auditService.log({
                action: 'CONSULTANT_UPDATED',
                entityType: 'consultant',
                entityId: consultantId,
                userId,
                details: {
                    changes,
                    fieldsUpdated: Object.keys(changes)
                }
            });

            // Clear caches
            await this.#clearConsultantCaches(updatedConsultant.tenantId, consultantId);

            logger.info('Consultant updated successfully', {
                consultantId,
                updatedBy: userId,
                fieldsUpdated: Object.keys(changes)
            });

            return updatedConsultant;
        } catch (error) {
            logger.error('Error updating consultant', {
                error: error.message,
                consultantId,
                userId
            });
            throw error;
        }
    }

    /**
     * Delete consultant (soft delete by default)
     * @param {string} consultantId - Consultant ID to delete
     * @param {string} userId - User performing deletion
     * @param {Object} options - Deletion options
     * @returns {Promise<boolean>} Success status
     * @throws {NotFoundError} If consultant not found
     * @throws {ForbiddenError} If deletion not allowed
     */
    async deleteConsultant(consultantId, userId, options = {}) {
        const { hardDelete = false, reason, session = null } = options;

        try {
            const consultant = await this.getConsultantById(consultantId, {
                includeDeleted: hardDelete,
                checkPermissions: true,
                userId
            });

            if (!consultant) {
                throw new NotFoundError('Consultant not found', 'CONSULTANT_NOT_FOUND');
            }

            // Check for active engagements
            await this.#checkDeletionConstraints(consultant);

            // Check permissions
            await this.#checkConsultantAccess(consultant, userId, 'delete');

            if (hardDelete) {
                // Perform hard delete with cascade
                await this.#performHardDelete(consultantId, session);
            } else {
                // Soft delete
                await ConsultantModel.findByIdAndUpdate(
                    consultantId,
                    {
                        isDeleted: true,
                        deletedAt: new Date(),
                        deletedBy: userId,
                        'profile.status': 'terminated'
                    },
                    { session }
                );
            }

            // Archive related data
            await this.#archiveConsultantData(consultantId, userId, session);

            // Handle offboarding processes
            await this.#handleOffboarding(consultant, userId, reason);

            // Send notifications
            await this.#sendDeletionNotifications(consultant, userId, reason);

            // Log audit trail
            await this.#auditService.log({
                action: hardDelete ? 'CONSULTANT_HARD_DELETED' : 'CONSULTANT_SOFT_DELETED',
                entityType: 'consultant',
                entityId: consultantId,
                userId,
                details: {
                    consultantCode: consultant.consultantCode,
                    name: `${consultant.personalInfo.firstName} ${consultant.personalInfo.lastName}`,
                    reason
                }
            });

            // Clear all caches
            await this.#clearConsultantCaches(consultant.tenantId, consultantId);

            logger.info('Consultant deleted successfully', {
                consultantId,
                deletedBy: userId,
                hardDelete,
                reason
            });

            return true;
        } catch (error) {
            logger.error('Error deleting consultant', {
                error: error.message,
                consultantId,
                userId
            });
            throw error;
        }
    }

    // ==================== Search & Matching ====================

    /**
     * Search consultants with advanced filtering and skill matching
     * @param {Object} searchCriteria - Search parameters
     * @param {Object} options - Search options
     * @returns {Promise<Object>} Search results with pagination
     */
    async searchConsultants(searchCriteria, options = {}) {
        const {
            page = 1,
            limit = 20,
            sort = { 'performance.currentRating': -1 },
            populate = [],
            includeArchived = false,
            tenantId,
            userId
        } = options;

        try {
            // Build search query
            const query = await this.#buildSearchQuery(searchCriteria, {
                includeArchived,
                tenantId
            });

            // Apply skill matching if specified
            if (searchCriteria.requiredSkills && searchCriteria.requiredSkills.length > 0) {
                query['skills.technical.name'] = { $in: searchCriteria.requiredSkills };
            }

            // Execute search with pagination
            const skip = (page - 1) * limit;

            let searchQuery = ConsultantModel.find(query)
                .skip(skip)
                .limit(limit)
                .sort(sort);

            // Apply population
            if (populate.includes('skills')) {
                searchQuery = searchQuery.populate('skills.technical.skillId');
            }

            const [consultants, total] = await Promise.all([
                searchQuery.exec(),
                ConsultantModel.countDocuments(query)
            ]);

            // Enrich with additional data and calculate match scores
            const enrichedConsultants = await Promise.all(
                consultants.map(async consultant => {
                    const enriched = await this.#enrichConsultantWithMetrics(consultant.toObject());
                    if (searchCriteria.requiredSkills) {
                        enriched.matchScore = await this.#calculateMatchScore(consultant, searchCriteria);
                    }
                    return enriched;
                })
            );

            // Sort by match score if skill matching was performed
            if (searchCriteria.requiredSkills) {
                enrichedConsultants.sort((a, b) => b.matchScore - a.matchScore);
            }

            // Calculate pagination metadata
            const totalPages = Math.ceil(total / limit);
            const hasNextPage = page < totalPages;
            const hasPrevPage = page > 1;

            return {
                consultants: enrichedConsultants,
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages,
                    hasNextPage,
                    hasPrevPage
                },
                filters: searchCriteria
            };
        } catch (error) {
            logger.error('Error searching consultants', {
                error: error.message,
                searchCriteria
            });
            throw error;
        }
    }

    /**
     * Find available consultants for project requirements
     * @param {Object} requirements - Project requirements
     * @param {Object} options - Search options
     * @returns {Promise<Array>} Matching consultants
     */
    async findAvailableConsultants(requirements, options = {}) {
        const {
            startDate,
            endDate,
            requiredSkills = [],
            preferredSkills = [],
            level,
            allocation = 100,
            maxRate,
            location,
            tenantId,
            limit = 20
        } = requirements;

        try {
            // Check cache
            const cacheKey = this.#generateCacheKey('available-consultants', requirements, options);
            const cached = await this.#cacheService.get(cacheKey);
            if (cached) {
                return cached;
            }

            // Use static method from model for initial filtering
            const availableConsultants = await ConsultantModel.findAvailableConsultants(tenantId, {
                skills: requiredSkills,
                level,
                startDate,
                endDate,
                allocation,
                location,
                maxRate,
                limit: limit * 2 // Get more for scoring
            });

            // Score and rank consultants
            const scoredConsultants = await Promise.all(
                availableConsultants.map(async consultant => {
                    const score = await this.#scoreConsultantForProject({
                        consultant,
                        requiredSkills,
                        preferredSkills,
                        startDate,
                        endDate,
                        allocation,
                        level
                    });

                    return {
                        ...consultant.toObject(),
                        availabilityScore: score.availability,
                        skillScore: score.skills,
                        experienceScore: score.experience,
                        rateScore: score.rate,
                        totalScore: score.total,
                        recommendation: this.#generateRecommendation(score)
                    };
                })
            );

            // Sort by total score and limit
            const topConsultants = scoredConsultants
                .sort((a, b) => b.totalScore - a.totalScore)
                .slice(0, limit);

            // Cache results
            await this.#cacheService.set(cacheKey, topConsultants, 900); // 15 minutes

            return topConsultants;
        } catch (error) {
            logger.error('Error finding available consultants', {
                error: error.message,
                requirements
            });
            throw error;
        }
    }

    // ==================== Bulk Operations ====================

    /**
     * Bulk create consultants with validation and rollback support
     * @param {Array} consultantsData - Array of consultant data
     * @param {string} userId - User performing bulk creation
     * @param {Object} options - Bulk operation options
     * @returns {Promise<Object>} Bulk operation results
     */
    async bulkCreateConsultants(consultantsData, userId, options = {}) {
        const { validateAll = true, stopOnError = false, tenantId } = options;
        const session = await mongoose.startSession();

        try {
            session.startTransaction();

            const results = {
                successful: [],
                failed: [],
                total: consultantsData.length
            };

            // Validate bulk size
            if (consultantsData.length > this.#maxBulkOperationSize) {
                throw new ValidationError(
                    `Bulk operation size exceeds maximum of ${this.#maxBulkOperationSize}`,
                    'BULK_SIZE_EXCEEDED'
                );
            }

            // Validate all if required
            if (validateAll) {
                for (const [index, consultantData] of consultantsData.entries()) {
                    try {
                        await this.#validateConsultantData(consultantData);
                        await this.#validateLevelRequirements(consultantData);
                    } catch (error) {
                        results.failed.push({
                            index,
                            data: consultantData,
                            error: error.message
                        });
                        if (stopOnError) {
                            throw error;
                        }
                    }
                }
            }

            // Process each consultant
            for (const [index, consultantData] of consultantsData.entries()) {
                try {
                    const enrichedData = await this.#enrichConsultantData(consultantData, userId);
                    enrichedData.tenantId = tenantId;

                    if (!enrichedData.consultantCode) {
                        enrichedData.consultantCode = await ConsultantModel.generateConsultantCode();
                    }

                    const consultant = await ConsultantModel.create([enrichedData], { session });

                    // Create associated records
                    await this.#createAssociatedRecords(consultant[0], userId, session);

                    results.successful.push({
                        index,
                        consultantId: consultant[0]._id,
                        consultantCode: consultant[0].consultantCode,
                        name: `${consultant[0].personalInfo.firstName} ${consultant[0].personalInfo.lastName}`
                    });
                } catch (error) {
                    results.failed.push({
                        index,
                        data: consultantData,
                        error: error.message
                    });
                    if (stopOnError) {
                        throw error;
                    }
                }
            }

            await session.commitTransaction();

            // Send bulk notifications
            if (results.successful.length > 0) {
                await this.#sendBulkCreationNotifications(results.successful, userId);
            }

            // Log audit trail
            await this.#auditService.log({
                action: 'BULK_CONSULTANTS_CREATED',
                entityType: 'consultant',
                userId,
                details: {
                    total: results.total,
                    successful: results.successful.length,
                    failed: results.failed.length
                }
            });

            // Clear caches
            await this.#clearConsultantCaches(tenantId);

            logger.info('Bulk consultant creation completed', {
                total: results.total,
                successful: results.successful.length,
                failed: results.failed.length,
                userId
            });

            return results;
        } catch (error) {
            await session.abortTransaction();
            logger.error('Error in bulk consultant creation', {
                error: error.message,
                userId
            });
            throw error;
        } finally {
            session.endSession();
        }
    }

    /**
     * Bulk update consultant skills
     * @param {Array} skillUpdates - Array of skill update objects
     * @param {string} userId - User performing updates
     * @param {Object} options - Update options
     * @returns {Promise<Object>} Bulk update results
     */
    async bulkUpdateSkills(skillUpdates, userId, options = {}) {
        const session = await mongoose.startSession();

        try {
            session.startTransaction();

            const results = {
                successful: [],
                failed: [],
                total: skillUpdates.length
            };

            for (const update of skillUpdates) {
                try {
                    const { consultantId, skills, action = 'add' } = update;

                    switch (action) {
                        case 'add':
                            await this.#addConsultantSkills(consultantId, skills, userId, session);
                            break;
                        case 'update':
                            await this.#updateConsultantSkills(consultantId, skills, userId, session);
                            break;
                        case 'remove':
                            await this.#removeConsultantSkills(consultantId, skills, userId, session);
                            break;
                        default:
                            throw new ValidationError(`Invalid action: ${action}`, 'INVALID_ACTION');
                    }

                    results.successful.push({
                        consultantId,
                        action,
                        skillsCount: skills.length
                    });
                } catch (error) {
                    results.failed.push({
                        consultantId: update.consultantId,
                        error: error.message
                    });
                }
            }

            await session.commitTransaction();

            // Clear caches
            await this.#clearConsultantCaches(options.tenantId);

            return results;
        } catch (error) {
            await session.abortTransaction();
            logger.error('Error in bulk skill update', {
                error: error.message,
                userId
            });
            throw error;
        } finally {
            session.endSession();
        }
    }

    // ==================== Performance & Analytics ====================

    /**
     * Calculate consultant performance metrics
     * @param {string} consultantId - Consultant ID
     * @param {Object} period - Time period for calculation
     * @param {Object} options - Calculation options
     * @returns {Promise<Object>} Performance metrics
     */
    async calculatePerformanceMetrics(consultantId, period = {}, options = {}) {
        try {
            const consultant = await this.getConsultantById(consultantId, {
                populate: ['engagements', 'skills'],
                ...options
            });

            if (!consultant) {
                throw new NotFoundError('Consultant not found', 'CONSULTANT_NOT_FOUND');
            }

            // Calculate various performance metrics
            const metrics = {
                utilization: await this.#calculateUtilizationMetrics(consultant, period),
                productivity: await this.#calculateProductivityMetrics(consultant, period),
                quality: await this.#calculateQualityMetrics(consultant, period),
                clientSatisfaction: await this.#calculateClientSatisfaction(consultant, period),
                skillDevelopment: await this.#calculateSkillDevelopment(consultant, period),
                revenue: await this.#calculateRevenueMetrics(consultant, period),
                efficiency: await this.#calculateEfficiencyMetrics(consultant, period)
            };

            // Calculate overall performance score
            metrics.overallScore = this.#calculateOverallPerformanceScore(metrics);
            metrics.performanceCategory = this.#categorizePerformance(metrics.overallScore);
            metrics.recommendations = await this.#generatePerformanceRecommendations(metrics, consultant);

            // Update consultant's performance record
            await this.#updatePerformanceRecord(consultantId, metrics, options.userId);

            return metrics;
        } catch (error) {
            logger.error('Error calculating performance metrics', {
                error: error.message,
                consultantId
            });
            throw error;
        }
    }

    /**
     * Get comprehensive consultant statistics
     * @param {Object} filters - Statistics filters
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Consultant statistics
     */
    async getConsultantStatistics(filters = {}, options = {}) {
        const { tenantId, dateRange = {} } = options;

        try {
            // Check cache
            const cacheKey = this.#generateCacheKey('consultant-stats', filters, options);
            const cached = await this.#cacheService.get(cacheKey);
            if (cached) {
                return cached;
            }

            const stats = await ConsultantModel.getUtilizationReport(tenantId, dateRange);

            // Add additional analytics
            stats.performance = await this.#aggregatePerformanceData(tenantId, dateRange);
            stats.skills = await this.#aggregateSkillsData(tenantId);
            stats.availability = await this.#aggregateAvailabilityData(tenantId);
            stats.trends = await this.#calculateTrends(tenantId, dateRange);
            stats.predictions = await this.#generatePredictions(tenantId);
            stats.benchmarks = await this.#calculateBenchmarks(stats);

            // Cache results
            await this.#cacheService.set(cacheKey, stats, 1800); // 30 minutes

            return stats;
        } catch (error) {
            logger.error('Error generating consultant statistics', {
                error: error.message,
                filters
            });
            throw error;
        }
    }

    /**
     * Generate skill gap analysis report
     * @param {Object} requirements - Analysis requirements
     * @param {Object} options - Analysis options
     * @returns {Promise<Object>} Skill gap analysis
     */
    async generateSkillGapAnalysis(requirements = {}, options = {}) {
        const { tenantId, targetDate = new Date() } = options;

        try {
            // Get current skill inventory
            const currentSkills = await this.#getCurrentSkillInventory(tenantId);

            // Get projected skill demands
            const projectedDemands = await this.#getProjectedSkillDemands(tenantId, targetDate);

            // Calculate gaps
            const gaps = await this.#calculateSkillGaps(currentSkills, projectedDemands);

            // Generate recommendations
            const recommendations = await this.#generateSkillGapRecommendations(gaps);

            // Calculate costs and timeline
            const implementationPlan = await this.#generateImplementationPlan(recommendations);

            return {
                currentInventory: currentSkills,
                projectedDemands,
                gaps,
                recommendations,
                implementationPlan,
                analysisDate: new Date(),
                targetDate
            };
        } catch (error) {
            logger.error('Error generating skill gap analysis', {
                error: error.message,
                requirements
            });
            throw error;
        }
    }

    // ==================== Certification & Compliance ====================

    /**
     * Track consultant certifications
     * @param {string} consultantId - Consultant ID
     * @param {Object} certificationData - Certification information
     * @param {string} userId - User adding certification
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} Updated certification record
     */
    async addCertification(consultantId, certificationData, userId, options = {}) {
        const session = options.session || null;

        try {
            const consultant = await this.getConsultantById(consultantId, {
                checkPermissions: true,
                userId
            });

            if (!consultant) {
                throw new NotFoundError('Consultant not found', 'CONSULTANT_NOT_FOUND');
            }

            // Validate certification data
            await this.#validateCertificationData(certificationData);

            // Check for duplicate certifications
            await this.#checkDuplicateCertification(consultantId, certificationData);

            // Add certification
            const certification = await consultant.addCertification(certificationData);

            // Update related skills
            if (certificationData.relatedSkills) {
                await this.#updateSkillsFromCertification(consultantId, certificationData.relatedSkills, userId, session);
            }

            // Schedule renewal reminders
            if (certificationData.expiryDate) {
                await this.#scheduleRenewalReminders(consultantId, certification, userId);
            }

            // Send notifications
            await this.#sendCertificationNotifications(consultant, certification, userId);

            // Log audit trail
            await this.#auditService.log({
                action: 'CERTIFICATION_ADDED',
                entityType: 'consultant',
                entityId: consultantId,
                userId,
                details: {
                    certificationName: certification.name,
                    issuingBody: certification.issuingBody
                }
            });

            return certification;
        } catch (error) {
            logger.error('Error adding certification', {
                error: error.message,
                consultantId,
                certification: certificationData.name
            });
            throw error;
        }
    }

    /**
     * Check certification compliance
     * @param {Object} filters - Compliance check filters
     * @param {Object} options - Check options
     * @returns {Promise<Object>} Compliance report
     */
    async checkCertificationCompliance(filters = {}, options = {}) {
        const { tenantId } = options;

        try {
            const consultants = await ConsultantModel.find({
                tenantId,
                isDeleted: false,
                'profile.status': 'active'
            });

            const complianceReport = {
                compliant: [],
                nonCompliant: [],
                expiringSoon: [],
                expired: [],
                statistics: {}
            };

            const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

            for (const consultant of consultants) {
                const certificationStatus = await this.#checkConsultantCertificationStatus(consultant);

                if (certificationStatus.hasExpired) {
                    complianceReport.expired.push({
                        consultantId: consultant._id,
                        consultantCode: consultant.consultantCode,
                        name: consultant.fullName,
                        expiredCertifications: certificationStatus.expired
                    });
                    complianceReport.nonCompliant.push(consultant._id);
                } else if (certificationStatus.expiringSoon.length > 0) {
                    complianceReport.expiringSoon.push({
                        consultantId: consultant._id,
                        consultantCode: consultant.consultantCode,
                        name: consultant.fullName,
                        expiringCertifications: certificationStatus.expiringSoon
                    });
                } else if (certificationStatus.isCompliant) {
                    complianceReport.compliant.push(consultant._id);
                }
            }

            // Calculate statistics
            complianceReport.statistics = {
                totalConsultants: consultants.length,
                compliantCount: complianceReport.compliant.length,
                nonCompliantCount: complianceReport.nonCompliant.length,
                complianceRate: (complianceReport.compliant.length / consultants.length) * 100,
                expiringSoonCount: complianceReport.expiringSoon.length,
                expiredCount: complianceReport.expired.length
            };

            // Generate recommendations
            complianceReport.recommendations = await this.#generateComplianceRecommendations(complianceReport);

            return complianceReport;
        } catch (error) {
            logger.error('Error checking certification compliance', {
                error: error.message,
                filters
            });
            throw error;
        }
    }

    // ==================== Rate Management ====================

    /**
     * Update consultant billing rates
     * @param {string} consultantId - Consultant ID
     * @param {Object} rateData - New rate information
     * @param {string} userId - User updating rates
     * @param {Object} options - Update options
     * @returns {Promise<Object>} Updated rate information
     */
    async updateBillingRates(consultantId, rateData, userId, options = {}) {
        const session = options.session || null;

        try {
            const consultant = await this.getConsultantById(consultantId, {
                checkPermissions: true,
                userId
            });

            if (!consultant) {
                throw new NotFoundError('Consultant not found', 'CONSULTANT_NOT_FOUND');
            }

            // Validate rate change
            await this.#validateRateChange(consultant, rateData, userId);

            // Check rate against benchmarks
            const benchmarkAnalysis = await this.#analyzeRateAgainstBenchmarks(consultant, rateData);

            if (benchmarkAnalysis.requiresApproval) {
                await this.#requestRateApproval(consultant, rateData, benchmarkAnalysis, userId);
                return {
                    status: 'pending_approval',
                    message: 'Rate change requires approval',
                    benchmarkAnalysis
                };
            }

            // Update rates
            const updatedConsultant = await ConsultantModel.findByIdAndUpdate(
                consultantId,
                {
                    $set: {
                        'billing.standardRate': rateData.standardRate,
                        'billing.overtimeRate': rateData.overtimeRate || consultant.billing.overtimeRate
                    },
                    $push: {
                        'billing.rateHistory': {
                            previousRate: consultant.billing.standardRate,
                            newRate: rateData.standardRate,
                            changedBy: userId,
                            changedAt: new Date(),
                            reason: rateData.reason
                        }
                    }
                },
                {
                    new: true,
                    session
                }
            );

            // Update project rates if specified
            if (rateData.updateExistingProjects) {
                await this.#updateProjectRates(consultantId, rateData.standardRate, userId, session);
            }

            // Send notifications
            await this.#sendRateChangeNotifications(updatedConsultant, rateData, userId);

            // Log audit trail
            await this.#auditService.log({
                action: 'BILLING_RATE_UPDATED',
                entityType: 'consultant',
                entityId: consultantId,
                userId,
                details: {
                    previousRate: consultant.billing.standardRate.amount,
                    newRate: rateData.standardRate.amount,
                    reason: rateData.reason
                }
            });

            return updatedConsultant.billing;
        } catch (error) {
            logger.error('Error updating billing rates', {
                error: error.message,
                consultantId,
                userId
            });
            throw error;
        }
    }

    // ==================== Private Helper Methods ====================

    /**
     * Analyze rate against market benchmarks
     * @private
     */
    async #analyzeRateAgainstBenchmarks(consultant, rateData) {
        try {
            const currentRate = consultant.billing?.standardRate?.amount || 0;
            const newRate = rateData.standardRate?.amount || rateData.amount || 0;
            const level = consultant.profile?.level || 'mid';
            const country = consultant.location?.country || 'US';

            // Calculate rate increase percentage
            const increasePercent = currentRate > 0 ? ((newRate - currentRate) / currentRate) * 100 : 0;

            // Get market benchmarks for the consultant's level and location
            const benchmarks = await this.#getBenchmarkRates(level, country);

            // Calculate percentile position against benchmarks
            const benchmarkPercentile = this.#calculateBenchmarkPercentile(newRate, benchmarks);

            // Assess competitive position
            const competitivePosition = this.#assessCompetitivePosition(newRate, benchmarks);

            // Calculate variance from median
            const medianVariance = ((newRate - benchmarks.median) / benchmarks.median) * 100;

            // Assess overall risk
            const riskLevel = this.#assessRateRisk(increasePercent, benchmarkPercentile);

            // Determine if approval is required
            const requiresApproval = this.#determineApprovalRequirement(increasePercent, benchmarkPercentile, riskLevel, newRate, benchmarks);

            // Generate recommendations
            const recommendations = this.#generateRateRecommendations({
                currentRate,
                newRate,
                benchmarks,
                increasePercent,
                benchmarkPercentile,
                competitivePosition,
                riskLevel
            });

            const analysis = {
                currentRate,
                newRate,
                increasePercent: Math.round(increasePercent * 100) / 100,
                benchmarks,
                benchmarkPercentile: Math.round(benchmarkPercentile * 100) / 100,
                competitivePosition,
                medianVariance: Math.round(medianVariance * 100) / 100,
                riskLevel,
                requiresApproval,
                recommendations,
                analysisDate: new Date(),
                consultant: {
                    level,
                    country,
                    experience: consultant.profile?.yearsOfExperience || 0
                }
            };

            logger.info('Rate benchmark analysis completed', {
                consultantId: consultant._id,
                currentRate,
                newRate,
                increasePercent: analysis.increasePercent,
                benchmarkPercentile: analysis.benchmarkPercentile,
                requiresApproval
            });

            return analysis;
        } catch (error) {
            logger.error('Error analyzing rate against benchmarks', {
                consultantId: consultant._id,
                error: error.message
            });

            // Return default analysis in case of error
            return {
                currentRate: consultant.billing?.standardRate?.amount || 0,
                newRate: rateData.standardRate?.amount || rateData.amount || 0,
                increasePercent: 0,
                benchmarks: { min: 100, median: 150, max: 200 },
                benchmarkPercentile: 50,
                competitivePosition: 'unknown',
                medianVariance: 0,
                riskLevel: 'high',
                requiresApproval: true,
                recommendations: ['Manual review required due to analysis error'],
                analysisDate: new Date(),
                error: error.message
            };
        }
    }

    /**
     * Calculate benchmark percentile position
     * @private
     */
    #calculateBenchmarkPercentile(rate, benchmarks) {
        if (rate <= benchmarks.min) return 0;
        if (rate >= benchmarks.max) return 100;

        if (rate <= benchmarks.median) {
            // Between min and median (0-50th percentile)
            return ((rate - benchmarks.min) / (benchmarks.median - benchmarks.min)) * 50;
        } else {
            // Between median and max (50-100th percentile)
            return 50 + ((rate - benchmarks.median) / (benchmarks.max - benchmarks.median)) * 50;
        }
    }

    /**
     * Assess competitive position
     * @private
     */
    #assessCompetitivePosition(rate, benchmarks) {
        if (rate < benchmarks.min * 0.9) return 'below_market';
        if (rate < benchmarks.min) return 'low_market';
        if (rate < benchmarks.median) return 'below_median';
        if (rate <= benchmarks.median * 1.1) return 'at_median';
        if (rate < benchmarks.max) return 'above_median';
        if (rate <= benchmarks.max * 1.1) return 'high_market';
        return 'above_market';
    }

    /**
     * Determine if approval is required
     * @private
     */
    #determineApprovalRequirement(increasePercent, benchmarkPercentile, riskLevel, newRate, benchmarks) {
        // Require approval for high-risk scenarios
        if (riskLevel === 'high') return true;

        // Require approval for large increases
        if (increasePercent > 20) return true;

        // Require approval for rates significantly above market
        if (benchmarkPercentile > 85) return true;

        // Require approval for rates above maximum benchmark
        if (newRate > benchmarks.max) return true;

        // Require approval for medium risk with significant increase
        if (riskLevel === 'medium' && increasePercent > 15) return true;

        return false;
    }

    /**
     * Generate rate recommendations
     * @private
     */
    #generateRateRecommendations(analysisData) {
        const recommendations = [];
        const { currentRate, newRate, benchmarks, increasePercent, benchmarkPercentile, competitivePosition, riskLevel } = analysisData;

        // Rate positioning recommendations
        if (competitivePosition === 'below_market') {
            recommendations.push('Rate is below market standards - consider larger increase to improve competitiveness');
        } else if (competitivePosition === 'above_market') {
            recommendations.push('Rate is above market standards - ensure value proposition justifies premium pricing');
        } else if (competitivePosition === 'at_median') {
            recommendations.push('Rate is well-positioned at market median');
        }

        // Increase percentage recommendations
        if (increasePercent > 30) {
            recommendations.push('Large rate increase may require phased implementation or strong justification');
        } else if (increasePercent > 15) {
            recommendations.push('Moderate rate increase - ensure client communication and value demonstration');
        } else if (increasePercent < 5 && currentRate > 0) {
            recommendations.push('Small increase may not keep pace with market inflation');
        }

        // Risk-based recommendations
        switch (riskLevel) {
            case 'high':
                recommendations.push('High risk rate change - recommend thorough review and approval process');
                break;
            case 'medium':
                recommendations.push('Medium risk rate change - consider client impact and timing');
                break;
            case 'minimal':
                recommendations.push('Low risk rate change - can likely proceed with standard approval');
                break;
        }

        // Benchmarking recommendations
        if (benchmarkPercentile < 25) {
            recommendations.push('Consider skills assessment and performance review to justify rate positioning');
        } else if (benchmarkPercentile > 75) {
            recommendations.push('Premium rate positioning - ensure demonstrated value and client satisfaction');
        }

        // Specific rate recommendations
        if (newRate < benchmarks.min) {
            recommendations.push(`Consider minimum rate of $${benchmarks.min} based on market standards`);
        } else if (newRate > benchmarks.max * 1.2) {
            recommendations.push(`Rate significantly exceeds market maximum of $${benchmarks.max} - strong justification required`);
        }

        return recommendations;
    }

    /**
     * Validate consultant data
     * @private
     */
    async #validateConsultantData(consultantData) {
        const errors = [];

        // Required field validations
        if (!consultantData.personalInfo?.firstName) {
            errors.push('First name is required');
        }

        if (!consultantData.personalInfo?.lastName) {
            errors.push('Last name is required');
        }

        if (!consultantData.contact?.email) {
            errors.push('Email is required');
        }

        if (consultantData.contact?.email) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(consultantData.contact.email)) {
                errors.push('Invalid email format');
            }
        }

        if (!consultantData.profile?.level) {
            errors.push('Consultant level is required');
        }

        if (!consultantData.profile?.type) {
            errors.push('Consultant type is required');
        }

        // Validate phone numbers
        if (consultantData.contact?.phoneNumbers) {
            for (const phone of consultantData.contact.phoneNumbers) {
                if (phone.number && !/^[\+]?[1-9][\d]{0,15}$/.test(phone.number.replace(/[\s\-\(\)]/g, ''))) {
                    errors.push(`Invalid phone number format: ${phone.number}`);
                }
            }
        }

        // Validate employee ID format
        if (consultantData.employeeId && !/^[A-Z]{2,4}\d{4,6}$/.test(consultantData.employeeId)) {
            errors.push('Employee ID must be in format: 2-4 letters followed by 4-6 digits');
        }

        // Validate dates
        if (consultantData.personalInfo?.dateOfBirth) {
            const birthDate = new Date(consultantData.personalInfo.dateOfBirth);
            const minAge = 18;
            const maxAge = 100;
            const age = moment().diff(moment(birthDate), 'years');

            if (age < minAge || age > maxAge) {
                errors.push(`Age must be between ${minAge} and ${maxAge} years`);
            }
        }

        // Validate start date
        if (consultantData.profile?.startDate) {
            const startDate = new Date(consultantData.profile.startDate);
            const futureLimit = moment().add(1, 'year');

            if (startDate > futureLimit.toDate()) {
                errors.push('Start date cannot be more than 1 year in the future');
            }
        }

        if (errors.length > 0) {
            throw new ValidationError(errors.join(', '), 'VALIDATION_FAILED');
        }

        return true;
    }

    /**
     * Check for duplicate consultants
     * @private
     */
    async #checkDuplicateConsultant(consultantData) {
        const duplicateQuery = {
            $or: [
                { 'contact.email': consultantData.contact.email.toLowerCase() }
            ],
            isDeleted: false
        };

        if (consultantData.employeeId) {
            duplicateQuery.$or.push({ employeeId: consultantData.employeeId });
        }

        if (consultantData.personalInfo?.nationalId) {
            duplicateQuery.$or.push({ 'personalInfo.nationalId': consultantData.personalInfo.nationalId });
        }

        const duplicate = await ConsultantModel.findOne(duplicateQuery);
        if (duplicate) {
            const conflictField = duplicate.contact.email === consultantData.contact.email.toLowerCase()
                ? 'email'
                : duplicate.employeeId === consultantData.employeeId
                    ? 'employee ID'
                    : 'national ID';

            throw new ConflictError(
                `Consultant already exists with this ${conflictField}`,
                'CONSULTANT_DUPLICATE',
                { field: conflictField, existingId: duplicate._id }
            );
        }
    }

    /**
     * Validate level requirements
     * @private
     */
    async #validateLevelRequirements(consultantData) {
        const level = consultantData.profile?.level;
        if (!level || !this.#levelRequirements[level]) {
            throw new ValidationError(`Invalid consultant level: ${level}`, 'INVALID_LEVEL');
        }

        const requirements = this.#levelRequirements[level];
        const experience = consultantData.profile?.yearsOfExperience || 0;

        if (requirements.minExperience && experience < requirements.minExperience) {
            throw new ValidationError(
                `Insufficient experience for ${level} level. Minimum required: ${requirements.minExperience} years`,
                'INSUFFICIENT_EXPERIENCE'
            );
        }

        if (requirements.maxExperience && experience > requirements.maxExperience) {
            throw new ValidationError(
                `Excessive experience for ${level} level. Maximum allowed: ${requirements.maxExperience} years`,
                'EXCESSIVE_EXPERIENCE'
            );
        }

        // Check skill count if skills are provided
        if (consultantData.skills?.technical && requirements.minSkills) {
            if (consultantData.skills.technical.length < requirements.minSkills) {
                throw new ValidationError(
                    `Insufficient skills for ${level} level. Minimum required: ${requirements.minSkills} skills`,
                    'INSUFFICIENT_SKILLS'
                );
            }
        }

        return true;
    }

    /**
     * Enrich consultant data with defaults and calculated fields
     * @private
     */
    async #enrichConsultantData(consultantData, userId) {
        const enriched = { ...consultantData };

        // Set metadata
        enriched.metadata = {
            ...enriched.metadata,
            source: 'manual',
            importedBy: userId,
            importedAt: new Date(),
            version: 1,
            lastUpdatedBy: userId,
            lastUpdatedAt: new Date()
        };

        // Normalize email
        if (enriched.contact?.email) {
            enriched.contact.email = enriched.contact.email.toLowerCase().trim();
        }

        // Set full name
        enriched.fullName = `${enriched.personalInfo.firstName} ${enriched.personalInfo.lastName}`;

        // Set default billing if not provided
        if (!enriched.billing) {
            const defaultRate = this.#calculateDefaultRate(enriched.profile.level);
            enriched.billing = {
                standardRate: {
                    amount: defaultRate,
                    currency: 'USD',
                    unit: 'hour'
                },
                overtimeRate: {
                    multiplier: 1.5,
                    threshold: 40,
                    unit: 'hours_per_week'
                },
                rateHistory: []
            };
        }

        // Initialize analytics
        enriched.analytics = {
            lifetime: {
                totalProjects: 0,
                totalClients: 0,
                totalHours: 0,
                billableHours: 0,
                revenueGenerated: 0,
                avgProjectDuration: 0,
                repeatClientRate: 0
            },
            current: {
                activeProjects: 0,
                utilization: 0,
                monthlyRevenue: 0,
                avgDailyHours: 0
            },
            trends: {
                utilizationTrend: 'stable',
                revenueTrend: 'stable',
                skillDevelopmentTrend: 'stable'
            }
        };

        // Set initial performance metrics
        const targetUtilization = this.#levelRequirements[enriched.profile.level]?.targetUtilization || 80;
        enriched.performance = {
            currentRating: null,
            historicalRatings: [],
            kpis: {
                billableHours: { target: 0, actual: 0 },
                utilizationRate: { target: targetUtilization, actual: 0 },
                clientSatisfaction: { target: 4.0, actual: null },
                projectDelivery: { target: 95, actual: null }
            },
            lastReviewDate: null,
            nextReviewDate: moment().add(3, 'months').toDate()
        };

        // Set up engagement tracking
        enriched.engagements = {
            current: [],
            historical: [],
            totalCount: 0,
            totalDuration: 0
        };

        // Initialize availability
        if (!enriched.availability) {
            enriched.availability = {
                status: 'available',
                currentUtilization: 0,
                targetUtilization,
                capacity: {
                    hoursPerWeek: 40,
                    daysPerWeek: 5,
                    maxProjects: 3,
                    overtimeCapacity: 10
                },
                timeZone: enriched.location?.timeZone || 'UTC',
                workingHours: {
                    monday: { start: '09:00', end: '17:00' },
                    tuesday: { start: '09:00', end: '17:00' },
                    wednesday: { start: '09:00', end: '17:00' },
                    thursday: { start: '09:00', end: '17:00' },
                    friday: { start: '09:00', end: '17:00' }
                }
            };
        }

        // Set archive status
        enriched.archiveStatus = {
            isArchived: false,
            archivedAt: null,
            archivedBy: null,
            archiveReason: null
        };

        // Initialize audit log
        enriched.auditLog = [{
            action: 'created',
            field: 'all',
            oldValue: null,
            newValue: 'consultant_created',
            changedBy: userId,
            changedAt: new Date(),
            reason: 'Initial consultant creation'
        }];

        return enriched;
    }

    /**
     * Calculate default billing rate based on level
     * @private
     */
    #calculateDefaultRate(level) {
        const defaultRates = {
            junior: 75,
            mid: 125,
            senior: 175,
            lead: 225,
            principal: 275,
            director: 350,
            partner: 500
        };

        return defaultRates[level] || 150;
    }

    /**
     * Create associated records for new consultant
     * @private
     */
    async #createAssociatedRecords(consultant, userId, session) {
        // Create profile record
        await ConsultantProfileModel.create([{
            consultantId: consultant._id,
            tenantId: consultant.tenantId,
            organizationId: consultant.organizationId,
            profileId: crypto.randomBytes(8).toString('hex'),
            summary: {
                headline: `${consultant.profile.level} ${consultant.profile.jobTitle || 'Consultant'}`,
                executiveSummary: ''
            },
            expertise: {
                domains: [],
                industries: [],
                functionalAreas: []
            },
            careerHistory: [],
            qualifications: {
                academic: [],
                professional: [],
                certifications: []
            },
            portfolio: {
                projects: [],
                testimonials: []
            },
            development: {
                currentPlan: null,
                completedPlans: []
            },
            metadata: {
                createdBy: userId,
                createdAt: new Date(),
                profileCompleteness: { percentage: 25, missingFields: ['summary.executiveSummary', 'expertise.domains'] }
            }
        }], { session });

        // Create availability record
        await ConsultantAvailabilityModel.create([{
            consultantId: consultant._id,
            tenantId: consultant.tenantId,
            organizationId: consultant.organizationId,
            currentStatus: {
                status: 'available',
                effectiveFrom: new Date(),
                reason: 'Initial setup'
            },
            capacity: {
                standard: {
                    hoursPerDay: 8,
                    daysPerWeek: 5,
                    hoursPerWeek: 40
                },
                overtime: {
                    maxHoursPerWeek: 50,
                    multiplier: 1.5
                }
            },
            workingHours: consultant.availability.workingHours,
            exceptions: [],
            bookings: []
        }], { session });
    }

    /**
     * Create initial skills for consultant
     * @private
     */
    async #createInitialSkills(consultantId, skills, userId, session) {
        const skillRecords = skills.map(skill => ({
            consultantId,
            skillCategory: skill.category || 'technical',
            skillName: skill.name,
            proficiencyLevel: skill.level || 'intermediate',
            yearsOfExperience: skill.years || 0,
            lastUsed: skill.lastUsed || new Date(),
            certified: skill.certified || false,
            endorsements: [],
            projects: [],
            verified: false,
            metadata: {
                addedBy: userId,
                addedAt: new Date(),
                source: 'initial_setup'
            }
        }));

        await ConsultantSkillModel.insertMany(skillRecords, { session });
    }

    /**
     * Initialize availability calendar
     * @private
     */
    async #initializeAvailabilityCalendar(consultantId, tenantId, session) {
        if (!this.#calendarService) return;

        try {
            // Create calendar for consultant
            const calendar = await this.#calendarService.createCalendar({
                name: `Consultant ${consultantId} Availability`,
                description: 'Consultant availability and booking calendar',
                tenantId,
                ownerId: consultantId,
                type: 'availability',
                settings: {
                    autoAccept: false,
                    bufferTime: 15, // minutes
                    maxBookingAdvance: 90, // days
                    timeZone: 'UTC'
                }
            });

            // Update consultant with calendar ID
            await ConsultantModel.findByIdAndUpdate(
                consultantId,
                { 'metadata.calendarId': calendar.id },
                { session }
            );
        } catch (error) {
            logger.warn('Failed to initialize availability calendar', {
                consultantId,
                error: error.message
            });
        }
    }

    /**
     * Send onboarding notifications
     * @private
     */
    async #sendOnboardingNotifications(consultant, userId) {
        if (!this.#emailService || !this.#notificationService) return;

        try {
            // Send welcome email
            await this.#emailService.send({
                to: consultant.contact.email,
                template: 'consultant-welcome',
                data: {
                    consultantName: consultant.fullName,
                    consultantCode: consultant.consultantCode,
                    level: consultant.profile.level,
                    startDate: consultant.profile.startDate
                }
            });

            // Send internal notification
            await this.#notificationService.send({
                type: 'consultant_onboarded',
                recipients: ['hr-team', 'resource-managers'],
                data: {
                    consultantId: consultant._id,
                    consultantName: consultant.fullName,
                    level: consultant.profile.level,
                    skills: consultant.skills?.technical?.map(s => s.name) || []
                }
            });
        } catch (error) {
            logger.warn('Failed to send onboarding notifications', {
                consultantId: consultant._id,
                error: error.message
            });
        }
    }

    /**
     * Schedule initial training and assessments
     * @private
     */
    async #scheduleInitialActivities(consultant, userId) {
        try {
            const activities = [];

            // Schedule orientation
            activities.push({
                type: 'orientation',
                title: 'New Consultant Orientation',
                scheduledDate: moment().add(1, 'week').toDate(),
                duration: 480, // 8 hours
                mandatory: true
            });

            // Schedule skill assessments
            if (consultant.skills?.technical) {
                for (const skill of consultant.skills.technical.slice(0, 3)) {
                    activities.push({
                        type: 'skill_assessment',
                        title: `${skill.name} Skill Assessment`,
                        scheduledDate: moment().add(2, 'weeks').toDate(),
                        duration: 120, // 2 hours
                        skillId: skill.skillId,
                        mandatory: false
                    });
                }
            }

            // Schedule initial review
            activities.push({
                type: 'performance_review',
                title: '90-Day Initial Review',
                scheduledDate: moment().add(90, 'days').toDate(),
                duration: 60,
                mandatory: true
            });

            // Create calendar events if calendar service available
            if (this.#calendarService) {
                for (const activity of activities) {
                    await this.#calendarService.createEvent({
                        calendarId: consultant.metadata?.calendarId,
                        title: activity.title,
                        startTime: activity.scheduledDate,
                        duration: activity.duration,
                        type: activity.type,
                        attendees: [consultant._id, userId]
                    });
                }
            }
        } catch (error) {
            logger.warn('Failed to schedule initial activities', {
                consultantId: consultant._id,
                error: error.message
            });
        }
    }

    /**
     * Clear consultant caches
     * @private
     */
    async #clearConsultantCaches(tenantId, consultantId = null) {
        if (!this.#cacheService) return;

        try {
            const patterns = [
                `consultant:*:${tenantId}:*`,
                `consultants:*:${tenantId}:*`,
                `consultant-stats:*:${tenantId}:*`
            ];

            if (consultantId) {
                patterns.push(
                    `consultant:*:${consultantId}:*`,
                    `consultant-metrics:*:${consultantId}:*`,
                    `consultant-skills:*:${consultantId}:*`
                );
            }

            for (const pattern of patterns) {
                await this.#cacheService.deletePattern(pattern);
            }
        } catch (error) {
            logger.warn('Failed to clear consultant caches', {
                tenantId,
                consultantId,
                error: error.message
            });
        }
    }

    /**
     * Enrich consultant with additional metrics
     * @private
     */
    async #enrichConsultantWithMetrics(consultant) {
        const enriched = { ...consultant };

        try {
            // Calculate current utilization
            enriched.currentUtilization = await this.#calculateCurrentUtilization(consultant._id);

            // Calculate performance score
            enriched.performanceScore = await this.#calculatePerformanceScore(consultant);

            // Calculate skill strength
            enriched.skillStrength = await this.#calculateSkillStrength(consultant);

            // Calculate availability score
            enriched.availabilityScore = await this.#calculateAvailabilityScore(consultant);

            // Calculate market value
            enriched.marketValue = await this.#calculateMarketValue(consultant);

            // Add recent activity summary
            enriched.recentActivity = await this.#getRecentActivity(consultant._id);

            return enriched;
        } catch (error) {
            logger.warn('Failed to enrich consultant with metrics', {
                consultantId: consultant._id,
                error: error.message
            });
            return enriched;
        }
    }

    /**
     * Check consultant access permissions
     * @private
     */
    async #checkConsultantAccess(consultant, userId, action) {
        // Simplified permission check - in real implementation would use proper RBAC
        if (!userId) {
            throw new ForbiddenError('Authentication required', 'AUTH_REQUIRED');
        }

        // Allow access if user is the consultant themselves or has admin role
        if (consultant._id.toString() === userId || consultant.metadata?.createdBy === userId) {
            return true;
        }

        // Additional role-based checks would go here
        // For now, we'll allow all authenticated users to read
        if (action === 'read') {
            return true;
        }

        throw new ForbiddenError(`Insufficient permissions for ${action}`, 'INSUFFICIENT_PERMISSIONS');
    }

    /**
     * Generate cache key
     * @private
     */
    #generateCacheKey(type, identifier, options = {}) {
        const optionsHash = crypto
            .createHash('md5')
            .update(JSON.stringify(options))
            .digest('hex')
            .substring(0, 8);
        return `consultant:${type}:${identifier}:${optionsHash}`;
    }

    /**
     * Calculate current utilization
     * @private
     */
    async #calculateCurrentUtilization(consultantId) {
        // This would query actual project allocations
        // For now, return a placeholder
        return Math.floor(Math.random() * 100);
    }

    /**
     * Calculate performance score
     * @private
     */
    async #calculatePerformanceScore(consultant) {
        if (!consultant.performance?.currentRating) {
            return null;
        }

        let score = consultant.performance.currentRating * 20; // Convert to 0-100 scale

        // Adjust based on utilization
        if (consultant.availability?.currentUtilization) {
            const utilizationTarget = consultant.availability.targetUtilization || 80;
            const utilizationRatio = consultant.availability.currentUtilization / utilizationTarget;
            score *= Math.min(utilizationRatio, 1.2); // Cap bonus at 20%
        }

        return Math.min(Math.max(score, 0), 100);
    }

    /**
     * Calculate skill strength
     * @private
     */
    async #calculateSkillStrength(consultant) {
        if (!consultant.skills?.technical?.length) {
            return 0;
        }

        const skillLevels = { beginner: 1, intermediate: 2, advanced: 3, expert: 4 };
        let totalStrength = 0;

        for (const skill of consultant.skills.technical) {
            const level = skillLevels[skill.level] || 2;
            const experience = Math.min(skill.yearsOfExperience || 0, 10);
            const certified = skill.certified ? 1.2 : 1;

            totalStrength += level * experience * certified;
        }

        return Math.min(totalStrength / consultant.skills.technical.length, 10);
    }

    /**
     * Calculate availability score
     * @private
     */
    async #calculateAvailabilityScore(consultant) {
        const currentUtilization = consultant.availability?.currentUtilization || 0;
        const targetUtilization = consultant.availability?.targetUtilization || 80;

        // Higher score for consultants near but not over target utilization
        if (currentUtilization <= targetUtilization) {
            return (currentUtilization / targetUtilization) * 100;
        } else {
            // Penalize over-utilization
            const overUtilization = currentUtilization - targetUtilization;
            return Math.max(100 - (overUtilization * 2), 0);
        }
    }

    /**
     * Calculate market value
     * @private
     */
    async #calculateMarketValue(consultant) {
        const baseRate = consultant.billing?.standardRate?.amount || 100;
        const level = consultant.profile?.level || 'mid';
        const experience = consultant.profile?.yearsOfExperience || 0;

        const levelMultipliers = {
            junior: 0.8,
            mid: 1.0,
            senior: 1.3,
            lead: 1.6,
            principal: 2.0,
            director: 2.5,
            partner: 3.0
        };

        const experienceBonus = Math.min(experience * 0.05, 0.5); // Max 50% bonus
        const multiplier = (levelMultipliers[level] || 1) * (1 + experienceBonus);

        return Math.round(baseRate * multiplier);
    }

    /**
     * Get recent activity summary
     * @private
     */
    async #getRecentActivity(consultantId) {
        // This would query actual activity logs
        // For now, return placeholder data
        return {
            lastLogin: moment().subtract(Math.floor(Math.random() * 7), 'days').toDate(),
            recentProjects: Math.floor(Math.random() * 3),
            skillsUpdated: Math.floor(Math.random() * 2),
            certificationsEarned: 0
        };
    }

    /**
     * Validate update data
     * @private
     */
    async #validateUpdateData(updateData, existingConsultant) {
        const errors = [];

        // Email validation if being updated
        if (updateData.contact?.email) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(updateData.contact.email)) {
                errors.push('Invalid email format');
            }
        }

        // Rate validation if being updated
        if (updateData.billing?.standardRate) {
            if (updateData.billing.standardRate.amount <= 0) {
                errors.push('Billing rate must be greater than zero');
            }
        }

        // Status validation
        if (updateData.profile?.status) {
            const validStatuses = ['active', 'inactive', 'on_leave', 'terminated'];
            if (!validStatuses.includes(updateData.profile.status)) {
                errors.push(`Invalid status: ${updateData.profile.status}`);
            }
        }

        if (errors.length > 0) {
            throw new ValidationError(errors.join(', '), 'VALIDATION_FAILED');
        }

        return true;
    }

    /**
     * Validate level change
     * @private
     */
    async #validateLevelChange(existingConsultant, newLevel) {
        if (!this.#levelRequirements[newLevel]) {
            throw new ValidationError(`Invalid level: ${newLevel}`, 'INVALID_LEVEL');
        }

        const requirements = this.#levelRequirements[newLevel];
        const experience = existingConsultant.profile?.yearsOfExperience || 0;

        // Check if consultant meets requirements for new level
        if (requirements.minExperience && experience < requirements.minExperience) {
            throw new ValidationError(
                `Consultant does not meet minimum experience requirement for ${newLevel} level`,
                'LEVEL_REQUIREMENT_NOT_MET'
            );
        }

        // Check skill count
        const skillCount = existingConsultant.skills?.technical?.length || 0;
        if (requirements.minSkills && skillCount < requirements.minSkills) {
            throw new ValidationError(
                `Consultant does not meet minimum skill requirement for ${newLevel} level`,
                'SKILL_REQUIREMENT_NOT_MET'
            );
        }

        return true;
    }

    /**
     * Track changes for audit
     * @private
     */
    async #trackChanges(existingConsultant, updateData) {
        const changes = {};

        for (const [key, value] of Object.entries(updateData)) {
            if (existingConsultant[key] !== value) {
                changes[key] = {
                    old: existingConsultant[key],
                    new: value
                };
            }
        }

        return changes;
    }

    /**
     * Apply business rules to update data
     * @private
     */
    async #applyBusinessRules(updateData, existingConsultant) {
        const processedData = { ...updateData };

        // Auto-update last modified timestamp
        processedData.lastModified = new Date();

        if (!processedData.metadata) {
            processedData.metadata = {};
        }
        processedData.metadata.lastUpdatedAt = new Date();

        // Handle status changes
        if (updateData.profile?.status && updateData.profile.status !== existingConsultant.profile?.status) {
            if (updateData.profile.status === 'terminated') {
                processedData.profile.endDate = new Date();
                processedData.availability = {
                    ...existingConsultant.availability,
                    status: 'unavailable'
                };
            }
        }

        // Handle level changes
        if (updateData.profile?.level && updateData.profile.level !== existingConsultant.profile?.level) {
            const newTargetUtilization = this.#levelRequirements[updateData.profile.level]?.targetUtilization;
            if (newTargetUtilization && processedData.availability) {
                processedData.availability.targetUtilization = newTargetUtilization;
            }
        }

        return processedData;
    }

    /**
     * Validate rate change
     * @private
     */
    async #validateRateChange(consultant, newRate, userId) {
        const currentRate = consultant.billing?.standardRate?.amount || 0;
        const increasePercent = ((newRate - currentRate) / currentRate) * 100;

        // Check for significant rate increases
        if (increasePercent > 25) {
            logger.warn('Significant rate increase attempted', {
                consultantId: consultant._id,
                currentRate,
                newRate,
                increasePercent,
                userId
            });
        }

        // Additional validation logic would go here
        return true;
    }

    /**
     * Handle status change logic
     * @private
     */
    async #handleStatusChange(updatedConsultant, existingConsultant, userId) {
        const newStatus = updatedConsultant.profile.status;
        const oldStatus = existingConsultant.profile.status;

        if (newStatus === oldStatus) return;

        // Handle termination
        if (newStatus === 'terminated') {
            await this.#handleTermination(updatedConsultant, userId);
        }

        // Handle reactivation
        if (oldStatus === 'inactive' && newStatus === 'active') {
            await this.#handleReactivation(updatedConsultant, userId);
        }

        // Handle leave status
        if (newStatus === 'on_leave') {
            await this.#handleLeaveStatus(updatedConsultant, userId);
        }
    }

    /**
     * Handle consultant termination
     * @private
     */
    async #handleTermination(consultant, userId) {
        try {
            // Update availability to unavailable
            await ConsultantAvailabilityModel.findOneAndUpdate(
                { consultantId: consultant._id },
                {
                    'currentStatus.status': 'unavailable',
                    'currentStatus.reason': 'terminated',
                    'currentStatus.effectiveFrom': new Date()
                }
            );

            // Cancel future bookings if calendar service available
            if (this.#calendarService && consultant.metadata?.calendarId) {
                await this.#calendarService.cancelFutureEvents(consultant.metadata.calendarId);
            }
        } catch (error) {
            logger.error('Error handling consultant termination', {
                consultantId: consultant._id,
                error: error.message
            });
        }
    }

    /**
     * Handle consultant reactivation
     * @private
     */
    async #handleReactivation(consultant, userId) {
        try {
            // Update availability to available
            await ConsultantAvailabilityModel.findOneAndUpdate(
                { consultantId: consultant._id },
                {
                    'currentStatus.status': 'available',
                    'currentStatus.reason': 'reactivated',
                    'currentStatus.effectiveFrom': new Date()
                }
            );
        } catch (error) {
            logger.error('Error handling consultant reactivation', {
                consultantId: consultant._id,
                error: error.message
            });
        }
    }

    /**
     * Handle leave status
     * @private
     */
    async #handleLeaveStatus(consultant, userId) {
        try {
            // Update availability to on_leave
            await ConsultantAvailabilityModel.findOneAndUpdate(
                { consultantId: consultant._id },
                {
                    'currentStatus.status': 'on_leave',
                    'currentStatus.reason': 'leave_of_absence',
                    'currentStatus.effectiveFrom': new Date()
                }
            );
        } catch (error) {
            logger.error('Error handling consultant leave status', {
                consultantId: consultant._id,
                error: error.message
            });
        }
    }

    /**
     * Update consultant skills
     * @private
     */
    async #updateConsultantSkills(consultantId, skills, userId, session) {
        try {
            // This would update the consultant's skills
            // Implementation would depend on how skills are stored
            logger.info('Updating consultant skills', { consultantId, skillsCount: skills.length });
        } catch (error) {
            logger.error('Error updating consultant skills', {
                consultantId,
                error: error.message
            });
        }
    }

    /**
     * Update consultant availability
     * @private
     */
    async #updateConsultantAvailability(consultantId, availability, userId, session) {
        try {
            await ConsultantAvailabilityModel.findOneAndUpdate(
                { consultantId },
                {
                    $set: availability,
                    $push: {
                        'metadata.updateHistory': {
                            updatedBy: userId,
                            updatedAt: new Date(),
                            changes: availability
                        }
                    }
                },
                { session }
            );
        } catch (error) {
            logger.error('Error updating consultant availability', {
                consultantId,
                error: error.message
            });
        }
    }

    /**
     * Check if utilization should be recalculated
     * @private
     */
    #shouldRecalculateUtilization(updateData) {
        return !!(
            updateData.availability ||
            updateData.engagements ||
            updateData.profile?.status
        );
    }

    /**
     * Send update notifications
     * @private
     */
    async #sendUpdateNotifications(consultant, changes, userId) {
        if (!this.#notificationService) return;

        try {
            const significantChanges = ['profile.level', 'billing.standardRate', 'profile.status'];
            const hasSignificantChanges = Object.keys(changes).some(change =>
                significantChanges.includes(change)
            );

            if (hasSignificantChanges) {
                await this.#notificationService.send({
                    type: 'consultant_updated',
                    recipients: ['hr-team', 'resource-managers'],
                    data: {
                        consultantId: consultant._id,
                        consultantName: consultant.fullName,
                        changes: Object.keys(changes),
                        updatedBy: userId
                    }
                });
            }
        } catch (error) {
            logger.warn('Failed to send update notifications', {
                consultantId: consultant._id,
                error: error.message
            });
        }
    }

    /**
     * Check deletion constraints
     * @private
     */
    async #checkDeletionConstraints(consultant) {
        // Check for active engagements
        if (consultant.engagements?.current?.length > 0) {
            throw new ConflictError(
                'Cannot delete consultant with active engagements',
                'ACTIVE_ENGAGEMENTS_EXIST'
            );
        }

        // Check for upcoming commitments
        const upcomingCommitments = await this.#checkUpcomingCommitments(consultant._id);
        if (upcomingCommitments > 0) {
            throw new ConflictError(
                'Cannot delete consultant with upcoming commitments',
                'UPCOMING_COMMITMENTS_EXIST'
            );
        }

        return true;
    }

    /**
     * Check upcoming commitments
     * @private
     */
    async #checkUpcomingCommitments(consultantId) {
        // This would check calendar service for upcoming bookings
        // For now, return 0
        return 0;
    }

    /**
     * Perform hard delete with cascade
     * @private
     */
    async #performHardDelete(consultantId, session) {
        // Delete associated records
        await Promise.all([
            ConsultantProfileModel.deleteOne({ consultantId }, { session }),
            ConsultantAvailabilityModel.deleteOne({ consultantId }, { session }),
            ConsultantSkillModel.deleteMany({ consultantId }, { session })
        ]);

        // Delete main consultant record
        await ConsultantModel.findByIdAndDelete(consultantId, { session });
    }

    /**
     * Archive consultant data
     * @private
     */
    async #archiveConsultantData(consultantId, userId, session) {
        // Archive related documents, update statuses, etc.
        logger.info('Archiving consultant data', { consultantId, userId });
    }

    /**
     * Handle offboarding processes
     * @private
     */
    async #handleOffboarding(consultant, userId, reason) {
        try {
            // Create offboarding checklist
            // Disable access permissions  
            // Archive documents
            // Notify stakeholders
            logger.info('Processing consultant offboarding', {
                consultantId: consultant._id,
                reason
            });
        } catch (error) {
            logger.error('Error in offboarding process', {
                consultantId: consultant._id,
                error: error.message
            });
        }
    }

    /**
     * Send deletion notifications
     * @private
     */
    async #sendDeletionNotifications(consultant, userId, reason) {
        if (!this.#notificationService) return;

        try {
            await this.#notificationService.send({
                type: 'consultant_deleted',
                recipients: ['hr-team', 'resource-managers'],
                data: {
                    consultantId: consultant._id,
                    consultantName: consultant.fullName,
                    reason,
                    deletedBy: userId
                }
            });
        } catch (error) {
            logger.warn('Failed to send deletion notifications', {
                consultantId: consultant._id,
                error: error.message
            });
        }
    }

    /**
     * Build search query
     * @private
     */
    async #buildSearchQuery(searchCriteria, options) {
        const query = { isDeleted: false };

        if (options.tenantId) {
            query.tenantId = options.tenantId;
        }

        if (!options.includeArchived) {
            query['archiveStatus.isArchived'] = { $ne: true };
        }

        // Text search
        if (searchCriteria.text) {
            query.$or = [
                { fullName: { $regex: searchCriteria.text, $options: 'i' } },
                { 'contact.email': { $regex: searchCriteria.text, $options: 'i' } },
                { consultantCode: { $regex: searchCriteria.text, $options: 'i' } }
            ];
        }

        // Level filter
        if (searchCriteria.level) {
            query['profile.level'] = searchCriteria.level;
        }

        // Status filter
        if (searchCriteria.status) {
            query['profile.status'] = searchCriteria.status;
        }

        // Location filter
        if (searchCriteria.location) {
            query['location.country'] = searchCriteria.location;
        }

        // Experience range
        if (searchCriteria.minExperience || searchCriteria.maxExperience) {
            query['profile.yearsOfExperience'] = {};
            if (searchCriteria.minExperience) {
                query['profile.yearsOfExperience'].$gte = searchCriteria.minExperience;
            }
            if (searchCriteria.maxExperience) {
                query['profile.yearsOfExperience'].$lte = searchCriteria.maxExperience;
            }
        }

        // Rate range
        if (searchCriteria.minRate || searchCriteria.maxRate) {
            query['billing.standardRate.amount'] = {};
            if (searchCriteria.minRate) {
                query['billing.standardRate.amount'].$gte = searchCriteria.minRate;
            }
            if (searchCriteria.maxRate) {
                query['billing.standardRate.amount'].$lte = searchCriteria.maxRate;
            }
        }

        return query;
    }

    /**
     * Calculate match score for search results
     * @private
     */
    async #calculateMatchScore(consultant, searchCriteria) {
        let score = 0;

        // Skill matching
        if (searchCriteria.requiredSkills) {
            const consultantSkills = consultant.skills?.technical?.map(s => s.name.toLowerCase()) || [];
            const matchedSkills = searchCriteria.requiredSkills.filter(skill =>
                consultantSkills.includes(skill.toLowerCase())
            );
            score += (matchedSkills.length / searchCriteria.requiredSkills.length) * 40;
        }

        // Experience matching
        if (searchCriteria.minExperience) {
            const experience = consultant.profile?.yearsOfExperience || 0;
            if (experience >= searchCriteria.minExperience) {
                score += 20;
            }
        }

        // Level matching
        if (searchCriteria.level && consultant.profile?.level === searchCriteria.level) {
            score += 15;
        }

        // Availability score
        if (consultant.availability?.status === 'available') {
            score += 10;
        }

        // Performance score
        if (consultant.performance?.currentRating) {
            score += consultant.performance.currentRating * 3; // Max 15 points
        }

        return Math.min(score, 100);
    }

    /**
     * Score consultant for project matching
     * @private
     */
    async #scoreConsultantForProject(params) {
        const {
            consultant,
            requiredSkills,
            preferredSkills = [],
            startDate,
            endDate,
            allocation,
            level
        } = params;

        const scores = {
            availability: 0,
            skills: 0,
            experience: 0,
            rate: 0,
            total: 0
        };

        // Score availability (0-30 points)
        if (consultant.availability?.status === 'available') {
            const currentUtilization = consultant.availability.currentUtilization || 0;
            const targetUtilization = consultant.availability.targetUtilization || 80;
            const availableCapacity = Math.max(0, targetUtilization - currentUtilization);

            if (allocation <= availableCapacity) {
                scores.availability = 30;
            } else {
                scores.availability = Math.max(0, 30 - (allocation - availableCapacity));
            }
        }

        // Score skills match (0-40 points)
        const consultantSkills = consultant.skills?.technical?.map(s => s.name.toLowerCase()) || [];

        if (requiredSkills.length > 0) {
            const requiredMatches = requiredSkills.filter(skill =>
                consultantSkills.includes(skill.toLowerCase())
            ).length;
            scores.skills += (requiredMatches / requiredSkills.length) * 30;
        }

        if (preferredSkills.length > 0) {
            const preferredMatches = preferredSkills.filter(skill =>
                consultantSkills.includes(skill.toLowerCase())
            ).length;
            scores.skills += (preferredMatches / preferredSkills.length) * 10;
        }

        // Score experience (0-20 points)
        const yearsOfExperience = consultant.profile?.yearsOfExperience || 0;
        scores.experience = Math.min(yearsOfExperience * 2, 15);

        if (level && consultant.profile?.level === level) {
            scores.experience += 5;
        }

        // Score rate competitiveness (0-10 points)
        scores.rate = 8; // Simplified - would compare against budget/market rates

        // Calculate total score
        scores.total = scores.availability + scores.skills + scores.experience + scores.rate;

        return scores;
    }

    // ==================== All Missing Private Methods ====================

    /**
     * Send bulk creation notifications
     * @private
     */
    async #sendBulkCreationNotifications(successfulConsultants, userId) {
        if (!this.#notificationService) return;

        try {
            await this.#notificationService.send({
                type: 'bulk_consultants_created',
                recipients: ['hr-team', 'resource-managers'],
                data: {
                    count: successfulConsultants.length,
                    consultants: successfulConsultants.map(c => ({
                        id: c.consultantId,
                        name: c.name,
                        code: c.consultantCode
                    })),
                    createdBy: userId
                }
            });
        } catch (error) {
            logger.warn('Failed to send bulk creation notifications', {
                error: error.message,
                userId
            });
        }
    }

    /**
     * Add consultant skills
     * @private
     */
    async #addConsultantSkills(consultantId, skills, userId, session) {
        try {
            const skillRecords = skills.map(skill => ({
                consultantId,
                skillCategory: skill.category || 'technical',
                skillName: skill.name,
                proficiencyLevel: skill.level || 'intermediate',
                yearsOfExperience: skill.years || 0,
                lastUsed: skill.lastUsed || new Date(),
                certified: skill.certified || false,
                metadata: {
                    addedBy: userId,
                    addedAt: new Date(),
                    source: 'manual_update'
                }
            }));

            await ConsultantSkillModel.insertMany(skillRecords, { session });

            // Update consultant's skill summary
            await ConsultantModel.findByIdAndUpdate(
                consultantId,
                { $inc: { 'metadata.skillsCount': skills.length } },
                { session }
            );
        } catch (error) {
            logger.error('Error adding consultant skills', {
                consultantId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Remove consultant skills
     * @private
     */
    async #removeConsultantSkills(consultantId, skills, userId, session) {
        try {
            const skillNames = Array.isArray(skills) ? skills : skills.map(s => s.name);

            await ConsultantSkillModel.deleteMany({
                consultantId,
                skillName: { $in: skillNames }
            }, { session });

            // Update consultant's skill summary
            await ConsultantModel.findByIdAndUpdate(
                consultantId,
                { $inc: { 'metadata.skillsCount': -skillNames.length } },
                { session }
            );
        } catch (error) {
            logger.error('Error removing consultant skills', {
                consultantId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Calculate utilization metrics
     * @private
     */
    async #calculateUtilizationMetrics(consultant, period) {
        try {
            const { startDate, endDate } = this.#getPeriodDates(period);

            const totalCapacityHours = this.#calculateCapacityHours(consultant, period);
            const billableHours = await this.#getBillableHours(consultant._id, startDate, endDate);
            const nonBillableHours = await this.#getNonBillableHours(consultant._id, startDate, endDate);

            const utilization = totalCapacityHours > 0 ? (billableHours / totalCapacityHours) * 100 : 0;
            const efficiency = (billableHours + nonBillableHours) > 0 ? (billableHours / (billableHours + nonBillableHours)) * 100 : 0;

            return {
                totalHours: billableHours + nonBillableHours,
                billableHours,
                nonBillableHours,
                capacityHours: totalCapacityHours,
                utilization: Math.round(utilization * 100) / 100,
                efficiency: Math.round(efficiency * 100) / 100,
                targetUtilization: consultant.availability?.targetUtilization || 80,
                utilizationVariance: utilization - (consultant.availability?.targetUtilization || 80)
            };
        } catch (error) {
            logger.error('Error calculating utilization metrics', {
                consultantId: consultant._id,
                error: error.message
            });
            return this.#getDefaultUtilizationMetrics();
        }
    }

    /**
     * Calculate capacity hours for a period
     * @private
     */
    #calculateCapacityHours(consultant, period) {
        const { startDate, endDate } = this.#getPeriodDates(period);
        const workingDays = this.#calculateWorkingDays(startDate, endDate);
        const hoursPerDay = consultant.availability?.capacity?.hoursPerDay || 8;
        return workingDays * hoursPerDay;
    }

    /**
     * Calculate working days between dates
     * @private
     */
    #calculateWorkingDays(startDate, endDate) {
        let workingDays = 0;
        const currentDate = new Date(startDate);

        while (currentDate <= endDate) {
            const dayOfWeek = currentDate.getDay();
            if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Not weekend
                workingDays++;
            }
            currentDate.setDate(currentDate.getDate() + 1);
        }

        return workingDays;
    }

    /**
     * Get billable hours for consultant in period
     * @private
     */
    async #getBillableHours(consultantId, startDate, endDate) {
        try {
            // This would query time tracking system or project management system
            // For now, return mock data
            const mockHours = Math.floor(Math.random() * 160) + 120; // 120-280 hours
            return mockHours;
        } catch (error) {
            logger.error('Error getting billable hours', { consultantId, error: error.message });
            return 0;
        }
    }

    /**
     * Get non-billable hours for consultant in period
     * @private
     */
    async #getNonBillableHours(consultantId, startDate, endDate) {
        try {
            // This would query time tracking system
            // For now, return mock data
            const mockHours = Math.floor(Math.random() * 40) + 20; // 20-60 hours
            return mockHours;
        } catch (error) {
            logger.error('Error getting non-billable hours', { consultantId, error: error.message });
            return 0;
        }
    }

    /**
     * Calculate productivity metrics
     * @private
     */
    async #calculateProductivityMetrics(consultant, period) {
        try {
            const { startDate, endDate } = this.#getPeriodDates(period);

            const deliverables = await this.#getDeliverablesData(consultant._id, startDate, endDate);
            const taskMetrics = await this.#getTaskMetrics(consultant._id, startDate, endDate);
            const outputQuality = await this.#getOutputQualityMetrics(consultant._id, startDate, endDate);

            return {
                deliverablesCompleted: deliverables.completed,
                deliverablesOnTime: deliverables.onTime,
                onTimeDeliveryRate: deliverables.completed > 0 ? (deliverables.onTime / deliverables.completed) * 100 : 0,
                tasksCompleted: taskMetrics.completed,
                averageTaskCompletionTime: taskMetrics.avgCompletionTime,
                qualityScore: outputQuality.averageScore,
                reworkRate: outputQuality.reworkRate,
                clientFeedbackScore: outputQuality.clientFeedback
            };
        } catch (error) {
            logger.error('Error calculating productivity metrics', {
                consultantId: consultant._id,
                error: error.message
            });
            return this.#getDefaultProductivityMetrics();
        }
    }

    /**
     * Get deliverables data
     * @private
     */
    async #getDeliverablesData(consultantId, startDate, endDate) {
        try {
            // Mock implementation - would query project management system
            const completed = Math.floor(Math.random() * 15) + 5;
            const onTime = Math.floor(completed * (0.7 + Math.random() * 0.3));

            return {
                completed,
                onTime,
                late: completed - onTime,
                pending: Math.floor(Math.random() * 5)
            };
        } catch (error) {
            logger.error('Error getting deliverables data', { consultantId, error: error.message });
            return { completed: 0, onTime: 0, late: 0, pending: 0 };
        }
    }

    /**
     * Get task metrics
     * @private
     */
    async #getTaskMetrics(consultantId, startDate, endDate) {
        try {
            // Mock implementation - would query task management system
            const completed = Math.floor(Math.random() * 50) + 20;
            const avgCompletionTime = Math.random() * 48 + 12; // 12-60 hours average

            return {
                completed,
                avgCompletionTime,
                pending: Math.floor(Math.random() * 15),
                overdue: Math.floor(Math.random() * 5)
            };
        } catch (error) {
            logger.error('Error getting task metrics', { consultantId, error: error.message });
            return { completed: 0, avgCompletionTime: 0, pending: 0, overdue: 0 };
        }
    }

    /**
     * Get output quality metrics
     * @private
     */
    async #getOutputQualityMetrics(consultantId, startDate, endDate) {
        try {
            // Mock implementation - would query quality assurance system
            const averageScore = 3.5 + Math.random() * 1.5; // 3.5-5.0 scale
            const reworkRate = Math.random() * 15; // 0-15% rework rate
            const clientFeedback = 3.0 + Math.random() * 2.0; // 3.0-5.0 scale

            return {
                averageScore,
                reworkRate,
                clientFeedback,
                defectRate: Math.random() * 5 // 0-5% defect rate
            };
        } catch (error) {
            logger.error('Error getting output quality metrics', { consultantId, error: error.message });
            return { averageScore: 0, reworkRate: 0, clientFeedback: 0, defectRate: 0 };
        }
    }

    /**
     * Calculate quality metrics
     * @private
     */
    async #calculateQualityMetrics(consultant, period) {
        try {
            const { startDate, endDate } = this.#getPeriodDates(period);

            const qualityData = await this.#getQualityAssessmentData(consultant._id, startDate, endDate);
            const defectData = await this.#getDefectData(consultant._id, startDate, endDate);
            const reviewData = await this.#getReviewData(consultant._id, startDate, endDate);

            return {
                overallQualityScore: qualityData.averageScore,
                codeQualityScore: qualityData.codeQuality,
                documentationQualityScore: qualityData.documentationQuality,
                defectRate: defectData.rate,
                defectDensity: defectData.density,
                peerReviewScore: reviewData.peerScore,
                clientReviewScore: reviewData.clientScore,
                qualityTrend: this.#calculateQualityTrend(qualityData.historicalScores)
            };
        } catch (error) {
            logger.error('Error calculating quality metrics', {
                consultantId: consultant._id,
                error: error.message
            });
            return this.#getDefaultQualityMetrics();
        }
    }

    /**
     * Get quality assessment data
     * @private
     */
    async #getQualityAssessmentData(consultantId, startDate, endDate) {
        try {
            // Mock implementation - would query quality management system
            const averageScore = 3.5 + Math.random() * 1.5;
            const codeQuality = 3.0 + Math.random() * 2.0;
            const documentationQuality = 3.2 + Math.random() * 1.8;
            const historicalScores = Array.from({ length: 12 }, () => 3.0 + Math.random() * 2.0);

            return {
                averageScore,
                codeQuality,
                documentationQuality,
                historicalScores,
                assessmentCount: Math.floor(Math.random() * 10) + 5
            };
        } catch (error) {
            logger.error('Error getting quality assessment data', { consultantId, error: error.message });
            return { averageScore: 0, codeQuality: 0, documentationQuality: 0, historicalScores: [] };
        }
    }

    /**
     * Get defect data
     * @private
     */
    async #getDefectData(consultantId, startDate, endDate) {
        try {
            // Mock implementation - would query defect tracking system
            const totalDefects = Math.floor(Math.random() * 20);
            const totalWork = Math.floor(Math.random() * 100) + 50;

            return {
                rate: totalWork > 0 ? (totalDefects / totalWork) * 100 : 0,
                density: totalDefects / Math.max(totalWork / 10, 1), // defects per 10 units of work
                totalDefects,
                criticalDefects: Math.floor(totalDefects * 0.2),
                resolvedDefects: Math.floor(totalDefects * 0.8)
            };
        } catch (error) {
            logger.error('Error getting defect data', { consultantId, error: error.message });
            return { rate: 0, density: 0, totalDefects: 0, criticalDefects: 0, resolvedDefects: 0 };
        }
    }

    /**
     * Get review data
     * @private
     */
    async #getReviewData(consultantId, startDate, endDate) {
        try {
            // Mock implementation - would query review system
            const peerScore = 3.0 + Math.random() * 2.0;
            const clientScore = 3.2 + Math.random() * 1.8;

            return {
                peerScore,
                clientScore,
                peerReviewCount: Math.floor(Math.random() * 10) + 3,
                clientReviewCount: Math.floor(Math.random() * 8) + 2
            };
        } catch (error) {
            logger.error('Error getting review data', { consultantId, error: error.message });
            return { peerScore: 0, clientScore: 0, peerReviewCount: 0, clientReviewCount: 0 };
        }
    }

    /**
     * Calculate quality trend
     * @private
     */
    #calculateQualityTrend(historicalScores) {
        if (!historicalScores || historicalScores.length < 3) return 'stable';

        const recentScores = historicalScores.slice(-3);
        const earlierScores = historicalScores.slice(-6, -3);

        const recentAvg = recentScores.reduce((a, b) => a + b, 0) / recentScores.length;
        const earlierAvg = earlierScores.reduce((a, b) => a + b, 0) / earlierScores.length;

        const difference = recentAvg - earlierAvg;

        if (difference > 0.3) return 'improving';
        if (difference < -0.3) return 'declining';
        return 'stable';
    }

    /**
     * Calculate client satisfaction metrics
     * @private
     */
    async #calculateClientSatisfaction(consultant, period) {
        try {
            const { startDate, endDate } = this.#getPeriodDates(period);

            const feedbackData = await this.#getClientFeedbackData(consultant._id, startDate, endDate);
            const surveyData = await this.#getClientSurveyData(consultant._id, startDate, endDate);
            const repeatClientData = await this.#getRepeatClientData(consultant._id, startDate, endDate);

            return {
                averageRating: feedbackData.averageRating,
                totalFeedbacks: feedbackData.count,
                satisfactionScore: surveyData.satisfactionScore,
                recommendationScore: surveyData.recommendationScore,
                repeatClientRate: repeatClientData.rate,
                clientRetentionRate: repeatClientData.retentionRate,
                escalationRate: feedbackData.escalationRate,
                complimentRate: feedbackData.complimentRate
            };
        } catch (error) {
            logger.error('Error calculating client satisfaction metrics', {
                consultantId: consultant._id,
                error: error.message
            });
            return this.#getDefaultClientSatisfactionMetrics();
        }
    }

    /**
     * Get client feedback data
     * @private
     */
    async #getClientFeedbackData(consultantId, startDate, endDate) {
        try {
            // Mock implementation - would query feedback system
            const ratings = Array.from({ length: 10 }, () => Math.floor(Math.random() * 2) + 3.5);
            const averageRating = ratings.reduce((a, b) => a + b, 0) / ratings.length;

            return {
                averageRating,
                count: ratings.length,
                escalationRate: Math.random() * 5, // 0-5%
                complimentRate: Math.random() * 20 + 10, // 10-30%
                ratings
            };
        } catch (error) {
            logger.error('Error getting client feedback data', { consultantId, error: error.message });
            return { averageRating: 0, count: 0, escalationRate: 0, complimentRate: 0, ratings: [] };
        }
    }

    /**
     * Get client survey data
     * @private
     */
    async #getClientSurveyData(consultantId, startDate, endDate) {
        try {
            // Mock implementation - would query survey system
            const satisfactionScore = 3.0 + Math.random() * 2.0;
            const recommendationScore = 3.2 + Math.random() * 1.8;

            return {
                satisfactionScore,
                recommendationScore,
                surveyCount: Math.floor(Math.random() * 8) + 3,
                responseRate: 0.6 + Math.random() * 0.3 // 60-90%
            };
        } catch (error) {
            logger.error('Error getting client survey data', { consultantId, error: error.message });
            return { satisfactionScore: 0, recommendationScore: 0, surveyCount: 0, responseRate: 0 };
        }
    }

    /**
     * Get repeat client data
     * @private
     */
    async #getRepeatClientData(consultantId, startDate, endDate) {
        try {
            // Mock implementation - would query client relationship system
            const totalClients = Math.floor(Math.random() * 15) + 5;
            const repeatClients = Math.floor(totalClients * (0.3 + Math.random() * 0.4));

            return {
                rate: totalClients > 0 ? (repeatClients / totalClients) * 100 : 0,
                retentionRate: 0.7 + Math.random() * 0.25, // 70-95%
                totalClients,
                repeatClients
            };
        } catch (error) {
            logger.error('Error getting repeat client data', { consultantId, error: error.message });
            return { rate: 0, retentionRate: 0, totalClients: 0, repeatClients: 0 };
        }
    }

    /**
     * Calculate skill development metrics
     * @private
     */
    async #calculateSkillDevelopment(consultant, period) {
        try {
            const { startDate, endDate } = this.#getPeriodDates(period);

            const skillProgress = await this.#getSkillProgressData(consultant._id, startDate, endDate);
            const certifications = await this.#getCertificationData(consultant._id, startDate, endDate);
            const trainingData = await this.#getTrainingData(consultant._id, startDate, endDate);

            return {
                skillsImproved: skillProgress.improved,
                skillsLearned: skillProgress.learned,
                certificationsEarned: certifications.earned,
                trainingHoursCompleted: trainingData.hoursCompleted,
                trainingCoursesCompleted: trainingData.coursesCompleted,
                skillAssessmentScore: skillProgress.assessmentScore,
                developmentGoalsAchieved: skillProgress.goalsAchieved,
                learningVelocity: this.#calculateLearningVelocity(skillProgress.timeline)
            };
        } catch (error) {
            logger.error('Error calculating skill development metrics', {
                consultantId: consultant._id,
                error: error.message
            });
            return this.#getDefaultSkillDevelopmentMetrics();
        }
    }

    /**
     * Get skill progress data
     * @private
     */
    async #getSkillProgressData(consultantId, startDate, endDate) {
        try {
            // Mock implementation - would query learning management system
            const improved = Math.floor(Math.random() * 5) + 1;
            const learned = Math.floor(Math.random() * 3);
            const assessmentScore = 3.0 + Math.random() * 2.0;
            const goalsAchieved = Math.floor(Math.random() * 4);
            const timeline = Array.from({ length: 12 }, () => Math.floor(Math.random() * 3));

            return {
                improved,
                learned,
                assessmentScore,
                goalsAchieved,
                timeline,
                totalSkills: improved + learned
            };
        } catch (error) {
            logger.error('Error getting skill progress data', { consultantId, error: error.message });
            return { improved: 0, learned: 0, assessmentScore: 0, goalsAchieved: 0, timeline: [] };
        }
    }

    /**
     * Get certification data
     * @private
     */
    async #getCertificationData(consultantId, startDate, endDate) {
        try {
            // Mock implementation - would query certification system
            const earned = Math.floor(Math.random() * 3);
            const inProgress = Math.floor(Math.random() * 2);
            const renewed = Math.floor(Math.random() * 2);

            return {
                earned,
                inProgress,
                renewed,
                total: earned + inProgress + renewed
            };
        } catch (error) {
            logger.error('Error getting certification data', { consultantId, error: error.message });
            return { earned: 0, inProgress: 0, renewed: 0, total: 0 };
        }
    }

    /**
     * Get training data
     * @private
     */
    async #getTrainingData(consultantId, startDate, endDate) {
        try {
            // Mock implementation - would query training system
            const hoursCompleted = Math.floor(Math.random() * 80) + 20;
            const coursesCompleted = Math.floor(Math.random() * 8) + 2;

            return {
                hoursCompleted,
                coursesCompleted,
                averageScore: 3.0 + Math.random() * 2.0,
                completionRate: 0.7 + Math.random() * 0.3
            };
        } catch (error) {
            logger.error('Error getting training data', { consultantId, error: error.message });
            return { hoursCompleted: 0, coursesCompleted: 0, averageScore: 0, completionRate: 0 };
        }
    }

    /**
     * Calculate learning velocity
     * @private
     */
    #calculateLearningVelocity(timeline) {
        if (!timeline || timeline.length < 3) return 0;

        const recentAvg = timeline.slice(-3).reduce((a, b) => a + b, 0) / 3;
        const earlierAvg = timeline.slice(0, 3).reduce((a, b) => a + b, 0) / 3;

        return Math.max(0, recentAvg - earlierAvg);
    }

    /**
     * Calculate revenue metrics
     * @private
     */
    async #calculateRevenueMetrics(consultant, period) {
        try {
            const { startDate, endDate } = this.#getPeriodDates(period);

            const billingData = await this.#getBillingData(consultant._id, startDate, endDate);
            const projectData = await this.#getProjectRevenueData(consultant._id, startDate, endDate);

            const dailyRate = consultant.billing?.standardRate?.amount || 0;
            const billableHours = billingData.billableHours;
            const potentialRevenue = this.#calculatePotentialRevenue(consultant, period);

            return {
                totalRevenue: billingData.totalRevenue,
                billableRevenue: billingData.billableRevenue,
                revenuePerHour: billableHours > 0 ? billingData.totalRevenue / billableHours : 0,
                revenuePerProject: projectData.averageProjectRevenue,
                potentialRevenue,
                revenueRealization: potentialRevenue > 0 ? (billingData.totalRevenue / potentialRevenue) * 100 : 0,
                revenueGrowth: billingData.growthRate,
                profitMargin: billingData.profitMargin
            };
        } catch (error) {
            logger.error('Error calculating revenue metrics', {
                consultantId: consultant._id,
                error: error.message
            });
            return this.#getDefaultRevenueMetrics();
        }
    }

    /**
     * Get billing data
     * @private
     */
    async #getBillingData(consultantId, startDate, endDate) {
        try {
            // Mock implementation - would query billing system
            const billableHours = Math.floor(Math.random() * 160) + 120;
            const hourlyRate = 100 + Math.random() * 200; // $100-300/hour
            const totalRevenue = billableHours * hourlyRate;
            const billableRevenue = totalRevenue * (0.8 + Math.random() * 0.2); // 80-100% billable
            const growthRate = -10 + Math.random() * 40; // -10% to 30% growth
            const profitMargin = 0.2 + Math.random() * 0.3; // 20-50% profit margin

            return {
                billableHours,
                totalRevenue,
                billableRevenue,
                growthRate,
                profitMargin,
                hourlyRate
            };
        } catch (error) {
            logger.error('Error getting billing data', { consultantId, error: error.message });
            return { billableHours: 0, totalRevenue: 0, billableRevenue: 0, growthRate: 0, profitMargin: 0 };
        }
    }

    /**
     * Get project revenue data
     * @private
     */
    async #getProjectRevenueData(consultantId, startDate, endDate) {
        try {
            // Mock implementation - would query project management system
            const projects = Math.floor(Math.random() * 5) + 1;
            const totalProjectRevenue = (Math.random() * 500000) + 100000; // $100k-600k
            const averageProjectRevenue = totalProjectRevenue / projects;

            return {
                totalProjects: projects,
                totalProjectRevenue,
                averageProjectRevenue,
                largestProject: averageProjectRevenue * (1.5 + Math.random())
            };
        } catch (error) {
            logger.error('Error getting project revenue data', { consultantId, error: error.message });
            return { totalProjects: 0, totalProjectRevenue: 0, averageProjectRevenue: 0, largestProject: 0 };
        }
    }

    /**
     * Calculate potential revenue
     * @private
     */
    #calculatePotentialRevenue(consultant, period) {
        const { startDate, endDate } = this.#getPeriodDates(period);
        const capacityHours = this.#calculateCapacityHours(consultant, period);
        const hourlyRate = consultant.billing?.standardRate?.amount || 150;
        const targetUtilization = (consultant.availability?.targetUtilization || 80) / 100;

        return capacityHours * hourlyRate * targetUtilization;
    }

    /**
     * Calculate efficiency metrics
     * @private
     */
    async #calculateEfficiencyMetrics(consultant, period) {
        try {
            const { startDate, endDate } = this.#getPeriodDates(period);

            const timeData = await this.#getTimeTrackingData(consultant._id, startDate, endDate);
            const projectData = await this.#getProjectEfficiencyData(consultant._id, startDate, endDate);

            return {
                timeUtilization: timeData.utilization,
                productiveHours: timeData.productiveHours,
                meetingHours: timeData.meetingHours,
                adminHours: timeData.adminHours,
                focusTimePercentage: timeData.focusTimePercentage,
                projectDeliveryEfficiency: projectData.deliveryEfficiency,
                taskCompletionRate: projectData.taskCompletionRate,
                multitaskingIndex: this.#calculateMultitaskingIndex(timeData.taskSwitches)
            };
        } catch (error) {
            logger.error('Error calculating efficiency metrics', {
                consultantId: consultant._id,
                error: error.message
            });
            return this.#getDefaultEfficiencyMetrics();
        }
    }

    /**
     * Get time tracking data
     * @private
     */
    async #getTimeTrackingData(consultantId, startDate, endDate) {
        try {
            // Mock implementation - would query time tracking system
            const totalHours = Math.floor(Math.random() * 200) + 160;
            const productiveHours = totalHours * (0.6 + Math.random() * 0.3); // 60-90% productive
            const meetingHours = totalHours * (0.1 + Math.random() * 0.2); // 10-30% meetings
            const adminHours = totalHours - productiveHours - meetingHours;
            const focusTimePercentage = (productiveHours / totalHours) * 100;
            const taskSwitches = Math.floor(Math.random() * 50) + 20;

            return {
                utilization: (totalHours / 200) * 100, // Assuming 200 is max capacity
                productiveHours,
                meetingHours,
                adminHours,
                focusTimePercentage,
                taskSwitches,
                totalHours
            };
        } catch (error) {
            logger.error('Error getting time tracking data', { consultantId, error: error.message });
            return { utilization: 0, productiveHours: 0, meetingHours: 0, adminHours: 0, focusTimePercentage: 0, taskSwitches: 0 };
        }
    }

    /**
     * Get project efficiency data
     * @private
     */
    async #getProjectEfficiencyData(consultantId, startDate, endDate) {
        try {
            // Mock implementation - would query project management system
            const deliveryEfficiency = 0.7 + Math.random() * 0.3; // 70-100%
            const taskCompletionRate = 0.8 + Math.random() * 0.2; // 80-100%

            return {
                deliveryEfficiency: deliveryEfficiency * 100,
                taskCompletionRate: taskCompletionRate * 100,
                averageTaskTime: 4 + Math.random() * 8, // 4-12 hours average
                projectCount: Math.floor(Math.random() * 5) + 1
            };
        } catch (error) {
            logger.error('Error getting project efficiency data', { consultantId, error: error.message });
            return { deliveryEfficiency: 0, taskCompletionRate: 0, averageTaskTime: 0, projectCount: 0 };
        }
    }

    /**
     * Calculate multitasking index
     * @private
     */
    #calculateMultitaskingIndex(taskSwitches) {
        // Higher task switches indicate more multitasking (potentially less efficient)
        // Scale: 0-100, where lower is better for focus
        return Math.min(taskSwitches * 2, 100);
    }

    /**
     * Calculate overall performance score
     * @private
     */
    #calculateOverallPerformanceScore(metrics) {
        try {
            const weights = {
                utilization: 0.25,
                productivity: 0.20,
                quality: 0.20,
                clientSatisfaction: 0.20,
                skillDevelopment: 0.10,
                efficiency: 0.05
            };

            const scores = {
                utilization: this.#normalizeUtilizationScore(metrics.utilization),
                productivity: this.#normalizeProductivityScore(metrics.productivity),
                quality: this.#normalizeQualityScore(metrics.quality),
                clientSatisfaction: this.#normalizeClientSatisfactionScore(metrics.clientSatisfaction),
                skillDevelopment: this.#normalizeSkillDevelopmentScore(metrics.skillDevelopment),
                efficiency: this.#normalizeEfficiencyScore(metrics.efficiency)
            };

            const overallScore = Object.entries(weights).reduce((total, [category, weight]) => {
                return total + (scores[category] * weight);
            }, 0);

            return Math.round(overallScore * 100) / 100;
        } catch (error) {
            logger.error('Error calculating overall performance score', {
                error: error.message
            });
            return 0;
        }
    }

    /**
     * Normalize utilization score to 0-100
     * @private
     */
    #normalizeUtilizationScore(utilization) {
        const targetUtil = utilization.targetUtilization;
        const actualUtil = utilization.utilization;
        const variance = Math.abs(actualUtil - targetUtil);

        // Perfect score at target, decreases with variance
        if (variance <= 5) return 100;
        if (variance <= 10) return 85;
        if (variance <= 20) return 70;
        return Math.max(0, 70 - variance);
    }

    /**
     * Normalize productivity score to 0-100
     * @private
     */
    #normalizeProductivityScore(productivity) {
        const onTimeRate = productivity.onTimeDeliveryRate || 0;
        const qualityScore = (productivity.qualityScore || 0) * 20; // Convert 5-scale to 100-scale

        return Math.min(100, (onTimeRate * 0.6 + qualityScore * 0.4));
    }

    /**
     * Normalize quality score to 0-100
     * @private
     */
    #normalizeQualityScore(quality) {
        const overallQuality = (quality.overallQualityScore || 0) * 20; // Convert 5-scale to 100-scale
        const defectPenalty = (quality.defectRate || 0) * 2; // Penalty for defects

        return Math.max(0, Math.min(100, overallQuality - defectPenalty));
    }

    /**
     * Normalize client satisfaction score to 0-100
     * @private
     */
    #normalizeClientSatisfactionScore(clientSatisfaction) {
        const avgRating = (clientSatisfaction.averageRating || 0) * 20; // Convert 5-scale to 100-scale
        const retentionBonus = (clientSatisfaction.clientRetentionRate || 0) * 10; // Bonus for retention

        return Math.min(100, avgRating + retentionBonus);
    }

    /**
     * Normalize skill development score to 0-100
     * @private
     */
    #normalizeSkillDevelopmentScore(skillDevelopment) {
        const skillsLearned = Math.min(skillDevelopment.skillsLearned * 20, 40); // Max 40 points for new skills
        const skillsImproved = Math.min(skillDevelopment.skillsImproved * 15, 30); // Max 30 points for improved skills
        const certifications = Math.min(skillDevelopment.certificationsEarned * 30, 30); // Max 30 points for certifications

        return skillsLearned + skillsImproved + certifications;
    }

    /**
     * Normalize efficiency score to 0-100
     * @private
     */
    #normalizeEfficiencyScore(efficiency) {
        const focusTime = efficiency.focusTimePercentage || 0;
        const deliveryEff = efficiency.projectDeliveryEfficiency || 0;
        const multitaskingPenalty = (efficiency.multitaskingIndex || 0) * 0.5; // Penalty for excessive multitasking

        return Math.max(0, Math.min(100, (focusTime * 0.6 + deliveryEff * 0.4) - multitaskingPenalty));
    }

    /**
     * Categorize performance based on score
     * @private
     */
    #categorizePerformance(overallScore) {
        if (overallScore >= 90) return 'exceptional';
        if (overallScore >= 80) return 'excellent';
        if (overallScore >= 70) return 'good';
        if (overallScore >= 60) return 'satisfactory';
        if (overallScore >= 50) return 'needs_improvement';
        return 'unsatisfactory';
    }

    /**
     * Generate performance recommendations
     * @private
     */
    async #generatePerformanceRecommendations(metrics, consultant) {
        const recommendations = [];

        try {
            // Utilization recommendations
            if (metrics.utilization.utilization < metrics.utilization.targetUtilization - 10) {
                recommendations.push({
                    category: 'utilization',
                    priority: 'high',
                    type: 'improvement',
                    title: 'Increase Billable Utilization',
                    description: 'Current utilization is below target. Consider additional project assignments.',
                    actionItems: [
                        'Review available project opportunities',
                        'Discuss capacity with resource manager',
                        'Identify skill development opportunities'
                    ]
                });
            }

            // Quality recommendations
            if (metrics.quality.overallQualityScore < 3.5) {
                recommendations.push({
                    category: 'quality',
                    priority: 'high',
                    type: 'improvement',
                    title: 'Improve Work Quality',
                    description: 'Quality metrics indicate need for improvement.',
                    actionItems: [
                        'Schedule quality review session',
                        'Increase peer review participation',
                        'Consider additional training'
                    ]
                });
            }

            // Client satisfaction recommendations
            if (metrics.clientSatisfaction.averageRating < 4.0) {
                recommendations.push({
                    category: 'client_satisfaction',
                    priority: 'medium',
                    type: 'improvement',
                    title: 'Enhance Client Relationships',
                    description: 'Client feedback suggests areas for improvement.',
                    actionItems: [
                        'Schedule client feedback sessions',
                        'Improve communication frequency',
                        'Focus on expectation management'
                    ]
                });
            }

            // Skill development recommendations
            if (metrics.skillDevelopment.skillsLearned < 2) {
                recommendations.push({
                    category: 'skill_development',
                    priority: 'medium',
                    type: 'development',
                    title: 'Accelerate Skill Development',
                    description: 'Limited skill development progress observed.',
                    actionItems: [
                        'Create formal learning plan',
                        'Allocate time for skill development',
                        'Pursue relevant certifications'
                    ]
                });
            }

            return recommendations;
        } catch (error) {
            logger.error('Error generating performance recommendations', {
                consultantId: consultant._id,
                error: error.message
            });
            return [];
        }
    }

    /**
     * Update performance record
     * @private
     */
    async #updatePerformanceRecord(consultantId, metrics, userId) {
        try {
            await ConsultantModel.findByIdAndUpdate(consultantId, {
                $set: {
                    'performance.currentRating': metrics.overallScore / 20, // Convert to 5-point scale
                    'performance.lastCalculated': new Date(),
                    'performance.metrics': metrics
                },
                $push: {
                    'performance.historicalRatings': {
                        rating: metrics.overallScore / 20,
                        date: new Date(),
                        period: 'monthly',
                        calculatedBy: userId
                    }
                }
            });
        } catch (error) {
            logger.error('Error updating performance record', {
                consultantId,
                error: error.message
            });
        }
    }

    /**
     * Get default performance data
     * @private
     */
    #getDefaultPerformanceData() {
        return {
            avgRating: 0,
            totalConsultants: 0,
            highPerformers: 0,
            lowPerformers: 0
        };
    }

    /**
     * Aggregate performance data
     * @private
     */
    async #aggregatePerformanceData(tenantId, dateRange) {
        try {
            const pipeline = [
                {
                    $match: {
                        tenantId,
                        isDeleted: false,
                        'performance.lastCalculated': {
                            $gte: dateRange.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
                            $lte: dateRange.endDate || new Date()
                        }
                    }
                },
                {
                    $group: {
                        _id: null,
                        avgRating: { $avg: '$performance.currentRating' },
                        totalConsultants: { $sum: 1 },
                        highPerformers: {
                            $sum: { $cond: [{ $gte: ['$performance.currentRating', 4.0] }, 1, 0] }
                        },
                        lowPerformers: {
                            $sum: { $cond: [{ $lt: ['$performance.currentRating', 2.5] }, 1, 0] }
                        }
                    }
                }
            ];

            const result = await ConsultantModel.aggregate(pipeline);
            return result[0] || this.#getDefaultPerformanceData();
        } catch (error) {
            logger.error('Error aggregating performance data', {
                tenantId,
                error: error.message
            });
            return this.#getDefaultPerformanceData();
        }
    }

    /**
     * Aggregate skills data
     * @private
     */
    async #aggregateSkillsData(tenantId) {
        try {
            const pipeline = [
                { $match: { tenantId } },
                { $unwind: '$skills.technical' },
                {
                    $group: {
                        _id: '$skills.technical.name',
                        count: { $sum: 1 },
                        avgProficiency: { $avg: '$skills.technical.level' },
                        avgExperience: { $avg: '$skills.technical.yearsOfExperience' }
                    }
                },
                { $sort: { count: -1 } },
                { $limit: 20 }
            ];

            const skillStats = await ConsultantModel.aggregate(pipeline);
            return {
                topSkills: skillStats,
                totalUniqueSkills: skillStats.length,
                skillDiversity: this.#calculateSkillDiversity(skillStats)
            };
        } catch (error) {
            logger.error('Error aggregating skills data', {
                tenantId,
                error: error.message
            });
            return { topSkills: [], totalUniqueSkills: 0, skillDiversity: 0 };
        }
    }

    /**
     * Calculate skill diversity
     * @private
     */
    #calculateSkillDiversity(skillStats) {
        if (!skillStats || skillStats.length === 0) return 0;

        const totalCount = skillStats.reduce((sum, skill) => sum + skill.count, 0);
        let diversity = 0;

        for (const skill of skillStats) {
            const proportion = skill.count / totalCount;
            diversity -= proportion * Math.log2(proportion);
        }

        return Math.round(diversity * 100) / 100;
    }

    /**
     * Aggregate availability data
     * @private
     */
    async #aggregateAvailabilityData(tenantId) {
        try {
            const pipeline = [
                {
                    $match: {
                        tenantId,
                        isDeleted: false
                    }
                },
                {
                    $group: {
                        _id: '$availability.status',
                        count: { $sum: 1 },
                        avgUtilization: { $avg: '$availability.currentUtilization' }
                    }
                }
            ];

            const availabilityStats = await ConsultantModel.aggregate(pipeline);

            return {
                statusDistribution: availabilityStats.reduce((acc, stat) => {
                    acc[stat._id] = stat.count;
                    return acc;
                }, {}),
                overallUtilization: availabilityStats.reduce((total, stat) => total + (stat.avgUtilization || 0), 0) / Math.max(availabilityStats.length, 1)
            };
        } catch (error) {
            logger.error('Error aggregating availability data', {
                tenantId,
                error: error.message
            });
            return { statusDistribution: {}, overallUtilization: 0 };
        }
    }

    /**
     * Calculate trends
     * @private
     */
    async #calculateTrends(tenantId, dateRange) {
        try {
            const periods = this.#generatePeriods(dateRange);
            const trends = {};

            for (const metric of ['utilization', 'performance', 'satisfaction']) {
                const trend = await this.#calculateMetricTrend(tenantId, metric, periods);
                trends[metric] = trend;
            }

            return trends;
        } catch (error) {
            logger.error('Error calculating trends', {
                tenantId,
                error: error.message
            });
            return {};
        }
    }

    /**
     * Generate periods for trend analysis
     * @private
     */
    #generatePeriods(dateRange) {
        const periods = [];
        const now = new Date();
        const endDate = dateRange.endDate || now;
        const startDate = dateRange.startDate || new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000); // 1 year ago

        const monthsDiff = Math.ceil((endDate - startDate) / (30 * 24 * 60 * 60 * 1000));

        for (let i = 0; i < monthsDiff; i++) {
            const periodStart = new Date(startDate.getTime() + i * 30 * 24 * 60 * 60 * 1000);
            const periodEnd = new Date(periodStart.getTime() + 30 * 24 * 60 * 60 * 1000);

            periods.push({
                start: periodStart,
                end: periodEnd,
                label: `${periodStart.getFullYear()}-${String(periodStart.getMonth() + 1).padStart(2, '0')}`
            });
        }

        return periods;
    }

    /**
     * Calculate metric trend
     * @private
     */
    async #calculateMetricTrend(tenantId, metric, periods) {
        try {
            const trendData = [];

            for (const period of periods) {
                let value = 0;

                switch (metric) {
                    case 'utilization':
                        value = await this.#getAverageUtilization(tenantId, period.start, period.end);
                        break;
                    case 'performance':
                        value = await this.#getAveragePerformance(tenantId, period.start, period.end);
                        break;
                    case 'satisfaction':
                        value = await this.#getAverageSatisfaction(tenantId, period.start, period.end);
                        break;
                }

                trendData.push({
                    period: period.label,
                    value: Math.round(value * 100) / 100
                });
            }

            return {
                data: trendData,
                direction: this.#calculateTrendDirection(trendData),
                slope: this.#calculateTrendSlope(trendData)
            };
        } catch (error) {
            logger.error('Error calculating metric trend', {
                tenantId,
                metric,
                error: error.message
            });
            return { data: [], direction: 'stable', slope: 0 };
        }
    }

    /**
     * Get average utilization for period
     * @private
     */
    async #getAverageUtilization(tenantId, startDate, endDate) {
        try {
            const result = await ConsultantModel.aggregate([
                {
                    $match: {
                        tenantId,
                        isDeleted: false,
                        'metadata.lastUpdatedAt': { $gte: startDate, $lte: endDate }
                    }
                },
                {
                    $group: {
                        _id: null,
                        avgUtilization: { $avg: '$availability.currentUtilization' }
                    }
                }
            ]);

            return result[0]?.avgUtilization || 0;
        } catch (error) {
            logger.error('Error getting average utilization', { tenantId, error: error.message });
            return 0;
        }
    }

    /**
     * Get average performance for period
     * @private
     */
    async #getAveragePerformance(tenantId, startDate, endDate) {
        try {
            const result = await ConsultantModel.aggregate([
                {
                    $match: {
                        tenantId,
                        isDeleted: false,
                        'performance.lastCalculated': { $gte: startDate, $lte: endDate }
                    }
                },
                {
                    $group: {
                        _id: null,
                        avgPerformance: { $avg: '$performance.currentRating' }
                    }
                }
            ]);

            return result[0]?.avgPerformance || 0;
        } catch (error) {
            logger.error('Error getting average performance', { tenantId, error: error.message });
            return 0;
        }
    }

    /**
     * Get average satisfaction for period
     * @private
     */
    async #getAverageSatisfaction(tenantId, startDate, endDate) {
        try {
            // Mock implementation - would query actual satisfaction data
            return 3.5 + Math.random() * 1.5; // 3.5-5.0
        } catch (error) {
            logger.error('Error getting average satisfaction', { tenantId, error: error.message });
            return 0;
        }
    }

    /**
     * Calculate trend direction
     * @private
     */
    #calculateTrendDirection(trendData) {
        if (trendData.length < 2) return 'stable';

        const firstValue = trendData[0].value;
        const lastValue = trendData[trendData.length - 1].value;
        const change = ((lastValue - firstValue) / firstValue) * 100;

        if (change > 5) return 'increasing';
        if (change < -5) return 'decreasing';
        return 'stable';
    }

    /**
     * Calculate trend slope
     * @private
     */
    #calculateTrendSlope(trendData) {
        if (trendData.length < 2) return 0;

        const n = trendData.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;

        for (let i = 0; i < n; i++) {
            sumX += i;
            sumY += trendData[i].value;
            sumXY += i * trendData[i].value;
            sumXX += i * i;
        }

        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        return Math.round(slope * 100) / 100;
    }

    /**
     * Generate predictions
     * @private
     */
    async #generatePredictions(tenantId) {
        try {
            const historicalData = await this.#getHistoricalMetrics(tenantId);

            return {
                utilizationForecast: this.#predictUtilization(historicalData),
                skillDemandForecast: this.#predictSkillDemand(historicalData),
                performanceTrend: this.#predictPerformanceTrend(historicalData),
                capacityNeed: this.#predictCapacityNeed(historicalData)
            };
        } catch (error) {
            logger.error('Error generating predictions', {
                tenantId,
                error: error.message
            });
            return {};
        }
    }

    /**
     * Get historical metrics
     * @private
     */
    async #getHistoricalMetrics(tenantId) {
        try {
            // Mock implementation - would query actual historical data
            const months = 12;
            const utilizationHistory = Array.from({ length: months }, () => 60 + Math.random() * 30);
            const performanceHistory = Array.from({ length: months }, () => 3.0 + Math.random() * 2.0);
            const capacityHistory = Array.from({ length: months }, () => Math.floor(Math.random() * 20) + 50);

            return {
                utilization: utilizationHistory,
                performance: performanceHistory,
                capacity: capacityHistory,
                timeframe: months
            };
        } catch (error) {
            logger.error('Error getting historical metrics', { tenantId, error: error.message });
            return { utilization: [], performance: [], capacity: [], timeframe: 0 };
        }
    }

    /**
     * Predict utilization
     * @private
     */
    #predictUtilization(historicalData) {
        if (!historicalData.utilization || historicalData.utilization.length < 3) {
            return { forecast: [], confidence: 'low', trend: 'stable' };
        }

        const recent = historicalData.utilization.slice(-3);
        const trend = (recent[2] - recent[0]) / 2; // Simple trend calculation

        const forecast = [];
        let lastValue = recent[2];

        for (let i = 1; i <= 6; i++) { // 6 months forecast
            lastValue += trend * 0.8; // Dampen trend over time
            lastValue = Math.max(0, Math.min(100, lastValue)); // Keep within bounds
            forecast.push(Math.round(lastValue * 10) / 10);
        }

        return {
            forecast,
            confidence: trend === 0 ? 'high' : 'medium',
            trend: trend > 2 ? 'increasing' : trend < -2 ? 'decreasing' : 'stable'
        };
    }

    /**
     * Predict skill demand
     * @private
     */
    #predictSkillDemand(historicalData) {
        // Mock implementation - would use ML models in production
        const demandForecast = {
            'JavaScript': { change: 15, confidence: 'high' },
            'Python': { change: 25, confidence: 'high' },
            'Cloud Architecture': { change: 40, confidence: 'medium' },
            'Data Science': { change: 30, confidence: 'medium' },
            'DevOps': { change: 35, confidence: 'high' }
        };

        return demandForecast;
    }

    /**
     * Predict performance trend
     * @private
     */
    #predictPerformanceTrend(historicalData) {
        if (!historicalData.performance || historicalData.performance.length < 3) {
            return { trend: 'stable', expectedChange: 0, confidence: 'low' };
        }

        const recent = historicalData.performance.slice(-3);
        const avgChange = (recent[2] - recent[0]) / 2;

        return {
            trend: avgChange > 0.1 ? 'improving' : avgChange < -0.1 ? 'declining' : 'stable',
            expectedChange: Math.round(avgChange * 100) / 100,
            confidence: Math.abs(avgChange) > 0.2 ? 'high' : 'medium'
        };
    }

    /**
     * Predict capacity need
     * @private
     */
    #predictCapacityNeed(historicalData) {
        if (!historicalData.capacity || historicalData.capacity.length < 3) {
            return { recommendedCapacity: 0, change: 0, reasoning: 'Insufficient historical data' };
        }

        const avgCapacity = historicalData.capacity.reduce((a, b) => a + b, 0) / historicalData.capacity.length;
        const trend = (historicalData.capacity[historicalData.capacity.length - 1] - historicalData.capacity[0]) / historicalData.capacity.length;
        const predictedCapacity = Math.round(avgCapacity + trend * 6); // 6 months ahead

        return {
            recommendedCapacity: predictedCapacity,
            change: predictedCapacity - avgCapacity,
            reasoning: trend > 0 ? 'Growing demand trend' : trend < 0 ? 'Declining demand trend' : 'Stable demand'
        };
    }

    /**
     * Calculate benchmarks
     * @private
     */
    async #calculateBenchmarks(stats) {
        try {
            const industryBenchmarks = {
                utilization: { excellent: 85, good: 75, average: 65 },
                satisfaction: { excellent: 4.5, good: 4.0, average: 3.5 },
                retention: { excellent: 95, good: 90, average: 85 }
            };

            return {
                industry: industryBenchmarks,
                performance: this.#compareWithBenchmarks(stats, industryBenchmarks),
                recommendations: this.#generateBenchmarkRecommendations(stats, industryBenchmarks)
            };
        } catch (error) {
            logger.error('Error calculating benchmarks', {
                error: error.message
            });
            return {};
        }
    }

    /**
     * Compare with benchmarks
     * @private
     */
    #compareWithBenchmarks(stats, benchmarks) {
        const comparison = {};

        for (const [metric, levels] of Object.entries(benchmarks)) {
            const actualValue = stats[metric] || 0;
            let category = 'below_average';

            if (actualValue >= levels.excellent) category = 'excellent';
            else if (actualValue >= levels.good) category = 'good';
            else if (actualValue >= levels.average) category = 'average';

            comparison[metric] = {
                actual: actualValue,
                category,
                gapToExcellent: levels.excellent - actualValue,
                percentile: this.#calculatePercentile(actualValue, levels)
            };
        }

        return comparison;
    }

    /**
     * Calculate percentile
     * @private
     */
    #calculatePercentile(value, levels) {
        if (value >= levels.excellent) return 90 + (value - levels.excellent) / levels.excellent * 10;
        if (value >= levels.good) return 70 + (value - levels.good) / (levels.excellent - levels.good) * 20;
        if (value >= levels.average) return 50 + (value - levels.average) / (levels.good - levels.average) * 20;
        return Math.max(0, value / levels.average * 50);
    }

    /**
     * Generate benchmark recommendations
     * @private
     */
    #generateBenchmarkRecommendations(stats, benchmarks) {
        const recommendations = [];

        for (const [metric, levels] of Object.entries(benchmarks)) {
            const actualValue = stats[metric] || 0;

            if (actualValue < levels.average) {
                recommendations.push({
                    metric,
                    priority: 'high',
                    title: `Improve ${metric} to industry average`,
                    currentValue: actualValue,
                    targetValue: levels.average,
                    gap: levels.average - actualValue
                });
            } else if (actualValue < levels.good) {
                recommendations.push({
                    metric,
                    priority: 'medium',
                    title: `Achieve good performance in ${metric}`,
                    currentValue: actualValue,
                    targetValue: levels.good,
                    gap: levels.good - actualValue
                });
            }
        }

        return recommendations;
    }

    // ==================== Skill Gap Analysis Methods ====================

    /**
     * Get current skill inventory
     * @private
     */
    async #getCurrentSkillInventory(tenantId) {
        try {
            const pipeline = [
                { $match: { tenantId, isDeleted: false } },
                { $unwind: '$skills.technical' },
                {
                    $group: {
                        _id: {
                            skill: '$skills.technical.name',
                            level: '$skills.technical.level'
                        },
                        count: { $sum: 1 },
                        avgExperience: { $avg: '$skills.technical.yearsOfExperience' },
                        consultants: { $push: '$_id' }
                    }
                }
            ];

            const skillInventory = await ConsultantModel.aggregate(pipeline);
            return this.#formatSkillInventory(skillInventory);
        } catch (error) {
            logger.error('Error getting current skill inventory', {
                tenantId,
                error: error.message
            });
            return {};
        }
    }

    /**
     * Format skill inventory
     * @private
     */
    #formatSkillInventory(skillInventory) {
        const formatted = {};

        for (const item of skillInventory) {
            const skillName = item._id.skill;
            const level = item._id.level;

            if (!formatted[skillName]) {
                formatted[skillName] = {
                    count: 0,
                    levels: {},
                    avgExperience: 0,
                    consultants: []
                };
            }

            formatted[skillName].count += item.count;
            formatted[skillName].levels[level] = item.count;
            formatted[skillName].avgExperience = item.avgExperience;
            formatted[skillName].consultants.push(...item.consultants);
        }

        return formatted;
    }

    /**
     * Get projected skill demands
     * @private
     */
    async #getProjectedSkillDemands(tenantId, targetDate) {
        try {
            // Mock implementation - would integrate with project planning systems
            const projectedDemands = {
                'JavaScript': { demand: 15, priority: 'high', growth: 20 },
                'Python': { demand: 12, priority: 'high', growth: 25 },
                'Cloud Architecture': { demand: 8, priority: 'critical', growth: 40 },
                'Data Science': { demand: 6, priority: 'medium', growth: 30 },
                'DevOps': { demand: 10, priority: 'high', growth: 35 }
            };

            return projectedDemands;
        } catch (error) {
            logger.error('Error getting projected skill demands', {
                tenantId,
                error: error.message
            });
            return {};
        }
    }

    /**
     * Calculate skill gaps
     * @private
     */
    async #calculateSkillGaps(currentSkills, projectedDemands) {
        try {
            const gaps = {};

            for (const [skill, demand] of Object.entries(projectedDemands)) {
                const currentSupply = currentSkills[skill] || { count: 0, levels: {} };
                const gap = demand.demand - currentSupply.count;

                gaps[skill] = {
                    currentSupply: currentSupply.count,
                    projectedDemand: demand.demand,
                    gap: Math.max(0, gap),
                    priority: demand.priority,
                    growthRate: demand.growth,
                    severity: this.#calculateGapSeverity(gap, demand.priority)
                };
            }

            return gaps;
        } catch (error) {
            logger.error('Error calculating skill gaps', {
                error: error.message
            });
            return {};
        }
    }

    /**
     * Calculate gap severity
     * @private
     */
    #calculateGapSeverity(gap, priority) {
        const priorityMultiplier = {
            'critical': 3,
            'high': 2,
            'medium': 1.5,
            'low': 1
        };

        const multiplier = priorityMultiplier[priority] || 1;
        const severity = gap * multiplier;

        if (severity >= 15) return 'critical';
        if (severity >= 10) return 'high';
        if (severity >= 5) return 'medium';
        return 'low';
    }

    /**
     * Generate skill gap recommendations
     * @private
     */
    async #generateSkillGapRecommendations(gaps) {
        try {
            const recommendations = [];

            for (const [skill, gap] of Object.entries(gaps)) {
                if (gap.gap > 0) {
                    const recommendation = {
                        skill,
                        gap: gap.gap,
                        priority: gap.priority,
                        strategies: []
                    };

                    // Training existing consultants
                    if (gap.gap <= 5) {
                        recommendation.strategies.push({
                            type: 'training',
                            description: `Train ${Math.ceil(gap.gap)} existing consultants in ${skill}`,
                            timeline: '3-6 months',
                            cost: 'medium',
                            probability: 'high'
                        });
                    }

                    // Hiring new consultants
                    if (gap.gap > 3) {
                        recommendation.strategies.push({
                            type: 'hiring',
                            description: `Hire ${Math.ceil(gap.gap / 2)} consultants with ${skill} expertise`,
                            timeline: '2-4 months',
                            cost: 'high',
                            probability: 'medium'
                        });
                    }

                    // Contractor/freelancer engagement
                    recommendation.strategies.push({
                        type: 'contractor',
                        description: `Engage contractors for immediate ${skill} needs`,
                        timeline: '1-2 months',
                        cost: 'high',
                        probability: 'high'
                    });

                    recommendations.push(recommendation);
                }
            }

            return recommendations.sort((a, b) => {
                const priorityOrder = { critical: 3, high: 2, medium: 1, low: 0 };
                return priorityOrder[b.priority] - priorityOrder[a.priority];
            });
        } catch (error) {
            logger.error('Error generating skill gap recommendations', {
                error: error.message
            });
            return [];
        }
    }

    /**
     * Generate implementation plan
     * @private
     */
    async #generateImplementationPlan(recommendations) {
        try {
            const plan = {
                phases: [],
                totalCost: 0,
                timeline: '12 months',
                risks: [],
                success_metrics: []
            };

            // Phase 1: Critical and High Priority Skills
            const criticalHighPriority = recommendations.filter(r =>
                ['critical', 'high'].includes(r.priority)
            );

            if (criticalHighPriority.length > 0) {
                plan.phases.push({
                    phase: 1,
                    name: 'Critical Skills Gap Closure',
                    duration: '6 months',
                    skills: criticalHighPriority.map(r => r.skill),
                    strategies: criticalHighPriority.flatMap(r => r.strategies),
                    milestones: this.#generateMilestones(criticalHighPriority, 6)
                });
            }

            // Phase 2: Medium Priority Skills
            const mediumPriority = recommendations.filter(r => r.priority === 'medium');

            if (mediumPriority.length > 0) {
                plan.phases.push({
                    phase: 2,
                    name: 'Medium Priority Skills Development',
                    duration: '6 months',
                    skills: mediumPriority.map(r => r.skill),
                    strategies: mediumPriority.flatMap(r => r.strategies),
                    milestones: this.#generateMilestones(mediumPriority, 6)
                });
            }

            plan.totalCost = this.#estimateTotalCost(recommendations);
            plan.risks = this.#identifyImplementationRisks(recommendations);
            plan.success_metrics = this.#defineSuccessMetrics(recommendations);

            return plan;
        } catch (error) {
            logger.error('Error generating implementation plan', {
                error: error.message
            });
            return {};
        }
    }

    /**
     * Generate milestones
     * @private
     */
    #generateMilestones(recommendations, durationMonths) {
        const milestones = [];
        const quarterMilestone = Math.floor(durationMonths / 4);

        for (let i = 1; i <= 4; i++) {
            const month = i * quarterMilestone;
            const completionPercentage = (i / 4) * 100;

            milestones.push({
                month,
                description: `${completionPercentage}% of ${recommendations.length} skill gaps addressed`,
                targetCompletion: completionPercentage,
                keyActivities: [
                    'Training program execution',
                    'Hiring process completion',
                    'Contractor onboarding',
                    'Progress assessment'
                ]
            });
        }

        return milestones;
    }

    /**
     * Estimate total cost
     * @private
     */
    #estimateTotalCost(recommendations) {
        let totalCost = 0;

        const costEstimates = {
            training: 5000, // Per consultant training cost
            hiring: 25000,  // Per new hire cost (recruiting, onboarding)
            contractor: 150 // Per hour contractor cost
        };

        for (const rec of recommendations) {
            for (const strategy of rec.strategies) {
                switch (strategy.type) {
                    case 'training':
                        totalCost += rec.gap * costEstimates.training;
                        break;
                    case 'hiring':
                        totalCost += Math.ceil(rec.gap / 2) * costEstimates.hiring;
                        break;
                    case 'contractor':
                        totalCost += rec.gap * 40 * 4 * costEstimates.contractor; // 40 hours/week for 4 weeks
                        break;
                }
            }
        }

        return Math.round(totalCost);
    }

    /**
     * Identify implementation risks
     * @private
     */
    #identifyImplementationRisks(recommendations) {
        const risks = [];

        const totalGap = recommendations.reduce((sum, rec) => sum + rec.gap, 0);

        if (totalGap > 50) {
            risks.push({
                type: 'capacity',
                severity: 'high',
                description: 'Large skill gap may overwhelm training and hiring capacity',
                mitigation: 'Phase implementation and consider external partnerships'
            });
        }

        const criticalSkills = recommendations.filter(r => r.priority === 'critical');
        if (criticalSkills.length > 5) {
            risks.push({
                type: 'priority',
                severity: 'medium',
                description: 'Multiple critical skills may compete for resources',
                mitigation: 'Establish clear priority ranking and resource allocation'
            });
        }

        risks.push({
            type: 'market',
            severity: 'medium',
            description: 'Competitive talent market may impact hiring success',
            mitigation: 'Develop attractive compensation packages and employer branding'
        });

        return risks;
    }

    /**
     * Define success metrics
     * @private
     */
    #defineSuccessMetrics(recommendations) {
        const metrics = [];

        const totalGap = recommendations.reduce((sum, rec) => sum + rec.gap, 0);

        metrics.push({
            metric: 'Gap Closure Rate',
            target: '90%',
            description: `Close ${Math.floor(totalGap * 0.9)} of ${totalGap} skill gaps within timeline`
        });

        metrics.push({
            metric: 'Training Success Rate',
            target: '85%',
            description: 'Successfully upskill existing consultants with certification completion'
        });

        metrics.push({
            metric: 'Hiring Success Rate',
            target: '80%',
            description: 'Fill new positions with qualified candidates within timeline'
        });

        metrics.push({
            metric: 'Skill Utilization Rate',
            target: '75%',
            description: 'Deploy newly acquired skills on client projects within 3 months'
        });

        return metrics;
    }

    // ==================== Certification Methods ====================

    /**
     * Validate certification data
     * @private
     */
    async #validateCertificationData(certificationData) {
        const errors = [];

        if (!certificationData.name) {
            errors.push('Certification name is required');
        }

        if (!certificationData.issuingBody) {
            errors.push('Issuing body is required');
        }

        if (!certificationData.issuedDate) {
            errors.push('Issued date is required');
        }

        if (certificationData.expiryDate && new Date(certificationData.expiryDate) <= new Date(certificationData.issuedDate)) {
            errors.push('Expiry date must be after issued date');
        }

        if (errors.length > 0) {
            throw new ValidationError(errors.join(', '), 'CERTIFICATION_VALIDATION_FAILED');
        }

        return true;
    }

    /**
     * Check for duplicate certifications
     * @private
     */
    async #checkDuplicateCertification(consultantId, certificationData) {
        const consultant = await ConsultantModel.findById(consultantId);

        if (consultant?.certifications) {
            const duplicate = consultant.certifications.find(cert =>
                cert.name === certificationData.name &&
                cert.issuingBody === certificationData.issuingBody &&
                cert.status === 'active'
            );

            if (duplicate) {
                throw new ConflictError(
                    'Consultant already has this active certification',
                    'DUPLICATE_CERTIFICATION'
                );
            }
        }

        return true;
    }

    /**
     * Update skills from certification
     * @private
     */
    async #updateSkillsFromCertification(consultantId, relatedSkills, userId, session) {
        try {
            for (const skill of relatedSkills) {
                await ConsultantSkillModel.findOneAndUpdate(
                    {
                        consultantId,
                        skillName: skill.name
                    },
                    {
                        $set: {
                            certified: true,
                            'metadata.certificationDate': new Date(),
                            'metadata.certifiedBy': 'system'
                        }
                    },
                    { session, upsert: true }
                );
            }
        } catch (error) {
            logger.error('Error updating skills from certification', {
                consultantId,
                error: error.message
            });
        }
    }

    /**
     * Schedule renewal reminders
     * @private
     */
    async #scheduleRenewalReminders(consultantId, certification, userId) {
        try {
            if (!certification.expiryDate) return;

            const expiryDate = new Date(certification.expiryDate);
            const reminderDates = [
                new Date(expiryDate.getTime() - 90 * 24 * 60 * 60 * 1000), // 90 days before
                new Date(expiryDate.getTime() - 30 * 24 * 60 * 60 * 1000), // 30 days before
                new Date(expiryDate.getTime() - 7 * 24 * 60 * 60 * 1000)   // 7 days before
            ];

            for (const [index, reminderDate] of reminderDates.entries()) {
                const daysBeforeExpiry = [90, 30, 7][index];

                logger.info('Certification renewal reminder scheduled', {
                    consultantId,
                    certificationName: certification.name,
                    reminderDate,
                    daysBeforeExpiry
                });
            }
        } catch (error) {
            logger.error('Error scheduling renewal reminders', {
                consultantId,
                error: error.message
            });
        }
    }

    /**
     * Send certification notifications
     * @private
     */
    async #sendCertificationNotifications(consultant, certification, userId) {
        if (!this.#notificationService) return;

        try {
            await this.#notificationService.send({
                type: 'certification_added',
                recipients: ['hr-team', consultant._id],
                data: {
                    consultantId: consultant._id,
                    consultantName: consultant.fullName,
                    certificationName: certification.name,
                    issuingBody: certification.issuingBody,
                    addedBy: userId
                }
            });
        } catch (error) {
            logger.warn('Failed to send certification notifications', {
                consultantId: consultant._id,
                error: error.message
            });
        }
    }

    /**
     * Check consultant certification status
     * @private
     */
    async #checkConsultantCertificationStatus(consultant) {
        try {
            const now = new Date();
            const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

            const status = {
                isCompliant: true,
                hasExpired: false,
                expired: [],
                expiringSoon: []
            };

            if (consultant.certifications) {
                for (const cert of consultant.certifications) {
                    if (cert.expiryDate) {
                        const expiryDate = new Date(cert.expiryDate);

                        if (expiryDate < now) {
                            status.hasExpired = true;
                            status.isCompliant = false;
                            status.expired.push(cert);
                        } else if (expiryDate < thirtyDaysFromNow) {
                            status.expiringSoon.push(cert);
                        }
                    }
                }
            }

            return status;
        } catch (error) {
            logger.error('Error checking certification status', {
                consultantId: consultant._id,
                error: error.message
            });
            return { isCompliant: false, hasExpired: false, expired: [], expiringSoon: [] };
        }
    }

    /**
     * Generate compliance recommendations
     * @private
     */
    async #generateComplianceRecommendations(complianceReport) {
        const recommendations = [];

        if (complianceReport.expired.length > 0) {
            recommendations.push({
                priority: 'critical',
                category: 'expired_certifications',
                title: 'Address Expired Certifications',
                description: `${complianceReport.expired.length} consultants have expired certifications`,
                actions: [
                    'Contact consultants with expired certifications',
                    'Schedule renewal processes',
                    'Consider temporary restrictions if necessary'
                ]
            });
        }

        if (complianceReport.expiringSoon.length > 0) {
            recommendations.push({
                priority: 'high',
                category: 'expiring_certifications',
                title: 'Proactive Renewal Management',
                description: `${complianceReport.expiringSoon.length} consultants have certifications expiring soon`,
                actions: [
                    'Send renewal reminders',
                    'Provide renewal support and resources',
                    'Schedule renewal timeline'
                ]
            });
        }

        if (complianceReport.statistics.complianceRate < 90) {
            recommendations.push({
                priority: 'medium',
                category: 'compliance_rate',
                title: 'Improve Overall Compliance Rate',
                description: `Compliance rate is ${complianceReport.statistics.complianceRate.toFixed(1)}%`,
                actions: [
                    'Review certification requirements',
                    'Implement compliance tracking system',
                    'Provide certification support programs'
                ]
            });
        }

        return recommendations;
    }

    // ==================== Rate Management Methods ====================

    /**
     * Get benchmark rates
     * @private
     */
    async #getBenchmarkRates(level, country = 'US') {
        try {
            // Mock implementation - would query market data APIs
            const baseBenchmarks = {
                junior: { min: 75, median: 100, max: 125 },
                mid: { min: 125, median: 175, max: 225 },
                senior: { min: 200, median: 275, max: 350 },
                lead: { min: 275, median: 375, max: 475 },
                principal: { min: 350, median: 500, max: 650 },
                director: { min: 450, median: 650, max: 850 },
                partner: { min: 600, median: 900, max: 1200 }
            };

            const countryMultipliers = {
                US: 1.0,
                UK: 0.85,
                CA: 0.80,
                AU: 0.75,
                DE: 0.70
            };

            const multiplier = countryMultipliers[country] || 0.75;
            const baseBenchmark = baseBenchmarks[level] || baseBenchmarks.mid;

            return {
                min: Math.round(baseBenchmark.min * multiplier),
                median: Math.round(baseBenchmark.median * multiplier),
                max: Math.round(baseBenchmark.max * multiplier),
                currency: 'USD',
                country
            };
        } catch (error) {
            logger.error('Error getting benchmark rates', { level, country, error: error.message });
            return { min: 100, median: 150, max: 200, currency: 'USD', country: 'US' };
        }
    }

    /**
     * Assess rate risk
     * @private
     */
    #assessRateRisk(increasePercent, benchmarkComparison) {
        if (increasePercent > 50 || benchmarkComparison > 75) return 'high';
        if (increasePercent > 25 || benchmarkComparison > 50) return 'medium';
        if (increasePercent > 10 || benchmarkComparison > 25) return 'low';
        return 'minimal';
    }

    /**
     * Request rate approval
     * @private
     */
    async #requestRateApproval(consultant, rateData, benchmarkAnalysis, userId) {
        try {
            const approvalRequest = {
                consultantId: consultant._id,
                consultantName: consultant.fullName,
                currentRate: benchmarkAnalysis.currentRate,
                proposedRate: benchmarkAnalysis.newRate,
                increasePercent: benchmarkAnalysis.increasePercent,
                benchmarkAnalysis,
                justification: rateData.reason,
                requestedBy: userId,
                requestedAt: new Date(),
                status: 'pending'
            };

            logger.info('Rate approval requested', approvalRequest);

            if (this.#notificationService) {
                await this.#notificationService.send({
                    type: 'rate_approval_request',
                    recipients: ['finance-team', 'management'],
                    data: approvalRequest
                });
            }
        } catch (error) {
            logger.error('Error requesting rate approval', {
                consultantId: consultant._id,
                error: error.message
            });
        }
    }

    /**
     * Update project rates
     * @private
     */
    async #updateProjectRates(consultantId, newRate, userId, session) {
        try {
            logger.info('Updating project rates', {
                consultantId,
                newRate: newRate.amount,
                updatedBy: userId
            });
        } catch (error) {
            logger.error('Error updating project rates', {
                consultantId,
                error: error.message
            });
        }
    }

    /**
     * Send rate change notifications
     * @private
     */
    async #sendRateChangeNotifications(consultant, rateData, userId) {
        if (!this.#notificationService) return;

        try {
            await this.#notificationService.send({
                type: 'billing_rate_updated',
                recipients: ['finance-team', 'project-managers'],
                data: {
                    consultantId: consultant._id,
                    consultantName: consultant.fullName,
                    previousRate: consultant.billing.rateHistory[consultant.billing.rateHistory.length - 2]?.previousRate,
                    newRate: rateData.standardRate.amount,
                    updatedBy: userId,
                    reason: rateData.reason
                }
            });
        } catch (error) {
            logger.warn('Failed to send rate change notifications', {
                consultantId: consultant._id,
                error: error.message
            });
        }
    }

    // ==================== Helper Methods ====================

    /**
     * Get period dates
     * @private
     */
    #getPeriodDates(period) {
        const now = new Date();
        let startDate, endDate;

        switch (period.type) {
            case 'monthly':
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                break;
            case 'quarterly':
                const quarter = Math.floor(now.getMonth() / 3);
                startDate = new Date(now.getFullYear(), quarter * 3, 1);
                endDate = new Date(now.getFullYear(), quarter * 3 + 3, 0);
                break;
            case 'yearly':
                startDate = new Date(now.getFullYear(), 0, 1);
                endDate = new Date(now.getFullYear(), 11, 31);
                break;
            default:
                startDate = period.startDate || new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                endDate = period.endDate || now;
        }

        return { startDate, endDate };
    }

    /**
     * Get default metrics for fallback
     * @private
     */
    #getDefaultUtilizationMetrics() {
        return {
            totalHours: 0,
            billableHours: 0,
            nonBillableHours: 0,
            capacityHours: 0,
            utilization: 0,
            efficiency: 0,
            targetUtilization: 80,
            utilizationVariance: -80
        };
    }

    #getDefaultProductivityMetrics() {
        return {
            deliverablesCompleted: 0,
            deliverablesOnTime: 0,
            onTimeDeliveryRate: 0,
            tasksCompleted: 0,
            averageTaskCompletionTime: 0,
            qualityScore: 0,
            reworkRate: 0,
            clientFeedbackScore: 0
        };
    }

    #getDefaultQualityMetrics() {
        return {
            overallQualityScore: 0,
            codeQualityScore: 0,
            documentationQualityScore: 0,
            defectRate: 0,
            defectDensity: 0,
            peerReviewScore: 0,
            clientReviewScore: 0,
            qualityTrend: 'stable'
        };
    }

    #getDefaultClientSatisfactionMetrics() {
        return {
            averageRating: 0,
            totalFeedbacks: 0,
            satisfactionScore: 0,
            recommendationScore: 0,
            repeatClientRate: 0,
            clientRetentionRate: 0,
            escalationRate: 0,
            complimentRate: 0
        };
    }

    #getDefaultSkillDevelopmentMetrics() {
        return {
            skillsImproved: 0,
            skillsLearned: 0,
            certificationsEarned: 0,
            trainingHoursCompleted: 0,
            trainingCoursesCompleted: 0,
            skillAssessmentScore: 0,
            developmentGoalsAchieved: 0,
            learningVelocity: 0
        };
    }

    #getDefaultRevenueMetrics() {
        return {
            totalRevenue: 0,
            billableRevenue: 0,
            revenuePerHour: 0,
            revenuePerProject: 0,
            potentialRevenue: 0,
            revenueRealization: 0,
            revenueGrowth: 0,
            profitMargin: 0
        };
    }

    #getDefaultEfficiencyMetrics() {
        return {
            timeUtilization: 0,
            productiveHours: 0,
            meetingHours: 0,
            adminHours: 0,
            focusTimePercentage: 0,
            projectDeliveryEfficiency: 0,
            taskCompletionRate: 0,
            multitaskingIndex: 0
        };
    }

    /**
     * Generate recommendation based on score
     * @private
     */
    #generateRecommendation(score) {
        if (score.total >= 80) {
            return {
                level: 'highly_recommended',
                reason: 'Excellent match on all criteria',
                confidence: 'high',
                strengths: this.#identifyStrengths(score),
                concerns: []
            };
        } else if (score.total >= 60) {
            return {
                level: 'recommended',
                reason: 'Good match with minor gaps',
                confidence: 'medium',
                strengths: this.#identifyStrengths(score),
                concerns: this.#identifyConcerns(score)
            };
        } else if (score.total >= 40) {
            return {
                level: 'possible',
                reason: 'Partial match, consider alternatives',
                confidence: 'low',
                strengths: this.#identifyStrengths(score),
                concerns: this.#identifyConcerns(score)
            };
        } else {
            return {
                level: 'not_recommended',
                reason: 'Significant gaps in requirements',
                confidence: 'very_low',
                strengths: this.#identifyStrengths(score),
                concerns: this.#identifyConcerns(score)
            };
        }
    }

    /**
     * Identify strengths from score
     * @private
     */
    #identifyStrengths(score) {
        const strengths = [];
        if (score.availability >= 25) strengths.push('High availability');
        if (score.skills >= 30) strengths.push('Strong skill match');
        if (score.experience >= 15) strengths.push('Relevant experience');
        if (score.rate >= 8) strengths.push('Competitive rate');
        return strengths;
    }

    /**
     * Identify concerns from score
     * @private
     */
    #identifyConcerns(score) {
        const concerns = [];
        if (score.availability < 15) concerns.push('Limited availability');
        if (score.skills < 20) concerns.push('Skill gaps present');
        if (score.experience < 10) concerns.push('Limited relevant experience');
        if (score.rate < 5) concerns.push('Rate concerns');
        return concerns;
    }



}

module.exports = ConsultantService;