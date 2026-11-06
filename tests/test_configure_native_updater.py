import json
from pathlib import Path

import pytest

from scripts import configure_native_updater


def test_signed_updater_has_pubkey_and_first_party_endpoint(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("HUMPERDINCK_UPDATER_PUBKEY", "A" * 152)
    (tmp_path / "desktop/src-tauri").mkdir(parents=True)
    configure_native_updater.main()
    config = json.loads((tmp_path / "desktop/src-tauri/signing.updater.json").read_text())
    assert config["bundle"]["createUpdaterArtifacts"] is True
    assert config["plugins"]["updater"]["pubkey"] == "A" * 152
    assert config["plugins"]["updater"]["endpoints"] == [
        "https://humperdinck.larki-brian.workers.dev/updates/latest.json"
    ]


def test_signed_updater_refuses_missing_key(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("HUMPERDINCK_UPDATER_PUBKEY", raising=False)
    with pytest.raises(SystemExit, match="key.pub"):
        configure_native_updater.main()
