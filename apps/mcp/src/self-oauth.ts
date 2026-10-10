import { type JWK } from "jose";
import { SelfOAuthStore } from "./self-oauth-store.js";
import { OAuthSigner } from "./self-oauth-core.js";
import { mountOAuthClientRoutes } from "./self-oauth-client-routes.js";
import { mountOAuthConsentRoutes } from "./self-oauth-consent-routes.js";
import { mountOAuthTokenRoutes } from "./self-oauth-token-routes.js";
import type { PostgresDatabase } from "../../../packages/database/src/postgres.js";
import type { XspaOAuthConfig } from "./oauth.js";

export interface HostedOAuthSettings {
  db:PostgresDatabase;
  companyId:string;
  resource:string;
  signingJwk:JWK;
  ownerPasswordHash:string;
  ownerSubject:string;
}
export interface HostedOAuthContext {
  config:XspaOAuthConfig;
  signer:OAuthSigner;
  store:SelfOAuthStore;
  ownerPasswordHash:string;
  ownerSubject:string;
}
export class SelfHostedOAuth {
  readonly config:XspaOAuthConfig;
  readonly signer:OAuthSigner;
  readonly store:SelfOAuthStore;
  private readonly context:HostedOAuthContext;
  constructor(settings:HostedOAuthSettings){
    const u=new URL(settings.resource);
    if(u.pathname!=="/mcp"||u.search||u.hash||!/^(https:|http:)$/.test(u.protocol))throw Error("OAUTH_RESOURCE_MUST_BE_MCP");
    if(u.protocol==="http:"&&!["localhost","127.0.0.1"].includes(u.hostname))throw Error("OAUTH_RESOURCE_REQUIRES_HTTPS");
    if(!/^scrypt-v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(settings.ownerPasswordHash))throw Error("OAUTH_OWNER_HASH_NOT_CONFIGURED");
    if(!/^owner:[A-Za-z0-9_-]{8,128}$/.test(settings.ownerSubject))throw Error("OAUTH_OWNER_STABLE_SUBJECT_REQUIRED");
    this.signer=new OAuthSigner(settings.signingJwk);
    this.store=new SelfOAuthStore(settings.db,settings.companyId);
    this.config={resource:settings.resource,issuer:u.origin+"/",audience:settings.resource,jwksUrl:u.origin+"/oauth/jwks",readScope:"xspa.read",writeScope:"xspa.write"};
    this.context={config:this.config,signer:this.signer,store:this.store,ownerPasswordHash:settings.ownerPasswordHash,ownerSubject:settings.ownerSubject};
  }
  mount(app:{get:(...args:any[])=>any;post:(...args:any[])=>any}):void{
    const ctx=this.context;
    const origin=new URL(ctx.config.issuer).origin;
    app.get("/oauth/jwks",(_req:any,res:any)=>res.json(ctx.signer.jwks));
    const metadata={
      issuer:ctx.config.issuer,
      authorization_endpoint:origin+"/authorize",
      token_endpoint:origin+"/token",
      registration_endpoint:origin+"/register",
      revocation_endpoint:origin+"/revoke",
      jwks_uri:origin+"/oauth/jwks",
      response_types_supported:["code"],
      grant_types_supported:["authorization_code","refresh_token"],
      code_challenge_methods_supported:["S256"],
      token_endpoint_auth_methods_supported:["none"],
      scopes_supported:[ctx.config.readScope,ctx.config.writeScope],
      client_id_metadata_document_supported:false
    };
    app.get("/.well-known/oauth-authorization-server",(_req:any,res:any)=>res.json(metadata));
    app.get("/.well-known/oauth-authorization-server/mcp",(_req:any,res:any)=>res.json(metadata));
    mountOAuthClientRoutes(app,ctx);
    mountOAuthConsentRoutes(app,ctx);
    mountOAuthTokenRoutes(app,ctx);
  }
}