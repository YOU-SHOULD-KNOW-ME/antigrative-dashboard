"""Filesystem transaction regressions for Windows' stable-directory updates."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
WORKER = ROOT / 'compat/update-worker.py'
spec = importlib.util.spec_from_file_location('file_update_worker', WORKER)
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)

CRASH_SCRIPT = '''import importlib.util,os,sys
from pathlib import Path
spec=importlib.util.spec_from_file_location('w',sys.argv[1]);w=importlib.util.module_from_spec(spec);spec.loader.exec_module(w)
target,stage,backup=map(Path,sys.argv[2:5]);point=sys.argv[5]
replace=w.os.replace
def crash_replace(source,destination):
    replace(source,destination)
    try:relative=Path(destination).relative_to(target).as_posix()
    except ValueError:return
    if point=='after:'+relative:os._exit(93)
def fault(name):
    if point=='before:'+name:os._exit(93)
w.os.replace=crash_replace
with w.lifecycle_lock(target):w.install_staged(stage,target,backup,'0.8.8','0.8.9',fault=fault,strategy='files')
'''


class FileUpdateTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix='ag-file-update-')
        self.addCleanup(temporary.cleanup)
        self.home = Path(temporary.name)
        self.target = self.home / '.gemini/config/plugins/antigravity-pulse'
        for name in worker.REQUIRED:
            self.write(self.target / name, self.content(name, '0.8.8'))
        for group in worker.RUNTIME[:3]:
            self.write(self.target / group / 'obsolete.txt', 'old-' + group)
        self.private = self.target / 'sidecars/panel/data/history-v1/record.json'
        self.write(self.private, 'saved usage and preferences')

    @staticmethod
    def write(path, value):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(value, encoding='utf-8')

    @staticmethod
    def content(name, version):
        return json.dumps({'name': 'antigravity-pulse', 'version': version}) if name == 'plugin.json' else version + ':' + name

    def snapshot(self, root=None):
        root = root or self.target
        return {path.relative_to(root).as_posix(): path.read_bytes()
                for path in root.rglob('*') if path.is_file()}

    def prepare(self, name='transaction'):
        working = self.target.parent / name
        stage = working / 'stage'
        for relative in worker.REQUIRED:
            self.write(stage / relative, self.content(relative, '0.8.9'))
        for group in worker.RUNTIME[:3]:
            self.write(stage / group / 'new.txt', 'new-' + group)
            self.write(stage / group / 'zz-last.txt', 'last-' + group)
        return working, stage

    def crash(self, working, stage, point, number='one'):
        result = subprocess.run([sys.executable, '-c', CRASH_SCRIPT, str(WORKER),
                                 str(self.target), str(stage), str(self.home / ('backup-' + number)), point],
                                capture_output=True, timeout=25)
        self.assertEqual(result.returncode, 93, result.stdout + result.stderr)
        journal = json.loads((working / 'journal.json').read_text(encoding='utf-8'))
        self.assertEqual(journal['schema'], 1)
        self.assertEqual(journal['strategy'], 'files')
        self.assertTrue((working / 'recover.py').is_file())
        self.assertTrue((working / 'update-lock.py').is_file())
        return journal

    def test_success_replaces_public_files_without_replacing_directories_or_private_history(self):
        working, stage = self.prepare()
        staged = self.snapshot(stage)
        directories = {path: path.stat().st_ino for path in self.target.rglob('*') if path.is_dir()}
        backup = self.home / 'backup'
        worker.install_staged(stage, self.target, backup, '0.8.8', '0.8.9', strategy='files')
        self.assertEqual(self.snapshot(), {**staged, self.private.relative_to(self.target).as_posix(): b'saved usage and preferences'})
        for path, identity in directories.items():
            self.assertTrue(path.is_dir(), str(path))
            self.assertEqual(path.stat().st_ino, identity, str(path))
        self.assertEqual((backup / 'compat/obsolete.txt').read_text(), 'old-compat')
        self.assertFalse(worker.recover_transaction(working, self.target))
        self.assertEqual(worker.validate_target(self.target, self.home), '0.8.9')

    def test_real_termination_before_and_after_every_group_and_mid_file_recovers_exactly(self):
        before = self.snapshot()
        points = ['before:' + group for group in worker.RUNTIME]
        points += ['after:' + group + '/zz-last.txt' for group in worker.RUNTIME[:3]]
        points += ['after:plugin.json', 'after:assets/logo.svg', 'after:compat/i18n.cjs', 'after:sidecars/panel/main.mjs']
        for index, point in enumerate(points):
            with self.subTest(point=point):
                working, stage = self.prepare('termination-' + str(index))
                self.crash(working, stage, point, str(index))
                with worker.lifecycle_lock(self.target):
                    self.assertTrue(worker.recover_transaction(working, self.target))
                self.assertEqual(self.snapshot(), before)
                self.assertTrue((self.target / 'sidecars/panel').is_dir())
                self.assertFalse(working.exists())

    def test_permission_failure_mid_replacement_restores_old_files_and_deletes_introduced_files(self):
        before = self.snapshot()
        working, stage = self.prepare()
        replace = worker.os.replace
        failed = []
        def fail_once(source, destination):
            if Path(destination) == self.target / 'sidecars/panel/main.mjs' and not failed:
                failed.append(True)
                raise PermissionError('simulated open file')
            return replace(source, destination)
        with patch.object(worker.os, 'replace', side_effect=fail_once):
            with self.assertRaises(PermissionError):
                worker.install_staged(stage, self.target, self.home / 'backup', '0.8.8', '0.8.9', strategy='files')
        self.assertTrue(failed)
        worker.recover_transaction(working, self.target)
        self.assertEqual(self.snapshot(), before)

    def test_interrupted_recovery_keeps_backup_and_supports_retry(self):
        before = self.snapshot()
        working, stage = self.prepare()
        self.crash(working, stage, 'after:sidecars/panel/main.mjs')
        replace = worker.os.replace
        restored = []
        def fail_once(source, destination):
            if Path(destination) == self.target / 'compat/i18n.cjs' and not restored:
                restored.append(True)
                raise PermissionError('recovery interrupted')
            return replace(source, destination)
        with patch.object(worker.os, 'replace', side_effect=fail_once):
            with self.assertRaises(worker.RollbackError):
                worker.recover_transaction(working, self.target)
        self.assertTrue(restored)
        self.assertTrue((working / 'journal.json').is_file())
        self.assertEqual((working / 'recovery-backup/plugin.json').read_bytes(), before['plugin.json'])
        self.assertTrue(worker.recover_transaction(working, self.target))
        self.assertEqual(self.snapshot(), before)

    def test_durable_helper_recovers_from_saved_files_without_installed_worker(self):
        before = self.snapshot()
        working, stage = self.prepare('.antigravity-pulse-update-transaction')
        self.crash(working, stage, 'after:compat/zz-last.txt')
        environment = {**os.environ, 'HOME': str(self.home), 'USERPROFILE': str(self.home)}
        result = subprocess.run([sys.executable, str(working / 'recover.py'), 'recover', '--target', str(self.target)],
                                cwd=self.home, env=environment, capture_output=True, timeout=25)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertTrue(json.loads(result.stdout)['result']['recovered'])
        self.assertEqual(self.snapshot(), before)

    def test_recovery_keeps_private_history_written_after_the_backup(self):
        before = self.snapshot()
        working, stage = self.prepare()
        self.crash(working, stage, 'after:sidecars/panel/main.mjs')
        self.write(self.private, 'new usage written after transaction started')
        self.assertTrue(worker.recover_transaction(working, self.target))
        before[self.private.relative_to(self.target).as_posix()] = b'new usage written after transaction started'
        self.assertEqual(self.snapshot(), before)

    def test_malicious_new_file_inventory_fails_before_any_target_mutation(self):
        before = self.snapshot()
        outside = self.home / 'outside.txt'
        self.write(outside, 'outside must survive')
        bad_inventories = [
            ['../outside.txt'], ['compat/../../outside.txt'], ['/outside.txt'], ['C:/outside.txt'],
            ['compat\\escape.txt'], ['compat/./inline-widget.cjs'], ['sidecars/panel/data/history-v1/record.json'],
            ['other/file.txt'], ['plugin.json/child'], ['compat/new.txt', 'compat/new.txt'],
            ['compat/file-' + str(index) for index in range(8193)],
        ]
        for index, new_files in enumerate(bad_inventories):
            with self.subTest(inventory=index):
                working, _ = self.prepare('malicious-' + str(index))
                for relative, content in before.items():
                    path = working / 'recovery-backup' / relative
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_bytes(content)
                worker.write_journal(working, {'schema': 1, 'strategy': 'files', 'phase': 'installing',
                                               'current': '0.8.8', 'expected': '0.8.9',
                                               'original': list(worker.RUNTIME), 'newFiles': new_files})
                with self.assertRaises(worker.RollbackError):
                    worker.recover_transaction(working, self.target)
                self.assertEqual(self.snapshot(), before)
                self.assertEqual(outside.read_text(), 'outside must survive')
                self.assertTrue((working / 'journal.json').is_file())

    def test_recovery_preflights_directory_file_conflicts_before_restoring_any_file(self):
        before = self.snapshot()
        working, stage = self.prepare()
        self.crash(working, stage, 'after:sidecars/panel/main.mjs')
        conflict = self.target / 'compat/i18n.cjs'
        conflict.unlink()
        self.write(conflict / 'keep.txt', 'unexpected directory')
        conflicted = self.snapshot()
        with self.assertRaises(worker.RollbackError):
            worker.recover_transaction(working, self.target)
        self.assertEqual(self.snapshot(), conflicted)
        (conflict / 'keep.txt').unlink()
        conflict.rmdir()
        self.assertTrue(worker.recover_transaction(working, self.target))
        self.assertEqual(self.snapshot(), before)

    def test_recovery_rejects_linked_target_before_unlinking_an_outside_file(self):
        working, stage = self.prepare()
        journal = self.crash(working, stage, 'after:sidecars/panel/main.mjs')
        outside = self.home / 'outside'
        self.write(outside / 'keep.txt', 'outside must survive')
        linked = self.target / 'compat/redirect'
        if os.name == 'nt':
            environment = {**os.environ, 'PULSE_TEST_LINK': str(linked), 'PULSE_TEST_DEST': str(outside)}
            result = subprocess.run(['powershell', '-NoProfile', '-NonInteractive', '-Command',
                                     'New-Item -ItemType Junction -Path $env:PULSE_TEST_LINK -Target $env:PULSE_TEST_DEST | Out-Null'],
                                    env=environment, capture_output=True, timeout=20)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        else:
            linked.symlink_to(outside, target_is_directory=True)
        try:
            journal['newFiles'].append('compat/redirect/keep.txt')
            worker.write_journal(working, journal)
            conflicted = self.snapshot()
            with self.assertRaises(worker.RollbackError):
                worker.recover_transaction(working, self.target)
            self.assertEqual((outside / 'keep.txt').read_text(), 'outside must survive')
            self.assertEqual(self.snapshot(), conflicted)
        finally:
            if os.name == 'nt':
                linked.rmdir()
            else:
                linked.unlink()


if __name__ == '__main__':
    unittest.main()
