# Changelog

## [0.1.0] - 2026-04-20

### Added
- Initial release.
- `.claude-plugin/marketplace.json` + `.claude-plugin/plugin.json` — Claude Code marketplace + plugin manifests.
- `.mcp.json` declaring the hosted Vruum MCP server at `https://api.vruum.ai/mcp` over HTTP with auto-detected OAuth 2.1 + PKCE + Dynamic Client Registration.
- Two skills auto-discovered from `skills/`:
  - `/enrich-prospect` — deep prospect diarization into a structured intelligence profile.
  - `/diagnose-reply` — diagnose why a reply happened and what worked.
- `@vruum/skills` npm installer for harnesses that don't yet support MCP prompts (Codex CLI, ChatGPT, Windsurf). Auto-detects Claude Code + Codex CLI skill directories; takes `--target <dir>` for any other harness.
