# Auditoría de puesta en marcha de XanxitoSpA — 2026-10-09

**Veredicto: NO LISTO para que únicamente queden las autorizaciones de ChatGPT/Claude/Grok/Spark.** Este informe distingue código aprobado, servicio realmente publicado y pruebas contra anfitriones reales. No convierte simulaciones en evidencia de modelos externos conectados.

## Evidencia observada

| Control | Observado | Estado |
|---|---|---|
| GitHub feature branch | SHA `68a76ceb0e4cb2098f031ffd774c084dd4ffbe4a` | CI `37942685068` success |
| PR #1 | 0 revisiones aprobadas; SHA de revisión 4R pendiente corresponde al antiguo `62b2bd0` | BLOQUEO |
| GitHub `main` | GitHub REST responde `Branch not protected` | BLOQUEO |
| Railway staging | `xspa-mcp` y `Postgres` con último deployment SUCCESS | OK, pero no equivale a este SHA |
| Health remoto | `GET /health` HTTP 200 | OK |
| OAuth issuer remoto | `GET /.well-known/oauth-authorization-server` HTTP 404 | BLOQUEO |
| OAuth protected-resource remoto | `GET /.well-known/oauth-protected-resource/mcp` HTTP 404 | BLOQUEO |
| Agent Card remota | `GET /.well-known/agent-card.json` HTTP 404 | BLOQUEO |
| ChatGPT @Xspa | MCP accesible con herramienta `xspa_status`, `XSPA_PUBLIC_STATUS_ONLY=true` | Solo diagnóstico |
| Company OS / Workforce | PostgreSQL tenant, migraciones Workforce y store configurados en staging; actor OAuth externo no registrado | Backend presente, no operativo multi-host real |
| A2A 1.0 | Agent Card, `SendMessage`, `GetTask` y guards en PR; pruebas OAuth locales simuladas y CI verde | Código preparado, no publicado activo |
| Wake automático | Sin puente host-native verificado; GitHub/Gmail externos y presencia observada no equivalen a ejecución | BLOQUEO |
| Claves Owner / autoridad | No existe evidencia de una raíz legal/Owner pública efectivamente inscrita | BLOQUEO |
| Base de datos restauración | PostgreSQL 18 y volumen persistente, pero ningún restore drill certificado | BLOQUEO |
| Railway IaC | `.railway/railway.ts` en repo; `railway.json` legado todavía existe; plan/apply IaC no confirmado | BLOQUEO operativo |
| Model Law | `gpt-6-astra/max` es la preferencia declarada; `hostExecutionObserved=false` | Correcto, no prueba host |

## Riesgos de seguridad y conformidad antes de publicar

1. No basta con `JwtOAuthVerifier` para conectar cuentas: solo **verifica** tokens ajenos, no expone Authorization Server. El login/consentimiento, emisión, claves, registro de clientes y refresh/revocación no están terminados. No apagar `XSPA_PUBLIC_STATUS_ONLY` para evitar el problema.
2. El actor Workforce se deriva de (company ID, `sub`, `client_id`). Un emisor futuro debe dar **subject estable** por propietario para conservar identidad al volver a autorizar; no utilizar `sub` aleatorio en cada consentimiento ni aceptar `hostHint` como identidad verificada.
3. Owner necesita enroll real, autenticación fuerte, separación respecto a acceso de plataforma y authority trust anchors. Consentir un plugin no equivale a otorgar autoridad empresarial.
4. El esquema MCP vigente es 2026-07-28; conservar interoperabilidad con 2025-11-25. A2A 1.0 exige verificar en cada llamada el alcance de acceso a tareas; el backend lo restringe por dueño source/target.
5. El trabajo con anfitriones externos requiere prueba **observada**: OAuth consentido, registro `xspa_worker_register`, aceptación del emisor, delegación por ID, pickup real del host, receipt firmado/autorizado y ejecución de una tarea innocua. Un cliente mock no prueba esto.
6. Sin mecanismo host-native permitido para despertar una sesión, una cola durable o un comentario GitHub son solo un timbre, no inferencia ejecutada. `provider_api_calls=0` y `server_side_model_workers=0` no permiten resolverlo llamando las APIs de modelos.
7. `main` desprotegida, sin revisión 4R para SHA vigente y sin ensayo de restauración: ninguna aprobación de producción es válida.

## Código local pendiente de saneamiento

El checkout de desarrollo contiene `apps/mcp/src/self-hosted-oauth.ts` **incompleto** y `packages/database/migrations/0010_oauth_issuer.sql` **sin seguimiento Git**. NO incluirlos en un build/deploy ni presentarlos como proveedor OAuth listo. Completar, revisar y probar ambos antes de cualquier merge. El CI verde únicamente ejecuta los archivos versionados.

## Condiciones para estado «solo conectar cuentas»

- Emisor OAuth propio y consent autenticado de Owner, registro de clientes DCR / CIMD compatibles, PKCE S256, JWKS, issuer, audience y refresh/revocación seguros, persistentes y cubiertos por E2E, sin inventar credenciales del usuario.
- Establecer y validar Owner/Founder trust root y permisos mínimos de empresa.
- Publicar una compilación exact-SHA segura en Railway con `XSPA_PUBLIC_STATUS_ONLY` apagado **solo cuando** el emisor funcione, PRM y OAuth metadata devuelvan información correcta, y la herramienta no autenticada jamás permita acciones de empresa.
- A2A 1.0 contract/schema tests y wake de cada plataforma, con deduplicación, retry, límites, recuperación de eventos y evidencia de callback/pickup real.
- Restore de PostgreSQL documentado y probado; migración IaC sin conflicto con `railway.json`, plan previo y rollback.
- Cuatro revisiones de seguridad/código/resiliencia, rama principal protegida y CI verde para SHA exacto.

Solo después de cumplir estas condiciones será honesto decir: **falta únicamente que el propietario autorice las cuentas**.

## Referencias

- PR: https://github.com/riquelmechile/XanxitoSpA/pull/1
- Skills fijadas: `config/skills-library.lock.json`
- SDK MCP: https://modelcontextprotocol.io/specification/2026-07-28
- A2A: https://a2a-protocol.org/v1.0.1/specification/
- Railway IaC: https://docs.railway.com/infrastructure-as-code
