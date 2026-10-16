import fs from 'node:fs';
import path from 'node:path';
import { digest, hash } from './hash.js';
import { relative } from './paths.js';

// Records the filesystem inputs actually consulted by the compiler resolver.
// This is snapshot evidence, not an incremental cache.
export class TrackedIO {
  private readonly contents = new Map<string, string | undefined>();
  private readonly files = new Map<string, boolean>();
  private readonly directories = new Map<string, boolean>();
  constructor(readonly root: string) {}

  read = (file: string): string | undefined => {
    const key = path.resolve(file);
    if (this.contents.has(key)) return this.contents.get(key);
    let text: string | undefined;
    try {
      if (fs.statSync(key).size > 20_000_000) throw new Error(`Compiler input exceeds 20 MB: ${relative(this.root, key)}`);
      text = fs.readFileSync(key, 'utf8');
    } catch (error) {
      if (!['ENOENT', 'ENOTDIR', 'EISDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
    }
    this.contents.set(key, text);
    return text;
  };

  fileExists = (file: string): boolean => {
    const key = path.resolve(file);
    const result = isFile(key);
    if (!this.files.has(key)) this.files.set(key, result);
    return result;
  };

  directoryExists = (file: string): boolean => {
    const key = path.resolve(file);
    const result = isDirectory(key);
    if (!this.directories.has(key)) this.directories.set(key, result);
    return result;
  };

  fingerprint(): string {
    return digest({
      contents: [...this.contents].map(([p, text]) => [relative(this.root, p), text === undefined ? null : hash(text)]).sort(),
      files: [...this.files].map(([p, exists]) => [relative(this.root, p), exists]).sort(),
      directories: [...this.directories].map(([p, exists]) => [relative(this.root, p), exists]).sort()
    });
  }

  changed(): string[] {
    const changed = new Set<string>();
    for (const [p, prior] of this.contents) {
      let now: string | undefined;
      try { now = fs.readFileSync(p, 'utf8'); } catch { now = undefined; }
      if (now !== prior) changed.add(relative(this.root, p));
    }
    for (const [p, prior] of this.files) if (isFile(p) !== prior) changed.add(relative(this.root, p));
    for (const [p, prior] of this.directories) if (isDirectory(p) !== prior) changed.add(relative(this.root, p));
    return [...changed].sort();
  }
}

function isFile(p: string): boolean { try { return fs.statSync(p).isFile(); } catch { return false; } }
function isDirectory(p: string): boolean { try { return fs.statSync(p).isDirectory(); } catch { return false; } }
