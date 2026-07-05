# Engagement Comment Quality Standards

These apply to LinkedIn comments and reposts in the engagement queue.

> **Single source of truth:** the authoritative rules ship in
> `backend/app/shared/prose_gate/rules/engagement_comment.json`. The backend
> prose gate loads it directly; this reference file is the human-readable
> mirror for subagent prompt design. If the JSON changes, update this file and
> bump `rules_version`. To detect drift at runtime, call `check_prose` with
> `rules_only=true` for the surface — it returns the live rules pack +
> `rules_version` to compare against this file.

> Severity note: these rules are hypotheses from the 2026-07-04 triage
> failure corpus. The gate fires them as **advisory annotations** (recorded
> to the label corpus), not blocks — write to avoid them, and let the
> reviewer subagent make the taste call. Only hard channel character caps
> block (none apply to engagement comments).

## Universal rules (rules_version 2026.07.05.1)

- Never generic: a comment that could apply to any post fails immediately
- 15-40 words total, hard limit 280 chars
- No em dashes (—), no en dashes (–), no curly quotes
- No "Great post!", "Love this!", or any pure agreement opener without substance
- No banned openers (see engagement_comment.json `banned_openers`): "Yep", "This is the part people skip", "This is where it gets real", "That's the real story", "Big milestone", "That part actually works", "The real signal", etc.
- One emoji maximum. Zero is fine.
- Acknowledge MUST reference a specific phrase/number/named entity from the post text
- Context MUST add information the post did NOT have — digit, named entity, contrasting case, or KB hit pulled from `dossier`
- No transition words: moreover, furthermore, additionally
- No banned AI vocabulary (see engagement_comment.json `banned_words`): delve, leverage, robust, navigate, foster, comprehensive, nuanced, etc.
- Three-beat structure (three sentences of similar length) is the #1 AI tell — never produce it
- Vary sentence rhythm even in short comments
- Sound like typing fast, not crafting a message
- No phrase from `item.pitch_phrases` verbatim (marketing voice ≠ outreach pitch)
- No explicit calendar dates more than 10 days in the past (`stale_event_date`). A dated reference that's already old reads as scheduled automation.
- No stat/claim recycled across different prospects (`cross_prospect_repetition`). The gate watches a cross-prospect window; avoid reusing the same number or claim you used on someone else.
- No verbatim dossier fact about the TARGET stated in the sender's first person (`first_person_fabrication`). Attribute it to the prospect ("your 40% ramp improvement"), never claim it as the sender's own experience.

## Warming-specific

- Zero product or service references, ever
- Read like a thoughtful industry peer, not a vendor
- Never reference the sender's company by name
- Never imply prior familiarity unless there is actual history

## Nurture-specific

- Can be slightly warmer than warming
- May reference shared context only if genuinely relevant
- Still not salesy. No pitch. No ask.

## Marketing-specific

- Professional and non-salesy
- Represents the sender's professional brand
- Can express opinions and takes
- Can share relevant experience from the sender's domain

## Content post standards

- Strong hook (first line, under 8 words)
- White space: short paragraphs, single-line punchy statements
- Ends with a question or clear takeaway, never a CTA to buy
- 1-2 hashtags maximum
- No bullet-point overload (3 max)
- Must match content_tone_instructions from company settings
