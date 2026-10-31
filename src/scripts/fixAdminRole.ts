import mongoose from 'mongoose';
import { config } from '../config/env.js';

async function fixAdminRole(): Promise<void> {
  try {
    await mongoose.connect(config.mongoUri);
    console.log('Connected to MongoDB');

    const User = mongoose.model('User', new mongoose.Schema({}));
    const result = await User.updateOne({
      email: 'owner@example.com'
    }, {
      $set: { role: 'admin' }
    });

    console.log('Updated documents:', result.modifiedCount);
  } catch (err: any) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected');
  }
}

fixAdminRole();
