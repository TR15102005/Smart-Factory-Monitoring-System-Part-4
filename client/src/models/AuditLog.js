import mongoose from 'mongoose';

const { Schema } = mongoose;

const auditSchema = new Schema({
  username: { type: String, default: 'system' },
  role: { type: String, default: '' },
  action: { type: String, required: true },
  target: { type: String, default: '' },
  details: { type: String, default: '' },
  at: { type: Date, default: Date.now }
});

auditSchema.index({ at: -1 });

export default mongoose.model('AuditLog', auditSchema);
