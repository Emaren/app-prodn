"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Loader2,
  LockKeyhole,
  PackageCheck,
  ScrollText,
  Send,
  Sparkles,
  Store,
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";

import SteamLoginButton from "@/components/SteamLoginButton";
import { useUserAuth } from "@/context/UserAuthContext";
import {
  AVATAR_ARCHETYPES,
  BELT_PLACEMENTS,
  MARKETPLACE_CONFIG,
  type AvatarArchetypeId,
  type BeltPlacementId,
} from "@/lib/marketplace";

const WOLO_LOGO_SRC = "/legacy/wolo-logo-transparent.webp";

type MarketRequestReceipt = {
  ok: true;
  requestId: number;
  createdAt: string;
  contactHref: string;
  profileHref: string;
};

async function postMarketRequest(body: Record<string, unknown>) {
  const response = await fetch("/api/market/requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as
    | MarketRequestReceipt
    | { detail?: string }
    | null;

  if (!response.ok || !payload || !("ok" in payload)) {
    throw new Error(
      payload && "detail" in payload && payload.detail
        ? payload.detail
        : "The market keeper could not receive this request."
    );
  }

  return payload;
}

export function AvatarCommissionScroll() {
  const { uid, loading } = useUserAuth();
  const [archetypes, setArchetypes] = useState<AvatarArchetypeId[]>([
    "arena-champion",
  ]);
  const [beltPlacement, setBeltPlacement] =
    useState<BeltPlacementId>("shoulder");
  const [palette, setPalette] = useState("");
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<MarketRequestReceipt | null>(null);

  const remaining = useMemo(() => Math.max(0, 1200 - brief.length), [brief]);

  function toggleArchetype(id: AvatarArchetypeId) {
    setArchetypes((current) => {
      if (current.includes(id)) {
        return current.filter((entry) => entry !== id);
      }
      if (current.length >= 3) {
        return current;
      }
      return [...current, id];
    });
  }

  async function submitCommission(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || receipt || !uid) return;

    setBusy(true);
    setError(null);
    try {
      const nextReceipt = await postMarketRequest({
        kind: "avatar_commission",
        archetypes,
        beltPlacement,
        palette,
        brief,
      });
      setReceipt(nextReceipt);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The commission scroll could not be sent."
      );
    } finally {
      setBusy(false);
    }
  }

  if (receipt) {
    return (
      <div className="relative overflow-hidden rounded-[1.8rem] border border-emerald-200/25 bg-[radial-gradient(circle_at_top_right,rgba(52,211,153,0.15),transparent_34%),linear-gradient(145deg,#10251f,#07120f)] p-6 text-white shadow-[0_28px_90px_rgba(0,0,0,0.32)] sm:p-8">
        <div className="grid h-14 w-14 place-items-center rounded-[1.2rem] bg-emerald-200 text-emerald-950 shadow-[0_16px_45px_rgba(52,211,153,0.2)]">
          <Check className="h-7 w-7" strokeWidth={3} />
        </div>
        <p className="mt-6 text-[10px] font-bold uppercase tracking-[0.3em] text-emerald-100/65">
          Scroll received · #{receipt.requestId}
        </p>
        <h3 className="market-display-title market-display-silver mt-3 font-serif text-4xl font-medium tracking-[-0.035em]">
          Your identity is on the forge.
        </h3>
        <p className="mt-3 max-w-lg text-sm leading-6 text-emerald-50/72">
          Emaren has the full commission brief. Scope and payment come next;
          finished identities are placed directly in your profile avatar vault.
        </p>
        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          <Link
            href={receipt.contactHref}
            className="market-gold-button group inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-5 text-sm font-black"
          >
            Open the private ledger
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
          </Link>
          <Link
            href={receipt.profileHref}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-emerald-100/18 bg-white/[0.04] px-5 text-sm font-bold text-emerald-50 transition hover:bg-white/[0.08]"
          >
            Visit avatar vault
            <PackageCheck className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={submitCommission}
      className="relative min-w-0 max-w-full text-[#ead8aa]"
      aria-label="Avatar commission lobby"
    >
      <div className="market-aoe-rail mx-4 h-5 sm:mx-6" />
      <div className="market-aoe-lobby-panel -my-1 overflow-hidden rounded-[0.45rem] border border-[#8d6336]/75 shadow-[0_34px_110px_rgba(0,0,0,0.54)]">
        <div className="flex items-center justify-between border-b border-[#be8a4b]/32 bg-black/38 px-5 py-2.5 text-[8px] font-bold uppercase tracking-[0.25em] text-[#bda375] sm:px-7">
          <span>AoE2WAR · Visage Forge</span>
          <span className="hidden text-[#7d8c68] sm:inline">Commission lobby open</span>
        </div>
        <div className="relative px-5 py-6 sm:px-7 sm:py-7">
          <div className="pointer-events-none absolute inset-y-0 left-[64%] hidden w-px bg-gradient-to-b from-transparent via-[#d29a54]/16 to-transparent sm:block" />
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#c18b4b]/22 pb-5">
          <div>
            <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.3em] text-[#b99b69]">
              <ScrollText className="h-4 w-4" />
              Commission settings
            </div>
            <h3 className="market-display-title market-display-gold mt-2 font-serif text-3xl font-medium leading-none tracking-[-0.035em]">
              Let me see your war face.
            </h3>
          </div>
          <div className="flex items-center gap-2 rounded-[0.35rem] border border-[#a9773e]/48 bg-[linear-gradient(180deg,rgba(91,66,38,0.78),rgba(30,24,18,0.95))] px-3 py-2 shadow-[inset_0_1px_0_rgba(255,224,164,0.16),inset_0_-2px_8px_rgba(0,0,0,0.5)]">
            <Image
              src={WOLO_LOGO_SRC}
              alt=""
              width={34}
              height={34}
              className="h-8 w-8 object-contain drop-shadow-[0_4px_9px_rgba(225,164,42,0.28)]"
            />
            <div className="text-right">
              <div className="text-[8px] font-bold uppercase tracking-[0.18em] text-[#b59a6a]">
                Commission
              </div>
              <div className="market-display-title market-display-gold mt-0.5 font-serif text-xl font-semibold">
                {MARKETPLACE_CONFIG.avatarPriceWolo}{" "}
                <span className="text-[9px]">WOLO</span>
              </div>
            </div>
          </div>
        </div>

        <fieldset className="mt-5">
          <legend className="text-[9px] font-bold uppercase tracking-[0.24em] text-[#b99b69]">
            Bearing · choose three
          </legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {AVATAR_ARCHETYPES.map((archetype) => {
              const selected = archetypes.includes(archetype.id);
              return (
                <button
                  key={archetype.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleArchetype(archetype.id)}
                  className={`inline-flex min-h-9 items-center gap-1.5 rounded-[0.3rem] border px-3 py-2 text-xs font-semibold transition ${
                    selected
                      ? "border-[#d19a54]/72 bg-[linear-gradient(180deg,#60472d,#2b2118)] text-[#ffe7b5] shadow-[inset_0_1px_0_rgba(255,229,176,0.2),0_0_16px_rgba(184,118,37,0.11)]"
                      : "border-[#8b633b]/42 bg-[#171513]/82 text-[#bca880] shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] hover:border-[#b58045]/68 hover:text-[#ead8aa]"
                  }`}
                >
                  {selected ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
                  {archetype.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="mt-5">
          <legend className="text-[9px] font-bold uppercase tracking-[0.24em] text-[#b99b69]">
            Championship belt
          </legend>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {BELT_PLACEMENTS.map((placement) => {
              const selected = beltPlacement === placement.id;
              return (
                <button
                  key={placement.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setBeltPlacement(placement.id)}
                  className={`min-h-10 rounded-[0.3rem] border px-3 py-2 text-left text-xs font-semibold transition ${
                    selected
                      ? "border-[#d19a54]/72 bg-[linear-gradient(180deg,#60472d,#2b2118)] text-[#ffe7b5] shadow-[inset_0_1px_0_rgba(255,229,176,0.2),0_0_16px_rgba(184,118,37,0.11)]"
                      : "border-[#8b633b]/42 bg-[#171513]/82 text-[#bca880] shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] hover:border-[#b58045]/68 hover:text-[#ead8aa]"
                  }`}
                >
                  {placement.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <label className="mt-5 block">
          <span className="text-[9px] font-bold uppercase tracking-[0.24em] text-[#b99b69]">
            Banner colours · atmosphere
          </span>
          <input
            value={palette}
            onChange={(event) => setPalette(event.target.value.slice(0, 100))}
            maxLength={100}
            placeholder="Oxblood and gold, cold moonlight, emerald..."
            className="mt-2 min-h-11 w-full min-w-0 max-w-full rounded-[0.3rem] border border-[#8b633b]/48 bg-[#100f0e]/90 px-3 text-sm font-medium text-[#f1dfb8] shadow-[inset_0_2px_12px_rgba(0,0,0,0.52)] outline-none placeholder:text-[#806f52] focus:border-[#c18b4b]/74 focus:bg-[#14120f]"
          />
        </label>

        <label className="mt-5 block">
          <span className="flex items-center justify-between gap-3 text-[9px] font-bold uppercase tracking-[0.24em] text-[#b99b69]">
            <span>Your words to the Visagewright</span>
            <span className="tracking-normal text-[#7f6d4f]">
              {remaining}
            </span>
          </span>
          <textarea
            value={brief}
            onChange={(event) => setBrief(event.target.value.slice(0, 1200))}
            maxLength={1200}
            rows={7}
            required
            minLength={24}
            placeholder="Bigger, badder, more mean."
            className="mt-2 w-full min-w-0 max-w-full resize-y overflow-x-hidden rounded-[0.3rem] border border-[#8b633b]/48 bg-[#100f0e]/90 px-4 py-3 text-sm font-medium leading-6 text-[#f1dfb8] shadow-[inset_0_2px_14px_rgba(0,0,0,0.55)] outline-none placeholder:text-[#806f52] focus:border-[#c18b4b]/74 focus:bg-[#14120f]"
          />
        </label>

        {error ? (
          <div className="mt-4 rounded-[0.3rem] border border-rose-200/22 bg-rose-950/28 px-3 py-2.5 text-xs font-semibold leading-5 text-rose-100">
            {error}
          </div>
        ) : null}

        <div className="mt-5 border-t border-[#c18b4b]/22 pt-5">
          {uid ? (
            <button
              type="submit"
              disabled={busy || loading || brief.trim().length < 24}
              className="market-gold-button group inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[0.35rem] px-5 text-sm font-bold"
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sealing scroll…
                </>
              ) : (
                <>
                  <Image
                    src={WOLO_LOGO_SRC}
                    alt=""
                    width={24}
                    height={24}
                    className="h-5 w-5 object-contain"
                  />
                  Send commission request
                  <Send className="h-4 w-4 transition group-hover:translate-x-1" />
                </>
              )}
            </button>
          ) : (
            <SteamLoginButton
              label="Sign in to commission"
              returnTo="/market#visage-forge"
              className="market-gold-button inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[0.35rem] px-5 text-sm font-bold"
            />
          )}
          <div className="mt-3 flex items-start gap-2 text-[9px] font-semibold uppercase leading-4 tracking-[0.08em] text-[#897656]">
            <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            No WOLO moves here. Scope and payment are confirmed privately.
          </div>
        </div>
        </div>
      </div>
      <div className="market-aoe-rail market-aoe-rail-bottom mx-4 h-5 sm:mx-6" />
    </form>
  );
}

export function OpenShopDesk() {
  const { uid, loading } = useUserAuth();
  const [shopName, setShopName] = useState("");
  const [offer, setOffer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<MarketRequestReceipt | null>(null);

  async function submitShop(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || receipt || !uid) return;

    setBusy(true);
    setError(null);
    try {
      const nextReceipt = await postMarketRequest({
        kind: "shop_proposal",
        shopName,
        offer,
      });
      setReceipt(nextReceipt);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The shop proposal could not be sent."
      );
    } finally {
      setBusy(false);
    }
  }

  if (receipt) {
    return (
      <div className="flex min-h-[27rem] min-w-0 max-w-full flex-col justify-between rounded-[1.7rem] border border-amber-100/22 bg-amber-200/[0.07] p-6">
        <div>
          <div className="grid h-12 w-12 place-items-center rounded-[1rem] border border-amber-100/35 bg-[linear-gradient(145deg,#9d6a10,#2a1b08)] text-amber-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.26),0_12px_28px_rgba(0,0,0,0.28)]">
            <Check className="h-6 w-6" strokeWidth={3} />
          </div>
          <p className="mt-6 text-[10px] font-bold uppercase tracking-[0.28em] text-amber-100/60">
            Proposal #{receipt.requestId}
          </p>
          <h3 className="market-display-title market-display-gold mt-3 font-serif text-3xl font-medium tracking-[-0.03em]">
            Emaren has your proposal.
          </h3>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            Your private line is open. Shape the offer, delivery, and economics
            directly with Emaren.
          </p>
        </div>
        <Link
          href={receipt.contactHref}
          className="market-gold-button group mt-7 inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-5 text-sm font-black"
        >
          Open Emaren conversation
          <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
        </Link>
      </div>
    );
  }

  return (
    <form
      onSubmit={submitShop}
      className="w-full min-w-0 max-w-full overflow-hidden rounded-[1.7rem] border border-white/10 bg-black/25 p-5 sm:p-6"
      aria-label="Open a marketplace shop"
    >
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.28em] text-amber-100/65">
        <Store className="h-4 w-4" />
        Propose a shop
      </div>
      <label className="mt-5 block">
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
          Shop name
        </span>
        <input
          value={shopName}
          onChange={(event) => setShopName(event.target.value.slice(0, 100))}
          maxLength={100}
          required
          placeholder="The Banner Foundry"
          className="mt-2 min-h-11 w-full min-w-0 max-w-full rounded-xl border border-white/10 bg-white/[0.045] px-3 text-sm font-semibold text-white outline-none placeholder:text-slate-600 focus:border-amber-100/30 focus:bg-white/[0.065]"
        />
      </label>
      <label className="mt-4 block">
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
          What do you make or do?
        </span>
        <textarea
          value={offer}
          onChange={(event) => setOffer(event.target.value.slice(0, 900))}
          maxLength={900}
          minLength={20}
          required
          rows={6}
          placeholder="Custom clan banners and stream overlays for players who want their house to look unmistakable..."
          className="mt-2 w-full min-w-0 max-w-full resize-y overflow-x-hidden rounded-xl border border-white/10 bg-white/[0.045] px-3 py-3 text-sm font-medium leading-6 text-white outline-none placeholder:text-slate-600 focus:border-amber-100/30 focus:bg-white/[0.065]"
        />
      </label>
      {error ? (
        <div className="mt-4 rounded-xl border border-rose-200/18 bg-rose-300/[0.07] px-3 py-2.5 text-xs leading-5 text-rose-100">
          {error}
        </div>
      ) : null}
      {uid ? (
        <button
          type="submit"
          disabled={
            busy ||
            loading ||
            shopName.trim().length < 2 ||
            offer.trim().length < 20
          }
          className="market-gold-button group mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-5 text-sm font-black"
        >
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Opening private line…
            </>
          ) : (
            <>
              <Image
                src={WOLO_LOGO_SRC}
                alt=""
                width={24}
                height={24}
                className="h-5 w-5 object-contain"
              />
              Send to Emaren
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
            </>
          )}
        </button>
      ) : (
        <SteamLoginButton
          label="Sign in to contact Emaren"
          returnTo="/market#open-shop"
          className="market-gold-button mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-5 text-sm font-black"
        />
      )}
      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[10px] font-semibold text-slate-500">
        <Image
          src={WOLO_LOGO_SRC}
          alt=""
          width={18}
          height={18}
          className="h-4 w-4 object-contain opacity-65"
        />
        <span>Delivered privately to Emaren.</span>
        <Link
          href="/contact-emaren"
          className="text-amber-100/70 underline decoration-amber-100/25 underline-offset-4 transition hover:text-amber-50"
        >
          Open direct line
        </Link>
      </div>
    </form>
  );
}

export function MarketplaceDeliveryRail() {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {[
        ["01", "Write the scroll", "Shape the identity in your own words."],
        [
          "02",
          "Approve the forge",
          `Confirm scope and the ${MARKETPLACE_CONFIG.avatarPriceWolo} WOLO commission.`,
        ],
        ["03", "Enter the vault", "Choose the finished avatar on your profile."],
      ].map(([step, title, detail]) => (
        <div
          key={step}
          className="rounded-[1.2rem] border border-white/8 bg-white/[0.025] p-4"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black tracking-[0.2em] text-amber-100/55">
              {step}
            </span>
            {step === "03" ? (
              <Sparkles className="h-4 w-4 text-amber-100/65" />
            ) : null}
          </div>
          <h4 className="mt-5 font-serif text-sm font-medium text-amber-50/85">
            {title}
          </h4>
          <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>
        </div>
      ))}
    </div>
  );
}
