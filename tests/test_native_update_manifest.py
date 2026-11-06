from pathlib import Path
import pytest
from scripts.make_native_update_manifest import manifest,PLATFORMS

def test_manifest_uses_signed_release_assets(tmp_path):
    assets={}
    for target in PLATFORMS:
        file=tmp_path/(target+".bin")
        sig=tmp_path/(target+".sig")
        file.write_bytes(b"0"*1024)
        sig.write_text("TAURI_SIGNER_TEST_SIGNATURE")
        assets[target]=(file,sig)
    result=manifest("0.2.0",assets)
    assert result["version"]=="0.2.0"
    assert set(result["platforms"])==set(PLATFORMS)
    assert result["platforms"]["darwin-aarch64"]["url"].startswith(
        "https://github.com/blarkin13/humperdinck-downloads/releases/download/v0.2.0/"
    )

def test_manifest_rejects_missing_platform(tmp_path):
    with pytest.raises(ValueError,match="Both Windows and macOS"):
        manifest("0.2.0",{})
