/**
 * @fileoverview Authentication Services Barrel Export
 * @module servers/admin-server/modules/user-management-system/authentication/services
 * @description Centralized export point for all authentication-related services
 * @version 1.0.0
 */

'use strict';

const TokenService = require('./token-service');
const AuthenticationService = require('./authentication-service');
const MFAService = require('./mfa-service');

module.exports = {
  TokenService,
  AuthenticationService,
  MFAService
};
