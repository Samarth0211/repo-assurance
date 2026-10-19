import fs from 'node:fs';
import path from 'node:path';
import type { Config } from '../core/config.js';
import { ALWAYS_EXCLUDED } from '../core/config.js';
import { matches } from '../core/discovery.js';
import type { TrackedIO } from '../core/io.js';
import { inside, relative } from '../core/paths.js';
import type { Diagnostic, Edge, SourceFile } from '../core/types.js';
import { parsePython } from './python-runtime.js';

type Resolved = { kind: 'module' | 'package' | 'namespace'; targets: string[]; directories: string[] };

export function analyzePython(root: string, files: SourceFile[], config: Config, io: TrackedIO): { edges: Edge[]; diagnostics: Diagnostic[]; analyzed: number; version?: string } {
  const parsed = parsePython(root, files, io);
  const diagnostics = parsed.diagnostics;
  const edges: Edge[] = [];
  const included = new Set(files.map(f => f.path));
  if (!files.length || !parsed.version) return { edges, diagnostics, analyzed: 0, version: parsed.version };
  const roots: string[] = [];
  function safe(candidate: string): string {
    const real = fs.realpathSync.native(candidate);
    if (!inside(root, real) || matches(relative(root, real), ALWAYS_EXCLUDED)) throw new Error(`Python import path leaves the supported project source: ${relative(root, candidate)}`);
    return real;
  }
  for (const directory of config.python.sourceRoots) {
    const candidate = path.resolve(root, directory);
    try {
      if (io.directoryExists(candidate)) { const real = safe(candidate); if (!roots.includes(real)) roots.push(real); }
    } catch (error) { diagnostics.push({ code: 'PYTHON_SOURCE_ROOT', message: (error as Error).message }); }
  }
  if (!roots.length) diagnostics.push({ code: 'PYTHON_SOURCE_ROOT', message: 'No configured Python source root exists. Review python.sourceRoots.' });
  const cache = new Map<string, Resolved | undefined>();

  function resolve(module: string): Resolved | undefined {
    if (cache.has(module)) return cache.get(module);
    const parts = module.split('.');
    if (parts.some(part => !/^[_\p{XID_Start}][_\p{XID_Continue}]*$/u.test(part))) return undefined;
    let locations = roots;
    const targets: string[] = [];
    let result: Resolved | undefined;
    for (const [i, part] of parts.entries()) {
      const regular = new Map<string, Resolved>();
      const namespaces = new Set<string>();
      for (const location of locations) {
        const directory = path.join(location, part);
        const init = path.join(directory, '__init__.py');
        const file = `${directory}.py`;
        if (io.fileExists(init)) {
          const canonical = safe(init);
          regular.set(canonical, { kind: 'package', targets: [relative(root, canonical)], directories: [safe(directory)] });
        } else if (io.fileExists(file)) {
          const canonical = safe(file);
          regular.set(canonical, { kind: 'module', targets: [relative(root, canonical)], directories: [] });
        } else if (io.directoryExists(directory)) namespaces.add(safe(directory));
      }
      if (regular.size > 1) throw new Error(`Multiple source roots provide ${parts.slice(0, i + 1).join('.')}. Choose unambiguous python.sourceRoots.`);
      const found = [...regular.values()][0];
      if (found) {
        targets.push(...found.targets);
        if (i < parts.length - 1 && found.kind === 'module') return undefined;
        result = { ...found, targets: [...targets] };
        locations = found.directories;
      } else if (namespaces.size) {
        locations = [...namespaces];
        result = { kind: 'namespace', targets: [...targets], directories: locations };
      } else { result = undefined; break; }
    }
    cache.set(module, result);
    return result;
  }

  function packageOf(file: string): string | undefined {
    // Prefer the most specific configured root for a source file's package identity.
    const absolute = path.join(root, file);
    const sourceRoot = roots.filter(r => inside(r, absolute)).sort((a, b) => b.length - a.length)[0];
    if (!sourceRoot) return undefined;
    const directory = relative(sourceRoot, path.dirname(absolute));
    return directory ? directory.replaceAll('/', '.') : undefined;
  }
  for (const file of parsed.files) {
    for (const dependency of file.imports) {
      const location = { from: file.path, line: dependency.line, column: dependency.column, kind: 'runtime' as const };
      const original = '.'.repeat(dependency.level) + dependency.module;
      const add = (resolved: Resolved, specifier: string): void => {
        for (const target of resolved.targets) if (target !== file.path) edges.push({ ...location, specifier, to: target, resolution: included.has(target) ? 'internal' : 'excluded' });
      };
      try {
        let module = dependency.module;
        if (dependency.level) {
          const pkg = packageOf(file.path)?.split('.');
          if (!pkg || dependency.level > pkg.length) throw new Error(`Relative import ${original} goes beyond the known package. Review python.sourceRoots and package layout.`);
          module = [...pkg.slice(0, pkg.length - dependency.level + 1), ...(module ? module.split('.') : [])].join('.');
        }
        const top = module.split('.')[0]!;
        // Built-in/frozen modules precede ordinary filesystem imports in Python.
        const preloaded = !dependency.level && parsed.preloaded.has(top);
        const topLocal = preloaded ? undefined : resolve(top);
        // An installed stdlib module also wins over an earlier namespace-only portion.
        const standard = !dependency.level && parsed.stdlib.has(top) && (!topLocal || topLocal.kind === 'namespace');
        const resolved = preloaded || standard ? undefined : resolve(module);
        if (resolved) {
          add(resolved, original);
          if (dependency.names && resolved.kind !== 'module') {
            for (const name of dependency.names.filter(name => name !== '*')) {
              const child = resolve(`${module}.${name}`);
              if (child) add(child, `${original}${dependency.module ? '.' : ''}${name}`);
              else if (resolved.kind === 'namespace') throw new Error(`Cannot resolve ${module}.${name} in a namespace package.`);
              // A regular module/package may expose an attribute instead of a child module.
            }
          }
        } else if (!dependency.level && (preloaded || standard || (!topLocal && (matches(module, config.externals) || matches(top, config.externals))))) {
          edges.push({ ...location, specifier: original, to: `external:${module}`, resolution: 'external' });
        } else throw new Error(`Cannot resolve Python import ${original}. Review python.sourceRoots, or declare a third-party import name in externals. Installed packages are not imported or inspected.`);
      } catch (error) { diagnostics.push({ code: 'PYTHON_IMPORT_UNRESOLVED', path: file.path, message: (error as Error).message }); }
    }
  }
  const unique = [...new Map(edges.map(e => [JSON.stringify(e), e])).values()];
  unique.sort((a, b) => a.from.localeCompare(b.from, 'en') || a.to.localeCompare(b.to, 'en') || a.line - b.line || a.column - b.column);
  return { edges: unique, diagnostics, analyzed: parsed.files.filter(f => f.parsed).length, version: parsed.version };
}
