---
id: "aoe2war.app-prodn.docs-direct-chat"
title: "Direct Chat UI"
type: "reference"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn"]
audience: ["developers","ai-agents"]
source_of_truth: "git"
authority: "product-contract"
reviewed_at: "2026-08-14"
review_interval_days: 90
sensitivity: "internal"
---

# Direct Chat UI

The private direct-chat experience is shared by the header Nav Chat and the full `/contact-emaren` workspace.

## Ownership

- `components/contact/ContactInboxPanel.tsx` owns the shared conversation chrome, timeline, reactions, typing presentation, scroll behavior, and V1/V2/V3 selector.
- `components/contact/HeaderInboxControl.tsx` owns the header popover lifecycle, optimistic text outbox, live-event reconciliation, fallback polling, and warm conversation cache.
- `components/contact/ContactEmarenWorkspace.tsx` owns the full-page data lifecycle, attachments, voice notes, URL-synced thread selection, and send actions.
- `components/contact/ContactRichComposer.tsx` owns the full-page attachment/voice composer and follows the active chat mode.
- `components/contact/chatViewPreference.ts` owns the persisted cross-surface preference. The local storage key is `aoe2war:direct-chat-view`.
- `lib/contactInboxConfig.ts` remains the source of truth for valid direct-message reactions and the six-item quick-reaction set.
- `lib/directMessageEvents.ts` owns the process-wide server event bus; `/api/contact-emaren/events` exposes it as an authenticated SSE stream.

## Modes

### V1 — Classic bubbles

The original asymmetric floating-bubble presentation, tightened and kept visually familiar. It uses warm outgoing bubbles, cool incoming bubbles, quiet receipts, and compact reaction summaries.

### V2 — Compact lines

A Steam/Discord-inspired line feed. Messages use sender initials, sender/time headers, minimal surfaces, tight vertical rhythm, and a flatter composer. This is the high-density option for users who prefer scanning over floating cards.

### V3 — Obsidian glass

The premium command-room treatment. It uses restrained teal/amber light, glass message surfaces, narrower reading widths, and higher whitespace without changing the message or action contract.

All three modes are available in Nav Chat and Full Chat. A selection made in either surface updates the other surface and survives reload.

## Reaction behavior

- Reactions never auto-open from hover.
- Click a message on pointer devices or long-press it on touch to open the anchored picker.
- The quick bar contains `👍`, `😂`, `🔥`, `👀`, `GG`, and `🫡`.
- The small expansion control reveals the remaining configured reactions.
- Edit, delete, and AI public/private actions stay in the same anchored action surface when allowed.
- Existing reaction summaries remain directly toggleable below the message.

## Scroll and performance contract

- New or newly selected threads anchor to the latest message before paint.
- Initial thread positioning is a single synchronous layout pass; late media sizing is handled separately by the bottom-only resize observer.
- A frame-throttled resize observer keeps the viewport pinned only when the reader is genuinely at the bottom. Scrolling upward immediately releases that pin so image/layout changes cannot pull the reader back down.
- Scrolling upward preserves the reader's position and reveals the explicit jump-to-latest control.
- `/contact-emaren` is a contained chat viewscreen at every breakpoint. The shell follows `visualViewport.height` so iOS keyboard changes shrink the conversation instead of pushing the composer below the screen. Desktop wheel and trackpad input from the outer page gutters is forwarded to the message timeline.
- Both surfaces load the latest 80 messages, then prepend older 80-message cursor pages while preserving the reader's exact scroll position.
- Full Chat message rows use browser-native `content-visibility` containment so long histories stay efficient. Nav Chat deliberately keeps its smaller warm window fully painted to avoid reveal flicker and intrinsic-size jumps while scrolling through image-heavy messages.
- Full Chat loads the initial thread in one request instead of fetching the summary and full payload sequentially.
- Nav Chat keeps warm per-thread payloads so revisiting a conversation paints immediately while a silent refresh reconciles it.
- Full Chat now keeps the same warm per-thread payload cache. Conversation switches paint cached history immediately while stale requests are cancelled and the latest response wins.
- Authenticated server-sent events push message, receipt, typing, reaction, pin, and update invalidations immediately. A 60-second poll remains as recovery only.
- Realtime events ignore the connection handshake and refresh the open timeline only when the event belongs to that thread; other-thread events update the lightweight summary rail instead.
- Panel, summary, and search requests cancel superseded work so rapid conversation switches, typing events, and repeated searches cannot waste bandwidth or paint stale responses.
- The typing-display toggle belongs in the lower-left composer/footer area, outside the message viewport.

## Responsive presentation contract

