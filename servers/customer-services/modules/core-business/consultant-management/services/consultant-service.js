/**
 * @fileoverview Consultant Management Service
 * @module servers/customer-services/modules/core-business/consultant-management/services/consultant-service
 * @description Comprehensive service for managing consultant operations including CRUD, profiles,
 * skills, certifications, availability, assignments, billing, performance, and analytics
 */

const { AppError } = require('../../../../../../shared/lib/utils/app-error');
const logger = require('../../../../../../shared/lib/utils/logger').createLogger({
    serviceName: 'consultant-service'
});
const validator = require('validator');
const crypto = require('crypto');
const mongoose = require('mongoose');

// Import secure database service
const database = require('../../../../../../shared/lib/database');

// Import business services
const NotificationService = require('../../notifications/services/notification-service');
const AnalyticsService = require('../../analytics/services/analytics-service');

/**
 * Consultant Status Constants
 */
const CONSULTANT_STATUS = {
    ACTIVE: 'active',
    INACTIVE: 'inactive',
    ON_LEAVE: 'on_leave',
    TERMINATED: 'terminated',
    SUSPENDED: 'suspended',
    PENDING_ACTIVATION: 'pending_activation'
};

/**
 * Professional Level Constants
 */
const PROFESSIONAL_LEVEL = {
    JUNIOR: 'junior',
    MID: 'mid',
    SENIOR: 'senior',
    LEAD: 'lead',
    PRINCIPAL: 'principal',
    DIRECTOR: 'director',
    PARTNER: 'partner'
};

/**
 * Employment Type Constants
 */
const EMPLOYMENT_TYPE = {
    FULL_TIME: 'full_time',
    PART_TIME: 'part_time',
    CONTRACT: 'contract',
    FREELANCE: 'freelance',
    ASSOCIATE: 'associate',
    PARTNER: 'partner'
};

/**
 * Availability Status Constants
 */
const AVAILABILITY_STATUS = {
    AVAILABLE: 'available',
    PARTIALLY_AVAILABLE: 'partially_available',
    UNAVAILABLE: 'unavailable',
    ON_LEAVE: 'on_leave',
    ON_PROJECT: 'on_project'
};

/**
 * Certification Status Constants
 */
const CERTIFICATION_STATUS = {
    ACTIVE: 'active',
    EXPIRED: 'expired',
    PENDING_RENEWAL: 'pending_renewal',
    REVOKED: 'revoked'
};

/**
 * Document Type Constants
 */
const DOCUMENT_TYPES = {
    RESUME: 'resume',
    CONTRACT: 'contract',
    NDA: 'nda',
    CERTIFICATION: 'certification',
    ID: 'id',
    BACKGROUND_CHECK: 'background_check',
    REFERENCE: 'reference',
    OTHER: 'other'
};

/**
 * Consultant Management Service
 * @class ConsultantService
 */
