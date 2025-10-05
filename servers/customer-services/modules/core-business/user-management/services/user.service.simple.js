/**
 * Simplified User Service - Direct MongoDB Connection
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { AppError } = require('../../../../../../shared/lib/utils/app-error');

// Connect to MongoDB if not connected
const ensureConnection = async () => {
    if (mongoose.connection.readyState !== 1) {
        const uri = process.env.DATABASE_CUSTOMER_URI || process.env.DATABASE_URI;
        await mongoose.connect(uri);
        console.log('Connected to MongoDB for User operations');
    }
};

// Define User Schema directly
const UserSchema = new mongoose.Schema({
    // Basic info
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    username: { type: String, unique: true, lowercase: true, sparse: true },
    password: { type: String, required: true },

    // Multi-tenant fields (as strings to avoid ObjectId issues)
    tenantId: { type: String, required: true },
    organizationId: { type: String, required: true },

    // Role and status
    role: { type: String, default: 'employee' },
    status: { type: String, default: 'active' },

    // Verification
    emailVerified: { type: Boolean, default: false },
    verificationToken: String,

    // Profile
    profile: {
        displayName: String,
        bio: String,
        avatar: String
    },

    // Professional
    professional: {
        jobTitle: String,
        department: String,
        skills: [String]
    },

    // Metadata
    metadata: {
        createdBy: String,
        lastUpdatedBy: String,
        version: { type: Number, default: 1 },
        source: String,
        ipAddress: String
    },

    // Security
    security: {
        loginAttempts: { type: Number, default: 0 },
        lastLogin: Date,
        lastPasswordChange: Date,
        mfaEnabled: { type: Boolean, default: false }
    },

    // Preferences
    preferences: {
        language: { type: String, default: 'en' },
        timezone: { type: String, default: 'UTC' },
        theme: { type: String, default: 'light' },
        notifications: {
            email: { type: Boolean, default: true },
            push: { type: Boolean, default: false },
            sms: { type: Boolean, default: false },
            inApp: { type: Boolean, default: true }
        }
    },

    // Compliance
    compliance: {
        gdprConsent: Boolean,
        gdprConsentDate: Date,
        marketingConsent: Boolean,
        termsAccepted: Boolean,
        termsAcceptedDate: Date
    }
}, {
    timestamps: true
});

// Create or get the User model
const getUser = () => {
    if (mongoose.models.User) {
        return mongoose.models.User;
    }
    return mongoose.model('User', UserSchema);
};

class SimpleUserService {
    /**
     * Create a new user
     */
    async createUser(userData, tenantId, createdBy = null) {
        await ensureConnection();
        const User = getUser();

        try {
            // Validate required fields
            if (!userData.email || !userData.password || !userData.firstName || !userData.lastName) {
                throw new AppError('Missing required fields', 400);
            }

            // Check for existing user
            const existingUser = await User.findOne({
                $or: [
                    { email: userData.email.toLowerCase(), tenantId },
                    userData.username ? { username: userData.username.toLowerCase(), tenantId } : null
                ].filter(Boolean)
            });

            if (existingUser) {
                throw new AppError('User already exists with this email or username', 409);
            }

            // Hash password
            const hashedPassword = await bcrypt.hash(userData.password, 10);

            // Prepare user document
            const userDocument = {
                ...userData,
                email: userData.email.toLowerCase(),
                username: userData.username ? userData.username.toLowerCase() : undefined,
                password: hashedPassword,
                tenantId,
                status: userData.status || 'active',
                emailVerified: false,
                verificationToken: crypto.randomBytes(32).toString('hex'),

                metadata: {
                    ...userData.metadata,
                    createdBy: createdBy || 'system',
                    lastUpdatedBy: createdBy || 'system',
                    version: 1,
                    source: userData.metadata?.source || 'api'
                },

                security: {
                    loginAttempts: 0,
                    lastPasswordChange: new Date(),
                    mfaEnabled: false
                },

                preferences: {
                    language: 'en',
                    timezone: 'UTC',
                    theme: 'light',
                    notifications: {
                        email: true,
                        push: false,
                        sms: false,
                        inApp: true
                    }
                },

                professional: userData.professional || {},

                compliance: {
                    gdprConsent: userData.compliance?.gdprConsent || false,
                    gdprConsentDate: userData.compliance?.gdprConsent ? new Date() : null,
                    termsAccepted: userData.compliance?.termsAccepted || false,
                    termsAcceptedDate: userData.compliance?.termsAccepted ? new Date() : null
                }
            };

            // Create user
            const newUser = await User.create(userDocument);

            // Remove sensitive data before returning
            const userResponse = newUser.toObject();
            delete userResponse.password;
            delete userResponse.verificationToken;

            console.log('User created successfully:', userResponse._id);

            return userResponse;

        } catch (error) {
            console.error('Error creating user:', error);

            if (error.code === 11000) {
                const field = Object.keys(error.keyPattern)[0];
                throw new AppError(`User with this ${field} already exists`, 409);
            }

            throw error;
        }
    }

    /**
     * Get user by ID
     */
    async getUserById(userId, tenantId) {
        await ensureConnection();
        const User = getUser();

        const user = await User.findOne({ _id: userId, tenantId }).select('-password -verificationToken');
        if (!user) {
            throw new AppError('User not found', 404);
        }

        return user;
    }

    /**
     * Update user
     */
    async updateUser(userId, updateData, tenantId) {
        await ensureConnection();
        const User = getUser();

        // Don't allow updating sensitive fields directly
        delete updateData.password;
        delete updateData.email;
        delete updateData.tenantId;
        delete updateData.organizationId;

        const user = await User.findOneAndUpdate(
            { _id: userId, tenantId },
            {
                $set: updateData,
                $inc: { 'metadata.version': 1 }
            },
            { new: true, runValidators: true }
        ).select('-password -verificationToken');

        if (!user) {
            throw new AppError('User not found', 404);
        }

        return user;
    }

    /**
     * Delete user
     */
    async deleteUser(userId, tenantId) {
        await ensureConnection();
        const User = getUser();

        const user = await User.findOneAndDelete({ _id: userId, tenantId });
        if (!user) {
            throw new AppError('User not found', 404);
        }

        return { message: 'User deleted successfully' };
    }

    /**
     * Get all users for a tenant
     */
    async getUsers(tenantId, options = {}) {
        await ensureConnection();
        const User = getUser();

        const query = { tenantId };

        if (options.role) {
            query.role = options.role;
        }

        if (options.status) {
            query.status = options.status;
        }

        const users = await User.find(query)
            .select('-password -verificationToken')
            .skip(options.skip || 0)
            .limit(options.limit || 20)
            .sort(options.sort || { createdAt: -1 });

        return users;
    }
}

module.exports = new SimpleUserService();
