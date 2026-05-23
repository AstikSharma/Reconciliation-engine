import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: process.env.PORT || 3000,
  mongoUri: process.env.MONGODB_URI,
  matching: {
    timestampToleranceSeconds: parseInt(process.env.TIMESTAMP_TOLERANCE_SECONDS, 10) || 300,
    quantityTolerancePct: parseFloat(process.env.QUANTITY_TOLERANCE_PCT) || 0.01
  }
};