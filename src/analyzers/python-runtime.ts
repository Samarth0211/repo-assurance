import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { inside } from '../core/paths.js';
import type { TrackedIO } from '../core/io.js';
import type { Diagnostic, SourceFile } from '../core/types.js';

const parsedFile = z.object({
  path: z.string(), parsed: z.boolean(),
  imports: z.array(z.object({ module: z.string(), level: z.number().int().nonnegative(), names: z.array(z.string()).nullable(), line: z.number().int().positive(), column: z.number().int().positive() })),
  diagnostics: z.array(z.object({ code: z.string(), message: z.string() }))
});
const resultSchema = z.object({ version: z.string(), stdlib: z.array(z.string()), preloaded: z.array(z.string()), files: z.array(parsedFile) });
export type ParsedPythonFile = z.infer<typeof parsedFile>;
type Interpreter = { executable: string; prefix: string[] };

function trustedExecutable(root: string, candidate: string): string | undefined {
  try {
    if (!path.isAbsolute(candidate) || inside(root, candidate)) return undefined;
    const real = fs.realpathSync.native(candidate);
    if (inside(root, real) || !fs.statSync(real).isFile()) return undefined;
    return real;
  } catch { return undefined; }
}

function interpreters(root: string): Interpreter[] {
  const override = process.env.REPO_ASSURANCE_PYTHON;
  if (override !== undefined) {
    const executable = trustedExecutable(root, override);
    if (!executable) throw new Error('REPO_ASSURANCE_PYTHON must name an existing absolute interpreter path outside the analyzed repository.');
    return [{ executable, prefix: [] }];
  }
  const candidates: Interpreter[] = [];
  const names = process.platform === 'win32' ? ['python.exe', 'python3.exe', 'py.exe'] : ['python3', 'python'];
  for (const name of names) {
    for (const directory of (process.env.PATH ?? '').split(path.delimiter)) {
      if (!path.isAbsolute(directory)) continue;
      const executable = trustedExecutable(root, path.join(directory, name));
      if (executable && !candidates.some(c => c.executable === executable)) candidates.push({ executable, prefix: name === 'py.exe' ? ['-3'] : [] });
    }
  }
  return candidates;
}

export function parsePython(root: string, files: SourceFile[], io: TrackedIO): { files: ParsedPythonFile[]; diagnostics: Diagnostic[]; version?: string; stdlib: Set<string>; preloaded: Set<string> } {
  const result = { files: [] as ParsedPythonFile[], diagnostics: [] as Diagnostic[], version: undefined as string | undefined, stdlib: new Set<string>(), preloaded: new Set<string>() };
  if (!files.length) return result;
  const helper = fileURLToPath(new URL('./python-parser.py', import.meta.url));
  let interpreter: Interpreter | undefined;
  function invoke(selected: Interpreter, batch: SourceFile[], timeout: number) {
    const child = spawnSync(selected.executable, [...selected.prefix, '-I', '-S', '-B', helper], {
      cwd: os.tmpdir(), input: JSON.stringify({ files: batch.map(f => ({ path: f.path, text: f.text })) }),
      encoding: 'utf8', timeout, maxBuffer: 32 * 1024 * 1024, windowsHide: true
    });
    if (child.error || child.status !== 0) throw new Error(child.error?.message ?? `Parser process exited ${child.status}: ${child.stderr.slice(0, 500)}`);
    return resultSchema.parse(JSON.parse(child.stdout));
  }
  try {
    if (io.read(helper) === undefined) throw new Error('Python helper is missing. Rebuild or reinstall Repo Assurance.');
    for (const candidate of interpreters(root)) {
      try {
        const probe = invoke(candidate, [], 10_000);
        if (!/^3\.(?:1[0-9]|[2-9][0-9])\./.test(probe.version)) continue;
        interpreter = candidate;
        result.version = probe.version;
        result.stdlib = new Set(probe.stdlib);
        result.preloaded = new Set(probe.preloaded);
        break;
      } catch { /* Try the next trusted interpreter; never execute project scripts. */ }
    }
    if (!interpreter) throw new Error('Install Python 3.10+ on PATH, or set REPO_ASSURANCE_PYTHON to a trusted absolute interpreter path outside this repository.');
  } catch (error) {
    result.diagnostics.push({ code: 'PYTHON_RUNTIME_UNAVAILABLE', message: (error as Error).message });
    return result;
  }
  let start = 0;
  while (start < files.length) {
    let end = start; let bytes = 0;
    do { bytes += files[end++]!.bytes; } while (end < files.length && end - start < 128 && bytes + files[end]!.bytes <= 8_000_000);
    const batch = files.slice(start, end);
    try {
      const parsed = invoke(interpreter, batch, 30_000);
      if (parsed.version !== result.version || parsed.files.length !== batch.length || parsed.files.some((file, i) => file.path !== batch[i]!.path)) throw new Error('Python parser returned inconsistent runtime or file identities.');
      result.files.push(...parsed.files);
      for (const file of parsed.files) result.diagnostics.push(...file.diagnostics.map(d => ({ ...d, path: file.path })));
    } catch (error) {
      result.diagnostics.push({ code: 'PYTHON_PARSER_FAILED', message: `Could not parse batch starting at ${batch[0]!.path}: ${(error as Error).message}` });
    }
    start = end;
  }
  return result;
}
