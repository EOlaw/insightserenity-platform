const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.DATABASE_CUSTOMER_URI).then(async () => {
    const PackageSchema = new mongoose.Schema({}, { strict: false });
    const Package = mongoose.model('ConsultationPackage', PackageSchema, 'consultationpackages');

    console.log('=== Debugging Package Query ===\n');

    // Check all packages
    const all = await Package.find({ tenantId: 'default' });
    console.log(`Total packages with tenantId="default": ${all.length}\n`);

    if (all.length > 0) {
        const pkg = all[0];
        console.log('Sample package structure:');
        console.log('- packageId:', pkg.packageId);
        console.log('- tenantId:', pkg.tenantId, `(type: ${typeof pkg.tenantId})`);
        console.log('- availability.status:', pkg.availability?.status);
        console.log('- availability.startDate:', pkg.availability?.startDate);
        console.log('- availability.endDate:', pkg.availability?.endDate);
        console.log('- availability.availableFrom:', pkg.availability?.availableFrom);
        console.log('- availability.availableUntil:', pkg.availability?.availableUntil);
        console.log('- availability.featuredPackage:', pkg.availability?.featuredPackage);
        console.log('- isDeleted:', pkg.isDeleted);
        console.log();
    }

    // Test the actual query from findActivePackages
    console.log('Testing query with BROKEN $or logic:');
    const brokenQuery = {
        tenantId: 'default',
        'availability.status': 'active',
        isDeleted: false,
        $or: [
            { 'availability.startDate': { $lte: new Date() } },
            { 'availability.startDate': { $exists: false } }
        ],
        $or: [  // This OVERWRITES the first $or!
            { 'availability.endDate': { $gte: new Date() } },
            { 'availability.endDate': { $exists: false } }
        ]
    };
    console.log('Query:', JSON.stringify(brokenQuery, null, 2));
    const brokenResults = await Package.find(brokenQuery);
    console.log(`Results: ${brokenResults.length} packages\n`);

    // Test simple query
    console.log('Testing simple query:');
    const simpleQuery = {
        tenantId: 'default',
        'availability.status': 'active',
        isDeleted: false
    };
    const simpleResults = await Package.find(simpleQuery);
    console.log(`Results: ${simpleResults.length} packages\n`);

    await mongoose.connection.close();
    process.exit(0);
}).catch(e => { console.error(e); process.exit(1); });
