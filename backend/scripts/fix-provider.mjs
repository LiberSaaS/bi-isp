/**
 * Fix script: Create provider document and clean up orphaned customers
 * Run inside Docker: docker exec -it isp-bi-api node scripts/fix-provider.mjs
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://mongo:27017/isp_analytics';

async function fix() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('Connected.');

  const db = mongoose.connection.db;

  // 1. Check current state
  const provCount = await db.collection('providers').countDocuments();
  const custCount = await db.collection('customers').countDocuments();
  console.log(`Current state: ${provCount} providers, ${custCount} customers`);

  // 2. Detect HubSoft config from env
  const envKeys = Object.keys(process.env).filter(k => k.startsWith('HUBSOFT_'));
  console.log('HubSoft env vars:', envKeys);

  // Find slug
  let slug = null;
  for (const key of envKeys) {
    if (key.endsWith('_URL')) {
      slug = key.replace('HUBSOFT_', '').replace('_URL', '').toLowerCase();
      break;
    }
  }

  if (!slug) {
    console.error('No HUBSOFT_*_URL found in env. Cannot auto-detect provider.');
    process.exit(1);
  }

  console.log(`Detected HubSoft slug: ${slug}`);
  const prefix = `HUBSOFT_${slug.toUpperCase()}_`;

  // 3. Create or update provider
  let provider = await db.collection('providers').findOne({ slug, erp: 'hubsoft' });

  if (provider) {
    console.log(`Provider already exists: ${provider._id}`);
  } else {
    const result = await db.collection('providers').insertOne({
      name: slug.charAt(0).toUpperCase() + slug.slice(1),
      slug,
      erp: 'hubsoft',
      config: {
        url: process.env[`${prefix}URL`] || '',
        clientId: process.env[`${prefix}CLIENT_ID`] || '',
        clientSecret: process.env[`${prefix}CLIENT_SECRET`] || '',
        username: process.env[`${prefix}USERNAME`] || '',
        password: process.env[`${prefix}PASSWORD`] || ''
      },
      active: true,
      lastSync: null,
      lastSyncStatus: 'never',
      lastSyncError: null,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    provider = await db.collection('providers').findOne({ _id: result.insertedId });
    console.log(`Provider created: ${provider._id}`);
  }

  // 4. Fix orphaned customers - update string providerId to ObjectId
  const orphaned = await db.collection('customers').countDocuments({
    $or: [
      { providerId: slug },
      { providerId: { $type: 'string' } }
    ]
  });

  if (orphaned > 0) {
    console.log(`Fixing ${orphaned} orphaned customers...`);
    // Drop the compound unique index first if it exists, then update
    const result = await db.collection('customers').updateMany(
      { $or: [{ providerId: slug }, { providerId: { $type: 'string' } }] },
      { $set: { providerId: provider._id } }
    );
    console.log(`Updated ${result.modifiedCount} customers to use provider ObjectId ${provider._id}`);
  }

  // 5. Verify
  const finalProvCount = await db.collection('providers').countDocuments();
  const finalCustCount = await db.collection('customers').countDocuments({ providerId: provider._id });
  console.log(`Final state: ${finalProvCount} providers, ${finalCustCount} customers linked to provider`);

  // 6. Show a sample customer
  const sample = await db.collection('customers').findOne({ providerId: provider._id });
  if (sample) {
    console.log(`Sample customer: ${sample.name}, status=${sample.status}, providerId=${sample.providerId}`);
  }

  await mongoose.connection.close();
  console.log('Done!');
  process.exit(0);
}

fix().catch(err => {
  console.error('Fix failed:', err);
  process.exit(1);
});
