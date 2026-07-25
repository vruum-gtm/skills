# Pipeline Fill — Research Engine

This is the canonical research-engine doc referenced by `/pipeline-fill` (orchestrator) and all harness-mode source skills (`/sales-nav-deep-fill`, `/yc-pipeline-fill`, `/csv-pipeline-fill`, plus inline manual-list mode).

When a source skill produces a candidate list, it hands off to this engine via the canonical handoff prompt at the bottom of this doc. The engine then runs Steps 3–8: pre-flight → Phase A → Phase B → harness gate → save → report.

The orchestrator's SKILL.md owns the front-of-flow: campaign picker (Step 1), source picker (Step 2), and the inline manual-list parser. Everything from Step 3 onward is defined here. **Don't duplicate this doc in source skills** — link to it.

---

## Candidate List Shape (canonical, single source of truth — load-bearing)

All harness source skills produce candidate lists matching this shape exactly. The orchestrator consumes only this shape. Adding a field requires updating this section, then auditing each source skill.

```
[
  {
    full_name: string | null,        // "Jane Smith" — convenience; engine splits to first/last in Step 7
    first_name: string | null,       // optional if full_name set; one of these MUST be present
    last_name: string | null,         // optional if full_name set
    company: string | null,           // "Acme Co" — null OK if linkedin_url is set
    linkedin_url: string | null,      // canonical /in/ URL — null OK if name+company set
    email: string | null,             // null = pending lookup; engine doesn't gate on email presence
    person_id: string | null,         // pre-existing Vruum person UUID; null for new (resolved in Step 7)
    title: string | null,             // optional, fills via Phase B if missing
    raw_signals: object | null        // source-specific opaque blob (yc batch, csv row#, etc.)
  }
]
```

**Rules:**
- At minimum, each candidate needs **either** `linkedin_url` **or** (`name`-fields + `company`). Candidates with neither are skipped at Step 3.
- `full_name` is a convenience for sources that don't pre-split. Engine's Step 7 splits via last-space heuristic (`Jane van der Merwe` → first=`Jane`, last=`van der Merwe`). Multi-token surnames like `Maria Del Carmen Garcia` may split imperfectly — Phase B's linkedin_fetch call (`research` action=linkedin_fetch) returns canonical first/last when `linkedin_url` is present and overrides the heuristic.
- Field additions are additive only. Removing a field is a breaking change for source skills.
- `source_policy`, candidate examples, and progress events have executable schemas under `contracts/`. Validate handoffs against them before provider calls.

## Source-policy and recovery contract

The canonical source policy is `contracts/source-policy.schema.json`. Validate it before
inventorying providers. A selected source may not also be prohibited; exclusive mode
has no fallbacks; ordered fallbacks may not contain prohibited sources. An explicitly
selected disconnected source stops before the first external call.

Every wave emits an object matching `contracts/run-progress.schema.json`, including
`state`, `phase`, `wave`, `wave_count`, `completed`, `total`, `failed`,
`not_attempted`, `safe_retry_items`, `ambiguous_items`, and `code`. A server 5xx puts
the failing mutation in `ambiguous_items` because its commit status is unknown; only
later not-attempted items go in `safe_retry_items`. Completed items are never replayed.

Stable operator-visible codes:

| Code | Meaning | Recovery |
|---|---|---|
| `source_policy_invalid` | contradictory or out-of-range policy | correct the named fields before any provider call |
| `source_unavailable` | selected source is not connected | connect it or explicitly choose another source |
| `source_prohibited` | attempted source violates policy | remove the call; never override implicitly |
| `linkedin_identity_unresolvable` | profile is invalid/private/not found | use the next allowed structured fallback with the same `person_id` |
| `linkedin_temporarily_unavailable` | timeout/429 after bounded retries | retry only the returned item later; do not switch silently |
| `linkedin_auth_required` | LinkedIn account is disconnected/expired | reconnect LinkedIn |
| `company_identity_conflict` | exact evidence points to different companies | correct the evidence; never auto-merge |
| `company_resolution_failed` | company resolver returned no canonical row | retry once, then inspect resolver logs and evidence |
| `company_research_save_failed` | company research persistence failed with unknown commit status | inspect stored rows before any replay |
| `person_not_visible` | supplied person is outside the caller's tenant | use a tenant-visible person or omit `person_id` |
| `person_not_found` | tenant membership points to a missing person | refresh the candidate list |
| `person_identity_conflict` | fallback identifier belongs to another person | remove the conflicting identifier and review the provider result |
| `person_research_save_failed` | person research persistence failed with unknown commit status | inspect stored rows before any replay |
| `source_campaign_forbidden` | caller cannot remove people from their current campaign | ask the source-campaign owner to move them |
| `research_confirmation_required` | assignment requires explicit approval | pause and show the preview; never self-confirm |
| `research_partial` | some items failed or were not attempted | resume only `safe_retry_items` |

