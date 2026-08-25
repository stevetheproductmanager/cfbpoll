import { mongoose } from '../db.js';

const weekSchema = new mongoose.Schema({
  season: { type: Number, required: true },
  week: { type: Number, required: true },
  label: { type: String }, // e.g. "Week 1", "Conference Championships", "CFP Semifinals"
  startDate: { type: Date }, // first day games count toward this week (Tuesday)
  endDate: { type: Date }, // last day games count toward this week (Sunday, unless a Monday game pushes the deadline)
  deadline: { type: Date },
  isOpen: { type: Boolean, default: true },
}, { timestamps: true });

weekSchema.index({ season: 1, week: 1 }, { unique: true });

export default mongoose.model('Week', weekSchema);
