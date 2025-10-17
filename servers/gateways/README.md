# API Gateway Server

## 🌐 Overview

The API Gateway Server is the central entry point for all client requests to the InsightSerenity platform. It provides request routing, load balancing, circuit breaking, rate limiting, caching, and other cross-cutting concerns.

## 🚀 Features

### Core Features
- **Request Routing**: Routes requests to appropriate backend services
- **Load Balancing**: Distributes requests across multiple service instances
- **Circuit Breaker**: Prevents cascading failures
- **Rate Limiting**: Protects against abuse and DDoS attacks
- **Response Caching**: Improves performance for frequently accessed data
- **Authentication & Authorization**: Validates JWT tokens and API keys
- **Request/Response Transformation**: Modifies headers and payloads
- **Metrics Collection**: Tracks performance and usage statistics
- **Health Monitoring**: Monitors backend service health

### Advanced Features
- **Service Discovery**: Dynamic service registration and discovery
- **Request Correlation**: Tracks requests across services
- **WebSocket Support**: Proxies WebSocket connections
- **Compression**: Reduces bandwidth usage
- **Security Headers**: Adds security headers via Helmet
- **CORS Support**: Configurable cross-origin resource sharing

## 📁 Project Structure

```
servers/gateway/
├── config/               # Configuration files
│   ├── gateway-config.js    # Gateway settings
│   ├── routing-config.js    # Route definitions
│   └── security-config.js   # Security settings
├── middleware/          # Express middleware
│   ├── authentication.js    # Auth middleware
│   ├── rate-limit.js        # Rate limiting
│   ├── cache.js            # Response caching
│   ├── validation.js       # Request validation
│   └── ...
├── utils/              # Utility modules
│   ├── circuit-breaker.js   # Circuit breaker implementation
│   ├── load-balancer.js     # Load balancer implementation
│   ├── service-registry.js  # Service registry
│   └── ...
├── app.js              # Express application
├── server.js           # Server entry point
├── package.json        # Dependencies
└── .env               # Environment variables
```

## 🔧 Installation

```bash
# Navigate to gateway directory
cd servers/gateway

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Configure environment variables
nano .env
```

## ⚙️ Configuration

### Environment Variables

```env
# Server Configuration
NODE_ENV=development
PORT=3002
HOST=0.0.0.0

# Backend Services
ADMIN_SERVICE_URL=http://localhost:3000
CUSTOMER_SERVICE_URL=http://localhost:3001

# Security
JWT_SECRET=your-secret-key
API_KEY_HEADER=X-API-Key

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100

# Circuit Breaker
CIRCUIT_BREAKER_THRESHOLD=5
CIRCUIT_BREAKER_TIMEOUT=60000

# Caching
CACHE_ENABLED=true
CACHE_TTL=300
```

### Route Configuration

Routes are defined in `config/routing-config.js`:

```javascript
{
    path: '/api/admin/*',
    target: 'http://localhost:3000',
    service: 'admin',
    authentication: true,
    rateLimit: { max: 1000 },
    cache: { enabled: false }
}
```

## 🏃 Running the Server

### Development Mode

```bash
npm run dev
```

### Production Mode

```bash
npm start
```

### With PM2

```bash
pm2 start server.js --name gateway
```

### With Docker

```bash
docker build -t gateway .
docker run -p 3002:3002 gateway
```

## 📡 API Endpoints

### Health & Status

- `GET /health` - Health check endpoint
- `GET /ready` - Readiness check
- `GET /metrics` - Gateway metrics
- `GET /gateway/status` - Detailed gateway status

### Proxied Routes

- `/api/admin/*` - Admin service routes
- `/api/customers/*` - Customer service routes
- `/api/auth/*` - Authentication routes

## 🔌 Load Balancing Algorithms

The gateway supports multiple load balancing algorithms:

- **Round Robin**: Default, requests distributed sequentially
- **Least Connections**: Routes to server with fewest connections
- **Weighted Round Robin**: Considers server weights
- **IP Hash**: Sticky sessions based on client IP
- **Random**: Random server selection
- **Least Response Time**: Routes to fastest server
- **Resource Based**: Considers CPU and memory usage

