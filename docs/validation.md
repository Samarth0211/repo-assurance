# Validation record

Release candidate: `0.1.0-alpha.1`.

Local validation completed on 16 October 2026 with Windows and Node.js 22.19.0:

| Check | Recorded result |
|---|---|
| `npm test` | 30 tests passed; no failures or skipped cases |
| Project architecture check | Passed against the configured source boundaries and cycle rule |
| `npm run docs:check` | Local links verified in 19 Markdown documents |
| `npm run test:package` | Tarball built and installed in an isolated temporary prefix; CLI, API, license, and expected failing demo verified |
| `npm audit` | No known vulnerabilities reported for the installed dependency inventory at the time checked |
| Generated configuration/baseline schemas | Generated successfully from runtime schemas |

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

## Qualification not yet completed

No independent security audit, million-line end-to-end benchmark, production organization pilot, or universal resolver equivalence has been completed. Unit/integration tests and package installation do not establish those properties.
