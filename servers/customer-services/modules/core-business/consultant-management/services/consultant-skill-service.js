/**
 * @fileoverview Consultant Skill Management Service
 * @module servers/customer-services/modules/core-business/consultant-management/services/consultant-skill-service
 * @description Comprehensive service for managing consultant skills including proficiency assessments,
 * endorsements, project experience tracking, training management, and skill analytics
 */

const { AppError } = require('../../../../../../shared/lib/utils/app-error');
const logger = require('../../../../../../shared/lib/utils/logger').createLogger({
    serviceName: 'consultant-skill-service'
});
const crypto = require('crypto');
const mongoose = require('mongoose');

// Import secure database service
const database = require('../../../../../../shared/lib/database');

// Import business services
const NotificationService = require('../../notifications/services/notification-service');
const AnalyticsService = require('../../analytics/services/analytics-service');

/**
 * Skill Category Constants
 */
const SKILL_CATEGORIES = {
    TECHNICAL: 'technical',
    FUNCTIONAL: 'functional',
    DOMAIN: 'domain',
    SOFT_SKILL: 'soft_skill',
    TOOL: 'tool',
    METHODOLOGY: 'methodology',
    LANGUAGE: 'language',
    FRAMEWORK: 'framework',
    PLATFORM: 'platform',
    DATABASE: 'database',
    OTHER: 'other'
};

/**
 * Proficiency Level Constants
 */
const PROFICIENCY_LEVELS = {
    NONE: 'none',
    BEGINNER: 'beginner',
    INTERMEDIATE: 'intermediate',
    ADVANCED: 'advanced',
    EXPERT: 'expert',
    MASTER: 'master'
};

/**
 * Proficiency Level Numeric Values
 */
const PROFICIENCY_VALUES = {
    'none': 0,
    'beginner': 20,
    'intermediate': 40,
    'advanced': 60,
    'expert': 80,
    'master': 100
};

/**
 * Verification Status Constants
 */
const VERIFICATION_STATUS = {
    NOT_VERIFIED: 'not_verified',
    SELF_ASSESSED: 'self_assessed',
    PEER_VERIFIED: 'peer_verified',
    MANAGER_VERIFIED: 'manager_verified',
    CERTIFIED: 'certified',
    TESTED: 'tested'
};

/**
 * Assessment Type Constants
 */
const ASSESSMENT_TYPES = {
    SELF: 'self',
    MANAGER: 'manager',
    PEER: 'peer',
    CERTIFICATION: 'certification',
    TEST: 'test'
};

/**
 * Skill Application Context Constants
 */
const SKILL_APPLICATION = {
    PRIMARY: 'primary',
    SECONDARY: 'secondary',
    SUPPORTING: 'supporting',
    LEARNING: 'learning'
};

/**
 * Project Complexity Constants
 */
const PROJECT_COMPLEXITY = {
    BASIC: 'basic',
    MODERATE: 'moderate',
    COMPLEX: 'complex',
    EXPERT_LEVEL: 'expert_level'
};

/**
 * Skill Record Status Constants
 */
const SKILL_STATUS = {
    ACTIVE: 'active',
    INACTIVE: 'inactive',
    ARCHIVED: 'archived',
    DEPRECATED: 'deprecated'
};

/**
 * Consultant Skill Management Service
 * @class ConsultantSkillService
 */
