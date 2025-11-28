/**
 * @fileoverview Universal Registration Strategy Base Class - Bidirectional Entity Linking
 * @module shared/lib/database/services/universal-registration-strategy
 * @description Base strategy class for preparing and validating entity documents with bidirectional linking
 * 
 * @version 2.0.0
 * @created 2025-11-28
 * 
 * ARCHITECTURE NOTES:
 * - Implements bidirectional linking (Entity ↔ User) for all entity types
 * - User documents maintain entity reference fields (clientId, consultantId, candidateId, partnerId)
 * - Entity documents maintain linkedUserId in metadata for reverse lookup
 * - Two-phase commit pattern: Phase 1 creates entities, Phase 2 establishes back-references
 * 
 * ENTITY TYPE MAPPING:
 * - client → clientId field on User, Client entity in database
 * - consultant → consultantId field on User, Consultant entity in database
 * - candidate → candidateId field on User, Candidate entity in database
 * - partner → partnerId field on User, Partner entity in database
 * 
 * USAGE PATTERN:
 * Extend this base class for each entity type:
 * ```javascript
 * const UniversalRegistrationStrategy = require('./universal-registration-strategy');
 * 
 * class ClientRegistrationStrategy extends UniversalRegistrationStrategy {
 *   constructor() {
 *     super({
 *       entityType: 'Client',
 *       userType: 'client',
 *       linkingField: 'clientId',
 *       database: 'customer'
 *     });
 *   }
 *   
 *   async prepareEntityData(userData, user, options) {
 *     // Client-specific document preparation
 *   }
 * }
 * ```
 */

const mongoose = require('mongoose');
const { AppError } = require('../../utils/app-error');
const logger = require('../../utils/logger').createLogger({
    serviceName: 'universal-registration-strategy'
});

/**
 * @class UniversalRegistrationStrategy
 * @description Base class for entity registration strategies with universal bidirectional linking
 * 
 * This abstract base class provides a consistent interface for all entity types in the platform,
 * implementing the bidirectional linking pattern where both User and Entity documents maintain
 * references to each other. The User document contains an entity-specific field (clientId,
 * consultantId, etc.) while the Entity document contains linkedUserId in its metadata.
 * 
 * The class handles the complete lifecycle of entity creation including validation, document
 * preparation, linking strategy configuration, and helper methods for querying entities by user.
 * It provides default implementations that can be overridden by subclasses for entity-specific
 * behavior while maintaining architectural consistency across all entity types.
 * 
 * KEY ARCHITECTURAL DECISIONS:
 * - Bidirectional linking enables efficient queries from either direction
 * - Phase 2 back-reference updates occur outside transaction to prevent lock conflicts
 * - Entity-specific fields on User model (clientId, consultantId) provide explicit schema
 * - Metadata.linkedUserId provides consistent reverse lookup across all entity types
 */
class UniversalRegistrationStrategy {
    /**
     * Initialize universal registration strategy
     * 
     * @param {Object} config - Strategy configuration
     * @param {string} config.entityType - Entity model name (e.g., 'Client', 'Consultant')
     * @param {string} config.userType - User type identifier (e.g., 'client', 'consultant')
     * @param {string} config.linkingField - Field name on User model (e.g., 'clientId', 'consultantId')
     * @param {string} config.database - Database name where entity is stored (e.g., 'customer')
     * @param {string} [config.codePrefix] - Prefix for generated entity codes (e.g., 'CLI', 'CNS')
     */
    constructor(config) {
        this.validateConfig(config);
        
        this.entityType = config.entityType;
        this.userType = config.userType;
        this.linkingField = config.linkingField;
        this.database = config.database;
        this.codePrefix = config.codePrefix || this.entityType.substring(0, 3).toUpperCase();
        this.linkingType = 'bidirectional';
        this.supportsLinking = true;
        
        logger.debug('Universal registration strategy initialized', {
            entityType: this.entityType,
            userType: this.userType,
            linkingField: this.linkingField,
            database: this.database,
            codePrefix: this.codePrefix
        });
    }

    /**
     * Validate strategy configuration
     * @private
     */
    validateConfig(config) {
        const requiredFields = ['entityType', 'userType', 'linkingField', 'database'];
        const missing = requiredFields.filter(field => !config[field]);
        
        if (missing.length > 0) {
            throw new Error(`Universal registration strategy missing required config: ${missing.join(', ')}`);
        }

        const validLinkingFields = ['clientId', 'consultantId', 'candidateId', 'partnerId'];
        if (!validLinkingFields.includes(config.linkingField)) {
            throw new Error(`Invalid linking field: ${config.linkingField}. Must be one of: ${validLinkingFields.join(', ')}`);
        }
    }

