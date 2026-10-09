import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('publish_release', Path(__file__).resolve().parents[1] / 'tools' / 'publish-release.py')
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)


class FakeGitHub:
    def __init__(self, fail=False, public=False):
        self.release = {'id': 1, 'tag_name': 'v0.5.0', 'draft': not public,
                        'assets': [{'id': 10, 'name': 'bundle.zip'}, {'id': 11, 'name': 'bundle.zip.sha256'}],
                        'upload_url': 'https://uploads.github.com/repos/test/test/releases/1/assets{?name,label}',
                        'html_url': 'https://github.com/test/test/releases/tag/v0.5.0'}
        self.fail = fail
        self.publications = 0

    def find(self, tag):
        return self.release

    def request(self, method, path, data=None, content_type=None):
        if method == 'DELETE':
            self.release['assets'] = [a for a in self.release['assets'] if str(a['id']) != path.rsplit('/', 1)[1]]
        elif method == 'POST':
            if self.fail:
                raise OSError('upload failed')
            self.release['assets'].append({'id': 20 + len(self.release['assets']), 'name': path.split('name=')[1]})
        elif method == 'PATCH':
            if data.get('draft') is False:
                self.publications += 1
            self.release.update(data)
        return self.release


class ReleaseTests(unittest.TestCase):
    def assets(self, directory):
        paths = [Path(directory) / 'bundle.zip', Path(directory) / 'bundle.zip.sha256']
        for path in paths:
            path.write_bytes(b'checked replacement')
        return paths

    def test_withdrawn_draft_replaces_both_assets_before_publication(self):
        with tempfile.TemporaryDirectory() as directory:
            client = FakeGitHub()
            url = publisher.publish(client, 'v0.5.0', 'new-commit', 'updated notes', self.assets(directory))
            self.assertTrue(url.endswith('/v0.5.0'))
            self.assertEqual(client.publications, 1)
            self.assertFalse(client.release['draft'])
            self.assertEqual(client.release['target_commitish'], 'new-commit')
            self.assertEqual({a['name'] for a in client.release['assets']}, {'bundle.zip', 'bundle.zip.sha256'})

    def test_failed_upload_leaves_private_draft_without_publishing(self):
        with tempfile.TemporaryDirectory() as directory:
            client = FakeGitHub(fail=True)
            with self.assertRaises(OSError):
                publisher.publish(client, 'v0.5.0', 'new-commit', 'notes', self.assets(directory))
            self.assertTrue(client.release['draft'])
            self.assertEqual(client.publications, 0)

    def test_public_release_cannot_be_silently_replaced(self):
        client = FakeGitHub(public=True)
        with self.assertRaisesRegex(ValueError, 'already public'):
            publisher.publish(client, 'v0.5.0', 'new-commit', 'notes', [])
        self.assertEqual(client.publications, 0)
