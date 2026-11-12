"""Public release fails closed without exact voice and runtime rights."""
import importlib.util
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("release_rights",ROOT/"scripts/check-release-rights.py")
gate=importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)


def record():
    return {
        "format":"humperdinck-release-rights-v1",
        "status":"CLEARED",
        "version":"0.2.1",
        "reviewed_commit":"a"*40,
        "reviewer":"Independent Rights Reviewer",
        "reviewed_utc":"2026-11-08T10:00:00Z",
        "bundled_voices_pack_sha256":gate.PACK,
        "sound_sources_archived_and_verified":True,
        "all_frozen_dependencies_and_notices_verified":True,
        "ffmpeg_bundled":False,
        "ffmpeg_exact_build_reviewed":False,
        "voice_permissions":[
            {"sample_sha256":hex(i)[2:].rjust(64,"0"),
             "signed_performer_release_sha256":"b"*64,
             "recording_copyright_grant_sha256":"c"*64,
             "ai_voice_recreation_allowed":True,
             "commercial_redistribution_allowed":True,
             "reference_file_sublicensing_allowed":True}
            for i in range(4)
        ]
    }


def test_blocked_default_manifest_cannot_publish():
    import json
    actual=json.loads((ROOT/"docs/RELEASE_RIGHTS_APPROVAL.json").read_text())
    errors=gate.check(actual,"0.2.1","a"*40)
    assert errors
    assert any("not approved" in issue for issue in errors)
    assert any("provenance" in issue.lower() for issue in errors)


def test_exact_commit_and_every_voice_permission_required():
    r=record()
    assert gate.check(r,"0.2.1","a"*40)==[]
    assert gate.check(r,"0.2.1","b"*40)
    r["voice_permissions"][0]["commercial_redistribution_allowed"]=False
    assert gate.check(r,"0.2.1","a"*40)
    r=record()
    r["ffmpeg_bundled"]=True
    assert gate.check(r,"0.2.1","a"*40)
    r["ffmpeg_exact_build_reviewed"]=True
    assert gate.check(r,"0.2.1","a"*40)==[]


def test_reused_voice_and_malformed_evidence_fail():
    r=record()
    r["voice_permissions"][1]["sample_sha256"]=r["voice_permissions"][0]["sample_sha256"]
    assert any("Duplicate" in issue for issue in gate.check(r,"0.2.1","a"*40))
    r=record()
    r["voice_permissions"][0]["signed_performer_release_sha256"]="not-a-hash"
    assert any("evidence checksum" in issue for issue in gate.check(r,"0.2.1","a"*40))

def owner_record():
    r=record()
    r["format"]="humperdinck-release-rights-v2"
    r.pop("voice_permissions")
    r["voice_provenance"]={
        "source":"owner_recorded_voice_with_qwen",
        "owner_voice_confirmed":True,
        "source_recordings_owned_or_licensed":True,
        "no_unlicensed_third_party_source_audio":True,
        "samples_verified_against_pack":True,
        "qwen_model_terms_reviewed":True,
        "sample_sha256":sorted(gate.OWNER_SAMPLES),
    }
    return r


def test_owner_voice_provenance_uses_no_self_signed_release():
    r=owner_record()
    assert gate.check(r,"0.2.1","a"*40)==[]
    assert "signed_performer_release_sha256" not in str(r)
    r["voice_provenance"]["samples_verified_against_pack"]=False
    assert any("samples_verified_against_pack" in issue for issue in gate.check(r,"0.2.1","a"*40))


def test_owner_provenance_cannot_bypass_sound_or_dependency_reviews():
    for field in ("sound_sources_archived_and_verified","all_frozen_dependencies_and_notices_verified"):
        r=owner_record()
        r[field]=False
        assert gate.check(r,"0.2.1","a"*40)
    r=owner_record()
    r["voice_provenance"]["no_unlicensed_third_party_source_audio"]=False
    assert any("no_unlicensed_third_party_source_audio" in x for x in gate.check(r,"0.2.1","a"*40))


def test_owner_provenance_rejects_unmatched_or_duplicate_samples():
    r=owner_record()
    r["voice_provenance"]["sample_sha256"].pop()
    assert any("four owner-derived" in issue for issue in gate.check(r,"0.2.1","a"*40))
    r=owner_record()
    r["voice_provenance"]["sample_sha256"][1]=r["voice_provenance"]["sample_sha256"][0]
    assert any("Duplicate owner-derived" in issue for issue in gate.check(r,"0.2.1","a"*40))
    r=owner_record()
    r["voice_provenance"]["sample_sha256"][2]="not-hash"
    assert any("Invalid owner-derived" in issue for issue in gate.check(r,"0.2.1","a"*40))


def test_owner_provenance_does_not_lift_release_approval():
    r=owner_record()
    r["status"]="BLOCKED"
    assert any("not approved" in issue for issue in gate.check(r,"0.2.1","a"*40))
    r=owner_record()
    r["reviewed_commit"]="b"*40
    assert any("exact build commit" in issue for issue in gate.check(r,"0.2.1","a"*40))
