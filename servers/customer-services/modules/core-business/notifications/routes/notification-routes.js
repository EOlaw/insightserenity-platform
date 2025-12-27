/**
 * @fileoverview Notification Routes - REST API Endpoints
 * @module servers/customer-services/modules/core-business/notifications/routes/notification-routes
 * @description Routes for managing in-app notifications
 * @version 1.0.0
 */

const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notification-controller');
// const { authenticate } = require('../../../../../../shared/lib/auth/middleware/authenticate');
const { authenticate } = require('../../../../middleware/auth-middleware');

/**
 * All notification routes require authentication
 * Note: authenticate is a factory function that returns middleware
 * Disable optional features for simpler universal auth
 */
// router.use(authenticate({
//     validateSession: false,
//     validateIP: false,
//     validateUserAgent: false,
//     validateFingerprint: false
// }));

router.use(authenticate)

/**
 * @route GET /api/notifications/me
 * @desc Get current user's notifications
 * @access Private (requires authentication)
 * @query {number} limit - Number of notifications to return (default: 10)
 * @query {number} skip - Number of notifications to skip (default: 0)
 * @query {boolean} unreadOnly - Return only unread notifications (default: false)
 * @query {string} type - Filter by notification type
 * @query {string} priority - Filter by priority level
 */
router.get('/me', notificationController.getMyNotifications.bind(notificationController));

/**
 * @route GET /api/notifications/me/unread-count
 * @desc Get unread notification count for current user
 * @access Private (requires authentication)
 */
router.get('/me/unread-count', notificationController.getUnreadCount.bind(notificationController));

/**
 * @route GET /api/notifications/me/stats
 * @desc Get notification statistics for current user
 * @access Private (requires authentication)
 */
router.get('/me/stats', notificationController.getStats.bind(notificationController));

/**
 * @route PUT /api/notifications/mark-all-read
 * @desc Mark all notifications as read for current user
 * @access Private (requires authentication)
 */
router.put('/mark-all-read', notificationController.markAllAsRead.bind(notificationController));

/**
 * @route GET /api/notifications/:id
 * @desc Get single notification by ID
 * @access Private (requires authentication & ownership)
 */
router.get('/:id', notificationController.getNotification.bind(notificationController));

/**
 * @route PUT /api/notifications/:id/read
 * @desc Mark notification as read
 * @access Private (requires authentication & ownership)
 */
router.put('/:id/read', notificationController.markAsRead.bind(notificationController));

/**
 * @route PUT /api/notifications/:id/unread
 * @desc Mark notification as unread
 * @access Private (requires authentication & ownership)
 */
router.put('/:id/unread', notificationController.markAsUnread.bind(notificationController));

/**
 * @route PUT /api/notifications/:id/archive
 * @desc Archive notification
 * @access Private (requires authentication & ownership)
 */
router.put('/:id/archive', notificationController.archiveNotification.bind(notificationController));

/**
 * @route DELETE /api/notifications/:id
 * @desc Delete notification
 * @access Private (requires authentication & ownership)
 */
router.delete('/:id', notificationController.deleteNotification.bind(notificationController));

/**
 * @route POST /api/notifications
 * @desc Create notification (admin only)
 * @access Private (requires authentication & admin role)
 */
router.post('/', notificationController.createNotification.bind(notificationController));

module.exports = router;
