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
    company_id: string | null,        // canonical Vruum company UUID when already known
    company_domain: string | null,    // apex only, e.g. "acme.com"
    company_website: string | null,   // canonical http(s) company URL
    company_linkedin_url: string | null, // canonical /company/ or /school/ URL
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
- Company anchors are additive during sourcing/research: preserve every trustworthy `company_id`, `company_domain`, `company_website`, and `company_linkedin_url` through the handoff. A company name is useful research input but is **not** a strong identity anchor.
- A candidate may enter research without a strong company anchor because Phase B can recover one from the current LinkedIn work-experience record. It may **not** enter a save call without one; Step 7's company-binding invariant is absolute.
- **A company-only row (name/domain but no person) is not a valid candidate.** Sources holding companies must run the shared **Committee resolution** step in `SKILL.md` (companies → people, capped at `buyers_per_account`) before handing off to this engine. Do not improvise buyer selection out of company-research prose — that reintroduces marquee-name skew and an undocumented depth of 1 per account.
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
| `company_research_commit_unknown` | company research persistence response was lost | replay only the identical payload with the same idempotency key |
| `company_research_serialization_conflict` | bounded transaction retries were exhausted | replay only the identical payload with the same idempotency key |
| `idempotency_key_reused` | a save key was reused with different content | keep the original payload or generate a new key |
| `company_research_invalid_value` | a company anchor or research value is malformed | correct the named value before retrying |
| `company_research_source_invalid` | a shared field lacks admissible evidence | add/correct sources_by_field before retrying |
| `company_research_save_failed` | save failed outside the atomic receipt boundary | inspect the correlation ID before deciding whether to retry |
| `person_not_visible` | supplied person is outside the caller's tenant | use a tenant-visible person or omit `person_id` |
| `person_not_found_for_update` | save_person anchors matched no one in your pipeline (update-only) | search and pass `payload.person_id`, or use save_discovered's `person` block for a new prospect |
| `identity_unverifiable` | person has neither a LinkedIn URL nor an email | include `person.linkedin_url` or `person.email` |
| `discovery_daily_cap` | rolling 24h discovery-save cap reached | resume tomorrow; do not retry this session |
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
3. **Batch company fixed-field reuse check.** Collect unique company domains from surviving candidates, deriving the apex from `company_website` when necessary. Call `fetch(type="company_research", id=[the domains], filters={"requested_fields":["company_summary","company_stage","current_priorities","funding_data","growth_metrics"]})`.
   - Reuse only values whose field entry has `status="reusable"`.
   - `core_reuse.reusable` means the shared summary core is reusable; it never means the campaign brief is complete.
   - Missing, unsourced, stale, invalid, and absent fields remain null inputs. Never carry a raw stored value forward.
   - **Every company still runs Phase A** for campaign-relative outbound motion, ACV class, sales-cycle inference, and triggers. Reusable fixed values are inputs that avoid redundant fetching, not a Phase A skip signal.
4. **Operator confirmation gate (CSV / large lists only).** If the original candidate list was >200 (CSV) or >100 (manual list), confirm count to process before continuing.

**Latency:** ~2s for batch dedup + ~1s for batch company cache, regardless of list size. (Per-prospect iteration was ~12s for 60 prospects pre-batch primitives.)

---

## Step 4 — Phase A: company research

**Concurrency cap: 10 parallel.** Phase A subagents don't call `research` with action=linkedin_fetch — they hit `fetch` (type=company_research), `research` (action=enrich_company), `WebFetch`, `WebSearch`. No Unipile rate-limit pressure.

Dispatch one `vruum-company-deep-researcher` per unique company. Subagent file at `.claude/agents/vruum-company-deep-researcher.md` defines the workflow + tools. Include the reusable fixed-field values and their evidence in the prompt; the researcher must still compute campaign-relative outputs.

Dispatch prompt template (fill in placeholders):

```
You are vruum-company-deep-researcher. Research this company against campaign "{campaign_name}".

company_name: {name}
domain: {domain}
website: {company_website or null}
company_linkedin_url: {company_linkedin_url or null}
campaign_icp_summary: {one paragraph from the research_playbook fetch}
acv_floor: {dollars or default $10K}

Run your workflow (a–i) and return the structured output block.
```

