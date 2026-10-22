import { Router } from 'express';
import Worker from '../models/Worker.js';
import Workspace from '../models/Workspace.js';
import { requireRole } from '../auth.js';
import { logAudit } from '../audit.js';

const router = Router();

const WRITABLE = ['employeeId', 'name', 'role', 'department', 'shift', 'workspace', 'status', 'certifications', 'cobotSafetyTrained'];
const clean = body => Object.fromEntries(Object.entries(body || {}).filter(([k]) => WRITABLE.includes(k)));

async function pushEvent(worker, type, workspaceId) {
  const ws = workspaceId ? await Workspace.findById(workspaceId).select('zoneCode') : null;
  worker.events = [...(worker.events || []), {
    type, workspace: workspaceId || null, zoneCode: ws?.zoneCode || '', at: new Date()
  }].slice(-30);
}

router.get('/', async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.workspace) filter.workspace = req.query.workspace;
    if (req.query.department) filter.department = req.query.department;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.q) {
      const q = new RegExp(String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: q }, { employeeId: q }, { role: q }];
    }
    const workers = await Worker.find(filter).populate('workspace', 'name zoneCode').sort({ employeeId: 1 });
    res.json(workers);
  } catch (e) { next(e); }
});

router.get('/departments', async (req, res, next) => {
  try {
    res.json(await Worker.distinct('department'));
  } catch (e) { next(e); }
});

// NOTE: must stay above '/:id'
router.get('/certifications/expiring', async (req, res, next) => {
  try {
    const days = Number(req.query.days) || 30;
    const horizon = new Date(Date.now() + days * 24 * 3600 * 1000);
    const workers = await Worker.find({ 'certifications.expiresAt': { $lte: horizon } });
    const result = workers.map(w => ({
      ...w.toJSON(),
      certifications: w.certifications.filter(c => c.expiresAt <= horizon)
    }));
    res.json(result);
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const worker = await Worker.findById(req.params.id)
      .populate('workspace', 'name zoneCode')
      .select('+events');
    if (!worker) return res.status(404).json({ error: 'Worker not found' });
    res.json(worker);
  } catch (e) { next(e); }
});

router.get('/:id/activity', async (req, res, next) => {
  try {
    const worker = await Worker.findById(req.params.id).select('+events').populate('events.workspace', 'zoneCode name');
    if (!worker) return res.status(404).json({ error: 'Worker not found' });
    res.json([...(worker.events || [])].reverse());
  } catch (e) { next(e); }
});

router.post('/', requireRole('admin'), async (req, res, next) => {
  try {
    const data = clean(req.body);
    if (!data.employeeId || !data.name || !data.role) {
      return res.status(400).json({ error: 'employeeId, name and role are required' });
    }
    if (await Worker.exists({ employeeId: data.employeeId })) {
      return res.status(409).json({ error: 'Worker ID already exists' });
    }
    if (data.workspace) {
      const ws = await Workspace.findById(data.workspace);
      if (!ws) return res.status(400).json({ error: 'Unknown workstation' });
    }
    const worker = await Worker.create(data);
    if (worker.workspace) {
      await pushEvent(worker, 'entry', worker.workspace);
      await worker.save();
    }
    logAudit(req, 'worker.create', worker.employeeId);
    req.app.get('io').emit('worker-updated', worker);
    res.status(201).json(worker);
  } catch (e) { next(e); }
});

router.put('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const data = clean(req.body);
    const worker = await Worker.findById(req.params.id);
    if (!worker) return res.status(404).json({ error: 'Worker not found' });
    if (data.employeeId && data.employeeId !== worker.employeeId && await Worker.exists({ employeeId: data.employeeId })) {
      return res.status(409).json({ error: 'Worker ID already exists' });
    }
    const wsChanged = data.workspace !== undefined && String(data.workspace || '') !== String(worker.workspace || '');
    const oldWorkspace = worker.workspace;
    if (wsChanged && data.workspace) {
      const ws = await Workspace.findById(data.workspace);
      if (!ws) return res.status(400).json({ error: 'Unknown workstation' });
    }
    Object.assign(worker, data);
    if (wsChanged) {
      await pushEvent(worker, 'exit', oldWorkspace);
      await pushEvent(worker, 'entry', data.workspace);
      worker.position = { x: null, y: null };
    }
    worker.lastActivityAt = new Date();
    await worker.save();
    logAudit(req, 'worker.update', worker.employeeId);
    req.app.get('io').emit('worker-updated', worker);
    res.json(worker);
  } catch (e) { next(e); }
});

router.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const worker = await Worker.findByIdAndDelete(req.params.id);
    if (!worker) return res.status(404).json({ error: 'Worker not found' });
    logAudit(req, 'worker.delete', worker.employeeId);
    req.app.get('io').emit('worker-updated', { _id: worker._id, deleted: true });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.patch('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const worker = await Worker.findByIdAndUpdate(req.params.id, clean(req.body), { new: true, runValidators: true });
    if (!worker) return res.status(404).json({ error: 'Worker not found' });
    req.app.get('io').emit('worker-updated', worker);
    res.json(worker);
  } catch (e) { next(e); }
});

export default router;
