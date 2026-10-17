# Security and trust model

## Data flow

The CLI reads local source, Git metadata, policy, baseline, and compiler/package files needed for module resolution. It keeps an in-memory graph and writes only explicitly requested reports, configuration/baseline changes, or setup helpers. The setup wizard can create a guide and an optional GitHub workflow after preview/confirmation (or explicit unattended setup). Analysis has no network calls, model calls, telemetry, or source-upload service.

Dependency installation uses npm and needs registry access. The resolver can consult referenced configuration and package files outside the source inclusion patterns. Inclusion patterns define the analyzed source scope, not a filesystem sandbox.

## Execution

The CLI invokes Git for read-only inventory, revision, and status operations. Arguments are passed without a shell; Git filesystem-monitor execution is disabled. It does not invoke package scripts, TypeScript plugins, application builds, tests, or code generators in the target repository.

Node.js, the compiler, Git, and parsers remain part of the trusted computing base. A local process is not a sandbox. For hostile repositories, use an isolated environment with controlled filesystem/network access and OS resource limits.

## Trust boundaries

| Input or component | Treatment |
|---|---|
| Source code and file names | Untrusted input; parsed, not executed |
| Local configuration | User-selected policy in local mode |
| Base configuration | Trusted only to the extent the caller and host authenticate the selected base |
| Candidate changes to policy/baseline | Rejected by base-aware checking |
| Analyzer binary/package | Must be provisioned from a reviewed/pinned source |
| JSON/SARIF report | Evidence, not a signed authorization token |
| GitHub check publisher | Must be controlled independently of untrusted candidate execution |
| Repository administrators | Can change hosting policy; cannot be prevented by a local CLI |

## Built-in protections

- Strict configuration schemas and bounded pattern/list sizes.
- Root/path checks on discovered source; no external symlink source traversal.
- Explicit diagnostics for missing source, unresolved imports, budgets, and unsupported Git inputs.
- Source/configuration consistency checks before publishing a report.
- Trusted-base policy evaluation and candidate identity binding.
- Baseline fingerprint matching, policy compatibility, and resolved-exemption retirement.
- Refusal to overwrite existing configuration and unrelated report targets.
- Setup preflights all planned files, rejects symlinked output paths, preserves existing files, and uses exclusive file creation. Cancellation before save creates nothing. Setup is not a filesystem transaction or a defense against hostile concurrent filesystem mutation.
- GitHub pilot generation does not change hosting settings or confer merge authority; its analyzer is pinned and checked out separately from the target.

The implementation has not received an independent security audit. Local hardening does not substitute for sandboxing in a shared service.

## Reports and retention

Reports include internal names and topology. Avoid automatically posting full reports to public PRs from private repositories. Use least-privilege artifact access, retention limits, and deliberate deletion. This alpha maintains no service-side database, account system, or telemetry store.

## Vulnerability handling

See [SECURITY.md](../SECURITY.md). Report a minimal reproduction privately when it could expose user data or bypass a required gate. Do not include secrets, production source, or credentials in public issues.
