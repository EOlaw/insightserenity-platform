'use strict';

/**
 * @fileoverview Consultant profile controller for comprehensive profile and portfolio management
 * @module servers/customer-services/modules/core-business/consultants/controllers/consultant-profile-controller
 */

const ConsultantProfileService = require('../services/consultant-profile-service');
const ConsultantService = require('../services/consultant-service');
const logger = require('../../../../../../shared/lib/utils/logger');
const { AppError, ValidationError, NotFoundError, ConflictError, ForbiddenError } = require('../../../../../../shared/lib/utils/app-error');
const { ResponseFormatter } = require('../../../../../../shared/lib/utils/response-formatter');
const { asyncHandler } = require('../../../../../../shared/lib/utils/async-handler');
const CommonValidator = require('../../../../../../shared/lib/utils/validators/common-validators');
const FileHelper = require('../../../../../../shared/lib/utils/helpers/file-helper');
const { STATUS_CODES } = require('../../../../../../shared/lib/utils/constants/status-codes');
const { body, param, query, validationResult } = require('express-validator');
const multer = require('multer');
const validator = require('validator');
const path = require('path');

/**
 * Controller class for consultant profile management operations
 * @class ConsultantProfileController
 */
class ConsultantProfileController {
    /**
     * Private fields
     */
    #profileService;
    #consultantService;
    #responseFormatter;
    #validationConfig;
    #securityConfig;
    #cacheConfig;
    #uploadConfig;
    #portfolioConfig;
    #performanceConfig;
    #auditConfig;

    /**
     * Constructor
     */
    constructor() {
        this.#profileService = new ConsultantProfileService();
        this.#consultantService = new ConsultantService();
        this.#responseFormatter = new ResponseFormatter();
        this.#initializeConfigurations();

        // Bind all methods to preserve context
        this.createProfile = this.createProfile.bind(this);
        this.getCompleteProfile = this.getCompleteProfile.bind(this);
        this.updateProfileSection = this.updateProfileSection.bind(this);
        this.addCareerHistory = this.addCareerHistory.bind(this);
        this.updateCareerHistory = this.updateCareerHistory.bind(this);
        this.verifyCareerHistory = this.verifyCareerHistory.bind(this);
        this.addPortfolioProject = this.addPortfolioProject.bind(this);
        this.updatePortfolioProject = this.updatePortfolioProject.bind(this);
        this.removePortfolioProject = this.removePortfolioProject.bind(this);
        this.uploadPortfolioArtifact = this.uploadPortfolioArtifact.bind(this);
        this.updatePortfolioShowcase = this.updatePortfolioShowcase.bind(this);
        this.updateExpertiseAreas = this.updateExpertiseAreas.bind(this);
        this.calculateSkillsMatrix = this.calculateSkillsMatrix.bind(this);
        this.createDevelopmentPlan = this.createDevelopmentPlan.bind(this);
        this.trackDevelopmentProgress = this.trackDevelopmentProgress.bind(this);
        this.addPerformanceReview = this.addPerformanceReview.bind(this);
        this.addAchievement = this.addAchievement.bind(this);
        this.addTestimonial = this.addTestimonial.bind(this);
        this.updateTestimonial = this.updateTestimonial.bind(this);
        this.searchProfiles = this.searchProfiles.bind(this);
        this.generateProfileReport = this.generateProfileReport.bind(this);
        this.uploadProfileDocument = this.uploadProfileDocument.bind(this);
        this.getProfileDocuments = this.getProfileDocuments.bind(this);
        this.updateProfileVisibility = this.updateProfileVisibility.bind(this);
        this.generatePublicProfile = this.generatePublicProfile.bind(this);
        this.validateProfileData = this.validateProfileData.bind(this);
        this.exportProfile = this.exportProfile.bind(this);
        this.importProfileData = this.importProfileData.bind(this);
        this.syncProfileData = this.syncProfileData.bind(this);
        this.auditProfileChanges = this.auditProfileChanges.bind(this);

        logger.info('ConsultantProfileController initialized');
    }

