/**
 * @fileoverview Consultant Registration Strategy - Bidirectional Linking Implementation
 * @module servers/customer-services/modules/core-business/consultant-management/strategies/consultant-registration-strategy
 * @description Consultant-specific implementation extending universal registration strategy base class
 * 
 * @version 2.0.0
 * @created 2025-11-28
 * 
 * IMPLEMENTATION NOTES:
 * - Extends UniversalRegistrationStrategy for bidirectional User ↔ Consultant linking
 * - User documents maintain consultantId field referencing Consultant._id
 * - Consultant documents maintain metadata.linkedUserId referencing User._id
 * - Two-phase commit: Phase 1 creates entities, Phase 2 establishes User.consultantId back-reference
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
            codePrefix: 'CNS'
        });
        
        logger.debug('Consultant registration strategy initialized', {
            entityType: this.entityType,
            linkingField: this.linkingField,
            linkingType: this.linkingType
        });
    }

    /**
     * Prepare Consultant document from user data
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

            const consultantCode = this._generateEntityCode(user);

            const consultantDocument = {
                consultantCode,
                
                tenantId: this._ensureObjectId(options.tenantId),
                organizationId: this._ensureObjectId(options.organizationId),
                
                profile: {
                    firstName: user.profile.firstName,
                    lastName: user.profile.lastName,
                    email: user.email,
                    phone: user.phoneNumber || undefined,
                    title: userData.professionalTitle || 'Consultant',
                    specialization: userData.specialization || [],
                    yearsOfExperience: userData.yearsOfExperience || 0
                },
                
                professional: {
                    status: 'active',
                    availabilityStatus: 'available',
                    skills: userData.skills || [],
                    certifications: userData.certifications || [],
                    industries: userData.industries || [],
                    languages: userData.languages || ['English']
                },
                
                engagement: {
                    hourlyRate: userData.hourlyRate || null,
                    rateType: userData.rateType || 'hourly',
                    preferredEngagementTypes: userData.preferredEngagementTypes || ['project', 'hourly']
                },
                
                metadata: {
                    source: 'api',
                    linkedUserId: user._id,
                    registrationData: {
                        registeredAt: new Date(),
                        registrationSource: userData.metadata?.source || 'web_consultant'
                    },
                    tags: ['user-registration', 'consultant'],
                    flags: {
                        isFeatured: false,
                        isVerified: false,
                        requiresReview: true
                    }
                }
            };

            logger.debug('Consultant document prepared successfully', {
                consultantCode,
                userId: user._id,
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
     * Validate Consultant-specific data before transaction
     * 
     * @param {Object} userData - User registration data to validate
     * @param {Object} options - Validation options
     * @returns {Promise<Object>} Validation result
     * @override
     */
    async validate(userData, options = {}) {
        const result = await super.validate(userData, options);

        if (userData.yearsOfExperience && (userData.yearsOfExperience < 0 || userData.yearsOfExperience > 50)) {
            result.warnings.push('Years of experience should be between 0 and 50');
        }

        if (userData.hourlyRate && userData.hourlyRate < 0) {
            result.errors.push('Hourly rate cannot be negative');
        }

        if (userData.rateType) {
            const validRateTypes = ['hourly', 'daily', 'project', 'retainer'];
            if (!validRateTypes.includes(userData.rateType)) {
                result.warnings.push(`Invalid rate type: ${userData.rateType}. Valid values: ${validRateTypes.join(', ')}`);
            }
        }

        return result;
    }
}

module.exports = new ConsultantRegistrationStrategy();