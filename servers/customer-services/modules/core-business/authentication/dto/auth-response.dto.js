/**
 * @fileoverview Authentication Response DTO
 * @module servers/customer-services/modules/core-business/authentication/dto/auth-response.dto
 * @description Data Transfer Object for formatting authentication responses
 * @version 1.0.0
 */

const UserResponseDto = require('./user-response.dto');

/**
 * Authentication Response DTO
 * Formats authentication-related responses
 * @class AuthResponseDto
 */
class AuthResponseDto {
    /**
     * Format registration response
     * @param {Object} registrationData - Registration result from service
     * @returns {Object} Formatted response
     */
    static formatRegistrationResponse(registrationData) {
        const response = {
            user: UserResponseDto.format(registrationData.user),
            tokens: registrationData.tokens ? {
                accessToken: registrationData.tokens.accessToken,
                refreshToken: registrationData.tokens.refreshToken,
                expiresIn: registrationData.tokens.expiresIn,
                tokenType: registrationData.tokens.tokenType || 'Bearer'
            } : null,
            requiresEmailVerification: registrationData.requiresEmailVerification || false,
            verificationEmailSent: registrationData.verificationEmailSent || false
        };

        // Add customer-specific fields if present
        if (registrationData.onboarding) {
            response.onboarding = {
                id: registrationData.onboarding.id,
                progress: registrationData.onboarding.progress || 0,
                currentStep: registrationData.onboarding.currentStep,
                totalSteps: registrationData.onboarding.steps?.length || 0
            };
        }

        if (registrationData.nextSteps) {
            response.nextSteps = registrationData.nextSteps;
        }

        if (registrationData.customerPortalUrl) {
            response.portalUrl = registrationData.customerPortalUrl;
        }

        return response;
    }

    /**
     * Format login response
     * @param {Object} loginData - Login result from service
     * @returns {Object} Formatted response
     */
    static formatLoginResponse(loginData) {
        const response = {
            user: UserResponseDto.format(loginData.user),
            tokens: loginData.tokens ? {
                accessToken: loginData.tokens.accessToken,
                refreshToken: loginData.tokens.refreshToken,
                expiresIn: loginData.tokens.expiresIn,
                tokenType: loginData.tokens.tokenType || 'Bearer'
            } : null,
            session: loginData.session ? {
                id: loginData.session.id,
                expiresAt: loginData.session.expiresAt
            } : null
        };

        // Add customer-specific fields if present
        if (loginData.profileStatus) {
            response.profile = {
                isComplete: loginData.profileStatus.isComplete,
                completionPercentage: loginData.profileStatus.completionPercentage,
                missingFields: loginData.profileStatus.missingFields
            };
        }

        if (loginData.preferences) {
            response.preferences = loginData.preferences;
        }

        if (loginData.pendingNotifications) {
            response.notifications = {
                pending: loginData.pendingNotifications.length,
                unread: loginData.pendingNotifications.filter(n => !n.read).length
            };
        }

        if (loginData.customerPortalUrl) {
            response.portalUrl = loginData.customerPortalUrl;
        }

        if (loginData.features) {
            response.features = loginData.features;
        }

        return response;
    }

    /**
     * Format MFA challenge response
     * @param {Object} mfaData - MFA challenge data
     * @returns {Object} Formatted response
     */
    static formatMfaChallengeResponse(mfaData) {
        return {
            requiresMFA: true,
            challengeId: mfaData.challengeId,
            methods: mfaData.mfaMethods || [],
            preferredMethod: mfaData.preferredMethod,
            expiresIn: mfaData.expiresIn || 300 // 5 minutes default
        };
    }

    /**
     * Format token refresh response
     * @param {Object} tokenData - Token refresh result
     * @returns {Object} Formatted response
     */
    static formatTokenRefreshResponse(tokenData) {
        return {
            accessToken: tokenData.accessToken,
            refreshToken: tokenData.refreshToken,
            expiresIn: tokenData.expiresIn,
            tokenType: tokenData.tokenType || 'Bearer',
            user: UserResponseDto.formatBasic(tokenData.user)
        };
    }

