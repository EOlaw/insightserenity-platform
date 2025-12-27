/**
 * @fileoverview Notification Management Service - In-App Notification Database Operations
 * @module servers/customer-services/modules/core-business/notifications/services/notification-management-service
 * @description Service for managing in-app notifications with database persistence
 * @version 1.0.0
 */

const mongoose = require('mongoose');
const logger = require('../../../../../../shared/lib/utils/logger').createLogger({
    serviceName: 'notification-management-service'
});
const { AppError } = require('../../../../../../shared/lib/utils/app-error');

// Import and register Notification model
const NotificationModel = require('../../../../../../shared/lib/database/models/customer-services/core-business/notification-management/notification-model');

/**
 * Notification Management Service Class
 * Handles all database operations for in-app notifications
 */
class NotificationManagementService {
    constructor() {
        this.Notification = null;
        this._initializeModel();
    }

    /**
     * Initialize Notification model
     * @private
     */
    _initializeModel() {
        try {
            // Use the imported Notification model
            this.Notification = NotificationModel.Notification;

            if (!this.Notification) {
                throw new Error('Notification model is undefined');
            }

            logger.info('Notification model initialized successfully', {
                modelName: this.Notification.modelName
            });
        } catch (error) {
            logger.error('Failed to initialize Notification model', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Get notifications for a user
     * @param {string} userId - User ID
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Notifications with metadata
     */
    async getUserNotifications(userId, options = {}) {
        try {
            if (!userId) {
                throw new AppError('User ID is required', 400, 'MISSING_USER_ID');
            }

            if (!this.Notification) {
                throw new AppError('Notification model not initialized', 500, 'MODEL_NOT_INITIALIZED');
            }

            const {
                limit = 10,
                skip = 0,
                unreadOnly = false,
                type = null,
                priority = null
            } = options;

            logger.debug('Getting user notifications', {
                userId,
                limit,
                skip,
                unreadOnly
            });

            // Convert userId to ObjectId if it's a string
            const userObjectId = mongoose.Types.ObjectId.isValid(userId)
                ? new mongoose.Types.ObjectId(userId)
                : userId;

            const result = await this.Notification.getByUserId(userObjectId, {
                limit: parseInt(limit),
                skip: parseInt(skip),
                unreadOnly,
                type,
                priority
            });

            logger.info('User notifications retrieved successfully', {
                userId,
                count: result.notifications.length,
                unreadCount: result.unreadCount
            });

            return result;

        } catch (error) {
            logger.error('Failed to get user notifications', {
                userId,
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Get unread notification count for user
     * @param {string} userId - User ID
     * @returns {Promise<number>} Unread count
     */
    async getUnreadCount(userId) {
        try {
            if (!userId) {
                throw new AppError('User ID is required', 400, 'MISSING_USER_ID');
            }

            if (!this.Notification) {
                throw new AppError('Notification model not initialized', 500, 'MODEL_NOT_INITIALIZED');
            }

            const count = await this.Notification.getUnreadCount(userId);

            logger.debug('Unread count retrieved', {
                userId,
                count
            });

            return count;

        } catch (error) {
            logger.error('Failed to get unread count', {
                userId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Create a new notification
     * @param {Object} notificationData - Notification data
     * @returns {Promise<Object>} Created notification
     */
    async createNotification(notificationData) {
        try {
            if (!this.Notification) {
                throw new AppError('Notification model not initialized', 500, 'MODEL_NOT_INITIALIZED');
            }

            const { userId, userRole, title, message, type } = notificationData;

            // Validate required fields
            if (!userId) {
                throw new AppError('User ID is required', 400, 'MISSING_USER_ID');
            }

            if (!userRole) {
                throw new AppError('User role is required', 400, 'MISSING_USER_ROLE');
            }

            if (!title || !message) {
                throw new AppError('Title and message are required', 400, 'MISSING_CONTENT');
            }

            if (!type) {
                throw new AppError('Notification type is required', 400, 'MISSING_TYPE');
            }

            logger.debug('Creating notification', {
                userId,
                userRole,
                type
            });

            const notification = await this.Notification.createForUser(
                userId,
                userRole,
                notificationData
            );

            logger.info('Notification created successfully', {
                notificationId: notification._id,
                userId,
                type
            });

            return notification;

        } catch (error) {
            logger.error('Failed to create notification', {
                error: error.message,
                stack: error.stack,
                notificationData
            });
            throw error;
        }
    }

    /**
     * Create bulk notifications for multiple users
     * @param {Array<Object>} notifications - Array of notification data
     * @returns {Promise<Array>} Created notifications
     */
    async createBulkNotifications(notifications) {
        try {
            if (!this.Notification) {
                throw new AppError('Notification model not initialized', 500, 'MODEL_NOT_INITIALIZED');
            }

            if (!Array.isArray(notifications) || notifications.length === 0) {
                throw new AppError('Notifications array is required', 400, 'INVALID_INPUT');
            }

            logger.debug('Creating bulk notifications', {
                count: notifications.length
            });

            const results = await this.Notification.createBulk(notifications);

            logger.info('Bulk notifications created successfully', {
                count: results.length
            });

            return results;

        } catch (error) {
            logger.error('Failed to create bulk notifications', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Get a single notification by ID
     * @param {string} notificationId - Notification ID
     * @param {string} userId - User ID (for authorization)
     * @returns {Promise<Object>} Notification
     */
    async getNotificationById(notificationId, userId) {
        try {
            if (!notificationId) {
                throw new AppError('Notification ID is required', 400, 'MISSING_NOTIFICATION_ID');
            }

            if (!userId) {
                throw new AppError('User ID is required', 400, 'MISSING_USER_ID');
            }

            if (!this.Notification) {
                throw new AppError('Notification model not initialized', 500, 'MODEL_NOT_INITIALIZED');
            }

            const notification = await this.Notification.findOne({
                _id: notificationId,
                userId: userId,
                status: { $ne: 'deleted' }
            }).populate('sender.userId', 'profile.firstName profile.lastName profile.avatar');

            if (!notification) {
                throw new AppError('Notification not found', 404, 'NOTIFICATION_NOT_FOUND');
            }

            logger.debug('Notification retrieved', {
                notificationId,
                userId
            });

            return notification;

        } catch (error) {
            logger.error('Failed to get notification', {
                notificationId,
                userId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Mark notification as read
     * @param {string} notificationId - Notification ID
     * @param {string} userId - User ID (for authorization)
     * @returns {Promise<Object>} Updated notification
     */
    async markAsRead(notificationId, userId) {
        try {
            const notification = await this.getNotificationById(notificationId, userId);

            await notification.markAsRead();

            logger.info('Notification marked as read', {
                notificationId,
                userId
            });

            return notification;

        } catch (error) {
            logger.error('Failed to mark notification as read', {
                notificationId,
                userId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Mark notification as unread
     * @param {string} notificationId - Notification ID
     * @param {string} userId - User ID (for authorization)
     * @returns {Promise<Object>} Updated notification
     */
    async markAsUnread(notificationId, userId) {
        try {
            const notification = await this.getNotificationById(notificationId, userId);

            await notification.markAsUnread();

            logger.info('Notification marked as unread', {
                notificationId,
                userId
            });

            return notification;

        } catch (error) {
            logger.error('Failed to mark notification as unread', {
                notificationId,
                userId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Mark all notifications as read for a user
     * @param {string} userId - User ID
     * @returns {Promise<Object>} Update result
     */
    async markAllAsRead(userId) {
        try {
            if (!userId) {
                throw new AppError('User ID is required', 400, 'MISSING_USER_ID');
            }

            if (!this.Notification) {
                throw new AppError('Notification model not initialized', 500, 'MODEL_NOT_INITIALIZED');
            }

            const result = await this.Notification.markAllAsRead(userId);

            logger.info('All notifications marked as read', {
                userId,
                modifiedCount: result.modifiedCount
            });

            return {
                success: true,
                modifiedCount: result.modifiedCount
            };

        } catch (error) {
            logger.error('Failed to mark all as read', {
                userId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Archive notification
     * @param {string} notificationId - Notification ID
     * @param {string} userId - User ID (for authorization)
     * @returns {Promise<Object>} Updated notification
     */
    async archiveNotification(notificationId, userId) {
        try {
            const notification = await this.getNotificationById(notificationId, userId);

            await notification.archive();

            logger.info('Notification archived', {
                notificationId,
                userId
            });

            return notification;

        } catch (error) {
            logger.error('Failed to archive notification', {
                notificationId,
                userId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Delete notification (soft delete)
     * @param {string} notificationId - Notification ID
     * @param {string} userId - User ID (for authorization)
     * @returns {Promise<Object>} Deleted notification
     */
    async deleteNotification(notificationId, userId) {
        try {
            const notification = await this.getNotificationById(notificationId, userId);

            await notification.softDelete();

            logger.info('Notification deleted', {
                notificationId,
                userId
            });

            return notification;

        } catch (error) {
            logger.error('Failed to delete notification', {
                notificationId,
                userId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Get notification statistics for user
     * @param {string} userId - User ID
     * @returns {Promise<Object>} Statistics
     */
    async getStats(userId) {
        try {
            if (!userId) {
                throw new AppError('User ID is required', 400, 'MISSING_USER_ID');
            }

            if (!this.Notification) {
                throw new AppError('Notification model not initialized', 500, 'MODEL_NOT_INITIALIZED');
            }

            const stats = await this.Notification.getStats(userId);

            logger.debug('Notification stats retrieved', {
                userId
            });

            return stats;

        } catch (error) {
            logger.error('Failed to get notification stats', {
                userId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Cleanup old notifications
     * @param {number} daysOld - Days old threshold
     * @returns {Promise<Object>} Deletion result
     */
    async cleanupOld(daysOld = 30) {
        try {
            if (!this.Notification) {
                throw new AppError('Notification model not initialized', 500, 'MODEL_NOT_INITIALIZED');
            }

            const result = await this.Notification.cleanupOld(daysOld);

            logger.info('Old notifications cleaned up', {
                daysOld,
                deletedCount: result.deletedCount
            });

            return {
                success: true,
                deletedCount: result.deletedCount
            };

        } catch (error) {
            logger.error('Failed to cleanup old notifications', {
                daysOld,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Cleanup expired notifications
     * @returns {Promise<Object>} Deletion result
     */
    async cleanupExpired() {
        try {
            if (!this.Notification) {
                throw new AppError('Notification model not initialized', 500, 'MODEL_NOT_INITIALIZED');
            }

            const result = await this.Notification.cleanupExpired();

            logger.info('Expired notifications cleaned up', {
                deletedCount: result.deletedCount
            });

            return {
                success: true,
                deletedCount: result.deletedCount
            };

        } catch (error) {
            logger.error('Failed to cleanup expired notifications', {
                error: error.message
            });
            throw error;
        }
    }
}

// Export singleton instance
module.exports = new NotificationManagementService();
