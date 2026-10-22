import { Router } from 'express';
import ComplianceAudit from '../models/ComplianceAudit.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.workspace) filter.workspace = req.query.workspace;
    if (req.query.standard) filter.standard = req.query.standard;
    const audits = await ComplianceAudit.find(filter)
      .populate('workspace', 'name zoneCode')
      .sort({ auditDate: -1 });
    res.json(audits);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const items = req.body.items || [];
    const allCompliant = items.every(i => i.compliant);
    const someNonCompliant = items.some(i => !i.compliant);
    const status = req.body.status || (allCompliant ? 'passed' : someNonCompliant ? 'passed-with-findings' : 'pending');
    const audit = await ComplianceAudit.create({ ...req.body, items, status });
    res.status(201).json(audit);
  } catch (e) { next(e); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const audit = await ComplianceAudit.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!audit) return res.status(404).json({ error: 'Audit not found' });
    res.json(audit);
  } catch (e) { next(e); }
});

export default router;
