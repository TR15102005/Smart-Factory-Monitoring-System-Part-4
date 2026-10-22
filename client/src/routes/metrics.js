import { Router } from 'express';
import Robot from '../models/Robot.js';
import Worker from '../models/Worker.js';
import Workspace from '../models/Workspace.js';
import SafetyIncident from '../models/SafetyIncident.js';
import ComplianceAudit from '../models/ComplianceAudit.js';
import UtilizationSample from '../models/UtilizationSample.js';
import { buildOccupancyZone } from '../geo.js';

const router = Router();

router.get('/summary', async (req, res, next) => {
  try {
    const [robots, workers, workspaces, incidents24h, openIncidents, audits] = await Promise.all([
      Robot.find(),
      Worker.find(),
      Workspace.find(),
      SafetyIncident.find({ occurredAt: { $gte: new Date(Date.now() - 24 * 3600 * 1000) } }),
      SafetyIncident.countDocuments({ status: { $ne: 'resolved' } }),
      ComplianceAudit.find()
    ]);

    const running = robots.filter(r => r.status === 'running').length;
    const avgUtilization = robots.length
      ? robots.reduce((s, r) => s + r.utilizationRate, 0) / robots.length
      : 0;

    const now = Date.now();
    const expiredCerts = workers.reduce(
      (n, w) => n + w.certifications.filter(c => new Date(c.expiresAt) < now).length, 0);
    const latestByWorkspace = new Map();
    for (const a of audits) {
      const key = String(a.workspace);
      if (!latestByWorkspace.has(key) || latestByWorkspace.get(key).auditDate < a.auditDate) {
        latestByWorkspace.set(key, a);
      }
    }
    const complianceRate = workspaces.length
      ? ([...latestByWorkspace.values()].filter(a => a.status === 'passed' || a.status === 'passed-with-findings').length / workspaces.length) * 100
      : 0;

    const safetyScore = workspaces.length
      ? workspaces.reduce((s, w) => s + w.safetyScore, 0) / workspaces.length
      : 100;

    res.json({
      robots: {
        total: robots.length,
        running,
        idle: robots.filter(r => r.status === 'idle').length,
        maintenance: robots.filter(r => r.status === 'maintenance').length,
        faulted: robots.filter(r => r.status === 'error' || r.status === 'e-stop').length,
        avgUtilization: Math.round(avgUtilization * 10) / 10
      },
      workers: {
        total: workers.length,
        active: workers.filter(w => w.status === 'active').length,
        onBreak: workers.filter(w => w.status === 'break').length,
        expiredCerts,
        safetyTrained: workers.filter(w => w.cobotSafetyTrained).length
      },
      workspaces: {
        total: workspaces.length,
        operational: workspaces.filter(w => w.status === 'operational').length,
        restricted: workspaces.filter(w => w.status === 'restricted').length
      },
      safety: {
        incidents24h: incidents24h.length,
        critical24h: incidents24h.filter(i => i.severity === 'critical' || i.severity === 'high').length,
        openIncidents,
        avgSafetyScore: Math.round(safetyScore * 10) / 10
      },
      compliance: {
        rate: Math.round(complianceRate),
        audits: audits.length,
        failed: [...latestByWorkspace.values()].filter(a => a.status === 'failed').length
      }
    });
  } catch (e) { next(e); }
});

router.get('/utilization', async (req, res, next) => {
  try {
    const hours = Math.min(Number(req.query.hours) || 12, 72);
    const since = new Date(Date.now() - hours * 3600 * 1000);
    const samples = await UtilizationSample.find({ sampledAt: { $gte: since } })
      .sort({ sampledAt: 1 })
      .lean();

    const buckets = new Map();
    const bucketMs = 15 * 60 * 1000;
    for (const s of samples) {
      const key = Math.floor(new Date(s.sampledAt).getTime() / bucketMs) * bucketMs;
      if (!buckets.has(key)) buckets.set(key, { sum: 0, count: 0, running: 0 });
      const b = buckets.get(key);
      b.sum += s.utilization;
      b.count += 1;
      if (s.status === 'running') b.running += 1;
    }
    const series = [...buckets.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([t, b]) => ({
        time: t,
        avgUtilization: Math.round((b.sum / b.count) * 10) / 10,
        activeRatio: Math.round((b.running / b.count) * 100)
      }));

    const byRobot = new Map();
    for (const s of samples) {
      const key = String(s.robot);
      if (!byRobot.has(key)) byRobot.set(key, { sum: 0, count: 0 });
      const r = byRobot.get(key);
      r.sum += s.utilization;
      r.count += 1;
    }
    const robots = await Robot.find().select('robotId model').lean();
    const perRobot = robots
      .filter(r => byRobot.has(String(r._id)))
      .map(r => {
        const b = byRobot.get(String(r._id));
        return { robotId: r.robotId, model: r.model, avgUtilization: Math.round((b.sum / b.count) * 10) / 10 };
      })
      .sort((a, b) => b.avgUtilization - a.avgUtilization);

    res.json({ series, perRobot });
  } catch (e) { next(e); }
});

router.get('/occupancy', async (req, res, next) => {
  try {
    const [workspaces, workers, robots] = await Promise.all([
      Workspace.find(),
      Worker.find({ status: 'active' }),
      Robot.find()
    ]);
    const zones = workspaces.map(ws => buildOccupancyZone(
      ws,
      workers.filter(w => String(w.workspace) === String(ws._id)),
      robots.filter(r => String(r.workspace) === String(ws._id))
    ));
    res.json({ zones });
  } catch (e) { next(e); }
});

router.get('/safety-by-workspace', async (req, res, next) => {
  try {
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const incidents = await SafetyIncident.find({ occurredAt: { $gte: since } }).populate('workspace', 'name zoneCode').lean();
    const workspaces = await Workspace.find().select('name zoneCode safetyScore').lean();
    res.json(workspaces.map(w => ({
      workspace: w.name,
      zoneCode: w.zoneCode,
      safetyScore: w.safetyScore,
      incidents7d: incidents.filter(i => String(i.workspace?._id) === String(w._id)).length
    })));
  } catch (e) { next(e); }
});

export default router;
