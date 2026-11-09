"""Dependency evidence must preserve unknown licenses instead of guessing clearance."""
import importlib.util
from pathlib import Path
import pytest

SRC=Path(__file__).resolve().parents[1]/"scripts/collect-dependency-rights.py"
spec=importlib.util.spec_from_file_location("collect_dependency_rights",SRC)
tool=importlib.util.module_from_spec(spec)
spec.loader.exec_module(tool)


def test_npm_lock_identifies_unknown_license_without_fabricating_permission():
    sample={"lockfileVersion":3,"packages":{
        "":{"name":"humperdinck"},
        "node_modules/a":{"version":"1.0.0","resolved":"https://registry.npmjs.org/a/-/a-1.0.0.tgz",
                          "integrity":"sha512-abc"},
        "node_modules/b":{"version":"2.0.0","license":"MIT","dev":True}
    }}
    found=tool.npm_inventory(sample)
    assert len(found)==2
    assert found[0]["license_metadata_missing"] is True
    assert found[0]["license"] is None
    assert found[1]["license"]=="MIT"
    assert found[1]["dev"] is True


def test_reject_incomplete_lockfile():
    with pytest.raises(ValueError):
        tool.npm_inventory({"dependencies":{"a":{}}})
