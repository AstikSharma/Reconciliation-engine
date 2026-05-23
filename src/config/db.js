import mongoose from 'mongoose';
import { config } from './tolerances.js';

export const connectDB = async () => {
  try {
    const conn = await mongoose.connect(config.mongoUri);
    console.log(`[Database] MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`[Database] Error: ${error.message}`);
    process.exit(1);
  }
};