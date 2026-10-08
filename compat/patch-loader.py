"""Reversible adapter mounting Antigrative Dashboard in supported chat composers.

--check prepares and validates the archive in memory without modifying the app.
--apply makes an original-file backup, then writes the prepared archive.
--restore BACKUP restores only if the current file matches that backup's patch.
"""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import struct

HERE = Path(__file__).resolve().parent
APP = Path(os.environ['LOCALAPPDATA']) / 'Programs' / 'antigravity' / 'resources' / 'app.asar'
MARKER = '// AG_PULSE_INLINE_V1'
SUPPORTED_VERSIONS = {'2.19.1'}

def walk(entry, prefix=''):
    for key, value in entry.get('files', {}).items():
        path = f'{prefix}/{key}' if prefix else key
        if 'files' in value:
            yield from walk(value, path)
        elif 'offset' in value and not value.get('unpacked'):
            yield path, value

def archive(data):
    sizes = struct.unpack('<4I', data[:16])
    header = json.loads(data[16:16 + sizes[3]])
    return header, 8 + sizes[1]

def unpatched_original(current):
    header,base=archive(current)
    entry=header['files']['dist']['files']['preload.js']
    preload=current[base+int(entry['offset']):base+int(entry['offset'])+entry['size']]
    if MARKER.encode() not in preload:
        return current
    digest=hashlib.sha256(current).hexdigest()
    backups=Path(os.environ['LOCALAPPDATA'])/'AntigravityPulseBackups'
    for directory in sorted(backups.iterdir(),reverse=True):
        note_path=directory/'patch.json'
        if not note_path.is_file():continue
        note=json.loads(note_path.read_text(encoding='utf-8'))
        if note.get('patchedSha256')!=digest:continue
        original=(directory/'app.asar').read_bytes()
        if hashlib.sha256(original).hexdigest()!=note['originalSha256']:
            raise RuntimeError('Original archive backup integrity mismatch.')
        return original
    raise RuntimeError('The installed adapter has other changes; refusing to overwrite them.')

