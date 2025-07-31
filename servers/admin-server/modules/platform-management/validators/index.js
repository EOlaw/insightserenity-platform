'use strict';

/**
 * @fileoverview Platform management validators index
 * @module servers/admin-server/modules/platform-management/validators
 */

const platformValidators = require('./platform-validators');
const systemValidators = require('./system-validators');
const configurationValidators = require('./configuration-validators');
const maintenanceValidators = require('./maintenance-validators');

module.exports = {
  // Platform validators
  ...platformValidators,
  
  // System validators
  ...systemValidators,
  
  // Configuration validators
  ...configurationValidators,
  
  // Maintenance validators
  ...maintenanceValidators,
  
  // Common error handler
  handleValidationErrors: platformValidators.handleValidationErrors
};