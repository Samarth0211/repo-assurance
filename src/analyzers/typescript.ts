import fs from 'node:fs';
import path from 'node:path';
import { isBuiltin } from 'node:module';
import ts from 'typescript';
import type { Config } from '../core/config.js';
import { matchesSpecifier } from '../core/discovery.js';
import type { TrackedIO } from '../core/io.js';
import { inside, relative } from '../core/paths.js';
import type { Diagnostic, Edge, SourceFile } from '../core/types.js';

export function analyzeTypeScript(root: string, files: SourceFile[], config: Config, io: TrackedIO): { edges: Edge[]; diagnostics: Diagnostic[]; analyzed: number } {
  const diagnostics: Diagnostic[] = [];
  const edges: Edge[] = [];
  const included = new Set(files.map(f => f.path));
  const configurations = new Map<string, ts.CompilerOptions>();
  const defaultOptions: ts.CompilerOptions = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, allowJs: true, resolveJsonModule: true };
  const host: ts.ModuleResolutionHost = {
    fileExists: io.fileExists,
    readFile: io.read,
    directoryExists: io.directoryExists,
    realpath: p => { try { return fs.realpathSync(p); } catch { return p; } },
    getCurrentDirectory: () => root,
    useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames
  };

  function optionsFor(file: string): ts.CompilerOptions {
    let dir = path.dirname(file);
    let configPath: string | undefined;
    while (inside(root, dir)) {
      for (const name of ['tsconfig.json', 'jsconfig.json']) {
        const candidate = path.join(dir, name);
        if (io.fileExists(candidate)) { configPath = candidate; break; }
      }
      if (configPath || dir === root) break;
      dir = path.dirname(dir);
    }
    if (!configPath) return defaultOptions;
    const cached = configurations.get(configPath);
    if (cached) return cached;
    const read = ts.readConfigFile(configPath, io.read);
    if (read.error) diagnostics.push({ code: 'COMPILER_CONFIG', path: relative(root, configPath), message: ts.flattenDiagnosticMessageText(read.error.messageText, '\n') });
    const parsed = ts.parseJsonConfigFileContent(read.config ?? {}, {
      useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
      readDirectory: ts.sys.readDirectory,
      fileExists: io.fileExists,
      readFile: io.read
    }, path.dirname(configPath), undefined, configPath);
    // File inclusion is controlled by the assurance scope. Empty TS project inputs
    // are not syntax/configuration errors for a module-only inspection.
    for (const error of parsed.errors.filter(e => ![18002, 18003].includes(e.code))) {
      diagnostics.push({ code: 'COMPILER_CONFIG', path: relative(root, configPath), message: ts.flattenDiagnosticMessageText(error.messageText, '\n') });
    }
    configurations.set(configPath, parsed.options);
    return parsed.options;
  }

  for (const file of files) {
    const absolute = path.join(root, file.path);
    const options = optionsFor(absolute);
    const source = ts.createSourceFile(absolute, file.text, ts.ScriptTarget.Latest, true);
    source.impliedNodeFormat = ts.getImpliedNodeFormatForFile(absolute as ts.Path, undefined, host, options);
    const parseErrors = (source as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] }).parseDiagnostics;
    for (const error of parseErrors) diagnostics.push({ code: 'SYNTAX_ERROR', path: file.path, message: ts.flattenDiagnosticMessageText(error.messageText, '\n') });

    function dependency(node: ts.Node, literal: ts.Expression | ts.TypeNode | undefined, kind: Edge['kind'], requireMode = false): void {
      if (!literal || !ts.isStringLiteralLike(literal)) {
        diagnostics.push({ code: 'DYNAMIC_IMPORT', path: file.path, message: 'A computed import/require cannot be resolved statically. Declare the architectural intent or exclude the unsupported source explicitly.' });
        return;
      }
      const specifier = literal.text;
      const pos = source.getLineAndCharacterOfPosition(node.getStart(source));
      const location = { from: file.path, specifier, line: pos.line + 1, column: pos.character + 1, kind };
      if (isBuiltin(specifier) || matchesSpecifier(specifier, config.externals)) {
        edges.push({ ...location, to: `external:${specifier}`, resolution: 'external' });
        return;
      }
      const mode = requireMode ? ts.ModuleKind.CommonJS : ts.getModeForUsageLocation(source, literal, options);
      const resolved = ts.resolveModuleName(specifier, absolute, options, host, undefined, undefined, mode).resolvedModule;
      if (!resolved) {
        diagnostics.push({ code: 'UNRESOLVED_IMPORT', path: file.path, message: `Cannot resolve ${JSON.stringify(specifier)}. Install the repository's dependencies, correct its compiler configuration, or explicitly declare an external module.` });
        return;
      }
      const target = path.resolve(resolved.resolvedFileName);
      const rel = relative(root, target);
      if (resolved.isExternalLibraryImport || !inside(root, target) || rel.split('/').includes('node_modules')) {
        // Workspace aliases resolved by TS into actual source are internal even
        // when package resolution marks the import as a library.
        if (inside(root, target) && included.has(rel)) edges.push({ ...location, to: rel, resolution: 'internal' });
        else edges.push({ ...location, to: `external:${specifier}`, resolution: 'external' });
      } else {
        edges.push({ ...location, to: rel, resolution: included.has(rel) ? 'internal' : 'excluded' });
      }
    }

    const queue: ts.Node[] = [source];
    while (queue.length) {
      const node = queue.pop()!;
      if (ts.isImportDeclaration(node)) {
        const clause = node.importClause;
        const named = clause?.namedBindings;
        const onlyTypes = !!clause?.isTypeOnly || (!!named && ts.isNamedImports(named) && named.elements.length > 0 && named.elements.every(e => e.isTypeOnly) && !clause?.name);
        dependency(node, node.moduleSpecifier, onlyTypes ? 'type' : 'runtime');
      } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
        const clause = node.exportClause;
        const onlyTypes = node.isTypeOnly || (!!clause && ts.isNamedExports(clause) && clause.elements.length > 0 && clause.elements.every(e => e.isTypeOnly));
        dependency(node, node.moduleSpecifier, onlyTypes ? 'type' : 'runtime');
      } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
        dependency(node, node.moduleReference.expression, node.isTypeOnly ? 'type' : 'runtime', true);
      } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
        dependency(node, node.argument.literal, 'type');
      } else if (ts.isCallExpression(node)) {
        if (node.expression.kind === ts.SyntaxKind.ImportKeyword) dependency(node, node.arguments[0], 'runtime');
        else if (ts.isIdentifier(node.expression) && node.expression.text === 'require') dependency(node, node.arguments[0], 'runtime', true);
      }
      ts.forEachChild(node, child => { queue.push(child); });
    }
  }
  edges.sort((a, b) => a.from.localeCompare(b.from, 'en') || a.to.localeCompare(b.to, 'en') || a.line - b.line || a.column - b.column);
  return { edges, diagnostics, analyzed: files.length };
}
