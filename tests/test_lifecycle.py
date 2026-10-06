import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('pulse_manager', ROOT / 'manage.py')
manager = importlib.util.module_from_spec(spec)
spec.loader.exec_module(manager)

class LifecycleTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name)
        self.local = self.home / 'AppData' / 'Local'
        self.plugin = self.home / '.gemini' / 'config' / 'plugins' / 'antigravity-pulse'
        self.config = self.home / '.gemini' / 'config' / 'config.json'
        self.settings = self.local / 'AntigravityPulse' / 'settings.json'
        self.app = self.local / 'Programs' / 'antigravity' / 'resources' / 'app.asar'
        self.backups = self.local / 'AntigravityPulseBackups'
        self.context = patch.multiple(manager, HOME=self.home, LOCAL=self.local, PLUGIN=self.plugin,
                                      CONFIG=self.config, SETTINGS=self.settings, APP=self.app, BACKUPS=self.backups)
        self.context.start()
        self.addCleanup(self.context.stop)

    def test_panel_install_disable_enable_remove_preserves_other_settings(self):
        manager.atomic_json(self.config, {'other': {'keep': 1}, 'plugins': {'other-plugin': {'enabled': True}}})
        manager.install(panel_only=True)
        self.assertTrue((self.plugin / 'sidecars' / 'panel' / 'main.mjs').exists())
        manager.set_enabled(False)
        self.assertFalse(manager.json_read(self.settings)['enabled'])
        manager.set_enabled(True)
        self.assertTrue(manager.json_read(self.settings)['enabled'])
        manager.uninstall()
        self.assertFalse(self.plugin.exists())
        self.assertFalse(manager.json_read(self.settings)['enabled'])
        config = manager.json_read(self.config)
        self.assertEqual(config['other'], {'keep': 1})
        self.assertTrue(config['plugins']['other-plugin']['enabled'])

    def test_other_plugin_is_not_overwritten_or_removed(self):
        self.plugin.mkdir(parents=True)
        manager.atomic_json(self.plugin / 'plugin.json', {'name': 'different'})
        with self.assertRaises(RuntimeError): manager.install(panel_only=True)
        with self.assertRaises(RuntimeError): manager.uninstall()
        self.assertEqual(manager.json_read(self.plugin / 'plugin.json')['name'], 'different')

    def test_uninstall_restores_only_the_exact_verified_archive(self):
        self.plugin.mkdir(parents=True)
        manager.atomic_json(self.plugin / 'plugin.json', {'name': 'antigravity-pulse'})
        self.app.parent.mkdir(parents=True)
        self.app.write_bytes(b'patched-fixture')
        backup = self.backups / 'test-backup'
        backup.mkdir(parents=True)
        (backup / 'app.asar').write_bytes(b'original-fixture')
        manager.atomic_json(backup / 'patch.json', {'patchedSha256': hashlib.sha256(b'patched-fixture').hexdigest(),
                                                  'originalSha256': hashlib.sha256(b'original-fixture').hexdigest()})
        manager.uninstall()
        self.assertEqual(self.app.read_bytes(), b'original-fixture')
        self.assertTrue(backup.exists())

    def test_unknown_app_changes_block_uninstall_before_deleting_plugin(self):
        self.plugin.mkdir(parents=True)
        manager.atomic_json(self.plugin / 'plugin.json', {'name': 'antigravity-pulse'})
        self.app.parent.mkdir(parents=True)
        self.app.write_bytes(b'changed-by-another-application')
        with self.assertRaises(Exception): manager.uninstall()
        self.assertTrue(self.plugin.exists())
        self.assertEqual(self.app.read_bytes(), b'changed-by-another-application')

    def test_release_uses_allowlist_and_excludes_private_runtime_files(self):
        output = self.home / 'release.zip'
        manager.package(output)
        with zipfile.ZipFile(output) as bundle:
            names = bundle.namelist()
            self.assertIn('antigrative-dashboard/manage.py', names)
            self.assertIn('antigrative-dashboard/LICENSE', names)
            self.assertFalse(any(name.endswith(('.log', '.asar', '.pyc')) for name in names))
            self.assertFalse(any('/.git/' in name or '/__pycache__/' in name for name in names))
        self.assertTrue(output.with_suffix('.zip.sha256').exists())

if __name__ == '__main__': unittest.main()
