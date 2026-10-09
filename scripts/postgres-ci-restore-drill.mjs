import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const get=(args)=>execFileSync("docker",args,{encoding:"utf8",timeout:60_000}).trim();
const containers=get(["ps","--filter","ancestor=postgres:18-alpine","--format","{{.ID}}"]).split("\n").filter(Boolean);
assert.equal(containers.length,1,"exactly one disposable PostgreSQL 18 CI container is required");
const cid=containers[0];
const db="xspa_restore_drill";
const exec=(...args)=>get(["exec",cid,...args]);
try{
 exec("dropdb","-U","postgres","--if-exists",db);
 exec("createdb","-U","postgres",db);
 exec("pg_dump","-U","postgres","--format=custom","--file=/tmp/xspa_ci_restore.dump","xspa_test");
 exec("pg_restore","-U","postgres","--exit-on-error","--dbname",db,"/tmp/xspa_ci_restore.dump");
 const count=Number(exec("psql","-U","postgres","-d",db,"-Atc","SELECT count(*) FROM xspa.schema_migrations"));
 assert(Number.isFinite(count)&&count>=10,"restored migrations incomplete");
 const tables=exec("psql","-U","postgres","-d",db,"-Atc","SELECT count(*) FROM information_schema.tables WHERE table_schema='xspa'");
 assert(Number(tables)>=15,"restored Company schema incomplete");
 console.log(`PASS PostgreSQL 18 pg_dump/pg_restore round trip: ${count} migrations, ${tables} tables`);
}finally{
 try{exec("dropdb","-U","postgres","--if-exists",db);}catch{}
}
