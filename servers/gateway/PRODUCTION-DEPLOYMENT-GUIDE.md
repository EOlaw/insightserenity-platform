# Production Deployment Guide

Complete guide for deploying InsightSerenity API Gateway to production with 5 admin servers, 5 customer service servers, and full SSL/HTTPS support.

---

## 📋 Prerequisites

### Infrastructure Requirements

- **2 Gateway Servers**: t3.medium or equivalent (2 vCPU, 4GB RAM)
- **5 Admin Servers**: t3.medium or equivalent (2 vCPU, 4GB RAM each)
- **5 Customer Service Servers**: t3.large or equivalent (2 vCPU, 8GB RAM each)
- **MongoDB Atlas**: Already configured
- **Redis**: For rate limiting and caching

### Domain & DNS

- **Domain**: `api.insightserenity.com`
- **DNS Provider Access**: To create A records
- **SSL Certificate**: Let's Encrypt (free) or commercial

### Software Requirements

- Ubuntu 22.04 LTS
- NGINX 1.24+
- Node.js 24.x (already on backend servers)
- certbot (for Let's Encrypt)

---

## 🚀 Deployment Steps

### Step 1: DNS Configuration

**Create A Records** in your DNS provider:

```
Type: A
Name: api.insightserenity.com
Value: <Gateway-IP-1>
TTL: 300
```

```
Type: A
Name: api.insightserenity.com
Value: <Gateway-IP-2>
TTL: 300
```

**Verify DNS**:
```bash
dig api.insightserenity.com
nslookup api.insightserenity.com
```

Wait for DNS propagation (5-60 minutes).

---

### Step 2: Provision Infrastructure

#### Option A: AWS with Terraform

```bash
cd servers/gateway/terraform

# Initialize Terraform
terraform init

# Create terraform.tfvars
cat > terraform.tfvars <<EOF
environment = "production"
gateway_instance_count = 2
admin_instance_count = 5
customer_instance_count = 5
instance_type_gateway = "t3.medium"
instance_type_admin = "t3.medium"
instance_type_customer = "t3.large"
key_pair_name = "insightserenity-prod"
domain_name = "api.insightserenity.com"
EOF

# Plan deployment
terraform plan -out=tfplan

# Apply (creates all servers)
terraform apply tfplan
```

**Terraform Output** will show:
- Gateway IPs
- Admin server IPs
- Customer server IPs

#### Option B: Manual Server Setup

If not using Terraform, manually provision:

**Gateway Servers**:
- 2 servers: 10.0.1.10, 10.0.1.11
- Public IPs for DNS
- Security group: ports 80, 443, 22

**Admin Servers**:
- 5 servers: 10.0.2.10, 10.0.2.11, 10.0.2.12, 10.0.2.13, 10.0.2.14
- Port 3002 open to gateway subnet
- No public IPs needed

**Customer Service Servers**:
- 5 servers: 10.0.3.10, 10.0.3.11, 10.0.3.12, 10.0.3.13, 10.0.3.14
- Port 3001 open to gateway subnet
- No public IPs needed

---

### Step 3: Deploy Backend Servers

#### Deploy Admin Servers (all 5)

**SSH to each admin server** and run:

```bash
# Clone repository
cd /opt
git clone https://github.com/yourusername/insightserenity-platform.git
cd insightserenity-platform/servers/admin-server

# Install Node.js 24
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2
sudo npm install -g pm2

# Install dependencies
npm install --production

# Update .env for production
cp .env.example .env
nano .env
```

**Update .env** on each admin server:
```env
NODE_ENV=production
PORT=3002
HOST=0.0.0.0

SSL_ENABLED=true
SSL_KEY_PATH=./ssl/server.key
SSL_CERT_PATH=./ssl/server.crt

# Use your MongoDB Atlas URIs
DATABASE_ADMIN_URI=mongodb+srv://...
DATABASE_CUSTOMER_URI=mongodb+srv://...
DATABASE_SHARED_URI=mongodb+srv://...
```

**Generate SSL certificates** on each:
```bash
./scripts/generate-ssl-certs.sh
```

**Start with PM2** on each:
```bash
pm2 start server.js --name admin-server
pm2 save
pm2 startup
```

**Verify**:
```bash
curl -k https://localhost:3002/health
# Should return: {"success":true,"status":"healthy"...}
```

#### Deploy Customer Service Servers (all 5)

**Same process as admin**, but for customer-services:

```bash
cd /opt/insightserenity-platform/servers/customer-services

# Update .env
NODE_ENV=production
PORT=3001
HOST=0.0.0.0

USE_SSL=true
SSL_KEY_PATH=./ssl/server.key
SSL_CERT_PATH=./ssl/server.crt

# Generate SSL certs
./scripts/generate-ssl-certs.sh

# Start with PM2
pm2 start server.js --name customer-services
pm2 save
pm2 startup
```

**Verify all 5**:
```bash
for ip in 10.0.3.10 10.0.3.11 10.0.3.12 10.0.3.13 10.0.3.14; do
  echo "Testing $ip..."
  curl -k https://$ip:3001/health
done
```

---

### Step 4: Deploy Gateway Servers

#### Install NGINX on both gateway servers

```bash
# Update system
sudo apt-get update
sudo apt-get upgrade -y

# Install NGINX
sudo apt-get install -y nginx

# Install certbot for Let's Encrypt
sudo apt-get install -y certbot python3-certbot-nginx

# Stop NGINX temporarily
sudo systemctl stop nginx
```

#### Deploy Configuration

**On Gateway-1** (10.0.1.10):

```bash
# Clone repository
cd /opt
git clone https://github.com/yourusername/insightserenity-platform.git
cd insightserenity-platform/servers/gateway

# Copy NGINX configuration
sudo cp nginx/nginx.conf /etc/nginx/nginx.conf

# Copy production upstreams
sudo mkdir -p /etc/nginx/upstreams
sudo cp nginx/upstreams/backends-production.conf /etc/nginx/upstreams/backends.conf

# Copy virtual host
sudo mkdir -p /etc/nginx/sites-available
sudo mkdir -p /etc/nginx/sites-enabled
sudo cp nginx/sites-available/api.insightserenity.com-production.conf \
    /etc/nginx/sites-available/api.insightserenity.com.conf

# Enable site (will update SSL paths after certificate generation)
sudo ln -sf /etc/nginx/sites-available/api.insightserenity.com.conf \
    /etc/nginx/sites-enabled/
```

**Temporarily use HTTP-only config** for Let's Encrypt validation:

```bash
# Create temporary HTTP config
sudo cat > /etc/nginx/sites-enabled/temp-http.conf <<'EOF'
server {
    listen 80;
    server_name api.insightserenity.com;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
        allow all;
    }

    location = /health {
        return 200 "OK";
    }

    location / {
        return 200 "Gateway setup in progress";
    }
}
EOF

# Create certbot webroot
sudo mkdir -p /var/www/certbot

# Test configuration
sudo nginx -t

# Start NGINX
sudo systemctl start nginx
```

---

### Step 5: Generate SSL Certificates with Let's Encrypt

**On Gateway-1**:

```bash
# Generate certificate for api.insightserenity.com
sudo certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    -d api.insightserenity.com \
    --email devops@insightserenity.com \
    --agree-tos \
    --no-eff-email \
    --non-interactive

# Generate DH parameters (takes 5-10 minutes)
sudo openssl dhparam -out /etc/nginx/ssl/dhparam.pem 4096
```

**Certificate location**:
- Certificate: `/etc/letsencrypt/live/api.insightserenity.com/fullchain.pem`
- Private Key: `/etc/letsencrypt/live/api.insightserenity.com/privkey.pem`
- Chain: `/etc/letsencrypt/live/api.insightserenity.com/chain.pem`

**Auto-renewal**:
```bash
# Test renewal
sudo certbot renew --dry-run

# Renewal runs automatically via cron
sudo systemctl status certbot.timer
```

---

### Step 6: Enable Production Configuration

```bash
# Remove temporary HTTP config
sudo rm /etc/nginx/sites-enabled/temp-http.conf

# Create SSL directory
sudo mkdir -p /etc/nginx/ssl

# The production config is already in place
# Just need to reload NGINX

# Test configuration
sudo nginx -t

# Reload NGINX with SSL
sudo systemctl reload nginx
```

**Verify HTTPS**:
```bash
curl https://api.insightserenity.com/health
# Should return: {"status":"healthy","gateway":"nginx","ssl":true...}
```

---

### Step 7: Configure keepalived for High Availability

**On Gateway-1** (Master):

```bash
sudo apt-get install -y keepalived

# Copy keepalived config
sudo cp keepalived/keepalived-master.conf /etc/keepalived/keepalived.conf

# Update virtual IP (use an available IP in your subnet)
sudo nano /etc/keepalived/keepalived.conf
# Set: virtual_ipaddress { 10.0.1.100 }

# Copy health check script
sudo cp scripts/check_nginx_health.sh /usr/local/bin/
sudo chmod +x /usr/local/bin/check_nginx_health.sh

# Copy notification scripts
sudo cp scripts/notify_*.sh /usr/local/bin/
sudo chmod +x /usr/local/bin/notify_*.sh

# Start keepalived
sudo systemctl enable keepalived
sudo systemctl start keepalived

# Verify
ip addr show eth0 | grep 10.0.1.100
# Should show the VIP
```

**On Gateway-2** (Backup):

```bash
sudo apt-get install -y keepalived

# Copy keepalived config
sudo cp keepalived/keepalived-backup.conf /etc/keepalived/keepalived.conf

# Update virtual IP (same as master)
sudo nano /etc/keepalived/keepalived.conf

# Copy scripts
sudo cp scripts/*.sh /usr/local/bin/
sudo chmod +x /usr/local/bin/*.sh

# Start keepalived
sudo systemctl enable keepalived
sudo systemctl start keepalived

# Verify (should NOT show VIP since master is up)
ip addr show eth0 | grep 10.0.1.100
# Should be empty
```

---

### Step 8: Setup Monitoring

**Install Prometheus Node Exporter** on all servers:

```bash
# On gateways, admin servers, and customer servers
wget https://github.com/prometheus/node_exporter/releases/download/v1.7.0/node_exporter-1.7.0.linux-amd64.tar.gz
tar xvfz node_exporter-1.7.0.linux-amd64.tar.gz
sudo mv node_exporter-1.7.0.linux-amd64/node_exporter /usr/local/bin/
sudo useradd -rs /bin/false node_exporter

# Create systemd service
sudo cat > /etc/systemd/system/node_exporter.service <<'EOF'
[Unit]
Description=Node Exporter
After=network.target

[Service]
User=node_exporter
Group=node_exporter
Type=simple
ExecStart=/usr/local/bin/node_exporter

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable node_exporter
sudo systemctl start node_exporter
```

**Install NGINX Prometheus Exporter** on gateway servers:

```bash
wget https://github.com/nginxinc/nginx-prometheus-exporter/releases/download/v0.11.0/nginx-prometheus-exporter_0.11.0_linux_amd64.tar.gz
tar xvfz nginx-prometheus-exporter_0.11.0_linux_amd64.tar.gz
sudo mv nginx-prometheus-exporter /usr/local/bin/

# Create systemd service
sudo cat > /etc/systemd/system/nginx_exporter.service <<'EOF'
[Unit]
Description=NGINX Prometheus Exporter
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/nginx-prometheus-exporter -nginx.scrape-uri=http://localhost/nginx_status

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable nginx_exporter
sudo systemctl start nginx_exporter
```

**Deploy Prometheus & Grafana** (on monitoring server):

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Deploy monitoring stack
cd servers/gateway/docker
docker-compose -f docker-compose-monitoring.yml up -d
```

---

## ✅ Verification Checklist

### DNS & SSL

- [ ] DNS resolves to gateway IPs
- [ ] HTTPS works: `curl https://api.insightserenity.com/health`
- [ ] SSL certificate valid (not self-signed)
- [ ] HTTP redirects to HTTPS
- [ ] SSL Labs rating A or A+

### Backend Servers

**Admin Servers (5)**:
- [ ] All 5 admin servers responding on port 3002
- [ ] SSL enabled on each
- [ ] Connected to MongoDB Atlas
- [ ] PM2 running and enabled at boot

**Customer Service Servers (5)**:
- [ ] All 5 customer servers responding on port 3001
- [ ] SSL enabled on each
- [ ] Connected to MongoDB Atlas
- [ ] PM2 running and enabled at boot

### Gateway

- [ ] NGINX running on both gateways
- [ ] keepalived active (VIP on master)
- [ ] Requests load balanced across backends
- [ ] Rate limiting working
- [ ] Logs showing in JSON format

### High Availability

- [ ] Test failover: Stop nginx on Gateway-1, VIP moves to Gateway-2
- [ ] Test recovery: Start nginx on Gateway-1, VIP stays on Gateway-2 (nopreempt)
- [ ] Backend failover: Stop one backend, requests route to others

### Monitoring

- [ ] Prometheus scraping all targets
- [ ] Grafana dashboards accessible
- [ ] Alerts configured and firing (test)
- [ ] Node exporter metrics visible

---

## 🧪 Testing

### Load Testing

```bash
# Install Apache Bench
sudo apt-get install apache2-utils

# Test admin endpoint
ab -n 1000 -c 50 -H "Authorization: Bearer test-token" \
    https://api.insightserenity.com/api/v1/admin/health

# Test customer endpoint
ab -n 10000 -c 100 https://api.insightserenity.com/api/v1/health
```

### Expected Results

- **Throughput**: 5,000+ requests/second
- **P95 Latency**: < 100ms
- **Error Rate**: < 0.1%
- **Failover Time**: < 5 seconds

---

## 📊 Capacity Planning

### Current Capacity

- **Admin Servers**: 5 x 1,000 connections = 5,000 concurrent
- **Customer Servers**: 5 x 1,500 connections = 7,500 concurrent
- **Total**: ~12,000 concurrent connections
- **Throughput**: ~50,000 requests/second

### Scaling Up

**Add more backend servers**:

1. Provision new server
2. Deploy application code
3. Update `/etc/nginx/upstreams/backends.conf` on gateways
4. Reload NGINX: `sudo nginx -s reload`

**No client-side changes needed!**

---

## 🔧 Maintenance

### Update Backend Servers

**Rolling update** (zero downtime):

```bash
# Update server 1
ssh admin-1
cd /opt/insightserenity-platform/servers/admin-server
git pull
npm install
pm2 restart admin-server
# Wait 30 seconds, check health

# Repeat for servers 2-5
```

### Update Gateway Configuration

```bash
# Test configuration
sudo nginx -t

# Reload (zero downtime)
sudo nginx -s reload
```

### Certificate Renewal

Automatic via certbot timer. Manual renewal:

```bash
sudo certbot renew
sudo nginx -s reload
```

---

## 🆘 Troubleshooting

### Gateway Not Accessible

```bash
# Check NGINX
sudo systemctl status nginx
sudo nginx -t

# Check firewall
sudo ufw status
sudo iptables -L

# Check keepalived
sudo systemctl status keepalived
ip addr show | grep 10.0.1.100
```

### Backend Not Reachable

```bash
# Check backend
ssh admin-1
pm2 status
curl -k https://localhost:3002/health

# Check network
telnet 10.0.2.10 3002
```

### SSL Issues

```bash
# Check certificate
sudo certbot certificates

# Test renewal
sudo certbot renew --dry-run

# Check NGINX SSL config
sudo nginx -T | grep ssl
```

---

## 📈 Monitoring URLs

- **Grafana**: http://monitoring-server:3000
- **Prometheus**: http://monitoring-server:9090
- **AlertManager**: http://monitoring-server:9093

---

## 🎯 Success Criteria

✅ All 5 admin servers running with SSL
✅ All 5 customer service servers running with SSL
✅ Gateway accessible via `https://api.insightserenity.com`
✅ Load balancing working across all backends
✅ Automatic failover working
✅ SSL certificate valid and auto-renewing
✅ Monitoring operational
✅ < 100ms P95 latency
✅ 99.9%+ uptime

---

**Deployment Date**: _______________
**Deployed By**: _______________
**Production URL**: https://api.insightserenity.com
**Status**: _______________
