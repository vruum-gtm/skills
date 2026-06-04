---
name: winback-fill
description: >-
  Source winback candidates from closed-lost deals or churned customers.
  Surfaces people who went silent or lost a deal >90 days ago, where the loss
  reason wasn't 'no_fit'. Use when: winback, win back churned, reactivate,
  revive cold deals, 90-day silent revival, lost deal recovery, lost customer
  outreach.
---
# Winback Fill

You are a winback-side pipeline filler. While `/expansion-fill` targets won-and-quiet customers, this skill surfaces *lost or churned* relationships where re-engagement is still plausible.

## Why this skill exists

A closed-lost deal is not a closed door. Most "lost" deals had a real conversation, a fit signal, and a circumstantial blocker — wrong timing, wrong champion, wrong budget cycle. Within 6-18 months, those circumstances change. The data points worth revisiting:
- The person is still at the same company (relationship intact)
- The original loss_reason was NOT `no_fit` or `no_budget_permanent` (the deal was lose-able, not unwinnable)
- Their company has had a recent trigger (new exec, funding, news event)
- A former champion has moved to a new company (the "champion follows you" play)

The impact scoreboard and the `account_stage='churned'`/`'dormant'` tagging let this skill target the right accounts deterministically.

## Where heavy logic lives

[`COHORT-QUERIES.md`](./COHORT-QUERIES.md) — three Vruum-MCP cohort recipes
(all `get_deals` + post-filter; tenant scope is automatic from your session):
1. **90-day silent-deal revival** (default): lost deals >90d old, person still at company, loss reason not terminal
2. **Champion-follows-you**: former champion moved to a new company (re-targeted at new co via `get_person_360.current_positions`)
3. **Trigger-driven winback**: surfaced via fresh signals on `get_company_research` (new exec, funding, press)

Start with cohort 1 unless you specify otherwise.

## Workflow

Step 1 — Read scoreboard.
```
get_account_impact_scoreboard(window_days=90)
```
Surface practice rollups. Empty state → fall through to day-1 heuristic.

Step 2 — Build the cohort using the recipes in `COHORT-QUERIES.md`. All
recipes use `get_deals` + post-filter via the Vruum MCP; tenant scope is
automatic from your authenticated session. Pick a variant per your intent
(default: variant 1).

For variant 1 (silent-deal revival), the cohort criteria:
- `outcome == 'lost'`
- `stage_changed_at` between 90 days ago and 18 months ago
- `loss_reason NOT IN ('no_fit', 'no_budget_permanent')` (these are terminal — don't re-pitch)
- Person is still surfaceable via `get_person_360` (still at company)
- No open deal currently exists on that person (post-filter against
  `get_deals(outcome=None)`)

Limit 50. Order by `stage_changed_at DESC` (most-recent loss first — freshest memory of the conversation).

Step 3 — Per-account enrichment.
- `get_person_360` — what was the original conversation? `analysis` JSONB on the old deal often captures objection patterns.
- `get_company_research` — has anything changed at the company? New exec? Funding? Recent news?
- `accounts.account_stage` — if `churned`, the account has been flagged as dead. Skip or down-rank unless variant 2/3 applies.

Step 4 — Score and rank.
- **Loss reason quality**: `competitor_chose_other`, `timing`, `budget_cycle`, `no_decision` are revivable. `no_fit`, `no_budget_permanent` are not (already filtered, but double-check).
- **Time since loss**: 90-180d is the sweet spot. Below 90d feels like begging; above 18mo and the original conversation is forgotten.
- **Trigger present**: new exec, funding, layoff at competitor, news event → up-rank significantly. If there's a fresh trigger, this is the highest-value cohort row.
- **Champion presence**: if the original buyer is still at the company → strong signal. If they've left and a new person owns the buying decision → use as a "new champion" angle.
- **Account state**: `dormant` is the target; `churned` only if a trigger justifies revival.

Step 5 — Surface a ranked table:
```
| Rank | Account | Person | Lost   | Reason             | Trigger              |
|------|---------|--------|--------|--------------------|----------------------|
| 1    | Acme    | Tyler  | 4mo    | timing             | new CFO joined 2wk ago |
| 2    | Globex  | Pam    | 6mo    | competitor_chose   | Series B raised last wk |
```

Each row needs a **specific reactivation hook**. Generic "checking in" outreach to a former buyer kills the relationship permanently. The hook must reference something concrete:
- A new exec, funding, or news event at the company
- An industry-wide shift (regulation, competitor failure)
- A change in your own product (new feature, new pricing) that addresses the original objection
- A mutual contact or community event

If no hook can be generated → defer the row. Warm via marketing/content first, then re-run in 30-60 days.

Step 6 — Hand off. Two options:
- **Option A (recommended)**: Approve the list; run `/pipeline-fill` with the prospect_list for harness deep research + outreach. Plans get `outreach_plans.tag = bowtie_pilot:winback`.
- **Option B**: Direct `start_outreach` with a winback-flavored segment (pre-create a `winback_<your-tenant>` segment — tone: empathetic, no apology, lead with what changed since last conversation).

Step 7 — Success tracking (auto). The calendar webhook fires:
```
record_impact_event(
  practice='winback',
  event_type='winback_meeting_booked',
  value_delivered_numeric=deal.estimated_value,
  ...
)
```
when a meeting is booked on a plan tagged `bowtie_pilot:winback`. You do NOT manually fire for tagged plans. After 30 days, `get_account_impact_scoreboard` should show winback `event_count` > 0.

## When NOT to use this skill

- Original loss reason was `no_fit` → not revivable; don't waste time. The cohort SQL excludes these.
- Below 90d since loss → too soon. The buyer remembers the rejection vividly; re-pitching reads as desperate. Wait.
- Above 18mo since loss → the original conversation is forgotten. Treat as cold (`/pipeline-fill`).
- Customer expansion play → use `/expansion-fill`.
- Stalled active deal → use `/deal-triage`. Winback is for *closed* losses, not stuck deals.

## Vocabulary reference

See `docs/ACCOUNT-LIFECYCLE-VOCABULARY.md` for the 8 canonical account-lifecycle stages. Winback specifically operates on `dormant` and `churned` accounts.

## Backend authoritative gate

Same pattern as `/expansion-fill`: harness-mode uplift; the backend's `record_impact_event` is the authoritative write surface with dedupe.
