/**
 * @fileoverview Consultant Registration Strategy
 * @module servers/customer-services/modules/core-business/consultant-management/strategies/consultant-registration-strategy
 * @description Strategy for preparing and validating Consultant entity documents
 */

const mongoose = require('mongoose');
const { AppError } = require('../../../../../../shared/lib/utils/app-error');
const logger = require('../../../../../../shared/lib/utils/logger').createLogger({
    serviceName: 'consultant-registration-strategy'
});

/**
 * Consultant Registration Strategy
 * Implements entity-specific logic for Consultant document creation
 */
class ConsultantRegistrationStrategy {
    /**
     * Prepare Consultant document from user data
     * 
     * @param {Object} userData - User registration data
     * @param {Object} user - Created user document (for reference)
     * @param {Object} options - Additional options
     * @returns {Object} Prepared Consultant document
     */
    async prepare(userData, user, options = {}) {
        try {
            logger.debug('Preparing Consultant document', {
                userId: user._id,
                email: user.email
            });

            // Generate unique consultant code
            const consultantCode = this._generateConsultantCode(user);

            const consultantDocument = {
                consultantCode,
                
                // Personal Information
                personalInfo: {
                    firstName: user.profile.firstName,
                    lastName: user.profile.lastName,
                    email: user.email,
                    phone: user.phoneNumber,
                    dateOfBirth: userData.dateOfBirth,
                    nationality: userData.nationality
                },

                // Professional Information
                professionalInfo: {
                    title: userData.profile?.title || 'Consultant',
                    expertise: userData.expertise || [],
                    yearsOfExperience: userData.yearsOfExperience || 0,
                    certifications: userData.certifications || [],
                    education: userData.education || [],
                    languages: userData.languages || ['English']
                },

                // Employment Details
                employment: {
                    status: 'active',
                    type: userData.employmentType || 'contractor',
                    startDate: new Date(),
                    department: userData.department,
                    manager: options.manager || null,
                    workLocation: userData.workLocation || 'remote'
                },

                // Skills and Rates
                skills: {
                    technical: userData.technicalSkills || [],
                    soft: userData.softSkills || [],
                    industries: userData.industries || []
                },

                rates: {
                    hourly: userData.hourlyRate,
                    daily: userData.dailyRate,
                    currency: userData.currency || 'USD',
                    billable: userData.billable !== false
                },

                // Availability
                availability: {
                    status: 'available',
                    hoursPerWeek: userData.hoursPerWeek || 40,
                    startDate: userData.availableFrom || new Date(),
                    preferredProjects: userData.preferredProjects || []
                },

                // Multi-tenancy
                tenantId: this._ensureObjectId(options.tenantId),
                organizationId: this._ensureObjectId(options.organizationId),

                // Metadata
                metadata: {
                    source: 'user_registration',
                    linkedUserId: user._id,
                    registrationData: {
                        registeredAt: new Date(),
                        registrationSource: userData.metadata?.source || 'web_consultant',
                        campaign: options.utmParams?.campaign
                    },
                    tags: ['user-registration', 'consultant'],
                    flags: {
                        isActive: true,
                        requiresOnboarding: true
                    }
                }
            };

            logger.debug('Consultant document prepared', {
                consultantCode,
                userId: user._id
            });

            return consultantDocument;

        } catch (error) {
            logger.error('Failed to prepare Consultant document', {
                error: error.message,
                userId: user._id
            });
            throw error;
        }
    }

    /**
     * Validate Consultant-specific data before transaction
     * 
     * @param {Object} userData - User registration data
     * @param {Object} options - Validation options
     * @returns {Object} Validation result
     */
    async validate(userData, options = {}) {
        const errors = [];
        const warnings = [];

        // Validate required fields
        if (!userData.profile?.firstName) {
            errors.push('First name is required for Consultant entity');
        }

        if (!userData.profile?.lastName) {
            errors.push('Last name is required for Consultant entity');
        }

        // Validate professional information
        if (userData.yearsOfExperience !== undefined) {
            if (typeof userData.yearsOfExperience !== 'number' || userData.yearsOfExperience < 0) {
                errors.push('Years of experience must be a non-negative number');
            }
        }

        // Validate rates if provided
        if (userData.hourlyRate !== undefined) {
            if (typeof userData.hourlyRate !== 'number' || userData.hourlyRate <= 0) {
                errors.push('Hourly rate must be a positive number');
            }
        }

        // Validate employment type
        if (userData.employmentType) {
            const validTypes = ['full_time', 'part_time', 'contractor', 'freelance'];
            if (!validTypes.includes(userData.employmentType)) {
                warnings.push(`Invalid employment type: ${userData.employmentType}`);
            }
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Define linking strategy for Consultant entity
     * 
     * @param {Object} consultantData - Consultant document being created
     * @param {Object} userData - User document that was created
     */
    link(consultantData, userData) {
        consultantData.metadata = consultantData.metadata || {};
        consultantData.metadata.linkedUserId = userData._id;
        
        return 'consultantId'; // Field name on User that should reference this Consultant
    }

    /**
     * Generate unique consultant code
     * @private
     */
    _generateConsultantCode(user) {
        const prefix = 'CON';
        const initials = user.profile.firstName && user.profile.lastName
            ? `${user.profile.firstName.charAt(0)}${user.profile.lastName.charAt(0)}`.toUpperCase()
            : 'XX';
        const timestamp = Date.now().toString().slice(-6);
        const random = Math.random().toString(36).substring(2, 5).toUpperCase();
        
        return `${prefix}-${initials}${timestamp}${random}`;
    }

    /**
     * Ensure value is ObjectId
     * @private
     */
    _ensureObjectId(value) {
        if (!value) {
            return new mongoose.Types.ObjectId('000000000000000000000001');
        }
        
        if (mongoose.Types.ObjectId.isValid(value)) {
            return value instanceof mongoose.Types.ObjectId 
                ? value 
                : new mongoose.Types.ObjectId(value);
        }
        
        return new mongoose.Types.ObjectId('000000000000000000000001');
    }

    /**
     * Get strategy configuration
     * @returns {Object} Strategy configuration
     */
    getConfig() {
        return {
            entityType: 'Consultant',
            database: 'customer',
            requiresValidation: true,
            supportsLinking: true,
            linkingField: 'consultantId'
        };
    }
}

// Export singleton instance
module.exports = new ConsultantRegistrationStrategy();