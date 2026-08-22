import { describe, it } from "vitest";
import { verifyStreamableMcpBridge } from "./mcp-streamable-smoke.js";

describe("MCP Streamable HTTP bridge", () => {
  it("discovers and calls a local MCP tool through the official SDK transport", async () => {
    await verifyStreamableMcpBridge();
  });
});
