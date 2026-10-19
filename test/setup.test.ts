import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { defaultConfig, parseConfig } from '../src/core/config.js';
import { createBaseline } from '../src/core/baseline.js';
import { scan } from '../src/core/scan.js';
import { runSetup } from '../src/setup/wizard.js';
import { SetupCancelled, type SetupUI } from '../src/setup/prompts.js';
import { inspectProject, suggestBoundaries } from '../src/setup/project.js';
import { validateTarget, writeSetupFiles } from '../src/setup/files.js';
import { GUIDE_PATH, PILOT_ENGINE_REVISION, WORKFLOW_PATH, pilotWorkflow } from '../src/setup/github.js';

const badFiles = { 'src/ui/page.ts': 'import { value } from "../storage/store.js"; export const page = value;', 'src/storage/store.ts': 'export const value = 1;' };
function write(root: string, file: string, text: string): void {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), text);
}
function fixture(t: { after: (fn: () => void) => void }, files: Record<string, string> = badFiles): string {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'repo-assurance-setup-')));
  t.after(() => {
    const target = fs.realpathSync.native(root);
    assert.equal(path.dirname(target), fs.realpathSync.native(os.tmpdir()));
    assert.ok(path.basename(target).startsWith('repo-assurance-setup-'));
    fs.rmSync(target, { recursive: true, force: true });
  });
  for (const [name, text] of Object.entries(files)) write(root, name, text);
  return root;
}
function scripted(answers: string[] = []): SetupUI & { output: string; remaining(): number } {
  let index = 0;
  return {
    output: '',
    write(text) { this.output += text; },
    async ask(question) {
      this.output += question;
      if (index === answers.length) throw new SetupCancelled();
      return answers[index++]!;
    },
    remaining: () => answers.length - index
  };
}
const read = (root: string, file: string): string => fs.readFileSync(path.join(root, file), 'utf8');
const policy = (root: string) => parseConfig(read(root, '.assurance/config.json'));
const exists = (root: string, file: string): boolean => fs.existsSync(path.join(root, file));
function cli(root: string, args: string[], input = '') {
  return spawnSync(process.execPath, [fileURLToPath(new URL('../src/cli.js', import.meta.url)), ...args, '--root', root], { input, encoding: 'utf8', timeout: 30_000 });
}

test('configuration defaults are independent across project setup sessions', () => {
  const first = defaultConfig();
  first.rules.boundaries.push({ id: 'example', from: ['ui/**'], disallow: ['db/**'], severity: 'error' });
  first.rules.cycles.enabled = false;
  assert.deepEqual(defaultConfig().rules.boundaries, []);
  assert.equal(defaultConfig().rules.cycles.enabled, true);
  assert.deepEqual(parseConfig('{"schemaVersion":1}').rules.boundaries, []);
});

test('guided setup confirms a real boundary, previews files, and reports the first violation without editing source', async t => {
  const root = fixture(t);
  const ui = scripted(['yes', '', '', 'no', 'yes', 'yes']);
  assert.equal(await runSetup({ root }, ui), 0);
  assert.equal(ui.remaining(), 0);
  assert.equal(policy(root).mode, 'observe');
  assert.equal(policy(root).rules.boundaries.length, 1);
  assert.match(ui.output, /Found 1 new issue/);
  assert.match(ui.output, /"from":/);
  assert.match(ui.output, /Observation mode/);
  assert.equal(exists(root, '.assurance/baseline.json'), false);
  for (const [name, text] of Object.entries(badFiles)) assert.equal(read(root, name), text);
});

test('enforcement is an explicit choice and a new violation fails the first scan', async t => {
  const root = fixture(t);
  const ui = scripted(['y', 'y', '2', 'n', 'n', 'y']);
  assert.equal(await runSetup({ root }, ui), 1);
  assert.equal(policy(root).mode, 'enforce');
  assert.match(ui.output, /Enforcement mode/);
});

test('declining a guessed boundary does not add it to the project', async t => {
  const root = fixture(t);
  assert.equal(await runSetup({ root }, scripted(['', '', '', '', '', ''])), 0);
  assert.deepEqual(policy(root).rules.boundaries, []);
  assert.equal(exists(root, WORKFLOW_PATH), false);
});

test('unattended setup needs no input and uses observation without accepting guessed boundaries', async t => {
  const root = fixture(t);
  const ui = scripted();
  assert.equal(await runSetup({ root, yes: true }, ui), 0);
  assert.equal(policy(root).mode, 'observe');
  assert.deepEqual(policy(root).rules.boundaries, []);
  assert.equal(policy(root).rules.cycles.enabled, true);
  assert.equal(exists(root, GUIDE_PATH), true);
  assert.equal(exists(root, WORKFLOW_PATH), false);
});