## 🔒 Circuit Breaker

The circuit breaker prevents cascading failures:

```javascript
// Circuit states
CLOSED → OPEN → HALF_OPEN → CLOSED

// Configuration
{
    threshold: 5,        // Failures before opening
    timeout: 10000,      // Request timeout
    resetTimeout: 30000  // Time before trying again
}
```

## 💾 Caching Strategy

Response caching improves performance:

- Only caches GET requests
- Respects cache-control headers
- TTL-based expiration
- LRU eviction policy
- Cache key includes tenant ID

## 📊 Metrics

The gateway collects various metrics:

### Request Metrics
- Total requests
- Success/error rates
- Response times (avg, p95, p99)
- Requests by status code
- Requests by method
- Requests by path

### System Metrics
- CPU usage
- Memory usage
- Process uptime
- Load average

### Service Metrics
- Service health status
- Circuit breaker states
- Load balancer statistics
- Cache hit rates

## 🔐 Security Features

### Authentication
- JWT token validation
- API key authentication
- Session management
- Role-based access control

### Rate Limiting
- Per-IP rate limiting
- Per-user rate limiting
- Configurable windows and limits
- Custom rate limits per route

### Security Headers
- Content Security Policy
- X-Frame-Options
- X-Content-Type-Options
- Strict-Transport-Security
- And more via Helmet

## 🧪 Testing

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

## 📝 Logging

The gateway uses Winston for structured logging:

```javascript
// Log levels
{
    fatal: 0,
    error: 1,
    warn: 2,
    info: 3,
    debug: 4,
    trace: 5
}
```

Logs include:
- Request ID
- Correlation ID
- User ID
- Response time
- Status code

## 🚨 Monitoring

### Health Checks

The gateway performs regular health checks on backend services:

```bash
curl http://localhost:3002/health
```

Response:
```json
{
    "status": "healthy",
    "timestamp": "2024-01-01T00:00:00Z",
    "services": [
        {
            "name": "admin",
            "status": "healthy",
            "url": "http://localhost:3000"
        }
    ]
}
```

### Metrics Endpoint

```bash
curl http://localhost:3002/metrics
```

## 🔄 WebSocket Support

The gateway supports WebSocket connections:

```javascript
// WebSocket proxy configuration
{
    path: '/ws/*',
    target: 'http://localhost:3001',
    ws: true,
    authentication: true
}
```

## 🎯 Best Practices

1. **Configure appropriate timeouts** to prevent hanging requests
2. **Set rate limits** based on expected traffic
3. **Enable caching** for frequently accessed data
4. **Monitor circuit breaker states** to detect service issues
5. **Use correlation IDs** for request tracing
6. **Implement proper error handling** for graceful degradation
7. **Regular health checks** on backend services
8. **Log aggregation** for centralized monitoring

## 🐛 Troubleshooting

### Common Issues

1. **502 Bad Gateway**
   - Check if backend services are running
   - Verify service URLs in configuration
   - Check circuit breaker status

2. **429 Too Many Requests**
   - Rate limit exceeded
   - Adjust rate limit configuration
   - Implement backoff strategy

3. **503 Service Unavailable**
   - Circuit breaker is open
   - Backend service unhealthy
   - Check service health endpoints

4. **High Response Times**
   - Enable caching
   - Check load balancer algorithm
   - Monitor backend service performance

## 📚 Additional Resources

- [Express Documentation](https://expressjs.com/)
- [http-proxy-middleware](https://github.com/chimurai/http-proxy-middleware)
- [Circuit Breaker Pattern](https://martinfowler.com/bliki/CircuitBreaker.html)
- [API Gateway Patterns](https://microservices.io/patterns/apigateway.html)

## 📄 License

MIT License - see LICENSE file for details

## 🤝 Contributing

Please read CONTRIBUTING.md for details on our code of conduct and the process for submitting pull requests.

## 📞 Support

For issues and questions:
- GitHub Issues: [Create an issue](https://github.com/insightserenity/gateway/issues)
- Email: support@insightserenity.com
- Documentation: https://docs.insightserenity.com/gateway
