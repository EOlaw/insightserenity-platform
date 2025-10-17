/**
 * @fileoverview Client Registration Strategy - Complete Updated Version
 * @module servers/customer-services/modules/core-business/client-management/strategies/client-registration-strategy
 * @description Strategy for preparing and validating Client entity documents with optimized single-direction linking
 * 
 * @version 2.0.0
 * @updated 2025-10-14
 * 
 * IMPLEMENTATION NOTES:
 * - Implements single-direction linking (Client -> User) to prevent MongoDB lock conflicts
 * - No back-reference field is created on User documents
 * - Use findByLinkedUserId() helper method to query Client by User ID
 * - Forward-only linking eliminates lock conflicts during transaction execution
 * 
 * BREAKING CHANGES FROM v1.0:
 * - link() method now returns null instead of 'clientId'
 * - User documents no longer have clientId field
 * - Must query Client.findOne({ 'metadata.linkedUserId': userId }) to find Client
 * - Added helper method findByLinkedUserId() for convenient queries
 * 
 * MIGRATION GUIDE:
 * Old code: const client = await Client.findById(user.clientId);
 * New code: const client = await ClientRegistrationStrategy.findByLinkedUserId(user._id, Client);
 * Or direct: const client = await Client.findOne({ 'metadata.linkedUserId': user._id });
 */

const mongoose = require('mongoose');
const { AppError } = require('../../../../../../shared/lib/utils/app-error');
const logger = require('../../../../../../shared/lib/utils/logger').createLogger({
    serviceName: 'client-registration-strategy'
});

/**
 * @class ClientRegistrationStrategy
 * @description Implements entity-specific logic for Client document creation with optimized linking strategy
 * 
 * This strategy class is responsible for preparing Client entity documents during user registration
 * and validating Client-specific data before transaction execution. It implements a single-direction
 * linking pattern where the Client document maintains a reference to the User document, but the User
 * document does not maintain a back-reference to the Client. This approach prevents MongoDB lock
 * conflicts that occur when trying to update the same document multiple times within a transaction.
 * 
 * The strategy provides comprehensive validation for business-specific fields such as business tier,
 * entity type, and contact information, ensuring data integrity before entities are created in the
 * database.
 */
