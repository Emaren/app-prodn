"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {rewrite,specs}=require("../scripts/r25_secure_minimatch_eslint_adapter.cjs");
const padding="\n// "+("source source source ".repeat(12));
test("old override importer adjusted to v11 named Minimatch, safely idempotent",()=>{
 const source='import minimatch from "minimatch";\nconst { Minimatch } = minimatch;'+padding;
 const updated=rewrite(source,specs[0]);
 assert.equal(updated.changed,true);
 assert.match(updated.content,/import \{ Minimatch \} from "minimatch";/);
 assert.doesNotMatch(updated.content,/const \{ Minimatch \} = minimatch/);
 assert.equal(rewrite(updated.content,specs[0]).changed,false);
});
test("config-array importer uses secure named minimatch function",()=>{
 const source="import minimatch from 'minimatch';\nfunction test(f){return minimatch(f,'**/*.ts');}"+padding;
 const updated=rewrite(source,specs[1]);
 assert.equal(updated.changed,true);
 assert.match(updated.content,/import \{ minimatch \} from 'minimatch'/);
 assert.equal(rewrite(updated.content,specs[1]).changed,false);
});
test("unexpected, duplicate, partial or unrelated importer refused",()=>{
 const a='import minimatch from "minimatch";\n'+padding;
 assert.throws(()=>rewrite(a,specs[0]),/DESTRUCTURE_CHANGED/);
 assert.throws(()=>rewrite(a+'import minimatch from "minimatch";',specs[0]),/IMPORT_CONTRACT_CHANGED/);
 assert.throws(()=>rewrite('import minimatch from "minimatch";',specs[0]),/SOURCE_SIZE/);
 assert.throws(()=>rewrite('import { Minimatch } from "minimatch";\nconst { Minimatch } = minimatch;'+padding,specs[0]),/PARTIAL_ESLINT_PATCH/);
});
