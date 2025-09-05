'use strict';

/**
 * @fileoverview Enterprise consultant profile service with comprehensive profile and career management
 * @module servers/customer-services/modules/core-business/consultants/services/consultant-profile-service
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/async-handler
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/services/email-service
 * @requires module:shared/lib/services/notification-service
 * @requires module:shared/lib/security/audit/audit-service
 * @requires module:shared/lib/services/file-service
 * @requires module:servers/customer-services/modules/core-business/consultants/models/consultant-profile-model
 * @requires module:servers/customer-services/modules/core-business/consultants/models/consultant-model
 */

const mongoose = require('mongoose');
const logger = require('../../../../../../shared/lib/utils/logger');
const { AppError, ValidationError, NotFoundError, ConflictError, ForbiddenError } = require('../../../../../../shared/lib/utils/app-error');
const asyncHandler = require('../../../../../../shared/lib/utils/async-handler');
const CacheService = require('../../../../../../shared/lib/services/cache-service');
const EmailService = require('../../../../../../shared/lib/services/email-service');
const NotificationService = require('../../../../../../shared/lib/services/notification-service');
const AuditService = require('../../../../../../shared/lib/security/audit/audit-service');
const FileService = require('../../../../../../shared/lib/services/file-service');
const SearchService = require('../../../../../../shared/lib/services/search-service');
const ConsultantProfileModel = require('../models/consultant-profile-model');
const ConsultantModel = require('../models/consultant-model');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const crypto = require('crypto');
const moment = require('moment');
const marked = require('marked');

/**
 * Enterprise consultant profile service for comprehensive profile management
 * @class ConsultantProfileService
 * @description Manages consultant profiles, portfolios, career history, and professional development
 */
class ConsultantProfileService {
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
     * @type {FileService}
     */
    #fileService;

    /**
     * @private
     * @type {SearchService}
     */
    #searchService;

    /**
     * @private
     * @type {number}
     */
    #defaultCacheTTL = 3600; // 1 hour

    /**
     * @private
     * @type {number}
     */
    #maxPortfolioProjects = 50;

    /**
     * @private
     * @type {number}
     */
    #maxCareerHistoryEntries = 20;

