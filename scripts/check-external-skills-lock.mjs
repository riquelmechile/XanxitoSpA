import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const path = new URL('../config/skills-library.lock.json', import.meta.url);
const manifest = JSON.parse(readFileSync(path, 'utf8'));
const expected = [
  'mcp-a2a-expert', 'webhook-agent-wake', 'railway', 'cloudflare',
  'github-webhooks', 'gmail-push', 'cachyos', 'dev-stack',
].sort();
assert.equal(manifest.schemaVersion, 1);
assert.equal(manifest.repository, 'riquelmechile/skills-library');
assert.match(manifest.commit, /^[0-9a-f]{40}$/);
assert.equal(manifest.visibility, 'private');
assert.equal(manifest.execution, 'instructions-only');
assert.equal(manifest.scope, 'development-and-operations');
assert.equal(manifest.automaticCompanyInstall, false);
assert.equal(manifest.modelProviderApisAllowed, false);
assert.ok(Array.isArray(manifest.skills));
assert.deepEqual(manifest.skills.map((skill) => skill.name).sort(), expected, 'expected eight development skills');
for (const skill of manifest.skills) {
  assert.equal(skill.path, `skills/${skill.name}/SKILL.md`);
  assert.ok(Array.isArray(skill.uses) && skill.uses.length, `missing uses for ${skill.name}`);
  assert.ok(skill.uses.every((value) => typeof value === 'string' && /^[a-z][a-z0-9-]*$/.test(value)), `invalid uses for ${skill.name}`);
  assert.deepEqual(Object.keys(skill).sort(), ['name', 'path', 'uses']);
}
assert.deepEqual(Object.keys(manifest).sort(), [
  'automaticCompanyInstall', 'commit', 'execution', 'modelProviderApisAllowed',
  'repository', 'schemaVersion', 'scope', 'skills', 'visibility',
].sort());
console.log(`PASS external skills contract: ${manifest.skills.length} pinned development skills; no automatic Company install`);
