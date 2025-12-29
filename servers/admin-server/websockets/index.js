/**
 * @fileoverview WebSocket Module Index
 * @module servers/admin-server/websockets
 * @description Centralized export point for WebSocket server and handlers
 * @version 1.0.0
 */

'use strict';

const WebSocketServer = require('./websocket-server');
const AdminNotificationHandler = require('./admin-notification-handler');
const SessionMonitorHandler = require('./session-monitor-handler');
const AuditLogStreamHandler = require('./audit-log-stream-handler');

module.exports = {
  WebSocketServer,
  AdminNotificationHandler,
  SessionMonitorHandler,
  AuditLogStreamHandler
};
