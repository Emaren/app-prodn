import { AI_CONCIERGE_NAME, AI_CONCIERGE_UID } from "@/lib/aiConciergeConfig";
import {
  getLobbyAiPersonaByUid,
  getLobbyAiPersonaName,
  isLobbyAiPersonaUid,
} from "@/lib/aiPersonaCatalog";

export function getAiThreadKind(uid: string | null | undefined) {
  return isLobbyAiPersonaUid(uid) ? "ai" : "direct";
}

export function getAiComposerPlaceholder(uid: string | null | undefined) {
  const persona = getLobbyAiPersonaByUid(uid);
  if (!persona) {
    return `Ask ${AI_CONCIERGE_NAME} about the site, players, replays, or WOLO...`;
  }

  return `Message ${persona.name}...`;
}

export function isPublicShareableAiMessage(args: {
  senderUid: string | null | undefined;
  body: string | null | undefined;
  attachment: unknown;
}) {
  return (
    isLobbyAiPersonaUid(args.senderUid) &&
    !args.attachment &&
    Boolean(args.body?.trim().length)
  );
}

export function isPrimaryAiPersonaUid(uid: string | null | undefined) {
  return uid === AI_CONCIERGE_UID;
}

export function getAiDisplayName(uid: string | null | undefined) {
  return getLobbyAiPersonaName(uid);
}
