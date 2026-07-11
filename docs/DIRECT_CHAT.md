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
- A single follow-up animation frame accounts for final layout; the old timeout plus multiple-frame scroll sequence is intentionally retired.
- A resize observer keeps the viewport pinned when late-loading message content changes height and the user was already near the bottom.
- Scrolling upward preserves the reader's position and reveals the explicit jump-to-latest control.
- `/contact-emaren` deliberately uses two responsive scroll contracts: phones remain on natural document flow, while `lg` desktop viewports cap the application shell at `100dvh` so Full Chat stays inside a contained viewscreen. Desktop wheel and trackpad input from the outer page gutters is forwarded to the message timeline.
- Both surfaces load the latest 80 messages, then prepend older 80-message cursor pages while preserving the reader's exact scroll position.
- Message rows use browser-native `content-visibility` containment so off-screen bubbles do not consume full layout/paint work.
- Full Chat loads the initial thread in one request instead of fetching the summary and full payload sequentially.
- Nav Chat keeps warm per-thread payloads so revisiting a conversation paints immediately while a silent refresh reconciles it.
- Authenticated server-sent events push message, receipt, typing, reaction, pin, and update invalidations immediately. A 60-second poll remains as recovery only.
- The typing-display toggle belongs in the lower-left composer/footer area, outside the message viewport.

## Responsive presentation contract

- Nav Chat uses the full available phone height between the site header and the bottom safe area; it is not capped to an arbitrary fixed pixel/rem height.
- The conversation descriptor is intentionally omitted. The active name, honor/champion badges, gifted-WOLO state, and unread state share one compact identity row.
- Message character limits remain enforced at 1,000 characters, but persistent counters are intentionally hidden to preserve conversation and composer space.
- The Nav composer remains a single row at phone widths, with the growing text field and send action side by side.
- Full Chat stays naturally scrollable on phones and becomes an internally scrolling, viewport-contained workspace on desktop.
- These responsive rules are shared by V1, V2, and V3; a mode may change visual treatment, never the mobile space budget or interaction contract.

## Message intelligence and state

- Read receipts are automatic and enabled by default. Outgoing messages progress through `sending`, `sent`, `delivered`, `read`, or `failed`; failed optimistic sends expose a retry action.
- Opening a thread marks incoming messages read. Establishing the live event stream marks previously undelivered incoming messages delivered, even if that thread is not open.
- Draft text and quoted-reply targets are debounced to `direct_message_drafts`, shared between Nav Chat and Full Chat, and removed after a successful send.
- Replies persist a validated same-conversation message reference and render a compact quote in every mode.
- Pins are shared conversation state. The header pin drawer exposes the latest twelve pinned messages.
- Search covers message bodies and voice transcripts with case-insensitive Postgres search and returns the latest forty matches.
- `/game-stats/{id}` links hydrate into replay intelligence cards from canonical `GameStats` data.
- Translation is on demand, uses the existing authenticated AI gateway, and caches per-message/per-language output.
- Voice transcription is on demand through OpenAI's audio transcription API, persists on the message, and degrades to a clear unavailable state when credentials are not configured. `OPENAI_API_KEY` wins; otherwise the service reads `OPENAI_API_KEY_FILE` (default `/home/tony/.config/aoe2hdbets/openai.key`). `OPENAI_TRANSCRIPTION_MODEL` may override the default `gpt-4o-mini-transcribe`.

## Database migration

`20260710203000_direct_chat_state_of_the_art` adds delivery/edit/transcription/reply state plus drafts, pins, and cached translations. Production deploys must run `npx prisma migrate deploy` before restarting the web service.

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
11. At desktop widths, the page itself stays viewport-height while the Full Chat timeline scrolls; at phone widths, the page remains naturally scrollable.
