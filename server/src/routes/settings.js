import { Router } from 'express';
import { getSettings } from '../models/Settings.js';
import { requireRole } from '../auth.js';
import { logAudit } from '../audit.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    res.json(await getSettings());
  } catch (e) { next(e); }
});

router.put('/', requireRole('admin'), async (req, res, next) => {
  try {
    const settings = await getSettings();
    const t = req.body?.thresholds || {};
    const numeric = ['proximityM', 'lowBatteryPct', 'commTimeoutS', 'tempLimitC'];
    for (const key of numeric) {
      if (t[key] !== undefined) {
        const value = Number(t[key]);
        if (!Number.isFinite(value) || value < 0) return res.status(400).json({ error: `Invalid threshold ${key}` });
        settings.thresholds[key] = value;
      }
    }
    for (const key of ['overCapacityEnabled', 'restrictedAreaEnabled']) {
      if (t[key] !== undefined) settings.thresholds[key] = Boolean(t[key]);
    }
    await settings.save();
    logAudit(req, 'settings.update', 'thresholds', JSON.stringify(settings.thresholds));
    res.json(settings);
  } catch (e) { next(e); }
});

export default router;
