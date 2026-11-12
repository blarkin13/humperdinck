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
       "bundled_voices_pack_sha256":"59086a4e9b53eec23f7d33b3acd6a10d1e5a1328ee80eaf93b59218f29038d38"
    }))
    result=module.report(tmp_path,"abcdef0123456789")
    assert result["commercial_release_decision"]=="NOT READY"
    assert result["gates"][0]["status"].startswith("BLOCKED")
