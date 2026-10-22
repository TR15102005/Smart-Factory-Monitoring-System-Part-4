import 'dotenv/config';
import http from 'http';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { connectDB } from './db.js';
import { seed } from './seed.js';
import { startSimulator } from './simulator.js';
import { requireAuth } from './auth.js';
import authRouter from './routes/auth.js';
import workspacesRouter from './routes/workspaces.js';
import robotsRouter from './routes/robots.js';
import workersRouter from './routes/workers.js';
import incidentsRouter from './routes/incidents.js';
import complianceRouter from './routes/compliance.js';
import metricsRouter from './routes/metrics.js';
import usersRouter from './routes/users.js';
import analyticsRouter from './routes/analytics.js';
import maintenanceRouter from './routes/maintenance.js';
import simulationRouter from './routes/simulation.js';
import settingsRouter from './routes/settings.js';
import auditRouter from './routes/audit.js';
import { requireAdmin } from './auth.js';

const PORT = process.env.PORT || 4000;

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRouter);

app.get('/api/health', (req, res) => res.json({ ok: true, uptime: process.uptime() }));

app.use('/api', requireAuth);

app.use('/api/workspaces', workspacesRouter);
app.use('/api/robots', robotsRouter);
app.use('/api/workers', workersRouter);
app.use('/api/incidents', incidentsRouter);
app.use('/api/compliance', complianceRouter);
app.use('/api/metrics', metricsRouter);
app.use('/api/users', requireAdmin, usersRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/maintenance', maintenanceRouter);
app.use('/api/simulation', simulationRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/audit-logs', requireAdmin, auditRouter);

app.get('/api/health', (req, res) => res.json({ ok: true, uptime: process.uptime() }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
app.set('io', io);

io.on('connection', socket => {
  socket.emit('hello', { message: 'Connected to Smart Factory telemetry stream' });
});

await connectDB();
await seed();
startSimulator(io);

server.listen(PORT, () => {
  console.log(`[api] http://localhost:${PORT}`);
  console.log(`[ws]  socket.io on :${PORT}`);
});
