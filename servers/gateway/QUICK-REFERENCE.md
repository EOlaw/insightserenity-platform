# Gateway Quick Reference Card

**Print this page for your operations desk** 📋

---

## 🚀 Quick Start

```bash
# Local testing
cd servers/gateway/docker && docker-compose up -d

# Production deployment
cd servers/gateway && ./scripts/deploy.sh production

# Rollback
./scripts/rollback.sh previous
```

---

## 🔍 Health Checks

```bash
# Gateway health
curl https://api.insightserenity.com/health

# NGINX status
curl http://localhost/nginx_status

# Backend health
curl https://api.insightserenity.com/api/v1/health
```

---

## 📊 Monitoring URLs

| Service | URL | Credentials |
|---------|-----|-------------|
| Grafana | http://monitoring:3000 | admin/admin |
| Prometheus | http://monitoring:9090 | - |
| AlertManager | http://monitoring:9093 | - |

---

## 🛠️ Common Operations

### Reload Configuration
```bash
nginx -t && systemctl reload nginx
```

### View Logs
```bash
# Real-time
tail -f /var/log/nginx/access.log

# JSON formatted
tail -f /var/log/nginx/access.log | jq '.'

# Errors only
tail -f /var/log/nginx/error.log
```

### Check Services
```bash
systemctl status nginx
systemctl status keepalived
systemctl status prometheus-node-exporter
```

### Test Failover
```bash
# Stop master (on gateway-1)
systemctl stop keepalived

# Verify VIP moved (on gateway-2)
ip addr show eth0 | grep 10.0.1.100
```

---

## 🔧 Troubleshooting

### Gateway Not Responding
```bash
systemctl restart nginx
nginx -t  # Test config
netstat -tlnp | grep :443
```

### SSL Issues
```bash
certbot certificates
certbot renew --dry-run
```

### High Error Rate
```bash
# Check upstream status
curl http://localhost/nginx_status

# Check backend
curl http://10.0.3.101:3001/health
```

### Keepalived Flapping
```bash
journalctl -u keepalived -f
systemctl restart keepalived
```

---

## 📞 Emergency Contacts

| Role | Contact |
|------|---------|
| DevOps On-Call | PagerDuty |
| Platform Lead | jane@insightserenity.com |
| Security Team | security@insightserenity.com |

---

## 🔑 Key Files

| File | Purpose |
|------|---------|
| `/etc/nginx/nginx.conf` | Main NGINX config |
| `/etc/nginx/upstreams/backends.conf` | Load balancer config |
| `/etc/keepalived/keepalived.conf` | HA configuration |
| `/var/log/nginx/access.log` | Access logs |
| `/var/log/nginx/error.log` | Error logs |

---

## 📈 Critical Metrics

| Metric | Alert Threshold |
|--------|----------------|
| Error Rate | > 5% |
| P95 Latency | > 1.5s |
| Gateway Down | 1 minute |
| Upstream Down | 2 minutes |
| SSL Expiry | < 7 days |

---

## ⚡ Quick Commands

```bash
# Reload config (zero downtime)
nginx -s reload

# Test config
nginx -t

# Check which config is loaded
nginx -T

# View active connections
netstat -an | grep :443 | wc -l

# Check upstream health
curl -s http://localhost/nginx_status | grep -A 10 "upstream"

# Force SSL renewal
certbot renew --force-renewal

# View rate limit stats
grep "429" /var/log/nginx/access.log | wc -l
```

---

## 🎯 Performance Targets

| Metric | Target |
|--------|--------|
| P50 Latency | < 200ms |
| P95 Latency | < 800ms |
| Availability | 99.95% |
| Failover Time | < 3s |

---

**Version**: 1.0 | **Updated**: 2025-12-28
