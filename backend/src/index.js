import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

import logger from './utils/logger.js';
import { router as authRouter } from './api/auth.js';
import apiRoutes from './api/routes.js';
import licenseRoutes from './license/routes.js';
import { checkLicense } from './license/middleware.js';
import { startScheduler, stopScheduler } from './scheduler/index.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const API_PORT = process.env.API_PORT || 3001;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/isp-bi';

/**
 * Middleware Setup
 */

// Security middleware — disable upgradeInsecureRequests so assets load over HTTP
// when no TLS is configured, and allow inline scripts for Vite-built frontend
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "data:"],
      upgradeInsecureRequests: null
    }
  }
}));

// CORS configuration
const corsOptions = {
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));

// Request logging
app.use(morgan('combined', {
  stream: {
    write: (message) => logger.info(message.trim())
  }
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

/**
 * Database Connection
 */
async function connectDatabase() {
  try {
    logger.info('Connecting to MongoDB', { uri: MONGO_URI.replace(/:[^:]*@/, ':****@') });

    await mongoose.connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      connectTimeoutMS: 10000,
      socketTimeoutMS: 45000
    });

    logger.info('MongoDB connected successfully');
    return true;
  } catch (error) {
    logger.error('MongoDB connection failed', {
      error: error.message,
      uri: MONGO_URI.replace(/:[^:]*@/, ':****@')
    });
    return false;
  }
}

/**
 * Routes Setup
 */

// Health check (public)
app.get('/api/health', (req, res) => {
  const uptime = process.uptime();
  res.status(200).json({
    status: 'ok',
    uptime: Math.floor(uptime),
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

// Authentication routes (public)
app.use('/api/auth', authRouter);

// License routes (public, can be checked internally)
app.use('/api/license', licenseRoutes);

// License middleware for other routes
app.use(checkLicense);

// API routes (protected by license and JWT)
app.use('/api', apiRoutes);

// Static file serving for frontend
const frontendPath = path.join(__dirname, '../frontend-dist');
if (fs.existsSync(frontendPath)) {
  app.use(express.static(frontendPath));

  // SPA fallback: serve index.html for non-API routes
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(frontendPath, 'index.html'));
    } else {
      res.status(404).json({
        error: 'Not Found',
        message: 'API endpoint does not exist'
      });
    }
  });
}

// 404 handler for API routes
app.use('/api', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: 'API endpoint does not exist'
  });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });

  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation error',
      message: err.message
    });
  }

  if (err.name === 'MongoError' && err.code === 11000) {
    return res.status(409).json({
      error: 'Duplicate entry',
      message: 'A record with this value already exists'
    });
  }

  res.status(err.status || 500).json({
    error: err.name || 'Server Error',
    message: err.message || 'An unexpected error occurred'
  });
});

/**
 * Server Startup
 */
async function start() {
  try {
    // Connect to database
    const dbConnected = await connectDatabase();
    if (!dbConnected) {
      logger.error('Failed to connect to database. Exiting.');
      process.exit(1);
    }

    // Start the server
    const server = app.listen(API_PORT, () => {
      logger.info(`ISP Analytics BI Backend started`, {
        port: API_PORT,
        nodeEnv: process.env.NODE_ENV || 'development',
        mongoUri: MONGO_URI.replace(/:[^:]*@/, ':****@')
      });
    });

    // Start the scheduler
    try {
      startScheduler();
      logger.info('Scheduler started successfully');
    } catch (error) {
      logger.error('Failed to start scheduler', { error: error.message });
    }

    /**
     * Graceful Shutdown
     */
    const shutdown = async (signal) => {
      logger.info(`Received ${signal}, starting graceful shutdown...`);

      // Stop the scheduler
      try {
        stopScheduler();
        logger.info('Scheduler stopped');
      } catch (error) {
        logger.error('Error stopping scheduler', { error: error.message });
      }

      // Close the server
      server.close(async () => {
        logger.info('Server closed');

        // Disconnect from database
        try {
          await mongoose.connection.close();
          logger.info('Database connection closed');
        } catch (error) {
          logger.error('Error closing database connection', {
            error: error.message
          });
        }

        process.exit(0);
      });

      // Force exit after 30 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after 30 seconds');
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    logger.error('Fatal error during startup', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
}

// Start the application
start();

export default app;
