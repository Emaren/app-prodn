"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import ScheduledMatchCard, {
  type ScheduledMatchCardActionKind,
  type ScheduledMatchCardActionState,
} from "@/components/challenge/ScheduledMatchCard";
import SteamLoginButton from "@/components/SteamLoginButton";
import { useUserAuth } from "@/context/UserAuthContext";
import type { ScheduledMatchTile } from "@/lib/challenges";

type ChallengeRoomPayload = {
  match?: ScheduledMatchTile;
  serverNow?: string;
  detail?: string;
  desyncResolution?: {
    action: "rematch" | "void_refund";
    refundExecution: {
      state: "not_requested" | "executed" | "queued";
      detail: string | null;
    };
  };
};

type DesyncDecision = "rematch" | "void_refund";

function localDateTimeValue(value: Date) {
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function detailFrom(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "detail" in payload) {
    const detail = (payload as { detail?: unknown }).detail;
    if (typeof detail === "string" && detail.trim()) return detail;
  }
  return fallback;
}

export default function ChallengeRoomControls({ challengeId }: { challengeId: number }) {
  const { uid, isAdmin, isAuthenticated, loading: authLoading } = useUserAuth();
  const [match, setMatch] = useState<ScheduledMatchTile | null>(null);
  const [serverNow, setServerNow] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionState, setActionState] = useState<ScheduledMatchCardActionState>({
    challengeId: null,
    kind: null,
  });
  const [desyncDecision, setDesyncDecision] = useState<DesyncDecision | null>(null);
  const [desyncAcknowledged, setDesyncAcknowledged] = useState(false);
  const [desyncNote, setDesyncNote] = useState("");
  const [rematchAt, setRematchAt] = useState(() =>
    localDateTimeValue(new Date(Date.now() + 24 * 60 * 60 * 1000))
  );
  const desyncIdempotencyKeys = useRef<Partial<Record<DesyncDecision, string>>>({});
  const loadRequestIdRef = useRef(0);

  const load = useCallback(async (silent = false) => {
    if (!isAuthenticated) {
      setMatch(null);
      setServerNow(null);
      setLoading(false);
      return;
    }

    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;
    if (!silent) setLoading(true);
    try {
      const response = await fetch(`/api/challenges/${challengeId}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as ChallengeRoomPayload | null;
      if (!response.ok || !payload?.match) {
        throw new Error(detailFrom(payload, "Challenge controls are unavailable."));
      }
      if (loadRequestIdRef.current !== requestId) return;
      setMatch(payload.match);
      setServerNow(payload.serverNow ?? new Date().toISOString());
      setError(null);
    } catch (loadError) {
      if (loadRequestIdRef.current !== requestId) return;
      setError(loadError instanceof Error ? loadError.message : "Challenge controls are unavailable.");
    } finally {
      if (loadRequestIdRef.current === requestId && !silent) setLoading(false);
    }
  }, [challengeId, isAuthenticated]);

  useEffect(() => {
    if (authLoading) return;
    void load();
  }, [authLoading, load]);

  const update = useCallback(
    async (
      action: ScheduledMatchCardActionKind,
      extra?: {
        scheduledAt?: string;
        challengeNote?: string;
        wagerAmountWolo?: number;
        guaranteeAmountWolo?: number;
        fundingTxHash?: string;
        fundingWalletAddress?: string;
        desyncIncidentId?: number;
        idempotencyKey?: string;
        rematchAt?: string;
        note?: string;
      }
    ) => {
      setActionState({ challengeId, kind: action });
      loadRequestIdRef.current += 1;
      setError(null);
      setNotice(null);
      try {
        const response = await fetch(`/api/challenges/${challengeId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...extra }),
        });
        const payload = (await response.json().catch(() => null)) as ChallengeRoomPayload | null;
        if (!response.ok) {
          throw new Error(detailFrom(payload, "Challenge action failed."));
        }
        await load(true);
        setNotice(
          action === "desync_rematch"
            ? "Rematch ordered. The original desync incident remains in the record and funding stays on the rail."
            : action === "desync_void_refund"
              ? payload?.desyncResolution?.refundExecution.state === "executed"
                ? "Match voided. Authenticated refund settlement is confirmed."
                : "Match voided. Refund is queued until authenticated settlement proof exists."
          : action === "accept"
            ? "Challenge accepted. The funding rail is ready."
            : action === "fund"
              ? "Signed funding was verified and recorded."
              : action === "check_in"
                ? "Check-in locked."
                : action === "decline"
                  ? "Challenge declined."
                  : action === "cancel"
                    ? "Challenge cancelled."
                    : action === "confirm_time"
                      ? "Match time confirmed."
                      : "Terms proposal sent."
        );
      } catch (actionError) {
        const message = actionError instanceof Error ? actionError.message : "Challenge action failed.";
        setError(message);
        throw new Error(message);
      } finally {
        setActionState({ challengeId: null, kind: null });
      }
    },
    [challengeId, load]
  );

  const activeDesyncIncident =
    match?.displayState === "desync_review" &&
    match.desyncIncident?.desyncOccurred &&
    match.desyncIncident.settlementDisposition === "commissioner_review"
      ? match.desyncIncident
      : null;

  function openDesyncDecision(decision: DesyncDecision) {
    setDesyncDecision(decision);
    setDesyncAcknowledged(false);
    setError(null);
    setNotice(null);
    desyncIdempotencyKeys.current[decision] ??= crypto.randomUUID();
  }

  async function submitDesyncDecision() {
    if (!activeDesyncIncident || !desyncDecision || !desyncAcknowledged) return;

    const idempotencyKey =
      desyncIdempotencyKeys.current[desyncDecision] ?? crypto.randomUUID();
    desyncIdempotencyKeys.current[desyncDecision] = idempotencyKey;
    try {
      await update(
        desyncDecision === "rematch" ? "desync_rematch" : "desync_void_refund",
        {
          desyncIncidentId: activeDesyncIncident.id,
          idempotencyKey,
          rematchAt:
            desyncDecision === "rematch" && rematchAt
              ? new Date(rematchAt).toISOString()
              : undefined,
          note: desyncNote.trim() || undefined,
        }
      );
    } catch {
      // Keep the same idempotency key and confirmation open so a network retry
      // cannot append a second disposition after an ambiguous response.
      return;
    }
    delete desyncIdempotencyKeys.current[desyncDecision];
    setDesyncDecision(null);
    setDesyncAcknowledged(false);
  }

  if (authLoading || loading) {
    return (
      <div className="rounded-[2rem] border border-white/10 bg-slate-950/72 p-5 text-sm text-slate-300">
        Opening participant controls…
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="rounded-[2rem] border border-amber-100/16 bg-slate-950/72 p-5 shadow-[0_25px_90px_rgba(0,0,0,0.38)]">
        <div className="text-[10px] font-black uppercase tracking-[0.3em] text-amber-100/48">
          Participant controls
        </div>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          Sign in to accept, fund, negotiate, or check in. The public proof trail remains visible without signing in.
        </p>
        <div className="mt-4"><SteamLoginButton /></div>
      </div>
    );
  }

  if (!match) {
    return (
      <div className="rounded-[2rem] border border-white/10 bg-slate-950/72 p-5 text-sm text-slate-300">
        {error ||
          "This room is read-only for your account. Duelists operate the match; the commissioner monitors title and protocol review."}
      </div>
    );
  }

  return (
    <div className="rounded-[2rem] border border-amber-100/16 bg-slate-950/72 p-4 shadow-[0_25px_90px_rgba(0,0,0,0.38)] sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.3em] text-amber-100/48">
            Match command rail
          </div>
          <p className="mt-1 text-sm text-slate-300">
            {isAdmin
              ? "Commissioner view: monitor the exact match state here; title disposition stays on the audited Trophy rail."
              : "Accept, fund, negotiate exact terms, and check in from this room."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={Boolean(actionState.kind) || loading}
          className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.08] hover:text-white disabled:cursor-wait disabled:opacity-50"
        >
          Refresh truth
        </button>
      </div>

      {notice ? (
        <div className="mb-4 rounded-xl border border-emerald-200/16 bg-emerald-300/[0.08] px-3 py-2 text-sm text-emerald-50">
          {notice}
        </div>
      ) : null}
      {error ? (
        <div className="mb-4 rounded-xl border border-rose-200/16 bg-rose-400/[0.08] px-3 py-2 text-sm text-rose-50">
          {error}
        </div>
      ) : null}

      <ScheduledMatchCard
        match={match}
        viewerUid={uid}
        serverNow={serverNow}
        localTimePrimary
        stacked
        defaultViewMode="detail"
        actionState={actionState}
        onAccept={() => update("accept")}
        onDecline={() => update("decline")}
        onCancel={() => update("cancel")}
        onReschedule={(_id, payload) => update("reschedule", payload)}
        onConfirmTime={() => update("confirm_time")}
        onFund={(_id, payload) => update("fund", payload)}
        onCheckIn={() => update("check_in")}
      />

      {activeDesyncIncident ? (
        <section
          data-desync-commissioner-controls
          className="mt-4 rounded-[1.4rem] border border-fuchsia-200/24 bg-[linear-gradient(135deg,rgba(126,34,206,0.17),rgba(234,88,12,0.07),rgba(2,6,23,0.55))] p-4 shadow-[0_0_42px_rgba(217,70,239,0.09)]"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.28em] text-fuchsia-100/70">
                Commissioner disposition
              </div>
              <h3 className="mt-2 text-lg font-black text-white">Winner effects are halted</h3>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-300">
                Desync occurred: confirmed. Competitive result: unresolved. Settlement: commissioner review.
                Rematch preserves funding and opens a distinct later replay; Void &amp; Refund never invents proof.
              </p>
            </div>
            <div className="rounded-full border border-fuchsia-100/20 bg-fuchsia-100/[0.07] px-3 py-1.5 text-xs font-black text-fuchsia-50">
              Incident #{activeDesyncIncident.id}
            </div>
          </div>

          {isAdmin ? (
            <>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => openDesyncDecision("rematch")}
                  disabled={Boolean(actionState.kind)}
                  className="rounded-full border border-cyan-200/26 bg-cyan-300/[0.10] px-4 py-2 text-sm font-black text-cyan-50 transition hover:bg-cyan-300/[0.16] disabled:cursor-wait disabled:opacity-50"
                >
                  Order Rematch
                </button>
                <button
                  type="button"
                  onClick={() => openDesyncDecision("void_refund")}
                  disabled={Boolean(actionState.kind)}
                  className="rounded-full border border-orange-200/28 bg-orange-300/[0.10] px-4 py-2 text-sm font-black text-orange-50 transition hover:bg-orange-300/[0.16] disabled:cursor-wait disabled:opacity-50"
                >
                  Void &amp; Refund
                </button>
              </div>

              {desyncDecision ? (
                <div className="mt-4 rounded-[1.15rem] border border-white/12 bg-black/30 p-4">
                  <div className="text-sm font-black text-white">
                    Confirm {desyncDecision === "rematch" ? "Rematch Order" : "Void & Refund"}
                  </div>
                  <p className="mt-1 text-xs leading-5 text-slate-400">
                    This appends a new disposition to the immutable incident chain. The original DESYNCED record is never changed or deleted.
                  </p>

                  {desyncDecision === "rematch" ? (
                    <label className="mt-3 block max-w-sm space-y-1.5">
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                        New match time
                      </span>
                      <input
                        type="datetime-local"
                        required
                        min={localDateTimeValue(new Date(Date.now() + 2 * 60 * 1000))}
                        value={rematchAt}
                        onChange={(event) => setRematchAt(event.target.value)}
                        className="w-full rounded-xl border border-white/12 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-200/45"
                      />
                    </label>
                  ) : (
                    <div className="mt-3 rounded-xl border border-orange-200/16 bg-orange-300/[0.06] px-3 py-2 text-xs leading-5 text-orange-50/85">
                      The refund will read as queued unless the existing authenticated, idempotent settlement rail returns chain proof.
                    </div>
                  )}

                  <label className="mt-3 block space-y-1.5">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                      Commissioner note
                    </span>
                    <textarea
                      value={desyncNote}
                      onChange={(event) => setDesyncNote(event.target.value.slice(0, 1000))}
                      rows={3}
                      placeholder="Reason for this disposition…"
                      className="w-full rounded-xl border border-white/12 bg-slate-950 px-3 py-2 text-sm leading-6 text-white outline-none focus:border-fuchsia-200/45"
                    />
                  </label>

                  <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-xl border border-white/10 bg-white/[0.035] p-3 text-xs leading-5 text-slate-300">
                    <input
                      type="checkbox"
                      checked={desyncAcknowledged}
                      onChange={(event) => setDesyncAcknowledged(event.target.checked)}
                      className="mt-0.5"
                    />
                    <span>
                      I understand this does not declare a winner and will append an auditable commissioner disposition.
                    </span>
                  </label>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void submitDesyncDecision()}
                      disabled={
                        !desyncAcknowledged ||
                        Boolean(actionState.kind) ||
                        (desyncDecision === "rematch" && !rematchAt)
                      }
                      className="rounded-full bg-fuchsia-200 px-4 py-2 text-sm font-black text-slate-950 transition hover:bg-fuchsia-100 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      {actionState.kind
                        ? "Recording disposition…"
                        : desyncDecision === "rematch"
                          ? "Confirm Rematch"
                          : "Confirm Void & Refund"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDesyncDecision(null);
                        setDesyncAcknowledged(false);
                      }}
                      disabled={Boolean(actionState.kind)}
                      className="rounded-full border border-white/12 px-4 py-2 text-sm font-bold text-slate-300 transition hover:text-white disabled:opacity-50"
                    >
                      Back
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <div className="mt-4 rounded-xl border border-white/10 bg-black/24 px-3 py-3 text-sm text-slate-300">
              The commissioner must choose Rematch or Void &amp; Refund. Participants cannot settle or override this incident.
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
