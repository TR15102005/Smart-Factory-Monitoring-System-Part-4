import mongoose from 'mongoose';
import { connectDB } from './db.js';
import User from './models/User.js';
import Workspace from './models/Workspace.js';
import Robot from './models/Robot.js';
import Worker from './models/Worker.js';
import SafetyIncident from './models/SafetyIncident.js';
import ComplianceAudit from './models/ComplianceAudit.js';
import UtilizationSample from './models/UtilizationSample.js';
import MaintenanceRecord from './models/MaintenanceRecord.js';
import { getSettings } from './models/Settings.js';
import { hashPassword } from './auth.js';
import { areaCenter, randomPointIn } from './geo.js';

export const DEFAULT_ADMIN = { username: 'admin', password: 'admin123' };
export const DEFAULT_SAFETY_OFFICER = { username: 'safety', password: 'safety123' };

export async function ensureAdmin() {
  if (!(await User.exists({ username: DEFAULT_ADMIN.username }))) {
    await User.create({
      username: DEFAULT_ADMIN.username,
      fullName: 'System Administrator',
      role: 'admin',
      passwordHash: await hashPassword(DEFAULT_ADMIN.password)
    });
    console.log(`[seed] default admin created (${DEFAULT_ADMIN.username} / ${DEFAULT_ADMIN.password})`);
  }
  if (!(await User.exists({ username: DEFAULT_SAFETY_OFFICER.username }))) {
    await User.create({
      username: DEFAULT_SAFETY_OFFICER.username,
      fullName: 'Safety Officer',
      role: 'safety_officer',
      passwordHash: await hashPassword(DEFAULT_SAFETY_OFFICER.password)
    });
    console.log(`[seed] demo safety officer created (${DEFAULT_SAFETY_OFFICER.username} / ${DEFAULT_SAFETY_OFFICER.password})`);
  }
}

const rand = (min, max) => min + Math.random() * (max - min);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

