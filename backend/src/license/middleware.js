import licenseManager from './index.js';
import logger from '../utils/logger.js';

/**
 * Middleware to check license status and enforce access controls
 * - 'active': allow all methods
 * - 'expired' or 'unknown': allow GET only (read-only mode)
 * - 'blocked': deny all access
 */
export const checkLicense = async (req, res, next) => {
  try {
    const licenseKey = process.env.LICENSE_KEY;
    const hostname = process.env.HOSTNAME || 'localhost';

    if (!licenseKey) {
      logger.warn('LICENSE_KEY not configured, allowing request');
      return next();
    }

    // Validate license
    const licenseStatus = await licenseManager.validateLicense(licenseKey, hostname);

    // Attach license info to request
    req.license = licenseStatus;

    // Check license status
    if (licenseStatus.status === 'blocked') {
      logger.warn('Blocked license attempting to access API', {
        method: req.method,
        path: req.path
      });
      return res.status(403).json({
        error: 'License is blocked',
        message: 'Access to this API has been revoked. Please contact Libernet support.'
      });
    }

    // For unknown status (server unreachable), allow all operations (grace period)
    if (licenseStatus.status === 'unknown') {
      logger.info('License server unreachable, allowing request in grace mode', {
        method: req.method,
        path: req.path
      });
      return next();
    }

    // For expired licenses, allow only read operations
    if (licenseStatus.status === 'expired') {
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        logger.warn('Write operation attempted with expired license', {
          method: req.method,
          path: req.path,
          status: licenseStatus.status
        });
        return res.status(403).json({
          error: 'License expired',
          message: 'Write operations are disabled. Only read operations are allowed.',
          status: licenseStatus.status,
          gracePeriodActive: licenseStatus.gracePeriod === true
        });
      }
    }

    // Active license - allow all
    next();
  } catch (error) {
    logger.error('License check middleware error', {
      error: error.message
    });
    // On middleware error, fail safe - allow the request to continue
    // but log the issue
    next();
  }
};

/**
 * Middleware to check if license has capacity for operations
 * Useful for preventing exceeding maxCustomers limit
 */
export const checkCapacity = async (req, res, next) => {
  try {
    if (!req.license) {
      return next();
    }

    const { maxCustomers } = req.license;

    // If no customer limit is set, allow operation
    if (!maxCustomers || maxCustomers <= 0) {
      return next();
    }

    // Attach capacity info to request
    req.licenseCapacity = {
      max: maxCustomers,
      canAddCustomers: true
    };

    next();
  } catch (error) {
    logger.error('Capacity check middleware error', {
      error: error.message
    });
    next();
  }
};

/**
 * Middleware for admin-only endpoints (requires valid license and JWT)
 * Should be used after authentication middleware
 */
export const requireActiveLicense = (req, res, next) => {
  if (!req.license) {
    return res.status(503).json({
      error: 'License check failed',
      message: 'Unable to verify license status'
    });
  }

  if (req.license.status !== 'active') {
    return res.status(403).json({
      error: 'Operation not allowed',
      message: 'This operation requires an active license',
      licenseStatus: req.license.status
    });
  }

  next();
};
