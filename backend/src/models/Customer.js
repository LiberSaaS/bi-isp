import mongoose from 'mongoose';

const customerSchema = new mongoose.Schema(
  {
    providerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Provider',
      required: [true, 'Provider ID is required'],
      index: true
    },
    externalId: {
      type: String,
      required: [true, 'External ID is required'],
      trim: true
    },
    name: {
      type: String,
      required: [true, 'Customer name is required'],
      trim: true,
      maxlength: [255, 'Name cannot exceed 255 characters']
    },
    document: {
      type: String,
      trim: true,
      sparse: true
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      match: [/^[\w.-]+@[\w.-]+\.\w+$/, 'Invalid email format']
    },
    phone: {
      type: String,
      trim: true
    },
    plan: {
      name: {
        type: String,
        trim: true
      },
      price: {
        type: Number,
        min: 0
      },
      downloadSpeed: {
        type: Number,
        min: 0
      },
      uploadSpeed: {
        type: Number,
        min: 0
      }
    },
    address: {
      city: String,
      neighborhood: String,
      street: String,
      number: String,
      cep: String
    },
    status: {
      type: String,
      enum: {
        values: ['active', 'suspended', 'cancelled', 'pending'],
        message: 'Status must be one of: active, suspended, cancelled, pending'
      },
      default: 'active',
      index: true
    },
    activationDate: {
      type: Date,
      default: null
    },
    cancellationDate: {
      type: Date,
      default: null
    },
    cancellationReason: {
      type: String,
      default: null
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
    collection: 'customers'
  }
);

// Compound unique index on providerId and externalId
customerSchema.index({ providerId: 1, externalId: 1 }, { unique: true });

// Additional indexes for common queries
customerSchema.index({ providerId: 1, status: 1 });
customerSchema.index({ providerId: 1, createdAt: -1 });
customerSchema.index({ document: 1 }, { sparse: true });

// Pre-save middleware for validation
customerSchema.pre('save', function (next) {
  if (this.email && !/^[\w.-]+@[\w.-]+\.\w+$/.test(this.email)) {
    return next(new Error('Invalid email format'));
  }
  next();
});

const Customer = mongoose.model('Customer', customerSchema);

export default Customer;
