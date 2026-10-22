import AuditLog from './models/AuditLog.js';

export function logAudit(req, action, target = '', details = '') {
  const entry = {
    username: req?.user?.username || 'system',
    role: req?.user?.role || '',
    action,
    target,
    details
  };
  return AuditLog.create(entry).catch(err => console.error('[audit]', err.message));
}
