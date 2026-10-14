import { readFile, writeFile, mkdir, rm, mkdtemp, rename } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';

export function compareSemver(v1, v2) {
  if (!v1 && !v2) return 0;
  if (!v1) return -1;
  if (!v2) return 1;
  const parse = v => String(v).replace(/^v/i, '').trim().split('-')[0].split('.').map(n => parseInt(n, 10) || 0);
  const p1 = parse(v1), p2 = parse(v2);
  const len = Math.max(p1.length, p2.length);
  for (let i = 0; i < len; i++) {
    const n1 = p1[i] || 0, n2 = p2[i] || 0;
    if (n1 > n2) return 1;
    if (n1 < n2) return -1;
  }
  return 0;
}

export function isNewer(remote, local) {
  return compareSemver(remote, local) > 0;
}

export function readLocalVersion(pluginDir) {
  if (!pluginDir) return '0.8.6';
  try {
    const file = join(pluginDir, 'plugin.json');
    if (existsSync(file)) {
      const manifest = JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
      if (manifest.version) return String(manifest.version).replace(/^v/i, '');
    }
  } catch {}
  try {
    const pkgFile = join(pluginDir, 'package.json');
    if (existsSync(pkgFile)) {
      const pkg = JSON.parse(readFileSync(pkgFile, 'utf8').replace(/^\uFEFF/, ''));
      if (pkg.version) return String(pkg.version).replace(/^v/i, '');
    }
  } catch {}
  return '0.8.6';
}

export function parseSha256(text, expectedFilename = '') {
  if (!text) return null;
  const lines = text.trim().split(/\r?\n/);
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 2 && expectedFilename) {
      if (parts[1].endsWith(expectedFilename) && /^[0-9a-f]{64}$/i.test(parts[0])) {
        return parts[0].toLowerCase();
      }
    }
    if (parts.length === 1 && /^[0-9a-f]{64}$/i.test(parts[0])) {
      return parts[0].toLowerCase();
    }
  }
  const match = text.match(/\b([0-9a-f]{64})\b/i);
  return match ? match[1].toLowerCase() : null;
}

export function runPython(args, cwd = process.cwd()) {
  return new Promise((resolve, reject) => {
    const candidates = process.platform === 'win32' ? ['python', 'py'] : ['python3', 'python'];
    function tryNext(index) {
      if (index >= candidates.length) {
        return reject(new Error('Python interpreter not found for update extraction'));
      }
      const cmd = candidates[index];
      const child = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
      let stderr = '';
      child.stderr?.on('data', d => { stderr += d; });
      child.on('error', () => tryNext(index + 1));
      child.on('close', code => {
        if (code === 0) resolve();
        else reject(new Error(`Python process exited with code ${code}: ${stderr}`));
      });
    }
    tryNext(0);
  });
}

export class UpdaterService {
  constructor({
    pluginDir,
    dataDir,
    preferences,
    repo = 'YOU-SHOULD-KNOW-ME/antigrative-dashboard',
    fetchImpl = globalThis.fetch,
    intervalMs = 4 * 60 * 60 * 1000,
  } = {}) {
    this.pluginDir = pluginDir;
    this.dataDir = dataDir;
    this.preferences = preferences;
    this.repo = repo;
    this.fetchImpl = fetchImpl;
    this.intervalMs = intervalMs;
    this.cacheFile = dataDir ? join(dataDir, 'update-cache.json') : null;
    this.currentVersion = readLocalVersion(pluginDir);
    this.cachedData = null;
    this.checking = false;
    this.updating = false;
  }

  async loadCache() {
    if (!this.cacheFile) return null;
    try {
      const text = await readFile(this.cacheFile, 'utf8');
      this.cachedData = JSON.parse(text.replace(/^\uFEFF/, ''));
      return this.cachedData;
    } catch {
      return null;
    }
  }

  async saveCache(cache) {
    this.cachedData = cache;
    if (!this.cacheFile || !this.dataDir) return;
    try {
      await mkdir(this.dataDir, { recursive: true });
      const temp = this.cacheFile + '.' + process.pid + '.' + randomUUID() + '.tmp';
      await writeFile(temp, JSON.stringify(cache, null, 2) + '\n', 'utf8');
      await rename(temp, this.cacheFile);
    } catch {}
  }

