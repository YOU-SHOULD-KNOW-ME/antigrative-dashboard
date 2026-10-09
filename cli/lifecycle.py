"""Independent, reversible CLI statusLine installation. No desktop mutation."""
import json
import base64
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import tempfile
from contextlib import contextmanager

NAME = 'antigrative-dashboard-cli'


def read(file):
    if not file.exists():
        return {}
    value = json.loads(file.read_text(encoding='utf-8-sig'))
    if not isinstance(value, dict):
        raise RuntimeError('CLI configuration must be a JSON object.')
    return value


def write(file, value):
    file.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=file.name + '.', suffix='.tmp', dir=file.parent)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as stream:
            json.dump(value, stream, ensure_ascii=False, indent=2)
            stream.write('\n')
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, file)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def paths(home):
    base = Path(home) / '.gemini' / 'antigravity-cli'
    return base, base / 'settings.json', base / 'antigrative-dashboard', base / '.antigrative-dashboard-install.json'


def regular(path):
    # Includes Windows junctions (is_symlink alone does not cover them).
    if path.is_symlink() or (path.exists() and path.resolve() != path.absolute()):
        raise RuntimeError('CLI installation paths must not contain symlinks or junctions.')


def verify_root(root):
    regular(root)
    if root.exists():
        if read(root / 'installation.json').get('name') != NAME:
            raise RuntimeError('CLI destination is not our installation; refusing to overwrite it.')
        for child in root.rglob('*'):
            regular(child)


@contextmanager
def locked(base):
    regular(base)
    base.mkdir(parents=True, exist_ok=True)
    lock = base / '.antigrative-dashboard.lock'
    try:
        fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError:
        raise RuntimeError('Another CLI lifecycle operation is active. If a prior operation crashed, inspect and remove .antigrative-dashboard.lock before retrying.')
    try:
        os.close(fd)
        yield
    finally:
        lock.unlink()


def command(node, script, language=None, platform=None):
    platform = platform or os.sys.platform
    values = [str(node), str(script)]
    if platform == 'win32':
        if language and language not in ('en', 'zh-CN'):
            raise RuntimeError('Language must be en or zh-CN.')
        if any(any(char in value for char in '\r\n\x00') for value in values):
            raise RuntimeError('Node/home path contains unsupported control characters.')
        # agy's Go cmd.exe runner escapes quotes in a multi-argument command.
        # A quote-free encoded invocation avoids both that transport and CMD's
        # percent/delayed expansion. Paths remain literal PowerShell strings.
        literal = lambda value: "'" + value.replace("'", "''") + "'"
        invocation = ' & ' + ' '.join(literal(value) for value in values)
        if language:
            invocation += ' --language ' + language
        script = ('[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false); '
                  '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false);'
                  + invocation + '; exit $LASTEXITCODE')
        encoded = base64.b64encode(script.encode('utf-16-le')).decode('ascii')
        return 'powershell.exe -NoProfile -NonInteractive -EncodedCommand ' + encoded
    else:
        result = ' '.join(shlex.quote(value) for value in values)
    if language:
        if language not in ('en', 'zh-CN'):
            raise RuntimeError('Language must be en or zh-CN.')
        result += ' --language ' + language
    return result


def node_path(node=None):
    found = shutil.which(str(node or 'node'))
    if not found:
        raise RuntimeError('Node.js 20+ is required on PATH, or pass --node /absolute/path/to/node.')
    result = subprocess.run([found, '--version'], capture_output=True, text=True, check=True)
    try:
        major = int(result.stdout.strip().lstrip('v').split('.')[0])
    except ValueError:
        raise RuntimeError('The specified executable did not report a Node.js version.')
    if major < 20:
        raise RuntimeError('Node.js 20+ is required.')
    return Path(found).resolve()


def owns(current, state):
    return (state.get('name') == NAME and state.get('schema') == 1 and isinstance(current, dict)
            and current.get('type') == 'command' and isinstance(current.get('command'), str)
            and current['command'] in state.get('commands', [state.get('command')]))


def install(source, home, node=None, language=None):
    node = node_path(node)
    base, settings, root, backup = paths(home)
    installed_command = command(node, root / 'cli' / 'statusline.mjs', language)
    with locked(base):
        regular(settings)
        regular(backup)
        verify_root(root)
        before = settings.read_bytes() if settings.exists() else None
        config, state = read(settings), read(backup)
        current = config.get('statusLine')
        if root.exists() and (state.get('name') != NAME or state.get('schema') != 1):
            raise RuntimeError('CLI recovery record is missing or invalid; refusing to overwrite the installation.')
        owned = owns(current, state)
        if not owned:
            state = {'name': NAME, 'schema': 1, 'previousPresent': 'statusLine' in config, 'previous': current}
        elif state.get('name') != NAME or state.get('schema') != 1:
            raise RuntimeError('CLI recovery record has an incompatible shape.')
        # Save recovery BEFORE changing the setting, retaining prior backup on upgrades.
        state['commands'] = list(dict.fromkeys(([current['command']] if owned else []) + [installed_command]))
        state['command'] = installed_command
        write(backup, state)
        root.mkdir(parents=True, exist_ok=True)
        write(root / 'installation.json', {'name': NAME, 'schema': 1})
        for name in ('cli/metrics.mjs', 'cli/render.mjs', 'cli/statusline.mjs', 'compat/platform.mjs', 'compat/preferences.mjs'):
            target = root / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(Path(source) / name, target)
        if (settings.read_bytes() if settings.exists() else None) != before:
            raise RuntimeError('CLI settings changed during installation; retry without overwriting concurrent edits.')
        config['statusLine'] = {**(current if owned else {}), 'type': 'command', 'command': installed_command, 'enabled': True}
        write(settings, config)
    print('CLI status line installed:', root)
    print('Reopen agy to load it. Desktop installation and statistics are unchanged.')


def uninstall(home):
    base, settings, root, backup = paths(home)
    if not root.exists() and not backup.exists():
        print('CLI status line is not installed.')
        return
    with locked(base):
        regular(settings)
        regular(backup)
        verify_root(root)
        before = settings.read_bytes() if settings.exists() else None
        state, config = read(backup), read(settings)
        if state.get('name') != NAME or state.get('schema') != 1:
            raise RuntimeError('Missing or invalid CLI recovery record; refusing to remove runtime.')
        current = config.get('statusLine')
        if owns(current, state):
            if state.get('previousPresent'):
                config['statusLine'] = state.get('previous')
            else:
                config.pop('statusLine', None)
            if (settings.read_bytes() if settings.exists() else None) != before:
                raise RuntimeError('CLI settings changed during uninstall; retry without overwriting concurrent edits.')
            write(settings, config)
        # Preserve a replacement configured by the user after installation.
        if root.exists():
            resolved = root.resolve()
            if resolved.parent != base.resolve() or resolved.name != 'antigrative-dashboard':
                raise RuntimeError('CLI removal target is outside its expected directory.')
            shutil.rmtree(resolved)
        backup.unlink(missing_ok=True)
    print('CLI adapter removed; prior statusLine restored if still owned. Reopen agy.')


def status(home):
    _, settings, root, backup = paths(home)
    state, config = read(backup), read(settings)
    current = config.get('statusLine')
    configured = owns(current, state)
    print(json.dumps({'installed': (root / 'cli' / 'statusline.mjs').is_file(), 'configured': configured,
                      'enabled': configured and current.get('enabled', True) is not False,
                      'directory': str(root), 'settings': str(settings)}, indent=2))
