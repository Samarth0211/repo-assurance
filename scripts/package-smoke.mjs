import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const npm = process.env.npm_execpath;
if (!npm) throw new Error('Run this script through npm run test:package.');
const workspace = process.cwd();
const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'repo-assurance-package-')));
try {
  const packed = JSON.parse(execFileSync(process.execPath, [npm, 'pack', '--json', '--pack-destination', temp], { cwd: workspace, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000 }));
  const artifact = packed[0];
  assert.ok(artifact.files.some(f => f.path === 'LICENSE'));
  assert.ok(artifact.files.some(f => f.path === 'dist/src/cli.js'));
  assert.ok(artifact.files.some(f => f.path === 'IMPLEMENTATION_PLAN.md'));
  assert.ok(!artifact.files.some(f => f.path.startsWith('test/') || f.path.includes('node_modules/')));
  const prefix = path.join(temp, 'install');
  execFileSync(process.execPath, [npm, 'install', '--ignore-scripts', '--no-audit', '--no-fund', '--prefix', prefix, path.join(temp, artifact.filename)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000 });
  const packageRoot = path.join(prefix, 'node_modules/@samarth0211/repo-assurance');
  const cli = path.join(packageRoot, 'dist/src/cli.js');
  const version = execFileSync(process.execPath, [cli, '--version'], { encoding: 'utf8' }).trim();
  const expected = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
  assert.equal(version, expected);
  const demo = spawnSync(process.execPath, [cli, 'check', '--root', path.join(workspace, 'examples/boundary-demo')], { encoding: 'utf8', timeout: 30_000 });
  assert.equal(demo.status, 1, demo.stderr || demo.stdout);
  assert.match(demo.stdout, /ui-must-use-service/);
  const api = await import(pathToFileURL(path.join(packageRoot, 'dist/src/index.js')).href);
  assert.equal(typeof api.scan, 'function');
  process.stdout.write(`Packed and installed ${artifact.filename}; CLI, API, license and expected failing demo verified (${artifact.files.length} packaged files).\n`);
} finally {
  const resolved = fs.realpathSync(temp);
  assert.equal(path.dirname(resolved), fs.realpathSync(os.tmpdir()));
  assert.ok(path.basename(resolved).startsWith('repo-assurance-package-'));
  fs.rmSync(resolved, { recursive: true, force: true });
}
