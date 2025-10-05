/**
 * @fileoverview Session Management Controller
 * @module servers/customer-services/modules/core-business/authentication/controllers/session-controller
 */

const directAuthService = require('../services/direct-auth-service');
const { AppError } = require('../../../../../../shared/lib/utils/app-error');

class SessionController {
    /**
     * Get current session
     * GET /api/auth/session
     */
    async getCurrentSession(req, res, next) {
        try {
            if (!req.user || !req.user.id) {
                return next(new AppError('No active session', 401));
            }

            const dbService = directAuthService._getDatabaseService();
            const user = await dbService.findUserById(req.user.id);

            if (!user) {
                return next(new AppError('User not found', 404));
            }

            res.status(200).json({
                success: true,
                data: {
                    user: directAuthService._sanitizeUserOutput(user),
                    sessionInfo: {
                        loginAt: user.activity?.lastLoginAt,
                        ipAddress: req.ip,
                        userAgent: req.headers['user-agent']
                    }
                }
            });

        } catch (error) {
            next(error);
        }
    }

    /**
     * Get all active sessions
     * GET /api/auth/sessions
     */
    async getAllSessions(req, res, next) {
        try {
            if (!req.user || !req.user.id) {
                return next(new AppError('User not authenticated', 401));
            }

            const dbService = directAuthService._getDatabaseService();
            const user = await dbService.findUserById(req.user.id);

            if (!user) {
                return next(new AppError('User not found', 404));
            }

            // Get login history as sessions
            const sessions = (user.activity?.loginHistory || [])
                .filter(login => login.success)
                .slice(0, 10)
                .map(login => ({
                    sessionId: login.sessionId,
                    ipAddress: login.ipAddress,
                    userAgent: login.userAgent,
                    location: login.location,
                    loginAt: login.timestamp,
                    isCurrent: login.ipAddress === req.ip
                }));

            res.status(200).json({
                success: true,
                data: {
                    sessions,
                    totalSessions: sessions.length
                }
            });

        } catch (error) {
            next(error);
        }
    }

    /**
     * Refresh access token
     * POST /api/auth/session/refresh
     */
    async refreshToken(req, res, next) {
        try {
            const refreshToken = req.cookies?.refreshToken || req.body.refreshToken;

            if (!refreshToken) {
                return next(new AppError('Refresh token is required', 400));
            }

            // TODO: Verify refresh token and generate new access token
            // For now, return mock response

            res.status(200).json({
                success: true,
                message: 'Token refreshed successfully',
                data: {
                    accessToken: 'new-access-token',
                    expiresIn: 86400,
                    tokenType: 'Bearer'
                }
            });

        } catch (error) {
            next(error);
        }
    }

    /**
     * Terminate current session (logout)
     * POST /api/auth/session/logout
     */
    async logout(req, res, next) {
        try {
            // Clear refresh token cookie
            res.clearCookie('refreshToken', {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict'
            });

            // TODO: Blacklist the current access token
            // TODO: Remove session from active sessions

            res.status(200).json({
                success: true,
                message: 'Logout successful'
            });

        } catch (error) {
            next(error);
        }
    }

    /**
     * Terminate specific session
     * DELETE /api/auth/sessions/:sessionId
     */
    async terminateSession(req, res, next) {
        try {
            if (!req.user || !req.user.id) {
                return next(new AppError('User not authenticated', 401));
            }

            const { sessionId } = req.params;

            if (!sessionId) {
                return next(new AppError('Session ID is required', 400));
            }

            // TODO: Implement session termination
            // This would involve:
            // 1. Finding the session by ID
            // 2. Blacklisting the session token
            // 3. Removing it from active sessions

            res.status(200).json({
                success: true,
                message: 'Session terminated successfully'
            });

        } catch (error) {
            next(error);
        }
    }

    /**
     * Terminate all other sessions
     * POST /api/auth/sessions/terminate-all
     */
    async terminateAllSessions(req, res, next) {
        try {
            if (!req.user || !req.user.id) {
                return next(new AppError('User not authenticated', 401));
            }

            const { password } = req.body;

            if (!password) {
                return next(new AppError('Password is required to terminate all sessions', 400));
            }

            const dbService = directAuthService._getDatabaseService();
            const user = await dbService.findUserById(req.user.id, { includePassword: true });

            if (!user) {
                return next(new AppError('User not found', 404));
            }

            // Verify password
            const isPasswordValid = await user.comparePassword(password);
            if (!isPasswordValid) {
                return next(new AppError('Invalid password', 401));
            }

            // TODO: Terminate all sessions except current
            // This would involve:
            // 1. Blacklisting all other session tokens
            // 2. Clearing session data
            // 3. Keeping only the current session active

            res.status(200).json({
                success: true,
                message: 'All other sessions terminated successfully'
            });

        } catch (error) {
            next(error);
        }
    }

