import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { scan } from '../src/core/scan.js';
import { createBaseline, reconcileBaseline } from '../src/core/baseline.js';
import { defaultConfig, parseConfig, parseBaseline } from '../src/core/config.js';
import { git } from '../src/core/git.js';
import { components } from '../src/policies/graph.js';
import { sarifReport } from '../src/reporters/sarif.js';
import { VERSION } from '../src/core/types.js';

function fixture(t: { after: (fn: () => void) => void }, files: Record<string, string> = {}): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'repo-assurance-test-')));
  t.after(() => {
    const resolved = fs.realpathSync(root);
    const tempRoot = fs.realpathSync(os.tmpdir());
    assert.equal(path.dirname(resolved), tempRoot);
    assert.ok(path.basename(resolved).startsWith('repo-assurance-test-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  for (const [name, text] of Object.entries(files)) write(root, name, text);
  return root;
}
function write(root: string, name: string, text: string): void {
  fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
  fs.writeFileSync(path.join(root, name), text);
}
function config(root: string, overrides: Record<string, unknown> = {}): void {
  write(root, '.assurance/config.json', JSON.stringify({ ...defaultConfig(), mode: 'enforce', rules: { boundaries: [{ id: 'layer', from: ['src/ui/**'], disallow: ['src/db/**'], severity: 'error' }], cycles: { enabled: true, severity: 'error', includeTypeOnly: false } }, ...overrides }));
}
const badFiles = { 'src/ui/page.ts': 'import { value } from "../db/store.js"; export const page = value;', 'src/db/store.ts': 'export const value = 1;' };
function cli(root: string, args: string[]) {
  return spawnSync(process.execPath, [fileURLToPath(new URL('../src/cli.js', import.meta.url)), ...args, '--root', root], { encoding: 'utf8', timeout: 30_000 });
}
function commit(root: string, message: string): void { git(root, ['add', '.']); git(root, ['commit', '-m', message]); }
function repository(root: string): void {
  git(root, ['init', '-b', 'main']);
  git(root, ['config', 'user.name', 'Repo Assurance Tests']);
  git(root, ['config', 'user.email', 'tests@example.invalid']);
  config(root); commit(root, 'initial');
}

test('forbidden dependency produces a reproducible evidence-backed failure', t => {
  const root = fixture(t, badFiles); config(root);
  const a = scan({ root }); const b = scan({ root });
  assert.equal(a.result, 'FAIL'); assert.equal(a.exitCode, 1);
  assert.equal(a.findings.length, 1);
  assert.deepEqual(a.findings[0]?.evidence, ['src/ui/page.ts', 'src/db/store.ts']);
  assert.deepEqual(a, b);
});

test('allowed dependency passes and source is not changed', t => {
  const files = { 'src/service/index.ts': 'export { value } from "../db/store.js";', 'src/db/store.ts': 'export const value = 1;' };
  const root = fixture(t, files); config(root);
  assert.equal(scan({ root }).result, 'PASS');
  for (const [name, text] of Object.entries(files)) assert.equal(fs.readFileSync(path.join(root, name), 'utf8'), text);
});

test('observation reports violations with a non-blocking exit code', t => {
  const root = fixture(t, badFiles); config(root, { mode: 'observe' });
  const report = scan({ root }); assert.equal(report.result, 'FAIL'); assert.equal(report.exitCode, 0);
  assert.equal(scan({ root, enforce: true }).exitCode, 1);
});

test('missing source and empty enforcement cannot silently pass', t => {
  const root = fixture(t);
  const report = scan({ root, enforce: true });
  assert.equal(report.exitCode, 2);
  assert.ok(report.diagnostics.some(d => d.code === 'CONFIG_REQUIRED'));
  assert.ok(report.diagnostics.some(d => d.code === 'NO_SOURCE_FILES'));
});

test('schema rejects unknown fields, traversal and duplicated rule IDs', () => {
  assert.throws(() => parseConfig('{"schemaVersion":1,"mod":"enforce"}'));
  assert.throws(() => parseConfig('{"schemaVersion":1,"include":["../outside/**"]}'));
  assert.throws(() => parseConfig(JSON.stringify({ schemaVersion: 1, rules: { boundaries: [{ id: 'x', from: ['a'], disallow: ['b'] }, { id: 'x', from: ['a'], disallow: ['c'] }] } })));
});

test('unresolved imports are inconclusive and produce a targeted question', t => {
  const root = fixture(t, { 'a.ts': 'import x from "./missing.js";' }); config(root);
  const report = scan({ root }); assert.equal(report.exitCode, 2);
  assert.equal(report.questions[0]?.code, 'UNRESOLVED_IMPORT');
});

test('computed imports are inconclusive rather than ignored', t => {
  const root = fixture(t, { 'a.ts': 'const name = process.env.MODULE; import(name!);' }); config(root);
  assert.ok(scan({ root }).diagnostics.some(d => d.code === 'DYNAMIC_IMPORT'));
});

test('external declarations are explicit and can be forbidden by a policy', t => {
  const root = fixture(t, { 'src/ui/a.ts': 'import theme from "theme.css";' });
  config(root, { externals: ['*.css'], rules: { boundaries: [{ id: 'css', from: ['src/**'], disallow: ['external:*.css'] }] } });
  const report = scan({ root }); assert.equal(report.result, 'FAIL'); assert.equal(report.diagnostics.length, 0);
});

test('syntax errors prevent a successful gate', t => {
  const root = fixture(t, { 'a.ts': 'export const =' }); config(root);
  assert.ok(scan({ root }).diagnostics.some(d => d.code === 'SYNTAX_ERROR'));
});

test('nearest compiler configuration resolves aliases', t => {
  const root = fixture(t, { ...badFiles, 'src/ui/page.ts': 'import { value } from "@db/store.js";', 'tsconfig.json': JSON.stringify({ compilerOptions: { paths: { '@db/*': ['./src/db/*'] }, moduleResolution: 'Bundler', module: 'ESNext' } }) });
  config(root);
  const report = scan({ root }); assert.equal(report.result, 'FAIL'); assert.equal(report.findings[0]?.ruleId, 'layer');
});

test('runtime cycles are detected with an actual path', t => {
  const root = fixture(t, { 'a.ts': 'export { b } from "./b.js"; export const a=1;', 'b.ts': 'export { a } from "./a.js"; export const b=2;' }); config(root);
  const report = scan({ root }); assert.equal(report.result, 'FAIL');
  assert.deepEqual(report.findings[0]?.evidence, ['a.ts', 'b.ts', 'a.ts']);
});

test('type-only cycles are excluded unless requested', t => {
  const root = fixture(t, { 'a.ts': 'import type { B } from "./b.js"; export type A=B;', 'b.ts': 'import type { A } from "./a.js"; export type B=A;' }); config(root);
  assert.equal(scan({ root }).findings.length, 0);
  config(root, { rules: { cycles: { enabled: true, severity: 'error', includeTypeOnly: true } } });
  assert.equal(scan({ root }).findings[0]?.ruleId, 'dependency-cycle');
});

test('graph traversal handles a 30,000-node dependency chain without recursion', () => {
  const nodes = Array.from({ length: 30_000 }, (_, i) => `f${i}`);
  const edges = nodes.slice(1).map((to, i) => ({ from: nodes[i]!, to }));
  assert.equal(components(nodes, edges).length, 0);
  edges.push({ from: nodes.at(-1)!, to: nodes[0]! });
  assert.equal(components(nodes, edges)[0]?.length, nodes.length);
});

test('baseline survives line shifts but cannot hide a new violation', t => {
  const root = fixture(t, badFiles); config(root);
  const baseline = createBaseline(scan({ root }), 'Existing architecture debt');
  write(root, '.assurance/baseline.json', JSON.stringify(baseline));
  write(root, 'src/ui/page.ts', `\n\n${badFiles['src/ui/page.ts']}`);
  assert.equal(scan({ root }).result, 'PASS');
  write(root, 'src/ui/other.ts', badFiles['src/ui/page.ts']);
  const report = scan({ root }); assert.equal(report.result, 'FAIL'); assert.equal(report.baseline.matched, 1);
});

test('same-count replacement is not hidden by a baseline', t => {
  const root = fixture(t, badFiles); config(root);
  write(root, '.assurance/baseline.json', JSON.stringify(createBaseline(scan({ root }), 'Initial debt')));
  write(root, 'src/ui/page.ts', 'export const page=1;');
  write(root, 'src/ui/other.ts', badFiles['src/ui/page.ts']);
  const report = scan({ root }); assert.equal(report.findings.filter(f => f.status === 'new').length, 1);
  assert.equal(report.baseline.resolved.length, 1); assert.notEqual(report.exitCode, 0);
});

test('baseline reconciliation retires old exemptions and never adds new ones', t => {
  const root = fixture(t, badFiles); config(root);
  const baseline = createBaseline(scan({ root }), 'Initial debt');
  write(root, '.assurance/baseline.json', JSON.stringify(baseline));
  write(root, 'src/ui/page.ts', 'export const page=1;');
  const report = scan({ root }); assert.equal(report.exitCode, 2);
  const next = reconcileBaseline(baseline, report); assert.equal(next.entries.length, 0);
  write(root, '.assurance/baseline.json', JSON.stringify(next));
  write(root, 'src/ui/page.ts', badFiles['src/ui/page.ts']);
  assert.equal(scan({ root }).result, 'FAIL');
});

test('baseline creation refuses incomplete evidence and requires a reason', t => {
  const root = fixture(t, { 'a.ts': 'import "missing";' }); config(root);
  assert.throws(() => createBaseline(scan({ root }), 'Accept'), /incomplete/);
  write(root, 'a.ts', 'export const a=1;');
  assert.throws(() => createBaseline(scan({ root }), ''), /reason/);
});

test('baseline rejects duplicate exemptions and policy changes', t => {
  const root = fixture(t, badFiles); config(root);
  const baseline = createBaseline(scan({ root }), 'Initial');
  assert.throws(() => parseBaseline(JSON.stringify({ ...baseline, entries: [...baseline.entries, ...baseline.entries] })), /unique/);
  write(root, '.assurance/baseline.json', JSON.stringify(baseline));
  config(root, { exclude: ['tests/**'] });
  assert.ok(scan({ root }).diagnostics.some(d => d.code === 'BASELINE_POLICY_MISMATCH'));
});

test('file budgets expose incomplete coverage', t => {
  const root = fixture(t, { 'a.ts': 'export const a=1;', 'b.ts': 'export const b=2;' });
  config(root, { analysis: { maxFiles: 1, maxFileBytes: 2 } });
  const report = scan({ root }); assert.equal(report.scope.complete, false);
  assert.ok(report.diagnostics.some(d => d.code === 'FILE_BUDGET_EXCEEDED'));
  assert.ok(report.diagnostics.some(d => d.code === 'FILE_TOO_LARGE'));
});

test('source edits change analysis identity without changing violation identity', t => {
  const root = fixture(t, badFiles); config(root); const prior = scan({ root });
  write(root, 'src/db/store.ts', 'export const value = 2;');
  const next = scan({ root }); assert.notEqual(prior.snapshot.analysisHash, next.snapshot.analysisHash);
  assert.equal(prior.findings[0]?.fingerprint, next.findings[0]?.fingerprint);
});

test('SARIF preserves evidence, fingerprints and incomplete-execution status', t => {
  const root = fixture(t, { ...badFiles, 'missing.ts': 'import "not-installed";' }); config(root);
  const report = scan({ root });
  const sarif = sarifReport(report) as { runs: { invocations: { executionSuccessful: boolean }[]; results: { partialFingerprints: Record<string, string> }[] }[] };
  assert.equal(sarif.runs[0]?.invocations[0]?.executionSuccessful, false);
  assert.equal(sarif.runs[0]?.results[0]?.partialFingerprints['repoAssurance/v1'], report.findings[0]?.fingerprint);
});

test('CLI initializes safely, runs without a global install, and prints version', t => {
  const root = fixture(t, { 'a.ts': 'export const a=1;' });
  assert.equal(cli(root, ['init']).status, 0);
  assert.equal(cli(root, ['init']).status, 2);
  assert.equal(cli(root, ['--version']).stdout.trim(), VERSION);
  assert.equal(cli(root, ['scan', '--format', 'json']).status, 0);
  assert.equal(cli(root, ['check']).status, 2);
});

test('CLI rejects unknown flags and does not overwrite application JSON', t => {
  const root = fixture(t, { 'a.ts': 'export const a=1;', 'package.json': '{"name":"fixture"}' });
  assert.equal(cli(root, ['scan', '--unknown']).status, 2);
  assert.equal(cli(root, ['scan', '--output', path.join(root, 'package.json')]).status, 2);
  assert.equal(fs.readFileSync(path.join(root, 'package.json'), 'utf8'), '{"name":"fixture"}');
});

test('a five-day-old candidate cannot use clearance after ten intervening commits', t => {
  const root = fixture(t, { 'src/a.ts': 'export const a=1;' }); repository(root);
  const original = git(root, ['rev-parse', 'HEAD']).trim();
  git(root, ['switch', '-c', 'feature']); write(root, 'src/feature.ts', 'export const feature=1;'); commit(root, 'feature');
  assert.equal(scan({ root, enforce: true, base: original }).result, 'PASS');
  git(root, ['switch', 'main']);
  for (let i = 0; i < 10; i++) { write(root, `changes/${i}.txt`, `${i}`); commit(root, `intervening ${i}`); }
  const latest = git(root, ['rev-parse', 'HEAD']).trim(); git(root, ['switch', 'feature']);
  const stale = scan({ root, enforce: true, base: latest });
  assert.equal(stale.exitCode, 2); assert.ok(stale.diagnostics.some(d => d.code === 'STALE_BASE'));
  git(root, ['merge', '--no-edit', 'main']);
  assert.equal(scan({ root, enforce: true, base: latest }).result, 'PASS');
});

test('a PR cannot weaken its own rules or modify the baseline to authorize itself', t => {
  const root = fixture(t, { 'src/a.ts': 'export const a=1;' }); repository(root);
  const base = git(root, ['rev-parse', 'HEAD']).trim();
  for (const [name, text] of Object.entries(badFiles)) write(root, name, text);
  config(root, { rules: { cycles: { enabled: true, severity: 'warning' } } }); commit(root, 'weaken policy');
  const report = scan({ root, enforce: true, base });
  assert.ok(report.findings.some(f => f.ruleId === 'layer'));
  assert.ok(report.diagnostics.some(d => d.code === 'PROTECTED_POLICY_CHANGE'));
  assert.notEqual(report.exitCode, 0);
});

test('base-aware analysis rejects dirty and untracked candidate source', t => {
  const root = fixture(t, { 'src/a.ts': 'export const a=1;' }); repository(root);
  const base = git(root, ['rev-parse', 'HEAD']).trim();
  write(root, 'src/a.ts', 'export const a=2;'); write(root, 'src/untracked.ts', 'export const b=1;');
  const report = scan({ root, base, enforce: true });
  assert.ok(report.diagnostics.some(d => d.code === 'DIRTY_CANDIDATE'));
  assert.ok(report.diagnostics.some(d => d.code === 'UNTRACKED_SOURCE'));
});

test('Git-aware inventory respects ignore rules but retains tracked ignored sources', t => {
  const root = fixture(t, { 'src/a.ts': 'export const a=1;' }); repository(root);
  write(root, '.gitignore', 'generated/\n'); write(root, 'generated/new.ts', 'import "missing";');
  assert.equal(scan({ root }).scope.sourceFiles, 1);
  git(root, ['add', '-f', 'generated/new.ts']);
  assert.equal(scan({ root }).scope.sourceFiles, 2);
});

test('CLI refuses a configuration directory that redirects writes outside the repository', t => {
  const root = fixture(t, { 'a.ts': 'export const a=1;' });
  const outside = fixture(t);
  fs.symlinkSync(outside, path.join(root, '.assurance'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal(cli(root, ['init']).status, 2);
  assert.equal(fs.existsSync(path.join(outside, 'config.json')), false);
});

test('Git submodules are reported as unsupported instead of silently verified', t => {
  const root = fixture(t, { 'src/a.ts': 'export const a=1;' }); repository(root);
  const revision = git(root, ['rev-parse', 'HEAD']).trim();
  git(root, ['update-index', '--add', '--cacheinfo', `160000,${revision},vendor-module`]);
  assert.ok(scan({ root }).diagnostics.some(d => d.code === 'SUBMODULE_NOT_ANALYZED'));
});

test('Git filesystem monitor configuration cannot execute during analysis', t => {
  const root = fixture(t, { 'src/a.ts': 'export const a=1;' }); repository(root);
  git(root, ['config', 'core.fsmonitor', 'an-untrusted-command-that-must-not-run']);
  assert.equal(scan({ root }).result, 'PASS');
});

test('policy formatting changes do not masquerade as semantic policy changes', t => {
  const root = fixture(t, { 'src/a.ts': 'export const a=1;' }); repository(root);
  const base = git(root, ['rev-parse', 'HEAD']).trim();
  const policy = JSON.parse(fs.readFileSync(path.join(root, '.assurance/config.json'), 'utf8'));
  write(root, '.assurance/config.json', JSON.stringify(policy, null, 2).replaceAll('\n', '\r\n'));
  commit(root, 'format policy');
  const report = scan({ root, base, enforce: true });
  assert.equal(report.result, 'PASS');
});

test('import casing cannot bypass a boundary on a case-insensitive filesystem', t => {
  const root = fixture(t, { ...badFiles, 'src/ui/page.ts': 'import { value } from "../DB/store.js";' }); config(root);
  const report = scan({ root });
  if (fs.existsSync(path.join(root, 'src/DB/store.ts'))) {
    assert.equal(report.result, 'FAIL');
    assert.equal(report.findings[0]?.ruleId, 'layer');
  } else {
    assert.equal(report.result, 'INCONCLUSIVE');
    assert.ok(report.diagnostics.some(d => d.code === 'UNRESOLVED_IMPORT'));
  }
});
