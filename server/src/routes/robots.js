import { Router } from 'express';
import Robot from '../models/Robot.js';
import Workspace from '../models/Workspace.js';
import UtilizationSample from '../models/UtilizationSample.js';
import MaintenanceRecord from '../models/MaintenanceRecord.js';
import { requireRole } from '../auth.js';
import { logAudit } from '../audit.js';

const router = Router();

const WRITABLE = ['robotId', 'name', 'model', 'vendor', 'kind', 'workspace', 'status', 'currentTask', 'payloadKg', 'firmware', 'batteryPercent', 'operatingHours', 'lastMaintenance', 'nextMaintenanceDue'];
const clean = body => Object.fromEntries(Object.entries(body || {}).filter(([k]) => WRITABLE.includes(k)));

router.get('/', async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.workspace) filter.workspace = req.query.workspace;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.kind) filter.kind = req.query.kind;
    if (req.query.q) {
      const q = new RegExp(String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ robotId: q }, { name: q }, { model: q }, { vendor: q }];
    }
    const robots = await Robot.find(filter).populate('workspace', 'name zoneCode').sort({ robotId: 1 });
    res.json(robots);
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const robot = await Robot.findById(req.params.id).populate('workspace', 'name zoneCode');
    if (!robot) return res.status(404).json({ error: 'Robot not found' });
    res.json(robot);
  } catch (e) { next(e); }
});

router.get('/:id/utilization', async (req, res, next) => {
  try {
    const hours = Math.min(Number(req.query.hours) || 24, 168);
    const since = new Date(Date.now() - hours * 3600 * 1000);
    const samples = await UtilizationSample.find({ robot: req.params.id, sampledAt: { $gte: since } }).sort({ sampledAt: 1 });
    res.json(samples);
  } catch (e) { next(e); }
});

router.get('/:id/status-history', async (req, res, next) => {
  try {
    const robot = await Robot.findById(req.params.id).select('+statusHistory');
    if (!robot) return res.status(404).json({ error: 'Robot not found' });
    res.json([...(robot.statusHistory || [])].reverse());
  } catch (e) { next(e); }
});

router.get('/:id/maintenance', async (req, res, next) => {
  try {
    const records = await MaintenanceRecord.find({ robot: req.params.id }).sort({ updatedAt: -1 });
    res.json(records);
  } catch (e) { next(e); }
});

router.patch('/:id/status', requireRole('admin', 'operator'), async (req, res, next) => {
  try {
    const { status, currentTask } = req.body;
    const robot = await Robot.findByIdAndUpdate(
      req.params.id,
      { $set: { ...(status && { status }), ...(currentTask !== undefined && { currentTask }) } },
      { new: true }
    );
    if (!robot) return res.status(404).json({ error: 'Robot not found' });
    if (status) await Robot.pushStatus(robot._id, status);
    logAudit(req, 'robot.status', robot.robotId, `status=${status || 'unchanged'}`);
    req.app.get('io').emit('robot-status', robot);
    res.json(robot);
  } catch (e) { next(e); }
});

router.post('/', requireRole('admin'), async (req, res, next) => {
  try {
    const data = clean(req.body);
    if (!data.robotId || !data.model || !data.vendor || !data.workspace) {
      return res.status(400).json({ error: 'robotId, model, vendor and workspace are required' });
    }
    if (await Robot.exists({ robotId: data.robotId })) {
      return res.status(409).json({ error: 'Robot ID already exists' });
    }
    if (!(await Workspace.exists({ _id: data.workspace }))) {
      return res.status(400).json({ error: 'Unknown workstation' });
    }
    const robot = await Robot.create(data);
    logAudit(req, 'robot.create', robot.robotId);
    req.app.get('io').emit('robot-status', robot);
    res.status(201).json(robot);
  } catch (e) { next(e); }
});

router.put('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const data = clean(req.body);
    const robot = await Robot.findById(req.params.id);
    if (!robot) return res.status(404).json({ error: 'Robot not found' });
    if (data.robotId && data.robotId !== robot.robotId && await Robot.exists({ robotId: data.robotId })) {
      return res.status(409).json({ error: 'Robot ID already exists' });
    }
    if (data.workspace && !(await Workspace.exists({ _id: data.workspace }))) {
      return res.status(400).json({ error: 'Unknown workstation' });
    }
    const statusChanged = data.status && data.status !== robot.status;
    Object.assign(robot, data);
    await robot.save();
    if (statusChanged) await Robot.pushStatus(robot._id, robot.status);
    logAudit(req, 'robot.update', robot.robotId);
    req.app.get('io').emit('robot-status', robot);
    res.json(robot);
  } catch (e) { next(e); }
});

router.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const robot = await Robot.findByIdAndDelete(req.params.id);
    if (!robot) return res.status(404).json({ error: 'Robot not found' });
    logAudit(req, 'robot.delete', robot.robotId);
    req.app.get('io').emit('robot-status', { _id: robot._id, deleted: true });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
