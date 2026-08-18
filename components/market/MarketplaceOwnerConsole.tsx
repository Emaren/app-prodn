"use client";

import Link from "next/link";
import {
  CheckCircle2,
  ExternalLink,
  ImagePlus,
  Loader2,
  Power,
  ShieldCheck,
  Store,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type Proposal = {
  eventId: number;
  createdAt: string;
  proposerUid: string;
  proposerName: string;
  shopName: string;
  offer: string;
  paymentState: string;
  txHash: string;
  shopPublicId: string | null;
  shopStatus: string | null;
  approvedAt: string | null;
  displayEnabled: boolean;
};

type Shop = {
  publicId: string;
  slug: string;
  kind: string;
  name: string;
  offer: string;
  proprietorLabel: string;
  ownerUid: string | null;
  ownerName: string | null;
  streetKey: string;
  slot: number;
  displayEnabled: boolean;
  status: string;
  heroImageUrl: string | null;
  href: string;
  approvedAt: string | null;
};

type ConsolePayload = {
  ok?: boolean;
  detail?: string;
  proposals?: Proposal[];
  shops?: Shop[];
};

async function readJson<T>(response: Response) {
  return (await response.json().catch(() => ({}))) as T;
}

function streetLabel(key: string) {
  if (key === "second-street") return "2nd Street";
  if (key === "third-street") return "3rd Street";
  if (key === "fourth-street") return "4th Street";
  if (key === "fifth-street") return "5th Street";
  if (key === "sixth-street") return "6th Street";
  return key.replaceAll("-", " ");
}

export default function MarketplaceOwnerConsole() {
  const [payload, setPayload] = useState<ConsolePayload | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/market/admin", {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" },
    });

    if (response.status === 403) {
      setPayload({ ok: false, proposals: [], shops: [] });
      return;
    }

    const next = await readJson<ConsolePayload>(response);
    if (!response.ok) {
      throw new Error(next.detail || "Marketplace owner console failed.");
    }
    setPayload(next);
  }, []);

  useEffect(() => {
    void load().catch(() =>
      setPayload({ ok: false, proposals: [], shops: [] })
    );
  }, [load]);

  if (!payload?.ok) return null;

  const proposals = payload.proposals || [];
  const shops = payload.shops || [];
  const pending = proposals.filter(
    (proposal) => !proposal.approvedAt && proposal.shopStatus !== "active"
  );

  async function action(body: Record<string, unknown>, key: string) {
    setBusy(key);
    setNotice("");

    try {
      const response = await fetch("/api/market/admin", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const next = await readJson<{
        detail?: string;
        console?: { proposals?: Proposal[]; shops?: Shop[] };
      }>(response);

      if (!response.ok) {
        throw new Error(next.detail || "Owner action failed.");
      }

      if (next.console) {
        setPayload({
          ok: true,
          proposals: next.console.proposals || [],
          shops: next.console.shops || [],
        });
      } else {
        await load();
      }

      setNotice("Marketplace owner state updated.");
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Marketplace owner action failed."
      );
    } finally {
      setBusy(null);
    }
  }

  async function upload(shopPublicId: string, file: File | null) {
    if (!file) return;
    const key = `image:${shopPublicId}`;
    setBusy(key);
    setNotice("");

    try {
      const formData = new FormData();
      formData.set("shopPublicId", shopPublicId);
      formData.set("file", file);

      const response = await fetch("/api/market/admin/image", {
        method: "POST",
        body: formData,
      });
      const next = await readJson<{ detail?: string }>(response);

      if (!response.ok) {
        throw new Error(next.detail || "Image upload failed.");
      }

      await load();
      setNotice("Business artwork updated.");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Image upload failed."
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <section
      id="marketplace-owner"
      className="overflow-hidden rounded-[2rem] border border-amber-100/16 bg-[radial-gradient(circle_at_0%_0%,rgba(245,158,11,0.10),transparent_32%),radial-gradient(circle_at_100%_0%,rgba(59,130,246,0.08),transparent_28%),linear-gradient(145deg,rgba(15,18,29,0.98),rgba(4,8,15,0.99))] p-6 shadow-[0_28px_80px_rgba(0,0,0,0.28)] sm:p-7"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.3em] text-amber-100/70">
            <ShieldCheck className="h-4 w-4" />
            Kingdom Owner · Marketplace
          </div>
          <h2 className="mt-2 font-serif text-3xl text-[#e8dfc5]">
            All awnings under one seal.
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Approve paid proposals, open or shutter any business, edit storefront
            copy, and replace business artwork.
          </p>
        </div>

        <span className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-xs text-slate-400">
          {shops.length} businesses · {pending.length} awaiting approval
        </span>
      </div>

      {pending.length > 0 ? (
        <div className="mt-6">
          <div className="text-[10px] font-black uppercase tracking-[0.25em] text-amber-100/60">
            Paid proposals awaiting the Kingdom
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {pending.map((proposal) => (
              <article
                key={proposal.eventId}
                className="rounded-[1.35rem] border border-amber-100/12 bg-black/22 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                      {proposal.proposerName}
                    </div>
                    <div className="mt-1 font-serif text-2xl text-[#e8dfc5]">
                      {proposal.shopName}
                    </div>
                  </div>

                  <span className="rounded-full border border-emerald-200/15 bg-emerald-300/[0.07] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-emerald-100">
                    100 WOLO verified
                  </span>
                </div>

                <p className="mt-3 text-sm leading-6 text-slate-400">
                  {proposal.offer}
                </p>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() =>
                      void action(
                        {
                          action: "approve",
                          proposalEventId: proposal.eventId,
                        },
                        `approve:${proposal.eventId}`
                      )
                    }
                    className="inline-flex min-h-10 items-center gap-2 rounded-full bg-amber-300 px-4 text-sm font-bold text-slate-950 transition hover:bg-amber-200 disabled:opacity-50"
                  >
                    {busy === `approve:${proposal.eventId}` ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    Approve business
                  </button>

                  <Link
                    href={`/contact-emaren?user=${encodeURIComponent(
                      proposal.proposerUid
                    )}`}
                    className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-300 hover:border-white/20 hover:text-white"
                  >
                    Open thread
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-7">
        <div className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500">
          Business master control
        </div>

        <div className="mt-3 space-y-3">
          {shops.map((shop) => (
            <OwnerShopRow
              key={shop.publicId}
              shop={shop}
              busy={busy}
              onAction={action}
              onUpload={upload}
            />
          ))}
        </div>
      </div>

      {notice ? (
        <div className="mt-4 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5 text-sm text-slate-300">
          {notice}
        </div>
      ) : null}
    </section>
  );
}

function OwnerShopRow({
  shop,
  busy,
  onAction,
  onUpload,
}: {
  shop: Shop;
  busy: string | null;
  onAction: (body: Record<string, unknown>, key: string) => Promise<void>;
  onUpload: (shopPublicId: string, file: File | null) => Promise<void>;
}) {
  const [name, setName] = useState(shop.name);
  const [offer, setOffer] = useState(shop.offer);

  useEffect(() => {
    setName(shop.name);
    setOffer(shop.offer);
  }, [shop.name, shop.offer]);

  return (
    <article className="grid gap-4 rounded-[1.35rem] border border-white/9 bg-black/20 p-4 xl:grid-cols-[11rem_1fr_auto]">
      <div
        className="min-h-28 overflow-hidden rounded-[1rem] border border-white/8 bg-cover bg-center"
        style={{
          backgroundImage: shop.heroImageUrl
            ? `linear-gradient(rgba(2,6,15,0.16),rgba(2,6,15,0.50)),url("${shop.heroImageUrl}")`
            : "linear-gradient(135deg,rgba(37,99,235,0.18),rgba(3,7,18,0.96))",
        }}
      >
        <label className="flex h-full min-h-28 cursor-pointer items-end justify-center bg-black/10 p-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-300 transition hover:bg-black/30 hover:text-white">
          <ImagePlus className="mr-2 h-3.5 w-3.5" />
          Change image
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            disabled={busy !== null}
            onChange={(event) =>
              void onUpload(shop.publicId, event.target.files?.[0] || null)
            }
          />
        </label>
      </div>

      <div>
        <div className="flex flex-wrap items-center gap-2">
          <Store className="h-4 w-4 text-amber-100/65" />
          <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
            {streetLabel(shop.streetKey)} · Awning {String(shop.slot).padStart(2, "0")}
          </span>
          <span className="rounded-full border border-white/8 bg-white/[0.025] px-2 py-0.5 text-[9px] uppercase tracking-[0.16em] text-slate-500">
            {shop.status}
          </span>
        </div>

        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="mt-3 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm font-semibold text-white outline-none focus:border-amber-100/25"
        />
        <textarea
          value={offer}
          onChange={(event) => setOffer(event.target.value)}
          rows={2}
          className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm leading-5 text-slate-300 outline-none focus:border-amber-100/25"
        />

        <div className="mt-2 text-xs text-slate-500">
          Proprietor: {shop.ownerName || shop.proprietorLabel}
        </div>
      </div>

      <div className="flex min-w-36 flex-col gap-2">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() =>
            void onAction(
              {
                action: "display",
                shopPublicId: shop.publicId,
                displayEnabled: !shop.displayEnabled,
              },
              `display:${shop.publicId}`
            )
          }
          className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-full border px-3 text-xs font-bold ${
            shop.displayEnabled
              ? "border-emerald-200/20 bg-emerald-300/[0.08] text-emerald-100"
              : "border-white/10 bg-white/[0.035] text-slate-300"
          }`}
        >
          <Power className="h-3.5 w-3.5" />
          {shop.displayEnabled ? "Marketplace ON" : "Marketplace OFF"}
        </button>

        <button
          type="button"
          disabled={busy !== null}
          onClick={() =>
            void onAction(
              {
                action: "details",
                shopPublicId: shop.publicId,
                name,
                offer,
              },
              `details:${shop.publicId}`
            )
          }
          className="min-h-10 rounded-full border border-white/10 px-3 text-xs font-bold text-slate-200 hover:border-white/20"
        >
          Save storefront
        </button>

        <Link
          href={shop.href}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-white/10 px-3 text-xs font-bold text-slate-300 hover:text-white"
        >
          Open shop <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>
    </article>
  );
}
