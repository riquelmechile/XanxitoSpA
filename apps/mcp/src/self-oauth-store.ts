import { createHash, randomBytes } from "node:crypto";
import type { PostgresDatabase } from "../../../packages/database/src/postgres.js";

export type Grant = { client_id:string; owner_subject:string; redirect_uri:string; challenge:string; scope:string; resource:string };
export type OAuthClient = { client_id:string; name:string; redirect_uris:string[] };
const hash = (v:string) => createHash("sha256").update(v).digest("hex");
export const randomSecret = (n=32) => randomBytes(n).toString("base64url");
export class SelfOAuthStore {
 constructor(private readonly db:PostgresDatabase,private readonly companyId:string){}
 async getClient(id:string):Promise<OAuthClient|null>{
  return this.db.withCompanyTransaction(this.companyId,async c=>{
   const r=await c.query<OAuthClient>("SELECT client_id,name,redirect_uris FROM xspa.oauth_clients WHERE company_id=$1 AND client_id=$2",[this.companyId,id]);
   return r.rows[0]??null;
  });
 }
 async register(name:string,uris:string[]):Promise<OAuthClient>{
  return this.db.withCompanyTransaction(this.companyId,async c=>{
   const r=await c.query<{count:number}>("SELECT count(*)::integer AS count FROM xspa.oauth_clients WHERE company_id=$1",[this.companyId]);
   if((r.rows[0]?.count??0)>=100)throw Error("OAUTH_CLIENT_LIMIT");
   const client_id="xspa-"+randomSecret(16);
   await c.query("INSERT INTO xspa.oauth_clients(company_id,client_id,name,redirect_uris) VALUES($1,$2,$3,$4::jsonb)",[this.companyId,client_id,name,JSON.stringify(uris)]);
   return {client_id,name,redirect_uris:uris};
  });
 }
 async grant(kind:"authorization_code"|"refresh_token",secret:string,data:Grant,ttl:number):Promise<void>{
  await this.db.withCompanyTransaction(this.companyId,async c=>{
   await c.query("INSERT INTO xspa.oauth_grants(company_id,token_hash,grant_type,client_id,owner_subject,scope,resource,redirect_uri,challenge,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now()+($10::integer*interval '1 second'))",[this.companyId,hash(secret),kind,data.client_id,data.owner_subject,data.scope,data.resource,data.redirect_uri,data.challenge,ttl]);
  });
 }
 async consume(kind:"authorization_code"|"refresh_token",secret:string,clientId:string,match?:{redirect:string;challenge:string}):Promise<Grant|null>{
  return this.db.withCompanyTransaction(this.companyId,async c=>{
   const r=await c.query<Grant>("DELETE FROM xspa.oauth_grants WHERE company_id=$1 AND token_hash=$2 AND grant_type=$3 AND client_id=$4 AND expires_at>now() AND ($5::text IS NULL OR redirect_uri=$5) AND ($6::text IS NULL OR challenge=$6) RETURNING client_id,owner_subject,redirect_uri,challenge,scope,resource",[this.companyId,hash(secret),kind,clientId,match?.redirect??null,match?.challenge??null]);
   return r.rows[0]??null;
  });
 }
 async revokeRefresh(clientId:string,token:string):Promise<boolean>{
  return this.db.withCompanyTransaction(this.companyId,async c=>{
   const r=await c.query("DELETE FROM xspa.oauth_grants WHERE company_id=$1 AND token_hash=$2 AND client_id=$3 AND grant_type='refresh_token'",[this.companyId,hash(token),clientId]);return r.rowCount===1;
  });
 }
}