export type PublicTrafficPoint = {
  date: string;
  values: {
    totalTraffic: number;
    suspectedHuman: number;
    confirmedHuman: number;
  };
};

export type PublicTrafficPayload = {
  ok: true;
  startDate: string | null;
  coverageEndedAt: string | null;
  semantics: Record<string, unknown> | null;
  points: PublicTrafficPoint[];
};

type CanonicalTrafficPayload = {
  coverage_started_at?: string | null;
  coverage_ended_at?: string | null;
  semantics?: Record<string, unknown>;
  points?: Array<{
    date?: string;
    values?: {
      totalTraffic?: number;
      suspectedHuman?: number;
      confirmedHuman?: number;
    };
  }>;
};

function finiteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizePublicTrafficPayload(
  payload: CanonicalTrafficPayload,
  todayUtc = new Date().toISOString().slice(0, 10),
): PublicTrafficPayload {
  const points = Array.isArray(payload.points)
    ? payload.points
        .filter(
          (point) =>
            typeof point?.date === "string" &&
            point.date < todayUtc &&
            point.values,
        )
        .map((point) => {
          const totalTraffic = finiteNumber(point.values?.totalTraffic);
          const suspectedHuman = finiteNumber(point.values?.suspectedHuman);
          const confirmedHuman = finiteNumber(point.values?.confirmedHuman);

          if (
            totalTraffic < suspectedHuman ||
            suspectedHuman < confirmedHuman
          ) {
            throw new Error(
              `Canonical Traffic hierarchy failed on ${point.date}.`,
            );
          }

          return {
            date: point.date as string,
            values: {
              totalTraffic,
              suspectedHuman,
              confirmedHuman,
            },
          };
        })
    : [];

  return {
    ok: true,
    startDate: payload.coverage_started_at || null,
    coverageEndedAt: payload.coverage_ended_at || null,
    semantics: payload.semantics || null,
    points,
  };
}

export async function loadPublicTraffic(): Promise<PublicTrafficPayload> {
  const base = (
    process.env.TRAFFIC_API_BASE || "http://127.0.0.1:3345"
  ).replace(/\/+$/, "");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(
      `${base}/api/projects/aoe2hdbets/public-audience-series`,
      {
        cache: "no-store",
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      throw new Error(
        `Canonical Traffic upstream returned ${response.status}.`,
      );
    }

    return normalizePublicTrafficPayload(
      (await response.json()) as CanonicalTrafficPayload,
    );
  } finally {
    clearTimeout(timeout);
  }
}
