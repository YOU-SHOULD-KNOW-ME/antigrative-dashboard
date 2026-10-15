"""Manual App-only updater: bounded HTTPS, exact asset identity, safe ZIP staging.

This worker never edits the host application, account config or usage ledger.
"""
import argparse
import hashlib
import html
import importlib.util
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import ssl
import stat
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
import zipfile

_lock_spec = importlib.util.spec_from_file_location('pulse_update_lock', Path(__file__).with_name('update-lock.py'))
_lock_module = importlib.util.module_from_spec(_lock_spec)
_lock_spec.loader.exec_module(_lock_module)
lifecycle_lock, linked = _lock_module.lifecycle_lock, _lock_module.linked

REPO = 'YOU-SHOULD-KNOW-ME/antigrative-dashboard'
RUNTIME = ('assets', 'compat', 'sidecars', 'plugin.json')
class RollbackError(RuntimeError):
    pass


PRIVATE = {'data', 'history-v1', 'usage-v1', 'sdk'}
REQUIRED = ('plugin.json', 'compat/inline-widget.cjs', 'compat/runtime-ui.mjs',
            'compat/i18n.cjs', 'compat/theme.cjs', 'sidecars/panel/main.mjs',
            'sidecars/panel/metrics.mjs', 'sidecars/panel/history.mjs', 'assets/logo.svg')
MAX_ZIP = 64 * 1024 * 1024
MAX_EXPANDED = 256 * 1024 * 1024


def version(value):
    if not isinstance(value, str) or not re.fullmatch(r'(?:0|[1-9]\d{0,5})\.(?:0|[1-9]\d{0,5})\.(?:0|[1-9]\d{0,5})', value):
        raise ValueError('Invalid stable version')
    return tuple(map(int, value.split('.')))


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *_args):
        return None


def fetch(url, limit, destination=None, metadata=False, method='GET', progress=None):
    opener = urllib.request.build_opener(NoRedirect())  # Retains configured proxy support.
    compatibility = False
    def open_verified(request):
        nonlocal opener, compatibility
        try:
            return opener.open(request, timeout=8)
        except urllib.error.URLError as error:
            reason = error.reason
            # Some local TLS interception proxies fail the initial TLS 1.3
            # handshake. Retry once with TLS 1.2 while retaining trusted CA and
            # hostname verification. Certificate failures are never retried.
            retryable = isinstance(reason, (ssl.SSLError, EOFError, ConnectionResetError, FileNotFoundError))
            if compatibility or isinstance(error, urllib.error.HTTPError) or isinstance(reason, ssl.SSLCertVerificationError) or not retryable:
                raise
            context = ssl.create_default_context()
            context.maximum_version = ssl.TLSVersion.TLSv1_2
            opener = urllib.request.build_opener(NoRedirect(), urllib.request.HTTPSHandler(context=context))
            compatibility = True
            return opener.open(request, timeout=8)
    allowed = {'api.github.com', 'github.com', 'release-assets.githubusercontent.com',
               'objects.githubusercontent.com', 'github-releases.githubusercontent.com'}
    deadline = time.monotonic() + 90
    for _ in range(5):
        parsed = urllib.parse.urlsplit(url)
        if parsed.scheme != 'https' or parsed.hostname not in allowed or parsed.username or parsed.password or parsed.port not in (None, 443):
            raise ValueError('Untrusted update URL')
        req = urllib.request.Request(url, headers={'User-Agent': 'Antigrative-Dashboard-Updater', 'Accept': 'application/vnd.github+json'}, method=method)
        try:
            response = open_verified(req)
        except urllib.error.HTTPError as error:
            if error.code in (301, 302, 303, 307, 308) and error.headers.get('Location'):
                url = urllib.parse.urljoin(url, error.headers['Location'])
                continue
            raise
        with response:
            total = 0
            reported_at = time.monotonic()
            chunks = []
            handle = destination.open('wb') if destination else None
            try:
                while True:
                    if time.monotonic() > deadline:
                        raise TimeoutError('Update download timed out')
                    chunk = response.read(65536)
                    if not chunk:
                        break
                    total += len(chunk)
                    if total > limit:
                        raise ValueError('Update response exceeds budget')
                    if handle:
                        handle.write(chunk)
                    else:
                        chunks.append(chunk)
                    if progress and time.monotonic() - reported_at >= 0.15:
                        try: progress(total)
                        except Exception: pass  # Feedback cannot fail a verified operation.
                        reported_at = time.monotonic()
            finally:
                if handle:
                    handle.close()
            data = total if destination else b''.join(chunks)
            if progress:
                try: progress(total)
                except Exception: pass
            return (data, url, response.headers.get('Content-Length')) if metadata else data
    raise ValueError('Too many update redirects')


