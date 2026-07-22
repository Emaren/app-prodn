import type {
  ContactInboxMessage,
  ContactInboxPayload,
} from "@/components/contact/types";
import { summarizeChallengeInboxMessage } from "../../lib/challengeInboxMessages.ts";

export type ContactInboxPayloadMergeMode = "refresh" | "prepend" | "replace";

export type MergeContactInboxPayloadOptions = {
  mode?: ContactInboxPayloadMergeMode;
  dropOptimistic?: boolean;
  removeMessageIds?: number[];
};

function compareMessages(left: ContactInboxMessage, right: ContactInboxMessage) {
  const timeDelta = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
  if (timeDelta !== 0) return timeDelta;

  if (left.kind === "text" && right.kind === "text") {
    return left.messageId - right.messageId;
  }

  return left.id.localeCompare(right.id);
}

function oldestPersistedMessageId(messages: ContactInboxMessage[]) {
  let oldest: number | null = null;
  for (const message of messages) {
    if (message.kind !== "text" || message.messageId < 1) continue;
    oldest = oldest === null ? message.messageId : Math.min(oldest, message.messageId);
  }
  return oldest;
}

function currentPayloadHasOlderHistory(
  current: ContactInboxPayload,
  incoming: ContactInboxPayload
) {
  const currentOldest = oldestPersistedMessageId(current.messages);
  const incomingOldest = oldestPersistedMessageId(incoming.messages);

  if (currentOldest !== null && incomingOldest !== null && currentOldest < incomingOldest) {
    return true;
  }

  return current.messages.filter(
    (message) => message.kind !== "text" || message.messageId > 0
  ).length > incoming.messages.length;
}

function collapseChallengeCards(messages: ContactInboxMessage[]) {
  const latestByChallengeId = new Map<number, ContactInboxMessage>();
  const passthrough: ContactInboxMessage[] = [];

  for (const message of messages) {
    if (message.kind !== "text") {
      passthrough.push(message);
      continue;
    }
    const notice = summarizeChallengeInboxMessage(message.body);
    if (!notice?.challengeId) {
      passthrough.push(message);
      continue;
    }
    const current = latestByChallengeId.get(notice.challengeId);
    if (!current || compareMessages(current, message) < 0) {
      latestByChallengeId.set(notice.challengeId, message);
    }
  }

  return [...passthrough, ...latestByChallengeId.values()];
}

/**
 * Reconciles a fresh latest-page payload or a prepended history page without
 * throwing away pages that the reader has already loaded.
 */
export function mergeContactInboxPayload(
  current: ContactInboxPayload | null | undefined,
  incoming: ContactInboxPayload,
  options: MergeContactInboxPayloadOptions = {}
): ContactInboxPayload {
  const mode = options.mode ?? "refresh";
  if (
    mode === "replace" ||
    !current ||
    current.activeTargetUid !== incoming.activeTargetUid
  ) {
    return incoming;
  }

  const removedIds = new Set(options.removeMessageIds ?? []);
  const messagesById = new Map<string, ContactInboxMessage>();

  for (const message of current.messages) {
    if (message.kind === "text" && removedIds.has(message.messageId)) continue;
    if (options.dropOptimistic && message.kind === "text" && message.messageId < 1) continue;
    messagesById.set(message.id, message);
  }

  // The server payload is authoritative for messages it contains (reactions,
  // receipts, edits, translations, and pins), while unseen older rows survive.
  for (const message of incoming.messages) {
    if (message.kind === "text" && removedIds.has(message.messageId)) continue;
    messagesById.set(message.id, message);
  }

  const preserveCurrentPage =
    mode === "refresh" && currentPayloadHasOlderHistory(current, incoming);

  return {
    ...incoming,
    messages: collapseChallengeCards(Array.from(messagesById.values())).sort(compareMessages),
    messagePage: preserveCurrentPage ? current.messagePage : incoming.messagePage,
  };
}
