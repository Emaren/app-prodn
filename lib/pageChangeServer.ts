import type { Prisma, PrismaClient } from "@/lib/generated/prisma";

import { PAGE_CHANGE_NOTICES } from "@/lib/pageChangeNotices";

type Db = PrismaClient | Prisma.TransactionClient;

export type PageChangeAdminItem = {
  href: string;
  label: string;
  version: string;
  contentRevision: number;
  changedAt: string;
  reason: string | null;
  seenAt: string | null;
};

export type PageChangeAdminState = {
  unseenCount: number;
  unseen: PageChangeAdminItem[];
  seen: PageChangeAdminItem[];
};

function noticeByHref() {
  return new Map<string, (typeof PAGE_CHANGE_NOTICES)[number]>(
    PAGE_CHANGE_NOTICES.map((notice) => [notice.href, notice])
  );
}

export async function syncPageChangeReleaseManifest(prisma: Db) {
  const existing = await prisma.pageChangeRevision.findMany();
  const byHref = new Map(existing.map((row) => [row.href, row]));
  const now = new Date();

  for (const notice of PAGE_CHANGE_NOTICES) {
    const row = byHref.get(notice.href);
    if (!row) {
      await prisma.pageChangeRevision.create({
        data: {
          href: notice.href,
          sourceVersion: notice.version,
          contentRevision: 0,
          reason: "Release baseline",
          changedAt: now,
        },
      });
      continue;
    }

    if (row.sourceVersion !== notice.version) {
      await prisma.pageChangeRevision.update({
        where: { href: notice.href },
        data: {
          sourceVersion: notice.version,
          reason: "Release source changed",
          changedAt: now,
        },
      });
    }
  }

  return prisma.pageChangeRevision.findMany({
    where: {
      href: { in: PAGE_CHANGE_NOTICES.map((notice) => notice.href) },
    },
    orderBy: { href: "asc" },
  });
}

export async function bumpPageChangeContentRevision(
  prisma: Db,
  href: string,
  reason: string
) {
  const notice = PAGE_CHANGE_NOTICES.find((candidate) => candidate.href === href);
  if (!notice) throw new Error(`Unknown Kingdom page-change href: ${href}`);

  const now = new Date();
  return prisma.pageChangeRevision.upsert({
    where: { href },
    create: {
      href,
      sourceVersion: notice.version,
      contentRevision: 1,
      reason: reason.trim().slice(0, 240) || "Meaningful content updated",
      changedAt: now,
    },
    update: {
      sourceVersion: notice.version,
      contentRevision: { increment: 1 },
      reason: reason.trim().slice(0, 240) || "Meaningful content updated",
      changedAt: now,
    },
  });
}

export async function loadUserPageChangeState(
  prisma: PrismaClient,
  userId: number
) {
  const revisions = await syncPageChangeReleaseManifest(prisma);
  let seenRows = await prisma.userPageChangeSeen.findMany({ where: { userId } });

  // Brand-new accounts should not inherit every historical gray dot.
  if (seenRows.length === 0) {
    await prisma.userPageChangeSeen.createMany({
      data: revisions.map((revision) => ({
        userId,
        href: revision.href,
        sourceVersion: revision.sourceVersion,
        contentRevision: revision.contentRevision,
        seenAt: new Date(),
      })),
      skipDuplicates: true,
    });
    seenRows = await prisma.userPageChangeSeen.findMany({ where: { userId } });
  }

  const seenByHref = new Map(seenRows.map((row) => [row.href, row]));
  const unseen = revisions
    .filter((revision) => {
      const seen = seenByHref.get(revision.href);
      return (
        !seen ||
        seen.sourceVersion !== revision.sourceVersion ||
        seen.contentRevision !== revision.contentRevision
      );
    })
    .map((revision) => revision.href);

  return { revisions, seenRows, unseen };
}

export async function markUserPageChangeSeen(
  prisma: PrismaClient,
  userId: number,
  href: string
) {
  const revisions = await syncPageChangeReleaseManifest(prisma);
  const revision = revisions.find((candidate) => candidate.href === href);
  if (!revision) throw new Error("That page is not on the Kingdom change-notice rail.");

  return prisma.userPageChangeSeen.upsert({
    where: { userId_href: { userId, href } },
    create: {
      userId,
      href,
      sourceVersion: revision.sourceVersion,
      contentRevision: revision.contentRevision,
      seenAt: new Date(),
    },
    update: {
      sourceVersion: revision.sourceVersion,
      contentRevision: revision.contentRevision,
      seenAt: new Date(),
    },
  });
}

export async function loadAdminPageChangeStateMap(
  prisma: PrismaClient,
  userIds: number[]
) {
  const revisions = await syncPageChangeReleaseManifest(prisma);
  const seenRows = userIds.length
    ? await prisma.userPageChangeSeen.findMany({
        where: { userId: { in: userIds } },
        orderBy: { seenAt: "desc" },
      })
    : [];

  const noticeMap = noticeByHref();
  const seenByUser = new Map<number, Map<string, (typeof seenRows)[number]>>();
  for (const row of seenRows) {
    const map = seenByUser.get(row.userId) ?? new Map();
    map.set(row.href, row);
    seenByUser.set(row.userId, map);
  }

  return new Map(
    userIds.map((userId) => {
      const userSeen = seenByUser.get(userId) ?? new Map();
      if (userSeen.size === 0) {
        return [
          userId,
          { unseenCount: 0, unseen: [], seen: [] } satisfies PageChangeAdminState,
        ] as const;
      }
      const all = revisions.map((revision): PageChangeAdminItem => {
        const notice = noticeMap.get(revision.href);
        const seen = userSeen.get(revision.href);
        const currentSeen = Boolean(
          seen &&
            seen.sourceVersion === revision.sourceVersion &&
            seen.contentRevision === revision.contentRevision
        );
        return {
          href: revision.href,
          label: notice?.label ?? revision.href,
          version: revision.sourceVersion,
          contentRevision: revision.contentRevision,
          changedAt: revision.changedAt.toISOString(),
          reason: revision.reason,
          seenAt: currentSeen && seen ? seen.seenAt.toISOString() : null,
        };
      });
      const unseen = all.filter((item) => item.seenAt === null);
      const seen = all
        .filter((item) => item.seenAt !== null)
        .sort((a, b) => (b.seenAt || "").localeCompare(a.seenAt || ""));
      return [userId, { unseenCount: unseen.length, unseen, seen } satisfies PageChangeAdminState] as const;
    })
  );
}
