import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def module(name, file):
    spec = importlib.util.spec_from_file_location(name, ROOT / file)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


packager = module('ide_package', 'ide/package.py')
manager = module('ide_manage', 'ide/manage.py')
desktop_manager = module('ide_desktop_package', 'manage.py')
publisher = module('ide_release_check', 'tools/publish-release.py')


class IdeTests(unittest.TestCase):
    def test_release_rejects_any_missing_large_conversation_module_in_either_package(self):
        # Recompute each package checksum after removing one required file. The
        # publisher must validate contents, not rely only on a matching digest.
        with tempfile.TemporaryDirectory() as temporary:
            fixture = Path(temporary)
            package = json.loads((ROOT / 'plugin.json').read_text(encoding='utf-8'))
            version = package['version']
            (fixture / 'ide').mkdir()
            (fixture / 'plugin.json').write_text(json.dumps(package), encoding='utf-8')
            (fixture / 'ide/package.json').write_bytes((ROOT / 'ide/package.json').read_bytes())
            desktop = fixture / 'dist' / f'antigrative-dashboard-{version}.zip'
            ide = fixture / 'dist' / f'antigrative-dashboard-ide-{version}.vsix'
            desktop_manager.package(desktop)
            packager.build(ide)
            for output, prefix in [(desktop, 'antigrative-dashboard/'), (ide, 'extension/')]:
                pristine = output.read_bytes()
                checksum = output.with_suffix(output.suffix + '.sha256')
                original_checksum = checksum.read_bytes()
                for name in publisher.LARGE_CONVERSATION_MODULES:
                    with self.subTest(package=output.suffix, module=name):
                        removed = prefix + name
                        with zipfile.ZipFile(io.BytesIO(pristine)) as source, zipfile.ZipFile(output, 'w') as altered:
                            for info in source.infolist():
                                if info.filename != removed:
                                    altered.writestr(info, source.read(info.filename))
                        checksum.write_text(hashlib.sha256(output.read_bytes()).hexdigest() + '  ' + output.name + '\n', encoding='utf-8')
                        with self.assertRaises(KeyError):
                            publisher.checked_assets(fixture, 'v' + version)
                        output.write_bytes(pristine)
                        checksum.write_bytes(original_checksum)
            self.assertEqual(len(publisher.checked_assets(fixture, 'v' + version)), 4)

    def test_release_requires_four_consistent_assets_and_rejects_tampered_vsix(self):
        with tempfile.TemporaryDirectory() as temporary:
            fixture = Path(temporary)
            package = json.loads((ROOT / 'plugin.json').read_text())
            version = package['version']
            (fixture / 'ide').mkdir()
            (fixture / 'plugin.json').write_text(json.dumps(package))
            (fixture / 'ide/package.json').write_bytes((ROOT / 'ide/package.json').read_bytes())
            desktop_manager.package(fixture / 'dist' / f'antigrative-dashboard-{version}.zip')
            vsix = packager.build(fixture / 'dist' / f'antigrative-dashboard-ide-{version}.vsix')
            self.assertEqual(len(publisher.checked_assets(fixture, 'v' + version)), 4)
            vsix.write_bytes(vsix.read_bytes() + b'tampered')
            with self.assertRaisesRegex(ValueError, 'IDE package checksum mismatch'):
                publisher.checked_assets(fixture, 'v' + version)

    def test_vsix_contains_complete_runtime_and_install_instructions_without_private_files(self):
        with tempfile.TemporaryDirectory() as temporary:
            output = packager.build(Path(temporary) / 'ide.vsix')
            with zipfile.ZipFile(output) as archive:
                names = archive.namelist()
                for name in packager.MODULES:
                    self.assertIn('extension/' + name, names)
                self.assertIn('extension/README.md', names)
                package = json.loads(archive.read('extension/package.json'))
                self.assertEqual(package['version'], json.loads((ROOT / 'plugin.json').read_text())['version'])
                self.assertEqual(package['extensionKind'], ['ui'])
                manifest = ET.fromstring(archive.read('extension.vsixmanifest'))
                identity = manifest.find('{*}Metadata/{*}Identity')
                self.assertEqual(identity.get('Version'), package['version'])
                ET.fromstring(archive.read('[Content_Types].xml'))
                self.assertFalse(any('/history-v1/' in n or '/tests/' in n or n.endswith(('.log','.asar','.pyc')) for n in names))
            self.assertEqual(output.with_suffix('.vsix.sha256').read_text().split(),
                             [hashlib.sha256(output.read_bytes()).hexdigest(), output.name])

    def test_missing_runtime_does_not_overwrite_existing_package(self):
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / 'ide.vsix'
            output.write_bytes(b'previous verified bundle')
            with patch.object(packager, 'MODULES', ['ide/missing-module.cjs']):
                with self.assertRaisesRegex(ValueError, 'Missing IDE'):
                    packager.build(output)
            self.assertEqual(output.read_bytes(), b'previous verified bundle')

    def fixture(self, directory, mac=False, identity='antigravity-ide'):
        root = Path(directory)
        executable = root / ('Contents/MacOS/Antigravity IDE' if mac else 'Antigravity IDE.exe')
        app = root / ('Contents/Resources/app' if mac else 'resources/app')
        executable.parent.mkdir(parents=True, exist_ok=True)
        executable.write_bytes(b'fixture')
        (app / 'out').mkdir(parents=True)
        (app / 'out/cli.js').write_text('// fixture')
        (app / 'product.json').write_text(json.dumps({'applicationName': identity}))
        return executable, app

    def test_installer_verifies_host_and_preserves_argument_paths(self):
        for mac in [False, True]:
            with tempfile.TemporaryDirectory(prefix='IDE spaces ') as temporary:
                executable, app = self.fixture(temporary, mac)
                vsix = Path(temporary) / 'extension with spaces.vsix'
                vsix.write_bytes(b'fixture')
                calls = []
                manager.manage('install', executable, vsix, run=lambda args, **kw: calls.append((args, kw)))
                self.assertEqual(calls[0][0], [str(executable.resolve()), str((app / 'out/cli.js').resolve()), '--install-extension', str(vsix.resolve()), '--force'])
                self.assertEqual(calls[0][1]['env']['ELECTRON_RUN_AS_NODE'], '1')
                self.assertTrue(calls[0][1]['check'])

    def test_other_editor_is_rejected_before_install_or_launch(self):
        with tempfile.TemporaryDirectory() as temporary:
            executable, _ = self.fixture(temporary, identity='code')
            with self.assertRaisesRegex(ValueError, 'standalone Antigravity IDE'):
                manager.manage('launch', executable, spawn=lambda *a, **k: self.fail('Wrong editor launched'))

    def test_launch_uses_only_loopback_and_removes_node_mode(self):
        with tempfile.TemporaryDirectory() as temporary:
            executable, _ = self.fixture(temporary)
            calls = []
            with patch.dict('os.environ', {'ELECTRON_RUN_AS_NODE': '1'}):
                manager.manage('launch', executable, workspace=temporary, spawn=lambda args, **kw: calls.append((args, kw)))
            self.assertEqual(calls[0][0][1:3], manager.DEBUG_ARGS)
            self.assertNotIn('ELECTRON_RUN_AS_NODE', calls[0][1]['env'])
            self.assertEqual(calls[0][0][-1], str(Path(temporary).resolve()))

    def test_uninstall_removes_only_the_ide_extension(self):
        with tempfile.TemporaryDirectory() as temporary:
            executable, _ = self.fixture(temporary)
            calls = []
            manager.manage('uninstall', executable, run=lambda args, **kw: calls.append(args))
            self.assertEqual(calls[0][-2:], ['--uninstall-extension', manager.IDENTITY])
