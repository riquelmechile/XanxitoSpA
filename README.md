# XanxitoSpA

**XanxitoSpA** es un harness empresarial genérico para formar, adoptar, operar y evolucionar empresas autónomas con una arquitectura simple, jerárquica, verificable y extensible por capacidades.

La empresa usa **GPT-5.6 Sol como único principal cognitivo**. Los demás modelos, APIs, MCPs, CLIs y servicios externos son herramientas especializadas, nunca autoridades ni “empleados” independientes.

## Ideas centrales

- Executive + supervisores estables + workers dinámicos.
- `Business Preflight` recursivo y Mission Graph finito.
- `COMPETE`: workers GPT resuelven la misma tarea en paralelo, primero ciegos y con estrategias distintas; después crítica acotada y adjudicación del owner.
- Memoria por Company/departamento y aprendizaje sólo desde outcomes verificados.
- `Corporate Genes` para versionar procesos, skills, estrategias, composiciones y routing; selección contextual por fitness multiobjetivo/Pareto.
- Company Lifecycle: Bootstrap, Operate, Improve, Grow, Expand, Recover y Exit.
- Progressive Autonomy por proceso/scope, con promoción y democión por evidencia.
- Constitución, autoridad y budgets por encima de cualquier optimización económica.
- MCP/API → CLI/SSH → browser como fallback.
- PostgreSQL como fuente autoritativa; providers y capabilities reemplazables.
- Heartbeat 24/7 con **cero wake/model work cuando no existe señal material**.

## Documentos

- [`docs/XANXITOSPA_ARQUITECTURA_INICIAL_2026.md`](docs/XANXITOSPA_ARQUITECTURA_INICIAL_2026.md) — arquitectura canónica v1.1.
- [`docs/RUNTIME_V1_ESTADO_2026-08-21.md`](docs/RUNTIME_V1_ESTADO_2026-08-21.md) — primer kernel ejecutable.
- [`docs/RUNTIME_V12_DURABLE_2026-08-21.md`](docs/RUNTIME_V12_DURABLE_2026-08-21.md) — capa durable PostgreSQL/scheduler/providers/bootstrap.
- [`docs/RUNTIME_V13_CAPABILITY_PLANE_2026-08-21.md`](docs/RUNTIME_V13_CAPABILITY_PLANE_2026-08-21.md) — secrets opacos, semantic capabilities, provider adapters y bootstrap executor.

## Estado

Fase actual: **runtime V1.3 Capability Plane en sandbox / provider-neutral**.

Ya existe código para:

- contratos de Company/Work/Delegation/Authority/Budget/Event/Outcome/Receipt/Gene;
- `Business Preflight` fail-closed;
- Mission Graph DAG con FAN-OUT/JOIN/COLLABORATE/CHALLENGE/DEBATE/COMPETE;
- `COMPETE` blind con strategy overlays y decision owner explícito;
- authority grants + BudgetEnvelope + eventos estructurados de deny/escalation;
- idempotencia concurrente y reserva-before-effect;
- settlement a BusinessOutcome/Receipt;
- Corporate Genes, negative-result lineage, Pareto y Progressive Autonomy guard;
- PostgreSQL adapter real mediante `pg`, migrations versionadas y transacciones tenant-scoped;
- Row Level Security forzado por `company_id` para datos tenant-owned;
- durable BusinessEvents, scheduler jobs, heartbeat cursors, leases y fencing tokens;
- durable idempotency journal;
- Company Assets y Provider Descriptors persistibles sin secretos resueltos;
- `HeartbeatEngine` determinístico: sleep sin wake cuando no hay materialidad;
- `ProviderRegistry`: hard filters → quality/cost/latency/balanced routing;
- `CompanyBootstrapPlanner`: reutiliza activos y coloca KYC/contratos/autoridad financiera como fronteras de aprobación;
- `SecretHandle` + `SecretResolver`: credenciales sólo dentro de callbacks scoped del provider adapter;
- `SemanticCapabilityRegistry` + catálogo universal de herramientas empresariales provider-neutral;
- `ProviderAdapterRegistry` + `CapabilityPlane`: routing, guards, idempotencia, fallback seguro y reconciliación;
- `BootstrapExecutor`: pause/resume por approval, plan fingerprint, provisioning y verify-before-active;
- `Control Catalog`: capabilities/providers/assets saneados sin credential refs ni metadata values privadas;
- Fastify `/health`, `/demo`, `/gym`, `/runtime/heartbeat/demo`, `/providers/route/demo`, `/bootstrap/demo`, `/capabilities/catalog/demo`, `/bootstrap/execution/demo`;
- Company Gym con 51 invariantes ejecutables.

### Verificación actual

```text
pnpm run typecheck  PASS
pnpm run test       PASS
pnpm run gym        51/51 PASS
pnpm run build      PASS
PostgreSQL 18 smoke PASS
```

El smoke PostgreSQL se ejecuta explícitamente con:

```text
pnpm run pg:smoke -- <postgres-test-url>
```

Por seguridad rechaza hosts no-loopback, salvo que un CI aislado habilite explícitamente `XSPA_ALLOW_REMOTE_PG_SMOKE=1`.

## Lo que todavía NO hace

V1.3 **no es producción-ready** y deliberadamente todavía no contiene:

- credenciales o secretos reales;
- Google Workspace/Twilio/Stripe/creative providers conectados;
- secret manager real detrás de `SecretResolver`;
- Control Plane Web/PWA completo;
- MCP productivo propio de XanxitoSpA;
- scheduler daemon residente conectado a una Company real;
- acciones financieras/productivas reales.

La siguiente capa debe conectar adapters reales/MCP y SecretResolver real sin romper el Gym ni mover política empresarial fuera del kernel.
