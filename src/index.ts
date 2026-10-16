export { scan, type ScanOptions } from './core/scan.js';
export { createBaseline, reconcileBaseline } from './core/baseline.js';
export { configSchema, baselineSchema, defaultConfig, parseConfig, parseBaseline, type Config, type Baseline } from './core/config.js';
export { textReport } from './reporters/text.js';
export { sarifReport } from './reporters/sarif.js';
export { VERSION, type Report, type Finding, type Edge, type Diagnostic } from './core/types.js';
