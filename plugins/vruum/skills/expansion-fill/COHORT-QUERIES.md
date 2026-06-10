# Expansion-fill cohort recipes

The skill is harness-mode and runs entirely through the **Vruum MCP**. Tenant
scope is derived from your authenticated session — there is no raw SQL path,
no tenant bind to choose, no direct database connection. The recipes below
describe how to build the cohort using the MCP tools the public bundle
exposes.

## Primary cohort: closed-won >60d ago, no open follow-on

**Day-1 heuristic — works before any impact events are recorded.**

```
# Step 1: pull closed-won deals (results are scoped to your session's tenant)
won = search(type="deals", filters={"outcome": "won"}, limit=200)

# Step 2: keep deals whose actual_close_date is more than 60 days old
cutoff = now() - 60 days
won_old = [d for d in won.deals if parse(d.actual_close_date) < cutoff]

# Step 3: drop people who currently have an OPEN deal (i.e., a deal with
# outcome=None on the same person). If you can call search type=deals with no
# outcome filter, post-filter; otherwise rely on Step 3 of the skill workflow
# where get_person_360 surfaces each person's full deal history.
open_deals = search(type="deals", filters={"outcome": None}, limit=500)  # NULL outcome = still open
open_person_ids = { d.person_id for d in open_deals.deals }
candidates = [d for d in won_old if d.person_id not in open_person_ids]
```

If you have more than 200 won deals, paginate with the `offset` parameter on
`search`. Cap the candidate list to the most recently won 50 (sort by
`actual_close_date DESC`) before per-account enrichment.

Why this works without a DB query:

- `search` type=deals is tenant-scoped server-side; you don't (and can't)
  choose the tenant.
- Account-to-person mapping (the old `company_people` JOIN) is resolved by
  `get_person_360` in Step 3 of the skill workflow — call it per surfaced
  person and read `current_positions[0].company_id`.

## Optional refinement: account stage is tagged

If your team has been tagging account lifecycle stages on the Vruum
dashboard, call `fetch(type="account_state", id=<company_id>)` for each
candidate in the skill's Step 3 enrichment and:

- Up-rank rows where `account_stage` is `adopting` or `expansion_ready`.
- Down-rank or skip rows where `account_stage` is `dormant` or `churned` —
  those belong in `/winback-fill`, not expansion.
- Use `accounts.health_score` (returned in the same payload) as a gate;
  `> 70` is the floor for a productive expansion conversation.

The skill does not change account stages itself — stages are set in the
Vruum dashboard by whoever owns the account lifecycle.

## Scoring inputs (consumed by skill Step 4)

Per-account features the skill computes from `get_person_360` +
`fetch` type=company_research:

- `accounts.renewal_at` (from `fetch` type=account_state) — proximity weight
  (60-180d sweet spot)
- `accounts.health_score` — gate (>70 only)
- `accounts.account_stage` — boost (`adopting`, `expansion_ready`) or skip
  (`dormant`, `churned`)
- Most recent `practice='adoption'` activity in last 60d — engagement signal
- Recent touch sent + reply received → champion present
- New hire signals on company LinkedIn (via `research` action=linkedin_fetch)
  — fresh stakeholder = hook
- New dept created (via `research` action=linkedin_fetch) — multi-team
  expansion play
- Recent product/news events (via `research` action=enrich_company or saved
  research) — timing hook

## Hook generation

Each surfaced account needs a one-line hook before outreach. Generate it from:
1. New LinkedIn role at the customer in the last 30d (anchor: new DM)
2. Company news event in research output (anchor: external trigger)
3. Recent post/comment from the champion (anchor: warm reference)
4. Renewal calendar proximity (anchor: time-bound ROI conversation)

If no hook can be found → warm the account via `/pipeline-fill` or
`/marketing-engagement` first, then re-run this skill in 14-30 days.
Pushing expansion without a hook to a former champion who hasn't heard from
you in 6 months kills the relationship.
