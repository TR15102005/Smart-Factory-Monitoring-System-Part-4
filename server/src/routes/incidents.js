import { Router } from 'express';
import SafetyIncident from '../models/SafetyIncident.js';
import { requireRole } from '../auth.js';
import { logAudit } from '../audit.js';

const router = Router();

let counter = Math.floor(Date.now() / 1000);
const nextIncidentId = () => `INC-${(++counter).toString(36).toUpperCase()}`;

router.get('/', async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.severity) filter.severity = req.query.severity;
    if (req.query.workspace) filter.workspace = req.query.workspace;
    if (req.query.type) filter.type = req.query.type;
    if (req.query.from || req.query.to) {
      filter.occurredAt = {};
      if (req.query.from) filter.occurredAt.$gte = new Date(req.query.from);
      if (req.query.to) filter.occurredAt.$lte = new Date(req.query.to);
    }
    if (req.query.q) {
      const q = new RegExp(String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ description: q }, { type: q }, { incidentId: q }];
    }
    const limit = Math.min(Number(req.query.limit) || 50, 500);
    const incidents = await SafetyIncident.find(filter)
      .populate('workspace', 'name zoneCode')
      .populate('robot', 'robotId model name')
      .populate('worker', 'name employeeId')
      .sort({ occurredAt: -1 })
      .limit(limit);
    res.json(incidents);
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const incident = await SafetyIncident.findById(req.params.id)
      .populate('workspace', 'name zoneCode')
      .populate('robot', 'robotId model name')
      .populate('worker', 'name employeeId');
    if (!incident) return res.status(404).json({ error: 'Incident not found' });
    res.json(incident);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const incident = await SafetyIncident.create({
      ...req.body,
      incidentId: req.body.incidentId || nextIncidentId(),
      simulated: false,
      reportedBy: req.user.username
    });
    const populated = await incident.populate('workspace', 'name zoneCode');
    logAudit(req, 'incident.report', incident.incidentId);
    req.app.get('io').emit('incident', populated);
    res.status(201).json(populated);
  } catch (e) { next(e); }
});

router.patch('/:id/acknowledge', requireRole('admin', 'safety_officer'), async (req, res, next) => {
  try {
    const incident = await SafetyIncident.findById(req.params.id);
    if (!incident) return res.status(404).json({ error: 'Incident not found' });
    if (incident.status === 'resolved') return res.status(400).json({ error: 'Incident already resolved' });
    incident.status = 'acknowledged';
    incident.acknowledgedBy = req.user.username;
    incident.acknowledgedAt = new Date();
    await incident.save();
    logAudit(req, 'incident.acknowledge', incident.incidentId);
    req.app.get('io').emit('incident-updated', incident);
    res.json(incident);
  } catch (e) { next(e); }
});

router.patch('/:id/resolve', requireRole('admin', 'safety_officer'), async (req, res, next) => {
  try {
    const incident = await SafetyIncident.findById(req.params.id);
    if (!incident) return res.status(404).json({ error: 'Incident not found' });
    incident.status = 'resolved';
    incident.resolutionNotes = req.body.resolutionNotes || 'Resolved by safety officer';
    incident.resolvedAt = new Date();
    if (!incident.acknowledgedBy) {
      incident.acknowledgedBy = req.user.username;
      incident.acknowledgedAt = new Date();
    }
    await incident.save();
    logAudit(req, 'incident.resolve', incident.incidentId);
    req.app.get('io').emit('incident-updated', incident);
    res.json(incident);
  } catch (e) { next(e); }
});

export default router;
