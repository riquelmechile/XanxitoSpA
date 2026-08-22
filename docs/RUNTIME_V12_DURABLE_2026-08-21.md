# XanxitoSpA Runtime V1.2 — Durable Runtime

**Fecha:** 21 de agosto de 2026  
**Estado:** implementación local verificada / review approved  
**Base:** commit `a72095d` (`feat(runtime): establish xanxitospa v1 kernel`)

## 1. Objetivo del incremento

Convertir el kernel V1 probado en sandbox en una base durable capaz de coordinar una Company real sin introducir infraestructura prematura ni providers externos.

El incremento conserva estas leyes:

- GPT-5.6 Sol es el único principal cognitivo;
- PostgreSQL es la fuente autoritativa V1;
- Work no concede autoridad;
- deny-by-default;
- no LLM/model work cuando no existe señal material;
- providers son capabilities intercambiables;
- assets pertenecen a Company;
- secretos no aparecen en DB, prompts ni código;
- browser sigue siendo fallback, no dependencia del runtime.

## 2. Persistencia PostgreSQL real

Se agregó `pg` como única dependencia runtime nueva.

`PostgresDatabase` implementa:

- pool/lifecycle;
- migration runner versionado;
- `withCompanyTransaction(companyId, fn)`;
- `set_config('xspa.company_id', ..., true)` transaction-local;
- rollback ante excepción;
- bootstrap/upsert de Company dentro de scope tenant.

`PostgresCompanyStore` persiste:

- Work;
- BusinessEvent;
- MissionGraph;
- BusinessOutcome;
- BusinessReceipt;
- CorporateGene.

`PostgresRuntimeStore` persiste/coordina:

- heartbeat cursors;
- heartbeat leases;
- scheduler jobs;
- job leases/fencing;
- durable idempotency journal;
- Company Assets;
- Provider Descriptors.

## 3. Migration `0002_durable_runtime.sql`

Agrega:

```text
scheduler_jobs
heartbeat_cursors
heartbeat_leases
company_assets
provider_descriptors
```

y amplía `idempotency_journal` con owner/fencing/error.

Row Level Security queda habilitado y forzado para las tablas tenant-owned. El runtime debe establecer `xspa.company_id` dentro de cada transacción antes de leer/escribir.

No se guardan valores de secretos: `credentials_ref` es sólo un handle opaco hacia un futuro `SecretCapability`.

## 4. Heartbeat y scheduler

`HeartbeatEngine` usa un `MaterialityPolicy` determinístico.

Flujo:

```text
tick
→ claim heartbeat lease
→ leer cursor
→ leer eventos posteriores + jobs vencidos
→ materiality gate determinístico
→ nada material: advance cursor + sleep + cero wake
→ material: wake callback una vez dentro del fenced lease
→ advance cursor
→ release lease
```

El clock del tick se mantiene coherente durante todo el ciclo para que scheduler y pruebas sean deterministas.

### Fencing

Cada nuevo claim incrementa un `fencing_token` monotónico. Un holder viejo no puede hacer settle/release después de que otro worker obtuvo un token superior.

Esto aplica tanto a heartbeat como a jobs.

## 5. Idempotencia durable

Estado V1.2:

```text
intent
→ applied | failed | unknown
→ reconciled
```

El primer claimant obtiene ownership + fencing token. Un duplicate concurrente obtiene el record existente y no gana ownership.

El kernel todavía conserva su idempotencia in-memory para fake capabilities; la capa PostgreSQL proporciona la primitiva durable que usarán providers con efectos reales.

## 6. Provider Registry

Los providers declaran metadata, nunca autoridad:

```text
capabilities
regions
input/output formats
estimated cost
latency p50/p95
reliability
quality
privacy score
max sensitivity
health
credentialsRef
```

Routing:

1. hard filters: Company/capability/region/formats/cost floor/quality/reliability/privacy/sensitivity/credentials/health;
2. selección: `quality | cost | latency | balanced`;
3. desempate determinístico.

Un provider barato pero inelegible jamás compite en scoring.

## 7. Company Assets y Bootstrap

`CompanyAsset` fija ownership en Company y sólo referencia grants/credentials.

`CompanyBootstrapPlanner` es puro: no llama Google, Twilio, Stripe ni browser. Recibe requisitos + activos existentes + capacidades autónomas y produce un plan ordenado.

Reglas verificadas:

- reutiliza activos existentes antes de provisionar;
- KYC, identidad, contratos, autoridad financiera y acciones reservadas generan `request-approval` antes de provisioning;
- gasto nuevo no autorizado genera frontera de aprobación;
- provisioning y verify quedan separados.

## 8. API sandbox

Fastify expone sólo demos/fakes:

```text
GET /health
GET /gym
GET /demo
GET /runtime/heartbeat/demo
GET /providers/route/demo
GET /bootstrap/demo
```

Ningún endpoint ejecuta un provider externo real.

## 9. Evidence ejecutada

### Suite local

```text
pnpm run typecheck  PASS
pnpm run test       PASS
pnpm run gym        31/31 PASS
pnpm run build      PASS
```

### PostgreSQL 18 real

Se usó un contenedor local efímero `postgres:18-alpine` con rol de aplicación `NOSUPERUSER NOBYPASSRLS`.

Verificado:

- migration `0001` + `0002` desde cero;
- migration runner current/idempotent con advisory lock;
- checksum SHA-256 de migrations y rechazo de drift;
- tenant RLS entre dos Companies;
- CorporateGene isolation;
- BusinessEvent idempotency;
- heartbeat lease contention usando reloj PostgreSQL;
- fencing token monotónico;
- stale holder rejection;
- durable idempotency claim/settlement;
- recuperación de intents huérfanos a estado `unknown`/`reconciled`.

El smoke rechaza hosts remotos por defecto para reducir riesgo de ejecutar verificación destructiva contra una base equivocada.

## 10. Company Gym V1.2

Se mantienen los 20 invariantes V1 y se agregan:

1. heartbeat no material → sleep y cero wake;
2. evento material → wake una vez + cursor advance;
3. heartbeat lease bloquea tick concurrente, incluso mismo owner;
4. stale job fencing token no puede settle;
5. durable idempotency se reclama una sola vez;
6. Provider routing aplica hard filters antes de scoring;
7. Company mantiene ownership de assets;
8. Bootstrap reutiliza activo y respeta frontera KYC;
9. Bootstrap nunca reutiliza assets de otra Company;
10. holder heartbeat vencido/no-current no puede avanzar cursor;
11. intent idempotente huérfano pasa a reconciliador con fencing nuevo.

Total: **31 invariantes**.

## 11. Límites deliberados

V1.2 todavía no incluye:

- secret manager real;
- Gmail/Workspace/Twilio/Stripe;
- APIs creativas;
- MCP server propio expuesto por XanxitoSpA;
- daemon systemd/productivo;
- scheduler conectado a una Company real;
- control plane Web/PWA;
- reconciliadores específicos por provider.

Esas capas deben usar las primitivas ya verificadas; no redefinir autoridad, idempotencia, routing o ownership.

## 12. Siguiente frontera

La siguiente fase recomendada es el **Capability Plane V1.3**:

```text
SecretCapability
→ semantic Capability contracts
→ Provider adapters
→ Company Bootstrap executor
→ email/calendar/contacts como primer vertical real de bajo riesgo
→ MCP/control surface
```

Teléfono, pagos/tarjetas y Creative Plane deben entrar después usando el mismo patrón y budgets/approval boundaries existentes.
