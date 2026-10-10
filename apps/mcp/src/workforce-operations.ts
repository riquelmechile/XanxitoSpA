import { createHash, randomUUID } from "node:crypto";
import type { CompanyStore, WorkforceStore, MeshWorker, MeshWork } from "../../../packages/database/src/index.js";

export interface WorkforceCaller { principal:string; scopes:string[]; authenticated?:boolean; clientId?:string; }
export interface WorkforceRegisterInput { hostHint:string; capabilities:string[]; }
export interface WorkforceDelegateInput { sourceWorkerId:string; targetWorkerId:string; workId:string; instruction:string; idempotencyKey:string; }
export interface WorkforceClaimInput { workerId:string; }
export interface WorkforceSettleInput extends WorkforceClaimInput { delegationId:string; leaseGeneration:number; resultText:string; failed:boolean; }
export interface WorkforceRenewInput extends WorkforceClaimInput { delegationId:string; leaseGeneration:number; }

export class CompanyWorkforceOperations {
  constructor(private readonly companyId:string,private readonly store:WorkforceStore,private readonly workStore:Pick<CompanyStore,"getWork">){}
  private identity(ctx:WorkforceCaller,write:boolean):string {
    if(!ctx.authenticated||!ctx.principal||ctx.principal==="chatgpt-app-user")throw Error("WORKFORCE_AUTHENTICATED_SUBJECT_REQUIRED");
    if(!ctx.scopes.includes(write?"xspa.write":"xspa.read"))throw Error("WORKFORCE_OAUTH_SCOPE_REQUIRED");
    if(!ctx.clientId?.trim())throw Error("WORKFORCE_AUTHENTICATED_CLIENT_ID_REQUIRED");
    return createHash("sha256").update(JSON.stringify([this.companyId,ctx.principal,ctx.clientId??""])).digest("hex");
  }
  private async owned(workerId:string,key:string):Promise<MeshWorker> {
    const worker=await this.store.worker(this.companyId,workerId);
    if(!worker||worker.ownerKey!==key)throw Error("WORKFORCE_ACTOR_NOT_OWNED");
    return worker;
  }
  async register(input:WorkforceRegisterInput,ctx:WorkforceCaller){
    const key=this.identity(ctx,true);
    const worker=await this.store.register(this.companyId,key,input.hostHint,input.capabilities);
    return { workerId:worker.id,hostHint:worker.hostHint,capabilities:worker.capabilities,identityBound:true,hostVerified:false,grantsAuthority:false,grantsBudget:false };
  }
  async workers(ctx:WorkforceCaller){
    const key=this.identity(ctx,false);
    return {workers:(await this.store.workers(this.companyId)).map(x=>({workerId:x.id,hostHint:x.hostHint,hostVerified:false,capabilities:x.capabilities,capabilitiesVerified:false,owned:x.ownerKey===key})),companyScoped:true};
  }
  async allowSource(input:{targetWorkerId:string;sourceWorkerId:string},ctx:WorkforceCaller){
    const key=this.identity(ctx,true);await this.owned(input.targetWorkerId,key);
    if(!await this.store.worker(this.companyId,input.sourceWorkerId))throw Error("WORKFORCE_UNKNOWN_SOURCE");
    await this.store.allowSource(this.companyId,input.targetWorkerId,input.sourceWorkerId);
    return {targetWorkerId:input.targetWorkerId,sourceWorkerId:input.sourceWorkerId,accepted:true,grantsAuthority:false};
  }
  async revokeSource(input:{targetWorkerId:string;sourceWorkerId:string},ctx:WorkforceCaller){
    const key=this.identity(ctx,true);await this.owned(input.targetWorkerId,key);
    await this.store.revokeSource(this.companyId,input.targetWorkerId,input.sourceWorkerId);
    return {targetWorkerId:input.targetWorkerId,sourceWorkerId:input.sourceWorkerId,accepted:false,grantsAuthority:false};
  }
  async delegate(input:WorkforceDelegateInput,ctx:WorkforceCaller){
    const key=this.identity(ctx,true);
    await this.owned(input.sourceWorkerId,key);
    const target=await this.store.worker(this.companyId,input.targetWorkerId);
    if(!target)throw Error("WORKFORCE_UNKNOWN_TARGET");
    if(target.ownerKey!==key && !(await this.store.sourceAllowed(this.companyId,input.targetWorkerId,input.sourceWorkerId)))throw Error("WORKFORCE_SENDER_NOT_ACCEPTED");
    const work=await this.workStore.getWork(this.companyId,input.workId);
    if(!work)throw Error("WORKFORCE_UNKNOWN_COMPANY_WORK");
    const fingerprint=createHash("sha256").update(JSON.stringify([input.sourceWorkerId,input.targetWorkerId,input.workId,input.instruction])).digest("hex");
    const item:MeshWork={id:randomUUID(),companyId:this.companyId,sourceWorkerId:input.sourceWorkerId,targetWorkerId:input.targetWorkerId,workId:input.workId,idempotencyKey:input.idempotencyKey,fingerprint,instruction:input.instruction,state:"pending",leaseGeneration:0,leaseUntil:null,resultText:null,createdAt:new Date().toISOString()};
    const saved=await this.store.delegate(item);
    return {delegationId:saved.id,state:saved.state,targetWorkerId:saved.targetWorkerId,workId:saved.workId,grantsAuthority:false,grantsBudget:false,modelInvoked:false};
  }
  async pickup(input:WorkforceClaimInput,ctx:WorkforceCaller){
    const key=this.identity(ctx,true);await this.owned(input.workerId,key);
    const item=await this.store.pickup(this.companyId,input.workerId,30*60_000);
    if(!item)return {state:"empty"};
    return {state:"claimed",delegationId:item.id,sourceWorkerId:item.sourceWorkerId,workId:item.workId,instruction:item.instruction,leaseGeneration:item.leaseGeneration,leaseUntil:item.leaseUntil,grantsAuthority:false,modelInvoked:false};
  }
  async receipt(delegationId:string,ctx:WorkforceCaller){
    const key=this.identity(ctx,false);
    const item=await this.store.receipt(this.companyId,delegationId);
    if(!item)return {state:"not-found"};
    const source=await this.store.worker(this.companyId,item.sourceWorkerId);
    const target=await this.store.worker(this.companyId,item.targetWorkerId);
    if(source?.ownerKey!==key&&target?.ownerKey!==key)throw Error("WORKFORCE_RECEIPT_DENIED");
    // Include sanitized wake evidence in the already-authorized Workforce
    // receipt so text-only OAuth host connectors can diagnose Routine delivery
    // without requiring a plugin reconnect for a newly added tool.
    const wake=await this.store.wakeStatus?.(this.companyId,delegationId);
    return {delegationId:item.id,state:item.state,workId:item.workId,sourceWorkerId:item.sourceWorkerId,targetWorkerId:item.targetWorkerId,leaseGeneration:item.leaseGeneration,leaseUntil:item.leaseUntil,resultText:item.resultText,...(wake?{wake}:{})};
  }
  async settle(input:WorkforceSettleInput,ctx:WorkforceCaller){
    const key=this.identity(ctx,true);await this.owned(input.workerId,key);
    if(!Number.isSafeInteger(input.leaseGeneration)||input.leaseGeneration<1)throw Error("WORKFORCE_INVALID_LEASE");
    const ok=await this.store.settle(this.companyId,input.delegationId,input.workerId,input.leaseGeneration,input.resultText,input.failed);
    if(!ok)throw Error("WORKFORCE_LEASE_NOT_CURRENT");
    return {delegationId:input.delegationId,state:input.failed?"failed":"completed",leaseGeneration:input.leaseGeneration,grantsAuthority:false};
  }
  async wakeStatus(delegationId:string,ctx:WorkforceCaller){
    // Delegation receipt has already enforced OAuth ownership for source/target.
    const receipt=await this.receipt(delegationId,ctx);
    if(receipt.state==="not-found")return receipt;
    const status=await this.store.wakeStatus?.(this.companyId,delegationId);
    return {delegationId, ...(status??{state:"not-configured",attempts:0,modelExecutionObserved:false}),
      companyScoped:true,grantsAuthority:false,grantsBudget:false};
  }
  async renew(input:WorkforceRenewInput,ctx:WorkforceCaller){
    const key=this.identity(ctx,true);await this.owned(input.workerId,key);
    if(!Number.isSafeInteger(input.leaseGeneration)||input.leaseGeneration<1)throw Error("WORKFORCE_INVALID_LEASE");
    if(!await this.store.renew(this.companyId,input.delegationId,input.workerId,input.leaseGeneration,30*60_000))throw Error("WORKFORCE_LEASE_NOT_CURRENT");
    return {delegationId:input.delegationId,leaseGeneration:input.leaseGeneration,renewed:true};
  }
}
