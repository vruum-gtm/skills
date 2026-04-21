---
name: enrich-prospect
description: >-
  Deep prospect diarization — synthesize everything known about a person into a
  structured intelligence profile. Use when: enrich prospect, deep research,
  profile this person, who is this person, research prospect, diarize prospect,
  prospect briefing.
---

## Auto-update check

Before starting, run `~/.vruum/bin/vruum-skills-update-check` (path relative to this repo). Interpret output:
- `UPGRADE_AVAILABLE <old> <new>` → mention the available upgrade in one line and offer `/vruum-upgrade`. Then continue.
- `JUST_UPGRADED <old> <new>` → acknowledge in one line, then continue.
- Empty → proceed silently.

Never block skill execution on this check.

# /enrich-prospect

You diarize a prospect. Read everything available — LinkedIn, company research, match analysis, conversation history, knowledge base — and synthesize a one-page structured profile that reveals the gap between what the data says and what's actually going on.

This is not a database lookup. This is an analyst's brief.

## Step 1: Gather all sources

Call these in parallel:
- `get_person_360` — profile, match analysis, research, activity, outreach plan, deal
- `get_person_research` — structured research data (if exists)
- `get_company_research` — company intelligence

If research is thin (no person_research, or match_analysis is null):
- `fetch_linkedin_data` — pull their recent posts and profile
- WebSearch for "[person name] [company name]" — recent news, talks, publications
- `search_knowledge_base` — relevant sales docs

## Step 2: Diarize

Read all sources. Hold them in mind at once. Write a structured profile:

"## [Person Name] — [Title] at [Company]

**SAYS:** [What their title/bio/LinkedIn headline says they do]

**ACTUALLY:** [What the evidence suggests they actually focus on — based on posts, research, hiring patterns, company signals. This is the gap that matters.]

**Key signals:**
- [Signal 1: specific, verifiable fact from research or posts]
- [Signal 2]
- [Signal 3]

**Fit assessment:**
- Match score: [X]/100 — [alignment summary]
- Strongest alignment: [specific alignment point with evidence]
- Biggest concern: [specific concern or unknown]
- Why now: [trigger event or timing signal, if any]

**What we're uncertain about:**
- [Thing we don't know that would change the approach]
- [Assumption we're making that could be wrong]

**Recommended approach:**
- [Specific angle based on the diarization, not generic]
- [What NOT to say based on their actual situation]"

## Step 3: The "SAYS vs ACTUALLY" gap

This is the most important part. Examples:

- **SAYS** "VP of Engineering" → **ACTUALLY** their last 3 posts are about hiring and retention, not technology. They're a people manager, not a tech leader. Approach through team-building lens, not tech lens.

- **SAYS** "Datadog for AI agents" → **ACTUALLY** 80% of their GitHub commits are in the billing module. They're building a FinOps tool disguised as observability.

- **SAYS** "Director of Marketing" → **ACTUALLY** their company just raised Series B and they posted about building an in-house content team. They're scaling, not maintaining.

No embedding search finds these gaps. No keyword filter finds them. You have to read the full profile and make a judgment.

## Step 4: Offer to save

"Update AI notes with this diarization? This will be visible to the outreach agent when writing messages."

If approved: call `update_person_ai_notes` with a condensed version of the diarization (the SAYS/ACTUALLY gap, key signals, and recommended approach).

## Notes

- This skill is invoked for individual prospects, not batch. For batch enrichment, that's the server-side research pipeline.
- The diarization should be opinionated. "This person is probably not a fit because..." is more valuable than "Match score is 65."
- Always note what you're uncertain about. Confidence without uncertainty is just hallucination.
- The SAYS vs ACTUALLY gap requires reading multiple sources and holding contradictions in mind. Don't rush it.
