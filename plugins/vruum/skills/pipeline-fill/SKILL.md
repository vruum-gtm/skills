---
name: pipeline-fill
description: >-
  Source-agnostic pipeline orchestrator. Picks a source per campaign (Sales Nav
  / YC / CSV / discovery), runs harness deep research, applies a pre-filter
  gate, then saves into the campaign via the backend authoritative
  match_score>=70 gate. Use when: fill pipeline, import prospects, daily
  imports, need more prospects, discover prospects from scratch, deep research
  before import.
---
# Pipeline Fill

You are a source-agnostic pipeline filler. You pick campaigns to fill, pick a source per campaign (Sales Nav / YC / CSV / discovery), and orchestrate harness deep research that gates against the campaign ICP before saving prospects into the backend pipeline.

## Why this skill exists

Filling your pipeline by source-of-the-day is normal. Sales Nav drying up doesn't mean you're stuck — pick YC, paste a CSV, or run discovery (paste candidates OR describe an ICP and the harness sources them via WebSearch + Vruum MCP + LinkedIn search). This skill orchestrates deep research per prospect in your IDE (your compute), pre-filters against campaign ICP, then saves the qualified ones into the campaign via the backend's canonical gate.

## Where the heavy logic lives

Steps 3–8 (pre-flight, Phase A research, Phase B research, harness gate, save chain, audit-log report) are defined in `RESEARCH-ENGINE.md` (in this same skill directory). This skill owns:
- Step 1: campaign picker (with ETA)
- Step 2: source picker (conditional PLATFORM block + always-visible HARNESS block)
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
- `campaign(s)`: target campaign(s); multi-campaign supported.
- `mode`: `research-only` | `save` | `save-and-enroll` (default: `save-and-enroll`).
- `gate_threshold`: minimum backend `match_score` to enroll (default: campaign's existing quality_gate).

## Workflow — Step 1: Show pipeline status & pick campaigns

Call `import_prospects(action="sales_nav_searches", payload={action: "list"})` + `fetch(type="stats", subtype="outreach")` for queue depth + `search(type="campaigns")` for non-Sales-Nav campaigns. Present a numbered table with **per-campaign ETA**:

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

**Wait for the user's response.** Parse: "all", "1, 3", "skip 2", "just the CFO ones", etc. Only proceed with the selected campaigns.

## Workflow — Step 2: Pick source per campaign (only if `prospect_list` not provided)

**Default to `discovery`.** Unless the operator named a source (in their prompt or a prior turn), don't lead with the picker — default to the `discovery` source (the describe-an-ICP path: source against the campaign's own ICP via WebSearch + Vruum MCP + LinkedIn search) and announce it in one line so it stays overridable, e.g.:

> Sourcing {campaign_name} via discovery (ICP-based, long-tail). Reply `sales-nav`, `yc`, `csv`, or `picker` to switch.

Why discovery is the default: keyword/Sales-Nav sources keep returning the same marquee names, which collide with already-enrolled prospects as a campaign matures — the Step 3 dedup then throws most of the batch away. Discovery anchors on the campaign's own ICP and reaches the long tail, deduping *before* research instead of after. Only render the full picker below when the operator asks to choose (`picker`), names a non-discovery source, or the discovery handler can't proceed.

Per selected campaign, when the operator wants to choose the source explicitly, prompt:

In **public mode** (the package builder strips the PLATFORM block from this skill before publishing), the picker shows only HARNESS modes, renumbered 1–4:

```
Source for {campaign_name}?
  HARNESS mode (your compute, in-chat deep research, visible & interruptible):
    1. sales-nav-deep    — Sales Nav profiles + harness deep research
    2. yc                — scrape YC directory with filters you provide
    3. csv               — read a CSV file (path next), harness deep research
    4. discovery         — paste candidates inline OR describe an ICP and I'll source them via WebSearch + Vruum MCP + LinkedIn search
```

The conditional rendering happens at package-build time, not at skill-runtime — when the orchestrator runs in operator mode it sees the 6-option block; when it runs in public mode (stripped package) it sees only the 4-option block. Source-skill dispatch logic below uses option labels (`sales-nav-platform`, `yc`, etc.), not numbers, so the renumbering is cosmetic.

Per source pick, dispatch:

