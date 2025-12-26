const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.DATABASE_CUSTOMER_URI).then(async () => {
    const PackageSchema = new mongoose.Schema({}, { strict: false });
    const Package = mongoose.model('ConsultationPackage', PackageSchema, 'consultationpackages');

    console.log('=== Testing Fixed Query ===\n');

    // FIXED query - remove isDeleted: false and fix $or logic
    console.log('Testing FIXED query:');
    const fixedQuery = {
        tenantId: 'default',
        'availability.status': 'active',
        $and: [
            {
                $or: [
                    { 'availability.startDate': { $lte: new Date() } },
                    { 'availability.startDate': { $exists: false } }
                ]
            },
            {
                $or: [
                    { 'availability.endDate': { $gte: new Date() } },
                    { 'availability.endDate': { $exists: false } }
                ]
            },
            {
                $or: [
                    { isDeleted: false },
                    { isDeleted: { $exists: false } }
                ]
            }
        ]
    };

    console.log('Query:', JSON.stringify(fixedQuery, null, 2));
    const fixedResults = await Package.find(fixedQuery)
        .sort({ 'availability.featuredPackage': -1, 'availability.displayOrder': 1 });

    console.log(`\nResults: ${fixedResults.length} packages`);

    if (fixedResults.length > 0) {
        console.log('\nPackages found:');
        fixedResults.forEach(pkg => {
            console.log(`  - ${pkg.details.name} (${pkg.packageId})`);
            console.log(`    Price: $${(pkg.pricing.amount / 100).toFixed(2)}`);
            console.log(`    Credits: ${pkg.credits.total}`);
        });
    }

    await mongoose.connection.close();
    process.exit(0);
}).catch(e => { console.error(e); process.exit(1); });
