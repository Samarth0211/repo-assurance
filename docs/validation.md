# Validation record

Release candidate: `0.1.0-alpha.2`.

Local validation completed on 17 October 2026 with Windows and Node.js 22.19.0:

| Check | Recorded result |
|---|---|
| `npm test` | 54 tests passed; no failures or skipped cases |
| Project architecture check | Passed against the configured source boundaries and cycle rule |
| `npm run docs:check` | Local links verified in 20 Markdown documents |
| `npm run test:package` | Tarball built and installed in an isolated temporary prefix; CLI, API, license, guided setup, and expected failing demo verified |
| Dependency inventory | Unchanged from alpha.1, whose recorded npm audit reported no known vulnerabilities at the time checked |
| Generated configuration/baseline schemas | Regenerated successfully; no schema changes |
| Generated GitHub pilot | Parsed as YAML locally; triggers, permissions, and scan command verified; trust invariants covered by tests |

The hosted CI matrix covers Windows/Linux and Node 22/24. Consult the [workflow run for the chosen commit](https://github.com/samarth0211/repo-assurance/actions/workflows/ci.yml) for its actual status; a local result does not imply every hosted job has passed.

## Evidence covered by tests

- Known forbidden/allowed dependencies and actual cycle paths.
- Deterministic evidence and identities for unchanged inputs.
- Syntax/configuration errors, missing dependencies, and dynamic imports.
- Exact baseline matching, line shifts, same-count substitution, and reintroduction after retirement.
- No baseline acceptance from incomplete analysis.
- A 30,000-node graph traversal without recursive stack overflow.
- A stale branch after ten intervening commits, then validation after integration.
- Candidate policy weakening, dirty checkout, and untracked source.
- CLI initialization, output safety, and SARIF evidence.
- Interactive and unattended onboarding, real piped CLI input, cancellation, and invalid-choice recovery.
- Observation/enforcement choices, scope selection, and explicit acceptance/rejection of suggested boundaries.
- Repeat setup preserving existing policy, baseline, workflow, and notes.
- Incomplete first scans, orphan baselines, redirected paths, and concurrent file/configuration changes.
- Configuration defaults isolated across setup sessions; installed-package onboarding.

## Qualification not yet completed

No independent security audit, million-line end-to-end benchmark, production organization pilot, or universal resolver equivalence has been completed. Unit/integration tests and package installation do not establish those properties.
