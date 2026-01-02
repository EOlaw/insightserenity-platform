# HTTPS Login Testing Guide

## Setup Complete ✅

Your entire platform is now running on HTTPS:

- **Frontend**: `https://localhost:3000` ✅
- **Customer Services API**: `https://localhost:3001` ✅
- **Admin Server API**: `https://localhost:3002` ✅

## Changes Made

### 1. CORS Configuration Updated

**Customer Services** (`servers/customer-services/.env`):
```env
CORS_ORIGIN=https://localhost:3000,https://localhost:3001,https://localhost:4000,http://localhost:3000,http://localhost:3001,http://localhost:4000
```

**Admin Server** (`servers/admin-server/.env`):
```env
CORS_ORIGINS=https://localhost:3000,https://localhost:3001,https://localhost:5173,https://localhost:4000,https://localhost:8080,http://localhost:3000,http://localhost:3001,http://localhost:5173,http://localhost:4000,http://localhost:8080
```

### 2. Frontend Configuration

**Environment** (`.env.local`):
```env
NEXT_PUBLIC_API_URL=https://localhost:3001/api
```

**Custom Server** (`server.js`):
- Created HTTPS server with SSL certificates
- Configured to use `ssl/localhost.{crt,key}`

### 3. SSL Certificates

Generated for all services:
- Frontend: `ssl/localhost.{crt,key}`
- Customer Services: `servers/customer-services/ssl/`
- Admin Server: `servers/admin-server/ssl/`

## Testing Steps

### Step 1: Accept SSL Certificates (One-Time Setup)

⚠️ **IMPORTANT**: You must accept the self-signed certificates in your browser before login will work.

1. Open a new browser window/tab
2. Visit **`https://localhost:3001`**
3. You'll see: ⚠️ "Your connection is not private"
4. Click **"Advanced"** → **"Proceed to localhost (unsafe)"**
5. You should see: `{"success":false,"message":"Not Found"}` (this is OK!)
6. Repeat for **`https://localhost:3002`** if using admin server

### Step 2: Test Frontend HTTPS

1. Visit **`https://localhost:3000`**
2. Accept the certificate warning (same process as above)
3. You should see the InsightSerenity homepage

### Step 3: Test Login

1. Navigate to **`https://localhost:3000/login`**
2. Enter your credentials
3. Click "Login"

**Expected Result**:
- ✅ Login succeeds
- ✅ No "Network Error"
- ✅ No CORS errors in browser console
- ✅ Redirected to dashboard

## Troubleshooting

### Issue: "Network Error" when logging in

**Cause**: Browser hasn't accepted the backend SSL certificate yet

**Solution**:
1. Open browser DevTools (F12)
2. Go to Console tab
3. Look for the failing request URL
4. Visit that URL directly (e.g., `https://localhost:3001`)
5. Accept the certificate warning
6. Go back and try login again

### Issue: CORS Error

**Cause**: CORS origins not updated

**Solution**:
```bash
# Check customer services CORS config
grep CORS_ORIGIN servers/customer-services/.env

# Should include: https://localhost:3000

# If not, restart customer services:
cd servers/customer-services
npm run start:dev
```

### Issue: "ERR_CERT_AUTHORITY_INVALID"

**Cause**: Normal behavior with self-signed certificates

**Solution**: This is expected! Just click "Advanced" → "Proceed to localhost"

### Issue: Connection Refused

**Cause**: Service not running

**Solution**:
```bash
# Check what's running on each port
lsof -i :3000  # Frontend
lsof -i :3001  # Customer Services
lsof -i :3002  # Admin Server

# Start services:
npm run dev                                    # Frontend
cd servers/customer-services && npm run start:dev  # Customer Services
cd servers/admin-server && npm start               # Admin Server
```

## Verification Checklist

Before testing login, verify:

- [ ] Frontend running on `https://localhost:3000`
- [ ] Customer Services running on `https://localhost:3001`
- [ ] Accepted SSL certificate for `https://localhost:3001`
- [ ] Accepted SSL certificate for `https://localhost:3000`
- [ ] CORS config includes `https://localhost:3000`
- [ ] `.env.local` has `NEXT_PUBLIC_API_URL=https://localhost:3001/api`
- [ ] No errors in browser console (F12)
- [ ] No errors in customer services terminal

## Quick Test Commands

```bash
# Test frontend HTTPS
curl -k https://localhost:3000 | head -5

# Test backend HTTPS
curl -k https://localhost:3001/api/health

# Test login endpoint
curl -k -X POST https://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -H "Origin: https://localhost:3000" \
  -d '{"email":"test@example.com","password":"test123"}'
```

## Current Status

All services are configured and should be running:

- ✅ Frontend HTTPS server created
- ✅ SSL certificates generated
- ✅ CORS configuration updated
- ✅ Environment variables configured
- ✅ Customer Services restarted with new config

## Next Steps

1. **Accept SSL certificates** (see Step 1 above)
2. **Test login** at `https://localhost:3000/login`
3. **Check browser console** (F12) for any errors
4. **Report any issues** with full error messages

## Production Notes

For production deployment:

1. **Replace self-signed certificates** with certificates from a trusted CA:
   - Let's Encrypt (free)
   - DigiCert, Sectigo, etc. (commercial)

2. **Update CORS origins** to production domains:
   ```env
   CORS_ORIGIN=https://yourdomain.com,https://api.yourdomain.com
   ```

3. **Update environment variables**:
   ```env
   NEXT_PUBLIC_API_URL=https://api.yourdomain.com/api
   ```

4. **Enable production security settings**:
   - Set `NODE_ENV=production`
   - Enable HSTS
   - Configure CSP headers
   - Use strong SSL/TLS ciphers

## Support

If login still fails after following all steps:

1. Open browser DevTools (F12)
2. Go to Network tab
3. Try to login
4. Find the failed request
5. Check:
   - Request URL
   - Request Headers
   - Response (if any)
   - Console errors
6. Share these details for further assistance

---

**Last Updated**: January 2, 2026
**Platform Version**: 0.1.0
**Next.js Version**: 15.5.5
