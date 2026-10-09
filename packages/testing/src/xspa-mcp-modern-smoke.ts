import {once} from "node:events";
import type {AddressInfo} from "node:net";
import {Client, StreamableHTTPClientTransport} from "@modelcontextprotocol/client";
import {EnvironmentXspaAppOperations} from "../../../apps/mcp/src/runtime.js";
import {listenXspaMcp} from "../../../apps/mcp/src/server.js";

export async function verifyModernMcp():Promise<void>{
 const operations=new EnvironmentXspaAppOperations({databaseConfigured:false,creativeConfigured:false,kastConfigured:false});
 const authToken="only-for-loopback-v2-test";
 const server=await listenXspaMcp({operations,host:"127.0.0.1",port:0,authToken});
 if(!server.listening)await once(server,"listening");
 const address=server.address() as AddressInfo;
 const url=new URL(`http://127.0.0.1:${address.port}/mcp`);
 try{
   const modern=new Client({name:"xspa-modern-smoke",version:"1.0.0"},{versionNegotiation:{mode:{pin:"2026-07-28"}}});
   const transport=new StreamableHTTPClientTransport(url,{requestInit:{headers:{Authorization:"Bearer "+authToken}}});
   try{
     await modern.connect(transport);
     if(modern.getProtocolEra()!=="modern")throw Error("modern SDK did not select 2026-07-28");
     const list=await modern.listTools();
     if(!list.tools.some(tool=>tool.name==="xspa_worker_register"))throw Error("2026 endpoint missing Company Workforce tools");
     const response=await modern.callTool({name:"xspa_status",arguments:{}});
     if(response.isError || !JSON.stringify(response).includes("companyOs"))throw Error("modern endpoint failed status");
     console.log("PASS 2026-07-28 MCP modern sessionless discovery, tools/list, status");
   }finally{await modern.close();}
   const auto=new Client({name:"xspa-auto-smoke",version:"1.0.0"},{versionNegotiation:{mode:"auto"}});
   const autoTransport=new StreamableHTTPClientTransport(url,{requestInit:{headers:{Authorization:"Bearer "+authToken}}});
   try{await auto.connect(autoTransport);if(auto.getProtocolEra()!=="modern")throw Error("auto client selected legacy unexpectedly");console.log("PASS v2 client auto negotiated modern MCP");}finally{await auto.close();}
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
}
if(import.meta.url===`file://${process.argv[1]}`)await verifyModernMcp();
