import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourcePath = new URL("../components/streaming/BrowserStreamStudio.tsx", import.meta.url);

test("studio never silently assigns the first live match to a broadcaster", async () => {
  const source = await readFile(sourcePath, "utf8");
  assert.doesNotMatch(source, /setSelectedSessionKey\(\(current\) => current \|\| rows\[0\]/);
  assert.match(source, /Select your live battle/);
  assert.match(source, /setSuggestions\(rows\)/);
  assert.match(source, /setInterval\(\(\) => \{ void loadSuggestions\(\); \}, ACTIVE_STREAM_REFRESH_MS\)/);
  assert.match(source, /clearInterval\(interval\)/);
});

test("live browser video must use an explicitly selected battle or free-stream intent", async () => {
  const source = await readFile(sourcePath, "utf8");
  assert.match(source, /const \[explicitFreeStream, setExplicitFreeStream\] = useState\(false\)/);
  assert.match(source, /if \(!selectedSessionKey && !sessionKey && !explicitFreeStream\)/);
  assert.match(source, /Choose the matching battle or explicitly select Free Stream before going live/);
  assert.match(source, /setExplicitFreeStream\(true\)/);
  assert.match(source, /setExplicitFreeStream\(false\)/);
  assert.match(source, /sessionKey: effectiveSessionKey/);
  assert.match(source, /sourceType: "browser"/);
});

test("battle identity is frozen while publishing", async () => {
  const source = await readFile(sourcePath, "utf8");
  assert.match(source, /disabled=\{busy \|\| isLive\}/);
  assert.match(source, /if \(sessionKey \|\| isLive\) return/);
});
