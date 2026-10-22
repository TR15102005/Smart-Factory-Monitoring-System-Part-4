import { Router } from 'express';
import { simulationControl, simulationStatus } from '../simulator.js';
import { requireRole } from '../auth.js';
import { logAudit } from '../audit.js';

const router = Router();

router.get('/status', (req, res) => res.json(simulationStatus()));

const action = (name, fn) => async (req, res, next) => {
  try {
    const result = await fn(req);
    logAudit(req, `simulation.${name}`, '', `tickMs=${result.tickMs}`);
    res.json(result);
  } catch (e) { next(e); }
};

router.post('/start', requireRole('admin'), action('start', () => simulationControl.start()));
router.post('/pause', requireRole('admin'), action('pause', () => simulationControl.pause()));
router.post('/resume', requireRole('admin'), action('resume', () => simulationControl.resume()));
router.post('/stop', requireRole('admin'), action('stop', () => simulationControl.stop()));
router.post('/reset', requireRole('admin'), action('reset', () => simulationControl.reset()));
router.post('/speed', requireRole('admin'), action('speed', req => simulationControl.setSpeed(req.body?.tickMs)));

export default router;