export async function seed({ force = false } = {}) {
  await ensureAdmin();
  await getSettings();
  const existing = await Workspace.countDocuments();
  if (existing > 0 && !force) {
    console.log('[seed] data already present, skipping');
    return false;
  }
  if (force) {
    await Promise.all([
      Workspace.deleteMany({}), Robot.deleteMany({}), Worker.deleteMany({}),
      SafetyIncident.deleteMany({}), ComplianceAudit.deleteMany({}), UtilizationSample.deleteMany({}),
      MaintenanceRecord.deleteMany({})
    ]);
  }

  const workspaceDefs = [
    { name: 'Cobot Assembly Line A', zoneCode: 'WS-A1', type: 'assembly', collaborationMode: 'power-force-limiting', maxOccupancy: 12, floorAreaSqm: 220, safetyScore: 96 },
    { name: 'Welding Cell Block', zoneCode: 'WS-B2', type: 'welding', collaborationMode: 'speed-separation-monitoring', maxOccupancy: 6, floorAreaSqm: 150, safetyScore: 88 },
    { name: 'Packaging & Palletizing', zoneCode: 'WS-C3', type: 'packaging', collaborationMode: 'safety-rated-monitored-stop', maxOccupancy: 10, floorAreaSqm: 300, safetyScore: 93 },
    { name: 'Vision Inspection Bay', zoneCode: 'WS-D4', type: 'quality-inspection', collaborationMode: 'hand-guiding', maxOccupancy: 8, floorAreaSqm: 120, safetyScore: 99 },
    { name: 'AGV Logistics Loop', zoneCode: 'WS-E5', type: 'material-handling', collaborationMode: 'speed-separation-monitoring', maxOccupancy: 15, floorAreaSqm: 500, safetyScore: 84 },
    { name: 'CNC Tending Cell', zoneCode: 'WS-F6', type: 'cnc-loading', collaborationMode: 'power-force-limiting', maxOccupancy: 4, floorAreaSqm: 90, safetyScore: 91 }
  ];
  const workspaces = await Workspace.insertMany(workspaceDefs);

  const robotDefs = [
    { ws: 0, ids: [['UR10e', 'universal-robots', 'cobot'], ['UR5e', 'universal-robots', 'cobot'], ['CRX-25iA', 'fanuc', 'cobot']] },
    { ws: 1, ids: [['ARC Mate 100iD', 'fanuc', 'industrial-arm'], ['IRB 1520ID', 'abb', 'industrial-arm']] },
    { ws: 2, ids: [['LBR iiwa 14', 'kuka', 'cobot'], ['GoFa CRB 15000', 'abb', 'cobot'], ['MiR250', 'mobile-industrial-robots', 'agv']] },
    { ws: 3, ids: [['CR-15iA', 'fanuc', 'cobot'], ['UR3e', 'universal-robots', 'cobot']] },
    { ws: 4, ids: [['MiR600', 'mobile-industrial-robots', 'agv'], ['MiR600', 'mobile-industrial-robots', 'agv'], ['LD-250', 'omron', 'agv'], ['GoFa CRB 15000', 'abb', 'cobot']] },
    { ws: 5, ids: [['CRX-10iA', 'fanuc', 'cobot'], ['LBR iiwa 7', 'kuka', 'cobot']] }
  ];

  const robots = [];
  let n = 1;
  for (const def of robotDefs) {
    for (const [model, vendor, kind] of def.ids) {
      const status = pick(['running', 'running', 'running', 'idle', 'idle', 'maintenance']);
      robots.push({
        robotId: `RB-${String(n).padStart(3, '0')}`,
        name: `${kind === 'agv' ? 'AGV' : kind === 'industrial-arm' ? 'Industrial Arm' : 'Cobot'} ${n}`,
        model, vendor, kind,
        workspace: workspaces[def.ws]._id,
        status,
        currentTask: status === 'running' ? pick(['bin picking', 'screw driving', 'palletizing', 'machine tending', 'seam welding', 'vision inspection']) : null,
        utilizationRate: status === 'running' ? Math.round(rand(45, 95)) : 0,
        cyclesPerHour: status === 'running' ? Math.round(rand(40, 110)) : 0,
        temperatureC: Math.round(rand(32, 58) * 10) / 10,
        batteryPercent: kind === 'agv' ? Math.round(rand(35, 95)) : 100,
        operatingHours: Math.round(rand(120, 900) * 10) / 10,
        lastCommAt: new Date(),
        lastMaintenance: new Date(Date.now() - rand(5, 60) * 24 * 3600 * 1000),
        nextMaintenanceDue: new Date(Date.now() + rand(-5, 45) * 24 * 3600 * 1000),
        firmware: `${Math.floor(rand(2, 5))}.${Math.floor(rand(0, 9))}.${Math.floor(rand(0, 9))}`
      });
      n += 1;
    }
  }
  const createdRobots = await Robot.insertMany(robots);

  const names = ['Ana Sousa', 'Liam Chen', 'Priya Sharma', 'Marcus Webb', 'Elena Petrova', 'Tomás García',
    'Yuki Tanaka', 'Omar Haddad', 'Sofia Rossi', 'Daniel Kim', 'Grace Okafor', 'Jonas Meyer',
    'Maya Cohen', 'Viktor Novak', 'Isla Murphy', 'Hassan Ali'];
  const roles = ['Cobot Operator', 'Line Technician', 'Quality Inspector', 'Safety Officer', 'Maintenance Engineer', 'Logistics Operator'];
  const departments = ['Assembly', 'Welding', 'Packaging', 'Quality', 'Logistics', 'Maintenance'];
  const workers = names.map((name, i) => {
    const certValid = Math.random() > 0.25;
    const ws = workspaces[i % workspaces.length];
    return {
      employeeId: `EMP-${1000 + i}`,
      name,
      role: roles[i % roles.length],
      department: departments[i % departments.length],
      shift: ['morning', 'evening', 'night'][i % 3],
      workspace: ws._id,
      status: pick(['active', 'active', 'active', 'break', 'offline', 'training']),
      cobotSafetyTrained: Math.random() > 0.2,
      lastActivityAt: new Date(Date.now() - rand(0, 4) * 3600 * 1000),
      events: [{ type: 'entry', workspace: ws._id, zoneCode: ws.zoneCode, at: new Date(Date.now() - rand(2, 10) * 3600 * 1000) }],
      certifications: [
        { name: 'Cobot Safety Operation (ISO/TS 15066)', issuedAt: new Date(Date.now() - 200 * 24 * 3600 * 1000), expiresAt: new Date(Date.now() + (certValid ? rand(60, 400) : rand(-30, -1)) * 24 * 3600 * 1000), status: certValid ? 'valid' : 'expired' },
        ...(i % 3 === 0 ? [{ name: 'Lockout/Tagout Authorized', issuedAt: new Date(Date.now() - 100 * 24 * 3600 * 1000), expiresAt: new Date(Date.now() + rand(20, 200) * 24 * 3600 * 1000), status: 'valid' }] : [])
      ]
    };
  });
  const createdWorkers = await Worker.insertMany(workers);

  // Zone layouts (32m x 20m floor plans) with robot cells, walkway, workstations
  for (const ws of workspaces) {
    const wsRobots = createdRobots.filter(r => String(r.workspace) === String(ws._id));
    const arms = wsRobots.filter(r => r.kind !== 'agv');
    const areas = [];
    for (let i = 0; i < 4; i++) {
      const robot = arms[i];
      areas.push({
        areaId: `cell-${i + 1}`,
        label: robot ? `${robot.robotId} cell` : `Cell ${i + 1}`,
        kind: 'robot-cell',
        x: 1 + i * 7.5, y: 1, w: 6, h: 6,
        robot: robot ? robot._id : null
      });
    }
    areas.push({ areaId: 'walkway', label: 'Main walkway', kind: 'walkway', x: 1, y: 8.5, w: 30, h: 3 });
    for (let i = 0; i < 3; i++) {
      areas.push({ areaId: `ws-${i + 1}`, label: `Workstation ${i + 1}`, kind: 'workstation', x: 1 + i * 7.5, y: 13, w: 6, h: 5 });
    }
    areas.push({ areaId: 'staging', label: 'Staging', kind: 'staging', x: 24, y: 13, w: 4, h: 5 });
    areas.push({ areaId: 'restricted', label: 'Restricted', kind: 'restricted', x: 28.5, y: 13, w: 2.5, h: 5 });
    areas.push({ areaId: 'charging', label: 'AGV charging', kind: 'charging', x: 25.5, y: 1, w: 5.5, h: 6 });
    ws.layout = { widthM: 32, heightM: 20, areas };
    await ws.save();

    const walkway = areas.find(a => a.areaId === 'walkway');
    for (const r of wsRobots) {
      if (r.kind === 'agv') {
        r.position = randomPointIn(walkway);
      } else {
        const cell = areas.find(a => a.robot && String(a.robot) === String(r._id));
        r.position = cell ? areaCenter(cell) : areaCenter(areas[0]);
      }
      await r.save();
    }
  }

  const walkableKinds = ['walkway', 'workstation', 'staging'];
  for (const w of createdWorkers) {
    if (!w.workspace) continue;
    const ws = workspaces.find(x => String(x._id) === String(w.workspace));
    const walkables = (ws?.layout?.areas || []).filter(a => walkableKinds.includes(a.kind));
    if (walkables.length) w.position = randomPointIn(pick(walkables));
    await w.save();
  }

  const incidentTypes = ['near-miss', 'zone-intrusion', 'e-stop-triggered', 'force-limit-exceeded', 'equipment-fault', 'ergonomic-risk'];
  const severities = ['low', 'low', 'medium', 'medium', 'high', 'critical'];
  const incidents = [];
  for (let i = 0; i < 40; i++) {
    const ws = pick(workspaces);
    const occurredAt = new Date(Date.now() - rand(0.5, 168) * 3600 * 1000);
    const severity = pick(severities);
    incidents.push({
      incidentId: `INC-${String(1000 + i)}`,
      workspace: ws._id,
      robot: pick(createdRobots)._id,
      type: pick(incidentTypes),
      severity,
      description: 'Auto-recorded by safety monitoring system',
      recommendedResponse: 'Review the zone and confirm safe operation before resuming.',
      simulated: true,
      reportedBy: pick(['safety-scanner', 'robot-controller', 'supervisor']),
      status: occurredAt < new Date(Date.now() - 48 * 3600 * 1000) ? 'resolved' : pick(['open', 'investigating', 'resolved']),
      occurredAt
    });
  }
  await SafetyIncident.insertMany(incidents);

  const standards = ['ISO 10218-1', 'ISO/TS 15066', 'ISO 13849-1', 'OSHA 1910.212', 'ANSI/RIA R15.08'];
  const audits = workspaces.map((ws, i) => {
    const items = standards.slice(0, 3).map(s => ({
      requirement: `${s} collaborative operation requirements`,
      compliant: Math.random() > 0.15,
      notes: ''
    }));
    const allOk = items.every(x => x.compliant);
    return {
      workspace: ws._id,
      standard: standards[i % standards.length],
      items,
      status: allOk ? 'passed' : 'passed-with-findings',
      auditor: pick(['M. Rivera (TÜV)', 'K. Osei (internal)', 'J. Lindqvist (SGS)']),
      auditDate: new Date(Date.now() - rand(10, 120) * 24 * 3600 * 1000),
      nextAuditDate: new Date(Date.now() + rand(30, 300) * 24 * 3600 * 1000)
    };
  });
  await ComplianceAudit.insertMany(audits);

  // Maintenance history per robot (completed past service + scheduled/overdue next service)
  const maintenance = [];
  for (const robot of createdRobots) {
    maintenance.push({
      robot: robot._id,
      type: pick(['scheduled', 'inspection']),
      status: 'completed',
      performedAt: robot.lastMaintenance,
      notes: 'Routine service: joints, brakes, and safety functions checked.',
      technician: pick(['M. Weber', 'T. Osei', 'K. Ito']),
      simulated: true
    });
    if (Math.random() > 0.6) {
      maintenance.push({
        robot: robot._id,
        type: 'corrective',
        status: 'completed',
        performedAt: new Date(robot.lastMaintenance.getTime() + rand(1, 10) * 24 * 3600 * 1000),
        notes: 'Replaced worn tooling interface and re-taught waypoints.',
        technician: pick(['M. Weber', 'T. Osei', 'K. Ito']),
        simulated: true
      });
    }
    maintenance.push({
      robot: robot._id,
      type: 'scheduled',
      status: robot.nextMaintenanceDue < new Date() ? 'overdue' : 'scheduled',
      dueAt: robot.nextMaintenanceDue,
      notes: 'Next planned service per 30-day interval.',
      simulated: true
    });
  }
  await MaintenanceRecord.insertMany(maintenance);

  // 24h of historical telemetry at 15-min granularity
  const samples = [];
  const now = Date.now();
  for (const robot of createdRobots) {
    for (let t = now - 24 * 3600 * 1000; t < now; t += 15 * 60 * 1000) {
      const hour = new Date(t).getHours();
      const shiftFactor = hour >= 6 && hour < 22 ? 1 : 0.3;
      const utilization = Math.min(100, Math.max(0, rand(30, 90) * shiftFactor));
      samples.push({
        robot: robot._id,
        workspace: robot.workspace,
        utilization: Math.round(utilization),
        status: utilization > 5 ? 'running' : 'idle',
        temperatureC: Math.round(rand(32, 60) * 10) / 10,
        cyclesPerHour: Math.round(utilization * rand(0.9, 1.3)),
        sampledAt: new Date(t)
      });
    }
  }
  await UtilizationSample.insertMany(samples);

  console.log(`[seed] created ${workspaces.length} workspaces, ${createdRobots.length} robots, ${workers.length} workers, ${incidents.length} incidents, ${audits.length} audits, ${samples.length} telemetry samples`);
  return true;
}

const isDirectRun = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (isDirectRun) {
  await connectDB();
  await seed({ force: process.argv.includes('--force') });
  await mongoose.disconnect();
}
