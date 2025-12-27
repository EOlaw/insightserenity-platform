const mongoose = require('mongoose');

const MONGO_URI = 'mongodb+srv://EOlaw146:Olawalee_.146@cluster0.4wv68hn.mongodb.net/insightserenity_customer_dev?retryWrites=true&w=majority&appName=Cluster0';

async function addConsultantRole() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));

    // Find the user
    const user = await User.findById('6936773eb17862034a0d7e74');

    if (!user) {
      console.error('User not found');
      process.exit(1);
    }

    console.log('Current user data:');
    console.log('- Email:', user.email);
    console.log('- UserType:', user.userType);
    console.log('- Current roles:', user.roles);
    console.log('- ConsultantId:', user.consultantId);

    // Add consultant role if not present
    if (!user.roles.includes('consultant')) {
      user.roles.push('consultant');
      await user.save();
      console.log('\n✅ Consultant role added successfully!');
      console.log('Updated roles:', user.roles);
    } else {
      console.log('\n✓ User already has consultant role');
    }

    await mongoose.connection.close();
    console.log('\nDone! Please log out and log back in to get a new JWT token with the updated roles.');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

addConsultantRole();
