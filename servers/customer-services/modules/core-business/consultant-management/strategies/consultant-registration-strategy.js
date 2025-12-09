/**
 * @fileoverview Consultant Registration Strategy - Bidirectional Linking Implementation
 * @module servers/customer-services/modules/core-business/consultant-management/strategies/consultant-registration-strategy
 * @description Consultant-specific implementation extending universal registration strategy base class
 * 
 * @version 2.1.0
 * @created 2025-11-28
 * @updated 2025-12-08
 * 
 * IMPLEMENTATION NOTES:
 * - Extends UniversalRegistrationStrategy for bidirectional User ↔ Consultant linking
 * - User documents maintain consultantId field referencing Consultant._id
 * - Consultant documents maintain userId field referencing User._id
 * - Two-phase commit: Phase 1 creates entities, Phase 2 establishes User.consultantId back-reference
 * 
 * CRITICAL FIXES IN THIS VERSION:
 * - Fixed code prefix from "CNS" to "CON" to match model validation pattern /^CON-[A-Z0-9-]+$/
 * - Added required field: contact.email.primary (was missing, caused validation error)
 * - Added required field: professional.startDate (was missing, caused validation error)
 * - Added required field: metadata.createdBy (was missing, caused validation error)
 * - Properly structured contact object with nested email structure
 * - Enhanced professional object with all necessary startup fields
 * - Comprehensive field mapping from user registration data to Consultant schema
 */

const UniversalRegistrationStrategy = require('../../../../../../shared/lib/database/services/universal-registration-strategy');
const logger = require('../../../../../../shared/lib/utils/logger').createLogger({
    serviceName: 'consultant-registration-strategy'
});

/**
 * @class ConsultantRegistrationStrategy
 * @extends UniversalRegistrationStrategy
 * @description Implements Consultant-specific entity document preparation and validation
 * 
 * This strategy class handles the complete lifecycle of Consultant entity creation during user
 * registration, providing Consultant-specific business logic while leveraging the universal
 * bidirectional linking pattern from the base class.
 */
class ConsultantRegistrationStrategy extends UniversalRegistrationStrategy {
    /**
     * Initialize Consultant registration strategy with configuration
     */
    constructor() {
        super({
            entityType: 'Consultant',
            userType: 'consultant',
            linkingField: 'consultantId',
            database: 'customer',
            codePrefix: 'CON' // CRITICAL FIX: Changed from 'CNS' to 'CON' to match model validation
        });
        
        logger.debug('Consultant registration strategy initialized', {
            entityType: this.entityType,
            linkingField: this.linkingField,
            linkingType: this.linkingType,
            codePrefix: this.codePrefix
        });
    }

