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

- Build `source_policy` using `pipeline-fill/contracts/source-policy.schema.json` from the installed skills bundle.
- Preserve every explicit provider instruction. Example: "use Clay, no Sales Nav or CSV" becomes `selected_source: "clay"`, `source_mode: "preferred"`, `prohibited_sources: ["sales_nav", "linkedin", "csv"]`, and an ordered `allowed_fallbacks` list.
- CSV and Sales Nav remain fully supported sources when the seller explicitly selects them. Source prohibitions are scoped to this run only; never turn one seller's preference into a global capability restriction or silently substitute a prohibited source.
- Use the schema defaults unless the seller overrides them: company waves 10, person waves 5, and two retries for transient failures. `source_mode: "exclusive"` requires `allowed_fallbacks: []`.
- Pass the named organizations and campaign criteria as the discovery ICP brief.
- Set pipeline-fill `mode: "save"` explicitly. This persists approved people so their IDs can return here, but cannot enroll them or start outreach.
- Let `/pipeline-fill` source companies first, resolve up to five matching people per company in bounded waves, preview the people, and return their IDs.
- Resume here only with the approved person IDs. This handoff is sourcing only; it never launches outreach.

## Step 3: Create the campaign

Two paths — ask which:

- **Reuse messaging that works** (default when they name an existing campaign): `manage_campaign` action=clone id=<existing campaign uuid> payload={name: "<new name>"}. Cloning carries the messaging structure, tone, and CTA configuration. Find the source campaign with `search` type="campaigns" if you only have its name.
- **Fresh**: `manage_campaign` action=create payload={name, ...} — then offer to set tone/cadence via action=update once created.

### Exact wording: touch templates (optional)

If the seller wants the SAME proven email/message every time (instead of per-person AI drafting), set a **template** on the touch: `manage_campaign` action=update id=<campaign uuid> with the full `touch_sequence` where that step gains `{"template": {"subject": "...", "body": "..."}}`. Rules:

- Variables: `{{first_name}}`, `{{last_name}}`, `{{company}}`, `{{title}}` — nothing else. Substitution is deterministic; no AI touches the wording. The signature is plain text inside the body.
- Templates only render for content channels (email, linkedin_message, linkedin_inmail). Email and InMail templates REQUIRE a subject. Don't put templates on connection-request or phone steps.
- Templated touches mint as ready `draft` rows (generated_by_ai=false) straight into review; a person whose variables can't resolve stays `needs_draft` with `template_fallback_reason` — authored normally at triage.
- Adding a template never rewrites already-queued touches. To render it over EXISTING unauthored rows, call `manage_campaign` action=apply_template id=<campaign uuid> payload={step: N} and report rendered/skipped counts honestly.

## Step 4: Assign the cohort

Collect the person ids from the Step 2 preview (including IDs returned by the named-account handoff; re-run the same `search` with a higher `limit` to get the full cohort if needed — paginate with `offset` for big cohorts) and call `manage_campaign` action=members id=<campaign uuid> payload={action: "assign", person_ids: [...]}.

For large cohorts, assign in bounded batches and report requested vs updated counts. If the response contains `requires_confirmation: true`, emit `state: "paused"` with code `research_confirmation_required`, stop, and show the preview to the seller. Never set `confirm: true` without their explicit confirmation. A source-campaign 403 is a visible failed item; a response that updates fewer people than requested is `state: "partial"` with code `research_partial`.

## Step 5: Review and launch — CONFIRMATION REQUIRED

Show the seller a launch summary before anything sends:
- Campaign name, source of messaging (cloned from X / fresh)
- Cohort size and criteria
- Channels, cadence, and maximum touches (from the campaign config). Enrollment schedules the first action immediately; spacing between later touches must already be represented in the campaign cadence.

Then ask explicitly: "Launch outreach to these N people?" Only after a clear yes, call `manage_outreach` action=start id=[person uuids] (native bulk; payload optional `{max_touches, allowed_channels}`). Do not pass `start_immediately`; the MCP intentionally ignores it.

If the seller wants a dry run, stop after Step 4 — the campaign exists with members and nothing sends until plans start.

### Existing Gmail scheduling

If Gmail already contains scheduled or sent campaign emails, reconcile them before approving, drafting, or starting replacement email touches:

1. Call `fetch` with `type=settings subtype=channel_status`. Select the intended sender mailbox from `channels.email.accounts[]` and use its public `id` as `account_id`; never invent or ask the seller for an internal provider id.
2. Call `manage_messages` action=`reconcile_external_email`, id=<campaign uuid>, payload=`{account_id, action: "preview", after?, before?}`.
3. Show exact matched, ambiguous, and unmatched counts. A preview is read-only.
4. When the seller asked to synchronize—or explicitly approves the preview—apply that exact snapshot with payload=`{account_id, action: "apply", preview_id}`. Applying creates/finalizes Vruum reservations; it never sends or resends email.
5. Pull payload=`{account_id, action: "exceptions"}` for the exception-first rescue queue. Never guess a recipient or silently release a reservation.

Provider-scheduled rows are protected from duplicate dispatch and excluded from actionable review. Surface `externally_scheduled_count` when verifying the campaign.

### Repairing already-created plans

If the seller changes maximum touches or allowed channels after plans exist, update the cohort through `manage_outreach` action=`update`, id=[plan uuids], payload=`{max_touches?, allowed_channels?}`. This preserves each plan's active/paused state. Report per-plan success, error, and not-attempted counts; never patch outreach-plan rows directly in the database.

## Notes

- Junk-safe personalization: contacts with garbage first names (single letters, org names) automatically get the no-name greeting variant — you don't need to filter them out of the cohort for that reason.
- A person can be in many lists but holds ONE campaign assignment; assigning to a campaign moves them. Say so if the cohort overlaps an active campaign — surface counts before Step 4.
- Never call `manage_outreach` action=start without the Step 5 confirmation, and never auto-approve drafts; the outreach queue review (`/outreach-triage`) stays the quality gate.
