import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { api, tokenStore } from './api.js';
import Header from './components/Header.jsx';
import LoginPage from './components/LoginPage.jsx';
import KpiCards from './components/KpiCards.jsx';
import WorkspaceGrid from './components/WorkspaceGrid.jsx';
import UtilizationPanel from './components/UtilizationPanel.jsx';
import ZoneLayoutPanel from './components/ZoneLayoutPanel.jsx';
import SiteMapPanel from './components/SiteMapPanel.jsx';
import SafetyPanel from './components/SafetyPanel.jsx';
import CompliancePanel from './components/CompliancePanel.jsx';
import AdminPanel from './components/AdminPanel.jsx';
import WorkersPage from './pages/WorkersPage.jsx';
import RobotsPage from './pages/RobotsPage.jsx';
import AlertsPage from './pages/AlertsPage.jsx';
import AnalyticsPage from './pages/AnalyticsPage.jsx';
import MaintenancePage from './pages/MaintenancePage.jsx';
import ReportsPage from './pages/ReportsPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';

const ALL_ROLES = ['admin', 'safety_officer', 'operator'];

const NAV = [
  { id: 'dashboard', label: 'Dashboard', roles: ALL_ROLES },
  { id: 'zones', label: 'Zone Layout', roles: ALL_ROLES },
  { id: 'workers', label: 'Worker Management', roles: ['admin'] },
  { id: 'robots', label: 'Robot Management', roles: ['admin', 'operator'] },
  { id: 'safety', label: 'Safety Monitoring', roles: ALL_ROLES },
  { id: 'alerts', label: 'Alerts & Notifications', roles: ALL_ROLES },
  { id: 'analytics', label: 'Analytics', roles: ['admin', 'safety_officer'] },
  { id: 'maintenance', label: 'Predictive Maintenance', roles: ['admin', 'operator'] },
  { id: 'reports', label: 'Reports', roles: ['admin', 'safety_officer'] },
  { id: 'settings', label: 'Settings', roles: ['admin'] },
  { id: 'admin', label: 'Admin Panel', roles: ['admin'] }
];