class ClientRegistrationStrategy {
    /**
     * Prepare Client document from user data
     * 
     * This method transforms user registration data into a properly structured Client document
     * that conforms to the Client schema requirements. It handles default values, generates
     * unique identifiers, maps registration sources to valid enum values, and ensures all
     * ObjectId fields are properly typed.
     * 
     * The method is called during Phase 1 of transaction execution, after the User document
     * has been created but before the transaction commits. It has access to the created User
     * document and can use that information to populate Client fields appropriately.
     * 
     * @param {Object} userData - User registration data from the registration request
     * @param {string} userData.email - User email address
     * @param {Object} userData.profile - User profile information
     * @param {string} userData.profile.firstName - User first name
     * @param {string} userData.profile.lastName - User last name
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
     */
    async prepare(userData, user, options = {}) {
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

            const clientCode = this._generateClientCode(user);

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
                linkingStrategy: 'forward-only',
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
     * transaction begins. It checks required fields, validates enum values, and ensures
     * data conforms to expected formats. The validation process distinguishes between
     * critical errors that should prevent transaction execution and warnings that indicate
     * potentially problematic but non-blocking conditions.
     * 
     * @param {Object} userData - User registration data to validate
     * @param {Object} userData.profile - User profile data
     * @param {string} userData.profile.firstName - User first name
     * @param {string} userData.profile.lastName - User last name
     * @param {string} [userData.businessTier] - Business tier to validate
     * @param {string} [userData.entityType] - Entity type to validate
     * @param {string} [userData.country] - Country to validate
     * @param {Object} options - Validation options
     * @returns {Promise<Object>} Validation result with errors and warnings
     * @property {boolean} valid - Whether validation passed (no errors)
     * @property {Array<string>} errors - Critical validation errors
     * @property {Array<string>} warnings - Non-critical validation warnings
     */
    async validate(userData, options = {}) {
        const errors = [];
        const warnings = [];

        if (!userData.profile?.firstName) {
            errors.push('First name is required for Client entity');
        }

        if (!userData.profile?.lastName) {
            errors.push('Last name is required for Client entity');
        }

        if (userData.businessTier) {
            const validTiers = ['strategic', 'enterprise', 'mid_market', 'small_business', 'startup'];
            if (!validTiers.includes(userData.businessTier)) {
                warnings.push(`Invalid business tier: ${userData.businessTier}. Valid values: ${validTiers.join(', ')}`);
            }
        }

        if (userData.entityType) {
            const validTypes = ['corporation', 'llc', 'partnership', 'sole_proprietorship', 'non_profit', 'government', 'other'];
            if (!validTypes.includes(userData.entityType)) {
                warnings.push(`Invalid entity type: ${userData.entityType}. Valid values: ${validTypes.join(', ')}`);
            }
        }

        if (userData.country && userData.country.trim().length === 0) {
            warnings.push('Country field is empty. Defaulting to United States');
        }

        if (userData.phoneNumber && !this._isValidPhoneFormat(userData.phoneNumber)) {
            warnings.push('Phone number format may be invalid');
        }

        if (userData.email && !this._isValidEmailFormat(userData.email)) {
            errors.push('Invalid email format');
        }

        if (errors.length > 0) {
            logger.warn('Client validation found errors', {
                errors,
                warnings
            });
        } else if (warnings.length > 0) {
            logger.debug('Client validation found warnings', {
                warnings
            });
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Define linking strategy for Client entity
     * 
     * This method establishes the relationship pattern between Client and User entities.
     * It implements a single-direction linking strategy where the Client document maintains
     * a reference to the User (forward reference) but the User document does not maintain
     * a reference back to the Client (no back-reference).
     * 
     * This approach prevents MongoDB lock conflicts that occur when trying to create an entity
     * and then immediately update it within the same transaction. By returning null for the
     * linking field, we signal to the Universal Transaction Service that no back-reference
     * update should be attempted on the User document.
     * 
     * To find a Client for a given User, use the findByLinkedUserId() helper method or query
     * directly: Client.findOne({ 'metadata.linkedUserId': userId })
     * 
     * @param {Object} clientData - Client document being created
     * @param {Object} userData - User document that was created
     * @param {ObjectId} userData._id - User document ID
     * @returns {string|null} Field name on User to link, or null for forward-only linking
     */
    link(clientData, userData) {
        clientData.metadata = clientData.metadata || {};
        clientData.metadata.linkedUserId = userData._id;
        
        logger.debug('Applied forward-only linking strategy', {
            clientId: clientData._id || 'pending',
            userId: userData._id,
            strategy: 'forward-only',
            backReferenceField: null
        });
        
        return null;
    }

    /**
     * Generate unique client code
     * 
     * Generates a unique identifier for the Client using a combination of prefix,
     * user initials, timestamp, and random characters. The format is:
     * CLI-{INITIALS}{TIMESTAMP}{RANDOM}
     * 
     * Example: CLI-JD847392XYZ
     * 
     * @private
     * @param {Object} user - User document
     * @param {Object} user.profile - User profile data
     * @param {string} user.profile.firstName - User first name
     * @param {string} user.profile.lastName - User last name
     * @returns {string} Unique client code
     */
    _generateClientCode(user) {
        const prefix = 'CLI';
        const initials = user.profile.firstName && user.profile.lastName
            ? `${user.profile.firstName.charAt(0)}${user.profile.lastName.charAt(0)}`.toUpperCase()
            : 'XX';
        const timestamp = Date.now().toString().slice(-6);
        const random = Math.random().toString(36).substring(2, 5).toUpperCase();
        
        const clientCode = `${prefix}-${initials}${timestamp}${random}`;
        
        logger.debug('Generated client code', {
            clientCode,
            userId: user._id
        });
        
        return clientCode;
    }

    /**
     * Ensure value is a valid MongoDB ObjectId
     * 
     * Converts various input types to proper MongoDB ObjectId instances with
     * fallback to default values if conversion fails. This ensures that all
     * ObjectId fields in the Client document are properly typed.
     * 
     * @private
     * @param {string|ObjectId|null|undefined} value - Value to convert
     * @returns {ObjectId} Valid MongoDB ObjectId
     */
    _ensureObjectId(value) {
        if (!value) {
            const defaultId = new mongoose.Types.ObjectId('000000000000000000000001');
            logger.debug('No ObjectId provided, using default', {
                defaultId: defaultId.toString()
            });
            return defaultId;
        }
        
        if (mongoose.Types.ObjectId.isValid(value)) {
            return value instanceof mongoose.Types.ObjectId 
                ? value 
                : new mongoose.Types.ObjectId(value);
        }
        
        logger.warn('Invalid ObjectId provided, using default', {
            providedValue: value,
            providedType: typeof value
        });
        return new mongoose.Types.ObjectId('000000000000000000000001');
    }

    /**
     * Validate phone number format
     * @private
     */
    _isValidPhoneFormat(phoneNumber) {
        const phoneRegex = /^[\+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,9}$/;
        return phoneRegex.test(phoneNumber);
    }

    /**
     * Validate email format
     * @private
     */
    _isValidEmailFormat(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    /**
     * Get strategy configuration
     * 
     * Returns metadata about this strategy's configuration and capabilities.
     * This information is used by the Universal Transaction Service to properly
     * handle entity creation and linking.
     * 
     * @returns {Object} Strategy configuration
     * @property {string} entityType - Type of entity this strategy handles
     * @property {string} database - Database where entities are stored
     * @property {boolean} requiresValidation - Whether validation is required
     * @property {boolean} supportsLinking - Whether linking is supported
     * @property {string} linkingType - Type of linking strategy used
     * @property {string|null} linkingField - Field name for back-reference (null for forward-only)
     * @property {string} queryMethod - Name of helper method for queries
     */
    getConfig() {
        return {
            entityType: 'Client',
            database: 'customer',
            requiresValidation: true,
            supportsLinking: true,
            linkingType: 'forward-only',
            linkingField: null,
            queryMethod: 'findByLinkedUserId'
        };
    }

    /**
     * Helper method to find Client by User ID
     * 
     * This method provides a convenient way to query for a Client document using the
     * User ID. Since we use single-direction linking, the User document does not have
     * a clientId field. Instead, we query the Client collection for a document where
     * metadata.linkedUserId matches the provided User ID.
     * 
     * This method should be used throughout your application whenever you need to
     * retrieve a Client document for a given User. It abstracts the query details
     * and provides consistent error handling and logging.
     * 
     * Usage example:
     * ```javascript
     * const ClientRegistrationStrategy = require('./path/to/strategy');
     * const Client = require('./path/to/client-model');
     * const client = await ClientRegistrationStrategy.findByLinkedUserId(user._id, Client);
     * ```
     * 
     * @param {string|ObjectId} userId - User ID to find Client for
     * @param {Model} ClientModel - Client Mongoose model
     * @returns {Promise<Object|null>} Client document or null if not found
     * @throws {Error} If query fails
     */
    async findByLinkedUserId(userId, ClientModel) {
        try {
            logger.debug('Finding Client by linked User ID', {
                userId: userId.toString()
            });

            const client = await ClientModel.findOne({
                'metadata.linkedUserId': userId
            });

            if (!client) {
                logger.debug('No Client found for User', { 
                    userId: userId.toString() 
                });
                return null;
            }

            logger.debug('Client found for User', {
                userId: userId.toString(),
                clientId: client._id.toString(),
                clientCode: client.clientCode
            });

            return client;

        } catch (error) {
            logger.error('Error finding Client by User ID', {
                userId: userId.toString(),
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Bulk find Clients by multiple User IDs
     * 
     * Efficiently retrieves multiple Client documents for an array of User IDs.
     * This method is useful for bulk operations or when displaying lists of users
     * with their associated client information.
     * 
     * @param {Array<string|ObjectId>} userIds - Array of User IDs
     * @param {Model} ClientModel - Client Mongoose model
     * @returns {Promise<Map<string, Object>>} Map of userId to Client document
     */
    async findManyByLinkedUserIds(userIds, ClientModel) {
        try {
            logger.debug('Finding Clients by multiple User IDs', {
                userCount: userIds.length
            });

            const clients = await ClientModel.find({
                'metadata.linkedUserId': { $in: userIds }
            });

            const clientMap = new Map();
            clients.forEach(client => {
                const userId = client.metadata.linkedUserId.toString();
                clientMap.set(userId, client);
            });

            logger.debug('Clients found for Users', {
                requestedCount: userIds.length,
                foundCount: clientMap.size
            });

            return clientMap;

        } catch (error) {
            logger.error('Error finding Clients by User IDs', {
                userCount: userIds.length,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Check if Client exists for User
     * 
     * Efficiently checks whether a Client document exists for a given User ID
     * without retrieving the full document.
     * 
     * @param {string|ObjectId} userId - User ID to check
     * @param {Model} ClientModel - Client Mongoose model
     * @returns {Promise<boolean>} True if Client exists, false otherwise
     */
    async existsForUser(userId, ClientModel) {
        try {
            const count = await ClientModel.countDocuments({
                'metadata.linkedUserId': userId
            });

            return count > 0;

        } catch (error) {
            logger.error('Error checking Client existence for User', {
                userId: userId.toString(),
                error: error.message
            });
            throw error;
        }
    }
}

module.exports = new ClientRegistrationStrategy();