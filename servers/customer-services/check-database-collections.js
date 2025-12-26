const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.DATABASE_CUSTOMER_URI).then(async () => {
    console.log('=== Inspecting Database Collections ===\n');

    // Check Users collection
    const UserSchema = new mongoose.Schema({}, { strict: false });
    const User = mongoose.model('User', UserSchema, 'users');

    const users = await User.find({
        email: { $regex: /test.*@test\.com/ }
    }).sort({ createdAt: -1 }).limit(3);

    console.log(`\n1. USERS Collection (latest 3 test users):`);
    console.log(`   Total: ${users.length}`);
    users.forEach(user => {
        console.log(`\n   - Email: ${user.email}`);
        console.log(`     User ID: ${user._id}`);
        console.log(`     Roles: ${user.roles?.join(', ')}`);
        console.log(`     ClientId field: ${user.clientId}`);
        console.log(`     ConsultantId field: ${user.consultantId}`);
        console.log(`     TenantId: ${user.tenantId}`);
        console.log(`     Created: ${user.createdAt}`);
    });

    // Check Clients collection
    const ClientSchema = new mongoose.Schema({}, { strict: false });
    const Client = mongoose.model('Client', ClientSchema, 'clients');

    const clients = await Client.find({}).sort({ createdAt: -1 }).limit(5);

    console.log(`\n\n2. CLIENTS Collection:`);
    console.log(`   Total clients: ${await Client.countDocuments()}`);
    console.log(`   Latest 5:`);
    clients.forEach(client => {
        console.log(`\n   - Client ID: ${client._id}`);
        console.log(`     User ID: ${client.user}`);
        console.log(`     TenantId: ${client.tenantId}`);
        console.log(`     Profile: ${client.profile?.firstName} ${client.profile?.lastName}`);
        console.log(`     Created: ${client.createdAt}`);
    });

    // Check Consultants collection
    const ConsultantSchema = new mongoose.Schema({}, { strict: false });
    const Consultant = mongoose.model('Consultant', ConsultantSchema, 'consultants');

    const consultants = await Consultant.find({}).sort({ createdAt: -1 }).limit(5);

    console.log(`\n\n3. CONSULTANTS Collection:`);
    console.log(`   Total consultants: ${await Consultant.countDocuments()}`);
    console.log(`   Latest 5:`);
    consultants.forEach(consultant => {
        console.log(`\n   - Consultant ID: ${consultant._id}`);
        console.log(`     User ID: ${consultant.user}`);
        console.log(`     TenantId: ${consultant.tenantId}`);
        console.log(`     Profile: ${consultant.profile?.firstName} ${consultant.profile?.lastName}`);
        console.log(`     Created: ${consultant.createdAt}`);
    });

    // Cross-check: Find users with clientId but no matching client document
    console.log(`\n\n4. ORPHANED REFERENCES:`);
    const usersWithClientId = await User.find({
        clientId: { $exists: true },
        email: { $regex: /test.*@test\.com/ }
    }).limit(10);

    for (const user of usersWithClientId) {
        const clientExists = await Client.findById(user.clientId);
        if (!clientExists) {
            console.log(`   ⚠️  User ${user.email} has clientId ${user.clientId} but Client document doesn't exist!`);
        }
    }

    const usersWithConsultantId = await User.find({
        consultantId: { $exists: true },
        email: { $regex: /test.*@test\.com/ }
    }).limit(10);

    for (const user of usersWithConsultantId) {
        const consultantExists = await Consultant.findById(user.consultantId);
        if (!consultantExists) {
            console.log(`   ⚠️  User ${user.email} has consultantId ${user.consultantId} but Consultant document doesn't exist!`);
        }
    }

    await mongoose.connection.close();
    process.exit(0);
}).catch(e => { console.error(e); process.exit(1); });