    /**
     * Format password reset request response
     * @param {Object} resetData - Password reset request result
     * @returns {Object} Formatted response
     */
    static formatPasswordResetRequestResponse(resetData) {
        return {
            email: resetData.email,
            resetLinkSent: resetData.resetLinkSent || true,
            expiresIn: resetData.expiresIn || '1 hour',
            message: 'If an account exists with this email, a password reset link has been sent.'
        };
    }

    /**
     * Format password reset completion response
     * @param {Object} resetData - Password reset completion result
     * @returns {Object} Formatted response
     */
    static formatPasswordResetResponse(resetData) {
        return {
            email: resetData.email,
            passwordUpdated: true,
            message: 'Password reset successful. You can now log in with your new password.'
        };
    }

    /**
     * Format password change response
     * @param {Object} changeData - Password change result
     * @returns {Object} Formatted response
     */
    static formatPasswordChangeResponse(changeData) {
        return {
            passwordUpdated: true,
            updatedAt: changeData.updatedAt || new Date().toISOString(),
            message: 'Password changed successfully'
        };
    }

    /**
     * Format email verification response
     * @param {Object} verificationData - Email verification result
     * @returns {Object} Formatted response
     */
    static formatEmailVerificationResponse(verificationData) {
        return {
            email: verificationData.email,
            verified: true,
            verifiedAt: verificationData.verifiedAt || new Date().toISOString(),
            message: 'Email verified successfully'
        };
    }

    /**
     * Format MFA setup response
     * @param {Object} mfaData - MFA setup result
     * @returns {Object} Formatted response
     */
    static formatMfaSetupResponse(mfaData) {
        const response = {
            method: mfaData.method,
            setupComplete: false,
            requiresVerification: true
        };

        // Add method-specific data
        if (mfaData.method === 'totp') {
            response.secret = mfaData.secret;
            response.qrCode = mfaData.qrCode;
            response.manualEntryCode = mfaData.secret;
        }

        if (mfaData.method === 'sms' || mfaData.method === 'email') {
            response.verificationId = mfaData.verificationId;
            response.maskedContact = mfaData.maskedContact;
        }

        if (mfaData.backupCodes) {
            response.backupCodes = mfaData.backupCodes;
        }

        if (mfaData.supportUrl) {
            response.supportUrl = mfaData.supportUrl;
        }

        if (mfaData.videoTutorial) {
            response.tutorial = mfaData.videoTutorial;
        }

        return response;
    }

    /**
     * Format session list response
     * @param {Array} sessions - Array of sessions
     * @param {string} currentSessionId - Current session ID
     * @returns {Object} Formatted response
     */
    static formatSessionListResponse(sessions, currentSessionId) {
        return {
            sessions: sessions.map(session => ({
                id: session.id,
                device: {
                    type: session.device || 'unknown',
                    os: session.os,
                    browser: session.browser,
                    userAgent: session.userAgent
                },
                location: {
                    ip: session.ip,
                    city: session.city,
                    country: session.country
                },
                createdAt: session.createdAt,
                lastActivity: session.lastActivity,
                expiresAt: session.expiresAt,
                isCurrent: session.id === currentSessionId
            })),
            total: sessions.length,
            currentSessionId: currentSessionId
        };
    }

    /**
     * Format OAuth link response
     * @param {Object} linkData - OAuth link result
     * @returns {Object} Formatted response
     */
    static formatOAuthLinkResponse(linkData) {
        return {
            provider: linkData.provider,
            linked: true,
            linkedAt: linkData.linkedAt || new Date().toISOString(),
            providerUserId: linkData.providerUserId,
            message: `${linkData.provider} account linked successfully`
        };
    }

    /**
     * Format error response
     * @param {Error} error - Error object
     * @returns {Object} Formatted error response
     */
    static formatErrorResponse(error) {
        return {
            success: false,
            error: {
                code: error.code || 'INTERNAL_ERROR',
                message: error.message || 'An error occurred',
                details: error.details || null,
                timestamp: new Date().toISOString()
            }
        };
    }

    /**
     * Format success response with custom data
     * @param {string} message - Success message
     * @param {Object} data - Response data
     * @returns {Object} Formatted success response
     */
    static formatSuccessResponse(message, data = null) {
        return {
            success: true,
            message: message,
            data: data,
            timestamp: new Date().toISOString()
        };
    }
}

module.exports = AuthResponseDto;