import { createRemoteJWKSet, jwtVerify } from "jose";

export interface XspaOAuthConfig {
  resource: string;
  issuer: string;
  audience: string;
  jwksUrl: string;
  readScope: string;
  writeScope: string;
}

export interface XspaAuthContext {
  authenticated: boolean;
  subject?: string;
  scopes: string[];
}

function validateUrl(value: string, name: string, stripTrailingSlash = false): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error(`${name} must be an absolute URL`); }
  if (url.protocol !== "https:" && !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname)) throw new Error(`${name} must use HTTPS`);
  const normalized = url.toString();
  return stripTrailingSlash ? normalized.replace(/\/$/, "") : normalized;
}

export function loadXspaOAuthConfig(env: NodeJS.ProcessEnv = process.env): XspaOAuthConfig | null {
  const resource = env.XSPA_PUBLIC_URL?.trim();
  const issuer = env.XSPA_OAUTH_ISSUER?.trim();
  const jwksUrl = env.XSPA_OAUTH_JWKS_URL?.trim();
  if (!resource && !issuer && !jwksUrl) return null;
  if (!resource || !issuer || !jwksUrl) throw new Error("OAuth requires XSPA_PUBLIC_URL, XSPA_OAUTH_ISSUER and XSPA_OAUTH_JWKS_URL");
  return {
    resource: validateUrl(resource, "XSPA_PUBLIC_URL", true),
    issuer: validateUrl(issuer, "XSPA_OAUTH_ISSUER"),
    audience: env.XSPA_OAUTH_AUDIENCE?.trim() || validateUrl(resource, "XSPA_PUBLIC_URL", true),
    jwksUrl: validateUrl(jwksUrl, "XSPA_OAUTH_JWKS_URL"),
    readScope: env.XSPA_OAUTH_READ_SCOPE?.trim() || "xspa.read",
    writeScope: env.XSPA_OAUTH_WRITE_SCOPE?.trim() || "xspa.write",
  };
}

export function protectedResourceMetadata(config: XspaOAuthConfig) {
  return {
    resource: config.resource,
    authorization_servers: [config.issuer],
    scopes_supported: [config.readScope, config.writeScope],
    resource_documentation: "https://github.com/riquelmechile/XanxitoSpA/blob/main/docs/CHATGPT_APP_MCP.md",
  };
}

export function oauthChallenge(config: XspaOAuthConfig, scope: string, reason = "Authentication required"): string {
  return `Bearer resource_metadata="${config.resource}/.well-known/oauth-protected-resource", scope="${scope}", error="insufficient_scope", error_description="${reason.replace(/[\"\\]/g, "")}"`;
}

function parseScopes(payload: Record<string, unknown>): string[] {
  const value = payload.scope ?? payload.scp;
  if (typeof value === "string") return value.split(/\s+/).filter(Boolean);
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  return [];
}

export class JwtOAuthVerifier {
  private readonly jwks;
  constructor(private readonly config: XspaOAuthConfig) {
    this.jwks = createRemoteJWKSet(new URL(config.jwksUrl));
  }

  async authenticate(header: unknown): Promise<XspaAuthContext> {
    if (typeof header !== "string" || !header.startsWith("Bearer ")) return { authenticated: false, scopes: [] };
    const token = header.slice(7).trim();
    if (!token) return { authenticated: false, scopes: [] };
    try {
      const verified = await jwtVerify(token, this.jwks, { issuer: this.config.issuer, audience: this.config.audience });
      const payload = verified.payload as Record<string, unknown>;
      return {
        authenticated: true,
        ...(typeof payload.sub === "string" ? { subject: payload.sub } : {}),
        scopes: parseScopes(payload),
      };
    } catch {
      return { authenticated: false, scopes: [] };
    }
  }
}

export function hasScope(context: XspaAuthContext, scope: string): boolean {
  return context.authenticated && context.scopes.includes(scope);
}

export function assertMcpDeploymentAuth(input: { host: string; oauth: XspaOAuthConfig | null; internalAuthToken?: string }): void {
  const loopback = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
  if (loopback.has(input.host)) return;
  if (input.internalAuthToken) throw new Error("XSPA_MCP_INTERNAL_BEARER is loopback-only; remote XanxitoSpA MCP must use OAuth");
  if (!input.oauth) throw new Error("Remote XanxitoSpA MCP requires OAuth configuration; unauthenticated remote app mode is forbidden");
}
