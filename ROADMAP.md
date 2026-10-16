# Roadmap

The [implementation plan](IMPLEMENTATION_PLAN.md) contains the complete design. This page distinguishes shipped code from future work.

## Working alpha

- Local TS/JS module discovery and resolution.
- Direct dependency boundaries and included-source cycles.
- Explicit incomplete-analysis outcomes and source/policy identity.
- Existing-finding baselines and resolved-exemption retirement.
- Local trusted-base policy/ancestry checks.
- Text, JSON, SARIF, setup guides, and tests.

## Next: reliable adoption

- Expand framework/module-resolution fixtures from pilot repositories.
- Improve supported loader/entry-point detection and questions.
- Build a trusted CI integration with a documented, tested publication boundary.
- Add governed policy-change and expiring-exception workflows.
- Publish cold/warm performance and memory measurements on representative repositories.

## Then: persistent intelligence

- Versioned fact storage with transactional snapshots.
- Correct dependency-aware incremental invalidation.
- Immutable shared artifacts and per-PR overlays.
- Full/incremental equivalence testing, retention, and resumable workers.
- Explicitly qualified reachability analysis and owner decisions.

## Later: repairs and organizations

- Authorized, bounded repair plans and validated transformations.
- Self-hosted scheduler, access controls, audit trail, and dashboard.
- Cross-repository contract/version metadata.
- Additional language adapters driven by users and maintainers.
- Measured million-line workloads and organization pilots.

There are no promised delivery dates or claims that this alpha already supports the entire platform. Performance, security, and precision gates determine release readiness.
