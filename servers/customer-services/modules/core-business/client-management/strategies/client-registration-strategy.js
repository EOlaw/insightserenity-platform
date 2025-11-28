/**
 * @fileoverview Client Registration Strategy - Bidirectional Linking Implementation
 * @module servers/customer-services/modules/core-business/client-management/strategies/client-registration-strategy
 * @description Client-specific implementation extending universal registration strategy base class
 * 
 * @version 2.0.0
 * @updated 2025-11-28
 * 
 * IMPLEMENTATION NOTES:
 * - Extends UniversalRegistrationStrategy for bidirectional User ↔ Client linking
 * - User documents maintain clientId field referencing Client._id
 * - Client documents maintain metadata.linkedUserId referencing User._id
 * - Two-phase commit: Phase 1 creates entities, Phase 2 establishes User.clientId back-reference
 * 
 * BREAKING CHANGES FROM v1.0:
 * - Now extends UniversalRegistrationStrategy base class
 * - link() method returns 'clientId' instead of null for bidirectional linking
 * - User documents now have clientId field populated
 * - Can query either direction: Client.findOne({ 'metadata.linkedUserId': userId }) or User.findOne({ clientId: clientId })
 * 
 * MIGRATION GUIDE FROM v1.0:
 * Old code (forward-only): const client = await Client.findOne({ 'metadata.linkedUserId': user._id });
 * New code (bidirectional): const client = await Client.findById(user.clientId); // OR use forward lookup
 */

const UniversalRegistrationStrategy = require('../../../../../../shared/lib/database/services/universal-registration-strategy');
const logger = require('../../../../../../shared/lib/utils/logger').createLogger({
    serviceName: 'client-registration-strategy'
});

/**
 * @class ClientRegistrationStrategy
 * @extends UniversalRegistrationStrategy
 * @description Implements Client-specific entity document preparation and validation
 * 
 * This strategy class handles the complete lifecycle of Client entity creation during user
 * registration, providing Client-specific business logic while leveraging the universal
 * bidirectional linking pattern from the base class.
 * 
 * The strategy transforms user registration data into properly structured Client documents
 * that conform to the Client schema, handles business-specific validations such as business
 * tier and entity type, and manages the bidirectional relationship between User and Client.
 */
class ClientRegistrationStrategy extends UniversalRegistrationStrategy {
    /**
     * Initialize Client registration strategy with configuration
     */
    constructor() {
        super({
            entityType: 'Client',
            userType: 'client',
            linkingField: 'clientId',
            database: 'customer',
            codePrefix: 'CLI'
        });
        
        logger.debug('Client registration strategy initialized', {
            entityType: this.entityType,
            linkingField: this.linkingField,
            linkingType: this.linkingType
        });
    }

