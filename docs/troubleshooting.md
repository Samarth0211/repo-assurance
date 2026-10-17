# Troubleshooting

| Symptom / code | What to do |
|---|---|
| CLI file missing | Run `npm run setup` from the tool checkout |
| Unsure how to configure the project | Run `npm run onboard` from the tool checkout |
| Setup exits 130 | Input ended or setup was cancelled before saving; rerun interactively or explicitly use `--yes` |
| Setup saved files but exits 2 | The first scan is incomplete; resolve its diagnostics and rerun the printed scan command |
| Setup keeps old rules or workflow | Existing files are deliberately preserved; review changes through your normal policy process |
| Setup rejects an output path | Use real directories inside the project; review symlinks or file/directory conflicts |
| Unsupported Node version | Use Node 22.14+ and reinstall from the lockfile |
| `CONFIG_REQUIRED` | Run init and review the configuration before enforcing |
| `NO_BLOCKING_RULES` | Define an error-level boundary or cycle rule |
| `NO_SOURCE_FILES` | Check root, include/exclude patterns, and supported suffixes |
| `UNRESOLVED_IMPORT` | Install target dependencies; verify nearest compiler configuration; explicitly declare real opaque externals |
| `DYNAMIC_IMPORT` | Review computed module loading; the alpha cannot prove its targets |
| `COMPILER_CONFIG` | Resolve the reported TypeScript 6.0.3 configuration issue |
| `SYNTAX_ERROR` | Repair syntax or use a supported parser version |
| `FILE_BUDGET_EXCEEDED` / `FILE_TOO_LARGE` | Deliberately adjust budgets/scope and apply worker resource limits |
| `SUBMODULE_NOT_ANALYZED` | Analyze the submodule separately or explicitly exclude it |
| `LFS_POINTER` | Materialize the required LFS content through the project's trusted setup |
| `UNSAFE_PATH` / `TRACKED_SYMLINK` | Use real source in the supported scope; symlink source is not verified |
| `BASELINE_POLICY_MISMATCH` | Review changed rules/scope and explicitly replace the baseline if justified |
| `BASELINE_RECONCILIATION_REQUIRED` | Run baseline reconcile and review retired exemptions |
| `STALE_BASE` | Update the branch or check the integration candidate containing the latest target |
| `DIRTY_CANDIDATE` / `UNTRACKED_SOURCE` | Commit intended source or use an immutable clean candidate checkout |
| `PROTECTED_POLICY_CHANGE` | Use the separate reviewed policy-update process; application PRs cannot self-authorize |
| `INPUT_CHANGED` / `SOURCE_SET_CHANGED` / `HEAD_CHANGED` / `BASE_CHANGED` | Retry against a stable checkout and fixed candidate |

An observation report can say `FAIL` with exit zero because observation does not block verified findings. Incomplete analysis still exits two. Use JSON for automation; do not search console text for the word PASS.

If checks differ across machines, compare the exact source revision, compiler version, lockfile, installed dependencies, nearest compiler configuration, platform path casing, and report hashes. The tool currently reports no cross-platform equivalence guarantee for every dependency resolver.

For a bug report, include tool/Node/OS versions, the command, redacted configuration, a minimal source fixture, and the relevant diagnostic. Do not upload private source or credentials.
