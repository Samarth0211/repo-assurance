export const VERSION = '0.1.0-alpha.1';

export type Severity = 'error' | 'warning';
export type Diagnostic = { code: string; message: string; path?: string };
export type SourceFile = { path: string; hash: string; bytes: number; text: string };
export type Edge = {
  from: string;
  to: string;
  specifier: string;
  line: number;
  column: number;
  kind: 'runtime' | 'type';
  resolution: 'internal' | 'external' | 'excluded';
};
export type Finding = {
  fingerprint: string;
  ruleId: string;
  severity: Severity;
  path: string;
  line: number;
  column: number;
  message: string;
  evidence: string[];
  status: 'new' | 'existing';
};
export type Question = {
  id: string;
  code: string;
  path?: string;
  question: string;
  reason: string;
};
export type Report = {
  schemaVersion: 1;
  tool: { name: string; version: string; typescript: string };
  mode: 'observe' | 'enforce';
  result: 'PASS' | 'FAIL' | 'INCONCLUSIVE';
  exitCode: 0 | 1 | 2;
  snapshot: {
    contentHash: string;
    policyHash: string;
    analysisHash: string;
    gitHead?: string;
    gitBase?: string;
    dirty?: boolean;
  };
  scope: {
    sourceFiles: number;
    analyzedFiles: number;
    sourceBytes: number;
    dependencies: number;
    excludedTargets: number;
    complete: boolean;
  };
  files: { path: string; hash: string; bytes: number }[];
  edges: Edge[];
  findings: Finding[];
  diagnostics: Diagnostic[];
  questions: Question[];
  baseline: { active: number; matched: number; resolved: string[] };
  limitations: string[];
};
