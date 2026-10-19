# Reports, exit codes, and API

## Result and exit behavior

| Condition | Result | `scan` in observe mode | `check` / enforce mode |
|---|---|---|---|
| No unaccepted error findings and complete analysis | PASS | 0 | 0 |
| At least one new error finding, complete analysis | FAIL | 0 | 1 |
| Any incomplete-input/analysis diagnostic | INCONCLUSIVE | 2 | 2 |

Warning findings do not block. A baseline matches individual accepted findings. An INCONCLUSIVE report may also contain verified findings; inspect both. Invalid command/configuration errors are written to stderr with exit 2 when a report cannot be constructed.

The setup wizard returns the first scan's exit code after saving its files. A saved
configuration does not imply a complete first scan. Cancellation before saving
returns 130 and creates no setup files. Use `scan --format json` for machine-readable
output; the wizard's conversational output is for people.

Never convert an exit 2 into success in a mandatory CI gate. SARIF upload success is not the decision; retain the CLI exit code.

## JSON structure

`schemaVersion` is 1. Public TypeScript types are exported from the package. Alpha schemas may evolve with documented version changes.

- `tool`: analyzer and TypeScript versions, plus optional `python` parser version when Python was used.
- `mode`, `result`, `exitCode`: policy execution outcome.
- `snapshot`: source content, policy and analysis hashes; Git head/base and dirty state where available.
- `scope`: discovered/analyzed counts, bytes, dependencies, excluded targets, completeness.
- `files`: source paths, content hashes, and sizes, without source text.
- `edges`: import/reexport relationships, locations, runtime/type distinction, and resolution category.
- `findings`: stable fingerprint, rule, severity, evidence path, and new/existing classification.
- `diagnostics`: incomplete evidence, with codes and reasons.
- `questions`: diagnostic-derived questions; these are not automatically answered or persisted decisions.
- `baseline`: accepted count, matched count, and resolved fingerprints requiring retirement.
- `limitations`: important scope constraints included with every report.

The content hash covers included source. The policy hash covers scope, externals, Python source roots, and rules. The analysis hash also includes compiler/analyzer/Python parser versions, consulted filesystem inputs and helper contents, configuration, baseline, and Git candidate identities. Hashes identify evidence; they are not signatures or proof of who ran the analyzer.

## Output files

```sh
repo-assurance check --format json --output reports/assurance.json
repo-assurance scan --format sarif --output reports/assurance.sarif
```

The output extension must be `.json`, `.sarif`, or `.txt`, outside `.assurance`. Existing unrelated files are not overwritten. Recognized prior Repo Assurance reports can be replaced. Output is written using a temporary file and rename. Choose a trusted report destination and control its parent directory permissions.

Console output is intended for people. Consume JSON for automation. Reports omit source bodies but can still reveal internal file names, dependencies, configuration diagnostics, and architecture. Store and share them accordingly.

## Programmatic usage

```ts
import { scan, textReport } from '@samarth0211/repo-assurance';

const report = scan({ root: '/work/application', enforce: true });
process.stdout.write(textReport(report));
process.exitCode = report.exitCode;
```

The package can be installed from a locally built tarball. `scan` is synchronous and may throw for invalid configuration or operational errors; library consumers must handle exceptions. Do not run long analyses in a web request handler. Organization scheduling and worker isolation are future platform components.
