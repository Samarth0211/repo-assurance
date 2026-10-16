import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { digest } from './hash.js';
import { inside } from './paths.js';

export const CONFIG_PATH = '.assurance/config.json';
export const BASELINE_PATH = '.assurance/baseline.json';
export const ALWAYS_EXCLUDED = ['**/.git/**', '**/node_modules/**', '**/.assurance-cache/**'];
const glob = z.string().min(1).max(512).refine(v => !v.includes('\\') && !v.startsWith('/') && !v.split('/').includes('..'), 'Use a relative forward-slash glob without parent traversal.');
const severity = z.enum(['error', 'warning']);
export const configSchema = z.strictObject({
  $schema: z.string().max(2000).optional(),
  schemaVersion: z.literal(1),
  mode: z.enum(['observe', 'enforce']).default('observe'),
  include: z.array(glob).min(1).max(100).default(['**/*']),
  exclude: z.array(glob).max(100).default(['**/dist/**', '**/build/**', '**/coverage/**', '**/.next/**']),
  externals: z.array(z.string().min(1).max(512)).max(200).default([]),
  analysis: z.strictObject({
    maxFiles: z.number().int().min(1).max(1_000_000).default(50_000),
    maxFileBytes: z.number().int().min(1).max(20_000_000).default(2_000_000)
  }).default({ maxFiles: 50_000, maxFileBytes: 2_000_000 }),
  rules: z.strictObject({
    boundaries: z.array(z.strictObject({
      id: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_.-]{0,79}$/),
      from: z.array(glob).min(1).max(100),
      disallow: z.array(glob).min(1).max(100),
      severity: severity.default('error'),
      message: z.string().max(1000).optional()
    })).max(200).default([]),
    cycles: z.strictObject({
      enabled: z.boolean().default(true),
      severity: severity.default('warning'),
      includeTypeOnly: z.boolean().default(false)
    }).default({ enabled: true, severity: 'warning', includeTypeOnly: false })
  }).default({ boundaries: [], cycles: { enabled: true, severity: 'warning', includeTypeOnly: false } })
});
export type Config = z.infer<typeof configSchema>;

export const baselineSchema = z.strictObject({
  schemaVersion: z.literal(1),
  policyHash: z.string().regex(/^[a-f0-9]{64}$/),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  entries: z.array(z.strictObject({
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    ruleId: z.string().min(1).max(100),
    reason: z.string().min(1).max(1000)
  })).max(100_000)
});
export type Baseline = z.infer<typeof baselineSchema>;

export function parseConfig(text: string): Config {
  const config = configSchema.parse(JSON.parse(text));
  const ids = config.rules.boundaries.map(r => r.id);
  if (new Set(ids).size !== ids.length || ids.includes('dependency-cycle')) throw new Error('Boundary rule IDs must be unique and cannot be dependency-cycle.');
  return config;
}

export function parseBaseline(text: string): Baseline {
  const baseline = baselineSchema.parse(JSON.parse(text));
  const ids = baseline.entries.map(e => e.fingerprint);
  if (new Set(ids).size !== ids.length) throw new Error('Baseline fingerprints must be unique.');
  return baseline;
}

export function defaultConfig(): Config { return configSchema.parse({ schemaVersion: 1 }); }
export function policyHash(config: Config): string {
  return digest({ include: config.include, exclude: config.exclude, externals: config.externals, rules: config.rules });
}

export function readOptional(root: string, file: string): string | undefined {
  const filename = path.join(root, file);
  try {
    const stat = fs.lstatSync(filename);
    if (!inside(root, fs.realpathSync(filename))) throw new Error(`${file} escapes the repository.`);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${file} must be a regular file.`);
    if (stat.size > 16_000_000) throw new Error(`${file} is too large (16 MB limit).`);
    return fs.readFileSync(filename, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

export function assertConfigDirectory(root: string): void {
  const dir = path.join(root, '.assurance');
  if (!fs.existsSync(dir)) return;
  const stat = fs.lstatSync(dir);
  if (stat.isSymbolicLink() || !stat.isDirectory() || !inside(root, fs.realpathSync(dir))) throw new Error('.assurance must be a real directory inside the repository.');
}
