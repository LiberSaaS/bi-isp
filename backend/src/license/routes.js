import express from 'express';
import licenseManager from './index.js';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * GET /api/license/status
 * Returns current license status (public endpoint)
 */
router.get('/status', async (req, res) => {
  try {
    const licenseKey = process.env.LICENSE_KEY;
    const hostname = process.env.HOSTNAME || 'localhost';

    if (!licenseKey) {
      return res.json({
        configured: false,
        message: 'License is not configured'
      });
    }

    const status = await licenseManager.validateLicense(licenseKey, hostname);
    const cacheStatus = licenseManager.getCacheStatus();

    res.json({
      configured: true,
      license: status,
      cache: {
        isValid: cacheStatus.isValid,
        isWithinGracePeriod: cacheStatus.isWithinGracePeriod,
        ageMs: cacheStatus.age
      }
    });
  } catch (error) {
    logger.error('Error fetching license status', { error: error.message });
    res.status(500).json({
      error: 'Failed to fetch license status',
      message: error.message
    });
  }
});

/**
 * POST /api/license/revalidate
 * Force revalidation of license (requires JWT auth and active license)
 */
router.post('/revalidate', async (req, res) => {
  try {
    // Check if user is authenticated (assumes auth middleware sets req.user)
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required'
      });
    }

    // Check if user is admin
    if (!req.user.isAdmin) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only administrators can revalidate licenses'
      });
    }

    const licenseKey = process.env.LICENSE_KEY;
    const hostname = process.env.HOSTNAME || 'localhost';

    if (!licenseKey) {
      return res.status(400).json({
        error: 'License not configured',
        message: 'No license key found in configuration'
      });
    }

    // Clear cache to force fresh validation
    licenseManager.clearCache();

    // Validate license
    const status = await licenseManager.validateLicense(licenseKey, hostname);

    logger.info('License revalidation requested', {
      userId: req.user.id,
      hostname,
      newStatus: status.status
    });

    res.json({
      message: 'License revalidated successfully',
      license: status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error revalidating license', {
      error: error.message,
      userId: req.user?.id
    });
    res.status(500).json({
      error: 'Failed to revalidate license',
      message: error.message
    });
  }
});

export default router;