class ConsultantSkillService {
    constructor() {
        this._dbService = null;
        this.notificationService = NotificationService;
        this.analyticsService = AnalyticsService;

        // Configuration
        this.config = {
            companyTenantId: process.env.COMPANY_TENANT_ID || 'default',
            platformUrl: process.env.PLATFORM_URL || 'https://yourplatform.com',
            maxSkillsPerConsultant: parseInt(process.env.MAX_SKILLS_PER_CONSULTANT, 10) || 100,
            maxEndorsementsPerSkill: parseInt(process.env.MAX_ENDORSEMENTS_PER_SKILL, 10) || 50,
            maxProjectHistoryPerSkill: parseInt(process.env.MAX_PROJECT_HISTORY_PER_SKILL, 10) || 100,
            selfAssessmentWeight: parseFloat(process.env.SELF_ASSESSMENT_WEIGHT) || 0.2,
            managerAssessmentWeight: parseFloat(process.env.MANAGER_ASSESSMENT_WEIGHT) || 0.4,
            peerAssessmentWeight: parseFloat(process.env.PEER_ASSESSMENT_WEIGHT) || 0.3,
            certificationWeight: parseFloat(process.env.CERTIFICATION_WEIGHT) || 0.3,
            defaultCurrency: process.env.DEFAULT_CURRENCY || 'USD'
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

    // ============================================================================
    // SKILL RECORD CREATION
    // ============================================================================

    /**
     * Create a new skill record for a consultant
     * @param {string} consultantId - Consultant ID
     * @param {Object} skillData - Skill information
     * @param {string} skillData.name - Skill name (required)
     * @param {string} skillData.category - Skill category (required)
     * @param {string} skillData.subcategory - Skill subcategory
     * @param {string} skillData.description - Skill description
     * @param {Array<string>} skillData.tags - Associated tags
     * @param {Array<string>} skillData.aliases - Alternative names for the skill
     * @param {Object} skillData.proficiency - Initial proficiency assessment
     * @param {Object} skillData.experience - Experience information
     * @param {Object} options - Additional options
     * @param {string} options.tenantId - Tenant ID for multi-tenancy
     * @param {string} options.organizationId - Organization ID
     * @param {string} options.userId - User ID of the creator
     * @param {string} options.source - Source of skill creation (manual, import, linkedin, etc.)
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @returns {Promise<Object>} Created skill record
     */
    async createSkillRecord(consultantId, skillData, options = {}) {
        try {
            logger.info('Creating skill record', {
                consultantId,
                skillName: skillData.name,
                category: skillData.category
            });

            // Validate consultantId
            if (!consultantId || !mongoose.Types.ObjectId.isValid(consultantId)) {
                throw AppError.validation('Invalid consultant ID format');
            }

            // Validate skill data
            await this._validateSkillData(skillData);

            const dbService = this._getDatabaseService();
            const ConsultantSkill = dbService.getModel('ConsultantSkill', 'customer');
            const Consultant = dbService.getModel('Consultant', 'customer');

            // Verify consultant exists
            const consultant = await Consultant.findById(consultantId);
            if (!consultant) {
                throw AppError.notFound('Consultant not found', { context: { consultantId } });
            }

            // Check tenant access with validation
            if (options.tenantId && !options.skipTenantCheck && mongoose.Types.ObjectId.isValid(options.tenantId) &&
                consultant.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this consultant');
            }

            // Check for duplicate skill
            await this._checkDuplicateSkill(consultantId, skillData.name, consultant.tenantId);

            // Check max skills limit
            const existingSkillCount = await ConsultantSkill.countDocuments({
                consultantId: new mongoose.Types.ObjectId(consultantId),
                'status.isDeleted': false
            });

            if (existingSkillCount >= this.config.maxSkillsPerConsultant) {
                throw AppError.validation('Maximum skills limit reached', {
                    context: { limit: this.config.maxSkillsPerConsultant }
                });
            }

            // Generate skill record ID
            const skillRecordId = this._generateSkillRecordId();

            // Build skill record with validated ObjectIds
            const skillRecordData = {
                skillRecordId,
                tenantId: consultant.tenantId,
                consultantId,
                skill: {
                    name: skillData.name.trim(),
                    normalizedName: skillData.name.toLowerCase().trim(),
                    category: skillData.category,
                    subcategory: skillData.subcategory,
                    description: skillData.description,
                    tags: skillData.tags || [],
                    aliases: skillData.aliases || [],
                    relatedSkills: skillData.relatedSkills || []
                },
                proficiency: {
                    level: skillData.proficiency?.level || PROFICIENCY_LEVELS.BEGINNER,
                    score: skillData.proficiency?.score || PROFICIENCY_VALUES[skillData.proficiency?.level] || 20,
                    selfAssessment: skillData.proficiency?.selfAssessment ? {
                        level: skillData.proficiency.selfAssessment.level,
                        score: skillData.proficiency.selfAssessment.score,
                        assessedAt: new Date(),
                        notes: skillData.proficiency.selfAssessment.notes
                    } : undefined,
                    managerAssessment: undefined,
                    peerAssessments: [],
                    certificationBased: skillData.proficiency?.certificationBased
                },
                experience: {
                    yearsOfExperience: skillData.experience?.yearsOfExperience || 0,
                    monthsOfExperience: skillData.experience?.monthsOfExperience || 0,
                    firstUsed: skillData.experience?.firstUsed,
                    lastUsed: skillData.experience?.lastUsed || new Date(),
                    currentlyUsing: skillData.experience?.currentlyUsing ?? true,
                    totalProjects: 0,
                    totalHours: 0,
                    contexts: skillData.experience?.contexts || []
                },
                projectHistory: [],
                training: {
                    coursesCompleted: [],
                    currentlyEnrolled: [],
                    recommendedCourses: []
                },
                endorsements: [],
                verification: {
                    status: VERIFICATION_STATUS.NOT_VERIFIED,
                    history: []
                },
                goals: {
                    targetLevel: skillData.goals?.targetLevel,
                    targetDate: skillData.goals?.targetDate,
                    developmentPlan: skillData.goals?.developmentPlan,
                    milestones: skillData.goals?.milestones || []
                },
                marketValue: {},
                status: {
                    current: SKILL_STATUS.ACTIVE,
                    isPrimary: skillData.isPrimary || false,
                    isFeatured: skillData.isFeatured || false,
                    isActive: true,
                    isDeleted: false
                },
                metadata: {
                    source: options.source || 'manual',
                    createdBy: options.userId,
                    notes: skillData.notes
                }
            };

            // Add optional ObjectId fields with validation
            if (consultant.organizationId && mongoose.Types.ObjectId.isValid(consultant.organizationId)) {
                skillRecordData.organizationId = consultant.organizationId;
            }

            if (skillData.skillId && mongoose.Types.ObjectId.isValid(skillData.skillId)) {
                skillRecordData.skillId = skillData.skillId;
            }

            if (skillData.parentSkill && mongoose.Types.ObjectId.isValid(skillData.parentSkill)) {
                skillRecordData.skill.parentSkill = skillData.parentSkill;
            }

            const skillRecord = new ConsultantSkill(skillRecordData);
            await skillRecord.save();

            // Also add to embedded skills array on consultant document
            await this._syncToConsultantSkills(consultant, skillRecord, 'add');

            // Track creation event
            await this._trackSkillEvent(skillRecord, 'skill_record_created', {
                userId: options.userId
            });

            logger.info('Skill record created successfully', {
                consultantId,
                skillRecordId,
                skillName: skillData.name
            });

            return this._sanitizeSkillOutput(skillRecord);

        } catch (error) {
            logger.error('Failed to create skill record', {
                error: error.message,
                stack: error.stack,
                consultantId,
                skillName: skillData?.name
            });
            throw error;
        }
    }

    /**
     * Bulk create skill records for a consultant
     * @param {string} consultantId - Consultant ID
     * @param {Array<Object>} skillsData - Array of skill data objects
     * @param {Object} options - Additional options
     * @param {string} options.tenantId - Tenant ID for multi-tenancy
     * @param {string} options.userId - User ID of the creator
     * @param {string} options.source - Source of skill creation
     * @returns {Promise<Object>} Result with created skills and any errors
     */
    async bulkCreateSkillRecords(consultantId, skillsData, options = {}) {
        try {
            logger.info('Bulk creating skill records', {
                consultantId,
                count: skillsData.length
            });

            const results = {
                created: [],
                failed: [],
                skipped: []
            };

            for (const skillData of skillsData) {
                try {
                    const skill = await this.createSkillRecord(consultantId, skillData, options);
                    results.created.push(skill);
                } catch (error) {
                    if (error.code === 'CONFLICT') {
                        results.skipped.push({
                            skillName: skillData.name,
                            reason: 'Duplicate skill'
                        });
                    } else {
                        results.failed.push({
                            skillName: skillData.name,
                            error: error.message
                        });
                    }
                }
            }

            logger.info('Bulk skill creation completed', {
                consultantId,
                created: results.created.length,
                failed: results.failed.length,
                skipped: results.skipped.length
            });

            return results;

        } catch (error) {
            logger.error('Bulk skill creation failed', {
                error: error.message,
                consultantId
            });
            throw error;
        }
    }

    // ============================================================================
    // SKILL RECORD RETRIEVAL
    // ============================================================================

    /**
     * Get skill record by ID
     * @param {string} skillRecordId - Skill record ID (MongoDB _id or skillRecordId)
     * @param {Object} options - Query options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @param {boolean} options.includeConsultant - Populate consultant details
     * @returns {Promise<Object>} Skill record
     */
    async getSkillRecordById(skillRecordId, options = {}) {
        try {
            logger.info('Fetching skill record by ID', { skillRecordId });

            const dbService = this._getDatabaseService();
            const ConsultantSkill = dbService.getModel('ConsultantSkill', 'customer');

            let query;
            if (mongoose.Types.ObjectId.isValid(skillRecordId)) {
                query = ConsultantSkill.findById(skillRecordId);
            } else {
                query = ConsultantSkill.findOne({ skillRecordId: skillRecordId.toUpperCase() });
            }

            if (options.includeConsultant) {
                query = query.populate('consultantId', 'profile.firstName profile.lastName consultantCode');
            }

            const skillRecord = await query.exec();

            if (!skillRecord) {
                throw AppError.notFound('Skill record not found', {
                    context: { skillRecordId }
                });
            }

            // Check tenant access with validation
            if (options.tenantId && !options.skipTenantCheck && mongoose.Types.ObjectId.isValid(options.tenantId) &&
                skillRecord.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this skill record');
            }

            return this._sanitizeSkillOutput(skillRecord);

        } catch (error) {
            logger.error('Failed to fetch skill record', {
                error: error.message,
                skillRecordId
            });
            throw error;
        }
    }

    /**
     * Get all skills for a consultant
     * @param {string} consultantId - Consultant ID
     * @param {Object} options - Query options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {string} options.category - Filter by skill category
     * @param {string} options.level - Filter by proficiency level
     * @param {boolean} options.verified - Filter by verification status
     * @param {boolean} options.activeOnly - Only return active skills
     * @param {boolean} options.primaryOnly - Only return primary skills
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @param {number} options.limit - Maximum number of records
     * @param {number} options.skip - Number of records to skip
     * @param {string} options.sortBy - Field to sort by
     * @param {string} options.sortOrder - Sort order (asc/desc)
     * @returns {Promise<Object>} Paginated skill records
     */
    async getConsultantSkills(consultantId, options = {}) {
        try {
            logger.info('Fetching consultant skills', {
                consultantId,
                category: options.category,
                level: options.level
            });

            // Validate consultantId
            if (!consultantId || !mongoose.Types.ObjectId.isValid(consultantId)) {
                throw AppError.validation('Invalid consultant ID format');
            }

            const dbService = this._getDatabaseService();
            const ConsultantSkill = dbService.getModel('ConsultantSkill', 'customer');

            // Build query
            const query = {
                consultantId: new mongoose.Types.ObjectId(consultantId),
                'status.isDeleted': false
            };

            // Add tenantId with validation
            if (options.tenantId && !options.skipTenantCheck && mongoose.Types.ObjectId.isValid(options.tenantId)) {
                query.tenantId = new mongoose.Types.ObjectId(options.tenantId);
            }

            if (options.category) {
                query['skill.category'] = options.category;
            }

            if (options.level) {
                query['proficiency.level'] = options.level;
            }

            if (options.verified) {
                query['verification.status'] = {
                    $in: [VERIFICATION_STATUS.PEER_VERIFIED, VERIFICATION_STATUS.MANAGER_VERIFIED,
                          VERIFICATION_STATUS.CERTIFIED, VERIFICATION_STATUS.TESTED]
                };
            }

            if (options.activeOnly) {
                query['status.current'] = SKILL_STATUS.ACTIVE;
            }

            if (options.primaryOnly) {
                query['status.isPrimary'] = true;
            }

            // Build sort
            const sortField = options.sortBy || 'proficiency.score';
            const sortOrder = options.sortOrder === 'asc' ? 1 : -1;
            const sort = { [sortField]: sortOrder };

            // Execute query with pagination
            const limit = Math.min(options.limit || 50, 100);
            const skip = options.skip || 0;

            const [records, total] = await Promise.all([
                ConsultantSkill.find(query)
                    .sort(sort)
                    .skip(skip)
                    .limit(limit)
                    .exec(),
                ConsultantSkill.countDocuments(query)
            ]);

            return {
                data: records.map(r => this._sanitizeSkillOutput(r)),
                pagination: {
                    total,
                    limit,
                    skip,
                    hasMore: skip + records.length < total
                }
            };

        } catch (error) {
            logger.error('Failed to fetch consultant skills', {
                error: error.message,
                consultantId
            });
            throw error;
        }
    }

    /**
     * Search skills across all consultants
     * @param {string} searchQuery - Search query string
     * @param {Object} options - Search options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {string} options.category - Filter by category
     * @param {number} options.minLevel - Minimum proficiency level score
     * @param {number} options.limit - Maximum results
     * @returns {Promise<Array>} Matching skill records
     */
    async searchSkills(searchQuery, options = {}) {
        try {
            logger.info('Searching skills', { query: searchQuery.substring(0, 20) });

            const dbService = this._getDatabaseService();
            const ConsultantSkill = dbService.getModel('ConsultantSkill', 'customer');

            // Build match stage with validated tenantId
            const tenantId = options.tenantId || this.config.companyTenantId;
            const matchStage = {
                'status.isDeleted': false,
                $text: { $search: searchQuery }
            };

            // Add tenantId with validation
            if (tenantId && mongoose.Types.ObjectId.isValid(tenantId)) {
                matchStage.tenantId = new mongoose.Types.ObjectId(tenantId);
            }

            if (options.category) {
                matchStage['skill.category'] = options.category;
            }

            if (options.minLevel) {
                matchStage['proficiency.score'] = { $gte: options.minLevel };
            }

            const pipeline = [
                { $match: matchStage },
                { $addFields: { score: { $meta: 'textScore' } } },
                { $sort: { score: -1 } },
                { $limit: options.limit || 50 },
                {
                    $lookup: {
                        from: 'consultants',
                        localField: 'consultantId',
                        foreignField: '_id',
                        as: 'consultant',
                        pipeline: [
                            { $project: { 'profile.firstName': 1, 'profile.lastName': 1, consultantCode: 1 } }
                        ]
                    }
                },
                { $unwind: '$consultant' }
            ];

            const results = await ConsultantSkill.aggregate(pipeline);

            return results.map(r => this._sanitizeSkillOutput(r));

        } catch (error) {
            logger.error('Skill search failed', {
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Find consultants with specific skills
     * @param {Array<string>} skillNames - Required skill names
     * @param {Object} options - Search options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {string} options.minLevel - Minimum proficiency level
     * @param {boolean} options.verifiedOnly - Only verified skills
     * @param {number} options.limit - Maximum results
     * @returns {Promise<Array>} Consultants with matching skills
     */
    async findConsultantsWithSkills(skillNames, options = {}) {
        try {
            logger.info('Finding consultants with skills', {
                skillsCount: skillNames.length
            });

            const dbService = this._getDatabaseService();
            const ConsultantSkill = dbService.getModel('ConsultantSkill', 'customer');

            const normalizedSkills = skillNames.map(s => s.toLowerCase().trim());

            // Build match stage with validated tenantId
            const tenantId = options.tenantId || this.config.companyTenantId;
            const matchStage = {
                'skill.normalizedName': { $in: normalizedSkills },
                'status.isDeleted': false,
                'status.isActive': true
            };

            // Add tenantId with validation
            if (tenantId && mongoose.Types.ObjectId.isValid(tenantId)) {
                matchStage.tenantId = new mongoose.Types.ObjectId(tenantId);
            }

            if (options.minLevel) {
                const minScore = PROFICIENCY_VALUES[options.minLevel] || 0;
                matchStage['proficiency.score'] = { $gte: minScore };
            }

            if (options.verifiedOnly) {
                matchStage['verification.status'] = {
                    $in: [VERIFICATION_STATUS.PEER_VERIFIED, VERIFICATION_STATUS.MANAGER_VERIFIED,
                          VERIFICATION_STATUS.CERTIFIED, VERIFICATION_STATUS.TESTED]
                };
            }

            const pipeline = [
                { $match: matchStage },
                {
                    $group: {
                        _id: '$consultantId',
                        matchedSkills: {
                            $push: {
                                name: '$skill.name',
                                level: '$proficiency.level',
                                score: '$proficiency.score'
                            }
                        },
                        matchCount: { $sum: 1 },
                        avgScore: { $avg: '$proficiency.score' }
                    }
                },
                {
                    $addFields: {
                        matchPercentage: {
                            $multiply: [{ $divide: ['$matchCount', normalizedSkills.length] }, 100]
                        }
                    }
                },
                { $sort: { matchCount: -1, avgScore: -1 } },
                { $limit: options.limit || 50 },
                {
                    $lookup: {
                        from: 'consultants',
                        localField: '_id',
                        foreignField: '_id',
                        as: 'consultant',
                        pipeline: [
                            {
                                $project: {
                                    consultantCode: 1,
                                    'profile.firstName': 1,
                                    'profile.lastName': 1,
                                    'professional.level': 1,
                                    'availability.status': 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: '$consultant' }
            ];

            const results = await ConsultantSkill.aggregate(pipeline);

            return results.map(r => ({
                consultant: r.consultant,
                matchedSkills: r.matchedSkills,
                matchCount: r.matchCount,
                matchPercentage: Math.round(r.matchPercentage),
                avgScore: Math.round(r.avgScore)
            }));

        } catch (error) {
            logger.error('Failed to find consultants with skills', {
                error: error.message
            });
            throw error;
        }
    }

    // ============================================================================
    // SKILL RECORD UPDATE
    // ============================================================================

    /**
     * Update skill record
     * @param {string} skillRecordId - Skill record ID
     * @param {Object} updateData - Fields to update
     * @param {Object} updateData.skill - Skill information updates
     * @param {Object} updateData.experience - Experience updates
     * @param {Object} updateData.goals - Goal updates
     * @param {Object} options - Update options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {string} options.userId - User ID performing the update
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @returns {Promise<Object>} Updated skill record
     */
    async updateSkillRecord(skillRecordId, updateData, options = {}) {
        try {
            logger.info('Updating skill record', { skillRecordId });

            const dbService = this._getDatabaseService();
            const ConsultantSkill = dbService.getModel('ConsultantSkill', 'customer');

            const skillRecord = await this._findSkillRecord(skillRecordId);

            // Check tenant access with validation
            if (options.tenantId && !options.skipTenantCheck && mongoose.Types.ObjectId.isValid(options.tenantId) &&
                skillRecord.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this skill record');
            }

            // Validate update data
            await this._validateSkillUpdateData(updateData);

            // Build update object
            const updateFields = {};

            // Skill information updates
            if (updateData.skill) {
                const skillFields = ['description', 'subcategory', 'tags', 'aliases'];
                skillFields.forEach(field => {
                    if (updateData.skill[field] !== undefined) {
                        updateFields[`skill.${field}`] = updateData.skill[field];
                    }
                });
            }

            // Experience updates
            if (updateData.experience) {
                const experienceFields = ['yearsOfExperience', 'monthsOfExperience', 'firstUsed', 'lastUsed', 'currentlyUsing', 'contexts'];
                experienceFields.forEach(field => {
                    if (updateData.experience[field] !== undefined) {
                        updateFields[`experience.${field}`] = updateData.experience[field];
                    }
                });
            }

            // Goal updates
            if (updateData.goals) {
                const goalFields = ['targetLevel', 'targetDate', 'developmentPlan', 'milestones'];
                goalFields.forEach(field => {
                    if (updateData.goals[field] !== undefined) {
                        updateFields[`goals.${field}`] = updateData.goals[field];
                    }
                });
            }

            // Status updates
            if (updateData.isPrimary !== undefined) {
                updateFields['status.isPrimary'] = updateData.isPrimary;
            }
            if (updateData.isFeatured !== undefined) {
                updateFields['status.isFeatured'] = updateData.isFeatured;
            }

            // Metadata
            updateFields['metadata.updatedBy'] = options.userId;

            const updatedRecord = await ConsultantSkill.findByIdAndUpdate(
                skillRecord._id,
                { $set: updateFields },
                { new: true, runValidators: true }
            );

            // Sync to consultant embedded skills
            await this._syncToConsultantSkills(
                { _id: skillRecord.consultantId },
                updatedRecord,
                'update'
            );

            // Track event
            await this._trackSkillEvent(updatedRecord, 'skill_record_updated', {
                userId: options.userId,
                changes: Object.keys(updateFields)
            });

            logger.info('Skill record updated', {
                skillRecordId,
                changes: Object.keys(updateFields).length
            });

            return this._sanitizeSkillOutput(updatedRecord);

        } catch (error) {
            logger.error('Failed to update skill record', {
                error: error.message,
                skillRecordId
            });
            throw error;
        }
    }

    // ============================================================================
    // PROFICIENCY ASSESSMENT
    // ============================================================================

    /**
     * Submit proficiency assessment
     * @param {string} skillRecordId - Skill record ID
     * @param {Object} assessmentData - Assessment information
     * @param {string} assessmentData.type - Assessment type (self, manager, peer)
     * @param {string} assessmentData.level - Proficiency level
     * @param {number} assessmentData.score - Assessment score (0-100)
     * @param {string} assessmentData.notes - Assessment notes
     * @param {Object} options - Assessment options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {string} options.userId - Assessor user ID
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @returns {Promise<Object>} Updated skill record
     */
    async submitProficiencyAssessment(skillRecordId, assessmentData, options = {}) {
        try {
            logger.info('Submitting proficiency assessment', {
                skillRecordId,
                assessmentType: assessmentData.type
            });

            const dbService = this._getDatabaseService();
            const ConsultantSkill = dbService.getModel('ConsultantSkill', 'customer');

            const skillRecord = await this._findSkillRecord(skillRecordId);

            // Check tenant access with validation
            if (options.tenantId && !options.skipTenantCheck && mongoose.Types.ObjectId.isValid(options.tenantId) &&
                skillRecord.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this skill record');
            }

            // Validate assessment data
            if (!assessmentData.type || !Object.values(ASSESSMENT_TYPES).includes(assessmentData.type)) {
                throw AppError.validation('Invalid assessment type');
            }

            if (!assessmentData.level || !Object.values(PROFICIENCY_LEVELS).includes(assessmentData.level)) {
                throw AppError.validation('Invalid proficiency level');
            }

            // Calculate score from level if not provided
            const score = assessmentData.score ?? PROFICIENCY_VALUES[assessmentData.level];

            // Use model method if available
            await skillRecord.updateProficiency({
                type: assessmentData.type,
                level: assessmentData.level,
                score,
                assessedBy: options.userId,
                notes: assessmentData.notes
            });

            // Update verification status based on assessment type
            const verificationUpdate = {};
            if (assessmentData.type === ASSESSMENT_TYPES.SELF) {
                if (skillRecord.verification.status === VERIFICATION_STATUS.NOT_VERIFIED) {
                    verificationUpdate['verification.status'] = VERIFICATION_STATUS.SELF_ASSESSED;
                }
            } else if (assessmentData.type === ASSESSMENT_TYPES.MANAGER) {
                verificationUpdate['verification.status'] = VERIFICATION_STATUS.MANAGER_VERIFIED;
                verificationUpdate['verification.verifiedBy'] = options.userId;
                verificationUpdate['verification.verifiedAt'] = new Date();
            } else if (assessmentData.type === ASSESSMENT_TYPES.PEER) {
                if (skillRecord.proficiency.peerAssessments?.length >= 2) {
                    verificationUpdate['verification.status'] = VERIFICATION_STATUS.PEER_VERIFIED;
                }
            }

            // Add to verification history
            verificationUpdate['$push'] = {
                'verification.history': {
                    type: assessmentData.type,
                    assessedBy: options.userId,
                    level: assessmentData.level,
                    score,
                    assessedAt: new Date(),
                    notes: assessmentData.notes
                }
            };

            const updatedRecord = await ConsultantSkill.findByIdAndUpdate(
                skillRecord._id,
                verificationUpdate,
                { new: true }
            );

            // Sync to consultant
            await this._syncToConsultantSkills(
                { _id: skillRecord.consultantId },
                updatedRecord,
                'update'
            );

            // Track event
            await this._trackSkillEvent(updatedRecord, 'proficiency_assessed', {
                userId: options.userId,
                assessmentType: assessmentData.type,
                level: assessmentData.level,
                score
            });

            // Send notification if manager/peer assessment
            if (assessmentData.type !== ASSESSMENT_TYPES.SELF) {
                await this._sendAssessmentNotification(updatedRecord, assessmentData, options);
            }

            logger.info('Proficiency assessment submitted', {
                skillRecordId,
                type: assessmentData.type,
                newLevel: updatedRecord.proficiency.level,
                newScore: updatedRecord.proficiency.score
            });

            return this._sanitizeSkillOutput(updatedRecord);

        } catch (error) {
            logger.error('Failed to submit proficiency assessment', {
                error: error.message,
                skillRecordId
            });
            throw error;
        }
    }

    /**
     * Request skill assessment from manager or peer
     * @param {string} skillRecordId - Skill record ID
     * @param {Object} requestData - Request information
     * @param {string} requestData.assessorId - User ID of requested assessor
     * @param {string} requestData.type - Assessment type (manager, peer)
     * @param {string} requestData.message - Optional message to assessor
     * @param {Object} options - Request options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {string} options.userId - Requester user ID
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @returns {Promise<Object>} Request confirmation
     */
    async requestAssessment(skillRecordId, requestData, options = {}) {
        try {
            logger.info('Requesting skill assessment', {
                skillRecordId,
                assessorId: requestData.assessorId,
                type: requestData.type
            });

            const skillRecord = await this._findSkillRecord(skillRecordId);

            // Check tenant access with validation
            if (options.tenantId && !options.skipTenantCheck && mongoose.Types.ObjectId.isValid(options.tenantId) &&
                skillRecord.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this skill record');
            }

            // Validate request
            if (!requestData.assessorId) {
                throw AppError.validation('Assessor ID is required');
            }

            if (!requestData.type || !['manager', 'peer'].includes(requestData.type)) {
                throw AppError.validation('Assessment type must be manager or peer');
            }

            // Send notification to assessor
            await this.notificationService?.sendEmail?.({
                to: requestData.assessorId,
                template: 'skill_assessment_request',
                data: {
                    skillName: skillRecord.skill.name,
                    consultantName: 'Consultant',
                    assessmentType: requestData.type,
                    message: requestData.message,
                    assessmentUrl: `${this.config.platformUrl}/assessments/${skillRecordId}`
                }
            });

            // Track event
            await this._trackSkillEvent(skillRecord, 'assessment_requested', {
                userId: options.userId,
                assessorId: requestData.assessorId,
                type: requestData.type
            });

            logger.info('Assessment request sent', {
                skillRecordId,
                assessorId: requestData.assessorId
            });

            return {
                success: true,
                message: 'Assessment request sent successfully',
                skillRecordId: skillRecord.skillRecordId,
                assessorId: requestData.assessorId
            };

        } catch (error) {
            logger.error('Failed to request assessment', {
                error: error.message,
                skillRecordId
            });
            throw error;
        }
    }

    // ============================================================================
    // ENDORSEMENT MANAGEMENT
    // ============================================================================

    /**
     * Add endorsement to skill
     * @param {string} skillRecordId - Skill record ID
     * @param {Object} endorsementData - Endorsement information
     * @param {string} endorsementData.relationship - Relationship to consultant (colleague, manager, client)
     * @param {string} endorsementData.comment - Endorsement comment
     * @param {number} endorsementData.rating - Endorsement rating (1-5)
     * @param {string} endorsementData.projectContext - Project where skill was observed
     * @param {Object} options - Endorsement options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {string} options.userId - Endorser user ID
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @returns {Promise<Object>} Updated skill record
     */
    async addEndorsement(skillRecordId, endorsementData, options = {}) {
        try {
            logger.info('Adding skill endorsement', {
                skillRecordId,
                endorserId: options.userId
            });

            const dbService = this._getDatabaseService();
            const ConsultantSkill = dbService.getModel('ConsultantSkill', 'customer');

            const skillRecord = await this._findSkillRecord(skillRecordId);

            // Check tenant access with validation
            if (options.tenantId && !options.skipTenantCheck && mongoose.Types.ObjectId.isValid(options.tenantId) &&
                skillRecord.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this skill record');
            }

            // Check if user already endorsed
            const existingEndorsement = skillRecord.endorsements?.find(e =>
                e.endorserId?.toString() === options.userId
            );

            if (existingEndorsement) {
                throw AppError.conflict('You have already endorsed this skill');
            }

            // Check endorsement limit
            if (skillRecord.endorsements?.length >= this.config.maxEndorsementsPerSkill) {
                throw AppError.validation('Maximum endorsements limit reached');
            }

            // Cannot endorse own skill
            if (skillRecord.consultantId.toString() === options.userId) {
                throw AppError.validation('Cannot endorse your own skill');
            }

            // Use model method if available
            await skillRecord.addEndorsement({
                endorserId: options.userId,
                relationship: endorsementData.relationship,
                comment: endorsementData.comment,
                rating: endorsementData.rating,
                projectContext: endorsementData.projectContext,
                endorsedAt: new Date()
            });

            // Track event
            await this._trackSkillEvent(skillRecord, 'endorsement_added', {
                endorserId: options.userId,
                rating: endorsementData.rating
            });

            // Send notification to consultant
            await this._sendEndorsementNotification(skillRecord, endorsementData, options);

            logger.info('Endorsement added', {
                skillRecordId,
                endorserId: options.userId
            });

            return this._sanitizeSkillOutput(skillRecord);

        } catch (error) {
            logger.error('Failed to add endorsement', {
                error: error.message,
                skillRecordId
            });
            throw error;
        }
    }

    /**
     * Remove endorsement from skill
     * @param {string} skillRecordId - Skill record ID
     * @param {string} endorsementId - Endorsement ID to remove
     * @param {Object} options - Removal options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {string} options.userId - User ID performing removal
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @returns {Promise<Object>} Updated skill record
     */
    async removeEndorsement(skillRecordId, endorsementId, options = {}) {
        try {
            logger.info('Removing skill endorsement', {
                skillRecordId,
                endorsementId
            });

            const dbService = this._getDatabaseService();
            const ConsultantSkill = dbService.getModel('ConsultantSkill', 'customer');

            const skillRecord = await this._findSkillRecord(skillRecordId);

            // Check tenant access with validation
            if (options.tenantId && !options.skipTenantCheck && mongoose.Types.ObjectId.isValid(options.tenantId) &&
                skillRecord.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this skill record');
            }

            const updatedRecord = await ConsultantSkill.findByIdAndUpdate(
                skillRecord._id,
                {
                    $pull: { endorsements: { _id: endorsementId } },
                    $set: { 'metadata.updatedBy': options.userId }
                },
                { new: true }
            );

            logger.info('Endorsement removed', { skillRecordId, endorsementId });

            return this._sanitizeSkillOutput(updatedRecord);

        } catch (error) {
            logger.error('Failed to remove endorsement', {
                error: error.message,
                skillRecordId
            });
            throw error;
        }
    }

    // ============================================================================
    // PROJECT EXPERIENCE
    // ============================================================================

    /**
     * Add project experience to skill
     * @param {string} skillRecordId - Skill record ID
     * @param {Object} projectData - Project experience information
     * @param {string} projectData.projectId - Project ID reference
     * @param {string} projectData.projectName - Project name
     * @param {string} projectData.clientName - Client name
     * @param {string} projectData.role - Role on project
     * @param {Date} projectData.startDate - Project start date
     * @param {Date} projectData.endDate - Project end date
     * @param {number} projectData.hoursLogged - Hours using skill
     * @param {Array<string>} projectData.responsibilities - Responsibilities
     * @param {Array<string>} projectData.achievements - Achievements
     * @param {string} projectData.skillApplication - How skill was applied (primary, secondary, etc.)
     * @param {string} projectData.complexity - Project complexity level
     * @param {Object} options - Add options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {string} options.userId - User ID performing the action
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @returns {Promise<Object>} Updated skill record
     */
    async addProjectExperience(skillRecordId, projectData, options = {}) {
        try {
            logger.info('Adding project experience to skill', {
                skillRecordId,
                projectName: projectData.projectName
            });

            const dbService = this._getDatabaseService();
            const ConsultantSkill = dbService.getModel('ConsultantSkill', 'customer');

            const skillRecord = await this._findSkillRecord(skillRecordId);

            // Check tenant access with validation
            if (options.tenantId && !options.skipTenantCheck && mongoose.Types.ObjectId.isValid(options.tenantId) &&
                skillRecord.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this skill record');
            }

            // Validate project data
            if (!projectData.projectName || !projectData.startDate) {
                throw AppError.validation('Project name and start date are required');
            }

            // Check project history limit
            if (skillRecord.projectHistory?.length >= this.config.maxProjectHistoryPerSkill) {
                throw AppError.validation('Maximum project history limit reached');
            }

            // Build project experience with validated projectId
            const projectExperience = {
                projectName: projectData.projectName,
                clientName: projectData.clientName,
                role: projectData.role,
                startDate: new Date(projectData.startDate),
                endDate: projectData.endDate ? new Date(projectData.endDate) : undefined,
                hoursLogged: projectData.hoursLogged || 0,
                responsibilities: projectData.responsibilities || [],
                achievements: projectData.achievements || [],
                skillApplication: projectData.skillApplication || SKILL_APPLICATION.PRIMARY,
                complexity: projectData.complexity || PROJECT_COMPLEXITY.MODERATE,
                feedback: projectData.feedback
            };

            // Add projectId with validation
            if (projectData.projectId && mongoose.Types.ObjectId.isValid(projectData.projectId)) {
                projectExperience.projectId = projectData.projectId;
            }

            // Use model method
            await skillRecord.addProjectExperience(projectExperience);

            // Track event
            await this._trackSkillEvent(skillRecord, 'project_experience_added', {
                userId: options.userId,
                projectName: projectData.projectName
            });

            logger.info('Project experience added', {
                skillRecordId,
                projectName: projectData.projectName
            });

            return this._sanitizeSkillOutput(skillRecord);

        } catch (error) {
            logger.error('Failed to add project experience', {
                error: error.message,
                skillRecordId
            });
            throw error;
        }
    }

    /**
     * Update project experience feedback
     * @param {string} skillRecordId - Skill record ID
     * @param {string} projectId - Project ID in history
     * @param {Object} feedbackData - Feedback information
     * @param {number} feedbackData.rating - Rating (1-5)
     * @param {string} feedbackData.comment - Feedback comment
     * @param {Object} options - Update options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {string} options.userId - User ID providing feedback
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @returns {Promise<Object>} Updated skill record
     */
    async updateProjectFeedback(skillRecordId, projectId, feedbackData, options = {}) {
        try {
            logger.info('Updating project feedback', {
                skillRecordId,
                projectId
            });

            const dbService = this._getDatabaseService();
            const ConsultantSkill = dbService.getModel('ConsultantSkill', 'customer');

            const skillRecord = await this._findSkillRecord(skillRecordId);

            // Check tenant access with validation
            if (options.tenantId && !options.skipTenantCheck && mongoose.Types.ObjectId.isValid(options.tenantId) &&
                skillRecord.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this skill record');
            }

            // Find project index with ObjectId validation
            const projectIndex = skillRecord.projectHistory.findIndex(p => {
                const pId = p.projectId?.toString();
                const pObjectId = p._id?.toString();
                return (pId && pId === projectId) || (pObjectId && pObjectId === projectId);
            });

            if (projectIndex === -1) {
                throw AppError.notFound('Project not found in skill history');
            }

            const updatedRecord = await ConsultantSkill.findByIdAndUpdate(
                skillRecord._id,
                {
                    $set: {
                        [`projectHistory.${projectIndex}.feedback`]: {
                            rating: feedbackData.rating,
                            comment: feedbackData.comment,
                            givenBy: options.userId
                        },
                        'metadata.updatedBy': options.userId
                    }
                },
                { new: true }
            );

            logger.info('Project feedback updated', { skillRecordId, projectId });

            return this._sanitizeSkillOutput(updatedRecord);

        } catch (error) {
            logger.error('Failed to update project feedback', {
                error: error.message,
                skillRecordId
            });
            throw error;
        }
    }

    // ============================================================================
    // TRAINING MANAGEMENT
    // ============================================================================

    /**
     * Add completed course to skill training
     * @param {string} skillRecordId - Skill record ID
     * @param {Object} courseData - Course information
     * @param {string} courseData.courseId - Course ID
     * @param {string} courseData.courseName - Course name
     * @param {string} courseData.provider - Training provider
     * @param {Date} courseData.completedAt - Completion date
     * @param {number} courseData.score - Completion score
     * @param {number} courseData.duration - Course duration in hours
     * @param {Object} courseData.certificate - Certificate information
     * @param {Object} options - Add options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {string} options.userId - User ID performing the action
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @returns {Promise<Object>} Updated skill record
     */
    async addCompletedCourse(skillRecordId, courseData, options = {}) {
        try {
            logger.info('Adding completed course to skill', {
                skillRecordId,
                courseName: courseData.courseName
            });

            const dbService = this._getDatabaseService();
            const ConsultantSkill = dbService.getModel('ConsultantSkill', 'customer');

            const skillRecord = await this._findSkillRecord(skillRecordId);

            // Check tenant access with validation
            if (options.tenantId && !options.skipTenantCheck && mongoose.Types.ObjectId.isValid(options.tenantId) &&
                skillRecord.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this skill record');
            }

            if (!courseData.courseName || !courseData.provider) {
                throw AppError.validation('Course name and provider are required');
            }

            const course = {
                courseId: courseData.courseId || `CRS-${Date.now()}`,
                courseName: courseData.courseName,
                provider: courseData.provider,
                completedAt: courseData.completedAt || new Date(),
                score: courseData.score,
                duration: courseData.duration,
                certificate: courseData.certificate
            };

            const updatedRecord = await ConsultantSkill.findByIdAndUpdate(
                skillRecord._id,
                {
                    $push: { 'training.coursesCompleted': course },
                    $set: { 'metadata.updatedBy': options.userId }
                },
                { new: true }
            );

            // Track event
            await this._trackSkillEvent(updatedRecord, 'course_completed', {
                userId: options.userId,
                courseName: courseData.courseName
            });

            logger.info('Completed course added', {
                skillRecordId,
                courseName: courseData.courseName
            });

            return this._sanitizeSkillOutput(updatedRecord);

        } catch (error) {
            logger.error('Failed to add completed course', {
                error: error.message,
                skillRecordId
            });
            throw error;
        }
    }

    /**
     * Add current enrollment to skill training
     * @param {string} skillRecordId - Skill record ID
     * @param {Object} enrollmentData - Enrollment information
     * @param {string} enrollmentData.courseId - Course ID
     * @param {string} enrollmentData.courseName - Course name
     * @param {string} enrollmentData.provider - Training provider
     * @param {Date} enrollmentData.enrolledAt - Enrollment date
     * @param {Date} enrollmentData.expectedCompletion - Expected completion date
     * @param {number} enrollmentData.progress - Current progress percentage
     * @param {Object} options - Add options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {string} options.userId - User ID performing the action
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @returns {Promise<Object>} Updated skill record
     */
    async addCourseEnrollment(skillRecordId, enrollmentData, options = {}) {
        try {
            logger.info('Adding course enrollment to skill', {
                skillRecordId,
                courseName: enrollmentData.courseName
            });

            const dbService = this._getDatabaseService();
            const ConsultantSkill = dbService.getModel('ConsultantSkill', 'customer');

            const skillRecord = await this._findSkillRecord(skillRecordId);

            // Check tenant access with validation
            if (options.tenantId && !options.skipTenantCheck && mongoose.Types.ObjectId.isValid(options.tenantId) &&
                skillRecord.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this skill record');
            }

            const enrollment = {
                courseId: enrollmentData.courseId || `CRS-${Date.now()}`,
                courseName: enrollmentData.courseName,
                provider: enrollmentData.provider,
                enrolledAt: enrollmentData.enrolledAt || new Date(),
                expectedCompletion: enrollmentData.expectedCompletion,
                progress: enrollmentData.progress || 0
            };

            const updatedRecord = await ConsultantSkill.findByIdAndUpdate(
                skillRecord._id,
                {
                    $push: { 'training.currentlyEnrolled': enrollment },
                    $set: { 'metadata.updatedBy': options.userId }
                },
                { new: true }
            );

            logger.info('Course enrollment added', {
                skillRecordId,
                courseName: enrollmentData.courseName
            });

            return this._sanitizeSkillOutput(updatedRecord);

        } catch (error) {
            logger.error('Failed to add course enrollment', {
                error: error.message,
                skillRecordId
            });
            throw error;
        }
    }

    /**
     * Update enrollment progress
     * @param {string} skillRecordId - Skill record ID
     * @param {string} courseId - Course ID
     * @param {number} progress - New progress percentage
     * @param {Object} options - Update options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {string} options.userId - User ID performing the action
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @returns {Promise<Object>} Updated skill record
     */
    async updateEnrollmentProgress(skillRecordId, courseId, progress, options = {}) {
        try {
            logger.info('Updating enrollment progress', {
                skillRecordId,
                courseId,
                progress
            });

            const dbService = this._getDatabaseService();
            const ConsultantSkill = dbService.getModel('ConsultantSkill', 'customer');

            const skillRecord = await this._findSkillRecord(skillRecordId);

            // Check tenant access with validation
            if (options.tenantId && !options.skipTenantCheck && mongoose.Types.ObjectId.isValid(options.tenantId) &&
                skillRecord.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this skill record');
            }

            // Find enrollment index
            const enrollmentIndex = skillRecord.training.currentlyEnrolled?.findIndex(e =>
                e.courseId === courseId
            );

            if (enrollmentIndex === -1) {
                throw AppError.notFound('Course enrollment not found');
            }

            // If progress is 100%, move to completed
            if (progress >= 100) {
                const enrollment = skillRecord.training.currentlyEnrolled[enrollmentIndex];
                
                const updatedRecord = await ConsultantSkill.findByIdAndUpdate(
                    skillRecord._id,
                    {
                        $pull: { 'training.currentlyEnrolled': { courseId } },
                        $push: {
                            'training.coursesCompleted': {
                                courseId: enrollment.courseId,
                                courseName: enrollment.courseName,
                                provider: enrollment.provider,
                                completedAt: new Date(),
                                score: null,
                                duration: null
                            }
                        },
                        $set: { 'metadata.updatedBy': options.userId }
                    },
                    { new: true }
                );

                return this._sanitizeSkillOutput(updatedRecord);
            }

            const updatedRecord = await ConsultantSkill.findByIdAndUpdate(
                skillRecord._id,
                {
                    $set: {
                        [`training.currentlyEnrolled.${enrollmentIndex}.progress`]: progress,
                        'metadata.updatedBy': options.userId
                    }
                },
                { new: true }
            );

            logger.info('Enrollment progress updated', {
                skillRecordId,
                courseId,
                progress
            });

            return this._sanitizeSkillOutput(updatedRecord);

        } catch (error) {
            logger.error('Failed to update enrollment progress', {
                error: error.message,
                skillRecordId
            });
            throw error;
        }
    }

    // ============================================================================
    // SKILL VERIFICATION
    // ============================================================================

    /**
     * Verify skill through certification
     * @param {string} skillRecordId - Skill record ID
     * @param {Object} certificationData - Certification information
     * @param {string} certificationData.certificationId - Certification ID
     * @param {string} certificationData.certificationName - Certification name
     * @param {number} certificationData.score - Certification score
     * @param {Date} certificationData.earnedAt - Date earned
     * @param {Object} options - Verification options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {string} options.userId - User ID performing verification
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @returns {Promise<Object>} Updated skill record
     */
    async verifyCertification(skillRecordId, certificationData, options = {}) {
        try {
            logger.info('Verifying skill through certification', {
                skillRecordId,
                certificationName: certificationData.certificationName
            });

            const dbService = this._getDatabaseService();
            const ConsultantSkill = dbService.getModel('ConsultantSkill', 'customer');

            const skillRecord = await this._findSkillRecord(skillRecordId);

            // Check tenant access with validation
            if (options.tenantId && !options.skipTenantCheck && mongoose.Types.ObjectId.isValid(options.tenantId) &&
                skillRecord.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this skill record');
            }

            const updatedRecord = await ConsultantSkill.findByIdAndUpdate(
                skillRecord._id,
                {
                    $set: {
                        'proficiency.certificationBased': {
                            certified: true,
                            certificationId: certificationData.certificationId,
                            certificationName: certificationData.certificationName,
                            score: certificationData.score,
                            earnedAt: certificationData.earnedAt || new Date()
                        },
                        'verification.status': VERIFICATION_STATUS.CERTIFIED,
                        'verification.verifiedAt': new Date(),
                        'metadata.updatedBy': options.userId
                    },
                    $push: {
                        'verification.history': {
                            type: 'certification',
                            certificationName: certificationData.certificationName,
                            score: certificationData.score,
                            verifiedAt: new Date()
                        }
                    }
                },
                { new: true }
            );

            // Recalculate proficiency
            updatedRecord._calculateOverallProficiency?.();
            await updatedRecord.save?.();

            // Track event
            await this._trackSkillEvent(updatedRecord, 'skill_certified', {
                userId: options.userId,
                certificationName: certificationData.certificationName
            });

            logger.info('Skill verified through certification', {
                skillRecordId,
                certificationName: certificationData.certificationName
            });

            return this._sanitizeSkillOutput(updatedRecord);

        } catch (error) {
            logger.error('Failed to verify skill through certification', {
                error: error.message,
                skillRecordId
            });
            throw error;
        }
    }

    // ============================================================================
    // SKILL DELETION
    // ============================================================================

    /**
     * Delete skill record (soft delete)
     * @param {string} skillRecordId - Skill record ID
     * @param {Object} options - Delete options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {string} options.userId - User ID performing deletion
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @param {boolean} options.hardDelete - Perform permanent deletion
     * @returns {Promise<Object>} Deletion result
     */
    async deleteSkillRecord(skillRecordId, options = {}) {
        try {
            logger.info('Deleting skill record', { skillRecordId, hardDelete: options.hardDelete });

            const dbService = this._getDatabaseService();
            const ConsultantSkill = dbService.getModel('ConsultantSkill', 'customer');

            const skillRecord = await this._findSkillRecord(skillRecordId);

            // Check tenant access with validation
            if (options.tenantId && !options.skipTenantCheck && mongoose.Types.ObjectId.isValid(options.tenantId) &&
                skillRecord.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this skill record');
            }

            const consultantId = skillRecord.consultantId;
            const skillName = skillRecord.skill.name;

            if (options.hardDelete) {
                await ConsultantSkill.findByIdAndDelete(skillRecord._id);
            } else {
                await ConsultantSkill.findByIdAndUpdate(skillRecord._id, {
                    $set: {
                        'status.isDeleted': true,
                        'status.deletedAt': new Date(),
                        'status.deletedBy': options.userId,
                        'status.isActive': false
                    }
                });
            }

            // Remove from consultant embedded skills
            await this._syncToConsultantSkills({ _id: consultantId }, skillRecord, 'remove');

            // Track event
            await this._trackSkillEvent(skillRecord, 'skill_record_deleted', {
                userId: options.userId,
                hardDelete: options.hardDelete
            });

            logger.info('Skill record deleted', { skillRecordId, hardDelete: options.hardDelete });

            return {
                success: true,
                skillRecordId: skillRecord.skillRecordId,
                skillName,
                deleted: true
            };

        } catch (error) {
            logger.error('Failed to delete skill record', {
                error: error.message,
                skillRecordId
            });
            throw error;
        }
    }

    // ============================================================================
    // ANALYTICS & REPORTS
    // ============================================================================

    /**
     * Get skill distribution for organization
     * @param {Object} options - Query options
     * @param {string} options.tenantId - Tenant ID
     * @param {string} options.consultantId - Filter by consultant
     * @returns {Promise<Object>} Skill distribution statistics
     */
    async getSkillDistribution(options = {}) {
        try {
            logger.info('Getting skill distribution', {
                tenantId: options.tenantId,
                consultantId: options.consultantId
            });

            const dbService = this._getDatabaseService();
            const ConsultantSkill = dbService.getModel('ConsultantSkill', 'customer');

            // Get tenantId with validation
            const tenantId = options.tenantId || this.config.companyTenantId;
            const tenantIdToUse = (tenantId && mongoose.Types.ObjectId.isValid(tenantId)) ? tenantId : this.config.companyTenantId;

            const distribution = await ConsultantSkill.getSkillDistribution(
                tenantIdToUse,
                options.consultantId
            );

            return {
                byCategory: distribution[0]?.byCategory || [],
                byLevel: distribution[0]?.byLevel || [],
                topSkills: distribution[0]?.topSkills || [],
                generatedAt: new Date()
            };

        } catch (error) {
            logger.error('Failed to get skill distribution', {
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Get skill gap analysis for consultant
     * @param {string} consultantId - Consultant ID
     * @param {Array<Object>} requiredSkills - Required skills with target levels
     * @param {Object} options - Analysis options
     * @param {string} options.tenantId - Tenant ID
     * @returns {Promise<Object>} Skill gap analysis
     */
    async getSkillGapAnalysis(consultantId, requiredSkills, options = {}) {
        try {
            logger.info('Performing skill gap analysis', {
                consultantId,
                requiredSkillsCount: requiredSkills.length
            });

            // Validate consultantId
            if (!consultantId || !mongoose.Types.ObjectId.isValid(consultantId)) {
                throw AppError.validation('Invalid consultant ID format');
            }

            const dbService = this._getDatabaseService();
            const ConsultantSkill = dbService.getModel('ConsultantSkill', 'customer');

            // Get consultant's current skills
            const currentSkills = await ConsultantSkill.find({
                consultantId: new mongoose.Types.ObjectId(consultantId),
                'status.isDeleted': false,
                'status.isActive': true
            }).select('skill.name skill.normalizedName proficiency.level proficiency.score');

            const currentSkillMap = new Map();
            currentSkills.forEach(s => {
                currentSkillMap.set(s.skill.normalizedName, {
                    name: s.skill.name,
                    level: s.proficiency.level,
                    score: s.proficiency.score
                });
            });

            // Analyze gaps
            const gaps = [];
            const matched = [];
            const exceeds = [];

            for (const required of requiredSkills) {
                const normalizedName = required.name.toLowerCase().trim();
                const current = currentSkillMap.get(normalizedName);
                const requiredScore = PROFICIENCY_VALUES[required.targetLevel] || 40;

                if (!current) {
                    gaps.push({
                        skillName: required.name,
                        requiredLevel: required.targetLevel,
                        currentLevel: 'none',
                        gap: requiredScore
                    });
                } else if (current.score < requiredScore) {
                    gaps.push({
                        skillName: required.name,
                        requiredLevel: required.targetLevel,
                        currentLevel: current.level,
                        currentScore: current.score,
                        gap: requiredScore - current.score
                    });
                } else if (current.score > requiredScore) {
                    exceeds.push({
                        skillName: required.name,
                        requiredLevel: required.targetLevel,
                        currentLevel: current.level,
                        currentScore: current.score,
                        surplus: current.score - requiredScore
                    });
                } else {
                    matched.push({
                        skillName: required.name,
                        requiredLevel: required.targetLevel,
                        currentLevel: current.level,
                        currentScore: current.score
                    });
                }
            }

            // Calculate readiness score
            const totalRequired = requiredSkills.length;
            const readinessScore = totalRequired > 0
                ? Math.round(((matched.length + exceeds.length) / totalRequired) * 100)
                : 100;

            return {
                consultantId,
                readinessScore,
                summary: {
                    totalRequired: totalRequired,
                    matched: matched.length,
                    exceeds: exceeds.length,
                    gaps: gaps.length
                },
                gaps,
                matched,
                exceeds,
                generatedAt: new Date()
            };

        } catch (error) {
            logger.error('Failed to perform skill gap analysis', {
                error: error.message,
                consultantId
            });
            throw error;
        }
    }

    /**
     * Get organization skill matrix
     * @param {Object} options - Query options
     * @param {string} options.tenantId - Tenant ID
     * @param {Array<string>} options.skills - Specific skills to include
     * @param {string} options.department - Filter by department
     * @param {number} options.limit - Maximum consultants
     * @returns {Promise<Object>} Skill matrix
     */
    async getOrganizationSkillMatrix(options = {}) {
        try {
            logger.info('Generating organization skill matrix', {
                tenantId: options.tenantId
            });

            const dbService = this._getDatabaseService();
            const ConsultantSkill = dbService.getModel('ConsultantSkill', 'customer');

            // Build match stage with validated tenantId
            const tenantId = options.tenantId || this.config.companyTenantId;
            const matchStage = {
                'status.isDeleted': false,
                'status.isActive': true
            };

            // Add tenantId with validation
            if (tenantId && mongoose.Types.ObjectId.isValid(tenantId)) {
                matchStage.tenantId = new mongoose.Types.ObjectId(tenantId);
            }

            if (options.skills && options.skills.length > 0) {
                matchStage['skill.normalizedName'] = {
                    $in: options.skills.map(s => s.toLowerCase().trim())
                };
            }

            const pipeline = [
                { $match: matchStage },
                {
                    $group: {
                        _id: {
                            consultantId: '$consultantId',
                            skillName: '$skill.normalizedName'
                        },
                        displayName: { $first: '$skill.name' },
                        level: { $first: '$proficiency.level' },
                        score: { $first: '$proficiency.score' }
                    }
                },
                {
                    $group: {
                        _id: '$_id.consultantId',
                        skills: {
                            $push: {
                                name: '$displayName',
                                normalizedName: '$_id.skillName',
                                level: '$level',
                                score: '$score'
                            }
                        }
                    }
                },
                { $limit: options.limit || 100 },
                {
                    $lookup: {
                        from: 'consultants',
                        localField: '_id',
                        foreignField: '_id',
                        as: 'consultant',
                        pipeline: [
                            {
                                $project: {
                                    consultantCode: 1,
                                    'profile.firstName': 1,
                                    'profile.lastName': 1,
                                    'professional.level': 1,
                                    'professional.department': 1
                                }
                            }
                        ]
                    }
                },
                { $unwind: '$consultant' }
            ];

            const results = await ConsultantSkill.aggregate(pipeline);

            // Extract unique skills for columns
            const allSkills = new Set();
            results.forEach(r => {
                r.skills.forEach(s => allSkills.add(s.normalizedName));
            });

            return {
                consultants: results.map(r => ({
                    consultant: r.consultant,
                    skills: r.skills
                })),
                skillColumns: Array.from(allSkills),
                generatedAt: new Date()
            };

        } catch (error) {
            logger.error('Failed to generate skill matrix', {
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Get skill statistics
     * @param {Object} options - Query options
     * @param {string} options.tenantId - Tenant ID
     * @param {string} options.consultantId - Filter by consultant
     * @returns {Promise<Object>} Skill statistics
     */
    async getSkillStatistics(options = {}) {
        try {
            logger.info('Generating skill statistics', {
                tenantId: options.tenantId
            });

            const dbService = this._getDatabaseService();
            const ConsultantSkill = dbService.getModel('ConsultantSkill', 'customer');

            // Build match stage with validated IDs
            const tenantId = options.tenantId || this.config.companyTenantId;
            const matchStage = {
                'status.isDeleted': false
            };

            // Add tenantId with validation
            if (tenantId && mongoose.Types.ObjectId.isValid(tenantId)) {
                matchStage.tenantId = new mongoose.Types.ObjectId(tenantId);
            }

            // Add consultantId with validation
            if (options.consultantId && mongoose.Types.ObjectId.isValid(options.consultantId)) {
                matchStage.consultantId = new mongoose.Types.ObjectId(options.consultantId);
            }

            const stats = await ConsultantSkill.aggregate([
                { $match: matchStage },
                {
                    $facet: {
                        totals: [
                            { $count: 'total' }
                        ],
                        byCategory: [
                            { $group: { _id: '$skill.category', count: { $sum: 1 }, avgScore: { $avg: '$proficiency.score' } } },
                            { $sort: { count: -1 } }
                        ],
                        byLevel: [
                            { $group: { _id: '$proficiency.level', count: { $sum: 1 } } }
                        ],
                        byVerification: [
                            { $group: { _id: '$verification.status', count: { $sum: 1 } } }
                        ],
                        avgScores: [
                            { $group: { _id: null, avgScore: { $avg: '$proficiency.score' }, avgExperience: { $avg: '$experience.yearsOfExperience' } } }
                        ],
                        recentlyUpdated: [
                            { $sort: { updatedAt: -1 } },
                            { $limit: 10 },
                            { $project: { skillRecordId: 1, 'skill.name': 1, 'proficiency.level': 1, updatedAt: 1 } }
                        ]
                    }
                }
            ]);

            const result = stats[0];

            return {
                total: result.totals[0]?.total || 0,
                distribution: {
                    byCategory: result.byCategory,
                    byLevel: result.byLevel,
                    byVerification: result.byVerification
                },
                averages: result.avgScores[0] || {},
                recentlyUpdated: result.recentlyUpdated,
                generatedAt: new Date()
            };

        } catch (error) {
            logger.error('Failed to generate skill statistics', {
                error: error.message
            });
            throw error;
        }
    }

    // ============================================================================
    // PRIVATE HELPER METHODS
    // ============================================================================

    /**
     * Find skill record by ID or code
     * @private
     * @param {string} skillRecordId - Skill record ID
     * @returns {Promise<Object>} Skill record document
     */
    async _findSkillRecord(skillRecordId) {
        const dbService = this._getDatabaseService();
        const ConsultantSkill = dbService.getModel('ConsultantSkill', 'customer');

        let skillRecord;
        if (mongoose.Types.ObjectId.isValid(skillRecordId)) {
            skillRecord = await ConsultantSkill.findById(skillRecordId);
        }

        if (!skillRecord) {
            skillRecord = await ConsultantSkill.findOne({
                skillRecordId: skillRecordId.toUpperCase()
            });
        }

        if (!skillRecord) {
            throw AppError.notFound('Skill record not found', {
                context: { skillRecordId }
            });
        }

        return skillRecord;
    }

    /**
     * Generate skill record ID
     * @private
     * @returns {string} Generated skill record ID
     */
    _generateSkillRecordId() {
        const timestamp = Date.now().toString(36).toUpperCase();
        const random = crypto.randomBytes(3).toString('hex').toUpperCase();
        return `SKR-${timestamp}${random}`;
    }

    /**
     * Validate skill data
     * @private
     * @param {Object} data - Skill data
     */
    async _validateSkillData(data) {
        const errors = [];

        if (!data.name) {
            errors.push('Skill name is required');
        }

        if (!data.category) {
            errors.push('Skill category is required');
        } else if (!Object.values(SKILL_CATEGORIES).includes(data.category)) {
            errors.push('Invalid skill category');
        }

        if (data.proficiency?.level && !Object.values(PROFICIENCY_LEVELS).includes(data.proficiency.level)) {
            errors.push('Invalid proficiency level');
        }

        if (errors.length > 0) {
            throw AppError.validation('Skill validation failed', { errors });
        }
    }

    /**
     * Validate skill update data
     * @private
     * @param {Object} data - Update data
     */
    async _validateSkillUpdateData(data) {
        const errors = [];

        if (data.goals?.targetLevel && !Object.values(PROFICIENCY_LEVELS).includes(data.goals.targetLevel)) {
            errors.push('Invalid target proficiency level');
        }

        if (errors.length > 0) {
            throw AppError.validation('Update validation failed', { errors });
        }
    }

    /**
     * Check for duplicate skill
     * @private
     * @param {string} consultantId - Consultant ID
     * @param {string} skillName - Skill name
     * @param {string} tenantId - Tenant ID
     */
    async _checkDuplicateSkill(consultantId, skillName, tenantId) {
        const dbService = this._getDatabaseService();
        const ConsultantSkill = dbService.getModel('ConsultantSkill', 'customer');

        // Validate consultantId before query
        if (!consultantId || !mongoose.Types.ObjectId.isValid(consultantId)) {
            throw AppError.validation('Invalid consultant ID format');
        }

        const existing = await ConsultantSkill.findOne({
            tenantId,
            consultantId: new mongoose.Types.ObjectId(consultantId),
            'skill.normalizedName': skillName.toLowerCase().trim(),
            'status.isDeleted': false
        });

        if (existing) {
            throw AppError.conflict('Consultant already has this skill', {
                context: { skillName }
            });
        }
    }

    /**
     * Sync skill to consultant's embedded skills array
     * @private
     * @param {Object} consultant - Consultant document or ID reference
     * @param {Object} skillRecord - Skill record
     * @param {string} action - Action type (add, update, remove)
     */
    async _syncToConsultantSkills(consultant, skillRecord, action) {
        try {
            const dbService = this._getDatabaseService();
            const Consultant = dbService.getModel('Consultant', 'customer');

            const consultantId = consultant._id || consultant;

            // Validate consultantId
            if (!consultantId || !mongoose.Types.ObjectId.isValid(consultantId)) {
                logger.warn('Invalid consultant ID for skill sync', { consultantId });
                return;
            }

            if (action === 'add') {
                await Consultant.findByIdAndUpdate(consultantId, {
                    $push: {
                        skills: {
                            skillId: skillRecord._id,
                            name: skillRecord.skill.name,
                            category: skillRecord.skill.category,
                            proficiencyLevel: skillRecord.proficiency.level,
                            yearsOfExperience: skillRecord.experience.yearsOfExperience,
                            lastUsed: skillRecord.experience.lastUsed,
                            verified: skillRecord.verification?.status !== VERIFICATION_STATUS.NOT_VERIFIED
                        }
                    }
                });
            } else if (action === 'update') {
                await Consultant.findOneAndUpdate(
                    { _id: consultantId, 'skills.skillId': skillRecord._id },
                    {
                        $set: {
                            'skills.$.proficiencyLevel': skillRecord.proficiency.level,
                            'skills.$.yearsOfExperience': skillRecord.experience.yearsOfExperience,
                            'skills.$.lastUsed': skillRecord.experience.lastUsed,
                            'skills.$.verified': skillRecord.verification?.status !== VERIFICATION_STATUS.NOT_VERIFIED
                        }
                    }
                );
            } else if (action === 'remove') {
                await Consultant.findByIdAndUpdate(consultantId, {
                    $pull: { skills: { skillId: skillRecord._id } }
                });
            }
        } catch (error) {
            logger.warn('Failed to sync skill to consultant', {
                error: error.message,
                consultantId: consultant._id || consultant,
                skillRecordId: skillRecord._id
            });
        }
    }

    /**
     * Send assessment notification
     * @private
     * @param {Object} skillRecord - Skill record
     * @param {Object} assessmentData - Assessment data
     * @param {Object} options - Options
     */
    async _sendAssessmentNotification(skillRecord, assessmentData, options) {
        try {
            const dbService = this._getDatabaseService();
            const Consultant = dbService.getModel('Consultant', 'customer');

            const consultant = await Consultant.findById(skillRecord.consultantId)
                .select('contact.email.primary profile.firstName');

            if (consultant?.contact?.email?.primary) {
                await this.notificationService?.sendEmail?.({
                    to: consultant.contact.email.primary,
                    template: 'skill_assessment_received',
                    data: {
                        firstName: consultant.profile.firstName,
                        skillName: skillRecord.skill.name,
                        assessmentType: assessmentData.type,
                        newLevel: skillRecord.proficiency.level
                    }
                });
            }
        } catch (error) {
            logger.warn('Failed to send assessment notification', {
                error: error.message,
                skillRecordId: skillRecord._id
            });
        }
    }

    /**
     * Send endorsement notification
     * @private
     * @param {Object} skillRecord - Skill record
     * @param {Object} endorsementData - Endorsement data
     * @param {Object} options - Options
     */
    async _sendEndorsementNotification(skillRecord, endorsementData, options) {
        try {
            const dbService = this._getDatabaseService();
            const Consultant = dbService.getModel('Consultant', 'customer');

            const consultant = await Consultant.findById(skillRecord.consultantId)
                .select('contact.email.primary profile.firstName');

            if (consultant?.contact?.email?.primary) {
                await this.notificationService?.sendEmail?.({
                    to: consultant.contact.email.primary,
                    template: 'skill_endorsement_received',
                    data: {
                        firstName: consultant.profile.firstName,
                        skillName: skillRecord.skill.name,
                        endorserComment: endorsementData.comment
                    }
                });
            }
        } catch (error) {
            logger.warn('Failed to send endorsement notification', {
                error: error.message,
                skillRecordId: skillRecord._id
            });
        }
    }

    /**
     * Track skill event
     * @private
     * @param {Object} skillRecord - Skill record
     * @param {string} eventType - Event type
     * @param {Object} data - Event data
     */
    async _trackSkillEvent(skillRecord, eventType, data) {
        try {
            await this.analyticsService?.trackEvent?.({
                eventType,
                entityType: 'consultant_skill',
                entityId: skillRecord._id,
                tenantId: skillRecord.tenantId,
                data: {
                    skillRecordId: skillRecord.skillRecordId,
                    consultantId: skillRecord.consultantId,
                    skillName: skillRecord.skill?.name,
                    ...data
                },
                timestamp: new Date()
            });
        } catch (error) {
            logger.warn('Failed to track skill event', {
                error: error.message,
                eventType,
                skillRecordId: skillRecord._id
            });
        }
    }

    /**
     * Sanitize skill output
     * @private
     * @param {Object} skillRecord - Skill record document
     * @returns {Object} Sanitized skill record
     */
    _sanitizeSkillOutput(skillRecord) {
        if (!skillRecord) return null;

        const sanitized = skillRecord.toObject ? skillRecord.toObject() : { ...skillRecord };

        // Remove internal fields
        delete sanitized.__v;

        return sanitized;
    }
}

// Export singleton instance
module.exports = new ConsultantSkillService();
module.exports.ConsultantSkillService = ConsultantSkillService;
module.exports.SKILL_CATEGORIES = SKILL_CATEGORIES;
module.exports.PROFICIENCY_LEVELS = PROFICIENCY_LEVELS;
module.exports.PROFICIENCY_VALUES = PROFICIENCY_VALUES;
module.exports.VERIFICATION_STATUS = VERIFICATION_STATUS;
module.exports.ASSESSMENT_TYPES = ASSESSMENT_TYPES;
module.exports.SKILL_APPLICATION = SKILL_APPLICATION;
module.exports.PROJECT_COMPLEXITY = PROJECT_COMPLEXITY;
module.exports.SKILL_STATUS = SKILL_STATUS;