import { Schema, model } from 'mongoose';

// Histórico de sincronizações (automáticas ou por upload manual).
const syncRunSchema = new Schema(
  {
    origin: { type: String, required: true },
    source: { type: String, enum: ['auto', 'upload'], required: true },
    status: { type: String, enum: ['running', 'ok', 'error'], default: 'running' },
    file: { type: String, default: '' },
    states: { type: [String], default: [] },
    imported: { type: Number, default: 0 },
    removed: { type: Number, default: 0 },
    error: { type: String, default: '' },
    finishedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

syncRunSchema.index({ origin: 1, createdAt: -1 });

export const SyncRun = model('SyncRun', syncRunSchema);
