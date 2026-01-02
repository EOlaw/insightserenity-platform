# Gateway Deployment Runbook

## Table of Contents

1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Infrastructure Setup](#infrastructure-setup)
3. [Gateway Deployment](#gateway-deployment)
4. [SSL Configuration](#ssl-configuration)
5. [Monitoring Setup](#monitoring-setup)
6. [Verification](#verification)
7. [Rollback Procedures](#rollback-procedures)
8. [Troubleshooting](#troubleshooting)

---

## Pre-Deployment Checklist

### Requirements

- [ ] AWS Account with admin access (or equivalent cloud provider)
- [ ] Domain name configured (api.insightserenity.com)
- [ ] SSH key pair generated
- [ ] Terraform installed (>= 1.0)
- [ ] Ansible installed (>= 2.12)
- [ ] Backend services (admin-server, customer-services) deployed and accessible

### Environment Variables

Create `.env` file:

```bash
# AWS Configuration
export AWS_REGION="us-east-1"
export AWS_ACCESS_KEY_ID="your-access-key"
export AWS_SECRET_ACCESS_KEY="your-secret-key"

# Domain Configuration
export DOMAIN_NAME="api.insightserenity.com"
export SSL_EMAIL="devops@insightserenity.com"

# Backend Endpoints
export ADMIN_BACKEND_IPS="10.0.2.101,10.0.2.102,10.0.2.103"
export CUSTOMER_BACKEND_IPS="10.0.3.101,10.0.3.102,10.0.3.103,10.0.3.104,10.0.3.105"

# Monitoring
export PROMETHEUS_ENDPOINT="10.0.6.101:9090"
export GRAFANA_ENDPOINT="10.0.6.102:3000"
```

Load environment:
```bash
source .env
```

---

## Infrastructure Setup

### Step 1: Provision with Terraform

```bash
cd servers/gateway/terraform

# Initialize Terraform
terraform init

# Review planned changes
terraform plan \
  -var="environment=production" \
  -var="gateway_instance_count=2" \
  -var="key_pair_name=insightserenity-gateway" \
  -out=tfplan

# Apply changes
terraform apply tfplan

# Save outputs
terraform output -json > terraform-outputs.json
```

**Expected Duration:** 5-10 minutes

**Outputs:**
- Gateway instance IDs
- Public/Private IP addresses
- Security group ID
- DNS name (if Route53 configured)

### Step 2: Verify Infrastructure

```bash
# Check instances are running
aws ec2 describe-instances \
  --instance-ids $(terraform output -raw gateway_instance_ids) \
  --query 'Reservations[*].Instances[*].[InstanceId,State.Name,PublicIpAddress]' \
  --output table

# Test SSH connectivity
ssh -i ~/.ssh/insightserenity-gateway.pem ubuntu@<gateway-1-ip> "echo 'Connection successful'"
ssh -i ~/.ssh/insightserenity-gateway.pem ubuntu@<gateway-2-ip> "echo 'Connection successful'"
```

---

## Gateway Deployment

### Step 3: Deploy NGINX Configuration

#### Option A: Automated Deployment (Recommended)

```bash
cd servers/gateway

# Run deployment script
./scripts/deploy.sh production
```

#### Option B: Manual Deployment with Ansible

```bash
cd servers/gateway/ansible

# Test connectivity
ansible -i playbooks/inventory/production.ansible gateways -m ping

# Deploy gateway
ansible-playbook \
  -i playbooks/inventory/production.ansible \
  playbooks/deploy-gateway.yml \
  --extra-vars "environment=production"
```

**Expected Duration:** 10-15 minutes

**Deployment Steps:**
1. Install NGINX and dependencies
2. Copy configuration files
3. Setup keepalived for HA
4. Configure health checks
5. Start services
6. Verify deployment

### Step 4: Configure Backend Upstreams

Edit `/etc/nginx/upstreams/backends.conf` on gateway servers:

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
    server 10.0.3.104:3001;
    server 10.0.3.105:3001;
}
```

Test and reload:
```bash
nginx -t && systemctl reload nginx
```

---

## SSL Configuration

### Step 5: Setup SSL Certificates

#### Using Let's Encrypt (Production)

```bash
# On each gateway server
sudo certbot --nginx \
  -d api.insightserenity.com \
  --email devops@insightserenity.com \
  --agree-tos \
  --non-interactive \
  --redirect

# Verify auto-renewal
sudo certbot renew --dry-run

# Setup auto-renewal cron
echo "0 0,12 * * * root certbot renew --quiet" | sudo tee -a /etc/crontab
```

#### Using Custom Certificate

```bash
# Copy certificate files
scp /path/to/fullchain.pem gateway-1:/etc/nginx/ssl/
scp /path/to/privkey.pem gateway-1:/etc/nginx/ssl/

# Update NGINX config
sudo vim /etc/nginx/sites-available/api.insightserenity.com.conf

# Change certificate paths:
# ssl_certificate /etc/nginx/ssl/fullchain.pem;
# ssl_certificate_key /etc/nginx/ssl/privkey.pem;

# Test and reload
sudo nginx -t && sudo systemctl reload nginx
```

### Step 6: Verify SSL

```bash
# Check SSL configuration
openssl s_client -connect api.insightserenity.com:443 -servername api.insightserenity.com < /dev/null

# Check SSL grade (qualys SSL Labs)
curl -s "https://api.ssllabs.com/api/v3/analyze?host=api.insightserenity.com"
```

**Expected Grade:** A or A+

---

## Monitoring Setup

### Step 7: Deploy Monitoring Stack

```bash
# Deploy Prometheus
docker run -d \
  --name prometheus \
  -p 9090:9090 \
  -v $(pwd)/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml \
  -v $(pwd)/prometheus/rules:/etc/prometheus/rules \
  prom/prometheus:latest

# Deploy Alertmanager
docker run -d \
  --name alertmanager \
  -p 9093:9093 \
  -v $(pwd)/prometheus/alertmanager.yml:/etc/alertmanager/alertmanager.yml \
  prom/alertmanager:latest

# Deploy Grafana
docker run -d \
  --name grafana \
  -p 3000:3000 \
  -v $(pwd)/grafana:/etc/grafana/provisioning \
  grafana/grafana:latest
```

### Step 8: Configure Dashboards

1. Access Grafana: http://<monitoring-server>:3000
2. Login (admin/admin - change password)
3. Add Prometheus data source: http://prometheus:9090
4. Import dashboards from `grafana/dashboards/`

**Dashboards:**
- Gateway Overview
- Backend Services
- Infrastructure Metrics
- Business Metrics

### Step 9: Setup Alerts

```bash
# Test AlertManager configuration
amtool check-config prometheus/alertmanager.yml

# Send test alert
curl -X POST http://localhost:9093/api/v1/alerts \
  -H "Content-Type: application/json" \
  -d '[{
    "labels": {"alertname":"TestAlert","severity":"info"},
    "annotations": {"summary":"This is a test alert"}
  }]'
```

---

## Verification

### Step 10: Comprehensive Testing

#### Health Checks

```bash
# Gateway health
curl -I https://api.insightserenity.com/health
# Expected: HTTP/2 200

# Backend health (through gateway)
curl https://api.insightserenity.com/api/v1/health
# Expected: {"status":"healthy"}
```

#### Load Balancing

```bash
# Test round-robin distribution
for i in {1..10}; do
  curl -s https://api.insightserenity.com/api/v1/health | jq -r '.server'
done

# Should see different backend servers
```

#### Failover Testing

```bash
# On gateway-1 (master)
sudo systemctl stop nginx

# Verify VIP moved to gateway-2
ip addr show eth0 | grep 10.0.1.100

# Check service continues
curl https://api.insightserenity.com/health
# Should still work

# Restart gateway-1
sudo systemctl start nginx
```

**Expected Failover Time:** < 3 seconds

#### Rate Limiting

```bash
# Test rate limiting
for i in {1..150}; do
  curl -s -o /dev/null -w "%{http_code}\n" https://api.insightserenity.com/api/v1/test
done

# Should see some 429 responses after ~100 requests
```

#### SSL/TLS

```bash
# Test TLS version
openssl s_client -connect api.insightserenity.com:443 -tls1_2 < /dev/null
openssl s_client -connect api.insightserenity.com:443 -tls1_3 < /dev/null

# Test ciphers
nmap --script ssl-enum-ciphers -p 443 api.insightserenity.com
```

#### Performance Testing

```bash
# Install wrk (if not available)
sudo apt-get install wrk

# Run load test
wrk -t4 -c100 -d30s https://api.insightserenity.com/api/v1/health

# Expected:
# - Requests/sec: > 5000
# - Latency avg: < 50ms
# - Latency P99: < 200ms
```

---

## Rollback Procedures

### Scenario 1: Configuration Rollback

```bash
# Rollback to previous configuration
cd servers/gateway
./scripts/rollback.sh previous

# Or rollback to specific version
./scripts/rollback.sh 20250128_100000
```

### Scenario 2: Full Infrastructure Rollback

```bash
# Destroy Terraform infrastructure
cd servers/gateway/terraform
terraform destroy -var="environment=production"

# Restore from backup
terraform import ... # Import existing resources
```

### Scenario 3: Emergency Bypass

```bash
# Point DNS directly to backend servers
aws route53 change-resource-record-sets \
  --hosted-zone-id Z1234567890ABC \
  --change-batch '{
    "Changes": [{
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "api.insightserenity.com",
        "Type": "A",
        "TTL": 60,
        "ResourceRecords": [
          {"Value": "10.0.3.101"}
        ]
      }
    }]
  }'
```

---

## Troubleshooting

### Issue: Gateway Not Responding

**Symptoms:** HTTP timeouts, connection refused

**Diagnosis:**
```bash
# Check NGINX status
sudo systemctl status nginx

# Check logs
sudo tail -f /var/log/nginx/error.log

# Check if process is listening
sudo netstat -tlnp | grep :443

# Check firewall
sudo ufw status
```

**Resolution:**
```bash
# Restart NGINX
sudo systemctl restart nginx

# If still failing, check configuration
sudo nginx -t

# Check upstream connectivity
curl -I http://10.0.3.101:3001/health
```

### Issue: SSL Certificate Errors

**Symptoms:** SSL handshake failures, certificate warnings

**Diagnosis:**
```bash
# Check certificate validity
openssl x509 -in /etc/letsencrypt/live/api.insightserenity.com/cert.pem -text -noout

# Check expiry date
echo | openssl s_client -connect api.insightserenity.com:443 2>&1 | openssl x509 -noout -dates
```

**Resolution:**
```bash
# Renew certificate manually
sudo certbot renew --force-renewal

# Reload NGINX
sudo systemctl reload nginx
```

### Issue: High Error Rate

**Symptoms:** Increased 5xx errors in metrics

**Diagnosis:**
```bash
# Check upstream health
curl http://localhost/nginx_status

# Check backend logs
ssh 10.0.3.101 "sudo journalctl -u customer-services -f"

# Check resource usage
top
```

**Resolution:**
```bash
# If backend is down, remove from pool
# Edit /etc/nginx/upstreams/backends.conf
# Comment out failing server
sudo nginx -s reload

# Scale up backends if needed
# Or restart failing backend
ssh 10.0.3.101 "sudo systemctl restart customer-services"
```

### Issue: Keepalived Flapping

**Symptoms:** VIP moving between nodes rapidly

**Diagnosis:**
```bash
# Check keepalived logs
sudo journalctl -u keepalived -f

# Check VRRP advertisements
sudo tcpdump -i eth0 proto 112
```

**Resolution:**
```bash
# Increase priority difference
# Edit /etc/keepalived/keepalived.conf
# MASTER: priority 100
# BACKUP: priority 80

sudo systemctl restart keepalived
```

### Issue: Rate Limiting Too Aggressive

**Symptoms:** Legitimate users getting 429 errors

**Diagnosis:**
```bash
# Check rate limit metrics
curl -s http://localhost:9090/api/v1/query?query=rate(nginx_http_requests_total{status="429"}[5m])
```

**Resolution:**
```bash
# Adjust rate limits in nginx.conf
# limit_req_zone $binary_remote_addr zone=api:10m rate=200r/m;

sudo nginx -s reload
```

---

## Post-Deployment Tasks

- [ ] Update monitoring dashboards
- [ ] Configure alerting rules
- [ ] Document any custom configurations
- [ ] Train operations team
- [ ] Schedule backup verification
- [ ] Plan next maintenance window
- [ ] Update runbook with lessons learned

---

## Maintenance Schedule

| Task | Frequency | Owner |
|------|-----------|-------|
| SSL Certificate Renewal | Automated (90 days) | DevOps |
| Security Updates | Monthly | DevOps |
| Performance Review | Quarterly | Platform Team |
| Disaster Recovery Drill | Quarterly | SRE Team |
| Capacity Planning | Quarterly | Infrastructure Team |

---

## Emergency Contacts

| Role | Contact | Phone | Email |
|------|---------|-------|-------|
| DevOps Lead | John Doe | +1-555-0100 | john@insightserenity.com |
| Platform Lead | Jane Smith | +1-555-0101 | jane@insightserenity.com |
| On-Call Engineer | PagerDuty | - | oncall@insightserenity.com |
| Security Team | Security | - | security@insightserenity.com |

---

**Document Version:** 1.0
**Last Updated:** 2025-12-28
**Next Review:** 2026-01-28
