---
name: sales-nav-deep-fill
description: >-
  Sales Nav harness source for /pipeline-fill. Pre-filters Sales Nav profiles
  via vruum-pipeline-filter, produces a candidate list, hands off to
  /pipeline-fill for deep research and import. Use when: sales nav with deep
  research, sales nav harness mode, in-chat sales nav.
---
# Sales Nav Deep Fill (harness source)

You are the Sales Nav harness-mode source for `/pipeline-fill`. You produce a candidate list from a Sales Nav saved search and hand off to the orchestrator for deep research, harness gate, and save chain.

**This is the harness counterpart to `/sales-nav-platform-fill`.** The platform skill calls `import_prospects` with action=sales_nav_import and lets backend agents do everything (Vruum's compute). This skill stops at producing a candidate list — Phase A and Phase B run in your chat session (your harness compute), and `manage_person` with action=save_discovered is called only after the harness pre-filter gate passes. Pick this when you want visibility into the deep research as it happens.

## Inputs

- `segment`: target segment (single — multi-segment lives in `/pipeline-fill`)
- `count`: how many profiles to pre-filter (default 30)

## Workflow

### Step 1: Preview Sales Nav profiles

Call `import_prospects(action="sales_nav_preview", payload={segment: ..., count: ...})`. Returns profile data + segment ICP context (target_titles, target_industries, value_proposition, positioning_angle, differentiators).

### Step 2: Dispatch `vruum-pipeline-filter` for ICP pre-filter

Spawn the existing `vruum-pipeline-filter` subagent (defined at `.claude/agents/vruum-pipeline-filter.md`). It evaluates each profile against the segment ICP using cheap title/company matching — no LinkedIn API calls, no deep research. APPROVE / DISMISS per profile.

This is the cheap pre-filter — it removes obvious mismatches (titled-wrong, industry-wrong) before they enter Phase A/B deep research. Saves ~8 minutes per fill on a 30-profile preview that has 10 mismatches.

### Step 3: Build candidate list

Take the APPROVED profiles from Step 2 and convert them to the canonical candidate-list shape. From each profile, capture:
- `full_name` (from profile name)
- `company` (from profile current company)
- `linkedin_url` (canonicalize via the LinkedIn URL in the profile)
- `title` (current title — useful for downstream classification but Phase B re-fetches authoritatively)
- `email`: null (Phase B finds it)
- `person_id`: null (resolved in Step 7 of engine flow)
- `raw_signals`: `{source: "sales-nav-deep", search_id: ..., preview_metadata: {...}}`

### Step 4: Hand off to /pipeline-fill (canonical handoff prompt)

Emit the canonical handoff prompt (defined in `pipeline-fill/RESEARCH-ENGINE.md` — the canonical handoff section):

```
Candidate list ready: {N} prospects from sales-nav-deep.

NEXT: invoke /pipeline-fill Step 3 onward (deep research → harness gate → save) with this list and segment {segment_id}.

Continue automatically? (y/n)
```

- Operator answers `y` → continue into the engine doc's Step 3.
- Operator answers `n` → exit cleanly with the candidate list visible in chat.

## Notes

- **For the operator:** pick this when you want to see the deep research happen, want to interrupt mid-stream, or want zero platform compute cost on the front-half (sourcing + research). The back-half (`manage_person` action=save_discovered, which runs `analyze_person_match` + the `match_score >= 70` gate) still runs on Vruum, intentionally — it's the canonical gate.
- **Don't call `import_prospects` with action=sales_nav_import directly from this skill.** That triggers the backend research pipeline, which is exactly what we're avoiding by being in harness mode. If you need the backend path, use `/sales-nav-platform-fill` instead.
- **vruum-pipeline-filter pre-filter is FREE** for the operator (cheap title/company match). The expensive Phase B research only fires on prospects that survive that filter.
