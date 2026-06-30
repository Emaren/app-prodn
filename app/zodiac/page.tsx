import type { Metadata } from "next";
import { notFound } from "next/navigation";

import ZodiacTrainingPage from "@/components/zodiac/ZodiacTrainingPage";
import { avatarUrlForUser } from "@/lib/avatarAssets";
import { loadClaimedPlayerProfile } from "@/lib/playerProfile";
import { getPrisma } from "@/lib/prisma";
import {
  selectFeaturedZodiacMatches,
  ZODIAC_TRAINING_CONFIG,
} from "@/lib/zodiacTraining";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Train Under Zodiac",
  description:
    "Learn AoE2 HD Deathmatch with Zodiac. Upload a replay, request a review, study civ answers, and enter the Challenge Hall.",
  alternates: {
    canonical: "/zodiac",
  },
  openGraph: {
    title: "Train Under Zodiac",
    description:
      "Deathmatch is jazz. Learn the rhythm from one of HD’s old-war killers.",
    url: "/zodiac",
    type: "website",
  },
};

async function loadZodiacProfile() {
  try {
    return await loadClaimedPlayerProfile(
      getPrisma(),
      ZODIAC_TRAINING_CONFIG.userUid
    );
  } catch (error) {
    console.warn(
      `Zodiac training profile rail unavailable: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return null;
  }
}

async function loadZodiacWalletAddress() {
  try {
    const advisor = await getPrisma().user.findUnique({
      where: { uid: ZODIAC_TRAINING_CONFIG.userUid },
      select: { walletAddress: true },
    });
    return advisor?.walletAddress?.trim() || null;
  } catch (error) {
    console.warn(
      `Zodiac advisor wallet unavailable: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return null;
  }
}

export default async function ZodiacPage() {
  if (!ZODIAC_TRAINING_CONFIG.enabled) {
    notFound();
  }

  const [profile, advisorWalletAddress] = await Promise.all([
    loadZodiacProfile(),
    loadZodiacWalletAddress(),
  ]);
  const mentorName = profile?.displayName || "Zodiac";
  const profileHref =
    profile?.href || `/players/${ZODIAC_TRAINING_CONFIG.userUid}`;
  const avatarBaseUrl = avatarUrlForUser(
    ZODIAC_TRAINING_CONFIG.userUid,
    mentorName
  );
  const avatarUrl = `${avatarBaseUrl}${
    avatarBaseUrl.includes("?") ? "&" : "?"
  }size=card`;
  const featuredMatches = selectFeaturedZodiacMatches(
    profile?.matchFeed.items || []
  );

  return (
    <ZodiacTrainingPage
      config={ZODIAC_TRAINING_CONFIG}
      mentorName={mentorName}
      avatarUrl={avatarUrl}
      profileHref={profileHref}
      featuredMatches={featuredMatches}
      totalMatches={profile?.matchFeed.totalMatches || 0}
      advisorWalletAddress={advisorWalletAddress}
    />
  );
}
