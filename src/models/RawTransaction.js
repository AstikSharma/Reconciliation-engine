import mongoose from 'mongoose';

const rawTransactionSchema = new mongoose.Schema(
  {
    source: {
      type: String,
      required: true,
      enum: ['user', 'exchange'],
      index: true,
    },
    status: {
      type: String,
      required: true,
      enum: ['valid', 'malformed'],
      default: 'valid',
      index: true,
    },
    validationErrors: {
      type: [String],
      default: [],
    },
    
    externalId: {
      type: String,
      required: false,
    },
    timestamp: {
      type: Date,
      required: false,
    },
    type: {
      type: String,
      required: false,
    },
    asset: {
      type: String,
      required: false,
    },
    quantity: {
      type: Number,
      required: false,
    },
    price: {
      type: Number,
      required: false,
    },
    
    rawData: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    
    jobId: {
      type: String,
      required: true,
      index: true,
    }
  },
  {
    timestamps: true,
  }
);

rawTransactionSchema.index({ source: 1, status: 1, asset: 1, timestamp: 1 });
rawTransactionSchema.index({ jobId: 1, externalId: 1 });

export const RawTransaction = mongoose.model('RawTransaction', rawTransactionSchema);