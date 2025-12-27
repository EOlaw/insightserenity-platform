const mongoose = require('mongoose');

const MONGO_URI = 'mongodb+srv://EOlaw146:Olawalee_.146@cluster0.4wv68hn.mongodb.net/insightserenity_customer_dev?retryWrites=true&w=majority&appName=Cluster0';

async function getVerificationToken(email) {
  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(MONGO_URI);
    }

    // Check if model already exists
    let User;
    if (mongoose.models.User) {
      User = mongoose.models.User;
    } else {
      User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
    }

    const user = await User.findOne({ email });

    if (!user) {
      throw new Error('User not found in database');
    }

    console.log('User found:', user.email);
    console.log('User _id:', user._id);

    // Convert to plain object
    const userObj = user.toObject();

    console.log('\nVerification object:');
    console.log(JSON.stringify(userObj.verification, null, 2));

    console.log('\nToken extraction attempts:');
    console.log('1. userObj.verification?.email?.token:', userObj.verification?.email?.token);
    console.log('2. user.verification?.email?.token:', user.verification?.email?.token);
    console.log('3. user.get("verification.email.token"):', user.get('verification.email.token'));

    const token = user.verification?.email?.token || user.emailVerification?.verificationToken;

    return { token, userId: user._id.toString() };
  } catch (error) {
    throw error;
  }
}

async function test() {
  try {
    // Test with the most recent test.client user
    const result = await getVerificationToken('test.client.1766818466819@example.com');
    console.log('\n✅ Result:');
    console.log('Token:', result.token);
    console.log('User ID:', result.userId);

    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

test();
