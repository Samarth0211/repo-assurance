import { execFileSync } from 'node:child_process';

export function git(root: string, args: string[]): string {
  return execFileSync('git', ['--no-pager', '-c', 'core.fsmonitor=false', '-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024, timeout: 30_000 });
}

export function gitState(root: string): { head?: string; dirty?: boolean } {
  try {
    const head = git(root, ['rev-parse', '--verify', 'HEAD']).trim();
    return { head, dirty: git(root, ['status', '--porcelain', '--untracked-files=no']).trim().length > 0 };
  } catch { return {}; }
}

export function resolveCommit(root: string, ref: string): string {
  if (!ref || ref.startsWith('-') || /[\r\n\0]/.test(ref)) throw new Error('Invalid base revision.');
  return git(root, ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`]).trim();
}

export function gitFile(root: string, revision: string, file: string): string | undefined {
  // Distinguish an absent file from a failed Git invocation.
  const listing = git(root, ['ls-tree', '-z', revision, '--', file]);
  if (!listing) return undefined;
  return git(root, ['show', `${revision}:${file}`]);
}