    /**
     * Prepare Consultant document from user data
     * 
     * CRITICAL UPDATES:
     * - Added contact.email.primary (required field)
     * - Added professional.startDate (required field)
     * - Added metadata.createdBy (required field)
     * - Properly structured all nested objects according to Consultant schema
     * 
     * @param {Object} userData - User registration data
     * @param {Object} user - Created user document
     * @param {Object} options - Preparation options
     * @returns {Promise<Object>} Prepared Consultant document
     * @override
     */
    async prepareEntityData(userData, user, options = {}) {
        try {
            logger.debug('Preparing Consultant document', {
                userId: user._id,
                email: user.email
            });

            // Generate consultant code with correct prefix
            const consultantCode = this._generateEntityCode(user);

            logger.info('Generated consultant code', {
                consultantCode,
                userId: user._id,
                prefix: this.codePrefix
            });

            // Build comprehensive Consultant document
            const consultantDocument = {
                // Core Identity
                consultantCode,
                
                // Multi-tenancy & Organization
                tenantId: this._ensureObjectId(options.tenantId),
                organizationId: this._ensureObjectId(options.organizationId),
                userId: user._id,
                
                // Personal Profile Information
                profile: {
                    firstName: user.profile.firstName,
                    lastName: user.profile.lastName,
                    middleName: user.profile.middleName || undefined,
                    preferredName: user.profile.preferredName || user.profile.displayName || undefined,
                    title: userData.professionalTitle || userData.profile?.title || 'Consultant',
                    bio: user.profile.bio || userData.bio || undefined,
                    summary: userData.summary || undefined,
                    languages: userData.languages || [{
                        language: 'English',
                        proficiency: 'native'
                    }]
                },
                
                // CRITICAL FIX: Contact Information with required contact.email.primary field
                contact: {
                    email: {
                        primary: user.email, // REQUIRED FIELD - was missing before
                        work: userData.workEmail || undefined,
                        personal: userData.personalEmail || undefined
                    },
                    phone: {
                        primary: user.phoneNumber || undefined,
                        mobile: userData.mobilePhone || user.phoneNumber || undefined,
                        work: userData.workPhone || undefined
                    },
                    address: userData.address ? {
                        street: userData.address.street || userData.address.street1 || undefined,
                        street2: userData.address.street2 || undefined,
                        city: userData.address.city || undefined,
                        state: userData.address.state || undefined,
                        postalCode: userData.address.postalCode || undefined,
                        country: userData.address.country || 'United States'
                    } : undefined,
                    linkedIn: userData.linkedInUrl || userData.socialMedia?.linkedIn || undefined,
                    portfolio: userData.portfolioUrl || undefined,
                    website: userData.websiteUrl || undefined
                },
                
                // CRITICAL FIX: Professional Information with required professional.startDate field
                professional: {
                    employmentType: userData.employmentType || 'full_time',
                    level: userData.level || this._determineLevelFromExperience(userData.yearsOfExperience),
                    grade: userData.grade || undefined,
                    department: userData.department || undefined,
                    team: userData.team || undefined,
                    manager: userData.manager || undefined,
                    startDate: userData.startDate || new Date(), // REQUIRED FIELD - was missing before
                    endDate: userData.endDate || undefined,
                    yearsOfExperience: userData.yearsOfExperience || 0,
                    industryExperience: userData.industryExperience || []
                },
                
                // Skills & Expertise
                skills: this._mapSkillsFromUserData(userData),
                
                // Certifications
                certifications: this._mapCertificationsFromUserData(userData),
                
                // Education
                education: userData.education || [],
                
                // Work History
                workHistory: userData.workHistory || [],
                
                // Availability & Capacity
                availability: {
                    status: 'available',
                    capacityPercentage: 100,
                    hoursPerWeek: userData.hoursPerWeek || 40,
                    availableFrom: userData.availableFrom || new Date(),
                    availableUntil: userData.availableUntil || undefined,
                    preferredWorkHours: userData.preferredWorkHours || undefined,
                    remotePreference: userData.remotePreference || 'flexible',
                    travelWillingness: userData.travelWillingness || 'regional',
                    travelPercentage: userData.travelPercentage || 25,
                    relocationWillingness: userData.relocationWillingness || false,
                    preferredLocations: userData.preferredLocations || [],
                    excludedLocations: userData.excludedLocations || [],
                    blackoutDates: userData.blackoutDates || [],
                    lastUpdated: new Date()
                },
                
                // Rates & Billing
                billing: {
                    defaultRate: userData.hourlyRate || userData.rate ? {
                        amount: userData.hourlyRate || userData.rate,
                        currency: userData.currency || 'USD',
                        type: userData.rateType || 'hourly'
                    } : undefined,
                    rateHistory: [],
                    costRate: userData.costRate || undefined,
                    utilization: {
                        target: 80,
                        current: 0,
                        ytd: 0
                    }
                },
                
                // Performance & Reviews
                performance: {
                    rating: {},
                    reviews: [],
                    feedback: [],
                    achievements: []
                },
                
                // Documents
                documents: [],
                
                // Preferences & Settings
                preferences: {
                    projectTypes: userData.preferredEngagementTypes || userData.projectTypes || [],
                    clientTypes: userData.clientTypes || [],
                    industries: userData.industries || userData.preferredIndustries || [],
                    excludedClients: [],
                    notifications: {
                        email: {
                            assignments: true,
                            reviews: true,
                            training: true,
                            announcements: true
                        },
                        push: {
                            assignments: true,
                            reviews: false,
                            training: false,
                            announcements: false
                        }
                    },
                    privacy: {
                        showEmail: false,
                        showPhone: false,
                        showAvailability: true,
                        showRates: false
                    }
                },
                
                // Compliance & Security
                compliance: {
                    backgroundCheck: {
                        status: 'pending',
                        completedAt: undefined,
                        expiresAt: undefined
                    },
                    nda: {
                        signed: false,
                        signedAt: undefined,
                        expiresAt: undefined
                    },
                    conflictOfInterest: {
                        declared: false,
                        declarations: []
                    }
                },
                
                // Status & Lifecycle
                status: {
                    current: 'pending_activation',
                    reason: 'New consultant registration',
                    effectiveDate: new Date(),
                    isActive: true,
                    isDeleted: false
                },
                
                // Custom Fields
                customFields: userData.customFields || {},
                
                // CRITICAL FIX: Metadata with required metadata.createdBy field
                metadata: {
                    source: 'api',
                    createdBy: user._id, // REQUIRED FIELD - was missing before
                    updatedBy: user._id,
                    referredBy: userData.referredBy ? {
                        userId: userData.referredBy.userId || undefined,
                        consultantId: userData.referredBy.consultantId || undefined,
                        name: userData.referredBy.name || undefined,
                        relationship: userData.referredBy.relationship || undefined
                    } : undefined,
                    importBatch: undefined,
                    importedFrom: undefined,
                    externalIds: userData.externalIds || {}
                },
                
                // Tags
                tags: this._generateTags(userData, user)
            };

            logger.info('Consultant document prepared successfully', {
                consultantCode,
                userId: user._id,
                email: user.email,
                hasContact: !!consultantDocument.contact,
                hasPrimaryEmail: !!consultantDocument.contact?.email?.primary,
                hasStartDate: !!consultantDocument.professional?.startDate,
                hasCreatedBy: !!consultantDocument.metadata?.createdBy,
                linkingStrategy: 'bidirectional'
            });

            return consultantDocument;

        } catch (error) {
            logger.error('Failed to prepare Consultant document', {
                error: error.message,
                stack: error.stack,
                userId: user._id
            });
            throw error;
        }
    }

