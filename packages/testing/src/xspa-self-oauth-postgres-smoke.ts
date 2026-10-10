import { createServer } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { exportJWK, generateKeyPair } from "jose";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { PostgresDatabase, PostgresCompanyStore, PostgresRuntimeStore } from "../../database/src/postgres.js";
import { PostgresWorkforceStore } from "../../database/src/workforce.js";
import { CompanyWorkforceOperations } from "../../../apps/mcp/src/workforce-operations.js";
import { EnvironmentXspaAppOperations } from "../../../apps/mcp/src/runtime.js";
import { SelfHostedOAuth } from "../../../apps/mcp/src/self-oauth.js";
import { createPasswordHash, newSecret, pkceS256 } from "../../../apps/mcp/src/self-oauth-core.js";
import { JwtOAuthVerifier } from "../../../apps/mcp/src/oauth.js";
import { listenXspaMcp } from "../../../apps/mcp/src/server.js";

const url=process.env.XSPA_TEST_DATABASE_URL;
if(!url)throw Error("XSPA_TEST_DATABASE_URL required");
if(!["127.0.0.1","localhost"].includes(new URL(url).hostname))throw Error("OAuth E2E must run against local disposable PostgreSQL only");
const probe=createServer();
probe.listen(0,"127.0.0.1");
await once(probe,"listening");
const port=(probe.address() as AddressInfo).port;
await new Promise<void>(resolve=>probe.close(()=>resolve()));

