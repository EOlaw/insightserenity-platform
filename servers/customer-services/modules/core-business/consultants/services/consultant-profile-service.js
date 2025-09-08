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
const { asyncHandler } = require('../../../../../../shared/lib/utils/async-handler');
const CacheService = require('../../../../../../shared/lib/services/cache-service');
const EmailService = require('../../../../../../shared/lib/services/email-service');
const NotificationService = require('../../../../../../shared/lib/services/notification-service');
const AuditService = require('../../../../../../shared/lib/security/audit/audit-service');
const FileService = require('../../../../../../shared/lib/services/file-service');
const SearchService = require('../../../../../../shared/lib/services/search-service');
const ConsultantProfileModel = require('../../../../../../shared/lib/database/models/customer-services/core-business/consultants/consultant-profile-model');
const ConsultantModel = require('../../../../../../shared/lib/database/models/customer-services/core-business/consultants/consultant-model');
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
        doc.on('end', () => { });

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

    /**
     * Update profile verification status
     * @private
     */
    async #updateProfileVerificationStatus(profile) {
        const verifiedEntries = profile.careerHistory.filter(entry => entry.verified);
        const totalEntries = profile.careerHistory.length;

        const verificationPercentage = totalEntries > 0 ? (verifiedEntries.length / totalEntries) * 100 : 0;

        profile.metadata.verificationStatus = {
            percentage: verificationPercentage,
            lastUpdated: new Date(),
            verifiedEntries: verifiedEntries.length,
            totalEntries: totalEntries
        };
    }

    /**
     * Validate portfolio project data
     * @private
     */
    async #validatePortfolioProject(projectData) {
        const errors = [];

        if (!projectData.title) {
            errors.push('Project title is required');
        }

        if (projectData.title && projectData.title.length > 100) {
            errors.push('Project title must be 100 characters or less');
        }

        if (!projectData.description) {
            errors.push('Project description is required');
        }

        if (projectData.description && projectData.description.length > 2000) {
            errors.push('Project description must be 2000 characters or less');
        }

        if (!projectData.duration || !projectData.duration.startDate) {
            errors.push('Project start date is required');
        }

        if (projectData.artifacts && projectData.artifacts.length > 20) {
            errors.push('Maximum 20 project artifacts allowed');
        }

        if (errors.length > 0) {
            throw new ValidationError(errors.join(', '), 'PROJECT_VALIDATION_FAILED');
        }

        return true;
    }

    /**
     * Process project artifacts
     * @private
     */
    async #processProjectArtifacts(artifacts, consultantId) {
        const processedArtifacts = [];

        for (const artifact of artifacts) {
            const processed = {
                ...artifact,
                uploadedAt: new Date(),
                processedBy: consultantId
            };

            // Validate file type and size
            if (artifact.file) {
                if (artifact.file.size > 10 * 1024 * 1024) { // 10MB limit
                    throw new ValidationError('Artifact file size must be less than 10MB', 'FILE_TOO_LARGE');
                }

                const allowedTypes = ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'jpg', 'png', 'gif'];
                const fileExtension = artifact.file.name.split('.').pop().toLowerCase();

                if (!allowedTypes.includes(fileExtension)) {
                    throw new ValidationError(`File type ${fileExtension} not allowed`, 'INVALID_FILE_TYPE');
                }

                // Store file using FileService
                if (this.#fileService) {
                    processed.file.url = await this.#fileService.upload(artifact.file, {
                        folder: `profiles/${consultantId}/portfolio`,
                        generateThumbnail: ['jpg', 'png', 'gif'].includes(fileExtension)
                    });
                }
            }

            processedArtifacts.push(processed);
        }

        return processedArtifacts;
    }

    /**
     * Calculate project impact score
     * @private
     */
    async #calculateProjectImpactScore(project) {
        let score = 0;

        // Business value impact (40%)
        if (project.businessValue) {
            if (project.businessValue.revenue) score += 15;
            if (project.businessValue.costSavings) score += 15;
            if (project.businessValue.efficiency) score += 10;
        }

        // Scale and complexity (30%)
        const teamSize = project.team?.size || 1;
        if (teamSize >= 10) score += 15;
        else if (teamSize >= 5) score += 10;
        else if (teamSize >= 2) score += 5;

        const duration = project.duration?.totalMonths || 1;
        if (duration >= 12) score += 15;
        else if (duration >= 6) score += 10;
        else if (duration >= 3) score += 5;

        // Innovation and recognition (30%)
        if (project.recognition?.awards) score += 10;
        if (project.technologies?.emerging) score += 10;
        if (project.testimonials?.length > 0) score += 10;

        return Math.min(score, 100);
    }

    /**
     * Update expertise from project
     * @private
     */
    async #updateExpertiseFromProject(profile, project) {
        if (!project.technologies && !project.domains) return;

        // Update technical expertise from technologies used
        if (project.technologies) {
            for (const tech of project.technologies) {
                const existingDomain = profile.expertise.domains.find(d => d.name.toLowerCase() === tech.toLowerCase());
                if (existingDomain) {
                    existingDomain.projectsCount = (existingDomain.projectsCount || 0) + 1;
                    existingDomain.lastUsed = new Date();
                } else {
                    profile.expertise.domains.push({
                        name: tech,
                        level: 'working',
                        yearsOfExperience: 1,
                        projectsCount: 1,
                        lastUsed: new Date()
                    });
                }
            }
        }

        // Update domain expertise
        if (project.domains) {
            for (const domain of project.domains) {
                const existingDomain = profile.expertise.domains.find(d => d.name === domain);
                if (existingDomain) {
                    existingDomain.projectsCount = (existingDomain.projectsCount || 0) + 1;
                }
            }
        }
    }

    /**
     * Send featured project notifications
     * @private
     */
    async #sendFeaturedProjectNotifications(profile, project, userId) {
        if (!this.#notificationService) return;

        try {
            await this.#notificationService.send({
                type: 'project_featured',
                recipients: [profile.consultantId],
                data: {
                    projectTitle: project.title,
                    client: project.client?.name,
                    profileId: profile.profileId
                }
            });
        } catch (error) {
            logger.warn('Failed to send featured project notifications', {
                profileId: profile._id,
                projectId: project._id,
                error: error.message
            });
        }
    }

    /**
     * Update featured projects
     * @private
     */
    async #updateFeaturedProjects(profile, featuredProjectIds) {
        const maxFeatured = 5;

        if (featuredProjectIds.length > maxFeatured) {
            throw new ValidationError(`Maximum ${maxFeatured} featured projects allowed`, 'TOO_MANY_FEATURED');
        }

        // Validate all project IDs exist
        for (const projectId of featuredProjectIds) {
            const project = profile.portfolio.projects.id(projectId);
            if (!project) {
                throw new NotFoundError(`Project ${projectId} not found`, 'PROJECT_NOT_FOUND');
            }
            project.showcase.featured = true;
            project.showcase.featuredOrder = featuredProjectIds.indexOf(projectId) + 1;
        }

        // Unfeature projects not in the list
        for (const project of profile.portfolio.projects) {
            if (!featuredProjectIds.includes(project._id.toString())) {
                project.showcase.featured = false;
                project.showcase.featuredOrder = null;
            }
        }
    }

    /**
     * Reorder portfolio projects
     * @private
     */
    async #reorderPortfolioProjects(profile, projectOrder) {
        const projects = profile.portfolio.projects;

        // Validate all project IDs exist
        for (const projectId of projectOrder) {
            const project = projects.id(projectId);
            if (!project) {
                throw new NotFoundError(`Project ${projectId} not found`, 'PROJECT_NOT_FOUND');
            }
        }

        // Update display order
        for (let i = 0; i < projectOrder.length; i++) {
            const project = projects.id(projectOrder[i]);
            project.showcase.displayOrder = i + 1;
        }

        // Sort projects array by display order
        profile.portfolio.projects.sort((a, b) =>
            (a.showcase.displayOrder || 999) - (b.showcase.displayOrder || 999)
        );
    }

    /**
     * Generate public portfolio URL
     * @private
     */
    async #generatePublicPortfolioUrl(profile) {
        const baseUrl = process.env.PUBLIC_PORTFOLIO_BASE_URL || 'https://portfolio.company.com';
        const urlSlug = profile.profileId || profile._id.toString();
        return `${baseUrl}/consultant/${urlSlug}`;
    }

    /**
     * Validate expertise level
     * @private
     */
    async #validateExpertiseLevel(domain) {
        const validLevels = Object.keys(this.#expertiseLevels);

        if (!domain.level || !validLevels.includes(domain.level)) {
            throw new ValidationError(
                `Invalid expertise level. Must be one of: ${validLevels.join(', ')}`,
                'INVALID_EXPERTISE_LEVEL'
            );
        }

        const levelRequirements = this.#expertiseLevels[domain.level];
        const yearsOfExperience = domain.yearsOfExperience || 0;
        const projectsCount = domain.projectsCount || 0;

        if (yearsOfExperience < levelRequirements.minYears) {
            throw new ValidationError(
                `${domain.level} level requires at least ${levelRequirements.minYears} years of experience`,
                'INSUFFICIENT_EXPERIENCE'
            );
        }

        if (projectsCount < levelRequirements.minProjects) {
            throw new ValidationError(
                `${domain.level} level requires at least ${levelRequirements.minProjects} projects`,
                'INSUFFICIENT_PROJECTS'
            );
        }

        return true;
    }

    /**
     * Merge domain expertise
     * @private
     */
    async #mergeDomainExpertise(existingDomains, newDomains) {
        const merged = [...existingDomains];

        for (const newDomain of newDomains) {
            const existingIndex = merged.findIndex(d => d.name.toLowerCase() === newDomain.name.toLowerCase());

            if (existingIndex >= 0) {
                // Update existing domain
                merged[existingIndex] = {
                    ...merged[existingIndex],
                    ...newDomain,
                    lastUpdated: new Date()
                };
            } else {
                // Add new domain
                merged.push({
                    ...newDomain,
                    addedAt: new Date(),
                    lastUpdated: new Date()
                });
            }
        }

        return merged;
    }

    /**
     * Merge industry expertise
     * @private
     */
    async #mergeIndustryExpertise(existingIndustries, newIndustries) {
        const merged = [...existingIndustries];

        for (const newIndustry of newIndustries) {
            const existingIndex = merged.findIndex(i => i.name.toLowerCase() === newIndustry.name.toLowerCase());

            if (existingIndex >= 0) {
                // Update existing industry
                merged[existingIndex] = {
                    ...merged[existingIndex],
                    ...newIndustry,
                    lastUpdated: new Date()
                };
            } else {
                // Add new industry
                merged.push({
                    ...newIndustry,
                    addedAt: new Date(),
                    lastUpdated: new Date()
                });
            }
        }

        return merged;
    }

    /**
     * Calculate expertise score
     * @private
     */
    async #calculateExpertiseScore(expertise) {
        let score = 0;

        // Domain expertise scoring (60%)
        if (expertise.domains && expertise.domains.length > 0) {
            const domainScore = expertise.domains.reduce((acc, domain) => {
                const levelMultiplier = {
                    aware: 1,
                    working: 2,
                    practitioner: 3,
                    expert: 4,
                    thought_leader: 5
                }[domain.level] || 1;

                const experienceBonus = Math.min(domain.yearsOfExperience || 0, 10) * 0.5;
                const projectBonus = Math.min(domain.projectsCount || 0, 20) * 0.25;

                return acc + (levelMultiplier * 5) + experienceBonus + projectBonus;
            }, 0);

            score += Math.min(domainScore, 60);
        }

        // Industry expertise scoring (25%)
        if (expertise.industries && expertise.industries.length > 0) {
            const industryScore = expertise.industries.length * 5;
            score += Math.min(industryScore, 25);
        }

        // Functional areas scoring (15%)
        if (expertise.functionalAreas && expertise.functionalAreas.length > 0) {
            const functionalScore = expertise.functionalAreas.length * 3;
            score += Math.min(functionalScore, 15);
        }

        return Math.min(score, 100);
    }

    /**
     * Update market positioning
     * @private
     */
    async #updateMarketPositioning(profile) {
        const expertiseScore = await this.#calculateExpertiseScore(profile.expertise);
        const experienceYears = profile.metadata?.totalExperienceYears || 0;

        let level = 'junior';
        let positioning = 'generalist';

        // Determine level based on experience and expertise
        if (experienceYears >= 10 && expertiseScore >= 80) {
            level = 'principal';
        } else if (experienceYears >= 7 && expertiseScore >= 70) {
            level = 'senior';
        } else if (experienceYears >= 4 && expertiseScore >= 60) {
            level = 'mid';
        }

        // Determine positioning based on expertise breadth vs depth
        const domainCount = profile.expertise?.domains?.length || 0;
        const avgDomainLevel = profile.expertise?.domains?.reduce((acc, d) => {
            const levelScore = { aware: 1, working: 2, practitioner: 3, expert: 4, thought_leader: 5 }[d.level] || 1;
            return acc + levelScore;
        }, 0) / Math.max(domainCount, 1);

        if (domainCount >= 5 && avgDomainLevel >= 2.5) {
            positioning = 'hybrid';
        } else if (domainCount <= 3 && avgDomainLevel >= 4) {
            positioning = 'specialist';
        }

        profile.marketProfile = {
            level,
            positioning,
            expertiseScore,
            marketValue: await this.#calculateMarketValue(profile),
            lastUpdated: new Date()
        };
    }

    /**
     * Send expertise update notifications
     * @private
     */
    async #sendExpertiseUpdateNotifications(profile, expertiseData, userId) {
        if (!this.#notificationService) return;

        try {
            await this.#notificationService.send({
                type: 'expertise_updated',
                recipients: [profile.consultantId],
                data: {
                    domainsUpdated: expertiseData.domains?.length || 0,
                    industriesUpdated: expertiseData.industries?.length || 0,
                    profileId: profile.profileId
                }
            });
        } catch (error) {
            logger.warn('Failed to send expertise update notifications', {
                profileId: profile._id,
                error: error.message
            });
        }
    }

    /**
     * Build technical skills matrix
     * @private
     */
    async #buildTechnicalSkillsMatrix(technicalSkills) {
        if (!technicalSkills || !Array.isArray(technicalSkills)) {
            return [];
        }

        return technicalSkills.map(skill => ({
            skill: skill.name || skill,
            level: skill.level || 'beginner',
            yearsOfExperience: skill.yearsOfExperience || 0,
            lastUsed: skill.lastUsed || new Date(),
            category: skill.category || 'general',
            certifications: skill.certifications || []
        }));
    }

    /**
     * Build business skills matrix
     * @private
     */
    async #buildBusinessSkillsMatrix(profile) {
        const businessSkills = [];

        // Extract from career history
        for (const career of profile.careerHistory || []) {
            if (career.keyResponsibilities) {
                for (const responsibility of career.keyResponsibilities) {
                    // Simple keyword matching for business skills
                    const businessKeywords = ['strategy', 'management', 'leadership', 'analysis', 'consulting', 'planning'];
                    for (const keyword of businessKeywords) {
                        if (responsibility.toLowerCase().includes(keyword)) {
                            const existing = businessSkills.find(s => s.skill === keyword);
                            if (existing) {
                                existing.occurrences += 1;
                            } else {
                                businessSkills.push({
                                    skill: keyword,
                                    level: 'intermediate',
                                    occurrences: 1,
                                    source: 'career_history'
                                });
                            }
                        }
                    }
                }
            }
        }

        return businessSkills;
    }

    /**
     * Build leadership matrix
     * @private
     */
    async #buildLeadershipMatrix(profile) {
        const leadershipSkills = [];

        // Extract leadership experience from career history
        for (const career of profile.careerHistory || []) {
            if (career.team?.managed || career.position?.title?.toLowerCase().includes('manager') ||
                career.position?.title?.toLowerCase().includes('lead')) {

                leadershipSkills.push({
                    skill: 'Team Management',
                    level: career.team?.size >= 10 ? 'expert' : 'intermediate',
                    teamSize: career.team?.size || 1,
                    duration: career.duration?.totalMonths || 0,
                    context: `${career.position?.title} at ${career.company?.name}`
                });
            }
        }

        // Add leadership skills from achievements
        for (const achievement of profile.performance?.achievements || []) {
            if (achievement.type === 'leadership' || achievement.title?.toLowerCase().includes('leadership')) {
                leadershipSkills.push({
                    skill: 'Leadership Recognition',
                    level: 'expert',
                    achievement: achievement.title,
                    date: achievement.date
                });
            }
        }

        return leadershipSkills;
    }

    /**
     * Identify skill gaps
     * @private
     */
    async #identifySkillGaps(matrix, targetLevel) {
        const gaps = [];

        // Define required skills by level
        const requiredSkills = {
            junior: ['communication', 'analysis', 'teamwork'],
            mid: ['project management', 'client relations', 'presentation'],
            senior: ['strategy', 'leadership', 'business development'],
            principal: ['thought leadership', 'mentoring', 'innovation']
        };

        const required = requiredSkills[targetLevel] || requiredSkills.mid;

        for (const requiredSkill of required) {
            const hasSkill = matrix.technical.some(s => s.skill.toLowerCase().includes(requiredSkill)) ||
                matrix.business.some(s => s.skill.toLowerCase().includes(requiredSkill)) ||
                matrix.leadership.some(s => s.skill.toLowerCase().includes(requiredSkill));

            if (!hasSkill) {
                gaps.push({
                    skill: requiredSkill,
                    priority: 'high',
                    category: 'business',
                    reason: `Required for ${targetLevel} level`
                });
            }
        }

        return gaps;
    }

    /**
     * Generate skill development plan
     * @private
     */
    async #generateSkillDevelopmentPlan(gaps) {
        const recommendations = [];

        for (const gap of gaps) {
            const recommendation = {
                skill: gap.skill,
                priority: gap.priority,
                suggestedActions: [],
                timeline: '3-6 months',
                resources: []
            };

            // Add specific recommendations based on skill type
            switch (gap.skill.toLowerCase()) {
                case 'leadership':
                    recommendation.suggestedActions = [
                        'Enroll in leadership development program',
                        'Seek mentoring opportunities',
                        'Take on team lead responsibilities'
                    ];
                    recommendation.resources = ['Internal leadership courses', 'External certifications'];
                    break;

                case 'strategy':
                    recommendation.suggestedActions = [
                        'Complete strategic thinking course',
                        'Participate in strategic planning sessions',
                        'Read strategy business books'
                    ];
                    break;

                default:
                    recommendation.suggestedActions = [
                        `Find training opportunities for ${gap.skill}`,
                        `Practice ${gap.skill} in current projects`,
                        `Seek feedback on ${gap.skill} performance`
                    ];
            }

            recommendations.push(recommendation);
        }

        return recommendations;
    }

    /**
     * Validate development plan
     * @private
     */
    async #validateDevelopmentPlan(planData) {
        const errors = [];

        if (!planData.goals || !Array.isArray(planData.goals) || planData.goals.length === 0) {
            errors.push('Development plan must have at least one goal');
        }

        for (const goal of planData.goals || []) {
            if (!goal.title) {
                errors.push('Each goal must have a title');
            }

            if (!goal.description) {
                errors.push('Each goal must have a description');
            }

            if (!goal.targetDate) {
                errors.push('Each goal must have a target date');
            }

            if (new Date(goal.targetDate) <= new Date()) {
                errors.push('Goal target date must be in the future');
            }
        }

        if (errors.length > 0) {
            throw new ValidationError(errors.join(', '), 'DEVELOPMENT_PLAN_VALIDATION_FAILED');
        }

        return true;
    }

    /**
     * Analyze development budget
     * @private
     */
    async #analyzeDevelopmentBudget(planData) {
        let totalCost = 0;
        const breakdown = [];

        for (const goal of planData.goals || []) {
            if (goal.budget) {
                totalCost += goal.budget.estimated || 0;
                breakdown.push({
                    goal: goal.title,
                    estimated: goal.budget.estimated || 0,
                    category: goal.budget.category || 'training'
                });
            }
        }

        return {
            allocated: totalCost,
            breakdown,
            currency: 'USD',
            needsApproval: totalCost > 5000,
            calculatedAt: new Date()
        };
    }

    /**
     * Create development milestones
     * @private
     */
    async #createDevelopmentMilestones(profile, developmentPlan) {
        for (const goal of developmentPlan.goals) {
            // Create quarterly milestones
            const targetDate = new Date(goal.targetDate);
            const startDate = new Date();
            const totalMonths = Math.ceil((targetDate - startDate) / (1000 * 60 * 60 * 24 * 30));

            const milestones = [];
            for (let i = 1; i <= Math.min(totalMonths, 12); i += 3) {
                const milestoneDate = new Date(startDate);
                milestoneDate.setMonth(startDate.getMonth() + i);

                milestones.push({
                    milestone: `Q${Math.ceil(i / 3)} Review`,
                    targetDate: milestoneDate,
                    description: `Quarterly progress review for ${goal.title}`,
                    achieved: false
                });
            }

            goal.milestones = milestones;
        }
    }

    /**
     * Request plan approval
     * @private
     */
    async #requestPlanApproval(profile, developmentPlan, userId) {
        if (!this.#notificationService) return;

        try {
            // Find manager or HR for approval
            const approvers = ['hr@company.com']; // This would be dynamic in real implementation

            await this.#notificationService.send({
                type: 'development_plan_approval_request',
                recipients: approvers,
                data: {
                    consultant: profile.consultantId,
                    plan: developmentPlan,
                    requestedBy: userId,
                    budget: developmentPlan.budget?.allocated
                }
            });
        } catch (error) {
            logger.warn('Failed to send plan approval request', {
                profileId: profile._id,
                error: error.message
            });
        }
    }

    /**
     * Handle goal completion
     * @private
     */
    async #handleGoalCompletion(profile, goal, userId) {
        goal.completedAt = new Date();
        goal.completedBy = userId;
        goal.status = 'completed';

        // Send completion notifications
        if (this.#notificationService) {
            await this.#notificationService.send({
                type: 'goal_completed',
                recipients: [profile.consultantId],
                data: {
                    goalTitle: goal.title,
                    completedAt: goal.completedAt
                }
            });
        }

        // Update profile development metrics
        if (!profile.analytics.developmentMetrics) {
            profile.analytics.developmentMetrics = {
                goalsCompleted: 0,
                totalGoals: 0,
                completionRate: 0
            };
        }

        profile.analytics.developmentMetrics.goalsCompleted += 1;
        profile.analytics.developmentMetrics.completionRate =
            (profile.analytics.developmentMetrics.goalsCompleted /
                profile.development.currentPlan.goals.length) * 100;
    }

    /**
     * Send progress notifications
     * @private
     */
    async #sendProgressNotifications(profile, goal, progressData) {
        if (!this.#notificationService) return;

        try {
            await this.#notificationService.send({
                type: 'development_progress',
                recipients: [profile.consultantId],
                data: {
                    goalTitle: goal.title,
                    progress: progressData.percentage,
                    milestone: progressData.percentage
                }
            });
        } catch (error) {
            logger.warn('Failed to send progress notifications', {
                profileId: profile._id,
                error: error.message
            });
        }
    }

    /**
     * Validate performance review
     * @private
     */
    async #validatePerformanceReview(reviewData) {
        const errors = [];

        if (!reviewData.period) {
            errors.push('Review period is required');
        }

        if (!reviewData.scores || typeof reviewData.scores !== 'object') {
            errors.push('Performance scores are required');
        }

        if (reviewData.scores) {
            const requiredScores = ['overall', 'technical', 'leadership', 'communication'];
            for (const score of requiredScores) {
                if (typeof reviewData.scores[score] !== 'number' ||
                    reviewData.scores[score] < 1 ||
                    reviewData.scores[score] > 5) {
                    errors.push(`${score} score must be a number between 1 and 5`);
                }
            }
        }

        if (errors.length > 0) {
            throw new ValidationError(errors.join(', '), 'REVIEW_VALIDATION_FAILED');
        }

        return true;
    }

    /**
     * Calibrate performance scores
     * @private
     */
    async #calibratePerformanceScores(scores) {
        // Simple calibration - in production this would use organizational benchmarks
        const calibrated = { ...scores };

        // Apply normal distribution calibration
        const weights = { overall: 0.4, technical: 0.3, leadership: 0.2, communication: 0.1 };

        calibrated.overall = Object.keys(weights).reduce((acc, key) => {
            return acc + (scores[key] || 0) * weights[key];
        }, 0);

        // Round to one decimal place
        Object.keys(calibrated).forEach(key => {
            calibrated[key] = Math.round(calibrated[key] * 10) / 10;
        });

        return calibrated;
    }

    /**
     * Calculate percentile
     * @private
     */
    async #calculatePercentile(overallScore) {
        // Simulate percentile calculation - in production this would query actual data
        const benchmarkScores = [2.1, 2.5, 2.8, 3.2, 3.5, 3.8, 4.1, 4.4, 4.7, 5.0];

        const lowerScores = benchmarkScores.filter(score => score < overallScore).length;
        return Math.round((lowerScores / benchmarkScores.length) * 100);
    }

    /**
     * Update performance metrics
     * @private
     */
    async #updatePerformanceMetrics(profile) {
        const ratings = profile.performance.ratings || [];

        if (ratings.length === 0) return;

        const latestRating = ratings[ratings.length - 1];
        const previousRating = ratings.length > 1 ? ratings[ratings.length - 2] : null;

        profile.performance.currentMetrics = {
            overallRating: latestRating.scores.overall,
            percentile: latestRating.percentile,
            trend: previousRating ?
                (latestRating.scores.overall > previousRating.scores.overall ? 'improving' :
                    latestRating.scores.overall < previousRating.scores.overall ? 'declining' : 'stable') : 'new',
            lastReviewDate: latestRating.reviewDate,
            reviewCount: ratings.length
        };
    }

    /**
     * Analyze promotion eligibility
     * @private
     */
    async #analyzePromotionEligibility(profile) {
        const currentLevel = profile.marketProfile?.level || 'junior';
        const latestRating = profile.performance.ratings[profile.performance.ratings.length - 1];
        const experienceYears = profile.metadata?.totalExperienceYears || 0;

        const promotionCriteria = {
            junior: { minRating: 3.5, minExperience: 2, nextLevel: 'mid' },
            mid: { minRating: 4.0, minExperience: 5, nextLevel: 'senior' },
            senior: { minRating: 4.5, minExperience: 8, nextLevel: 'principal' }
        };

        const criteria = promotionCriteria[currentLevel];
        if (!criteria) return { eligible: false, reason: 'Maximum level reached' };

        const eligible = latestRating.scores.overall >= criteria.minRating &&
            experienceYears >= criteria.minExperience;

        return {
            eligible,
            currentLevel,
            nextLevel: criteria.nextLevel,
            requirements: criteria,
            currentRating: latestRating.scores.overall,
            currentExperience: experienceYears,
            reason: eligible ? 'Meets all criteria' : 'Does not meet minimum requirements'
        };
    }

    /**
     * Trigger promotion workflow
     * @private
     */
    async #triggerPromotionWorkflow(profile, promotionAnalysis, userId) {
        if (!this.#notificationService) return;

        try {
            await this.#notificationService.send({
                type: 'promotion_eligible',
                recipients: ['hr@company.com', profile.consultantId],
                data: {
                    consultant: profile.consultantId,
                    currentLevel: promotionAnalysis.currentLevel,
                    nextLevel: promotionAnalysis.nextLevel,
                    rating: promotionAnalysis.currentRating,
                    experience: promotionAnalysis.currentExperience,
                    triggeredBy: userId
                }
            });
        } catch (error) {
            logger.warn('Failed to trigger promotion workflow', {
                profileId: profile._id,
                error: error.message
            });
        }
    }

    /**
     * Send review notifications
     * @private
     */
    async #sendReviewNotifications(profile, review, userId) {
        if (!this.#notificationService) return;

        try {
            await this.#notificationService.send({
                type: 'performance_review_completed',
                recipients: [profile.consultantId],
                data: {
                    period: review.period,
                    overallScore: review.scores.overall,
                    percentile: review.percentile,
                    reviewer: userId
                }
            });
        } catch (error) {
            logger.warn('Failed to send review notifications', {
                profileId: profile._id,
                error: error.message
            });
        }
    }

    /**
     * Validate achievement
     * @private
     */
    async #validateAchievement(achievementData) {
        const errors = [];

        if (!achievementData.title) {
            errors.push('Achievement title is required');
        }

        if (!achievementData.description) {
            errors.push('Achievement description is required');
        }

        if (!achievementData.date) {
            errors.push('Achievement date is required');
        }

        if (!achievementData.type) {
            errors.push('Achievement type is required');
        }

        const validTypes = ['award', 'recognition', 'milestone', 'certification', 'publication'];
        if (achievementData.type && !validTypes.includes(achievementData.type)) {
            errors.push(`Invalid achievement type. Must be one of: ${validTypes.join(', ')}`);
        }

        if (errors.length > 0) {
            throw new ValidationError(errors.join(', '), 'ACHIEVEMENT_VALIDATION_FAILED');
        }

        return true;
    }

    /**
     * Analyze achievement impact
     * @private
     */
    async #analyzeAchievementImpact(achievementData) {
        let significance = 'low';
        let impact = {
            business: 0,
            personal: 0,
            market: 0
        };

        // Analyze based on achievement type
        switch (achievementData.type) {
            case 'award':
                significance = achievementData.scope === 'industry' ? 'high' : 'medium';
                impact.market = achievementData.scope === 'industry' ? 80 : 50;
                impact.personal = 90;
                break;

            case 'certification':
                significance = 'medium';
                impact.personal = 70;
                impact.business = 60;
                break;

            case 'publication':
                significance = 'high';
                impact.market = 85;
                impact.personal = 80;
                break;

            default:
                significance = 'medium';
                impact.personal = 60;
        }

        // Adjust based on monetary value
        if (achievementData.monetaryValue) {
            if (achievementData.monetaryValue > 100000) {
                significance = 'high';
                impact.business = Math.max(impact.business, 90);
            } else if (achievementData.monetaryValue > 10000) {
                impact.business = Math.max(impact.business, 70);
            }
        }

        return {
            significance,
            impact,
            calculatedAt: new Date()
        };
    }

    /**
     * Update market profile from achievement
     * @private
     */
    async #updateMarketProfileFromAchievement(profile, achievement) {
        if (!profile.marketProfile) {
            profile.marketProfile = {
                level: 'mid',
                positioning: 'generalist',
                expertiseScore: 50,
                marketValue: 100000
            };
        }

        // Boost market profile based on achievement impact
        if (achievement.impact.significance === 'high') {
            profile.marketProfile.marketValue *= 1.1; // 10% increase
            profile.marketProfile.expertiseScore = Math.min(
                profile.marketProfile.expertiseScore + 5,
                100
            );
        }

        profile.marketProfile.lastUpdated = new Date();
    }

    /**
     * Send achievement notifications
     * @private
     */
    async #sendAchievementNotifications(profile, achievement, userId) {
        if (!this.#notificationService) return;

        try {
            // Send to consultant
            await this.#notificationService.send({
                type: 'achievement_added',
                recipients: [profile.consultantId],
                data: {
                    achievementTitle: achievement.title,
                    type: achievement.type,
                    significance: achievement.impact.significance
                }
            });

            // Send announcement if high impact
            if (achievement.impact.significance === 'high') {
                await this.#notificationService.send({
                    type: 'achievement_announcement',
                    recipients: ['team@company.com'],
                    data: {
                        consultant: profile.consultantId,
                        achievement: achievement.title,
                        type: achievement.type
                    }
                });
            }
        } catch (error) {
            logger.warn('Failed to send achievement notifications', {
                profileId: profile._id,
                error: error.message
            });
        }
    }

    /**
     * Update public profile
     * @private
     */
    async #updatePublicProfile(profile, achievement) {
        // Add to public achievements if visible
        if (!profile.portfolio.publicAchievements) {
            profile.portfolio.publicAchievements = [];
        }

        profile.portfolio.publicAchievements.push({
            title: achievement.title,
            type: achievement.type,
            date: achievement.date,
            description: achievement.description
        });

        // Keep only top 10 public achievements
        profile.portfolio.publicAchievements = profile.portfolio.publicAchievements
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, 10);
    }

    /**
     * Build search query
     * @private
     */
    async #buildSearchQuery(searchCriteria, tenantId) {
        const query = {
            isDeleted: false
        };

        if (tenantId) {
            query.tenantId = tenantId;
        }

        if (searchCriteria.skills && searchCriteria.skills.length > 0) {
            query['expertise.domains.name'] = { $in: searchCriteria.skills };
        }

        if (searchCriteria.industries && searchCriteria.industries.length > 0) {
            query['expertise.industries.name'] = { $in: searchCriteria.industries };
        }

        if (searchCriteria.experience) {
            if (searchCriteria.experience.min) {
                query['metadata.totalExperienceYears'] = { $gte: searchCriteria.experience.min };
            }
            if (searchCriteria.experience.max) {
                query['metadata.totalExperienceYears'] = {
                    ...query['metadata.totalExperienceYears'],
                    $lte: searchCriteria.experience.max
                };
            }
        }

        if (searchCriteria.level) {
            query['marketProfile.level'] = searchCriteria.level;
        }

        if (searchCriteria.availability) {
            query['consultant.availability.status'] = searchCriteria.availability;
        }

        return query;
    }

    /**
     * Calculate search match score
     * @private
     */
    async #calculateSearchMatchScore(profile, searchCriteria) {
        let score = 0;

        // Skills matching (40%)
        if (searchCriteria.skills && searchCriteria.skills.length > 0) {
            const profileSkills = profile.expertise?.domains?.map(d => d.name.toLowerCase()) || [];
            const matchingSkills = searchCriteria.skills.filter(skill =>
                profileSkills.includes(skill.toLowerCase())
            );
            score += (matchingSkills.length / searchCriteria.skills.length) * 40;
        }

        // Industry matching (25%)
        if (searchCriteria.industries && searchCriteria.industries.length > 0) {
            const profileIndustries = profile.expertise?.industries?.map(i => i.name.toLowerCase()) || [];
            const matchingIndustries = searchCriteria.industries.filter(industry =>
                profileIndustries.includes(industry.toLowerCase())
            );
            score += (matchingIndustries.length / searchCriteria.industries.length) * 25;
        }

        // Experience matching (20%)
        if (searchCriteria.experience) {
            const profileExp = profile.metadata?.totalExperienceYears || 0;
            const targetExp = (searchCriteria.experience.min + searchCriteria.experience.max) / 2;
            const expDiff = Math.abs(profileExp - targetExp);
            score += Math.max(0, 20 - (expDiff * 2));
        }

        // Profile completeness bonus (15%)
        const completeness = profile.metadata.profileCompleteness?.percentage || 0;
        score += (completeness / 100) * 15;

        return Math.min(score, 100);
    }

    /**
     * Generate profile summary
     * @private
     */
    async #generateProfileSummary(profile) {
        const summary = {
            headline: profile.summary?.headline || 'Consultant',
            experience: `${profile.metadata?.totalExperienceYears || 0} years`,
            topSkills: profile.expertise?.domains?.slice(0, 3).map(d => d.name) || [],
            industries: profile.expertise?.industries?.slice(0, 2).map(i => i.name) || [],
            completeness: profile.metadata.profileCompleteness?.percentage || 0,
            availability: profile.consultant?.availability?.status || 'unknown'
        };

        return summary;
    }

    /**
     * Select report sections
     * @private
     */
    async #selectReportSections(profile, sections) {
        const reportData = {};

        if (sections.includes('all') || sections.includes('summary')) {
            reportData.summary = profile.summary;
        }

        if (sections.includes('all') || sections.includes('career')) {
            reportData.careerHistory = profile.careerHistory;
        }

        if (sections.includes('all') || sections.includes('expertise')) {
            reportData.expertise = profile.expertise;
        }

        if (sections.includes('all') || sections.includes('portfolio')) {
            reportData.portfolio = profile.portfolio;
        }

        if (sections.includes('all') || sections.includes('performance')) {
            reportData.performance = profile.performance;
        }

        if (sections.includes('all') || sections.includes('analytics')) {
            reportData.analytics = profile.analytics;
        }

        return reportData;
    }

    /**
     * Apply report template
     * @private
     */
    async #applyReportTemplate(reportData, template) {
        const templates = {
            standard: {
                title: 'Consultant Profile Report',
                sections: ['summary', 'career', 'expertise', 'portfolio'],
                formatting: 'professional'
            },
            executive: {
                title: 'Executive Summary Report',
                sections: ['summary', 'performance', 'analytics'],
                formatting: 'executive'
            },
            detailed: {
                title: 'Comprehensive Profile Report',
                sections: ['summary', 'career', 'expertise', 'portfolio', 'performance', 'analytics'],
                formatting: 'detailed'
            }
        };

        const templateConfig = templates[template] || templates.standard;

        return {
            ...templateConfig,
            data: reportData,
            generatedAt: new Date(),
            consultant: reportData.consultant
        };
    }

    /**
     * Generate PDF report
     * @private
     */
    async #generatePDFReport(formattedReport) {
        const doc = new PDFDocument();
        const chunks = [];

        doc.on('data', chunk => chunks.push(chunk));

        // Header
        doc.fontSize(20).text(formattedReport.title, 50, 50);
        doc.fontSize(12).text(`Generated: ${formattedReport.generatedAt.toLocaleDateString()}`, 50, 80);

        let yPos = 120;

        // Summary Section
        if (formattedReport.data.summary) {
            doc.fontSize(16).text('Professional Summary', 50, yPos);
            yPos += 30;
            doc.fontSize(12).text(formattedReport.data.summary.headline || '', 50, yPos);
            yPos += 20;
            doc.fontSize(10).text(formattedReport.data.summary.executiveSummary || '', 50, yPos, {
                width: 500,
                align: 'justify'
            });
            yPos += 80;
        }

        // Career History Section
        if (formattedReport.data.careerHistory && yPos < 700) {
            doc.fontSize(16).text('Career History', 50, yPos);
            yPos += 30;

            for (const career of formattedReport.data.careerHistory.slice(0, 3)) {
                if (yPos > 700) break;

                doc.fontSize(12).text(career.position?.title || '', 50, yPos);
                doc.fontSize(10).text(career.company?.name || '', 50, yPos + 15);
                doc.fontSize(9).text(career.description || '', 50, yPos + 30, {
                    width: 500,
                    height: 40
                });
                yPos += 80;
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
     * Generate Word report
     * @private
     */
    async #generateWordReport(formattedReport) {
        // Simplified Word document generation
        // In production, would use a proper library like docx
        const content = `
            ${formattedReport.title}
            Generated: ${formattedReport.generatedAt.toLocaleDateString()}

            PROFESSIONAL SUMMARY
            ${formattedReport.data.summary?.headline || ''}
            ${formattedReport.data.summary?.executiveSummary || ''}

            CAREER HISTORY
            ${(formattedReport.data.careerHistory || []).map(career => `
            ${career.position?.title || ''} at ${career.company?.name || ''}
            ${career.description || ''}
            `).join('\n')}
        `;

        return Buffer.from(content, 'utf8');
    }

    /**
     * Generate HTML report
     * @private
     */
    async #generateHTMLReport(formattedReport) {
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>${formattedReport.title}</title>
                <style>
                    body { 
                        font-family: Arial, sans-serif; 
                        margin: 40px; 
                        line-height: 1.6;
                    }
                    .header { 
                        border-bottom: 2px solid #333; 
                        padding-bottom: 20px; 
                        margin-bottom: 30px;
                    }
                    .section { 
                        margin: 30px 0; 
                    }
                    .section h2 {
                        color: #333;
                        border-bottom: 1px solid #ccc;
                        padding-bottom: 10px;
                    }
                    .career-entry { 
                        margin-bottom: 20px; 
                        border-left: 3px solid #007bff; 
                        padding-left: 15px; 
                    }
                    .skills-list {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 10px;
                    }
                    .skill-tag {
                        background: #f0f0f0;
                        padding: 5px 10px;
                        border-radius: 5px;
                        font-size: 0.9em;
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>${formattedReport.title}</h1>
                    <p>Generated: ${formattedReport.generatedAt.toLocaleDateString()}</p>
                </div>
                
                ${formattedReport.data.summary ? `
                <div class="section">
                    <h2>Professional Summary</h2>
                    <h3>${formattedReport.data.summary.headline || ''}</h3>
                    <p>${formattedReport.data.summary.executiveSummary || ''}</p>
                </div>
                ` : ''}
                
                ${formattedReport.data.careerHistory ? `
                <div class="section">
                    <h2>Career History</h2>
                    ${formattedReport.data.careerHistory.map(career => `
                        <div class="career-entry">
                            <h3>${career.position?.title || ''}</h3>
                            <h4>${career.company?.name || ''}</h4>
                            <p>${career.description || ''}</p>
                        </div>
                    `).join('')}
                </div>
                ` : ''}
                
                ${formattedReport.data.expertise ? `
                <div class="section">
                    <h2>Expertise</h2>
                    <h3>Domains</h3>
                    <div class="skills-list">
                        ${(formattedReport.data.expertise.domains || []).map(domain =>
                        `<span class="skill-tag">${domain.name} (${domain.level})</span>`
                    ).join('')}
                    </div>
                    <h3>Industries</h3>
                    <div class="skills-list">
                        ${(formattedReport.data.expertise.industries || []).map(industry =>
                        `<span class="skill-tag">${industry.name}</span>`
                    ).join('')}
                    </div>
                </div>
                ` : ''}
            </body>
            </html>
        `;

        return html;
    }

}

module.exports = ConsultantProfileService;