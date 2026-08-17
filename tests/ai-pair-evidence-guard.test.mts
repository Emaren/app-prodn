import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPositivePairEvidenceGuard,
  providerReplyContradictsPositivePairEvidence,
} from "../lib/aiPairEvidenceGuard.ts";

const positiveContext = `
## Rivalries and team matchups
{
  "pairArchiveEvidence": {
    "queryPlayers": ["zodiac", "somniosator"],
    "meetingsFound": 6,
    "oneVOneOpponents": 1,
    "teamOpponents": 2,
    "teammates": 3,
    "unknownRelationship": 0,
    "firstPlayerWins": 2,
    "secondPlayerWins": 1,
    "winsTogether": 1,
    "lossesTogether": 2,
    "unknownResults": 0,
    "meetings": [{"id": 24322}]
  }
}
## Recent battles
{
  "pairEvidence": {
    "meetingsFound": 0,
    "note": "No participant co-occurrence was found in this bounded repository payload. This does not prove there is no historical public record."
  }
}
`;

test("positive targeted pair archive yields a canonical summary", () => {
  const guard = buildPositivePairEvidenceGuard({
    kingdomKnowledgeContext: positiveContext,
    userMessage:
      "@Hall Scribe, how has Zodiac done against somniosator, including team games?",
  });

  assert.ok(guard);
  assert.equal(guard.meetingsFound, 6);
  assert.equal(guard.oneVOneOpponents, 1);
  assert.equal(guard.teamOpponents, 2);
  assert.equal(guard.teammates, 3);
  assert.equal(guard.winsTogether, 1);
  assert.equal(guard.lossesTogether, 2);
  assert.match(guard.summary, /Zodiac and somniosator have 6 public meetings/);
  assert.match(guard.summary, /2 team games as opponents/);
  assert.match(guard.summary, /3 as teammates/);
  assert.match(guard.summary, /together they went 1-2/);
});

test("bounded zero-meeting evidence cannot erase a positive targeted archive", () => {
  const guard = buildPositivePairEvidenceGuard({
    kingdomKnowledgeContext: positiveContext,
    userMessage: "Zodiac versus somniosator?",
  });
  assert.ok(guard);
  assert.equal(guard.meetingsFound, 6);
});

test("no positive targeted archive produces no guard", () => {
  assert.equal(
    buildPositivePairEvidenceGuard({
      kingdomKnowledgeContext:
        '{"pairEvidence":{"meetingsFound":0}}',
      userMessage: "Alpha versus Beta?",
    }),
    null,
  );
});

test("absolute false-absence language is detected", () => {
  for (const value of [
    "There is no public record of these players meeting.",
    "No matches were found between them.",
    "They have not played each other.",
    "They haven't played together.",
    "They never played as teammates.",
  ]) {
    assert.equal(
      providerReplyContradictsPositivePairEvidence(value),
      true,
      value,
    );
  }
});

test("a truthful natural answer remains untouched", () => {
  assert.equal(
    providerReplyContradictsPositivePairEvidence(
      "Zodiac has met somniosator six times, including a 1v1 and several team games.",
    ),
    false,
  );
});
