import { type Baseline } from './config.js';
import type { Report } from './types.js';

export function createBaseline(report: Report, reason: string): Baseline {
  if (!report.scope.complete) throw new Error('Cannot create a baseline from incomplete analysis. Resolve the diagnostics first.');
  if (!reason.trim()) throw new Error('Provide a reason for accepting existing findings.');
  return {
    schemaVersion: 1,
    policyHash: report.snapshot.policyHash,
    sourceHash: report.snapshot.contentHash,
    entries: report.findings.map(f => ({ fingerprint: f.fingerprint, ruleId: f.ruleId, reason: reason.trim() }))
  };
}

export function reconcileBaseline(previous: Baseline, report: Report): Baseline {
  const blocking = report.diagnostics.filter(d => d.code !== 'BASELINE_RECONCILIATION_REQUIRED');
  if (blocking.length) throw new Error('Cannot reconcile a baseline while analysis is incomplete.');
  if (previous.policyHash !== report.snapshot.policyHash) throw new Error('Cannot reconcile a baseline across a changed policy. Review and explicitly replace the baseline.');
  const present = new Set(report.findings.map(f => f.fingerprint));
  return { ...previous, sourceHash: report.snapshot.contentHash, entries: previous.entries.filter(e => present.has(e.fingerprint)) };
}
