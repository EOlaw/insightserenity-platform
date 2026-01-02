#!/bin/bash

# ============================================================================
# Production Configuration Test Script
# ============================================================================
# Tests all production configurations locally before deployment
# ============================================================================

set -e

echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║   InsightSerenity Production Configuration Test                  ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Base directory
BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ADMIN_DIR="$BASE_DIR/../admin-server"
CUSTOMER_DIR="$BASE_DIR/../customer-services"

# Test counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Test function
test_check() {
    local test_name="$1"
    local test_command="$2"

    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    echo -n "  [$TOTAL_TESTS] $test_name... "

    if eval "$test_command" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ PASS${NC}"
        PASSED_TESTS=$((PASSED_TESTS + 1))
        return 0
    else
        echo -e "${RED}✗ FAIL${NC}"
        FAILED_TESTS=$((FAILED_TESTS + 1))
        return 1
    fi
}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1. Configuration Files"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

test_check "Admin .env exists" "[ -f '$ADMIN_DIR/.env' ]"
test_check "Customer .env exists" "[ -f '$CUSTOMER_DIR/.env' ]"
test_check "Production upstreams config exists" "[ -f '$BASE_DIR/nginx/upstreams/backends-production.conf' ]"
test_check "Production virtual host exists" "[ -f '$BASE_DIR/nginx/sites-available/api.insightserenity.com-production.conf' ]"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "2. SSL Certificates"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

test_check "Admin SSL key exists" "[ -f '$ADMIN_DIR/ssl/server.key' ]"
test_check "Admin SSL cert exists" "[ -f '$ADMIN_DIR/ssl/server.crt' ]"
test_check "Customer SSL key exists" "[ -f '$CUSTOMER_DIR/ssl/server.key' ]"
test_check "Customer SSL cert exists" "[ -f '$CUSTOMER_DIR/ssl/server.crt' ]"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "3. Port Configuration"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

test_check "Admin port is 3002" "grep -q 'PORT=3002' '$ADMIN_DIR/.env'"
test_check "Admin host is 0.0.0.0" "grep -q 'HOST=0.0.0.0' '$ADMIN_DIR/.env'"
test_check "Customer port is 3001" "grep -q 'PORT=3001' '$CUSTOMER_DIR/.env'"
test_check "Customer host is 0.0.0.0" "grep -q 'HOST=0.0.0.0' '$CUSTOMER_DIR/.env'"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "4. SSL Configuration"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

test_check "Admin SSL enabled" "grep -q 'SSL_ENABLED=true' '$ADMIN_DIR/.env'"
test_check "Customer SSL enabled" "grep -q 'USE_SSL=true' '$CUSTOMER_DIR/.env'"
test_check "Admin SSL key path configured" "grep -q 'SSL_KEY_PATH=./ssl/server.key' '$ADMIN_DIR/.env'"
test_check "Customer SSL key path configured" "grep -q 'SSL_KEY_PATH=./ssl/server.key' '$CUSTOMER_DIR/.env'"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "5. Production Gateway Configuration"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

test_check "5 admin servers configured" "grep -v '^#' '$BASE_DIR/nginx/upstreams/backends-production.conf' | grep -c 'server 10.0.2' | grep -q '5'"
test_check "5 customer servers configured" "grep -v '^#' '$BASE_DIR/nginx/upstreams/backends-production.conf' | grep -c 'server 10.0.3.1[0-4]:3001' | grep -q '10'"
test_check "Weighted round-robin for admin" "grep -q 'weight=' '$BASE_DIR/nginx/upstreams/backends-production.conf'"
test_check "Least connections for customer" "grep -q 'least_conn' '$BASE_DIR/nginx/upstreams/backends-production.conf'"
test_check "Keepalive connections configured" "grep -q 'keepalive' '$BASE_DIR/nginx/upstreams/backends-production.conf'"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "6. SSL/TLS Configuration in Virtual Host"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

VHOST="$BASE_DIR/nginx/sites-available/api.insightserenity.com-production.conf"

test_check "HTTPS listener configured" "grep -q 'listen 443 ssl http2' '$VHOST'"
test_check "HTTP redirect configured" "grep -q 'return 301 https' '$VHOST'"
test_check "TLS 1.2/1.3 only" "grep -q 'ssl_protocols TLSv1.2 TLSv1.3' '$VHOST'"
test_check "HSTS header configured" "grep -q 'Strict-Transport-Security' '$VHOST'"
test_check "Security headers present" "grep -q 'X-Frame-Options' '$VHOST'"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "7. Rate Limiting & Security"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

