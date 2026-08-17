type EvidenceRecord = Record<string, unknown>;

function asRecord(value: unknown): EvidenceRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as EvidenceRecord)
    : null;
}

function gameId(value: unknown) {
  const record = asRecord(value);
  if (!record) return null;
  const raw = record.id;
  const numeric = typeof raw === "number" ? raw : Number(raw);
  return Number.isSafeInteger(numeric) && numeric > 0 ? String(numeric) : null;
}

export function filterPairArchivePagesToSharedGameIds<T>(pages: T[]): T[] {
  const loaded = pages.flatMap((entry) => {
    const wrapper = asRecord(entry);
    if (!wrapper) return [];

    const page = asRecord(wrapper.page);
    const items = page && Array.isArray(page.items) ? page.items : null;

    return items
      ? [{ wrapper, page, items }]
      : [];
  });

  // Pair truth requires two independently resolved archives. If either side is
  // unavailable, fail closed instead of trusting one name-keyed archive.
  if (loaded.length < 2) return [];

  let shared: Set<string> | null = null;

  for (const source of loaded) {
    const ids = new Set<string>();

    for (const item of source.items) {
      const id = gameId(item);
      if (id) ids.add(id);
    }

    if (shared === null) {
      shared = ids;
      continue;
    }

    const nextShared = new Set<string>();

    for (const id of shared) {
      if (ids.has(id)) {
        nextShared.add(id);
      }
    }

    shared = nextShared;
  }

  const sharedIds: Set<string> =
    shared ?? new Set<string>();

  return loaded.map(({ wrapper, page, items }) => ({
    ...wrapper,
    page: {
      ...page,
      items: items.filter((item) => {
        const id = gameId(item);
        return Boolean(id && sharedIds.has(id));
      }),
    },
  })) as unknown as T[];
}
