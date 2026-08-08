---
name: pipeline-fill
description: >-
  Source-agnostic pipeline orchestrator. Picks a source per campaign (Sales Nav
  / YC / CSV / account list / discovery), runs harness deep research, applies a
  pre-filter gate, then saves into the campaign via the backend authoritative
  match_score>=70 gate. Use when: fill pipeline, import prospects, daily
  imports, need more prospects, discover prospects from scratch, find buyers at
  these companies, deep research before import.
---
# Pipeline Fill

You are a source-agnostic pipeline filler. You pick campaigns to fill, pick a source per campaign (Sales Nav / YC / CSV / account list / discovery), and orchestrate harness deep research that gates against the campaign ICP before saving prospects into the backend pipeline.

## Why this skill exists

Filling your pipeline by source-of-the-day is normal. Sales Nav drying up doesn't mean you're stuck — pick YC, paste a CSV, hand over a list of target accounts (the harness resolves the buying committee per account), or run discovery (paste candidates OR describe an ICP and the harness sources them via WebSearch + Vruum MCP + LinkedIn search). This skill orchestrates deep research per prospect in your IDE (your compute), scores against campaign ICP, then lets the backend enforce the fixed `match_score >= 70` gate.

## Where the heavy logic lives

Steps 3–8 (pre-flight, Phase A research, Phase B research, harness gate, save chain, audit-log report) are defined in `RESEARCH-ENGINE.md` (in this same skill directory). This skill owns:
- Step 1: campaign picker (with ETA)
- Step 2: source picker (conditional PLATFORM block + always-visible HARNESS block)
- The committee-resolution shared step (companies → people; used by every company-producing source)
- The account-list handler (company names/domains in, candidate list out)
- The discovery-mode handler (paste candidates inline OR describe an ICP and source via harness tools)
- The multi-campaign grammar

When you reach Step 3, **stop and read** `RESEARCH-ENGINE.md`. That doc is the canonical source for the candidate-list shape, the harness gate criteria, the identity-resolution save chain, and the canonical handoff prompt that source skills use.

## Subagent architecture

This skill uses two subagents (defined in `.claude/agents/`):
- `vruum-company-deep-researcher` — Phase A, one per unique company in the batch (max 10 in parallel)
- `vruum-prospect-deep-researcher` — Phase B, one per person (max 5 in parallel — Phase B is rate-limited because it calls `research` action=linkedin_fetch)

### MCP access requirements (load-bearing)

Subagents need access to the Vruum MCP server. Register it once in your AI assistant:

- **Claude Code**: `~/.claude.json` → `mcpServers.vruum` = `{"type": "http", "url": "https://api.vruum.ai/mcp"}`
- **Codex CLI**: `~/.codex/config.toml` → `[mcp_servers.vruum]` with `url = "https://api.vruum.ai/mcp"`
- **Other**: connect to `https://api.vruum.ai/mcp` (HTTP, OAuth via standard MCP flow)

The orchestrator's MCP precheck at the top of Step 3 (the `fetch` type=research_playbook call) catches misconfiguration upfront. Don't skip it.

### Dispatch methods (in order of preference)

1. **Subagent dispatch** (primary): Use your runtime's native subagent mechanism (Claude Code's `Agent` tool with `subagent_type: vruum-company-deep-researcher` / `vruum-prospect-deep-researcher`; Codex's equivalent). Subagents should inherit MCP access from the runtime config. Run waves of up to 10 company-research subagents and up to 5 prospect-research subagents in parallel.

2. **Inline**: If subagents can't reach Vruum MCP in your runtime, run the research inline in the main session instead. Do NOT bounce through another CLI as a workaround — that is a runtime-configuration problem to surface to the user.

## Inputs

- `prospect_list` (optional): pre-built candidate list matching the canonical shape in `RESEARCH-ENGINE.md`. If provided, skip the source-picker step and go straight to Step 3 (pre-flight). This is how source skills hand off.
- `source_policy` (optional): machine-readable provider policy matching `contracts/source-policy.schema.json`. It owns `selected_source`, `source_mode`, `prohibited_sources`, ordered `allowed_fallbacks`, bounded wave sizes, and transient retry attempts. Treat prohibited providers as unavailable: do not call status/list/search endpoints for them.
- `campaign(s)`: target campaign(s); multi-campaign supported.
- `buyers_per_account` (optional): how many buying-committee members to resolve per company when the source produces companies rather than people. Range 1–5. Per-source defaults: `discovery` → 2 (the surface is unqualified — optimize for reach, spread across more accounts), `account_list` → 3 (the account is already qualified — optimize for depth on the committee). Precedence: explicit operator value > a target stated in the campaign description (e.g. "~2 per account") > the per-source default. Sources that produce people directly (Sales Nav, YC, contact CSVs, discovery Path A) ignore this input.
- `mode`: `research-only` | `save` | `save-and-enroll` (default: `save-and-enroll`).

