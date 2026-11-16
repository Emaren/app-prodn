const WATCHER_EXPLAINER = "why watchers matter";

// This is hero marketing copy only. Never mutate the canonical forum thread.
export function isWatcherExplainerStory(title: string): boolean {
  return title.trim().toLowerCase() === WATCHER_EXPLAINER;
}

export function homeChronicleHeadline(title: string): string {
  return isWatcherExplainerStory(title)
    ? "Run a Watcher. Track Your Stats."
    : title;
}