Each subagent returns: `company_name`, `domain`, `company_summary`, `company_stage`, `funding_data`, `growth_metrics`, `current_priorities`, `sources_by_field` (`{field:[{url,title?,observed_at}]}`), `outbound_motion_score` (0/1/2), `acv_class` (smb/mid/ent), `sales_cycle_inference` (short/medium/long), `triggers[]`, `STATUS: ok | failed`, and the list of reused fixed fields. Subagents never persist; the orchestrator resolves `company_id` in Step 7 when the requested mode permits writes.

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

**Malformed LinkedIn fallback:** if the selected candidate already has a Vruum `person_id` and LinkedIn returns an invalid/malformed-profile result, preserve that `person_id` and retry the enrichment once through the first allowed structured provider in `source_policy` (Clay when selected/connected). Pass the same `person_id` in the PAYLOAD to `research(action="save_person", payload={person_id: ..., ...})` — update-only; never as the facade `id` argument. This is a provider fallback for one identity, not a new-person discovery. Never fall back on LinkedIn 429/rate-limit responses or timeouts; surface those for a later retry. If the fallback's email or LinkedIn URL belongs to another person, the backend returns `person_identity_conflict`; stop and surface it rather than dropping `person_id` and creating a duplicate.

Dispatch one `vruum-prospect-deep-researcher` per surviving candidate. Subagent file at `.claude/agents/vruum-prospect-deep-researcher.md`. The fan-out is strictly 1:1 with the surviving candidate list — depth per account is decided upstream by `buyers_per_account` in the committee-resolution step, never by Phase B adding or trimming people per company.

Dispatch prompt template:

```
You are vruum-prospect-deep-researcher. Research this prospect against campaign "{campaign_name}".

full_name: {name}
first_name: {first_name or null}
last_name: {last_name or null}
company: {company}
company_id: {company_id or null}
company_domain: {company_domain or null}
company_website: {company_website or null}
company_linkedin_url: {company_linkedin_url or null}
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

The Phase B result describes the prospect's **current** employer, not merely the company the source guessed. When LinkedIn shows a different current employer, replace the candidate's stale company fields with that current work-experience entry and its anchors before Step 7. If Phase B cannot produce either a `company_id` or `company_name` plus a valid anchor, return `STATUS: company_unresolved`; the orchestrator reports and skips that prospect instead of creating a company-less person.

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
- `harness_gate_status: company_unresolved` — Phase B could not verify a current employer with a canonical company anchor; skip pipeline persistence and enrollment
- `harness_gate_status: dismiss` — failed criterion 1 (acv) or 3 (junior, no senior swap available); skip backend call entirely

For non-dismiss outcomes, also set `dismiss_reason` to null and `flag` to the relevant reason (warming|low_priority|gate_inconclusive|company_unresolved|null).

**The gate is declarative prose — not a hardcoded function.** The orchestrator follows the rules above and tags each candidate. If a future criterion changes, edit this section.

---

## Step 7 — Save chain (eligible outcomes only; dismiss and company_unresolved skip)

**Company-binding invariant (load-bearing):** every prospect that reaches pipeline persistence must have a verified current employer expressed as either `company_id` or `company_name` plus at least one strong anchor (`company_domain`, `company_website`, `company_linkedin_url`). A company name alone never qualifies. If the invariant cannot be satisfied after Phase B, mark the item `company_unresolved`, do not call `save_company` with a name-only identity, `save_discovered`, or `manage_outreach` for it, and surface it in Step 8. `save_person` may still refresh an already-saved person without changing their company, but that refresh does not make the item eligible to save or enroll. This is stricter than the candidate admission rule on purpose: research may resolve missing identity, pipeline persistence may not guess it.

Apply the requested mode before any persistence:

- `research-only`: stop before Step 7a. Return the researched preview and do not call `save_company`, `save_person`, `save_discovered`, or `manage_outreach`.
- `save`: run Steps 7a–7c, but call `save_discovered` **without** `campaign_id`. This persists the tenant-visible prospect and gate result without assigning a campaign or starting outreach.
- `save-and-enroll`: run the full chain. Pass `campaign_id` to `save_discovered`, then include passing prospects in Step 7d.

Per surviving prospect:

### a. Resolve and save the company (once per unique current employer)
In `save` and `save-and-enroll` modes, reuse a trustworthy candidate `company_id` when one is already known. Otherwise call `research(action="save_company", payload={idempotency_key: <stable run/company save key>, name: <CURRENT COMPANY>, industry: <required Vruum canonical industry>, website: <canonical website or domain>, linkedin_url: <canonical LinkedIn company URL>, person_id: <the person's Vruum UUID, when researching an EXISTING person's employer>, company_summary, company_stage, funding_data, growth_metrics, current_priorities: <newline-joined descriptions>, sources_by_field})` once per unique current employer and capture the returned `company_id`. This call is required for identity resolution even when Phase A produced no new fixed research fields; canonical industry is still required, while unsourced research fields and their evidence stay omitted. Select `industry` from this exact list: Agriculture; Construction; Consumer Goods; Consumer Services; Education; Energy & Utilities; Financial Services; Government; Healthcare; Hospitality & Travel; Legal Services; Manufacturing; Marketing & Advertising; Media & Entertainment; Nonprofit; Professional Services; Real Estate; Retail & E-commerce; Software & Technology; Staffing & Recruiting; Telecommunications; Transportation & Logistics; Wholesale & Distribution; Other. Never send `Unspecified` or a provider-specific label. The API field is `name`, not `company_name`; it accepts `website`, not `domain`; and `current_priorities` is one string. Omit reusable fields that were not revalidated so the atomic patch preserves them. Explicit null deliberately clears a field, so do not send null merely because Phase A did not research it. `sources_by_field` keys must equal exactly the supplied non-null research fields. Preserve the identical idempotency key and payload for unknown-commit replay; every bulk item needs its own key. Reuse the returned `company_id` for every prospect at that employer.

**Person linkage check (VRU-767):** when the research is about a saved person's employer (triage/authoring-time refresh), ALWAYS pass their UUID as `payload.person_id` and read the response's `person_link`. `matched`/`linked`/`repointed` mean the person's future touches will see this research. `mismatch` means no pin was written because the evidence disagreed — the pin sits on a DIFFERENT company (anchored, or a stub whose name carries more identity than the researched one), or an unpinned person's known positions show no role at the researched company. People can hold multiple positions and researching a secondary employer never switches the primary pin. This research will NOT surface on their touches — verify which company they actually work for before authoring from it. `conflict` is a transient race (the pin changed mid-save): replay the identical payload with the same idempotency key once — `person_id` is exempt from the idempotency hash, so adding it to a replay of an earlier save is also the supported repair path. Never assume a bare `success` means the research reached the person.

### b. Identity prep (names + company linkage for the atomic save)

**VRU-722 atomic flow:** `research` action=save_person is UPDATE-ONLY (refreshing
research on someone already saved). New prospects are created by ONE
`manage_person` action=save_discovered call carrying a `person` block — person,
research, and pipeline membership land in a single transaction, so a crashed or
rejected save persists nothing. There is no create-then-adopt dance anymore.

1. **Split full_name** if `first_name`/`last_name` aren't already set:
   - Last-space heuristic: split on the last space. `Jane Smith` → first=`Jane`, last=`Smith`. `Jane van der Merwe` → first=`Jane`, last=`van der Merwe`.
   - **Override with Phase B canonical names** if the linkedin_fetch research call returned them. LinkedIn's `first_name`/`last_name` fields are authoritative; the heuristic is a fallback for candidates without `linkedin_url`.

2. **Prepare company linkage** — every save must identify the company unambiguously, ONE of:

   **Path A (preferred): `company_id`.** Run the save_company call (`research` action=save_company) first, capture the returned `company_id`.

   **Path B: `company_name` + at least one anchor** (`company_domain`, `company_website`, or `company_linkedin_url`). The data is in the LinkedIn payload you already fetched. The prospect's CURRENT employer is the entry in `work_experience[]` with `end_date: null` — that entry has `company_linkedin_url`. If you ran linkedin_fetch with `include_company: true`, the company response carries `website` and `industry`. **Anchor-less name-only saves are forbidden even if a stale backend would accept them.**

   For a **new** prospect, place the linkage inside `person`. For an **existing** `person_id`, send the same linkage at the top level of `save_discovered` (`company_id`, or `company_name` plus anchors). Never assume an existing person's prior membership is already bound.

3. **Refreshing someone ALREADY saved** (e.g. operator pasted a Vruum person UUID, or a triage-time research refresh): call `research(action="save_person", payload={person_id: <uuid>, ...fresh research fields})` — update-in-place, `researched_at` moves, and the response's `updated_fields`/`skipped_fields` tell you exactly what landed (contact fields are backfill-only; corrections go through `manage_person` action=update_contact). NEVER pass the UUID as the facade `id` argument — save_person takes no `id` and will 422. If save_person returns 404 `person_not_found_for_update`, the person isn't saved yet — use the step-c atomic save instead.

### c. Save discovered person — ONE atomic call (authoritative harness score)

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

Then call `manage_person(action="save_discovered", ...)` with ONE of two payload shapes (pass exactly one of `person` / `person_id`):

**NEW prospect (the normal Step 7 case):**
```
manage_person(
  action="save_discovered",
  payload={
    person={
      first_name=..., last_name=...,
      email=..., linkedin_url=...,
      # company linkage from step b (ONE of):
      company_id=<from save_company>   # OR company_name + an anchor
      # ...rest of research fields (headline, seniority_level,
      # topics_of_interest, recent_posts, role_start_date, ...)
    },
    assessment=<object above>,          # REQUIRED with person
    campaign_id=... or assessment_campaign_id=...  # a campaign ref is REQUIRED
  }
)
```

**Person already saved:** `payload={person_id: <uuid>, company_id: <resolved company UUID>, assessment: <object above>, ...}` — applies the score update-in-place and atomically binds/promotes the current employer. If no `company_id` was resolved, pass `company_name` plus at least one top-level anchor instead. Never send a bare `person_id` from this harness.

- `mode == save`: add `assessment_campaign_id: <campaign>` so the score is recorded against the campaign ICP, and omit `campaign_id` so no assignment or move occurs. New rows remain unassigned; duplicates keep their existing campaign assignment.
- `mode == save-and-enroll`: add `campaign_id: <campaign>`; the backend uses it for both assessment provenance and assignment. Omit `assessment_campaign_id` unless it is the same campaign.

This:
- Creates person + research + pipeline membership in ONE transaction (person shape) — a failed or rejected save persists nothing, so there is no orphan window
- Records the harness assessment as authoritative and skips the backend LLM scorer
- Dedupes on canonical anchors: if the person block's email/linkedin match someone already saved (any URL variant — www, trailing slash, encoding), the call continues as a duplicate update instead of creating
- Returns `person_id` (capture it for step d), `company_id`, `company_bound`, `match_score` (0–100), `quality_gate_pass` (bool, true iff `match_score >= 70`), and `warnings[]` naming any failed best-effort side effects. Require `company_bound == true` before adding the person to Step 7d's enrollment list; a false value is `company_binding_failed`, must be surfaced, and must never be described as a successful save-and-enroll outcome.

**Distinguish two failure modes (Codex Finding #9):**
- **Request failure (5xx, timeout, network):** retry once with 2s backoff. If still failing, leave the prospect in `discovery_failed` status and surface in the final report. **Don't** claim "saved as gate-fail" — the row was never written.
- **Request success + low score (`quality_gate_pass: false`):** the prospect IS saved with research; backend marks gate-fail; surface for operator review. This is a soft-fail. The prospect is on file with full research, useful for future campaigns.

### d. Bulk enrollment (only after all prospects saved)

Collect all `person_id`s where `harness_gate_status == pass` AND backend `quality_gate_pass == true` AND backend `company_bound == true` AND `mode == save-and-enroll`. Then call `manage_outreach(action="start", id=[those person_ids], payload={campaign_id: ...})` ONCE at the end of Step 7.

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
  phase A      : {company subagents fired} (0 skipped via cache; fixed fields reused: {count})
  phase B      : {prospect subagents fired} ({linkedin_unavailable} dismissed)

For runs that went through committee resolution (account_list, discovery Path B), also report:
  accounts unresolved : {N}  (list the companies + providers tried — from the committee-resolution hand-off)
and group the per-prospect outcomes by `raw_signals.source_company` so the operator reads results per account.

Harness pre-filter gate:
  pass         : {N}
  warming      : {N}
  low_priority : {N}
  gate_inconclusive : {N}
  dismiss      : {N}  (top reasons: acv_too_low={N}, decision_maker_junior={N})
  company_unresolved : {N}  (not saved — list the people and missing anchors)

Backend-enforced gate using the authoritative harness score (match_score >= 70):
  passed       : {N}
  failed       : {N}  (saved with research; operator can review via /enrich-prospect)
  request_failed : {N}  (retry candidates — surface in next run)
  company_binding_failed : {N}  (saved response was not company-bound; never enrolled)

Enrolled (harness gate + backend score gate + company binding pass, in auto-enroll mode): {N}
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
- **Categorical/numeric divergence** — a categorical `pass` can still score below 70 when evidence strength is weak. Enrollment requires all three confirmations: `harness_gate_status == pass`, backend `quality_gate_pass == true`, and backend `company_bound == true`; surface all three states.
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
