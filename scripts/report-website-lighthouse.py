#!/usr/bin/env python3
"""Produce a non-misleading Lighthouse lab score summary from CI artifacts.

Lab results are NOT Google Search Console indexing status or field Core Web Vitals.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from statistics import median


def summarize(directory: Path, viewport: str) -> tuple[str, int]:
    files = sorted(directory.glob("lhr-*.json"))
    reports = []
    for path in files:
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if isinstance(value, dict) and "categories" in value and "audits" in value:
            reports.append(value)
    lines = [
        f"### Humperdinck Lighthouse — {viewport}",
        "",
        "Measured on the deployed site with Chrome lab throttling. Scores fluctuate; "
        "LCP/CLS here are lab values, not real-user 75th percentiles, and TBT is not INP.",
        "",
        "| Page | Runs | Performance | Accessibility | SEO | LCP (ms) | CLS | TBT (ms) |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    if not reports:
        lines.append("| No valid Lighthouse measurements produced | 0 | — | — | — | — | — | — |")
        return "\n".join(lines) + "\n", 1

    grouped: dict[str, list[dict]] = {}
    for value in reports:
        grouped.setdefault(value.get("finalUrl") or value.get("requestedUrl") or "unknown", []).append(value)

    def metric(items: list[dict], key: str) -> str:
        nums = [v.get("audits", {}).get(key, {}).get("numericValue") for v in items]
        nums = [n for n in nums if isinstance(n, (int, float))]
        if not nums:
            return "—"
        n = median(nums)
        return f"{n:.3f}" if key == "cumulative-layout-shift" else f"{n:.0f}"

    def score(items: list[dict], category: str) -> str:
        nums = [v.get("categories", {}).get(category, {}).get("score") for v in items]
        nums = [n for n in nums if isinstance(n, (int, float))]
        return f"{median(nums) * 100:.0f}" if nums else "—"

    for url, items in sorted(grouped.items()):
        lines.append(
            f"| {url} | {len(items)} | {score(items, 'performance')} | "
            f"{score(items, 'accessibility')} | {score(items, 'seo')} | "
            f"{metric(items, 'largest-contentful-paint')} | "
            f"{metric(items, 'cumulative-layout-shift')} | "
            f"{metric(items, 'total-blocking-time')} |"
        )
    return "\n".join(lines) + "\n", 0


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--directory", type=Path, required=True)
    p.add_argument("--viewport", choices=["mobile", "desktop"], required=True)
    a = p.parse_args()
    summary, status = summarize(a.directory, a.viewport)
    print(summary)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with Path(os.environ["GITHUB_STEP_SUMMARY"]).open("a", encoding="utf-8") as f:
            f.write(summary)
    return status


if __name__ == "__main__":
    raise SystemExit(main())
