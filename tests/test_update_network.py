"""Deterministic updater routing, trust and shared-budget regression tests."""
import importlib.util
import io
import os
from pathlib import Path
import socket
import ssl
import unittest
import urllib.error
from unittest.mock import Mock, patch


spec = importlib.util.spec_from_file_location('network_worker', Path(__file__).resolve().parents[1] / 'compat/update-worker.py')
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


class UpdateNetworkTests(unittest.TestCase):
    def proxies(self, environment, platform='nt'):
        registry = {'http': 'http://system:8080', 'https': 'http://system:8080'}
        with patch.object(worker.os, 'environ', environment), patch.object(worker.os, 'name', platform), \
                patch.object(worker.urllib.request, 'getproxies_registry', return_value=registry, create=True) as get_registry:
            result = worker.update_proxies()
        return result, get_registry

    def test_no_proxy_alone_preserves_windows_static_proxy(self):
        result, _ = self.proxies({'NO_PROXY': 'localhost,127.0.0.1'})
        self.assertEqual(result, {'http': 'http://system:8080', 'https': 'http://system:8080', 'no': 'localhost,127.0.0.1'})

    def test_env_overrides_only_its_scheme_and_lowercase_wins(self):
        result, _ = self.proxies({'HTTPS_PROXY': 'http://upper:8080', 'https_proxy': 'http://lower:8080'})
        self.assertEqual(result['https'], 'http://lower:8080')
        self.assertEqual(result['http'], 'http://system:8080')

    def test_explicit_empty_disables_scheme_and_no_proxy(self):
        result, _ = self.proxies({'HTTPS_PROXY': 'http://upper:8080', 'https_proxy': '', 'HTTP_PROXY': ''})
        self.assertNotIn('https', result)
        self.assertNotIn('http', result)

    def test_cgi_uppercase_http_proxy_is_ignored(self):
        result, _ = self.proxies({'REQUEST_METHOD': 'GET', 'HTTP_PROXY': 'http://header:8080'})
        self.assertEqual(result['http'], 'http://system:8080')

    def test_other_os_does_not_read_windows_registry(self):
        result, registry = self.proxies({'https_proxy': 'http://env:8080', 'no_proxy': 'localhost'}, platform='posix')
        self.assertEqual(result, {'https': 'http://env:8080', 'no': 'localhost'})
        registry.assert_not_called()

    def test_tls_retry_reuses_explicit_proxy_and_keeps_verification(self):
        first, second = Mock(), Mock()
        first.open.side_effect = urllib.error.URLError(ssl.SSLEOFError('handshake'))
        response = io.BytesIO(b'verified'); response.headers = {}
        second.open.return_value = response
        with patch.object(worker, 'update_proxies', return_value={'https': 'http://configured:8080'}) as proxies, \
                patch.object(worker.urllib.request, 'build_opener', side_effect=[first, second]) as build:
            self.assertEqual(worker.fetch('https://github.com/file', 100), b'verified')
        proxies.assert_called_once_with()
        for call in build.call_args_list:
            self.assertEqual(call.args[0].proxies, {'https': 'http://configured:8080'})
        context = build.call_args_list[1].args[2]._context
        self.assertTrue(context.check_hostname)
        self.assertEqual(context.verify_mode, ssl.CERT_REQUIRED)
        self.assertEqual(context.maximum_version, ssl.TLSVersion.TLSv1_2)

    def test_certificate_failure_never_downgrades_tls(self):
        opener = Mock()
        opener.open.side_effect = urllib.error.URLError(ssl.SSLCertVerificationError('secret proxy text'))
        with patch.object(worker.urllib.request, 'build_opener', return_value=opener) as build:
            with self.assertRaises(worker.NetworkError) as raised:
                worker.fetch('https://github.com/file', 100)
        self.assertEqual(raised.exception.detail, 'certificate')
        self.assertNotIn('secret', str(raised.exception))
        self.assertEqual(build.call_count, 1)

    def test_network_categories_are_static_and_certificate_has_priority(self):
        cases = [(TimeoutError(), 'timeout'), (socket.gaierror(), 'dns'),
                 (ConnectionResetError(), 'connection'),
                 (urllib.error.HTTPError('https://secret', 503, 'secret', {}, None), 'http'),
                 (urllib.error.HTTPError('https://secret', 407, 'secret', {}, None), 'proxy'),
                 (urllib.error.URLError(OSError('Tunnel connection failed: 407 secret')), 'proxy')]
        for error, expected in cases:
            self.assertEqual(worker.network_failure(error), expected)
        self.assertIsNone(worker.network_failure(ValueError('bad archive')))
        outer = worker.NetworkError('timeout')
        outer.__cause__ = urllib.error.URLError(ssl.SSLCertVerificationError('private'))
        self.assertEqual(worker.network_failure(outer), 'certificate')
        self.assertEqual(worker.NetworkError('unsafe category').detail, 'connection')

    def test_expired_deadline_never_opens_connection(self):
        opener = Mock()
        with patch.object(worker.time, 'monotonic', return_value=20), \
                patch.object(worker.urllib.request, 'build_opener', return_value=opener):
            with self.assertRaises(worker.NetworkError) as raised:
                worker.fetch('https://github.com/file', 100, deadline=20)
        self.assertEqual(raised.exception.detail, 'timeout')
        opener.open.assert_not_called()

    def test_remaining_budget_clamps_connection_and_incremental_reads(self):
        clock = [0]
        class SlowResponse(io.BytesIO):
            headers = {}
            def read1(self, _size):
                clock[0] += 3
                return super().read(1)
            def read(self, _size):
                raise AssertionError('Must use one socket read per deadline check')
        opener = Mock(); opener.open.return_value = SlowResponse(b'abc')
        with patch.object(worker.time, 'monotonic', side_effect=lambda: clock[0]), \
                patch.object(worker.urllib.request, 'build_opener', return_value=opener):
            with self.assertRaises(worker.NetworkError) as raised:
                worker.fetch('https://github.com/file', 100, deadline=5)
        self.assertEqual(raised.exception.detail, 'timeout')
        self.assertEqual(opener.open.call_args.kwargs['timeout'], 5)

    def test_api_budget_reserves_time_for_shared_fallback(self):
        with patch.object(worker.time, 'monotonic', return_value=10), \
                patch.object(worker, 'fetch', side_effect=TimeoutError()) as fetch, \
                patch.object(worker, 'public_release', return_value={'tag_name': 'v0.8.9'}) as fallback:
            self.assertEqual(worker.latest_release('0.8.7')['tag_name'], 'v0.8.9')
        self.assertEqual(fetch.call_args.kwargs['deadline'], 10 + worker.API_BUDGET)
        self.assertEqual(fallback.call_args.kwargs['deadline'], 10 + worker.CHECK_BUDGET)

    def test_fallback_does_not_hide_initial_certificate_failure(self):
        with patch.object(worker, 'fetch', side_effect=worker.NetworkError('certificate')), \
                patch.object(worker, 'public_release', side_effect=worker.NetworkError('timeout')):
            with self.assertRaises(worker.NetworkError) as raised:
                worker.latest_release('0.8.7')
        self.assertEqual(worker.network_failure(raised.exception), 'certificate')

    def test_public_fallback_shares_deadline_across_html_and_head_requests(self):
        base = f'https://github.com/{worker.REPO}/releases/download/v0.8.9/'
        name = 'antigrative-dashboard-0.8.9.zip'
        content = ''.join(f'<a href="{base}{filename}">asset</a>' for filename in (name, name + '.sha256')).encode()
        answers = [(b'', f'https://github.com/{worker.REPO}/releases/tag/v0.8.9', None),
                   content, (0, base + name, '123'), (0, base + name + '.sha256', '99')]
        with patch.object(worker, 'fetch', side_effect=answers) as fetch:
            result = worker.public_release('0.8.7', deadline=70)
        self.assertEqual(result['assets'][0]['size'], 123)
        self.assertEqual([call.kwargs['deadline'] for call in fetch.call_args_list], [70] * 4)
        self.assertEqual([call.kwargs.get('method') for call in fetch.call_args_list], [None, None, 'HEAD', 'HEAD'])

    def test_http_rate_limit_uses_fallback_other_status_does_not(self):
        for status in (403, 429, 404, 500):
            with self.subTest(status=status), \
                    patch.object(worker, 'fetch', side_effect=worker.NetworkError('http', status)), \
                    patch.object(worker, 'public_release', return_value={'tag_name': 'v0.8.9'}) as fallback:
                if status in (403, 429):
                    worker.latest_release('0.8.7'); fallback.assert_called_once()
                else:
                    with self.assertRaises(worker.NetworkError): worker.latest_release('0.8.7')
                    fallback.assert_not_called()


if __name__ == '__main__':
    unittest.main()
