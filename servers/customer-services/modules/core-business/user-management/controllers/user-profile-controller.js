'use strict';

/**
 * @fileoverview Enterprise user profile management controller for professional profile operations
 * @module servers/api/modules/user-management/controllers/user-profile-controller
 * @requires module:servers/api/modules/user-management/services/user-profile-service
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/response-formatter
 * @requires module:shared/lib/utils/constants/status-codes
 * @requires module:shared/lib/utils/helpers/string-helper
 * @requires module:shared/lib/utils/helpers/date-helper
 */

const UserProfileService = require('../services/user-profile-service');
const logger = require('../../../../../../shared/lib/utils/logger');
const { AppError, ValidationError } = require('../../../../../../shared/lib/utils/app-error');
const responseFormatter = require('../../../../../../shared/lib/utils/response-formatter');
const { StatusCodes } = require('../../../../../../shared/lib/utils/constants/status-codes');
const stringHelper = require('../../../../../../shared/lib/utils/helpers/string-helper');
const dateHelper = require('../../../../../../shared/lib/utils/helpers/date-helper');

/**
 * @class UserProfileController
 * @description Handles HTTP requests for user profile management, skills, work history, and professional portfolios
 */
class UserProfileController {
    /**
     * @private
     * @type {UserProfileService}
     */
    static #profileService = new UserProfileService();

