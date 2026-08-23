import assert from "node:assert/strict";

import {
  readFileSync,
} from "node:fs";

import test from "node:test";

import {
  CHALLENGE_FUNDABLE_STATUSES,
  planChallengeFundingIntent,
  planChallengeFundingState,
} from "../lib/challenge/domain/transitionPolicy.ts";

import {
  ChallengeConflictError,
} from "../lib/challenge/domain/errors.ts";


const route =
  readFileSync(
    "app/api/challenges/[id]/route.ts",
    "utf8",
  );

const commands =
  readFileSync(
    "lib/challenge/domain/commands.ts",
    "utf8",
  );

const policy =
  readFileSync(
    "lib/challenge/domain/transitionPolicy.ts",
    "utf8",
  );

const verifier =
  readFileSync(
    "lib/woloBetSettlement.ts",
    "utf8",
  );

const schema =
  readFileSync(
    "prisma/schema.prisma",
    "utf8",
  );


function baseIntent() {
  return {
    actorRole:
      "challenger" as const,

    status:
      "proposed",

    acceptedAt:
      null,

    acceptBy:
      new Date(
        "2026-08-24T20:00:00.000Z",
      ),

    fundBy:
      null,

    challengerFundedAt:
      null,

    challengedFundedAt:
      null,

    fundingTxHash:
      "  abc123  ",

    fundingWalletAddress:
      "  wolo1sender  ",

    now:
      new Date(
        "2026-08-23T20:00:00.000Z",
      ),
  };
}


function expectError(
  fn: () => unknown,
  message: string,
  status = 409,
) {
  assert.throws(
    fn,
    (
      error: unknown,
    ) => {
      assert.ok(
        error instanceof
          ChallengeConflictError,
      );

      assert.equal(
        error.message,
        message,
      );

      assert.equal(
        error.status,
        status,
      );

      return true;
    },
  );
}


test(
  "fundable status vocabulary is canonical domain policy",
  () => {
    assert.deepEqual(
      [
        ...CHALLENGE_FUNDABLE_STATUSES,
      ],
      [
        "proposed",
        "pending",
        "terms_accepted",
        "accepted",
        "creator_funded",
        "opponent_funded",
        "funded",
      ],
    );

    assert.doesNotMatch(
      route,
      /FUNDABLE_STATUSES/,
    );
  },
);


test(
  "funding remains participant-side authority only",
  () => {
    expectError(
      () =>
        planChallengeFundingIntent({
          ...baseIntent(),

          actorRole:
            "admin",
        }),

      "Only match participants can record funding.",
      403,
    );

    assert.equal(
      planChallengeFundingIntent(
        baseIntent(),
      ).participantSide,
      "left",
    );

    assert.equal(
      planChallengeFundingIntent({
        ...baseIntent(),

        actorRole:
          "challenged",

        acceptedAt:
          new Date(
            "2026-08-23T19:00:00.000Z",
          ),

        fundBy:
          new Date(
            "2026-08-23T21:00:00.000Z",
          ),
      }).participantSide,
      "right",
    );
  },
);


test(
  "challenged side cannot fund before acceptance",
  () => {
    expectError(
      () =>
        planChallengeFundingIntent({
          ...baseIntent(),

          actorRole:
            "challenged",
        }),

      "Accept the challenge before funding it.",
    );
  },
);


test(
  "funding input normalization preserves existing transport semantics",
  () => {
    const result =
      planChallengeFundingIntent(
        baseIntent(),
      );

    assert.equal(
      result.fundingTxHash,
      "ABC123",
    );

    assert.equal(
      result.fundingWalletAddress,
      "wolo1sender",
    );
  },
);


test(
  "signed tx hash and wallet address remain mandatory",
  () => {
    expectError(
      () =>
        planChallengeFundingIntent({
          ...baseIntent(),

          fundingTxHash:
            " ",
        }),

      "Add the signed funding tx hash.",
      400,
    );

    expectError(
      () =>
        planChallengeFundingIntent({
          ...baseIntent(),

          fundingWalletAddress:
            " ",
        }),

      "The signed funding wallet address is required.",
      400,
    );
  },
);


