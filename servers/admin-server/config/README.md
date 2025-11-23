# Admin Server Configuration

Centralized configuration management for InsightSerenity Admin Server.

## Setup

1. Copy `.env.example` to `.env` in the admin-server root directory
2. Configure your environment-specific values in `.env`
3. The configuration system will automatically load and validate on server start

## Usage
```javascript
const { ServerConfig } = require('./config');
const config = new ServerConfig();

// Access configuration
const port = config.get('network.port');
const isProduction = config.isProduction();
```

## Configuration Sections

- **server**: Identity and environment
- **network**: Host, port, and network settings
- **ssl**: TLS/SSL configuration
- **cluster**: Clustering and worker management
- **database**: MongoDB connection settings
- **health**: Health monitoring thresholds
- **logging**: Logging configuration

See `.env.example` for all available options.