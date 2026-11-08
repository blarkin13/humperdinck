"""OpenVoice V2 tone-color converter: re-voice a recording into another voice.

Used for character voices. The performance (accent, delivery) comes from a
source clip; the converter swaps its timbre for the target voice's.
Runs inside the openvoice engine's own environment (see catalog.ENGINES).
OpenVoice is MIT-licensed: https://github.com/myshell-ai/OpenVoice
"""
import sys
import types
from pathlib import Path

REPO = 'myshell-ai/OpenVoiceV2'


def _stub_unused_modules():
    # The converter never touches OpenVoice's text frontend or watermarking, whose
    # dependencies (inflect, jieba, wavmark...) are deliberately not installed.
    if 'openvoice.text' not in sys.modules:
        text = types.ModuleType('openvoice.text')
        text.text_to_sequence = None
        sys.modules['openvoice.text'] = text
    if 'wavmark' not in sys.modules:
        wavmark = types.ModuleType('wavmark')
        wavmark.load_model = lambda: types.SimpleNamespace(to=lambda device: None)
        sys.modules['wavmark'] = wavmark


class VoiceConverter:
    def __init__(self, model_id=REPO):
        self.model_id = model_id or REPO
        self.converter = None
        self.device = None

    def load(self):
        if self.converter is None:
            import torch
            from huggingface_hub import hf_hub_download
            _stub_unused_modules()
            from openvoice.api import ToneColorConverter
            config = hf_hub_download(self.model_id, 'converter/config.json')
            checkpoint = hf_hub_download(self.model_id, 'converter/checkpoint.pth')
            cuda = torch.cuda.is_available()
            converter = ToneColorConverter(config, device='cuda:0' if cuda else 'cpu')
            converter.watermark_model = None
            converter.load_ckpt(checkpoint)
            self.converter = converter
            self.device = {'kind': 'gpu', 'name': torch.cuda.get_device_name(0)} if cuda else {'kind': 'cpu', 'name': 'CPU'}
        return self.converter

    def convert(self, source: Path, targets: list, output: Path, on_progress=None, strength: float = 0.3):
        converter = self.load()
        target = converter.extract_se([str(t) for t in targets])
        if on_progress:
            on_progress(1, 2)
        origin = converter.extract_se([str(source)])
        converter.convert(audio_src_path=str(source), src_se=origin, tgt_se=target,
                          output_path=str(output), tau=strength)
        if on_progress:
            on_progress(2, 2)
