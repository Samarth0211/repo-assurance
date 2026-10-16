# Configuration reference

The default path is `.assurance/config.json` in the analyzed repository. Unknown properties are rejected. JSON schemas for editor integration are in `schemas/`; `$schema` is optional. Runtime validation includes extra checks such as unique rule IDs and relative safe globs.

| Field | Default | Meaning |
|---|---|---|
| `schemaVersion` | Required: `1` | Configuration format |
| `mode` | `observe` | `observe` reports findings; `enforce` blocks new errors |
| `include` | `["**/*"]` | Repository-relative source globs |
| `exclude` | dist, build, coverage, .next directories | Additional source exclusions |
| `externals` | `[]` | Module specifiers deliberately treated as external |
| `analysis.maxFiles` | `50000` | Maximum source files parsed; excess is inconclusive |
| `analysis.maxFileBytes` | `2000000` | Per-source size limit; excess is inconclusive |
| `rules.boundaries` | `[]` | Direct dependency restrictions |
| `rules.cycles.enabled` | `true` | Detect cycles in the included resolved graph |
| `rules.cycles.severity` | `warning` | `warning` or `error` |
| `rules.cycles.includeTypeOnly` | `false` | Include type-only edges in cycle detection |

`.git`, `node_modules`, and `.assurance-cache` are always excluded from source traversal. Dependencies in `node_modules` can still be consulted by module resolution. These exclusions do not mean the resolver never reads package metadata or declaration paths there.

## Patterns and scope

Use forward slashes on every operating system. Patterns are case-sensitive and use minimatch syntax, including `**` and braces. Negated/comment patterns are not supported; use `include` and `exclude`. Parent traversal and absolute glob paths are rejected.

Supported source suffixes: `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs`, `.cjs`, including declaration files matching those suffixes. JSON and other assets may be resolved targets, but are not parsed as source.

In Git repositories, the inventory includes tracked files and non-ignored untracked files. Tracked files remain in scope even when they match `.gitignore`; explicit assurance exclusions still apply. Without Git, the directory walker uses assurance exclusions, not `.gitignore`.

Explicit exclusions narrow the claim. An edge to an excluded file is reported and can violate a direct boundary, but its dependencies are not traversed. Cycles through excluded or external code are outside the analyzed graph.

## Boundary rule

```json
{
  "id": "domain-does-not-use-ui",
  "from": ["packages/domain/**"],
  "disallow": ["apps/web/**", "external:some-ui-library"],
  "severity": "error",
  "message": "Domain code must remain independent of the web application."
}
```

Both runtime and type-only imports participate in boundary checks. `from` matches the importing source; `disallow` matches a resolved relative target or `external:<specifier>`. Rules apply to direct imports, not arbitrary transitive paths.

IDs must be unique, begin with a letter, and contain only letters, numbers, `_`, `-`, or `.`. `dependency-cycle` is reserved. A violation is identified by the rule and dependency edge, not its line number.

## Compiler configuration

The adapter uses the nearest `tsconfig.json`, then `jsconfig.json`, within the repository. The pinned TypeScript compiler reads compiler options and supported `extends` chains. With no compiler file, it uses ES2022, ESNext modules, Bundler resolution, JavaScript support, and JSON module resolution.

This does not invoke `tsc --build` or promise solution-wide project-reference semantics. Install required dependencies/build declarations yourself when necessary. Custom bundler behavior, Plug'n'Play resolution, generated framework imports, ambient-only modules, and configuration requiring newer TypeScript semantics can be inconclusive. See the capability matrix.

## Deliberate externals

An asset import such as `import './theme.css'` may require `"externals": ["**/*.css"]`. This explicitly models the import as an opaque external dependency. Do not add `"**"` just to suppress unresolved imports; it would remove the internal graph you intended to analyze. Treat external declarations and exclusions as reviewable policy changes.

## Observation versus enforcement

`scan` follows the configured mode. `check` forces enforcement without editing configuration. Observation returns zero for verified findings but still returns two for incomplete analysis. Enforcement requires an actual configuration and at least one error-level rule, avoiding a misleading empty gate.

Changing mode does not invalidate a baseline. Changing rules, scope, or externals does. A base-aware check reads policy and baseline from the selected base revision and rejects changes to those protected files pending a separate authorized update process.