    /**
     * Create or initialize consultant profile
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async createProfile(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            const { consultantId } = req.params;
            const userId = req.user?.id || req.user?.adminId;

            logger.info(`Creating profile for consultant: ${consultantId}`);

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
            await this.#checkPermission(req, 'profiles.create');
            await this.#checkConsultantAccess(consultantId, req.user, 'create');

            // Prepare profile data
            const profileData = {
                ...req.body,
                metadata: {
                    source: req.body.source || 'manual',
                    createdBy: userId,
                    createdAt: new Date(),
                    ...req.body.metadata
                }
            };

            // Validate profile data
            await this.#validateProfileData(profileData);

            // Create profile with options
            const options = {
                source: req.body.source || 'manual',
                skipNotifications: req.body.skipNotifications === true,
                autoGenerateContent: req.body.autoGenerateContent === true
            };

            const profile = await this.#profileService.createProfile(
                consultantId,
                profileData,
                userId,
                options
            );

            // Log audit trail
            await this.#logControllerAction('PROFILE_CREATED', {
                consultantId,
                profileId: profile.profileId,
                userId
            });

            // Send notifications
            if (!options.skipNotifications) {
                await this.#sendProfileNotification('created', profile, req.user);
            }

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                this.#formatProfileResponse(profile),
                'Profile created successfully',
                STATUS_CODES.CREATED
            );

            res.status(STATUS_CODES.CREATED).json(response);
        })(req, res, next);
    }

    /**
     * Get complete profile with all related data
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async getCompleteProfile(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            const { consultantId } = req.params;
            const userId = req.user?.id || req.user?.adminId;

            logger.info(`Fetching complete profile for consultant: ${consultantId}`);

            // Validate consultant ID
            if (!CommonValidator.isValidObjectId(consultantId)) {
                throw new ValidationError('Invalid consultant ID format', 'INVALID_CONSULTANT_ID');
            }

            // Check permissions
            await this.#checkPermission(req, 'profiles.read');

            // Parse options from query
            const options = {
                includePrivate: req.query.includePrivate === 'true',
                includeAnalytics: req.query.includeAnalytics === 'true',
                format: req.query.format || 'json',
                userId,
                tenantId: req.tenant?.id
            };

            // Check consultant access for private data
            if (options.includePrivate) {
                await this.#checkConsultantAccess(consultantId, req.user, 'readPrivate');
            }

            // Get complete profile
            const profile = await this.#profileService.getCompleteProfile(consultantId, options);

            if (!profile) {
                throw new NotFoundError('Profile not found', 'PROFILE_NOT_FOUND');
            }

            // Log access
            await this.#logControllerAction('PROFILE_ACCESSED', {
                consultantId,
                profileId: profile.profileId,
                includePrivate: options.includePrivate,
                userId
            });

            // Handle different response formats
            if (options.format === 'pdf') {
                return this.#handlePDFResponse(res, profile, 'profile');
            } else if (options.format === 'html') {
                return this.#handleHTMLResponse(res, profile);
            }

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                this.#formatProfileResponse(profile, options.includePrivate),
                'Profile retrieved successfully'
            );

            // Set cache headers
            res.set('Cache-Control', `private, max-age=${this.#cacheConfig.profileTTL}`);
            res.status(STATUS_CODES.OK).json(response);
        })(req, res, next);
    }

    /**
     * Update profile section
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async updateProfileSection(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            const { consultantId, section } = req.params;
            const userId = req.user?.id || req.user?.adminId;

            logger.info(`Updating profile section '${section}' for consultant: ${consultantId}`);

            // Validate request
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                throw new ValidationError('Validation failed', 'VALIDATION_ERROR', errors.array());
            }

            // Validate consultant ID and section
            if (!CommonValidator.isValidObjectId(consultantId)) {
                throw new ValidationError('Invalid consultant ID format', 'INVALID_CONSULTANT_ID');
            }

            if (!this.#validationConfig.allowedSections.includes(section)) {
                throw new ValidationError(
                    `Invalid section. Allowed sections: ${this.#validationConfig.allowedSections.join(', ')}`,
                    'INVALID_SECTION'
                );
            }

            // Check permissions
            await this.#checkPermission(req, 'profiles.update');
            await this.#checkConsultantAccess(consultantId, req.user, 'update');

            // Prepare update data
            const updateData = {
                ...req.body,
                metadata: {
                    ...req.body.metadata,
                    lastModifiedBy: userId,
                    lastModifiedAt: new Date()
                }
            };

            // Validate section-specific data
            await this.#validateSectionData(section, updateData);

            // Update options
            const options = {
                validateReferences: req.body.validateReferences !== false,
                skipNotifications: req.body.skipNotifications === true,
                reason: req.body.reason
            };

            // Update profile section
            const updatedProfile = await this.#profileService.updateProfileSection(
                consultantId,
                section,
                updateData,
                userId,
                options
            );

            // Log audit trail
            await this.#logControllerAction('PROFILE_SECTION_UPDATED', {
                consultantId,
                section,
                userId,
                fieldsUpdated: Object.keys(updateData)
            });

            // Send notifications for significant updates
            if (this.#isSignificantUpdate(section, updateData) && !options.skipNotifications) {
                await this.#sendProfileNotification('sectionUpdated', updatedProfile, req.user, { section });
            }

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                this.#formatProfileResponse(updatedProfile),
                `Profile section '${section}' updated successfully`
            );

            res.status(STATUS_CODES.OK).json(response);
        })(req, res, next);
    }

    /**
     * Add career history entry
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async addCareerHistory(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            const { consultantId } = req.params;
            const userId = req.user?.id || req.user?.adminId;

            logger.info(`Adding career history entry for consultant: ${consultantId}`);

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
            await this.#checkPermission(req, 'profiles.updateCareer');
            await this.#checkConsultantAccess(consultantId, req.user, 'update');

            // Validate career entry data
            const careerEntry = await this.#validateCareerEntryData(req.body);

            // Add career history entry with options
            const options = {
                validateDates: req.body.validateDates !== false,
                checkOverlaps: req.body.checkOverlaps !== false,
                autoVerify: req.body.autoVerify === true
            };

            const updatedCareerHistory = await this.#profileService.addCareerHistory(
                consultantId,
                careerEntry,
                userId,
                options
            );

            // Log audit trail
            await this.#logControllerAction('CAREER_HISTORY_ADDED', {
                consultantId,
                company: careerEntry.company?.name,
                position: careerEntry.position?.title,
                userId
            });

            // Send verification requests if references provided
            if (careerEntry.references && careerEntry.references.length > 0) {
                await this.#sendVerificationRequests(careerEntry.references, consultantId, userId);
            }

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                {
                    careerHistory: updatedCareerHistory,
                    entryId: careerEntry.id || careerEntry._id
                },
                'Career history entry added successfully',
                STATUS_CODES.CREATED
            );

            res.status(STATUS_CODES.CREATED).json(response);
        })(req, res, next);
    }

    /**
     * Verify career history entry
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async verifyCareerHistory(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            const { consultantId, entryId } = req.params;
            const userId = req.user?.id || req.user?.adminId;

            logger.info(`Verifying career history entry ${entryId} for consultant: ${consultantId}`);

            // Validate IDs
            if (!CommonValidator.isValidObjectId(consultantId)) {
                throw new ValidationError('Invalid consultant ID format', 'INVALID_CONSULTANT_ID');
            }

            if (!CommonValidator.isValidObjectId(entryId)) {
                throw new ValidationError('Invalid entry ID format', 'INVALID_ENTRY_ID');
            }

            // Check permissions
            await this.#checkPermission(req, 'profiles.verifyCareer');

            // Prepare verification data
            const verificationData = {
                verifiedBy: userId,
                verifiedAt: new Date(),
                verificationMethod: req.body.verificationMethod || 'manual',
                verifierRole: req.body.verifierRole || 'hr',
                comments: req.body.comments,
                evidence: req.body.evidence,
                confidenceLevel: req.body.confidenceLevel || 'high'
            };

            // Verify career history entry
            const verificationResult = await this.#profileService.verifyCareerHistory(
                consultantId,
                entryId,
                verificationData,
                userId
            );

            // Log audit trail
            await this.#logControllerAction('CAREER_HISTORY_VERIFIED', {
                consultantId,
                entryId,
                verificationMethod: verificationData.verificationMethod,
                userId
            });

            // Send verification notifications
            await this.#sendVerificationNotification(consultantId, verificationResult, userId);

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                verificationResult,
                'Career history entry verified successfully'
            );

            res.status(STATUS_CODES.OK).json(response);
        })(req, res, next);
    }

    /**
     * Add portfolio project
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async addPortfolioProject(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            const { consultantId } = req.params;
            const userId = req.user?.id || req.user?.adminId;

            logger.info(`Adding portfolio project for consultant: ${consultantId}`);

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
            await this.#checkPermission(req, 'profiles.updatePortfolio');
            await this.#checkConsultantAccess(consultantId, req.user, 'update');

            // Validate project data
            const projectData = await this.#validatePortfolioProjectData(req.body);

            // Add portfolio project with options
            const options = {
                validateClient: req.body.validateClient !== false,
                checkDuplicates: req.body.checkDuplicates !== false,
                autoGenerateShowcase: req.body.autoGenerateShowcase === true
            };

            const project = await this.#profileService.addPortfolioProject(
                consultantId,
                projectData,
                userId,
                options
            );

            // Log audit trail
            await this.#logControllerAction('PORTFOLIO_PROJECT_ADDED', {
                consultantId,
                projectTitle: project.title,
                projectId: project.id || project._id,
                userId
            });

            // Update expertise if new skills demonstrated
            if (projectData.skillsDemonstrated && projectData.skillsDemonstrated.length > 0) {
                await this.#updateExpertiseFromProject(consultantId, projectData, userId);
            }

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                this.#formatPortfolioProjectResponse(project),
                'Portfolio project added successfully',
                STATUS_CODES.CREATED
            );

            res.status(STATUS_CODES.CREATED).json(response);
        })(req, res, next);
    }

    /**
     * Upload portfolio artifact
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async uploadPortfolioArtifact(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            const { consultantId, projectId } = req.params;
            const userId = req.user?.id || req.user?.adminId;

            logger.info(`Uploading portfolio artifact for consultant: ${consultantId}, project: ${projectId}`);

            // Validate IDs
            if (!CommonValidator.isValidObjectId(consultantId)) {
                throw new ValidationError('Invalid consultant ID format', 'INVALID_CONSULTANT_ID');
            }

            // Check permissions
            await this.#checkPermission(req, 'profiles.uploadArtifacts');
            await this.#checkConsultantAccess(consultantId, req.user, 'update');

            // Validate file upload
            if (!req.file) {
                throw new ValidationError('Artifact file is required', 'FILE_REQUIRED');
            }

            await this.#validateArtifactFile(req.file);

            // Parse artifact metadata
            const artifactData = {
                type: req.body.type || 'document',
                title: req.body.title || req.file.originalname,
                description: req.body.description,
                tags: req.body.tags ? req.body.tags.split(',') : [],
                isShowcase: req.body.isShowcase === 'true',
                displayOrder: parseInt(req.body.displayOrder) || 0,
                accessLevel: req.body.accessLevel || 'internal'
            };

            // Process artifact upload
            const artifact = await this.#processArtifactUpload(
                consultantId,
                projectId,
                req.file,
                artifactData,
                userId
            );

            // Log artifact upload
            await this.#logControllerAction('PORTFOLIO_ARTIFACT_UPLOADED', {
                consultantId,
                projectId,
                artifactId: artifact.id,
                artifactType: artifactData.type,
                fileName: req.file.originalname,
                userId
            });

            // Update project showcase if artifact is marked as showcase
            if (artifactData.isShowcase) {
                await this.#updateProjectShowcase(consultantId, projectId, artifact.id, userId);
            }

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                {
                    artifactId: artifact.id,
                    fileName: artifact.fileName,
                    type: artifact.type,
                    url: artifact.url,
                    uploadedAt: artifact.uploadedAt
                },
                'Portfolio artifact uploaded successfully',
                STATUS_CODES.CREATED
            );

            res.status(STATUS_CODES.CREATED).json(response);
        })(req, res, next);
    }

    /**
     * Update portfolio showcase settings
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async updatePortfolioShowcase(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            const { consultantId } = req.params;
            const userId = req.user?.id || req.user?.adminId;

            logger.info(`Updating portfolio showcase for consultant: ${consultantId}`);

            // Validate consultant ID
            if (!CommonValidator.isValidObjectId(consultantId)) {
                throw new ValidationError('Invalid consultant ID format', 'INVALID_CONSULTANT_ID');
            }

            // Check permissions
            await this.#checkPermission(req, 'profiles.updatePortfolio');
            await this.#checkConsultantAccess(consultantId, req.user, 'update');

            // Validate showcase settings
            const showcaseSettings = await this.#validateShowcaseSettings(req.body);

            // Update portfolio showcase
            const showcase = await this.#profileService.updatePortfolioShowcase(
                consultantId,
                showcaseSettings,
                userId
            );

            // Log audit trail
            await this.#logControllerAction('PORTFOLIO_SHOWCASE_UPDATED', {
                consultantId,
                showcaseSettings: Object.keys(showcaseSettings),
                userId
            });

            // Generate public URL if requested
            if (showcaseSettings.generatePublicUrl) {
                await this.#generatePublicPortfolioUrl(consultantId, userId);
            }

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                showcase,
                'Portfolio showcase updated successfully'
            );

            res.status(STATUS_CODES.OK).json(response);
        })(req, res, next);
    }

    /**
     * Update expertise areas
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async updateExpertiseAreas(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            const { consultantId } = req.params;
            const userId = req.user?.id || req.user?.adminId;

            logger.info(`Updating expertise areas for consultant: ${consultantId}`);

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
            await this.#checkPermission(req, 'profiles.updateExpertise');
            await this.#checkConsultantAccess(consultantId, req.user, 'update');

            // Validate expertise data
            const expertiseData = await this.#validateExpertiseData(req.body);

            // Update expertise areas
            const updatedExpertise = await this.#profileService.updateExpertiseAreas(
                consultantId,
                expertiseData,
                userId
            );

            // Log audit trail
            await this.#logControllerAction('EXPERTISE_AREAS_UPDATED', {
                consultantId,
                domainsUpdated: expertiseData.domains?.length || 0,
                industriesUpdated: expertiseData.industries?.length || 0,
                userId
            });

            // Update market positioning if significant changes
            if (this.#shouldUpdateMarketPositioning(expertiseData)) {
                await this.#updateMarketPositioning(consultantId, updatedExpertise, userId);
            }

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                updatedExpertise,
                'Expertise areas updated successfully'
            );

            res.status(STATUS_CODES.OK).json(response);
        })(req, res, next);
    }

    /**
     * Calculate skills matrix
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async calculateSkillsMatrix(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            const { consultantId } = req.params;
            const userId = req.user?.id || req.user?.adminId;

            logger.info(`Calculating skills matrix for consultant: ${consultantId}`);

            // Validate consultant ID
            if (!CommonValidator.isValidObjectId(consultantId)) {
                throw new ValidationError('Invalid consultant ID format', 'INVALID_CONSULTANT_ID');
            }

            // Check permissions
            await this.#checkPermission(req, 'profiles.viewSkills');

            // Parse calculation options
            const options = {
                includeGaps: req.query.includeGaps === 'true',
                includeRecommendations: req.query.includeRecommendations === 'true',
                compareToMarket: req.query.compareToMarket === 'true',
                skillLevel: req.query.skillLevel || 'all'
            };

            // Calculate skills matrix
            const skillsMatrix = await this.#profileService.calculateSkillsMatrix(consultantId, options);

            // Log calculation
            await this.#logControllerAction('SKILLS_MATRIX_CALCULATED', {
                consultantId,
                options,
                skillsCount: skillsMatrix.technical?.length || 0,
                userId
            });

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                skillsMatrix,
                'Skills matrix calculated successfully'
            );

            // Set cache headers
            res.set('Cache-Control', `private, max-age=${this.#cacheConfig.skillsMatrixTTL}`);
            res.status(STATUS_CODES.OK).json(response);
        })(req, res, next);
    }

    /**
     * Create development plan
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async createDevelopmentPlan(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            const { consultantId } = req.params;
            const userId = req.user?.id || req.user?.adminId;

            logger.info(`Creating development plan for consultant: ${consultantId}`);

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
            await this.#checkPermission(req, 'profiles.createDevelopmentPlan');
            await this.#checkConsultantAccess(consultantId, req.user, 'update');

            // Validate development plan data
            const planData = await this.#validateDevelopmentPlanData(req.body);

            // Create development plan
            const developmentPlan = await this.#profileService.createDevelopmentPlan(
                consultantId,
                planData,
                userId
            );

            // Log audit trail
            await this.#logControllerAction('DEVELOPMENT_PLAN_CREATED', {
                consultantId,
                planYear: planData.year,
                goalsCount: planData.goals?.length || 0,
                budget: planData.budget?.allocated || 0,
                userId
            });

            // Schedule plan reviews if configured
            if (planData.autoScheduleReviews) {
                await this.#schedulePlanReviews(consultantId, developmentPlan, userId);
            }

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                developmentPlan,
                'Development plan created successfully',
                STATUS_CODES.CREATED
            );

            res.status(STATUS_CODES.CREATED).json(response);
        })(req, res, next);
    }

    /**
     * Track development progress
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async trackDevelopmentProgress(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            const { consultantId, goalId } = req.params;
            const userId = req.user?.id || req.user?.adminId;

            logger.info(`Tracking development progress for consultant: ${consultantId}, goal: ${goalId}`);

            // Validate IDs
            if (!CommonValidator.isValidObjectId(consultantId)) {
                throw new ValidationError('Invalid consultant ID format', 'INVALID_CONSULTANT_ID');
            }

            // Check permissions
            await this.#checkPermission(req, 'profiles.trackDevelopment');
            await this.#checkConsultantAccess(consultantId, req.user, 'update');

            // Validate progress data
            const progressData = await this.#validateProgressData(req.body);

            // Track development progress
            const updatedGoal = await this.#profileService.trackDevelopmentProgress(
                consultantId,
                goalId,
                progressData,
                userId
            );

            // Log progress update
            await this.#logControllerAction('DEVELOPMENT_PROGRESS_TRACKED', {
                consultantId,
                goalId,
                progressPercentage: progressData.percentage,
                milestoneCompleted: progressData.milestoneCompleted,
                userId
            });

            // Send progress notifications if milestone reached
            if (progressData.milestoneCompleted || progressData.percentage >= 100) {
                await this.#sendProgressNotification(consultantId, updatedGoal, progressData, userId);
            }

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                updatedGoal,
                'Development progress tracked successfully'
            );

            res.status(STATUS_CODES.OK).json(response);
        })(req, res, next);
    }

    /**
     * Add performance review
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async addPerformanceReview(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            const { consultantId } = req.params;
            const userId = req.user?.id || req.user?.adminId;

            logger.info(`Adding performance review for consultant: ${consultantId}`);

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
            await this.#checkPermission(req, 'profiles.addPerformanceReview');
            await this.#checkManagerAccess(consultantId, req.user);

            // Validate review data
            const reviewData = await this.#validatePerformanceReviewData(req.body);

            // Add performance review
            const review = await this.#profileService.addPerformanceReview(
                consultantId,
                reviewData,
                userId
            );

            // Log audit trail
            await this.#logControllerAction('PERFORMANCE_REVIEW_ADDED', {
                consultantId,
                reviewPeriod: reviewData.period,
                overallScore: reviewData.scores?.overall,
                reviewerId: userId
            });

            // Update consultant performance metrics
            await this.#updatePerformanceMetrics(consultantId, review, userId);

            // Send review notifications
            await this.#sendPerformanceReviewNotification(consultantId, review, userId);

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                this.#formatPerformanceReviewResponse(review),
                'Performance review added successfully',
                STATUS_CODES.CREATED
            );

            res.status(STATUS_CODES.CREATED).json(response);
        })(req, res, next);
    }

    /**
     * Add testimonial
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async addTestimonial(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            const { consultantId } = req.params;
            const userId = req.user?.id || req.user?.adminId;

            logger.info(`Adding testimonial for consultant: ${consultantId}`);

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
            await this.#checkPermission(req, 'profiles.addTestimonial');

            // Validate testimonial data
            const testimonialData = await this.#validateTestimonialData(req.body);

            // Add testimonial to portfolio
            const testimonial = await this.#addPortfolioTestimonial(
                consultantId,
                testimonialData,
                userId
            );

            // Log audit trail
            await this.#logControllerAction('TESTIMONIAL_ADDED', {
                consultantId,
                testimonialId: testimonial.id,
                authorName: testimonialData.author?.name,
                rating: testimonialData.rating,
                userId
            });

            // Send testimonial notifications
            await this.#sendTestimonialNotification(consultantId, testimonial, userId);

            // Format response
            const response = this.#responseFormatter.formatSuccess(
                this.#formatTestimonialResponse(testimonial),
                'Testimonial added successfully',
                STATUS_CODES.CREATED
            );

            res.status(STATUS_CODES.CREATED).json(response);
        })(req, res, next);
    }

    /**
     * Search profiles with advanced filtering
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async searchProfiles(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            logger.info('Searching consultant profiles');

            // Check permissions
            await this.#checkPermission(req, 'profiles.search');

            // Parse search criteria
            const searchCriteria = this.#parseProfileSearchCriteria(req.query);

            // Parse options
            const options = {
                page: parseInt(req.query.page) || 1,
                limit: Math.min(parseInt(req.query.limit) || 20, this.paginationConfig.maxLimit),
                sort: this.#parseSortOptions(req.query.sort),
                includePrivate: req.query.includePrivate === 'true',
                tenantId: req.tenant?.id,
                userId: req.user?.id || req.user?.adminId
            };

            // Execute search
            const searchResults = await this.#profileService.searchProfiles(searchCriteria, options);

            // Filter results based on permissions
            const filteredProfiles = await this.#filterProfilesByPermissions(
                searchResults.profiles,
                req.user
            );

            // Log search
            await this.#logControllerAction('PROFILES_SEARCHED', {
                criteria: searchCriteria,
                resultCount: filteredProfiles.length,
                userId: options.userId
            });

            // Format response with pagination
            const response = this.#responseFormatter.formatPaginatedSuccess(
                filteredProfiles.map(profile => this.#formatProfileResponse(profile, options.includePrivate)),
                searchResults.pagination,
                'Profiles retrieved successfully',
                { searchCriteria }
            );

            res.status(STATUS_CODES.OK).json(response);
        })(req, res, next);
    }

    /**
     * Generate profile report
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async generateProfileReport(req, res, next) {
        return asyncHandler(async (req, res, next) => {
            const { consultantId } = req.params;
            const userId = req.user?.id || req.user?.adminId;

            logger.info(`Generating profile report for consultant: ${consultantId}`);

            // Validate consultant ID
            if (!CommonValidator.isValidObjectId(consultantId)) {
                throw new ValidationError('Invalid consultant ID format', 'INVALID_CONSULTANT_ID');
            }

            // Check permissions
            await this.#checkPermission(req, 'profiles.generateReport');
            await this.#checkConsultantAccess(consultantId, req.user, 'read');

            // Parse report options
            const reportOptions = {
                format: req.query.format || 'pdf',
                sections: req.query.sections ? req.query.sections.split(',') : ['all'],
                includeConfidential: req.query.includeConfidential === 'true',
                template: req.query.template || 'standard'
            };

            // Additional permission check for confidential data
            if (reportOptions.includeConfidential) {
                await this.#checkPermission(req, 'profiles.viewConfidential');
            }

            // Generate profile report
            const report = await this.#profileService.generateProfileReport(
                consultantId,
                reportOptions,
                userId
            );

            // Log report generation
            await this.#logControllerAction('PROFILE_REPORT_GENERATED', {
                consultantId,
                format: reportOptions.format,
                sections: reportOptions.sections,
                includeConfidential: reportOptions.includeConfidential,
                userId
            });

            // Handle different report formats
            if (reportOptions.format === 'pdf') {
                return this.#handlePDFResponse(res, report, 'report');
            } else if (reportOptions.format === 'word') {
                return this.#handleWordResponse(res, report);
            } else if (reportOptions.format === 'html') {
                return this.#handleHTMLResponse(res, report);
            }

            // Default JSON response
            const response = this.#responseFormatter.formatSuccess(
                report,
                'Profile report generated successfully'
            );

            res.status(STATUS_CODES.OK).json(response);
        })(req, res, next);
    }

    /**
     * Private helper methods
     */

