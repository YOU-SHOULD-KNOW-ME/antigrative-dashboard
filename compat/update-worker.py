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
import socket
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


class LocationError(ValueError):
    """A local installation/transaction path is unsafe, not a bad package."""
    pass


def canonical_directory(path):
    """Resolve relocated ancestors once; the directory itself cannot be a link."""
    path = Path(path)
    try:
        if linked(path):
            raise LocationError('Linked operation directory is unsupported')
        resolved = path.resolve(strict=True)
        if not resolved.is_dir():
            raise LocationError('Operation directory is missing')
        return resolved
    except (FileNotFoundError, NotADirectoryError, RuntimeError) as error:
        raise LocationError('Operation directory is unavailable') from error


class DirectoryAnchor:
    """Keep transaction I/O on the physical directory captured before mutation."""
    def __init__(self, path):
        self.path = canonical_directory(path)
        self.identity = self._identity(self.path)
        self.parent_identity = self._identity(self.path.parent)

    @staticmethod
    def _identity(path):
        info = path.stat()
        return (info.st_dev, info.st_ino)

    def check(self):
        try:
            if (canonical_directory(self.path) != self.path or
                    self._identity(self.path) != self.identity or
                    self._identity(self.path.parent) != self.parent_identity):
                raise LocationError('Operation directory changed')
        except (FileNotFoundError, NotADirectoryError) as error:
            raise LocationError('Operation directory changed') from error

    def record(self):
        return {'path': str(self.path), 'identity': list(self.identity),
                'parentIdentity': list(self.parent_identity)}


def overlaps(first, second):
    return first.is_relative_to(second) or second.is_relative_to(first)


def transaction_roots(target, working):
    target_anchor, working_anchor = DirectoryAnchor(target), DirectoryAnchor(working)
    if working_anchor.path.parent != target_anchor.path.parent or overlaps(working_anchor.path, target_anchor.path):
        raise LocationError('Transaction must be beside the installed plugin')
    return target_anchor, working_anchor


PRIVATE = {'data', 'history-v1', 'usage-v1', 'sdk'}
REQUIRED = ('plugin.json', 'compat/inline-widget.cjs', 'compat/runtime-ui.mjs',
            'compat/i18n.cjs', 'compat/theme.cjs', 'sidecars/panel/main.mjs',
            'sidecars/panel/metrics.mjs', 'sidecars/panel/history.mjs', 'assets/logo.svg')
MAX_ZIP = 64 * 1024 * 1024
MAX_EXPANDED = 256 * 1024 * 1024
CHECK_BUDGET = 60
API_BUDGET = 12
SOCKET_TIMEOUT = 8
NETWORK_DETAILS = frozenset({'timeout', 'dns', 'certificate', 'proxy', 'http', 'connection'})


class NetworkError(urllib.error.URLError):
    """Only static categories and an HTTP status survive network wrapping."""
    def __init__(self, detail, status=None):
        self.detail = detail if detail in NETWORK_DETAILS else 'connection'
        self.status = status if type(status) is int and 100 <= status <= 599 else None
        super().__init__(self.detail)


def network_failure(error):
    """Classify without returning URLs, proxy credentials or exception text."""
    details, pending, seen = set(), [error], set()
    while pending:
        item = pending.pop()
        if not isinstance(item, BaseException) or id(item) in seen:
            continue
        seen.add(id(item))
        if isinstance(item, NetworkError):
            details.add(item.detail)
        elif isinstance(item, ssl.SSLCertVerificationError):
            details.add('certificate')
        elif isinstance(item, (TimeoutError, socket.timeout)):
            details.add('timeout')
        elif isinstance(item, socket.gaierror):
            details.add('dns')
        elif isinstance(item, urllib.error.HTTPError):
            details.add('proxy' if item.code == 407 else 'http')
        elif isinstance(item, (urllib.error.URLError, ConnectionError, ssl.SSLError, EOFError)):
            details.add('connection')
        reason = getattr(item, 'reason', None)
        # urllib represents an HTTP CONNECT rejection as an OSError string.
        # Inspect it only to select a static category, never expose the text.
        if isinstance(item, OSError) and 'Tunnel connection failed:' in str(item):
            details.add('proxy')
        pending.extend((reason, item.__cause__, item.__context__))
    return next((detail for detail in ('certificate', 'proxy', 'dns', 'timeout', 'http', 'connection') if detail in details), None)


