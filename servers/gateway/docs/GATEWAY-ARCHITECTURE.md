# Production Gateway Integration Architecture
**InsightSerenity Platform - Production Gateway Design**

Version: 1.0
Date: 2025-12-28
Status: Design Specification

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Architecture Overview](#architecture-overview)
3. [Text-Based Architecture Diagram](#text-based-architecture-diagram)
4. [Request Lifecycle & Routing](#request-lifecycle--routing)
5. [Load Balancing Strategy](#load-balancing-strategy)
6. [Fault Tolerance & High Availability](#fault-tolerance--high-availability)
7. [Security Enforcement Model](#security-enforcement-model)
8. [Observability & Monitoring](#observability--monitoring)
9. [Resilience Mechanisms](#resilience-mechanisms)
10. [Implementation Plan](#implementation-plan)
11. [Configuration Changes Required](#configuration-changes-required)
12. [Technology Stack Rationale](#technology-stack-rationale)

---

## Executive Summary

### Current State
- **admin-server**: Standalone Express service on port 3000 (configurable)
- **customer-services**: Standalone Express service on port 3001
- Both services are fully functional with built-in security, authentication, and health checks
- No centralized entry point or load balancing

### Target State
- **API Gateway**: Single entry point for all traffic (NGINX-based)
- **Service Mesh**: Optional future enhancement for advanced routing
- **Load Balancers**: Active-passive failover with health-based routing
- **High Availability**: Multi-instance deployment with automatic failover
- **Centralized Security**: Authentication, rate limiting, and DDoS protection at gateway
- **Zero Downtime**: Rolling deployments with health checks

### Design Principles
1. **Minimal Intrusion**: Only configuration changes to existing services
2. **Battle-Tested Technologies**: NGINX, Redis, Prometheus (proven at scale)
3. **Cloud-Agnostic**: Works on AWS, GCP, Azure, or bare metal
4. **Progressive Enhancement**: Start simple, scale as needed
5. **Fail-Safe**: Graceful degradation under load

---

## Architecture Overview

### High-Level Components

```
┌─────────────────────────────────────────────────────────────────┐
│                         INTERNET                                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    CDN (Optional - Cloudflare)                  │
│  • DDoS Protection (Layer 3/4/7)                               │
│  • Static Asset Caching                                        │
│  • SSL/TLS Termination (Edge)                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   DNS Load Balancer (GeoDNS)                   │
│  • Geographic routing                                           │
│  • Health-based failover                                       │
│  • A/AAAA records with TTL=60s                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                ┌─────────────┴─────────────┐
                ▼                           ▼
      ┌─────────────────┐         ┌─────────────────┐
      │   Gateway LB 1   │         │   Gateway LB 2   │
      │  (Active)        │         │  (Standby)       │
      │  NGINX           │◄───────►│  NGINX           │
      │  keepalived VIP  │  VRRP   │  keepalived VIP  │
      └─────────────────┘         └─────────────────┘
                │                           │
                └─────────────┬─────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PRIMARY API GATEWAY                          │
│                         (NGINX)                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  Security Layer:                                          │ │
│  │  • SSL/TLS Termination (if not at CDN)                   │ │
│  │  • Rate Limiting (Redis-backed)                          │ │
│  │  • Request Validation                                    │ │
│  │  • IP Whitelist/Blacklist                                │ │
│  │  • DDoS Mitigation (conn limits, req/s)                  │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  Routing Layer:                                           │ │
│  │  • Path-based routing                                     │ │
│  │  • Header-based routing (X-Tenant-ID, X-Admin-Token)     │ │
│  │  • WebSocket upgrade handling                            │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  Load Balancing:                                          │ │
│  │  • Weighted round-robin                                   │ │
│  │  • Least connections                                      │ │
│  │  • Sticky sessions (IP hash / cookie-based)              │ │
│  │  • Active health checks (5s interval)                    │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                ┌─────────────┼─────────────┐
                ▼             ▼             ▼
    /api/v1/admin/*    /api/v1/*     /health, /metrics
                │             │             │
                ▼             ▼             ▼
┌─────────────────────┐  ┌─────────────────────┐
│  ADMIN SERVICE POOL │  │ CUSTOMER SRVC POOL  │
├─────────────────────┤  ├─────────────────────┤
│  ┌───────────────┐  │  │  ┌───────────────┐  │
│  │ Admin-1       │  │  │  │ Customer-1    │  │
│  │ :3000         │  │  │  │ :3001         │  │
│  │ (Leader)      │  │  │  │ (Leader)      │  │
│  └───────────────┘  │  │  └───────────────┘  │
│  ┌───────────────┐  │  │  ┌───────────────┐  │
│  │ Admin-2       │  │  │  │ Customer-2    │  │
│  │ :3000         │  │  │  │ :3001         │  │
│  │ (Follower)    │  │  │  │ (Follower)    │  │
│  └───────────────┘  │  │  └───────────────┘  │
│  ┌───────────────┐  │  │  ┌───────────────┐  │
│  │ Admin-3       │  │  │  │ Customer-3    │  │
│  │ :3000         │  │  │  │ (Standby)     │  │
│  │ (Follower)    │  │  │  │               │  │
│  └───────────────┘  │  │  └───────────────┘  │
└─────────────────────┘  └─────────────────────┘
         │                        │
         └────────┬───────────────┘
                  ▼
      ┌─────────────────────────┐
      │   SHARED INFRASTRUCTURE  │
      ├─────────────────────────┤
      │  • MongoDB Cluster      │
      │  • Redis Cluster        │
      │  • S3/Object Storage    │
      │  • Elasticsearch        │
      └─────────────────────────┘
                  │
                  ▼
      ┌─────────────────────────┐
      │  OBSERVABILITY STACK    │
      ├─────────────────────────┤
      │  • Prometheus (metrics) │
      │  • Grafana (dashboards) │
      │  • Loki (logs)          │
      │  • Jaeger (tracing)     │
      └─────────────────────────┘
```

---

## Text-Based Architecture Diagram

### Network Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          EXTERNAL CLIENTS                                │
│  • Web Browsers  • Mobile Apps  • API Consumers  • Third-party Integrations│
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ HTTPS (443) / HTTP (80)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         EDGE LAYER (Optional)                            │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │  Cloudflare / AWS CloudFront / Fastly                          │    │
│  │  • Global CDN distribution                                     │    │
│  │  • DDoS protection (Layer 3, 4, 7)                            │    │
│  │  • WAF (Web Application Firewall)                              │    │
│  │  • Bot detection & mitigation                                  │    │
│  │  • SSL/TLS termination at edge                                │    │
│  │  • Geographic blocking                                         │    │
│  └────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Forwarded requests
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      GATEWAY LAYER (Primary Entry)                       │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │  NGINX Gateway Cluster (2+ instances)                          │    │
│  │                                                                  │    │
│  │  Configuration:                                                  │    │
│  │  • VIP: 10.0.1.100 (keepalived VRRP)                           │    │
│  │  • Instance 1: 10.0.1.101 (MASTER)                             │    │
│  │  • Instance 2: 10.0.1.102 (BACKUP)                             │    │
│  │  • Port: 443 (HTTPS), 80 (HTTP redirect to HTTPS)             │    │
│  │                                                                  │    │
│  │  Features:                                                       │    │
│  │  ✓ HTTP/2 and HTTP/3 (QUIC) support                           │    │
│  │  ✓ SSL/TLS 1.3 with modern cipher suites                      │    │
│  │  ✓ Certificate auto-renewal (Let's Encrypt + certbot)         │    │
│  │  ✓ Request/Response buffering                                  │    │
│  │  ✓ Gzip/Brotli compression                                     │    │
│  │  ✓ Static asset caching                                        │    │
│  │  ✓ Upstream health checks (active + passive)                  │    │
│  │  ✓ Connection pooling & keepalive                             │    │
│  │  ✓ Request ID injection (X-Request-ID)                        │    │
│  │  ✓ Real IP forwarding (X-Real-IP, X-Forwarded-For)           │    │
│  └────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                ┌───────────────────┼───────────────────┐
                ▼                   ▼                   ▼
        /api/v1/admin/*      /api/v1/*           Static Assets
                │                   │                   │
                ▼                   ▼                   ▼
┌───────────────────────┐  ┌───────────────────────┐  ┌─────────────┐
│   ADMIN BACKEND       │  │  CUSTOMER BACKEND     │  │  CDN/S3     │
│   SERVICE POOL        │  │  SERVICE POOL         │  │             │
│                       │  │                       │  └─────────────┘
│  Upstream Config:     │  │  Upstream Config:     │
│  • Method: weighted   │  │  • Method: least_conn │
│  • Instances: 3       │  │  • Instances: 5       │
│  • Health: /health    │  │  • Health: /health    │
│  • Interval: 5s       │  │  • Interval: 5s       │
│  • Timeout: 3s        │  │  • Timeout: 3s        │
│  • Failures: 2        │  │  • Failures: 2        │
│                       │  │                       │
│  ┌─────────────────┐ │  │  ┌─────────────────┐ │
│  │ admin-1:3000    │ │  │  │ customer-1:3001 │ │
│  │ Weight: 100     │ │  │  │ Connections: 45 │ │
│  │ Status: UP      │ │  │  │ Status: UP      │ │
│  └─────────────────┘ │  │  └─────────────────┘ │
│                       │  │                       │
│  ┌─────────────────┐ │  │  ┌─────────────────┐ │
│  │ admin-2:3000    │ │  │  │ customer-2:3001 │ │
│  │ Weight: 100     │ │  │  │ Connections: 38 │ │
│  │ Status: UP      │ │  │  │ Status: UP      │ │
│  └─────────────────┘ │  │  └─────────────────┘ │
│                       │  │                       │
│  ┌─────────────────┐ │  │  ┌─────────────────┐ │
│  │ admin-3:3000    │ │  │  │ customer-3:3001 │ │
│  │ Weight: 50      │ │  │  │ Connections: 52 │ │
│  │ Status: UP      │ │  │  │ Status: UP      │ │
│  └─────────────────┘ │  │  └─────────────────┘ │
│         ▲             │  │         ▲             │
│         │ Cluster     │  │         │ Cluster     │
│         │ mode enabled│  │         │ mode enabled│
└───────────────────────┘  └───────────────────────┘
         │                          │
         └────────┬─────────────────┘
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SHARED SERVICES LAYER                         │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │  MongoDB        │  │  Redis Cluster  │  │  Message Queue  │ │
│  │  Replica Set    │  │  (Sentinel)     │  │  (Bull/Redis)   │ │
│  │  • Primary      │  │  • Master       │  │  • Jobs         │ │
│  │  • Secondary 1  │  │  • Replica 1    │  │  • Events       │ │
│  │  • Secondary 2  │  │  • Replica 2    │  │  • Scheduling   │ │
│  │  • Arbiter      │  │  • Sentinel x3  │  │                 │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                  OBSERVABILITY & MONITORING                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│  │ Prometheus  │  │  Grafana    │  │   Loki      │            │
│  │ • Metrics   │→ │ • Dashboard │ ← │ • Logs      │            │
│  │ • Alerts    │  │ • Alerts    │   │ • Search    │            │
│  └─────────────┘  └─────────────┘   └─────────────┘            │
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│  │   Jaeger    │  │ AlertManager│  │  PagerDuty  │            │
│  │ • Tracing   │  │ • Routing   │  │ • Incidents │            │
│  │ • Spans     │  │ • Dedup     │  │ • On-call   │            │
│  └─────────────┘  └─────────────┘  └─────────────┘            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Request Lifecycle & Routing

### Detailed Request Flow

#### 1. Client Request Initiation

```
Client → DNS Resolution → CDN (optional) → Load Balancer VIP → Gateway
```

**Timeline (ms):**
- DNS lookup: 0-50ms (cached) / 100-500ms (uncached)
- CDN edge: 10-50ms
- Gateway connection: 1-10ms
- Total to gateway: 11-600ms

#### 2. Gateway Request Processing

```
┌────────────────────────────────────────────────────────────────┐
│                    NGINX REQUEST PIPELINE                       │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Phase 1: Connection Acceptance (0-1ms)                        │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ • Accept TCP connection                                   │ │
│  │ • TLS handshake (if HTTPS)                               │ │
│  │ • Connection limits check (max_conns)                    │ │
│  │ • IP-based rate limiting (req/s per IP)                  │ │
│  │ • Geographic filtering (GeoIP)                           │ │
│  └──────────────────────────────────────────────────────────┘ │
│                          ▼                                      │
│  Phase 2: Request Parsing (1-2ms)                             │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ • Parse HTTP headers                                      │ │
│  │ • Validate request format                                │ │
│  │ • Extract routing information:                           │ │
│  │   - Path: /api/v1/admin/* or /api/v1/*                  │ │
│  │   - Headers: X-Tenant-ID, Authorization                  │ │
│  │   - Method: GET, POST, PUT, DELETE, etc.                │ │
│  │ • Inject X-Request-ID (UUID)                            │ │
│  │ • Extract Real IP (X-Forwarded-For)                     │ │
│  └──────────────────────────────────────────────────────────┘ │
│                          ▼                                      │
│  Phase 3: Security Checks (2-5ms)                             │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ • Rate limiting (Redis-backed, sliding window)           │ │
│  │   - Global: 1000 req/min                                │ │
│  │   - Per IP: 100 req/min                                 │ │
│  │   - Per endpoint: Custom limits                         │ │
│  │ • Request size limits (10MB default)                    │ │
│  │ • Malformed request rejection                           │ │
│  │ • Security headers injection                            │ │
│  └──────────────────────────────────────────────────────────┘ │
│                          ▼                                      │
│  Phase 4: Routing Decision (1-2ms)                            │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ Route Table:                                             │ │
│  │                                                          │ │
│  │ /api/v1/admin/*                                         │ │
│  │   → upstream: admin_backend                              │ │
│  │   → Additional auth: X-Admin-Token required             │ │
│  │   → Rate limit: 50 req/min per admin                    │ │
│  │                                                          │ │
│  │ /api/v1/*                                               │ │
│  │   → upstream: customer_backend                           │ │
│  │   → Rate limit: 100 req/min per user                    │ │
│  │                                                          │ │
│  │ /health, /metrics                                        │ │
│  │   → Return locally (nginx stub_status)                  │ │
│  │   → No upstream forwarding                              │ │
│  │                                                          │ │
│  │ /ws, /socket.io/*                                       │ │
│  │   → WebSocket upgrade                                    │ │
│  │   → Sticky sessions enabled (IP hash)                   │ │
│  └──────────────────────────────────────────────────────────┘ │
│                          ▼                                      │
│  Phase 5: Load Balancing (1-3ms)                              │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ Algorithm Selection:                                      │ │
│  │                                                          │ │
│  │ Admin Backend: Weighted Round Robin                      │ │
│  │   1. Check health status of all instances               │ │
│  │   2. Filter out DOWN instances                          │ │
│  │   3. Select next instance based on weights:             │ │
│  │      - admin-1:3000 (weight=100, 40% traffic)           │ │
│  │      - admin-2:3000 (weight=100, 40% traffic)           │ │
│  │      - admin-3:3000 (weight=50, 20% traffic)            │ │
│  │                                                          │ │
│  │ Customer Backend: Least Connections                      │ │
│  │   1. Check health status                                │ │
│  │   2. Count active connections per instance              │ │
│  │   3. Route to instance with fewest connections          │ │
│  │                                                          │ │
│  │ Session Affinity (when needed):                         │ │
│  │   • Method: Cookie-based (route cookie)                 │ │
│  │   • Fallback: IP hash                                   │ │
│  │   • TTL: 30 minutes                                     │ │
│  └──────────────────────────────────────────────────────────┘ │
│                          ▼                                      │
│  Phase 6: Upstream Connection (2-10ms)                        │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ • Get connection from pool (or create new)               │ │
│  │ • Connection timeout: 5s                                 │ │
│  │ • Keepalive: enabled (60s idle timeout)                 │ │
│  │ • Pool size: 1024 connections per upstream              │ │
│  └──────────────────────────────────────────────────────────┘ │
│                          ▼                                      │
│  Phase 7: Request Forwarding (Immediate)                      │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ • Forward request with additional headers:               │ │
│  │   - X-Request-ID: {uuid}                                │ │
│  │   - X-Real-IP: {client_ip}                              │ │
│  │   - X-Forwarded-For: {proxy_chain}                      │ │
│  │   - X-Forwarded-Proto: https                            │ │
│  │   - X-Forwarded-Host: {original_host}                   │ │
│  │   - X-Gateway-Time: {processing_time_ms}                │ │
│  │ • Read timeout: 60s (configurable per route)            │ │
│  │ • Send timeout: 60s                                     │ │
│  └──────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

#### 3. Backend Service Processing

```
Gateway → Backend Service → Database → Response
```

**Backend Service Timeline:**
- Request authentication: 5-20ms (JWT validation)
- Database query: 10-100ms (depends on query complexity)
- Business logic: 10-500ms
- Response serialization: 5-20ms
- Total backend: 30-640ms

#### 4. Response Flow

```
┌────────────────────────────────────────────────────────────────┐
│                 NGINX RESPONSE PIPELINE                         │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Phase 1: Response Reception (Immediate)                       │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ • Receive response from upstream                          │ │
│  │ • Buffer response (if needed)                            │ │
│  │ • Check for upstream errors                              │ │
│  └──────────────────────────────────────────────────────────┘ │
│                          ▼                                      │
│  Phase 2: Response Processing (1-5ms)                         │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ • Inject security headers:                               │ │
│  │   - Strict-Transport-Security                            │ │
│  │   - X-Content-Type-Options                               │ │
│  │   - X-Frame-Options                                      │ │
│  │   - Content-Security-Policy                              │ │
│  │ • Add gateway headers:                                   │ │
│  │   - X-Gateway-Time: {total_processing_ms}                │ │
│  │   - X-Upstream-Time: {backend_time_ms}                   │ │
│  │   - X-Cache-Status: HIT/MISS/BYPASS                      │ │
│  │ • Compression (if enabled and applicable):               │ │
│  │   - gzip for older clients                               │ │
│  │   - brotli for modern browsers                           │ │
│  └──────────────────────────────────────────────────────────┘ │
│                          ▼                                      │
│  Phase 3: Caching Decision (Optional, 1-2ms)                  │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ • Check cache-control headers                            │ │
│  │ • Store in cache if eligible                             │ │
│  │ • Cache key: {method}:{path}:{query}                     │ │
│  └──────────────────────────────────────────────────────────┘ │
│                          ▼                                      │
│  Phase 4: Response Delivery (Network-dependent)               │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ • Send response to client                                │ │
│  │ • Update metrics                                         │ │
│  │ • Log request (access log)                               │ │
│  │ • Close or return connection to pool                     │ │
│  └──────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

#### 5. End-to-End Timeline

| Phase | Component | Time (ms) | Cumulative (ms) |
|-------|-----------|-----------|-----------------|
| DNS Resolution | Client | 0-500 | 0-500 |
| CDN Edge (optional) | CDN | 10-50 | 10-550 |
| Gateway Processing | NGINX | 5-15 | 15-565 |
| Backend Processing | Express | 30-640 | 45-1205 |
| Gateway Response | NGINX | 1-5 | 46-1210 |
| Network Delivery | Internet | 10-200 | 56-1410 |
| **Total End-to-End** | | | **56-1410ms** |

**Target SLAs:**
- P50 (median): < 200ms
- P90: < 500ms
- P95: < 800ms
- P99: < 1500ms
- P99.9: < 3000ms

---

## Load Balancing Strategy

### Algorithm Selection Criteria

#### 1. Admin Backend - Weighted Round Robin

**Rationale:**
- Predictable load distribution
- Manual control over traffic allocation
- Allows gradual rollout of new instances (canary deployments)
- Works well with homogeneous workloads

**Configuration:**
```nginx
upstream admin_backend {
    # Zone for shared memory (statistics, health)
    zone admin_backend 64k;

    # Health check configuration
    health_check interval=5s fails=2 passes=2 uri=/health match=healthy_check;

    # Server instances with weights
    server 10.0.2.101:3000 weight=100 max_fails=2 fail_timeout=10s;
    server 10.0.2.102:3000 weight=100 max_fails=2 fail_timeout=10s;
    server 10.0.2.103:3000 weight=50  max_fails=2 fail_timeout=10s;

    # Backup server (only used when all primary servers are down)
    server 10.0.2.104:3000 backup;

    # Connection limits
    keepalive 32;
    keepalive_timeout 60s;
    keepalive_requests 100;
}

# Health check matcher
match healthy_check {
    status 200;
    header Content-Type = application/json;
    body ~ "\"status\":\"healthy\"";
}
```

**Traffic Distribution:**
- admin-1: 40% (weight 100 / total 250)
- admin-2: 40% (weight 100 / total 250)
- admin-3: 20% (weight 50 / total 250)
- admin-4: Only when others fail (backup)

#### 2. Customer Backend - Least Connections

**Rationale:**
- Optimal for variable request processing times
- Automatically balances load based on actual server capacity
- Prevents overloading slower instances
- Better for long-running requests (consultations, file uploads)

**Configuration:**
```nginx
upstream customer_backend {
    # Least connections algorithm
    least_conn;

    # Zone for shared memory
    zone customer_backend 64k;

    # Health checks
    health_check interval=5s fails=2 passes=2 uri=/health match=healthy_check;

    # Server instances
    server 10.0.3.101:3001 max_fails=2 fail_timeout=10s max_conns=500;
    server 10.0.3.102:3001 max_fails=2 fail_timeout=10s max_conns=500;
    server 10.0.3.103:3001 max_fails=2 fail_timeout=10s max_conns=500;
    server 10.0.3.104:3001 max_fails=2 fail_timeout=10s max_conns=500;
    server 10.0.3.105:3001 max_fails=2 fail_timeout=10s max_conns=500;

    # Backup server
    server 10.0.3.106:3001 backup;

    # Connection pooling
    keepalive 64;
    keepalive_timeout 60s;
}
```

**Dynamic Load Distribution:**
- Traffic automatically routed to instance with fewest active connections
- Real-time adjustment based on server load
- Maximum 500 concurrent connections per instance
- Spillover to backup when all instances at max capacity

#### 3. Session Affinity (Sticky Sessions)

**Use Case:** WebSocket connections, stateful operations

**Methods:**

a) **Cookie-based Stickiness** (Preferred)
```nginx
upstream customer_backend {
    least_conn;

    # Cookie-based session affinity
    sticky cookie srv_id expires=30m path=/ httponly secure;

    server 10.0.3.101:3001;
    server 10.0.3.102:3001;
    server 10.0.3.103:3001;
}
```

b) **IP Hash** (Fallback)
```nginx
upstream customer_backend {
    ip_hash;

    server 10.0.3.101:3001;
    server 10.0.3.102:3001;
    server 10.0.3.103:3001;
}
```

**Trade-offs:**
- Cookie-based: More reliable, survives IP changes, requires client cookie support
- IP hash: Simpler, no client dependency, issues with NAT/proxies

### Health Check Strategy

#### Active Health Checks

**Configuration:**
```nginx
# In http block
upstream admin_backend {
    zone admin_backend 64k;

    # Active health check
    health_check
        interval=5s          # Check every 5 seconds
        fails=2              # Mark down after 2 failures
        passes=2             # Mark up after 2 successes
        uri=/health          # Health endpoint
        match=admin_healthy  # Response matcher
        mandatory;           # Don't route to unchecked servers

    server 10.0.2.101:3000;
    server 10.0.2.102:3000;
    server 10.0.2.103:3000;
}

# Health check response matcher
match admin_healthy {
    status 200;
    header Content-Type ~ "application/json";
    body ~ "\"status\":\"healthy\"";
    body ~ "\"database\":{\"status\":\"ok\"}";
}
```

**Health Check Response Format (Backend):**
```json
{
  "status": "healthy",
  "timestamp": "2025-12-28T10:30:00Z",
  "service": "admin-server",
  "version": "2.0.1",
  "uptime": 86400,
  "checks": {
    "database": {
      "status": "ok",
      "latency": 12
    },
    "redis": {
      "status": "ok",
      "latency": 3
    },
    "memory": {
      "status": "ok",
      "usagePercentage": 45
    }
  }
}
```

#### Passive Health Checks

**Monitors actual request/response behavior:**
```nginx
upstream customer_backend {
    server 10.0.3.101:3001 max_fails=3 fail_timeout=30s;
    server 10.0.3.102:3001 max_fails=3 fail_timeout=30s;
    server 10.0.3.103:3001 max_fails=3 fail_timeout=30s;
}
```

**Behavior:**
- After 3 consecutive failures (5xx errors, timeouts), mark server as down
- Retry after 30 seconds
- Gradually re-introduce traffic (slow start)

### Connection Pooling & Keepalive

**Optimization for Backend Connections:**
```nginx
upstream customer_backend {
    server 10.0.3.101:3001;

    # Connection pooling
    keepalive 64;              # Maintain 64 idle connections
    keepalive_timeout 60s;     # Keep connections alive for 60s
    keepalive_requests 100;    # Reuse connection for 100 requests
}

# In location block
location /api/v1/ {
    proxy_pass http://customer_backend;

    # HTTP/1.1 required for keepalive
    proxy_http_version 1.1;
    proxy_set_header Connection "";

    # Connection timeouts
    proxy_connect_timeout 5s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;
}
```

**Benefits:**
- Reduced connection overhead (TCP handshake, TLS negotiation)
- Lower latency (reuse existing connections)
- Reduced CPU usage on both gateway and backends
- Better throughput under high load

---

## Fault Tolerance & High Availability

### Multi-Layer Redundancy

```
┌─────────────────────────────────────────────────────────────┐
│              FAULT TOLERANCE ARCHITECTURE                    │
└─────────────────────────────────────────────────────────────┘

Layer 1: DNS Failover
├── Primary: gateway-1.example.com (10.0.1.100)
├── Secondary: gateway-2.example.com (10.0.1.200)
└── Health check: HTTP GET /health every 30s

Layer 2: Gateway High Availability (keepalived VRRP)
├── MASTER: nginx-1 (10.0.1.101) - Active
├── BACKUP: nginx-2 (10.0.1.102) - Standby
├── Virtual IP: 10.0.1.100 (shared)
└── Failover time: < 3 seconds

Layer 3: Backend Service Redundancy
├── Admin Backend Pool
│   ├── Instance 1: 10.0.2.101:3000 (Leader)
│   ├── Instance 2: 10.0.2.102:3000 (Follower)
│   ├── Instance 3: 10.0.2.103:3000 (Follower)
│   └── Instance 4: 10.0.2.104:3000 (Backup)
│
└── Customer Backend Pool
    ├── Instance 1: 10.0.3.101:3001 (Leader)
    ├── Instance 2: 10.0.3.102:3001 (Follower)
    ├── Instance 3: 10.0.3.103:3001 (Follower)
    ├── Instance 4: 10.0.3.104:3001 (Follower)
    ├── Instance 5: 10.0.3.105:3001 (Follower)
    └── Instance 6: 10.0.3.106:3001 (Backup)

Layer 4: Database High Availability
├── MongoDB Replica Set
│   ├── Primary: 10.0.4.101:27017
│   ├── Secondary: 10.0.4.102:27017
│   ├── Secondary: 10.0.4.103:27017
│   └── Arbiter: 10.0.4.104:27017
│
└── Redis Sentinel
    ├── Master: 10.0.5.101:6379
    ├── Replica 1: 10.0.5.102:6379
    ├── Replica 2: 10.0.5.103:6379
    ├── Sentinel 1: 10.0.5.101:26379
    ├── Sentinel 2: 10.0.5.102:26379
    └── Sentinel 3: 10.0.5.103:26379
```

### Gateway High Availability (VRRP)

**keepalived Configuration:**

```conf
# /etc/keepalived/keepalived.conf (MASTER)

vrrp_script check_nginx {
    script "/usr/local/bin/check_nginx_health.sh"
    interval 2                 # Check every 2 seconds
    timeout 3                  # Timeout after 3 seconds
    weight -20                 # Reduce priority by 20 on failure
    fall 2                     # Require 2 failures to mark down
    rise 2                     # Require 2 successes to mark up
}

vrrp_instance VI_1 {
    state MASTER               # Initial state
    interface eth0             # Network interface
    virtual_router_id 51       # Must match across instances
    priority 100               # MASTER has higher priority
    advert_int 1               # VRRP advertisement interval (seconds)

    authentication {
        auth_type PASS
        auth_pass S3cret!VRRPpassw0rd
    }

    virtual_ipaddress {
        10.0.1.100/24          # Virtual IP
    }

    track_script {
        check_nginx
    }

    notify_master "/usr/local/bin/notify_master.sh"
    notify_backup "/usr/local/bin/notify_backup.sh"
    notify_fault "/usr/local/bin/notify_fault.sh"
}
```

**Health Check Script:**
```bash
#!/bin/bash
# /usr/local/bin/check_nginx_health.sh

# Check if NGINX is running
if ! pidof nginx > /dev/null; then
    echo "NGINX process not running"
    exit 1
fi

# Check if NGINX can serve requests
if ! curl -sf http://localhost/health > /dev/null; then
    echo "NGINX health check failed"
    exit 1
fi

# Check upstream health
UNHEALTHY=$(curl -sf http://localhost/nginx_status | grep -c "unavail")
if [ "$UNHEALTHY" -gt "2" ]; then
    echo "Too many unhealthy upstreams"
    exit 1
fi

exit 0
```

**Failover Behavior:**
1. MASTER fails → health check fails twice (4 seconds)
2. MASTER priority drops below BACKUP (100 → 80 < 90)
3. BACKUP promotes itself to MASTER
4. BACKUP takes over Virtual IP (10.0.1.100)
5. BACKUP sends gratuitous ARP to update network
6. **Total failover time: < 3 seconds**
7. Client connections automatically route to new MASTER
8. When original MASTER recovers, it becomes BACKUP (priority 80 < 90)

### Zero-Downtime Deployments

#### Rolling Deployment Strategy

**Step 1: Deploy to Subset of Instances**
```bash
# Update instance 3 (lowest priority/weight)
1. Remove admin-3 from load balancer rotation
   → nginx: set server weight=0 or use upstream_conf API
2. Wait for in-flight requests to complete (drain period: 30s)
3. Stop admin-3 service
4. Deploy new code to admin-3
5. Start admin-3 service
6. Health check: Wait for /health to return 200
7. Gradually increase traffic: weight=10 → 25 → 50 (canary)
8. Monitor metrics for 5 minutes
9. If healthy: full traffic (weight=50)
10. If issues: rollback immediately
```

**Step 2: Continue to Remaining Instances**
```bash
# Repeat for admin-2, then admin-1
# Always leave 2+ instances serving traffic
# Never deploy to leader and follower simultaneously
```

**Automated Deployment Script:**
```bash
#!/bin/bash
# deploy-rolling.sh

INSTANCES=("10.0.2.101" "10.0.2.102" "10.0.2.103")
SERVICE="admin-server"
DRAIN_TIME=30
CANARY_TIME=300  # 5 minutes

for INSTANCE in "${INSTANCES[@]}"; do
    echo "Deploying to $INSTANCE..."

    # 1. Drain traffic
    curl -X POST "http://gateway/api/admin/upstream/drain?server=$INSTANCE"
    sleep $DRAIN_TIME

    # 2. Deploy
    ssh "$INSTANCE" "cd /opt/app && git pull && npm ci && pm2 reload $SERVICE"

    # 3. Wait for health
    while ! curl -sf "http://$INSTANCE:3000/health" > /dev/null; do
        echo "Waiting for $INSTANCE to be healthy..."
        sleep 5
    done

    # 4. Canary deployment
    curl -X POST "http://gateway/api/admin/upstream/weight?server=$INSTANCE&weight=10"
    sleep 60
    curl -X POST "http://gateway/api/admin/upstream/weight?server=$INSTANCE&weight=25"
    sleep 120
    curl -X POST "http://gateway/api/admin/upstream/weight?server=$INSTANCE&weight=50"

    # 5. Monitor
    echo "Monitoring $INSTANCE for $CANARY_TIME seconds..."
    sleep $CANARY_TIME

    # 6. Check error rate
    ERROR_RATE=$(curl -s "http://prometheus/api/v1/query?query=rate(http_errors_total{instance='$INSTANCE'}[5m])")
    if [ "$ERROR_RATE" -gt "0.01" ]; then
        echo "ERROR: High error rate on $INSTANCE, rolling back!"
        ssh "$INSTANCE" "cd /opt/app && git checkout HEAD~1 && npm ci && pm2 reload $SERVICE"
        exit 1
    fi

    # 7. Restore full traffic
    curl -X POST "http://gateway/api/admin/upstream/weight?server=$INSTANCE&weight=100"

    echo "Successfully deployed to $INSTANCE"
done
```

### Circuit Breaker Pattern

**Prevent cascading failures:**

```nginx
# NGINX configuration with circuit breaker
upstream customer_backend {
    server 10.0.3.101:3001 max_fails=5 fail_timeout=30s;
    server 10.0.3.102:3001 max_fails=5 fail_timeout=30s;
    server 10.0.3.103:3001 max_fails=5 fail_timeout=30s;

    # Slow start: gradually increase traffic after recovery
    server 10.0.3.101:3001 slow_start=60s;
}

location /api/v1/ {
    proxy_pass http://customer_backend;

    # Circuit breaker behavior
    proxy_connect_timeout 5s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;
    proxy_next_upstream error timeout http_502 http_503 http_504;
    proxy_next_upstream_tries 2;
    proxy_next_upstream_timeout 10s;

    # Return 503 if all upstreams fail
    error_page 502 503 504 = @fallback;
}

location @fallback {
    return 503 '{"success":false,"error":{"code":"SERVICE_UNAVAILABLE","message":"Service temporarily unavailable"}}';
    add_header Content-Type application/json;
    add_header Retry-After 30;
}
```

**Circuit Breaker States:**

```
CLOSED (Normal Operation)
  ↓ (5 failures in 30s window)
OPEN (All requests fail fast)
  ↓ (After 30s timeout)
HALF-OPEN (Allow test request)
  ↓ (Success)          ↓ (Failure)
CLOSED              OPEN (reset timer)
```

### Disaster Recovery

#### Backup and Restore

**Automated Backups:**
```bash
# /etc/cron.d/gateway-backup
0 2 * * * /usr/local/bin/backup-gateway-config.sh

#!/bin/bash
# backup-gateway-config.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/gateway/$DATE"

mkdir -p "$BACKUP_DIR"

# Backup NGINX configuration
tar -czf "$BACKUP_DIR/nginx-config.tar.gz" /etc/nginx/

# Backup SSL certificates
tar -czf "$BACKUP_DIR/ssl-certs.tar.gz" /etc/letsencrypt/

# Backup keepalived configuration
cp /etc/keepalived/keepalived.conf "$BACKUP_DIR/"

# Upload to S3
aws s3 sync "$BACKUP_DIR" "s3://backups/gateway/$DATE"

# Retain last 30 days
find /backups/gateway -type d -mtime +30 -exec rm -rf {} \;
```

#### Regional Failover

**Multi-Region Architecture:**
```
Region 1 (US-East):
  - Gateway Cluster 1 (Active)
  - Admin Backend Pool 1 (Active)
  - Customer Backend Pool 1 (Active)
  - Database Primary

Region 2 (US-West):
  - Gateway Cluster 2 (Standby)
  - Admin Backend Pool 2 (Standby)
  - Customer Backend Pool 2 (Standby)
  - Database Secondary

DNS Failover:
  - Primary: region1.example.com
  - Secondary: region2.example.com
  - Health check: TCP port 443
  - Failover time: 60-120s (DNS TTL)
```

---

## Security Enforcement Model

### Defense in Depth

```
┌─────────────────────────────────────────────────────────────┐
│                    SECURITY LAYERS                           │
└─────────────────────────────────────────────────────────────┘

Layer 1: Network Security
├── Firewall Rules (iptables/nftables)
│   ├── Allow: 80/443 (HTTP/HTTPS)
│   ├── Allow: 22 (SSH - restricted IPs)
│   └── Deny: All other ports
├── DDoS Protection (iptables connection limits)
└── Geographic Blocking (GeoIP)

Layer 2: TLS/SSL Encryption
├── TLS 1.3 (preferred)
├── TLS 1.2 (minimum)
├── Modern cipher suites only
├── HSTS (max-age=31536000; includeSubDomains; preload)
├── Certificate pinning (optional)
└── Automatic renewal (certbot)

Layer 3: Gateway Security
├── Rate Limiting (Redis-backed)
│   ├── Global: 1000 req/min
│   ├── Per IP: 100 req/min
│   ├── Per endpoint: Custom limits
│   └── Burst allowance: 20 requests
├── Request Size Limits
│   ├── Headers: 16KB
│   ├── Body: 10MB (default), 100MB (uploads)
│   └── URI length: 8KB
├── Malicious Request Detection
│   ├── SQL injection patterns
│   ├── XSS patterns
│   ├── Path traversal
│   └── Null bytes
└── IP Blacklisting
    ├── Automatic: Failed auth attempts
    ├── Manual: Admin interface
    └── Duration: 1 hour (default)

Layer 4: WAF (Web Application Firewall)
├── ModSecurity / NAXSI (NGINX)
├── OWASP Core Rule Set
├── Custom rules for platform
├── Anomaly scoring
└── Blocking mode (production) / Detection mode (staging)

Layer 5: Authentication & Authorization
├── JWT Token Validation (at gateway - optional)
├── OAuth 2.0 / OpenID Connect
├── API Key Validation
├── Session Management
└── MFA Support

Layer 6: Application Security (Backend)
├── Input validation (existing)
├── Output encoding (existing)
├── CSRF protection (existing)
├── XSS prevention (existing)
├── SQL injection prevention (existing)
└── Parameterized queries (existing)

Layer 7: Data Security
├── Encryption at rest (database)
├── Encryption in transit (TLS)
├── PII data masking (logs)
├── Secure secret management (Vault)
└── Audit logging (all access)

Layer 8: Monitoring & Response
├── Intrusion Detection (Fail2ban)
├── Log Analysis (ELK Stack)
├── Anomaly Detection (AI-based)
├── Automated Response (block IPs)
└── Security Alerts (PagerDuty)
```

### Rate Limiting Implementation

#### Redis-Backed Rate Limiting

**NGINX Configuration:**
```nginx
# Redis connection
upstream redis_backend {
    server 10.0.5.101:6379;
    server 10.0.5.102:6379;
    keepalive 10;
}

# Shared memory zone for rate limiting
limit_req_zone $binary_remote_addr zone=general:10m rate=100r/m;
limit_req_zone $binary_remote_addr zone=api:10m rate=100r/m;
limit_req_zone $binary_remote_addr zone=admin:10m rate=50r/m;
limit_req_zone $http_authorization zone=per_user:10m rate=200r/m;

# Connection limits
limit_conn_zone $binary_remote_addr zone=addr:10m;

server {
    # General rate limit
    limit_req zone=general burst=20 nodelay;
    limit_conn addr 10;

    location /api/v1/ {
        # API rate limit (more permissive)
        limit_req zone=api burst=30 nodelay;
        limit_req_status 429;

        proxy_pass http://customer_backend;
    }

    location /api/v1/admin/ {
        # Admin rate limit (stricter)
        limit_req zone=admin burst=10 nodelay;
        limit_req_status 429;

        # Additional header-based rate limiting
        limit_req zone=per_user burst=50 nodelay;

        proxy_pass http://admin_backend;
    }
}
```

**Advanced Rate Limiting with Lua:**
```nginx
http {
    # Lua-based dynamic rate limiting
    lua_shared_dict rate_limit 10m;

    init_by_lua_block {
        local redis = require "resty.redis"
        rate_limiter = require "rate_limiter"
    }

    access_by_lua_block {
        local rl = require "rate_limiter"
        local ok, err = rl:check_rate_limit()

        if not ok then
            ngx.status = 429
            ngx.header["Retry-After"] = 60
            ngx.say('{"error":"Rate limit exceeded"}')
            ngx.exit(429)
        end
    }
}
```

**Rate Limit Response:**
```http
HTTP/1.1 429 Too Many Requests
Content-Type: application/json
Retry-After: 60
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1735473600

{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded. Please try again later.",
    "retryAfter": 60
  }
}
```

### Authentication Enforcement

#### Admin vs Customer Traffic Separation

**NGINX Configuration:**
```nginx
# Admin traffic - stricter security
location /api/v1/admin/ {
    # Require specific admin headers
    if ($http_x_admin_token = "") {
        return 401 '{"error":"Admin token required"}';
    }

    # IP whitelist for admin (optional)
    allow 10.0.0.0/8;      # Internal network
    allow 203.0.113.0/24;  # Office IP range
    deny all;

    # JWT validation at gateway (optional)
    auth_request /auth/admin/validate;
    auth_request_set $auth_user $upstream_http_x_auth_user;
    auth_request_set $auth_role $upstream_http_x_auth_role;

    # Forward auth info to backend
    proxy_set_header X-Auth-User $auth_user;
    proxy_set_header X-Auth-Role $auth_role;

    # Stricter rate limits
    limit_req zone=admin burst=10 nodelay;

    # Longer timeouts for admin operations
    proxy_read_timeout 120s;

    proxy_pass http://admin_backend;
}

# Customer traffic - standard security
location /api/v1/ {
    # JWT validation (optional, backend already does this)
    auth_request /auth/validate;
    auth_request_set $auth_user $upstream_http_x_auth_user;

    # Standard rate limits
    limit_req zone=api burst=30 nodelay;

    # Forward auth info
    proxy_set_header X-Auth-User $auth_user;

    proxy_pass http://customer_backend;
}

# Internal auth validation endpoint
location = /auth/validate {
    internal;
    proxy_pass http://auth_service/validate;
    proxy_pass_request_body off;
    proxy_set_header Content-Length "";
    proxy_set_header X-Original-URI $request_uri;
    proxy_set_header X-Original-Method $request_method;
}

location = /auth/admin/validate {
    internal;
    proxy_pass http://auth_service/validate/admin;
    proxy_pass_request_body off;
    proxy_set_header Content-Length "";
}
```

### DDoS Protection

**Multi-Tiered Defense:**

```nginx
# Layer 1: Connection limits
http {
    # Limit simultaneous connections per IP
    limit_conn_zone $binary_remote_addr zone=conn_limit_per_ip:10m;
    limit_conn_zone $server_name zone=conn_limit_per_server:10m;

    server {
        # Max 10 connections per IP
        limit_conn conn_limit_per_ip 10;

        # Max 1000 total server connections
        limit_conn conn_limit_per_server 1000;

        # Connection timeout
        client_body_timeout 10s;
        client_header_timeout 10s;
        keepalive_timeout 30s;
        send_timeout 10s;
    }
}

# Layer 2: Request rate limiting (already covered above)

# Layer 3: Slowloris protection
http {
    client_header_buffer_size 1k;
    large_client_header_buffers 4 8k;
    client_body_buffer_size 16k;
    client_max_body_size 10m;
}

# Layer 4: SYN flood protection (iptables)
# Run on gateway servers
# iptables -A INPUT -p tcp --syn -m limit --limit 1/s --limit-burst 3 -j ACCEPT
# iptables -A INPUT -p tcp --syn -j DROP

# Layer 5: Fail2ban for automatic IP blocking
# /etc/fail2ban/jail.local
[nginx-req-limit]
enabled = true
filter = nginx-req-limit
action = iptables-multiport[name=ReqLimit, port="http,https"]
logpath = /var/log/nginx/error.log
findtime = 600
bantime = 3600
maxretry = 10
```

### SSL/TLS Configuration

**Modern, Secure Configuration:**

```nginx
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name api.insightserenity.com;

    # SSL certificates (Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/api.insightserenity.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.insightserenity.com/privkey.pem;
    ssl_trusted_certificate /etc/letsencrypt/live/api.insightserenity.com/chain.pem;

    # SSL protocols (TLS 1.2+)
    ssl_protocols TLSv1.2 TLSv1.3;

    # Modern cipher suites (priority to TLS 1.3)
    ssl_ciphers 'TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384';
    ssl_prefer_server_ciphers on;

    # SSL session caching
    ssl_session_cache shared:SSL:50m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;

    # OCSP stapling
    ssl_stapling on;
    ssl_stapling_verify on;
    resolver 8.8.8.8 8.8.4.4 valid=300s;
    resolver_timeout 5s;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;

    # Content Security Policy
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https://api.insightserenity.com" always;
}

# HTTP to HTTPS redirect
server {
    listen 80;
    listen [::]:80;
    server_name api.insightserenity.com;

    return 301 https://$server_name$request_uri;
}
```

---

## Observability & Monitoring

### Metrics Collection

**Prometheus Configuration:**

```yaml
# prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  # NGINX metrics
  - job_name: 'nginx'
    static_configs:
      - targets:
        - '10.0.1.101:9113'  # nginx-prometheus-exporter
        - '10.0.1.102:9113'
        labels:
          service: 'gateway'

  # Admin backend metrics
  - job_name: 'admin-backend'
    static_configs:
      - targets:
        - '10.0.2.101:9090'
        - '10.0.2.102:9090'
        - '10.0.2.103:9090'
        labels:
          service: 'admin-server'

  # Customer backend metrics
  - job_name: 'customer-backend'
    static_configs:
      - targets:
        - '10.0.3.101:9090'
        - '10.0.3.102:9090'
        - '10.0.3.103:9090'
        labels:
          service: 'customer-services'

  # Node metrics
  - job_name: 'node'
    static_configs:
      - targets:
        - '10.0.1.101:9100'  # Gateway 1
        - '10.0.1.102:9100'  # Gateway 2
        - '10.0.2.101:9100'  # Admin 1
        - '10.0.3.101:9100'  # Customer 1
        labels:
          service: 'infrastructure'

  # Redis metrics
  - job_name: 'redis'
    static_configs:
      - targets:
        - '10.0.5.101:9121'
        - '10.0.5.102:9121'
        labels:
          service: 'redis'

  # MongoDB metrics
  - job_name: 'mongodb'
    static_configs:
      - targets:
        - '10.0.4.101:9216'
        - '10.0.4.102:9216'
        labels:
          service: 'mongodb'
```

**Key Metrics to Track:**

```promql
# Gateway Metrics
nginx_http_requests_total
nginx_http_request_duration_seconds
nginx_connections_active
nginx_connections_reading
nginx_connections_writing
nginx_connections_waiting
nginx_upstream_responses_total
nginx_upstream_response_time_seconds

# Backend Metrics
http_request_duration_seconds
http_requests_total{status_code="200"}
http_requests_total{status_code="4xx"}
http_requests_total{status_code="5xx"}
active_connections
database_query_duration_seconds
redis_operations_total

# System Metrics
node_cpu_seconds_total
node_memory_MemAvailable_bytes
node_disk_io_time_seconds_total
node_network_receive_bytes_total
node_network_transmit_bytes_total

# Business Metrics
consultations_booked_total
payments_processed_total
user_registrations_total
```

### Alerting Rules

**Prometheus Alert Rules:**

```yaml
# alerts.yml
groups:
  - name: gateway_alerts
    interval: 30s
    rules:
      # High error rate
      - alert: HighErrorRate
        expr: rate(nginx_http_requests_total{status=~"5.."}[5m]) > 0.05
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "High error rate on {{ $labels.instance }}"
          description: "Error rate is {{ $value | humanizePercentage }}"

      # Gateway down
      - alert: GatewayDown
        expr: up{job="nginx"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Gateway {{ $labels.instance }} is down"

      # High latency
      - alert: HighLatency
        expr: histogram_quantile(0.95, rate(nginx_http_request_duration_seconds_bucket[5m])) > 1.5
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High latency on {{ $labels.instance }}"
          description: "P95 latency is {{ $value }}s"

      # Upstream unhealthy
      - alert: UpstreamUnhealthy
        expr: nginx_upstream_server_fails_total > 10
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "Upstream {{ $labels.upstream }} has failing servers"

  - name: backend_alerts
    interval: 30s
    rules:
      # Backend down
      - alert: BackendDown
        expr: up{job=~"admin-backend|customer-backend"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Backend {{ $labels.instance }} is down"

      # High memory usage
      - alert: HighMemoryUsage
        expr: (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) < 0.1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High memory usage on {{ $labels.instance }}"
          description: "Available memory: {{ $value | humanizePercentage }}"

      # Database connection pool exhausted
      - alert: DatabasePoolExhausted
        expr: mongodb_connections_current >= mongodb_connections_available * 0.9
        for: 3m
        labels:
          severity: warning
        annotations:
          summary: "Database connection pool nearly exhausted"
```

### Logging Strategy

**Centralized Logging with Loki:**

```yaml
# promtail.yml (log shipper on each server)
server:
  http_listen_port: 9080
  grpc_listen_port: 0

positions:
  filename: /tmp/positions.yaml

clients:
  - url: http://loki:3100/loki/api/v1/push

scrape_configs:
  # NGINX access logs
  - job_name: nginx-access
    static_configs:
      - targets:
          - localhost
        labels:
          job: nginx
          __path__: /var/log/nginx/access.log

  # NGINX error logs
  - job_name: nginx-error
    static_configs:
      - targets:
          - localhost
        labels:
          job: nginx
          __path__: /var/log/nginx/error.log

  # Application logs
  - job_name: app-logs
    static_configs:
      - targets:
          - localhost
        labels:
          job: application
          __path__: /var/log/app/*.log
```

**Structured Logging Format:**

```json
{
  "timestamp": "2025-12-28T10:30:45.123Z",
  "level": "info",
  "service": "customer-services",
  "requestId": "req_abc123",
  "userId": "user_xyz789",
  "method": "POST",
  "path": "/api/v1/consultations",
  "statusCode": 201,
  "duration": 245,
  "ip": "203.0.113.45",
  "userAgent": "Mozilla/5.0...",
  "message": "Consultation created successfully"
}
```

### Distributed Tracing

**Jaeger Integration:**

```nginx
# NGINX OpenTracing
load_module modules/ngx_http_opentracing_module.so;

http {
    opentracing on;
    opentracing_trace_locations off;
    opentracing_operation_name "$request_method $uri";

    # Jaeger configuration
    opentracing_load_tracer /usr/local/lib/libjaegertracing_plugin.so /etc/jaeger-config.json;

    server {
        location /api/ {
            opentracing_tag "http.method" "$request_method";
            opentracing_tag "http.url" "$scheme://$host$request_uri";
            opentracing_tag "http.status_code" "$status";

            proxy_pass http://backend;

            # Propagate trace context
            proxy_set_header uber-trace-id $opentracing_context_uber_trace_id;
            proxy_set_header trace-id $opentracing_context_trace_id;
        }
    }
}
```

**Backend Trace Instrumentation:**

```javascript
// Backend services should add OpenTelemetry
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { JaegerExporter } = require('@opentelemetry/exporter-jaeger');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');
const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
const { ExpressInstrumentation } = require('@opentelemetry/instrumentation-express');
const { MongoDBInstrumentation } = require('@opentelemetry/instrumentation-mongodb');

const provider = new NodeTracerProvider();
const exporter = new JaegerExporter({
  endpoint: 'http://jaeger:14268/api/traces',
});

provider.addSpanProcessor(new BatchSpanProcessor(exporter));
provider.register();

registerInstrumentations({
  instrumentations: [
    new HttpInstrumentation(),
    new ExpressInstrumentation(),
    new MongoDBInstrumentation(),
  ],
});
```

### Dashboards

**Grafana Dashboard Examples:**

1. **Gateway Overview**
   - Request rate (req/s)
   - Error rate (%)
   - P50/P90/P95/P99 latency
   - Active connections
   - Upstream health status
   - SSL certificate expiry

2. **Backend Services**
   - Request throughput
   - Response times by endpoint
   - Error breakdown (4xx vs 5xx)
   - Database query performance
   - Memory/CPU usage
   - Active users

3. **Infrastructure**
   - Server resource utilization
   - Database replication lag
   - Redis hit rate
   - Network traffic
   - Disk I/O

4. **Business Metrics**
   - Consultations per hour
   - Revenue (payment tracking)
   - User registrations
   - Active sessions
   - API usage by client

---

## Resilience Mechanisms

### Retry Logic

**NGINX Retry Configuration:**

```nginx
location /api/ {
    proxy_pass http://backend;

    # Retry on specific errors
    proxy_next_upstream error timeout http_502 http_503 http_504;

    # Max retry attempts
    proxy_next_upstream_tries 2;

    # Total time for retries
    proxy_next_upstream_timeout 10s;
}
```

### Timeouts

**Comprehensive Timeout Configuration:**

```nginx
http {
    # Client timeouts
    client_body_timeout 12s;
    client_header_timeout 12s;

    # Keepalive
    keepalive_timeout 30s;
    keepalive_requests 100;

    # Send timeout
    send_timeout 10s;

    upstream backend {
        server 10.0.3.101:3001;

        # Connection keepalive
        keepalive 32;
        keepalive_timeout 60s;
    }

    server {
        location /api/ {
            # Proxy timeouts
            proxy_connect_timeout 5s;
            proxy_send_timeout 60s;
            proxy_read_timeout 60s;

            # Long-running operations
            location /api/v1/exports/ {
                proxy_read_timeout 300s;
            }

            # Real-time endpoints
            location /api/v1/stream/ {
                proxy_read_timeout 3600s;
            }
        }
    }
}
```

### Graceful Degradation

**Fallback Responses:**

```nginx
# Cached responses during backend outage
proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=api_cache:10m inactive=60m use_temp_path=off;

location /api/v1/ {
    proxy_pass http://backend;

    # Use stale cache on error
    proxy_cache api_cache;
    proxy_cache_valid 200 5m;
    proxy_cache_use_stale error timeout http_500 http_502 http_503 http_504;
    proxy_cache_background_update on;
    proxy_cache_lock on;

    # Static fallback
    error_page 502 503 504 = @fallback;
}

location @fallback {
    # Return cached static response or maintenance page
    root /var/www/fallback;
    try_files /maintenance.json =503;
    add_header Content-Type application/json;
    add_header Retry-After 60;
}
```

**maintenance.json:**
```json
{
  "success": false,
  "error": {
    "code": "SERVICE_UNAVAILABLE",
    "message": "Service is temporarily unavailable. Please try again in a few moments.",
    "retryAfter": 60
  },
  "statusPage": "https://status.insightserenity.com"
}
```

---

## Implementation Plan

### Phase 1: Foundation (Week 1-2)

**Objectives:**
- Set up gateway infrastructure
- Configure basic routing
- Implement health checks

**Tasks:**
1. **Gateway Setup**
   - [ ] Provision 2 NGINX servers (gateway-1, gateway-2)
   - [ ] Install NGINX Plus or compile with required modules
   - [ ] Configure keepalived for VRRP
   - [ ] Set up Virtual IP
   - [ ] Test failover behavior

2. **SSL/TLS Configuration**
   - [ ] Obtain SSL certificates (Let's Encrypt)
   - [ ] Configure HTTPS (443) and HTTP→HTTPS redirect (80)
   - [ ] Enable HTTP/2
   - [ ] Set up auto-renewal with certbot

3. **Basic Routing**
   - [ ] Configure upstream blocks for admin and customer backends
   - [ ] Implement path-based routing (/api/v1/admin/* vs /api/v1/*)
   - [ ] Set up health checks
   - [ ] Test routing with existing backend instances

4. **Monitoring Foundation**
   - [ ] Install Prometheus
   - [ ] Install nginx-prometheus-exporter
   - [ ] Configure basic metrics collection
   - [ ] Set up Grafana with starter dashboards

### Phase 2: Load Balancing & HA (Week 3-4)

**Objectives:**
- Scale backend services
- Implement load balancing
- Ensure zero-downtime deployments

**Tasks:**
1. **Backend Scaling**
   - [ ] Deploy 2 additional admin-server instances
   - [ ] Deploy 4 additional customer-services instances
   - [ ] Configure clustering mode on backends
   - [ ] Verify shared session storage (Redis)

2. **Load Balancing**
   - [ ] Configure weighted round-robin for admin backend
   - [ ] Configure least-connections for customer backend
   - [ ] Implement sticky sessions for WebSockets
   - [ ] Set up connection pooling

3. **Health Checks**
   - [ ] Enhance /health endpoint with database checks
   - [ ] Configure active health checks (5s interval)
   - [ ] Configure passive health checks (error-based)
   - [ ] Test automatic instance removal on failure

4. **Zero-Downtime Deployments**
   - [ ] Create rolling deployment script
   - [ ] Implement traffic draining
   - [ ] Set up canary deployment capability
   - [ ] Test full deployment cycle

### Phase 3: Security Hardening (Week 5-6)

**Objectives:**
- Implement comprehensive security measures
- Set up DDoS protection
- Configure WAF

**Tasks:**
1. **Rate Limiting**
   - [ ] Set up Redis cluster for distributed rate limiting
   - [ ] Configure NGINX rate limiting zones
   - [ ] Implement per-IP and per-user limits
   - [ ] Set up custom limits for sensitive endpoints

2. **DDoS Protection**
   - [ ] Configure connection limits
   - [ ] Set up SYN flood protection (iptables)
   - [ ] Install and configure Fail2ban
   - [ ] Test DDoS mitigation

3. **WAF Implementation**
   - [ ] Install ModSecurity/NAXSI
   - [ ] Deploy OWASP Core Rule Set
   - [ ] Create custom rules for platform
   - [ ] Configure in detection mode (staging)
   - [ ] Enable blocking mode (production after testing)

4. **Security Auditing**
   - [ ] Enable comprehensive audit logging
   - [ ] Set up log aggregation (Loki)
   - [ ] Create security dashboards
   - [ ] Configure security alerts

### Phase 4: Observability (Week 7-8)

**Objectives:**
- Complete monitoring stack
- Implement distributed tracing
- Set up alerting

**Tasks:**
1. **Metrics & Dashboards**
   - [ ] Deploy full Prometheus stack
   - [ ] Install exporters on all services
   - [ ] Create comprehensive Grafana dashboards
   - [ ] Set up metric retention policies

2. **Logging**
   - [ ] Deploy Loki stack
   - [ ] Install Promtail on all servers
   - [ ] Configure log shipping
   - [ ] Create log search and analysis dashboards

3. **Distributed Tracing**
   - [ ] Deploy Jaeger
   - [ ] Instrument NGINX with OpenTracing
   - [ ] Add OpenTelemetry to backend services
   - [ ] Create trace visualization dashboards

4. **Alerting**
   - [ ] Configure AlertManager
   - [ ] Create alert rules
   - [ ] Set up PagerDuty integration
   - [ ] Test alert workflow

### Phase 5: Production Readiness (Week 9-10)

**Objectives:**
- Performance testing
- Disaster recovery drills
- Documentation
- Go-live

**Tasks:**
1. **Performance Testing**
   - [ ] Load testing with realistic traffic patterns
   - [ ] Stress testing to find breaking points
   - [ ] Spike testing for traffic surges
   - [ ] Soak testing for sustained load
   - [ ] Identify and fix bottlenecks

2. **Disaster Recovery**
   - [ ] Document DR procedures
   - [ ] Test gateway failover
   - [ ] Test backend instance failure
   - [ ] Test database failover
   - [ ] Test complete region failure

3. **Documentation**
   - [ ] Architecture documentation
   - [ ] Runbook for common operations
   - [ ] Incident response playbook
   - [ ] On-call guide
   - [ ] Update API documentation

4. **Go-Live Preparation**
   - [ ] Final security audit
   - [ ] Performance benchmark
   - [ ] Backup all configurations
   - [ ] Communication plan
   - [ ] Rollback plan

5. **Migration**
   - [ ] Phase 1: Shadow mode (gateway routing, but not live)
   - [ ] Phase 2: Gradual rollout (10% → 25% → 50% → 100%)
   - [ ] Phase 3: Monitor for 7 days
   - [ ] Phase 4: Decommission old infrastructure

---

## Configuration Changes Required

### Minimal Backend Changes

#### 1. Environment Variables (Both Services)

**Add to .env:**
```bash
# Trust proxy configuration (NGINX forwarding)
TRUST_PROXY=true
TRUST_PROXY_HOPS=1

# Health check endpoint (already exists, ensure enabled)
ENABLE_HEALTH_CHECK=true
HEALTH_CHECK_PATH=/health

# Metrics endpoint (add if not exists)
ENABLE_METRICS=true
METRICS_PATH=/metrics
METRICS_AUTH=false  # Gateway handles auth

# Session configuration (for sticky sessions)
SESSION_COOKIE_SECURE=true
SESSION_COOKIE_HTTPONLY=true
SESSION_COOKIE_SAMESITE=lax

# CORS (update to allow gateway)
CORS_ORIGINS=https://api.insightserenity.com,https://www.insightserenity.com

# Logging
LOG_LEVEL=info
LOG_FORMAT=json

# Cluster mode (if using Node.js cluster)
USE_CLUSTER=true
WORKER_COUNT=4  # Adjust based on server CPU cores
```

#### 2. Update CORS Configuration

**admin-server/config/cors-config.js:**
```javascript
// Add gateway domain to allowed origins
const origins = parseArrayFromEnv(
  process.env.CORS_ORIGINS,
  [
    'http://localhost:3000',
    'https://api.insightserenity.com',  // Gateway domain
    'https://www.insightserenity.com'
  ]
);
```

#### 3. Trust Proxy Configuration

**Both admin-server/app.js and customer-services/app.js:**
```javascript
// Already present in admin-server (line 205-211)
// Ensure TRUST_PROXY env is set to true

setupTrustProxy() {
  if (this.appConfig.isEnabled('proxy.enabled')) {
    const hops = this.appConfig.get('proxy.hops');
    this.app.set('trust proxy', hops);
    this.logger.info('Trust proxy enabled', { hops });
  }
}
```

**customer-services/app.js:**
```javascript
// Already present (line 276-278)
// Ensure TRUST_PROXY env is set

if (process.env.TRUST_PROXY) {
  this.app.set('trust proxy', true);
}
```

#### 4. Health Check Enhancement (Optional)

**Enhance /health to include more details:**

```javascript
// admin-server/app.js (already exists at line 882-936)
// customer-services/app.js (already exists at line 594-604)

// No changes needed! Both services already have comprehensive health endpoints
```

#### 5. Listen on Internal Network Only

**Security: Bind to internal network interface:**

**admin-server:**
```javascript
// In server startup (current default: 0.0.0.0:3000)
// Change to internal IP or localhost

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '10.0.2.101'; // Internal IP only

server.listen(PORT, HOST, () => {
  console.log(`Admin server listening on ${HOST}:${PORT}`);
});
```

**customer-services:**
```javascript
// In server startup (current: 0.0.0.0:3001 - line 31)
// Change to internal IP

const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '10.0.3.101'; // Internal IP only

server.listen(PORT, HOST, () => {
  console.log(`Customer services listening on ${HOST}:${PORT}`);
});
```

#### 6. Firewall Rules

**Block direct external access to backend ports:**

```bash
# On backend servers
# Allow only from gateway IPs

# Admin servers (port 3000)
sudo ufw allow from 10.0.1.101 to any port 3000
sudo ufw allow from 10.0.1.102 to any port 3000
sudo ufw deny 3000

# Customer servers (port 3001)
sudo ufw allow from 10.0.1.101 to any port 3001
sudo ufw allow from 10.0.1.102 to any port 3001
sudo ufw deny 3001

# Allow SSH (restrict to bastion/VPN)
sudo ufw allow from 10.0.0.0/16 to any port 22

sudo ufw enable
```

### Complete NGINX Configuration

**Main configuration file:**

```nginx
# /etc/nginx/nginx.conf

user nginx;
worker_processes auto;
worker_rlimit_nofile 65535;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

# Load dynamic modules
load_module modules/ngx_http_geoip2_module.so;  # Optional: GeoIP

events {
    worker_connections 4096;
    use epoll;
    multi_accept on;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # Logging
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for" '
                    'rt=$request_time uct="$upstream_connect_time" '
                    'uht="$upstream_header_time" urt="$upstream_response_time"';

    log_format json escape=json '{'
        '"timestamp":"$time_iso8601",'
        '"remote_addr":"$remote_addr",'
        '"request_id":"$request_id",'
        '"method":"$request_method",'
        '"uri":"$request_uri",'
        '"status":$status,'
        '"body_bytes_sent":$body_bytes_sent,'
        '"request_time":$request_time,'
        '"upstream_response_time":"$upstream_response_time",'
        '"upstream_addr":"$upstream_addr",'
        '"http_referer":"$http_referer",'
        '"http_user_agent":"$http_user_agent"'
    '}';

    access_log /var/log/nginx/access.log json;

    # Performance
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 30;
    keepalive_requests 100;

    # Security
    server_tokens off;
    client_max_body_size 10m;
    client_body_buffer_size 128k;
    client_header_buffer_size 1k;
    large_client_header_buffers 4 8k;

    # Compression
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml text/javascript
               application/json application/javascript application/xml+rss
               application/rss+xml application/atom+xml image/svg+xml;

    # Rate limiting zones
    limit_req_zone $binary_remote_addr zone=general:10m rate=100r/m;
    limit_req_zone $binary_remote_addr zone=api:10m rate=100r/m;
    limit_req_zone $binary_remote_addr zone=admin:10m rate=50r/m;
    limit_req_zone $http_authorization zone=per_user:10m rate=200r/m;

    # Connection limits
    limit_conn_zone $binary_remote_addr zone=addr:10m;
    limit_conn_zone $server_name zone=perserver:10m;

    # Upstream configurations
    include /etc/nginx/upstreams/*.conf;

    # Server configurations
    include /etc/nginx/sites-enabled/*.conf;
}
```

**Upstream configuration:**

```nginx
# /etc/nginx/upstreams/backends.conf

# Admin Backend Pool
upstream admin_backend {
    zone admin_backend 64k;

    # Load balancing method: weighted round-robin
    # weight parameter distributes traffic proportionally

    # Health check (NGINX Plus feature)
    # For NGINX OSS, use passive health checks via max_fails
    # health_check interval=5s fails=2 passes=2 uri=/health match=admin_healthy;

    server 10.0.2.101:3000 weight=100 max_fails=2 fail_timeout=10s;
    server 10.0.2.102:3000 weight=100 max_fails=2 fail_timeout=10s;
    server 10.0.2.103:3000 weight=50 max_fails=2 fail_timeout=10s;
    server 10.0.2.104:3000 backup;  # Only used when others fail

    # Connection pooling
    keepalive 32;
    keepalive_timeout 60s;
    keepalive_requests 100;
}

# Customer Backend Pool
upstream customer_backend {
    zone customer_backend 64k;

    # Load balancing method: least connections
    least_conn;

    # Health check
    # health_check interval=5s fails=2 passes=2 uri=/health match=customer_healthy;

    server 10.0.3.101:3001 max_fails=2 fail_timeout=10s max_conns=500;
    server 10.0.3.102:3001 max_fails=2 fail_timeout=10s max_conns=500;
    server 10.0.3.103:3001 max_fails=2 fail_timeout=10s max_conns=500;
    server 10.0.3.104:3001 max_fails=2 fail_timeout=10s max_conns=500;
    server 10.0.3.105:3001 max_fails=2 fail_timeout=10s max_conns=500;
    server 10.0.3.106:3001 backup;

    # Connection pooling
    keepalive 64;
    keepalive_timeout 60s;
    keepalive_requests 100;
}

# Health check matchers (NGINX Plus)
# match admin_healthy {
#     status 200;
#     header Content-Type = application/json;
#     body ~ "\"status\":\"healthy\"";
# }
#
# match customer_healthy {
#     status 200;
#     header Content-Type = application/json;
#     body ~ "\"status\":\"healthy\"";
# }
```

**Main server configuration:**

```nginx
# /etc/nginx/sites-available/api.conf

# HTTP to HTTPS redirect
server {
    listen 80;
    listen [::]:80;
    server_name api.insightserenity.com;

    # ACME challenge for Let's Encrypt
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    # Redirect all other traffic to HTTPS
    location / {
        return 301 https://$server_name$request_uri;
    }
}

# Main HTTPS server
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name api.insightserenity.com;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/api.insightserenity.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.insightserenity.com/privkey.pem;
    ssl_trusted_certificate /etc/letsencrypt/live/api.insightserenity.com/chain.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers 'TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384:ECDHE-RSA-AES128-GCM-SHA256';
    ssl_prefer_server_ciphers on;

    ssl_session_cache shared:SSL:50m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;

    ssl_stapling on;
    ssl_stapling_verify on;
    resolver 8.8.8.8 8.8.4.4 valid=300s;
    resolver_timeout 5s;

    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Rate limiting
    limit_req zone=general burst=20 nodelay;
    limit_conn addr 10;
    limit_conn perserver 1000;

    # Root location (API info)
    location = / {
        return 200 '{"service":"InsightSerenity API Gateway","version":"1.0","status":"operational"}';
        add_header Content-Type application/json;
    }

    # Health check (gateway itself)
    location /health {
        access_log off;
        return 200 '{"status":"healthy","timestamp":"$time_iso8601"}';
        add_header Content-Type application/json;
    }

    # NGINX metrics (stub_status)
    location /nginx_status {
        stub_status on;
        access_log off;
        allow 10.0.0.0/8;
        deny all;
    }

    # Admin API routes
    location /api/v1/admin/ {
        # Stricter rate limiting for admin
        limit_req zone=admin burst=10 nodelay;
        limit_req_status 429;

        # Optional: IP whitelist for admin access
        # allow 10.0.0.0/8;
        # allow 203.0.113.0/24;  # Office IP
        # deny all;

        # Proxy to admin backend
        proxy_pass http://admin_backend;

        # Proxy headers
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Request-ID $request_id;
        proxy_set_header Connection "";

        # Timeouts
        proxy_connect_timeout 5s;
        proxy_send_timeout 120s;
        proxy_read_timeout 120s;

        # Buffering
        proxy_buffering on;
        proxy_buffer_size 4k;
        proxy_buffers 8 4k;

        # Retry logic
        proxy_next_upstream error timeout http_502 http_503 http_504;
        proxy_next_upstream_tries 2;
        proxy_next_upstream_timeout 10s;
    }

    # Customer API routes
    location /api/v1/ {
        # Standard rate limiting
        limit_req zone=api burst=30 nodelay;
        limit_req zone=per_user burst=50 nodelay;
        limit_req_status 429;

        # Proxy to customer backend
        proxy_pass http://customer_backend;

        # Proxy headers
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Request-ID $request_id;
        proxy_set_header Connection "";

        # Timeouts
        proxy_connect_timeout 5s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;

        # Buffering
        proxy_buffering on;
        proxy_buffer_size 4k;
        proxy_buffers 8 4k;

        # Retry logic
        proxy_next_upstream error timeout http_502 http_503 http_504;
        proxy_next_upstream_tries 2;
        proxy_next_upstream_timeout 10s;
    }

    # WebSocket support
    location /ws {
        proxy_pass http://customer_backend;

        # WebSocket headers
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

        # Long timeout for WebSocket
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    # Static assets (if any)
    location /static/ {
        alias /var/www/static/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

---

## Technology Stack Rationale

### Why NGINX?

**Chosen for:**
✓ Industry standard for reverse proxy/load balancing
✓ Proven at scale (Netflix, Airbnb, Dropbox use it)
✓ Low memory footprint (~2-10MB per worker)
✓ Can handle 10,000+ concurrent connections per server
✓ Event-driven architecture (non-blocking I/O)
✓ Extensive ecosystem (modules, integrations)
✓ Free and open source (NGINX OSS)
✓ Commercial support available (NGINX Plus)

**Alternatives Considered:**
- **HAProxy**: Excellent for TCP load balancing, but less feature-rich for HTTP/HTTPS
- **Traefik**: Modern, cloud-native, but less mature than NGINX
- **Envoy**: Great for service mesh, but over-engineered for this use case
- **AWS ALB/NLB**: Vendor lock-in, higher cost, less control

**Verdict:** NGINX provides the best balance of features, performance, stability, and cost for this use case.

### Why Redis for Rate Limiting?

**Chosen for:**
✓ Distributed rate limiting across multiple gateway instances
✓ In-memory performance (sub-millisecond latency)
✓ Atomic operations (INCR, EXPIRE)
✓ Persistence options (RDB + AOF)
✓ Clustering for high availability
✓ Already in stack (used by backends)

**Alternatives:**
- **In-memory NGINX zones**: Simple but not distributed
- **Memcached**: No persistence, less feature-rich than Redis

**Verdict:** Redis is the optimal choice for distributed rate limiting.

### Why Prometheus + Grafana?

**Chosen for:**
✓ Industry-standard monitoring stack (CNCF graduated project)
✓ Pull-based metrics model (services don't push, gateway pulls)
✓ Powerful query language (PromQL)
✓ Excellent visualization (Grafana)
✓ Large ecosystem of exporters
✓ Alerting built-in (AlertManager)
✓ Free and open source

**Alternatives:**
- **Datadog/New Relic**: Expensive, SaaS only
- **CloudWatch**: AWS-specific, limited querying
- **InfluxDB + Chronograf**: Good alternative, but smaller community

**Verdict:** Prometheus + Grafana is the de facto standard for modern infrastructure monitoring.

### Why keepalived (VRRP)?

**Chosen for:**
✓ Lightweight (minimal overhead)
✓ Fast failover (< 3 seconds)
✓ Standard protocol (VRRP - RFC 5798)
✓ Simple configuration
✓ Battle-tested (20+ years)
✓ Free and open source

**Alternatives:**
- **Pacemaker + Corosync**: More complex, overkill for this use case
- **HAProxy in HA mode**: Adds complexity
- **Cloud load balancers**: Vendor-specific, higher cost

**Verdict:** keepalived is perfect for simple, reliable gateway HA.

---

## Summary

This architecture provides:

1. **Single Entry Point**: All traffic flows through the API Gateway
2. **Load Balancing**: Weighted round-robin (admin) and least-connections (customer)
3. **High Availability**: Multi-layer redundancy with < 3s failover
4. **Security**: Defense-in-depth with multiple security layers
5. **Observability**: Comprehensive metrics, logging, and tracing
6. **Scalability**: Horizontal scaling at every layer
7. **Resilience**: Circuit breakers, retries, graceful degradation
8. **Minimal Backend Changes**: Only configuration updates required

**Expected Performance:**
- P50 latency: < 200ms (gateway adds ~10-20ms overhead)
- P95 latency: < 800ms
- Throughput: 10,000+ req/s per gateway instance
- Availability: 99.95%+ (< 4.5 hours downtime per year)

**Cost Estimate:**
- Gateway servers (2x): $50-100/month (cloud VMs)
- Redis cluster (3x): $30-60/month
- Monitoring stack: $20-40/month
- Total: ~$100-200/month (excluding existing infrastructure)

**Next Steps:**
1. Review and approve architecture
2. Begin Phase 1 implementation (Foundation)
3. Provision gateway infrastructure
4. Configure basic routing
5. Gradual rollout with monitoring

---

## Appendices

### A. Glossary

- **API Gateway**: Single entry point for API traffic with routing, security, and monitoring
- **Circuit Breaker**: Pattern to prevent cascading failures by failing fast
- **Health Check**: Automated test to verify service availability
- **Load Balancer**: Distributes traffic across multiple servers
- **Observability**: Ability to understand system behavior through metrics, logs, traces
- **Rate Limiting**: Restricting number of requests per time period
- **Sticky Session**: Routing all requests from a user to the same server instance
- **Upstream**: Backend server that the gateway forwards requests to
- **VRRP**: Virtual Router Redundancy Protocol for HA

### B. References

- NGINX Documentation: https://nginx.org/en/docs/
- Prometheus Documentation: https://prometheus.io/docs/
- Grafana Documentation: https://grafana.com/docs/
- Let's Encrypt: https://letsencrypt.org/
- OWASP Top 10: https://owasp.org/www-project-top-ten/

### C. Contact

For questions about this architecture:
- Architecture Team: architecture@insightserenity.com
- DevOps Team: devops@insightserenity.com
- Security Team: security@insightserenity.com

---

**Document Status**: Draft for Review
**Last Updated**: 2025-12-28
**Next Review**: 2026-01-15
**Author**: Claude Code (AI Assistant)
**Approved By**: [Pending]
