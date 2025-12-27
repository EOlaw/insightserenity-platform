const mongoose = require('mongoose');

const MONGO_URI = 'mongodb+srv://EOlaw146:Olawalee_.146@cluster0.4wv68hn.mongodb.net/insightserenity_customer_dev?retryWrites=true&w=majority&appName=Cluster0';

async function checkUserStructure() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB\n');

    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));

    // Find the most recent user (test user)
    const user = await User.findOne({ email: /test\.client/ }).sort({ createdAt: -1 });

    if (!user) {
      console.error('No test user found');
      process.exit(1);
    }

    console.log('User Email:', user.email);
    console.log('\nFull User Object (raw):');
    console.log(JSON.stringify(user.toObject(), null, 2));

    await mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkUserStructure();