def update_proxies():
    """Merge Windows static settings with explicit per-scheme env overrides.

    urllib's Windows environment-or-registry selection loses the system proxy
    when the environment contains only NO_PROXY. Empty env settings still
    explicitly disable their scheme; lowercase wins as it does in urllib.
    """
    proxies = dict(urllib.request.getproxies_registry()) if os.name == 'nt' else {}
    environment = urllib.request.getproxies_environment()
    declared = {name[:-6].lower() for name in os.environ if name.lower().endswith('_proxy')}
    if 'REQUEST_METHOD' in os.environ and not any(name == 'http_proxy' for name in os.environ):
        declared.discard('http')  # Ignore the CGI HTTP_PROXY header convention.
    for scheme in declared:
        proxies.pop(scheme, None)
    proxies.update(environment)
    return proxies


def version(value):
    if not isinstance(value, str) or not re.fullmatch(r'(?:0|[1-9]\d{0,5})\.(?:0|[1-9]\d{0,5})\.(?:0|[1-9]\d{0,5})', value):
        raise ValueError('Invalid stable version')
    return tuple(map(int, value.split('.')))


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *_args):
        return None


def fetch(url, limit, destination=None, metadata=False, method='GET', progress=None, deadline=None):
    try:
        return _fetch(url, limit, destination, metadata, method, progress, deadline)
    except Exception as error:
        detail = network_failure(error)
        if detail is None:
            raise
        raise NetworkError(detail, getattr(error, 'code', None)) from error


def _fetch(url, limit, destination, metadata, method, progress, deadline):
    destination_anchor = DirectoryAnchor(destination.parent) if destination else None
    if destination_anchor:
        destination = destination_anchor.path / destination.name
    proxies = update_proxies()
    opener = urllib.request.build_opener(urllib.request.ProxyHandler(proxies), NoRedirect())
    deadline = min(deadline, time.monotonic() + 90) if deadline is not None else time.monotonic() + 90
    def remaining_timeout():
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError('Update request timed out')
        return min(SOCKET_TIMEOUT, remaining)
    compatibility = False
    def open_verified(request):
        nonlocal opener, compatibility
        try:
            return opener.open(request, timeout=remaining_timeout())
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
            opener = urllib.request.build_opener(urllib.request.ProxyHandler(proxies), NoRedirect(), urllib.request.HTTPSHandler(context=context))
            compatibility = True
            return opener.open(request, timeout=remaining_timeout())
    allowed = {'api.github.com', 'github.com', 'release-assets.githubusercontent.com',
               'objects.githubusercontent.com', 'github-releases.githubusercontent.com'}
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
            if destination_anchor:
                destination_anchor.check()
                if linked(destination):
                    raise LocationError('Linked download destination is unsupported')
            handle = destination.open('wb') if destination else None
            try:
                while True:
                    timeout = remaining_timeout()
                    # HTTPResponse.read(n) can wait for many socket reads while
                    # a slow peer keeps sending. read1 returns after one read so
                    # the shared wall deadline is checked between arrivals.
                    sock = getattr(getattr(getattr(response, 'fp', None), 'raw', None), '_sock', None)
                    if sock is not None:
                        sock.settimeout(timeout)
                    read = getattr(response, 'read1', response.read)
                    chunk = read(65536)
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


def public_release(current, deadline=None):
    """Public HTML fallback for API rate limits; no credentials are requested."""
    _, final, _ = fetch(f'https://github.com/{REPO}/releases/latest', 1048576, metadata=True, deadline=deadline)
    parsed = urllib.parse.urlsplit(final)
    prefix = f'/{REPO}/releases/tag/v'
    if parsed.hostname != 'github.com' or not parsed.path.startswith(prefix) or parsed.query:
        raise ValueError('Unexpected public release page')
    latest = parsed.path[len(prefix):]
    version(latest)
    release = {'tag_name': 'v' + latest, 'assets': []}
    if version(latest) <= version(current):
        return release
    content = html.unescape(fetch(f'https://github.com/{REPO}/releases/expanded_assets/v{latest}', 1048576, deadline=deadline).decode('utf-8'))
    name = f'antigrative-dashboard-{latest}.zip'
    base = f'https://github.com/{REPO}/releases/download/v{latest}/'
    for filename in (name, name + '.sha256'):
        path = f'/{REPO}/releases/download/v{latest}/{filename}'
        if f'href="{path}"' not in content and f'href="{base + filename}"' not in content:
            raise ValueError('Missing exact public release asset')
        _, _, length = fetch(base + filename, 0, metadata=True, method='HEAD', deadline=deadline)
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
    deadline = time.monotonic() + CHECK_BUDGET
    initial_error = None
    try:
        return json.loads(fetch(f'https://api.github.com/repos/{REPO}/releases/latest', 262144,
                                deadline=min(deadline, time.monotonic() + API_BUDGET)))
    except (urllib.error.HTTPError, NetworkError) as error:
        status = error.code if isinstance(error, urllib.error.HTTPError) else error.status
        if status is not None and status not in (403, 429):
            raise
        initial_error = error
    except (urllib.error.URLError, TimeoutError) as error:
        # The public page remains an HTTPS resource under the same repository;
        # it is also usable when a proxy cannot reach api.github.com.
        initial_error = error
    try:
        return public_release(current, deadline=deadline)
    except Exception as error:
        if initial_error is not None and network_failure(initial_error) == 'certificate' and network_failure(error):
            raise NetworkError('certificate') from error
        raise


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
        raise LocationError('Linked runtime paths are unsupported')


