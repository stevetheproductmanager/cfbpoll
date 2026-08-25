import { mongoose } from '../db.js';

const teamSchema = new mongoose.Schema({
  school: { type: String, required: true },
  conference: { type: String },
  mascot: { type: String },
  abbreviation: { type: String },
  logos: [String],
  color: { type: String },
  altColor: { type: String },
  season: { type: Number, required: true },
}, { timestamps: true });

teamSchema.index({ school: 1, season: 1 }, { unique: true });

export default mongoose.model('Team', teamSchema);
