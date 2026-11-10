#!/usr/bin/env python3
"""Check public Humperdinck search pages without third-party dependencies."""
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
import json
import re
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1] / "website"
DOMAIN = "https://humperdinck.studio"
LANDING = [
    "", "gallery", "help", "ai-voice-generator", "text-to-speech",
    "voice-cloning", "offline-ai-voice", "ai-narration", "video-voiceover", "help/install", "help/requirements",
]

class HeadParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_head = False
        self.tags = []
        self.titles = []
        self.in_title = False
        self.heading_open = False
        self.heading_count = 0
        self.errors = []
        self.schemas = []
        self.in_schema = False
        self.schema_text = ""
        self.html_lang = None
        self.main_count = 0
        self.ids = []
        self.fragments = []
        self.missing_image_alt = 0

    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        if tag == "html":
            self.html_lang = d.get("lang")
        if tag == "main":
            self.main_count += 1
        if d.get("id"):
            self.ids.append(d["id"])
        if tag == "a" and (d.get("href") or "").startswith("#"):
            self.fragments.append(d["href"][1:])
        if tag == "img" and "alt" not in d:
            self.missing_image_alt += 1
        if tag == "head":
            self.in_head = True
        if tag == "title" and self.in_head:
            self.in_title = True
        if tag == "h1":
            self.heading_count += 1
            if self.heading_open:
                self.errors.append("nested h1")
            self.heading_open = True
        if self.in_head:
            self.tags.append((tag, d))
        if tag == "script" and d.get("type") == "application/ld+json":
            self.in_schema = True
            self.schema_text = ""

    def handle_endtag(self, tag):
        if tag == "head":
            self.in_head = False
        if tag == "title":
            self.in_title = False
        if tag == "h1":
            if not self.heading_open:
                self.errors.append("unmatched closing h1")
            self.heading_open = False
        if tag == "script" and self.in_schema:
            try:
                self.schemas.append(json.loads(self.schema_text))
            except json.JSONDecodeError as exc:
                self.errors.append(f"invalid JSON-LD: {exc}")
            self.in_schema = False

    def handle_data(self, data):
        if self.in_title:
            self.titles.append(data)
        if self.in_schema:
            self.schema_text += data

