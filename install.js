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
const SKILLS_SRC = path.join(PACKAGE_ROOT, 'skills');

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
  if (!fs.existsSync(SKILLS_SRC)) return [];
  return fs
    .readdirSync(SKILLS_SRC, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
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
      `No skills found under ${SKILLS_SRC}. This looks like a broken package.`
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

  const summary = [];
  for (const target of targets) {
    const { created } = ensureTargetDir(target.dir, dryRun);
    if (created === 'would') {
      summary.push({ target: target.dir, detail: 'would create target dir' });
    } else if (created) {
      summary.push({ target: target.dir, detail: 'created target dir' });
    }
    for (const skillName of skills) {
      const srcAbs = path.join(SKILLS_SRC, skillName);
      summary.push(linkSkill({ name: skillName, srcAbs, target: target.dir, dryRun }));
    }
  }

  const prefix = dryRun ? '[dry-run] ' : '';
  console.log(`${prefix}@vruum/skills v${VERSION}`);
  console.log(`${prefix}skills source: ${SKILLS_SRC}`);
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
  if (targets.length === 0) {
    console.error('No AI harness skill directories detected. Nothing to remove.');
    return;
  }

  const prefix = dryRun ? '[dry-run] ' : '';
  console.log(`${prefix}@vruum/skills v${VERSION} uninstall`);

  for (const target of targets) {
    console.log(`${prefix}target: ${target.dir}`);
    for (const skillName of skills) {
      const dst = path.join(target.dir, skillName);
      const srcAbs = path.join(SKILLS_SRC, skillName);
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
      if (existing.kind !== 'symlink' || existing.target !== srcAbs) {
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
      const srcAbs = path.join(SKILLS_SRC, skillName);
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
