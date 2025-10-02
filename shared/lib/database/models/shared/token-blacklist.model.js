/**
 * @fileoverview Token Blacklist Model - For invalidated JWT tokens
 * @module shared/lib/database/models/shared/token-blacklist.model
 * @description Stores invalidated tokens with automatic expiration cleanup
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * Token Blacklist Schema
 * Stores tokens that have been invalidated through logout
 */
const tokenBlacklistSchemaDefinition = {
    // The actual JWT token (hashed for security)
    tokenHash: {
        type: String,
        required: true,
        unique: true,
        index: true
    },

    // User who owned this token
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        index: true
    },

    // Tenant for multi-tenancy support
    tenantId: {
        type: String,
        required: true,
        index: true
    },

    // Reason for blacklisting
    reason: {
        type: String,
        enum: ['logout', 'password_change', 'forced_logout', 'security_revocation', 'account_deletion'],
        default: 'logout'
    },

    // When token was blacklisted
    blacklistedAt: {
        type: Date,
        default: Date.now,
        index: true
    },

    // When token would naturally expire (for TTL index)
    expiresAt: {
        type: Date,
        required: true,
        index: true
    },

    // IP address where logout occurred
    ipAddress: String,

    // User agent
    userAgent: String,

    // Additional metadata
    metadata: {
        sessionId: String,
        deviceId: String,
        location: String
    }
};

const tokenBlacklistSchema = new Schema(tokenBlacklistSchemaDefinition, {
    timestamps: true,
    collection: 'token_blacklist'
});

// TTL Index - MongoDB will automatically delete documents after expiresAt
tokenBlacklistSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Compound indexes for efficient queries
tokenBlacklistSchema.index({ userId: 1, blacklistedAt: -1 });
tokenBlacklistSchema.index({ tenantId: 1, blacklistedAt: -1 });

/**
 * Static Methods
 */

/**
 * Add token to blacklist
 * @param {Object} tokenData - Token data
 * @returns {Promise<Object>} Blacklist entry
 */
tokenBlacklistSchema.statics.blacklistToken = async function(tokenData) {
    const {
        tokenHash,
        userId,
        tenantId,
        expiresAt,
        reason = 'logout',
        ipAddress,
        userAgent,
        metadata
    } = tokenData;

    // Check if already blacklisted
    const existing = await this.findOne({ tokenHash });
    if (existing) {
        return existing;
    }

    // Create blacklist entry
    return await this.create({
        tokenHash,
        userId,
        tenantId,
        reason,
        expiresAt,
        ipAddress,
        userAgent,
        metadata
    });
};

/**
 * Check if token is blacklisted
 * @param {string} tokenHash - Hashed token
 * @returns {Promise<boolean>} True if blacklisted
 */
tokenBlacklistSchema.statics.isBlacklisted = async function(tokenHash) {
    const entry = await this.findOne({ 
        tokenHash,
        expiresAt: { $gt: new Date() } // Only check non-expired entries
    });
    return !!entry;
};

/**
 * Remove token from blacklist (for testing or administrative purposes)
 * @param {string} tokenHash - Hashed token
 * @returns {Promise<Object>} Deletion result
 */
tokenBlacklistSchema.statics.removeToken = async function(tokenHash) {
    return await this.deleteOne({ tokenHash });
};

/**
 * Blacklist all tokens for a user
 * @param {string} userId - User ID
 * @param {string} tenantId - Tenant ID
 * @param {string} reason - Reason for blacklisting
 * @returns {Promise<number>} Number of tokens blacklisted
 */
tokenBlacklistSchema.statics.blacklistUserTokens = async function(userId, tenantId, reason = 'forced_logout') {
    // This is a placeholder - in production you would need to track active sessions
    // For now, we just record the action
    return 0;
};

/**
 * Get blacklist statistics
 * @param {string} tenantId - Tenant ID (optional)
 * @returns {Promise<Object>} Statistics
 */
tokenBlacklistSchema.statics.getStats = async function(tenantId) {
    const match = tenantId ? { tenantId } : {};
    
    const stats = await this.aggregate([
        { $match: match },
        {
            $group: {
                _id: '$reason',
                count: { $sum: 1 }
            }
        }
    ]);

    const total = await this.countDocuments(match);
    
    return {
        total,
        byReason: stats.reduce((acc, item) => {
            acc[item._id] = item.count;
            return acc;
        }, {})
    };
};

/**
 * Instance Methods
 */

/**
 * Convert to safe JSON (exclude sensitive data)
 * @returns {Object} Safe JSON representation
 */
tokenBlacklistSchema.methods.toSafeJSON = function() {
    const obj = this.toObject();
    delete obj.tokenHash; // Never expose token hashes
    return obj;
};

/**
 * Indexes for performance
 */
tokenBlacklistSchema.index({ tokenHash: 1 }, { unique: true });
tokenBlacklistSchema.index({ userId: 1, blacklistedAt: -1 });
tokenBlacklistSchema.index({ tenantId: 1, reason: 1 });

// Export model factory function for use with different connections
module.exports = {
    schema: tokenBlacklistSchema,
    modelName: 'TokenBlacklist',
    
    // Factory function to create model with specific connection
    createModel: function(connection) {
        return connection.model(this.modelName, this.schema);
    }
};