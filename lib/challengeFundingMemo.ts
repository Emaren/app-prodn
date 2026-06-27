const WOLO_DECIMAL_FACTOR = 1_000_000;

function toChallengeUwoloAmount(amountWolo: number) {
  return String(Math.max(0, Math.round(amountWolo * WOLO_DECIMAL_FACTOR)));
}

export function buildChallengeFundingMemo(input: {
  challengeId: number;
  wagerAmountWolo: number;
  guaranteeAmountWolo: number;
  participantSide: "left" | "right";
}) {
  const wagerUwolo = toChallengeUwoloAmount(input.wagerAmountWolo);
  const guaranteeUwolo = toChallengeUwoloAmount(input.guaranteeAmountWolo);
  const totalFundingWolo = input.wagerAmountWolo + input.guaranteeAmountWolo;
  const settlementRunId = `aoe2hdbets:challenge-${input.challengeId}:v1`;
  return [
    "wolo.challenge.funding.v1:app=aoe2hdbets",
    `sid=${settlementRunId}`,
    `cid=${input.challengeId}`,
    `side=${input.participantSide}`,
    `w=${wagerUwolo}`,
    `g=${guaranteeUwolo}`,
    `t=${toChallengeUwoloAmount(totalFundingWolo)}`,
  ].join("&");
}
