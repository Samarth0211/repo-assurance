# Guided setup

The setup wizard walks you from an existing project to a first architecture report.
It runs in your terminal. There is no browser dashboard or hosted account to create.

## Start

With Node.js 22.14+ and Git installed (plus Python 3.10+ for Python projects):

```sh
git clone https://github.com/Samarth0211/repo-assurance.git
cd repo-assurance
npm run setup
npm run onboard
```

`npm run setup` installs and builds the tool. `npm run onboard` launches its wizard.
For an existing tool checkout, update it through your normal Git workflow and rerun
`npm run setup` before onboarding. The npm package need not be published.

You can also specify your project folder:

```sh
npm run onboard -- --root "../my-shop"
```

The equivalent compiled command is `node dist/src/cli.js setup --root "../my-shop"`.
With a global local installation, use `repo-assurance setup` from your project.

## What the wizard asks

1. **Project folder.** Enter or paste a folder path. Quoted paths and `~/` work.
   A mistyped path can be corrected. Setup requires some supported JS/TS/Python source.
   Python projects also get prompts for import source folders and reviewed third-party
   import names. The wizard does not install or import Python packages.
2. **Scope, when applicable.** Repositories with `apps/` or `packages/` offer a
   choice between all supported source and one detected package. All is the default.
3. **Suggested boundaries.** Where sibling UI and storage folders exist, the wizard
   proposes preventing direct imports between them. It adds a rule only when you
   confirm that this matches your intended architecture. Folder names are hints;
   the wizard does not infer your business requirements.
4. **Circular dependencies.** Choose whether to flag dependency loops. The default
   enables this check, excluding type-only loops.
5. **Observation or local enforcement.** Observation is recommended: findings are
   visible without blocking development. Enforcement makes local scans fail for
   new error-level findings. At least one blocking rule is needed for enforcement.
6. **GitHub help.** Optionally generate a pilot workflow and use the owner checklist
   to plan merge protection. Local analysis needs no GitHub login.
7. **Preview and save.** Review the scope and planned files. You can display their
   full contents before saving. Answer no or press Ctrl+C to cancel before any write.

The first scan then shows coverage, issues, missing inputs, and exact commands to
scan again. The exit code belongs to that scan: 0 permitted/observation, 1 enforced
violation, 2 incomplete/error. Cancellation before saving exits 130. A first scan
can be incomplete even when the setup files were saved successfully.

The wizard recognizes root package hints for common frameworks; these do not
establish framework compatibility. It does not install your project's dependencies.
If imports cannot resolve, prepare the project through its normal trusted setup,
check compiler paths, then rerun the printed scan command.

## Files and repeat runs

| File | Purpose |
|---|---|
| `.assurance/config.json` | Reviewed scope, mode and checks |
| `.assurance/SETUP.md` | Everyday commands and the GitHub owner checklist |
| `.github/workflows/repo-assurance.yml` | Optional GitHub pilot |

Existing files are never overwritten. A repeated setup uses the existing policy
unchanged, including its enforcement mode. Baselines are preserved and never
created automatically. The wizard is an onboarding assistant, not a policy editor.
Change existing rules through your normal review process.

If a workflow or setup guide already exists at the selected path, the wizard keeps
it. The file list identifies what will be created and what will be preserved.
An orphan baseline or malformed policy requires review before setup can continue.
Symlinked output directories are rejected. Setup checks for destination conflicts
before writing, but it is not a filesystem transaction: a later disk failure can
leave some new files, which the error identifies. Rerun setup after resolving it.

## Unattended setup

```sh
node dist/src/cli.js setup --root "../my-shop" --yes
node dist/src/cli.js setup --root "../my-shop" --yes --github
```

For a new project, `--yes` selects all supported source, observation mode, cycle
checks, default Python source roots, and no guessed boundaries or external declarations.
Unresolved Python third-party imports remain inconclusive. GitHub output requires `--github`. Existing
policy is still preserved. Unattended setup does not accept existing violations.

## GitHub pilot and merge protection

The generated workflow runs on pull requests and can be started manually after it
reaches the default branch. It uses read-only repository access, a separately
checked-out analyzer pinned to a published commit, and GitHub-hosted runners.
The template provisions Python 3.13 for the parser.
It installs only the analyzer. Project dependency preparation is a separate,
reviewed integration step; missing packages make analysis inconclusive.

The pilot reads the candidate configuration and honors its mode. It is useful for
evaluating results, but a PR can change the workflow or its policy. Making this
pilot's status required by itself does not establish an authoritative architecture
gate. Setup does not configure GitHub settings, log in, push commits, open PRs, or
set branch protections. It does not spend money or request a paid service; runner
usage is subject to the repository owner's existing GitHub allowance.

The generated `.assurance/SETUP.md` gives owners the steps to review rules, prepare
dependencies, protect policy/workflows, select a trusted base revision, and require
fresh checks before merging. Follow the [CI integration guide](ci.md) for enforcement.

## Supported scope

Suggestions currently recognize sibling `ui`, `components`, or `pages` folders and
`db`, `database`, or `storage` folders. They never connect unrelated packages merely
because folder names match. The wizard offers at most 20 individual package choices
and 10 boundary suggestions; all-source scanning still covers the full selected scope.
Unusual folder names containing glob characters are not turned into suggested patterns.

Other languages, automatic refactoring, complete dead-code detection, and browser
setup are not part of this wizard. See the [capability matrix](capabilities.md).
