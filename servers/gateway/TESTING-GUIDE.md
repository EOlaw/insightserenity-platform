# Gateway Testing Guide

Complete guide for testing the InsightSerenity API Gateway with backend services.

---

## Quick Start Testing (3 Steps)

### Step 1: Start Backend Services

**Terminal 1 - Admin Server**:
```bash
cd /Users/eolaw/Desktop/insightserenity-platform/servers/admin-server
npm start
```

**Terminal 2 - Customer Services**:
```bash
cd /Users/eolaw/Desktop/insightserenity-platform/servers/customer-services
npm start
```

### Step 2: Start Gateway (Docker Compose)

**Terminal 3 - Gateway**:
```bash
cd /Users/eolaw/Desktop/insightserenity-platform/servers/gateway/docker
docker-compose up
```

### Step 3: Test Gateway

**Terminal 4 - Testing**:
```bash
# Test gateway health
curl http://localhost/health

# Test admin backend routing
curl http://localhost/api/v1/admin/health

# Test customer backend routing
curl http://localhost/api/v1/health
```

---

## Detailed Testing Walkthrough

### Prerequisites

1. **Node.js**: Installed (for backend services)
2. **Docker**: Running (for gateway)
3. **MongoDB**: Running (if needed by backends)
4. **Redis**: Running (if needed by backends)

**Quick Database Start**:
```bash
# MongoDB (if not running)
docker run -d -p 27017:27017 --name mongodb mongo:7

# Redis (if not running)
docker run -d -p 6379:6379 --name redis redis:alpine
```

---

## Part 1: Start Backend Services

### A. Admin Server (Port 3000)

```bash
cd servers/admin-server

# Install dependencies (first time only)
npm install

# Start server
npm start
```

**Expected Output**:
```
[Admin Server] Starting on port 3000...
[Admin Server] Connected to MongoDB
[Admin Server] Server ready ✓
```

**Verify**:
```bash
curl http://localhost:3000/health
```

**Expected Response**:
```json
{
  "status": "healthy",
  "service": "admin-server",
  "timestamp": "2025-12-29T...",
  "version": "2.0.1"
}
```

### B. Customer Services (Port 3001)

```bash
cd servers/customer-services

# Install dependencies (first time only)
npm install

# Start server
npm start
```

**Expected Output**:
```
[Customer Services] Starting on port 3001...
[Customer Services] Connected to MongoDB
[Customer Services] Server ready ✓
```

**Verify**:
```bash
curl http://localhost:3001/health
```

**Expected Response**:
```json
{
  "status": "healthy",
  "service": "customer-services",
  "timestamp": "2025-12-29T...",
  "version": "1.0.0"
}
```

---

## Part 2: Start API Gateway

### Option 1: Local Testing with Docker (Recommended)

```bash
cd servers/gateway/docker

# Start all services (gateway + monitoring)
docker-compose up -d

# View logs
docker-compose logs -f gateway-1
```

**Services Started**:
- ✅ gateway-1 (NGINX primary) - http://localhost:80
- ✅ gateway-2 (NGINX backup) - http://localhost:8080
- ✅ Prometheus - http://localhost:9090
- ✅ Grafana - http://localhost:3000
- ✅ AlertManager - http://localhost:9093

**Expected Output**:
```
gateway-1    | nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
gateway-1    | nginx: configuration file /etc/nginx/nginx.conf test is successful
gateway-1    | 2025/12/29 10:00:00 [notice] 1#1: start worker processes
prometheus   | level=info ts=... msg="Server is ready to receive web requests."
grafana      | logger=settings t=... lvl=info msg="Starting Grafana"
```

### Option 2: Native NGINX (Advanced)

```bash
# Install NGINX
sudo apt-get install nginx  # Ubuntu/Debian
# or
brew install nginx  # macOS

# Copy configuration
sudo cp servers/gateway/nginx/nginx.conf /etc/nginx/
sudo cp -r servers/gateway/nginx/upstreams /etc/nginx/
sudo cp servers/gateway/nginx/sites-available/api.insightserenity.com.conf \
    /etc/nginx/sites-available/

# Enable site
sudo ln -s /etc/nginx/sites-available/api.insightserenity.com.conf \
    /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Start NGINX
sudo systemctl start nginx
# or
sudo nginx
```

---

## Part 3: Test Gateway Routing

### Test 1: Gateway Health Check

```bash
curl -i http://localhost/health
```

**Expected Response**:
```
HTTP/1.1 200 OK
Content-Type: application/json

{
  "status": "healthy",
  "gateway": "nginx",
  "timestamp": "2025-12-29T10:00:00Z"
}
```

**What This Tests**: Gateway is running and responding

---

### Test 2: Admin Backend Routing

```bash
# Health check through gateway
curl -i http://localhost/api/v1/admin/health
```

