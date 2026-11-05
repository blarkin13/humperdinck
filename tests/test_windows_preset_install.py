"""Windows Kokoro starter install must not require native pyopenjtalk compilation."""
from scripts.install_engine import install_packages_for_platform


def test_windows_avoids_pyopenjtalk_source_build():
    packages=['kokoro-onnx>=0.6,<1','soundfile>=0.12','misaki-fork[ja,zh]']
    installed=install_packages_for_platform('kokoro',packages,'win32')
    assert installed==['kokoro-onnx>=0.6,<1','soundfile>=0.12','misaki-fork[zh]']
    assert not any('[ja' in p for p in installed)


def test_macos_linux_keep_current_japanese_support():
    packages=['kokoro-onnx>=0.6,<1','misaki-fork[ja,zh]']
    for platform in ('darwin','linux'):
        assert install_packages_for_platform('kokoro',packages,platform)==packages


def test_qwen_other_engines_unchanged_on_windows():
    packages=['qwen-tts','soundfile>=0.12']
    assert install_packages_for_platform('qwen-torch',packages,'win32')==packages
