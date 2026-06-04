# Vruum plugin for Claude & Codex

Vruum AI skills + remote MCP server for B2B GTM teams running cold outreach and pipeline operations. Installs slash commands for outreach triage, engagement triage, pipeline filling, prospect enrichment, and reply diagnosis — paired with the full Vruum MCP tool surface over OAuth 2.1.

This repo is a plugin **marketplace for both Claude and Codex**:

- **Claude** resolves the plugin from npm ([`@vruum/skills`](https://www.npmjs.com/package/@vruum/skills)) via `.claude-plugin/marketplace.json`.
- **Codex** resolves it from the in-repo plugin at [`plugins/vruum/`](plugins/vruum) via `.agents/plugins/marketplace.json` (Codex has no npm source, so the content is committed here).

Both are refreshed automatically on every `@vruum/skills` release — no manual sync.

## Install — Claude Code

```
/plugin marketplace add https://github.com/vruum-gtm/skills
/plugin install vruum@vruum-gtm
```

Then run `/mcp` to sign into Vruum (OAuth).

## Install — Claude Desktop / Claude.ai (Cowork)

1. Download the latest plugin zip: [vruum-plugin.zip](https://github.com/vruum-gtm/skills/releases/latest/download/vruum-plugin.zip)
2. In Claude Desktop: **Settings → Customize → Plugins → "+" → Upload plugin file**
3. Select the zip. OAuth popup signs you into Vruum.

## Install — Codex

```
codex plugin marketplace add vruum-gtm/skills
codex plugin add vruum@vruum-gtm
codex mcp login vruum
```

The CLI verb is `codex plugin add` (not `install`). The last step is the OAuth sign-in for the bundled MCP server. In the TUI, `/plugin` opens the same marketplace browser. Skills fire by name (`$pipeline-fill`) or automatically — Codex doesn't use per-skill slash commands.

## What you get

- **`/vruum:outreach-triage`** — review and approve pending outreach drafts (subagent-parallelized).
- **`/vruum:engagement-triage`** — LinkedIn engagement queue + content post review.
- **`/vruum:pipeline-fill`** — import new Sales Nav prospects with ICP pre-filtering.
- **`/vruum:enrich-prospect`** — deep diarization: LinkedIn + company research + conversation history → one analyst's brief.
- **`/vruum:diagnose-reply`** — explain why a reply happened.
- Full Vruum MCP tool surface (people, segments, deals, analytics, Sales Nav, etc.).

(Slash-command names shown are Claude's `plugin:skill` form; in Codex invoke the same skills as `$outreach-triage` etc.)

## Links

- [Vruum](https://vruum.ai)
- [MCP server](https://api.vruum.ai/mcp)
- [npm package (Claude plugin content)](https://www.npmjs.com/package/@vruum/skills)
- [Issues](https://github.com/vruum-gtm/skills/issues)