    /**
     * Prepare entity document from user data
     * 
     * This method is called during Phase 1 of transaction execution after the User document
     * has been created. It transforms user registration data into a properly structured entity
     * document that conforms to the entity schema requirements.
     * 
     * Subclasses MUST override this method to provide entity-specific document preparation.
     * The base implementation throws an error to enforce this requirement.
     * 
     * @param {Object} userData - User registration data from the registration request
     * @param {Object} user - Created user document for reference
     * @param {ObjectId} user._id - User document ID
     * @param {Object} options - Additional preparation options
     * @param {ObjectId} options.tenantId - Tenant identifier ObjectId
     * @param {ObjectId} options.organizationId - Organization identifier ObjectId
     * @returns {Promise<Object>} Prepared entity document ready for creation
     * @throws {Error} Must be implemented by subclass
     * @abstract
     */
    async prepareEntityData(userData, user, options = {}) {
        throw new Error(`prepareEntityData() must be implemented by ${this.entityType} strategy subclass`);
    }

    /**
     * Main prepare method - orchestrates entity document preparation
     * 
     * This method serves as the entry point for entity document preparation, called by the
     * Universal Transaction Service. It delegates to prepareEntityData() for entity-specific
     * logic and then applies universal metadata and linking configuration.
     * 
     * @param {Object} userData - User registration data
     * @param {Object} user - Created user document
     * @param {Object} options - Preparation options
     * @returns {Promise<Object>} Complete prepared entity document
     */
    async prepare(userData, user, options = {}) {
        try {
            logger.debug('Preparing entity document', {
                entityType: this.entityType,
                userType: this.userType,
                userId: user._id,
                email: user.email
            });

            const entityDocument = await this.prepareEntityData(userData, user, options);

            entityDocument.metadata = entityDocument.metadata || {};
            entityDocument.metadata.linkedUserId = user._id;
            entityDocument.metadata.source = entityDocument.metadata.source || 'api';
            entityDocument.metadata.registrationData = entityDocument.metadata.registrationData || {
                registeredAt: new Date(),
                registrationSource: userData.metadata?.source || 'web_client'
            };

            logger.debug('Entity document prepared successfully', {
                entityType: this.entityType,
                userId: user._id,
                hasLinkedUserId: !!entityDocument.metadata.linkedUserId,
                linkingField: this.linkingField
            });

            return entityDocument;

        } catch (error) {
            logger.error('Failed to prepare entity document', {
                entityType: this.entityType,
                error: error.message,
                stack: error.stack,
                userId: user._id
            });
            throw error;
        }
    }

    /**
     * Validate entity-specific data before transaction
     * 
     * This method performs validation of entity-specific data before transaction execution begins.
     * It should check required fields, validate enum values, and ensure data conforms to expected
     * formats specific to the entity type.
     * 
     * Subclasses MAY override this method to provide entity-specific validation. The base
     * implementation provides minimal validation suitable for most entity types.
     * 
     * @param {Object} userData - User registration data to validate
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
            errors.push(`First name is required for ${this.entityType} entity`);
        }

        if (!userData.profile?.lastName) {
            errors.push(`Last name is required for ${this.entityType} entity`);
        }

        if (!userData.email || !this._isValidEmailFormat(userData.email)) {
            errors.push('Valid email is required');
        }

        if (userData.phoneNumber && !this._isValidPhoneFormat(userData.phoneNumber)) {
            warnings.push('Phone number format may be invalid');
        }

        if (errors.length > 0) {
            logger.warn('Entity validation found errors', {
                entityType: this.entityType,
                errors,
                warnings
            });
        } else if (warnings.length > 0) {
            logger.debug('Entity validation found warnings', {
                entityType: this.entityType,
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
     * Define bidirectional linking strategy
     * 
     * This method establishes the relationship pattern between Entity and User documents.
     * It sets the forward reference (Entity → User) in the entity metadata and returns
     * the linking field name to instruct the Universal Transaction Service to create the
     * back-reference (User → Entity) during Phase 2.
     * 
     * The bidirectional linking pattern enables efficient queries from either direction:
     * - Find entity by user: Entity.findOne({ 'metadata.linkedUserId': userId })
     * - Find user by entity: User.findOne({ clientId: entityId })
     * 
     * @param {Object} entityData - Entity document being created
     * @param {Object} userData - User document that was created
     * @param {ObjectId} userData._id - User document ID
     * @returns {string} Field name on User document for back-reference
     */
    link(entityData, userData) {
        entityData.metadata = entityData.metadata || {};
        entityData.metadata.linkedUserId = userData._id;
        
        logger.debug('Applied bidirectional linking strategy', {
            entityType: this.entityType,
            entityId: entityData._id || 'pending',
            userId: userData._id,
            linkingField: this.linkingField,
            linkingType: 'bidirectional'
        });
        
        return this.linkingField;
    }

    /**
     * Get strategy configuration metadata
     * 
     * Returns metadata about this strategy's configuration and capabilities for use by
     * the Entity Strategy Registry and Universal Transaction Service.
     * 
     * @returns {Object} Strategy configuration
     */
    getConfig() {
        return {
            entityType: this.entityType,
            userType: this.userType,
            database: this.database,
            linkingField: this.linkingField,
            linkingType: this.linkingType,
            supportsLinking: this.supportsLinking,
            codePrefix: this.codePrefix,
            requiresValidation: true,
            queryMethod: 'findByLinkedUserId'
        };
    }

