import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function tsFiles(root: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) out.push(...tsFiles(path));
    else if (entry.isFile() && path.endsWith(".ts")) out.push(path);
  }
  return out;
}

describe("canonical MCP model law", () => {
  it("keeps model-provider API credentials and network clients out of canonical runtime source", () => {
    const roots = [
      join(process.cwd(), "apps", "mcp"),
      join(process.cwd(), "packages", "contracts"),
      join(process.cwd(), "packages", "domain"),
      join(process.cwd(), "packages", "kernel"),
      join(process.cwd(), "packages", "providers"),
      join(process.cwd(), "scripts"),
    ];
    const files = roots.flatMap(tsFiles);
    const forbidden = [
      /OPENAI_API_KEY/,
      /api\.openai\.com/,
      /openai-responses(?:-runtime)?\.js/,
      /openai-image-renderer\.js/,
      /openai-character-runtime\.js/,
      /from\s+["\']openai["\']/,
    ];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const pattern of forbidden) expect(source, `${file} violates MCP-only model law: ${pattern}`).not.toMatch(pattern);
    }
  });
});
