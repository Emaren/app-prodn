import { NextRequest, NextResponse } from "next/server";

import {
  FORGE_ACTIVE_COMMITMENT_STATUSES,
  FORGE_DEED_CLASSES,
  FORGE_MILESTONE_STATUSES,
  FORGE_PROJECT_STATUSES,
  loadKingdomForgeSnapshot,
  lockForgeActor,
  normalizeForgeCommitmentWolo,
  type ForgeDeedClass,
} from "@/lib/kingdomForge";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";
import { forgeEligiblePrincipalWolo } from "@/lib/stakingRewardCap";
import { isWoloMainnet } from "@/lib/woloChain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

async function requireViewer(request: NextRequest) {
  const uid = await getSessionUid(request);
  if (!uid) {
    return {
      error: NextResponse.json(
        { detail: "Sign in with Steam to enter the Kingdom Forge." },
        { status: 401, headers: NO_STORE_HEADERS },
      ),
    };
  }

  const prisma = getPrisma();
  const viewer = await prisma.user.findUnique({
    where: { uid },
    select: {
      id: true,
      uid: true,
      isAdmin: true,
      inGameName: true,
      steamPersonaName: true,
    },
  });

  if (!viewer) {
    return {
      error: NextResponse.json(
        { detail: "Your AoE2WAR identity could not be found." },
        { status: 404, headers: NO_STORE_HEADERS },
      ),
    };
  }

  return { prisma, viewer };
}

function cleanText(value: unknown, limit: number) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, limit);
}

