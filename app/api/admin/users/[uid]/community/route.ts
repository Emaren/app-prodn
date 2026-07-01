import { NextRequest, NextResponse } from "next/server";

import {
  buildHonorLabel,
  loadUserCommunitySummaries,
  normalizeBadgeLabel,
  normalizeGiftKind,
  normalizeHonorKind,
  normalizeHonorTitle,
} from "@/lib/communityHonors";
import {
  getOrCreateConversationByUsers,
  resolvePrimaryAdminContact,
} from "@/lib/contactInbox";
import { rescindPendingWoloClaim } from "@/lib/pendingWoloClaims";
import { recordUserActivity } from "@/lib/userExperience";
import { requireAdmin } from "@/lib/adminSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseAmount(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return Math.max(0, parsed);
    }
  }

  return null;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ uid: string }> }
) {
  try {
    const gate = await requireAdmin(request);
    if ("error" in gate) {
      return gate.error;
    }

    const { prisma, user: admin } = gate;
    const { uid } = await context.params;
    const target = await prisma.user.findUnique({
      where: { uid },
      select: { id: true, uid: true, inGameName: true, steamPersonaName: true },
    });

    if (!target) {
      return NextResponse.json({ detail: "User not found" }, { status: 404 });
    }

    const payload = (await request.json().catch(() => ({}))) as {
      action?: string;
      badgeId?: number;
      giftId?: number;
      claimId?: number;
      label?: string;
      title?: string;
      note?: string;
      kind?: string;
      honorKind?: string;
      clanSlug?: string;
      displayOnProfile?: boolean;
      amount?: number | string;
    };

    switch (payload.action) {
      case "add_badge": {
        const label = normalizeBadgeLabel(payload.label || "");
        const note = typeof payload.note === "string" ? payload.note.trim().slice(0, 160) : null;

        if (!label) {
          return NextResponse.json({ detail: "Badge label is required" }, { status: 400 });
        }

        await getOrCreateConversationByUsers(prisma, admin.id, target.id);

        const badge = await prisma.userBadge.upsert({
          where: {
            userId_label: {
              userId: target.id,
              label,
            },
          },
          update: {
            note,
            createdByUserId: admin.id,
          },
          create: {
            userId: target.id,
            label,
            note,
            status: "pending",
            displayOnProfile: false,
            createdByUserId: admin.id,
          },
        });

        await recordUserActivity(prisma, {
          userId: target.id,
          type: "badge_granted",
          path: "/admin/user-list",
          label,
          metadata: {
            badgeId: badge.id,
            note,
          },
          dedupeWithinSeconds: 0,
        });
        break;
      }

      case "remove_badge": {
        if (typeof payload.badgeId !== "number") {
          return NextResponse.json({ detail: "Badge id is required" }, { status: 400 });
        }

        await prisma.userBadge.deleteMany({
          where: {
            id: payload.badgeId,
            userId: target.id,
          },
        });

        await recordUserActivity(prisma, {
          userId: target.id,
          type: "badge_removed",
          path: "/admin/user-list",
          label: String(payload.badgeId),
          metadata: {
            badgeId: payload.badgeId,
          },
          dedupeWithinSeconds: 0,
        });
        break;
      }

      case "grant_honor": {
        const honorKind = normalizeHonorKind(payload.honorKind || payload.kind);
        const title = normalizeHonorTitle(payload.title || payload.label || "");
        const note = typeof payload.note === "string" ? payload.note.trim().slice(0, 160) : null;

        if (honorKind === "badge") {
          return NextResponse.json(
            { detail: "Use add_badge for badge honors." },
            { status: 400 }
          );
        }

        if (!title) {
          return NextResponse.json({ detail: "Honor title is required" }, { status: 400 });
        }

        await getOrCreateConversationByUsers(prisma, admin.id, target.id);

        const label = buildHonorLabel(honorKind, title);
        const displayOnProfile = payload.displayOnProfile !== false;
        const now = new Date();
        const honor = await prisma.userBadge.upsert({
          where: {
            userId_label: {
              userId: target.id,
              label,
            },
          },
          update: {
            note,
            status: "accepted",
            displayOnProfile,
            acceptedAt: now,
            createdByUserId: admin.id,
          },
          create: {
            userId: target.id,
            label,
            note,
            status: "accepted",
            displayOnProfile,
            acceptedAt: now,
            createdByUserId: admin.id,
          },
        });

        await recordUserActivity(prisma, {
          userId: target.id,
          type: `${honorKind}_honor_granted`,
          path: "/admin/user-list",
          label: title,
          metadata: {
            badgeId: honor.id,
            honorKind,
            displayOnProfile,
            note,
          },
          dedupeWithinSeconds: 0,
        });
        break;
      }

      case "remove_honor": {
        if (typeof payload.badgeId !== "number") {
          return NextResponse.json({ detail: "Honor id is required" }, { status: 400 });
        }

        await prisma.userBadge.deleteMany({
          where: {
            id: payload.badgeId,
            userId: target.id,
          },
        });

        await recordUserActivity(prisma, {
          userId: target.id,
          type: "honor_removed",
          path: "/admin/user-list",
          label: String(payload.badgeId),
          metadata: {
            badgeId: payload.badgeId,
          },
          dedupeWithinSeconds: 0,
        });
        break;
      }

      case "grant_clan_admin":
      case "remove_clan_admin": {
        const clanSlug =
          typeof payload.clanSlug === "string"
            ? payload.clanSlug.trim().toLowerCase().slice(0, 80)
            : "";
        if (!clanSlug) {
          return NextResponse.json(
            { detail: "Choose a clan first." },
            { status: 400 }
          );
        }

        const clan = await prisma.clan.findFirst({
          where: {
            slug: clanSlug,
            status: "active",
          },
          select: {
            id: true,
            slug: true,
            name: true,
          },
        });
        if (!clan) {
          return NextResponse.json(
            { detail: "Active clan not found." },
            { status: 404 }
          );
        }

        const granting = payload.action === "grant_clan_admin";
        const primaryAdmin = await resolvePrimaryAdminContact(prisma);
        const notificationSender = primaryAdmin ?? admin;
        const targetName =
          target.inGameName || target.steamPersonaName || target.uid;
        const clanCallsign =
          clan.name.replace(/\s+clan$/i, "").trim() || clan.name;
        const conversation =
          notificationSender.id !== target.id
            ? await getOrCreateConversationByUsers(
                prisma,
                notificationSender.id,
                target.id
              )
            : null;

        await prisma.$transaction(async (tx) => {
          if (granting) {
            await tx.clanMember.upsert({
              where: {
                clanId_userId: {
                  clanId: clan.id,
                  userId: target.id,
                },
              },
              update: {
                role: "admin",
                status: "active",
              },
              create: {
                clanId: clan.id,
                userId: target.id,
                role: "admin",
                status: "active",
              },
            });
          } else {
            await tx.clanMember.updateMany({
              where: {
                clanId: clan.id,
                userId: target.id,
                role: { in: ["owner", "admin"] },
              },
              data: {
                role: "member",
                status: "active",
              },
            });
          }

          if (conversation) {
            await tx.directMessage.create({
              data: {
                conversationId: conversation.id,
                senderUserId: notificationSender.id,
                body: granting
                  ? `🏰 You have been selected leader of the clan. ⚔️\n• ${clanCallsign} ${targetName} 🛡️`
                  : `🏰 Your watch as leader of the clan has ended. ⚔️\n• ${clanCallsign} ${targetName} 🛡️`,
              },
            });
            await tx.directConversation.update({
              where: { id: conversation.id },
              data: { updatedAt: new Date() },
            });
          }

          await recordUserActivity(tx, {
            userId: target.id,
            type: granting
              ? "clan_admin_assigned"
              : "clan_admin_removed",
            path: "/admin/user-list",
            label: clan.name,
            metadata: {
              clanId: clan.id,
              clanSlug: clan.slug,
              role: granting ? "admin" : "member",
              assignedByUid: admin.uid,
              notificationSenderUid: notificationSender.uid,
              notificationDelivered: Boolean(conversation),
            },
            dedupeWithinSeconds: 0,
          });
        });
        break;
      }

      case "add_gift": {
        const kind = normalizeGiftKind(payload.kind || "WOLO");
        const amount = parseAmount(payload.amount);
        const note = typeof payload.note === "string" ? payload.note.trim().slice(0, 160) : null;

        if (!kind) {
          return NextResponse.json({ detail: "Gift type is required" }, { status: 400 });
        }

        await getOrCreateConversationByUsers(prisma, admin.id, target.id);

        const gift = await prisma.userGift.create({
          data: {
            userId: target.id,
            kind,
            amount,
            note,
            status: "pending",
            displayOnProfile: false,
            createdByUserId: admin.id,
          },
        });

        await recordUserActivity(prisma, {
          userId: target.id,
          type: "gift_granted",
          path: "/admin/user-list",
          label: kind,
          metadata: {
            giftId: gift.id,
            amount,
            note,
          },
          dedupeWithinSeconds: 0,
        });
        break;
      }

      case "delete_gift": {
        if (typeof payload.giftId !== "number") {
          return NextResponse.json({ detail: "Gift id is required" }, { status: 400 });
        }

        await prisma.userGift.deleteMany({
          where: {
            id: payload.giftId,
            userId: target.id,
          },
        });

        await recordUserActivity(prisma, {
          userId: target.id,
          type: "gift_removed",
          path: "/admin/user-list",
          label: String(payload.giftId),
          metadata: {
            giftId: payload.giftId,
          },
          dedupeWithinSeconds: 0,
        });
        break;
      }

      case "rescind_wolo_claim": {
        if (typeof payload.claimId !== "number") {
          return NextResponse.json({ detail: "Claim id is required" }, { status: 400 });
        }

        const claim = await rescindPendingWoloClaim(prisma, {
          claimId: payload.claimId,
          adminUserId: admin.id,
          note: typeof payload.note === "string" ? payload.note : null,
        });

        await recordUserActivity(prisma, {
          userId: target.id,
          type: "wolo_claim_rescinded",
          path: "/admin/user-list",
          label: claim.displayPlayerName,
          metadata: {
            claimId: claim.id,
            amountWolo: claim.amountWolo,
            note: claim.note,
          },
          dedupeWithinSeconds: 0,
        });
        break;
      }

      default:
        return NextResponse.json({ detail: "Unknown action" }, { status: 400 });
    }

    const communityMap = await loadUserCommunitySummaries(prisma, [target.id], {
      includePending: true,
    });
    return NextResponse.json({
      ok: true,
      community: communityMap.get(target.id) ?? {
        badges: [],
        gifts: [],
        giftedWolo: 0,
      },
    });
  } catch (error) {
    console.error("Failed to update user community settings:", error);
    return NextResponse.json({ detail: "Update failed" }, { status: 500 });
  }
}