**Expected Response**:
```
HTTP/1.1 200 OK
X-Upstream-Server: admin-backend
Content-Type: application/json

{
  "status": "healthy",
  "service": "admin-server",
  "timestamp": "2025-12-29T...",
  "version": "2.0.1"
}
```

**What This Tests**:
- ✅ Gateway routes `/api/v1/admin/*` to admin-server
- ✅ Proxy headers are set correctly
- ✅ Admin backend is reachable

---

### Test 3: Customer Backend Routing

```bash
# Health check through gateway
curl -i http://localhost/api/v1/health
```

**Expected Response**:
```
HTTP/1.1 200 OK
X-Upstream-Server: customer-backend
Content-Type: application/json

{
  "status": "healthy",
  "service": "customer-services",
  "timestamp": "2025-12-29T...",
  "version": "1.0.0"
}
```

**What This Tests**:
- ✅ Gateway routes `/api/v1/*` (non-admin) to customer-services
- ✅ Different backend for customer requests
- ✅ Customer backend is reachable

---

### Test 4: Load Balancing

```bash
# Make multiple requests and check which backend responds
for i in {1..10}; do
  curl -s http://localhost/api/v1/health | jq -r '.service'
done
```

**Expected Output**: Should see load distributed across backends

**What This Tests**:
- ✅ Load balancing is working
- ✅ Requests distributed across multiple backend instances

---

### Test 5: Rate Limiting

```bash
# Send rapid requests to test rate limiting
for i in {1..150}; do
  curl -s -o /dev/null -w "%{http_code}\n" http://localhost/api/v1/health
done
```

**Expected Output**:
```
200
200
200
...
429  # Rate limit exceeded
429
```

**What This Tests**:
- ✅ Rate limiting is enforced (100 req/min)
- ✅ Returns 429 when limit exceeded

---

### Test 6: Security Headers

```bash
curl -I http://localhost/api/v1/health
```

**Expected Headers**:
```
HTTP/1.1 200 OK
X-Content-Type-Options: nosniff
X-Frame-Options: SAMEORIGIN
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

**What This Tests**:
- ✅ Security headers are applied
- ✅ HSTS enabled
- ✅ XSS protection active

---

### Test 7: Request Logging

```bash
# Make a request
curl http://localhost/api/v1/health

# View gateway logs (JSON format)
docker-compose logs gateway-1 | tail -5
```

**Expected Log Format**:
```json
{
  "time": "2025-12-29T10:00:00+00:00",
  "remote_addr": "172.20.0.1",
  "request": "GET /api/v1/health HTTP/1.1",
  "status": 200,
  "body_bytes_sent": 156,
  "request_time": 0.023,
  "upstream_addr": "10.0.3.101:3001",
  "upstream_status": 200,
  "upstream_response_time": 0.021
}
```

**What This Tests**:
- ✅ Structured logging enabled
- ✅ Request metrics captured
- ✅ Upstream information tracked

---

### Test 8: Error Handling

```bash
# Request non-existent endpoint
curl -i http://localhost/api/v1/nonexistent
```

**Expected Response**:
```
HTTP/1.1 404 Not Found
Content-Type: application/json

{
  "error": {
    "code": 404,
    "message": "Not Found",
    "path": "/api/v1/nonexistent"
  }
}
```

**What This Tests**:
- ✅ Gateway handles 404 errors gracefully
- ✅ Returns JSON error responses

---

### Test 9: Backend Failure Handling

```bash
# Stop one backend
docker stop customer-backend-1

# Make requests - should still work
curl http://localhost/api/v1/health

# Check NGINX status
curl http://localhost/nginx_status
```

**Expected Behavior**:
- ✅ Requests still succeed (routed to healthy backends)
- ✅ Failed backend marked as down
- ✅ Automatic failover working

**Restore**:
```bash
docker start customer-backend-1
```

---

### Test 10: Performance Testing

```bash
# Install Apache Bench (if needed)
# Ubuntu: sudo apt-get install apache2-utils
# macOS: already installed

