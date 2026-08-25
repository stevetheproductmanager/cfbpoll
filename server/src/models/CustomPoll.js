import { mongoose } from '../db.js';

// A user-built "computer poll" — a custom set of weights over the same
// underlying game/efficiency data the site's official computer model uses.
// Rankings are a saved snapshot from the moment the user hit Save; they can
// resave any time to refresh against current data.
const customPollSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  userName: { type: String, default: 'Anonymous' },
  name: { type: String, required: true, trim: true, maxlength: 60 },
  season: { type: Number, required: true },
  weights: {
    efficiency: { type: Number, default: 0.38 },
    results: { type: Number, default: 0.25 },
    sos: { type: Number, default: 0.15 },
    quality: { type: Number, default: 0.12 },
    momentum: { type: Number, default: 0.10 },
  },
  rankings: [{
    team: String,
    rank: Number,
    score: Number,
    officialRank: Number,
    breakdown: {
      efficiency: Number, results: Number, sos: Number, quality: Number, momentum: Number,
    },
  }],
  // When true, this poll's Top 25 auto-submits as its owner's Computer ballot
  // every time it's recomputed (manual recompute or the weekly refresh).
  published: { type: Boolean, default: false },
}, { timestamps: true });

customPollSchema.index({ userId: 1, season: 1 });
customPollSchema.index({ published: 1, season: 1 });

export default mongoose.model('CustomPoll', customPollSchema);
