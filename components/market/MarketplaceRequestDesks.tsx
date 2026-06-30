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
        <h3 className="mt-3 font-serif text-4xl font-semibold tracking-[-0.035em]">
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
      className="relative text-[#25180d]"
      aria-label="Avatar commission scroll"
    >
      <div className="mx-5 h-3 rounded-full border border-[#7a4c1d]/55 bg-[linear-gradient(180deg,#c18a3f,#6f3d18_48%,#d6a65d)] shadow-[0_8px_22px_rgba(0,0,0,0.3)]" />
      <div className="-my-1 rounded-[1.2rem] border-x border-[#e3cca0]/50 bg-[radial-gradient(circle_at_20%_15%,rgba(255,255,255,0.32),transparent_24%),linear-gradient(100deg,#bca06f_0%,#ead8ae_8%,#ddc593_50%,#ead7aa_92%,#ad8b58_100%)] px-5 py-7 shadow-[inset_0_0_60px_rgba(96,54,18,0.16),0_32px_100px_rgba(0,0,0,0.34)] sm:px-7">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#775020]/25 pb-5">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.28em] text-[#775020]">
              <ScrollText className="h-4 w-4" />
              Commission scroll
            </div>
            <h3 className="mt-2 font-serif text-3xl font-semibold tracking-[-0.035em] text-[#28180a]">
              Describe your next identity.
            </h3>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-[#704318]/25 bg-[#f4e6c5]/55 px-3 py-2">
            <Image
              src={WOLO_LOGO_SRC}
              alt=""
              width={34}
              height={34}
              className="h-8 w-8 object-contain drop-shadow-[0_4px_8px_rgba(92,53,8,0.24)]"
            />
            <div className="text-right">
              <div className="text-[9px] font-black uppercase tracking-[0.18em] text-[#825622]">
                One avatar
              </div>
              <div className="mt-0.5 text-xl font-black">
                {MARKETPLACE_CONFIG.avatarPriceWolo}{" "}
                <span className="text-[10px]">WOLO</span>
              </div>
            </div>
          </div>
        </div>

        <fieldset className="mt-5">
          <legend className="text-[10px] font-black uppercase tracking-[0.22em] text-[#765020]">
            Choose up to three signals
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
                  className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-bold transition ${
                    selected
                      ? "border-[#4a2b0e] bg-[#34200f] text-[#f5e2b4]"
                      : "border-[#765020]/25 bg-[#f4e6c5]/40 text-[#5d3a17] hover:bg-[#f4e6c5]/72"
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
          <legend className="text-[10px] font-black uppercase tracking-[0.22em] text-[#765020]">
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
                  className={`min-h-10 rounded-xl border px-3 py-2 text-left text-xs font-bold transition ${
                    selected
                      ? "border-[#4a2b0e] bg-[#34200f] text-[#f5e2b4]"
                      : "border-[#765020]/22 bg-[#f4e6c5]/35 text-[#5d3a17] hover:bg-[#f4e6c5]/70"
                  }`}
                >
                  {placement.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <label className="mt-5 block">
          <span className="text-[10px] font-black uppercase tracking-[0.22em] text-[#765020]">
            Colours or atmosphere
          </span>
          <input
            value={palette}
            onChange={(event) => setPalette(event.target.value.slice(0, 100))}
            maxLength={100}
            placeholder="Oxblood and gold, cold moonlight, emerald..."
            className="mt-2 min-h-11 w-full rounded-xl border border-[#765020]/25 bg-[#f7ebce]/55 px-3 text-sm font-semibold text-[#2c1b0b] outline-none placeholder:text-[#765020]/50 focus:border-[#4a2b0e]/55 focus:bg-[#f9efd7]"
          />
        </label>

        <label className="mt-5 block">
          <span className="flex items-center justify-between gap-3 text-[10px] font-black uppercase tracking-[0.22em] text-[#765020]">
            <span>Your words to the Visagewright</span>
            <span className="tracking-normal text-[#765020]/55">
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
            placeholder="I want to look like a veteran commander who has already survived the final battle..."
            className="mt-2 w-full resize-y rounded-xl border border-[#765020]/28 bg-[#f7ebce]/58 px-4 py-3 text-sm font-medium leading-6 text-[#2c1b0b] outline-none placeholder:text-[#765020]/48 focus:border-[#4a2b0e]/55 focus:bg-[#f9efd7]"
          />
        </label>

        {error ? (
          <div className="mt-4 rounded-xl border border-[#8f2f24]/28 bg-[#a83f2d]/12 px-3 py-2.5 text-xs font-semibold leading-5 text-[#702419]">
            {error}
          </div>
        ) : null}

        <div className="mt-5 border-t border-[#775020]/25 pt-5">
          {uid ? (
            <button
              type="submit"
              disabled={busy || loading || brief.trim().length < 24}
              className="market-gold-button group inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-5 text-sm font-black"
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
              label="Sign in to write your scroll"
              returnTo="/market#visage-forge"
              className="market-gold-button inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-5 text-sm font-black"
            />
          )}
          <div className="mt-3 flex items-start gap-2 text-[10px] font-semibold leading-4 text-[#6d4823]">
            <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            No WOLO moves here. Scope and payment are confirmed privately.
          </div>
        </div>
      </div>
      <div className="mx-5 h-3 rounded-full border border-[#7a4c1d]/55 bg-[linear-gradient(180deg,#d6a65d,#6f3d18_52%,#c18a3f)] shadow-[0_8px_22px_rgba(0,0,0,0.3)]" />
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
      <div className="flex min-h-[27rem] flex-col justify-between rounded-[1.7rem] border border-amber-100/22 bg-amber-200/[0.07] p-6">
        <div>
          <div className="grid h-12 w-12 place-items-center rounded-[1rem] border border-amber-100/35 bg-[linear-gradient(145deg,#9d6a10,#2a1b08)] text-amber-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.26),0_12px_28px_rgba(0,0,0,0.28)]">
            <Check className="h-6 w-6" strokeWidth={3} />
          </div>
          <p className="mt-6 text-[10px] font-bold uppercase tracking-[0.28em] text-amber-100/60">
            Proposal #{receipt.requestId}
          </p>
          <h3 className="mt-3 text-3xl font-black tracking-[-0.03em] text-white">
            Your awning is under review.
          </h3>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            The market keeper has the idea. Use the private ledger to shape the
            offer, delivery, and economics.
          </p>
        </div>
        <Link
          href={receipt.contactHref}
          className="market-gold-button group mt-7 inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-5 text-sm font-black"
        >
          Open the private ledger
          <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
        </Link>
      </div>
    );
  }

  return (
    <form
      onSubmit={submitShop}
      className="rounded-[1.7rem] border border-white/10 bg-black/25 p-5 sm:p-6"
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
          className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-white/[0.045] px-3 text-sm font-semibold text-white outline-none placeholder:text-slate-600 focus:border-amber-100/30 focus:bg-white/[0.065]"
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
          className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-white/[0.045] px-3 py-3 text-sm font-medium leading-6 text-white outline-none placeholder:text-slate-600 focus:border-amber-100/30 focus:bg-white/[0.065]"
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
              Raising awning…
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
              Send shop proposal
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
            </>
          )}
        </button>
      ) : (
        <SteamLoginButton
          label="Sign in to propose a shop"
          returnTo="/market#open-shop"
          className="market-gold-button mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-5 text-sm font-black"
        />
      )}
      <div className="mt-3 flex items-center justify-center gap-2 text-[10px] font-semibold text-slate-500">
        <Image
          src={WOLO_LOGO_SRC}
          alt=""
          width={18}
          height={18}
          className="h-4 w-4 object-contain opacity-65"
        />
        Terms come after the idea earns a place.
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
          <h4 className="mt-5 text-sm font-black text-white">{title}</h4>
          <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>
        </div>
      ))}
    </div>
  );
}
