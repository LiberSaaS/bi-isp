import mongoose from 'mongoose';

const invoiceSchema = new mongoose.Schema(
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
      required: [true, 'Customer ID is required'],
      index: true
    },
    externalId: {
      type: String,
      required: [true, 'External ID is required'],
      trim: true
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [0, 'Amount cannot be negative']
    },
    paidAmount: {
      type: Number,
      default: 0,
      min: [0, 'Paid amount cannot be negative']
    },
    dueDate: {
      type: Date,
      required: [true, 'Due date is required'],
      index: true
    },
    paymentDate: {
      type: Date,
      default: null,
      index: true
    },
    status: {
      type: String,
      enum: {
        values: ['pending', 'paid', 'overdue', 'cancelled'],
        message: 'Status must be one of: pending, paid, overdue, cancelled'
      },
      default: 'pending',
      index: true
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
    collection: 'invoices'
  }
);

// Compound unique index on providerId and externalId
invoiceSchema.index({ providerId: 1, externalId: 1 }, { unique: true });

// Additional indexes for common queries
invoiceSchema.index({ providerId: 1, status: 1 });
invoiceSchema.index({ customerId: 1, status: 1 });
invoiceSchema.index({ dueDate: 1, status: 1 });
invoiceSchema.index({ providerId: 1, dueDate: -1 });

// Virtual for overdue status
invoiceSchema.virtual('isOverdue').get(function () {
  return this.status === 'pending' && this.dueDate < new Date();
});

// Pre-save middleware for validation
invoiceSchema.pre('save', function (next) {
  if (this.paidAmount > this.amount) {
    return next(new Error('Paid amount cannot exceed invoice amount'));
  }
  
  // Auto-update status if fully paid
  if (this.paidAmount >= this.amount && this.status !== 'cancelled') {
    this.status = 'paid';
  }
  
  next();
});

const Invoice = mongoose.model('Invoice', invoiceSchema);

export default Invoice;
