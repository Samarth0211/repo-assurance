# Contributing

Thank you for helping make repository analysis more dependable. Contributions should improve a defined capability and bring evidence for its behavior.

## Local setup

Use Node.js 22.14+ and Git. Clone the project and run:

```sh
npm run setup
npm run check
```

The source is TypeScript. `src/core` provides common facts and orchestration, `src/analyzers` extracts facts, `src/policies` evaluates them, and `src/reporters` renders results. See [architecture](docs/architecture.md).

## Changes and tests

- Keep changes focused and explain the user-visible problem.
- Add a meaningful fixture when changing resolution, findings, baselines, or enforcement.
- For a blocking rule, include safe, violating, and incomplete-input cases.
- For optimization, demonstrate equivalence with the prior full analysis and provide measurements.
- Update capability/limitation documents whenever the supported model changes.
- Run `npm run schemas` after schema changes and commit the generated files.
- Run `npm run docs:check` for documentation links.
- Do not add network requests, telemetry, or paid prerequisites to core analysis.

Tests use isolated temporary repositories and never require production credentials. Avoid tests that merely duplicate an implementation detail or pretend a mocked success proves integration correctness.

## Pull request description

Explain the trigger, resulting behavior, evidence/validation, and material limitations. If analysis coverage changes, describe what became supported or unsupported. Findings must carry reproducible evidence, not an unexplained quality score.

Security-sensitive issues should use the private process in [SECURITY.md](SECURITY.md). General bugs can use the issue template with redacted minimal fixtures.

## License and review

Contributions are made under the project's MIT license. Keep attribution for third-party code and check dependencies before introducing them. Do not contribute code you lack permission to distribute.

Maintainers decide whether a change fits the published scope. A new language or framework adapter needs a clear owner, supported-case matrix, limitation documentation, and regression fixtures before it can authorize mandatory checks.
