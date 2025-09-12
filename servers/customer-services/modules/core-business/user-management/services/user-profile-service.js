'use strict';

/**
 * @fileoverview Enterprise user profile service for comprehensive professional and personal profile management
 * @module shared/lib/services/user-management/user-profile-service
 * @requires mongoose
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/async-handler
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/services/email-service
 * @requires module:shared/lib/services/notification-service
 * @requires module:shared/lib/security/audit/audit-service
 * @requires module:shared/lib/database/models/users/user-profile-model
 * @requires module:shared/lib/database/models/users/user-model
 */

const mongoose = require('mongoose');
const logger = require('../../../../../../shared/lib/utils/logger');
const { AppError, ValidationError, NotFoundError, ConflictError, ForbiddenError } = require('../../../../../../shared/lib/utils/app-error');
const { asyncHandler } = require('../../../../../../shared/lib/utils/async-handler');
const CacheService = require('../../../../../../shared/lib/services/cache-service');
const EmailService = require('../../../../../../shared/lib/services/email-service');
const NotificationService = require('../../../../../../shared/lib/services/notification-service');
const AuditService = require('../../../../../../shared/lib/security/audit/audit-service');
const UserModel = require('../../../../../../shared/lib/database/models/customer-services/core-business/user-management/user-model');
const UserProfileModel = require('../../../../../../shared/lib/database/models/customer-services/core-business/user-management/user-profile-model');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const sharp = require('sharp');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs').promises;

/**
 * Enterprise user profile service for comprehensive profile management
 * @class UserProfileService
 * @description Manages professional profiles, skills, work history, portfolios, and social connections
 */
class UserProfileService {
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
     * @type {number}
     */
    #defaultCacheTTL = 3600; // 1 hour