  async check(force = false) {
    if (this.checking) return (await this.loadCache())?.release || null;
    this.checking = true;
    try {
      const cached = await this.loadCache();
      const now = Date.now();
      if (!force && cached?.checkedAt && (now - cached.checkedAt < this.intervalMs) && cached.release) {
        return cached.release;
      }

      const headers = {
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'Antigrative-Dashboard-Updater',
      };
      if (cached?.etag && !force) {
        headers['If-None-Match'] = cached.etag;
      }

      const url = `https://api.github.com/repos/${this.repo}/releases/latest`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      let res;
      try {
        res = await this.fetchImpl(url, { headers, signal: controller.signal });
      } finally {
        clearTimeout(timeout);
      }

      if (res.status === 304 && cached?.release) {
        cached.checkedAt = now;
        await this.saveCache(cached);
        return cached.release;
      }

      if (res.status === 200) {
        const data = await res.json();
        const tag = String(data.tag_name || '').trim();
        const version = tag.replace(/^v/i, '');
        const title = data.name || tag;
        const notes = data.body || '';
        const publishedAt = data.published_at || new Date().toISOString();
        const assets = Array.isArray(data.assets) ? data.assets : [];
        const zipAsset = assets.find(a => typeof a.name === 'string' && a.name.endsWith('.zip') && !a.name.includes('ide'));
        const sha256Asset = assets.find(a => typeof a.name === 'string' && a.name.endsWith('.zip.sha256') && !a.name.includes('ide'));

        const release = {
          version,
          title,
          notes,
          publishedAt,
          zipUrl: zipAsset?.browser_download_url || null,
          zipName: zipAsset?.name || `antigrative-dashboard-${version}.zip`,
          sha256Url: sha256Asset?.browser_download_url || null,
        };

        const newCache = {
          etag: res.headers.get('etag') || null,
          checkedAt: now,
          release,
        };
        await this.saveCache(newCache);
        return release;
      }

      // 403 / 429 rate limit or unexpected status: keep existing cache
      if (cached?.release) return cached.release;
      return null;
    } catch {
      // Network error / timeout: return cached if available
      const cached = await this.loadCache();
      return cached?.release || null;
    } finally {
      this.checking = false;
    }
  }

  async snapshot() {
    this.currentVersion = readLocalVersion(this.pluginDir);
    let cached = await this.loadCache();
    if (!cached && !this.checking) {
      void this.check(false);
    }
    const release = cached?.release || null;
    if (release && release.version && isNewer(release.version, this.currentVersion)) {
      let ignored = false;
      if (this.preferences) {
        try {
          const prefs = await this.preferences.get();
          if (prefs?.ignoredUpdateVersion === release.version) {
            ignored = true;
          }
        } catch {}
      }
      return {
        hasUpdate: !ignored,
        currentVersion: this.currentVersion,
        latestVersion: release.version,
        title: release.title,
        notes: release.notes,
        publishedAt: release.publishedAt,
        downloadUrl: release.zipUrl,
        ignored,
        updating: this.updating,
      };
    }
    return {
      hasUpdate: false,
      currentVersion: this.currentVersion,
      latestVersion: release?.version || this.currentVersion,
      title: null,
      notes: null,
      publishedAt: null,
      downloadUrl: null,
      ignored: false,
      updating: this.updating,
    };
  }

  async ignore(version) {
    if (!version || typeof version !== 'string') throw new Error('Invalid version to ignore');
    if (this.preferences) {
      await this.preferences.set({ ignoredUpdateVersion: version });
    }
    return { success: true, ignoredVersion: version };
  }

  async downloadFile(url, destPath) {
    const res = await this.fetchImpl(url, {
      headers: { 'User-Agent': 'Antigrative-Dashboard-Updater' },
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`Download failed with status ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    await writeFile(destPath, buffer);
  }

  async fetchSha256(url, expectedFilename = '') {
    try {
      const res = await this.fetchImpl(url, {
        headers: { 'User-Agent': 'Antigrative-Dashboard-Updater' },
        redirect: 'follow',
      });
      if (!res.ok) return null;
      const text = await res.text();
      return parseSha256(text, expectedFilename);
    } catch {
      return null;
    }
  }

  async computeSha256(filePath) {
    const content = await readFile(filePath);
    return createHash('sha256').update(content).digest('hex').toLowerCase();
  }

  async extractToPlugin(zipPath, targetDir) {
    if (!targetDir) throw new Error('Plugin target directory is required');
    const pythonScript = `
import zipfile, sys
from pathlib import Path

zip_path = sys.argv[1]
target_dir = Path(sys.argv[2])
runtime_files = {'assets', 'compat', 'sidecars', 'plugin.json'}
target_dir.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(zip_path) as archive:
    prefix = 'antigrative-dashboard/'
    for member in archive.infolist():
        name = member.filename
        if name.startswith(prefix):
            name = name[len(prefix):]
        parts = Path(name).parts
        if not parts or parts[0] not in runtime_files:
            continue
        if member.is_dir():
            continue
        dest = target_dir / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(archive.read(member))
`;
    await runPython(['-c', pythonScript, zipPath, targetDir]);
  }

  async applyUpdate() {
    if (this.updating) throw new Error('Update already in progress');
    this.updating = true;
    const tempDir = await mkdtemp(join(tmpdir(), 'ag-pulse-update-'));
    try {
      let release = (await this.loadCache())?.release;
      if (!release || !release.zipUrl) {
        release = await this.check(true);
      }
      if (!release || !release.zipUrl) {
        throw new Error('No release package available for download');
      }

      const zipName = release.zipName || `antigrative-dashboard-${release.version}.zip`;
      const zipPath = join(tempDir, zipName);
      await this.downloadFile(release.zipUrl, zipPath);

      if (release.sha256Url) {
        const expectedSha = await this.fetchSha256(release.sha256Url, zipName);
        if (expectedSha) {
          const actualSha = await this.computeSha256(zipPath);
          if (actualSha !== expectedSha) {
            throw new Error(`Checksum verification failed: expected ${expectedSha}, got ${actualSha}`);
          }
        }
      }

      await this.extractToPlugin(zipPath, this.pluginDir);
      this.currentVersion = readLocalVersion(this.pluginDir);
      return { success: true, version: release.version };
    } finally {
      this.updating = false;
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
