# @vruum/skills

Vruum AI skills for Claude Code, Codex CLI, and any AI assistant with a skill directory.

Once installed, run `/vruum-guide` in your harness — it takes you from an empty account to your first reviewed outreach draft, then keeps recommending the next most valuable action.

Pairs with the Vruum MCP server at [https://api.vruum.ai/mcp](https://api.vruum.ai/mcp). The MCP server exposes the `skill` tool (action=invoke to run a skill, action=publish to publish one), with `search` type=skills and `fetch` type=skill for discovery, so any connected client can run these skills. Skills themselves are distributed via the Claude Code plugin / marketplace; this npm package installs them into the agent-standard skills directory for harnesses without plugin support (Codex CLI, ChatGPT, Windsurf).

## Install

### Claude Code

Add to `~/.claude.json`:

```json
{
  "mcpServers": {
    "vruum": { "type": "http", "url": "https://api.vruum.ai/mcp" }
  }
}
```

Install the skills via the Claude Code plugin / marketplace (below); the MCP server provides the `skill` tool (action=invoke). You don't need this npm package for Claude Code.

### Codex CLI

**Plugin (recommended)** — bundles the skills + Vruum MCP in one step:

```bash
codex plugin marketplace add vruum-gtm/skills
codex plugin add vruum@vruum-gtm
codex mcp login vruum
```

**Manual / other harnesses** — register the MCP, then install the skills into the agent-standard skills dir:

```toml
# ~/.codex/config.toml
[mcp_servers.vruum]
url = "https://api.vruum.ai/mcp"
```

```bash
npx @vruum/skills install                                # detects ~/.agents/skills/
npx @vruum/skills install --target /path/to/skills/dir   # any other harness
```

### Cursor / VS Code Copilot / Cline

Register the MCP server via your editor's MCP setup (each one has its own UI / config path). Connect to `https://api.vruum.ai/mcp` (HTTP, OAuth via standard MCP flow). The `skill` tool (action=invoke) becomes available; to also install the skill files locally, use this npm package's `install --target` below.

### Claude Desktop / Claude.ai (Cowork)

Install the Vruum plugin via the official plugin directory — bundles the connector and the skills in one step:

[github.com/vruum-gtm/skills/releases/latest/download/vruum-plugin.zip](https://github.com/vruum-gtm/skills/releases/latest/download/vruum-plugin.zip)

Download and upload via **Settings → Customize → Plugins → "+"**.

### ChatGPT / Windsurf / other harnesses without plugin support

```bash
npx @vruum/skills install --target /path/to/skills/dir
```

## Skills

<!-- generated:skills-begin -->
- `/campaign-builder` — Build and launch an outreach campaign from criteria in about five prompts: filter contacts by size, industry, persona, region, or list; preview the cohort; create the campaign (optionally cloning messaging from an existing one); assign people; review and launch. Use when: create a campaign, build a campaign, new campaign from criteria, campaign from my list.
- `/campaign-doctor` — Diagnose and fix struggling outreach campaigns. Use when: fix a campaign, diagnose campaign, why is my campaign not working, campaign health, low reply rate, check campaigns, which campaigns need help.
- `/create-content` — Co-produce an on-voice LinkedIn content post — pull your own signal, steer the angle conversationally, draft in your voice, then save as draft, schedule, or publish. Use when: write a post, draft LinkedIn content, create content, post about, content co-production, help me write a post.
- `/csv-pipeline-fill` — CSV harness source for /pipeline-fill. Reads a CSV, auto-detects headers, maps columns, hands off to /pipeline-fill for harness deep research and import. Use when: import CSV, paste a CSV, csv import, prospect list from CSV, csv harness mode.
- `/deal-triage` — Triage your active deal pipeline. Flags at-risk deals, surfaces stalled-deal alerts, runs MEDDIC qualification, and recommends next actions. Use when: review deals, triage deals, check pipeline, deal review, morning deals, pipeline review, deal health, at-risk deals.
- `/diagnose-reply` — Diagnose why a reply happened — what worked or didn't in the outreach that triggered it. Use when: why did they reply, what worked, diagnose reply, reply diagnosis, analyze this reply, what caused this reply, reply analysis.
- `/engagement-triage` — Review and approve your pending LinkedIn engagement drafts and demand-gen content posts. Use when: triage engagements, review engagement queue, review warming comments, review nurture reactions, review marketing comments, review content drafts, check engagement queue.
- `/enrich-prospect` — Deep prospect diarization — synthesize everything known about a person into a structured intelligence profile. Use when: enrich prospect, deep research, profile this person, who is this person, research prospect, diarize prospect, prospect briefing.
- `/expansion-fill` — Source expansion-ready customers for outreach. Finds closed-won customers >60 days old with no open follow-on deal and surfaces them for an expansion play. Use when: expand customer, find upsell opportunities, NRR play, expansion opportunities, customers ripe for expansion, who can we expand to.
- `/outreach-triage` — Review and approve your pending outreach drafts across LinkedIn and email. Use when: triage, review queue, morning review, check messages, approve outreach, what needs review.
- `/pipeline-fill` — Source-agnostic pipeline orchestrator. Picks a source per segment (Sales Nav / YC / CSV / discovery), runs harness deep research, applies a pre-filter gate, then saves into the segment via the backend authoritative match_score>=70 gate. Use when: fill pipeline, import prospects, daily imports, need more prospects, discover prospects from scratch, deep research before import.
- `/sales-nav-deep-fill` — Sales Nav harness source for /pipeline-fill. Pre-filters Sales Nav profiles via vruum-pipeline-filter, produces a candidate list, hands off to /pipeline-fill for deep research and import. Use when: sales nav with deep research, sales nav harness mode, in-chat sales nav.
- `/vruum-guide` — Guide to running Vruum from your own AI harness. First run: guided onboarding from empty account to first reviewed outreach draft. After: reads live account state, recommends the single next most valuable action, hands off to the right skill. Use when: get started, onboarding, how do I use vruum, what should I do next, where do I start.
- `/vruum-skills-upgrade` — Upgrade @vruum/skills to the latest npm version and re-sync ~/.vruum/. Use when: upgrade vruum skills, update vruum, pull latest vruum skills, or when the preamble reports UPGRADE_AVAILABLE.
- `/winback-fill` — Source winback candidates from closed-lost deals or churned customers. Surfaces people who went silent or lost a deal >90 days ago, where the loss reason wasn't 'no_fit'. Use when: winback, win back churned, reactivate, revive cold deals, 90-day silent revival, lost deal recovery, lost customer outreach.
- `/yc-pipeline-fill` — YC harness source for /pipeline-fill. Scrapes YC's public Algolia index, extracts founder LinkedIn URLs, dedups, hands a candidate list to /pipeline-fill for deep research and import. Use when: YC pipeline fill, source from YC, fill segment with YC founders, sales nav dried up, source YC.
<!-- generated:skills-end -->

## Upgrade

Skills auto-prompt to upgrade via the preamble. To upgrade explicitly:

```bash
npx @vruum/skills install
```

## Uninstall

```bash
npx @vruum/skills uninstall
```

Removes all symlinks this installer created. Does not touch `~/.vruum/auth.json` or other co-resident tool state.

## Links

- [Vruum](https://vruum.ai)
- [MCP server](https://api.vruum.ai/mcp)
- [Issues](https://github.com/vruum-gtm/skills/issues)
