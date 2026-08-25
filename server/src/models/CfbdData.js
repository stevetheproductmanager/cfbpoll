import { mongoose } from '../db.js';

const cfbdDataSchema = new mongoose.Schema({
  season: { type: Number, required: true },
  slug: { type: String, required: true },
  data: { type: mongoose.Schema.Types.Mixed, required: true },
  downloadedAt: { type: Date, default: Date.now },
});

cfbdDataSchema.index({ season: 1, slug: 1 }, { unique: true });

export default mongoose.model('CfbdData', cfbdDataSchema);
