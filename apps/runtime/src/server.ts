import Fastify from "fastify";
import { runCompanyGym } from "../../../packages/testing/src/gym.js";
import { runDemoVertical } from "./demo.js";

export function buildServer() {
  const app = Fastify({ logger: false });
  app.get("/health", async () => ({ ok: true, service: "xanxitospa-runtime", version: "0.1.0" }));
  app.get("/gym", async (_request, reply) => {
    const result = await runCompanyGym();
    if (!result.ok) reply.code(500);
    return result;
  });
  app.get("/demo", async () => runDemoVertical());
  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = buildServer();
  const port = Number(process.env.XSPA_PORT ?? 3210);
  await app.listen({ host: "127.0.0.1", port });
  console.log(`XanxitoSpA runtime listening on http://127.0.0.1:${port}`);
}
