import fs from 'node:fs';
import path from 'node:path';
import { inside } from '../core/paths.js';

export type SetupFile = { path: string; content: string };

function stat(file: string): fs.Stats | undefined {
  try { return fs.lstatSync(file); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
}

export function validateTarget(root: string, relative: string): boolean {
  if (!relative || path.isAbsolute(relative) || relative.split(/[\\/]/).some(part => part === '..')) throw new Error('Setup output must stay inside the project.');
  const target = path.resolve(root, relative);
  if (!inside(root, target) || target === root) throw new Error('Setup output must stay inside the project.');
  const segments = path.relative(root, target).split(path.sep);
  let current = root;
  for (const [i, segment] of segments.entries()) {
    current = path.join(current, segment);
    const entry = stat(current);
    if (!entry) continue;
    if (entry.isSymbolicLink() || !inside(root, fs.realpathSync.native(current))) throw new Error(`Unsafe setup path: ${relative}. Symbolic links are not followed for writes.`);
    if (i < segments.length - 1 && !entry.isDirectory()) throw new Error(`Setup needs a directory at ${path.relative(root, current)}.`);
    if (i === segments.length - 1) {
      if (!entry.isFile()) throw new Error(`Setup needs a regular file at ${relative}.`);
      return true;
    }
  }
  return false;
}

export function writeSetupFiles(root: string, files: SetupFile[]): void {
  if (new Set(files.map(file => file.path)).size !== files.length) throw new Error('Duplicate setup output path.');
  for (const file of files) if (validateTarget(root, file.path)) throw new Error(`Refusing to overwrite ${file.path}. Run setup again to use the existing file.`);
  const created: string[] = [];
  try {
    for (const file of files) {
      if (validateTarget(root, file.path)) throw new Error(`${file.path} appeared after the preview.`);
      fs.mkdirSync(path.dirname(path.join(root, file.path)), { recursive: true });
      validateTarget(root, file.path);
      fs.writeFileSync(path.join(root, file.path), file.content, { encoding: 'utf8', flag: 'wx' });
      created.push(file.path);
    }
  } catch (error) {
    throw new Error(`Setup stopped. Created files: ${created.join(', ') || 'none'}. Existing files were not overwritten. ${(error as Error).message}`);
  }
}
