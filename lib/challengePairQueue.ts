export type ChallengePairQueueRow = {
  id: number;
  challengerUserId: number;
  challengedUserId: number;
  createdAt: Date | string;
};

function timeValue(
  value: Date | string,
) {
  const date =
    value instanceof Date
      ? value
      : new Date(value);

  const time =
    date.getTime();

  return Number.isFinite(
    time,
  )
    ? time
    : 0;
}

export function challengePairKey(
  leftUserId: number,
  rightUserId: number,
) {
  return [
    leftUserId,
    rightUserId,
  ]
    .sort(
      (left, right) =>
        left - right,
    )
    .join(":");
}

export function challengeDirectionKey(
  challengerUserId: number,
  challengedUserId: number,
) {
  return `${challengerUserId}:${challengedUserId}`;
}

export function compareChallengePairQueueOrder(
  left: Pick<
    ChallengePairQueueRow,
    "id" | "createdAt"
  >,
  right: Pick<
    ChallengePairQueueRow,
    "id" | "createdAt"
  >,
) {
  const timeDelta =
    timeValue(
      left.createdAt,
    ) -
    timeValue(
      right.createdAt,
    );

  return (
    timeDelta ||
    left.id -
      right.id
  );
}

export function challengePairQueueLeader<
  T extends ChallengePairQueueRow,
>(
  rows: readonly T[],
) {
  return (
    [...rows].sort(
      compareChallengePairQueueOrder,
    )[0] ??
    null
  );
}

export function challengePairQueueLeaders<
  T extends ChallengePairQueueRow,
>(
  rows: readonly T[],
) {
  const buckets =
    new Map<
      string,
      T[]
    >();

  for (const row of rows) {
    const key =
      challengePairKey(
        row.challengerUserId,
        row.challengedUserId,
      );

    const bucket =
      buckets.get(
        key,
      ) ??
      [];

    bucket.push(
      row,
    );

    buckets.set(
      key,
      bucket,
    );
  }

  const leaders =
    new Map<
      string,
      T
    >();

  for (const [
    key,
    bucket,
  ] of buckets) {
    const leader =
      challengePairQueueLeader(
        bucket,
      );

    if (leader) {
      leaders.set(
        key,
        leader,
      );
    }
  }

  return leaders;
}
