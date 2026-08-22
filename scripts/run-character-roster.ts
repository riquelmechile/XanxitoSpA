import { copyFile, mkdir, readFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PrincipalPolicy } from "../packages/contracts/src/index.js";
import { PostgresDatabase, PostgresRuntimeStore } from "../packages/database/src/postgres.js";
import { processCreativeMissionJob, submitCreativeMission } from "../packages/kernel/src/creative-pipeline.js";
import { EnvironmentOpenAIApiKeyPort, FileSystemImageArtifactSink, OpenAIResponsesImageRenderer } from "../packages/providers/src/openai-image-renderer.js";
import { OpenAICharacterAdjudicator, OpenAICharacterConceptWorker, OpenAICharacterEvaluator, FileSystemCreativeAssetReader } from "../packages/providers/src/openai-character-runtime.js";
import { OpenAIResponsesRuntimeClient } from "../packages/providers/src/openai-responses-runtime.js";

const manifest = JSON.parse(await readFile(path.resolve("assets/characters/character-missions.json"), "utf8")) as any;
const databaseUrl = process.env.XSPA_DATABASE_URL ?? process.env.DATABASE_URL;
const companyId = process.env.XSPA_CREATIVE_COMPANY_ID;
const execute = process.env.XSPA_CREATIVE_EXECUTE === "1";
const key = new EnvironmentOpenAIApiKeyPort();
const credentialReady = await key.isConfigured();
const assetRoot = path.resolve(process.env.XSPA_CREATIVE_ASSET_ROOT ?? ".xspa/creative-assets");

const readiness = {
  databaseConfigured: Boolean(databaseUrl),
  companyIdConfigured: Boolean(companyId),
  openaiRuntimeCredentialConfigured: credentialReady,
  execute,
  missionCount: manifest.missions?.length ?? 0,
  candidateRenders: (manifest.missions?.length ?? 0) * (manifest.execution?.candidateCount ?? 0),
  assetRoot,
};
console.log(JSON.stringify({ readiness }, null, 2));
if (!databaseUrl || !companyId || !credentialReady || !execute) {
  console.log("STAGED: character roster requires database + company id + OPENAI_API_KEY + XSPA_CREATIVE_EXECUTE=1; no chat fallback and no alternate model provider.");
  process.exit(2);
}

const policy: PrincipalPolicy = {
  role: "executive-principal", mode: "pinned", model: "gpt-5.6-sol", reasoningEffort: "max",
  subordinateModel: "gpt-5.6-sol", subordinateReasoningEffort: "xhigh", maxReservedForExecutive: true,
  allowSecondaryModelProviders: false, branchOrchestration: "xanxitospa-mission-graph", allowProviderManagedMultiAgent: false,
  allowModelFallback: false, capabilityProvidersReplaceable: true,
  creativePolicy: { providerFamily: "openai-only", imageGeneration: "responses-image-generation", videoGeneration: "staged-unavailable", allowLegacyVideo: false },
};

const db = new PostgresDatabase(databaseUrl);
try {
  await db.migrate();
  await db.ensureCompany(companyId, "XanxitoSpA Internal Creative", "character-roster-v2");
  const store = new PostgresRuntimeStore(db);
  const sink = new FileSystemImageArtifactSink(assetRoot);
  const renderer = new OpenAIResponsesImageRenderer({ apiKey: key, sink });
  const client = new OpenAIResponsesRuntimeClient({ apiKey: key });
  const reader = new FileSystemCreativeAssetReader(assetRoot);
  const adjudicator = new OpenAICharacterAdjudicator(client);
  const finalRoot = path.resolve("assets/characters/final");
  await mkdir(finalRoot, { recursive: true });

  const runOne = async (spec: any) => {
    const mission = {
      id: randomUUID(), companyId, workId: randomUUID(), supervisorPrincipal: "creative-supervisor",
      briefRef: spec.briefRef, evidenceSnapshotRef: spec.evidenceSnapshotRef,
      candidateCount: manifest.execution.candidateCount, requiredSuccessfulCandidates: manifest.execution.requiredSuccessfulCandidates,
      executiveEscalationRequired: false, createdAt: new Date().toISOString(),
    };
    await submitCreativeMission(store, mission, new Date());
    const conceptWorkers = spec.directions.map((direction: any) => new OpenAICharacterConceptWorker({
      client, characterId: spec.characterId, archetype: spec.archetype, basePrompt: spec.basePrompt, direction, styleLock: manifest.styleLock,
    }));
    const evaluators = [
      new OpenAICharacterEvaluator("structure", { client, reader, rubric: ["silhouette_readability", "role_readability", "anatomy_proportion", "pose_storytelling", "composition_crop"] }),
      new OpenAICharacterEvaluator("finish", { client, reader, rubric: ["face_expression", "materials", "lighting_depth", "roster_distinctiveness", "brand_consistency", "originality"] }),
    ];
    const result = await processCreativeMissionJob({
      mission, policy, store, conceptWorkers, renderer, evaluators, adjudicator,
      maxConceptConcurrency: 2, maxRenderConcurrency: 2, maxEvaluationConcurrency: 2,
      currency: "USD", grantRefs: [], jobOwner: `character-roster:${spec.characterId}`,
    });
    const selectedId = result.receipt.selectedAssetRefs[0];
    const assets = await store.listAssets(companyId);
    const selected = assets.find((asset) => asset.id === selectedId);
    const artifactRef = selected && typeof selected.metadata.artifactRef === "string" ? selected.metadata.artifactRef : "";
    if (!artifactRef.startsWith("file://")) throw new Error(`selected character asset is not file-backed:${spec.characterId}`);
    const destination = path.resolve(spec.output.selectedDestination);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(fileURLToPath(artifactRef), destination, fsConstants.COPYFILE_EXCL);
    console.log(JSON.stringify({ characterId: spec.characterId, status: "selected", destination, missionId: mission.id }));
  };

  const queue = [...manifest.missions];
  const workers = Array.from({ length: Math.min(2, queue.length) }, async () => {
    while (queue.length) {
      const spec = queue.shift();
      if (spec) await runOne(spec);
    }
  });
  await Promise.all(workers);
} finally {
  await db.close();
}