class ConsultantService {
    constructor() {
        this._dbService = null;
        this.notificationService = NotificationService;
        this.analyticsService = AnalyticsService;

        // Configuration
        this.config = {
            companyTenantId: process.env.COMPANY_TENANT_ID || 'default',
            platformUrl: process.env.PLATFORM_URL || 'https://yourplatform.com',
            autoGenerateConsultantCode: process.env.AUTO_GENERATE_CONSULTANT_CODE !== 'false',
            defaultUtilizationTarget: parseInt(process.env.DEFAULT_UTILIZATION_TARGET, 10) || 80,
            defaultHoursPerWeek: parseInt(process.env.DEFAULT_HOURS_PER_WEEK, 10) || 40,
            requireBackgroundCheck: process.env.REQUIRE_BACKGROUND_CHECK === 'true',
            maxDirectReports: parseInt(process.env.MAX_DIRECT_REPORTS, 10) || 15,
            maxSkillsPerConsultant: parseInt(process.env.MAX_SKILLS_PER_CONSULTANT, 10) || 100,
            maxCertificationsPerConsultant: parseInt(process.env.MAX_CERTIFICATIONS_PER_CONSULTANT, 10) || 50,
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
    // CONSULTANT CREATION
    // ============================================================================

    /**
     * Create a new consultant
     * @param {Object} consultantData - Consultant information
     * @param {Object} consultantData.profile - Personal profile (firstName, lastName, etc.)
     * @param {Object} consultantData.contact - Contact information (email, phone, address)
     * @param {Object} consultantData.professional - Professional details (level, department, startDate)
     * @param {Object} consultantData.billing - Billing configuration (defaultRate, costRate)
     * @param {Object} options - Additional options
     * @param {string} options.tenantId - Tenant ID for multi-tenancy
     * @param {string} options.organizationId - Organization ID
     * @param {string} options.userId - User ID of the creator
     * @param {string} options.source - Source of consultant creation
     * @param {boolean} options.sendWelcome - Whether to send welcome email
     * @returns {Promise<Object>} Created consultant
     */
    async createConsultant(consultantData, options = {}) {
        try {
            logger.info('Starting consultant creation', {
                name: `${consultantData.profile?.firstName} ${consultantData.profile?.lastName}`,
                tenantId: options.tenantId
            });

            // Validate consultant data
            await this._validateConsultantData(consultantData);

            // Check for duplicate consultants
            await this._checkDuplicateConsultant(consultantData, options.tenantId);

            const dbService = this._getDatabaseService();
            const Consultant = dbService.getModel('Consultant', 'customer');

            // Generate consultant code if not provided
            if (!consultantData.consultantCode && this.config.autoGenerateConsultantCode) {
                consultantData.consultantCode = await this._generateConsultantCode(consultantData);
            }

            // Set default values with ObjectId validation
            const tenantId = options.tenantId || this.config.companyTenantId;
            const organizationId = options.organizationId || consultantData.organizationId;

            // Build consultant record with validated ObjectIds
            const consultantRecord = {
                consultantCode: consultantData.consultantCode,
                tenantId,
                userId: consultantData.userId,
                profile: {
                    firstName: consultantData.profile.firstName.trim(),
                    lastName: consultantData.profile.lastName.trim(),
                    middleName: consultantData.profile.middleName?.trim(),
                    preferredName: consultantData.profile.preferredName?.trim(),
                    title: consultantData.profile.title?.trim(),
                    bio: consultantData.profile.bio,
                    summary: consultantData.profile.summary,
                    avatar: consultantData.profile.avatar,
                    dateOfBirth: consultantData.profile.dateOfBirth,
                    gender: consultantData.profile.gender,
                    nationality: consultantData.profile.nationality,
                    languages: consultantData.profile.languages || []
                },
                contact: {
                    email: {
                        primary: consultantData.contact.email.primary.toLowerCase().trim(),
                        work: consultantData.contact.email.work?.toLowerCase().trim(),
                        personal: consultantData.contact.email.personal?.toLowerCase().trim()
                    },
                    phone: consultantData.contact.phone || {},
                    address: consultantData.contact.address || {},
                    linkedIn: consultantData.contact.linkedIn,
                    portfolio: consultantData.contact.portfolio,
                    website: consultantData.contact.website
                },
                professional: {
                    employmentType: consultantData.professional?.employmentType || EMPLOYMENT_TYPE.FULL_TIME,
                    level: consultantData.professional?.level || PROFESSIONAL_LEVEL.MID,
                    grade: consultantData.professional?.grade,
                    directReports: [],
                    startDate: consultantData.professional?.startDate || new Date(),
                    endDate: consultantData.professional?.endDate,
                    yearsOfExperience: consultantData.professional?.yearsOfExperience || 0,
                    industryExperience: consultantData.professional?.industryExperience || []
                },
                skills: consultantData.skills || [],
                certifications: consultantData.certifications || [],
                education: consultantData.education || [],
                workHistory: consultantData.workHistory || [],
                availability: {
                    status: AVAILABILITY_STATUS.AVAILABLE,
                    capacityPercentage: 100,
                    hoursPerWeek: this.config.defaultHoursPerWeek,
                    remotePreference: consultantData.availability?.remotePreference || 'flexible',
                    travelWillingness: consultantData.availability?.travelWillingness || 'regional',
                    travelPercentage: consultantData.availability?.travelPercentage || 25,
                    relocationWillingness: consultantData.availability?.relocationWillingness || false,
                    preferredLocations: consultantData.availability?.preferredLocations || [],
                    excludedLocations: consultantData.availability?.excludedLocations || [],
                    blackoutDates: [],
                    lastUpdated: new Date()
                },
                assignments: [],
                billing: {
                    defaultRate: {
                        amount: consultantData.billing?.defaultRate?.amount || 0,
                        currency: consultantData.billing?.defaultRate?.currency || this.config.defaultCurrency,
                        type: consultantData.billing?.defaultRate?.type || 'hourly'
                    },
                    rateHistory: [],
                    costRate: consultantData.billing?.costRate || {},
                    utilization: {
                        target: this.config.defaultUtilizationTarget,
                        current: 0,
                        ytd: 0
                    },
                    billableHoursTarget: consultantData.billing?.billableHoursTarget || {}
                },
                performance: {
                    rating: {},
                    reviews: [],
                    feedback: [],
                    achievements: []
                },
                documents: [],
                preferences: consultantData.preferences || {
                    projectTypes: [],
                    clientTypes: [],
                    industries: [],
                    excludedClients: [],
                    notifications: {
                        email: { assignments: true, reviews: true, training: true, announcements: true },
                        push: { assignments: true, reviews: true, training: true, announcements: true }
                    },
                    privacy: {
                        showEmail: false,
                        showPhone: false,
                        showAvailability: true,
                        showRates: false
                    }
                },
                compliance: {
                    backgroundCheck: { status: this.config.requireBackgroundCheck ? 'pending' : 'not_required' },
                    nda: { signed: false },
                    conflictOfInterest: { declared: false, declarations: [] },
                    securityClearance: {}
                },
                status: {
                    current: CONSULTANT_STATUS.PENDING_ACTIVATION,
                    isActive: true,
                    isDeleted: false
                },
                customFields: consultantData.customFields || {},
                metadata: {
                    source: options.source || 'manual',
                    referredBy: consultantData.metadata?.referredBy,
                    createdBy: options.userId,
                    externalIds: consultantData.metadata?.externalIds || {}
                },
                tags: consultantData.tags || []
            };

            // Add organizationId only if valid
            if (organizationId && mongoose.Types.ObjectId.isValid(organizationId)) {
                consultantRecord.organizationId = organizationId;
            }

            // Add validated ObjectId references to professional section
            if (consultantData.professional?.department && mongoose.Types.ObjectId.isValid(consultantData.professional.department)) {
                consultantRecord.professional.department = consultantData.professional.department;
            }

            if (consultantData.professional?.team && mongoose.Types.ObjectId.isValid(consultantData.professional.team)) {
                consultantRecord.professional.team = consultantData.professional.team;
            }

            if (consultantData.professional?.manager && mongoose.Types.ObjectId.isValid(consultantData.professional.manager)) {
                consultantRecord.professional.manager = consultantData.professional.manager;
            }

            const newConsultant = new Consultant(consultantRecord);
            await newConsultant.save();

            logger.info('Consultant created successfully', {
                consultantId: newConsultant._id,
                consultantCode: newConsultant.consultantCode,
                name: newConsultant.fullName
            });

            // Handle post-creation activities
            await this._handlePostConsultantCreation(newConsultant, options);

            return this._sanitizeConsultantOutput(newConsultant);

        } catch (error) {
            logger.error('Consultant creation failed', {
                error: error.message,
                stack: error.stack,
                name: `${consultantData?.profile?.firstName} ${consultantData?.profile?.lastName}`
            });
            throw error;
        }
    }

    /**
     * Bulk create consultants
     * @param {Array<Object>} consultantsData - Array of consultant data objects
     * @param {Object} options - Additional options
     * @param {string} options.tenantId - Tenant ID for multi-tenancy
     * @param {string} options.organizationId - Organization ID
     * @param {string} options.userId - User ID of the creator
     * @param {string} options.source - Source of import (e.g., 'import', 'api')
     * @returns {Promise<Object>} Result with created consultants and any errors
     */
    async bulkCreateConsultants(consultantsData, options = {}) {
        try {
            logger.info('Bulk creating consultants', {
                count: consultantsData.length,
                source: options.source
            });

            const results = {
                created: [],
                failed: [],
                skipped: []
            };

            for (const consultantData of consultantsData) {
                try {
                    const consultant = await this.createConsultant(consultantData, {
                        ...options,
                        sendWelcome: false
                    });
                    results.created.push(consultant);
                } catch (error) {
                    if (error.code === 'CONFLICT') {
                        results.skipped.push({
                            email: consultantData.contact?.email?.primary,
                            reason: 'Duplicate consultant'
                        });
                    } else {
                        results.failed.push({
                            email: consultantData.contact?.email?.primary,
                            error: error.message
                        });
                    }
                }
            }

            logger.info('Bulk consultant creation completed', {
                created: results.created.length,
                failed: results.failed.length,
                skipped: results.skipped.length
            });

            return results;

        } catch (error) {
            logger.error('Bulk consultant creation failed', {
                error: error.message
            });
            throw error;
        }
    }

    // ============================================================================
    // CONSULTANT RETRIEVAL
    // ============================================================================

    /**
     * Get consultant by ID
     * @param {string} consultantId - Consultant ID (MongoDB _id or consultantCode)
     * @param {Object} options - Query options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @param {boolean} options.populate - Populate referenced fields
     * @param {Array<string>} options.select - Fields to select
     * @returns {Promise<Object>} Consultant data
     */
    async getConsultantById(consultantId, options = {}) {
        try {
            logger.info('Fetching consultant by ID', { consultantId });

            const dbService = this._getDatabaseService();
            const Consultant = dbService.getModel('Consultant', 'customer');

            // Try finding by MongoDB _id first, then by consultantCode
            let query;
            if (mongoose.Types.ObjectId.isValid(consultantId)) {
                query = Consultant.findById(consultantId);
            } else {
                query = Consultant.findOne({ consultantCode: consultantId.toUpperCase() });
            }

            // Apply field selection
            if (options.select && options.select.length > 0) {
                query = query.select(options.select.join(' '));
            }

            // Apply population if requested
            if (options.populate) {
                query = query
                    .populate('userId', 'email profile.firstName profile.lastName')
                    .populate('professional.department', 'name code')
                    .populate('professional.team', 'name code')
                    .populate('professional.manager', 'profile.firstName profile.lastName consultantCode');
            }

            const consultant = await query.exec();

            if (!consultant) {
                throw AppError.notFound('Consultant not found', {
                    context: { consultantId }
                });
            }

            // Check tenant access with validation
            if (options.tenantId && !options.skipTenantCheck && mongoose.Types.ObjectId.isValid(options.tenantId) &&
                consultant.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this consultant');
            }

            return this._sanitizeConsultantOutput(consultant);

        } catch (error) {
            logger.error('Failed to fetch consultant', {
                error: error.message,
                consultantId
            });
            throw error;
        }
    }

    /**
     * Get consultant by user ID
     * @param {string} userId - User ID linked to consultant
     * @param {Object} options - Query options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @returns {Promise<Object>} Consultant data
     */
    async getConsultantByUserId(userId, options = {}) {
        try {
            logger.info('Fetching consultant by user ID', { userId });

            const dbService = this._getDatabaseService();
            const Consultant = dbService.getModel('Consultant', 'customer');

            // Build query with ObjectId validation
            const query = { 'status.isDeleted': false };

            // Add userId with validation
            if (userId && mongoose.Types.ObjectId.isValid(userId)) {
                query.userId = new mongoose.Types.ObjectId(userId);
            } else {
                throw AppError.validation('Invalid user ID format');
            }

            // Add tenantId with validation
            if (options.tenantId && !options.skipTenantCheck && mongoose.Types.ObjectId.isValid(options.tenantId)) {
                query.tenantId = new mongoose.Types.ObjectId(options.tenantId);
            }

            const consultant = await Consultant.findOne(query);

            if (!consultant) {
                throw AppError.notFound('Consultant not found for user', {
                    context: { userId }
                });
            }

            return this._sanitizeConsultantOutput(consultant);

        } catch (error) {
            logger.error('Failed to fetch consultant by user ID', {
                error: error.message,
                userId
            });
            throw error;
        }
    }

    /**
     * Get consultant by email
     * @param {string} email - Consultant email address
     * @param {Object} options - Query options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @returns {Promise<Object>} Consultant data
     */
    async getConsultantByEmail(email, options = {}) {
        try {
            logger.info('Fetching consultant by email', { email: email.substring(0, 3) + '***' });

            const dbService = this._getDatabaseService();
            const Consultant = dbService.getModel('Consultant', 'customer');

            const query = {
                'contact.email.primary': email.toLowerCase().trim(),
                'status.isDeleted': false
            };

            // Add tenantId with validation
            if (options.tenantId && !options.skipTenantCheck && mongoose.Types.ObjectId.isValid(options.tenantId)) {
                query.tenantId = new mongoose.Types.ObjectId(options.tenantId);
            }

            const consultant = await Consultant.findOne(query);

            if (!consultant) {
                throw AppError.notFound('Consultant not found with this email', {
                    context: { email: email.substring(0, 3) + '***' }
                });
            }

            return this._sanitizeConsultantOutput(consultant);

        } catch (error) {
            logger.error('Failed to fetch consultant by email', {
                error: error.message
            });
            throw error;
        }
    }

    /**
     * List consultants with filtering and pagination
     * @param {Object} filters - Filter criteria
     * @param {string} filters.status - Filter by consultant status
     * @param {string} filters.level - Filter by professional level
     * @param {string} filters.employmentType - Filter by employment type
     * @param {string} filters.department - Filter by department ID
     * @param {string} filters.team - Filter by team ID
     * @param {string} filters.manager - Filter by manager ID
     * @param {string} filters.availabilityStatus - Filter by availability status
     * @param {Array<string>} filters.skills - Filter by skill names
     * @param {Array<string>} filters.tags - Filter by tags
     * @param {string} filters.search - Search term for name, email, consultantCode
     * @param {Object} options - Pagination and sorting options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {number} options.limit - Maximum number of records
     * @param {number} options.skip - Number of records to skip
     * @param {string} options.sortBy - Field to sort by
     * @param {string} options.sortOrder - Sort order (asc/desc)
     * @returns {Promise<Object>} Paginated consultant list
     */
    async listConsultants(filters = {}, options = {}) {
        try {
            logger.info('Listing consultants', {
                filters: Object.keys(filters),
                tenantId: options.tenantId
            });

            const dbService = this._getDatabaseService();
            const Consultant = dbService.getModel('Consultant', 'customer');

            // Build query
            const query = {
                'status.isDeleted': false
            };

            // Tenant filter with validation
            if (options.tenantId && mongoose.Types.ObjectId.isValid(options.tenantId)) {
                query.tenantId = new mongoose.Types.ObjectId(options.tenantId);
            }

            // Apply filters
            if (filters.status) {
                query['status.current'] = filters.status;
            }

            if (filters.level) {
                query['professional.level'] = filters.level;
            }

            if (filters.employmentType) {
                query['professional.employmentType'] = filters.employmentType;
            }

            // ObjectId filters with validation
            if (filters.department && mongoose.Types.ObjectId.isValid(filters.department)) {
                query['professional.department'] = new mongoose.Types.ObjectId(filters.department);
            }

            if (filters.team && mongoose.Types.ObjectId.isValid(filters.team)) {
                query['professional.team'] = new mongoose.Types.ObjectId(filters.team);
            }

            if (filters.manager && mongoose.Types.ObjectId.isValid(filters.manager)) {
                query['professional.manager'] = new mongoose.Types.ObjectId(filters.manager);
            }

            if (filters.availabilityStatus) {
                query['availability.status'] = filters.availabilityStatus;
            }

            if (filters.skills && filters.skills.length > 0) {
                query['skills.name'] = { $in: filters.skills };
            }

            if (filters.tags && filters.tags.length > 0) {
                query.tags = { $in: filters.tags };
            }

            // Text search
            if (filters.search) {
                const searchRegex = new RegExp(filters.search, 'i');
                query.$or = [
                    { 'profile.firstName': searchRegex },
                    { 'profile.lastName': searchRegex },
                    { 'contact.email.primary': searchRegex },
                    { consultantCode: searchRegex.source.toUpperCase() }
                ];
            }

            // Build sort
            const sortField = options.sortBy || 'profile.lastName';
            const sortOrder = options.sortOrder === 'desc' ? -1 : 1;
            const sort = { [sortField]: sortOrder };

            // Execute query with pagination
            const limit = Math.min(options.limit || 50, 100);
            const skip = options.skip || 0;

            const [consultants, total] = await Promise.all([
                Consultant.find(query)
                    .select('consultantCode profile contact.email.primary professional.level professional.employmentType availability.status skills status tags')
                    .sort(sort)
                    .skip(skip)
                    .limit(limit)
                    .exec(),
                Consultant.countDocuments(query)
            ]);

            return {
                data: consultants.map(c => this._sanitizeConsultantOutput(c)),
                pagination: {
                    total,
                    limit,
                    skip,
                    hasMore: skip + consultants.length < total
                }
            };

        } catch (error) {
            logger.error('Failed to list consultants', {
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Search consultants by text query
     * @param {string} searchQuery - Search query string
     * @param {Object} options - Search options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {number} options.limit - Maximum number of results
     * @returns {Promise<Array>} Matching consultants
     */
    async searchConsultants(searchQuery, options = {}) {
        try {
            logger.info('Searching consultants', { query: searchQuery.substring(0, 20) });

            const dbService = this._getDatabaseService();
            const Consultant = dbService.getModel('Consultant', 'customer');

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

            const pipeline = [
                { $match: matchStage },
                {
                    $addFields: {
                        score: { $meta: 'textScore' }
                    }
                },
                { $sort: { score: -1 } },
                { $limit: options.limit || 20 },
                {
                    $project: {
                        consultantCode: 1,
                        profile: 1,
                        'contact.email.primary': 1,
                        'professional.level': 1,
                        'availability.status': 1,
                        skills: { $slice: ['$skills', 5] },
                        score: 1
                    }
                }
            ];

            const results = await Consultant.aggregate(pipeline);

            return results.map(c => this._sanitizeConsultantOutput(c));

        } catch (error) {
            logger.error('Consultant search failed', {
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Find available consultants based on criteria
     * @param {Object} criteria - Search criteria
     * @param {number} criteria.minCapacity - Minimum capacity percentage required
     * @param {Array<string>} criteria.skills - Required skills
     * @param {string} criteria.level - Required professional level
     * @param {Date} criteria.availableFrom - Available from date
     * @param {Date} criteria.availableUntil - Available until date
     * @param {string} criteria.remotePreference - Remote work preference
     * @param {Object} options - Query options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {number} options.limit - Maximum number of results
     * @returns {Promise<Array>} Available consultants
     */
    async findAvailableConsultants(criteria = {}, options = {}) {
        try {
            logger.info('Finding available consultants', {
                minCapacity: criteria.minCapacity,
                skillsCount: criteria.skills?.length
            });

            const dbService = this._getDatabaseService();
            const Consultant = dbService.getModel('Consultant', 'customer');

            // Build query with validated tenantId
            const tenantId = options.tenantId || this.config.companyTenantId;
            const query = {
                'status.current': CONSULTANT_STATUS.ACTIVE,
                'status.isDeleted': false,
                'availability.status': { $in: [AVAILABILITY_STATUS.AVAILABLE, AVAILABILITY_STATUS.PARTIALLY_AVAILABLE] }
            };

            // Add tenantId with validation
            if (tenantId && mongoose.Types.ObjectId.isValid(tenantId)) {
                query.tenantId = new mongoose.Types.ObjectId(tenantId);
            }

            if (criteria.minCapacity) {
                query['availability.capacityPercentage'] = { $gte: criteria.minCapacity };
            }

            if (criteria.skills && criteria.skills.length > 0) {
                query['skills.name'] = { $in: criteria.skills };
            }

            if (criteria.level) {
                query['professional.level'] = criteria.level;
            }

            if (criteria.remotePreference) {
                query['availability.remotePreference'] = { $in: [criteria.remotePreference, 'flexible'] };
            }

            // Date availability check
            if (criteria.availableFrom) {
                query.$or = [
                    { 'availability.availableFrom': { $exists: false } },
                    { 'availability.availableFrom': { $lte: new Date(criteria.availableFrom) } }
                ];
            }

            const consultants = await Consultant.find(query)
                .select('consultantCode profile contact.email.primary professional.level availability skills')
                .sort({ 'availability.capacityPercentage': -1 })
                .limit(options.limit || 50)
                .exec();

            // Calculate skill match percentage if skills specified
            if (criteria.skills && criteria.skills.length > 0) {
                return consultants.map(c => {
                    const consultantSkills = c.skills.map(s => s.name.toLowerCase());
                    const matchedSkills = criteria.skills.filter(s => consultantSkills.includes(s.toLowerCase()));
                    const matchPercentage = (matchedSkills.length / criteria.skills.length) * 100;

                    return {
                        ...this._sanitizeConsultantOutput(c),
                        matchPercentage: Math.round(matchPercentage),
                        matchedSkills
                    };
                }).sort((a, b) => b.matchPercentage - a.matchPercentage);
            }

            return consultants.map(c => this._sanitizeConsultantOutput(c));

        } catch (error) {
            logger.error('Failed to find available consultants', {
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Get consultant's direct reports
     * @param {string} consultantId - Consultant ID (manager)
     * @param {Object} options - Query options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @returns {Promise<Array>} Direct reports
     */
    async getDirectReports(consultantId, options = {}) {
        try {
            logger.info('Getting direct reports', { consultantId });

            const dbService = this._getDatabaseService();
            const Consultant = dbService.getModel('Consultant', 'customer');

            // Build query with ObjectId validation
            const query = {
                'status.isDeleted': false
            };

            // Add manager filter with validation
            if (consultantId && mongoose.Types.ObjectId.isValid(consultantId)) {
                query['professional.manager'] = new mongoose.Types.ObjectId(consultantId);
            } else {
                throw AppError.validation('Invalid consultant ID format');
            }

            // Add tenantId with validation
            if (options.tenantId && !options.skipTenantCheck && mongoose.Types.ObjectId.isValid(options.tenantId)) {
                query.tenantId = new mongoose.Types.ObjectId(options.tenantId);
            }

            const directReports = await Consultant.find(query)
                .select('consultantCode profile contact.email.primary professional.level status.current')
                .sort({ 'profile.lastName': 1 })
                .exec();

            return directReports.map(c => this._sanitizeConsultantOutput(c));

        } catch (error) {
            logger.error('Failed to get direct reports', {
                error: error.message,
                consultantId
            });
            throw error;
        }
    }

    // ============================================================================
    // CONSULTANT UPDATE
    // ============================================================================

    /**
     * Update consultant record
     * @param {string} consultantId - Consultant ID
     * @param {Object} updateData - Fields to update
     * @param {Object} updateData.profile - Profile updates
     * @param {Object} updateData.contact - Contact updates
     * @param {Object} updateData.professional - Professional updates
     * @param {Object} updateData.billing - Billing updates
     * @param {Object} updateData.preferences - Preferences updates
     * @param {Object} options - Update options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {string} options.userId - User ID performing the update
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @returns {Promise<Object>} Updated consultant record
     */
    async updateConsultant(consultantId, updateData, options = {}) {
        try {
            logger.info('Updating consultant', { consultantId });

            const dbService = this._getDatabaseService();
            const Consultant = dbService.getModel('Consultant', 'customer');

            // Find existing consultant
            const consultant = await this._findConsultantRecord(consultantId);

            // Check tenant access with validation
            if (options.tenantId && !options.skipTenantCheck && mongoose.Types.ObjectId.isValid(options.tenantId) &&
                consultant.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this consultant');
            }

            // Validate update data
            await this._validateConsultantUpdateData(updateData);

            // Build update object
            const updateFields = {};

            // Profile updates
            if (updateData.profile) {
                const profileFields = ['firstName', 'lastName', 'middleName', 'preferredName', 'title', 'bio', 'summary', 'avatar', 'dateOfBirth', 'gender', 'nationality'];
                profileFields.forEach(field => {
                    if (updateData.profile[field] !== undefined) {
                        updateFields[`profile.${field}`] = updateData.profile[field];
                    }
                });
                if (updateData.profile.languages) {
                    updateFields['profile.languages'] = updateData.profile.languages;
                }
            }

            // Contact updates
            if (updateData.contact) {
                if (updateData.contact.email) {
                    Object.keys(updateData.contact.email).forEach(key => {
                        if (updateData.contact.email[key] !== undefined) {
                            updateFields[`contact.email.${key}`] = updateData.contact.email[key]?.toLowerCase().trim();
                        }
                    });
                }
                if (updateData.contact.phone) {
                    Object.keys(updateData.contact.phone).forEach(key => {
                        if (updateData.contact.phone[key] !== undefined) {
                            updateFields[`contact.phone.${key}`] = updateData.contact.phone[key];
                        }
                    });
                }
                if (updateData.contact.address) {
                    Object.keys(updateData.contact.address).forEach(key => {
                        if (updateData.contact.address[key] !== undefined) {
                            updateFields[`contact.address.${key}`] = updateData.contact.address[key];
                        }
                    });
                }
                const socialFields = ['linkedIn', 'portfolio', 'website'];
                socialFields.forEach(field => {
                    if (updateData.contact[field] !== undefined) {
                        updateFields[`contact.${field}`] = updateData.contact[field];
                    }
                });
            }

            // Professional updates with ObjectId validation
            if (updateData.professional) {
                const simpleFields = ['employmentType', 'level', 'grade', 'endDate', 'yearsOfExperience'];
                simpleFields.forEach(field => {
                    if (updateData.professional[field] !== undefined) {
                        updateFields[`professional.${field}`] = updateData.professional[field];
                    }
                });

                // Handle ObjectId fields with validation
                if (updateData.professional.department !== undefined) {
                    if (updateData.professional.department && mongoose.Types.ObjectId.isValid(updateData.professional.department)) {
                        updateFields['professional.department'] = updateData.professional.department;
                    } else if (updateData.professional.department === null) {
                        updateFields['professional.department'] = null;
                    }
                }

                if (updateData.professional.team !== undefined) {
                    if (updateData.professional.team && mongoose.Types.ObjectId.isValid(updateData.professional.team)) {
                        updateFields['professional.team'] = updateData.professional.team;
                    } else if (updateData.professional.team === null) {
                        updateFields['professional.team'] = null;
                    }
                }

                if (updateData.professional.manager !== undefined) {
                    if (updateData.professional.manager && mongoose.Types.ObjectId.isValid(updateData.professional.manager)) {
                        updateFields['professional.manager'] = updateData.professional.manager;
                    } else if (updateData.professional.manager === null) {
                        updateFields['professional.manager'] = null;
                    }
                }

                if (updateData.professional.industryExperience) {
                    updateFields['professional.industryExperience'] = updateData.professional.industryExperience;
                }
            }

            // Billing updates
            if (updateData.billing) {
                if (updateData.billing.defaultRate) {
                    // Save rate history before updating
                    if (consultant.billing?.defaultRate?.amount !== updateData.billing.defaultRate.amount) {
                        await Consultant.findByIdAndUpdate(consultant._id, {
                            $push: {
                                'billing.rateHistory': {
                                    rate: consultant.billing?.defaultRate?.amount,
                                    currency: consultant.billing?.defaultRate?.currency,
                                    effectiveFrom: consultant.billing?.rateHistory?.slice(-1)[0]?.effectiveTo || consultant.professional?.startDate,
                                    effectiveTo: new Date(),
                                    approvedBy: options.userId,
                                    reason: 'Rate update'
                                }
                            }
                        });
                    }
                    Object.keys(updateData.billing.defaultRate).forEach(key => {
                        updateFields[`billing.defaultRate.${key}`] = updateData.billing.defaultRate[key];
                    });
                }
                if (updateData.billing.costRate) {
                    Object.keys(updateData.billing.costRate).forEach(key => {
                        updateFields[`billing.costRate.${key}`] = updateData.billing.costRate[key];
                    });
                }
                if (updateData.billing.utilization) {
                    Object.keys(updateData.billing.utilization).forEach(key => {
                        updateFields[`billing.utilization.${key}`] = updateData.billing.utilization[key];
                    });
                }
            }

            // Preferences updates
            if (updateData.preferences) {
                Object.keys(updateData.preferences).forEach(key => {
                    updateFields[`preferences.${key}`] = updateData.preferences[key];
                });
            }

            // Tags update
            if (updateData.tags) {
                updateFields.tags = updateData.tags;
            }

            // Custom fields update
            if (updateData.customFields) {
                Object.keys(updateData.customFields).forEach(key => {
                    updateFields[`customFields.${key}`] = updateData.customFields[key];
                });
            }

            // Metadata update
            updateFields['metadata.updatedBy'] = options.userId;

            // Execute update
            const updatedConsultant = await Consultant.findByIdAndUpdate(
                consultant._id,
                { $set: updateFields },
                { new: true, runValidators: true }
            );

            // Track update event
            await this._trackConsultantEvent(updatedConsultant, 'consultant_updated', {
                userId: options.userId,
                changes: Object.keys(updateFields)
            });

            logger.info('Consultant updated successfully', {
                consultantId,
                changes: Object.keys(updateFields).length
            });

            return this._sanitizeConsultantOutput(updatedConsultant);

        } catch (error) {
            logger.error('Failed to update consultant', {
                error: error.message,
                consultantId
            });
            throw error;
        }
    }

    /**
     * Update consultant availability
     * @param {string} consultantId - Consultant ID
     * @param {Object} availabilityData - Availability information
     * @param {string} availabilityData.status - Availability status
     * @param {number} availabilityData.capacityPercentage - Capacity percentage
     * @param {number} availabilityData.hoursPerWeek - Hours per week
     * @param {Date} availabilityData.availableFrom - Available from date
     * @param {Date} availabilityData.availableUntil - Available until date
     * @param {string} availabilityData.remotePreference - Remote work preference
     * @param {Object} options - Update options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {string} options.userId - User ID performing the update
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @returns {Promise<Object>} Updated consultant
     */
    async updateAvailability(consultantId, availabilityData, options = {}) {
        try {
            logger.info('Updating consultant availability', {
                consultantId,
                status: availabilityData.status
            });

            const dbService = this._getDatabaseService();
            const Consultant = dbService.getModel('Consultant', 'customer');

            const consultant = await this._findConsultantRecord(consultantId);

            // Check tenant access with validation
            if (options.tenantId && !options.skipTenantCheck && mongoose.Types.ObjectId.isValid(options.tenantId) &&
                consultant.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this consultant');
            }

            // Validate availability data
            if (availabilityData.status && !Object.values(AVAILABILITY_STATUS).includes(availabilityData.status)) {
                throw AppError.validation('Invalid availability status');
            }

            if (availabilityData.capacityPercentage !== undefined) {
                if (availabilityData.capacityPercentage < 0 || availabilityData.capacityPercentage > 100) {
                    throw AppError.validation('Capacity percentage must be between 0 and 100');
                }
            }

            // Build update
            const updateFields = { 'availability.lastUpdated': new Date() };

            const availabilityFields = [
                'status', 'capacityPercentage', 'hoursPerWeek', 'availableFrom', 'availableUntil',
                'remotePreference', 'travelWillingness', 'travelPercentage', 'relocationWillingness',
                'preferredLocations', 'excludedLocations'
            ];

            availabilityFields.forEach(field => {
                if (availabilityData[field] !== undefined) {
                    updateFields[`availability.${field}`] = availabilityData[field];
                }
            });

            updateFields['metadata.updatedBy'] = options.userId;

            const updatedConsultant = await Consultant.findByIdAndUpdate(
                consultant._id,
                { $set: updateFields },
                { new: true }
            );

            // Track event
            await this._trackConsultantEvent(updatedConsultant, 'availability_updated', {
                userId: options.userId,
                newStatus: availabilityData.status
            });

            logger.info('Consultant availability updated', {
                consultantId,
                status: availabilityData.status
            });

            return this._sanitizeConsultantOutput(updatedConsultant);

        } catch (error) {
            logger.error('Failed to update availability', {
                error: error.message,
                consultantId
            });
            throw error;
        }
    }

    /**
     * Add blackout dates for consultant
     * @param {string} consultantId - Consultant ID
     * @param {Object} blackoutData - Blackout date information
     * @param {Date} blackoutData.startDate - Start date of blackout
     * @param {Date} blackoutData.endDate - End date of blackout
     * @param {string} blackoutData.reason - Reason for blackout
     * @param {boolean} blackoutData.recurring - Whether blackout is recurring
     * @param {Object} options - Update options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {string} options.userId - User ID performing the update
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @returns {Promise<Object>} Updated consultant
     */
    async addBlackoutDates(consultantId, blackoutData, options = {}) {
        try {
            logger.info('Adding blackout dates', {
                consultantId,
                startDate: blackoutData.startDate,
                endDate: blackoutData.endDate
            });

            const dbService = this._getDatabaseService();
            const Consultant = dbService.getModel('Consultant', 'customer');

            const consultant = await this._findConsultantRecord(consultantId);

            // Check tenant access with validation
            if (options.tenantId && !options.skipTenantCheck && mongoose.Types.ObjectId.isValid(options.tenantId) &&
                consultant.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this consultant');
            }

            // Validate dates
            if (!blackoutData.startDate || !blackoutData.endDate) {
                throw AppError.validation('Start date and end date are required');
            }

            if (new Date(blackoutData.endDate) < new Date(blackoutData.startDate)) {
                throw AppError.validation('End date cannot be before start date');
            }

            const updatedConsultant = await Consultant.findByIdAndUpdate(
                consultant._id,
                {
                    $push: {
                        'availability.blackoutDates': {
                            startDate: new Date(blackoutData.startDate),
                            endDate: new Date(blackoutData.endDate),
                            reason: blackoutData.reason,
                            recurring: blackoutData.recurring || false
                        }
                    },
                    $set: {
                        'availability.lastUpdated': new Date(),
                        'metadata.updatedBy': options.userId
                    }
                },
                { new: true }
            );

            logger.info('Blackout dates added', { consultantId });

            return this._sanitizeConsultantOutput(updatedConsultant);

        } catch (error) {
            logger.error('Failed to add blackout dates', {
                error: error.message,
                consultantId
            });
            throw error;
        }
    }

    // ============================================================================
    // SKILLS MANAGEMENT (Embedded in Consultant)
    // ============================================================================

    /**
     * Add skill to consultant
     * @param {string} consultantId - Consultant ID
     * @param {Object} skillData - Skill information
     * @param {string} skillData.name - Skill name
     * @param {string} skillData.category - Skill category
     * @param {string} skillData.proficiencyLevel - Proficiency level
     * @param {number} skillData.yearsOfExperience - Years of experience
     * @param {Object} options - Update options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {string} options.userId - User ID performing the update
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @returns {Promise<Object>} Updated consultant
     */
    async addSkill(consultantId, skillData, options = {}) {
        try {
            logger.info('Adding skill to consultant', {
                consultantId,
                skillName: skillData.name
            });

            const dbService = this._getDatabaseService();
            const Consultant = dbService.getModel('Consultant', 'customer');

            const consultant = await this._findConsultantRecord(consultantId);

            // Check tenant access with validation
            if (options.tenantId && !options.skipTenantCheck && mongoose.Types.ObjectId.isValid(options.tenantId) &&
                consultant.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this consultant');
            }

            // Validate skill data
            if (!skillData.name) {
                throw AppError.validation('Skill name is required');
            }

            // Check for existing skill
            const existingSkill = consultant.skills.find(s =>
                s.name.toLowerCase() === skillData.name.toLowerCase()
            );

            if (existingSkill) {
                throw AppError.conflict('Consultant already has this skill', {
                    context: { skillName: skillData.name }
                });
            }

            // Check max skills limit
            if (consultant.skills.length >= this.config.maxSkillsPerConsultant) {
                throw AppError.validation('Maximum skills limit reached', {
                    context: { limit: this.config.maxSkillsPerConsultant }
                });
            }

            // Use model method
            await consultant.addSkill({
                name: skillData.name.trim(),
                category: skillData.category || 'other',
                proficiencyLevel: skillData.proficiencyLevel || 'intermediate',
                yearsOfExperience: skillData.yearsOfExperience || 0,
                lastUsed: skillData.lastUsed || new Date(),
                verified: false
            });

            // Track event
            await this._trackConsultantEvent(consultant, 'skill_added', {
                userId: options.userId,
                skillName: skillData.name
            });

            logger.info('Skill added to consultant', {
                consultantId,
                skillName: skillData.name
            });

            return this._sanitizeConsultantOutput(consultant);

        } catch (error) {
            logger.error('Failed to add skill', {
                error: error.message,
                consultantId
            });
            throw error;
        }
    }

    /**
     * Update skill for consultant
     * @param {string} consultantId - Consultant ID
     * @param {string} skillName - Skill name to update
     * @param {Object} skillData - Updated skill information
     * @param {string} skillData.proficiencyLevel - Updated proficiency level
     * @param {number} skillData.yearsOfExperience - Updated years of experience
     * @param {Object} options - Update options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {string} options.userId - User ID performing the update
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @returns {Promise<Object>} Updated consultant
     */
    async updateSkill(consultantId, skillName, skillData, options = {}) {
        try {
            logger.info('Updating consultant skill', {
                consultantId,
                skillName
            });

            const dbService = this._getDatabaseService();
            const Consultant = dbService.getModel('Consultant', 'customer');

            const consultant = await this._findConsultantRecord(consultantId);

            // Check tenant access with validation
            if (options.tenantId && !options.skipTenantCheck && mongoose.Types.ObjectId.isValid(options.tenantId) &&
                consultant.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this consultant');
            }

            // Find skill index
            const skillIndex = consultant.skills.findIndex(s =>
                s.name.toLowerCase() === skillName.toLowerCase()
            );

            if (skillIndex === -1) {
                throw AppError.notFound('Skill not found', {
                    context: { skillName }
                });
            }

            // Build update
            const updateFields = {};
            if (skillData.proficiencyLevel) updateFields[`skills.${skillIndex}.proficiencyLevel`] = skillData.proficiencyLevel;
            if (skillData.yearsOfExperience !== undefined) updateFields[`skills.${skillIndex}.yearsOfExperience`] = skillData.yearsOfExperience;
            if (skillData.lastUsed) updateFields[`skills.${skillIndex}.lastUsed`] = new Date(skillData.lastUsed);
            if (skillData.category) updateFields[`skills.${skillIndex}.category`] = skillData.category;

            updateFields['metadata.updatedBy'] = options.userId;

            const updatedConsultant = await Consultant.findByIdAndUpdate(
                consultant._id,
                { $set: updateFields },
                { new: true }
            );

            logger.info('Skill updated', { consultantId, skillName });

            return this._sanitizeConsultantOutput(updatedConsultant);

        } catch (error) {
            logger.error('Failed to update skill', {
                error: error.message,
                consultantId
            });
            throw error;
        }
    }

    /**
     * Remove skill from consultant
     * @param {string} consultantId - Consultant ID
     * @param {string} skillName - Skill name to remove
     * @param {Object} options - Update options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {string} options.userId - User ID performing the update
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @returns {Promise<Object>} Updated consultant
     */
    async removeSkill(consultantId, skillName, options = {}) {
        try {
            logger.info('Removing skill from consultant', {
                consultantId,
                skillName
            });

            const dbService = this._getDatabaseService();
            const Consultant = dbService.getModel('Consultant', 'customer');

            const consultant = await this._findConsultantRecord(consultantId);

            // Check tenant access with validation
            if (options.tenantId && !options.skipTenantCheck && mongoose.Types.ObjectId.isValid(options.tenantId) &&
                consultant.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this consultant');
            }

            const updatedConsultant = await Consultant.findByIdAndUpdate(
                consultant._id,
                {
                    $pull: { skills: { name: new RegExp(`^${skillName}$`, 'i') } },
                    $set: { 'metadata.updatedBy': options.userId }
                },
                { new: true }
            );

            // Track event
            await this._trackConsultantEvent(updatedConsultant, 'skill_removed', {
                userId: options.userId,
                skillName
            });

            logger.info('Skill removed from consultant', { consultantId, skillName });

            return this._sanitizeConsultantOutput(updatedConsultant);

        } catch (error) {
            logger.error('Failed to remove skill', {
                error: error.message,
                consultantId
            });
            throw error;
        }
    }

    /**
     * Verify consultant skill
     * @param {string} consultantId - Consultant ID
     * @param {string} skillName - Skill name to verify
     * @param {Object} options - Verification options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {string} options.userId - User ID performing verification
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @returns {Promise<Object>} Updated consultant
     */
    async verifySkill(consultantId, skillName, options = {}) {
        try {
            logger.info('Verifying consultant skill', {
                consultantId,
                skillName
            });

            const dbService = this._getDatabaseService();
            const Consultant = dbService.getModel('Consultant', 'customer');

            const consultant = await this._findConsultantRecord(consultantId);

            // Check tenant access with validation
            if (options.tenantId && !options.skipTenantCheck && mongoose.Types.ObjectId.isValid(options.tenantId) &&
                consultant.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this consultant');
            }

            // Find skill index
            const skillIndex = consultant.skills.findIndex(s =>
                s.name.toLowerCase() === skillName.toLowerCase()
            );

            if (skillIndex === -1) {
                throw AppError.notFound('Skill not found', {
                    context: { skillName }
                });
            }

            const updatedConsultant = await Consultant.findByIdAndUpdate(
                consultant._id,
                {
                    $set: {
                        [`skills.${skillIndex}.verified`]: true,
                        [`skills.${skillIndex}.verifiedBy`]: options.userId,
                        [`skills.${skillIndex}.verifiedAt`]: new Date(),
                        'metadata.updatedBy': options.userId
                    }
                },
                { new: true }
            );

            logger.info('Skill verified', { consultantId, skillName });

            return this._sanitizeConsultantOutput(updatedConsultant);

        } catch (error) {
            logger.error('Failed to verify skill', {
                error: error.message,
                consultantId
            });
            throw error;
        }
    }

    // ============================================================================
    // CERTIFICATIONS MANAGEMENT
    // ============================================================================

    /**
     * Add certification to consultant
     * @param {string} consultantId - Consultant ID
     * @param {Object} certificationData - Certification information
     * @param {string} certificationData.name - Certification name
     * @param {string} certificationData.issuingOrganization - Issuing organization
     * @param {Date} certificationData.issueDate - Issue date
     * @param {Date} certificationData.expirationDate - Expiration date
     * @param {string} certificationData.credentialId - Credential ID
     * @param {string} certificationData.credentialUrl - Verification URL
     * @param {string} certificationData.category - Certification category
     * @param {Object} options - Update options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {string} options.userId - User ID performing the update
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @returns {Promise<Object>} Updated consultant
     */
    async addCertification(consultantId, certificationData, options = {}) {
        try {
            logger.info('Adding certification to consultant', {
                consultantId,
                certificationName: certificationData.name
            });

            const dbService = this._getDatabaseService();
            const Consultant = dbService.getModel('Consultant', 'customer');

            const consultant = await this._findConsultantRecord(consultantId);

            // Check tenant access with validation
            if (options.tenantId && !options.skipTenantCheck && mongoose.Types.ObjectId.isValid(options.tenantId) &&
                consultant.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this consultant');
            }

            // Validate certification data
            if (!certificationData.name || !certificationData.issuingOrganization || !certificationData.issueDate) {
                throw AppError.validation('Name, issuing organization, and issue date are required');
            }

            // Check max certifications limit
            if (consultant.certifications.length >= this.config.maxCertificationsPerConsultant) {
                throw AppError.validation('Maximum certifications limit reached');
            }

            // Use model method
            await consultant.addCertification({
                name: certificationData.name.trim(),
                issuingOrganization: certificationData.issuingOrganization.trim(),
                issueDate: new Date(certificationData.issueDate),
                expirationDate: certificationData.expirationDate ? new Date(certificationData.expirationDate) : undefined,
                credentialId: certificationData.credentialId,
                credentialUrl: certificationData.credentialUrl,
                status: this._determineCertificationStatus(certificationData.expirationDate),
                verificationStatus: 'not_verified',
                category: certificationData.category || 'other',
                document: certificationData.document
            });

            // Track event
            await this._trackConsultantEvent(consultant, 'certification_added', {
                userId: options.userId,
                certificationName: certificationData.name
            });

            logger.info('Certification added', {
                consultantId,
                certificationName: certificationData.name
            });

            return this._sanitizeConsultantOutput(consultant);

        } catch (error) {
            logger.error('Failed to add certification', {
                error: error.message,
                consultantId
            });
            throw error;
        }
    }

    /**
     * Update certification for consultant
     * @param {string} consultantId - Consultant ID
     * @param {string} certificationId - Certification ID to update
     * @param {Object} certificationData - Updated certification information
     * @param {Object} options - Update options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {string} options.userId - User ID performing the update
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @returns {Promise<Object>} Updated consultant
     */
    async updateCertification(consultantId, certificationId, certificationData, options = {}) {
        try {
            logger.info('Updating consultant certification', {
                consultantId,
                certificationId
            });

            const dbService = this._getDatabaseService();
            const Consultant = dbService.getModel('Consultant', 'customer');

            const consultant = await this._findConsultantRecord(consultantId);

            // Check tenant access with validation
            if (options.tenantId && !options.skipTenantCheck && mongoose.Types.ObjectId.isValid(options.tenantId) &&
                consultant.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this consultant');
            }

            // Find certification index
            const certIndex = consultant.certifications.findIndex(c =>
                c.certificationId === certificationId || c._id?.toString() === certificationId
            );

            if (certIndex === -1) {
                throw AppError.notFound('Certification not found');
            }

            // Build update
            const updateFields = {};
            const certFields = ['name', 'issuingOrganization', 'issueDate', 'expirationDate', 'credentialId', 'credentialUrl', 'status', 'category'];
            certFields.forEach(field => {
                if (certificationData[field] !== undefined) {
                    updateFields[`certifications.${certIndex}.${field}`] = certificationData[field];
                }
            });

            // Update status based on expiration
            if (certificationData.expirationDate) {
                updateFields[`certifications.${certIndex}.status`] = this._determineCertificationStatus(certificationData.expirationDate);
            }

            updateFields['metadata.updatedBy'] = options.userId;

            const updatedConsultant = await Consultant.findByIdAndUpdate(
                consultant._id,
                { $set: updateFields },
                { new: true }
            );

            logger.info('Certification updated', { consultantId, certificationId });

            return this._sanitizeConsultantOutput(updatedConsultant);

        } catch (error) {
            logger.error('Failed to update certification', {
                error: error.message,
                consultantId
            });
            throw error;
        }
    }

    /**
     * Remove certification from consultant
     * @param {string} consultantId - Consultant ID
     * @param {string} certificationId - Certification ID to remove
     * @param {Object} options - Update options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {string} options.userId - User ID performing the update
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @returns {Promise<Object>} Updated consultant
     */
    async removeCertification(consultantId, certificationId, options = {}) {
        try {
            logger.info('Removing certification from consultant', {
                consultantId,
                certificationId
            });

            const dbService = this._getDatabaseService();
            const Consultant = dbService.getModel('Consultant', 'customer');

            const consultant = await this._findConsultantRecord(consultantId);

            // Check tenant access with validation
            if (options.tenantId && !options.skipTenantCheck && mongoose.Types.ObjectId.isValid(options.tenantId) &&
                consultant.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this consultant');
            }

            const updatedConsultant = await Consultant.findByIdAndUpdate(
                consultant._id,
                {
                    $pull: { certifications: { $or: [{ certificationId }, { _id: certificationId }] } },
                    $set: { 'metadata.updatedBy': options.userId }
                },
                { new: true }
            );

            logger.info('Certification removed', { consultantId, certificationId });

            return this._sanitizeConsultantOutput(updatedConsultant);

        } catch (error) {
            logger.error('Failed to remove certification', {
                error: error.message,
                consultantId
            });
            throw error;
        }
    }

    // ============================================================================
    // EDUCATION & WORK HISTORY
    // ============================================================================

    /**
     * Add education record to consultant
     * @param {string} consultantId - Consultant ID
     * @param {Object} educationData - Education information
     * @param {string} educationData.institution - Institution name
     * @param {string} educationData.degree - Degree type
     * @param {string} educationData.fieldOfStudy - Field of study
     * @param {Date} educationData.startDate - Start date
     * @param {Date} educationData.endDate - End date
     * @param {Object} options - Update options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {string} options.userId - User ID performing the update
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @returns {Promise<Object>} Updated consultant
     */
    async addEducation(consultantId, educationData, options = {}) {
        try {
            logger.info('Adding education to consultant', {
                consultantId,
                institution: educationData.institution
            });

            const dbService = this._getDatabaseService();
            const Consultant = dbService.getModel('Consultant', 'customer');

            const consultant = await this._findConsultantRecord(consultantId);

            // Check tenant access with validation
            if (options.tenantId && !options.skipTenantCheck && mongoose.Types.ObjectId.isValid(options.tenantId) &&
                consultant.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this consultant');
            }

            // Validate required fields
            if (!educationData.institution || !educationData.degree) {
                throw AppError.validation('Institution and degree are required');
            }

            const updatedConsultant = await Consultant.findByIdAndUpdate(
                consultant._id,
                {
                    $push: { education: educationData },
                    $set: { 'metadata.updatedBy': options.userId }
                },
                { new: true }
            );

            logger.info('Education added', { consultantId });

            return this._sanitizeConsultantOutput(updatedConsultant);

        } catch (error) {
            logger.error('Failed to add education', {
                error: error.message,
                consultantId
            });
            throw error;
        }
    }

    /**
     * Add work history record to consultant
     * @param {string} consultantId - Consultant ID
     * @param {Object} workHistoryData - Work history information
     * @param {string} workHistoryData.company - Company name
     * @param {string} workHistoryData.title - Job title
     * @param {Date} workHistoryData.startDate - Start date
     * @param {Date} workHistoryData.endDate - End date
     * @param {string} workHistoryData.description - Job description
     * @param {Array<string>} workHistoryData.responsibilities - Responsibilities
     * @param {Array<string>} workHistoryData.achievements - Achievements
     * @param {Object} options - Update options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {string} options.userId - User ID performing the update
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @returns {Promise<Object>} Updated consultant
     */
    async addWorkHistory(consultantId, workHistoryData, options = {}) {
        try {
            logger.info('Adding work history to consultant', {
                consultantId,
                company: workHistoryData.company
            });

            const dbService = this._getDatabaseService();
            const Consultant = dbService.getModel('Consultant', 'customer');

            const consultant = await this._findConsultantRecord(consultantId);

            // Check tenant access with validation
            if (options.tenantId && !options.skipTenantCheck && mongoose.Types.ObjectId.isValid(options.tenantId) &&
                consultant.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this consultant');
            }

            // Validate required fields
            if (!workHistoryData.company || !workHistoryData.title || !workHistoryData.startDate) {
                throw AppError.validation('Company, title, and start date are required');
            }

            const updatedConsultant = await Consultant.findByIdAndUpdate(
                consultant._id,
                {
                    $push: { workHistory: workHistoryData },
                    $set: { 'metadata.updatedBy': options.userId }
                },
                { new: true }
            );

            logger.info('Work history added', { consultantId });

            return this._sanitizeConsultantOutput(updatedConsultant);

        } catch (error) {
            logger.error('Failed to add work history', {
                error: error.message,
                consultantId
            });
            throw error;
        }
    }

    // ============================================================================
    // DOCUMENTS MANAGEMENT
    // ============================================================================

    /**
     * Add document to consultant
     * @param {string} consultantId - Consultant ID
     * @param {Object} documentData - Document information
     * @param {string} documentData.type - Document type
     * @param {string} documentData.name - Document name
     * @param {string} documentData.url - Document URL
     * @param {string} documentData.mimeType - MIME type
     * @param {number} documentData.size - File size in bytes
     * @param {Date} documentData.expirationDate - Expiration date
     * @param {string} documentData.visibility - Document visibility
     * @param {Object} options - Update options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {string} options.userId - User ID performing the update
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @returns {Promise<Object>} Updated consultant
     */
    async addDocument(consultantId, documentData, options = {}) {
        try {
            logger.info('Adding document to consultant', {
                consultantId,
                documentType: documentData.type
            });

            const dbService = this._getDatabaseService();
            const Consultant = dbService.getModel('Consultant', 'customer');

            const consultant = await this._findConsultantRecord(consultantId);

            // Check tenant access with validation
            if (options.tenantId && !options.skipTenantCheck && mongoose.Types.ObjectId.isValid(options.tenantId) &&
                consultant.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this consultant');
            }

            // Validate document data
            if (!documentData.type || !documentData.url) {
                throw AppError.validation('Document type and URL are required');
            }

            if (!Object.values(DOCUMENT_TYPES).includes(documentData.type)) {
                throw AppError.validation('Invalid document type');
            }

            const document = {
                documentId: `DOC-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
                type: documentData.type,
                name: documentData.name || documentData.type,
                description: documentData.description,
                url: documentData.url,
                mimeType: documentData.mimeType,
                size: documentData.size,
                uploadedBy: options.userId,
                uploadedAt: new Date(),
                expirationDate: documentData.expirationDate,
                status: 'active',
                visibility: documentData.visibility || 'internal'
            };

            const updatedConsultant = await Consultant.findByIdAndUpdate(
                consultant._id,
                {
                    $push: { documents: document },
                    $set: { 'metadata.updatedBy': options.userId }
                },
                { new: true }
            );

            logger.info('Document added', {
                consultantId,
                documentId: document.documentId
            });

            return this._sanitizeConsultantOutput(updatedConsultant);

        } catch (error) {
            logger.error('Failed to add document', {
                error: error.message,
                consultantId
            });
            throw error;
        }
    }

    /**
     * Remove document from consultant (soft delete - archives document)
     * @param {string} consultantId - Consultant ID
     * @param {string} documentId - Document ID to remove
     * @param {Object} options - Update options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {string} options.userId - User ID performing the update
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @param {boolean} options.hardDelete - Perform permanent deletion instead of archiving
     * @returns {Promise<Object>} Updated consultant
     */
    async removeDocument(consultantId, documentId, options = {}) {
        try {
            logger.info('Removing document from consultant', {
                consultantId,
                documentId,
                hardDelete: options.hardDelete
            });

            const dbService = this._getDatabaseService();
            const Consultant = dbService.getModel('Consultant', 'customer');

            const consultant = await this._findConsultantRecord(consultantId);

            // Check tenant access with validation
            if (options.tenantId && !options.skipTenantCheck && mongoose.Types.ObjectId.isValid(options.tenantId) &&
                consultant.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this consultant');
            }

            // Find document index to verify it exists
            const docIndex = consultant.documents.findIndex(d =>
                d.documentId === documentId || d._id?.toString() === documentId
            );

            if (docIndex === -1) {
                throw AppError.notFound('Document not found', {
                    context: { documentId }
                });
            }

            let updatedConsultant;

            if (options.hardDelete) {
                // Hard delete - permanently remove document
                updatedConsultant = await Consultant.findByIdAndUpdate(
                    consultant._id,
                    {
                        $pull: { documents: { $or: [{ documentId }, { _id: documentId }] } },
                        $set: { 'metadata.updatedBy': options.userId }
                    },
                    { new: true }
                );
                logger.info('Document permanently deleted', { consultantId, documentId });
            } else {
                // Soft delete - archive document
                updatedConsultant = await Consultant.findByIdAndUpdate(
                    consultant._id,
                    {
                        $set: {
                            [`documents.${docIndex}.status`]: 'archived',
                            'metadata.updatedBy': options.userId
                        }
                    },
                    { new: true }
                );
                logger.info('Document archived', { consultantId, documentId });
            }

            return this._sanitizeConsultantOutput(updatedConsultant);

        } catch (error) {
            logger.error('Failed to remove document', {
                error: error.message,
                consultantId
            });
            throw error;
        }
    }

    /**
     * Restore archived document
     * @param {string} consultantId - Consultant ID
     * @param {string} documentId - Document ID to restore
     * @param {Object} options - Update options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {string} options.userId - User ID performing the update
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @returns {Promise<Object>} Updated consultant
     */
    async restoreDocument(consultantId, documentId, options = {}) {
        try {
            logger.info('Restoring archived document', {
                consultantId,
                documentId
            });

            const dbService = this._getDatabaseService();
            const Consultant = dbService.getModel('Consultant', 'customer');

            const consultant = await this._findConsultantRecord(consultantId);

            // Check tenant access with validation
            if (options.tenantId && !options.skipTenantCheck && mongoose.Types.ObjectId.isValid(options.tenantId) &&
                consultant.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this consultant');
            }

            // Find document index
            const docIndex = consultant.documents.findIndex(d =>
                d.documentId === documentId || d._id?.toString() === documentId
            );

            if (docIndex === -1) {
                throw AppError.notFound('Document not found', {
                    context: { documentId }
                });
            }

            const updatedConsultant = await Consultant.findByIdAndUpdate(
                consultant._id,
                {
                    $set: {
                        [`documents.${docIndex}.status`]: 'active',
                        'metadata.updatedBy': options.userId
                    }
                },
                { new: true }
            );

            logger.info('Document restored', { consultantId, documentId });

            return this._sanitizeConsultantOutput(updatedConsultant);

        } catch (error) {
            logger.error('Failed to restore document', {
                error: error.message,
                consultantId
            });
            throw error;
        }
    }

    // ============================================================================
    // PERFORMANCE & REVIEWS
    // ============================================================================

    /**
     * Add performance review to consultant
     * @param {string} consultantId - Consultant ID
     * @param {Object} reviewData - Review information
     * @param {string} reviewData.type - Review type (annual, mid_year, quarterly, etc.)
     * @param {Date} reviewData.reviewDate - Review date
     * @param {number} reviewData.overallRating - Overall rating (1-5)
     * @param {Object} reviewData.ratings - Category ratings
     * @param {Array<string>} reviewData.strengths - Strengths
     * @param {Array<string>} reviewData.areasForImprovement - Areas for improvement
     * @param {string} reviewData.comments - Review comments
     * @param {Object} options - Update options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {string} options.userId - Reviewer user ID
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @returns {Promise<Object>} Updated consultant
     */
    async addPerformanceReview(consultantId, reviewData, options = {}) {
        try {
            logger.info('Adding performance review', {
                consultantId,
                reviewType: reviewData.type
            });

            const dbService = this._getDatabaseService();
            const Consultant = dbService.getModel('Consultant', 'customer');

            const consultant = await this._findConsultantRecord(consultantId);

            // Check tenant access with validation
            if (options.tenantId && !options.skipTenantCheck && mongoose.Types.ObjectId.isValid(options.tenantId) &&
                consultant.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this consultant');
            }

            // Validate review data
            if (!reviewData.type || !reviewData.overallRating) {
                throw AppError.validation('Review type and overall rating are required');
            }

            if (reviewData.overallRating < 1 || reviewData.overallRating > 5) {
                throw AppError.validation('Overall rating must be between 1 and 5');
            }

            const review = {
                reviewId: `REV-${Date.now()}`,
                type: reviewData.type,
                reviewDate: reviewData.reviewDate || new Date(),
                reviewer: options.userId,
                overallRating: reviewData.overallRating,
                ratings: reviewData.ratings || {},
                strengths: reviewData.strengths || [],
                areasForImprovement: reviewData.areasForImprovement || [],
                goals: reviewData.goals || [],
                comments: reviewData.comments,
                status: 'submitted'
            };

            // Update overall rating
            const updateFields = {
                'performance.rating.overall': reviewData.overallRating,
                'performance.rating.lastReviewDate': review.reviewDate,
                'metadata.updatedBy': options.userId
            };

            // Update category ratings if provided
            if (reviewData.ratings) {
                Object.keys(reviewData.ratings).forEach(category => {
                    updateFields[`performance.rating.${category}`] = reviewData.ratings[category];
                });
            }

            const updatedConsultant = await Consultant.findByIdAndUpdate(
                consultant._id,
                {
                    $push: { 'performance.reviews': review },
                    $set: updateFields
                },
                { new: true }
            );

            // Track event
            await this._trackConsultantEvent(updatedConsultant, 'performance_review_added', {
                userId: options.userId,
                reviewType: reviewData.type,
                rating: reviewData.overallRating
            });

            // Send notification to consultant
            await this._sendReviewNotification(updatedConsultant, review);

            logger.info('Performance review added', {
                consultantId,
                reviewId: review.reviewId
            });

            return this._sanitizeConsultantOutput(updatedConsultant);

        } catch (error) {
            logger.error('Failed to add performance review', {
                error: error.message,
                consultantId
            });
            throw error;
        }
    }

    /**
     * Add feedback for consultant
     * @param {string} consultantId - Consultant ID
     * @param {Object} feedbackData - Feedback information
     * @param {string} feedbackData.type - Feedback type (client, peer, manager, etc.)
     * @param {number} feedbackData.rating - Rating (1-5)
     * @param {string} feedbackData.content - Feedback content
     * @param {boolean} feedbackData.isAnonymous - Whether feedback is anonymous
     * @param {Object} feedbackData.categories - Category ratings
     * @param {Object} feedbackData.source - Source information (projectId, clientId)
     * @param {Object} options - Update options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {string} options.userId - Feedback provider user ID
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @returns {Promise<Object>} Updated consultant
     */
    async addFeedback(consultantId, feedbackData, options = {}) {
        try {
            logger.info('Adding feedback for consultant', {
                consultantId,
                feedbackType: feedbackData.type
            });

            const dbService = this._getDatabaseService();
            const Consultant = dbService.getModel('Consultant', 'customer');

            const consultant = await this._findConsultantRecord(consultantId);

            // Check tenant access with validation
            if (options.tenantId && !options.skipTenantCheck && mongoose.Types.ObjectId.isValid(options.tenantId) &&
                consultant.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this consultant');
            }

            // Validate rating
            if (feedbackData.rating && (feedbackData.rating < 1 || feedbackData.rating > 5)) {
                throw AppError.validation('Rating must be between 1 and 5');
            }

            // Validate content
            if (!feedbackData.content || feedbackData.content.trim().length === 0) {
                throw AppError.validation('Feedback content is required');
            }

            // Use model instance method to add feedback
            await consultant.addFeedback(feedbackData, options.userId);

            // Update metadata
            consultant.metadata.updatedBy = options.userId;
            await consultant.save();

            // Track event
            await this._trackConsultantEvent(consultant, 'feedback_added', {
                userId: options.userId,
                feedbackType: feedbackData.type,
                rating: feedbackData.rating
            });

            logger.info('Feedback added successfully', {
                consultantId,
                feedbackType: feedbackData.type
            });

            return this._sanitizeConsultantOutput(consultant);

        } catch (error) {
            logger.error('Failed to add feedback', {
                error: error.message,
                consultantId
            });
            throw error;
        }
    }

    /**
     * Update feedback for consultant
     * @param {string} consultantId - Consultant ID
     * @param {string} feedbackId - Feedback ID to update
     * @param {Object} updateData - Updated feedback information
     * @param {number} updateData.rating - Updated rating
     * @param {string} updateData.content - Updated content
     * @param {Object} updateData.categories - Updated category ratings
     * @param {Object} options - Update options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {string} options.userId - User ID performing the update
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @returns {Promise<Object>} Updated consultant
     */
    async updateFeedback(consultantId, feedbackId, updateData, options = {}) {
        try {
            logger.info('Updating feedback for consultant', {
                consultantId,
                feedbackId
            });

            const dbService = this._getDatabaseService();
            const Consultant = dbService.getModel('Consultant', 'customer');

            const consultant = await this._findConsultantRecord(consultantId);

            // Check tenant access with validation
            if (options.tenantId && !options.skipTenantCheck && mongoose.Types.ObjectId.isValid(options.tenantId) &&
                consultant.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this consultant');
            }

            // Find the feedback to verify user authorization
            const feedback = consultant.performance.feedback.find(f =>
                f.feedbackId === feedbackId || f._id?.toString() === feedbackId
            );

            if (!feedback) {
                throw AppError.notFound('Feedback not found', {
                    context: { feedbackId }
                });
            }

            // Only the original feedback provider can update their feedback
            if (!feedback.isAnonymous && feedback.source?.userId?.toString() !== options.userId) {
                throw AppError.forbidden('You can only update your own feedback');
            }

            // Use model instance method to update feedback
            await consultant.updateFeedback(feedbackId, updateData);

            // Update metadata
            consultant.metadata.updatedBy = options.userId;
            await consultant.save();

            // Track event
            await this._trackConsultantEvent(consultant, 'feedback_updated', {
                userId: options.userId,
                feedbackId
            });

            logger.info('Feedback updated successfully', {
                consultantId,
                feedbackId
            });

            return this._sanitizeConsultantOutput(consultant);

        } catch (error) {
            logger.error('Failed to update feedback', {
                error: error.message,
                consultantId,
                feedbackId
            });
            throw error;
        }
    }

    /**
     * Remove feedback from consultant (soft delete - archives feedback)
     * @param {string} consultantId - Consultant ID
     * @param {string} feedbackId - Feedback ID to remove
     * @param {Object} options - Update options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {string} options.userId - User ID performing the update
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @param {boolean} options.hardDelete - Perform permanent deletion instead of archiving
     * @returns {Promise<Object>} Updated consultant
     */
    async removeFeedback(consultantId, feedbackId, options = {}) {
        try {
            logger.info('Removing feedback from consultant', {
                consultantId,
                feedbackId,
                hardDelete: options.hardDelete
            });

            const dbService = this._getDatabaseService();
            const Consultant = dbService.getModel('Consultant', 'customer');

            const consultant = await this._findConsultantRecord(consultantId);

            // Check tenant access with validation
            if (options.tenantId && !options.skipTenantCheck && mongoose.Types.ObjectId.isValid(options.tenantId) &&
                consultant.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this consultant');
            }

            // Find the feedback to verify it exists and check authorization
            const feedback = consultant.performance.feedback.find(f =>
                f.feedbackId === feedbackId || f._id?.toString() === feedbackId
            );

            if (!feedback) {
                throw AppError.notFound('Feedback not found', {
                    context: { feedbackId }
                });
            }

            // Only the original feedback provider can remove their feedback
            if (!feedback.isAnonymous && feedback.source?.userId?.toString() !== options.userId) {
                throw AppError.forbidden('You can only remove your own feedback');
            }

            // Use model instance method for deletion
            if (options.hardDelete) {
                await consultant.hardDeleteFeedback(feedbackId);
                logger.info('Feedback permanently deleted', { consultantId, feedbackId });
            } else {
                await consultant.archiveFeedback(feedbackId);
                logger.info('Feedback archived', { consultantId, feedbackId });
            }

            // Update metadata
            consultant.metadata.updatedBy = options.userId;
            await consultant.save();

            // Track event
            await this._trackConsultantEvent(consultant, 'feedback_removed', {
                userId: options.userId,
                feedbackId,
                hardDelete: options.hardDelete
            });

            return this._sanitizeConsultantOutput(consultant);

        } catch (error) {
            logger.error('Failed to remove feedback', {
                error: error.message,
                consultantId,
                feedbackId
            });
            throw error;
        }
    }

    /**
     * Restore archived feedback
     * @param {string} consultantId - Consultant ID
     * @param {string} feedbackId - Feedback ID to restore
     * @param {Object} options - Update options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {string} options.userId - User ID performing the update
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @returns {Promise<Object>} Updated consultant
     */
    async restoreFeedback(consultantId, feedbackId, options = {}) {
        try {
            logger.info('Restoring archived feedback', {
                consultantId,
                feedbackId
            });

            const dbService = this._getDatabaseService();
            const Consultant = dbService.getModel('Consultant', 'customer');

            const consultant = await this._findConsultantRecord(consultantId);

            // Check tenant access with validation
            if (options.tenantId && !options.skipTenantCheck && mongoose.Types.ObjectId.isValid(options.tenantId) &&
                consultant.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this consultant');
            }

            // Use model instance method to restore feedback
            await consultant.restoreFeedback(feedbackId);

            // Update metadata
            consultant.metadata.updatedBy = options.userId;
            await consultant.save();

            logger.info('Feedback restored successfully', { consultantId, feedbackId });

            return this._sanitizeConsultantOutput(consultant);

        } catch (error) {
            logger.error('Failed to restore feedback', {
                error: error.message,
                consultantId,
                feedbackId
            });
            throw error;
        }
    }

    /**
     * Add achievement for consultant
     * @param {string} consultantId - Consultant ID
     * @param {Object} achievementData - Achievement information
     * @param {string} achievementData.title - Achievement title
     * @param {string} achievementData.description - Achievement description
     * @param {Date} achievementData.date - Achievement date
     * @param {string} achievementData.category - Achievement category
     * @param {Object} options - Update options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {string} options.userId - User ID performing the update
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @returns {Promise<Object>} Updated consultant
     */
    async addAchievement(consultantId, achievementData, options = {}) {
        try {
            logger.info('Adding achievement for consultant', {
                consultantId,
                title: achievementData.title
            });

            const dbService = this._getDatabaseService();
            const Consultant = dbService.getModel('Consultant', 'customer');

            const consultant = await this._findConsultantRecord(consultantId);

            // Check tenant access with validation
            if (options.tenantId && !options.skipTenantCheck && mongoose.Types.ObjectId.isValid(options.tenantId) &&
                consultant.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this consultant');
            }

            if (!achievementData.title) {
                throw AppError.validation('Achievement title is required');
            }

            const achievement = {
                title: achievementData.title,
                description: achievementData.description,
                date: achievementData.date || new Date(),
                category: achievementData.category,
                awarded: true,
                awardedBy: options.userId
            };

            const updatedConsultant = await Consultant.findByIdAndUpdate(
                consultant._id,
                {
                    $push: { 'performance.achievements': achievement },
                    $set: { 'metadata.updatedBy': options.userId }
                },
                { new: true }
            );

            logger.info('Achievement added', { consultantId });

            return this._sanitizeConsultantOutput(updatedConsultant);

        } catch (error) {
            logger.error('Failed to add achievement', {
                error: error.message,
                consultantId
            });
            throw error;
        }
    }

    // ============================================================================
    // COMPLIANCE MANAGEMENT
    // ============================================================================

    /**
     * Update compliance status for consultant
     * @param {string} consultantId - Consultant ID
     * @param {Object} complianceData - Compliance information
     * @param {Object} complianceData.backgroundCheck - Background check status
     * @param {Object} complianceData.nda - NDA status
     * @param {Object} complianceData.securityClearance - Security clearance info
     * @param {Object} options - Update options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {string} options.userId - User ID performing the update
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @returns {Promise<Object>} Updated consultant
     */
    async updateComplianceStatus(consultantId, complianceData, options = {}) {
        try {
            logger.info('Updating compliance status', { consultantId });

            const dbService = this._getDatabaseService();
            const Consultant = dbService.getModel('Consultant', 'customer');

            const consultant = await this._findConsultantRecord(consultantId);

            // Check tenant access with validation
            if (options.tenantId && !options.skipTenantCheck && mongoose.Types.ObjectId.isValid(options.tenantId) &&
                consultant.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this consultant');
            }

            const updateFields = {};

            if (complianceData.backgroundCheck) {
                Object.keys(complianceData.backgroundCheck).forEach(key => {
                    updateFields[`compliance.backgroundCheck.${key}`] = complianceData.backgroundCheck[key];
                });
            }

            if (complianceData.nda) {
                Object.keys(complianceData.nda).forEach(key => {
                    updateFields[`compliance.nda.${key}`] = complianceData.nda[key];
                });
            }

            if (complianceData.securityClearance) {
                Object.keys(complianceData.securityClearance).forEach(key => {
                    updateFields[`compliance.securityClearance.${key}`] = complianceData.securityClearance[key];
                });
            }

            updateFields['metadata.updatedBy'] = options.userId;

            const updatedConsultant = await Consultant.findByIdAndUpdate(
                consultant._id,
                { $set: updateFields },
                { new: true }
            );

            // Track event
            await this._trackConsultantEvent(updatedConsultant, 'compliance_updated', {
                userId: options.userId,
                updates: Object.keys(complianceData)
            });

            logger.info('Compliance status updated', { consultantId });

            return this._sanitizeConsultantOutput(updatedConsultant);

        } catch (error) {
            logger.error('Failed to update compliance status', {
                error: error.message,
                consultantId
            });
            throw error;
        }
    }

    /**
     * Add conflict of interest declaration
     * @param {string} consultantId - Consultant ID
     * @param {Object} declarationData - Declaration information
     * @param {string} declarationData.description - Description of conflict
     * @param {string} declarationData.relatedEntity - Related entity name
     * @param {string} declarationData.resolution - Resolution approach
     * @param {Object} options - Update options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {string} options.userId - User ID performing the update
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @returns {Promise<Object>} Updated consultant
     */
    async addConflictOfInterestDeclaration(consultantId, declarationData, options = {}) {
        try {
            logger.info('Adding conflict of interest declaration', { consultantId });

            const dbService = this._getDatabaseService();
            const Consultant = dbService.getModel('Consultant', 'customer');

            const consultant = await this._findConsultantRecord(consultantId);

            // Check tenant access with validation
            if (options.tenantId && !options.skipTenantCheck && mongoose.Types.ObjectId.isValid(options.tenantId) &&
                consultant.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this consultant');
            }

            if (!declarationData.description) {
                throw AppError.validation('Declaration description is required');
            }

            const declaration = {
                description: declarationData.description,
                relatedEntity: declarationData.relatedEntity,
                declaredAt: new Date(),
                resolution: declarationData.resolution
            };

            const updatedConsultant = await Consultant.findByIdAndUpdate(
                consultant._id,
                {
                    $set: {
                        'compliance.conflictOfInterest.declared': true,
                        'metadata.updatedBy': options.userId
                    },
                    $push: { 'compliance.conflictOfInterest.declarations': declaration }
                },
                { new: true }
            );

            logger.info('Conflict of interest declaration added', { consultantId });

            return this._sanitizeConsultantOutput(updatedConsultant);

        } catch (error) {
            logger.error('Failed to add conflict of interest declaration', {
                error: error.message,
                consultantId
            });
            throw error;
        }
    }

    // ============================================================================
    // STATUS MANAGEMENT
    // ============================================================================

    /**
     * Activate consultant
     * @param {string} consultantId - Consultant ID
     * @param {Object} options - Activation options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {string} options.userId - User ID performing activation
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @returns {Promise<Object>} Activated consultant
     */
    async activateConsultant(consultantId, options = {}) {
        try {
            logger.info('Activating consultant', { consultantId });

            const dbService = this._getDatabaseService();
            const Consultant = dbService.getModel('Consultant', 'customer');

            const consultant = await this._findConsultantRecord(consultantId);

            // Check tenant access with validation
            if (options.tenantId && !options.skipTenantCheck && mongoose.Types.ObjectId.isValid(options.tenantId) &&
                consultant.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this consultant');
            }

            // Check if already active
            if (consultant.status.current === CONSULTANT_STATUS.ACTIVE) {
                throw AppError.validation('Consultant is already active');
            }

            const updatedConsultant = await Consultant.findByIdAndUpdate(
                consultant._id,
                {
                    $set: {
                        'status.current': CONSULTANT_STATUS.ACTIVE,
                        'status.effectiveDate': new Date(),
                        'status.isActive': true,
                        'metadata.updatedBy': options.userId
                    }
                },
                { new: true }
            );

            // Send activation notification
            await this._sendStatusChangeNotification(updatedConsultant, 'activated');

            // Track event
            await this._trackConsultantEvent(updatedConsultant, 'consultant_activated', {
                userId: options.userId
            });

            logger.info('Consultant activated', { consultantId });

            return this._sanitizeConsultantOutput(updatedConsultant);

        } catch (error) {
            logger.error('Failed to activate consultant', {
                error: error.message,
                consultantId
            });
            throw error;
        }
    }

    /**
     * Deactivate consultant
     * @param {string} consultantId - Consultant ID
     * @param {Object} deactivationData - Deactivation information
     * @param {string} deactivationData.reason - Reason for deactivation
     * @param {Date} deactivationData.returnDate - Expected return date (for leaves)
     * @param {Object} options - Deactivation options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {string} options.userId - User ID performing deactivation
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @returns {Promise<Object>} Deactivated consultant
     */
    async deactivateConsultant(consultantId, deactivationData = {}, options = {}) {
        try {
            logger.info('Deactivating consultant', { consultantId });

            const dbService = this._getDatabaseService();
            const Consultant = dbService.getModel('Consultant', 'customer');

            const consultant = await this._findConsultantRecord(consultantId);

            // Check tenant access with validation
            if (options.tenantId && !options.skipTenantCheck && mongoose.Types.ObjectId.isValid(options.tenantId) &&
                consultant.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this consultant');
            }

            const updatedConsultant = await Consultant.findByIdAndUpdate(
                consultant._id,
                {
                    $set: {
                        'status.current': CONSULTANT_STATUS.INACTIVE,
                        'status.reason': deactivationData.reason,
                        'status.effectiveDate': new Date(),
                        'status.returnDate': deactivationData.returnDate,
                        'status.isActive': false,
                        'availability.status': AVAILABILITY_STATUS.UNAVAILABLE,
                        'availability.capacityPercentage': 0,
                        'metadata.updatedBy': options.userId
                    }
                },
                { new: true }
            );

            // Track event
            await this._trackConsultantEvent(updatedConsultant, 'consultant_deactivated', {
                userId: options.userId,
                reason: deactivationData.reason
            });

            logger.info('Consultant deactivated', { consultantId });

            return this._sanitizeConsultantOutput(updatedConsultant);

        } catch (error) {
            logger.error('Failed to deactivate consultant', {
                error: error.message,
                consultantId
            });
            throw error;
        }
    }

    /**
     * Put consultant on leave
     * @param {string} consultantId - Consultant ID
     * @param {Object} leaveData - Leave information
     * @param {string} leaveData.reason - Reason for leave
     * @param {Date} leaveData.returnDate - Expected return date
     * @param {Object} options - Leave options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {string} options.userId - User ID performing the action
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @returns {Promise<Object>} Updated consultant
     */
    async putOnLeave(consultantId, leaveData, options = {}) {
        try {
            logger.info('Putting consultant on leave', { consultantId });

            const dbService = this._getDatabaseService();
            const Consultant = dbService.getModel('Consultant', 'customer');

            const consultant = await this._findConsultantRecord(consultantId);

            // Check tenant access with validation
            if (options.tenantId && !options.skipTenantCheck && mongoose.Types.ObjectId.isValid(options.tenantId) &&
                consultant.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this consultant');
            }

            const updatedConsultant = await Consultant.findByIdAndUpdate(
                consultant._id,
                {
                    $set: {
                        'status.current': CONSULTANT_STATUS.ON_LEAVE,
                        'status.reason': leaveData.reason,
                        'status.effectiveDate': new Date(),
                        'status.returnDate': leaveData.returnDate,
                        'availability.status': AVAILABILITY_STATUS.ON_LEAVE,
                        'availability.capacityPercentage': 0,
                        'metadata.updatedBy': options.userId
                    }
                },
                { new: true }
            );

            // Track event
            await this._trackConsultantEvent(updatedConsultant, 'consultant_on_leave', {
                userId: options.userId,
                returnDate: leaveData.returnDate
            });

            logger.info('Consultant put on leave', { consultantId });

            return this._sanitizeConsultantOutput(updatedConsultant);

        } catch (error) {
            logger.error('Failed to put consultant on leave', {
                error: error.message,
                consultantId
            });
            throw error;
        }
    }

    /**
     * Suspend consultant
     * @param {string} consultantId - Consultant ID
     * @param {Object} suspensionData - Suspension information
     * @param {string} suspensionData.reason - Reason for suspension
     * @param {Object} options - Suspension options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {string} options.userId - User ID performing suspension
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @returns {Promise<Object>} Suspended consultant
     */
    async suspendConsultant(consultantId, suspensionData, options = {}) {
        try {
            logger.info('Suspending consultant', { consultantId });

            if (!suspensionData?.reason) {
                throw AppError.validation('Suspension reason is required');
            }

            const dbService = this._getDatabaseService();
            const Consultant = dbService.getModel('Consultant', 'customer');

            const consultant = await this._findConsultantRecord(consultantId);

            // Check tenant access with validation
            if (options.tenantId && !options.skipTenantCheck && mongoose.Types.ObjectId.isValid(options.tenantId) &&
                consultant.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this consultant');
            }

            const updatedConsultant = await Consultant.findByIdAndUpdate(
                consultant._id,
                {
                    $set: {
                        'status.current': CONSULTANT_STATUS.SUSPENDED,
                        'status.reason': suspensionData.reason,
                        'status.effectiveDate': new Date(),
                        'status.isActive': false,
                        'availability.status': AVAILABILITY_STATUS.UNAVAILABLE,
                        'availability.capacityPercentage': 0,
                        'metadata.updatedBy': options.userId
                    }
                },
                { new: true }
            );

            // Track event
            await this._trackConsultantEvent(updatedConsultant, 'consultant_suspended', {
                userId: options.userId,
                reason: suspensionData.reason
            });

            logger.info('Consultant suspended', { consultantId });

            return this._sanitizeConsultantOutput(updatedConsultant);

        } catch (error) {
            logger.error('Failed to suspend consultant', {
                error: error.message,
                consultantId
            });
            throw error;
        }
    }

    /**
     * Terminate consultant
     * @param {string} consultantId - Consultant ID
     * @param {Object} terminationData - Termination information
     * @param {string} terminationData.reason - Reason for termination
     * @param {Date} terminationData.terminationDate - Termination effective date
     * @param {Object} options - Termination options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {string} options.userId - User ID performing termination
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @returns {Promise<Object>} Terminated consultant
     */
    async terminateConsultant(consultantId, terminationData, options = {}) {
        try {
            logger.info('Terminating consultant', { consultantId });

            if (!terminationData?.reason) {
                throw AppError.validation('Termination reason is required');
            }

            const dbService = this._getDatabaseService();
            const Consultant = dbService.getModel('Consultant', 'customer');

            const consultant = await this._findConsultantRecord(consultantId);

            // Check tenant access with validation
            if (options.tenantId && !options.skipTenantCheck && mongoose.Types.ObjectId.isValid(options.tenantId) &&
                consultant.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this consultant');
            }

            const updatedConsultant = await Consultant.findByIdAndUpdate(
                consultant._id,
                {
                    $set: {
                        'status.current': CONSULTANT_STATUS.TERMINATED,
                        'status.terminationDate': terminationData.terminationDate || new Date(),
                        'status.terminationReason': terminationData.reason,
                        'status.isActive': false,
                        'professional.endDate': terminationData.terminationDate || new Date(),
                        'availability.status': AVAILABILITY_STATUS.UNAVAILABLE,
                        'availability.capacityPercentage': 0,
                        'metadata.updatedBy': options.userId
                    }
                },
                { new: true }
            );

            // Track event
            await this._trackConsultantEvent(updatedConsultant, 'consultant_terminated', {
                userId: options.userId,
                reason: terminationData.reason
            });

            logger.info('Consultant terminated', { consultantId });

            return this._sanitizeConsultantOutput(updatedConsultant);

        } catch (error) {
            logger.error('Failed to terminate consultant', {
                error: error.message,
                consultantId
            });
            throw error;
        }
    }

    // ============================================================================
    // DELETION
    // ============================================================================

    /**
     * Delete consultant (soft delete)
     * @param {string} consultantId - Consultant ID
     * @param {Object} options - Delete options
     * @param {string} options.tenantId - Tenant ID for access control
     * @param {string} options.userId - User ID performing deletion
     * @param {boolean} options.skipTenantCheck - Skip tenant verification (for self-service operations)
     * @param {boolean} options.hardDelete - Perform permanent deletion
     * @returns {Promise<Object>} Deletion result
     */
    async deleteConsultant(consultantId, options = {}) {
        try {
            logger.info('Deleting consultant', { consultantId, hardDelete: options.hardDelete });

            const dbService = this._getDatabaseService();
            const Consultant = dbService.getModel('Consultant', 'customer');

            const consultant = await this._findConsultantRecord(consultantId);

            // Check tenant access with validation
            if (options.tenantId && !options.skipTenantCheck && mongoose.Types.ObjectId.isValid(options.tenantId) &&
                consultant.tenantId.toString() !== options.tenantId) {
                throw AppError.forbidden('Access denied to this consultant');
            }

            if (options.hardDelete) {
                await Consultant.findByIdAndDelete(consultant._id);
            } else {
                await Consultant.findByIdAndUpdate(consultant._id, {
                    $set: {
                        'status.isDeleted': true,
                        'status.deletedAt': new Date(),
                        'status.deletedBy': options.userId,
                        'status.isActive': false
                    }
                });
            }

            // Track event
            await this._trackConsultantEvent(consultant, 'consultant_deleted', {
                userId: options.userId,
                hardDelete: options.hardDelete
            });

            logger.info('Consultant deleted', { consultantId, hardDelete: options.hardDelete });

            return {
                success: true,
                consultantId: consultant.consultantCode,
                deleted: true
            };

        } catch (error) {
            logger.error('Failed to delete consultant', {
                error: error.message,
                consultantId
            });
            throw error;
        }
    }

    // ============================================================================
    // STATISTICS & REPORTS
    // ============================================================================

    /**
     * Get consultant statistics
     * @param {Object} options - Statistics options
     * @param {string} options.tenantId - Tenant ID
     * @param {string} options.organizationId - Filter by organization
     * @returns {Promise<Object>} Consultant statistics
     */
    async getConsultantStatistics(options = {}) {
        try {
            logger.info('Generating consultant statistics', {
                tenantId: options.tenantId
            });

            const dbService = this._getDatabaseService();
            const Consultant = dbService.getModel('Consultant', 'customer');

            // Get tenantId with validation
            const tenantId = options.tenantId || this.config.companyTenantId;
            const tenantIdToUse = (tenantId && mongoose.Types.ObjectId.isValid(tenantId)) ? tenantId : this.config.companyTenantId;

            const stats = await Consultant.getStatistics(tenantIdToUse);

            return {
                distribution: {
                    byStatus: stats[0]?.byStatus || [],
                    byLevel: stats[0]?.byLevel || [],
                    byAvailability: stats[0]?.byAvailability || [],
                    byEmploymentType: stats[0]?.byEmploymentType || []
                },
                topSkills: stats[0]?.topSkills || [],
                averageRating: stats[0]?.averageRating?.[0]?.avg || 0,
                total: stats[0]?.totals?.[0]?.total || 0,
                generatedAt: new Date()
            };

        } catch (error) {
            logger.error('Failed to generate consultant statistics', {
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Search consultants by skills
     * @param {Array<string>} skills - Required skills
     * @param {Object} options - Search options
     * @param {string} options.tenantId - Tenant ID
     * @param {number} options.limit - Maximum results
     * @returns {Promise<Array>} Matching consultants with match scores
     */
    async searchBySkills(skills, options = {}) {
        try {
            logger.info('Searching consultants by skills', {
                skillsCount: skills.length
            });

            const dbService = this._getDatabaseService();
            const Consultant = dbService.getModel('Consultant', 'customer');

            // Get tenantId with validation
            const tenantId = options.tenantId || this.config.companyTenantId;
            const tenantIdToUse = (tenantId && mongoose.Types.ObjectId.isValid(tenantId) && tenantId == 'default') ? tenantId : this.config.companyTenantId;

            const results = await Consultant.searchBySkills(
                tenantIdToUse,
                skills,
                { limit: options.limit || 20 }
            );

            return results.map(c => this._sanitizeConsultantOutput(c));

        } catch (error) {
            logger.error('Failed to search by skills', {
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Get utilization report
     * @param {string} consultantId - Consultant ID (optional, all if not provided)
     * @param {Date} startDate - Report start date
     * @param {Date} endDate - Report end date
     * @param {Object} options - Report options
     * @param {string} options.tenantId - Tenant ID
     * @returns {Promise<Object>} Utilization report
     */
    async getUtilizationReport(consultantId, startDate, endDate, options = {}) {
        try {
            logger.info('Generating utilization report', { consultantId, startDate, endDate });

            const dbService = this._getDatabaseService();
            const Consultant = dbService.getModel('Consultant', 'customer');

            // Build match stage with validated tenantId
            const tenantId = options.tenantId || this.config.companyTenantId;
            const matchStage = {
                'status.isDeleted': false
            };

            // Add tenantId with validation
            if (tenantId && mongoose.Types.ObjectId.isValid(tenantId)) {
                matchStage.tenantId = new mongoose.Types.ObjectId(tenantId);
            }

            // Add consultantId with validation if provided
            if (consultantId && mongoose.Types.ObjectId.isValid(consultantId)) {
                matchStage._id = new mongoose.Types.ObjectId(consultantId);
            }

            const report = await Consultant.aggregate([
                { $match: matchStage },
                {
                    $project: {
                        consultantCode: 1,
                        name: { $concat: ['$profile.firstName', ' ', '$profile.lastName'] },
                        level: '$professional.level',
                        utilizationTarget: '$billing.utilization.target',
                        currentUtilization: '$billing.utilization.current',
                        ytdUtilization: '$billing.utilization.ytd',
                        hoursPerWeek: '$availability.hoursPerWeek',
                        capacityPercentage: '$availability.capacityPercentage',
                        activeAssignments: {
                            $size: {
                                $filter: {
                                    input: '$assignments',
                                    as: 'assignment',
                                    cond: { $eq: ['$$assignment.status', 'active'] }
                                }
                            }
                        }
                    }
                },
                { $sort: { currentUtilization: -1 } }
            ]);

            return {
                period: { startDate, endDate },
                data: report,
                generatedAt: new Date()
            };

        } catch (error) {
            logger.error('Failed to generate utilization report', {
                error: error.message,
                consultantId
            });
            throw error;
        }
    }

    // ============================================================================
    // PRIVATE HELPER METHODS
    // ============================================================================

    /**
     * Find consultant record by ID or code
     * @private
     * @param {string} consultantId - Consultant ID or code
     * @returns {Promise<Object>} Consultant document
     */
    async _findConsultantRecord(consultantId) {
        const dbService = this._getDatabaseService();
        const Consultant = dbService.getModel('Consultant', 'customer');

        let consultant;
        if (mongoose.Types.ObjectId.isValid(consultantId)) {
            consultant = await Consultant.findById(consultantId);
        }

        if (!consultant) {
            consultant = await Consultant.findOne({
                consultantCode: consultantId.toUpperCase()
            });
        }

        if (!consultant) {
            throw AppError.notFound('Consultant not found', {
                context: { consultantId }
            });
        }

        return consultant;
    }

    /**
     * Validate consultant data
     * @private
     * @param {Object} data - Consultant data
     */
    async _validateConsultantData(data) {
        const errors = [];

        if (!data.profile?.firstName) {
            errors.push('First name is required');
        }

        if (!data.profile?.lastName) {
            errors.push('Last name is required');
        }

        if (!data.contact?.email?.primary) {
            errors.push('Primary email is required');
        } else if (!validator.isEmail(data.contact.email.primary)) {
            errors.push('Invalid email format');
        }

        if (!data.professional?.startDate) {
            errors.push('Start date is required');
        }

        if (errors.length > 0) {
            throw AppError.validation('Consultant validation failed', { errors });
        }
    }

    /**
     * Validate consultant update data
     * @private
     * @param {Object} data - Update data
     */
    async _validateConsultantUpdateData(data) {
        const errors = [];

        if (data.contact?.email?.primary && !validator.isEmail(data.contact.email.primary)) {
            errors.push('Invalid email format');
        }

        if (data.billing?.defaultRate?.amount && data.billing.defaultRate.amount < 0) {
            errors.push('Rate cannot be negative');
        }

        if (errors.length > 0) {
            throw AppError.validation('Update validation failed', { errors });
        }
    }

    /**
     * Check for duplicate consultant
     * @private
     * @param {Object} data - Consultant data
     * @param {string} tenantId - Tenant ID
     */
    async _checkDuplicateConsultant(data, tenantId) {
        const dbService = this._getDatabaseService();
        const Consultant = dbService.getModel('Consultant', 'customer');

        // Check by email
        const existingByEmail = await Consultant.findOne({
            'contact.email.primary': data.contact.email.primary.toLowerCase(),
            'status.isDeleted': false
        });

        if (existingByEmail) {
            throw AppError.conflict('A consultant with this email already exists', {
                context: { email: data.contact.email.primary }
            });
        }

        // Check by consultant code if provided
        if (data.consultantCode) {
            const existingByCode = await Consultant.findOne({
                consultantCode: data.consultantCode.toUpperCase(),
                'status.isDeleted': false
            });

            if (existingByCode) {
                throw AppError.conflict('A consultant with this code already exists', {
                    context: { consultantCode: data.consultantCode }
                });
            }
        }
    }

    /**
     * Generate consultant code
     * @private
     * @param {Object} data - Consultant data
     * @returns {Promise<string>} Generated code
     */
    async _generateConsultantCode(data) {
        const prefix = 'CON';
        const firstName = (data.profile?.firstName || 'X').charAt(0).toUpperCase();
        const lastName = (data.profile?.lastName || 'X').charAt(0).toUpperCase();
        const timestamp = Date.now().toString(36).toUpperCase().slice(-4);
        const random = crypto.randomBytes(2).toString('hex').toUpperCase();

        return `${prefix}-${firstName}${lastName}${timestamp}${random}`;
    }

    /**
     * Determine certification status based on expiration
     * @private
     * @param {Date} expirationDate - Certification expiration date
     * @returns {string} Certification status
     */
    _determineCertificationStatus(expirationDate) {
        if (!expirationDate) {
            return CERTIFICATION_STATUS.ACTIVE;
        }

        const now = new Date();
        const expDate = new Date(expirationDate);
        const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

        if (expDate < now) {
            return CERTIFICATION_STATUS.EXPIRED;
        }

        if (expDate < thirtyDaysFromNow) {
            return CERTIFICATION_STATUS.PENDING_RENEWAL;
        }

        return CERTIFICATION_STATUS.ACTIVE;
    }

    /**
     * Handle post-creation activities
     * @private
     * @param {Object} consultant - Created consultant
     * @param {Object} options - Options
     */
    async _handlePostConsultantCreation(consultant, options) {
        try {
            // Send welcome notification
            if (consultant.contact?.email?.primary && options.sendWelcome !== false) {
                await this.notificationService?.sendEmail?.({
                    to: consultant.contact.email.primary,
                    template: 'consultant_welcome',
                    data: {
                        firstName: consultant.profile.firstName,
                        consultantCode: consultant.consultantCode,
                        platformUrl: this.config.platformUrl
                    }
                });
            }

            // Track creation event
            await this._trackConsultantEvent(consultant, 'consultant_created', {
                userId: options.userId
            });

        } catch (error) {
            logger.warn('Post-creation activities failed', {
                error: error.message,
                consultantId: consultant._id
            });
        }
    }

    /**
     * Send status change notification
     * @private
     * @param {Object} consultant - Consultant
     * @param {string} action - Status change action
     */
    async _sendStatusChangeNotification(consultant, action) {
        try {
            if (consultant.contact?.email?.primary) {
                await this.notificationService?.sendEmail?.({
                    to: consultant.contact.email.primary,
                    template: `consultant_${action}`,
                    data: {
                        firstName: consultant.profile.firstName,
                        status: consultant.status.current
                    }
                });
            }
        } catch (error) {
            logger.warn('Failed to send status change notification', {
                error: error.message,
                consultantId: consultant._id
            });
        }
    }

    /**
     * Send review notification
     * @private
     * @param {Object} consultant - Consultant
     * @param {Object} review - Review data
     */
    async _sendReviewNotification(consultant, review) {
        try {
            if (consultant.contact?.email?.primary) {
                await this.notificationService?.sendEmail?.({
                    to: consultant.contact.email.primary,
                    template: 'performance_review_submitted',
                    data: {
                        firstName: consultant.profile.firstName,
                        reviewType: review.type,
                        reviewDate: review.reviewDate
                    }
                });
            }
        } catch (error) {
            logger.warn('Failed to send review notification', {
                error: error.message,
                consultantId: consultant._id
            });
        }
    }

    /**
     * Track consultant event
     * @private
     * @param {Object} consultant - Consultant
     * @param {string} eventType - Event type
     * @param {Object} data - Event data
     */
    async _trackConsultantEvent(consultant, eventType, data) {
        try {
            await this.analyticsService?.trackEvent?.({
                eventType,
                entityType: 'consultant',
                entityId: consultant._id,
                tenantId: consultant.tenantId,
                data: {
                    consultantCode: consultant.consultantCode,
                    ...data
                },
                timestamp: new Date()
            });
        } catch (error) {
            logger.warn('Failed to track consultant event', {
                error: error.message,
                eventType,
                consultantId: consultant._id
            });
        }
    }

    /**
     * Sanitize consultant output
     * @private
     * @param {Object} consultant - Consultant document
     * @returns {Object} Sanitized consultant
     */
    _sanitizeConsultantOutput(consultant) {
        if (!consultant) return null;

        const sanitized = consultant.toObject ? consultant.toObject() : { ...consultant };

        // Remove sensitive fields
        delete sanitized.__v;
        delete sanitized.searchTokens;

        // Remove any encrypted fields that shouldn't be exposed
        if (sanitized.compliance?.nda?.documentUrl) {
            sanitized.compliance.nda.hasDocument = true;
            delete sanitized.compliance.nda.documentUrl;
        }

        return sanitized;
    }
}

// Export singleton instance
module.exports = new ConsultantService();
module.exports.ConsultantService = ConsultantService;
module.exports.CONSULTANT_STATUS = CONSULTANT_STATUS;
module.exports.PROFESSIONAL_LEVEL = PROFESSIONAL_LEVEL;
module.exports.EMPLOYMENT_TYPE = EMPLOYMENT_TYPE;
module.exports.AVAILABILITY_STATUS = AVAILABILITY_STATUS;
module.exports.CERTIFICATION_STATUS = CERTIFICATION_STATUS;
module.exports.DOCUMENT_TYPES = DOCUMENT_TYPES;