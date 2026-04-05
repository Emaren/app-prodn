import type { AiPersonaId } from "@/lib/aiConciergeConfig";
import type { RequestAiConciergeReplyArgs } from "@/lib/aiConcierge";
import { getLobbyAiPersona } from "@/lib/aiPersonaCatalog";

type SelectableAiPersonaId = Exclude<AiPersonaId, "guy">;

export type LobbyPersonaReplyRequest = Omit<RequestAiConciergeReplyArgs, "personaId"> & {
  selectedPersonaIds: SelectableAiPersonaId[];
  guyEnabled?: boolean;
};

export type LobbyPersonaReply = {
  personaId: AiPersonaId;
  personaName: string;
  personaUid: string;
  body: string;
  requestedModel: string;
  requestedModelLabel: string;
};

function shouldSummonGuy(args: {
  selectedPersonaIds: SelectableAiPersonaId[];
  userMessage: string;
  existingReplies: LobbyPersonaReply[];
  guyEnabled?: boolean;
}) {
  if (!args.guyEnabled) {
    return false;
  }

  if (!args.selectedPersonaIds.includes("grimer")) {
    return false;
  }

  if (args.existingReplies.length < 2) {
    return false;
  }

  const text = args.userMessage.toLowerCase();
  const triggerWords = [
    "betray",
    "traitor",
    "greed",
    "arrog",
    "snake",
    "scheme",
    "conspir",
    "ambush",
    "rival",
    "drama",
    "salty",
    "copium",
    "throne",
  ];

  return triggerWords.some((word) => text.includes(word));
}

export async function requestEnabledAiReplies(
  args: LobbyPersonaReplyRequest,
  requestAiReply: (args: RequestAiConciergeReplyArgs) => Promise<LobbyPersonaReply>
) {
  const orderedPersonaIds: SelectableAiPersonaId[] = [];

  if (args.selectedPersonaIds.includes("scribe")) {
    orderedPersonaIds.push("scribe");
  }

  if (args.selectedPersonaIds.includes("grimer")) {
    orderedPersonaIds.push("grimer");
  }

  const replies: LobbyPersonaReply[] = [];

  for (const personaId of orderedPersonaIds) {
    const reply = await requestAiReply({
      ...args,
      personaId,
    });

    replies.push(reply);
  }

  if (
    shouldSummonGuy({
      selectedPersonaIds: args.selectedPersonaIds,
      userMessage: args.userMessage,
      existingReplies: replies,
      guyEnabled: args.guyEnabled,
    })
  ) {
    const guy = getLobbyAiPersona("guy");
    const lastReply = replies.at(-1)?.body?.trim();
    const augmentedUserMessage = lastReply
      ? `${args.userMessage}\n\nRecent booth line to riff on:\n${lastReply}`
      : args.userMessage;

    const guyReply = await requestAiReply({
      ...args,
      personaId: "guy",
      userMessage: augmentedUserMessage,
    });

    replies.push({
      ...guyReply,
      personaId: "guy",
      personaName: guy.name,
      personaUid: guy.uid,
      requestedModel: guy.requestedModel,
    });
  }

  return replies;
}
