import {randomUUID} from "node:crypto";
import {describe,expect,it} from "vitest";
import {InMemoryCompanyStore,InMemoryWorkforceStore} from "../../../packages/database/src/index.js";
import {CompanyWorkforceOperations} from "./workforce-operations.js";

function harness(){
  const companyId=randomUUID(), storage=new InMemoryWorkforceStore(), works=new InMemoryCompanyStore();
  const workforce=new CompanyWorkforceOperations(companyId,storage,works);
  const alice={principal:"alice-sub",clientId:"chatgpt-client",scopes:["xspa.read","xspa.write"],authenticated:true};
  const bob={principal:"bob-sub",clientId:"claude-client",scopes:["xspa.read","xspa.write"],authenticated:true};
  const mallory={principal:"malicious-sub",clientId:"grok-client",scopes:["xspa.read","xspa.write"],authenticated:true};
  return {companyId,storage,works,workforce,alice,bob,mallory};
}
describe("Company-scoped multi-host Workforce",()=>{
  it("denies guest claims, wrong OAuth client, wrong subject and scope elevation",async()=>{
    const h=harness();
    await expect(h.workforce.register({hostHint:"claude",capabilities:[]},{...h.alice,authenticated:false})).rejects.toThrow("WORKFORCE_AUTHENTICATED_SUBJECT_REQUIRED");
    await expect(h.workforce.register({hostHint:"chatgpt",capabilities:[]},{principal:h.alice.principal,scopes:[...h.alice.scopes],authenticated:true})).rejects.toThrow("WORKFORCE_AUTHENTICATED_CLIENT_ID_REQUIRED");
    const x=await h.workforce.register({hostHint:"chatgpt",capabilities:[]},h.alice);
    const reused=await h.workforce.register({hostHint:"chatgpt",capabilities:[]},h.alice);
    expect(reused.workerId).toBe(x.workerId);
    await expect(h.workforce.pickup({workerId:x.workerId},h.bob)).rejects.toThrow("WORKFORCE_ACTOR_NOT_OWNED");
    await expect(h.workforce.pickup({workerId:x.workerId},{...h.alice,clientId:"other-client"})).rejects.toThrow("WORKFORCE_ACTOR_NOT_OWNED");
    await expect(h.workforce.pickup({workerId:x.workerId},{...h.alice,scopes:["xspa.read"]})).rejects.toThrow("WORKFORCE_OAUTH_SCOPE_REQUIRED");
  });
  it("delegates to a separately authenticated host, settles once and reports only to owners",async()=>{
    const h=harness(),a=await h.workforce.register({hostHint:"chatgpt",capabilities:["analysis"]},h.alice),b=await h.workforce.register({hostHint:"claude",capabilities:["review"]},h.bob);
    const workId=randomUUID();await h.works.saveWork({id:workId,companyId:h.companyId,owner:"executive",objective:"Analyze",scope:"read-only",createdAt:new Date().toISOString()});
    const input={sourceWorkerId:a.workerId,targetWorkerId:b.workerId,workId,instruction:"Review evidence but do not execute",idempotencyKey:"review-1"};
    await expect(h.workforce.delegate(input,h.alice)).rejects.toThrow("WORKFORCE_SENDER_NOT_ACCEPTED");
    await expect(h.workforce.allowSource({targetWorkerId:b.workerId,sourceWorkerId:a.workerId},h.alice)).rejects.toThrow("WORKFORCE_ACTOR_NOT_OWNED");
    await h.workforce.allowSource({targetWorkerId:b.workerId,sourceWorkerId:a.workerId},h.bob);
    await h.workforce.revokeSource({targetWorkerId:b.workerId,sourceWorkerId:a.workerId},h.bob);
    await expect(h.workforce.delegate(input,h.alice)).rejects.toThrow("WORKFORCE_SENDER_NOT_ACCEPTED");
    await h.workforce.allowSource({targetWorkerId:b.workerId,sourceWorkerId:a.workerId},h.bob);
    const queued=await h.workforce.delegate(input,h.alice);
    expect(queued.grantsAuthority).toBe(false);
    expect(queued.modelInvoked).toBe(false);
    expect((await h.workforce.delegate(input,h.alice)).delegationId).toBe(queued.delegationId);
    await expect(h.workforce.delegate({...input,instruction:"changed"},h.alice)).rejects.toThrow("WORKFORCE_IDEMPOTENCY_CONFLICT");
    await expect(h.workforce.delegate({...input,idempotencyKey:"attack"},h.mallory)).rejects.toThrow("WORKFORCE_ACTOR_NOT_OWNED");
    await expect(h.workforce.pickup({workerId:b.workerId},h.mallory)).rejects.toThrow("WORKFORCE_ACTOR_NOT_OWNED");
    const [p,q]=await Promise.all([h.workforce.pickup({workerId:b.workerId},h.bob),h.workforce.pickup({workerId:b.workerId},h.bob)]);
    expect([p.state,q.state].sort()).toEqual(["claimed","empty"]);
    const claimed=p.state==="claimed"?p:q;
    if(claimed.state!=="claimed")throw Error("unreachable");
    await expect(h.workforce.settle({workerId:b.workerId,delegationId:queued.delegationId,leaseGeneration:claimed.leaseGeneration!+1,resultText:"fake",failed:false},h.bob)).rejects.toThrow("WORKFORCE_LEASE_NOT_CURRENT");
    expect((await h.workforce.renew({workerId:b.workerId,delegationId:queued.delegationId,leaseGeneration:claimed.leaseGeneration!},h.bob)).renewed).toBe(true);
    await h.workforce.settle({workerId:b.workerId,delegationId:queued.delegationId,leaseGeneration:claimed.leaseGeneration!,resultText:"Evidence checked",failed:false},h.bob);
    expect((await h.workforce.receipt(queued.delegationId,h.alice)).resultText).toBe("Evidence checked");
    await expect(h.workforce.receipt(queued.delegationId,h.mallory)).rejects.toThrow("WORKFORCE_RECEIPT_DENIED");
    await expect(h.workforce.settle({workerId:b.workerId,delegationId:queued.delegationId,leaseGeneration:claimed.leaseGeneration!,resultText:"twice",failed:false},h.bob)).rejects.toThrow("WORKFORCE_LEASE_NOT_CURRENT");
  });
  it("recovers expired leases with a new generation, rejects stale worker and wrong Company work",async()=>{
    const h=harness(),a=await h.workforce.register({hostHint:"grok",capabilities:[]},h.alice),b=await h.workforce.register({hostHint:"gemini",capabilities:[]},h.bob);
    const workId=randomUUID();const input={sourceWorkerId:a.workerId,targetWorkerId:b.workerId,workId,instruction:"Review",idempotencyKey:"repeat"};
    await h.workforce.allowSource({targetWorkerId:b.workerId,sourceWorkerId:a.workerId},h.bob);
    await expect(h.workforce.delegate(input,h.alice)).rejects.toThrow("WORKFORCE_UNKNOWN_COMPANY_WORK");
    await h.works.saveWork({id:workId,companyId:h.companyId,owner:"executive",objective:"Task",scope:"analysis",createdAt:new Date().toISOString()});
    await h.workforce.allowSource({targetWorkerId:b.workerId,sourceWorkerId:a.workerId},h.bob);
    const item=await h.workforce.delegate(input,h.alice);
    const first=await h.workforce.pickup({workerId:b.workerId},h.bob);if(first.state!=="claimed")throw Error("claim failed");
    const stored=h.storage.queue.get(h.companyId+":"+item.delegationId)!;stored.leaseUntil=new Date(Date.now()-2000).toISOString();
    const second=await h.workforce.pickup({workerId:b.workerId},h.bob);if(second.state!=="claimed")throw Error("reclaim failed");
    expect(second.leaseGeneration!).toBe(first.leaseGeneration!+1);
    await expect(h.workforce.settle({workerId:b.workerId,delegationId:item.delegationId,leaseGeneration:first.leaseGeneration!,resultText:"stale",failed:false},h.bob)).rejects.toThrow("WORKFORCE_LEASE_NOT_CURRENT");
    await h.workforce.settle({workerId:b.workerId,delegationId:item.delegationId,leaseGeneration:second.leaseGeneration!,resultText:"done",failed:false},h.bob);
    expect((await h.workforce.receipt(item.delegationId,h.bob)).state).toBe("completed");
  });
});
