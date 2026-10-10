# Activación segura de OAuth propio en XanxitoSpA

Este procedimiento se aplica al servicio `xspa-mcp` de Railway, entorno `staging`. El emisor está implementado y su prueba con PostgreSQL 18 está en `packages/testing/src/xspa-self-oauth-postgres-smoke.ts`.

## Preparación

La clave privada Ed25519 debe mantenerse como una variable privada `XSPA_SELF_OAUTH_SIGNING_JWK` de Railway, nunca en GitHub, en el chat ni en los logs. Debe ser un JWK completo (kty OKP, crv Ed25519, x, d, kid). Puede establecerse con el conector Railway sin revelar su contenido.

**El propietario define una contraseña fuerte en Railway**: `XSPA_SELF_OAUTH_OWNER_PASSWORD`, al menos 20 caracteres, como variable sellada. Al iniciar, el servidor calcula su hash scrypt y elimina la contraseña del entorno del proceso. Alternativamente puede configurarse `XSPA_SELF_OAUTH_OWNER_PASSWORD_HASH` generado externamente con prefijo `scrypt-v1`.

Establecer `XSPA_PUBLIC_URL=https://xspa-mcp-staging.up.railway.app/mcp`, `XSPA_SELF_OAUTH_ENABLED=true` y `XSPA_PUBLIC_STATUS_ONLY=false` **juntos en el mismo cambio**, únicamente cuando contraseña, clave privada, PostgreSQL y Company ID estén presentes. El servicio rechaza el inicio si se habilita OAuth con configuración incompleta. Un estado público sin OAuth sigue sin exponer el Workforce.

No configurar simultáneamente otro issuer con `XSPA_OAUTH_ISSUER`: el servidor debe usar el issuer propio (URL raíz) y su JWKS en `/oauth/jwks`.

## Comprobaciones HTTP antes de autorizar cuentas

- `/health` devuelve HTTP 200.
- `/.well-known/oauth-protected-resource/mcp` anuncia `resource` y `authorization_servers`.
- `/.well-known/oauth-authorization-server` anuncia `/authorize`, `/token`, `/register`, `/revoke`, JWKS y PKCE S256.
- `/oauth/jwks` devuelve **solo** la clave pública.
- Una petición MCP anónima es rechazada con HTTP 401 y `WWW-Authenticate`.
- Un cliente registrado por DCR completa autorización con el propietario, verifica PKCE, recibe JWT con `sub` estable y `client_id` firmado, y registra un worker. Un código usado o una renovación ya rotada se rechazan.

El servidor soporta DCR para clientes MCP como ChatGPT; CIMD aún no está implementado y no se anuncia. Esto está permitido como compatibilidad, aunque CIMD es la evolución recomendada. No inventar metadatos CIMD.

## Conexión real

Desde ChatGPT, editar/recrear `@Xspa`, elegir autenticación OAuth, usar `https://xspa-mcp-staging.up.railway.app/mcp` y completar la pantalla del propietario. Repetir desde Claude y Grok. Registrar worker con `xspa_worker_register` y probar delegación, pickup y receipt reales. Spark requiere verificar soporte MCP del anfitrión y una ruta de despertar separada. OAuth **no** registra automáticamente un trabajador ni concede mandatos de empresa.

## Producción

Se necesita revisión independiente de seguridad, establecimiento de raíz Founder/Owner, política de contraseñas/MFA y rate-limit persistente, restore drill y verificación de wakes host-native antes de producción. `XSPA_SELF_OAUTH_OWNER_PASSWORD` es una credencial de bootstrap para staging, no reemplaza un proveedor de identidad con MFA para producción.

Política inalterada: `provider_api_calls=0` y `server_side_model_workers=0`.
