# XanxitoSpA — Runtime V1.3 Capability Plane

**Fecha:** 21 de agosto de 2026  
**Estado:** implementación local verificada / review approved  
**Base:** `da18678` — runtime V1.2 durable aprobado

## Objetivo

Conectar el kernel empresarial durable con herramientas externas sin acoplar decisiones a proveedores ni exponer secretos a workers, prompts, eventos, receipts o superficies de control.

## Principio

```text
GPT / Supervisor / Worker
        │
 semantic capability
        │
 Business/Authority guards
        │
 Provider Registry
        │
 Provider Adapter
        │
 scoped secret callback
        │
 external tool/provider
```

El worker pide `email.send`, `data.query`, `creative.video.generate`, etc. No pide `Gmail`, `Twilio`, `Runway` ni otro vendor concreto.

## Implementado

### Secret handles opacos

`SecretHandle` contiene sólo referencia, Company, provider, nombre lógico y versión. `SecretResolver` entrega el valor únicamente dentro de un callback efímero de adapter.

Invariantes:

- Company/provider scope obligatorio;
- adapters sólo pueden solicitar credential names declarados;
- valores triviales/cortos se rechazan en el fake resolver;
- resultados serializables se inspeccionan para impedir que material secreto salga del adapter;
- Control Catalog nunca muestra `credentialsRef` ni valores de metadata privada.

V1.3 usa `InMemorySecretResolver` únicamente para Gym/demo. Un secret manager real será un adapter posterior del mismo contrato.

### Semantic Capability Registry

Se agregó un catálogo universal provider-neutral que cubre:

- email, calendar, contacts, phone y notifications;
- data, files, documents y web research;
- finance y payments;
- image/vector/video/3D/CAD creative plane;
- identity provisioning, DNS y generic asset provisioning.

Cada capability declara risk, sensitivity, side-effect class, formatos y si requiere credenciales.

### Provider Adapter Registry

Un adapter se registra por:

```text
company_id
provider_id
capabilities[]
credential_names[]
```

No existe resolución cross-Company.

### Capability Plane

`CapabilityPlane.execute()`:

1. valida Company + semantic capability;
2. reclama idempotency intent durable;
3. aplica Provider Registry hard filters;
4. prueba providers por ranking hasta `maxAttempts`;
5. aplica authority/budget antes del adapter;
6. resuelve credenciales sólo dentro del adapter;
7. permite fallback sólo cuando el intento anterior demuestra `sideEffectApplied=false`;
8. si existe efecto aplicado/incierto marca `unknown` y exige reconciliación;
9. cachea settlement durable por idempotency key;
10. fencing perdido impide devolver settlement como válido.

### Bootstrap Executor

`BootstrapExecutor` convierte `BootstrapPlan` en ejecución resumible:

- `reuse` reutiliza sólo CompanyAssets propios/activos;
- `request-approval` pausa;
- approval receipt ligado al `planFingerprint` + `BootstrapTrustBoundary` verificada permite continuar;
- `provision` usa Capability Plane;
- `verify` usa un verifier confiable inyectado en el constructor y debe pasar antes de activar asset;
- completed steps no se repiten;
- plan fingerprint impide reusar estado contra otro plan;
- recovery busca asset por requirement, no por provider preferido, evitando duplicados lógicos cuando el router eligió un fallback.

### Control Catalog

Superficie read-only reutilizable por HTTP/MCP futuro que expone:

- semantic capabilities;
- providers saneados;
- CompanyAssets saneados;
- señales booleanas de credential configuration;

sin `credentialsRef`, grant values ni metadata values privadas.

### Runtime demos

```text
GET /capabilities/catalog/demo
GET /bootstrap/execution/demo
```

Comparten la misma lógica que las futuras surfaces MCP; no hay un segundo camino de negocio.

## Company Gym

V1.3 extiende el Gym de 31 a 51 invariantes. Nuevos guards principales:

- scoped secret handles;
- secret output quarantine;
- safe provider fallback;
- fallback bloqueado tras side effect incierto;
- durable replay no repite provider effect;
- adapter isolation por Company;
- bootstrap KYC pause/resume;
- bootstrap no reprovisiona completed asset;
- plan fingerprint mismatch DENY;
- missing credential pre-effect puede hacer fallback;
- non-positive reconciliation window DENY;
- Control Catalog sanitization;
- universal semantic catalog sin vendor coupling.

## Deliberadamente fuera de V1.3

- secretos reales;
- Infisical/OpenBao/1Password/etc. conectados;
- Google Workspace/Twilio/Stripe/creative APIs reales;
- browser;
- KYC automatizado;
- acciones financieras reales;
- MCP productivo propio.

Estas capacidades deben entrar como adapters/providers y no modificar contratos del kernel.
