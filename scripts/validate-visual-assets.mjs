import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const dirs = [path.join(root, 'assets', 'brand'), path.join(root, 'assets', 'diagrams')];
const forbidden = [/<image\b/i, /data:image/i, /<script\b/i, /on[a-z]+\s*=/i, /javascript:/i, /<foreignObject\b/i];
const errors = [];
let count = 0;

for (const dir of dirs) {
  for (const name of await readdir(dir)) {
    if (!name.endsWith('.svg')) continue;
    count += 1;
    const file = path.join(dir, name);
    const svg = await readFile(file, 'utf8');
    if (!/<svg\b[^>]*viewBox=/i.test(svg)) errors.push(`${name}: missing viewBox`);
    if (!/<svg\b[^>]*role="img"/i.test(svg)) errors.push(`${name}: missing role=img`);
    if (!/<svg\b[^>]*aria-labelledby=/i.test(svg)) errors.push(`${name}: missing aria-labelledby`);
    if (!/<title\b[^>]*>[^<]+<\/title>/i.test(svg)) errors.push(`${name}: missing title`);
    if (!/<desc\b[^>]*>[^<]+<\/desc>/i.test(svg)) errors.push(`${name}: missing desc`);
    for (const pattern of forbidden) if (pattern.test(svg)) errors.push(`${name}: forbidden pattern ${pattern}`);
    const ids = [...svg.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
    if (new Set(ids).size !== ids.length) errors.push(`${name}: duplicate id`);
    if ((await stat(file)).size < 500) errors.push(`${name}: suspiciously small`);
  }
}

const readme = await readFile(path.join(root, 'README.md'), 'utf8');
const rawUrls = [...readme.matchAll(/https:\/\/raw\.githubusercontent\.com\/riquelmechile\/XanxitoSpA\/main\/([^"')\s]+)/g)].map((m) => m[1]);
for (const rel of rawUrls) {
  try { await stat(path.join(root, rel)); }
  catch { errors.push(`README raw URL does not map to local file: ${rel}`); }
}
if (rawUrls.length < 10) errors.push(`README has only ${rawUrls.length} raw visual URLs; expected visual deck coverage`);

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`PASS visual assets: ${count} SVGs validated; ${rawUrls.length} README raw URLs resolve locally`);
