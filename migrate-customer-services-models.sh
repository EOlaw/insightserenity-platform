#!/bin/bash

# Customer Services Model Migration Script
# This script copies models from customer-services modules to shared models directory
# Preserving the original module structure under customer-services folder

BASE_DIR="."
CUSTOMER_SERVICES_MODULES="$BASE_DIR/servers/customer-services/modules"
SHARED_MODELS="$BASE_DIR/shared/lib/database/models/customer-services"

echo "Starting customer services model migration process..."

# Core Business Modules
echo "=== Core Business Modules ==="

# Copy Clients Module
echo "Copying core-business/clients module models..."
cp -r "$CUSTOMER_SERVICES_MODULES/core-business/clients/models/"* "$SHARED_MODELS/core-business/clients/" 2>/dev/null
if [ $? -eq 0 ]; then
    echo "  ✓ Core business clients models copied successfully"
else
    echo "  ⚠ Warning: Some core business clients model files may not exist"
fi

# Copy Projects Module
echo "Copying core-business/projects module models..."
cp -r "$CUSTOMER_SERVICES_MODULES/core-business/projects/models/"* "$SHARED_MODELS/core-business/projects/" 2>/dev/null
if [ $? -eq 0 ]; then
    echo "  ✓ Core business projects models copied successfully"
else
    echo "  ⚠ Warning: Some core business projects model files may not exist"
fi

# Copy Consultants Module
echo "Copying core-business/consultants module models..."
cp -r "$CUSTOMER_SERVICES_MODULES/core-business/consultants/models/"* "$SHARED_MODELS/core-business/consultants/" 2>/dev/null
if [ $? -eq 0 ]; then
    echo "  ✓ Core business consultants models copied successfully"
else
    echo "  ⚠ Warning: Some core business consultants model files may not exist"
fi

# Copy Engagements Module
echo "Copying core-business/engagements module models..."
cp -r "$CUSTOMER_SERVICES_MODULES/core-business/engagements/models/"* "$SHARED_MODELS/core-business/engagements/" 2>/dev/null
if [ $? -eq 0 ]; then
    echo "  ✓ Core business engagements models copied successfully"
else
    echo "  ⚠ Warning: Some core business engagements model files may not exist"
fi

# Copy Core Business Analytics Module
echo "Copying core-business/analytics module models..."
cp -r "$CUSTOMER_SERVICES_MODULES/core-business/analytics/models/"* "$SHARED_MODELS/core-business/analytics/" 2>/dev/null
if [ $? -eq 0 ]; then
    echo "  ✓ Core business analytics models copied successfully"
else
    echo "  ⚠ Warning: Some core business analytics model files may not exist"
fi

# Hosted Organizations Modules
echo ""
echo "=== Hosted Organizations Modules ==="

# Copy Organizations Module
echo "Copying hosted-organizations/organizations module models..."
cp -r "$CUSTOMER_SERVICES_MODULES/hosted-organizations/organizations/models/"* "$SHARED_MODELS/hosted-organizations/organizations/" 2>/dev/null
if [ $? -eq 0 ]; then
    echo "  ✓ Hosted organizations models copied successfully"
else
    echo "  ⚠ Warning: Some hosted organizations model files may not exist"
fi

# Copy Tenants Module
echo "Copying hosted-organizations/tenants module models..."
cp -r "$CUSTOMER_SERVICES_MODULES/hosted-organizations/tenants/models/"* "$SHARED_MODELS/hosted-organizations/tenants/" 2>/dev/null
if [ $? -eq 0 ]; then
    echo "  ✓ Hosted tenants models copied successfully"
else
    echo "  ⚠ Warning: Some hosted tenants model files may not exist"
fi

