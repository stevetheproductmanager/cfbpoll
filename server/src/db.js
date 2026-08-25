import mongoose from 'mongoose';

let connected = false;

export async function connectDB() {
  if (connected) return;
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.warn('WARNING: MONGODB_URI not set — running without database');
    return;
  }
  try {
    await mongoose.connect(uri);
    connected = true;
    console.log('MongoDB connected:', mongoose.connection.name);
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    throw err;
  }
}

export { mongoose };
