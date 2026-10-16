import fs from 'node:fs';
import { z } from 'zod';
import { configSchema, baselineSchema } from '../dist/src/core/config.js';

fs.mkdirSync(new URL('../schemas/', import.meta.url), { recursive: true });
for (const [name, schema] of [['config', configSchema], ['baseline', baselineSchema]]) {
  fs.writeFileSync(new URL(`../schemas/${name}.schema.json`, import.meta.url), JSON.stringify(z.toJSONSchema(schema, { target: 'draft-2020-12', io: 'input' }), null, 2) + '\n');
}
