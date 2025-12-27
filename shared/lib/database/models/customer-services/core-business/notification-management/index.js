'use strict';

/**
 * @fileoverview Notification Management Models Index
 * @module shared/lib/database/models/customer-services/core-business/notification-management
 * @description Exports all notification management models
 */

const notificationModel = require('./notification-model');

module.exports = {
    // Notification Model
    Notification: notificationModel.Notification,
    notificationSchema: notificationModel.notificationSchema,
    createNotificationModel: notificationModel.createModel,

    // Schema collection for ConnectionManager registration
    schemas: {
        Notification: notificationModel
    }
};
