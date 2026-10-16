import type { Report } from '../core/types.js';

export function textReport(report: Report): string {
  const lines = [
    `Repo Assurance ${report.tool.version}`,
    `${report.result} | ${report.mode === 'observe' ? 'observation (findings do not block)' : 'enforcement'} | exit ${report.exitCode}`,
    `Scope: ${report.scope.analyzedFiles}/${report.scope.sourceFiles} source files; ${report.scope.dependencies} dependencies`,
    `Snapshot: ${report.snapshot.contentHash}`,
    `Policy:   ${report.snapshot.policyHash}`,
    `Findings: ${report.findings.filter(f => f.status === 'new').length} new; ${report.baseline.matched} existing; ${report.baseline.resolved.length} resolved baseline items`
  ];
  for (const f of report.findings) lines.push('', `${f.severity.toUpperCase()} [${f.ruleId}] ${f.path}:${f.line}:${f.column} (${f.status})`, `  ${f.message}`, `  Evidence: ${f.evidence.join(' -> ')}`, `  Finding: ${f.fingerprint}`);
  for (const d of report.diagnostics) lines.push('', `INCONCLUSIVE [${d.code}]${d.path ? ` ${d.path}` : ''}`, `  ${d.message}`);
  if (report.questions.length) lines.push('', `${report.questions.length} targeted question(s) are included in JSON output.`);
  lines.push('', 'Scope: module boundaries and included dependency cycles. See docs/capabilities.md for limitations.');
  return `${lines.join('\n')}\n`;
}
