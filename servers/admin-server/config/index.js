/**
 * @fileoverview Configuration Index
 * @module servers/admin-server/config
 * @description Central export point for all server configurations
 * @version 2.0.0
 */

'use strict';

const serverConfig = require('./server-config');

module.exports = {
    serverConfig,
    ServerConfig: serverConfig.ServerConfig
};