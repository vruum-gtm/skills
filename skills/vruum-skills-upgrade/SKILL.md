---
name: vruum-skills-upgrade
description: "Upgrade @vruum/skills to the latest npm version and re-sync ~/.vruum/. Use when: upgrade vruum skills, update vruum, pull latest vruum skills, or when the preamble reports UPGRADE_AVAILABLE."
---

# /vruum-skills-upgrade

Upgrade the `@vruum/skills` npm package + re-sync `~/.vruum/` + relink all harness skill dirs.

## Inline upgrade flow (called from preamble)

If the calling skill's preamble reported `UPGRADE_AVAILABLE <old> <new>`, follow this flow. It runs inline — when done, the original skill continues.

### Step 1: decide whether to auto-upgrade

Read `~/.vruum/config.yaml`. If it contains `auto_upgrade: true`, skip to Step 3 (silent upgrade). Otherwise go to Step 2.

### Step 2: ask the user

Use AskUserQuestion with these four options:

- **A) Upgrade now** — run the upgrade, return a one-line confirmation, then continue with the original skill.
- **B) Show changelog first** — fetch `https://raw.githubusercontent.com/vruum-gtm/skills/main/CHANGELOG.md`, show the section for the new version, then re-ask A/C/D.
- **C) Snooze** — don't upgrade this session. Bump the snooze level:
  ```bash
  # Snooze format: "<version> <level> <epoch>". Level 1=24h, 2=48h, 3+=7d.
  OLD_LEVEL=$(awk '{print $2}' ~/.vruum/update-snoozed 2>/dev/null || echo 0)
  NEW_LEVEL=$((OLD_LEVEL + 1))
  [ $NEW_LEVEL -gt 3 ] && NEW_LEVEL=3
  echo "<new> $NEW_LEVEL $(date +%s)" > ~/.vruum/update-snoozed
  ```
  Replace `<new>` with the version the preamble reported.
- **D) Skip this session** — do nothing, don't write snooze. Next session will re-prompt.

### Step 3: run the upgrade

Detect how `@vruum/skills` was installed (global vs npx) and pick the right command:

```bash
# If installed globally (vruum-skills is on PATH):
if command -v vruum-skills >/dev/null 2>&1; then
  OLD=$(cat ~/.vruum/VERSION 2>/dev/null || echo "unknown")
  npm install -g @vruum/skills@latest
  vruum-skills install
  NEW=$(cat ~/.vruum/VERSION 2>/dev/null || echo "unknown")
else
  # npx-only install — refresh the npx cache and re-run.
  OLD=$(cat ~/.vruum/VERSION 2>/dev/null || echo "unknown")
  npx --yes @vruum/skills@latest install
  NEW=$(cat ~/.vruum/VERSION 2>/dev/null || echo "unknown")
fi

# Write the just-upgraded marker so the next preamble greets with "just updated!".
echo "$OLD" > ~/.vruum/just-upgraded-from
rm -f ~/.vruum/last-update-check ~/.vruum/update-snoozed
```

### Step 4: report

One line: `upgraded @vruum/skills $OLD → $NEW`. Then continue with the original skill.

## Standalone mode (user invoked `/vruum-skills-upgrade` directly)

Force a fresh check first, then run the flow above starting from Step 2:

```bash
~/.vruum/bin/vruum-skills-update-check --force
```

If the forced check returns nothing, report `already on latest (v$(cat ~/.vruum/VERSION))` and exit.

## When something goes wrong

- `npm install` fails with permissions → tell the user to re-run with `sudo` or fix their npm prefix. Don't auto-sudo.
- `vruum-skills install` reports skipped skills → surface the conflict message verbatim; user needs to remove conflicting files.
- Network failure on registry lookup → report `upgrade check failed, try again later` and continue with the original skill (don't block work on a transient fetch error).
