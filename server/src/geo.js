export const inArea = (px, py, a) => px >= a.x && px <= a.x + a.w && py >= a.y && py <= a.y + a.h;

export const areaCenter = a => ({ x: a.x + a.w / 2, y: a.y + a.h / 2 });

export function hazardAreaAt(layout, x, y) {
  return (layout?.areas || []).find(a => (a.kind === 'robot-cell' || a.kind === 'restricted') && inArea(x, y, a)) || null;
}

export function randomPointIn(area) {
  return { x: area.x + Math.random() * area.w, y: area.y + Math.random() * area.h };
}

export function clampToLayout(layout, x, y, margin = 0.8) {
  return {
    x: Math.min(layout.widthM - margin, Math.max(margin, x)),
    y: Math.min(layout.heightM - margin, Math.max(margin, y))
  };
}

export function buildOccupancyZone(ws, presentWorkers, robots) {
  const areas = ws.layout?.areas || [];
  const workers = presentWorkers.map(w => {
    const hazard = hazardAreaAt(ws.layout, w.position?.x, w.position?.y);
    const robotInHazard = hazard?.robot ? robots.find(r => String(r._id) === String(hazard.robot)) : null;
    return {
      id: String(w._id),
      name: w.name,
      employeeId: w.employeeId,
      x: w.position?.x ?? null,
      y: w.position?.y ?? null,
      inHazard: Boolean(hazard && robotInHazard && robotInHazard.status === 'running')
    };
  });
  const zoneRobots = robots.map(r => ({
    id: String(r._id),
    robotId: r.robotId,
    kind: r.kind,
    status: r.status,
    x: r.position?.x ?? null,
    y: r.position?.y ?? null,
    batteryPercent: r.batteryPercent ?? null,
    currentTask: r.currentTask || null
  }));
  const occupancy = workers.length;
  return {
    workspaceId: String(ws._id),
    zoneCode: ws.zoneCode,
    name: ws.name,
    status: ws.status,
    safetyScore: ws.safetyScore,
    widthM: ws.layout?.widthM || 32,
    heightM: ws.layout?.heightM || 20,
    areas: areas.map(a => {
      const o = typeof a.toObject === 'function' ? a.toObject() : a;
      return {
        areaId: o.areaId,
        label: o.label,
        kind: o.kind,
        x: o.x,
        y: o.y,
        w: o.w,
        h: o.h,
        robot: o.robot ? String(o.robot) : null
      };
    }),
    occupancy,
    maxOccupancy: ws.maxOccupancy,
    overCapacity: occupancy > ws.maxOccupancy,
    hazards: workers.filter(w => w.inHazard).length,
    robotsActive: zoneRobots.filter(r => r.status === 'running').length,
    workers,
    robots: zoneRobots
  };
}
