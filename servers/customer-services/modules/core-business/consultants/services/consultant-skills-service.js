'use strict';

/**
 * @fileoverview Enterprise consultant skills service with comprehensive skills assessment and management
 * @module servers/customer-services/modules/core-business/consultants/services/consultant-skills-service
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/async-handler
 * @requires module:shared/lib/services/cache-service
 * @requires module:shared/lib/services/email-service
 * @requires module:shared/lib/services/notification-service
 * @requires module:shared/lib/security/audit/audit-service
 * @requires module:servers/customer-services/modules/core-business/consultants/models/consultant-skill-model
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
const MarketDataService = require('../../../../../../shared/lib/services/market-data-service');
const ConsultantSkillModel = require('../models/consultant-skill-model');
const ConsultantModel = require('../models/consultant-model');
const ExcelJS = require('exceljs');
const crypto = require('crypto');
const moment = require('moment');

/**
 * Enterprise consultant skills service for comprehensive skills management
 * @class ConsultantSkillsService
 * @description Manages skills assessment, verification, endorsements, gap analysis, and market tracking
 */
class ConsultantSkillsService {
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
     * @type {MarketDataService}
     */
    #marketDataService;

    /**
     * @private
     * @type {number}
     */
    #defaultCacheTTL = 3600; // 1 hour

    /**
     * @private
     * @type {number}
     */
    #maxSkillsPerConsultant = 100;

    /**
     * @private
     * @type {number}
     */
    #maxEndorsementsPerSkill = 50;

