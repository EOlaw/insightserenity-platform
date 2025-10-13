/**
 * @fileoverview Client Registration Strategy
 * @module servers/customer-services/modules/core-business/client-management/strategies/client-registration-strategy
 * @description Strategy for preparing and validating Client entity documents
 */

const mongoose = require('mongoose');
const { AppError } = require('../../../../../../shared/lib/utils/app-error');
const logger = require('../../../../../../shared/lib/utils/logger').createLogger({
    serviceName: 'client-registration-strategy'
});

/**
 * Client Registration Strategy
 * Implements entity-specific logic for Client document creation
 */
class ClientRegistrationStrategy {
    /**
     * Prepare Client document from user data
     * 
     * @param {Object} userData - User registration data
     * @param {Object} user - Created user document (for reference)
     * @param {Object} options - Additional options
     * @returns {Object} Prepared Client document
     */
    async prepare(userData, user, options = {}) {
        try {
            logger.debug('Preparing Client document', {
                userId: user._id,
                email: user.email
            });

            // Map registration sources to valid acquisitionSource enum values
            const sourceMapping = {
                'web_client': 'inbound',
                'web_consultant': 'inbound',
                'web_candidate': 'inbound',
                'referral': 'referral',
                'linkedin': 'inbound',
                'job_board': 'inbound',
                'direct_inquiry': 'direct_sales'
            };

            const registrationSource = userData.metadata?.source || 'web_client';
            const acquisitionSource = sourceMapping[registrationSource] || 'other';

            // Generate unique client code
            const clientCode = this._generateClientCode(user);

            const clientDocument = {
                clientCode,
                companyName: userData.companyName ||
                    userData.customFields?.companyName ||
                    `${user.profile.firstName} ${user.profile.lastName}'s Company`,
                
                tenantId: this._ensureObjectId(options.tenantId),
                organizationId: this._ensureObjectId(options.organizationId),
                
                addresses: {
                    headquarters: {
                        country: userData.country || 'United States',
                        city: userData.city,
                        state: userData.state,
                        postalCode: userData.postalCode,
                        street1: userData.address,
                        timezone: userData.timezone || 'America/New_York'
                    }
                },
                
                contacts: {
                    primary: {
                        name: `${user.profile.firstName} ${user.profile.lastName}`,
                        email: user.email,
                        phone: user.phoneNumber,
                        preferredContactMethod: 'email'
                    }
                },
                
                relationship: {
                    status: 'prospect',
                    tier: userData.businessTier || 'small_business',
                    accountManager: options.accountManager || null,
                    acquisitionDate: new Date(),
                    acquisitionSource: acquisitionSource
                },
                
                businessDetails: {
                    entityType: userData.entityType || userData.customFields?.businessType || 'other',
                    numberOfEmployees: userData.numberOfEmployees ? {
                        range: userData.numberOfEmployees
                    } : undefined
                },
                
                metadata: {
                    source: 'api',
                    linkedUserId: user._id,
                    registrationData: {
                        registeredAt: new Date(),
                        registrationSource: registrationSource,
                        campaign: options.utmParams?.campaign
                    },
                    tags: ['user-registration', registrationSource],
                    flags: {
                        isVip: false,
                        isStrategic: false,
                        requiresAttention: false
                    }
                }
            };

            logger.debug('Client document prepared', {
                clientCode,
                companyName: clientDocument.companyName,
                userId: user._id
            });

            return clientDocument;

        } catch (error) {
            logger.error('Failed to prepare Client document', {
                error: error.message,
                userId: user._id
            });
            throw error;
        }
    }

    /**
     * Validate Client-specific data before transaction
     * 
     * @param {Object} userData - User registration data
     * @param {Object} options - Validation options
     * @returns {Object} Validation result
     */
    async validate(userData, options = {}) {
        const errors = [];
        const warnings = [];

        // Validate required fields for Client entity
        if (!userData.profile?.firstName) {
            errors.push('First name is required for Client entity');
        }

        if (!userData.profile?.lastName) {
            errors.push('Last name is required for Client entity');
        }

        // Validate business-specific fields
        if (userData.businessTier) {
            const validTiers = ['strategic', 'enterprise', 'mid_market', 'small_business', 'startup'];
            if (!validTiers.includes(userData.businessTier)) {
                warnings.push(`Invalid business tier: ${userData.businessTier}`);
            }
        }

        // Validate entity type
        if (userData.entityType) {
            const validTypes = ['corporation', 'llc', 'partnership', 'sole_proprietorship', 'non_profit', 'government', 'other'];
            if (!validTypes.includes(userData.entityType)) {
                warnings.push(`Invalid entity type: ${userData.entityType}`);
            }
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Define linking strategy for Client entity
     * This function is called to establish the relationship with the User entity
     * 
     * @param {Object} clientData - Client document being created
     * @param {Object} userData - User document that was created
     */
    link(clientData, userData) {
        // The linking is handled by the universal transaction service
        // This method can be used for custom linking logic if needed
        clientData.metadata = clientData.metadata || {};
        clientData.metadata.linkedUserId = userData._id;
        
        return 'clientId'; // Return the field name on User that should reference this Client
    }

    /**
     * Generate unique client code
     * @private
     */
    _generateClientCode(user) {
        const prefix = 'CLI';
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
            entityType: 'Client',
            database: 'customer',
            requiresValidation: true,
            supportsLinking: true,
            linkingField: 'clientId'
        };
    }
}

// Export singleton instance
module.exports = new ClientRegistrationStrategy();