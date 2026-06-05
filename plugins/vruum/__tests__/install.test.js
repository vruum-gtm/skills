'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const INSTALL_JS = path.join(__dirname, '..', 'install.js');

// Re-require install.js with HOME pointed at a temp dir so the module-scope
// VRUUM_SKILLS (derived from os.homedir(), which honors $HOME on POSIX)
// resolves under the sandbox. Mirrors the operator test's pattern.
function freshInstaller(home) {
  process.env.HOME = home;
  delete require.cache[require.resolve('../install.js')];
  return require('../install.js');
}

function withHome(fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vrpub-'));
  const origHome = process.env.HOME;
  try {
    const installer = freshInstaller(tmp);
    const vruumSkills = path.join(tmp, '.vruum', 'skills');
    fs.mkdirSync(vruumSkills, { recursive: true });
    return fn({ installer, tmp, vruumSkills });
  } finally {
    process.env.HOME = origHome;
    delete require.cache[require.resolve('../install.js')];
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ─── pruneStaleLinks ─────────────────────────────────────────────────────────

test('pruneStaleLinks acceptance: removes dangling stale link, keeps current', () => {
  withHome(({ installer, tmp, vruumSkills }) => {
    const target = path.join(tmp, 'target');
    fs.mkdirSync(target, { recursive: true });
    // Current skill: real source + live link.
    fs.mkdirSync(path.join(vruumSkills, 'keep'), { recursive: true });
    fs.symlinkSync(path.join(vruumSkills, 'keep'), path.join(target, 'keep'), 'dir');
    // Stale: a link to a skill the package no longer ships (dangling — target
    // was removed in the rename). This is the exact /segment-doctor bug case.
    fs.symlinkSync(path.join(vruumSkills, 'segment-doctor'), path.join(target, 'segment-doctor'), 'dir');

    const results = installer.pruneStaleLinks({ target, skills: ['keep'], dryRun: false });

    assert.deepEqual(
      fs.readdirSync(target).sort(),
      ['keep'],
      'only the current skill link should remain',
    );
    assert.equal(results.length, 1);
    assert.equal(results[0].name, 'segment-doctor');
    assert.equal(results[0].action, 'pruned');
  });
});

test('pruneStaleLinks keeps current-skill links', () => {
  withHome(({ installer, tmp, vruumSkills }) => {
    const target = path.join(tmp, 'target');
    fs.mkdirSync(target, { recursive: true });
    fs.mkdirSync(path.join(vruumSkills, 'a'), { recursive: true });
    fs.symlinkSync(path.join(vruumSkills, 'a'), path.join(target, 'a'), 'dir');

    const results = installer.pruneStaleLinks({ target, skills: ['a'], dryRun: false });
    assert.equal(results.length, 0);
    assert.ok(fs.existsSync(path.join(target, 'a')));
  });
});

test('pruneStaleLinks never touches non-symlinks (real dirs/files)', () => {
  withHome(({ installer, tmp }) => {
    const target = path.join(tmp, 'target');
    fs.mkdirSync(target, { recursive: true });
    fs.mkdirSync(path.join(target, 'userdir'), { recursive: true });
    fs.writeFileSync(path.join(target, 'userdir', 'note.md'), '# mine');
    fs.writeFileSync(path.join(target, 'userfile'), 'hello');

    const results = installer.pruneStaleLinks({ target, skills: [], dryRun: false });
    assert.equal(results.length, 0);
    assert.ok(fs.existsSync(path.join(target, 'userdir', 'note.md')));
    assert.ok(fs.existsSync(path.join(target, 'userfile')));
  });
});

test('pruneStaleLinks keeps foreign symlinks (live and dangling)', () => {
  withHome(({ installer, tmp }) => {
    const target = path.join(tmp, 'target');
    fs.mkdirSync(target, { recursive: true });
    const elsewhere = path.join(tmp, 'elsewhere');
    fs.mkdirSync(elsewhere, { recursive: true });
    fs.symlinkSync(elsewhere, path.join(target, 'other'), 'dir');
    // Dangling foreign link — points somewhere outside ~/.vruum/skills.
    fs.symlinkSync(path.join(tmp, 'gone'), path.join(target, 'other-gone'), 'dir');

    const results = installer.pruneStaleLinks({ target, skills: [], dryRun: false });
    assert.equal(results.length, 0);
    assert.deepEqual(fs.readdirSync(target).sort(), ['other', 'other-gone']);
  });
});

test('pruneStaleLinks does NOT prune cross-installer operator links (trailing-sep boundary)', () => {
  withHome(({ installer, tmp }) => {
    const target = path.join(tmp, 'target');
    fs.mkdirSync(target, { recursive: true });
    // ~/.vruum/skills-operator/current/skills/x — string-prefix collides with
    // ~/.vruum/skills but the path.sep boundary must exclude it.
    const opTarget = path.join(tmp, '.vruum', 'skills-operator', 'current', 'skills', 'x');
    fs.mkdirSync(opTarget, { recursive: true });
    fs.symlinkSync(opTarget, path.join(target, 'x'), 'dir');

    const results = installer.pruneStaleLinks({ target, skills: [], dryRun: false });
    assert.equal(results.length, 0, 'operator link must not be pruned by public prune');
    assert.ok(fs.existsSync(path.join(target, 'x')));
  });
});

test('pruneStaleLinks dryRun reports would-prune and deletes nothing', () => {
  withHome(({ installer, tmp, vruumSkills }) => {
    const target = path.join(tmp, 'target');
    fs.mkdirSync(target, { recursive: true });
    fs.symlinkSync(path.join(vruumSkills, 'segment-doctor'), path.join(target, 'segment-doctor'), 'dir');

    const results = installer.pruneStaleLinks({ target, skills: [], dryRun: true });
    assert.equal(results.length, 1);
    assert.equal(results[0].action, 'would-prune');
    assert.ok(fs.lstatSync(path.join(target, 'segment-doctor')).isSymbolicLink(), 'nothing deleted on dryRun');
  });
});

test('pruneStaleLinks on a missing target dir returns []', () => {
  withHome(({ installer, tmp }) => {
    const results = installer.pruneStaleLinks({ target: path.join(tmp, 'nope'), skills: [], dryRun: false });
    assert.deepEqual(results, []);
  });
});

// ─── isOurLink boundary ──────────────────────────────────────────────────────

test('isOurLink matches links into ~/.vruum/skills but not the operator sibling', () => {
  withHome(({ installer, tmp }) => {
    const skillsLink = path.join(tmp, '.vruum', 'skills', 'foo');
    const opLink = path.join(tmp, '.vruum', 'skills-operator', 'current', 'skills', 'foo');
    const dst = path.join(tmp, 'target', 'foo');
    assert.equal(installer.isOurLink(dst, skillsLink), true);
    assert.equal(installer.isOurLink(dst, opLink), false);
  });
});

// ─── commandUninstall stale scan ─────────────────────────────────────────────

test('commandUninstall removes owned stale link, leaves foreign + non-symlink', () => {
  withHome(({ installer, tmp, vruumSkills }) => {
    const target = path.join(tmp, 'target');
    fs.mkdirSync(target, { recursive: true });
    // Owned stale (renamed-skill) link.
    fs.symlinkSync(path.join(vruumSkills, 'segment-doctor'), path.join(target, 'segment-doctor'), 'dir');
    // Foreign symlink — must survive.
    const elsewhere = path.join(tmp, 'elsewhere');
    fs.mkdirSync(elsewhere, { recursive: true });
    fs.symlinkSync(elsewhere, path.join(target, 'foreign'), 'dir');
    // Non-symlink real dir — must survive.
    fs.mkdirSync(path.join(target, 'realdir'), { recursive: true });

    installer.commandUninstall({ targets: [target], dryRun: false });

    assert.ok(!fs.existsSync(path.join(target, 'segment-doctor')), 'owned stale link removed');
    assert.ok(fs.lstatSync(path.join(target, 'foreign')).isSymbolicLink(), 'foreign link kept');
    assert.ok(fs.existsSync(path.join(target, 'realdir')), 'non-symlink kept');
  });
});

test('commandUninstall dryRun deletes nothing', () => {
  withHome(({ installer, tmp, vruumSkills }) => {
    const target = path.join(tmp, 'target');
    fs.mkdirSync(target, { recursive: true });
    fs.symlinkSync(path.join(vruumSkills, 'segment-doctor'), path.join(target, 'segment-doctor'), 'dir');

    installer.commandUninstall({ targets: [target], dryRun: true });
    assert.ok(fs.lstatSync(path.join(target, 'segment-doctor')).isSymbolicLink());
  });
});

// ─── require-safety ──────────────────────────────────────────────────────────

test('requiring install.js does not execute main()', () => {
  // If require triggered main(), it would call commandInstall with no args and
  // either throw or exit. A clean require returning the exports proves guard.
  delete require.cache[require.resolve('../install.js')];
  const mod = require('../install.js');
  assert.equal(typeof mod.pruneStaleLinks, 'function');
  assert.equal(typeof mod.commandInstall, 'function');
});

test('install.js help command runs as a script without throwing', () => {
  const out = execFileSync('node', [INSTALL_JS, 'help'], { encoding: 'utf8' });
  assert.match(out, /@vruum\/skills/);
});
