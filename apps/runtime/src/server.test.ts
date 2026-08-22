import { describe, expect, it } from "vitest";
import { buildServer } from "./server.js";

describe("runtime control API", () => {
  it("serves kernel and durable demos without external providers", async () => {
    const app = buildServer();
    const health = await app.inject({ method: "GET", url: "/health" });
    expect(health.statusCode).toBe(200);
    expect(health.json().ok).toBe(true);
    expect(health.json().version).toBe("1.0.0");

    const gym = await app.inject({ method: "GET", url: "/gym" });
    expect(gym.statusCode).toBe(200);
    expect(gym.json().ok).toBe(true);
    expect(gym.json().passed).toBeGreaterThanOrEqual(38);

    const demo = await app.inject({ method: "GET", url: "/demo" });
    expect(demo.statusCode).toBe(200);
    expect(demo.json().preflight.route).toBe("compete");
    expect(demo.json().competition.candidates).toHaveLength(2);

    const heartbeat = await app.inject({ method: "GET", url: "/runtime/heartbeat/demo" });
    expect(heartbeat.statusCode).toBe(200);
    expect(heartbeat.json().first.state).toBe("wake");
    expect(heartbeat.json().second.state).toBe("sleep");

    const provider = await app.inject({ method: "GET", url: "/providers/route/demo" });
    expect(provider.statusCode).toBe(200);
    expect(provider.json().eligibleProviderIds.length).toBeGreaterThanOrEqual(1);

    const bootstrap = await app.inject({ method: "GET", url: "/bootstrap/demo" });
    expect(bootstrap.statusCode).toBe(200);
    expect(bootstrap.json().approvalBoundaries).toHaveLength(1);
    expect(bootstrap.json().reusedAssetIds).toHaveLength(1);

    const catalog = await app.inject({ method: "GET", url: "/capabilities/catalog/demo" });
    expect(catalog.statusCode).toBe(200);
    expect(catalog.json().capabilities.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(catalog.json())).not.toContain("secret://");

    const execution = await app.inject({ method: "GET", url: "/bootstrap/execution/demo" });
    expect(execution.statusCode).toBe(200);
    expect(execution.json().paused.completed).toBe(false);
    expect(execution.json().completed.completed).toBe(true);
    expect(execution.json().catalog.assets[0].status).toBe("active");
    await app.close();
  });
});
