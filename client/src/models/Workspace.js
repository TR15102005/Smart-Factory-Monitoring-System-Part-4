import mongoose from 'mongoose';

const { Schema } = mongoose;

const areaSchema = new Schema({
  areaId: { type: String, required: true },
  label: { type: String, default: '' },
  kind: {
    type: String,
    enum: ['robot-cell', 'walkway', 'workstation', 'staging', 'charging', 'restricted'],
    required: true
  },
  x: { type: Number, required: true },
  y: { type: Number, required: true },
  w: { type: Number, required: true },
  h: { type: Number, required: true },
  robot: { type: Schema.Types.ObjectId, ref: 'Robot', default: null }
}, { _id: false });

const layoutSchema = new Schema({
  widthM: { type: Number, default: 32 },
  heightM: { type: Number, default: 20 },
  areas: [areaSchema]
}, { _id: false });

const workspaceSchema = new Schema({
  name: { type: String, required: true },
  zoneCode: { type: String, required: true, unique: true },
  type: {
    type: String,
    enum: ['assembly', 'welding', 'packaging', 'quality-inspection', 'material-handling', 'cnc-loading'],
    required: true
  },
  collaborationMode: {
    type: String,
    enum: ['speed-separation-monitoring', 'power-force-limiting', 'hand-guiding', 'safety-rated-monitored-stop'],
    default: 'power-force-limiting'
  },
  maxOccupancy: { type: Number, default: 10 },
  status: { type: String, enum: ['operational', 'restricted', 'shutdown'], default: 'operational' },
  safetyScore: { type: Number, min: 0, max: 100, default: 100 },
  floorAreaSqm: { type: Number, default: 100 },
  layout: layoutSchema
}, { timestamps: true });

workspaceSchema.virtual('robots', {
  ref: 'Robot',
  localField: '_id',
  foreignField: 'workspace'
});

workspaceSchema.virtual('workers', {
  ref: 'Worker',
  localField: '_id',
  foreignField: 'workspace'
});

workspaceSchema.set('toJSON', { virtuals: true });
workspaceSchema.set('toObject', { virtuals: true });

export default mongoose.model('Workspace', workspaceSchema);