## Workflow — Step 1: Show pipeline status & pick campaigns

Always call `fetch(type="stats", subtype="outreach")` for queue depth and `search(type="campaigns")` for campaign status. Call `import_prospects(action="sales_nav_searches", payload={action: "list"})` **only** when the operator explicitly selected Sales Nav and `source_policy.prohibited_sources` does not contain `sales_nav` or `linkedin`. A generic status check must never touch Sales Nav.

Present a numbered table with **per-campaign ETA**:

```
Pipeline status:

  1. DFW CFOs       — 12/30 (18 needed) — harness ETA: ~16m
  2. Austin VPs     — 28/30 (2 needed)  — harness ETA: ~3m
  3. Houston CTOs   — 0/20  (20 needed) — harness ETA: ~18m
  4. NYC Partners   — 40/40 ✓

Which campaigns to fill? (all / 1,3 / skip 2)
Total if all needing fill: ~37m sequential.
```

ETA estimates: ~2s for batch Step 3 dedup + ~30s/wave Phase A + ~60s/wave Phase B (5-parallel cap on Phase B). Multi-campaign ETAs are sequential.

**Table rules:**
- One row per campaign, numbered sequentially
- Show current/target counts and how many are needed
- Flag searches that are drying up (⚠️) or accounts near capacity
- Mark campaigns already at target with ✓ and don't number them
- Show per-campaign ETA so operator can budget time

**Buyers-per-account line (company-producing sources only).** When the source is already known to produce companies at Step 1 — the operator handed an account list, or named discovery with an ICP brief — append one line under the table so depth is an explicit decision, never a silent default:

```
Buyers per account: 3 (account-list default; range 1–5 — reply "buyers N" to change)
```

If the source isn't known yet at Step 1 (the common "fill my pipeline" path), defer this line to source-resolution time — the account-list handler and discovery Path B each confirm it before resolving. Wherever it renders, resolve the shown number via the `buyers_per_account` precedence in Inputs (explicit value > campaign-description target > per-source default), and name which rule produced it (e.g. "2 — campaign description says '~2 per account'").

**Wait for the user's response.** Parse: "all", "1, 3", "skip 2", "just the CFO ones", "buyers 3", etc. Only proceed with the selected campaigns.

## Workflow — Step 2: Pick source per campaign (only if `prospect_list` not provided)

**Default to `discovery`.** Unless the operator named a source (in their prompt or a prior turn), don't lead with the picker — default to the `discovery` source (the describe-an-ICP path: source against the campaign's own ICP via WebSearch + Vruum MCP + LinkedIn search) and announce it in one line so it stays overridable, e.g.:

> Sourcing {campaign_name} via discovery (ICP-based, long-tail). Reply `sales-nav`, `yc`, `csv`, `account-list`, or `picker` to switch.

**Account-list auto-detect:** if the operator's input is a list of company names or domains with no person identities (no personal names, no `/in/` LinkedIn URLs, no emails — e.g. pasted company lines, or a spreadsheet whose only mappable column is `company`), that is the `account_list` source. Announce it ("Reading this as an account list — {N} companies; I'll resolve the buying committee per account") instead of defaulting to discovery or misreading the rows as contacts.

CSV and Sales Nav are fully supported when selected. `source_policy` is a per-run routing contract: an explicit "use CSV" or "use Sales Nav" selects that capability; an explicit "no CSV" or "no Sales Nav" prohibits it only for this run. Never persist a seller's personal source preference as a tenant-wide capability restriction.

Why discovery is the default: keyword/Sales-Nav sources keep returning the same marquee names, which collide with already-enrolled prospects as a campaign matures — the Step 3 dedup then throws most of the batch away. Discovery anchors on the campaign's own ICP and reaches the long tail, deduping *before* research instead of after. Only render the full picker below when the operator asks to choose (`picker`), names a non-discovery source, or the discovery handler can't proceed.

Per selected campaign, when the operator wants to choose the source explicitly, prompt:

In **public mode** (the package builder strips the PLATFORM block from this skill before publishing), the picker shows only HARNESS modes, renumbered 1–5:

```
Source for {campaign_name}?
  HARNESS mode (your compute, in-chat deep research, visible & interruptible):
    1. sales-nav-deep    — Sales Nav profiles + harness deep research
    2. yc                — scrape YC directory with filters you provide
    3. csv               — read a CSV file (path next), harness deep research
    4. account-list      — paste company names/domains (or a company-only CSV); I resolve the buying committee per account
    5. discovery         — paste candidates inline OR describe an ICP and I'll source them via WebSearch + Vruum MCP + LinkedIn search
```

The conditional rendering happens at package-build time, not at skill-runtime — when the orchestrator runs in operator mode it sees the 7-option block; when it runs in public mode (stripped package) it sees only the 5-option block. Source-skill dispatch logic below uses option labels (`sales-nav-platform`, `yc`, etc.), not numbers, so the renumbering is cosmetic.

Per source pick, dispatch:

- `sales-nav-platform` → invoke `/sales-nav-platform-fill` (calls `import_prospects` action=sales_nav_import; backend handles everything; **skip Steps 3-8 of this skill entirely** — backend agents own the rest).
- `csv-platform` → invoke `/csv-platform-fill` (calls `import_prospects` action=csv_start; backend handles everything; same — skip Steps 3-8).
- `sales-nav-deep` → invoke `/sales-nav-deep-fill` to produce a candidate list, then continue to Step 3 with it.
- `yc` → invoke `/yc-pipeline-fill` to produce a candidate list, then continue to Step 3 with it.
- `csv` → invoke `/csv-pipeline-fill` to produce a candidate list, then continue to Step 3 with it. (A company-only CSV — no contact columns — routes to `account-list` instead; `/csv-pipeline-fill` documents the same redirect.)
- `account-list` → use the account-list handler below (parse companies → committee resolution → candidate list), then continue to Step 3 with it.
- `discovery` → use the discovery-mode handler below to produce a candidate list (handler branches: paste-shaped input → parse, prose ICP brief → harness sources via WebSearch + Vruum MCP + LinkedIn search), then continue to Step 3 with it.

**Multi-campaign behavior:** campaigns run sequentially. Campaign 1's Step 7 (save chain + bulk enroll) completes before campaign 2's Step 3 starts. Predictable rate-limit behavior, simple progress narrative. Trade-off: 3-campaign fills are ~37min wall-clock vs ~22min if Phase A/B were overlapped across campaigns. Cross-campaign overlap is a v2.

## Committee resolution (shared step: companies → people)

The canonical candidate shape in `RESEARCH-ENGINE.md` is person-shaped — a company-only row is invalid by construction. This step is the single route from companies to people. **Every source that ends up holding companies runs it** (`account_list` always; `discovery` Path B after sourcing companies; a company-only CSV redirected from `/csv-pipeline-fill`). Sources that produce people directly skip it, and YC is a deliberate exemption: it is founder-first by design — the founder *is* the buyer, so `/yc-pipeline-fill` keeps its own founder extraction. Never improvise around this step by hand-picking a buyer out of research prose — see the anti-skew rule below.

**Contract:**
- **Input:** a list of companies, each with `company_name` and/or `domain` (at least one), plus any known `company_id`, `company_website`, or `company_linkedin_url`, the campaign's ICP target titles/seniority, and a resolved `buyers_per_account` (see Inputs).
- **Output:** the canonical person-shaped candidate list defined in `RESEARCH-ENGINE.md`, ready for Step 3. Copy every trustworthy company anchor onto every resolved person (`company_id`, `company_domain`, `company_website`, `company_linkedin_url`) and set `raw_signals.source_company` so the report can group by account. Do not reduce a strongly identified account back to a name-only company during committee resolution.

**Per company:**
1. Pull up to `buyers_per_account` people matching the campaign's ICP titles/seniority, using the first available provider in this order (same order as discovery sourcing; apply `source_policy` before any call):
   - **Structured B2B provider** — e.g. Clay `find-and-enrich-contacts-at-company` with the title/seniority filter.
   - **LinkedIn / Sales Nav** people-at-known-company via `import_prospects action=sales_nav_search` — fine here because the company is fixed; the marquee-name skew applies to company discovery, not to enumerating a known committee. Mind LinkedIn quota.
   - **Email finder** — Hunter via `search type=companies {domain, seniority}`.
   - **Web** — `WebSearch` for "{company} {title}" + team/about pages; the universal fallback.
