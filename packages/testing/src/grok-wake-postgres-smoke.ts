import {randomUUID} from "node:crypto";
import {PostgresDatabase,PostgresCompanyStore} from "../../database/src/postgres.js";
import {PostgresWorkforceStore} from "../../database/src/workforce.js";
import {PostgresGrokWakeOutbox,dispatchGrokWakeOnce,loadGrokWakeConfig,type GrokWakeConfig} from "../../../apps/mcp/src/grok-wake.js";

function check(value:unknown,message:string):asserts value {if(!value)throw Error(message);}
const dsn=process.env.XSPA_TEST_DATABASE_URL;
if(!dsn||!["localhost","127.0.0.1"].includes(new URL(dsn).hostname))throw Error("Loopback CI PostgreSQL required");
const db=new PostgresDatabase(dsn);
try {
 await db.migrate();
 const companyId=randomUUID(),foreignId=randomUUID(),workId=randomUUID();
 await db.ensureCompany(companyId,"Grok Wake Smoke","v1");
 await db.ensureCompany(foreignId,"Foreign Wake Smoke","v1");
 const works=new PostgresCompanyStore(db);
 await works.saveWork({id:workId,companyId,owner:"smoke",objective:"Wake test",scope:"diagnostic",createdAt:new Date().toISOString()});
 const original=new PostgresWorkforceStore(db);
 const source=await original.register(companyId,"sender","chatgpt",[]);
 const target=await original.register(companyId,"recipient","grok-bot",[]);
 await original.allowSource(companyId,target.id,source.id);
 const baseEnv:NodeJS.ProcessEnv={
   XSPA_GROK_WAKE_ENABLED:"true",XSPA_GROK_WAKE_WORKER_ID:target.id,
   XSPA_GROK_WAKE_URL:"https://api2.cursor.sh/routine-test",
 };
 const opaque="opaqueNativeKey1234567890/+-_=";
 const native=loadGrokWakeConfig({...baseEnv,XSPA_GROK_WAKE_SECRET:opaque},companyId,true,true);
 const readyHeader=loadGrokWakeConfig({...baseEnv,XSPA_GROK_WAKE_SECRET:"Authorization: Bearer "+opaque},companyId,true,true);
 const directHeader=loadGrokWakeConfig({...baseEnv,XSPA_GROK_WAKE_SECRET:"Bearer "+opaque},companyId,true,true);
 check(native?.senderKey===opaque && readyHeader?.senderKey===opaque && directHeader?.senderKey===opaque,
   "Opaque key and copied Cursor Bearer header must normalize identically");
 let injectionBlocked=false;
 try{loadGrokWakeConfig({...baseEnv,XSPA_GROK_WAKE_SECRET:"Bearer "+opaque+"\\r\\nOther: bad"},companyId,true,true);}
 catch{injectionBlocked=true;}
 check(injectionBlocked,"HTTP header injection must be blocked");
 const active=new PostgresWorkforceStore(db,target.id);
 const item={id:randomUUID(),companyId,sourceWorkerId:source.id,targetWorkerId:target.id,workId,
  instruction:"INTERNAL_ONLY",idempotencyKey:"test-wake-idem",fingerprint:"test-wake-fingerprint",
  state:"pending" as const,leaseGeneration:0,leaseUntil:null,resultText:null,createdAt:new Date().toISOString()};
 // A disconnected previous manual test must not hijack this Routine wake.
 const oldPending=await original.delegate({...item,id:randomUUID(),
   fingerprint:"legacy-unsignaled-fingerprint",idempotencyKey:"legacy-unsignaled"});
 const first=await active.delegate(item);
 const second=await active.delegate({...item,id:randomUUID()});
 check(first.id===second.id,"duplicate queued work");
 const outbox=new PostgresGrokWakeOutbox(db,companyId);
 const config:GrokWakeConfig={companyId,workerId:target.id,
  webhookUrl:"https://api2.cursor.sh/fixture",senderKey:"test-placeholder",intervalMs:4000};
 let payload="";
 const sent=await dispatchGrokWakeOnce(config,outbox,async (_url,init)=>{
   payload=String(init.body);return {status:202};
 });
 check(sent.state==="signal_accepted"&&sent.delegationId===first.id,"routine signal rejected");
 check(payload.includes(first.id)&&!payload.includes(item.instruction),"instruction escaped pointer-only wake");
 const accepted=await outbox.status(first.id) as {state:string;modelExecutionObserved:boolean};
 check(accepted.state==="accepted"&&!accepted.modelExecutionObserved,"HTTP 2xx falsely proved execution");
 const repeated=await dispatchGrokWakeOnce(config,outbox,async()=>{throw Error("unexpected retry")});
 check(repeated.state==="idle","accepted wake sent again");
 const claim=await active.pickup(companyId,target.id,30000);
 check(claim?.id===first.id&&claim.leaseGeneration===1,"target failed to prioritize webhook-signaled work");
 check((await original.receipt(companyId,oldPending.id))?.state==="pending",
   "an older unsignaled delegation stole the webhook claim");
 const observed=await outbox.status(first.id) as {state:string;wakeObservedAt:string|null;modelExecutionObserved:boolean};
 check(observed.state==="observed"&&!!observed.wakeObservedAt&&!observed.modelExecutionObserved,"pickup evidence missing");
 const other=await new PostgresGrokWakeOutbox(db,foreignId).status(first.id) as {state:string};
 check(other.state==="not-configured","tenant isolation broken");
 console.log("PASS Grok wake: atomic outbox, pointer-only HTTP 202, retry dedupe, OAuth-bound pickup observation and RLS");
}finally{await db.close();}
