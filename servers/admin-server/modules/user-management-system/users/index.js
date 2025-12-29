/**
 * @fileoverview Users Module Barrel Export
 * @module servers/admin-server/modules/user-management-system/users
 * @description Centralized export point for the users module
 * @version 1.0.0
 */

'use strict';

const controllers = require('./controllers');
const routes = require('./routes');

module.exports = {
  controllers,
  routes
};
