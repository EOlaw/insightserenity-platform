/**
 * @fileoverview OAuth Controller
 * @module servers/customer-services/modules/core-business/authentication/controllers/oauth-controller
 * @description Handles HTTP requests for OAuth authentication (GitHub, LinkedIn, Google)
 * @version 1.0.0
 */

const logger = require('../../../../../../shared/lib/utils/logger');
const { AppError } = require('../../../../../../shared/lib/utils/app-error');
const AuthResponseDto = require('../dto/auth-response.dto');

/**
 * OAuth Controller
 * Handles all OAuth-related HTTP requests
 * @class OAuthController
 */
class OAuthController {
    /**
     * Initiate GitHub OAuth flow
     * @route GET /api/auth/oauth/github
     * @access Public
     */
    async initiateGitHubAuth(req, res, next) {
        try {
            const tenantId = req.headers['x-tenant-id'] || req.query.tenant;
            const { redirectUrl, state } = req.query;

            if (!tenantId) {
                throw new AppError('Tenant ID is required', 400, 'MISSING_TENANT_ID');
            }

            // Generate OAuth state for CSRF protection
            const OAuthService = require('../../../../../../shared/lib/auth/services/oauth-service');
            const oauthState = await OAuthService.generateOAuthState({
                provider: 'github',
                tenantId: tenantId,
                redirectUrl: redirectUrl,
                customState: state,
                ip: req.ip || req.connection.remoteAddress
            });

            // Build GitHub OAuth URL
            const githubAuthUrl = OAuthService.buildGitHubAuthUrl(oauthState, {
                scope: 'user:email',
                allowSignup: true
            });

            logger.info('GitHub OAuth initiated', {
                tenantId,
                state: oauthState
            });

            // Redirect to GitHub
            res.redirect(githubAuthUrl);

        } catch (error) {
            logger.error('GitHub OAuth initiation failed', {
                error: error.message,
                stack: error.stack
            });
            next(error);
        }
    }

