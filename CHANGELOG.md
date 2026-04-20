# Changelog

## [0.4.0] - 2026-04-20

### Added
- **Auto-update.** Every installed `SKILL.md` now carries a preamble that runs `~/.vruum/bin/vruum-skills-update-check` at skill start (1h cache for "up to date", 12h cache for "upgrade available"). Script polls `https://registry.npmjs.org/@vruum/skills/latest` and emits `UPGRADE_AVAILABLE <old> <new>` or `JUST_UPGRADED <from> <to>` — Claude reacts per natural-language instructions baked into the same preamble.
- **Snooze tiers.** Declining an upgrade prompt writes `~/.vruum/update-snoozed` with escalating durations (24h → 48h → 7d). A new version drop resets the snooze automatically.
- **`/vruum-skills-upgrade` skill.** Auto-detects global vs npx install, runs the right command, writes the just-upgraded marker, clears snooze. Supports `auto_upgrade: true` in `~/.vruum/config.yaml` for silent upgrades (shared config with the operator `.agents/` bundle).
- `bin/vruum-skills-update-check` shipped in the package, copied to `~/.vruum/bin/` on install.

### Changed
- Install writes `~/.vruum/VERSION` from package.json version. Uninstall removes `~/.vruum/bin/` + the VERSION file (still preserves `~/.vruum/config.yaml`).
- Install logs now show `(prelude injected)` against the skills sync row so you can tell auto-update prelude landed.

## [0.3.0] - 2026-04-20

### Changed
- Installer now copies `skills/` and `agents/` to a stable `~/.vruum/` root before creating the per-harness symlinks (mirrors gstack's `~/.claude/skills/gstack/` pattern). Symlinks point at `~/.vruum/skills/<name>` instead of the npx cache path, so they stay valid even after `npm cache clean` or Node-version bumps wipe the package install.
- Existing 0.2.x symlinks get auto-relinked on upgrade — no manual cleanup needed.
- Uninstall recognizes any symlink into `~/.vruum/skills/` as ours (not just by current skill name), so renamed/removed skills also get cleaned up. Uninstall additionally removes `~/.vruum/` itself.

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
