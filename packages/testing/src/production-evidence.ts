import inspector from "node:inspector";

export interface ProductionBackedCaseResult {
  name: string;
  ok: boolean;
  detail: string;
}

const PRODUCTION_URL_FRAGMENTS = [
  "/packages/kernel/src/",
  "/packages/domain/src/",
  "/packages/database/src/",
  "/packages/providers/src/",
  "/packages/observability/src/",
  "/apps/mcp/src/",
  "/apps/runtime/src/",
] as const;

type InspectorSession = {
  post(method: string, params: Record<string, unknown>, callback: (error: Error | null, result?: unknown) => void): void;
};

function post<T>(session: inspector.Session, method: string, params: Record<string, unknown> = {}): Promise<T> {
  const raw = session as unknown as InspectorSession;
  return new Promise<T>((resolve, reject) => {
    raw.post(method, params, (error, result) => {
      if (error) reject(error);
      else resolve(result as T);
    });
  });
}

interface CoverageRange { count: number }
interface CoverageFunction { ranges?: CoverageRange[] }
interface ScriptCoverage { url?: string; functions?: CoverageFunction[] }
interface CoverageResult { result?: ScriptCoverage[] }

function isProductionUrl(url: string): boolean {
  return url.startsWith("file://") && PRODUCTION_URL_FRAGMENTS.some((fragment) => url.includes(fragment));
}

function hasExecutedProduction(coverage: CoverageResult): boolean {
  return (coverage.result ?? []).some((script) =>
    Boolean(script.url && isProductionUrl(script.url)) &&
    (script.functions ?? []).some((fn) => (fn.ranges ?? []).some((range) => range.count > 0)),
  );
}

export async function runProductionBackedCase(
  name: string,
  fn: () => void | Promise<void>,
): Promise<ProductionBackedCaseResult> {
  const session = new inspector.Session();
  let preciseCoverageStarted = false;
  try {
    session.connect();
    await post(session, "Profiler.enable");
    await post(session, "Profiler.startPreciseCoverage", { callCount: true, detailed: true });
    preciseCoverageStarted = true;
    await post<CoverageResult>(session, "Profiler.takePreciseCoverage");

    try {
      await fn();
    } catch (error) {
      return { name, ok: false, detail: error instanceof Error ? error.message : String(error) };
    }

    const coverage = await post<CoverageResult>(session, "Profiler.takePreciseCoverage");
    if (!hasExecutedProduction(coverage)) {
      return { name, ok: false, detail: "NO_PRODUCTION_EVIDENCE: case passed without executing production runtime code" };
    }
    return { name, ok: true, detail: "pass" };
  } catch (error) {
    return { name, ok: false, detail: `PRODUCTION_EVIDENCE_ERROR:${error instanceof Error ? error.message : String(error)}` };
  } finally {
    if (preciseCoverageStarted) {
      try { await post(session, "Profiler.stopPreciseCoverage"); } catch {}
    }
    try { await post(session, "Profiler.disable"); } catch {}
    try { session.disconnect(); } catch {}
  }
}
