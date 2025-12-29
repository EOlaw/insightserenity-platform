# Production Deployment Guide
## Insight Serenity B2B Consultation Platform

Complete step-by-step guide for deploying the Insight Serenity platform to production.

---

## 📋 Pre-Deployment Checklist

### Infrastructure Requirements

- [ ] **MongoDB Atlas** - Production database cluster (M10+ recommended)
- [ ] **Redis Cloud** - Session store and caching (1GB+ recommended)
- [ ] **AWS S3** - File storage bucket configured
- [ ] **Stripe Account** - Live mode activated, webhook configured
- [ ] **Zoom** - Server-to-Server OAuth app created
- [ ] **SendGrid** - Verified sender domain, API key generated
- [ ] **SSL/TLS Certificates** - Valid certificates for all domains
- [ ] **Domain Names** - DNS records configured

### Security Prerequisites

- [ ] All secrets generated using cryptographically secure methods
- [ ] Environment variables stored in secure vault (AWS Secrets Manager / Azure Key Vault)
- [ ] Firewall rules configured (only allow ports 80, 443)
- [ ] DDoS protection enabled (Cloudflare / AWS Shield)
- [ ] Rate limiting configured
- [ ] CORS policies reviewed and tightened
- [ ] All dependencies updated to latest secure versions

---

## 🔐 Step 1: Environment Configuration

### 1.1 Generate Secrets

```bash
# Session Secret (64 characters)
openssl rand -base64 48

# JWT Secret (64 characters)
openssl rand -base64 48

# JWT Refresh Secret (64 characters)
openssl rand -base64 48

# Encryption Key (32 bytes hex)
openssl rand -hex 32
```

### 1.2 Configure Environment Variables

Copy the template:
```bash
cp servers/customer-services/.env.production.template servers/customer-services/.env.production
```

Fill in **ALL** values in `.env.production`. Never skip any variable.

### 1.3 Verify Configuration

```bash
cd servers/customer-services
node scripts/verify-env.js production
```

---

## 🗄️ Step 2: Database Setup

### 2.1 MongoDB Atlas Configuration

1. **Create Production Cluster:**
   - Go to MongoDB Atlas → Create New Cluster
   - Select tier: M10 or higher (recommended: M30 for production)
   - Region: Choose closest to your application servers
   - Enable **Backup** (Point-in-Time Restore)

2. **Configure Network Access:**
   ```
   IP Whitelist: Add application server IPs
   Database Access: Create user with strong password
   ```

3. **Connection String:**
   ```
   mongodb+srv://username:password@cluster.mongodb.net/insightserenity-prod?retryWrites=true&w=majority
   ```

4. **Create Indexes:**
   ```bash
   npm run db:create-indexes
   ```

### 2.2 Redis Cloud Configuration

1. **Create Redis Instance:**
   - Go to Redis Cloud → Create Database
   - Memory: 1GB minimum
   - Enable **Persistence** (AOF + RDB)
   - Enable **High Availability**

2. **Configure Connection:**
   ```bash
   REDIS_URL=redis://username:password@host:port
   ```

---

## 💳 Step 3: Payment Integration (Stripe)

### 3.1 Stripe Live Mode Setup

1. **Activate Live Mode:**
   - Complete Stripe account verification
   - Add business details and bank account
   - Submit tax information

2. **Get Live API Keys:**
   ```bash
   STRIPE_SECRET_KEY=sk_live_...
   STRIPE_PUBLISHABLE_KEY=pk_live_...
   ```

