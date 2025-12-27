/**
 * @fileoverview Notification Controller - REST API Endpoints
 * @module servers/customer-services/modules/core-business/notifications/controllers/notification-controller
 * @description Controller for managing in-app notifications via REST API
 * @version 1.0.0
 */

const notificationService = require('../services/notification-management-service');
const logger = require('../../../../../../shared/lib/utils/logger').createLogger({
    serviceName: 'notification-controller'
});
const { AppError } = require('../../../../../../shared/lib/utils/app-error');

/**
 * Notification Controller Class
 * Handles HTTP requests for notification management
 */
class NotificationController {
    /**
     * Get user's notifications
     * GET /api/notifications/me
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async getMyNotifications(req, res, next) {
        try {
            const userId = req.user?.id || req.user?._id;

            if (!userId) {
                throw new AppError('User not authenticated', 401, 'UNAUTHORIZED');
            }

            const { limit, skip, unreadOnly, type, priority } = req.query;

            const options = {
                limit: limit ? parseInt(limit) : 10,
                skip: skip ? parseInt(skip) : 0,
                unreadOnly: unreadOnly === 'true',
                type: type || null,
                priority: priority || null
            };

            const result = await notificationService.getUserNotifications(userId, options);

            logger.info('User notifications retrieved', {
                userId,
                count: result.notifications.length
            });

            res.status(200).json({
                success: true,
                data: result
            });

        } catch (error) {
            logger.error('Failed to get user notifications', {
                error: error.message,
                stack: error.stack,
                userId: req.user?.id
            });
            next(error);
        }
    }

    /**
     * Get unread count
     * GET /api/notifications/me/unread-count
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async getUnreadCount(req, res, next) {
        try {
            const userId = req.user?.id || req.user?._id;

            if (!userId) {
                throw new AppError('User not authenticated', 401, 'UNAUTHORIZED');
            }

            const count = await notificationService.getUnreadCount(userId);

            res.status(200).json({
                success: true,
                data: {
                    unreadCount: count
                }
            });

        } catch (error) {
            logger.error('Failed to get unread count', {
                error: error.message,
                userId: req.user?.id
            });
            next(error);
        }
    }

    /**
     * Get single notification
     * GET /api/notifications/:id
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async getNotification(req, res, next) {
        try {
            const userId = req.user?.id || req.user?._id;
            const { id } = req.params;

            if (!userId) {
                throw new AppError('User not authenticated', 401, 'UNAUTHORIZED');
            }

            const notification = await notificationService.getNotificationById(id, userId);

            res.status(200).json({
                success: true,
                data: {
                    notification
                }
            });

        } catch (error) {
            logger.error('Failed to get notification', {
                error: error.message,
                notificationId: req.params.id
            });
            next(error);
        }
    }

    /**
     * Create notification (admin only)
     * POST /api/notifications
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async createNotification(req, res, next) {
        try {
            const notification = await notificationService.createNotification(req.body);

            logger.info('Notification created', {
                notificationId: notification._id,
                userId: req.body.userId
            });

            res.status(201).json({
                success: true,
                data: {
                    notification
                }
            });

        } catch (error) {
            logger.error('Failed to create notification', {
                error: error.message
            });
            next(error);
        }
    }

    /**
     * Mark notification as read
     * PUT /api/notifications/:id/read
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async markAsRead(req, res, next) {
        try {
            const userId = req.user?.id || req.user?._id;
            const { id } = req.params;

            if (!userId) {
                throw new AppError('User not authenticated', 401, 'UNAUTHORIZED');
            }

            const notification = await notificationService.markAsRead(id, userId);

            logger.info('Notification marked as read', {
                notificationId: id,
                userId
            });

            res.status(200).json({
                success: true,
                data: {
                    notification
                }
            });

        } catch (error) {
            logger.error('Failed to mark notification as read', {
                error: error.message,
                notificationId: req.params.id
            });
            next(error);
        }
    }

    /**
     * Mark notification as unread
     * PUT /api/notifications/:id/unread
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async markAsUnread(req, res, next) {
        try {
            const userId = req.user?.id || req.user?._id;
            const { id } = req.params;

            if (!userId) {
                throw new AppError('User not authenticated', 401, 'UNAUTHORIZED');
            }

            const notification = await notificationService.markAsUnread(id, userId);

            logger.info('Notification marked as unread', {
                notificationId: id,
                userId
            });

            res.status(200).json({
                success: true,
                data: {
                    notification
                }
            });

        } catch (error) {
            logger.error('Failed to mark notification as unread', {
                error: error.message,
                notificationId: req.params.id
            });
            next(error);
        }
    }

    /**
     * Mark all notifications as read
     * PUT /api/notifications/mark-all-read
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async markAllAsRead(req, res, next) {
        try {
            const userId = req.user?.id || req.user?._id;

            if (!userId) {
                throw new AppError('User not authenticated', 401, 'UNAUTHORIZED');
            }

            const result = await notificationService.markAllAsRead(userId);

            logger.info('All notifications marked as read', {
                userId,
                modifiedCount: result.modifiedCount
            });

            res.status(200).json({
                success: true,
                data: result
            });

        } catch (error) {
            logger.error('Failed to mark all as read', {
                error: error.message,
                userId: req.user?.id
            });
            next(error);
        }
    }

    /**
     * Archive notification
     * PUT /api/notifications/:id/archive
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async archiveNotification(req, res, next) {
        try {
            const userId = req.user?.id || req.user?._id;
            const { id } = req.params;

            if (!userId) {
                throw new AppError('User not authenticated', 401, 'UNAUTHORIZED');
            }

            const notification = await notificationService.archiveNotification(id, userId);

            logger.info('Notification archived', {
                notificationId: id,
                userId
            });

            res.status(200).json({
                success: true,
                data: {
                    notification
                }
            });

        } catch (error) {
            logger.error('Failed to archive notification', {
                error: error.message,
                notificationId: req.params.id
            });
            next(error);
        }
    }

    /**
     * Delete notification
     * DELETE /api/notifications/:id
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async deleteNotification(req, res, next) {
        try {
            const userId = req.user?.id || req.user?._id;
            const { id } = req.params;

            if (!userId) {
                throw new AppError('User not authenticated', 401, 'UNAUTHORIZED');
            }

            const notification = await notificationService.deleteNotification(id, userId);

            logger.info('Notification deleted', {
                notificationId: id,
                userId
            });

            res.status(200).json({
                success: true,
                data: {
                    notification
                }
            });

        } catch (error) {
            logger.error('Failed to delete notification', {
                error: error.message,
                notificationId: req.params.id
            });
            next(error);
        }
    }

    /**
     * Get notification statistics
     * GET /api/notifications/me/stats
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware
     */
    async getStats(req, res, next) {
        try {
            const userId = req.user?.id || req.user?._id;

            if (!userId) {
                throw new AppError('User not authenticated', 401, 'UNAUTHORIZED');
            }

            const stats = await notificationService.getStats(userId);

            res.status(200).json({
                success: true,
                data: stats
            });

        } catch (error) {
            logger.error('Failed to get notification stats', {
                error: error.message,
                userId: req.user?.id
            });
            next(error);
        }
    }
}

// Export controller instance
module.exports = new NotificationController();
