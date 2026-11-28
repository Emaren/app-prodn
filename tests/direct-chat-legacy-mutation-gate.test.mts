import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=(p:string)=>readFileSync(new URL("../components/contact/"+p,import.meta.url),"utf8");
for(const name of ["HeaderInboxControl.tsx","ContactEmarenWorkspace.tsx"]){
 test(name+" gates automatic legacy mutation and preserves admitted send",()=>{
  const s=read(name);
  assert.match(s,/legacyMutations !== false/);
  assert.match(s,/if \(!legacyMutationsAllowed \|\| !targetUid/);
  assert.match(s,/if \(!legacyMutationsRef.current \|\| selectedTargetUidRef.current !== targetUid\) return/);
  assert.match(s,/if \(!legacyMutationsRef.current \|\| (?:!uid \|\| !targetUid|!selectedTargetUid)\) return/);
  assert.match(s,/method: "POST"/);
  assert.match(s,/acknowledgeReceivedInbox/);
 });
}
test("explicit legacy actions do not issue restricted PATCH",()=>{
 assert.match(read("HeaderInboxControl.tsx"),/onInboxAction=\{async \(action\) => \{\s*if \(!legacyMutationsRef.current\)/);
 assert.match(read("HeaderInboxControl.tsx"),/onToggleReaction=\{async \(messageId, emoji\) => \{\s*if \(!legacyMutationsRef.current\)/);
 assert.match(read("ContactEmarenWorkspace.tsx"),/if \(!legacyMutationsRef.current\) throw new Error/);
});
