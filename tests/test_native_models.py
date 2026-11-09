"""Native Kokoro downloader must safely reuse shared existing model weights."""
from backend import native_models
import hashlib
from types import SimpleNamespace
import pytest


def test_complete_model_is_reused(tmp_path, monkeypatch):
    monkeypatch.setenv("HF_HOME", str(tmp_path / "hf"))
    monkeypatch.delenv("HUMPERDINCK_MODEL_HOME", raising=False)
    directory = tmp_path / "hf" / "humperdinck" / "presets" / "kokoro"
    directory.mkdir(parents=True)
    assets = {name: b"verified-model-" + name.encode() for name, _ in native_models.FILES}
    monkeypatch.setattr(native_models, "SHA256", {name: hashlib.sha256(content).hexdigest() for name, content in assets.items()})
    monkeypatch.setattr(native_models, "FILES", tuple((name,len(content)) for name,content in assets.items()))
    for name, content in assets.items():
        (directory / name).write_bytes(content)
    monkeypatch.setattr(native_models.urllib.request, "urlopen",
                        lambda *args, **kw: (_ for _ in ()).throw(AssertionError("Unexpected download")))
    assert native_models.download_kokoro() == directory


def test_short_download_removes_partial_files(tmp_path, monkeypatch):
    monkeypatch.setenv("HF_HOME", str(tmp_path / "hf"))
    monkeypatch.delenv("HUMPERDINCK_MODEL_HOME", raising=False)

    class Fake:
        headers = {"Content-Length": "5"}
        count = 0
        def __enter__(self): return self
        def __exit__(self, *args): return False
        def read(self, limit=-1):
            self.count += 1
            return b"hello" if self.count == 1 else b""

    monkeypatch.setattr(native_models.urllib.request, "urlopen", lambda *a, **k: Fake())
    try:
        native_models.download_kokoro()
    except RuntimeError as exc:
        assert "smaller" in str(exc) or "incomplete" in str(exc)
    else:
        raise AssertionError("Incomplete model was accepted")
    folder = tmp_path / "hf" / "humperdinck" / "presets" / "kokoro"
    assert not (folder / "kokoro-v1.0.onnx").exists()
    assert not list(folder.glob("*.partial"))


def test_native_download_uses_verified_ca_bundle(tmp_path, monkeypatch):
    monkeypatch.setenv("HF_HOME", str(tmp_path / "hf"))
    monkeypatch.delenv("HUMPERDINCK_MODEL_HOME", raising=False)
    observed = []
    def pretend_download(*a, **kw):
        observed.append(kw.get("context"))
        raise RuntimeError("Network deliberately disabled in test")
    monkeypatch.setattr(native_models.urllib.request, "urlopen", pretend_download)
    try:
        native_models.download_kokoro()
    except RuntimeError as exc:
        assert str(exc) == "Network deliberately disabled in test"
    else:
        raise AssertionError("Missing mocked download")
    assert observed and observed[0] is not None
    assert observed[0].verify_mode.name == "CERT_REQUIRED"


def test_cached_corrupt_model_is_replaced_only_after_verified_download(tmp_path, monkeypatch):
    monkeypatch.setenv("HF_HOME", str(tmp_path / "hf"))
    monkeypatch.delenv("HUMPERDINCK_MODEL_HOME", raising=False)
    correct = b"authentic-test-model-data"
    name = "kokoro-v1.0.onnx"
    monkeypatch.setattr(native_models, "FILES", ((name,len(correct)),))
    monkeypatch.setattr(native_models, "SHA256", {name: hashlib.sha256(correct).hexdigest()})
    directory = tmp_path / "hf" / "humperdinck" / "presets" / "kokoro"
    directory.mkdir(parents=True)
    target = directory / name
    target.write_bytes(b"X" * len(correct))
    messages = []
    monkeypatch.setattr(native_models, "_sources", lambda asset: iter([("test://asset",{})]))
    monkeypatch.setattr(native_models, "_download", lambda url, headers, partial, progress: partial.write_bytes(correct))
    assert native_models.download_kokoro(progress=messages.append) == directory
    assert target.read_bytes() == correct
    assert any("corrupted" in message for message in messages)
    assert not list(directory.glob("*.partial"))


def test_corrupt_cached_model_survives_failed_redownload(tmp_path, monkeypatch):
    monkeypatch.setenv("HF_HOME", str(tmp_path / "hf"))
    monkeypatch.delenv("HUMPERDINCK_MODEL_HOME", raising=False)
    name = "kokoro-v1.0.onnx"
    monkeypatch.setattr(native_models, "FILES", ((name,8),))
    monkeypatch.setattr(native_models, "SHA256", {name: hashlib.sha256(b"genuine!").hexdigest()})
    directory = tmp_path / "hf" / "humperdinck" / "presets" / "kokoro"
    directory.mkdir(parents=True)
    target = directory / name
    target.write_bytes(b"invalid!")
    monkeypatch.setattr(native_models, "_sources", lambda asset: iter([("test://asset",{})]))
    monkeypatch.setattr(native_models, "_download", lambda url, headers, partial, progress: partial.write_bytes(b"wrongbad"))
    with pytest.raises(RuntimeError, match="SHA-256"):
        native_models.download_kokoro(attempts=1)
    assert target.read_bytes() == b"invalid!"
    assert not list(directory.glob("*.partial"))


