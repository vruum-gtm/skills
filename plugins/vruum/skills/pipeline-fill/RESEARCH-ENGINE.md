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

Each subagent returns: `company_id`, `funding_data`, `growth_metrics`, `current_priorities`, `outbound_motion_score` (0/1/2), `acv_class` (smb/mid/ent), `sales_cycle_inference` (short/medium/long), `triggers[]`, `STATUS: ok | failed`, `CACHE_HIT`.

**Wait for the wave to complete before Phase B.** Phase B inputs depend on Phase A's signals (or null if failed).

**Subagent timeout cascade (load-bearing):** when STATUS=failed for a company, the orchestrator does NOT skip the prospects from that company. Phase B still runs for them with `null` company signals. The harness pre-filter gate then tags them `harness_gate_status: gate_inconclusive` (a fourth status alongside pass/warming/low_priority/dismiss). `manage_person` action=save_discovered is still called — the backend's `MatchAnalysisAgent` may have cached company research from earlier runs and gates them appropriately. Surface gate-inconclusive prospects in the final report so the operator can re-run the failed companies later.

**Inter-wave progress line.** After each wave (5–10 subagents):
```
[PROGRESS] Phase A: {done}/{total} companies researched, {failed} failed, elapsed {M}m, eta {N}m
```
Helps operators distinguish "still working" from "stuck."

---

## Step 5 — Phase B: prospect research

**Concurrency cap: 5 parallel** (lowered from Phase A's 10 because Phase B subagents call `research` action=linkedin_fetch and the Unipile rate limiter throws over cap — see `backend/app/domains/channels/services/unipile/rate_limiter.py:36`. Lower concurrency keeps us under the per-account window.)

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

Each subagent returns: `topics_of_interest`, `recent_posts`, `opening_hooks[]` (2–3, with source URLs), `decision_maker_level` (junior/mid/senior), `email_status` (found/pending), `role_start_date`, per-prospect `triggers[]`, `STATUS`. Note: `person_id` is NOT returned here — identity resolution happens in Step 7.

**Inter-wave progress line:**
```
[PROGRESS] Phase B: {done}/{total} prospects researched, {dismissed_for_linkedin_unavailable} skipped, elapsed {M}m, eta {N}m
```

---

## Step 6 — Harness pre-filter gate (orchestrator-side, pre-save)

This is a **coarse pre-filter** — its job is to avoid wasted backend save calls (`manage_person` action=save_discovered) on obvious dismisses. The **authoritative** gate is server-side `MatchAnalysisAgent.match_score >= 70` and runs inside that save call. The harness gate cannot override the backend gate; it can only dismiss before reaching it.

Per surviving prospect, evaluate four criteria using the campaign's playbook ICP and the Phase A + Phase B signals:

### 1. ACV class meets campaign threshold?
- `acv_class >= acv_floor_class` → pass this criterion (smb=$5K, mid=$5–50K, ent=$50K+; campaign's `acv_floor` from playbook maps to a class)
- If no → dismiss `acv_too_low`. Don't call `manage_person` action=save_discovered.

### 2. Outbound motion or hiring signal?
- `outbound_motion_score > 0` OR explicit hiring trigger present → pass
- If no → flag `warming_candidate` (still call `manage_person` action=save_discovered — operator may want to warm-track them; backend match analysis tells us if the campaign fit is real)

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

Per surviving prospect:

### a. Save company research (once per company)
If the prospect's company isn't already cached and Phase A produced fresh research, call `research(action="save_company", payload={company_name, domain, funding_data, growth_metrics, current_priorities})`. Skip if `CACHE_HIT: true` for that company.

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

### c. Save discovered person (the backend authoritative gate runs here)

Call `manage_person(action="save_discovered", payload={person_id: <from b>, campaign_id: ...})`. This:
- Runs server-side `analyze_person_match` + signal eval
- Returns `match_score` (0–100) and `quality_gate_pass` (bool, true iff `match_score >= 70`)
- Writes the `company_people` row that puts the prospect into the campaign

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

Backend authoritative gate (match_score >= 70):
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
- **Mid-flight cancellation** (operator Ctrl+C between Phase A and Phase B) — Phase A research is saved server-side. Re-running `/pipeline-fill` for the same campaign + source picks up via batch dedup; no re-research of cached companies. Note this in the cancellation message.
- **Subagent timeout cascade** — Phase A failed for a company → Phase B runs degraded → harness gate marks `gate_inconclusive` → backend decides via cached company research. See Step 4.
- **Two-gate disagreement** — harness pass + backend fail (or vice versa) → see Step 7c. Stricter outcome wins for enrollment; both states surfaced in the report.
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