    /**
     * @private
     * @type {Object}
     */
    #profileCompletionWeights = {
        summary: 15,
        careerHistory: 20,
        expertise: 20,
        qualifications: 15,
        portfolio: 15,
        skills: 10,
        development: 5
    };

    /**
     * @private
     * @type {Object}
     */
    #expertiseLevels = {
        aware: { minYears: 0, minProjects: 0 },
        working: { minYears: 1, minProjects: 2 },
        practitioner: { minYears: 3, minProjects: 5 },
        expert: { minYears: 5, minProjects: 10 },
        thought_leader: { minYears: 8, minProjects: 20 }
    };

    /**
     * @private
     * @type {Map}
     */
    #pendingUpdates = new Map();

    /**
     * Creates an instance of ConsultantProfileService
     * @constructor
     * @param {Object} dependencies - Service dependencies
     * @param {CacheService} dependencies.cacheService - Cache service instance
     * @param {EmailService} dependencies.emailService - Email service instance
     * @param {NotificationService} dependencies.notificationService - Notification service instance
     * @param {AuditService} dependencies.auditService - Audit service instance
     * @param {FileService} dependencies.fileService - File service instance
     * @param {SearchService} dependencies.searchService - Search service instance
     */
    constructor(dependencies = {}) {
        this.#cacheService = dependencies.cacheService || new CacheService();
        this.#emailService = dependencies.emailService || new EmailService();
        this.#notificationService = dependencies.notificationService || new NotificationService();
        this.#auditService = dependencies.auditService || new AuditService();
        this.#fileService = dependencies.fileService || new FileService();
        this.#searchService = dependencies.searchService || new SearchService();

        this.#initializeService();
    }

    /**
     * Initialize service components
     * @private
     */
    #initializeService() {
        logger.info('Initializing ConsultantProfileService', {
            cacheEnabled: !!this.#cacheService,
            emailEnabled: !!this.#emailService,
            notificationEnabled: !!this.#notificationService,
            auditEnabled: !!this.#auditService,
            fileEnabled: !!this.#fileService,
            searchEnabled: !!this.#searchService
        });
    }

    // ==================== Profile Management ====================

    /**
     * Create or initialize consultant profile
     * @param {string} consultantId - Consultant ID
     * @param {Object} profileData - Initial profile data
     * @param {string} userId - User creating the profile
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} Created profile
     */
    async createProfile(consultantId, profileData, userId, options = {}) {
        const session = options.session || null;

        try {
            // Check if consultant exists
            const consultant = await ConsultantModel.findById(consultantId);
            if (!consultant) {
                throw new NotFoundError('Consultant not found', 'CONSULTANT_NOT_FOUND');
            }

            // Check for existing profile
            const existingProfile = await ConsultantProfileModel.findOne({
                consultantId,
                isDeleted: false
            });

            if (existingProfile) {
                throw new ConflictError('Profile already exists for consultant', 'PROFILE_EXISTS');
            }

            // Validate profile data
            await this.#validateProfileData(profileData);

            // Generate profile ID
            const profileId = await ConsultantProfileModel.generateProfileId();

            // Enrich profile data
            const enrichedData = await this.#enrichProfileData(profileData, consultant);

            // Create profile
            const profile = await ConsultantProfileModel.create([{
                ...enrichedData,
                profileId,
                consultantId,
                tenantId: consultant.tenantId,
                organizationId: consultant.organizationId,
                metadata: {
                    ...enrichedData.metadata,
                    profileCompleteness: await this.#calculateProfileCompleteness(enrichedData)
                }
            }], { session });

            // Index profile for search
            await this.#indexProfileForSearch(profile[0]);

            // Send welcome notifications
            await this.#sendProfileCreationNotifications(consultant, profile[0], userId);

            // Log audit trail
            await this.#auditService.log({
                action: 'PROFILE_CREATED',
                entityType: 'consultant_profile',
                entityId: profile[0]._id,
                userId,
                details: {
                    consultantId,
                    profileId: profile[0].profileId
                }
            });

            // Clear caches
            await this.#clearProfileCaches(consultant.tenantId, consultantId);

            logger.info('Profile created successfully', {
                profileId: profile[0].profileId,
                consultantId,
                createdBy: userId
            });

            return profile[0];
        } catch (error) {
            logger.error('Error creating profile', {
                error: error.message,
                consultantId,
                userId
            });
            throw error;
        }
    }

    /**
     * Get comprehensive profile with all related data
     * @param {string} consultantId - Consultant ID
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Complete profile
     */
    async getCompleteProfile(consultantId, options = {}) {
        const {
            includePrivate = false,
            includeAnalytics = true,
            format = 'json',
            userId,
            tenantId
        } = options;

        try {
            // Check cache
            const cacheKey = this.#generateCacheKey('profile-complete', consultantId, options);
            const cached = await this.#cacheService.get(cacheKey);
            if (cached) {
                return cached;
            }

            // Get profile
            const profile = await ConsultantProfileModel.findOne({
                consultantId,
                isDeleted: false,
                ...(tenantId && { tenantId })
            }).populate('consultantId');

            if (!profile) {
                throw new NotFoundError('Profile not found', 'PROFILE_NOT_FOUND');
            }

            // Check permissions
            if (!includePrivate && userId) {
                await this.#checkProfileAccess(profile, userId, 'read');
            }

            // Build complete profile
            const completeProfile = {
                ...profile.toObject(),
                consultant: await this.#getConsultantInfo(consultantId),
                analytics: includeAnalytics ? await this.#getProfileAnalytics(profile) : null,
                recommendations: await this.#generateProfileRecommendations(profile),
                completeness: await this.#calculateProfileCompleteness(profile),
                visibility: await this.#calculateProfileVisibility(profile)
            };

            // Remove private data if not authorized
            if (!includePrivate) {
                completeProfile.compensation = undefined;
                completeProfile.performance.ratings = undefined;
            }

            // Format output if requested
            if (format === 'pdf') {
                return await this.#generateProfilePDF(completeProfile);
            } else if (format === 'html') {
                return await this.#generateProfileHTML(completeProfile);
            }

            // Cache result
            await this.#cacheService.set(cacheKey, completeProfile, this.#defaultCacheTTL);

            return completeProfile;
        } catch (error) {
            logger.error('Error getting complete profile', {
                error: error.message,
                consultantId
            });
            throw error;
        }
    }

    /**
     * Update profile sections
     * @param {string} consultantId - Consultant ID
     * @param {string} section - Section to update
     * @param {Object} updateData - Update data
     * @param {string} userId - User performing update
     * @param {Object} options - Update options
     * @returns {Promise<Object>} Updated profile
     */
    async updateProfileSection(consultantId, section, updateData, userId, options = {}) {
        const session = options.session || null;

        try {
            // Get existing profile
            const profile = await ConsultantProfileModel.findOne({
                consultantId,
                isDeleted: false
            });

            if (!profile) {
                throw new NotFoundError('Profile not found', 'PROFILE_NOT_FOUND');
            }

            // Check permissions
            await this.#checkProfileAccess(profile, userId, 'write');

            // Validate section update
            await this.#validateSectionUpdate(section, updateData, profile);

            // Apply section-specific business rules
            const processedData = await this.#processSectionUpdate(section, updateData, profile);

            // Update specific section
            let updatePath = {};
            switch (section) {
                case 'summary':
                    updatePath = { summary: { ...profile.summary, ...processedData } };
                    break;
                case 'careerHistory':
                    updatePath = await this.#updateCareerHistory(profile, processedData, session);
                    break;
                case 'expertise':
                    updatePath = await this.#updateExpertise(profile, processedData, session);
                    break;
                case 'portfolio':
                    updatePath = await this.#updatePortfolio(profile, processedData, session);
                    break;
                case 'qualifications':
                    updatePath = await this.#updateQualifications(profile, processedData, session);
                    break;
                case 'development':
                    updatePath = await this.#updateDevelopment(profile, processedData, session);
                    break;
                default:
                    throw new ValidationError(`Invalid profile section: ${section}`, 'INVALID_SECTION');
            }

            // Update profile
            const updatedProfile = await ConsultantProfileModel.findByIdAndUpdate(
                profile._id,
                {
                    $set: updatePath,
                    $push: {
                        'metadata.notes': {
                            note: `Section '${section}' updated`,
                            addedBy: userId,
                            addedAt: new Date(),
                            type: 'observation'
                        }
                    }
                },
                {
                    new: true,
                    runValidators: true,
                    session
                }
            );

            // Recalculate completeness
            updatedProfile.metadata.profileCompleteness = await this.#calculateProfileCompleteness(updatedProfile);
            await updatedProfile.save({ session });

            // Update search index
            await this.#indexProfileForSearch(updatedProfile);

            // Send notifications for significant updates
            if (this.#isSignificantUpdate(section)) {
                await this.#sendProfileUpdateNotifications(updatedProfile, section, userId);
            }

            // Log audit trail
            await this.#auditService.log({
                action: 'PROFILE_SECTION_UPDATED',
                entityType: 'consultant_profile',
                entityId: profile._id,
                userId,
                details: {
                    section,
                    consultantId
                }
            });

            // Clear caches
            await this.#clearProfileCaches(profile.tenantId, consultantId);

            logger.info('Profile section updated successfully', {
                profileId: profile.profileId,
                section,
                updatedBy: userId
            });

            return updatedProfile;
        } catch (error) {
            logger.error('Error updating profile section', {
                error: error.message,
                consultantId,
                section,
                userId
            });
            throw error;
        }
    }

    // ==================== Career History Management ====================

    /**
     * Add career history entry
     * @param {string} consultantId - Consultant ID
     * @param {Object} careerEntry - Career history entry
     * @param {string} userId - User adding entry
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} Updated career history
     */
    async addCareerHistory(consultantId, careerEntry, userId, options = {}) {
        const session = options.session || null;

        try {
            const profile = await ConsultantProfileModel.findOne({
                consultantId,
                isDeleted: false
            });

            if (!profile) {
                throw new NotFoundError('Profile not found', 'PROFILE_NOT_FOUND');
            }

            // Validate career entry
            await this.#validateCareerEntry(careerEntry);

            // Check for overlapping dates
            await this.#checkCareerOverlap(profile.careerHistory, careerEntry);

            // Calculate duration
            careerEntry.duration.totalMonths = this.#calculateMonths(
                careerEntry.duration.startDate,
                careerEntry.duration.endDate || new Date()
            );

            // Add to career history
            profile.careerHistory.push(careerEntry);

            // Sort by start date (most recent first)
            profile.careerHistory.sort((a, b) => 
                new Date(b.duration.startDate) - new Date(a.duration.startDate)
            );

            // Limit career history entries
            if (profile.careerHistory.length > this.#maxCareerHistoryEntries) {
                profile.careerHistory = profile.careerHistory.slice(0, this.#maxCareerHistoryEntries);
            }

            // Update total experience
            await this.#updateTotalExperience(profile);

            // Save profile
            await profile.save({ session });

            // Update consultant's years of experience
            await this.#updateConsultantExperience(consultantId, profile.careerHistory);

            // Send verification request if needed
            if (careerEntry.references && careerEntry.references.length > 0) {
                await this.#sendReferenceVerificationRequests(careerEntry.references, consultantId);
            }

            // Log audit trail
            await this.#auditService.log({
                action: 'CAREER_HISTORY_ADDED',
                entityType: 'consultant_profile',
                entityId: profile._id,
                userId,
                details: {
                    company: careerEntry.company.name,
                    position: careerEntry.position.title
                }
            });

            return profile.careerHistory;
        } catch (error) {
            logger.error('Error adding career history', {
                error: error.message,
                consultantId,
                userId
            });
            throw error;
        }
    }

    /**
     * Verify career history entry
     * @param {string} consultantId - Consultant ID
     * @param {string} entryId - Career entry ID
     * @param {Object} verificationData - Verification details
     * @param {string} userId - User verifying
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} Verification result
     */
    async verifyCareerHistory(consultantId, entryId, verificationData, userId, options = {}) {
        try {
            const profile = await ConsultantProfileModel.findOne({
                consultantId,
                isDeleted: false
            });

            if (!profile) {
                throw new NotFoundError('Profile not found', 'PROFILE_NOT_FOUND');
            }

            const careerEntry = profile.careerHistory.id(entryId);
            if (!careerEntry) {
                throw new NotFoundError('Career entry not found', 'CAREER_ENTRY_NOT_FOUND');
            }

            // Update verification status
            careerEntry.verified = true;
            careerEntry.verifiedBy = userId;
            careerEntry.verifiedAt = new Date();
            careerEntry.verificationDetails = verificationData;

            await profile.save();

            // Update profile verification status
            await this.#updateProfileVerificationStatus(profile);

            // Send notification
            await this.#notificationService.send({
                type: 'career_verified',
                recipient: consultantId,
                data: {
                    company: careerEntry.company.name,
                    position: careerEntry.position.title
                }
            });

            // Log audit trail
            await this.#auditService.log({
                action: 'CAREER_HISTORY_VERIFIED',
                entityType: 'consultant_profile',
                entityId: profile._id,
                userId,
                details: {
                    entryId,
                    company: careerEntry.company.name
                }
            });

            return {
                verified: true,
                verifiedAt: careerEntry.verifiedAt,
                entry: careerEntry
            };
        } catch (error) {
            logger.error('Error verifying career history', {
                error: error.message,
                consultantId,
                entryId
            });
            throw error;
        }
    }

    // ==================== Portfolio Management ====================

    /**
     * Add project to portfolio
     * @param {string} consultantId - Consultant ID
     * @param {Object} projectData - Project information
     * @param {string} userId - User adding project
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} Added project
     */
    async addPortfolioProject(consultantId, projectData, userId, options = {}) {
        const session = options.session || null;

        try {
            const profile = await ConsultantProfileModel.findOne({
                consultantId,
                isDeleted: false
            });

            if (!profile) {
                throw new NotFoundError('Profile not found', 'PROFILE_NOT_FOUND');
            }

            // Check portfolio limits
            if (profile.portfolio?.projects?.length >= this.#maxPortfolioProjects) {
                throw new ValidationError(
                    `Portfolio limit reached. Maximum ${this.#maxPortfolioProjects} projects allowed`,
                    'PORTFOLIO_LIMIT_EXCEEDED'
                );
            }

            // Validate project data
            await this.#validatePortfolioProject(projectData);

            // Process artifacts if provided
            if (projectData.artifacts && projectData.artifacts.length > 0) {
                projectData.artifacts = await this.#processProjectArtifacts(
                    projectData.artifacts,
                    consultantId
                );
            }

            // Add project using model method
            const project = await profile.addPortfolioProject(projectData);

            // Calculate project impact score
            project.impactScore = await this.#calculateProjectImpactScore(project);

            // Update expertise based on project
            await this.#updateExpertiseFromProject(profile, project);

            // Send notifications if featured project
            if (project.showcase?.featured) {
                await this.#sendFeaturedProjectNotifications(profile, project, userId);
            }

            // Log audit trail
            await this.#auditService.log({
                action: 'PORTFOLIO_PROJECT_ADDED',
                entityType: 'consultant_profile',
                entityId: profile._id,
                userId,
                details: {
                    projectTitle: project.title,
                    client: project.client?.name
                }
            });

            // Clear caches
            await this.#clearProfileCaches(profile.tenantId, consultantId);

            return project;
        } catch (error) {
            logger.error('Error adding portfolio project', {
                error: error.message,
                consultantId,
                projectTitle: projectData.title
            });
            throw error;
        }
    }

    /**
     * Update portfolio showcase settings
     * @param {string} consultantId - Consultant ID
     * @param {Object} showcaseSettings - Showcase configuration
     * @param {string} userId - User updating settings
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} Updated showcase
     */
    async updatePortfolioShowcase(consultantId, showcaseSettings, userId, options = {}) {
        try {
            const profile = await ConsultantProfileModel.findOne({
                consultantId,
                isDeleted: false
            });

            if (!profile) {
                throw new NotFoundError('Profile not found', 'PROFILE_NOT_FOUND');
            }

            // Update featured projects
            if (showcaseSettings.featuredProjects) {
                await this.#updateFeaturedProjects(profile, showcaseSettings.featuredProjects);
            }

            // Update project order
            if (showcaseSettings.projectOrder) {
                await this.#reorderPortfolioProjects(profile, showcaseSettings.projectOrder);
            }

            // Update visibility settings
            if (showcaseSettings.visibility) {
                profile.metadata.visibility = {
                    ...profile.metadata.visibility,
                    ...showcaseSettings.visibility
                };
            }

            await profile.save();

            // Generate public portfolio URL if requested
            if (showcaseSettings.generatePublicUrl) {
                const publicUrl = await this.#generatePublicPortfolioUrl(profile);
                profile.portfolio.publicUrl = publicUrl;
                await profile.save();
            }

            // Log audit trail
            await this.#auditService.log({
                action: 'PORTFOLIO_SHOWCASE_UPDATED',
                entityType: 'consultant_profile',
                entityId: profile._id,
                userId,
                details: showcaseSettings
            });

            return {
                portfolio: profile.portfolio,
                publicUrl: profile.portfolio?.publicUrl
            };
        } catch (error) {
            logger.error('Error updating portfolio showcase', {
                error: error.message,
                consultantId
            });
            throw error;
        }
    }

    // ==================== Expertise & Skills ====================

    /**
     * Update expertise areas
     * @param {string} consultantId - Consultant ID
     * @param {Object} expertiseData - Expertise information
     * @param {string} userId - User updating expertise
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} Updated expertise
     */
    async updateExpertiseAreas(consultantId, expertiseData, userId, options = {}) {
        const session = options.session || null;

        try {
            const profile = await ConsultantProfileModel.findOne({
                consultantId,
                isDeleted: false
            });

            if (!profile) {
                throw new NotFoundError('Profile not found', 'PROFILE_NOT_FOUND');
            }

            // Validate expertise levels
            for (const domain of expertiseData.domains || []) {
                await this.#validateExpertiseLevel(domain);
            }

            // Update domains
            if (expertiseData.domains) {
                profile.expertise.domains = await this.#mergeDomainExpertise(
                    profile.expertise.domains,
                    expertiseData.domains
                );
            }

            // Update industries
            if (expertiseData.industries) {
                profile.expertise.industries = await this.#mergeIndustryExpertise(
                    profile.expertise.industries,
                    expertiseData.industries
                );
            }

            // Update functional areas
            if (expertiseData.functionalAreas) {
                profile.expertise.functionalAreas = expertiseData.functionalAreas;
            }

            // Calculate expertise score
            profile.analytics.expertiseScore = await this.#calculateExpertiseScore(profile.expertise);

            await profile.save({ session });

            // Update market positioning
            await this.#updateMarketPositioning(profile);

            // Send expertise update notifications
            await this.#sendExpertiseUpdateNotifications(profile, expertiseData, userId);

            // Log audit trail
            await this.#auditService.log({
                action: 'EXPERTISE_UPDATED',
                entityType: 'consultant_profile',
                entityId: profile._id,
                userId,
                details: {
                    domainsUpdated: expertiseData.domains?.length,
                    industriesUpdated: expertiseData.industries?.length
                }
            });

            return profile.expertise;
        } catch (error) {
            logger.error('Error updating expertise areas', {
                error: error.message,
                consultantId
            });
            throw error;
        }
    }

    /**
     * Calculate and update skills matrix
     * @param {string} consultantId - Consultant ID
     * @param {Object} options - Calculation options
     * @returns {Promise<Object>} Skills matrix
     */
    async calculateSkillsMatrix(consultantId, options = {}) {
        try {
            const profile = await ConsultantProfileModel.findOne({
                consultantId,
                isDeleted: false
            });

            if (!profile) {
                throw new NotFoundError('Profile not found', 'PROFILE_NOT_FOUND');
            }

            // Get skills from consultant model
            const consultant = await ConsultantModel.findById(consultantId)
                .populate('skills.technical');

            // Build skills matrix
            const matrix = {
                technical: await this.#buildTechnicalSkillsMatrix(consultant.skills.technical),
                business: await this.#buildBusinessSkillsMatrix(profile),
                leadership: await this.#buildLeadershipMatrix(profile),
                languages: consultant.personalInfo.languages || []
            };

            // Calculate skill gaps
            matrix.gaps = await this.#identifySkillGaps(matrix, profile.marketProfile?.positioning?.level);

            // Generate development recommendations
            matrix.recommendations = await this.#generateSkillDevelopmentPlan(matrix.gaps);

            // Update profile
            profile.skillsMatrix = matrix;
            await profile.save();

            return matrix;
        } catch (error) {
            logger.error('Error calculating skills matrix', {
                error: error.message,
                consultantId
            });
            throw error;
        }
    }

    // ==================== Professional Development ====================

    /**
     * Create development plan
     * @param {string} consultantId - Consultant ID
     * @param {Object} planData - Development plan details
     * @param {string} userId - User creating plan
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} Created development plan
     */
    async createDevelopmentPlan(consultantId, planData, userId, options = {}) {
        const session = options.session || null;

        try {
            const profile = await ConsultantProfileModel.findOne({
                consultantId,
                isDeleted: false
            });

            if (!profile) {
                throw new NotFoundError('Profile not found', 'PROFILE_NOT_FOUND');
            }

            // Validate plan data
            await this.#validateDevelopmentPlan(planData);

            // Check for active plan
            if (profile.development?.currentPlan?.year === new Date().getFullYear()) {
                throw new ConflictError('Active development plan already exists', 'PLAN_EXISTS');
            }

            // Calculate budget requirements
            const budgetAnalysis = await this.#analyzeDevelopmentBudget(planData);

            // Create development plan
            const developmentPlan = {
                year: planData.year || new Date().getFullYear(),
                goals: planData.goals,
                budget: budgetAnalysis,
                manager: planData.managerId || userId,
                nextReview: planData.nextReview || moment().add(3, 'months').toDate()
            };

            profile.development.currentPlan = developmentPlan;

            // Create milestones and reminders
            await this.#createDevelopmentMilestones(profile, developmentPlan);

            await profile.save({ session });

            // Send plan approval request if needed
            if (budgetAnalysis.allocated > 5000) {
                await this.#requestPlanApproval(profile, developmentPlan, userId);
            }

            // Log audit trail
            await this.#auditService.log({
                action: 'DEVELOPMENT_PLAN_CREATED',
                entityType: 'consultant_profile',
                entityId: profile._id,
                userId,
                details: {
                    year: developmentPlan.year,
                    goalsCount: developmentPlan.goals.length,
                    budget: budgetAnalysis.allocated
                }
            });

            return developmentPlan;
        } catch (error) {
            logger.error('Error creating development plan', {
                error: error.message,
                consultantId
            });
            throw error;
        }
    }

    /**
     * Track development progress
     * @param {string} consultantId - Consultant ID
     * @param {string} goalId - Goal ID
     * @param {Object} progressData - Progress update
     * @param {string} userId - User updating progress
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} Updated progress
     */
    async trackDevelopmentProgress(consultantId, goalId, progressData, userId, options = {}) {
        try {
            const profile = await ConsultantProfileModel.findOne({
                consultantId,
                isDeleted: false
            });

            if (!profile) {
                throw new NotFoundError('Profile not found', 'PROFILE_NOT_FOUND');
            }

            const goal = profile.development.currentPlan.goals.id(goalId);
            if (!goal) {
                throw new NotFoundError('Development goal not found', 'GOAL_NOT_FOUND');
            }

            // Update progress
            goal.progress = {
                percentage: progressData.percentage,
                lastUpdated: new Date(),
                blockers: progressData.blockers || []
            };

            // Update milestones
            if (progressData.milestoneCompleted) {
                const milestone = goal.milestones.find(m => 
                    m.milestone === progressData.milestoneCompleted
                );
                if (milestone) {
                    milestone.achieved = true;
                    milestone.achievedDate = new Date();
                }
            }

            // Check if goal is completed
            if (progressData.percentage >= 100) {
                goal.outcomes = progressData.outcomes || [];
                await this.#handleGoalCompletion(profile, goal, userId);
            }

            await profile.save();

            // Send progress notifications
            if (progressData.percentage % 25 === 0) {
                await this.#sendProgressNotifications(profile, goal, progressData);
            }

            return goal;
        } catch (error) {
            logger.error('Error tracking development progress', {
                error: error.message,
                consultantId,
                goalId
            });
            throw error;
        }
    }

    // ==================== Performance & Recognition ====================

    /**
     * Add performance review
     * @param {string} consultantId - Consultant ID
     * @param {Object} reviewData - Performance review data
     * @param {string} userId - User conducting review
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} Added review
     */
    async addPerformanceReview(consultantId, reviewData, userId, options = {}) {
        const session = options.session || null;

        try {
            const profile = await ConsultantProfileModel.findOne({
                consultantId,
                isDeleted: false
            });

            if (!profile) {
                throw new NotFoundError('Profile not found', 'PROFILE_NOT_FOUND');
            }

            // Validate review data
            await this.#validatePerformanceReview(reviewData);

            // Calculate calibrated scores
            const calibratedScores = await this.#calibratePerformanceScores(reviewData.scores);

            // Add review
            const review = {
                period: reviewData.period,
                scores: calibratedScores,
                percentile: await this.#calculatePercentile(calibratedScores.overall),
                calibrated: true,
                feedback: reviewData.feedback,
                reviewer: userId,
                reviewDate: new Date()
            };

            profile.performance.ratings.push(review);

            // Update current performance metrics
            await this.#updatePerformanceMetrics(profile);

            // Check for promotion eligibility
            const promotionAnalysis = await this.#analyzePromotionEligibility(profile);
            if (promotionAnalysis.eligible) {
                await this.#triggerPromotionWorkflow(profile, promotionAnalysis, userId);
            }

            await profile.save({ session });

            // Send review notifications
            await this.#sendReviewNotifications(profile, review, userId);

            // Log audit trail
            await this.#auditService.log({
                action: 'PERFORMANCE_REVIEW_ADDED',
                entityType: 'consultant_profile',
                entityId: profile._id,
                userId,
                details: {
                    period: review.period,
                    overallScore: review.scores.overall
                }
            });

            return review;
        } catch (error) {
            logger.error('Error adding performance review', {
                error: error.message,
                consultantId
            });
            throw error;
        }
    }

    /**
     * Add achievement or recognition
     * @param {string} consultantId - Consultant ID
     * @param {Object} achievementData - Achievement details
     * @param {string} userId - User adding achievement
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} Added achievement
     */
    async addAchievement(consultantId, achievementData, userId, options = {}) {
        try {
            const profile = await ConsultantProfileModel.findOne({
                consultantId,
                isDeleted: false
            });

            if (!profile) {
                throw new NotFoundError('Profile not found', 'PROFILE_NOT_FOUND');
            }

            // Validate achievement data
            await this.#validateAchievement(achievementData);

            // Calculate achievement impact
            const impactAnalysis = await this.#analyzeAchievementImpact(achievementData);

            // Add achievement
            const achievement = {
                ...achievementData,
                impact: impactAnalysis,
                recognition: {
                    type: achievementData.recognitionType,
                    details: achievementData.recognitionDetails,
                    date: new Date(),
                    monetary: achievementData.monetaryValue
                },
                visibility: achievementData.visibility || 'company'
            };

            profile.performance.achievements.push(achievement);

            // Update market profile if significant
            if (impactAnalysis.significance === 'high') {
                await this.#updateMarketProfileFromAchievement(profile, achievement);
            }

            await profile.save();

            // Send congratulations and announcements
            await this.#sendAchievementNotifications(profile, achievement, userId);

            // Update public profile if visible
            if (achievement.visibility === 'public') {
                await this.#updatePublicProfile(profile, achievement);
            }

            return achievement;
        } catch (error) {
            logger.error('Error adding achievement', {
                error: error.message,
                consultantId
            });
            throw error;
        }
    }

    // ==================== Search & Discovery ====================

    /**
     * Search profiles with advanced filters
     * @param {Object} searchCriteria - Search parameters
     * @param {Object} options - Search options
     * @returns {Promise<Object>} Search results
     */
    async searchProfiles(searchCriteria, options = {}) {
        const {
            page = 1,
            limit = 20,
            sort = { 'metadata.profileCompleteness.percentage': -1 },
            tenantId
        } = options;

        try {
            // Build search query
            const searchQuery = await this.#buildSearchQuery(searchCriteria, tenantId);

            // Execute search
            const results = await ConsultantProfileModel.searchProfiles(
                tenantId,
                searchQuery
            );

            // Apply pagination
            const skip = (page - 1) * limit;
            const paginatedResults = results.slice(skip, skip + limit);

            // Enhance results with scores
            const enhancedResults = await Promise.all(
                paginatedResults.map(async profile => ({
                    ...profile,
                    matchScore: await this.#calculateSearchMatchScore(profile, searchCriteria),
                    summary: await this.#generateProfileSummary(profile)
                }))
            );

            // Sort by match score
            enhancedResults.sort((a, b) => b.matchScore - a.matchScore);

            return {
                profiles: enhancedResults,
                total: results.length,
                page,
                limit,
                totalPages: Math.ceil(results.length / limit)
            };
        } catch (error) {
            logger.error('Error searching profiles', {
                error: error.message,
                searchCriteria
            });
            throw error;
        }
    }

    // ==================== Export & Reporting ====================

    /**
     * Generate profile report
     * @param {string} consultantId - Consultant ID
     * @param {Object} reportOptions - Report configuration
     * @param {string} userId - User requesting report
     * @returns {Promise<Buffer>} Report document
     */
    async generateProfileReport(consultantId, reportOptions = {}, userId) {
        const {
            format = 'pdf',
            sections = ['all'],
            includeConfidential = false,
            template = 'standard'
        } = reportOptions;

        try {
            // Get complete profile
            const profile = await this.getCompleteProfile(consultantId, {
                includePrivate: includeConfidential,
                includeAnalytics: true,
                userId
            });

            // Select sections to include
            const reportData = await this.#selectReportSections(profile, sections);

            // Apply template
            const formattedReport = await this.#applyReportTemplate(reportData, template);

            // Generate report in requested format
            let report;
            switch (format.toLowerCase()) {
                case 'pdf':
                    report = await this.#generatePDFReport(formattedReport);
                    break;
                case 'word':
                    report = await this.#generateWordReport(formattedReport);
                    break;
                case 'html':
                    report = await this.#generateHTMLReport(formattedReport);
                    break;
                default:
                    throw new ValidationError(`Unsupported report format: ${format}`, 'INVALID_FORMAT');
            }

            // Log report generation
            await this.#auditService.log({
                action: 'PROFILE_REPORT_GENERATED',
                entityType: 'consultant_profile',
                entityId: profile._id,
                userId,
                details: {
                    format,
                    sections: sections.join(','),
                    template
                }
            });

            return report;
        } catch (error) {
            logger.error('Error generating profile report', {
                error: error.message,
                consultantId,
                format
            });
            throw error;
        }
    }

    // ==================== Private Helper Methods ====================

    /**
     * Validate profile data
     * @private
     */
    async #validateProfileData(profileData) {
        const errors = [];

        if (!profileData.summary?.headline) {
            errors.push('Profile headline is required');
        }

        if (profileData.summary?.headline && profileData.summary.headline.length > 200) {
            errors.push('Headline must be 200 characters or less');
        }

        if (profileData.summary?.executiveSummary && profileData.summary.executiveSummary.length > 2000) {
            errors.push('Executive summary must be 2000 characters or less');
        }

        if (errors.length > 0) {
            throw new ValidationError(errors.join(', '), 'VALIDATION_FAILED');
        }

        return true;
    }

    /**
     * Enrich profile data with defaults
     * @private
     */
    async #enrichProfileData(profileData, consultant) {
        const enriched = { ...profileData };

        // Set default summary if not provided
        if (!enriched.summary) {
            enriched.summary = {
                headline: `${consultant.profile.level} ${consultant.profile.jobTitle || 'Consultant'}`,
                executiveSummary: '',
                keyStrengths: [],
                valueProposition: ''
            };
        }

        // Initialize empty sections
        enriched.expertise = enriched.expertise || {
            domains: [],
            industries: [],
            functionalAreas: []
        };

        enriched.careerHistory = enriched.careerHistory || [];
        enriched.qualifications = enriched.qualifications || {
            academic: [],
            professional: [],
            certifications: []
        };

        enriched.portfolio = enriched.portfolio || {
            projects: [],
            testimonials: [],
            publicUrl: null
        };

        enriched.development = enriched.development || {
            currentPlan: null,
            completedPlans: []
        };

        enriched.performance = enriched.performance || {
            ratings: [],
            achievements: [],
            feedback: []
        };

        enriched.analytics = enriched.analytics || {
            profileViews: 0,
            searchAppearances: 0,
            expertiseScore: 0
        };

        enriched.metadata = enriched.metadata || {
            visibility: {
                public: false,
                internal: true,
                clients: false
            },
            notes: [],
            tags: []
        };

        return enriched;
    }

    /**
     * Calculate profile completeness
     * @private
     */
    async #calculateProfileCompleteness(profile) {
        let totalScore = 0;
        const missingFields = [];

        // Check summary (15%)
        if (profile.summary?.executiveSummary && profile.summary.executiveSummary.length > 100) {
            totalScore += this.#profileCompletionWeights.summary;
        } else {
            missingFields.push('summary.executiveSummary');
        }

        // Check career history (20%)
        if (profile.careerHistory && profile.careerHistory.length > 0) {
            const historyScore = Math.min(
                profile.careerHistory.length * 5,
                this.#profileCompletionWeights.careerHistory
            );
            totalScore += historyScore;
        } else {
            missingFields.push('careerHistory');
        }

        // Check expertise (20%)
        if (profile.expertise?.domains && profile.expertise.domains.length > 0) {
            totalScore += this.#profileCompletionWeights.expertise;
        } else {
            missingFields.push('expertise.domains');
        }

        // Check qualifications (15%)
        if (profile.qualifications?.academic && profile.qualifications.academic.length > 0) {
            const qualScore = Math.min(
                profile.qualifications.academic.length * 5,
                this.#profileCompletionWeights.qualifications
            );
            totalScore += qualScore;
        } else {
            missingFields.push('qualifications.academic');
        }

        // Check portfolio (15%)
        if (profile.portfolio?.projects && profile.portfolio.projects.length > 0) {
            const portfolioScore = Math.min(
                profile.portfolio.projects.length * 3,
                this.#profileCompletionWeights.portfolio
            );
            totalScore += portfolioScore;
        } else {
            missingFields.push('portfolio.projects');
        }

        // Check skills (10%)
        if (profile.skillsMatrix?.technical && profile.skillsMatrix.technical.length > 0) {
            totalScore += this.#profileCompletionWeights.skills;
        } else {
            missingFields.push('skills');
        }

        // Check development (5%)
        if (profile.development?.currentPlan) {
            totalScore += this.#profileCompletionWeights.development;
        } else {
            missingFields.push('development.currentPlan');
        }

        return {
            percentage: Math.min(totalScore, 100),
            missingFields,
            lastCalculated: new Date(),
            nextReviewDate: moment().add(30, 'days').toDate()
        };
    }

    /**
     * Index profile for search
     * @private
     */
    async #indexProfileForSearch(profile) {
        if (!this.#searchService) return;

        try {
            const searchDocument = {
                id: profile._id,
                type: 'consultant_profile',
                tenantId: profile.tenantId,
                content: {
                    headline: profile.summary?.headline,
                    summary: profile.summary?.executiveSummary,
                    skills: profile.expertise?.domains?.map(d => d.name).join(' '),
                    industries: profile.expertise?.industries?.map(i => i.name).join(' '),
                    careerHistory: profile.careerHistory?.map(c => `${c.position.title} ${c.company.name}`).join(' ')
                },
                metadata: {
                    consultantId: profile.consultantId,
                    profileId: profile.profileId,
                    completeness: profile.metadata.profileCompleteness?.percentage
                }
            };

            await this.#searchService.index(searchDocument);
        } catch (error) {
            logger.warn('Failed to index profile for search', {
                profileId: profile._id,
                error: error.message
            });
        }
    }

    /**
     * Send profile creation notifications
     * @private
     */
    async #sendProfileCreationNotifications(consultant, profile, userId) {
        if (!this.#notificationService) return;

        try {
            await this.#notificationService.send({
                type: 'profile_created',
                recipients: [consultant._id],
                data: {
                    consultantName: consultant.fullName,
                    profileId: profile.profileId,
                    completeness: profile.metadata.profileCompleteness?.percentage
                }
            });
        } catch (error) {
            logger.warn('Failed to send profile creation notifications', {
                profileId: profile._id,
                error: error.message
            });
        }
    }

    /**
     * Check profile access permissions
     * @private
     */
    async #checkProfileAccess(profile, userId, action) {
        // Simplified permission check
        if (!userId) {
            throw new ForbiddenError('Authentication required', 'AUTH_REQUIRED');
        }

        // Allow access if user is the consultant or has admin role
        if (profile.consultantId.toString() === userId) {
            return true;
        }

        // For read access, check visibility settings
        if (action === 'read' && profile.metadata?.visibility?.internal) {
            return true;
        }

        throw new ForbiddenError(`Insufficient permissions for ${action}`, 'INSUFFICIENT_PERMISSIONS');
    }

    /**
     * Get consultant information
     * @private
     */
    async #getConsultantInfo(consultantId) {
        try {
            const consultant = await ConsultantModel.findById(consultantId)
                .select('personalInfo contact profile availability billing');
            return consultant?.toObject();
        } catch (error) {
            logger.warn('Failed to get consultant info', { consultantId, error: error.message });
            return null;
        }
    }

    /**
     * Get profile analytics
     * @private
     */
    async #getProfileAnalytics(profile) {
        return {
            profileViews: profile.analytics?.profileViews || 0,
            searchAppearances: profile.analytics?.searchAppearances || 0,
            expertiseScore: profile.analytics?.expertiseScore || 0,
            marketValue: await this.#calculateMarketValue(profile),
            competitivenessScore: await this.#calculateCompetitiveness(profile),
            trendingSkills: await this.#identifyTrendingSkills(profile)
        };
    }

    /**
     * Generate profile recommendations
     * @private
     */
    async #generateProfileRecommendations(profile) {
        const recommendations = [];

        // Completeness recommendations
        const completeness = profile.metadata.profileCompleteness;
        if (completeness.percentage < 80) {
            recommendations.push({
                type: 'completeness',
                priority: 'high',
                message: 'Complete your profile to increase visibility',
                actions: completeness.missingFields.slice(0, 3)
            });
        }

        // Portfolio recommendations
        if (!profile.portfolio?.projects?.length) {
            recommendations.push({
                type: 'portfolio',
                priority: 'medium',
                message: 'Add showcase projects to demonstrate your expertise',
                actions: ['Add at least 3 recent projects']
            });
        }

        // Skills update recommendations
        const skillsLastUpdated = profile.skillsMatrix?.lastUpdated;
        if (!skillsLastUpdated || moment().diff(skillsLastUpdated, 'months') > 6) {
            recommendations.push({
                type: 'skills',
                priority: 'medium',
                message: 'Update your skills to reflect current capabilities',
                actions: ['Review and update technical skills']
            });
        }

        return recommendations;
    }

    /**
     * Calculate profile visibility score
     * @private
     */
    async #calculateProfileVisibility(profile) {
        let score = 0;

        // Base visibility settings
        if (profile.metadata?.visibility?.public) score += 30;
        if (profile.metadata?.visibility?.internal) score += 20;
        if (profile.metadata?.visibility?.clients) score += 25;

        // Content completeness impact
        const completeness = profile.metadata.profileCompleteness?.percentage || 0;
        score += (completeness / 100) * 25;

        return Math.min(score, 100);
    }

    /**
     * Generate profile PDF
     * @private
     */
    async #generateProfilePDF(profile) {
        const doc = new PDFDocument();
        const chunks = [];

        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => {});

        // Add profile content to PDF
        doc.fontSize(20).text(profile.summary?.headline || 'Consultant Profile', 50, 50);
        doc.fontSize(12).text(profile.summary?.executiveSummary || '', 50, 100);

        // Add career history
        if (profile.careerHistory?.length > 0) {
            doc.addPage();
            doc.fontSize(16).text('Career History', 50, 50);
            let yPos = 80;
            
            for (const entry of profile.careerHistory.slice(0, 5)) {
                doc.fontSize(14).text(entry.position?.title || '', 50, yPos);
                doc.fontSize(12).text(entry.company?.name || '', 50, yPos + 20);
                yPos += 60;
            }
        }

        doc.end();

        return new Promise((resolve) => {
            doc.on('end', () => {
                resolve(Buffer.concat(chunks));
            });
        });
    }

    /**
     * Generate profile HTML
     * @private
     */
    async #generateProfileHTML(profile) {
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>${profile.summary?.headline || 'Consultant Profile'}</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 40px; }
                    .header { border-bottom: 2px solid #333; padding-bottom: 20px; }
                    .section { margin: 30px 0; }
                    .career-entry { margin-bottom: 20px; border-left: 3px solid #007bff; padding-left: 15px; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>${profile.summary?.headline || 'Consultant Profile'}</h1>
                    <p>${profile.summary?.executiveSummary || ''}</p>
                </div>
                
                <div class="section">
                    <h2>Career History</h2>
                    ${(profile.careerHistory || []).map(entry => `
                        <div class="career-entry">
                            <h3>${entry.position?.title || ''}</h3>
                            <h4>${entry.company?.name || ''}</h4>
                            <p>${entry.description || ''}</p>
                        </div>
                    `).join('')}
                </div>
            </body>
            </html>
        `;

        return html;
    }

    /**
     * Validate section update
     * @private
     */
    async #validateSectionUpdate(section, updateData, profile) {
        const errors = [];

        switch (section) {
            case 'summary':
                if (updateData.headline && updateData.headline.length > 200) {
                    errors.push('Headline must be 200 characters or less');
                }
                if (updateData.executiveSummary && updateData.executiveSummary.length > 2000) {
                    errors.push('Executive summary must be 2000 characters or less');
                }
                break;

            case 'careerHistory':
                if (!updateData.company?.name) {
                    errors.push('Company name is required');
                }
                if (!updateData.position?.title) {
                    errors.push('Position title is required');
                }
                if (!updateData.duration?.startDate) {
                    errors.push('Start date is required');
                }
                break;

            case 'expertise':
                if (updateData.domains) {
                    for (const domain of updateData.domains) {
                        if (!domain.name || !domain.level) {
                            errors.push('Domain name and level are required');
                        }
                    }
                }
                break;
        }

        if (errors.length > 0) {
            throw new ValidationError(errors.join(', '), 'SECTION_VALIDATION_FAILED');
        }

        return true;
    }

    /**
     * Process section update with business rules
     * @private
     */
    async #processSectionUpdate(section, updateData, profile) {
        const processed = { ...updateData };

        // Add timestamps
        processed.lastUpdated = new Date();

        switch (section) {
            case 'summary':
                // Auto-generate key strengths if not provided
                if (!processed.keyStrengths && processed.executiveSummary) {
                    processed.keyStrengths = await this.#extractKeyStrengths(processed.executiveSummary);
                }
                break;

            case 'careerHistory':
                // Calculate duration if not provided
                if (processed.duration && !processed.duration.totalMonths) {
                    processed.duration.totalMonths = this.#calculateMonths(
                        processed.duration.startDate,
                        processed.duration.endDate || new Date()
                    );
                }
                break;
        }

        return processed;
    }

    /**
     * Update career history section
     * @private
     */
    async #updateCareerHistory(profile, processedData, session) {
        if (Array.isArray(processedData)) {
            // Replace entire career history
            return { careerHistory: processedData };
        } else {
            // Add single entry
            const updatedHistory = [...(profile.careerHistory || []), processedData];
            return { careerHistory: updatedHistory };
        }
    }

    /**
     * Update expertise section
     * @private
     */
    async #updateExpertise(profile, processedData, session) {
        const currentExpertise = profile.expertise || {};
        
        return {
            expertise: {
                domains: processedData.domains || currentExpertise.domains || [],
                industries: processedData.industries || currentExpertise.industries || [],
                functionalAreas: processedData.functionalAreas || currentExpertise.functionalAreas || []
            }
        };
    }

    /**
     * Update portfolio section
     * @private
     */
    async #updatePortfolio(profile, processedData, session) {
        const currentPortfolio = profile.portfolio || {};
        
        return {
            portfolio: {
                projects: processedData.projects || currentPortfolio.projects || [],
                testimonials: processedData.testimonials || currentPortfolio.testimonials || [],
                publicUrl: processedData.publicUrl || currentPortfolio.publicUrl
            }
        };
    }

    /**
     * Update qualifications section
     * @private
     */
    async #updateQualifications(profile, processedData, session) {
        const currentQualifications = profile.qualifications || {};
        
        return {
            qualifications: {
                academic: processedData.academic || currentQualifications.academic || [],
                professional: processedData.professional || currentQualifications.professional || [],
                certifications: processedData.certifications || currentQualifications.certifications || []
            }
        };
    }

    /**
     * Update development section
     * @private
     */
    async #updateDevelopment(profile, processedData, session) {
        const currentDevelopment = profile.development || {};
        
        return {
            development: {
                currentPlan: processedData.currentPlan || currentDevelopment.currentPlan,
                completedPlans: processedData.completedPlans || currentDevelopment.completedPlans || []
            }
        };
    }

    /**
     * Check if update is significant
     * @private
     */
    #isSignificantUpdate(section) {
        const significantSections = ['expertise', 'careerHistory', 'qualifications'];
        return significantSections.includes(section);
    }

    /**
     * Send profile update notifications
     * @private
     */
    async #sendProfileUpdateNotifications(profile, section, userId) {
        if (!this.#notificationService) return;

        try {
            await this.#notificationService.send({
                type: 'profile_updated',
                recipients: [profile.consultantId],
                data: {
                    section,
                    profileId: profile.profileId,
                    updatedBy: userId
                }
            });
        } catch (error) {
            logger.warn('Failed to send profile update notifications', {
                profileId: profile._id,
                error: error.message
            });
        }
    }

    /**
     * Validate career entry
     * @private
     */
    async #validateCareerEntry(careerEntry) {
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

        // Validate dates
        const startDate = new Date(careerEntry.duration.startDate);
        const endDate = careerEntry.duration.endDate ? new Date(careerEntry.duration.endDate) : null;

        if (endDate && endDate <= startDate) {
            errors.push('End date must be after start date');
        }

        if (startDate > new Date()) {
            errors.push('Start date cannot be in the future');
        }

        if (errors.length > 0) {
            throw new ValidationError(errors.join(', '), 'CAREER_ENTRY_VALIDATION_FAILED');
        }

        return true;
    }

    /**
     * Check for career history overlap
     * @private
     */
    async #checkCareerOverlap(existingHistory, newEntry) {
        const newStart = new Date(newEntry.duration.startDate);
        const newEnd = newEntry.duration.endDate ? new Date(newEntry.duration.endDate) : new Date();

        for (const existing of existingHistory || []) {
            const existingStart = new Date(existing.duration.startDate);
            const existingEnd = existing.duration.endDate ? new Date(existing.duration.endDate) : new Date();

            // Check for overlap
            if (newStart < existingEnd && newEnd > existingStart) {
                logger.warn('Career history overlap detected', {
                    newEntry: newEntry.position.title,
                    existingEntry: existing.position.title
                });
            }
        }
    }

    /**
     * Calculate months between dates
     * @private
     */
    #calculateMonths(startDate, endDate) {
        const start = moment(startDate);
        const end = moment(endDate);
        return end.diff(start, 'months');
    }

    /**
     * Update total experience
     * @private
     */
    async #updateTotalExperience(profile) {
        let totalMonths = 0;
        
        for (const entry of profile.careerHistory || []) {
            totalMonths += entry.duration?.totalMonths || 0;
        }

        profile.metadata.totalExperienceMonths = totalMonths;
        profile.metadata.totalExperienceYears = Math.floor(totalMonths / 12);
    }

    /**
     * Update consultant experience
     * @private
     */
    async #updateConsultantExperience(consultantId, careerHistory) {
        try {
            let totalYears = 0;
            
            for (const entry of careerHistory || []) {
                totalYears += (entry.duration?.totalMonths || 0) / 12;
            }

            await ConsultantModel.findByIdAndUpdate(
                consultantId,
                { 'profile.yearsOfExperience': Math.floor(totalYears) }
            );
        } catch (error) {
            logger.warn('Failed to update consultant experience', {
                consultantId,
                error: error.message
            });
        }
    }

    /**
     * Send reference verification requests
     * @private
     */
    async #sendReferenceVerificationRequests(references, consultantId) {
        if (!this.#emailService) return;

        try {
            for (const reference of references) {
                await this.#emailService.send({
                    to: reference.email,
                    template: 'reference-verification',
                    data: {
                        referenceName: reference.name,
                        consultantId,
                        verificationLink: `${process.env.APP_URL}/verify-reference/${reference.id}`
                    }
                });
            }
        } catch (error) {
            logger.warn('Failed to send reference verification requests', {
                consultantId,
                error: error.message
            });
        }
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
        return `profile:${type}:${identifier}:${optionsHash}`;
    }

    /**
     * Clear profile caches
     * @private
     */
    async #clearProfileCaches(tenantId, consultantId = null) {
        if (!this.#cacheService) return;

        try {
            const patterns = [
                `profile:*:${tenantId}:*`,
                `profiles:*:${tenantId}:*`
            ];

            if (consultantId) {
                patterns.push(`profile:*:${consultantId}:*`);
            }

            for (const pattern of patterns) {
                await this.#cacheService.deletePattern(pattern);
            }
        } catch (error) {
            logger.warn('Failed to clear profile caches', {
                tenantId,
                consultantId,
                error: error.message
            });
        }
    }

    /**
     * Extract key strengths from text
     * @private
     */
    async #extractKeyStrengths(text) {
        // Simple keyword extraction - in production would use NLP
        const keywords = ['leadership', 'management', 'strategy', 'analysis', 'communication', 'technical', 'innovation'];
        const strengths = [];
        
        const lowerText = text.toLowerCase();
        for (const keyword of keywords) {
            if (lowerText.includes(keyword)) {
                strengths.push(keyword);
            }
        }
        
        return strengths.slice(0, 5);
    }

    /**
     * Calculate market value
     * @private
     */
    async #calculateMarketValue(profile) {
        // Placeholder calculation based on experience and expertise
        const baseValue = 100000;
        const experienceMultiplier = (profile.metadata?.totalExperienceYears || 0) * 0.05;
        const expertiseBonus = (profile.expertise?.domains?.length || 0) * 0.02;
        
        return Math.round(baseValue * (1 + experienceMultiplier + expertiseBonus));
    }

    /**
     * Calculate competitiveness score
     * @private
     */
    async #calculateCompetitiveness(profile) {
        let score = 50; // Base score
        
        // Completeness bonus
        const completeness = profile.metadata.profileCompleteness?.percentage || 0;
        score += (completeness - 50) * 0.3;
        
        // Experience bonus
        const experience = profile.metadata?.totalExperienceYears || 0;
        score += Math.min(experience * 2, 30);
        
        // Portfolio bonus
        const projects = profile.portfolio?.projects?.length || 0;
        score += Math.min(projects * 3, 20);
        
        return Math.min(Math.max(score, 0), 100);
    }

    /**
     * Identify trending skills
     * @private
     */
    async #identifyTrendingSkills(profile) {
        // Placeholder - would analyze market trends
        return ['AI/ML', 'Cloud Architecture', 'DevOps', 'Agile', 'Data Analytics'];
    }

    // Additional helper methods would continue...
    // (Implementing remaining private methods following the same patterns)

}

module.exports = ConsultantProfileService;