    /**
     * Determine consultant level from years of experience
     * @private
     */
    _determineLevelFromExperience(years) {
        if (!years || years < 0) return 'junior';
        if (years < 3) return 'junior';
        if (years < 5) return 'mid';
        if (years < 8) return 'senior';
        if (years < 12) return 'lead';
        if (years < 15) return 'principal';
        return 'director';
    }

    /**
     * Map skills from user registration data to Consultant schema format
     * @private
     */
    _mapSkillsFromUserData(userData) {
        const skills = [];

        // Handle skills array from userData
        if (Array.isArray(userData.skills)) {
            userData.skills.forEach(skill => {
                // Handle both string and object skill formats
                if (typeof skill === 'string') {
                    skills.push({
                        name: skill,
                        category: 'technical',
                        proficiencyLevel: 'intermediate',
                        yearsOfExperience: undefined,
                        verified: false,
                        endorsements: [],
                        projects: []
                    });
                } else if (typeof skill === 'object' && skill.name) {
                    skills.push({
                        skillId: skill.skillId || undefined,
                        name: skill.name,
                        category: skill.category || 'technical',
                        proficiencyLevel: skill.proficiencyLevel || skill.level || 'intermediate',
                        yearsOfExperience: skill.yearsOfExperience || skill.years || undefined,
                        lastUsed: skill.lastUsed || undefined,
                        verified: skill.verified || false,
                        verifiedBy: skill.verifiedBy || undefined,
                        verifiedAt: skill.verifiedAt || undefined,
                        endorsements: skill.endorsements || [],
                        projects: skill.projects || []
                    });
                }
            });
        }

        // Handle specialization as skills
        if (Array.isArray(userData.specialization)) {
            userData.specialization.forEach(spec => {
                if (!skills.find(s => s.name === spec)) {
                    skills.push({
                        name: spec,
                        category: 'domain',
                        proficiencyLevel: 'advanced',
                        verified: false,
                        endorsements: [],
                        projects: []
                    });
                }
            });
        }

        return skills;
    }

    /**
     * Map certifications from user registration data to Consultant schema format
     * @private
     */
    _mapCertificationsFromUserData(userData) {
        const certifications = [];

        if (Array.isArray(userData.certifications)) {
            userData.certifications.forEach(cert => {
                // Handle both string and object certification formats
                if (typeof cert === 'string') {
                    certifications.push({
                        certificationId: `CERT-${Date.now()}-${Math.random().toString(36).substring(7)}`,
                        name: cert,
                        issuingOrganization: 'Unknown',
                        issueDate: new Date(),
                        status: 'active',
                        verificationStatus: 'not_verified',
                        category: 'professional'
                    });
                } else if (typeof cert === 'object' && cert.name) {
                    certifications.push({
                        certificationId: cert.certificationId || `CERT-${Date.now()}-${Math.random().toString(36).substring(7)}`,
                        name: cert.name,
                        issuingOrganization: cert.issuingOrganization || cert.issuer || 'Unknown',
                        issueDate: cert.issueDate || cert.date || new Date(),
                        expirationDate: cert.expirationDate || cert.expiresAt || undefined,
                        credentialId: cert.credentialId || undefined,
                        credentialUrl: cert.credentialUrl || cert.url || undefined,
                        status: cert.status || 'active',
                        verificationStatus: cert.verificationStatus || 'not_verified',
                        verifiedAt: cert.verifiedAt || undefined,
                        document: cert.document || undefined,
                        category: cert.category || 'professional'
                    });
                }
            });
        }

        return certifications;
    }

