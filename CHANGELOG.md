# Changelog

## Unreleased

Fixed:

- `externals` patterns now match relative specifiers. `minimatch` treats `/` as a
  path separator, so neither `*.css` nor the documented `**/*.css` matched
  `./theme.css` or `../ui/theme.css`, and every relative asset import was
  reported as `UNRESOLVED_IMPORT` with nothing indicating the pattern was at
  fault. Specifiers are now matched as written and again with leading `./` and
  `../` segments removed. Bare and scoped package specifiers are unaffected.

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
