import importlib.util
import json
import os
from pathlib import Path
import struct
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('pulse_archive', ROOT / 'compat' / 'patch-loader.py')
archive = importlib.util.module_from_spec(spec)
spec.loader.exec_module(archive)

def fixture(version='2.19.1'):
    content = {
        'package.json': json.dumps({'version':version}).encode(),
        'dist/preload.js': b'const electron_1 = require("electron"); electron_1.contextBridge.exposeInMainWorld("test", {});\n',
        'dist/ipcHandlers.js': b'const electron_1 = require("electron"); const customScheme_1 = {extensionAuthorities:new Map()}; customScheme_1.extensionAuthorities.clear();\n',
        'dist/utils.js': b'function make(win) {\n    win.webContents.setWindowOpenHandler((details) => {\n    });\n}\n',
        'untouched.bin': b'\x00\x01\xffPreserve this data',
    }
    header={'files':{}}
    cursor=0; bodies=[]
    for name,body in content.items():
        entry=header
        parts=name.split('/')
        for part in parts[:-1]:entry=entry['files'].setdefault(part,{'files':{}})
        entry['files'][parts[-1]]={'size':len(body),'offset':str(cursor)}
        cursor+=len(body);bodies.append(body)
    raw=json.dumps(header,separators=(',',':')).encode();pad=(-len(raw))%4
    return struct.pack('<4I',4,8+len(raw)+pad,4+len(raw)+pad,len(raw))+raw+b'\x00'*pad+b''.join(bodies)

class ArchiveTests(unittest.TestCase):
    def test_three_loader_files_change_and_unrelated_content_survives(self):
        original=fixture();patched=archive.build(original)
        def bodies(data):
            h,base=archive.archive(data)
            return {name:data[base+int(e['offset']):base+int(e['offset'])+e['size']] for name,e in archive.walk(h)}
        before,after=bodies(original),bodies(patched)
        changed={name for name in before if before[name]!=after[name]}
        self.assertEqual(changed,{'dist/preload.js','dist/ipcHandlers.js','dist/utils.js'})
        self.assertEqual(after['untouched.bin'],before['untouched.bin'])
        self.assertIn(b'dom-ready',after['dist/utils.js'])
        self.assertIn(b'ag-pulse:metrics',after['dist/preload.js'])

    def test_unknown_app_version_is_rejected(self):
        with self.assertRaises(RuntimeError):archive.build(fixture('2.20.0'))

    def test_already_patched_archive_cannot_be_stacked(self):
        with self.assertRaises(RuntimeError):archive.build(archive.build(fixture()))

if __name__ == '__main__':unittest.main()
