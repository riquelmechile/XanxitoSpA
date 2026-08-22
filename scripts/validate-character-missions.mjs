import { readFile } from "node:fs/promises";

const dna = JSON.parse(await readFile("assets/characters/character-dna.json", "utf8"));
const manifest = JSON.parse(await readFile("assets/characters/character-missions.json", "utf8"));
const fail = (message) => { throw new Error(`character-art validation failed: ${message}`); };

if (dna.schemaVersion !== 2) fail("Character DNA must be schema v2");
if (!Array.isArray(dna.characters) || dna.characters.length !== 8) fail("expected eight Character DNA records");
if (!Array.isArray(manifest.missions) || manifest.missions.length !== 8) fail("expected eight character missions");
if (manifest.execution?.principal !== "gpt-5.6-sol" || manifest.execution?.branchReasoning !== "xhigh") fail("character missions violate One Model Law");
if (manifest.execution?.candidateCount !== 2 || manifest.execution?.requiredSuccessfulCandidates !== 2) fail("character COMPETE must use two successful blind candidates");
if (manifest.execution?.chatMode !== "decision-only") fail("character candidates must stay out of chat");
if (manifest.execution?.renderer !== "responses-image-generation") fail("character renderer must remain native Responses image generation");

const dnaIds = new Set();
const silhouettes = new Set();
const props = new Set();
for (const character of dna.characters) {
  if (!character.id || dnaIds.has(character.id)) fail(`duplicate/missing character id:${character.id}`);
  dnaIds.add(character.id);
  if (!character.identityAnchor?.trim()) fail(`missing identity anchor:${character.id}`);
  if (!Array.isArray(character.directions) || character.directions.length !== 2) fail(`expected two directions:${character.id}`);
  if (new Set(character.directions.map((direction) => direction.id)).size !== 2) fail(`duplicate direction:${character.id}`);
  const silhouette = String(character.silhouette ?? "").trim().toLowerCase();
  const prop = String(character.prop ?? "").trim().toLowerCase();
  if (!silhouette || silhouettes.has(silhouette)) fail(`duplicate/missing silhouette:${character.id}`);
  if (!prop || props.has(prop)) fail(`duplicate/missing prop:${character.id}`);
  silhouettes.add(silhouette); props.add(prop);
  const prompt = String(character.prompt ?? "").toLowerCase();
  for (const required of ["4:5", "no text", "no logos", "original"]) if (!prompt.includes(required)) fail(`prompt missing '${required}':${character.id}`);
}

const destinations = new Set();
for (const mission of manifest.missions) {
  if (!dnaIds.has(mission.characterId)) fail(`mission has unknown character:${mission.characterId}`);
  if (!Array.isArray(mission.directions) || mission.directions.length !== 2) fail(`mission must have two directions:${mission.characterId}`);
  if (!String(mission.basePrompt ?? "").includes("premium") && !String(mission.basePrompt ?? "").includes("Premium")) fail(`mission base prompt lacks quality bar:${mission.characterId}`);
  const destination = mission.output?.selectedDestination;
  if (typeof destination !== "string" || !destination.startsWith("assets/characters/final/") || !destination.endsWith(".png")) fail(`invalid selected destination:${mission.characterId}`);
  if (destinations.has(destination)) fail(`duplicate selected destination:${destination}`);
  destinations.add(destination);
}

const serialized = JSON.stringify(manifest).toLowerCase();
for (const forbidden of ["gemini", "runway", "grok", "midjourney", "stable diffusion"]) if (serialized.includes(forbidden)) fail(`secondary creative model/provider leaked into mission pack:${forbidden}`);

console.log("PASS character art: 8 unique archetypes · 16 blind candidate directions · GPT-only background renderer · decision-only chat surface");
