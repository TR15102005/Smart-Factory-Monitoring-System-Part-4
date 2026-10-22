import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET || 'smart-factory-dev-secret';
const TOKEN_TTL = '12h';

export const hashPassword = password => bcrypt.hash(password, 10);
export const verifyPassword = (password, hash) => bcrypt.compare(password, hash);

export const signToken = user =>
  jwt.sign({ sub: String(user._id), username: user.username, role: user.role }, SECRET, { expiresIn: TOKEN_TTL });

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}

export const ROLE_LABELS = {
  admin: 'Administrator',
  safety_officer: 'Safety Officer',
  operator: 'Operator'
};

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Requires role: ${roles.map(r => ROLE_LABELS[r] || r).join(' or ')}` });
    }
    next();
  };
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired session' });
  }
}
