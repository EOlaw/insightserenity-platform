# InsightSerenity API Gateway

Production-ready API Gateway infrastructure for the InsightSerenity platform, providing a secure, scalable, and highly available entry point for all backend services.

## Overview

The API Gateway serves as the single entry point for:
- **Admin Server** (port 3000) - Administrative operations, content management
- **Customer Services** (port 3001) - Customer-facing APIs, consultations, payments

### Key Features

✅ **High Availability** - Active-passive failover with VRRP (< 3s failover)
✅ **Load Balancing** - Weighted round-robin (admin) and least-connections (customer)
✅ **Security** - SSL/TLS 1.3, rate limiting, DDoS protection, WAF ready
✅ **Observability** - Prometheus metrics, Grafana dashboards, distributed tracing
✅ **Scalability** - Horizontal scaling at all layers
✅ **Zero Downtime** - Rolling deployments with health checks

## Architecture

```
Internet → CDN (optional) → Gateway Cluster → Backend Services
                                ↓
                          Monitoring Stack
```

**Complete architecture**: See [docs/GATEWAY-ARCHITECTURE.md](docs/GATEWAY-ARCHITECTURE.md)

## Quick Start

### Prerequisites

- **OS**: Ubuntu 22.04 LTS (or compatible)
- **Tools**: Terraform (>= 1.0), Ansible (>= 2.12), Docker (optional for local testing)
- **Access**: AWS/Cloud credentials, SSH key pair
- **Domain**: DNS record for api.insightserenity.com

### Local Testing with Docker

```bash
# Start local environment
cd servers/gateway/docker
docker-compose up -d

# Test gateway
curl http://localhost/health

# View logs
docker-compose logs -f gateway-1

# Access Grafana
open http://localhost:3000
# Login: admin/admin

# Cleanup
docker-compose down -v
```

### Production Deployment

#### 1. **Provision Infrastructure** (Terraform)

```bash
cd servers/gateway/terraform

# Initialize
terraform init

# Plan
terraform plan \
  -var="environment=production" \
  -var="gateway_instance_count=2" \
  -var="key_pair_name=insightserenity-gateway" \
  -out=tfplan

# Apply
terraform apply tfplan
```

#### 2. **Deploy Configuration** (Ansible)

```bash
cd servers/gateway/ansible

# Test connectivity
ansible -i playbooks/inventory/production gateways -m ping

# Deploy
ansible-playbook \
  -i playbooks/inventory/production \
  playbooks/deploy-gateway.yml
```

#### 3. **Configure SSL**

```bash
# SSH to gateway-1
ssh -i ~/.ssh/insightserenity-gateway.pem ubuntu@<gateway-ip>

# Generate Let's Encrypt certificate
sudo certbot --nginx \
  -d api.insightserenity.com \
  --email devops@insightserenity.com \
  --agree-tos \
  --non-interactive \
  --redirect
```

#### 4. **Verify Deployment**

```bash
# Health check
curl https://api.insightserenity.com/health

# Test backend routing
curl https://api.insightserenity.com/api/v1/health

# Check SSL
openssl s_client -connect api.insightserenity.com:443 -servername api.insightserenity.com < /dev/null
```

## Directory Structure

```
servers/gateway/
├── docs/
│   ├── GATEWAY-ARCHITECTURE.md    # Complete architecture doc
│   └── DEPLOYMENT-RUNBOOK.md      # Step-by-step deployment
├── nginx/
│   ├── nginx.conf                 # Main NGINX config
│   ├── upstreams/
│   │   └── backends.conf          # Load balancer config
│   └── sites-available/
│       └── api.insightserenity.com.conf
├── keepalived/
│   ├── keepalived-master.conf     # VRRP config (master)
│   └── keepalived-backup.conf     # VRRP config (backup)
├── scripts/
│   ├── check_nginx_health.sh      # Health check script
│   ├── deploy.sh                  # Automated deployment
│   ├── rollback.sh                # Rollback procedure
│   ├── notify_master.sh           # VRRP notification
│   ├── notify_backup.sh
│   └── notify_fault.sh
├── terraform/
│   ├── main.tf                    # Infrastructure as code
│   ├── variables.tf               # Terraform variables
│   └── user-data.sh               # EC2 initialization
├── ansible/
│   ├── playbooks/
│   │   ├── deploy-gateway.yml     # Main playbook
│   │   └── inventory/
│   │       └── production         # Production inventory
│   └── roles/
│       └── nginx/                 # NGINX role
├── prometheus/
│   ├── prometheus.yml             # Metrics collection
│   ├── alertmanager.yml           # Alert routing
│   └── rules/
│       ├── gateway-alerts.yml     # Gateway alerts
│       └── backend-alerts.yml     # Backend alerts
├── grafana/
│   └── dashboards/
│       └── gateway-overview.json  # Gateway dashboard
├── docker/
│   ├── docker-compose.yml         # Local testing
│   └── mock-backends/             # Mock services
└── README.md
```

## Configuration

### Environment-Specific Settings

Edit inventory files for your environment:

**Production**: `ansible/playbooks/inventory/production`
```ini
[gateways]
gateway-1 ansible_host=10.0.1.101 is_master=true priority=100
gateway-2 ansible_host=10.0.1.102 is_master=false priority=90

[gateways:vars]
virtual_ip=10.0.1.100
```

### Backend Upstreams

Edit `nginx/upstreams/backends.conf`:

