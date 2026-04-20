#!/usr/bin/env node
/**
 * @vruum/skills installer.
 *
 * For AI assistants that don't natively support MCP prompts (Codex CLI,
 * ChatGPT, Windsurf) — installs SKILL.md files into the target harness's
 * skill directory so slash commands still work. For clients that DO
 * support MCP prompts (Claude Code, Claude Desktop, Cursor, VS Code,
 * Cline), you don't need this — just connect to https://api.vruum.ai/mcp
 * and slash commands appear automatically.
 *
 * Zero runtime dependencies — stdlib Node only.
 *
 * Usage:
 *   npx @vruum/skills install           # auto-detect Claude Code + Codex
 *   npx @vruum/skills install --target <dir>  # any other harness
 *   npx @vruum/skills install --dry-run
 *   npx @vruum/skills list
 *   npx @vruum/skills uninstall
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const VERSION = require('./package.json').version;
const PACKAGE_ROOT = __dirname;
const PKG_SKILLS = path.join(PACKAGE_ROOT, 'skills');
const PKG_AGENTS = path.join(PACKAGE_ROOT, 'agents');

// Installer-owned stable path. Mirrors gstack's ~/.claude/skills/gstack/
// approach: package contents get copied here so symlinks target a path that
// never moves, even when npm/npx wipes the original package directory.
const VRUUM_ROOT = path.join(os.homedir(), '.vruum');
const VRUUM_SKILLS = path.join(VRUUM_ROOT, 'skills');
const VRUUM_AGENTS = path.join(VRUUM_ROOT, 'agents');
const VRUUM_BIN = path.join(VRUUM_ROOT, 'bin');
const VRUUM_VERSION_FILE = path.join(VRUUM_ROOT, 'VERSION');
const PKG_BIN = path.join(PACKAGE_ROOT, 'bin');

// Prelude prepended to every SKILL.md as it lands in ~/.vruum/skills/. Runs
// an update check (1h cache), then gives Claude natural-language instructions
// for how to react. Mirrors gstack's preamble pattern but injected at install
// time rather than via a template-gen step.
const SKILL_PRELUDE = `## Preamble (run first)

\`\`\`bash
_UPD=$(~/.vruum/bin/vruum-skills-update-check 2>/dev/null || true)
[ -n "$_UPD" ] && echo "$_UPD" || true
\`\`\`

If output shows \`UPGRADE_AVAILABLE <old> <new>\`: read \`~/.vruum/skills/vruum-skills-upgrade/SKILL.md\` and follow the inline upgrade flow. If \`~/.vruum/config.yaml\` has \`auto_upgrade: true\`, run the upgrade silently; otherwise AskUserQuestion with four options — (A) upgrade now, (B) upgrade with changelog preview, (C) snooze, (D) skip this session. If user picks snooze, bump the snooze level in \`~/.vruum/update-snoozed\` (format: \`<new_version> <level> <unix_epoch>\`; level 1 = 24h, 2 = 48h, 3+ = 7d). Then continue with the skill.

If output shows \`JUST_UPGRADED <from> <to>\`: tell the user "Running @vruum/skills v{to} (just updated!)" in one line, then continue.

Otherwise proceed silently with the skill below.

---
`;

function injectPrelude(skillDir) {
  const skillFile = path.join(skillDir, 'SKILL.md');
  if (!fs.existsSync(skillFile)) return;
  const raw = fs.readFileSync(skillFile, 'utf8');
  // Find end of YAML frontmatter. If missing, inject at top.
  let insertAt = 0;
  if (raw.startsWith('---\n')) {
    const end = raw.indexOf('\n---\n', 4);
    if (end !== -1) insertAt = end + 5;
  }
  const before = raw.slice(0, insertAt);
  const after = raw.slice(insertAt);
  const patched = before + '\n' + SKILL_PRELUDE + '\n' + after.replace(/^\n+/, '');
  fs.writeFileSync(skillFile, patched);
}

// Known harness skill directories. Add a target here when a new harness
// lands on a stable skill-dir convention.
const KNOWN_TARGETS = [
  { name: 'Claude Code', dir: path.join(os.homedir(), '.claude', 'skills') },
  { name: 'Codex CLI',   dir: path.join(os.homedir(), '.codex',  'skills') },
];

function parseArgs(argv) {
  const args = { command: 'install', targets: [], dryRun: false, help: false };
  const rest = argv.slice(2);
  let i = 0;
  if (rest[i] && !rest[i].startsWith('-')) {
    args.command = rest[i];
    i += 1;
  }
  for (; i < rest.length; i += 1) {
    const a = rest[i];
    if (a === '--target' || a === '-t') {
      const value = rest[i + 1];
      if (!value) throw new Error(`${a} requires a path`);
      args.targets.push(path.resolve(value.replace(/^~(?=\/|$)/, os.homedir())));
      i += 1;
    } else if (a === '--dry-run' || a === '-n') {
      args.dryRun = true;
    } else if (a === '--help' || a === '-h') {
      args.help = true;
    } else {
      throw new Error(`unknown argument: ${a}`);
    }
  }
  return args;
}

function printHelp() {
  console.log(`@vruum/skills v${VERSION}

Usage:
  npx @vruum/skills install                  Install into every detected harness
  npx @vruum/skills install --target <dir>   Add an extra target (repeatable)
  npx @vruum/skills install --dry-run        Preview changes, don't touch disk
  npx @vruum/skills uninstall                Remove previously-installed symlinks
  npx @vruum/skills list                     Show detected targets + what's installed

Pairs with the Vruum MCP server at https://api.vruum.ai/mcp. Connect your AI
assistant to that URL first, then these skills turn common workflows into
slash commands.

Supported auto-detection:
  - Claude Code  ~/.claude/skills/
  - Codex CLI    ~/.codex/skills/

Any other harness: pass --target <its skills directory>.

Note: Claude Code, Claude Desktop, Cursor, VS Code Copilot, and Cline all
support MCP prompts natively. If you use one of those, you don't need this
installer — connecting to https://api.vruum.ai/mcp surfaces slash commands
automatically. This installer is for Codex CLI, ChatGPT, Windsurf, and
other assistants that don't yet support MCP prompts.`);
}

function listAvailableSkills() {
  if (!fs.existsSync(PKG_SKILLS)) return [];
  return fs
    .readdirSync(PKG_SKILLS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

function syncVruumRoot({ dryRun }) {
  if (dryRun) {
    const rows = [
      `would sync ${PKG_SKILLS} -> ${VRUUM_SKILLS} (with auto-update prelude)`,
    ];
    if (fs.existsSync(PKG_AGENTS)) rows.push(`would sync ${PKG_AGENTS} -> ${VRUUM_AGENTS}`);
    if (fs.existsSync(PKG_BIN)) rows.push(`would sync ${PKG_BIN} -> ${VRUUM_BIN}`);
    rows.push(`would write ${VRUUM_VERSION_FILE} = ${VERSION}`);
    return rows;
  }
  fs.mkdirSync(VRUUM_ROOT, { recursive: true });

  // Skills — copy then inject prelude in-place on the ~/.vruum/ copy.
  fs.rmSync(VRUUM_SKILLS, { recursive: true, force: true });
  fs.cpSync(PKG_SKILLS, VRUUM_SKILLS, { recursive: true });
  for (const skillName of listAvailableSkills()) {
    injectPrelude(path.join(VRUUM_SKILLS, skillName));
  }
  const rows = [`synced ${VRUUM_SKILLS} (prelude injected)`];

  if (fs.existsSync(PKG_AGENTS)) {
    fs.rmSync(VRUUM_AGENTS, { recursive: true, force: true });
    fs.cpSync(PKG_AGENTS, VRUUM_AGENTS, { recursive: true });
    rows.push(`synced ${VRUUM_AGENTS}`);
  }

  // Bin scripts — update-check needs to land at a stable path and be exec.
  if (fs.existsSync(PKG_BIN)) {
    fs.rmSync(VRUUM_BIN, { recursive: true, force: true });
    fs.cpSync(PKG_BIN, VRUUM_BIN, { recursive: true });
    for (const entry of fs.readdirSync(VRUUM_BIN)) {
      fs.chmodSync(path.join(VRUUM_BIN, entry), 0o755);
    }
    rows.push(`synced ${VRUUM_BIN}`);
  }

  // VERSION file — read by vruum-skills-update-check as the local version.
  fs.writeFileSync(VRUUM_VERSION_FILE, VERSION + '\n');
  rows.push(`wrote ${VRUUM_VERSION_FILE} = ${VERSION}`);

  return rows;
}

function ensureTargetDir(target, dryRun) {
  if (fs.existsSync(target)) return { created: false };
  if (dryRun) return { created: 'would' };
  fs.mkdirSync(target, { recursive: true });
  return { created: true };
}

function linkSkill({ name, srcAbs, target, dryRun }) {
  const dst = path.join(target, name);
  let existing = null;
  try {
    const lstat = fs.lstatSync(dst);
    if (lstat.isSymbolicLink()) {
      existing = { kind: 'symlink', target: fs.readlinkSync(dst) };
    } else {
      existing = { kind: lstat.isDirectory() ? 'dir' : 'file' };
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  if (existing?.kind === 'symlink' && existing.target === srcAbs) {
    return { name, target, action: 'already-linked' };
  }
  if (existing && existing.kind !== 'symlink') {
    return {
      name,
      target,
      action: 'skipped',
      reason: `a non-symlink ${existing.kind} already exists at ${dst}`,
    };
  }
  if (dryRun) {
    return { name, target, action: existing ? 'would-relink' : 'would-link' };
  }
  if (existing?.kind === 'symlink') {
    fs.unlinkSync(dst);
  }
  fs.symlinkSync(srcAbs, dst, 'dir');
  return { name, target, action: existing ? 'relinked' : 'linked' };
}

function detectTargets(extraTargets) {
  const targets = [];
  // Auto-detect only when the skills directory itself already exists.
  for (const known of KNOWN_TARGETS) {
    if (fs.existsSync(known.dir)) {
      targets.push({ ...known, autoDetected: true });
    }
  }
  for (const dir of extraTargets) {
    if (!targets.some((t) => t.dir === dir)) {
      targets.push({ name: `custom (${dir})`, dir, autoDetected: false });
    }
  }
  return targets;
}

function commandInstall({ targets: extraTargets, dryRun }) {
  const skills = listAvailableSkills();
  if (skills.length === 0) {
    throw new Error(
      `No skills found under ${PKG_SKILLS}. This looks like a broken package.`
    );
  }
  const targets = detectTargets(extraTargets);
  if (targets.length === 0) {
    console.error(
      'No AI harness skill directories detected.\n' +
        'Expected one of: ' +
        KNOWN_TARGETS.map((t) => t.dir).join(', ') +
        '\nPass --target <dir> for any other harness.'
    );
    process.exit(1);
  }

  const syncRows = syncVruumRoot({ dryRun });

  const summary = [];
  for (const target of targets) {
    const { created } = ensureTargetDir(target.dir, dryRun);
    if (created === 'would') {
      summary.push({ target: target.dir, detail: 'would create target dir' });
    } else if (created) {
      summary.push({ target: target.dir, detail: 'created target dir' });
    }
    for (const skillName of skills) {
      const srcAbs = path.join(VRUUM_SKILLS, skillName);
      summary.push(linkSkill({ name: skillName, srcAbs, target: target.dir, dryRun }));
    }
  }

  const prefix = dryRun ? '[dry-run] ' : '';
  console.log(`${prefix}@vruum/skills v${VERSION}`);
  console.log(`${prefix}package source: ${PACKAGE_ROOT}`);
  console.log(`${prefix}stable root:    ${VRUUM_ROOT}`);
  for (const row of syncRows) {
    console.log(`  ${prefix}${row}`);
  }
  for (const target of targets) {
    console.log(`${prefix}target: ${target.dir}${target.autoDetected ? ' (auto)' : ''}`);
  }
  for (const row of summary) {
    if (row.detail) {
      console.log(`  ${prefix}${row.detail}: ${row.target}`);
      continue;
    }
    const label = row.action.padEnd(15);
    console.log(`  ${prefix}${label} ${row.name}${row.reason ? `  [${row.reason}]` : ''}`);
  }

  const skipped = summary.filter((row) => row.action === 'skipped');
  if (skipped.length > 0) {
    console.log('');
    console.log(`Skipped ${skipped.length} skill(s); remove the conflicting file(s) and re-run.`);
    process.exit(2);
  }
}

function commandUninstall({ targets: extraTargets, dryRun }) {
  const skills = listAvailableSkills();
  const targets = detectTargets(extraTargets);
  const prefix = dryRun ? '[dry-run] ' : '';
  console.log(`${prefix}@vruum/skills v${VERSION} uninstall`);

  if (targets.length === 0) {
    console.error('No AI harness skill directories detected.');
  }

  // A symlink is "ours" if it points into ~/.vruum/skills/. We accept any
  // target there (not just the current skill name) so stale links from
  // renamed skills still get cleaned up.
  const isOurLink = (linkTarget) => {
    const resolved = path.resolve(linkTarget);
    return resolved.startsWith(VRUUM_SKILLS + path.sep) || resolved === VRUUM_SKILLS;
  };

  for (const target of targets) {
    console.log(`${prefix}target: ${target.dir}`);
    for (const skillName of skills) {
      const dst = path.join(target.dir, skillName);
      let existing = null;
      try {
        const lstat = fs.lstatSync(dst);
        if (lstat.isSymbolicLink()) {
          existing = { kind: 'symlink', target: fs.readlinkSync(dst) };
        } else {
          existing = { kind: 'other' };
        }
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
      }

      if (!existing) {
        console.log(`  ${prefix}not-installed  ${skillName}`);
        continue;
      }
      if (existing.kind !== 'symlink' || !isOurLink(existing.target)) {
        console.log(`  ${prefix}skipped        ${skillName}  [not our symlink]`);
        continue;
      }
      if (dryRun) {
        console.log(`  ${prefix}would-remove   ${skillName}`);
      } else {
        fs.unlinkSync(dst);
        console.log(`  ${prefix}removed        ${skillName}`);
      }
    }
  }

  // Only clean up our own subdirectories — ~/.vruum/ is a shared state dir
  // (e.g. the .agents/ vruum-update-check keeps config.yaml + snooze state
  // there, and both installers share that config).
  for (const dir of [VRUUM_SKILLS, VRUUM_AGENTS, VRUUM_BIN]) {
    if (!fs.existsSync(dir)) continue;
    if (dryRun) {
      console.log(`${prefix}would remove ${dir}`);
    } else {
      fs.rmSync(dir, { recursive: true, force: true });
      console.log(`${prefix}removed ${dir}`);
    }
  }
  if (fs.existsSync(VRUUM_VERSION_FILE)) {
    if (dryRun) {
      console.log(`${prefix}would remove ${VRUUM_VERSION_FILE}`);
    } else {
      fs.unlinkSync(VRUUM_VERSION_FILE);
      console.log(`${prefix}removed ${VRUUM_VERSION_FILE}`);
    }
  }
  // Best-effort rmdir the root if now empty; ignore ENOTEMPTY.
  if (!dryRun && fs.existsSync(VRUUM_ROOT)) {
    try { fs.rmdirSync(VRUUM_ROOT); } catch (err) {
      if (err.code !== 'ENOTEMPTY' && err.code !== 'EEXIST') throw err;
    }
  }
}

function commandList({ targets: extraTargets }) {
  const skills = listAvailableSkills();
  const targets = detectTargets(extraTargets);
  console.log(`@vruum/skills v${VERSION}`);
  console.log(`skills in package: ${skills.join(', ') || '(none)'}`);
  if (targets.length === 0) {
    console.log('No targets detected. Pass --target <dir> to point at your harness.');
    return;
  }
  for (const target of targets) {
    console.log(`\n${target.name}: ${target.dir}${target.autoDetected ? ' (auto)' : ''}`);
    if (!fs.existsSync(target.dir)) {
      console.log('  (directory does not exist yet)');
      continue;
    }
    for (const skillName of skills) {
      const dst = path.join(target.dir, skillName);
      const srcAbs = path.join(VRUUM_SKILLS, skillName);
      try {
        const lstat = fs.lstatSync(dst);
        if (lstat.isSymbolicLink()) {
          const linkTarget = fs.readlinkSync(dst);
          const match = linkTarget === srcAbs;
          console.log(`  ${match ? 'installed' : 'other-link'.padEnd(10)}  ${skillName}${match ? '' : `  -> ${linkTarget}`}`);
        } else {
          console.log(`  present      ${skillName}  (not our symlink)`);
        }
      } catch (err) {
        if (err.code === 'ENOENT') {
          console.log(`  missing      ${skillName}`);
        } else {
          throw err;
        }
      }
    }
  }
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv);
  } catch (err) {
    console.error(err.message);
    printHelp();
    process.exit(1);
  }

  if (args.help || args.command === 'help') {
    printHelp();
    return;
  }

  switch (args.command) {
    case 'install':
      commandInstall(args);
      break;
    case 'uninstall':
      commandUninstall(args);
      break;
    case 'list':
      commandList(args);
      break;
    default:
      console.error(`Unknown command: ${args.command}`);
      printHelp();
      process.exit(1);
  }
}

main();