def check_page(slug):
    path = ROOT / slug / "index.html" if slug else ROOT / "index.html"
    url = DOMAIN + "/" + (slug + "/" if slug else "")
    issues = []
    if not path.is_file():
        return [f"{url}: index.html missing"]
    parser = HeadParser()
    parser.feed(path.read_text(encoding="utf-8"))
    parser.close()
    tags = parser.tags
    def links(rel):
        return [attrs.get("href") for name, attrs in tags if name == "link" and attrs.get("rel") == rel]
    def metas(key, value):
        return [attrs.get("content") for name, attrs in tags if name == "meta" and attrs.get(key) == value]
    if len(links("canonical")) != 1 or links("canonical")[0] != url:
        issues.append("missing or incorrect canonical")
    # Static checks cannot replace real keyboard and mobile accessibility QA.
    if not parser.html_lang:
        issues.append("html lang attribute missing")
    if not metas("name", "viewport"):
        issues.append("viewport metadata missing")
    if parser.main_count != 1:
        issues.append("expected exactly one main landmark")
    if "main" not in parser.fragments or "main" not in parser.ids:
        issues.append("skip-to-main link or its destination missing")
    if parser.missing_image_alt:
        issues.append(f"{parser.missing_image_alt} image(s) missing alt attributes")
    repeated_ids = [key for key, count in Counter(parser.ids).items() if count > 1]
    if repeated_ids:
        issues.append(f"duplicate HTML id(s): {', '.join(repeated_ids[:8])}")
    missing_fragments = sorted(set(parser.fragments) - set(parser.ids) - {""})
    if missing_fragments:
        issues.append(f"broken same-page anchor(s): {', '.join(missing_fragments[:8])}")
    if not "".join(parser.titles).strip():
        issues.append("missing title")
    if not metas("name", "description"):
        issues.append("missing meta description")
    if metas("name", "robots") and "noindex" in ",".join(metas("name", "robots")).lower():
        issues.append("marketing page unexpectedly noindex")
    if metas("property", "og:url") != [url]:
        issues.append("missing or incorrect og:url")
    if not metas("property", "og:image"):
        issues.append("missing Open Graph image")
    if not metas("name", "twitter:card"):
        issues.append("missing Twitter card")
    if not parser.schemas:
        issues.append("missing structured data")
    if not slug:
        # Only the publicly downloadable Free edition is available now.
        # A planned paid upgrade must not be marked up as a live offer.
        schema_nodes = []
        for schema in parser.schemas:
            if isinstance(schema, list):
                schema_nodes.extend(node for node in schema if isinstance(node, dict))
            elif isinstance(schema, dict):
                schema_nodes.append(schema)
        apps = [node for node in schema_nodes if node.get("@type") == "SoftwareApplication"]
        if len(apps) != 1:
            issues.append("homepage needs exactly one SoftwareApplication schema")
        else:
            app = apps[0]
            offer = app.get("offers")
            if not isinstance(offer, dict) or offer.get("@type") != "Offer":
                issues.append("missing Free desktop Offer in SoftwareApplication")
            elif (offer.get("price") != 0
                  or offer.get("priceCurrency") != "USD"
                  or offer.get("url") != DOMAIN + "/#download"):
                issues.append("Free edition offer must be USD 0 with correct download URL")
            if "review" in app or "aggregateRating" in app:
                issues.append("do not publish unverified software reviews or ratings")
    if not slug:
        # The pricing cards must reflect the owner's actual Free/Pro decisions.
        # Keep checks narrow: marketing copy and layout remain editorial decisions.
        from html import unescape
        homepage = path.read_text(encoding="utf-8")
        section_match = re.search(
            r'<section class="section plan-section".*?</section>',
            homepage, flags=re.DOTALL,
        )
        if not section_match:
            issues.append("missing Free/Pro comparison section")
        else:
            section = unescape(re.sub(r"<[^>]+>", " ", section_match.group(0)))
            section = " ".join(section.split()).lower()
            free_match = re.search(r"humperdinck free(.*?)humperdinck pro", section)
            pro_match = re.search(r"humperdinck pro(.*)", section)
            free, pro = (free_match.group(1) if free_match else ""), (pro_match.group(1) if pro_match else "")
            for phrase in ("clone your own voice", "characters", "export"):
                if phrase not in free:
                    issues.append(f"Free pricing card missing confirmed feature: {phrase}")
            if "$0" not in free:
                issues.append("Free pricing card missing $0")
            if "$49" not in pro or "coming soon" not in section:
                issues.append("Pro card must show planned $49 and coming-soon status")
            if "export finished audio" in pro:
                issues.append("ordinary audio exports must not be presented as Pro-only")
            for forbidden in ("qwen", "kokoro", "microphone recording"):
                if forbidden in section:
                    issues.append(f"avoid technical or inaccurate wording in pricing section: {forbidden}")
    if parser.heading_count != 1:
        issues.append("expected exactly one h1")
    if parser.heading_open:
        issues.append("unclosed h1")
    issues.extend(parser.errors)
    return [f"{path.relative_to(ROOT)}: {issue}" for issue in issues]

def main():
    errors = []
    for slug in LANDING:
        errors.extend(check_page(slug))
    sitemap = ROOT / "sitemap.xml"
    try:
        urls = [
            el.text for el in ET.parse(sitemap).iter()
            if el.tag.endswith("}loc") or el.tag == "loc"
        ]
        for slug in LANDING:
            url = DOMAIN + "/" + (slug + "/" if slug else "")
            if urls.count(url) != 1:
                errors.append(f"sitemap: expected exactly one {url}")
        if len(urls) != len(set(urls)):
            errors.append("sitemap: duplicate URL")
    except (ET.ParseError, OSError) as exc:
        errors.append(f"invalid sitemap: {exc}")
    robots = (ROOT / "robots.txt").read_text(encoding="utf-8")
    if f"Sitemap: {DOMAIN}/sitemap.xml" not in robots:
        errors.append("robots.txt: sitemap declaration missing")
    if errors:
        print("SEO validation failed:")
        for error in errors:
            print(" -", error)
        return 1
    print(f"SEO validation passed: {len(LANDING)} marketing pages, sitemap and robots.txt")
    return 0

if __name__ == "__main__":
    sys.exit(main())