    /**
     * Generate unique entity code
     * 
     * Generates a unique identifier using prefix, user initials, timestamp, and random characters.
     * Format: {PREFIX}-{INITIALS}{TIMESTAMP}{RANDOM}
     * Example: CLI-JD847392XYZ
     * 
     * @param {Object} user - User document
     * @returns {string} Unique entity code
     * @protected
     */
    _generateEntityCode(user) {
        const initials = user.profile.firstName && user.profile.lastName
            ? `${user.profile.firstName.charAt(0)}${user.profile.lastName.charAt(0)}`.toUpperCase()
            : 'XX';
        const timestamp = Date.now().toString().slice(-6);
        const random = Math.random().toString(36).substring(2, 5).toUpperCase();
        
        const entityCode = `${this.codePrefix}-${initials}${timestamp}${random}`;
        
        logger.debug('Generated entity code', {
            entityType: this.entityType,
            entityCode,
            userId: user._id
        });
        
        return entityCode;
    }

    /**
     * Ensure value is a valid MongoDB ObjectId
     * @param {*} value - Value to convert
     * @returns {ObjectId} Valid MongoDB ObjectId
     * @protected
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
     * Helper method to find entity by User ID
     * 
     * Provides a convenient way to query for an entity document using the User ID.
     * Queries the entity collection for a document where metadata.linkedUserId matches
     * the provided User ID.
     * 
     * @param {string|ObjectId} userId - User ID to find entity for
     * @param {Model} EntityModel - Entity Mongoose model
     * @returns {Promise<Object|null>} Entity document or null if not found
     */
    async findByLinkedUserId(userId, EntityModel) {
        try {
            logger.debug('Finding entity by linked User ID', {
                entityType: this.entityType,
                userId: userId.toString()
            });

            const entity = await EntityModel.findOne({
                'metadata.linkedUserId': userId
            });

            if (!entity) {
                logger.debug('No entity found for User', { 
                    entityType: this.entityType,
                    userId: userId.toString() 
                });
                return null;
            }

            logger.debug('Entity found for User', {
                entityType: this.entityType,
                userId: userId.toString(),
                entityId: entity._id.toString()
            });

            return entity;

        } catch (error) {
            logger.error('Error finding entity by User ID', {
                entityType: this.entityType,
                userId: userId.toString(),
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Find entity by User ID from User document
     * 
     * Alternative query method that uses the linkingField on the User document
     * to find the entity. This is more efficient than querying by metadata.linkedUserId
     * when you already have the User document with populated entity reference.
     * 
     * @param {Object} user - User document
     * @param {Model} EntityModel - Entity Mongoose model
     * @returns {Promise<Object|null>} Entity document or null if not found
     */
    async findByUser(user, EntityModel) {
        try {
            const entityId = user[this.linkingField];
            
            if (!entityId) {
                logger.debug('No entity ID found on User document', {
                    entityType: this.entityType,
                    userId: user._id.toString(),
                    linkingField: this.linkingField
                });
                return null;
            }

            const entity = await EntityModel.findById(entityId);

            if (!entity) {
                logger.warn('Entity ID present but entity not found', {
                    entityType: this.entityType,
                    userId: user._id.toString(),
                    entityId: entityId.toString()
                });
                return null;
            }

            return entity;

        } catch (error) {
            logger.error('Error finding entity by User document', {
                entityType: this.entityType,
                userId: user._id.toString(),
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Bulk find entities by multiple User IDs
     * 
     * @param {Array<string|ObjectId>} userIds - Array of User IDs
     * @param {Model} EntityModel - Entity Mongoose model
     * @returns {Promise<Map<string, Object>>} Map of userId to entity document
     */
    async findManyByLinkedUserIds(userIds, EntityModel) {
        try {
            logger.debug('Finding entities by multiple User IDs', {
                entityType: this.entityType,
                userCount: userIds.length
            });

            const entities = await EntityModel.find({
                'metadata.linkedUserId': { $in: userIds }
            });

            const entityMap = new Map();
            entities.forEach(entity => {
                const userId = entity.metadata.linkedUserId.toString();
                entityMap.set(userId, entity);
            });

            logger.debug('Entities found for Users', {
                entityType: this.entityType,
                requestedCount: userIds.length,
                foundCount: entityMap.size
            });

            return entityMap;

        } catch (error) {
            logger.error('Error finding entities by User IDs', {
                entityType: this.entityType,
                userCount: userIds.length,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Check if entity exists for User
     * 
     * @param {string|ObjectId} userId - User ID to check
     * @param {Model} EntityModel - Entity Mongoose model
     * @returns {Promise<boolean>} True if entity exists, false otherwise
     */
    async existsForUser(userId, EntityModel) {
        try {
            const count = await EntityModel.countDocuments({
                'metadata.linkedUserId': userId
            });

            return count > 0;

        } catch (error) {
            logger.error('Error checking entity existence for User', {
                entityType: this.entityType,
                userId: userId.toString(),
                error: error.message
            });
            throw error;
        }
    }
}

module.exports = UniversalRegistrationStrategy;