test(
  "funding deadline is side and acceptance aware",
  () => {
    const expired =
      new Date(
        "2026-08-23T19:00:00.000Z",
      );

    expectError(
      () =>
        planChallengeFundingIntent({
          ...baseIntent(),

          acceptBy:
            expired,
        }),

      "The funding window has expired.",
    );

    expectError(
      () =>
        planChallengeFundingIntent({
          ...baseIntent(),

          acceptedAt:
            new Date(
              "2026-08-23T18:00:00.000Z",
            ),

          fundBy:
            expired,
        }),

      "The funding window has expired.",
    );
  },
);


test(
  "one side cannot fund twice",
  () => {
    const fundedAt =
      new Date(
        "2026-08-23T18:00:00.000Z",
      );

    expectError(
      () =>
        planChallengeFundingIntent({
          ...baseIntent(),

          challengerFundedAt:
            fundedAt,
        }),

      "Creator funding is already on file.",
    );

    expectError(
      () =>
        planChallengeFundingIntent({
          ...baseIntent(),

          actorRole:
            "challenged",

          acceptedAt:
            fundedAt,

          fundBy:
            new Date(
              "2026-08-23T21:00:00.000Z",
            ),

          challengedFundedAt:
            fundedAt,
        }),

      "Opponent funding is already on file.",
    );
  },
);


test(
  "first verified side becomes funded without inventing second-side principal",
  () => {
    const fundedAt =
      new Date(
        "2026-08-23T20:00:00.000Z",
      );

    const result =
      planChallengeFundingState({
        participantSide:
          "left",

        verifiedFundingTxHash:
          "ABC123",

        fundingWalletAddress:
          "wolo1sender",

        fundedAt,

        status:
          "proposed",

        scheduledAt:
          new Date(
            "2026-08-24T20:00:00.000Z",
          ),

        timingMode:
          "open",

        matchTime:
          null,

        acceptedAt:
          null,

        resultAt:
          null,

        liveConfirmedAt:
          null,

        settlementReadyAt:
          null,

        wagerAmountWolo:
          25,

        guaranteeAmountWolo:
          10,

        challengerFundingTxHash:
          null,

        challengerFundingWalletAddress:
          null,

        challengerFundedAt:
          null,

        challengedFundingTxHash:
          null,

        challengedFundingWalletAddress:
          null,

        challengedFundedAt:
          null,

        challengerCheckedInAt:
          null,

        challengedCheckedInAt:
          null,

        playBy:
          null,
      });

    assert.equal(
      result.nextShape
        .challengerFundedAt,
      fundedAt,
    );

    assert.equal(
      result.nextShape
        .challengerFundingTxHash,
      "ABC123",
    );

    assert.equal(
      result.nextShape
        .challengedFundedAt,
      null,
    );

    assert.equal(
      result.bothFunded,
      false,
    );

    assert.equal(
      result.totalFundingWolo,
      35,
    );
  },
);


test(
  "second verified side opens play runway while preserving first proof",
  () => {
    const firstFundedAt =
      new Date(
        "2026-08-23T18:00:00.000Z",
      );

    const secondFundedAt =
      new Date(
        "2026-08-23T20:00:00.000Z",
      );

    const result =
      planChallengeFundingState({
        participantSide:
          "right",

        verifiedFundingTxHash:
          "RIGHT123",

        fundingWalletAddress:
          "wolo1right",

        fundedAt:
          secondFundedAt,

        status:
          "creator_funded",

        scheduledAt:
          new Date(
            "2026-08-24T20:00:00.000Z",
          ),

        timingMode:
          "open",

        matchTime:
          null,

        acceptedAt:
          firstFundedAt,

        resultAt:
          null,

        liveConfirmedAt:
          null,

        settlementReadyAt:
          null,

        wagerAmountWolo:
          25,

        guaranteeAmountWolo:
          10,

        challengerFundingTxHash:
          "LEFT123",

        challengerFundingWalletAddress:
          "wolo1left",

        challengerFundedAt:
          firstFundedAt,

        challengedFundingTxHash:
          null,

        challengedFundingWalletAddress:
          null,

        challengedFundedAt:
          null,

        challengerCheckedInAt:
          null,

        challengedCheckedInAt:
          null,

        playBy:
          null,
      });

    assert.equal(
      result.nextShape
        .challengerFundingTxHash,
      "LEFT123",
    );

    assert.equal(
      result.nextShape
        .challengedFundingTxHash,
      "RIGHT123",
    );

    assert.equal(
      result.bothFunded,
      true,
    );

    assert.ok(
      result.playBy,
    );
  },
);


