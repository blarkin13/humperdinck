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

def test_public_binary_release_when_source_private(monkeypatch):
    monkeypatch.setattr(native_updates.sys, "platform", "win32")
    url = ("https://github.com/blarkin13/humperdinck-downloads/releases/download/"
           "v0.2.0/humperdinck-windows-x64-0.2.0.exe")
    monkeypatch.setattr(native_updates, "urlopen",
                        lambda req, timeout, context=None: Response({
                            "windows": {"published": True, "version": "0.2.0", "url": url}
                        }))
    got = native_updates.check()
    assert got["available"]
    assert got["download_url"] == url


def test_reject_untrusted_binary_release_url(monkeypatch):
    monkeypatch.setattr(native_updates.sys, "platform", "win32")
    for url in (
        "https://github.com/evil/humperdinck-downloads/releases/download/v0.2.0/humperdinck-windows-x64-0.2.0.exe",
        "https://github.com/blarkin13/humperdinck-downloads/releases/download/v0.2.0/evil.exe",
        "https://github.com/blarkin13/humperdinck-downloads/releases/download/v0.3.0/humperdinck-windows-x64-0.3.0.exe",
    ):
        monkeypatch.setattr(native_updates, "urlopen",
                            lambda req, timeout, context=None, url=url: Response({
                                "windows": {"published": True, "version": "0.2.0", "url": url}
                            }))
        assert not native_updates.check()["available"]
