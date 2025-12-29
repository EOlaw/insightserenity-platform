#!/bin/bash
# ============================================================================
# Gateway Rollback Script
# ============================================================================
# Description: Rollback gateway to previous version
# Usage: ./rollback.sh [version]
# ============================================================================

set -e

# Configuration
VERSION="${1:-previous}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="/var/backups/gateway"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

echo "============================================================"
echo "  Gateway Rollback"
echo "  Target Version: $VERSION"
echo "============================================================"
echo

# Confirm rollback
read -p "Are you sure you want to rollback? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
    log_error "Rollback cancelled"
    exit 1
fi

log_info "Starting rollback..."

# Step 1: Find backup
if [ "$VERSION" = "previous" ]; then
    BACKUP_FILE=$(ls -t "$BACKUP_DIR"/nginx-config-*.tar.gz 2>/dev/null | head -2 | tail -1)
else
    BACKUP_FILE="$BACKUP_DIR/nginx-config-$VERSION.tar.gz"
fi

if [ ! -f "$BACKUP_FILE" ]; then
    log_error "Backup file not found: $BACKUP_FILE"
    exit 1
fi

log_info "Using backup: $BACKUP_FILE"

# Step 2: Backup current config
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
log_info "Backing up current configuration..."
tar -czf "$BACKUP_DIR/nginx-config-before-rollback-$TIMESTAMP.tar.gz" /etc/nginx/

# Step 3: Restore from backup
log_info "Restoring configuration from backup..."
tar -xzf "$BACKUP_FILE" -C /

# Step 4: Test configuration
log_info "Testing NGINX configuration..."
if nginx -t; then
    log_info "✓ Configuration test passed"
else
    log_error "✗ Configuration test failed"
    log_error "Restoring from current backup..."
    tar -xzf "$BACKUP_DIR/nginx-config-before-rollback-$TIMESTAMP.tar.gz" -C /
    exit 1
fi

# Step 5: Reload NGINX
log_info "Reloading NGINX..."
systemctl reload nginx

# Step 6: Verify
sleep 3
if curl -sf http://localhost/health > /dev/null; then
    log_info "✓ Health check passed"
else
    log_error "✗ Health check failed"
    exit 1
fi

echo
echo "============================================================"
log_info "Rollback completed successfully!"
echo "============================================================"
