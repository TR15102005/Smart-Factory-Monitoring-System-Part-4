import Robot from './models/Robot.js';
import Workspace from './models/Workspace.js';
import Worker from './models/Worker.js';
import SafetyIncident from './models/SafetyIncident.js';
import UtilizationSample from './models/UtilizationSample.js';
import { getSettings } from './models/Settings.js';
import { hazardAreaAt, randomPointIn, clampToLayout, buildOccupancyZone } from './geo.js';

const DEFAULT_TICK_MS = 3000;
let incidentSeq = 0;

const TASKS = [
  'bin picking', 'screw driving', 'palletizing', 'machine tending',
  'seam welding', 'vision inspection', 'kit assembly', 'deburring', 'box sealing'
];

const RESPONSES = {
  'zone-intrusion': 'Slow or stop the robot, guide the worker out of the protective field, and review access boundaries.',
  'near-miss': 'Increase separation monitoring and verify the worker path keeps the configured distance from the robot.',
  'e-stop-triggered': 'Inspect the cell, confirm no personnel injury, then reset the e-stop from the robot controller.',
  'equipment-fault': 'Take the robot out of service and schedule corrective maintenance.',
  'force-limit-exceeded': 'Review collaborative force limits and padding around the contact point.',
  'over-capacity': 'Reduce the number of occupants in the zone to the posted maximum capacity.',
  'low-battery': 'Route the AGV to the charging station and verify charging contact.',
  'comm-timeout': 'Check the network link to the robot controller and treat the robot as unavailable until communication recovers.',
  'abnormal-condition': 'Reduce load or speed, inspect cooling, and verify sensor readings.',
  collision: 'Stop operation immediately and inspect robot and fixture for damage.',
  'ergonomic-risk': 'Review task layout, reach heights, and worker rotation schedule.'
};

const rand = (min, max) => min + Math.random() * (max - min);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const dist = (a, b) => Math.hypot((a.x ?? 0) - (b.x ?? 0), (a.y ?? 0) - (b.y ?? 0));

// Simulation runtime state (start / pause / resume / stop / reset / speed)
const sim = {
  state: 'running',
  tickMs: DEFAULT_TICK_MS,
  timer: null,
  io: null,
  conditions: new Map()
};

export function simulationStatus() {
  return { state: sim.state, tickMs: sim.tickMs, simulated: true };
}

function broadcastSim() {
  sim.io?.emit('simulation', simulationStatus());
}

function armTimer() {
  clearInterval(sim.timer);
  sim.timer = setInterval(tickOnce, sim.tickMs);
}

export const simulationControl = {
  start() {
    if (sim.state === 'running') return simulationStatus();
    sim.state = 'running';
    armTimer();
    broadcastSim();
    return simulationStatus();
  },
  pause() {
    if (sim.state !== 'running') return simulationStatus();
    sim.state = 'paused';
    clearInterval(sim.timer);
    sim.timer = null;
    broadcastSim();
    return simulationStatus();
  },
  resume() {
    return simulationControl.start();
  },
  stop() {
    sim.state = 'stopped';
    clearInterval(sim.timer);
    sim.timer = null;
    broadcastSim();
    return simulationStatus();
  },
  async reset() {
    await Robot.updateMany({}, {
      $set: {
        status: 'idle', utilizationRate: 0, temperatureC: 35, batteryPercent: 100,
        commLost: false, lastCommAt: new Date(), currentTask: null
      }
    });
    sim.conditions.clear();
    if (sim.state === 'running') armTimer();
    broadcastSim();
    return simulationStatus();
  },
  setSpeed(tickMs) {
    const ms = Math.min(10000, Math.max(500, Number(tickMs) || DEFAULT_TICK_MS));
    sim.tickMs = ms;
    if (sim.state === 'running') armTimer();
    broadcastSim();
    return simulationStatus();
  }
};

