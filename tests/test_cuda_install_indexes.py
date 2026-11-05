"""Regression tests for Windows/Linux CUDA wheel channel selection."""
import pytest

from scripts.install_engine import cuda_indexes


def test_pytorch_215_only_uses_published_cuda_channels():
    assert cuda_indexes("2.15.0") == [
        "https://download.pytorch.org/whl/cu132",
        "https://download.pytorch.org/whl/cu134",
    ]


def test_pytorch_214_keeps_cuda12_fallback_for_older_drivers():
    assert cuda_indexes("2.14.1") == [
        "https://download.pytorch.org/whl/cu132",
        "https://download.pytorch.org/whl/cu130",
        "https://download.pytorch.org/whl/cu126",
    ]


def test_older_installed_pytorch_retains_existing_channels():
    assert "https://download.pytorch.org/whl/cu128" in cuda_indexes("2.11.0")


@pytest.mark.parametrize("value", ["unknown", "1.13.0"])
def test_invalid_or_unsupported_version_rejected(value):
    with pytest.raises(ValueError):
        cuda_indexes(value)
