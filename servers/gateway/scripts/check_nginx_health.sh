#!/bin/bash
# ============================================================================
# NGINX Health Check Script for keepalived
# ============================================================================
# Description: Comprehensive health check for NGINX gateway
# Usage: Called by keepalived every 2 seconds
# Exit codes: 0 = healthy, 1 = unhealthy
# ============================================================================

set -e

# Configuration
NGINX_PID_FILE="/var/run/nginx.pid"
HEALTH_ENDPOINT="http://localhost/health"
STATUS_ENDPOINT="http://localhost/nginx_status"
MAX_UNHEALTHY_UPSTREAMS=2
TIMEOUT=3

# Logging
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | logger -t nginx-health-check
}

# ============================================================================
# Check 1: NGINX Process Running
# ============================================================================
if ! pidof nginx > /dev/null 2>&1; then
    log "CRITICAL: NGINX process not running"
    exit 1
fi

# Verify PID file exists
if [ ! -f "$NGINX_PID_FILE" ]; then
    log "WARNING: NGINX PID file not found"
    exit 1
fi

# ============================================================================
# Check 2: NGINX Can Serve Requests
# ============================================================================
HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" \
    --max-time $TIMEOUT \
    "$HEALTH_ENDPOINT" 2>/dev/null || echo "000")

if [ "$HTTP_CODE" != "200" ]; then
    log "CRITICAL: NGINX health endpoint returned $HTTP_CODE"
    exit 1
fi

# ============================================================================
# Check 3: NGINX Status Endpoint Accessible
# ============================================================================
if ! curl -sf --max-time $TIMEOUT "$STATUS_ENDPOINT" > /dev/null 2>&1; then
    log "WARNING: NGINX status endpoint not accessible"
    # Don't fail on this, as it might be an ACL issue
fi

# ============================================================================
# Check 4: Check Upstream Health
# ============================================================================
# Count unavailable upstreams from status page
# This works if you have NGINX Plus or nginx-module-vts
UNAVAILABLE_COUNT=0

if command -v curl > /dev/null 2>&1; then
    # Try to get upstream status (requires NGINX Plus or VTS module)
    UPSTREAM_STATUS=$(curl -sf --max-time $TIMEOUT "$STATUS_ENDPOINT" 2>/dev/null || echo "")

    if [ -n "$UPSTREAM_STATUS" ]; then
        # Count "unavail" or "down" in status
        UNAVAILABLE_COUNT=$(echo "$UPSTREAM_STATUS" | grep -c "unavail\|down" || echo "0")
    fi
fi

if [ "$UNAVAILABLE_COUNT" -gt "$MAX_UNHEALTHY_UPSTREAMS" ]; then
    log "CRITICAL: Too many unhealthy upstreams ($UNAVAILABLE_COUNT > $MAX_UNHEALTHY_UPSTREAMS)"
    exit 1
fi

# ============================================================================
# Check 5: Port Listening
# ============================================================================
if ! netstat -tuln 2>/dev/null | grep -q ':443.*LISTEN' && \
   ! ss -tuln 2>/dev/null | grep -q ':443.*LISTEN'; then
    log "CRITICAL: NGINX not listening on port 443"
    exit 1
fi

# ============================================================================
# Check 6: SSL Certificate Valid
# ============================================================================
CERT_FILE="/etc/letsencrypt/live/api.insightserenity.com/cert.pem"
if [ -f "$CERT_FILE" ]; then
    # Check if certificate expires in less than 7 days
    EXPIRY_DATE=$(openssl x509 -enddate -noout -in "$CERT_FILE" 2>/dev/null | cut -d= -f2)
    EXPIRY_EPOCH=$(date -d "$EXPIRY_DATE" +%s 2>/dev/null || echo "0")
    CURRENT_EPOCH=$(date +%s)
    DAYS_LEFT=$(( ($EXPIRY_EPOCH - $CURRENT_EPOCH) / 86400 ))

    if [ "$DAYS_LEFT" -lt 7 ]; then
        log "WARNING: SSL certificate expires in $DAYS_LEFT days"
        # Don't fail, but log warning
    fi
fi

# ============================================================================
# All Checks Passed
# ============================================================================
log "INFO: All health checks passed"
exit 0