export async function GET(request: NextRequest) {
  try {
    const uid = await getSessionUid(request);
    const snapshot = await loadKingdomForgeSnapshot(getPrisma(), uid);
    return NextResponse.json(snapshot, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error("Kingdom Forge load failed:", error);
    return NextResponse.json(
      { detail: "The Forge ledger could not be opened." },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireViewer(request);
    if ("error" in actor) return actor.error;
    const { prisma, viewer } = actor;
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const action = cleanText(body.action, 40);

    if (action === "commit") {
      const slug = cleanText(body.projectSlug, 80);
      const amountWolo = normalizeForgeCommitmentWolo(body.amountWolo);
      if (!slug || !amountWolo) {
        return NextResponse.json(
          { detail: "Choose a project and a whole-WOLO commitment." },
          { status: 400, headers: NO_STORE_HEADERS },
        );
      }

      const snapshot = await loadKingdomForgeSnapshot(prisma, viewer.uid);
      if (snapshot.stakeLedger.health !== "ok") {
        return NextResponse.json(
          { detail: snapshot.stakeLedger.detail },
          { status: 503, headers: NO_STORE_HEADERS },
        );
      }
      const forgeCapacityWolo = snapshot.viewer?.forgeCapacityWolo ?? 0;
      if (forgeCapacityWolo <= 0) {
        return NextResponse.json(
          {
            detail:
              "Forge capacity begins above the 1,000,000 WOLO Kingdom Stake lane.",
          },
          { status: 409, headers: NO_STORE_HEADERS },
        );
      }

      await prisma.$transaction(async (tx) => {
        await lockForgeActor(tx, viewer.id);
        const [project, lockedPosition] = await Promise.all([
          tx.forgeProject.findUnique({
            where: { slug },
            select: { id: true, title: true, status: true },
          }),
          tx.stakingPosition.findUnique({
            where: { userId: viewer.id },
            select: {
              currentStakedWolo: true,
              compoundedRewardsWolo: true,
              status: true,
            },
          }),
        ]);
        if (!project) throw new Error("FORGE_PROJECT_NOT_FOUND");
        if (!["gathering", "authorized", "building"].includes(project.status)) {
          throw new Error("FORGE_PROJECT_CLOSED");
        }
        const lockedStakeWolo =
          lockedPosition?.status === "active"
            ? lockedPosition.currentStakedWolo +
              (isWoloMainnet() ? lockedPosition.compoundedRewardsWolo : 0)
            : 0;
        const lockedForgeCapacityWolo = forgeEligiblePrincipalWolo(
          Math.min(snapshot.viewer?.stakedWolo ?? 0, lockedStakeWolo),
        );
        if (lockedForgeCapacityWolo <= 0) {
          throw new Error("FORGE_CAPACITY_EXCEEDED");
        }

        const [existing, active] = await Promise.all([
          tx.forgeCommitment.findUnique({
            where: {
              projectId_userId: { projectId: project.id, userId: viewer.id },
            },
            select: { amountWolo: true, status: true, settlementMode: true },
          }),
          tx.forgeCommitment.aggregate({
            where: {
              userId: viewer.id,
              status: { in: [...FORGE_ACTIVE_COMMITMENT_STATUSES] },
            },
            _sum: { amountWolo: true },
          }),
        ]);

        if (
          existing &&
          FORGE_ACTIVE_COMMITMENT_STATUSES.includes(
            existing.status as (typeof FORGE_ACTIVE_COMMITMENT_STATUSES)[number],
          ) &&
          (existing.status === "funded" ||
            existing.settlementMode !== "app_signal")
        ) {
          throw new Error("FORGE_FUNDED_COMMITMENT_IMMUTABLE");
        }
        if (
          existing?.status === "signalled" &&
          existing.settlementMode === "app_signal" &&
          Number(existing.amountWolo) === amountWolo
        ) {
          return;
        }

        const activeTotal = Number(active._sum.amountWolo ?? BigInt(0));
        const existingActive =
          existing &&
          FORGE_ACTIVE_COMMITMENT_STATUSES.includes(
            existing.status as (typeof FORGE_ACTIVE_COMMITMENT_STATUSES)[number],
          )
            ? Number(existing.amountWolo)
            : 0;
        const otherCommitments = Math.max(0, activeTotal - existingActive);
        if (otherCommitments + amountWolo > lockedForgeCapacityWolo) {
          throw new Error("FORGE_CAPACITY_EXCEEDED");
        }

        await tx.forgeCommitment.upsert({
          where: {
            projectId_userId: { projectId: project.id, userId: viewer.id },
          },
          update: {
            amountWolo: BigInt(amountWolo),
            status: "signalled",
            settlementMode: "app_signal",
            fundingMemo: null,
            fundingTxHash: null,
            confirmedAt: null,
          },
          create: {
            projectId: project.id,
            userId: viewer.id,
            amountWolo: BigInt(amountWolo),
            status: "signalled",
            settlementMode: "app_signal",
          },
        });
        await tx.forgeEvent.create({
          data: {
            projectId: project.id,
            actorUserId: viewer.id,
            eventType: existing ? "commitment_recast" : "commitment_signalled",
            detail: `${viewer.inGameName || viewer.steamPersonaName || viewer.uid} signalled Forge Power for ${project.title}.`,
            amountWolo: BigInt(amountWolo),
            metadata: {
              settlementMode: "app_signal",
              rewardCapScope: "linked_aoe2war_identity",
            },
          },
        });
      });
    } else if (action === "withdraw") {
      const slug = cleanText(body.projectSlug, 80);
      await prisma.$transaction(async (tx) => {
        await lockForgeActor(tx, viewer.id);
        const project = await tx.forgeProject.findUnique({
          where: { slug },
          select: { id: true, title: true },
        });
        if (!project) throw new Error("FORGE_PROJECT_NOT_FOUND");
        const commitment = await tx.forgeCommitment.findUnique({
          where: {
            projectId_userId: { projectId: project.id, userId: viewer.id },
          },
        });
        if (!commitment) throw new Error("FORGE_COMMITMENT_NOT_FOUND");
        if (
          commitment.status === "funded" ||
          commitment.settlementMode !== "app_signal"
        ) {
          throw new Error("FORGE_FUNDED_WITHDRAWAL_REQUIRES_SETTLEMENT");
        }
        if (!FORGE_ACTIVE_COMMITMENT_STATUSES.includes(
          commitment.status as (typeof FORGE_ACTIVE_COMMITMENT_STATUSES)[number],
        )) {
          throw new Error("FORGE_COMMITMENT_NOT_ACTIVE");
        }

        await tx.forgeCommitment.update({
          where: { id: commitment.id },
          data: { status: "withdrawn" },
        });
        await tx.forgeEvent.create({
          data: {
            projectId: project.id,
            actorUserId: viewer.id,
            eventType: "commitment_withdrawn",
            detail: `Forge Power signal withdrawn from ${project.title}.`,
            amountWolo: commitment.amountWolo,
            metadata: { settlementMode: commitment.settlementMode },
          },
        });
      });
    } else if (action === "set_project_status") {
      if (!viewer.isAdmin) {
        return NextResponse.json(
          { detail: "Operator authority required." },
          { status: 403, headers: NO_STORE_HEADERS },
        );
      }
      const slug = cleanText(body.projectSlug, 80);
      const status = cleanText(body.status, 24);
      if (!FORGE_PROJECT_STATUSES.includes(status as never)) {
        return NextResponse.json(
          { detail: "Unknown Forge project status." },
          { status: 400, headers: NO_STORE_HEADERS },
        );
      }
      await prisma.$transaction(async (tx) => {
        const project = await tx.forgeProject.update({
          where: { slug },
          data: {
            status,
            shippedAt: status === "shipped" ? new Date() : null,
          },
          select: { id: true, title: true },
        });
        await tx.forgeEvent.create({
          data: {
            projectId: project.id,
            actorUserId: viewer.id,
            eventType: `project_${status}`,
            detail: `${project.title} entered the ${status} lane.`,
            metadata: { status },
          },
        });
      });
    } else if (action === "set_milestone_status") {
      if (!viewer.isAdmin) {
        return NextResponse.json(
          { detail: "Operator authority required." },
          { status: 403, headers: NO_STORE_HEADERS },
        );
      }
      const milestoneId = Number(body.milestoneId);
      const status = cleanText(body.status, 24);
      if (
        !Number.isInteger(milestoneId) ||
        milestoneId <= 0 ||
        !FORGE_MILESTONE_STATUSES.includes(status as never)
      ) {
        return NextResponse.json(
          { detail: "Valid milestone and status are required." },
          { status: 400, headers: NO_STORE_HEADERS },
        );
      }
      await prisma.$transaction(async (tx) => {
        const milestone = await tx.forgeMilestone.update({
          where: { id: milestoneId },
          data: {
            status,
            completedAt: status === "proven" ? new Date() : null,
          },
          include: { project: { select: { id: true, title: true } } },
        });
        await tx.forgeEvent.create({
          data: {
            projectId: milestone.project.id,
            actorUserId: viewer.id,
            eventType: "milestone_status",
            detail: `${milestone.project.title} · ${milestone.title} is ${status}.`,
            metadata: { milestoneId, sequence: milestone.sequence, status },
          },
        });
      });
    } else if (action === "grant_deeds") {
      if (!viewer.isAdmin) {
        return NextResponse.json(
          { detail: "Operator authority required." },
          { status: 403, headers: NO_STORE_HEADERS },
        );
      }
      const slug = cleanText(body.projectSlug, 80);
      const recipientUid = cleanText(body.recipientUid, 100);
      const deedClass = cleanText(body.deedClass, 24) as ForgeDeedClass;
      const quantity = Number(body.quantity);
      const sourceRef = cleanText(body.sourceRef, 180);
      if (
        !recipientUid ||
        !FORGE_DEED_CLASSES.includes(deedClass) ||
        !Number.isInteger(quantity) ||
        quantity <= 0 ||
        !sourceRef
      ) {
        return NextResponse.json(
          { detail: "Recipient, deed class, quantity, and source reference are required." },
          { status: 400, headers: NO_STORE_HEADERS },
        );
      }

      await prisma.$transaction(async (tx) => {
        const [project, recipient] = await Promise.all([
          tx.forgeProject.findUnique({ where: { slug } }),
          tx.user.findUnique({ where: { uid: recipientUid }, select: { id: true } }),
        ]);
        if (!project || !recipient) throw new Error("FORGE_DEED_TARGET_NOT_FOUND");
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${684212}, ${project.id})`;
        const existingSource = await tx.forgeDeedHolding.findUnique({
          where: { sourceRef },
          select: {
            projectId: true,
            userId: true,
            deedClass: true,
            quantity: true,
          },
        });
        if (existingSource) {
          if (
            existingSource.projectId === project.id &&
            existingSource.userId === recipient.id &&
            existingSource.deedClass === deedClass &&
            existingSource.quantity === quantity
          ) {
            return;
          }
          throw new Error("FORGE_DEED_SOURCE_CONFLICT");
        }
        const aggregate = await tx.forgeDeedHolding.aggregate({
          where: { projectId: project.id, deedClass },
          _sum: { quantity: true },
        });
        const classLimit =
          deedClass === "patron"
            ? project.patronDeeds
            : deedClass === "builder"
              ? project.builderDeeds
              : project.kingdomDeeds;
        if ((aggregate._sum.quantity ?? 0) + quantity > classLimit) {
          throw new Error("FORGE_DEED_SUPPLY_EXCEEDED");
        }
        await tx.forgeDeedHolding.create({
          data: {
            projectId: project.id,
            userId: recipient.id,
            deedClass,
            quantity,
            sourceRef,
            rightsMode: "provenance_governance",
          },
        });
        await tx.forgeEvent.create({
          data: {
            projectId: project.id,
            actorUserId: viewer.id,
            eventType: "deeds_issued",
            detail: `${quantity.toLocaleString()} ${deedClass} deeds entered the project provenance ledger.`,
            metadata: { recipientUid, deedClass, quantity, sourceRef },
          },
        });
      });
    } else {
      return NextResponse.json(
        { detail: "Unknown Forge action." },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    return NextResponse.json(
      await loadKingdomForgeSnapshot(prisma, viewer.uid),
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "FORGE_ACTION_FAILED";
    const messages: Record<string, string> = {
      FORGE_PROJECT_NOT_FOUND: "That Forge project does not exist.",
      FORGE_PROJECT_CLOSED: "That project is not accepting Forge Power.",
      FORGE_CAPACITY_EXCEEDED:
        "That signal exceeds the Forge capacity above your first 1,000,000 WOLO.",
      FORGE_COMMITMENT_NOT_FOUND: "No active signal exists for that project.",
      FORGE_COMMITMENT_NOT_ACTIVE: "That Forge Power signal is no longer active.",
      FORGE_FUNDED_COMMITMENT_IMMUTABLE:
        "Verified project funding is sealed; use the dedicated settlement rail to change it.",
      FORGE_FUNDED_WITHDRAWAL_REQUIRES_SETTLEMENT:
        "A chain-funded commitment must use its settlement and refund rail.",
      FORGE_DEED_TARGET_NOT_FOUND: "The project or deed recipient was not found.",
      FORGE_DEED_SOURCE_CONFLICT:
        "That deed source reference already belongs to a different grant.",
      FORGE_DEED_SUPPLY_EXCEEDED: "That grant exceeds the sealed deed-class supply.",
    };
    console.error("Kingdom Forge action failed:", error);
    return NextResponse.json(
      { detail: messages[code] || "The Forge could not record that action." },
      { status: messages[code] ? 409 : 500, headers: NO_STORE_HEADERS },
    );
  }
}
