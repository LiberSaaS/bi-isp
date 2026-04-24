import cron from 'node-cron';
import { Provider, Settings } from '../models/index.js';
import logger from '../utils/logger.js';

/**
 * Cron Scheduler for ISP BI
 * Manages automatic syncing of provider data
 * Now reads schedule configuration from the database (Settings collection)
 */

let tasks = [];

const SYNC_DEFAULTS = {
  incrementalMinutes: 5,
  fullSyncHour: 3,
  fullSyncMinute: 0
};

/**
 * Get sync settings from database, with fallback to defaults
 */
async function getSyncSettings() {
  try {
    const settings = await Settings.get('syncSchedule', SYNC_DEFAULTS);
    return { ...SYNC_DEFAULTS, ...settings };
  } catch (error) {
    logger.warn('Could not read sync settings from DB, using defaults', { error: error.message });
    return SYNC_DEFAULTS;
  }
}

/**
 * Get the appropriate connector for an ERP type
 */
async function getConnector(erp) {
  try {
    const connectorModule = await import(`../connectors/${erp}/index.js`);
    return connectorModule.default;
  } catch (error) {
    logger.error('Failed to load connector', { erp, error: error.message });
    throw error;
  }
}

/**
 * Sync a single provider
 */
async function syncProvider(providerId, isFullSync = false) {
  try {
    const provider = await Provider.findById(providerId);
    if (!provider) {
      logger.warn('Provider not found for sync', { providerId });
      return;
    }

    if (!provider.active) {
      logger.debug('Skipping sync for inactive provider', { providerId, name: provider.name });
      return;
    }

    logger.info('Starting sync for provider', {
      providerId, name: provider.name, erp: provider.erp, isFullSync
    });

    provider.lastSyncStatus = 'running';
    await provider.save();

    const connector = await getConnector(provider.erp);
    const startTime = Date.now();
    await connector.syncAll(provider);
    const duration = Date.now() - startTime;

    provider.lastSync = new Date();
    provider.lastSyncStatus = 'success';
    provider.lastSyncError = null;
    await provider.save();

    logger.info('Sync completed successfully', {
      providerId, name: provider.name, durationMs: duration, isFullSync
    });
  } catch (error) {
    logger.error('Sync failed for provider', {
      providerId, error: error.message, stack: error.stack
    });

    try {
      const provider = await Provider.findById(providerId);
      if (provider) {
        provider.lastSyncStatus = 'error';
        provider.lastSyncError = error.message;
        await provider.save();
      }
    } catch (updateError) {
      logger.error('Failed to update provider sync status', {
        providerId, error: updateError.message
      });
    }
  }
}

/**
 * Sync all active providers
 */
async function syncAllProviders(isFullSync = false) {
  try {
    logger.info('Starting sync for all active providers', { isFullSync });

    const providers = await Provider.find({ active: true });
    logger.info(`Found ${providers.length} active providers to sync`);

    await Promise.all(
      providers.map(provider => syncProvider(provider._id, isFullSync))
    );

    logger.info('Completed sync for all active providers', { isFullSync });
  } catch (error) {
    logger.error('Error during all providers sync', {
      error: error.message, stack: error.stack
    });
  }
}

/**
 * Start the scheduler with settings from the database
 */
export async function startScheduler() {
  try {
    logger.info('Starting scheduler...');

    const settings = await getSyncSettings();

    // Build cron expressions from settings
    const incrementalCron = `*/${settings.incrementalMinutes} * * * *`;
    const fullSyncCron = `${settings.fullSyncMinute} ${settings.fullSyncHour} * * *`;

    // Incremental sync
    const incrementalTask = cron.schedule(incrementalCron, async () => {
      try {
        logger.debug('Incremental sync scheduled task triggered');
        await syncAllProviders(false);
      } catch (error) {
        logger.error('Incremental sync task error', { error: error.message });
      }
    });

    // Full sync
    const fullSyncTask = cron.schedule(fullSyncCron, async () => {
      try {
        logger.info('Full sync scheduled task triggered');
        await syncAllProviders(true);
      } catch (error) {
        logger.error('Full sync task error', { error: error.message });
      }
    });

    tasks.push(incrementalTask);
    tasks.push(fullSyncTask);

    logger.info('Scheduler started successfully', {
      tasksCount: tasks.length,
      incrementalCron,
      fullSyncCron,
      settings
    });
  } catch (error) {
    logger.error('Failed to start scheduler', { error: error.message, stack: error.stack });
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
    logger.error('Error stopping scheduler', { error: error.message });
    throw error;
  }
}

/**
 * Restart scheduler with updated settings from DB
 */
export async function restartScheduler() {
  logger.info('Restarting scheduler with new settings...');
  stopScheduler();
  await startScheduler();
}

/**
 * Manually trigger a sync for a specific provider
 */
export async function triggerSync(providerId, isFullSync = false) {
  logger.info('Manual sync triggered', { providerId, isFullSync });
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
  restartScheduler,
  triggerSync,
  triggerSyncAll
};
