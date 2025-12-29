/**
 * @fileoverview User Management System Module Barrel Export
 * @module servers/admin-server/modules/user-management-system
 * @description Centralized export point for the user management system module
 * @version 1.0.0
 */

'use strict';

const authentication = require('./authentication');
const sessions = require('./sessions');
const users = require('./users');

module.exports = {
  authentication,
  sessions,
  users
};
