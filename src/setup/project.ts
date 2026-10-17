import path from 'node:path';
import { type Config, readOptional } from '../core/config.js';
import { inventory, matches } from '../core/discovery.js';
import { hash } from '../core/hash.js';

type Boundary = Config['rules']['boundaries'][number];
export type Project = {
  paths: string[];
  languages: string[];
  frameworks: string[];
  scopes: string[];
  notes: string[];
};

// Only offer literal directory names that are safe in a configuration glob.
const literalDirectory = (value: string): boolean => value.split('/').every(segment => /^[a-zA-Z0-9_@.-]+$/.test(segment) && !['.', '..'].includes(segment));

export function inspectProject(root: string, config: Config): Project {
  const found = inventory(root, config);
  const frameworks: string[] = [];
  const notes = found.diagnostics.map(d => d.message);
  try {
    const text = readOptional(root, 'package.json');
    if (text) {
      const manifest = JSON.parse(text);
      const dependencies = { ...manifest.dependencies, ...manifest.devDependencies };
      for (const [name, label] of [['next', 'Next.js'], ['react', 'React'], ['vue', 'Vue'], ['@angular/core', 'Angular'], ['express', 'Express'], ['@nestjs/core', 'NestJS'], ['svelte', 'Svelte']]) {
        if (Object.hasOwn(dependencies, name!)) frameworks.push(label!);
      }
    }
  } catch { notes.push('package.json could not be read as a package manifest. The first scan will check analysis readiness.'); }
  const scopes = new Set<string>();
  for (const file of found.paths) {
    const parts = file.split('/');
    if (['apps', 'packages'].includes(parts[0]!) && parts.length > 2) {
      const directory = parts.slice(0, 2).join('/');
      if (literalDirectory(directory)) scopes.add(`${directory}/**`);
    }
  }
  return {
    paths: found.paths,
    languages: [found.paths.some(p => /\.[cm]?tsx?$/i.test(p)) ? 'TypeScript' : '', found.paths.some(p => /\.[cm]?jsx?$/i.test(p)) ? 'JavaScript' : ''].filter(Boolean),
    frameworks,
    scopes: [...scopes].sort(),
    notes
  };
}

export function suggestBoundaries(paths: string[], include: string[]): Boundary[] {
  const groups = new Map<string, { ui: Set<string>; storage: Set<string> }>();
  for (const file of paths.filter(file => matches(file, include))) {
    const directories = path.posix.dirname(file).split('/');
    directories.forEach((directory, i) => {
      const kind = ['ui', 'components', 'pages'].includes(directory) ? 'ui' : ['db', 'database', 'storage'].includes(directory) ? 'storage' : undefined;
      if (!kind) return;
      const parent = directories.slice(0, i).join('/');
      const folder = directories.slice(0, i + 1).join('/');
      if (!literalDirectory(folder)) return;
      const group = groups.get(parent) ?? { ui: new Set<string>(), storage: new Set<string>() };
      group[kind].add(`${folder}/**`);
      groups.set(parent, group);
    });
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b, 'en')).filter(([, group]) => group.ui.size && group.storage.size).map(([parent, group]) => ({
    id: `ui-storage-${hash(parent).slice(0, 10)}`,
    from: [...group.ui].sort(), disallow: [...group.storage].sort(), severity: 'error',
    message: 'UI files must use a service interface instead of importing storage directly.'
  }));
}
