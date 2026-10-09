import { oauthRedirectAllowed } from "./self-oauth-core.js";
import { bounded, oauthError, parseOAuthBody } from "./self-oauth-request.js";
import type { HostedOAuthContext } from "./self-oauth.js";

export function mountOAuthClientRoutes(app:{post:(...args:any[])=>any},ctx:HostedOAuthContext):void{
 const attempts=new Map<string,{count:number;expires:number}>();
 app.post("/register",async(req:any,res:any)=>{
  try{
   const ip=String(req.socket?.remoteAddress||"default").slice(0,128);
   const now=Date.now(),old=attempts.get(ip);
   if(old&&old.expires>now&&old.count>=20){oauthError(res,"slow_down",429);return;}
   const b=await parseOAuthBody(req);
   const uris=b.redirect_uris;
   const name=bounded(b.client_name,140)||"MCP Client";
   if(!Array.isArray(uris)||uris.length===0||uris.length>8||
      uris.some(u=>typeof u!=="string"||!oauthRedirectAllowed(u))||
      (b.token_endpoint_auth_method&&b.token_endpoint_auth_method!=="none")||
      (b.grant_types&&(!Array.isArray(b.grant_types)||b.grant_types.some(g=>!["authorization_code","refresh_token"].includes(g))))||
      (b.response_types&&(!Array.isArray(b.response_types)||b.response_types.some(g=>g!=="code")))){
    oauthError(res,"invalid_client_metadata");return;
   }
   const next=old&&old.expires>now?old:{count:0,expires:now+3600000};
   next.count++;attempts.set(ip,next);
   if(attempts.size>512)attempts.clear();
   const client=await ctx.store.register(name,[...new Set(uris as string[])]);
   res.set("Cache-Control","no-store").status(201).json({
    client_id:client.client_id,client_name:client.name,redirect_uris:client.redirect_uris,
    grant_types:["authorization_code","refresh_token"],response_types:["code"],token_endpoint_auth_method:"none"
   });
  }catch{oauthError(res,"temporarily_unavailable",503);}
 });
}