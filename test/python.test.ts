import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scan } from '../src/core/scan.js';
import { defaultConfig, parseConfig, policyHash } from '../src/core/config.js';
import { createBaseline } from '../src/core/baseline.js';
import { runSetup } from '../src/setup/wizard.js';
import { inspectProject } from '../src/setup/project.js';
import { git } from '../src/core/git.js';

function write(root: string, file: string, text: string | Buffer): void {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), text);
}
function fixture(t: { after: (fn: () => void) => void }, files: Record<string, string> = {}): string {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'repo-assurance-python-')));
  t.after(() => {
    const target = fs.realpathSync.native(root);
    assert.equal(path.dirname(target), fs.realpathSync.native(os.tmpdir()));
    assert.ok(path.basename(target).startsWith('repo-assurance-python-'));
    fs.rmSync(target, { recursive: true, force: true });
  });
  for (const [name, text] of Object.entries(files)) write(root, name, text);
  configure(root);
  return root;
}
function configure(root: string, overrides: Record<string, unknown> = {}): void {
  write(root, '.assurance/config.json', JSON.stringify({
    ...defaultConfig(), mode: 'enforce', python: { sourceRoots: ['.'] },
    rules: { boundaries: [{ id: 'layer', from: ['**/ui/**'], disallow: ['**/storage/**'], severity: 'error' }], cycles: { enabled: true, severity: 'error' } },
    ...overrides
  }));
}
const packageFiles = { 'app/__init__.py': '', 'app/ui/__init__.py': '', 'app/storage/__init__.py': '', 'app/storage/orders.py': 'orders = []\n', 'app/ui/page.py': 'from ..storage.orders import orders\n' };
const cliPath = fileURLToPath(new URL('../src/cli.js', import.meta.url));

test('Python relative imports enforce boundaries with source locations and package initialization evidence', t => {
  const root = fixture(t, packageFiles);
  const report = scan({ root });
  assert.equal(report.result, 'FAIL');
  assert.match(report.tool.python!, /^3\./);
  assert.equal(report.scope.analyzedFiles, 5);
  assert.ok(report.findings.some(f => f.evidence[1] === 'app/storage/orders.py' && f.line === 1));
  assert.ok(report.edges.some(e => e.from === 'app/ui/page.py' && e.to === 'app/storage/__init__.py'));
  assert.deepEqual(report, scan({ root }));
});

test('Python service interface avoids the forbidden direct dependency', t => {
  const root = fixture(t, { ...packageFiles, 'app/service.py': 'from .storage.orders import orders\n', 'app/ui/page.py': 'from ..service import orders\n' });
  assert.equal(scan({ root }).result, 'PASS');
});

test('absolute imports, aliases, multiple names, and multiline from-imports are extracted', t => {
  const root = fixture(t, { ...packageFiles, 'main.py': 'import app.storage.orders as data, os\nfrom app.storage import (\n    orders as entries,\n)\n' });
  const report = scan({ root });
  assert.equal(report.diagnostics.length, 0);
  assert.ok(report.edges.some(e => e.from === 'main.py' && e.to === 'app/storage/orders.py' && e.line === 1));
  assert.ok(report.edges.some(e => e.from === 'main.py' && e.to === 'app/storage/orders.py' && e.line === 2));
  assert.ok(report.edges.some(e => e.to === 'external:os'));
});

test('Python src layout and explicit monorepo source roots resolve without PYTHONPATH execution', t => {
  const root = fixture(t, { 'src/pkg/a.py': 'from . import b\n', 'src/pkg/b.py': 'value = 1\n', 'main.py': 'import pkg.a\n' });
  configure(root, { python: { sourceRoots: ['.', 'src'] } });
  const srcReport = scan({ root });
  assert.equal(srcReport.result, 'PASS');
  assert.ok(srcReport.edges.some(e => e.specifier === '.b'));
  write(root, 'packages/backend/lib/shared.py', 'value=1\n');
  write(root, 'main.py', 'import shared\n');
  configure(root, { python: { sourceRoots: ['src', 'packages/backend/lib'] } });
  assert.ok(scan({ root }).edges.some(e => e.to === 'packages/backend/lib/shared.py'));
});

test('split namespace packages resolve child modules across configured roots', t => {
  const root = fixture(t, { 'one/ns/a.py': 'from . import b\n', 'two/ns/b.py': 'value=1\n' });
  configure(root, { python: { sourceRoots: ['one', 'two'] } });
  const report = scan({ root });
  assert.equal(report.result, 'PASS');
  assert.ok(report.edges.some(e => e.from === 'one/ns/a.py' && e.to === 'two/ns/b.py'));
});

