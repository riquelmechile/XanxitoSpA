// Declarative Railway configuration for XanxitoSpA.
// Do not apply until OAuth owner enrollment, backup restore and branch review pass.
// This describes the existing staging service and managed PostgreSQL.
// All secrets and OAuth signing material remain in Railway variables, NEVER here.
import { defineRailway, github, postgres, project, service } from "railway/iac";

export default defineRailway((ctx) => {
  const production = ctx.isEnvironment("production");
  const database = postgres("Postgres");
  const app = service("xspa-mcp", {
    source: github("riquelmechile/XanxitoSpA", {
      branch: production ? "main" : "feat/skills-first-production-20261008",
    }),
    build: "pnpm install --frozen-lockfile && pnpm run build",
    start: "pnpm run mcp:app:start",
    healthcheck: "/health",
    healthcheckTimeout: 180,
    replicas: 1,
    env: {
      NODE_ENV: "production",
      XSPA_DATABASE_URL: database.env.DATABASE_URL,
    },
  });
  return project("xanxitospa", { resources: [database, app] });
});
