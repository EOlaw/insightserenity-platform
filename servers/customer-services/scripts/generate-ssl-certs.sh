#!/bin/bash

# ============================================================================
# SSL Certificate Generation Script
# ============================================================================
# Generates self-signed SSL certificates for development
# For production, use Let's Encrypt or commercial certificates
# ============================================================================

set -e

echo "🔐 Generating SSL Certificates for Admin Server..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Create SSL directory
SSL_DIR="$(dirname "$0")/../ssl"
mkdir -p "$SSL_DIR"

# Certificate details
DOMAIN="${SSL_DOMAIN:-api.insightserenity.com}"
COUNTRY="${SSL_COUNTRY:-US}"
STATE="${SSL_STATE:-California}"
CITY="${SSL_CITY:-San Francisco}"
ORG="${SSL_ORG:-InsightSerenity}"
OU="${SSL_OU:-Engineering}"
EMAIL="${SSL_EMAIL:-devops@insightserenity.com}"
DAYS="${SSL_DAYS:-3650}"  # 10 years for development

echo "📝 Certificate Information:"
echo "   Domain:        $DOMAIN"
echo "   Organization:  $ORG"
echo "   Validity:      $DAYS days"
echo ""

# Generate private key
echo "🔑 Generating private key..."
openssl genrsa -out "$SSL_DIR/server.key" 4096 2>/dev/null

# Generate certificate signing request
echo "📄 Generating certificate signing request..."
openssl req -new \
    -key "$SSL_DIR/server.key" \
    -out "$SSL_DIR/server.csr" \
    -subj "/C=$COUNTRY/ST=$STATE/L=$CITY/O=$ORG/OU=$OU/CN=$DOMAIN/emailAddress=$EMAIL" \
    2>/dev/null

# Generate self-signed certificate
echo "🎫 Generating self-signed certificate..."
openssl x509 -req \
    -in "$SSL_DIR/server.csr" \
    -signkey "$SSL_DIR/server.key" \
    -out "$SSL_DIR/server.crt" \
    -days "$DAYS" \
    -sha256 \
    -extfile <(printf "subjectAltName=DNS:$DOMAIN,DNS:*.$DOMAIN,DNS:localhost,IP:127.0.0.1,IP:0.0.0.0") \
    2>/dev/null

# Create CA bundle (for self-signed, just copy the cert)
cp "$SSL_DIR/server.crt" "$SSL_DIR/ca-bundle.crt"

# Set proper permissions
chmod 600 "$SSL_DIR/server.key"
chmod 644 "$SSL_DIR/server.crt"
chmod 644 "$SSL_DIR/ca-bundle.crt"

# Display certificate info
echo ""
echo "✅ SSL Certificates Generated Successfully!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📂 Location: $SSL_DIR"
echo ""
echo "📁 Generated Files:"
echo "   ├── server.key        (Private Key)"
echo "   ├── server.crt        (Certificate)"
echo "   ├── server.csr        (Certificate Signing Request)"
echo "   └── ca-bundle.crt     (CA Bundle)"
echo ""

# Verify certificate
echo "🔍 Certificate Details:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
openssl x509 -in "$SSL_DIR/server.crt" -noout -subject -issuer -dates -ext subjectAltName 2>/dev/null

echo ""
echo "⚠️  IMPORTANT:"
echo "   - These are SELF-SIGNED certificates for DEVELOPMENT only"
echo "   - For PRODUCTION, use Let's Encrypt or commercial certificates"
echo "   - Browsers will show security warnings for self-signed certs"
echo ""
echo "🚀 To use in production with Let's Encrypt:"
echo "   1. Install certbot: sudo apt-get install certbot"
echo "   2. Run: sudo certbot certonly --standalone -d $DOMAIN"
echo "   3. Update .env SSL paths to /etc/letsencrypt/live/$DOMAIN/"
echo ""
