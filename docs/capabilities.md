# Capabilities and limitations

This document describes `0.1.0-alpha.3`, not the complete planned platform.

| Capability | Status | Boundary |
|---|---|---|
| Local CLI and programmatic API | Implemented | Node.js 22.14+ |
| Guided terminal setup | Implemented | JS/TS/Python detection, reviewed suggestions, first scan; existing files preserved |
| GitHub pilot generation | Implemented | Separate pinned analyzer; owner must configure trusted enforcement |
| Browser setup UI | Not implemented | Use the terminal wizard |
| TS/JS source discovery | Implemented | Supported suffixes and explicit scope |
| Python source discovery and AST imports | Implemented | UTF-8 `.py`; trusted Python 3.10+ interpreter required |
| Python package resolution | Implemented | Local source roots, relative imports, initializers, and namespace packages |
| Python third-party imports | Explicit opaque externals | No target package loading or automatic distribution-to-import mapping |
| Mixed JS/TS/Python scans | Implemented | Shared boundary/cycle engine; no cross-language runtime/FFI proof |
| Compiler-aware module resolution | Implemented | TypeScript 6.0.3 API and supported configuration |
| Static imports/reexports/import-equals | Implemented | Literal specifiers |
| Literal dynamic import and `require()` | Implemented | Computed specifiers produce inconclusive |
| `import()` types and type-only edges | Implemented | Type dependencies distinct from runtime |
| Direct architecture boundaries | Implemented | Resolved module graph |
| Dependency cycles | Implemented | Included internal source only |
| Baselines and resolved-item retirement | Implemented | Exact fingerprints; reviewed lifecycle |
| Trusted-base comparison/freshness check | Implemented locally | Hosting must enforce branch freshness at merge |
| Text/JSON/SARIF | Implemented | SARIF export does not itself configure hosting gates |
| Diagnostic-derived owner questions | Implemented | No persistent conversational decision service |
| Durable incremental graph/cache | Planned | Current scans recompute the graph |
| Million-line qualification | Not completed | No performance or enterprise certification claim |
| Type checking and behavioral tests of target | External responsibility | Target scripts are never executed |
| Complete call graph/data flow/dead code | Planned research/adapter work | No automatic deletion |
| Security or scalability proof | Not provided | Requires appropriate independent evidence |
| Automated repairs | Planned | Source is not rewritten |
| Expiring exceptions/RBAC/dashboard | Planned | Existing organization governance is required |
| GitHub merge queue or App service | Integration guidance only | No hosted service or custom queue |
| Languages beyond TS/JS/Python | Planned | Unsupported files are not analyzed |

## Analysis assumptions

Python uses a bundled isolated AST helper and a static source-root resolver. See the
[Python guide](python.md) for initialization edges, conditional imports, opaque externals,
wildcards/dynamic-code diagnostics, and unresolved runtime behavior.

`require()` is recognized syntactically. Exotic loaders, aliases for module-loading functions, reflection, plugin registration, runtime-generated code, bundler transforms, and non-module resource loading are not complete analysis targets. A module graph is not a whole-program execution graph.

The compiler adapter does not load TypeScript language-service plugins or execute application code. It can read referenced configuration/package files while resolving dependencies. Run the process within an appropriate environment when inspecting hostile repositories.

Nearest-project options support ordinary nested projects. The tool does not orchestrate build outputs, project-reference rebuilds, cross-language bindings, Yarn Plug'n'Play loaders, or consumers outside the checkout. Missing modeled inputs are surfaced where detected, but no static analyzer detects every unsupported behavior automatically.

## What a PASS means

The configured rules found no unaccepted error-level violations in the modeled source scope, and the supported analysis reported no incomplete-input diagnostics. Baseline findings and warnings can remain. It does not establish correctness of the whole application, absence of vulnerabilities, or safe deployment.

## Scale

Source parsing is currently synchronous and full-scan. The implementation uses iterative cycle traversal and bounded per-file/file-count parsing, but those limits do not cap total traversal time, process memory, or all compiler-config reads. Use OS/CI resource limits. A long-chain graph test is not a million-line end-to-end benchmark.

The roadmap requires published real-repository measurements and full/incremental equivalence before claiming the planned scale.
