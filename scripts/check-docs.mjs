import fs from 'node:fs';
import path from 'node:path';

const files = fs.readdirSync('.').filter(p => p.endsWith('.md'));
function collect(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) collect(p);
    else if (p.endsWith('.md')) files.push(p);
  }
}
collect('docs');
const errors = [];
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  for (const match of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const target = match[1].split('#')[0];
    if (!target || /^[a-z]+:/i.test(target)) continue;
    if (!fs.existsSync(path.resolve(path.dirname(file), decodeURIComponent(target)))) errors.push(`${file}: missing ${target}`);
  }
}
if (errors.length) { process.stderr.write(errors.join('\n') + '\n'); process.exitCode = 1; }
else process.stdout.write(`Checked local links in ${files.length} Markdown documents.\n`);
