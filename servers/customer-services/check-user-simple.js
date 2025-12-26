#!/usr/bin/env node

/**
 * Simple diagnostic to check user data
 * Run from: servers/customer-services directory
 * Usage: node /tmp/check-user-simple.js <email>
 */

const mongoose = require('mongoose');
const path = require('path');

// Change to the servers/customer-services directory
process.chdir('/Users/eolaw/Desktop/insightserenity-platform/servers/customer-services');

const email = process.argv[2];

if (!email) {
    console.error('Usage: node /tmp/check-user-simple.js <email>');
    process.exit(1);
}

const mongoUri = process.env.MONGODB_URI_CUSTOMER || 'mongodb://localhost:27017/customer-services';

async function checkUser() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(mongoUri);
        console.log(`\nChecking user: ${email}\n`);

        // Simple schema-less query
        const User = mongoose.connection.collection('users');
        const Client = mongoose.connection.collection('clients');

        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user) {
            console.error(`❌ User not found: ${email}`);
            process.exit(1);
        }

        console.log('✅ User found!\n');
        console.log('='.repeat(60));
        console.log(`User ID:          ${user._id}`);
        console.log(`Email:            ${user.email}`);
        console.log(`User Type:        ${user.metadata?.userType || 'Not set'}`);
        console.log(`Roles:            ${user.roles?.join(', ') || 'None'}`);
        console.log(`Client ID:        ${user.clientId || 'NOT SET ❌'}`);
        console.log(`Account Status:   ${user.accountStatus?.status || 'Unknown'}`);
        console.log(`Email Verified:   ${user.verification?.email?.verified ? 'Yes' : 'No'}`);
        console.log('='.repeat(60));

        // Check for client role without clientId
        if (user.roles?.includes('client') && !user.clientId) {
            console.log('\n⚠️  WARNING: User has "client" role but NO clientId!');
            console.log('This will cause 403 and 500 errors when booking consultations.\n');

            // Try to find Client record
            const client = await Client.findOne({
                $or: [
                    { email: user.email },
                    { user: user._id }
                ]
            });

            if (client) {
                console.log('✅ Found orphaned Client record!');
                console.log('='.repeat(60));
                console.log(`Client ID:        ${client._id}`);
                console.log(`Client Code:      ${client.clientCode || 'Not set'}`);
                console.log('='.repeat(60));
                console.log('\n💡 FIX: Run the following MongoDB command:');
                console.log(`\ndb.users.updateOne({_id: ObjectId("${user._id}")}, {$set: {clientId: ObjectId("${client._id}")}})\n`);

                // Offer to fix it automatically
                console.log('Or run this Node.js command to fix automatically:');
                console.log(`node -e "const m=require('mongoose');m.connect('${mongoUri}').then(async()=>{await m.connection.collection('users').updateOne({_id:new m.Types.ObjectId('${user._id}')},{\\$set:{clientId:new m.Types.ObjectId('${client._id}')}});console.log('✅ Fixed!');process.exit(0)})"`);
            } else {
                console.log('❌ No Client record found for this user.');
                console.log('\n💡 This needs to be fixed by creating a Client record.\n');
            }
        } else if (user.clientId) {
            const client = await Client.findOne({ _id: user.clientId });

            if (client) {
                console.log('\n✅ Client record verified!');
                console.log('='.repeat(60));
                console.log(`Client Code:      ${client.clientCode || 'Not set'}`);
                console.log(`Available Credits: ${client.consultationCredits?.availableCredits || 0}`);
                console.log('='.repeat(60));
            } else {
                console.log('\n❌ WARNING: User has clientId but Client record does NOT exist!');
                console.log(`Client ID in User record: ${user.clientId}`);
            }
        }

        // Check roles
        console.log('\nUser Roles & Permissions:');
        console.log('='.repeat(60));
        console.log(`Roles: ${user.roles?.join(', ') || 'None'}`);
        console.log(`Permissions: ${user.permissions?.length || 0} permissions`);
        console.log('='.repeat(60));

    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    } finally {
        await mongoose.connection.close();
        process.exit(0);
    }
}

checkUser();
