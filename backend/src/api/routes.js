import express from 'express';
import { Provider, Settings } from '../models/index.js';
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
 * GET /api/metrics/:providerId/comercial
 * Get commercial metrics for a provider (requires JWT)
 */
router.get('/metrics/:providerId/comercial', verifyToken, async (req, res) => {
  try {
    const { providerId } = req.params;
    const { period } = req.query;

    const provider = await Provider.findById(providerId);
    if (!provider) {
      return res.status(404).json({ error: 'Not found', message: 'Provider not found' });
    }

    if (req.user.role !== 'admin' && req.user.providerId !== providerId) {
      return res.status(403).json({ error: 'Forbidden', message: 'You do not have access to this provider' });
    }

    const periodDays = period ? parseInt(period) : 30;

    logger.info('Fetching commercial metrics for provider', {
      providerId, period: periodDays, userId: req.user.userId
    });

    const metrics = await analyticsEngine.getCommercialMetrics(providerId, periodDays);

    res.status(200).json({
      providerId,
      providerName: provider.name,
      metrics,
      lastSync: provider.lastSync
    });
  } catch (error) {
    logger.error('Error fetching commercial metrics', {
      providerId: req.params.providerId, error: error.message
    });
    res.status(500).json({ error: 'Server error', message: 'Could not fetch commercial metrics' });
  }
});

/**
 * GET /api/metrics/:providerId/overview
 */
