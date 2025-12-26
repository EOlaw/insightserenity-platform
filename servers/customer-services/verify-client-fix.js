const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.DATABASE_CUSTOMER_URI).then(async () => {
    console.log('=== Verifying Client Document Fix ===\n');

    const ClientSchema = new mongoose.Schema({}, { strict: false });
    const Client = mongoose.model('Client', ClientSchema, 'clients');

    // Get the most recent client
    const latestClient = await Client.findOne({}).sort({ createdAt: -1 });

    if (!latestClient) {
        console.log('No clients found');
        await mongoose.connection.close();
        process.exit(0);
        return;
    }

    console.log('Latest Client Document:');
    console.log('  Client ID:', latestClient._id);
    console.log('  Client Code:', latestClient.clientCode);
    console.log('  Company Name:', latestClient.companyName);
    console.log('  TenantId:', latestClient.tenantId);
    console.log('  TenantId Type:', typeof latestClient.tenantId);
    console.log('  OrganizationId:', latestClient.organizationId);
    console.log('  OrganizationId Type:', latestClient.organizationId?.constructor.name);
    console.log('  Created:', latestClient.createdAt);
    console.log('');

    // Check if tenantId is correct
    if (latestClient.tenantId === 'default') {
        console.log('✅ FIX VERIFIED: tenantId is correctly set to "default" (String)');
    } else if (typeof latestClient.tenantId === 'string') {
        console.log(`✅ FIX VERIFIED: tenantId is a String: "${latestClient.tenantId}"`);
    } else {
        console.log('❌ FIX NOT WORKING: tenantId is still:', latestClient.tenantId, '(type:', typeof latestClient.tenantId, ')');
    }

    // Now test the query that was failing
    console.log('\n=== Testing Query with tenantId="default" ===');
    const Client2 = mongoose.connection.models.Client || mongoose.model('Client', ClientSchema, 'clients');

    const clientByTenant = await Client2.findOne({
        _id: latestClient._id,
        tenantId: 'default'
    });

    if (clientByTenant) {
        console.log('✅ Query SUCCESS: Client found with tenantId="default"');
    } else {
        console.log('❌ Query FAILED: Client not found with tenantId="default"');
    }

    await mongoose.connection.close();
    process.exit(0);
}).catch(e => { console.error(e); process.exit(1); });