def stage_archive(archive, stage, expected_version):
    parent_anchor = DirectoryAnchor(stage.parent)
    if linked(stage):
        raise LocationError('Linked stage is unsupported')
    stage = parent_anchor.path / stage.name
    stage.mkdir(parents=True, exist_ok=False)
    stage_anchor = DirectoryAnchor(stage)
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
            parent_anchor.check(); stage_anchor.check()
            if not target.resolve().is_relative_to(stage.resolve()):
                raise ValueError('Archive path escaped staging')
            target.parent.mkdir(parents=True, exist_ok=True)
            check_file_targets(stage, [PurePosixPath(*relative).as_posix()])
            with bundle.open(entry) as incoming, target.open('wb') as outgoing:
                shutil.copyfileobj(incoming, outgoing, length=65536)
    manifest = json.loads((stage / 'plugin.json').read_text(encoding='utf-8-sig'))
    if manifest.get('name') != 'antigravity-pulse' or manifest.get('version') != expected_version:
        raise ValueError('Package manifest mismatch')
    if not all((stage / name).is_file() for name in REQUIRED):
        raise ValueError('Incomplete App runtime')


def validate_location(target, home=None):
    expected = (home or Path.home()) / '.gemini/config/plugins/antigravity-pulse'
    # User-owned ancestors such as .gemini may be relocated. Node also resolves
    # imported module filenames to their physical paths. Accept either spelling,
    # but reject a linked plugin root even when supplied through its real alias.
    if linked(expected) or linked(target):
        raise LocationError('Linked plugin root is unsupported')
    resolved = canonical_directory(target)
    if resolved != canonical_directory(expected):
        raise LocationError('Not the native App plugin installation')
    return resolved


def validate_target(target, home=None):
    target = validate_location(target, home)
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


def file_inventory(value):
    """Validate the public file paths used by a file-by-file transaction."""
    if not isinstance(value, list) or len(value) > 8192:
        raise ValueError('Invalid update file inventory')
    checked, seen = [], set()
    reserved = {'CON', 'PRN', 'AUX', 'NUL'} | {f'{p}{i}' for p in ('COM', 'LPT') for i in range(1, 10)}
    for name in value:
        if not isinstance(name, str) or len(name) > 4096:
            raise ValueError('Invalid update file path')
        parts = PurePosixPath(name).parts
        if (not parts or PurePosixPath(name).as_posix() != name or name.startswith('/') or
                '\\' in name or ':' in name or any(p in ('.', '..') or p.lower() in PRIVATE or
                p.rstrip(' .') != p or p.split('.')[0].upper() in reserved or
                re.search(r'[\x00-\x1f<>"|?*]', p) for p in parts) or
                not (name == 'plugin.json' or len(parts) > 1 and parts[0] in RUNTIME[:3])):
            raise ValueError('Invalid update file path')
        key = name.casefold()
        if key in seen:
            raise ValueError('Duplicate update file path')
        seen.add(key)
        checked.append(name)
    return checked


def public_files(root, names=RUNTIME):
    """Stable directories and private SDK/data trees are never file targets."""
    result = []
    for name in names:
        path = root / name
        if path.is_file():
            result.append(name)
        elif path.is_dir():
            for directory, dirs, files in os.walk(path):
                dirs[:] = [d for d in dirs if d.lower() not in PRIVATE]
                for filename in files:
                    if filename.lower() not in PRIVATE:
                        result.append((Path(directory) / filename).relative_to(root).as_posix())
                        if len(result) > 8192:
                            raise ValueError('Update file inventory exceeds budget')
    return file_inventory(sorted(result))