async function recordIncident(io, { robot, workspace, worker, type, severity, description, conditionKey }) {
  if (conditionKey) {
    if (sim.conditions.has(conditionKey)) return;
    sim.conditions.set(conditionKey, true);
  }
  incidentSeq += 1;
  const incident = await SafetyIncident.create({
    incidentId: `INC-SIM-${Date.now().toString(36).toUpperCase()}-${incidentSeq}`,
    workspace: workspace._id,
    robot: robot?._id || null,
    worker: worker?._id || null,
    type,
    severity,
    description,
    recommendedResponse: RESPONSES[type] || 'Review the zone and confirm safe operation before resuming.',
    simulated: true,
    reportedBy: type === 'zone-intrusion' ? 'safety-scanner' : 'rule-engine'
  });
  if (severity === 'high' || severity === 'critical') {
    workspace.safetyScore = Math.max(0, workspace.safetyScore - (severity === 'critical' ? 8 : 4));
    workspace.status = 'restricted';
    await workspace.save();
    io.emit('workspace-updated', workspace);
  }
  const populated = await incident.populate('workspace', 'name zoneCode');
  io.emit('incident', populated);
}

async function tickOnce() {
  const io = sim.io;
  try {
    const settings = await getSettings();
    const th = settings.thresholds;
    const now = Date.now();
    const robots = await Robot.find().populate('workspace');
    if (!robots.length) return;

    const updates = [];
    const samples = [];
    const incidentEvents = [];
    const activeConditions = new Set();
    const condition = (key) => activeConditions.add(key);

    for (const robot of robots) {
      const ws = robot.workspace;
      const prevStatus = robot.status;

      // Communication watchdog
      if (robot.commLost) {
        if (Math.random() < 0.3) {
          robot.commLost = false;
          robot.lastCommAt = new Date();
        } else if (now - new Date(robot.lastCommAt).getTime() > th.commTimeoutS * 1000) {
          condition(`comm:${robot._id}`);
          incidentEvents.push(() => recordIncident(io, {
            robot, workspace: ws, type: 'comm-timeout', severity: 'medium',
            description: `No telemetry from ${robot.robotId} for ${th.commTimeoutS}s (simulated link loss)`,
            conditionKey: `comm:${robot._id}`
          }));
        }
      } else {
        if (Math.random() < 0.008) robot.commLost = true;
        else robot.lastCommAt = new Date();
      }

      if (robot.status === 'maintenance') {
        if (Math.random() < 0.1) robot.status = 'idle';
      } else if (robot.status === 'e-stop' || robot.status === 'error') {
        if (robot.status === 'error') {
          condition(`fault:${robot._id}`);
          incidentEvents.push(() => recordIncident(io, {
            robot, workspace: ws, type: 'equipment-fault', severity: 'medium',
            description: `${robot.robotId} reports an active drive/servo fault`,
            conditionKey: `fault:${robot._id}`
          }));
        }
        if (Math.random() < 0.15) {
          robot.status = 'idle';
          robot.utilizationRate = 0;
        }
      } else if (robot.status === 'charging') {
        robot.batteryPercent = Math.min(100, robot.batteryPercent + 2.5);
        if (robot.batteryPercent >= 95) robot.status = 'idle';
      } else if (robot.status === 'idle') {
        if (robot.kind === 'agv' && robot.batteryPercent < th.lowBatteryPct) {
          robot.status = 'charging';
          const charging = ws?.layout?.areas?.find(a => a.kind === 'charging');
          if (charging) robot.position = randomPointIn(charging);
        } else if (Math.random() < 0.35) {
          robot.status = 'running';
          robot.currentTask = pick(TASKS);
        }
      } else if (robot.status === 'running') {
        robot.utilizationRate = Math.min(100, Math.max(20, robot.utilizationRate + rand(-8, 8)));
        robot.cyclesPerHour = Math.round(rand(40, 120));
        robot.temperatureC = Math.min(75, Math.max(30, robot.temperatureC + rand(-1.5, 2)));
        robot.operatingHours = Math.round((robot.operatingHours + sim.tickMs / 3600000) * 100) / 100;
        if (robot.kind === 'agv') robot.batteryPercent = Math.max(0, Math.round((robot.batteryPercent - 0.5) * 10) / 10);

        if (robot.temperatureC > th.tempLimitC) {
          condition(`temp:${robot._id}`);
          incidentEvents.push(() => recordIncident(io, {
            robot, workspace: ws, type: 'abnormal-condition', severity: 'medium',
            description: `${robot.robotId} motor temperature ${robot.temperatureC.toFixed(1)}C above configured limit ${th.tempLimitC}C`,
            conditionKey: `temp:${robot._id}`
          }));
        }
        if (robot.kind === 'agv' && robot.batteryPercent < th.lowBatteryPct) {
          condition(`batt:${robot._id}`);
          incidentEvents.push(() => recordIncident(io, {
            robot, workspace: ws, type: 'low-battery', severity: 'low',
            description: `${robot.robotId} battery at ${robot.batteryPercent.toFixed(0)}% (below ${th.lowBatteryPct}%)`,
            conditionKey: `batt:${robot._id}`
          }));
          robot.status = 'charging';
          const charging = ws?.layout?.areas?.find(a => a.kind === 'charging');
          if (charging) robot.position = randomPointIn(charging);
        } else if (Math.random() < 0.08) {
          robot.status = 'idle';
          robot.currentTask = null;
        }

        if (robot.status === 'running') {
          if (Math.random() < 0.004) {
            robot.status = 'e-stop';
            incidentEvents.push(() => recordIncident(io, {
              robot, workspace: ws, type: 'e-stop-triggered', severity: 'high',
              description: `Emergency stop activated on ${robot.robotId} during ${robot.currentTask || 'operation'}`
            }));
          } else if (Math.random() < 0.004) {
            incidentEvents.push(() => recordIncident(io, {
              robot, workspace: ws, type: 'force-limit-exceeded', severity: 'low',
              description: `Contact force on ${robot.robotId} briefly exceeded ISO/TS 15066 quasi-static limit`
            }));
          }
        }
      }

      if (robot.status !== prevStatus) updates.push(Robot.pushStatus(robot._id, robot.status));
      updates.push(robot.save());

      samples.push({
        robot: robot._id, workspace: ws._id,
        utilization: robot.status === 'running' ? Math.round(robot.utilizationRate) : 0,
        status: robot.status, temperatureC: robot.temperatureC,
        cyclesPerHour: robot.status === 'running' ? robot.cyclesPerHour : 0
      });
    }

    await Promise.all(updates.splice(0));
    if (samples.length) await UtilizationSample.insertMany(samples);

    // Move AGVs along the walkway (or to charging when charging)
    for (const robot of robots) {
      if (robot.kind !== 'agv' || !robot.workspace?.layout) continue;
      const areas = robot.workspace.layout.areas || [];
      const target = robot.status === 'charging'
        ? areas.find(a => a.kind === 'charging')
        : areas.find(a => a.kind === 'walkway');
      if (!target) continue;
      const pos = robot.position && robot.position.x != null ? robot.position : randomPointIn(target);
      let x = pos.x + rand(-1.4, 1.4);
      x = Math.min(target.x + target.w - 1, Math.max(target.x + 1, x));
      robot.position = { x: Math.round(x * 100) / 100, y: target.y + target.h / 2 + rand(-0.8, 0.8) };
      await robot.save();
    }

    // Move workers; evaluate position-based safety rules
    const activeWorkers = await Worker.find({ status: 'active', workspace: { $ne: null } }).populate('workspace');
    let intrusionsThisTick = 0;
    for (const worker of activeWorkers) {
      const ws = worker.workspace;
      const areas = ws?.layout?.areas || [];
      if (!areas.length) continue;
      const walkway = areas.find(a => a.kind === 'walkway');
      let { x, y } = worker.position && worker.position.x != null
        ? worker.position
        : randomPointIn(walkway);
      if (Math.random() < 0.12) {
        const target = pick(areas.filter(a => ['walkway', 'workstation', 'staging'].includes(a.kind)));
        ({ x, y } = randomPointIn(target));
      } else {
        ({ x, y } = clampToLayout(ws.layout, x + rand(-0.9, 0.9), y + rand(-0.6, 0.6)));
      }
      worker.position = { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 };
      worker.lastActivityAt = new Date();

      // Rule 1: restricted-area entry
      if (th.restrictedAreaEnabled) {
        const restricted = areas.find(a => a.kind === 'restricted'
          && x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h);
        if (restricted) {
          condition(`restricted:${worker._id}`);
          incidentEvents.push(() => recordIncident(io, {
            worker, workspace: ws, type: 'zone-intrusion', severity: 'high',
            description: `${worker.name} entered restricted area "${restricted.label || restricted.areaId}" in ${ws.zoneCode}`,
            conditionKey: `restricted:${worker._id}`
          }));
        }
      }

      // Rule 2: worker too close to a running robot
      const nearRobot = robots.find(r =>
        String(r.workspace?._id || r.workspace) === String(ws._id) &&
        r.status === 'running' && r.position?.x != null &&
        dist(r.position, worker.position) < th.proximityM);
      if (nearRobot) {
        condition(`prox:${worker._id}:${nearRobot._id}`);
        incidentEvents.push(() => recordIncident(io, {
          worker, robot: nearRobot, workspace: ws, type: 'near-miss', severity: 'medium',
          description: `${worker.name} approached ${nearRobot.robotId} within ${th.proximityM}m while it was running`,
          conditionKey: `prox:${worker._id}:${nearRobot._id}`
        }));
      }

      // Existing protective-field intrusion behaviour
      const hazard = hazardAreaAt(ws.layout, x, y);
      const hazardRobot = hazard?.robot ? robots.find(r => String(r._id) === String(hazard.robot)) : null;
      if (hazard && hazardRobot && hazardRobot.status === 'running' && intrusionsThisTick < 1 && Math.random() < 0.35) {
        intrusionsThisTick += 1;
        incidentEvents.push(() => recordIncident(io, {
          robot: hazardRobot, workspace: ws, worker, type: 'zone-intrusion', severity: 'medium',
          description: `${worker.name} entered protective field of ${hazardRobot.robotId}; speed reduced to safe limit`
        }));
        worker.position = randomPointIn(walkway);
      }
      updates.push(worker.save());
    }

    // Rule 3: over-capacity per workspace
    if (th.overCapacityEnabled) {
      const allWs = await Workspace.find();
      for (const ws of allWs) {
        const count = activeWorkers.filter(w => String(w.workspace?._id || w.workspace) === String(ws._id)).length;
        if (count > ws.maxOccupancy) {
          condition(`cap:${ws._id}`);
          incidentEvents.push(() => recordIncident(io, {
            workspace: ws, type: 'over-capacity', severity: 'medium',
            description: `${ws.zoneCode} holds ${count} workers above maximum capacity ${ws.maxOccupancy}`,
            conditionKey: `cap:${ws._id}`
          }));
        }
      }
    }

    // Drop conditions that are no longer active so alerts can re-arm later
    for (const key of [...sim.conditions.keys()]) {
      if (!activeConditions.has(key)) sim.conditions.delete(key);
    }

    await Promise.all(updates.splice(0));

    // Broadcast live zone occupancy
    const allWorkspaces = await Workspace.find();
    const zones = allWorkspaces.map(ws => buildOccupancyZone(
      ws,
      activeWorkers.filter(w => String(w.workspace?._id || w.workspace) === String(ws._id)),
      robots.filter(r => String(r.workspace?._id || r.workspace) === String(ws._id))
    ));
    io.emit('occupancy', { at: new Date().toISOString(), zones });

    if (Math.random() < 0.2) {
      const ws = pick(robots).workspace;
      if (ws.status === 'restricted' && Math.random() < 0.4) {
        ws.status = 'operational';
        ws.safetyScore = Math.min(100, ws.safetyScore + 3);
        await ws.save();
        io.emit('workspace-updated', ws);
      }
    }

    if (Math.random() < 0.1) {
      const worker = await Worker.findOne({ status: { $in: ['active', 'break'] } });
      if (worker) {
        const next = worker.status === 'active' ? 'break' : 'active';
        worker.status = next;
        worker.events = [...(worker.events || []), {
          type: next === 'break' ? 'break' : 'return',
          workspace: worker.workspace,
          at: new Date()
        }].slice(-30);
        await worker.save();
        io.emit('worker-updated', worker);
      }
    }

    io.emit('telemetry', {
      at: new Date().toISOString(),
      robots: robots.map(r => ({
        id: r._id, robotId: r.robotId, status: r.status,
        utilizationRate: Math.round(r.utilizationRate), temperatureC: Math.round(r.temperatureC * 10) / 10,
        cyclesPerHour: r.cyclesPerHour, currentTask: r.currentTask,
        batteryPercent: Math.round(r.batteryPercent), operatingHours: r.operatingHours
      }))
    });

    for (const ev of incidentEvents) await ev();
  } catch (err) {
    console.error('[simulator]', err.message);
  }
}

export function startSimulator(io) {
  sim.io = io;
  sim.state = 'running';
  armTimer();
  console.log(`[simulator] live telemetry every ${sim.tickMs / 1000}s (simulated data)`);
  return sim;
}
