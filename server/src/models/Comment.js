import { mongoose } from '../db.js';

// Lightweight discussion threads on a team page — flat (no nested replies) to
// keep this simple; owner or an admin can delete their own comment.
const commentSchema = new mongoose.Schema({
  team: { type: String, required: true },
  userId: { type: String, required: true },
  userName: { type: String, default: 'Anonymous' },
  text: { type: String, required: true, trim: true, maxlength: 500 },
}, { timestamps: true });

commentSchema.index({ team: 1, createdAt: -1 });

export default mongoose.model('Comment', commentSchema);
