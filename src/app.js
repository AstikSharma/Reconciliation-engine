import express from 'express';
import { config } from './config/tolerances.js';
import { connectDB } from './config/db.js';

const app = express();

app.use(express.json());

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'UP', message: 'Reconciliation Engine is running' });
});

const startServer = async () => {
  await connectDB();
  
  app.listen(config.port, () => {
    console.log(`[Server] Listening on port ${config.port} in development mode`);
  });
};

startServer();