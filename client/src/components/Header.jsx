import { useEffect, useState } from 'react';

const ROLE_LABELS = { admin: 'Administrator', safety_officer: 'Safety Officer', operator: 'Operator' };

export default function Header({ connected, incidents, user, onLogout }) {
  const [now, setNow] = useState(new Date());
  const openHigh = incidents.filter(i =>
    i.status !== 'resolved' && (i.severity === 'high' || i.severity === 'critical')
  ).length;

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <header className="header">
      <div className="header-left">
        <div className="logo">SF</div>
        <div>
          <h1>Smart Factory Monitoring</h1>
          <p className="subtitle">Collaborative workspace safety &middot; robot utilization &middot; compliance</p>
        </div>
      </div>
      <div className="header-right">
        {openHigh > 0 && <span className="pill pill-critical">{openHigh} high-severity open</span>}
        <span className={connected ? 'pill pill-ok' : 'pill pill-warn'}>
          <span className={connected ? 'dot dot-live' : 'dot dot-dead'} />
          {connected ? 'LIVE' : 'RECONNECTING'}
        </span>
        <span className="clock">{now.toLocaleTimeString()}</span>
        {user && (
          <span className="user-chip" title={`Role: ${user.role}`}>
            {user.username}
            <span className={user.role === 'admin' ? 'role-badge role-admin' : user.role === 'safety_officer' ? 'role-badge role-safety' : 'role-badge role-operator'}>
              {ROLE_LABELS[user.role] || user.role}
            </span>
            <button className="link-btn" onClick={onLogout}>Log out</button>
          </span>
        )}
      </div>
    </header>
  );
}
