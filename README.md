# Vruum plugin for Claude

Vruum AI skills + remote MCP server for B2B GTM teams running cold outreach and pipeline operations. Installs slash commands for outreach triage, engagement triage, pipeline filling, prospect enrichment, and reply diagnosis — paired with the full Vruum MCP tool surface over OAuth 2.1.

This repo is a **Claude plugin marketplace**. Plugin content lives on npm as [`@vruum/skills`](https://www.npmjs.com/package/@vruum/skills); every npm publish flows into this marketplace automatically — there is no separate sync.

## Install — Claude Code

```
/plugin marketplace add https://github.com/vruum-gtm/skills
/plugin install vruum@vruum-gtm
```

## Install — Claude Desktop / Claude.ai (Cowork)

1. Download the latest plugin zip: [vruum-plugin.zip](https://github.com/vruum-gtm/skills/releases/latest/download/vruum-plugin.zip)
2. In Claude Desktop: **Settings → Customize → Plugins → "+" → Upload plugin file**
3. Select the zip. OAuth popup signs you into Vruum.

## What you get

- **`/vruum:outreach-triage`** — review and approve pending outreach drafts (subagent-parallelized).
- **`/vruum:engagement-triage`** — LinkedIn engagement queue + content post review.
- **`/vruum:pipeline-fill`** — import new Sales Nav prospects with ICP pre-filtering.
- **`/vruum:enrich-prospect`** — deep diarization: LinkedIn + company research + conversation history → one analyst's brief.
- **`/vruum:diagnose-reply`** — explain why a reply happened.
- Full Vruum MCP tool surface (people, segments, deals, analytics, Sales Nav, etc.).

## Links

- [Vruum](https://vruum.ai)
- [MCP server](https://api.vruum.ai/mcp)
- [npm package (plugin content)](https://www.npmjs.com/package/@vruum/skills)
- [Issues](https://github.com/vruum-gtm/skills/issues)
