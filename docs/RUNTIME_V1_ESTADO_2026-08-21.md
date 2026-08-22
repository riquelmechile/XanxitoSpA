# XanxitoSpA Runtime V1 — Estado de implementación

**Fecha:** 21 de agosto de 2026  
**Change:** `xanxitospa-runtime-v1`  
**Estado:** kernel ejecutable en sandbox; no producción

## Alcance implementado

### Contratos y dominio

- Company Manifest snapshot/lifecycle modes.
- Work separado de Delegation.
- AuthorityGrant deny-by-default.
- BudgetEnvelope con period/per-transaction/category/provider/beneficiary guards.
- BusinessEvent, BusinessOutcome y BusinessReceipt.
- MissionGraph y nodos V1.
- CorporateGene/Fitness/lineage/negative results.

### Kernel

- validación de Business Preflight;
- Mission Graph DAG + capas topológicas;
- ejecución concurrente sólo entre nodos independientes;
- CapabilityRegistry y FakeCapability;
- idempotencia serial y concurrente por idempotency key;
- reserva de budget antes del efecto y liberación en failure/no-effect;
- evento estructurado de deny/escalation mediante recorder del contexto;
- `COMPETE` con mismo snapshot, strategy overlays distintos, trabajo blind, una crítica cruzada por defecto y owner adjudicator;
- settlement Outcome + Receipt;
- learning verified-only;
- negative-result preservation;
- Pareto front y guard de Progressive Autonomy.

### Persistencia preparada

`packages/database/migrations/0001_init.sql` define PostgreSQL `xspa` para:

- companies;
- work;
- authority grants;
- budget envelopes;
- business events;
- mission graphs/runs;
- idempotency journal;
- outcomes/receipts;
- corporate genes;
- evolution hypotheses.

RLS queda definido mediante `xspa.company_id` para tablas tenant-sensitive incluidas en esta primera migration.

Los tests y `/demo` usan `InMemoryCompanyStore`; todavía no se conecta PostgreSQL real.

## Vertical demostrable

`GET /demo` ejecuta:

```text
Founder signal
→ Executive Business Preflight
→ Commercial + Finance fan-out
→ COMPETE sobre una misma decisión comercial
   ├─ margin-first (blind)
   └─ growth-first (blind)
→ cross-critique
→ Commercial Supervisor adjudicates
→ independent verify
→ settle BusinessOutcome + Receipt
→ verified outcome updates Corporate Gene candidate
```

No existen side effects externos reales.

## Company Gym

La suite ejecutable valida actualmente 20 invariantes:

1. idle heartbeat no invoca modelo;
2. fan-out + join correcto;
3. COMPETE blind + owner adjudication;
4. collaboration estructurada;
5. debate máximo dos rondas;
6. acción sin grant se niega antes del side effect;
7. BudgetEnvelope inside/outside;
8. provider fallback fake;
9. idempotencia secuencial;
10. budget concurrente no sobre-gasta;
11. idempotencia concurrente ejecuta una sola vez;
12. timestamps de grants inválidos fallan cerrados;
13. preflight falla si declara autoridad no disponible;
14. deny genera evento estructurado cuando existe recorder;
15. tenant isolation del store;
16. unverified outcome no enseña;
17. negative result se conserva y silencia el gene;
18. Pareto elimina variante dominada;
19. autonomía no sube con incidentes/falta de evidencia;
20. settlement enlaza Outcome y Receipt.

## Evidencia

```text
pnpm run typecheck  PASS
pnpm run test       PASS
pnpm run gym        20/20 PASS
pnpm run build      PASS
```

## Findings corregidos durante review

La primera revisión reliability/resilience detectó antes de aprobar:

- reserva de budget posterior al side effect;
- idempotency journal vulnerable a carrera;
- preflight que ignoraba disponibilidad determinística de grants/budget;
- timestamps inválidos con riesgo fail-open;
- RLS habilitado sin políticas;
- ausencia de seam de evento para deny/escalation.

Se corrigieron y se agregaron regresiones al Company Gym.

## Límites deliberados de este incremento

No se agregaron todavía:

- adapter PostgreSQL transaccional real;
- scheduler/worker leases persistentes ejecutándose contra DB;
- Redis/Kafka/LangGraph;
- proveedores Gmail/Twilio/Stripe/Creative reales;
- secretos reales;
- navegador;
- Control Plane React/PWA;
- deployment productivo.

La política es conectar esas capas sin degradar los invariantes ya demostrados.

## Delivery note

La carpeta comenzó sin repositorio Git. Xanxittoo HostOps obliga a que Git use su acción estructurada y esa superficie actual no expone `git init`; por política no se hizo bypass con shell. El código queda local y verificado, pendiente de inicialización Git mediante una ruta estructurada soportada.
