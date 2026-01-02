# HTTPS/SSL Setup for InsightSerenity Platform

## Overview

The entire InsightSerenity Platform now runs on HTTPS for secure local development:

- **Frontend (Next.js)**: `https://localhost:3000`
- **Customer Services API**: `https://localhost:3001`
- **Admin Server API**: `https://localhost:3002`

## SSL Certificates

### Frontend Certificate
- **Location**: `/ssl/localhost.crt` and `/ssl/localhost.key`
- **Type**: Self-signed certificate
- **Validity**: 365 days
- **Subject**: CN=localhost
- **SANs**: DNS:localhost, IP:127.0.0.1

### Backend Certificates
- **Customer Services**: `/servers/customer-services/ssl/`
- **Admin Server**: `/servers/admin-server/ssl/`

## Starting the Servers

### Frontend (Next.js with HTTPS)
```bash
npm run dev
# Runs on https://localhost:3000
```

### Frontend (HTTP fallback)
```bash
npm run dev:http
# Runs on http://localhost:3000 (without SSL)
```

### Customer Services
```bash
cd servers/customer-services
npm run start:dev
# Runs on https://localhost:3001
```

### Admin Server
```bash
cd servers/admin-server
npm start
# Runs on https://localhost:3002
```

## Browser Setup (First Time Only)

### Chrome/Edge
1. Navigate to `https://localhost:3000`
2. Click **"Advanced"**
3. Click **"Proceed to localhost (unsafe)"**
4. Repeat for `https://localhost:3001` and `https://localhost:3002`

### Firefox
1. Navigate to `https://localhost:3000`
2. Click **"Advanced"**
3. Click **"Accept the Risk and Continue"**
4. Repeat for backend URLs

### Safari
1. Navigate to `https://localhost:3000`
2. Click **"Show Details"**
3. Click **"visit this website"**
4. Enter your macOS password if prompted
5. Repeat for backend URLs

## Configuration Files

### Frontend
- **Custom Server**: `server.js`
- **Environment**: `.env.local`
- **SSL Certs**: `ssl/localhost.{crt,key}`

### Backend
- **Customer Services**: `servers/customer-services/.env` (SSL_ENABLED=true)
- **Admin Server**: `servers/admin-server/.env` (SSL_ENABLED=true)

## API Communication

All API calls from frontend to backend now use HTTPS:
```
https://localhost:3000 (Frontend)
    ↓ HTTPS
https://localhost:3001/api (Customer Services)
```

## Security Notes

⚠️ **Development Only**: These self-signed certificates are for local development ONLY.

❌ **Never use in production**: Production should use certificates from a trusted CA (Let's Encrypt, DigiCert, etc.)

✅ **Gitignore**: SSL certificates are automatically excluded from git via `.gitignore`

## Troubleshooting

### "ERR_CERT_AUTHORITY_INVALID"
This is expected with self-signed certificates. Click "Advanced" and proceed.

### "Network Error" or "ERR_SSL_PROTOCOL_ERROR"
1. Verify both frontend and backend are running on HTTPS
2. Check `.env.local` has `NEXT_PUBLIC_API_URL=https://localhost:3001/api`
3. Restart all servers

### "Connection refused"
1. Ensure all servers are running
2. Check no other services are using ports 3000, 3001, 3002
3. Verify SSL certificates exist:
   ```bash
   ls -la ssl/
   ls -la servers/customer-services/ssl/
   ls -la servers/admin-server/ssl/
   ```

### Certificate Expired
Regenerate certificates (valid for 365 days):
```bash
cd ssl
openssl req -x509 -newkey rsa:4096 -keyout localhost.key -out localhost.crt -days 365 -nodes -subj "/C=US/ST=State/L=City/O=InsightSerenity/OU=Development/CN=localhost" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
```

## Production Deployment

For production, replace self-signed certificates with:

1. **Let's Encrypt** (Free, automated)
   ```bash
   certbot certonly --standalone -d yourdomain.com
   ```

2. **Commercial CA** (DigiCert, Sectigo, etc.)
   - Purchase certificate
   - Complete domain validation
   - Install certificate files

3. **Update Production Config**
   ```env
   NEXT_PUBLIC_API_URL=https://api.yourdomain.com
   ```

## Additional Resources

- [Next.js Custom Server](https://nextjs.org/docs/pages/building-your-application/configuring/custom-server)
- [OpenSSL Documentation](https://www.openssl.org/docs/)
- [Let's Encrypt](https://letsencrypt.org/)
