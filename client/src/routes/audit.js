import { Router } from 'express';
import AuditLog from '../models/AuditLog.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    res.json(await AuditLog.find().sort({ at: -1 }).limit(limit));
  } catch (e) { next(e); }
});

export default router;
