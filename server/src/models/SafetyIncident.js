import mongoose from 'mongoose';

const { Schema } = mongoose;

const safetyIncidentSchema = new Schema({
  incidentId: { type: String, required: true, unique: true },
  workspace: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
  robot: { type: Schema.Types.ObjectId, ref: 'Robot', default: null },
  worker: { type: Schema.Types.ObjectId, ref: 'Worker', default: null },
  type: {
    type: String,
    enum: [
      'near-miss', 'zone-intrusion', 'e-stop-triggered', 'collision',
      'force-limit-exceeded', 'equipment-fault', 'ergonomic-risk',
      'over-capacity', 'low-battery', 'comm-timeout', 'abnormal-condition'
    ],
    required: true
  },
  severity: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'low' },
  description: { type: String, default: '' },
  recommendedResponse: { type: String, default: '' },
  simulated: { type: Boolean, default: true },
  reportedBy: { type: String, default: 'system' },
  status: { type: String, enum: ['open', 'acknowledged', 'investigating', 'resolved'], default: 'open' },
  acknowledgedBy: { type: String, default: '' },
  acknowledgedAt: { type: Date },
  resolutionNotes: { type: String, default: '' },
  resolvedAt: { type: Date },
  occurredAt: { type: Date, default: Date.now }
}, { timestamps: true });

safetyIncidentSchema.index({ occurredAt: -1 });
safetyIncidentSchema.index({ severity: 1, status: 1 });

export default mongoose.model('SafetyIncident', safetyIncidentSchema);
