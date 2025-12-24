/**
 * @fileoverview Consultation Management Routes Index
 * @module servers/customer-services/modules/core-business/consultation-management/routes
 * @description Exports all consultation management routes
 */

const express = require('express');
const router = express.Router();

const consultationRoutes = require('./consultation-routes');

// Mount consultation routes
router.use('/consultations', consultationRoutes);

module.exports = router;