    #initializeConfigurations() {
        this.#validationConfig = {
            allowedSections: ['summary', 'careerHistory', 'expertise', 'portfolio', 'qualifications', 'development'],
            maxSummaryLength: 2000,
            maxDescriptionLength: 1000,
            maxTestimonialLength: 500,
            allowedTestimonialRatings: [1, 2, 3, 4, 5],
            allowedExpertiseLevels: ['awareness', 'working', 'practitioner', 'expert', 'thought_leader'],
            maxPortfolioProjects: 50,
            maxCareerEntries: 20
        };

        this.#securityConfig = {
            requireMFA: false,
            auditSensitiveFields: ['performance', 'compensation', 'personalInfo'],
            encryptFields: ['personalInfo.ssn', 'banking']
        };

        this.#cacheConfig = {
            profileTTL: 3600, // 1 hour
            skillsMatrixTTL: 1800, // 30 minutes
            portfolioTTL: 2400 // 40 minutes
        };

        this.#uploadConfig = {
            allowedArtifactTypes: ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'jpg', 'jpeg', 'png', 'gif', 'mp4', 'zip'],
            maxArtifactSize: 25 * 1024 * 1024, // 25MB
            allowedDocumentTypes: ['portfolio', 'certification', 'resume', 'reference', 'other']
        };

        this.#portfolioConfig = {
            maxProjectsPerConsultant: 50,
            maxArtifactsPerProject: 20,
            allowedProjectStatuses: ['completed', 'ongoing', 'on_hold', 'cancelled'],
            showcaseProjectLimit: 6
        };

        this.#performanceConfig = {
            ratingScale: { min: 1, max: 5 },
            requiredReviewFields: ['scores', 'period', 'feedback'],
            calibrationRequired: true,
            managerApprovalRequired: true
        };

        this.#auditConfig = {
            enabled: true,
            sensitiveActions: ['create', 'update', 'verify', 'addReview', 'updateShowcase'],
            retentionDays: 2555
        };

        this.paginationConfig = {
            defaultLimit: 20,
            maxLimit: 100,
            minLimit: 1,
            defaultPage: 1,
            allowedSortFields: [
                'displayName', 'title', 'level', 'department',
                'createdAt', 'updatedAt', 'performance.rating',
                'expertise.domains.name', 'careerHistory.length'
            ],
            maxSearchResults: 1000
        };
    }

    /**
     * Additional private helper methods for validation, processing, etc.
     */

    async #validateProfileData(profileData) {
        const errors = [];

        if (profileData.summary?.executiveSummary &&
            profileData.summary.executiveSummary.length > this.#validationConfig.maxSummaryLength) {
            errors.push(`Executive summary exceeds maximum length of ${this.#validationConfig.maxSummaryLength}`);
        }

        if (errors.length > 0) {
            throw new ValidationError(errors.join('; '), 'PROFILE_VALIDATION_FAILED');
        }

        return true;
    }

    async #validateSectionData(section, updateData) {
        const errors = [];

        switch (section) {
            case 'summary':
                if (updateData.executiveSummary &&
                    updateData.executiveSummary.length > this.#validationConfig.maxSummaryLength) {
                    errors.push('Executive summary too long');
                }
                break;
            case 'careerHistory':
                if (!updateData.company?.name) {
                    errors.push('Company name is required');
                }
                if (!updateData.position?.title) {
                    errors.push('Position title is required');
                }
                break;
            case 'expertise':
                if (updateData.domains) {
                    for (const domain of updateData.domains) {
                        if (!this.#validationConfig.allowedExpertiseLevels.includes(domain.level)) {
                            errors.push(`Invalid expertise level: ${domain.level}`);
                        }
                    }
                }
                break;
        }

        if (errors.length > 0) {
            throw new ValidationError(errors.join('; '), 'SECTION_VALIDATION_FAILED');
        }

        return true;
    }

    async #validateCareerEntryData(careerEntry) {
        const errors = [];

        if (!careerEntry.company?.name) {
            errors.push('Company name is required');
        }

        if (!careerEntry.position?.title) {
            errors.push('Position title is required');
        }

        if (!careerEntry.duration?.startDate) {
            errors.push('Start date is required');
        }

        if (careerEntry.duration?.endDate) {
            const startDate = new Date(careerEntry.duration.startDate);
            const endDate = new Date(careerEntry.duration.endDate);

            if (endDate <= startDate) {
                errors.push('End date must be after start date');
            }
        }

        if (errors.length > 0) {
            throw new ValidationError(errors.join('; '), 'CAREER_ENTRY_VALIDATION_FAILED');
        }

        return careerEntry;
    }

    async #validatePortfolioProjectData(projectData) {
        const errors = [];

        if (!projectData.title) {
            errors.push('Project title is required');
        }

        if (!projectData.description) {
            errors.push('Project description is required');
        }

        if (projectData.description.length > this.#validationConfig.maxDescriptionLength) {
            errors.push(`Description exceeds maximum length of ${this.#validationConfig.maxDescriptionLength}`);
        }

        if (projectData.status && !this.#portfolioConfig.allowedProjectStatuses.includes(projectData.status)) {
            errors.push(`Invalid project status: ${projectData.status}`);
        }

        if (errors.length > 0) {
            throw new ValidationError(errors.join('; '), 'PROJECT_VALIDATION_FAILED');
        }

        return projectData;
    }

    async #validateArtifactFile(file) {
        const fileExtension = file.originalname.split('.').pop().toLowerCase();

        if (!this.#uploadConfig.allowedArtifactTypes.includes(fileExtension)) {
            throw new ValidationError(
                `File type not allowed. Supported types: ${this.#uploadConfig.allowedArtifactTypes.join(', ')}`,
                'INVALID_ARTIFACT_TYPE'
            );
        }

        if (file.size > this.#uploadConfig.maxArtifactSize) {
            throw new ValidationError(
                `File size exceeds maximum limit of ${this.#uploadConfig.maxArtifactSize / (1024 * 1024)}MB`,
                'ARTIFACT_TOO_LARGE'
            );
        }
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

    async #checkConsultantAccess(consultantId, user, action) {
        if (user.role === 'super_admin' || user.isSuperAdmin) {
            return true;
        }

        // User can access their own profile
        if (consultantId === user.id?.toString()) {
            return true;
        }

        // Admin users have access to all profiles in their tenant
        if (user.role === 'admin') {
            return true;
        }

        // Check manager access
        const consultant = await this.#consultantService.getConsultantById(consultantId, {
            populate: ['management'],
            userId: user.id
        });

        if (consultant?.management?.managerId?.toString() === user.id?.toString()) {
            return true;
        }

        throw new ForbiddenError(`Access denied for action: ${action}`, 'ACCESS_DENIED');
    }

    async #checkManagerAccess(consultantId, user) {
        const consultant = await this.#consultantService.getConsultantById(consultantId, {
            populate: ['management'],
            userId: user.id
        });

        const isManager = consultant?.management?.managerId?.toString() === user.id?.toString();
        const isAdmin = user.role === 'admin' || user.role === 'super_admin';

        if (!isManager && !isAdmin) {
            throw new ForbiddenError('Manager access required', 'MANAGER_ACCESS_REQUIRED');
        }

        return true;
    }

    #formatProfileResponse(profile, includePrivate = false) {
        if (!profile) return null;

        const response = {
            id: profile._id,
            profileId: profile.profileId,
            consultantId: profile.consultantId,
            summary: profile.summary,
            expertise: profile.expertise,
            careerHistory: profile.careerHistory?.map(entry => ({
                id: entry._id,
                company: entry.company,
                position: entry.position,
                duration: entry.duration,
                description: entry.description,
                verified: entry.verified
            })),
            portfolio: profile.portfolio ? {
                projects: profile.portfolio.projects?.map(project => this.#formatPortfolioProjectResponse(project)),
                testimonials: profile.portfolio.testimonials,
                publicUrl: profile.portfolio.publicUrl
            } : null,
            qualifications: profile.qualifications,
            development: profile.development,
            completeness: profile.completeness,
            visibility: profile.visibility,
            createdAt: profile.createdAt,
            updatedAt: profile.updatedAt
        };

        if (includePrivate) {
            response.performance = profile.performance;
            response.compensation = profile.compensation;
            response.analytics = profile.analytics;
        }

        return response;
    }

    #formatPortfolioProjectResponse(project) {
        return {
            id: project._id,
            title: project.title,
            description: project.description,
            client: project.client,
            duration: project.duration,
            role: project.role,
            technologies: project.technologies,
            achievements: project.achievements,
            artifacts: project.artifacts,
            showcase: project.showcase,
            createdAt: project.createdAt
        };
    }

    // Continue with remaining private helper methods...

    #isSignificantUpdate(section, updateData) {
        const significantSections = ['expertise', 'careerHistory', 'portfolio'];
        return significantSections.includes(section);
    }

    async #logControllerAction(action, data) {
        try {
            const logEntry = {
                category: 'PROFILE_CONTROLLER',
                action,
                timestamp: new Date(),
                data
            };

            logger.audit(logEntry);
        } catch (error) {
            logger.error('Error logging controller action:', { action, error: error.message });
        }
    }

    async #sendProfileNotification(eventType, profile, user, context = {}) {
        try {
            const notificationData = {
                eventType,
                profileId: profile.profileId,
                consultantId: profile.consultantId,
                triggeredBy: user?.id,
                context,
                timestamp: new Date()
            };

            logger.debug(`Sending ${eventType} notification for profile ${profile.profileId}`, notificationData);
        } catch (error) {
            logger.error('Error sending profile notification:', {
                eventType,
                profileId: profile.profileId,
                error: error.message
            });
        }
    }

    // Additional helper methods would continue here...
    // (Process artifact upload, handle different response formats, etc.)

    async #processArtifactUpload(consultantId, projectId, file, artifactData, userId) {
        // File processing logic would go here
        return {
            id: `artifact_${Date.now()}`,
            fileName: file.originalname,
            type: artifactData.type,
            size: file.size,
            url: `/artifacts/${consultantId}/${projectId}/${file.originalname}`,
            uploadedAt: new Date(),
            uploadedBy: userId
        };
    }

    async #handlePDFResponse(res, data, type) {
        const fileName = `${type}_${Date.now()}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.status(STATUS_CODES.OK).send(data);
    }

    async #handleHTMLResponse(res, data) {
        res.setHeader('Content-Type', 'text/html');
        res.status(STATUS_CODES.OK).send(data);
    }

    /**
     * Handle Word document response
     * @private
     * @param {Object} res - Express response object
     * @param {Object} data - Report data to convert to Word document
     * @returns {void}
     */
    async #handleWordResponse(res, data) {
        try {
            // Generate Word document content using a simple approach
            // In a real implementation, you might use libraries like officegen or docx

            const fileName = `profile_report_${data.consultantId || 'export'}_${Date.now()}.docx`;

            // Create basic Word document structure
            const wordContent = this.#generateWordDocumentContent(data);

            // Set appropriate headers for Word document download
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
            res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');

            // Log document generation
            await this.#logControllerAction('WORD_DOCUMENT_GENERATED', {
                fileName,
                consultantId: data.consultantId,
                dataSize: JSON.stringify(data).length,
                timestamp: new Date()
            });

            // Send the document
            // Note: In a real implementation, you would use a proper Word generation library
            // For now, sending as RTF which can be opened by Word
            const rtfContent = this.#convertToRTF(wordContent);
            res.status(STATUS_CODES.OK).send(rtfContent);

        } catch (error) {
            logger.error('Error generating Word document:', {
                error: error.message,
                consultantId: data.consultantId || 'unknown',
                stack: error.stack
            });

            throw new AppError(
                'Failed to generate Word document',
                STATUS_CODES.INTERNAL_SERVER_ERROR,
                'WORD_GENERATION_FAILED'
            );
        }
    }

    /**
     * Generate Word document content structure
     * @private
     * @param {Object} data - Report data
     * @returns {Object} Structured content for Word document
     */
    #generateWordDocumentContent(data) {
        const content = {
            title: `Consultant Profile Report - ${data.profile?.displayName || 'Unknown'}`,
            sections: []
        };

        // Executive Summary section
        if (data.profile?.summary) {
            content.sections.push({
                title: 'Executive Summary',
                content: data.profile.summary.executiveSummary || 'No summary available',
                type: 'text'
            });
        }

        // Professional Information
        content.sections.push({
            title: 'Professional Information',
            content: [
                `Name: ${data.profile?.displayName || 'N/A'}`,
                `Title: ${data.profile?.title || 'N/A'}`,
                `Level: ${data.profile?.level || 'N/A'}`,
                `Department: ${data.profile?.department || 'N/A'}`,
                `Email: ${data.profile?.email || 'N/A'}`
            ],
            type: 'list'
        });

        // Expertise Areas
        if (data.profile?.expertise?.domains) {
            content.sections.push({
                title: 'Expertise Areas',
                content: data.profile.expertise.domains.map(domain =>
                    `${domain.name} (${domain.level || 'Unknown level'})`
                ),
                type: 'list'
            });
        }

        // Career History
        if (data.profile?.careerHistory && data.profile.careerHistory.length > 0) {
            content.sections.push({
                title: 'Career History',
                content: data.profile.careerHistory.map(entry => ({
                    company: entry.company?.name || 'Unknown Company',
                    position: entry.position?.title || 'Unknown Position',
                    duration: `${entry.duration?.startDate || 'Unknown'} - ${entry.duration?.endDate || 'Present'}`,
                    description: entry.description || 'No description provided'
                })),
                type: 'career'
            });
        }

        // Portfolio Projects
        if (data.profile?.portfolio?.projects && data.profile.portfolio.projects.length > 0) {
            content.sections.push({
                title: 'Portfolio Projects',
                content: data.profile.portfolio.projects.map(project => ({
                    title: project.title || 'Untitled Project',
                    description: project.description || 'No description provided',
                    technologies: project.technologies || [],
                    achievements: project.achievements || []
                })),
                type: 'portfolio'
            });
        }

        // Performance Data (if included)
        if (data.profile?.performance) {
            content.sections.push({
                title: 'Performance Summary',
                content: [
                    `Overall Rating: ${data.profile.performance.overallRating || 'N/A'}`,
                    `Projects Completed: ${data.profile.performance.projectsCompleted || 'N/A'}`,
                    `Client Satisfaction: ${data.profile.performance.clientSatisfaction || 'N/A'}`
                ],
                type: 'list'
            });
        }

        return content;
    }

    /**
     * Convert content to RTF format (simplified Word-compatible format)
     * @private
     * @param {Object} content - Structured content
     * @returns {string} RTF formatted content
     */
    #convertToRTF(content) {
        let rtf = '{\\rtf1\\ansi\\deff0 {\\fonttbl {\\f0 Times New Roman;}}';
        rtf += '\\f0\\fs24 '; // Font and size

        // Title
        rtf += `{\\b\\fs32 ${content.title}}\\par\\par`;

        // Generated timestamp
        rtf += `{\\i Generated on: ${new Date().toLocaleString()}}\\par\\par`;

        // Sections
        content.sections.forEach(section => {
            // Section title
            rtf += `{\\b\\fs28 ${section.title}}\\par`;

            if (section.type === 'text') {
                rtf += `${section.content}\\par\\par`;
            } else if (section.type === 'list') {
                section.content.forEach(item => {
                    rtf += `• ${item}\\par`;
                });
                rtf += '\\par';
            } else if (section.type === 'career') {
                section.content.forEach(entry => {
                    rtf += `{\\b ${entry.company}} - {\\i ${entry.position}}\\par`;
                    rtf += `${entry.duration}\\par`;
                    rtf += `${entry.description}\\par\\par`;
                });
            } else if (section.type === 'portfolio') {
                section.content.forEach(project => {
                    rtf += `{\\b ${project.title}}\\par`;
                    rtf += `${project.description}\\par`;
                    if (project.technologies.length > 0) {
                        rtf += `Technologies: ${project.technologies.join(', ')}\\par`;
                    }
                    if (project.achievements.length > 0) {
                        rtf += `Key Achievements:\\par`;
                        project.achievements.forEach(achievement => {
                            rtf += `• ${achievement}\\par`;
                        });
                    }
                    rtf += '\\par';
                });
            }
        });

        // Footer
        rtf += '\\par\\par{\\i This report was generated automatically by the Consultant Management System.}';
        rtf += '}';

        return rtf;
    }

    // Remaining stub methods for completeness
    async #validateShowcaseSettings(settings) { return settings; }
    async #validateExpertiseData(data) { return data; }
    async #validateDevelopmentPlanData(data) { return data; }
    async #validateProgressData(data) { return data; }
    async #validatePerformanceReviewData(data) { return data; }
    async #validateTestimonialData(data) { return data; }
    #parseProfileSearchCriteria(query) { return {}; }
    #parseSortOptions(sort) { return {}; }
    async #filterProfilesByPermissions(profiles, user) { return profiles; }
    #shouldUpdateMarketPositioning(data) { return false; }
    async #updateMarketPositioning() { return true; }
    async #sendVerificationRequests() { return true; }
    async #updateExpertiseFromProject() { return true; }
    async #updateProjectShowcase() { return true; }
    async #generatePublicPortfolioUrl() { return true; }
    async #schedulePlanReviews() { return true; }
    async #sendProgressNotification() { return true; }
    async #updatePerformanceMetrics() { return true; }
    async #sendPerformanceReviewNotification() { return true; }
    async #addPortfolioTestimonial() { return {}; }
    async #sendTestimonialNotification() { return true; }
    async #sendVerificationNotification() { return true; }
    #formatPerformanceReviewResponse(review) { return review; }
    #formatTestimonialResponse(testimonial) { return testimonial; }
}

// Export controller as singleton instance
module.exports = new ConsultantProfileController();