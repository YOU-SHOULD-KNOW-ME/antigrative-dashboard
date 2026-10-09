import importlib.util
import json
import base64
import os
import re
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('pulse_cli', ROOT / 'cli' / 'lifecycle.py')
cli = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cli)


class CliLifecycleTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='pulse CLI 空格 & ')
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name).resolve()
        self.base, self.settings, self.runtime, self.backup = cli.paths(self.home)

    def test_cli_only_install_upgrade_and_restore_preserves_desktop_and_unrelated_config(self):
        desktop = self.home / '.gemini' / 'config' / 'config.json'
        cli.write(desktop, {'desktop': 'untouched'})
        prior = {'type': 'command', 'command': 'my-custom-status', 'enabled': False, 'padding': 1}
        cli.write(self.settings, {'statusLine': prior, 'other': {'keep': 1}})
        cli.install(ROOT, self.home, language='zh-CN')
        cli.install(ROOT, self.home, language='en')
        selected = cli.read(self.settings)['statusLine']['command']
        if os.name == 'nt':
            selected = base64.b64decode(selected.split()[-1]).decode('utf-16-le')
        self.assertIn('--language en', selected)
        self.assertEqual(cli.read(self.backup)['previous'], prior)
        self.assertFalse((self.home / '.gemini' / 'config' / 'plugins').exists())
        self.assertEqual(cli.read(desktop), {'desktop': 'untouched'})
        self.assertTrue((self.runtime / 'cli' / 'statusline.mjs').is_file())
        cli.uninstall(self.home)
        self.assertEqual(cli.read(self.settings), {'statusLine': prior, 'other': {'keep': 1}})
        self.assertFalse(self.runtime.exists())

    def test_shell_command_runs_installed_adapter_with_spaces_cjk_and_ampersand(self):
        cli.install(ROOT, self.home, language='zh-CN')
        command = cli.read(self.settings)['statusLine']['command']
        result = subprocess.run(command, shell=True, input=json.dumps({'context_window': {'used_percentage': 12.5}}),
                                capture_output=True, encoding='utf-8', timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('上下文 12.5%', re.sub(r'\x1b\[[\d;]+m', '', result.stdout))

    def test_new_config_uninstall_returns_to_builtin_and_preserves_later_settings(self):
        cli.install(ROOT, self.home)
        config = cli.read(self.settings)
        config['later'] = True
        config['statusLine']['padding'] = 2
        cli.write(self.settings, config)
        cli.uninstall(self.home)
        self.assertEqual(cli.read(self.settings), {'later': True})
        cli.uninstall(self.home)

    def test_user_replacement_survives_uninstall_and_reinstall_updates_restore_target(self):
        cli.install(ROOT, self.home)
        replacement = {'type': 'command', 'command': 'replacement'}
        cli.write(self.settings, {'statusLine': replacement})
        cli.uninstall(self.home)
        self.assertEqual(cli.read(self.settings)['statusLine'], replacement)
        cli.install(ROOT, self.home)
        cli.uninstall(self.home)
        self.assertEqual(cli.read(self.settings)['statusLine'], replacement)

    def test_unknown_destination_invalid_config_and_missing_node_are_not_overwritten(self):
        self.runtime.mkdir(parents=True)
        unknown = self.runtime / 'keep.txt'; unknown.write_text('keep')
        with self.assertRaises(RuntimeError): cli.install(ROOT, self.home)
        self.assertEqual(unknown.read_text(), 'keep')
        shutil.rmtree(self.runtime)
        self.settings.write_text('[]')
        with self.assertRaises(RuntimeError): cli.install(ROOT, self.home)
        self.assertEqual(self.settings.read_text(), '[]')
        with self.assertRaises(RuntimeError): cli.install(ROOT, self.home, node='nonexistent-node-fixture')

    def test_failed_upgrade_keeps_original_recovery_and_recognizes_old_command(self):
        cli.write(self.settings, {'statusLine': {'command': 'original'}})
        cli.install(ROOT, self.home, language='en')
        old = cli.read(self.settings)['statusLine']
        with patch.object(cli.shutil, 'copy2', side_effect=OSError('fixture copy failure')):
            with self.assertRaises(OSError): cli.install(ROOT, self.home, language='zh-CN')
        self.assertEqual(cli.read(self.settings)['statusLine'], old)
        cli.install(ROOT, self.home, language='zh-CN')
        cli.uninstall(self.home)
        self.assertEqual(cli.read(self.settings)['statusLine'], {'command': 'original'})

    def test_concurrent_settings_edits_are_not_overwritten(self):
        original_copy = cli.shutil.copy2
        def copy_and_edit(source, target):
            result = original_copy(source, target)
            cli.write(self.settings, {'userChanged': True})
            return result
        with patch.object(cli.shutil, 'copy2', side_effect=copy_and_edit):
            with self.assertRaises(RuntimeError): cli.install(ROOT, self.home)
        self.assertEqual(cli.read(self.settings), {'userChanged': True})

    def test_symlink_runtime_and_nested_links_are_rejected_before_mutation(self):
        target = self.home / 'outside'; target.mkdir()
        self.base.mkdir(parents=True)
        try:
            self.runtime.symlink_to(target, target_is_directory=True)
        except OSError:
            self.skipTest('Symlink creation requires OS permission')
        with self.assertRaises(RuntimeError): cli.install(ROOT, self.home)
        self.runtime.unlink()
        cli.install(ROOT, self.home)
        (self.runtime / 'escape').symlink_to(target, target_is_directory=True)
        before = self.settings.read_bytes()
        with self.assertRaises(RuntimeError): cli.uninstall(self.home)
        self.assertEqual(self.settings.read_bytes(), before)
        self.assertTrue(target.exists())

    def test_platform_shell_quoting_and_windows_quote_free_transport(self):
        for platform in ('linux', 'darwin'):
            self.assertEqual(cli.command('/node path/node', '/home/user/test.mjs', 'en', platform),
                             "'/node path/node' /home/user/test.mjs --language en")
        selected = cli.command('C:\\Program Files\\node.exe', "C:\\空格 & %var%!\\O'Brien\\test.mjs", platform='win32')
        self.assertNotIn('"', selected)
        decoded = base64.b64decode(selected.split()[-1]).decode('utf-16-le')
        self.assertIn("& 'C:\\Program Files\\node.exe'", decoded)
        self.assertIn("'C:\\空格 & %var%!\\O''Brien\\test.mjs'", decoded)
        with self.assertRaises(RuntimeError): cli.command('C:\\node\n.exe', 'C:\\test.mjs', platform='win32')

    @unittest.skipUnless(os.name == 'nt', 'Windows CMD runner only')
    def test_windows_cmd_argument_transport_matches_real_cli(self):
        cli.install(ROOT, self.home, language='zh-CN')
        selected = cli.read(self.settings)['statusLine']['command']
        result = subprocess.run(['cmd.exe', '/d', '/s', '/c', selected],
                                input='{}', capture_output=True, encoding='utf-8', timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('上下文', re.sub(r'\x1b\[[\d;]+m', '', result.stdout))

    def test_active_lifecycle_lock_blocks_overlapping_install(self):
        self.base.mkdir(parents=True)
        (self.base / '.antigrative-dashboard.lock').write_text('fixture')
        with self.assertRaises(RuntimeError): cli.install(ROOT, self.home)
        self.assertFalse(self.settings.exists())


if __name__ == '__main__':
    unittest.main()
