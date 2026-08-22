import { randomUUID } from "node:crypto";
import type { AuthorityGrant, CorporateGene, MissionGraph, PreflightPlan, Work } from "../../../packages/contracts/src/index.js";
import { InMemoryCompanyStore } from "../../../packages/database/src/index.js";
import { applyVerifiedOutcomeToGene, CapabilityRegistry, executeMissionGraph, makeNode, runCompete, settle, validatePreflight } from "../../../packages/kernel/src/index.js";

export async function runDemoVertical() {
  const companyId = randomUUID();
  const store = new InMemoryCompanyStore();
  const grant: AuthorityGrant = { id: randomUUID(), companyId, principal: "executive", actions: ["demo.read"], scopes: ["company"], validFrom: "2026-01-01T00:00:00.000Z", validUntil: "2027-01-01T00:00:00.000Z" };
  const preflight: PreflightPlan = validatePreflight(
    { companyId, goal: "Improve conversion without sacrificing margin", trigger: "kpi.degradation", requestingPrincipal: "founder", lifecycleMode: "improve", currentStateRef: "state:demo", availableAuthorityRef: grant.id, budgetRef: "budget:none" },
    { objective: "Choose a reversible commercial response", materiality: "high", risk: "low", owner: "commercial-supervisor", route: "compete", departments: ["commercial", "finance"], workUnits: ["analyze-demand", "analyze-margin", "compete-strategy"], dependencies: [["analyze-demand", "compete-strategy"], ["analyze-margin", "compete-strategy"]], parallelGroups: [["analyze-demand", "analyze-margin"]], requiredSkills: ["commercial-analysis", "financial-impact"], requiredCapabilities: [], authorityChecks: [], budgetLimits: { experiment: 0 }, evidenceRequired: ["demand", "margin"], successConditions: ["owner adjudication"], rollback: "no external effect in demo", terminalCondition: "verified outcome settled", escalationCondition: null, rationaleSummary: "Use blind competition because two valid strategies exist" },
    { grants: [grant], budgets: [] },
  );

  const work: Work = { id: randomUUID(), companyId, owner: "commercial-supervisor", objective: preflight.objective, scope: "demo", createdAt: new Date().toISOString() };
  await store.saveWork(work);

  const graph: MissionGraph = {
    id: randomUUID(), companyId, revision: 1,
    nodes: [
      makeNode("commercial", "work", "commercial-supervisor", "analyze demand"),
      makeNode("finance", "work", "finance-supervisor", "analyze margin"),
      makeNode("competition", "compete", "commercial-supervisor", "choose strategy", ["commercial", "finance"]),
      makeNode("verify", "verify", "admin-risk-supervisor", "verify decision", ["competition"]),
      makeNode("settle", "settle", "commercial-supervisor", "settle outcome", ["verify"]),
    ],
  };
  await store.saveGraph(graph);
  const outputs = new Map<string, unknown>();
  const context = { companyId, principal: "executive", grants: [grant], budgets: [], capabilities: new CapabilityRegistry(), outputs };
  await executeMissionGraph(graph, context, {
    work: async (node) => node.id === "commercial" ? { demandSignal: 0.72, evidence: "demo:demand" } : { marginFloor: 0.22, evidence: "demo:margin" },
    compete: async (_node, ctx) => runCompete({
      evidenceSnapshotRef: "demo:snapshot", evidenceSnapshot: { commercial: ctx.outputs.get("commercial"), finance: ctx.outputs.get("finance") }, owner: "commercial-supervisor",
      strategies: [
        { id: "margin-first", overlay: "protect-margin", run: async () => ({ output: { priceDelta: -0.02, expectedValue: 0.76 }, evidenceRefs: ["demo:a"], cost: 1 }) },
        { id: "growth-first", overlay: "capture-demand", run: async () => ({ output: { priceDelta: -0.04, expectedValue: 0.82 }, evidenceRefs: ["demo:b"], cost: 1 }) },
      ],
      crossCritic: async (self, opponent) => `${self.id} tests assumptions of ${opponent.id}`,
      adjudicator: async ({ candidates, owner }) => ({ winnerId: candidates.toSorted((a, b) => ((b.output as { expectedValue: number }).expectedValue - (a.output as { expectedValue: number }).expectedValue))[0]?.id ?? candidates[0]!.id, decisionOwner: owner, rationale: "highest bounded expected value under shared evidence" }),
    }),
    verify: async (_node, ctx) => ({ verified: true, competition: ctx.outputs.get("competition"), evidenceRefs: ["demo:verification"] }),
    settle: async (_node, ctx) => {
      const { outcome, receipt } = settle({ work, actor: "commercial-supervisor", authorityRefs: [grant.id], budgetRefs: [], verified: true, dimensions: { businessValue: 0.82, quality: 0.9 }, evidenceRefs: ["demo:verification"], cost: 2 });
      await store.saveOutcome(outcome); await store.saveReceipt(receipt);
      const gene: CorporateGene = { id: "pricing-recovery-growth-first", companyId, type: "strategy", version: 1, parents: [], contextSignature: "conversion-down-margin-safe", artifactRef: "strategy:growth-first", status: "candidate", fitness: { sampleSize: 0, confidence: 0, dimensions: {}, cost: 0, riskIncidents: 0 }, negativeResultRefs: [] };
      const evolved = applyVerifiedOutcomeToGene(gene, outcome, { minSamplesForChampion: 3 });
      await store.saveGene(evolved);
      return { outcome, receipt, gene: evolved, verification: ctx.outputs.get("verify") };
    },
  });

  return { companyId, preflight, graph: { id: graph.id, nodes: graph.nodes.map((n) => ({ id: n.id, kind: n.kind, dependsOn: n.dependsOn })) }, competition: outputs.get("competition"), settled: outputs.get("settle") };
}