const db=new PostgresDatabase(url);
let server:Awaited<ReturnType<typeof listenXspaMcp>>|undefined;
try{
 await db.migrate();
 const companyId=randomUUID();
 await db.ensureCompany(companyId,"Self OAuth E2E",newSecret());
 const ops=new EnvironmentXspaAppOperations({
  store:new PostgresRuntimeStore(db),workStore:new PostgresCompanyStore(db),
  workforce:new CompanyWorkforceOperations(companyId,new PostgresWorkforceStore(db),new PostgresCompanyStore(db)),
  companyId,databaseConfigured:true,creativeConfigured:false,kastConfigured:false
 });
 const password="OwnerTest#"+newSecret(25);
 const ownerPasswordHash=await createPasswordHash(password);
 const pair=await generateKeyPair("Ed25519",{extractable:true});
 const signingJwk=await exportJWK(pair.privateKey);signingJwk.kid="xspa-e2e";
 const root="http://127.0.0.1:"+port,resource=root+"/mcp";
 const issuer=new SelfHostedOAuth({db,companyId,resource,ownerPasswordHash,signingJwk,ownerSubject:"owner:"+companyId});
 server=await listenXspaMcp({operations:ops,oauth:issuer.config,oauthIssuer:issuer,host:"127.0.0.1",port,allowedHosts:["127.0.0.1","localhost"]});
 const discovery=await fetch(root+"/.well-known/oauth-authorization-server");
 assert.equal(discovery.status,200);
 const meta=await discovery.json() as {issuer:string;registration_endpoint:string;code_challenge_methods_supported:string[]};
 assert.equal(meta.issuer,root+"/");
 assert(meta.code_challenge_methods_supported.includes("S256"));
 const jwks=await fetch(root+"/oauth/jwks").then(r=>r.json()) as {keys:Array<Record<string,unknown>>};
 assert.equal(jwks.keys.length,1);assert.equal(jwks.keys[0]?.d,undefined);

 const redirect="http://127.0.0.1:41234/oauth/callback";
 const register=await fetch(root+"/register",{method:"POST",headers:{"Content-Type":"application/json"},
  body:JSON.stringify({client_name:"ChatGPT test OAuth",redirect_uris:[redirect],grant_types:["authorization_code","refresh_token"],token_endpoint_auth_method:"none"})});
 assert.equal(register.status,201);
 const reg=await register.json() as {client_id:string};
 assert(reg.client_id.startsWith("xspa-"));
 const badRegister=await fetch(root+"/register",{method:"POST",headers:{"Content-Type":"application/json"},
  body:JSON.stringify({redirect_uris:["http://evil.example/callback"]})});
 assert.equal(badRegister.status,400);

 const verifier=newSecret(36),challenge=pkceS256(verifier),state=newSecret(12);
 const params={response_type:"code",client_id:reg.client_id,redirect_uri:redirect,code_challenge:challenge,code_challenge_method:"S256",scope:"xspa.read xspa.write",resource,state};
 const authUrl=root+"/authorize?"+new URLSearchParams(params);
 const authPage=await fetch(authUrl);
 assert.equal(authPage.status,200);
 assert.match(await authPage.text(),/ChatGPT test OAuth/);
 const wrong=await fetch(root+"/oauth/consent",{method:"POST",body:new URLSearchParams({...params,owner_password:"bad-password",decision:"approve"}),redirect:"manual"});
 assert.equal(wrong.status,403);
 assert.match(wrong.headers.get("content-type")||"",/text\/html/);
 const wrongHtml=await wrong.text();
 assert.match(wrongHtml,/Volver al formulario OAuth/);
 const retryMatch=wrongHtml.match(/href="([^"]+)"/);
 assert(retryMatch?.[1],"retry link missing");
 const retryLink=retryMatch[1].replaceAll("&amp;","&");
 const retry=new URL(retryLink);
 assert.equal(retry.pathname,"/authorize");
 assert.equal(retry.searchParams.get("client_id"),reg.client_id);
 assert.equal(retry.searchParams.get("code_challenge"),challenge);
 assert.equal(retry.searchParams.get("state"),state);
 assert.equal(retry.searchParams.has("owner_password"),false);
 const retryPage=await fetch(retry);
 assert.equal(retryPage.status,200);
 const consent=await fetch(root+"/oauth/consent",{method:"POST",body:new URLSearchParams({...params,owner_password:password,decision:"approve"}),redirect:"manual"});
 assert.equal(consent.status,302);
 const location=new URL(consent.headers.get("location")!);
 assert.equal(location.origin,"http://127.0.0.1:41234");
 assert.equal(location.searchParams.get("state"),state);
 assert.equal(location.searchParams.get("iss"),root+"/");
 const code=location.searchParams.get("code")!;
 const badToken=await fetch(root+"/token",{method:"POST",body:new URLSearchParams({grant_type:"authorization_code",client_id:reg.client_id,redirect_uri:redirect,code,code_verifier:newSecret(40),resource})});
 assert.equal(badToken.status,400);
 const exchange=await fetch(root+"/token",{method:"POST",body:new URLSearchParams({grant_type:"authorization_code",client_id:reg.client_id,redirect_uri:redirect,code,code_verifier:verifier,resource})});
 assert.equal(exchange.status,200);
 const tokens=await exchange.json() as {access_token:string;refresh_token:string;scope:string};
 assert.match(tokens.access_token,/^eyJ/);
 assert.equal(tokens.scope,"xspa.read xspa.write");
 const replay=await fetch(root+"/token",{method:"POST",body:new URLSearchParams({grant_type:"authorization_code",client_id:reg.client_id,redirect_uri:redirect,code,code_verifier:verifier,resource})});
 assert.equal(replay.status,400);
 const verified=await new JwtOAuthVerifier(issuer.config).authenticate("Bearer "+tokens.access_token);
 assert(verified.authenticated);assert.equal(verified.clientId,reg.client_id);assert.equal(verified.subject,"owner:"+companyId);

 const anon=await fetch(root+"/mcp",{method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json, text/event-stream"},
  body:JSON.stringify({jsonrpc:"2.0",id:1,method:"initialize",params:{protocolVersion:"2026-07-28",capabilities:{},clientInfo:{name:"anonymous",version:"1"}}})});
 assert.equal(anon.status,401);
 assert.match(anon.headers.get("www-authenticate")||"",/oauth-protected-resource/);
 const client=new Client({name:"oauth-e2e",version:"1"},{versionNegotiation:{mode:"auto"}});
 try{
  await client.connect(new StreamableHTTPClientTransport(new URL(resource),{requestInit:{headers:{Authorization:"Bearer "+tokens.access_token}}}));
  const list=await client.listTools();assert(list.tools.some(t=>t.name==="xspa_worker_register"));
  const regWorker=await client.callTool({name:"xspa_worker_register",arguments:{host_hint:"chatgpt",capabilities:["read"]}});
  assert.notEqual(regWorker.isError,true);
  assert.match(JSON.stringify(regWorker),/identityBound/);
 }finally{await client.close();}
 const refreshed=await fetch(root+"/token",{method:"POST",body:new URLSearchParams({grant_type:"refresh_token",client_id:reg.client_id,refresh_token:tokens.refresh_token,resource})});
 assert.equal(refreshed.status,200);
 const rotated=await refreshed.json() as {refresh_token:string};
 assert.notEqual(rotated.refresh_token,tokens.refresh_token);
 const reuse=await fetch(root+"/token",{method:"POST",body:new URLSearchParams({grant_type:"refresh_token",client_id:reg.client_id,refresh_token:tokens.refresh_token,resource})});
 assert.equal(reuse.status,400);
 const revoke=await fetch(root+"/revoke",{method:"POST",body:new URLSearchParams({client_id:reg.client_id,token:rotated.refresh_token})});
 assert.equal(revoke.status,200);
 const afterRevoke=await fetch(root+"/token",{method:"POST",body:new URLSearchParams({grant_type:"refresh_token",client_id:reg.client_id,refresh_token:rotated.refresh_token,resource})});
 assert.equal(afterRevoke.status,400);
 console.log("PASS self-hosted OAuth: DCR, owner consent, PKCE, JWT, MCP worker, rotating refresh, replay and revocation");
}finally{
 if(server)await new Promise<void>(resolve=>server!.close(()=>resolve()));
 await db.close();
}
