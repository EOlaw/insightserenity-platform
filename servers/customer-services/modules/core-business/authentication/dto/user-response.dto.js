/**
 * @fileoverview User Response DTO
 * @module servers/customer-services/modules/core-business/authentication/dto/user-response.dto
 * @description Data Transfer Object for formatting user data in responses
 * @version 1.0.0
 */

/**
 * User Response DTO
 * Formats user data for API responses (excluding sensitive information)
 * @class UserResponseDto
 */
class UserResponseDto {
    /**
     * Format full user data
     * @param {Object} user - User object from database
     * @returns {Object} Formatted user data
     */
    static format(user) {
        if (!user) {
            return null;
        }

        return {
            id: user.id,
            email: user.email,
            username: user.username,
            role: user.role || 'customer',
            roles: user.roles || [user.role || 'customer'],
            
            profile: {
                firstName: user.profile?.firstName || user.firstName,
                lastName: user.profile?.lastName || user.lastName,
                fullName: this._getFullName(user),
                phoneNumber: user.profile?.phoneNumber || user.phoneNumber,
                avatar: user.profile?.avatar || user.avatar,
                bio: user.profile?.bio,
                dateOfBirth: user.profile?.dateOfBirth,
                gender: user.profile?.gender,
                language: user.profile?.language || user.language || 'en',
                timezone: user.profile?.timezone || user.timezone || 'UTC',
                address: user.profile?.address ? {
                    street: user.profile.address.street,
                    city: user.profile.address.city,
                    state: user.profile.address.state,
                    postalCode: user.profile.address.postalCode,
                    country: user.profile.address.country
                } : null
            },

            company: user.company ? {
                name: user.company.name || user.companyName,
                position: user.company.position,
                department: user.company.department,
                website: user.company.website
            } : null,

            verification: {
                email: {
                    verified: user.emailVerified || user.verification?.email?.verified || false,
                    verifiedAt: user.emailVerifiedAt || user.verification?.email?.verifiedAt
                },
                phone: {
                    verified: user.phoneVerified || user.verification?.phone?.verified || false,
                    verifiedAt: user.phoneVerifiedAt || user.verification?.phone?.verifiedAt
                },
                identity: {
                    verified: user.identityVerified || user.verification?.identity?.verified || false,
                    verifiedAt: user.identityVerifiedAt || user.verification?.identity?.verifiedAt
                }
            },

            security: {
                mfaEnabled: user.mfaEnabled || false,
                mfaMethods: user.mfaMethods || [],
                lastPasswordChange: user.lastPasswordChange,
                passwordExpiresAt: user.passwordExpiresAt
            },

            subscription: user.subscription ? {
                tier: user.subscription.tier || 'free',
                status: user.subscription.status || 'active',
                expiresAt: user.subscription.expiresAt,
                features: user.subscription.features || []
            } : null,

            preferences: user.preferences ? {
                notifications: user.preferences.notifications || {},
                privacy: user.preferences.privacy || {},
                theme: user.preferences.theme || 'light',
                language: user.preferences.language || 'en'
            } : null,

            metadata: {
                tenantId: user.tenantId,
                status: user.status || 'active',
                accountType: user.accountType || 'customer',
                source: user.source || 'direct',
                referralCode: user.referralCode,
                isActive: user.isActive !== false,
                isLocked: user.isLocked || false,
                isSuspended: user.isSuspended || false
            },

            timestamps: {
                createdAt: user.createdAt,
                updatedAt: user.updatedAt,
                lastLoginAt: user.lastLoginAt,
                lastActivityAt: user.lastActivityAt
            },

            stats: user.stats ? {
                loginCount: user.stats.loginCount || 0,
                projectCount: user.stats.projectCount || 0,
                activityScore: user.stats.activityScore || 0
            } : null
        };
    }

    /**
     * Format basic user data (minimal information)
     * @param {Object} user - User object
     * @returns {Object} Basic user data
     */
    static formatBasic(user) {
        if (!user) {
            return null;
        }

        return {
            id: user.id,
            email: user.email,
            username: user.username,
            role: user.role || 'customer',
            profile: {
                firstName: user.profile?.firstName || user.firstName,
                lastName: user.profile?.lastName || user.lastName,
                fullName: this._getFullName(user),
                avatar: user.profile?.avatar || user.avatar
            },
            verification: {
                emailVerified: user.emailVerified || user.verification?.email?.verified || false,
                phoneVerified: user.phoneVerified || user.verification?.phone?.verified || false
            },
            metadata: {
                tenantId: user.tenantId,
                status: user.status || 'active'
            }
        };
    }