    /**
     * @private
     * @type {Object}
     */
    #skillCategories = {
        technical: ['programming', 'databases', 'cloud', 'devops', 'security', 'architecture'],
        functional: ['project_management', 'business_analysis', 'consulting', 'strategy'],
        industry: ['finance', 'healthcare', 'retail', 'technology', 'manufacturing'],
        soft: ['communication', 'leadership', 'teamwork', 'problem_solving', 'creativity'],
        language: ['english', 'spanish', 'french', 'german', 'chinese', 'japanese']
    };

    /**
     * @private
     * @type {Map}
     */
    #pendingEndorsements = new Map();

    /**
     * @private
     * @type {Map}
     */
    #mediaProcessingQueue = new Map();

    /**
     * @private
     * @type {Object}
     */
    #completenessWeights = {
        basicInfo: 20,
        workHistory: 25,
        education: 15,
        skills: 20,
        portfolio: 10,
        social: 10
    };

    /**
     * @private
     * @type {Set}
     */
    #activeSearches = new Set();

    /**
     * @private
     * @type {Object}
     */
    #exportFormats = {
        pdf: 'application/pdf',
        word: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        json: 'application/json',
        linkedin: 'text/plain'
    };

    /**
     * @private
     * @type {Map}
     */
    #profileMetricsCache = new Map();

    /**
     * Creates an instance of UserProfileService
     * @constructor
     * @param {Object} dependencies - Service dependencies
     * @param {CacheService} dependencies.cacheService - Cache service instance
     * @param {EmailService} dependencies.emailService - Email service instance
     * @param {NotificationService} dependencies.notificationService - Notification service instance
     * @param {AuditService} dependencies.auditService - Audit service instance
     */
    constructor(dependencies = {}) {
        this.#cacheService = dependencies.cacheService || new CacheService();
        this.#emailService = dependencies.emailService || new EmailService();
        this.#notificationService = dependencies.notificationService || new NotificationService();
        this.#auditService = dependencies.auditService || new AuditService();

        this.#initializeService();
    }

    /**
     * Initialize service components
     * @private
     */
    #initializeService() {
        logger.info('Initializing UserProfileService', {
            cacheEnabled: !!this.#cacheService,
            emailEnabled: !!this.#emailService,
            notificationEnabled: !!this.#notificationService,
            auditEnabled: !!this.#auditService
        });

        this.#setupCleanupIntervals();
    }

    // ==================== PUBLIC METHODS ====================

    /**
     * Create a comprehensive user profile
     * @param {string} userId - User ID
     * @param {Object} profileData - Profile data
     * @param {string} createdBy - ID of user creating profile
     * @param {Object} options - Creation options
     * @returns {Promise<Object>} Created profile
     */
    async createProfile(userId, profileData, createdBy, options = {}) {
        const session = options.session || null;

        try {
            // Validate user exists
            const user = await UserModel.findById(userId);
            if (!user) {
                throw new NotFoundError('User not found', 'USER_NOT_FOUND');
            }

            // Check if profile already exists
            const existingProfile = await UserProfileModel.findOne({ userId });
            if (existingProfile) {
                throw new ConflictError('Profile already exists', 'PROFILE_EXISTS');
            }

            // Validate profile data
            await this.#validateProfileData(profileData);

            // Enrich profile data
            const enrichedData = await this.#enrichProfileData(profileData, user, createdBy);

            // Create profile
            const profile = new UserProfileModel({
                userId,
                organizationId: user.defaultOrganizationId,
                ...enrichedData,
                metadata: {
                    lastUpdatedBy: createdBy,
                    importedFrom: 'manual',
                    version: 1,
                    isPublished: true,
                    publishedAt: new Date()
                }
            });

            await profile.save({ session });

            // Calculate initial completeness
            profile.calculateCompleteness();
            await profile.save({ session });

            // Send notifications
            await this.#sendProfileCreationNotifications(profile, createdBy);

            // Log audit trail
            await this.#auditService.log({
                action: 'PROFILE_CREATED',
                entityType: 'user_profile',
                entityId: profile._id,
                userId: createdBy,
                details: {
                    profileUserId: userId,
                    completenessScore: profile.analytics.completeness.score
                }
            });

            // Clear caches
            await this.#clearProfileCaches(userId);

            logger.info('User profile created', {
                profileId: profile._id,
                userId,
                completeness: profile.analytics.completeness.score,
                createdBy
            });

            return profile.toObject();
        } catch (error) {
            logger.error('Error creating profile', {
                error: error.message,
                userId,
                createdBy
            });
            throw error;
        }
    }

    /**
     * Get user profile with population options
     * @param {string} userId - User ID
     * @param {Object} options - Query options
     * @returns {Promise<Object>} User profile
     */
    async getProfile(userId, options = {}) {
        const {
            includePrivate = false,
            populate = [],
            requesterId,
            checkPermissions = true
        } = options;

        try {
            // Check cache first
            const cacheKey = this.#generateCacheKey('profile', userId, options);
            const cached = await this.#cacheService.get(cacheKey);
            if (cached) {
                return cached;
            }

            // Build query
            const query = { userId, 'metadata.isPublished': true };

            // Execute query with population
            let profileQuery = UserProfileModel.findOne(query);
            profileQuery = this.#applyProfilePopulation(profileQuery, populate);

            const profile = await profileQuery.exec();

            if (!profile) {
                throw new NotFoundError('Profile not found', 'PROFILE_NOT_FOUND');
            }

            // Check permissions
            if (checkPermissions && requesterId) {
                await this.#checkProfileAccess(profile, requesterId, 'read');
            }

            // Filter private data if needed
            let profileData = profile.toObject();
            if (!includePrivate || (requesterId !== userId)) {
                profileData = this.#filterPrivateProfileData(profileData);
            }

            // Enrich with calculated metrics
            profileData = await this.#enrichProfileWithMetrics(profileData);

            // Record profile view
            if (requesterId && requesterId !== userId) {
                await profile.recordProfileView(requesterId, 'direct');
            }

            // Cache result
            await this.#cacheService.set(cacheKey, profileData, this.#defaultCacheTTL);

            return profileData;
        } catch (error) {
            logger.error('Error fetching profile', {
                error: error.message,
                userId
            });
            throw error;
        }
    }

    /**
     * Update user profile information
     * @param {string} userId - User ID
     * @param {Object} updateData - Profile data to update
     * @param {string} updatedBy - ID of user making update
     * @param {Object} options - Update options
     * @returns {Promise<Object>} Updated profile
     */
    async updateProfile(userId, updateData, updatedBy, options = {}) {
        const session = options.session || null;

        try {
            // Get existing profile
            const profile = await UserProfileModel.findOne({ userId });
            if (!profile) {
                throw new NotFoundError('Profile not found', 'PROFILE_NOT_FOUND');
            }

            // Check permissions
            await this.#checkProfileAccess(profile, updatedBy, 'update');

            // Validate update data
            await this.#validateProfileUpdateData(updateData);

            // Process updates
            const processedUpdate = await this.#processProfileUpdate(updateData, profile, updatedBy);

            // Apply updates
            Object.assign(profile, processedUpdate);
            profile.metadata.lastUpdatedBy = updatedBy;
            profile.metadata.version += 1;

            // Recalculate completeness
            profile.calculateCompleteness();

            await profile.save({ session });

            // Handle media uploads if present
            if (updateData.mediaUploads) {
                await this.#processMediaUploads(userId, updateData.mediaUploads, updatedBy);
            }

            // Send notifications for significant changes
            await this.#sendProfileUpdateNotifications(profile, updateData, updatedBy);

            // Log audit trail
            await this.#auditService.log({
                action: 'PROFILE_UPDATED',
                entityType: 'user_profile',
                entityId: profile._id,
                userId: updatedBy,
                details: {
                    updatedFields: Object.keys(updateData),
                    newCompleteness: profile.analytics.completeness.score
                }
            });

            // Clear caches
            await this.#clearProfileCaches(userId);

            logger.info('Profile updated', {
                profileId: profile._id,
                userId,
                fieldsUpdated: Object.keys(updateData),
                updatedBy
            });

            return profile.toObject();
        } catch (error) {
            logger.error('Error updating profile', {
                error: error.message,
                userId,
                updatedBy
            });
            throw error;
        }
    }

    /**
     * Add work experience to profile
     * @param {string} userId - User ID
     * @param {Object} workData - Work experience data
     * @param {string} addedBy - ID of user adding experience
     * @param {Object} options - Addition options
     * @returns {Promise<Object>} Added work experience
     */
    async addWorkExperience(userId, workData, addedBy, options = {}) {
        const { validateEmployment = false } = options;
        const session = options.session || null;

        try {
            // Get profile
            const profile = await UserProfileModel.findOne({ userId });
            if (!profile) {
                throw new NotFoundError('Profile not found', 'PROFILE_NOT_FOUND');
            }

            // Check permissions
            await this.#checkProfileAccess(profile, addedBy, 'update');

            // Validate work data
            await this.#validateWorkExperienceData(workData);

            // Validate employment if requested
            if (validateEmployment) {
                await this.#validateEmploymentHistory(workData);
            }

            // Add work experience
            const workExperience = await profile.addWorkExperience(workData);

            // Extract and add skills from job description
            if (workData.technologies && workData.technologies.length > 0) {
                await this.#addSkillsFromTechnologies(profile, workData.technologies, addedBy);
            }

            // Send notifications
            await this.#sendWorkExperienceNotifications(profile, workExperience, addedBy);

            // Log audit trail
            await this.#auditService.log({
                action: 'WORK_EXPERIENCE_ADDED',
                entityType: 'user_profile',
                entityId: profile._id,
                userId: addedBy,
                details: {
                    company: workData.company.name,
                    title: workData.title,
                    isCurrent: workData.isCurrent
                }
            });

            // Clear caches
            await this.#clearProfileCaches(userId);

            logger.info('Work experience added', {
                profileId: profile._id,
                userId,
                company: workData.company.name,
                addedBy
            });

            return workExperience;
        } catch (error) {
            logger.error('Error adding work experience', {
                error: error.message,
                userId,
                addedBy
            });
            throw error;
        }
    }

    /**
     * Add education to profile
     * @param {string} userId - User ID
     * @param {Object} educationData - Education data
     * @param {string} addedBy - ID of user adding education
     * @param {Object} options - Addition options
     * @returns {Promise<Object>} Added education
     */
    async addEducation(userId, educationData, addedBy, options = {}) {
        const { verifyInstitution = false } = options;
        const session = options.session || null;

        try {
            // Get profile
            const profile = await UserProfileModel.findOne({ userId });
            if (!profile) {
                throw new NotFoundError('Profile not found', 'PROFILE_NOT_FOUND');
            }

            // Check permissions
            await this.#checkProfileAccess(profile, addedBy, 'update');

            // Validate education data
            await this.#validateEducationData(educationData);

            // Verify institution if requested
            if (verifyInstitution) {
                await this.#verifyEducationalInstitution(educationData.institution);
            }

            // Add education
            if (!profile.education) profile.education = [];

            const education = {
                ...educationData,
                _id: new mongoose.Types.ObjectId()
            };

            profile.education.push(education);

            // Recalculate completeness
            profile.calculateCompleteness();
            await profile.save({ session });

            // Send notifications
            await this.#sendEducationNotifications(profile, education, addedBy);

            // Log audit trail
            await this.#auditService.log({
                action: 'EDUCATION_ADDED',
                entityType: 'user_profile',
                entityId: profile._id,
                userId: addedBy,
                details: {
                    institution: educationData.institution.name,
                    degree: educationData.degree,
                    fieldOfStudy: educationData.fieldOfStudy
                }
            });

            // Clear caches
            await this.#clearProfileCaches(userId);

            logger.info('Education added', {
                profileId: profile._id,
                userId,
                institution: educationData.institution.name,
                addedBy
            });

            return education;
        } catch (error) {
            logger.error('Error adding education', {
                error: error.message,
                userId,
                addedBy
            });
            throw error;
        }
    }

    /**
     * Add or update skill in profile
     * @param {string} userId - User ID
     * @param {Object} skillData - Skill data
     * @param {string} addedBy - ID of user adding skill
     * @param {Object} options - Addition options
     * @returns {Promise<Object>} Added/updated skill
     */
    async addSkill(userId, skillData, addedBy, options = {}) {
        const { category, autoCategory = true } = options;
        const session = options.session || null;

        try {
            // Get profile
            const profile = await UserProfileModel.findOne({ userId });
            if (!profile) {
                throw new NotFoundError('Profile not found', 'PROFILE_NOT_FOUND');
            }

            // Check permissions
            await this.#checkProfileAccess(profile, addedBy, 'update');

            // Validate skill data
            await this.#validateSkillData(skillData);

            // Auto-categorize skill if needed
            if (autoCategory && !skillData.category) {
                skillData.category = this.#categorizeSkill(skillData.name);
            } else if (category) {
                skillData.category = category;
            }

            // Add skill using profile method
            const skill = await profile.addSkill(skillData);

            // Send notifications
            await this.#sendSkillNotifications(profile, skill, addedBy);

            // Log audit trail
            await this.#auditService.log({
                action: 'SKILL_ADDED',
                entityType: 'user_profile',
                entityId: profile._id,
                userId: addedBy,
                details: {
                    skillName: skillData.name,
                    category: skillData.category,
                    level: skillData.level
                }
            });

            // Clear caches
            await this.#clearProfileCaches(userId);

            logger.info('Skill added', {
                profileId: profile._id,
                userId,
                skillName: skillData.name,
                addedBy
            });

            return skill;
        } catch (error) {
            logger.error('Error adding skill', {
                error: error.message,
                userId,
                addedBy
            });
            throw error;
        }
    }

    /**
     * Endorse a user's skill
     * @param {string} userId - User ID whose skill to endorse
     * @param {string} skillName - Name of skill to endorse
     * @param {string} endorserId - ID of user providing endorsement
     * @param {Object} options - Endorsement options
     * @returns {Promise<Object>} Updated skill with endorsement
     */
    async endorseSkill(userId, skillName, endorserId, options = {}) {
        const { relationship, comment } = options;
        const session = options.session || null;

        try {
            // Get profile
            const profile = await UserProfileModel.findOne({ userId });
            if (!profile) {
                throw new NotFoundError('Profile not found', 'PROFILE_NOT_FOUND');
            }

            // Validate endorser
            const endorser = await UserModel.findById(endorserId);
            if (!endorser) {
                throw new NotFoundError('Endorser not found', 'ENDORSER_NOT_FOUND');
            }

            // Check if already endorsed
            const endorsementKey = `${userId}:${skillName}:${endorserId}`;
            if (this.#pendingEndorsements.has(endorsementKey)) {
                throw new ConflictError('Endorsement already in progress', 'ENDORSEMENT_PENDING');
            }

            // Add to pending endorsements
            this.#pendingEndorsements.set(endorsementKey, Date.now());

            try {
                // Endorse skill
                const skill = await profile.endorseSkill(skillName, endorserId);

                // Add relationship context if provided
                if (relationship || comment) {
                    const endorsement = skill.endorsements.find(
                        e => e.userId.toString() === endorserId.toString()
                    );
                    if (endorsement) {
                        endorsement.relationship = relationship;
                        endorsement.comment = comment;
                        await profile.save({ session });
                    }
                }

                // Send notifications
                await this.#sendEndorsementNotifications(profile, skill, endorser);

                // Log audit trail
                await this.#auditService.log({
                    action: 'SKILL_ENDORSED',
                    entityType: 'user_profile',
                    entityId: profile._id,
                    userId: endorserId,
                    details: {
                        skillName,
                        endorsedUserId: userId,
                        relationship
                    }
                });

                // Clear caches
                await this.#clearProfileCaches(userId);

                logger.info('Skill endorsed', {
                    profileId: profile._id,
                    userId,
                    skillName,
                    endorserId
                });

                return skill;
            } finally {
                // Remove from pending endorsements
                this.#pendingEndorsements.delete(endorsementKey);
            }
        } catch (error) {
            logger.error('Error endorsing skill', {
                error: error.message,
                userId,
                skillName,
                endorserId
            });
            throw error;
        }
    }

    /**
     * Add project to portfolio
     * @param {string} userId - User ID
     * @param {Object} projectData - Project data
     * @param {string} addedBy - ID of user adding project
     * @param {Object} options - Addition options
     * @returns {Promise<Object>} Added project
     */
    async addProject(userId, projectData, addedBy, options = {}) {
        const { validateUrls = true } = options;
        const session = options.session || null;

        try {
            // Get profile
            const profile = await UserProfileModel.findOne({ userId });
            if (!profile) {
                throw new NotFoundError('Profile not found', 'PROFILE_NOT_FOUND');
            }

            // Check permissions
            await this.#checkProfileAccess(profile, addedBy, 'update');

            // Validate project data
            await this.#validateProjectData(projectData);

            // Validate URLs if requested
            if (validateUrls) {
                await this.#validateProjectUrls(projectData);
            }

            // Add project
            if (!profile.portfolio.projects) profile.portfolio.projects = [];

            const project = {
                ...projectData,
                _id: new mongoose.Types.ObjectId()
            };

            profile.portfolio.projects.push(project);

            // Add skills from technologies
            if (projectData.technologies && projectData.technologies.length > 0) {
                await this.#addSkillsFromTechnologies(profile, projectData.technologies, addedBy);
            }

            // Recalculate completeness
            profile.calculateCompleteness();
            await profile.save({ session });

            // Send notifications
            await this.#sendProjectNotifications(profile, project, addedBy);

            // Log audit trail
            await this.#auditService.log({
                action: 'PROJECT_ADDED',
                entityType: 'user_profile',
                entityId: profile._id,
                userId: addedBy,
                details: {
                    projectTitle: projectData.title,
                    type: projectData.type,
                    technologies: projectData.technologies
                }
            });

            // Clear caches
            await this.#clearProfileCaches(userId);

            logger.info('Project added', {
                profileId: profile._id,
                userId,
                projectTitle: projectData.title,
                addedBy
            });

            return project;
        } catch (error) {
            logger.error('Error adding project', {
                error: error.message,
                userId,
                addedBy
            });
            throw error;
        }
    }

    /**
     * Add recommendation to profile
     * @param {string} userId - User ID to receive recommendation
     * @param {Object} recommendationData - Recommendation data
     * @param {string} recommenderId - ID of user giving recommendation
     * @param {Object} options - Addition options
     * @returns {Promise<Object>} Added recommendation
     */
    async addRecommendation(userId, recommendationData, recommenderId, options = {}) {
        const { requireApproval = true } = options;
        const session = options.session || null;

        try {
            // Get profile
            const profile = await UserProfileModel.findOne({ userId });
            if (!profile) {
                throw new NotFoundError('Profile not found', 'PROFILE_NOT_FOUND');
            }

            // Validate recommender
            const recommender = await UserModel.findById(recommenderId);
            if (!recommender) {
                throw new NotFoundError('Recommender not found', 'RECOMMENDER_NOT_FOUND');
            }

            // Validate recommendation data
            await this.#validateRecommendationData(recommendationData);

            // Check relationship between users
            await this.#validateRecommendationRelationship(userId, recommenderId);

            // Prepare recommendation
            const recommendation = {
                ...recommendationData,
                fromUserId: recommenderId,
                isVisible: !requireApproval, // Hide until approved if approval required
                _id: new mongoose.Types.ObjectId()
            };

            // Add recommendation
            const addedRecommendation = await profile.addRecommendation(recommendation);

            // Send notifications
            await this.#sendRecommendationNotifications(profile, addedRecommendation, recommender, requireApproval);

            // Log audit trail
            await this.#auditService.log({
                action: 'RECOMMENDATION_ADDED',
                entityType: 'user_profile',
                entityId: profile._id,
                userId: recommenderId,
                details: {
                    recommendedUserId: userId,
                    relationship: recommendationData.relationship,
                    requireApproval
                }
            });

            // Clear caches
            await this.#clearProfileCaches(userId);

            logger.info('Recommendation added', {
                profileId: profile._id,
                userId,
                recommenderId,
                requireApproval
            });

            return addedRecommendation;
        } catch (error) {
            logger.error('Error adding recommendation', {
                error: error.message,
                userId,
                recommenderId
            });
            throw error;
        }
    }

    /**
     * Search profiles with advanced filtering
     * @param {Object} searchParams - Search parameters
     * @param {Object} options - Search options
     * @returns {Promise<Object>} Search results
     */
    async searchProfiles(searchParams, options = {}) {
        const {
            limit = 20,
            offset = 0,
            sortBy = 'analytics.completeness.score',
            sortOrder = 'desc',
            requesterId,
            organizationId
        } = options;

        try {
            // Generate search ID
            const searchId = crypto.randomUUID();
            this.#activeSearches.add(searchId);

            // Build search query
            const query = await this.#buildProfileSearchQuery(searchParams, {
                organizationId,
                requesterId
            });

            // Execute search
            const searchResult = await UserProfileModel.searchProfiles(searchParams.textSearch, {
                organizationId,
                skills: searchParams.skills,
                location: searchParams.location,
                openToOpportunities: searchParams.openToOpportunities,
                minExperience: searchParams.minExperience,
                limit,
                skip: offset,
                sort: { [sortBy]: sortOrder === 'desc' ? -1 : 1 }
            });

            // Enrich profiles with metrics
            const enrichedProfiles = await Promise.all(
                searchResult.profiles.map(profile => this.#enrichProfileWithMetrics(profile.toObject()))
            );

            // Calculate search analytics
            const searchAnalytics = this.#calculateSearchAnalytics(searchResult, searchParams);

            // Clean up search tracking
            this.#activeSearches.delete(searchId);

            // Log search activity
            logger.info('Profile search completed', {
                searchId,
                query: searchParams,
                totalResults: searchResult.total,
                requesterId
            });

            return {
                profiles: enrichedProfiles,
                pagination: {
                    totalCount: searchResult.total,
                    totalPages: Math.ceil(searchResult.total / limit),
                    currentPage: Math.floor(offset / limit) + 1,
                    hasMore: searchResult.hasMore,
                    limit,
                    offset
                },
                analytics: searchAnalytics,
                searchId
            };
        } catch (error) {
            logger.error('Error searching profiles', {
                error: error.message,
                searchParams,
                requesterId
            });
            throw error;
        }
    }

    /**
     * Generate resume/CV from profile
     * @param {string} userId - User ID
     * @param {string} format - Export format (pdf, word, json)
     * @param {Object} options - Export options
     * @returns {Promise<Buffer>} Generated resume
     */
    async generateResume(userId, format = 'pdf', options = {}) {
        const {
            template = 'professional',
            sections = ['personal', 'experience', 'education', 'skills'],
            requesterId
        } = options;

        try {
            // Get profile
            const profile = await this.getProfile(userId, {
                includePrivate: userId === requesterId,
                requesterId
            });

            // Validate format
            if (!this.#exportFormats[format]) {
                throw new ValidationError('Unsupported export format', 'UNSUPPORTED_FORMAT');
            }

            // Prepare resume data
            const resumeData = this.#prepareResumeData(profile, sections);

            let resumeBuffer;

            // Generate resume based on format
            switch (format) {
                case 'pdf':
                    resumeBuffer = await this.#generatePdfResume(resumeData, template);
                    break;
                case 'word':
                    resumeBuffer = await this.#generateWordResume(resumeData, template);
                    break;
                case 'json':
                    resumeBuffer = Buffer.from(JSON.stringify(resumeData, null, 2));
                    break;
                case 'linkedin':
                    resumeBuffer = Buffer.from(this.#generateLinkedInFormat(resumeData));
                    break;
                default:
                    throw new ValidationError('Unsupported format', 'UNSUPPORTED_FORMAT');
            }

            // Log export activity
            await this.#auditService.log({
                action: 'RESUME_GENERATED',
                entityType: 'user_profile',
                entityId: profile._id,
                userId: requesterId || userId,
                details: {
                    format,
                    template,
                    sections
                }
            });

            logger.info('Resume generated', {
                userId,
                format,
                template,
                requesterId
            });

            return resumeBuffer;
        } catch (error) {
            logger.error('Error generating resume', {
                error: error.message,
                userId,
                format,
                requesterId
            });
            throw error;
        }
    }

    /**
     * Import profile data from LinkedIn
     * @param {string} userId - User ID
     * @param {Object} linkedInData - LinkedIn profile data
     * @param {string} importedBy - ID of user performing import
     * @param {Object} options - Import options
     * @returns {Promise<Object>} Import results
     */
    async importFromLinkedIn(userId, linkedInData, importedBy, options = {}) {
        const { mergeStrategy = 'merge', preserveExisting = true } = options;
        const session = options.session || null;

        try {
            // Validate LinkedIn data
            await this.#validateLinkedInData(linkedInData);

            // Get existing profile
            let profile = await UserProfileModel.findOne({ userId });

            if (!profile) {
                // Create new profile
                profile = await this.createProfile(userId, {}, importedBy);
            }

            // Process LinkedIn import
            const importResults = await UserProfileModel.bulkImportFromLinkedIn(linkedInData, userId);

            // Merge strategies
            if (mergeStrategy === 'merge' && preserveExisting) {
                await this.#mergeLinkedInData(profile, linkedInData, importedBy);
            } else if (mergeStrategy === 'replace') {
                await this.#replaceWithLinkedInData(profile, linkedInData, importedBy);
            }

            // Process imported skills
            if (linkedInData.skills) {
                await this.#processImportedSkills(profile, linkedInData.skills, importedBy);
            }

            // Update metadata
            profile.metadata.importedFrom = 'linkedin';
            profile.metadata.lastUpdatedBy = importedBy;
            await profile.save({ session });

            // Send notifications
            await this.#sendImportNotifications(profile, 'linkedin', importedBy);

            // Log audit trail
            await this.#auditService.log({
                action: 'LINKEDIN_IMPORT',
                entityType: 'user_profile',
                entityId: profile._id,
                userId: importedBy,
                details: {
                    mergeStrategy,
                    preserveExisting,
                    importedFields: Object.keys(linkedInData)
                }
            });

            // Clear caches
            await this.#clearProfileCaches(userId);

            logger.info('LinkedIn import completed', {
                profileId: profile._id,
                userId,
                mergeStrategy,
                importedBy
            });

            return {
                success: true,
                profile: profile.toObject(),
                importResults
            };
        } catch (error) {
            logger.error('Error importing from LinkedIn', {
                error: error.message,
                userId,
                importedBy
            });
            throw error;
        }
    }

    /**
     * Get profile analytics and insights
     * @param {string} userId - User ID
     * @param {Object} options - Analytics options
     * @returns {Promise<Object>} Profile analytics
     */
    async getProfileAnalytics(userId, options = {}) {
        const { timeRange = '30d', includeComparisons = true, requesterId } = options;

        try {
            // Check permissions
            if (requesterId !== userId) {
                const profile = await UserProfileModel.findOne({ userId });
                if (profile) {
                    await this.#checkProfileAccess(profile, requesterId, 'read');
                }
            }

            // Check cache
            const cacheKey = this.#generateCacheKey('analytics', userId, options);
            const cached = await this.#cacheService.get(cacheKey);
            if (cached) {
                return cached;
            }

            // Get profile
            const profile = await UserProfileModel.findOne({ userId });
            if (!profile) {
                throw new NotFoundError('Profile not found', 'PROFILE_NOT_FOUND');
            }

            // Calculate analytics
            const analytics = {
                overview: {
                    completenessScore: profile.analytics.completeness.score,
                    profileViews: this.#calculateProfileViews(profile, timeRange),
                    endorsements: profile.analytics.engagement.endorsementsReceived,
                    recommendations: profile.analytics.engagement.recommendationsReceived,
                    connections: profile.analytics.engagement.connectionsCount
                },
                timeline: this.#buildActivityTimeline(profile, timeRange),
                skills: this.#analyzeSkillsData(profile),
                engagement: this.#calculateEngagementMetrics(profile, timeRange)
            };

            // Add comparisons if requested
            if (includeComparisons && profile.organizationId) {
                analytics.comparisons = await this.#getProfileComparisons(profile);
            }

            // Cache results
            await this.#cacheService.set(cacheKey, analytics, 1800); // 30 minutes

            return analytics;
        } catch (error) {
            logger.error('Error getting profile analytics', {
                error: error.message,
                userId,
                requesterId
            });
            throw error;
        }
    }

    /**
     * Bulk update skills with market data
     * @param {string} userId - User ID
     * @param {Array} skills - Skills to update
     * @param {string} updatedBy - ID of user making update
     * @param {Object} options - Update options
     * @returns {Promise<Object>} Update results
     */
    async bulkUpdateSkills(userId, skills, updatedBy, options = {}) {
        const { includeMarketData = true, validateSkills = true } = options;
        const session = options.session || null;

        try {
            // Get profile
            const profile = await UserProfileModel.findOne({ userId });
            if (!profile) {
                throw new NotFoundError('Profile not found', 'PROFILE_NOT_FOUND');
            }

            // Check permissions
            await this.#checkProfileAccess(profile, updatedBy, 'update');

            const results = {
                successful: [],
                failed: [],
                updated: [],
                added: []
            };

            // Process each skill
            for (const skillData of skills) {
                try {
                    if (validateSkills) {
                        await this.#validateSkillData(skillData);
                    }

                    // Check if skill exists
                    const existingSkill = profile.professional.skills.technical.find(
                        s => s.name.toLowerCase() === skillData.name.toLowerCase()
                    );

                    if (existingSkill) {
                        // Update existing skill
                        Object.assign(existingSkill, skillData);
                        results.updated.push(skillData.name);
                    } else {
                        // Add new skill
                        await profile.addSkill(skillData);
                        results.added.push(skillData.name);
                    }

                    results.successful.push(skillData.name);
                } catch (error) {
                    results.failed.push({
                        skill: skillData.name,
                        error: error.message
                    });
                }
            }

            // Add market data if requested
            if (includeMarketData) {
                await this.#enrichSkillsWithMarketData(profile.professional.skills.technical);
            }

            await profile.save({ session });

            // Log audit trail
            await this.#auditService.log({
                action: 'SKILLS_BULK_UPDATE',
                entityType: 'user_profile',
                entityId: profile._id,
                userId: updatedBy,
                details: {
                    successful: results.successful.length,
                    failed: results.failed.length,
                    includeMarketData
                }
            });

            // Clear caches
            await this.#clearProfileCaches(userId);

            logger.info('Bulk skills update completed', {
                profileId: profile._id,
                userId,
                successful: results.successful.length,
                failed: results.failed.length,
                updatedBy
            });

            return results;
        } catch (error) {
            logger.error('Error in bulk skills update', {
                error: error.message,
                userId,
                updatedBy
            });
            throw error;
        }
    }

    // ==================== PRIVATE METHODS ====================

    /**
     * Setup cleanup intervals
     * @private
     */
    #setupCleanupIntervals() {
        // Clear pending endorsements every 5 minutes
        setInterval(() => {
            const now = Date.now();
            for (const [key, timestamp] of this.#pendingEndorsements) {
                if (now - timestamp > 300000) { // 5 minutes
                    this.#pendingEndorsements.delete(key);
                }
            }
        }, 300000);

        // Clear profile metrics cache every hour
        setInterval(() => {
            this.#profileMetricsCache.clear();
        }, 3600000);

        // Clean up active searches every 10 minutes
        setInterval(() => {
            if (this.#activeSearches.size > 50) {
                this.#activeSearches.clear();
            }
        }, 600000);
    }

    /**
     * Validate profile data
     * @private
     * @param {Object} profileData - Profile data to validate
     */
    async #validateProfileData(profileData) {
        if (profileData.personal?.contact?.emails) {
            for (const email of profileData.personal.contact.emails) {
                if (email.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.email)) {
                    throw new ValidationError(`Invalid email: ${email.email}`, 'INVALID_EMAIL');
                }
            }
        }

        if (profileData.personal?.contact?.websites) {
            for (const website of profileData.personal.contact.websites) {
                if (website.url && !this.#isValidUrl(website.url)) {
                    throw new ValidationError(`Invalid URL: ${website.url}`, 'INVALID_URL');
                }
            }
        }
    }

    /**
     * Enrich profile data with defaults
     * @private
     * @param {Object} profileData - Original profile data
     * @param {Object} user - User object
     * @param {string} createdBy - ID of user creating profile
     * @returns {Promise<Object>} Enriched profile data
     */
    async #enrichProfileData(profileData, user, createdBy) {
        const enriched = { ...profileData };

        // Set personal information from user if not provided
        if (!enriched.personal) {
            enriched.personal = {};
        }

        if (!enriched.personal.fullName && user.profile) {
            enriched.personal.fullName = `${user.profile.firstName} ${user.profile.lastName}`;
        }

        if (!enriched.personal.contact) {
            enriched.personal.contact = {
                emails: [{ type: 'personal', email: user.email, isPublic: false }],
                phones: [],
                websites: []
            };
        }

        // Set default preferences
        if (!enriched.preferences) {
            enriched.preferences = {
                visibility: {
                    profile: 'organization',
                    email: 'private',
                    phone: 'private',
                    location: 'organization'
                },
                openTo: {
                    opportunities: false,
                    types: [],
                    remoteOnly: false
                }
            };
        }

        // Initialize empty arrays for required fields
        if (!enriched.professional) {
            enriched.professional = {
                workHistory: [],
                skills: { technical: [], soft: [], tools: [] },
                certifications: [],
                memberships: [],
                publications: [],
                patents: []
            };
        }

        if (!enriched.education) enriched.education = [];
        if (!enriched.portfolio) {
            enriched.portfolio = {
                projects: [],
                achievements: [],
                media: { photos: [], videos: [], documents: [] }
            };
        }

        if (!enriched.social) {
            enriched.social = {
                profiles: [],
                connections: [],
                recommendations: []
            };
        }

        return enriched;
    }

    /**
     * Apply population to profile query
     * @private
     * @param {Query} query - Mongoose query
     * @param {Array} populate - Population options
     * @returns {Query} Modified query
     */
    #applyProfilePopulation(query, populate) {
        if (populate.includes('user')) {
            query = query.populate('userId', 'email profile.firstName profile.lastName profile.avatar');
        }

        if (populate.includes('connections')) {
            query = query.populate('social.connections.userId', 'profile.firstName profile.lastName profile.avatar');
        }

        if (populate.includes('recommendations')) {
            query = query.populate('social.recommendations.fromUserId', 'profile.firstName profile.lastName profile.avatar');
        }

        return query;
    }

    /**
     * Check profile access permissions
     * @private
     * @param {Object} profile - Profile object
     * @param {string} requesterId - ID of user requesting access
     * @param {string} operation - Operation type
     */
    async #checkProfileAccess(profile, requesterId, operation) {
        // Owner always has access
        if (profile.userId.toString() === requesterId) {
            return;
        }

        // Check visibility settings
        const visibility = profile.preferences?.visibility?.profile || 'private';

        if (visibility === 'private') {
            throw new ForbiddenError('Profile is private', 'PRIVATE_PROFILE');
        }

        if (visibility === 'organization' || visibility === 'connections') {
            // Check if requester is in same organization
            const user = await UserModel.findById(profile.userId);
            const requester = await UserModel.findById(requesterId);

            if (!user || !requester) {
                throw new ForbiddenError('Access denied', 'ACCESS_DENIED');
            }

            const hasSharedOrg = user.organizations.some(userOrg =>
                requester.organizations.some(reqOrg =>
                    reqOrg.organizationId.toString() === userOrg.organizationId.toString()
                )
            );

            if (!hasSharedOrg) {
                throw new ForbiddenError('No shared organization access', 'NO_SHARED_ACCESS');
            }
        }

        // For update operations, need additional checks
        if (operation === 'update') {
            const requester = await UserModel.findById(requesterId);
            const requesterRoles = requester.organizations.flatMap(org => org.roles.map(r => r.roleName));
            const hasAdminRole = requesterRoles.some(role => ['admin', 'manager'].includes(role));

            if (!hasAdminRole) {
                throw new ForbiddenError('Insufficient permissions for update', 'INSUFFICIENT_PERMISSIONS');
            }
        }
    }

    /**
     * Filter private profile data
     * @private
     * @param {Object} profileData - Profile data to filter
     * @returns {Object} Filtered profile data
     */
    #filterPrivateProfileData(profileData) {
        const filtered = { ...profileData };

        // Remove private contact information
        if (filtered.personal?.contact) {
            filtered.personal.contact.emails = filtered.personal.contact.emails?.filter(email => email.isPublic) || [];
            filtered.personal.contact.phones = filtered.personal.contact.phones?.filter(phone => phone.isPublic) || [];
        }

        // Remove private addresses
        if (filtered.personal?.addresses) {
            filtered.personal.addresses = filtered.personal.addresses.filter(addr => addr.isPublic);
        }

        // Remove sensitive analytics
        if (filtered.analytics?.profileViews) {
            delete filtered.analytics.profileViews.viewers;
        }

        return filtered;
    }

    /**
     * Enrich profile with calculated metrics
     * @private
     * @param {Object} profile - Profile object
     * @returns {Promise<Object>} Enriched profile
     */
    async #enrichProfileWithMetrics(profile) {
        const cacheKey = `metrics:${profile.userId}`;
        let metrics = this.#profileMetricsCache.get(cacheKey);

        if (!metrics) {
            metrics = {
                completenessScore: profile.analytics?.completeness?.score || 0,
                totalExperience: this.#calculateTotalExperience(profile),
                skillsCount: profile.professional?.skills?.technical?.length || 0,
                endorsementsCount: this.#countEndorsements(profile),
                recommendationsCount: profile.social?.recommendations?.length || 0,
                projectsCount: profile.portfolio?.projects?.length || 0,
                connectionsCount: profile.social?.connections?.length || 0,
                profileViews: profile.analytics?.profileViews?.total || 0,
                lastActivityDays: this.#calculateLastActivityDays(profile)
            };

            // Cache for 10 minutes
            this.#profileMetricsCache.set(cacheKey, metrics);
            setTimeout(() => this.#profileMetricsCache.delete(cacheKey), 600000);
        }

        return {
            ...profile,
            calculatedMetrics: metrics
        };
    }

    /**
     * Calculate total work experience in years
     * @private
     * @param {Object} profile - Profile object
     * @returns {number} Total experience in years
     */
    #calculateTotalExperience(profile) {
        if (!profile.professional?.workHistory) return 0;

        let totalMonths = 0;
        for (const job of profile.professional.workHistory) {
            if (job.startDate) {
                const startDate = new Date(job.startDate);
                const endDate = job.endDate ? new Date(job.endDate) : new Date();
                const months = (endDate.getFullYear() - startDate.getFullYear()) * 12 +
                    (endDate.getMonth() - startDate.getMonth());
                totalMonths += Math.max(0, months);
            }
        }

        return Math.round(totalMonths / 12 * 10) / 10; // Round to 1 decimal
    }

    /**
     * Count total endorsements across all skills
     * @private
     * @param {Object} profile - Profile object
     * @returns {number} Total endorsements count
     */
    #countEndorsements(profile) {
        if (!profile.professional?.skills?.technical) return 0;

        return profile.professional.skills.technical.reduce((total, skill) => {
            return total + (skill.endorsements?.length || 0);
        }, 0);
    }

    /**
     * Calculate days since last activity
     * @private
     * @param {Object} profile - Profile object
     * @returns {number} Days since last activity
     */
    #calculateLastActivityDays(profile) {
        const lastUpdate = profile.updatedAt || profile.createdAt;
        if (!lastUpdate) return 0;

        const daysDiff = Math.floor((Date.now() - new Date(lastUpdate)) / (1000 * 60 * 60 * 24));
        return daysDiff;
    }

    /**
     * Generate cache key for profile data
     * @private
     * @param {string} type - Cache type
     * @param {string} identifier - Unique identifier
     * @param {Object} options - Options for key generation
     * @returns {string} Cache key
     */
    #generateCacheKey(type, identifier, options = {}) {
        const baseKey = `profile:${type}:${identifier}`;

        if (Object.keys(options).length === 0) {
            return baseKey;
        }

        const optionsHash = crypto
            .createHash('md5')
            .update(JSON.stringify(options))
            .digest('hex')
            .substring(0, 8);

        return `${baseKey}:${optionsHash}`;
    }

    /**
     * Clear profile-related caches
     * @private
     * @param {string} userId - User ID
     */
    async #clearProfileCaches(userId) {
        const patterns = [
            `profile:*:${userId}:*`,
            `profile:analytics:${userId}:*`,
            `profile:search:*`
        ];

        for (const pattern of patterns) {
            await this.#cacheService.deletePattern(pattern);
        }
    }

    /**
     * Validate work experience data
     * @private
     * @param {Object} workData - Work experience data
     */
    async #validateWorkExperienceData(workData) {
        if (!workData.company?.name) {
            throw new ValidationError('Company name is required', 'COMPANY_NAME_REQUIRED');
        }

        if (!workData.title) {
            throw new ValidationError('Job title is required', 'TITLE_REQUIRED');
        }

        if (!workData.startDate) {
            throw new ValidationError('Start date is required', 'START_DATE_REQUIRED');
        }

        // Validate dates
        const startDate = new Date(workData.startDate);
        const endDate = workData.endDate ? new Date(workData.endDate) : null;

        if (endDate && endDate <= startDate) {
            throw new ValidationError('End date must be after start date', 'INVALID_DATE_RANGE');
        }

        if (startDate > new Date()) {
            throw new ValidationError('Start date cannot be in the future', 'FUTURE_START_DATE');
        }
    }

    /**
     * Validate skill data
     * @private
     * @param {Object} skillData - Skill data to validate
     */
    async #validateSkillData(skillData) {
        if (!skillData.name) {
            throw new ValidationError('Skill name is required', 'SKILL_NAME_REQUIRED');
        }

        if (skillData.level && !['beginner', 'intermediate', 'advanced', 'expert'].includes(skillData.level)) {
            throw new ValidationError('Invalid skill level', 'INVALID_SKILL_LEVEL');
        }

        if (skillData.yearsOfExperience && (skillData.yearsOfExperience < 0 || skillData.yearsOfExperience > 50)) {
            throw new ValidationError('Invalid years of experience', 'INVALID_EXPERIENCE_YEARS');
        }
    }

    /**
     * Categorize skill automatically
     * @private
     * @param {string} skillName - Name of skill to categorize
     * @returns {string} Skill category
     */
    #categorizeSkill(skillName) {
        const normalizedSkill = skillName.toLowerCase();

        for (const [category, skills] of Object.entries(this.#skillCategories)) {
            if (skills.some(skill => normalizedSkill.includes(skill))) {
                return category;
            }
        }

        // Check for common patterns
        if (/javascript|python|java|c\+\+|php|ruby|go|rust/.test(normalizedSkill)) {
            return 'technical';
        }

        if (/management|leadership|strategy|planning/.test(normalizedSkill)) {
            return 'functional';
        }

        return 'technical'; // Default category
    }

    /**
     * Validate URL format
     * @private
     * @param {string} url - URL to validate
     * @returns {boolean} Is valid URL
     */
    #isValidUrl(url) {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Send profile creation notifications
     * @private
     * @param {Object} profile - Created profile
     * @param {string} createdBy - ID of user who created profile
     */
    async #sendProfileCreationNotifications(profile, createdBy) {
        try {
            // Send welcome notification
            await this.#notificationService.sendNotification({
                type: 'PROFILE_CREATED',
                recipients: [profile.userId.toString()],
                data: {
                    profileId: profile._id,
                    completenessScore: profile.analytics.completeness.score
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
     * Add skills from technologies array
     * @private
     * @param {Object} profile - Profile object
     * @param {Array} technologies - Technologies to add as skills
     * @param {string} addedBy - ID of user adding skills
     */
    async #addSkillsFromTechnologies(profile, technologies, addedBy) {
        for (const tech of technologies) {
            try {
                const skillData = {
                    name: tech,
                    category: this.#categorizeSkill(tech),
                    level: 'intermediate' // Default level
                };

                await profile.addSkill(skillData);
            } catch (error) {
                // Skill might already exist, continue with others
                logger.debug('Skill already exists or invalid', { skill: tech, error: error.message });
            }
        }
    }

    /**
     * Send skill-related notifications
     * @private
     * @param {Object} profile - Profile object
     * @param {Object} skill - Added skill
     * @param {string} addedBy - ID of user who added skill
     */
    async #sendSkillNotifications(profile, skill, addedBy) {
        try {
            // Notify user if skill was added by someone else
            if (addedBy !== profile.userId.toString()) {
                await this.#notificationService.sendNotification({
                    type: 'SKILL_ADDED',
                    recipients: [profile.userId.toString()],
                    data: {
                        skillName: skill.name,
                        addedBy
                    }
                });
            }
        } catch (error) {
            logger.warn('Failed to send skill notifications', {
                profileId: profile._id,
                skillName: skill.name,
                error: error.message
            });
        }
    }

    /**
     * Prepare resume data from profile
     * @private
     * @param {Object} profile - Profile object
     * @param {Array} sections - Sections to include
     * @returns {Object} Resume data
     */
    #prepareResumeData(profile, sections) {
        const resumeData = {};

        if (sections.includes('personal')) {
            resumeData.personal = {
                name: profile.personal?.fullName || 'N/A',
                headline: profile.personal?.headline,
                summary: profile.personal?.summary,
                email: profile.personal?.contact?.emails?.find(e => e.type === 'personal')?.email,
                phone: profile.personal?.contact?.phones?.find(p => p.type === 'mobile')?.number,
                location: profile.personal?.addresses?.find(a => a.isPrimary)
            };
        }

        if (sections.includes('experience')) {
            resumeData.experience = profile.professional?.workHistory?.map(job => ({
                company: job.company.name,
                title: job.title,
                duration: this.#formatDateRange(job.startDate, job.endDate),
                description: job.description,
                achievements: job.achievements || [],
                technologies: job.technologies || []
            })) || [];
        }

        if (sections.includes('education')) {
            resumeData.education = profile.education?.map(edu => ({
                institution: edu.institution.name,
                degree: edu.degree,
                fieldOfStudy: edu.fieldOfStudy,
                duration: this.#formatDateRange(edu.startDate, edu.endDate),
                achievements: edu.achievements || []
            })) || [];
        }

        if (sections.includes('skills')) {
            resumeData.skills = {
                technical: profile.professional?.skills?.technical?.map(s => s.name) || [],
                soft: profile.professional?.skills?.soft?.map(s => s.name) || [],
                tools: profile.professional?.skills?.tools?.map(s => s.name) || []
            };
        }

        return resumeData;
    }

    /**
     * Format date range for display
     * @private
     * @param {Date} startDate - Start date
     * @param {Date} endDate - End date
     * @returns {string} Formatted date range
     */
    #formatDateRange(startDate, endDate) {
        const start = new Date(startDate).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short'
        });

        const end = endDate ?
            new Date(endDate).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short'
            }) : 'Present';

        return `${start} - ${end}`;
    }

    /**
     * Generate PDF resume
     * @private
     * @param {Object} resumeData - Resume data
     * @param {string} template - Template name
     * @returns {Promise<Buffer>} PDF buffer
     */
    async #generatePdfResume(resumeData, template) {
        return new Promise((resolve, reject) => {
            try {
                const doc = new PDFDocument();
                const buffers = [];

                doc.on('data', buffers.push.bind(buffers));
                doc.on('end', () => {
                    const pdfBuffer = Buffer.concat(buffers);
                    resolve(pdfBuffer);
                });

                // Generate PDF content based on template
                this.#renderPdfTemplate(doc, resumeData, template);

                doc.end();
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Render PDF template
     * @private
     * @param {PDFDocument} doc - PDF document
     * @param {Object} resumeData - Resume data
     * @param {string} template - Template name
     */
    #renderPdfTemplate(doc, resumeData, template) {
        // Header
        doc.fontSize(20).text(resumeData.personal.name, 50, 50);

        if (resumeData.personal.headline) {
            doc.fontSize(12).text(resumeData.personal.headline, 50, 80);
        }

        // Contact information
        let yPosition = 110;
        if (resumeData.personal.email) {
            doc.fontSize(10).text(`Email: ${resumeData.personal.email}`, 50, yPosition);
            yPosition += 15;
        }

        if (resumeData.personal.phone) {
            doc.text(`Phone: ${resumeData.personal.phone}`, 50, yPosition);
            yPosition += 15;
        }

        yPosition += 20;

        // Summary
        if (resumeData.personal.summary) {
            doc.fontSize(14).text('Summary', 50, yPosition);
            yPosition += 20;
            doc.fontSize(10).text(resumeData.personal.summary, 50, yPosition, { width: 500 });
            yPosition += 60;
        }

        // Experience
        if (resumeData.experience && resumeData.experience.length > 0) {
            doc.fontSize(14).text('Experience', 50, yPosition);
            yPosition += 20;

            for (const job of resumeData.experience) {
                doc.fontSize(12).text(`${job.title} at ${job.company}`, 50, yPosition);
                yPosition += 15;
                doc.fontSize(10).text(job.duration, 50, yPosition);
                yPosition += 15;

                if (job.description) {
                    doc.text(job.description, 50, yPosition, { width: 500 });
                    yPosition += 40;
                }

                yPosition += 10;
            }
        }

        // Skills
        if (resumeData.skills) {
            doc.fontSize(14).text('Skills', 50, yPosition);
            yPosition += 20;

            if (resumeData.skills.technical.length > 0) {
                doc.fontSize(12).text('Technical Skills:', 50, yPosition);
                yPosition += 15;
                doc.fontSize(10).text(resumeData.skills.technical.join(', '), 50, yPosition, { width: 500 });
                yPosition += 30;
            }
        }
    }

    /**
     * Validate profile update data
     * @private
     * @param {Object} updateData - Data to validate
     * @throws {ValidationError} If validation fails
     */
    async #validateProfileUpdateData(updateData) {
        // Validate contact information updates
        if (updateData.personal?.contact?.emails) {
            for (const email of updateData.personal.contact.emails) {
                if (email.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.email)) {
                    throw new ValidationError(`Invalid email format: ${email.email}`, 'INVALID_EMAIL_FORMAT');
                }
            }
        }

        // Validate phone numbers
        if (updateData.personal?.contact?.phones) {
            for (const phone of updateData.personal.contact.phones) {
                if (phone.number && !/^[\+]?[1-9][\d]{0,15}$/.test(phone.number.replace(/[\s\-\(\)]/g, ''))) {
                    throw new ValidationError(`Invalid phone format: ${phone.number}`, 'INVALID_PHONE_FORMAT');
                }
            }
        }

        // Validate URLs
        if (updateData.personal?.contact?.websites) {
            for (const website of updateData.personal.contact.websites) {
                if (website.url && !this.#isValidUrl(website.url)) {
                    throw new ValidationError(`Invalid URL: ${website.url}`, 'INVALID_URL');
                }
            }
        }

        // Validate social media profiles
        if (updateData.social?.profiles) {
            for (const profile of updateData.social.profiles) {
                if (profile.url && !this.#isValidUrl(profile.url)) {
                    throw new ValidationError(`Invalid social profile URL: ${profile.url}`, 'INVALID_SOCIAL_URL');
                }
            }
        }

        // Validate headline length
        if (updateData.personal?.headline && updateData.personal.headline.length > 220) {
            throw new ValidationError('Headline must be 220 characters or less', 'HEADLINE_TOO_LONG');
        }

        // Validate summary length
        if (updateData.personal?.summary && updateData.personal.summary.length > 2000) {
            throw new ValidationError('Summary must be 2000 characters or less', 'SUMMARY_TOO_LONG');
        }
    }

    /**
     * Process profile update data with business logic
     * @private
     * @param {Object} updateData - Raw update data
     * @param {Object} existingProfile - Existing profile
     * @param {string} updatedBy - ID of user making update
     * @returns {Promise<Object>} Processed update data
     */
    async #processProfileUpdate(updateData, existingProfile, updatedBy) {
        const processed = { ...updateData };

        // Handle visibility changes
        if (processed.preferences?.visibility) {
            // Log visibility changes for audit
            const oldVisibility = existingProfile.preferences?.visibility;
            const newVisibility = processed.preferences.visibility;

            if (JSON.stringify(oldVisibility) !== JSON.stringify(newVisibility)) {
                await this.#auditService.log({
                    action: 'PROFILE_VISIBILITY_CHANGED',
                    entityType: 'user_profile',
                    entityId: existingProfile._id,
                    userId: updatedBy,
                    details: { oldVisibility, newVisibility }
                });
            }
        }

        // Process contact information updates
        if (processed.personal?.contact) {
            // Mark new emails as unverified
            if (processed.personal.contact.emails) {
                for (const email of processed.personal.contact.emails) {
                    if (!existingProfile.personal?.contact?.emails?.find(e => e.email === email.email)) {
                        email.isVerified = false;
                        email.verificationToken = crypto.randomBytes(32).toString('hex');
                    }
                }
            }
        }

        // Update timestamps
        processed.lastModifiedAt = new Date();
        processed.lastModifiedBy = updatedBy;

        return processed;
    }

    /**
     * Process media uploads for profile
     * @private
     * @param {string} userId - User ID
     * @param {Array} mediaUploads - Media files to process
     * @param {string} uploadedBy - ID of user uploading media
     */
    async #processMediaUploads(userId, mediaUploads, uploadedBy) {
        const processPromises = mediaUploads.map(async (media) => {
            const mediaId = crypto.randomUUID();
            this.#mediaProcessingQueue.set(mediaId, {
                userId,
                media,
                uploadedBy,
                status: 'processing',
                startTime: Date.now()
            });

            try {
                if (media.type === 'image') {
                    await this.#processImageUpload(media, userId);
                } else if (media.type === 'video') {
                    await this.#processVideoUpload(media, userId);
                } else if (media.type === 'document') {
                    await this.#processDocumentUpload(media, userId);
                }

                this.#mediaProcessingQueue.set(mediaId, {
                    ...this.#mediaProcessingQueue.get(mediaId),
                    status: 'completed'
                });
            } catch (error) {
                this.#mediaProcessingQueue.set(mediaId, {
                    ...this.#mediaProcessingQueue.get(mediaId),
                    status: 'failed',
                    error: error.message
                });
                throw error;
            }
        });

        await Promise.all(processPromises);
    }

    /**
     * Send profile update notifications
     * @private
     * @param {Object} profile - Updated profile
     * @param {Object} updateData - Update data
     * @param {string} updatedBy - ID of user who made update
     */
    async #sendProfileUpdateNotifications(profile, updateData, updatedBy) {
        try {
            const significantFields = ['personal.headline', 'professional.workHistory', 'education'];
            const updatedFields = Object.keys(updateData);

            const hasSignificantChanges = significantFields.some(field =>
                updatedFields.some(updated => updated.startsWith(field))
            );

            if (hasSignificantChanges) {
                // Notify user if updated by someone else
                if (updatedBy !== profile.userId.toString()) {
                    await this.#notificationService.sendNotification({
                        type: 'PROFILE_UPDATED_BY_OTHER',
                        recipients: [profile.userId.toString()],
                        data: {
                            updatedBy,
                            fields: updatedFields
                        }
                    });
                }

                // Notify connections about significant updates
                if (profile.social?.connections?.length > 0) {
                    const connectionIds = profile.social.connections
                        .filter(conn => conn.status === 'accepted')
                        .map(conn => conn.userId.toString())
                        .slice(0, 10); // Limit to first 10 connections

                    if (connectionIds.length > 0) {
                        await this.#notificationService.sendNotification({
                            type: 'CONNECTION_PROFILE_UPDATED',
                            recipients: connectionIds,
                            data: {
                                profileUserId: profile.userId,
                                userName: profile.personal?.fullName
                            }
                        });
                    }
                }
            }
        } catch (error) {
            logger.warn('Failed to send profile update notifications', {
                profileId: profile._id,
                error: error.message
            });
        }
    }

    /**
     * Validate employment history
     * @private
     * @param {Object} workData - Work experience data to validate
     */
    async #validateEmploymentHistory(workData) {
        // This would integrate with employment verification services
        // For now, perform basic validation

        if (workData.company?.website) {
            try {
                // Could validate company website exists
                const isValidDomain = this.#isValidUrl(workData.company.website);
                if (!isValidDomain) {
                    logger.warn('Invalid company website provided', {
                        company: workData.company.name,
                        website: workData.company.website
                    });
                }
            } catch (error) {
                logger.warn('Employment validation failed', {
                    company: workData.company.name,
                    error: error.message
                });
            }
        }

        // Validate employment duration isn't unreasonably long
        if (workData.startDate && workData.endDate) {
            const startDate = new Date(workData.startDate);
            const endDate = new Date(workData.endDate);
            const yearsOfExperience = (endDate - startDate) / (1000 * 60 * 60 * 24 * 365);

            if (yearsOfExperience > 50) {
                throw new ValidationError('Employment duration exceeds reasonable limits', 'INVALID_EMPLOYMENT_DURATION');
            }
        }
    }

    /**
     * Send work experience notifications
     * @private
     * @param {Object} profile - Profile object
     * @param {Object} workExperience - Added work experience
     * @param {string} addedBy - ID of user who added experience
     */
    async #sendWorkExperienceNotifications(profile, workExperience, addedBy) {
        try {
            // Notify user if added by someone else
            if (addedBy !== profile.userId.toString()) {
                await this.#notificationService.sendNotification({
                    type: 'WORK_EXPERIENCE_ADDED',
                    recipients: [profile.userId.toString()],
                    data: {
                        company: workExperience.company.name,
                        title: workExperience.title,
                        addedBy
                    }
                });
            }

            // Notify connections about new experience
            if (profile.social?.connections?.length > 0) {
                const connectionIds = profile.social.connections
                    .filter(conn => conn.status === 'accepted')
                    .map(conn => conn.userId.toString())
                    .slice(0, 5); // Limit notifications

                if (connectionIds.length > 0) {
                    await this.#notificationService.sendNotification({
                        type: 'CONNECTION_NEW_EXPERIENCE',
                        recipients: connectionIds,
                        data: {
                            profileUserId: profile.userId,
                            userName: profile.personal?.fullName,
                            company: workExperience.company.name,
                            title: workExperience.title
                        }
                    });
                }
            }
        } catch (error) {
            logger.warn('Failed to send work experience notifications', {
                profileId: profile._id,
                company: workExperience.company.name,
                error: error.message
            });
        }
    }

    /**
     * Validate education data
     * @private
     * @param {Object} educationData - Education data to validate
     */
    async #validateEducationData(educationData) {
        if (!educationData.institution?.name) {
            throw new ValidationError('Institution name is required', 'INSTITUTION_NAME_REQUIRED');
        }

        if (!educationData.degree) {
            throw new ValidationError('Degree is required', 'DEGREE_REQUIRED');
        }

        // Validate degree types
        const validDegreeTypes = [
            'high_school', 'associate', 'bachelor', 'master', 'doctorate', 'certificate', 'diploma'
        ];

        if (educationData.degreeType && !validDegreeTypes.includes(educationData.degreeType)) {
            throw new ValidationError('Invalid degree type', 'INVALID_DEGREE_TYPE');
        }

        // Validate dates
        if (educationData.startDate && educationData.endDate) {
            const startDate = new Date(educationData.startDate);
            const endDate = new Date(educationData.endDate);

            if (endDate <= startDate) {
                throw new ValidationError('End date must be after start date', 'INVALID_EDUCATION_DATE_RANGE');
            }
        }

        // Validate GPA if provided
        if (educationData.gpa) {
            const gpa = parseFloat(educationData.gpa);
            if (isNaN(gpa) || gpa < 0 || gpa > 4.0) {
                throw new ValidationError('GPA must be between 0.0 and 4.0', 'INVALID_GPA');
            }
        }
    }

    /**
     * Verify educational institution
     * @private
     * @param {Object} institution - Institution data to verify
     */
    async #verifyEducationalInstitution(institution) {
        // This would integrate with education verification services
        // For now, perform basic validation

        if (institution.website && !this.#isValidUrl(institution.website)) {
            logger.warn('Invalid institution website', {
                institution: institution.name,
                website: institution.website
            });
        }

        // Could check against known institution databases
        logger.info('Institution verification requested', {
            institution: institution.name,
            location: institution.location
        });
    }

    /**
     * Send education notifications
     * @private
     * @param {Object} profile - Profile object
     * @param {Object} education - Added education
     * @param {string} addedBy - ID of user who added education
     */
    async #sendEducationNotifications(profile, education, addedBy) {
        try {
            if (addedBy !== profile.userId.toString()) {
                await this.#notificationService.sendNotification({
                    type: 'EDUCATION_ADDED',
                    recipients: [profile.userId.toString()],
                    data: {
                        institution: education.institution.name,
                        degree: education.degree,
                        addedBy
                    }
                });
            }
        } catch (error) {
            logger.warn('Failed to send education notifications', {
                profileId: profile._id,
                institution: education.institution.name,
                error: error.message
            });
        }
    }

    /**
     * Send endorsement notifications
     * @private
     * @param {Object} profile - Profile object
     * @param {Object} skill - Endorsed skill
     * @param {Object} endorser - User who provided endorsement
     */
    async #sendEndorsementNotifications(profile, skill, endorser) {
        try {
            // Notify profile owner
            await this.#notificationService.sendNotification({
                type: 'SKILL_ENDORSED',
                recipients: [profile.userId.toString()],
                data: {
                    skillName: skill.name,
                    endorserName: `${endorser.profile?.firstName} ${endorser.profile?.lastName}`,
                    endorserId: endorser._id
                }
            });

            // Send thank you email to endorser
            await this.#emailService.sendEndorsementThankYou(endorser.email, {
                endorserName: endorser.profile?.firstName,
                profileOwnerName: profile.personal?.fullName,
                skillName: skill.name
            });
        } catch (error) {
            logger.warn('Failed to send endorsement notifications', {
                profileId: profile._id,
                skillName: skill.name,
                endorserId: endorser._id,
                error: error.message
            });
        }
    }

    /**
     * Validate project data
     * @private
     * @param {Object} projectData - Project data to validate
     */
    async #validateProjectData(projectData) {
        if (!projectData.title) {
            throw new ValidationError('Project title is required', 'PROJECT_TITLE_REQUIRED');
        }

        if (projectData.title.length > 100) {
            throw new ValidationError('Project title must be 100 characters or less', 'PROJECT_TITLE_TOO_LONG');
        }

        if (!projectData.description) {
            throw new ValidationError('Project description is required', 'PROJECT_DESCRIPTION_REQUIRED');
        }

        if (projectData.description.length > 2000) {
            throw new ValidationError('Project description must be 2000 characters or less', 'PROJECT_DESCRIPTION_TOO_LONG');
        }

        // Validate project type
        const validTypes = ['web', 'mobile', 'desktop', 'api', 'data', 'ml', 'research', 'other'];
        if (projectData.type && !validTypes.includes(projectData.type)) {
            throw new ValidationError('Invalid project type', 'INVALID_PROJECT_TYPE');
        }

        // Validate status
        const validStatuses = ['planning', 'in_progress', 'completed', 'on_hold', 'cancelled'];
        if (projectData.status && !validStatuses.includes(projectData.status)) {
            throw new ValidationError('Invalid project status', 'INVALID_PROJECT_STATUS');
        }

        // Validate dates
        if (projectData.startDate && projectData.endDate) {
            const startDate = new Date(projectData.startDate);
            const endDate = new Date(projectData.endDate);

            if (endDate <= startDate) {
                throw new ValidationError('End date must be after start date', 'INVALID_PROJECT_DATE_RANGE');
            }
        }
    }

    /**
     * Validate project URLs
     * @private
     * @param {Object} projectData - Project data with URLs
     */
    async #validateProjectUrls(projectData) {
        const urlFields = ['demoUrl', 'repositoryUrl', 'websiteUrl'];

        for (const field of urlFields) {
            if (projectData[field] && !this.#isValidUrl(projectData[field])) {
                throw new ValidationError(`Invalid ${field}: ${projectData[field]}`, 'INVALID_PROJECT_URL');
            }
        }

        // Additional validation for specific URL types
        if (projectData.repositoryUrl) {
            const isGitRepo = /github\.com|gitlab\.com|bitbucket\.org/.test(projectData.repositoryUrl);
            if (!isGitRepo) {
                logger.warn('Repository URL may not be a recognized git hosting service', {
                    url: projectData.repositoryUrl
                });
            }
        }
    }

    /**
     * Send project notifications
     * @private
     * @param {Object} profile - Profile object
     * @param {Object} project - Added project
     * @param {string} addedBy - ID of user who added project
     */
    async #sendProjectNotifications(profile, project, addedBy) {
        try {
            if (addedBy !== profile.userId.toString()) {
                await this.#notificationService.sendNotification({
                    type: 'PROJECT_ADDED',
                    recipients: [profile.userId.toString()],
                    data: {
                        projectTitle: project.title,
                        addedBy
                    }
                });
            }
        } catch (error) {
            logger.warn('Failed to send project notifications', {
                profileId: profile._id,
                projectTitle: project.title,
                error: error.message
            });
        }
    }

    /**
     * Validate recommendation data
     * @private
     * @param {Object} recommendationData - Recommendation data to validate
     */
    async #validateRecommendationData(recommendationData) {
        if (!recommendationData.content) {
            throw new ValidationError('Recommendation content is required', 'RECOMMENDATION_CONTENT_REQUIRED');
        }

        if (recommendationData.content.length < 50) {
            throw new ValidationError('Recommendation must be at least 50 characters', 'RECOMMENDATION_TOO_SHORT');
        }

        if (recommendationData.content.length > 3000) {
            throw new ValidationError('Recommendation must be 3000 characters or less', 'RECOMMENDATION_TOO_LONG');
        }

        // Validate relationship type
        const validRelationships = [
            'colleague', 'manager', 'direct_report', 'client', 'vendor', 'student', 'mentor', 'other'
        ];

        if (recommendationData.relationship && !validRelationships.includes(recommendationData.relationship)) {
            throw new ValidationError('Invalid relationship type', 'INVALID_RELATIONSHIP_TYPE');
        }

        // Validate rating if provided
        if (recommendationData.rating) {
            const rating = parseInt(recommendationData.rating);
            if (isNaN(rating) || rating < 1 || rating > 5) {
                throw new ValidationError('Rating must be between 1 and 5', 'INVALID_RATING');
            }
        }
    }

    /**
     * Validate recommendation relationship
     * @private
     * @param {string} userId - User receiving recommendation
     * @param {string} recommenderId - User giving recommendation
     */
    async #validateRecommendationRelationship(userId, recommenderId) {
        // Check if users have worked together
        const userProfile = await UserProfileModel.findOne({ userId });
        const recommenderProfile = await UserProfileModel.findOne({ userId: recommenderId });

        if (!userProfile || !recommenderProfile) {
            throw new ValidationError('Invalid user profiles for recommendation', 'INVALID_RECOMMENDATION_USERS');
        }

        // Check for existing recommendation
        const existingRecommendation = userProfile.social?.recommendations?.find(
            rec => rec.fromUserId.toString() === recommenderId.toString()
        );

        if (existingRecommendation) {
            throw new ConflictError('Recommendation already exists from this user', 'RECOMMENDATION_EXISTS');
        }

        // Validate professional relationship exists
        const hasWorkRelationship = this.#checkWorkRelationship(userProfile, recommenderProfile);
        if (!hasWorkRelationship) {
            logger.warn('No apparent work relationship found for recommendation', {
                userId,
                recommenderId
            });
        }
    }

    /**
     * Check if two users have a work relationship
     * @private
     * @param {Object} userProfile - User profile
     * @param {Object} recommenderProfile - Recommender profile
     * @returns {boolean} Whether users have worked together
     */
    #checkWorkRelationship(userProfile, recommenderProfile) {
        if (!userProfile.professional?.workHistory || !recommenderProfile.professional?.workHistory) {
            return false;
        }

        // Check for overlapping companies and time periods
        for (const userJob of userProfile.professional.workHistory) {
            for (const recommenderJob of recommenderProfile.professional.workHistory) {
                if (userJob.company.name === recommenderJob.company.name) {
                    // Check for overlapping time periods
                    const userStart = new Date(userJob.startDate);
                    const userEnd = userJob.endDate ? new Date(userJob.endDate) : new Date();
                    const recommenderStart = new Date(recommenderJob.startDate);
                    const recommenderEnd = recommenderJob.endDate ? new Date(recommenderJob.endDate) : new Date();

                    if (userStart <= recommenderEnd && recommenderStart <= userEnd) {
                        return true; // Overlapping employment
                    }
                }
            }
        }

        return false;
    }

    /**
     * Send recommendation notifications
     * @private
     * @param {Object} profile - Profile receiving recommendation
     * @param {Object} recommendation - Added recommendation
     * @param {Object} recommender - User who gave recommendation
     * @param {boolean} requireApproval - Whether approval is required
     */
    async #sendRecommendationNotifications(profile, recommendation, recommender, requireApproval) {
        try {
            const notificationType = requireApproval ? 'RECOMMENDATION_PENDING_APPROVAL' : 'RECOMMENDATION_RECEIVED';

            // Notify profile owner
            await this.#notificationService.sendNotification({
                type: notificationType,
                recipients: [profile.userId.toString()],
                data: {
                    recommenderName: `${recommender.profile?.firstName} ${recommender.profile?.lastName}`,
                    recommenderId: recommender._id,
                    requireApproval
                }
            });

            // Send confirmation to recommender
            await this.#emailService.sendRecommendationConfirmation(recommender.email, {
                recommenderName: recommender.profile?.firstName,
                profileOwnerName: profile.personal?.fullName,
                requireApproval
            });
        } catch (error) {
            logger.warn('Failed to send recommendation notifications', {
                profileId: profile._id,
                recommenderId: recommender._id,
                error: error.message
            });
        }
    }

    /**
     * Build profile search query
     * @private
     * @param {Object} searchParams - Search parameters
     * @param {Object} options - Search options
     * @returns {Promise<Object>} MongoDB query object
     */
    async #buildProfileSearchQuery(searchParams, options = {}) {
        const query = { 'metadata.isPublished': true };

        if (options.organizationId) {
            query.organizationId = options.organizationId;
        }

        // Skills filter
        if (searchParams.skills && searchParams.skills.length > 0) {
            query['professional.skills.technical.name'] = { $in: searchParams.skills };
        }

        // Location filter
        if (searchParams.location) {
            query['personal.addresses.city'] = new RegExp(searchParams.location, 'i');
        }

        // Experience filter
        if (searchParams.minExperience) {
            // This would be calculated based on work history
            query['professional.workHistory.0'] = { $exists: true };
        }

        // Open to opportunities filter
        if (searchParams.openToOpportunities !== undefined) {
            query['preferences.openTo.opportunities'] = searchParams.openToOpportunities;
        }

        // Company filter
        if (searchParams.company) {
            query['professional.workHistory.company.name'] = new RegExp(searchParams.company, 'i');
        }

        // School filter
        if (searchParams.school) {
            query['education.institution.name'] = new RegExp(searchParams.school, 'i');
        }

        return query;
    }

    /**
     * Calculate search analytics
     * @private
     * @param {Object} searchResult - Search result data
     * @param {Object} searchParams - Search parameters used
     * @returns {Object} Search analytics
     */
    #calculateSearchAnalytics(searchResult, searchParams) {
        const analytics = {
            totalResults: searchResult.total,
            avgCompleteness: 0,
            skillsBreakdown: {},
            locationBreakdown: {},
            experienceBreakdown: {}
        };

        if (searchResult.profiles && searchResult.profiles.length > 0) {
            // Calculate average completeness
            const totalCompleteness = searchResult.profiles.reduce((sum, profile) => {
                return sum + (profile.analytics?.completeness?.score || 0);
            }, 0);
            analytics.avgCompleteness = Math.round(totalCompleteness / searchResult.profiles.length);

            // Skills breakdown
            const skillsCounts = {};
            searchResult.profiles.forEach(profile => {
                if (profile.professional?.skills?.technical) {
                    profile.professional.skills.technical.forEach(skill => {
                        skillsCounts[skill.name] = (skillsCounts[skill.name] || 0) + 1;
                    });
                }
            });

            // Get top 10 skills
            analytics.skillsBreakdown = Object.entries(skillsCounts)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 10)
                .reduce((obj, [skill, count]) => {
                    obj[skill] = count;
                    return obj;
                }, {});

            // Location breakdown
            const locationCounts = {};
            searchResult.profiles.forEach(profile => {
                if (profile.personal?.addresses) {
                    profile.personal.addresses.forEach(addr => {
                        if (addr.city) {
                            locationCounts[addr.city] = (locationCounts[addr.city] || 0) + 1;
                        }
                    });
                }
            });

            analytics.locationBreakdown = Object.entries(locationCounts)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 10)
                .reduce((obj, [location, count]) => {
                    obj[location] = count;
                    return obj;
                }, {});
        }

        return analytics;
    }

    /**
     * Generate Word resume
     * @private
     * @param {Object} resumeData - Resume data
     * @param {string} template - Template name
     * @returns {Promise<Buffer>} Word document buffer
     */
    async #generateWordResume(resumeData, template) {
        // This would integrate with a library like docx or similar
        // For now, return a simple text-based format
        const content = this.#generateResumeText(resumeData);
        return Buffer.from(content, 'utf8');
    }

    /**
     * Generate LinkedIn format text
     * @private
     * @param {Object} resumeData - Resume data
     * @returns {string} LinkedIn formatted text
     */
    #generateLinkedInFormat(resumeData) {
        let linkedInText = '';

        // Headline
        if (resumeData.personal.headline) {
            linkedInText += `${resumeData.personal.headline}\n\n`;
        }

        // Summary
        if (resumeData.personal.summary) {
            linkedInText += `About:\n${resumeData.personal.summary}\n\n`;
        }

        // Experience
        if (resumeData.experience && resumeData.experience.length > 0) {
            linkedInText += 'Experience:\n';
            resumeData.experience.forEach(job => {
                linkedInText += `${job.title} at ${job.company}\n`;
                linkedInText += `${job.duration}\n`;
                if (job.description) {
                    linkedInText += `${job.description}\n`;
                }
                linkedInText += '\n';
            });
        }

        // Skills
        if (resumeData.skills) {
            linkedInText += 'Skills:\n';
            if (resumeData.skills.technical.length > 0) {
                linkedInText += `Technical: ${resumeData.skills.technical.join(', ')}\n`;
            }
            if (resumeData.skills.soft.length > 0) {
                linkedInText += `Soft Skills: ${resumeData.skills.soft.join(', ')}\n`;
            }
        }

        return linkedInText;
    }

    /**
     * Generate resume text content
     * @private
     * @param {Object} resumeData - Resume data
     * @returns {string} Text content
     */
    #generateResumeText(resumeData) {
        let text = `${resumeData.personal.name}\n`;
        text += `${resumeData.personal.email} | ${resumeData.personal.phone}\n\n`;

        if (resumeData.personal.summary) {
            text += `SUMMARY\n${resumeData.personal.summary}\n\n`;
        }

        if (resumeData.experience && resumeData.experience.length > 0) {
            text += 'EXPERIENCE\n';
            resumeData.experience.forEach(job => {
                text += `${job.title} - ${job.company}\n`;
                text += `${job.duration}\n`;
                if (job.description) {
                    text += `${job.description}\n`;
                }
                text += '\n';
            });
        }

        if (resumeData.education && resumeData.education.length > 0) {
            text += 'EDUCATION\n';
            resumeData.education.forEach(edu => {
                text += `${edu.degree} - ${edu.institution}\n`;
                text += `${edu.duration}\n\n`;
            });
        }

        return text;
    }

    /**
     * Validate LinkedIn import data
     * @private
     * @param {Object} linkedInData - LinkedIn data to validate
     */
    async #validateLinkedInData(linkedInData) {
        if (!linkedInData || typeof linkedInData !== 'object') {
            throw new ValidationError('Invalid LinkedIn data format', 'INVALID_LINKEDIN_DATA');
        }

        // Validate required fields for LinkedIn import
        const requiredFields = ['firstName', 'lastName'];
        for (const field of requiredFields) {
            if (!linkedInData[field]) {
                throw new ValidationError(`LinkedIn data missing required field: ${field}`, 'MISSING_LINKEDIN_FIELD');
            }
        }

        // Validate email if present
        if (linkedInData.emailAddress && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(linkedInData.emailAddress)) {
            throw new ValidationError('Invalid email in LinkedIn data', 'INVALID_LINKEDIN_EMAIL');
        }

        // Validate positions array
        if (linkedInData.positions && !Array.isArray(linkedInData.positions)) {
            throw new ValidationError('LinkedIn positions must be an array', 'INVALID_LINKEDIN_POSITIONS');
        }

        // Validate education array
        if (linkedInData.educations && !Array.isArray(linkedInData.educations)) {
            throw new ValidationError('LinkedIn education must be an array', 'INVALID_LINKEDIN_EDUCATION');
        }
    }

    /**
     * Merge LinkedIn data with existing profile
     * @private
     * @param {Object} profile - Existing profile
     * @param {Object} linkedInData - LinkedIn data
     * @param {string} importedBy - ID of user performing import
     */
    async #mergeLinkedInData(profile, linkedInData, importedBy) {
        // Merge personal information
        if (linkedInData.firstName || linkedInData.lastName) {
            if (!profile.personal) profile.personal = {};
            profile.personal.fullName = `${linkedInData.firstName || ''} ${linkedInData.lastName || ''}`.trim();
        }

        if (linkedInData.headline && !profile.personal?.headline) {
            profile.personal.headline = linkedInData.headline;
        }

        if (linkedInData.summary && !profile.personal?.summary) {
            profile.personal.summary = linkedInData.summary;
        }

        // Merge work experience
        if (linkedInData.positions && linkedInData.positions.length > 0) {
            for (const position of linkedInData.positions) {
                const existingJob = profile.professional?.workHistory?.find(job =>
                    job.company.name.toLowerCase() === position.companyName?.toLowerCase() &&
                    job.title.toLowerCase() === position.title?.toLowerCase()
                );

                if (!existingJob) {
                    await profile.addWorkExperience({
                        company: { name: position.companyName },
                        title: position.title,
                        description: position.summary,
                        startDate: position.startDate ? new Date(position.startDate) : null,
                        endDate: position.endDate ? new Date(position.endDate) : null,
                        isCurrent: position.isCurrent || false,
                        location: position.location
                    });
                }
            }
        }

        // Merge education
        if (linkedInData.educations && linkedInData.educations.length > 0) {
            if (!profile.education) profile.education = [];

            for (const education of linkedInData.educations) {
                const existingEdu = profile.education.find(edu =>
                    edu.institution.name.toLowerCase() === education.schoolName?.toLowerCase()
                );

                if (!existingEdu) {
                    profile.education.push({
                        institution: { name: education.schoolName },
                        degree: education.degree,
                        fieldOfStudy: education.fieldOfStudy,
                        startDate: education.startDate ? new Date(education.startDate) : null,
                        endDate: education.endDate ? new Date(education.endDate) : null
                    });
                }
            }
        }

        await profile.save();
    }

    /**
     * Replace profile data with LinkedIn data
     * @private
     * @param {Object} profile - Existing profile
     * @param {Object} linkedInData - LinkedIn data
     * @param {string} importedBy - ID of user performing import
     */
    async #replaceWithLinkedInData(profile, linkedInData, importedBy) {
        // Replace personal information
        profile.personal = {
            fullName: `${linkedInData.firstName || ''} ${linkedInData.lastName || ''}`.trim(),
            headline: linkedInData.headline,
            summary: linkedInData.summary,
            contact: profile.personal?.contact || {}
        };

        // Replace work history
        if (linkedInData.positions) {
            profile.professional.workHistory = linkedInData.positions.map(position => ({
                company: { name: position.companyName },
                title: position.title,
                description: position.summary,
                startDate: position.startDate ? new Date(position.startDate) : null,
                endDate: position.endDate ? new Date(position.endDate) : null,
                isCurrent: position.isCurrent || false,
                location: position.location
            }));
        }

        // Replace education
        if (linkedInData.educations) {
            profile.education = linkedInData.educations.map(education => ({
                institution: { name: education.schoolName },
                degree: education.degree,
                fieldOfStudy: education.fieldOfStudy,
                startDate: education.startDate ? new Date(education.startDate) : null,
                endDate: education.endDate ? new Date(education.endDate) : null
            }));
        }

        await profile.save();
    }

    /**
     * Process imported skills from LinkedIn
     * @private
     * @param {Object} profile - Profile object
     * @param {Array} skills - Skills from LinkedIn
     * @param {string} importedBy - ID of user performing import
     */
    async #processImportedSkills(profile, skills, importedBy) {
        if (!skills || !Array.isArray(skills)) return;

        for (const skillName of skills) {
            try {
                const skillData = {
                    name: skillName,
                    category: this.#categorizeSkill(skillName),
                    level: 'intermediate',
                    source: 'linkedin_import'
                };

                await profile.addSkill(skillData);
            } catch (error) {
                // Skill might already exist, continue with others
                logger.debug('Skill import failed', { skill: skillName, error: error.message });
            }
        }
    }

    /**
     * Send import notifications
     * @private
     * @param {Object} profile - Profile object
     * @param {string} source - Import source
     * @param {string} importedBy - ID of user performing import
     */
    async #sendImportNotifications(profile, source, importedBy) {
        try {
            await this.#notificationService.sendNotification({
                type: 'PROFILE_IMPORTED',
                recipients: [profile.userId.toString()],
                data: {
                    source,
                    importedBy,
                    profileCompleteness: profile.analytics?.completeness?.score
                }
            });
        } catch (error) {
            logger.warn('Failed to send import notifications', {
                profileId: profile._id,
                source,
                error: error.message
            });
        }
    }

    /**
     * Calculate profile views for analytics
     * @private
     * @param {Object} profile - Profile object
     * @param {string} timeRange - Time range for calculation
     * @returns {Object} Profile views data
     */
    #calculateProfileViews(profile, timeRange) {
        const views = profile.analytics?.profileViews || { total: 0, recent: [] };
        const rangeMs = this.#parseTimeRange(timeRange);
        const cutoffDate = new Date(Date.now() - rangeMs);

        const recentViews = views.recent?.filter(view =>
            new Date(view.viewedAt) >= cutoffDate
        ) || [];

        return {
            total: views.total,
            inRange: recentViews.length,
            uniqueViewers: new Set(recentViews.map(v => v.viewerId)).size,
            trend: this.#calculateViewsTrend(recentViews)
        };
    }

    /**
     * Build activity timeline
     * @private
     * @param {Object} profile - Profile object
     * @param {string} timeRange - Time range for timeline
     * @returns {Array} Activity timeline events
     */
    #buildActivityTimeline(profile, timeRange) {
        const events = [];
        const rangeMs = this.#parseTimeRange(timeRange);
        const cutoffDate = new Date(Date.now() - rangeMs);

        // Profile creation
        if (new Date(profile.createdAt) >= cutoffDate) {
            events.push({
                type: 'profile_created',
                date: profile.createdAt,
                description: 'Profile created'
            });
        }

        // Work experience additions
        if (profile.professional?.workHistory) {
            profile.professional.workHistory.forEach(job => {
                if (job.createdAt && new Date(job.createdAt) >= cutoffDate) {
                    events.push({
                        type: 'work_added',
                        date: job.createdAt,
                        description: `Added position: ${job.title} at ${job.company.name}`
                    });
                }
            });
        }

        // Education additions
        if (profile.education) {
            profile.education.forEach(edu => {
                if (edu.createdAt && new Date(edu.createdAt) >= cutoffDate) {
                    events.push({
                        type: 'education_added',
                        date: edu.createdAt,
                        description: `Added education: ${edu.degree} from ${edu.institution.name}`
                    });
                }
            });
        }

        return events.sort((a, b) => new Date(b.date) - new Date(a.date));
    }

    /**
     * Analyze skills data for insights
     * @private
     * @param {Object} profile - Profile object
     * @returns {Object} Skills analysis
     */
    #analyzeSkillsData(profile) {
        const analysis = {
            totalSkills: 0,
            byCategory: {},
            byLevel: {},
            topEndorsed: [],
            trending: []
        };

        if (!profile.professional?.skills?.technical) {
            return analysis;
        }

        const skills = profile.professional.skills.technical;
        analysis.totalSkills = skills.length;

        // Group by category
        skills.forEach(skill => {
            const category = skill.category || 'other';
            analysis.byCategory[category] = (analysis.byCategory[category] || 0) + 1;
        });

        // Group by level
        skills.forEach(skill => {
            const level = skill.level || 'intermediate';
            analysis.byLevel[level] = (analysis.byLevel[level] || 0) + 1;
        });

        // Top endorsed skills
        analysis.topEndorsed = skills
            .filter(skill => skill.endorsements && skill.endorsements.length > 0)
            .sort((a, b) => b.endorsements.length - a.endorsements.length)
            .slice(0, 5)
            .map(skill => ({
                name: skill.name,
                endorsements: skill.endorsements.length
            }));

        return analysis;
    }

    /**
     * Calculate engagement metrics
     * @private
     * @param {Object} profile - Profile object
     * @param {string} timeRange - Time range for calculation
     * @returns {Object} Engagement metrics
     */
    #calculateEngagementMetrics(profile, timeRange) {
        const metrics = {
            profileViews: 0,
            endorsements: 0,
            recommendations: 0,
            connections: 0,
            engagementRate: 0
        };

        const rangeMs = this.#parseTimeRange(timeRange);
        const cutoffDate = new Date(Date.now() - rangeMs);

        // Calculate metrics within time range
        if (profile.analytics?.profileViews?.recent) {
            metrics.profileViews = profile.analytics.profileViews.recent.filter(
                view => new Date(view.viewedAt) >= cutoffDate
            ).length;
        }

        if (profile.professional?.skills?.technical) {
            profile.professional.skills.technical.forEach(skill => {
                if (skill.endorsements) {
                    metrics.endorsements += skill.endorsements.filter(
                        endorsement => new Date(endorsement.endorsedAt) >= cutoffDate
                    ).length;
                }
            });
        }

        if (profile.social?.recommendations) {
            metrics.recommendations = profile.social.recommendations.filter(
                rec => new Date(rec.createdAt) >= cutoffDate
            ).length;
        }

        if (profile.social?.connections) {
            metrics.connections = profile.social.connections.filter(
                conn => new Date(conn.connectedAt) >= cutoffDate
            ).length;
        }

        // Calculate engagement rate
        const totalViews = metrics.profileViews || 1; // Avoid division by zero
        metrics.engagementRate = ((metrics.endorsements + metrics.recommendations + metrics.connections) / totalViews) * 100;

        return metrics;
    }

    /**
     * Get profile comparisons with peers
     * @private
     * @param {Object} profile - Profile object
     * @returns {Promise<Object>} Comparison data
     */
    async #getProfileComparisons(profile) {
        // This would compare with other profiles in the same organization/industry
        const comparisons = {
            completeness: { percentile: 0, average: 0 },
            skills: { percentile: 0, average: 0 },
            experience: { percentile: 0, average: 0 },
            endorsements: { percentile: 0, average: 0 }
        };

        try {
            // Get peer profiles for comparison
            const peerProfiles = await UserProfileModel.aggregate([
                {
                    $match: {
                        organizationId: profile.organizationId,
                        userId: { $ne: profile.userId },
                        'metadata.isPublished': true
                    }
                },
                {
                    $project: {
                        completenessScore: '$analytics.completeness.score',
                        skillsCount: { $size: { $ifNull: ['$professional.skills.technical', []] } },
                        experienceYears: 1, // Would be calculated
                        endorsementsCount: 1 // Would be calculated
                    }
                }
            ]);

            if (peerProfiles.length > 0) {
                const userCompleteness = profile.analytics?.completeness?.score || 0;
                const userSkillsCount = profile.professional?.skills?.technical?.length || 0;

                // Calculate percentiles
                comparisons.completeness.percentile = this.#calculatePercentile(
                    userCompleteness,
                    peerProfiles.map(p => p.completenessScore)
                );

                comparisons.skills.percentile = this.#calculatePercentile(
                    userSkillsCount,
                    peerProfiles.map(p => p.skillsCount)
                );
            }
        } catch (error) {
            logger.warn('Failed to calculate profile comparisons', {
                profileId: profile._id,
                error: error.message
            });
        }

        return comparisons;
    }

    /**
     * Calculate percentile ranking
     * @private
     * @param {number} value - User's value
     * @param {Array} dataset - Peer values for comparison
     * @returns {number} Percentile (0-100)
     */
    #calculatePercentile(value, dataset) {
        if (!dataset || dataset.length === 0) return 50;

        const sorted = dataset.filter(v => v != null).sort((a, b) => a - b);
        const belowCount = sorted.filter(v => v < value).length;

        return Math.round((belowCount / sorted.length) * 100);
    }

    /**
     * Enrich skills with market data
     * @private
     * @param {Array} skills - Skills array to enrich
     */
    async #enrichSkillsWithMarketData(skills) {
        // This would integrate with job market APIs to get demand/salary data
        for (const skill of skills) {
            try {
                // Mock market data - in reality would call external API
                skill.marketData = {
                    demand: Math.random() > 0.5 ? 'high' : 'medium',
                    trend: Math.random() > 0.5 ? 'growing' : 'stable',
                    avgSalary: Math.floor(Math.random() * 50000) + 70000,
                    lastUpdated: new Date()
                };
            } catch (error) {
                logger.warn('Failed to enrich skill with market data', {
                    skill: skill.name,
                    error: error.message
                });
            }
        }
    }

    /**
     * Parse time range string to milliseconds
     * @private
     * @param {string} timeRange - Time range (e.g., '30d', '1w', '6m')
     * @returns {number} Time range in milliseconds
     */
    #parseTimeRange(timeRange) {
        const match = timeRange.match(/^(\d+)([dwmy])$/);
        if (!match) return 30 * 24 * 60 * 60 * 1000; // Default 30 days

        const [, amount, unit] = match;
        const multipliers = {
            'd': 24 * 60 * 60 * 1000,
            'w': 7 * 24 * 60 * 60 * 1000,
            'm': 30 * 24 * 60 * 60 * 1000,
            'y': 365 * 24 * 60 * 60 * 1000
        };

        return parseInt(amount) * multipliers[unit];
    }

    /**
     * Calculate views trend
     * @private
     * @param {Array} views - Views data
     * @returns {string} Trend direction
     */
    #calculateViewsTrend(views) {
        if (views.length < 2) return 'stable';

        const half = Math.floor(views.length / 2);
        const firstHalf = views.slice(0, half).length;
        const secondHalf = views.slice(half).length;

        if (secondHalf > firstHalf * 1.2) return 'increasing';
        if (secondHalf < firstHalf * 0.8) return 'decreasing';
        return 'stable';
    }

    /**
     * Helper methods for media processing
     * @private
     */
    async #processImageUpload(media, userId) {
        // Process image using sharp
        try {
            const processedImage = await sharp(media.buffer)
                .resize(800, 600, { fit: 'inside', withoutEnlargement: true })
                .jpeg({ quality: 80 })
                .toBuffer();

            // Save processed image
            const filename = `${userId}_${Date.now()}.jpg`;
            // Would save to storage service

            return { filename, size: processedImage.length };
        } catch (error) {
            throw new Error(`Image processing failed: ${error.message}`);
        }
    }

    async #processVideoUpload(media, userId) {
        // Process video upload
        const filename = `${userId}_${Date.now()}.${media.extension}`;
        // Would process and save video
        return { filename, size: media.size };
    }

    async #processDocumentUpload(media, userId) {
        // Process document upload
        const filename = `${userId}_${Date.now()}.${media.extension}`;
        // Would scan and save document
        return { filename, size: media.size };
    }
}

module.exports = UserProfileService;