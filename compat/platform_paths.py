"""Desktop app discovery and user paths without Windows environment assumptions."""
import os
from pathlib import Path
import shutil
import sys


def platform_paths(platform=None, home=None, env=None):
    platform = platform or sys.platform
    home = Path(home) if home is not None else Path.home()
    env = os.environ if env is None else env
    if platform == 'win32':
        config = Path(env.get('APPDATA', home / 'AppData' / 'Roaming'))
        local = Path(env.get('LOCALAPPDATA', home / 'AppData' / 'Local'))
        candidates = [local / 'Programs' / 'antigravity' / 'resources' / 'app.asar']
    elif platform == 'darwin':
        config = local = home / 'Library' / 'Application Support'
        candidates = [Path('/Applications/Antigravity.app/Contents/Resources/app.asar'),
                      home / 'Applications/Antigravity.app/Contents/Resources/app.asar']
    elif platform.startswith('linux'):
        config = Path(env.get('XDG_CONFIG_HOME', home / '.config'))
        local = Path(env.get('XDG_DATA_HOME', home / '.local' / 'share'))
        candidates = [Path(root) / 'resources' / 'app.asar' for root in
                      ('/opt/Antigravity', '/opt/antigravity', '/usr/share/antigravity')]
        executable = shutil.which('antigravity', path=env.get('PATH', ''))
        if executable:
            candidates.insert(0, Path(executable).resolve().parent / 'resources' / 'app.asar')
    else:
        raise RuntimeError('Supported platforms: Windows, Linux, macOS')
    if env.get('AG_PULSE_APP_ASAR'):
        candidates = [Path(env['AG_PULSE_APP_ASAR']).expanduser()]
    app = next((p for p in candidates if p.is_file()), candidates[0])
    profile = Path(env['AG_PULSE_PROFILE']).expanduser() if env.get('AG_PULSE_PROFILE') else config / 'Antigravity'
    return dict(home=home, local=local, profile=profile, app=app,
                settings=local / 'AntigravityPulse' / 'settings.json',
                backups=local / 'AntigravityPulseBackups')
