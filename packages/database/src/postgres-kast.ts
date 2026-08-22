import { randomUUID } from "node:crypto";
import type { QueryResultRow } from "pg";
import type { KASTEntry, SessionCloseReceipt } from "../../contracts/src/index.js";
import type { KastStore } from "./kast-store.js";
import type { PostgresDatabase } from "./postgres.js";

function jsonArray(value: unknown): string[] { return Array.isArray(value) ? value.map(String) : []; }

export class PostgresKastStore implements KastStore {
  constructor(private readonly db: PostgresDatabase) {}

  async saveSessionClose(receipt: SessionCloseReceipt): Promise<void> {
    await this.db.withCompanyTransaction(receipt.companyId, async (client) => {
      await client.query(
        `INSERT INTO xspa.session_close_receipts(
          id,company_id,session_ref,closed_at,status,business_memory_candidates,engram_candidates,artifact_refs,trace_refs,kast_entry_ids,unresolved_work_refs,next_session_hints,contains_raw_secrets,contains_raw_conversation
        ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb,false,false)
        ON CONFLICT (company_id,session_ref) DO NOTHING`,
        [receipt.id, receipt.companyId, receipt.sessionRef, receipt.closedAt, receipt.status,
          JSON.stringify(receipt.businessMemoryCandidates), JSON.stringify(receipt.engramCandidates), JSON.stringify(receipt.artifactRefs),
          JSON.stringify(receipt.traceRefs), JSON.stringify(receipt.kastEntryIds), JSON.stringify(receipt.unresolvedWorkRefs), JSON.stringify(receipt.nextSessionHints)],
      );
    });
  }

  async getSessionClose(companyId: string, sessionRef: string): Promise<SessionCloseReceipt | null> {
    return this.db.withCompanyTransaction(companyId, async (client) => {
      const result = await client.query<QueryResultRow>("SELECT * FROM xspa.session_close_receipts WHERE company_id=$1 AND session_ref=$2", [companyId, sessionRef]);
      return result.rows[0] ? sessionFromRow(result.rows[0]) : null;
    });
  }

  async upsertEntry(entry: KASTEntry): Promise<void> {
    await this.db.withCompanyTransaction(entry.companyId, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`kast:${entry.companyId}:${entry.fingerprint}`]);
      const currentResult = await client.query<QueryResultRow>(
        "SELECT * FROM xspa.kast_entries WHERE company_id=$1 AND fingerprint=$2 FOR UPDATE",
        [entry.companyId, entry.fingerprint],
      );
      const current = currentResult.rows[0] ? entryFromRow(currentResult.rows[0]) : null;
      const persisted = current ? mergeEntries(current, entry) : entry;
      await client.query(
        `INSERT INTO xspa.kast_entries(
          id,company_id,fingerprint,category,severity,title,summary,reproduction,affected_paths,affected_capabilities,evidence_refs,session_refs,recommendation,verification_plan,occurrence_count,first_seen_at,last_seen_at,status,improvement_work_id,regression_guard_refs,verification_evidence_refs
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb,$13,$14::jsonb,$15,$16,$17,$18,$19,$20::jsonb,$21::jsonb)
        ON CONFLICT (company_id,fingerprint) DO UPDATE SET
          severity=EXCLUDED.severity,title=EXCLUDED.title,summary=EXCLUDED.summary,reproduction=EXCLUDED.reproduction,
          affected_paths=EXCLUDED.affected_paths,affected_capabilities=EXCLUDED.affected_capabilities,evidence_refs=EXCLUDED.evidence_refs,
          session_refs=EXCLUDED.session_refs,recommendation=EXCLUDED.recommendation,verification_plan=EXCLUDED.verification_plan,
          occurrence_count=EXCLUDED.occurrence_count,last_seen_at=EXCLUDED.last_seen_at,status=EXCLUDED.status,
          improvement_work_id=EXCLUDED.improvement_work_id,regression_guard_refs=EXCLUDED.regression_guard_refs,verification_evidence_refs=EXCLUDED.verification_evidence_refs`,
        [persisted.id, persisted.companyId, persisted.fingerprint, persisted.category, persisted.severity, persisted.title, persisted.summary,
          JSON.stringify(persisted.reproduction), JSON.stringify(persisted.affectedPaths), JSON.stringify(persisted.affectedCapabilities), JSON.stringify(persisted.evidenceRefs),
          JSON.stringify(persisted.sessionRefs), persisted.recommendation, JSON.stringify(persisted.verificationPlan), persisted.occurrenceCount,
          persisted.firstSeenAt, persisted.lastSeenAt, persisted.status, persisted.improvementWorkId ?? null,
          JSON.stringify(persisted.regressionGuardRefs), JSON.stringify(persisted.verificationEvidenceRefs)],
      );
      for (const sessionRef of entry.sessionRefs) {
        await client.query(
          `INSERT INTO xspa.kast_occurrences(id,company_id,kast_entry_id,session_ref,observed_at,evidence_refs)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb)
           ON CONFLICT (company_id,kast_entry_id,session_ref) DO NOTHING`,
          [randomUUID(), persisted.companyId, persisted.id, sessionRef, entry.lastSeenAt, JSON.stringify(entry.evidenceRefs)],
        );
      }
    });
  }

  async getByFingerprint(companyId: string, fingerprint: string): Promise<KASTEntry | null> {
    return this.db.withCompanyTransaction(companyId, async (client) => {
      const result = await client.query<QueryResultRow>("SELECT * FROM xspa.kast_entries WHERE company_id=$1 AND fingerprint=$2", [companyId, fingerprint]);
      return result.rows[0] ? entryFromRow(result.rows[0]) : null;
    });
  }

  async listEntries(companyId: string): Promise<KASTEntry[]> {
    return this.db.withCompanyTransaction(companyId, async (client) => {
      const result = await client.query<QueryResultRow>("SELECT * FROM xspa.kast_entries WHERE company_id=$1 ORDER BY last_seen_at DESC,id", [companyId]);
      return result.rows.map(entryFromRow);
    });
  }
}

