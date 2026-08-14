type GenerationLoad<T> = Promise<T>;

export type GenerationKeyedLoader<Source extends object, Value> = (
  source: Source,
  generation: string,
  loadFresh: () => Promise<Value>,
) => Promise<Value>;

/**
 * Coalesce and retain expensive projections by their authoritative generation.
 *
 * State is isolated per data-source object, so tests, scripts, and alternate
 * Prisma clients cannot leak values into one another. Rejected loads are never
 * retained. Keeping only the newest generation bounds memory while still
 * allowing every request that already joined an older in-flight load to finish.
 */
export function createGenerationKeyedLoader<Source extends object, Value>(
  maxGenerations = 1,
): GenerationKeyedLoader<Source, Value> {
  const retainedGenerationCount = Math.max(1, Math.floor(maxGenerations));
  const loadsBySource = new WeakMap<
    Source,
    Map<string, GenerationLoad<Value>>
  >();

  return (source, generation, loadFresh) => {
    let loads = loadsBySource.get(source);
    if (!loads) {
      loads = new Map<string, GenerationLoad<Value>>();
      loadsBySource.set(source, loads);
    }

    const existing = loads.get(generation);
    if (existing) {
      // Refresh insertion order so multi-generation users retain the most
      // recently requested generation rather than the most recently created.
      loads.delete(generation);
      loads.set(generation, existing);
      return existing;
    }

    const run = Promise.resolve()
      .then(loadFresh)
      .catch((error) => {
        if (loads?.get(generation) === run) {
          loads.delete(generation);
        }
        throw error;
      });

    loads.set(generation, run);

    while (loads.size > retainedGenerationCount) {
      const oldestGeneration = loads.keys().next().value;
      if (oldestGeneration === undefined) break;
      loads.delete(oldestGeneration);
    }

    return run;
  };
}