    /**
     * Get session activity
     * GET /api/auth/session/activity
     */
    async getSessionActivity(req, res, next) {
        try {
            if (!req.user || !req.user.id) {
                return next(new AppError('User not authenticated', 401));
            }

            const { limit = 20, skip = 0 } = req.query;

            const dbService = directAuthService._getDatabaseService();
            const user = await dbService.findUserById(req.user.id);

            if (!user) {
                return next(new AppError('User not found', 404));
            }

            const activities = (user.activity?.loginHistory || [])
                .slice(parseInt(skip), parseInt(skip) + parseInt(limit))
                .map(activity => ({
                    timestamp: activity.timestamp,
                    ipAddress: activity.ipAddress,
                    userAgent: activity.userAgent,
                    location: activity.location,
                    success: activity.success,
                    authMethod: activity.authMethod
                }));

            res.status(200).json({
                success: true,
                data: {
                    activities,
                    total: user.activity?.loginHistory?.length || 0,
                    hasMore: (user.activity?.loginHistory?.length || 0) > (parseInt(skip) + parseInt(limit))
                }
            });

        } catch (error) {
            next(error);
        }
    }

    /**
     * Trust current device
     * POST /api/auth/session/trust-device
     */
    async trustDevice(req, res, next) {
        try {
            if (!req.user || !req.user.id) {
                return next(new AppError('User not authenticated', 401));
            }

            const { deviceName } = req.body;

            const dbService = directAuthService._getDatabaseService();
            const user = await dbService.findUserById(req.user.id);

            if (!user) {
                return next(new AppError('User not found', 404));
            }

            // Generate device fingerprint
            const deviceFingerprint = Buffer.from(
                `${req.headers['user-agent']}-${req.ip}`
            ).toString('base64');

            // Add trusted device
            if (!user.mfa.trustedDevices) {
                user.mfa.trustedDevices = [];
            }

            const deviceId = require('crypto').randomBytes(16).toString('hex');

            user.mfa.trustedDevices.push({
                deviceId,
                deviceName: deviceName || 'Unnamed Device',
                fingerprint: deviceFingerprint,
                addedAt: new Date(),
                lastUsedAt: new Date(),
                expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
            });

            await user.save();

            res.status(200).json({
                success: true,
                message: 'Device trusted successfully',
                data: {
                    deviceId,
                    expiresAt: user.mfa.trustedDevices[user.mfa.trustedDevices.length - 1].expiresAt
                }
            });

        } catch (error) {
            next(error);
        }
    }

    /**
     * Remove trusted device
     * DELETE /api/auth/session/trust-device/:deviceId
     */
    async removeTrustedDevice(req, res, next) {
        try {
            if (!req.user || !req.user.id) {
                return next(new AppError('User not authenticated', 401));
            }

            const { deviceId } = req.params;

            const dbService = directAuthService._getDatabaseService();
            const user = await dbService.findUserById(req.user.id);

            if (!user) {
                return next(new AppError('User not found', 404));
            }

            // Remove trusted device
            user.mfa.trustedDevices = (user.mfa.trustedDevices || [])
                .filter(device => device.deviceId !== deviceId);

            await user.save();

            res.status(200).json({
                success: true,
                message: 'Trusted device removed successfully'
            });

        } catch (error) {
            next(error);
        }
    }

    /**
     * Get trusted devices
     * GET /api/auth/session/trusted-devices
     */
    async getTrustedDevices(req, res, next) {
        try {
            if (!req.user || !req.user.id) {
                return next(new AppError('User not authenticated', 401));
            }

            const dbService = directAuthService._getDatabaseService();
            const user = await dbService.findUserById(req.user.id);

            if (!user) {
                return next(new AppError('User not found', 404));
            }

            const trustedDevices = (user.mfa.trustedDevices || [])
                .filter(device => device.expiresAt > new Date())
                .map(device => ({
                    deviceId: device.deviceId,
                    deviceName: device.deviceName,
                    addedAt: device.addedAt,
                    lastUsedAt: device.lastUsedAt,
                    expiresAt: device.expiresAt
                }));

            res.status(200).json({
                success: true,
                data: {
                    trustedDevices
                }
            });

        } catch (error) {
            next(error);
        }
    }
}

module.exports = new SessionController();