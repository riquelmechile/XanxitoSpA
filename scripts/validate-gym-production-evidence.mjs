import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const testingRoot = path.join(root, "packages", "testing", "src");

async function filesUnder(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await filesUnder(full));
    else if (entry.isFile() && entry.name.endsWith("gym.ts")) out.push(full);
  }
  return out;
}

function balancedBlock(source, openIndex) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let i = openIndex; i < source.length; i += 1) {
    const c = source[i];
    const n = source[i + 1];
    if (lineComment) { if (c === "\n") lineComment = false; continue; }
    if (blockComment) { if (c === "*" && n === "/") { blockComment = false; i += 1; } continue; }
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (c === "\\") { escaped = true; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === "/" && n === "/") { lineComment = true; i += 1; continue; }
    if (c === "/" && n === "*") { blockComment = true; i += 1; continue; }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === "{") depth += 1;
    else if (c === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(openIndex, i + 1);
    }
  }
  throw new Error("unbalanced callback block");
}

function productionValueImports(source, file) {
  const values = new Set();
  const importPattern = /import\s+(?!type\b)([\s\S]*?)\s+from\s+["']([^"']+)["'];/g;
  for (const match of source.matchAll(importPattern)) {
    const clause = match[1].trim();
    const spec = match[2];
    if (!spec.startsWith(".")) continue;
    const resolved = path.resolve(path.dirname(file), spec.replace(/\.js$/, ".ts"));
    if (resolved.startsWith(testingRoot + path.sep)) continue;
    const named = clause.match(/\{([\s\S]*?)\}/)?.[1] ?? "";
    for (const raw of named.split(",")) {
      const item = raw.trim();
      if (!item || item.startsWith("type ")) continue;
      const local = item.split(/\s+as\s+/).at(-1)?.trim();
      if (local) values.add(local);
    }
    const defaultName = clause.match(/^([A-Za-z_$][\w$]*)\s*(?:,|$)/)?.[1];
    if (defaultName) values.add(defaultName);
  }
  return values;
}

function hasProductionTouchpoint(text, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [
    new RegExp(`\\bnew\\s+${escaped}\\b`),
    new RegExp(`\\b${escaped}\\s*\\(`),
    new RegExp(`\\b${escaped}\\.[A-Za-z_$]`),
  ].some((pattern) => pattern.test(text));
}

function caseEvidenceFailures(source, file) {
  const failures = [];
  let checked = 0;
  const production = productionValueImports(source, file);
  const casePattern = /runCase\(\s*["']([^"']+)["']\s*,/g;
  for (const match of source.matchAll(casePattern)) {
    const after = match.index + match[0].length;
    const open = source.indexOf("{", after);
    if (open < 0) continue;
    const body = balancedBlock(source, open);
    checked += 1;
    if (![...production].some((name) => hasProductionTouchpoint(body, name))) failures.push(`${match[1]} [no-production-touchpoint]`);
    for (const literal of body.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*(true|false|-?\d+(?:\.\d+)?|"[^"]*"|'[^']*')\s*;/g)) {
      const variable = literal[1];
      const value = literal[2].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const escapedVariable = variable.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const sameLiteralAssertion = new RegExp(`\\bexpect\\(\\s*(?:${escapedVariable}\\s*===\\s*${value}|${value}\\s*===\\s*${escapedVariable})\\s*[,)]`);
      if (sameLiteralAssertion.test(body)) failures.push(`${match[1]} [literal-tautology:${variable}]`);
    }
  }
  return { failures, checked };
}

// The guard protects itself: a literal-only case must be detected while a production-touching case must pass.
const syntheticFile = path.join(testingRoot, "__meta-fixture-gym.ts");
const syntheticSource = `
import { HeartbeatEngine } from "../../kernel/src/index.js";
runCase("literal-only", () => { const material = false; if (material) throw new Error(); });
runCase("production-plus-tautology", () => { new HeartbeatEngine(null, null, null); const configuredMaxRounds = 2; expect(configuredMaxRounds === 2, "bad"); });
runCase("production-touch", () => { new HeartbeatEngine(null, null, null); });
`;
const synthetic = caseEvidenceFailures(syntheticSource, syntheticFile);
if (synthetic.checked !== 3 || synthetic.failures.length !== 2 || !synthetic.failures.some((x) => x.startsWith("literal-only [no-production-touchpoint]")) || !synthetic.failures.some((x) => x.startsWith("production-plus-tautology [literal-tautology:"))) {
  console.error("Gym production-evidence meta guard self-test failed");
  process.exit(1);
}

const failures = [];
let checked = 0;
for (const file of await filesUnder(testingRoot)) {
  const source = await readFile(file, "utf8");
  const result = caseEvidenceFailures(source, file);
  checked += result.checked;
  const rel = path.relative(root, file);
  failures.push(...result.failures.map((name) => `${rel}: ${name}`));
}

if (failures.length) {
  console.error("Gym cases with no direct production runtime touchpoint:\n" + failures.map((x) => `- ${x}`).join("\n"));
  process.exit(1);
}
console.log(`PASS Gym production-evidence meta guard: self-test + ${checked} runCase callbacks invoke/instantiate production runtime values`);
