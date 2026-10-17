# Changelog

## 0.1.0-alpha.2 - 2026-10-17

- Added `setup` and `npm run onboard` for guided terminal onboarding.
- Added JS/TS and root-package detection, optional monorepo scope selection, reviewed UI/storage suggestions, and circular-dependency selection.
- Added observation/enforcement choices, a file preview, first-scan guidance, and copyable follow-up commands.
- Added optional GitHub pilot workflow generation with a pinned analyzer, read-only permissions, and an owner checklist for trusted enforcement.
- Preserved existing configuration, baselines, workflows, and notes; cancellation before saving creates no files.
- Added unattended `--yes`/`--github`, path/conflict checks, and package-level onboarding verification.
- Fixed shared nested configuration defaults so separate setup/analysis sessions cannot inherit mutable rules.

GitHub settings and merge protections still require owner configuration. This adds a terminal wizard; no browser dashboard or automatic repair is included.

## 0.1.0-alpha.1 — 2026-10-16

Initial working alpha:

- TypeScript/JavaScript discovery and compiler-backed module resolution.
- Direct dependency boundary policies and cycle detection.
- Strict configuration schemas and incomplete-analysis diagnostics.
- Snapshot/policy hashes, baselines, and retirement of resolved exemptions.
- Base-aware local checking for stale candidates and protected-policy edits.
- CLI initialization, doctor, text/JSON/SARIF reports, and example repository.
- Regression tests and Linux/Windows CI definition.
- Developer, security, operational, and contribution documentation.
- MIT license, permitting commercial use and redistribution with its required notice.

The release does not include incremental indexing, automatic repair, whole-program dead-code detection, a hosted service, or million-line qualification.
