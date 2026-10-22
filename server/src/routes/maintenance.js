import { Router } from 'express';
import Robot from '../models/Robot.js';
import MaintenanceRecord from '../models/MaintenanceRecord.js';
import SafetyIncident from '../models/SafetyIncident.js';
import { getSettings } from '../models/Settings.js';
import { requireRole } from '../auth.js';
import { logAudit } from '../audit.js';

const router = Router();

const OPERATING_HOURS_LIMIT = 500;
const REPEATED_FAULTS = 3;
const SERVICE_INTERVAL_DAYS = 30;

router.get('/', async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.robot) filter.robot = req.query.robot;
    if (req.query.status) filter.status = req.query.status;
    const records = await MaintenanceRecord.find(filter)
      .populate('robot', 'robotId name model')
      .sort({ updatedAt: -1 })
      .limit(200);
    res.json(records);
  } catch (e) { next(e); }
});

router.get('/predictions', async (req, res, next) => {
  try {
    const settings = await getSettings();
    const th = settings.thresholds;
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const [robots, faults] = await Promise.all([
      Robot.find().populate('workspace', 'zoneCode name'),
      SafetyIncident.find({ occurredAt: { $gte: since }, type: { $in: ['equipment-fault', 'e-stop-triggered', 'abnormal-condition', 'comm-timeout'] } })
    ]);
    const faultCount = new Map();
    for (const f of faults) {
      if (!f.robot) continue;
      faultCount.set(String(f.robot), (faultCount.get(String(f.robot)) || 0) + 1);
    }

    const predictions = robots.map(robot => {
      const conditions = [];
      const faults30d = faultCount.get(String(robot._id)) || 0;
      const overdue = robot.nextMaintenanceDue && new Date(robot.nextMaintenanceDue) < new Date();

      if (robot.operatingHours > OPERATING_HOURS_LIMIT) {
        conditions.push({
          rule: 'Operating hours above configured threshold',
          severity: robot.operatingHours > OPERATING_HOURS_LIMIT * 1.2 ? 'high' : 'medium',
          data: `${Math.round(robot.operatingHours)}h (limit ${OPERATING_HOURS_LIMIT}h)`
        });
      }
      if (faults30d >= REPEATED_FAULTS) {
        conditions.push({
          rule: 'Repeated faults in last 30 days',
          severity: faults30d >= REPEATED_FAULTS * 2 ? 'high' : 'medium',
          data: `${faults30d} fault events`
        });
      }
      if (overdue) {
        conditions.push({
          rule: 'Maintenance overdue',
          severity: 'high',
          data: `due ${new Date(robot.nextMaintenanceDue).toISOString().slice(0, 10)}`
        });
      }
      if (robot.kind === 'agv' && robot.batteryPercent < th.lowBatteryPct + 10) {
        conditions.push({
          rule: 'Battery condition degraded',
          severity: 'low',
          data: `${Math.round(robot.batteryPercent)}% charge`
        });
      }
      if (robot.temperatureC > th.tempLimitC) {
        conditions.push({
          rule: 'Sensor reading above configured limit',
          severity: 'medium',
          data: `${robot.temperatureC.toFixed(1)}C (limit ${th.tempLimitC}C)`
        });
      }

      const severity = conditions.some(c => c.severity === 'high') ? 'high'
        : conditions.some(c => c.severity === 'medium') ? 'medium'
        : conditions.length ? 'low' : 'none';

      return {
        robot: robot._id,
        robotId: robot.robotId,
        name: robot.name,
        workspace: robot.workspace,
        operatingHours: Math.round(robot.operatingHours * 10) / 10,
        batteryPercent: Math.round(robot.batteryPercent),
        temperatureC: Math.round(robot.temperatureC * 10) / 10,
        faults30d,
        lastMaintenance: robot.lastMaintenance,
        nextMaintenanceDue: robot.nextMaintenanceDue,
        conditions,
        severity,
        recommendation: !conditions.length
          ? 'No action required — continue scheduled service interval.'
          : severity === 'high'
            ? 'Schedule corrective inspection before next production shift.'
            : 'Plan inspection at the next maintenance window.',
        status: overdue ? 'overdue' : conditions.length ? 'attention' : 'healthy',
        simulated: true
      };
    }).sort((a, b) => ({ high: 0, medium: 1, low: 2, none: 3 }[a.severity]) - ({ high: 0, medium: 1, low: 2, none: 3 }[b.severity]));

    res.json(predictions);
  } catch (e) { next(e); }
});

router.post('/', requireRole('admin'), async (req, res, next) => {
  try {
    const { robot, type, status, performedAt, dueAt, notes, technician } = req.body || {};
    if (!robot || !type) return res.status(400).json({ error: 'robot and type are required' });
    if (!(await Robot.exists({ _id: robot }))) return res.status(400).json({ error: 'Unknown robot' });
    const record = await MaintenanceRecord.create({ robot, type, status, performedAt, dueAt, notes, technician, simulated: false });
    if (status === 'completed' && performedAt) {
      await Robot.findByIdAndUpdate(robot, {
        lastMaintenance: performedAt,
        nextMaintenanceDue: dueAt || new Date(new Date(performedAt).getTime() + SERVICE_INTERVAL_DAYS * 24 * 3600 * 1000)
      });
    }
    logAudit(req, 'maintenance.create', String(robot));
    res.status(201).json(record);
  } catch (e) { next(e); }
});

router.patch('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const allowed = ['type', 'status', 'performedAt', 'dueAt', 'notes', 'technician'];
    const data = Object.fromEntries(Object.entries(req.body || {}).filter(([k]) => allowed.includes(k)));
    const record = await MaintenanceRecord.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true });
    if (!record) return res.status(404).json({ error: 'Maintenance record not found' });
    if (record.status === 'completed' && record.performedAt) {
      await Robot.findByIdAndUpdate(record.robot, {
        lastMaintenance: record.performedAt,
        nextMaintenanceDue: record.dueAt || new Date(new Date(record.performedAt).getTime() + SERVICE_INTERVAL_DAYS * 24 * 3600 * 1000)
      });
    }
    logAudit(req, 'maintenance.update', String(record._id));
    res.json(record);
  } catch (e) { next(e); }
});

export default router;
