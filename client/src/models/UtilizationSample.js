import mongoose from 'mongoose';

const { Schema } = mongoose;

const utilizationSampleSchema = new Schema({
  robot: { type: Schema.Types.ObjectId, ref: 'Robot', required: true },
  workspace: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
  utilization: { type: Number, min: 0, max: 100, required: true },
  status: { type: String, enum: ['running', 'idle', 'charging', 'warning', 'maintenance', 'error', 'e-stop'], required: true },
  temperatureC: { type: Number },
  cyclesPerHour: { type: Number },
  sampledAt: { type: Date, default: Date.now }
});

utilizationSampleSchema.index({ robot: 1, sampledAt: -1 });
utilizationSampleSchema.index({ workspace: 1, sampledAt: -1 });
// Keep 7 days of telemetry
utilizationSampleSchema.index({ sampledAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 7 });

export default mongoose.model('UtilizationSample', utilizationSampleSchema);
