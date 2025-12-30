# How the API Gateway Works

A simple explanation of what the gateway does and how to use it.

---

## What is the Gateway?

The API Gateway is like a "front door" for your backend services. Instead of clients connecting directly to your admin-server and customer-services, they connect to the gateway, which then routes their requests to the correct backend.

```
Before (Direct Connection):
Client → Admin Server (port 3000)
Client → Customer Services (port 3001)

After (With Gateway):
Client → Gateway (port 80) → Admin Server (port 3000)
                           → Customer Services (port 3001)
```

---

## Why Use a Gateway?

### 1. **Single Entry Point**
- Clients only need to know one URL: `http://api.insightserenity.com`
- No need to remember different ports or servers

### 2. **Security**
- Rate limiting (prevents abuse)
- SSL/TLS termination (HTTPS)
- DDoS protection
- Security headers

### 3. **Load Balancing**
- Distributes traffic across multiple backend servers
- Automatically removes failed servers
- Optimizes performance

### 4. **Monitoring**
- All requests logged in one place
- Easy to see what's happening
- Track performance metrics

### 5. **Flexibility**
- Add/remove backend servers without changing client code
- Deploy new versions without downtime
- Scale horizontally

---

## How Routing Works

The gateway looks at the URL path and routes to different backends:

| Client Requests | Gateway Routes To | Backend |
|----------------|-------------------|---------|
| `GET /health` | Gateway itself | N/A (gateway response) |
| `GET /api/v1/admin/users` | → | Admin Server (port 3000) |
| `POST /api/v1/admin/roles` | → | Admin Server (port 3000) |
| `GET /api/v1/consultations` | → | Customer Services (port 3001) |
| `POST /api/v1/payments` | → | Customer Services (port 3001) |
| `WS /ws` | → | Customer Services (WebSocket) |

**Rule**:
- URLs starting with `/api/v1/admin/` → Admin Server
- URLs starting with `/api/v1/` → Customer Services
- WebSocket connections `/ws` → Customer Services

---

## Request Lifecycle

### Step-by-Step: What Happens When a Request Comes In

**Example**: Client requests `GET http://localhost/api/v1/consultations`

#### Step 1: Client Sends Request
```http
GET /api/v1/consultations HTTP/1.1
Host: localhost
```

#### Step 2: Gateway Receives Request
- NGINX receives the request on port 80
- Generates a unique request ID: `12082274e63999531d37af33294d4aef`
- Logs the incoming request

#### Step 3: Security Checks
```nginx
# Check rate limiting
limit_req zone=api burst=30 nodelay;

# Result: 100 requests/minute allowed
# Current: 98 requests remaining ✅
```

#### Step 4: Route Matching
```nginx
location /api/v1/ {
    proxy_pass http://customer_backend;
    # ...
}
```
- Matches `/api/v1/*` pattern
- Routes to `customer_backend` upstream

#### Step 5: Load Balancing
```nginx
upstream customer_backend {
    least_conn;
    server host.docker.internal:3001;
}
```
- Uses least-connections algorithm
- Selects backend: `192.168.65.254:3001`

#### Step 6: Proxy to Backend
```http
GET /api/v1/consultations HTTP/1.1
Host: localhost
X-Real-IP: 192.168.65.1
X-Forwarded-For: 192.168.65.1
X-Forwarded-Proto: http
X-Request-ID: 12082274e63999531d37af33294d4aef
Connection: keep-alive
```

#### Step 7: Backend Processes Request
```javascript
// In customer-services
app.get('/api/v1/consultations', authMiddleware, (req, res) => {
  // Check authentication
  if (!req.headers.authorization) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'No auth token' }
    });
  }
  // ... handle request
});
```

#### Step 8: Backend Responds
```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json; charset=utf-8
X-API-Version: v1
RateLimit-Policy: 100;w=900
RateLimit-Remaining: 98

{"success":false,"error":{"code":"UNAUTHORIZED","message":"No auth token"}}
```

#### Step 9: Gateway Adds Headers
```http
HTTP/1.1 401 Unauthorized
Server: nginx
X-Content-Type-Options: nosniff
X-Frame-Options: SAMEORIGIN
X-XSS-Protection: 1; mode=block
X-Request-ID: 12082274e63999531d37af33294d4aef
X-Upstream-Server: customer-backend
# ... (backend headers preserved) ...
```

#### Step 10: Gateway Logs Request
```json
{
  "timestamp": "2025-12-29T07:36:49+00:00",
  "method": "GET",
  "uri": "/api/v1/consultations",
  "status": 401,
  "request_time": 0.004,
  "upstream_addr": "192.168.65.254:3001",
  "upstream_status": "401"
}
```

#### Step 11: Client Receives Response
```http
HTTP/1.1 401 Unauthorized
...headers...

{"success":false,"error":{"code":"UNAUTHORIZED","message":"No auth token"}}
```

**Total Time**: 4 milliseconds

---

## Load Balancing Explained

### Different Algorithms for Different Needs

