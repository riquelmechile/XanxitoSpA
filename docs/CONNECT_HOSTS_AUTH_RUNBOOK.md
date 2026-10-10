# XanxitoSpA: conexión OAuth de anfitriones y verificación

Estado actual: **NO LISTO PARA SOLO CONECTAR CUENTAS**. No afirmar lo contrario antes de superar `node scripts/audit-stage.mjs --require-ready` y revisión de seguridad.

## Configuración común

- URL de staging: https://xspa-mcp-staging.up.railway.app/mcp
- ChatGPT, Claude y Grok usarán el mismo recurso MCP; `/universal/mcp` es una ruta de Xanxittoo que XanxitoSpA no publica.
- Exigir Authorization Server OAuth, PRM path-aware, PKCE S256, client_id autenticado, scopes xspa.read / xspa.write, issuer y audience correctos, JWKS, revocación y consentimiento del propietario.
- La autorización de cliente OAuth no otorga mandato legal Founder/Owner ni presupuesto de la compañía.

## Prueba de aceptación por plataforma

1. En ChatGPT actualizar el plugin @Xspa de sin autenticación a OAuth y autorizar en su navegador. No compartir claves en mensajes.
2. Leer xspa_status y verificar access.mode=oauth y access.oauthConfigured=true.
3. Ejecutar xspa_worker_register con host_hint=chatgpt, guardando workerId, client_id firmado y sujeto estable. No marcar hostVerified=true sin ejecución observada.
4. En Claude y Grok configurar el mismo URL MCP, realizar OAuth y registrar host_hint=claude y host_hint=grok, respectivamente.
5. Aceptar explícitamente al emisor mediante xspa_workforce_allow_source y crear Company Work inocuo.
6. Delegar trabajo por ID, recoger con xspa_workforce_pickup desde el anfitrión real, completar preservando leaseGeneration, consultar xspa_workforce_receipt y comprobar el resultado.
7. Spark/Gemini: probar conexión MCP autenticada solo si el anfitrión lo admite. El relay Gmail y callback autónomo de Xanxittoo NO está implementado en XanxitoSpA.
8. Despertar autónomo: verificar un trigger nativo por anfitrión y una ejecución real; cola o GitHub webhook sin host activo no prueban ejecución.

## Condiciones previas al lanzamiento

- OAuth issuer autentica propietario y emite tokens de client_id y subject estables; PKCE, refresh y revocación E2E probados.
- HTTPS y scopes; sin acceso anónimo de operaciones empresariales.
- Revisión 4R independiente, rama protegida y pruebas contra mismo commit desplegado.
- Restore PostgreSQL probado; no duplicar Postgres accidentalmente con Railway IaC.
- Compatibilidad MCP 2025/2026 y A2A 1.0 probadas.
- Sin llamadas directas a APIs de modelos: provider_api_calls=0 y server_side_model_workers=0.

Auditoría remota de solo lectura: `node scripts/audit-stage.mjs` para JSON; usar `--require-ready` como condición de conexión.