'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SETUP = path.join(__dirname, '..', '..', 'setup');

function runSetup({ src, dst, home }) {
  return execFileSync('bash', [SETUP], {
    encoding: 'utf8',
    env: { ...process.env, SKILLS_SRC: src, SKILLS_DST: dst, HOME: home },
  });
}

test('setup links current skills, prunes owned stale links, leaves the rest', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vrsetup-'));
  try {
    const src = fs.realpathSync(fs.mkdtempSync(path.join(tmp, 'src-')));
    const dst = fs.mkdtempSync(path.join(tmp, 'dst-'));
    // Source ships skills a, b.
    fs.mkdirSync(path.join(src, 'a'));
    fs.mkdirSync(path.join(src, 'b'));

    // Pre-seed dst:
    //  - a → src/a (already linked, current — kept)
    fs.symlinkSync(path.join(src, 'a'), path.join(dst, 'a'), 'dir');
    //  - segment-doctor → src/segment-doctor (owned, renamed away — pruned)
    fs.symlinkSync(path.join(src, 'segment-doctor'), path.join(dst, 'segment-doctor'), 'dir');
    //  - real non-symlink file (kept)
    fs.writeFileSync(path.join(dst, 'README'), 'not a link');
    //  - foreign symlink, target outside SRC_ABS (kept)
    const elsewhere = path.join(tmp, 'elsewhere');
    fs.mkdirSync(elsewhere);
    fs.symlinkSync(elsewhere, path.join(dst, 'foreign'), 'dir');

    const out = runSetup({ src, dst, home: path.join(tmp, 'home') });

    // b newly linked, a kept, segment-doctor pruned.
    assert.ok(fs.existsSync(path.join(dst, 'b')), 'b should be linked');
    assert.equal(fs.readlinkSync(path.join(dst, 'b')), path.join(src, 'b'));
    assert.ok(fs.existsSync(path.join(dst, 'a')), 'a kept');
    assert.ok(!fs.existsSync(path.join(dst, 'segment-doctor')), 'stale owned link pruned');
    // Foreign + non-symlink survive.
    assert.ok(fs.lstatSync(path.join(dst, 'foreign')).isSymbolicLink(), 'foreign link kept');
    assert.equal(fs.readFileSync(path.join(dst, 'README'), 'utf8'), 'not a link');

    assert.match(out, /pruned=1/, 'pruned counter reported');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('setup applies SKILLS_DST override before the no-harness exit', () => {
  // No ~/.claude or ~/.codex under HOME, but SKILLS_DST set — must still run
  // (proves the override moved above the no-harness exit).
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vrsetup2-'));
  try {
    const src = fs.realpathSync(fs.mkdtempSync(path.join(tmp, 'src-')));
    const dst = fs.mkdtempSync(path.join(tmp, 'dst-'));
    fs.mkdirSync(path.join(src, 'only'));

    const out = runSetup({ src, dst, home: path.join(tmp, 'empty-home') });
    assert.ok(fs.existsSync(path.join(dst, 'only')), 'skill linked via override headlessly');
    assert.match(out, /setup complete/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
