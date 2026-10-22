import { Router } from 'express';
import Robot from '../models/Robot.js';
import Worker from '../models/Worker.js';
import Workspace from '../models/Workspace.js';
import SafetyIncident from '../models/SafetyIncident.js';
import UtilizationSample from '../models/UtilizationSample.js';
import { buildOccupancyZone } from '../geo.js';

const router = Router();

const rangeFilter = (req, field = 'sampledAt') => {
  const hours = Math.min(Number(req.query.hours) || 24, 24 * 14);
  const from = req.query.from ? new Date(req.query.from) : new Date(Date.now() - hours * 3600 * 1000);
  const to = req.query.to ? new Date(req.query.to) : new Date();
  return { [field]: { $gte: from, $lte: to } };
};

router.get('/overview', async (req, res, next) => {
  try {
    const [robots, workers, workspaces, openAlerts] = await Promise.all([
      Robot.find(), Worker.find(), Workspace.find(),
      SafetyIncident.countDocuments({ status: { $ne: 'resolved' } })
    ]);
    const byStatus = {};
    for (const r of robots) byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    const since = new Date(Date.now() - 3600 * 1000);
    const samples = await UtilizationSample.find({ sampledAt: { $gte: since } });
    const avgUtil = samples.length ? samples.reduce((s, x) => s + x.utilization, 0) / samples.length : 0;
    res.json({
      workstations: workspaces.length,
      workers: workers.length,
      workersActive: workers.filter(w => w.status === 'active').length,
      robots: robots.length,
      robotsByStatus: byStatus,
      running: byStatus.running || 0,
      idle: byStatus.idle || 0,
      faulty: (byStatus.error || 0) + (byStatus['e-stop'] || 0),
      charging: byStatus.charging || 0,
      warning: byStatus.warning || 0,
      activeAlerts: openAlerts,
      avgSafetyScore: workspaces.length
        ? Math.round((workspaces.reduce((s, w) => s + w.safetyScore, 0) / workspaces.length) * 10) / 10
        : 0,
      avgUtilization: Math.round(avgUtil * 10) / 10
    });
  } catch (e) { next(e); }
});

router.get('/robot-utilization', async (req, res, next) => {
  try {
    const filter = { ...rangeFilter(req) };
    if (req.query.workspace) filter.workspace = req.query.workspace;
    const samples = await UtilizationSample.find(filter).sort({ sampledAt: 1 });
    const buckets = new Map();
    for (const s of samples) {
      const key = new Date(Math.floor(s.sampledAt.getTime() / 3600000) * 3600000).toISOString();
      const b = buckets.get(key) || { at: key, total: 0, n: 0 };
      b.total += s.utilization; b.n += 1;
      buckets.set(key, b);
    }
    const series = [...buckets.values()].map(b => ({ at: b.at, utilization: Math.round((b.total / b.n) * 10) / 10 }));

    const perRobot = await UtilizationSample.aggregate([
      { $match: filter },
      { $group: { _id: '$robot', avg: { $avg: '$utilization' }, samples: { $sum: 1 } } },
      { $sort: { avg: -1 } }
    ]);
    const robots = await Robot.find().select('robotId name');
    const names = new Map(robots.map(r => [String(r._id), r.robotId]));
    res.json({
      series,
      perRobot: perRobot.map(p => ({
        robotId: names.get(String(p._id)) || 'unknown',
        utilization: Math.round(p.avg * 10) / 10
      }))
    });
  } catch (e) { next(e); }
});

router.get('/occupancy', async (req, res, next) => {
  try {
    const [workspaces, workers, robots] = await Promise.all([
      Workspace.find(), Worker.find({ status: 'active' }), Robot.find()
    ]);
    res.json(workspaces.map(ws => buildOccupancyZone(
      ws,
      workers.filter(w => String(w.workspace) === String(ws._id)),
      robots.filter(r => String(r.workspace) === String(ws._id))
    )).map(z => ({
      zoneCode: z.zoneCode, name: z.name, occupancy: z.occupancy,
      maxOccupancy: z.maxOccupancy, status: z.status, safetyScore: z.safetyScore
    })));
  } catch (e) { next(e); }
});

router.get('/safety-incidents', async (req, res, next) => {
  try {
    const days = Math.min(Number(req.query.days) || 14, 90);
    const filter = { occurredAt: { $gte: new Date(Date.now() - days * 24 * 3600 * 1000) } };
    if (req.query.workspace) filter.workspace = req.query.workspace;
    const incidents = await SafetyIncident.find(filter).select('type severity occurredAt workspace');
    const daily = new Map();
    const weekly = new Map();
    const byType = new Map();
    for (const i of incidents) {
      const day = i.occurredAt.toISOString().slice(0, 10);
      const week = `W${Math.floor(i.occurredAt.getTime() / (7 * 24 * 3600 * 1000))}`;
      const d = daily.get(day) || { date: day, low: 0, medium: 0, high: 0, critical: 0, total: 0 };
      d[i.severity] += 1; d.total += 1;
      daily.set(day, d);
      weekly.set(week, (weekly.get(week) || 0) + 1);
      byType.set(i.type, (byType.get(i.type) || 0) + 1);
    }
    res.json({
      daily: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)),
      weekly: [...weekly.entries()].map(([week, count]) => ({ week, count })),
      byType: [...byType.entries()].map(([type, count]) => ({ type, count }))
    });
  } catch (e) { next(e); }
});

router.get('/robot-hours', async (req, res, next) => {
  try {
    const robots = await Robot.find().select('robotId name operatingHours kind').sort({ operatingHours: -1 });
    res.json(robots.map(r => ({
      robotId: r.robotId, name: r.name, kind: r.kind,
      operatingHours: Math.round(r.operatingHours * 10) / 10
    })));
  } catch (e) { next(e); }
});

router.get('/fault-frequency', async (req, res, next) => {
  try {
    const filter = {
      type: { $in: ['equipment-fault', 'e-stop-triggered', 'comm-timeout', 'abnormal-condition'] },
      ...rangeFilter(req, 'occurredAt')
    };
    const grouped = await SafetyIncident.aggregate([
      { $match: filter },
      { $group: { _id: '$robot', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    const robots = await Robot.find().select('robotId name');
    const names = new Map(robots.map(r => [String(r._id), r.robotId]));
    res.json(grouped
      .filter(g => g._id)
      .map(g => ({ robotId: names.get(String(g._id)) || 'unknown', faults: g.count })));
  } catch (e) { next(e); }
});

router.get('/workspace-safety', async (req, res, next) => {
  try {
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const [workspaces, incidents] = await Promise.all([
      Workspace.find().select('zoneCode name safetyScore status'),
      SafetyIncident.find({ occurredAt: { $gte: since } }).select('workspace severity')
    ]);
    res.json(workspaces.map(ws => ({
      zoneCode: ws.zoneCode,
      name: ws.name,
      safetyScore: ws.safetyScore,
      status: ws.status,
      incidents7d: incidents.filter(i => String(i.workspace) === String(ws._id)).length
    })));
  } catch (e) { next(e); }
});

export default router;
