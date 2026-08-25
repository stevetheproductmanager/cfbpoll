import { mongoose } from '../db.js';

const ballotSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  userName: { type: String, default: 'Anonymous' },
  season: { type: Number, required: true },
  week: { type: Number, required: true },
  rankings: [{ type: String }],
  ballotType: { type: String, enum: ['human', 'computer'], default: 'human' },
  customPollId: { type: String, default: null }, // if ballotType==='computer' and derived from a saved custom poll
  submittedAt: { type: Date, default: Date.now },
});

ballotSchema.index({ userId: 1, season: 1, week: 1 }, { unique: true });
ballotSchema.index({ season: 1, week: 1 });

export default mongoose.model('Ballot', ballotSchema);
