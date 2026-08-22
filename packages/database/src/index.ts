import type { BusinessEvent, BusinessOutcome, BusinessReceipt, CorporateGene, MissionGraph, Work } from "../../contracts/src/index.js";

export interface CompanyStore {
  saveWork(work: Work): Promise<void>;
  saveEvent(event: BusinessEvent): Promise<void>;
  saveGraph(graph: MissionGraph): Promise<void>;
  saveOutcome(outcome: BusinessOutcome): Promise<void>;
  saveReceipt(receipt: BusinessReceipt): Promise<void>;
  saveGene(gene: CorporateGene): Promise<void>;
  listGenes(companyId: string): Promise<CorporateGene[]>;
}

export class InMemoryCompanyStore implements CompanyStore {
  readonly works = new Map<string, Work>();
  readonly events = new Map<string, BusinessEvent>();
  readonly graphs = new Map<string, MissionGraph>();
  readonly outcomes = new Map<string, BusinessOutcome>();
  readonly receipts = new Map<string, BusinessReceipt>();
  readonly genes = new Map<string, CorporateGene>();

  async saveWork(work: Work): Promise<void> { this.works.set(`${work.companyId}:${work.id}`, structuredClone(work)); }
  async saveEvent(event: BusinessEvent): Promise<void> {
    const key = `${event.companyId}:${event.idempotencyKey}`;
    if (!this.events.has(key)) this.events.set(key, structuredClone(event));
  }
  async saveGraph(graph: MissionGraph): Promise<void> { this.graphs.set(`${graph.companyId}:${graph.id}:${graph.revision}`, structuredClone(graph)); }
  async saveOutcome(outcome: BusinessOutcome): Promise<void> { this.outcomes.set(`${outcome.companyId}:${outcome.id}`, structuredClone(outcome)); }
  async saveReceipt(receipt: BusinessReceipt): Promise<void> { this.receipts.set(`${receipt.companyId}:${receipt.id}`, structuredClone(receipt)); }
  async saveGene(gene: CorporateGene): Promise<void> { this.genes.set(`${gene.companyId}:${gene.id}:${gene.version}`, structuredClone(gene)); }
  async listGenes(companyId: string): Promise<CorporateGene[]> {
    return [...this.genes.values()].filter((gene) => gene.companyId === companyId).map((gene) => structuredClone(gene));
  }
}
