import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
const source=stripTypeScriptTypes(readFileSync(new URL('../app/api/radio/station/audio/[publicId]/route.ts',import.meta.url),'utf8'));
const id='79e84191-f7e0-4ca8-beb0-73dfb01be32f';
const good={audioStorageKey:'fixture.wav',audioMediaType:'audio/wav'};
async function setup({rows=[good],error=false,range=null,exists=true}={}){
 const calls={query:0,raw:0,stream:0,path:0};
 class NextResponse{constructor(body,init){this.body=body;this.status=init.status;this.headers=init.headers}static json(body,init){return new NextResponse(body,init)}}
 const modules={
 'node:fs/promises':{stat:async()=>({isFile:()=>exists,size:4096})},
 'next/server':{NextRequest:class{},NextResponse},
 '@/lib/radioWolo':{radioStoragePath:k=>{calls.path++;assert.equal(k,'fixture.wav');return '/fixture/'+k}},
 '@/lib/radioWoloAssets':{parseRadioByteRange:()=>range},
 '@/lib/radioWoloFileStream':{createRadioFileStream:async()=>{calls.stream++;return 'fixture-stream'}},
 '@/lib/radioWoloStation':{buildRadioProgramTimeline:()=>{throw Error('unexpected legacy path')}},
 '@/lib/prisma':{getPrisma:()=>({$queryRaw:async q=>{calls.query++;assert.deepEqual(q.values,[id]);assert.match(q.text,/radio_on_air_media/);if(error)throw Error('private fixture error');return rows},radioStationState:{findUnique:async()=>{calls.raw++;throw Error('raw access')}}})},
 '@/lib/generated/prisma':{Prisma:{sql:(parts,...values)=>({text:parts.join('?'),values})}},
 '@/lib/nonfinancialPublicReadProfile':{isNonfinancialPublicReadProfile:()=>true}
 };
 const mod=new vm.SourceTextModule(source);
 await mod.link(async name=>{assert.ok(modules[name],name);const exports=modules[name];return new vm.SyntheticModule(Object.keys(exports),function(){for(const [k,v] of Object.entries(exports))this.setExport(k,v)})});
 await mod.evaluate();
 const get=publicId=>mod.namespace.GET({headers:{get:()=>null}},{params:Promise.resolve({publicId})});
 return {calls,get};
}
test('bad UUID rejected before database',async()=>{const x=await setup();assert.equal((await x.get('bad')).status,404);assert.equal(x.calls.query,0)});
test('DB failure returns 503 without leaking error',async()=>{const x=await setup({error:true});const r=await x.get(id);assert.equal(r.status,503);assert.equal(r.headers['Retry-After'],'30');assert.doesNotMatch(JSON.stringify(r.body),/private fixture/);assert.equal(x.calls.raw,0)});
test('missing and ambiguous media fail closed',async()=>{for(const rows of [[],[good,good]]){const x=await setup({rows});assert.equal((await x.get(id)).status,404);assert.equal(x.calls.path,0)}});
test('unsupported MIME never reaches storage',async()=>{const x=await setup({rows:[{...good,audioMediaType:'text/html'}]});assert.equal((await x.get(id)).status,404);assert.equal(x.calls.path,0)});
test('missing file stays 404',async()=>{const x=await setup({exists:false});assert.equal((await x.get(id)).status,404);assert.equal(x.calls.stream,0)});
test('valid media returns 200',async()=>{const x=await setup();const r=await x.get(id);assert.equal(r.status,200);assert.equal(r.headers['Content-Type'],'audio/wav');assert.equal(r.headers['Content-Length'],'4096');assert.equal(x.calls.raw,0)});
test('range returns 206 exact boundaries',async()=>{const x=await setup({range:{start:0,end:1023}});const r=await x.get(id);assert.equal(r.status,206);assert.equal(r.headers['Content-Range'],'bytes 0-1023/4096');assert.equal(r.headers['Content-Length'],'1024');assert.equal(x.calls.stream,1)});
test('invalid range returns 416 without streaming',async()=>{const x=await setup({range:'invalid'});const r=await x.get(id);assert.equal(r.status,416);assert.equal(r.headers['Content-Range'],'bytes */4096');assert.equal(x.calls.stream,0)});