test('incomplete first scan stays inconclusive and never creates a baseline', async t => {
  const root = fixture(t, { 'index.ts': 'import "uninstalled-package";' });
  const ui = scripted();
  assert.equal(await runSetup({ root, yes: true }, ui), 2);
  assert.match(ui.output, /Analysis is incomplete/);
  assert.match(ui.output, /normal dependency setup/);
  assert.equal(exists(root, '.assurance/baseline.json'), false);
});

test('repeat setup preserves existing policy, accepted findings, workflow and notes byte for byte', async t => {
  const root = fixture(t);
  const config = defaultConfig();
  config.mode = 'enforce';
  config.rules.boundaries = suggestBoundaries(Object.keys(badFiles), config.include);
  write(root, '.assurance/config.json', JSON.stringify(config));
  write(root, '.assurance/baseline.json', JSON.stringify(createBaseline(scan({ root }), 'Reviewed existing debt')));
  write(root, WORKFLOW_PATH, '# existing company workflow\n');
  write(root, GUIDE_PATH, '# existing team guide\n');
  const paths = ['.assurance/config.json', '.assurance/baseline.json', WORKFLOW_PATH, GUIDE_PATH];
  const before = paths.map(file => read(root, file));
  const ui = scripted();
  assert.equal(await runSetup({ root, yes: true, github: true }, ui), 0);
  assert.deepEqual(paths.map(file => read(root, file)), before);
  assert.match(ui.output, /0 new file/);
  assert.equal(policy(root).mode, 'enforce');
});

test('unsupported or empty projects do not receive a misleading setup', async t => {
  const root = fixture(t, { 'main.go': 'package main' });
  await assert.rejects(runSetup({ root, yes: true }, scripted()), /No TypeScript, JavaScript, or Python/);
  assert.equal(exists(root, '.assurance'), false);
});

test('a mistyped folder can be corrected during interactive setup', async t => {
  const root = fixture(t, { 'hello.js': 'export const hello=1;' });
  const ui = scripted([path.join(root, 'not-there'), `"${root}"`, '', '', '', '', '']);
  assert.equal(await runSetup({}, ui), 0);
  assert.match(ui.output, /folder could not be opened/);
  assert.match(ui.output, /JavaScript/);
});

test('cancel at the final preview leaves all proposed paths absent', async t => {
  const root = fixture(t);
  const ui = scripted(['y', 'y', '1', 'y', 'n', 'n']);
  await assert.rejects(runSetup({ root }, ui), SetupCancelled);
  assert.equal(exists(root, '.assurance'), false);
  assert.equal(exists(root, '.github'), false);
});

test('invalid choices are explained and asked again', async t => {
  const root = fixture(t);
  const ui = scripted(['maybe', 'y', 'y', '22', '1', 'n', 'n', 'y']);
  assert.equal(await runSetup({ root }, ui), 0);
  assert.match(ui.output, /Enter yes or no/);
  assert.match(ui.output, /Enter a number from 1 to 2/);
});

test('monorepo selection narrows scope only after a choice and avoids cross-package suggestions', async t => {
  const root = fixture(t, {
    'apps/shop/src/ui/page.ts': 'export const page=1;',
    'apps/shop/src/storage/store.ts': 'export const store=1;',
    'packages/server/src/index.ts': 'import "missing";'
  });
  const ui = scripted(['2', 'y', 'y', '1', 'n', 'n', 'y']);
  assert.equal(await runSetup({ root }, ui), 0);
  assert.deepEqual(policy(root).include, ['apps/shop/**']);
  assert.deepEqual(policy(root).rules.boundaries[0]?.from, ['apps/shop/src/ui/**']);
  assert.match(ui.output, /2 of 2 source files/);
  assert.deepEqual(suggestBoundaries(['apps/web/src/ui/a.ts', 'apps/api/src/storage/b.ts'], ['**/*']), []);
});

test('folder suggestions cannot turn literal special characters into broad glob rules', () => {
  assert.deepEqual(suggestBoundaries(['apps/[ab]/src/ui/a.ts', 'apps/[ab]/src/storage/b.ts'], ['**/*']), []);
});

test('framework detection reads manifest hints without running package scripts', t => {
  const root = fixture(t, { 'hello.ts': 'export const value=1;', 'package.json': JSON.stringify({ dependencies: { react: '*' }, scripts: { preinstall: 'this-must-never-run' } }) });
  const found = inspectProject(root, defaultConfig());
  assert.deepEqual(found.frameworks, ['React']);
  assert.deepEqual(found.languages, ['TypeScript']);
});

