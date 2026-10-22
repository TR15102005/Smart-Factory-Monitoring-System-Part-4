import axios from 'axios';

const TOKEN_KEY = 'sfm_token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: t => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY)
};

const http = axios.create({ baseURL: '/api' });

http.interceptors.request.use(config => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

http.interceptors.response.use(
  res => res.data,
  err => {
    const status = err.response?.status;
    const url = err.config?.url || '';
    if (status === 401 && !url.startsWith('/auth/')) {
      tokenStore.clear();
      window.dispatchEvent(new Event('sfm:unauthorized'));
    }
    return Promise.reject(new Error(err.response?.data?.error || err.message));
  }
);

export const api = {
  login: (username, password) => http.post('/auth/login', { username, password }),
  register: (username, password, fullName) => http.post('/auth/register', { username, password, fullName }),
  me: () => http.get('/auth/me'),

  summary: () => http.get('/metrics/summary'),
  utilization: (hours = 12) => http.get(`/metrics/utilization?hours=${hours}`),
  safetyByWorkspace: () => http.get('/metrics/safety-by-workspace'),
  occupancy: () => http.get('/metrics/occupancy'),

  workspaces: () => http.get('/workspaces'),

  robots: (params = {}) => http.get('/robots', { params }),
  robot: id => http.get(`/robots/${id}`),
  createRobot: body => http.post('/robots', body),
  updateRobot: (id, body) => http.put(`/robots/${id}`, body),
  deleteRobot: id => http.delete(`/robots/${id}`),
  robotStatusHistory: id => http.get(`/robots/${id}/status-history`),
  robotMaintenance: id => http.get(`/robots/${id}/maintenance`),
  setRobotStatus: (id, status) => http.patch(`/robots/${id}/status`, { status }),

  workers: (params = {}) => http.get('/workers', { params }),
  worker: id => http.get(`/workers/${id}`),
  workerActivity: id => http.get(`/workers/${id}/activity`),
  workerDepartments: () => http.get('/workers/departments'),
  createWorker: body => http.post('/workers', body),
  updateWorker: (id, body) => http.put(`/workers/${id}`, body),
  deleteWorker: id => http.delete(`/workers/${id}`),
  expiringCerts: (days = 60) => http.get(`/workers/certifications/expiring?days=${days}`),

  incidents: (params = {}) => http.get('/incidents', { params }),
  incident: id => http.get(`/incidents/${id}`),
  acknowledgeIncident: id => http.patch(`/incidents/${id}/acknowledge`),
  resolveIncident: (id, notes) => http.patch(`/incidents/${id}/resolve`, { resolutionNotes: notes }),
  reportIncident: body => http.post('/incidents', body),

  compliance: () => http.get('/compliance'),

  users: () => http.get('/users'),
  createUser: body => http.post('/users', body),
  setUserRole: (id, role) => http.patch(`/users/${id}/role`, { role }),
  deleteUser: id => http.delete(`/users/${id}`),

  analytics: {
    overview: () => http.get('/analytics/overview'),
    robotUtilization: (params = {}) => http.get('/analytics/robot-utilization', { params }),
    occupancy: () => http.get('/analytics/occupancy'),
    safetyIncidents: (params = {}) => http.get('/analytics/safety-incidents', { params }),
    robotHours: () => http.get('/analytics/robot-hours'),
    faultFrequency: (params = {}) => http.get('/analytics/fault-frequency', { params }),
    workspaceSafety: () => http.get('/analytics/workspace-safety')
  },

  maintenance: {
    list: (params = {}) => http.get('/maintenance', { params }),
    predictions: () => http.get('/maintenance/predictions'),
    create: body => http.post('/maintenance', body),
    update: (id, body) => http.patch(`/maintenance/${id}`, body)
  },

  simulation: {
    status: () => http.get('/simulation/status'),
    start: () => http.post('/simulation/start'),
    pause: () => http.post('/simulation/pause'),
    resume: () => http.post('/simulation/resume'),
    stop: () => http.post('/simulation/stop'),
    reset: () => http.post('/simulation/reset'),
    speed: tickMs => http.post('/simulation/speed', { tickMs })
  },

  settings: () => http.get('/settings'),
  saveSettings: body => http.put('/settings', body),
  auditLogs: (limit = 100) => http.get(`/audit-logs?limit=${limit}`)
};