def public_release(current):
    """Public HTML fallback for API rate limits; no credentials are requested."""
    _, final, _ = fetch(f'https://github.com/{REPO}/releases/latest', 1048576, metadata=True)
    parsed = urllib.parse.urlsplit(final)
    prefix = f'/{REPO}/releases/tag/v'
    if parsed.hostname != 'github.com' or not parsed.path.startswith(prefix) or parsed.query:
        raise ValueError('Unexpected public release page')
    latest = parsed.path[len(prefix):]
    version(latest)
    release = {'tag_name': 'v' + latest, 'assets': []}
    if version(latest) <= version(current):
        return release
    content = html.unescape(fetch(f'https://github.com/{REPO}/releases/expanded_assets/v{latest}', 1048576).decode('utf-8'))
    name = f'antigrative-dashboard-{latest}.zip'
    base = f'https://github.com/{REPO}/releases/download/v{latest}/'
    for filename in (name, name + '.sha256'):
        path = f'/{REPO}/releases/download/v{latest}/{filename}'
        if f'href="{path}"' not in content and f'href="{base + filename}"' not in content:
            raise ValueError('Missing exact public release asset')
        _, _, length = fetch(base + filename, 0, metadata=True, method='HEAD')
        release['assets'].append({'name': filename, 'browser_download_url': base + filename,
                                  'size': int(length) if length and length.isdigit() else None})
    return release


def release_plan(release, current, host='app'):
    version(current)
    if host != 'app':
        raise ValueError('This updater supports Antigravity App only')
    tag = release.get('tag_name', '')
    if not isinstance(tag, str) or not tag.startswith('v') or release.get('draft') or release.get('prerelease'):
        raise ValueError('Not a stable public release')
    latest = tag[1:]
    newer = version(latest) > version(current)
    result = {'currentVersion': current, 'latestVersion': latest, 'host': 'app', 'hasUpdate': newer}
    if not newer:
        return result
    name = f'antigrative-dashboard-{latest}.zip'
    assets = release.get('assets', [])
    matched = [a for a in assets if a.get('name') == name]
    hashes = [a for a in assets if a.get('name') == name + '.sha256']
    if len(matched) != 1 or len(hashes) != 1:
        raise ValueError('Exact App archive and checksum are required')
    base = f'https://github.com/{REPO}/releases/download/{tag}/'
    if matched[0].get('browser_download_url') != base + name or hashes[0].get('browser_download_url') != base + name + '.sha256':
        raise ValueError('Asset identity mismatch')
    size = matched[0].get('size')
    if type(size) is not int or not 0 < size <= MAX_ZIP:
        raise ValueError('Invalid archive size')
    notes = release.get('body') or ''
    if not isinstance(notes, str):
        notes = ''
    result.update(name=name, url=base + name, checksumUrl=base + name + '.sha256', size=size,
                  notes=re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\u202a-\u202e\u2066-\u2069]', '', notes)[:1800])
    return result


def latest_release(current):
    try:
        return json.loads(fetch(f'https://api.github.com/repos/{REPO}/releases/latest', 262144))
    except urllib.error.HTTPError as error:
        if error.code not in (403, 429):
            raise
    except (urllib.error.URLError, TimeoutError):
        # The public page remains an HTTPS resource under the same repository;
        # it is also usable when a proxy cannot reach api.github.com.
        pass
    return public_release(current)


def checksum(text, name):
    matches = []
    for line in text.splitlines():
        parts = line.strip().split()
        if len(parts) == 1 and re.fullmatch(r'[a-fA-F0-9]{64}', parts[0]):
            matches.append(parts[0].lower())
        elif len(parts) == 2 and parts[1].lstrip('*') == name and re.fullmatch(r'[a-fA-F0-9]{64}', parts[0]):
            matches.append(parts[0].lower())
    if len(matches) != 1:
        raise ValueError('Missing or ambiguous archive checksum')
    return matches[0]


def digest(file):
    result = hashlib.sha256()
    with file.open('rb') as handle:
        for chunk in iter(lambda: handle.read(65536), b''):
            result.update(chunk)
    return result.hexdigest()


