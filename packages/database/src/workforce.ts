import { randomUUID } from "node:crypto";
import type { PostgresDatabase } from "./postgres.js";

export type MeshState = "pending" | "running" | "completed" | "failed";
export interface MeshWorker { id: string; companyId: string; ownerKey: string; hostHint: string; capabilities: string[]; }
export interface MeshWork {
  id:string; companyId:string; sourceWorkerId:string; targetWorkerId:string; workId:string;
  idempotencyKey:string; fingerprint:string; instruction:string; state:MeshState;
  leaseGeneration:number; leaseUntil:string|null; resultText:string|null; createdAt:string;
}
export interface WorkforceStore {
  register(companyId:string,ownerKey:string,hostHint:string,capabilities:string[]):Promise<MeshWorker>;
  workers(companyId:string):Promise<MeshWorker[]>;
  worker(companyId:string,id:string):Promise<MeshWorker|null>;
  delegate(item:MeshWork):Promise<MeshWork>;
  receipt(companyId:string,id:string):Promise<MeshWork|null>;
  pickup(companyId:string,targetId:string,leaseMs:number):Promise<MeshWork|null>;
  settle(companyId:string,id:string,targetId:string,generation:number,result:string,failed:boolean):Promise<boolean>;
  renew(companyId:string,id:string,targetId:string,generation:number,leaseMs:number):Promise<boolean>;
}
const clone=<T>(x:T):T=>structuredClone(x);
export class InMemoryWorkforceStore implements WorkforceStore {
  readonly actors=new Map<string,MeshWorker>();
  readonly queue=new Map<string,MeshWork>();
  async register(companyId:string,ownerKey:string,hostHint:string,capabilities:string[]):Promise<MeshWorker>{
    const a={id:randomUUID(),companyId,ownerKey,hostHint,capabilities:[...capabilities]};this.actors.set(companyId+":"+a.id,a);return clone(a);
  }
  async workers(companyId:string){return [...this.actors.values()].filter(x=>x.companyId===companyId).map(clone);}
  async worker(companyId:string,id:string){return clone(this.actors.get(companyId+":"+id)??null);}
  async delegate(item:MeshWork):Promise<MeshWork>{
    const prior=[...this.queue.values()].find(x=>x.companyId===item.companyId&&x.sourceWorkerId===item.sourceWorkerId&&x.idempotencyKey===item.idempotencyKey);
    if(prior){if(prior.fingerprint!==item.fingerprint)throw Error("WORKFORCE_IDEMPOTENCY_CONFLICT");return clone(prior);}
    this.queue.set(item.companyId+":"+item.id,clone(item));return clone(item);
  }
  async receipt(companyId:string,id:string){return clone(this.queue.get(companyId+":"+id)??null);}
  async pickup(companyId:string,targetId:string,leaseMs:number){
    const now=Date.now();const job=[...this.queue.values()].filter(x=>x.companyId===companyId&&x.targetWorkerId===targetId&&(x.state==="pending"||(x.state==="running"&&Boolean(x.leaseUntil)&&Date.parse(x.leaseUntil!)<=now))).sort((a,b)=>a.createdAt.localeCompare(b.createdAt))[0];
    if(!job)return null;job.state="running";job.leaseGeneration++;job.leaseUntil=new Date(now+leaseMs).toISOString();return clone(job);
  }
  async settle(companyId:string,id:string,targetId:string,generation:number,result:string,failed:boolean){
    const x=this.queue.get(companyId+":"+id);
    if(!x||x.targetWorkerId!==targetId||x.state!=="running"||x.leaseGeneration!==generation||!x.leaseUntil||Date.parse(x.leaseUntil)<=Date.now())return false;
    x.state=failed?"failed":"completed";x.leaseUntil=null;x.resultText=result;return true;
  }
  async renew(companyId:string,id:string,targetId:string,generation:number,leaseMs:number){
    const x=this.queue.get(companyId+":"+id);
    if(!x||x.targetWorkerId!==targetId||x.state!=="running"||x.leaseGeneration!==generation||!x.leaseUntil||Date.parse(x.leaseUntil)<=Date.now())return false;
    x.leaseUntil=new Date(Date.now()+leaseMs).toISOString();return true;
  }
}
type ActorRow={company_id:string;worker_id:string;owner_key:string;host_hint:string;capabilities:string[]};
type WorkRow={company_id:string;delegation_id:string;source_worker_id:string;target_worker_id:string;work_id:string;idempotency_key:string;fingerprint:string;instruction:string;state:MeshState;lease_generation:string;lease_until:Date|null;result_text:string|null;created_at:Date};
const actor=(r:ActorRow):MeshWorker=>({id:r.worker_id,companyId:r.company_id,ownerKey:r.owner_key,hostHint:r.host_hint,capabilities:r.capabilities});
const work=(r:WorkRow):MeshWork=>({id:r.delegation_id,companyId:r.company_id,sourceWorkerId:r.source_worker_id,targetWorkerId:r.target_worker_id,workId:r.work_id,idempotencyKey:r.idempotency_key,fingerprint:r.fingerprint,instruction:r.instruction,state:r.state,leaseGeneration:Number(r.lease_generation),leaseUntil:r.lease_until?new Date(r.lease_until).toISOString():null,resultText:r.result_text,createdAt:new Date(r.created_at).toISOString()});
export class PostgresWorkforceStore implements WorkforceStore {
  constructor(private readonly db:PostgresDatabase){}
  async register(companyId:string,ownerKey:string,hostHint:string,capabilities:string[]){
    return this.db.withCompanyTransaction(companyId,async c=>actor((await c.query<ActorRow>("INSERT INTO xspa.workforce_workers(company_id,worker_id,owner_key,host_hint,capabilities) VALUES($1,$2,$3,$4,$5::jsonb) RETURNING *",[companyId,randomUUID(),ownerKey,hostHint,JSON.stringify(capabilities)])).rows[0]!));
  }
  async workers(companyId:string){
    return this.db.withCompanyTransaction(companyId,async c=>(await c.query<ActorRow>("SELECT * FROM xspa.workforce_workers WHERE company_id=$1 ORDER BY registered_at,worker_id",[companyId])).rows.map(actor));
  }
  async worker(companyId:string,id:string){
    return this.db.withCompanyTransaction(companyId,async c=>{const r=await c.query<ActorRow>("SELECT * FROM xspa.workforce_workers WHERE company_id=$1 AND worker_id=$2",[companyId,id]);return r.rows[0]?actor(r.rows[0]):null;});
  }
  async delegate(a:MeshWork){
    return this.db.withCompanyTransaction(a.companyId,async c=>{
      const r=await c.query<WorkRow>(`INSERT INTO xspa.workforce_delegations(company_id,delegation_id,source_worker_id,target_worker_id,work_id,idempotency_key,fingerprint,instruction,state)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,'pending') ON CONFLICT(company_id,source_worker_id,idempotency_key) DO NOTHING RETURNING *`,
      [a.companyId,a.id,a.sourceWorkerId,a.targetWorkerId,a.workId,a.idempotencyKey,a.fingerprint,a.instruction]);
      if(r.rows[0])return work(r.rows[0]);
      const old=await c.query<WorkRow>("SELECT * FROM xspa.workforce_delegations WHERE company_id=$1 AND source_worker_id=$2 AND idempotency_key=$3",[a.companyId,a.sourceWorkerId,a.idempotencyKey]);
      if(!old.rows[0]||old.rows[0].fingerprint!==a.fingerprint)throw Error("WORKFORCE_IDEMPOTENCY_CONFLICT");
      return work(old.rows[0]);
    });
  }
  async receipt(companyId:string,id:string){
    return this.db.withCompanyTransaction(companyId,async c=>{const r=await c.query<WorkRow>("SELECT * FROM xspa.workforce_delegations WHERE company_id=$1 AND delegation_id=$2",[companyId,id]);return r.rows[0]?work(r.rows[0]):null;});
  }
  async pickup(companyId:string,targetId:string,leaseMs:number){
    return this.db.withCompanyTransaction(companyId,async c=>{
      const r=await c.query<WorkRow>(`WITH candidate AS(SELECT delegation_id FROM xspa.workforce_delegations
      WHERE company_id=$1 AND target_worker_id=$2 AND (state='pending' OR(state='running' AND lease_until<=now()))
      ORDER BY created_at,delegation_id FOR UPDATE SKIP LOCKED LIMIT 1)
      UPDATE xspa.workforce_delegations w SET state='running',lease_generation=w.lease_generation+1,
      lease_until=now()+($3::int*interval '1 millisecond'),updated_at=now() FROM candidate
      WHERE w.company_id=$1 AND w.delegation_id=candidate.delegation_id RETURNING w.*`,[companyId,targetId,leaseMs]);
      return r.rows[0]?work(r.rows[0]):null;
    });
  }
  async settle(companyId:string,id:string,targetId:string,generation:number,result:string,failed:boolean){
    return this.db.withCompanyTransaction(companyId,async c=>(await c.query(`UPDATE xspa.workforce_delegations SET state=$5,result_text=$6,lease_until=NULL,updated_at=now()
      WHERE company_id=$1 AND delegation_id=$2 AND target_worker_id=$3 AND lease_generation=$4 AND state='running' AND lease_until>now()`,[companyId,id,targetId,generation,failed?"failed":"completed",result])).rowCount===1);
  }
  async renew(companyId:string,id:string,targetId:string,generation:number,leaseMs:number){
    return this.db.withCompanyTransaction(companyId,async c=>(await c.query(`UPDATE xspa.workforce_delegations SET lease_until=now()+($5::int*interval '1 millisecond'),updated_at=now()
      WHERE company_id=$1 AND delegation_id=$2 AND target_worker_id=$3 AND lease_generation=$4 AND state='running' AND lease_until>now()`,[companyId,id,targetId,generation,leaseMs])).rowCount===1);
  }
}
