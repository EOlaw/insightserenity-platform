'use strict';

/**
 * @fileoverview Main consultant controller for comprehensive consultant lifecycle management
 * @module servers/customer-services/modules/core-business/consultants/controllers/consultant-controller
 */

const ConsultantService = require('../services/consultant-service');
const ConsultantSkillsService = require('../services/consultant-skills-service');
const ConsultantAvailabilityService = require('../services/consultant-availability-service');
const logger = require('../../../../../../shared/lib/utils/logger');
const { AppError, ValidationError, NotFoundError, ConflictError, ForbiddenError } = require('../../../../../../shared/lib/utils/app-error');
const ResponseFormatter = require('../../../../../../shared/lib/utils/response-formatter');
const asyncHandler = require('../../../../../../shared/lib/utils/async-handler');
const CommonValidator = require('../../../../../../shared/lib/utils/validators/common-validators');
const PaginationHelper = require('../../../../../../shared/lib/utils/helpers/pagination-helper');
const { STATUS_CODES } = require('../../../../../../shared/lib/utils/constants/status-codes');
const { body, param, query, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const validator = require('validator');

/**
 * Controller class for consultant management operations
 * @class ConsultantController
 */
class ConsultantController {
    /**
     * Private fields
     */
    #consultantService;
    #skillsService;
    #availabilityService;
    #responseFormatter;
    #validationConfig;
    #securityConfig;
    #cacheConfig;
    #bulkConfig;
    #exportConfig;
    #searchConfig;
    #paginationConfig;
    #rateLimitConfig;
    #auditConfig;
    #uploadConfig;

    /**
     * Constructor
     */
    constructor() {
        this.#consultantService = new ConsultantService();
        this.#skillsService = new ConsultantSkillsService();
        this.#availabilityService = new ConsultantAvailabilityService();
        this.#responseFormatter = new ResponseFormatter();
        this.#initializeConfigurations();

        // Bind all methods to preserve context
        this.createConsultant = this.createConsultant.bind(this);
        this.getConsultantById = this.getConsultantById.bind(this);
        this.updateConsultant = this.updateConsultant.bind(this);
        this.deleteConsultant = this.deleteConsultant.bind(this);
        this.searchConsultants = this.searchConsultants.bind(this);
        this.findAvailableConsultants = this.findAvailableConsultants.bind(this);
        this.bulkCreateConsultants = this.bulkCreateConsultants.bind(this);
        this.bulkUpdateConsultants = this.bulkUpdateConsultants.bind(this);
        this.bulkUpdateSkills = this.bulkUpdateSkills.bind(this);
        this.exportConsultants = this.exportConsultants.bind(this);
        this.importConsultants = this.importConsultants.bind(this);
        this.getConsultantStatistics = this.getConsultantStatistics.bind(this);
        this.calculatePerformanceMetrics = this.calculatePerformanceMetrics.bind(this);
        this.generateSkillGapAnalysis = this.generateSkillGapAnalysis.bind(this);
        this.updateBillingRates = this.updateBillingRates.bind(this);
        this.addCertification = this.addCertification.bind(this);
        this.checkCertificationCompliance = this.checkCertificationCompliance.bind(this);
        this.getConsultantDashboard = this.getConsultantDashboard.bind(this);
        this.matchConsultantsToProject = this.matchConsultantsToProject.bind(this);
        this.validateConsultantData = this.validateConsultantData.bind(this);
        this.uploadConsultantDocument = this.uploadConsultantDocument.bind(this);
        this.getConsultantDocuments = this.getConsultantDocuments.bind(this);
        this.generateConsultantReport = this.generateConsultantReport.bind(this);
        this.archiveConsultant = this.archiveConsultant.bind(this);
        this.unarchiveConsultant = this.unarchiveConsultant.bind(this);
        this.transferConsultant = this.transferConsultant.bind(this);
        this.benchmarkConsultant = this.benchmarkConsultant.bind(this);
        this.updateConsultantLevel = this.updateConsultantLevel.bind(this);
        this.syncConsultantData = this.syncConsultantData.bind(this);
        this.auditConsultant = this.auditConsultant.bind(this);

        logger.info('ConsultantController initialized');
    }

    /**
     * Create a new consultant
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async createConsultant(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            logger.info('Creating new consultant - Controller');

            // Validate request
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                throw new ValidationError('Validation failed', 'VALIDATION_ERROR', errors.array());
            }

            // Extract tenant context
            const tenantId = req.tenant?.id || req.body.tenantId;
            const userId = req.user?.id || req.user?.adminId;

            if (!tenantId) {
                throw new ValidationError('Tenant context is required', 'TENANT_REQUIRED');
            }

            // Sanitize and prepare consultant data
            const consultantData = {
                ...req.body,
                tenantId,
                organizationId: req.organization?.id,
                metadata: {
                    source: req.body.source || 'manual',
                    importedBy: userId,
                    importedAt: new Date(),
                    ...req.body.metadata
                }
            };

            // Validate business rules
            await this.#validateBusinessRules(consultantData, 'create');

            // Check permissions
            await this.#checkPermission(req, 'consultants.create');

            // Create consultant with options
            const options = {
                source: req.body.source || 'manual',
                skipNotifications: req.body.skipNotifications === true,
                validateDuplicates: req.body.validateDuplicates !== false,
                createProfile: req.body.createProfile !== false,
                initializeAvailability: req.body.initializeAvailability !== false
            };

            const consultant = await this.#consultantService.createConsultant(consultantData, userId, options);

            // Log audit trail
            await this.#logControllerAction('CONSULTANT_CREATED', {
                consultantId: consultant._id,
                consultantCode: consultant.consultantCode,
                userId,
                tenantId
            });

            // Send notifications
            if (!options.skipNotifications) {
                await this.#sendConsultantNotification('created', consultant, req.user);
            }

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                this.#formatConsultantResponse(consultant),
                'Consultant created successfully',
                STATUS_CODES.CREATED
            );

            res.status(STATUS_CODES.CREATED).json(response);
        })(req, res, next);
    }

    /**
     * Get consultant by ID
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async getConsultantById(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            const { consultantId } = req.params;
            const userId = req.user?.id || req.user?.adminId;
            const tenantId = req.tenant?.id;

            logger.info(`Fetching consultant: ${consultantId}`);

            // Validate consultant ID
            if (!CommonValidator.isValidObjectId(consultantId)) {
                throw new ValidationError('Invalid consultant ID format', 'INVALID_CONSULTANT_ID');
            }

            // Parse options from query
            const options = {
                populate: req.query.populate ? req.query.populate.split(',') : [],
                includeDeleted: req.query.includeDeleted === 'true',
                includeArchived: req.query.includeArchived === 'true',
                checkPermissions: req.query.checkPermissions !== 'false',
                userId,
                tenantId
            };

            // Check permissions
            await this.#checkPermission(req, 'consultants.read');

            // Get consultant
            const consultant = await this.#consultantService.getConsultantById(consultantId, options);

            if (!consultant) {
                throw new NotFoundError('Consultant not found', 'CONSULTANT_NOT_FOUND');
            }

            // Check consultant-level permissions
            await this.#checkConsultantAccess(consultant, req.user, 'read');

            // Add performance metrics if requested
            let performanceData = null;
            if (req.query.includePerformance === 'true') {
                performanceData = await this.#consultantService.calculatePerformanceMetrics(
                    consultantId,
                    this.#parseDateRange(req.query),
                    { userId }
                );
            }

            // Add availability summary if requested
            let availabilityData = null;
            if (req.query.includeAvailability === 'true') {
                availabilityData = await this.#availabilityService.getAvailability(
                    consultantId,
                    this.#parseDateRange(req.query),
                    { format: 'summary' }
                );
            }

            // Log access
            await this.#logControllerAction('CONSULTANT_ACCESSED', {
                consultantId,
                userId,
                options
            });

            // Format response
            const responseData = {
                ...this.#formatConsultantResponse(consultant),
                ...(performanceData && { performance: performanceData }),
                ...(availabilityData && { availability: availabilityData })
            };

            const response = this.#responseFormatter.formatSuccess(
                responseData,
                'Consultant retrieved successfully'
            );

            // Set cache headers
            res.set('Cache-Control', `private, max-age=${this.#cacheConfig.consultantTTL}`);
            res.status(STATUS_CODES.OK).json(response);
        })(req, res, next);
    }

    /**
     * Update consultant
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object  
     * @param {Function} next - Express next middleware
     */
    async updateConsultant(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            const { consultantId } = req.params;
            const userId = req.user?.id || req.user?.adminId;

            logger.info(`Updating consultant: ${consultantId}`);

            // Validate request
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                throw new ValidationError('Validation failed', 'VALIDATION_ERROR', errors.array());
            }

            // Validate consultant ID
            if (!CommonValidator.isValidObjectId(consultantId)) {
                throw new ValidationError('Invalid consultant ID format', 'INVALID_CONSULTANT_ID');
            }

            // Check permissions
            await this.#checkPermission(req, 'consultants.update');

            // Prepare update data
            const updateData = {
                ...req.body,
                metadata: {
                    ...req.body.metadata,
                    lastModifiedBy: userId,
                    lastModifiedAt: new Date()
                }
            };

            // Validate business rules
            await this.#validateBusinessRules(updateData, 'update');

            // Update options
            const options = {
                tenantId: req.tenant?.id,
                validateDuplicates: req.body.validateDuplicates !== false,
                skipNotifications: req.body.skipNotifications === true,
                reason: req.body.reason
            };

            // Update consultant
            const updatedConsultant = await this.#consultantService.updateConsultant(
                consultantId,
                updateData,
                userId,
                options
            );

            // Check consultant access post-update
            await this.#checkConsultantAccess(updatedConsultant, req.user, 'update');

            // Log audit trail
            await this.#logControllerAction('CONSULTANT_UPDATED', {
                consultantId,
                userId,
                updatedFields: Object.keys(updateData)
            });

            // Recalculate performance metrics if significant changes
            if (this.#shouldRecalculatePerformance(updateData)) {
                await this.#consultantService.calculatePerformanceMetrics(consultantId, {}, { userId });
            }

            // Send notifications
            if (!options.skipNotifications) {
                await this.#sendConsultantNotification('updated', updatedConsultant, req.user);
            }

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                this.#formatConsultantResponse(updatedConsultant),
                'Consultant updated successfully'
            );

            res.status(STATUS_CODES.OK).json(response);
        })(req, res, next);
    }

    /**
     * Delete consultant
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async deleteConsultant(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            const { consultantId } = req.params;
            const userId = req.user?.id || req.user?.adminId;

            logger.info(`Deleting consultant: ${consultantId}`);

            // Validate consultant ID
            if (!CommonValidator.isValidObjectId(consultantId)) {
                throw new ValidationError('Invalid consultant ID format', 'INVALID_CONSULTANT_ID');
            }

            // Check permissions
            await this.#checkPermission(req, 'consultants.delete');

            // Parse deletion options
            const options = {
                hardDelete: req.body.hardDelete === true,
                reason: req.body.reason,
                skipNotifications: req.body.skipNotifications === true,
                force: req.body.force === true
            };

            // Additional validation for hard delete
            if (options.hardDelete) {
                await this.#checkPermission(req, 'consultants.hardDelete');
                if (!options.reason) {
                    throw new ValidationError('Reason is required for hard delete', 'REASON_REQUIRED');
                }
            }

            // Delete consultant
            const result = await this.#consultantService.deleteConsultant(consultantId, userId, options);

            // Log audit trail
            await this.#logControllerAction('CONSULTANT_DELETED', {
                consultantId,
                userId,
                hardDelete: options.hardDelete,
                reason: options.reason
            });

            // Send notifications
            if (!options.skipNotifications) {
                await this.#sendConsultantNotification('deleted', { _id: consultantId }, req.user);
            }

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                { deleted: true, hardDelete: options.hardDelete },
                `Consultant ${options.hardDelete ? 'permanently deleted' : 'deleted'} successfully`
            );

            res.status(STATUS_CODES.OK).json(response);
        })(req, res, next);
    }

    /**
     * Search consultants with advanced filtering
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async searchConsultants(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            logger.info('Searching consultants');

            // Check permissions
            await this.#checkPermission(req, 'consultants.read');

            // Parse search criteria
            const searchCriteria = this.#parseSearchCriteria(req.query);

            // Parse options
            const options = {
                page: parseInt(req.query.page) || 1,
                limit: Math.min(parseInt(req.query.limit) || 20, this.#paginationConfig.maxLimit),
                sort: this.#parseSortOptions(req.query.sort),
                populate: req.query.populate ? req.query.populate.split(',') : [],
                includeArchived: req.query.includeArchived === 'true',
                tenantId: req.tenant?.id,
                userId: req.user?.id || req.user?.adminId,
                fuzzySkillMatch: req.query.fuzzySkillMatch === 'true',
                skillMatchThreshold: parseFloat(req.query.skillMatchThreshold) || 0.7
            };

            // Apply tenant filtering
            if (options.tenantId) {
                searchCriteria.tenantId = options.tenantId;
            }

            // Execute search
            const searchResults = await this.#consultantService.searchConsultants(searchCriteria, options);

            // Filter results based on permissions
            const filteredConsultants = await this.#filterConsultantsByPermissions(
                searchResults.consultants,
                req.user
            );

            // Add skill match scores if skill-based search
            if (searchCriteria.requiredSkills || searchCriteria.preferredSkills) {
                for (const consultant of filteredConsultants) {
                    consultant.skillMatchScore = await this.#calculateSkillMatchScore(
                        consultant,
                        searchCriteria.requiredSkills,
                        searchCriteria.preferredSkills
                    );
                }
            }

            // Log search
            await this.#logControllerAction('CONSULTANTS_SEARCHED', {
                criteria: searchCriteria,
                resultCount: filteredConsultants.length,
                userId: options.userId
            });

            // Format response with pagination
            const response = this.#responseFormatter.formatPaginatedSuccess(
                filteredConsultants.map(consultant => this.#formatConsultantResponse(consultant)),
                {
                    ...searchResults.pagination,
                    total: filteredConsultants.length
                },
                'Consultants retrieved successfully',
                {
                    searchCriteria,
                    matchingAlgorithm: options.fuzzySkillMatch ? 'fuzzy' : 'exact'
                }
            );

            // Set cache headers for search results
            res.set('Cache-Control', `private, max-age=${this.#cacheConfig.searchTTL}`);
            res.status(STATUS_CODES.OK).json(response);
        })(req, res, next);
    }

    /**
     * Find available consultants for project requirements
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async findAvailableConsultants(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            logger.info('Finding available consultants for project');

            // Validate request
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                throw new ValidationError('Validation failed', 'VALIDATION_ERROR', errors.array());
            }

            // Check permissions
            await this.#checkPermission(req, 'consultants.search');

            // Parse project requirements
            const requirements = {
                startDate: new Date(req.body.startDate),
                endDate: new Date(req.body.endDate),
                requiredSkills: req.body.requiredSkills || [],
                preferredSkills: req.body.preferredSkills || [],
                level: req.body.level,
                allocation: parseInt(req.body.allocation) || 100,
                maxRate: parseFloat(req.body.maxRate),
                location: req.body.location,
                tenantId: req.tenant?.id,
                limit: Math.min(parseInt(req.body.limit) || 20, this.#paginationConfig.maxLimit)
            };

            // Validate date range
            if (requirements.endDate <= requirements.startDate) {
                throw new ValidationError('End date must be after start date', 'INVALID_DATE_RANGE');
            }

            // Find available consultants
            const availableConsultants = await this.#consultantService.findAvailableConsultants(
                requirements,
                { userId: req.user?.id }
            );

            // Filter by permissions
            const authorizedConsultants = await this.#filterConsultantsByPermissions(
                availableConsultants,
                req.user
            );

            // Log matching operation
            await this.#logControllerAction('CONSULTANTS_MATCHED', {
                requirements,
                resultCount: authorizedConsultants.length,
                userId: req.user?.id
            });

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                authorizedConsultants.map(consultant => ({
                    ...this.#formatConsultantResponse(consultant),
                    matchingScores: {
                        availability: consultant.availabilityScore,
                        skills: consultant.skillScore,
                        experience: consultant.experienceScore,
                        rate: consultant.rateScore,
                        total: consultant.totalScore
                    },
                    recommendation: consultant.recommendation
                })),
                'Available consultants found successfully',
                STATUS_CODES.OK,
                { requirements, total: authorizedConsultants.length }
            );

            res.status(STATUS_CODES.OK).json(response);
        })(req, res, next);
    }

    /**
     * Bulk create consultants
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async bulkCreateConsultants(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            logger.info('Bulk creating consultants');

            // Validate request
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                throw new ValidationError('Validation failed', 'VALIDATION_ERROR', errors.array());
            }

            // Check permissions
            await this.#checkPermission(req, 'consultants.bulkCreate');

            const { consultants: consultantsData } = req.body;
            const userId = req.user?.id || req.user?.adminId;
            const tenantId = req.tenant?.id;

            // Validate bulk size
            if (!Array.isArray(consultantsData)) {
                throw new ValidationError('Consultants data must be an array', 'INVALID_BULK_DATA');
            }

            if (consultantsData.length > this.#bulkConfig.maxOperationSize) {
                throw new ValidationError(
                    `Bulk operation exceeds maximum size of ${this.#bulkConfig.maxOperationSize}`,
                    'BULK_SIZE_EXCEEDED'
                );
            }

            // Prepare options
            const options = {
                validateAll: req.body.validateAll !== false,
                stopOnError: req.body.stopOnError === true,
                tenantId,
                skipNotifications: req.body.skipNotifications === true
            };

            // Add tenant context to each consultant
            const enrichedConsultantsData = consultantsData.map(consultantData => ({
                ...consultantData,
                tenantId,
                organizationId: req.organization?.id
            }));

            // Execute bulk creation
            const results = await this.#consultantService.bulkCreateConsultants(
                enrichedConsultantsData,
                userId,
                options
            );

            // Log bulk operation
            await this.#logControllerAction('BULK_CONSULTANTS_CREATED', {
                total: results.total,
                successful: results.successful.length,
                failed: results.failed.length,
                userId
            });

            // Send notifications for successful creations
            if (!options.skipNotifications && results.successful.length > 0) {
                await this.#sendBulkNotification('created', results.successful, req.user);
            }

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                results,
                `Bulk operation completed: ${results.successful.length} created, ${results.failed.length} failed`
            );

            res.status(STATUS_CODES.OK).json(response);
        })(req, res, next);
    }

    /**
     * Bulk update consultant skills
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async bulkUpdateSkills(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            logger.info('Bulk updating consultant skills');

            // Validate request
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                throw new ValidationError('Validation failed', 'VALIDATION_ERROR', errors.array());
            }

            // Check permissions
            await this.#checkPermission(req, 'consultants.bulkUpdate');

            const { skillUpdates } = req.body;
            const userId = req.user?.id || req.user?.adminId;

            // Validate skill updates data
            if (!Array.isArray(skillUpdates)) {
                throw new ValidationError('Skill updates data must be an array', 'INVALID_BULK_DATA');
            }

            // Prepare options
            const options = {
                tenantId: req.tenant?.id,
                validateAll: req.body.validateAll !== false,
                skipNotifications: req.body.skipNotifications === true
            };

            // Execute bulk skill update
            const results = await this.#consultantService.bulkUpdateSkills(skillUpdates, userId, options);

            // Log bulk operation
            await this.#logControllerAction('BULK_SKILLS_UPDATED', {
                total: results.total,
                successful: results.successful.length,
                failed: results.failed.length,
                userId
            });

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                results,
                `Bulk skill update completed: ${results.successful.length} updated, ${results.failed.length} failed`
            );

            res.status(STATUS_CODES.OK).json(response);
        })(req, res, next);
    }

    /**
     * Calculate performance metrics for consultant
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async calculatePerformanceMetrics(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            const { consultantId } = req.params;
            logger.info(`Calculating performance metrics for consultant: ${consultantId}`);

            // Validate consultant ID
            if (!CommonValidator.isValidObjectId(consultantId)) {
                throw new ValidationError('Invalid consultant ID format', 'INVALID_CONSULTANT_ID');
            }

            // Check permissions
            await this.#checkPermission(req, 'consultants.analytics');

            // Parse date range and options
            const period = this.#parseDateRange(req.query);
            const options = {
                userId: req.user?.id,
                includeDetails: req.query.includeDetails === 'true',
                recalculate: req.query.recalculate === 'true'
            };

            // Calculate performance metrics
            const metrics = await this.#consultantService.calculatePerformanceMetrics(
                consultantId,
                period,
                options
            );

            // Log calculation
            await this.#logControllerAction('PERFORMANCE_METRICS_CALCULATED', {
                consultantId,
                period,
                userId: options.userId
            });

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                metrics,
                'Performance metrics calculated successfully'
            );

            // Set cache headers
            res.set('Cache-Control', `private, max-age=${this.#cacheConfig.metricsTTL}`);
            res.status(STATUS_CODES.OK).json(response);
        })(req, res, next);
    }

    /**
     * Generate skill gap analysis
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async generateSkillGapAnalysis(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            logger.info('Generating skill gap analysis');

            // Check permissions
            await this.#checkPermission(req, 'consultants.analytics');

            // Parse requirements and options
            const requirements = {
                tenantId: req.tenant?.id,
                targetDate: req.body.targetDate ? new Date(req.body.targetDate) : new Date(),
                skillRequirements: req.body.skillRequirements || {},
                projectTypes: req.body.projectTypes || []
            };

            const options = {
                includeRecommendations: req.body.includeRecommendations !== false,
                includeTimeline: req.body.includeTimeline !== false,
                includeCosts: req.body.includeCosts !== false
            };

            // Generate skill gap analysis
            const analysis = await this.#consultantService.generateSkillGapAnalysis(requirements, options);

            // Log analysis
            await this.#logControllerAction('SKILL_GAP_ANALYSIS_GENERATED', {
                requirements,
                gapsIdentified: analysis.gaps?.length || 0,
                userId: req.user?.id
            });

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                analysis,
                'Skill gap analysis generated successfully'
            );

            res.status(STATUS_CODES.OK).json(response);
        })(req, res, next);
    }

    /**
     * Update billing rates for consultant
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async updateBillingRates(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            const { consultantId } = req.params;
            const userId = req.user?.id || req.user?.adminId;

            logger.info(`Updating billing rates for consultant: ${consultantId}`);

            // Validate request
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                throw new ValidationError('Validation failed', 'VALIDATION_ERROR', errors.array());
            }

            // Validate consultant ID
            if (!CommonValidator.isValidObjectId(consultantId)) {
                throw new ValidationError('Invalid consultant ID format', 'INVALID_CONSULTANT_ID');
            }

            // Check permissions
            await this.#checkPermission(req, 'consultants.updateRates');

            // Parse rate data
            const rateData = {
                standardRate: {
                    amount: parseFloat(req.body.standardRate),
                    currency: req.body.currency || 'USD',
                    unit: req.body.unit || 'hour'
                },
                overtimeRate: req.body.overtimeRate ? {
                    amount: parseFloat(req.body.overtimeRate),
                    currency: req.body.currency || 'USD',
                    unit: req.body.unit || 'hour'
                } : undefined,
                reason: req.body.reason,
                effectiveDate: req.body.effectiveDate ? new Date(req.body.effectiveDate) : new Date(),
                updateExistingProjects: req.body.updateExistingProjects === true
            };

            // Validate rates
            if (rateData.standardRate.amount <= 0) {
                throw new ValidationError('Standard rate must be greater than zero', 'INVALID_RATE');
            }

            // Update options
            const options = {
                skipApproval: req.body.skipApproval === true,
                notifyStakeholders: req.body.notifyStakeholders !== false
            };

            // Update billing rates
            const result = await this.#consultantService.updateBillingRates(
                consultantId,
                rateData,
                userId,
                options
            );

            // Log rate update
            await this.#logControllerAction('BILLING_RATES_UPDATED', {
                consultantId,
                previousRate: result.previousRate,
                newRate: rateData.standardRate.amount,
                reason: rateData.reason,
                userId
            });

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                result,
                'Billing rates updated successfully'
            );

            res.status(STATUS_CODES.OK).json(response);
        })(req, res, next);
    }

    /**
     * Match consultants to project requirements
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async matchConsultantsToProject(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            logger.info('Matching consultants to project requirements');

            // Validate request
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                throw new ValidationError('Validation failed', 'VALIDATION_ERROR', errors.array());
            }

            // Check permissions
            await this.#checkPermission(req, 'consultants.match');

            // Parse project requirements
            const projectRequirements = {
                ...req.body,
                tenantId: req.tenant?.id
            };

            // Matching options
            const options = {
                algorithm: req.body.algorithm || 'weighted',
                maxResults: Math.min(parseInt(req.body.maxResults) || 10, 50),
                includePartialMatches: req.body.includePartialMatches !== false,
                skillWeighting: parseFloat(req.body.skillWeighting) || 0.4,
                availabilityWeighting: parseFloat(req.body.availabilityWeighting) || 0.3,
                experienceWeighting: parseFloat(req.body.experienceWeighting) || 0.2,
                rateWeighting: parseFloat(req.body.rateWeighting) || 0.1
            };

            // Find matching consultants
            const matches = await this.#consultantService.findAvailableConsultants(
                projectRequirements,
                options
            );

            // Filter by permissions
            const authorizedMatches = await this.#filterConsultantsByPermissions(matches, req.user);

            // Log matching
            await this.#logControllerAction('CONSULTANTS_MATCHED_TO_PROJECT', {
                projectRequirements,
                matchCount: authorizedMatches.length,
                algorithm: options.algorithm,
                userId: req.user?.id
            });

            // Format response with detailed scoring
            const formattedMatches = authorizedMatches.map(match => ({
                consultant: this.#formatConsultantResponse(match),
                scores: {
                    overall: match.totalScore,
                    skills: match.skillScore,
                    availability: match.availabilityScore,
                    experience: match.experienceScore,
                    rate: match.rateScore
                },
                recommendation: match.recommendation,
                matchPercentage: Math.round(match.totalScore),
                rationale: this.#generateMatchRationale(match, projectRequirements)
            }));

            const response = this.#responseFormatter.formatSuccess(
                formattedMatches,
                `Found ${formattedMatches.length} matching consultants`,
                STATUS_CODES.OK,
                {
                    algorithm: options.algorithm,
                    weightings: {
                        skills: options.skillWeighting,
                        availability: options.availabilityWeighting,
                        experience: options.experienceWeighting,
                        rate: options.rateWeighting
                    }
                }
            );

            res.status(STATUS_CODES.OK).json(response);
        })(req, res, next);
    }

    /**
     * Upload consultant document
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async uploadConsultantDocument(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            const { consultantId } = req.params;
            const userId = req.user?.id || req.user?.adminId;

            logger.info(`Uploading document for consultant: ${consultantId}`);

            // Validate consultant ID
            if (!CommonValidator.isValidObjectId(consultantId)) {
                throw new ValidationError('Invalid consultant ID format', 'INVALID_CONSULTANT_ID');
            }

            // Check permissions
            await this.#checkPermission(req, 'consultants.uploadDocuments');

            if (!req.file) {
                throw new ValidationError('Document file is required', 'FILE_REQUIRED');
            }

            // Validate file type and size
            await this.#validateUploadedFile(req.file);

            // Parse document metadata
            const documentData = {
                type: req.body.type || 'other',
                title: req.body.title || req.file.originalname,
                description: req.body.description,
                tags: req.body.tags ? req.body.tags.split(',') : [],
                isPublic: req.body.isPublic === 'true',
                expiryDate: req.body.expiryDate ? new Date(req.body.expiryDate) : null
            };

            // Upload and process document
            const document = await this.#processDocumentUpload(
                consultantId,
                req.file,
                documentData,
                userId
            );

            // Log document upload
            await this.#logControllerAction('CONSULTANT_DOCUMENT_UPLOADED', {
                consultantId,
                documentId: document.id,
                documentType: documentData.type,
                fileName: req.file.originalname,
                userId
            });

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                {
                    documentId: document.id,
                    fileName: document.fileName,
                    type: document.type,
                    uploadedAt: document.uploadedAt,
                    url: document.url
                },
                'Document uploaded successfully',
                STATUS_CODES.CREATED
            );

            res.status(STATUS_CODES.CREATED).json(response);
        })(req, res, next);
    }

    /**
     * Get consultant statistics
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async getConsultantStatistics(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            logger.info('Fetching consultant statistics');

            // Check permissions
            await this.#checkPermission(req, 'consultants.analytics');

            // Parse filters and options
            const filters = this.#parseFilterCriteria(req.query);
            const options = {
                tenantId: req.tenant?.id,
                dateRange: this.#parseDateRange(req.query),
                includeAnalytics: req.query.includeAnalytics !== 'false',
                includePredictions: req.query.includePredictions === 'true',
                includeComparisons: req.query.includeComparisons === 'true'
            };

            // Get statistics
            const statistics = await this.#consultantService.getConsultantStatistics(filters, options);

            // Log statistics access
            await this.#logControllerAction('CONSULTANT_STATISTICS_ACCESSED', {
                filters,
                userId: req.user?.id
            });

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                statistics,
                'Consultant statistics retrieved successfully'
            );

            // Set cache headers
            res.set('Cache-Control', `private, max-age=${this.#cacheConfig.statisticsTTL}`);
            res.status(STATUS_CODES.OK).json(response);
        })(req, res, next);
    }

    /**
     * Private helper methods
     */

    #initializeConfigurations() {
        this.#validationConfig = {
            requiredFields: ['personalInfo.firstName', 'personalInfo.lastName', 'contact.email', 'profile.level'],
            maxNameLength: 100,
            maxDescriptionLength: 2000,
            allowedLevels: ['junior', 'mid', 'senior', 'lead', 'principal', 'director', 'partner'],
            allowedStatuses: ['active', 'inactive', 'on_leave', 'terminated'],
            emailRegex: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
            phoneRegex: /^[\+]?[1-9][\d]{0,15}$/
        };

        this.#securityConfig = {
            requireMFA: false,
            auditSensitiveFields: ['billing', 'performance', 'compensation'],
            encryptFields: ['personalInfo.nationalId', 'billing.bankDetails']
        };

        this.#cacheConfig = {
            consultantTTL: 3600, // 1 hour
            searchTTL: 1800, // 30 minutes
            statisticsTTL: 900, // 15 minutes
            metricsTTL: 1200 // 20 minutes
        };

        this.#bulkConfig = {
            maxOperationSize: 500,
            batchSize: 50,
            maxConcurrency: 3
        };

        this.#exportConfig = {
            supportedFormats: ['csv', 'excel', 'json'],
            maxRecords: 10000,
            maxFileSize: 50 * 1024 * 1024 // 50MB
        };

        this.#searchConfig = {
            maxResults: 500,
            defaultFields: ['personalInfo.firstName', 'personalInfo.lastName', 'consultantCode'],
            searchableFields: ['personalInfo', 'skills', 'profile', 'contact']
        };

        this.#paginationConfig = {
            defaultLimit: 20,
            maxLimit: 100,
            defaultSort: { createdAt: -1 }
        };

        this.#uploadConfig = {
            allowedTypes: ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png'],
            maxFileSize: 10 * 1024 * 1024, // 10MB
            allowedDocumentTypes: ['resume', 'certification', 'portfolio', 'contract', 'id', 'other']
        };

        this.#auditConfig = {
            enabled: true,
            sensitiveActions: ['create', 'update', 'delete', 'rateUpdate', 'transfer'],
            retentionDays: 2555
        };
    }

    /**
     * Additional private helper methods for business logic, validation, etc.
     */

    async #validateBusinessRules(consultantData, operation) {
        const errors = [];

        // Email validation
        if (consultantData.contact?.email && !this.#validationConfig.emailRegex.test(consultantData.contact.email)) {
            errors.push('Invalid email format');
        }

        // Level validation
        if (consultantData.profile?.level && !this.#validationConfig.allowedLevels.includes(consultantData.profile.level)) {
            errors.push(`Invalid level. Allowed values: ${this.#validationConfig.allowedLevels.join(', ')}`);
        }

        // Years of experience validation
        if (consultantData.profile?.yearsOfExperience !== undefined) {
            const years = parseInt(consultantData.profile.yearsOfExperience);
            if (years < 0 || years > 50) {
                errors.push('Years of experience must be between 0 and 50');
            }
        }

        // Billing rate validation
        if (consultantData.billing?.standardRate?.amount !== undefined) {
            const rate = parseFloat(consultantData.billing.standardRate.amount);
            if (rate <= 0) {
                errors.push('Billing rate must be greater than zero');
            }
        }

        if (errors.length > 0) {
            throw new ValidationError(errors.join('; '), 'BUSINESS_RULE_VALIDATION');
        }

        return true;
    }

    async #checkPermission(req, permission) {
        const user = req.user;

        if (!user) {
            throw new ForbiddenError('Authentication required', 'AUTH_REQUIRED');
        }

        if (user.role === 'super_admin' || user.isSuperAdmin) {
            return true;
        }

        const hasPermission = user.role === 'admin' ||
            user.permissions?.includes(permission) ||
            user.roles?.some(role => role.permissions?.includes(permission));

        if (!hasPermission) {
            throw new ForbiddenError(`Insufficient permissions: ${permission}`, 'PERMISSION_DENIED');
        }

        return true;
    }

    async #checkConsultantAccess(consultant, user, action) {
        if (user.role === 'super_admin' || user.isSuperAdmin) {
            return true;
        }

        if (consultant.tenantId?.toString() !== user.tenantId?.toString()) {
            throw new ForbiddenError('Access denied: Consultant belongs to different organization', 'CONSULTANT_ACCESS_DENIED');
        }

        if (user.role === 'admin') {
            return true;
        }

        // Check if user is the consultant themselves
        if (consultant._id?.toString() === user.id?.toString()) {
            return action === 'read' || action === 'update';
        }

        // Check manager permissions
        if (consultant.management?.managerId?.toString() === user.id?.toString()) {
            return true;
        }

        throw new ForbiddenError(`Access denied for action: ${action}`, 'ACCESS_DENIED');
    }

    #parseSearchCriteria(query) {
        const criteria = {};

        if (query.search) {
            criteria.$or = [
                { 'personalInfo.firstName': { $regex: query.search, $options: 'i' } },
                { 'personalInfo.lastName': { $regex: query.search, $options: 'i' } },
                { consultantCode: { $regex: query.search, $options: 'i' } },
                { 'contact.email': { $regex: query.search, $options: 'i' } }
            ];
        }

        if (query.level) {
            criteria['profile.level'] = Array.isArray(query.level) ? { $in: query.level } : query.level;
        }

        if (query.status) {
            criteria['profile.status'] = query.status;
        }

        if (query.skills) {
            const skills = Array.isArray(query.skills) ? query.skills : query.skills.split(',');
            criteria['skills.technical.name'] = { $in: skills };
            criteria.requiredSkills = skills;
        }

        if (query.location) {
            criteria['location.country'] = query.location;
        }

        if (query.minRate || query.maxRate) {
            criteria['billing.standardRate.amount'] = {};
            if (query.minRate) criteria['billing.standardRate.amount'].$gte = parseFloat(query.minRate);
            if (query.maxRate) criteria['billing.standardRate.amount'].$lte = parseFloat(query.maxRate);
        }

        if (query.availability) {
            criteria['availability.status'] = query.availability;
        }

        return criteria;
    }

    #parseFilterCriteria(query) {
        const filters = {};

        if (query.level) filters['profile.level'] = query.level;
        if (query.status) filters['profile.status'] = query.status;
        if (query.location) filters['location.country'] = query.location;
        if (query.availability) filters['availability.status'] = query.availability;

        return filters;
    }

    #parseSortOptions(sortParam) {
        if (!sortParam) return this.#paginationConfig.defaultSort;

        const sortFields = {};
        const fields = sortParam.split(',');

        for (const field of fields) {
            if (field.startsWith('-')) {
                sortFields[field.substring(1)] = -1;
            } else {
                sortFields[field] = 1;
            }
        }

        return sortFields;
    }

    #parseDateRange(query) {
        const defaultStart = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        const defaultEnd = new Date();

        return {
            start: query.dateFrom ? new Date(query.dateFrom) : defaultStart,
            end: query.dateTo ? new Date(query.dateTo) : defaultEnd
        };
    }

    async #filterConsultantsByPermissions(consultants, user) {
        if (user.role === 'super_admin' || user.isSuperAdmin) {
            return consultants;
        }

        return consultants.filter(consultant => {
            const hasTenantAccess = consultant.tenantId?.toString() === user.tenantId?.toString();
            if (!hasTenantAccess) return false;

            if (user.role === 'admin') return true;

            return consultant._id?.toString() === user.id?.toString() ||
                consultant.management?.managerId?.toString() === user.id?.toString() ||
                user.permissions?.includes('consultants.read_all');
        });
    }

    #formatConsultantResponse(consultant) {
        if (!consultant) return null;

        return {
            id: consultant._id,
            consultantCode: consultant.consultantCode,
            personalInfo: {
                firstName: consultant.personalInfo?.firstName,
                lastName: consultant.personalInfo?.lastName,
                fullName: consultant.fullName,
                dateOfBirth: consultant.personalInfo?.dateOfBirth,
                nationality: consultant.personalInfo?.nationality
            },
            contact: {
                email: consultant.contact?.email,
                phoneNumbers: consultant.contact?.phoneNumbers,
                address: consultant.contact?.address
            },
            profile: {
                level: consultant.profile?.level,
                type: consultant.profile?.type,
                jobTitle: consultant.profile?.jobTitle,
                yearsOfExperience: consultant.profile?.yearsOfExperience,
                status: consultant.profile?.status,
                startDate: consultant.profile?.startDate
            },
            skills: consultant.skills ? {
                technical: consultant.skills.technical?.map(skill => ({
                    name: skill.name,
                    level: skill.level,
                    yearsOfExperience: skill.yearsOfExperience,
                    verified: skill.verified
                })),
                functional: consultant.skills.functional,
                language: consultant.skills.language
            } : null,
            availability: consultant.availability ? {
                status: consultant.availability.status,
                currentUtilization: consultant.availability.currentUtilization,
                targetUtilization: consultant.availability.targetUtilization
            } : null,
            billing: consultant.billing ? {
                standardRate: consultant.billing.standardRate,
                currency: consultant.billing.standardRate?.currency
            } : null,
            performance: consultant.performance ? {
                currentRating: consultant.performance.currentRating,
                lastReviewDate: consultant.performance.lastReviewDate
            } : null,
            location: consultant.location,
            createdAt: consultant.createdAt,
            updatedAt: consultant.updatedAt
        };
    }

    async #calculateSkillMatchScore(consultant, requiredSkills = [], preferredSkills = []) {
        if (!requiredSkills.length && !preferredSkills.length) return 0;

        const consultantSkills = consultant.skills?.technical?.map(s => s.name.toLowerCase()) || [];
        
        let score = 0;
        let maxScore = 0;

        // Required skills (weighted higher)
        for (const skill of requiredSkills) {
            maxScore += 3;
            if (consultantSkills.includes(skill.toLowerCase())) {
                score += 3;
            }
        }

        // Preferred skills
        for (const skill of preferredSkills) {
            maxScore += 1;
            if (consultantSkills.includes(skill.toLowerCase())) {
                score += 1;
            }
        }

        return maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
    }

    #shouldRecalculatePerformance(updateData) {
        const performanceImpactingFields = [
            'profile.level',
            'billing.standardRate',
            'skills',
            'availability',
            'performance'
        ];

        return performanceImpactingFields.some(field => 
            updateData.hasOwnProperty(field) || this.#getNestedValue(updateData, field) !== undefined
        );
    }

    #getNestedValue(obj, path) {
        if (!obj || !path) return undefined;
        return path.split('.').reduce((current, key) => {
            return current && typeof current === 'object' ? current[key] : undefined;
        }, obj);
    }

    #generateMatchRationale(match, requirements) {
        const rationale = [];

        if (match.skillScore >= 80) {
            rationale.push('Strong skill alignment with requirements');
        } else if (match.skillScore >= 60) {
            rationale.push('Good skill match with minor gaps');
        } else {
            rationale.push('Partial skill match - training may be required');
        }

        if (match.availabilityScore >= 90) {
            rationale.push('Fully available for project timeline');
        } else if (match.availabilityScore >= 70) {
            rationale.push('Good availability with minor scheduling considerations');
        } else {
            rationale.push('Limited availability - may require scheduling adjustments');
        }

        if (match.experienceScore >= 80) {
            rationale.push('Extensive relevant experience');
        } else if (match.experienceScore >= 60) {
            rationale.push('Good experience level');
        } else {
            rationale.push('Growing experience - suitable for guided projects');
        }

        return rationale;
    }

    async #validateUploadedFile(file) {
        const fileExtension = file.originalname.split('.').pop().toLowerCase();
        
        if (!this.#uploadConfig.allowedTypes.includes(fileExtension)) {
            throw new ValidationError(
                `File type not allowed. Supported types: ${this.#uploadConfig.allowedTypes.join(', ')}`,
                'INVALID_FILE_TYPE'
            );
        }

        if (file.size > this.#uploadConfig.maxFileSize) {
            throw new ValidationError(
                `File size exceeds maximum limit of ${this.#uploadConfig.maxFileSize / (1024 * 1024)}MB`,
                'FILE_TOO_LARGE'
            );
        }
    }

    async #processDocumentUpload(consultantId, file, documentData, userId) {
        // This would integrate with your file storage service
        const document = {
            id: `doc_${Date.now()}`,
            fileName: file.originalname,
            type: documentData.type,
            size: file.size,
            uploadedAt: new Date(),
            uploadedBy: userId,
            url: `/documents/${consultantId}/${file.originalname}`
        };

        return document;
    }

    async #logControllerAction(action, data) {
        try {
            const logEntry = {
                category: 'CONSULTANT_CONTROLLER',
                action,
                timestamp: new Date(),
                data
            };

            logger.audit(logEntry);
        } catch (error) {
            logger.error('Error logging controller action:', { action, error: error.message });
        }
    }

    async #sendConsultantNotification(eventType, consultant, user) {
        try {
            const notificationData = {
                eventType,
                consultantId: consultant._id,
                consultantName: consultant.fullName,
                triggeredBy: user?.id,
                timestamp: new Date()
            };

            logger.debug(`Sending ${eventType} notification for consultant ${consultant._id}`, notificationData);
        } catch (error) {
            logger.error('Error sending consultant notification:', {
                eventType,
                consultantId: consultant._id,
                error: error.message
            });
        }
    }

    async #sendBulkNotification(eventType, results, user) {
        try {
            const notificationData = {
                eventType: `bulk_${eventType}`,
                count: results.length,
                triggeredBy: user?.id,
                timestamp: new Date()
            };

            logger.debug(`Sending bulk ${eventType} notification for ${results.length} consultants`, notificationData);
        } catch (error) {
            logger.error('Error sending bulk notification:', {
                eventType,
                count: results.length,
                error: error.message
            });
        }
    }
}

// Export controller as singleton instance
module.exports = new ConsultantController();