import mongoose from 'mongoose';

const settingsSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  value: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  }
}, {
  timestamps: true
});

/**
 * Get a setting by key, with optional default
 */
settingsSchema.statics.get = async function(key, defaultValue = null) {
  const doc = await this.findOne({ key });
  return doc ? doc.value : defaultValue;
};

/**
 * Set a setting value (upsert)
 */
settingsSchema.statics.set = async function(key, value) {
  return this.findOneAndUpdate(
    { key },
    { key, value },
    { upsert: true, new: true }
  );
};

const Settings = mongoose.model('Settings', settingsSchema);

export default Settings;