- `sales-nav-platform` → invoke `/sales-nav-platform-fill` (calls `import_prospects` action=sales_nav_import; backend handles everything; **skip Steps 3-8 of this skill entirely** — backend agents own the rest).
- `csv-platform` → invoke `/csv-platform-fill` (calls `import_prospects` action=csv_start; backend handles everything; same — skip Steps 3-8).
- `sales-nav-deep` → invoke `/sales-nav-deep-fill` to produce a candidate list, then continue to Step 3 with it.
- `yc` → invoke `/yc-pipeline-fill` to produce a candidate list, then continue to Step 3 with it.
- `csv` → invoke `/csv-pipeline-fill` to produce a candidate list, then continue to Step 3 with it.
- `discovery` → use the discovery-mode handler below to produce a candidate list (handler branches: paste-shaped input → parse, prose ICP brief → harness sources via WebSearch + Vruum MCP + LinkedIn search), then continue to Step 3 with it.

**Multi-campaign behavior:** campaigns run sequentially. Campaign 1's Step 7 (save chain + bulk enroll) completes before campaign 2's Step 3 starts. Predictable rate-limit behavior, simple progress narrative. Trade-off: 3-campaign fills are ~37min wall-clock vs ~22min if Phase A/B were overlapped across campaigns. Cross-campaign overlap is a v2.

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

   Announce the pick in one line ("Sourcing via Clay — firmographic pull + committee enrichment; web as backup") so the operator can redirect. If no enrichment provider is connected, say so and fall back to web + Hunter.
3. **Source companies first, by firmographics — aim past the obvious names** — use the chosen tool to pull companies matching the merged ICP by stage / headcount / vertical / geo, NOT by marquee-name lookup (the saturated set IS the famous names). With a data provider, run the firmographic query directly; with web only, work funding announcements + directories.
4. **Resolve the buying committee per company** — for each candidate company, pull ICP-matching titles via the same provider's contact enrichment (e.g. Clay `find-and-enrich-contacts-at-company`) or `search type=companies {domain, seniority}` (Hunter). Cap ~5 people/company to spread the surface.
5. **Dedup against existing pipeline** — for each discovered person, check `search` type=people with a name/company keyword query so you don't research someone the campaign already has. This is where saturated names drop out, cheaply, before any research spend.
6. **Show the discovered list to the operator** before handoff. Format: `Name (title) — Company [source] [linkedin]`. Cap the surface at 2x daily_target so we don't over-source. Get a "go" / "drop X" before continuing.

Discovery-path candidates produced in either path use the canonical shape in `RESEARCH-ENGINE.md` and feed into Step 3 the same way.

**Path detection:** if the first non-comment line looks like a URL or has commas (paste-shaped), use Path A. If it's prose without URLs/commas and >40 chars, use Path B. If ambiguous, ask: "paste, or describe the ICP and I discover?"

## Workflow — Steps 3 onward

**Switch to `RESEARCH-ENGINE.md` here.** Read that doc and follow Step 3 (pre-flight) → Step 4 (Phase A) → Step 5 (Phase B) → Step 6 (harness gate) → Step 7 (save chain with identity resolution) → Step 8 (aggregate report + audit log to `.context/runs/`).

Do not duplicate the engine logic in this skill — link operators back to the engine doc when they ask "what does the gate check?" or "how does the save chain work?"

## Notes

- **Composability** with source skills: source skills produce candidate lists; this orchestrator runs the research engine. Both directions allowed (operator can run a source skill standalone or run /pipeline-fill as the front door).
- **Real money costs** are in Phase B (LinkedIn API + Hunter calls + OpenAI tokens for the prospect subagent). Phase A is mostly WebFetch/WebSearch which is operator-network. The batch primitives in Step 3 keep dedup latency low (~2s vs 12s pre-batch).
- **Harness offload framing**: deep research runs in your IDE (your tokens). The backend `MatchAnalysisAgent` runs the canonical gate (~$0.02/prospect on Vruum's bill). This split is intentional — see memory `project_harness_offload_strategy.md`.
- **Audit trail**: every run writes to `.context/runs/pipeline-fill-{ISO-timestamp}.md`. Useful weeks later for "what did the YC fill on Apr 12 import?"
