import fs from 'node:fs';
import path from 'node:path';
import { minimatch } from 'minimatch';
import { ALWAYS_EXCLUDED, type Config } from './config.js';
import { git } from './git.js';
import { hash } from './hash.js';
import { TrackedIO } from './io.js';
import { inside, relative, slash } from './paths.js';
import type { Diagnostic, SourceFile } from './types.js';

export const SOURCE_PATTERN = /\.(?:[cm]?[jt]s|[jt]sx)$/i;
export const matches = (file: string, patterns: string[]): boolean => patterns.some(pattern => minimatch(file, pattern, { dot: true, nocomment: true, nonegate: true }));

export function inventory(root: string, config: Config): { paths: string[]; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  let candidates: string[];
  let isGit = false;
  try { isGit = git(root, ['rev-parse', '--show-toplevel']).trim() !== ''; } catch { /* A directory need not be a Git repository. */ }
  if (isGit) {
    candidates = git(root, ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', '.']).split('\0').filter(Boolean);
    for (const item of git(root, ['ls-files', '--stage', '-z', '--', '.']).split('\0').filter(Boolean)) {
      const tab = item.indexOf('\t');
      const rel = slash(item.slice(tab + 1));
      if (matches(rel, [...ALWAYS_EXCLUDED, ...config.exclude]) || matches(`${rel}/__probe__`, [...ALWAYS_EXCLUDED, ...config.exclude])) continue;
      if (item.startsWith('160000 ')) diagnostics.push({ code: 'SUBMODULE_NOT_ANALYZED', path: rel, message: 'Submodules are not traversed. Analyze this repository separately or explicitly exclude it from scope.' });
      if (item.startsWith('120000 ') && SOURCE_PATTERN.test(rel) && matches(rel, config.include)) diagnostics.push({ code: 'TRACKED_SYMLINK', path: rel, message: 'Git records this source as a symbolic link; its target is not an ordinary analyzed source file.' });
    }
  } else {
    candidates = [];
    const queue = [''];
    while (queue.length) {
      const dir = queue.pop()!;
      for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
        const rel = slash(path.join(dir, entry.name));
        if (matches(rel, [...ALWAYS_EXCLUDED, ...config.exclude]) || matches(`${rel}/__probe__`, [...ALWAYS_EXCLUDED, ...config.exclude])) continue;
        if (entry.isSymbolicLink()) {
          diagnostics.push({ code: 'SYMLINK_SKIPPED', path: rel, message: 'Symbolic links are not traversed. Include their real source in an explicitly supported workspace.' });
        } else if (entry.isDirectory()) queue.push(rel);
        else if (entry.isFile()) candidates.push(rel);
      }
    }
  }
  const paths = [...new Set(candidates.map(slash))].filter(p => SOURCE_PATTERN.test(p) && matches(p, config.include) && !matches(p, [...ALWAYS_EXCLUDED, ...config.exclude])).sort();
  if (paths.length > config.analysis.maxFiles) diagnostics.push({ code: 'FILE_BUDGET_EXCEEDED', message: `${paths.length} source files exceed the configured limit of ${config.analysis.maxFiles}. Analysis is incomplete.` });
  return { paths, diagnostics };
}

export function discover(root: string, config: Config, io: TrackedIO): { files: SourceFile[]; paths: string[]; diagnostics: Diagnostic[] } {
  const found = inventory(root, config);
  const files: SourceFile[] = [];
  for (const p of found.paths.slice(0, config.analysis.maxFiles)) {
    const absolute = path.resolve(root, p);
    try {
      if (!inside(root, absolute) || !inside(root, fs.realpathSync(absolute)) || fs.lstatSync(absolute).isSymbolicLink()) {
        found.diagnostics.push({ code: 'UNSAFE_PATH', path: p, message: 'Source escapes the repository or is a symbolic link.' });
        continue;
      }
      const size = fs.statSync(absolute).size;
      if (size > config.analysis.maxFileBytes) {
        found.diagnostics.push({ code: 'FILE_TOO_LARGE', path: p, message: `Source exceeds the ${config.analysis.maxFileBytes}-byte analysis limit.` });
        continue;
      }
      const text = io.read(absolute);
      if (text === undefined) throw new Error('Source is missing.');
      if (text.startsWith('version https://git-lfs.github.com/spec/v1')) {
        found.diagnostics.push({ code: 'LFS_POINTER', path: p, message: 'Git LFS source content is not present.' });
        continue;
      }
      files.push({ path: relative(root, absolute), hash: hash(text), bytes: Buffer.byteLength(text), text });
    } catch (error) {
      found.diagnostics.push({ code: 'SOURCE_UNREADABLE', path: p, message: `Cannot read source: ${(error as Error).message}` });
    }
  }
  return { files, paths: found.paths, diagnostics: found.diagnostics };
}
