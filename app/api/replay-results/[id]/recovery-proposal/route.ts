import { NextRequest, NextResponse } from "next/server";
import { lstat, readFile, realpath } from "node:fs/promises";
import proposals from "@/docs/replay-receipts/zodiac-stats-only-proposals-2026-10-06.json";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";
import { buildMarketSnapshot, loadReplayResultReviewState } from "@/lib/replayResultAdjudications";
import { validateZodiacRecoveryProposal, verifyZodiacProposalArchive, type ZodiacRecoveryProposal } from "@/lib/zodiacRecoveryProposal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const id = Number((await context.params).id);
  const uid = await getSessionUid(request);
  const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
  if (!uid) return reply({ detail: "Admin session required." }, 401);
  if (!Number.isSafeInteger(id) || id <= 0) return reply({ detail: "Invalid replay ID." }, 400);
  const packet = proposals.proposals.find(p => p.gameStatsId === id);
  const state = await loadReplayResultReviewState(getPrisma(), uid, id);
  if (!state.access.isAdmin) return reply({ detail: "Admin review required." }, 403);
  if (!packet) return reply({ proposal: null });
  try {
    const financial = await buildMarketSnapshot(getPrisma(), id, [state.game.original_filename, state.game.replay_file]);
    const proposal = validateZodiacRecoveryProposal(packet as ZodiacRecoveryProposal, { ...state, financialSnapshot: financial.snapshot });
    const sha = proposal.payload.sourceReplayHash;
    const path = `/mnt/HC_Volume_105319120/aoe2-replay-archive/${sha.slice(0, 2)}/${sha.slice(2, 4)}/${sha}.aoe2record`;
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 64 * 1024 * 1024 || await realpath(path) !== path) throw new Error("proposal_archive_path_invalid");
    verifyZodiacProposalArchive(proposal, await readFile(path));
    return reply({ proposal, databaseWrites: 0 });
  } catch (error) {
    return reply({ detail: error instanceof Error ? error.message : "Proposal validation failed." }, 409);
  }
}
