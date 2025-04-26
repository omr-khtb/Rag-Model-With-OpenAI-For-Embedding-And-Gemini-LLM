import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import { Router } from 'express';
const router = Router();

// your existing code...
const app = express();
const port = process.env.PORT || 3000;

// Middleware to parse JSON
app.use(express.json());

// Importing the router module
import chatRouter from './controllers/chat.controller.js';  // Use import instead of require

// Use routers
app.use('/api/chat', chatRouter);

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