# Copy Subscriptions Module
echo "Copying hosted-organizations/subscriptions module models..."
cp -r "$CUSTOMER_SERVICES_MODULES/hosted-organizations/subscriptions/models/"* "$SHARED_MODELS/hosted-organizations/subscriptions/" 2>/dev/null
if [ $? -eq 0 ]; then
    echo "  ✓ Hosted subscriptions models copied successfully"
else
    echo "  ⚠ Warning: Some hosted subscriptions model files may not exist"
fi

# Copy White Label Module
echo "Copying hosted-organizations/white-label module models..."
cp -r "$CUSTOMER_SERVICES_MODULES/hosted-organizations/white-label/models/"* "$SHARED_MODELS/hosted-organizations/white-label/" 2>/dev/null
if [ $? -eq 0 ]; then
    echo "  ✓ Hosted white-label models copied successfully"
else
    echo "  ⚠ Warning: Some hosted white-label model files may not exist"
fi

# Recruitment Services Modules
echo ""
echo "=== Recruitment Services Modules ==="

# Copy Jobs Module
echo "Copying recruitment-services/jobs module models..."
cp -r "$CUSTOMER_SERVICES_MODULES/recruitment-services/jobs/models/"* "$SHARED_MODELS/recruitment-services/jobs/" 2>/dev/null
if [ $? -eq 0 ]; then
    echo "  ✓ Recruitment jobs models copied successfully"
else
    echo "  ⚠ Warning: Some recruitment jobs model files may not exist"
fi

# Copy Candidates Module
echo "Copying recruitment-services/candidates module models..."
cp -r "$CUSTOMER_SERVICES_MODULES/recruitment-services/candidates/models/"* "$SHARED_MODELS/recruitment-services/candidates/" 2>/dev/null
if [ $? -eq 0 ]; then
    echo "  ✓ Recruitment candidates models copied successfully"
else
    echo "  ⚠ Warning: Some recruitment candidates model files may not exist"
fi

# Copy Applications Module
echo "Copying recruitment-services/applications module models..."
cp -r "$CUSTOMER_SERVICES_MODULES/recruitment-services/applications/models/"* "$SHARED_MODELS/recruitment-services/applications/" 2>/dev/null
if [ $? -eq 0 ]; then
    echo "  ✓ Recruitment applications models copied successfully"
else
    echo "  ⚠ Warning: Some recruitment applications model files may not exist"
fi

# Copy Partnerships Module
echo "Copying recruitment-services/partnerships module models..."
cp -r "$CUSTOMER_SERVICES_MODULES/recruitment-services/partnerships/models/"* "$SHARED_MODELS/recruitment-services/partnerships/" 2>/dev/null
if [ $? -eq 0 ]; then
    echo "  ✓ Recruitment partnerships models copied successfully"
else
    echo "  ⚠ Warning: Some recruitment partnerships model files may not exist"
fi

# Copy Recruitment Analytics Module
echo "Copying recruitment-services/analytics module models..."
cp -r "$CUSTOMER_SERVICES_MODULES/recruitment-services/analytics/models/"* "$SHARED_MODELS/recruitment-services/analytics/" 2>/dev/null
if [ $? -eq 0 ]; then
    echo "  ✓ Recruitment analytics models copied successfully"
else
    echo "  ⚠ Warning: Some recruitment analytics model files may not exist"
fi

echo ""
echo "Customer services model migration completed!"
echo "Files copied to: $SHARED_MODELS"
echo ""
echo "Migration Summary:"
echo "- Core Business: 5 modules (clients, projects, consultants, engagements, analytics)"
echo "- Hosted Organizations: 4 modules (organizations, tenants, subscriptions, white-label)"
echo "- Recruitment Services: 5 modules (jobs, candidates, applications, partnerships, analytics)"
echo ""
echo "Next steps:"
echo "1. Update import paths in copied models to reference shared location"
echo "2. Update model registration in index files for each module group"
echo "3. Update references throughout the customer-services application"
echo "4. Test multi-tenant model isolation and data access patterns"
echo "5. Verify subscription-based feature access controls"