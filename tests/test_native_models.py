"""Native Kokoro downloader must safely reuse shared existing model weights."""
from backend import native_models


def test_complete_model_is_reused(tmp_path, monkeypatch):
    monkeypatch.setenv("HF_HOME", str(tmp_path / "hf"))
    monkeypatch.delenv("HUMPERDINCK_MODEL_HOME", raising=False)
    directory = tmp_path / "hf" / "humperdinck" / "presets" / "kokoro"
    directory.mkdir(parents=True)
    for name, minimum in native_models.FILES:
        with (directory / name).open("wb") as file:
            file.truncate(minimum)
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
        assert "smaller" in str(exc)
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
