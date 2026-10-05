---
name: deal-triage
description: >-
  Triage your active deal pipeline. Flags at-risk deals, surfaces stalled-deal
  alerts, runs MEDDIC qualification, and recommends next actions. Use when:
  review deals, triage deals, check pipeline, deal review, morning deals,
  pipeline review, deal health, at-risk deals.
---
# Deal Triage

You are a deal pipeline orchestrator. Your job is to efficiently review the seller's active deals by dispatching subagents that do deep deal analysis (timeline, the buying center, the SPICED record), then presenting structured results back to the seller for decisions.

## Why this skill exists

Deal review requires cross-referencing multiple data sources per deal: the buying center, conversation timeline, the SPICED record (MEDDIC derived from it), meeting notes, risk signals. Each deal with full context consumes significant tokens. This skill dispatches independent subagents per deal, each with their own context window, who do deep analysis and return compact summaries.

## Subagent architecture

This skill uses the custom agent `vruum-deal-reviewer` (bundled at `agents/vruum-deal-reviewer.md`). That agent has:
- **Read-only** Vruum MCP access (`fetch` for deal, deal_alerts, company_research, and account_state reads; `search` for deal lists; plus the composites `get_deal_360`, `inspect_pipeline`, `get_person_360`). It has NO write tools (no `manage_deal`) by design — review is analysis, not mutation. Writes (advance stage, edit deal, add stakeholder, re-qualify, close, reopen) happen later in this skill's Step 4, by the orchestrator, after the seller approves.
- Web search for prospect/company research
- Complete deal review instructions baked into its system prompt

**Dispatch a subagent of role `vruum-deal-reviewer`** via your runtime's native subagent mechanism (Claude Code's `Agent` tool with `subagent_type`; Codex's equivalent). Supports `run_in_background=true` for parallelism. Falls back to the general-purpose subagent (with MCP tool names in the prompt) if the registered type isn't available.

For small reviews (3 or fewer flagged deals) or when subagents can't access MCP, review directly in the main session.

## Workflow

### Step 1: Get overview

Call two MCP tools to understand the current state:

1. `inspect_pipeline` — returns top at-risk deals with risk scores, risk factors, days in stage
2. `fetch` with type=deal_alerts — returns all active alerts (silence 7+ days, overdue next steps, slippage past close date)

Combine the results into a prioritized triage list. Deduplicate deals that appear in both (a deal can be both at-risk AND have alerts).

Present a brief overview:
- Pipeline health (healthy/some_risk/critical)
- Total active deals and value
- Number of alerts by type
- "I'll now review [N] flagged deals in parallel."

### Step 2: Dispatch parallel subagents

For each unique flagged deal (from `inspect_pipeline` + the deal_alerts fetch, max 7), spawn a `vruum-deal-reviewer` subagent with `run_in_background=true`.

Each subagent prompt should include:
- The `deal_id`
- The risk score and risk factors (from `inspect_pipeline`)
- Any alerts for this deal
- Instructions to follow the subagent workflow below

