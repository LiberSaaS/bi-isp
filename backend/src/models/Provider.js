import mongoose from 'mongoose';

const providerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Provider name is required'],
      trim: true,
      maxlength: [255, 'Provider name cannot exceed 255 characters']
    },
    slug: {
      type: String,
      required: [true, 'Provider slug is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[a-z0-9_-]+$/, 'Slug must contain only lowercase letters, numbers, hyphens, and underscores']
    },
    erp: {
      type: String,
      enum: {
        values: ['ixc', 'hubsoft', 'sgp', 'mkauth'],
        message: 'ERP must be one of: ixc, hubsoft, sgp, mkauth'
      },
      required: [true, 'ERP type is required']
    },
    config: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    active: {
      type: Boolean,
      default: true,
      index: true
    },
    lastSync: {
      type: Date,
      default: null,
      index: true
    },
    lastSyncStatus: {
      type: String,
      enum: {
        values: ['success', 'error', 'running', 'never'],
        message: 'Sync status must be one of: success, error, running, never'
      },
      default: 'never'
    },
    lastSyncError: {
      type: String,
      default: null
    }
  },
  {
    timestamps: true,
    collection: 'providers'
  }
);

// Index for query performance
providerSchema.index({ active: 1, lastSync: -1 });
providerSchema.index({ erp: 1, active: 1 });

// Pre-save middleware to validate config based on ERP type
providerSchema.pre('save', function (next) {
  if (!this.config) {
    this.config = {};
  }
  next();
});

// Virtual for sync age in minutes
providerSchema.virtual('syncAgeMinutes').get(function () {
  if (!this.lastSync) return null;
  return Math.floor((Date.now() - this.lastSync.getTime()) / 60000);
});

const Provider = mongoose.model('Provider', providerSchema);

export default Provider;
