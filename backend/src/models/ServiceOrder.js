import mongoose from 'mongoose';

const serviceOrderSchema = new mongoose.Schema(
  {
    providerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Provider',
      required: [true, 'Provider ID is required'],
      index: true
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      default: null,
      sparse: true,
      index: true
    },
    externalId: {
      type: String,
      required: [true, 'External ID is required'],
      trim: true
    },
    type: {
      type: String,
      trim: true,
      maxlength: [100, 'Type cannot exceed 100 characters']
    },
    category: {
      type: String,
      trim: true,
      maxlength: [100, 'Category cannot exceed 100 characters']
    },
    priority: {
      type: String,
      enum: {
        values: ['low', 'medium', 'high', 'critical'],
        message: 'Priority must be one of: low, medium, high, critical'
      },
      default: 'medium',
      index: true
    },
    status: {
      type: String,
      enum: {
        values: ['open', 'in_progress', 'completed', 'cancelled'],
        message: 'Status must be one of: open, in_progress, completed, cancelled'
      },
      default: 'open',
      index: true
    },
    description: {
      type: String,
      default: null
    },
    openedAt: {
      type: Date,
      default: Date.now,
      index: true
    },
    closedAt: {
      type: Date,
      default: null,
      sparse: true,
      index: true
    },
    resolutionTimeMinutes: {
      type: Number,
      default: null,
      min: 0
    },
    source: {
      type: String,
      enum: ['ixc', 'hubsoft', 'sgp', 'mkauth'],
      required: true,
      index: true
    }
  },
  {
    timestamps: true,
    collection: 'service_orders'
  }
);

// Compound unique index on providerId and externalId
serviceOrderSchema.index({ providerId: 1, externalId: 1 }, { unique: true });

// Additional indexes for common queries
serviceOrderSchema.index({ providerId: 1, status: 1 });
serviceOrderSchema.index({ customerId: 1, status: 1 });
serviceOrderSchema.index({ priority: 1, status: 1 });
serviceOrderSchema.index({ openedAt: -1, status: 1 });
serviceOrderSchema.index({ providerId: 1, createdAt: -1 });

// Virtual for calculating resolution time if not set
serviceOrderSchema.virtual('calculatedResolutionTime').get(function () {
  if (this.resolutionTimeMinutes) return this.resolutionTimeMinutes;
  if (!this.closedAt) return null;
  return Math.floor((this.closedAt.getTime() - this.openedAt.getTime()) / 60000);
});

// Virtual for age in hours
serviceOrderSchema.virtual('ageHours').get(function () {
  return Math.floor((Date.now() - this.openedAt.getTime()) / 3600000);
});

// Pre-save middleware
serviceOrderSchema.pre('save', function (next) {
  // Calculate resolution time if service order is being completed
  if (this.isModified('closedAt') && this.closedAt && !this.resolutionTimeMinutes) {
    this.resolutionTimeMinutes = Math.floor((this.closedAt.getTime() - this.openedAt.getTime()) / 60000);
  }
  
  next();
});

const ServiceOrder = mongoose.model('ServiceOrder', serviceOrderSchema);

export default ServiceOrder;
