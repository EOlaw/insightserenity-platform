const mongoose = require('mongoose');

const MONGO_URI = 'mongodb+srv://EOlaw146:Olawalee_.146@cluster0.4wv68hn.mongodb.net/insightserenity_customer_dev?retryWrites=true&w=majority&appName=Cluster0';

async function verifyPackages() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get database name
    const dbName = mongoose.connection.db.databaseName;
    console.log(`📊 Database: ${dbName}`);

    // List all collections
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log(`\n📁 Collections in database:`);
    collections.forEach(col => {
      console.log(`   - ${col.name}`);
    });

    // Check consultationpackages collection directly using the db object
    const db = mongoose.connection.db;
    const packagesCollection = db.collection('consultationpackages');

    const rawCount = await packagesCollection.countDocuments({});
    console.log(`\n🔍 Raw count from collection: ${rawCount}`);

    const packages = await packagesCollection.find({}).toArray();

    console.log(`📦 Packages found in 'consultationpackages' collection: ${packages.length}\n`);

    if (packages.length > 0) {
      packages.forEach(pkg => {
        console.log(`   ✓ ${pkg.details.name}`);
        console.log(`     - Package ID: ${pkg.packageId}`);
        console.log(`     - Price: $${pkg.pricing.amount}`);
        console.log(`     - Tenant: ${pkg.tenantId}`);
        console.log('');
      });
    } else {
      console.log('   ❌ No packages found!\n');
    }

    await mongoose.connection.close();
    console.log('🔌 Connection closed.');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

verifyPackages();