test('conflicting module roots cannot silently pick the wrong architecture target', t => {
  const root = fixture(t, { 'a.py': 'value=1', 'src/a.py': 'value=2', 'main.py': 'import a' });
  configure(root, { python: { sourceRoots: ['.', 'src'] } });
  assert.ok(scan({ root }).diagnostics.some(d => /Multiple source roots/.test(d.message)));
});

test('module attributes are not mistaken for missing modules and missing namespace children are inconclusive', t => {
  const root = fixture(t, { 'values.py': 'value=1', 'main.py': 'from values import value', 'ns/other.py': 'value=2' });
  assert.equal(scan({ root }).result, 'PASS');
  write(root, 'main.py', 'from ns import missing');
  assert.equal(scan({ root }).result, 'INCONCLUSIVE');
});

test('local imports win over standard-library names and declared externals', t => {
  const root = fixture(t, { 'json.py': 'value=1', 'main.py': 'import json', 'ui/a.py': 'import storage.orders', 'storage/orders.py': 'value=1' });
  configure(root, { externals: ['json', 'storage'] });
  const report = scan({ root });
  assert.ok(report.edges.some(e => e.to === 'json.py'));
  assert.equal(report.result, 'FAIL');
  write(root, 'main.py', 'import json.missing');
  assert.ok(scan({ root }).diagnostics.some(d => d.code === 'PYTHON_IMPORT_UNRESOLVED'));
});

test('builtin module precedence and explicitly declared third-party import roots remain opaque', t => {
  const root = fixture(t, { 'sys.py': 'value=1', 'main.py': 'import sys\nimport requests.sessions\nfrom django import urls\n' });
  configure(root, { externals: ['requests', 'django'] });
  const report = scan({ root });
  assert.equal(report.result, 'PASS');
  assert.ok(report.edges.some(e => e.to === 'external:sys'));
  assert.ok(report.edges.some(e => e.to === 'external:requests.sessions'));
  assert.ok(report.edges.some(e => e.to === 'external:django'));
});

test('undeclared third-party imports are inconclusive even in observation mode', t => {
  const root = fixture(t, { 'main.py': 'import requests' });
  configure(root, { mode: 'observe' });
  const report = scan({ root });
  assert.equal(report.exitCode, 2);
  assert.equal(report.questions[0]?.code, 'PYTHON_IMPORT_UNRESOLVED');
  assert.throws(() => createBaseline(report, 'not permitted'), /incomplete/);
});

test('Python cycles and conditional/function-local dependencies are included', t => {
  const root = fixture(t, { 'a.py': 'def f():\n    import b\n', 'b.py': 'if True:\n    import a\n' });
  const report = scan({ root });
  assert.equal(report.findings[0]?.ruleId, 'dependency-cycle');
  assert.deepEqual(report.findings[0]?.evidence, ['a.py', 'b.py', 'a.py']);
});

test('literal dynamic imports and importlib aliases resolve without evaluating code', t => {
  const root = fixture(t, { 'target.py': 'value=1', 'main.py': 'import importlib as loader\nfrom importlib import import_module as load\nloader.import_module("target")\nload("target")\n__import__("target")\n' });
  const report = scan({ root });
  assert.equal(report.result, 'PASS');
  assert.equal(report.edges.filter(e => e.to === 'target.py').length, 3);
});

test('computed imports, relative dynamic loading, wildcard imports, and import hooks expose incomplete coverage', t => {
  const root = fixture(t, { 'main.py': 'import importlib, sys\nimportlib.import_module(name)\nimportlib.import_module(".x", "pkg")\nsys.path.append("other")\nfrom os import *\nexec("import secret")\n' });
  const report = scan({ root });
  assert.equal(report.exitCode, 2);
  for (const code of ['DYNAMIC_IMPORT', 'PYTHON_IMPORT_PATH', 'PYTHON_STAR_IMPORT', 'PYTHON_DYNAMIC_CODE']) assert.ok(report.diagnostics.some(d => d.code === code));
});

test('syntax errors and beyond-package relative imports are not successful scans', t => {
  const root = fixture(t, { 'bad.py': 'def broken(:', 'app/main.py': 'from ... import missing' });
  const report = scan({ root });
  assert.equal(report.result, 'INCONCLUSIVE');
  assert.equal(report.scope.analyzedFiles, 1);
  assert.ok(report.diagnostics.some(d => d.code === 'SYNTAX_ERROR'));
  assert.ok(report.diagnostics.some(d => /beyond the known package/.test(d.message)));
});

