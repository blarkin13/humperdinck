"""Release inventory gives inspectable evidence, not commercial license approval."""
import importlib.util
from pathlib import Path
import pytest

script=Path(__file__).resolve().parents[1]/"scripts/inventory-release-artifacts.py"
spec=importlib.util.spec_from_file_location("release_inventory",script)
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


def test_inventory_identifies_weights_and_media_and_hashes(tmp_path):
    root=tmp_path/"staged";root.mkdir()
    (root/"kokoro-v1.0.onnx").write_bytes(b"fake-model")
    (root/"COPYING.LGPLv2.1").write_text("license text")
    (root/"README.txt").write_text("plain file")
    report=mod.inventory(root,"abcdef012345")
    assert report["license_approval"].startswith("NOT APPROVED")
    byname={r["path"]:r for r in report["files"]}
    assert byname["kokoro-v1.0.onnx"]["requires_manual_license_review"]
    assert byname["COPYING.LGPLv2.1"]["requires_manual_license_review"]
    assert not byname["README.txt"]["requires_manual_license_review"]
    assert len(byname["kokoro-v1.0.onnx"]["sha256"])==64
    assert report["repository_commit"]=="abcdef012345"


def test_inventory_rejects_symlinks_and_empty_packages(tmp_path):
    root=tmp_path/"staged";root.mkdir()
    with pytest.raises(ValueError):
        mod.inventory(root,"abcdef0")
    (root/"link").symlink_to(tmp_path/"private-file")
    with pytest.raises(ValueError,match="Symlink"):
        mod.inventory(root,"abcdef0")


def test_inventory_is_not_a_license_authorization(tmp_path):
    root=tmp_path/"staged";root.mkdir()
    (root/"a.dll").write_bytes(b"unknown")
    report=mod.inventory(root,"abcdef0123")
    assert report["files"][0]["requires_manual_license_review"]
    assert "independent" in report["license_approval"]
