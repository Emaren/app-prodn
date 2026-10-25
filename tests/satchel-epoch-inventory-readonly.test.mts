import assert from "node:assert/strict";
import test from "node:test";
import {spawnSync} from "node:child_process";
import {chmodSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const script=path.join(root,"scripts/satchel_epoch_inventory_readonly.sh");
const body=readFileSync(script,"utf8");

test("operator inventory is read-only and never mixes POSIX df with --output",()=>{
  assert.match(body,/AOE2WAR_PROSPECTIVE_EPOCH_INVENTORY_V1=READ_ONLY/);
  assert.doesNotMatch(body,/df\s+-P[^\n]*--output/);
  assert.match(body,/df -PB1 "\$path"/);
  assert.match(body,/AVAILABLE_BYTES\[%s\]/);
  assert.match(body,/READ_ONLY_DONE=NO_WALLET_NO_DB_NO_KEYS_NO_NETWORK/);
  const check=spawnSync("bash",["-n",script],{encoding:"utf8",timeout:5000});
  assert.equal(check.status,0,check.stderr);
});

test("Linux read-only inventory reaches DONE after all storage probes",{
  skip:process.platform!=="linux",
},()=>{
  const out=spawnSync("bash",[script],{
    cwd:root,encoding:"utf8",timeout:20000,maxBuffer:1024*1024,
  });
  assert.equal(out.status,0,out.stderr||"inventory unexpectedly failed");
  assert.match(out.stdout,/STORAGE_PATH=\/ UID=/);
  assert.match(out.stdout,/AVAILABLE_BYTES\[\/\]=[0-9]+/);
  assert.match(out.stdout,/SERVICE_NAMES_ONLY_END/);
  assert.match(out.stdout,/PROCESS_NAMES_ONLY_END/);
  assert.match(out.stdout,/RESTORE_TOOLS=/);
  assert.match(out.stdout,/READ_ONLY_DONE=NO_WALLET_NO_DB_NO_KEYS_NO_NETWORK\s*$/);
});

test("Linux inventory records df failure and still completes",{
  skip:process.platform!=="linux",
},()=>{
  const folder=mkdtempSync(path.join(tmpdir(),"satchel-df-failure-"));
  try{
    const fake=path.join(folder,"df");
    writeFileSync(fake,"#!/bin/sh\nexit 27\n",{mode:0o755});
    chmodSync(fake,0o755);
    const out=spawnSync("bash",[script],{
      cwd:root,encoding:"utf8",timeout:20000,maxBuffer:1024*1024,
      env:{...process.env,PATH:folder+":"+process.env.PATH},
    });
    assert.equal(out.status,0,out.stderr||"df error must not abort inventory");
    assert.match(out.stdout,/AVAILABLE_BYTES\[\/\]=UNKNOWN_DF_ERROR/);
    assert.match(out.stdout,/READ_ONLY_DONE=NO_WALLET_NO_DB_NO_KEYS_NO_NETWORK\s*$/);
  }finally{rmSync(folder,{recursive:true,force:true});}
});
