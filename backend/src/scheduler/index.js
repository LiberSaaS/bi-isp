import cron from 'node-cron';
import { Provider } from '../models/index.js';
import logger from '../utils/logger.js';

/**
 * Cron Scheduler for ISP BI
 * Manages automatic syncing of provider data
 */

let tasks = [];

/**
 * Get the appropriate connector for an ERP type
 * @param {string} erp - ERP type (ixc, hubsoft, sgp, mkauth)
 * @returns {Promise<Object>} Connector module
 */
async function getConnector(erp) {
  try {
    const connectorModule = await import(`../connectors/${erp}/index.js`);
    return connectorModule.default;
  } catch (error) {
    logger.error('Failed to load connector', {
      erp,
      error: error.message
    });
    throw error;
  }
}

/**
 * Sync a single provider
 * @param {string} providerId - MongoDB ObjectId of the provider
 * @param {boolean} isFullSync - Whether to do a full or incremental sync
 */
async function syncProvider(providerId, isFullSync = false) {
  try {
    const provider = await Provider.findById(providerId);
    if (!provider) {
      logger.warn('Provider not found for sync', { providerId });
      return;
    }

    if (!provider.active) {
      logger.debug('Skipping sync for inactive provider', {
        providerId,
        name: provider.name
      });
      return;
    }

    logger.info('Starting sync for provider', {
      providerId,
      name: provider.name,
      erp: provider.erp,
      isFullSync
    });

    // Mark as running
    provider.lastSyncStatus = 'running';
    await provider.save();

    // Get the appropriate connector
    const connector = await getConnector(provider.erp);

    // Execute sync
    const startTime = Date.now();
    await connector.sync(providerId);
    const duration = Date.now() - startTime;

    // Update provider on success
    provider.lastSync = new Date();
    provider.lastSyncStatus = 'success';
    provider.lastSyncError = null;
    await provider.save();

    logger.info('Sync completed successfully', {
      providerId,
      name: provider.name,
      durationMs: duration,
      isFullSync
    });
  } catch (error) {
    logger.error('Sync failed for provider', {
      providerId,
      error: error.message,
      stack: error.stack
    });

    // Update provider with error
    try {
      const provider = await Provider.findById(providerId);
      if (provider) {
        provider.lastSyncStatus = 'error';
        provider.lastSyncError = error.message;
        await provider.save();
      }
    } catch (updateError) {
      logger.error('Failed to update provider sync status', {
        providerId,
        error: updateError.message
      });
    }
  }
}

/**
 * Sync all active providers
 * @param {boolean} isFullSync - Whether to do a full or incremental sync
 */
async function syncAllProviders(isFullSync = false) {
  try {
    logger.info('Starting sync for all active providers', { isFullSync });

    const providers = await Provider.find({ active: true });
    logger.info(`Found ${providers.length} active providers to sync`);

    // Sync all providers in parallel
    await Promise.all(
      providers.map(provider => syncProvider(provider._id, isFullSync))
    );

    logger.info('Completed sync for all active providers', { isFullSync });
  } catch (error) {
    logger.error('Error during all providers sync', {
      error: error.message,
      stack: error.stack
    });
  }
}

/**
 * Incremental sync task (every 5 minutes)
 */
function createIncrementalSyncTask() {
  // Every 5 minutes: */5 * * * *
  return cron.schedule('*/5 * * * *', async () => {
    try {
      logger.debug('Incremental sync scheduled task triggered');
      await syncAllProviders(false);
    } catch (error) {
      logger.error('Incremental sync task error', {
        error: error.message
      });
    }
  });
}

/**
 * Full sync task (daily at 03:00)
 */
function createFullSyncTask() {
  // Daily at 03:00: 0 3 * * *
  return cron.schedule('0 3 * * *', async () => {
    try {
      logger.info('Full sync scheduled task triggered');
      await syncAllProviders(true);
    } catch (error) {
      logger.error('Full sync task error', {
        error: error.message
      });
    }
  });
}

/**
 * Start the scheduler
 */
export function startScheduler() {
  try {
    logger.info('Starting scheduler...');

    // Create and start tasks
    const incrementalTask = createIncrementalSyncTask();
    const fullSyncTask = createFullSyncTask();

    tasks.push(incrementalTask);
    tasks.push(fullSyncTask);

    logger.info('Scheduler started successfully', {
      tasksCount: tasks.length,
      tasks: [
        'Incremental sync (every 5 minutes)',
        'Full sync (daily at 03:00)'
      ]
    });
  } catch (error) {
    logger.error('Failed to start scheduler', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Stop the scheduler
 */
export function stopScheduler() {
  try {
    logger.info('Stopping scheduler...');

    tasks.forEach((task, index) => {
      task.stop();
      logger.debug(`Stopped task ${index + 1}`);
    });

    tasks = [];
    logger.info('Scheduler stopped successfully');
  } catch (error) {
    logger.error('Error stopping scheduler', {
      error: error.message
    });
    throw error;
  }
}

/**
 * Manually trigger a sync for a specific provider
 * Used by API endpoints for on-demand syncs
 */
export async function triggerSync(providerId, isFullSync = false) {
  logger.info('Manual sync triggered', {
    providerId,
    isFullSync
  });

  return syncProvider(providerId, isFullSync);
}

/**
 * Manually trigger a sync for all providers
 */
export async function triggerSyncAll(isFullSync = false) {
  logger.info('Manual sync triggered for all providers', { isFullSync });
  return syncAllProviders(isFullSync);
}

export default {
  startScheduler,
  stopScheduler,
  triggerSync,
  triggerSyncAll
};
