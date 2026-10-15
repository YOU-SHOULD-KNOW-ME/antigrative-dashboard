import importlib.util
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('update_worker', ROOT / 'compat/update-worker.py')
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


class UpdateWorkerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name)
        self.target = self.home / '.gemini/config/plugins/antigravity-pulse'
        self.target.mkdir(parents=True)
        (self.target / 'plugin.json').write_text(json.dumps({'name': 'antigravity-pulse', 'version': '0.8.6'}))

    def archive(self, extras=(), version='0.8.7'):
        path = self.home / 'fixture.zip'
        with zipfile.ZipFile(path, 'w') as bundle:
            for name in worker.REQUIRED:
                content = json.dumps({'name': 'antigravity-pulse', 'version': version}) if name == 'plugin.json' else 'fixture source'
                bundle.writestr('antigrative-dashboard/' + name, content)
            for name, content in extras:
                entry = zipfile.ZipInfo(name)
                entry.filename = name  # Preserve adversarial raw Windows names.
                bundle.writestr(entry, content)
        return path

    def test_exact_app_package_and_checksum_are_required(self):
        release = {'tag_name': 'v0.8.7', 'assets': [
            {'name': 'antigrative-dashboard-0.8.7.zip', 'size': 123,
             'browser_download_url': f'https://github.com/{worker.REPO}/releases/download/v0.8.7/antigrative-dashboard-0.8.7.zip'},
            {'name': 'antigrative-dashboard-0.8.7.zip.sha256',
             'browser_download_url': f'https://github.com/{worker.REPO}/releases/download/v0.8.7/antigrative-dashboard-0.8.7.zip.sha256'}]}
        self.assertTrue(worker.release_plan(release, '0.8.6')['hasUpdate'])
        with self.assertRaises(ValueError):
            worker.release_plan(release, '0.8.6', 'ide')
        with self.assertRaises(ValueError):
            worker.release_plan({**release, 'assets': release['assets'][:1]}, '0.8.6')
        self.assertFalse(worker.release_plan(release, '0.8.7')['hasUpdate'])
        self.assertFalse(worker.release_plan(release, '0.8.8')['hasUpdate'])
        with self.assertRaises(ValueError):
            worker.release_plan({**release, 'prerelease': True}, '0.8.6')

    def test_checksum_never_uses_an_unrelated_filename(self):
        value = 'a' * 64
        self.assertEqual(worker.checksum(value + '  correct.zip', 'correct.zip'), value)
        self.assertEqual(worker.checksum(value, 'correct.zip'), value)
        for text in [value + '  unrelated.zip', 'invalid', value + '\n' + value]:
            with self.assertRaises(ValueError):
                worker.checksum(text, 'correct.zip')

    def test_paths_links_and_private_data_are_rejected_before_install(self):
        for index, name in enumerate(['antigrative-dashboard/compat/../../escape', '/absolute',
                                     'antigrative-dashboard/compat\\evil', 'antigrative-dashboard/compat/C:evil',
                                     'antigrative-dashboard/sidecars/panel/data/preferences.json']):
            with self.assertRaises(ValueError):
                worker.stage_archive(self.archive([(name, 'bad')]), self.home / f'stage{index}', '0.8.7')
        path = self.archive()
        with zipfile.ZipFile(path, 'a') as bundle:
            entry = zipfile.ZipInfo('antigrative-dashboard/compat/link')
            entry.external_attr = (stat.S_IFLNK | 0o777) << 16
            bundle.writestr(entry, '../../escape')
        with self.assertRaises(ValueError):
            worker.stage_archive(path, self.home / 'stage-link', '0.8.7')
        self.assertFalse((self.home / 'escape').exists())
        self.assertEqual(json.loads((self.target / 'plugin.json').read_text())['version'], '0.8.6')

    def test_wrong_version_and_duplicate_files_are_rejected(self):
        with self.assertRaises(ValueError):
            worker.stage_archive(self.archive(version='0.8.8'), self.home / 'stage-wrong', '0.8.7')
        with self.assertRaises(ValueError):
            worker.stage_archive(self.archive([('antigrative-dashboard/compat/inline-widget.cjs', 'duplicate')]), self.home / 'stage-dupe', '0.8.7')

    def test_failed_swap_restores_every_old_file_and_preserves_private_data(self):
        (self.target / 'compat').mkdir()
        (self.target / 'compat/original.txt').write_text('old source')
        private = self.target / 'sidecars/panel/data/history-v1'
        private.mkdir(parents=True)
        (private / 'record.json').write_text('saved statistics')
        working = self.target.parent / 'transaction'
        working.mkdir()
        stage = working / 'stage'
        worker.stage_archive(self.archive(), stage, '0.8.7')
        before = {str(p.relative_to(self.target)): p.read_bytes() for p in self.target.rglob('*') if p.is_file()}
        def fail(name):
            if name == 'sidecars':
                raise OSError('simulated write error')
        backup = self.home / 'backups/one'
        with self.assertRaises(OSError):
            worker.install_staged(stage, self.target, backup, '0.8.6', '0.8.7', fault=fail)
        after = {str(p.relative_to(self.target)): p.read_bytes() for p in self.target.rglob('*') if p.is_file()}
        self.assertEqual(before, after)
        self.assertEqual((backup / 'compat/original.txt').read_text(), 'old source')

    def test_success_verifies_version_and_never_modifies_account_settings(self):
        settings = self.home / '.gemini/config/config.json'
        settings.write_text('account settings')
        working = self.target.parent / 'transaction'
        working.mkdir()
        stage = working / 'stage'
        worker.stage_archive(self.archive(), stage, '0.8.7')
        worker.install_staged(stage, self.target, self.home / 'backups/one', '0.8.6', '0.8.7')
        self.assertEqual(json.loads((self.target / 'plugin.json').read_text())['version'], '0.8.7')
        self.assertEqual(settings.read_text(), 'account settings')
        self.assertEqual(worker.validate_target(self.target, self.home), '0.8.7')
        with self.assertRaises(ValueError):
            worker.validate_target(self.home, self.home)

    def snapshot(self):
        return {str(p.relative_to(self.target)): p.read_bytes() for p in self.target.rglob('*') if p.is_file()}

    def populate(self):
        for name in worker.RUNTIME[:3]:
            (self.target / name).mkdir(exist_ok=True)
            (self.target / name / 'old.txt').write_text('old-' + name)
        private = self.target / 'sidecars/panel/data/history-v1'
        private.mkdir(parents=True)
        (private / 'record.json').write_text('saved statistics')

    def prepare_stage(self, name='transaction'):
        working = self.target.parent / name
        working.mkdir()
        stage = working / 'stage'
        worker.stage_archive(self.archive(), stage, '0.8.7')
        return working, stage

    def test_real_process_termination_at_each_swap_recovers_exact_old_runtime(self):
        self.populate()
        before = self.snapshot()
        script = '''import importlib.util,os,sys
from pathlib import Path
s=importlib.util.spec_from_file_location('worker',sys.argv[1]); w=importlib.util.module_from_spec(s);s.loader.exec_module(w)
target,stage,backup=map(Path,sys.argv[2:5]);point=sys.argv[5]
replace=w.os.replace
def crash_replace(a,b):
    replace(a,b)
    if point=='after:'+Path(b).name and Path(a).parent==stage and Path(b).parent==target:os._exit(93)
def fault(name):
    if point=='before:'+name:os._exit(93)
w.os.replace=crash_replace
with w.lifecycle_lock(target):w.install_staged(stage,target,backup,'0.8.6','0.8.7',fault=fault)
'''
        for index, point in enumerate(prefix + name for prefix in ('before:', 'after:') for name in worker.RUNTIME):
            with self.subTest(point=point):
                working, stage = self.prepare_stage('termination-' + str(index))
                result = subprocess.run([sys.executable, '-c', script, str(ROOT / 'compat/update-worker.py'),
                                         str(self.target), str(stage), str(self.home / ('backup-' + str(index))), point],
                                        capture_output=True, timeout=20)
                self.assertEqual(result.returncode, 93, result.stderr)
                self.assertTrue((working / 'recover.py').is_file())
                # Child died holding the lock: OS must release it without deleting files.
                with worker.lifecycle_lock(self.target):
                    self.assertTrue(worker.recover_transaction(working, self.target))
                self.assertEqual(self.snapshot(), before)
                self.assertFalse(working.exists())

    def test_failed_recovery_retains_materials_and_can_be_retried(self):
        self.populate()
        before = self.snapshot()
        working, stage = self.prepare_stage()
        replace = worker.os.replace
        def fail_replace(source, target):
            if Path(source).parent.name == 'previous':
                raise OSError('simulated failed rollback')
            return replace(source, target)
        def fault(name):
            if name == 'sidecars': raise OSError('simulated failed installation')
        with patch.object(worker.os, 'replace', side_effect=fail_replace):
            with self.assertRaises(worker.RollbackError):
                worker.install_staged(stage, self.target, self.home / 'backup', '0.8.6', '0.8.7', fault=fault)
        self.assertTrue((working / 'journal.json').exists())
        self.assertTrue((working / 'recovery-backup/plugin.json').exists())
        # Even a second failure midway through recovery must leave a usable backup.
        def fail_recovery(source, target):
            if Path(source).name == 'restore-compat': raise OSError('retry interruption')
            return replace(source, target)
        with patch.object(worker.os, 'replace', side_effect=fail_recovery):
            with self.assertRaises(worker.RollbackError): worker.recover_transaction(working, self.target)
        self.assertTrue(worker.recover_transaction(working, self.target))
        self.assertEqual(self.snapshot(), before)

    def test_backup_failure_precedes_all_runtime_mutation(self):
        self.populate(); before = self.snapshot()
        working, stage = self.prepare_stage()
        with patch.object(worker.shutil, 'copytree', side_effect=OSError('disk full')):
            with self.assertRaises(OSError):
                worker.install_staged(stage, self.target, self.home / 'backup', '0.8.6', '0.8.7')
        worker.recover_transaction(working, self.target)
        self.assertEqual(self.snapshot(), before)

    def test_committed_cleanup_does_not_downgrade_successful_install(self):
        self.populate()
        working, stage = self.prepare_stage()
        worker.install_staged(stage, self.target, self.home / 'backup', '0.8.6', '0.8.7')
        self.assertFalse(worker.recover_transaction(working, self.target))
        self.assertEqual(worker.validate_target(self.target, self.home), '0.8.7')
        self.assertEqual((self.target / 'sidecars/panel/data/history-v1/record.json').read_text(), 'saved statistics')

    def test_lock_excludes_second_process_and_is_reusable_after_exit(self):
        script = '''import importlib.util,sys
from pathlib import Path
s=importlib.util.spec_from_file_location('lock',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
try:
 with m.lifecycle_lock(Path(sys.argv[2])):pass
except FileExistsError:sys.exit(29)
'''
        command = [sys.executable, '-c', script, str(ROOT / 'compat/update-lock.py'), str(self.target)]
        with worker.lifecycle_lock(self.target):
            self.assertEqual(subprocess.run(command, capture_output=True, timeout=10).returncode, 29)
        self.assertEqual(subprocess.run(command, capture_output=True, timeout=10).returncode, 0)

    def test_saved_helper_recovers_when_entry_manifest_is_missing(self):
        self.populate(); before = self.snapshot()
        working, stage = self.prepare_stage('.antigravity-pulse-update-transaction')
        script = '''import importlib.util,os,sys
from pathlib import Path
s=importlib.util.spec_from_file_location('w',sys.argv[1]);w=importlib.util.module_from_spec(s);s.loader.exec_module(w)
def fault(name):
 if name=='plugin.json':os._exit(93)
with w.lifecycle_lock(Path(sys.argv[2])):w.install_staged(Path(sys.argv[3]),Path(sys.argv[2]),Path(sys.argv[4]),'0.8.6','0.8.7',fault=fault)
'''
        result = subprocess.run([sys.executable, '-c', script, str(ROOT / 'compat/update-worker.py'),
                                 str(self.target), str(stage), str(self.home / 'backup')],capture_output=True,timeout=20)
        self.assertEqual(result.returncode,93,result.stderr)
        self.assertFalse((self.target / 'plugin.json').exists())
        env = {**os.environ, 'USERPROFILE':str(self.home), 'HOME':str(self.home)}
        result = subprocess.run([sys.executable, str(working / 'recover.py'),'recover','--target',str(self.target)],
                                env=env,capture_output=True,timeout=20)
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)
        self.assertTrue(json.loads(result.stdout)['result']['recovered'])
        self.assertEqual(before,self.snapshot())

    def test_corrupt_download_cannot_change_installed_files(self):
        self.populate(); before = self.snapshot(); archive=self.archive()
        name = 'antigrative-dashboard-0.8.7.zip'; base=f'https://github.com/{worker.REPO}/releases/download/v0.8.7/'
        plan={'currentVersion':'0.8.6','latestVersion':'0.8.7','host':'app','name':name,
              'url':base+name,'checksumUrl':base+name+'.sha256','size':archive.stat().st_size}
        def fetch(url,limit,destination=None):
            if destination is None:return ('0'*64+'  '+name).encode()
            destination.write_bytes(archive.read_bytes());return archive.stat().st_size
        validate=worker.validate_target
        with patch.object(worker,'validate_target',side_effect=lambda target:validate(target,self.home)), patch.object(worker,'fetch',side_effect=fetch):
            with self.assertRaises(ValueError):worker.perform(plan,self.target,self.home/'updates')
        self.assertEqual(before,self.snapshot())
        self.assertFalse((self.target.parent/'.antigravity-pulse-update-transaction').exists())

    def test_noncanonical_duplicate_paths_and_expansion_budget(self):
        path = self.archive([('antigrative-dashboard/compat/./inline-widget.cjs', 'duplicate')])
        with self.assertRaises(ValueError):worker.stage_archive(path, self.home / 'duplicate-stage', '0.8.7')
        with patch.object(worker, 'MAX_EXPANDED', 1):
            with self.assertRaises(ValueError):worker.stage_archive(self.archive(), self.home / 'budget-stage', '0.8.7')

    @unittest.skipUnless(os.name == 'nt', 'Windows junctions')
    def test_windows_junction_is_rejected_without_touching_destination(self):
        outside = self.home / 'outside';outside.mkdir();(outside / 'keep.txt').write_text('keep')
        (self.target / 'compat').mkdir()
        junction = self.target / 'compat/linked'
        # PowerShell -Command argument binding differs from -File; use a fixed
        # script with environment values rather than interpolating shell code.
        env = {**os.environ, 'PULSE_TEST_LINK':str(junction), 'PULSE_TEST_DEST':str(outside)}
        command = ['powershell', '-NoProfile', '-NonInteractive', '-Command',
                   'New-Item -ItemType Junction -Path $env:PULSE_TEST_LINK -Target $env:PULSE_TEST_DEST | Out-Null']
        result = subprocess.run(command, env=env, capture_output=True, timeout=15)
        self.assertEqual(result.returncode, 0, result.stderr)
        try:
            with self.assertRaises(ValueError):worker.validate_target(self.target, self.home)
            self.assertEqual((outside / 'keep.txt').read_text(), 'keep')
        finally:junction.rmdir()

    def test_progress_feedback_failure_cannot_fail_a_valid_install(self):
        working=self.target.parent/'transaction';working.mkdir()
        stage=working/'stage';worker.stage_archive(self.archive(),stage,'0.8.7')
        def broken(_value):raise RuntimeError('Progress consumer unavailable')
        worker.install_staged(stage,self.target,self.home/'backups/progress','0.8.6','0.8.7',progress=broken)
        self.assertEqual(json.loads((self.target/'plugin.json').read_text())['version'],'0.8.7')

    def test_download_progress_reports_actual_received_bytes(self):
        import io
        from unittest.mock import Mock
        payload=b'x'*70000
        response=io.BytesIO(payload);response.headers={}
        opener=Mock();opener.open.return_value=response
        amounts=[];destination=self.home/'measured-download.zip'
        with patch.object(worker.urllib.request,'build_opener',return_value=opener):
            size=worker.fetch('https://github.com/file',100000,destination=destination,progress=amounts.append)
        self.assertEqual(size,len(payload));self.assertEqual(amounts[-1],len(payload))
        self.assertEqual(destination.read_bytes(),payload)
        self.assertEqual(amounts,sorted(amounts))

    def test_untrusted_download_urls_fail_before_network(self):
        for url in ['http://github.com/file', 'https://evil.example/file', 'https://github.com:444/file', 'https://user:secret@github.com/file']:
            with self.subTest(url=url), patch.object(worker.urllib.request, 'build_opener') as opener:
                with self.assertRaises(ValueError):worker.fetch(url, 10)
                opener.return_value.open.assert_not_called()

    def test_api_connection_failure_uses_same_repository_https_fallback(self):
        import urllib.error
        expected={'tag_name':'v0.8.6','assets':[]}
        for error in [urllib.error.URLError('network unavailable'),TimeoutError()]:
            with patch.object(worker,'fetch',side_effect=error),patch.object(worker,'public_release',return_value=expected) as fallback:
                self.assertEqual(worker.latest_release('0.8.6'),expected);fallback.assert_called_once_with('0.8.6')

    def test_tls_compatibility_keeps_certificate_and_hostname_verification(self):
        import io
        import ssl
        import urllib.error
        from unittest.mock import Mock
        first=Mock(); first.open.side_effect=urllib.error.URLError(ssl.SSLEOFError('handshake'))
        response=io.BytesIO(b'verified');response.headers={}
        second=Mock();second.open.return_value=response
        real_context=ssl.create_default_context
        contexts=[]
        def context():
            value=real_context();contexts.append(value);return value
        with patch.object(worker.urllib.request,'build_opener',side_effect=[first,second]),patch.object(worker.ssl,'create_default_context',side_effect=context):
            self.assertEqual(worker.fetch('https://github.com/file',100),b'verified')
        self.assertEqual(contexts[0].verify_mode,ssl.CERT_REQUIRED)
        self.assertTrue(contexts[0].check_hostname)
        self.assertEqual(contexts[0].maximum_version,ssl.TLSVersion.TLSv1_2)
        first.open.side_effect=urllib.error.URLError(ssl.SSLCertVerificationError('untrusted certificate'))
        with patch.object(worker.urllib.request,'build_opener',return_value=first) as opener:
            with self.assertRaises(urllib.error.URLError):worker.fetch('https://github.com/file',100)
            self.assertEqual(opener.call_count,1)


if __name__ == '__main__':
    unittest.main()
