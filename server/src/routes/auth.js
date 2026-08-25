import express from 'express';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export default function makeAuthRouter() {
  const router = express.Router();
  const { GOOGLE_CLIENT_ID, JWT_SECRET } = process.env;
  const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

  // POST /api/auth/google — verify Google ID token, upsert user, return JWT
  router.post('/google', async (req, res) => {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: 'Missing credential' });

    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();
      const { sub: googleId, email, name, picture } = payload;

      const ADMIN_EMAILS = ['stevetheproductmanager@gmail.com'];
      const role = ADMIN_EMAILS.includes(email) ? 'admin' : 'user';

      const user = await User.findOneAndUpdate(
        { googleId },
        { googleId, email, name, avatar: picture, role },
        { upsert: true, new: true }
      );

      const token = jwt.sign(
        { id: user._id.toString(), googleId, email, name, avatar: picture, role: user.role },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.json({ token, user: { id: user._id.toString(), googleId, email, name, avatar: picture, role: user.role } });
    } catch (err) {
      console.error('Google auth error:', err.message);
      res.status(401).json({ error: 'Invalid Google token' });
    }
  });

  // GET /api/auth/me — verify JWT, return user
  router.get('/me', async (req, res) => {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });

    try {
      const decoded = jwt.verify(auth.slice(7), JWT_SECRET);
      const user = await User.findById(decoded.id).lean();
      if (!user) return res.status(401).json({ error: 'User not found' });
      res.json({ id: user._id.toString(), googleId: user.googleId, email: user.email, name: user.name, avatar: user.avatar, role: user.role });
    } catch {
      res.status(401).json({ error: 'Invalid token' });
    }
  });

  // DEV ONLY — admin backdoor (remove in production)
  router.post('/admin-dev', async (req, res) => {
    if (process.env.NODE_ENV === 'production') return res.status(404).json({ error: 'Not found' });
    try {
      const user = await User.findOneAndUpdate(
        { email: 'admin@pollposition.com' },
        { name: 'Admin', email: 'admin@pollposition.com', role: 'admin', $setOnInsert: { googleId: null } },
        { upsert: true, new: true }
      );
      const token = jwt.sign(
        { id: user._id.toString(), email: user.email, name: user.name, avatar: null, role: 'admin' },
        JWT_SECRET,
        { expiresIn: '7d' }
      );
      res.json({ token, user: { id: user._id.toString(), email: user.email, name: user.name, avatar: null, role: 'admin' } });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
