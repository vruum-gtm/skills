# Vruum AI — skills + MCP for your AI assistant

**The easy way to connect ChatGPT, Claude, Cursor, and friends to Vruum.** Ships skills and a remote MCP server URL so your AI assistant can search people, start outreach, diagnose replies, and run your whole sales pipeline through natural conversation.

Paired with [vruum.ai](https://vruum.ai).

---

## Install

Pick the path that matches your assistant.

### Claude Code (recommended — one command)

```bash
/plugin marketplace add vruum-gtm/skills
/plugin install vruum@vruum-gtm
```

That's it. Skills appear as slash commands. The MCP server connects automatically with OAuth (no secret to paste).

### Claude Desktop

Settings → Connectors → Add custom connector → paste:

```
https://api.vruum.ai/mcp
```

Skills appear as slash commands on connection. Approve the OAuth flow when prompted.

### ChatGPT (Business / Enterprise / Edu)

Enable Developer Mode → Settings → Apps & Connectors → Add → paste:

```
https://api.vruum.ai/mcp
```

Note: ChatGPT uses MCP tools directly and doesn't currently surface prompts as slash commands. You still get every Vruum tool through natural conversation.

### Cursor

Settings → MCP → Add server → paste:

```
https://api.vruum.ai/mcp
```

Prompts appear as slash commands on connection.

### Codex CLI, Windsurf, other harnesses

These tools don't yet support MCP prompts natively, so we ship the skill files as an npm package you can install into your harness's skill directory:

```bash
npx @vruum/skills install
```

Auto-detects `~/.claude/skills/` and `~/.codex/skills/`. For anything else:

```bash
npx @vruum/skills install --target <your harness skill dir>
```

See `npx @vruum/skills install --help` for all options.

### After install — auto-update is built in

Every skill you install via `@vruum/skills` carries a preamble that checks for a newer version on the npm registry (cached 1h for up-to-date, 12h for upgrade-available). When a new version ships, the skill surfaces `UPGRADE_AVAILABLE x → y` before running and offers four options: upgrade now, preview the changelog, snooze (24h / 48h / 7d escalating), or skip this session. Flip `auto_upgrade: true` in `~/.vruum/config.yaml` to upgrade silently — no prompt, just a "Running @vruum/skills v{x} (just updated!)" greeting on the next skill run.

The installer itself is idempotent and cleanable:
- `~/.vruum/` is the installer-owned root where skill files, agent files, and the update-check script live. Symlinks in `~/.claude/skills/` and `~/.codex/skills/` point into that stable path.
- `npx @vruum/skills uninstall` removes the symlinks, `~/.vruum/skills/`, `~/.vruum/agents/`, and `~/.vruum/bin/`. Your `~/.vruum/config.yaml` (shared with the operator `.agents/` bundle) stays put.

---

## What you get

Five slash commands that wrap the most common Vruum workflows:

- **`/enrich-prospect`** — synthesize everything known about a person (LinkedIn, research, conversation history, engagement signals) into a structured intelligence profile. Reveals the gap between what their bio says and what they actually focus on.
- **`/diagnose-reply`** — when someone replies, explain exactly what worked in your outreach. Turns every reply into a learning event.
- **`/outreach-triage`** — review your pending outreach drafts with parallel AI review. Dispatches subagents to evaluate each message in your queue, surfaces fixes, and lets you approve in bulk or one at a time. Handles T1s (first touches), follow-ups (with deep research), and reply responses (high-stakes).
- **`/engagement-triage`** — review your LinkedIn engagement queue (warming comments, nurture reactions, marketing comments) and demand-gen content post drafts. Same parallel-subagent pattern, tuned for voice-fit and post-relevance.
- **`/vruum-skills-upgrade`** — upgrade `@vruum/skills` to the latest version and re-sync `~/.vruum/`. Auto-invoked by the preamble when an upgrade is available; can also run standalone.

Plus the full Vruum MCP tool surface (60+ tools) accessible via natural conversation: search people, start outreach, review messages, manage deals, check analytics, run market research, and more.


---

## Auth

OAuth 2.1 with PKCE and Dynamic Client Registration — handled by your AI client automatically. You sign in with your Vruum account in a browser popup the first time. Your AI assistant never sees your password or any API key.

Accounts: sign up at [vruum.ai](https://vruum.ai).

---

## Support

- Product questions: [vruum.ai](https://vruum.ai)
- Issues with this plugin: [github.com/vruum-gtm/skills/issues](https://github.com/vruum-gtm/skills/issues)

## License

MIT.