router.get('/metrics/:providerId/overview', verifyToken, async (req, res) => {
  try {
    const { providerId } = req.params;
    const provider = await Provider.findById(providerId);
    if (!provider) return res.status(404).json({ error: 'Provider not found' });
    if (req.user.role !== 'admin' && req.user.providerId !== providerId) return res.status(403).json({ error: 'Forbidden' });
    const metrics = await analyticsEngine.getOverviewMetrics(providerId);
    res.json({ providerId, providerName: provider.name, metrics, lastSync: provider.lastSync });
  } catch (error) {
    logger.error('Error fetching overview metrics', { error: error.message });
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /api/metrics/:providerId/geographic
 */
router.get('/metrics/:providerId/geographic', verifyToken, async (req, res) => {
  try {
    const { providerId } = req.params;
    const provider = await Provider.findById(providerId);
    if (!provider) return res.status(404).json({ error: 'Provider not found' });
    if (req.user.role !== 'admin' && req.user.providerId !== providerId) return res.status(403).json({ error: 'Forbidden' });
    const metrics = await analyticsEngine.getGeographicMetrics(providerId);
    res.json({ providerId, providerName: provider.name, metrics, lastSync: provider.lastSync });
  } catch (error) {
    logger.error('Error fetching geographic metrics', { error: error.message });
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /api/metrics/:providerId/churn
 */
router.get('/metrics/:providerId/churn', verifyToken, async (req, res) => {
  try {
    const { providerId } = req.params;
    const { period } = req.query;
    const provider = await Provider.findById(providerId);
    if (!provider) return res.status(404).json({ error: 'Provider not found' });
    if (req.user.role !== 'admin' && req.user.providerId !== providerId) return res.status(403).json({ error: 'Forbidden' });
    const metrics = await analyticsEngine.getChurnMetrics(providerId, period ? parseInt(period) : 90);
    res.json({ providerId, providerName: provider.name, metrics, lastSync: provider.lastSync });
  } catch (error) {
    logger.error('Error fetching churn metrics', { error: error.message });
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /api/metrics/:providerId/plans
 */
router.get('/metrics/:providerId/plans', verifyToken, async (req, res) => {
  try {
    const { providerId } = req.params;
    const provider = await Provider.findById(providerId);
    if (!provider) return res.status(404).json({ error: 'Provider not found' });
    if (req.user.role !== 'admin' && req.user.providerId !== providerId) return res.status(403).json({ error: 'Forbidden' });
    const metrics = await analyticsEngine.getPlanMetrics(providerId);
    res.json({ providerId, providerName: provider.name, metrics, lastSync: provider.lastSync });
  } catch (error) {
    logger.error('Error fetching plan metrics', { error: error.message });
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /api/metrics/:providerId/service-orders
 * Get service order metrics for a provider
 */
router.get('/metrics/:providerId/service-orders', verifyToken, async (req, res) => {
  try {
    const { providerId } = req.params;
    const { period } = req.query;
    const provider = await Provider.findById(providerId);
    if (!provider) return res.status(404).json({ error: 'Provider not found' });
    if (req.user.role !== 'admin' && req.user.providerId !== providerId) return res.status(403).json({ error: 'Forbidden' });
    const metrics = await analyticsEngine.getServiceOrderMetrics(providerId, period ? parseInt(period) : 90);
    res.json({ providerId, providerName: provider.name, metrics, lastSync: provider.lastSync });
  } catch (error) {
    logger.error('Error fetching service order metrics', { error: error.message });
    res.status(500).json({ error: 'Server error' });
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
        await connector.syncAll(provider);

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

// ═══════════════════════════════════════════════════════════════════
// PROVIDER CRUD (admin only)
// ═══════════════════════════════════════════════════════════════════

/**
 * GET /api/providers/:id
 * Get a single provider WITH config (admin only, for editing)
 */
router.get('/providers/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const provider = await Provider.findById(req.params.id);
    if (!provider) return res.status(404).json({ error: 'Provider not found' });

    // Mask sensitive fields for display
    const config = { ...provider.config };
    if (config.password) config.password = '••••••••';
    if (config.clientSecret) config.clientSecret = config.clientSecret.substring(0, 6) + '••••••';
    if (config.token) config.token = config.token.substring(0, 6) + '••••••';

    res.json({
      provider: {
        ...provider.toObject(),
        config
      }
    });
  } catch (error) {
    logger.error('Error fetching provider', { error: error.message });
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /api/providers
 * Create a new provider (admin only)
 */
router.post('/providers', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { name, erp, config } = req.body;

    if (!name || !erp) {
      return res.status(400).json({ error: 'name and erp are required' });
    }

    // Generate slug from name
    const slug = name.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();

    // Check for duplicate slug
    const existing = await Provider.findOne({ slug });
    if (existing) {
      return res.status(409).json({ error: 'A provider with this name already exists' });
    }

    const provider = new Provider({
      name,
      slug,
      erp,
      config: config || {},
      active: true
    });

    await provider.save();

    logger.info('Provider created', { id: provider._id, name, erp, userId: req.user.userId });

    res.status(201).json({ provider: { ...provider.toObject(), config: undefined } });
  } catch (error) {
    logger.error('Error creating provider', { error: error.message });
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

/**
 * PUT /api/providers/:id
 * Update a provider (admin only)
 */
router.put('/providers/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const provider = await Provider.findById(req.params.id);
    if (!provider) return res.status(404).json({ error: 'Provider not found' });

    const { name, erp, config, active } = req.body;

    if (name) {
      provider.name = name;
      provider.slug = name.toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();
    }
    if (erp) provider.erp = erp;
    if (active !== undefined) provider.active = active;

    // Merge config: keep existing values if new value is masked or empty
    if (config) {
      const existingConfig = provider.config || {};
      const newConfig = { ...config };

      // Don't overwrite with masked values
      for (const [key, value] of Object.entries(newConfig)) {
        if (value && String(value).includes('••••')) {
          newConfig[key] = existingConfig[key];
        }
      }
      provider.config = { ...existingConfig, ...newConfig };
    }

    await provider.save();

    logger.info('Provider updated', { id: provider._id, name: provider.name, userId: req.user.userId });

    res.json({ provider: { ...provider.toObject(), config: undefined } });
  } catch (error) {
    logger.error('Error updating provider', { error: error.message });
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

/**
 * DELETE /api/providers/:id
 * Delete a provider and its data (admin only)
 */
router.delete('/providers/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const provider = await Provider.findById(req.params.id);
    if (!provider) return res.status(404).json({ error: 'Provider not found' });

    // Import models to clean up related data
    const { Customer, Invoice, ServiceOrder } = await import('../models/index.js');

    const deletedCounts = {
      customers: (await Customer.deleteMany({ providerId: provider._id })).deletedCount,
      invoices: (await Invoice.deleteMany({ providerId: provider._id })).deletedCount,
      serviceOrders: (await ServiceOrder.deleteMany({ providerId: provider._id })).deletedCount
    };

    await Provider.findByIdAndDelete(req.params.id);

    logger.info('Provider deleted', { id: req.params.id, name: provider.name, deletedCounts, userId: req.user.userId });

    res.json({ message: 'Provider deleted', deletedCounts });
  } catch (error) {
    logger.error('Error deleting provider', { error: error.message });
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /api/providers/:id/validate
 * Test provider connection (admin only)
 */
router.post('/providers/:id/validate', verifyToken, requireAdmin, async (req, res) => {
  try {
    const provider = await Provider.findById(req.params.id);
    if (!provider) return res.status(404).json({ error: 'Provider not found' });

    const connectorModule = await import(`../connectors/${provider.erp}/index.js`);
    const connector = connectorModule.default;

    if (!connector.validate) {
      return res.json({ ok: true, message: 'Connector does not implement validation' });
    }

    const result = await connector.validate(provider);
    res.json(result);
  } catch (error) {
    logger.error('Error validating provider', { error: error.message });
    res.json({ ok: false, message: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// SYNC SETTINGS (admin only)
// ═══════════════════════════════════════════════════════════════════

const SYNC_DEFAULTS = {
  incrementalMinutes: 5,
  fullSyncHour: 3,
  fullSyncMinute: 0
};

/**
 * GET /api/settings/sync
 * Get sync schedule configuration
 */
router.get('/settings/sync', verifyToken, requireAdmin, async (req, res) => {
  try {
    const syncSettings = await Settings.get('syncSchedule', SYNC_DEFAULTS);
    res.json({ settings: syncSettings });
  } catch (error) {
    logger.error('Error fetching sync settings', { error: error.message });
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * PUT /api/settings/sync
 * Update sync schedule and restart scheduler
 */
router.put('/settings/sync', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { incrementalMinutes, fullSyncHour, fullSyncMinute } = req.body;

    // Validate
    const incMin = parseInt(incrementalMinutes);
    const fHour = parseInt(fullSyncHour);
    const fMin = parseInt(fullSyncMinute);

    if (isNaN(incMin) || incMin < 1 || incMin > 1440) {
      return res.status(400).json({ error: 'incrementalMinutes deve ser entre 1 e 1440' });
    }
    if (isNaN(fHour) || fHour < 0 || fHour > 23) {
      return res.status(400).json({ error: 'fullSyncHour deve ser entre 0 e 23' });
    }
    if (isNaN(fMin) || fMin < 0 || fMin > 59) {
      return res.status(400).json({ error: 'fullSyncMinute deve ser entre 0 e 59' });
    }

    const newSettings = {
      incrementalMinutes: incMin,
      fullSyncHour: fHour,
      fullSyncMinute: fMin
    };

    await Settings.set('syncSchedule', newSettings);

    // Restart scheduler with new settings
    try {
      const { restartScheduler } = await import('../scheduler/index.js');
      await restartScheduler();
      logger.info('Scheduler restarted with new settings', newSettings);
    } catch (schedError) {
      logger.warn('Could not restart scheduler', { error: schedError.message });
    }

    res.json({ settings: newSettings, message: 'Configurações de sync atualizadas' });
  } catch (error) {
    logger.error('Error updating sync settings', { error: error.message });
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