3. **Configure Webhooks:**

   **Endpoint URL:** `https://api.insightserenity.com/api/payments/webhook`

   **Events to Subscribe:**
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `charge.refunded`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`

4. **Get Webhook Secret:**
   ```bash
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```

5. **Test Webhook:**
   ```bash
   stripe listen --forward-to https://api.insightserenity.com/api/payments/webhook
   ```

---

## 📹 Step 4: Zoom Integration

### 4.1 Create Server-to-Server OAuth App

1. **Go to Zoom App Marketplace** → Develop → Build App
2. **Select:** Server-to-Server OAuth
3. **App Credentials:**
   ```bash
   ZOOM_ACCOUNT_ID=...
   ZOOM_CLIENT_ID=...
   ZOOM_CLIENT_SECRET=...
   ```

4. **Add Scopes:**
   - `meeting:write:admin`
   - `meeting:read:admin`
   - `user:read:admin`
   - `meeting:delete:admin`
   - `recording:read:admin`

5. **Activate App** → Copy credentials to `.env.production`

6. **Verify Integration:**
   ```bash
   npm run test:zoom-integration
   ```

---

## 📧 Step 5: Email Configuration (SendGrid)

### 5.1 Domain Verification

1. **Add Domain in SendGrid:**
   - Settings → Sender Authentication → Verify Domain
   - Add DNS records (SPF, DKIM, CNAME)
   - Wait for verification (can take 24-48 hours)

2. **Create API Key:**
   - Settings → API Keys → Create API Key
   - Permission: Full Access
   ```bash
   SENDGRID_API_KEY=SG.xxx...
   ```

3. **Configure From Address:**
   ```bash
   SENDGRID_FROM_EMAIL=noreply@insightserenity.com
   SENDGRID_FROM_NAME=Insight Serenity
   ```

### 5.2 Test Email Delivery

```bash
npm run test:send-email
```

---

## 🚀 Step 6: Application Deployment

### 6.1 Build Application

```bash
# Install production dependencies only
npm ci --production

# Build Next.js frontend
npm run build

# Build backend services
cd servers/customer-services
npm ci --production
```

### 6.2 Deploy Backend (Customer Services)

**Option A: Docker Deployment**

```dockerfile
# Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
EXPOSE 3001
CMD ["node", "server.js"]
```

```bash
docker build -t insightserenity-backend:latest .
docker run -d -p 3001:3001 --env-file .env.production insightserenity-backend:latest
```

**Option B: PM2 Deployment**

```bash
# Install PM2 globally
npm install -g pm2

# Start with ecosystem file
pm2 start ecosystem.config.js --env production

# Save PM2 configuration
pm2 save

# Setup startup script
pm2 startup
```

**Ecosystem Configuration (ecosystem.config.js):**
```javascript
module.exports = {
  apps: [{
    name: 'customer-services',
    script: './servers/customer-services/server.js',
    instances: 'max',
    exec_mode: 'cluster',
    env_production: {
      NODE_ENV: 'production'
    },
    error_file: '/var/log/insightserenity/error.log',
    out_file: '/var/log/insightserenity/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
  }]
};
```

### 6.3 Deploy Frontend (Next.js)

**Option A: Vercel (Recommended)**

```bash
npm install -g vercel
vercel --prod
```

**Option B: Self-Hosted**

```bash
npm run build
npm start
```

---

## 🔒 Step 7: Security Hardening

### 7.1 SSL/TLS Configuration

1. **Obtain Certificates:**
   - Use Let's Encrypt (free, auto-renewal)
   - Or purchase commercial certificate

2. **Configure Nginx Reverse Proxy:**

```nginx
server {
    listen 443 ssl http2;
    server_name api.insightserenity.com;

    ssl_certificate /etc/letsencrypt/live/insightserenity.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/insightserenity.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name api.insightserenity.com;
    return 301 https://$server_name$request_uri;
}
```

### 7.2 Firewall Configuration

```bash
# Allow SSH (22), HTTP (80), HTTPS (443)
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### 7.3 Enable Security Headers

Headers are already configured in `app.js`:
- `helmet()` middleware
- `xss-clean()` middleware
- `hpp()` middleware
- `express-mongo-sanitize()` middleware

---

## 📊 Step 8: Monitoring & Logging

### 8.1 Setup Sentry (Error Tracking)

1. **Create Sentry Project** → Get DSN
2. **Configure:**
   ```bash
   SENTRY_DSN=https://xxx@sentry.io/xxx
   SENTRY_ENVIRONMENT=production
   SENTRY_TRACES_SAMPLE_RATE=0.1
   ```

