"""Build the allowlisted Antigravity IDE VSIX without third-party dependencies."""
import argparse
import hashlib
import json
from pathlib import Path
from xml.sax.saxutils import escape, quoteattr
import zipfile

ROOT = Path(__file__).resolve().parent.parent
MODULES = [f'compat/{name}' for name in ['runtime-ui.mjs', 'platform.mjs', 'preferences.mjs',
    'sidecar-owner.mjs', 'i18n.cjs', 'theme.cjs', 'inline-widget.cjs', 'usage-ui.cjs']]
MODULES += [f'sidecars/panel/{name}.mjs' for name in ['client', 'trajectory-json', 'trajectory-reader', 'discovery', 'store', 'history', 'metrics', 'rate-quality', 'context', 'transcript', 'usage', 'local-conversations']]
MODULES += [f'ide/{name}' for name in ['extension.cjs', 'host.cjs', 'main.mjs', 'client.mjs',
    'discovery.mjs', 'runtime.mjs', 'surface.cjs', 'launch.mjs', 'manage.py']]


def build(output=None):
    package = json.loads((ROOT / 'ide/package.json').read_text(encoding='utf-8'))
    output = Path(output) if output else ROOT / 'dist' / f"antigrative-dashboard-ide-{package['version']}.vsix"
    files = MODULES + ['LICENSE', 'ide/README.md']
    for name in files:
        if not (ROOT / name).is_file():
            raise ValueError('Missing IDE package file: ' + name)
    manifest = f'''<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011">
<Metadata><Identity Language="en-US" Id={quoteattr(package['name'])} Version={quoteattr(package['version'])} Publisher={quoteattr(package['publisher'])}/>
<DisplayName>{escape(package['displayName'])}</DisplayName><Description xml:space="preserve">{escape(package['description'])}</Description>
<Tags>antigravity,dashboard</Tags><Categories>Other</Categories>
<Properties><Property Id="Microsoft.VisualStudio.Code.Engine" Value={quoteattr(package['engines']['vscode'])}/></Properties></Metadata>
<Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation><Dependencies/>
<Assets><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/>
<Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/README.md" Addressable="true"/>
<Asset Type="Microsoft.VisualStudio.Services.Content.License" Path="extension/LICENSE" Addressable="true"/></Assets></PackageManifest>'''
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_name(output.name + '.tmp')
    try:
        with zipfile.ZipFile(temporary, 'w', zipfile.ZIP_DEFLATED) as archive:
            archive.writestr('extension.vsixmanifest', manifest)
            archive.writestr('[Content_Types].xml', '''<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="json" ContentType="application/json"/><Default Extension="mjs" ContentType="text/javascript"/><Default Extension="cjs" ContentType="text/javascript"/><Default Extension="py" ContentType="text/plain"/><Default Extension="md" ContentType="text/markdown"/><Default Extension="vsixmanifest" ContentType="text/xml"/><Override PartName="/extension/LICENSE" ContentType="text/plain"/></Types>''')
            archive.writestr('extension/package.json', json.dumps(package, indent=2) + '\n')
            for name in files:
                target = 'README.md' if name == 'ide/README.md' else name
                archive.write(ROOT / name, 'extension/' + target)
        temporary.replace(output)
    finally:
        temporary.unlink(missing_ok=True)
    output.with_suffix('.vsix.sha256').write_text(
        hashlib.sha256(output.read_bytes()).hexdigest() + '  ' + output.name + '\n', encoding='utf-8')
    return output


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path)
    print(build(parser.parse_args().output))
