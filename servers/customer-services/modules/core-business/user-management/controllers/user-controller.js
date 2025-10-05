/**
 * @fileoverview User Controller
 * @module servers/customer-services/modules/core-business/user-management/controllers/user
 */

// Use simplified service to avoid connection issues
const userService = require('../services/user-service');
const { validationResult } = require('express-validator');
const { AppError } = require('../../../../../../shared/lib/utils/app-error');

class UserController {
    /**
     * Create user
     * POST /api/users
     */
    async createUser(req, res, next) {
        try {
            // Validate request
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return next(AppError.validation('Validation failed', errors.array()));
            }

            const { tenantId } = req;
            const createdBy = req.user?.id;

            const user = await userService.createUser(req.body, tenantId, createdBy);

            res.status(201).json({
                success: true,
                data: user,
                message: 'User created successfully'
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Get all users
     * GET /api/users
     */
    async getUsers(req, res, next) {
        try {
            const { tenantId } = req;
            const options = {
                page: parseInt(req.query.page) || 1,
                limit: parseInt(req.query.limit) || 20,
                sort: req.query.sort || '-createdAt',
                filter: {}
            };

            // Add filters
            if (req.query.role) {
                options.filter.role = req.query.role;
            }
            if (req.query.status) {
                options.filter.status = req.query.status;
            }
            if (req.query.department) {
                options.filter['professional.department'] = req.query.department;
            }

            const result = await userService.getUsers(tenantId, options);

            res.json({
                success: true,
                data: result.users,
                meta: result.pagination
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Get user by ID
     * GET /api/users/:id
     */
    async getUserById(req, res, next) {
        try {
            const { tenantId } = req;
            const { id } = req.params;

            const user = await userService.getUserById(id, tenantId);

            res.json({
                success: true,
                data: user
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Get current user
     * GET /api/users/me
     */
    async getCurrentUser(req, res, next) {
        try {
            const { tenantId } = req;
            const userId = req.user?.id;

            if (!userId) {
                return next(AppError.unauthorized('User not authenticated'));
            }

            const user = await userService.getUserById(userId, tenantId);

            res.json({
                success: true,
                data: user
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Update user
     * PUT /api/users/:id
     */
    async updateUser(req, res, next) {
        try {
            // Validate request
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return next(AppError.validation('Validation failed', errors.array()));
            }

            const { tenantId } = req;
            const { id } = req.params;
            const updatedBy = req.user?.id;

            const user = await userService.updateUser(id, req.body, tenantId, updatedBy);

            res.json({
                success: true,
                data: user,
                message: 'User updated successfully'
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Update current user
     * PUT /api/users/me
     */
    async updateCurrentUser(req, res, next) {
        try {
            const { tenantId } = req;
            const userId = req.user?.id;

            if (!userId) {
                return next(AppError.unauthorized('User not authenticated'));
            }

            const user = await userService.updateUser(userId, req.body, tenantId, userId);

            res.json({
                success: true,
                data: user,
                message: 'Profile updated successfully'
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Delete user
     * DELETE /api/users/:id
     */
    async deleteUser(req, res, next) {
        try {
            const { tenantId } = req;
            const { id } = req.params;
            const deletedBy = req.user?.id;

            const result = await userService.deleteUser(id, tenantId, deletedBy);

            res.json({
                success: true,
                message: result.message
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Search users
     * GET /api/users/search
     */
    async searchUsers(req, res, next) {
        try {
            const { tenantId } = req;
            const { q } = req.query;

            if (!q) {
                return res.json({
                    success: true,
                    data: []
                });
            }

            const options = {
                limit: parseInt(req.query.limit) || 10
            };

            const users = await userService.searchUsers(tenantId, q, options);

            res.json({
                success: true,
                data: users
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Change password
     * POST /api/users/change-password
     */
    async changePassword(req, res, next) {
        try {
            const { tenantId } = req;
            const userId = req.user?.id;
            const { oldPassword, newPassword } = req.body;

            if (!userId) {
                return next(AppError.unauthorized('User not authenticated'));
            }

            const result = await userService.changePassword(
                userId,
                oldPassword,
                newPassword,
                tenantId
            );

            res.json({
                success: true,
                message: result.message
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Get user statistics
     * GET /api/users/statistics
     */
    async getUserStatistics(req, res, next) {
        try {
            const { tenantId } = req;

            const stats = await userService.getUserStatistics(tenantId);

            res.json({
                success: true,
                data: stats
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Upload avatar
     * POST /api/users/:id/avatar
     */
    async uploadAvatar(req, res, next) {
        try {
            const { tenantId } = req;
            const { id } = req.params;

            if (!req.file) {
                return next(AppError.validation('No file uploaded'));
            }

            // TODO: Upload file to storage (S3, etc.)
            const avatarUrl = `/uploads/avatars/${req.file.filename}`;

            const user = await userService.updateUser(
                id,
                { 'profile.avatar.url': avatarUrl },
                tenantId,
                req.user?.id
            );

            res.json({
                success: true,
                data: {
                    avatarUrl: user.profile.avatar.url
                },
                message: 'Avatar uploaded successfully'
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Bulk create users
     * POST /api/users/bulk
     */
    async bulkCreateUsers(req, res, next) {
        try {
            const { tenantId } = req;
            const { users } = req.body;

            if (!Array.isArray(users) || users.length === 0) {
                return next(AppError.validation('Invalid users data'));
            }

            const results = {
                success: [],
                failed: []
            };

            for (const userData of users) {
                try {
                    const user = await userService.createUser(
                        userData,
                        tenantId,
                        req.user?.id
                    );
                    results.success.push({
                        email: user.email,
                        id: user._id
                    });
                } catch (error) {
                    results.failed.push({
                        email: userData.email,
                        error: error.message
                    });
                }
            }

            res.json({
                success: true,
                data: results,
                message: `Created ${results.success.length} users, ${results.failed.length} failed`
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Export users
     * GET /api/users/export
     */
    async exportUsers(req, res, next) {
        try {
            const { tenantId } = req;
            const { format = 'csv' } = req.query;

            const result = await userService.getUsers(tenantId, {
                limit: 10000 // Max export limit
            });

            if (format === 'csv') {
                // TODO: Convert to CSV
                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', 'attachment; filename=users.csv');
                // res.send(csvData);
            } else if (format === 'json') {
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Content-Disposition', 'attachment; filename=users.json');
                res.send(JSON.stringify(result.users, null, 2));
            }
        } catch (error) {
            next(error);
        }
    }
}

module.exports = new UserController();
