/**
 * @fileoverview Authentication Module Barrel Export
 * @module servers/admin-server/modules/user-management-system/authentication
 * @description Centralized export point for the authentication module
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
