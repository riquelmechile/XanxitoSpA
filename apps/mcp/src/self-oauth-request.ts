import type { HostedOAuthContext } from "./self-oauth.js";
import { oauthRedirectAllowed } from "./self-oauth-core.js";

export const bounded=(value:unknown,max=400)=>typeof value==="string"&&value.length<=max?value:"";
export const oauthError=(res:any,code:string,status=400)=>{
 res.set("Cache-Control","no-store").status(status).json({error:code});
};
export async function parseOAuthBody(req:any):Promise<Record<string,unknown>>{
 const typ=String(req.headers["content-type"]||"").split(";")[0].trim().toLowerCase();
 if(typ==="application/json")return req.body&&typeof req.body==="object"&&!Array.isArray(req.body)?req.body:{};
 if(typ!=="application/x-www-form-urlencoded")return {};
 const chunks:Buffer[]=[];let size=0;
 for await (const part of req){size+=part.length;if(size>8192)throw Error("OAUTH_BODY_TOO_LARGE");chunks.push(part);}
 const body:Record<string,unknown>={};
 const params=new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
 for(const [k,v]of params){if(k in body)throw Error("OAUTH_DUPLICATE_PARAMETER");body[k]=v;}
 return body;
}
export async function validatedAuthRequest(ctx:HostedOAuthContext,form:Record<string,unknown>){
 const id=bounded(form.client_id,240),redirect=bounded(form.redirect_uri,1500);
 const challenge=bounded(form.code_challenge,128),state=bounded(form.state,600);
 const resource=bounded(form.resource,1500)||ctx.config.resource;
 const scope=bounded(form.scope,200)||"xspa.read";
 const scopes=scope.split(/\s+/).filter(Boolean);
 if(form.response_type!=="code"||form.code_challenge_method!=="S256"||
    !/^[A-Za-z0-9_-]{43}$/.test(challenge)||
    !oauthRedirectAllowed(redirect)||resource!==ctx.config.resource||
    !scopes.length||scopes.some(s=>s!=="xspa.read"&&s!=="xspa.write"))return null;
 const client=await ctx.store.getClient(id);
 if(!client||!client.redirect_uris.includes(redirect))return null;
 return {id,redirect,challenge,state,scope:[...new Set(scopes)].join(" "),resource,client};
}