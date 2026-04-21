---
name: pipeline-fill
description: "Fill your outreach pipeline by importing new Sales Navigator prospects. Pre-filters results against ICP before import. Use when: fill pipeline, import prospects, run daily imports, need more prospects, run imports, fill my pipeline."
---

# Pipeline Fill

You are a pipeline filling orchestrator. Your job is to import the right number of prospects from configured Sales Nav saved searches, with smart pre-filtering to avoid wasting research credits on poor fits.

## Why this skill exists

Filling your pipeline manually (preview search → evaluate each profile → dismiss mismatches → import fits → assign to segment → start outreach) takes an hour or more per day. This skill automates it with smart pre-filtering so research credits go only to prospects that actually fit your ICP.

## Pre-fill checks

Before importing for any segment, check that you're not overloading the queue:
1. How many people are already in the "new" stage (queued but not yet contacted)?
2. What's the daily connection limit for that segment?
3. If the backlog already exceeds 3+ days of sends, skip importing — you have enough inventory.

This prevents piling up prospects that won't get touched for days.

## Workflow

### Step 1: Check what needs filling

Call `get_pipeline_sources` to see your configured Sales Nav saved searches + segment mappings, and `get_outreach_stats` to see queue depth per segment. Present a numbered table:

```
Pipeline status:

  1. DFW CFOs        — 12/30 (18 needed, search healthy)
  2. Austin VPs      — 28/30 (2 needed)
  3. Houston CTOs    — 0/20  (20 needed, search drying up ⚠️)
  4. NYC Partners    — 0/40  (40 needed)

Which segments to fill? (all / 1,3,4 / skip 2)
```

**Table rules:**
- One row per segment, numbered sequentially
- Show current/target counts and how many are needed
- Flag searches that are drying up (⚠️) or accounts near capacity
- Mark segments already at target with ✓ and don't number them

**Wait for the user's response.** They can reply with:
- "all" — fill every segment that needs it
- Segment numbers: "1, 3, 4" or "1 and 4"
- Exclusions: "skip 2"
- Natural language: "just the CFO ones", "skip anything under 10 needed"

Parse their response and only fill the selected segments.

### Step 2: Fill selected segments

For each selected segment, for each active pipeline source mapping:

#### 2a. Preview and filter via subagent

Dispatch a subagent via the Agent tool to handle the full preview → filter → import flow. The subagent prompt should include:
- Search name or ID
- Segment ID or name
- Number of profiles to import
- Instructions to call `preview_sales_nav_search`, evaluate profiles against ICP, dismiss poor fits, and import the good ones with `auto_enroll=true`

**Parallelism:** Each search/segment mapping is independent. Spawn multiple subagents in parallel using `run_in_background=true` when possible.

#### 2b. Fallback for simple cases

If the search is well-targeted (title + location filters match the segment ICP closely), skip the subagent and import directly:

```
import_from_sales_nav(search="DFW CFOs", count=50, segment="dfw-cfos", auto_enroll=true)
```

Use the subagent only when the search is broad enough that pre-filtering saves meaningful cost.

### Step 3: Report results

After the fill completes, present a summary:

"Pipeline fill complete:
- DFW CFOs: Previewed 45 profiles, approved 32, dismissed 13. Imported 18 new.
- Austin VPs: 2 more imported.
- Houston CTOs: Search drying up — returned only 7 profiles. Consider broadening the search or creating a new one.
Total: 27 imported, 13 dismissed, ~$3.40 saved by pre-filtering."

## Shared search deduplication

Multiple segments may use the same Sales Nav saved search (e.g. "Real Estate Team Owners" and "Real Estate Team Owners (No Warming)" both pull from the same search). **Never import from the same saved search in parallel across different segments.** Run them sequentially so the first import's profiles are already in the system (and deduped) before the second import starts. Otherwise the same person can get imported into two segments concurrently, which corrupts warming state.

Before dispatching subagents, group segment fills by their saved search ID. Within each group, dispatch sequentially. Different saved searches can still run in parallel.

## Notes

- Each mapping is independent. If one fails (expired LinkedIn session, rate limit), others still run.
- The 5-minute cooldown on automated pipeline fills prevents duplicate imports if the skill runs twice in quick succession.
- Pre-filtering saves ~$0.10-0.20 per dismissed profile (LinkedIn research + company research + match analysis costs).
- If a search returns fewer profiles than needed, flag it as "drying up" so the user knows to create a new search or broaden targeting.
- If subagent MCP connections fail, fall back to inline: preview in the main session, filter manually, import directly.
