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

test('Video Vault diagnostics use ID joins and only allowlisted reason codes', () => {
  const api=readFileSync('app/api/admin/video-vault/route.ts','utf8');
  const ui=readFileSync('components/admin/VideoVaultDashboard.tsx','utf8');
  assert.match(api,/sessionId: \{ in: eventStreamIds \}/);
  assert.match(api,/take: 180/);
  assert.match(api,/latestIssueByStream/);
  assert.match(api,/a-zA-Z0-9_-/);
  assert.match(api,/Never send arbitrary paths/);
  assert.match(ui,/Stale signal/);
  assert.match(ui,/row.latestIssue/);
  assert.match(ui,/old incident does not mean/);
});
