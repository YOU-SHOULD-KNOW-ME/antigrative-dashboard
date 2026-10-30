"""Real junction/ancestor-relocation regressions using isolated synthetic homes."""
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('junction_update_worker', ROOT / 'compat/update-worker.py')
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


class JunctionUpdateTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix='ag-junction-update-')
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.home = self.root / 'home'; self.home.mkdir()
        self.storage = self.root / 'storage' / '.gemini'
        self.target = self.storage / 'config/plugins/antigravity-pulse'
        for name in worker.REQUIRED:
            self.write(self.target / name, self.content(name, '0.8.12'))
        self.private = self.target / 'sidecars/panel/data/history-v1/record.json'
        self.write(self.private, 'private statistics')
        self.alias = self.home / '.gemini'
        self.link(self.alias, self.storage)
        self.logical = self.alias / 'config/plugins/antigravity-pulse'

    def link(self, source, destination):
        source.parent.mkdir(parents=True, exist_ok=True)
        if os.name == 'nt':
            env = {**os.environ, 'PULSE_TEST_LINK': str(source), 'PULSE_TEST_DEST': str(destination)}
            result = subprocess.run(['powershell', '-NoProfile', '-NonInteractive', '-Command',
                                     'New-Item -ItemType Junction -Path $env:PULSE_TEST_LINK -Target $env:PULSE_TEST_DEST | Out-Null'],
                                    env=env, capture_output=True, timeout=20, creationflags=subprocess.CREATE_NO_WINDOW)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.addCleanup(lambda: source.rmdir() if source.exists() and worker.linked(source) else None)
        else:
            source.symlink_to(destination, target_is_directory=True)
            self.addCleanup(lambda: source.unlink() if source.is_symlink() else None)

    @staticmethod
    def write(path, value):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(value, encoding='utf-8')

    @staticmethod
    def content(name, version):
        return json.dumps({'name': 'antigravity-pulse', 'version': version}) if name == 'plugin.json' else version + ':' + name

    def prepare(self):
        archive = self.root / 'fixture.zip'
        with zipfile.ZipFile(archive, 'w') as package:
            for name in worker.REQUIRED:
                package.writestr('antigrative-dashboard/' + name, self.content(name, '0.8.13'))
        name = 'antigrative-dashboard-0.8.13.zip'
        base = f'https://github.com/{worker.REPO}/releases/download/v0.8.13/'
        plan = {'currentVersion': '0.8.12', 'latestVersion': '0.8.13', 'host': 'app', 'name': name,
                'url': base + name, 'checksumUrl': base + name + '.sha256', 'size': archive.stat().st_size}
        def fetch(url, limit, destination=None, **options):
            if destination is None:
                return (worker.digest(archive) + '  ' + name).encode()
            destination.write_bytes(archive.read_bytes())
            return archive.stat().st_size
        return plan, fetch

    def snapshot(self, root=None):
        root = root or self.target
        return {p.relative_to(root).as_posix(): p.read_bytes() for p in root.rglob('*') if p.is_file()}

    def relink(self, source, destination):
        if os.name == 'nt':
            source.rmdir()
        else:
            source.unlink()
        self.link(source, destination)

    def test_relocated_home_accepts_logical_and_physical_plugin_paths(self):
        self.assertTrue(worker.linked(self.alias))
        for target in (self.logical, self.target):
            with self.subTest(target=target):
                self.assertEqual(worker.validate_target(target, self.home), '0.8.12')

    def test_manual_repair_install_keeps_junction_statistics_and_other_plugin_settings(self):
        spec = importlib.util.spec_from_file_location('junction_manual_manager', ROOT / 'manage.py')
        manager = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(manager)
        local = self.home / 'AppData/Local'
        config = self.alias / 'config/config.json'
        settings = local / 'AntigravityPulse/settings.json'
        app = local / 'Programs/antigravity/resources/app.asar'
        self.write(app, 'synthetic host archive; must not change')
        self.write(config, json.dumps({'other': {'keep': True}, 'plugins': {'other-plugin': {'enabled': True}}}))
        self.write(settings, json.dumps({'language': 'zh-TW', 'customSetting': 42}))
        with patch.multiple(manager, HOME=self.home, LOCAL=local, PLUGIN=self.logical,
                            CONFIG=config, SETTINGS=settings, APP=app, BACKUPS=local / 'AntigravityPulseBackups'):
            manager.install()
        self.assertTrue(worker.linked(self.alias))
        self.assertEqual(self.private.read_text(), 'private statistics')
        self.assertEqual(app.read_text(), 'synthetic host archive; must not change')
        self.assertEqual(json.loads(config.read_text())['plugins']['other-plugin'], {'enabled': True})
        self.assertEqual(json.loads(settings.read_text())['language'], 'zh-TW')
        self.assertEqual(json.loads(settings.read_text())['customSetting'], 42)
        self.assertEqual((self.target / 'compat/update-worker.py').read_bytes(), (ROOT / 'compat/update-worker.py').read_bytes())

    def test_real_relocated_install_preserves_junction_and_private_statistics(self):
        plan, fetch = self.prepare()
        with patch.object(worker.Path, 'home', return_value=self.home), patch.object(worker, 'fetch', side_effect=fetch):
            result = worker.perform(plan, self.logical, self.root / 'updates')
        self.assertTrue(result['verified'])
        self.assertEqual(json.loads((self.target / 'plugin.json').read_text())['version'], '0.8.13')
        self.assertTrue(worker.linked(self.alias))
        self.assertEqual(self.private.read_text(), 'private statistics')

    def test_runtime_local_updates_use_external_backup_without_recursive_copy(self):
        plan, fetch = self.prepare()
        updates = self.logical / 'sidecars/panel/data/updates'
        self.write(updates / 'keep.json', 'existing updater state')
        with patch.object(worker.Path, 'home', return_value=self.home), patch.object(worker, 'fetch', side_effect=fetch):
            result = worker.perform(plan, self.logical, updates)
        backup = Path(result['backup'])
        self.assertFalse(backup.resolve().is_relative_to(self.target.resolve()))
        self.assertEqual(json.loads((backup / 'plugin.json').read_text())['version'], '0.8.12')
        self.assertEqual((updates / 'keep.json').read_text(), 'existing updater state')
        self.assertEqual(self.private.read_text(), 'private statistics')

    def test_plugin_root_junction_cannot_be_bypassed_with_its_physical_target(self):
        outside = self.root / 'outside'; outside.mkdir()
        original = self.target.with_name('original')
        self.target.rename(original)
        self.write(outside / 'plugin.json', self.content('plugin.json', '0.8.12'))
        self.link(self.target, outside)
        for target in (self.logical, self.target, outside):
            with self.subTest(target=target), self.assertRaises(ValueError):
                worker.validate_target(target, self.home)
        self.assertEqual((outside / 'plugin.json').read_text(), self.content('plugin.json', '0.8.12'))

    def test_location_failure_has_its_own_static_error_category(self):
        output = io.StringIO()
        with patch.object(worker.Path, 'home', return_value=self.home), patch.object(worker.sys, 'argv',
                ['worker', 'check', '--target', str(self.root / 'wrong')]), patch.object(worker.sys, 'stdout', output):
            self.assertEqual(worker.main(), 1)
        self.assertEqual(json.loads(output.getvalue()), {'ok': False, 'code': 'location', 'detail': 'install-location'})
        self.assertNotIn(str(self.home), output.getvalue())

    def test_rollback_uses_pinned_directory_after_the_user_ancestor_is_retargeted(self):
        import shutil
        for strategy in ('files', 'trees'):
            with self.subTest(strategy=strategy):
                before = self.snapshot()
                alternate = self.root / ('alternate-' + strategy)
                alternate_target = alternate / 'config/plugins/antigravity-pulse'
                shutil.copytree(self.target, alternate_target)
                alternate_before = self.snapshot(alternate_target)
                working = self.target.parent / ('transaction-' + strategy)
                working.mkdir()
                plan, _ = self.prepare()
                stage = working / 'stage'
                worker.stage_archive(self.root / 'fixture.zip', stage, plan['latestVersion'])
                def fail(name):
                    if name == 'compat':
                        self.relink(self.alias, alternate)
                        raise OSError('fixture interrupted update')
                with self.assertRaises(OSError):
                    worker.install_staged(stage, self.logical, self.root / ('backup-' + strategy),
                                          '0.8.12', '0.8.13', strategy=strategy, fault=fail)
                self.assertEqual(self.snapshot(), before)
                self.assertEqual(self.snapshot(alternate_target), alternate_before)
                self.relink(self.alias, self.storage)

    def test_recovery_rejects_a_journal_for_a_replaced_installation_root(self):
        working = self.target.parent / 'transaction'
        working.mkdir(); self.prepare()
        stage = working / 'stage'
        worker.stage_archive(self.root / 'fixture.zip', stage, '0.8.13')
        worker.install_staged(stage, self.target, self.root / 'backup', '0.8.12', '0.8.13', strategy='files')
        journal = json.loads((working / 'journal.json').read_text())
        journal['phase'] = 'installing'; worker.write_journal(working, journal)
        preserved = self.target.with_name('preserved-root'); self.target.rename(preserved)
        for name in worker.REQUIRED:
            self.write(self.target / name, self.content(name, '0.8.12'))
        before = self.snapshot()
        with self.assertRaises(worker.RollbackError):
            worker.recover_transaction(working, self.target)
        self.assertEqual(self.snapshot(), before)
        self.assertTrue((working / 'recovery-backup/plugin.json').is_file())

    def test_linked_fallback_backup_root_and_transaction_are_rejected_without_outside_mutation(self):
        plan, fetch = self.prepare()
        outside = self.root / 'outside'; outside.mkdir()
        self.write(outside / 'keep.txt', 'untouched')
        for name in ('.antigravity-pulse-update-backups', '.antigravity-pulse-update-transaction'):
            with self.subTest(root=name):
                linked_root = self.target.parent / name
                self.link(linked_root, outside)
                with patch.object(worker.Path, 'home', return_value=self.home), patch.object(worker, 'fetch', side_effect=fetch):
                    with self.assertRaises(worker.LocationError):
                        worker.perform(plan, self.logical, self.logical / 'sidecars/panel/data/updates')
                self.assertEqual(list(outside.iterdir()), [outside / 'keep.txt'])
                if os.name == 'nt': linked_root.rmdir()
                else: linked_root.unlink()

    def test_low_level_install_rejects_overlapping_backup_before_copying(self):
        working = self.target.parent / 'transaction'; working.mkdir(); self.prepare()
        stage = working / 'stage'; worker.stage_archive(self.root / 'fixture.zip', stage, '0.8.13')
        for backup in (self.target / 'sidecars/panel/data/backup', working / 'backup', self.target.parent):
            with self.subTest(backup=backup), patch.object(worker.shutil, 'copytree') as copy:
                with self.assertRaises(worker.LocationError):
                    worker.install_staged(stage, self.target, backup, '0.8.12', '0.8.13', strategy='files')
                copy.assert_not_called()

    def test_download_revalidates_physical_directory_after_waiting_for_network(self):
        from unittest.mock import Mock
        import io
        destination = self.root / 'download'; destination.mkdir()
        moved = self.root / 'download-original'; outside = self.root / 'outside'; outside.mkdir()
        response = io.BytesIO(b'package'); response.headers = {}
        def replace_before_open(_request, **_options):
            destination.rename(moved); self.link(destination, outside)
            return response
        opener = Mock(); opener.open.side_effect = replace_before_open
        with patch.object(worker.urllib.request, 'build_opener', return_value=opener):
            with self.assertRaises(worker.LocationError):
                worker.fetch('https://github.com/file.zip', 100, destination=destination / 'file.zip')
        self.assertEqual(list(outside.iterdir()), [])
        self.assertEqual(list(moved.iterdir()), [])

    def test_recovery_rechecks_nested_destination_after_copying_a_backup_file(self):
        working = self.target.parent / 'transaction'; working.mkdir(); self.prepare()
        stage = working / 'stage'; worker.stage_archive(self.root / 'fixture.zip', stage, '0.8.13')
        worker.install_staged(stage, self.target, self.root / 'backup', '0.8.12', '0.8.13', strategy='files')
        journal = json.loads((working / 'journal.json').read_text()); journal['phase'] = 'installing'
        worker.write_journal(working, journal)
        outside = self.root / 'outside'; self.write(outside / 'i18n.cjs', 'must not be replaced')
        copied = worker.shutil.copy2; changed = []
        def replace_parent(source, destination, *args, **kwargs):
            result = copied(source, destination, *args, **kwargs)
            if Path(source).name == 'i18n.cjs' and not changed:
                changed.append(True)
                (self.target / 'compat').rename(self.root / 'original-compat')
                self.link(self.target / 'compat', outside)
            return result
        with patch.object(worker.shutil, 'copy2', side_effect=replace_parent):
            with self.assertRaises(worker.RollbackError):
                worker.recover_transaction(working, self.target)
        self.assertTrue(changed)
        self.assertEqual((outside / 'i18n.cjs').read_text(), 'must not be replaced')
        self.assertTrue((working / 'recovery-backup/plugin.json').is_file())


if __name__ == '__main__':
    unittest.main()
