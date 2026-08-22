import { readFile } from "node:fs/promises";
import path from "node:path";

const manifestPath = path.resolve(process.cwd(), "assets/characters/character-missions.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const result = {
  openaiRuntimeCredentialConfigured: Boolean(process.env.OPENAI_API_KEY?.trim()),
  assetRoot: process.env.XSPA_CREATIVE_ASSET_ROOT ?? ".xspa/creative-assets",
  missionCount: Array.isArray(manifest.missions) ? manifest.missions.length : 0,
  candidateCountPerMission: manifest.execution?.candidateCount ?? null,
  expectedCandidateRenders: (Array.isArray(manifest.missions) ? manifest.missions.length : 0) * Number(manifest.execution?.candidateCount ?? 0),
  chatMode: manifest.execution?.chatMode ?? null,
  renderer: manifest.execution?.renderer ?? null,
  model: manifest.execution?.principal ?? null,
};
console.log(JSON.stringify(result, null, 2));
process.exit(result.openaiRuntimeCredentialConfigured ? 0 : 2);