def check_file_targets(target, paths):
    for name in paths:
        path = target / name
        if linked(path):
            raise LocationError('Linked runtime file is unsupported')
        if path.exists() and not path.is_file():
            raise ValueError('Runtime file layout changed')
        parent = path.parent
        while parent != target:
            if linked(parent):
                raise LocationError('Linked runtime directory is unsupported')
            if parent.exists() and not parent.is_dir():
                raise ValueError('Runtime directory layout changed')
            parent = parent.parent


def restore_files(working, target, backup, original, new_files, guard=lambda: None):
    # Validate the entire inventory and every backup before mutating anything.
    for name in RUNTIME:
        reject_links(target / name)
    old_files = public_files(backup, original)
    check_file_targets(target, [*old_files, *new_files])
    for name in old_files:
        guard()
        source, destination = backup / name, target / name
        check_file_targets(target, [name])
        destination.parent.mkdir(parents=True, exist_ok=True)
        temporary = working / 'restore-file'
        shutil.copy2(source, temporary)
        guard()
        check_file_targets(target, [name])
        os.replace(temporary, destination)
    old_keys = {name.casefold() for name in old_files}
    for name in new_files:
        if name.casefold() in old_keys:
            continue
        path = target / name
        if path.exists():
            guard()
            check_file_targets(target, [name])
            path.unlink()


def recover_transaction(working, target):
    """Idempotent rollback, including after termination halfway through recovery.

    Called only while holding the lifecycle lock. Recovery snapshots stay outside
    every replaced tree. Never remove them if restoration itself fails.
    """
    if linked(working):
        raise LocationError('Linked recovery transaction is unsupported')
    if not working.exists():
        return False
    target_anchor, working_anchor = transaction_roots(target, working)
    target, working = target_anchor.path, working_anchor.path
    def guard():
        target_anchor.check(); working_anchor.check()
    reject_links(working)
    journal = working / 'journal.json'
    if not journal.exists():
        # No runtime mutation is allowed before the journal is durable.
        guard(); shutil.rmtree(working)
        return False
    try:
        value = json.loads(journal.read_text(encoding='utf-8'))
        if value.get('schema') != 1 or value.get('phase') not in ('installing', 'committed', 'restored'):
            raise ValueError('Invalid recovery journal')
        if 'target' in value and value['target'] != target_anchor.record():
            raise LocationError('Recovery belongs to a different installation')
        original = value.get('original')
        if not isinstance(original, list) or len(original) != len(set(original)) or any(n not in RUNTIME for n in original):
            raise ValueError('Invalid recovery inventory')
        version(value['current']); version(value['expected'])
        strategy = value.get('strategy', 'trees')
        if strategy not in ('trees', 'files'):
            raise ValueError('Invalid recovery strategy')
        new_files = file_inventory(value.get('newFiles')) if strategy == 'files' else []
        if value['phase'] in ('committed', 'restored'):
            guard()
            try: shutil.rmtree(working)
            except OSError: pass  # Runtime is already valid; retry cleanup later.
            return False
        backup = working / 'recovery-backup'
        for name in original:
            if not (backup / name).exists():
                raise ValueError('Recovery backup is incomplete')
        if json.loads((backup / 'plugin.json').read_text(encoding='utf-8-sig')).get('version') != value['current']:
            raise ValueError('Recovery backup version mismatch')
        if strategy == 'files':
            restore_files(working, target, backup, original, new_files, guard=guard)
            if json.loads((target / 'plugin.json').read_text(encoding='utf-8-sig')).get('version') != value['current']:
                raise ValueError('Recovered version mismatch')
            guard(); write_journal(working, {**value, 'phase': 'restored'})
            try: shutil.rmtree(working)
            except OSError: pass
            return True
        # Build each restore tree from an intact backup on every attempt. The
        # journal stays installing until every tree has been put back.
        for name in reversed(RUNTIME):
            guard()
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
            guard()
            reject_links(target / name)
            if (target / name).exists():
                os.replace(target / name, displaced)
            if restore.exists():
                os.replace(restore, target / name)
        if json.loads((target / 'plugin.json').read_text(encoding='utf-8-sig')).get('version') != value['current']:
            raise ValueError('Recovered version mismatch')
        guard(); write_journal(working, {**value, 'phase': 'restored'})
    except Exception as error:
        raise RollbackError('Recovery requires the saved backup') from error
    try: shutil.rmtree(working)
    except OSError: pass
    return True