    /**
     * @private
     * @type {Object}
     */
    #proficiencyLevels = {
        0: 'none',
        1: 'awareness',
        2: 'basic',
        3: 'working',
        4: 'proficient',
        5: 'advanced',
        6: 'expert',
        7: 'specialist',
        8: 'authority',
        9: 'master',
        10: 'thought_leader'
    };

    /**
     * @private
     * @type {Object}
     */
    #assessmentWeights = {
        selfAssessment: 0.15,
        managerAssessment: 0.30,
        peerAssessment: 0.20,
        clientAssessment: 0.20,
        formalAssessment: 0.15
    };

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
    #pendingAssessments = new Map();

    /**
     * Creates an instance of ConsultantSkillsService
     * @constructor
     * @param {Object} dependencies - Service dependencies
     */
    constructor(dependencies = {}) {
        this.#cacheService = dependencies.cacheService || new CacheService();
        this.#emailService = dependencies.emailService || new EmailService();
        this.#notificationService = dependencies.notificationService || new NotificationService();
        this.#auditService = dependencies.auditService || new AuditService();
        this.#marketDataService = dependencies.marketDataService || new MarketDataService();

        this.#initializeService();
    }

    /**
     * Initialize service components
     * @private
     */
    #initializeService() {
        logger.info('Initializing ConsultantSkillsService', {
            cacheEnabled: !!this.#cacheService,
            emailEnabled: !!this.#emailService,
            notificationEnabled: !!this.#notificationService,
            auditEnabled: !!this.#auditService,
            marketDataEnabled: !!this.#marketDataService
        });
    }

    // ==================== Skills Management ====================

    /**
     * Add skill to consultant
     * @param {string} consultantId - Consultant ID
     * @param {Object} skillData - Skill information
     * @param {string} userId - User adding skill
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} Added skill
     */
    async addConsultantSkill(consultantId, skillData, userId, options = {}) {
        const session = options.session || null;

        try {
            // Validate consultant exists
            const consultant = await ConsultantModel.findById(consultantId);
            if (!consultant) {
                throw new NotFoundError('Consultant not found', 'CONSULTANT_NOT_FOUND');
            }

            // Check skill limit
            const existingSkills = await ConsultantSkillModel.countDocuments({
                consultantId,
                isDeleted: false
            });

            if (existingSkills >= this.#maxSkillsPerConsultant) {
                throw new ValidationError(
                    `Maximum skills limit (${this.#maxSkillsPerConsultant}) reached`,
                    'SKILLS_LIMIT_EXCEEDED'
                );
            }

            // Validate skill data
            await this.#validateSkillData(skillData);

            // Check for duplicate skill
            await this.#checkDuplicateSkill(consultantId, skillData.skill.name);

            // Generate skill ID
            const skillId = await ConsultantSkillModel.generateSkillId();

            // Enrich skill data
            const enrichedData = await this.#enrichSkillData(skillData, consultant);

            // Get market data for skill
            const marketData = await this.#getSkillMarketData(skillData.skill.name);

            // Create skill record
            const skill = await ConsultantSkillModel.create([{
                ...enrichedData,
                skillId,
                consultantId,
                tenantId: consultant.tenantId,
                organizationId: consultant.organizationId,
                market: marketData,
                metadata: {
                    source: options.source || 'manual',
                    confidence: 50,
                    lastReviewed: new Date()
                }
            }], { session });

            // Update consultant's skill array
            await this.#updateConsultantSkillsArray(consultantId, skill[0]._id, session);

            // Request initial assessment
            if (options.requestAssessment) {
                await this.#requestSkillAssessment(skill[0], userId);
            }

            // Send notifications
            await this.#sendSkillAddedNotifications(consultant, skill[0], userId);

            // Log audit trail
            await this.#auditService.log({
                action: 'SKILL_ADDED',
                entityType: 'consultant_skill',
                entityId: skill[0]._id,
                userId,
                details: {
                    consultantId,
                    skillName: skill[0].skill.name,
                    category: skill[0].skill.category.primary
                }
            });

            // Clear caches
            await this.#clearSkillCaches(consultant.tenantId, consultantId);

            logger.info('Skill added successfully', {
                skillId: skill[0].skillId,
                consultantId,
                skillName: skill[0].skill.name
            });

            return skill[0];
        } catch (error) {
            logger.error('Error adding consultant skill', {
                error: error.message,
                consultantId,
                skillName: skillData.skill?.name
            });
            throw error;
        }
    }

    /**
     * Update skill proficiency
     * @param {string} consultantId - Consultant ID
     * @param {string} skillId - Skill ID
     * @param {Object} proficiencyData - Proficiency update
     * @param {string} userId - User updating proficiency
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} Updated skill
     */
    async updateSkillProficiency(consultantId, skillId, proficiencyData, userId, options = {}) {
        const session = options.session || null;

        try {
            // Get skill record
            const skill = await ConsultantSkillModel.findOne({
                consultantId,
                skillId,
                isDeleted: false
            });

            if (!skill) {
                throw new NotFoundError('Skill not found', 'SKILL_NOT_FOUND');
            }

            // Validate proficiency data
            await this.#validateProficiencyData(proficiencyData);

            // Check authorization for assessment type
            await this.#checkAssessmentAuthorization(proficiencyData.assessmentType, userId, consultantId);

            // Update proficiency based on assessment type
            switch (proficiencyData.assessmentType) {
                case 'self':
                    skill.proficiency.selfAssessment = {
                        level: proficiencyData.level,
                        confidence: proficiencyData.confidence || 70,
                        date: new Date(),
                        justification: proficiencyData.justification
                    };
                    break;

                case 'manager':
                    skill.proficiency.managerAssessment = {
                        level: proficiencyData.level,
                        assessedBy: userId,
                        date: new Date(),
                        comments: proficiencyData.comments
                    };
                    break;

                case 'peer':
                    skill.proficiency.peerAssessments.push({
                        level: proficiencyData.level,
                        assessedBy: userId,
                        date: new Date(),
                        relationship: proficiencyData.relationship,
                        comments: proficiencyData.comments
                    });
                    break;

                case 'client':
                    skill.proficiency.clientAssessments.push({
                        level: proficiencyData.level,
                        clientId: proficiencyData.clientId,
                        projectId: proficiencyData.projectId,
                        date: new Date(),
                        context: proficiencyData.context,
                        feedback: proficiencyData.feedback
                    });
                    break;

                case 'formal':
                    skill.proficiency.formalAssessment = {
                        level: proficiencyData.level,
                        method: proficiencyData.method,
                        provider: proficiencyData.provider,
                        date: new Date(),
                        score: proficiencyData.score,
                        percentile: proficiencyData.percentile,
                        certificateNumber: proficiencyData.certificateNumber,
                        expiryDate: proficiencyData.expiryDate,
                        report: proficiencyData.report
                    };
                    break;

                default:
                    throw new ValidationError('Invalid assessment type', 'INVALID_ASSESSMENT_TYPE');
            }

            // Recalculate overall proficiency
            skill.calculateProficiencyLevel();

            // Update development status
            await this.#updateDevelopmentStatus(skill);

            await skill.save({ session });

            // Check for significant changes
            if (Math.abs(skill.proficiency.currentLevel - skill.proficiency.calculatedLevel.value) > 1) {
                await this.#handleSignificantProficiencyChange(skill, userId);
            }

            // Send notifications
            await this.#sendProficiencyUpdateNotifications(skill, proficiencyData, userId);

            // Log audit trail
            await this.#auditService.log({
                action: 'SKILL_PROFICIENCY_UPDATED',
                entityType: 'consultant_skill',
                entityId: skill._id,
                userId,
                details: {
                    skillId: skill.skillId,
                    assessmentType: proficiencyData.assessmentType,
                    newLevel: skill.proficiency.currentLevel
                }
            });

            // Clear caches
            await this.#clearSkillCaches(skill.tenantId, consultantId);

            return skill;
        } catch (error) {
            logger.error('Error updating skill proficiency', {
                error: error.message,
                consultantId,
                skillId
            });
            throw error;
        }
    }

    // ==================== Skills Assessment ====================

    /**
     * Conduct comprehensive skill assessment
     * @param {string} consultantId - Consultant ID
     * @param {Object} assessmentData - Assessment configuration
     * @param {string} userId - User conducting assessment
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} Assessment results
     */
    async conductSkillAssessment(consultantId, assessmentData, userId, options = {}) {
        const session = options.session || null;

        try {
            // Validate assessment data
            await this.#validateAssessmentData(assessmentData);

            // Get consultant skills
            const skills = await ConsultantSkillModel.find({
                consultantId,
                isDeleted: false,
                'status.current': 'active'
            });

            if (skills.length === 0) {
                throw new NotFoundError('No skills found for consultant', 'NO_SKILLS_FOUND');
            }

            // Filter skills for assessment
            const skillsToAssess = await this.#filterSkillsForAssessment(skills, assessmentData);

            // Create assessment batch
            const assessmentBatch = {
                batchId: mongoose.Types.ObjectId().toString(),
                consultantId,
                assessmentType: assessmentData.type,
                skills: skillsToAssess.map(s => s.skillId),
                status: 'in_progress',
                createdBy: userId,
                createdAt: new Date()
            };

            this.#pendingAssessments.set(assessmentBatch.batchId, assessmentBatch);

            // Conduct assessments
            const results = {
                batchId: assessmentBatch.batchId,
                assessed: [],
                skipped: [],
                failed: []
            };

            for (const skill of skillsToAssess) {
                try {
                    const assessmentResult = await this.#assessSingleSkill(
                        skill,
                        assessmentData,
                        userId,
                        session
                    );

                    results.assessed.push({
                        skillId: skill.skillId,
                        skillName: skill.skill.name,
                        previousLevel: skill.proficiency.currentLevel,
                        newLevel: assessmentResult.level,
                        confidence: assessmentResult.confidence
                    });
                } catch (assessmentError) {
                    results.failed.push({
                        skillId: skill.skillId,
                        skillName: skill.skill.name,
                        error: assessmentError.message
                    });
                }
            }

            // Generate assessment report
            const report = await this.#generateAssessmentReport(results, assessmentData);

            // Send assessment completion notifications
            await this.#sendAssessmentCompletionNotifications(consultantId, report, userId);

            // Log audit trail
            await this.#auditService.log({
                action: 'SKILL_ASSESSMENT_COMPLETED',
                entityType: 'consultant',
                entityId: consultantId,
                userId,
                details: {
                    batchId: assessmentBatch.batchId,
                    skillsAssessed: results.assessed.length,
                    assessmentType: assessmentData.type
                }
            });

            // Clear pending assessment
            this.#pendingAssessments.delete(assessmentBatch.batchId);

            return report;
        } catch (error) {
            logger.error('Error conducting skill assessment', {
                error: error.message,
                consultantId,
                assessmentType: assessmentData.type
            });
            throw error;
        }
    }

    /**
     * Verify skill through certification
     * @param {string} consultantId - Consultant ID
     * @param {string} skillId - Skill ID
     * @param {Object} certificationData - Certification details
     * @param {string} userId - User verifying skill
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} Verification result
     */
    async verifySkillWithCertification(consultantId, skillId, certificationData, userId, options = {}) {
        const session = options.session || null;

        try {
            const skill = await ConsultantSkillModel.findOne({
                consultantId,
                skillId,
                isDeleted: false
            });

            if (!skill) {
                throw new NotFoundError('Skill not found', 'SKILL_NOT_FOUND');
            }

            // Validate certification
            await this.#validateCertification(certificationData);

            // Verify certification authenticity
            const verificationResult = await this.#verifyCertificationAuthenticity(certificationData);

            if (!verificationResult.isValid) {
                throw new ValidationError('Certification verification failed', 'CERTIFICATION_INVALID');
            }

            // Add certification to skill
            skill.certifications.push({
                name: certificationData.name,
                issuingBody: certificationData.issuingBody,
                certificationNumber: certificationData.number,
                level: certificationData.level,
                issueDate: certificationData.issueDate,
                expiryDate: certificationData.expiryDate,
                status: 'active',
                verificationUrl: certificationData.verificationUrl,
                documentUrl: certificationData.documentUrl,
                relevance: 'directly_related'
            });

            // Update skill verification status
            skill.status.verificationStatus = 'verified';
            skill.metadata.confidence = 95;

            // Update proficiency if certification indicates higher level
            if (certificationData.impliedLevel && certificationData.impliedLevel > skill.proficiency.currentLevel) {
                skill.proficiency.currentLevel = certificationData.impliedLevel;
                skill.proficiency.formalAssessment = {
                    level: certificationData.impliedLevel,
                    method: 'certification',
                    provider: certificationData.issuingBody,
                    date: new Date(),
                    certificateNumber: certificationData.number
                };
            }

            await skill.save({ session });

            // Send verification notifications
            await this.#sendVerificationNotifications(skill, certificationData, userId);

            // Log audit trail
            await this.#auditService.log({
                action: 'SKILL_VERIFIED',
                entityType: 'consultant_skill',
                entityId: skill._id,
                userId,
                details: {
                    skillId: skill.skillId,
                    certification: certificationData.name,
                    issuingBody: certificationData.issuingBody
                }
            });

            return {
                verified: true,
                skill: skill,
                certification: certificationData,
                verificationDate: new Date()
            };
        } catch (error) {
            logger.error('Error verifying skill with certification', {
                error: error.message,
                consultantId,
                skillId
            });
            throw error;
        }
    }

    // ==================== Endorsements ====================

    /**
     * Add skill endorsement
     * @param {string} consultantId - Consultant ID
     * @param {string} skillId - Skill ID
     * @param {Object} endorsementData - Endorsement details
     * @param {string} userId - User providing endorsement
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} Added endorsement
     */
    async addSkillEndorsement(consultantId, skillId, endorsementData, userId, options = {}) {
        const session = options.session || null;

        try {
            const skill = await ConsultantSkillModel.findOne({
                consultantId,
                skillId,
                isDeleted: false
            });

            if (!skill) {
                throw new NotFoundError('Skill not found', 'SKILL_NOT_FOUND');
            }

            // Check endorsement limit
            if (skill.endorsements.length >= this.#maxEndorsementsPerSkill) {
                throw new ValidationError(
                    `Maximum endorsements (${this.#maxEndorsementsPerSkill}) reached for this skill`,
                    'ENDORSEMENT_LIMIT_EXCEEDED'
                );
            }

            // Check for duplicate endorsement
            const existingEndorsement = skill.endorsements.find(
                e => e.endorsedBy.toString() === userId
            );

            if (existingEndorsement) {
                throw new ConflictError('You have already endorsed this skill', 'DUPLICATE_ENDORSEMENT');
            }

            // Validate endorsement eligibility
            await this.#validateEndorsementEligibility(userId, consultantId, skillId);

            // Add endorsement
            const endorsement = await skill.addEndorsement({
                endorsedBy: userId,
                role: endorsementData.role,
                relationship: endorsementData.relationship,
                projectId: endorsementData.projectId,
                level: endorsementData.level,
                examples: endorsementData.examples,
                strengths: endorsementData.strengths,
                improvements: endorsementData.improvements,
                recommend: endorsementData.recommend !== false,
                visibility: endorsementData.visibility || 'internal'
            });

            // Update skill confidence
            await this.#updateSkillConfidence(skill);

            // Send endorsement notifications
            await this.#sendEndorsementNotifications(skill, endorsement, userId);

            // Log audit trail
            await this.#auditService.log({
                action: 'SKILL_ENDORSED',
                entityType: 'consultant_skill',
                entityId: skill._id,
                userId,
                details: {
                    skillId: skill.skillId,
                    consultantId,
                    endorsementLevel: endorsement.level
                }
            });

            return endorsement;
        } catch (error) {
            logger.error('Error adding skill endorsement', {
                error: error.message,
                consultantId,
                skillId
            });
            throw error;
        }
    }

    // ==================== Gap Analysis ====================

    /**
     * Perform skill gap analysis
     * @param {string} consultantId - Consultant ID
     * @param {Object} targetProfile - Target skill profile
     * @param {Object} options - Analysis options
     * @returns {Promise<Object>} Gap analysis results
     */
    async performSkillGapAnalysis(consultantId, targetProfile, options = {}) {
        try {
            // Get consultant's current skills
            const currentSkills = await ConsultantSkillModel.find({
                consultantId,
                isDeleted: false,
                'status.current': 'active'
            });

            // Build current skill map
            const currentSkillMap = await this.#buildSkillMap(currentSkills);

            // Get target skills
            const targetSkills = await this.#getTargetSkills(targetProfile, options);

            // Calculate gaps
            const gaps = await this.#calculateSkillGaps(currentSkillMap, targetSkills);

            // Prioritize gaps
            const prioritizedGaps = await this.#prioritizeSkillGaps(gaps, options);

            // Generate recommendations
            const recommendations = await this.#generateGapRecommendations(prioritizedGaps, consultantId);

            // Calculate closing timeline and cost
            const implementation = await this.#calculateGapClosingPlan(prioritizedGaps, recommendations);

            // Generate gap analysis report
            const report = {
                analysisDate: new Date(),
                consultantId,
                currentProfile: {
                    totalSkills: currentSkills.length,
                    averageProficiency: this.#calculateAverageProficiency(currentSkills),
                    strengths: await this.#identifyStrengths(currentSkills),
                    weaknesses: await this.#identifyWeaknesses(currentSkills)
                },
                targetProfile: {
                    requiredSkills: targetSkills.length,
                    criticalSkills: targetSkills.filter(s => s.priority === 'critical').length
                },
                gaps: prioritizedGaps,
                recommendations,
                implementation,
                metrics: {
                    gapScore: this.#calculateGapScore(gaps),
                    readinessLevel: this.#calculateReadinessLevel(gaps, targetSkills),
                    estimatedTimeToClose: implementation.totalDuration,
                    estimatedCost: implementation.totalCost
                }
            };

            // Cache analysis results
            await this.#cacheGapAnalysis(consultantId, report);

            // Send gap analysis notifications
            await this.#sendGapAnalysisNotifications(consultantId, report, options.userId);

            // Log audit trail
            await this.#auditService.log({
                action: 'SKILL_GAP_ANALYSIS_PERFORMED',
                entityType: 'consultant',
                entityId: consultantId,
                userId: options.userId,
                details: {
                    gapsIdentified: prioritizedGaps.length,
                    gapScore: report.metrics.gapScore
                }
            });

            return report;
        } catch (error) {
            logger.error('Error performing skill gap analysis', {
                error: error.message,
                consultantId
            });
            throw error;
        }
    }

    /**
     * Generate training recommendations
     * @param {string} consultantId - Consultant ID
     * @param {Object} options - Recommendation options
     * @returns {Promise<Array>} Training recommendations
     */
    async generateTrainingRecommendations(consultantId, options = {}) {
        try {
            // Get consultant's skills and gaps
            const skills = await ConsultantSkillModel.find({
                consultantId,
                isDeleted: false
            });

            // Identify skills needing improvement
            const improvementNeeded = skills.filter(skill => 
                skill.developmentRequired || 
                skill.proficiency.currentLevel < (skill.proficiency.targetLevel || 5)
            );

            // Get market demand data
            const marketDemand = await this.#getMarketDemandForSkills();

            // Generate recommendations
            const recommendations = [];

            for (const skill of improvementNeeded) {
                const recommendation = await this.#generateSkillRecommendation(skill, marketDemand);
                if (recommendation) {
                    recommendations.push(recommendation);
                }
            }

            // Add emerging skills recommendations
            const emergingSkills = await this.#identifyEmergingSkills(consultantId, marketDemand);
            for (const emergingSkill of emergingSkills) {
                recommendations.push(await this.#generateEmergingSkillRecommendation(emergingSkill));
            }

            // Prioritize recommendations
            const prioritizedRecommendations = await this.#prioritizeRecommendations(recommendations, options);

            // Add learning paths
            for (const recommendation of prioritizedRecommendations) {
                recommendation.learningPath = await this.#generateLearningPath(recommendation);
            }

            return prioritizedRecommendations;
        } catch (error) {
            logger.error('Error generating training recommendations', {
                error: error.message,
                consultantId
            });
            throw error;
        }
    }

    // ==================== Market Tracking ====================

    /**
     * Track skill market demand
     * @param {Object} filters - Market tracking filters
     * @param {Object} options - Tracking options
     * @returns {Promise<Object>} Market demand data
     */
    async trackSkillMarketDemand(filters = {}, options = {}) {
        try {
            // Check cache
            const cacheKey = this.#generateCacheKey('market-demand', filters, options);
            const cached = await this.#cacheService.get(cacheKey);
            if (cached) {
                return cached;
            }

            // Get market data from external service
            const marketData = await this.#marketDataService.getSkillDemand(filters);

            // Analyze trends
            const trends = await this.#analyzeMarketTrends(marketData);

            // Compare with internal skills inventory
            const comparison = await this.#compareWithInternalInventory(marketData, options.tenantId);

            // Generate insights
            const insights = await this.#generateMarketInsights(marketData, trends, comparison);

            // Build market report
            const report = {
                timestamp: new Date(),
                filters,
                marketData,
                trends,
                comparison,
                insights,
                recommendations: await this.#generateMarketRecommendations(insights)
            };

            // Cache results
            await this.#cacheService.set(cacheKey, report, 3600); // 1 hour cache

            return report;
        } catch (error) {
            logger.error('Error tracking skill market demand', {
                error: error.message,
                filters
            });
            throw error;
        }
    }

    /**
     * Update skill market values
     * @param {Object} options - Update options
     * @returns {Promise<Object>} Update results
     */
    async updateSkillMarketValues(options = {}) {
        const { tenantId, batchSize = 100 } = options;

        try {
            const results = {
                updated: 0,
                failed: 0,
                errors: []
            };

            // Get all active skills
            const query = {
                isDeleted: false,
                'status.current': 'active'
            };

            if (tenantId) query.tenantId = tenantId;

            const totalSkills = await ConsultantSkillModel.countDocuments(query);
            const batches = Math.ceil(totalSkills / batchSize);

            for (let i = 0; i < batches; i++) {
                const skills = await ConsultantSkillModel.find(query)
                    .skip(i * batchSize)
                    .limit(batchSize);

                for (const skill of skills) {
                    try {
                        // Get latest market data
                        const marketData = await this.#getSkillMarketData(skill.skill.name);

                        // Update skill market values
                        skill.market = {
                            ...skill.market,
                            ...marketData,
                            lastUpdated: new Date()
                        };

                        await skill.save();
                        results.updated++;
                    } catch (error) {
                        results.failed++;
                        results.errors.push({
                            skillId: skill.skillId,
                            error: error.message
                        });
                    }
                }
            }

            // Log update
            logger.info('Skill market values updated', results);

            return results;
        } catch (error) {
            logger.error('Error updating skill market values', {
                error: error.message,
                options
            });
            throw error;
        }
    }

    // ==================== Competency Matrix ====================

    /**
     * Build competency matrix
     * @param {string} consultantId - Consultant ID
     * @param {Object} options - Matrix options
     * @returns {Promise<Object>} Competency matrix
     */
    async buildCompetencyMatrix(consultantId, options = {}) {
        try {
            // Get all consultant skills
            const skills = await ConsultantSkillModel.getSkillsMatrix(consultantId, options.tenantId);

            // Build matrix structure
            const matrix = {
                consultantId,
                generatedAt: new Date(),
                categories: {},
                summary: {
                    totalSkills: 0,
                    averageProficiency: 0,
                    verifiedSkills: 0,
                    developingSkills: 0
                }
            };

            // Process skills by category
            for (const [category, categoryData] of Object.entries(skills)) {
                matrix.categories[category] = {
                    ...categoryData,
                    competencyLevel: this.#calculateCompetencyLevel(categoryData),
                    maturityStage: this.#determineMaturityStage(categoryData)
                };

                matrix.summary.totalSkills += categoryData.totalSkills;
                matrix.summary.verifiedSkills += categoryData.verified;
                matrix.summary.developingSkills += categoryData.developing;
            }

            // Calculate overall metrics
            matrix.summary.averageProficiency = this.#calculateOverallProficiency(matrix.categories);
            matrix.overallCompetency = this.#calculateOverallCompetency(matrix);

            // Add comparisons
            matrix.comparisons = await this.#generateCompetencyComparisons(matrix, options);

            // Add recommendations
            matrix.recommendations = await this.#generateCompetencyRecommendations(matrix);

            return matrix;
        } catch (error) {
            logger.error('Error building competency matrix', {
                error: error.message,
                consultantId
            });
            throw error;
        }
    }

    // ==================== Private Helper Methods ====================

    /**
     * Validate skill data
     * @private
     */
    async #validateSkillData(skillData) {
        const errors = [];

        if (!skillData.skill?.name) {
            errors.push('Skill name is required');
        }

        if (!skillData.skill?.category?.primary) {
            errors.push('Skill category is required');
        }

        if (skillData.skill?.category?.primary && 
            !Object.keys(this.#skillCategories).includes(skillData.skill.category.primary)) {
            errors.push('Invalid skill category');
        }

        if (skillData.proficiency?.currentLevel !== undefined) {
            if (skillData.proficiency.currentLevel < 0 || skillData.proficiency.currentLevel > 10) {
                errors.push('Proficiency level must be between 0 and 10');
            }
        }

        if (errors.length > 0) {
            throw new ValidationError(errors.join(', '), 'VALIDATION_FAILED');
        }

        return true;
    }

    /**
     * Check for duplicate skill
     * @private
     */
    async #checkDuplicateSkill(consultantId, skillName) {
        const existing = await ConsultantSkillModel.findOne({
            consultantId,
            'skill.name': new RegExp(`^${skillName}$`, 'i'),
            isDeleted: false
        });

        if (existing) {
            throw new ConflictError(`Skill '${skillName}' already exists for consultant`, 'DUPLICATE_SKILL');
        }
    }

    /**
     * Enrich skill data with defaults
     * @private
     */
    async #enrichSkillData(skillData, consultant) {
        return {
            ...skillData,
            skill: {
                ...skillData.skill,
                type: skillData.skill.type || 'core',
                complexity: skillData.skill.complexity || 'intermediate'
            },
            proficiency: {
                currentLevel: skillData.proficiency?.currentLevel || 0,
                targetLevel: skillData.proficiency?.targetLevel || null,
                ...skillData.proficiency
            },
            experience: {
                totalYears: skillData.experience?.totalYears || 0,
                recentYears: skillData.experience?.recentYears || 0,
                ...skillData.experience
            },
            development: {
                status: 'not_started',
                priority: 'medium',
                ...skillData.development
            },
            status: {
                current: 'active',
                verificationStatus: 'unverified',
                lastActivity: new Date()
            }
        };
    }

    /**
     * Get skill market data
     * @private
     */
    async #getSkillMarketData(skillName) {
        try {
            // This would integrate with external market data service
            return {
                demand: {
                    current: 'moderate',
                    trend: 'stable',
                    forecast: {
                        sixMonths: 'moderate',
                        oneYear: 'moderate',
                        threeYears: 'increasing'
                    },
                    lastUpdated: new Date()
                },
                compensation: {
                    premium: 0,
                    marketRate: {
                        min: 100,
                        max: 200,
                        median: 150,
                        currency: 'USD'
                    },
                    lastUpdated: new Date()
                }
            };
        } catch (error) {
            logger.warn('Failed to get market data for skill', { skillName, error: error.message });
            return {
                demand: { current: 'unknown', trend: 'unknown' },
                compensation: { premium: 0 }
            };
        }
    }

    /**
     * Update consultant's skills array
     * @private
     */
    async #updateConsultantSkillsArray(consultantId, skillId, session) {
        await ConsultantModel.findByIdAndUpdate(
            consultantId,
            {
                $push: {
                    'skills.technical': {
                        skillId: skillId
                    }
                }
            },
            { session }
        );
    }

    /**
     * Validate proficiency data
     * @private
     */
    async #validateProficiencyData(proficiencyData) {
        if (proficiencyData.level !== undefined) {
            if (proficiencyData.level < 0 || proficiencyData.level > 10) {
                throw new ValidationError('Proficiency level must be between 0 and 10', 'INVALID_PROFICIENCY');
            }
        }

        if (proficiencyData.confidence !== undefined) {
            if (proficiencyData.confidence < 0 || proficiencyData.confidence > 100) {
                throw new ValidationError('Confidence must be between 0 and 100', 'INVALID_CONFIDENCE');
            }
        }

        return true;
    }

    /**
     * Check assessment authorization
     * @private
     */
    async #checkAssessmentAuthorization(assessmentType, userId, consultantId) {
        // Implement authorization logic based on assessment type
        switch (assessmentType) {
            case 'self':
                // User must be the consultant themselves
                break;
            case 'manager':
                // User must be consultant's manager
                break;
            case 'peer':
                // User must be a peer
                break;
            case 'client':
                // User must represent a client
                break;
            case 'formal':
                // User must be authorized assessor
                break;
        }
        return true;
    }

    /**
     * Update development status
     * @private
     */
    async #updateDevelopmentStatus(skill) {
        const currentLevel = skill.proficiency.currentLevel;
        const targetLevel = skill.proficiency.targetLevel;

        if (!targetLevel) {
            skill.development.status = 'maintaining';
        } else if (currentLevel >= targetLevel) {
            skill.development.status = 'expert';
        } else if (currentLevel >= targetLevel - 1) {
            skill.development.status = 'improving';
        } else if (currentLevel > 0) {
            skill.development.status = 'practicing';
        } else {
            skill.development.status = 'learning';
        }
    }

    /**
     * Calculate average proficiency
     * @private
     */
    #calculateAverageProficiency(skills) {
        if (skills.length === 0) return 0;
        const total = skills.reduce((sum, skill) => sum + skill.proficiency.currentLevel, 0);
        return Math.round((total / skills.length) * 10) / 10;
    }

    /**
     * Build skill map
     * @private
     */
    async #buildSkillMap(skills) {
        const map = {};
        for (const skill of skills) {
            map[skill.skill.name.toLowerCase()] = {
                level: skill.proficiency.currentLevel,
                verified: skill.status.verificationStatus === 'verified',
                experience: skill.experience.totalYears
            };
        }
        return map;
    }

    /**
     * Get target skills
     * @private
     */
    async #getTargetSkills(targetProfile, options) {
        // This would retrieve target skills based on profile type
        if (targetProfile.roleId) {
            // Get skills for specific role
            return [];
        } else if (targetProfile.level) {
            // Get skills for consultant level
            return [];
        } else if (targetProfile.projectType) {
            // Get skills for project type
            return [];
        }
        return [];
    }

    /**
     * Calculate skill gaps
     * @private
     */
    async #calculateSkillGaps(currentSkillMap, targetSkills) {
        const gaps = [];

        for (const targetSkill of targetSkills) {
            const currentSkill = currentSkillMap[targetSkill.name.toLowerCase()];
            
            if (!currentSkill) {
                gaps.push({
                    skill: targetSkill.name,
                    type: 'missing',
                    requiredLevel: targetSkill.requiredLevel,
                    currentLevel: 0,
                    gap: targetSkill.requiredLevel,
                    priority: targetSkill.priority || 'medium'
                });
            } else if (currentSkill.level < targetSkill.requiredLevel) {
                gaps.push({
                    skill: targetSkill.name,
                    type: 'insufficient',
                    requiredLevel: targetSkill.requiredLevel,
                    currentLevel: currentSkill.level,
                    gap: targetSkill.requiredLevel - currentSkill.level,
                    priority: targetSkill.priority || 'medium'
                });
            }
        }

        return gaps;
    }

    /**
     * Generate cache key
     * @private
     */
    #generateCacheKey(type, identifier, options = {}) {
        const optionsHash = crypto
            .createHash('md5')
            .update(JSON.stringify(options))
            .digest('hex');
        return `skills:${type}:${identifier}:${optionsHash}`;
    }

    /**
     * Clear skill caches
     * @private
     */
    async #clearSkillCaches(tenantId, consultantId = null) {
        const patterns = [`skills:*:${tenantId}:*`];
        if (consultantId) {
            patterns.push(`skills:*:${consultantId}:*`);
        }

        for (const pattern of patterns) {
            await this.#cacheService.deletePattern(pattern);
        }
    }

    /**
     * All additional private methods referenced in the code
     * @private
     */
    
    async #requestSkillAssessment(skill, userId) {
        // Implementation for requesting skill assessment
        return true;
    }

    async #sendSkillAddedNotifications(consultant, skill, userId) {
        // Implementation for sending notifications
        return true;
    }

    async #handleSignificantProficiencyChange(skill, userId) {
        // Implementation for handling significant changes
        return true;
    }

    async #sendProficiencyUpdateNotifications(skill, proficiencyData, userId) {
        // Implementation for sending proficiency update notifications
        return true;
    }

    async #validateAssessmentData(assessmentData) {
        // Implementation for validating assessment data
        return true;
    }

    async #filterSkillsForAssessment(skills, assessmentData) {
        // Implementation for filtering skills
        return skills;
    }

    async #assessSingleSkill(skill, assessmentData, userId, session) {
        // Implementation for assessing single skill
        return { level: skill.proficiency.currentLevel, confidence: 80 };
    }

    async #generateAssessmentReport(results, assessmentData) {
        // Implementation for generating assessment report
        return { ...results, reportDate: new Date() };
    }

    async #sendAssessmentCompletionNotifications(consultantId, report, userId) {
        // Implementation for sending assessment completion notifications
        return true;
    }

    async #validateCertification(certificationData) {
        // Implementation for validating certification
        return true;
    }

    async #verifyCertificationAuthenticity(certificationData) {
        // Implementation for verifying certification authenticity
        return { isValid: true };
    }

    async #sendVerificationNotifications(skill, certificationData, userId) {
        // Implementation for sending verification notifications
        return true;
    }

    async #validateEndorsementEligibility(userId, consultantId, skillId) {
        // Implementation for validating endorsement eligibility
        return true;
    }

    async #updateSkillConfidence(skill) {
        // Implementation for updating skill confidence
        skill.metadata.confidence = Math.min(100, skill.metadata.confidence + 5);
    }

    async #sendEndorsementNotifications(skill, endorsement, userId) {
        // Implementation for sending endorsement notifications
        return true;
    }

    async #prioritizeSkillGaps(gaps, options) {
        // Implementation for prioritizing skill gaps
        return gaps.sort((a, b) => b.gap - a.gap);
    }

    async #generateGapRecommendations(prioritizedGaps, consultantId) {
        // Implementation for generating gap recommendations
        return prioritizedGaps.map(gap => ({
            skill: gap.skill,
            recommendation: `Improve ${gap.skill} by ${gap.gap} levels`,
            priority: gap.priority
        }));
    }

    async #calculateGapClosingPlan(prioritizedGaps, recommendations) {
        // Implementation for calculating gap closing plan
        return {
            totalDuration: '6 months',
            totalCost: 10000,
            phases: []
        };
    }

    async #identifyStrengths(skills) {
        // Implementation for identifying strengths
        return skills.filter(s => s.proficiency.currentLevel >= 7).map(s => s.skill.name);
    }

    async #identifyWeaknesses(skills) {
        // Implementation for identifying weaknesses
        return skills.filter(s => s.proficiency.currentLevel < 3).map(s => s.skill.name);
    }

    #calculateGapScore(gaps) {
        // Implementation for calculating gap score
        return gaps.reduce((score, gap) => score + gap.gap, 0);
    }

    #calculateReadinessLevel(gaps, targetSkills) {
        // Implementation for calculating readiness level
        const gapCount = gaps.length;
        const targetCount = targetSkills.length;
        return targetCount > 0 ? ((targetCount - gapCount) / targetCount) * 100 : 0;
    }

    async #cacheGapAnalysis(consultantId, report) {
        // Implementation for caching gap analysis
        const cacheKey = this.#generateCacheKey('gap-analysis', consultantId, {});
        await this.#cacheService.set(cacheKey, report, 7200);
    }

    async #sendGapAnalysisNotifications(consultantId, report, userId) {
        // Implementation for sending gap analysis notifications
        return true;
    }

    async #getMarketDemandForSkills() {
        // Implementation for getting market demand
        return {};
    }

    async #generateSkillRecommendation(skill, marketDemand) {
        // Implementation for generating skill recommendation
        return {
            skill: skill.skill.name,
            currentLevel: skill.proficiency.currentLevel,
            targetLevel: skill.proficiency.targetLevel,
            priority: 'medium'
        };
    }

    async #identifyEmergingSkills(consultantId, marketDemand) {
        // Implementation for identifying emerging skills
        return [];
    }

    async #generateEmergingSkillRecommendation(emergingSkill) {
        // Implementation for generating emerging skill recommendation
        return {
            skill: emergingSkill,
            reason: 'Emerging market demand',
            priority: 'high'
        };
    }

    async #prioritizeRecommendations(recommendations, options) {
        // Implementation for prioritizing recommendations
        return recommendations.sort((a, b) => {
            const priorityOrder = { high: 3, medium: 2, low: 1 };
            return priorityOrder[b.priority] - priorityOrder[a.priority];
        });
    }

    async #generateLearningPath(recommendation) {
        // Implementation for generating learning path
        return {
            steps: [],
            duration: '3 months',
            resources: []
        };
    }

    async #analyzeMarketTrends(marketData) {
        // Implementation for analyzing market trends
        return { trend: 'increasing' };
    }

    async #compareWithInternalInventory(marketData, tenantId) {
        // Implementation for comparing with internal inventory
        return { comparison: 'adequate' };
    }

    async #generateMarketInsights(marketData, trends, comparison) {
        // Implementation for generating market insights
        return { insights: [] };
    }

    async #generateMarketRecommendations(insights) {
        // Implementation for generating market recommendations
        return [];
    }

    #calculateCompetencyLevel(categoryData) {
        // Implementation for calculating competency level
        return categoryData.averageLevel || 0;
    }

    #determineMaturityStage(categoryData) {
        // Implementation for determining maturity stage
        const avg = categoryData.averageLevel || 0;
        if (avg >= 8) return 'expert';
        if (avg >= 6) return 'advanced';
        if (avg >= 4) return 'intermediate';
        if (avg >= 2) return 'developing';
        return 'novice';
    }

    #calculateOverallProficiency(categories) {
        // Implementation for calculating overall proficiency
        const values = Object.values(categories).map(c => c.averageLevel || 0);
        return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    }

    #calculateOverallCompetency(matrix) {
        // Implementation for calculating overall competency
        return matrix.summary.averageProficiency || 0;
    }

    async #generateCompetencyComparisons(matrix, options) {
        // Implementation for generating competency comparisons
        return {
            vsPeers: 'above_average',
            vsTarget: 'on_track'
        };
    }

    async #generateCompetencyRecommendations(matrix) {
        // Implementation for generating competency recommendations
        return [];
    }
}

module.exports = ConsultantSkillsService;