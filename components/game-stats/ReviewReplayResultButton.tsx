"use client";

import Link from "next/link";

import { useUserAuth } from "@/context/UserAuthContext";

export default function ReviewReplayResultButton({
  gameStatsId,
  submitterUids,
}: {
  gameStatsId: number;
  submitterUids: Array<string | null | undefined>;
}) {
  const { uid, isAdmin, canReviewOwnReplayResults, loading } = useUserAuth();

  if (loading) return null;

  const submittedByViewer = Boolean(
    uid && submitterUids.some((submitterUid) => submitterUid === uid)
  );
  if (!isAdmin && !(canReviewOwnReplayResults && submittedByViewer)) return null;

  return (
    <Link
      href={`/game-stats/${gameStatsId}/review`}
      className="w-full rounded-full border border-amber-200/35 bg-amber-300 px-5 py-3 text-center text-sm font-black text-slate-950 transition hover:bg-amber-200 sm:w-auto"
    >
      Review Result / Desync
    </Link>
  );
}
