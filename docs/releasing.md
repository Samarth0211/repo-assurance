# Release procedure

## Prepare

1. Start from a clean trusted checkout and a supported Node version.
2. Run `npm ci --ignore-scripts`, then `npm run check`.
3. Run `npm run schemas` and verify committed schemas match runtime validation.
4. Run `npm run docs:check`.
5. Run `npm audit` and review results; a clean advisory report is not a security proof.
6. Run `npm pack` and inspect the archive inventory. Install it into an isolated temporary prefix and exercise `--version`, the library export, and a representative check.
7. Review the capability matrix, changelog, dependency licenses, and validation record.

## Version consistency

Update `package.json`, the lockfile, `src/core/types.ts`, changelog, and version assertions in tests together. Alpha changes may alter report/schema contracts; call out changes explicitly. Use immutable tags/commit IDs for consumers who require reproducible tooling.

## Publish

Publishing a GitHub release, pushing a tag, or publishing to npm is a deliberate maintainer action. A public source repository does not imply an npm release exists. Confirm package contents and repository protections before publishing artifacts.

Never publish secrets, developer machine configuration, real private repositories, `node_modules`, or local reports. The package allowlist excludes tests and private working files from the runtime package.

## After publication

Verify the published archive/revision, install instructions, license, and release notes. Record actual CI/packaging results in the validation record. File follow-up limitations accurately; avoid claiming unfinished roadmap items as release features.
