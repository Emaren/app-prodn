# Direct Chat UI

The private direct-chat experience is shared by the header Nav Chat and the full `/contact-emaren` workspace.

## Ownership

- `components/contact/ContactInboxPanel.tsx` owns the shared conversation chrome, timeline, reactions, typing presentation, scroll behavior, and V1/V2/V3 selector.
- `components/contact/HeaderInboxControl.tsx` owns the header popover lifecycle, lightweight closed-state summary polling, open-thread polling, and warm conversation cache.
- `components/contact/ContactEmarenWorkspace.tsx` owns the full-page data lifecycle, attachments, voice notes, URL-synced thread selection, and send actions.
- `components/contact/ContactRichComposer.tsx` owns the full-page attachment/voice composer and follows the active chat mode.
- `components/contact/chatViewPreference.ts` owns the persisted cross-surface preference. The local storage key is `aoe2war:direct-chat-view`.
- `lib/contactInboxConfig.ts` remains the source of truth for valid direct-message reactions and the six-item quick-reaction set.

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
- Full Chat loads the complete initial thread in one request instead of fetching the summary and full payload sequentially.
- Nav Chat keeps warm per-thread payloads so revisiting a conversation paints immediately while a silent refresh reconciles it.
- The typing-display toggle belongs in the lower-left composer/footer area, outside the message viewport.

## Verification

For changes to this surface, verify:

1. V1/V2/V3 switch in Nav Chat and Full Chat.
2. The selected mode persists after reload.
3. Initial thread load and conversation switches land on the latest message.
4. Upward reading is not pulled back to the bottom by polling.
5. The reaction picker stays inside the chat shell at desktop and narrow popover widths.
6. Quick and expanded reactions, edit/delete, receipts, typing, attachments, and send behavior still work.

