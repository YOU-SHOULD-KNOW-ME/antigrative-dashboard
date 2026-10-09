"""Publish a checked package, including a previously withdrawn draft release."""
import hashlib
import json
import os
from pathlib import Path
import urllib.parse
import urllib.request
import zipfile


def checked_assets(root, tag):
    version = json.loads((root / 'plugin.json').read_text(encoding='utf-8'))['version']
    if tag != f'v{version}':
        raise ValueError('Tag and plugin version differ')
    bundle = root / 'dist' / f'antigrative-dashboard-{version}.zip'
    checksum = bundle.with_suffix('.zip.sha256')
    if checksum.read_text(encoding='utf-8').split() != [hashlib.sha256(bundle.read_bytes()).hexdigest(), bundle.name]:
        raise ValueError('Package checksum mismatch')
    with zipfile.ZipFile(bundle) as archive:
        prefix = 'antigrative-dashboard/'
        manifest = json.loads(archive.read(prefix + 'plugin.json'))
        if manifest['version'] != version:
            raise ValueError('Packaged version differs')
        for required in ['install.sh', 'uninstall.sh', 'install.ps1', 'compat/runtime-ui.mjs', 'compat/theme.cjs', 'sidecars/panel/context.mjs']:
            archive.getinfo(prefix + required)
    return [bundle, checksum]


class GitHub:
    def __init__(self, repository, token):
        self.base = 'https://api.github.com/repos/' + repository + '/'
        self.headers = {'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json',
                        'User-Agent': 'Antigrative-Dashboard-Release'}

    def request(self, method, path, data=None, content_type='application/json'):
        url = path if path.startswith('https://') else self.base + path
        if urllib.parse.urlparse(url).hostname not in {'api.github.com', 'uploads.github.com'}:
            raise ValueError('Untrusted release endpoint')
        body = json.dumps(data).encode() if isinstance(data, dict) else data
        req = urllib.request.Request(url, data=body, method=method,
                                     headers={**self.headers, 'Content-Type': content_type})
        with urllib.request.urlopen(req, timeout=60) as response:
            result = response.read()
            return json.loads(result) if result else None

    def find(self, tag):
        page = 1
        while True:
            releases = self.request('GET', f'releases?per_page=100&page={page}')
            found = next((release for release in releases if release['tag_name'] == tag), None)
            if found or len(releases) < 100:
                return found
            page += 1


def publish(client, tag, commit, notes, assets):
    release = client.find(tag)
    if release and not release['draft']:
        raise ValueError('Release is already public; withdraw it before replacing its package')
    details = {'tag_name': tag, 'target_commitish': commit, 'name': 'Antigrative Dashboard ' + tag,
               'body': notes, 'draft': True, 'prerelease': False}
    release = client.request('PATCH', 'releases/' + str(release['id']), details) if release else client.request('POST', 'releases', details)
    # All replacements happen while the release is private. Failed uploads leave
    # a draft, never a publicly visible mix of an old ZIP and a new checksum.
    for asset in assets:
        existing = next((entry for entry in release['assets'] if entry['name'] == asset.name), None)
        if existing:
            client.request('DELETE', 'releases/assets/' + str(existing['id']))
        upload = release['upload_url'].split('{', 1)[0] + '?name=' + urllib.parse.quote(asset.name)
        client.request('POST', upload, asset.read_bytes(), 'application/octet-stream')
    uploaded = client.request('GET', 'releases/' + str(release['id']))
    if {asset.name for asset in assets} != {entry['name'] for entry in uploaded['assets']}:
        raise ValueError('Uploaded assets differ from the checked package')
    result = client.request('PATCH', 'releases/' + str(release['id']), {'draft': False, 'make_latest': 'true'})
    if result['draft'] or result['tag_name'] != tag:
        raise ValueError('Publication verification failed')
    return result['html_url']


if __name__ == '__main__':
    root = Path(__file__).resolve().parents[1]
    tag = os.environ['GITHUB_REF_NAME']
    assets = checked_assets(root, tag)
    client = GitHub(os.environ['GITHUB_REPOSITORY'], os.environ['GH_TOKEN'])
    print(publish(client, tag, os.environ['GITHUB_SHA'], (root / 'GITHUB_RELEASE.md').read_text(encoding='utf-8'), assets))
