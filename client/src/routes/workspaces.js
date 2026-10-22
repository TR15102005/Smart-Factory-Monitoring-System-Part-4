import { Router } from 'express';
import Workspace from '../models/Workspace.js';
import Robot from '../models/Robot.js';
import Worker from '../models/Worker.js';
import SafetyIncident from '../models/SafetyIncident.js';
import ComplianceAudit from '../models/ComplianceAudit.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const workspaces = await Workspace.find().sort({ zoneCode: 1 });
    const robots = await Robot.find();
    const workers = await Worker.find();
    const incidents = await SafetyIncident.find({ status: { $ne: 'resolved' } });
    const audits = await ComplianceAudit.find();

    const byWs = id => String(id);
    const result = workspaces.map(w => {
      const wRobots = robots.filter(r => byWs(r.workspace) === byWs(w._id));
      const wWorkers = workers.filter(x => byWs(x.workspace) === byWs(w._id));
      const openIncidents = incidents.filter(i => byWs(i.workspace) === byWs(w._id));
      const wAudits = audits.filter(a => byWs(a.workspace) === byWs(w._id));
      return {
        ...w.toJSON(),
        robots: wRobots,
        workers: wWorkers,
        openIncidents: openIncidents.length,
        latestAudit: wAudits.sort((a, b) => b.auditDate - a.auditDate)[0] || null
      };
    });
    res.json(result);
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const workspace = await Workspace.findById(req.params.id);
    if (!workspace) return res.status(404).json({ error: 'Workspace not found' });
    const robots = await Robot.find({ workspace: workspace._id });
    const workers = await Worker.find({ workspace: workspace._id });
    res.json({ ...workspace.toJSON(), robots, workers });
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const workspace = await Workspace.create(req.body);
    res.status(201).json(workspace);
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const workspace = await Workspace.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!workspace) return res.status(404).json({ error: 'Workspace not found' });
    res.json(workspace);
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const workspace = await Workspace.findByIdAndDelete(req.params.id);
    if (!workspace) return res.status(404).json({ error: 'Workspace not found' });
    res.json({ deleted: true });
  } catch (e) { next(e); }
});

export default router;
