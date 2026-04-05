import {
  AI_CONCIERGE_NAME,
  AI_CONCIERGE_UID,
  AI_GRIMER_NAME,
  AI_GRIMER_UID,
  AI_GUY_NAME,
  AI_GUY_UID,
  type AiPersonaId,
} from "@/lib/aiConciergeConfig";

export type LobbyAiPersonaId = AiPersonaId;

export type LobbyAiPersona = {
  id: LobbyAiPersonaId;
  uid: string;
  name: string;
  requestedModel: string;
  order: number;
  uiSelectable: boolean;
  enabledByDefault: boolean;
  publicMaxChars: number;
  privateMaxChars: number;
  styleLabel: string;
};

export const LOBBY_AI_PERSONAS: readonly LobbyAiPersona[] = [
  {
    id: "scribe",
    uid: AI_CONCIERGE_UID,
    name: AI_CONCIERGE_NAME,
    requestedModel: "Agent4.1Scribe",
    order: 10,
    uiSelectable: true,
    enabledByDefault: true,
    publicMaxChars: 280,
    privateMaxChars: 1000,
    styleLabel: "premium match scribe",
  },
  {
    id: "grimer",
    uid: AI_GRIMER_UID,
    name: AI_GRIMER_NAME,
    requestedModel: "Agent4.1Grimer",
    order: 20,
    uiSelectable: true,
    enabledByDefault: true,
    publicMaxChars: 160,
    privateMaxChars: 450,
    styleLabel: "dark sidecar",
  },
  {
    id: "guy",
    uid: AI_GUY_UID,
    name: AI_GUY_NAME,
    requestedModel: "Agent4.1Guy",
    order: 30,
    uiSelectable: false,
    enabledByDefault: false,
    publicMaxChars: 160,
    privateMaxChars: 400,
    styleLabel: "velvet knife",
  },
] as const;

export function getLobbyAiPersona(personaId: LobbyAiPersonaId) {
  return (
    LOBBY_AI_PERSONAS.find((persona) => persona.id === personaId) ?? LOBBY_AI_PERSONAS[0]
  );
}

export function getLobbyAiPersonaByUid(uid: string | null | undefined) {
  return LOBBY_AI_PERSONAS.find((persona) => persona.uid === uid) ?? null;
}

export function isLobbyAiPersonaUid(uid: string | null | undefined) {
  return getLobbyAiPersonaByUid(uid) !== null;
}

export function getLobbyAiPersonaName(uid: string | null | undefined) {
  return getLobbyAiPersonaByUid(uid)?.name ?? "AI";
}

export function getLobbySelectablePersonaIds(): Exclude<AiPersonaId, "guy">[] {
  return LOBBY_AI_PERSONAS.filter((persona) => persona.uiSelectable).map(
    (persona) => persona.id
  ) as Exclude<AiPersonaId, "guy">[];
}
