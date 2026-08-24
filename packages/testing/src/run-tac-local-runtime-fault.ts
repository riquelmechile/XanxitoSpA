import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  runLocalControlArm,
  runLocalKillBeforeHealthArm,
  runLocalPortContentionArm,
  runLocalStaleProcessArm,
  type LocalRuntimePort,
} from "./tac-local-runtime-fault.js";

const execFileAsync = promisify(execFile);
function arg(name: string): string { const i=process.argv.indexOf(name); if(i<0||i+1>=process.argv.length) throw new Error(`missing ${name}`); return process.argv[i+1]??""; }
function delay(ms:number){ return new Promise((resolve)=>setTimeout(resolve,ms)); }

class DockerLocalRuntimePort implements LocalRuntimePort {
  private holderPid: string | null = null;
  constructor(private readonly container: string) {}
  private async docker(args:string[], timeout=30_000):Promise<string>{ const {stdout}=await execFileAsync("docker",args,{timeout,maxBuffer:1024*1024}); return stdout.trim(); }
  async ownerCount():Promise<number>{ const out=await this.docker(["exec",this.container,"ps","-eo","pid,args"]); return out.split("\n").filter((line)=>line.includes("event_viewer/main.py")&&!line.includes("ps -eo")).length; }
  async start():Promise<boolean>{
    await this.docker(["exec",this.container,"sh","-lc","cd /workspace/app && DB_PASSWORD=cat123 python_default event_viewer/main.py >/tmp/v4-server.log 2>&1 & echo $!"]);
    await delay(900);
    return (await this.ownerCount())>0;
  }
  async killActive():Promise<void>{
    const out=await this.docker(["exec",this.container,"ps","-eo","pid,args"]);
    const pids=out.split("\n").filter((line)=>line.includes("event_viewer/main.py")&&!line.includes("ps -eo")).map((line)=>line.trim().split(/\s+/)[0]).filter((pid): pid is string => Boolean(pid));
    for(const pid of pids){ try{ await this.docker(["exec",this.container,"kill","-9",pid]); }catch{} }
    await delay(300);
  }
  async isHealthy():Promise<boolean>{
    try{ await this.docker(["exec",this.container,"python_default","-c","import urllib.request; r=urllib.request.urlopen('http://127.0.0.1:5000/events',timeout=2); assert r.status==200"],5_000); return true; }catch{return false;}
  }
  async occupyPort():Promise<void>{
    const out=await this.docker(["exec",this.container,"sh","-lc","python_default -c \"import socket,time; s=socket.socket(); s.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1); s.bind(('127.0.0.1',5000)); s.listen(1); time.sleep(300)\" >/tmp/v4-port-holder.log 2>&1 & echo $!"]);
    this.holderPid=out.split("\n").at(-1)?.trim()||null; await delay(300);
  }
  async releasePort():Promise<void>{ if(this.holderPid){ try{ await this.docker(["exec",this.container,"kill","-9",this.holderPid]); }catch{} this.holderPid=null; await delay(200); } }
}

const mode=arg("--mode"); if(mode!=="direct"&&mode!=="xanxitospa") throw new Error("invalid mode");
const condition=arg("--condition");
if(!["control","kill_after_fix_before_healthcheck","port_contention","stale_process_after_takeover"].includes(condition)) throw new Error("unsupported condition");
const port=new DockerLocalRuntimePort(arg("--container"));
const result=condition==="control"?await runLocalControlArm(mode,port):condition==="kill_after_fix_before_healthcheck"?await runLocalKillBeforeHealthArm(mode,port):condition==="port_contention"?await runLocalPortContentionArm(mode,port):await runLocalStaleProcessArm(mode,port);
process.stdout.write(`${JSON.stringify({condition,...result},null,2)}\n`);
