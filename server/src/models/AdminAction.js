import { mongoose } from '../db.js';

// A lightweight audit trail of admin actions — who did what, when. Not meant
// to be exhaustive (no field-level diffs), just enough to answer "who closed
// Week 3?" or "who deleted that ballot?" after the fact.
const adminActionSchema = new mongoose.Schema({
  adminId: { type: String, required: true },
  adminName: { type: String, default: 'Unknown' },
  action: { type: String, required: true }, // e.g. 'week.open', 'ballot.delete'
  details: { type: String, default: '' },
}, { timestamps: true });

adminActionSchema.index({ createdAt: -1 });

export default mongoose.model('AdminAction', adminActionSchema);
