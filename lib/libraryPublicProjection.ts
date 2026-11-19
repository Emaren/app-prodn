import type { PrismaClient } from "@/lib/generated/prisma";

/**
 * The ONLY public event reads permitted for Library.
 * These WE1 source-qualified, separately installed views deliberately strip
 * private IP/headers/arbitrary JSON, restrict event types, and disclose no
 * finance relations. No fallback to original protected event tables.
 * SQL is literal and fixed; the sole dynamic value is a bound Date cutoff.
 */
export type PublicUploadReceipt = {
  id: number;
  user_id: number;
  type: "replay_upload";
  label: string | null;
  metadata: unknown;
  created_at: Date;
};
export type PublicWatcherReceipt = {
  id: number;
  user_id: number | null;
  user_uid: string | null;
  event_type: string;
  created_at: Date;
  watcher_id: string | null;
  session_id: string | null;
  replay_hash: string | null;
};

/** All genuine package receipts needed for full historical provenance. */
export function loadLibraryPackageReceipts(prisma: PrismaClient) {
  return prisma.$queryRaw<PublicUploadReceipt[]>`
    SELECT id,user_id,type,label,metadata,created_at
    FROM aoe2war_library_activity_public.replay_uploads
    WHERE metadata->>'packageUpload' = 'true'
    ORDER BY created_at DESC,id DESC
  `;
}
/** Limited latest public upload activity, NEVER arbitrary event metadata. */
export function loadLibraryActivityUploads(prisma: PrismaClient) {
  return prisma.$queryRaw<PublicUploadReceipt[]>`
    SELECT id,user_id,type,label,metadata,created_at
    FROM aoe2war_library_activity_public.replay_uploads
    ORDER BY created_at DESC,id DESC LIMIT 64
  `;
}
/** Only original successful Watcher batch replay receipts, complete history. */
export function loadLibraryBatchProvenance(prisma: PrismaClient) {
  return prisma.$queryRaw<PublicWatcherReceipt[]>`
    SELECT id,user_id,user_uid,event_type,created_at,watcher_id,session_id,replay_hash
    FROM aoe2war_library_watcher_public.batch_receipts
    WHERE event_type='batch_upload_file_succeeded' AND replay_hash IS NOT NULL
    ORDER BY created_at DESC,id DESC
  `;
}
/** Recent public watcher state, with a bound Date and fixed 512-row ceiling. */
export function loadLibraryActivityBatches(prisma: PrismaClient, since: Date) {
  return prisma.$queryRaw<PublicWatcherReceipt[]>`
    SELECT id,user_id,user_uid,event_type,created_at,watcher_id,session_id,replay_hash
    FROM aoe2war_library_watcher_public.batch_receipts
    WHERE created_at >= ${since}
    ORDER BY created_at DESC,id DESC LIMIT 512
  `;
}
