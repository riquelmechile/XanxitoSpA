import { createServer, request as httpRequest } from "node:http";
import { describe, expect, it } from "vitest";
import type { XspaAppOperations } from "./server.js";
import { createXspaMcpExpressApp } from "./server.js";

async function getHealthStatus(app: ReturnType<typeof createXspaMcpExpressApp>, hostHeader: string): Promise<number> {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server did not bind TCP port");
  try {
    return await new Promise<number>((resolve, reject) => {
      const request = httpRequest({
        hostname: "127.0.0.1",
        port: address.port,
        path: "/health",
        method: "GET",
        headers: { host: hostHeader },
      }, (response) => {
        response.resume();
        response.on("end", () => resolve(response.statusCode ?? 0));
      });
      request.on("error", reject);
      request.end();
    });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

describe("XanxitoSpA MCP deployment host binding", () => {
  it("accepts Railway health checks when bound to 0.0.0.0", async () => {
    const operations = {} as XspaAppOperations;
    const app = createXspaMcpExpressApp({ operations, host: "0.0.0.0", allowedHosts: ["xanxitospa-production.up.railway.app"] });
    expect(await getHealthStatus(app, "xanxitospa-production.up.railway.app")).toBe(200);
    expect(await getHealthStatus(app, "attacker.invalid")).toBe(403);
  });
});
