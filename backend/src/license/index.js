import axios from 'axios';
import logger from '../utils/logger.js';

class LicenseManager {
  constructor() {
    this.cache = {
      data: null,
      timestamp: null,
      cacheDuration: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
      gracePeriod: 72 * 60 * 60 * 1000   // 72 hours in milliseconds
    };
    this.validationUrl = 'https://ispacs.libernet.com.br/api/license/validate';
  }

  /**
   * Validates a license key against the ISP ACS server
   * @param {string} licenseKey - The license key to validate
   * @param {string} hostname - The hostname/instance identifier
   * @returns {Promise<{status, expiresAt, plan, maxCustomers}>}
   */
  async validateLicense(licenseKey, hostname) {
    try {
      const cacheKey = `${licenseKey}_${hostname}`;
      
      // Check if cached result is still valid
      if (this.isCacheValid()) {
        logger.debug('Returning cached license validation result', { cacheKey });
        return this._formatResponse(this.cache.data);
      }

      logger.info('Validating license with remote server', { licenseKey: licenseKey.substring(0, 8) + '***', hostname });

      const response = await axios.post(
        this.validationUrl,
        {
          licenseKey,
          hostname,
          timestamp: new Date().toISOString()
        },
        {
          timeout: 10000,
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'ISP-BI-Backend/1.0.0'
          }
        }
      );

      // Cache the successful response
      this.cache.data = response.data;
      this.cache.timestamp = Date.now();

      logger.info('License validation successful', {
        status: response.data.status,
        expiresAt: response.data.expiresAt
      });

      return this._formatResponse(response.data);
    } catch (error) {
      logger.error('License validation error', {
        error: error.message,
        code: error.code
      });

      // Return cached data if available and within grace period
      if (this.cache.data && this.isWithinGracePeriod()) {
        logger.warn('Returning cached license data within grace period');
        return {
          ...this._formatResponse(this.cache.data),
          gracePeriod: true
        };
      }

      // Return unknown status when server unreachable and no cache
      return {
        status: 'unknown',
        expiresAt: null,
        plan: null,
        maxCustomers: null,
        error: 'Server unreachable and no cached license'
      };
    }
  }

  /**
   * Checks if the cached license validation is still valid
   * @returns {boolean}
   */
  isCacheValid() {
    if (!this.cache.data || !this.cache.timestamp) {
      return false;
    }

    const age = Date.now() - this.cache.timestamp;
    return age < this.cache.cacheDuration;
  }

  /**
   * Checks if cache is within grace period
   * @returns {boolean}
   */
  isWithinGracePeriod() {
    if (!this.cache.data || !this.cache.timestamp) {
      return false;
    }

    const age = Date.now() - this.cache.timestamp;
    return age < this.cache.gracePeriod;
  }

  /**
   * Formats license validation response
   * @param {Object} data - Raw response data
   * @returns {Object} Formatted response
   */
  _formatResponse(data) {
    return {
      status: data.status || 'unknown',
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      plan: data.plan || null,
      maxCustomers: data.maxCustomers || null
    };
  }

  /**
   * Clears the cache
   */
  clearCache() {
    this.cache.data = null;
    this.cache.timestamp = null;
    logger.info('License cache cleared');
  }

  /**
   * Gets current cache status
   * @returns {Object}
   */
  getCacheStatus() {
    return {
      hasCachedData: !!this.cache.data,
      isValid: this.isCacheValid(),
      isWithinGracePeriod: this.isWithinGracePeriod(),
      age: this.cache.timestamp ? Date.now() - this.cache.timestamp : null,
      cachedData: this.cache.data ? this._formatResponse(this.cache.data) : null
    };
  }
}

export default new LicenseManager();
