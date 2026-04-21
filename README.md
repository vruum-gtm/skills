# @vruum/skills

Vruum AI skills for Claude Code, Codex CLI, and any AI assistant with a skill directory.

Pairs with the Vruum MCP server at [https://api.vruum.ai/mcp](https://api.vruum.ai/mcp). For MCP-native clients (Claude Code, Claude Desktop, Cursor, VS Code Copilot, Cline), connecting to the MCP URL surfaces these skills as native slash commands. This npm package is for assistants that don't yet support MCP prompts (Codex CLI, ChatGPT, Windsurf).

## Install

```bash
npx @vruum/skills install
```

Detects Claude Code (`~/.claude/skills/`) and Codex CLI (`~/.codex/skills/`). For other harnesses:

```bash
npx @vruum/skills install --target /path/to/skills/dir
```

## Skills

<!-- generated:skills-begin -->
- `/diagnose-reply` — Diagnose why a reply happened — what worked or didn't in the outreach that triggered it. Use when: why did they reply, what worked, diagnose reply, reply diagnosis, analyze this reply, what caused this reply, reply analysis.
- `/engagement-triage` — Review and approve your pending LinkedIn engagement drafts and demand-gen content posts. Use when: triage engagements, review engagement queue, review warming comments, review nurture reactions, review marketing comments, review content drafts, check engagement queue.
- `/enrich-prospect` — Deep prospect diarization — synthesize everything known about a person into a structured intelligence profile. Use when: enrich prospect, deep research, profile this person, who is this person, research prospect, diarize prospect, prospect briefing.
- `/outreach-triage` — Review and approve your pending outreach drafts across LinkedIn and email. Use when: triage, review queue, morning review, check messages, approve outreach, what needs review.
- `/vruum-skills-upgrade` — Upgrade @vruum/skills to the latest npm version and re-sync ~/.vruum/. Use when: upgrade vruum skills, update vruum, pull latest vruum skills, or when the preamble reports UPGRADE_AVAILABLE.
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
