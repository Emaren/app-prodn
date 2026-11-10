import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const collection = readFileSync("app/api/profile-documents/route.ts", "utf8");
const item = readFileSync("app/api/profile-documents/[id]/route.ts", "utf8");
const auth = readFileSync("lib/productionAuth.ts","utf8");

const collectGate = collection.slice(collection.indexOf("async function requireViewer("), collection.indexOf("export async function GET("));
const collectGet = collection.slice(collection.indexOf("export async function GET("),collection.indexOf("export async function POST("));
const collectPost = collection.slice(collection.indexOf("export async function POST("));
const itemGate = item.slice(item.indexOf("async function gateDocument("),item.indexOf("function safeDownloadName("));
const itemGet = item.slice(item.indexOf("export async function GET("),item.indexOf("export async function DELETE("));
const itemDelete = item.slice(item.indexOf("export async function DELETE("));

test("production read projection is already a reviewed credential-free user projection",()=>{
  assert.match(auth,/export function usesNonfinancialProductionAuth/);
  assert.match(auth,/SELECT \* FROM aoe2war_auth_v1\.read_user/);
  assert.match(auth,/const \{ token: legacyToken, \.\.\.user \}/);
  assert.match(auth,/void legacyToken/);
});

test("private document list GET uses projected viewer; writes retain original gate",()=>{
  assert.match(collectGate,/readOnly && usesNonfinancialProductionAuth\(\)/);
  assert.match(collectGate,/readProductionUser\(prisma, uid\)/);
  assert.match(collectGate,/prisma\.user\.findUnique/);
  assert.match(collectGet,/requireViewer\(request, true\)/);
  assert.match(collectPost,/requireViewer\(request\)/);
  assert.doesNotMatch(collectPost,/requireViewer\(request, true\)/);
});

test("private document GET owner lookup cannot use the restricted users table",()=>{
  assert.match(collectGet,/const requestedUid = request\.nextUrl\.searchParams\.get\("uid"\)/);
  assert.match(collectGet,/requestedUid !== gate\.user\.uid && !gate\.user\.isAdmin/);
  assert.match(collectGet,/status: 403/);
  assert.match(collectGet,/usesNonfinancialProductionAuth\(\)\s*\? await readProductionUser\(gate\.prisma, requestedUid\)/);
  assert.match(collectGet,/status: 404/);
});

test("private document item GET uses projected viewer; DELETE does not gain permission",()=>{
  assert.match(itemGate,/readOnly && usesNonfinancialProductionAuth\(\)/);
  assert.match(itemGate,/readProductionUser\(prisma, uid\)/);
  assert.match(itemGate,/prisma\.user\.findUnique/);
  assert.match(itemGet,/gateDocument\(request, id, true\)/);
  assert.match(itemDelete,/gateDocument\(request, id\)/);
  assert.doesNotMatch(itemDelete,/gateDocument\(request, id, true\)/);
});

test("anonymous, missing, and foreign-owner data remain denied",()=>{
  assert.match(collectGate,/if \(!uid\)/);
  assert.match(collectGate,/status: 401/);
  assert.match(collectGate,/if \(!user\)/);
  assert.match(collectGate,/status: 404/);
  assert.match(itemGate,/if \(!uid\)/);
  assert.match(itemGate,/status: 401/);
  assert.match(itemGate,/!ownerUid \|\| \(ownerUid !== viewer\.uid && !viewer\.isAdmin\)/);
  assert.match(itemGate,/status: 403/);
});

test("private document reads remain no-store and never fabricate empty success",()=>{
  for(const source of [collection,item]){
    assert.match(source,/Cache-Control": "private, no-store, max-age=0"/);
    assert.doesNotMatch(source,/\.catch\(\s*\(\)\s*=>\s*\[\]\s*\)/);
    assert.doesNotMatch(source,/permission denied[\s\S]*?return NextResponse\.json\(\[\]/i);
    assert.doesNotMatch(source,/\bGRANT\s+/i);
    assert.doesNotMatch(source,/\bREVOKE\s+/i);
  }
  assert.match(collectGet,/await listProfileDocuments\(gate\.prisma, requestedUid\)/);
  assert.match(itemGet,/await loadProfileDocumentBytes\(gate\.asset\.url\)/);
});

test("private media kind and immutable ownership are still enforced",()=>{
  assert.match(itemGate,/kind: PROFILE_DOCUMENT_KIND, active: true/);
  assert.match(itemGate,/profileDocumentOwnerUid\(asset\.target\)/);
  assert.match(collection,/requestedUid === gate\.user\.uid/);
  assert.match(item,/X-Content-Type-Options": "nosniff"/);
});
