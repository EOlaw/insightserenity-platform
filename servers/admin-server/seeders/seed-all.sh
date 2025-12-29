#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "======================================================================"
echo "  🌱 INSIGHTSERENITY ADMIN DATABASE SEEDER"
echo "======================================================================"
echo ""
echo "Database: insightserenity_admin_dev"
echo ""

# Run permissions seeder
echo -e "${YELLOW}[1/4] Seeding Permissions...${NC}"
node seeders/seed-permissions.js > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo -e "${GREEN}✅ Permissions seeded successfully${NC}"
else
  echo -e "${RED}❌ Permissions seeding failed${NC}"
fi
echo ""

# Run roles seeder
echo -e "${YELLOW}[2/4] Seeding Roles...${NC}"
node seeders/seed-roles.js > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo -e "${GREEN}✅ Roles seeded successfully${NC}"
else
  echo -e "${RED}❌ Roles seeding failed (will continue)${NC}"
fi
echo ""

# Run super admin seeder
echo -e "${YELLOW}[3/4] Seeding Super Admin...${NC}"
node seeders/seed-super-admin.js > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo -e "${GREEN}✅ Super Admin seeded successfully${NC}"
else
  echo -e "${RED}❌ Super Admin seeding failed (will continue)${NC}"
fi
echo ""

# Run dev data seeder
echo -e "${YELLOW}[4/4] Seeding Development Data...${NC}"
node seeders/seed-dev-data.js > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo -e "${GREEN}✅ Development data seeded successfully${NC}"
else
  echo -e "${RED}❌ Development data seeding failed${NC}"
fi
echo ""

echo "======================================================================"
echo "  📋 SEEDING COMPLETE"
echo "======================================================================"
echo ""
echo "Test Credentials (if seeding succeeded):"
echo ""
echo "  Super Admin:"
echo "    Email: superadmin@insightserenity.com"
echo "    Password: SuperAdmin123!"
echo ""
echo "  Admin User:"
echo "    Email: admin@devtest.com"
echo "    Password: DevPassword123!"
echo ""
echo "  Support User:"
echo "    Email: support@devtest.com"
echo "    Password: DevPassword123!"
echo ""
echo "======================================================================"
echo "  🚀 START TESTING"
echo "======================================================================"
echo ""
echo "Test the API with:"
echo ""
echo '  curl -X POST http://localhost:3000/api/v1/admin/users/auth/login \'
echo '    -H "Content-Type: application/json" \'
echo '    -d '"'"'{"email":"superadmin@insightserenity.com","password":"SuperAdmin123!"}'"'"''
echo ""
echo "======================================================================"
