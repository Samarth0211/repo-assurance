# Installation and existing-repository onboarding

## Install from source

Install a supported Node.js release (minimum 22.14) and Git. Clone this repository, then run `npm run setup`. This installs the exact lockfile dependencies with lifecycle scripts disabled and compiles the CLI. Initial package installation requires registry access; analysis itself has no network dependency.

The npm package is not assumed to be published. All instructions work from a source checkout. `node dist/src/cli.js --version` verifies the compiled CLI. For a global local installation, run `npm pack` and then `npm install --global --ignore-scripts <the-created-tarball>`; the command becomes `repo-assurance`.

Use quoted absolute paths when repositories have spaces. The tool can inspect a repository outside its own checkout.

## Try the included example

Run `npm run demo`. The UI imports storage directly, violating `ui-must-use-service`. Inspect `examples/boundary-demo/src/ui/orders.ts` and its `.assurance/config.json`.

For an enforced result, run:

```sh
node dist/src/cli.js check --root examples/boundary-demo
```

Exit code 1 is expected. The example is deliberately a failing fixture, not a setup failure.

## Recommended: guided onboarding

After installing the tool, run `npm run onboard`. Enter your project folder and
follow the prompts to review scope, suggested boundaries, observation/enforcement,
and optional GitHub help. Setup previews files, preserves existing configuration,
and runs a first scan. It prints the next commands and writes `.assurance/SETUP.md`.
See the [wizard walkthrough](guided-setup.md) for the complete flow.

## Add an existing project

Use this manual path if you prefer editing configuration directly.

1. Install that project's dependencies using its normal trusted procedure. Repo Assurance does not install them for you.
2. Run `init --root <project>`. Review include/exclude patterns and keep the initial observation mode.
3. Run `doctor --root <project>` and resolve missing configuration or dependencies.
4. Run `scan --root <project> --format json --output <report.json>`.
5. Inspect source counts, excluded targets, diagnostics, and proposed questions before accepting the findings.
6. Add the boundaries that reflect your intended architecture. Use error severity only for requirements you actually want to block.
7. Review existing findings. Fix them or explicitly baseline them with a reason.
8. Run `check --root <project>` locally, then integrate with CI using the separate trust instructions.

No directory reorganization is required. A clean scan means only that configured checks succeeded within the reported scope.

## Baseline existing debt

```sh
node dist/src/cli.js baseline create --root <project> --reason "Existing architecture debt; remediation tracked by the maintainers"
node dist/src/cli.js check --root <project>
```

Baseline creation requires complete analysis and refuses to overwrite a prior baseline. It accepts exact findings, not a numeric allowance. Missing dependencies and analysis errors cannot be baselined.

Commit the reviewed baseline alongside the policy. When an accepted violation is repaired, run `baseline reconcile`, review the removed entries, and commit the change. Enforcement requires resolved exemptions to be retired; otherwise a future reintroduction could inherit an old exemption. Reconciliation never accepts a new finding.

If policy semantics or scope change, the baseline hash becomes incompatible. Review the change and explicitly establish a replacement baseline in a governed update. Do not routinely regenerate a baseline on every PR.

## Set expectations during a pilot

Start with one application or package and one clear rule. Measure false positives and unresolved dependencies before expanding the scope. Keep existing type checks, behavioral tests, security scanners, and human review in place.

For a company pilot, appoint a rule owner, document exceptions through the organization's existing review process, protect policy files, and decide who can bypass hosting protections. This alpha has no built-in organization authorization service or expiring-exception workflow.
