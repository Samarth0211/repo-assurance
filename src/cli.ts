#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { randomUUID } from 'node:crypto';
import { createBaseline, reconcileBaseline } from './core/baseline.js';
import { BASELINE_PATH, CONFIG_PATH, assertConfigDirectory, defaultConfig, parseBaseline, readOptional } from './core/config.js';
import { scan } from './core/scan.js';
import { VERSION } from './core/types.js';
import { textReport } from './reporters/text.js';
import { sarifReport } from './reporters/sarif.js';
import { runSetup } from './setup/wizard.js';
import { SetupCancelled, terminalUI } from './setup/prompts.js';

const HELP = `Repo Assurance ${VERSION}

Usage: repo-assurance <command> [options]

Commands:
  setup                 Guided setup: choose a project, review rules, run a first scan
  init                  Create reviewable .assurance/config.json (never overwrite)
  scan                  Analyze using the configured observation/enforcement mode
  check                 Require complete analysis and enforce error-level rules
  doctor                Show runtime, configuration and analysis readiness
  baseline create       Accept existing findings; requires --reason
  baseline reconcile    Retire resolved baseline entries; never adds exemptions

Options:
  --root <directory>    Repository to inspect (default: current directory)
  --base <git-ref>      check only: use trusted base policy and require fresh ancestry
  --format <format>     text (default), json, or sarif
  --output <file>       Write the report to a file as well as returning its exit code
  --reason <text>       Why current findings are being accepted in a new baseline
  --yes                setup only: unattended observation defaults; preserve existing policy
  --github             setup only: include a GitHub pilot workflow and owner checklist
  --help               Show this help
  --version            Print version

Exit codes: 0 permitted/observation, 1 enforced violation, 2 incomplete/error, 130 setup cancelled.
No commands install dependencies, execute repository scripts, or repair source.
`;

function writeNew(file: string, text: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, { encoding: 'utf8', flag: 'wx' });
}

function replaceReport(file: string, text: string): void {
  const absolute = path.resolve(file);
  if (!/\.(json|sarif|txt)$/i.test(absolute) || absolute.split(path.sep).includes('.assurance')) throw new Error('Report output must be a .json, .sarif, or .txt file outside .assurance/.');
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  if (fs.existsSync(absolute) && (!fs.lstatSync(absolute).isFile() || fs.lstatSync(absolute).isSymbolicLink())) throw new Error('Report target must be a regular file.');
  if (fs.existsSync(absolute)) {
    const previous = fs.readFileSync(absolute, 'utf8');
    let recognized = previous.startsWith('Repo Assurance ');
    try {
      const data = JSON.parse(previous) as { tool?: { name?: string }; runs?: { tool?: { driver?: { name?: string } } }[] };
      recognized ||= data.tool?.name === 'repo-assurance' || data.runs?.[0]?.tool?.driver?.name === 'repo-assurance';
    } catch { /* A text report can also be recognized by its header. */ }
    if (!recognized) throw new Error('Refusing to overwrite a file that is not an existing Repo Assurance report.');
  }
  const temp = `${absolute}.${randomUUID()}.tmp`;
  try { fs.writeFileSync(temp, text, { encoding: 'utf8', flag: 'wx' }); fs.renameSync(temp, absolute); }
  finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}

