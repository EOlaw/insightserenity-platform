#!/bin/bash

# Model Migration Script
# This script copies models from admin-server modules to shared models directory
# Preserving the original module structure under admin-server folder

BASE_DIR="."
ADMIN_SERVER_MODULES="$BASE_DIR/servers/admin-server/modules"
SHARED_MODELS="$BASE_DIR/shared/lib/database/models/admin-server"

echo "Starting model migration process..."

# Copy Platform Management Module
echo "Copying billing-administration module models..."
cp -r "$ADMIN_SERVER_MODULES/billing-administration/models" "$SHARED_MODELS/billing-administration/" 2>/dev/null
if [ $? -eq 0 ]; then
    echo "  ✓ Billing administration models copied successfully"
else
    echo "  ⚠ Warning: Some billing administration model files may not exist"
fi

# Copy Platform Management Module
echo "Copying organization-management module models..."
cp -r "$ADMIN_SERVER_MODULES/organization-management/models" "$SHARED_MODELS/organization-management/" 2>/dev/null
if [ $? -eq 0 ]; then
    echo "  ✓ Organization management models copied successfully"
else
    echo "  ⚠ Warning: Some organization management model files may not exist"
fi

# Copy Platform Management Module
echo "Copying platform-management module models..."
cp -r "$ADMIN_SERVER_MODULES/platform-management/models" "$SHARED_MODELS/platform-management/" 2>/dev/null
if [ $? -eq 0 ]; then
    echo "  ✓ Platform management models copied successfully"
else
    echo "  ⚠ Warning: Some platform management model files may not exist"
fi

# Copy Reports Analytics Module
echo "Copying reports-analytics module models..."
cp -r "$ADMIN_SERVER_MODULES/reports-analytics/models" "$SHARED_MODELS/reports-analytics/" 2>/dev/null
if [ $? -eq 0 ]; then
    echo "  ✓ Reports analytics models copied successfully"
else
    echo "  ⚠ Warning: Some reports analytics model files may not exist"
fi

# Copy Security Administration Module
echo "Copying security-administration module models..."
cp -r "$ADMIN_SERVER_MODULES/security-administration/models" "$SHARED_MODELS/security-administration/" 2>/dev/null
if [ $? -eq 0 ]; then
    echo "  ✓ Security administration models copied successfully"
else
    echo "  ⚠ Warning: Some security administration model files may not exist"
fi

# Copy Security Administration Module
echo "Copying support-administration module models..."
cp -r "$ADMIN_SERVER_MODULES/support-administration/models" "$SHARED_MODELS/support-administration/" 2>/dev/null
if [ $? -eq 0 ]; then
    echo "  ✓ Support administration models copied successfully"
else
    echo "  ⚠ Warning: Some support administration model files may not exist"
fi

# Copy User Management Module
echo "Copying system-monitoring module models..."
cp -r "$ADMIN_SERVER_MODULES/system-monitoring/models" "$SHARED_MODELS/system-monitoring/" 2>/dev/null
if [ $? -eq 0 ]; then
    echo "  ✓ System monitoring models copied successfully"
else
    echo "  ⚠ Warning: Some system monitoring model files may not exist"
fi

# Copy User Management Module
echo "Copying user-management module models..."
cp -r "$ADMIN_SERVER_MODULES/user-management/models" "$SHARED_MODELS/user-management/" 2>/dev/null
if [ $? -eq 0 ]; then
    echo "  ✓ User management models copied successfully"
else
    echo "  ⚠ Warning: Some user management model files may not exist"
fi



echo ""
echo "Model migration completed!"
echo "Files copied to: $SHARED_MODELS"
echo ""
echo "Next steps:"
echo "1. Update import paths in copied models"
echo "2. Update model registration in index files"
echo "3. Update references throughout the application"
