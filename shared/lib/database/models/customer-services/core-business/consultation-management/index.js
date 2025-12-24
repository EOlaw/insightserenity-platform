'use strict';

/**
 * @fileoverview Consultation Management Models Index
 * @module shared/lib/database/models/customer-services/core-business/consultation-management
 * @description Exports all consultation management models
 */

const consultationModel = require('./consultation-model');

module.exports = {
    // Consultation Model
    Consultation: consultationModel.Consultation,
    consultationSchema: consultationModel.consultationSchema,
    createConsultationModel: consultationModel.createModel,

    // Schema collection for ConnectionManager registration
    schemas: {
        Consultation: consultationModel
    }
};