    /**
     * Prepare Client document from user data
     * 
     * This method transforms user registration data into a properly structured Client document
     * that conforms to the Client schema requirements. It handles default values, generates
     * unique client codes, maps registration sources to valid acquisition sources, and ensures
     * all required fields are properly populated.
     * 
     * The method is called during Phase 1 of transaction execution after the User document
     * has been created. It has access to the created User document and uses that information
     * to populate Client fields appropriately.
     * 
     * @param {Object} userData - User registration data from the registration request
     * @param {string} userData.email - User email address
     * @param {Object} userData.profile - User profile information
     * @param {string} [userData.companyName] - Company name (optional)
     * @param {string} [userData.businessTier] - Business tier level (optional)
     * @param {string} [userData.entityType] - Business entity type (optional)
     * @param {string} [userData.country] - Country location (optional)
     * @param {Object} user - Created user document for reference
     * @param {ObjectId} user._id - User document ID
     * @param {string} user.email - User email address
     * @param {Object} user.profile - User profile data
     * @param {string} [user.phoneNumber] - User phone number
     * @param {Object} options - Additional preparation options
     * @param {ObjectId} [options.tenantId] - Tenant identifier ObjectId
     * @param {ObjectId} [options.organizationId] - Organization identifier ObjectId
     * @param {ObjectId} [options.accountManager] - Account manager user ID
     * @param {Object} [options.utmParams] - UTM tracking parameters
     * @returns {Promise<Object>} Prepared Client document ready for creation
     * @throws {Error} If required data is missing or invalid
     * @override
     */
    async prepareEntityData(userData, user, options = {}) {
        try {
            logger.debug('Preparing Client document', {
                userId: user._id,
                email: user.email,
                hasCompanyName: !!userData.companyName,
                hasBusinessTier: !!userData.businessTier
            });

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

            const clientCode = this._generateEntityCode(user);

            const companyName = userData.companyName ||
                userData.customFields?.companyName ||
                `${user.profile.firstName} ${user.profile.lastName}'s Company`;

            const clientDocument = {
                clientCode,
                companyName,
                
                tenantId: this._ensureObjectId(options.tenantId),
                organizationId: this._ensureObjectId(options.organizationId),
                
                addresses: {
                    headquarters: {
                        country: userData.country || 'United States',
                        city: userData.city || undefined,
                        state: userData.state || undefined,
                        postalCode: userData.postalCode || undefined,
                        street1: userData.address || undefined,
                        timezone: userData.timezone || 'America/New_York'
                    }
                },
                
                contacts: {
                    primary: {
                        name: `${user.profile.firstName} ${user.profile.lastName}`,
                        email: user.email,
                        phone: user.phoneNumber || undefined,
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
                        campaign: options.utmParams?.campaign || undefined
                    },
                    tags: ['user-registration', registrationSource],
                    flags: {
                        isVip: false,
                        isStrategic: false,
                        requiresAttention: false
                    }
                }
            };

            logger.debug('Client document prepared successfully', {
                clientCode,
                companyName: clientDocument.companyName,
                userId: user._id,
                linkingStrategy: 'bidirectional',
                acquisitionSource
            });

            return clientDocument;

        } catch (error) {
            logger.error('Failed to prepare Client document', {
                error: error.message,
                stack: error.stack,
                userId: user._id
            });
            throw error;
        }
    }

    /**
     * Validate Client-specific data before transaction
     * 
     * This method performs comprehensive validation of Client-specific data before the
     * transaction begins. It checks business tier, entity type, country data, and other
     * Client-specific fields to ensure they conform to expected values and formats.
     * 
     * @param {Object} userData - User registration data to validate
     * @param {Object} options - Validation options
     * @returns {Promise<Object>} Validation result with errors and warnings
     * @override
     */
    async validate(userData, options = {}) {
        const result = await super.validate(userData, options);

        if (userData.businessTier) {
            const validTiers = ['strategic', 'enterprise', 'mid_market', 'small_business', 'startup'];
            if (!validTiers.includes(userData.businessTier)) {
                result.warnings.push(`Invalid business tier: ${userData.businessTier}. Valid values: ${validTiers.join(', ')}`);
            }
        }

        if (userData.entityType) {
            const validTypes = ['corporation', 'llc', 'partnership', 'sole_proprietorship', 'non_profit', 'government', 'other'];
            if (!validTypes.includes(userData.entityType)) {
                result.warnings.push(`Invalid entity type: ${userData.entityType}. Valid values: ${validTypes.join(', ')}`);
            }
        }

        if (userData.country && userData.country.trim().length === 0) {
            result.warnings.push('Country field is empty. Defaulting to United States');
        }

        if (!userData.companyName && !userData.customFields?.companyName) {
            result.warnings.push('Company name not provided - will use default based on user name');
        }

        if (result.errors.length > 0 || result.warnings.length > 0) {
            logger.debug('Client validation completed', {
                valid: result.valid,
                errorCount: result.errors.length,
                warningCount: result.warnings.length
            });
        }

        return result;
    }
}

module.exports = new ClientRegistrationStrategy();