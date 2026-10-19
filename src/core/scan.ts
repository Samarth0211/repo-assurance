import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { analyzeTypeScript } from '../analyzers/typescript.js';
import { analyzePython } from '../analyzers/python.js';
import { evaluate } from '../policies/evaluate.js';
import { BASELINE_PATH, CONFIG_PATH, defaultConfig, parseBaseline, parseConfig, policyHash, readOptional } from './config.js';
import { discover, inventory, isPython } from './discovery.js';
import { git, gitFile, gitState, resolveCommit } from './git.js';
import { digest } from './hash.js';
import { TrackedIO } from './io.js';
import { VERSION, type Diagnostic, type Report } from './types.js';

export type ScanOptions = { root?: string; enforce?: boolean; base?: string; skipBaseline?: boolean };

export function scan(options: ScanOptions = {}): Report {
  const root = fs.realpathSync.native(options.root ?? process.cwd());
  if (!fs.statSync(root).isDirectory()) throw new Error('Repository root must be a directory.');
  const io = new TrackedIO(root);
  const diagnostics: Diagnostic[] = [];
  const startGit = gitState(root);
  const base = options.base ? resolveCommit(root, options.base) : undefined;
  const localConfig = readOptional(root, CONFIG_PATH);
  const localBaseline = readOptional(root, BASELINE_PATH);
  io.read(path.join(root, CONFIG_PATH));
  io.read(path.join(root, BASELINE_PATH));
  const configText = base ? gitFile(root, base, CONFIG_PATH) : localConfig;
  const baselineText = options.skipBaseline ? undefined : base ? gitFile(root, base, BASELINE_PATH) : localBaseline;
  const config = configText === undefined ? defaultConfig() : parseConfig(configText);
  const mode = options.enforce ? 'enforce' : config.mode;
  if (mode === 'enforce' && configText === undefined) diagnostics.push({ code: 'CONFIG_REQUIRED', message: 'Enforcement requires .assurance/config.json. Run init, review the scope and configure a blocking rule.' });
  if (mode === 'enforce' && !config.rules.boundaries.some(r => r.severity === 'error') && !(config.rules.cycles.enabled && config.rules.cycles.severity === 'error')) diagnostics.push({ code: 'NO_BLOCKING_RULES', message: 'No error-level rule is configured. Configure an explicit boundary or error-level cycle rule before enforcement.' });

  if (base) {
    const top = fs.realpathSync.native(git(root, ['rev-parse', '--show-toplevel']).trim());
    if (path.relative(top, root) !== '') throw new Error('--base requires the Git repository root, not a subdirectory.');
    if (!startGit.head) throw new Error('--base requires a committed Git checkout.');
    if (startGit.dirty) diagnostics.push({ code: 'DIRTY_CANDIDATE', message: 'A base-aware check requires a clean committed candidate.' });
    try { git(root, ['merge-base', '--is-ancestor', base, startGit.head]); }
    catch { diagnostics.push({ code: 'STALE_BASE', message: 'The candidate does not contain the selected base. Update the branch or analyze the integration candidate.' }); }
    // Compare validated semantics, not checkout-specific newlines or formatting.
    const sameConfig = digest(localConfig === undefined ? undefined : parseConfig(localConfig)) === digest(configText === undefined ? undefined : config);
    const sameBaseline = options.skipBaseline || digest(localBaseline === undefined ? undefined : parseBaseline(localBaseline)) === digest(baselineText === undefined ? undefined : parseBaseline(baselineText));
    if (!sameConfig || !sameBaseline) diagnostics.push({ code: 'PROTECTED_POLICY_CHANGE', message: 'This candidate changes protected policy/baseline files. Current checks use the base policy; a separate authorized policy-update process is required.' });
  }

  for (const file of ['package.json', 'package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock', '.pnp.cjs']) io.read(path.join(root, file));
  const found = discover(root, config, io);
  diagnostics.push(...found.diagnostics);
  if (!found.paths.length) diagnostics.push({ code: 'NO_SOURCE_FILES', message: 'No supported source files were found in the configured scope. This is not a successful repository verification.' });
  if (base) {
    const tracked = new Set(git(root, ['ls-files', '--cached', '-z']).split('\0'));
    for (const file of found.paths) if (!tracked.has(file)) diagnostics.push({ code: 'UNTRACKED_SOURCE', path: file, message: 'Candidate analysis includes untracked source; commit or exclude it before integration verification.' });
  }
  const typescript = analyzeTypeScript(root, found.files.filter(f => !isPython(f.path)), config, io);
  const python = analyzePython(root, found.files.filter(f => isPython(f.path)), config, io);
  const analyzed = { edges: [...typescript.edges, ...python.edges].sort((a, b) => a.from.localeCompare(b.from, 'en') || a.to.localeCompare(b.to, 'en') || a.line - b.line || a.column - b.column), diagnostics: [...typescript.diagnostics, ...python.diagnostics], analyzed: typescript.analyzed + python.analyzed };
  diagnostics.push(...analyzed.diagnostics);
  const findings = evaluate(found.files.map(f => f.path), analyzed.edges, config);
  const policy = policyHash(config);
  const baseline = baselineText === undefined ? undefined : parseBaseline(baselineText);
  const accepted = new Set<string>();
  if (baseline) {
    if (baseline.policyHash !== policy) diagnostics.push({ code: 'BASELINE_POLICY_MISMATCH', message: 'Baseline policy hash does not match current rules/scope. Review the policy and explicitly establish a compatible baseline.' });
    else for (const entry of baseline.entries) accepted.add(entry.fingerprint);
  }
  for (const finding of findings) if (accepted.has(finding.fingerprint)) finding.status = 'existing';
  const active = new Set(findings.map(f => f.fingerprint));
  const resolved = [...accepted].filter(id => !active.has(id)).sort();
  if (mode === 'enforce' && resolved.length) diagnostics.push({ code: 'BASELINE_RECONCILIATION_REQUIRED', message: `${resolved.length} baseline item(s) no longer exist. Reconcile and review the baseline so they cannot return under an old exemption.` });

  const endInventory = inventory(root, config);
  if (digest(found.paths) !== digest(endInventory.paths)) diagnostics.push({ code: 'SOURCE_SET_CHANGED', message: 'The source inventory changed while analyzing. Retry on an immutable checkout.' });
  const changed = io.changed();
  if (changed.length) diagnostics.push({ code: 'INPUT_CHANGED', message: `Inputs changed while analyzing: ${changed.slice(0, 10).join(', ')}. Retry on an immutable checkout.` });
  if (startGit.head !== gitState(root).head) diagnostics.push({ code: 'HEAD_CHANGED', message: 'Git HEAD changed during analysis.' });
  if (base && resolveCommit(root, options.base!) !== base) diagnostics.push({ code: 'BASE_CHANGED', message: 'The selected base reference moved during analysis. Revalidate the candidate.' });

  const uniqueDiagnostics = [...new Map(diagnostics.map(d => [digest(d), d])).values()].sort((a, b) => (a.path ?? '').localeCompare(b.path ?? '', 'en') || a.code.localeCompare(b.code, 'en') || a.message.localeCompare(b.message, 'en'));
  const result = uniqueDiagnostics.length ? 'INCONCLUSIVE' : findings.some(f => f.severity === 'error' && f.status === 'new') ? 'FAIL' : 'PASS';
  const contentHash = digest(found.files.map(({ path: filePath, hash, bytes }) => ({ path: filePath, hash, bytes })));
  const report: Report = {
    schemaVersion: 1,
    tool: { name: 'repo-assurance', version: VERSION, typescript: ts.version, ...(python.version ? { python: python.version } : {}) },
    mode, result,
    exitCode: result === 'INCONCLUSIVE' ? 2 : mode === 'enforce' && result === 'FAIL' ? 1 : 0,
    snapshot: {
      contentHash, policyHash: policy,
      analysisHash: digest({ version: VERSION, typescript: ts.version, python: python.version, config, inputs: io.fingerprint(), baseline, base, head: startGit.head }),
      gitHead: startGit.head, gitBase: base, dirty: startGit.dirty
    },
    scope: {
      sourceFiles: found.paths.length, analyzedFiles: analyzed.analyzed,
      sourceBytes: found.files.reduce((sum, f) => sum + f.bytes, 0),
      dependencies: analyzed.edges.length,
      excludedTargets: analyzed.edges.filter(e => e.resolution === 'excluded').length,
      complete: uniqueDiagnostics.length === 0
    },
    files: found.files.map(({ path: filePath, hash, bytes }) => ({ path: filePath, hash, bytes })),
    edges: analyzed.edges, findings, diagnostics: uniqueDiagnostics,
    questions: uniqueDiagnostics.filter(d => ['UNRESOLVED_IMPORT', 'PYTHON_IMPORT_UNRESOLVED', 'PYTHON_IMPORT_PATH', 'DYNAMIC_IMPORT', 'NO_BLOCKING_RULES'].includes(d.code)).map(d => ({
      id: digest(d).slice(0, 16), code: d.code, path: d.path,
      question: d.code === 'NO_BLOCKING_RULES' ? 'Which dependency boundaries or cycles should block changes in this project?' : d.code.startsWith('PYTHON_') ? 'Which Python source root or explicitly declared third-party module should provide this dependency?' : 'Is this dependency supported by the current compiler configuration, or is it a deliberate external/dynamic dependency?',
      reason: d.message
    })),
    baseline: { active: baseline?.entries.length ?? 0, matched: findings.filter(f => f.status === 'existing').length, resolved },
    limitations: [
      'Module dependency analysis only; no whole-program call/data-flow, dead-code proof, type-checking, security certification, or scalability proof.',
      'Cycles are checked only among included resolved source files; external dependencies and excluded targets are not traversed.',
      'TypeScript 6.0.3 parsing/resolution; custom bundler loaders, framework-generated entry points, and non-literal imports require explicit handling.',
      'Python uses an isolated Python 3.10+ AST helper; static local imports, source roots, and package initialization are modeled. Third-party modules require explicit externals; runtime hooks, attribute binding and conditional execution are not fully modeled.',
      'A local check does not configure branch protection or prevent hosting administrators from bypassing it.'
    ]
  };
  return report;
}
