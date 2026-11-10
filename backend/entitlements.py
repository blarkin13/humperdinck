"""Single source of truth for the Free/Pro capability split.

This is the pre-commerce entitlement foundation, NOT an offline license verifier.
A production Pro state will only be added when signed license verification exists.
"""
from __future__ import annotations

import os
from pathlib import Path
from backend import pro_license

from fastapi import HTTPException

CAPABILITIES = {
    "studio.narration": "free",
    "studio.video": "free",
    "studio.sound_effects": "free",
    "studio.models": "free",
    "voice.kokoro": "free",
    "voice.builtin_qwen": "free",
    "voice.basic_edit": "free",
    "voice.mic_cloning": "free",
    "audio.export": "free",
    "voice.custom_qwen_design": "pro",
    "voice.personal_cloning": "pro",
    "voice.custom_qwen_save": "pro",
    "voice.gallery_download": "pro",
}


def development_pro() -> bool:
    """Source/development test only; impossible in packaged desktop releases.

    NOT a purchase, not a secure commercial license, and never shown as one.
    Local Python source can always be modified; production requires signed
    entitlement verification and a signed curated-voice allowlist.
    """
    return (
        os.environ.get("HUMPERDINCK_ENABLE_DEV_ENTITLEMENTS") == "1"
        and os.environ.get("HUMPERDINCK_DEV_PRO") == "1"
        and os.environ.get("HUMPERDINCK_NATIVE_PACKAGE") != "1"
    )


def _signed_status() -> dict:
    folder = Path(os.environ.get('HUMPERDINCK_DATA', Path(__file__).resolve().parent.parent / 'data'))
    return pro_license.status(folder)


def plan() -> str:
    return "pro" if development_pro() or _signed_status()['active'] else "free"


def permitted(capability: str) -> bool:
    required = CAPABILITIES.get(capability)
    if required is None:
        raise ValueError(f"Unknown entitlement capability: {capability}")
    return required == "free" or plan() == "pro"


def require(capability: str) -> None:
    if not permitted(capability):
        raise HTTPException(status_code=403, detail={
            "code": "PRO_REQUIRED",
            "feature": capability,
            "message": "Humperdinck Pro is required for this voice creation feature.",
        })


def status() -> dict:
    signed = _signed_status()
    preview = development_pro()
    pro = preview or signed['active']
    return {
        "plan": 'pro' if pro else 'free',
        "capabilities": {key: (required == 'free' or pro) for key, required in CAPABILITIES.items()},
        "development_preview": preview,
        "license_activated": bool(signed['active']),
        "license_source": ('signed-beta-temporary' if signed.get('beta') else 'signed-offline') if signed['active'] else ('development-preview' if preview else None),
        "perpetual": bool(signed['active'] and not signed.get('beta')),
        "beta": bool(signed.get('beta')),
        "expires_at": signed.get('expires_at') if signed.get('beta') else None,
        "checkout_available": False,
    }
