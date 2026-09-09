"use client";

import type { AppearancePreferenceInput } from "@/lib/appearancePreference";

export type AppearancePayload = AppearancePreferenceInput & {
  updatedAt: string | null;
};

export async function fetchUserAppearancePreference() {
  const response = await fetch("/api/user/appearance", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Appearance request failed: ${response.status}`);
  }

  return (await response.json()) as AppearancePayload;
}

export async function saveUserAppearancePreference(input: AppearancePreferenceInput) {
  const response = await fetch("/api/user/appearance", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(`Appearance update failed: ${response.status}`);
  }

  return (await response.json()) as AppearancePayload;
}
