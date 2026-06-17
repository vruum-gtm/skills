---
name: expansion-fill
description: >-
  Source expansion-ready customers for outreach. Finds closed-won customers >60
  days old with no open follow-on deal and surfaces them for an expansion play.
  Use when: expand customer, find upsell opportunities, NRR play, expansion
  opportunities, customers ripe for expansion, who can we expand to.
---
# Expansion Fill

You are an expansion-side pipeline filler. While `/pipeline-fill` sources cold prospects, this skill surfaces *existing customers* who are due for an expansion conversation — new product, larger seat count, multi-team rollout, renewal-with-uplift, etc.

## Why this skill exists

The post-sale side (Onboarding → Adoption → Expansion → Win-back) is where retention compounds. Most sellers spend 90% of their time on the left side (cold prospecting) and miss expansion conversations until renewal cycles force them. The impact scoreboard + impact event substrate give this skill data to work with; this skill is the harness-side orchestrator that turns "we should expand somewhere" into "here are 12 specific accounts to call, in priority order, with conversation hooks."

## Where heavy logic lives

[`COHORT-QUERIES.md`](./COHORT-QUERIES.md) — the cohort recipes (Vruum-MCP harness flow + scoring rationale). Read it before running the workflow if you need to understand or tweak the cohort definition. All recipes use `search` type=deals + post-filter; tenant scope is automatic from your session.

## Workflow

Step 1 — Read the impact scoreboard.
```
fetch(type="scoreboard", subtype="impact", filters={"window_days": 90})
```
- If `state == "no_events_yet"`: no impact data yet — fall through to the cohort SQL below to use the day-1 heuristic. Mention that the scoreboard is empty so you understand why this is running off deal data not impact events.
- Otherwise: surface the practice rollups so you see current state.

Step 2 — Build the cohort.
Follow the **primary cohort** recipe in `COHORT-QUERIES.md`. The recipe runs
`search(type="deals", filters={"outcome": "won"})` and post-filters in-memory;
tenant scope is automatic from your authenticated session. Cohort criteria:
- A deal closed `won` more than 60 days ago AND
- No open deal exists on the same person now (post-filter against
  `search` type=deals filters={outcome: None}) AND
- The person is still surfaceable via `get_person_360` (Step 3 enrichment).

Limit 50. Order by `actual_close_date DESC` (most recently won first — freshest relationship).

Step 3 — Per-account enrichment. For each surfaced (person, company):
- `get_person_360(person_id=<id>)` — pulls current title, recent activity, last touch, deal history
- `fetch(type="company_research", id=<company domain>)` — pulls firmographics, recent news/triggers

Step 4 — Score and rank. Within the cohort, rank by:
- (a) **Renewal pressure** — `accounts.renewal_at` within 60-180 days → up-rank
- (b) **Health signal** — `accounts.health_score` > 70 (only push expansion if account is healthy)
- (c) **Recent engagement** — if there's `practice='adoption'` activity in the last 60d (account engaged), up-rank
- (d) **Account stage** — `accounts.account_stage IN ('adopting', 'expansion_ready')` → up-rank; `dormant` → down-rank or skip
- (e) **Champion present** — if any `company_people` row has been engaged in the last 30d (touch sent or reply received), surface the champion's name

Down-rank or skip if:
- Account is `dormant` or `churned` (use `/winback-fill` instead)
- No champion currently engaged AND no recent touches in 60d (warm them first via `/pipeline-fill` style touch before pitching expansion)

Step 5 — Surface a ranked table:
```
| Rank | Account | Champion | Stage | Health | Renewal | Hook |
|------|---------|----------|--------|--------|---------|------|
| 1    | Acme    | Tyler T  | adopt  | 85     | 47d     | 3 new dept LinkedIns past 30d |
```

For each row, include a one-line "hook" — a specific recent observation from `get_person_360` or `fetch` type=company_research (new hire, new dept, news event, product usage signal) that frames the expansion conversation. **Never push expansion without a hook** — generic "checking in" outreach kills relationships.

Step 6 — Hand off to outreach. Two options:
- **Option A (recommended)**: Approve the ranked list, then for each account: run `/pipeline-fill` with that prospect_list — same Sales Nav harness flow, just sourced from the expansion cohort instead of cold. Tag the resulting `outreach_plans.tag` with `bowtie_pilot:expansion` so success-tracking finds them.
- **Option B**: Direct `manage_outreach` action=start with an expansion-flavored campaign (pre-create an `expansion_<your-tenant>` campaign with the right tone — formal, ROI-focused, no opener-hooks since the customer already knows you).

Step 7 — Success tracking (auto). When a calendar webhook fires a `meeting_booked` event on an outreach plan tagged `bowtie_pilot:expansion`, the webhook handler in `backend/app/domains/calendar/` auto-records the impact event, equivalent to:
```
manage_account(
  action="record_impact",
  payload={
    practice: 'expansion',
    event_type: 'expansion_meeting_booked',
    value_delivered_numeric: deal.estimated_value,
    ...
  }
)
```
You do NOT manually record the impact event for tagged plans. If a meeting is booked outside Vruum (manual scheduling, calendar tool not connected), record it manually via `manage_account` action=record_impact from the person 360 Activity tab.

After 30 days, run `fetch` type=scoreboard subtype=impact to measure cohort uplift: expansion `event_count` should be > 0 with `impact_sum` matching booked deal values.

## When NOT to use this skill

- Cold prospecting → use `/pipeline-fill`.
- Customer health diagnostic / churn prediction → that's a separate NRR workflow (not yet shipped).
- Cold prospecting on a churned customer's *new* employer → use `/winback-fill` (the "champion follows you" play).
- Stalled deal revival on a won-then-stuck account → use `/deal-triage` first; expansion is a separate motion.

## Vocabulary reference

See `docs/ACCOUNT-LIFECYCLE-VOCABULARY.md` for the 8 canonical account-lifecycle stages and impact event types. If you're unsure whether something is an `expansion` event or an `adoption` event, the doc has a flowchart.

## Backend authoritative gate

This skill is harness-mode: the harness picks the cohort, scores, and ranks. The backend's authoritative gate is the impact-event write itself (`manage_account` action=record_impact) — the dedupe key `(user_company_id, company_id, activity_type, source_type, source_id)` prevents double-write. The harness is uplift, not the SLA floor.