Backend response details link to `backend/app/domains/people/README.md#named-account-source-errors`.

---

## MCP-availability precheck (load-bearing — runs before Step 3)

Before any other Step 3 work, call `fetch(type="research_playbook", id=<campaign_id>)`. If this fails with "tool not found" / 404 / connection error, abort the run with this exact message:

> Vruum MCP not configured as a user-scoped server. Run:
>
> Register the Vruum MCP server in your assistant once: Claude Code → `~/.claude.json` `mcpServers.vruum = {"type":"http","url":"https://api.vruum.ai/mcp"}`; Codex CLI → `~/.codex/config.toml` `[mcp_servers.vruum]` with `url = "https://api.vruum.ai/mcp"`; other assistants → connect to `https://api.vruum.ai/mcp` (HTTP, OAuth via standard MCP flow).
>
> and retry. (The cloud `claude.ai Vruum` connector doesn't propagate to subagents — they need `vruum` configured at the user scope in `~/.claude.json`.)

This catches the common silent-failure mode: deep-research subagents dispatch, all return `STATUS: failed` because they can't reach MCP, and the operator gets a confusing "0 enrolled, no errors" report. One MCP call upfront vs an hour of debugging.

The research_playbook fetch also doubles as the ICP load — capture target_titles, target_industries, value_proposition, positioning_angle, ACV floor, signals_to_watch, exclusions for use in subagent dispatch prompts.

---

## Step 3 — Pre-flight

Per campaign's candidate list:

1. **MCP precheck + ICP load** (above) — abort run on failure.
2. **Batch dedup against existing pipeline.** Call `search(type="people", query=[{name, company, linkedin_url} for each candidate])`. Returns one match record per candidate (in input order). Drop candidates with non-null `match` — they're already in pipeline.
3. **Batch company-cache check.** Collect unique company domains from surviving candidates. Call `fetch(type="company_research", id=[the domains])`. Returns `[{domain, cached_research, age_days}]`.
   - Cache hit (`cached_research != null` AND `age_days <= 90`) → company skips Phase A; the cached research carries forward.
   - Cache miss or stale (`age_days > 90`) → company joins the Phase A research queue.
4. **Operator confirmation gate (CSV / large lists only).** If the original candidate list was >200 (CSV) or >100 (manual list), confirm count to process before continuing.

**Latency:** ~2s for batch dedup + ~1s for batch company cache, regardless of list size. (Per-prospect iteration was ~12s for 60 prospects pre-batch primitives.)

---

## Step 4 — Phase A: company research

**Concurrency cap: 10 parallel.** Phase A subagents don't call `research` with action=linkedin_fetch — they hit `fetch` (type=company_research), `research` (action=enrich_company), `WebFetch`, `WebSearch`. No Unipile rate-limit pressure.

Dispatch one `vruum-company-deep-researcher` per unique uncached company. Subagent file at `.claude/agents/vruum-company-deep-researcher.md` defines the workflow + tools.

Dispatch prompt template (fill in placeholders):

```
You are vruum-company-deep-researcher. Research this company against campaign "{campaign_name}".

company_name: {name}
domain: {domain}
campaign_icp_summary: {one paragraph from the research_playbook fetch}
acv_floor: {dollars or default $10K}

Run your workflow (a–i) and return the structured output block.
```

Each subagent returns: `company_name`, `domain`, `funding_data`, `growth_metrics`, `current_priorities`, `outbound_motion_score` (0/1/2), `acv_class` (smb/mid/ent), `sales_cycle_inference` (short/medium/long), `triggers[]`, `STATUS: ok | failed`, `CACHE_HIT`. Subagents never persist; the orchestrator resolves `company_id` in Step 7 when the requested mode permits writes.

**Wait for the wave to complete before Phase B.** Phase B inputs depend on Phase A's signals (or null if failed).

**Subagent timeout cascade (load-bearing):** when STATUS=failed for a company, the orchestrator does NOT skip the prospects from that company. Phase B still runs for them with `null` company signals. The harness tags them `harness_gate_status: gate_inconclusive`; the Step 7 rubric gives zero company/ACV and outbound points, so their authoritative score cannot exceed 50 and the backend-enforced gate cannot enroll them. Save them for operator review and surface them in the final report so the operator can re-run the failed companies later.

**Inter-wave progress line.** After each wave (5–10 subagents):
```
[PROGRESS] Phase A: {done}/{total} companies researched, {failed} failed, elapsed {M}m, eta {N}m
```
Helps operators distinguish "still working" from "stuck."

---

## Step 5 — Phase B: prospect research

**Concurrency cap: 5 parallel** (lowered from Phase A's 10 because Phase B subagents call `research` action=linkedin_fetch and the Unipile rate limiter throws over cap — see `backend/app/domains/channels/services/unipile/rate_limiter.py:36`. Lower concurrency keeps us under the per-account window.)

**Malformed LinkedIn fallback:** if the selected candidate already has a Vruum `person_id` and LinkedIn returns an invalid/malformed-profile result, preserve that `person_id` and retry the enrichment once through the first allowed structured provider in `source_policy` (Clay when selected/connected). Pass the same `person_id` to `research(action="save_person")`. This is a provider fallback for one identity, not a new-person discovery. Never fall back on LinkedIn 429/rate-limit responses or timeouts; surface those for a later retry. If the fallback's email or LinkedIn URL belongs to another person, the backend returns `person_identity_conflict`; stop and surface it rather than dropping `person_id` and creating a duplicate.

Dispatch one `vruum-prospect-deep-researcher` per surviving candidate. Subagent file at `.claude/agents/vruum-prospect-deep-researcher.md`.

Dispatch prompt template:

```
You are vruum-prospect-deep-researcher. Research this prospect against campaign "{campaign_name}".

full_name: {name}
first_name: {first_name or null}
last_name: {last_name or null}
company: {company}
linkedin_url: {url or null}
email: {email or null}

phase_a_signals:
  acv_class: {smb|mid|ent or null if Phase A failed}
  outbound_motion_score: {0|1|2 or null}
  triggers: [list or null]

campaign_icp_summary: {one paragraph from the research_playbook fetch}
acv_floor: {dollars}

Run your workflow (a–k) and return the structured output block. Note: do NOT call manage_person action=save_discovered or manage_outreach action=start — those are orchestrator-only and not in your tools list.
```

Each subagent returns: `first_name`, `last_name`, `email`, `linkedin_url`, `title`, `company_name`, `company_domain`, `company_website`, `company_linkedin_url`, `topics_of_interest`, `recent_posts`, `opening_hooks[]` (2–3, with source URLs), `decision_maker_level` (junior/mid/senior), `email_status` (found/pending), `role_start_date`, per-prospect `triggers[]`, `STATUS`. Every `recent_posts` item uses the backend shape `{text, posted_at?, share_url?, reaction_count?, comment_count?}`; never send the retired `content`, `url`, `excerpt`, or `date` keys. Note: `person_id` is NOT returned here — identity resolution happens in Step 7.

**Inter-wave progress line:**
```
[PROGRESS] Phase B: {done}/{total} prospects researched, {dismissed_for_linkedin_unavailable} skipped, elapsed {M}m, eta {N}m
```

---

## Step 6 — Harness pre-filter gate (orchestrator-side, pre-save)

This is the categorical first half of the harness-authoritative gate. It avoids wasted backend saves for obvious dismisses and feeds the deterministic numeric assessment in Step 7c. The backend does not re-score a supplied assessment; it records the harness score and mechanically enforces `match_score >= 70`. `MatchAnalysisAgent` is fallback-only for newly added people when callers omit assessment; duplicates retain their stored score unless a campaign move enqueues an asynchronous re-score.

Per surviving prospect, evaluate four criteria using the campaign's playbook ICP and the Phase A + Phase B signals:

### 1. ACV class meets campaign threshold?
- `acv_class >= acv_floor_class` → pass this criterion (smb=$5K, mid=$5–50K, ent=$50K+; campaign's `acv_floor` from playbook maps to a class)
- If no → dismiss `acv_too_low`. Don't call `manage_person` action=save_discovered.

### 2. Outbound motion or hiring signal?
- `outbound_motion_score > 0` OR explicit hiring trigger present → pass
- If no → flag `warming_candidate` (still call `manage_person` action=save_discovered — operator may want to warm-track them; the Step 7 rubric records the weaker fit honestly)

### 3. Decision-maker level senior?
- `decision_maker_level == senior` → pass
- If `mid` → pass with a note (campaign owner decides if mid is acceptable)
- If `junior` → look for a more-senior person at the same `company_id` in the Phase B output set. If found, swap and rerun. If not, dismiss `decision_maker_junior`.

### 4. Trigger event in last 90d?
- 1+ trigger from Phase A (`funding`, `exec_hire`, `launch`, `m_and_a`, `partnership`) OR Phase B (`new_role`, `topical_post`, `press_mention`, `promotion`) → pass
- If no → flag `low_priority` (still call `manage_person` action=save_discovered)

### Tag each prospect:
- `harness_gate_status: pass` — all four criteria passed
- `harness_gate_status: warming` — failed criterion 2 (no outbound motion)
- `harness_gate_status: low_priority` — failed criterion 4 (no recent trigger)
- `harness_gate_status: gate_inconclusive` — Phase A failed for this prospect's company (degraded mode)
- `harness_gate_status: dismiss` — failed criterion 1 (acv) or 3 (junior, no senior swap available); skip backend call entirely

For non-dismiss outcomes, also set `dismiss_reason` to null and `flag` to the relevant reason (warming|low_priority|gate_inconclusive|null).

**The gate is declarative prose — not a hardcoded function.** The orchestrator follows the rules above and tags each candidate. If a future criterion changes, edit this section.

---

## Step 7 — Save chain (everyone except harness-gate dismisses)

Apply the requested mode before any persistence:

- `research-only`: stop before Step 7a. Return the researched preview and do not call `save_company`, `save_person`, `save_discovered`, or `manage_outreach`.
- `save`: run Steps 7a–7c, but call `save_discovered` **without** `campaign_id`. This persists the tenant-visible prospect and gate result without assigning a campaign or starting outreach.
- `save-and-enroll`: run the full chain. Pass `campaign_id` to `save_discovered`, then include passing prospects in Step 7d.

Per surviving prospect:

### a. Save company research (once per company)
If the prospect's company isn't already cached and Phase A produced fresh research, call `research(action="save_company", payload={name: <Phase A COMPANY>, website: <Phase A DOMAIN or canonical URL>, funding_data, growth_metrics, current_priorities: <newline-joined descriptions + source URLs>})`. The API field is `name`, not `company_name`; it accepts `website`, not `domain`; and `current_priorities` is one string, so serialize the Phase A object list instead of passing the list through. Skip if `CACHE_HIT: true` for that company.

### b. Identity resolution + person research (load-bearing — corrects Codex Finding #6)

`research` action=save_person requires `first_name` + `last_name` in the payload, NOT `name`. `manage_person` action=save_discovered requires `person_id` from a prior save step. So Step 7 is a 2-step backend dance:

1. **Split full_name** if `first_name`/`last_name` aren't already set:
   - Last-space heuristic: split on the last space. `Jane Smith` → first=`Jane`, last=`Smith`. `Jane van der Merwe` → first=`Jane`, last=`van der Merwe`.
   - **Override with Phase B canonical names** if the linkedin_fetch research call returned them. LinkedIn's `first_name`/`last_name` fields are authoritative; the heuristic is a fallback for candidates without `linkedin_url`.

2. **Call `research` with action=save_person.** The backend now requires you to identify the company unambiguously — pick ONE of these two paths:

   **Path A (preferred): pass `company_id`.** Run the save_company call (`research` action=save_company) first, capture the returned `company_id`, then pass it in the payload here.

   **Path B (when Path A isn't done yet): pass `company_name` + at least one anchor.** Required anchors are any of `company_domain`, `company_website`, or `company_linkedin_url`. The data is in the LinkedIn payload you already fetched. The prospect's CURRENT employer is the entry in `work_experience[]` with `end_date: null` — that entry has `company_linkedin_url` (e.g. `https://linkedin.com/company/microsoft`). If you ran linkedin_fetch with `include_company: true` in the payload, the separate company response carries `website` and `industry`. Domain can be derived from website (e.g. `microsoft.com` from `https://microsoft.com`) or from the prospect's verified work email.

   **Anchor-less name-only saves are rejected with HTTP 422.** This was hardened to stop orphan stub creation in the companies table — name-only saves were silently producing duplicate rows for common names like Microsoft.

   Example call:
   ```
   research(
     action="save_person",
     payload={
       first_name=..., last_name=...,
       email=..., linkedin_url=...,
       # ONE of:
       company_id=<from the save_company call>
       # OR:
       company_name=..., company_linkedin_url=...,  # at least one anchor
       # ...rest of research fields
     }
   )
   ```

   - If the prospect already had `person_id` set on the candidate (e.g. operator pasted a Vruum person UUID), pass it explicitly in the payload: `research(action="save_person", payload={person_id: ..., ...})` — backend updates rather than creating a new record.
   - The response includes the `person_id`. Capture it for step c.

### c. Save discovered person (authoritative harness score, backend-enforced gate)

Build the authoritative `assessment` from the campaign playbook plus Phase A/B evidence. Score mechanically so reruns agree:

- Company/ACV fit: 30 points when the known ACV class meets the campaign floor; a known miss is a harness dismiss and never reaches Step 7.
- Buying authority: 25 senior, 15 mid; a junior with no senior replacement is dismissed.
- Outbound/hiring motion: 20 when present, otherwise 0 and tag `warming`.
- Recent timing trigger: 15 when present, otherwise 0 and tag `low_priority`.
- Evidence strength: 10 for a verified profile plus at least two cited sources, 5 for partial cited evidence, 0 for unverified evidence.
- `gate_inconclusive` gets 0 for unknown company/ACV and outbound criteria, so it cannot exceed 50 without fresh company evidence.

The score is the sum (0–100); 70+ passes. Send this exact shape:

```json
{
  "match_score": 85,
  "match_summary": "Two or three evidence-backed sentences against this campaign's ICP.",
  "alignment_points": [
    {
      "point": "Specific alignment",
      "evidence": "Cited fact and URL",
      "confidence": 0.8,
      "source_type": "harness_research"
    }
  ],
  "concerns": [
    {
      "concern": "Specific gap",
      "evidence": "Cited or explicitly missing evidence",
      "severity": "blocker|warning|minor"
    }
  ],
  "why_now": "Timing rationale with source",
  "recommended_approach": "Campaign-relevant approach",
  "overall_confidence": 0.8,
  "scored_by": "harness:pipeline-fill"
}
```

`match_summary` must be non-empty. Alignment items require `point` and `evidence`; concern items require `concern` and `evidence`. Confidence values are 0–1 and concern severity is exactly `blocker`, `warning`, or `minor`.

Then call `manage_person(action="save_discovered", payload={person_id: <from b>, assessment: <object above>, ...})`:

- `mode == save`: add `assessment_campaign_id: <campaign>` so the score is recorded against the campaign ICP, and omit `campaign_id` so no assignment or move occurs. New rows remain unassigned; duplicates keep their existing campaign assignment.
- `mode == save-and-enroll`: add `campaign_id: <campaign>`; the backend uses it for both assessment provenance and assignment. Omit `assessment_campaign_id` unless it is the same campaign.

This:
- Records the harness assessment as authoritative and skips the backend LLM scorer
- Returns `match_score` (0–100) and `quality_gate_pass` (bool, true iff `match_score >= 70`)
- Writes the tenant's `company_people` row; campaign assignment happens only when the payload includes `campaign_id`

**Distinguish two failure modes (Codex Finding #9):**
- **Request failure (5xx, timeout, network):** retry once with 2s backoff. If still failing, leave the prospect in `discovery_failed` status and surface in the final report. **Don't** claim "saved as gate-fail" — the row was never written.
- **Request success + low score (`quality_gate_pass: false`):** the prospect IS saved with research; backend marks gate-fail; surface for operator review. This is a soft-fail. The prospect is on file with full research, useful for future campaigns.

### d. Bulk enrollment (only after all prospects saved)

Collect all `person_id`s where `harness_gate_status == pass` AND backend `quality_gate_pass == true` AND `mode == save-and-enroll`. Then call `manage_outreach(action="start", id=[those person_ids], payload={campaign_id: ...})` ONCE at the end of Step 7.

- Per-prospect outcomes are returned (enrolled | skipped | failed). Surface per-prospect failures in the report.
- If `harness_gate_status` is `warming` or `low_priority`, exclude from the bulk enroll list. Operator decides on review.
- If `mode != save-and-enroll`, skip enrollment entirely; operator handles via `/outreach-triage` later.

---

## Step 8 — Aggregate report (chat + audit log)

Print to chat AND write to `.context/runs/pipeline-fill-{ISO-timestamp}.md` (workspace-local; `.context/` is gitignored per CLAUDE.md). Format identical for both surfaces.

```
Pipeline fill complete: {campaign_name} (source: {source}, mode: {harness|platform})

Candidates flow:
  source       : {N from source skill output}
  pre-flight   : {after dedup, after company-cache hit}
  phase A      : {company subagents fired} ({cached_skip} skipped via cache)
  phase B      : {prospect subagents fired} ({linkedin_unavailable} dismissed)

Harness pre-filter gate:
  pass         : {N}
  warming      : {N}
  low_priority : {N}
  gate_inconclusive : {N}
  dismiss      : {N}  (top reasons: acv_too_low={N}, decision_maker_junior={N})

Backend-enforced gate using the authoritative harness score (match_score >= 70):
  passed       : {N}
  failed       : {N}  (saved with research; operator can review via /enrich-prospect)
  request_failed : {N}  (retry candidates — surface in next run)

Enrolled (both gates pass + auto-enroll mode): {N}
Saved but not enrolled: {N}

Triggers detected (top 5):
  - "raised $5M Series A" — {N} prospects
  - "hired Head of Sales" — {N} prospects
  ...

Pool status: healthy | drying up | exhausted ⚠️

Audit log written: .context/runs/pipeline-fill-{timestamp}.md
```

For multi-campaign runs, group the report by campaign and include a totals summary at the bottom.

---

## Edge cases + failure handling reference

- **Source returns empty after dedup** — orchestrator says "All {N} candidates already in pipeline, nothing to research" and exits cleanly.
- **Mid-flight cancellation** (operator Ctrl+C before Step 7) — no new Phase A/B research has been persisted. Re-running `/pipeline-fill` reuses pre-existing fresh cache entries but repeats unfinished research waves. Note this honestly in the cancellation message.
- **Subagent timeout cascade** — Phase A failed for a company → Phase B runs degraded → harness marks `gate_inconclusive` → Step 7 score is capped below the backend threshold. See Step 4.
- **Categorical/numeric divergence** — a categorical `pass` can still score below 70 when evidence strength is weak. Enrollment requires both `harness_gate_status == pass` and backend `quality_gate_pass == true`; surface both states.
- **Cached company research >90 days old** — Phase A re-runs the company subagent. Don't trust stale signals for an active fill.
- **Manual-list cap** — if >100 lines pasted, orchestrator asks "{N} prospects pasted — process all, or first M? (a/N)".
- **CSV >200 rows** — same prompt at Step 5 of csv-pipeline-fill.
- **LinkedIn rate-limit (Unipile 429)** — Phase B subagent dismisses with `linkedin_data_unavailable`; orchestrator surfaces in report; operator reruns later.
- **Unicode multi-token surnames** — `Maria Del Carmen Garcia`: heuristic splits to first=`Maria Del Carmen`, last=`Garcia` (last space wins). When `linkedin_url` is present, the linkedin_fetch research call overrides with canonical names. Imperfect for candidates without LinkedIn URL — operator can edit via `manage_person` action=update_contact post-import.

---

## Canonical Handoff Prompt (for source skills)

When a HARNESS source skill completes its sourcing flow and has a candidate list ready, it ends with **this exact confirmation gate** (do not paraphrase — predictable behavior matters):

```
Candidate list ready: {N} prospects from {source}.

NEXT: invoke /pipeline-fill Step 3 onward (deep research → harness gate → save) with this list and campaign {campaign_id}.

Continue automatically? (y/n)
```

- Operator answers `y` → orchestrator continues into Step 3 (this engine's flow).
- Operator answers `n` → source skill exits cleanly with the candidate list printed in chat for inspection. The list can be passed back later by re-running `/pipeline-fill` with the list pasted.
- Operator answers anything else → repeat the prompt; treat ambiguous responses as "ask again," not as silent default.

This pattern eliminates the implicit "now follow Step 3" hand-off that would otherwise depend on attention drift. Source skills that don't end with this exact prompt are the source of "the skill stopped halfway" bug reports.
