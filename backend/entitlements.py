"""Single source of truth for the Free/Pro capability split.

This is the pre-commerce entitlement foundation, NOT an offline license verifier.
A production Pro state will only be added when signed license verification exists.
"""
from __future__ import annotations

import os

from fastapi import HTTPException

CAPABILITIES = {
    "studio.narration": "free",
    "studio.video": "free",
    "studio.sound_effects": "free",
    "studio.models": "free",
    "voice.kokoro": "free",
    "voice.builtin_qwen": "free",
    "voice.basic_edit": "free",
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


def plan() -> str:
    return "pro" if development_pro() else "free"


def permitted(capability: str) -> bool:
    required = CAPABILITIES.get(capability)
    if required is None:
        raise ValueError(f"Unknown entitlement capability: {capability}")
    return required == "free" or development_pro()


def require(capability: str) -> None:
    if not permitted(capability):
        raise HTTPException(status_code=403, detail={
            "code": "PRO_REQUIRED",
            "feature": capability,
            "message": "Humperdinck Pro is required for this voice creation feature.",
        })


def status() -> dict:
    return {
        "plan": plan(),
        "capabilities": {key: permitted(key) for key in CAPABILITIES},
        "development_preview": development_pro(),
        "license_activated": False,
        "checkout_available": False,
    }
