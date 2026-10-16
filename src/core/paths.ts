import path from 'node:path';

export function slash(value: string): string { return value.replaceAll('\\', '/'); }
export function relative(root: string, file: string): string { return slash(path.relative(root, file)); }
export function inside(root: string, file: string): boolean {
  const rel = path.relative(root, file);
  return rel === '' || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel));
}
