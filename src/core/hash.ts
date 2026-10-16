import { createHash } from 'node:crypto';

export function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b, 'en')).map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function hash(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

export function digest(value: unknown): string { return hash(stable(value)); }
