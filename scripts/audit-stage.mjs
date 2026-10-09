// Production-safe read-only remote discovery audit. Does not create OAuth clients, tokens or workers.
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const endpoint=new URL(process.env.XSPA_AUDIT_MCP_URL||"https://xspa-mcp-staging.up.railway.app/mcp");
if(endpoint.protocol!=="https:")throw Error("HTTPS required");
const root=endpoint.origin;
const report={target:endpoint.href,timestamp:new Date().toISOString(),checks:{},blockers:[],hostLoginObserved:false};
async function probe(name,action){try{report.checks[name]=await action()}catch(error){report.checks[name]={error:String(error)}}}
async function getJson(path){
 const r=await fetch(root+path,{signal:AbortSignal.timeout(15000)});
 return {http:r.status,data:r.ok?await r.json():null};
}
await probe("health",async()=>{const {http,data}=await getJson("/health");return {http,ok:http===200&&data?.ok===true}});
await probe("authorizationServer",async()=>{
 const {http,data}=await getJson("/.well-known/oauth-authorization-server");
 return {http,ok:http===200&&data?.issuer===root+"/"&&data?.authorization_endpoint===root+"/authorize"&&data?.token_endpoint===root+"/token"&&data?.registration_endpoint===root+"/register"&&data?.code_challenge_methods_supported?.includes("S256"),issuer:data?.issuer};
});
await probe("protectedResource",async()=>{
 const {http,data}=await getJson("/.well-known/oauth-protected-resource/mcp");
 return {http,ok:http===200&&data?.resource===endpoint.href&&data?.authorization_servers?.includes(root+"/")};
});
await probe("jwks",async()=>{
 const {http,data}=await getJson("/oauth/jwks");
 return {http,ok:http===200&&Array.isArray(data?.keys)&&data.keys.length>0&&data.keys.every(k=>k.kty==="OKP"&&!k.d),keyCount:data?.keys?.length||0};
});
await probe("a2a",async()=>{
 const {http,data}=await getJson("/.well-known/agent-card.json");
 return {http,ok:http===200&&data?.supportedInterfaces?.some(i=>i.protocolVersion==="1.0")&&Array.isArray(data?.securityRequirements)};
});
await probe("anonymousMcpDenied",async()=>{
 const r=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json",accept:"application/json, text/event-stream"},signal:AbortSignal.timeout(15000),
 body:JSON.stringify({jsonrpc:"2.0",id:1,method:"initialize",params:{protocolVersion:"2026-07-28",capabilities:{},clientInfo:{name:"read-only-audit",version:"1"}}})});
 return {http:r.status,ok:r.status===401&&(r.headers.get("www-authenticate")||"").includes("oauth-protected-resource")};
});
const bearer=process.env.XSPA_AUDIT_ACCESS_TOKEN;
if(bearer){
 await probe("authenticatedMcp",async()=>{
  const client=new Client({name:"xspa-read-only-auditor",version:"1.0"},{versionNegotiation:{mode:"auto"}});
  try{
   await client.connect(new StreamableHTTPClientTransport(endpoint,{requestInit:{headers:{authorization:"Bearer "+bearer}}}));
   const list=await client.listTools();
   const status=await client.callTool({name:"xspa_status",arguments:{}});
   const state=status.structuredContent||{};
   const ok=!status.isError&&list.tools.some(t=>t.name==="xspa_worker_register")&&state.access?.oauthConfigured===true;
   return {ok,toolCount:list.tools.length,companyReady:state.companyOs?.ready,oauthConfigured:state.access?.oauthConfigured};
  }finally{await client.close()}
 });
 report.hostLoginObserved=report.checks.authenticatedMcp?.ok===true;
}
for(const [name,check]of Object.entries(report.checks))if(!check.ok)report.blockers.push("FAILED:"+name);
report.discoveryReady=["health","authorizationServer","protectedResource","jwks","a2a","anonymousMcpDenied"].every(name=>report.checks[name]?.ok===true);
report.readyForAccountConnection=report.discoveryReady;
report.authenticatedHostReady=report.hostLoginObserved;
report.productionAutonomyVerified=false; // Requires real host wake, Owner authority, backup drill and independent review.
console.log(JSON.stringify(report,null,2));
if(process.argv.includes("--require-discovery")&&!report.discoveryReady)process.exitCode=1;
if(process.argv.includes("--require-ready")&&(!report.discoveryReady||!report.authenticatedHostReady))process.exitCode=1;
