# Security policy

## Supported release

The current alpha receives fixes on the default branch. There is no long-term support promise or independent security certification. Pin reviewed revisions and follow release notes.

## Reporting a vulnerability

Use the repository's **Security > Advisories > Report a vulnerability** interface when private vulnerability reporting is enabled. If that option is unavailable, contact the repository owner through an existing private channel. Do not post exploitable details or sensitive source in a public issue while seeking a private reporting route.

Include the affected revision, environment, minimal reproduction, impact, and whether the issue permits unauthorized execution, data disclosure, or a false enforcement success. Never include actual secrets.

## Scope

Particularly relevant issues include path escape, unexpected repository code execution, unsafe artifact handling, analysis-result confusion, baseline bypass, and stale-candidate authorization. Misleading capability claims and silently incomplete checks also warrant reports.

See [the security model](docs/security-model.md) for current boundaries. Host administrator permissions and deliberately authorized policy changes are outside the CLI's control.

No response-time SLA or bug bounty is currently offered. Maintainers will coordinate fixes and disclosure according to available capacity and the issue's impact.
