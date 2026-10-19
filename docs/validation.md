# Validation record

Release candidate: `0.1.0-alpha.3`.

Local validation completed on 19 October 2026 with Windows, Node.js 22.19.0, and Python 3.13.14:

| Check | Recorded result |
|---|---|
| `npm test` | 83 tests passed; no failures or skipped cases |
| Project architecture check | Passed against the configured source boundaries and cycle rule |
| `npm run docs:check` | Local links verified in 21 Markdown documents |
| `npm run test:package` | Tarball built and installed in an isolated temporary prefix; CLI, API, license, packaged Python helper, mixed-language setup, and both expected failing demos verified |
| Dependency inventory | Unchanged from alpha.1, whose recorded npm audit reported no known vulnerabilities at the time checked |
| Generated configuration/baseline schemas | Regenerated successfully; configuration includes Python source roots |
| Generated GitHub pilot | Parsed as YAML locally; Python runtime and permissions verified; trust invariants covered by tests |

The hosted CI matrix covers Windows/Linux with Node 22 + Python 3.10 and Node 24 + Python 3.13. Consult the [workflow run for the chosen commit](https://github.com/samarth0211/repo-assurance/actions/workflows/ci.yml) for its actual status; a local result does not imply every hosted job has passed.

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
- Python absolute/relative imports, src layouts, regular/namespace packages, initializer edges, aliases, literal dynamic imports, and mixed-language graphs.
- Import-root conflicts, standard-library precedence, exact Python baselines, and protected Python policy changes.
- Missing interpreters, non-UTF-8 source, syntax errors, path escape, computed imports, wildcard imports, and custom hooks.
- Read-only operation without target imports, sitecustomize execution, or bytecode files; 130-file multi-batch coverage.

## Qualification not yet completed

No independent security audit, million-line end-to-end benchmark, production organization pilot, or universal resolver equivalence has been completed. Unit/integration tests and package installation do not establish those properties.