#### Admin Server: Round Robin (Weighted)
```nginx
upstream admin_backend {
    server 10.0.2.101:3000 weight=100;  # Gets 40% of traffic
    server 10.0.2.102:3000 weight=100;  # Gets 40% of traffic
    server 10.0.2.103:3000 weight=50;   # Gets 20% of traffic
}
```

**How it works**:
- Request 1 → Server 101
- Request 2 → Server 102
- Request 3 → Server 103
- Request 4 → Server 101 (starts over)

**Good for**: Predictable, uniform requests

#### Customer Services: Least Connections
```nginx
upstream customer_backend {
    least_conn;
    server 10.0.3.101:3001;
    server 10.0.3.102:3001;
    server 10.0.3.103:3001;
}
```

**How it works**:
- Tracks active connections on each server
- Server 101: 45 connections
- Server 102: 50 connections
- Server 103: 48 connections
- **Next request goes to**: Server 101 (fewest connections)

**Good for**: Variable request processing times

#### WebSocket: IP Hash (Sticky Sessions)
```nginx
upstream websocket_backend {
    ip_hash;
    server 10.0.3.101:3001;
    server 10.0.3.102:3001;
}
```

**How it works**:
- Hashes client IP address
- IP `192.168.1.100` → always goes to Server 101
- IP `192.168.1.200` → always goes to Server 102

**Good for**: Persistent connections (WebSocket, long-polling)

---

## Security Features

### 1. Rate Limiting

**Prevents abuse** by limiting requests per IP address:

```nginx
# General traffic: 100 requests/minute
limit_req_zone $binary_remote_addr zone=general:10m rate=100r/m;

# Admin traffic: 50 requests/minute (stricter)
limit_req_zone $binary_remote_addr zone=admin:10m rate=50r/m;
```

**Example**:
```bash
# Client makes 150 requests in 1 minute
# Requests 1-100: ✅ Allowed (200 OK)
# Requests 101-130: ✅ Allowed (burst)
# Requests 131-150: ❌ Rejected (429 Too Many Requests)
```

### 2. Security Headers

**Added by gateway**:
```http
X-Content-Type-Options: nosniff          # Prevents MIME sniffing
X-Frame-Options: SAMEORIGIN              # Prevents clickjacking
X-XSS-Protection: 1; mode=block          # Enables XSS filter
```

**Preserved from backend**:
```http
Strict-Transport-Security: max-age=31536000  # Force HTTPS
Cross-Origin-Resource-Policy: same-origin    # CORS protection
```

### 3. Request ID Tracking

Every request gets a unique ID:
```http
X-Request-ID: 12082274e63999531d37af33294d4aef
```

**Use cases**:
- Debug specific requests
- Trace requests across services
- Correlate logs

---

## Connection Pooling

**Problem**: Creating new connections is slow

**Solution**: Keep connections alive and reuse them

```nginx
upstream customer_backend {
    server host.docker.internal:3001;
    keepalive 64;                    # Keep 64 connections open
    keepalive_requests 100;          # Reuse up to 100 times
    keepalive_timeout 60s;           # Keep alive for 60 seconds
}
```

**Performance Improvement**:
- Without keepalive: 10-20ms per request (TCP handshake + TLS)
- With keepalive: 2-4ms per request (reuse existing connection)

**Result**: 5-10x faster! 🚀

---

## Health Checking

### Passive Health Checks

**How it works**:
```nginx
server 10.0.3.101:3001 max_fails=2 fail_timeout=10s;
```

1. If 2 consecutive requests fail → mark server as down
2. Wait 10 seconds
3. Try server again
4. If succeeds → mark as up

**Example**:
```
Time 0s:  Request to 10.0.3.101 → 502 Bad Gateway (fail #1)
Time 2s:  Request to 10.0.3.101 → 502 Bad Gateway (fail #2)
          → Server marked DOWN ❌
          → Future requests → other servers
Time 12s: Retry 10.0.3.101 → 200 OK ✅
          → Server marked UP
```

---

## Logging

### JSON Structured Logs

Every request is logged in JSON format:

```json
{
  "timestamp": "2025-12-29T07:36:49+00:00",
  "remote_addr": "192.168.65.1",
  "request_id": "ecb0f86559f92e133353b8ecd74454c7",
  "method": "GET",
  "uri": "/api/v1/consultations",
  "status": 401,
  "body_bytes_sent": 75,
  "request_time": 0.004,
  "upstream_addr": "192.168.65.254:3001",
  "upstream_status": "401",
  "upstream_response_time": "0.004",
  "upstream_connect_time": "0.002",
  "http_user_agent": "curl/8.12.1"
}
```

**Easy to analyze**:
```bash
# Find slow requests
jq 'select(.request_time > 1)' access.log

# Count errors
jq 'select(.status >= 500)' access.log | wc -l

# Average response time
jq '.request_time' access.log | awk '{sum+=$1; count++} END {print sum/count}'
```

---

## Monitoring

### Metrics Available

**Request Metrics**:
- Total requests per second
- Requests by status code (2xx, 4xx, 5xx)
- Error rate percentage

