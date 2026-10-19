import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASELINE_PATH, CONFIG_PATH, assertConfigDirectory, defaultConfig, parseConfig, readOptional } from '../core/config.js';
import { scan } from '../core/scan.js';
import type { Report } from '../core/types.js';
import { validateTarget, writeSetupFiles, type SetupFile } from './files.js';
import { GUIDE_PATH, PILOT_ENGINE_REVISION, WORKFLOW_PATH, pilotWorkflow, setupGuide } from './github.js';
import { inspectProject, suggestBoundaries } from './project.js';
import { SetupCancelled, choose, confirm, display, type SetupUI } from './prompts.js';

export type SetupOptions = { root?: string; yes?: boolean; github?: boolean };

function resolveFolder(value: string): string {
  let folder = value.trim();
  if ((folder.startsWith('"') && folder.endsWith('"')) || (folder.startsWith("'") && folder.endsWith("'"))) folder = folder.slice(1, -1);
  if (folder === '~' || /^~[\\/]/.test(folder)) folder = path.join(os.homedir(), folder.slice(2));
  const root = fs.realpathSync.native(folder || process.cwd());
  if (!fs.statSync(root).isDirectory()) throw new Error('Choose a project folder, not a file.');
  return root;
}

async function projectFolder(options: SetupOptions, ui: SetupUI): Promise<string> {
  if (options.root !== undefined || options.yes) return resolveFolder(options.root ?? process.cwd());
  while (true) {
    const answer = await ui.ask(`\nWhich project folder should we check? [${display(process.cwd())}]: `);
    try { return resolveFolder(answer); }
    catch { ui.write('That folder could not be opened. Enter an existing folder path, or press Ctrl+C to cancel.\n'); }
  }
}

function shellQuote(value: string): string {
  return process.platform === 'win32' ? `'${value.replaceAll("'", "''")}'` : `'${value.replaceAll("'", "'\\''")}'`;
}

function nextCommand(root: string, command: string): string {
  const cli = fileURLToPath(new URL('../cli.js', import.meta.url));
  return `node ${shellQuote(cli)} ${command} --root ${shellQuote(root)}`;
}

function firstReport(ui: SetupUI, report: Report): void {
  ui.write(`\nFirst scan: ${report.scope.analyzedFiles} of ${report.scope.sourceFiles} source files analyzed; ${report.scope.dependencies} dependencies.\n`);
  if (report.result === 'INCONCLUSIVE') ui.write('Analysis is incomplete. Resolve the items below before relying on these checks.\n');
  else if (report.findings.length) ui.write(`Found ${report.findings.filter(f => f.status === 'new').length} new issue(s) and ${report.baseline.matched} previously accepted issue(s).\n`);
  else ui.write('No violations found within the configured rules and analyzed source.\n');
  ui.write(report.mode === 'observe' ? 'Observation mode: architecture findings do not block changes.\n' : 'Enforcement mode: new error-level findings fail local scans. GitHub protections are configured separately.\n');
  for (const finding of report.findings.slice(0, 5)) {
    ui.write(`  - ${display(finding.path)}:${finding.line}: ${display(finding.message)} (${finding.status})\n`);
  }
  for (const diagnostic of report.diagnostics.slice(0, 5)) {
    ui.write(`  - ${display(diagnostic.code)}: ${display(diagnostic.message)}\n`);
  }
  if (report.findings.length > 5 || report.diagnostics.length > 5) ui.write('Showing the first five items of each kind. Run scan for the full report.\n');
  if (report.diagnostics.some(d => d.code === 'UNRESOLVED_IMPORT')) ui.write('Next: prepare this project with its normal dependency setup and verify its compiler paths, then scan again.\n');
  for (const question of report.questions.slice(0, 2)) ui.write(`Consider: ${display(question.question)}\n`);
}

