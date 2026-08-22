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
- PostgreSQL como fuente autoritativa V1; providers y capabilities reemplazables.

## Documentos

- [`docs/XANXITOSPA_ARQUITECTURA_INICIAL_2026.md`](docs/XANXITOSPA_ARQUITECTURA_INICIAL_2026.md) — arquitectura canónica v1.1.
- [`docs/RUNTIME_V1_ESTADO_2026-08-21.md`](docs/RUNTIME_V1_ESTADO_2026-08-21.md) — implementación y evidencia del primer runtime.

## Estado

Fase actual: **runtime V1 inicial ejecutable / kernel probado en sandbox**.

Ya existe código para:

- contratos de Company/Work/Delegation/Authority/Budget/Event/Outcome/Receipt/Gene;
- `Business Preflight` validado fail-closed;
- Mission Graph DAG finito;
- FAN-OUT/JOIN/COLLABORATE y `COMPETE` blind;
- guards de authority + BudgetEnvelope;
- capability fake con idempotencia concurrente;
- settlement a BusinessOutcome/Receipt;
- Corporate Genes, negative-result lineage, Pareto y promotion guard;
- migration PostgreSQL V1 con ledger, mission runs, idempotency, outcomes y genes;
- Fastify `/health`, `/demo` y `/gym`;
- Company Gym con 20 invariantes ejecutables.

### Verificación actual

```text
pnpm run typecheck  PASS
pnpm run test       PASS
pnpm run gym        20/20 PASS
pnpm run build      PASS
```

El runtime **todavía no es producción-ready**: faltan el adapter PostgreSQL transaccional real, scheduler/leases persistentes, Provider/Capability integrations reales, SecretCapability, Control Plane completo y bootstrap de servicios externos. Esos componentes se conectarán después de preservar los invariantes del Gym.
