import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  UpdaterService,
  compareSemver,
  isNewer,
  readLocalVersion,
  parseSha256,
} from '../updater.mjs';

function createMockPreferences(initial = {}) {
  let data = { ...initial };
  return {
    get: async () => ({ ...data }),
    set: async input => { data = { ...data, ...input }; return { ...data }; },
  };
}

test('compareSemver and isNewer handle semantic versioning rules', () => {
  assert.equal(compareSemver('0.8.7', '0.8.6'), 1);
  assert.equal(compareSemver('0.8.6', '0.8.6'), 0);
  assert.equal(compareSemver('0.8.5', '0.8.6'), -1);
  assert.equal(compareSemver('v0.9.0', '0.8.6'), 1);
  assert.equal(compareSemver('1.0.0', 'v0.9.9'), 1);
  assert.equal(compareSemver('0.8.6-beta.1', '0.8.6'), 0);
  assert.equal(compareSemver('', '0.8.6'), -1);
  assert.equal(compareSemver('0.8.6', ''), 1);

  assert.equal(isNewer('0.8.7', '0.8.6'), true);
  assert.equal(isNewer('0.8.6', '0.8.6'), false);
  assert.equal(isNewer('0.8.5', '0.8.6'), false);
  assert.equal(isNewer('v0.9.0', '0.8.6'), true);
});

test('parseSha256 extracts valid 64-char hex hashes from diverse formats', () => {
  const hash = 'ba20af42e243f37d2d8454d091ed4bb240f89ba0ed11b36a749f7e0bfda1f61f';
  assert.equal(parseSha256(`${hash}  antigrative-dashboard-0.8.6.zip\n`, 'antigrative-dashboard-0.8.6.zip'), hash);
  assert.equal(parseSha256(`${hash}\n`), hash);
  assert.equal(parseSha256(`otherhash  file.zip\n${hash}  target.zip\n`, 'target.zip'), hash);
  assert.equal(parseSha256('invalid text'), null);
});

test('readLocalVersion falls back safely when plugin manifest is missing or invalid', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'pulse-updater-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));

  assert.equal(readLocalVersion(dir), '0.8.7');
  await writeFile(join(dir, 'plugin.json'), JSON.stringify({ version: '0.8.8' }));
  assert.equal(readLocalVersion(dir), '0.8.8');
  await writeFile(join(dir, 'plugin.json'), 'invalid json');
  assert.equal(readLocalVersion(dir), '0.8.7');
});

test('UpdaterService throttles checks and respects ETag caching', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'pulse-updater-service-'));
  t.after(() => rm(dir, { recursive: true, force: true }));

  let fetchCalls = 0;
  const mockFetch = async (url, options = {}) => {
    fetchCalls++;
    if (options.headers?.['If-None-Match'] === '"etag-123"') {
      return { status: 304, headers: new Headers({ etag: '"etag-123"' }) };
    }
    return {
      status: 200,
      headers: new Headers({ etag: '"etag-123"' }),
      json: async () => ({
        tag_name: 'v0.9.0',
        name: 'Antigrative Dashboard v0.9.0',
        body: '### What is New\n- Awesome feature',
        published_at: '2026-10-14T10:00:00Z',
        assets: [
          { name: 'antigrative-dashboard-0.9.0.zip', browser_download_url: 'https://example.com/download.zip' },
          { name: 'antigrative-dashboard-0.9.0.zip.sha256', browser_download_url: 'https://example.com/download.zip.sha256' },
        ],
      }),
    };
  };

  const updater = new UpdaterService({
    pluginDir: dir,
    dataDir: dir,
    preferences: createMockPreferences(),
    fetchImpl: mockFetch,
    intervalMs: 10000,
  });

  // First check triggers remote fetch
  const release1 = await updater.check();
  assert.equal(release1.version, '0.9.0');
  assert.equal(fetchCalls, 1);

  // Second check within interval uses cache without network call
  const release2 = await updater.check();
  assert.equal(release2.version, '0.9.0');
  assert.equal(fetchCalls, 1);

  // Force check bypasses interval and uses ETag
  const release3 = await updater.check(true);
  assert.equal(release3.version, '0.9.0');
  assert.equal(fetchCalls, 2);
});

test('snapshot and ignoreUpdate behavior when a newer version is released', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'pulse-updater-snapshot-'));
  t.after(() => rm(dir, { recursive: true, force: true }));

  await writeFile(join(dir, 'plugin.json'), JSON.stringify({ version: '0.8.6' }));
  const prefs = createMockPreferences();

  const mockFetch = async () => ({
    status: 200,
    headers: new Headers({ etag: '"test"' }),
    json: async () => ({
      tag_name: 'v0.8.7',
      name: 'Release 0.8.7',
      body: 'Bug fixes',
      assets: [{ name: 'antigrative-dashboard-0.8.7.zip', browser_download_url: 'https://example.com/0.8.7.zip' }],
    }),
  });

  const updater = new UpdaterService({
    pluginDir: dir,
    dataDir: dir,
    preferences: prefs,
    fetchImpl: mockFetch,
  });

  await updater.check(true);
  let snap = await updater.snapshot();
  assert.equal(snap.hasUpdate, true);
  assert.equal(snap.latestVersion, '0.8.7');
  assert.equal(snap.currentVersion, '0.8.6');
  assert.equal(snap.ignored, false);

  // User chooses "暂不更新" (ignore version 0.8.7)
  await updater.ignore('0.8.7');
  snap = await updater.snapshot();
  assert.equal(snap.hasUpdate, false);
  assert.equal(snap.ignored, true);

  // Later, GitHub releases v0.8.8
  const mockFetchNewer = async () => ({
    status: 200,
    headers: new Headers({ etag: '"newer"' }),
    json: async () => ({
      tag_name: 'v0.8.8',
      name: 'Release 0.8.8',
      body: 'More updates',
      assets: [{ name: 'antigrative-dashboard-0.8.8.zip', browser_download_url: 'https://example.com/0.8.8.zip' }],
    }),
  });
  updater.fetchImpl = mockFetchNewer;
  await updater.check(true);

  snap = await updater.snapshot();
  // Since 0.8.8 is higher and differs from ignoredUpdateVersion ('0.8.7'), prompt again!
  assert.equal(snap.hasUpdate, true);
  assert.equal(snap.latestVersion, '0.8.8');
  assert.equal(snap.ignored, false);
});
