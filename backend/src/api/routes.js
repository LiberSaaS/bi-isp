import express from 'express';
import { Provider } from '../models/index.js';
import analyticsEngine from '../analytics/engine.js';
import { verifyToken } from './auth.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Store sync status in memory (in production, use Redis)
const syncStatus = new Map();

/**
 * Middleware to check if user is admin
 */
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'This operation requires admin privileges'
    });
  }
  next();
};

/**
 * GET /api/health
 * Health check endpoint (public, no auth required)
 */
router.get('/health', (req, res) => {
  const uptime = process.uptime();
  const package_json = JSON.parse(
    typeof __dirname !== 'undefined'
      ? process.env.npm_package_version
      : '1.0.0'
  );

  res.status(200).json({
    status: 'ok',
    uptime: Math.floor(uptime),
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

/**
 * GET /api/metrics/:providerId
 * Get analytics metrics for a provider (requires JWT)
 */
router.get('/metrics/:providerId', verifyToken, async (req, res) => {
  try {
    const { providerId } = req.params;
    const { period } = req.query;

    // Verify provider exists and user has access
    const provider = await Provider.findById(providerId);
    if (!provider) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Provider not found'
      });
    }

    // For non-admin users, check if they have access to this provider
    if (req.user.role !== 'admin' && req.user.providerId !== providerId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have access to this provider'
      });
    }

    const periodDays = period ? parseInt(period) : 30;

    logger.info('Fetching metrics for provider', {
      providerId,
      period: periodDays,
      userId: req.user.userId
    });

    const metrics = await analyticsEngine.getMetrics(providerId, periodDays);

    res.status(200).json({
      providerId,
      providerName: provider.name,
      metrics
    });
  } catch (error) {
    logger.error('Error fetching metrics', {
      providerId: req.params.providerId,
      error: error.message,
      userId: req.user.userId
    });

    res.status(500).json({
      error: 'Server error',
      message: 'Could not fetch metrics'
    });
  }
});

/**
 * GET /api/providers
 * List all providers (requires JWT)
 */
router.get('/providers', verifyToken, async (req, res) => {
  try {
    let query = {};

    // Non-admin users can only see their assigned provider
    if (req.user.role !== 'admin') {
      if (req.user.providerId) {
        query._id = req.user.providerId;
      } else {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'You are not assigned to any provider'
        });
      }
    }

    const providers = await Provider.find(query)
      .select('-config') // Don't expose sensitive config
      .sort({ name: 1 });

    logger.info('Fetching providers', {
      userId: req.user.userId,
      role: req.user.role,
      count: providers.length
    });

    res.status(200).json({
      providers
    });
  } catch (error) {
    logger.error('Error fetching providers', {
      error: error.message,
      userId: req.user.userId
    });

    res.status(500).json({
      error: 'Server error',
      message: 'Could not fetch providers'
    });
  }
});

/**
 * POST /api/sync/:providerId
 * Trigger manual sync for a provider (requires JWT admin)
 */
router.post('/sync/:providerId', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { providerId } = req.params;

    // Verify provider exists
    const provider = await Provider.findById(providerId);
    if (!provider) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Provider not found'
      });
    }

    // Check if sync is already running
    const status = syncStatus.get(providerId);
    if (status === 'running') {
      return res.status(409).json({
        error: 'Conflict',
        message: 'A sync is already running for this provider'
      });
    }

    logger.info('Manual sync triggered for provider', {
      providerId,
      triggeredBy: req.user.userId
    });

    // Mark sync as running
    syncStatus.set(providerId, 'running');

    // Trigger sync asynchronously
    (async () => {
      try {
        // Import connector dynamically based on ERP type
        const connectorModule = await import(`../connectors/${provider.erp}/index.js`);
        const connector = connectorModule.default;

        // Update provider status
        provider.lastSyncStatus = 'running';
        await provider.save();

        // Execute sync
        await connector.sync(providerId);

        // Update provider on success
        provider.lastSync = new Date();
        provider.lastSyncStatus = 'success';
        provider.lastSyncError = null;
        await provider.save();

        syncStatus.set(providerId, 'success');

        logger.info('Manual sync completed successfully', {
          providerId,
          triggeredBy: req.user.userId
        });
      } catch (error) {
        logger.error('Manual sync failed', {
          providerId,
          error: error.message,
          triggeredBy: req.user.userId
        });

        // Update provider on error
        provider.lastSyncStatus = 'error';
        provider.lastSyncError = error.message;
        await provider.save();

        syncStatus.set(providerId, 'error');
      }
    })();

    res.status(202).json({
      message: 'Sync has been triggered',
      providerId,
      status: 'running'
    });
  } catch (error) {
    logger.error('Error triggering sync', {
      providerId: req.params.providerId,
      error: error.message,
      userId: req.user.userId
    });

    res.status(500).json({
      error: 'Server error',
      message: 'Could not trigger sync'
    });
  }
});

/**
 * GET /api/sync/:providerId/status
 * Get sync status for a provider (requires JWT)
 */
router.get('/sync/:providerId/status', verifyToken, async (req, res) => {
  try {
    const { providerId } = req.params;

    // Verify provider exists
    const provider = await Provider.findById(providerId);
    if (!provider) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Provider not found'
      });
    }

    // Check access permissions
    if (req.user.role !== 'admin' && req.user.providerId !== providerId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have access to this provider'
      });
    }

    const memoryStatus = syncStatus.get(providerId);
    const currentStatus = memoryStatus || provider.lastSyncStatus;

    logger.info('Fetching sync status', {
      providerId,
      userId: req.user.userId
    });

    res.status(200).json({
      providerId,
      syncStatus: currentStatus,
      lastSync: provider.lastSync,
      lastSyncError: provider.lastSyncError,
      syncAgeMinutes: provider.syncAgeMinutes
    });
  } catch (error) {
    logger.error('Error fetching sync status', {
      providerId: req.params.providerId,
      error: error.message,
      userId: req.user.userId
    });

    res.status(500).json({
      error: 'Server error',
      message: 'Could not fetch sync status'
    });
  }
});

/**
 * GET /api/health/providers
 * Get health metrics for all providers (admin only)
 */
router.get('/health/providers', verifyToken, requireAdmin, async (req, res) => {
  try {
    const providers = await Provider.find({ active: true });

    const healthMetrics = await Promise.all(
      providers.map(provider =>
        analyticsEngine
          .getHealthMetrics(provider._id)
          .catch(error => ({
            providerId: provider._id,
            error: error.message
          }))
      )
    );

    logger.info('Fetching health metrics for all providers', {
      userId: req.user.userId,
      count: providers.length
    });

    res.status(200).json({
      healthMetrics
    });
  } catch (error) {
    logger.error('Error fetching provider health metrics', {
      error: error.message,
      userId: req.user.userId
    });

    res.status(500).json({
      error: 'Server error',
      message: 'Could not fetch health metrics'
    });
  }
});

/**
 * GET /api/health/:providerId
 * Get health metrics for a specific provider
 */
router.get('/health/:providerId', verifyToken, async (req, res) => {
  try {
    const { providerId } = req.params;

    // Check access permissions
    if (req.user.role !== 'admin' && req.user.providerId !== providerId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have access to this provider'
      });
    }

    const healthMetrics = await analyticsEngine.getHealthMetrics(providerId);

    res.status(200).json(healthMetrics);
  } catch (error) {
    logger.error('Error fetching provider health metrics', {
      providerId: req.params.providerId,
      error: error.message,
      userId: req.user.userId
    });

    res.status(500).json({
      error: 'Server error',
      message: 'Could not fetch health metrics'
    });
  }
});

export default router;
