import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { SaxesParser } from 'saxes';

const root = process.cwd();
const dirs = [path.join(root, 'assets', 'brand'), path.join(root, 'assets', 'diagrams')];
const forbidden = [/<image\b/i, /data:image/i, /<script\b/i, /on[a-z]+\s*=/i, /javascript:/i, /<foreignObject\b/i];
const bareAmpersand = /&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/;
const errors = [];
let count = 0;

function assertWellFormedXml(svg, name) {
  if (bareAmpersand.test(svg)) errors.push(`${name}: bare ampersand / invalid XML entity`);
  try {
    const parser = new SaxesParser({ xmlns: true });
    parser.write(svg).close();
  } catch (error) {
    errors.push(`${name}: malformed XML: ${error instanceof Error ? error.message : String(error)}`);
  }
}

for (const dir of dirs) {
  for (const name of await readdir(dir)) {
    if (!name.endsWith('.svg')) continue;
    count += 1;
    const file = path.join(dir, name);
    const svg = await readFile(file, 'utf8');
    assertWellFormedXml(svg, name);
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

const dnaPath = path.join(root, 'assets', 'characters', 'character-dna.json');
try {
  const dna = JSON.parse(await readFile(dnaPath, 'utf8'));
  const chars = Array.isArray(dna.characters) ? dna.characters : [];
  if (chars.length !== 8) errors.push(`character-dna.json: expected 8 characters, found ${chars.length}`);
  const ids = chars.map((c) => c.id);
  if (new Set(ids).size !== ids.length) errors.push('character-dna.json: duplicate character id');
  for (const c of chars) {
    for (const field of ['id','function','archetype','silhouette','pose','face','prop','environment','composition','prompt']) {
      if (!c?.[field] || String(c[field]).trim().length < 4) errors.push(`character-dna.json: ${c?.id ?? 'unknown'} missing ${field}`);
    }
  }
} catch (error) { errors.push(`character-dna.json invalid: ${error instanceof Error ? error.message : String(error)}`); }

const rasterRequired = [
  'assets/brand/hero-real.jpg',
  'assets/brand/hero-real-mobile.jpg',
  'assets/brand/company-deck-real.jpg',
  'assets/brand/company-deck-real-mobile.jpg',
  ...['executive','commercial','finance','operations','customer','risk','data','creative'].map((id) => `assets/characters/roster-v1/card-${id}.jpg`),
];
for (const rel of rasterRequired) {
  try {
    const file = path.join(root, rel);
    const data = await readFile(file);
    if (data.length < 10_000) errors.push(`${rel}: raster asset suspiciously small`);
    if (!(data[0] === 0xff && data[1] === 0xd8 && data[data.length - 2] === 0xff && data[data.length - 1] === 0xd9)) errors.push(`${rel}: expected complete JPEG`);
  } catch { errors.push(`${rel}: required raster asset missing`); }
}

try {
  const roster = JSON.parse(await readFile(path.join(root, 'assets', 'characters', 'roster-v1', 'manifest.json'), 'utf8'));
  const roles = Array.isArray(roster.roles) ? roster.roles : [];
  if (roles.length !== 8) errors.push(`roster-v1 manifest: expected 8 roles, found ${roles.length}`);
  const ids = roles.map((role) => role.id);
  if (new Set(ids).size !== ids.length) errors.push('roster-v1 manifest: duplicate role id');
  for (const role of roles) {
    if (!role?.portrait || !role?.card) errors.push(`roster-v1 manifest: ${role?.id ?? 'unknown'} missing portrait/card ref`);
    for (const rel of [role?.portrait, role?.card].filter(Boolean)) {
      try { await stat(path.join(root, rel)); } catch { errors.push(`roster-v1 manifest: missing referenced asset ${rel}`); }
    }
  }
} catch (error) { errors.push(`roster-v1 manifest invalid: ${error instanceof Error ? error.message : String(error)}`); }

const readme = await readFile(path.join(root, 'README.md'), 'utf8');
const rawUrls = [...new Set(
  [...readme.matchAll(/https:\/\/raw\.githubusercontent\.com\/riquelmechile\/XanxitoSpA\/main\/([^"')\s,]+)/g)].map((m) => m[1]),
)];
for (const rel of rawUrls) {
  try { await stat(path.join(root, rel)); }
  catch { errors.push(`README raw URL does not map to local file: ${rel}`); }
}
if (rawUrls.length < 9) errors.push(`README has only ${rawUrls.length} raw visual URLs; expected responsive visual coverage`);

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`PASS visual assets: ${count} SVGs valid; ${rasterRequired.length} required raster assets valid; 8-role raster manifest valid; ${rawUrls.length} README raw URLs resolve locally`);
