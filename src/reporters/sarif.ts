import type { Report } from '../core/types.js';

export function sarifReport(report: Report): unknown {
  const ruleIds = [...new Set(report.findings.map(f => f.ruleId))].sort();
  return {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json', version: '2.1.0',
    runs: [{
      tool: { driver: { name: report.tool.name, version: report.tool.version, rules: ruleIds.map(id => ({ id, shortDescription: { text: id } })) } },
      invocations: [{ executionSuccessful: report.diagnostics.length === 0, toolExecutionNotifications: report.diagnostics.map(d => ({ descriptor: { id: d.code }, level: 'error', message: { text: `${d.path ? `${d.path}: ` : ''}${d.message}` } })) }],
      results: report.findings.map(f => ({
        ruleId: f.ruleId, ruleIndex: ruleIds.indexOf(f.ruleId), level: f.severity,
        message: { text: `${f.message} Evidence: ${f.evidence.join(' -> ')}` },
        locations: [{ physicalLocation: { artifactLocation: { uri: f.path.split('/').map(encodeURIComponent).join('/'), uriBaseId: '%SRCROOT%' }, region: { startLine: f.line, startColumn: f.column } } }],
        partialFingerprints: { 'repoAssurance/v1': f.fingerprint },
        baselineState: f.status === 'existing' ? 'unchanged' : 'new'
      })),
      properties: { snapshot: report.snapshot, mode: report.mode, result: report.result, limitations: report.limitations }
    }]
  };
}
