import { checkPassword, newSecret, stripHtml } from "./self-oauth-core.js";
import { bounded, oauthError, parseOAuthBody, validatedAuthRequest } from "./self-oauth-request.js";
import type { HostedOAuthContext } from "./self-oauth.js";

export function mountOAuthConsentRoutes(app:{get:(...a:any[])=>any;post:(...a:any[])=>any},ctx:HostedOAuthContext){
 const throttle=new Map<string,{failures:number;until:number}>();
 app.get("/authorize",async(req:any,res:any)=>{
  try{
   const p=await validatedAuthRequest(ctx,req.query||{});
   if(!p){oauthError(res,"invalid_request");return;}
   const form:Record<string,string>={
    response_type:"code",client_id:p.id,redirect_uri:p.redirect,code_challenge:p.challenge,
    code_challenge_method:"S256",scope:p.scope,resource:p.resource,state:p.state
   };
   const hidden=Object.entries(form).map(([k,v])=>'<input type="hidden" name="'+k+'" value="'+stripHtml(v)+'">').join("");
   res.set("Cache-Control","no-store");
   // Do not set form-action: Chrome applies it to every redirect after the consent POST,
   // including ChatGPT's cross-origin OAuth callback and its subsequent redirect chain.
   // The consent form itself still submits to a fixed same-origin endpoint.
   res.set("Content-Security-Policy","default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'");
   res.type("html").send(
    '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>XanxitoSpA OAuth</title>'+
    '<style>body{background:#101827;color:#f9fbff;font:16px system-ui;display:grid;place-items:center;min-height:90vh}main{max-width:450px;padding:26px;background:#1b293d;border-radius:14px}input,button{width:100%;box-sizing:border-box;padding:12px;margin:10px 0}button{background:#4ae0bf}code{overflow-wrap:anywhere}</style>'+
    '<main><h2>XanxitoSpA</h2><p>¿Autorizas este cliente MCP?</p><p><b>'+stripHtml(p.client.name)+'</b><br>Redirección: <code>'+stripHtml(p.redirect)+'</code><br>Permisos: <code>'+stripHtml(p.scope)+'</code></p>'+
    '<form method="post" action="/oauth/consent">'+hidden+
    '<label>Contraseña del propietario<input type="password" name="owner_password" autocomplete="current-password" required></label>'+
    '<button type="submit" name="decision" value="approve">Autorizar</button></form><p>Si no reconoces el cliente, cierra esta ventana.</p></main></html>');
  }catch{oauthError(res,"temporarily_unavailable",503);}
 });
 app.post("/oauth/consent",async(req:any,res:any)=>{
  try{
   const body=await parseOAuthBody(req);
   const p=await validatedAuthRequest(ctx,body);
   if(!p||body.decision!=="approve"){oauthError(res,"invalid_request");return;}
   const ip=String(req.socket?.remoteAddress||"default").slice(0,128);
   const now=Date.now(),old=throttle.get(ip);
   if(old&&old.until>now&&old.failures>=7){oauthError(res,"slow_down",429);return;}
   const password=bounded(body.owner_password,512);
   if(!await checkPassword(password,ctx.ownerPasswordHash)){
    const next=old&&old.until>now?old:{failures:0,until:now+900000};
    next.failures++;throttle.set(ip,next);
    if(throttle.size>512)throttle.clear();
    // Return a useful browser page while preserving 403 for security monitoring.
    // The retry URL only contains non-secret OAuth client request parameters.
    const retry=new URL("/authorize",ctx.config.issuer);
    for(const [k,v] of Object.entries({
      response_type:"code",client_id:p.id,redirect_uri:p.redirect,
      code_challenge:p.challenge,code_challenge_method:"S256",
      scope:p.scope,resource:p.resource,state:p.state
    }))retry.searchParams.set(k,v);
    res.set("Cache-Control","no-store");
    res.set("Content-Security-Policy","default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'");
    res.status(403).type("html").send(
      '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
      '<title>XanxitoSpA | Autorización denegada</title>'+
      '<style>body{background:#101827;color:#f9fbff;font:16px system-ui;display:grid;place-items:center;min-height:90vh}main{max-width:440px;background:#1b293d;padding:28px;border-radius:16px}a{display:inline-block;background:#4ae0bf;color:#101827;padding:12px;border-radius:8px;font-weight:700;text-decoration:none}</style>'+
      '<main><h2>Contraseña no válida</h2><p>La contraseña del propietario no coincide. Comprueba la variable XSPA_SELF_OAUTH_OWNER_PASSWORD en Railway y evita el autocompletado del navegador.</p>'+
      '<p>El cliente MCP no se ha autorizado. Puedes volver al formulario sin repetir la configuración.</p>'+
      '<a href="'+stripHtml(retry.toString())+'">Volver al formulario OAuth</a></main></html>');
    return;
   }
   throttle.delete(ip);
   const code=newSecret(36);
   await ctx.store.grant("authorization_code",code,{
    client_id:p.id,owner_subject:ctx.ownerSubject,scope:p.scope,resource:p.resource,
    redirect_uri:p.redirect,challenge:p.challenge
   },600);
   const location=new URL(p.redirect);
   location.searchParams.set("code",code);
   location.searchParams.set("iss",ctx.config.issuer);
   if(p.state)location.searchParams.set("state",p.state);
   res.set("Cache-Control","no-store").redirect(302,location.toString());
  }catch{oauthError(res,"temporarily_unavailable",503);}
 });
}