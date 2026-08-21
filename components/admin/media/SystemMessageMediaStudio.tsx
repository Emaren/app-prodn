"use client";

/* eslint-disable @next/next/no-img-element */

import {
  Building2,
  CheckCircle2,
  FlaskConical,
  ImagePlus,
  LockKeyhole,
  RefreshCw,
  Shield,
  Store,
  UploadCloud,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  CLAN_INVITE_BACKGROUND_TARGET,
  marketplaceBusinessProposalHeroTarget,
  marketplaceBusinessProposalSignTarget,
} from "@/lib/systemMessageMedia";

type ManagedMediaAsset = {
  id: number;
  kind: string;
  target: string | null;
  label: string;
  url: string;
  active: boolean;
  updatedAt: string;
};

type Proposal = {
  eventId: number;
  createdAt: string;
  proposerUid: string;
  proposerName: string;
  shopName: string;
  offer: string;
  paymentState: string;
  shopPublicId: string | null;
  shopStatus: string | null;
  approvedAt: string | null;
  artHeroReady?: boolean;
  artSignReady?: boolean;
  artLocked?: boolean;
};

function currentAsset(
  assets: ManagedMediaAsset[],
  kind: string,
  target: string,
) {
  return (
    assets.find(
      (asset) =>
        asset.active &&
        asset.kind === kind &&
        asset.target === target,
    ) ?? null
  );
}

function SlotPreview({
  asset,
  localPreviewUrl,
  fallbackLabel,
}: {
  asset: ManagedMediaAsset | null;
  localPreviewUrl: string | null;
  fallbackLabel: string;
}) {
  const src =
    localPreviewUrl ||
    asset?.url ||
    null;

  return (
    <div className="relative aspect-[16/7] overflow-hidden rounded-[1.15rem] border border-white/9 bg-[radial-gradient(circle_at_20%_10%,rgba(251,191,36,0.10),transparent_35%),linear-gradient(145deg,rgba(13,22,38,0.96),rgba(3,7,16,0.98))]">
      {src ? (
        <img
          src={src}
          alt={asset?.label || fallbackLabel}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : null}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-black/18" />
      <div className="absolute inset-x-3 bottom-3 flex items-end justify-between gap-3">
        <div className="truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-white/75">
          {localPreviewUrl
            ? "Local preview · upload to lock"
            : asset?.label || fallbackLabel}
        </div>
        {asset ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200/18 bg-emerald-300/10 px-2 py-1 text-[8px] font-black uppercase tracking-[0.14em] text-emerald-100">
            <LockKeyhole className="h-3 w-3" />
            Locked
          </span>
        ) : null}
      </div>
    </div>
  );
}

function FileSlot({
  title,
  description,
  target,
  asset,
  busy,
  onUpload,
}: {
  title: string;
  description: string;
  target: string;
  asset: ManagedMediaAsset | null;
  busy: boolean;
  onUpload: (file: File) => void | Promise<void>;
}) {
  const [file, setFile] =
    useState<File | null>(null);
  const [previewUrl, setPreviewUrl] =
    useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }

    const next =
      URL.createObjectURL(file);
    setPreviewUrl(next);

    return () => {
      URL.revokeObjectURL(next);
    };
  }, [file]);

  return (
    <article className="rounded-[1.45rem] border border-white/9 bg-black/20 p-4">
      <SlotPreview
        asset={asset}
        localPreviewUrl={previewUrl}
        fallbackLabel="Awaiting artwork"
      />

      <div className="mt-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-white">
            {title}
          </h3>
          {asset ? (
            <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.14em] text-emerald-100/75">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Loaded
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          {description}
        </p>
        <div className="mt-2 truncate font-mono text-[9px] text-slate-700">
          {target}
        </div>
      </div>

      <label className="mt-4 flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-dashed border-white/12 bg-white/[0.025] px-3 py-3 text-xs text-slate-400 transition hover:border-amber-200/20 hover:text-slate-200">
        <span className="inline-flex items-center gap-2">
          <ImagePlus className="h-4 w-4" />
          {file?.name || "Choose image"}
        </span>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="sr-only"
          onChange={(event) =>
            setFile(
              event.target.files?.[0] ??
                null,
            )
          }
        />
      </label>

      <button
        type="button"
        disabled={!file || busy}
        onClick={() => {
          if (!file) return;
          void Promise.resolve(
            onUpload(file),
          )
            .then(() => setFile(null))
            .catch(() => {});
        }}
        className="mt-3 inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-xl border border-amber-200/18 bg-amber-300/[0.08] px-3 text-xs font-bold text-amber-100 transition hover:bg-amber-300/[0.13] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <UploadCloud className="h-4 w-4" />
        Upload &amp; lock art
      </button>
    </article>
  );
}