- Nav Chat is portalled to `document.body`, above the sticky header stacking context, and uses the live visual-viewport height between the site header and bottom safe area. It must never be nested inside the header containing block.
- The conversation descriptor and inbox eyebrow are intentionally omitted. The active name, honor/champion badges, gifted-WOLO state, unread state, and appearance controls share one compact top row.
- Message character limits remain enforced at 1,000 characters, but persistent counters are intentionally hidden to preserve conversation and composer space.
- The Nav composer remains a single row at phone widths, with the growing text field and send action side by side.
- Full Chat uses compact horizontal conversation chips on phones and the full conversation rail on desktop. The global mobile command bar and the explanatory route hero are intentionally absent from the phone chat viewscreen.
- Both composers use 16px mobile text plus native text input hints so iOS focuses without zooming and can expose the software keyboard normally.
- These responsive rules are shared by V1, V2, and V3; a mode may change visual treatment, never the mobile space budget or interaction contract.

## Message intelligence and state

- Read receipts are automatic and enabled by default, but only the latest outgoing message renders a receipt line, matching the quiet Apple-style pattern. Normal stable states show only `Sent` until viewed, then the actual viewed-at timestamp as `Mon D · H:MM AM/PM`, with no `Read` label and no seconds. Transient sending/failure feedback remains available for reliability and retry.
- Full Chat keeps compact floating date chips pinned to the scrolling timeline. Nav Chat omits them entirely to protect the smaller viewscreen; its latest outgoing receipt already carries the calendar date.
- Edits are intentionally silent in the public presentation: corrected text replaces the old copy without an `edited` badge. Deletes remove the message without leaving a public tombstone; server authorization and internal timestamps remain intact.
- Message action trays deliberately disable `content-visibility` paint containment only while open, then choose an above/below anchor inside the timeline. This keeps reactions, reply, pin, translation, edit, and delete fully visible without giving up off-screen message rendering performance.
- Opening a thread advances `lastReadAt` only when unread incoming activity actually exists. Reopening, refreshing, or merely checking an already-read Nav Chat / Full Chat thread does not rewrite the read timestamp into a generic "last opened" time. Establishing the live event stream still marks previously undelivered incoming messages delivered, even if that thread is not open.
- Draft text and quoted-reply targets are debounced to `direct_message_drafts`, shared between Nav Chat and Full Chat, and removed after a successful send.
- Replies persist a validated same-conversation message reference and render a compact quote in every mode.
- Pins are shared conversation state. The header pin drawer exposes the latest twelve pinned messages.
- Search covers message bodies and voice transcripts with case-insensitive Postgres search and returns the latest forty matches.
- `/game-stats/{id}` links hydrate into replay intelligence cards from canonical `GameStats` data.
- Plain `http(s)` and `www` URLs render as safe clickable links in original and translated message text.
- Translation is on demand, uses the account's preferred language (or the browser language in Auto mode), and caches per-message/per-language output. It opens inline beneath the original and toggles back to the original without reloading the inbox.
- `/profile` exposes all languages supported by the site translator. The selection is stored to the signed-in account plus the device and drives both the global language control and direct-message Translate action.
- Editing a message clears its cached translations so corrected source text can never display a stale translation.
- Voice transcription is on demand through OpenAI's audio transcription API, persists on the message, and degrades to a clear unavailable state when credentials are not configured. `OPENAI_API_KEY` wins; otherwise the service reads `OPENAI_API_KEY_FILE` (default `/home/tony/.config/aoe2hdbets/openai.key`). `OPENAI_TRANSCRIPTION_MODEL` may override the default `gpt-4o-mini-transcribe`.

## Database migration

`20260710203000_direct_chat_state_of_the_art` adds delivery/edit/transcription/reply state plus drafts, pins, and cached translations. `20260713120000_add_user_preferred_language` adds the account-level chat/interface language preference. Production deploys must run `npx prisma migrate deploy` before restarting the web service.

## Verification

For changes to this surface, verify:

1. V1/V2/V3 switch in Nav Chat and Full Chat.
2. The selected mode persists after reload.
3. Initial thread load and conversation switches land on the latest message.
4. Upward reading is not pulled back to the bottom by polling.
5. The reaction picker stays inside the chat shell at desktop and narrow popover widths.
6. Quick and expanded reactions, edit/delete, receipts, typing, attachments, and send/retry behavior still work.
7. Older-page loading preserves scroll position and never fetches the former 5,000-message payload.
8. Search, pins, replies, cross-surface drafts, replay cards, translation, and transcription work in V1/V2/V3.
9. With two signed-in browsers, delivery/read/typing changes arrive without waiting for the fallback poll.
10. At 375–430px widths, Nav Chat reaches the bottom safe area, the identity badge stays beside the active name, the composer stays on one row, and no character counter or conversation descriptor is rendered.
11. At desktop and phone widths, Full Chat stays viewport-height while the message timeline scrolls internally; opening the iOS keyboard must shrink the viewscreen and keep the focused composer visible.
12. Full Chat shows compact thread chips rather than the desktop conversation rail on phones, and the global mobile command bar is absent.
13. Message links open safely in a new tab without opening the message action tray.
14. Choosing French (or another supported language) in `/profile` persists across reloads; Translate displays that language inline in Nav Chat and Full Chat without a full-timeline refresh.
15. Nav Chat renders no floating date chip; Full Chat retains the compact sticky date context.
