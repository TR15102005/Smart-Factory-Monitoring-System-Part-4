import mongoose from 'mongoose';

const { Schema } = mongoose;

const robotSchema = new Schema({
  robotId: { type: String, required: true, unique: true },
  name: { type: String, default: '' },
  model: { type: String, required: true },
  vendor: { type: String, required: true },
  kind: { type: String, enum: ['cobot', 'agv', 'industrial-arm'], default: 'cobot' },
  workspace: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
  status: {
    type: String,
    enum: ['running', 'idle', 'charging', 'warning', 'maintenance', 'error', 'e-stop'],
    default: 'idle'
  },
  currentTask: { type: String, default: null },
  utilizationRate: { type: Number, min: 0, max: 100, default: 0 },
  cyclesPerHour: { type: Number, default: 0 },
  temperatureC: { type: Number, default: 35 },
  payloadKg: { type: Number, default: 0 },
  batteryPercent: { type: Number, min: 0, max: 100, default: 100 },
  operatingHours: { type: Number, default: 0 },
  lastCommAt: { type: Date, default: Date.now },
  commLost: { type: Boolean, default: false },
  lastMaintenance: { type: Date, default: Date.now },
  nextMaintenanceDue: { type: Date },
  firmware: { type: String, default: '1.0.0' },
  position: { x: { type: Number, default: null }, y: { type: Number, default: null } },
  statusHistory: {
    type: [{ status: String, at: { type: Date, default: Date.now } }],
    default: [],
    select: false
  }
}, { timestamps: true });

robotSchema.index({ workspace: 1, status: 1 });

robotSchema.statics.pushStatus = function (id, status) {
  return this.updateOne(
    { _id: id },
    { $push: { statusHistory: { $each: [{ status, at: new Date() }], $slice: -50 } } }
  );
};

export const ROBOT_STATUS_LABELS = {
  running: 'Running',
  idle: 'Idle',
  charging: 'Charging',
  warning: 'Warning',
  maintenance: 'Maintenance',
  error: 'Fault',
  'e-stop': 'Emergency Stop'
};

export default mongoose.model('Robot', robotSchema);
