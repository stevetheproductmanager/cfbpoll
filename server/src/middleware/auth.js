import jwt from 'jsonwebtoken';

// Verifies the Bearer JWT and attaches { id, email, name, role } to req.user.
// 401 if missing/invalid — use on any route that must know who's calling.
export function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' });
  try {
    req.user = jwt.verify(auth.slice(7), process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Same as requireAuth, plus role must be 'admin'. 403 otherwise.
export function requireAdmin(req, res, next) {
  requireAuth(req, res, (err) => {
    if (err) return;
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    next();
  });
}