def test_low_storage_blocks_model_download_before_network(tmp_path, monkeypatch):
    monkeypatch.setenv("HF_HOME", str(tmp_path / "hf"))
    monkeypatch.delenv("HUMPERDINCK_MODEL_HOME", raising=False)
    monkeypatch.setattr(native_models.shutil, "disk_usage",
                        lambda path: SimpleNamespace(total=100, used=98, free=2))
    monkeypatch.setattr(native_models.urllib.request, "urlopen",
                        lambda *args, **kw: (_ for _ in ()).throw(AssertionError("Network should not be used")))
    with pytest.raises(RuntimeError, match="free disk space"):
        native_models.download_kokoro(attempts=1)


def test_model_download_emits_percentage_and_rejects_oversized_response(tmp_path, monkeypatch):
    class Fake:
        def __init__(self, total, size):
            self.headers = {"Content-Length": str(total)}
            self.remaining = size
        def __enter__(self): return self
        def __exit__(self, *args): return False
        def read(self, size=-1):
            count = min(self.remaining, min(size, 1024 * 1024))
            self.remaining -= count
            return b"x" * count

    messages = []
    monkeypatch.setattr(native_models.urllib.request, "urlopen",
                        lambda *args, **kwargs: Fake(10, 10))
    target = tmp_path / "model.onnx.partial"
    native_models._download("test://download", {}, target, messages.append)
    assert target.read_bytes() == b"x" * 10
    assert any("100%" in m for m in messages)

    # A fake server must not reserve/write more than a reasonable model size.
    monkeypatch.setattr(native_models.urllib.request, "urlopen",
                        lambda *args, **kwargs: Fake(1024 * 1024 * 1024, 10))
    with pytest.raises(RuntimeError, match="exceeds"):
        native_models._download("test://download", {}, tmp_path / "oversize.onnx.partial")


def test_bad_checksum_on_primary_source_recovers_from_good_fallback(tmp_path,monkeypatch):
    monkeypatch.setenv("HF_HOME",str(tmp_path/"hf"))
    monkeypatch.delenv("HUMPERDINCK_MODEL_HOME",raising=False)
    expected=b"correct binary file"
    name="kokoro-v1.0.onnx"
    monkeypatch.setattr(native_models,"FILES",((name,len(expected)),))
    monkeypatch.setattr(native_models,"SHA256",{name:hashlib.sha256(expected).hexdigest()})
    monkeypatch.setattr(native_models,"_sources",lambda n:iter([
        ("mock://primary",{}),("mock://fallback",{})]))
    accessed=[]
    def write_fake(url,headers,partial,progress):
        accessed.append(url)
        partial.write_bytes(b"X"*len(expected) if url.endswith("primary") else expected)
    monkeypatch.setattr(native_models,"_download",write_fake)
    output=native_models.download_kokoro(attempts=1)
    assert (output/name).read_bytes()==expected
    assert accessed==["mock://primary","mock://fallback"]
    assert not list(output.glob("*.partial"))


def test_invalid_checksum_retries_then_preserves_previous_file(tmp_path,monkeypatch):
    monkeypatch.setenv("HF_HOME",str(tmp_path/"hf"))
    monkeypatch.delenv("HUMPERDINCK_MODEL_HOME",raising=False)
    name="kokoro-v1.0.onnx"
    expected=b"genuine!"
    monkeypatch.setattr(native_models,"FILES",((name,len(expected)),))
    monkeypatch.setattr(native_models,"SHA256",{name:hashlib.sha256(expected).hexdigest()})
    directory=tmp_path/"hf"/"humperdinck"/"presets"/"kokoro"
    directory.mkdir(parents=True)
    target=directory/name
    target.write_bytes(b"badbytes")
    monkeypatch.setattr(native_models,"_sources",lambda n:iter([("mock://primary",{})]))
    calls=[]
    def wrong(url,headers,partial,progress):
        calls.append(url)
        partial.write_bytes(b"invalid!")
    monkeypatch.setattr(native_models,"_download",wrong)
    monkeypatch.setattr(native_models.time,"sleep",lambda *a:None)
    with pytest.raises(RuntimeError,match="SHA-256"):
        native_models.download_kokoro(attempts=3)
    assert len(calls)==3
    assert target.read_bytes()==b"badbytes"
    assert not list(directory.glob("*.partial"))


def test_size_cap_admits_real_voices_file(tmp_path, monkeypatch):
    # voices-v1.0.bin upstream is 28,214,398 bytes; a 20 MB cap rejected it.
    from backend import native_models

    class Response:
        headers = {"Content-Length": "28214398"}
        def __init__(self): self.left = 28214398
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def read(self, n):
            n = min(n, self.left); self.left -= n
            return b"\0" * n

    monkeypatch.setattr(native_models.urllib.request, "urlopen", lambda *a, **k: Response())
    partial = tmp_path / "voices-v1.0.bin.x.partial"
    native_models._download("https://example.invalid", {}, partial)
    assert partial.stat().st_size == 28214398


def test_voices_file_has_identical_mirror_after_primary(monkeypatch):
    from backend import native_models
    monkeypatch.setattr(native_models.urllib.request, "urlopen",
                        lambda *a, **k: (_ for _ in ()).throw(OSError("offline")))
    urls = [url for url, _ in native_models._sources("voices-v1.0.bin")]
    assert urls[0] == native_models.SOURCE + "voices-v1.0.bin"
    assert urls[1].endswith("/model-files-v1.0/voices-v1.0.bin")
    assert urls[2].startswith("https://huggingface.co/fastrtc/kokoro-onnx/")
    assert [u for u, _ in native_models._sources("kokoro-v1.0.onnx")] == [native_models.SOURCE + "kokoro-v1.0.onnx"]