function union(values: string[]): string[] { return [...new Set(values)].sort(); }
function severityValue(value: KASTEntry["severity"]): number { return { low: 0, medium: 1, high: 2, critical: 3 }[value]; }
function mergeEntries(current: KASTEntry, incoming: KASTEntry): KASTEntry {
  const sessionRefs = union([...current.sessionRefs, ...incoming.sessionRefs]);
  const status = current.status === "in-progress" || current.status === "accepted"
    ? current.status
    : current.status === "verified" && incoming.lastSeenAt > current.lastSeenAt ? "candidate" : incoming.status;
  const merged: KASTEntry = {
    ...current,
    severity: severityValue(incoming.severity) > severityValue(current.severity) ? incoming.severity : current.severity,
    summary: incoming.summary || current.summary,
    reproduction: union([...current.reproduction, ...incoming.reproduction]),
    affectedPaths: union([...current.affectedPaths, ...incoming.affectedPaths]),
    affectedCapabilities: union([...current.affectedCapabilities, ...incoming.affectedCapabilities]),
    evidenceRefs: union([...current.evidenceRefs, ...incoming.evidenceRefs]),
    sessionRefs, recommendation: incoming.recommendation || current.recommendation,
    verificationPlan: union([...current.verificationPlan, ...incoming.verificationPlan]),
    occurrenceCount: sessionRefs.length, firstSeenAt: current.firstSeenAt < incoming.firstSeenAt ? current.firstSeenAt : incoming.firstSeenAt,
    lastSeenAt: current.lastSeenAt > incoming.lastSeenAt ? current.lastSeenAt : incoming.lastSeenAt,
    status,
    regressionGuardRefs: union([...current.regressionGuardRefs, ...incoming.regressionGuardRefs]),
    verificationEvidenceRefs: union([...current.verificationEvidenceRefs, ...incoming.verificationEvidenceRefs]),
  };
  const improvementWorkId = current.improvementWorkId ?? incoming.improvementWorkId;
  if (improvementWorkId) merged.improvementWorkId = improvementWorkId;
  return merged;
}

function sessionFromRow(row: QueryResultRow): SessionCloseReceipt {
  return {
    id: String(row.id), companyId: String(row.company_id), sessionRef: String(row.session_ref), closedAt: new Date(row.closed_at).toISOString(),
    status: row.status as SessionCloseReceipt["status"], businessMemoryCandidates: jsonArray(row.business_memory_candidates),
    engramCandidates: Array.isArray(row.engram_candidates) ? row.engram_candidates as SessionCloseReceipt["engramCandidates"] : [],
    artifactRefs: jsonArray(row.artifact_refs), traceRefs: jsonArray(row.trace_refs), kastEntryIds: jsonArray(row.kast_entry_ids),
    unresolvedWorkRefs: jsonArray(row.unresolved_work_refs), nextSessionHints: jsonArray(row.next_session_hints),
    containsRawSecrets: false, containsRawConversation: false,
  };
}

function entryFromRow(row: QueryResultRow): KASTEntry {
  const entry: KASTEntry = {
    id: String(row.id), companyId: String(row.company_id), fingerprint: String(row.fingerprint), category: row.category as KASTEntry["category"],
    severity: row.severity as KASTEntry["severity"], title: String(row.title), summary: String(row.summary), reproduction: jsonArray(row.reproduction),
    affectedPaths: jsonArray(row.affected_paths), affectedCapabilities: jsonArray(row.affected_capabilities), evidenceRefs: jsonArray(row.evidence_refs),
    sessionRefs: jsonArray(row.session_refs), recommendation: String(row.recommendation), verificationPlan: jsonArray(row.verification_plan),
    occurrenceCount: Number(row.occurrence_count), firstSeenAt: new Date(row.first_seen_at).toISOString(), lastSeenAt: new Date(row.last_seen_at).toISOString(),
    status: row.status as KASTEntry["status"], regressionGuardRefs: jsonArray(row.regression_guard_refs), verificationEvidenceRefs: jsonArray(row.verification_evidence_refs),
  };
  if (row.improvement_work_id) entry.improvementWorkId = String(row.improvement_work_id);
  return entry;
}
