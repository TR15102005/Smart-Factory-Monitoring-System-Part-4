# Smart Factory Monitoring & Worker Safety System

MERN-stack (MongoDB, Express, React, Node) application for monitoring collaborative
human/robot workspaces — worker safety, robot utilization, and standards compliance.
Safety detection is a **JavaScript rule-based engine** ("AI-inspired"); it is a college
prototype and does **not** replace industrial safety controllers or stop real robots.

## Roles & pages

| Role | Login | Pages |
|---|---|---|
| Administrator | `admin` / `admin123` | Dashboard, Zone Layout, Worker Mgmt, Robot Mgmt, Safety Monitoring, Alerts, Analytics, Predictive Maintenance, Reports, Settings, Admin Panel |
| Safety Officer | `safety` / `safety123` | Dashboard, Zone Layout, Safety Monitoring, Alerts, Analytics, Reports |
| Operator | self-registration | Dashboard, Zone Layout, Robot Mgmt, Safety Monitoring, Alerts, Predictive Maintenance |

New registrations receive the **operator** role. JWT (bcrypt-hashed passwords, never plaintext).

## Features

- **Dashboard** — 8 summary cards (workstations, workers, robots, running, idle, faulty, active alerts, overall safety) + workspace grid + utilization charts
- **Zone Layout & Occupancy** — live SVG floor plans (WS-A1…WS-F6) with robot cells, walkways, workstations, staging, charging and restricted areas; moving worker/AGV positions; tooltips; filters (all / safe / warning / critical / high-occupancy); protective-field intrusion highlighting
- **Live Factory Site Map** — dark tactical map above the zone layout: room outlines, main corridor with spur connectors, worker dots (red when inside a protective field), spinning robot/AGV fan markers coloured by status, hatched hazard zones, yellow triangles for open safety alerts, green shields where an alert is acknowledged/investigating; zone switcher, zoom in/out, reset view, layer toggles (workers, hazards, alerts, robots, labels), fullscreen, compass and 10 m scale bar
- **Worker Management** (admin) — CRUD, search, department/status filters, workspace assignment, entry/exit activity history, duplicate-employeeId prevention
- **Robot Management** (admin/operator) — CRUD, battery %, operating hours, last maintenance/comm, statuses (running/idle/charging/warning/fault/e-stop), status + maintenance history, live Socket.IO updates
- **Safety Monitoring** — rule-based incident detection + compliance audits and certification expiry
- **Alerts & Notifications** — searchable/filterable alert list with counts, acknowledge + resolve (admin/safety officer), ack/resolve timestamps and actor, duplicate-alert suppression for continuous conditions
- **Analytics** (admin/safety officer) — 8 Chart.js charts from MongoDB with date-range + workstation filters and CSV export
- **Predictive Maintenance** (admin/operator) — rule-based maintenance recommendations (operating hours, repeated faults, overdue service, battery, temperature), clearly labelled simulated; maintenance record CRUD
- **Reports** (admin/safety officer) — occupancy, utilization, incidents, faults, maintenance, workstation activity with date ranges, generation timestamps and CSV download
- **Settings** (admin) — configurable safety-rule thresholds + factory simulation controls (start/pause/resume/stop/reset/speed) + admin audit log
- **Admin Panel** (admin) — user management (create/promote/demote/delete) + system overview
- **Factory simulation** — streams robot telemetry, worker movement, battery drain/charge and safety events over Socket.IO; all simulated data is labelled as such

## Run

```bash
# one-time: create the backend env file from the template
cp server/.env.example server/.env

# backend (API :4000, socket.io, simulator)
cd server && npm install && npm start

# frontend (Vite :5173, proxies /api and /socket.io to :4000)
cd client && npm install && npm run dev
```

Open http://localhost:5173

`node_modules/`, build output and `.env` are git-ignored — `npm install` recreates
them on a fresh clone.

## Database & environment

By default the backend starts an **in-memory MongoDB** (data resets on restart,
auto-seeded with 6 workspaces, 16 robots, 16 workers, incidents, audits, maintenance
records and 24h of telemetry).

`server/.env` (example names):

```
MONGODB_URI=mongodb://localhost:27017/smart_factory   # omit for in-memory
PORT=4000
JWT_SECRET=change-me-in-production                    # never commit a real secret
MONGOMS_ARCH=x86_64                                   # ARM Windows: use x64 mongod binary
MONGOMS_VERSION=7.0.14
```

> MongoDB publishes no native Windows ARM64 builds; on ARM Windows the in-memory
> server downloads the x64 binary, which runs under Windows emulation.

## Simulation & safety-alert testing

- **Run the simulation:** Settings → *Factory Simulation* → Start/Resume, Pause, Stop,
  Reset, and tick-speed (1000–10000 ms). The sidebar pill shows live state.
  API: `GET /api/simulation/status`, `POST /api/simulation/{start,pause,resume,stop,reset,speed}` (admin).
- **Test safety alerts:** with the simulation running, watch the Alerts page and the
  header toast — the rule engine raises restricted-area entry, proximity, over-capacity,
  robot fault/e-stop, low battery, comm timeout and abnormal-condition events.
  Acknowledge/resolve them from the Alerts page (admin or safety officer).
  Thresholds are editable under Settings → *Safety Rule Thresholds*.

## API highlights

| Endpoint | Description |
|---|---|
| `POST /api/auth/login`, `POST /api/auth/register`, `GET /api/auth/me` | JWT auth |
| `GET /api/metrics/summary` | Dashboard KPIs |
| `GET /api/metrics/occupancy` | Per-zone floor plan + live positions |
| `GET /api/metrics/utilization?hours=12` | Fleet + per-robot utilization |
| `GET/POST/PATCH/DELETE /api/workers` | Worker CRUD (+ `/:id/activity`, `/departments`) |
| `GET/POST/PATCH/DELETE /api/robots` | Robot CRUD (+ `/:id/status-history`, `/:id/maintenance`, `PATCH /:id/status`) |
| `GET/POST /api/incidents`, `PATCH /api/incidents/:id/{acknowledge,resolve}` | Safety event workflow |
| `GET /api/analytics/{overview,robot-utilization,occupancy,safety-incidents,robot-hours,fault-frequency,workspace-safety}` | Analytics datasets |
| `GET /api/maintenance`, `GET /api/maintenance/predictions`, `POST/PATCH /api/maintenance` | Maintenance records + rule-based predictions |
| `POST /api/simulation/{start,pause,resume,stop,reset,speed}` | Simulation control (admin) |
| `GET/PUT /api/settings` | Safety thresholds (PUT admin) |
| `GET /api/audit-logs` | Admin-only audit trail |
| `GET/POST/PATCH/DELETE /api/users` | Admin-only user management |

Socket.IO events: `telemetry`, `occupancy`, `incident`, `incident-updated`, `robot-status`,
`workspace-updated`, `worker-updated`, `simulation`.