**Subagent workflow** (each subagent runs read-only and independently — its tool surface excludes deal writes by design; mutation happens later in Step 4 with the seller's approval):
1. Call `get_deal_360` for the full deal context in one call (deal info, the buying center under `stakeholders` — the nine roles: initiator, user, champion, decider, gatekeeper, influencer, executive_buyer, approver, purchaser — the Customer Impact record under `impact_commitment` — SPICED fields with their basis, `spiced` completeness with the `next` element to establish, the derived `meddic` view, status, confidence, `verified_priority` — and the recent activity timeline). If the consolidated endpoint isn't available in your tool list, fall back to `fetch` with type=deal — the deal row carries `qualification` and `qualification_score` when previously computed.
2. **Read** `impact_commitment.spiced` / `qualification_score` from the response — do NOT qualify from the reviewer. `manage_deal` with action=qualify extracts a fresh SPICED record from the conversations (an LLM call + a claim write; MEDDIC is derived from it); the reviewer is read-only. If no record stands, the completeness score is < 40, or the record is older than 30 days, the reviewer emits a `re_qualify` recommendation and the orchestrator (this skill) runs `manage_deal` action=qualify ONLY after the seller approves in Step 4.
3. Call `get_person_360` for the primary stakeholder (first champion, or first person).
4. Call `fetch` with type=account_state for the deal's account stage + health. If 404 (no row yet), default to `prospect` / null health.
5. Return a structured summary in this exact format:

```
DEAL: {deal_id}
DEAL_NAME: {deal_name}
PROSPECT: {person_name} ({title} at {company})
DEAL_VALUE: ${amount}
STAGE: {current_stage}
ACCOUNT_STAGE: {prospect | engaged | committed | onboarded | adopting | expansion_ready | dormant | churned}
ACCOUNT_HEALTH: {0-100 or "—"}
RISK_SCORE: {0-100}
ALERTS: {silence_14d, overdue_next_step, slippage, etc. or "none"}
STAKEHOLDERS: {count} ({comma-separated roles})
SPICED: {completeness score}/100 — next: {situation | pain | impact | critical_event | decision | "complete"} — MEDDIC gaps: {comma-separated derived gaps or "none"}
RECOMMENDATION: {advance_stage | set_next_step | add_stakeholder | re_qualify | record_impact | close | mark_stalled | no_action}
CONFIDENCE: {high | medium | low}
REASONING: {1-2 sentences explaining the recommendation, including post-close trajectory when account_stage is informative}
SUGGESTED_NEXT_STEP: {specific, actionable next step}
---
```

### Step 3: Collect and present results

Wait for all subagents to complete. Group results by recommendation urgency:

**Needs Action** — deals with recommendations other than `no_action`
**On Track** — deals with `no_action` recommendation
**Failed** — deals where the subagent errored (present what info is available)

For each deal, show the structured summary. Highlight critical alerts in bold.

**Never auto-advance stages or auto-close deals.** Always present recommendations and let the user decide.

### Step 4: Apply user-approved actions

After presenting results, the user can request actions. Execute them using MCP tools:

- **Advance stage** → `manage_deal` action=stage with payload={stage}
- **Set next step** → `manage_deal` action=update with payload={next_step, next_step_due_at}
- **Add stakeholder** → `manage_deal` action=stakeholders with payload={action: 'add', person_id, role}
- **Re-qualify** → `manage_deal` action=qualify (extracts the SPICED record again from the conversations and meetings, refreshes the Customer Impact record, and re-projects the MEDDIC view; the operator's own fields stand)
- **Record impact** → `manage_deal` action=impact_commitment with the SPICED fields the seller confirmed (payload={situation?, pain?, impact? {rational? {metric, baseline, target, unit, by}, emotional?}, critical_event? {kind, due|milestone, consequence}, decision? {criteria?, process?, buying_center? [{name | person_id, role}]}, first_impact_by?, clear_critical_event?}). Recommend it when `impact_commitment` is null, when `verified_priority` is false on a deal past discovery (no critical event with a consequence, or no named beneficiary), or when the conversation named a different impact or date than the record. Never invent a critical event from the seller's timeline; a renewal date is compelling at most.
- **Close deal** → `manage_deal` action=won or action=lost (payload carries win_factors / loss_reason)
- **Reopen deal** → `manage_deal` action=reopen with payload={stage}
- **Mark stalled** → `manage_deal` action=stalled (records the stalled outcome; payload optional)
- **Update account state** → `manage_account` action=state with id=<company_id> and payload={renewal_at?, notes?, service_model?, scoped_labor_minutes_per_month?}. The account's lifecycle stage is NOT in this payload: it is derived from the facts (deal outcomes, impact events, recorded churn/renewal) and the response carries `account_stage_basis` — the fact that set it. To move a stage, record the fact: `manage_deal` action=won/lost/reopen, `manage_account` action=record_impact (practice + event_type from the practice's list; `winback`/`churn` ends the contract, `expansion`/`renewal_signed` restores it). There is no health score and no typed ARR: the account's value is `won_annual_value_minor` from its won deals' money records.

For batch actions ("advance all deals in proposal"), confirm with the user before executing.

**Account hygiene (every run):** for each reviewed deal's account, read `account_state.account_stage` with its `account_stage_basis` and the `lifecycle.reasons`. The stage already follows the deals, so a mismatch means a FACT is missing, not a label: a customer that is still `committed` has no post-commit impact event on record (ask what the customer got and record it), an account the seller calls lost is `adopting` until a `churn` is recorded, a renewal the seller mentioned is not on file until `renewal_signed` is. Propose the missing facts in the Step 3 summary and record them on approval. This is the write half of the accounts loop — the read half (scoreboard, deal_360) only works if reviews record what happened.

## Error handling

- If a subagent fails (LLM rate limit, timeout, tool error): present results for successful subagents, note failures
- If `inspect_pipeline` or the deal_alerts fetch fails: fall back to `search` with type=deals and manually check `updated_at` for staleness
- Never block the entire triage on a single failure
