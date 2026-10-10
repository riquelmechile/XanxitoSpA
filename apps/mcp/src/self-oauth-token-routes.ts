import { newSecret, pkceS256 } from "./self-oauth-core.js";
import { bounded, oauthError, parseOAuthBody } from "./self-oauth-request.js";
import type { HostedOAuthContext } from "./self-oauth.js";

export function mountOAuthTokenRoutes(app:{post:(...args:any[])=>any},ctx:HostedOAuthContext):void{
 app.post("/token",async(req:any,res:any)=>{
  try{
   const b=await parseOAuthBody(req);
   const clientId=bounded(b.client_id,240),kind=bounded(b.grant_type,80);
   if(!clientId||!await ctx.store.getClient(clientId)){oauthError(res,"invalid_client",401);return;}
   if(b.resource&&b.resource!==ctx.config.resource){oauthError(res,"invalid_target");return;}
   let grant;
   if(kind==="authorization_code"){
    const verifier=bounded(b.code_verifier,128);
    const redirect=bounded(b.redirect_uri,1500);
    if(!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)||!redirect){oauthError(res,"invalid_grant");return;}
    grant=await ctx.store.consume("authorization_code",bounded(b.code,200),clientId,{redirect,challenge:pkceS256(verifier)});
   }else if(kind==="refresh_token"){
    grant=await ctx.store.consume("refresh_token",bounded(b.refresh_token,200),clientId);
   }else{oauthError(res,"unsupported_grant_type");return;}
   if(!grant||grant.resource!==ctx.config.resource){oauthError(res,"invalid_grant");return;}
   const access=await ctx.signer.jwt(ctx.config.issuer,ctx.config.resource,grant.owner_subject,grant.client_id,grant.scope);
   const refresh=newSecret(48);
   await ctx.store.grant("refresh_token",refresh,grant,30*24*3600);
   res.set("Cache-Control","no-store").json({
    access_token:access,token_type:"Bearer",expires_in:900,scope:grant.scope,refresh_token:refresh
   });
  }catch{oauthError(res,"temporarily_unavailable",503);}
 });
 app.post("/revoke",async(req:any,res:any)=>{
  try{
   const b=await parseOAuthBody(req);
   const clientId=bounded(b.client_id,240),token=bounded(b.token,250);
   if(clientId&&token&&await ctx.store.getClient(clientId))await ctx.store.revokeRefresh(clientId,token);
   res.set("Cache-Control","no-store").status(200).end();
  }catch{oauthError(res,"temporarily_unavailable",503);}
 });
}