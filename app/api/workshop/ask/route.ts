import { NextRequest, NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import { loadPublicWorkshop } from "@/lib/workshop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cleanQuestion(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 280) : "";
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const question = cleanQuestion(body.question);
  if (!question) {
    return NextResponse.json({ detail: "Ask the Workshop a short question." }, { status: 400 });
  }

  const data = await loadPublicWorkshop(getPrisma());
  const terms = question.toLowerCase();
  const matching = data.entries.filter((entry) => {
    const haystack = `${entry.title} ${entry.summary} ${entry.body}`.toLowerCase();
    return terms.split(/\W+/).filter((term) => term.length > 3).some((term) => haystack.includes(term));
  });
  const latest = (matching.length ? matching : data.entries).slice(0, 3);

  let answer = data.status.isOpen
    ? `${data.status.headline}. ${data.status.description}`
    : "The Workshop is resting, but its published build record remains open.";

  if (/parser|replay|unknown|engine room|jim/.test(terms)) {
    const parserEntry = data.entries.find((entry) => entry.entryType === "parser_discovery");
    if (parserEntry) answer = `${parserEntry.title}. ${parserEntry.summary} ${parserEntry.body}`;
  } else if (/next|coming|forge/.test(terms)) {
    const next = data.entries.filter((entry) => entry.lane === "next_forge").slice(0, 3);
    answer = next.length
      ? `Next into the forge: ${next.map((entry) => entry.title).join("; ")}.`
      : "No upcoming build has been deliberately published yet.";
  } else if (/today|changed|new|built/.test(terms) && latest.length) {
    answer = `Fresh from the forge: ${latest.map((entry) => `${entry.title} — ${entry.summary}`).join(" ")}`;
  } else if (/wolo|chain/.test(terms)) {
    answer = "WoloChain owns WOLO chain identity, balances, transfers, and settlement truth. AoE2WAR owns the game-side wallet, reward, claim, and operator experience built on that rail.";
  }

  return NextResponse.json({
    speaker: "THE WORKSHOP SCRIBE",
    answer,
    sources: latest.map((entry) => ({ title: entry.title, publicId: entry.publicId })),
    boundary: "Answer composed only from published Workshop records and public system boundaries.",
  });
}
