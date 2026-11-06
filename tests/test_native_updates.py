import json
from io import BytesIO
from backend import native_updates

class Response:
    def __init__(self, data):
        self.file = BytesIO(json.dumps(data).encode())
    def __enter__(self):
        return self.file
    def __exit__(self, *args):
        self.file.close()

def test_website_binary_release(monkeypatch):
    manifest = {
        "macos": {"published": True, "version": "0.2.0",
                  "url": "/downloads/humperdinck-macos-arm64-0.2.0.dmg"},
    }
    monkeypatch.setattr(native_updates, "urlopen",
                        lambda req,timeout,context=None: Response(manifest))
    monkeypatch.setattr(native_updates.sys, "platform", "darwin")
    got = native_updates.check()
    assert got["available"] and got["latest"] == "0.2.0"
    assert not got["can_install"] and got["can_download"]
    assert got["download_url"].startswith("https://humperdinck.larki-brian.workers.dev/downloads/")

def test_no_binary_release(monkeypatch):
    monkeypatch.setattr(native_updates, "urlopen",
                        lambda req,timeout,context=None: Response({"macos": {"published": False}}))
    monkeypatch.setattr(native_updates.sys, "platform", "darwin")
    assert not native_updates.check()["available"]

def test_untrusted_or_offsite_installer_ignored(monkeypatch):
    monkeypatch.setattr(native_updates.sys, "platform", "darwin")
    for uri in ("https://example.com/evil.dmg", "//example.com/evil.dmg",
                "/downloads/../evil.dmg", "/evil.dmg"):
        monkeypatch.setattr(native_updates, "urlopen",
                            lambda req,timeout,context=None,uri=uri: Response({
                                "macos": {"published": True, "version": "99.0.0", "url": uri}
                            }))
        assert not native_updates.check()["available"]
