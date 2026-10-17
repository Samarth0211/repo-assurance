# Implementation architecture

## Boundaries

```text
CLI
  -> scan orchestration
       -> validated configuration + Git snapshot + tracked input reads
       -> source discovery
       -> TypeScript module extraction
       -> policy evaluation
       -> baseline matching + input consistency validation
       -> structured report
  -> text / JSON / SARIF presentation
```

`src/core` contains schemas, source inventory, hashes, Git access, and orchestration. `src/analyzers` extracts language facts. `src/policies` evaluates facts without presentation dependencies. `src/reporters` renders outcomes. The package's own `.assurance/config.json` checks this dependency direction.

`src/setup` owns interactive prompts, folder-based suggestions, safe output planning,
the GitHub pilot template, and first-report guidance. It calls the same scanner as
the CLI and adds no alternate analysis or baseline acceptance path. Core analysis
does not depend on onboarding. Configuration defaults allocate fresh nested objects
for each parse so setup sessions cannot share mutable rule lists.

The initial release uses modules in one package. Extract packages/services only when there is a concrete lifecycle, performance, or ownership reason. The larger [implementation plan](../IMPLEMENTATION_PLAN.md) remains the design direction, not a list of features already present.

## Snapshot consistency

Source bodies and consulted compiler files are hashed. Resolution existence probes are recorded. Source inventory, consulted inputs, Git HEAD, and the selected local base reference are rechecked before the report is returned. A detected change makes analysis inconclusive.

This is a best-effort consistency guard around local files, not a transactional filesystem. Use an isolated immutable checkout for authoritative CI evidence. Future artifact/snapshot storage must preserve this distinction.

## Graph

Edges carry source, resolved target, original specifier, source location, runtime/type classification, and internal/external/excluded status. The graph is a module dependency graph. It does not represent every function call or data flow.

Cycle detection uses iterative strongly connected component traversal. Findings include a real cycle path. Their fingerprints include the component's internal edge set so adding an edge does not inherit an unrelated old exemption.

Boundary fingerprints identify a rule and dependency edge. Moving a violation down a few lines preserves its identity. A different importer or target creates a different finding.

## State

Only explicit baseline/configuration files and setup helpers persist. There is no cross-run incremental cache or remote database. Reports may be stored by the caller. This favors reproducible full-scan behavior until incremental invalidation can be tested against it.

## Decisions

- TypeScript 6.0.3 is pinned because this adapter uses its compiler API. The installed TypeScript 7 line has a different API surface; migration needs explicit adapter work and regression tests.
- Unknown analysis is represented explicitly and blocks mandatory checking.
- AI is not required for extraction, policies, or report production.
- Repair and organization services are deferred until the core has stronger coverage and operational evidence.
- MIT is the project license, including commercial redistribution rights.
