"""Commercial publication must require external exact-build P0 approvals."""
import importlib.util
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("publish_gate",ROOT/"scripts/check-p0-publish-approval.py")
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
COMMIT="a"*40
NOW=datetime(2026,11,9,tzinfo=timezone.utc)


def approval():
    return {
        "schema":"humperdinck-commercial-launch-approval-v1",
        "version":"0.1.30","source_commit":COMMIT,
        "approver":"authorized-owner",
        "expires_utc":(NOW+timedelta(days=7)).isoformat(),
        "gates":{key:{"approved":True,"evidence_ref":"owner-record-001"}
                 for key in mod.REQUIRED},
    }


def validate(doc):
    return mod.validate(doc,version="0.1.30",commit=COMMIT,now=NOW)


def test_no_approval_or_wrong_version_is_blocked():
    assert not validate({})[0]
    d=approval()
    assert not mod.validate(d,version="0.1.31",commit=COMMIT,now=NOW)[0]
    assert not mod.validate(d,version="0.1.30",commit="b"*40,now=NOW)[0]


def test_each_p0_gate_is_mandatory_and_requires_evidence():
    for gate in mod.REQUIRED:
        d=approval()
        del d["gates"][gate]
        assert not validate(d)[0],gate
        d=approval()
        d["gates"][gate]["approved"]=False
        assert not validate(d)[0],gate
        d=approval()
        d["gates"][gate]["evidence_ref"]=""
        assert not validate(d)[0],gate


def test_missing_human_and_expired_or_unbounded_approvals_fail_closed():
    d=approval()
    assert validate(d)[0]
    d["expires_utc"]=(NOW-timedelta(seconds=1)).isoformat()
    assert not validate(d)[0]
    d=approval()
    d["expires_utc"]=(NOW+timedelta(days=400)).isoformat()
    assert not validate(d)[0]
    d=approval()
    d["approver"]=""
    assert not validate(d)[0]


def test_release_workflow_reads_external_approval_secret_not_repo_file():
    data=(ROOT/".github/workflows/publish-desktop.yml").read_text(encoding="utf8")
    assert "secrets.P0_RELEASE_APPROVAL_JSON" in data
    assert "check-p0-publish-approval.py --manifest -" in data
    assert "secrets.RELEASE_RIGHTS_APPROVAL_JSON" in data
    assert "environment: production" in data
    assert "github.event_name == 'workflow_dispatch'" in data
