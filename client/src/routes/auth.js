import { Router } from 'express';
import User from '../models/User.js';
import { hashPassword, verifyPassword, signToken, requireAuth } from '../auth.js';

const router = Router();

const publicUser = u => ({ id: u._id, username: u.username, role: u.role, fullName: u.fullName });

router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });
    const user = await User.findOne({ username: String(username).trim().toLowerCase() });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (e) { next(e); }
});

router.post('/register', async (req, res, next) => {
  try {
    const { username, password, fullName } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });
    if (String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    const normalized = String(username).trim().toLowerCase();
    if (await User.exists({ username: normalized })) {
      return res.status(409).json({ error: 'Username already exists' });
    }
    // self-registration is always operator; admin accounts are provisioned out of band
    const user = await User.create({
      username: normalized,
      fullName: fullName || '',
      role: 'operator',
      passwordHash: await hashPassword(password)
    });
    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  } catch (e) { next(e); }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.sub);
    if (!user) return res.status(401).json({ error: 'Account no longer exists' });
    res.json(publicUser(user));
  } catch (e) { next(e); }
});

export default router;
