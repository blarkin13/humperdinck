import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location("classify_release", Path(__file__).resolve().parents[1] / "scripts" / "classify_release.py")
mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)


def make(tmp, payments, voices):
    (tmp / "src").mkdir(parents=True); (tmp / "backend").mkdir()
    (tmp / "src" / "live-commerce-release-gate.js").write_text(f"export const LIVE_COMMERCE_CODE_APPROVED={payments};\n")
    (tmp / "backend" / "voice_packs.py").write_text(f'"""doc"""\nENABLED = True\nBUNDLED = {voices}\n')
    return tmp


def test_free_only_when_payments_and_voices_are_off(tmp_path):
    assert mod.classify(make(tmp_path / "a", "false", "False")) == "free"
    assert mod.classify(make(tmp_path / "b", "true", "False")) == "commercial"
    assert mod.classify(make(tmp_path / "c", "false", "True")) == "commercial"


def test_current_repository_is_commercial_with_pro_payments_enabled():
    # Live Stripe routes were intentionally enabled in code. Commercial
    # release-rights and P0 approval gates remain independently required.
    assert mod.classify() == "commercial"
