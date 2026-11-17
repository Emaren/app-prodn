import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, symlink, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  normalizedImageLocation, localPressFile, validatePackEntries,
  pressPackChunks, safePressBasename, pressPackStream,
} from "../lib/chroniclePressPack.ts";
import { readFileSync } from "node:fs";
const seed={
  schema:"aoe2war.chronicle.press-pack.v1",
  exportedAt:"2026-11-17T12:00:00.000Z",
  selectedSurface:"hero-studio-publication",
  publishedVersion:42,publishedAt:"2026-11-17T10:00:00Z",
  carousel:{autoplay:true},placements:[
    {position:0,headline:"The Long War",editionLabel:"November Dispatch",
     images:[{role:"main-hero",url:"/uploads/managed-assets/chronicle/cover.png"}]},
  ],sourceWarnings:[],
} as const;

test("only known origin and explicitly approved managed media roots accepted",()=>{
  assert.deepEqual(normalizedImageLocation("/uploads/managed-assets/chronicle/cover.png").segments,
    ["chronicle","cover.png"]);
  assert.throws(()=>normalizedImageLocation("https://evil.invalid/cover.png"),/EXTERNAL/);
  assert.throws(()=>normalizedImageLocation("//evil.invalid/cover.png"),/EXTERNAL/);
  assert.throws(()=>normalizedImageLocation("https://user:pass@aoe2war.com/cover.png"),/CREDENTIALLED/);
  assert.throws(()=>normalizedImageLocation("/api/internal/sensitive.json"),/ALLOWLISTED/);
  assert.throws(()=>normalizedImageLocation("/uploads/managed-assets/chronicle/x.txt"),/EXTENSION/);
  assert.throws(()=>normalizedImageLocation("/uploads/managed-assets/chronicle/%2e%2e%2fsecret.jpg"),/TRAVERSAL|BASENAME/);
  assert.equal(safePressBasename("/uploads/managed-assets/chronicle/cover.png"),"cover.png");
});

test("archive count, duplicate and total byte bounds fail closed",()=>{
  assert.throws(()=>validatePackEntries([]),/COUNT/);
  const one={sourceUrl:"/images/a.jpg",diskPath:"/tmp/a",archiveName:"images/001-a.jpg",size:100};
  assert.equal(validatePackEntries([one]),100);
  assert.throws(()=>validatePackEntries([one,one]),/DUPLICATE/);
  assert.throws(()=>validatePackEntries([{...one,size:513*1024*1024}]),/BYTES/);
  assert.throws(()=>validatePackEntries(Array.from({length:161},(_,i)=>({
    ...one,archiveName:`images/${String(i+1).padStart(3,"0")}-a.jpg`,
  }))),/COUNT/);
});

test("realpath traversal and nonlocal symlink are rejected",async()=>{
  const workspace=await mkdtemp(path.join(os.tmpdir(),"chronicle-test-"));
  const previous=process.env.MANAGED_MEDIA_UPLOAD_DIR;
  try{
    const root=path.join(workspace,"managed");
    await mkdir(path.join(root,"chronicle"),{recursive:true});
    await writeFile(path.join(root,"chronicle","cover.png"),Buffer.from([137,80,78,71]));
    await writeFile(path.join(workspace,"secret.png"),Buffer.from([1,2,3]));
    await symlink(path.join(workspace,"secret.png"),path.join(root,"chronicle","link.png"));
    process.env.MANAGED_MEDIA_UPLOAD_DIR=root;
    const result=await localPressFile("/uploads/managed-assets/chronicle/cover.png",
      "images/001-cover.png");
    assert.equal(result.size,4);
    await assert.rejects(localPressFile(
      "/uploads/managed-assets/chronicle/link.png","images/001-link.png"),/ESCAPED/);
  }finally{
    if(previous===undefined)delete process.env.MANAGED_MEDIA_UPLOAD_DIR;
    else process.env.MANAGED_MEDIA_UPLOAD_DIR=previous;
    await rm(workspace,{recursive:true,force:true});
  }
});

test("stream is a standard STORE ZIP with original bytes, metadata and hashes",async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),"chronicle-zip-"));
  try{
    const content=Buffer.from("ORIGINAL NEWSPAPER IMAGE BYTES\n","utf8");
    const filePath=path.join(dir,"issue-007.png");
    await writeFile(filePath,content);
    const file={sourceUrl:"/images/issue-007.png",diskPath:filePath,
      archiveName:"images/001-issue-007.png",size:content.length};
    const pack={...seed,placements:seed.placements.map(x=>({...x}))};
    const chunks:Uint8Array[]=[];
    for await(const part of pressPackChunks([file],pack as any))chunks.push(part);
    const zip=Buffer.concat(chunks.map(x=>Buffer.from(x)));
    assert.equal(zip.readUInt32LE(0),0x04034b50);
    assert.equal(zip.readUInt32LE(zip.length-22),0x06054b50);
    assert.equal(zip.readUInt16LE(zip.length-12),2); // two entries: image + manifest
    assert.ok(zip.includes(content));
    assert.ok(zip.includes(Buffer.from("chronicle-manifest.json")));
    assert.ok(zip.includes(Buffer.from("November Dispatch")));
    assert.ok(zip.includes(Buffer.from("hero-studio-publication")));
    const crypto=await import("node:crypto");
    assert.ok(zip.includes(Buffer.from(crypto.createHash("sha256").update(content).digest("hex"))));
    const streamed=await new Response(pressPackStream([file],pack as any)).arrayBuffer();
    assert.deepEqual(Buffer.from(streamed),zip);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test("a changing original is not silently packed as if verified",async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),"chronicle-drift-"));
  try{
    const filePath=path.join(dir,"cover.png");
    await writeFile(filePath,"a");
    const file={sourceUrl:"/images/cover.png",diskPath:filePath,
      archiveName:"images/001-cover.png",size:2};
    await assert.rejects(async()=>{
      for await(const _chunk of pressPackChunks([file],seed as any)){}
    },/SOURCE_CHANGED/);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test("admin download route does not weaken authentication, source selection, or require a writer",()=>{
  const route=readFileSync(new URL("../app/api/admin/chronicle-press-pack/route.ts",import.meta.url),"utf8");
  const ui=readFileSync(new URL("../components/admin/hero/HeroStudio.tsx",import.meta.url),"utf8");
  assert.match(route,/requireAdmin\(request\)/);
  assert.match(route,/loadPublishedHeroPlaylist\(gate\.prisma\)/);
  assert.match(route,/readHeroStageTakeoverState\(\)/);
  assert.match(route,/isHeroStageTakeoverLive/);
  assert.match(route,/private, no-store/);
  assert.match(route,/Content-Disposition/);
  assert.doesNotMatch(route,/\b(POST|DELETE|UPDATE|INSERT|fetch\()\b/);
  assert.match(ui,/Download Chronicle ZIP/);
  assert.match(ui,/\/api\/admin\/chronicle-press-pack/);
});
