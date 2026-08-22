"use client";

import { useCallback, useEffect, useState } from "react";

import { normalizeReactionEmoji } from "@/lib/reactionEmoji";

export const REACTION_MRU_STORAGE_KEY = "aoe2war:chat:reaction-mru";
export const REACTION_MRU_EVENT = "aoe2war:chat:reaction-mru-change";
export const REACTION_MRU_LIMIT = 12;

function normalizeReactionList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const candidate of value) {
    const emoji = normalizeReactionEmoji(candidate);
    if (!emoji || seen.has(emoji)) continue;
    seen.add(emoji);
    result.push(emoji);
    if (result.length >= REACTION_MRU_LIMIT) break;
  }
  return result;
}

export function readReactionMru(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return normalizeReactionList(
      JSON.parse(window.localStorage.getItem(REACTION_MRU_STORAGE_KEY) || "[]"),
    );
  } catch {
    return [];
  }
}

export function rememberReactionEmoji(value: string): string[] {
  const emoji = normalizeReactionEmoji(value);
  if (!emoji || typeof window === "undefined") return readReactionMru();
  const next = [emoji, ...readReactionMru().filter((entry) => entry !== emoji)].slice(
    0,
    REACTION_MRU_LIMIT,
  );
  window.localStorage.setItem(REACTION_MRU_STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(REACTION_MRU_EVENT, { detail: next }));
  return next;
}

export function useReactionMru() {
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    setRecent(readReactionMru());

    const handleStorage = (event: StorageEvent) => {
      if (event.key === REACTION_MRU_STORAGE_KEY) setRecent(readReactionMru());
    };
    const handleChange = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      setRecent(normalizeReactionList(detail));
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(REACTION_MRU_EVENT, handleChange);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(REACTION_MRU_EVENT, handleChange);
    };
  }, []);

  const remember = useCallback((emoji: string) => {
    setRecent(rememberReactionEmoji(emoji));
  }, []);

  return { recent, remember };
}