    /**
     * Handle GitHub OAuth callback
     * @route GET /api/auth/oauth/github/callback
     * @access Public
     */
    async handleGitHubCallback(req, res, next) {
        try {
            const { code, state, error, error_description } = req.query;

            // Handle OAuth errors
            if (error) {
                logger.error('GitHub OAuth error', {
                    error: error,
                    description: error_description
                });
                
                return res.redirect(`${process.env.CUSTOMER_PORTAL_URL}/auth/error?error=${error}&message=${error_description}`);
            }

            if (!code || !state) {
                throw new AppError('Missing OAuth parameters', 400, 'MISSING_OAUTH_PARAMS');
            }

            // Call shared OAuth service to handle callback
            const OAuthService = require('../../../../../../shared/lib/auth/services/oauth-service');
            const result = await OAuthService.handleGitHubCallback(code, state, {
                ip: req.ip || req.connection.remoteAddress,
                userAgent: req.headers['user-agent']
            });

            // Format response
            const response = AuthResponseDto.formatLoginResponse(result);

            // Set HTTP-only cookie for refresh token
            if (result.tokens?.refreshToken) {
                res.cookie('refreshToken', result.tokens.refreshToken, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'strict',
                    maxAge: 7 * 24 * 60 * 60 * 1000
                });
            }

            logger.info('GitHub OAuth successful', {
                userId: result.user.id,
                email: result.user.email,
                isNewUser: result.isNewUser
            });

            // Redirect to frontend with tokens
            const redirectUrl = result.redirectUrl || `${process.env.CUSTOMER_PORTAL_URL}/auth/callback`;
            res.redirect(`${redirectUrl}?token=${result.tokens.accessToken}&provider=github&new_user=${result.isNewUser}`);

        } catch (error) {
            logger.error('GitHub OAuth callback failed', {
                error: error.message,
                stack: error.stack
            });
            
            res.redirect(`${process.env.CUSTOMER_PORTAL_URL}/auth/error?error=oauth_failed&message=${encodeURIComponent(error.message)}`);
        }
    }

    /**
     * Initiate LinkedIn OAuth flow
     * @route GET /api/auth/oauth/linkedin
     * @access Public
     */
    async initiateLinkedInAuth(req, res, next) {
        try {
            const tenantId = req.headers['x-tenant-id'] || req.query.tenant;
            const { redirectUrl, state } = req.query;

            if (!tenantId) {
                throw new AppError('Tenant ID is required', 400, 'MISSING_TENANT_ID');
            }

            // Generate OAuth state for CSRF protection
            const OAuthService = require('../../../../../../shared/lib/auth/services/oauth-service');
            const oauthState = await OAuthService.generateOAuthState({
                provider: 'linkedin',
                tenantId: tenantId,
                redirectUrl: redirectUrl,
                customState: state,
                ip: req.ip || req.connection.remoteAddress
            });

            // Build LinkedIn OAuth URL
            const linkedinAuthUrl = OAuthService.buildLinkedInAuthUrl(oauthState, {
                scope: 'r_emailaddress r_liteprofile'
            });

            logger.info('LinkedIn OAuth initiated', {
                tenantId,
                state: oauthState
            });

            // Redirect to LinkedIn
            res.redirect(linkedinAuthUrl);

        } catch (error) {
            logger.error('LinkedIn OAuth initiation failed', {
                error: error.message,
                stack: error.stack
            });
            next(error);
        }
    }

    /**
     * Handle LinkedIn OAuth callback
     * @route GET /api/auth/oauth/linkedin/callback
     * @access Public
     */
    async handleLinkedInCallback(req, res, next) {
        try {
            const { code, state, error, error_description } = req.query;

            // Handle OAuth errors
            if (error) {
                logger.error('LinkedIn OAuth error', {
                    error: error,
                    description: error_description
                });
                
                return res.redirect(`${process.env.CUSTOMER_PORTAL_URL}/auth/error?error=${error}&message=${error_description}`);
            }

            if (!code || !state) {
                throw new AppError('Missing OAuth parameters', 400, 'MISSING_OAUTH_PARAMS');
            }

            // Call shared OAuth service to handle callback
            const OAuthService = require('../../../../../../shared/lib/auth/services/oauth-service');
            const result = await OAuthService.handleLinkedInCallback(code, state, {
                ip: req.ip || req.connection.remoteAddress,
                userAgent: req.headers['user-agent']
            });

            // Format response
            const response = AuthResponseDto.formatLoginResponse(result);

            // Set HTTP-only cookie for refresh token
            if (result.tokens?.refreshToken) {
                res.cookie('refreshToken', result.tokens.refreshToken, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'strict',
                    maxAge: 7 * 24 * 60 * 60 * 1000
                });
            }

            logger.info('LinkedIn OAuth successful', {
                userId: result.user.id,
                email: result.user.email,
                isNewUser: result.isNewUser
            });

            // Redirect to frontend with tokens
            const redirectUrl = result.redirectUrl || `${process.env.CUSTOMER_PORTAL_URL}/auth/callback`;
            res.redirect(`${redirectUrl}?token=${result.tokens.accessToken}&provider=linkedin&new_user=${result.isNewUser}`);

        } catch (error) {
            logger.error('LinkedIn OAuth callback failed', {
                error: error.message,
                stack: error.stack
            });
            
            res.redirect(`${process.env.CUSTOMER_PORTAL_URL}/auth/error?error=oauth_failed&message=${encodeURIComponent(error.message)}`);
        }
    }

    /**
     * Initiate Google OAuth flow
     * @route GET /api/auth/oauth/google
     * @access Public
     */
    async initiateGoogleAuth(req, res, next) {
        try {
            const tenantId = req.headers['x-tenant-id'] || req.query.tenant;
            const { redirectUrl, state } = req.query;

            if (!tenantId) {
                throw new AppError('Tenant ID is required', 400, 'MISSING_TENANT_ID');
            }

            // Generate OAuth state for CSRF protection
            const OAuthService = require('../../../../../../shared/lib/auth/services/oauth-service');
            const oauthState = await OAuthService.generateOAuthState({
                provider: 'google',
                tenantId: tenantId,
                redirectUrl: redirectUrl,
                customState: state,
                ip: req.ip || req.connection.remoteAddress
            });

            // Build Google OAuth URL
            const googleAuthUrl = OAuthService.buildGoogleAuthUrl(oauthState, {
                scope: 'email profile',
                accessType: 'offline',
                prompt: 'consent'
            });

            logger.info('Google OAuth initiated', {
                tenantId,
                state: oauthState
            });

            // Redirect to Google
            res.redirect(googleAuthUrl);

        } catch (error) {
            logger.error('Google OAuth initiation failed', {
                error: error.message,
                stack: error.stack
            });
            next(error);
        }
    }

    /**
     * Handle Google OAuth callback
     * @route GET /api/auth/oauth/google/callback
     * @access Public
     */
    async handleGoogleCallback(req, res, next) {
        try {
            const { code, state, error, error_description } = req.query;

            // Handle OAuth errors
            if (error) {
                logger.error('Google OAuth error', {
                    error: error,
                    description: error_description
                });
                
                return res.redirect(`${process.env.CUSTOMER_PORTAL_URL}/auth/error?error=${error}&message=${error_description}`);
            }

            if (!code || !state) {
                throw new AppError('Missing OAuth parameters', 400, 'MISSING_OAUTH_PARAMS');
            }

            // Call shared OAuth service to handle callback
            const OAuthService = require('../../../../../../shared/lib/auth/services/oauth-service');
            const result = await OAuthService.handleGoogleCallback(code, state, {
                ip: req.ip || req.connection.remoteAddress,
                userAgent: req.headers['user-agent']
            });

            // Format response
            const response = AuthResponseDto.formatLoginResponse(result);

            // Set HTTP-only cookie for refresh token
            if (result.tokens?.refreshToken) {
                res.cookie('refreshToken', result.tokens.refreshToken, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'strict',
                    maxAge: 7 * 24 * 60 * 60 * 1000
                });
            }

            logger.info('Google OAuth successful', {
                userId: result.user.id,
                email: result.user.email,
                isNewUser: result.isNewUser
            });

            // Redirect to frontend with tokens
            const redirectUrl = result.redirectUrl || `${process.env.CUSTOMER_PORTAL_URL}/auth/callback`;
            res.redirect(`${redirectUrl}?token=${result.tokens.accessToken}&provider=google&new_user=${result.isNewUser}`);

        } catch (error) {
            logger.error('Google OAuth callback failed', {
                error: error.message,
                stack: error.stack
            });
            
            res.redirect(`${process.env.CUSTOMER_PORTAL_URL}/auth/error?error=oauth_failed&message=${encodeURIComponent(error.message)}`);
        }
    }

    /**
     * Link OAuth account to existing user
     * @route POST /api/auth/oauth/link
     * @access Protected
     */
    async linkOAuthAccount(req, res, next) {
        try {
            const userId = req.user.id;
            const tenantId = req.user.tenantId;
            const { provider, code, state } = req.body;

            if (!provider) {
                throw new AppError('Provider is required', 400, 'MISSING_PROVIDER');
            }

            if (!code) {
                throw new AppError('Authorization code is required', 400, 'MISSING_CODE');
            }

            // Call shared OAuth service to link account
            const OAuthService = require('../../../../../../shared/lib/auth/services/oauth-service');
            await OAuthService.linkOAuthAccount(userId, provider, code, state, tenantId);

            logger.info('OAuth account linked', {
                userId,
                tenantId,
                provider
            });

            res.status(200).json({
                success: true,
                message: `${provider} account linked successfully`,
                data: {
                    provider: provider,
                    linked: true,
                    linkedAt: new Date().toISOString()
                }
            });

        } catch (error) {
            logger.error('Link OAuth account failed', {
                error: error.message,
                stack: error.stack
            });
            next(error);
        }
    }

    /**
     * Unlink OAuth account
     * @route POST /api/auth/oauth/unlink
     * @access Protected
     */
    async unlinkOAuthAccount(req, res, next) {
        try {
            const userId = req.user.id;
            const tenantId = req.user.tenantId;
            const { provider, password } = req.body;

            if (!provider) {
                throw new AppError('Provider is required', 400, 'MISSING_PROVIDER');
            }

            if (!password) {
                throw new AppError('Password confirmation is required', 400, 'MISSING_PASSWORD');
            }

            // Verify password before unlinking
            const AuthService = require('../../../../../../shared/lib/auth/services/auth-service');
            await AuthService.verifyPassword(userId, password, tenantId);

            // Call shared OAuth service to unlink account
            const OAuthService = require('../../../../../../shared/lib/auth/services/oauth-service');
            await OAuthService.unlinkOAuthAccount(userId, provider, tenantId);

            logger.info('OAuth account unlinked', {
                userId,
                tenantId,
                provider
            });

            res.status(200).json({
                success: true,
                message: `${provider} account unlinked successfully`,
                data: {
                    provider: provider,
                    linked: false,
                    unlinkedAt: new Date().toISOString()
                }
            });

        } catch (error) {
            logger.error('Unlink OAuth account failed', {
                error: error.message,
                stack: error.stack
            });
            next(error);
        }
    }

    /**
     * Get linked OAuth accounts
     * @route GET /api/auth/oauth/linked
     * @access Protected
     */
    async getLinkedAccounts(req, res, next) {
        try {
            const userId = req.user.id;
            const tenantId = req.user.tenantId;

            // Call shared OAuth service to get linked accounts
            const OAuthService = require('../../../../../../shared/lib/auth/services/oauth-service');
            const linkedAccounts = await OAuthService.getLinkedAccounts(userId, tenantId);

            logger.debug('Linked OAuth accounts retrieved', {
                userId,
                tenantId
            });

            res.status(200).json({
                success: true,
                message: 'Linked accounts retrieved successfully',
                data: {
                    accounts: linkedAccounts,
                    total: linkedAccounts.length
                }
            });

        } catch (error) {
            logger.error('Get linked accounts failed', {
                error: error.message,
                stack: error.stack
            });
            next(error);
        }
    }
}

// Export singleton instance
module.exports = new OAuthController();