# Run load test
ab -n 1000 -c 10 http://localhost/api/v1/health
```

**Expected Metrics**:
```
Requests per second:    500+ [#/sec]
Time per request:       20ms [mean]
Transfer rate:          150+ [Kbytes/sec]
```

**What This Tests**:
- ✅ Gateway performance under load
- ✅ Throughput capacity
- ✅ Latency metrics

---

## Part 4: Monitor Gateway

### Access Monitoring Dashboards

**1. Grafana** (http://localhost:3000)
- Username: `admin`
- Password: `admin`
- Navigate to: Dashboards → Gateway Overview

**Metrics Visible**:
- Request rate (total, 2xx, 4xx, 5xx)
- Error rate
- Response time percentiles (P50, P90, P95, P99)
- Active connections
- Upstream health status

**2. Prometheus** (http://localhost:9090)

**Query Examples**:
```promql
# Total requests
sum(rate(nginx_http_requests_total[5m]))

# Error rate
sum(rate(nginx_http_requests_total{status=~"5.."}[5m])) /
sum(rate(nginx_http_requests_total[5m]))

# P95 latency
histogram_quantile(0.95,
  sum(rate(nginx_http_request_duration_seconds_bucket[5m])) by (le))
```

**3. AlertManager** (http://localhost:9093)

View active alerts and alert routing configuration.

---

## Part 5: How the Gateway Works

### Request Flow Diagram

```
┌─────────────┐
│   Client    │
└─────┬───────┘
      │ 1. HTTP Request
      ▼
┌─────────────────────────────────┐
│      API Gateway (NGINX)        │
│  ┌───────────────────────────┐  │
│  │  2. SSL Termination       │  │
│  └───────────────────────────┘  │
│  ┌───────────────────────────┐  │
│  │  3. Security Checks       │  │
│  │     - Rate Limiting       │  │
│  │     - DDoS Protection     │  │
│  │     - Header Validation   │  │
│  └───────────────────────────┘  │
│  ┌───────────────────────────┐  │
│  │  4. Route Matching        │  │
│  │     /api/v1/admin/* → A   │  │
│  │     /api/v1/* → C         │  │
│  └───────────────────────────┘  │
│  ┌───────────────────────────┐  │
│  │  5. Load Balancing        │  │
│  │     - Round Robin (Admin) │  │
│  │     - Least Conn (Cust)   │  │
│  └───────────────────────────┘  │
└─────┬───────────────────────────┘
      │ 6. Proxied Request
      ▼
┌─────────────┬─────────────┐
│   Admin     │  Customer   │
│   Backend   │  Backend    │
│  (Port 3000)│ (Port 3001) │
└─────┬───────┴─────┬───────┘
      │             │
      │ 7. Response │
      └─────────────┘
            ▲
            │
      ┌─────┴────────┐
      │   Client     │
      └──────────────┘
```

### Step-by-Step Example

**Request**: `GET http://localhost/api/v1/consultations`

**Step 1**: Client sends HTTP request to gateway (port 80)

**Step 2**: NGINX receives request, checks routing rules

**Step 3**: Matches route `/api/v1/*` → customer_backend

**Step 4**: Applies rate limiting (100 req/min per IP)

**Step 5**: Selects backend using least-connections algorithm
- Checks: 10.0.3.101 (50 active), 10.0.3.102 (45 active), 10.0.3.103 (48 active)
- Selects: 10.0.3.102 (lowest connections)

**Step 6**: Proxies request to customer-services at 10.0.3.102:3001
- Adds headers: `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`
- Sets timeout: 60 seconds
- Uses keepalive connection

**Step 7**: Customer service processes request, returns response

**Step 8**: Gateway forwards response to client
- Adds security headers
- Logs request metrics
- Updates connection pool

**Step 9**: Prometheus scrapes metrics from NGINX exporter

**Step 10**: Grafana displays real-time metrics on dashboard

---

## Part 6: Configuration Highlights

### Routing Rules

**File**: `nginx/sites-available/api.insightserenity.com.conf`

```nginx
# Admin routes (stricter rate limiting)
location /api/v1/admin/ {
    limit_req zone=admin burst=10 nodelay;
    proxy_pass http://admin_backend;
    proxy_read_timeout 120s;  # Longer timeout for admin ops
}

# Customer routes
location /api/v1/ {
    limit_req zone=api burst=30 nodelay;
    proxy_pass http://customer_backend;
    proxy_read_timeout 60s;
}
```

### Load Balancing Algorithms

**File**: `nginx/upstreams/backends.conf`

```nginx
# Admin: Weighted Round-Robin
upstream admin_backend {
    server 10.0.2.101:3000 weight=100;  # 40%
    server 10.0.2.102:3000 weight=100;  # 40%
    server 10.0.2.103:3000 weight=50;   # 20%
}

# Customer: Least Connections
upstream customer_backend {
    least_conn;
    server 10.0.3.101:3001;
    server 10.0.3.102:3001;
    server 10.0.3.103:3001;
}
```

### Rate Limiting Zones

**File**: `nginx/nginx.conf`

```nginx
# General traffic: 100 requests/minute per IP
limit_req_zone $binary_remote_addr zone=general:10m rate=100r/m;

# API traffic: 100 requests/minute per IP
limit_req_zone $binary_remote_addr zone=api:10m rate=100r/m;

# Admin traffic: 50 requests/minute per IP (stricter)
limit_req_zone $binary_remote_addr zone=admin:10m rate=50r/m;

# Per-user (authenticated): 200 requests/minute
limit_req_zone $http_authorization zone=per_user:10m rate=200r/m;
```

---

## Part 7: Troubleshooting

### Problem: Gateway not starting

**Check**:
```bash
docker-compose logs gateway-1
```

**Common Issues**:
- Port 80 already in use → Stop conflicting service
- Configuration syntax error → Run `nginx -t`

### Problem: Backend not reachable

**Check**:
```bash
# Verify backend is running
curl http://localhost:3000/health  # Admin
curl http://localhost:3001/health  # Customer

# Check gateway logs
docker-compose logs gateway-1 | grep upstream
```

**Solution**: Ensure backend services are started first

### Problem: Rate limiting too strict

**Temporary Fix**:
```bash
# Edit nginx.conf
vim servers/gateway/nginx/nginx.conf

# Increase rate
limit_req_zone $binary_remote_addr zone=api:10m rate=1000r/m;

# Restart gateway
docker-compose restart gateway-1
```

### Problem: High latency

**Check**:
```bash
# View response times in logs
docker-compose logs gateway-1 | jq '.request_time'

# Check Prometheus metrics
open http://localhost:9090
# Query: histogram_quantile(0.95, nginx_http_request_duration_seconds_bucket)
```

**Common Causes**:
- Backend overloaded → Scale backends
- Network issues → Check connectivity
- Large payloads → Enable compression

---

## Part 8: Advanced Testing

### WebSocket Testing

```bash
# Install websocat
# macOS: brew install websocat
# Ubuntu: cargo install websocat

# Test WebSocket connection
websocat ws://localhost/ws

# Send message
{"type": "ping"}

# Should receive pong response
```

### SSL/TLS Testing (Production)

```bash
# Test SSL configuration
openssl s_client -connect api.insightserenity.com:443 \
  -servername api.insightserenity.com

# Test SSL Labs (online)
# https://www.ssllabs.com/ssltest/analyze.html?d=api.insightserenity.com
```

### Concurrent User Testing

```bash
# Install k6
# macOS: brew install k6
# Ubuntu: snap install k6

# Create test script
cat > load-test.js <<'EOF'
import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  stages: [
    { duration: '30s', target: 50 },   // Ramp up
    { duration: '1m', target: 100 },   // Stay at peak
    { duration: '30s', target: 0 },    // Ramp down
  ],
};

export default function () {
  let res = http.get('http://localhost/api/v1/health');
  check(res, { 'status 200': (r) => r.status === 200 });
  sleep(1);
}
EOF

# Run test
k6 run load-test.js
```

---

## Part 9: Cleanup

### Stop Services

```bash
# Stop gateway
cd servers/gateway/docker
docker-compose down -v

# Stop backends (Ctrl+C in each terminal)
# Or use process manager
pkill -f "node.*admin-server"
pkill -f "node.*customer-services"
```

### Remove Test Data

```bash
# Remove Docker volumes
docker volume prune -f

# Remove test databases (if created)
docker stop mongodb redis
docker rm mongodb redis
```

---

## Part 10: Next Steps

### Production Deployment

Once local testing is complete, deploy to production:

```bash
# Step 1: Provision infrastructure
cd servers/gateway/terraform
terraform apply

# Step 2: Deploy configuration
cd ../ansible
ansible-playbook playbooks/deploy-gateway.yml

# Step 3: Configure SSL
ssh gateway-1
sudo certbot --nginx -d api.insightserenity.com

# Step 4: Verify
curl https://api.insightserenity.com/health
```

See [DEPLOYMENT-RUNBOOK.md](docs/DEPLOYMENT-RUNBOOK.md) for complete instructions.

---

## Summary

### What You've Tested

✅ Gateway routing to admin backend
✅ Gateway routing to customer backend
✅ Load balancing across backends
✅ Rate limiting enforcement
✅ Security headers
✅ Error handling
✅ Failover to healthy backends
✅ Performance under load
✅ Monitoring and metrics
✅ Logging and observability

### Gateway Features Verified

✅ **Routing**: Requests correctly routed based on path
✅ **Load Balancing**: Traffic distributed across backends
✅ **Security**: Rate limiting, headers, DDoS protection
✅ **Resilience**: Automatic failover on backend failure
✅ **Observability**: Metrics, logs, dashboards
✅ **Performance**: Low latency, high throughput

---

## Quick Reference Commands

```bash
# Start everything
cd servers/admin-server && npm start &
cd servers/customer-services && npm start &
cd servers/gateway/docker && docker-compose up -d

# Test basic routing
curl http://localhost/health                    # Gateway health
curl http://localhost/api/v1/admin/health      # Admin backend
curl http://localhost/api/v1/health            # Customer backend

# View logs
docker-compose logs -f gateway-1

# Monitor
open http://localhost:3000  # Grafana
open http://localhost:9090  # Prometheus

# Stop everything
docker-compose down -v
pkill -f "node.*server"
```

---

**Ready to test!** Start with Part 1 and work through each section.