export default function SystemMessageMediaStudio() {
  const [assets, setAssets] =
    useState<ManagedMediaAsset[]>([]);
  const [proposals, setProposals] =
    useState<Proposal[]>([]);
  const [
    selectedProposalId,
    setSelectedProposalId,
  ] = useState<number | null>(null);
  const [busyTarget, setBusyTarget] =
    useState<string | null>(null);
  const [testBusy, setTestBusy] =
    useState<"clan" | "business" | null>(null);
  const [notice, setNotice] =
    useState<string | null>(null);
  const [error, setError] =
    useState<string | null>(null);

  async function refresh() {
    setError(null);

    const [
      mediaResponse,
      marketResponse,
    ] = await Promise.all([
      fetch(
        "/api/admin/media-assets",
        { cache: "no-store" },
      ),
      fetch(
        "/api/market/admin",
        { cache: "no-store" },
      ),
    ]);

    const mediaPayload =
      (await mediaResponse
        .json()
        .catch(() => ({}))) as {
        assets?: ManagedMediaAsset[];
        detail?: string;
      };

    if (!mediaResponse.ok) {
      throw new Error(
        mediaPayload.detail ||
          "Could not load system-message art.",
      );
    }

    setAssets(
      Array.isArray(mediaPayload.assets)
        ? mediaPayload.assets
        : [],
    );

    if (marketResponse.ok) {
      const marketPayload =
        (await marketResponse
          .json()
          .catch(() => ({}))) as {
          proposals?: Proposal[];
        };

      const nextProposals =
        Array.isArray(
          marketPayload.proposals,
        )
          ? marketPayload.proposals
          : [];

      setProposals(nextProposals);
      setSelectedProposalId(
        (current) =>
          current ??
          nextProposals[0]?.eventId ??
          null,
      );
    }
  }

  useEffect(() => {
    void refresh().catch(
      (loadError) =>
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load system-message art.",
        ),
    );
  }, []);

  const selectedProposal =
    useMemo(
      () =>
        proposals.find(
          (proposal) =>
            proposal.eventId ===
            selectedProposalId,
        ) ?? null,
      [selectedProposalId, proposals],
    );

  const businessHeroTarget =
    selectedProposal
      ? marketplaceBusinessProposalHeroTarget(
          selectedProposal.eventId,
        )
      : "";

  const businessSignTarget =
    selectedProposal
      ? marketplaceBusinessProposalSignTarget(
          selectedProposal.eventId,
        )
      : "";

  async function upload(
    file: File,
    input: {
      kind:
        | "background"
        | "logo";
      target: string;
      label: string;
    },
  ) {
    if (!input.target) return;

    setBusyTarget(input.target);
    setError(null);
    setNotice(null);

    try {
      const body =
        new FormData();
      body.set("kind", input.kind);
      body.set("target", input.target);
      body.set("label", input.label);
      body.set("alt", input.label);
      body.set("file", file);

      const response =
        await fetch(
          "/api/admin/media-assets",
          {
            method: "POST",
            body,
          },
        );

      const payload =
        (await response
          .json()
          .catch(() => ({}))) as {
          detail?: string;
        };

      if (!response.ok) {
        throw new Error(
          payload.detail ||
            "Upload failed.",
        );
      }

      setNotice(
        `${input.label} is uploaded, active, and locked.`,
      );
      await refresh();
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Upload failed.",
      );
      throw uploadError;
    } finally {
      setBusyTarget(null);
    }
  }

  async function sendTest(
    kind:
      | "clan_invitation"
      | "business_authorization",
  ) {
    setTestBusy(
      kind === "clan_invitation"
        ? "clan"
        : "business",
    );
    setError(null);
    setNotice(null);

    try {
      const response =
        await fetch(
          "/api/admin/media-assets/system-message-test",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              kind,
              proposalEventId:
                selectedProposal?.eventId ??
                null,
            }),
          },
        );

      const payload =
        (await response
          .json()
          .catch(() => ({}))) as {
          detail?: string;
        };

      if (!response.ok) {
        throw new Error(
          payload.detail ||
            "System-message test failed.",
        );
      }

      setNotice(
        kind === "clan_invitation"
          ? "Test invitation sent to your Direct Chat."
          : "Test business authorization sent to your Direct Chat.",
      );
    } catch (testError) {
      setError(
        testError instanceof Error
          ? testError.message
          : "System-message test failed.",
      );
    } finally {
      setTestBusy(null);
    }
  }

  const clanBackground =
    currentAsset(
      assets,
      "background",
      CLAN_INVITE_BACKGROUND_TARGET,
    );

  const businessHero =
    businessHeroTarget
      ? currentAsset(
          assets,
          "background",
          businessHeroTarget,
        )
      : null;

  const businessSign =
    businessSignTarget
      ? currentAsset(
          assets,
          "logo",
          businessSignTarget,
        )
      : null;

  const businessArtLocked =
    Boolean(
      selectedProposal &&
      businessHero &&
      businessSign,
    );

  return (
    <section className="mb-5 overflow-hidden rounded-[1.7rem] border border-cyan-200/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.07),transparent_32%),radial-gradient(circle_at_top_right,rgba(251,191,36,0.08),transparent_30%),rgba(2,6,23,0.58)] shadow-[0_24px_80px_rgba(0,0,0,0.20)]">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/7 px-5 py-4">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.28em] text-cyan-100/55">
            <Shield className="h-3.5 w-3.5" />
            System Message Art
          </div>
          <h2 className="mt-1 text-xl font-bold text-white">
            Invitations &amp; business charters
          </h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
            Stage and lock system-message artwork before authorization. The business approval path is server-blocked until both its hero and sign are active.
          </p>
        </div>

        <button
          type="button"
          onClick={() =>
            void refresh().catch(
              (loadError) =>
                setError(
                  loadError instanceof Error
                    ? loadError.message
                    : "Refresh failed.",
                ),
            )
          }
          className="inline-flex h-9 items-center gap-2 rounded-full border border-white/10 px-3 text-xs font-semibold text-slate-300 transition hover:border-cyan-200/20 hover:text-cyan-100"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh art
        </button>
      </div>

      {(notice || error) ? (
        <div
          className={`mx-5 mt-4 rounded-xl border px-3 py-2 text-xs ${
            error
              ? "border-rose-200/14 bg-rose-300/[0.06] text-rose-100"
              : "border-emerald-200/14 bg-emerald-300/[0.06] text-emerald-100"
          }`}
        >
          {error || notice}
        </div>
      ) : null}

      <div className="grid gap-4 p-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.35fr)]">
        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
              <Shield className="h-4 w-4 text-amber-100/70" />
              Clan invitation system card
            </div>

            <button
              type="button"
              disabled={
                !clanBackground ||
                testBusy !== null
              }
              onClick={() =>
                void sendTest(
                  "clan_invitation",
                )
              }
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-cyan-100/12 bg-cyan-300/[0.05] px-3 text-[10px] font-black uppercase tracking-[0.12em] text-cyan-100 transition hover:bg-cyan-300/[0.10] disabled:opacity-35"
            >
              <FlaskConical className="h-3.5 w-3.5" />
              Test Invitation
            </button>
          </div>

          <FileSlot
            title="Shared Clan Invitation Background"
            description="One kingdom-wide hero background for every Clan Hall invitation. Each card dynamically layers the invited clan's current crest on the left."
            target={
              CLAN_INVITE_BACKGROUND_TARGET
            }
            asset={clanBackground}
            busy={
              busyTarget ===
              CLAN_INVITE_BACKGROUND_TARGET
            }
            onUpload={(file) =>
              upload(file, {
                kind: "background",
                target:
                  CLAN_INVITE_BACKGROUND_TARGET,
                label:
                  "Clan invitation system background",
              })
            }
          />
        </div>

        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
              <Store className="h-4 w-4 text-cyan-100/70" />
              Business authorization staging
            </div>

            <label className="flex min-w-[18rem] items-center gap-2 rounded-xl border border-white/9 bg-black/20 px-3 py-2">
              <Building2 className="h-3.5 w-3.5 text-slate-500" />
              <select
                value={
                  selectedProposalId ??
                  ""
                }
                onChange={(event) =>
                  setSelectedProposalId(
                    Number(
                      event.target.value,
                    ) || null,
                  )
                }
                className="min-w-0 flex-1 bg-transparent text-xs font-semibold text-slate-200 outline-none"
              >
                {proposals.length === 0 ? (
                  <option value="">
                    No business proposals yet
                  </option>
                ) : null}
                {proposals.map(
                  (proposal) => (
                    <option
                      key={
                        proposal.eventId
                      }
                      value={
                        proposal.eventId
                      }
                      className="bg-slate-950"
                    >
                      {proposal.shopName} · {proposal.proposerName}
                    </option>
                  ),
                )}
              </select>
            </label>
          </div>

          {selectedProposal ? (
            <>
              <div
                className={`mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[1rem] border px-4 py-3 ${
                  businessArtLocked
                    ? "border-emerald-200/14 bg-emerald-300/[0.055]"
                    : "border-amber-200/12 bg-amber-300/[0.04]"
                }`}
              >
                <div>
                  <div className="text-sm font-bold text-white">
                    {selectedProposal.shopName}
                  </div>
                  <div className="mt-1 text-[10px] text-slate-500">
                    {selectedProposal.proposerName} · proposal #{selectedProposal.eventId}
                  </div>
                </div>

                <div
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.14em] ${
                    businessArtLocked
                      ? "border-emerald-200/18 bg-emerald-300/[0.08] text-emerald-100"
                      : "border-amber-200/16 bg-amber-300/[0.06] text-amber-100"
                  }`}
                >
                  <LockKeyhole className="h-3.5 w-3.5" />
                  {businessArtLocked
                    ? "Hero + sign locked · ready to authorize"
                    : `${businessHero ? "Hero locked" : "Hero missing"} · ${businessSign ? "Sign locked" : "Sign missing"}`}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <FileSlot
                  title={`${selectedProposal.shopName} · Hero`}
                  description="Preloaded before approval. This background powers both the authorization system card and the eventual business interior."
                  target={
                    businessHeroTarget
                  }
                  asset={businessHero}
                  busy={
                    busyTarget ===
                    businessHeroTarget
                  }
                  onUpload={(file) =>
                    upload(file, {
                      kind:
                        "background",
                      target:
                        businessHeroTarget,
                      label:
                        `${selectedProposal.shopName} authorization hero`,
                    })
                  }
                />

                <FileSlot
                  title={`${selectedProposal.shopName} · Sign`}
                  description="Preloaded before approval. This is the business sign inset shown on the authorization card and interior."
                  target={
                    businessSignTarget
                  }
                  asset={businessSign}
                  busy={
                    busyTarget ===
                    businessSignTarget
                  }
                  onUpload={(file) =>
                    upload(file, {
                      kind: "logo",
                      target:
                        businessSignTarget,
                      label:
                        `${selectedProposal.shopName} business sign`,
                    })
                  }
                />
              </div>

              <button
                type="button"
                disabled={
                  !businessArtLocked ||
                  testBusy !== null
                }
                onClick={() =>
                  void sendTest(
                    "business_authorization",
                  )
                }
                className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-full border border-cyan-100/16 bg-cyan-300/[0.07] px-4 text-xs font-black text-cyan-50 transition hover:bg-cyan-300/[0.12] disabled:cursor-not-allowed disabled:opacity-35"
              >
                <FlaskConical className="h-4 w-4" />
                Test Business Authorization
              </button>
            </>
          ) : (
            <div className="rounded-[1.4rem] border border-dashed border-white/9 px-4 py-10 text-center text-sm text-slate-600">
              A paid business proposal appears here before authorization so its hero and sign can be staged first.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
