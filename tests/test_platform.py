import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import test_lifecycle

spec=importlib.util.spec_from_file_location('ag_paths',Path(__file__).resolve().parents[1]/'compat/platform_paths.py')
paths=importlib.util.module_from_spec(spec)
spec.loader.exec_module(paths)

class PlatformTests(unittest.TestCase):
    def test_native_paths_and_custom_app(self):
        home=Path('/test-user')
        linux=paths.platform_paths('linux',home,{'XDG_CONFIG_HOME':'/cfg','XDG_DATA_HOME':'/data','PATH':''})
        self.assertEqual(linux['settings'],Path('/data/AntigravityPulse/settings.json'))
        self.assertEqual(linux['profile'],Path('/cfg/Antigravity'))
        mac=paths.platform_paths('darwin',home,{})
        self.assertEqual(mac['profile'],home/'Library/Application Support/Antigravity')
        self.assertEqual(mac['app'],Path('/Applications/Antigravity.app/Contents/Resources/app.asar'))
        self.assertEqual(paths.platform_paths('darwin',home,{'AG_PULSE_APP_ASAR':'/custom/app.asar'})['app'],Path('/custom/app.asar'))

    def test_native_lifecycle_is_user_owned_and_leaves_app_archive_unchanged(self):
        manager=test_lifecycle.manager
        with tempfile.TemporaryDirectory() as temp:
            home=Path(temp)
            for platform in ['linux','darwin','win32']:
                with self.subTest(platform=platform):
                    p=paths.platform_paths(platform,home,{'PATH':'','AG_PULSE_APP_ASAR':str(home/'host/app.asar')})
                    plugin=home/'.gemini/config/plugins/antigravity-pulse'
                    with patch.multiple(manager,HOME=home,LOCAL=p['local'],APP=p['app'],SETTINGS=p['settings'],BACKUPS=p['backups'],PLUGIN=plugin,CONFIG=home/'.gemini/config/config.json'):
                        p['app'].parent.mkdir(parents=True,exist_ok=True);p['app'].write_bytes(b'original-app')
                        manager.install();manager.set_enabled(False);manager.set_enabled(True);manager.uninstall()
                        self.assertEqual(p['app'].read_bytes(),b'original-app')
                        self.assertFalse(plugin.exists());self.assertFalse(manager.json_read(p['settings'])['enabled'])
