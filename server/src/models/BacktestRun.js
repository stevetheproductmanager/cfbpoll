import { mongoose } from '../db.js';

// One row per backtest a user runs from the Custom Poll Builder — lets admins
// see feature adoption (how many runs, which seasons are popular) without
// storing anything more sensitive than the season and the resulting score.
const backtestRunSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  userName: { type: String, default: 'Anonymous' },
  season: { type: Number, required: true },
  closeness: { type: Number, default: null },
  createdAt: { type: Date, default: Date.now },
});

backtestRunSchema.index({ createdAt: -1 });
backtestRunSchema.index({ season: 1 });

export default mongoose.model('BacktestRun', backtestRunSchema);