test('symlinked output directories cannot redirect wizard writes', async t => {
  for (const folder of ['.assurance', '.github']) {
    const root = fixture(t);
    const outside = fixture(t, {});
    fs.symlinkSync(outside, path.join(root, folder), process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(runSetup({ root, yes: true, github: true }, scripted()), /real directory|Unsafe setup path/);
    assert.deepEqual(fs.readdirSync(outside), []);
    assert.equal(exists(root, '.assurance/config.json'), false);
  }
});

test('a file created after preview cannot be overwritten or leave a new policy behind', async t => {
  const root = fixture(t);
  const ui = scripted(['y', 'y', '1', 'y', 'n', 'y']);
  const ask = ui.ask.bind(ui);
  ui.ask = async question => {
    if (question.includes('Save these')) write(root, WORKFLOW_PATH, 'created by someone else');
    return ask(question);
  };
  await assert.rejects(runSetup({ root }, ui), /Refusing to overwrite/);
  assert.equal(read(root, WORKFLOW_PATH), 'created by someone else');
  assert.equal(exists(root, '.assurance/config.json'), false);
});

test('a concurrent policy change aborts setup before writing helper files', async t => {
  const root = fixture(t);
  write(root, '.assurance/config.json', JSON.stringify(defaultConfig()));
  const ui = scripted(['n', 'n', 'y']);
  const ask = ui.ask.bind(ui);
  ui.ask = async question => {
    if (question.includes('Save these')) write(root, '.assurance/config.json', JSON.stringify({ ...defaultConfig(), include: ['src/**'] }));
    return ask(question);
  };
  await assert.rejects(runSetup({ root }, ui), /Configuration changed/);
  assert.equal(exists(root, GUIDE_PATH), false);
});

test('orphan baselines and malformed existing policies require review without replacement', async t => {
  const root = fixture(t);
  write(root, '.assurance/baseline.json', '{}');
  await assert.rejects(runSetup({ root, yes: true }, scripted()), /baseline exists without/);
  assert.equal(exists(root, '.assurance/config.json'), false);
  write(root, '.assurance/config.json', '{broken');
  await assert.rejects(runSetup({ root, yes: true }, scripted()));
  assert.equal(read(root, '.assurance/config.json'), '{broken');
  assert.equal(exists(root, GUIDE_PATH), false);
});

test('safe file planning rejects traversal and checks all conflicts before any write', t => {
  const root = fixture(t);
  assert.throws(() => validateTarget(root, '../outside.json'), /inside/);
  write(root, GUIDE_PATH, 'existing');
  assert.throws(() => writeSetupFiles(root, [{ path: '.assurance/config.json', content: '{}' }, { path: GUIDE_PATH, content: 'replacement' }]), /overwrite/);
  assert.equal(exists(root, '.assurance/config.json'), false);
});

test('generated GitHub pilot pins the analyzer separately and never runs target installation or privileged triggers', async t => {
  const root = fixture(t);
  assert.equal(await runSetup({ root, yes: true, github: true }, scripted()), 0);
  const workflow = read(root, WORKFLOW_PATH);
  assert.equal(workflow, pilotWorkflow());
  assert.match(workflow, /permissions:\n  contents: read/);
  assert.match(workflow, new RegExp(`ref: ${PILOT_ENGINE_REVISION}`));
  assert.match(workflow, /path: candidate/);
  assert.match(workflow, /path: assurance-tool/);
  assert.equal((workflow.match(/persist-credentials: false/g) ?? []).length, 2);
  assert.equal((workflow.match(/uses: [^\n]+@[a-f0-9]{40}/g) ?? []).length, 4);
  assert.match(workflow, /python-version: '3.13'/);
  assert.doesNotMatch(workflow, /pull_request_target|secrets\.|continue-on-error|working-directory: candidate/);
  assert.match(read(root, GUIDE_PATH), /not an authoritative merge gate/);
  assert.match(read(root, GUIDE_PATH), /up-to-date branches/);
});

test('real CLI consumes piped interactive answers and exits without hanging', t => {
  const root = fixture(t);
  const result = cli(root, ['setup'], 'y\ny\n1\nn\nn\ny\n');
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(policy(root).rules.boundaries.length, 1);
  assert.match(result.stdout, /First scan/);
});

test('CLI EOF cancels before writing and noninteractive flags cannot leak to other commands', t => {
  const root = fixture(t);
  assert.equal(cli(root, ['setup']).status, 130);
  assert.equal(exists(root, '.assurance'), false);
  assert.equal(cli(root, ['scan', '--yes']).status, 2);
  assert.equal(cli(root, ['setup', '--format', 'json']).status, 2);
  assert.equal(cli(root, ['setup', '--yes']).status, 0);
});
