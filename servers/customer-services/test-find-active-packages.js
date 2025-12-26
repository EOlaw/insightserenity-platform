const mongoose = require('mongoose');
require('dotenv').config();

// Import the model directly
const { consultationPackageSchema } = require('../../shared/lib/database/models/customer-services/core-business/consultation-management/consultation-package-model');

mongoose.connect(process.env.DATABASE_CUSTOMER_URI).then(async () => {
    console.log('Connected to database\n');

    const ConsultationPackage = mongoose.model('ConsultationPackage', consultationPackageSchema);

    console.log('Testing findActivePackages static method...\n');

    try {
        const packages = await ConsultationPackage.findActivePackages('default', {});

        console.log(`✓ Query executed successfully`);
        console.log(`✓ Found ${packages.length} packages\n`);

        if (packages.length > 0) {
            console.log('Package details:');
            packages.forEach(pkg => {
                console.log(`  - ${pkg.details.name}`);
                console.log(`    Package ID: ${pkg.packageId}`);
                console.log(`    Price: $${(pkg.pricing.amount / 100).toFixed(2)}`);
                console.log(`    Credits: ${pkg.credits.total}`);
                console.log(`    Status: ${pkg.availability.status}`);
                console.log(`    isDeleted: ${pkg.isDeleted}`);
                console.log();
            });
        } else {
            console.log('No packages found - debugging...\n');

            // Check what's in the database
            const all = await ConsultationPackage.find({ tenantId: 'default' });
            console.log(`Total packages with tenantId="default": ${all.length}`);

            if (all.length > 0) {
                const sample = all[0];
                console.log('\nSample package:');
                console.log(`  - tenantId: ${sample.tenantId}`);
                console.log(`  - availability.status: ${sample.availability?.status}`);
                console.log(`  - isDeleted: ${sample.isDeleted}`);
            }
        }
    } catch (error) {
        console.error('Error:', error.message);
        console.error(error.stack);
    }

    await mongoose.connection.close();
    process.exit(0);
}).catch(e => {
    console.error('Connection error:', e);
    process.exit(1);
});
