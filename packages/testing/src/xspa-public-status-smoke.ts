import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { EnvironmentXspaAppOperations } from "../../../apps/mcp/src/runtime.js";
import { listenXspaMcp } from "../../../apps/mcp/src/server.js";

const operations = new EnvironmentXspaAppOperations({ databaseConfigured: false, creativeConfigured: false, kastConfigured: false });
await assert.rejects(
  () => listenXspaMcp({operations,host:"0.0.0.0",port:0}),
  /requires OAuth/,
);
const server = await listenXspaMcp({operations,host:"0.0.0.0",port:0,publicStatusOnly:true,allowedHosts:["127.0.0.1","localhost"]});
try {
  const port=(server.address() as AddressInfo).port;
  const client=new Client({name:"xspa-bootstrap-test",version:"1.0.0"},{versionNegotiation:{mode:"auto"}});
  const transport=new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`));
  try {
    await client.connect(transport);
    const list=await client.listTools();
    assert.deepEqual(list.tools.map(t=>t.name),["xspa_status"]);
    const status=await client.callTool({name:"xspa_status",arguments:{}});
    assert.notEqual(status.isError,true);
    assert.match(JSON.stringify(status),/companyOs/);
    assert.match(JSON.stringify(status),/gpt-6-astra/);
    assert.match(JSON.stringify(status),/businessToolsEnabled/);
    const origin=`http://127.0.0.1:${port}`;
    const a2aCard=await fetch(origin+"/.well-known/agent-card.json");
    assert.equal(a2aCard.status,404,"public status mode must not expose A2A Agent Card");
    const a2aCall=await fetch(origin+"/a2a",{
      method:"POST",headers:{"Content-Type":"application/json","A2A-Version":"1.0"},
      body:JSON.stringify({jsonrpc:"2.0",id:1,method:"SendMessage",params:{}})
    });
    assert.equal(a2aCall.status,404,"public status mode must not expose A2A requests");
    const oauthMetadata=await fetch(origin+"/.well-known/oauth-authorization-server");
    assert.equal(oauthMetadata.status,404,"public diagnostic mode must not advertise a nonexistent issuer");
    const forbidden=await client.callTool({name:"xspa_worker_register",arguments:{host_hint:"unauthenticated"}});
    assert.equal(forbidden.isError,true);
    assert.match(JSON.stringify(forbidden),/PUBLIC_STATUS_ONLY/);
    console.log("PASS public discovery-only: 2026 MCP handshake, xspa_status only, forbidden write blocked and unauthenticated full server refused");
  }finally{await client.close();}
}finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
