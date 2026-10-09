import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { generateKeyPair,exportJWK,SignJWT } from "jose";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { listenXspaMcp } from "../../../apps/mcp/src/server.js";
import { EnvironmentXspaAppOperations } from "../../../apps/mcp/src/runtime.js";
import { CompanyWorkforceOperations } from "../../../apps/mcp/src/workforce-operations.js";
import { InMemoryCompanyStore,InMemoryRuntimeStore,InMemoryWorkforceStore } from "../../database/src/index.js";

function assert(x:unknown,message:string):asserts x{if(!x)throw Error(message);}
type ToolResult={isError?:boolean;structuredContent?:Record<string,unknown>;content?:unknown};
function output(result:ToolResult):Record<string,unknown> {
  assert(result.isError!==true,"MCP error: "+JSON.stringify(result.content));
  assert(result.structuredContent && typeof result.structuredContent==="object","missing structured MCP result");
  return result.structuredContent;
}
export async function verifyMultiHostOAuth():Promise<void>{
 const {publicKey,privateKey}=await generateKeyPair("RS256");
 const jwk=await exportJWK(publicKey);Object.assign(jwk,{kid:"xspa-mesh-smoke",alg:"RS256",use:"sig"});
 const jwksServer=createServer((req,res)=>{
   if(req.url!=="/jwks"){res.writeHead(404).end();return;}
   res.setHeader("content-type","application/json");res.end(JSON.stringify({keys:[jwk]}));
 });
 await new Promise<void>(resolve=>jwksServer.listen(0,"127.0.0.1",resolve));
 const issuer="http://127.0.0.1:"+(jwksServer.address() as AddressInfo).port;
 const resource="http://127.0.0.1:56789";
 const companyId=randomUUID(), workId=randomUUID();
 const workStore=new InMemoryCompanyStore();
 const runtimeStore=new InMemoryRuntimeStore();
 const meshStore=new InMemoryWorkforceStore();
 const workforce=new CompanyWorkforceOperations(companyId,meshStore,workStore);
 const operations=new EnvironmentXspaAppOperations({store:runtimeStore,workStore,workforce,companyId,databaseConfigured:true,creativeConfigured:false,kastConfigured:false});
 const http=await listenXspaMcp({operations,oauth:{resource,issuer,audience:resource,jwksUrl:issuer+"/jwks",readScope:"xspa.read",writeScope:"xspa.write"},host:"127.0.0.1",port:0});
 const url=new URL("http://127.0.0.1:"+(http.address() as AddressInfo).port+"/mcp");
 const clients:Client[]=[];
 async function client(subject:string,clientId:string,scopes="xspa.read xspa.write"){
   const token=await new SignJWT({scope:scopes,client_id:clientId}).setProtectedHeader({alg:"RS256",kid:"xspa-mesh-smoke"}).setIssuer(issuer).setAudience(resource).setSubject(subject).setIssuedAt().setExpirationTime("10m").sign(privateKey);
   const mcp=new Client({name:clientId,version:"1.0"});
   await mcp.connect(new StreamableHTTPClientTransport(url,{requestInit:{headers:{Authorization:"Bearer "+token}}}) as unknown as Transport);
   clients.push(mcp);return mcp;
 }
 const call=async(mcp:Client,name:string,args:Record<string,unknown>={})=>await mcp.callTool({name,arguments:args}) as ToolResult;
 try {
  const chatgpt=await client("user-chatgpt","host-chatgpt");
  const claude=await client("user-claude","host-claude");
  const impostor=await client("user-chatgpt","host-spoof");
  const readonly=await client("user-read","host-read","xspa.read");
  const writerA=output(await call(chatgpt,"xspa_worker_register",{host_hint:"chatgpt",capabilities:["research"]}));
  const writerB=output(await call(claude,"xspa_worker_register",{host_hint:"claude",capabilities:["review"]}));
  const alice=writerA.workerId as string,bob=writerB.workerId as string;
  const reconnected=output(await call(chatgpt,"xspa_worker_register",{host_hint:"chatgpt",capabilities:["research"]}));
  assert(reconnected.workerId===alice,"reconnection generated a new workforce actor");
  assert(Boolean(alice&&bob&&alice!==bob),"opaque identities were not assigned");
  assert(writerA.hostVerified===false,"self-reported ChatGPT label should not certify a provider");
  const list=output(await call(chatgpt,"xspa_worker_list"));
  assert(Array.isArray(list.workers) && list.workers.length===2,"client cannot list company roster");
  const wrong=await call(impostor,"xspa_workforce_pickup",{worker_id:alice});
  assert(wrong.isError===true,"impostor's same sub with another client_id claimed identity");
  const unauthWrite=await call(readonly,"xspa_worker_register",{host_hint:"spoof"});
  assert(unauthWrite.isError===true,"read-only caller registered worker");
  const create=output(await call(chatgpt,"xspa_work_create",{work_id:workId,owner:"executive",objective:"Review production readiness",scope:"read-only"}));
  assert(create.status==="created","Company Work creation failed");
  const instruction="Review Company evidence; do not execute payments.";
  const delegateInput={source_worker_id:alice,target_worker_id:bob,work_id:workId,instruction,idempotency_key:"oauth-e2e-one"};
  const rejected=await call(chatgpt,"xspa_workforce_delegate",delegateInput);
  assert(rejected.isError===true,"unapproved sender was able to enqueue");
  const accepted=output(await call(claude,"xspa_workforce_allow_source",{target_worker_id:bob,source_worker_id:alice}));
  assert(accepted.accepted===true,"target did not accept the source");
  const first=output(await call(chatgpt,"xspa_workforce_delegate",delegateInput));
  const second=output(await call(chatgpt,"xspa_workforce_delegate",delegateInput));
  assert(first.delegationId===second.delegationId,"MCP retry generated duplicate work");
  const stolen=await call(chatgpt,"xspa_workforce_pickup",{worker_id:bob});
  assert(stolen.isError===true,"source impersonated recipient");
  const picked=output(await call(claude,"xspa_workforce_pickup",{worker_id:bob}));
  assert(picked.state==="claimed"&&picked.instruction===instruction&&picked.leaseGeneration===1,"recipient could not claim");
  const conflict=await call(claude,"xspa_workforce_complete",{worker_id:bob,delegation_id:first.delegationId,lease_generation:2,result_text:"spoofed"});
  assert(conflict.isError===true,"stale generation accepted");
  const finished=output(await call(claude,"xspa_workforce_complete",{worker_id:bob,delegation_id:first.delegationId,lease_generation:1,result_text:"Review passed",failed:false}));
  assert(finished.state==="completed","recipient could not complete");
  const receipt=output(await call(chatgpt,"xspa_workforce_receipt",{delegation_id:first.delegationId}));
  assert(receipt.resultText==="Review passed","source could not retrieve durable result");
  const revoked=output(await call(claude,"xspa_workforce_revoke_source",{target_worker_id:bob,source_worker_id:alice}));
  assert(revoked.accepted===false,"revoke not applied");
  const deniedFuture=await call(chatgpt,"xspa_workforce_delegate",{...delegateInput,idempotency_key:"second-after-revoke"});
  assert(deniedFuture.isError===true,"revoke allowed new delegations");
  const after=output(await call(claude,"xspa_workforce_pickup",{worker_id:bob}));
  assert(after.state==="empty","completed work was delivered again");
  console.log("PASS OAuth two-host MCP Workforce: 2 identities, scopes, consent, delegation, fencing, durable receipt");
 }finally{
  for(const mcp of clients)await mcp.close().catch(()=>undefined);
  await new Promise<void>(resolve=>http.close(()=>resolve()));
  await new Promise<void>(resolve=>jwksServer.close(()=>resolve()));
 }
}
if(import.meta.url===`file://${process.argv[1]}`)await verifyMultiHostOAuth();