    /**
     * Generate relevant tags for consultant
     * @private
     */
    _generateTags(userData, user) {
        const tags = ['user-registration', 'consultant', 'pending-activation'];

        // Add experience level tag
        const yearsOfExperience = userData.yearsOfExperience || 0;
        if (yearsOfExperience < 3) {
            tags.push('junior-consultant');
        } else if (yearsOfExperience < 8) {
            tags.push('mid-level-consultant');
        } else {
            tags.push('senior-consultant');
        }

        // Add skill-based tags
        if (Array.isArray(userData.skills) && userData.skills.length > 0) {
            tags.push('has-skills');
            if (userData.skills.length >= 5) {
                tags.push('multi-skilled');
            }
        }

        // Add certification tags
        if (Array.isArray(userData.certifications) && userData.certifications.length > 0) {
            tags.push('certified');
        }

        // Add industry tags
        if (Array.isArray(userData.industries) && userData.industries.length > 0) {
            userData.industries.forEach(industry => {
                tags.push(`industry-${industry.toLowerCase().replace(/\s+/g, '-')}`);
            });
        }

        // Add metadata tags
        if (Array.isArray(userData.metadata?.tags)) {
            tags.push(...userData.metadata.tags);
        }

        return [...new Set(tags)]; // Remove duplicates
    }

    /**
     * Validate Consultant-specific data before transaction
     * 
     * @param {Object} userData - User registration data to validate
     * @param {Object} options - Validation options
     * @returns {Promise<Object>} Validation result
     * @override
     */
    async validate(userData, options = {}) {
        const result = await super.validate(userData, options);

        // Validate years of experience
        if (userData.yearsOfExperience !== undefined) {
            if (userData.yearsOfExperience < 0 || userData.yearsOfExperience > 50) {
                result.warnings.push('Years of experience should be between 0 and 50');
            }
        }

        // Validate hourly rate
        if (userData.hourlyRate !== undefined) {
            if (userData.hourlyRate < 0) {
                result.errors.push('Hourly rate cannot be negative');
            }
            if (userData.hourlyRate > 0 && userData.hourlyRate < 10) {
                result.warnings.push('Hourly rate seems unusually low (less than $10/hour)');
            }
        }

        // Validate rate type
        if (userData.rateType) {
            const validRateTypes = ['hourly', 'daily', 'weekly', 'monthly', 'fixed', 'project'];
            if (!validRateTypes.includes(userData.rateType)) {
                result.warnings.push(`Invalid rate type: ${userData.rateType}. Valid values: ${validRateTypes.join(', ')}`);
            }
        }

        // Validate employment type
        if (userData.employmentType) {
            const validTypes = ['full_time', 'part_time', 'contract', 'freelance', 'associate', 'partner'];
            if (!validTypes.includes(userData.employmentType)) {
                result.warnings.push(`Invalid employment type: ${userData.employmentType}. Valid values: ${validTypes.join(', ')}`);
            }
        }

        // Validate level
        if (userData.level) {
            const validLevels = ['junior', 'mid', 'senior', 'lead', 'principal', 'director', 'partner'];
            if (!validLevels.includes(userData.level)) {
                result.warnings.push(`Invalid level: ${userData.level}. Valid values: ${validLevels.join(', ')}`);
            }
        }

        // Validate remote preference
        if (userData.remotePreference) {
            const validPreferences = ['remote_only', 'hybrid', 'on_site', 'flexible'];
            if (!validPreferences.includes(userData.remotePreference)) {
                result.warnings.push(`Invalid remote preference: ${userData.remotePreference}. Valid values: ${validPreferences.join(', ')}`);
            }
        }

        // Validate travel willingness
        if (userData.travelWillingness) {
            const validWillingness = ['none', 'local', 'regional', 'national', 'international'];
            if (!validWillingness.includes(userData.travelWillingness)) {
                result.warnings.push(`Invalid travel willingness: ${userData.travelWillingness}. Valid values: ${validWillingness.join(', ')}`);
            }
        }

        // Validate skills array
        if (userData.skills && !Array.isArray(userData.skills)) {
            result.errors.push('Skills must be an array');
        }

        // Validate certifications array
        if (userData.certifications && !Array.isArray(userData.certifications)) {
            result.errors.push('Certifications must be an array');
        }

        return result;
    }
}

module.exports = new ConsultantRegistrationStrategy();