    /**
     * Format public user profile (for display to other users)
     * @param {Object} user - User object
     * @returns {Object} Public user data
     */
    static formatPublic(user) {
        if (!user) {
            return null;
        }

        return {
            id: user.id,
            username: user.username,
            profile: {
                firstName: user.profile?.firstName || user.firstName,
                lastName: user.profile?.lastName || user.lastName,
                fullName: this._getFullName(user),
                avatar: user.profile?.avatar || user.avatar,
                bio: user.profile?.bio
            },
            company: user.company?.name || user.companyName ? {
                name: user.company?.name || user.companyName,
                position: user.company?.position
            } : null,
            verification: {
                verified: (user.emailVerified || user.verification?.email?.verified) &&
                          (user.identityVerified || user.verification?.identity?.verified)
            },
            memberSince: user.createdAt
        };
    }

    /**
     * Format user list item (for listing multiple users)
     * @param {Object} user - User object
     * @returns {Object} User list item data
     */
    static formatListItem(user) {
        if (!user) {
            return null;
        }

        return {
            id: user.id,
            email: user.email,
            username: user.username,
            role: user.role || 'customer',
            profile: {
                firstName: user.profile?.firstName || user.firstName,
                lastName: user.profile?.lastName || user.lastName,
                fullName: this._getFullName(user),
                avatar: user.profile?.avatar || user.avatar
            },
            verification: {
                emailVerified: user.emailVerified || user.verification?.email?.verified || false
            },
            metadata: {
                status: user.status || 'active',
                isActive: user.isActive !== false
            },
            timestamps: {
                createdAt: user.createdAt,
                lastLoginAt: user.lastLoginAt
            }
        };
    }

    /**
     * Format multiple users
     * @param {Array} users - Array of user objects
     * @param {string} [format='list'] - Format type (full, basic, public, list)
     * @returns {Array} Array of formatted users
     */
    static formatMany(users, format = 'list') {
        if (!Array.isArray(users)) {
            return [];
        }

        const formatMap = {
            full: this.format.bind(this),
            basic: this.formatBasic.bind(this),
            public: this.formatPublic.bind(this),
            list: this.formatListItem.bind(this)
        };

        const formatter = formatMap[format] || this.formatListItem.bind(this);

        return users.map(user => formatter(user)).filter(user => user !== null);
    }

    /**
     * Format user with additional context
     * @param {Object} user - User object
     * @param {Object} context - Additional context
     * @returns {Object} User data with context
     */
    static formatWithContext(user, context = {}) {
        const formattedUser = this.format(user);

        if (context.includePermissions && user.permissions) {
            formattedUser.permissions = user.permissions;
        }

        if (context.includeActivity && user.recentActivity) {
            formattedUser.recentActivity = user.recentActivity;
        }

        if (context.includeNotifications && user.notifications) {
            formattedUser.notifications = {
                unread: user.notifications.unread || 0,
                pending: user.notifications.pending || []
            };
        }

        if (context.includeSubscription && user.subscription) {
            formattedUser.subscription = {
                ...formattedUser.subscription,
                billingCycle: user.subscription.billingCycle,
                nextBillingDate: user.subscription.nextBillingDate,
                paymentMethod: user.subscription.paymentMethod ? {
                    type: user.subscription.paymentMethod.type,
                    last4: user.subscription.paymentMethod.last4
                } : null
            };
        }

        return formattedUser;
    }

    /**
     * Sanitize user data for logging (remove sensitive info)
     * @param {Object} user - User object
     * @returns {Object} Sanitized user data
     */
    static sanitizeForLogging(user) {
        if (!user) {
            return null;
        }

        return {
            id: user.id,
            email: user.email ? this._maskEmail(user.email) : null,
            role: user.role,
            tenantId: user.tenantId,
            status: user.status,
            createdAt: user.createdAt
        };
    }

    // ============= PRIVATE HELPER METHODS =============

    /**
     * Get full name from user object
     * @private
     */
    static _getFullName(user) {
        const firstName = user.profile?.firstName || user.firstName || '';
        const lastName = user.profile?.lastName || user.lastName || '';
        
        if (firstName && lastName) {
            return `${firstName} ${lastName}`.trim();
        } else if (firstName) {
            return firstName;
        } else if (lastName) {
            return lastName;
        } else {
            return user.username || user.email?.split('@')[0] || 'User';
        }
    }

    /**
     * Mask email for privacy
     * @private
     */
    static _maskEmail(email) {
        if (!email || typeof email !== 'string') {
            return null;
        }

        const [localPart, domain] = email.split('@');
        if (!localPart || !domain) {
            return email;
        }

        const visibleChars = Math.min(3, Math.floor(localPart.length / 2));
        const maskedLocal = localPart.substring(0, visibleChars) + 
                          '*'.repeat(Math.max(1, localPart.length - visibleChars));
        
        return `${maskedLocal}@${domain}`;
    }

    /**
     * Mask phone number for privacy
     * @private
     */
    static _maskPhoneNumber(phone) {
        if (!phone || typeof phone !== 'string') {
            return null;
        }

        // Keep last 4 digits visible
        return phone.replace(/\d(?=\d{4})/g, '*');
    }
}

module.exports = UserResponseDto;