    /**
     * Create a comprehensive user profile
     * @static
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     * @returns {Promise<void>}
     */
    static async createProfile(req, res, next) {
        try {
            const { userId } = req.params;
            const profileData = req.body;
            const createdBy = req.user.id;
            const { template = 'standard', autoPublish = true } = req.body.options || {};

            logger.info('Profile creation attempt', {
                userId,
                createdBy,
                template,
                autoPublish
            });

            // Validate user ID format
            if (!stringHelper.isValidObjectId(userId)) {
                throw new ValidationError('Invalid user ID format', 'INVALID_USER_ID');
            }

            // Validate required profile sections
            if (!profileData.personal) {
                throw new ValidationError('Personal information section is required', 'MISSING_PERSONAL_INFO');
            }

            // Validate personal information
            if (!profileData.personal.fullName || profileData.personal.fullName.trim().length < 2) {
                throw new ValidationError('Full name is required and must be at least 2 characters', 'INVALID_FULL_NAME');
            }

            // Validate contact information if provided
            if (profileData.personal.contact) {
                const { emails, phones, websites } = profileData.personal.contact;

                // Validate emails
                if (emails && Array.isArray(emails)) {
                    for (const email of emails) {
                        if (email.email && !stringHelper.isValidEmail(email.email)) {
                            throw new ValidationError(`Invalid email format: ${email.email}`, 'INVALID_EMAIL');
                        }
                    }
                }

                // Validate phone numbers
                if (phones && Array.isArray(phones)) {
                    for (const phone of phones) {
                        if (phone.number && !stringHelper.isValidPhoneNumber(phone.number)) {
                            throw new ValidationError(`Invalid phone number format: ${phone.number}`, 'INVALID_PHONE');
                        }
                    }
                }

                // Validate websites
                if (websites && Array.isArray(websites)) {
                    for (const website of websites) {
                        if (website.url && !stringHelper.isValidUrl(website.url)) {
                            throw new ValidationError(`Invalid website URL: ${website.url}`, 'INVALID_URL');
                        }
                    }
                }
            }

            // Validate headline length
            if (profileData.personal.headline && profileData.personal.headline.length > 220) {
                throw new ValidationError('Headline must be 220 characters or less', 'HEADLINE_TOO_LONG');
            }

            // Validate summary length
            if (profileData.personal.summary && profileData.personal.summary.length > 2000) {
                throw new ValidationError('Summary must be 2000 characters or less', 'SUMMARY_TOO_LONG');
            }

            // Validate work history if provided
            if (profileData.professional?.workHistory) {
                await UserProfileController.#validateWorkHistory(profileData.professional.workHistory);
            }

            // Validate education if provided
            if (profileData.education) {
                await UserProfileController.#validateEducation(profileData.education);
            }

            // Validate skills if provided
            if (profileData.professional?.skills) {
                await UserProfileController.#validateSkills(profileData.professional.skills);
            }

            const profile = await UserProfileController.#profileService.createProfile(
                userId,
                profileData,
                createdBy,
                {
                    template,
                    autoPublish,
                    session: req.session
                }
            );

            return res.status(StatusCodes.CREATED).json(
                responseFormatter.success(
                    profile,
                    'Profile created successfully',
                    {
                        template,
                        isPublished: autoPublish,
                        completenessScore: profile.analytics?.completeness?.score,
                        sectionsCount: UserProfileController.#countProfileSections(profile)
                    }
                )
            );

        } catch (error) {
            logger.error('Profile creation failed', {
                error: error.message,
                userId: req.params?.userId,
                createdBy: req.user?.id
            });
            next(error);
        }
    }

    /**
     * Get user profile with population options
     * @static
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     * @returns {Promise<void>}
     */
    static async getProfile(req, res, next) {
        try {
            const { userId } = req.params;
            const { 
                includePrivate = false, 
                populate = [], 
                section,
                includeAnalytics = false 
            } = req.query;
            const requesterId = req.user.id;

            logger.info('Get profile request', {
                userId,
                requesterId,
                includePrivate,
                populate: Array.isArray(populate) ? populate : [populate],
                section
            });

            // Validate user ID format
            if (!stringHelper.isValidObjectId(userId)) {
                throw new ValidationError('Invalid user ID format', 'INVALID_USER_ID');
            }

            // Parse populate array
            const populateArray = Array.isArray(populate) ? populate : 
                                typeof populate === 'string' ? populate.split(',') : [];

            // Validate populate options
            const validPopulateOptions = ['connections', 'recommendations', 'endorsements', 'projects'];
            const invalidPopulate = populateArray.filter(option => !validPopulateOptions.includes(option));
            
            if (invalidPopulate.length > 0) {
                throw new ValidationError(`Invalid populate options: ${invalidPopulate.join(', ')}. Valid options: ${validPopulateOptions.join(', ')}`, 'INVALID_POPULATE_OPTIONS');
            }

            // Validate section filter if provided
            if (section) {
                const validSections = ['personal', 'professional', 'education', 'portfolio', 'social'];
                if (!validSections.includes(section)) {
                    throw new ValidationError(`Invalid section. Valid sections: ${validSections.join(', ')}`, 'INVALID_SECTION');
                }
            }

            const profile = await UserProfileController.#profileService.getProfile(
                userId,
                {
                    includePrivate: includePrivate === 'true',
                    populate: populateArray,
                    requesterId,
                    checkPermissions: true,
                    section
                }
            );

            // Add analytics if requested
            let responseData = profile;
            if (includeAnalytics === 'true') {
                const analytics = await UserProfileController.#profileService.getProfileAnalytics(
                    userId,
                    { requesterId }
                );
                responseData = { ...profile, analytics };
            }

            return res.status(StatusCodes.OK).json(
                responseFormatter.success(
                    responseData,
                    'Profile retrieved successfully',
                    {
                        isPrivateView: includePrivate === 'true' && requesterId === userId,
                        populated: populateArray,
                        section: section || 'complete',
                        completenessScore: profile.calculatedMetrics?.completenessScore,
                        includesAnalytics: includeAnalytics === 'true'
                    }
                )
            );

        } catch (error) {
            logger.error('Get profile failed', {
                error: error.message,
                userId: req.params?.userId,
                requesterId: req.user?.id
            });
            next(error);
        }
    }

    /**
     * Update user profile information
     * @static
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     * @returns {Promise<void>}
     */
    static async updateProfile(req, res, next) {
        try {
            const { userId } = req.params;
            const updateData = req.body;
            const updatedBy = req.user.id;
            const { reason, publishChanges = true } = req.body.options || {};

            logger.info('Profile update attempt', {
                userId,
                updatedBy,
                fieldsToUpdate: Object.keys(updateData).filter(key => key !== 'options'),
                publishChanges
            });

            // Validate user ID format
            if (!stringHelper.isValidObjectId(userId)) {
                throw new ValidationError('Invalid user ID format', 'INVALID_USER_ID');
            }

            // Remove options from update data
            const { options, ...cleanUpdateData } = updateData;

            // Validate update data structure
            await UserProfileController.#validateProfileUpdateData(cleanUpdateData);

            const updatedProfile = await UserProfileController.#profileService.updateProfile(
                userId,
                cleanUpdateData,
                updatedBy,
                {
                    reason,
                    publishChanges,
                    session: req.session
                }
            );

            return res.status(StatusCodes.OK).json(
                responseFormatter.success(
                    updatedProfile,
                    'Profile updated successfully',
                    {
                        fieldsUpdated: Object.keys(cleanUpdateData),
                        publishedChanges: publishChanges,
                        newCompleteness: updatedProfile.analytics?.completeness?.score,
                        updatedBy,
                        reason
                    }
                )
            );

        } catch (error) {
            logger.error('Profile update failed', {
                error: error.message,
                userId: req.params?.userId,
                updatedBy: req.user?.id
            });
            next(error);
        }
    }

    /**
     * Add work experience to profile
     * @static
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     * @returns {Promise<void>}
     */
    static async addWorkExperience(req, res, next) {
        try {
            const { userId } = req.params;
            const workData = req.body;
            const addedBy = req.user.id;
            const { validateEmployment = false } = req.body.options || {};

            logger.info('Add work experience attempt', {
                userId,
                company: workData.company?.name,
                title: workData.title,
                addedBy,
                validateEmployment
            });

            // Validate user ID format
            if (!stringHelper.isValidObjectId(userId)) {
                throw new ValidationError('Invalid user ID format', 'INVALID_USER_ID');
            }

            // Validate required fields
            const requiredFields = ['company', 'title', 'startDate'];
            const missingFields = requiredFields.filter(field => !workData[field]);

            if (missingFields.length > 0) {
                throw new ValidationError(`Missing required fields: ${missingFields.join(', ')}`, 'MISSING_REQUIRED_FIELDS');
            }

            // Validate company information
            if (!workData.company.name || workData.company.name.trim().length < 2) {
                throw new ValidationError('Company name is required and must be at least 2 characters', 'INVALID_COMPANY_NAME');
            }

            // Validate job title
            if (workData.title.trim().length < 2) {
                throw new ValidationError('Job title must be at least 2 characters', 'INVALID_JOB_TITLE');
            }

            // Validate dates
            if (!dateHelper.isValidDate(workData.startDate)) {
                throw new ValidationError('Invalid start date format', 'INVALID_START_DATE');
            }

            if (workData.endDate) {
                if (!dateHelper.isValidDate(workData.endDate)) {
                    throw new ValidationError('Invalid end date format', 'INVALID_END_DATE');
                }

                if (new Date(workData.endDate) <= new Date(workData.startDate)) {
                    throw new ValidationError('End date must be after start date', 'INVALID_DATE_RANGE');
                }
            }

            if (new Date(workData.startDate) > new Date()) {
                throw new ValidationError('Start date cannot be in the future', 'FUTURE_START_DATE');
            }

            // Validate company website if provided
            if (workData.company.website && !stringHelper.isValidUrl(workData.company.website)) {
                throw new ValidationError('Invalid company website URL', 'INVALID_COMPANY_WEBSITE');
            }

            // Validate description length if provided
            if (workData.description && workData.description.length > 5000) {
                throw new ValidationError('Job description must be 5000 characters or less', 'DESCRIPTION_TOO_LONG');
            }

            // Validate technologies array if provided
            if (workData.technologies && !Array.isArray(workData.technologies)) {
                throw new ValidationError('Technologies must be an array', 'INVALID_TECHNOLOGIES_FORMAT');
            }

            const workExperience = await UserProfileController.#profileService.addWorkExperience(
                userId,
                workData,
                addedBy,
                {
                    validateEmployment,
                    session: req.session
                }
            );

            return res.status(StatusCodes.CREATED).json(
                responseFormatter.success(
                    workExperience,
                    'Work experience added successfully',
                    {
                        company: workData.company.name,
                        title: workData.title,
                        isCurrent: workData.isCurrent || false,
                        technologiesCount: workData.technologies?.length || 0,
                        employmentValidated: validateEmployment
                    }
                )
            );

        } catch (error) {
            logger.error('Add work experience failed', {
                error: error.message,
                userId: req.params?.userId,
                company: req.body?.company?.name,
                addedBy: req.user?.id
            });
            next(error);
        }
    }

    /**
     * Add education to profile
     * @static
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     * @returns {Promise<void>}
     */
    static async addEducation(req, res, next) {
        try {
            const { userId } = req.params;
            const educationData = req.body;
            const addedBy = req.user.id;
            const { verifyInstitution = false } = req.body.options || {};

            logger.info('Add education attempt', {
                userId,
                institution: educationData.institution?.name,
                degree: educationData.degree,
                addedBy,
                verifyInstitution
            });

            // Validate user ID format
            if (!stringHelper.isValidObjectId(userId)) {
                throw new ValidationError('Invalid user ID format', 'INVALID_USER_ID');
            }

            // Validate required fields
            const requiredFields = ['institution', 'degree'];
            const missingFields = requiredFields.filter(field => !educationData[field]);

            if (missingFields.length > 0) {
                throw new ValidationError(`Missing required fields: ${missingFields.join(', ')}`, 'MISSING_REQUIRED_FIELDS');
            }

            // Validate institution information
            if (!educationData.institution.name || educationData.institution.name.trim().length < 2) {
                throw new ValidationError('Institution name is required and must be at least 2 characters', 'INVALID_INSTITUTION_NAME');
            }

            // Validate degree
            if (educationData.degree.trim().length < 2) {
                throw new ValidationError('Degree must be at least 2 characters', 'INVALID_DEGREE');
            }

            // Validate degree type if provided
            if (educationData.degreeType) {
                const validDegreeTypes = ['high_school', 'associate', 'bachelor', 'master', 'doctorate', 'certificate', 'diploma'];
                if (!validDegreeTypes.includes(educationData.degreeType)) {
                    throw new ValidationError(`Invalid degree type. Valid types: ${validDegreeTypes.join(', ')}`, 'INVALID_DEGREE_TYPE');
                }
            }

            // Validate dates if provided
            if (educationData.startDate && !dateHelper.isValidDate(educationData.startDate)) {
                throw new ValidationError('Invalid start date format', 'INVALID_START_DATE');
            }

            if (educationData.endDate && !dateHelper.isValidDate(educationData.endDate)) {
                throw new ValidationError('Invalid end date format', 'INVALID_END_DATE');
            }

            if (educationData.startDate && educationData.endDate) {
                if (new Date(educationData.endDate) <= new Date(educationData.startDate)) {
                    throw new ValidationError('End date must be after start date', 'INVALID_DATE_RANGE');
                }
            }

            // Validate GPA if provided
            if (educationData.gpa) {
                const gpa = parseFloat(educationData.gpa);
                if (isNaN(gpa) || gpa < 0 || gpa > 4.0) {
                    throw new ValidationError('GPA must be between 0.0 and 4.0', 'INVALID_GPA');
                }
            }

            // Validate institution website if provided
            if (educationData.institution.website && !stringHelper.isValidUrl(educationData.institution.website)) {
                throw new ValidationError('Invalid institution website URL', 'INVALID_INSTITUTION_WEBSITE');
            }

            const education = await UserProfileController.#profileService.addEducation(
                userId,
                educationData,
                addedBy,
                {
                    verifyInstitution,
                    session: req.session
                }
            );

            return res.status(StatusCodes.CREATED).json(
                responseFormatter.success(
                    education,
                    'Education added successfully',
                    {
                        institution: educationData.institution.name,
                        degree: educationData.degree,
                        fieldOfStudy: educationData.fieldOfStudy,
                        gpa: educationData.gpa,
                        institutionVerified: verifyInstitution
                    }
                )
            );

        } catch (error) {
            logger.error('Add education failed', {
                error: error.message,
                userId: req.params?.userId,
                institution: req.body?.institution?.name,
                addedBy: req.user?.id
            });
            next(error);
        }
    }

    /**
     * Add or update skill in profile
     * @static
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     * @returns {Promise<void>}
     */
    static async addSkill(req, res, next) {
        try {
            const { userId } = req.params;
            const skillData = req.body;
            const addedBy = req.user.id;
            const { category, autoCategory = true } = req.body.options || {};

            logger.info('Add skill attempt', {
                userId,
                skillName: skillData.name,
                level: skillData.level,
                category: category || 'auto',
                addedBy
            });

            // Validate user ID format
            if (!stringHelper.isValidObjectId(userId)) {
                throw new ValidationError('Invalid user ID format', 'INVALID_USER_ID');
            }

            // Validate required fields
            if (!skillData.name || skillData.name.trim().length < 2) {
                throw new ValidationError('Skill name is required and must be at least 2 characters', 'INVALID_SKILL_NAME');
            }

            // Validate skill level if provided
            if (skillData.level) {
                const validLevels = ['beginner', 'intermediate', 'advanced', 'expert'];
                if (!validLevels.includes(skillData.level)) {
                    throw new ValidationError(`Invalid skill level. Valid levels: ${validLevels.join(', ')}`, 'INVALID_SKILL_LEVEL');
                }
            }

            // Validate years of experience if provided
            if (skillData.yearsOfExperience !== undefined) {
                const years = parseInt(skillData.yearsOfExperience);
                if (isNaN(years) || years < 0 || years > 50) {
                    throw new ValidationError('Years of experience must be between 0 and 50', 'INVALID_EXPERIENCE_YEARS');
                }
            }

            // Validate category if provided
            if (category) {
                const validCategories = ['technical', 'functional', 'industry', 'soft', 'language'];
                if (!validCategories.includes(category)) {
                    throw new ValidationError(`Invalid category. Valid categories: ${validCategories.join(', ')}`, 'INVALID_CATEGORY');
                }
            }

            // Validate proficiency rating if provided
            if (skillData.proficiencyRating !== undefined) {
                const rating = parseInt(skillData.proficiencyRating);
                if (isNaN(rating) || rating < 1 || rating > 10) {
                    throw new ValidationError('Proficiency rating must be between 1 and 10', 'INVALID_PROFICIENCY_RATING');
                }
            }

            const skill = await UserProfileController.#profileService.addSkill(
                userId,
                skillData,
                addedBy,
                {
                    category,
                    autoCategory,
                    session: req.session
                }
            );

            return res.status(StatusCodes.CREATED).json(
                responseFormatter.success(
                    skill,
                    'Skill added successfully',
                    {
                        skillName: skillData.name,
                        level: skillData.level || 'not specified',
                        category: skill.category,
                        autoCategorized: autoCategory && !category,
                        yearsOfExperience: skillData.yearsOfExperience
                    }
                )
            );

        } catch (error) {
            logger.error('Add skill failed', {
                error: error.message,
                userId: req.params?.userId,
                skillName: req.body?.name,
                addedBy: req.user?.id
            });
            next(error);
        }
    }

    /**
     * Endorse a user's skill
     * @static
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     * @returns {Promise<void>}
     */
    static async endorseSkill(req, res, next) {
        try {
            const { userId, skillName } = req.params;
            const endorserId = req.user.id;
            const { relationship, comment } = req.body;

            logger.info('Skill endorsement attempt', {
                userId,
                skillName,
                endorserId,
                relationship
            });

            // Validate user ID format
            if (!stringHelper.isValidObjectId(userId)) {
                throw new ValidationError('Invalid user ID format', 'INVALID_USER_ID');
            }

            // Validate skill name
            if (!skillName || skillName.trim().length < 2) {
                throw new ValidationError('Skill name is required and must be at least 2 characters', 'INVALID_SKILL_NAME');
            }

            // Prevent self-endorsement
            if (userId === endorserId) {
                throw new ValidationError('You cannot endorse your own skills', 'SELF_ENDORSEMENT_NOT_ALLOWED');
            }

            // Validate relationship if provided
            if (relationship) {
                const validRelationships = ['colleague', 'manager', 'direct_report', 'client', 'vendor', 'student', 'mentor', 'other'];
                if (!validRelationships.includes(relationship)) {
                    throw new ValidationError(`Invalid relationship. Valid relationships: ${validRelationships.join(', ')}`, 'INVALID_RELATIONSHIP');
                }
            }

            // Validate comment length if provided
            if (comment && comment.length > 500) {
                throw new ValidationError('Comment must be 500 characters or less', 'COMMENT_TOO_LONG');
            }

            const skill = await UserProfileController.#profileService.endorseSkill(
                userId,
                decodeURIComponent(skillName),
                endorserId,
                {
                    relationship,
                    comment,
                    session: req.session
                }
            );

            return res.status(StatusCodes.OK).json(
                responseFormatter.success(
                    skill,
                    'Skill endorsed successfully',
                    {
                        skillName: decodeURIComponent(skillName),
                        endorserId,
                        relationship,
                        totalEndorsements: skill.endorsements?.length || 0,
                        hasComment: !!comment
                    }
                )
            );

        } catch (error) {
            logger.error('Skill endorsement failed', {
                error: error.message,
                userId: req.params?.userId,
                skillName: req.params?.skillName,
                endorserId: req.user?.id
            });
            next(error);
        }
    }

    /**
     * Add project to portfolio
     * @static
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     * @returns {Promise<void>}
     */
    static async addProject(req, res, next) {
        try {
            const { userId } = req.params;
            const projectData = req.body;
            const addedBy = req.user.id;
            const { validateUrls = true } = req.body.options || {};

            logger.info('Add project attempt', {
                userId,
                projectTitle: projectData.title,
                type: projectData.type,
                addedBy,
                validateUrls
            });

            // Validate user ID format
            if (!stringHelper.isValidObjectId(userId)) {
                throw new ValidationError('Invalid user ID format', 'INVALID_USER_ID');
            }

            // Validate required fields
            const requiredFields = ['title', 'description'];
            const missingFields = requiredFields.filter(field => !projectData[field]);

            if (missingFields.length > 0) {
                throw new ValidationError(`Missing required fields: ${missingFields.join(', ')}`, 'MISSING_REQUIRED_FIELDS');
            }

            // Validate title length
            if (projectData.title.trim().length < 3 || projectData.title.length > 100) {
                throw new ValidationError('Project title must be between 3 and 100 characters', 'INVALID_PROJECT_TITLE');
            }

            // Validate description length
            if (projectData.description.trim().length < 10 || projectData.description.length > 2000) {
                throw new ValidationError('Project description must be between 10 and 2000 characters', 'INVALID_PROJECT_DESCRIPTION');
            }

            // Validate project type if provided
            if (projectData.type) {
                const validTypes = ['web', 'mobile', 'desktop', 'api', 'data', 'ml', 'research', 'other'];
                if (!validTypes.includes(projectData.type)) {
                    throw new ValidationError(`Invalid project type. Valid types: ${validTypes.join(', ')}`, 'INVALID_PROJECT_TYPE');
                }
            }

            // Validate project status if provided
            if (projectData.status) {
                const validStatuses = ['planning', 'in_progress', 'completed', 'on_hold', 'cancelled'];
                if (!validStatuses.includes(projectData.status)) {
                    throw new ValidationError(`Invalid project status. Valid statuses: ${validStatuses.join(', ')}`, 'INVALID_PROJECT_STATUS');
                }
            }

            // Validate dates if provided
            if (projectData.startDate && !dateHelper.isValidDate(projectData.startDate)) {
                throw new ValidationError('Invalid start date format', 'INVALID_START_DATE');
            }

            if (projectData.endDate && !dateHelper.isValidDate(projectData.endDate)) {
                throw new ValidationError('Invalid end date format', 'INVALID_END_DATE');
            }

            if (projectData.startDate && projectData.endDate) {
                if (new Date(projectData.endDate) <= new Date(projectData.startDate)) {
                    throw new ValidationError('End date must be after start date', 'INVALID_DATE_RANGE');
                }
            }

            // Validate URLs if provided and validation enabled
            if (validateUrls) {
                const urlFields = ['demoUrl', 'repositoryUrl', 'websiteUrl'];
                for (const field of urlFields) {
                    if (projectData[field] && !stringHelper.isValidUrl(projectData[field])) {
                        throw new ValidationError(`Invalid ${field}: ${projectData[field]}`, 'INVALID_PROJECT_URL');
                    }
                }
            }

            // Validate technologies array if provided
            if (projectData.technologies && !Array.isArray(projectData.technologies)) {
                throw new ValidationError('Technologies must be an array', 'INVALID_TECHNOLOGIES_FORMAT');
            }

            // Validate team members array if provided
            if (projectData.teamMembers && !Array.isArray(projectData.teamMembers)) {
                throw new ValidationError('Team members must be an array', 'INVALID_TEAM_MEMBERS_FORMAT');
            }

            const project = await UserProfileController.#profileService.addProject(
                userId,
                projectData,
                addedBy,
                {
                    validateUrls,
                    session: req.session
                }
            );

            return res.status(StatusCodes.CREATED).json(
                responseFormatter.success(
                    project,
                    'Project added successfully',
                    {
                        projectTitle: projectData.title,
                        type: projectData.type || 'not specified',
                        status: projectData.status || 'not specified',
                        technologiesCount: projectData.technologies?.length || 0,
                        teamMembersCount: projectData.teamMembers?.length || 0,
                        urlsValidated: validateUrls
                    }
                )
            );

        } catch (error) {
            logger.error('Add project failed', {
                error: error.message,
                userId: req.params?.userId,
                projectTitle: req.body?.title,
                addedBy: req.user?.id
            });
            next(error);
        }
    }

    /**
     * Add recommendation to profile
     * @static
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     * @returns {Promise<void>}
     */
    static async addRecommendation(req, res, next) {
        try {
            const { userId } = req.params;
            const recommendationData = req.body;
            const recommenderId = req.user.id;
            const { requireApproval = true } = req.body.options || {};

            logger.info('Add recommendation attempt', {
                userId,
                recommenderId,
                relationship: recommendationData.relationship,
                requireApproval
            });

            // Validate user ID format
            if (!stringHelper.isValidObjectId(userId)) {
                throw new ValidationError('Invalid user ID format', 'INVALID_USER_ID');
            }

            // Prevent self-recommendation
            if (userId === recommenderId) {
                throw new ValidationError('You cannot recommend yourself', 'SELF_RECOMMENDATION_NOT_ALLOWED');
            }

            // Validate required fields
            if (!recommendationData.content || recommendationData.content.trim().length < 50) {
                throw new ValidationError('Recommendation content is required and must be at least 50 characters', 'INSUFFICIENT_RECOMMENDATION_CONTENT');
            }

            if (recommendationData.content.length > 3000) {
                throw new ValidationError('Recommendation content must be 3000 characters or less', 'RECOMMENDATION_TOO_LONG');
            }

            // Validate relationship type
            if (recommendationData.relationship) {
                const validRelationships = ['colleague', 'manager', 'direct_report', 'client', 'vendor', 'student', 'mentor', 'other'];
                if (!validRelationships.includes(recommendationData.relationship)) {
                    throw new ValidationError(`Invalid relationship type. Valid relationships: ${validRelationships.join(', ')}`, 'INVALID_RELATIONSHIP_TYPE');
                }
            }

            // Validate rating if provided
            if (recommendationData.rating) {
                const rating = parseInt(recommendationData.rating);
                if (isNaN(rating) || rating < 1 || rating > 5) {
                    throw new ValidationError('Rating must be between 1 and 5', 'INVALID_RATING');
                }
            }

            // Validate work period if provided
            if (recommendationData.workPeriod) {
                if (recommendationData.workPeriod.startDate && !dateHelper.isValidDate(recommendationData.workPeriod.startDate)) {
                    throw new ValidationError('Invalid work period start date', 'INVALID_WORK_START_DATE');
                }
                if (recommendationData.workPeriod.endDate && !dateHelper.isValidDate(recommendationData.workPeriod.endDate)) {
                    throw new ValidationError('Invalid work period end date', 'INVALID_WORK_END_DATE');
                }
            }

            const recommendation = await UserProfileController.#profileService.addRecommendation(
                userId,
                recommendationData,
                recommenderId,
                {
                    requireApproval,
                    session: req.session
                }
            );

            const statusMessage = requireApproval ? 
                'Recommendation submitted for approval' : 
                'Recommendation added successfully';

            return res.status(StatusCodes.CREATED).json(
                responseFormatter.success(
                    recommendation,
                    statusMessage,
                    {
                        recommenderId,
                        relationship: recommendationData.relationship,
                        requiresApproval: requireApproval,
                        isVisible: !requireApproval,
                        rating: recommendationData.rating,
                        contentLength: recommendationData.content.length
                    }
                )
            );

        } catch (error) {
            logger.error('Add recommendation failed', {
                error: error.message,
                userId: req.params?.userId,
                recommenderId: req.user?.id
            });
            next(error);
        }
    }

    /**
     * Search profiles with advanced filtering
     * @static
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     * @returns {Promise<void>}
     */
    static async searchProfiles(req, res, next) {
        try {
            const {
                q: query,
                skills,
                location,
                openToOpportunities,
                minExperience,
                company,
                school,
                title,
                industry,
                limit = 20,
                offset = 0,
                sortBy = 'analytics.completeness.score',
                sortOrder = 'desc',
                organizationId
            } = req.query;
            const requesterId = req.user.id;

            logger.info('Profile search request', {
                query,
                filters: { skills, location, openToOpportunities, minExperience },
                pagination: { limit, offset },
                sort: { sortBy, sortOrder },
                requesterId
            });

            // Validate pagination parameters
            const limitNum = parseInt(limit);
            const offsetNum = parseInt(offset);

            if (isNaN(limitNum) || limitNum < 1 || limitNum > 50) {
                throw new ValidationError('Limit must be between 1 and 50', 'INVALID_LIMIT');
            }

            if (isNaN(offsetNum) || offsetNum < 0) {
                throw new ValidationError('Offset must be non-negative', 'INVALID_OFFSET');
            }

            // Validate sort parameters
            const validSortFields = ['analytics.completeness.score', 'createdAt', 'personal.fullName', 'professional.workHistory.0.startDate'];
            if (!validSortFields.includes(sortBy)) {
                throw new ValidationError(`Invalid sort field. Valid options: ${validSortFields.join(', ')}`, 'INVALID_SORT_FIELD');
            }

            if (!['asc', 'desc'].includes(sortOrder)) {
                throw new ValidationError('Sort order must be "asc" or "desc"', 'INVALID_SORT_ORDER');
            }

            // Validate organization ID if provided
            if (organizationId && !stringHelper.isValidObjectId(organizationId)) {
                throw new ValidationError('Invalid organization ID format', 'INVALID_ORGANIZATION_ID');
            }

            // Validate minimum experience if provided
            if (minExperience) {
                const minExp = parseInt(minExperience);
                if (isNaN(minExp) || minExp < 0 || minExp > 50) {
                    throw new ValidationError('Minimum experience must be between 0 and 50 years', 'INVALID_MIN_EXPERIENCE');
                }
            }

            // Build search parameters
            const searchParams = {};
            
            if (query) searchParams.textSearch = query;
            if (skills) {
                const skillsArray = Array.isArray(skills) ? skills : skills.split(',');
                searchParams.skills = skillsArray;
            }
            if (location) searchParams.location = location;
            if (openToOpportunities !== undefined) {
                searchParams.openToOpportunities = openToOpportunities === 'true';
            }
            if (minExperience) searchParams.minExperience = parseInt(minExperience);
            if (company) searchParams.company = company;
            if (school) searchParams.school = school;
            if (title) searchParams.title = title;
            if (industry) searchParams.industry = industry;

            const searchResults = await UserProfileController.#profileService.searchProfiles(
                searchParams,
                {
                    limit: limitNum,
                    offset: offsetNum,
                    sortBy,
                    sortOrder,
                    requesterId,
                    organizationId
                }
            );

            return res.status(StatusCodes.OK).json(
                responseFormatter.success(
                    searchResults,
                    `Found ${searchResults.profiles.length} profiles`,
                    {
                        searchParams,
                        totalCount: searchResults.pagination.totalCount,
                        hasMore: searchResults.pagination.hasMore,
                        averageCompleteness: searchResults.analytics?.avgCompleteness,
                        topSkills: Object.keys(searchResults.analytics?.skillsBreakdown || {}).slice(0, 5)
                    }
                )
            );

        } catch (error) {
            logger.error('Profile search failed', {
                error: error.message,
                query: req.query?.q,
                requesterId: req.user?.id
            });
            next(error);
        }
    }

    /**
     * Generate resume/CV from profile
     * @static
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     * @returns {Promise<void>}
     */
    static async generateResume(req, res, next) {
        try {
            const { userId } = req.params;
            const { 
                format = 'pdf', 
                template = 'professional',
                sections = ['personal', 'experience', 'education', 'skills'],
                fileName 
            } = req.query;
            const requesterId = req.user.id;

            logger.info('Resume generation request', {
                userId,
                format,
                template,
                sections: Array.isArray(sections) ? sections : [sections],
                requesterId
            });

            // Validate user ID format
            if (!stringHelper.isValidObjectId(userId)) {
                throw new ValidationError('Invalid user ID format', 'INVALID_USER_ID');
            }

            // Validate format
            const validFormats = ['pdf', 'word', 'json', 'linkedin'];
            if (!validFormats.includes(format)) {
                throw new ValidationError(`Invalid format. Valid formats: ${validFormats.join(', ')}`, 'INVALID_FORMAT');
            }

            // Validate template
            const validTemplates = ['professional', 'modern', 'classic', 'creative', 'minimal'];
            if (!validTemplates.includes(template)) {
                throw new ValidationError(`Invalid template. Valid templates: ${validTemplates.join(', ')}`, 'INVALID_TEMPLATE');
            }

            // Parse and validate sections
            const sectionsArray = Array.isArray(sections) ? sections : 
                                typeof sections === 'string' ? sections.split(',') : ['personal', 'experience', 'education', 'skills'];
            
            const validSections = ['personal', 'experience', 'education', 'skills', 'projects', 'certifications'];
            const invalidSections = sectionsArray.filter(section => !validSections.includes(section));
            
            if (invalidSections.length > 0) {
                throw new ValidationError(`Invalid sections: ${invalidSections.join(', ')}. Valid sections: ${validSections.join(', ')}`, 'INVALID_SECTIONS');
            }

            // Validate file name if provided
            if (fileName && (fileName.length > 100 || !/^[a-zA-Z0-9_\-\s]+$/.test(fileName))) {
                throw new ValidationError('Invalid file name. Use only letters, numbers, spaces, hyphens, and underscores (max 100 characters)', 'INVALID_FILE_NAME');
            }

            const resumeBuffer = await UserProfileController.#profileService.generateResume(
                userId,
                format,
                {
                    template,
                    sections: sectionsArray,
                    requesterId
                }
            );

            const finalFileName = fileName || `${userId}-resume-${Date.now()}`;
            const fileExtension = format === 'word' ? 'docx' : format === 'json' ? 'json' : format === 'linkedin' ? 'txt' : 'pdf';
            const mimeType = UserProfileController.#getMimeType(format);

            // Set appropriate headers for file download
            res.setHeader('Content-Type', mimeType);
            res.setHeader('Content-Disposition', `attachment; filename="${finalFileName}.${fileExtension}"`);
            res.setHeader('Content-Length', resumeBuffer.length);

            return res.status(StatusCodes.OK).send(resumeBuffer);

        } catch (error) {
            logger.error('Resume generation failed', {
                error: error.message,
                userId: req.params?.userId,
                format: req.query?.format,
                requesterId: req.user?.id
            });
            next(error);
        }
    }

    /**
     * Import profile data from LinkedIn
     * @static
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     * @returns {Promise<void>}
     */
    static async importFromLinkedIn(req, res, next) {
        try {
            const { userId } = req.params;
            const { linkedInData } = req.body;
            const importedBy = req.user.id;
            const { mergeStrategy = 'merge', preserveExisting = true } = req.body.options || {};

            logger.info('LinkedIn import attempt', {
                userId,
                importedBy,
                mergeStrategy,
                preserveExisting,
                hasLinkedInData: !!linkedInData
            });

            // Validate user ID format
            if (!stringHelper.isValidObjectId(userId)) {
                throw new ValidationError('Invalid user ID format', 'INVALID_USER_ID');
            }

            // Validate LinkedIn data presence
            if (!linkedInData || typeof linkedInData !== 'object') {
                throw new ValidationError('LinkedIn data is required and must be an object', 'MISSING_LINKEDIN_DATA');
            }

            // Validate merge strategy
            const validStrategies = ['merge', 'replace', 'append'];
            if (!validStrategies.includes(mergeStrategy)) {
                throw new ValidationError(`Invalid merge strategy. Valid strategies: ${validStrategies.join(', ')}`, 'INVALID_MERGE_STRATEGY');
            }

            // Basic LinkedIn data validation
            if (!linkedInData.firstName && !linkedInData.lastName) {
                throw new ValidationError('LinkedIn data must contain at least firstName or lastName', 'INCOMPLETE_LINKEDIN_DATA');
            }

            // Validate email if present
            if (linkedInData.emailAddress && !stringHelper.isValidEmail(linkedInData.emailAddress)) {
                throw new ValidationError('Invalid email in LinkedIn data', 'INVALID_LINKEDIN_EMAIL');
            }

            // Validate positions structure if present
            if (linkedInData.positions && !Array.isArray(linkedInData.positions)) {
                throw new ValidationError('LinkedIn positions must be an array', 'INVALID_LINKEDIN_POSITIONS');
            }

            // Validate education structure if present
            if (linkedInData.educations && !Array.isArray(linkedInData.educations)) {
                throw new ValidationError('LinkedIn education must be an array', 'INVALID_LINKEDIN_EDUCATION');
            }

            // Validate skills structure if present
            if (linkedInData.skills && !Array.isArray(linkedInData.skills)) {
                throw new ValidationError('LinkedIn skills must be an array', 'INVALID_LINKEDIN_SKILLS');
            }

            const importResult = await UserProfileController.#profileService.importFromLinkedIn(
                userId,
                linkedInData,
                importedBy,
                {
                    mergeStrategy,
                    preserveExisting,
                    session: req.session
                }
            );

            return res.status(StatusCodes.OK).json(
                responseFormatter.success(
                    importResult,
                    'LinkedIn data imported successfully',
                    {
                        mergeStrategy,
                        preserveExisting,
                        fieldsImported: Object.keys(linkedInData),
                        itemsProcessed: {
                            positions: linkedInData.positions?.length || 0,
                            educations: linkedInData.educations?.length || 0,
                            skills: linkedInData.skills?.length || 0
                        }
                    }
                )
            );

        } catch (error) {
            logger.error('LinkedIn import failed', {
                error: error.message,
                userId: req.params?.userId,
                importedBy: req.user?.id
            });
            next(error);
        }
    }

    /**
     * Get profile analytics and insights
     * @static
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     * @returns {Promise<void>}
     */
    static async getProfileAnalytics(req, res, next) {
        try {
            const { userId } = req.params;
            const { 
                timeRange = '30d', 
                includeUsagePatterns = true, 
                includeRecommendations = true,
                includeComparisons = false 
            } = req.query;
            const requesterId = req.user.id;

            logger.info('Profile analytics request', {
                userId,
                timeRange,
                includeUsagePatterns,
                includeRecommendations,
                requesterId
            });

            // Validate user ID format
            if (!stringHelper.isValidObjectId(userId)) {
                throw new ValidationError('Invalid user ID format', 'INVALID_USER_ID');
            }

            // Validate time range format
            const timeRangePattern = /^(\d+)([dwmy])$/;
            if (!timeRangePattern.test(timeRange)) {
                throw new ValidationError('Invalid time range format. Use format like "30d", "1w", "6m", "1y"', 'INVALID_TIME_RANGE');
            }

            const analytics = await UserProfileController.#profileService.getProfileAnalytics(
                userId,
                {
                    timeRange,
                    includeUsagePatterns: includeUsagePatterns === 'true',
                    includeRecommendations: includeRecommendations === 'true',
                    includeComparisons: includeComparisons === 'true',
                    requesterId
                }
            );

            return res.status(StatusCodes.OK).json(
                responseFormatter.success(
                    analytics,
                    'Profile analytics retrieved successfully',
                    {
                        timeRange,
                        completenessScore: analytics.overview?.customizationLevel,
                        profileViews: analytics.overview?.profileViews,
                        endorsementsCount: analytics.overview?.endorsements,
                        includesComparisons: includeComparisons === 'true',
                        generatedAt: new Date()
                    }
                )
            );

        } catch (error) {
            logger.error('Profile analytics request failed', {
                error: error.message,
                userId: req.params?.userId,
                requesterId: req.user?.id
            });
            next(error);
        }
    }

    /**
     * Bulk update skills with market data
     * @static
     * @async
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     * @returns {Promise<void>}
     */
    static async bulkUpdateSkills(req, res, next) {
        try {
            const { userId } = req.params;
            const { skills } = req.body;
            const updatedBy = req.user.id;
            const { 
                includeMarketData = true, 
                validateSkills = true,
                updateExisting = true 
            } = req.body.options || {};

            logger.info('Bulk skills update attempt', {
                userId,
                skillsCount: skills?.length,
                updatedBy,
                includeMarketData,
                validateSkills
            });

            // Validate user ID format
            if (!stringHelper.isValidObjectId(userId)) {
                throw new ValidationError('Invalid user ID format', 'INVALID_USER_ID');
            }

            // Validate skills array
            if (!skills || !Array.isArray(skills) || skills.length === 0) {
                throw new ValidationError('Skills array is required and must not be empty', 'MISSING_SKILLS_ARRAY');
            }

            if (skills.length > 100) {
                throw new ValidationError('Cannot process more than 100 skills at once', 'TOO_MANY_SKILLS');
            }

            // Validate each skill object
            for (let i = 0; i < skills.length; i++) {
                const skill = skills[i];
                
                if (!skill.name || skill.name.trim().length < 2) {
                    throw new ValidationError(`Skill at index ${i} must have a valid name (at least 2 characters)`, 'INVALID_SKILL_NAME');
                }

                if (skill.level) {
                    const validLevels = ['beginner', 'intermediate', 'advanced', 'expert'];
                    if (!validLevels.includes(skill.level)) {
                        throw new ValidationError(`Skill at index ${i} has invalid level. Valid levels: ${validLevels.join(', ')}`, 'INVALID_SKILL_LEVEL');
                    }
                }

                if (skill.yearsOfExperience !== undefined) {
                    const years = parseInt(skill.yearsOfExperience);
                    if (isNaN(years) || years < 0 || years > 50) {
                        throw new ValidationError(`Skill at index ${i} has invalid years of experience (must be 0-50)`, 'INVALID_EXPERIENCE_YEARS');
                    }
                }

                if (skill.category) {
                    const validCategories = ['technical', 'functional', 'industry', 'soft', 'language'];
                    if (!validCategories.includes(skill.category)) {
                        throw new ValidationError(`Skill at index ${i} has invalid category. Valid categories: ${validCategories.join(', ')}`, 'INVALID_SKILL_CATEGORY');
                    }
                }
            }

            const results = await UserProfileController.#profileService.bulkUpdateSkills(
                userId,
                skills,
                updatedBy,
                {
                    includeMarketData: includeMarketData === 'true',
                    validateSkills: validateSkills === 'true',
                    updateExisting,
                    session: req.session
                }
            );

            return res.status(StatusCodes.OK).json(
                responseFormatter.success(
                    results,
                    'Skills bulk update completed',
                    {
                        totalSkills: skills.length,
                        successful: results.successful?.length || 0,
                        failed: results.failed?.length || 0,
                        updated: results.updated?.length || 0,
                        added: results.added?.length || 0,
                        marketDataIncluded: includeMarketData
                    }
                )
            );

        } catch (error) {
            logger.error('Bulk skills update failed', {
                error: error.message,
                userId: req.params?.userId,
                skillsCount: req.body?.skills?.length,
                updatedBy: req.user?.id
            });
            next(error);
        }
    }

    /**
     * Validate work history data
     * @private
     * @static
     * @param {Array} workHistory - Work history array
     */
    static async #validateWorkHistory(workHistory) {
        if (!Array.isArray(workHistory)) {
            throw new ValidationError('Work history must be an array', 'INVALID_WORK_HISTORY_FORMAT');
        }

        for (let i = 0; i < workHistory.length; i++) {
            const job = workHistory[i];
            
            if (!job.company?.name) {
                throw new ValidationError(`Job at index ${i} must have a company name`, 'MISSING_COMPANY_NAME');
            }

            if (!job.title) {
                throw new ValidationError(`Job at index ${i} must have a title`, 'MISSING_JOB_TITLE');
            }

            if (!job.startDate) {
                throw new ValidationError(`Job at index ${i} must have a start date`, 'MISSING_START_DATE');
            }

            if (!dateHelper.isValidDate(job.startDate)) {
                throw new ValidationError(`Job at index ${i} has invalid start date format`, 'INVALID_START_DATE');
            }

            if (job.endDate && !dateHelper.isValidDate(job.endDate)) {
                throw new ValidationError(`Job at index ${i} has invalid end date format`, 'INVALID_END_DATE');
            }

            if (job.endDate && new Date(job.endDate) <= new Date(job.startDate)) {
                throw new ValidationError(`Job at index ${i} end date must be after start date`, 'INVALID_DATE_RANGE');
            }
        }
    }

    /**
     * Validate education data
     * @private
     * @static
     * @param {Array} education - Education array
     */
    static async #validateEducation(education) {
        if (!Array.isArray(education)) {
            throw new ValidationError('Education must be an array', 'INVALID_EDUCATION_FORMAT');
        }

        for (let i = 0; i < education.length; i++) {
            const edu = education[i];
            
            if (!edu.institution?.name) {
                throw new ValidationError(`Education at index ${i} must have an institution name`, 'MISSING_INSTITUTION_NAME');
            }

            if (!edu.degree) {
                throw new ValidationError(`Education at index ${i} must have a degree`, 'MISSING_DEGREE');
            }

            if (edu.startDate && !dateHelper.isValidDate(edu.startDate)) {
                throw new ValidationError(`Education at index ${i} has invalid start date format`, 'INVALID_START_DATE');
            }

            if (edu.endDate && !dateHelper.isValidDate(edu.endDate)) {
                throw new ValidationError(`Education at index ${i} has invalid end date format`, 'INVALID_END_DATE');
            }

            if (edu.gpa) {
                const gpa = parseFloat(edu.gpa);
                if (isNaN(gpa) || gpa < 0 || gpa > 4.0) {
                    throw new ValidationError(`Education at index ${i} has invalid GPA (must be 0.0-4.0)`, 'INVALID_GPA');
                }
            }
        }
    }

    /**
     * Validate skills data
     * @private
     * @static
     * @param {Object} skills - Skills object
     */
    static async #validateSkills(skills) {
        if (typeof skills !== 'object') {
            throw new ValidationError('Skills must be an object', 'INVALID_SKILLS_FORMAT');
        }

        const skillCategories = ['technical', 'soft', 'tools'];
        
        for (const category of skillCategories) {
            if (skills[category] && !Array.isArray(skills[category])) {
                throw new ValidationError(`Skills.${category} must be an array`, 'INVALID_SKILLS_CATEGORY_FORMAT');
            }

            if (skills[category]) {
                for (let i = 0; i < skills[category].length; i++) {
                    const skill = skills[category][i];
                    
                    if (!skill.name || skill.name.trim().length < 2) {
                        throw new ValidationError(`Skill at ${category}[${i}] must have a valid name`, 'INVALID_SKILL_NAME');
                    }

                    if (skill.level) {
                        const validLevels = ['beginner', 'intermediate', 'advanced', 'expert'];
                        if (!validLevels.includes(skill.level)) {
                            throw new ValidationError(`Skill at ${category}[${i}] has invalid level`, 'INVALID_SKILL_LEVEL');
                        }
                    }
                }
            }
        }
    }

    /**
     * Validate profile update data
     * @private
     * @static
     * @param {Object} updateData - Profile update data
     */
    static async #validateProfileUpdateData(updateData) {
        // Validate personal information updates
        if (updateData.personal) {
            if (updateData.personal.fullName !== undefined && 
                (!updateData.personal.fullName || updateData.personal.fullName.trim().length < 2)) {
                throw new ValidationError('Full name must be at least 2 characters', 'INVALID_FULL_NAME');
            }

            if (updateData.personal.headline && updateData.personal.headline.length > 220) {
                throw new ValidationError('Headline must be 220 characters or less', 'HEADLINE_TOO_LONG');
            }

            if (updateData.personal.summary && updateData.personal.summary.length > 2000) {
                throw new ValidationError('Summary must be 2000 characters or less', 'SUMMARY_TOO_LONG');
            }

            // Validate contact information
            if (updateData.personal.contact) {
                const { emails, phones, websites } = updateData.personal.contact;

                if (emails && Array.isArray(emails)) {
                    for (const email of emails) {
                        if (email.email && !stringHelper.isValidEmail(email.email)) {
                            throw new ValidationError(`Invalid email format: ${email.email}`, 'INVALID_EMAIL');
                        }
                    }
                }

                if (phones && Array.isArray(phones)) {
                    for (const phone of phones) {
                        if (phone.number && !stringHelper.isValidPhoneNumber(phone.number)) {
                            throw new ValidationError(`Invalid phone number: ${phone.number}`, 'INVALID_PHONE');
                        }
                    }
                }

                if (websites && Array.isArray(websites)) {
                    for (const website of websites) {
                        if (website.url && !stringHelper.isValidUrl(website.url)) {
                            throw new ValidationError(`Invalid website URL: ${website.url}`, 'INVALID_URL');
                        }
                    }
                }
            }
        }

        // Validate professional information updates
        if (updateData.professional) {
            if (updateData.professional.workHistory) {
                await UserProfileController.#validateWorkHistory(updateData.professional.workHistory);
            }

            if (updateData.professional.skills) {
                await UserProfileController.#validateSkills(updateData.professional.skills);
            }
        }

        // Validate education updates
        if (updateData.education) {
            await UserProfileController.#validateEducation(updateData.education);
        }

        // Validate preferences updates
        if (updateData.preferences) {
            if (updateData.preferences.visibility) {
                const validVisibility = ['public', 'organization', 'connections', 'private'];
                if (!validVisibility.includes(updateData.preferences.visibility.profile)) {
                    throw new ValidationError('Invalid profile visibility setting', 'INVALID_VISIBILITY');
                }
            }
        }
    }

    /**
     * Count profile sections for metadata
     * @private
     * @static
     * @param {Object} profile - Profile object
     * @returns {Object} Sections count
     */
    static #countProfileSections(profile) {
        return {
            hasPersonal: !!profile.personal,
            hasProfessional: !!profile.professional,
            hasEducation: !!profile.education && profile.education.length > 0,
            hasPortfolio: !!profile.portfolio && profile.portfolio.projects?.length > 0,
            hasSocial: !!profile.social && profile.social.connections?.length > 0,
            workExperienceCount: profile.professional?.workHistory?.length || 0,
            educationCount: profile.education?.length || 0,
            skillsCount: profile.professional?.skills?.technical?.length || 0,
            projectsCount: profile.portfolio?.projects?.length || 0,
            connectionsCount: profile.social?.connections?.length || 0
        };
    }

    /**
     * Get MIME type for resume format
     * @private
     * @static
     * @param {string} format - Resume format
     * @returns {string} MIME type
     */
    static #getMimeType(format) {
        switch (format) {
            case 'pdf':
                return 'application/pdf';
            case 'word':
                return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
            case 'json':
                return 'application/json';
            case 'linkedin':
                return 'text/plain';
            default:
                return 'application/octet-stream';
        }
    }
}

module.exports = UserProfileController;