import fs from 'node:fs';

fs.copyFileSync(new URL('../src/analyzers/python-parser.py', import.meta.url), new URL('../dist/src/analyzers/python-parser.py', import.meta.url));
