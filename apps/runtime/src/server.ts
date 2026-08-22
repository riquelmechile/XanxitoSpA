import Fastify from "fastify";
import { runCompanyGym } from "../../../packages/testing/src/gym.js";
import { runBootstrapDemo, runHeartbeatDemo, runProviderRoutingDemo } from "./durable-demo.js";
import { runDemoVertical } from "./demo.js";
import { runBootstrapExecutionDemo, runCapabilityCatalogDemo } from "./capability-demo.js";

export function buildServer() {
  const app = Fastify({ logger: false });
  app.get("/health", async () => ({ ok: true, service: "xanxitospa-runtime", version: "1.0.0" }));
  app.get("/gym", async (_request, reply) => {
    const result = await runCompanyGym();
    if (!result.ok) reply.code(500);
    return result;
  });
  app.get("/demo", async () => runDemoVertical());
  app.get("/runtime/heartbeat/demo", async () => runHeartbeatDemo());
  app.get("/providers/route/demo", async () => runProviderRoutingDemo());
  app.get("/bootstrap/demo", async () => runBootstrapDemo());
  app.get("/capabilities/catalog/demo", async () => runCapabilityCatalogDemo());
  app.get("/bootstrap/execution/demo", async () => runBootstrapExecutionDemo());
  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = buildServer();
  const port = Number(process.env.XSPA_PORT ?? 3210);
  await app.listen({ host: "127.0.0.1", port });
  console.log(`XanxitoSpA runtime listening on http://127.0.0.1:${port}`);
}
