# Dependencies and licensing

The project license is MIT. Third-party packages keep their own licenses and notices; MIT does not replace them.

The lockfile pins exact packages. Runtime dependencies are TypeScript, Zod, and minimatch; development typing dependencies support compilation/tests. Review `package-lock.json` and installed package metadata for the exact release inventory.

TypeScript provides parsing and module resolution. Zod validates configuration and baseline input. Minimatch evaluates bounded glob patterns. The project does not require a paid scanner, API, or hosted database.

Python analysis also needs a trusted Python 3.10+ interpreter. Its standard-library
AST parser is used through the bundled helper; no pip dependency or target package
installation is required. The build copies that helper into the distributable package.

To inspect an installation:

```sh
npm ls --all
npm audit
npm sbom --sbom-format cyclonedx
```

Store generated inventories according to release policy. Review advisories and license compatibility when upgrading. A zero-advisory result only describes the registry's known advisories at that time.

The MIT license permits commercial redistribution, including sales, subject to preservation of its notice. See [the project license](../LICENSE) and the [Open Source Initiative's MIT text](https://opensource.org/license/mit).