def reject_links(path):
    if linked(path) or path.is_dir() and any(linked(p) for p in path.rglob('*')):
        raise ValueError('Linked runtime paths are unsupported')


def stage_archive(archive, stage, expected_version):
    stage.mkdir(parents=True, exist_ok=False)
    with zipfile.ZipFile(archive) as bundle:
        entries = bundle.infolist()
        if len(entries) > 8192 or sum(e.file_size for e in entries) > MAX_EXPANDED:
            raise ValueError('Expanded archive exceeds budget')
        seen = set()
        for entry in entries:
            name = entry.orig_filename
            parts = PurePosixPath(name).parts
            reserved = {'CON', 'PRN', 'AUX', 'NUL'} | {f'{p}{i}' for p in ('COM', 'LPT') for i in range(1, 10)}
            invalid_part = any(p.rstrip(' .') != p or p.split('.')[0].upper() in reserved or re.search(r'[\x00-\x1f<>"|?*]', p) for p in parts)
            if '\\' in name or ':' in name or '\x00' in name or not parts or name.startswith('/') or '..' in parts or invalid_part:
                raise ValueError('Unsafe archive path')
            key = '/'.join(parts).casefold()
            if key in seen:
                raise ValueError('Duplicate archive path')
            seen.add(key)
            mode = entry.external_attr >> 16
            if stat.S_ISLNK(mode) or stat.S_IFMT(mode) not in (0, stat.S_IFREG, stat.S_IFDIR):
                raise ValueError('Unsupported archive entry')
            if parts[0] != 'antigrative-dashboard':
                raise ValueError('Unexpected archive root')
            relative = parts[1:]
            if not relative or relative[0] not in RUNTIME or entry.is_dir():
                continue
            if any(part in PRIVATE for part in relative):
                raise ValueError('Package must not contain private runtime data')
            target = stage.joinpath(*relative)
            if not target.resolve().is_relative_to(stage.resolve()):
                raise ValueError('Archive path escaped staging')
            target.parent.mkdir(parents=True, exist_ok=True)
            with bundle.open(entry) as incoming, target.open('wb') as outgoing:
                shutil.copyfileobj(incoming, outgoing, length=65536)
    manifest = json.loads((stage / 'plugin.json').read_text(encoding='utf-8-sig'))
    if manifest.get('name') != 'antigravity-pulse' or manifest.get('version') != expected_version:
        raise ValueError('Package manifest mismatch')
    if not all((stage / name).is_file() for name in REQUIRED):
        raise ValueError('Incomplete App runtime')


def validate_location(target, home=None):
    expected = (home or Path.home()) / '.gemini/config/plugins/antigravity-pulse'
    if linked(target) or target.resolve() != expected.resolve() or target.absolute() != expected.absolute():
        raise ValueError('Not the native App plugin installation')
    for path in (target.parent, target.parent.parent, target.parent.parent.parent):
        if linked(path):
            raise ValueError('Linked installation roots are unsupported')


def validate_target(target, home=None):
    validate_location(target, home)
    manifest = json.loads((target / 'plugin.json').read_text(encoding='utf-8-sig'))
    if manifest.get('name') != 'antigravity-pulse':
        raise ValueError('Wrong installed plugin identity')
    version(manifest.get('version'))
    for name in RUNTIME:
        reject_links(target / name)
    return manifest['version']


def write_journal(working, value):
    temporary = working / 'journal.tmp'
    with temporary.open('w', encoding='utf-8') as handle:
        json.dump(value, handle)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, working / 'journal.json')


