/**
 * @fileoverview Sessions Module Barrel Export
 * @module servers/admin-server/modules/user-management-system/sessions
 * @description Centralized export point for the sessions module
 * @version 1.0.0
 */

'use strict';

const services = require('./services');
const controllers = require('./controllers');
const routes = require('./routes');

module.exports = {
  services,
  controllers,
  routes
};
