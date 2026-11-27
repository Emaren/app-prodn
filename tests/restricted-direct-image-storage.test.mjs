import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,chmod,writeFile,rm,realpath,symlink,link} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {isRestrictedImageReference,readRestrictedImage} from "../lib/restrictedDirectImageStorage.mjs";
const filename="dm-12345678-1234-1234-1234-123456789abc.png";
const ref="file:v1:"+filename;
test("restricted private reader requires exact reference, MIME, custody and size",async()=>{
 const root=await realpath(await mkdtemp(path.join(os.tmpdir(),"restricted-reader-")));
 try{
  await chmod(root,0o750);
  const file=path.join(root,filename);
  await writeFile(file,Buffer.from("fixture"),{mode:0o640});
  await chmod(file,0o640);
  assert.equal(isRestrictedImageReference(ref),true);
  assert.deepEqual((await readRestrictedImage(root,ref,"image/png")).buffer,Buffer.from("fixture"));
  for(const [r,m] of [[ref,"image/jpeg"],["file:v1:../"+filename,"image/png"],["file:v1:"+filename+"/x","image/png"]])
   assert.equal(await readRestrictedImage(root,r,m),null);
  await chmod(file,0o644);assert.equal(await readRestrictedImage(root,ref,"image/png"),null);
  await chmod(file,0o640);await link(file,path.join(root,"other"));
  assert.equal(await readRestrictedImage(root,ref,"image/png"),null);
  await rm(file);await symlink(path.join(root,"other"),file);
  assert.equal(await readRestrictedImage(root,ref,"image/png"),null);
 }finally{await rm(root,{recursive:true,force:true});}
});
