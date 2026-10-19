# Python analysis

Repo Assurance can analyze Python `.py` modules alongside JavaScript and TypeScript.
It checks module dependency boundaries and cycles using Python's built-in AST parser.
It does not import or execute your application, install Python packages, run tests,
or create bytecode caches in the analyzed repository.

## Requirements and read-only use

Keep Node.js 22.14+ for the CLI. Python analysis additionally requires a trusted
Python 3.10+ interpreter on PATH (CPython 3.10 and 3.13 are tested in CI). No pip
dependencies are required. Syntax support follows the selected interpreter version;
for example, syntax introduced in 3.12 cannot be parsed with a 3.10 interpreter.
The report records the Python parser version.

Install Repo Assurance outside the project, then run from the tool checkout:

```sh
npm run setup
node dist/src/cli.js scan --root "/path/to/project" --format json
```

This command is read-only, including when no `.assurance/config.json` exists. It
does not run the setup wizard or create a baseline. Defaults provide cycle warnings;
project-specific boundary enforcement requires a reviewed configuration. Keep
reports outside the project if it must remain unchanged.

On Windows, quote paths such as `"C:\work\my-project"`. If discovery cannot find a
suitable interpreter, set the process environment variable `REPO_ASSURANCE_PYTHON`
to the absolute path of a trusted Python executable outside the target repository.
This override selects one executable, not a shell command or a list of arguments.
The target configuration cannot select an executable. JS/TS-only scans do not need
Python; missing Python in a Python scan produces an incomplete result.

For guided setup that creates configuration, run `npm run onboard`. For a runnable
example, run `npm run demo:python`. The example intentionally violates its UI/storage
boundary and produces findings for both the storage initializer and imported module.

## Source roots and dependencies

```json
{
  "schemaVersion": 1,
  "mode": "observe",
  "include": ["src/**"],
  "python": { "sourceRoots": ["src"] },
  "externals": ["requests", "django"],
  "rules": {
    "boundaries": [{
      "id": "ui-uses-service",
      "from": ["src/shop/ui/**"],
      "disallow": ["src/shop/storage/**"],
      "severity": "error"
    }],
    "cycles": { "enabled": true, "severity": "error" }
  }
}
```

`python.sourceRoots` defaults to `[".", "src"]`, covering common repository-root
and src layouts. Roots are repository-relative directories, never search globs or
parent paths. Missing roots are ignored, but having no usable roots is inconclusive.
If multiple roots provide different concrete modules with the same import name,
resolution is inconclusive: select unambiguous roots rather than relying on implicit
path ordering. Namespace package portions can span configured roots.

For a monorepo, explicitly list roots such as `packages/api/src`. A directly executed
script may need its containing directory listed. Include/exclude patterns still
control which source bodies are analyzed; source roots only control import lookup.
The adapter does not execute `setup.py`, packaging hooks, `.pth` files, or `pyproject.toml`
to derive import paths, and it does not use the target environment's PYTHONPATH.

Third-party dependencies are declared by **import name**, such as `PIL`, not the
distribution name `Pillow`. A declared top-level name also covers its dotted imports.
Unknown third-party imports are inconclusive even if the package happens to be installed
on the machine. This avoids loading package initialization code to discover imports.
The wizard asks for these names but never auto-accepts every unresolved import.

The existing `externals` setting is shared with JS/TS. Review it carefully in mixed
repositories. Python local modules take precedence over these declarations; built-in
and frozen modules retain interpreter precedence. Standard-library imports are opaque
external dependencies, not a check that every submodule/attribute exists on this OS.

For external boundaries, use patterns such as `external:requests` and
`external:requests.*`. Internal boundaries match canonical repository-relative paths.

## Supported extraction

- Absolute imports, aliases, multiple imports, and multiline imports.
- Relative imports resolved through the importing file's package/source-root identity.
- Regular packages, `__init__.py` execution dependencies, and namespace packages.
- `from package import child` submodules, plus the package initialization dependency.
- Literal absolute `importlib.import_module()` calls, ordinary imported aliases of
  that function, and simple literal `__import__()` calls.
- Imports inside functions, conditionals, and exception handlers, treated conservatively
  as possible runtime dependencies. `TYPE_CHECKING` guards are not evaluated or exempted.
- UTF-8 source with or without BOM, source locations, and syntax-error diagnostics.

Cross-language FFI, HTTP contracts, function calls, attribute validity, dead-code proof,
type checking, and program behavior are outside this module graph. Python `.pyi`,
`.pyw`, notebooks, native extension source, and other languages are not analyzed.

## Incomplete and conservative cases

Computed/relative dynamic imports, contextual `__import__` calls, wildcard imports,
recognized custom module loaders, `exec`/`eval`, and recognized import-path/hook access
produce diagnostics. Unknown loaders and reflection cannot all be discovered automatically.
Their presence is not made safe by an otherwise clean graph.

For `from package import name`, an existing child module is conservatively recorded
even if runtime attribute binding could shadow it. Otherwise the adapter records the
regular package/module dependency without validating the named attribute. A namespace
package with no matching child is unresolved. Package initializer edges can expose
cycles that Python happens to tolerate; a cycle finding is an architectural dependency,
not proof of a runtime crash.

Virtual environments, site-packages, bytecode caches, and tox/nox environments are
excluded. Non-UTF-8 source, imports escaping source roots through symlinks, conflicting
roots, parser timeout/failure, and unavailable runtimes make analysis incomplete.

## Execution and evidence

The bundled helper is launched without a shell using `-I -S -B`. It receives source
text as JSON, invokes `ast.parse`, and returns import facts. Isolated mode and disabled
site processing prevent target PYTHONPATH and startup customization from being loaded.
The working directory is a temporary-system directory; interpreter selection excludes
executables inside the target. These controls do not turn an interpreter into an OS sandbox.

Parsing runs in batches of up to 128 files and approximately 8 MB of input (one larger
allowed file can exceed that batch byte target). Each parse process has a 30-second
timeout and a 32 MB output limit. File budgets and OS resource limits still matter.
There is no incremental Python index or million-line qualification.

Source, helper contents, and import existence probes enter the evidence fingerprint.
The interpreter version enters the analysis identity. Input-change checks and baseline
handling use the same pipeline as TS/JS. Git read operations disable optional locks.

## Upgrading existing users

Alpha.3 adds Python files to source discovery and Python source roots to policy identity.
Old baselines therefore require reviewed revalidation; a mismatched baseline is rejected,
never silently expanded. Generated GitHub pilots now provision Python and pin an engine
with Python support. Existing workflow files are preserved by setup, so update their
analyzer pin and runtime deliberately after reviewing the new version.

Implementation references: [Python AST](https://docs.python.org/3/library/ast.html),
[import semantics](https://docs.python.org/3/reference/import.html), and
[isolated interpreter options](https://docs.python.org/3/using/cmdline.html).
