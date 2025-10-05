/**
 * @fileoverview OAuth & Social Authentication Controller
 * @module servers/customer-services/modules/core-business/authentication/controllers/oauth-controller
 */

const directAuthService = require('../services/direct-auth-service');
const { AppError } = require('../../../../../../shared/lib/utils/app-error');

class OAuthController {
    /**
     * Initiate OAuth flow
     * GET /api/auth/oauth/:provider
     */
    async initiateOAuth(req, res, next) {
        try {
            const { provider } = req.params;
            const { redirect_uri, state } = req.query;

            const validProviders = ['google', 'github', 'linkedin', 'microsoft'];
            if (!validProviders.includes(provider)) {
                return next(new AppError('Invalid OAuth provider', 400));
            }

            // TODO: Generate OAuth URL based on provider
            const oauthUrl = `https://oauth.${provider}.com/authorize?client_id=...&redirect_uri=${redirect_uri}&state=${state}`;

            res.status(200).json({
                success: true,
                data: {
                    provider,
                    authUrl: oauthUrl,
                    state
                }
            });

        } catch (error) {
            next(error);
        }
    }

    /**
     * Handle OAuth callback
     * GET /api/auth/oauth/:provider/callback
     */
    async handleOAuthCallback(req, res, next) {
        try {
            const { provider } = req.params;
            const { code, state } = req.query;

            if (!code) {
                return next(new AppError('Authorization code is required', 400));
            }

            // TODO: Exchange code for access token with OAuth provider
            // TODO: Get user profile from OAuth provider
            // TODO: Find or create user in database
            // TODO: Link OAuth account to user

            const mockOAuthUser = {
                providerId: '123456',
                email: 'user@example.com',
                name: 'John Doe',
                picture: 'https://example.com/avatar.jpg'
            };

            // Check if user exists
            const dbService = directAuthService._getDatabaseService();
            let user = await dbService.findByEmail(mockOAuthUser.email);

            if (!user) {
                // Create new user
                const userData = {
                    email: mockOAuthUser.email,
                    profile: {
                        firstName: mockOAuthUser.name.split(' ')[0],
                        lastName: mockOAuthUser.name.split(' ')[1] || '',
                        displayName: mockOAuthUser.name
                    },
                    authProviders: [{
                        provider,
                        providerId: mockOAuthUser.providerId,
                        providerData: mockOAuthUser,
                        isPrimary: true,
                        connectedAt: new Date()
                    }],
                    accountStatus: {
                        status: 'active'
                    },
                    verification: {
                        email: {
                            verified: true,
                            verifiedAt: new Date()
                        }
                    }
                };

                user = await dbService.createUser(userData, directAuthService.config.companyTenantId);
            } else {
                // Add OAuth provider to existing user
                const existingProvider = user.authProviders.find(p => p.provider === provider);
                
                if (!existingProvider) {
                    user.authProviders.push({
                        provider,
                        providerId: mockOAuthUser.providerId,
                        providerData: mockOAuthUser,
                        connectedAt: new Date()
                    });
                    await user.save();
                }
            }

            // Generate tokens
            const accessToken = directAuthService._generateAccessToken(user);
            const refreshToken = directAuthService._generateRefreshToken(user);

            // Record login
            await user.recordLogin({
                ipAddress: req.ip,
                userAgent: req.headers['user-agent'],
                authMethod: `oauth_${provider}`,
                success: true
            });

            res.status(200).json({
                success: true,
                message: `${provider} authentication successful`,
                data: {
                    user: directAuthService._sanitizeUserOutput(user),
                    tokens: {
                        accessToken,
                        refreshToken,
                        expiresIn: 86400,
                        tokenType: 'Bearer'
                    },
                    provider
                }
            });

        } catch (error) {
            next(error);
        }
    }

    /**
     * Link OAuth account to existing user
     * POST /api/auth/oauth/link/:provider
     */
    async linkOAuthAccount(req, res, next) {
        try {
            if (!req.user || !req.user.id) {
                return next(new AppError('User not authenticated', 401));
            }

            const { provider } = req.params;
            const { code } = req.body;

            if (!code) {
                return next(new AppError('Authorization code is required', 400));
            }

            // TODO: Exchange code for access token
            // TODO: Get user profile from OAuth provider
            // TODO: Link to authenticated user

            const dbService = directAuthService._getDatabaseService();
            const user = await dbService.findUserById(req.user.id);

            if (!user) {
                return next(new AppError('User not found', 404));
            }

            // Check if provider already linked
            const existingProvider = user.authProviders.find(p => p.provider === provider);
            if (existingProvider) {
                return next(new AppError(`${provider} account is already linked`, 409));
            }

            // Add OAuth provider
            user.authProviders.push({
                provider,
                providerId: 'oauth-user-id',
                providerData: {
                    email: 'oauth@example.com',
                    name: 'OAuth User'
                },
                connectedAt: new Date()
            });

            await user.save();

            res.status(200).json({
                success: true,
                message: `${provider} account linked successfully`,
                data: {
                    provider,
                    linkedAt: new Date()
                }
            });

        } catch (error) {
            next(error);
        }
    }

    /**
     * Unlink OAuth account
     * DELETE /api/auth/oauth/unlink/:provider
     */
    async unlinkOAuthAccount(req, res, next) {
        try {
            if (!req.user || !req.user.id) {
                return next(new AppError('User not authenticated', 401));
            }

            const { provider } = req.params;

            const dbService = directAuthService._getDatabaseService();
            const user = await dbService.findUserById(req.user.id);

            if (!user) {
                return next(new AppError('User not found', 404));
            }

            // Check if user has password or other auth methods
            if (!user.password && user.authProviders.length === 1) {
                return next(new AppError('Cannot unlink the only authentication method', 400));
            }

            // Remove provider
            user.authProviders = user.authProviders.filter(p => p.provider !== provider);
            await user.save();

            res.status(200).json({
                success: true,
                message: `${provider} account unlinked successfully`
            });

        } catch (error) {
            next(error);
        }
    }

    /**
     * Get linked OAuth accounts
     * GET /api/auth/oauth/linked
     */
    async getLinkedAccounts(req, res, next) {
        try {
            if (!req.user || !req.user.id) {
                return next(new AppError('User not authenticated', 401));
            }

            const dbService = directAuthService._getDatabaseService();
            const user = await dbService.findUserById(req.user.id);

            if (!user) {
                return next(new AppError('User not found', 404));
            }

            const linkedAccounts = user.authProviders.map(provider => ({
                provider: provider.provider,
                email: provider.providerData?.email,
                name: provider.providerData?.name,
                connectedAt: provider.connectedAt,
                isPrimary: provider.isPrimary
            }));

            res.status(200).json({
                success: true,
                data: {
                    linkedAccounts
                }
            });

        } catch (error) {
            next(error);
        }
    }
}

module.exports = new OAuthController();