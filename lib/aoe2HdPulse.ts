export type Aoe2HdPulseItem = {
  label: string;
  value: string;
  detail: string | null;
};

export type Aoe2HdPulseSnapshot = {
  sourceStatus: "ready" | "not_configured" | "error";
  sourceLabel: string | null;
  detail: string | null;
  steamHd: {
    openLobbies: number;
    openSeats: number | null;
    checkedAt: string | null;
  } | null;
  items: Aoe2HdPulseItem[];
};

type RawPulseItem = {
  label?: unknown;
  value?: unknown;
  detail?: unknown;
};

type RawPulsePayload = {
  steamHd?: {
    openLobbies?: unknown;
    open_lobbies?: unknown;
    lobbies?: unknown;
    openSeats?: unknown;
    open_seats?: unknown;
    seats?: unknown;
    checkedAt?: unknown;
    checked_at?: unknown;
  };
  items?: unknown;
};

function sourceLabelForUrl(value: string) {
  try {
    return new URL(value).host;
  } catch {
    return value;
  }
}

function coerceNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function coerceString(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maxLength) : "";
}

function normalizePulseItem(value: RawPulseItem): Aoe2HdPulseItem | null {
  const label = coerceString(value.label, 36);
  const displayValue = coerceString(value.value, 48);
  const detail = coerceString(value.detail, 90) || null;

  if (!label || !displayValue) {
    return null;
  }

  return {
    label,
    value: displayValue,
    detail,
  };
}

export function getEmptyAoe2HdPulseSnapshot(
  detail = "Configure AOE2HD_PULSE_URL to attach a live Steam HD lobby feed."
): Aoe2HdPulseSnapshot {
  return {
    sourceStatus: "not_configured",
    sourceLabel: null,
    detail,
    steamHd: null,
    items: [],
  };
}

export async function loadAoe2HdPulseSnapshot(): Promise<Aoe2HdPulseSnapshot> {
  const sourceUrl = process.env.AOE2HD_PULSE_URL?.trim();
  if (!sourceUrl) {
    return getEmptyAoe2HdPulseSnapshot();
  }

  try {
    const response = await fetch(sourceUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(4500),
      headers: {
        accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Pulse source returned ${response.status}`);
    }

    const payload = (await response.json()) as RawPulsePayload;
    const openLobbies = coerceNumber(
      payload.steamHd?.openLobbies ?? payload.steamHd?.open_lobbies ?? payload.steamHd?.lobbies
    );
    const openSeats = coerceNumber(
      payload.steamHd?.openSeats ?? payload.steamHd?.open_seats ?? payload.steamHd?.seats
    );
    const checkedAt =
      coerceString(payload.steamHd?.checkedAt ?? payload.steamHd?.checked_at, 40) || null;
    const rawItems = Array.isArray(payload.items) ? payload.items : [];

    return {
      sourceStatus: "ready",
      sourceLabel: sourceLabelForUrl(sourceUrl),
      detail: null,
      steamHd:
        openLobbies !== null
          ? {
              openLobbies: Math.max(0, Math.round(openLobbies)),
              openSeats: openSeats !== null ? Math.max(0, Math.round(openSeats)) : null,
              checkedAt,
            }
          : null,
      items: rawItems
        .map((item) => normalizePulseItem(item as RawPulseItem))
        .filter((item): item is Aoe2HdPulseItem => item !== null)
        .slice(0, 3),
    };
  } catch (error) {
    return {
      sourceStatus: "error",
      sourceLabel: sourceLabelForUrl(sourceUrl),
      detail: error instanceof Error ? error.message : "Pulse source unavailable.",
      steamHd: null,
      items: [],
    };
  }
}