def recover_transaction(working, target):
    """Idempotent rollback, including after termination halfway through recovery.

    Called only while holding the lifecycle lock. Recovery snapshots stay outside
    every replaced tree. Never remove them if restoration itself fails.
    """
    if not working.exists():
        return False
    reject_links(working)
    journal = working / 'journal.json'
    if not journal.exists():
        # No runtime mutation is allowed before the journal is durable.
        shutil.rmtree(working)
        return False
    try:
        value = json.loads(journal.read_text(encoding='utf-8'))
        if value.get('schema') != 1 or value.get('phase') not in ('installing', 'committed', 'restored'):
            raise ValueError('Invalid recovery journal')
        original = value.get('original')
        if not isinstance(original, list) or len(original) != len(set(original)) or any(n not in RUNTIME for n in original):
            raise ValueError('Invalid recovery inventory')
        version(value['current']); version(value['expected'])
        if value['phase'] in ('committed', 'restored'):
            try: shutil.rmtree(working)
            except OSError: pass  # Runtime is already valid; retry cleanup later.
            return False
        backup = working / 'recovery-backup'
        for name in original:
            if not (backup / name).exists():
                raise ValueError('Recovery backup is incomplete')
        if json.loads((backup / 'plugin.json').read_text(encoding='utf-8-sig')).get('version') != value['current']:
            raise ValueError('Recovery backup version mismatch')
        # Build each restore tree from an intact backup on every attempt. The
        # journal stays installing until every tree has been put back.
        for name in reversed(RUNTIME):
            reject_links(target / name)
            restore = working / ('restore-' + name)
            displaced = working / ('displaced-' + name)
            for path in (restore, displaced):
                if path.is_dir(): shutil.rmtree(path)
                elif path.exists(): path.unlink()
            source = backup / name
            if name in original:
                if source.is_dir(): shutil.copytree(source, restore)
                else: shutil.copy2(source, restore)
            if (target / name).exists():
                os.replace(target / name, displaced)
            if restore.exists():
                os.replace(restore, target / name)
        if json.loads((target / 'plugin.json').read_text(encoding='utf-8-sig')).get('version') != value['current']:
            raise ValueError('Recovered version mismatch')
        write_journal(working, {**value, 'phase': 'restored'})
    except Exception as error:
        raise RollbackError('Recovery requires the saved backup') from error
    try: shutil.rmtree(working)
    except OSError: pass
    return True


def install_staged(stage, target, backup, current, expected, fault=None, progress=None):
    """Complete backup precedes mutation; undo every moved item on failure."""
    def report(phase):
        if progress:
            try: progress({'phase': phase})
            except Exception: pass
    if json.loads((target / 'plugin.json').read_text(encoding='utf-8-sig'))['version'] != current or version(expected) <= version(current):
        raise ValueError('Installed version changed or update would downgrade')
    if not stage.resolve().parent.is_relative_to(target.parent.resolve()):
        raise ValueError('Stage must be on the target filesystem')
    report('backup')
    backup.mkdir(parents=True, exist_ok=False)
    for name in RUNTIME:
        old = target / name
        if old.is_dir():
            shutil.copytree(old, backup / name)
        elif old.is_file():
            shutil.copy2(old, backup / name)
    # Self-contained recovery helper remains available even if the App entry
    # point was interrupted while moving. It never relies on the new runtime.
    working = stage.parent
    shutil.copy2(Path(__file__), working / 'recover.py')
    shutil.copy2(Path(__file__).with_name('update-lock.py'), working / 'update-lock.py')
    shutil.copytree(backup, working / 'recovery-backup')
    # Preserve old sidecar-local preferences/statistics if an older installer
    # stored them inside its runtime instead of the current external data root.
    for name in RUNTIME[:3]:
        old = target / name
        if old.is_dir():
            for directory, dirs, _ in os.walk(old):
                for item in list(dirs):
                    if item in PRIVATE:
                        p = Path(directory) / item
                        shutil.copytree(p, stage / p.relative_to(target), dirs_exist_ok=True)
                        dirs.remove(item)
    holding = stage.parent / 'previous'
    holding.mkdir()
    journal = {'schema': 1, 'current': current, 'expected': expected,
               'original': [name for name in RUNTIME if (target / name).exists()], 'phase': 'installing'}
    write_journal(working, journal)
    moved, inserted = [], []
    try:
        report('install')
        for name in RUNTIME:
            old, new = target / name, stage / name
            if old.exists():
                os.replace(old, holding / name)
                moved.append(name)
            if fault:
                fault(name)
            if new.exists():
                os.replace(new, old)
                inserted.append(name)
        if json.loads((target / 'plugin.json').read_text(encoding='utf-8-sig'))['version'] != expected:
            raise ValueError('Installed version verification failed')
        write_journal(working, {**journal, 'phase': 'committed'})
    except BaseException:
        try:
            for name in reversed(inserted):
                os.replace(target / name, stage / name)
            for name in reversed(moved):
                os.replace(holding / name, target / name)
            write_journal(working, {**journal, 'phase': 'restored'})
        except Exception as recovery:
            raise RollbackError('Recovery requires the saved backup') from recovery
        raise


