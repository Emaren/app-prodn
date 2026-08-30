import { NextRequest, NextResponse } from "next/server";

import { requireRadioWoloOperator } from "@/lib/radioWoloOperator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = ["submitted", "reviewing", "approved", "scheduled", "published", "declined"] as const;

function text(value: unknown, max: number) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }

export async function GET(request: NextRequest) {
  const gate = await requireRadioWoloOperator(request);
  if ("error" in gate) return gate.error;
  const submissions = await gate.prisma.radioSubmission.findMany({ orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 250 });
  return NextResponse.json({ submissions: submissions.map((item) => ({ ...item, audioByteSize: item.audioByteSize.toString(), artworkByteSize: item.artworkByteSize?.toString() ?? null, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString(), scheduledAt: item.scheduledAt?.toISOString() ?? null, publishedAt: item.publishedAt?.toISOString() ?? null })) });
}

export async function PATCH(request: NextRequest) {
  const gate = await requireRadioWoloOperator(request);
  if ("error" in gate) return gate.error;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const id = Number(body.id);
  const status = text(body.status, 24);
  if (!Number.isSafeInteger(id) || id <= 0 || !STATUSES.includes(status as never)) return NextResponse.json({ detail: "Submission id and valid status are required." }, { status: 400 });
  const scheduledAt = body.scheduledAt ? new Date(String(body.scheduledAt)) : null;
  if (scheduledAt && Number.isNaN(scheduledAt.getTime())) return NextResponse.json({ detail: "Scheduled time is invalid." }, { status: 400 });
  const existing = await gate.prisma.radioSubmission.findUnique({ where: { id }, select: { publishedAt: true } });
  if (!existing) return NextResponse.json({ detail: "Submission not found." }, { status: 404 });
  await gate.prisma.radioSubmission.update({ where: { id }, data: { status, featured: body.featured === true, adminNote: text(body.adminNote, 6_000) || null, scheduledAt, publishedAt: status === "published" ? existing.publishedAt || new Date() : status === "declined" ? null : undefined } });
  return NextResponse.json({ ok: true });
}