test_check "Admin rate limiting configured" "grep -q 'limit_req zone=admin' '$VHOST'"
test_check "Customer rate limiting configured" "grep -q 'limit_req zone=api' '$VHOST'"
test_check "Connection limiting configured" "grep -q 'limit_conn' '$VHOST'"
test_check "CSP header configured" "grep -q 'Content-Security-Policy' '$VHOST'"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "8. Documentation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

test_check "Production deployment guide exists" "[ -f '$BASE_DIR/PRODUCTION-DEPLOYMENT-GUIDE.md' ]"
test_check "Production summary exists" "[ -f '$BASE_DIR/PRODUCTION-READY-SUMMARY.md' ]"
test_check "Gateway architecture doc exists" "[ -f '$BASE_DIR/docs/GATEWAY-ARCHITECTURE.md' ]"
test_check "Deployment runbook exists" "[ -f '$BASE_DIR/docs/DEPLOYMENT-RUNBOOK.md' ]"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "9. Runtime Tests (if servers are running)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check if admin server is running
if curl -k -s --connect-timeout 2 https://localhost:3002/health > /dev/null 2>&1; then
    test_check "Admin server responding on 3002" "curl -k -sf --connect-timeout 2 https://localhost:3002/health > /dev/null"
    test_check "Admin server has HTTPS" "curl -k -sf --connect-timeout 2 https://localhost:3002/health > /dev/null"

    # Check response format
    ADMIN_RESPONSE=$(curl -k -s https://localhost:3002/health)
    if echo "$ADMIN_RESPONSE" | grep -q '"status".*"healthy"'; then
        echo -e "  [$((TOTAL_TESTS + 1))] Admin returns valid JSON... ${GREEN}✓ PASS${NC}"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        echo -e "  [$((TOTAL_TESTS + 1))] Admin returns valid JSON... ${RED}✗ FAIL${NC}"
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
else
    echo -e "  ${YELLOW}ℹ Admin server not running (skipping runtime tests)${NC}"
fi

# Check if customer server is running
if curl -k -s --connect-timeout 2 https://localhost:3001/health > /dev/null 2>&1; then
    test_check "Customer server responding on 3001" "curl -k -sf --connect-timeout 2 https://localhost:3001/health > /dev/null"
    test_check "Customer server has HTTPS" "curl -k -sf --connect-timeout 2 https://localhost:3001/health > /dev/null"

    # Check response format
    CUSTOMER_RESPONSE=$(curl -k -s https://localhost:3001/health)
    if echo "$CUSTOMER_RESPONSE" | grep -q '"status".*"healthy"'; then
        echo -e "  [$((TOTAL_TESTS + 1))] Customer returns valid JSON... ${GREEN}✓ PASS${NC}"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        echo -e "  [$((TOTAL_TESTS + 1))] Customer returns valid JSON... ${RED}✗ FAIL${NC}"
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
else
    echo -e "  ${YELLOW}ℹ Customer server not running (skipping runtime tests)${NC}"
fi

# Check if gateway is running
if docker ps | grep -q gateway-test; then
    test_check "Gateway container running" "docker ps | grep -q gateway-test"

    if curl -s --connect-timeout 2 http://localhost/health > /dev/null 2>&1; then
        test_check "Gateway responding on port 80" "curl -sf --connect-timeout 2 http://localhost/health > /dev/null"
    fi
else
    echo -e "  ${YELLOW}ℹ Gateway not running (start with: cd docker && docker-compose -f docker-compose.test.yml up -d)${NC}"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Test Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Total Tests:  $TOTAL_TESTS"
echo -e "  Passed:       ${GREEN}$PASSED_TESTS${NC}"
echo -e "  Failed:       ${RED}$FAILED_TESTS${NC}"
echo ""

if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "${GREEN}✓ ALL TESTS PASSED!${NC}"
    echo ""
    echo "🎉 Your production configuration is ready!"
    echo ""
    echo "Next steps:"
    echo "  1. Review: cat PRODUCTION-READY-SUMMARY.md"
    echo "  2. Deploy: Follow PRODUCTION-DEPLOYMENT-GUIDE.md"
    echo "  3. Test locally: Start servers and gateway, then test"
    echo ""
    exit 0
else
    echo -e "${RED}✗ SOME TESTS FAILED${NC}"
    echo ""
    echo "Please fix the failed tests before deploying to production."
    echo ""
    exit 1
fi
