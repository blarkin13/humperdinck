import importlib.util
import pathlib
import unittest

PATH=pathlib.Path(__file__).resolve().parents[1]/"scripts"/"monitor-production.py"
spec=importlib.util.spec_from_file_location("humperdinck_monitor",PATH)
monitor=importlib.util.module_from_spec(spec)
spec.loader.exec_module(monitor)

class MonitorAcceptance(unittest.TestCase):
    def fake(self, path):
        if path in ("/","/help/","/account/"):
            canonical="" if path=="/account/" else f'<link rel="canonical" href="https://humperdinck.studio{path}">'
            return 200, {}, (f"<html><head><title>Humperdinck</title>{canonical}</head></html>").encode()
        if path=="/sitemap.xml": return 200,{},b'<?xml version="1.0"?><urlset></urlset>'
        if path=="/robots.txt": return 200,{},b'Sitemap: https://humperdinck.studio/sitemap.xml'
        if path=="/downloads.json": return 200,{},b'{"windows":{},"macos":{},"linux":{}}'
        if path=="/updates/latest.json": return 200,{},b'{"version":"0.1.26","platforms":{}}'
        if path=="/api/account/dashboard/analytics": return 401,{},b'{"error":"Sign in required"}'
        if path=="/.well-known/humperdinck-deployment.json":
            return 200,{},('{"provenance_verified":true,"source_git_sha":"'+'a'*40+'"}').encode()
        raise AssertionError(path)

    def test_success(self):
        result=monitor.monitor(read_fn=self.fake)
        self.assertEqual(result["result"],"PASS")
        self.assertEqual(len(result["checks"]),9)

    def test_site_failure_changes_result(self):
        def broken(path):
            if path=="/":return 502,{},b'bad gateway'
            return self.fake(path)
        result=monitor.monitor(read_fn=broken)
        self.assertEqual(result["result"],"FAIL")
        self.assertFalse(next(c for c in result["checks"] if c["name"]=="public:/")["pass"])

    def test_private_dashboard_cannot_leak_to_anonymous(self):
        def leaking(path):
            if path=="/api/account/dashboard/analytics":
                return 200,{},b'{"events":{"page_views":50}}'
            return self.fake(path)
        result=monitor.monitor(read_fn=leaking)
        self.assertEqual(result["result"],"FAIL")
        self.assertFalse(next(c for c in result["checks"] if c["name"]=="security:anonymous-analytics")["pass"])

    def test_incorrect_release_feed_fails(self):
        def empty(path):
            if path=="/downloads.json":return 200,{},b'{}'
            return self.fake(path)
        self.assertEqual(monitor.monitor(read_fn=empty)["result"],"FAIL")

    def test_provenance_unverified_fails(self):
        def invalid(path):
            if path=="/.well-known/humperdinck-deployment.json":
                return 503,{},b'{"provenance_verified":false}'
            return self.fake(path)
        self.assertEqual(monitor.monitor(read_fn=invalid)["result"],"FAIL")

if __name__=="__main__":
    unittest.main()
