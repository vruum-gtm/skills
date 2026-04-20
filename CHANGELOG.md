# Changelog

## [0.2.0] - 2026-04-20

### Added
- `/outreach-triage` — self-serve outreach queue review. Dispatches parallel `vruum-outreach-reviewer` subagents that evaluate each pending draft (T1 structural + cross-touch dedup, T2+ with deep prospect research + rewrite-if-needed, reply responses with full context). Presents verdicts to the user for approval. Single-company scope.
- `/engagement-triage` — self-serve LinkedIn engagement + content post review. Dispatches parallel `vruum-engagement-reviewer` subagents across four queue types (warming comments, nurture reactions, marketing comments, demand-gen content posts) with voice-fit and relevance checks.
- `agents/vruum-outreach-reviewer.md` + `agents/vruum-engagement-reviewer.md` — subagent definitions that power the two new skills. Full Vruum MCP tool access, review-rubric instructions baked in.

### Changed
- Plugin version bumped to 0.2.0.


## [0.1.0] - 2026-04-20

### Added
- Initial release.
- `.claude-plugin/marketplace.json` + `.claude-plugin/plugin.json` — Claude Code marketplace + plugin manifests.
- `.mcp.json` declaring the hosted Vruum MCP server at `https://api.vruum.ai/mcp` over HTTP with auto-detected OAuth 2.1 + PKCE + Dynamic Client Registration.
- Two skills auto-discovered from `skills/`:
  - `/enrich-prospect` — deep prospect diarization into a structured intelligence profile.
  - `/diagnose-reply` — diagnose why a reply happened and what worked.
- `@vruum/skills` npm installer for harnesses that don't yet support MCP prompts (Codex CLI, ChatGPT, Windsurf). Auto-detects Claude Code + Codex CLI skill directories; takes `--target <dir>` for any other harness.
