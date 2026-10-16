# Operations and company evaluation

## Deployment footprint

This release is a CLI process and its installed package dependencies. It has no listening port, background daemon, model server, central account, or database. Run it on a developer machine or an isolated CI worker. Do not describe it as a deployed organization service.

A company can install a reviewed package in its own build image and keep source inside its existing infrastructure. Resolve dependencies through an approved registry/mirror. No paid service is required by the analyzer.

## Pilot procedure

1. Choose an owner and a repository with a reproducible development environment.
2. Review the capability matrix and threat model.
3. Run in observation mode and inspect scope and incomplete-analysis diagnostics.
4. Select a small number of architectural rules with clear ownership.
5. Review the existing-finding baseline and protect it.
6. Record analysis duration, source count, dependency count, false positives, and memory under your workload.
7. Add required checking with trusted engine provenance and host protections.
8. Reassess after policy/compiler changes or expanded scope.

Keep type checks, application tests, deployment validation, and specialist security tooling. The CLI does not replace these forms of evidence.

## Resource controls

Parsing has per-file and file-count limits, but not a hard process-memory limit. Set timeouts, memory/CPU/disk limits, and concurrency in the worker environment. Each PR should use an independent checkout. No cache coordination service is required.

Full analysis currently runs on each invocation. Benchmark before using the alpha on very large repositories. An inconclusive timeout should remain blocking if the check is mandatory.

## Upgrade

Pin a release/commit, keep its lockfile, run the regression suite, and trial the new version in observation mode. Review schema, compiler, default-rule, and fingerprint changes in the changelog. Archive the old report and compare findings before enabling enforcement.

Use a fresh tool checkout or package when changing releases so obsolete generated files cannot survive in `dist`. Upgrading the tool does not authorize a baseline expansion.

## Backup and retention

Commit reviewed `.assurance` configuration/baselines to the application repository. Store CI reports under normal artifact retention. There is no hidden service state to back up. Baseline changes should retain their Git review history.

## Removal

Remove the required hosting check through the organization's normal change process, remove the invocation from CI, and remove the tool package/checkout if no longer needed. Archive or remove `.assurance` files deliberately. Delete report artifacts according to company policy. The CLI never installs an agent into the target application.

## Support expectations

This is an alpha open-source project with no SLA or independent certification. Submit reproducible defects and capability requests through the repository. Company adoption should be based on observed behavior and the organization's requirements, not the existence of a dashboard or a quality badge.
