import { mongoose } from '../db.js';

const weekSchema = new mongoose.Schema({
  season: { type: Number, required: true },
  week: { type: Number, required: true },
  deadline: { type: Date },
  isOpen: { type: Boolean, default: true },
}, { timestamps: true });

weekSchema.index({ season: 1, week: 1 }, { unique: true });

export default mongoose.model('Week', weekSchema);