export async function runSetup(options: SetupOptions, ui: SetupUI): Promise<number> {
  ui.write('Welcome to Repo Assurance!\nWe will help you choose checks, preview setup files, and run your first scan.\n');
  if (options.yes) ui.write('Using unattended defaults: observation, cycle checks, no guessed boundaries. Existing policy is preserved.\n');
  const root = await projectFolder(options, ui);
  assertConfigDirectory(root);
  const existingText = readOptional(root, CONFIG_PATH);
  if (existingText === undefined && readOptional(root, BASELINE_PATH) !== undefined) throw new Error('A baseline exists without its configuration. Restore or review the original policy before running setup.');
  const config = existingText === undefined ? defaultConfig() : parseConfig(existingText);
  ui.write(`\nProject: ${display(root)}\nInspecting supported source files...\n`);
  const project = inspectProject(root, config);
  if (!project.paths.length) throw new Error('No TypeScript, JavaScript, or Python source was found in the selected scope. Check the folder, Git ignore rules, and existing include/exclude settings. No setup files were written; other languages are not supported yet.');
  ui.write(`Found ${project.paths.length} ${project.languages.join('/')} source file(s).\n`);
  if (project.frameworks.length) ui.write(`Recognized packages: ${project.frameworks.join(', ')}.\n`);
  if (project.languages.includes('Python')) ui.write('Python analysis needs Python 3.10+ on PATH. It reads imports without running your code. Third-party import names must be reviewed and declared in externals.\n');
  for (const note of project.notes.slice(0, 3)) ui.write(`Note: ${display(note)}\n`);
  if (existingText !== undefined) {
    ui.write(`Existing ${CONFIG_PATH} found. Its scope, rules, and ${config.mode === 'observe' ? 'observation' : 'enforcement'} mode will be kept unchanged.\n`);
  } else {
    if (!options.yes && project.languages.includes('Python')) {
      while (true) {
        const answer = await ui.ask('\nPython import source folders, separated by commas [., src]: ');
        if (!answer) break;
        try {
          const checked = parseConfig(JSON.stringify({ ...config, python: { sourceRoots: answer.split(',').map(s => s.trim()) } }));
          config.python = checked.python;
          break;
        } catch { ui.write('Enter repository-relative folders separated by commas; use . for the project root.\n'); }
      }
      while (true) {
        const answer = await ui.ask('Third-party Python import names (for example requests, django); leave blank to review unresolved imports: ');
        if (!answer) break;
        const names = [...new Set(answer.split(',').map(s => s.trim()))];
        if (names.length <= 200 && names.every(name => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name))) { config.externals = names; break; }
        ui.write('Enter top-level import names separated by commas, without versions, wildcards, or installation commands.\n');
      }
    }
    if (!options.yes && project.scopes.length) {
      const scopes = project.scopes.slice(0, 20);
      const selected = await choose(ui, 'How much of the project should we inspect?', ['All supported source in this repository (recommended)', ...scopes.map(scope => `${scope.slice(0, -3)} only`)]);
      if (selected) config.include = [scopes[selected - 1]!];
      if (project.scopes.length > scopes.length) ui.write('Only the first 20 package choices are shown; All covers every detected package.\n');
    }
    const suggestions = suggestBoundaries(project.paths, config.include);
    if (!options.yes && suggestions.length) {
      ui.write('\nThese suggestions come from folder names. Confirm only rules that match your intended design.\n');
      for (const boundary of suggestions.slice(0, 10)) {
        ui.write(`\nSuggested rule: ${boundary.from.join(', ')} should not import ${boundary.disallow.join(', ')} directly.\n`);
        if (await confirm(ui, 'Does this rule match your project? Add it?', false)) config.rules.boundaries.push(boundary);
      }
      if (suggestions.length > 10) ui.write('Additional boundaries can be configured later; the wizard offers at most 10 suggestions.\n');
    } else if (!suggestions.length) ui.write('No clear UI/storage boundary was detected. Custom rules can be added later.\n');
    config.rules.cycles = { enabled: options.yes || await confirm(ui, '\nCheck for circular dependencies (A depends on B, which depends on A)?', true), severity: 'error', includeTypeOnly: false };
    const blocking = config.rules.cycles.enabled || config.rules.boundaries.length > 0;
    if (!options.yes && blocking) {
      const mode = await choose(ui, 'How would you like to start?', ['Report issues without blocking developers (recommended)', 'Fail local scans when the selected rules are broken']);
      config.mode = mode === 0 ? 'observe' : 'enforce';
    }
    if (!blocking) ui.write('No rules selected. The first scan will check analysis coverage only; it cannot verify architecture rules.\n');
  }

  const github = options.github || (!options.yes && await confirm(ui, '\nGenerate a GitHub pilot workflow and setup checklist?', false));
  const files: SetupFile[] = [];
  const preserved: string[] = [];
  if (existingText === undefined) files.push({ path: CONFIG_PATH, content: `${JSON.stringify(config, null, 2)}\n` });
  else preserved.push(CONFIG_PATH);
  if (github) {
    if (validateTarget(root, WORKFLOW_PATH)) preserved.push(WORKFLOW_PATH);
    else files.push({ path: WORKFLOW_PATH, content: pilotWorkflow() });
  }
  if (validateTarget(root, GUIDE_PATH)) preserved.push(GUIDE_PATH);
  else files.push({ path: GUIDE_PATH, content: setupGuide() });
  // Reject conflicting or redirected destinations before asking the user to save.
  for (const file of files) if (validateTarget(root, file.path)) throw new Error(`${file.path} already exists. Run setup again to reuse it.`);
  ui.write(`\nReview your setup\nScope: ${display(config.include.join(', '))}\nMode: ${config.mode === 'observe' ? 'report only' : 'local enforcement'}\nBoundary rules: ${config.rules.boundaries.length}; circular-dependency check: ${config.rules.cycles.enabled ? 'on' : 'off'}\n`);
  for (const file of files) ui.write(`Create: ${file.path}\n`);
  if (project.languages.includes('Python')) ui.write(`Python source folders: ${display(config.python.sourceRoots.join(', '))}\nDeclared external imports: ${display(config.externals.join(', ') || 'none')}\n`);
  for (const file of preserved) ui.write(`Keep unchanged: ${file}\n`);
  if (github) ui.write(`GitHub: a pilot report, with analyzer pinned to ${PILOT_ENGINE_REVISION.slice(0, 12)}. No GitHub settings are changed.\n`);
  if (!options.yes) {
    if (files.length && await confirm(ui, '\nShow the full contents of the proposed files?', false)) {
      for (const file of files) ui.write(`\n--- ${file.path} ---\n${file.content}\n`);
    }
    if (!await confirm(ui, '\nSave these new files and run the first scan?', true)) throw new SetupCancelled();
  }
  if (readOptional(root, CONFIG_PATH) !== existingText) throw new Error('Configuration changed during setup. Run setup again to review the current policy.');
  writeSetupFiles(root, files);
  ui.write(`\nSetup files ready. ${files.length} new file(s); existing files preserved.\nRunning your first scan...\n`);
  const report = scan({ root });
  firstReport(ui, report);
  ui.write(`\nRun again:\n  ${display(nextCommand(root, 'scan'))}\nCheck readiness:\n  ${display(nextCommand(root, 'doctor'))}\n`);
  if (github) ui.write(`\nGitHub next: review and commit ${WORKFLOW_PATH} and .assurance/. Push through your normal review process, then open a PR and view the Actions log.\nThe pilot does not establish merge protection. Follow the owner checklist in ${GUIDE_PATH} before blocking merges.\nProject dependencies are not installed by the generated workflow; missing packages will be reported.\n`);
  ui.write(`\nYour next-step guide: ${GUIDE_PATH}\nNo source files were rewritten and no existing findings were accepted automatically.\n`);
  return report.exitCode;
}
