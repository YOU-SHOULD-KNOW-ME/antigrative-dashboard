"""Dependency-free Antigrative Dashboard installer, switch, uninstaller and packager."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import zipfile

SOURCE = Path(__file__).resolve().parent
_path_spec = importlib.util.spec_from_file_location('pulse_paths', SOURCE / 'compat' / 'platform_paths.py')
_paths_module = importlib.util.module_from_spec(_path_spec)
_path_spec.loader.exec_module(_paths_module)
_paths = _paths_module.platform_paths()
HOME = _paths['home']
LOCAL = _paths['local']
PLUGIN = HOME / '.gemini' / 'config' / 'plugins' / 'antigravity-pulse'
CONFIG = HOME / '.gemini' / 'config' / 'config.json'
SETTINGS = _paths['settings']
APP = _paths['app']
BACKUPS = _paths['backups']
RUNTIME_FILES = ('assets', 'compat', 'sidecars', 'plugin.json')
DIST_FILES = ('plugin.json', 'assets', 'sidecars', 'compat', 'manage.py', 'install.ps1',
              'uninstall.ps1', 'install.sh', 'uninstall.sh', 'README.md', 'LICENSE', 'CHANGELOG.md', 'COMPATIBILITY.md', 'docs', 'package.json',
              '.gitignore', '.gitattributes', '.github', 'tests', 'tools', 'GITHUB_RELEASE.md', 'README.zh-CN.md')
IGNORED = {'__pycache__', '.data', 'node_modules', '.git', 'dist', 'data', 'history-v1', 'sdk'}

def json_read(file, default=None):
    if not file.exists():
        return {} if default is None else default
    return json.loads(file.read_text(encoding='utf-8-sig'))

def atomic_json(file, value):
    file.parent.mkdir(parents=True, exist_ok=True)
    temporary = file.with_name(file.name + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    os.replace(temporary, file)

def own_plugin():
    if PLUGIN.is_symlink() or (PLUGIN.exists() and PLUGIN.resolve().parent != (HOME / '.gemini' / 'config' / 'plugins').resolve()):
        raise RuntimeError('Plugin destination must be a regular directory inside the customization root.')
    if PLUGIN.exists() and json_read(PLUGIN / 'plugin.json').get('name') != 'antigravity-pulse':
        raise RuntimeError('Destination is not an Antigrative Dashboard installation; refusing to overwrite it.')

def adapter():
    spec = importlib.util.spec_from_file_location('pulse_adapter', SOURCE / 'compat' / 'patch-loader.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.APP = APP
    module.BACKUPS = BACKUPS
    return module

def original_for_current(current):
    digest = hashlib.sha256(current).hexdigest()
    if not BACKUPS.exists():
        return None
    for directory in sorted(BACKUPS.iterdir(), reverse=True):
        note = json_read(directory / 'patch.json')
        if note.get('patchedSha256') == digest:
            original = (directory / 'app.asar').read_bytes()
            if hashlib.sha256(original).hexdigest() != note.get('originalSha256'):
                raise RuntimeError('Original application backup failed its integrity check.')
            return original
    return None

def set_enabled(enabled):
    own_plugin()
    if not (PLUGIN / 'plugin.json').exists():
        raise RuntimeError('Install Antigrative Dashboard before changing its state.')
    config = json_read(CONFIG)
    entry = config.setdefault('plugins', {}).setdefault('antigravity-pulse', {})
    entry['enabled'] = bool(enabled)
    atomic_json(CONFIG, config)
    settings = json_read(SETTINGS)
    settings['enabled'] = bool(enabled)
    atomic_json(SETTINGS, settings)
    print('Antigrative Dashboard enabled.' if enabled else 'Antigrative Dashboard disabled; the toolbar hides on its next poll.')

def remove_verified_legacy_adapter():
    if not APP.is_file():
        return
    current = APP.read_bytes()
    original = original_for_current(current)
    if original is not None:
        APP.write_bytes(original)
        if APP.read_bytes() != original:
            raise RuntimeError('Legacy adapter restoration verification failed.')
        print('Restored the exact verified legacy archive; future updates need no archive patches.')
    elif b'// AG_PULSE_INLINE_V1' in current:
        raise RuntimeError('The legacy adapter has unknown app changes; refusing to overwrite them. Inspect its backup first.')


def install(panel_only=False, legacy_loader=False):
    own_plugin()
    config = json_read(CONFIG)
    if not isinstance(config, dict) or not isinstance(config.get('plugins', {}), dict):
        raise RuntimeError('Existing customization configuration has an incompatible shape.')
    if not panel_only:
        if not APP.is_file():
            raise RuntimeError('Antigravity desktop app not found. Use --app-path /path/to/resources/app.asar for a custom installation. See COMPATIBILITY.md.')
    if legacy_loader:
        if sys.platform != 'win32':
            raise RuntimeError('The historical app.asar loader is Windows-only. Use the default runtime adapter.')
        module = adapter()
        module.build(module.unpatched_original(APP.read_bytes()))
    elif not panel_only:
        remove_verified_legacy_adapter()
    PLUGIN.mkdir(parents=True, exist_ok=True)
    for name in RUNTIME_FILES:
        source, target = SOURCE / name, PLUGIN / name
        if source.resolve() == target.resolve():
            continue
        if source.is_dir():
            shutil.copytree(source, target, dirs_exist_ok=True,
                            ignore=shutil.ignore_patterns('__pycache__', '*.pyc', '*.log', '.data', 'node_modules', 'data', 'history-v1', 'sdk'))
        else:
            shutil.copy2(source, target)
    if legacy_loader:
        subprocess.run([sys.executable, str(SOURCE / 'compat' / 'patch-loader.py'), '--apply'], check=True,
                       env={**os.environ, 'AG_PULSE_APP_ASAR': str(APP)})
    settings = json_read(SETTINGS)
    settings.update({'inline': not panel_only, 'mode': 'legacy' if legacy_loader else 'runtime'})
    if APP.is_file():
        settings['appResources'] = str(APP.parent)
    if os.environ.get('AG_PULSE_PROFILE'):
        settings['profile'] = str(_paths['profile'])
    atomic_json(SETTINGS, settings)
    set_enabled(True)
    print('Installed:', PLUGIN)
    print('Fully quit and reopen Antigravity to start the plugin runtime. App updates no longer overwrite the inline adapter.')

def uninstall():
    own_plugin()
    # Restore before deleting the runtime. An unknown archive is never overwritten.
    if APP.exists():
        module = adapter()
        current = APP.read_bytes()
        original = original_for_current(current)
        if original is not None:
            APP.write_bytes(original)
            if APP.read_bytes() != original:
                raise RuntimeError('Restored application verification failed.')
            print('Original Antigravity archive restored.')
        elif b'// AG_PULSE_INLINE_V1' in current:
            header, base = module.archive(current)
            entry = header['files']['dist']['files']['preload.js']
            preload = current[base + int(entry['offset']):base + int(entry['offset']) + entry['size']]
            if module.MARKER.encode() in preload:
                raise RuntimeError('Application changed since patching. Inspect the backup before uninstalling.')
    if PLUGIN.exists():
        set_enabled(False)
        resolved = PLUGIN.resolve()
        expected_parent = (HOME / '.gemini' / 'config' / 'plugins').resolve()
        if PLUGIN.is_symlink() or resolved.parent != expected_parent or resolved.name != 'antigravity-pulse':
            raise RuntimeError('Plugin target is outside the expected directory; refusing to delete it.')
        shutil.rmtree(resolved)
    else:
        atomic_json(SETTINGS, {'enabled': False})
    print('Antigrative Dashboard removed. Backups and diagnostic logs are retained for recovery.')
    print('Fully quit and reopen Antigravity to unload the UI adapter.')

def status():
    installed = (PLUGIN / 'plugin.json').is_file()
    enabled = installed and json_read(CONFIG).get('plugins', {}).get('antigravity-pulse', {}).get('enabled', True)
    health_file = HOME / '.gemini' / 'antigravity' / 'sidecar_data' / 'antigravity-pulse' / 'panel' / 'data' / 'integration-state.json'
    print(json.dumps({'installed': installed, 'enabled': bool(enabled), 'pluginDirectory': str(PLUGIN),
                      'integrationMode': json_read(SETTINGS).get('mode', 'legacy'),
                      'inlineIntegration': json_read(health_file, None),
                      'toolbarAdapterRecoverable': APP.exists() and original_for_current(APP.read_bytes()) is not None}, indent=2))

def package(output=None):
    version = json_read(SOURCE / 'plugin.json')['version']
    output = Path(output) if output else SOURCE / 'dist' / f'antigrative-dashboard-{version}.zip'
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as bundle:
        for name in DIST_FILES:
            path = SOURCE / name
            if not path.exists():
                raise RuntimeError(f'Required release file missing: {name}')
            files = sorted(path.rglob('*')) if path.is_dir() else [path]
            for file in files:
                if not file.is_file() or any(p in IGNORED for p in file.relative_to(SOURCE).parts):
                    continue
                if file.suffix in {'.log', '.pyc'}:
                    continue
                bundle.write(file, Path('antigrative-dashboard') / file.relative_to(SOURCE))
    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    output.with_suffix('.zip.sha256').write_text(f'{digest}  {output.name}\n', encoding='utf-8')
    print('Package:', output)
    print('SHA256:', digest)

def main():
    global APP
    parser = argparse.ArgumentParser(description='Antigrative Dashboard lifecycle manager')
    sub = parser.add_subparsers(dest='action', required=True)
    p = sub.add_parser('install'); group = p.add_mutually_exclusive_group()
    group.add_argument('--panel-only', action='store_true')
    group.add_argument('--legacy-loader', action='store_true', help='Opt in to the old, version-specific app.asar adapter')
    p.add_argument('--app-path', type=Path, help='Path to the desktop app resources/app.asar for a custom installation')
    for action in ('enable', 'disable', 'status', 'uninstall'): sub.add_parser(action)
    p = sub.add_parser('package'); p.add_argument('--output')
    args = parser.parse_args()
    if args.action == 'install' and args.app_path:
        APP = args.app_path.expanduser().resolve()
    try:
        if args.action == 'install': install(args.panel_only, args.legacy_loader)
        elif args.action == 'enable': set_enabled(True)
        elif args.action == 'disable': set_enabled(False)
        elif args.action == 'uninstall': uninstall()
        elif args.action == 'status': status()
        elif args.action == 'package': package(args.output)
    except (OSError, ValueError, RuntimeError, subprocess.CalledProcessError) as error:
        print(f'Antigrative Dashboard: {error}', file=sys.stderr)
        return 1
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