2. **Select by title fit, not visibility.** When the provider returns more than `buyers_per_account` matches, rank by ICP title/seniority fit — never by follower count, press coverage, or how often the name appears in research prose. The buyer with no public profile is often the one actually running the function; picking the famous name per account is the same marquee-name skew this skill warns about for Sales Nav.
3. **Companies that resolve to zero people** are reported by this step at hand-off ("no ICP-matching contacts found at {company} via {providers tried}") and counted in the engine's Step 8 report (`accounts unresolved`), never silently dropped. They cannot enter the engine (the candidate shape is person-shaped), so the hand-off summary is where the gap surfaces.

Provider calls run in the standard bounded waves (company-level actions ≤10, person/LinkedIn actions ≤5) with progress objects per `contracts/run-progress.schema.json`, using `phase: "committee_resolution"`.

## Account-list handler (for `account-list` source)

Input is company names or domains — pasted lines, or a company-only CSV/xlsx redirected from `/csv-pipeline-fill`. This is a thin wrapper around the shared committee-resolution step:

1. **Parse companies.** One company per line (or per row). A line that looks like a domain (`acme.com`) sets `domain`; otherwise it's `company_name`. Drop blanks and `#` comments; dedupe case-insensitively. Above 100 accounts, confirm: "{N} accounts — process all, or first M? (a/N)".
2. **Anchor on campaign ICP.** Read the campaign's ICP (via `fetch` type=campaign and `fetch` type=settings subtype=profile) to get target titles/seniority. Show a one-line synthesis and the resolved `buyers_per_account` — full precedence per Inputs: an explicit operator value wins, else a campaign-description target like "~2 per account", else this source's default of 3 (the accounts are already qualified, go deeper) — and confirm before resolving.
3. **Run committee resolution** (shared step above) across the account list.
4. **Show the resolved list** grouped by account — `Company → Name (title) [source]` — and get a "go" / "drop X" before continuing to Step 3.

The territory/fit gate on the *companies* themselves still happens in Phase A + the harness gate — the handler doesn't pre-judge accounts, it only turns them into people.

## Discovery-mode handler (for `discovery` source)

Discovery mode covers two paths off the same prompt:

**Path A — operator pastes candidates** (you already know who you want)
Tolerant line parser, candidates produced directly:

- **Line is a LinkedIn URL** (matches `^https?://(www\.)?linkedin\.com/in/[^/?]+/?(\?.*)?$`) → set `linkedin_url`, leave `name` and `company` null. Phase B will fill them via the linkedin_fetch research call.
- **Line has comma(s)** → split as `name, company[, linkedin_url][, email]`. If 4 fields, last is email. If 3 fields, last is linkedin_url IF it matches the LinkedIn URL pattern, else interpret as email if it has `@`, else treat as a 2-field line + extra junk.
- **Line is just text** → treat as `full_name`, prompt operator: "what company for {full_name}?". If the operator gets prompted for >3 lines, ask once "set company={X} for all unspecified?" to batch.

Drop blank lines and lines starting with `#` (treat as comments).

**Cap at 100 lines** by default. Above that, ask: "{N} prospects pasted — process all, or first M? (a/N)". Keeps operators from accidentally kicking off a 1,000-prospect harness fill.

**Path B — operator describes an ICP** (you want the harness to discover candidates)
Operator gives a brief like "Series A-C SaaS founders, US, 50-500 ppl" or "directors of operations at MSPs in DFW, recently posted about hiring". Harness sources candidates from scratch:

1. **Anchor on campaign ICP** — read the campaign's existing ICP/company profile (via `fetch` type=campaign and `fetch` type=settings subtype=profile) and merge with the operator's brief. Show a one-line synthesis ("OK so: Series A-C SaaS, US, 50-500 ppl, founder/CEO/CTO titles") and confirm before sourcing.
2. **Take a source inventory — use the operator's actual toolbox, don't hardcode one provider.** Different operators have different prospecting tools connected. Take inventory of any MCP servers or CLIs this session can reach (inspect or search your available tools for terms like `clay`, `apollo`, `zoominfo`, `enrich`, `company`, `contacts`) and pick the highest-signal one. Prefer in this order:
   - **Structured B2B data / enrichment provider** (Clay, Apollo, ZoomInfo, Crunchbase, People Data Labs, Clearbit, …) — these firmographic-filter companies AND resolve the buying committee directly, and they reach the long tail, which is the entire point of discovery. If one is connected, it is the primary source. With Clay specifically, that's `find-and-enrich-company` (firmographic company pull) + `find-and-enrich-contacts-at-company` (committee). Mind provider credits / rate limits.
   - **LinkedIn / Sales Nav** via `import_prospects action=sales_nav_search` — fine to *resolve people at a company you already found*, but it over-samples well-known names, so never use it as the primary company-discovery channel.
   - **Email finder** — Hunter via `search type=companies {domain, seniority}`, or the provider's own email step — to fill the contact emails Phase B needs.
   - **Web** (`WebSearch` / `WebFetch`) — always available; the universal fallback and a strong long-tail *company* finder (funding announcements, Crunchbase/PitchBook, vertical directories) even when a data provider is connected.

   Apply `source_policy` before inventorying or calling providers. Validate the entire object against `contracts/source-policy.schema.json` before the first provider call. If `selected_source` is disconnected, stop with code `source_unavailable`; exclusive mode never substitutes, while preferred mode may use only the first connected entry in `allowed_fallbacks`. Announce the resolved policy in one line ("Sourcing via Clay — firmographic pull + committee enrichment; web as allowed backup; Sales Nav prohibited") so the operator can redirect.
