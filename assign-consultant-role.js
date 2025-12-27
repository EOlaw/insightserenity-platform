/**
 * Script to assign consultant role to a user
 * Run with: node assign-consultant-role.js <userId>
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGODB_URI ||
  'mongodb+srv://EOlaw146:your-password@cluster0.4wv68hn.mongodb.net/insightserenity_customer_dev?retryWrites=true&w=majority&appName=Cluster0';

async function assignConsultantRole(userId) {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));

    // Update user to add consultant role
    const user = await User.findById(userId);

    if (!user) {
      console.error('User not found');
      process.exit(1);
    }

    console.log('Current user roles:', user.roles);

    // Add consultant role if not present
    if (!user.roles.includes('consultant')) {
      user.roles.push('consultant');
      await user.save();
      console.log('✅ Consultant role added successfully!');
      console.log('Updated roles:', user.roles);
    } else {
      console.log('User already has consultant role');
    }

    await mongoose.connection.close();
    console.log('Done!');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

const userId = process.argv[2];

if (!userId) {
  console.error('Usage: node assign-consultant-role.js <userId>');
  console.error('Example: node assign-consultant-role.js 6936773eb17862034a0d7e74');
  process.exit(1);
}

assignConsultantRole(userId);
