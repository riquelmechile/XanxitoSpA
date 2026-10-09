import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { importJWK, SignJWT, type JWK } from "jose";

const scrypt=promisify(scryptCb);
const base64=(b:Buffer)=>b.toString("base64url");
export function createPasswordHash(password:string):Promise<string>{
 if(password.length<20)throw Error("OAuth Owner password must have at least 20 characters");
 const salt=randomBytes(24);
 return scrypt(password,salt,32,{N:1<<15,maxmem:64*1024*1024}).then(key=>"scrypt-v1."+base64(salt)+"."+base64(key as Buffer));
}
export async function checkPassword(password:string,stored:string):Promise<boolean>{
 const [name,saltText,digestText]=stored.split(".");
 if(name!=="scrypt-v1"||!saltText||!digestText)return false;
 try{
  const salt=Buffer.from(saltText,"base64url"),digest=Buffer.from(digestText,"base64url");
  if(salt.length!==24||digest.length!==32)return false;
  const actual=await scrypt(password,salt,32,{N:1<<15,maxmem:64*1024*1024}) as Buffer;
  return timingSafeEqual(actual,digest);
 }catch{return false;}
}
export function oauthRedirectAllowed(input:string):boolean{
 try{
  const u=new URL(input);
  if(u.username||u.password||u.hash||input.length>1500)return false;
  if(u.protocol==="https:")return true;
  return u.protocol==="http:"&&["localhost","127.0.0.1","[::1]"].includes(u.hostname);
 }catch{return false;}
}
export const pkceS256=(verifier:string)=>createHash("sha256").update(verifier).digest("base64url");
export const newSecret=(len=32)=>base64(randomBytes(len));
export const stripHtml=(value:string)=>value.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;");
export class OAuthSigner {
 readonly jwks:{keys:JWK[]};
 private readonly signingKey;
 constructor(jwk:JWK){
  if(jwk.kty!=="OKP"||jwk.crv!=="Ed25519"||typeof jwk.d!=="string"||typeof jwk.x!=="string")throw Error("OAUTH_SIGNING_KEY_MUST_BE_ED25519_PRIVATE_JWK");
  const {d:_private,...pub}=jwk;
  this.jwks={keys:[{...pub,kid:jwk.kid||"xspa-key-1",use:"sig",alg:"EdDSA"}]};
  this.signingKey=importJWK(jwk,"EdDSA");
 }
 async jwt(issuer:string,resource:string,subject:string,clientId:string,scope:string):Promise<string>{
  return new SignJWT({scope,client_id:clientId})
   .setProtectedHeader({alg:"EdDSA",kid:this.jwks.keys[0]?.kid,typ:"at+jwt"})
   .setIssuer(issuer).setSubject(subject).setAudience(resource)
   .setIssuedAt().setExpirationTime("15m").setJti(newSecret(16))
   .sign(await this.signingKey);
 }
}