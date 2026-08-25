import { mongoose } from '../db.js';

// One vote per user per season/category (e.g. 'heisman') — a lightweight
// public straw poll, separate from the weekly Top 25 ballot.
const awardVoteSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  userName: { type: String, default: 'Anonymous' },
  season: { type: Number, required: true },
  category: { type: String, default: 'heisman' },
  playerName: { type: String, required: true },
  team: { type: String, default: '' },
}, { timestamps: true });

awardVoteSchema.index({ userId: 1, season: 1, category: 1 }, { unique: true });

export default mongoose.model('AwardVote', awardVoteSchema);
