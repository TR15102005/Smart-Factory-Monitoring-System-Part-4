import mongoose from 'mongoose';

const { Schema } = mongoose;

const auditItemSchema = new Schema({
  requirement: { type: String, required: true },
  compliant: { type: Boolean, default: true },
  notes: { type: String, default: '' }
}, { _id: false });

const complianceAuditSchema = new Schema({
  workspace: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
  standard: {
    type: String,
    enum: ['ISO 10218-1', 'ISO/TS 15066', 'ISO 13849-1', 'OSHA 1910.212', 'ANSI/RIA R15.08'],
    required: true
  },
  items: [auditItemSchema],
  status: { type: String, enum: ['passed', 'passed-with-findings', 'failed', 'pending'], default: 'pending' },
  auditor: { type: String, required: true },
  auditDate: { type: Date, default: Date.now },
  nextAuditDate: { type: Date, required: true }
}, { timestamps: true });

export default mongoose.model('ComplianceAudit', complianceAuditSchema);
