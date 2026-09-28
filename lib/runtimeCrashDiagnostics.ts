type RuntimeCrashDiagnosticGlobal = typeof globalThis & {
  __aoe2warRuntimeCrashDiagnosticsInstalled?: boolean;
};

function isClosedControllerError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as {
    code?: unknown;
    message?: unknown;
  };

  return (
    candidate.code === "ERR_INVALID_STATE" &&
    String(candidate.message ?? "").includes(
      "Controller is already closed",
    )
  );
}

function activeResourceCounts() {
  if (typeof process.getActiveResourcesInfo !== "function") {
    return {};
  }

  const counts: Record<string, number> = {};

  for (const resource of process.getActiveResourcesInfo()) {
    counts[resource] = (counts[resource] ?? 0) + 1;
  }

  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
}

function mib(bytes: number) {
  return Math.round((bytes / 1024 / 1024) * 10) / 10;
}

export function installRuntimeCrashDiagnostics() {
  const runtimeGlobal =
    globalThis as RuntimeCrashDiagnosticGlobal;

  if (
    runtimeGlobal
      .__aoe2warRuntimeCrashDiagnosticsInstalled
  ) {
    return;
  }

  runtimeGlobal
    .__aoe2warRuntimeCrashDiagnosticsInstalled = true;

  /*
   * Observe without intercepting. uncaughtExceptionMonitor fires before the
   * normal uncaughtException path and does not change Node's crash semantics.
   * This exists to turn the otherwise stackless Next/Node web-stream race into
   * actionable evidence on its next occurrence.
   */
  process.on(
    "uncaughtExceptionMonitor",
    (error, origin) => {
      if (!isClosedControllerError(error)) {
        return;
      }

      const memory = process.memoryUsage();

      const diagnostic = {
        kind:
          "aoe2war_runtime_closed_controller",
        at: new Date().toISOString(),
        origin,
        pid: process.pid,
        uptime_seconds:
          Math.round(process.uptime() * 10) /
          10,
        node: process.version,
        undici:
          (
            process.versions as Record<
              string,
              string | undefined
            >
          ).undici ?? null,
        build:
          process.env
            .NEXT_PUBLIC_AOE2WAR_BUILD_VERSION ??
          null,
        error: {
          name:
            error instanceof Error
              ? error.name
              : typeof error,
          message:
            error instanceof Error
              ? error.message
              : String(error),
          code:
            (
              error as {
                code?: unknown;
              }
            )?.code ?? null,
          stack:
            error instanceof Error
              ? error.stack?.slice(0, 12_000) ??
                null
              : null,
        },
        memory_mib: {
          rss: mib(memory.rss),
          heap_used: mib(memory.heapUsed),
          heap_total: mib(memory.heapTotal),
          external: mib(memory.external),
          array_buffers: mib(
            memory.arrayBuffers,
          ),
        },
        active_resources:
          activeResourceCounts(),
      };

      console.error(
        "[AOE2WAR_RUNTIME_CRASH_DIAGNOSTIC]",
        JSON.stringify(diagnostic),
      );
    },
  );
}
