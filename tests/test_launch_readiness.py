"""Launch readiness can never self-certify user/legal gates from a Git commit."""
import importlib.util
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("readiness", ROOT/"scripts/report-launch-readiness.py")
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def test_release_readiness_is_fail_closed():
    report=module.report(ROOT, "abcdef0123456789")
    assert report["commercial_release_decision"]=="NOT READY"
    assert len(report["gates"])>=10
    assert all(item["status"].startswith("BLOCKED") for item in report["gates"])
    assert report["owner_sensitive_data_collected"] is False


def test_fake_approved_rights_cannot_silently_override_human_gates(tmp_path):
    folder=tmp_path/"docs"
    folder.mkdir(parents=True)
    (folder/"RELEASE_RIGHTS_APPROVAL.json").write_text(json.dumps({
       "status":"CLEARED",
       "bundled_voices_pack_sha256":"15542ed7f3f23708ed57e0cb9e1dc99cc1d6c1bb5194d56c22394b2bcb00cd49"
    }))
    result=module.report(tmp_path,"abcdef0123456789")
    assert result["commercial_release_decision"]=="NOT READY"
    assert result["gates"][0]["status"].startswith("BLOCKED")