test(
  "pure funding policy cannot access chain, database or framework infrastructure",
  () => {
    assert.doesNotMatch(
      policy,
      /verifyChallengeFundingTransfer/,
    );

    assert.doesNotMatch(
      policy,
      /scheduledMatchFundingProof/,
    );

    assert.doesNotMatch(
      policy,
      /PrismaClient/,
    );

    assert.doesNotMatch(
      policy,
      /\$transaction/,
    );

    assert.doesNotMatch(
      policy,
      /next\//,
    );
  },
);


test(
  "funding command owns structured WoloChain verification",
  () => {
    assert.match(
      commands,
      /export async function fundChallenge/,
    );

    assert.match(
      commands,
      /verifyChallengeFundingTransfer/,
    );

    assert.match(
      commands,
      /participantSide/,
    );

    assert.match(
      commands,
      /wagerAmountWolo/,
    );

    assert.match(
      commands,
      /guaranteeAmountWolo/,
    );

    assert.doesNotMatch(
      route,
      /verifyChallengeFundingTransfer/,
    );
  },
);


test(
  "proof creation and match CAS remain inside one transaction and in that order",
  () => {
    const start =
      commands.indexOf(
        "export async function fundChallenge",
      );

    assert.ok(
      start >= 0,
    );

    const fundingCommand =
      commands.slice(
        start,
      );

    const transaction =
      fundingCommand.indexOf(
        "prisma.$transaction",
      );

    const proofCreate =
      fundingCommand.indexOf(
        "scheduledMatchFundingProof",
      );

    const matchCas =
      fundingCommand.indexOf(
        "scheduledMatch",
        proofCreate + 1,
      );

    const casUpdateMany =
      fundingCommand.indexOf(
        ".updateMany",
        matchCas,
      );

    assert.ok(
      transaction >= 0,
    );

    assert.ok(
      proofCreate >
      transaction,
    );

    assert.ok(
      casUpdateMany >
      proofCreate,
    );

    assert.match(
      fundingCommand,
      /funded\.count !==\s*1/,
    );

    assert.match(
      fundingCommand,
      /while the chain proof was being verified/,
    );
  },
);


test(
  "canonical proof registry retains global tx and match-side uniqueness",
  () => {
    assert.match(
      schema,
      /txHash\s+String\s+@unique/,
    );

    assert.match(
      schema,
      /@@unique\(\[scheduledMatchId, participantSide\]/,
    );

    assert.match(
      commands,
      /PrismaClientKnownRequestError/,
    );

    assert.match(
      commands,
      /error\.code ===\s*"P2002"/,
    );
  },
);


test(
  "structured verifier remains fail closed without settlement verification",
  () => {
    assert.match(
      verifier,
      /participant_side/,
    );

    assert.match(
      verifier,
      /expected_amount_uwolo/,
    );

    assert.match(
      verifier,
      /wager_uwolo/,
    );

    assert.match(
      verifier,
      /guarantee_uwolo/,
    );

    assert.match(
      verifier,
      /generic bank-send proves only sender\/recipient\/amount/i,
    );

    assert.match(
      verifier,
      /Structured WoloChain Challenge verification is unavailable/,
    );
  },
);


test(
  "HTTP funding branch is transport delegation only",
  () => {
    const start =
      route.indexOf(
        'if (action === "fund")',
      );

    const end =
      route.indexOf(
        'if (action === "check_in")',
      );

    assert.ok(
      start >= 0 &&
      end > start,
    );

    const family =
      route.slice(
        start,
        end,
      );

    assert.match(
      family,
      /await fundChallenge\(/,
    );

    for (
      const forbidden
      of [
        "$transaction",
        "scheduledMatchFundingProof",
        "scheduledMatch.updateMany",
        "verifyChallengeFundingTransfer",
        "recordChallengeActivity",
        "postChallengeInboxNotice",
        "recordUserActivity",
      ]
    ) {
      assert.equal(
        family.includes(
          forbidden,
        ),
        false,
        `HTTP funding branch still owns ${forbidden}`,
      );
    }
  },
);