3. **Source companies first, by firmographics — aim past the obvious names** — use the chosen tool to pull companies matching the merged ICP by stage / headcount / vertical / geo, NOT by marquee-name lookup (the saturated set IS the famous names). With a data provider, run the firmographic query directly; with web only, work funding announcements + directories.
4. **Resolve the buying committee per company** — run the shared **Committee resolution** step above on the sourced companies, with `buyers_per_account` resolved per Inputs (discovery default 2 — the surface is unqualified, so spread it across more accounts rather than going deep on any one).
5. **Dedup against existing pipeline** — for each discovered person, check `search` type=people with a name/company keyword query so you don't research someone the campaign already has. This is where saturated names drop out, cheaply, before any research spend.
6. **Show the discovered list to the operator** before handoff. Format: `Name (title) — Company [source] [linkedin]`. Cap the surface at 2x daily_target so we don't over-source. Get a "go" / "drop X" before continuing.

Emit progress objects matching `contracts/run-progress.schema.json` after every bounded wave. Company-provider actions run in waves of at most 10; person/LinkedIn/provider contact actions run in waves of at most 5. Never submit a mixed unbounded batch and wait without a progress update.

Defaults when `source_policy` is omitted: `selected_source: null` (inventory connected discovery tools), `source_mode: "preferred"`, `prohibited_sources: []`, `allowed_fallbacks: ["web"]`, `company_wave_size: 10`, `person_wave_size: 5`, and `transient_retry_attempts: 2`. Operator language such as "no Sales Nav" or "no CSV" is parsed into `prohibited_sources` before validation and overrides defaults.

Discovery-path candidates produced in either path use the canonical shape in `RESEARCH-ENGINE.md` and feed into Step 3 the same way. Preserve any company anchors returned by the selected provider. Name-only discoveries may proceed to Phase B, but the engine will not save them unless current-employer research supplies a strong anchor.

**Path detection:** if the first non-comment line looks like a URL or has commas (paste-shaped), use Path A. If it's prose without URLs/commas and >40 chars, use Path B. If ambiguous, ask: "paste, or describe the ICP and I discover?"

## Workflow — Steps 3 onward

**Switch to `RESEARCH-ENGINE.md` here.** Read that doc and follow Step 3 (pre-flight) → Step 4 (Phase A) → Step 5 (Phase B) → Step 6 (harness gate) → Step 7 (save chain with identity resolution) → Step 8 (aggregate report + audit log to `.context/runs/`).

Do not duplicate the engine logic in this skill — link operators back to the engine doc when they ask "what does the gate check?" or "how does the save chain work?"

## Notes

- **Composability** with source skills: source skills produce candidate lists; this orchestrator runs the research engine. Both directions allowed (operator can run a source skill standalone or run /pipeline-fill as the front door).
- **Real money costs** are in Phase B (LinkedIn API + Hunter calls + OpenAI tokens for the prospect subagent). Phase A is mostly WebFetch/WebSearch which is operator-network. The batch primitives in Step 3 keep dedup latency low (~2s vs 12s pre-batch).
- **Harness offload framing**: deep research and the authoritative campaign score run in your IDE (your tokens). The backend validates the payload, records provenance, and mechanically enforces `match_score >= 70`; `MatchAnalysisAgent` is fallback-only for newly added people when a caller omits assessment. Duplicates retain their stored score unless a campaign move enqueues an asynchronous re-score.
- **Audit trail**: every run writes to `.context/runs/pipeline-fill-{ISO-timestamp}.md`. Useful weeks later for "what did the YC fill on Apr 12 import?"
