import { Router } from 'express';
import User from '../models/User.js';
import { hashPassword } from '../auth.js';

const router = Router();

const publicUser = u => ({
  id: u._id,
  username: u.username,
  fullName: u.fullName,
  role: u.role,
  createdAt: u.createdAt
});

router.get('/', async (req, res, next) => {
  try {
    const users = await User.find().sort({ createdAt: 1 });
    res.json(users.map(publicUser));
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { username, password, fullName, role } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });
    if (String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    const normalized = String(username).trim().toLowerCase();
    if (await User.exists({ username: normalized })) {
      return res.status(409).json({ error: 'Username already exists' });
    }
    const user = await User.create({
      username: normalized,
      fullName: fullName || '',
      role: ['admin', 'safety_officer', 'operator'].includes(role) ? role : 'operator',
      passwordHash: await hashPassword(password)
    });
    res.status(201).json(publicUser(user));
  } catch (e) { next(e); }
});

router.patch('/:id/role', async (req, res, next) => {
  try {
    const { role } = req.body || {};
    if (!['admin', 'safety_officer', 'operator'].includes(role)) return res.status(400).json({ error: 'Role must be admin, safety_officer or operator' });
    if (req.params.id === req.user.sub) return res.status(400).json({ error: 'You cannot change your own role' });
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.role = role;
    await user.save();
    res.json(publicUser(user));
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    if (req.params.id === req.user.sub) return res.status(400).json({ error: 'You cannot delete your own account' });
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
