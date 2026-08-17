export type PairArchiveProfileIdentity =
  | {
      kind: "claimed";
      uid: string;
    }
  | {
      kind: "replay";
      name: string;
    };

type IdentityEntry = Record<string, unknown>;

function normalize(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase();
}

function exactObservedNames(entry: IdentityEntry) {
  const values: string[] = [];

  for (const key of [
    "name",
    "currentName",
    "latestObservedName",
    "inGameName",
    "steamPersonaName",
  ]) {
    const value = String(entry[key] ?? "").trim();
    if (value) values.push(value);
  }

  if (Array.isArray(entry.aliases)) {
    for (const value of entry.aliases) {
      const text = String(value ?? "").trim();
      if (text) values.push(text);
    }
  }

  if (Array.isArray(entry.nameHistory)) {
    for (const value of entry.nameHistory) {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        continue;
      }

      const text = String(
        (value as Record<string, unknown>).name ?? "",
      ).trim();

      if (text) values.push(text);
    }
  }

  return values;
}

export function resolveExactPairArchiveIdentityFromEntries(
  entries: unknown[],
  queryPlayer: string,
): PairArchiveProfileIdentity {
  const queryKey = normalize(queryPlayer);

  if (!queryKey) {
    return {
      kind: "replay",
      name: queryPlayer,
    };
  }

  const candidates = entries.filter((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }

    const entry = value as IdentityEntry;

    return exactObservedNames(entry).some(
      (name) => normalize(name) === queryKey,
    );
  }) as IdentityEntry[];

  // Fail closed on ambiguous names. Never choose an arbitrary account.
  if (candidates.length !== 1) {
    return {
      kind: "replay",
      name: queryPlayer,
    };
  }

  const candidate = candidates[0];
  const uid = String(candidate.uid ?? "").trim();

  if (candidate.claimed === true && uid) {
    return {
      kind: "claimed",
      uid,
    };
  }

  return {
    kind: "replay",
    name: queryPlayer,
  };
}

export function pairArchivePublicMatchPath(
  identity: PairArchiveProfileIdentity,
  cursor: number,
  limit: number,
) {
  const params = new URLSearchParams();

  params.set("kind", identity.kind);

  if (identity.kind === "claimed") {
    params.set("uid", identity.uid);
  } else {
    params.set("name", identity.name);
  }

  params.set("cursor", String(Math.max(0, Math.round(cursor || 0))));
  params.set("limit", String(Math.max(1, Math.round(limit || 1))));

  return `/api/player-profile/matches?${params.toString()}`;
}
