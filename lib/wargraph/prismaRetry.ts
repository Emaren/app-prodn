export const PRISMA_WRITE_CONFLICT_MAX_ATTEMPTS = 4;
export const PRISMA_WRITE_CONFLICT_RETRY_BASE_MS = 15;

function prismaErrorCode(error: unknown): string {
  return error && typeof error === "object" && "code" in error
    ? String(error.code)
    : "";
}

export async function retryPrismaWriteConflict<T>(
  operation: () => Promise<T>,
  sleep: (delayMs: number) => Promise<void> = async (delayMs) => {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, delayMs);
    });
  },
): Promise<T> {
  for (
    let attempt = 1;
    attempt <= PRISMA_WRITE_CONFLICT_MAX_ATTEMPTS;
    attempt += 1
  ) {
    try {
      return await operation();
    } catch (error) {
      if (
        prismaErrorCode(error) !== "P2034" ||
        attempt === PRISMA_WRITE_CONFLICT_MAX_ATTEMPTS
      ) {
        throw error;
      }
      await sleep(attempt * PRISMA_WRITE_CONFLICT_RETRY_BASE_MS);
    }
  }
  throw new Error("PRISMA_WRITE_CONFLICT_RETRY_EXHAUSTED");
}