def build(data):
    header, base = archive(data)
    files = list(walk(header))
    bodies = {name:data[base+int(entry['offset']):base+int(entry['offset'])+entry['size']] for name,entry in files}
    version = json.loads(bodies['package.json']).get('version')
    if version not in SUPPORTED_VERSIONS:
        raise RuntimeError(f'Unsupported Antigravity version {version}; supported: {sorted(SUPPORTED_VERSIONS)}.')
    old = bodies['dist/preload.js'].decode('utf-8')
    if 'electron_1.contextBridge.exposeInMainWorld' not in old:
        raise RuntimeError('The renderer bridge is incompatible with this app build.')
    if MARKER in old:
        raise RuntimeError('The UI adapter is already installed.')
    source = (HERE/'inline-widget.cjs').read_text(encoding='utf-8')
    prefix = 'module.exports = '
    function = source[source.index(prefix)+len(prefix):].strip().removesuffix(';')
    addition = f'''\n{MARKER}
electron_1.contextBridge.exposeInMainWorld("agPulseHost", {{
  getMetrics: (input) => electron_1.ipcRenderer.invoke("ag-pulse:metrics", input),
  report: (state) => electron_1.ipcRenderer.send("ag-pulse:diagnostic", state)
}});
'''
    bodies['dist/preload.js'] = (old+addition).encode()
    ipc_source=bodies['dist/ipcHandlers.js'].decode('utf-8')
    if 'customScheme_1.extensionAuthorities' not in ipc_source:
        raise RuntimeError('The local IPC integration is incompatible with this app build.')
    host=(HERE/'ipc-host.cjs').read_text(encoding='utf-8')
    host_function=host[host.index(prefix)+len(prefix):].strip().removesuffix(';')
    bodies['dist/ipcHandlers.js']=(ipc_source+f'\n{MARKER}\n({host_function})(electron_1, customScheme_1.extensionAuthorities);\n').encode()
    utils=bodies['dist/utils.js'].decode('utf-8')
    anchor='    win.webContents.setWindowOpenHandler((details) => {'
    if utils.count(anchor)!=1:raise RuntimeError('Window startup integration is incompatible with this build.')
    i18n_source=(HERE/'i18n.cjs').read_text(encoding='utf-8')
    i18n_function=i18n_source[i18n_source.index(prefix)+len(prefix):].strip().removesuffix(';')
    script=json.dumps(f'window.__agPulseI18nFactory=({i18n_function});({function})();',ensure_ascii=True)
    hook=f'''    {MARKER}
    win.webContents.on('dom-ready', () => {{
        void win.webContents.executeJavaScript({script}).catch(() => console.warn('[Antigrative Dashboard] Widget startup failed.'));
    }});
'''
    bodies['dist/utils.js']=utils.replace(anchor,hook+anchor,1).encode()
    cursor = 0
    packed = []
    for name, entry in sorted(files,key=lambda item:int(item[1]['offset'])):
        body = bodies[name]
        entry['offset'] = str(cursor)
        entry['size'] = len(body)
        if 'integrity' in entry:
            block = entry['integrity'].get('blockSize',4194304)
            entry['integrity'] = {'algorithm':'SHA256','hash':hashlib.sha256(body).hexdigest(),'blockSize':block,
                'blocks':[hashlib.sha256(body[i:i+block]).hexdigest() for i in range(0,len(body),block)]}
        packed.append(body)
        cursor += len(body)
    raw = json.dumps(header,separators=(',',':'),ensure_ascii=False).encode()
    pad = (-len(raw))%4
    result = struct.pack('<4I',4,8+len(raw)+pad,4+len(raw)+pad,len(raw))+raw+b'\x00'*pad+b''.join(packed)
    verified, new_base = archive(result)
    for name, entry in walk(verified):
        value = result[new_base+int(entry['offset']):new_base+int(entry['offset'])+entry['size']]
        assert value == bodies[name]
        if 'integrity' in entry: assert hashlib.sha256(value).hexdigest()==entry['integrity']['hash']
    return result

def main():
    parser=argparse.ArgumentParser()
    group=parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--check',action='store_true')
    group.add_argument('--apply',action='store_true')
    group.add_argument('--restore',type=Path)
    args=parser.parse_args()
    if args.restore:
        note=json.loads((args.restore/'patch.json').read_text(encoding='utf-8'))
        current=APP.read_bytes()
        if hashlib.sha256(current).hexdigest()!=note['patchedSha256']:
            raise RuntimeError('The app changed after patching; refusing to overwrite newer app files.')
        original=(args.restore/'app.asar').read_bytes()
        assert hashlib.sha256(original).hexdigest()==note['originalSha256']
        APP.write_bytes(original)
        print('Restored original Antigravity archive.')
        return
    current=APP.read_bytes()
    original=unpatched_original(current)
    patched=build(original)
    print('Validated: all packed files, offsets, and SHA256 integrity.')
    if args.check:
        print('Dry run only. No application files modified.')
        return
    if current==patched:
        print('Antigrative Dashboard adapter is already current.')
        return
    backup=Path(os.environ['LOCALAPPDATA'])/'AntigravityPulseBackups'/datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
    backup.mkdir(parents=True,exist_ok=False)
    (backup/'app.asar').write_bytes(original)
    original_header, original_base = archive(original)
    package_entry = original_header['files']['package.json']
    package_start = original_base + int(package_entry['offset'])
    app_version = json.loads(original[package_start:package_start+package_entry['size']]).get('version')
    (backup/'patch.json').write_text(json.dumps({'originalSha256':hashlib.sha256(original).hexdigest(),
        'patchedSha256':hashlib.sha256(patched).hexdigest(),
        'appVersion':app_version},indent=2),encoding='utf-8')
    try:
        APP.write_bytes(patched)
        assert APP.read_bytes()==patched
    except Exception:
        APP.write_bytes(current)
        raise
    print('Local UI adapter installed. Restart Antigravity to activate.')
    print('Original archive backup:',backup)

if __name__=='__main__':main()
