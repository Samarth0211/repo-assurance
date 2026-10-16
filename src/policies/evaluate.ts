import type { Config } from '../core/config.js';
import { matches } from '../core/discovery.js';
import { digest } from '../core/hash.js';
import type { Edge, Finding } from '../core/types.js';
import { components, cyclePath } from './graph.js';

export function evaluate(nodes: string[], edges: Edge[], config: Config): Finding[] {
  const findings = new Map<string, Finding>();
  for (const rule of config.rules.boundaries) {
    for (const edge of edges) {
      if (!matches(edge.from, rule.from) || !matches(edge.to, rule.disallow)) continue;
      const fingerprint = digest({ version: 1, ruleId: rule.id, from: edge.from, to: edge.to });
      if (findings.has(fingerprint)) continue;
      findings.set(fingerprint, {
        fingerprint, ruleId: rule.id, severity: rule.severity, path: edge.from,
        line: edge.line, column: edge.column, status: 'new',
        message: rule.message ?? `Forbidden dependency: ${edge.from} imports ${edge.to}.`,
        evidence: [edge.from, edge.to]
      });
    }
  }
  if (config.rules.cycles.enabled) {
    const internal = edges.filter(e => e.resolution === 'internal' && (config.rules.cycles.includeTypeOnly || e.kind === 'runtime'));
    const groups = components(nodes, internal);
    const membership = new Map<string, number>();
    groups.forEach((group, index) => group.forEach(node => membership.set(node, index)));
    const regions = groups.map(() => [] as Edge[]);
    for (const edge of internal) {
      const group = membership.get(edge.from);
      if (group !== undefined && group === membership.get(edge.to)) regions[group]!.push(edge);
    }
    for (const [index, group] of groups.entries()) {
      const region = regions[index]!;
      const evidence = cyclePath(group, region);
      const edge = region.find(e => e.from === evidence[0] && e.to === evidence[1])!;
      const fingerprint = digest({ version: 1, ruleId: 'dependency-cycle', edges: [...new Set(region.map(e => `${e.from}\0${e.to}`))].sort() });
      findings.set(fingerprint, {
        fingerprint, ruleId: 'dependency-cycle', severity: config.rules.cycles.severity,
        path: edge.from, line: edge.line, column: edge.column, status: 'new',
        message: `Dependency cycle involving ${group.length} file(s).`, evidence
      });
    }
  }
  return [...findings.values()].sort((a, b) => a.path.localeCompare(b.path, 'en') || a.ruleId.localeCompare(b.ruleId, 'en') || a.fingerprint.localeCompare(b.fingerprint, 'en'));
}
