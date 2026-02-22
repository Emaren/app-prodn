import { NextResponse, type NextRequest } from "next/server";
import crypto from "crypto";
import { getPrisma } from "@/lib/prisma";
import { resolveRequestUid } from "@/lib/requestIdentity";

export const runtime = "nodejs";

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

  await prisma.apiKey.create({
    data: {
      userId: user.id,
      kind: "watcher",
      keyPrefix: prefix,
      keyHash: hash,
    },
  });

  return NextResponse.json({ apiKey, prefix });
}

export async function GET(request: NextRequest) {
  const uid = await resolveRequestUid(request);
  if (!uid) return NextResponse.json({ detail: "No active session" }, { status: 401 });

  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { uid }, select: { id: true } });
  if (!user) return NextResponse.json({ detail: "User not found" }, { status: 404 });

  const keys = await prisma.apiKey.findMany({
    where: { userId: user.id, revokedAt: null, kind: "watcher" },
    orderBy: { createdAt: "desc" },
    select: { keyPrefix: true, createdAt: true, lastUsedAt: true },
  });

  return NextResponse.json({
    keys: keys.map((k) => ({
      prefix: k.keyPrefix,
      createdAt: k.createdAt.toISOString(),
      lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toISOString() : null,
    })),
  });
}