**Performance Metrics**:
- P50 latency (median)
- P95 latency (95th percentile)
- P99 latency (99th percentile)

**Upstream Metrics**:
- Active connections per backend
- Backend health status
- Upstream response times

**System Metrics**:
- CPU usage
- Memory usage
- Network I/O

### Viewing Logs

```bash
# Real-time logs
docker logs gateway-test -f

# Pretty-print JSON logs
docker logs gateway-test | jq '.'

# Filter for errors
docker logs gateway-test | jq 'select(.status >= 500)'

# Watch specific endpoint
docker logs gateway-test | jq 'select(.uri | contains("/consultations"))'
```

---

## How to Start the Gateway

### Option 1: Quick Start (Local Testing)

```bash
# 1. Start backend services
cd servers/admin-server && npm start &
cd servers/customer-services && npm start &

# 2. Start gateway
cd servers/gateway/docker
docker-compose -f docker-compose.test.yml up -d

# 3. Fix default configuration
sleep 5
docker exec gateway-test rm -f /etc/nginx/conf.d/default.conf
docker exec gateway-test nginx -s reload

# 4. Test
curl http://localhost/health
```

### Option 2: Production Deployment

```bash
# 1. Provision infrastructure
cd servers/gateway/terraform
terraform init
terraform apply

# 2. Deploy configuration
cd ../ansible
ansible-playbook playbooks/deploy-gateway.yml

# 3. Configure SSL
ssh gateway-1
sudo certbot --nginx -d api.insightserenity.com

# 4. Verify
curl https://api.insightserenity.com/health
```

---

## Testing the Gateway

### Test 1: Health Check
```bash
curl http://localhost/health
# Expected: {"status":"healthy","gateway":"nginx",...}
```

### Test 2: Route to Customer Services
```bash
curl http://localhost/api/v1/consultations
# Expected: 401 Unauthorized (auth required)
# ✅ Proves routing works!
```

### Test 3: Check Rate Limiting
```bash
# Make 150 requests rapidly
for i in {1..150}; do
  curl -s -o /dev/null -w "%{http_code}\n" http://localhost/api/v1/health
done
# Expected: 200...200, then 429 (rate limit exceeded)
```

### Test 4: View Logs
```bash
docker logs gateway-test -f
# Watch requests in real-time
```

---

## Troubleshooting

### Problem: Gateway returns 502 Bad Gateway

**Cause**: Backend server not reachable

**Solution**:
```bash
# Check if backend is running
curl http://localhost:3000/health  # Admin
curl http://localhost:3001/health  # Customer

# Check gateway logs
docker logs gateway-test | grep error
```

### Problem: Gateway returns 404 Not Found

**Cause**: Route doesn't match any location blocks

**Solution**:
```bash
# Check the requested path
# Admin routes: /api/v1/admin/*
# Customer routes: /api/v1/*

# Wrong:  GET /consultations (no /api/v1/ prefix)
# Right:  GET /api/v1/consultations
```

### Problem: Gateway returns 429 Too Many Requests

**Cause**: Rate limit exceeded

**Solution**:
```bash
# Wait 60 seconds
sleep 60

# Or adjust rate limits in nginx.conf (for testing)
# limit_req_zone ... rate=1000r/m;  # Increase from 100 to 1000
```

---

## Configuration Files

### Main Configuration
**File**: `nginx/nginx.conf`
- Worker processes
- Event handling
- Logging format
- Rate limit zones
- Include statements

### Upstream Configuration
**File**: `nginx/upstreams/backends.conf`
- Backend server pools
- Load balancing algorithms
- Health check settings
- Connection pooling

### Virtual Host Configuration
**File**: `nginx/sites-available/api.insightserenity.com.conf`
- Server block (domain, SSL)
- Location blocks (routing rules)
- Proxy settings
- Error pages

---

## Summary

### What the Gateway Does

✅ **Routes** requests to correct backend based on URL path
✅ **Load balances** traffic across multiple backend servers
✅ **Enforces** rate limits to prevent abuse
✅ **Adds** security headers to protect clients
✅ **Logs** all requests for monitoring and debugging
✅ **Handles** SSL/TLS termination (production)
✅ **Fails over** automatically when backends go down
✅ **Pools** connections for better performance

### Benefits

📈 **Performance**: Connection pooling, load balancing
🔒 **Security**: Rate limiting, DDoS protection, headers
📊 **Observability**: Structured logs, metrics, tracing
🎯 **Reliability**: Health checks, automatic failover
🔧 **Flexibility**: Easy to scale, modify, deploy

---

## Next Steps

1. **Read**: [TESTING-GUIDE.md](TESTING-GUIDE.md) for detailed testing procedures
2. **Deploy**: [DEPLOYMENT-RUNBOOK.md](docs/DEPLOYMENT-RUNBOOK.md) for production deployment
3. **Understand**: [GATEWAY-ARCHITECTURE.md](docs/GATEWAY-ARCHITECTURE.md) for deep technical details
4. **Monitor**: Set up Prometheus and Grafana dashboards

---

**Questions?** See [README.md](README.md) or contact devops@insightserenity.com
