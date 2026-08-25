import { mongoose } from '../db.js';

// A single voter's pick for a real, scheduled game (from games-regular data).
// gameId is a stable slug built from week+home+away so picks and results can
// be joined without needing CFBD's numeric game id to survive re-downloads.
const gamePickSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  userName: { type: String, default: 'Anonymous' },
  season: { type: Number, required: true },
  week: { type: Number, required: true },
  gameId: { type: String, required: true },
  home: { type: String, required: true },
  away: { type: String, required: true },
  pickedTeam: { type: String, required: true },
}, { timestamps: true });

gamePickSchema.index({ userId: 1, season: 1, gameId: 1 }, { unique: true });
gamePickSchema.index({ season: 1, week: 1 });

export default mongoose.model('GamePick', gamePickSchema);