```nginx
upstream admin_backend {
    server 10.0.2.101:3000 weight=100;
    server 10.0.2.102:3000 weight=100;
    server 10.0.2.103:3000 weight=50;
}

upstream customer_backend {
    least_conn;
    server 10.0.3.101:3001;
    server 10.0.3.102:3001;
    server 10.0.3.103:3001;
}
```

### Rate Limiting

Edit `nginx/nginx.conf`:

```nginx
limit_req_zone $binary_remote_addr zone=api:10m rate=100r/m;
limit_req_zone $binary_remote_addr zone=admin:10m rate=50r/m;
```

## Monitoring

### Access Dashboards

- **Grafana**: http://monitoring-server:3000
  - Username: `admin`
  - Password: `admin` (change on first login)

- **Prometheus**: http://monitoring-server:9090

- **AlertManager**: http://monitoring-server:9093

### Key Metrics

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| `nginx_http_requests_total` | Total requests | - |
| `nginx_connections_active` | Active connections | > 3000 |
| Error rate | 5xx / total requests | > 5% |
| P95 latency | 95th percentile response time | > 1.5s |
| `nginx_upstream_server_up` | Upstream health | < 2 healthy |

## Operations

### Common Tasks

#### Reload Configuration

```bash
# Test configuration
nginx -t

# Reload (zero downtime)
systemctl reload nginx
```

#### View Logs

```bash
# Access logs
tail -f /var/log/nginx/access.log

# Error logs
tail -f /var/log/nginx/error.log

# Structured logs (JSON)
jq '.' /var/log/nginx/access.log
```

#### Check Upstream Health

```bash
# NGINX status
curl http://localhost/nginx_status

# Detailed upstream status
curl -s http://localhost/nginx_status | grep "upstream"
```

#### Test Failover

```bash
# On gateway-1 (master)
sudo systemctl stop keepalived

# Verify VIP moved to gateway-2
# On gateway-2
ip addr show eth0 | grep 10.0.1.100

# Verify service continuity
curl https://api.insightserenity.com/health
```

### Deployment

#### Rolling Update

```bash
cd servers/gateway
./scripts/deploy.sh production
```

#### Rollback

```bash
./scripts/rollback.sh previous
```

### Troubleshooting

See [DEPLOYMENT-RUNBOOK.md](docs/DEPLOYMENT-RUNBOOK.md#troubleshooting) for detailed troubleshooting guide.

**Quick diagnostics:**

```bash
# Check service status
systemctl status nginx
systemctl status keepalived

# Check connectivity to backends
for ip in 10.0.3.101 10.0.3.102 10.0.3.103; do
  curl -I "http://$ip:3001/health"
done

# Check SSL
certbot certificates

# View recent errors
journalctl -u nginx -n 100 --no-pager
```

## Security

### TLS Configuration

- **Protocols**: TLS 1.2, TLS 1.3
- **Ciphers**: Modern cipher suites only
- **HSTS**: Enabled with 1-year max-age
- **Certificate**: Let's Encrypt (auto-renewal)
- **OCSP Stapling**: Enabled

### Rate Limiting

| Endpoint | Limit | Burst |
|----------|-------|-------|
| General | 100 req/min per IP | 20 |
| API | 100 req/min per IP | 30 |
| Admin | 50 req/min per IP | 10 |
| Login | 10 req/min per IP | 5 |

### DDoS Protection

- Connection limits: 10 per IP, 1000 total
- SYN flood protection via iptables
- Fail2ban for automated IP blocking
- Request size limits: 10MB default

## Performance

### Expected Metrics

| Metric | Target | Production |
|--------|--------|------------|
| P50 Latency | < 200ms | < 150ms |
| P95 Latency | < 800ms | < 600ms |
| P99 Latency | < 1.5s | < 1.2s |
| Throughput | > 5000 req/s | 10,000+ req/s |
| Availability | 99.95%+ | 99.98% |

### Optimization Tips

1. **Connection Pooling**: keepalive enabled (64 connections)
2. **Caching**: Proxy cache for static assets
3. **Compression**: Gzip/Brotli enabled
4. **HTTP/2**: Enabled for multiplexing

## Scaling

### Horizontal Scaling

**Add Gateway Instance:**

```bash
# Update Terraform
cd terraform
terraform apply -var="gateway_instance_count=3"

# Update Ansible inventory
vim ansible/playbooks/inventory/production

# Deploy to new instance
ansible-playbook -i playbooks/inventory/production \
  playbooks/deploy-gateway.yml \
  --limit gateway-3
```

**Add Backend Instance:**

```bash
# Update upstream configuration
vim nginx/upstreams/backends.conf

# Add new server
server 10.0.3.106:3001;

# Reload configuration
ansible gateways -i playbooks/inventory/production \
  -m shell -a "nginx -t && systemctl reload nginx"
```

## Support

### Documentation

- **Architecture**: [docs/GATEWAY-ARCHITECTURE.md](docs/GATEWAY-ARCHITECTURE.md)
- **Deployment**: [docs/DEPLOYMENT-RUNBOOK.md](docs/DEPLOYMENT-RUNBOOK.md)
- **NGINX Docs**: https://nginx.org/en/docs/

### Contact

- **DevOps Team**: devops@insightserenity.com
- **On-Call**: oncall@insightserenity.com  (PagerDuty)
- **Security**: security@insightserenity.com

### Contributing

1. Create feature branch
2. Test changes in Docker environment
3. Update documentation
4. Submit pull request
5. Deploy to staging, then production

## License

Copyright © 2025 InsightSerenity. All rights reserved.

---

**Version**: 1.0.0
**Last Updated**: 2025-12-28
**Maintained By**: DevOps Team