test('UTF-8 BOM, non-ASCII columns, and multiline strings are parsed as Python syntax', t => {
  const root = fixture(t, { 'target.py': 'value=1', 'main.py': '\ufefftext = "é"; import target\ntext = """import missing\nfrom fake import anything"""\n' });
  const report = scan({ root });
  assert.equal(report.result, 'PASS');
  assert.equal(report.edges[0]?.column, 13);
  assert.equal(report.edges.length, 1);
});

test('non-UTF-8 Python source is explicitly incomplete rather than decoded lossily', t => {
  const root = fixture(t);
  write(root, 'latin.py', Buffer.from('# coding: latin-1\ntext="\xe9"\n', 'latin1'));
  assert.ok(scan({ root }).diagnostics.some(d => d.code === 'PYTHON_ENCODING'));
});

test('excluded Python targets retain boundary evidence without traversing their bodies', t => {
  const root = fixture(t, packageFiles);
  configure(root, { include: ['app/ui/**'] });
  const report = scan({ root });
  assert.equal(report.result, 'FAIL');
  assert.ok(report.edges.some(e => e.to === 'app/storage/orders.py' && e.resolution === 'excluded'));
});

test('virtual environments, caches, and installed dependency folders are not source', t => {
  const root = fixture(t, { 'main.py': 'value=1', '.venv/lib/bad.py': 'import missing', 'venv/bad.py': 'import missing', '__pycache__/bad.py': 'import missing', 'site-packages/bad.py': 'import missing' });
  assert.equal(scan({ root }).scope.sourceFiles, 1);
});

test('missing Python runtime is explicit and does not break JavaScript-only analysis', t => {
  const root = fixture(t, { 'main.py': 'value=1' });
  const environment = { ...process.env, REPO_ASSURANCE_PYTHON: path.join(root, 'missing-python') };
  const python = spawnSync(process.execPath, [cliPath, 'scan', '--root', root, '--format', 'json'], { env: environment, encoding: 'utf8', timeout: 30_000 });
  assert.equal(python.status, 2);
  assert.equal(JSON.parse(python.stdout).diagnostics[0].code, 'PYTHON_RUNTIME_UNAVAILABLE');
  const js = fixture(t, { 'main.js': 'export const value=1;' });
  const javascript = spawnSync(process.execPath, [cliPath, 'scan', '--root', js], { env: environment, encoding: 'utf8', timeout: 30_000 });
  assert.equal(javascript.status, 0);
});

