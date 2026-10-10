import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = new URL("../app/television-wolo/page.tsx", import.meta.url);
const television = new URL("../components/television/TelevisionWoloExperience.tsx", import.meta.url);
const directory = new URL("../app/api/watch-streams/route.ts", import.meta.url);

test("Television preserves the full participant roster and does not invent opposing teams", async () => {
  const source = await readFile(page, "utf8");
  assert.match(source, /names\.join\(" · "\)/);
  assert.doesNotMatch(source, /names\.slice\(0, 4\)/);
  assert.doesNotMatch(source, /names\.join\(" vs "\)/);
});

test("Chaos lab includes every named contestant with a distinct position identity", async () => {
  const source = await readFile(television, "utf8");
  assert.match(source, /playerNames \?\? \[\]\)\.map\(\(name, index\)/);
  assert.match(source, /key: `\$\{index\}:\$\{name\}`/);
  assert.doesNotMatch(source, /playerNames\.slice\(0, 4\)/);
  assert.match(source, /Non-binding sandbox/);
  assert.match(source, /nothing is written, no ballot is counted/);
});

test("Battle discovery is foreground-only and never implicitly starts video", async () => {
  const source = await readFile(television, "utf8");
  assert.match(source, /!document\.hidden\) router\.refresh\(\)/);
  assert.match(source, /30_000/);
  assert.match(source, /onClick=\{\(\) => void playBattle\(\)\}/);
  assert.match(source, /Video stays asleep until you press play/);
});

test("Late feed arrival preserves existing perspective with an abortable bounded poll", async () => {
  const source = await readFile(television, "utf8");
  assert.match(source, /new AbortController\(\)/);
  assert.match(source, /15_000/);
  assert.match(source, /nextStreams\.some\(\(stream\) => stream\.id === current\)/);
  assert.match(source, /controller\.abort\(\)/);
  assert.match(source, /existing playback is preserved/);
  assert.match(source, /Check feeds now/);
});

test("Feed directory query failures are not presented as empty live events", async () => {
  const source = await readFile(directory, "utf8");
  assert.match(source, /if \(retainedRows === null\)/);
  assert.match(source, /if \(streams === null\)/);
  assert.match(source, /status: 503/);
  assert.match(source, /Cache-Control.*no-store/);
});
