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
       "bundled_voices_pack_sha256":"6cc0ec3b6e6f85561532514795897036b86d3a601a43403f21c0570a03dc245f"
    }))
    result=module.report(tmp_path,"abcdef0123456789")
    assert result["commercial_release_decision"]=="NOT READY"
    assert result["gates"][0]["status"].startswith("BLOCKED")
