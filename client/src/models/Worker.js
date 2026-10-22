import mongoose from 'mongoose';

const { Schema } = mongoose;

const certificationSchema = new Schema({
  name: { type: String, required: true },
  issuedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  status: { type: String, enum: ['valid', 'expiring-soon', 'expired'], default: 'valid' }
}, { _id: false });

const workerEventSchema = new Schema({
  type: { type: String, enum: ['entry', 'exit', 'break', 'return', 'status'], required: true },
  workspace: { type: Schema.Types.ObjectId, ref: 'Workspace', default: null },
  zoneCode: { type: String, default: '' },
  at: { type: Date, default: Date.now }
}, { _id: false });

const workerSchema = new Schema({
  employeeId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  role: { type: String, required: true },
  department: { type: String, default: 'Production' },
  shift: { type: String, enum: ['morning', 'evening', 'night'], default: 'morning' },
  workspace: { type: Schema.Types.ObjectId, ref: 'Workspace', default: null },
  status: { type: String, enum: ['active', 'break', 'offline', 'training'], default: 'active' },
  certifications: [certificationSchema],
  cobotSafetyTrained: { type: Boolean, default: false },
  lastActivityAt: { type: Date, default: Date.now },
  position: { x: { type: Number, default: null }, y: { type: Number, default: null } },
  events: { type: [workerEventSchema], default: [], select: false }
}, { timestamps: true });

workerSchema.index({ department: 1, status: 1 });

export default mongoose.model('Worker', workerSchema);