async function main(): Promise<number> {
  const args = parseArgs({
    allowPositionals: true, strict: true,
    options: {
      root: { type: 'string' }, base: { type: 'string' }, format: { type: 'string', default: 'text' },
      output: { type: 'string' }, reason: { type: 'string' },
      yes: { type: 'boolean' }, github: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' }, version: { type: 'boolean', short: 'v' }
    }
  });
  if (args.values.version) { process.stdout.write(`${VERSION}\n`); return 0; }
  if (args.values.help || args.positionals.length === 0) { process.stdout.write(HELP); return 0; }
  const [command, subcommand, ...rest] = args.positionals;
  if (rest.length || (subcommand && command !== 'baseline')) throw new Error('Unexpected positional arguments. Use --help.');
  if (!['setup', 'init', 'scan', 'check', 'doctor', 'baseline'].includes(command!)) throw new Error(`Unknown command: ${command}. Use --help.`);
  if (!['text', 'json', 'sarif'].includes(args.values.format!)) throw new Error('--format must be text, json, or sarif.');
  if (command === 'setup') {
    if (args.values.base || args.values.reason || args.values.output || args.values.format !== 'text') throw new Error('setup supports --root, --yes and --github. Use scan for JSON/SARIF reports.');
    const ui = args.values.yes ? { write: (text: string) => { process.stdout.write(text); }, ask: async () => { throw new Error('Unexpected prompt in unattended setup.'); }, close() {} } : terminalUI();
    try { return await runSetup({ root: args.values.root, yes: args.values.yes, github: args.values.github }, ui); }
    finally { ui.close(); }
  }
  if (args.values.yes || args.values.github) throw new Error('--yes and --github are supported only by setup.');
  if (args.values.base && command !== 'check') throw new Error('--base is supported only by check.');
  const root = fs.realpathSync(args.values.root ?? process.cwd());
  if (command === 'init') {
    assertConfigDirectory(root);
    const file = path.join(root, CONFIG_PATH);
    writeNew(file, `${JSON.stringify(defaultConfig(), null, 2)}\n`);
    process.stdout.write(`Created ${file}\nNext: review include/exclude and configure boundaries, then run repo-assurance scan.\nObservation is enabled; no blocking architecture has been invented for this project.\n`);
    return 0;
  }
  if (command === 'baseline') {
    assertConfigDirectory(root);
    const file = path.join(root, BASELINE_PATH);
    if (subcommand === 'create') {
      if (!args.values.reason?.trim()) throw new Error('baseline create requires --reason.');
      if (fs.existsSync(file)) throw new Error('A baseline already exists. Reconcile resolved items or review its replacement explicitly.');
      const report = scan({ root, skipBaseline: true });
      const baseline = createBaseline(report, args.values.reason);
      writeNew(file, `${JSON.stringify(baseline, null, 2)}\n`);
      process.stdout.write(`Created ${file} with ${baseline.entries.length} explicitly accepted finding(s). Review and commit it.\n`);
      return 0;
    }
    if (subcommand === 'reconcile') {
      const text = readOptional(root, BASELINE_PATH);
      if (text === undefined) throw new Error('No baseline exists.');
      const prior = parseBaseline(text);
      const report = scan({ root });
      const next = reconcileBaseline(prior, report);
      // Reconciliation can only remove exemptions. A concurrent modification must not be lost.
      if (readOptional(root, BASELINE_PATH) !== text) throw new Error('Baseline changed during reconciliation; retry.');
      const temp = `${file}.${randomUUID()}.tmp`;
      try { writeNew(temp, `${JSON.stringify(next, null, 2)}\n`); fs.renameSync(temp, file); }
      finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
      process.stdout.write(`Retired ${prior.entries.length - next.entries.length} resolved exemption(s). Review and commit the baseline change.\n`);
      return 0;
    }
    throw new Error('Use baseline create --reason <text> or baseline reconcile.');
  }
  const report = scan({ root, enforce: command === 'check', base: args.values.base });
  const output = args.values.format === 'json' ? `${JSON.stringify(report, null, 2)}\n` : args.values.format === 'sarif' ? `${JSON.stringify(sarifReport(report), null, 2)}\n` : textReport(report);
  if (args.values.output) replaceReport(args.values.output, output);
  else process.stdout.write(output);
  if (command === 'doctor' && args.values.format === 'text') process.stdout.write(`\nRuntime: Node ${process.versions.node}; TypeScript ${report.tool.typescript}; Python parser ${report.tool.python ?? 'not used or unavailable (see diagnostics)'}\nConfig: ${readOptional(root, CONFIG_PATH) === undefined ? 'defaults (run setup to configure checks)' : CONFIG_PATH}\nNetwork/API key: not required for analysis\n`);
  return report.exitCode;
}

try { process.exitCode = await main(); }
catch (error) {
  process.stderr.write(`Repo Assurance: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = error instanceof SetupCancelled ? 130 : 2;
}
