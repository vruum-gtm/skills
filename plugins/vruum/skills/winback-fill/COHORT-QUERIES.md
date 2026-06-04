# Winback-fill cohort recipes

Same harness-mode pattern as `/expansion-fill`. Three cohort variants — pick
one per run. **All recipes run through the Vruum MCP only** — tenant scope
is derived from your authenticated session, there is no raw SQL path and no
tenant bind to choose.

## Variant 1: 90-day silent-deal revival (default)

```
# Step 1: pull closed-lost deals (scoped to your session's tenant)
lost = get_deals(outcome="lost", limit=200)

# Step 2: keep deals lost between 90 days and 18 months ago
ninety_days_ago = now() - 90 days
eighteen_months_ago = now() - 18 months
revival_window = [
    d for d in lost.deals
    if eighteen_months_ago < parse(d.stage_changed_at) < ninety_days_ago
]

# Step 3: drop terminal loss reasons — these are NOT revivable
revivable = [
    d for d in revival_window
    if (d.loss_reason or '') not in ('no_fit', 'no_budget_permanent')
]

# Step 4: drop people who currently have an OPEN deal (NULL outcome)
open_deals = get_deals(outcome=None, limit=500)
open_person_ids = { d.person_id for d in open_deals.deals }
candidates = [d for d in revivable if d.person_id not in open_person_ids]
```

Cap the candidate list to the 50 most-recently-lost (sort by
`stage_changed_at DESC`) before per-account enrichment.

The 18-month upper bound prevents revival of ancient conversations the
buyer has forgotten. The 90-day lower bound prevents the "thanks but no
thanks" buyer from being re-pitched while the rejection is still fresh.

Why this works without a DB query:

- `get_deals` is tenant-scoped server-side.
- The old `company_people` JOIN (to resolve account from person) is replaced
  by `get_person_360` in the skill's Step 3 enrichment — call it per
  surfaced person; `current_positions[0].company_id` is the account.

## Variant 2: Champion-follows-you

A former champion at a lost or churned account has moved to a new company.
The "warmest cold-outreach possible" play.

```
# Step 1: pull historic deals (lost OR won, since won-then-churned applies)
historic_lost = get_deals(outcome="lost", limit=200).deals
historic_won  = get_deals(outcome="won",  limit=200).deals
former_buyer_person_ids = {
    d.person_id for d in (historic_lost + historic_won)
    if parse(d.stage_changed_at or d.actual_close_date) < (now() - 60 days)
}

# Step 2: for each former buyer, ask get_person_360 for their current
# position. If current_positions[0].company_id != the old account's
# company_id, this person has moved — the warmest revival angle in the book.
moved_champions = []
for pid in former_buyer_person_ids:
    profile = get_person_360(person_id=pid)
    current_co = (profile.current_positions or [{}])[0].get("company_id")
    if current_co and current_co != profile.previous_account_company_id:
        moved_champions.append(profile)
```

Suggested outreach framing: "We worked together at [old co] — I see
you've joined [new co]. Wanted to reconnect and learn what you're building."

## Variant 3: Trigger-driven winback

Pull `dormant`/`churned` accounts where a fresh trigger has fired (new exec,
funding, press, layoff at a competitor) and use the trigger as the revival
hook.

```
# Per surfaced account (from Variant 1), call get_company_research to see
# if any recent news/event was captured in the last 14 days. The harness
# does not currently expose a direct "list firing triggers" tool in the
# public MCP — read recent triggers off the company_research payload.
for d in variant_1_candidates:
    research = get_company_research(company_id=d.account_company_id)
    fresh_triggers = [
        t for t in (research.recent_signals or [])
        if (now() - parse(t.fired_at)) < 14 days
    ]
    if fresh_triggers:
        # Use this trigger as the revival hook in the outreach prompt.
        ...
```

If `get_company_research` returns no recent signals, this variant degrades
to Variant 1 silently — no harm done.

## Why these recipes are safe

All three variants:
- Run through `get_deals` / `get_person_360` / `get_company_research`, all of
  which derive `user_company_id` from your authenticated session. You CANNOT
  choose a different tenant.
- Exclude terminal loss reasons (`no_fit`, `no_budget_permanent`) in
  post-filter (variant 1).
- Exclude people with open deals (would conflict with active outreach).
- Cap to 50 rows after sorting, so the per-account enrichment loop stays
  bounded.

## Hook generation requirements

Same rule as `/expansion-fill`: every surfaced row needs a specific,
verifiable hook before outreach. Generic check-ins kill former-buyer
relationships permanently. If no hook can be found in 60 seconds of
enrichment research, defer the row.

Good hook examples:
- "Your new CFO joined 3 weeks ago — they came from [X] where they used our category"
- "Series B announced last Thursday — typically that's when [the original pain] becomes a priority again"
- "I see you (the former champion) just moved to Globex — congrats on the new role"

Bad hook examples (never use):
- "Just wanted to check in"
- "Circling back on our previous conversation"
- "Has anything changed?"
- "Hope all is well"