### 8.2 Setup Logging

Logs are automatically written to:
- Console (for Docker/PM2 capture)
- `/var/log/insightserenity/combined.log`
- `/var/log/insightserenity/error.log`

**Log Rotation:**
```bash
# /etc/logrotate.d/insightserenity
/var/log/insightserenity/*.log {
    daily
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 www-data www-data
    sharedscripts
}
```

### 8.3 Health Check Endpoint

```bash
# Check system health
curl https://api.insightserenity.com/health

# Expected response:
{
  "status": "healthy",
  "timestamp": "2025-01-15T10:30:00.000Z",
  "services": {
    "database": "connected",
    "redis": "connected",
    "cron": "running"
  }
}
```

---

## 🧪 Step 9: Production Testing

### 9.1 Smoke Tests

```bash
# Run production smoke tests
npm run test:smoke:production

# Test critical paths
npm run test:integration:production
```

### 9.2 Manual Testing Checklist

- [ ] User registration and email verification
- [ ] Login/logout functionality
- [ ] Password reset flow
- [ ] Consultation booking
- [ ] Credit purchase (Stripe test mode first!)
- [ ] Zoom meeting creation
- [ ] Email notifications sent
- [ ] Cron jobs running
- [ ] Credit expiration warnings
- [ ] Payment webhooks processing

---

## 📈 Step 10: Performance Optimization

### 10.1 Enable Compression

Already enabled in `app.js`:
```javascript
app.use(compression());
```

### 10.2 Enable Redis Caching

```bash
ENABLE_CACHING=true
CACHE_TTL=3600
```

### 10.3 Database Query Optimization

```bash
# Ensure indexes exist
npm run db:create-indexes

# Run explain on slow queries
npm run db:analyze-performance
```

---

## 🔄 Step 11: Backup & Disaster Recovery

### 11.1 Automated MongoDB Backups

MongoDB Atlas Point-in-Time Restore (enabled by default on M10+):
- Continuous backups
- Retain snapshots for 30+ days
- One-click restore

### 11.2 Application Files Backup

```bash
# Backup to S3
aws s3 sync /var/log/insightserenity s3://insightserenity-backups/logs/$(date +%Y-%m-%d)/

# Backup environment config (encrypted)
gpg --encrypt .env.production
aws s3 cp .env.production.gpg s3://insightserenity-backups/config/
```

---

## 🚨 Step 12: Launch Readiness

### Final Checklist

- [ ] All environment variables configured
- [ ] Database indexed and optimized
- [ ] Stripe live mode activated and tested
- [ ] Zoom integration tested
- [ ] Email delivery verified
- [ ] SSL certificates installed
- [ ] Monitoring and logging active
- [ ] Backups configured
- [ ] Health checks passing
- [ ] Load testing completed
- [ ] Security audit passed
- [ ] Documentation updated
- [ ] Team trained on deployment procedures
- [ ] Rollback plan documented
- [ ] Support team notified

---

## 🔧 Maintenance

### Regular Tasks

**Daily:**
- Monitor error logs
- Check health endpoint
- Review Sentry errors

**Weekly:**
- Review database performance
- Check disk usage
- Review security alerts
- Update dependencies

**Monthly:**
- Rotate secrets
- Review access logs
- Update SSL certificates (if needed)
- Performance optimization review

---

## 📞 Support & Escalation

**Platform Issues:**
- Check health endpoint first
- Review logs in `/var/log/insightserenity/`
- Check Sentry for recent errors

**Database Issues:**
- MongoDB Atlas Support: support@mongodb.com
- Check cluster metrics in Atlas dashboard

**Payment Issues:**
- Stripe Support: https://support.stripe.com
- Check webhook logs in Stripe dashboard

**Email Issues:**
- SendGrid Support: support@sendgrid.com
- Check activity feed in SendGrid dashboard

---

**Deployment Guide Version:** 1.0.0
**Last Updated:** December 2025
**Status:** Production Ready ✅
