#!/bin/bash
# ============================================================================
# Gateway Deployment Script
# ============================================================================
# Description: Automated deployment of gateway configuration
# Usage: ./deploy.sh [environment]
# ============================================================================

set -e

# Configuration
ENVIRONMENT="${1:-production}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GATEWAY_DIR="$(dirname "$SCRIPT_DIR")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Banner
echo "============================================================"
echo "  InsightSerenity Gateway Deployment"
echo "  Environment: $ENVIRONMENT"
echo "  Date: $(date)"
echo "============================================================"
echo

# Check prerequisites
log_info "Checking prerequisites..."

if ! command -v ansible &> /dev/null; then
    log_error "Ansible not found. Please install: pip install ansible"
    exit 1
fi

if ! command -v terraform &> /dev/null; then
    log_warn "Terraform not found. Skipping infrastructure provisioning."
fi

# Ask for confirmation
echo
read -p "Deploy to $ENVIRONMENT? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
    log_error "Deployment cancelled"
    exit 1
fi

# Step 1: Provision infrastructure (if Terraform available)
if command -v terraform &> /dev/null; then
    log_info "Step 1: Provisioning infrastructure with Terraform..."
    cd "$GATEWAY_DIR/terraform"

    terraform init
    terraform plan -var="environment=$ENVIRONMENT" -out=tfplan
    terraform apply tfplan

    log_info "Infrastructure provisioned successfully"
    cd "$SCRIPT_DIR"
else
    log_warn "Skipping infrastructure provisioning (Terraform not available)"
fi

# Step 2: Deploy with Ansible
log_info "Step 2: Deploying gateway configuration with Ansible..."

cd "$GATEWAY_DIR/ansible"
ansible-playbook \
    -i "playbooks/inventory/$ENVIRONMENT" \
    playbooks/deploy-gateway.yml \
    --extra-vars "environment=$ENVIRONMENT"

log_info "Configuration deployed successfully"

# Step 3: Verify deployment
log_info "Step 3: Verifying deployment..."

GATEWAY_URL="https://api.insightserenity.com"

# Wait for service to be ready
sleep 10

# Health check
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$GATEWAY_URL/health" || echo "000")

if [ "$HTTP_CODE" = "200" ]; then
    log_info "✓ Health check passed"
else
    log_error "✗ Health check failed (HTTP $HTTP_CODE)"
    exit 1
fi

# SSL check
if openssl s_client -connect api.insightserenity.com:443 -servername api.insightserenity.com < /dev/null 2>&1 | grep -q "Verify return code: 0"; then
    log_info "✓ SSL certificate valid"
else
    log_warn "✗ SSL certificate validation failed"
fi

# Final summary
echo
echo "============================================================"
echo "  Deployment Summary"
echo "============================================================"
echo "  Status: SUCCESS"
echo "  Environment: $ENVIRONMENT"
echo "  Gateway URL: $GATEWAY_URL"
echo "  Health: $GATEWAY_URL/health"
echo "  Metrics: $GATEWAY_URL/metrics"
echo "============================================================"
echo
log_info "Deployment completed successfully!"