test('read-only Python analysis never imports application modules or sitecustomize and writes no bytecode', t => {
  const root = fixture(t, { 'main.py': 'import dangerous\n', 'dangerous.py': 'raise RuntimeError("must never execute")\n', 'sitecustomize.py': 'raise RuntimeError("must never load")\n' });
  const before = fs.readdirSync(root).sort();
  const result = spawnSync(process.execPath, [cliPath, 'scan', '--root', root], { env: { ...process.env, PYTHONPATH: root }, encoding: 'utf8', timeout: 30_000 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.deepEqual(fs.readdirSync(root).sort(), before);
  assert.equal(fs.existsSync(path.join(root, '__pycache__')), false);
});

test('Python resolution cannot escape through a symlinked source root', t => {
  const root = fixture(t, { 'main.py': 'import outside' });
  const outside = fixture(t, { 'outside.py': 'value=1' });
  fs.symlinkSync(outside, path.join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  configure(root, { python: { sourceRoots: ['linked'] }, exclude: ['linked/**'] });
  assert.ok(scan({ root }).diagnostics.some(d => d.code === 'PYTHON_SOURCE_ROOT'));
});

test('Python import casing cannot bypass canonical path boundary checks', t => {
  const root = fixture(t, { 'ui/a.py': 'import Storage.orders', 'storage/orders.py': 'value=1' });
  const report = scan({ root });
  if (fs.existsSync(path.join(root, 'Storage/orders.py'))) assert.equal(report.result, 'FAIL');
  else assert.equal(report.result, 'INCONCLUSIVE');
});

test('Python and TypeScript can share a scan and both produce verified findings', t => {
  const root = fixture(t, { ...packageFiles, 'ui/page.ts': 'import { value } from "../storage/store.js";', 'storage/store.ts': 'export const value=1;' });
  const report = scan({ root });
  assert.equal(report.diagnostics.length, 0);
  assert.equal(report.scope.analyzedFiles, 7);
  assert.ok(report.findings.some(f => f.path.endsWith('.py')));
  assert.ok(report.findings.some(f => f.path.endsWith('.ts')));
});

test('Python baselines match exact findings and source roots participate in policy identity', t => {
  const root = fixture(t, packageFiles);
  write(root, '.assurance/baseline.json', JSON.stringify(createBaseline(scan({ root }), 'Reviewed Python debt')));
  assert.equal(scan({ root }).result, 'PASS');
  write(root, 'app/ui/other.py', 'from ..storage.orders import orders');
  assert.equal(scan({ root }).result, 'FAIL');
  const original = defaultConfig();
  assert.notEqual(policyHash(original), policyHash({ ...original, python: { sourceRoots: ['backend'] } }));
  assert.throws(() => parseConfig('{"schemaVersion":1,"python":{"sourceRoots":["../outside"]}}'));
});

test('Python setup detects the language, reviews source roots and external imports, and supports read-only scan without config', async t => {
  const root = fixture(t, { 'src/app/main.py': 'import requests\n' });
  // Remove only the configuration created by this fixture to exercise first-time setup.
  fs.unlinkSync(path.join(root, '.assurance/config.json'));
  assert.deepEqual(inspectProject(root, defaultConfig()).languages, ['Python']);
  const answers = ['src', 'requests', 'y', '1', 'n', 'n', 'y'];
  let output = '';
  assert.equal(await runSetup({ root }, { write: text => { output += text; }, ask: async () => { const next = answers.shift(); assert.notEqual(next, undefined); return next!; } }), 0);
  const config = parseConfig(fs.readFileSync(path.join(root, '.assurance/config.json'), 'utf8'));
  assert.deepEqual(config.python.sourceRoots, ['src']);
  assert.deepEqual(config.externals, ['requests']);
  assert.match(output, /Python/);
  const readonly = fixture(t, { 'main.py': 'import json' });
  fs.unlinkSync(path.join(readonly, '.assurance/config.json'));
  assert.equal(scan({ root: readonly }).result, 'PASS');
  assert.equal(fs.existsSync(path.join(readonly, '.assurance/config.json')), false);
});

test('base-aware checks reject weakening of Python source roots and preserve current-base policy', t => {
  const root = fixture(t, packageFiles);
  git(root, ['init', '-b', 'main']);
  git(root, ['config', 'user.name', 'Tests']); git(root, ['config', 'user.email', 'tests@example.invalid']);
  git(root, ['add', '.']); git(root, ['commit', '-m', 'initial']);
  const base = git(root, ['rev-parse', 'HEAD']).trim();
  configure(root, { python: { sourceRoots: ['other'] } });
  git(root, ['add', '.']); git(root, ['commit', '-m', 'change source roots']);
  const report = scan({ root, base, enforce: true });
  assert.ok(report.diagnostics.some(d => d.code === 'PROTECTED_POLICY_CHANGE'));
  assert.ok(report.findings.some(f => f.ruleId === 'layer'));
});

test('Python parsing preserves all file identities across multiple batches', t => {
  const files = Object.fromEntries(Array.from({ length: 130 }, (_, i) => [`module${i.toString().padStart(3, '0')}.py`, 'import sys\n']));
  const root = fixture(t, files);
  const report = scan({ root });
  assert.equal(report.result, 'PASS');
  assert.equal(report.scope.analyzedFiles, 130);
  assert.equal(report.edges.length, 130);
  assert.ok(report.edges.some(e => e.from === 'module129.py'));
});

test('regular packages beat sibling modules and initialization does not create artificial self cycles', t => {
  const root = fixture(t, { 'pkg.py': 'import missing', 'pkg/__init__.py': 'from .child import value', 'pkg/child.py': 'value=1', 'main.py': 'import pkg' });
  configure(root, { exclude: ['pkg.py'] });
  const report = scan({ root });
  assert.equal(report.result, 'PASS');
  assert.ok(report.edges.some(e => e.from === 'main.py' && e.to === 'pkg/__init__.py'));
  assert.ok(report.edges.every(e => e.from !== e.to));
});

test('stdlib regular packages take precedence over local namespace-only portions', t => {
  const root = fixture(t, { 'json/local.py': 'value=1', 'main.py': 'import json' });
  const report = scan({ root });
  assert.equal(report.result, 'PASS');
  assert.ok(report.edges.some(e => e.to === 'external:json'));
});
