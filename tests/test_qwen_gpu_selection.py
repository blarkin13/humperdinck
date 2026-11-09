"""Verify Qwen PyTorch backend makes explicit CUDA/CPU selection.

These are mocked API compatibility tests, not NVIDIA benchmark claims.
"""
from types import ModuleType, SimpleNamespace
import sys

import pytest

from backend import qwen_torch_engine


@pytest.mark.parametrize("cuda_present,bf16_supported", [(False,False), (True,False), (True,True)])
def test_qwen_selects_cuda_when_available_and_cpu_otherwise(monkeypatch, cuda_present, bf16_supported):
    calls=[]
    torch=ModuleType("torch")
    torch.bfloat16="bf16"
    torch.float16="fp16"
    torch.float32="float32"
    torch.version=SimpleNamespace(cuda="12.8" if cuda_present else None)
    torch.cuda=SimpleNamespace(
        is_available=lambda:cuda_present,
        is_bf16_supported=lambda:bf16_supported,
        get_device_name=lambda index:"Mock NVIDIA GPU")
    qwen=ModuleType("qwen_tts")
    class FakeModel:
        @staticmethod
        def from_pretrained(path, **kwargs):
            calls.append((path,kwargs))
            return object()
    qwen.Qwen3TTSModel=FakeModel
    monkeypatch.setitem(sys.modules,"torch",torch)
    monkeypatch.setitem(sys.modules,"qwen_tts",qwen)
    monkeypatch.setattr(qwen_torch_engine,"local_path",lambda model:"/already-cached/model")
    engine=qwen_torch_engine.QwenTorchEngine("Qwen/Qwen3-TTS-12Hz-1.7B-Base")
    engine.load()
    engine.load()
    assert len(calls)==1  # repeated sections reuse the warm model
    path,config=calls[0]
    assert path=="/already-cached/model"
    assert config["device_map"]==("cuda:0" if cuda_present else "cpu")
    assert config["dtype"]==("bf16" if bf16_supported else "fp16" if cuda_present else "float32")
    assert engine.device["kind"]==("gpu" if cuda_present else "cpu")
    if cuda_present:
        assert "NVIDIA" in engine.device["name"]
        assert engine.device["precision"]==("bf16" if bf16_supported else "fp16")
    else:
        assert engine.device["reason"]
