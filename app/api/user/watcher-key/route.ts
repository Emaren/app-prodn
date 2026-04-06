import { NextResponse, type NextRequest } from "next/server";
import crypto from "crypto";
import { getPrisma } from "@/lib/prisma";
import { resolveRequestUid } from "@/lib/requestIdentity";
import { recordUserActivity } from "@/lib/userExperience";

export const runtime = "nodejs";

type WatcherKeyRow = {
  key_prefix: string;
  created_at: Date;
  last_used_at: Date | null;
};

function sha256Hex(input: string) {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

function makeKey() {
  const prefix = crypto.randomBytes(6).toString("hex"); // 12 chars
  const secret = crypto.randomBytes(32).toString("base64url");
  const apiKey = `wolo_${prefix}_${secret}`;
  return { prefix, apiKey, hash: sha256Hex(apiKey) };
}

// POST: mint a new watcher key (returns plaintext ONCE)
// GET: list your existing watcher key prefixes (no plaintext)
export async function POST(request: NextRequest) {
  const uid = await resolveRequestUid(request);
  if (!uid) return NextResponse.json({ detail: "No active session" }, { status: 401 });

  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { uid }, select: { id: true } });
  if (!user) return NextResponse.json({ detail: "User not found" }, { status: 404 });

  const { prefix, apiKey, hash } = makeKey();

  await prisma.$executeRaw`
    INSERT INTO public.api_keys (user_id, kind, key_prefix, key_hash)
    VALUES (${user.id}, ${"watcher"}, ${prefix}, ${hash})
  `;

  await recordUserActivity(prisma, {
    userId: user.id,
    type: "watcher_key_created",
    path: "/profile",
    label: "Watcher key minted",
    metadata: {
      keyPrefix: prefix,
    },
    dedupeWithinSeconds: 3,
  });

  return NextResponse.json({ apiKey, prefix });
}

export async function GET(request: NextRequest) {
  const uid = await resolveRequestUid(request);
  if (!uid) return NextResponse.json({ detail: "No active session" }, { status: 401 });

  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { uid }, select: { id: true } });
  if (!user) return NextResponse.json({ detail: "User not found" }, { status: 404 });

  const keys = await prisma.$queryRaw<WatcherKeyRow[]>`
    SELECT key_prefix, created_at, last_used_at
    FROM public.api_keys
    WHERE user_id = ${user.id}
      AND revoked_at IS NULL
      AND kind = ${"watcher"}
    ORDER BY created_at DESC
  `;

  await recordUserActivity(prisma, {
    userId: user.id,
    type: "watcher_keys_viewed",
    path: "/profile",
    label: "Watcher keys",
    metadata: {
      activeKeyCount: keys.length,
    },
    dedupeWithinSeconds: 30,
  });

  return NextResponse.json({
    keys: keys.map((k) => ({
      prefix: k.key_prefix,
      createdAt: k.created_at.toISOString(),
      lastUsedAt: k.last_used_at ? k.last_used_at.toISOString() : null,
    })),
  });
}
