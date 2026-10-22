import mongoose from 'mongoose';

const { Schema } = mongoose;

const maintenanceSchema = new Schema({
  robot: { type: Schema.Types.ObjectId, ref: 'Robot', required: true, index: true },
  type: { type: String, enum: ['scheduled', 'corrective', 'inspection', 'battery'], required: true },
  status: { type: String, enum: ['scheduled', 'completed', 'overdue'], default: 'completed' },
  performedAt: { type: Date },
  dueAt: { type: Date, index: true },
  notes: { type: String, default: '' },
  technician: { type: String, default: 'system' },
  simulated: { type: Boolean, default: true }
}, { timestamps: true });

export default mongoose.model('MaintenanceRecord', maintenanceSchema);