export default function App() {
  const [tab, setTab] = useState('dashboard');
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [connected, setConnected] = useState(false);
  const [summary, setSummary] = useState(null);
  const [workspaces, setWorkspaces] = useState([]);
  const [robots, setRobots] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [compliance, setCompliance] = useState([]);
  const [expiringCerts, setExpiringCerts] = useState([]);
  const [utilization, setUtilization] = useState({ series: [], perRobot: [] });
  const [safetyByWs, setSafetyByWs] = useState([]);
  const [occupancy, setOccupancy] = useState([]);
  const [telemetry, setTelemetry] = useState({});
  const [simStatus, setSimStatus] = useState(null);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const showToast = useCallback(msg => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  }, []);

  const refresh = useCallback(async () => {
    const [s, ws, rb, wk, inc, comp, certs, util, safety, occ] = await Promise.all([
      api.summary(), api.workspaces(), api.robots(), api.workers(),
      api.incidents({ limit: 30 }), api.compliance(), api.expiringCerts(60),
      api.utilization(12), api.safetyByWorkspace(), api.occupancy()
    ]);
    setSummary(s); setWorkspaces(ws); setRobots(rb); setWorkers(wk);
    setIncidents(inc); setCompliance(comp); setExpiringCerts(certs);
    setUtilization(util); setSafetyByWs(safety); setOccupancy(occ.zones);
  }, []);

  useEffect(() => {
    const onUnauthorized = () => setUser(null);
    window.addEventListener('sfm:unauthorized', onUnauthorized);
    if (tokenStore.get()) {
      api.me()
        .then(setUser)
        .catch(() => tokenStore.clear())
        .finally(() => setAuthChecked(true));
    } else {
      setAuthChecked(true);
    }
    return () => window.removeEventListener('sfm:unauthorized', onUnauthorized);
  }, []);

  useEffect(() => {
    if (!user) return;
    refresh().catch(e => console.error(e));
    api.simulation.status().then(setSimStatus).catch(() => {});

    const socket = io({ transports: ['websocket', 'polling'] });
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('telemetry', data => {
      const map = {};
      for (const r of data.robots) map[r.id] = r;
      setTelemetry(map);
      setRobots(prev => prev.map(r => map[r._id] ? { ...r, ...map[r._id] } : r));
    });

    socket.on('incident', inc => {
      setIncidents(prev => [inc, ...prev].slice(0, 50));
      showToast(`New ${inc.severity} incident: ${inc.type.replace(/-/g, ' ')} in ${inc.workspace?.name || 'zone'}`);
      api.summary().then(setSummary).catch(() => {});
    });

    socket.on('incident-updated', inc => {
      setIncidents(prev => prev.map(i => (i._id === inc._id ? { ...i, ...inc } : i)));
    });

    socket.on('robot-status', robot => {
      if (robot.deleted) return setRobots(prev => prev.filter(r => r._id !== robot._id));
      setRobots(prev => prev.map(r => (r._id === robot._id ? { ...r, ...robot } : r)));
    });

    socket.on('workspace-updated', ws => {
      setWorkspaces(prev => prev.map(w => (w._id === ws._id ? { ...w, ...ws } : w)));
      api.summary().then(setSummary).catch(() => {});
    });

    socket.on('worker-updated', wk => {
      if (wk.deleted) return setWorkers(prev => prev.filter(w => w._id !== wk._id));
      setWorkers(prev => prev.map(w => (w._id === wk._id ? { ...w, ...wk } : w)));
    });

    socket.on('occupancy', data => setOccupancy(data.zones));
    socket.on('simulation', status => setSimStatus(status));

    const interval = setInterval(() => {
      api.summary().then(setSummary).catch(() => {});
      api.utilization(12).then(setUtilization).catch(() => {});
      api.safetyByWorkspace().then(setSafetyByWs).catch(() => {});
    }, 30000);

    return () => { socket.close(); clearInterval(interval); };
  }, [user, refresh, showToast]);

  const handleLogin = ({ token, user: loggedIn }) => {
    tokenStore.set(token);
    setUser(loggedIn);
    setTab('dashboard');
  };

  const handleLogout = () => {
    tokenStore.clear();
    setUser(null);
  };

  if (!authChecked) return <div className="login-page" />;
  if (!user) return <LoginPage onLogin={handleLogin} />;

  const handleResolveIncident = async (id) => {
    await api.resolveIncident(id, 'Resolved from dashboard');
    await refresh();
  };

  const visibleNav = NAV.filter(item => item.roles.includes(user.role));
  const currentTab = visibleNav.some(item => item.id === tab) ? tab : 'dashboard';

  return (
    <div className="app">
      <Header connected={connected} incidents={incidents} user={user} onLogout={handleLogout} />
      <div className="shell-body">
        <aside className="sidebar">
          <nav>
            {visibleNav.map(item => (
              <button
                key={item.id}
                className={currentTab === item.id ? 'side-link active' : 'side-link'}
                onClick={() => setTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <div className="sidebar-foot">
            <span className={
              simStatus?.state === 'running' ? 'pill pill-ok'
                : simStatus?.state === 'paused' ? 'pill pill-warn' : 'pill pill-bad'
            }>
              sim {simStatus?.state || '…'}
            </span>
            <small>Simulated telemetry source</small>
          </div>
        </aside>
        <main className="content">
          {currentTab === 'dashboard' && (
            <>
              <KpiCards summary={summary} />
              <WorkspaceGrid workspaces={workspaces} telemetry={telemetry} />
              <UtilizationPanel data={utilization} />
            </>
          )}
          {currentTab === 'zones' && (
            <>
              <SiteMapPanel zones={occupancy} incidents={incidents} />
              <ZoneLayoutPanel zones={occupancy} />
            </>
          )}
          {currentTab === 'workers' && (
            <WorkersPage user={user} workspaces={workspaces} onToast={showToast} onRefresh={refresh} />
          )}
          {currentTab === 'robots' && (
            <RobotsPage user={user} telemetry={telemetry} workspaces={workspaces} onToast={showToast} onRefresh={refresh} />
          )}
          {currentTab === 'safety' && (
            <>
              <SafetyPanel
                incidents={incidents}
                safetyByWs={safetyByWs}
                workspaces={workspaces}
                onResolve={handleResolveIncident}
                onRefresh={refresh}
              />
              <CompliancePanel audits={compliance} expiringCerts={expiringCerts} workspaces={workspaces} />
            </>
          )}
          {currentTab === 'alerts' && (
            <AlertsPage user={user} incidents={incidents} workspaces={workspaces} onToast={showToast} onRefresh={refresh} />
          )}
          {currentTab === 'analytics' && <AnalyticsPage workspaces={workspaces} />}
          {currentTab === 'maintenance' && <MaintenancePage user={user} onToast={showToast} />}
          {currentTab === 'reports' && <ReportsPage workspaces={workspaces} />}
          {currentTab === 'settings' && (
            <SettingsPage user={user} onToast={showToast} simStatus={simStatus} onSimStatus={setSimStatus} />
          )}
          {currentTab === 'admin' && <AdminPanel currentUser={user} summary={summary} onToast={showToast} />}
        </main>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
