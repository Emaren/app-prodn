"use client";

import Link from "next/link";

import ContactEmarenWorkspace from "@/components/contact/ContactEmarenWorkspace";
import SteamLoginButton from "@/components/SteamLoginButton";
import { useUserAuth } from "@/context/UserAuthContext";

type ChallengeRoomConversationProps = {
  challengeId: number;
  challengerUid: string;
  challengedUid: string;
  challengerName: string;
  challengedName: string;
};

export default function ChallengeRoomConversation({
  challengeId,
  challengerUid,
  challengedUid,
  challengerName,
  challengedName,
}: ChallengeRoomConversationProps) {
  const { uid, isAdmin, isAuthenticated, loading } = useUserAuth();
  const targetUid =
    uid === challengerUid
      ? challengedUid
      : uid === challengedUid
        ? challengerUid
        : null;

  if (loading) {
    return (
      <div className="rounded-[2rem] border border-white/10 bg-slate-950/72 p-5 text-sm text-slate-300">
        Opening the duelists’ line…
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="rounded-[2rem] border border-white/10 bg-slate-950/72 p-5">
        <div className="text-[10px] font-black uppercase tracking-[0.3em] text-amber-100/48">
          Match-room chat
        </div>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          Sign in as a duelist to open the private negotiation line for Match #{challengeId}.
        </p>
        <div className="mt-4"><SteamLoginButton /></div>
      </div>
    );
  }

  if (!targetUid) {
    return (
      <div className="rounded-[2rem] border border-white/10 bg-slate-950/72 p-5">
        <div className="text-[10px] font-black uppercase tracking-[0.3em] text-amber-100/48">
          Match-room chat
        </div>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          {isAdmin
            ? `Commissioner monitoring is available through the action log and title command rail. ${challengerName} and ${challengedName} keep their private negotiation private.`
            : "Only the two duelists can open this private negotiation line."}
        </p>
        {isAdmin ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={`/contact-emaren?user=${encodeURIComponent(challengerUid)}`} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/[0.08]">
              Message {challengerName}
            </Link>
            <Link href={`/contact-emaren?user=${encodeURIComponent(challengedUid)}`} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/[0.08]">
              Message {challengedName}
            </Link>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[2rem] border border-amber-100/16 bg-slate-950/72 p-3 shadow-[0_25px_90px_rgba(0,0,0,0.38)] sm:p-4">
      <div className="mb-3 px-1">
        <div className="text-[10px] font-black uppercase tracking-[0.3em] text-amber-100/48">
          Match-room private line
        </div>
        <p className="mt-1 text-sm text-slate-300">
          Negotiate Match #{challengeId} here; the pinned challenge card always stays tied to this exact match.
        </p>
      </div>
      <div className="h-[44rem] min-h-[34rem] max-h-[78vh] overflow-hidden rounded-[1.6rem]">
        <ContactEmarenWorkspace
          forcedTargetUid={targetUid}
          forcedChallengeId={challengeId}
          syncUrl={false}
          focused
        />
      </div>
    </div>
  );
}
