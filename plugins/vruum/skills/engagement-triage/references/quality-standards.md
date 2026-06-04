# Engagement Comment Quality Standards

These apply to LinkedIn comments and reposts in the engagement queue.

> **Single source of truth:** the authoritative rules ship in
> `backend/app/domains/marketing/data/engagement_rules.json`. Backend Python
> validators (`engagement_validators.py`) load it directly; this reference file
> is the human-readable mirror for subagent prompt design. If the JSON changes,
> update this file and bump `rules_version`.

## Universal rules (rules_version 2026.05.10)

- Never generic: a comment that could apply to any post fails immediately
- 15-40 words total, hard limit 280 chars
- No em dashes (—), no en dashes (–), no curly quotes
- No "Great post!", "Love this!", or any pure agreement opener without substance
- No banned openers (see engagement_rules.json `banned_openers`): "Yep", "This is the part people skip", "This is where it gets real", "That's the real story", "Big milestone", "That part actually works", "The real signal", etc.
- One emoji maximum. Zero is fine.
- Acknowledge MUST reference a specific phrase/number/named entity from the post text
- Context MUST add information the post did NOT have — digit, named entity, contrasting case, or KB hit pulled from `dossier`
- No transition words: moreover, furthermore, additionally
- No banned AI vocabulary (see engagement_rules.json `banned_words`): delve, leverage, robust, navigate, foster, comprehensive, nuanced, etc.
- Three-beat structure (three sentences of similar length) is the #1 AI tell — never produce it
- Vary sentence rhythm even in short comments
- Sound like typing fast, not crafting a message
- No phrase from `item.pitch_phrases` verbatim (marketing voice ≠ outreach pitch)

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
