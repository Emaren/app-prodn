import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const source = readFileSync('app/api/streams/[streamId]/chunks/route.ts', 'utf8');
test('video quota reaches explicit terminal response', () => {
  assert.match(source, /code: "STREAM_STORAGE_LIMIT", terminal: true/);
  assert.match(source, /status: 413/);
});
test('already completed recordings produce an explicit end signal', () => {
  assert.match(source, /code: "STREAM_ALREADY_ENDED", terminal: true/);
  assert.match(source, /finality: "replay_final"/);
});
