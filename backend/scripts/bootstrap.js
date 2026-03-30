import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcryptjs from 'bcryptjs';
import { User } from '../src/api/auth.js';
import { Provider } from '../src/models/index.js';

// Load environment variables
dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/isp-bi';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@ispbi.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASS || 'admin123';

/**
 * Detect ERP provider configurations from environment variables.
 * Supports: HUBSOFT_<SLUG>_*, IXC_<SLUG>_*, SGP_<SLUG>_*, MKAUTH_<SLUG>_*
 */
function detectProviders() {
  const detected = [];
  const seen = new Set();

  const erpPatterns = [
    { prefix: 'HUBSOFT_', erp: 'hubsoft', requiredSuffix: ['URL', 'CLIENT_ID', 'CLIENT_SECRET', 'USERNAME', 'PASSWORD'] },
    { prefix: 'IXC_', erp: 'ixc', requiredSuffix: ['URL', 'TOKEN'] },
    { prefix: 'SGP_', erp: 'sgp', requiredSuffix: ['URL', 'TOKEN', 'APP'] },
    { prefix: 'MKAUTH_', erp: 'mkauth', requiredSuffix: ['URL', 'TOKEN'] }
  ];

  for (const pattern of erpPatterns) {
    // Find all environment variables matching the pattern
    const envKeys = Object.keys(process.env).filter(k => k.startsWith(pattern.prefix));

    // Extract unique slugs: e.g., HUBSOFT_ISPBI_URL → slug = 'ispbi'
    const slugs = new Set();
    for (const key of envKeys) {
      const rest = key.slice(pattern.prefix.length); // e.g., 'ISPBI_URL'
      const parts = rest.split('_');
      if (parts.length >= 2) {
        // Slug is everything before the last known suffix
        // Find which suffix matches
        for (const suffix of pattern.requiredSuffix) {
          if (key.endsWith('_' + suffix)) {
            const slug = key.slice(pattern.prefix.length, key.length - suffix.length - 1).toLowerCase();
            if (slug) slugs.add(slug);
            break;
          }
        }
      }
    }

    for (const slug of slugs) {
      const uniqueKey = `${pattern.erp}:${slug}`;
      if (seen.has(uniqueKey)) continue;

      const envPrefix = `${pattern.prefix}${slug.toUpperCase()}_`;

      // Check all required vars exist
      const missingVars = pattern.requiredSuffix.filter(s => !process.env[`${envPrefix}${s}`]);
      if (missingVars.length > 0) {
        console.log(`Skipping ${pattern.erp}/${slug}: missing env vars: ${missingVars.map(s => `${envPrefix}${s}`).join(', ')}`);
        continue;
      }

      // Build config based on ERP type
      let config = {};
      if (pattern.erp === 'hubsoft') {
        config = {
          url: process.env[`${envPrefix}URL`],
          clientId: process.env[`${envPrefix}CLIENT_ID`],
          clientSecret: process.env[`${envPrefix}CLIENT_SECRET`],
          username: process.env[`${envPrefix}USERNAME`],
          password: process.env[`${envPrefix}PASSWORD`]
        };
      } else if (pattern.erp === 'ixc') {
        config = {
          url: process.env[`${envPrefix}URL`],
          token: process.env[`${envPrefix}TOKEN`]
        };
      } else if (pattern.erp === 'sgp') {
        config = {
          url: process.env[`${envPrefix}URL`],
          token: process.env[`${envPrefix}TOKEN`],
          app: process.env[`${envPrefix}APP`]
        };
      } else if (pattern.erp === 'mkauth') {
        config = {
          url: process.env[`${envPrefix}URL`],
          token: process.env[`${envPrefix}TOKEN`]
        };
      }

      detected.push({
        slug,
        name: slug.charAt(0).toUpperCase() + slug.slice(1),
        erp: pattern.erp,
        config
      });
      seen.add(uniqueKey);
    }
  }

  return detected;
}

/**
 * Bootstrap script for ISP Analytics BI
 * Creates admin user if not exists
 * Auto-creates providers from environment variables
 * Triggers initial sync for all active providers
 */

async function bootstrap() {
  try {
    console.log('Starting bootstrap...');

    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      connectTimeoutMS: 10000,
      socketTimeoutMS: 45000
    });
    console.log('MongoDB connected successfully');

    // Create admin user if not exists
    console.log('Checking for admin user...');
    let adminUser = await User.findOne({ email: ADMIN_EMAIL });

    if (adminUser) {
      console.log(`Admin user already exists: ${ADMIN_EMAIL}`);
    } else {
      console.log('Creating admin user...');

      adminUser = new User({
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        name: 'Administrator',
        role: 'admin'
      });

      await adminUser.save();

      console.log('');
      console.log('========================================');
      console.log('ADMIN USER CREATED SUCCESSFULLY');
      console.log('========================================');
      console.log(`Email:    ${ADMIN_EMAIL}`);
      console.log(`Password: ${ADMIN_PASSWORD}`);
      console.log('');
      console.log('IMPORTANT: Change this password after first login!');
      console.log('========================================');
      console.log('');
    }

    // Auto-detect and create providers from environment variables
    console.log('Detecting ERP providers from environment variables...');
    const detectedProviders = detectProviders();

    if (detectedProviders.length === 0) {
      console.log('No ERP providers detected in environment variables.');
    } else {
      console.log(`Detected ${detectedProviders.length} provider(s) from env vars.`);

      for (const prov of detectedProviders) {
        let existing = await Provider.findOne({ slug: prov.slug, erp: prov.erp });

        if (existing) {
          // Update config if changed
          existing.config = prov.config;
          existing.active = true;
          await existing.save();
          console.log(`Provider updated: ${prov.name} (${prov.erp}/${prov.slug})`);
        } else {
          existing = new Provider({
            name: prov.name,
            slug: prov.slug,
            erp: prov.erp,
            config: prov.config,
            active: true,
            lastSyncStatus: 'never'
          });
          await existing.save();
          console.log(`Provider created: ${prov.name} (${prov.erp}/${prov.slug}) — ID: ${existing._id}`);
        }
      }
    }

    // Trigger initial sync for all active providers
    console.log('Checking for active providers...');
    const providers = await Provider.find({ active: true });

    if (providers.length === 0) {
      console.log('No active providers found. Skipping initial sync.');
    } else {
      console.log(`Found ${providers.length} active provider(s). Triggering initial sync...`);

      for (const provider of providers) {
        try {
          console.log(`Syncing provider: ${provider.name} (${provider.erp})`);

          // Dynamically import the connector
          const connectorModule = await import(`../src/connectors/${provider.erp}/index.js`);
          const connector = connectorModule.default;

          // Mark as running
          provider.lastSyncStatus = 'running';
          await provider.save();

          // Execute sync
          const startTime = Date.now();
          await connector.syncAll(provider);
          const duration = Date.now() - startTime;

          // Mark as success
          provider.lastSync = new Date();
          provider.lastSyncStatus = 'success';
          provider.lastSyncError = null;
          await provider.save();

          console.log(`Sync completed for ${provider.name} (${duration}ms)`);
        } catch (error) {
          console.error(`Sync failed for ${provider.name}: ${error.message}`);

          // Mark as error
          provider.lastSyncStatus = 'error';
          provider.lastSyncError = error.message;
          await provider.save();
        }
      }

      console.log('Initial sync completed.');
    }

    // Disconnect from database
    await mongoose.connection.close();
    console.log('Database connection closed');

    console.log('Bootstrap completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Bootstrap failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run bootstrap
bootstrap();
