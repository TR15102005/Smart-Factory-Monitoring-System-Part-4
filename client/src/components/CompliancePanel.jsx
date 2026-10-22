const STATUS_TONE = { passed: 'ok', 'passed-with-findings': 'warn', failed: 'bad', pending: 'info' };

const daysUntil = d => Math.ceil((new Date(d) - Date.now()) / (24 * 3600 * 1000));

export default function CompliancePanel({ audits, expiringCerts, workspaces }) {
  return (
    <div className="split">
      <section className="panel">
        <h2>Standards Audits</h2>
        <div className="audit-list">
          {audits.map(a => {
            const passedItems = a.items.filter(i => i.compliant).length;
            const nextIn = daysUntil(a.nextAuditDate);
            return (
              <div key={a._id} className="audit-card">
                <div className="incident-top">
                  <b>{a.standard}</b>
                  <span className={`pill pill-${STATUS_TONE[a.status]}`}>{a.status}</span>
                </div>
                <p className="audit-ws">{a.workspace?.zoneCode} — {a.workspace?.name}</p>
                <div className="ws-bar-row">
                  <span>{passedItems}/{a.items.length} requirements met</span>
                  <div className="bar">
                    <div className={`bar-fill ${passedItems === a.items.length ? 'fill-ok' : 'fill-warn'}`}
                      style={{ width: `${(passedItems / Math.max(1, a.items.length)) * 100}%` }} />
                  </div>
                </div>
                <div className="incident-meta">
                  <span>Auditor: {a.auditor}</span>
                  <span>Audited: {new Date(a.auditDate).toLocaleDateString()}</span>
                  <span className={nextIn < 30 ? 'temp-hot' : ''}>Next audit in {nextIn}d</span>
                </div>
              </div>
            );
          })}
          {audits.length === 0 && <p className="empty">No audits recorded.</p>}
        </div>
      </section>

      <section className="panel">
        <h2>Worker Certifications</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Worker</th><th>Role</th><th>Certification</th><th>Expires</th><th>Status</th></tr></thead>
            <tbody>
              {expiringCerts.map(w => w.certifications.map((c, i) => (
                <tr key={`${w._id}-${i}`}>
                  {i === 0 && <td rowSpan={w.certifications.length}><b>{w.name}</b><br /><small>{w.employeeId}</small></td>}
                  {i === 0 && <td rowSpan={w.certifications.length}>{w.role}</td>}
                  <td>{c.name}</td>
                  <td>{new Date(c.expiresAt).toLocaleDateString()}</td>
                  <td>
                    <span className={`pill ${daysUntil(c.expiresAt) < 0 ? 'pill-bad' : 'pill-warn'}`}>
                      {daysUntil(c.expiresAt) < 0 ? 'expired' : `${daysUntil(c.expiresAt)}d left`}
                    </span>
                  </td>
                </tr>
              )))}
              {expiringCerts.length === 0 && (
                <tr><td colSpan={5} className="empty">All certifications current.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <h3 className="sub-heading">Zone compliance snapshot</h3>
        <div className="score-list">
          {workspaces.map(w => {
            const audit = w.latestAudit;
            return (
              <div key={w._id} className="score-row">
                <span>{w.zoneCode} — {w.name}</span>
                {audit
                  ? <span className={`pill pill-${STATUS_TONE[audit.status]}`}>{audit.standard}: {audit.status}</span>
                  : <span className="pill pill-info">no audit</span>}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