def install_staged(stage, target, backup, current, expected, fault=None, progress=None, strategy='trees'):
    """Complete backup precedes mutation; undo every moved item on failure."""
    def report(phase):
        if progress:
            try: progress({'phase': phase})
            except Exception: pass
    target_anchor, working_anchor = transaction_roots(target, stage.parent)
    target, working = target_anchor.path, working_anchor.path
    stage_anchor = DirectoryAnchor(stage)
    stage = stage_anchor.path
    if stage.parent != working:
        raise LocationError('Stage must belong to this transaction')
    if linked(backup):
        raise LocationError('Linked backup directory is unsupported')
    backup = backup.resolve()
    if overlaps(backup, target) or overlaps(backup, working):
        raise LocationError('Backup overlaps installation or transaction')
    backup.parent.mkdir(parents=True, exist_ok=True)
    backup_parent = DirectoryAnchor(backup.parent)
    backup = backup_parent.path / backup.name
    def guard():
        target_anchor.check(); working_anchor.check(); backup_parent.check()
    for name in RUNTIME:
        reject_links(target / name)
    reject_links(stage)
    if json.loads((target / 'plugin.json').read_text(encoding='utf-8-sig'))['version'] != current or version(expected) <= version(current):
        raise ValueError('Installed version changed or update would downgrade')
    if strategy not in ('trees', 'files'):
        raise ValueError('Unsupported update strategy')
    new_files = public_files(stage) if strategy == 'files' else []
    old_files = public_files(target) if strategy == 'files' else []
    if strategy == 'files':
        check_file_targets(target, new_files)
    report('backup')
    guard(); stage_anchor.check()
    backup.mkdir(parents=True, exist_ok=False)
    backup_anchor = DirectoryAnchor(backup)
    for name in RUNTIME:
        guard(); backup_anchor.check(); reject_links(target / name)
        old = target / name
        if old.is_dir():
            shutil.copytree(old, backup / name)
        elif old.is_file():
            shutil.copy2(old, backup / name)
    # Self-contained recovery helper remains available even if the App entry
    # point was interrupted while moving. It never relies on the new runtime.
    guard(); backup_anchor.check()
    shutil.copy2(Path(__file__), working / 'recover.py')
    shutil.copy2(Path(__file__).with_name('update-lock.py'), working / 'update-lock.py')
    shutil.copytree(backup, working / 'recovery-backup')
    if strategy == 'files':
        journal = {'schema': 1, 'current': current, 'expected': expected,
                   'original': [name for name in RUNTIME if (target / name).exists()],
                   'strategy': 'files', 'newFiles': new_files, 'phase': 'installing', 'target': target_anchor.record()}
        write_journal(working, journal)
        try:
            report('install')
            # A cmd.exe parent created by the host can keep panel's directory
            # handle open even after Node changes cwd. Replace public files
            # atomically while keeping all directory identities stable.
            for name in RUNTIME:
                if fault:
                    fault(name)
                guard(); stage_anchor.check(); reject_links(target / name)
                for item in new_files:
                    if PurePosixPath(item).parts[0] != name:
                        continue
                    destination = target / item
                    guard()
                    check_file_targets(target, [item])
                    check_file_targets(stage, [item])
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    check_file_targets(target, [item])
                    os.replace(stage / item, destination)
                new_keys = {item.casefold() for item in new_files}
                for item in old_files:
                    if item.casefold() in new_keys:
                        continue
                    if PurePosixPath(item).parts[0] == name:
                        guard()
                        check_file_targets(target, [item])
                        (target / item).unlink()
            if json.loads((target / 'plugin.json').read_text(encoding='utf-8-sig'))['version'] != expected:
                raise ValueError('Installed version verification failed')
            guard(); write_journal(working, {**journal, 'phase': 'committed'})
        except BaseException:
            report('recover')
            recover_transaction(working, target)
            raise
        return
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
               'original': [name for name in RUNTIME if (target / name).exists()], 'phase': 'installing', 'target': target_anchor.record()}
    write_journal(working, journal)
    moved, inserted = [], []
    try:
        report('install')
        for name in RUNTIME:
            guard(); reject_links(target / name)
            old, new = target / name, stage / name
            if old.exists():
                os.replace(old, holding / name)
                moved.append(name)
            if fault:
                fault(name)
            guard()
            if new.exists():
                os.replace(new, old)
                inserted.append(name)
        if json.loads((target / 'plugin.json').read_text(encoding='utf-8-sig'))['version'] != expected:
            raise ValueError('Installed version verification failed')
        guard(); write_journal(working, {**journal, 'phase': 'committed'})
    except BaseException:
        try:
            for name in reversed(inserted):
                guard(); reject_links(target / name)
                os.replace(target / name, stage / name)
            for name in reversed(moved):
                guard(); reject_links(target / name)
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
    target_anchor = DirectoryAnchor(target)
    target = target_anchor.path
    if linked(updates):
        raise LocationError('Linked update directory is unsupported')
    updates = updates.resolve()
    working = target.parent / '.antigravity-pulse-update-transaction'
    if updates.is_relative_to(target):
        # Older SDKs keep data inside sidecars/panel/data. Backing up the runtime
        # into that directory recursively copies the backup into itself. Keep
        # only backups beside the installed plugin; private data stays in place.
        updates = target.parent / '.antigravity-pulse-update-backups'
        if linked(updates):
            raise LocationError('Linked backup root is unsupported')
    if overlaps(updates, working) or target.is_relative_to(updates):
        raise LocationError('Update directory overlaps managed paths')
    # Reconstruct and validate the plan rather than trusting persisted URLs.
    latest = plan['latestVersion']
    name = f'antigrative-dashboard-{latest}.zip'
    base = f'https://github.com/{REPO}/releases/download/v{latest}/'
    if plan.get('host') != 'app' or plan.get('currentVersion') != current or plan.get('name') != name or plan.get('url') != base + name or plan.get('checksumUrl') != base + name + '.sha256' or version(latest) <= version(current):
        raise ValueError('Update plan is stale or invalid')
    updates.mkdir(parents=True, exist_ok=True)
    updates_anchor = DirectoryAnchor(updates)
    updates = updates_anchor.path
    with lifecycle_lock(target):
        target_anchor.check(); updates_anchor.check()
        recover_transaction(working, target)
        # Validate again under the cross-process lock, immediately before use.
        if validate_target(target) != current:
            raise ValueError('Installed version changed')
        working.mkdir()
        working_anchor = DirectoryAnchor(working)
        try:
            archive = working / name
            report('verify')
            working_anchor.check()
            expected_hash = checksum(fetch(plan['checksumUrl'], 8192).decode('utf-8'), name)
            report('download', received=0, total=plan.get('size'))
            working_anchor.check()
            options = {'progress': lambda count: report('download', received=count, total=plan.get('size'))} if progress else {}
            received = fetch(plan['url'], MAX_ZIP, archive, **options)
            report('verify')
            working_anchor.check()
            if received != plan.get('size') or digest(archive) != expected_hash:
                raise ValueError('Archive checksum or size mismatch')
            stage = working / 'stage'
            report('extract')
            target_anchor.check(); updates_anchor.check(); working_anchor.check()
            stage_archive(archive, stage, latest)
            if validate_target(target) != current:
                raise ValueError('Installed version changed')
            backup = updates / ('backup-' + str(uuid.uuid4()))
            install_staged(stage, target, backup, current, latest, progress=progress,
                           strategy='files' if os.name == 'nt' else 'trees')
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
        # Pin the verified native installation to its physical root. Relocated
        # user-owned ancestors may be links; runtime/transaction roots may not.
        args.target = validate_location(args.target)
        with lifecycle_lock(args.target):
            working = args.target.parent / '.antigravity-pulse-update-transaction'
            if linked(working):
                raise LocationError('Linked recovery transaction is unsupported')
            recovered = False
            if args.action == 'recover':
                recovered = recover_transaction(working, args.target)
            elif args.action == 'check' and (working / 'journal.json').exists():
                # Checks have a short cancellable subprocess timeout. Never
                # restore files in that process; the durable helper can recover
                # independently even when the host entry point is missing.
                reject_links(working)
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
        detail = 'install-location' if isinstance(error, LocationError) else 'permission' if isinstance(error, PermissionError) else network_failure(error)
        code = 'location' if isinstance(error, LocationError) else 'rollback' if isinstance(error, RollbackError) else 'network' if detail in NETWORK_DETAILS else 'busy' if isinstance(error, FileExistsError) else 'verification' if isinstance(error, ValueError) else 'install'
        print(json.dumps({'ok': False, 'code': code, **({'detail': detail} if detail else {})}))
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
