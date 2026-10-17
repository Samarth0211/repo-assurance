# Repo Assurance

**Understand dependency boundaries. Block verified regressions. Keep the evidence.**

Repo Assurance is a local CLI for inspecting TypeScript and JavaScript repositories. It resolves module dependencies, checks architectural boundaries and cycles, and distinguishes existing debt from new violations. Reports include source locations, dependency paths, analysis coverage, and hashes of the inputs used.

**Status: `0.1.0-alpha.2`.** This is the first working component of the [larger platform plan](IMPLEMENTATION_PLAN.md). It is suitable for evaluation and narrowly scoped architecture checks. Million-line performance, automatic repairs, complete dead-code detection, and an organization dashboard are future milestones. See the [capability matrix](docs/capabilities.md) before choosing enforcement rules.

## Quick start

Requirements: **Node.js 22.14 or later** and npm. Git is needed to clone the project and use revision-aware checks. No API key, account, model, or database is required.

```sh
git clone https://github.com/samarth0211/repo-assurance.git
cd repo-assurance
npm run setup
npm run onboard
```

The wizard asks for your project folder, detects supported source, helps you review suggested boundaries, and runs your first scan. Start in observation mode to see findings before blocking changes. It can also create a GitHub pilot workflow and an owner checklist. No configuration knowledge is needed to start; you still decide which architecture rules fit your project.

To select the project directly:

```sh
npm run onboard -- --root /path/to/your-repository
```

On Windows, use a quoted path such as `"C:\work\your-repository"`. Existing configuration, baselines, and workflow files are preserved. See the [wizard walkthrough](docs/guided-setup.md) for choices, unattended setup, and GitHub limits.

For a quick demonstration without onboarding your project, run `npm run demo`. The example intentionally contains one forbidden import. It reports `FAIL` in observation mode and exits successfully so you can inspect the evidence.

## Define one boundary

Save this as `.assurance/config.json` in the repository being analyzed:

```json
{
  "schemaVersion": 1,
  "mode": "observe",
  "include": ["src/**"],
  "rules": {
    "boundaries": [{
      "id": "ui-uses-service-layer",
      "from": ["src/ui/**"],
      "disallow": ["src/storage/**"],
      "severity": "error"
    }],
    "cycles": { "enabled": true, "severity": "error" }
  }
}
```

Then enforce the declared rules:

```sh
node dist/src/cli.js check --root /path/to/your-repository
```

`check` returns `1` for a new error-level violation and `2` when required analysis is incomplete. A missing dependency, invalid policy, or stale candidate cannot silently count as a successful check.

## What works today

- Interactive setup with project detection, reviewed rule suggestions, a first report, and optional GitHub pilot generation.
- TypeScript/JavaScript module resolution using a pinned TypeScript compiler API.
- Direct dependency boundaries, including type imports and declared external modules.
- Dependency cycles within included source, with optional type-only cycle detection.
- Git-aware discovery, explicit exclusions, source budgets, and content fingerprints.
- Individual finding baselines with reasons, exact matching, and retirement of resolved exemptions.
- Base-aware checks using protected policy from a specified Git revision.
- Text, JSON, and SARIF output; targeted questions for unresolved dependencies.
- Local analysis without source uploads or telemetry.

The tool does not execute your code, install your application's dependencies, rewrite source, or configure Git hosting protections. See [security and trust boundaries](docs/security-model.md) and [CI setup](docs/ci.md).

## Commands

| Command | Purpose |
|---|---|
| `setup` | Guided onboarding and first scan; existing files are kept |
| `init` | Create a configuration for review |
| `scan` | Inspect under the configured observation/enforcement mode |
| `check` | Enforce error-level rules and analysis completeness |
| `check --base <ref>` | Use the base revision's policy and require current ancestry |
| `doctor` | Show runtime, configuration, and analysis readiness |
| `baseline create --reason "..."` | Explicitly accept specific existing findings |
| `baseline reconcile` | Retire resolved exemptions without accepting new ones |

All commands accept `--root`. `setup --yes` uses unattended observation defaults for a new project; `--github` requests a pilot workflow. Scan/check/doctor reports support `--format text|json|sarif` and `--output <file>`. Run `node dist/src/cli.js --help` for usage.

## Documentation

| Need | Guide |
|---|---|
| Set up interactively without editing JSON | [Guided setup](docs/guided-setup.md) |
| Install and onboard an existing repository | [Getting started](docs/getting-started.md) |
| Understand all policy fields and defaults | [Configuration reference](docs/configuration.md) |
| Read findings, hashes, and exit codes | [Reports and API](docs/reports.md) |
| Add CI and handle stale PRs | [CI and merge integration](docs/ci.md) |
| Evaluate supported cases and limitations | [Capability matrix](docs/capabilities.md) |
| Review data access, isolation, and privileges | [Security model](docs/security-model.md) |
| Operate, upgrade, and remove the tool | [Operations guide](docs/operations.md) |
| Understand implementation boundaries | [Architecture](docs/architecture.md) |
| Diagnose setup and analysis failures | [Troubleshooting](docs/troubleshooting.md) |
| Contribute, review, and release | [Contributing](CONTRIBUTING.md), [release process](docs/releasing.md) |
| Review longer-term scope | [Roadmap](ROADMAP.md), [implementation plan](IMPLEMENTATION_PLAN.md) |

## Development

```sh
npm run setup
npm test
npm run check
npm run schemas
```

Tests include known violations, unresolved inputs, baseline manipulation, long graph traversal, and the stale-PR scenario with ten intervening commits. CI runs the suite on Linux and Windows. The [validation record](docs/validation.md) distinguishes executed checks from planned qualification.

## License and project ownership

[MIT](LICENSE), copyright 2026 samarth0211 and contributors. The project is free to use, modify, and distribute, including commercially. MIT permits selling copies and services; its copyright and permission notice must be preserved. It does not grant exclusive ownership to someone who redistributes it.

Development and releases are public. Users supply their own compute and remain responsible for their application's tests, deployment decisions, and hosting protections. There is no paid dependency required for the implemented analysis.
