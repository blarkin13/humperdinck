import json
from io import BytesIO
from backend import native_updates

class Response:
    def __init__(self, releases):self.file=BytesIO(json.dumps(releases).encode())
    def __enter__(self):return self.file
    def __exit__(self,*args):self.file.close()

def test_desktop_binary_release(monkeypatch):
    monkeypatch.setattr(native_updates,"urlopen",lambda req,timeout:Response([
        {"tag_name":"nature-sounds-v1","assets":[]},
        {"tag_name":"desktop-v0.2.0","assets":[{"name":"Humperdinck.dmg","browser_download_url":"https://github.com/blarkin13/humperdinck/releases/download/desktop-v0.2.0/Humperdinck.dmg"}]}
    ]))
    monkeypatch.setattr(native_updates.sys,"platform","darwin")
    got=native_updates.check()
    assert got["available"] and got["latest"]=="0.2.0"
    assert not got["can_install"] and got["can_download"]

def test_no_binary_release(monkeypatch):
    monkeypatch.setattr(native_updates,"urlopen",lambda req,timeout:Response([
        {"tag_name":"nature-sounds-v1","assets":[]}
    ]))
    assert not native_updates.check()["available"]

def test_untrusted_asset_ignored(monkeypatch):
    monkeypatch.setattr(native_updates.sys,"platform","darwin")
    assert native_updates.installer_asset([{"name":"evil.dmg","browser_download_url":"https://example.com/evil.dmg"}]) is None