def perform(plan, target, updates, progress=None):
    def report(phase, **fields):
        if progress:
            try: progress({'phase': phase, **fields})
            except Exception: pass
    current = validate_target(target)
    # Reconstruct and validate the plan rather than trusting persisted URLs.
    latest = plan['latestVersion']
    name = f'antigrative-dashboard-{latest}.zip'
    base = f'https://github.com/{REPO}/releases/download/v{latest}/'
    if plan.get('host') != 'app' or plan.get('currentVersion') != current or plan.get('name') != name or plan.get('url') != base + name or plan.get('checksumUrl') != base + name + '.sha256' or version(latest) <= version(current):
        raise ValueError('Update plan is stale or invalid')
    updates.mkdir(parents=True, exist_ok=True)
    with lifecycle_lock(target):
        working = target.parent / '.antigravity-pulse-update-transaction'
        recover_transaction(working, target)
        # Validate again under the cross-process lock, immediately before use.
        if validate_target(target) != current:
            raise ValueError('Installed version changed')
        working.mkdir()
        try:
            archive = working / name
            report('verify')
            expected_hash = checksum(fetch(plan['checksumUrl'], 8192).decode('utf-8'), name)
            report('download', received=0, total=plan.get('size'))
            options = {'progress': lambda count: report('download', received=count, total=plan.get('size'))} if progress else {}
            received = fetch(plan['url'], MAX_ZIP, archive, **options)
            report('verify')
            if received != plan.get('size') or digest(archive) != expected_hash:
                raise ValueError('Archive checksum or size mismatch')
            stage = working / 'stage'
            report('extract')
            stage_archive(archive, stage, latest)
            backup = updates / ('backup-' + str(uuid.uuid4()))
            install_staged(stage, target, backup, current, latest, progress=progress)
            result = {'version': latest, 'backup': str(backup), 'verified': True, 'reloadRequired': True}
        except RollbackError:
            # Preserve both the journal and previous runtime for manual retry.
            raise
        except BaseException:
            if (working / 'journal.json').exists(): report('recover')
            recover_transaction(working, target)
            raise
        recover_transaction(working, target)  # Committed: clean staging only.
        report('complete')
        return result


def emit_progress(value):
    try:
        print(json.dumps({'event': 'pulse-update-progress', **value}, ensure_ascii=True), file=sys.stderr, flush=True)
    except (OSError, ValueError):
        pass


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['check', 'apply', 'recover'])
    parser.add_argument('--target', required=True, type=Path)
    parser.add_argument('--plan', type=Path)
    parser.add_argument('--updates', type=Path)
    args = parser.parse_args()
    try:
        # Validate destination identity lexically even if an interrupted rename
        # temporarily left the manifest absent. Recovery must not follow a link.
        validate_location(args.target)
        with lifecycle_lock(args.target):
            working = args.target.parent / '.antigravity-pulse-update-transaction'
            recovered = False
            if args.action == 'recover':
                recovered = recover_transaction(working, args.target)
            elif args.action == 'check' and (working / 'journal.json').exists():
                # Checks have a short cancellable subprocess timeout. Never
                # restore files in that process; the durable helper can recover
                # independently even when the host entry point is missing.
                journal = json.loads((working / 'journal.json').read_text(encoding='utf-8'))
                if journal.get('phase') not in ('committed', 'restored'):
                    raise RollbackError('Interrupted update requires recovery')
        current = validate_target(args.target)
        if args.action == 'recover':
            result = {'version': current, 'recovered': recovered}
        elif args.action == 'check':
            release = latest_release(current)
            result = release_plan(release, current)
        else:
            if not args.plan or not args.updates:
                raise ValueError('Update job paths required')
            text = args.plan.read_text(encoding='utf-8')
            if len(text) > 8192:
                raise ValueError('Update plan exceeds budget')
            result = perform(json.loads(text), args.target, args.updates, progress=emit_progress)
        print(json.dumps({'ok': True, 'result': result}, ensure_ascii=True))
    except Exception as error:
        # Only static error categories cross into the renderer, never proxy
        # credentials, paths, HTTP response text or helper tracebacks.
        code = 'rollback' if isinstance(error, RollbackError) else 'network' if isinstance(error, (urllib.error.URLError, TimeoutError)) else 'busy' if isinstance(error, FileExistsError) else 'verification' if isinstance(error, ValueError) else 'install'
        print(json.dumps({'ok': False, 'code': code}))
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
