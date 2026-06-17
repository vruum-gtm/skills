'use strict';

// Tests for bin/vruum-skills-update-check — focused on the silent-failure fix:
// a blocked/failed registry fetch must NOT be reported (or cached) as
// "up to date". That false positive kept a sandboxed client pinned to a stale
// skills bundle (its forced check returned nothing → the upgrade skill read it
// as "already on latest").
//
// Hermetic by design: VRUUM_REMOTE_URL points at a `file://` URL the script's
// curl reads locally (a present file = a reachable registry; a missing file =
// an unreachable one). No network, no proxy — runs identically in a sandbox
// and in CI.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCRIPT = path.join(__dirname, '..', 'bin', 'vruum-skills-update-check');

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vrupd-'));
}

function freshState(localVersion) {
  const dir = tmpdir();
  fs.writeFileSync(path.join(dir, 'VERSION'), `${localVersion}\n`);
  return dir;
}

// Write a registry-shaped JSON response to a file and return its file:// URL.
function registryFile(version) {
  const f = path.join(tmpdir(), 'latest.json');
  fs.writeFileSync(f, JSON.stringify({ name: '@vruum/skills', version }));
  return `file://${f}`;
}

// A file:// URL to a path that does not exist → curl fails → unreachable registry.
function unreachableUrl() {
  return `file://${path.join(tmpdir(), 'does-not-exist.json')}`;
}

function run({ stateDir, remoteUrl, force }) {
  const args = force ? ['--force'] : [];
  try {
    return execFileSync('bash', [SCRIPT, ...args], {
      encoding: 'utf8',
      env: { ...process.env, VRUUM_STATE_DIR: stateDir, VRUUM_REMOTE_URL: remoteUrl },
    }).trim();
  } catch (e) {
    // Every code path in the script exits 0; a throw is a real regression.
    throw new Error(`script exited non-zero: ${e.stderr || e.message}`);
  }
}

function cacheOf(stateDir) {
  return fs.readFileSync(path.join(stateDir, 'last-update-check'), 'utf8');
}

test('forced check: registry unreachable → CHECK_FAILED, never UP_TO_DATE', () => {
  const stateDir = freshState('0.6.15');
  const out = run({ stateDir, remoteUrl: unreachableUrl(), force: true });
  // The user explicitly asked → they must learn the check could not run.
  assert.match(out, /^CHECK_FAILED 0\.6\.15$/, `expected CHECK_FAILED, got: ${out}`);
  // The cache must NOT claim up-to-date on a failed fetch.
  assert.match(cacheOf(stateDir), /^CHECK_FAILED /);
  assert.doesNotMatch(cacheOf(stateDir), /UP_TO_DATE/);
});

test('passive check: registry unreachable → silent, cache CHECK_FAILED (not UP_TO_DATE)', () => {
  const stateDir = freshState('0.6.15');
  const out = run({ stateDir, remoteUrl: unreachableUrl(), force: false });
  // Passive runs stay quiet (no offline noise)...
  assert.equal(out, '');
  // ...but must not poison the cache with a false up-to-date.
  assert.match(cacheOf(stateDir), /^CHECK_FAILED /);
  assert.doesNotMatch(cacheOf(stateDir), /UP_TO_DATE/);
});

test('genuinely up to date → silent + UP_TO_DATE cache', () => {
  const stateDir = freshState('0.6.16');
  const out = run({ stateDir, remoteUrl: registryFile('0.6.16'), force: false });
  assert.equal(out, '');
  assert.match(cacheOf(stateDir), /^UP_TO_DATE 0\.6\.16/);
});

test('newer version available → UPGRADE_AVAILABLE', () => {
  const stateDir = freshState('0.6.15');
  const out = run({ stateDir, remoteUrl: registryFile('0.6.16'), force: true });
  assert.match(out, /^UPGRADE_AVAILABLE 0\.6\.15 0\.6\.16$/);
});
