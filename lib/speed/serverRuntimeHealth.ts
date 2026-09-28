type ServerLoopSamplerState = {
  samples: number[];
  expectedAt: number;
  timer: ReturnType<typeof setInterval>;
};

type GlobalWithSpeedLoop = typeof globalThis & {
  __aoe2warSpeedLoopSampler?: ServerLoopSamplerState;
};

const SAMPLE_INTERVAL_MS = 1_000;
const MAX_SAMPLES = 60;

function ensureSampler() {
  const target =
    globalThis as GlobalWithSpeedLoop;

  if (target.__aoe2warSpeedLoopSampler) {
    return target.__aoe2warSpeedLoopSampler;
  }

  const state = {
    samples: [] as number[],
    expectedAt:
      Date.now() +
      SAMPLE_INTERVAL_MS,
    timer: null as unknown as ReturnType<typeof setInterval>,
  };

  state.timer = setInterval(() => {
    const now = Date.now();
    const lag = Math.max(
      0,
      now - state.expectedAt,
    );

    state.samples.push(lag);

    if (
      state.samples.length >
      MAX_SAMPLES
    ) {
      state.samples.splice(
        0,
        state.samples.length -
          MAX_SAMPLES,
      );
    }

    state.expectedAt =
      now +
      SAMPLE_INTERVAL_MS;
  }, SAMPLE_INTERVAL_MS);

  /*
   * The sampler observes the existing server process; it must never become a
   * lifecycle reason that keeps a draining Next process alive.
   */
  state.timer.unref?.();

  target.__aoe2warSpeedLoopSampler =
    state;

  return state;
}

function percentile(
  values: number[],
  fraction: number,
) {
  if (!values.length) {
    return 0;
  }

  const sorted =
    [...values].sort(
      (left, right) =>
        left - right,
    );
  const index =
    (sorted.length - 1) *
    fraction;
  const lower =
    Math.floor(index);
  const upper =
    Math.ceil(index);

  if (lower === upper) {
    return sorted[lower];
  }

  return (
    sorted[lower] *
      (upper - index) +
    sorted[upper] *
      (index - lower)
  );
}

/**
 * Rolling event-loop scheduling delay for the current Next server process.
 *
 * One one-second unref'ed timer retains at most 60 scalar samples. This is
 * deliberately independent from route/browser telemetry: a large value proves
 * the server process itself was unable to schedule promptly.
 */
export function readServerEventLoopHealth() {
  const samples =
    ensureSampler().samples;

  return {
    sample_count:
      samples.length,
    p50_ms:
      Math.round(
        percentile(
          samples,
          0.5,
        ) * 10,
      ) / 10,
    p95_ms:
      Math.round(
        percentile(
          samples,
          0.95,
        ) * 10,
      ) / 10,
    max_ms:
      samples.length
        ? Math.max(...samples)
        : 0,
    window_seconds:
      MAX_SAMPLES,
  };
}

/*
 * Start sampling as soon as a server bundle imports this module, rather than
 * waiting for the first observatory click.
 */
ensureSampler();
