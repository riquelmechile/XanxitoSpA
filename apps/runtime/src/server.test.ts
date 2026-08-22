import { describe, expect, it } from "vitest";
import { buildServer } from "./server.js";

describe("runtime control API", () => {
  it("serves health, gym and demo without external providers", async () => {
    const app = buildServer();
    const health = await app.inject({ method: "GET", url: "/health" });
    expect(health.statusCode).toBe(200);
    expect(health.json().ok).toBe(true);

    const gym = await app.inject({ method: "GET", url: "/gym" });
    expect(gym.statusCode).toBe(200);
    expect(gym.json().ok).toBe(true);

    const demo = await app.inject({ method: "GET", url: "/demo" });
    expect(demo.statusCode).toBe(200);
    expect(demo.json().preflight.route).toBe("compete");
    expect(demo.json().competition.candidates).toHaveLength(2);
    await app.close();
  });
});
