"use client";

import Link from "next/link";
import {
  CheckCircle2,
  Coins,
  Crown,
  ExternalLink,
  Gift,
  ImagePlus,
  Loader2,
  Power,
  ShieldCheck,
  Store,
  UserRoundCog,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  payMarketplaceRequestOnChain,
} from "@/lib/clientMarketplacePayment";

type Proposal = {
  eventId: number;
  createdAt: string;
  proposerUid: string;
  proposerName: string;
  shopName: string;
  offer: string;
  paymentState: string;
  txHash: string;
  sponsorship: string;
  sponsoredByUid: string;
  beneficiaryUid: string;
  shopPublicId: string | null;
  shopStatus: string | null;
  approvedAt: string | null;
  displayEnabled: boolean;
  artHeroReady: boolean;
  artSignReady: boolean;
  artLocked: boolean;
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

type Citizen = {
  uid: string;
  name: string;
  walletAddress: string | null;
  isAdmin: boolean;
};

type SponsorQuote = {
  ok?: boolean;
  detail?: string;
  amountWolo?: number;
  recipientAddress?: string;
  recipientLabel?: string;
  memo?: string;
  paymentEnabled?: boolean;
};

type ConsolePayload = {
  ok?: boolean;
  detail?: string;
  proposals?: Proposal[];
  shops?: Shop[];
  citizens?: Citizen[];
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
  if (key === "seventh-street") return "7th Street";
  return key.replaceAll("-", " ");
}

export default function MarketplaceOwnerConsole({
  commandMode = false,
}: {
  commandMode?: boolean;
}) {
  const [payload, setPayload] = useState<ConsolePayload | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const [sponsorQuote, setSponsorQuote] =
    useState<SponsorQuote | null>(null);

  const [beneficiaryUid, setBeneficiaryUid] =
    useState("");

  const [sponsoredShopName, setSponsoredShopName] =
    useState("");

  const [sponsoredOffer, setSponsoredOffer] =
    useState("");

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

    if (commandMode) {
      try {
        const sponsorResponse = await fetch(
          "/api/market/admin/sponsor",
          {
            cache: "no-store",
            headers: {
              "Cache-Control": "no-cache",
            },
          },
        );

        const sponsor =
          await readJson<SponsorQuote>(
            sponsorResponse,
          );

        setSponsorQuote(sponsor);
      } catch {
        setSponsorQuote({
          ok: false,
          paymentEnabled: false,
          detail:
            "Kingdom sponsorship quote is unavailable.",
        });
      }
    }
  }, [commandMode]);

  useEffect(() => {
    void load().catch(() =>
      setPayload({ ok: false, proposals: [], shops: [] })
    );
  }, [load]);

  if (!payload?.ok) return null;

  const proposals = payload.proposals || [];
  const shops = payload.shops || [];
  const citizens = payload.citizens || [];
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
        console?: {
          proposals?: Proposal[];
          shops?: Shop[];
          citizens?: Citizen[];
        };
      }>(response);

      if (!response.ok) {
        throw new Error(next.detail || "Owner action failed.");
      }

      if (next.console) {
        setPayload({
          ok: true,
          proposals: next.console.proposals || [],
          shops: next.console.shops || [],
          citizens: next.console.citizens || [],
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

  async function sponsorBusiness() {
    if (
      !beneficiaryUid ||
      !sponsoredShopName.trim() ||
      !sponsoredOffer.trim()
    ) {
      setNotice(
        "Choose a proprietor and enter the business name and offer.",
      );
      return;
    }

    if (
      !sponsorQuote?.paymentEnabled ||
      !sponsorQuote.recipientAddress ||
      !sponsorQuote.amountWolo ||
      !sponsorQuote.memo
    ) {
      setNotice(
        sponsorQuote?.detail ||
        "Real Kingdom sponsorship is available on production only.",
      );
      return;
    }

    setBusy("sponsor");
    setNotice("");

    let payment:
      | {
          walletAddress: string;
          transactionHash: string;
          txFeeWolo: number;
        }
      | null = null;

    try {
      payment =
        await payMarketplaceRequestOnChain({
          recipientAddress:
            sponsorQuote.recipientAddress,
          amountWolo:
            sponsorQuote.amountWolo,
          memo:
            sponsorQuote.memo,
        });

      const response = await fetch(
        "/api/market/admin/sponsor",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            beneficiaryUid,
            shopName:
              sponsoredShopName,
            offer:
              sponsoredOffer,
            txHash:
              payment.transactionHash,
            fromAddress:
              payment.walletAddress,
          }),
        },
      );

      const next =
        await readJson<{
          detail?: string;
          proposalEventId?: number;
          txHash?: string;
          console?: ConsolePayload;
        }>(
          response,
        );

      if (!response.ok) {
        throw new Error(
          next.detail ||
          "Kingdom-sponsored business creation failed.",
        );
      }

      if (next.console) {
        setPayload({
          ok: true,
          proposals:
            next.console.proposals || [],
          shops:
            next.console.shops || [],
          citizens:
            next.console.citizens || [],
        });
      } else {
        await load();
      }

      setBeneficiaryUid("");
      setSponsoredShopName("");
      setSponsoredOffer("");

      setNotice(
        `100 WOLO charter paid to Community Treasury. ` +
        `Business proposal #${next.proposalEventId ?? "—"} ` +
        `is ready for artwork and authorization.`,
      );
    } catch (error) {
      const txNote =
        payment?.transactionHash
          ? ` Payment tx: ${payment.transactionHash}.`
          : "";

      setNotice(
        (
          error instanceof Error
            ? error.message
            : "Kingdom sponsorship failed."
        ) + txNote,
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

      {commandMode ? (
        <section className="mt-6 overflow-hidden rounded-[1.6rem] border border-amber-100/16 bg-[radial-gradient(circle_at_0%_0%,rgba(251,191,36,0.11),transparent_34%),linear-gradient(140deg,rgba(22,16,8,0.90),rgba(4,9,18,0.96))] p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.28em] text-amber-200/70">
                <Crown className="h-4 w-4" />
                Kingdom Business Command
              </div>

              <h3 className="mt-2 font-serif text-2xl text-[#f0e4c5]">
                Grant a citizen a business.
              </h3>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                Choose the proprietor, define the business, and fund its
                charter. The Kingdom pays the same real 100 WOLO registration
                fee as every other business. Ownership belongs to the citizen
                you choose.
              </p>
            </div>

            <div
              className={`rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] ${
                sponsorQuote?.paymentEnabled
                  ? "border-emerald-200/20 bg-emerald-300/[0.07] text-emerald-100"
                  : "border-sky-200/16 bg-sky-300/[0.06] text-sky-100"
              }`}
            >
              {sponsorQuote?.paymentEnabled
                ? "Production · WOLO signing enabled"
                : "Local shadow · production signing disabled"}
            </div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[0.8fr_1fr]">
            <div>
              <label className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                Proprietor
              </label>

              <select
                value={beneficiaryUid}
                onChange={(event) =>
                  setBeneficiaryUid(
                    event.target.value,
                  )
                }
                disabled={busy !== null}
                className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-amber-200/30"
              >
                <option value="">
                  Choose player…
                </option>

                {citizens.map((citizen) => (
                  <option
                    key={citizen.uid}
                    value={citizen.uid}
                  >
                    {citizen.name}
                    {citizen.isAdmin
                      ? " · Admin"
                      : ""}
                  </option>
                ))}
              </select>

              <div className="mt-4 rounded-xl border border-white/8 bg-black/20 p-3 text-xs leading-5 text-slate-400">
                <div className="flex items-center gap-2 font-semibold text-slate-200">
                  <Coins className="h-3.5 w-3.5 text-amber-200" />
                  Charter: 100 WOLO
                </div>

                <div className="mt-1">
                  Recipient:{" "}
                  {sponsorQuote?.recipientLabel ||
                    "Community Treasury"}
                </div>

                <div className="mt-1">
                  The selected player owns the resulting business. The
                  sponsor payment does not transfer ownership to the payer.
                </div>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                Business
              </label>

              <input
                value={sponsoredShopName}
                onChange={(event) =>
                  setSponsoredShopName(
                    event.target.value,
                  )
                }
                maxLength={100}
                placeholder="Business name"
                disabled={busy !== null}
                className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm font-semibold text-white outline-none focus:border-amber-200/30"
              />

              <textarea
                value={sponsoredOffer}
                onChange={(event) =>
                  setSponsoredOffer(
                    event.target.value,
                  )
                }
                maxLength={900}
                rows={4}
                placeholder="What does this business make, sell, repair, or do?"
                disabled={busy !== null}
                className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-sm leading-6 text-slate-300 outline-none focus:border-amber-200/30"
              />

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={
                    busy !== null ||
                    !beneficiaryUid ||
                    !sponsoredShopName.trim() ||
                    !sponsoredOffer.trim() ||
                    !sponsorQuote?.paymentEnabled
                  }
                  onClick={() =>
                    void sponsorBusiness()
                  }
                  className="inline-flex min-h-11 items-center gap-2 rounded-full bg-amber-300 px-5 text-sm font-black text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {busy === "sponsor" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Gift className="h-4 w-4" />
                  )}

                  Pay 100 WOLO & Create
                </button>

                <div className="text-xs leading-5 text-slate-500">
                  {sponsorQuote?.detail ||
                    "Loading Kingdom charter rail…"}
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : null}

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

                  <div className="flex flex-wrap justify-end gap-2">
                    {proposal.sponsorship === "kingdom_admin" ? (
                      <span className="rounded-full border border-amber-200/18 bg-amber-300/[0.07] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-amber-100">
                        Kingdom sponsored
                      </span>
                    ) : null}

                    <span className="rounded-full border border-emerald-200/15 bg-emerald-300/[0.07] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-emerald-100">
                      100 WOLO verified
                    </span>
                  </div>
                </div>

                <p className="mt-3 text-sm leading-6 text-slate-400">
                  {proposal.offer}
                </p>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <div
                    className={`inline-flex min-h-9 items-center gap-2 rounded-full border px-3 text-[10px] font-black uppercase tracking-[0.12em] ${
                      proposal.artLocked
                        ? "border-emerald-200/18 bg-emerald-300/[0.07] text-emerald-100"
                        : "border-amber-200/16 bg-amber-300/[0.06] text-amber-100"
                    }`}
                  >
                    {proposal.artLocked ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : (
                      <ImagePlus className="h-3.5 w-3.5" />
                    )}
                    {proposal.artLocked
                      ? "Hero + sign locked · ready"
                      : `${proposal.artHeroReady ? "Hero ✓" : "Hero missing"} · ${proposal.artSignReady ? "Sign ✓" : "Sign missing"}`}
                  </div>

                  {!proposal.artLocked ? (
                    <Link
                      href="/admin/media-assets"
                      className="rounded-full border border-cyan-100/12 bg-cyan-300/[0.05] px-4 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-300/[0.09]"
                    >
                      Stage artwork
                    </Link>
                  ) : null}

                  <button
                    type="button"
                    disabled={
                      busy !== null ||
                      !proposal.artLocked
                    }
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
              citizens={citizens}
              commandMode={commandMode}
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
  citizens,
  commandMode,
  onAction,
  onUpload,
}: {
  shop: Shop;
  busy: string | null;
  citizens: Citizen[];
  commandMode: boolean;
  onAction: (body: Record<string, unknown>, key: string) => Promise<void>;
  onUpload: (shopPublicId: string, file: File | null) => Promise<void>;
}) {
  const [name, setName] = useState(shop.name);
  const [offer, setOffer] = useState(shop.offer);
  const [assignedUid, setAssignedUid] =
    useState(shop.ownerUid || "");

  useEffect(() => {
    setName(shop.name);
    setOffer(shop.offer);
    setAssignedUid(shop.ownerUid || "");
  }, [
    shop.name,
    shop.offer,
    shop.ownerUid,
  ]);

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

        {commandMode ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
            <select
              value={assignedUid}
              onChange={(event) =>
                setAssignedUid(
                  event.target.value,
                )
              }
              disabled={busy !== null}
              className="min-h-10 rounded-xl border border-white/10 bg-black/25 px-3 text-xs text-white outline-none focus:border-amber-100/25"
            >
              <option value="">
                Choose proprietor…
              </option>

              {citizens.map((citizen) => (
                <option
                  key={citizen.uid}
                  value={citizen.uid}
                >
                  {citizen.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              disabled={
                busy !== null ||
                !assignedUid ||
                assignedUid ===
                  (shop.ownerUid || "")
              }
              onClick={() =>
                void onAction(
                  {
                    action: "assign",
                    shopPublicId:
                      shop.publicId,
                    ownerUid:
                      assignedUid,
                  },
                  `assign:${shop.publicId}`,
                )
              }
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-amber-200/18 bg-amber-300/[0.06] px-3 text-xs font-bold text-amber-100 transition hover:border-amber-200/35 hover:bg-amber-300/[0.10] disabled:opacity-40"
            >
              {busy ===
              `assign:${shop.publicId}` ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <UserRoundCog className="h-3.5 w-3.5" />
              )}
              Assign proprietor
            </button>
          </div>
        ) : null}
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
