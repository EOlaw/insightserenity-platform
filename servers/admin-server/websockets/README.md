# WebSockets Directory

## Purpose
Real-time bidirectional communication for admin dashboard features including:
- Live system monitoring and health metrics
- Real-time audit log streaming
- Active session management
- Live user activity tracking
- Real-time notifications and alerts
- Multi-admin collaboration features

## Structure

```
websockets/
├── handlers/           # WebSocket event handlers
│   ├── dashboard-handler.js
│   ├── monitoring-handler.js
│   ├── audit-handler.js
│   └── session-handler.js
├── middleware/         # WebSocket middleware
│   ├── ws-auth.js     # WebSocket authentication
│   └── ws-ratelimit.js
├── services/           # WebSocket business logic
│   ├── broadcast-service.js
│   └── room-service.js
├── socket-server.js    # Main WebSocket server setup
└── README.md

## Usage

```javascript
// Import WebSocket server
const { initializeWebSocketServer } = require('./websockets/socket-server');

// Initialize with HTTP server
const wss = initializeWebSocketServer(httpServer);
```

## Events

### Dashboard Events
- `dashboard:connect` - Client connects to dashboard
- `dashboard:metrics` - Real-time system metrics
- `dashboard:alerts` - System alerts and notifications

### Audit Events
- `audit:stream` - Stream audit logs in real-time
- `audit:filter` - Apply filters to audit stream

### Session Events
- `session:active` - Active session count updates
- `session:terminated` - Session termination notifications

### Monitoring Events
- `monitoring:health` - Health check status updates
- `monitoring:performance` - Performance metrics

## Security

- JWT token authentication for WebSocket connections
- Rate limiting per connection
- IP whitelist support
- Automatic disconnect on session expiry
- Encrypted connections (WSS) in production

## Example Client Connection

```javascript
// Client-side connection
const socket = new WebSocket('wss://admin.insightserenity.com/ws');

socket.addEventListener('open', () => {
  // Authenticate
  socket.send(JSON.stringify({
    type: 'auth',
    token: 'your-jwt-token'
  }));
});

socket.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);
  console.log('Received:', data);
});
```

## Best Practices

1. Always authenticate WebSocket connections
2. Implement heartbeat/ping-pong for connection health
3. Gracefully handle disconnections and reconnections
4. Use rooms for targeted broadcasts
5. Implement backpressure handling for high-volume streams
6. Log all WebSocket events for audit trail
