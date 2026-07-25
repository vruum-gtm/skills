---
name: campaign-builder
description: >-
  Build and launch an outreach campaign from criteria in about five prompts:
  filter contacts by size, industry, persona, region, or list; preview the
  cohort; create the campaign (optionally cloning messaging from an existing
  one); assign people; review and launch. Use when: create a campaign, build a
  campaign, new campaign from criteria, campaign from my list.
---
# Campaign Builder

You guide the seller from "I want to reach this kind of person" to a launched campaign in about five exchanges. The conversation IS the segmentation tool: criteria in plain language, a previewed cohort, a campaign reusing what already works, an explicit launch confirmation. Never launch anything without the confirmation step.

## Step 1: Capture the criteria

Ask what cohort they want to reach if they haven't said. Criteria can combine:

- **List**: a named list (e.g. mirrored from a CRM export) — `filters={list: "<name or id>"}`
- **Custom attributes** from their import (e.g. sorted company size / industry / region) — `filters={custom: {"sorted_company_size": "small", "sorted_industry": "staffing & recruiting"}}`
- **Persona** (buying role): influencer | decision_maker | economic_buyer — `filters={persona: "economic_buyer"}`
- Standard filters: stage, score range, enrollment, relationship type

If they reference attributes you haven't seen, call `search` with `type="people"` and `limit=1` first and inspect a row's `custom_fields` keys so you offer real attribute names, not guesses.

If personas matter to their criteria and contacts are unclassified (`filters={persona: "unclassified"}` returns many), offer to run `research` with action=classify_personas first (payload `{}` classifies every unclassified contact; large runs return a job id — poll with `fetch` type=job until completed, then continue).

## Step 2: Preview the cohort

Call `search` with `type="people"` and the criteria (include `filters={research_status: "all"}` so stub imports are visible). Show:
- The total count
- A 5-row sample: name, title, company, persona, the custom attributes that matched

Iterate with the seller until the cohort is right ("too broad — only the US ones" → add the region attribute). This is the step to get right; everything after is mechanical.

### Named-account sourcing handoff

If the criteria names organizations/accounts and the preview has fewer people than needed, do not create an empty campaign or pretend the accounts are contacts. Hand off the missing-account cohort to `/pipeline-fill` discovery before Step 3:

- Build `source_policy` using `.agents/skills/pipeline-fill/contracts/source-policy.schema.json`.
- Preserve every explicit provider instruction. Example: "use Clay, no Sales Nav or CSV" becomes `selected_source: "clay"`, `source_mode: "preferred"`, `prohibited_sources: ["sales_nav", "linkedin", "csv"]`, and an ordered `allowed_fallbacks` list.
- Use the schema defaults unless the seller overrides them: company waves 10, person waves 5, and two retries for transient failures. `source_mode: "exclusive"` requires `allowed_fallbacks: []`.
- Pass the named organizations and campaign criteria as the discovery ICP brief.
- Set pipeline-fill `mode: "save"` explicitly. This persists approved people so their IDs can return here, but cannot enroll them or start outreach.
- Let `/pipeline-fill` source companies first, resolve up to five matching people per company in bounded waves, preview the people, and return their IDs.
- Resume here only with the approved person IDs. This handoff is sourcing only; it never launches outreach.

## Step 3: Create the campaign

Two paths — ask which:

- **Reuse messaging that works** (default when they name an existing campaign): `manage_campaign` action=clone id=<existing campaign uuid> payload={name: "<new name>"}. Cloning carries the messaging structure, tone, and CTA configuration. Find the source campaign with `search` type="campaigns" if you only have its name.
- **Fresh**: `manage_campaign` action=create payload={name, ...} — then offer to set tone/cadence via action=update once created.

## Step 4: Assign the cohort

Collect the person ids from the Step 2 preview (including IDs returned by the named-account handoff; re-run the same `search` with a higher `limit` to get the full cohort if needed — paginate with `offset` for big cohorts) and call `manage_campaign` action=members id=<campaign uuid> payload={action: "assign", person_ids: [...]}.

For large cohorts, assign in bounded batches and report requested vs updated counts. If the response contains `requires_confirmation: true`, emit `state: "paused"` with code `research_confirmation_required`, stop, and show the preview to the seller. Never set `confirm: true` without their explicit confirmation. A source-campaign 403 is a visible failed item; a response that updates fewer people than requested is `state: "partial"` with code `research_partial`.

## Step 5: Review and launch — CONFIRMATION REQUIRED

Show the seller a launch summary before anything sends:
- Campaign name, source of messaging (cloned from X / fresh)
- Cohort size and criteria
- Channels and cadence (from the campaign config)

Then ask explicitly: "Launch outreach to these N people?" Only after a clear yes, call `manage_outreach` action=start id=[person uuids] (native bulk; payload optional {max_touches, allowed_channels, start_immediately}).

If the seller wants a dry run, stop after Step 4 — the campaign exists with members and nothing sends until plans start.

## Notes

- Junk-safe personalization: contacts with garbage first names (single letters, org names) automatically get the no-name greeting variant — you don't need to filter them out of the cohort for that reason.
- A person can be in many lists but holds ONE campaign assignment; assigning to a campaign moves them. Say so if the cohort overlaps an active campaign — surface counts before Step 4.
- Never call `manage_outreach` action=start without the Step 5 confirmation, and never auto-approve drafts; the outreach queue review (`/outreach-triage`) stays the quality gate.
