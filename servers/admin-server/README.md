# Admin Server Configuration

This directory contains the centralized configuration management system for the InsightSerenity Admin Server.

## Directory Structure

```
/servers/admin-server/config/
├── index.js                    # Central export point for all configurations
├── server-config.js            # Server configuration manager
├── .env                        # Environment variables (not committed)
├── .env.example                # Example environment variables (committed)
├── .env.production.example     # Production environment example (committed)
└── README.md                   # This file
```

## Installation

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` with your specific configuration values.

3. For production deployment, reference `.env.production.example` for recommended settings.

## Usage

### Importing Configuration

```javascript
// Import the server configuration
const { serverConfig } = require('./config');

// Or import the ServerConfig class directly
const { ServerConfig } = require('./config');

// Access configuration values
const port = serverConfig.get('network.port');
const environment = serverConfig.get('server.environment');
const isProduction = serverConfig.isProduction();

// Check if features are enabled
const clusterEnabled = serverConfig.isFeatureEnabled('enableCluster');

// Get entire section
const sslConfig = serverConfig.getSection('ssl');
```

### Configuration Methods

| Method | Description | Example |
|--------|-------------|---------|
| `get(path, default)` | Get config value by dot-notation path | `serverConfig.get('network.port', 3000)` |
| `set(path, value)` | Set config value by path | `serverConfig.set('network.port', 3001)` |
| `isFeatureEnabled(feature)` | Check if feature flag is enabled | `serverConfig.isFeatureEnabled('trustProxy')` |
| `getAll()` | Get complete configuration object | `serverConfig.getAll()` |
| `getSection(section)` | Get specific configuration section | `serverConfig.getSection('ssl')` |
| `isProduction()` | Check if running in production | `serverConfig.isProduction()` |
| `isDevelopment()` | Check if running in development | `serverConfig.isDevelopment()` |
| `exportToFile(path)` | Export config to JSON file | `serverConfig.exportToFile('./config.json')` |

### Integration with Server

The configuration is automatically loaded and validated when the server starts. The `server.js` file uses this configuration:

```javascript
const { ServerConfig } = require('./config/server-config');

class AdminServer extends EventEmitter {
    constructor() {
        super();
        this.config = new ServerConfig();
        // Configuration is now loaded and validated
    }
}
```

## Configuration Sections

### Server Identity
- `server.name` - Server name
- `server.version` - Server version
- `server.environment` - NODE_ENV value
- `server.instanceId` - Unique instance identifier

### Network
- `network.host` - Bind address
- `network.port` - Listen port
- `network.backlog` - Connection backlog

### SSL/TLS
- `ssl.enabled` - Enable HTTPS
- `ssl.keyPath` - Path to private key
- `ssl.certPath` - Path to certificate
- `ssl.minVersion` - Minimum TLS version

### Cluster
- `cluster.enabled` - Enable clustering
- `cluster.workers` - Number of worker processes
- `cluster.maxRespawns` - Maximum worker respawns

### Timeouts
- `timeouts.server` - Overall server timeout
- `timeouts.keepAlive` - Keep-alive timeout
- `timeouts.shutdown` - Graceful shutdown timeout

### Database
- `database.enabled` - Enable database
- `database.retryAttempts` - Connection retry attempts
- `database.poolSize` - Connection pool size

### Health Monitoring
- `health.enabled` - Enable health monitoring
- `health.checkInterval` - Health check interval
- `health.memoryThreshold` - Memory usage threshold

### Metrics
- `metrics.enabled` - Enable metrics collection
- `metrics.collectInterval` - Collection interval
- `metrics.prometheusEnabled` - Enable Prometheus export

### Logging
- `logging.level` - Log level
- `logging.format` - Log format (json/text)
- `logging.slowRequestThreshold` - Slow request threshold

### Features
- `features.trustProxy` - Trust reverse proxy
- `features.enableCors` - Enable CORS
- `features.enableHelmet` - Enable Helmet security
- `features.enableRateLimit` - Enable rate limiting

## Environment Variables

All configuration values can be overridden via environment variables. The `.env.example` file contains the complete list of available variables with their default values.

### Key Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | development | Environment mode |
| `ADMIN_PORT` | 3000 | Server port |
| `ENABLE_CLUSTER` | false | Enable clustering |
| `WORKER_COUNT` | CPU cores | Number of workers |
| `SSL_ENABLED` | false | Enable HTTPS |
| `LOG_LEVEL` | info | Logging level |
| `HEALTH_MONITORING` | true | Enable health checks |
| `METRICS_ENABLED` | false | Enable metrics |

## Validation

Configuration is automatically validated on load. The following checks are performed:

1. Port number is valid (0-65535)
2. Worker count is within allowed range
3. SSL certificate files exist if SSL is enabled
4. Thresholds are within valid ranges
5. Timeout values are consistent

If validation fails, the server will not start and will log the validation errors.

## Production Deployment

For production deployment, ensure these settings:

```bash
NODE_ENV=production
SSL_ENABLED=true
ENABLE_CLUSTER=true
LOG_LEVEL=warn
COOKIE_SECURE=true
TRUST_PROXY=true
METRICS_ENABLED=true
ENABLE_AUDIT_LOG=true
HEALTH_MONITORING=true
```

## Security Considerations

1. **Never commit `.env` files** - They contain sensitive data
2. **Use strong secrets** - Generate secure values for JWT_SECRET, COOKIE_SECRET, etc.
3. **Enable SSL in production** - Always use HTTPS
4. **Set appropriate CORS origins** - Restrict to your domains
5. **Enable rate limiting** - Protect against abuse
6. **Enable audit logging** - Track all administrative actions

## Extending Configuration

To add new configuration sections:

1. Add the section in `server-config.js` under `loadConfiguration()`
2. Add validation rules in `validateConfiguration()` if needed
3. Add corresponding environment variables in `.env.example`
4. Document the new section in this README

Example:

```javascript
// In loadConfiguration()
newFeature: {
    enabled: process.env.NEW_FEATURE_ENABLED === 'true',
    setting: process.env.NEW_FEATURE_SETTING || 'default'
}

// In validateConfiguration()
if (this.config.newFeature.enabled && !this.config.newFeature.setting) {
    errors.push('NEW_FEATURE_SETTING is required when NEW_FEATURE_ENABLED is true');
}
```

## Troubleshooting

### Configuration Not Loading
- Ensure `.env` file is in the correct directory
- Check that `dotenv` is properly configured
- Verify file permissions

### Validation Errors
- Check the error message for specific validation failures
- Ensure all required files exist (SSL certificates, etc.)
- Verify threshold values are within valid ranges

### Environment Variables Not Working
- Ensure variable names match exactly (case-sensitive)
- Check for trailing spaces in `.env` file
- Restart the server after changing `.env`

## Related Documentation

- [Express Application Configuration](./app.js)
- [Server Entry Point](../server.js)
- [Shared Database Configuration](../../shared/lib/database)