'use strict';

/**
 * @fileoverview Billing Management Models Index
 * @module shared/lib/database/models/customer-services/core-business/billing-management
 * @description Exports all billing and payment management models
 */

const billingModel = require('./billing-model');

module.exports = {
    // Billing Model
    Billing: billingModel.Billing,
    billingSchema: billingModel.billingSchema,
    createBillingModel: billingModel.createModel,

    // Schema collection for ConnectionManager registration
    schemas: {
        Billing: billingModel
    }
};
