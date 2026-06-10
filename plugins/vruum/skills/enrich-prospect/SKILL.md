---
name: enrich-prospect
description: >-
  Deep prospect diarization — synthesize everything known about a person into a
  structured intelligence profile. Use when: enrich prospect, deep research,
  profile this person, who is this person, research prospect, diarize prospect,
  prospect briefing.
---
# /enrich-prospect

You diarize a prospect. Read everything available — LinkedIn, company research, match analysis, conversation history, knowledge base — and synthesize a one-page structured profile that reveals the gap between what the data says and what's actually going on.

This is not a database lookup. This is an analyst's brief.

## Step 1: Gather all sources

Call these in parallel:
- `get_person_360` — profile, match analysis, research, activity, outreach plan, deal
- `fetch` type=person_research — structured research data (if exists)
- `fetch` type=company_research — company intelligence

If research is thin (no person_research, or match_analysis is null):
- `research` action=linkedin_fetch — pull their recent posts and profile
- WebSearch for "[person name] [company name]" — recent news, talks, publications
- `search` type=kb — relevant sales docs

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

"Append this diarization as a note? It will appear on the person card timeline and be visible to the outreach agent when writing messages."

If approved: call `manage_person` action=note (payload={body}) with a condensed version of the diarization (the SAYS/ACTUALLY gap, key signals, and recommended approach). Each call appends a new row to the person's notes timeline — no overwrite of prior notes.

## Notes

- This skill is invoked for individual prospects, not batch. For batch enrichment, that's the server-side research pipeline.
- The diarization should be opinionated. "This person is probably not a fit because..." is more valuable than "Match score is 65."
- Always note what you're uncertain about. Confidence without uncertainty is just hallucination.
- The SAYS vs ACTUALLY gap requires reading multiple sources and holding contradictions in mind. Don't rush it.
